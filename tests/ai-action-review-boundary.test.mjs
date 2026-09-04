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
const aiToolsSource = readFileSync(join(cwd, "lib/crm/aiTools.ts"), "utf8");
const supabaseService = readFileSync(
  join(cwd, "lib/supabase/service.ts"),
  "utf8",
);
const crmApp = readFileSync(join(cwd, "components/CrmApp.tsx"), "utf8");
const browserRegression = readFileSync(
  join(cwd, "tests/codex-browser/weathertech-os-regression.mjs"),
  "utf8",
);
const automationMigration = readFileSync(
  join(
    cwd,
    "supabase/migrations/20260902024804_automation_engine_foundation.sql",
  ),
  "utf8",
);
const statusRouteStart = commandRoute.indexOf("export async function GET(");
const commandRouteStart = commandRoute.indexOf("export async function POST(");
const statusRoute = commandRoute.slice(statusRouteStart, commandRouteStart);
const commandPost = commandRoute.slice(commandRouteStart);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(source, value, message) {
  assert(source.includes(value), message);
}

assert(
  statusRouteStart >= 0 && commandRouteStart > statusRouteStart,
  "The command route must expose a distinct read-only Production AI status handler.",
);
const statusAuthIndex = statusRoute.indexOf("client.auth.getUser()");
const statusMembershipIndex = statusRoute.indexOf('.from("company_memberships")');
const statusPolicyIndex = statusRoute.indexOf('.from("ai_usage_limits")');
const statusQuotaConfigIndex = statusRoute.indexOf("hasSupabaseServiceRoleConfig()");
const statusBuildIndex = statusRoute.indexOf("buildAiCompanyPilotStatus({");
assert(
  statusAuthIndex >= 0 &&
    statusMembershipIndex > statusAuthIndex &&
    statusPolicyIndex > statusMembershipIndex &&
    statusQuotaConfigIndex > statusPolicyIndex &&
    statusBuildIndex > statusQuotaConfigIndex &&
    statusBuildIndex > statusPolicyIndex,
  "AI status must authenticate and authorize the exact company before reading its policy.",
);
for (const statusBoundary of [
  'request.nextUrl.searchParams.get("companyId")',
  "resolveExactAiCompanyAuthorization",
  '.eq("user_id", user.id)',
  '.eq("company_id", requestedCompanyId)',
  '.eq("company_id", authorization.companyId)',
  ".limit(2)",
  "policyRows?.length !== 1",
  "getAiPilotProviderConfig()",
  "hasSupabaseServiceRoleConfig()",
  "The audited AI quota service is unavailable. Production AI status is not ready.",
  "return noStoreJson(status, 200)",
]) {
  includes(
    statusRoute,
    statusBoundary,
    `Production AI status is missing fail-closed boundary ${statusBoundary}.`,
  );
}
assert(
  !statusRoute.includes("getSupabaseServiceRoleClient") &&
    !statusRoute.includes("runAiPilotCommand") &&
    !statusRoute.includes("wtos_reserve_ai_request_v1") &&
    !statusRoute.includes(".insert(") &&
    !statusRoute.includes(".update(") &&
    !statusRoute.includes(".delete("),
  "Production AI status must remain authenticated, RLS-scoped, and mutation-free.",
);

for (const serviceBoundary of [
  "function readSupabaseServiceRoleConfig",
  "env.NEXT_PUBLIC_SUPABASE_URL?.trim()",
  "env.SUPABASE_SERVICE_ROLE_KEY?.trim()",
  "url && serviceRoleKey ? { url, serviceRoleKey } : null",
  "export function hasSupabaseServiceRoleConfig",
  "return readSupabaseServiceRoleConfig(env) !== null",
  "const config = readSupabaseServiceRoleConfig(process.env)",
  "createClient<Database>(config.url, config.serviceRoleKey",
]) {
  includes(
    supabaseService,
    serviceBoundary,
    `The status and command paths must share the exact service-role readiness predicate: ${serviceBoundary}`,
  );
}

const membershipLookupIndex = commandPost.indexOf('.from("company_memberships")');
const companyConfigIndex = commandPost.indexOf(
  "const companyConfig = resolveCompanyAiProviderConfig({",
);
const preflightIndex = commandPost.indexOf("const localResult = preflightAiPilotCommand({");
const requestAuditIndex = commandPost.indexOf('serviceClient.rpc("wtos_reserve_ai_request_v1"');
const providerCallIndex = commandPost.indexOf("runAiPilotCommand({");

