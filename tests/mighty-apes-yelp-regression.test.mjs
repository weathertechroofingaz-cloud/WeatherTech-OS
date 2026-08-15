import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGHTY_APES_YELP_REGRESSION_RUN,
  loadMightyApesYelpRegressionEnvironment,
  runMightyApesYelpRegression,
} from "../scripts/mighty-apes-yelp-regression.mjs";

const cwd = process.cwd();
const source = readFileSync(
  join(cwd, "scripts", "mighty-apes-yelp-regression.mjs"),
  "utf8",
);
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

assert.throws(
  () => loadMightyApesYelpRegressionEnvironment({ cwd, runtimeEnv: {} }),
  /external|environment file|never reads \.env\.local/i,
  "Missing external environment fails closed",
);
assertionCount += 1;

assert.throws(
  () => loadMightyApesYelpRegressionEnvironment({
    cwd,
    runtimeEnv: {
      WTOS_BROWSER_REGRESSION_ENV_FILE: "/tmp/nonexistent-wtos-mighty-apes-env",
      NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
    },
  }),
  /only from WTOS_BROWSER_REGRESSION_ENV_FILE/i,
  "Process credentials including production are rejected before file access",
);
assertionCount += 1;

for (const [needle, message] of [
  ["REGRESSION_SUPABASE_PROJECT_REF", "Approved shared regression project is fixed"],
  ["Production Supabase is permanently prohibited", "Production target is explicitly rejected"],
  ["This runner never reads .env.local", "Repository-local secrets are prohibited"],
  ["MIGHTY_APES_YELP_WEBHOOK_SECRET", "Synthetic signing material is required server-side"],
  ['command: "verify"', "Identity, provider-empty, and zero-residue checks wrap the run"],
  ["createNetworkGuard", "All network access is origin guarded"],
  ["url.origin !== allowedOrigin", "Only isolated Supabase can receive requests"],
  ["NETWORK_TIMEOUT_MS", "Regression network requests have bounded deadlines"],
  ["wtos_ingest_mighty_apes_yelp", "The production transaction RPC is exercised"],
  ["lead.test", "Authenticated test-event isolation is exercised"],
  ["audit-only", "Test events are required to remain audit-only"],
  ["Service-role id=id audit update was not rejected", "Service-role audit updates must fail through the immutable trigger"],
  ['auditUpdateError?.code === "55000"', "Audit immutability asserts the exact SQLSTATE"],
  ["Immutable Mighty Apes audit row changed after the refused service-role update", "The refused audit mutation is read back unchanged"],
  ["missingOptionalJobCategoryPreserved", "Omitted optional category is covered"],
  ["multilineMessagePreserved", "Multiline questionnaire preservation is reported"],
  ["emailRemainedNull", "No-email behavior is reported"],
  ["WeatherTech Roofing LLC", "WeatherTech routing is checked"],
  ["IHC Painting", "IHC isolation is checked"],
  ["Exact retry", "Exact delivery retry is asserted"],
  ["new delivery ID", "New-delivery provider retry is asserted"],
  ["Conflicting delivery reuse", "Conflicting delivery-ID reuse is rejected"],
  ["MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT", "A new delivery cannot change an existing stable lead payload"],
  ["Stable-lead payload conflict left an extra lead, intake, sync log, notification, or audit row", "Stable-lead payload conflicts roll back without residue"],
  ["Concurrent shared delivery ID with different lead IDs", "Conflicting lead identities racing on one delivery ID are exercised"],
  ["MIGHTY_APES_YELP_DELIVERY_CONFLICT", "The concurrent delivery race asserts the exact conflict"],
  ["Rejected concurrent delivery left partial or mismatched persistence residue", "The losing concurrent delivery leaves no partial persistence"],
  ["Concurrent duplicate deliveries", "Concurrency convergence is asserted"],
  ["Primary Mighty Apes CRM lead did not enter the normal one-task office workflow", "A normal created lead enters the existing office workflow"],
  ["Exact or alternate delivery retry created an extra office task", "Retries cannot duplicate generated office tasks"],
  ["Each newly created Mighty Apes provider lead did not create exactly one normal WeatherTech office task", "Every created provider lead owns exactly one normal task"],
  ["Mighty Apes regression added, removed, or replaced an unrelated office task", "Unrelated office-task IDs remain exact"],
  ["Anonymous Mighty Apes RPC call", "Service-role-only execution is exercised"],
  ["private Mighty Apes delivery ledger", "Audit RLS privacy is exercised"],
  ["providerOrFinancialEffects: 0", "Unrelated provider and financial state remains unchanged"],
  ["blockedExternalRequests === 0", "Provider network side effects remain zero"],
  ["cleanupAuthorized", "Collision checks authorize cleanup"],
  ["deleteExactIds", "Cleanup uses captured exact IDs"],
  ["assertExactIdsAbsent", "Final exact-ID residue is verified"],
  ["cleanupResidue = 0", "The report closes only after zero residue"],
]) {
  check(source.includes(needle), message);
}

