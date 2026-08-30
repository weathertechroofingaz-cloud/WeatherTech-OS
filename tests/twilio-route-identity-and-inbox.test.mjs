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
  "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
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
    ["tucsonVoice?.enabled", "Tucson Voice gate state is rendered"],
    ["destinationConfigured", "Destination configured state is rendered"],
    ["destinationValid", "Destination validity is rendered"],
    ["maskedDestination", "Only the masked destination is rendered"],
    ["loopDetected", "Loop guard state is rendered"],
    ["routeExact", "Exact Tucson voice route state is rendered"],
    ["tucsonVoice?.ready", "Tucson application readiness is rendered"],
    ["tucsonVoice?.webhookUrl", "Canonical voice webhook URL is rendered"],
    ["Exact next action", "Owner receives an explicit next action"],
    ["TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO", "Secure Tucson destination environment action is named"],
    ["TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED", "Protected Tucson Voice gate action is named"],
    ["do not place a real test call without separate owner approval", "Real test call remains owner-gated"],
    ["Tucson is the only Twilio voice route", "Tucson-only Voice policy is explicit"],
    ["Public voice for Phoenix and IHC remains", "Phoenix and IHC direct-carrier Voice is explicit"],
    ["Twilio ingresses stay SMS-only", "Phoenix and IHC Twilio ingress scope is explicit"],
    ["handling stays blank", "Phoenix and IHC Voice webhook state is explicit"],
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
  equal(tucsonTemplate.voiceHandling, "twilio_forwarding", "Tucson is the sole Twilio Voice route");
  equal(phoenixTemplate.voiceHandling, "direct_carrier", "Phoenix Voice stays with its carrier");
  equal(ihcTemplate.voiceHandling, "direct_carrier", "IHC Voice stays with its carrier");
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
      "sms",
    ),
    "Tucson inbound SMS remains exact while its reviewed route is sms_voice",
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
  const phoenixSmsVoiceDrift = {
    routing_key: "weathertech-phoenix",
    business_location: "Phoenix",
    team_queue: "weathertech-roofing-phoenix",
    lead_source: "Phone - WeatherTech Phoenix",
    communication_channel: "sms_voice",
    time_zone: "America/Phoenix",
  };
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      phoenixSmsVoiceDrift,
      phoenixTemplate,
      "sms",
    ),
    "Phoenix sms_voice database drift must fail SMS readiness until restored to sms",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      phoenixSmsVoiceDrift,
      phoenixTemplate,
      "voice",
    ),
    "Phoenix cannot become Voice-capable through sms_voice database drift",
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
  const ihcSmsVoiceDrift = {
    routing_key: "ihc-primary",
    business_location: "Scottsdale",
    team_queue: "ihc-painting",
    lead_source: "Phone - IHC",
    communication_channel: "sms_voice",
    time_zone: "America/Phoenix",
  };
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      ihcSmsVoiceDrift,
      ihcTemplate,
      "sms",
    ),
    "IHC sms_voice database drift must fail SMS readiness until restored to sms",
  );
  check(
    !foundation.matchesTwilioBusinessRouteTemplate(
      ihcSmsVoiceDrift,
      ihcTemplate,
      "voice",
    ),
    "IHC cannot become Voice-capable through sms_voice database drift",
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
  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";

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

  for (const [protectedIngress, label] of [
    ["+16025550101", "Phoenix"],
    ["+14805550101", "IHC"],
  ]) {
    process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO = protectedIngress;
    const ingressLoop = serverClient.getTwilioTucsonVoiceForwardingCheckResult({
      routeExact: true,
    });
    equal(ingressLoop.loopDetected, true, `${label} Twilio ingress remains a Tucson loop-protected node`);
    equal(ingressLoop.ready, false, `${label} Twilio ingress collision fails Tucson closed`);
  }

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
  const ihcCompany = {
    id: "ihc-company",
    name: "IHC Painting",
    short_name: "IHC",
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
  const sharedContactPhone = "+16025550999";
  const sharedContactEmail = "shared-contact@example.test";
  const weathertechSharedContact = {
    id: "weathertech-shared-contact",
    company_id: company.id,
    display_name: "WeatherTech Contact",
    contact_name: "WeatherTech Contact",
    phone: sharedContactPhone,
    email: sharedContactEmail,
    property_address: "WeatherTech test address",
    city: "Phoenix",
    state: "AZ",
    postal_code: "85001",
    customer_type: "residential",
    status: "active",
    notes: null,
    created_at: "2026-08-24T00:00:00.000Z",
    updated_at: "2026-08-24T00:00:00.000Z",
  };
  const ihcSharedContact = {
    ...weathertechSharedContact,
    id: "ihc-shared-contact",
    company_id: ihcCompany.id,
    display_name: "IHC Contact",
    contact_name: "IHC Contact",
    property_address: "IHC test address",
    city: "Scottsdale",
  };
  const ihcLeadIntake = {
    id: "ihc-shared-contact-intake",
    company_id: ihcCompany.id,
    linked_lead_id: null,
    linked_customer_id: null,
    related_communication_event_id: null,
    integration_sync_log_id: null,
    provider: "twilio_sms",
    provider_event_id: "SM55555555555555555555555555555555",
    source: "Twilio SMS",
    source_detail: "IHC hidden ingress",
    campaign: null,
    correlation_id: "ihc-shared-contact-correlation",
    company_key: "ihc_painting",
    branch_key: "scottsdale",
    routing_status: "matched",
    status: "new",
    duplicate_confidence: "exact",
    follow_up_state: "required",
    urgency: "normal",
    assigned_queue: "ihc-painting",
    assigned_user_id: null,
    first_name: "IHC",
    last_name: "Contact",
    contact_name: "IHC Contact",
    company_name: null,
    phone: sharedContactPhone,
    email: sharedContactEmail,
    service_address: "IHC test address",
    city: "Scottsdale",
    state: "AZ",
    postal_code: "85250",
    requested_service: "painting",
    message: "Company-safe contact matching test",
    preferred_contact_method: "sms",
    receiving_business_phone_number: ihcBusinessPhoneNumber.phone_number_e164,
    consent_metadata: {},
    source_metadata: {},
    safe_raw_source_reference: null,
    possible_matches: [],
    routing_reasons: [],
    review_notes: null,
    dismissed_at: null,
    dismissed_by: null,
    non_lead_reason: null,
    intake_timestamp: "2026-08-24T00:00:00.000Z",
    original_submission_timestamp: null,
    created_at: "2026-08-24T00:00:00.000Z",
    updated_at: "2026-08-24T00:00:00.000Z",
  };
  const companylessPhoneFallbackCall = {
    id: "companyless-phone-fallback-call",
    company_id: null,
    business_phone_number_id: null,
    integration_connection_id: null,
    customer_id: null,
    lead_id: null,
    job_id: null,
    provider: "twilio",
    provider_account_sid: null,
    provider_call_sid: "CA11111111111111111111111111111111",
    provider_parent_call_sid: null,
    direction: "inbound",
    call_status: "completed",
    from_phone: sharedContactPhone,
    to_phone: ihcBusinessPhoneNumber.phone_number_e164,
    business_phone: ihcBusinessPhoneNumber.phone_number_e164,
    customer_phone: sharedContactPhone,
    routing_status: "needs_review",
    started_at: "2026-08-24T00:00:00.000Z",
    answered_at: "2026-08-24T00:00:01.000Z",
    ended_at: "2026-08-24T00:01:00.000Z",
    duration_seconds: 59,
    recording_sid: null,
    recording_status: "not_requested",
    recording_duration_seconds: null,
    transcript_status: "not_requested",
    follow_up_required: false,
    correlation_id: "companyless-phone-fallback-correlation",
    metadata: {},
    created_at: "2026-08-24T00:00:00.000Z",
    updated_at: "2026-08-24T00:01:00.000Z",
  };
  const emptySnapshot = {
    leadIntakeRecords: [ihcLeadIntake],
    callRecords: [companylessPhoneFallbackCall],
    communicationProviderEvents: [],
    customers: [weathertechSharedContact, ihcSharedContact],
    documents: [],
    emailMessages: [],
    integrationSyncLogs: [],
    invoices: [],
    jobNotes: [],
    jobs: [],
    leadAccountability: [],
    leads: [],
    properties: [],
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
    new Map([
      [company.id, company],
      [ihcCompany.id, ihcCompany],
    ]),
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
  const ihcLeadIntakeInboxItem = smsInboxItems.find(
    (item) => item.id === "lead-intake-ihc-shared-contact-intake",
  );
  const companylessCallInboxItem = smsInboxItems.find(
    (item) => item.id === "call-companyless-phone-fallback-call",
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
  check(ihcLeadIntakeInboxItem, "IHC shared-contact intake item is present");
  equal(
    ihcLeadIntakeInboxItem.customerId,
    ihcSharedContact.id,
    "Fallback phone/email matching stays within the intake company",
  );
  equal(
    ihcLeadIntakeInboxItem.customerName,
    ihcSharedContact.display_name,
    "A same-contact WeatherTech customer cannot overwrite IHC identity",
  );
  check(companylessCallInboxItem, "Companyless phone-fallback call is present for review");
  equal(
    companylessCallInboxItem.businessPhoneNumberId,
    null,
    "A phone-only business-route match fails closed without company identity",
  );
  equal(
    companylessCallInboxItem.companyId,
    "",
    "A companyless call cannot inherit IHC company identity from phone alone",
  );
  check(
    !companylessCallInboxItem.sourceAccount?.includes("IHC") &&
      companylessCallInboxItem.assignedTo !== "ihc-painting",
    "A companyless call cannot inherit IHC route labeling or queue assignment",
  );

  const sharedConversationBase = {
    id: "weathertech-thread-item",
    companyId: company.id,
    customerId: null,
    leadId: null,
    phone: sharedContactPhone,
    email: sharedContactEmail,
  };
  check(
    communications.communicationItemsShareConversation(
      sharedConversationBase,
      { ...sharedConversationBase, id: "weathertech-thread-candidate" },
    ),
    "Same-company communications can group by shared phone/email",
  );
  check(
    !communications.communicationItemsShareConversation(
      sharedConversationBase,
      {
        ...sharedConversationBase,
        id: "ihc-thread-candidate",
        companyId: ihcCompany.id,
      },
    ),
    "Matching phone/email cannot merge WeatherTech and IHC histories",
  );
  check(
    !communications.communicationItemsShareConversation(
      { ...sharedConversationBase, customerId: "shared-customer-id" },
      {
        ...sharedConversationBase,
        id: "ihc-shared-customer-candidate",
        companyId: ihcCompany.id,
        customerId: "shared-customer-id",
      },
    ),
    "Even an inconsistent shared CRM ID cannot cross the company boundary",
  );
  check(
    !communications.communicationItemsShareConversation(
      sharedConversationBase,
      { ...sharedConversationBase, id: "companyless-candidate", companyId: "" },
    ),
    "Companyless communications cannot join a company-scoped conversation",
  );

  console.log(`Twilio route identity and inbox labeling: PASS (${assertionCount} assertions)`);
} finally {
  restoreEnvironment();
  rmSync(outDir, { recursive: true, force: true });
}