assert(
  membershipLookupIndex >= 0 &&
    companyConfigIndex > membershipLookupIndex &&
    preflightIndex > companyConfigIndex &&
    preflightIndex > membershipLookupIndex &&
    requestAuditIndex > preflightIndex &&
    requestAuditIndex > membershipLookupIndex &&
    providerCallIndex > requestAuditIndex,
  "Command authorization and network-free local preflight must complete before the atomic reservation and provider call.",
);
const companyConfigExitBlock = commandPost.slice(companyConfigIndex, preflightIndex);
for (const companyConfigExitBoundary of [
  "if (!companyConfig.ok)",
  "No provider call was attempted.",
]) {
  includes(
    companyConfigExitBlock,
    companyConfigExitBoundary,
    `Disabled company AI policy must reject before quota reservation or provider execution: ${companyConfigExitBoundary}`,
  );
}
assert(
  !companyConfigExitBlock.includes("wtos_reserve_ai_request_v1") &&
    !companyConfigExitBlock.includes("runAiPilotCommand({"),
  "Disabled company AI policy must reject before quota reservation or provider execution.",
);
const localExitBlock = commandPost.slice(preflightIndex, requestAuditIndex);
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
  commandPost,
  '.eq("company_id", requestedCompanyId)',
  "Command authorization must query the exact requested company.",
);
includes(
  commandPost,
  "resolveExactAiCompanyAuthorization",
  "Command authorization must use the fail-closed exact-company role validator.",
);
includes(
  commandPost,
  'event_type: "action_proposed"',
  "Every returned action preview must receive a durable action_proposed audit event.",
);
includes(
  commandPost,
  "contractVersion: AI_ACTION_CONTRACT_VERSION",
  "Persisted action previews must bind the explicit review contract version.",
);
includes(
  commandPost,
  '.select("id, metadata")',
  "The command route must reload inserted audit IDs.",
);
includes(
  commandPost,
  "auditReferenceByPreviewId",
  "The command response must surface durable per-preview audit references.",
);
includes(
  commandPost,
  "No provider call was attempted",
  "The provider must fail closed when pre-call audit persistence is unavailable.",
);
includes(
  commandPost,
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
    commandPost,
    quotaBoundary,
    `Atomic AI quota enforcement is missing boundary ${quotaBoundary}.`,
  );
}
assert(
  !commandPost.includes("recordAiRequestInitiated") &&
    commandPost.indexOf("parseQuotaReservation(reservationData, {") >= 0 &&
    commandPost.indexOf("runAiPilotCommand({") >
      commandPost.indexOf("parseQuotaReservation(reservationData, {"),
  "The trusted atomic reservation must replace direct request inserts and precede the provider call.",
);
includes(
  commandPost,
  "result.companyId !== companyId",
  "Persisted AI results must remain bound to the exact authorized company.",
);

