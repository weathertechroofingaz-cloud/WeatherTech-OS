import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createBrowserCompatibleRegressionRunId } from "../scripts/twilio-automation-cleanup.mjs";

const cwd = process.cwd();
const cleanupPath = join(cwd, "scripts", "twilio-automation-cleanup.mjs");
const cleanupSource = readFileSync(cleanupPath, "utf8");
const voiceSource = readFileSync(
  join(cwd, "scripts", "twilio-voice-inbound-regression.mjs"),
  "utf8",
);
const inboundSource = readFileSync(
  join(cwd, "scripts", "twilio-inbound-regression.mjs"),
  "utf8",
);
const migration = readFileSync(
  join(
    cwd,
    "supabase",
    "migrations",
    "20260902065509_legacy_twilio_synthetic_automation_orphan_cleanup.sql",
  ),
  "utf8",
);
const browserVoiceCorrection = readFileSync(
  join(
    cwd,
    "supabase",
    "migrations",
    "20260902071651_legacy_twilio_browser_voice_orphan_cleanup.sql",
  ),
  "utf8",
);

assert.equal(
  createBrowserCompatibleRegressionRunId({
    now: 1_720_000_000_000,
    randomSuffix: 7,
  }),
  "17200000000000007",
);
assert.throws(
  () => createBrowserCompatibleRegressionRunId({ now: 1, randomSuffix: 7 }),
  /millisecond timestamp plus a four-digit random suffix/i,
);

