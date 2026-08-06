import crypto from "crypto";
import {
  createPayloadFingerprint,
  googleCalendarScopes,
  googleCalendarReadOnlyScopes,
  googleWorkspaceEnvVars,
  buildGoogleCalendarEventPayload,
  gmailIdentityScopes,
  type GoogleCalendarEventPayload,
} from "../crm/integrations";
import type {
  CalendarEventSyncRecord,
  GoogleCalendarAccessRole,
  GoogleCalendarConnectedCalendarInsert,
  GoogleCalendarConnectedCalendarRecord,
  GoogleCalendarCredentialRecord,
  GoogleCalendarPurpose,
  GoogleCalendarSyncMode,
  GoogleCalendarUnmatchedEventInsert,
  IntegrationConnectionRecord,
  IntegrationSyncDirection,
  JobAssignmentRecord,
  ScheduleEventRecord,
} from "../crm/types";

type FetchLike = typeof fetch;

const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const DEFAULT_TIME_ZONE = "America/Phoenix";
const ALL_DAY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const GOOGLE_CALENDAR_DISCOVERY_EVENT_TYPE = "google_calendar.discovery";
export const GOOGLE_CALENDAR_SYNC_EVENT_TYPE = "google_calendar.event_sync";
export const GOOGLE_CALENDAR_WEBHOOK_EVENT_TYPE = "google_calendar.webhook";

export const googleCalendarSupportedScopes = [
  ...gmailIdentityScopes,
  ...googleCalendarScopes,
];

export const googleCalendarRequiredScopeSet = new Set(googleCalendarScopes);

export type GoogleCalendarMaskedConfig = {
  calendarWriteEnabled: boolean;
  calendarApiBaseUrl: typeof GOOGLE_CALENDAR_API_BASE_URL;
  calendarDiscoveryEndpoint: string;
  calendarSyncEndpoint: string;
  calendarWebhookEndpoint: string;
  readOnlyScopes: string[];
  readWriteScopes: string[];
};

export type GoogleCalendarConfigCheckResult = {
  ok: boolean;
  writeEnabled: boolean;
  missing: string[];
  credentials: GoogleCalendarMaskedConfig;
  scopes: string[];
};

export type GoogleCalendarListEntry = {
  id?: unknown;
  summary?: unknown;
  description?: unknown;
  timeZone?: unknown;
  accessRole?: unknown;
  primary?: unknown;
  selected?: unknown;
  hidden?: unknown;
  deleted?: unknown;
};

export type GoogleCalendarApiEvent = {
  id?: unknown;
  etag?: unknown;
  status?: unknown;
  summary?: unknown;
  description?: unknown;
  location?: unknown;
  updated?: unknown;
  recurringEventId?: unknown;
  start?: {
    date?: unknown;
    dateTime?: unknown;
    timeZone?: unknown;
  };
  end?: {
    date?: unknown;
    dateTime?: unknown;
    timeZone?: unknown;
  };
};

export type GoogleCalendarDiscoveryResult =
  | {
      ok: true;
      calendars: GoogleCalendarConnectedCalendarInsert[];
      nextSyncToken: string | null;
    }
  | {
      ok: false;
      status: "missing_token" | "api_error";
      message: string;
      calendars: [];
      nextSyncToken: null;
    };

export type GoogleCalendarEventSyncPlan = {
  action: "create" | "update" | "skip";
  reason: string | null;
  calendarId: string;
  deterministicEventId: string;
  payload: GoogleCalendarEventPayload;
  payloadHash: string;
  writeEnabled: boolean;
  syncStatus: "queued" | "needs_update" | "synced";
};

export type GoogleCalendarEventSyncResult =
  | {
      attempted: false;
      synced: false;
      status:
        | "configuration_missing"
        | "disabled"
        | "missing_token"
        | "missing_event"
        | "missing_calendar";
      message: string;
      plan: GoogleCalendarEventSyncPlan | null;
    }
  | {
      attempted: true;
      synced: true;
      status: "synced";
      message: string;
      googleEventId: string;
      googleEventEtag: string | null;
      providerUpdatedAt: string | null;
      plan: GoogleCalendarEventSyncPlan;
    }
  | {
      attempted: true;
      synced: false;
      status: "failed";
      message: string;
      error: string;
      plan: GoogleCalendarEventSyncPlan;
    };

