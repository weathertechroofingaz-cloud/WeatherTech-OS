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
  businessLocation: "Phoenix" | "Tucson" | "IHC";
  teamQueue: string;
  leadSource: string;
  communicationChannel: "sms_voice";
  timeZone: "America/Phoenix";
  routingStatus: "configuration_required";
  phoneNumberConfigured: false;
};

export type TwilioWebhookEndpoint = {
  id: "inbound_sms" | "sms_status" | "voice" | "recording";
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
    communicationChannel: "sms_voice",
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
    businessLocation: "IHC",
    teamQueue: "ihc-painting",
    leadSource: "Phone - IHC",
    communicationChannel: "sms_voice",
    timeZone: "America/Phoenix",
    routingStatus: "configuration_required",
    phoneNumberConfigured: false,
  },
];

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
    summary: "Receives signed delivery updates such as queued, sent, delivered, failed, or undelivered.",
  },
  {
    id: "voice",
    label: "Voice webhook",
    path: "/api/integrations/twilio/voice",
    method: "POST",
    liveEnabled: false,
    summary: "Receives signed inbound call events and returns no call-routing TwiML yet.",
  },
  {
    id: "recording",
    label: "Recording callback",
    path: "/api/integrations/twilio/recording",
    method: "POST",
    liveEnabled: false,
    summary: "Receives signed recording metadata only; no recording files or transcripts are fabricated.",
  },
];

export const twilioInboundReadinessEndpoint =
  "/api/integrations/twilio/readiness";

export const twilioInboundGuardrails = [
  "Only a signed, form-encoded Twilio inbound webhook may persist an SMS.",
  "The receiving E.164 number, Twilio account, active connection, and company must match exactly.",
  "Provider MessageSid deduplication prevents duplicate inbox or CRM records.",
  "Unknown or ambiguous senders remain safely unmatched for owner review.",
  "Outbound SMS is locked in the application and remains disabled by production configuration.",
];

export const twilioLiveFoundationChecklist = [
  "Verify the existing Twilio schema and company-scoped security foundation.",
  "Map only each independently verified company-controlled number; leave every other company unconfigured.",
  "Verify Twilio account ownership, Auth Token signature validation, and the canonical HTTPS webhook URL.",
  "Configure the signed inbound SMS webhook URL in Twilio Console.",
  "Run one controlled live inbound test before marking the mapped number validated.",
  "Keep outbound SMS disabled until a separate owner-approved sprint.",
];
