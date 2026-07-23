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

export const twilioLiveFoundationChecklist = [
  "Apply the additive Twilio live integration migration.",
  "Add the WeatherTech Phoenix, WeatherTech Tucson, and IHC business phone number records.",
  "Verify Twilio account ownership, sender numbers, and messaging service configuration.",
  "Configure signed SMS, voice, status, and recording webhook URLs in Twilio Console.",
  "Run controlled live tests before enabling production SMS or calling workflows.",
];
