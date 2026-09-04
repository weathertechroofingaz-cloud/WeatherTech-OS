import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const cwd = process.cwd();
const commandRoute = readFileSync(
  join(cwd, "app/api/ai-tools/command/route.ts"),
  "utf8",
);
const statusRoute = readFileSync(
  join(cwd, "app/api/ai-tools/status/route.ts"),
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
const commandRouteStart = commandRoute.indexOf("export async function POST(");
const commandPost = commandRoute.slice(commandRouteStart);
const statusHandlerStart = statusRoute.indexOf(
  "async function readAiCompanyPilotStatus({",
);
const statusGetStart = statusRoute.indexOf("export async function GET(");
const statusRefreshPostStart = statusRoute.indexOf("export async function POST(");
const statusHandler = statusRoute.slice(statusHandlerStart, statusGetStart);
const statusGet = statusRoute.slice(statusGetStart, statusRefreshPostStart);
const statusRefreshPost = statusRoute.slice(statusRefreshPostStart);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includes(source, value, message) {
  assert(source.includes(value), message);
}

assert(
  statusHandlerStart >= 0 &&
    statusGetStart > statusHandlerStart &&
    statusRefreshPostStart > statusGetStart &&
    commandRouteStart >= 0 &&
    !commandRoute.includes("export async function GET(") &&
    !commandRoute.includes("x-wtos-ai-quota-probe-refresh"),
  "Production AI status must expose a distinct read-only GET and rate-limited explicit-refresh POST.",
);
const statusAuthIndex = statusHandler.indexOf("client.auth.getUser()");
const statusMembershipIndex = statusHandler.indexOf('.from("company_memberships")');
const statusPolicyIndex = statusHandler.indexOf('.from("ai_usage_limits")');
const statusQuotaCapabilityIndex = statusHandler.indexOf(
  "await verifySupabaseAiQuotaServiceCapability()",
);
const statusCompanyConfigIndex = statusHandler.indexOf(
  "const companyConfig = resolveCompanyAiProviderConfig({",
);
const statusQuotaProbeRefreshClaimIndex = statusHandler.indexOf(
  "await claimSupabaseAiQuotaProbeRefresh({",
);
const statusQuotaProbeCacheIndex = statusHandler.indexOf(
  "await readCachedAiQuotaProbeEstimatedRequestTokens({",
);
const statusQuotaSnapshotIndex = statusHandler.indexOf(
  "const quotaProbeSnapshot = await fetchCrmSnapshot(client)",
);
const statusQuotaEstimateIndex = statusHandler.indexOf(
  "return estimateAiQuotaStatusProbe({",
);
const statusQuotaReadIndex = statusHandler.indexOf(
  "await readSupabaseAiQuotaStatus({",
);
const statusQuotaParseIndex = statusHandler.indexOf(
  "parseAiQuotaStatusReceipt(quotaStatusPayload",
);
const statusSavedAnalysesIndex = statusHandler.indexOf('.from("ai_saved_analyses")');
const statusBuildIndex = statusHandler.indexOf("buildAiCompanyPilotStatus({");
assert(
  statusAuthIndex >= 0 &&
    statusMembershipIndex > statusAuthIndex &&
    statusPolicyIndex > statusMembershipIndex &&
    statusQuotaCapabilityIndex > statusPolicyIndex &&
    statusCompanyConfigIndex > statusQuotaCapabilityIndex &&
    statusQuotaProbeRefreshClaimIndex > statusCompanyConfigIndex &&
    statusQuotaProbeCacheIndex > statusQuotaProbeRefreshClaimIndex &&
    statusQuotaSnapshotIndex > statusQuotaProbeCacheIndex &&
    statusQuotaEstimateIndex > statusQuotaSnapshotIndex &&
    statusQuotaReadIndex > statusQuotaEstimateIndex &&
    statusQuotaParseIndex > statusQuotaReadIndex &&
    statusSavedAnalysesIndex > statusPolicyIndex &&
    statusSavedAnalysesIndex > statusQuotaParseIndex &&
    statusSavedAnalysesIndex > statusMembershipIndex &&
    statusBuildIndex > statusSavedAnalysesIndex &&
    statusBuildIndex > statusQuotaCapabilityIndex &&
    statusBuildIndex > statusPolicyIndex,
  "AI status must authenticate and authorize the exact company before reading its policy.",
);
for (const statusBoundary of [
  "requestedCompanyId: string",
  "explicitRefresh: boolean",
  "resolveExactAiCompanyAuthorization",
  '.eq("user_id", user.id)',
  '.eq("company_id", requestedCompanyId)',
  '.eq("company_id", authorization.companyId)',
  ".limit(2)",
  "policyRows?.length !== 1",
  "getAiPilotProviderConfig()",
  "await verifySupabaseAiQuotaServiceCapability()",
  "The audited AI quota service is unavailable. Production AI status is not ready.",
  "buildAiQuotaStatusRequest({",
  "await readCachedAiQuotaProbeEstimatedRequestTokens({",
  "actorUserId: user.id",
  "policyId: companyPolicy.id",
  "policyUpdatedAt: companyPolicy.updated_at",
  "const quotaProbeSnapshot = await fetchCrmSnapshot(client)",
  "estimateAiQuotaStatusProbe({",
  "companyId: authorization.companyId",
  "userRole: authorization.role",
  "estimatedRequestTokens: quotaProbeEstimatedRequestTokens",
  "await readSupabaseAiQuotaStatus({",
  "parseAiQuotaStatusReceipt(quotaStatusPayload",
  "Current audited AI quota capacity could not be verified. Production AI status is unavailable.",
  '.from("ai_saved_analyses")',
  '{ head: true }',
  '.eq("company_id", authorization.companyId)',
  "savedAnalysesReadAvailable: savedAnalysesReadProbe.error === null",
  "quotaStatus,",
  "quotaProbeEstimatedRequestTokens,",
  "await claimSupabaseAiQuotaProbeRefresh({",
  "if (!refreshClaim.allowed)",
  'code: "ai_quota_probe_refresh_rate_limited"',
  "{ \"Retry-After\": String(refreshClaim.retryAfterSeconds) }",
  "forceRefresh: refreshClaimed",
  'statusResponse.headers.set(REFRESH_ACKNOWLEDGEMENT_HEADER, "1")',
  "const statusResponse = noStoreJson(status, 200)",
  "return statusResponse",
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
  "Production AI status must remain authenticated, exact-company scoped, and free of provider, quota-reservation, or business-data mutations.",
);
assert(
  statusGet.includes("request.headers.has(LEGACY_FORCE_REFRESH_HEADER)") &&
    statusGet.includes("explicitRefresh: false") &&
    !statusGet.includes("claimSupabaseAiQuotaProbeRefresh") &&
    statusRefreshPost.includes('contentType !== "application/json"') &&
    statusRefreshPost.includes("readBoundedJsonBody(request, MAX_AI_STATUS_BODY_BYTES)") &&
    statusRefreshPost.includes("Object.keys(body).length !== 1") &&
    statusRefreshPost.includes("explicitRefresh: true"),
  "Safe GET must reject the legacy override, while only the bounded JSON POST can request a durable explicit refresh.",
);
const statusRefreshClaimUnavailableIndex = statusHandler.indexOf(
  "if (!refreshClaim)",
  statusQuotaProbeRefreshClaimIndex,
);
const statusRefreshClaimDeniedIndex = statusHandler.indexOf(
  "if (!refreshClaim.allowed)",
  statusRefreshClaimUnavailableIndex,
);
const statusRefreshDeniedResponseIndex = statusHandler.indexOf(
  'code: "ai_quota_probe_refresh_rate_limited"',
  statusRefreshClaimDeniedIndex,
);
const statusRefreshClaimedIndex = statusHandler.indexOf(
  "refreshClaimed = true",
  statusRefreshDeniedResponseIndex,
);
const statusRefreshAcknowledgementIndex = statusHandler.indexOf(
  'statusResponse.headers.set(REFRESH_ACKNOWLEDGEMENT_HEADER, "1")',
  statusBuildIndex,
);
assert(
  statusRefreshClaimUnavailableIndex > statusQuotaProbeRefreshClaimIndex &&
    statusRefreshClaimDeniedIndex > statusRefreshClaimUnavailableIndex &&
    statusRefreshDeniedResponseIndex > statusRefreshClaimDeniedIndex &&
    statusRefreshClaimedIndex > statusRefreshDeniedResponseIndex &&
    statusQuotaProbeCacheIndex > statusRefreshClaimedIndex &&
    statusQuotaSnapshotIndex > statusRefreshClaimedIndex &&
    statusRefreshAcknowledgementIndex > statusBuildIndex,
  "A missing or denied durable refresh claim must return before the expensive snapshot loader, and only a completed claimed status may acknowledge Refresh.",
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
  'const AI_QUOTA_STATUS_RPC_PATH = "/rest/v1/rpc/wtos_get_ai_quota_status_v1"',
  'const AI_QUOTA_PROBE_REFRESH_CLAIM_RPC_PATH =',
  '"/rest/v1/rpc/wtos_claim_ai_quota_probe_refresh_v1"',
  "export async function claimSupabaseAiQuotaProbeRefresh",
  "SUPABASE_AI_QUOTA_PROBE_REFRESH_CLAIM_MAX_BYTES",
  "SUPABASE_AI_QUOTA_PROBE_REFRESH_CLAIM_TIMEOUT_MS",
  "export async function readSupabaseAiQuotaStatus",
  "SUPABASE_AI_QUOTA_STATUS_MAX_BYTES",
  "SUPABASE_AI_QUOTA_STATUS_TIMEOUT_MS",
  'endpoint.searchParams.set("p_company_id", companyId)',
  'endpoint.searchParams.set("p_actor_user_id", actorUserId)',
  'endpoint.searchParams.set("p_request", JSON.stringify(request))',
  "AI_QUOTA_CAPABILITY_SUCCESS_TTL_MS = 60_000",
  "AI_QUOTA_CAPABILITY_FAILURE_TTL_MS = 5_000",
  "AI_QUOTA_PROBE_SUCCESS_TTL_MS = 30_000",
  "AI_QUOTA_PROBE_FAILURE_TTL_MS = 5_000",
  "AI_QUOTA_PROBE_CACHE_MAX_ENTRIES = 128",
  "const aiQuotaCapabilityCache = new WeakMap",
  "const aiQuotaProbeCache = new Map",
  'createHash("sha256")',
  "queuedRefresh",
  "queueAiQuotaProbeRefresh(",
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
const {
  claimSupabaseAiQuotaProbeRefresh,
  readCachedAiQuotaProbeEstimatedRequestTokens,
  readSupabaseAiQuotaStatus,
  verifySupabaseAiQuotaServiceCapability,
} =
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
      "/rpc/wtos_claim_ai_quota_probe_refresh_v1": {
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
                },
                required: ["p_company_id", "p_actor_user_id"],
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

const refreshClaimCompanyId = "11111111-1111-4111-8111-111111111111";
const refreshClaimActorUserId = "99999999-9999-4999-8999-999999999999";
let capturedRefreshClaimRequest = null;
const allowedRefreshClaim = await claimSupabaseAiQuotaProbeRefresh(
  {
    companyId: refreshClaimCompanyId,
    actorUserId: refreshClaimActorUserId,
  },
  testServiceEnv,
  async (input, init) => {
    capturedRefreshClaimRequest = { input: String(input), init };
    return new Response(
      JSON.stringify({
        contractVersion: 1,
        companyId: refreshClaimCompanyId,
        actorUserId: refreshClaimActorUserId,
        allowed: true,
        retryAfterSeconds: 0,
        checkedAt: "2026-09-04T10:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
);
assert(
  allowedRefreshClaim?.allowed === true &&
    allowedRefreshClaim.retryAfterSeconds === 0 &&
    capturedRefreshClaimRequest?.input ===
      "https://quota-capability.test/rest/v1/rpc/wtos_claim_ai_quota_probe_refresh_v1" &&
    capturedRefreshClaimRequest?.init?.method === "POST" &&
    capturedRefreshClaimRequest?.init?.cache === "no-store" &&
    capturedRefreshClaimRequest?.init?.redirect === "error" &&
    capturedRefreshClaimRequest?.init?.headers?.Accept === "application/json" &&
    capturedRefreshClaimRequest?.init?.headers?.["Content-Type"] === "application/json" &&
    capturedRefreshClaimRequest?.init?.headers?.["Content-Profile"] === "public" &&
    capturedRefreshClaimRequest?.init?.headers?.apikey ===
      "unit-test-service-role-secret" &&
    capturedRefreshClaimRequest?.init?.headers?.Authorization ===
      "Bearer unit-test-service-role-secret" &&
    JSON.parse(capturedRefreshClaimRequest.init.body).p_company_id ===
      refreshClaimCompanyId &&
    JSON.parse(capturedRefreshClaimRequest.init.body).p_actor_user_id ===
      refreshClaimActorUserId &&
    !capturedRefreshClaimRequest.input.includes("unit-test-service-role-secret"),
  "An explicit refresh claim must use a bounded, non-cached, service-authenticated POST with exact company and actor arguments.",
);

const deniedRefreshClaim = await claimSupabaseAiQuotaProbeRefresh(
  {
    companyId: refreshClaimCompanyId,
    actorUserId: refreshClaimActorUserId,
  },
  testServiceEnv,
  async () =>
    new Response(
      JSON.stringify({
        contractVersion: 1,
        companyId: refreshClaimCompanyId,
        actorUserId: refreshClaimActorUserId,
        allowed: false,
        retryAfterSeconds: 30,
        checkedAt: "2026-09-04T10:00:01.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
);
assert(
  deniedRefreshClaim?.allowed === false &&
    deniedRefreshClaim.retryAfterSeconds === 30,
  "A bounded cooldown denial must remain distinguishable from a service failure.",
);

for (const malformedRefreshClaim of [
  {
    contractVersion: 1,
    companyId: "22222222-2222-4222-8222-222222222222",
    actorUserId: refreshClaimActorUserId,
    allowed: true,
    retryAfterSeconds: 0,
    checkedAt: "2026-09-04T10:00:00.000Z",
  },
  {
    contractVersion: 1,
    companyId: refreshClaimCompanyId,
    actorUserId: refreshClaimActorUserId,
    allowed: true,
    retryAfterSeconds: 1,
    checkedAt: "2026-09-04T10:00:00.000Z",
  },
  {
    contractVersion: 1,
    companyId: refreshClaimCompanyId,
    actorUserId: refreshClaimActorUserId,
    allowed: false,
    retryAfterSeconds: 31,
    checkedAt: "2026-09-04T10:00:00.000Z",
  },
  {
    contractVersion: 1,
    companyId: refreshClaimCompanyId,
    actorUserId: refreshClaimActorUserId,
    allowed: false,
    retryAfterSeconds: 4,
    checkedAt: "not-a-timestamp",
  },
  {
    contractVersion: 1,
    companyId: refreshClaimCompanyId,
    actorUserId: refreshClaimActorUserId,
    allowed: false,
    retryAfterSeconds: 4,
    checkedAt: "2026-09-04T10:00:00.000Z",
    extra: "not allowed",
  },
]) {
  const parsedMalformedClaim = await claimSupabaseAiQuotaProbeRefresh(
    {
      companyId: refreshClaimCompanyId,
      actorUserId: refreshClaimActorUserId,
    },
    testServiceEnv,
    async () =>
      new Response(JSON.stringify(malformedRefreshClaim), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
  assert(
    parsedMalformedClaim === null,
    "Malformed, cross-company, overbound, or non-exact refresh claims must fail closed.",
  );
}

let invalidRefreshClaimFetchCalls = 0;
assert(
  (await claimSupabaseAiQuotaProbeRefresh(
    { companyId: "not-a-uuid", actorUserId: refreshClaimActorUserId },
    testServiceEnv,
    async () => {
      invalidRefreshClaimFetchCalls += 1;
      throw new Error("must not run");
    },
  )) === null && invalidRefreshClaimFetchCalls === 0,
  "Invalid refresh-claim identities must fail before service-role transport.",
);

const quotaProbeCacheInput = {
  companyId: "11111111-1111-4111-8111-111111111111",
  actorUserId: "99999999-9999-4999-8999-999999999999",
  userRole: "owner",
  policyId: "33333333-3333-4333-8333-333333333333",
  policyUpdatedAt: "2026-09-04T07:30:00.000Z",
  companyMonthlyBudgetCents: 5_000,
  config: {
    enabled: true,
    provider: "openai",
    model: "owner-approved-model",
    apiKeyConfigured: true,
    dailyBudgetUsd: 100,
    dailyRequestLimit: 500,
    perUserDailyRequestLimit: 500,
    perCompanyDailyRequestLimit: 500,
    maxRequestTokens: 32_000,
    maxResponseTokens: 1_200,
    maxInputCostUsdPer1kTokens: 0.1,
    maxOutputCostUsdPer1kTokens: 0.3,
    timeoutMs: 15_000,
    retryLimit: 1,
    streamingEnabled: false,
    structuredOutputEnabled: true,
    actionExecutionEnabled: false,
  },
  forceRefresh: false,
};
let quotaProbeNow = 1_000;
let quotaProbeLoads = 0;
let resolveQuotaProbeLoad = null;
const quotaProbeLoad = async () => {
  quotaProbeLoads += 1;
  return new Promise((resolve) => {
    resolveQuotaProbeLoad = resolve;
  });
};
const firstQuotaProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  { ...quotaProbeCacheInput, load: quotaProbeLoad },
  () => quotaProbeNow,
);
const secondQuotaProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  { ...quotaProbeCacheInput, load: quotaProbeLoad },
  () => quotaProbeNow,
);
await Promise.resolve();
assert(
  quotaProbeLoads === 1 && typeof resolveQuotaProbeLoad === "function",
  "Concurrent identical status probes must coalesce before loading the CRM snapshot.",
);
resolveQuotaProbeLoad(3_210);
assert(
  (await firstQuotaProbe) === 3_210 && (await secondQuotaProbe) === 3_210,
  "Every coalesced status probe must receive the same bounded token estimate.",
);
quotaProbeNow = 30_999;
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...quotaProbeCacheInput,
      load: async () => {
        quotaProbeLoads += 1;
        return 3_300;
      },
    },
    () => quotaProbeNow,
  )) === 3_210 && quotaProbeLoads === 1,
  "A successful CRM snapshot estimate is reused only within its bounded TTL.",
);
quotaProbeNow = 31_001;
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...quotaProbeCacheInput,
      load: async () => {
        quotaProbeLoads += 1;
        return 3_300;
      },
    },
    () => quotaProbeNow,
  )) === 3_300 && quotaProbeLoads === 2,
  "An expired CRM snapshot estimate must be loaded again.",
);

let explicitRefreshLoads = 0;
const explicitRefreshInput = {
  ...quotaProbeCacheInput,
  policyId: "77777777-7777-4777-8777-777777777777",
};
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...explicitRefreshInput,
      load: async () => {
        explicitRefreshLoads += 1;
        return 4_100;
      },
    },
    () => 50_000,
  )) === 4_100 && explicitRefreshLoads === 1,
  "The initial status request must load one bounded CRM snapshot estimate.",
);
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...explicitRefreshInput,
      forceRefresh: true,
      load: async () => {
        explicitRefreshLoads += 1;
        return 4_200;
      },
    },
    () => 50_001,
  )) === 4_200 && explicitRefreshLoads === 2,
  "An explicit Refresh must replace a still-live cached estimate.",
);
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...explicitRefreshInput,
      load: async () => {
        explicitRefreshLoads += 1;
        return 4_250;
      },
    },
    () => 50_002,
  )) === 4_200 && explicitRefreshLoads === 2,
  "A normal status reload after explicit Refresh must reuse its fresh estimate.",
);
let queuedRefreshLoads = 0;
const queuedRefreshResolvers = [];
const queuedRefreshInput = {
  ...quotaProbeCacheInput,
  policyId: "88888888-8888-4888-8888-888888888888",
};
const queuedRefreshLoad = async () => {
  queuedRefreshLoads += 1;
  return new Promise((resolve) => queuedRefreshResolvers.push(resolve));
};
const preRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  { ...queuedRefreshInput, load: queuedRefreshLoad },
  () => 60_000,
);
await Promise.resolve();
const queuedRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    ...queuedRefreshInput,
    forceRefresh: true,
    load: queuedRefreshLoad,
  },
  () => 60_001,
);
const coalescedQueuedRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    ...queuedRefreshInput,
    forceRefresh: true,
    load: queuedRefreshLoad,
  },
  () => 60_001,
);
const normalBehindQueuedRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    ...queuedRefreshInput,
    load: queuedRefreshLoad,
  },
  () => 60_001,
);
await Promise.resolve();
assert(
  queuedRefreshLoads === 1 && queuedRefreshResolvers.length === 1,
  "A Refresh arriving behind an older snapshot load must queue without concurrent fan-out.",
);
const latestQueuedRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    ...queuedRefreshInput,
    forceRefresh: true,
    load: queuedRefreshLoad,
  },
  () => 60_002,
);
await Promise.resolve();
assert(
  queuedRefreshLoads === 1,
  "Rapid Refresh generations must collapse behind the one active snapshot load.",
);
queuedRefreshResolvers[0](4_400);
assert(
  (await preRefreshProbe) === 4_400,
  "The older in-flight estimate must settle for its original caller.",
);
await Promise.resolve();
assert(
  queuedRefreshLoads === 2 && queuedRefreshResolvers.length === 2,
  "The one coalesced Refresh must start after the older load settles.",
);
queuedRefreshResolvers[1](4_500);
assert(
  (await queuedRefreshProbe) === 4_500 &&
    (await coalescedQueuedRefreshProbe) === 4_500 &&
    (await latestQueuedRefreshProbe) === 4_500 &&
    (await normalBehindQueuedRefreshProbe) === 4_500,
  "All forced or normal callers behind a queued Refresh must receive the one freshly reloaded estimate.",
);