export type GoogleCalendarInboundSyncResult =
  | {
      ok: true;
      status: "synced";
      events: GoogleCalendarApiEvent[];
      nextSyncToken: string | null;
      nextPageToken: string | null;
    }
  | {
      ok: false;
      status: "missing_token" | "api_error" | "sync_token_expired";
      events: [];
      nextSyncToken: null;
      nextPageToken: null;
      message: string;
    };

export type GoogleCalendarConflict = {
  type:
    | "employee_double_booking"
    | "schedule_overlap"
    | "duplicate_provider_mapping";
  severity: "critical" | "high" | "medium";
  companyId: string;
  scheduleEventIds: string[];
  employeeId: string | null;
  message: string;
};

function getServerEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getBooleanEnvValue(name: string) {
  const value = getServerEnv(name)?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getAccessRole(value: unknown): GoogleCalendarAccessRole | null {
  const raw = getString(value);

  if (
    raw === "none" ||
    raw === "freeBusyReader" ||
    raw === "reader" ||
    raw === "writer" ||
    raw === "writerWithoutPrivateAccess" ||
    raw === "owner"
  ) {
    return raw;
  }

  return null;
}

function isWritableRole(role: GoogleCalendarAccessRole | null) {
  return role === "writer" || role === "writerWithoutPrivateAccess" || role === "owner";
}

function sanitizeCalendarText(value: string | null, maxLength = 255) {
  return value
    ? value
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength)
    : null;
}

function buildDeterministicGoogleEventId({
  calendarId,
  scheduleEventId,
  integrationConnectionId,
}: {
  calendarId: string;
  scheduleEventId: string;
  integrationConnectionId: string;
}) {
  const digest = crypto
    .createHash("sha256")
    .update(`${integrationConnectionId}:${calendarId}:${scheduleEventId}`)
    .digest("hex");

  return `a${digest.slice(0, 31)}`;
}

export function getGoogleCalendarConfigCheckResult(): GoogleCalendarConfigCheckResult {
  const missing = [
    googleWorkspaceEnvVars.clientId,
    googleWorkspaceEnvVars.clientSecret,
    googleWorkspaceEnvVars.redirectUri,
    googleWorkspaceEnvVars.tokenEncryptionKey,
  ].filter((name) => !getServerEnv(name));

  return {
    ok: missing.length === 0,
    writeEnabled: getBooleanEnvValue(googleWorkspaceEnvVars.googleCalendarWriteEnabled),
    missing,
    credentials: {
      calendarWriteEnabled: getBooleanEnvValue(
        googleWorkspaceEnvVars.googleCalendarWriteEnabled,
      ),
      calendarApiBaseUrl: GOOGLE_CALENDAR_API_BASE_URL,
      calendarDiscoveryEndpoint: googleWorkspaceEnvVars.calendarDiscoveryEndpoint,
      calendarSyncEndpoint: googleWorkspaceEnvVars.calendarSyncEndpoint,
      calendarWebhookEndpoint: googleWorkspaceEnvVars.calendarWebhookEndpoint,
      readOnlyScopes: [...googleCalendarReadOnlyScopes],
      readWriteScopes: [...googleCalendarScopes],
    },
    scopes: googleCalendarSupportedScopes,
  };
}

export function hasRequiredGoogleCalendarScopes(scopes: string[] | null | undefined) {
  const scopeSet = new Set(scopes ?? []);
  return [...googleCalendarRequiredScopeSet].every((scope) => scopeSet.has(scope));
}

export function summarizeGoogleCalendarConnection(
  connection: IntegrationConnectionRecord,
  calendars: GoogleCalendarConnectedCalendarRecord[] = [],
) {
  const activeCalendars = calendars.filter(
    (calendar) =>
      calendar.integration_connection_id === connection.id &&
      calendar.status === "active" &&
      calendar.selected_for_sync,
  );

  return {
    id: connection.id,
    companyId: connection.company_id,
    status: connection.status,
    accountEmail: connection.account_email,
    providerAccountId: connection.provider_account_id ?? connection.external_account_id,
    scopes: connection.scopes,
    scopesReady: hasRequiredGoogleCalendarScopes(connection.scopes),
    defaultCalendarId: connection.default_calendar_id,
    activeCalendarCount: activeCalendars.length,
    writeModeCount: activeCalendars.filter((calendar) => calendar.sync_mode === "read_write")
      .length,
    lastSyncAt:
      connection.last_successful_sync_at ?? connection.last_sync_at ?? null,
    lastFailureAt: connection.last_failure_at ?? null,
    disabled: Boolean(connection.disabled_at || connection.status === "paused"),
  };
}

