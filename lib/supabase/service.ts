import "server-only";
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

/**
 * Verifies the trusted quota RPC through PostgREST's role-filtered OpenAPI
 * document. This checks the active service credential, grant, and exact RPC
 * signature without invoking the reservation function or mutating quota data.
 */
export async function verifySupabaseAiQuotaServiceCapability(
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
) {
  const config = readSupabaseServiceRoleConfig(env);
  if (!config) {
    return false;
  }
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