let activeRefreshLoads = 0;
const activeRefreshResolvers = [];
const activeRefreshInput = {
  ...quotaProbeCacheInput,
  policyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  forceRefresh: true,
};
const firstActiveRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    ...activeRefreshInput,
    load: async () => {
      activeRefreshLoads += 1;
      return new Promise((resolve) => activeRefreshResolvers.push(resolve));
    },
  },
  () => 70_000,
);
await Promise.resolve();
const laterActiveRefreshProbe = readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    ...activeRefreshInput,
    load: async () => {
      activeRefreshLoads += 1;
      return new Promise((resolve) => activeRefreshResolvers.push(resolve));
    },
  },
  () => 70_001,
);
const normalBehindActiveRefreshProbe =
  readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...activeRefreshInput,
      forceRefresh: false,
      load: async () => {
        activeRefreshLoads += 1;
        return 4_650;
      },
    },
    () => 70_001,
  );
await Promise.resolve();
assert(
  activeRefreshLoads === 1 && activeRefreshResolvers.length === 1,
  "A later explicit Refresh must queue behind an active Refresh without parallel fan-out.",
);
activeRefreshResolvers[0](4_600);
assert(
  (await firstActiveRefreshProbe) === 4_600,
  "The first explicit Refresh must settle for its original caller.",
);
await Promise.resolve();
assert(
  activeRefreshLoads === 2 && activeRefreshResolvers.length === 2,
  "A later explicit Refresh must run once after the earlier Refresh snapshot settles.",
);
activeRefreshResolvers[1](4_700);
assert(
  (await laterActiveRefreshProbe) === 4_700 &&
    (await normalBehindActiveRefreshProbe) === 4_700,
  "The later Refresh and following normal status request must receive the post-click estimate.",
);

