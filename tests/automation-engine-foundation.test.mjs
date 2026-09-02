import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260902024804_automation_engine_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const sql = migration.replace(/\s+/g, " ").trim().toLowerCase();

assert.ok(sql.startsWith("begin;"), "automation migration must be transactional");
assert.ok(sql.endsWith("commit;"), "automation migration must commit atomically");
assert.doesNotMatch(
  sql,
  /errcode = '40001'/,
  "expected-version and replay refusals must not use PostgREST-retried SQLSTATE 40001",
);

for (const table of [
  "company_locations",
  "automation_rules",
  "automation_events",
  "automation_executions",
  "automation_attempts",
  "automation_audit_events",
]) {
  assert.match(sql, new RegExp(`create table public\\.${table} \\(`));
}

assert.match(
  sql,
  /action_type text not null check \( action_type in \('create_office_task', 'complete_office_task'\) \)/,
  "only the two bounded internal task actions may be persisted",
);
assert.match(
  sql,
  /if rule_action_type = 'create_office_task' then.*if rule_action_type = 'complete_office_task' then.*return false;/,
  "unknown action configuration must fail closed",
);
assert.doesNotMatch(
  sql,
  /action_type in \([^)]*(?:send_email|send_sms|place_call|charge_payment|provider_write)/,
  "provider and customer side effects must not enter the executable allowlist",
);

for (const eventType of [
  "lead.created",
  "customer.created",
  "inspection.scheduled",
  "estimate.sent",
  "estimate.approved",
  "job.scheduled",
  "job.completed",
  "invoice.paid",
  "task.due",
  "communication.received",
  "missed_call.received",
  "website.lead.created",
  "yelp.lead.created",
]) {
  assert.ok(sql.includes(`'${eventType}'`), `missing semantic event ${eventType}`);
}

assert.match(sql, /constraint automation_events_company_idempotency_key unique \(company_id, idempotency_key\)/);
assert.match(sql, /constraint automation_executions_event_rule_version_key unique \(event_id, rule_id, rule_version\)/);
assert.match(sql, /constraint automation_attempts_execution_number_key unique \(execution_id, attempt_number\)/);
assert.match(sql, /on conflict \(company_id, idempotency_key\) do nothing/);
assert.match(sql, /on conflict \(event_id, rule_id, rule_version\) do nothing/);
assert.match(sql, /on conflict \(company_id, automation_key\) do nothing/);

for (const ledger of ["automation_events", "automation_executions", "automation_attempts", "automation_audit_events"]) {
  assert.match(
    sql,
    new RegExp(`create trigger ${ledger}[^;]* before (?:update or delete|delete) on public\\.${ledger}`),
    `${ledger} must reject direct destructive mutation`,
  );
}
assert.match(
  sql,
  /if tg_op = 'delete' and not exists \( select 1 from public\.companies as company where company\.id = old\.company_id \) then return old;/,
  "immutable ledgers must permit only a genuine parent-company cascade",
);
assert.match(
  sql,
  /automation execution identity and action evidence are immutable/,
);

for (const legacyTrigger of [
  "leads_generate_office_tasks",
  "inspections_generate_office_tasks",
  "estimates_generate_office_tasks",
  "jobs_generate_office_tasks",
]) {
  assert.match(sql, new RegExp(`drop trigger if exists ${legacyTrigger} on public\\.`));
}
for (const centralTrigger of [
  "leads_emit_automation_event",
  "inspections_emit_automation_event",
  "estimates_emit_automation_event",
  "jobs_emit_automation_event",
]) {
  assert.match(sql, new RegExp(`create (?:constraint )?trigger ${centralTrigger}`));
}

