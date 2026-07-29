import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const migrationPath = path.join(
  repoRoot,
  "supabase",
  "migrations",
  "0024_security_company_access_hardening.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesSql(fragment) {
  return normalized.includes(fragment.replace(/\s+/g, " ").toLowerCase());
}

const legacyBroadPolicies = [
  "Authenticated users can manage customers",
  "Authenticated users can manage leads",
  "Authenticated users can manage estimates",
  "Authenticated users can manage estimate line items",
  "Authenticated users can manage scopes",
  "Authenticated users manage jobs",
  "Authenticated users manage schedule events",
  "Authenticated users manage job photos",
  "Authenticated users manage invoices",
  "Authenticated users manage invoice line items",
  "Authenticated users manage employees",
  "Authenticated users manage inspections",
  "Authenticated users manage documents",
  "Authenticated users manage email messages",
  "Authenticated users manage sms messages",
  "Authenticated users manage route plans",
  "Authenticated users manage job tasks",
  "Authenticated users manage job notes",
  "Authenticated users manage job materials",
  "Authenticated users read integration sync logs",
  "Authenticated users insert integration sync logs",
  "Authenticated users update integration sync logs",
  "Authenticated users read lead source mappings",
  "Authenticated users insert lead source mappings",
  "Authenticated users update lead source mappings",
];

for (const policy of legacyBroadPolicies) {
  assert(
    includesSql(`drop policy if exists "${policy}"`),
    `Migration does not drop legacy broad policy: ${policy}`,
  );
}

assert(
  !/create\s+policy[\s\S]*?to\s+authenticated[\s\S]*?using\s*\(\s*true\s*\)/i.test(
    migration,
  ),
  "Migration creates an authenticated policy with USING (true).",
);

assert(
  !/create\s+policy[\s\S]*?to\s+authenticated[\s\S]*?with\s+check\s*\(\s*true\s*\)/i.test(
    migration,
  ),
  "Migration creates an authenticated policy with WITH CHECK (true).",
);

const companyTables = [
  "customers",
  "leads",
  "estimates",
  "scopes",
  "jobs",
  "schedule_events",
  "job_photos",
  "invoices",
  "material_orders",
  "employees",
  "job_assignments",
  "time_entries",
  "inspections",
  "daily_logs",
  "change_orders",
  "signatures",
  "documents",
  "payments",
  "notifications",
  "integration_connections",
  "calendar_event_syncs",
  "email_messages",
  "sms_messages",
  "route_plans",
  "route_plan_stops",
  "integration_sync_logs",
  "business_phone_numbers",
  "gohighlevel_sync_mappings",
  "gohighlevel_discovery_snapshots",
];

for (const table of companyTables) {
  assert(
    includesSql(`public.${table}`),
    `Migration does not mention expected company-owned table: ${table}`,
  );
}

assert(
  includesSql("role not in ('customer_portal', 'employee_portal')"),
  "Portal roles are not explicitly excluded from internal company access.",
);

assert(
  includesSql("revoke all on table") &&
    includesSql("from anon") &&
    includesSql("from public"),
  "Migration does not revoke broad anonymous/public table grants.",
);

assert(
  includesSql("revoke delete on table") && includesSql("from authenticated"),
  "Migration does not revoke authenticated DELETE on restricted CRM tables.",
);

const scopedDeletePolicies = [
  "WTOS sales delete estimate line items",
  "WTOS financial delete invoice line items",
  "WTOS production delete material order items",
  "WTOS production delete job tasks",
];

for (const policy of scopedDeletePolicies) {
  assert(
    includesSql(`create policy "${policy}"`),
    `Expected parent-scoped delete policy is missing: ${policy}`,
  );
}

assert(
  includesSql("not exists (select 1 from public.company_memberships)") &&
    includesSql("where profile.role in ('owner', 'admin')") &&
    includesSql("order by users.created_at asc") &&
    includesSql("limit 1") &&
    includesSql("role = 'owner'"),
  "Owner bootstrap does not promote only the first auth user when no owner/admin or memberships exist.",
);

assert(
  includesSql("public.wtos_can_read_nullable_company") &&
    includesSql("when target_company_id is null then public.wtos_has_global_role(array['owner', 'admin'])"),
  "Nullable company provider records are not restricted to owner/admin users.",
);

assert(
  !/security\s+definer/i.test(migration),
  "Migration introduces SECURITY DEFINER functions.",
);

console.log("Security company access policy regression: PASS");
