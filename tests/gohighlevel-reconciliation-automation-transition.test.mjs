import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260902134526_gohighlevel_reconciliation_automation_transition_fix.sql",
    import.meta.url,
  ),
  "utf8",
);
const sql = migration.replace(/\s+/g, " ").trim().toLowerCase();

function between(startMarker, endMarker) {
  const start = sql.indexOf(startMarker);
  const end = sql.indexOf(endMarker, start);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing boundary ${endMarker}`);
  return sql.slice(start, end);
}

const inboundSms = between(
  "create or replace function public.wtos_emit_inbound_communication_event_v1()",
  "create or replace function public.wtos_emit_missed_call_event_v1()",
);
const missedCall = between(
  "create or replace function public.wtos_emit_missed_call_event_v1()",
  "drop trigger if exists communication_provider_events_emit_inbound_automation",
);
const smsTrigger = between(
  "create trigger communication_provider_events_emit_inbound_automation",
  "drop trigger if exists call_records_emit_missed_automation",
);
const callTrigger = between(
  "create trigger call_records_emit_missed_automation",
  "revoke execute on function public.wtos_emit_inbound_communication_event_v1()",
);

assert.ok(sql.startsWith("-- forward-only reconciliation transition fix"));
assert.match(sql, /begin; set local lock_timeout = '5s'; set local statement_timeout = '60s';/);
assert.ok(sql.endsWith("commit;"));
assert.equal(
  [...sql.matchAll(/create or replace function public\./g)].length,
  2,
  "the correction must replace exactly two trigger functions",
);
assert.equal(
  [...sql.matchAll(/create trigger /g)].length,
  2,
  "the correction must recreate exactly the two source triggers",
);
assert.doesNotMatch(
  migration,
  /^\s*(?:(?:create|alter|drop)\s+table|(?:insert into|update|delete from|truncate)\b)/gim,
  "the correction must not change tables or persisted business data",
);

for (const [label, body] of [
  ["inbound SMS", inboundSms],
  ["missed call", missedCall],
]) {
  assert.match(body, /returns trigger language plpgsql security definer set search_path = ''/);
  assert.match(
    body,
    /connection\.id = new\.integration_connection_id and connection\.company_id = new\.company_id and connection\.provider = 'gohighlevel' and connection\.status = 'connected'/,
    `${label} must retain the exact connected same-company GHL boundary`,
  );
  assert.match(
    body,
    /route\.id = new\.business_phone_number_id and route\.company_id = new\.company_id and route\.routing_status = 'active'/,
    `${label} must retain the exact active same-company Twilio route boundary`,
  );
  assert.match(
    body,
    /select lead\.company_location_id into location_id from public\.leads as lead where lead\.id = new\.lead_id and lead\.company_id = new\.company_id;/,
    `${label} location must remain bound to an exact same-company lead`,
  );

  const payloadStart = body.indexOf("safe_payload :=");
  const payloadEnd = body.indexOf("payload_fingerprint :=", payloadStart);
  const payload = body.slice(payloadStart, payloadEnd);
  assert.doesNotMatch(
    payload,
    /body|subject|message_preview|from_phone|to_phone|business_phone'|customer_phone|provider_payload|payload_summary|response_summary/,
    `${label} payload must not copy communication content or phone data`,
  );
}

const goHighLevelSmsArm = inboundSms.slice(
  inboundSms.indexOf("if new.provider = 'gohighlevel' then"),
  inboundSms.indexOf("elsif new.provider in ('twilio', 'twilio_sms') then"),
);
assert.match(
  goHighLevelSmsArm,
  /if tg_op = 'update' and old\.provider = 'gohighlevel' and old\.direction = 'inbound' and old\.event_type = 'sms_inbound' and old\.routing_status = 'matched' then return new; end if;/,
  "GHL SMS replay suppression must require the exact previously matched inbound SMS shape",
);
assert.match(goHighLevelSmsArm, /new\.direction <> 'inbound'/);
assert.match(goHighLevelSmsArm, /new\.event_type <> 'sms_inbound'/);
assert.match(goHighLevelSmsArm, /new\.routing_status <> 'matched'/);
assert.match(goHighLevelSmsArm, /new\.integration_connection_id is null/);
assert.match(
  inboundSms,
  /'communication-provider-event:' \|\| new\.id::text/,
  "SMS idempotency must remain stable for the source row across reconciliation replays",
);

assert.match(
  missedCall,
  /if tg_op = 'update' and old\.call_status = 'missed' and old\.routing_status = 'matched' then return new; end if;/,
  "missed-call replay suppression must require OLD to be both missed and matched",
);
assert.equal(
  [...missedCall.matchAll(/old\.call_status = 'missed'/g)].length,
  1,
  "no bare prior-missed guard may suppress needs_review-to-matched reconciliation",
);
assert.match(missedCall, /new\.direction <> 'inbound'/);
assert.match(missedCall, /new\.call_status <> 'missed'/);
assert.match(missedCall, /new\.routing_status <> 'matched'/);
assert.match(missedCall, /new\.integration_connection_id is null/);
assert.match(
  missedCall,
  /'missed-call:' \|\| new\.id::text/,
  "missed-call idempotency must remain stable for the source row across reconciliation replays",
);

for (const [label, trigger, requiredColumns] of [
  [
    "SMS",
    smsTrigger,
    [
      "company_id",
      "integration_connection_id",
      "business_phone_number_id",
      "customer_id",
      "lead_id",
      "job_id",
      "provider",
      "event_type",
      "direction",
      "routing_status",
    ],
  ],
  [
    "missed-call",
    callTrigger,
    [
      "company_id",
      "integration_connection_id",
      "business_phone_number_id",
      "customer_id",
      "lead_id",
      "job_id",
      "provider",
      "direction",
      "call_status",
      "routing_status",
    ],
  ],
]) {
  assert.match(trigger, /after insert or update of/);
  for (const column of requiredColumns) {
    assert.ok(trigger.includes(column), `${label} trigger must observe ${column} reconciliation updates`);
  }
}

assert.match(
  smsTrigger,
  /on public\.communication_provider_events for each row execute function public\.wtos_emit_inbound_communication_event_v1\(\);/,
);
assert.match(
  callTrigger,
  /on public\.call_records for each row execute function public\.wtos_emit_missed_call_event_v1\(\);/,
);

for (const functionName of [
  "wtos_emit_inbound_communication_event_v1",
  "wtos_emit_missed_call_event_v1",
]) {
  assert.match(
    sql,
    new RegExp(
      `revoke execute on function public\\.${functionName}\\(\\) from public, anon, authenticated, service_role;`,
    ),
    `${functionName} must remain trigger-only`,
  );
}
assert.doesNotMatch(sql, /grant execute/);
assert.doesNotMatch(
  sql,
  /(?:verizon|at&t|\batt\b|carrier|forward_to|free.?text|property_address|business_location)/,
  "company/location routing must not infer from carrier, phone, or free-form fields",
);

console.log("GoHighLevel reconciliation automation transition: PASS");