for (const contract of [
  'const REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg"',
  'const REGRESSION_OWNER_ID = "2150c43d-c5b6-4560-9ecb-142561ba1dc2"',
  'const REGRESSION_OWNER_MARKER = "weathertech-os-regression-owner-v1"',
  'const SOURCE_PREFIX = "TEST WTOS REGRESSION"',
  'const PROVIDER_PREFIX = "TEST WTOS MIGHTY APES REGRESSION:"',
  'for (const sourceTable of ["call_records", "communication_provider_events"])',
  '.eq("source_table", sourceTable)',
  '.in("source_id", capturedIds)',
  ".update({ correlation_id: correlationMarker })",
  'service.from("leads").select("id").like("contact_name", markerPattern)',
  'service.from("customers").select("id").like("display_name", markerPattern)',
  'service.from("office_tasks").select("id").in("lead_id", leadIds)',
  '.in("causation_event_id", frontier)',
  'service.rpc(\n    "wtos_cleanup_synthetic_automation_fixture"',
  'markerFamily: "browser"',
  "receipt?.databaseResidueCount === 0",
]) {
  assert.ok(cleanupSource.includes(contract), `Twilio cleanup must retain ${contract}`);
}
assert.doesNotMatch(cleanupSource, /gahfcgyjtfwwmsterhzu/);
assert.doesNotMatch(cleanupSource, /\.delete\s*\(/);
assert.doesNotMatch(cleanupSource, /api\.twilio\.com|openai\.com|anthropic\.com/i);

for (const [label, runner] of [
  ["Voice", voiceSource],
  ["Inbound SMS", inboundSource],
]) {
  const cleanupIndex = runner.lastIndexOf(
    "cleanupTwilioSyntheticAutomationLedger({",
  );
  const firstSourceDeleteIndex = runner.lastIndexOf(
    'deleteExactIds(\n          client,\n          "communication_provider_events"',
  );
  assert.ok(
    runner.includes("const runId = createBrowserCompatibleRegressionRunId();") &&
      runner.includes("const sourceMarker = `TEST WTOS REGRESSION ${runId}`") &&
      cleanupIndex >= 0 &&
      firstSourceDeleteIndex >= 0 &&
      cleanupIndex < firstSourceDeleteIndex,
    `${label} must clean its exact automation graph before deleting ordinary sources`,
  );
  assert.ok(
    runner.includes("automationCleanup?.invoked") === false,
    `${label} runner must return the cleanup receipt without weakening it in runner code`,
  );
}

for (const contract of [
  "begin;",
  "commit;",
  "security definer",
  "set search_path = ''",
  "trusted_claims ->> 'iss' is distinct from 'supabase'",
  "trusted_claims ->> 'role' is distinct from 'service_role'",
  "trusted_claims ->> 'ref' is distinct from 'hygtnhmmaoboduqghhwg'",
  "'2150c43d-c5b6-4560-9ecb-142561ba1dc2'::uuid",
  "'weathertech-os-regression@example.test'",
  "weathertech-os-regression-owner-v1",
  "request_marker_family is null",
  "request_run_id is null",
  "request_marker_family not in ('twilio_voice', 'twilio_inbound')",
  "TEST WTOS REGRESSION TWILIO VOICE ",
  "TEST WTOS REGRESSION TWILIO INBOUND ",
  "event.causation_event_id is null",
  "event.event_type = 'lead.created'",
  "event.source_table = 'leads'",
  "event.payload ->> 'lead_id' = event.source_id",
  "event.payload ->> 'status' = 'new'",
  "event.payload ->> 'priority' = 'normal'",
  "actual_event_ids is distinct from actual_root_event_ids",
  "actual_event_ids is distinct from request_event_ids",
  "from public.leads as source_lead",
  "where source_lead.id = root_event.source_id::uuid",
  "Legacy Twilio orphan cleanup requires exact absent lead sources",
  "Legacy Twilio orphan cleanup refuses a graph with a remaining engine-created task.",
  "wtos.synthetic_automation_cleanup_operation",
  "'databaseResidueCount', final_residue_count",
  "revoke all on function public.wtos_cleanup_legacy_twilio_automation_orphan(jsonb)",
  "from public, anon, authenticated, service_role;",
  "grant execute on function public.wtos_cleanup_legacy_twilio_automation_orphan(jsonb)",
  "to service_role;",
]) {
  assert.ok(migration.includes(contract), `Orphan cleanup migration must retain ${contract}`);
}

const auditDelete = migration.indexOf("delete from public.automation_audit_events");
const attemptDelete = migration.indexOf("delete from public.automation_attempts");
const executionDelete = migration.indexOf("delete from public.automation_executions");
const eventDelete = migration.indexOf("delete from public.automation_events");
assert.ok(
  auditDelete >= 0 &&
    auditDelete < attemptDelete &&
    attemptDelete < executionDelete &&
    executionDelete < eventDelete,
  "Orphan cleanup must preserve child-first immutable ledger deletion order",
);
assert.doesNotMatch(migration, /disable trigger|drop trigger/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.leads/i);

for (const contract of [
  "request_marker_family = 'twilio_voice_browser'",
  "request_run_id !~ '^[0-9]{17}$'",
  "'TEST WTOS REGRESSION ' || request_run_id || ' TWILIO VOICE'",
  "actual_event_ids is distinct from actual_root_event_ids",
  "where source_lead.id = root_event.source_id::uuid",
  "trusted_claims ->> 'ref' is distinct from 'hygtnhmmaoboduqghhwg'",
  "grant execute on function public.wtos_cleanup_legacy_twilio_automation_orphan(jsonb)",
  "to service_role;",
]) {
  assert.ok(
    browserVoiceCorrection.includes(contract),
    `Browser Voice orphan correction must retain ${contract}`,
  );
}
assert.equal(
  browserVoiceCorrection.match(
    /create or replace function public\.wtos_cleanup_legacy_twilio_automation_orphan/g,
  )?.length,
  1,
);
assert.doesNotMatch(browserVoiceCorrection, /twilio_inbound_browser/);
assert.doesNotMatch(browserVoiceCorrection, /disable trigger|drop trigger/i);
assert.doesNotMatch(browserVoiceCorrection, /delete\s+from\s+public\.leads/i);

console.log("Twilio automation cleanup static contract: PASS");
