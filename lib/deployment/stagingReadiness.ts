export type DeploymentCheckStatus =
  | "pass"
  | "blocked"
  | "warning"
  | "unknown";

export type DeploymentCheck = {
  id: string;
  label: string;
  status: DeploymentCheckStatus;
  summary: string;
  evidence: string[];
  nextAction: string;
};

export type DeploymentEnvironmentMetadata = {
  environmentName: string;
  deploymentProvider: string;
  deploymentUrl: string;
  deploymentUrlStatus: DeploymentCheckStatus;
  deploymentTimestamp: string;
  gitCommitHash: string;
  productionActivationStatus: "not_granted" | "enabled_requires_owner_review";
  liveProviderWritesStatus: "disabled" | "enabled_requires_owner_review";
  healthEndpoint: string;
  readinessEndpoint: string;
};

export type DeploymentHealthReport = {
  service: "WeatherTech OS";
  status: "healthy";
  checkedAt: string;
  metadata: DeploymentEnvironmentMetadata;
  checks: DeploymentCheck[];
};

export type DeploymentReadinessReport = {
  service: "WeatherTech OS";
  status: "ready" | "blocked" | "warning";
  checkedAt: string;
  metadata: DeploymentEnvironmentMetadata;
  checks: DeploymentCheck[];
  blockers: string[];
  warnings: string[];
  ownerActions: string[];
};

type EnvRecord = Record<string, string | undefined>;

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    cache?: "no-store";
  },
) => Promise<{ status: number; ok: boolean; statusText?: string }>;

const REQUIRED_STAGING_ENVIRONMENT = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_APP_URL",
  "WTOS_DEPLOYMENT_ENV",
];

const VERIFIED_STAGING_GATES = [
  "WTOS_AUTH_REDIRECTS_VERIFIED",
  "WTOS_SUPABASE_MIGRATIONS_VERIFIED",
  "WTOS_STAGING_REGRESSION_VERIFIED",
] as const;

const REQUIRED_AUTH_REDIRECT_PATHS = [
  "/",
  "/auth/callback",
  "/api/integrations/google-workspace/oauth/callback",
  "/api/integrations/quickbooks-online/oauth/callback",
  "/api/integrations/docusign/oauth/callback",
  "/api/integrations/dropbox-sign/oauth/callback",
];

export const STAGING_PROVIDER_SAFETY_FLAGS = [
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_INBOUND_SMS_ENABLED",
  "GOOGLE_GMAIL_SEND_ENABLED",
  "GOOGLE_CALENDAR_WRITE_ENABLED",
  "WEBSITE_INTAKE_ENABLED",
  "WEATHERTECH_WEBSITE_INTAKE_ENABLED",
  "WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED",
  "IHC_WEBSITE_INTAKE_ENABLED",
  "YELP_LIVE_SYNC_ENABLED",
  "YELP_OUTBOUND_MESSAGING_ENABLED",
  "YELP_LIVE_SYNC_ENABLED_WEATHERTECH_PHOENIX",
  "YELP_LIVE_SYNC_ENABLED_WEATHERTECH_TUCSON",
  "YELP_LIVE_SYNC_ENABLED_IHC",
  "YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_PHOENIX",
  "YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_TUCSON",
  "YELP_OUTBOUND_MESSAGING_ENABLED_IHC",
  "GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED",
  "GOOGLE_BUSINESS_PROFILE_REVIEW_REPLY_ENABLED",
  "QUICKBOOKS_SYNC_ENABLED",
  "QUICKBOOKS_ACCOUNTING_WRITES_ENABLED",
  "QUICKBOOKS_PAYMENT_PROCESSING_ENABLED",
  "DOCUSIGN_SIGNATURE_REQUESTS_ENABLED",
  "DOCUSIGN_PROVIDER_WRITES_ENABLED",
  "DROPBOX_SIGN_SIGNATURE_REQUESTS_ENABLED",
  "DROPBOX_SIGN_PROVIDER_WRITES_ENABLED",
  "WTOS_CUSTOMER_PORTAL_ENABLED",
  "WTOS_AUTOMATED_CUSTOMER_NOTIFICATIONS_ENABLED",
  "WTOS_PUBLIC_REGISTRATION_ENABLED",
  "WTOS_PRODUCTION_APPROVED",
] as const;

