import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEAD_ACCOUNTABILITY_REGRESSION_RUN,
  loadLeadAccountabilityRegressionEnvironment,
  runLeadAccountabilityRegression,
} from "../scripts/lead-accountability-regression.mjs";

const cwd = process.cwd();
const source = readFileSync(
  join(cwd, "scripts", "lead-accountability-regression.mjs"),
  "utf8",
);
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

assert.throws(
  () => loadLeadAccountabilityRegressionEnvironment({ cwd, runtimeEnv: {} }),
  /external|environment file|never reads \.env\.local/i,
  "Missing external environment fails closed",
);
assertionCount += 1;

assert.throws(
  () => loadLeadAccountabilityRegressionEnvironment({
    cwd,
    runtimeEnv: {
      WTOS_BROWSER_REGRESSION_ENV_FILE: "/tmp/nonexistent-wtos-accountability-env",
      NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
    },
  }),
  /only from WTOS_BROWSER_REGRESSION_ENV_FILE/i,
  "Process credentials including production are rejected before file access",
);
assertionCount += 1;

for (const [needle, message] of [
  ["REGRESSION_SUPABASE_PROJECT_REF", "Approved isolated project is fixed"],
  ["Production Supabase is permanently prohibited", "Production target is explicitly rejected"],
  ["This runner never reads .env.local", "Repository-local secrets are prohibited"],
  ['command: "verify"', "Identity and zero-residue verification wrap the run"],
  ["createNetworkGuard", "All network access is origin guarded"],
  ["url.origin !== allowedOrigin", "Only isolated Supabase can receive requests"],
  ["NETWORK_TIMEOUT_MS", "Network and sign-out operations have bounded deadlines"],
  ["wtos_create_accountable_lead", "Production accountable lead RPC is exercised"],
  ["wtos_apply_lead_accountability_action", "Production lifecycle action RPC is exercised"],
  ["wtos_upsert_marketing_campaign", "Production campaign RPC is exercised"],
  ["wtos_upsert_marketing_spend", "Production spend RPC is exercised"],
  ["wtos_create_repeat_opportunity", "Production repeat-opportunity RPC is exercised"],
  ["wtos_get_marketing_accountability_dashboard", "Production dashboard RPC is exercised"],
  ["Same campaign/vendor identity leaked across companies", "Same labels are company-isolated"],
  ["Campaign exact retry did not converge", "Campaign idempotency is asserted"],
  ["Delayed campaign retry did not resolve its immutable original receipt", "Delayed campaign retries survive later successful edits"],
  ["Old campaign operation key reused on a different target", "Campaign operation keys cannot be retargeted"],
  ["Same-company duplicate campaign identity", "Same-company campaign identity remains deterministic"],
  ["Stale campaign update", "Campaign optimistic concurrency is asserted"],
  ["Authorized owner assignment overwrote creator identity", "Creator and owner separation is asserted"],
  ["Cross-company campaign reference", "Cross-company lead campaign references are refused"],
  ["Accountable lead exact retry", "Lead creation idempotency is asserted"],
  ["Conflicting accountable lead operation reuse", "Operation-key reuse mismatch is refused"],
  ["operation_key: randomUUID()", "Synthetic public mutations use bare canonical UUID operation keys"],
  ["PII-like unsafe operation key", "PII-like and whitespace-bearing operation keys are refused"],
  ["PII-like operation-key rollback", "Unsafe operation-key refusal leaves no immutable event"],
  ["NaN accountable-lead estimated value", "Non-finite lead value input is refused"],
  ["NaN estimated-value event rollback", "Non-finite lead value refusal is atomic"],
  ["Generic accountable lead repeat-customer attribution", "Generic create cannot impersonate the Customer 360 repeat workflow"],
  ["Refused generic repeat-customer creation left a partial lead", "Generic repeat-create refusal rolls back"],
  ["Generic attribution review to repeat-customer", "Generic attribution review cannot manufacture repeat-customer evidence"],
  ["Generic repeat-customer review rollback", "Refused repeat-customer review preserves state and ledger"],
  ["Audited attribution correction", "First-touch correction uses an audited action"],
  ["Later communication overwrote first-touch attribution", "Communication cannot rewrite first touch"],
  ["Automated acknowledgement as first human response", "Automated acknowledgement is refused"],
  ["Concurrent uppercase/lowercase UUID retries", "Case-insensitive public UUID retries converge to one result and event"],
  ["Direct authenticated terminal lead insert", "Direct won lead inserts are deferred-validated"],
  ["Direct authenticated lost lead insert", "Direct lost lead inserts require accountable loss evidence"],
  ["Direct authenticated split lead insert", "Split terminal lead inserts are deferred-validated"],
  ["Rejected direct terminal/split lead inserts left partial", "Rejected direct terminal/split inserts roll back lead, accountability, and ledger state"],
  ["Stale accountability action", "Stale lifecycle writes are refused"],
  ["current.received_at", "Lifecycle fixture contact time derives from the exact lead receipt"],
  ["receivedAtMs + 60 * 60 * 1_000", "Lifecycle fixture contact occurs deterministically one hour after receipt"],
  ["contactOccurredAt.getTime() >= receivedAtMs", "Lifecycle fixture contact cannot precede receipt"],
  ["contactOccurredAt.getTime() <= Date.now()", "Lifecycle fixture contact cannot be future-dated"],
  ["Invalid attribution rollback", "Invalid evidence rollback is asserted"],
  ["Out-of-order manual inspection milestone", "Manual lifecycle ordering is refused"],
  ["Automatic out-of-order estimate fabricated", "Automatic workflow evidence cannot fabricate an out-of-order KPI milestone"],
  ["Automatic workflow hook fabricated a chronologically invalid appointment milestone", "Automatic workflow chronology violations remain no-ops"],
  ["Chronologically invalid explicit appointment milestone", "Explicit workflow chronology violations are rejected"],
  ["Chronology rejection rollback", "Chronology rejection leaves current state and the immutable ledger unchanged"],
  ["Chronologically invalid authoritative workflow evidence was not visible as a linkage gap", "Chronology no-op remains visible as a data-quality gap"],
  ["Valid chronological appointment milestone did not clear", "Valid chronological evidence clears its linkage gap"],
  ["Create nonqualifying schedule before contact", "Schedule transition coverage begins from a pre-contact nonqualifying row"],
  ["Activate post-contact schedule", "The same schedule row is activated after human contact"],
  ["authoritative UPDATE time", "Schedule UPDATE milestones use the transition timestamp rather than creation time"],
  ["Repeated qualifying schedule update duplicated", "Schedule transition retries remain exactly once"],
  ["Concurrent semantic-update-first lead-reference race", "Campaign semantic update versus first lead reference runs through independent concurrent connections"],
  ["Lead-reference race left a campaign/accountability semantic mismatch", "Lead-reference race cannot persist mixed campaign and accountability semantics"],
  ["Concurrent spend-reference-first semantic-update race", "First spend reference versus campaign semantic update runs in the opposite connection ordering"],
  ["Spend-reference race left a campaign/spend semantic mismatch", "Spend-reference race cannot persist mixed campaign and spend semantics"],
  ["workflow_linkage_gap_count === 1", "Missing authoritative workflow linkage is surfaced"],
  ["Read linkage-gap prerequisite milestones", "Linkage-gap fixtures prove ordered appointment and inspection evidence before estimate send"],
  ["Valid ordered milestone did not clear", "Ordered evidence clears the workflow-linkage gap"],
  ["Won without positive contract value", "Won value requirements are asserted"],
  ["NaN manual won contract value", "Non-finite manual won value is refused"],
  ["NaN manual won rollback", "Non-finite manual won refusal preserves state and ledger"],
  ["NaN authoritative proposal acceptance", "Non-finite authoritative proposal acceptance is refused"],
  ["NaN proposal acceptance accountability rollback", "Rejected non-finite acceptance cannot fabricate a won event"],
  ["Cross-company proposal acceptance scope", "Cross-company proposal acceptances are rejected"],
  ["Mismatched proposal revision and estimate", "Proposal revision and estimate scope must match"],
  ["Mismatched proposal acceptance customer", "Proposal acceptance customer scope must match"],
  ["Rejected proposal-acceptance scope mismatches left a partial acceptance row", "Proposal acceptance mismatch rejections are atomic"],
  ["Proposal-acceptance mismatch won-lead rollback", "Rejected proposal evidence preserves the target accountability state and ledger"],
  ["Valid company-scoped accepted proposal did not create exactly one verified won state/event", "Valid accepted proposal evidence still creates one verified win"],
  ["approved_contract_total", "Approved contract basis is exercised"],
  ["Won-to-lost terminal outcome reversal", "Won outcomes cannot be rewritten lost"],
  ["Lost other without notes", "Other lost reason requires notes"],
  ['lost_reason_code: "price"', "Structured lost taxonomy is exercised"],
  ["Lost-to-won terminal outcome reversal", "Lost outcomes cannot be rewritten won"],
  ["Same-company repeat opportunity", "Repeat opportunity is independently attributable"],
  ["canonical repeat source/detail/provider", "Exact repeat retry retains canonical source, null detail, manual provider, and reviewed links"],
  ["Exact repeat retry did not converge before stale reviewed-graph checks", "Exact retry reuses its fingerprint before stale graph validation"],
  ["Same operation UUID with changed repeat customer/property review timestamps", "Same-key changed repeat graph input conflicts"],
  ["Conflicting same-key repeat retry changed the original lead links", "Repeat retry conflict preserves original links and immutable ledger"],
  ["Cross-company repeat opportunity", "Repeat opportunity company isolation is asserted"],
  ["Stale repeat opportunity source graph", "Repeat opportunity source versions are asserted"],
  ["Negative marketing spend", "Nonnegative spend is asserted"],
  ["NaN marketing spend", "Non-finite spend input is refused"],
  ["NaN marketing-spend rollback", "Non-finite spend refusal is atomic"],
  ["Spend exact retry did not converge", "Spend idempotency is asserted"],
  ["Delayed spend retry did not resolve its immutable original receipt", "Delayed spend retries survive later successful edits"],
  ["Old spend operation key reused on a different target", "Spend operation keys cannot be retargeted"],
  ["Campaign operation key reused for marketing spend", "Operation keys cannot be reused across marketing mutation kinds"],
  ["Same-company duplicate spend identity", "Same-company spend identity remains deterministic"],
  ["Stale marketing spend update", "Spend optimistic concurrency is asserted"],
  ["Referenced campaign semantic identity mutation", "Referenced campaign attribution semantics are immutable"],
  ["partial update", "Rejected semantic mutation rollback is read back"],
  ["Sales marketing spend mutation", "Spend privilege boundary is asserted"],
  ["Authenticated direct marketing spend insert", "Direct business writes are revoked"],
  ["Anonymous caller read private accountability state", "Anonymous RLS privacy is asserted"],
  ["Service-role accountability event update", "Immutable event trigger covers service role"],
  ["Marketing operation receipt RLS did not preserve exact WeatherTech scope", "Durable receipts are company isolated and retain original results"],
  ["Authenticated direct marketing operation receipt update", "Authenticated receipt writes are revoked"],
  ["Service-role marketing operation receipt update", "Durable receipts are immutable even to service-role writes"],
  ["Anonymous caller read private marketing operation receipts", "Anonymous callers cannot read receipts"],
  ["Sales RLS did not preserve strict company campaign isolation", "Company RLS is read back"],
  ["America/Phoenix", "Phoenix reporting timezone is asserted"],
  ["Dashboard cost per lead formula", "Cost per lead is checked exactly"],
  ["Dashboard booking formula", "Booking rate is checked exactly"],
  ["Dashboard inspection formula", "Inspection rate is checked exactly"],
  ["Dashboard closing formula", "Closing rate is checked exactly"],
  ["Dashboard cost per sold job", "Cost per sold job is checked exactly"],
  ["Dashboard revenue and revenue/spend formulas", "Revenue and ROAS are checked exactly"],
  ["Dashboard awaiting-contact queue", "Awaiting-contact queue is checked"],
  ["Dashboard explicit follow-up queues", "Overdue and missing follow-up queues are checked"],
  ["Dashboard attribution quality metrics", "Unattributed and coverage metrics are checked"],
  ["untracked_legacy_lead_count === 0", "Untracked legacy/test rows stay outside the accountable KPI cohort"],
  ["untracked_legacy_lead_scope", "Legacy gaps are explicitly company/month scoped and non-source-allocatable"],
  ["Source-filtered dashboard did not honor first-touch/spend filters while retaining", "A source filter retains the full company/month legacy data-quality gap"],
  ["Zero-denominator dashboard metrics", "Unavailable denominators remain null"],
  ["JULY BOUNDARY", "Pre-month Phoenix boundary fixture is present"],
  ["SEPTEMBER BOUNDARY", "Exclusive next-month Phoenix boundary fixture is present"],
  ["provider or financial state", "Provider and financial side effects remain zero"],
  ["wtos_cleanup_synthetic_proposal_fixture", "Protected synthetic proposal evidence uses the service-only exact cleanup RPC"],
  ["readSyntheticProposalCleanupGraph", "Proposal cleanup discovers its exact dependent graph before deletion"],
  ["removeSyntheticProposalDocumentObjects", "Proposal Storage bytes are removed before protected metadata cleanup"],
  ["cleaned.storageResidueCount === 0", "Protected cleanup proves zero Storage residue"],
  ["cleaned.databaseResidueCount === 0", "Protected cleanup proves zero database residue"],
  ["deleteExactIds", "Cleanup uses captured exact IDs"],
  ['deleteExactIds(service, "lead_accountability_events"', "Immutable events delete before accountability"],
  ['deleteExactIds(service, "lead_accountability"', "Current state deletes before leads"],
  ['deleteExactIds(\n          service,\n          "marketing_accountability_operation_receipts"', "Durable receipts delete before their exact marketing targets"],
  ["assertExactIdsAbsent", "Exact-ID cleanup residue is verified"],
  ["cleanupResidue = 0", "Runner closes only after zero residue"],
]) {
  check(source.includes(needle), message);
}

