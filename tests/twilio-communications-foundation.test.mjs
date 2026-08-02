import { createHmac } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-twilio-foundation-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function createTwilioSignature(url, params, authToken) {
  const payload = `${url}${Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${value}`)
    .join("")}`;

  return createHmac("sha1", authToken).update(payload).digest("base64");
}

function createFormRequest(url, params, signature) {
  return new NextRequest(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: params.toString(),
  });
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/twilio/webhooks.ts",
      "lib/twilio/serverClient.ts",
      "lib/twilio/foundation.ts",
      "lib/crm/leadIntake.ts",
      "lib/crm/leadRouting.ts",
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
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Twilio foundation modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const webhooks = await import(pathToFileURL(join(outDir, "twilio", "webhooks.js")));
  const serverClient = await import(
    pathToFileURL(join(outDir, "twilio", "serverClient.js"))
  );
  const foundation = await import(pathToFileURL(join(outDir, "twilio", "foundation.js")));
  const leadRouting = await import(pathToFileURL(join(outDir, "crm", "leadRouting.js")));
  const leadIntake = await import(pathToFileURL(join(outDir, "crm", "leadIntake.js")));

  assertEqual(
    webhooks.normalizeTwilioPhoneNumber("(602) 555-0101"),
    "+16025550101",
    "US phone numbers normalize to E.164",
  );
  assertEqual(
    webhooks.normalizeTwilioPhoneNumber("+52 55 1234 5678"),
    "+525512345678",
    "International E.164 phone numbers retain country code",
  );
  assertEqual(
    webhooks.normalizeTwilioSmsDeliveryStatus("undelivered"),
    "undelivered",
    "SMS delivery status keeps undelivered state",
  );
  assertEqual(
    webhooks.normalizeTwilioCallStatus("no-answer"),
    "missed",
    "No-answer calls become missed-call follow-ups",
  );
  assertEqual(
    webhooks.normalizeTwilioCallStatus("busy"),
    "busy",
    "Busy calls remain distinct and follow-up eligible",
  );
  assertEqual(
    webhooks.getTwilioProviderEventSid({
      kind: "sms_status",
      accountSid: "AC_TEST",
      messageSid: "SM_TEST",
      callSid: null,
      parentCallSid: null,
      recordingSid: null,
      messagingServiceSid: "MG_TEST",
      from: "+16025550100",
      to: "+14805550100",
      body: null,
      messageStatus: "delivered",
      callStatus: null,
      recordingStatus: null,
      errorCode: null,
      errorMessage: null,
      durationSeconds: null,
      recordingDurationSeconds: null,
      occurredAt: "2026-07-27T00:00:00.000Z",
    }),
    "SM_TEST:delivered",
    "SMS status idempotency key includes status",
  );
  assertEqual(
    webhooks.getTwilioProviderEventSid({
      kind: "voice_status",
      accountSid: "AC_TEST",
      messageSid: null,
      callSid: "CA_TEST",
      parentCallSid: null,
      recordingSid: null,
      messagingServiceSid: null,
      from: "+14805550100",
      to: "+16025550100",
      body: null,
      messageStatus: null,
      callStatus: "completed",
      recordingStatus: null,
      errorCode: null,
      errorMessage: null,
      durationSeconds: 42,
      recordingDurationSeconds: null,
      occurredAt: "2026-07-27T00:00:00.000Z",
    }),
    "CA_TEST:completed",
    "Voice status idempotency key includes status",
  );

  const sms = leadRouting.normalizeTwilioSmsLeadIntake({
    messageSid: "SM_TEST_BODY",
    from: "+14805550100",
    to: "+16025550100",
    body: "Need exterior painting",
  });
  assertEqual(sms.companyKey, "ihc_painting", "SMS body can route painting inquiries to IHC");
  assertEqual(sms.requestedService, "painting", "SMS body infers painting service");

  const routedSms = leadIntake.normalizeTwilioSmsLeadBody({
    messageSid: "SM_TEST_ROUTE",
    from: "+14805550100",
    to: "+16025550100",
    body: "Need a roof repair estimate",
    verifiedCompanyKey: "weathertech_roofing",
    verifiedBranchKey: "weathertech_phoenix",
  });
  assert(routedSms.lead, "Twilio SMS lead body normalizes successfully");
  assertEqual(
    routedSms.lead.provider,
    "twilio_sms",
    "Twilio SMS uses the CRM lead-intake provider",
  );
  assertEqual(
    routedSms.lead.routingStatus,
    "ready_to_create",
    "Verified business number route can create a CRM lead",
  );

  const routes = foundation.twilioBusinessNumberRouteTemplates;
  assertEqual(routes.length, 3, "Twilio routing templates cover three business lines");
  assert(
    routes.some((route) => route.key === "weathertech-phoenix"),
    "WeatherTech Phoenix route exists",
  );
  assert(
    routes.some((route) => route.key === "weathertech-tucson"),
    "WeatherTech Tucson route exists",
  );
  assert(routes.some((route) => route.key === "ihc-primary"), "IHC route exists");

  const authToken = "test_auth_token";
  process.env.TWILIO_AUTH_TOKEN = authToken;
  const url = "https://app.example.test/api/integrations/twilio/webhook";
  const params = new URLSearchParams({
    AccountSid: "AC_TEST",
    MessageSid: "SM_VALID",
    From: "+14805550100",
    To: "+16025550100",
    Body: "Need a roof repair estimate",
  });
  const signature = createTwilioSignature(url, params, authToken);
  const validParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest(url, params, signature),
    "sms_inbound",
  );
  assertEqual(validParsed.signatureStatus, "valid", "Valid Twilio signature passes");
  const invalidParsed = await webhooks.parseTwilioWebhookRequest(
    createFormRequest(url, params, "invalid-signature"),
    "sms_inbound",
  );
  assertEqual(
    invalidParsed.signatureStatus,
    "invalid",
    "Invalid Twilio signature is rejected",
  );

  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const storageSkipped = await webhooks.storeTwilioWebhookPayload(validParsed.payload);
  if (originalSupabaseUrl === undefined) {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  } else {
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
  }
  if (originalServiceRoleKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
  }
  assertEqual(storageSkipped.stored, false, "Webhook storage skips without service role");
  assert(
    storageSkipped.skippedReason.includes("SUPABASE_SERVICE_ROLE_KEY"),
    "Skipped webhook storage explains missing service role",
  );

  process.env.TWILIO_ACCOUNT_SID = "AC_TEST";
  process.env.TWILIO_AUTH_TOKEN = "secret-auth-token";
  process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_TEST";
  process.env.TWILIO_FROM_NUMBER = "+16025550100";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  let fetchCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("Fetch must not be called while outbound SMS is disabled.");
  };
  const blockedSend = await serverClient.sendTwilioTestSms({
    recipient: "+14805550100",
  });
  globalThis.fetch = originalFetch;
  assertEqual(blockedSend.sent, false, "Outbound test SMS is blocked by default");
  assertEqual(fetchCalled, false, "Disabled outbound SMS does not call Twilio");

  console.log("Twilio communications foundation regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
