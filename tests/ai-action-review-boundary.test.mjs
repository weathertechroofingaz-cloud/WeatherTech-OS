import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

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
const statusQuotaCapabilityIndex = statusRoute.indexOf(
  "await verifySupabaseAiQuotaServiceCapability()",
);
const statusSavedAnalysesIndex = statusRoute.indexOf('.from("ai_saved_analyses")');
const statusBuildIndex = statusRoute.indexOf("buildAiCompanyPilotStatus({");
assert(
  statusAuthIndex >= 0 &&
    statusMembershipIndex > statusAuthIndex &&
    statusPolicyIndex > statusMembershipIndex &&
    statusQuotaCapabilityIndex > statusPolicyIndex &&
    statusSavedAnalysesIndex > statusPolicyIndex &&
    statusSavedAnalysesIndex > statusMembershipIndex &&
    statusBuildIndex > statusSavedAnalysesIndex &&
    statusBuildIndex > statusQuotaCapabilityIndex &&
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
  "await verifySupabaseAiQuotaServiceCapability()",
  "The audited AI quota service is unavailable. Production AI status is not ready.",
  '.from("ai_saved_analyses")',
  '{ head: true }',
  '.eq("company_id", authorization.companyId)',
  "savedAnalysesReadAvailable: savedAnalysesReadProbe.error === null",
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
    !statusRoute.includes(".rpc(") &&
    !statusRoute.includes(".insert(") &&
    !statusRoute.includes(".upsert(") &&
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
  "export async function verifySupabaseAiQuotaServiceCapability",
  'document.swagger !== "2.0"',
  '"get" in rpcPath',
  'new URL("/rest/v1/", config.url)',
  'Accept: "application/openapi+json"',
  '"Accept-Profile": "public"',
  "apikey: config.serviceRoleKey",
  "Authorization: `Bearer ${config.serviceRoleKey}`",
  'cache: "no-store"',
  'redirect: "error"',
  "AbortSignal.timeout(SUPABASE_OPENAPI_TIMEOUT_MS)",
  "SUPABASE_OPENAPI_MAX_BYTES",
  "AI_QUOTA_CAPABILITY_SUCCESS_TTL_MS = 60_000",
  "AI_QUOTA_CAPABILITY_FAILURE_TTL_MS = 5_000",
  "const aiQuotaCapabilityCache = new WeakMap",
  'createHash("sha256")',
  "if (cacheEntry.inFlight)",
  "return cacheEntry.inFlight",
  "cacheEntry.expiresAt > checkedAt",
  'const AI_QUOTA_RPC_PATH = "/rpc/wtos_reserve_ai_request_v1"',
  '"p_company_id"',
  '"p_actor_user_id"',
  '"p_request_id"',
  '"p_request"',
  "hasExactAiQuotaRpcContract(JSON.parse(responseText) as unknown)",
  "await response.body?.cancel()",
  "const config = readSupabaseServiceRoleConfig(process.env)",
  "createClient<Database>(config.url, config.serviceRoleKey",
]) {
  includes(
    supabaseService,
    serviceBoundary,
    `The status and command paths must share the exact service-role readiness predicate: ${serviceBoundary}`,
  );
}
const quotaCapabilityStart = supabaseService.indexOf(
  "export async function verifySupabaseAiQuotaServiceCapability",
);
const serviceClientStart = supabaseService.indexOf(
  "export function getSupabaseServiceRoleClient",
);
const quotaCapabilitySource = supabaseService.slice(
  quotaCapabilityStart,
  serviceClientStart,
);
assert(
  quotaCapabilityStart >= 0 &&
    serviceClientStart > quotaCapabilityStart &&
    !quotaCapabilitySource.includes("createClient") &&
    !quotaCapabilitySource.includes(".rpc(") &&
    !quotaCapabilitySource.includes("console.") &&
    !quotaCapabilitySource.includes("responseText:"),
  "The quota capability probe must remain non-mutating and must not log or return credentials or the OpenAPI document.",
);
assert(
  !statusRoute.includes("hasSupabaseServiceRoleConfig()"),
  "Configuration-string presence alone must never gate the Production AI enabled status.",
);