let forcedFailureLoads = 0;
const forcedFailureInput = {
  ...quotaProbeCacheInput,
  policyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...forcedFailureInput,
      load: async () => {
        forcedFailureLoads += 1;
        return 4_800;
      },
    },
    () => 80_000,
  )) === 4_800 && forcedFailureLoads === 1,
  "The forced-failure fixture must begin with a warm successful estimate.",
);
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...forcedFailureInput,
      forceRefresh: true,
      load: async () => {
        forcedFailureLoads += 1;
        throw new Error("forced refresh failure must stay private");
      },
    },
    () => 80_001,
  )) === null && forcedFailureLoads === 2,
  "A failed explicit Refresh must replace a warm success with fail-closed state.",
);
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...forcedFailureInput,
      load: async () => {
        forcedFailureLoads += 1;
        return 4_900;
      },
    },
    () => 85_000,
  )) === null && forcedFailureLoads === 2,
  "A failed explicit Refresh must never fall back to the older successful estimate.",
);
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...forcedFailureInput,
      load: async () => {
        forcedFailureLoads += 1;
        return 4_900;
      },
    },
    () => 85_002,
  )) === 4_900 && forcedFailureLoads === 3,
  "A failed explicit Refresh must retry after the bounded failure TTL.",
);

let failedQuotaProbeNow = 100_000;
let failedQuotaProbeLoads = 0;
const failedQuotaProbeInput = {
  ...quotaProbeCacheInput,
  policyId: "44444444-4444-4444-8444-444444444444",
};
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...failedQuotaProbeInput,
      load: async () => {
        failedQuotaProbeLoads += 1;
        throw new Error("raw snapshot failure must not escape");
      },
    },
    () => failedQuotaProbeNow,
  )) === null && failedQuotaProbeLoads === 1,
  "A failed CRM snapshot estimate must fail closed without surfacing its error.",
);
failedQuotaProbeNow = 104_999;
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...failedQuotaProbeInput,
      load: async () => {
        failedQuotaProbeLoads += 1;
        return 3_400;
      },
    },
    () => failedQuotaProbeNow,
  )) === null && failedQuotaProbeLoads === 1,
  "A failed CRM snapshot estimate must be briefly cached to bound outage polling.",
);
failedQuotaProbeNow = 105_001;
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...failedQuotaProbeInput,
      load: async () => {
        failedQuotaProbeLoads += 1;
        return 3_400;
      },
    },
    () => failedQuotaProbeNow,
  )) === 3_400 && failedQuotaProbeLoads === 2,
  "A failed CRM snapshot estimate must retry after its shorter bounded TTL.",
);

let isolatedQuotaProbeLoads = 0;
const isolatedQuotaProbeVariants = [
  { actorUserId: "88888888-8888-4888-8888-888888888888" },
  { companyId: "22222222-2222-4222-8222-222222222222" },
  { userRole: "technician" },
  { policyUpdatedAt: "2026-09-04T07:31:00.000Z" },
  { config: { ...quotaProbeCacheInput.config, model: "other-model" } },
  { config: { ...quotaProbeCacheInput.config, maxRequestTokens: 31_999 } },
  { config: { ...quotaProbeCacheInput.config, retryLimit: 0 } },
];
for (const variant of isolatedQuotaProbeVariants) {
  const value = await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...quotaProbeCacheInput,
      ...variant,
      load: async () => {
        isolatedQuotaProbeLoads += 1;
        return 4_000 + isolatedQuotaProbeLoads;
      },
    },
    () => 200_000,
  );
  assert(value !== null, "An isolated bounded quota probe cache key must load.");
}
assert(
  isolatedQuotaProbeLoads === isolatedQuotaProbeVariants.length,
  "Company, actor, role, policy revision, model, token cap, and retry changes must not share a CRM estimate.",
);

const quotaProbeCapacityResolvers = [];
const quotaProbeCapacityPromises = [];
let quotaProbeCapacityLoads = 0;
for (let index = 0; index < 128; index += 1) {
  const actorSuffix = index.toString(16).padStart(12, "0");
  quotaProbeCapacityPromises.push(
    readCachedAiQuotaProbeEstimatedRequestTokens(
      {
        ...quotaProbeCacheInput,
        actorUserId: `aaaaaaaa-aaaa-4aaa-8aaa-${actorSuffix}`,
        load: async () => {
          quotaProbeCapacityLoads += 1;
          return new Promise((resolve) => {
            quotaProbeCapacityResolvers.push(resolve);
          });
        },
      },
      () => 500_000,
    ),
  );
}
await Promise.resolve();
assert(
  quotaProbeCapacityLoads === 128 && quotaProbeCapacityResolvers.length === 128,
  "The bounded cache fixture must occupy every in-flight slot.",
);
let overflowQuotaProbeLoads = 0;
const overflowQuotaProbeInput = {
  ...quotaProbeCacheInput,
  actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
};
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...overflowQuotaProbeInput,
      load: async () => {
        overflowQuotaProbeLoads += 1;
        return 5_000;
      },
    },
    () => 500_000,
  )) === null && overflowQuotaProbeLoads === 0,
  "A full all-in-flight cache must fail closed instead of starting an untracked snapshot fan-out.",
);
quotaProbeCapacityResolvers[0](5_000);
await quotaProbeCapacityPromises[0];
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...overflowQuotaProbeInput,
      load: async () => {
        overflowQuotaProbeLoads += 1;
        return 5_100;
      },
    },
    () => 500_000,
  )) === 5_100 && overflowQuotaProbeLoads === 1,
  "A settled entry must make room for one new bounded status probe.",
);
for (const resolve of quotaProbeCapacityResolvers.slice(1)) {
  resolve(5_000);
}
await Promise.all(quotaProbeCapacityPromises.slice(1));

