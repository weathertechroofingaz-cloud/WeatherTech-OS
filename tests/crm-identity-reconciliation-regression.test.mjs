import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CRM_IDENTITY_RECONCILIATION_REGRESSION_RUN,
  loadCrmIdentityReconciliationRegressionEnvironment,
  runCrmIdentityReconciliationRegression,
} from "../scripts/crm-identity-reconciliation-regression.mjs";

const cwd = process.cwd();
const source = readFileSync(
  join(cwd, "scripts/crm-identity-reconciliation-regression.mjs"),
  "utf8",
);
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

assert.throws(
  () => loadCrmIdentityReconciliationRegressionEnvironment({ cwd, runtimeEnv: {} }),
  /external|environment file|never reads \.env\.local/i,
  "Missing external environment fails closed",
);
assertionCount += 1;

assert.throws(
  () => loadCrmIdentityReconciliationRegressionEnvironment({
    cwd,
    runtimeEnv: {
      WTOS_BROWSER_REGRESSION_ENV_FILE: "/tmp/nonexistent-wtos-reconciliation-env",
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
  ['command: "verify"', "Identity and zero-residue checks wrap the run"],
  ["createNetworkGuard", "All network access is origin guarded"],
  ["url.origin !== allowedOrigin", "Only isolated Supabase can receive requests"],
  ["NETWORK_TIMEOUT_MS", "Every regression network request has a bounded deadline"],
  ["controller.abort", "Hung auth and PostgREST requests are actively aborted"],
  ["settleWithTimeout", "Sign-out cannot hang cleanup indefinitely"],
  ["wtos_reconcile_customer_property", "The production transaction RPC is exercised"],
  ["recordFixtureContact", "Synthetic contacted state is established through the audited accountability boundary"],
  ['status: "new"', "Synthetic leads begin in invariant-safe new status"],
  ['pipeline_stage: "new_lead"', "Synthetic leads begin in invariant-safe new pipeline stage"],
  ["wtos_apply_lead_accountability_action", "Every synthetic contact uses the production accountability action RPC"],
  ["expected_version: 1", "Initial accountability version is reviewed exactly"],
  ['action: "contacted"', "The audited human-contact milestone is explicit"],
  ['human_contact: true', "Fixture contact is explicitly human"],
  ['first_response_channel: "phone"', "Fixture contact records its channel"],
  ["Refetch exact contacted lead fixtures", "Lead timestamps are refreshed after audited contact before reconciliation"],
  ["Audited fixture contact did not advance every exact lead", "All exact fixtures prove contacted status and pipeline state"],
  ["Exact retry", "Exact idempotent retry is asserted"],
  ["Conflicting operation-key reuse", "Conflicting key reuse is rejected"],
  ["Concurrent approvals", "Concurrency convergence is asserted"],
  ["Ambiguous identity", "Ambiguity refusal is asserted"],
  ["Cross-company identity", "Company isolation is asserted"],
  ["Wrong-company duplicate", "Wrong-company duplicate manipulation is rejected"],
  ["Stale review", "Optimistic stale review is rejected"],
  ["Transactional rollback", "Partial writes are checked after failure"],
  ["Omitted-child conflict", "An omitted conflicting graph child is refused atomically"],
  ["property customer assignment conflicts with an existing CRM graph row", "Omitted-child rejection asserts the exact invariant failure"],
  ["Insufficient create evidence", "Address-only customer creation is refused"],
  ["creating a customer requires reviewed name, address, and phone or email evidence", "Address-only refusal asserts the exact release-hardening error"],
  ["Insufficient create evidence left a customer, link, audit event, or workflow mutation", "Insufficient evidence leaves no durable side effect"],
  ["EXACT WITHOUT ADDRESS", "Unique phone/email matching is exercised without address evidence"],
  ["Unique exact phone/email linking incorrectly required address evidence", "Existing-customer matching does not inherit create-only evidence requirements"],
  ["OFFICE PROPERTY ONLY", "A selected property-only office task is exercised"],
  ["both lead-linked and property-only office-task links", "Property-only office-task persistence is verified"],
  ["Direct lead customer reassignment", "Authenticated direct lead customer reassignment is refused"],
  ["Direct lead property reassignment", "Authenticated direct lead property reassignment is refused"],
  ["Direct property customer reassignment", "Authenticated direct property customer reassignment is refused"],
  ["Unaudited qualified lead shortcut", "Direct funnel-stage shortcuts without accountable appointment evidence are refused"],
  ["Verify unaudited qualified shortcut rollback", "Rejected funnel-stage shortcuts are read back unchanged"],
  ["Rejected unaudited qualified shortcut changed lead state", "Rejected funnel-stage shortcuts are atomic"],
  ["qualified.*accountable appointment event", "Shortcut refusal asserts the accountable appointment invariant"],
  ["Ordinary authenticated lead priority update", "Ordinary non-funnel lead updates remain permitted"],
  ["Ordinary authenticated property address update", "Ordinary property updates remain permitted"],
  ["uuidOperationKey", "A real UUID operation key is used independently of cleanup markers"],
  ['.in("source_lead_id", ids.leads)', "Audit discovery is anchored to exact synthetic source-lead IDs"],
  ["uuidOperationAuditCleanupVerified", "UUID-key audit cleanup is proven after zero residue"],
  ["Unauthorized role", "Role authorization is exercised"],
  ["Authenticated audit update", "Audit update immutability is exercised"],
  ["Authenticated audit delete", "Audit delete immutability is exercised"],
  ["statusAndStagePreserved", "Lead status and pipeline preservation are reported"],
  ["selectedGraphLinksVerified", "Every selected graph table is verified after commit"],
  ["resultMutationCountsVerified", "RPC mutation counts are verified"],
  ["Verify created customer", "Reviewed creation is read back by exact ID"],
  ["providerOrFinancialEffects: 0", "Provider and financial tables remain unchanged"],
  ["blockedExternalRequests === 0", "Provider network side effects remain zero"],
  ["createBrowserCompatibleRegressionRunId", "Cleanup uses the approved 17-digit Browser run envelope"],
  ['const sourceMarker = `TEST WTOS REGRESSION ${runId}`', "The exact cleanup source marker is canonical"],
  ['const marker = `${sourceMarker} CRM RECONCILIATION`', "Readable CRM labels suffix the canonical source marker"],
  ["cleanupSyntheticAutomationRegressionLedger", "Immutable automation evidence uses the protected shared cleanup"],
  ["report.automationLedgerCleanup = automationCleanup", "The exact cleanup receipt is retained in the report"],
  ["deleteExactIds", "Cleanup uses captured exact IDs"],
  ["deleteLeadAccountabilityForExactLeadIds", "Cleanup discovers accountability rows only through exact synthetic lead IDs"],
  ['deleteExactIds(client, "lead_accountability_events", eventIds)', "Immutable accountability events are deleted before current accountability state"],
  ["cleanupAuthorized", "Collision checks authorize cleanup"],
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
  source.includes('.delete().in("id", [...new Set(ids)])'),
  "Business cleanup deletes only captured exact ID sets",
);
const automationCleanupIndex = source.lastIndexOf(
  "automationCleanup = await cleanupSyntheticAutomationRegressionLedger({",
);
const firstBusinessDeleteIndex = source.lastIndexOf(
  "await deleteExactIds(service, AUDIT_TABLE, ids.crm_identity_reconciliation_events)",
);
check(
  automationCleanupIndex >= 0 &&
    firstBusinessDeleteIndex >= 0 &&
    automationCleanupIndex < firstBusinessDeleteIndex,
  "Automation cleanup is awaited before the first reconciliation or business-row deletion",
);
check(
  source.indexOf('deleteExactIds(client, "lead_accountability_events", eventIds)') <
    source.indexOf('deleteExactIds(client, "lead_accountability", accountabilityIds)') &&
    source.indexOf("deleteLeadAccountabilityForExactLeadIds(") <
      source.lastIndexOf('deleteExactIds(service, "leads", ids.leads)'),
  "Accountability cleanup runs events then current state before exact synthetic leads",
);

if (process.env[CRM_IDENTITY_RECONCILIATION_REGRESSION_RUN] === "true") {
  const report = await runCrmIdentityReconciliationRegression({ cwd });
  assert.equal(report.result, "PASS");
  assert.equal(report.target, "hygtnhmmaoboduqghhwg");
  assert.equal(report.exactMatchLinked, true);
  assert.equal(report.createReviewed, true);
  assert.equal(report.ambiguityRejected, true);
  assert.equal(report.crossCompanyRejected, true);
  assert.equal(report.staleReviewRejected, true);
  assert.equal(report.rollbackVerified, true);
  assert.equal(report.omittedChildConflictRejected, true);
  assert.equal(report.insufficientEvidenceRejected, true);
  assert.equal(report.exactLinkWithoutAddressVerified, true);
  assert.equal(report.propertyOnlyOfficeTaskLinked, true);
  assert.equal(report.directIdentityMutationRejected, true);
  assert.equal(report.unauditedFunnelShortcutRejected, true);
  assert.equal(report.ordinaryOperationalUpdatesPreserved, true);
  assert.equal(report.uuidOperationAuditRecorded, true);
  assert.equal(report.uuidOperationAuditCleanupVerified, true);
  assert.equal(report.selectedGraphLinksVerified, true);
  assert.equal(report.resultMutationCountsVerified, true);
  assert.equal(report.statusAndStagePreserved, true);
  assert.equal(report.exactRetryIdempotent, true);
  assert.equal(report.conflictingOperationRejected, true);
  assert.equal(report.concurrentApprovalsConverged, true);
  assert.equal(report.unauthorizedRoleRejected, true);
  assert.equal(report.auditImmutableForAuthenticatedUsers, true);
  assert.equal(report.providerOrFinancialEffects, 0);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.automationLedgerCleanup?.databaseResidueCount, 0);
  assert.equal(report.cleanupResidue, 0);
  assertionCount += 29;
  console.log("CRM identity reconciliation hosted regression execution: PASS");
} else {
  console.log(
    `CRM identity reconciliation hosted regression execution: NOT RUN (set ${CRM_IDENTITY_RECONCILIATION_REGRESSION_RUN}=true with the secure external regression environment)`,
  );
}

console.log(`CRM identity reconciliation regression runner contract: PASS (${assertionCount} assertions)`);