check(
  !source.includes('resolve(cwd, ".env.local")') &&
    !source.includes("dotenv") &&
    !source.includes("env-cmd"),
  "Runner has no .env.local or dotenv fallback",
);
check(
  !/\.delete\(\)[\s\S]{0,80}\.(?:like|ilike|neq)\(/.test(source),
  "Cleanup never deletes by a broad marker or inequality",
);
check(
  source.includes('.delete().in("id", exactIds)'),
  "Business cleanup deletes only captured exact ID sets",
);

if (process.env[MIGHTY_APES_YELP_REGRESSION_RUN] === "true") {
  const report = await runMightyApesYelpRegression({ cwd });
  assert.equal(report.result, "PASS");
  assert.equal(report.target, "hygtnhmmaoboduqghhwg");
  assert.equal(report.leadTestAuditOnly, true);
  assert.equal(report.serviceRoleAuditUpdateRejected, true);
  assert.equal(report.auditUnchangedAfterUpdateAttempt, true);
  assert.equal(report.validLeadCreated, true);
  assert.equal(report.missingOptionalJobCategoryPreserved, true);
  assert.equal(report.multilineMessagePreserved, true);
  assert.equal(report.emailRemainedNull, true);
  assert.equal(report.weatherTechCompanyIsolationVerified, true);
  assert.equal(report.exactRetryIdempotent, true);
  assert.equal(report.alternateDeliveryIdempotent, true);
  assert.equal(report.conflictingDeliveryRejected, true);
  assert.equal(report.conflictingLeadPayloadRejected, true);
  assert.equal(report.conflictingLeadPayloadNoResidue, true);
  assert.equal(report.concurrentDeliveryConflictRejected, true);
  assert.equal(report.concurrentDeliveryConflictNoResidue, true);
  assert.equal(report.concurrentDuplicatesConverged, true);
  assert.equal(report.normalLeadOfficeTasksVerified, true);
  assert.equal(report.duplicateAndConflictOfficeTaskIsolation, true);
  assert.equal(report.unrelatedOfficeTasksPreserved, true);
  assert.equal(report.anonymousRpcRejected, true);
  assert.equal(report.privateAuditLedgerVerified, true);
  assert.equal(report.providerOrFinancialEffects, 0);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.cleanupResidue, 0);
  assertionCount += 26;
  console.log("Mighty Apes Yelp hosted regression execution: PASS");
} else {
  console.log(
    `Mighty Apes Yelp hosted regression execution: NOT RUN (set ${MIGHTY_APES_YELP_REGRESSION_RUN}=true with the secure external regression environment after its schema is applied)`,
  );
}

console.log(`Mighty Apes Yelp regression runner contract: PASS (${assertionCount} assertions)`);
