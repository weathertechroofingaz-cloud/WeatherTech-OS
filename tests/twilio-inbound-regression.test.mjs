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
  ["unmapped IHC route", "Unmapped IHC routing is rejected"],
  ["disabled connection", "Disabled connection rejection is exercised"],
  ["concurrent duplicate", "Concurrent duplicate deliveries are exercised"],
  ["retry recovery after message claim", "Retry recovery is exercised"],
  ["evidence_proof", "Signed evidence proof is verified"],
  ["TWILIO_OUTBOUND_SMS_ENABLED = \"false\"", "Outbound SMS is locked false"],
  ["TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED = \"false\"", "Phoenix voice stays disabled during SMS regression"],
  ["TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = \"false\"", "Tucson voice stays disabled during SMS regression"],
  ["TWILIO_IHC_VOICE_FORWARDING_ENABLED = \"false\"", "IHC voice stays disabled during SMS regression"],
  ["providerNetworkRequests: 0", "The report requires zero provider network requests"],
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
  !/\.delete\(\)[\s\S]{0,80}\.(?:like|ilike|neq)\(/.test(source),
  "Cleanup has no pattern or inequality deletion",
);
check(
  /\.delete\(\)\.in\("id", ids\)/.test(source),
  "Cleanup deletes only captured exact ID sets",
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
  assert.equal(report.acceptedMessages, 7);
  assert.equal(report.acceptedProviderEvents, 7);
  assert.equal(report.duplicateRowsCreated, 0);
  assert.equal(report.duplicateSurvivedCrmMatchDrift, true);
  assert.equal(report.conflictingDuplicateRejected, true);
  assert.equal(report.knownCustomerMatched, true);
  assert.equal(report.unknownSenderPreservedUnmatched, true);
  assert.equal(report.ambiguousSenderPreservedUnmatched, true);
  assert.equal(report.crossCompanyLeadAssociationBlocked, true);
  assert.equal(report.unmappedIhcRouteRejected, true);
  assert.equal(report.disabledConnectionRejected, true);
  assert.equal(report.concurrentDuplicatesConverged, true);
  assert.equal(report.retryRecoveryCompleted, true);
  assert.equal(report.evidenceProofVerified, true);
  assert.equal(report.outboundMessages, 0);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.cleanupResidue, 0);
  assertionCount += 19;
  console.log("Twilio inbound hosted regression execution: PASS");
} else {
  console.log(
    `Twilio inbound hosted regression execution: NOT RUN (set ${TWILIO_INBOUND_REGRESSION_RUN}=true with the secure external regression environment to execute it)`,
  );
}

console.log(`Twilio inbound regression runner contract: PASS (${assertionCount} assertions)`);
