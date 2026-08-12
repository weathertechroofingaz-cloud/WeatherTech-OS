import {
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  isAbsolute,
  relative,
  resolve,
} from "node:path";

export const BROWSER_REGRESSION_ENV_FILE =
  "WTOS_BROWSER_REGRESSION_ENV_FILE";
export const BROWSER_REGRESSION_TEST_USER_EMAIL =
  "WTOS_BROWSER_REGRESSION_TEST_USER_EMAIL";
export const BROWSER_REGRESSION_TEST_USER_PASSWORD =
  "WTOS_BROWSER_REGRESSION_TEST_USER_PASSWORD";

export const DEFAULT_BROWSER_REGRESSION_GROUPS = Object.freeze([
  "dashboard",
  "operations",
  "field-operations",
  "crm",
  "communications",
  "sales-pipeline",
  "lead-intake-workspace",
  "lead-intake",
  "marketing",
  "themes",
  "layout",
  "settings",
  "production-readiness",
  "documents",
  "customer-portal",
  "financial",
  "analytics",
  "ai-tools",
  "calendar",
  "dispatch",
  "inspections",
  "jobs-workspace",
  "job-builder",
  "job-production",
]);

const TARGETED_BROWSER_REGRESSION_GROUPS = Object.freeze([
  "crm-leads",
  "crm-estimates",
  "crm-customers",
  "crm-inbox",
]);

const KNOWN_BROWSER_REGRESSION_GROUPS = new Set([
  ...DEFAULT_BROWSER_REGRESSION_GROUPS,
  ...TARGETED_BROWSER_REGRESSION_GROUPS,
]);

const PROCESS_ENVIRONMENT_KEYS = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK",
  "SUPABASE_SERVICE_ROLE_KEY",
  "YELP_LEAD_CAPTURE_SECRET",
  BROWSER_REGRESSION_TEST_USER_EMAIL,
  BROWSER_REGRESSION_TEST_USER_PASSWORD,
]);

function parseEnvironmentValue(value) {
  const trimmed = value.trim();

  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function parseRegressionEnvironment(text) {
  const environment = {};

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const declaration = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = declaration.indexOf("=");

    if (separatorIndex <= 0) {
      throw new Error(
        "Browser regression environment file contains a malformed declaration.",
      );
    }

    const key = declaration.slice(0, separatorIndex).trim();

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new Error(
        "Browser regression environment file contains an invalid variable name.",
      );
    }

    environment[key] = parseEnvironmentValue(
      declaration.slice(separatorIndex + 1),
    );
  }

  return environment;
}

function selectProcessEnvironment(runtimeEnv) {
  return Object.fromEntries(
    PROCESS_ENVIRONMENT_KEYS
      .filter((key) => typeof runtimeEnv[key] === "string")
      .map((key) => [key, runtimeEnv[key]]),
  );
}

