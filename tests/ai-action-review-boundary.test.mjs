import { readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const commandRoute = readFileSync(
  join(cwd, "app/api/ai-tools/command/route.ts"),
  "utf8",
);
const reviewRoute = readFileSync(
  join(cwd, "app/api/ai-tools/actions/review/route.ts"),
  "utf8",
);
const actionRuntime = readFileSync(
  join(cwd, "lib/crm/aiActionRuntime.ts"),
  "utf8",
);
const boundedJson = readFileSync(
  join(cwd, "lib/http/boundedJson.ts"),
  "utf8",
);
const aiProvider = readFileSync(join(cwd, "lib/crm/aiProvider.ts"), "utf8");
const crmApp = readFileSync(join(cwd, "components/CrmApp.tsx"), "utf8");
const automationMigration = readFileSync(
  join(
    cwd,
    "supabase/migrations/20260902024804_automation_engine_foundation.sql",
  ),
  "utf8",
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(source, value, message) {
  assert(source.includes(value), message);
}

const membershipLookupIndex = commandRoute.indexOf('.from("company_memberships")');
const preflightIndex = commandRoute.indexOf("const localResult = preflightAiPilotCommand({");
const requestAuditIndex = commandRoute.indexOf('serviceClient.rpc("wtos_reserve_ai_request_v1"');
const providerCallIndex = commandRoute.indexOf("runAiPilotCommand({");

assert(
  membershipLookupIndex >= 0 &&
    preflightIndex > membershipLookupIndex &&
    requestAuditIndex > preflightIndex &&
    requestAuditIndex > membershipLookupIndex &&
    providerCallIndex > requestAuditIndex,
  "Command authorization and network-free local preflight must complete before the atomic reservation and provider call.",
);
const localExitBlock = commandRoute.slice(preflightIndex, requestAuditIndex);
for (const localExitBoundary of [
  "if (localResult)",
  "requestAuditEventId: null",
  "persistAiCommandResult({",
  "No provider call was attempted",
]) {
  includes(
    localExitBlock,
    localExitBoundary,
    `Local AI exits must be audited without quota consumption: ${localExitBoundary}.`,
  );
}
assert(
  !localExitBlock.includes("wtos_reserve_ai_request_v1") &&
    !localExitBlock.includes('event_type: "request_initiated"'),
  "Local AI exits must never create a counted request reservation.",
);
const providerPreflightStart = aiProvider.indexOf(
  "export function preflightAiPilotCommand({",
);
const providerPreflightEnd = aiProvider.indexOf(
  "function prepareAiPilotCommand({",
  providerPreflightStart,
);
const providerPreflight = aiProvider.slice(
  providerPreflightStart,
  providerPreflightEnd,
);
assert(
  providerPreflightStart >= 0 &&
    providerPreflightEnd > providerPreflightStart &&
    providerPreflight.includes("requireQuotaReservation: false") &&
    !providerPreflight.includes("callConfiguredProvider") &&
    !providerPreflight.includes("await fetch") &&
    !providerPreflight.includes("fetch("),
  "AI preflight must be structurally network-free and ignore only the not-yet-created reservation requirement.",
);
includes(
  commandRoute,
  '.eq("company_id", requestedCompanyId)',
  "Command authorization must query the exact requested company.",
);
includes(
  commandRoute,
  "resolveExactAiCompanyAuthorization",
  "Command authorization must use the fail-closed exact-company role validator.",
);
includes(
  commandRoute,
  'event_type: "action_proposed"',
  "Every returned action preview must receive a durable action_proposed audit event.",
);
includes(
  commandRoute,
  "contractVersion: AI_ACTION_CONTRACT_VERSION",
  "Persisted action previews must bind the explicit review contract version.",
);
includes(
  commandRoute,
  '.select("id, metadata")',
  "The command route must reload inserted audit IDs.",
);
includes(
  commandRoute,
  "auditReferenceByPreviewId",
  "The command response must surface durable per-preview audit references.",
);
includes(
  commandRoute,
  "No provider call was attempted",
  "The provider must fail closed when pre-call audit persistence is unavailable.",
);
includes(
  commandRoute,
  'createHash("sha256").update(prompt).digest("hex")',
  "Request audit evidence must fingerprint rather than persist raw prompt text.",
);
for (const quotaBoundary of [
  "MAX_AI_COMMAND_BODY_BYTES",
  "MAX_AI_PROMPT_CHARACTERS",
  "resolveCompanyAiProviderConfig",
  "preflightAiPilotCommand",
  'serviceClient.rpc("wtos_reserve_ai_request_v1"',
  "estimatedCostUsd *",
  "(providerConfig.retryLimit + 1)",
  "const maxProviderAttempts = providerConfig.retryLimit + 1",
  "companyMonthlyBudgetCents: companyConfig.companyMonthlyBudgetCents",
  "quotaReservation,",
  "parseQuotaReservation(reservationData, {",
  "providerConfig,",
  "receipt.requestId !== expected.requestId",
  "receipt.companyId !== expected.companyId",
  "receipt.actorUserId !== expected.actorUserId",
  "receipt.provider !== expected.provider",
  "receipt.model !== expected.model",
  "receipt.estimatedCostCents !== expected.estimatedCostCents",
  "receipt.maxProviderAttempts !== expected.maxProviderAttempts",
  "Number(receipt.reservedCostCentsToday) < expected.estimatedCostCents",
  "quotaReserved: Boolean(requestAuditEventId)",
  "requestAuditEventId ? result.actionPreviews : []",
]) {
  includes(
    commandRoute,
    quotaBoundary,
    `Atomic AI quota enforcement is missing boundary ${quotaBoundary}.`,
  );
}
assert(
  !commandRoute.includes("recordAiRequestInitiated") &&
    commandRoute.indexOf("parseQuotaReservation(reservationData, {") >= 0 &&
    commandRoute.indexOf("runAiPilotCommand({") >
      commandRoute.indexOf("parseQuotaReservation(reservationData, {"),
  "The trusted atomic reservation must replace direct request inserts and precede the provider call.",
);
includes(
  commandRoute,
  "result.companyId !== companyId",
  "Persisted AI results must remain bound to the exact authorized company.",
);

for (const companySwitchBoundary of [
  "aiCommandAbortRef.current?.abort()",
  "aiReviewAbortRef.current?.abort()",
  "activeAiCompanyRef.current = activeCompanyId",
  "setAiResponses([])",
  "setAiPilotResult(null)",
  "result.companyId !== requestCompanyId",
  'reviewCompanyId === "all"',
  "aiPilotResult?.companyId !== reviewCompanyId",
  "action.companyId !== reviewCompanyId",
  "preview.companyId !== reviewCompanyId",
]) {
  includes(
    crmApp,
    companySwitchBoundary,
    `AI company-switch isolation is missing boundary ${companySwitchBoundary}.`,
  );
}
for (const exactCompanyUiBoundary of [
  'const exactAiCompanySelected = activeCompanyId !== "all"',
  'if (!exactAiCompanySelected)',
  'disabled={!exactAiCompanySelected}',
  'disabled={isAiCommandRunning || !exactAiCompanySelected}',
  'data-testid="ai-exact-company-required"',
  'Select WeatherTech Roofing LLC or IHC Painting in Company Scope',
]) {
  includes(
    crmApp,
    exactCompanyUiBoundary,
    `AI live-provider UI must fail closed without an exact company: ${exactCompanyUiBoundary}.`,
  );
}
for (const boundedBodyBoundary of [
  "request.body.getReader()",
  "totalBytes > maxBytes",
  "await reader.cancel()",
  'new TextDecoder("utf-8", { fatal: true })',
]) {
  includes(
    boundedJson,
    boundedBodyBoundary,
    `Bounded JSON request parsing is missing ${boundedBodyBoundary}.`,
  );
}
includes(
  commandRoute,
  "readBoundedJsonBody(",
  "The command route must enforce the actual streamed request-byte limit.",
);
includes(
  reviewRoute,
  "readBoundedJsonBody(request, MAX_AI_REVIEW_BODY_BYTES)",
  "The review route must enforce a bounded request body.",
);
includes(
  crmApp,
  'label: "Local answer history"',
  "The AI UI must describe local answers as stateless rather than provider conversation memory.",
);
assert(
  !crmApp.includes("previousResponseId: previousAiResponseId") &&
    !crmApp.includes("setPreviousAiResponseId"),
  "The stateless AI UI must not claim or send unsupported provider continuation state.",
);
const companyResetStart = crmApp.indexOf(
  "aiCommandAbortRef.current?.abort();\n    aiReviewAbortRef.current?.abort();",
);
const companyResetEnd = crmApp.indexOf("}, [activeCompanyId]);", companyResetStart);
assert(
  companyResetStart >= 0 && companyResetEnd > companyResetStart,
  "AI abort and session reset must execute inside the active-company dependency effect.",
);

includes(
  reviewRoute,
  '.from("ai_audit_events")',
  "Review must reload the durable AI audit record.",
);
includes(
  reviewRoute,
  'event.event_type !== "action_proposed"',
  "Only stored action_proposed events may be reviewed.",
);
includes(
  reviewRoute,
  "validateStoredAiActionPreview",
  "Review must runtime-validate the stored action target and exact company.",
);
includes(
  reviewRoute,
  '"wtos_ai_action_preview_fingerprint_v1"',
  "Review must fingerprint the exact stored action_preview through the database helper.",
);
includes(
  reviewRoute,
  "p_action_preview: event.action_preview",
  "Review fingerprinting must use stored JSON, not a client-reconstructed preview.",
);
includes(
  reviewRoute,
  '"wtos_review_ai_action_v1"',
  "Review must delegate the atomic decision and bounded execution to the central RPC.",
);
includes(
  reviewRoute,
  'code === "40001"',
  "Changed or conflicting review decisions must return an HTTP conflict, not an availability error.",
);
for (const argument of [
  "p_ai_audit_event_id: event.id",
  "p_decision: decision",
  "p_expected_action_type: preview.actionType",
  "p_expected_payload_sha256: fingerprint",
  "p_expected_contract_version: contractVersion",
]) {
  includes(reviewRoute, argument, `Review RPC is missing bound argument ${argument}.`);
}
includes(
  reviewRoute,
  "isApprovableAiActionTarget",
  "Approval must enforce the action-specific target-table allowlist.",
);
includes(
  reviewRoute,
  "preview.targetRecord.companyId !== authorization.companyId",
  "Approval must require the target record to belong to the exact authorized company.",
);
includes(
  actionRuntime,
  '["create_follow_up_draft", actionTargetTables.create_follow_up_draft]',
  "The bounded internal follow-up action must be explicitly approvable.",
);
assert(
  !actionRuntime.includes('["draft_email", actionTargetTables.draft_email]'),
  "Draft email previews must remain non-approvable until canonical draft content is fingerprinted and executed server-side.",
);
for (const receiptStatus of [
  'executionStatus === "rejected"',
  'executionStatus === "succeeded"',
]) {
  includes(
    reviewRoute,
    receiptStatus,
    `Review receipt validation is missing invariant ${receiptStatus}.`,
  );
}
assert(
  !reviewRoute.includes("service_role") &&
    !reviewRoute.includes("getSupabaseServiceRoleClient") &&
    !reviewRoute.includes("body.actionPreview") &&
    !reviewRoute.includes("createEmailMessage") &&
    !reviewRoute.includes("sendSms") &&
    !reviewRoute.includes("twilio"),
  "AI review must use the authenticated user/RLS boundary, never trust a client preview, and never send to a provider.",
);

for (const sqlBoundary of [
  "create or replace function public.wtos_ai_action_preview_fingerprint_v1(",
  "p_contract_version::text || ':' || p_action_preview::text",
  "extensions.digest(",
  "create or replace function public.wtos_review_ai_action_v1(",
  "from public.ai_audit_events\n  where id = p_ai_audit_event_id\n  for update",
  "membership.role in ('owner', 'admin', 'office')",
  "p_expected_action_type <> 'create_follow_up_draft'",
  "'ai-action-review:' || proposed_action.id::text",
  "'automation_key', 'ai-follow-up:' || proposed_action.id::text",
  "'title', 'Review approved AI follow-up'",
  "execution_row.status <> 'succeeded' or task_id is null",
  "from public, anon, authenticated",
]) {
  includes(
    automationMigration,
    sqlBoundary,
    `Automation migration is missing AI review boundary ${sqlBoundary}.`,
  );
}
const reviewRpcSql = automationMigration.slice(
  automationMigration.indexOf(
    "create or replace function public.wtos_review_ai_action_v1(",
  ),
  automationMigration.indexOf(
    "revoke execute on function public.wtos_automation_conditions_valid_v1",
  ),
);
assert(
  !reviewRpcSql.includes("send_sms") &&
    !reviewRpcSql.includes("send_email") &&
    !reviewRpcSql.includes("twilio") &&
    !reviewRpcSql.includes("gmail"),
  "The AI review RPC must never contain a customer/provider send path.",
);

console.log("AI action durable review boundary regression passed.");
