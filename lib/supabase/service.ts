import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../crm/types";

/**
 * Creates a short-lived server-only client for bounded background work.
 *
 * Never import this module from a Client Component. The service-role key must
 * remain available only to trusted route handlers and background workers.
 */
export function getSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
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
