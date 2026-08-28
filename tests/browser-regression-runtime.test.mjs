import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROWSER_REGRESSION_ENV_FILE,
  BROWSER_REGRESSION_TEST_USER_EMAIL,
  BROWSER_REGRESSION_TEST_USER_PASSWORD,
  DEFAULT_BROWSER_REGRESSION_GROUPS,
  abortBrowserRegressionSession,
  drainBrowserRegressionSession,
  getBrowserRegressionAuthCredentials,
  loadBrowserRegressionEnvironment,
  parseRegressionEnvironment,
  resolveBrowserRegressionGroups,
} from "./codex-browser/regression-runtime.mjs";
import {
  BROWSER_REGRESSION_EXPECTED_PROJECT_REF,
  BROWSER_REGRESSION_REMOTE_WRITE_FLAG,
  WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
} from "./codex-browser/regression-target-guard.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function assertThrows(callback, expectedMessage, message) {
  try {
    callback();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      `${message}. Received ${error instanceof Error ? error.message : String(error)}.`,
    );
    return;
  }

  throw new Error(`${message}. Expected the callback to throw.`);
}

function fakeServiceRoleJwt(projectRef) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");

  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    role: "service_role",
    ref: projectRef,
  })}.signature`;
}

const parsedEnvironment = parseRegressionEnvironment([
  "# ignored comment",
  "export NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321'",
  "NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true",
  `SUPABASE_SERVICE_ROLE_KEY=${fakeServiceRoleJwt("local")}`,
  "MIGHTY_APES_YELP_WEBHOOK_SECRET=synthetic-mighty-apes-secret",
  `${BROWSER_REGRESSION_TEST_USER_EMAIL}="regression-owner@example.test"`,
  `${BROWSER_REGRESSION_TEST_USER_PASSWORD}=synthetic-password`,
].join("\n"));
assertEqual(
  parsedEnvironment.NEXT_PUBLIC_SUPABASE_URL,
  "http://127.0.0.1:54321",
  "Regression environment parser supports quoted values and export declarations",
);
assertEqual(
  parsedEnvironment.MIGHTY_APES_YELP_WEBHOOK_SECRET,
  "synthetic-mighty-apes-secret",
  "Mighty Apes signing material stays in the server-only regression environment",
);
assertThrows(
  () => parseRegressionEnvironment("not a declaration"),
  "malformed declaration",
  "Regression environment parser fails closed on malformed lines",
);

const fullSelection = resolveBrowserRegressionGroups();
assert(fullSelection.fullRun, "An omitted group list resolves to a full run");
assertEqual(
  fullSelection.groups.length,
  DEFAULT_BROWSER_REGRESSION_GROUPS.length,
  "A full run resolves every default group",
);
assertEqual(
  JSON.stringify(fullSelection.groups),
  JSON.stringify(DEFAULT_BROWSER_REGRESSION_GROUPS),
  "A full run resolves the exact canonical default group order",
);
assertEqual(
  resolveBrowserRegressionGroups({ groups: ["dashboard"], fullRun: false }).groups[0],
  "dashboard",
  "A known targeted group is allowed",
);
assertEqual(
  resolveBrowserRegressionGroups({
    groups: ["crm-reconciliation"],
    fullRun: false,
  }).groups[0],
  "crm-reconciliation",
  "The focused CRM reconciliation group is allowed without changing full-run defaults",
);
assertEqual(
  resolveBrowserRegressionGroups({
    groups: ["crm-accountability"],
    fullRun: false,
  }).groups[0],
  "crm-accountability",
  "The focused lead-accountability group is allowed without changing full-run defaults",
);
assertEqual(
  resolveBrowserRegressionGroups({
    groups: ["job-photos"],
    fullRun: false,
  }).groups[0],
  "job-photos",
  "The focused private job-photo group is allowed without changing full-run defaults",
);
assertEqual(
  DEFAULT_BROWSER_REGRESSION_GROUPS.length,
  24,
  "The reconciliation scenario does not increase the established full-run group count",
);
assertThrows(
  () => resolveBrowserRegressionGroups({ groups: [], fullRun: false }),
  "at least one",
  "An empty targeted run cannot report success",
);
assertThrows(
  () => resolveBrowserRegressionGroups({ groups: ["dashboard", "dashboard"] }),
  "duplicates",
  "Duplicate group names are rejected",
);
assertThrows(
  () => resolveBrowserRegressionGroups({ groups: ["does-not-exist"], fullRun: false }),
  "Unknown browser regression group",
  "Unknown group names are rejected",
);
assertThrows(
  () => resolveBrowserRegressionGroups({ groups: ["dashboard"], fullRun: true }),
  "must include every default group",
  "A partial group list cannot be labeled a full run",
);
assertThrows(
  () =>
    resolveBrowserRegressionGroups({
      groups: [...DEFAULT_BROWSER_REGRESSION_GROUPS].reverse(),
      fullRun: true,
    }),
  "canonical order",
  "A reordered complete group list cannot be labeled a full run",
);

let drainedCheckpointCount = 0;
const drainedResult = await drainBrowserRegressionSession(
  (async function* createDrainFixture() {
    drainedCheckpointCount += 1;
    yield { kind: "record", completedAssertionCount: 1 };
    drainedCheckpointCount += 1;
    yield { kind: "record", completedAssertionCount: 2 };
    return { ok: true, fullRun: true };
  })(),
);
assertEqual(
  drainedCheckpointCount,
  2,
  "The compatibility wrapper fully awaits every resumable checkpoint",
);
assert(
  drainedResult.ok === true && drainedResult.fullRun === true,
  "The compatibility wrapper returns the generator's canonical terminal result",
);

let abortCleanupCount = 0;
const abortFixture = (async function* createAbortFixture() {
  try {
    yield { kind: "record", completedAssertionCount: 1 };
    yield { kind: "record", completedAssertionCount: 2 };
  } finally {
    abortCleanupCount += 1;
  }
})();
const firstAbortCheckpoint = await abortFixture.next();
assert(
  firstAbortCheckpoint.done === false,
  "A resumable session reaches a suspended checkpoint before abort",
);
await abortBrowserRegressionSession(abortFixture);
assertEqual(
  abortCleanupCount,
  1,
  "An explicitly awaited session abort executes its cleanup boundary exactly once",
);

const authCredentials = getBrowserRegressionAuthCredentials(parsedEnvironment);
assertEqual(
  authCredentials.email,
  "regression-owner@example.test",
  "Synthetic owner authentication reads the external test email",
);
assertEqual(
  authCredentials.password,
  "synthetic-password",
  "Synthetic owner authentication reads the paired external password",
);
assertThrows(
  () =>
    getBrowserRegressionAuthCredentials({
      [BROWSER_REGRESSION_TEST_USER_EMAIL]: "regression-owner@example.test",
    }),
  BROWSER_REGRESSION_TEST_USER_PASSWORD,
  "Synthetic owner authentication rejects an incomplete credential pair",
);

const sandbox = mkdtempSync(join(tmpdir(), "wtos-regression-runtime-"));
const checkoutPath = join(sandbox, "checkout");
const externalEnvironmentPath = join(sandbox, "isolated-regression.env");
mkdirSync(checkoutPath);
writeFileSync(
  join(checkoutPath, ".env.local"),
  "this line would fail parsing if the hosted loader read it\n",
);
writeFileSync(
  externalEnvironmentPath,
  [
    `NEXT_PUBLIC_SUPABASE_URL=https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
    "NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true",
    `SUPABASE_SERVICE_ROLE_KEY=${fakeServiceRoleJwt(WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF)}`,
    "MIGHTY_APES_YELP_WEBHOOK_SECRET=synthetic-mighty-apes-secret",
    `${BROWSER_REGRESSION_TEST_USER_EMAIL}=regression-owner@example.test`,
    `${BROWSER_REGRESSION_TEST_USER_PASSWORD}=synthetic-password`,
  ].join("\n"),
  { mode: 0o600 },
);
chmodSync(externalEnvironmentPath, 0o600);

