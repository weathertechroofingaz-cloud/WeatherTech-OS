import type {
  CrmSnapshot,
  IntegrationConnectionRecord,
  IntegrationProvider,
  IntegrationSyncLogRecord,
} from "./types";

export type IntegrationCapability =
  | "sms"
  | "calling"
  | "email"
  | "calendar"
  | "reviews"
  | "website_leads"
  | "crm_sync"
  | "photos"
  | "documents"
  | "ai"
  | "webhooks";

export type IntegrationProviderId =
  | "twilio"
  | "gmail"
  | "google_calendar"
  | "google_business_profile"
  | "yelp"
  | "website_forms"
  | "gohighlevel"
  | "future_provider";

export type IntegrationProviderFamily = "communications" | "lead_intake" | "operations" | "automation" | "future";

export type IntegrationConnectionState = "connected" | "not_connected";
export type IntegrationReadinessState = "ready" | "requires_configuration" | "disabled";
export type IntegrationHealthState =
  | "healthy"
  | "needs_attention"
  | "configuration_required"
  | "disabled";
export type IntegrationConnectionWorkflowStatus =
  | "not_connected"
  | "ready_to_configure"
  | "connected"
  | "disabled"
  | "error";
export type IntegrationConnectionAction =
  | "connect"
  | "configure"
  | "disconnect"
  | "reconnect";
export type IntegrationConfigurationFieldKind =
  | "text"
  | "secret"
  | "url"
  | "oauth"
  | "webhook";
export type IntegrationCredentialValidationState =
  | "ready_for_server_validation"
  | "requires_configuration"
  | "blocked";

export type IntegrationConfigurationField = {
  id: string;
  label: string;
  description: string;
  required: boolean;
  sensitive: boolean;
  kind: IntegrationConfigurationFieldKind;
};

export type IntegrationCredentialValidationCheck = {
  id: string;
  label: string;
  description: string;
};

export type IntegrationCredentialValidationResult = IntegrationCredentialValidationCheck & {
  state: IntegrationCredentialValidationState;
  summary: string;
};

export type IntegrationOAuthReadiness = {
  enabled: boolean;
  label: string;
  callbackPath: string | null;
  scopes: string[];
  summary: string;
};

export type IntegrationProviderMetadata = {
  id: IntegrationProviderId;
  label: string;
  shortLabel: string;
  family: IntegrationProviderFamily;
  description: string;
  connectionProviders: IntegrationProvider[];
  capabilities: IntegrationCapability[];
  iconKey:
    | "phone"
    | "mail"
    | "calendar"
    | "reviews"
    | "website"
    | "automation"
    | "future";
  requiresCredentials: boolean;
  supportsOAuth: boolean;
  supportsWebhooks: boolean;
  configurationFields: IntegrationConfigurationField[];
  credentialValidationChecks: IntegrationCredentialValidationCheck[];
  oauthReadiness: IntegrationOAuthReadiness;
  connectionSteps: string[];
  disconnectSummary: string;
  reconnectSummary: string;
  summaryWhenDisconnected: string;
};

export type IntegrationSyncState = {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  retrying: number;
  skipped: number;
  relatedActivityCount: number;
  lastSyncAt: string | null;
  lastActivityAt: string | null;
};

export type IntegrationProviderReadiness = {
  metadata: IntegrationProviderMetadata;
  connectionState: IntegrationConnectionState;
  readinessState: IntegrationReadinessState;
  healthState: IntegrationHealthState;
  primaryConnection: IntegrationConnectionRecord | null;
  connections: IntegrationConnectionRecord[];
  syncState: IntegrationSyncState;
  connectionSummary: string;
  healthSummary: string;
};

export type IntegrationConnectionWorkflow = {
  provider: IntegrationProviderReadiness;
  status: IntegrationConnectionWorkflowStatus;
  statusSummary: string;
  availableActions: IntegrationConnectionAction[];
  validationResults: IntegrationCredentialValidationResult[];
  liveConnectivityEnabled: false;
};

export const integrationCapabilityLabels: Record<IntegrationCapability, string> = {
  sms: "SMS",
  calling: "Calling",
  email: "Email",
  calendar: "Calendar",
  reviews: "Reviews",
  website_leads: "Website leads",
  crm_sync: "CRM sync",
  photos: "Photos",
  documents: "Documents",
  ai: "AI",
  webhooks: "Webhooks",
};

