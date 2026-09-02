import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TWILIO_INBOUND_REGRESSION_RUN,
  loadTwilioInboundRegressionEnvironment,
  runTwilioInboundRegression,
} from "../scripts/twilio-inbound-regression.mjs";

const cwd = process.cwd();
const runnerPath = join(cwd, "scripts", "twilio-inbound-regression.mjs");
const source = readFileSync(runnerPath, "utf8");
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

assert.throws(
  () => loadTwilioInboundRegressionEnvironment({ cwd, runtimeEnv: {} }),
  /external|environment file|never reads \.env\.local/i,
  "Missing external environment must fail closed",
);
assertionCount += 1;

assert.throws(
  () =>
    loadTwilioInboundRegressionEnvironment({
      cwd,
      runtimeEnv: {
        WTOS_BROWSER_REGRESSION_ENV_FILE: "/tmp/nonexistent-wtos-regression-env",
        NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
      },
    }),
  /only from WTOS_BROWSER_REGRESSION_ENV_FILE/i,
  "Process credentials including production must be rejected before file access",
);
assertionCount += 1;

for (const [needle, message] of [
  ["hygtnhmmaoboduqghhwg", "Approved regression project is hard-coded"],
  ["gahfcgyjtfwwmsterhzu", "Production project is explicitly rejected"],
  ["BROWSER_REGRESSION_ENV_FILE", "Only the secure external environment loader is used"],
  ["This runner never reads .env.local", "The runner explicitly prohibits .env.local"],
  ["command: \"verify\"", "Identity and zero-residue checks run before fixtures"],
  ["createNetworkGuard", "Network requests are restricted by origin"],
  ["url.origin !== allowedOrigin", "Only the approved Supabase origin is allowed"],
  ["app/api/integrations/twilio/webhook/route.ts", "The production webhook route is compiled"],
  ["route.POST", "The production POST entrypoint is exercised"],
  ["getExpectedTwilioSignature", "Official Twilio signature generation is used"],
  ["exact duplicate", "Exact duplicate delivery is exercised"],
  ["reverseOrder: true", "Equivalent reordered signed delivery is exercised end to end"],
  ["duplicate after CRM match drift", "Duplicate identity remains stable across later CRM changes"],
  ["conflicting duplicate", "Conflicting duplicate delivery is exercised"],
  ["known customer", "Known customer matching is exercised"],
  ["unknown sender", "Unknown sender behavior is exercised"],
  ["ambiguous sender", "Ambiguous sender behavior is exercised"],
  ["cross-company sender isolation", "Cross-company contact isolation is exercised"],
  ["disabled connection", "Disabled connection rejection is exercised"],
  ["concurrent duplicate", "Concurrent duplicate deliveries are exercised"],
  ["retry recovery after message claim", "Retry recovery is exercised"],
  ["evidence_proof", "Signed evidence proof is verified"],
  ["TWILIO_OUTBOUND_SMS_ENABLED = \"false\"", "Outbound SMS is locked false"],
  ["SMS_ROUTE_IDENTITIES", "All three exact SMS route identities are declared"],
  ['key: "weathertech-phoenix"', "Phoenix SMS identity is preserved"],
  ['key: "weathertech-tucson"', "Tucson SMS identity is preserved"],
  ['key: "ihc-primary"', "IHC SMS identity is preserved"],
  ['communicationChannel: "sms_voice"', "Tucson retains its voice-capable SMS identity"],
  ['communicationChannel: "sms"', "Phoenix and IHC are SMS-only"],
  ["exact Tucson SMS identity", "Tucson signed inbound SMS is exercised"],
  ["exact IHC SMS identity", "IHC signed inbound SMS is exercised"],
  ["expectedBusinessPhoneNumberId", "Stored SMS evidence binds to each exact business number"],
  ["TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = \"false\"", "Tucson voice stays disabled during SMS regression"],
  ["unmapped route", "An unknown ingress remains fail-closed"],
  ["providerNetworkRequests: 0", "The report requires zero provider network requests"],
  ["createBrowserCompatibleRegressionRunId", "Cleanup uses the guarded RPC's exact 17-digit marker family"],
  ["cleanupTwilioSyntheticAutomationLedger", "Immutable automation cleanup uses the guarded database RPC"],
  ["const sourceMarker = `TEST WTOS REGRESSION ${runId}`", "The exact generic cleanup marker is separate from the Inbound label"],
  ["deleteExactIds", "Cleanup uses captured exact IDs"],
  ["deleteLeadAccountabilityForExactLeadIds", "Cleanup discovers accountability rows only through exact synthetic lead IDs"],
  ['deleteExactIds(client, "lead_accountability_events", eventIds)', "Immutable accountability events are deleted before current accountability state"],
  ["capturedIdsAuthorizedForCleanup", "Cleanup is authorized only after every collision check passes"],
  ["if (capturedIdsAuthorizedForCleanup)", "Collision failure cannot delete pre-existing rows"],
  ["assertExactIdsAbsent", "Final exact-ID residue is verified"],
  ["cleanupResidue = 0", "The runner reports zero cleanup residue only after verification"],
]) {
  check(source.includes(needle), message);
}

