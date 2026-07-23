export const goHighLevelReadinessEndpoint =
  "/api/integrations/gohighlevel/readiness";

export const goHighLevelSyncFoundationMigration =
  "0021_gohighlevel_sync_foundation.sql";

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
    direction: "two_way",
    description:
      "Maps WeatherTech OS customers to GoHighLevel contacts with duplicate and conflict checks.",
  },
  {
    key: "leads",
    label: "Leads",
    localRecord: "leads",
    externalRecord: "GoHighLevel opportunities",
    phaseOneMode: "dry_run_preview",
    direction: "weathertech_to_provider",
    description:
      "Prepares lead-to-opportunity mapping without automatically moving pipeline stages.",
  },
  {
    key: "companies",
    label: "Companies",
    localRecord: "companies",
    externalRecord: "GoHighLevel locations",
    phaseOneMode: "metadata_only",
    direction: "two_way",
    description:
      "Keeps WeatherTech Roofing LLC and IHC location/account metadata separate.",
  },
  {
    key: "opportunities",
    label: "Opportunities",
    localRecord: "estimates and pipeline stages",
    externalRecord: "GoHighLevel opportunities",
    phaseOneMode: "metadata_only",
    direction: "two_way",
    description:
      "Tracks pipeline and stage mapping before any automatic opportunity updates.",
  },
  {
    key: "notes",
    label: "Notes",
    localRecord: "customer and job notes",
    externalRecord: "GoHighLevel notes",
    phaseOneMode: "metadata_only",
    direction: "two_way",
    description:
      "Prepares note sync while keeping internal-only content out of customer-facing automation.",
  },
  {
    key: "tags",
    label: "Tags",
    localRecord: "customer and lead tags",
    externalRecord: "GoHighLevel tags",
    phaseOneMode: "metadata_only",
    direction: "two_way",
    description:
      "Prepares tag mapping for source, service type, status, and company identity.",
  },
  {
    key: "tasks",
    label: "Tasks",
    localRecord: "follow-ups and assignments",
    externalRecord: "GoHighLevel tasks",
    phaseOneMode: "metadata_only",
    direction: "two_way",
    description:
      "Prepares task mapping for follow-up work without assigning live automations.",
  },
];

export const goHighLevelPhaseOneGuardrails = [
  "No outbound SMS, email, calls, workflows, campaigns, or automations are triggered.",
  "No live provider writes run until owner approval and worker enablement.",
  "Sync mappings store external IDs and conflict state instead of overwriting records.",
  "Credentials stay server-side and are never stored in browser state.",
  "Sync logs store safe metadata and fingerprints, not raw secrets or full contact payloads.",
];
