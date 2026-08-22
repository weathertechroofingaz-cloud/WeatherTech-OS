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
const crmAppPath = path.join(__dirname, "..", "components", "CrmApp.tsx");
const crmApp = fs.readFileSync(crmAppPath, "utf8");

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
  "Harness never inspects cookies or browser storage, including the application's private recovery-token storage",
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
  harness.includes('"mighty_apes_yelp_webhook_events",\n      "delivery_id",\n      marker') &&
    harness.includes('"mighty_apes_yelp_webhook_events",\n      "provider_lead_id",\n      marker') &&
    harness.includes('"mighty_apes_yelp_webhook_events",\n    "id",\n    mightyApesEvents.map((event) => event.id)'),
  "Cleanup discovers Mighty Apes evidence through both exact run-marked provider identifiers",
);
assert(
  harness.includes('"integration_sync_logs",\n    "id",\n    mightyApesSyncLogs.map((log) => log.id)') &&
    harness.indexOf('"mighty_apes_yelp_webhook_events",\n    "id",\n    mightyApesEvents.map((event) => event.id)') <
      harness.indexOf('"integration_sync_logs",\n    "id",\n    mightyApesSyncLogs.map((log) => log.id)'),
  "Cleanup removes the immutable Mighty Apes audit rows before their exact linked sync logs",
);
assert(
  harness.includes('"/api/integrations/mighty-apes/yelp/webhook"') &&
    harness.includes("MIGHTY_APES_YELP_WEBHOOK_SECRET") &&
    harness.includes('"User-Agent": "MightyApes-Webhook/1"') &&
    harness.includes("createMightyApesHmacSignature(yelpRawBody, yelpSigningSecret)") &&
    harness.includes('yelpTest.body?.status !== "test_accepted"') &&
    harness.includes("Authenticated Mighty Apes lead.test did not remain audit-only") &&
    harness.includes('yelpExactRetry.body?.status !== "duplicate"') &&
    harness.includes("Mighty Apes unified intake did not preserve multiline/no-email/provider timestamp evidence") &&
    harness.includes("Mighty Apes Yelp intake did not create exactly one normal WeatherTech new-lead office task") &&
    harness.includes('yelpOfficeTasks[0].automation_key !== `new_lead:${yelpLead.id}`') &&
    harness.includes('yelpLead.company_id !== companies.weatherTech.id') &&
    harness.includes('yelpLead.company_id === companies.ihc.id') &&
    harness.includes("Mighty Apes Yelp lead excluded from IHC Leads"),
  "Browser coverage signs the raw Mighty Apes body and proves test isolation, exact retry, field preservation, and WeatherTech-only visibility",
);
assert(
  harness.includes('"none",\n      `estimate missing-customer precondition attempt ${attempt}`') &&
    harness.includes('document.querySelector(\'#estimate-builder select[name="customer_id"]\')?.value === "none"') &&
    harness.includes('for (let attempt = 1; attempt <= 3; attempt += 1)') &&
    harness.includes("estimate requires customer validation") &&
    harness.includes('countEstimatesByTitle(env, estimateTitle)') &&
    harness.includes('[role="alert"][aria-label="Error notification"]'),
  "Estimate validation establishes an explicit no-customer precondition, retries the exact UI submit, and proves zero persistence",
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
    harness.includes('findByLikeIfPresent(env, "properties", "display_name", runMarker)') &&
    harness.includes('"lead_accountability_events",\n      "operation_key",\n      runMarker') &&
    harness.includes('findByLikeIfPresent(env, "marketing_campaigns", "campaign_name", runMarker)') &&
    harness.includes('findByLikeIfPresent(env, "marketing_spend_months", "notes", runMarker)') &&
    harness.includes('"crm_identity_reconciliation_events",\n      "operation_key"') &&
    harness.includes('"crm_identity_reconciliation_events",\n    "source_lead_id",\n    leadIds') &&
    harness.includes('findByForeignIdsIfPresent(env, "office_tasks", "job_id", jobIds)') &&
    harness.includes('"crm_identity_reconciliation_events",\n    "id",\n    reconciliationEventIds') &&
    harness.includes("residueVerified: true"),
  "Cleanup verifies run residue across direct, child, reconciliation, accountability, marketing, property, and generated office-task records",
);
assert(
  harness.includes("async function removeRegressionJobPhotoObjects") &&
    harness.includes("async function listRegressionJobPhotoObjects") &&
    harness.includes("async function findJobPhotoUploadOperationsForCleanup") &&
    harness.includes("findJobPhotosForCleanup(env, {") &&
    harness.includes("...discoveredJobPhotoStoragePaths") &&
    harness.includes("assertExactRegressionJobPhotoPath") &&
    harness.includes("removeRegressionJobPhotoObjects(env, jobPhotoStoragePaths)") &&
    harness.includes('deleteByIds(env, "job_photos", "id", jobPhotoIds)') &&
    harness.includes('"job_photo_upload_operations",\n    "id",\n    jobPhotoUploadOperationIds') &&
    harness.indexOf("removeRegressionJobPhotoObjects(env, jobPhotoStoragePaths)") <
      harness.indexOf('deleteByIds(env, "job_photos", "id", jobPhotoIds)') &&
    harness.indexOf('deleteByIds(env, "job_photos", "id", jobPhotoIds)') <
      harness.indexOf('"job_photo_upload_operations",\n    "id",\n    jobPhotoUploadOperationIds') &&
    harness.includes("assertRegressionJobPhotoObjectsRemoved(env, jobPhotoStoragePaths)"),
  "Browser cleanup validates and removes exact private job-photo objects before exact metadata, then proves zero object residue",
);
assert(
  harness.includes("async function seedRegressionJobPhoto(") &&
    harness.includes("async function createRegressionOwnerClient(env)") &&
    harness.includes("target_recovery_lease_token: recoveryLeaseToken") &&
    harness.includes('"wtos_begin_job_photo_upload"') &&
    harness.indexOf('"wtos_begin_job_photo_upload"') <
      harness.indexOf("await uploadRegressionJobPhotoObject(client, filePath)") &&
    harness.includes('"wtos_register_job_photo"') &&
    harness.includes('client.rpc("wtos_cancel_job_photo_upload", rpcArgs)') &&
    harness.includes(".remove([filePath])") &&
    harness.includes('client.rpc("wtos_confirm_job_photo_upload_abort", rpcArgs)') &&
    !harness.includes('restRequest(env, "job_photos", {\n      method: "POST"'),
  "Browser fixtures authenticate the synthetic owner, reserve before exact private upload, register through the least-privilege RPC, and durably cancel exact failures",
);
assert(
  harness.includes("async function seedInterruptedRegressionJobPhoto(") &&
    harness.includes("async function readCommittedUiJobPhotoUploadOperation(") &&
    harness.includes(
      "job_photo_upload_operations?select=id,company_id,upload_operation_key,file_path,recovery_lease_token,state",
    ) &&
    harness.includes("async function waitForInterruptedRegressionJobPhotoAbort(") &&
    harness.includes("async function assertIndependentTabJobPhotoRecoveryWaiting(") &&
    harness.includes("async function assertInterruptedRegressionJobPhotoReserved(") &&
    harness.includes('getAttribute("data-state") === "waiting"') &&
    harness.includes('operations[0].state !== "reserved"') &&
    harness.includes("operations[0].id !== interruptedUpload.operationId") &&
    harness.includes("object.data !== true") &&
    harness.includes("if (errors.length || warnings.length)") &&
    harness.includes("Independent-tab recovery waiting emitted ${errors.length} error(s) and ${warnings.length} warning(s).") &&
    harness.includes("await independentTab.close().catch(() => undefined)") &&
    harness.includes(
      'const primaryRecoveryParkingPath = "/__wtos_job_photo_recovery_park__"',
    ) &&
    harness.includes("inert primary-tab job-photo recovery parking route") &&
    harness.includes('document.querySelector("main.wt-app-shell") === null') &&
    harness.includes(
      "document.querySelector('[data-testid=\"job-photo-recovery-status\"]') === null",
    ) &&
    harness.includes("same-token reload interrupted-photo recovery") &&
    harness.includes("same-token internal-navigation interrupted-photo recovery") &&
    harness.includes('[data-testid="job-photo-recovery-status"]') &&
    harness.includes('operations[0].state === "aborted"') &&
    harness.includes("metadata.length === 0") &&
    harness.includes("object.data === false") &&
    harness.includes("[400, 404].includes(Number(object.error.status))"),
  "Browser coverage derives the non-PII token from the exact committed row, proves an independent tab waits without mutation, and proves same-token reload/internal-navigation recovery converges to an idle zero-object, zero-metadata abort",
);
const securePhotoRecoverySequence = harness.slice(
  harness.indexOf("const committedUiOperation = await readCommittedUiJobPhotoUploadOperation("),
  harness.indexOf("const internalNavigationRecovery ="),
);
assert(
  securePhotoRecoverySequence.indexOf(
    "const committedUiOperation = await readCommittedUiJobPhotoUploadOperation(",
  ) < securePhotoRecoverySequence.indexOf(
    "await tab.goto(new URL(primaryRecoveryParkingPath, baseUrl).toString())",
  ) &&
    securePhotoRecoverySequence.indexOf(
      "await tab.goto(new URL(primaryRecoveryParkingPath, baseUrl).toString())",
    ) <
      securePhotoRecoverySequence.indexOf("const reloadRecovery = await seedInterruptedRegressionJobPhoto(") &&
    securePhotoRecoverySequence.indexOf("const reloadRecovery = await seedInterruptedRegressionJobPhoto(") <
      securePhotoRecoverySequence.indexOf("await assertIndependentTabJobPhotoRecoveryWaiting(") &&
    securePhotoRecoverySequence.indexOf("await assertIndependentTabJobPhotoRecoveryWaiting(") <
      securePhotoRecoverySequence.indexOf("await tab.goto(baseUrl)") &&
    securePhotoRecoverySequence.indexOf("await tab.goto(baseUrl)") <
      securePhotoRecoverySequence.indexOf("await waitForInterruptedRegressionJobPhotoAbort("),
  "Browser recovery reads the committed token service-side, proves its primary tab is parked on an inert same-origin 404 before seeding, proves a waiting independent tab cannot mutate it, then returns the primary tab for same-token cleanup",
);
assert(
  harness.includes('enabledGroups.has("job-photos")') &&
    harness.includes("async function testSecureJobPhotoWorkflow(") &&
    harness.includes("async function waitForJobPhotoRelationOptionState(") &&
    harness.includes("persistedPhotoCustomers.length !== 1") &&
    harness.includes("secure photo initial WeatherTech relation options") &&
    harness.includes("secure job-photo workspace after relation refresh") &&
    harness.includes("after one hard reload. Last state:") &&
    harness.includes("secure photo IHC relation isolation") &&
    harness.includes("secure photo returned WeatherTech relation options") &&
    harness.includes('[data-testid="job-photo-company-select"]') &&
    harness.includes('[data-testid="job-photo-company-filter"]') &&
    harness.includes("The Photos upload form exposed WeatherTech relations inside the IHC scope") &&
    harness.includes("Photo uploaded securely.") &&
    harness.includes('[data-testid="job-photo-upload-lock"]') &&
    harness.includes("committed Photos upload releases its frozen upload identity") &&
    harness.includes("assertPrivateJobPhotoSignedUrl(") &&
    harness.includes("async function assertSignedJobPhotoFixtureResponse(") &&
    harness.includes('response.status !== 200') &&
    harness.includes('contentType !== "image/png"') &&
    harness.includes("!body.equals(JOB_PHOTO_TEST_PNG)") &&
    harness.includes("image.complete && image.naturalWidth > 0") &&
    !harness.includes("image instanceof HTMLImageElement") &&
    harness.includes('await tab.clipboard.writeText("")') &&
    harness.includes("await tab.clipboard.readText()") &&
    harness.includes("const visiblePhotoTabsBeforeOpen = new Set(") &&
    harness.includes("await browser.user.openTabs()") &&
    harness.includes("!visiblePhotoTabsBeforeOpen.has(entry.providerTabId)") &&
    harness.includes("openedPhotoProviderTabId = opened.providerTabId") &&
    harness.includes("openedPhotoTab = await browser.user.claimTab(opened)") &&
    harness.includes("await openedPhotoTab.url()") &&
    harness.includes("=== opened.url ? true : null") &&
    harness.includes('"temporary job-photo claimed URL", 15000') &&
    !harness.includes("await openedPhotoTab.playwright.waitForURL(opened.url") &&
    !harness.includes("await openedPhotoTab.playwright.waitForLoadState") &&
    harness.includes("if (openedPhotoTab)") &&
    !harness.includes("if (openedPhotoTab && openedPhotoProviderTabId)") &&
    harness.includes(
      "The temporary job-photo tab is missing its exact provider identity.",
    ) &&
    harness.includes("const openedPhotoControlledTabId = openedPhotoTab.id") &&
    harness.includes("attempt <= 3") &&
    harness.includes("setTimeout(resolve, 250)") &&
    harness.includes("entry.id === openedPhotoControlledTabId") &&
    harness.includes(
      "openedPhotoTab = await browser.tabs.get(openedPhotoControlledTabId)",
    ) &&
    harness.includes("entry.providerTabId === openedPhotoProviderTabId") &&
    harness.includes('"temporary job-photo tab cleanup"') &&
    harness.includes("ERR_ABORTED (-3) loading 'about:blank'") &&
    harness.includes("Unable to close the temporary job-photo tab safely.") &&
    harness.includes(
      "Unable to close the exact controlled temporary job-photo tab safely.",
    ) &&
    harness.includes(
      "Unable to reacquire the exact controlled temporary job-photo tab safely.",
    ) &&
    !harness.includes("window.__wtosCopiedPhotoUrl") &&
    !harness.includes("window.__wtosOpenedPhoto") &&
    harness.includes("Secure job-photo reload duplicated or persisted a durable URL") &&
    harness.includes("independentTabRecoveryWaiting: true") &&
    harness.includes("internalNavigationRecovery: true") &&
    harness.includes("reloadRecovery: true") &&
    harness.includes('[data-testid="customer-360-photos"]'),
  "Targeted signed-in job-photo coverage proves upload relation isolation, private preview/copy/open with exact-URL-polled, bounded, exact-identity tab cleanup, reload persistence, and Customer 360 visibility",
);
const fieldOperationsWorkflowSource = harness.slice(
  harness.indexOf("async function testFieldOperationsWorkspace"),
  harness.indexOf("async function assertIndependentTabJobPhotoRecoveryWaiting"),
);
const fieldOperationsReadinessSource = harness.slice(
  harness.indexOf("async function readFieldOperationsReadinessState"),
  harness.indexOf("async function testFieldOperationsWorkspace"),
);
assert(
  fieldOperationsReadinessSource.includes("exactJobCardCount") &&
    fieldOperationsReadinessSource.includes("exactInspectionCardCount") &&
    fieldOperationsReadinessSource.includes("companyFilterValue === \"all\"") &&
    fieldOperationsReadinessSource.includes("data-company-id") &&
    fieldOperationsReadinessSource.includes("data-assignment-kind") &&
    fieldOperationsReadinessSource.includes("selectedTitle") &&
    fieldOperationsReadinessSource.includes("formState") &&
    fieldOperationsReadinessSource.includes("liveError") &&
    fieldOperationsWorkflowSource.includes("const fieldSeedProof =") &&
    fieldOperationsWorkflowSource.includes("persistedJobs.length !== 1") &&
    fieldOperationsWorkflowSource.includes("persistedInspections.length !== 1") &&
    fieldOperationsWorkflowSource.includes("Date.parse(persistedJob?.scheduled_start") &&
    fieldOperationsWorkflowSource.includes("Date.parse(persistedInspection?.scheduled_start") &&
    fieldOperationsWorkflowSource.includes("attempt <= 2") &&
    fieldOperationsWorkflowSource.includes("waitForFieldOperationsAssignmentReadiness(") &&
    fieldOperationsWorkflowSource.includes(
      "assignments did not settle after two bounded reload attempts",
    ) &&
    fieldOperationsWorkflowSource.includes(
      '[data-testid="field-assignment-card"][data-company-id="${company.id}"][data-assignment-kind="job"]',
    ) &&
    fieldOperationsWorkflowSource.includes(
      'exactCard?.getAttribute("aria-pressed") === "true"',
    ) &&
    fieldOperationsWorkflowSource.includes(
      '"exact Field Operations job selection and forms"',
    ),
  "Field Operations proves exact persisted assignments, permits only two reload/open/select-all settlement attempts, selects the exact job card, and preserves structured terminal diagnostics",
);
assert(
  fieldOperationsWorkflowSource.includes("const fieldIssueDetails =") &&
    fieldOperationsWorkflowSource.includes("await clickEnabledUntilPersisted({") &&
    fieldOperationsWorkflowSource.includes(
      "locator: tab.playwright.locator('[data-testid=\"field-issue-submit\"]')",
    ) &&
    fieldOperationsWorkflowSource.includes(
      "findJobNoteContaining(env, seededJob.id, fieldIssueDetails)",
    ) &&
    fieldOperationsWorkflowSource.includes(
      'errorPrefix: "Field issue submission was refused"',
    ),
  "Field Operations retries only its exact enabled issue submit until the run-specific note persists and surfaces a visible application error immediately",
);
assert(
  fieldOperationsWorkflowSource.includes(
    'document.body.innerText.includes("Field status saved as Work Started.")',
  ) &&
    fieldOperationsWorkflowSource.includes(
      'document.querySelector(\'[data-testid="field-save-status"]\')?.disabled === false',
    ) &&
    fieldOperationsWorkflowSource.includes(
      '"field work started UI settlement before checklist action"',
    ) &&
    fieldOperationsWorkflowSource.includes("const seededChecklistTask =") &&
    fieldOperationsWorkflowSource.includes(
      "seededChecklistTask.status !== \"todo\"",
    ) &&
    fieldOperationsWorkflowSource.includes("await clickEnabledUntilPersisted({") &&
    fieldOperationsWorkflowSource.includes(
      "locator: seededChecklistRow.locator('[data-testid=\"field-checklist-complete\"]')",
    ) &&
    fieldOperationsWorkflowSource.includes(
      'persistenceLabel: "exact field checklist completion persistence"',
    ) &&
    fieldOperationsWorkflowSource.includes(
      'errorPrefix: "Field checklist completion was refused"',
    ) &&
    fieldOperationsWorkflowSource.includes(
      "task.id !== seededChecklistTask.id",
    ) &&
    fieldOperationsWorkflowSource.includes(
      'const completedChecklistDescriptionMarker = "Field checklist - complete";',
    ) &&
    fieldOperationsWorkflowSource.includes(
      "task.description?.includes(completedChecklistDescriptionMarker)",
    ) &&
    fieldOperationsWorkflowSource.includes(
      "completedTask.description?.includes(completedChecklistDescriptionMarker)",
    ) &&
    !fieldOperationsWorkflowSource.includes("Field checklist - Complete") &&
    fieldOperationsWorkflowSource.indexOf(
      "field work started UI settlement before checklist action",
    ) < fieldOperationsWorkflowSource.indexOf("const seededChecklistTask =") &&
    fieldOperationsWorkflowSource.indexOf("const seededChecklistTask =") <
      fieldOperationsWorkflowSource.indexOf("const completedTask ="),
  "Field checklist coverage waits for Work Started UI settlement, re-resolves the exact seeded task UUID, and retries only until that same task persists done with its structured description while surfacing live errors",
);
const fieldMaterialPersistenceHelper = harness.slice(
  harness.indexOf("async function clickFieldMaterialUntilPersisted"),
  harness.indexOf("async function withAcceptedConfirm"),
);
assert(
  fieldOperationsWorkflowSource.includes("const fieldMaterialName =") &&
    fieldOperationsWorkflowSource.includes("await clickFieldMaterialUntilPersisted({") &&
    fieldOperationsWorkflowSource.includes(
      "locator: tab.playwright.locator('[data-testid=\"field-material-submit\"]')",
    ) &&
    fieldOperationsWorkflowSource.includes(
      "findJobMaterialsByName(env, seededJob.id, fieldMaterialName)",
    ) &&
    fieldOperationsWorkflowSource.includes(
      "`Field material issue - Materials missing\\nMaterial: 1 each ${fieldMaterialName}`",
    ) &&
    fieldOperationsWorkflowSource.includes(
      'errorPrefix: "Field material submission was refused"',
    ) &&
    fieldOperationsWorkflowSource.includes(
      'materialIssueResult.material.notes !== "Materials missing"',
    ) &&
    fieldOperationsWorkflowSource.includes(
      "materialIssueNoteId: materialIssueResult.note.id",
    ) &&
    !fieldOperationsWorkflowSource.includes(
      "materialIssueNoteId: materialIssueNote.id",
    ) &&
    fieldMaterialPersistenceHelper.includes("if (materials.length > 1)") &&
    fieldMaterialPersistenceHelper.includes(
      "const actionHasPersisted = Boolean(lastMaterial || lastNote)",
    ) &&
    fieldMaterialPersistenceHelper.includes("!actionHasPersisted") &&
    fieldMaterialPersistenceHelper.includes("lastMaterial && lastNote") &&
    fieldMaterialPersistenceHelper.includes("visibleError?.trim()"),
  "Field material submission retries the exact control only before any durable effect, then requires exactly one material row plus its structured office note and fails visible errors immediately",
);
const submitActivationHelper = harness.slice(
  harness.indexOf("async function activateSubmitButtonByText"),
  harness.indexOf("function toDateTimeLocalValue"),
);
assert(
  submitActivationHelper.includes("await strategy();\n      return;") &&
    submitActivationHelper.includes("if (errors.length === 3)"),
  "Submit activation fallbacks stop after the first successful strategy and report only when every bounded strategy fails",
);
assert(
  harness.includes("Field photo uploaded securely.") &&
    harness.includes(
      "tab.playwright.locator('[data-testid=\"field-photo-category-select\"]'),\n      \"During-work photos\"",
    ) &&
    harness.includes('fieldPhoto.label !== "During-work photos"') &&
    harness.includes('[data-testid="field-photo-upload-lock"]') &&
    harness.includes("committed field photo releases its frozen upload identity") &&
    harness.includes("Field photo violated the secure company/path contract") &&
    harness.includes("Inspection photo uploaded and finding added.") &&
    harness.includes('[data-testid="inspection-photo-upload-lock"]') &&
    harness.includes("committed inspection photo releases its frozen upload identity") &&
    harness.includes("Inspection photo did not preserve its secure link/finding contract") &&
    harness.includes("Customer Portal photo preview"),
  "Full browser coverage exercises the canonical During-work photos Field Operations category plus secure inspection and customer-visible portal photo surfaces",
);
const fileChooserHelper = harness.slice(
  harness.indexOf("function isTransientFileChooserInteractionError"),
  harness.indexOf("async function checkUnique"),
);
assert(
  fileChooserHelper.includes("if (!isAbsolute(path))") &&
    fileChooserHelper.includes("const expectedFileName = basename(path)") &&
    fileChooserHelper.includes("attempt <= 3") &&
    fileChooserHelper.includes("waitForUniqueLocator(locator") &&
    fileChooserHelper.includes("const inputLocator =") &&
    fileChooserHelper.includes("uploadControlTagName === \"INPUT\"") &&
    fileChooserHelper.includes("locator.locator('input[type=\"file\"]')") &&
    fileChooserHelper.includes("isReadySingleFileInputState") &&
    fileChooserHelper.includes('state.tagName === "INPUT"') &&
    fileChooserHelper.includes('state.type === "file"') &&
    fileChooserHelper.includes("state.disabled === false") &&
    fileChooserHelper.includes("state.multiple === false") &&
    fileChooserHelper.includes('scrollIntoView({ block: "center", behavior: "auto" })') &&
    fileChooserHelper.includes('waitForEvent("filechooser", {') &&
    fileChooserHelper.indexOf("attempt <= 3") <
      fileChooserHelper.indexOf('waitForEvent("filechooser", {') &&
    fileChooserHelper.includes("const clickPromise = locator.click") &&
    fileChooserHelper.includes("await Promise.allSettled([") &&
    fileChooserHelper.includes(
      '!isTransientFileChooserInteractionError(clickResult.reason)',
    ) &&
    fileChooserHelper.includes(
      "/^(?:Error: )?Timed out after \\d+ms waiting for file chooser\\.?$/",
    ) &&
    fileChooserHelper.includes(
      'message.includes("Unable to translate Input.dispatchMouseEvent")',
    ) &&
    fileChooserHelper.includes(
      "/^No element found at point .+ waiting on click selector .+$/",
    ) &&
    fileChooserHelper.includes(
      "attemptErrors.every(isTransientFileChooserInteractionError)",
    ) &&
    fileChooserHelper.includes("waitForTimeout(300)") &&
    fileChooserHelper.includes("setFiles(path, { timeoutMs: 10000 })") &&
    fileChooserHelper.includes(
      'String(input.value).replace(/^.*[\\\\/]/, "")',
    ) &&
    fileChooserHelper.includes("state?.multiple === false") &&
    fileChooserHelper.includes(
      "state.selectedFileName === expectedFileName",
    ) &&
    fileChooserHelper.includes("selectedState.multiple !== false") &&
    fileChooserHelper.includes(
      "selectedState.selectedFileName !== expectedFileName",
    ) &&
    !fileChooserHelper.includes("input.files") &&
    fileChooserHelper.includes("lastInputState") &&
    fileChooserHelper.includes("lastTransientErrors") &&
    !fileChooserHelper.includes("setInputFiles") &&
    (harness.match(/waitForEvent\("filechooser"/g) ?? []).length === 1 &&
    fieldOperationsWorkflowSource.includes(
      "'xpath=//*[@data-testid=\"field-photo-file-input\"]/ancestor::label[1]'",
    ) &&
    fieldOperationsWorkflowSource.includes(
      "invalidPhotoPath,\n      \"field invalid photo chooser\"",
    ),
  "Browser file uploads use at most three fresh chooser-only attempts with exact transient handling, safe input diagnostics, and selected basename proof",
);
assert(
  harness.includes('"lead_accountability_events",\n      "operation_key",\n      runMarker') &&
    harness.includes('"lead_accountability_events",\n      "lead_id",\n      leadIds') &&
    harness.includes('"lead_accountability_events",\n      "lead_accountability_id",\n      leadAccountabilityIds') &&
    harness.indexOf('"lead_accountability_events",\n    "id",\n    accountabilityEvents.map') <
      harness.indexOf('"lead_accountability",\n    "id",\n    leadAccountabilityIds') &&
    harness.indexOf('"lead_accountability",\n    "id",\n    leadAccountabilityIds') <
      harness.indexOf('"lead_intake_records",\n    "id"') &&
    harness.includes('"marketing_accountability_operation_receipts",\n      "campaign_id",\n      marketingCampaignIds') &&
    harness.includes('"marketing_accountability_operation_receipts",\n      "spend_id",\n      marketingSpendIds') &&
    harness.indexOf('"marketing_accountability_operation_receipts",\n    "id",\n    marketingOperationReceipts.map') <
      harness.indexOf('await deleteByIds(env, "marketing_spend_months", "id", marketingSpendIds)') &&
    harness.indexOf('await deleteByIds(env, "marketing_spend_months", "id", marketingSpendIds)') <
      harness.indexOf('await deleteByIds(env, "marketing_campaigns", "id", marketingCampaignIds)') &&
    harness.indexOf('await deleteByIds(env, "marketing_campaigns", "id", marketingCampaignIds)') <
      harness.indexOf('await deleteByIds(env, "leads", "id", leadIds)'),
  "Accountability cleanup discovers exact lead-owned rows and linked marketing receipts, then deletes immutable events, current state, receipts, spend, and campaigns in dependency-safe order",
);
assert(
  harness.includes('enabledGroups.has("crm-accountability")') &&
    harness.includes("testMarketingAccountabilityWorkflow(") &&
    harness.includes('data-testid="sales-pipeline-opportunity-row"') &&
    harness.includes('[data-testid="lead-accountability-panel"]') &&
    harness.includes('[data-testid="lead-attribution-review-submit"]') &&
    harness.includes("browser attribution review persistence") &&
    harness.includes('[data-testid="lead-owner-submit"]') &&
    harness.includes("browser lead owner persistence") &&
    harness.includes('[data-testid="lead-first-response-submit"]') &&
    harness.includes("browser human response without first-touch overwrite") &&
    harness.includes('[data-testid="lead-won-submit"]') &&
    harness.includes("browser won outcome persistence") &&
    harness.includes('[data-testid="lead-lost-submit"]') &&
    harness.includes("browser structured lost outcome persistence"),
  "Targeted accountability browser coverage reviews and locks first touch, assigns an explicit owner, records human contact, and verifies won/lost outcomes through signed-in UI actions",
);
assert(
  harness.includes('[data-testid="marketing-accountability-workspace"]') &&
    harness.includes('[data-testid="marketing-accountability-company-filter"]') &&
    harness.includes('[data-testid="marketing-accountability-month-filter"]') &&
    harness.includes('[data-testid="marketing-accountability-source-filter"]') &&
    harness.includes('[data-testid="marketing-campaign-submit"]') &&
    harness.includes("browser campaign persistence") &&
    harness.includes('[data-testid="marketing-spend-submit"]') &&
    harness.includes("browser spend persistence") &&
    harness.includes('[data-testid="marketing-metric-spend"]') &&
    harness.includes('[data-testid="marketing-metric-workflow-linkage-gaps"]') &&
    harness.includes('[data-testid="marketing-metric-data-gaps"]') &&
    harness.includes('row.getAttribute("data-company-id") === companyId'),
  "Accountability browser coverage records owner-approved campaign/spend, renders filtered metrics and quality gaps, and proves WeatherTech/IHC dashboard row isolation",
);
const accountabilityWorkflowStart = harness.indexOf(
  "async function testMarketingAccountabilityWorkflow",
);
const accountabilityWorkflowEnd = harness.indexOf(
  "async function testCalendarScreen",
  accountabilityWorkflowStart,
);
const accountabilityWorkflow = harness.slice(
  accountabilityWorkflowStart,
  accountabilityWorkflowEnd,
);
const salesPipelineStart = crmApp.indexOf("function SalesPipelineView");
const salesPipelineEnd = crmApp.indexOf("function LeadIntakeView", salesPipelineStart);
const salesPipelineSource = crmApp.slice(salesPipelineStart, salesPipelineEnd);
const normalizedSalesPipelineSource = salesPipelineSource.replace(/\s+/g, " ");
const ownerHandlerStart = salesPipelineSource.indexOf(
  "const handleAssignOpportunityOwner = async (",
);
const genericActionHandlerStart = salesPipelineSource.indexOf(
  "const executeAccountabilityAction = async (",
);
const genericActionHandlerEnd = salesPipelineSource.indexOf(
  "const handleAttributionReview = async (",
  genericActionHandlerStart,
);
const ownerHandlerSource = salesPipelineSource.slice(
  ownerHandlerStart,
  genericActionHandlerStart,
);
const genericActionHandlerSource = salesPipelineSource.slice(
  genericActionHandlerStart,
  genericActionHandlerEnd,
);
assert(
  normalizedSalesPipelineSource.includes(
    "const isWaitingForAccountabilityReload = Boolean( pendingAccountabilityReload && selectedOpportunity?.id === pendingAccountabilityReload.leadId && (!selectedOpportunityAccountability || selectedOpportunityAccountability.record_version < pendingAccountabilityReload.recordVersion), );",
  ) &&
    normalizedSalesPipelineSource.includes(
      "const isAccountabilityActionBusy = isApplyingAccountabilityAction || isWaitingForAccountabilityReload;",
    ) &&
    normalizedSalesPipelineSource.includes(
      "selectedOpportunityAccountability.record_version >= pendingAccountabilityReload.recordVersion ) { setPendingAccountabilityReload(null);",
    ),
  "Accountability actions remain busy on a stale selected snapshot and settle only when the matching lead reaches the pending RPC record version",
);
for (const [handlerLabel, handlerSource] of [
  ["owner assignment", ownerHandlerSource],
  ["lifecycle action", genericActionHandlerSource],
]) {
  const rpcResultIndex = handlerSource.indexOf(
    "const result = await applyLeadAccountabilityAction(",
  );
  const pendingVersionIndex = handlerSource.indexOf(
    "recordVersion: result.record_version",
    rpcResultIndex,
  );
  const reloadIndex = handlerSource.indexOf("await onReload();", pendingVersionIndex);
  const completionIndex = handlerSource.indexOf(
    "stableOperationKeys.complete(operationScope, operationToken);",
    reloadIndex,
  );
  const catchIndex = handlerSource.indexOf("} catch (currentError)", completionIndex);
  const clearPendingIndex = handlerSource.indexOf(
    "setPendingAccountabilityReload(null);",
    catchIndex,
  );
  assert(
    rpcResultIndex > -1 &&
      rpcResultIndex < pendingVersionIndex &&
      pendingVersionIndex < reloadIndex &&
      reloadIndex < completionIndex &&
      completionIndex < catchIndex &&
      catchIndex < clearPendingIndex,
    `Live ${handlerLabel} gates on the exact returned record version, completes its stable operation key only after reload, and clears the pending UI gate when reload fails`,
  );
}
for (const testId of [
  "lead-owner-submit",
  "lead-attribution-review-submit",
  "lead-first-response-submit",
  "lead-won-submit",
  "lead-lost-submit",
]) {
  const controlIndex = salesPipelineSource.indexOf(`data-testid="${testId}"`);
  assert(
    controlIndex > -1 &&
      salesPipelineSource
        .slice(controlIndex, controlIndex + 500)
        .includes("isAccountabilityActionBusy"),
    `${testId} remains disabled while an RPC result is waiting for snapshot version settlement`,
  );
}
assert(
  crmApp.includes("if (current?.fingerprint === fingerprint) {\n      return current;") &&
    ownerHandlerSource.indexOf("await onReload();") <
      ownerHandlerSource.indexOf(
        "stableOperationKeys.complete(operationScope, operationToken);",
      ) &&
    genericActionHandlerSource.indexOf("await onReload();") <
      genericActionHandlerSource.indexOf(
        "stableOperationKeys.complete(operationScope, operationToken);",
      ),
  "A reload failure leaves the same payload's stable operation token cached so the idempotent RPC can be retried",
);
const persistenceHelperStart = harness.indexOf(
  "async function clickEnabledUntilPersisted({",
);
const persistenceHelperEnd = harness.indexOf(
  "async function withAcceptedConfirm(",
  persistenceHelperStart,
);
const persistenceHelper = harness.slice(
  persistenceHelperStart,
  persistenceHelperEnd,
);
assert(
  persistenceHelperStart > -1 &&
    persistenceHelperEnd > persistenceHelperStart &&
    accountabilityWorkflow.includes(
      "lead_accountability?select=owner_user_id,record_version",
    ) &&
    accountabilityWorkflow.includes(
      'errorPrefix: "Lead owner assignment was refused"',
    ) &&
    persistenceHelper.includes(
      "[role=\"alert\"][aria-label=\"Error notification\"]",
    ) &&
    persistenceHelper.includes("visibleError?.trim()") &&
    persistenceHelper.includes("`${errorPrefix}: ${visibleError.trim()}`"),
  "Owner-assignment browser polling reports the live error notification immediately instead of hiding it behind a persistence timeout",
);
assert(
  accountabilityWorkflow.includes(
    "lead_accountability?select=outcome,lost_reason_code,lost_reason_notes,record_version",
  ) &&
    accountabilityWorkflow.includes(
      "const lostOutcome = await clickEnabledUntilPersisted({",
    ) &&
    accountabilityWorkflow.includes(
      "panelText.includes(`lost · version ${expected.recordVersion}`)",
    ) &&
    accountabilityWorkflow.includes("ownerButton?.disabled === false") &&
    accountabilityWorkflow.includes("Lost outcome and reason recorded.") &&
    accountabilityWorkflow.indexOf(
      "browser structured lost outcome persistence",
    ) < accountabilityWorkflow.indexOf(
      "lost accountability UI and snapshot settlement before Marketing navigation",
    ) &&
    accountabilityWorkflow.indexOf(
      "lost accountability UI and snapshot settlement before Marketing navigation",
    ) < accountabilityWorkflow.indexOf(
      "await enterMarketingAccountabilityWorkspace(tab, companies);",
    ) &&
    accountabilityWorkflow.indexOf(
      'await clickCompanyScope(tab, "WeatherTech Roofing LLC");',
      accountabilityWorkflow.indexOf(
        '"marketing dashboard and company-keyed forms IHC isolation"',
      ),
    ) > accountabilityWorkflow.indexOf(
      '"marketing dashboard and company-keyed forms IHC isolation"',
    ) &&
    accountabilityWorkflow.indexOf(
      'await clickCompanyScope(tab, "WeatherTech Roofing LLC");',
      accountabilityWorkflow.indexOf(
        '"marketing dashboard and company-keyed forms IHC isolation"',
      ),
    ) < accountabilityWorkflow.indexOf('await clickNav(tab, "Customers");'),
  "Accountability browser coverage waits for the exact lost record version and idle UI before bounded All-companies Marketing entry, then restores WeatherTech before Customer 360",
);
assert(
  crmApp.includes(
    'dashboardState?.requestKey === dashboardRequestKey\n      ? dashboardState.result\n      : null',
  ) &&
    crmApp.match(/setDashboardState\(null\);/g)?.length >= 4 &&
    crmApp.includes(
      "setDashboardState({ requestKey: dashboardRequestKey, result });",
    ) &&
    crmApp.includes("const metrics = dashboard?.metrics ?? null;"),
  "Marketing filters clear prior dashboard state and gate rendered metrics on the exact current company/month/source request key",
);
assert(
  crmApp.includes(
    'key={`campaign-form-${companyId}-${campaignEditId || "new"}`}',
  ) &&
    crmApp.includes(
      'key={`spend-form-${companyId}-${spendEditId || "new"}`}',
    ) &&
    crmApp.includes(
      '<input type="hidden" name="campaign_company_id" value={companyId} />',
    ) &&
    crmApp.includes(
      '<input type="hidden" name="spend_company_id" value={companyId} />',
    ) &&
    crmApp.includes(
      'setCampaignEditId("");\n    setSpendEditId("");\n    setCampaignSourceKey("website");\n    setSpendSourceKey("website");\n  }, [companyId]);',
    ),
  "Campaign/spend forms are keyed, company-bound, and reset edit/source state when the selected company changes",
);
assert(
  harness.includes('[data-testid="create-repeat-opportunity-button"]') &&
    harness.includes('[data-testid="repeat-opportunity-form"] select[name="repeat_property_id"]') &&
    harness.includes('[data-testid="repeat-opportunity-form"] select[name="repeat_service_type"]') &&
    harness.includes('[data-testid="repeat-opportunity-submit"]') &&
    harness.includes("browser repeat opportunity persistence") &&
    harness.includes('row.source_key === "repeat_customer"') &&
    harness.includes("row.company_id === companies.weatherTech.id"),
  "Customer 360 browser coverage creates and reads back one explicit same-company repeat-customer opportunity",
);
const leadsWorkflowSource = harness.slice(
  harness.indexOf("async function testLeadsWorkflow"),
  harness.indexOf("function canonicalJson"),
);
assert(
  leadsWorkflowSource.includes("const accountableStageState") &&
    leadsWorkflowSource.includes("accountableStageState.disabled") &&
    leadsWorkflowSource.includes('accountableStageState.value !== "new_lead"') &&
    leadsWorkflowSource.includes('lead?.pipeline_stage === "new_lead"') &&
    leadsWorkflowSource.includes('lead.status === "new"') &&
    leadsWorkflowSource.includes('select[@name="priority"]') &&
    leadsWorkflowSource.includes('textarea[@name="notes"]') &&
    !leadsWorkflowSource.includes('"lead pipeline stage"'),
  "CRM Leads browser coverage treats every future lead as accountable, preserves its audited stage, and updates only non-funnel operational fields",
);
const salesPipelineWorkflowSource = harness.slice(
  harness.indexOf("async function testSalesPipelineWorkflow"),
  harness.indexOf("async function testLeadIntakeWorkspace"),
);
assert(
  salesPipelineWorkflowSource.includes("const initialAccountableStage") &&
    salesPipelineWorkflowSource.includes("initialAccountableStage.disabled") &&
    salesPipelineWorkflowSource.includes('[data-testid="lead-owner-submit"]') &&
    salesPipelineWorkflowSource.includes(
      'ownerSelect?.value === "me" && ownerSubmit?.disabled === false',
    ) &&
    salesPipelineWorkflowSource.includes(
      'persistenceLabel: "accountable opportunity owner assignment"',
    ) &&
    salesPipelineWorkflowSource.includes(
      'errorPrefix: "Opportunity owner assignment was refused"',
    ) &&
    salesPipelineWorkflowSource.includes(
      '[data-testid="lead-first-response-submit"]',
    ) &&
    salesPipelineWorkflowSource.includes(
      'persistenceLabel: "accountable opportunity human contact"',
    ) &&
    salesPipelineWorkflowSource.includes(
      'errorPrefix: "Opportunity human contact was refused"',
    ) &&
    salesPipelineWorkflowSource.includes(
      'accountabilityRows[0]?.owner_user_id === assignedAccountability.owner_user_id',
    ) &&
    salesPipelineWorkflowSource.includes(
      'accountabilityRows[0]?.first_response_channel === "phone"',
    ) &&
    salesPipelineWorkflowSource.includes('row?.pipeline_stage === "contacted"') &&
    salesPipelineWorkflowSource.includes('finalAccountability?.outcome !== "open"') &&
    salesPipelineWorkflowSource.includes("draftWorkflowDidNotFabricateSale: true") &&
    !salesPipelineWorkflowSource.includes('"opportunity stage"'),
  "Sales Pipeline browser coverage retries enabled audited owner/contact actions until exact persistence, surfaces visible errors, keeps direct stage editing disabled, and proves draft estimates/jobs do not fabricate a sale",
);
const estimatesWorkflowSource = harness.slice(
  harness.indexOf("async function testEstimatesWorkflow"),
  harness.indexOf("async function testQuickActionsDoNotOverlap"),
);
assert(
  estimatesWorkflowSource.includes("await clickEnabledUntilPersisted({") &&
    estimatesWorkflowSource.includes("locator: estimateSubmit") &&
    estimatesWorkflowSource.includes('clickLabel: "Create estimate"') &&
    estimatesWorkflowSource.includes(
      'persistenceLabel: "created estimate persistence"',
    ) &&
    estimatesWorkflowSource.includes(
      'readPersisted: () => findEstimateByTitle(env, estimateTitle)',
    ) &&
    estimatesWorkflowSource.includes(
      'errorPrefix: "Estimate creation was refused"',
    ) &&
    estimatesWorkflowSource.includes(
      'button[aria-label="Dismiss error notification"]',
    ) &&
    estimatesWorkflowSource.includes(
      '"missing-customer estimate validation dismissal"',
    ) &&
    estimatesWorkflowSource.includes(
      '"valid estimate associations and idle submit after negative validation"',
    ) &&
    estimatesWorkflowSource.includes(
      "companySelect?.value === expected.companyId",
    ) &&
    estimatesWorkflowSource.includes(
      "customerSelect?.value === expected.customerId",
    ) &&
    estimatesWorkflowSource.includes(
      "selectedCustomer?.textContent?.trim() === expected.customerName",
    ) &&
    estimatesWorkflowSource.includes("leadSelect?.value === expected.leadId") &&
    estimatesWorkflowSource.includes("submit?.disabled === false") &&
    estimatesWorkflowSource.includes("!visibleError") &&
    estimatesWorkflowSource.indexOf(
      "missing-customer estimate validation dismissal",
    ) < estimatesWorkflowSource.indexOf(
      "valid estimate associations and idle submit after negative validation",
    ) &&
    estimatesWorkflowSource.indexOf(
      "valid estimate associations and idle submit after negative validation",
    ) < estimatesWorkflowSource.indexOf("const savedEstimate ="),
  "Estimate browser coverage dismisses the expected negative alert, proves exact valid associations and an idle submit, then retries only until exact persistence while surfacing new live errors",
);
const leadIntakeWorkspaceSource = harness.slice(
  harness.indexOf("async function testLeadIntakeWorkspace"),
  harness.indexOf("async function testIdentityReconciliationWorkflow"),
);
assert(
  leadIntakeWorkspaceSource.includes('select[@name="source"]') &&
    leadIntakeWorkspaceSource.includes('"manual"') &&
    leadIntakeWorkspaceSource.includes('createdLead.pipeline_stage !== "new_lead"') &&
    leadIntakeWorkspaceSource.includes('createdLead.status !== "new"') &&
    !leadIntakeWorkspaceSource.includes('select[@name="pipeline_stage"]'),
  "Lead Intake browser coverage selects a canonical acquisition source and leaves new funnel state untouched until audited human contact",
);
const reconciliationWorkflowSource = harness.slice(
  harness.indexOf("async function testIdentityReconciliationWorkflow"),
  harness.indexOf("async function testCustomersWorkflow"),
);
assert(
  harness.includes("async function recordExactFixtureHumanContact") &&
    harness.includes('"rpc/wtos_apply_lead_accountability_action"') &&
    harness.includes("expected_version: 1") &&
    reconciliationWorkflowSource.includes('status: "new"') &&
    reconciliationWorkflowSource.includes('pipeline_stage: "new_lead"') &&
    reconciliationWorkflowSource.includes(
      "for (const lead of insertedReconciliationLeads)",
    ) &&
    reconciliationWorkflowSource.includes("recordExactFixtureHumanContact") &&
    reconciliationWorkflowSource.includes("contactedReconciliationLeads") &&
    reconciliationWorkflowSource.includes(
      "Audited CRM identity fixtures did not refetch as exact contacted leads",
    ),
  "CRM identity browser fixtures insert invariant-safe new leads, record exact audited contact events, and refetch fresh contacted versions before review",
);
const customersWorkflowSource = harness.slice(
  harness.indexOf("async function testCustomersWorkflow"),
  harness.indexOf("async function testEstimatesWorkflow"),
);
assert(
  customersWorkflowSource.includes(
    '"updated customer snapshot and idle UI before duplicate protection"',
  ) &&
    customersWorkflowSource.includes(
      'profileSection?.querySelector("h3")?.textContent?.trim() === expected.name',
    ) &&
    customersWorkflowSource.includes("sectionText.includes(expected.contact)") &&
    customersWorkflowSource.includes("sectionText.includes(expected.phone)") &&
    customersWorkflowSource.includes("sectionText.includes(expected.email)") &&
    customersWorkflowSource.includes("sectionText.includes(expected.address)") &&
    customersWorkflowSource.includes("saveButton?.disabled === false") &&
    customersWorkflowSource.includes("Customer updated.") &&
    customersWorkflowSource.indexOf(
      "updated customer snapshot and idle UI before duplicate protection",
    ) < customersWorkflowSource.indexOf('"duplicate customer company"') &&
    customersWorkflowSource.indexOf('"duplicate customer company"') <
      customersWorkflowSource.indexOf('"duplicate customer protection"'),
  "Customer duplicate coverage waits for the exact refreshed profile, normalized identity fields, success notice, and idle save control before exercising duplicate detection",
);
const websiteMarketingWorkflowSource = harness.slice(
  harness.indexOf("async function testWebsiteMarketingFoundation"),
  harness.indexOf("function phoenixYearMonth"),
);
const marketingEntryHelperSource = harness.slice(
  harness.indexOf("async function enterMarketingAccountabilityWorkspace"),
  harness.indexOf("function phoenixYearMonth"),
);
assert(
  websiteMarketingWorkflowSource.includes(
    '[data-testid="marketing-accountability-workspace"]',
  ) &&
    websiteMarketingWorkflowSource.includes(
      "verified origin, funnel & manual spend",
    ) &&
    websiteMarketingWorkflowSource.includes(
      "kpi denominators include only leads with a phase 1 accountability record",
    ) &&
    websiteMarketingWorkflowSource.includes(
      "provider-readiness view for accounted website and yelp acquisition",
    ) &&
    !websiteMarketingWorkflowSource.includes("read-only operating view"),
  "Website & Marketing browser coverage waits on the current accountability-plus-provider foundation instead of retired pre-sprint copy",
);
assert(
  marketingEntryHelperSource.includes("attempt <= 2") &&
    marketingEntryHelperSource.includes('await clickCompanyScope(tab, "All companies")') &&
    marketingEntryHelperSource.includes('await clickNav(tab, "Marketing Accountability")') &&
    marketingEntryHelperSource.includes('header button[aria-pressed="true"]') &&
    marketingEntryHelperSource.includes('nav button[aria-current="page"]') &&
    marketingEntryHelperSource.includes('[data-testid="website-marketing-foundation"]') &&
    marketingEntryHelperSource.includes('[data-testid="marketing-accountability-workspace"]') &&
    marketingEntryHelperSource.includes('[data-testid="marketing-accountability-company-filter"]') &&
    marketingEntryHelperSource.includes("companies.weatherTech.id, companies.ihc.id") &&
    marketingEntryHelperSource.includes("selectedHeaderScopes") &&
    marketingEntryHelperSource.includes("hasShell") &&
    marketingEntryHelperSource.includes("isLoading") &&
    marketingEntryHelperSource.includes("isPreparing") &&
    marketingEntryHelperSource.includes("activeNav") &&
    marketingEntryHelperSource.includes("visibleError"),
  "Marketing Accountability entry permits only two exact All-companies navigation attempts and requires settled scope, active nav, both workspaces, both company options, and structured terminal diagnostics",
);
const inspectionsWorkflowSource = harness.slice(
  harness.indexOf("async function testInspectionsWorkflow"),
  harness.indexOf("async function runUiMutationTests"),
);
assert(
  inspectionsWorkflowSource.indexOf('[data-testid="inspections-search"]') <
    inspectionsWorkflowSource.indexOf(
      'getByRole("button", { name: "New inspection" })',
    ) &&
    inspectionsWorkflowSource.indexOf(
      'getByRole("button", { name: "New inspection" })',
    ) < inspectionsWorkflowSource.indexOf('"new inspection form"') &&
    inspectionsWorkflowSource.includes("Create site inspection"),
  "Inspections browser coverage first proves the workspace, then explicitly opens and waits for the new-inspection form regardless of existing records",
);
assert(
  inspectionsWorkflowSource.includes(
    'const inspectionPhotoSubmitSelector =\n      \'[data-testid="inspection-photo-submit"]\';',
  ) &&
    inspectionsWorkflowSource.includes(
      'scrollSelectorIntoView(\n      tab,\n      inspectionPhotoSubmitSelector,',
    ) &&
    inspectionsWorkflowSource.includes(
      'button.scrollIntoView({ block: "center", behavior: "auto" })',
    ) &&
    inspectionsWorkflowSource.includes(
      '"upload secure inspection photo",\n      { retryTransientClick: true }',
    ),
  "Inspection photo coverage centers the exact submit control and retries only transient click translation failures",
);
assert(
  inspectionsWorkflowSource.includes("attempt <= 2") &&
    inspectionsWorkflowSource.includes("const inspectionBeforeAttempt =") &&
    inspectionsWorkflowSource.includes(
      "inspectionBeforeAttempt?.id !== savedInspection.id",
    ) &&
    inspectionsWorkflowSource.includes(
      'inspectionBeforeAttempt.status === "canceled"',
    ) &&
    inspectionsWorkflowSource.includes("cancelConfirmSelector") &&
    inspectionsWorkflowSource.includes("lastCancelState.dialogCount !== 1") &&
    inspectionsWorkflowSource.includes("lastCancelState.buttonCount !== 1") &&
    inspectionsWorkflowSource.includes("lastCancelState.buttonInDialog") &&
    inspectionsWorkflowSource.includes("await clickVisibleDomButtonByText(") &&
    inspectionsWorkflowSource.includes('"Confirm cancel"') &&
    inspectionsWorkflowSource.includes(
      "expectedActivationTimeout",
    ) &&
    inspectionsWorkflowSource.includes(
      "error.message.startsWith(expectedActivationTimeout)",
    ) &&
    inspectionsWorkflowSource.includes("lastCancelActivationError") &&
    inspectionsWorkflowSource.includes("lastCancelState.buttonEnabled") &&
    inspectionsWorkflowSource.includes(
      'lastCancelState.buttonText !== "Confirm cancel"',
    ) &&
    inspectionsWorkflowSource.includes("lastCancelState.errorText") &&
    inspectionsWorkflowSource.includes(
      "`inspection canceled persistence attempt ${attempt}`",
    ) &&
    inspectionsWorkflowSource.includes("expectedId: savedInspection.id") &&
    inspectionsWorkflowSource.includes("hasSavingButton") &&
    inspectionsWorkflowSource.includes("noticeText") &&
    inspectionsWorkflowSource.includes("errorText") &&
    inspectionsWorkflowSource.indexOf("if (!canceledInspection)") <
      inspectionsWorkflowSource.indexOf(
        'document.body.innerText.includes("Inspection canceled.")',
      ) &&
    inspectionsWorkflowSource.includes('"canceled inspections filter"') &&
    inspectionsWorkflowSource.includes('"inspection restored persistence"'),
  "Inspection cancellation performs at most two exact dialog-scoped visible-coordinate activations, pre-reads and preserves the exact row identity, retries only from a safe dialog state, and retains notice/filter/restore proof with terminal diagnostics",
);
for (const testId of [
  "marketing-accountability-workspace",
  "marketing-accountability-company-filter",
  "marketing-accountability-month-filter",
  "marketing-accountability-source-filter",
  "marketing-accountability-source-table",
  "marketing-accountability-source-row",
  "marketing-metric-lead-count",
  "marketing-metric-spend",
  "marketing-metric-cost-per-lead",
  "marketing-metric-booking-rate",
  "marketing-metric-inspection-rate",
  "marketing-metric-closing-rate",
  "marketing-metric-cost-per-sold-job",
  "marketing-metric-revenue",
  "marketing-metric-roas",
  "marketing-metric-awaiting-contact",
  "marketing-metric-unsold-follow-up",
  "marketing-metric-unattributed",
  "marketing-metric-coverage",
  "marketing-metric-missing-won-value",
  "marketing-metric-data-gaps",
  "marketing-metric-workflow-linkage-gaps",
  "marketing-campaign-form",
  "marketing-campaign-edit-select",
  "marketing-campaign-submit",
  "marketing-spend-form",
  "marketing-spend-edit-select",
  "marketing-spend-submit",
  "lead-accountability-panel",
  "lead-attribution-review-form",
  "lead-attribution-review-submit",
  "lead-owner-select",
  "lead-owner-submit",
  "lead-first-response-channel",
  "lead-first-response-submit",
  "lead-won-form",
  "lead-won-record-id",
  "lead-won-value",
  "lead-won-basis",
  "lead-won-submit",
  "lead-lost-form",
  "lead-lost-reason",
  "lead-lost-notes",
  "lead-lost-submit",
  "create-repeat-opportunity-button",
  "repeat-opportunity-form",
  "repeat-opportunity-submit",
]) {
  assert(
    crmApp.includes(`\"${testId}\"`),
    `CRM accountability UI preserves the stable ${testId} browser contract`,
  );
}
for (const fieldName of [
  "source",
  "source_detail",
  "campaign_id",
  "estimated_value",
  "attribution_source_key",
  "attribution_source_detail",
  "intake_provider",
  "review_status",
  "review_reason_code",
  "first_response_channel",
  "won_record_id",
  "won_contract_value",
  "won_value_basis",
  "lost_reason_code",
  "lost_reason_notes",
  "campaign_company_id",
  "campaign_source_key",
  "campaign_source_detail",
  "campaign_intake_provider",
  "campaign_vendor_key",
  "campaign_vendor_name",
  "campaign_key",
  "campaign_name",
  "campaign_external_id",
  "campaign_starts_on",
  "campaign_ends_on",
  "campaign_is_active",
  "spend_company_id",
  "spend_month",
  "spend_source_key",
  "spend_source_detail",
  "spend_vendor_key",
  "spend_vendor_name",
  "spend_campaign_id",
  "spend_amount",
  "spend_notes",
  "repeat_property_id",
  "repeat_service_type",
  "repeat_priority",
  "repeat_next_follow_up",
  "repeat_notes",
]) {
  assert(
    crmApp.includes(`name=\"${fieldName}\"`) ||
      crmApp.includes(`\"${fieldName}\"`),
    `CRM accountability UI preserves the stable ${fieldName} field contract`,
  );
}
assert(
  crmApp.includes('requestedSource === "repeat_customer"') &&
    crmApp.includes("Repeat-customer attribution is created only from Customer 360") &&
    crmApp.includes('eventType: "appointment_scheduled"') &&
    crmApp.includes("occurredAt: record.created_at"),
  "UI/demo behavior reserves repeat attribution for Customer 360 and dates booked appointments from authoritative creation time",
);
assert(
  harness.includes('enabledGroups.has("crm-reconciliation")') &&
    harness.includes("testIdentityReconciliationWorkflow(") &&
    harness.includes('[data-testid="identity-reconciliation-case"][data-state="ambiguous"]') &&
    harness.includes("replayAuditedReconciliationAsOwner(env, auditEvent)") &&
    harness.includes('status: "duplicate"') &&
    harness.includes("same durable result as a duplicate") &&
    harness.includes("Identity approval changed the lead status or pipeline stage") &&
    harness.includes("single reconciliation audit event"),
  "Targeted browser coverage proves reviewed approval, ambiguity refusal, authenticated audited-retry idempotency, auditability, and status preservation",
);
assert(
  !harness.includes("window.fetch") &&
    !harness.includes("window.crypto") &&
    !harness.includes("__wtosIdentityReconciliationRpcTracker") &&
    harness.includes("const REGRESSION_OWNER_REQUEST_TIMEOUT_MS = 20_000") &&
    harness.includes("signal: AbortSignal.timeout(REGRESSION_OWNER_REQUEST_TIMEOUT_MS)") &&
    harness.includes("guardedRegressionOwnerFetch(") &&
    harness.includes('"crm_identity_reconciliation_events",\n    "source_lead_id",\n    leadIds') &&
    harness.indexOf("reconciliationEventsByLead") <
      harness.indexOf('await deleteByIds(env, "leads", "id", leadIds)'),
  "Browser reconciliation uses supported clicks, bounded guarded owner requests, and exact run-owned lead cleanup",
);
assert(
  harness.includes("Unlinked estimate action") &&
    harness.includes("Unlinked job action") &&
    harness.includes("assertNoImplicitCustomerOrWorkflowWrite") &&
    harness.includes("explicitIdentityApproval: true") &&
    harness.includes("unlinkedWritesRefused: true"),
  "Sales Pipeline browser coverage refuses implicit customer/workflow writes before explicit identity approval",
);

console.log("Browser regression production-isolation guard: PASS");
