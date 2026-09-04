import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../crm/types";

const AI_QUOTA_RPC_PATH = "/rpc/wtos_reserve_ai_request_v1";
const AI_QUOTA_RPC_ARGUMENTS = [
  "p_company_id",
  "p_actor_user_id",
  "p_request_id",
  "p_request",
] as const;
const SUPABASE_OPENAPI_MAX_BYTES = 2 * 1024 * 1024;
const SUPABASE_OPENAPI_TIMEOUT_MS = 8_000;
const AI_QUOTA_CAPABILITY_SUCCESS_TTL_MS = 60_000;
const AI_QUOTA_CAPABILITY_FAILURE_TTL_MS = 5_000;

type AiQuotaCapabilityCacheEntry = {
  value: boolean | null;
  expiresAt: number;
  inFlight: Promise<boolean> | null;
};

const aiQuotaCapabilityCache = new WeakMap<
  typeof fetch,
  Map<string, AiQuotaCapabilityCacheEntry>
>();

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

async function readBoundedResponseText(response: Response) {
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
      if (byteLength > SUPABASE_OPENAPI_MAX_BYTES) {
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
