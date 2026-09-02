import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql",
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
  "-- restore the original all-provider insert triggers",
);
const smsGhlArm = between(
  "if new.provider = 'gohighlevel' then",
  "elsif new.provider in ('twilio', 'twilio_sms') then",
);
const smsTwilioArm = inboundSms.slice(
  inboundSms.indexOf("elsif new.provider in ('twilio', 'twilio_sms') then"),
  inboundSms.indexOf("else return new; end if;", inboundSms.indexOf("elsif new.provider")),
);
const callGhlStart = missedCall.indexOf("if new.provider = 'gohighlevel' then");
const callTwilioStart = missedCall.indexOf("elsif new.provider = 'twilio' then", callGhlStart);
const callGhlArm = missedCall.slice(callGhlStart, callTwilioStart);
const callTwilioArm = missedCall.slice(
  callTwilioStart,
  missedCall.indexOf("else return new; end if;", callTwilioStart),
);

assert.ok(sql.startsWith("-- forward-only recovery"));
assert.match(sql, /begin; set local lock_timeout = '5s'; set local statement_timeout = '60s';/);
assert.ok(sql.endsWith("commit;"));
assert.equal(
  [...sql.matchAll(/create or replace function public\./g)].length,
  2,
  "the recovery must replace exactly the two provider trigger functions",
);
assert.equal(
  [...sql.matchAll(/create trigger /g)].length,
  5,
  "the recovery must split the two INSERT paths and three provider-specific UPDATE paths",
);
assert.doesNotMatch(
  migration,
  /^\s*(?:(?:create|alter|drop)\s+table|(?:insert into|update|delete from|truncate)\b)/gim,
  "the recovery must not change tables or persisted business data",
);

for (const [label, body, stableKey] of [
  ["inbound SMS", inboundSms, "communication-provider-event:"],
  ["missed call", missedCall, "missed-call:"],
]) {
  assert.match(body, /returns trigger language plpgsql security definer set search_path = ''/);
  assert.match(
    body,
    new RegExp(`stable_idempotency_key := '${stableKey}' \\|\\| new\\.id::text`),
    `${label} must use one stable source-row idempotency key`,
  );
  assert.match(
    body,
    /event\.company_id = new\.company_id and event\.idempotency_key = stable_idempotency_key/,
    `${label} replay suppression must be backed by the company-scoped event ledger`,
  );
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

for (const [label, arm] of [
  ["GHL SMS", smsGhlArm],
  ["GHL missed call", callGhlArm],
]) {
  assert.match(arm, /if tg_op = 'update' then select exists \(/);
  assert.match(arm, /if existing_event_recorded then return new; end if;/);
  assert.doesNotMatch(
    arm,
    /old\.(?:provider|direction|event_type|call_status|routing_status|integration_connection_id)/,
    `${label} must not suppress recovery from the OLD row shape or mutable binding`,
  );
  assert.match(arm, /new\.company_id is null/);
  assert.match(arm, /new\.direction <> 'inbound'/);
  assert.match(arm, /new\.routing_status <> 'matched'/);
  assert.match(arm, /new\.integration_connection_id is null/);
}
assert.match(smsGhlArm, /new\.event_type <> 'sms_inbound'/);
assert.match(callGhlArm, /new\.call_status <> 'missed'/);

assert.match(
  smsTwilioArm,
  /if tg_op = 'update' then return new; end if;/,
  "Twilio SMS must remain insert-only even if the function is invoked by a future UPDATE trigger",
);
assert.match(
  callTwilioArm,
  /if tg_op = 'update' and old\.call_status = 'missed' then return new; end if;/,
  "Twilio call UPDATE must emit only on a transition into missed",
);

assert.match(
  sql,
  /create trigger communication_provider_events_emit_inbound_automation after insert on public\.communication_provider_events for each row execute function public\.wtos_emit_inbound_communication_event_v1\(\);/,
  "all-provider SMS INSERT behavior must be retained",
);
assert.match(
  sql,
  /create trigger communication_provider_events_emit_inbound_automation_reconciliation after update of company_id, integration_connection_id, customer_id, lead_id, job_id, provider, event_type, direction, routing_status on public\.communication_provider_events for each row when \(new\.provider = 'gohighlevel'\) execute function public\.wtos_emit_inbound_communication_event_v1\(\);/,
  "only GHL SMS may observe match and binding reconciliation UPDATEs",
);
assert.match(
  sql,
  /create trigger call_records_emit_missed_automation after insert on public\.call_records for each row execute function public\.wtos_emit_missed_call_event_v1\(\);/,
  "all-provider missed-call INSERT behavior must be retained",
);
assert.match(
  sql,
  /create trigger call_records_emit_missed_automation_gohighlevel_reconciliation after update of company_id, integration_connection_id, customer_id, lead_id, job_id, provider, direction, call_status, routing_status on public\.call_records for each row when \(new\.provider = 'gohighlevel'\) execute function public\.wtos_emit_missed_call_event_v1\(\);/,
  "GHL calls must observe status, match, and binding reconciliation UPDATEs",
);
assert.match(
  sql,
  /create trigger call_records_emit_missed_automation_twilio_status_transition after update of call_status on public\.call_records for each row when \(new\.provider = 'twilio'\) execute function public\.wtos_emit_missed_call_event_v1\(\);/,
  "Twilio calls must retain UPDATE OF call_status semantics only",
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

console.log("GoHighLevel reconciliation recovery and Twilio compatibility: PASS");