function hasAnyTargetCredential(environment) {
  return Boolean(
    environment.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      environment.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

function assertCompleteTargetCredentialPair(environment, sourceLabel) {
  const hasUrl = Boolean(environment.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasServiceRole = Boolean(environment.SUPABASE_SERVICE_ROLE_KEY?.trim());

  if (hasUrl !== hasServiceRole) {
    throw new Error(
      `${sourceLabel} must supply both NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`,
    );
  }
}

function assertHostedLiveDataMode(environment, sourceLabel, remoteWritesEnabled) {
  if (
    remoteWritesEnabled &&
    environment.NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK !== "true"
  ) {
    throw new Error(
      `${sourceLabel} must set NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true so live data failures cannot silently pass with demo records.`,
    );
  }
}

function isPathInside(parentPath, childPath) {
  const relativePath = relative(parentPath, childPath);

  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function readSecureExternalEnvironmentFile(filePath, cwd) {
  if (!isAbsolute(filePath)) {
    throw new Error(
      `${BROWSER_REGRESSION_ENV_FILE} must be an absolute path outside the repository.`,
    );
  }

  const resolvedCwd = realpathSync(resolve(cwd));
  const resolvedFilePath = realpathSync(filePath);

  if (isPathInside(resolvedCwd, resolvedFilePath)) {
    throw new Error(
      `${BROWSER_REGRESSION_ENV_FILE} must point outside the repository.`,
    );
  }

  const fileStat = statSync(resolvedFilePath);

  if (!fileStat.isFile()) {
    throw new Error(
      `${BROWSER_REGRESSION_ENV_FILE} must point to a regular file.`,
    );
  }

  if ((fileStat.mode & 0o077) !== 0) {
    throw new Error(
      `${BROWSER_REGRESSION_ENV_FILE} must not be readable or writable by group or other users.`,
    );
  }

  return parseRegressionEnvironment(readFileSync(resolvedFilePath, "utf8"));
}

export function loadBrowserRegressionEnvironment({
  cwd,
  runtimeEnv = {},
  remoteWritesEnabled = false,
} = {}) {
  if (!cwd) {
    throw new Error("Browser regression requires an explicit checkout path.");
  }

  const externalFilePath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();
  const processEnvironment = selectProcessEnvironment(runtimeEnv);

  if (externalFilePath && hasAnyTargetCredential(processEnvironment)) {
    throw new Error(
      `Use either ${BROWSER_REGRESSION_ENV_FILE} or process environment target credentials, not both.`,
    );
  }

  if (externalFilePath) {
    const environment = readSecureExternalEnvironmentFile(externalFilePath, cwd);
    assertCompleteTargetCredentialPair(
      environment,
      "The external browser regression environment file",
    );
    assertHostedLiveDataMode(
      environment,
      "The external browser regression environment file",
      remoteWritesEnabled,
    );

    return {
      environment,
      source: "external_file",
    };
  }

  if (hasAnyTargetCredential(processEnvironment)) {
    assertCompleteTargetCredentialPair(
      processEnvironment,
      "The browser regression process environment",
    );
    assertHostedLiveDataMode(
      processEnvironment,
      "The browser regression process environment",
      remoteWritesEnabled,
    );

    return {
      environment: processEnvironment,
      source: "process_environment",
    };
  }

  if (remoteWritesEnabled) {
    throw new Error(
      `Authorized hosted browser regression requires target credentials in the process environment or ${BROWSER_REGRESSION_ENV_FILE}; refusing to read .env.local.`,
    );
  }

  const environment = parseRegressionEnvironment(
    readFileSync(resolve(cwd, ".env.local"), "utf8"),
  );
  assertCompleteTargetCredentialPair(environment, ".env.local");

  return {
    environment,
    source: "repo_local_env",
  };
}

export function resolveBrowserRegressionGroups({
  groups,
  fullRun = groups == null,
} = {}) {
  const resolvedGroups = groups == null
    ? [...DEFAULT_BROWSER_REGRESSION_GROUPS]
    : groups;

  if (!Array.isArray(resolvedGroups) || resolvedGroups.length === 0) {
    throw new Error("Browser regression requires at least one test group.");
  }

  if (resolvedGroups.some((group) => typeof group !== "string" || !group.trim())) {
    throw new Error("Browser regression group names must be non-empty strings.");
  }

  const normalizedGroups = resolvedGroups.map((group) => group.trim());
  const duplicateGroups = normalizedGroups.filter(
    (group, index) => normalizedGroups.indexOf(group) !== index,
  );

  if (duplicateGroups.length > 0) {
    throw new Error(
      `Browser regression groups contain duplicates: ${[...new Set(duplicateGroups)].join(", ")}.`,
    );
  }

  const unknownGroups = normalizedGroups.filter(
    (group) => !KNOWN_BROWSER_REGRESSION_GROUPS.has(group),
  );

  if (unknownGroups.length > 0) {
    throw new Error(
      `Unknown browser regression group(s): ${unknownGroups.join(", ")}.`,
    );
  }

  if (fullRun) {
    const selectedGroups = new Set(normalizedGroups);
    const missingDefaults = DEFAULT_BROWSER_REGRESSION_GROUPS.filter(
      (group) => !selectedGroups.has(group),
    );
    const nonDefaultGroups = normalizedGroups.filter(
      (group) => !DEFAULT_BROWSER_REGRESSION_GROUPS.includes(group),
    );

    if (missingDefaults.length > 0 || nonDefaultGroups.length > 0) {
      throw new Error(
        `A full browser regression run must include every default group exactly once. Missing: ${missingDefaults.join(", ") || "none"}. Non-default: ${nonDefaultGroups.join(", ") || "none"}.`,
      );
    }
  }

  return {
    groups: normalizedGroups,
    fullRun,
  };
}

export function getBrowserRegressionAuthCredentials(environment = {}) {
  const email = environment[BROWSER_REGRESSION_TEST_USER_EMAIL]?.trim() ?? "";
  const password = environment[BROWSER_REGRESSION_TEST_USER_PASSWORD] ?? "";

  if (Boolean(email) !== Boolean(password)) {
    throw new Error(
      `Browser regression authentication requires both ${BROWSER_REGRESSION_TEST_USER_EMAIL} and ${BROWSER_REGRESSION_TEST_USER_PASSWORD}.`,
    );
  }

  if (!email) {
    return null;
  }

  if (!email.includes("@")) {
    throw new Error(
      `${BROWSER_REGRESSION_TEST_USER_EMAIL} must be a valid email address.`,
    );
  }

  return { email, password };
}
