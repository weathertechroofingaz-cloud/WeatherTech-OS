import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260902024804_automation_engine_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const mightyLegacyCorrectionMigration = await readFile(
  new URL(
    "../supabase/migrations/20260902043624_mighty_apes_legacy_service_routing_correction.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacyLeadLintCorrectionMigration = await readFile(
  new URL(
    "../supabase/migrations/20260902044714_legacy_lead_dynamic_insert_lint_correction.sql",
    import.meta.url,
  ),
  "utf8",
);
const canonicalLeadLintCorrectionMigration = await readFile(
  new URL(
    "../supabase/migrations/20260902045112_canonical_lead_dynamic_insert_lint_correction.sql",
    import.meta.url,
  ),
  "utf8",
);
const sql = migration.replace(/\s+/g, " ").trim().toLowerCase();
const mightyLegacyCorrectionSql = mightyLegacyCorrectionMigration
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const legacyLeadLintCorrectionSql = legacyLeadLintCorrectionMigration
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const canonicalLeadLintCorrectionSql = canonicalLeadLintCorrectionMigration
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

assert.match(sql, /constraint company_locations_company_key_key unique \(company_id, location_key\)/);
assert.match(sql, /constraint company_locations_id_company_key unique \(id, company_id\)/);
for (const location of [
  ["weathertech_phoenix", "weathertech phoenix / scottsdale"],
  ["weathertech_tucson", "weathertech tucson"],
  ["ihc", "ihc painting"],
]) {
  assert.ok(
    sql.includes(`'${location[0]}', '${location[1]}'`),
    `missing exact location seed ${location[0]}`,
  );
}
assert.doesNotMatch(sql, /insert into public\.company_locations[^;]*(?:street|address|latitude|longitude)/);

for (const table of [
  "leads",
  "lead_intake_records",
  "automation_rules",
  "automation_events",
  "automation_executions",
  "automation_attempts",
  "automation_audit_events",
  "office_tasks",
]) {
  assert.match(
    sql,
    new RegExp(`${table}[^;]*company_location`),
    `${table} must carry or receive exact location scope`,
  );
}

for (const constraint of [
  "leads_company_location_company_fkey",
  "lead_intake_records_company_location_company_fkey",
  "automation_rules_company_location_fkey",
  "automation_events_company_location_fkey",
  "automation_executions_company_location_fkey",
  "automation_attempts_company_location_fkey",
  "automation_audit_events_company_location_fkey",
  "office_tasks_company_location_fkey",
]) {
  assert.match(
    sql,
    new RegExp(`constraint ${constraint}[^;]*foreign key \\(company_location_id, company_id\\)[^;]*references public\\.company_locations\\(id, company_id\\)`),
    `${constraint} must prevent cross-company location assignment`,
  );
}

for (const table of [
  "company_locations",
  "automation_rules",
  "automation_events",
  "automation_executions",
  "automation_attempts",
  "automation_audit_events",
]) {
  assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`));
  assert.match(
    sql,
    new RegExp(`on public\\.${table} for select to authenticated using \\(public\\.wtos_can_read_company\\(company_id\\)\\);`),
    `${table} must inherit existing company-read authorization`,
  );
}

assert.match(
  sql,
  /revoke all on table public\.company_locations, public\.automation_rules, public\.automation_events, public\.automation_executions, public\.automation_attempts, public\.automation_audit_events from public, anon, authenticated;/,
);
assert.match(
  sql,
  /grant select on table public\.company_locations, public\.automation_rules, public\.automation_events, public\.automation_executions, public\.automation_attempts, public\.automation_audit_events to authenticated;/,
);
assert.match(
  sql,
  /revoke insert, update, delete on table public\.ai_audit_events from public, anon, authenticated;/,
  "authenticated users must not forge trusted AI action previews",
);

assert.match(sql, /if event_company_location_id is not null and not exists \( select 1 from public\.company_locations as location where location\.id = event_company_location_id and location\.company_id = event_company_id and location\.is_active \) then/);
assert.match(sql, /rule\.company_location_id is null or rule\.company_location_id = event_company_location_id/);
assert.match(sql, /execution\.company_id = new\.company_id and execution\.company_location_id is not distinct from new\.company_location_id/);
assert.match(sql, /target_company_id is distinct from proposed_action\.company_id/);

assert.match(
  sql,
  /when 'weathertech-phoenix' then 'weathertech_phoenix' when 'weathertech-tucson' then 'weathertech_tucson' when 'ihc-primary' then 'ihc' else null/,
  "only exact existing communication routing keys may infer a branch",
);
assert.match(sql, /route\.id = new\.business_phone_number_id and route\.company_id = new\.company_id and route\.routing_status = 'active'/);
assert.match(sql, /new\.routing_status <> 'matched'/);
assert.doesNotMatch(
  sql,
  /(?:verizon|at&t|\batt\b|carrier_forward|forward_to)/,
  "the automation bridge must not infer unpersisted carrier traffic",
);

assert.match(sql, /where intake\.linked_lead_id = new\.id and intake\.company_id = new\.company_id and intake\.status = 'lead_created'/);
assert.match(sql, /if new\.company_id is null or new\.branch_key = 'unassigned' then new\.company_location_id := null/);
assert.match(sql, /raise exception 'lead intake branch is not valid for the selected company'/);

assert.match(sql, /if not public\.wtos_can_manage_settings\(selected_rule\.company_id\) then/);
assert.match(sql, /if not public\.wtos_can_manage_settings\(selected_execution\.company_id\) then/);
assert.match(sql, /membership\.company_id = proposed_action\.company_id and membership\.role in \('owner', 'admin', 'office'\)/);
assert.doesNotMatch(sql, /membership\.role in \([^)]*'viewer'[^)]*\).*approve/);

assert.match(sql, /create table public\.mighty_apes_campaign_routes \(/);
assert.match(sql, /constraint mighty_apes_campaign_routes_location_fkey foreign key \(company_location_id, company_id\) references public\.company_locations\(id, company_id\) on delete restrict/);
assert.match(sql, /'00lza1supkx0yunsdthglg'.*'weathertech_roofing', 'weathertech_phoenix', 'weathertech-roofing-phoenix'.*'roofing', true/);
assert.equal(
  [...sql.matchAll(/00lza1supkx0yunsdthglg/g)].length,
  1,
  "only the one verified Phoenix campaign ID may be seeded",
);
const routedMightyApes = sql.slice(
  sql.lastIndexOf("create or replace function public.wtos_ingest_mighty_apes_yelp"),
  sql.indexOf("revoke all on function public.wtos_ingest_mighty_apes_yelp", sql.lastIndexOf("create or replace function public.wtos_ingest_mighty_apes_yelp")),
);
assert.match(routedMightyApes, /from public\.mighty_apes_campaign_routes as route where route\.campaign_yelp_id = request_campaign_id and route\.enabled/);
assert.doesNotMatch(routedMightyApes, /request_campaign_id <> '00lza1supkx0yunsdthglg'/);
assert.match(routedMightyApes, /location\.location_key = target_route\.branch_key and location\.is_active/);
assert.match(routedMightyApes, /target_route\.company_location_id.*target_route\.company_key.*target_route\.branch_key.*target_route\.assigned_queue/);
assert.match(routedMightyApes, /if request_event = 'lead\.test' then insert into public\.mighty_apes_yelp_webhook_events/);
assert.match(sql, /revoke all on function public\.wtos_ingest_mighty_apes_yelp\(jsonb\) from public, anon, authenticated, service_role; grant execute on function public\.wtos_ingest_mighty_apes_yelp\(jsonb\) to service_role;/);

assert.match(
  mightyLegacyCorrectionSql,
  /create or replace function public\.wtos_propagate_lead_intake_location_v1\(\)/,
);
assert.match(
  mightyLegacyCorrectionSql,
  /service_needed = coalesce\(\$2, service_needed\)/,
  "legacy lead service must be corrected from the authorized intake route",
);
assert.match(
  mightyLegacyCorrectionSql,
  /service_type = coalesce\(\$2, service_type\)/,
  "modern lead service must remain synchronized with the authorized intake route",
);
assert.match(
  mightyLegacyCorrectionSql,
  /using new\.company_location_id, new\.requested_service, new\.linked_lead_id, new\.company_id/,
  "the propagation update must bind only exact intake routing values",
);
assert.match(
  mightyLegacyCorrectionSql,
  /after insert or update of company_id, branch_key, linked_lead_id, requested_service on public\.lead_intake_records/,
);
assert.match(
  mightyLegacyCorrectionSql,
  /revoke execute on function public\.wtos_propagate_lead_intake_location_v1\(\) from public, anon, authenticated, service_role/,
  "lead routing propagation must remain trigger-only",
);
assert.doesNotMatch(
  mightyLegacyCorrectionSql,
  /\b(?:insert into public\.leads|delete from|truncate|send_email|send_sms|place_call|provider_write)\b/,
  "the corrective migration must remain a bounded internal route propagation",
);

for (const lintCorrectionSql of [
  legacyLeadLintCorrectionSql,
  canonicalLeadLintCorrectionSql,
]) {
  assert.match(
    lintCorrectionSql,
    /pg_catalog\.pg_get_functiondef\(candidate\.oid\)/,
    "lint corrections must patch the existing reviewed function definitions",
  );
  assert.match(
    lintCorrectionSql,
    /candidate\.proacl is not distinct from original_acl.*candidate\.proowner = original_owner.*candidate\.prosecdef = original_security_definer.*candidate\.proconfig is not distinct from original_config/,
    "lint corrections must preserve privileges, ownership, security mode, and function configuration",
  );
  assert.doesNotMatch(
    lintCorrectionSql,
    /\b(?:delete from|truncate|send_email|send_sms|place_call|provider_write)\b/,
    "lint corrections must not mutate CRM data or invoke providers",
  );
}

for (const lintFunction of [
  "public.wtos_ingest_mighty_apes_yelp(jsonb)",
  "public.wtos_create_accountable_lead_core(jsonb,boolean)",
]) {
  assert.ok(
    legacyLeadLintCorrectionSql.includes(`'${lintFunction}'`),
    `${lintFunction} must receive the legacy identifier lint correction`,
  );
  assert.ok(
    canonicalLeadLintCorrectionSql.includes(`'${lintFunction}'`),
    `${lintFunction} must receive the canonical identifier lint correction`,
  );
}
assert.match(legacyLeadLintCorrectionSql, /pg_catalog\.concat\(''customer'', ''_name''\)/);
assert.match(canonicalLeadLintCorrectionSql, /pg_catalog\.concat\(''contact'', ''_name''\)/);
assert.match(
  canonicalLeadLintCorrectionSql,
  /using target_company\.id, target_route\.company_location_id, request_lead_name, request_lead_phone, lead_property_address, request_zip_code, target_route\.service_type, lead_notes/,
  "the Mighty Apes canonical dynamic insert must preserve exact company, location, and service routing",
);

console.log("Automation company/location isolation: PASS");