export const integrationProviderRegistry: IntegrationProviderMetadata[] = [
  {
    id: "twilio",
    label: "Twilio",
    shortLabel: "Twilio",
    family: "communications",
    description: "Business SMS, future call activity, reminders, and customer communication events.",
    connectionProviders: ["twilio", "twilio_sms"],
    capabilities: ["sms", "calling", "webhooks", "crm_sync"],
    iconKey: "phone",
    requiresCredentials: true,
    supportsOAuth: false,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "account_sid",
        label: "Account SID",
        description: "Stored server-side only and used to identify the Twilio account.",
        required: true,
        sensitive: true,
        kind: "secret",
      },
      {
        id: "auth_token",
        label: "Auth token",
        description: "Stored server-side only for credential validation and approved messaging workflows.",
        required: true,
        sensitive: true,
        kind: "secret",
      },
      {
        id: "messaging_service",
        label: "Messaging service or phone number",
        description: "Routes future SMS traffic to the correct company-approved Twilio sender.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "webhook_signature",
        label: "Webhook signing validation",
        description: "Required before accepting inbound calls, SMS replies, or delivery callbacks.",
        required: true,
        sensitive: true,
        kind: "webhook",
      },
    ],
    credentialValidationChecks: [
      {
        id: "credentials",
        label: "Server credential check",
        description: "Validate the account SID and auth token from server-only storage.",
      },
      {
        id: "sender",
        label: "Sender ownership check",
        description: "Confirm the sender belongs to the approved WeatherTech/IHC Twilio account.",
      },
      {
        id: "webhook",
        label: "Webhook signature check",
        description: "Verify inbound webhook signatures before any message is trusted.",
      },
    ],
    oauthReadiness: {
      enabled: false,
      label: "API credential flow",
      callbackPath: null,
      scopes: [],
      summary: "Twilio uses server-side API credentials rather than OAuth in this architecture.",
    },
    connectionSteps: [
      "Collect server-only Twilio credentials from the approved business account.",
      "Validate credentials and sender ownership on the server.",
      "Configure signed inbound webhooks before accepting customer replies.",
      "Enable live SMS or call workflows only after owner approval.",
    ],
    disconnectSummary:
      "A future disconnect will pause Twilio sync and outbound messaging after live provider support exists.",
    reconnectSummary:
      "A future reconnect will revalidate credentials, sender ownership, and webhook signatures before syncing resumes.",
    summaryWhenDisconnected: "Add Twilio credentials later to enable live SMS/call ingestion and outbound controls.",
  },
  {
    id: "gmail",
    label: "Gmail",
    shortLabel: "Gmail",
    family: "communications",
    description: "Estimate, invoice, follow-up, and job-update email history and future sending workflows.",
    connectionProviders: ["gmail"],
    capabilities: ["email", "documents", "crm_sync"],
    iconKey: "mail",
    requiresCredentials: true,
    supportsOAuth: true,
    supportsWebhooks: false,
    configurationFields: [
      {
        id: "oauth_client",
        label: "OAuth client",
        description: "Google OAuth application approved for WeatherTech OS email access.",
        required: true,
        sensitive: true,
        kind: "oauth",
      },
      {
        id: "authorized_sender",
        label: "Authorized sender",
        description: "The Gmail mailbox that will be allowed to sync or send approved email.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "send_policy",
        label: "Send policy",
        description: "Owner-approved rules for draft, review, and send behavior.",
        required: true,
        sensitive: false,
        kind: "text",
      },
    ],
    credentialValidationChecks: [
      {
        id: "oauth_consent",
        label: "OAuth consent check",
        description: "Confirm consent screen, redirect URI, and account ownership before live access.",
      },
      {
        id: "scopes",
        label: "Scope check",
        description: "Verify only the minimum Gmail scopes required by approved workflows are requested.",
      },
      {
        id: "mailbox",
        label: "Mailbox access check",
        description: "Validate the connected mailbox without sending customer email.",
      },
    ],
    oauthReadiness: {
      enabled: true,
      label: "OAuth required",
      callbackPath: null,
      scopes: ["gmail.readonly", "gmail.send"],
      summary: "OAuth is required. The live callback route and consent screen must be configured before connection.",
    },
    connectionSteps: [
      "Register the Google OAuth app and approved redirect URI.",
      "Request only minimum Gmail scopes for the selected workflow.",
      "Validate mailbox access without sending customer email.",
      "Enable outbound email only after explicit owner approval.",
    ],
    disconnectSummary:
      "A future disconnect will revoke or pause Gmail access and stop mailbox sync and sending workflows.",
    reconnectSummary:
      "A future reconnect will refresh OAuth consent and revalidate mailbox access before syncing resumes.",
    summaryWhenDisconnected: "Connect Gmail OAuth later before enabling live send or mailbox sync.",
  },
  {
    id: "google_calendar",
    label: "Google Calendar",
    shortLabel: "Calendar",
    family: "operations",
    description: "Appointment scheduling, calendar sync, dispatch visibility, and field-service availability.",
    connectionProviders: ["google_calendar"],
    capabilities: ["calendar", "crm_sync", "webhooks"],
    iconKey: "calendar",
    requiresCredentials: true,
    supportsOAuth: true,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "oauth_client",
        label: "OAuth client",
        description: "Google OAuth application approved for calendar access.",
        required: true,
        sensitive: true,
        kind: "oauth",
      },
      {
        id: "calendar_id",
        label: "Default calendar",
        description: "Company calendar used for inspections, jobs, deliveries, and follow-ups.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "webhook_channel",
        label: "Calendar webhook channel",
        description: "Future push notification channel for two-way calendar updates.",
        required: false,
        sensitive: true,
        kind: "webhook",
      },
    ],
    credentialValidationChecks: [
      {
        id: "oauth_consent",
        label: "OAuth consent check",
        description: "Confirm redirect URI, refresh token storage, and calendar account ownership.",
      },
      {
        id: "calendar_access",
        label: "Calendar access check",
        description: "Validate read/write access to the selected company calendar.",
      },
      {
        id: "webhook",
        label: "Push sync check",
        description: "Confirm webhook channels can be renewed before enabling two-way sync.",
      },
    ],
    oauthReadiness: {
      enabled: true,
      label: "OAuth required",
      callbackPath: null,
      scopes: ["calendar.events"],
      summary: "OAuth and a server callback are required before live calendar sync is enabled.",
    },
    connectionSteps: [
      "Register the Google OAuth app and approved redirect URI.",
      "Select the company calendar for WeatherTech/IHC scheduling.",
      "Validate read/write calendar permissions without changing existing appointments.",
      "Enable two-way sync only after conflict handling is approved.",
    ],
    disconnectSummary:
      "A future disconnect will pause external calendar sync while preserving WeatherTech OS schedules.",
    reconnectSummary:
      "A future reconnect will refresh OAuth consent, validate the default calendar, and reconcile pending events.",
    summaryWhenDisconnected: "Connect Google Calendar OAuth later to sync scheduled inspections, jobs, and follow-ups.",
  },
  {
    id: "google_business_profile",
    label: "Google Business Profile",
    shortLabel: "GBP",
    family: "lead_intake",
    description: "Future review, message, and local-search lead activity for WeatherTech and IHC locations.",
    connectionProviders: [],
    capabilities: ["reviews", "website_leads", "crm_sync", "webhooks"],
    iconKey: "reviews",
    requiresCredentials: true,
    supportsOAuth: true,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "business_account",
        label: "Business account",
        description: "Approved Google Business Profile account for WeatherTech or IHC locations.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "location_mapping",
        label: "Location mapping",
        description: "Maps each Google location to the correct WeatherTech OS company.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "oauth_client",
        label: "OAuth client",
        description: "Google OAuth application approved for reviews, messages, and local-search activity.",
        required: true,
        sensitive: true,
        kind: "oauth",
      },
    ],
    credentialValidationChecks: [
      {
        id: "oauth_consent",
        label: "OAuth consent check",
        description: "Confirm the connected Google account can access the approved business profile.",
      },
      {
        id: "location_scope",
        label: "Location ownership check",
        description: "Verify every synced location maps to WeatherTech Roofing LLC or IHC.",
      },
      {
        id: "webhook",
        label: "Webhook readiness check",
        description: "Validate future review/message callbacks before accepting live activity.",
      },
    ],
    oauthReadiness: {
      enabled: true,
      label: "OAuth required",
      callbackPath: null,
      scopes: ["business.manage"],
      summary: "Google Business Profile requires OAuth and approved location mapping before live sync.",
    },
    connectionSteps: [
      "Approve the Google Business Profile account and owned locations.",
      "Map each location to WeatherTech Roofing LLC or IHC.",
      "Validate minimum OAuth scope and account access.",
      "Enable review/message sync after routing and response rules are approved.",
    ],
    disconnectSummary:
      "A future disconnect will pause review/message sync without deleting CRM history.",
    reconnectSummary:
      "A future reconnect will revalidate account ownership and company location mapping.",
    summaryWhenDisconnected: "Configuration is required before Google Business Profile reviews or messages can sync.",
  },
  {
    id: "yelp",
    label: "Yelp",
    shortLabel: "Yelp",
    family: "lead_intake",
    description: "Yelp lead intake, account routing, duplicate protection, and source attribution.",
    connectionProviders: ["yelp"],
    capabilities: ["website_leads", "reviews", "crm_sync", "webhooks"],
    iconKey: "reviews",
    requiresCredentials: false,
    supportsOAuth: false,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "account_mapping",
        label: "Yelp account mapping",
        description: "Maps each Yelp account, location, or city to the correct company.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "webhook_endpoint",
        label: "Webhook endpoint",
        description: "Production endpoint Yelp will post lead payloads to.",
        required: true,
        sensitive: false,
        kind: "webhook",
      },
      {
        id: "dedupe_key",
        label: "External lead ID",
        description: "Used with source/account metadata to prevent duplicate CRM leads.",
        required: true,
        sensitive: false,
        kind: "text",
      },
    ],
    credentialValidationChecks: [
      {
        id: "payload_schema",
        label: "Payload schema check",
        description: "Validate supported Yelp payload formats before creating CRM leads.",
      },
      {
        id: "company_routing",
        label: "Company routing check",
        description: "Confirm each Yelp account or city routes to WeatherTech Roofing LLC or IHC.",
      },
      {
        id: "dedupe",
        label: "Duplicate protection check",
        description: "Confirm external IDs and fingerprints prevent duplicate lead creation.",
      },
    ],
    oauthReadiness: {
      enabled: false,
      label: "Webhook intake",
      callbackPath: null,
      scopes: [],
      summary: "Yelp intake is webhook-based and does not use OAuth in the current architecture.",
    },
    connectionSteps: [
      "Confirm each Yelp account, city, or campaign has an approved company route.",
      "Configure Yelp to post lead payloads to the production webhook endpoint.",
      "Validate payload schema, dedupe key, and safe logging.",
      "Monitor intake logs before enabling any automated follow-up.",
    ],
    disconnectSummary:
      "A future disconnect will stop accepting live Yelp intake for that account while preserving existing leads.",
    reconnectSummary:
      "A future reconnect will revalidate account routing, dedupe, and retry behavior before intake resumes.",
    summaryWhenDisconnected: "WeatherTech OS can receive Yelp payloads, but no live Yelp account is connected yet.",
  },
  {
    id: "website_forms",
    label: "Website Lead Capture",
    shortLabel: "Website",
    family: "lead_intake",
    description: "Secure intake endpoint, source registry, campaign metadata, review routing, retries, and inbox visibility for WeatherTech and IHC website forms.",
    connectionProviders: ["website"],
    capabilities: ["website_leads", "crm_sync", "webhooks"],
    iconKey: "website",
    requiresCredentials: true,
    supportsOAuth: false,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "form_endpoint",
        label: "Form endpoint",
        description: "POST /api/leads/website accepts signed server-side form submissions and supports ?dryRun=1 for synthetic previews.",
        required: true,
        sensitive: false,
        kind: "webhook",
      },
      {
        id: "source_registry",
        label: "Website source registry",
        description: "Maps WeatherTech Phoenix, WeatherTech Tucson, and IHC form identifiers to the correct company, branch, campaign, and review queue.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "hmac_signature",
        label: "HMAC signature secret",
        description: "Server-only shared or per-source secret required before live website submissions are trusted.",
        required: true,
        sensitive: true,
        kind: "secret",
      },
      {
        id: "abuse_review",
        label: "Spam and review policy",
        description: "Honeypot, timestamp, size, duplicate replay, suspicious-link, and review-state controls before CRM lead creation.",
        required: true,
        sensitive: false,
        kind: "text",
      },
    ],
    credentialValidationChecks: [
      {
        id: "payload_schema",
        label: "Payload schema check",
        description: "Validate supported website form fields before creating CRM leads.",
      },
      {
        id: "company_routing",
        label: "Company routing check",
        description: "Confirm verified source IDs route to WeatherTech Phoenix, WeatherTech Tucson, or IHC without guessing unknown sources.",
      },
      {
        id: "signature",
        label: "Signed request check",
        description: "Validate HMAC timestamp and signature headers before accepting live production submissions.",
      },
      {
        id: "safe_logging",
        label: "Safe logging check",
        description: "Confirm intake logs preserve audit metadata without storing sensitive message bodies.",
      },
    ],
    oauthReadiness: {
      enabled: false,
      label: "Webhook intake",
      callbackPath: null,
      scopes: [],
      summary: "Website forms use signed server-to-server POST requests; OAuth is not required.",
    },
    connectionSteps: [
      "Keep the source registry aligned with WeatherTech Phoenix, WeatherTech Tucson, and IHC forms.",
      "Configure server-side HMAC secrets in hosting without exposing them to browser code.",
      "Add hidden sourceId or formIdentifier values to each production website form.",
      "Run dry-run previews, then signed live test submissions, before marking the provider connected.",
      "Monitor accepted, reviewed, rejected, duplicate, and retry outcomes before enabling automated follow-up.",
    ],
    disconnectSummary:
      "A future disconnect will stop accepting live form posts from a configured website source.",
    reconnectSummary:
      "A future reconnect will revalidate source routing, payload format, and dedupe before intake resumes.",
    summaryWhenDisconnected:
      "Source registry and endpoint are ready, but production websites are not connected until HMAC secrets and signed tests are configured.",
  },
  {
    id: "gohighlevel",
    label: "GoHighLevel",
    shortLabel: "GHL",
    family: "automation",
    description:
      "Secure live synchronization foundation for contacts, leads, opportunities, activity mirroring, and campaign-safe workflow handoff.",
    connectionProviders: ["gohighlevel"],
    capabilities: ["sms", "email", "calendar", "crm_sync", "ai", "webhooks"],
    iconKey: "automation",
    requiresCredentials: true,
    supportsOAuth: false,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "api_base",
        label: "API base URL",
        description: "Approved GoHighLevel API base for the business account.",
        required: true,
        sensitive: false,
        kind: "url",
      },
      {
        id: "private_token",
        label: "Private token",
        description: "Stored server-side only for approved sync workers and dry-run checks.",
        required: true,
        sensitive: true,
        kind: "secret",
      },
      {
        id: "location_id",
        label: "Location IDs",
        description:
          "Maps GoHighLevel sub-accounts to WeatherTech Roofing LLC and IHC without mixing records.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "sync_foundation_migration",
        label: "Sync mapping tables",
        description:
          "Stores external IDs, duplicate detection metadata, conflict state, retries, and last-sync timestamps.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "pipeline_mapping",
        label: "Pipeline and stage mapping",
        description:
          "Maps WeatherTech OS lead statuses to approved GoHighLevel pipelines and stages.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "webhook_secret",
        label: "Webhook signing secret",
        description: "Required before trusting inbound automation events.",
        required: true,
        sensitive: true,
        kind: "webhook",
      },
    ],
    credentialValidationChecks: [
      {
        id: "credentials",
        label: "Server credential check",
        description: "Validate the private token from server-only storage without triggering campaigns.",
      },
      {
        id: "location",
        label: "Location mapping check",
        description: "Confirm the GoHighLevel location maps to the correct WeatherTech OS company.",
      },
      {
        id: "account_metadata",
        label: "Account metadata check",
        description:
          "Read location metadata without creating contacts, opportunities, campaigns, or workflows.",
      },
      {
        id: "pipeline_discovery",
        label: "Pipeline discovery check",
        description:
          "Read available opportunity pipelines before mapping WeatherTech OS lead statuses.",
      },
      {
        id: "duplicate_conflict",
        label: "Duplicate and conflict check",
        description:
          "Confirm external IDs, fingerprints, and conflict states prevent unsafe overwrites.",
      },
      {
        id: "workflow_safety",
        label: "Automation safety check",
        description: "Confirm live workflows cannot send customer messages without owner approval.",
      },
    ],
    oauthReadiness: {
      enabled: false,
      label: "API credential flow",
      callbackPath: null,
      scopes: [],
      summary: "GoHighLevel uses server-side API credentials in the current architecture.",
    },
    connectionSteps: [
      "Collect server-only GoHighLevel credentials from the approved account.",
      "Apply the additive sync mapping migration before live workers are enabled.",
      "Validate the API base, token, location metadata, and pipeline discovery in read-only mode.",
      "Map contacts, leads, opportunities, notes, tags, and tasks by company.",
      "Confirm workflow safety before any outbound automation or campaign handoff is enabled.",
      "Enable sync workers only after account routing, duplicate handling, and owner approval are complete.",
    ],
    disconnectSummary:
      "A future disconnect will pause GoHighLevel sync and automation handoff without deleting CRM history.",
    reconnectSummary:
      "A future reconnect will rerun credential, location, and workflow-safety validation.",
    summaryWhenDisconnected:
      "Credentials Required before GoHighLevel validation or live sync workers can run.",
  },
  {
    id: "future_provider",
    label: "Future Providers",
    shortLabel: "Future",
    family: "future",
    description: "Registry slot for future photo, document, accounting, payment, AI, and operations integrations.",
    connectionProviders: [],
    capabilities: ["photos", "documents", "ai", "crm_sync", "webhooks"],
    iconKey: "future",
    requiresCredentials: true,
    supportsOAuth: true,
    supportsWebhooks: true,
    configurationFields: [
      {
        id: "provider_type",
        label: "Provider type",
        description: "Future approved category such as payments, accounting, documents, photos, or AI.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "credential_strategy",
        label: "Credential strategy",
        description: "Defines OAuth, API key, webhook, or server-to-server credential handling.",
        required: true,
        sensitive: false,
        kind: "text",
      },
      {
        id: "data_scope",
        label: "Data scope",
        description: "Minimum WeatherTech OS data the future provider is approved to access.",
        required: true,
        sensitive: false,
        kind: "text",
      },
    ],
    credentialValidationChecks: [
      {
        id: "security_review",
        label: "Security review",
        description: "Confirm credential storage, scopes, and webhook trust before adding a new provider.",
      },
      {
        id: "data_contract",
        label: "Data contract check",
        description: "Confirm the provider maps to existing WeatherTech OS records without schema drift.",
      },
      {
        id: "owner_approval",
        label: "Owner approval check",
        description: "Confirm business approval before live credentials, sync, or automation are enabled.",
      },
    ],
    oauthReadiness: {
      enabled: true,
      label: "Provider-specific",
      callbackPath: null,
      scopes: [],
      summary: "OAuth readiness depends on the future provider selected and is disabled until approved.",
    },
    connectionSteps: [
      "Approve the future provider and business workflow.",
      "Define the minimum data contract and credential strategy.",
      "Add provider-specific validation and test coverage.",
      "Enable live access only after security and owner approval.",
    ],
    disconnectSummary:
      "Future provider disconnect behavior will be defined with the approved provider contract.",
    reconnectSummary:
      "Future provider reconnect behavior will require provider-specific validation before sync resumes.",
    summaryWhenDisconnected: "Disabled until a future provider is approved for implementation.",
  },
];

