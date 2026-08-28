import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import twilio from "twilio";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-twilio-foundation-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");
let assertionCount = 0;

function check(condition, message) {
  assertionCount += 1;
  assert.ok(condition, message);
}

function equal(actual, expected, message) {
  assertionCount += 1;
  assert.equal(actual, expected, message);
}

function deepEqual(actual, expected, message) {
  assertionCount += 1;
  assert.deepEqual(actual, expected, message);
}

function createFormRequest({
  requestUrl,
  params,
  signature,
  contentType = "application/x-www-form-urlencoded",
  forwardedHost,
  forwardedProto,
  rawBody,
}) {
  const headers = { "content-type": contentType };

  if (signature !== undefined) {
    headers["x-twilio-signature"] = signature;
  }
  if (forwardedHost) {
    headers["x-forwarded-host"] = forwardedHost;
  }
  if (forwardedProto) {
    headers["x-forwarded-proto"] = forwardedProto;
  }

  return new NextRequest(requestUrl, {
    method: "POST",
    headers,
    body: rawBody ?? params?.toString() ?? "",
  });
}

function signTwilioForm(authToken, canonicalUrl, params) {
  return twilio.getExpectedTwilioSignature(
    authToken,
    canonicalUrl,
    Object.fromEntries(params.entries()),
  );
}

function inboundParams(overrides = {}) {
  return new URLSearchParams({
    AccountSid: "AC11111111111111111111111111111111",
    MessageSid: "SM11111111111111111111111111111111",
    SmsSid: "SM11111111111111111111111111111111",
    SmsMessageSid: "SM11111111111111111111111111111111",
    MessagingServiceSid: "MG11111111111111111111111111111111",
    From: "+14805550101",
    To: "+16025550101",
    Body: "WTOS inbound test - body text must never choose a company",
    NumMedia: "0",
    ...overrides,
  });
}

