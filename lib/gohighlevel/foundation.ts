export const goHighLevelReadinessEndpoint =
  "/api/integrations/gohighlevel/readiness";

export const goHighLevelSyncFoundationMigration =
  "0022_gohighlevel_sync_foundation.sql";

export const goHighLevelOAuthBridgeMigration =
  "0036_gohighlevel_oauth_communications_bridge.sql";

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
  | "contacts"
  | "leads"
  | "companies"
  | "opportunities"
  | "notes"
  | "tags"
  | "tasks";

export type GoHighLevelSyncResource = {
  key: GoHighLevelSyncResourceKey;
  label: string;
  localRecord: string;
  externalRecord: string;
  phaseOneMode: "metadata_only" | "dry_run_preview";
  direction: "two_way" | "weathertech_to_provider" | "provider_to_weathertech";
  description: string;
};

export const goHighLevelSyncResources: GoHighLevelSyncResource[] = [
  {
    key: "contacts",
    label: "Contacts",
    localRecord: "customers",
    externalRecord: "GoHighLevel contacts",
    phaseOneMode: "dry_run_preview",
    direction: "provider_to_weathertech",
    description:
      "Reads GoHighLevel contact metadata into a dry-run mapping with duplicate and conflict checks; it performs no provider write.",
  },
  {
    key: "leads",
    label: "Leads",
    localRecord: "leads",
    externalRecord: "GoHighLevel opportunities",
    phaseOneMode: "dry_run_preview",
    direction: "provider_to_weathertech",
    description:
      "Reads provider opportunity metadata for comparison without automatically moving stages or writing to GoHighLevel.",
  },
  {
    key: "companies",
    label: "Companies",
    localRecord: "companies",
    externalRecord: "GoHighLevel locations",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads location/account metadata while keeping WeatherTech Roofing LLC and IHC separate.",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    localRecord: "estimates and pipeline stages",
    externalRecord: "GoHighLevel opportunities",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads pipeline and stage metadata without automatic opportunity updates.",
  },
  {
    key: "notes",
    label: "Notes",
    localRecord: "customer and job notes",
    externalRecord: "GoHighLevel notes",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads note metadata while keeping internal-only content out of customer-facing automation.",
  },
  {
    key: "tags",
    label: "Tags",
    localRecord: "customer and lead tags",
    externalRecord: "GoHighLevel tags",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads tag metadata for source, service type, status, and company identity mapping.",
  },
  {
    key: "tasks",
    label: "Tasks",
    localRecord: "follow-ups and assignments",
    externalRecord: "GoHighLevel tasks",
    phaseOneMode: "metadata_only",
    direction: "provider_to_weathertech",
    description:
      "Reads task metadata for follow-up comparison without assigning live provider automations.",
  },
];

export const goHighLevelPhaseOneGuardrails = [
  "No outbound SMS, email, calls, workflows, campaigns, or automations are triggered.",
  "No live provider writes run until owner approval and worker enablement.",
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