try {
  const explicitRuntimeEnvironment = {
    [BROWSER_REGRESSION_ENV_FILE]: externalEnvironmentPath,
    [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
    [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]:
      WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
  };
  const externalEnvironment = loadBrowserRegressionEnvironment({
    cwd: checkoutPath,
    runtimeEnv: explicitRuntimeEnvironment,
    remoteWritesEnabled: true,
  });
  assertEqual(
    externalEnvironment.source,
    "external_file",
    "Hosted regression can load credentials from an explicit secure external file",
  );
  assertEqual(
    externalEnvironment.environment.NEXT_PUBLIC_SUPABASE_URL,
    `https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
    "External hosted target identity is preserved",
  );
  assertEqual(
    externalEnvironment.environment.MIGHTY_APES_YELP_WEBHOOK_SECRET,
    "synthetic-mighty-apes-secret",
    "External hosted regression loads the Mighty Apes secret without a repository fallback",
  );

  const processEnvironment = loadBrowserRegressionEnvironment({
    cwd: checkoutPath,
    runtimeEnv: {
      NEXT_PUBLIC_SUPABASE_URL: `https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
      NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK: "true",
      SUPABASE_SERVICE_ROLE_KEY: fakeServiceRoleJwt(
        WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
      ),
      MIGHTY_APES_YELP_WEBHOOK_SECRET: "synthetic-mighty-apes-secret",
      [BROWSER_REGRESSION_TEST_USER_EMAIL]: "regression-owner@example.test",
      [BROWSER_REGRESSION_TEST_USER_PASSWORD]: "synthetic-password",
    },
    remoteWritesEnabled: true,
  });
  assertEqual(
    processEnvironment.source,
    "process_environment",
    "Hosted regression can load credentials directly from protected process environment values",
  );
  assertEqual(
    processEnvironment.environment.MIGHTY_APES_YELP_WEBHOOK_SECRET,
    "synthetic-mighty-apes-secret",
    "Process regression environment forwards the Mighty Apes secret only to the local server",
  );

  assertThrows(
    () =>
      loadBrowserRegressionEnvironment({
        cwd: checkoutPath,
        runtimeEnv: {
          NEXT_PUBLIC_SUPABASE_URL: `https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
          SUPABASE_SERVICE_ROLE_KEY: fakeServiceRoleJwt(
            WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
          ),
        },
        remoteWritesEnabled: true,
      }),
    "NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK=true",
    "Hosted regression rejects silent demo fallback before target access",
  );

  assertThrows(
    () =>
      loadBrowserRegressionEnvironment({
        cwd: checkoutPath,
        runtimeEnv: {
          [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
          [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]:
            WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
        },
        remoteWritesEnabled: true,
      }),
    "refusing to read .env.local",
    "An authorized hosted run without an external credential source fails before reading .env.local",
  );

  assertThrows(
    () =>
      loadBrowserRegressionEnvironment({
        cwd: checkoutPath,
        runtimeEnv: {
          [BROWSER_REGRESSION_ENV_FILE]: join(checkoutPath, ".env.local"),
        },
      }),
    "outside the repository",
    "The external credential file cannot resolve to the repository .env.local",
  );

  chmodSync(externalEnvironmentPath, 0o644);
  assertThrows(
    () =>
      loadBrowserRegressionEnvironment({
        cwd: checkoutPath,
        runtimeEnv: {
          [BROWSER_REGRESSION_ENV_FILE]: externalEnvironmentPath,
        },
      }),
    "group or other users",
    "An external credential file with broad permissions is rejected",
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

const harnessPath = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "codex-browser",
  "weathertech-os-regression.mjs",
);
const harness = readFileSync(harnessPath, "utf8");
const targetGuard = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "codex-browser",
    "regression-target-guard.mjs",
  ),
  "utf8",
);
const layout = readFileSync(
  join(fileURLToPath(new URL("..", import.meta.url)), "app", "layout.tsx"),
  "utf8",
);
const regressionSafety = readFileSync(
  join(
    fileURLToPath(new URL("..", import.meta.url)),
    "lib",
    "deployment",
    "regressionSafety.ts",
  ),
  "utf8",
);
const runnerStart = harness.indexOf("export async function runWeatherTechOsRegression");
const runner = harness.slice(runnerStart);
const resumableRunnerStart = harness.indexOf(
  "export async function* createWeatherTechOsRegressionSession",
);
const resumableRunner = harness.slice(resumableRunnerStart);
const yieldedRecordCount = [
  ...resumableRunner.matchAll(/yield await record\(/g),
].length;
const jobBuilderScrollHelperStart = harness.indexOf(
  "async function waitForSelectedJobBuilderScrollTarget",
);
const jobBuilderScrollHelper = harness.slice(
  jobBuilderScrollHelperStart,
  harness.indexOf("async function runUiMutationTests", jobBuilderScrollHelperStart),
);
const jobBuilderScrollWorkflowStart = harness.indexOf(
  'progress("job:open-existing:start")',
);
const jobBuilderScrollWorkflow = harness.slice(
  jobBuilderScrollWorkflowStart,
  harness.indexOf("const openAfter = await getScrollY(tab);", jobBuilderScrollWorkflowStart),
);

assert(
  runner.includes("runtimeEnv = null") &&
    runner.includes("loadBrowserRegressionEnvironment({") &&
    runner.includes("resolvedRuntimeEnv[BROWSER_REGRESSION_REMOTE_WRITE_FLAG]") &&
    runner.includes("resolvedRuntimeEnv[BROWSER_REGRESSION_EXPECTED_PROJECT_REF]"),
  "The runner accepts an explicit non-secret runtime authorization object and forwards it to target validation",
);
assert(
  runner.includes("return drainBrowserRegressionSession(") &&
    runner.includes("createWeatherTechOsRegressionSession(options)") &&
    resumableRunnerStart >= 0 &&
    yieldedRecordCount > 0 &&
    !/(^|\n)\s*await record\(/.test(resumableRunner),
  "The legacy runner drains one resumable session and every outer assertion yields a fully awaited checkpoint",
);
assert(
  resumableRunner.lastIndexOf("yield await record(") <
    resumableRunner.indexOf('progress("cleanup:after:start")') &&
    resumableRunner.indexOf('progress("cleanup:after:start")') <
      resumableRunner.indexOf('progress("browser:tab:closed")'),
  "Run-level cleanup and tab closure remain after the final resumable assertion checkpoint",
);
assert(
  harness.includes('getAttribute("data-wtos-crm-demo-fallback"') &&
    targetGuard.includes('demoFallbackState !== "disabled"') &&
    targetGuard.includes('providerSideEffectState !== "disabled"') &&
    harness.includes('getAttribute("data-wtos-provider-side-effects"') &&
    harness.includes("assertServerApplicationSafetyMarkers(baseUrl, target)") &&
    layout.includes("data-wtos-crm-demo-fallback") &&
    layout.includes("data-wtos-provider-side-effects") &&
    regressionSafety.includes("REGRESSION_SIDE_EFFECT_FLAGS") &&
    regressionSafety.includes("GHL_SYNC_ENABLED") &&
    regressionSafety.includes("TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED") &&
    regressionSafety.includes("TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED") &&
    regressionSafety.includes("TWILIO_IHC_VOICE_FORWARDING_ENABLED") &&
    regressionSafety.includes("TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED"),
  "The browser verifies the raw and rendered app markers for disabled demo fallback and provider side effects",
);
assert(
  !harness.includes("function readLocalEnv") &&
    !harness.includes("ensureAppShell(tab, BASE_URL"),
  "The runner uses the guarded environment loader and consistently threads the selected base URL",
);
assert(
  runner.indexOf("resolveBrowserRegressionGroups({ groups, fullRun })") <
    runner.indexOf("loadBrowserRegressionEnvironment({"),
  "Group validation runs before environment loading or browser/database activity",
);
assert(
  runner.includes("await ensureAppEntry(tab, baseUrl, progress);") &&
    runner.indexOf("await assertServerApplicationSafetyMarkers(baseUrl, target);") >= 0 &&
    runner.indexOf("await assertServerApplicationSafetyMarkers(baseUrl, target);") <
      runner.indexOf("const tab = await getTab(browser);") &&
    runner.indexOf("await assertLoadedApplicationSafetyMarkers(tab, target);") >= 0 &&
    runner.indexOf("await assertLoadedApplicationSafetyMarkers(tab, target);") <
      runner.indexOf("await ensureAppShell(tab, baseUrl, progress, authCredentials);"),
  "Raw server and rendered browser safety markers are verified before submitting synthetic owner credentials",
);
assert(
  !harness.includes("document.cookie") &&
    !harness.includes("localStorage") &&
    !harness.includes("sessionStorage"),
  "Authentication and recovery coverage never inspect cookies or browser storage",
);
assert(
  harness.includes("assertionCount: results.length") &&
    harness.includes("browserConsoleWarningCount") &&
    harness.includes("Browser console remains free of runtime warnings") &&
    harness.includes("Browser console inspection must complete"),
  "Regression results report assertion and browser warning counts and fail when warning inspection cannot complete",
);
assert(
  jobBuilderScrollHelperStart >= 0 &&
    jobBuilderScrollHelper.includes('titleInput?.value !== expectedTitle') &&
    jobBuilderScrollHelper.includes('style.display !== "none"') &&
    jobBuilderScrollHelper.includes("rect.bottom > 0") &&
    jobBuilderScrollHelper.includes("rect.top < window.innerHeight") &&
    jobBuilderScrollHelper.includes("rect.top >= -20") &&
    jobBuilderScrollHelper.includes("rect.top <= 120") &&
    jobBuilderScrollWorkflowStart >= 0 &&
    jobBuilderScrollWorkflow.includes(
      "for (let attempt = 1; attempt <= 2; attempt += 1)",
    ) &&
    jobBuilderScrollWorkflow.includes("clickJobListItemByText(") &&
    jobBuilderScrollWorkflow.includes("waitForSelectedJobBuilderScrollTarget(") &&
    jobBuilderScrollWorkflow.includes(
      'progress("job:open-existing:scroll-retry")',
    ) &&
    !jobBuilderScrollHelper.includes("scrollIntoView"),
  "The job-builder scroll retry stays bounded and still proves the exact selected visible target without moving it from the harness",
);
assert(
  layout.includes("data-wtos-supabase-origin={getPublicSupabaseOrigin()}") &&
    layout.includes("process.env.NEXT_PUBLIC_SUPABASE_URL") &&
    !layout.includes("SUPABASE_SERVICE_ROLE_KEY"),
  "The application exposes only its public Supabase origin for browser target verification",
);

console.log("Browser regression runtime lifecycle: PASS");
