import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type {
  AiPilotProviderConfig,
  AiQuotaStatusRequest,
} from "../crm/aiProvider";
import type { Database } from "../crm/types";

const AI_QUOTA_RPC_PATH = "/rpc/wtos_reserve_ai_request_v1";
const AI_QUOTA_STATUS_RPC_PATH = "/rest/v1/rpc/wtos_get_ai_quota_status_v1";
const AI_QUOTA_RPC_ARGUMENTS = [
  "p_company_id",
  "p_actor_user_id",
  "p_request_id",
  "p_request",
] as const;
const SUPABASE_OPENAPI_MAX_BYTES = 2 * 1024 * 1024;
const SUPABASE_OPENAPI_TIMEOUT_MS = 8_000;
const SUPABASE_AI_QUOTA_STATUS_MAX_BYTES = 16 * 1024;
const SUPABASE_AI_QUOTA_STATUS_TIMEOUT_MS = 8_000;
const AI_QUOTA_CAPABILITY_SUCCESS_TTL_MS = 60_000;
const AI_QUOTA_CAPABILITY_FAILURE_TTL_MS = 5_000;
const AI_QUOTA_PROBE_SUCCESS_TTL_MS = 30_000;
const AI_QUOTA_PROBE_FAILURE_TTL_MS = 5_000;
const AI_QUOTA_PROBE_CACHE_MAX_ENTRIES = 128;
const AI_QUOTA_PROBE_MAX_REQUEST_TOKENS = 1_000_000;

type AiQuotaCapabilityCacheEntry = {
  value: boolean | null;
  expiresAt: number;
  inFlight: Promise<boolean> | null;
};

const aiQuotaCapabilityCache = new WeakMap<
  typeof fetch,
  Map<string, AiQuotaCapabilityCacheEntry>
>();

type AiQuotaProbeCacheEntry = {
  value: number | null;
  expiresAt: number;
  inFlight: Promise<number | null> | null;
  queuedRefresh: Promise<number | null> | null;
};

const aiQuotaProbeCache = new Map<string, AiQuotaProbeCacheEntry>();
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactAiQuotaRpcContract(document: unknown) {
  if (
    !isRecord(document) ||
    document.swagger !== "2.0" ||
    !isRecord(document.paths)
  ) {
    return false;
  }
  const rpcPath = document.paths[AI_QUOTA_RPC_PATH];
  if (
    !isRecord(rpcPath) ||
    "get" in rpcPath ||
    !isRecord(rpcPath.post)
  ) {
    return false;
  }
  const parameters = rpcPath.post.parameters;
  if (!Array.isArray(parameters)) {
    return false;
  }
  const bodyParameters = parameters.filter(
    (parameter) =>
      isRecord(parameter) &&
      parameter.in === "body" &&
      parameter.name === "args",
  );
  if (bodyParameters.length !== 1) {
    return false;
  }
  const bodyParameter = bodyParameters[0];
  if (
    !isRecord(bodyParameter) ||
    bodyParameter.required !== true ||
    !isRecord(bodyParameter.schema) ||
    bodyParameter.schema.type !== "object" ||
    !isRecord(bodyParameter.schema.properties) ||
    !Array.isArray(bodyParameter.schema.required)
  ) {
    return false;
  }
  const requiredArguments = bodyParameter.schema.required;
  const propertyNames = Object.keys(bodyParameter.schema.properties);
  if (
    requiredArguments.length !== AI_QUOTA_RPC_ARGUMENTS.length ||
    propertyNames.length !== AI_QUOTA_RPC_ARGUMENTS.length ||
    !AI_QUOTA_RPC_ARGUMENTS.every(
      (argument) =>
        requiredArguments.includes(argument) && propertyNames.includes(argument),
    )
  ) {
    return false;
  }
  const properties = bodyParameter.schema.properties;
  return (
    isRecord(properties.p_company_id) &&
    properties.p_company_id.type === "string" &&
    properties.p_company_id.format === "uuid" &&
    isRecord(properties.p_actor_user_id) &&
    properties.p_actor_user_id.type === "string" &&
    properties.p_actor_user_id.format === "uuid" &&
    isRecord(properties.p_request_id) &&
    properties.p_request_id.type === "string" &&
    properties.p_request_id.format === "uuid" &&
    isRecord(properties.p_request) &&
    properties.p_request.format === "jsonb"
  );
}