let invalidForceRefreshLoads = 0;
assert(
  (await readCachedAiQuotaProbeEstimatedRequestTokens(
    {
      ...quotaProbeCacheInput,
      policyId: "99999999-9999-4999-8999-999999999999",
      forceRefresh: "1",
      load: async () => {
        invalidForceRefreshLoads += 1;
        return 5_200;
      },
    },
    () => 600_000,
  )) === null && invalidForceRefreshLoads === 0,
  "Only an exact internal boolean may force the expensive quota-probe reload.",
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
  (() => {
    const document = exactQuotaOpenApiDocument();
    delete document.paths["/rpc/wtos_claim_ai_quota_probe_refresh_v1"];
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths["/rpc/wtos_claim_ai_quota_probe_refresh_v1"].get = {};
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths[
      "/rpc/wtos_claim_ai_quota_probe_refresh_v1"
    ].post.parameters[0].schema.required.pop();
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths[
      "/rpc/wtos_claim_ai_quota_probe_refresh_v1"
    ].post.parameters[0].schema.properties.extra = { type: "string" };
    return document;
  })(),
  (() => {
    const document = exactQuotaOpenApiDocument();
    document.paths[
      "/rpc/wtos_claim_ai_quota_probe_refresh_v1"
    ].post.parameters[0].schema.properties.p_actor_user_id.format = "text";
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

const quotaStatusCompanyId = "11111111-1111-4111-8111-111111111111";
const quotaStatusActorUserId = "22222222-2222-4222-8222-222222222222";
const quotaStatusRequest = {
  contractVersion: 1,
  estimatedCostCents: 25,
  globalDailyRequestLimit: 500,
  companyDailyRequestLimit: 500,
  userDailyRequestLimit: 500,
  dailyBudgetCents: 10_000,
  companyMonthlyBudgetCents: 5_000,
};
const quotaStatusReceipt = {
  contractVersion: 1,
  companyId: quotaStatusCompanyId,
  actorUserId: quotaStatusActorUserId,
  requestCapacityAvailable: true,
  blockingReason: "none",
  checkedAt: "2026-09-04T05:00:00.000Z",
  globalRequestsToday: 2,
  companyRequestsToday: 1,
  userRequestsToday: 1,
  reservedCostCentsToday: 50,
  companyReservedCostCentsThisMonth: 25,
};
let capturedQuotaStatusRequest = null;
const readQuotaStatusResult = await readSupabaseAiQuotaStatus(
  {
    companyId: quotaStatusCompanyId,
    actorUserId: quotaStatusActorUserId,
    request: quotaStatusRequest,
  },
  testServiceEnv,
  async (input, init) => {
    capturedQuotaStatusRequest = { input: String(input), init };
    return new Response(JSON.stringify(quotaStatusReceipt), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
);
assert(
  JSON.stringify(readQuotaStatusResult) === JSON.stringify(quotaStatusReceipt),
  "The fresh quota reader must return only its bounded JSON payload for route validation.",
);
const capturedQuotaStatusUrl = new URL(capturedQuotaStatusRequest.input);
assert(
  capturedQuotaStatusUrl.origin === "https://quota-capability.test" &&
    capturedQuotaStatusUrl.pathname ===
      "/rest/v1/rpc/wtos_get_ai_quota_status_v1" &&
    capturedQuotaStatusUrl.searchParams.get("p_company_id") ===
      quotaStatusCompanyId &&
    capturedQuotaStatusUrl.searchParams.get("p_actor_user_id") ===
      quotaStatusActorUserId &&
    JSON.parse(capturedQuotaStatusUrl.searchParams.get("p_request"))
      .companyMonthlyBudgetCents === 5_000 &&
    capturedQuotaStatusRequest.init?.method === "GET" &&
    capturedQuotaStatusRequest.init?.cache === "no-store" &&
    capturedQuotaStatusRequest.init?.redirect === "error" &&
    capturedQuotaStatusRequest.init?.headers?.Accept === "application/json" &&
    capturedQuotaStatusRequest.init?.headers?.["Accept-Profile"] === "public" &&
    capturedQuotaStatusRequest.init?.headers?.apikey ===
      "unit-test-service-role-secret" &&
    capturedQuotaStatusRequest.init?.headers?.Authorization ===
      "Bearer unit-test-service-role-secret" &&
    !capturedQuotaStatusRequest.input.includes("unit-test-service-role-secret"),
  "The quota status RPC must be a fresh bounded GET with exact safe arguments and server-only credentials.",
);

for (const invalidQuotaStatusResponse of [
  async () =>
    new Response("{}", {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "text/plain" },
    }),
  async () =>
    new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  async () =>
    new Response("x".repeat(16 * 1024 + 1), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  async () => {
    throw new Error("synthetic quota status network failure");
  },
]) {
  assert(
    (await readSupabaseAiQuotaStatus(
      {
        companyId: quotaStatusCompanyId,
        actorUserId: quotaStatusActorUserId,
        request: quotaStatusRequest,
      },
      testServiceEnv,
      invalidQuotaStatusResponse,
    )) === null,
    "Quota status transport, media, size, parse, and network failures must fail closed.",
  );
}
let invalidQuotaStatusFetchCalls = 0;
assert(
  (await readSupabaseAiQuotaStatus(
    {
      companyId: "not-a-uuid",
      actorUserId: quotaStatusActorUserId,
      request: quotaStatusRequest,
    },
    testServiceEnv,
    async () => {
      invalidQuotaStatusFetchCalls += 1;
      return new Response("{}");
    },
  )) === null && invalidQuotaStatusFetchCalls === 0,
  "Invalid quota status identities must fail before a service request.",
);
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
for (const providerCredentialBoundary of [
  "Boolean(readAiProviderApiKey(provider, env))",
  'env.AI_OPENAI_API_KEY?.trim() ?? ""',
  "env.AI_ANTHROPIC_API_KEY?.trim() ||",
  "env.ANTHROPIC_API_KEY?.trim() ||",
  'readAiProviderApiKey("openai", process.env)',
  'readAiProviderApiKey("anthropic", process.env)',
]) {
  includes(
    aiProvider,
    providerCredentialBoundary,
    `AI provider credential readiness and use must share a trimmed server-only reader: ${providerCredentialBoundary}.`,
  );
}
for (const quotaContractBoundary of [
  "maxModelCharacters: 160",
  "maxPromptCharacters: 50_000",
  "maxTokens: 1_000_000",
  "maxEstimatedCostCents: 100_000_000",
  "maxProviderAttempts: 3",
  "maxProviderTimeoutMs: 2_147_483_647",
  "maxDailyRequests: 100_000",
  "maxDailyBudgetCents: 100_000_000",
  "maxCompanyMonthlyBudgetCents: 1_000_000_000",
  "export function isAiQuotaReservationRequestWithinBounds(",
  "export function isAiQuotaReservationReceiptWithinBounds(",
  "export function isAiQuotaStatusRequestWithinBounds(",
  "export function parseAiQuotaStatusReceipt(",
  "export function getAiCurrentQuotaAvailability({",
  "export function buildAiQuotaStatusRequest({",
  "!hasQuotaCompatibleProviderConfig(config, companyMonthlyBudgetCents)",
  "isIntegerWithin(config.timeoutMs, 1, aiQuotaBounds.maxProviderTimeoutMs)",
  "export function estimateAiQuotaStatusProbe({",
  "const context = retrieveAuthorizedAiContext(snapshot, {",
  "return estimateAiRequestUsage({",
  "export function getAiReservationCostCents({",
  "estimatedCostUsd * 100 * (config.retryLimit + 1)",
  "An authenticated selected-company probe fits current quota; every submitted command is atomically checked against its actual estimated size.",
  "request.estimatedRequestTokens >= Math.ceil(request.promptCharacters / 8)",
  "request.estimatedRequestTokens <= request.maxRequestTokens",
  "request.estimatedCostCents <= request.dailyBudgetCents",
  "request.estimatedCostCents <= request.companyMonthlyBudgetCents",
  "maximumEstimatedCostUsd * 100 * (config.retryLimit + 1)",
  "hasQuotaCompatibleProviderConfig(",
]) {
  includes(
    aiProvider,
    quotaContractBoundary,
    `AI quota readiness is missing bounded contract ${quotaContractBoundary}.`,
  );
}
for (const timeoutBoundary of [
  "timeoutMs: parseProviderTimeoutMs(env.AI_TIMEOUT_MS)",
  "function parseProviderTimeoutMs(value: string | undefined)",
  "if (!/^\\d+$/.test(normalized))",
  "Number.isSafeInteger(parsed) ? parsed : 0",
  "!isIntegerWithin(config.timeoutMs, 1, aiQuotaBounds.maxProviderTimeoutMs)",
  "!isIntegerWithin(policy.timeout_ms, 1, aiQuotaBounds.maxProviderTimeoutMs)",
  "if (!isIntegerWithin(timeoutMs, 1, aiQuotaBounds.maxProviderTimeoutMs))",
  'throw new Error("AI provider timeout configuration is invalid.")',
  "setTimeout(() => controller.abort(), timeoutMs)",
]) {
  includes(
    aiProvider,
    timeoutBoundary,
    `AI provider timeout handling is missing boundary ${timeoutBoundary}.`,
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
  "getAiReservationCostCents({",
  "config: providerConfig",
  "estimatedRequestTokens: requestEstimate.estimatedRequestTokens",
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
  "setAiResponseHistoryEvidence(null)",
  "setAiPilotResultEvidence(null)",
  "result.companyId !== requestCompanyId",
  "getCurrentAiResponses({",
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
  'disabled={!exactAiCompanySelected || snapshotTransitionPending}',
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
  "type AiProviderStatusEvidence = {",
  "type AiProviderStatusCompletionEvidence = {",
  "useState<AiProviderStatusEvidence | null>(null)",
  '"/api/ai-tools/status"',
  '`/api/ai-tools/status?companyId=${encodeURIComponent(requestCompanyId)}`',
  'method: forceQuotaProbeRefresh ? "POST" : "GET"',
  '? { "Content-Type": "application/json" }',
  "? JSON.stringify({ companyId: requestCompanyId })",
  'response.headers.get("x-wtos-ai-quota-probe-refreshed") !== "1"',
  "shouldForceQuotaProbeRefresh(",
  "beginAiQuotaProbeRefreshAttempt(",
  "beginQuotaProbeRefreshAttempt(",
  "acknowledgeQuotaProbeRefresh(",
  'credentials: "same-origin"',
  'cache: "no-store"',
  "isAiCompanyPilotStatus(payload, requestCompanyId)",
  "activeAiCompanyRef.current !== requestCompanyId",
  "aiProviderStatusEvidence?.status.companyId === exactAiCompanyId",
  "aiProviderStatusEvidence.statusRefreshSequence === statusRefreshSequence",
  "companyId={exactAiCompanyId}",
  'data-testid="ai-provider-status"',
  'data-ai-status-phase={statusPhase}',
  'data-ai-request-company-id={companyId ?? ""}',
  'data-ai-status-request-sequence={String(requestSequence)}',
  'data-ai-status-company-id={status?.companyId ?? ""}',
  'data-ai-monthly-budget-cents={status ? String(status.monthlyBudgetCents) : ""}',
  'data-ai-current-quota-available={',
  'data-ai-runtime-provider-health={runtimeProviderHealth ?? "not_tested"}',
  'role="status"',
  'aria-live="polite"',
  'aria-busy={isLoading}',
  'label={`${formatMoney(status.monthlyBudgetCents / 100)}/month`}',
  'label="External actions disabled"',
  'tone={status.readiness.migrationStatus === "applied" ? "blue" : "amber"}',
  "providerStatus?.usageAccountingConfigured",
  "providerStatus.currentQuotaAvailable === false",
  "Current quota available",
  "Current quota unavailable",
  "Usage accounting is not ready for this company. No provider call can run until the required controls are complete.",
  "getAiEndpointErrorMessage(",
  "aiProviderStatusRequestSequenceRef.current + 1",
  "setAiProviderStatusRequestSequence(requestSequence)",
  "statusRefreshSequence: number",
  "aiProviderStatusReloadSequence",
  "setAiProviderStatusReloadSequence((current) => current + 1)",
  "const [aiProviderStatusRefreshSequence, setAiProviderStatusRefreshSequence]",
  "const consumedAiQuotaProbeRefreshSequenceRef = useRef(new Map<string, number>())",
  "const attemptedAiQuotaProbeRefreshSequenceRef = useRef(new Map<string, number>())",
  "const [aiQuotaProbeRefreshStateVersion, setAiQuotaProbeRefreshStateVersion] =",
  "quotaProbeRefreshStateVersion: number",
  "setAiQuotaProbeRefreshStateVersion((current) => current + 1)",
  "const observedQuotaProbeRefreshStateVersionRef = useRef(",
  "const locallyCompletedAiProviderStatusRef =",
  "const quotaProbeRefreshStateChanged =",
  "await onScrollPreservingReload()",
  "setAiProviderStatusRefreshSequence((current) => current + 1)",
  'data-testid="workspace-refresh"',
  "statusRefreshSequence={aiProviderStatusRefreshSequence}",
  "shouldForceQuotaProbeRefresh={shouldForceQuotaProbeRefresh}",
  "beginQuotaProbeRefreshAttempt={beginQuotaProbeRefreshAttempt}",
  "acknowledgeQuotaProbeRefresh={acknowledgeQuotaProbeRefresh}",
  "quotaProbeRefreshStateVersion={aiQuotaProbeRefreshStateVersion}",
  "type AiPilotResultEvidence = {",
  "statusRefreshSequence: number",
  "const requestStatusRefreshSequence = statusRefreshSequence",
  "const currentStatusRefreshSequenceRef = useRef(statusRefreshSequence)",
  "useLayoutEffect(() => {",
  "currentStatusRefreshSequenceRef.current = statusRefreshSequence",
  "isCurrentAiCommandCompletion({",
  "currentStatusRefreshSequence: currentStatusRefreshSequenceRef.current",
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
  "status.currentQuotaAvailable",
  "runtimeProviderFailed",
  "Provider test failed",
  'typeof status.currentQuotaAvailable === "boolean"',
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

for (const errorEvidenceBoundary of [
  "export type AiPilotErrorEvidence = {",
  "export function getCurrentAiPilotError({",
  "evidence.companyId !== companyId",
  "evidence.statusRefreshSequence !== statusRefreshSequence",
  "useState<AiPilotErrorEvidence | null>(null)",
  "getCurrentAiPilotError({",
  "setAiPilotErrorEvidence({",
  "statusRefreshSequence: requestStatusRefreshSequence",
  "{currentAiPilotError}",
]) {
  includes(
    `${aiToolsSource}\n${crmApp}`,
    errorEvidenceBoundary,
    `AI command errors must be exact-company and Refresh-generation scoped: ${errorEvidenceBoundary}.`,
  );
}
const providerStatusEffectIndex = crmApp.indexOf("const loadAiProviderStatus = async () =>");
const providerStatusRefreshRequiredIndex = crmApp.lastIndexOf(
  "const quotaProbeRefreshRequired = shouldForceQuotaProbeRefresh(",
  providerStatusEffectIndex,
);
const providerStatusAttemptIndex = crmApp.indexOf(
  "beginQuotaProbeRefreshAttempt(",
  providerStatusRefreshRequiredIndex,
);
const providerStatusLocalCompletionIndex = crmApp.indexOf(
  "const locallyCompletedStatus = locallyCompletedAiProviderStatusRef.current",
  providerStatusRefreshRequiredIndex,
);
const providerStatusLocalCompletionSkipIndex = crmApp.indexOf(
  "!quotaProbeRefreshRequired &&",
  providerStatusLocalCompletionIndex,
);
const providerStatusRepeatAttemptGuardIndex = crmApp.indexOf(
  "if (quotaProbeRefreshRequired && !forceQuotaProbeRefresh)",
  providerStatusAttemptIndex,
);
const providerStatusActiveRequestGuardIndex = crmApp.indexOf(
  "aiProviderStatusAbortRef.current &&",
  providerStatusRepeatAttemptGuardIndex,
);
const providerStatusRepeatAttemptErrorIndex = crmApp.indexOf(
  "Production AI context refresh did not complete. Use Refresh to start a new bounded attempt.",
  providerStatusRepeatAttemptGuardIndex,
);
const providerStatusRefreshPostIndex = crmApp.indexOf(
  'method: forceQuotaProbeRefresh ? "POST" : "GET"',
  providerStatusEffectIndex,
);
const providerStatusRefreshBodyIndex = crmApp.indexOf(
  "? JSON.stringify({ companyId: requestCompanyId })",
  providerStatusRefreshPostIndex,
);
const providerStatusValidationIndex = crmApp.indexOf(
  "isAiCompanyPilotStatus(payload, requestCompanyId)",
  providerStatusEffectIndex,
);
const providerStatusAbortGuardIndex = crmApp.indexOf(
  "controller.signal.aborted ||",
  providerStatusValidationIndex,
);
const providerStatusSnapshotGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(requestStatusRefreshSequence)",
  providerStatusAbortGuardIndex,
);
const providerStatusRefreshAckIndex = crmApp.indexOf(
  "acknowledgeQuotaProbeRefresh(",
  providerStatusSnapshotGuardIndex,
);
const providerStatusLocalCompletionPublishIndex = crmApp.indexOf(
  "locallyCompletedAiProviderStatusRef.current = {",
  providerStatusSnapshotGuardIndex,
);
const providerStatusLocalCompletionReloadIndex = crmApp.indexOf(
  "statusReloadSequence: requestStatusReloadSequence",
  providerStatusLocalCompletionPublishIndex,
);
const providerStatusPublishIndex = crmApp.indexOf(
  "setAiProviderStatusEvidence({",
  providerStatusRefreshAckIndex,
);
const providerStatusPublishGenerationIndex = crmApp.indexOf(
  "statusRefreshSequence: requestStatusRefreshSequence",
  providerStatusPublishIndex,
);
const providerStatusStateVersionDependencyIndex = crmApp.indexOf(
  "quotaProbeRefreshStateVersion,",
  providerStatusPublishGenerationIndex,
);
assert(
  providerStatusEffectIndex >= 0 &&
    providerStatusRefreshRequiredIndex >= 0 &&
    providerStatusRefreshRequiredIndex < providerStatusEffectIndex &&
    providerStatusLocalCompletionIndex > providerStatusRefreshRequiredIndex &&
    providerStatusLocalCompletionSkipIndex > providerStatusLocalCompletionIndex &&
    providerStatusLocalCompletionSkipIndex < providerStatusAttemptIndex &&
    providerStatusAttemptIndex > providerStatusRefreshRequiredIndex &&
    providerStatusRepeatAttemptGuardIndex > providerStatusAttemptIndex &&
    providerStatusActiveRequestGuardIndex > providerStatusRepeatAttemptGuardIndex &&
    providerStatusRepeatAttemptErrorIndex > providerStatusActiveRequestGuardIndex &&
    providerStatusRepeatAttemptErrorIndex < providerStatusEffectIndex &&
    providerStatusRefreshPostIndex > providerStatusEffectIndex &&
    providerStatusRefreshBodyIndex > providerStatusRefreshPostIndex &&
    providerStatusValidationIndex > providerStatusEffectIndex &&
    providerStatusAbortGuardIndex > providerStatusValidationIndex &&
    providerStatusSnapshotGuardIndex > providerStatusAbortGuardIndex &&
    providerStatusLocalCompletionPublishIndex > providerStatusSnapshotGuardIndex &&
    providerStatusLocalCompletionReloadIndex >
      providerStatusLocalCompletionPublishIndex &&
    providerStatusRefreshAckIndex > providerStatusLocalCompletionReloadIndex &&
    providerStatusPublishIndex > providerStatusRefreshAckIndex &&
    providerStatusPublishGenerationIndex > providerStatusPublishIndex &&
    providerStatusStateVersionDependencyIndex > providerStatusPublishGenerationIndex,
  "Explicit status refresh must make one persistent attempt per company/generation, use bounded POST data, and acknowledge only a valid current response.",
);
const providerStatusPendingGuardIndex = crmApp.lastIndexOf(
  "if (!exactAiCompanyId || snapshotTransitionPending)",
  providerStatusEffectIndex,
);
const providerStatusCatchIndex = crmApp.indexOf(
  "} catch (currentError) {",
  providerStatusPublishIndex,
);
const providerStatusUnmountCleanupIndex = crmApp.indexOf(
  "  useEffect(\n    () => () => {",
  providerStatusCatchIndex,
);
const providerStatusUnmountCleanupEndIndex = crmApp.indexOf(
  "  const selectedTemplate =",
  providerStatusUnmountCleanupIndex,
);
assert(
  providerStatusUnmountCleanupIndex > providerStatusCatchIndex &&
  providerStatusUnmountCleanupEndIndex > providerStatusUnmountCleanupIndex &&
  !crmApp
    .slice(providerStatusPendingGuardIndex, providerStatusUnmountCleanupIndex)
    .includes("return () => controller.abort()") &&
    !crmApp
      .slice(providerStatusUnmountCleanupIndex, providerStatusUnmountCleanupEndIndex)
      .includes("aiProviderStatusAbortRef.current?.abort()"),
  "Same-generation status effect replay and view remounts must not abort their sole durable refresh attempt.",
);
const providerStatusCatchContextGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(requestStatusRefreshSequence)",
  providerStatusCatchIndex,
);
const providerStatusErrorPublishIndex = crmApp.indexOf(
  "setAiProviderStatusErrorEvidence({",
  providerStatusCatchContextGuardIndex,
);
const providerStatusErrorGenerationIndex = crmApp.indexOf(
  "statusRefreshSequence: requestStatusRefreshSequence",
  providerStatusErrorPublishIndex,
);
assert(
  providerStatusPendingGuardIndex >= 0 &&
    providerStatusPendingGuardIndex < providerStatusEffectIndex &&
    providerStatusCatchIndex > providerStatusPublishIndex &&
    providerStatusCatchContextGuardIndex > providerStatusCatchIndex &&
    providerStatusErrorPublishIndex > providerStatusCatchContextGuardIndex &&
    providerStatusErrorGenerationIndex > providerStatusErrorPublishIndex,
  "AI status loading and errors must pause during snapshot transitions and reject stale root context.",
);
for (const snapshotPendingUiBoundary of [
  "aiProviderStatusEvidence?.status.companyId === exactAiCompanyId",
  "aiProviderStatusErrorEvidence?.companyId === exactAiCompanyId",
  "(snapshotTransitionPending ||",
  'data-ai-snapshot-transition-pending={',
  'snapshotTransitionPending ? "true" : "false"',
  'disabled={!exactAiCompanySelected || snapshotTransitionPending}',
  'snapshotTransitionPending\n                  ? "Refreshing context"',
]) {
  includes(
    crmApp,
    snapshotPendingUiBoundary,
    `AI status and command UI must fail closed while CRM context reloads: ${snapshotPendingUiBoundary}.`,
  );
}
const currentProviderStatusSelectorIndex = crmApp.indexOf(
  "const currentAiProviderStatus =",
);
const currentProviderStatusSelectorEndIndex = crmApp.indexOf(
  "const currentAiPilotResult =",
  currentProviderStatusSelectorIndex,
);
const currentProviderStatusSelectorBoundary = crmApp.slice(
  currentProviderStatusSelectorIndex,
  currentProviderStatusSelectorEndIndex,
);
const currentProviderErrorSelectorIndex = crmApp.indexOf(
  "const currentAiProviderStatusError =",
  currentProviderStatusSelectorEndIndex,
);
const currentProviderErrorSelectorEndIndex = crmApp.indexOf(
  "const currentAiPilotError =",
  currentProviderErrorSelectorIndex,
);
const currentProviderErrorSelectorBoundary = crmApp.slice(
  currentProviderErrorSelectorIndex,
  currentProviderErrorSelectorEndIndex,
);
assert(
  currentProviderStatusSelectorIndex >= 0 &&
    currentProviderStatusSelectorEndIndex > currentProviderStatusSelectorIndex &&
    currentProviderStatusSelectorBoundary.includes("!snapshotTransitionPending") &&
    currentProviderStatusSelectorBoundary.includes(
      "aiProviderStatusEvidence?.status.companyId === exactAiCompanyId",
    ) &&
    currentProviderStatusSelectorBoundary.includes(
      "aiProviderStatusEvidence.statusRefreshSequence === statusRefreshSequence",
    ) &&
    currentProviderErrorSelectorIndex > currentProviderStatusSelectorEndIndex &&
    currentProviderErrorSelectorEndIndex > currentProviderErrorSelectorIndex &&
    currentProviderErrorSelectorBoundary.includes("!snapshotTransitionPending") &&
    currentProviderErrorSelectorBoundary.includes(
      "aiProviderStatusErrorEvidence?.companyId === exactAiCompanyId",
    ) &&
    currentProviderErrorSelectorBoundary.includes(
      "aiProviderStatusErrorEvidence.statusRefreshSequence === statusRefreshSequence",
    ),
  "Provider status and error selectors must require exact company, exact Refresh generation, and a settled snapshot.",
);
assert(
  !aiProvider.includes("reservedCostUsdToday: number;") &&
    !crmApp.includes("Reserved today:") &&
    crmApp.includes("Company reserved this month:") &&
    crmApp.includes("usage?.companyReservedCostUsdThisMonth"),
  "Exact-company AI results must not serialize or render global all-company reserved spend.",
);

const aiCommandRunIndex = crmApp.indexOf("const runAiCommandPrompt = async");
const aiCommandStartSnapshotGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(statusRefreshSequence)",
  aiCommandRunIndex,
);
const aiCommandFallbackBuildIndex = crmApp.indexOf(
  "const fallbackResponse = answerAiCommand({",
  aiCommandStartSnapshotGuardIndex,
);
const aiCommandSuccessSnapshotGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(requestStatusRefreshSequence)",
  aiCommandFallbackBuildIndex,
);
const aiCommandCompletionGuardIndex = crmApp.indexOf(
  "!isCurrentAiCommandCompletion({",
  aiCommandSuccessSnapshotGuardIndex,
);
const aiCommandSuccessResponseIndex = crmApp.indexOf(
  "setAiResponseHistoryEvidence((current) => ({",
  aiCommandCompletionGuardIndex,
);
const aiCommandCatchIndex = crmApp.indexOf("} catch (currentError) {", aiCommandSuccessResponseIndex);
const aiCommandCatchSnapshotGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(requestStatusRefreshSequence)",
  aiCommandCatchIndex,
);
const aiCommandCatchGuardIndex = crmApp.indexOf(
  "!isCurrentAiCommandCompletion({",
  aiCommandCatchSnapshotGuardIndex,
);
const aiCommandFallbackResponseIndex = crmApp.indexOf(
  "setAiResponseHistoryEvidence((current) => ({",
  aiCommandCatchGuardIndex,
);
assert(
  aiCommandRunIndex >= 0 &&
    aiCommandStartSnapshotGuardIndex > aiCommandRunIndex &&
    aiCommandFallbackBuildIndex > aiCommandStartSnapshotGuardIndex &&
    aiCommandSuccessSnapshotGuardIndex > aiCommandFallbackBuildIndex &&
    aiCommandCompletionGuardIndex > aiCommandSuccessSnapshotGuardIndex &&
    aiCommandSuccessResponseIndex > aiCommandCompletionGuardIndex &&
    aiCommandCatchSnapshotGuardIndex > aiCommandCatchIndex &&
    aiCommandCatchGuardIndex > aiCommandCatchIndex &&
    aiCommandCatchGuardIndex > aiCommandCatchSnapshotGuardIndex &&
    aiCommandFallbackResponseIndex > aiCommandCatchGuardIndex,
  "Current company and Refresh generation must be verified before publishing live or fallback AI responses.",
);
for (const responseEvidenceBoundary of [
  "export type AiResponseHistoryEvidence = {",
  "export function getCurrentAiResponses({",
  "evidence.companyId !== companyId",
  "evidence.statusRefreshSequence !== statusRefreshSequence",
  "useState<AiResponseHistoryEvidence | null>(null)",
  "evidence: aiResponseHistoryEvidence",
  "companyId: requestCompanyId",
  "statusRefreshSequence: requestStatusRefreshSequence",
  "current?.companyId === requestCompanyId",
  "current.statusRefreshSequence === requestStatusRefreshSequence",
]) {
  includes(
    `${aiToolsSource}\n${crmApp}`,
    responseEvidenceBoundary,
    `Grounded AI response history must be exact-company and Refresh-generation scoped: ${responseEvidenceBoundary}.`,
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
const workspaceReloadIndex = crmApp.indexOf(
  "await onScrollPreservingReload()",
  workspaceRefreshIndex,
);
assert(
  workspaceRefreshIndex >= 0 && workspaceReloadIndex > workspaceRefreshIndex,
  "Workspace Refresh must use the root snapshot reload boundary.",
);
const snapshotReloadIndex = crmApp.indexOf("const loadSnapshot = useCallback");
const snapshotTransitionIndex = crmApp.indexOf(
  "const beginSnapshotTransition = useCallback",
);
const snapshotRequestCaptureIndex = crmApp.indexOf(
  "const requestSequence = snapshotLoadRequestSequenceRef.current + 1",
  snapshotTransitionIndex,
);
const snapshotRequestPublishIndex = crmApp.indexOf(
  "snapshotLoadRequestSequenceRef.current = requestSequence",
  snapshotRequestCaptureIndex,
);
const snapshotPendingRefSetIndex = crmApp.indexOf(
  "snapshotTransitionPendingRef.current = true",
  snapshotRequestPublishIndex,
);
const snapshotPendingStateSetIndex = crmApp.indexOf(
  "setSnapshotTransitionPending(true)",
  snapshotPendingRefSetIndex,
);
const snapshotReloadGenerationIndex = crmApp.indexOf(
  "setAiProviderStatusRefreshSequence((current) => current + 1)",
  snapshotPendingStateSetIndex,
);
const snapshotTransitionReturnIndex = crmApp.indexOf(
  "return requestSequence",
  snapshotReloadGenerationIndex,
);
const snapshotTransitionCompleteIndex = crmApp.indexOf(
  "const completeSnapshotTransition = useCallback",
  snapshotTransitionReturnIndex,
);
const snapshotTransitionCompleteGuardIndex = crmApp.indexOf(
  "snapshotLoadRequestSequenceRef.current !== requestSequence",
  snapshotTransitionCompleteIndex,
);
const snapshotPendingRefClearIndex = crmApp.indexOf(
  "snapshotTransitionPendingRef.current = false",
  snapshotTransitionCompleteGuardIndex,
);
const snapshotPendingStateClearIndex = crmApp.indexOf(
  "setSnapshotTransitionPending(false)",
  snapshotPendingRefClearIndex,
);
const immediateTransitionIndex = crmApp.indexOf(
  "const applyImmediateSnapshotTransition = useCallback",
  snapshotPendingStateClearIndex,
);
const immediateTransitionStartIndex = crmApp.indexOf(
  "const requestSequence = beginSnapshotTransition()",
  immediateTransitionIndex,
);
const immediateTransitionTryIndex = crmApp.indexOf("try {", immediateTransitionStartIndex);
const immediateTransitionRunIndex = crmApp.indexOf("transition()", immediateTransitionTryIndex);
const immediateTransitionFinallyIndex = crmApp.indexOf(
  "} finally {",
  immediateTransitionRunIndex,
);
const immediateTransitionCompleteIndex = crmApp.indexOf(
  "completeSnapshotTransition(requestSequence)",
  immediateTransitionFinallyIndex,
);
const snapshotContextCurrentIndex = crmApp.indexOf(
  "const isSnapshotContextCurrent = useCallback",
  immediateTransitionCompleteIndex,
);
const snapshotContextPendingGuardIndex = crmApp.indexOf(
  "!snapshotTransitionPendingRef.current",
  snapshotContextCurrentIndex,
);
const snapshotContextSequenceGuardIndex = crmApp.indexOf(
  "snapshotLoadRequestSequenceRef.current === requestSequence",
  snapshotContextPendingGuardIndex,
);
const snapshotLoadTransitionIndex = crmApp.indexOf(
  "const requestSequence = beginSnapshotTransition()",
  snapshotReloadIndex,
);
const snapshotLoadingIndex = crmApp.indexOf("if (showLoading)", snapshotReloadIndex);
const snapshotFetchIndex = crmApp.indexOf(
  "await fetchCrmSnapshot(crmClient)",
  snapshotReloadIndex,
);
const snapshotSuccessGuardIndex = crmApp.indexOf(
  "snapshotLoadRequestSequenceRef.current !== requestSequence",
  snapshotFetchIndex,
);
const snapshotPublishIndex = crmApp.indexOf(
  "setSnapshot(nextSnapshot)",
  snapshotSuccessGuardIndex,
);
const snapshotCatchIndex = crmApp.indexOf("} catch (currentError) {", snapshotPublishIndex);
const snapshotCatchGuardIndex = crmApp.indexOf(
  "snapshotLoadRequestSequenceRef.current !== requestSequence",
  snapshotCatchIndex,
);
const snapshotErrorLogIndex = crmApp.indexOf(
  'logCaughtError("[CRM] CRM snapshot load failed", currentError)',
  snapshotCatchGuardIndex,
);
const snapshotFinallyIndex = crmApp.indexOf("} finally {", snapshotErrorLogIndex);
const snapshotFinallyCompletionIndex = crmApp.indexOf(
  "completeSnapshotTransition(requestSequence)",
  snapshotFinallyIndex,
);
const snapshotLoadingClearIndex = crmApp.indexOf(
  "setIsLoading(false)",
  snapshotFinallyCompletionIndex,
);
assert(
  snapshotTransitionIndex >= 0 &&
    snapshotRequestCaptureIndex > snapshotTransitionIndex &&
    snapshotRequestPublishIndex > snapshotRequestCaptureIndex &&
    snapshotPendingRefSetIndex > snapshotRequestPublishIndex &&
    snapshotPendingStateSetIndex > snapshotPendingRefSetIndex &&
    snapshotReloadGenerationIndex > snapshotPendingStateSetIndex &&
    snapshotTransitionReturnIndex > snapshotReloadGenerationIndex &&
    snapshotTransitionCompleteIndex > snapshotTransitionReturnIndex &&
    snapshotTransitionCompleteGuardIndex > snapshotTransitionCompleteIndex &&
    snapshotPendingRefClearIndex > snapshotTransitionCompleteGuardIndex &&
    snapshotPendingStateClearIndex > snapshotPendingRefClearIndex &&
    immediateTransitionIndex > snapshotPendingStateClearIndex &&
    immediateTransitionStartIndex > immediateTransitionIndex &&
    immediateTransitionTryIndex > immediateTransitionStartIndex &&
    immediateTransitionRunIndex > immediateTransitionTryIndex &&
    immediateTransitionFinallyIndex > immediateTransitionRunIndex &&
    immediateTransitionCompleteIndex > immediateTransitionFinallyIndex &&
    snapshotContextCurrentIndex > immediateTransitionCompleteIndex &&
    snapshotContextPendingGuardIndex > snapshotContextCurrentIndex &&
    snapshotContextSequenceGuardIndex > snapshotContextPendingGuardIndex &&
    snapshotReloadIndex > snapshotContextSequenceGuardIndex &&
    snapshotLoadTransitionIndex > snapshotReloadIndex &&
    snapshotLoadingIndex > snapshotLoadTransitionIndex &&
    snapshotFetchIndex > snapshotLoadTransitionIndex &&
    snapshotSuccessGuardIndex > snapshotFetchIndex &&
    snapshotPublishIndex > snapshotSuccessGuardIndex &&
    snapshotCatchGuardIndex > snapshotCatchIndex &&
    snapshotErrorLogIndex > snapshotCatchGuardIndex &&
    snapshotFinallyCompletionIndex > snapshotFinallyIndex &&
    snapshotLoadingClearIndex > snapshotFinallyCompletionIndex,
  "Every snapshot transition must synchronously invalidate AI evidence, expose pending context, and reject stale success, error, and loading commits.",
);
const demoSnapshotChangeIndex = crmApp.indexOf(
  "const handleDemoSnapshotChange = useCallback",
);
const demoSnapshotGenerationIndex = crmApp.indexOf(
  "applyImmediateSnapshotTransition(() => {",
  demoSnapshotChangeIndex,
);
const demoSnapshotWriteIndex = crmApp.indexOf(
  "setSnapshot((currentSnapshot) =>",
  demoSnapshotChangeIndex,
);
assert(
  demoSnapshotChangeIndex >= 0 &&
    demoSnapshotGenerationIndex > demoSnapshotChangeIndex &&
    demoSnapshotWriteIndex > demoSnapshotGenerationIndex,
  "Every demo snapshot mutation must synchronously supersede live loads before changing context.",
);
for (const snapshotGenerationBoundary of [
  "aiProviderStatusRefreshSequence: number",
  "aiProviderStatusRefreshSequence={aiProviderStatusRefreshSequence}",
  "statusRefreshSequence={aiProviderStatusRefreshSequence}",
  "snapshotTransitionPending: boolean",
  "snapshotTransitionPending={snapshotTransitionPending}",
  "isSnapshotContextCurrent: (requestSequence: number) => boolean",
  "isSnapshotContextCurrent={isSnapshotContextCurrent}",
]) {
  includes(
    crmApp,
    snapshotGenerationBoundary,
    `AI snapshot generation must survive workspace reloads: ${snapshotGenerationBoundary}.`,
  );
}
const crmAppRootIndex = crmApp.indexOf("export function CrmApp()");
const crmWorkspacePropsIndex = crmApp.indexOf("type CrmWorkspaceProps = {");
const crmWorkspaceFunctionIndex = crmApp.indexOf("function CrmWorkspace({");
const crmAppRootStateBoundary = crmApp.slice(crmAppRootIndex, crmWorkspacePropsIndex);
const crmWorkspaceStateBoundary = crmApp.slice(
  crmWorkspaceFunctionIndex,
  workspaceRefreshIndex,
);
assert(
  crmAppRootStateBoundary.includes(
    "const [aiProviderStatusRefreshSequence, setAiProviderStatusRefreshSequence] =",
  ) &&
    crmAppRootStateBoundary.includes(
      "const [snapshotTransitionPending, setSnapshotTransitionPending] = useState(false)",
    ) &&
    crmAppRootStateBoundary.includes("const snapshotLoadRequestSequenceRef = useRef(0)") &&
    crmAppRootStateBoundary.includes(
      "const snapshotTransitionPendingRef = useRef(false)",
    ) &&
    !crmWorkspaceStateBoundary.includes(
      "const [aiProviderStatusRefreshSequence, setAiProviderStatusRefreshSequence] =",
    ),
  "AI snapshot generation must be owned above CrmWorkspace so full reloads cannot reset it.",
);
const workspaceRefreshBoundary = crmApp.slice(
  workspaceRefreshIndex,
  crmApp.indexOf("useEffect(() =>", workspaceRefreshIndex),
);
assert(
  !workspaceRefreshBoundary.includes("setAiProviderStatusRefreshSequence") &&
    workspaceRefreshBoundary.includes("await onScrollPreservingReload()"),
  "Header Refresh must delegate to the centralized snapshot invalidation without double advancing.",
);
const crmWorkspaceRenderIndex = crmApp.indexOf("<CrmWorkspace", crmAppRootIndex);
const crmWorkspaceRenderBoundary = crmApp.slice(
  crmWorkspaceRenderIndex,
  crmApp.indexOf("function LoadingScreen", crmWorkspaceRenderIndex),
);
assert(
  (
    crmWorkspaceRenderBoundary.match(
      /applyImmediateSnapshotTransition\(\(\) => \{/g,
    ) ?? []
  ).length === 2,
  "Both root demo reload callbacks must supersede live loads before replacing the snapshot.",
);
const crmRootSnapshotBoundary = crmApp.slice(
  crmAppRootIndex,
  crmApp.indexOf("function LoadingScreen", crmAppRootIndex),
);
assert(
  (crmRootSnapshotBoundary.match(/\bsetSnapshot\(/g) ?? []).length === 12 &&
    (
      crmRootSnapshotBoundary.match(
        /applyImmediateSnapshotTransition\(\(\) => \{/g,
      ) ?? []
    ).length === 10 &&
    (crmRootSnapshotBoundary.match(/\bbeginSnapshotTransition\(\)/g) ?? []).length ===
      2,
  "Every direct root auth, demo, retry, and workspace snapshot transition must use the shared synchronous invalidator; guarded live success and fallback reuse their captured token.",
);
const crmRootSnapshotLines = crmRootSnapshotBoundary.split("\n");
const liveSnapshotStartLine = crmRootSnapshotLines.findIndex((line) =>
  line.includes("const loadSnapshot = useCallback"),
);
const liveSnapshotEndLine = crmRootSnapshotLines.findIndex(
  (line, index) =>
    index > liveSnapshotStartLine &&
    line.includes("[beginSnapshotTransition, completeSnapshotTransition"),
);
const rootSnapshotWriteLines = crmRootSnapshotLines
  .map((line, index) => ({ line, index }))
  .filter(({ line }) => /\bsetSnapshot\(/.test(line));
assert(
  liveSnapshotStartLine >= 0 &&
    liveSnapshotEndLine > liveSnapshotStartLine &&
    rootSnapshotWriteLines.filter(
      ({ index }) => index > liveSnapshotStartLine && index < liveSnapshotEndLine,
    ).length === 2,
  "The live snapshot loader must own exactly its guarded success and fallback writes.",
);
for (const { index } of rootSnapshotWriteLines) {
  if (index > liveSnapshotStartLine && index < liveSnapshotEndLine) {
    continue;
  }
  assert(
    crmRootSnapshotLines
      .slice(Math.max(0, index - 4), index)
      .some((line) => line.includes("applyImmediateSnapshotTransition(() => {")),
    `Root snapshot write on source line ${index + 1} bypasses the synchronous transition boundary.`,
  );
}
const markActionReviewedIndex = crmApp.indexOf("const markActionReviewed = async (");
const generateScopeIndex = crmApp.indexOf("const generateScope = () =>", markActionReviewedIndex);
const saveScopeDraftIndex = crmApp.indexOf("const saveScopeDraft = async () =>");
const generateEstimateIndex = crmApp.indexOf("const generateEstimate = () =>", saveScopeDraftIndex);
const saveEstimateDraftIndex = crmApp.indexOf("const saveEstimateDraft = async () =>");
const estimateTotalsIndex = crmApp.indexOf(
  "const estimateTotals = calculateEstimateTotals(",
  saveEstimateDraftIndex,
);
const saveScopeReloadCount = (
  crmApp.slice(saveScopeDraftIndex, generateEstimateIndex).match(/await onReload\(\)/g) ?? []
).length;
const saveEstimateReloadCount = (
  crmApp.slice(saveEstimateDraftIndex, estimateTotalsIndex).match(/await onReload\(\)/g) ?? []
).length;
assert(
  saveScopeDraftIndex >= 0 &&
    generateEstimateIndex > saveScopeDraftIndex &&
    saveEstimateDraftIndex > generateEstimateIndex &&
    estimateTotalsIndex > saveEstimateDraftIndex &&
    saveScopeReloadCount === 1 &&
    saveEstimateReloadCount === 1,
  "Saved AI scope and estimate drafts must cross the snapshot-generation reload boundary.",
);
const aiToolsViewIndex = crmApp.indexOf("function AiToolsView({");
const draftContextKeyIndex = crmApp.indexOf(
  "const aiDraftContextKey = `${activeCompanyId}:${statusRefreshSequence}`",
  aiToolsViewIndex,
);
const currentScopeDraftIndex = crmApp.indexOf(
  "scopeDraftContextKey === aiDraftContextKey ? scopeDraft : \"\"",
  draftContextKeyIndex,
);
const currentEstimateDraftIndex = crmApp.indexOf(
  "estimateDraftContextKey === aiDraftContextKey ? estimateDraft : []",
  currentScopeDraftIndex,
);
const generateScopeBoundary = crmApp.slice(generateScopeIndex, saveScopeDraftIndex);
const saveScopeBoundary = crmApp.slice(saveScopeDraftIndex, generateEstimateIndex);
const generateEstimateBoundary = crmApp.slice(
  generateEstimateIndex,
  saveEstimateDraftIndex,
);
const saveEstimateBoundary = crmApp.slice(saveEstimateDraftIndex, estimateTotalsIndex);
const estimateTotalsBoundary = crmApp.slice(
  estimateTotalsIndex,
  crmApp.indexOf("return (", estimateTotalsIndex),
);
assert(
  aiToolsViewIndex >= 0 &&
    draftContextKeyIndex > aiToolsViewIndex &&
    currentScopeDraftIndex > draftContextKeyIndex &&
    currentEstimateDraftIndex > currentScopeDraftIndex &&
    generateScopeBoundary.includes(
      "if (!isSnapshotContextCurrent(statusRefreshSequence))",
    ) &&
    generateScopeBoundary.includes("setScopeDraftContextKey(aiDraftContextKey)") &&
    saveScopeBoundary.includes(
      "if (!isSnapshotContextCurrent(statusRefreshSequence))",
    ) &&
    saveScopeBoundary.includes("scope_body: currentScopeDraft") &&
    saveScopeBoundary.includes("body: currentScopeDraft") &&
    (saveScopeBoundary.match(/\bcurrentScopeDraft\b/g) ?? []).length === 3 &&
    !/\bscopeDraft\b/.test(saveScopeBoundary) &&
    generateEstimateBoundary.includes(
      "if (!isSnapshotContextCurrent(statusRefreshSequence))",
    ) &&
    generateEstimateBoundary.includes(
      "setEstimateDraftContextKey(aiDraftContextKey)",
    ) &&
    saveEstimateBoundary.includes(
      "if (!isSnapshotContextCurrent(statusRefreshSequence))",
    ) &&
    saveEstimateBoundary.includes("if (!currentEstimateDraft.length)") &&
    (saveEstimateBoundary.match(/\bcurrentEstimateDraft\b/g) ?? []).length === 3 &&
    !/\bestimateDraft\b/.test(saveEstimateBoundary) &&
    estimateTotalsBoundary.includes("currentEstimateDraft") &&
    !/\bestimateDraft\b/.test(estimateTotalsBoundary),
  "Scope and estimate drafts must be exact-scope, exact-generation evidence and may only build or save against current root snapshot context.",
);
const scopeWriterUiIndex = crmApp.indexOf('data-testid="ai-scope-writer-2"');
const estimateAssistantUiIndex = crmApp.indexOf(
  'data-testid="ai-estimate-assistant-2"',
  scopeWriterUiIndex,
);
const scopeWriterUiBoundary = crmApp.slice(scopeWriterUiIndex, estimateAssistantUiIndex);
const estimateAssistantUiBoundary = crmApp.slice(
  estimateAssistantUiIndex,
  crmApp.indexOf('data-testid="ai-saved-work"', estimateAssistantUiIndex),
);
assert(
  scopeWriterUiIndex >= 0 &&
    estimateAssistantUiIndex > scopeWriterUiIndex &&
    scopeWriterUiBoundary.includes("value={currentScopeDraft}") &&
    scopeWriterUiBoundary.includes(
      "disabled={snapshotTransitionPending || !currentScopeDraft.trim()}",
    ) &&
    (scopeWriterUiBoundary.match(/disabled=\{snapshotTransitionPending\}/g) ?? [])
      .length >= 3 &&
    estimateAssistantUiBoundary.includes("currentEstimateDraft.length") &&
    estimateAssistantUiBoundary.includes(
      "disabled={snapshotTransitionPending || !currentEstimateDraft.length}",
    ) &&
    (estimateAssistantUiBoundary.match(/disabled=\{snapshotTransitionPending\}/g) ?? [])
      .length >= 2,
  "Snapshot-derived draft controls must hide stale evidence and remain disabled throughout a context transition.",
);
const scopeTemplateSelectIndex = crmApp.indexOf(
  "value={scopeTemplateId}",
  scopeWriterUiIndex,
);
const scopeTemplateSelectEndIndex = crmApp.indexOf(
  "</select>",
  scopeTemplateSelectIndex,
);
const scopeCustomerSelectIndex = crmApp.indexOf(
  "value={scopeCustomerId}",
  scopeTemplateSelectEndIndex,
);
const scopeCustomerSelectEndIndex = crmApp.indexOf(
  "</select>",
  scopeCustomerSelectIndex,
);
const estimateSourceSelectIndex = crmApp.indexOf(
  "value={estimateSourceId}",
  estimateAssistantUiIndex,
);
const estimateSourceSelectEndIndex = crmApp.indexOf(
  "</select>",
  estimateSourceSelectIndex,
);
assert(
  scopeTemplateSelectIndex >= scopeWriterUiIndex &&
    scopeTemplateSelectEndIndex > scopeTemplateSelectIndex &&
    scopeCustomerSelectIndex > scopeTemplateSelectEndIndex &&
    scopeCustomerSelectEndIndex > scopeCustomerSelectIndex &&
    estimateSourceSelectIndex >= estimateAssistantUiIndex &&
    estimateSourceSelectEndIndex > estimateSourceSelectIndex,
  "Snapshot-derived draft selector test boundaries must remain exact and ordered.",
);
for (const [label, boundary, contextSetter, draftClear] of [
  [
    "scope template",
    crmApp.slice(scopeTemplateSelectIndex, scopeTemplateSelectEndIndex),
    "setScopeDraftContextKey(aiDraftContextKey)",
    'setScopeDraft("")',
  ],
  [
    "scope customer",
    crmApp.slice(scopeCustomerSelectIndex, scopeCustomerSelectEndIndex),
    "setScopeDraftContextKey(aiDraftContextKey)",
    'setScopeDraft("")',
  ],
  [
    "estimate source",
    crmApp.slice(estimateSourceSelectIndex, estimateSourceSelectEndIndex),
    "setEstimateDraftContextKey(aiDraftContextKey)",
    "setEstimateDraft([])",
  ],
]) {
  assert(
    boundary.includes(contextSetter) &&
      boundary.indexOf(draftClear) > boundary.indexOf(contextSetter),
    `Changing the ${label} must bind and clear its prior snapshot-derived draft.`,
  );
}
const actionReviewReloadCount = (
  crmApp.slice(markActionReviewedIndex, generateScopeIndex).match(/await onReload\(\)/g) ?? []
).length;
const actionReviewBoundary = crmApp.slice(markActionReviewedIndex, generateScopeIndex);
const actionReviewStartGuardIndex = crmApp.indexOf(
  "if (!isSnapshotContextCurrent(statusRefreshSequence))",
  markActionReviewedIndex,
);
const actionReviewGenerationCaptureIndex = crmApp.indexOf(
  "const reviewStatusRefreshSequence = statusRefreshSequence",
  actionReviewStartGuardIndex,
);
const actionReviewReceiptDeclarationIndex = crmApp.indexOf(
  "const receipt = reviewPayload as AiActionReviewReceipt",
  actionReviewGenerationCaptureIndex,
);
const actionReviewResponseContextGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(reviewStatusRefreshSequence)",
  actionReviewReceiptDeclarationIndex,
);
const actionReviewReceiptValidationIndex = crmApp.indexOf(
  "receipt.aiAuditEventId !== preview.auditReference",
  actionReviewResponseContextGuardIndex,
);
const actionReviewCatchIndex = crmApp.indexOf(
  "} catch (currentError) {",
  actionReviewReceiptValidationIndex,
);
const actionReviewCatchContextGuardIndex = crmApp.indexOf(
  "!isSnapshotContextCurrent(reviewStatusRefreshSequence)",
  actionReviewCatchIndex,
);
const actionReviewErrorPublishIndex = crmApp.indexOf(
  "onError(",
  actionReviewCatchContextGuardIndex,
);
assert(
  markActionReviewedIndex >= 0 &&
    generateScopeIndex > markActionReviewedIndex &&
    actionReviewReloadCount === 2 &&
    actionReviewStartGuardIndex > markActionReviewedIndex &&
    actionReviewGenerationCaptureIndex > actionReviewStartGuardIndex &&
    actionReviewReceiptDeclarationIndex > actionReviewGenerationCaptureIndex &&
    actionReviewResponseContextGuardIndex > actionReviewReceiptDeclarationIndex &&
    actionReviewReceiptValidationIndex > actionReviewResponseContextGuardIndex &&
    actionReviewCatchIndex > actionReviewReceiptValidationIndex &&
    actionReviewCatchContextGuardIndex > actionReviewCatchIndex &&
    actionReviewErrorPublishIndex > actionReviewCatchContextGuardIndex &&
    (
      actionReviewBoundary.match(
        /isSnapshotContextCurrent\(reviewStatusRefreshSequence\)/g,
      ) ?? []
    ).length === 2,
  "Both durable AI action-review outcomes must cross the snapshot-generation reload boundary.",
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
const quotaProbeAcknowledgeCallbackIndex = crmApp.indexOf(
  "const acknowledgeQuotaProbeRefresh = useCallback(",
);
const quotaProbeAcknowledgeHelperIndex = crmApp.indexOf(
  "const acknowledged = acknowledgeAiQuotaProbeRefresh(",
  quotaProbeAcknowledgeCallbackIndex,
);
const quotaProbeAcknowledgeVersionIndex = crmApp.indexOf(
  "setAiQuotaProbeRefreshStateVersion((current) => current + 1)",
  quotaProbeAcknowledgeHelperIndex,
);
const quotaProbeAcknowledgeReturnIndex = crmApp.indexOf(
  "return acknowledged;",
  quotaProbeAcknowledgeVersionIndex,
);
assert(
  quotaProbeAcknowledgeCallbackIndex >= 0 &&
    quotaProbeAcknowledgeHelperIndex > quotaProbeAcknowledgeCallbackIndex &&
    quotaProbeAcknowledgeVersionIndex > quotaProbeAcknowledgeHelperIndex &&
    quotaProbeAcknowledgeReturnIndex > quotaProbeAcknowledgeVersionIndex,
  "A completed detached status request must notify the mounted workspace after acknowledging a generation.",
);
const companyResetStart = crmApp.indexOf(
  "aiCommandAbortRef.current?.abort();\n    aiProviderStatusAbortRef.current?.abort();\n    aiReviewAbortRef.current?.abort();",
);
const companyResetEffectStart = crmApp.lastIndexOf(
  "  useEffect(() => {",
  companyResetStart,
);
const companyResetSameCompanyGuardIndex = crmApp.indexOf(
  "if (activeAiCompanyRef.current === activeCompanyId)",
  companyResetEffectStart,
);
const companyResetEnd = crmApp.indexOf("}, [activeCompanyId]);", companyResetStart);
assert(
  companyResetEffectStart >= 0 &&
    companyResetSameCompanyGuardIndex > companyResetEffectStart &&
    companyResetSameCompanyGuardIndex < companyResetStart &&
    companyResetEnd > companyResetStart,
  "AI abort and session reset must execute only for a real active-company transition, not StrictMode effect replay.",
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
