import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TWILIO_VOICE_INBOUND_REGRESSION_RUN,
  loadTwilioVoiceInboundRegressionEnvironment,
  runTwilioVoiceInboundRegression,
} from "../scripts/twilio-voice-inbound-regression.mjs";

const cwd = process.cwd();
const runnerPath = join(cwd, "scripts", "twilio-voice-inbound-regression.mjs");
const source = readFileSync(runnerPath, "utf8");
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

assert.throws(
  () => loadTwilioVoiceInboundRegressionEnvironment({ cwd, runtimeEnv: {} }),
  /external|environment file|never reads \.env\.local/i,
  "Missing external regression environment must fail closed",
);
assertionCount += 1;

assert.throws(
  () =>
    loadTwilioVoiceInboundRegressionEnvironment({
      cwd,
      runtimeEnv: {
        WTOS_BROWSER_REGRESSION_ENV_FILE: "/tmp/nonexistent-wtos-voice-regression-env",
        NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-be-used",
      },
    }),
  /only from WTOS_BROWSER_REGRESSION_ENV_FILE/i,
  "Process credentials including Production must be rejected before file access",
);
assertionCount += 1;

for (const [needle, message] of [
  ["hygtnhmmaoboduqghhwg", "Approved regression project is hard-coded"],
  ["gahfcgyjtfwwmsterhzu", "Production project is explicitly rejected"],
  ["BROWSER_REGRESSION_ENV_FILE", "Secure external environment loading is required"],
  ["This runner never reads .env.local", "Repository-local secrets are prohibited"],
  ['command: "verify"', "Identity and zero-residue checks run before fixtures"],
  ["createNetworkGuard", "Network requests are origin-restricted"],
  ["url.origin !== allowedOrigin", "Only approved regression Supabase is reachable"],
  ["app/api/integrations/twilio/voice/route.ts", "Production voice ingress route is compiled"],
  ["app/api/integrations/twilio/voice/status/route.ts", "Production voice status route is compiled"],
  ["getExpectedTwilioSignature", "Official Twilio signatures drive route requests"],
  ['key: "weathertech-phoenix"', "Exact Phoenix route is declared"],
  ['key: "weathertech-tucson"', "Exact Tucson route is declared"],
  ['key: "ihc-primary"', "Exact IHC route is declared"],
  ['businessLocation: "Phoenix"', "Exact Phoenix location is seeded"],
  ['businessLocation: "Tucson"', "Exact Tucson location is seeded"],
  ['businessLocation: "Scottsdale"', "Exact IHC location is seeded"],
  ['teamQueue: "weathertech-roofing-phoenix"', "Exact Phoenix queue is seeded"],
  ['teamQueue: "weathertech-roofing-tucson"', "Exact Tucson queue is seeded"],
  ['teamQueue: "ihc-painting"', "Exact IHC queue is seeded"],
  ['leadSource: "Phone - WeatherTech Phoenix"', "Exact Phoenix lead source is seeded"],
  ['leadSource: "Phone - WeatherTech Tucson"', "Exact Tucson lead source is seeded"],
  ['leadSource: "Phone - IHC"', "Exact IHC lead source is seeded"],
  ['communication_channel: "sms_voice"', "Every synthetic route is voice capable"],
  ["PHOENIX_FORWARD_DESTINATION", "Phoenix uses its own synthetic terminal"],
  ["TUCSON_FORWARD_DESTINATION", "Tucson uses its own synthetic terminal"],
  ["IHC_FORWARD_DESTINATION", "IHC uses its own synthetic terminal"],
  ["three distinct terminal destinations", "Synthetic terminals must remain distinct"],
  ["hasExactRouteDialTwiML", "Every successful route verifies exact-only Dial TwiML"],
  ["TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER", "Phoenix public source stays protected"],
  ["TWILIO_IHC_PUBLIC_NUMBER", "IHC public source stays protected"],
  [
    "TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
    "Phoenix terminal attestation is independent",
  ],
  [
    "TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
    "IHC terminal attestation is independent",
  ],
  [
    "IHC route cannot inherit another terminal attestation",
    "A route cannot inherit another route's terminal attestation",
  ],
  ["graph-wide public-source loop", "Graph-wide public-source loops are rejected"],
  ["terminalCallerAttempts = VOICE_ROUTES.flatMap", "Every route-terminal caller pair is exercised"],
  ["callerTerminal: callerRoute.destination", "Cross-route terminal callers use exact route fixtures"],
  ["terminal caller loop", "Calls originating from any configured terminal are rejected"],
  ["retry recovery after partial call claim", "Partial persistence retry is exercised"],
  ["POST-CLAIM MATCH DRIFT", "CRM match drift after claim is exercised"],
  ["same-company known caller", "Known same-company contact matching is exercised"],
  ["ambiguous same-company caller", "Ambiguous same-company matching is exercised"],
  ["concurrent exact ingress", "Concurrent ingress convergence is exercised for every route"],
  ["changed same parent ingress conflict", "Changed parent replay is rejected"],
  ["status without exact parent claim", "Parentless status is rejected"],
  ["forged voice status signature", "Forged status signatures are rejected"],
  ["cross-company IHC status route", "Cross-company status routing is rejected"],
  ["forged parent caller identity", "Changed parent identity is rejected"],
  ["rollback-safe concurrent status", "Every route's in-flight status survives sms_voice to sms rollback"],
  ["different child status conflict", "A second child leg conflicts"],
  ["different terminal status conflict", "A changed terminal result conflicts"],
  ["new ingress blocked after sms-only rollback", "Every route rollback blocks new Dial authorization"],
  ["provider_dial_status", "Bounded provider outcome evidence is verified"],
  ["expectedAnsweredAt", "Answered time derivation is verified"],
  ["FORWARD_DESTINATIONS.every", "Every raw route terminal is prohibited from storage"],
  ["destination: route.destination", "Stored proofs bind to each exact route terminal"],
  ["new Set(storedDestinationProofs).size", "Stored terminal proofs remain route-distinct"],
  ["!storedEvidence.includes(PHOENIX_PUBLIC_SOURCE)", "Raw Phoenix public source storage is prohibited"],
  ["!storedEvidence.includes(IHC_PUBLIC_SOURCE)", "Raw IHC public source storage is prohibited"],
  ["recording_status === \"not_requested\"", "Recording remains not requested"],
  ["transcript_status === \"not_requested\"", "Transcription remains not requested"],
  ["discoverExactPhoneSideEffects", "Unexpected exact-phone side effects are captured"],
  ["deleteLeadAccountabilityForExactLeadIds", "Exact lead dependents are safely cleaned"],
  ["capturedIdsAuthorizedForCleanup", "Collision checks gate cleanup authority"],
  ["assertExactIdsAbsent", "Cleanup proves exact-ID absence"],
  ["cleanupResidue = 0", "Final zero residue is reported only after verification"],
  ["providerNetworkRequests: 0", "Provider network requests must remain zero"],
  ["outboundCallRecords: 0", "Unexpected outbound call records must remain zero"],
]) {
  check(source.includes(needle), message);
}

