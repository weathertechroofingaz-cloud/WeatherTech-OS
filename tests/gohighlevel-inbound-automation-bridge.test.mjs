import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20260902061135_gohighlevel_inbound_automation_bridge.sql",
    import.meta.url,
  ),
  "utf8",
);
const sql = migration.replace(/\s+/g, " ").trim().toLowerCase();

function functionBody(name, nextMarker) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const end = sql.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `missing ${name}`);
  assert.notEqual(end, -1, `missing boundary after ${name}`);
  return sql.slice(start, end);
}

const inboundSms = functionBody(
  "wtos_emit_inbound_communication_event_v1()",
  "create or replace function public.wtos_emit_missed_call_event_v1()",
);
const missedCall = functionBody(
  "wtos_emit_missed_call_event_v1()",
  "revoke execute on function public.wtos_emit_inbound_communication_event_v1()",
);

assert.ok(sql.startsWith("-- forward-only bridge"));
assert.match(sql, /begin; set local lock_timeout = '5s'; set local statement_timeout = '60s';/);
assert.ok(sql.endsWith("commit;"));
assert.equal(
  [...sql.matchAll(/create or replace function public\./g)].length,
  2,
  "the forward migration may replace only the two communication trigger functions",
);
assert.doesNotMatch(
  migration,
  /^\s*(?:(?:create|alter|drop)\s+(?:table|trigger)|(?:insert into|update|delete from|truncate)\b)/gim,
  "the bridge must not change tables, triggers, or persisted data",
);

for (const [label, body] of [
  ["inbound SMS", inboundSms],
  ["missed call", missedCall],
]) {
  const goHighLevelArm = body.slice(
    body.indexOf("if new.provider = 'gohighlevel' then"),
    body.indexOf("elsif new.provider", body.indexOf("if new.provider = 'gohighlevel' then")),
  );
  assert.match(goHighLevelArm, /new\.company_id is null/);
  assert.match(goHighLevelArm, /new\.direction <> 'inbound'/);
  assert.match(goHighLevelArm, /new\.routing_status <> 'matched'/);
  assert.match(goHighLevelArm, /new\.integration_connection_id is null/);
  assert.match(
    goHighLevelArm,
    /connection\.id = new\.integration_connection_id and connection\.company_id = new\.company_id and connection\.provider = 'gohighlevel' and connection\.status = 'connected'/,
    `${label} must require one exact connected same-company GHL binding`,
  );
  assert.doesNotMatch(
    goHighLevelArm,
    /business_phone_number_id|routing_key|business_location|phone_number_e164/,
    `${label} GHL eligibility must not depend on a phone route or inferred text`,
  );

  assert.match(
    body,
    /select lead\.company_location_id into location_id from public\.leads as lead where lead\.id = new\.lead_id and lead\.company_id = new\.company_id;/,
    `${label} location must be derived only from an exact same-company linked lead`,
  );

  const payloadStart = body.indexOf("safe_payload :=");
  const payloadEnd = body.indexOf("payload_fingerprint :=", payloadStart);
  const payload = body.slice(payloadStart, payloadEnd);
  assert.doesNotMatch(
    payload,
    /body|subject|message_preview|from_phone|to_phone|business_phone'|customer_phone|provider_payload|payload_summary|response_summary/,
    `${label} automation payload must remain free of communication content and phone data`,
  );
}

assert.match(inboundSms, /new\.event_type <> 'sms_inbound'/);
assert.match(
  inboundSms,
  /elsif new\.provider in \('twilio', 'twilio_sms'\) then/,
  "both existing Twilio SMS provider forms must retain their arm",
);
assert.match(
  inboundSms,
  /new\.business_phone_number_id is null or not exists \( select 1 from public\.business_phone_numbers as route where route\.id = new\.business_phone_number_id and route\.company_id = new\.company_id and route\.routing_status = 'active' \)/,
  "Twilio SMS must retain the active exact-company business-phone check",
);
assert.match(
  inboundSms,
  /if location_id is null and new\.provider in \('twilio', 'twilio_sms'\) then select case route\.routing_key when 'weathertech-phoenix' then 'weathertech_phoenix' when 'weathertech-tucson' then 'weathertech_tucson' when 'ihc-primary' then 'ihc' else null end/,
  "only Twilio may retain the existing exact routing-key location fallback",
);

assert.match(missedCall, /new\.call_status <> 'missed'/);
assert.match(missedCall, /\(tg_op = 'update' and old\.call_status = 'missed'\)/);
assert.match(missedCall, /elsif new\.provider = 'twilio' then/);
assert.match(
  missedCall,
  /new\.business_phone_number_id is null or \(tg_op = 'update' and old\.call_status = 'missed'\) or not exists \( select 1 from public\.business_phone_numbers as route where route\.id = new\.business_phone_number_id and route\.company_id = new\.company_id and route\.routing_status = 'active' \)/,
  "Twilio missed calls must retain the active exact-company business-phone check and replay guard",
);
assert.match(
  missedCall,
  /if location_id is null and new\.provider = 'twilio' then select case route\.routing_key when 'weathertech-phoenix' then 'weathertech_phoenix' when 'weathertech-tucson' then 'weathertech_tucson' when 'ihc-primary' then 'ihc' else null end/,
  "only Twilio calls may retain the existing exact routing-key location fallback",
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
    `${functionName} must remain trigger-only for browser roles`,
  );
}
assert.doesNotMatch(sql, /grant execute/);
assert.doesNotMatch(
  sql,
  /(?:verizon|at&t|\batt\b|carrier|forward_to|free.?text|property_address|business_location)/,
  "GHL automation location must not infer from carrier, phone, or free-form fields",
);

console.log("GoHighLevel inbound automation bridge: PASS");
