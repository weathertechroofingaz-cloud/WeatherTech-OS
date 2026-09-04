import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../crm/types";

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
