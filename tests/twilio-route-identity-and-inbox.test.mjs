import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-twilio-route-identity-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");
const envNames = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PUBLIC_BASE_URL",
  "TWILIO_INBOUND_SMS_ENABLED",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_NUMBER",
  "TWILIO_IHC_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
];
const envSnapshot = new Map(envNames.map((name) => [name, process.env[name]]));
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

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/twilio/foundation.ts",
      "lib/twilio/serverClient.ts",
      "lib/crm/communications.ts",
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
      `Could not compile Twilio route identity modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const foundation = await import(
    pathToFileURL(join(outDir, "twilio", "foundation.js"))
  );
  const serverClient = await import(
    pathToFileURL(join(outDir, "twilio", "serverClient.js"))
  );
  const communications = await import(
    pathToFileURL(join(outDir, "crm", "communications.js"))
  );
  const crmAppSource = readFileSync(join(cwd, "components", "CrmApp.tsx"), "utf8");
  const voiceEndpoint = foundation.twilioWebhookEndpoints.find(
    (endpoint) => endpoint.id === "voice",
  );
  const voiceStatusEndpoint = foundation.twilioWebhookEndpoints.find(
    (endpoint) => endpoint.id === "voice_status",
  );

  equal(
    voiceEndpoint.path,
    "/api/integrations/twilio/voice",
    "Foundation lists the canonical Tucson inbound voice webhook",
  );
  check(
    voiceEndpoint.summary.includes("Tucson-only call-forwarding TwiML"),
    "Voice endpoint truthfully describes guarded Tucson forwarding TwiML",
  );
  equal(
    voiceStatusEndpoint.path,
    "/api/integrations/twilio/voice/status",
    "Foundation lists the signed Tucson voice status callback",
  );
  check(
    !foundation.twilioWebhookEndpoints.some((endpoint) =>
      endpoint.summary.includes("returns no call-routing TwiML yet"),
    ),
    "Stale pre-forwarding endpoint copy is removed",
  );

  for (const [needle, message] of [
    ['data-testid="twilio-tucson-voice-readiness"', "Owner Tucson voice readiness panel exists"],
    ["tucsonVoice?.enabled", "Voice gate state is rendered"],
    ["destinationConfigured", "Destination configured state is rendered"],
    ["destinationValid", "Destination validity is rendered"],
    ["maskedDestination", "Only the masked destination is rendered"],
    ["loopDetected", "Loop guard state is rendered"],
    ["routeExact", "Exact Tucson voice route state is rendered"],
    ["tucsonVoice?.ready", "Tucson application readiness is rendered"],
    ["tucsonVoice?.webhookUrl", "Canonical voice webhook URL is rendered"],
    ["Exact next action", "Owner receives an explicit next action"],
    ["TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO", "Secure destination environment action is named"],
    ["TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED", "Protected voice gate action is named"],
    ["do not place a real test call without separate owner approval", "Real test call remains owner-gated"],
    ["Phoenix and IHC voice remain unavailable", "Phoenix and IHC voice stay explicitly unavailable"],
    ["Recording,", "Recording remains explicitly disabled"],
    ["transcription, outbound SMS, auto-replies", "Disallowed communications remain explicit"],
  ]) {
    check(crmAppSource.includes(needle), message);
  }
  check(
    !crmAppSource.includes("destinationE164"),
    "Client UI cannot reference the raw forwarding destination",
  );
  check(
    !crmAppSource.includes("Disabled / Not In Scope"),
    "Stale all-voice-disabled status is removed",
  );

  const tucsonTemplate = foundation.getTwilioBusinessNumberRouteTemplate(
    "weathertech-tucson",
  );
  const phoenixTemplate = foundation.getTwilioBusinessNumberRouteTemplate(
    "weathertech-phoenix",
  );
  const ihcTemplate = foundation.getTwilioBusinessNumberRouteTemplate("ihc-primary");
  equal(tucsonTemplate.businessLocation, "Tucson", "Tucson route has its exact branch");
  equal(phoenixTemplate.businessLocation, "Phoenix", "Phoenix route remains separate");
  equal(
    tucsonTemplate.communicationChannel,
    "sms_voice",
    "Only the approved Tucson template targets combined SMS and voice",
  );
  equal(
    phoenixTemplate.communicationChannel,
    "sms",
    "Phoenix template cannot imply voice availability",
  );
  equal(
    ihcTemplate.businessLocation,
    "Scottsdale",
    "IHC template matches the existing Scottsdale Production identity",
  );
  equal(
    ihcTemplate.communicationChannel,
    "sms",
    "IHC template cannot imply voice availability",
  );

  const tucsonSmsRoute = {
    routing_key: "weathertech-tucson",
    business_location: "Tucson",
    team_queue: "weathertech-roofing-tucson",
    lead_source: "Phone - WeatherTech Tucson",
    communication_channel: "sms",
    time_zone: "America/Phoenix",
  };
  check(
    foundation.matchesTwilioBusinessRouteTemplate(
      tucsonSmsRoute,
      tucsonTemplate,
      "sms",
    ),
    "Current Tucson SMS route remains exact for inbound SMS",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      tucsonSmsRoute,
      tucsonTemplate,
      "voice",
    ),
    "SMS-only Tucson metadata cannot report voice ready",
  );
  check(
    foundation.matchesTwilioBusinessRouteTemplate(
      { ...tucsonSmsRoute, communication_channel: "sms_voice" },
      tucsonTemplate,
      "voice",
    ),
    "Only the reviewed sms_voice Tucson route can report voice ready",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      { ...tucsonSmsRoute, routing_key: "weathertech-phoenix" },
      tucsonTemplate,
      "sms",
    ),
    "Phoenix routing identity cannot masquerade as Tucson",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      { ...tucsonSmsRoute, business_location: "Scottsdale" },
      tucsonTemplate,
      "sms",
    ),
    "IHC location identity cannot masquerade as Tucson",
  );
  check(
    foundation.matchesTwilioBusinessRouteTemplate(
      {
        routing_key: "weathertech-phoenix",
        business_location: "Phoenix",
        team_queue: "weathertech-roofing-phoenix",
        lead_source: "Phone - WeatherTech Phoenix",
        communication_channel: "sms",
        time_zone: "America/Phoenix",
      },
      phoenixTemplate,
      "sms",
    ),
    "Phoenix SMS remains bound to its own exact route identity",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      {
        routing_key: "weathertech-phoenix",
        business_location: "Phoenix",
        team_queue: "weathertech-roofing-phoenix",
        lead_source: "Phone - WeatherTech Phoenix",
        communication_channel: "sms_voice",
        time_zone: "America/Phoenix",
      },
      phoenixTemplate,
      "sms",
    ),
    "Phoenix cannot silently become voice-capable through sms_voice metadata",
  );
  check(
    foundation.matchesTwilioBusinessRouteTemplate(
      {
        routing_key: "ihc-primary",
        business_location: "Scottsdale",
        team_queue: "ihc-painting",
        lead_source: "Phone - IHC",
        communication_channel: "sms",
        time_zone: "America/Phoenix",
      },
      ihcTemplate,
      "sms",
    ),
    "IHC SMS remains bound to its separate Scottsdale route identity",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      {
        routing_key: "ihc-primary",
        business_location: "Scottsdale",
        team_queue: "ihc-painting",
        lead_source: "Phone - IHC",
        communication_channel: "sms_voice",
        time_zone: "America/Phoenix",
      },
      ihcTemplate,
      "sms",
    ),
    "IHC cannot silently become voice-capable through sms_voice metadata",
  );

  process.env.TWILIO_ACCOUNT_SID = "AC11111111111111111111111111111111";
  process.env.TWILIO_AUTH_TOKEN = "test-only-auth-token";
  process.env.TWILIO_MESSAGING_SERVICE_SID =
    "MG11111111111111111111111111111111";
  process.env.TWILIO_PUBLIC_BASE_URL = "https://weathertech.example.test";
  process.env.TWILIO_INBOUND_SMS_ENABLED = "true";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER = "+16025550101";
  process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER = "+15205550101";
  process.env.TWILIO_IHC_NUMBER = "+14805550101";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED = "true";
  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "+16235550101";

  const expectedNumbers = serverClient.getTwilioExpectedBusinessNumbers();
  equal(
    expectedNumbers.find((number) => number.routeKey === "weathertech-tucson")
      ?.teamQueue,
    "weathertech-roofing-tucson",
    "Configured Tucson number is bound to the exact Tucson queue template",
  );
  const validVoiceCheck = serverClient.getTwilioTucsonVoiceForwardingCheckResult({
    routeExact: true,
  });
  const validServerConfig = serverClient.getTwilioServerConfig();
  equal(
    validServerConfig.tucsonVoiceForwarding.tucsonNumberE164,
    "+15205550101",
    "Runtime config retains the strict Tucson receiving identity server-side",
  );
  equal(
    validServerConfig.tucsonVoiceForwarding.statusCallbackUrl,
    "https://weathertech.example.test/api/integrations/twilio/voice/status",
    "Runtime config builds the canonical signed voice status URL",
  );
  equal(
    validServerConfig.tucsonVoiceForwarding.configurationReady,
    true,
    "Runtime and readiness share one protected configuration result",
  );
  equal(validVoiceCheck.enabled, true, "Protected Tucson voice gate is explicit");
  equal(validVoiceCheck.destinationConfigured, true, "Destination presence is reported");
  equal(validVoiceCheck.destinationValid, true, "Valid E.164 destination is recognized");
  equal(validVoiceCheck.loopDetected, false, "Unrelated destination does not trigger loop guard");
  equal(validVoiceCheck.ready, true, "Exact route and valid protected config are ready");
  equal(
    validVoiceCheck.maskedDestination,
    "****0101",
    "Readiness masks the forwarding destination",
  );
  check(
    !JSON.stringify(validVoiceCheck).includes("+16235550101"),
    "Readiness never returns the forwarding destination",
  );
  assert.deepEqual(
    Object.keys(validVoiceCheck).sort(),
    [
      "destinationConfigured",
      "destinationValid",
      "enabled",
      "loopDetected",
      "maskedDestination",
      "ready",
      "routeExact",
      "webhookUrl",
    ],
    "Voice readiness exposes only the approved masked fields",
  );
  assertionCount += 1;

  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "+15205550101";
  const loopCheck = serverClient.getTwilioTucsonVoiceForwardingCheckResult({
    routeExact: true,
  });
  equal(loopCheck.loopDetected, true, "Forwarding back to Tucson is a loop");
  equal(loopCheck.ready, false, "A forwarding loop fails readiness closed");

  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "not-a-phone";
  const malformedCheck = serverClient.getTwilioTucsonVoiceForwardingCheckResult({
    routeExact: true,
  });
  equal(malformedCheck.destinationConfigured, true, "Malformed configured input is distinguished");
  equal(malformedCheck.destinationValid, false, "Malformed destination fails validation");
  equal(malformedCheck.maskedDestination, null, "Malformed destination is never echoed");
  equal(malformedCheck.ready, false, "Malformed destination fails readiness closed");

  process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = "520-555-0101";
  const formattedButNotStrictCheck =
    serverClient.getTwilioTucsonVoiceForwardingCheckResult({ routeExact: true });
  equal(
    formattedButNotStrictCheck.destinationConfigured,
    true,
    "A formatted destination is still recognized as present",
  );
  equal(
    formattedButNotStrictCheck.destinationValid,
    false,
    "Protected forwarding configuration requires strict E.164",
  );
  equal(
    formattedButNotStrictCheck.ready,
    false,
    "Readiness cannot turn green for a destination the runtime rejects",
  );

  const company = {
    id: "weathertech-company",
    name: "WeatherTech Roofing LLC",
    short_name: "WeatherTech",
  };
  const businessPhoneNumber = {
    id: "tucson-business-number",
    company_id: company.id,
    integration_connection_id: "weathertech-twilio-connection",
    provider: "twilio",
    provider_account_sid: null,
    messaging_service_sid: null,
    phone_number_e164: "+15205550101",
    display_name: "WeatherTech Tucson",
    routing_key: "weathertech-tucson",
    business_location: "Tucson",
    team_queue: "weathertech-roofing-tucson",
    lead_source: "Phone - WeatherTech Tucson",
    communication_channel: "sms_voice",
    time_zone: "America/Phoenix",
    routing_status: "active",
    settings: {},
    created_at: "2026-08-24T00:00:00.000Z",
    updated_at: "2026-08-24T00:00:00.000Z",
  };
  const ihcBusinessPhoneNumber = {
    ...businessPhoneNumber,
    id: "ihc-business-number",
    company_id: "ihc-company",
    phone_number_e164: "+14805550101",
    display_name: "IHC",
    routing_key: "ihc-primary",
    business_location: "Scottsdale",
    team_queue: "ihc-painting",
    lead_source: "Phone - IHC",
    communication_channel: "sms",
  };
  const inboundSms = {
    id: "tucson-sms",
    company_id: company.id,
    customer_id: null,
    lead_id: null,
    job_id: null,
    schedule_event_id: null,
    invoice_id: null,
    integration_connection_id: "weathertech-twilio-connection",
    provider: "twilio_sms",
    category: "general",
    status: "sent",
    business_phone_number_id: businessPhoneNumber.id,
    direction: "inbound",
    delivery_status: "received",
    to_phone: businessPhoneNumber.phone_number_e164,
    from_phone: "+15205550999",
    body: "Tucson inbound route label test",
    twilio_message_sid: "SM11111111111111111111111111111111",
    queued_at: null,
    sent_at: "2026-08-24T00:00:00.000Z",
    last_error: null,
    created_at: "2026-08-24T00:00:00.000Z",
    updated_at: "2026-08-24T00:00:00.000Z",
  };
  const fallbackInboundSms = {
    ...inboundSms,
    id: "tucson-sms-fallback",
    business_phone_number_id: null,
    body: "Tucson inbound route fallback label test",
    twilio_message_sid: "SM22222222222222222222222222222222",
  };
  const crossCompanyIdSms = {
    ...inboundSms,
    id: "cross-company-id-sms",
    business_phone_number_id: ihcBusinessPhoneNumber.id,
    to_phone: ihcBusinessPhoneNumber.phone_number_e164,
    body: "Cross-company route ID must not be trusted",
    twilio_message_sid: "SM33333333333333333333333333333333",
  };
  const crossCompanyPhoneSms = {
    ...crossCompanyIdSms,
    id: "cross-company-phone-sms",
    business_phone_number_id: null,
    body: "Cross-company phone fallback must not be trusted",
    twilio_message_sid: "SM44444444444444444444444444444444",
  };
  const emptySnapshot = {
    leadIntakeRecords: [],
    callRecords: [],
    communicationProviderEvents: [],
    customers: [],
    documents: [],
    emailMessages: [],
    integrationSyncLogs: [],
    invoices: [],
    jobNotes: [],
    jobs: [],
    leadAccountability: [],
    leads: [],
    scheduleEvents: [],
    calendarEventSyncs: [],
    businessPhoneNumbers: [businessPhoneNumber, ihcBusinessPhoneNumber],
    smsMessages: [
      inboundSms,
      fallbackInboundSms,
      crossCompanyIdSms,
      crossCompanyPhoneSms,
    ],
  };
  const smsInboxItems = communications.buildUnifiedInboxItems(
    emptySnapshot,
    new Map([[company.id, company]]),
  );
  const smsInboxItem = smsInboxItems.find((item) => item.id === "sms-tucson-sms");
  const fallbackSmsInboxItem = smsInboxItems.find(
    (item) => item.id === "sms-tucson-sms-fallback",
  );
  const crossCompanyIdInboxItem = smsInboxItems.find(
    (item) => item.id === "sms-cross-company-id-sms",
  );
  const crossCompanyPhoneInboxItem = smsInboxItems.find(
    (item) => item.id === "sms-cross-company-phone-sms",
  );
  check(smsInboxItem, "Primary Tucson SMS inbox item is present");
  check(fallbackSmsInboxItem, "Fallback Tucson SMS inbox item is present");
  equal(
    smsInboxItem.businessPhoneNumberId,
    businessPhoneNumber.id,
    "SMS inbox item retains the exact receiving business-number identity",
  );
  equal(
    smsInboxItem.businessLocation,
    "WeatherTech · Tucson",
    "SMS inbox visibly identifies the Tucson branch",
  );
  equal(
    smsInboxItem.sourceAccount,
    "WeatherTech Tucson · Tucson · weathertech-roofing-tucson",
    "SMS account/source visibly identifies the Tucson receiving route",
  );
  equal(
    smsInboxItem.assignedTo,
    "weathertech-roofing-tucson",
    "SMS inbox assigns the receiving Tucson queue",
  );
  check(
    smsInboxItem.sourceAccount !== inboundSms.from_phone,
    "Inbound sender cannot be mislabeled as the receiving business account",
  );
  equal(
    fallbackSmsInboxItem.businessPhoneNumberId,
    businessPhoneNumber.id,
    "Phone-number fallback carries the resolved Tucson route ID into the inbox item",
  );
  for (const [label, item] of [
    ["cross-company ID", crossCompanyIdInboxItem],
    ["cross-company phone fallback", crossCompanyPhoneInboxItem],
  ]) {
    check(item, `${label} SMS inbox item is present`);
    equal(
      item.businessPhoneNumberId,
      null,
      `${label} cannot attach a business-number identity from another company`,
    );
    check(
      !item.sourceAccount?.includes("IHC") && item.assignedTo !== "ihc-painting",
      `${label} cannot display or assign the IHC route to a WeatherTech message`,
    );
  }

  console.log(`Twilio route identity and inbox labeling: PASS (${assertionCount} assertions)`);
} finally {
  restoreEnvironment();
  rmSync(outDir, { recursive: true, force: true });
}