function snapshotEnvironment(names) {
  return new Map(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(snapshot) {
  for (const [name, value] of snapshot) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

async function withoutConsole(callback) {
  const original = {
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const entries = [];
  console.info = (...values) => entries.push(["info", ...values]);
  console.warn = (...values) => entries.push(["warn", ...values]);
  console.error = (...values) => entries.push(["error", ...values]);

  try {
    return { result: await callback(), entries };
  } finally {
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
  }
}

function resolveContactContract({ companyId, sender, customers, leads }) {
  const normalize = (value) => {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return String(value ?? "").trim().startsWith("+") && digits.length >= 8
      ? `+${digits}`
      : null;
  };
  const normalizedSender = normalize(sender);
  const customerMatches = customers.filter(
    (record) => record.companyId === companyId && normalize(record.phone) === normalizedSender,
  );
  const leadMatches = leads.filter(
    (record) => record.companyId === companyId && normalize(record.phone) === normalizedSender,
  );
  const matches = [
    ...customerMatches.map((record) => ({ type: "customer", id: record.id })),
    ...leadMatches.map((record) => ({ type: "lead", id: record.id })),
  ];

  if (!normalizedSender || matches.length === 0) {
    return { status: "unmatched", customerId: null, leadId: null };
  }
  if (matches.length !== 1) {
    return { status: "ambiguous", customerId: null, leadId: null };
  }

  return matches[0].type === "customer"
    ? { status: "matched_customer", customerId: matches[0].id, leadId: null }
    : { status: "matched_lead", customerId: null, leadId: matches[0].id };
}

function claimInboundContract(state, payload) {
  const key = `${payload.accountSid}:${payload.messageSid}`;
  const fingerprint = JSON.stringify({
    accountSid: payload.accountSid,
    messageSid: payload.messageSid,
    from: payload.from,
    to: payload.to,
    body: payload.body,
    companyId: payload.companyId,
  });
  const existing = state.messages.get(key);

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return { status: "conflict", messageId: existing.id };
    }
    return { status: "duplicate", messageId: existing.id };
  }

  const id = `message-${payload.messageSid}`;
  state.messages.set(key, { id, fingerprint });
  return { status: "stored", messageId: id };
}

function persistProviderEventContract(state, messageId, providerEventSid, fail = false) {
  if (fail) {
    return { status: "retryable_failure", providerEventId: null };
  }
  const existing = state.events.get(providerEventSid);
  if (existing) {
    return { status: "duplicate", providerEventId: existing.id };
  }
  const event = { id: `event-${providerEventSid}`, messageId };
  state.events.set(providerEventSid, event);
  return { status: "stored", providerEventId: event.id };
}

const envNames = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PUBLIC_BASE_URL",
  "TWILIO_INBOUND_SMS_ENABLED",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_FROM_NUMBER",
  "TWILIO_WEATHERTECH_PHOENIX_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_NUMBER",
  "TWILIO_IHC_NUMBER",
  "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER",
  "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
  "TWILIO_IHC_PUBLIC_NUMBER",
  "TWILIO_IHC_VOICE_FORWARDING_ENABLED",
  "TWILIO_IHC_VOICE_FORWARD_TO",
];
const envSnapshot = snapshotEnvironment(envNames);
const originalFetch = globalThis.fetch;

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/twilio/webhooks.ts",
      "lib/twilio/serverClient.ts",
      "lib/twilio/foundation.ts",
      "lib/crm/integrations.ts",
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
      `Could not compile Twilio foundation modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const webhooks = await import(pathToFileURL(join(outDir, "twilio", "webhooks.js")));
  const serverClient = await import(
    pathToFileURL(join(outDir, "twilio", "serverClient.js")),
  );
  const foundation = await import(pathToFileURL(join(outDir, "twilio", "foundation.js")));

  equal(
    webhooks.normalizeTwilioPhoneNumber("(602) 555-0101"),
    "+16025550101",
    "US phone numbers normalize to E.164",
  );
  equal(
    webhooks.normalizeTwilioPhoneNumber("+52 55 1234 5678"),
    "+525512345678",
    "International E.164 phone numbers retain country code",
  );
  equal(
    webhooks.normalizeTwilioPhoneNumber("not-a-phone"),
    null,
    "Malformed phone numbers fail closed",
  );
  equal(
    webhooks.normalizeTwilioPhoneNumber("++12025550101"),
    null,
    "Repeated plus signs fail closed",
  );
  equal(
    webhooks.normalizeTwilioPhoneNumber("202+5550101"),
    null,
    "A plus sign outside the leading position fails closed",
  );
  equal(
    webhooks.normalizeTwilioPhoneNumber("+0123456789"),
    null,
    "Explicit international numbers cannot start with zero",
  );
  equal(
    webhooks.normalizeTwilioPhoneNumber("+4420718387"),
    "+4420718387",
    "Explicit international numbers are preserved instead of being reinterpreted as US numbers",
  );
  equal(
    webhooks.normalizeTwilioSmsDeliveryStatus("undelivered"),
    "undelivered",
    "SMS delivery status preserves undelivered",
  );
  equal(
    webhooks.normalizeTwilioCallStatus("no-answer"),
    "missed",
    "No-answer calls become missed follow-ups",
  );

  const routes = foundation.twilioBusinessNumberRouteTemplates;
  equal(routes.length, 3, "Twilio routing templates cover the three declared lines");
  check(routes.some((route) => route.key === "weathertech-phoenix"), "Phoenix route exists");
  check(routes.some((route) => route.key === "weathertech-tucson"), "Tucson route exists");
  check(routes.some((route) => route.key === "ihc-primary"), "IHC route exists");
  for (const route of routes) {
    check(
      foundation.matchesTwilioBusinessRouteTemplate(
        {
          routing_key: route.key,
          business_location: route.businessLocation,
          team_queue: route.teamQueue,
          lead_source: route.leadSource,
          communication_channel: "sms_voice",
          time_zone: route.timeZone,
        },
        route,
        "voice",
      ),
      `${route.key} accepts voice only through its exact sms_voice identity`,
    );
  }

  const authToken = "test-only-auth-token";
  const accountSid = "AC11111111111111111111111111111111";
  const publicBaseUrl = "https://weathertech.example.test";
  const canonicalUrl = `${publicBaseUrl}/api/integrations/twilio/webhook`;
  const requestUrl = "http://127.0.0.1:3000/api/integrations/twilio/webhook";
  const params = inboundParams();
  process.env.TWILIO_AUTH_TOKEN = authToken;
  process.env.TWILIO_ACCOUNT_SID = accountSid;
  process.env.TWILIO_MESSAGING_SERVICE_SID =
    "MG11111111111111111111111111111111";
  process.env.TWILIO_PUBLIC_BASE_URL = publicBaseUrl;
  process.env.TWILIO_INBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";

  const canonicalSignature = signTwilioForm(authToken, canonicalUrl, params);
  const validParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      params,
      signature: canonicalSignature,
      forwardedHost: "attacker.invalid",
      forwardedProto: "http",
    }),
    "sms_inbound",
  );
  equal(validParsed.signatureStatus, "valid", "Canonical configured URL validates");
  equal(validParsed.payload.accountSid, accountSid, "Signed account identity is preserved");
  equal(
    validParsed.payload.messageSid,
    params.get("MessageSid"),
    "Equivalent official Twilio MessageSid aliases resolve to one identity",
  );
  equal(validParsed.payload.body, params.get("Body"), "Signed message body is preserved");
  const reversedParams = new URLSearchParams(Array.from(params.entries()).reverse());
  const reversedParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      params: reversedParams,
      signature: signTwilioForm(authToken, canonicalUrl, reversedParams),
    }),
    "sms_inbound",
  );
  equal(reversedParsed.signatureStatus, "valid", "Reordered equivalent form remains valid");
  equal(
    reversedParsed.signatureEvidence,
    validParsed.signatureEvidence,
    "Equivalent signed form order produces the same canonical evidence",
  );

  const requestHostSignature = signTwilioForm(authToken, requestUrl, params);
  const untrustedHostParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({ requestUrl, params, signature: requestHostSignature }),
    "sms_inbound",
  );
  equal(
    untrustedHostParsed.signatureStatus,
    "invalid",
    "Request and forwarded hosts cannot replace the configured canonical URL",
  );

  const invalidParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({ requestUrl, params, signature: "invalid-signature" }),
    "sms_inbound",
  );
  equal(invalidParsed.signatureStatus, "invalid", "Invalid signatures fail closed");

  const tamperedParams = new URLSearchParams(params);
  tamperedParams.set("Body", "tampered after signing");
  const tamperedParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({ requestUrl, params: tamperedParams, signature: canonicalSignature }),
    "sms_inbound",
  );
  equal(tamperedParsed.signatureStatus, "invalid", "Tampered payloads fail signature validation");

  const missingSignature = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({ requestUrl, params }),
    "sms_inbound",
  );
  equal(missingSignature.signatureStatus, "missing_signature", "Missing signature fails closed");

  delete process.env.TWILIO_AUTH_TOKEN;
  const missingToken = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({ requestUrl, params, signature: canonicalSignature }),
    "sms_inbound",
  );
  equal(missingToken.signatureStatus, "missing_auth_token", "Missing server token fails closed");
  process.env.TWILIO_AUTH_TOKEN = authToken;

  delete process.env.TWILIO_PUBLIC_BASE_URL;
  const missingPublicUrl = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({ requestUrl, params, signature: canonicalSignature }),
    "sms_inbound",
  );
  equal(
    missingPublicUrl.signatureStatus,
    "missing_public_base_url",
    "Missing canonical public URL fails closed",
  );
  process.env.TWILIO_PUBLIC_BASE_URL = publicBaseUrl;

  const unsupportedJson = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      contentType: "application/json",
      signature: canonicalSignature,
      rawBody: JSON.stringify(Object.fromEntries(params)),
    }),
    "sms_inbound",
  );
  equal(
    unsupportedJson.signatureStatus,
    "unsupported_content_type",
    "JSON webhooks are rejected",
  );
  const unsupportedText = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      contentType: "text/plain",
      signature: canonicalSignature,
      rawBody: params.toString(),
    }),
    "sms_inbound",
  );
  equal(
    unsupportedText.signatureStatus,
    "unsupported_content_type",
    "Non-form webhook payloads are rejected",
  );
  const duplicateIdentity = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      signature: canonicalSignature,
      rawBody: `${params.toString()}&AccountSid=AC99999999999999999999999999999999`,
    }),
    "sms_inbound",
  );
  equal(
    duplicateIdentity.signatureStatus,
    "malformed_request",
    "Duplicate security-critical form fields are rejected as ambiguous",
  );
  const conflictingSidAliases = new URLSearchParams(params);
  conflictingSidAliases.set("SmsSid", "SM99999999999999999999999999999999");
  const conflictingAliasParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      params: conflictingSidAliases,
      signature: signTwilioForm(authToken, canonicalUrl, conflictingSidAliases),
    }),
    "sms_inbound",
  );
  equal(
    conflictingAliasParsed.signatureStatus,
    "malformed_request",
    "Conflicting Twilio MessageSid aliases fail closed",
  );
  const oversizedBody = `AccountSid=${accountSid}&${"padding=x&".repeat(250_000)}`;
  const oversized = await webhooks.parseTwilioWebhookRequest(
    createFormRequest({
      requestUrl,
      contentType: "application/x-www-form-urlencoded",
      signature: canonicalSignature,
      rawBody: oversizedBody,
    }),
    "sms_inbound",
  );
  equal(oversized.signatureStatus, "payload_too_large", "Oversized webhook payload fails closed");

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("No database or provider request is allowed before preflight passes.");
  };

  const oversizedResponse = await withoutConsole(() =>
    webhooks.handleTwilioWebhook(
      createFormRequest({
        requestUrl,
        contentType: "application/x-www-form-urlencoded",
        signature: canonicalSignature,
        rawBody: oversizedBody,
      }),
      "sms_inbound",
    ),
  );
  equal(oversizedResponse.result.status, 413, "Oversized webhook returns HTTP 413");
  equal(fetchCalls, 0, "Oversized webhook performs no database/provider network call");

  const disabledResponse = await withoutConsole(() =>
    webhooks.handleTwilioWebhook(
      createFormRequest({ requestUrl, params, signature: canonicalSignature }),
      "sms_inbound",
    ),
  );
  equal(disabledResponse.result.status, 503, "Disabled inbound gate is retryable and fail closed");
  equal(fetchCalls, 0, "Disabled inbound gate performs no database/provider network call");

  process.env.TWILIO_INBOUND_SMS_ENABLED = "true";
  const wrongAccountParams = inboundParams({
    AccountSid: "AC99999999999999999999999999999999",
  });
  const wrongAccountResponse = await withoutConsole(() =>
    webhooks.handleTwilioWebhook(
      createFormRequest({
        requestUrl,
        params: wrongAccountParams,
        signature: signTwilioForm(authToken, canonicalUrl, wrongAccountParams),
      }),
      "sms_inbound",
    ),
  );
  equal(wrongAccountResponse.result.status, 403, "Wrong Twilio account is rejected");
  equal(fetchCalls, 0, "Wrong-account webhook performs no database/provider network call");

  const missingMessageSid = inboundParams({
    MessageSid: "",
    SmsSid: "",
    SmsMessageSid: "",
  });
  const malformedResponse = await withoutConsole(() =>
    webhooks.handleTwilioWebhook(
      createFormRequest({
        requestUrl,
        params: missingMessageSid,
        signature: signTwilioForm(authToken, canonicalUrl, missingMessageSid),
      }),
      "sms_inbound",
    ),
  );
  equal(malformedResponse.result.status, 400, "Missing required payload identity is rejected");
  equal(fetchCalls, 0, "Malformed webhook performs no database/provider network call");

  const malformedPhone = inboundParams({ From: "invalid-phone" });
  const malformedPhoneResponse = await withoutConsole(() =>
    webhooks.handleTwilioWebhook(
      createFormRequest({
        requestUrl,
        params: malformedPhone,
        signature: signTwilioForm(authToken, canonicalUrl, malformedPhone),
      }),
      "sms_inbound",
    ),
  );
  equal(malformedPhoneResponse.result.status, 400, "Malformed sender phone is rejected");
  equal(fetchCalls, 0, "Malformed phone performs no database/provider network call");

  const inboundMms = inboundParams({
    MessageSid: "MM11111111111111111111111111111111",
    SmsSid: "MM11111111111111111111111111111111",
    SmsMessageSid: "MM11111111111111111111111111111111",
    NumMedia: "1",
    MediaUrl0: "https://api.twilio.example.test/media/ME11111111111111111111111111111111",
  });
  const inboundMmsResponse = await withoutConsole(() =>
    webhooks.handleTwilioWebhook(
      createFormRequest({
        requestUrl,
        params: inboundMms,
        signature: signTwilioForm(authToken, canonicalUrl, inboundMms),
      }),
      "sms_inbound",
    ),
  );
  equal(inboundMmsResponse.result.status, 400, "MMS is rejected during the inbound-SMS-only phase");
  equal(fetchCalls, 0, "Rejected MMS performs no database/provider network call");

  const contactFixtures = {
    customers: [
      { id: "customer-wt", companyId: "weathertech", phone: "+14805550101" },
      { id: "customer-ihc", companyId: "ihc", phone: "+14805550101" },
    ],
    leads: [{ id: "lead-wt", companyId: "weathertech", phone: "+14805550102" }],
  };
  deepEqual(
    resolveContactContract({
      companyId: "weathertech",
      sender: "(480) 555-0101",
      ...contactFixtures,
    }),
    { status: "matched_customer", customerId: "customer-wt", leadId: null },
    "Exact customer match stays within the routed company",
  );
  deepEqual(
    resolveContactContract({
      companyId: "weathertech",
      sender: "+14805550102",
      ...contactFixtures,
    }),
    { status: "matched_lead", customerId: null, leadId: "lead-wt" },
    "Exact lead match is deterministic",
  );
  deepEqual(
    resolveContactContract({
      companyId: "weathertech",
      sender: "+14805550999",
      ...contactFixtures,
    }),
    { status: "unmatched", customerId: null, leadId: null },
    "Unknown sender remains unlinked instead of creating a CRM record",
  );
  deepEqual(
    resolveContactContract({
      companyId: "weathertech",
      sender: "+14805550101",
      customers: [
        ...contactFixtures.customers,
        { id: "customer-wt-duplicate", companyId: "weathertech", phone: "4805550101" },
      ],
      leads: contactFixtures.leads,
    }),
    { status: "ambiguous", customerId: null, leadId: null },
    "Ambiguous sender is preserved unlinked",
  );
  deepEqual(
    resolveContactContract({
      companyId: "weathertech",
      sender: "+14805550101",
      customers: [{ id: "customer-ihc", companyId: "ihc", phone: "+14805550101" }],
      leads: [],
    }),
    { status: "unmatched", customerId: null, leadId: null },
    "IHC contact cannot be linked to a WeatherTech-routed message",
  );

  const idempotencyState = { messages: new Map(), events: new Map() };
  const claimPayload = {
    accountSid,
    messageSid: params.get("MessageSid"),
    from: params.get("From"),
    to: params.get("To"),
    body: params.get("Body"),
    companyId: "weathertech",
  };
  const firstClaim = claimInboundContract(idempotencyState, claimPayload);
  const duplicateClaim = claimInboundContract(idempotencyState, claimPayload);
  equal(firstClaim.status, "stored", "First delivery is stored");
  equal(duplicateClaim.status, "duplicate", "Exact retry is idempotent");
  equal(duplicateClaim.messageId, firstClaim.messageId, "Duplicate resolves to original message");
  equal(idempotencyState.messages.size, 1, "Exact retry cannot create a second message");
  equal(
    claimInboundContract(idempotencyState, { ...claimPayload, body: "conflicting body" }).status,
    "conflict",
    "Same MessageSid with conflicting signed identity fails closed",
  );
  equal(
    claimInboundContract(idempotencyState, { ...claimPayload, companyId: "ihc" }).status,
    "conflict",
    "Same MessageSid cannot be replayed into another company",
  );
  const failedEvent = persistProviderEventContract(
    idempotencyState,
    firstClaim.messageId,
    claimPayload.messageSid,
    true,
  );
  equal(failedEvent.status, "retryable_failure", "Provider-event failure remains retryable");
  equal(idempotencyState.events.size, 0, "Failed provider event cannot be reported as persisted");
  const retriedMessage = claimInboundContract(idempotencyState, claimPayload);
  const retriedEvent = persistProviderEventContract(
    idempotencyState,
    retriedMessage.messageId,
    claimPayload.messageSid,
  );
  equal(retriedMessage.status, "duplicate", "Retry converges on the original message claim");
  equal(retriedEvent.status, "stored", "Retry completes the missing provider ledger event");
  equal(idempotencyState.messages.size, 1, "Retry convergence retains one communication row");
  equal(idempotencyState.events.size, 1, "Retry convergence retains one provider event row");
  equal(
    persistProviderEventContract(
      idempotencyState,
      retriedMessage.messageId,
      claimPayload.messageSid,
    ).status,
    "duplicate",
    "Repeated provider-event delivery is idempotent",
  );
  const concurrentState = { messages: new Map(), events: new Map() };
  const concurrentClaims = await Promise.all(
    Array.from({ length: 16 }, () =>
      Promise.resolve().then(() => claimInboundContract(concurrentState, claimPayload)),
    ),
  );
  equal(
    concurrentClaims.filter((claim) => claim.status === "stored").length,
    1,
    "Concurrent delivery produces one winning message claim",
  );
  equal(
    concurrentClaims.filter((claim) => claim.status === "duplicate").length,
    15,
    "Concurrent retries converge as duplicates",
  );
  equal(concurrentState.messages.size, 1, "Concurrent delivery retains one message row");

  const config = serverClient.getTwilioConfigCheckResult();
  equal(config.inboundSmsEnabled, true, "Inbound gate is reported explicitly");
  equal(config.outboundReady, false, "Outbound readiness remains false in inbound-only phase");
  equal(config.outboundLocked, true, "Outbound is hard locked in inbound-only phase");
  check(
    config.credentials.authToken === "****",
    "Configuration response masks the Twilio authentication token",
  );
  equal(config.inboundWebhookUrl, canonicalUrl, "Readiness reports the canonical inbound URL");
  process.env.TWILIO_ACCOUNT_SID = accountSid.toLowerCase();
  equal(
    serverClient.getTwilioConfigCheckResult().ok,
    false,
    "Lowercase Twilio Account SID prefix cannot pass readiness",
  );
  process.env.TWILIO_ACCOUNT_SID = accountSid;
  process.env.TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID.toLowerCase();
  equal(
    serverClient.getTwilioConfigCheckResult().ok,
    false,
    "Lowercase Messaging Service SID prefix cannot pass readiness",
  );
  process.env.TWILIO_MESSAGING_SERVICE_SID = params.get("MessagingServiceSid");

  const evidenceFingerprint = webhooks.createTwilioInboundPayloadFingerprint({
    accountSid,
    messageSid: params.get("MessageSid"),
    messagingServiceSid: params.get("MessagingServiceSid"),
    from: params.get("From"),
    to: params.get("To"),
    body: params.get("Body"),
    companyId: "weathertech-company",
  });
  const evidenceInput = {
    messageId: "11111111-1111-5111-8111-111111111111",
    eventId: "22222222-2222-5222-8222-222222222222",
    companyId: "weathertech-company",
    connectionId: "weathertech-connection",
    businessPhoneNumberId: "weathertech-number",
    customerId: null,
    leadId: "weathertech-lead",
    accountSid,
    messagingServiceSid: params.get("MessagingServiceSid"),
    messageSid: params.get("MessageSid"),
    from: params.get("From"),
    to: params.get("To"),
    payloadFingerprint: evidenceFingerprint,
    signatureEvidence: validParsed.signatureEvidence,
  };
  const evidenceProof = webhooks.createTwilioInboundEvidenceProof(evidenceInput);
  check(/^[a-f0-9]{64}$/.test(evidenceProof), "Signed evidence proof is a server-only SHA-256 HMAC");
  equal(
    webhooks.createTwilioInboundEvidenceProof(evidenceInput),
    evidenceProof,
    "Identical signed evidence is deterministic",
  );
  check(
    webhooks.createTwilioInboundEvidenceProof({
      ...evidenceInput,
      payloadFingerprint: `${evidenceFingerprint.slice(0, -1)}0`,
    }) !== evidenceProof,
    "Payload tampering invalidates signed evidence",
  );
  check(
    webhooks.createTwilioInboundEvidenceProof({
      ...evidenceInput,
      companyId: "ihc-company",
    }) !== evidenceProof,
    "Company reassignment invalidates signed evidence",
  );

  fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Outbound Twilio network call must never occur.");
  };
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "true";
  const blockedSend = await serverClient.sendTwilioTestSms({
    recipient: "+14805550101",
    body: "must not send",
  });
  equal(blockedSend.attempted, false, "Outbound sender is unavailable in inbound-only phase");
  equal(blockedSend.sent, false, "Outbound SMS remains disabled even if env is mis-set true");
  equal(fetchCalls, 0, "Outbound sender never calls Twilio");

  const webhooksSource = fs.readFileSync(path.join(cwd, "lib/twilio/webhooks.ts"), "utf8");
  const serverClientSource = fs.readFileSync(
    path.join(cwd, "lib/twilio/serverClient.ts"),
    "utf8",
  );
  const inboundRouteSource = fs.readFileSync(
    path.join(cwd, "app/api/integrations/twilio/webhook/route.ts"),
    "utf8",
  );
  const configRouteSource = fs.readFileSync(
    path.join(cwd, "app/api/integrations/twilio/test/route.ts"),
    "utf8",
  );
  const readinessRouteSource = fs.readFileSync(
    path.join(cwd, "app/api/integrations/twilio/readiness/route.ts"),
    "utf8",
  );

  for (const [needle, message] of [
    ['from "twilio"', "Official Twilio SDK is imported for request validation"],
    ["validateRequest", "Official Twilio request validator is called"],
    ["getTwilioServerConfig", "Canonical public base URL uses the centralized server configuration"],
    ["TWILIO_INBOUND_SMS_ENABLED", "Inbound processing uses an explicit production gate"],
    ["provider_payload_fingerprint", "Stored messages carry a signed-payload fingerprint"],
    ["createTwilioInboundEvidenceProof", "Completed inbound evidence is bound by a server-only HMAC"],
    ["routing_status", "Inbound storage records routing disposition"],
    ['routing_status === "active"', "Only active business-number routes can receive inbound SMS"],
    ['status === "connected"', "Only connected Twilio provider connections can receive inbound SMS"],
    ["disabled_at", "Disabled provider connections fail closed"],
    ["provider_account_sid", "Business-number routing is bound to the verified account SID"],
    ["ambiguous", "Ambiguous contact matches are represented explicitly"],
    ["23505", "Concurrent duplicate claims converge through database uniqueness"],
  ]) {
    check(webhooksSource.includes(needle), message);
  }
  check(
    !webhooksSource.includes("processLeadIntake("),
    "Inbound SMS does not create leads as a side effect",
  );
  check(
    !webhooksSource.includes("normalizeTwilioSmsLeadBody("),
    "Message content is not used to infer the owning company",
  );
  check(
    !serverClientSource.includes("await fetch("),
    "Inbound-only Twilio server module has no outbound provider write",
  );
  check(inboundRouteSource.includes("export async function POST"), "Inbound route accepts POST");
  check(!inboundRouteSource.includes("export async function GET"), "Inbound route exposes no GET handler");
  for (const [source, needle, message] of [
    [configRouteSource, "sessionClient.auth.getUser()", "Configuration check requires a signed-in user"],
    [configRouteSource, '.eq("role", "owner")', "Configuration check requires owner membership"],
    [configRouteSource, "communicationsSent: false", "Configuration check reports no communication sent"],
    [configRouteSource, "createNoSendResponse(405)", "Configuration POST cannot trigger a send"],
    [readinessRouteSource, "sessionClient.auth.getUser()", "Readiness requires a signed-in user"],
    [readinessRouteSource, '.eq("role", "owner")', "Readiness requires owner membership"],
    [readinessRouteSource, '.in("company_id", ownerCompanyIds)', "Readiness database reads are owner-company bounded"],
    [readinessRouteSource, "const allExpectedNumbers", "Readiness checks cross-company configured-number collisions without exposing foreign routes"],
    [readinessRouteSource, "for (const expected of allExpectedNumbers)", "Readiness uses global configured-number counts like the webhook runtime"],
    [readinessRouteSource, "route.company_id === company.id", "Readiness proves route company identity"],
    [readinessRouteSource, "connection.company_id === company.id", "Readiness proves connection company identity"],
    [readinessRouteSource, "route.provider_account_sid === rawConfig.accountSid", "Readiness proves route account identity"],
    [readinessRouteSource, "outboundLockedInApplication: true", "Readiness reports the outbound application lock"],
    [readinessRouteSource, "createTwilioInboundEvidenceProof", "Readiness verifies signed server-path evidence"],
    [readinessRouteSource, 'ingestion_status === "complete"', "Readiness rejects partial message claims"],
    [readinessRouteSource, "communicationsSent: false", "Readiness performs no communication send"],
  ]) {
    check(source.includes(needle), message);
  }

  const serializedLogs = JSON.stringify([
    ...disabledResponse.entries,
    ...wrongAccountResponse.entries,
    ...malformedResponse.entries,
    ...malformedPhoneResponse.entries,
  ]);
  check(!serializedLogs.includes(authToken), "Webhook logs never expose the Twilio auth token");
  check(!serializedLogs.includes(params.get("Body")), "Webhook logs never expose message body text");
  check(!serializedLogs.includes(params.get("From")), "Webhook logs never expose full sender phone");

  console.log(
    `Twilio inbound communications security regression: PASS (${assertionCount} assertions)`,
  );
} finally {
  globalThis.fetch = originalFetch;
  restoreEnvironment(envSnapshot);
  rmSync(outDir, { recursive: true, force: true });
}
