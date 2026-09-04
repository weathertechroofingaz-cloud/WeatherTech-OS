export const goHighLevelReadinessEndpoint =
  "/api/integrations/gohighlevel/readiness";

export const goHighLevelSyncFoundationMigration =
  "0022_gohighlevel_sync_foundation.sql";

export const goHighLevelOAuthBridgeMigration =
  "0036_gohighlevel_oauth_communications_bridge.sql";

export const goHighLevelProductionBridgeMigration =
  "20260904140401_gohighlevel_bridge_observability_hardening.sql";

export const goHighLevelOAuthEndpoints = {
  start: "/api/integrations/gohighlevel/oauth/start",
  callback: "/api/oauth/marketplace/callback",
  sync: "/api/integrations/gohighlevel/sync",
  webhook: "/api/integrations/gohighlevel/webhook",
} as const;

export const goHighLevelOAuthScopes = [
  "locations.readonly",
  "contacts.readonly",
  "conversations.readonly",
  "conversations/message.readonly",
  "calendars.readonly",
  "calendars/events.readonly",
  "opportunities.readonly",
  // HighLevel exposes its documented Reviews read endpoints under Products.
  "products.readonly",
] as const;

export const goHighLevelOAuthRequiredEnvVars = [
  "GHL_CLIENT_ID",
  "GHL_CLIENT_SECRET",
  "GHL_REDIRECT_URI",
  "GHL_MARKETPLACE_INSTALL_URL",
  "GHL_TOKEN_ENCRYPTION_KEY",
] as const;

export type GoHighLevelLiveSyncStatus =
  | "not_connected"
  | "credentials_required"
  | "connected"
  | "validation_failed"
  | "ready_to_sync"
  | "sync_disabled"
  | "sync_error";

export const goHighLevelLiveSyncStatusLabels: Record<
  GoHighLevelLiveSyncStatus,
  string
> = {
  not_connected: "Not Connected",
  credentials_required: "Credentials Required",
  connected: "Connected",
  validation_failed: "Validation Failed",
  ready_to_sync: "Ready To Sync",
  sync_disabled: "Sync Disabled",
  sync_error: "Sync Error",
};

export type GoHighLevelSyncResourceKey =
  | "locations"
  | "contacts"
  | "conversations"
  | "messages"
  | "calendars"
  | "calendar_events"
  | "pipelines"
  | "opportunities"
  | "reviews";

export type GoHighLevelSyncResource = {
  key: GoHighLevelSyncResourceKey;
  label: string;
  localRecord: string;
  externalRecord: string;
  phaseOneMode: "metadata_only" | "content_and_metadata";
  direction: "two_way" | "weathertech_to_provider" | "provider_to_weathertech";
  description: string;
};

export const goHighLevelSyncResources: GoHighLevelSyncResource[] = [
  {
    key: "locations",
    label: "Locations",
    localRecord: "company integration mapping",
    externalRecord: "HighLevel sub-account",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Validates one exact HighLevel location for each WeatherTech OS company.",
  },
  {
    key: "contacts",
    label: "Contacts",
    localRecord: "company-scoped customer/lead match",
    externalRecord: "GoHighLevel contacts",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads bounded contact metadata for deterministic matching without creating or overwriting core CRM records.",
  },
  {
    key: "conversations",
    label: "Conversations",
    localRecord: "communications timeline",
    externalRecord: "HighLevel conversations",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads recent conversation state and identity without changing provider conversations.",
  },
  {
    key: "messages",
    label: "Messages and calls",
    localRecord: "communications timeline and AI context",
    externalRecord: "HighLevel conversation messages",
    phaseOneMode: "content_and_metadata",
    direction: "provider_to_weathertech",
    description:
      "Reads bounded message previews and call metadata for internal review; it cannot send or reply.",
  },
  {
    key: "calendars",
    label: "Calendars",
    localRecord: "calendar context",
    externalRecord: "HighLevel calendars",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads calendar definitions without creating or changing appointments.",
  },
  {
    key: "calendar_events",
    label: "Calendar events",
    localRecord: "schedule and AI context",
    externalRecord: "HighLevel appointments",
    phaseOneMode: "content_and_metadata",
    direction: "provider_to_weathertech",
    description:
      "Reads a bounded appointment window for operational context without rescheduling anything.",
  },
  {
    key: "pipelines",
    label: "Pipelines",
    localRecord: "sales pipeline context",
    externalRecord: "HighLevel pipelines",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads pipeline and stage definitions without changing provider stages.",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    localRecord: "sales and AI context",
    externalRecord: "HighLevel opportunities",
    phaseOneMode: "content_and_metadata",
    direction: "provider_to_weathertech",
    description:
      "Reads current opportunity status without moving stages or writing to HighLevel.",
  },
  {
    key: "reviews",
    label: "Reviews",
    localRecord: "reputation and AI context",
    externalRecord: "HighLevel reviews",
    phaseOneMode: "content_and_metadata",
    direction: "provider_to_weathertech",
    description:
      "Reads approved and pending review metadata for internal visibility without posting a response.",
  },
];

export const goHighLevelPhaseOneGuardrails = [
  "No outbound SMS, email, calls, workflows, campaigns, or automations are triggered.",
  "The production bridge has no provider-write method or customer-send scope.",
  "Sync mappings store external IDs and conflict state instead of overwriting records.",
  "Credentials stay server-side and are never stored in browser state.",
  "Sync logs store safe metadata and fingerprints, not raw secrets or full contact payloads.",
];

export const goHighLevelOAuthGuardrails = [
  "Marketplace OAuth tokens are encrypted and available only to server-side service operations.",
  "The approved scope set is read-only; WeatherTech OS cannot send messages or modify HighLevel pipelines.",
  "Every connected HighLevel location is mapped to exactly one WeatherTech OS company.",
  "Webhook signatures are verified before payload parsing or persistence.",
  "Provider IDs make sync and webhook retries idempotent without creating duplicate CRM records.",
];
