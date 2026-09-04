import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const cwd = process.cwd();
const source = readFileSync(
  join(cwd, "app/api/ai-tools/status/route.ts"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const companyId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "99999999-9999-4999-8999-999999999999";
const policyId = "33333333-3333-4333-8333-333333333333";
const providerConfig = {
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
};
const companyPolicy = {
  id: policyId,
  company_id: companyId,
  ai_enabled: true,
  allowed_providers: ["openai"],
  allowed_models: ["owner-approved-model"],
  daily_request_limit: 500,
  per_user_daily_request_limit: 500,
  per_company_monthly_budget_cents: 5_000,
  expensive_task_confirmation_cents: 100,
  token_limit: 32_000,
  timeout_ms: 15_000,
  retry_limit: 1,
  last_reviewed_at: "2026-09-04T00:00:00.000Z",
  created_at: "2026-09-04T00:00:00.000Z",
  updated_at: "2026-09-04T00:00:00.000Z",
};

let serviceState;
function resetServiceState() {
  serviceState = {
    clientReads: 0,
    claims: [],
    claimReceipts: [],
    snapshotLoads: 0,
    cacheForces: [],
    quotaReads: 0,
  };
}
resetServiceState();

function createClient() {
  return {
    auth: {
      async getUser() {
        return { data: { user: { id: actorUserId } }, error: null };
      },
    },
    from(table) {
      const filters = new Map();
      const chain = {
        select() {
          return chain;
        },
        eq(column, value) {
          filters.set(column, value);
          return chain;
        },
        async limit() {
          if (table === "company_memberships") {
            assert(
              filters.get("user_id") === actorUserId &&
                filters.get("company_id") === companyId,
              "Status membership reads must bind the exact authenticated actor and company.",
            );
            return {
              data: [{ user_id: actorUserId, company_id: companyId, role: "owner" }],
              error: null,
            };
          }
          if (table === "ai_usage_limits") {
            assert(
              filters.get("company_id") === companyId,
              "Status policy reads must bind the exact authorized company.",
            );
            return { data: [companyPolicy], error: null };
          }
          if (table === "ai_saved_analyses") {
            assert(
              filters.get("company_id") === companyId,
              "Saved-analysis capability reads must bind the exact authorized company.",
            );
            return { data: null, error: null };
          }
          throw new Error(`Unexpected status table ${table}`);
        },
      };
      return chain;
    },
  };
}

const requireForStatusTest = (specifier) => {
  if (specifier === "next/server") {
    return {
      NextResponse: {
        json(body, init) {
          return new Response(JSON.stringify(body), {
            status: init.status,
            headers: {
              "content-type": "application/json",
              ...Object.fromEntries(new Headers(init.headers).entries()),
            },
          });
        },
      },
    };
  }
  if (specifier.endsWith("/lib/crm/aiProvider")) {
    return {
      buildAiCompanyPilotStatus({ companyId: requestedCompanyId }) {
        return {
          companyId: requestedCompanyId,
          aiEnabled: true,
          currentQuotaAvailable: true,
          monthlyBudgetCents: 5_000,
          savedAnalysesReadAvailable: true,
          readiness: { label: "Production AI enabled", liveProviderEnabled: true },
          companyPolicy: { configured: true, aiEnabled: true },
          usageAccountingConfigured: true,
          externalActionExecutionEnabled: false,
        };
      },
      buildAiQuotaStatusRequest() {
        return { contractVersion: 1 };
      },
      estimateAiQuotaStatusProbe() {
        return { estimatedRequestTokens: 321 };
      },
      getAiPilotProviderConfig() {
        return providerConfig;
      },
      parseAiQuotaStatusReceipt(value) {
        return value;
      },
      resolveCompanyAiProviderConfig() {
        return {
          ok: true,
          config: providerConfig,
          companyMonthlyBudgetCents: 5_000,
        };
      },
    };
  }
  if (specifier.endsWith("/lib/crm/aiActionRuntime")) {
    return {
      resolveExactAiCompanyAuthorization({ memberships, requestedCompanyId }) {
        if (requestedCompanyId !== companyId) {
          return {
            ok: false,
            code: "company_access_denied",
            message: "Company access denied.",
            status: 403,
          };
        }
        if (!memberships.length) {
          return {
            ok: false,
            code: "company_access_denied",
            message: "Membership must be loaded.",
            status: 403,
          };
        }
        return { ok: true, companyId, role: "owner" };
      },
    };
  }
  if (specifier.endsWith("/lib/crm/repository")) {
    return {
      async fetchCrmSnapshot() {
        serviceState.snapshotLoads += 1;
        return { marker: serviceState.snapshotLoads };
      },
    };
  }
  if (specifier.endsWith("/lib/crm/types")) {
    return {};
  }
  if (specifier.endsWith("/lib/http/boundedJson")) {
    return {
      async readBoundedJsonBody(request, maximumBytes) {
        const text = await request.text();
        if (new TextEncoder().encode(text).byteLength > maximumBytes) {
          return { ok: false, reason: "too_large" };
        }
        try {
          return { ok: true, value: text ? JSON.parse(text) : {} };
        } catch {
          return { ok: false, reason: "invalid" };
        }
      },
    };
  }
  if (specifier.endsWith("/lib/supabase/server")) {
    return {
      async getSupabaseServerClient() {
        serviceState.clientReads += 1;
        return createClient();
      },
    };
  }
  if (specifier.endsWith("/lib/supabase/service")) {
    return {
      async claimSupabaseAiQuotaProbeRefresh(input) {
        serviceState.claims.push(input);
        return serviceState.claimReceipts.shift() ?? null;
      },
      async readCachedAiQuotaProbeEstimatedRequestTokens(input) {
        serviceState.cacheForces.push(input.forceRefresh);
        return input.load();
      },
      async readSupabaseAiQuotaStatus() {
        serviceState.quotaReads += 1;
        return { requestCapacityAvailable: true };
      },
      async verifySupabaseAiQuotaServiceCapability() {
        return true;
      },
    };
  }
  throw new Error(`Unexpected status module dependency: ${specifier}`);
};

const statusModule = { exports: {} };
new Function("require", "module", "exports", compiled)(
  requireForStatusTest,
  statusModule,
  statusModule.exports,
);
const { GET, POST } = statusModule.exports;

function statusGetRequest(headers = {}) {
  const request = new Request(
    `https://weathertech.test/api/ai-tools/status?companyId=${companyId}`,
    { method: "GET", headers },
  );
  Object.defineProperty(request, "nextUrl", { value: new URL(request.url) });
  return request;
}

function statusRefreshRequest(body = { companyId }, headers = {}) {
  return new Request("https://weathertech.test/api/ai-tools/status", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const rejectedLegacyOverride = await GET(
  statusGetRequest({ "x-wtos-ai-quota-probe-refresh": "1" }),
);
assert(
  rejectedLegacyOverride.status === 400 &&
    rejectedLegacyOverride.headers.get("cache-control") === "no-store" &&
    serviceState.clientReads === 0 &&
    serviceState.claims.length === 0 &&
    serviceState.snapshotLoads === 0,
  "The legacy caller-controlled GET override must be rejected before auth, claim, or snapshot work.",
);

resetServiceState();
serviceState.claimReceipts.push(null);
const unavailableClaim = await POST(statusRefreshRequest());
assert(
  unavailableClaim.status === 503 &&
    unavailableClaim.headers.get("x-wtos-ai-quota-probe-refreshed") === null &&
    serviceState.claims.length === 1 &&
    serviceState.snapshotLoads === 0 &&
    serviceState.quotaReads === 0,
  "An unverifiable durable claim must fail closed before snapshot or quota reads and without acknowledgement.",
);

resetServiceState();
serviceState.claimReceipts.push({ allowed: false, retryAfterSeconds: 17 });
const deniedClaim = await POST(statusRefreshRequest());
const deniedPayload = await deniedClaim.json();
assert(
  deniedClaim.status === 429 &&
    deniedClaim.headers.get("retry-after") === "17" &&
    deniedClaim.headers.get("x-wtos-ai-quota-probe-refreshed") === null &&
    deniedPayload.code === "ai_quota_probe_refresh_rate_limited" &&
    deniedPayload.retryAfterSeconds === 17 &&
    serviceState.snapshotLoads === 0 &&
    serviceState.quotaReads === 0,
  "A denied claim must return a bounded retry receipt before any expensive snapshot and without acknowledgement.",
);

resetServiceState();
serviceState.claimReceipts.push(
  { allowed: true, retryAfterSeconds: 0 },
  { allowed: false, retryAfterSeconds: 30 },
);
const admittedRefresh = await POST(statusRefreshRequest());
const limitedSequentialRefresh = await POST(statusRefreshRequest());
assert(
  admittedRefresh.status === 200 &&
    admittedRefresh.headers.get("x-wtos-ai-quota-probe-refreshed") === "1" &&
    limitedSequentialRefresh.status === 429 &&
    limitedSequentialRefresh.headers.get("x-wtos-ai-quota-probe-refreshed") === null &&
    serviceState.claims.length === 2 &&
    serviceState.snapshotLoads === 1 &&
    serviceState.cacheForces.length === 1 &&
    serviceState.cacheForces[0] === true &&
    serviceState.quotaReads === 1,
  "Sequential authenticated refresh requests must perform exactly one claimed snapshot load and acknowledge only its completed status.",
);

resetServiceState();
const ordinaryStatus = await GET(statusGetRequest());
assert(
  ordinaryStatus.status === 200 &&
    ordinaryStatus.headers.get("x-wtos-ai-quota-probe-refreshed") === null &&
    serviceState.claims.length === 0 &&
    serviceState.snapshotLoads === 1 &&
    serviceState.cacheForces.length === 1 &&
    serviceState.cacheForces[0] === false &&
    serviceState.quotaReads === 1,
  "Ordinary GET status must remain claim-free and may only use the normal bounded probe cache path.",
);

console.log("AI status refresh rate-limit boundary regression passed.");
