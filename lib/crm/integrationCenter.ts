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
    summaryWhenDisconnected: "WeatherTech OS can receive Yelp payloads, but no live Yelp account is connected yet.",
  },
  {
    id: "website_forms",
    label: "Website Forms",
    shortLabel: "Website",
    family: "lead_intake",
    description: "WeatherTech and IHC website lead forms, campaign metadata, retries, and inbox visibility.",
    connectionProviders: ["website"],
    capabilities: ["website_leads", "crm_sync", "webhooks"],
    iconKey: "website",
    requiresCredentials: false,
    supportsOAuth: false,
    supportsWebhooks: true,
    summaryWhenDisconnected: "Website intake endpoints are ready, but production forms still need to post to them.",
  },
  {
    id: "gohighlevel",
    label: "GoHighLevel",
    shortLabel: "GHL",
    family: "automation",
    description: "Future marketing automation, CRM sync, activity mirroring, and campaign-safe workflow handoff.",
    connectionProviders: ["gohighlevel"],
    capabilities: ["sms", "email", "calendar", "crm_sync", "ai", "webhooks"],
    iconKey: "automation",
    requiresCredentials: true,
    supportsOAuth: false,
    supportsWebhooks: true,
    summaryWhenDisconnected: "Server configuration is required before GoHighLevel sync workers can run.",
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
            ((metadata.id === "website_forms" || metadata.id === "yelp") && hasProviderActivity)
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
