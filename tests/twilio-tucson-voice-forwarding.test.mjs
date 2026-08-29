import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs, { mkdtempSync, rmSync } from "node:fs";
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import twilio from "twilio";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-twilio-tucson-voice-"));
const envNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PUBLIC_BASE_URL",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_WEATHERTECH_PHOENIX_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_NUMBER",
  "TWILIO_IHC_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
];
const envSnapshot = new Map(envNames.map((name) => [name, process.env[name]]));
const accountSid = "AC11111111111111111111111111111111";
const authToken = "voice-test-auth-token-not-a-real-secret";
const publicBaseUrl = "https://voice-regression.weathertech.invalid";
const voicePath = "/api/integrations/twilio/voice";
const statusPath = "/api/integrations/twilio/voice/status";
const voiceUrl = `${publicBaseUrl}${voicePath}`;
const statusUrl = `${publicBaseUrl}${statusPath}`;
const tucsonNumber = "+15205550145";
const phoenixNumber = "+16025550126";
const ihcNumber = "+14805556930";
const forwardDestination = "+16235550999";
const callerNumber = "+15205550101";
const parentCallSid = "CA11111111111111111111111111111111";
const childCallSid = "CA22222222222222222222222222222222";
let assertionCount = 0;

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function restoreEnvironment() {
  for (const [name, value] of envSnapshot) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

function signForm(url, params) {
  return twilio.getExpectedTwilioSignature(
    authToken,
    url,
    Object.fromEntries(params.entries()),
  );
}

function createRequest({ pathName, params, signature, rawBody }) {
  return new NextRequest(`http://127.0.0.1:3000${pathName}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: rawBody ?? params.toString(),
  });
}

function inboundVoiceParams(overrides = {}) {
  return new URLSearchParams({
    AccountSid: accountSid,
    CallSid: parentCallSid,
    From: callerNumber,
    To: tucsonNumber,
    CallStatus: "ringing",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    ...overrides,
  });
}

function voiceStatusParams(overrides = {}) {
  return new URLSearchParams({
    AccountSid: accountSid,
    CallSid: parentCallSid,
    DialCallSid: childCallSid,
    From: callerNumber,
    To: tucsonNumber,
    CallStatus: "in-progress",
    DialCallStatus: "completed",
    DialCallDuration: "42",
    DialBridged: "true",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: "Mon, 24 Aug 2026 20:00:00 +0000",
    ...overrides,
  });
}

async function invokeHandler(webhooks, kind, pathName, canonicalUrl, params) {
  return webhooks.handleTwilioWebhook(
    createRequest({
      pathName,
      params,
      signature: signForm(canonicalUrl, params),
    }),
    kind,
  );
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules", ".bin", "tsc"),
    [
      "lib/twilio/webhooks.ts",
      "app/api/integrations/twilio/voice/route.ts",
      "app/api/integrations/twilio/voice/status/route.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    { cwd, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Tucson voice forwarding modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.TWILIO_ACCOUNT_SID = accountSid;
  process.env.TWILIO_AUTH_TOKEN = authToken;
  process.env.TWILIO_MESSAGING_SERVICE_SID =
    "MG11111111111111111111111111111111";
  process.env.TWILIO_PUBLIC_BASE_URL = publicBaseUrl;
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";
  process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER = phoenixNumber;
  process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER = tucsonNumber;
  process.env.TWILIO_IHC_NUMBER = ihcNumber;
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = forwardDestination;

  const webhooksPath = join(outDir, "lib", "twilio", "webhooks.js");
  const voiceRoutePath = join(
    outDir,
    "app",
    "api",
    "integrations",
    "twilio",
    "voice",
    "route.js",
  );
  const statusRoutePath = join(
    outDir,
    "app",
    "api",
    "integrations",
    "twilio",
    "voice",
    "status",
    "route.js",
  );
  const webhooks = await import(pathToFileURL(webhooksPath).href);
  const voiceRoute = await import(pathToFileURL(voiceRoutePath).href);
  const statusRoute = await import(pathToFileURL(statusRoutePath).href);

  equal(typeof voiceRoute.POST, "function", "Tucson voice ingress route exposes POST");
  equal(typeof statusRoute.POST, "function", "Tucson voice action route exposes POST");

  const inbound = inboundVoiceParams();
  const parsedInbound = await webhooks.parseTwilioWebhookRequest(
    createRequest({
      pathName: voicePath,
      params: inbound,
      signature: signForm(voiceUrl, inbound),
    }),
    "voice_inbound",
  );
  equal(parsedInbound.signatureStatus, "valid", "Official SDK signature validates voice ingress");
  equal(parsedInbound.payload.callSid, parentCallSid, "Voice ingress keeps the parent CallSid");
  equal(parsedInbound.payload.dialCallSid, null, "Voice ingress has no synthetic child CallSid");
  equal(parsedInbound.payload.direction, "inbound", "Voice ingress requires inbound direction");
  check(
    /^[a-f0-9]{64}$/.test(parsedInbound.signatureEvidence),
    "Voice ingress produces bounded signature evidence",
  );

  const forwardingResponse = webhooks.createTwilioVoiceForwardingResponse({
    destination: forwardDestination,
    statusCallbackUrl: statusUrl,
  });
  const forwardingXml = await forwardingResponse.text();
  equal(forwardingResponse.status, 200, "SDK-generated forwarding TwiML returns 200");
  check(forwardingXml.includes("<Dial"), "Forwarding TwiML contains one Dial verb");
  check(forwardingXml.includes(`action=\"${statusUrl}\"`), "Dial action uses the canonical status path");
  check(forwardingXml.includes('method="POST"'), "Dial action callback uses POST");
  check(forwardingXml.includes('answerOnBridge="true"'), "Inbound caller rings until destination answers");
  check(forwardingXml.includes('record="do-not-record"'), "Call recording is explicitly disabled");
  check(forwardingXml.includes('timeout="30"'), "Destination ringing is bounded");
  check(forwardingXml.includes(forwardDestination), "Only the protected destination is dialed");
  check(!forwardingXml.includes("<Record"), "No Record verb is emitted");
  check(!forwardingXml.includes("Transcription"), "No transcription instruction is emitted");
  check(!forwardingXml.includes("callerId="), "Caller ID is not replaced or spoofed");

  assert.throws(
    () =>
      webhooks.createTwilioVoiceForwardingResponse({
        destination: "malformed",
        statusCallbackUrl: statusUrl,
      }),
    /destination is invalid/i,
    "Malformed forwarding destinations fail closed before TwiML generation",
  );
  assertionCount += 1;
  assert.throws(
    () =>
      webhooks.createTwilioVoiceForwardingResponse({
        destination: forwardDestination,
        statusCallbackUrl: "http://insecure.invalid/status",
      }),
    /callback URL is invalid/i,
    "Non-HTTPS status callbacks fail closed",
  );
  assertionCount += 1;

  const endResponse = webhooks.createTwilioVoiceEndResponse();
  const endXml = await endResponse.text();
  equal(endResponse.status, 200, "Dial action completion returns TwiML 200");
  check(endXml.includes("<Response"), "Dial action completion returns an empty VoiceResponse");
  check(!endXml.includes("<Dial"), "Dial action completion cannot create another call leg");

  let response;
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = "false";
  response = await invokeHandler(webhooks, "voice_inbound", voicePath, voiceUrl, inboundVoiceParams());
  equal(response.status, 503, "Disabled Tucson voice gate returns 503 without dialing");
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = "true";

  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "false";
  response = await invokeHandler(webhooks, "voice_inbound", voicePath, voiceUrl, inboundVoiceParams());
  equal(response.status, 503, "Missing Tucson terminal attestation returns 503 without dialing");
  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";

  delete process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO;
  response = await invokeHandler(webhooks, "voice_inbound", voicePath, voiceUrl, inboundVoiceParams());
  equal(response.status, 503, "Missing protected destination returns 503 without dialing");
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "malformed";
  response = await invokeHandler(webhooks, "voice_inbound", voicePath, voiceUrl, inboundVoiceParams());
  equal(response.status, 503, "Malformed protected destination returns 503 without dialing");

  for (const [loopNumber, label] of [
    [tucsonNumber, "Tucson"],
    [phoenixNumber, "Phoenix"],
    [ihcNumber, "IHC"],
  ]) {
    process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = loopNumber;
    response = await invokeHandler(webhooks, "voice_inbound", voicePath, voiceUrl, inboundVoiceParams());
    equal(response.status, 503, `${label} business-number destination loop is rejected`);
  }
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = forwardDestination;

  response = await invokeHandler(
    webhooks,
    "voice_inbound",
    voicePath,
    voiceUrl,
    inboundVoiceParams({ From: forwardDestination }),
  );
  equal(response.status, 403, "A call originating from the forward destination is rejected as a self-dial loop");

  response = await invokeHandler(
    webhooks,
    "voice_inbound",
    voicePath,
    voiceUrl,
    inboundVoiceParams({ To: phoenixNumber }),
  );
  equal(
    response.status,
    503,
    "Signed Phoenix voice ingress remains disabled until its exact protected route is configured",
  );
  response = await invokeHandler(
    webhooks,
    "voice_inbound",
    voicePath,
    voiceUrl,
    inboundVoiceParams({ To: ihcNumber }),
  );
  equal(
    response.status,
    503,
    "Signed IHC voice ingress remains disabled until its exact protected route is configured",
  );

  const wrongAccountParams = inboundVoiceParams({
    AccountSid: "AC99999999999999999999999999999999",
  });
  response = await invokeHandler(
    webhooks,
    "voice_inbound",
    voicePath,
    voiceUrl,
    wrongAccountParams,
  );
  equal(response.status, 403, "A correctly signed request for the wrong Twilio account is rejected");

  response = await webhooks.handleTwilioWebhook(
    createRequest({
      pathName: voicePath,
      params: inbound,
      signature: "invalid-signature",
    }),
    "voice_inbound",
  );
  equal(response.status, 403, "Invalid Twilio voice signatures are rejected");

  const duplicateDialFieldBody = `${inbound.toString()}&DialCallSid=${childCallSid}&DialCallSid=${childCallSid}`;
  response = await webhooks.handleTwilioWebhook(
    createRequest({
      pathName: voicePath,
      params: inbound,
      signature: "unused-after-duplicate-rejection",
      rawBody: duplicateDialFieldBody,
    }),
    "voice_inbound",
  );
  equal(response.status, 400, "Duplicate DialCallSid fields fail closed before signature processing");

  response = await invokeHandler(webhooks, "voice_inbound", voicePath, voiceUrl, inboundVoiceParams());
  equal(response.status, 503, "A valid voice ingress cannot return Dial before durable storage succeeds");

  const statusParams = voiceStatusParams();
  const parsedStatus = await webhooks.parseTwilioWebhookRequest(
    createRequest({
      pathName: statusPath,
      params: statusParams,
      signature: signForm(statusUrl, statusParams),
    }),
    "voice_status",
  );
  equal(parsedStatus.signatureStatus, "valid", "Official SDK signature validates Dial action callbacks");
  equal(parsedStatus.payload.callSid, parentCallSid, "Dial action CallSid remains the inbound parent");
  equal(parsedStatus.payload.dialCallSid, childCallSid, "DialCallSid is parsed separately as child evidence");
  equal(parsedStatus.payload.dialCallStatus, "completed", "DialCallStatus is not confused with CallStatus");
  equal(parsedStatus.payload.callStatus, "in-progress", "Generic parent CallStatus remains separate");
  equal(parsedStatus.payload.dialCallDurationSeconds, 42, "DialCallDuration is parsed as bounded seconds");
  equal(parsedStatus.payload.dialBridged, true, "DialBridged is parsed explicitly");

  for (const [providerStatus, callStatus] of [
    ["completed", "completed"],
    ["busy", "busy"],
    ["failed", "failed"],
    ["no-answer", "missed"],
    ["canceled", "missed"],
  ]) {
    const normalized = webhooks.normalizeTwilioTerminalDialStatus(providerStatus);
    equal(normalized, providerStatus, `${providerStatus} remains a bounded provider outcome`);
    equal(
      webhooks.mapTwilioTerminalDialStatus(normalized),
      callStatus,
      `${providerStatus} maps to the expected call-record status`,
    );
  }
  equal(
    webhooks.normalizeTwilioTerminalDialStatus("answered"),
    null,
    "A non-terminal Dial status is rejected",
  );

  for (const field of ["DialCallSid", "DialCallStatus", "DialCallDuration", "DialBridged"]) {
    const duplicated = voiceStatusParams();
    duplicated.append(field, duplicated.get(field));
    const parsedDuplicate = await webhooks.parseTwilioWebhookRequest(
      createRequest({
        pathName: statusPath,
        params: duplicated,
        signature: "unused-after-duplicate-rejection",
      }),
      "voice_status",
    );
    equal(parsedDuplicate.signatureStatus, "malformed_request", `Duplicate ${field} fails closed`);
  }

  for (const [overrides, label] of [
    [{ DialCallDuration: "-1" }, "negative DialCallDuration"],
    [{ DialCallDuration: "86401" }, "oversized DialCallDuration"],
    [{ DialBridged: "yes" }, "malformed DialBridged"],
  ]) {
    const malformed = voiceStatusParams(overrides);
    const parsedMalformed = await webhooks.parseTwilioWebhookRequest(
      createRequest({
        pathName: statusPath,
        params: malformed,
        signature: "unused-after-bounded-field-rejection",
      }),
      "voice_status",
    );
    equal(parsedMalformed.signatureStatus, "malformed_request", `${label} fails closed`);
  }

  response = await invokeHandler(
    webhooks,
    "voice_status",
    statusPath,
    statusUrl,
    voiceStatusParams({ DialCallSid: parentCallSid }),
  );
  equal(response.status, 400, "Dial child CallSid cannot equal the inbound parent CallSid");
  response = await invokeHandler(
    webhooks,
    "voice_status",
    statusPath,
    statusUrl,
    voiceStatusParams({ Direction: "outbound-dial" }),
  );
  equal(response.status, 400, "Dial action callback must retain the inbound parent direction");
  response = await invokeHandler(
    webhooks,
    "voice_status",
    statusPath,
    statusUrl,
    voiceStatusParams({ DialCallStatus: "completed", DialBridged: "false" }),
  );
  equal(response.status, 400, "Completed status cannot claim an unbridged call");
  response = await invokeHandler(
    webhooks,
    "voice_status",
    statusPath,
    statusUrl,
    voiceStatusParams({ DialCallStatus: "no-answer", DialBridged: "true" }),
  );
  equal(response.status, 400, "No-answer status cannot claim a bridged call");
  response = await invokeHandler(
    webhooks,
    "voice_status",
    statusPath,
    statusUrl,
    voiceStatusParams({ To: phoenixNumber }),
  );
  equal(
    response.status,
    503,
    "A Phoenix status callback cannot persist without its exact claimed parent and storage route",
  );
  response = await invokeHandler(webhooks, "voice_status", statusPath, statusUrl, statusParams);
  equal(response.status, 503, "A valid status callback cannot report success before durable storage");

  const webhooksSource = fs.readFileSync(path.join(cwd, "lib/twilio/webhooks.ts"), "utf8");
  const statusRouteSource = fs.readFileSync(
    path.join(cwd, "app/api/integrations/twilio/voice/status/route.ts"),
    "utf8",
  );
  for (const [needle, message] of [
    ["getTwilioServerConfig", "Voice runtime consumes centralized protected configuration"],
    ["getTwilioExpectedBusinessNumbers", "Loop and route checks use centralized business identities"],
    ["matchesTwilioBusinessRouteTemplate", "Database routing uses exact shared identity templates"],
    ['.eq("communication_channel", "sms_voice")', "Voice requires explicit sms_voice capability"],
    ["DialCallSid", "Dial child identity is parsed explicitly"],
    ["DialCallStatus", "Dial outcome is parsed explicitly"],
    ["DialCallDuration", "Dial duration is bounded explicitly"],
    ["DialBridged", "Dial bridge evidence is parsed explicitly"],
    ["call_records", "Existing call schema stores bounded parent evidence"],
    ["communication_provider_events", "Existing event schema stores bounded voice evidence"],
    ['.eq("id", eventId)', "Status conflicts recover the deterministic parent event before exact replay comparison"],
    ['record: "do-not-record"', "SDK TwiML explicitly disables recording"],
    ["createTwilioVoiceDestinationProof", "Forward destination is persisted only as keyed evidence"],
  ]) {
    check(webhooksSource.includes(needle), message);
  }
  check(
    !webhooksSource.includes("TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO"),
    "Core webhook has no duplicate direct forwarding-env parser",
  );
  check(!webhooksSource.includes(".calls.create"), "Voice forwarding makes no Twilio REST call");
  check(!webhooksSource.includes("recordingStatusCallback"), "No recording callback is configured");
  check(!webhooksSource.includes("processLeadIntake("), "Voice ingress cannot create a lead automatically");
  check(statusRouteSource.includes('"voice_status"'), "Dedicated action route uses voice_status kind");
  check(!statusRouteSource.includes("export async function GET"), "Dedicated action route exposes no GET");

  console.log(`Twilio Tucson voice forwarding security contract: PASS (${assertionCount} assertions)`);
} finally {
  restoreEnvironment();
  rmSync(outDir, { recursive: true, force: true });
}