export function normalizeGoogleCalendarListEntry({
  entry,
  companyId,
  integrationConnectionId,
  fallbackPurpose = "operations",
}: {
  entry: GoogleCalendarListEntry;
  companyId: string;
  integrationConnectionId: string;
  fallbackPurpose?: GoogleCalendarPurpose;
}): GoogleCalendarConnectedCalendarInsert | null {
  const calendarId = getString(entry.id);
  const displayName = sanitizeCalendarText(getString(entry.summary), 180);

  if (!calendarId || !displayName || entry.deleted === true) {
    return null;
  }

  const accessRole = getAccessRole(entry.accessRole);
  const selected = entry.selected !== false && entry.hidden !== true;

  return {
    company_id: companyId,
    integration_connection_id: integrationConnectionId,
    google_calendar_id: calendarId,
    display_name: displayName,
    description: sanitizeCalendarText(getString(entry.description), 500),
    time_zone: getString(entry.timeZone),
    access_role: accessRole,
    primary_calendar: entry.primary === true,
    selected_for_sync: selected,
    calendar_purpose: fallbackPurpose,
    branch_location: null,
    sync_mode: isWritableRole(accessRole) ? "read_write" : "read_only",
    status: "active",
    sync_token: null,
    last_error: null,
    metadata: {
      googleSelected: selected,
      googleHidden: entry.hidden === true,
    },
  };
}

export async function fetchGoogleUserInfo({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: FetchLike;
}) {
  const response = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  const payload = (await response.json()) as {
    email?: unknown;
    sub?: unknown;
  };

  if (!response.ok || typeof payload.email !== "string") {
    return {
      ok: false as const,
      error: "Could not load Google account profile.",
      payload,
    };
  }

  return {
    ok: true as const,
    emailAddress: payload.email,
    providerAccountId: typeof payload.sub === "string" ? payload.sub : payload.email,
    payload,
  };
}