for (const [label, stableMessage] of [
  ["Stale campaign update", "marketing campaign changed after review"],
  ["Stale accountability action", "lead accountability record changed after review"],
  [
    "Stale repeat opportunity source graph",
    "repeat-opportunity customer changed after review",
  ],
  ["Stale marketing spend update", "marketing spend changed after review"],
]) {
  const labelIndex = source.indexOf(`"${label}"`);
  const expectation = source.slice(labelIndex, labelIndex + 260);
  check(
    labelIndex > -1 &&
      expectation.includes('"P0001"') &&
      expectation.includes(`/${stableMessage}\\./i`),
    `${label} requires exact non-retryable P0001 semantics and its stable conflict message`,
  );
}

check(
  !source.includes('resolve(cwd, ".env.local")') &&
    !source.includes("dotenv") &&
    !source.includes("env-cmd"),
  "Runner has no .env.local or dotenv fallback",
);
check(
  source.includes("operationKey = randomUUID()") &&
    !source.includes('operation_key: `${marker}') &&
    !source.includes('last_operation_key: `${marker}') &&
    !source.includes("OPERATION_MARKER_PREFIX"),
  "Spaced cleanup labels never enter persisted operation keys and public operations remain bare UUIDs",
);
check(
  !/\.delete\(\)[\s\S]{0,80}\.(?:like|ilike|neq)\(/.test(source),
  "Cleanup never deletes by a broad marker or inequality",
);
check(
  source.includes('.delete().in("id", exactIds)'),
  "Business cleanup deletes only captured exact ID sets",
);
check(
  !source.includes(
    'deleteExactIds(service, "estimate_proposal_acceptances", ids.estimate_proposal_acceptances)',
  ) &&
    !source.includes(
      'deleteExactIds(service, "estimate_proposal_revisions", ids.estimate_proposal_revisions)',
    ),
  "Append-only acceptance evidence and finalized revisions are never directly deleted",
);
const marketingReceiptCleanupIndex = source.indexOf(
  'deleteExactIds(\n          service,\n          "marketing_accountability_operation_receipts"',
);
check(
  source.indexOf('deleteExactIds(service, "lead_accountability_events"') <
    source.indexOf('deleteExactIds(service, "lead_accountability"') &&
    source.indexOf('deleteExactIds(service, "lead_accountability"') <
      marketingReceiptCleanupIndex &&
    marketingReceiptCleanupIndex <
      source.indexOf('deleteExactIds(service, "marketing_spend_months"') &&
    source.indexOf('deleteExactIds(service, "marketing_spend_months"') <
      source.indexOf('deleteExactIds(service, "marketing_campaigns"') &&
    source.indexOf('deleteExactIds(service, "marketing_campaigns"') <
      source.indexOf('deleteExactIds(service, "leads"'),
  "Cleanup dependency order is events, accountability, durable receipts, spend, campaign, then core leads",
);

if (process.env[LEAD_ACCOUNTABILITY_REGRESSION_RUN] === "true") {
  const report = await runLeadAccountabilityRegression({ cwd });
  assert.equal(report.result, "PASS");
  assert.equal(report.target, "hygtnhmmaoboduqghhwg");
  for (const key of [
    "campaignSameIdentityAcrossCompanies",
    "campaignIdempotencyAndStaleWrites",
    "immutableMarketingOperationReceipts",
    "delayedMarketingRetriesConverged",
    "crossTargetMarketingOperationReuseRejected",
    "creatorOwnerSeparation",
    "crossCompanyReferencesRejected",
    "firstTouchCorrectionAuditedAndLocked",
    "laterContactPreservedFirstTouch",
    "humanContactRequired",
    "concurrentRetriesConverged",
    "caseInsensitiveOperationRetriesConverged",
    "staleActionsRejected",
    "invalidWritesRolledBack",
    "workflowOrderingEnforced",
    "workflowChronologyEnforced",
    "scheduleUpdateTransitionTimestampVerified",
    "terminalLeadInsertRollbackVerified",
    "workflowLinkageGapSurfacedAndCleared",
    "genericRepeatAttributionRefused",
    "campaignReferenceRacesSerialized",
    "safeOpaqueOperationKeysEnforced",
    "nonFiniteNumericInputsRejected",
    "proposalAcceptanceScopeRejectedAtomically",
    "validAcceptedProposalWins",
    "wonRequirementsEnforced",
    "lostRequirementsEnforced",
    "repeatOpportunityCompanyScopedAndIdempotent",
    "repeatOperationFingerprintAndLinksProtected",
    "staleRepeatRejected",
    "spendCompanyScopedValidatedAndIdempotent",
    "referencedCampaignMutationRolledBack",
    "dashboardFormulasVerified",
    "untrackedLegacyExcludedFromKpis",
    "sourceFilteredLegacyGapRetained",
    "phoenixMonthBoundariesVerified",
    "zeroDenominatorsUnavailable",
    "rlsAndGrantIsolationVerified",
    "eventsImmutable",
  ]) {
    assert.equal(report[key], true, `${key} was not proven`);
    assertionCount += 1;
  }
  assert.equal(report.providerOrFinancialEffects, 0);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.cleanupResidue, 0);
  assertionCount += 3;
  console.log("Lead accountability hosted regression execution: PASS");
} else {
  console.log(
    `Lead accountability hosted regression execution: NOT RUN (set ${LEAD_ACCOUNTABILITY_REGRESSION_RUN}=true only after the migration is applied to the isolated regression project)`,
  );
}

console.log(`Lead accountability regression runner contract: PASS (${assertionCount} assertions)`);