assert.match(sql, /create or replace function public\.wtos_emit_due_task_events_v1\(/);
assert.match(sql, /task\.status in \('open', 'snoozed'\)/);
assert.match(sql, /task\.automation_execution_id is null/);
assert.match(sql, /not exists \( select 1 from public\.automation_events as existing_event/);
assert.match(sql, /when task\.status = 'snoozed' then task\.snoozed_until else task\.due_at end as effective_due_at/);
assert.match(sql, /extract\(epoch from case when task\.status = 'snoozed' then task\.snoozed_until else task\.due_at end\)::text/);
assert.match(sql, /'due_at', due_task\.effective_due_at/);
assert.match(sql, /due_task\.effective_due_at, null, 'office-task:due:'/);
assert.match(sql, /due_events_recorded := public\.wtos_emit_due_task_events_v1\(/);
assert.match(sql, /'template:due-task-owner-review'.*'task\.due'.*false, 'manual'/);
assert.match(sql, /'has_scheduled_job'/);
assert.match(sql, /has_scheduled_job := exists \( select 1 from public\.jobs as job where job\.company_id = new\.company_id and job\.estimate_id = new\.id and \(job\.scheduled_start is not null or job\.scheduled_end is not null\) and job\.status not in \('cancelled', 'canceled'\) \)/);
assert.match(sql, /'office:approved-estimate:schedule-handoff'.*'estimate\.approved'/);
assert.ok(sql.includes('"field":"has_scheduled_job","operator":"falsy"'));
assert.ok(sql.includes('"automationkeyprefix":"approved_estimate_schedule:"'));

assert.match(sql, /pg_try_advisory_xact_lock\(hashtextextended\('wtos-automation-worker-v1', 0\)\)/);
assert.match(sql, /for update skip locked limit batch_size/);
assert.match(sql, /if not selected_rule\.enabled or selected_rule\.version <> selected_execution\.rule_version then update public\.automation_executions set status = 'cancelled'/);
assert.match(sql, /status in \('queued', 'awaiting_approval', 'retry_scheduled'\)/);
assert.match(sql, /power\(2, greatest\(current_attempt - 1, 0\)\)::integer/);
assert.match(sql, /'automation action failed safely\.'/);

for (const control of [
  "wtos_set_automation_rule_enabled_v1",
  "wtos_review_automation_execution_v1",
  "wtos_cancel_automation_execution_v1",
  "wtos_retry_automation_execution_v1",
]) {
  const start = sql.indexOf(`create or replace function public.${control}`);
  assert.notEqual(start, -1, `missing ${control}`);
  const body = sql.slice(start, sql.indexOf("$$;", start) + 3);
  assert.match(body, /is distinct from p_expected_version/);
  assert.match(body, /wtos_can_manage_settings/);
}

assert.match(sql, /create or replace function public\.wtos_ai_action_preview_fingerprint_v1\(/);
assert.match(sql, /pg_catalog\.encode\( extensions\.digest\(p_contract_version::text \|\| ':' \|\| p_action_preview::text, 'sha256'\)/);
assert.match(sql, /membership\.role in \('owner', 'admin', 'office'\)/);
assert.match(sql, /p_expected_action_type <> 'create_follow_up_draft'/);
assert.match(sql, /target_table = 'leads'.*elsif target_table = 'estimates'/);
assert.doesNotMatch(sql, /p_expected_action_type = 'draft_email'/);
assert.doesNotMatch(sql, /approved_not_executed/);
assert.match(sql, /if execution_row\.status <> 'succeeded' or task_id is null then raise exception 'approved ai follow-up did not complete its internal task atomically'/);
assert.match(sql, /reservation\.metadata ->> 'reservationcontractversion' = '1'/);
assert.match(sql, /ai action preview is not linked to trusted server reservation evidence/);

assert.match(sql, /create unique index ai_audit_events_request_reservation_key on public\.ai_audit_events \(\(metadata ->> 'requestid'\)\) where event_type = 'request_initiated'/);
assert.match(sql, /drop policy if exists "wtos users insert ai audit events" on public\.ai_audit_events;/);
assert.match(sql, /revoke insert, update, delete on table public\.ai_audit_events from public, anon, authenticated;/);
assert.match(sql, /create or replace function public\.wtos_reserve_ai_request_v1\( p_company_id uuid, p_actor_user_id uuid, p_request_id uuid, p_request jsonb \)/);
const quotaBody = sql.slice(
  sql.indexOf("create or replace function public.wtos_reserve_ai_request_v1"),
  sql.indexOf("create or replace function public.wtos_ai_action_preview_fingerprint_v1"),
);
assert.match(quotaBody, /auth\.role\(\)\) is distinct from 'service_role'/);
assert.match(quotaBody, /jsonb_object_keys\(p_request\).*where request_key not in/);
assert.match(quotaBody, /membership\.company_id = p_company_id and membership\.user_id = p_actor_user_id and membership\.role not in \('customer_portal', 'employee_portal'\)/);
assert.match(quotaBody, /pg_advisory_xact_lock\( hashtextextended\('wtos-ai-quota-v1:' \|\| utc_day_key::text, 0\) \)/);
assert.match(quotaBody, /where audit\.event_type = 'request_initiated' and audit\.created_at >= utc_day_start and audit\.created_at < utc_day_end/);
assert.match(quotaBody, /coalesce\(sum\(audit\.estimated_cost_cents\), 0\)::integer/);
assert.doesNotMatch(quotaBody, /sum\(audit\.estimated_cost_cents\) filter/);
assert.match(quotaBody, /reserved_cost_cents_today \+ estimated_cost_cents > daily_budget_cents/);
assert.match(quotaBody, /max_provider_attempts not between 1 and 3/);
assert.match(quotaBody, /'maxproviderattempts', max_provider_attempts/);
assert.match(quotaBody, /existing_reservation\.metadata ->> 'maxproviderattempts'/);
assert.match(quotaBody, /audit\.company_id = p_company_id and audit\.created_at >= utc_month_start and audit\.created_at < utc_month_end/);
assert.match(quotaBody, /company_reserved_cost_cents_this_month \+ estimated_cost_cents > company_monthly_budget_cents/);
assert.match(quotaBody, /'companymonthlybudgetcents', company_monthly_budget_cents/);
assert.match(quotaBody, /'companyreservedcostcentsthismonth', company_reserved_cost_cents_this_month \+ estimated_cost_cents/);
for (const receiptBinding of [
  "'requestid', p_request_id",
  "'companyid', p_company_id",
  "'actoruserid', p_actor_user_id",
  "'provider', request_provider",
  "'model', request_model",
  "'estimatedcostcents', estimated_cost_cents",
  "'maxproviderattempts', max_provider_attempts",
]) {
  assert.ok(quotaBody.includes(receiptBinding), `quota receipt must bind ${receiptBinding}`);
}
assert.match(quotaBody, /'promptsha256', prompt_sha256, 'promptcharacters', prompt_characters/);
assert.doesNotMatch(quotaBody, /prompttext|rawprompt|promptbody/);
assert.match(sql, /revoke execute on function public\.wtos_reserve_ai_request_v1\(uuid, uuid, uuid, jsonb\) from public, anon, authenticated;/);
assert.match(sql, /grant execute on function public\.wtos_reserve_ai_request_v1\(uuid, uuid, uuid, jsonb\) to service_role;/);
assert.doesNotMatch(sql, /grant execute on function public\.wtos_reserve_ai_request_v1\([^;]+to authenticated/);

for (const hashCall of migration.matchAll(/(?<![.\w])digest\s*\(/gi)) {
  assert.fail(`unqualified digest call at byte ${hashCall.index}`);
}
for (const encodeCall of migration.matchAll(/(?<![.\w])encode\s*\(/gi)) {
  assert.fail(`unqualified encode call at byte ${encodeCall.index}`);
}

for (const privateFunction of [
  "wtos_execute_automation_execution_v1(uuid, timestamptz, text)",
  "wtos_emit_due_task_events_v1(timestamptz, integer, uuid)",
  "wtos_run_automation_worker_core_v1( timestamptz, integer, uuid, text )",
]) {
  assert.ok(
    sql.includes(`revoke execute on function public.${privateFunction} from public, anon, authenticated;`),
    `${privateFunction} must not be Data API callable`,
  );
}
assert.match(
  sql,
  /revoke execute on function public\.wtos_run_automation_worker_v1\(timestamptz, integer\) from public, anon, authenticated;/,
);
assert.match(
  sql,
  /grant execute on function public\.wtos_run_automation_worker_v1\(timestamptz, integer\) to service_role;/,
);
assert.doesNotMatch(
  sql,
  /grant execute on function public\.wtos_run_automation_worker_v1\(timestamptz, integer\) to authenticated;/,
);

const inboundSmsBody = sql.slice(
  sql.indexOf("create or replace function public.wtos_emit_inbound_communication_event_v1"),
  sql.indexOf("create or replace function public.wtos_emit_inbound_email_event_v1"),
);
const inboundEmailBody = sql.slice(
  sql.indexOf("create or replace function public.wtos_emit_inbound_email_event_v1"),
  sql.indexOf("create or replace function public.wtos_emit_missed_call_event_v1"),
);
const missedCallBody = sql.slice(
  sql.indexOf("create or replace function public.wtos_emit_missed_call_event_v1"),
  sql.indexOf("drop trigger if exists leads_generate_office_tasks"),
);
for (const [name, body] of [
  ["inbound SMS", inboundSmsBody],
  ["inbound email", inboundEmailBody],
  ["missed call", missedCallBody],
]) {
  const payloadStart = body.indexOf("safe_payload :=");
  const payloadEnd = body.indexOf("payload_fingerprint :=", payloadStart);
  const payload = body.slice(payloadStart, payloadEnd);
  assert.doesNotMatch(payload, /body|subject|message_preview|from_phone|to_phone|from_email|to_email|provider_payload|payload_summary|response_summary/,
    `${name} automation payload must omit raw communication content and contact data`);
}
assert.match(inboundSmsBody, /extensions\.digest\( coalesce\(nullif\(new\.provider_event_sid/);
assert.match(inboundEmailBody, /extensions\.digest\(new\.gmail_message_id, 'sha256'\)/);
assert.match(missedCallBody, /extensions\.digest\(coalesce\(nullif\(new\.provider_call_sid/);

console.log("Automation engine foundation: PASS");