const compiledSupabaseService = ts.transpileModule(supabaseService, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const serviceModuleUnderTest = { exports: {} };
const requireForServiceTest = (specifier) => {
  if (specifier === "server-only") {
    return {};
  }
  if (specifier === "@supabase/supabase-js") {
    return {
      createClient() {
        throw new Error("The read-only capability test must not create a Supabase client.");
      },
    };
  }
  if (specifier === "node:crypto") {
    return { createHash };
  }
  throw new Error(`Unexpected service module dependency: ${specifier}`);
};
new Function("require", "module", "exports", compiledSupabaseService)(
  requireForServiceTest,
  serviceModuleUnderTest,
  serviceModuleUnderTest.exports,
);
const { verifySupabaseAiQuotaServiceCapability } =
  serviceModuleUnderTest.exports;

function exactQuotaOpenApiDocument() {
  return {
    swagger: "2.0",
    paths: {
      "/rpc/wtos_reserve_ai_request_v1": {
        post: {
          parameters: [
            {
              in: "body",
              name: "args",
              required: true,
              schema: {
                properties: {
                  p_actor_user_id: { format: "uuid", type: "string" },
                  p_company_id: { format: "uuid", type: "string" },
                  p_request: { format: "jsonb" },
                  p_request_id: { format: "uuid", type: "string" },
                },
                required: [
                  "p_company_id",
                  "p_actor_user_id",
                  "p_request_id",
                  "p_request",
                ],
                type: "object",
              },
            },
            { $ref: "#/parameters/preferParams" },
          ],
          responses: { 200: { description: "OK" } },
        },
      },
    },
  };
}

function openApiResponse(body, options = {}) {
  return new Response(body, {
    status: options.status ?? 200,
    headers: {
      "content-type": options.contentType ?? "application/openapi+json; charset=utf-8",
    },
  });
}

const testServiceEnv = {
  NEXT_PUBLIC_SUPABASE_URL: " https://quota-capability.test ",
  SUPABASE_SERVICE_ROLE_KEY: " unit-test-service-role-secret ",
};
let capabilityFetchCalls = 0;
let capturedCapabilityRequest = null;
const validQuotaCapability = await verifySupabaseAiQuotaServiceCapability(
  testServiceEnv,
  async (input, init) => {
    capabilityFetchCalls += 1;
    capturedCapabilityRequest = { input: String(input), init };
    return openApiResponse(JSON.stringify(exactQuotaOpenApiDocument()));
  },
);
assert(validQuotaCapability, "The exact service-role quota RPC contract must pass.");
assert(
  capabilityFetchCalls === 1 &&
    capturedCapabilityRequest?.input === "https://quota-capability.test/rest/v1/" &&
    capturedCapabilityRequest?.init?.method === "GET" &&
    capturedCapabilityRequest?.init?.cache === "no-store" &&
    capturedCapabilityRequest?.init?.redirect === "error" &&
    capturedCapabilityRequest?.init?.headers?.Accept === "application/openapi+json" &&
    capturedCapabilityRequest?.init?.headers?.["Accept-Profile"] === "public" &&
    capturedCapabilityRequest?.init?.headers?.apikey ===
      "unit-test-service-role-secret" &&
    capturedCapabilityRequest?.init?.headers?.Authorization ===
      "Bearer unit-test-service-role-secret" &&
    !capturedCapabilityRequest.input.includes("unit-test-service-role-secret"),
  "The capability request must be an exact, non-cached, server-authenticated schema read without credentials in the URL.",
);

let coalescedFetchCalls = 0;
let resolveCoalescedFetch = null;
let capabilityNow = 1_000;
const coalescedFetcher = async () => {
  coalescedFetchCalls += 1;
  await new Promise((resolve) => {
    resolveCoalescedFetch = resolve;
  });
  return openApiResponse(JSON.stringify(exactQuotaOpenApiDocument()));
};
const firstCoalescedCapability = verifySupabaseAiQuotaServiceCapability(
  testServiceEnv,
  coalescedFetcher,
  () => capabilityNow,
);
const secondCoalescedCapability = verifySupabaseAiQuotaServiceCapability(
  testServiceEnv,
  coalescedFetcher,
  () => capabilityNow,
);
await Promise.resolve();
assert(
  coalescedFetchCalls === 1 && typeof resolveCoalescedFetch === "function",
  "Concurrent status checks must coalesce into one quota capability request.",
);
resolveCoalescedFetch();
assert(
  (await firstCoalescedCapability) === true &&
    (await secondCoalescedCapability) === true,
  "Every coalesced caller must receive the same successful capability result.",
);
capabilityNow = 60_999;
assert(
  (await verifySupabaseAiQuotaServiceCapability(
    testServiceEnv,
    coalescedFetcher,
    () => capabilityNow,
  )) === true && coalescedFetchCalls === 1,
  "A successful capability result must be reused only within its bounded TTL.",
);
capabilityNow = 61_001;
const expiredCapability = verifySupabaseAiQuotaServiceCapability(
  testServiceEnv,
  coalescedFetcher,
  () => capabilityNow,
);
await Promise.resolve();
assert(
  coalescedFetchCalls === 2 && typeof resolveCoalescedFetch === "function",
  "An expired capability result must trigger one fresh request.",
);
resolveCoalescedFetch();
assert(
  (await expiredCapability) === true,
  "The refreshed capability request must update the bounded cache.",
);

let failedCapabilityFetchCalls = 0;
let failedCapabilityNow = 2_000;
const failedCapabilityFetcher = async () => {
  failedCapabilityFetchCalls += 1;
  return openApiResponse("{}", { status: 401 });
};
assert(
  (await verifySupabaseAiQuotaServiceCapability(
    testServiceEnv,
    failedCapabilityFetcher,
    () => failedCapabilityNow,
  )) === false && failedCapabilityFetchCalls === 1,
  "A rejected service credential must fail closed.",
);
failedCapabilityNow = 6_999;
assert(
  (await verifySupabaseAiQuotaServiceCapability(
    testServiceEnv,
    failedCapabilityFetcher,
    () => failedCapabilityNow,
  )) === false && failedCapabilityFetchCalls === 1,
  "A failed capability result must be briefly cached to bound outage polling.",
);
failedCapabilityNow = 7_001;
assert(
  (await verifySupabaseAiQuotaServiceCapability(
    testServiceEnv,
    failedCapabilityFetcher,
    () => failedCapabilityNow,
  )) === false && failedCapabilityFetchCalls === 2,
  "A failed capability result must retry after its shorter bounded TTL.",
);

let missingConfigFetchCalls = 0;
assert(
  !(await verifySupabaseAiQuotaServiceCapability({}, async () => {
    missingConfigFetchCalls += 1;
    return openApiResponse(JSON.stringify(exactQuotaOpenApiDocument()));
  })) && missingConfigFetchCalls === 0,
  "Missing service-role configuration must fail before a network request.",
);

async function rejectsQuotaCapability(responseFactory) {
  return !(await verifySupabaseAiQuotaServiceCapability(
    testServiceEnv,
    responseFactory,
  ));
}

const invalidQuotaDocuments = [
  {},
  { swagger: "3.0", paths: exactQuotaOpenApiDocument().paths },
  { swagger: "2.0", paths: {} },
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].get = {};
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    delete document.paths["/rpc/wtos_reserve_ai_request_v1"].post;
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.required.pop();
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.required = [
      "p_company_id",
      "p_actor_user_id",
      "p_request_id",
      "p_request_id",
    ];
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.properties.extra = {
      type: "string",
    };
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    delete document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.properties.p_company_id;
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.properties.p_actor_user_id.type =
      "number";
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.properties.p_request_id.format =
      "text";
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_reserve_ai_request_v1"].post.parameters[0].schema.properties.p_request.format =
      "json";
    return document;
  })(),
];
for (const invalidDocument of invalidQuotaDocuments) {
  assert(
    await rejectsQuotaCapability(async () =>
      openApiResponse(JSON.stringify(invalidDocument)),
    ),
    "A stale, missing, overloaded, or mismatched quota RPC contract must fail closed.",
  );
}
for (const invalidResponseFactory of [
  async () => openApiResponse("{}", { status: 401 }),
  async () => openApiResponse("{}", { contentType: "application/json" }),
  async () => openApiResponse("not-json"),
  async () =>
    openApiResponse(
      `${"x".repeat(2 * 1024 * 1024 + 1)}`,
    ),
  async () => new Response(null, { status: 200, headers: { "content-type": "application/openapi+json" } }),
  async () => {
    throw new Error("synthetic network failure");
  },
]) {
  assert(
    await rejectsQuotaCapability(invalidResponseFactory),
    "Credential, media-type, parse, size, body, and network failures must fail closed.",
  );
}
for (const savedAnalysesStatusBoundary of [
  "savedAnalysesReadAvailable: boolean;",
  "savedAnalysesReadAvailable = false",
  "migrationApplied: savedAnalysesReadAvailable",
  "savedAnalysesReadAvailable,",
]) {
  includes(
    aiProvider,
    savedAnalysesStatusBoundary,
    `Saved-analysis schema readiness must remain a sanitized fail-closed status boolean: ${savedAnalysesStatusBoundary}`,
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
const providerRunStart = aiProvider.indexOf(
  "export async function runAiPilotCommand({",
);
const providerCallStart = aiProvider.indexOf(
  "providerResult = await callConfiguredProvider({",
  providerRunStart,
);
const providerTryStart = aiProvider.lastIndexOf("try {", providerCallStart);
const providerFailureBranch = aiProvider.indexOf(
  "if (!providerResult.ok)",
  providerCallStart,
);
const providerCallBoundary = aiProvider.slice(
  providerTryStart,
  providerFailureBranch,
);
assert(
  providerRunStart >= 0 &&
    providerTryStart > providerRunStart &&
    providerCallStart > providerRunStart &&
    providerFailureBranch > providerCallStart,
  "The live AI provider call must have a distinct fail-closed boundary.",
);
for (const providerFailureBoundary of [
  "try {",
  "catch (error)",
  "if (signal?.aborted)",
  "throw error",
  "AI provider request failed or timed out.",
  "statusCode: null",
  "providerResponseId: null",
]) {
  includes(
    providerCallBoundary,
    providerFailureBoundary,
    `Thrown provider failures are missing boundary ${providerFailureBoundary}.`,
  );
}
assert(
  !providerCallBoundary.includes("error.message") &&
    !providerCallBoundary.includes("String(error)") &&
    !providerCallBoundary.includes("JSON.stringify(error)"),
  "Provider failure normalization must not expose a caught provider error.",
);
for (const retryBoundary of [
  "Math.max(0, Math.min(parseInteger(env.AI_RETRY_LIMIT, 1), 2))",
  "isIntegerWithin(config.retryLimit, 0, aiQuotaBounds.maxProviderAttempts - 1)",
  "const maxProviderAttempts = config.retryLimit + 1",
]) {
  includes(
    aiProvider,
    retryBoundary,
    `AI retry configuration is missing boundary ${retryBoundary}.`,
  );
}
for (const quotaContractBoundary of [
  "maxModelCharacters: 160",
  "maxPromptCharacters: 50_000",
  "maxTokens: 1_000_000",
  "maxEstimatedCostCents: 100_000_000",
  "maxProviderAttempts: 3",
  "maxDailyRequests: 100_000",
  "maxDailyBudgetCents: 100_000_000",
  "maxCompanyMonthlyBudgetCents: 1_000_000_000",
  "export function isAiQuotaReservationRequestWithinBounds(",
  "export function isAiQuotaReservationReceiptWithinBounds(",
  "request.estimatedRequestTokens >= Math.ceil(request.promptCharacters / 8)",
  "request.estimatedRequestTokens <= request.maxRequestTokens",
  "request.estimatedCostCents <= request.dailyBudgetCents",
  "request.estimatedCostCents <= request.companyMonthlyBudgetCents",
  "maximumEstimatedCostUsd * 100 * maxProviderAttempts",
  "hasQuotaCompatibleProviderConfig(",
]) {
  includes(
    aiProvider,
    quotaContractBoundary,
    `AI quota readiness is missing bounded contract ${quotaContractBoundary}.`,
  );
}
for (const quotaSqlBound of [
  "length(request_model) not between 1 and 160",
  "prompt_characters not between 1 and 50000",
  "estimated_request_tokens not between 1 and 1000000",
  "max_response_tokens not between 1 and 1000000",
  "estimated_cost_cents not between 0 and 100000000",
  "max_provider_attempts not between 1 and 3",
  "global_daily_request_limit not between 1 and 100000",
  "company_daily_request_limit not between 1 and 100000",
  "user_daily_request_limit not between 1 and 100000",
  "daily_budget_cents not between 1 and 100000000",
  "company_monthly_budget_cents not between 1 and 1000000000",
  "max_request_tokens not between 1 and 1000000",
  "estimated_request_tokens > max_request_tokens",
]) {
  includes(
    automationMigration,
    quotaSqlBound,
    `The shared TypeScript quota bounds must stay paired with migration contract ${quotaSqlBound}.`,
  );
}
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
  "const quotaRequest = {",
  "isAiQuotaReservationRequestWithinBounds(quotaRequest)",
  "isAiQuotaReservationReceiptWithinBounds(receipt)",
  'serviceClient.rpc("wtos_reserve_ai_request_v1"',
  "p_request: quotaRequest",
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
const quotaRequestBuildIndex = commandPost.indexOf("const quotaRequest = {");
const quotaRequestValidationIndex = commandPost.indexOf(
  "isAiQuotaReservationRequestWithinBounds(quotaRequest)",
  quotaRequestBuildIndex,
);
const quotaReservationRpcIndex = commandPost.indexOf(
  'serviceClient.rpc("wtos_reserve_ai_request_v1"',
  quotaRequestValidationIndex,
);
assert(
  quotaRequestBuildIndex >= 0 &&
    quotaRequestValidationIndex > quotaRequestBuildIndex &&
    quotaReservationRpcIndex > quotaRequestValidationIndex,
  "The exact quota request must pass the shared bounded validator before the reservation RPC.",
);
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
  "setAiPilotResultEvidence(null)",
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
  'data-ai-runtime-provider-health={runtimeProviderHealth ?? "not_tested"}',
  'role="status"',
  'aria-live="polite"',
  'aria-busy={isLoading}',
  'label={`${formatMoney(status.monthlyBudgetCents / 100)}/month`}',
  'label="External actions disabled"',
  'tone={status.readiness.migrationStatus === "applied" ? "blue" : "amber"}',
  "providerStatus?.usageAccountingConfigured",
  "Usage accounting is not ready for this company. No provider call can run until the required controls are complete.",
  "getAiEndpointErrorMessage(",
  "aiProviderStatusRequestSequenceRef.current + 1",
  "setAiProviderStatusRequestSequence(requestSequence)",
  "statusRefreshSequence: number",
  "[exactAiCompanyId, statusRefreshSequence]",
  "const [aiProviderStatusRefreshSequence, setAiProviderStatusRefreshSequence]",
  "await onScrollPreservingReload()",
  "setAiProviderStatusRefreshSequence((current) => current + 1)",
  'data-testid="workspace-refresh"',
  "statusRefreshSequence={aiProviderStatusRefreshSequence}",
  "type AiPilotResultEvidence = {",
  "statusRefreshSequence: number",
  "const requestStatusRefreshSequence = statusRefreshSequence",
  "setAiPilotResultEvidence({",
  "statusRefreshSequence: requestStatusRefreshSequence",
  "aiPilotResultEvidence.statusRefreshSequence === statusRefreshSequence",
  "result={currentAiPilotResult}",
  'data-ai-current-command-result={result ? "true" : "false"}',
  "runtimeProviderHealth={currentAiRuntimeProviderHealth}",
  "getCurrentAiRuntimeProviderHealth({",
  "setAiRuntimeProviderHealth(null)",
  "if (result.providerHealth.tested)",
  'state: result.providerHealth.ok ? "ready" : "failed"',
  "!runtimeProviderFailed && status?.aiEnabled && status.readiness.liveProviderEnabled",
  "runtimeProviderFailed",
  "Provider test failed",
  'typeof status.savedAnalysesReadAvailable === "boolean"',
  "currentAiProviderStatus?.savedAnalysesReadAvailable === true",
  'data-testid="ai-saved-work"',
  'data-ai-saved-analyses-phase={savedAnalysesReadPhase}',
  'data-ai-saved-analyses-read-available={',
  'data-ai-saved-analyses-company-id={currentAiProviderStatus?.companyId ?? ""}',
  "Authenticated company-scoped saved-analysis read path verified.",
  'label={savedAnalysesReadAvailable ? "Read path verified" : "Not verified"}',
]) {
  includes(
    crmApp,
    statusUiBoundary,
    `Production AI UI status is missing boundary ${statusUiBoundary}.`,
  );
}
for (const runtimeHealthSelectorBoundary of [
  "export function getCurrentAiRuntimeProviderHealth({",
  "evidence.companyId !== companyId",
  "evidence.statusRefreshSequence !== statusRefreshSequence",
  'evidence.state === "ready" || evidence.state === "failed"',
]) {
  includes(
    aiToolsSource,
    runtimeHealthSelectorBoundary,
    `Runtime provider-health selection is missing boundary ${runtimeHealthSelectorBoundary}.`,
  );
}
const workspaceRefreshIndex = crmApp.indexOf("const handleWorkspaceRefresh = useCallback");
const refreshGenerationIndex = crmApp.indexOf(
  "setAiProviderStatusRefreshSequence((current) => current + 1)",
  workspaceRefreshIndex,
);
const workspaceReloadIndex = crmApp.indexOf(
  "await onScrollPreservingReload()",
  workspaceRefreshIndex,
);
assert(
  workspaceRefreshIndex >= 0 &&
    refreshGenerationIndex > workspaceRefreshIndex &&
    workspaceReloadIndex > refreshGenerationIndex,
  "Workspace Refresh must invalidate AI evidence before beginning the snapshot reload.",
);
const runtimeProviderHealthWriteIndex = crmApp.indexOf(
  "setAiRuntimeProviderHealth({",
  crmApp.indexOf("const runAiCommandPrompt = async"),
);
const runtimeProviderHealthWriteBoundary = crmApp.slice(
  runtimeProviderHealthWriteIndex,
  runtimeProviderHealthWriteIndex + 360,
);
for (const runtimeEvidenceBoundary of [
  "companyId: requestCompanyId",
  "statusRefreshSequence: requestStatusRefreshSequence",
  'state: result.providerHealth.ok ? "ready" : "failed"',
]) {
  includes(
    runtimeProviderHealthWriteBoundary,
    runtimeEvidenceBoundary,
    `Runtime provider-health evidence is missing boundary ${runtimeEvidenceBoundary}.`,
  );
}
for (const stalePersistenceClaim of [
  "Production persistence is deployed",
  "Persistence available",
  "Saved AI persistence is deployed",
]) {
  assert(
    !`${crmApp}\n${aiToolsSource}`.includes(stalePersistenceClaim),
    `The AI workspace must not claim unverified persistence: ${stalePersistenceClaim}.`,
  );
}
for (const browserStatusSuccessBoundary of [
  "buildAiProviderStatusPolicyFixture(companies, target, runId)",
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
  '"wtos-browser-ai-status-policy-v1:"',
  "AI_PROVIDER_STATUS_POLICY_STALE_MS = 15 * 60 * 1000",
  'allowed_models: ["gpt-5.6-terra", marker]',
  "getAiProviderStatusPolicyRunId(row)",
  "return /^[0-9]{17}$/.test(runId) ? runId : null",
  "findAiProviderStatusPolicyRecoveryCandidates(env, fixture)",
  "recoverInterruptedAiProviderStatusPolicies(",
  "AI status policy recovery found an unrecognized or modified company policy; refusing to delete it.",
  "AI status policy recovery found a fresh fixture from a potentially concurrent run; refusing to delete it.",
  "updated_at=eq.${encodeURIComponent(row.updated_at)}",
  "fixture.cleanupAuthorized = true",
  "AI status fixture cleanup was not authorized by exact preflight.",
  "await seedAiProviderStatusPolicies(",
  "expected zero pre-existing company policies",
  'ai_enabled: false',
  'daily_request_limit: 1',
  'per_user_daily_request_limit: 1',
  'per_company_monthly_budget_cents: 5000',
  'expensive_task_confirmation_cents: 100',
  'token_limit: 32000',
  'timeout_ms: 15000',
  'retry_limit: 1',
  "row.company_id === expected.company_id",
  "row.daily_request_limit === 1",
  "row.per_user_daily_request_limit === 1",
  "row.expensive_task_confirmation_cents === 100",
  "row.token_limit === 32000",
  "row.timeout_ms === 15000",
  "row.retry_limit === 1",
  "row.last_reviewed_at === null",
  'phase !== "loaded"',
  'budgetCents !== "5000"',
  'card.getAttribute("data-ai-enabled") !== "false"',
  'card.getAttribute("data-ai-runtime-provider-health") !== "not_tested"',
  'savedWork.getAttribute("data-ai-saved-analyses-phase") !== "loaded"',
  'savedWork.getAttribute("data-ai-saved-analyses-read-available") !== "true"',
  'savedWork.getAttribute("data-ai-saved-analyses-company-id") !==',
  '"authenticated company-scoped saved-analysis read path verified"',
  'allCompanyGate.savedAnalysesPhase !== "selection_required"',
  'allCompanyGate.savedAnalysesReadAvailable !== "false"',
  'allCompanyGate.savedAnalysesCompanyId !== ""',
  'text.includes("$50/month")',
  'text.includes("usage accounting is not ready for this company")',
  'text.includes("no provider call can run")',
  'text.includes("usage accounting is configured")',
  'message.includes("ai provider access is disabled for this company")',
  'message.includes("no provider call was attempted")',
  'message.includes("showing local rule-based fallback")',
  "cleanupAiProviderStatusPolicies(",
  "`ai_usage_limits?id=eq.${encodeURIComponent(row.id)}&updated_at=eq.${encodeURIComponent(row.updated_at)}`",
  'deleted.some((row) => !fixture.ids.includes(row.id))',
  'findByIds(env, "ai_usage_limits", fixture.ids)',
  "databaseResidueCount: remaining.length",
  "cleanup.aiProviderStatusPolicyRecovery =",
  "cleanup.aiProviderStatusPolicies =",
  "Cleanup AI status policy recovery: ${JSON.stringify(result.cleanup.aiProviderStatusPolicyRecovery)}",
  "Cleanup AI status policies: ${JSON.stringify(result.cleanup.aiProviderStatusPolicies)}",
]) {
  includes(
    browserRegression,
    browserStatusSuccessBoundary,
    `The Browser regression must prove and clean a successful safe AI status fixture: ${browserStatusSuccessBoundary}`,
  );
}
const policyRecoveryIndex = browserRegression.indexOf(
  "await recoverInterruptedAiProviderStatusPolicies(",
);
const policySeedIndex = browserRegression.indexOf(
  "await seedAiProviderStatusPolicies(",
  policyRecoveryIndex,
);
assert(
  policyRecoveryIndex >= 0 && policySeedIndex > policyRecoveryIndex,
  "AI status policy recovery must complete before the current run can seed policies.",
);
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
  "const weatherTechRefreshRequestSequenceBaseline =",
  'locator(\'[data-testid="workspace-refresh"]\')',
  '"AI workspace header refresh"',
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
