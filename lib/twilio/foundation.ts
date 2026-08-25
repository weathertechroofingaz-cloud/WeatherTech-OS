export type TwilioBusinessRouteKey =
  | "weathertech-phoenix"
  | "weathertech-tucson"
  | "ihc-primary";

export type TwilioLiveReadinessStatus =
  | "not_connected"
  | "backend_ready"
  | "configuration_required"
  | "credentials_required"
  | "migration_required"
  | "webhook_setup_required"
  | "ready_for_live_test"
  | "connected"
  | "error";

export type TwilioBusinessNumberRouteTemplate = {
  key: TwilioBusinessRouteKey;
  companyName: "WeatherTech Roofing LLC" | "IHC Painting";
  businessLocation: "Phoenix" | "Tucson" | "Scottsdale";
  teamQueue: string;
  leadSource: string;
  communicationChannel: "sms" | "sms_voice";
  timeZone: "America/Phoenix";
  routingStatus: "configuration_required";
  phoneNumberConfigured: false;
};

export type TwilioBusinessRouteIdentity = {
  routing_key: string | null;
  business_location: string | null;
  team_queue: string | null;
  lead_source: string | null;
  communication_channel: string | null;
  time_zone: string | null;
};

export type TwilioBusinessRouteCapability = "sms" | "voice";

export function normalizeTwilioPhoneNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !/^\+?[0-9().\s-]+$/.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0")
      ? `+${digits}`
      : null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return null;
}

export type TwilioWebhookEndpoint = {
  id: "inbound_sms" | "sms_status" | "voice" | "voice_status" | "recording";
  label: string;
  path: string;
  method: "POST";
  liveEnabled: false;
  summary: string;
};

export const twilioLiveReadinessLabels: Record<TwilioLiveReadinessStatus, string> = {
  not_connected: "Not Connected",
  backend_ready: "Backend Ready",
  configuration_required: "Configuration Required",
  credentials_required: "Credentials Required",
  migration_required: "Migration Required",
  webhook_setup_required: "Webhook Setup Required",
  ready_for_live_test: "Ready For Live Test",
  connected: "Connected",
  error: "Error",
};

export const twilioBusinessNumberRouteTemplates: TwilioBusinessNumberRouteTemplate[] = [
  {
    key: "weathertech-phoenix",
    companyName: "WeatherTech Roofing LLC",
    businessLocation: "Phoenix",
    teamQueue: "weathertech-roofing-phoenix",
    leadSource: "Phone - WeatherTech Phoenix",
    communicationChannel: "sms",
    timeZone: "America/Phoenix",
    routingStatus: "configuration_required",
    phoneNumberConfigured: false,
  },
  {
    key: "weathertech-tucson",
    companyName: "WeatherTech Roofing LLC",
    businessLocation: "Tucson",
    teamQueue: "weathertech-roofing-tucson",
    leadSource: "Phone - WeatherTech Tucson",
    communicationChannel: "sms_voice",
    timeZone: "America/Phoenix",
    routingStatus: "configuration_required",
    phoneNumberConfigured: false,
  },
  {
    key: "ihc-primary",
    companyName: "IHC Painting",
    businessLocation: "Scottsdale",
    teamQueue: "ihc-painting",
    leadSource: "Phone - IHC",
    communicationChannel: "sms",
    timeZone: "America/Phoenix",
    routingStatus: "configuration_required",
    phoneNumberConfigured: false,
  },
];

export function getTwilioBusinessNumberRouteTemplate(
  key: TwilioBusinessRouteKey,
) {
  return (
    twilioBusinessNumberRouteTemplates.find((route) => route.key === key) ??
    null
  );
}

export function matchesTwilioBusinessRouteTemplate(
  route: TwilioBusinessRouteIdentity | null | undefined,
  template: TwilioBusinessNumberRouteTemplate | null | undefined,
  capability: TwilioBusinessRouteCapability,
) {
  if (!route || !template) {
    return false;
  }

  const communicationChannelMatches =
    capability === "voice"
      ? template.key === "weathertech-tucson" &&
        route.communication_channel === "sms_voice"
      : template.communicationChannel === "sms_voice"
        ? route.communication_channel === "sms" ||
          route.communication_channel === "sms_voice"
        : route.communication_channel === template.communicationChannel;

  return (
    route.routing_key === template.key &&
    route.business_location === template.businessLocation &&
    route.team_queue === template.teamQueue &&
    route.lead_source === template.leadSource &&
    communicationChannelMatches &&
    route.time_zone === template.timeZone
  );
}

export const twilioWebhookEndpoints: TwilioWebhookEndpoint[] = [
  {
    id: "inbound_sms",
    label: "Inbound SMS webhook",
    path: "/api/integrations/twilio/webhook",
    method: "POST",
    liveEnabled: false,
    summary: "Receives signed inbound SMS payloads and stores them only after routing is verified.",
  },
  {
    id: "sms_status",
    label: "SMS status callback",
    path: "/api/integrations/twilio/status",
    method: "POST",
    liveEnabled: false,
    summary:
      "Disabled while outbound SMS is unavailable; it rejects callbacks and stores no delivery update.",
  },
  {
    id: "voice",
    label: "Tucson inbound voice webhook",
    path: "/api/integrations/twilio/voice",
    method: "POST",
    liveEnabled: false,
    summary:
      "Returns signed Tucson-only call-forwarding TwiML after the protected gate, exact route, destination, and loop checks pass.",
  },
  {
    id: "voice_status",
    label: "Tucson voice status callback",
    path: "/api/integrations/twilio/voice/status",
    method: "POST",
    liveEnabled: false,
    summary:
      "Stores bounded signed Tucson forwarding status evidence; it does not enable recording, transcription, or another business route.",
  },
  {
    id: "recording",
    label: "Recording callback",
    path: "/api/integrations/twilio/recording",
    method: "POST",
    liveEnabled: false,
    summary:
      "Disabled; it rejects callbacks and stores no recording metadata, file, or transcript.",
  },
];

export const twilioInboundReadinessEndpoint =
  "/api/integrations/twilio/readiness";

export const twilioInboundGuardrails = [
  "Only a signed, form-encoded Twilio inbound webhook may persist an SMS.",
  "The receiving E.164 number, Twilio account, active connection, and company must match exactly.",
  "Provider MessageSid deduplication prevents duplicate inbox or CRM records.",
  "Unknown or ambiguous senders remain safely unmatched for owner review.",
  "Only the exact Tucson sms_voice route may return forwarding TwiML, and the protected destination is never exposed to the browser.",
  "Phoenix and IHC voice, recording, transcription, auto-replies, and automatic lead creation remain disabled.",
  "Outbound SMS is locked in the application and remains disabled by production configuration.",
];

export const twilioLiveFoundationChecklist = [
  "Verify the existing Twilio schema and company-scoped security foundation.",
  "Map only each independently verified company-controlled number; leave every other company unconfigured.",
  "Verify Twilio account ownership, Auth Token signature validation, and the canonical HTTPS webhook URL.",
  "Configure the signed inbound SMS webhook URL in Twilio Console.",
  "Run one controlled live inbound test before marking the mapped number validated.",
  "Keep Tucson voice forwarding blocked until its protected destination, exact sms_voice route, and loop guard all pass readiness.",
  "Configure only the Tucson incoming Voice URL after readiness passes; never place a real test call without separate owner approval.",
  "Keep outbound SMS disabled until a separate owner-approved sprint.",
];