check(
  !source.includes('resolve(cwd, ".env.local")') &&
    !source.includes("dotenv") &&
    !source.includes("env-cmd"),
  "Runner has no repository-local environment fallback",
);
check(
  !/\.delete\(\)[\s\S]{0,80}\.(?:like|ilike|neq)\(/.test(source),
  "Cleanup has no pattern or inequality deletion",
);
check(
  /\.delete\(\)\.in\("id", ids\)/.test(source),
  "Cleanup deletes captured exact ID sets only",
);
check(
  source.indexOf('deleteExactIds(\n          client,\n          "communication_provider_events"') <
    source.lastIndexOf('deleteExactIds(client, "sms_messages"') &&
    source.lastIndexOf('deleteExactIds(client, "sms_messages"') <
      source.lastIndexOf('deleteExactIds(client, "call_records"') &&
    source.lastIndexOf("deleteLeadAccountabilityForExactLeadIds(") <
      source.lastIndexOf('deleteExactIds(client, "leads"'),
  "Cleanup preserves provider-event, SMS, call, accountability, and contact dependency order",
);
check(
  source.indexOf('in("from_phone", SYNTHETIC_PHONE_NUMBERS)') <
    source.indexOf("capturedIdsAuthorizedForCleanup = true") &&
    source.indexOf('in("to_phone", SYNTHETIC_PHONE_NUMBERS)') <
      source.indexOf("capturedIdsAuthorizedForCleanup = true"),
  "Exact synthetic phone surfaces are collision-checked before cleanup authorization",
);

if (process.env[TWILIO_VOICE_INBOUND_REGRESSION_RUN] === "true") {
  const report = await runTwilioVoiceInboundRegression({ cwd });
  assert.equal(report.result, "PASS");
  assert.equal(report.target, "hygtnhmmaoboduqghhwg");
  assert.equal(report.parentCalls, 3);
  assert.equal(report.providerEvents, 6);
  assert.deepEqual(report.routeKeys, [
    "weathertech-tucson",
    "weathertech-phoenix",
    "ihc-primary",
  ]);
  assert.equal(report.exactRouteLifecycles, 3);
  assert.equal(report.distinctTerminalsVerified, true);
  assert.equal(report.exactRouteTwiMLVerified, true);
  assert.equal(report.independentTerminalAttestationsVerified, true);
  assert.equal(report.graphWideLoopRejected, true);
  assert.equal(report.terminalCallerLoopRejected, true);
  assert.equal(report.exactCompanyAndBranchIsolationVerified, true);
  assert.equal(report.partialClaimRetryRecovered, true);
  assert.equal(report.crmMatchDriftPreservedOriginalClaim, true);
  assert.equal(report.knownSameCompanyCallerMatched, true);
  assert.equal(report.ambiguousSameCompanyCallerUnassigned, true);
  assert.equal(report.crossCompanyContactIsolationVerified, true);
  assert.equal(report.concurrentIngressConverged, true);
  assert.equal(report.conflictingIngressRejected, true);
  assert.equal(report.parentlessStatusRejected, true);
  assert.equal(report.forgedStatusRejected, true);
  assert.equal(report.crossCompanyStatusRejected, true);
  assert.equal(report.forgedParentIdentityRejected, true);
  assert.equal(report.rollbackStatusReconciled, true);
  assert.equal(report.everyRouteRollbackVerified, true);
  assert.equal(report.concurrentStatusConverged, true);
  assert.equal(report.conflictingChildRejected, true);
  assert.equal(report.conflictingStatusRejected, true);
  assert.equal(report.newIngressBlockedAfterRollback, true);
  assert.equal(report.completedTimingEvidenceVerified, true);
  assert.equal(report.rawDestinationStored, false);
  assert.equal(report.recordingRequested, false);
  assert.equal(report.transcriptionRequested, false);
  assert.equal(report.automaticLeadCreated, false);
  assert.equal(report.automaticCustomerCreated, false);
  assert.equal(report.outboundCallRecords, 0);
  assert.equal(report.outboundSmsCreated, false);
  assert.equal(report.providerNetworkRequests, 0);
  assert.equal(report.cleanupResidue, 0);
  assertionCount += 39;
  console.log("Twilio multi-route voice hosted regression execution: PASS");
} else {
  console.log(
    `Twilio multi-route voice hosted regression execution: NOT RUN (set ${TWILIO_VOICE_INBOUND_REGRESSION_RUN}=true with the secure external regression environment to execute it)`,
  );
}

console.log(`Twilio multi-route voice regression runner contract: PASS (${assertionCount} assertions)`);