for (const companySwitchBoundary of [
  "aiCommandAbortRef.current?.abort()",
  "aiProviderStatusAbortRef.current?.abort()",
  "aiReviewAbortRef.current?.abort()",
  "activeAiCompanyRef.current = activeCompanyId",
  "setAiResponses([])",
  "setAiResponseCompanyId(null)",
  "setAiPilotResult(null)",
  "result.companyId !== requestCompanyId",
  "aiResponseCompanyId === exactAiCompanyId",
  'reviewCompanyId === "all"',
  "currentAiPilotResult?.companyId !== reviewCompanyId",
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
  "companyMap.get(activeCompanyId)",
  "const exactAiCompanyId = exactAiCompany?.id ?? null",
  "const exactAiCompanySelected = exactAiCompanyId !== null",
  "const requestCompanyId = exactAiCompanyId",
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
for (const statusUiBoundary of [
  'useState<AiCompanyPilotStatus | null>(null)',
  '`/api/ai-tools/command?companyId=${encodeURIComponent(requestCompanyId)}`',
  'credentials: "same-origin"',
  'cache: "no-store"',
  "isAiCompanyPilotStatus(payload, requestCompanyId)",
  "activeAiCompanyRef.current !== requestCompanyId",
  "aiProviderStatus?.companyId === exactAiCompanyId",
  "companyId={exactAiCompanyId}",
  'data-testid="ai-provider-status"',
  'data-ai-status-phase={statusPhase}',
  'data-ai-request-company-id={companyId ?? ""}',
  'data-ai-status-request-sequence={String(requestSequence)}',
  'data-ai-status-company-id={status?.companyId ?? ""}',
  'data-ai-monthly-budget-cents={status ? String(status.monthlyBudgetCents) : ""}',
  'role="status"',
  'aria-live="polite"',
  'aria-busy={isLoading}',
  'label={`${formatMoney(status.monthlyBudgetCents / 100)}/month`}',
  'label="External actions disabled"',
  "providerStatus?.usageAccountingConfigured",
  "Usage accounting is not ready for this company. No provider call can run until the required controls are complete.",
  "getAiEndpointErrorMessage(",
  "aiProviderStatusRequestSequenceRef.current + 1",
  "setAiProviderStatusRequestSequence(requestSequence)",
]) {
  includes(
    crmApp,
    statusUiBoundary,
    `Production AI UI status is missing boundary ${statusUiBoundary}.`,
  );
}
for (const browserStatusSuccessBoundary of [
  "buildAiProviderStatusPolicyFixture(companies, target)",
  "assertAiProviderStatusPolicyFixtureCompanies(companies, target)",
  'target.kind === "hosted_non_production"',
  "WEATHERTECH_REGRESSION_COMPANY_ID",
  "IHC_REGRESSION_COMPANY_ID",
  '"503d4701-ea18-4300-a4fa-91eb62cf6609"',
  '"c0ae6238-909a-4273-9841-d044dd42a010"',
  'hostedId: WEATHERTECH_REGRESSION_COMPANY_ID',
  'hostedId: IHC_REGRESSION_COMPANY_ID',
  "target.projectRef !== WEATHERTECH_REGRESSION_SUPABASE_PROJECT_REF",
  "company.name !== name",
  "company.trade !== trade",
  'trade: "roofing"',
  'trade: "painting"',
  'enabledGroups.has("ai-tools")',
  "seedAiProviderStatusPolicies(env, aiProviderStatusPolicyFixture)",
  "expected zero pre-existing company policies",
  'ai_enabled: false',
  'daily_request_limit: 1',
  'per_user_daily_request_limit: 1',
  'per_company_monthly_budget_cents: 5000',
  'expensive_task_confirmation_cents: 100',
  'token_limit: 32000',
  'timeout_ms: 15000',
  'retry_limit: 1',
  "row.company_id !== expected.company_id",
  "row.daily_request_limit !== 1",
  "row.per_user_daily_request_limit !== 1",
  "row.expensive_task_confirmation_cents !== 100",
  "row.token_limit !== 32000",
  "row.timeout_ms !== 15000",
  "row.retry_limit !== 1",
  "row.last_reviewed_at !== null",
  'phase !== "loaded"',
  'budgetCents !== "5000"',
  'card.getAttribute("data-ai-enabled") !== "false"',
  'text.includes("$50/month")',
  'text.includes("usage accounting is not ready for this company")',
  'text.includes("no provider call can run")',
  'text.includes("usage accounting is configured")',
  'message.includes("ai provider access is disabled for this company")',
  'message.includes("no provider call was attempted")',
  'message.includes("showing local rule-based fallback")',
  "cleanupAiProviderStatusPolicies(",
  "`ai_usage_limits?id=in.${idFilter}`",
  'deleted.some((row) => !fixture.ids.includes(row.id))',
  'findByIds(env, "ai_usage_limits", fixture.ids)',
  "databaseResidueCount: remaining.length",
  "cleanup.aiProviderStatusPolicies = await cleanupAiProviderStatusPolicies(",
  "Cleanup AI status policies: ${JSON.stringify(result.cleanup.aiProviderStatusPolicies)}",
]) {
  includes(
    browserRegression,
    browserStatusSuccessBoundary,
    `The Browser regression must prove and clean a successful safe AI status fixture: ${browserStatusSuccessBoundary}`,
  );
}
assert(
  !browserRegression.includes('!["loaded", "error"].includes(phase)'),
  "The Browser regression must not accept an error response as successful AI status evidence.",
);
for (const staleProviderClaim of [
  "AI provider not configured",
  "Live AI is disabled",
  "AI_ENABLED=false",
  "disabled / not selected",
  "Live AI provider is not configured",
  "Live model provider not configured",
  "rule-based disabled-provider mode",
  "whether production activation is disabled",
  '?? "provider disabled"',
]) {
  assert(
    !`${crmApp}\n${aiToolsSource}`.includes(staleProviderClaim),
    `The Production AI UI must not retain stale provider claim: ${staleProviderClaim}.`,
  );
}
for (const companyScopeHydrationBoundary of [
  'useState<CompanyScopeId>("all")',
  "companyScopeStorageReady",
  'window.localStorage.getItem("weathertech-company-scope")',
  "snapshot.companies.some((company) => company.id === storedCompanyId)",
]) {
  includes(
    crmApp,
    companyScopeHydrationBoundary,
    `Company scope hydration is missing safe boundary ${companyScopeHydrationBoundary}.`,
  );
}
for (const browserStatusBoundary of [
  "async function waitForAiProviderStatus(",
  'phase !== "loaded"',
  "requestSequence <= priorRequestSequence",
  "async function getAiProviderStatusRequestSequence(tab)",
  'card.getAttribute("data-ai-status-request-sequence")',
  "const weatherTechRequestSequenceBaseline =",
  "const ihcRequestSequenceBaseline = await getAiProviderStatusRequestSequence(tab)",
  "const weatherTechReturnRequestSequenceBaseline =",
  'differentFromCompanyId: weatherTechProviderStatus.requestCompanyId',
  'expectedCompanyId: weatherTechProviderStatus.requestCompanyId',
  'differentFromCompanyId: ihcProviderStatus.requestCompanyId',
]) {
  includes(
    browserRegression,
    browserStatusBoundary,
    `Browser regression must exercise company-bound asynchronous AI status: ${browserStatusBoundary}.`,
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
  commandPost,
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
  "aiCommandAbortRef.current?.abort();\n    aiProviderStatusAbortRef.current?.abort();\n    aiReviewAbortRef.current?.abort();",
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