export async function discoverGoogleCalendars({
  accessToken,
  companyId,
  integrationConnectionId,
  fetchImpl = fetch,
}: {
  accessToken: string | null;
  companyId: string;
  integrationConnectionId: string;
  fetchImpl?: FetchLike;
}): Promise<GoogleCalendarDiscoveryResult> {
  if (!accessToken) {
    return {
      ok: false,
      status: "missing_token",
      message: "Reconnect Google Calendar before discovering calendars.",
      calendars: [],
      nextSyncToken: null,
    };
  }

  const calendars: GoogleCalendarConnectedCalendarInsert[] = [];
  let pageToken: string | null = null;
  let nextSyncToken: string | null = null;

  do {
    const params = new URLSearchParams({
      maxResults: "100",
      showDeleted: "false",
      showHidden: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetchImpl(
      `${GOOGLE_CALENDAR_API_BASE_URL}/users/me/calendarList?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    const payload = (await response.json()) as {
      items?: GoogleCalendarListEntry[];
      nextPageToken?: unknown;
      nextSyncToken?: unknown;
      error?: {
        message?: unknown;
      };
    };

    if (!response.ok) {
      return {
        ok: false,
        status: "api_error",
        message:
          typeof payload.error?.message === "string"
            ? payload.error.message
            : "Google Calendar discovery failed.",
        calendars: [],
        nextSyncToken: null,
      };
    }

    for (const entry of payload.items ?? []) {
      const normalized = normalizeGoogleCalendarListEntry({
        entry,
        companyId,
        integrationConnectionId,
      });

      if (normalized) {
        calendars.push(normalized);
      }
    }

    pageToken = getString(payload.nextPageToken);
    nextSyncToken = getString(payload.nextSyncToken) ?? nextSyncToken;
  } while (pageToken);

  return {
    ok: true,
    calendars,
    nextSyncToken,
  };
}

export function buildGoogleCalendarEventSyncPlan({
  event,
  targetName,
  connection,
  calendar,
  sync,
  timeZone = DEFAULT_TIME_ZONE,
  writeEnabled = getGoogleCalendarConfigCheckResult().writeEnabled,
}: {
  event: ScheduleEventRecord;
  targetName: string;
  connection: IntegrationConnectionRecord;
  calendar?: Pick<
    GoogleCalendarConnectedCalendarRecord,
    "google_calendar_id" | "time_zone" | "sync_mode"
  > | null;
  sync?: CalendarEventSyncRecord | null;
  timeZone?: string;
  writeEnabled?: boolean;
}): GoogleCalendarEventSyncPlan {
  const calendarId =
    calendar?.google_calendar_id ?? connection.default_calendar_id ?? "primary";
  const payload = buildGoogleCalendarEventPayload(
    event,
    targetName,
    calendar?.time_zone ?? timeZone,
  );
  const payloadHash = createPayloadFingerprint(payload);
  const deterministicEventId = buildDeterministicGoogleEventId({
    calendarId,
    scheduleEventId: event.id,
    integrationConnectionId: connection.id,
  });

  if (calendar?.sync_mode === "read_only") {
    return {
      action: "skip",
      reason: "The selected calendar is read-only in WeatherTech OS.",
      calendarId,
      deterministicEventId,
      payload,
      payloadHash,
      writeEnabled,
      syncStatus: sync?.google_event_id ? "needs_update" : "queued",
    };
  }

  if (sync?.google_event_id && sync.last_payload_hash === payloadHash) {
    return {
      action: "skip",
      reason: "The Google Calendar event mapping is already current.",
      calendarId,
      deterministicEventId,
      payload,
      payloadHash,
      writeEnabled,
      syncStatus: "synced",
    };
  }

  return {
    action: sync?.google_event_id ? "update" : "create",
    reason: null,
    calendarId,
    deterministicEventId,
    payload,
    payloadHash,
    writeEnabled,
    syncStatus: sync?.google_event_id ? "needs_update" : "queued",
  };
}

export async function syncGoogleCalendarEvent({
  event,
  targetName,
  connection,
  calendar,
  sync,
  accessToken,
  fetchImpl = fetch,
}: {
  event: ScheduleEventRecord | null;
  targetName: string;
  connection: IntegrationConnectionRecord | null;
  calendar?: GoogleCalendarConnectedCalendarRecord | null;
  sync?: CalendarEventSyncRecord | null;
  accessToken: string | null;
  fetchImpl?: FetchLike;
}): Promise<GoogleCalendarEventSyncResult> {
  if (!getGoogleCalendarConfigCheckResult().ok) {
    return {
      attempted: false,
      synced: false,
      status: "configuration_missing",
      message: "Google Workspace configuration is incomplete. No calendar event was synced.",
      plan: null,
    };
  }

  if (!event) {
    return {
      attempted: false,
      synced: false,
      status: "missing_event",
      message: "No WeatherTech OS schedule event was provided.",
      plan: null,
    };
  }

  if (!connection) {
    return {
      attempted: false,
      synced: false,
      status: "missing_calendar",
      message: "Select a Google Calendar connection before syncing.",
      plan: null,
    };
  }

  const plan = buildGoogleCalendarEventSyncPlan({
    event,
    targetName,
    connection,
    calendar,
    sync,
  });

  if (!plan.writeEnabled) {
    return {
      attempted: false,
      synced: false,
      status: "disabled",
      message:
        "No Google Calendar event was created or changed. GOOGLE_CALENDAR_WRITE_ENABLED must be explicitly enabled for controlled live writes.",
      plan,
    };
  }

  if (!accessToken) {
    return {
      attempted: false,
      synced: false,
      status: "missing_token",
      message: "No authorized Google Calendar token is available. No event was synced.",
      plan,
    };
  }

  if (plan.action === "skip") {
    return {
      attempted: false,
      synced: false,
      status: "disabled",
      message: plan.reason ?? "Google Calendar sync was skipped.",
      plan,
    };
  }

  const eventId = sync?.google_event_id ?? plan.deterministicEventId;
  const endpoint =
    plan.action === "update"
      ? `${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(
          plan.calendarId,
        )}/events/${encodeURIComponent(eventId)}?sendUpdates=none`
      : `${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(
          plan.calendarId,
        )}/events?sendUpdates=none`;
  const method = plan.action === "update" ? "PATCH" : "POST";
  const body =
    plan.action === "update"
      ? plan.payload
      : {
          id: eventId,
          ...plan.payload,
        };

  try {
    const response = await fetchImpl(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as GoogleCalendarApiEvent & {
      error?: {
        message?: unknown;
      };
    };

    if (!response.ok) {
      return {
        attempted: true,
        synced: false,
        status: "failed",
        message: "Google Calendar event sync failed.",
        error:
          typeof payload.error?.message === "string"
            ? payload.error.message
            : "Google Calendar API returned an error.",
        plan,
      };
    }

    return {
      attempted: true,
      synced: true,
      status: "synced",
      message: "Google Calendar event synchronized.",
      googleEventId: getString(payload.id) ?? eventId,
      googleEventEtag: getString(payload.etag),
      providerUpdatedAt: getString(payload.updated),
      plan,
    };
  } catch (error) {
    return {
      attempted: true,
      synced: false,
      status: "failed",
      message: "Google Calendar event sync failed.",
      error:
        error instanceof Error ? error.message : "Google Calendar API returned an error.",
      plan,
    };
  }
}

export async function listGoogleCalendarEvents({
  accessToken,
  calendarId,
  syncToken,
  fetchImpl = fetch,
}: {
  accessToken: string | null;
  calendarId: string;
  syncToken?: string | null;
  fetchImpl?: FetchLike;
}): Promise<GoogleCalendarInboundSyncResult> {
  if (!accessToken) {
    return {
      ok: false,
      status: "missing_token",
      events: [],
      nextSyncToken: null,
      nextPageToken: null,
      message: "Reconnect Google Calendar before importing provider events.",
    };
  }

  const params = new URLSearchParams({
    maxResults: "50",
    showDeleted: "true",
    singleEvents: "true",
  });

  if (syncToken) {
    params.set("syncToken", syncToken);
  } else {
    params.set(
      "timeMin",
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    );
  }

  const response = await fetchImpl(
    `${GOOGLE_CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(
      calendarId,
    )}/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );
  const payload = (await response.json()) as {
    items?: GoogleCalendarApiEvent[];
    nextSyncToken?: unknown;
    nextPageToken?: unknown;
    error?: {
      message?: unknown;
    };
  };

  if (response.status === 410) {
    return {
      ok: false,
      status: "sync_token_expired",
      events: [],
      nextSyncToken: null,
      nextPageToken: null,
      message: "Google Calendar sync token expired. A full resync is required.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: "api_error",
      events: [],
      nextSyncToken: null,
      nextPageToken: null,
      message:
        typeof payload.error?.message === "string"
          ? payload.error.message
          : "Google Calendar event import failed.",
    };
  }

  return {
    ok: true,
    status: "synced",
    events: payload.items ?? [],
    nextSyncToken: getString(payload.nextSyncToken),
    nextPageToken: getString(payload.nextPageToken),
  };
}

export function buildUnmatchedGoogleCalendarEventReview({
  event,
  companyId,
  integrationConnectionId,
  connectedCalendarId,
  googleCalendarId,
}: {
  event: GoogleCalendarApiEvent;
  companyId: string;
  integrationConnectionId: string;
  connectedCalendarId?: string | null;
  googleCalendarId: string;
}): GoogleCalendarUnmatchedEventInsert | null {
  const eventId = getString(event.id);
  const summary = sanitizeCalendarText(getString(event.summary), 180);

  if (!eventId || !summary) {
    return null;
  }

  const startDateTime = getString(event.start?.dateTime);
  const endDateTime = getString(event.end?.dateTime);
  const allDayDate = getString(event.start?.date);

  return {
    company_id: companyId,
    integration_connection_id: integrationConnectionId,
    connected_calendar_id: connectedCalendarId ?? null,
    google_calendar_id: googleCalendarId,
    google_event_id: eventId,
    google_recurring_event_id: getString(event.recurringEventId),
    google_event_etag: getString(event.etag),
    event_status:
      event.status === "confirmed" || event.status === "tentative" || event.status === "cancelled"
        ? event.status
        : "unmatched",
    event_summary: summary,
    event_location: sanitizeCalendarText(getString(event.location), 255),
    starts_at: startDateTime,
    ends_at: endDateTime,
    all_day_date:
      allDayDate && ALL_DAY_DATE_PATTERN.test(allDayDate) ? allDayDate : null,
    provider_updated_at: getString(event.updated),
    review_status: "needs_review",
    review_reason:
      "Imported Google Calendar event could not be matched confidently to an existing WeatherTech OS schedule record.",
    metadata: {
      allDay: Boolean(allDayDate),
      timeZone: getString(event.start?.timeZone) ?? DEFAULT_TIME_ZONE,
      rawPayloadStored: false,
    },
  };
}

function rangesOverlap(left: ScheduleEventRecord, right: ScheduleEventRecord) {
  const leftStart = Date.parse(left.start_at);
  const leftEnd = Date.parse(left.end_at);
  const rightStart = Date.parse(right.start_at);
  const rightEnd = Date.parse(right.end_at);

  return (
    Number.isFinite(leftStart) &&
    Number.isFinite(leftEnd) &&
    Number.isFinite(rightStart) &&
    Number.isFinite(rightEnd) &&
    leftStart < rightEnd &&
    rightStart < leftEnd
  );
}

export function detectGoogleCalendarSchedulingConflicts({
  scheduleEvents,
  jobAssignments = [],
  syncs = [],
}: {
  scheduleEvents: ScheduleEventRecord[];
  jobAssignments?: JobAssignmentRecord[];
  syncs?: CalendarEventSyncRecord[];
}): GoogleCalendarConflict[] {
  const conflicts: GoogleCalendarConflict[] = [];
  const scheduledEvents = scheduleEvents.filter((event) => event.status === "scheduled");
  const assignmentsByEvent = new Map<string, JobAssignmentRecord[]>();

  for (const assignment of jobAssignments) {
    if (!assignment.schedule_event_id) {
      continue;
    }

    assignmentsByEvent.set(assignment.schedule_event_id, [
      ...(assignmentsByEvent.get(assignment.schedule_event_id) ?? []),
      assignment,
    ]);
  }

  for (let index = 0; index < scheduledEvents.length; index += 1) {
    const left = scheduledEvents[index];

    for (const right of scheduledEvents.slice(index + 1)) {
      if (left.company_id !== right.company_id || !rangesOverlap(left, right)) {
        continue;
      }

      const leftAssignments = assignmentsByEvent.get(left.id) ?? [];
      const rightAssignments = assignmentsByEvent.get(right.id) ?? [];
      const sharedEmployee = leftAssignments.find((assignment) =>
        rightAssignments.some(
          (candidate) => candidate.employee_id === assignment.employee_id,
        ),
      );

      if (sharedEmployee) {
        conflicts.push({
          type: "employee_double_booking",
          severity: "critical",
          companyId: left.company_id,
          scheduleEventIds: [left.id, right.id],
          employeeId: sharedEmployee.employee_id,
          message: "Employee is assigned to overlapping scheduled work.",
        });
      } else if (left.job_id && left.job_id === right.job_id) {
        conflicts.push({
          type: "schedule_overlap",
          severity: "high",
          companyId: left.company_id,
          scheduleEventIds: [left.id, right.id],
          employeeId: null,
          message: "The same job has overlapping scheduled calendar blocks.",
        });
      }
    }
  }

  const providerKeys = new Map<string, CalendarEventSyncRecord>();

  for (const sync of syncs) {
    if (!sync.google_event_id) {
      continue;
    }

    const key = `${sync.integration_connection_id}:${sync.google_calendar_id}:${sync.google_event_id}`;
    const existing = providerKeys.get(key);

    if (existing && existing.schedule_event_id !== sync.schedule_event_id) {
      conflicts.push({
        type: "duplicate_provider_mapping",
        severity: "medium",
        companyId: sync.company_id,
        scheduleEventIds: [existing.schedule_event_id, sync.schedule_event_id],
        employeeId: null,
        message: "Multiple WeatherTech OS schedule records map to the same Google event.",
      });
    } else {
      providerKeys.set(key, sync);
    }
  }

  return conflicts;
}

export function googleCalendarSyncDirectionLabel(direction: IntegrationSyncDirection) {
  const labels: Record<IntegrationSyncDirection, string> = {
    two_way: "Two-way",
    weathertech_to_provider: "WeatherTech to Google",
    provider_to_weathertech: "Google to WeatherTech",
  };

  return labels[direction];
}
