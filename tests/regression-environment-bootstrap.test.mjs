import assert from "node:assert/strict";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  REGRESSION_OWNER_MARKER,
  REGRESSION_SUPABASE_PROJECT_REF,
  REQUIRED_DISABLED_SIDE_EFFECT_FLAGS,
  assertOwnedRegressionUser,
  assertZeroCounts,
  validateRegressionEnvironment,
} from "../scripts/regression-environment.mjs";

function jwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: `https://${REGRESSION_SUPABASE_PROJECT_REF}.supabase.co`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: REGRESSION_SUPABASE_PROJECT_REF }),
  SUPABASE_SERVICE_ROLE_KEY: jwt({
    role: "service_role",
    ref: REGRESSION_SUPABASE_PROJECT_REF,
  }),
  WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF: REGRESSION_SUPABASE_PROJECT_REF,
  WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED: "true",
  WTOS_REGRESSION_OWNER_EMAIL: "weathertech-os-regression@example.test",
  WTOS_REGRESSION_OWNER_PASSWORD: "synthetic-test-password-123",
};

const config = validateRegressionEnvironment(baseEnv);
assert.equal(config.projectRef, REGRESSION_SUPABASE_PROJECT_REF);
assert.equal(config.ownerEmail, "weathertech-os-regression@example.test");

assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` }),
  /approved project|Production Supabase/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF: PRODUCTION_SUPABASE_PROJECT_REF }),
  /Production Supabase/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED: "false" }),
  /must be exactly true/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_REGRESSION_OWNER_EMAIL: "owner@weathertech.example" }),
  /synthetic.*example\.test/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, WTOS_REGRESSION_OWNER_PASSWORD: "too-short" }),
  /at least 16/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "anon" }) }),
  /service-role credential/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, SUPABASE_SERVICE_ROLE_KEY: jwt({ role: "service_role", ref: "another-project" }) }),
  /different project/,
);
assert.throws(
  () => validateRegressionEnvironment({ ...baseEnv, NEXT_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: "anon", ref: "another-project" }) }),
  /different project/,
);

for (const flag of REQUIRED_DISABLED_SIDE_EFFECT_FLAGS) {
  assert.throws(
    () => validateRegressionEnvironment({ ...baseEnv, [flag]: "true" }),
    new RegExp(flag),
  );
}

const markedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: config.ownerEmail,
  app_metadata: {
    wt_os_regression_marker: REGRESSION_OWNER_MARKER,
    wt_os_regression_project_ref: REGRESSION_SUPABASE_PROJECT_REF,
  },
};
assert.equal(assertOwnedRegressionUser(markedUser, config), markedUser);
assert.throws(
  () => assertOwnedRegressionUser({ ...markedUser, app_metadata: {} }, config),
  /refusing to adopt or delete/,
);
assert.doesNotThrow(() => assertZeroCounts({ one: 0, two: 0 }, "test counts"));
assert.throws(() => assertZeroCounts({ one: 1, two: 0 }, "test counts"), /one=1/);

const source = await import("node:fs").then(({ readFileSync }) =>
  readFileSync(new URL("../scripts/regression-environment.mjs", import.meta.url), "utf8"),
);
const regressionSafetySource = await import("node:fs").then(({ readFileSync }) =>
  readFileSync(
    new URL("../lib/deployment/regressionSafety.ts", import.meta.url),
    "utf8",
  ),
);
const repositoryValidationSource = await import("node:fs").then(({ readFileSync }) =>
  readFileSync(
    new URL("../.github/workflows/repository-validation.yml", import.meta.url),
    "utf8",
  ),
);
const lifecycleJobSource = repositoryValidationSource.slice(
  repositoryValidationSource.indexOf("  regression-environment-lifecycle:"),
);
const lifecycleInstallIndex = lifecycleJobSource.indexOf(
  "      - name: Install locked dependencies\n        run: npm ci",
);
const lifecycleExecutionIndex = lifecycleJobSource.indexOf(
  "      - name: Verify target, bootstrap identity, and prove zero-residue lifecycle",
);
assert.ok(
  lifecycleInstallIndex >= 0 &&
    lifecycleExecutionIndex > lifecycleInstallIndex,
  "The isolated lifecycle job installs locked dependencies before executing the Supabase lifecycle",
);
const regressionSafetyFlagBlock = regressionSafetySource.slice(
  regressionSafetySource.indexOf("REGRESSION_SIDE_EFFECT_FLAGS"),
  regressionSafetySource.indexOf("] as const"),
);
const browserServerSafetyFlags = [
  ...regressionSafetyFlagBlock.matchAll(/'([A-Z][A-Z0-9_]+)'/g),
].map((match) => match[1]);
assert.deepEqual(
  [...browserServerSafetyFlags].sort(),
  [...REQUIRED_DISABLED_SIDE_EFFECT_FLAGS].sort(),
  "Browser/server and lifecycle side-effect gate inventories stay identical",
);
assert.match(source, /command: "lifecycle-probe"/);
assert.match(source, /const id = randomUUID\(\)/);
assert.match(source, /restDeleteExactId\(config, fetchImpl, "notifications", id\)/);
assert.match(source, /exactIdCleanupVerified: true/);
assert.match(
  source,
  /jobPhotoStorageLifecycleProbe\(config, fetchImpl, companies\)/,
  "Hosted lifecycle executes the private job-photo security probe on the guarded regression target",
);
assert.match(
  source,
  /property_address: "123 TEST Job Photo Regression Way, Phoenix, AZ"/,
  "Hosted lifecycle supplies the required synthetic job property address before secure photo validation",
);
assert.match(
  source,
  /jobPhotoBucket\.public !== false/,
  "Hosted lifecycle refuses a public job-photos bucket",
);
for (const expectedBoundary of [
  "WeatherTech-to-IHC upload",
  "IHC-to-WeatherTech upload",
  "Anonymous job-photo upload",
  "WeatherTech-to-IHC private download",
  "IHC-to-WeatherTech private download",
  "WeatherTech-to-IHC signed URL",
  "IHC-to-WeatherTech signed URL",
  "WeatherTech-to-IHC registered private update",
  "IHC-to-WeatherTech registered private update",
  "Anonymous registered private update",
  "WeatherTech-to-IHC metadata registration",
  "IHC-to-WeatherTech metadata registration",
]) {
  assert.match(
    source,
    new RegExp(expectedBoundary),
    `Hosted lifecycle proves company isolation at ${expectedBoundary}`,
  );
}
assert.match(
  source,
  /Private job photo remained retrievable through a durable public URL/,
  "Hosted lifecycle proves durable public object retrieval is denied",
);
assert.match(
  source,
  /Exact WeatherTech registration retry created duplicate metadata/,
  "Hosted lifecycle proves exact metadata retries converge",
);
assert.match(
  source,
  /Concurrent identical registration did not converge to one URL-free metadata row/,
  "Hosted lifecycle proves concurrent identical RPC retries converge to one URL-free row",
);
assert.match(
  source,
  /WeatherTech pre-registration private download/,
  "Hosted lifecycle proves an uploaded object remains unreadable before exact metadata registration",
);
assert.match(
  source,
  /WeatherTech pre-registration signed URL/,
  "Hosted lifecycle proves an uploaded object cannot be signed before exact metadata registration",
);
assert.match(
  source,
  /An unregistered job-photo object was visible in an authorized list/,
  "Hosted lifecycle proves an uploaded object remains unlistable before exact metadata registration",
);
assert.match(
  source,
  /Authorized job-photo signed URL did not preserve the requested short expiry bound/,
  "Hosted lifecycle validates signed-token expiry against the requested short TTL without waiting for expiry",
);
assert.match(
  source,
  /A refused registered-object update altered private photo bytes/,
  "Hosted lifecycle proves registered photo bytes remain immutable after own-company and cross-company update attempts",
);
assert.match(
  source,
  /\.remove\(\[ihcPath\]\)/,
  "Hosted lifecycle attempts WeatherTech-to-IHC delete and verifies the object remains",
);
assert.match(
  source,
  /\.remove\(\[weatherTechPath\]\)/,
  "Hosted lifecycle attempts IHC-to-WeatherTech delete and verifies the object remains",
);
assert.match(
  source,
  /Cancel before delayed-late upload/,
  "Hosted lifecycle durably tombstones an upload before exercising delayed transport",
);
assert.match(
  source,
  /Delayed-late Storage upload after cancellation/,
  "Hosted lifecycle proves delayed Storage INSERT is denied after cancellation wins",
);
assert.match(
  source,
  /Concurrent upload-cancel race left object or metadata residue/,
  "Hosted lifecycle races upload against cancel and requires a fully aborted zero-residue result",
);
assert.match(
  source,
  /Register-cancel race reached invalid state/,
  "Hosted lifecycle races register against cancel and accepts only committed or canceling terminal paths",
);
assert.match(
  source,
  /Aborted register-cancel race left an orphan or dangling metadata row/,
  "Hosted lifecycle proves the canceled registration race cannot leave an orphan or dangling row",
);
assert.match(
  source,
  /Aborted operation exact retry changed durable identity/,
  "Hosted lifecycle proves exact retries converge on one terminal aborted reservation",
);
assert.match(
  source,
  /Changed-fingerprint aborted reservation replay/,
  "Hosted lifecycle refuses a changed payload after terminal abort",
);
assert.match(
  source,
  /Revoked uploader exact reservation replay/,
  "Hosted lifecycle allows only the immutable uploader to recover an existing reservation after role revocation",
);
for (const revokedBoundary of [
  "Revoked uploader new reservation",
  "Revoked uploader new Storage upload",
  "Revoked uploader unregistered object read",
  "Revoked uploader unregistered object signed URL",
  "Revoked uploader metadata registration",
  "Revoked uploader cancellation of another operation",
  "Revoked uploader cross-company cancellation",
  "Revoked original-uploader recovery",
]) {
  assert.match(
    source,
    new RegExp(revokedBoundary),
    `Hosted lifecycle covers revoked-role boundary: ${revokedBoundary}`,
  );
}
assert.match(
  source,
  /Revoked original uploader did not finish an exact zero-object abort/,
  "Hosted lifecycle proves revoked-role recovery can only clean its own unregistered object",
);
assert.match(
  source,
  /Revoked uploader removed another user's or company's registered object/,
  "Hosted lifecycle proves recovery authority cannot delete another uploader's or company's registered object",
);
assert.match(
  source,
  /target_recovery_lease_token: recoveryLeaseToken/,
  "Hosted lifecycle binds every durable upload operation to an explicit browser recovery lease token",
);
assert.match(
  source,
  /Heartbeat active WeatherTech upload reservation/,
  "Hosted lifecycle heartbeats a live upload by replaying the exact operation and recovery token",
);
for (const leaseBoundary of [
  "Different-token active reservation heartbeat",
  "Different-token active recovery claim",
  "Prior-token heartbeat after lease recovery rotation",
]) {
  assert.match(
    source,
    new RegExp(leaseBoundary),
    `Hosted lifecycle requires PostgreSQL 55P03 at active lease boundary: ${leaseBoundary}`,
  );
}
assert.match(
  source,
  /List WeatherTech upload recoveries without PII/,
  "Hosted lifecycle lists only the current uploader's recoverable operations",
);
assert.match(
  source,
  /JSON\.stringify\(recoveryListKeys\)[\s\S]*?"company_id",[\s\S]*?"lease_expires_at",[\s\S]*?"state",[\s\S]*?"upload_operation_key",[\s\S]*?"uploader_user_id"/,
  "Hosted lifecycle permits only the five non-PII recovery-list fields",
);
for (const expiryBoundary of [
  "Authenticated recovery lease expiry",
  "Service-role recovery lease expiry with wrong uploader",
  "Service-role exact recovery lease expiry",
  "Service-role expiry of terminal recovery lease",
]) {
  assert.match(
    source,
    new RegExp(expiryBoundary),
    `Hosted lifecycle covers exact service-role lease-expiry boundary: ${expiryBoundary}`,
  );
}
assert.ok(
  source.indexOf("Service-role exact recovery lease expiry") <
      source.indexOf("Claim expired interrupted upload") &&
    source.indexOf("Claim expired interrupted upload") <
      source.indexOf("Promptly refuse claimed interrupted upload abort with residue") &&
    source.indexOf("Promptly refuse claimed interrupted upload abort with residue") <
      source.indexOf("Remove exact claimed interrupted upload object") &&
    source.indexOf("Remove exact claimed interrupted upload object") <
      source.indexOf("Confirm claimed interrupted upload abort"),
  "Hosted lifecycle expires an exact lease, claims recovery, proves prompt residue refusal, removes the exact object, then confirms abort",
);
assert.match(
  source,
  /Expired-lease recovery did not converge to an idempotent, unlisted, zero-object abort/,
  "Hosted lifecycle proves claimed recovery reaches an idempotent terminal state with no object or list residue",
);
assert.match(
  source,
  /const JOB_PHOTO_NONRETRYABLE_REFUSAL_MAX_MS = 10_000/,
  "Hosted lifecycle bounds deterministic residue refusal latency well below the PostgREST serialization retry window",
);
assert.match(
  source,
  /const requirePromptJobPhotoResidueRefusal = async \([\s\S]*?const startedAt = Date\.now\(\)[\s\S]*?requireSupabaseErrorCode\(await operation\(\), "P0001", label\)[\s\S]*?Date\.now\(\) - startedAt[\s\S]*?JOB_PHOTO_NONRETRYABLE_REFUSAL_MAX_MS/,
  "Hosted lifecycle requires exact non-retryable P0001 residue semantics and a prompt response",
);
assert.match(
  source,
  /const removeExactStorageObject = async \([\s\S]*?\.remove\(\[path\]\)[\s\S]*?removedObjects\.length !== 1[\s\S]*?removedObjects\[0\]\?\.name !== path[\s\S]*?await objectExists\(path\)/,
  "Hosted lifecycle accepts no empty or wrong-path Storage removal and proves service-role absence before confirmation",
);
assert.match(
  source,
  /const objectExists = async \(path\) => \{[\s\S]*?serviceClient\.storage\.from\(JOB_PHOTO_BUCKET\)\.exists\(path\)[\s\S]*?result\.data === true && !result\.error[\s\S]*?result\.data === false[\s\S]*?\[400, 404\]\.includes\(Number\(result\.error\.status\)\)[\s\S]*?if \(result\.error\)[\s\S]*?did not return a recognized boolean result/,
  "Privileged object existence accepts only exact success or the Storage SDK's explicit missing-object response and fails closed otherwise",
);
const ordinaryCancellationSource = source.slice(
  source.indexOf("const cancelRemoveAndConfirmAbort"),
  source.indexOf("const buildScenario"),
);
assert.ok(
  ordinaryCancellationSource.indexOf(
    "const hasExactObjectResidue = await objectExists(path)",
  ) < ordinaryCancellationSource.indexOf("requirePromptJobPhotoResidueRefusal(") &&
    ordinaryCancellationSource.includes(
      '() => client.rpc("wtos_confirm_job_photo_upload_abort", args)',
    ) &&
    ordinaryCancellationSource.indexOf("requirePromptJobPhotoResidueRefusal(") <
      ordinaryCancellationSource.indexOf("removeExactStorageObject(") &&
    ordinaryCancellationSource.indexOf("removeExactStorageObject(") <
      ordinaryCancellationSource.indexOf("retryExactSupabaseRpc("),
  "Ordinary cancellation proves exact residue refusal, removes and verifies the object, then confirms terminal abort",
);
assert.match(
  source,
  /requirePromptJobPhotoResidueRefusal\(\s*\(\) =>\s*weatherTechIdentity\.client\.rpc\(\s*"wtos_confirm_job_photo_upload_recovery_abort",\s*recoveryClaimArgs,[\s\S]*?removeExactStorageObject\(\s*weatherTechIdentity\.client,\s*interruptedRecovery\.path,[\s\S]*?retryExactSupabaseRpc\(\s*\(\) =>\s*weatherTechIdentity\.client\.rpc\(\s*"wtos_confirm_job_photo_upload_recovery_abort"/,
  "Recovery cancellation proves exact P0001 residue refusal before exact removal and terminal confirmation",
);
assert.match(
  source,
  /async function retryExactSupabaseRpc\([\s\S]*?maxAttempts = 3[\s\S]*?readConvergedResult[\s\S]*?setTimeout\(resolve, attempt \* 250\)/,
  "Hosted lifecycle bounds idempotent confirmation transport retries to three attempts with stable backoff",
);
assert.ok(
  source.indexOf("const convergedResult = await readConvergedResult()") <
      source.indexOf("setTimeout(resolve, attempt * 250)") &&
    source.includes('"wtos_begin_job_photo_upload",\n                args') &&
    source.includes('"wtos_claim_job_photo_upload_recovery",\n              recoveryClaimArgs'),
  "Hosted confirmation retry reads the exact durable operation or recovery state before sending duplicate confirmation traffic",
);
assert.match(
  source,
  /Remove exact job-photo lifecycle objects before metadata/,
  "Hosted lifecycle removes exact Storage objects before exact metadata cleanup",
);
assert.ok(
  source.indexOf("Remove exact job-photo lifecycle objects before metadata") <
      source.indexOf("Delete exact job-photo lifecycle metadata after Storage cleanup") &&
    source.indexOf("Delete exact job-photo lifecycle metadata after Storage cleanup") <
      source.indexOf("Delete exact job-photo upload operations after metadata cleanup"),
  "Hosted lifecycle cleanup removes Storage objects, metadata, then durable operation rows in dependency order",
);
assert.match(
  source,
  /Exact job-photo lifecycle cleanup left an upload operation behind/,
  "Hosted lifecycle independently proves zero durable upload-operation residue",
);
assert.match(
  source,
  /function createBrowserRegressionRunId\(now = new Date\(\)\)[\s\S]*?\^\[0-9\]\{17\}\$[\s\S]*?return runId/,
  "Job-photo lifecycle uses the canonical 17-digit Browser run identity required by guarded automation cleanup",
);
assert.match(
  source,
  /title: `TEST WTOS REGRESSION \$\{runId\} \$\{titleSuffix\}`/,
  "Every lifecycle job source carries the exact canonical Browser marker",
);
const lifecycleJobInsertSource = source.slice(
  source.indexOf('const weatherTechJob = await insertJob('),
  source.indexOf('const storageMarker = `test-wtos-regression-${runId}`'),
);
assert.ok(
  lifecycleJobInsertSource.indexOf('"WEATHERTECH PHOTO JOB"') <
    lifecycleJobInsertSource.indexOf('"IHC PHOTO JOB"'),
  "Lifecycle job inserts settle sequentially before any cleanup can begin",
);
assert.doesNotMatch(
  lifecycleJobInsertSource,
  /Promise\.all/,
  "A rejected lifecycle insert cannot leave a sibling source request in flight past cleanup",
);
const lifecycleAutomationCleanupSource = source.slice(
  source.indexOf("async function discoverJobPhotoLifecycleAutomationGraph"),
  source.indexOf("async function jobPhotoStorageLifecycleProbe"),
);
for (const completeGraphBoundary of [
  '"automation_events"',
  '"causation_event_id"',
  '"automation_executions"',
  '"automation_attempts"',
  '"automation_audit_events"',
  '"office_tasks"',
]) {
  assert.match(
    lifecycleAutomationCleanupSource,
    new RegExp(completeGraphBoundary),
    `Lifecycle cleanup discovers the complete source-qualified ${completeGraphBoundary} graph`,
  );
}
assert.match(
  lifecycleAutomationCleanupSource,
  /assertOwnedRegressionUser\([\s\S]*?findRegressionOwner\(config, fetchImpl\)[\s\S]*?wtos_cleanup_synthetic_automation_fixture/,
  "Lifecycle cleanup binds the existing guarded RPC to the exactly verified regression owner",
);
assert.match(
  lifecycleAutomationCleanupSource,
  /cleanupResult\?\.ok !== true[\s\S]*?cleanupResult\?\.status !== "cleaned"[\s\S]*?cleanupResult\?\.databaseResidueCount !== 0[\s\S]*?Object\.entries\(expectedCounts\)\.every/,
  "Lifecycle cleanup accepts only an exact sanitized count receipt with database zero",
);
assert.match(
  lifecycleAutomationCleanupSource,
  /exactResidueCount !== 0[\s\S]*?did not reach exact graph zero/,
  "Lifecycle cleanup independently proves every captured ledger ID is absent",
);
const jobPhotoLifecycleSource = source.slice(
  source.indexOf("async function jobPhotoStorageLifecycleProbe"),
  source.indexOf("async function lifecycleProbe"),
);
assert.ok(
  jobPhotoLifecycleSource.indexOf(
    "await cleanupJobPhotoLifecycleAutomationLedger",
  ) < jobPhotoLifecycleSource.indexOf(
    "await deleteExactJobPhotoLifecycleSources",
  ),
  "Lifecycle cleanup removes immutable automation evidence before deleting either source job",
);
assert.match(
  jobPhotoLifecycleSource,
  /if \(!automationLedgerCleanupVerified\)[\s\S]*?Refusing to delete job-photo lifecycle source jobs before exact automation-ledger cleanup succeeds/,
  "A failed or inexact guarded cleanup preserves source jobs for bounded recovery",
);
assert.match(
  source,
  /const JOB_PHOTO_SOURCE_DELETE_MAX_ATTEMPTS = 3/,
  "Lifecycle source deletion uses a fixed three-attempt bound",
);
const lifecycleSourceDeleteHelper = source.slice(
  source.indexOf("async function deleteExactJobPhotoLifecycleSources"),
  source.indexOf("async function jobPhotoStorageLifecycleProbe"),
);
assert.match(
  lifecycleSourceDeleteHelper,
  /\.from\("jobs"\)\.delete\(\)\.in\("id", exactSourceIds\)/,
  "Lifecycle source deletion is limited to the two captured exact job IDs",
);
assert.match(
  lifecycleSourceDeleteHelper,
  /\.from\("jobs"\)\.select\("id"\)\.in\("id", exactSourceIds\)/,
  "Every lifecycle source deletion attempt reads back only the same exact job IDs",
);
assert.match(
  lifecycleSourceDeleteHelper,
  /attempt <= JOB_PHOTO_SOURCE_DELETE_MAX_ATTEMPTS[\s\S]*?attempt \* 250[\s\S]*?did not reach zero after three attempts/,
  "Lifecycle source deletion retries with bounded backoff and fails closed without exact zero",
);
assert.match(
  source,
  /customerDocumentContract\(customerDocumentBucketBefore\)/,
  "Hosted lifecycle proves the customer-documents bucket contract is unchanged",
);
assert.match(source, /auth\/v1\/logout\?scope=local/);
assert.match(
  source,
  /\["crm_identity_reconciliation_events", "operation_key"\]/,
  "Reconciliation operation markers participate in zero-residue verification",
);
assert.match(
  source,
  /\["crm_identity_reconciliation_events", "actor_user_id"\]/,
  "The synthetic owner cannot be removed while reconciliation audit events reference it",
);
assert.match(
  source,
  /\["lead_accountability_events", "operation_key"\]/,
  "Lead-accountability operation markers participate in zero-residue verification",
);
assert.match(
  source,
  /\["job_photo_upload_operations", "file_path", "\*"\]/,
  "The isolated regression project requires zero durable job-photo upload operations",
);
assert.match(
  source,
  /\["marketing_accountability_operation_receipts", "operation_kind", "\*"\]/,
  "The isolated regression project requires zero durable marketing operation receipts",
);
assert.match(
  source,
  /\["marketing_campaigns", "campaign_name"\]/,
  "Marketing campaign markers participate in zero-residue verification",
);
assert.match(
  source,
  /\["marketing_spend_months", "notes"\]/,
  "Marketing-spend markers participate in zero-residue verification",
);
for (const ownerReference of [
  ["lead_accountability", "owner_user_id"],
  ["lead_accountability", "reviewed_by"],
  ["lead_accountability_events", "actor_user_id"],
  ["marketing_campaigns", "created_by"],
  ["marketing_spend_months", "entered_by"],
]) {
  assert.match(
    source,
    new RegExp(`\\["${ownerReference[0]}", "${ownerReference[1]}"\\]`),
    `Synthetic owner cleanup retains the ${ownerReference.join(".")} reference guard`,
  );
}
assert.match(
  source,
  /"mighty_apes_yelp_webhook_events"/,
  "Mighty Apes delivery evidence must be empty before isolated provider regression",
);
assert.match(
  source,
  /"delivery_id",\s+"TEST WTOS MIGHTY APES REGRESSION:\*"/,
  "Mighty Apes delivery markers participate in zero-residue verification",
);
assert.match(
  source,
  /"provider_lead_id",\s+"TEST WTOS MIGHTY APES REGRESSION:\*"/,
  "Mighty Apes provider-lead markers participate in zero-residue verification",
);
for (const automationProbe of [
  'counts["automation_events.exact-source-or-orphan"]',
  'counts["automation_executions.exact-source-or-orphan"]',
  'counts["automation_attempts.exact-source-or-orphan"]',
  'counts["automation_audit_events.dynamic"]',
  'counts["office_tasks.automation_execution_id"]',
]) {
  assert.match(
    source,
    new RegExp(automationProbe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `Independent residue verification includes ${automationProbe}`,
  );
}
assert.match(
  source,
  /"automation_audit_events",\s+"select=id&audit_type=neq\.rule_seeded"/,
  "Rule-seed audit history remains while every dynamic automation audit is release-blocking residue",
);
assert.match(
  source,
  /"office_tasks",\s+"select=id&automation_execution_id=not\.is\.null"/,
  "Automation-created office-task linkage cannot survive an isolated regression run",
);
assert.doesNotMatch(source, /readFile(?:Sync)?\s*\(/);
const cleanupSource = source.slice(source.indexOf("async function cleanupOwner"));
assert.ok(
  cleanupSource.indexOf("assertZeroCounts(referenceCounts") <
    cleanupSource.indexOf("/auth/v1/admin/users/${encodeURIComponent(user.id)}"),
  "Owner cleanup refuses non-bootstrap references before deleting the exact marked user",
);
const lifecycleSource = source.slice(source.indexOf("async function lifecycleProbe"));
assert.ok(
  lifecycleSource.indexOf("await verifyCredentialTarget(config, fetchImpl)") <
    lifecycleSource.indexOf("await restInsert(config, fetchImpl"),
  "Lifecycle probe verifies the target before its write",
);

console.log("Regression environment bootstrap safeguards: PASS");