async function readBoundedResponseText(
  response: Response,
  maximumBytes = SUPABASE_OPENAPI_MAX_BYTES,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return null;
  }
  const decoder = new TextDecoder();
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function readSupabaseServiceRoleConfig(env: NodeJS.ProcessEnv) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

export function hasSupabaseServiceRoleConfig(
  env: NodeJS.ProcessEnv = process.env,
) {
  return readSupabaseServiceRoleConfig(env) !== null;
}

async function probeSupabaseAiQuotaServiceCapability(
  config: { url: string; serviceRoleKey: string },
  fetcher: typeof fetch,
) {
  try {
    const response = await fetcher(new URL("/rest/v1/", config.url), {
      method: "GET",
      headers: {
        Accept: "application/openapi+json",
        "Accept-Profile": "public",
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(SUPABASE_OPENAPI_TIMEOUT_MS),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("application/openapi+json")
    ) {
      await response.body?.cancel();
      return false;
    }
    const responseText = await readBoundedResponseText(response);
    if (!responseText) {
      return false;
    }
    return hasExactAiQuotaRpcContract(JSON.parse(responseText) as unknown);
  } catch {
    return false;
  }
}

/**
 * Verifies the trusted quota RPC through PostgREST's role-filtered OpenAPI
 * document. This checks the active service credential, grant, and exact RPC
 * signature without invoking the reservation function or mutating quota data.
 */
export async function verifySupabaseAiQuotaServiceCapability(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  now: () => number = Date.now,
) {
  const config = readSupabaseServiceRoleConfig(env);
  if (!config) {
    return false;
  }

  let fetcherCache = aiQuotaCapabilityCache.get(fetcher);
  if (!fetcherCache) {
    fetcherCache = new Map();
    aiQuotaCapabilityCache.set(fetcher, fetcherCache);
  }
  const cacheKey = createHash("sha256")
    .update(config.url)
    .update("\0")
    .update(config.serviceRoleKey)
    .digest("hex");
  let cacheEntry = fetcherCache.get(cacheKey);
  if (!cacheEntry) {
    cacheEntry = { value: null, expiresAt: 0, inFlight: null };
    fetcherCache.set(cacheKey, cacheEntry);
  }
  const checkedAt = now();
  if (cacheEntry.value !== null && cacheEntry.expiresAt > checkedAt) {
    return cacheEntry.value;
  }
  if (cacheEntry.inFlight) {
    return cacheEntry.inFlight;
  }

  const inFlight = probeSupabaseAiQuotaServiceCapability(config, fetcher)
    .then((value) => {
      cacheEntry.value = value;
      cacheEntry.expiresAt =
        now() +
        (value
          ? AI_QUOTA_CAPABILITY_SUCCESS_TTL_MS
          : AI_QUOTA_CAPABILITY_FAILURE_TTL_MS);
      return value;
    })
    .finally(() => {
      if (cacheEntry.inFlight === inFlight) {
        cacheEntry.inFlight = null;
      }
    });
  cacheEntry.inFlight = inFlight;
  return inFlight;
}

function makeAiQuotaProbeCacheKey({
  companyId,
  actorUserId,
  userRole,
  policyId,
  policyUpdatedAt,
  companyMonthlyBudgetCents,
  config,
}: {
  companyId: string;
  actorUserId: string;
  userRole: string;
  policyId: string;
  policyUpdatedAt: string;
  companyMonthlyBudgetCents: number;
  config: AiPilotProviderConfig;
}) {
  if (
    !uuidPattern.test(companyId) ||
    !uuidPattern.test(actorUserId) ||
    !uuidPattern.test(policyId) ||
    !userRole ||
    userRole.length > 64 ||
    !Number.isFinite(Date.parse(policyUpdatedAt)) ||
    !Number.isSafeInteger(companyMonthlyBudgetCents) ||
    companyMonthlyBudgetCents <= 0
  ) {
    return null;
  }
  return createHash("sha256")
    .update(
      JSON.stringify([
        companyId,
        actorUserId,
        userRole,
        policyId,
        policyUpdatedAt,
        companyMonthlyBudgetCents,
        config.enabled,
        config.provider,
        config.model,
        config.apiKeyConfigured,
        config.dailyBudgetUsd,
        config.dailyRequestLimit,
        config.perUserDailyRequestLimit,
        config.perCompanyDailyRequestLimit,
        config.maxRequestTokens,
        config.maxResponseTokens,
        config.maxInputCostUsdPer1kTokens,
        config.maxOutputCostUsdPer1kTokens,
        config.timeoutMs,
        config.retryLimit,
        config.streamingEnabled,
        config.structuredOutputEnabled,
        config.actionExecutionEnabled,
      ]),
    )
    .digest("hex");
}

function makeAiQuotaProbeCacheRoom(checkedAt: number) {
  for (const [key, entry] of aiQuotaProbeCache) {
    if (!entry.inFlight && !entry.queuedRefresh && entry.expiresAt <= checkedAt) {
      aiQuotaProbeCache.delete(key);
    }
  }
  while (aiQuotaProbeCache.size >= AI_QUOTA_PROBE_CACHE_MAX_ENTRIES) {
    const oldestSettledKey = [...aiQuotaProbeCache].find(
      ([, entry]) => !entry.inFlight && !entry.queuedRefresh,
    )?.[0];
    if (!oldestSettledKey) {
      return false;
    }
    aiQuotaProbeCache.delete(oldestSettledKey);
  }
  return true;
}

function startAiQuotaProbeLoad(
  activeEntry: AiQuotaProbeCacheEntry,
  load: () => Promise<number>,
  now: () => number,
) {
  let inFlight: Promise<number | null>;
  inFlight = Promise.resolve()
    .then(load)
    .then((value) =>
      Number.isSafeInteger(value) &&
      value >= 1 &&
      value <= AI_QUOTA_PROBE_MAX_REQUEST_TOKENS
        ? value
        : null,
    )
    .catch(() => null)
    .then((value) => {
      activeEntry.value = value;
      activeEntry.expiresAt =
        now() +
        (value === null
          ? AI_QUOTA_PROBE_FAILURE_TTL_MS
          : AI_QUOTA_PROBE_SUCCESS_TTL_MS);
      return value;
    })
    .finally(() => {
      if (activeEntry.inFlight === inFlight) {
        activeEntry.inFlight = null;
      }
    });
  activeEntry.inFlight = inFlight;
  return inFlight;
}

function queueAiQuotaProbeRefresh(
  activeEntry: AiQuotaProbeCacheEntry,
  load: () => Promise<number>,
  now: () => number,
) {
  if (!activeEntry.inFlight) {
    return startAiQuotaProbeLoad(activeEntry, load, now);
  }
  if (activeEntry.queuedRefresh) {
    return activeEntry.queuedRefresh;
  }

  const precedingLoad = activeEntry.inFlight;
  let queuedPromise: Promise<number | null>;
  queuedPromise = precedingLoad.then(() => {
    if (activeEntry.queuedRefresh !== queuedPromise) {
      return null;
    }
    activeEntry.queuedRefresh = null;
    if (activeEntry.inFlight) {
      return activeEntry.inFlight;
    }
    return startAiQuotaProbeLoad(activeEntry, load, now);
  });
  activeEntry.queuedRefresh = queuedPromise;
  return queuedPromise;
}

/**
 * Coalesces the expensive authenticated CRM snapshot used only to estimate a
 * concrete quota probe. Cache entries retain a bounded token count, never CRM
 * rows, credentials, identifiers, or errors. Explicit Refresh requests bypass
 * a settled value and serialize behind at most one active plus one queued load
 * per stable key. Quota counters remain uncached.
 */
export async function readCachedAiQuotaProbeEstimatedRequestTokens(
  {
    companyId,
    actorUserId,
    userRole,
    policyId,
    policyUpdatedAt,
    companyMonthlyBudgetCents,
    config,
    forceRefresh,
    load,
  }: {
    companyId: string;
    actorUserId: string;
    userRole: string;
    policyId: string;
    policyUpdatedAt: string;
    companyMonthlyBudgetCents: number;
    config: AiPilotProviderConfig;
    forceRefresh: boolean;
    load: () => Promise<number>;
  },
  now: () => number = Date.now,
) {
  const cacheKey = makeAiQuotaProbeCacheKey({
    companyId,
    actorUserId,
    userRole,
    policyId,
    policyUpdatedAt,
    companyMonthlyBudgetCents,
    config,
  });
  if (!cacheKey) {
    return null;
  }
  if (typeof forceRefresh !== "boolean") {
    return null;
  }
  const checkedAt = now();
  let cacheEntry = aiQuotaProbeCache.get(cacheKey);
  if (cacheEntry) {
    aiQuotaProbeCache.delete(cacheKey);
    aiQuotaProbeCache.set(cacheKey, cacheEntry);
    if (cacheEntry.queuedRefresh) {
      return cacheEntry.queuedRefresh;
    }
    if (forceRefresh) {
      if (cacheEntry.inFlight) {
        return queueAiQuotaProbeRefresh(cacheEntry, load, now);
      }
      return startAiQuotaProbeLoad(cacheEntry, load, now);
    }
    if (cacheEntry.inFlight) {
      return cacheEntry.inFlight;
    }
    if (cacheEntry.expiresAt > checkedAt) {
      return cacheEntry.value;
    }
  } else {
    if (!makeAiQuotaProbeCacheRoom(checkedAt)) {
      return null;
    }
    cacheEntry = {
      value: null,
      expiresAt: 0,
      inFlight: null,
      queuedRefresh: null,
    };
    aiQuotaProbeCache.set(cacheKey, cacheEntry);
  }

  return startAiQuotaProbeLoad(cacheEntry, load, now);
}

/**
 * Reads a fresh, bounded quota snapshot through the stable service-role-only
 * RPC. The response remains server-side and is validated against the exact
 * company and actor before any browser-safe status is built.
 */
export async function readSupabaseAiQuotaStatus(
  {
    companyId,
    actorUserId,
    request,
  }: {
    companyId: string;
    actorUserId: string;
    request: AiQuotaStatusRequest;
  },
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): Promise<unknown | null> {
  const config = readSupabaseServiceRoleConfig(env);
  if (
    !config ||
    !uuidPattern.test(companyId) ||
    !uuidPattern.test(actorUserId)
  ) {
    return null;
  }

  try {
    const endpoint = new URL(AI_QUOTA_STATUS_RPC_PATH, config.url);
    endpoint.searchParams.set("p_company_id", companyId);
    endpoint.searchParams.set("p_actor_user_id", actorUserId);
    endpoint.searchParams.set("p_request", JSON.stringify(request));
    const response = await fetcher(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Profile": "public",
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(SUPABASE_AI_QUOTA_STATUS_TIMEOUT_MS),
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.startsWith("application/json")
    ) {
      await response.body?.cancel();
      return null;
    }
    const responseText = await readBoundedResponseText(
      response,
      SUPABASE_AI_QUOTA_STATUS_MAX_BYTES,
    );
    if (!responseText) {
      return null;
    }
    return JSON.parse(responseText) as unknown;
  } catch {
    return null;
  }
}

/**
 * Creates a short-lived server-only client for bounded background work.
 *
 * Never import this module from a Client Component. The service-role key must
 * remain available only to trusted route handlers and background workers.
 */
export function getSupabaseServiceRoleClient() {
  const config = readSupabaseServiceRoleConfig(process.env);
  if (!config) {
    return null;
  }

  return createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "weathertech-os-automation-worker",
      },
    },
  });
}