const SECRET_NAME_PATTERN = /SECRET|TOKEN|KEY|PASSWORD|PRIVATE|SERVICE_ROLE|WEBHOOK|HMAC|VERIFIER/i;

function readEnv(env: EnvRecord | undefined, name: string) {
  const value = env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function isLocalUrl(value: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(value);
}

function safeUrlFromEnv(env?: EnvRecord) {
  const explicit =
    readEnv(env, "WTOS_STAGING_URL") ||
    readEnv(env, "WTOS_DEPLOYMENT_URL") ||
    readEnv(env, "NEXT_PUBLIC_APP_URL");
  const vercelUrl = readEnv(env, "VERCEL_URL");

  if (explicit) {
    return explicit;
  }

  if (vercelUrl) {
    return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
  }

  return "not configured";
}

function classifyDeploymentUrl(value: string): DeploymentCheckStatus {
  if (!value || value === "not configured") {
    return "blocked";
  }

  try {
    const parsed = new URL(value);

    if (parsed.protocol === "https:") {
      return "pass";
    }

    if (isLocalUrl(value)) {
      return "warning";
    }
  } catch {
    return "blocked";
  }

  return "blocked";
}

function redactablePresence(env: EnvRecord | undefined, name: string) {
  const value = readEnv(env, name);
  return {
    present: Boolean(value),
    secret: SECRET_NAME_PATTERN.test(name) && !name.startsWith("NEXT_PUBLIC_"),
  };
}

function formatPresence(name: string, env?: EnvRecord) {
  const { present, secret } = redactablePresence(env, name);
  const suffix = secret ? "present, secret redacted" : "present";
  return `${name}: ${present ? suffix : "missing"}`;
}

function isBooleanString(value: string) {
  return value === "true" || value === "false";
}

function buildDeploymentMetadata(env?: EnvRecord, now = new Date()): DeploymentEnvironmentMetadata {
  const environmentName =
    readEnv(env, "WTOS_DEPLOYMENT_ENV") ||
    readEnv(env, "NEXT_PUBLIC_APP_ENV") ||
    readEnv(env, "VERCEL_ENV") ||
    readEnv(env, "NODE_ENV") ||
    "unknown";
  const deploymentProvider =
    readEnv(env, "WTOS_DEPLOYMENT_PROVIDER") ||
    (readEnv(env, "VERCEL") === "1" ? "vercel" : "not configured");
  const deploymentUrl = safeUrlFromEnv(env);
  const productionApproved = readEnv(env, "WTOS_PRODUCTION_APPROVED") === "true";
  const liveProviderWritesEnabled = STAGING_PROVIDER_SAFETY_FLAGS.some(
    (flag) => readEnv(env, flag) === "true",
  );

  return {
    environmentName,
    deploymentProvider,
    deploymentUrl,
    deploymentUrlStatus: classifyDeploymentUrl(deploymentUrl),
    deploymentTimestamp: readEnv(env, "VERCEL_DEPLOYMENT_ID")
      ? now.toISOString()
      : readEnv(env, "WTOS_DEPLOYMENT_TIMESTAMP") || "not recorded",
    gitCommitHash:
      readEnv(env, "VERCEL_GIT_COMMIT_SHA") ||
      readEnv(env, "WTOS_COMMIT_SHA") ||
      "unknown",
    productionActivationStatus: productionApproved
      ? "enabled_requires_owner_review"
      : "not_granted",
    liveProviderWritesStatus: liveProviderWritesEnabled
      ? "enabled_requires_owner_review"
      : "disabled",
    healthEndpoint: "/api/health",
    readinessEndpoint: "/api/readiness",
  };
}

export function buildPrivateStagingEnvironmentMetadata(env?: EnvRecord) {
  return buildDeploymentMetadata(env);
}

function buildRuntimeHealthChecks(metadata: DeploymentEnvironmentMetadata): DeploymentCheck[] {
  return [
    {
      id: "runtime",
      label: "Application runtime",
      status: "pass",
      summary: "The Next.js API runtime responded to the health request.",
      evidence: ["No secret values are included in this response."],
      nextAction: "Use /api/readiness to evaluate staging dependencies before owner testing.",
    },
    {
      id: "deployment-url",
      label: "Deployment URL",
      status: metadata.deploymentUrlStatus,
      summary:
        metadata.deploymentUrlStatus === "pass"
          ? "A HTTPS deployment URL is visible to the runtime."
          : metadata.deploymentUrlStatus === "warning"
            ? "A local development URL is visible; this is not a real private staging URL."
            : "No valid HTTPS staging URL is configured.",
      evidence: [`URL status: ${metadata.deploymentUrlStatus}`],
      nextAction: "Configure the private staging URL in hosting environment variables.",
    },
  ];
}

function buildEnvironmentChecks(env?: EnvRecord): DeploymentCheck[] {
  const missing = REQUIRED_STAGING_ENVIRONMENT.filter((name) => !readEnv(env, name));
  const invalidBooleanFlags = STAGING_PROVIDER_SAFETY_FLAGS.filter((name) => {
    const value = readEnv(env, name);
    return Boolean(value) && !isBooleanString(value);
  });
  const invalidVerifiedGates = VERIFIED_STAGING_GATES.filter((name) => {
    const value = readEnv(env, name);
    return Boolean(value) && !isBooleanString(value);
  });

  return [
    {
      id: "required-runtime-env",
      label: "Required staging runtime variables",
      status: missing.length ? "blocked" : "pass",
      summary: missing.length
        ? "Staging runtime variables are missing."
        : "Required staging runtime variables are present; values are redacted.",
      evidence: REQUIRED_STAGING_ENVIRONMENT.map((name) => formatPresence(name, env)),
      nextAction: missing.length
        ? `Configure missing values in the deployment provider: ${missing.join(", ")}.`
        : "Keep these values in hosting provider settings, not in source code.",
    },
    {
      id: "provider-safety-flags",
      label: "Live provider write safety flags",
      status: invalidBooleanFlags.length
        ? "blocked"
        : STAGING_PROVIDER_SAFETY_FLAGS.some((name) => readEnv(env, name) === "true")
          ? "blocked"
          : "pass",
      summary: invalidBooleanFlags.length
        ? "One or more provider safety flags has an invalid boolean value."
        : STAGING_PROVIDER_SAFETY_FLAGS.some((name) => readEnv(env, name) === "true")
          ? "One or more live provider write gates is enabled and requires owner approval."
          : "Live provider writes, public intake, portal access, and automated customer notifications are disabled.",
      evidence: STAGING_PROVIDER_SAFETY_FLAGS.map((name) => {
        const value = readEnv(env, name);
        return `${name}: ${value || "false/unset"}`;
      }),
      nextAction: "Keep every live-write flag false or unset during private staging.",
    },
    {
      id: "verified-staging-gates",
      label: "Verified staging gates",
      status: invalidVerifiedGates.length
        ? "blocked"
        : VERIFIED_STAGING_GATES.every((name) => readEnv(env, name) === "true")
          ? "pass"
          : "blocked",
      summary: invalidVerifiedGates.length
        ? "One or more staging evidence gates has an invalid boolean value."
        : VERIFIED_STAGING_GATES.every((name) => readEnv(env, name) === "true")
          ? "Auth redirects, migration history, and staging regression evidence are recorded."
          : "Auth redirect verification, migration history verification, and staging regression evidence are not all recorded.",
      evidence: VERIFIED_STAGING_GATES.map((name) => `${name}: ${readEnv(env, name) || "false/unset"}`),
      nextAction:
        "Record verified auth redirects, Supabase migration history, and staging regression evidence in hosting environment variables after owner-controlled setup.",
    },
  ];
}

function buildAuthenticationChecks(
  metadata: DeploymentEnvironmentMetadata,
  env?: EnvRecord,
): DeploymentCheck[] {
  const hasHttpsUrl = metadata.deploymentUrlStatus === "pass";
  const redirectsVerified = readEnv(env, "WTOS_AUTH_REDIRECTS_VERIFIED") === "true";

  return [
    {
      id: "auth-redirects",
      label: "Authentication redirect requirements",
      status: hasHttpsUrl && redirectsVerified ? "pass" : hasHttpsUrl ? "warning" : "blocked",
      summary: hasHttpsUrl && redirectsVerified
        ? "Supabase dashboard redirect verification is recorded for the staging URL."
        : hasHttpsUrl
        ? "A staging URL exists, but Supabase dashboard redirect settings must still be verified by the owner."
        : "Supabase Site URL and redirect URLs cannot be finalized until a real HTTPS staging URL exists.",
      evidence: REQUIRED_AUTH_REDIRECT_PATHS.map((path) =>
        metadata.deploymentUrl === "not configured"
          ? `pending staging URL${path}`
          : `${metadata.deploymentUrl.replace(/\/$/, "")}${path}`,
      ),
      nextAction: "Add the staging URL and callback paths in Supabase Auth settings after deployment.",
    },
  ];
}

async function buildSupabaseChecks(
  env: EnvRecord | undefined,
  fetchImpl: FetchLike | undefined,
): Promise<DeploymentCheck[]> {
  const url = readEnv(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnv(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const hasSupabaseUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);

  const baseCheck: DeploymentCheck = {
    id: "supabase-config",
    label: "Supabase project configuration",
    status: url && anonKey && hasSupabaseUrl ? "pass" : "blocked",
    summary:
      url && anonKey && hasSupabaseUrl
        ? "Supabase URL and publishable/anon browser key are configured."
        : "Supabase URL or browser key is missing or invalid for staging.",
    evidence: [
      formatPresence("NEXT_PUBLIC_SUPABASE_URL", env),
      formatPresence("NEXT_PUBLIC_SUPABASE_ANON_KEY", env),
      `URL format: ${hasSupabaseUrl ? "supabase.co" : "not verified"}`,
    ],
    nextAction: "Verify the Supabase project reference and auth redirects before staging tests.",
  };

  if (!url || !anonKey || !fetchImpl || !hasSupabaseUrl) {
    return [
      baseCheck,
      {
        id: "supabase-data-api",
        label: "Supabase Data API probe",
        status: !fetchImpl ? "unknown" : "blocked",
        summary: !fetchImpl
          ? "Network probing was skipped for this readiness model."
          : "Supabase Data API cannot be probed until valid configuration exists.",
        evidence: ["No production data is returned by this readiness check."],
        nextAction: "Run /api/readiness from the deployed staging environment.",
      },
    ];
  }

  try {
    const response = await fetchImpl(
      `${url.replace(/\/$/, "")}/rest/v1/companies?select=id&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          Prefer: "count=exact",
        },
        cache: "no-store",
      },
    );
    const restrictedAsExpected = response.status === 401 || response.status === 403;
    const reachable = response.ok || restrictedAsExpected;

    return [
      baseCheck,
      {
        id: "supabase-data-api",
        label: "Supabase Data API probe",
        status: reachable ? "pass" : "blocked",
        summary: reachable
          ? "Supabase Data API responded without exposing record data in the readiness payload."
          : "Supabase Data API did not respond successfully for the required CRM table probe.",
        evidence: [
          `HTTP status: ${response.status}`,
          restrictedAsExpected
            ? "Anonymous CRM read was restricted, which is acceptable for private staging."
            : "Probe response contained status only; no customer records are returned.",
        ],
        nextAction: reachable
          ? "Use signed-in browser validation to verify authorized internal records."
          : "Verify Supabase URL, anon key, table exposure, and staging network access.",
      },
    ];
  } catch {
    return [
      baseCheck,
      {
        id: "supabase-data-api",
        label: "Supabase Data API probe",
        status: "blocked",
        summary: "Supabase Data API probe failed without exposing the underlying stack trace.",
        evidence: ["Network or configuration failure; details are intentionally not exposed."],
        nextAction: "Check deployment logs and Supabase project availability.",
      },
    ];
  }
}

function summarizeReport(
  checks: DeploymentCheck[],
): Pick<DeploymentReadinessReport, "status" | "blockers" | "warnings" | "ownerActions"> {
  const blockers = checks
    .filter((check) => check.status === "blocked")
    .map((check) => `${check.label}: ${check.nextAction}`);
  const warnings = checks
    .filter((check) => check.status === "warning" || check.status === "unknown")
    .map((check) => `${check.label}: ${check.summary}`);
  const ownerActions = Array.from(
    new Set(
      checks
        .filter((check) => check.status !== "pass")
        .map((check) => check.nextAction),
    ),
  );

  return {
    status: blockers.length ? "blocked" : warnings.length ? "warning" : "ready",
    blockers,
    warnings,
    ownerActions,
  };
}

export function buildPrivateStagingHealthReport(options?: {
  env?: EnvRecord;
  now?: Date;
}): DeploymentHealthReport {
  const metadata = buildDeploymentMetadata(options?.env, options?.now);

  return {
    service: "WeatherTech OS",
    status: "healthy",
    checkedAt: (options?.now ?? new Date()).toISOString(),
    metadata,
    checks: buildRuntimeHealthChecks(metadata),
  };
}

export async function buildPrivateStagingReadinessReport(options?: {
  env?: EnvRecord;
  now?: Date;
  fetchImpl?: FetchLike;
}): Promise<DeploymentReadinessReport> {
  const now = options?.now ?? new Date();
  const metadata = buildDeploymentMetadata(options?.env, now);
  const checks = [
    ...buildRuntimeHealthChecks(metadata),
    ...buildEnvironmentChecks(options?.env),
    ...buildAuthenticationChecks(metadata, options?.env),
    ...(await buildSupabaseChecks(options?.env, options?.fetchImpl)),
    {
      id: "production-activation-approval",
      label: "Production activation approval",
      status:
        metadata.productionActivationStatus === "not_granted" ? "pass" : "blocked",
      summary:
        metadata.productionActivationStatus === "not_granted"
          ? "Final production activation is not granted, as required for private staging."
          : "Production activation appears enabled and must be reviewed before staging continues.",
      evidence: [`Status: ${metadata.productionActivationStatus}`],
      nextAction: "Keep WTOS_PRODUCTION_APPROVED false until final owner go-live approval.",
    },
  ] satisfies DeploymentCheck[];
  const summary = summarizeReport(checks);

  return {
    service: "WeatherTech OS",
    checkedAt: now.toISOString(),
    metadata,
    checks,
    ...summary,
  };
}

export function assertNoSecretValuesInDeploymentReport(report: unknown, env?: EnvRecord) {
  const serialized = JSON.stringify(report);
  const exposed = Object.entries(env ?? {})
    .filter(([name, value]) => SECRET_NAME_PATTERN.test(name) && value)
    .filter(([, value]) => value && serialized.includes(value));

  return {
    ok: exposed.length === 0,
    exposedSecretNames: exposed.map(([name]) => name),
  };
}
