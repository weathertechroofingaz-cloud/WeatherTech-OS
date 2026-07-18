import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../crm/types";
import { getSupabaseConfig } from "./config";

let browserClient: SupabaseClient<Database> | null = null;

const singleTabAuthLock = async <Result,>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<Result>,
) => fn();

export function getSupabaseBrowserClient() {
  const config = getSupabaseConfig();

  if (!config) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(config.url, config.anonKey, {
      auth: {
        lock: singleTabAuthLock,
      },
    });
  }

  return browserClient;
}
