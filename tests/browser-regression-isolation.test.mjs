import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROWSER_REGRESSION_EXPECTED_PROJECT_REF,
  BROWSER_REGRESSION_REMOTE_WRITE_FLAG,
  WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF,
  WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
  assertBrowserApplicationSafetyMarkers,
  assertBrowserPublicTargetMarker,
  assertBrowserResourceTarget,
  assertBrowserRegressionTarget,
  assertRegressionCleanupSafe,
  buildRegressionRunMarker,
} from "./codex-browser/regression-target-guard.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const harnessPath = path.join(__dirname, "codex-browser", "weathertech-os-regression.mjs");
const harness = fs.readFileSync(harnessPath, "utf8");

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

const productionAuthorization = {
  [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
  [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]:
    WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF,
};

assertThrows(
  () =>
    assertBrowserRegressionTarget({
      baseUrl: "http://localhost:3000/",
      supabaseUrl: `https://${WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      serviceRoleKey: fakeServiceRoleJwt(
        WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF,
      ),
      runtimeEnv: productionAuthorization,
    }),
  "permanently blocked",
  "Known production remains blocked even when both hosted authorization values are supplied",
);
assertThrows(
  () =>
    assertBrowserRegressionTarget({
      baseUrl: "http://localhost:3000/",
      supabaseUrl: `https://${WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co`,
      serviceRoleKey: "",
      runtimeEnv: productionAuthorization,
      productionProjectRefs: [],
    }),
  "permanently blocked",
  "Known production cannot be bypassed by omitting caller-supplied production references",
);

const localTarget = assertBrowserRegressionTarget({
  baseUrl: "http://127.0.0.1:3000/",
  supabaseUrl: "http://127.0.0.1:54321",
  serviceRoleKey: fakeServiceRoleJwt("local"),
});
assertEqual(localTarget.kind, "local", "Local Supabase is allowed without a remote override");
assertEqual(
  localTarget.supabaseOrigin,
  "http://127.0.0.1:54321",
  "Local target identifies the exact public Supabase origin",
);

const nonProductionRef = "abcdefghijklmnopqrst";
const hostedOptions = {
  baseUrl: "http://localhost:3000/",
  supabaseUrl: `https://${nonProductionRef}.supabase.co`,
  serviceRoleKey: fakeServiceRoleJwt(nonProductionRef),
  approvedNonProductionProjectRefs: [nonProductionRef],
};

assertThrows(
  () =>
    assertBrowserRegressionTarget({
      ...hostedOptions,
      approvedNonProductionProjectRefs: [
        WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
      ],
      runtimeEnv: {
        [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
        [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]: nonProductionRef,
      },
    }),
  "not an explicitly approved non-production",
  "An unknown hosted project is rejected even when both runtime authorizations match it",
);
assertThrows(
  () =>
    assertBrowserRegressionTarget({
      baseUrl: "http://localhost:3000/",
      supabaseUrl: "not-a-supabase-url",
      serviceRoleKey: fakeServiceRoleJwt(nonProductionRef),
      runtimeEnv: {
        [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
        [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]: nonProductionRef,
      },
    }),
  "must be a valid URL",
  "A malformed hosted target is rejected before any authorization is considered",
);

assertThrows(
  () => assertBrowserRegressionTarget(hostedOptions),
  BROWSER_REGRESSION_REMOTE_WRITE_FLAG,
  "Hosted non-production fails closed without explicit authorization",
);
assertThrows(
  () =>
    assertBrowserRegressionTarget({
      ...hostedOptions,
      runtimeEnv: { [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true" },
    }),
  BROWSER_REGRESSION_EXPECTED_PROJECT_REF,
  "Hosted non-production requires the independent exact-project authorization",
);
assertThrows(
  () =>
    assertBrowserRegressionTarget({
      ...hostedOptions,
      runtimeEnv: {
        [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
        [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]: "different-project-ref",
      },
    }),
  BROWSER_REGRESSION_EXPECTED_PROJECT_REF,
  "Hosted non-production rejects a mismatched expected project",
);

const hostedTarget = assertBrowserRegressionTarget({
  ...hostedOptions,
  runtimeEnv: {
    [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
    [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]: nonProductionRef,
  },
});
assertEqual(
  hostedTarget.kind,
  "hosted_non_production",
  "Explicitly authorized hosted non-production is allowed",
);
assertEqual(
  hostedTarget.supabaseOrigin,
  `https://${nonProductionRef}.supabase.co`,
  "Hosted target identifies the exact public Supabase origin",
);

const fixedRegressionTarget = assertBrowserRegressionTarget({
  baseUrl: "http://localhost:3000/",
  supabaseUrl: `https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
  serviceRoleKey: fakeServiceRoleJwt(
    WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
  ),
  runtimeEnv: {
    [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
    [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]:
      WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
  },
});
assertEqual(
  fixedRegressionTarget.projectRef,
  WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF,
  "The fixed WeatherTech regression project is approved by default",
);

const matchingPublicTargetMarker = assertBrowserPublicTargetMarker({
  target: fixedRegressionTarget,
  publicSupabaseOrigin:
    `https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
});
assertEqual(
  matchingPublicTargetMarker.supabaseOrigin,
  fixedRegressionTarget.supabaseOrigin,
  "The browser-observed public origin marker matches the fixed regression target",
);
assertEqual(
  assertBrowserApplicationSafetyMarkers({
    target: fixedRegressionTarget,
    publicSupabaseOrigin:
      `https://${WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
    demoFallbackState: "disabled",
    providerSideEffectState: "disabled",
  }).supabaseOrigin,
  fixedRegressionTarget.supabaseOrigin,
  "The complete browser application safety marker set passes only for the isolated target",
);
assertThrows(
  () =>
    assertBrowserApplicationSafetyMarkers({
      target: fixedRegressionTarget,
      publicSupabaseOrigin: fixedRegressionTarget.supabaseOrigin,
      demoFallbackState: "disabled",
      providerSideEffectState: "enabled",
    }),
  "disable every provider/live-write side effect",
  "An app server with an enabled provider side effect fails closed",
);
assertThrows(
  () =>
    assertBrowserPublicTargetMarker({
      target: fixedRegressionTarget,
      publicSupabaseOrigin: "unconfigured",
    }),
  "no configured public Supabase origin",
  "A missing public target configuration marker fails closed",
);
assertThrows(
  () =>
    assertBrowserPublicTargetMarker({
      target: fixedRegressionTarget,
      publicSupabaseOrigin: "malformed",
    }),
  "malformed public Supabase origin",
  "A malformed public target configuration marker fails closed",
);
assertThrows(
  () =>
    assertBrowserPublicTargetMarker({
      target: fixedRegressionTarget,
      publicSupabaseOrigin: "https://different-project.supabase.co",
    }),
  "not a valid guarded target origin",
  "A public target marker for another hosted project fails closed",
);

const matchingHostedResourceTarget = assertBrowserResourceTarget({
  target: hostedTarget,
  resourceUrls: [
    "http://localhost:3000/_next/static/chunks/app.js",
    `https://${nonProductionRef}.supabase.co/rest/v1/jobs?select=id`,
    `https://${nonProductionRef}.supabase.co/auth/v1/user`,
  ],
});
assertEqual(
  matchingHostedResourceTarget.supabaseOrigin,
  hostedTarget.supabaseOrigin,
  "Matching hosted Supabase resources pass the public target check",
);
assertThrows(
  () =>
    assertBrowserResourceTarget({
      target: hostedTarget,
      resourceUrls: ["http://localhost:3000/_next/static/chunks/app.js"],
    }),
  "no identifiable Supabase API resource",
  "Missing Supabase resources fail closed",
);
assertThrows(
  () =>
    assertBrowserResourceTarget({
      target: hostedTarget,
      resourceUrls: [
        `https://${nonProductionRef}.supabase.co/rest/v1/jobs`,
        "http://127.0.0.1:54321/auth/v1/user",
      ],
    }),
  "multiple Supabase API origins",
  "Mixed hosted and local Supabase targets fail closed",
);
assertThrows(
  () =>
    assertBrowserResourceTarget({
      target: hostedTarget,
      resourceUrls: [
        "https://different-project-ref.supabase.co/rest/v1/jobs",
      ],
    }),
  "does not match the guarded target",
  "A mismatched hosted Supabase project fails closed",
);

const matchingLocalResourceTarget = assertBrowserResourceTarget({
  target: localTarget,
  resourceUrls: ["http://127.0.0.1:54321/rest/v1/jobs?select=id"],
});
assertEqual(
  matchingLocalResourceTarget.supabaseOrigin,
  localTarget.supabaseOrigin,
  "Matching local Supabase resources pass the public target check",
);
assertThrows(
  () =>
    assertBrowserResourceTarget({
      target: localTarget,
      resourceUrls: ["http://localhost:54322/rest/v1/jobs"],
    }),
  "does not match the guarded target",
  "A mismatched local Supabase origin fails closed",
);

assertThrows(
  () =>
    assertBrowserRegressionTarget({
      ...hostedOptions,
      baseUrl: "https://weathertech-os.vercel.app/",
      runtimeEnv: {
        [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
        [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]: nonProductionRef,
      },
    }),
  "locally served application",
  "The data-writing suite cannot run against a deployed application",
);
assertThrows(
  () =>
    assertBrowserRegressionTarget({
      ...hostedOptions,
      serviceRoleKey: fakeServiceRoleJwt("different-project-ref"),
      runtimeEnv: {
        [BROWSER_REGRESSION_REMOTE_WRITE_FLAG]: "true",
        [BROWSER_REGRESSION_EXPECTED_PROJECT_REF]: nonProductionRef,
      },
    }),
  "different Supabase project",
  "A decodable service credential must match the target URL",
);

assertEqual(
  buildRegressionRunMarker("20260811123045123"),
  "TEST WTOS REGRESSION 20260811123045123",
  "Cleanup builds an exact millisecond-resolution run marker",
);
assertThrows(
  () => buildRegressionRunMarker(""),
  "exact 17-digit run id",
  "Cleanup cannot fall back to a global test prefix",
);
assertThrows(
  () =>
    assertRegressionCleanupSafe({
      payments: [{ method: "stripe", reference: "provider-reference" }],
    }),
  "Stripe-linked",
  "Cleanup refuses Stripe-method payments",
);
assertThrows(
  () =>
    assertRegressionCleanupSafe({
      payments: [{ method: "Check", reference: "pi_provider_reference" }],
    }),
  "Stripe-linked",
  "Cleanup refuses Stripe provider references even when method metadata is wrong",
);
assertThrows(
  () => assertRegressionCleanupSafe({ stripeMappings: [{ id: "mapping" }] }),
  "Stripe-linked",
  "Cleanup refuses records linked through Stripe mappings",
);
assertRegressionCleanupSafe({
  payments: [{ method: "Check", reference: "TEST WTOS REGRESSION" }],
});

const runnerStart = harness.indexOf("export async function runWeatherTechOsRegression");
const runner = harness.slice(runnerStart);
const targetGuardIndex = runner.indexOf("const target = assertBrowserRegressionTarget(");
const serverSafetyMarkerIndex = runner.indexOf(
  "await assertServerApplicationSafetyMarkers(baseUrl, target)",
);
const publicTargetMarkerIndex = runner.indexOf(
  "await assertLoadedApplicationSafetyMarkers(tab, target)",
);
const firstDatabaseReadIndex = runner.indexOf("await detectLeadNameColumn(env)");
const firstCleanupIndex = runner.indexOf("await cleanupTestRecords(env, runId");

assert(targetGuardIndex >= 0, "Harness invokes the target guard");
assert(
  targetGuardIndex < firstDatabaseReadIndex && targetGuardIndex < firstCleanupIndex,
  "Target guard runs before every database read, cleanup, or seed operation",
);
assert(
  serverSafetyMarkerIndex >= 0 &&
    serverSafetyMarkerIndex < runner.indexOf("const tab = await getTab(browser)"),
  "Server target and side-effect markers are verified before opening the browser app",
);
assert(
  publicTargetMarkerIndex >= 0 &&
    publicTargetMarkerIndex < firstDatabaseReadIndex,
  "Browser-observed public Supabase target marker is verified before database reads or writes",
);
assert(
  !harness.includes("document.cookie") &&
    !harness.includes("localStorage") &&
    !harness.includes("sessionStorage"),
  "Harness does not inspect cookies or browser session storage",
);
assert(
  runner.indexOf("await assertNoRegressionMarkerResidue(") < firstCleanupIndex,
  "Preflight refuses a marker collision instead of deleting a pre-existing run",
);
assert(
  runner.indexOf("cleanupAuthorized = true") >
    runner.indexOf("await assertNoRegressionMarkerResidue(") &&
    runner.includes("if (cleanupAuthorized)"),
  "A failed marker-collision preflight cannot trigger cleanup in finally",
);
assert(
  !harness.includes('cleanupTestRecords(env, ""') &&
    harness.includes('new Date().toISOString().replace(/[-:.TZ]/g, "")'),
  "Harness uses a millisecond-resolution exact marker and has no global-prefix cleanup",
);
assert(
  harness.includes("Invoice for ${runMarker}%"),
  "Cleanup includes invoices derived from run-marked estimates",
);
assert(
  harness.includes('findByLikeIfPresent(env, "lead_intake_records", "provider_event_id", runMarker)') &&
    harness.includes('findByLikeIfPresent(env, "lead_intake_records", "contact_name", runMarker)'),
  "Cleanup discovers UUID-correlation lead-intake rows through exact run-marked fields",
);
assert(
  harness.includes("`Follow up: ${runMarker}`") &&
    harness.includes('"notifications",\n    "id"'),
  "Cleanup discovers and deletes run-specific follow-up notifications",
);
assert(
  harness.includes('findByLikeIfPresent(env, "job_notes", "note", runMarker)') &&
    harness.includes('findByLikeIfPresent(env, "job_photos", "caption", runMarker)') &&
    harness.includes('findByLikeIfPresent(env, "daily_logs", "work_completed", runMarker)') &&
    harness.includes('findByForeignIdsIfPresent(env, "office_tasks", "job_id", jobIds)') &&
    harness.includes("residueVerified: true"),
  "Cleanup verifies run residue across direct, child, and generated office-task records",
);

console.log("Browser regression production-isolation guard: PASS");
