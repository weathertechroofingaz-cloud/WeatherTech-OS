import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const migrationName =
  "20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql";
const migration = await readFile(
  new URL(`../supabase/migrations/${migrationName}`, import.meta.url),
  "utf8",
);
const runtimeProbe = await readFile(
  new URL(
    "./deferred-invariant-trigger-ddl-compatibility.runtime.sql",
    import.meta.url,
  ),
  "utf8",
);
const foundation = await readFile(
  new URL(
    "../supabase/migrations/20260902024804_automation_engine_foundation.sql",
    import.meta.url,
  ),
);
const migrationFiles = (await readdir(
  new URL("../supabase/migrations/", import.meta.url),
))
  .filter((filename) => filename.endsWith(".sql"))
  .sort();

const sql = migration.replace(/\s+/g, " ").trim().toLowerCase();
const runtimeSql = runtimeProbe.replace(/\s+/g, " ").trim().toLowerCase();

assert.equal(
  createHash("sha256").update(foundation).digest("hex"),
  "bfddf783fe462e7c1258c3a3df90f9302c45c7c6830745308097de2c09d8a868",
  "the already-applied automation foundation migration must remain byte-for-byte frozen",
);
assert.ok(
  migrationFiles.indexOf("20260824044610_native_proposal_esign_sold_job_gate.sql") <
    migrationFiles.indexOf(migrationName),
  "compatibility migration must follow the current Production migration",
);
assert.equal(
  migrationFiles.indexOf(migrationName) + 1,
  migrationFiles.indexOf("20260902024804_automation_engine_foundation.sql"),
  "compatibility migration must run immediately before the automation foundation",
);

assert.ok(sql.startsWith("begin;"), "compatibility migration must be transactional");
assert.ok(sql.endsWith("commit;"), "compatibility migration must commit atomically");
assert.match(sql, /set local lock_timeout = '5s'/);
assert.match(sql, /set local statement_timeout = '30s'/);
assert.match(
  sql,
  /lock table public\.leads, public\.office_tasks in access exclusive mode/,
);

for (const catalogGuard of [
  "trigger.tgisinternal",
  "trigger.tgfoid <> expected.function_id",
  "trigger.tgtype <> 21",
  "trigger.tgenabled <> 'o'",
  "trigger.tgparentid <> 0",
  "trigger.tgconstrrelid <> 0",
  "trigger.tgconstrindid <> 0",
  "not trigger.tgdeferrable",
  "not trigger.tginitdeferred",
  "trigger.tgnargs <> 0",
  "trigger.tgqual is not null",
  "obj_description(trigger.oid, 'pg_trigger') is not null",
  "constraint_record.connamespace <> 'public'::pg_catalog.regnamespace",
  "constraint_record.contype <> 't'",
  "not constraint_record.condeferrable",
  "not constraint_record.condeferred",
  "not constraint_record.convalidated",
  "not constraint_record.connoinherit",
  "not constraint_record.conislocal",
  "constraint_record.coninhcount <> 0",
  "constraint_record.conparentid <> 0",
  "attribute.attname::text",
  "'pg_constraint'",
]) {
  assert.ok(sql.includes(catalogGuard), `missing catalog guard: ${catalogGuard}`);
}

for (const triggerContract of [
  /create constraint trigger leads_enforce_crm_identity_property_customer after insert or update of company_id, customer_id, property_id on public\.leads deferrable initially deferred for each row execute function public\.wtos_enforce_crm_identity_property_customer_invariant\(\)/,
  /create constraint trigger office_tasks_enforce_crm_identity_property_customer after insert or update of company_id, customer_id, property_id on public\.office_tasks deferrable initially deferred for each row execute function public\.wtos_enforce_crm_identity_property_customer_invariant\(\)/,
  /create constraint trigger leads_enforce_accountable_funnel_linkage after insert or update of id, company_id, status, pipeline_stage on public\.leads deferrable initially deferred for each row execute function public\.wtos_enforce_accountable_lead_funnel_linkage\(\)/,
]) {
  assert.match(sql, triggerContract);
}

assert.equal(
  (sql.match(/drop trigger /g) ?? []).length,
  3,
  "only the three reviewed constraint triggers may be replaced",
);
assert.equal(
  (sql.match(/create constraint trigger /g) ?? []).length,
  3,
  "only the three reviewed constraint triggers may be created",
);
assert.doesNotMatch(sql, /\b(?:disable|enable) trigger\b/);
assert.doesNotMatch(sql, /\bset constraints\b/);
assert.doesNotMatch(
  sql,
  /\b(?:insert into|update|delete from|truncate)\s+public\./,
  "compatibility migration must not mutate business data",
);
assert.doesNotMatch(sql, /twilio|gohighlevel|openai|stripe|send_sms|send_email|place_call/);

assert.ok(runtimeSql.startsWith("begin;"), "runtime probe must be transactional");
assert.ok(runtimeSql.endsWith("rollback;"), "runtime probe must always roll back");
assert.match(runtimeSql, /from pg_catalog\.pg_trigger/);
assert.match(runtimeSql, /join pg_catalog\.pg_constraint/);
assert.match(runtimeSql, /from pg_catalog\.unnest\(trigger\.tgattr::smallint\[\]\)/);
assert.match(runtimeSql, /attribute\.attname::text/);
assert.match(
  runtimeSql,
  /array\['company_id', 'id', 'pipeline_stage', 'status'\]::text\[\]/,
);
assert.match(runtimeSql, /leads_enforce_accountable_outcome_insert/);
assert.match(runtimeSql, /create temporary table wtos_deferred_lead_scope_probe/);
assert.match(
  runtimeSql,
  /create temporary table wtos_deferred_office_task_scope_probe/,
);
assert.match(
  runtimeSql,
  /update wtos_deferred_lead_scope_probe set company_location_id = pg_catalog\.gen_random_uuid\(\); alter table wtos_deferred_lead_scope_probe add column location_only_ddl_succeeded boolean/,
);
assert.match(
  runtimeSql,
  /update wtos_deferred_office_task_scope_probe set company_location_id = pg_catalog\.gen_random_uuid\(\); alter table wtos_deferred_office_task_scope_probe add column location_only_ddl_succeeded boolean/,
);
assert.equal(
  (runtimeSql.match(/when sqlstate '55006' then null/g) ?? []).length,
  3,
  "runtime probe must prove all three relevant updates still queue deferred events",
);
assert.equal(
  (runtimeSql.match(/set constraints all immediate/g) ?? []).length,
  3,
  "runtime probe must drain each deliberately queued test event",
);
assert.doesNotMatch(
  runtimeSql,
  /\b(?:insert into|update|delete from|truncate)\s+public\./,
  "runtime catalog probe must not mutate business data",
);

console.log("Deferred invariant trigger DDL compatibility contract: PASS");