function getLatestTimestamp(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function sourceTextMatches(value: string | null | undefined, terms: string[]) {
  const normalized = (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ");

  return terms.some((term) => normalized.includes(term));
}

function getProviderLogs(
  logs: IntegrationSyncLogRecord[],
  metadata: IntegrationProviderMetadata,
) {
  return logs.filter((log) => metadata.connectionProviders.includes(log.provider));
}

function getRelatedActivityCount(snapshot: CrmSnapshot, metadata: IntegrationProviderMetadata) {
  if (metadata.id === "twilio") {
    return snapshot.smsMessages.length;
  }

  if (metadata.id === "gmail") {
    return snapshot.emailMessages.length;
  }

  if (metadata.id === "google_calendar") {
    return snapshot.calendarEventSyncs.length + snapshot.scheduleEvents.length;
  }

  if (metadata.id === "website_forms") {
    return snapshot.leads.filter((lead) =>
      sourceTextMatches(`${lead.source}\n${lead.notes ?? ""}`, ["website", "webform", "web form"]),
    ).length;
  }

  if (metadata.id === "yelp") {
    return snapshot.leads.filter((lead) =>
      sourceTextMatches(`${lead.source}\n${lead.notes ?? ""}`, ["yelp"]),
    ).length;
  }

  if (metadata.id === "gohighlevel") {
    return snapshot.integrationSyncLogs.filter((log) => log.provider === "gohighlevel").length;
  }

  return 0;
}

function getRelatedActivityLatestAt(snapshot: CrmSnapshot, metadata: IntegrationProviderMetadata) {
  if (metadata.id === "twilio") {
    return getLatestTimestamp(snapshot.smsMessages.map((message) => message.updated_at));
  }

  if (metadata.id === "gmail") {
    return getLatestTimestamp(snapshot.emailMessages.map((message) => message.updated_at));
  }

  if (metadata.id === "google_calendar") {
    return getLatestTimestamp([
      ...snapshot.calendarEventSyncs.map((sync) => sync.updated_at),
      ...snapshot.scheduleEvents.map((event) => event.updated_at),
    ]);
  }

  if (metadata.id === "website_forms") {
    return getLatestTimestamp(
      snapshot.leads
        .filter((lead) =>
          sourceTextMatches(`${lead.source}\n${lead.notes ?? ""}`, ["website", "webform", "web form"]),
        )
        .map((lead) => lead.updated_at),
    );
  }

  if (metadata.id === "yelp") {
    return getLatestTimestamp(
      snapshot.leads
        .filter((lead) => sourceTextMatches(`${lead.source}\n${lead.notes ?? ""}`, ["yelp"]))
        .map((lead) => lead.updated_at),
    );
  }

  return null;
}

function buildSyncState(
  snapshot: CrmSnapshot,
  metadata: IntegrationProviderMetadata,
  connections: IntegrationConnectionRecord[],
): IntegrationSyncState {
  const logs = getProviderLogs(snapshot.integrationSyncLogs, metadata);
  const relatedActivityLatestAt = getRelatedActivityLatestAt(snapshot, metadata);
  const latestSyncAt = getLatestTimestamp([
    ...connections.map((connection) => connection.last_sync_at),
    ...logs.map((log) => log.completed_at ?? log.last_attempted_at ?? log.updated_at),
    ...(metadata.id === "google_calendar"
      ? snapshot.calendarEventSyncs.map((sync) => sync.last_synced_at ?? sync.updated_at)
      : []),
  ]);

  return {
    total: logs.length,
    queued: logs.filter((log) => log.status === "queued").length,
    running: logs.filter((log) => log.status === "running").length,
    succeeded: logs.filter((log) => log.status === "succeeded").length,
    failed: logs.filter((log) => log.status === "failed").length,
    retrying: logs.filter((log) => log.status === "retrying").length,
    skipped: logs.filter((log) => log.status === "skipped").length,
    relatedActivityCount: getRelatedActivityCount(snapshot, metadata),
    lastSyncAt: latestSyncAt,
    lastActivityAt: getLatestTimestamp([
      latestSyncAt,
      relatedActivityLatestAt,
      ...connections.map((connection) => connection.updated_at),
    ]),
  };
}

function getConnectionSummary(
  metadata: IntegrationProviderMetadata,
  connections: IntegrationConnectionRecord[],
  syncState: IntegrationSyncState,
) {
  const primaryConnection = connections[0];

  if (metadata.id === "future_provider") {
    return metadata.summaryWhenDisconnected;
  }

  if (!primaryConnection) {
    if (
      (metadata.id === "website_forms" || metadata.id === "yelp") &&
      (syncState.relatedActivityCount > 0 || syncState.total > 0)
    ) {
      return `${metadata.label} activity is being tracked, but no formal provider connection record exists.`;
    }

    return metadata.summaryWhenDisconnected;
  }

  if (primaryConnection.status === "paused") {
    return `${metadata.label} has a saved connection but is currently disabled.`;
  }

  if (primaryConnection.status === "needs_reauth") {
    return `${metadata.label} needs reauthorization before live sync can continue.`;
  }

  if (primaryConnection.status === "error") {
    return primaryConnection.last_error || `${metadata.label} reported an error.`;
  }

  return `${primaryConnection.display_name || metadata.label} is saved for ${connections.length} compan${
    connections.length === 1 ? "y" : "ies"
  }.`;
}

export function buildIntegrationCenterProviders(snapshot: CrmSnapshot) {
  return integrationProviderRegistry.map((metadata): IntegrationProviderReadiness => {
    const connections = snapshot.integrationConnections.filter((connection) =>
      metadata.connectionProviders.includes(connection.provider),
    );
    const primaryConnection = connections[0] ?? null;
    const syncState = buildSyncState(snapshot, metadata, connections);
    const hasProviderActivity = syncState.total > 0 || syncState.relatedActivityCount > 0;
    const hasProviderErrors =
      syncState.failed > 0 ||
      syncState.retrying > 0 ||
      connections.some((connection) => connection.status === "error");
    const hasDisabledConnection = connections.some((connection) => connection.status === "paused");
    const needsReauth = connections.some((connection) => connection.status === "needs_reauth");
    const connectionState: IntegrationConnectionState = connections.length
      ? "connected"
      : "not_connected";
    const readinessState: IntegrationReadinessState =
      metadata.id === "future_provider" || hasDisabledConnection
        ? "disabled"
          : primaryConnection?.status === "connected" ||
            (metadata.id === "yelp" && hasProviderActivity)
          ? "ready"
          : "requires_configuration";
    const healthState: IntegrationHealthState =
      readinessState === "disabled"
        ? "disabled"
        : hasProviderErrors || needsReauth
          ? "needs_attention"
          : readinessState === "ready"
            ? "healthy"
            : "configuration_required";

    return {
      metadata,
      connectionState,
      readinessState,
      healthState,
      primaryConnection,
      connections,
      syncState,
      connectionSummary: getConnectionSummary(metadata, connections, syncState),
      healthSummary:
        healthState === "healthy"
          ? "No sync errors detected."
          : healthState === "needs_attention"
            ? "Review errors, retries, or reauthorization requirements before enabling live workflows."
            : healthState === "disabled"
              ? "Disabled until explicitly configured."
              : "Provider credentials or account routing are required.",
    };
  });
}

export function integrationConnectionStateLabel(state: IntegrationConnectionState) {
  return state === "connected" ? "Connected" : "Not Connected";
}

export function integrationReadinessStateLabel(state: IntegrationReadinessState) {
  const labels: Record<IntegrationReadinessState, string> = {
    ready: "Ready",
    requires_configuration: "Requires Configuration",
    disabled: "Disabled",
  };

  return labels[state];
}

export function integrationHealthStateLabel(state: IntegrationHealthState) {
  const labels: Record<IntegrationHealthState, string> = {
    healthy: "Healthy",
    needs_attention: "Needs Attention",
    configuration_required: "Configuration Required",
    disabled: "Disabled",
  };

  return labels[state];
}

export function integrationConnectionWorkflowStatusLabel(
  state: IntegrationConnectionWorkflowStatus,
) {
  const labels: Record<IntegrationConnectionWorkflowStatus, string> = {
    not_connected: "Not Connected",
    ready_to_configure: "Ready To Configure",
    connected: "Connected",
    disabled: "Disabled",
    error: "Error",
  };

  return labels[state];
}

export function integrationConnectionActionLabel(action: IntegrationConnectionAction) {
  const labels: Record<IntegrationConnectionAction, string> = {
    connect: "Connection wizard",
    configure: "Configuration page",
    disconnect: "Disconnect flow",
    reconnect: "Reconnect flow",
  };

  return labels[action];
}

function getWorkflowStatus(provider: IntegrationProviderReadiness): IntegrationConnectionWorkflowStatus {
  if (provider.healthState === "needs_attention") {
    return "error";
  }

  if (provider.readinessState === "disabled") {
    return "disabled";
  }

  if (provider.connectionState === "connected") {
    return "connected";
  }

  if (provider.readinessState === "requires_configuration") {
    return "ready_to_configure";
  }

  return "not_connected";
}

function getWorkflowSummary(
  provider: IntegrationProviderReadiness,
  status: IntegrationConnectionWorkflowStatus,
) {
  if (status === "connected") {
    return `${provider.metadata.label} has a saved connection record. Live operations still depend on approved provider credentials and server validation.`;
  }

  if (status === "error") {
    return `${provider.metadata.label} needs attention before any live provider workflow can run.`;
  }

  if (status === "disabled") {
    return `${provider.metadata.label} is disabled until it is explicitly approved and configured.`;
  }

  if (status === "ready_to_configure") {
    return `${provider.metadata.label} has a configuration workflow ready, but no live account is connected.`;
  }

  return `${provider.metadata.label} is not connected.`;
}

function getAvailableActions(
  provider: IntegrationProviderReadiness,
  status: IntegrationConnectionWorkflowStatus,
): IntegrationConnectionAction[] {
  if (provider.metadata.id === "future_provider") {
    return ["configure"];
  }

  if (status === "connected" || status === "error") {
    return ["configure", "reconnect", "disconnect"];
  }

  if (status === "disabled") {
    return ["configure", "reconnect"];
  }

  return ["connect", "configure", "reconnect", "disconnect"];
}

function getValidationState(
  provider: IntegrationProviderReadiness,
): IntegrationCredentialValidationState {
  if (provider.readinessState === "disabled") {
    return "blocked";
  }

  if (provider.connectionState === "connected") {
    return "ready_for_server_validation";
  }

  return "requires_configuration";
}

export function integrationCredentialValidationStateLabel(
  state: IntegrationCredentialValidationState,
) {
  const labels: Record<IntegrationCredentialValidationState, string> = {
    ready_for_server_validation: "Ready For Server Validation",
    requires_configuration: "Requires Configuration",
    blocked: "Blocked",
  };

  return labels[state];
}

export function buildIntegrationConnectionWorkflow(
  provider: IntegrationProviderReadiness,
): IntegrationConnectionWorkflow {
  const status = getWorkflowStatus(provider);
  const validationState = getValidationState(provider);
  const validationSummary: Record<IntegrationCredentialValidationState, string> = {
    ready_for_server_validation:
      "A saved connection record exists. Live validation must run server-side before sync or outbound actions.",
    requires_configuration:
      "Configuration is required before server-side credential validation can run.",
    blocked:
      "Validation is blocked until this provider is enabled and approved for setup.",
  };

  return {
    provider,
    status,
    statusSummary: getWorkflowSummary(provider, status),
    availableActions: getAvailableActions(provider, status),
    validationResults: provider.metadata.credentialValidationChecks.map((check) => ({
      ...check,
      state: validationState,
      summary: validationSummary[validationState],
    })),
    liveConnectivityEnabled: false,
  };
}