check(
  !source.includes('resolve(cwd, ".env.local")') &&
    !source.includes("dotenv") &&
    !source.includes("env-cmd"),
  "Runner has no repository-local environment loading fallback",
);
check(
  !source.includes("TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD") &&
    !source.includes("TWILIO_IHC_VOICE_FORWARD") &&
    !source.includes("TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER") &&
    !source.includes("TWILIO_IHC_PUBLIC_NUMBER") &&
    !source.includes("TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED") &&
    !source.includes("TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED"),
  "SMS regression has no obsolete Phoenix/IHC voice configuration requirement",
);
check(
  (source.match(/communicationChannel: "sms",/g) ?? []).length === 2 &&
    (source.match(/communicationChannel: "sms_voice",/g) ?? []).length === 1,
  "The SMS fixture graph keeps Phoenix/IHC sms and Tucson sms_voice",
);
check(
  !/\.delete\(\)[\s\S]{0,80}\.(?:like|ilike|neq)\(/.test(source),
  "Cleanup has no pattern or inequality deletion",
);
check(
  /\.delete\(\)\.in\("id", ids\)/.test(source),
  "Cleanup deletes only captured exact ID sets",
);
check(
  source.lastIndexOf("cleanupTwilioSyntheticAutomationLedger({") <
    source.lastIndexOf('deleteExactIds(\n          client,\n          "communication_provider_events"'),
  "Guarded automation cleanup runs before any ordinary inbound source deletion",
);
check(
  source.indexOf('deleteExactIds(client, "lead_accountability_events", eventIds)') <
    source.indexOf('deleteExactIds(client, "lead_accountability", accountabilityIds)') &&
    source.indexOf("deleteLeadAccountabilityForExactLeadIds(") <
      source.lastIndexOf('deleteExactIds(client, "leads", capturedIds.leads)'),
  "Accountability cleanup runs events then current state before exact synthetic leads",
);

if (process.env[TWILIO_INBOUND_REGRESSION_RUN] === "true") {
  const report = await runTwilioInboundRegression({ cwd });
  assert.equal(report.result, "PASS");
  assert.equal(report.target, "hygtnhmmaoboduqghhwg");
  assert.equal(report.acceptedMessages, 9);
  assert.equal(report.acceptedProviderEvents, 9);
  assert.deepEqual(report.routeKeys, [
    "weathertech-phoenix",
    "weathertech-tucson",
    "ihc-primary",
  ]);
  assert.equal(report.allThreeSmsIdentitiesVerified, true);
  assert.equal(report.duplicateRowsCreated, 0);
  assert.equal(report.duplicateSurvivedCrmMatchDrift, true);
  assert.equal(report.conflictingDuplicateRejected, true);
  assert.equal(report.knownCustomerMatched, true);
  assert.equal(report.unknownSenderPreservedUnmatched, true);
  assert.equal(report.ambiguousSenderPreservedUnmatched, true);
  assert.equal(report.crossCompanyLeadAssociationBlocked, true);
  assert.equal(report.unmappedRouteRejected, true);
  assert.equal(report.disabledConnectionRejected, true);
  assert.equal(report.concurrentDuplicatesConverged, true);
  assert.equal(report.retryRecoveryCompleted, true);
  assert.equal(report.evidenceProofVerified, true);
  assert.equal(report.outboundMessages, 0);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.automationCleanup?.invoked, true);
  assert.equal(report.automationCleanup?.databaseResidueCount, 0);
  assert.equal(report.cleanupResidue, 0);
  assertionCount += 23;
  console.log("Twilio inbound hosted regression execution: PASS");
} else {
  console.log(
    `Twilio inbound hosted regression execution: NOT RUN (set ${TWILIO_INBOUND_REGRESSION_RUN}=true with the secure external regression environment to execute it)`,
  );
}

console.log(`Twilio inbound regression runner contract: PASS (${assertionCount} assertions)`);
