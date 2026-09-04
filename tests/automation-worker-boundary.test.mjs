import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [route, serviceClient, vercelConfig] = await Promise.all([
  readFile(new URL("../app/api/automations/process/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/supabase/service.ts", import.meta.url), "utf8"),
  readFile(new URL("../vercel.json", import.meta.url), "utf8"),
]);

const config = JSON.parse(vercelConfig);

assert.match(route, /process\.env\.CRON_SECRET/);
assert.match(route, /cronSecret\.length\s*<\s*32/);
assert.match(route, /timingSafeEqual/);
assert.match(route, /getSupabaseServiceRoleClient/);
assert.match(route, /wtos_run_automation_worker_v1/);
assert.match(route, /p_batch_size:\s*25/);
assert.doesNotMatch(route, /email|sms|twilio|gmail|stripe/i);
assert.match(serviceClient, /env\.SUPABASE_SERVICE_ROLE_KEY\?\.trim\(\)/);
assert.match(serviceClient, /readSupabaseServiceRoleConfig\(process\.env\)/);
assert.match(serviceClient, /persistSession:\s*false/);
assert.match(serviceClient, /autoRefreshToken:\s*false/);
assert.doesNotMatch(serviceClient, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY/);
assert.deepEqual(config.crons, [
  {
    path: "/api/automations/process",
    schedule: "* * * * *",
  },
]);

console.log("Automation worker boundary: PASS");
