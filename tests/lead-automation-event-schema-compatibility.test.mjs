import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260902102714_lead_automation_event_legacy_schema_compatibility.sql",
    import.meta.url,
  ),
  "utf8",
);
const runtimeProbe = await readFile(
  new URL("./lead-automation-event-schema-compatibility.runtime.sql", import.meta.url),
  "utf8",
);
const sql = migration.replace(/\s+/g, " ").trim().toLowerCase();
const runtimeSql = runtimeProbe.replace(/\s+/g, " ").trim().toLowerCase();

assert.ok(sql.startsWith("begin;"), "compatibility migration must be transactional");
assert.ok(sql.endsWith("commit;"), "compatibility migration must commit atomically");
assert.match(
  sql,
  /create or replace function public\.wtos_emit_lead_automation_event_v1\(\)/,
);
assert.match(sql, /security definer set search_path = ''/);
assert.match(sql, /new_row := pg_catalog\.to_jsonb\(new\)/);
assert.match(sql, /when tg_op = 'update' then pg_catalog\.to_jsonb\(old\)/);
assert.doesNotMatch(
  sql,
  /\b(?:new|old)\.[a-z_]/,
  "the replacement must not statically bind any trigger-row field",
);

for (const optionalField of [
  "company_location_id",
  "source",
  "lead_source",
  "next_follow_up",
  "priority",
  "updated_at",
  "created_at",
  "customer_id",
  "property_id",
]) {
  assert.ok(
    sql.includes(`new_row -> '${optionalField}'`) ||
      sql.includes(`new_row ->> '${optionalField}'`),
    `missing JSON-safe ${optionalField} access`,
  );
}

assert.match(
  sql,
  /'source', coalesce\( new_row -> 'source', new_row -> 'lead_source' \)/,
  "canonical source must fall back to legacy lead_source",
);
assert.match(
  sql,
  /pg_catalog\.to_jsonb\(persisted_lead\) ->> 'company_location_id'/,
  "persisted location resolution must not bind an optional lead column",
);
assert.match(
  sql,
  /persisted_lead\.id = lead_id and persisted_lead\.company_id = event_company_id/,
  "persisted location lookup must retain exact company and lead scope",
);
assert.match(
  sql,
  /intake\.linked_lead_id = lead_id and intake\.company_id = event_company_id/,
  "intake fallback must retain exact company and lead scope",
);
assert.doesNotMatch(
  sql,
  /weathertech_phoenix|weathertech_tucson|ihc|postal_code|property_address|\bcity\b/,
  "lead trigger compatibility must not infer a location from free text or branch constants",
);

for (const eventContract of [
  "'lead.created'",
  "'lead.updated'",
  "'website.lead.created'",
  "'yelp.lead.created'",
  "'crm:' || event_type || ':' || lead_id::text || ':' || payload_fingerprint",
  "'intake:' || intake_id::text || ':' || intake_provider || '.lead.created'",
]) {
  assert.ok(sql.includes(eventContract), `missing event contract ${eventContract}`);
}
assert.match(sql, /extensions\.digest\(event_payload::text, 'sha256'\)/);
assert.match(
  sql,
  /revoke execute on function public\.wtos_emit_lead_automation_event_v1\(\) from public, anon, authenticated;/,
);
assert.match(
  sql,
  /grant execute on function public\.wtos_emit_lead_automation_event_v1\(\) to service_role;/,
);
assert.doesNotMatch(
  sql,
  /\b(?:insert into|update|delete from|truncate) public\.(?:leads|customers|jobs|estimates|invoices)\b/,
  "forward fix must replace only code and never mutate CRM data",
);
assert.doesNotMatch(sql, /send_email|send_sms|place_call|charge_payment|provider_write/);

assert.ok(runtimeSql.startsWith("begin;"), "runtime probe must be transactional");
assert.ok(runtimeSql.endsWith("rollback;"), "runtime probe must always roll back");
assert.match(runtimeSql, /create temporary table wtos_canonical_leads/);
assert.match(runtimeSql, /contact_name text not null/);
assert.match(runtimeSql, /source text not null/);
assert.match(runtimeSql, /create temporary table wtos_legacy_leads/);
assert.match(runtimeSql, /customer_name text not null/);
assert.match(runtimeSql, /lead_source text not null/);
const legacyTable = runtimeSql.slice(
  runtimeSql.indexOf("create temporary table wtos_legacy_leads"),
  runtimeSql.indexOf(") on commit drop;", runtimeSql.indexOf("create temporary table wtos_legacy_leads")),
);
for (const absentLegacyField of ["company_location_id", "customer_id", "property_id", "source"])
  assert.ok(
    !new RegExp(`\\b${absentLegacyField}\\b`).test(legacyTable),
    `legacy runtime shape must omit ${absentLegacyField}`,
  );
assert.match(runtimeSql, /non-semantic lead updates emitted automation events/);
assert.match(runtimeSql, /semantic lead updates did not emit exactly one event per schema/);
assert.doesNotMatch(runtimeSql, /;\s*commit\s*;/);

console.log(
  "Lead automation event canonical/legacy schema compatibility contracts passed.",
);
