import type {
  CalendarEventSyncRecord,
  CalendarEventSyncStatus,
  EmailMessageCategory,
  EmailMessageRecord,
  EmailMessageStatus,
  IntegrationConnectionRecord,
  IntegrationConnectionStatus,
  IntegrationSyncDirection,
  IntegrationSyncLogInput,
  IntegrationSyncLogRecord,
  IntegrationSyncLogStatus,
  JobRecord,
  LeadRecord,
  RoutePlanStopInput,
  ScheduleEventRecord,
  SmsMessageCategory,
  SmsMessageRecord,
  SmsMessageStatus,
} from "./types";

export const googleCalendarScopes = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

export const gmailScopes = ["https://www.googleapis.com/auth/gmail.send"];

export const googleMapsEnvVars = {
  browserApiKey: "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  serverApiKey: "GOOGLE_MAPS_API_KEY",
  routesEndpoint: "https://routes.googleapis.com/directions/v2:computeRoutes",
};

export const twilioEnvVars = {
  accountSid: "TWILIO_ACCOUNT_SID",
  authToken: "TWILIO_AUTH_TOKEN",
  apiKeySid: "TWILIO_API_KEY_SID",
  apiKeySecret: "TWILIO_API_KEY_SECRET",
  messagingServiceSid: "TWILIO_MESSAGING_SERVICE_SID",
  fromNumber: "TWILIO_FROM_NUMBER",
  messagesEndpoint: "https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Messages.json",
  inboundSmsWebhookPath: "/api/integrations/twilio/webhook",
  smsStatusCallbackPath: "/api/integrations/twilio/status",
  voiceWebhookPath: "/api/integrations/twilio/voice",
  recordingCallbackPath: "/api/integrations/twilio/recording",
};

export const goHighLevelEnvVars = {
  privateIntegrationToken: "GHL_PRIVATE_INTEGRATION_TOKEN",
  weatherTechLocationId: "GHL_LOCATION_ID_WEATHERTECH",
  ihcLocationId: "GHL_LOCATION_ID_IHC",
  apiBaseUrl: "https://services.leadconnectorhq.com",
  testEndpoint: "/api/integrations/gohighlevel/test",
  readinessEndpoint: "/api/integrations/gohighlevel/readiness",
  leadDryRunEndpoint: "/api/integrations/gohighlevel/leads/dry-run",
  leadDryRunEventType: "lead_contact.dry_run",
};

const DEFAULT_RETRY_DELAY_MINUTES = 15;
const REDACTED_VALUE = "[redacted]";

export type RouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type RouteStopCandidate = {
  key: string;
  stop_type: "lead" | "job";
  company_id: string;
  lead_id: string | null;
  job_id: string | null;
  schedule_event_id: string | null;
  title: string;
  address: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  priority: number;
  notes: string | null;
};

export type RoutePreview = {
  orderedStops: Array<
    RouteStopCandidate & {
      sort_order: number;
      estimated_arrival_at: string | null;
      estimated_departure_at: string | null;
      distance_from_previous_meters: number;
      duration_from_previous_seconds: number;
    }
  >;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  estimatedFuelCost: number;
  providerPayload: Record<string, unknown>;
};

export type GoogleCalendarEventPayload = {
  summary: string;
  location?: string;
  description?: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  reminders: {
    useDefault: boolean;
    overrides: {
      method: "email" | "popup";
      minutes: number;
    }[];
  };
  extendedProperties: {
    private: {
      weathertechCompanyId: string;
      weathertechScheduleEventId: string;
      weathertechJobId?: string;
      weathertechLeadId?: string;
      weathertechCustomerId?: string;
    };
  };
};

export function buildGoogleCalendarEventPayload(
  event: ScheduleEventRecord,
  targetName: string,
  timeZone = "America/Phoenix",
): GoogleCalendarEventPayload {
  const descriptionLines = [
    `WeatherTech OS ${event.event_type.replace(/_/g, " ")} appointment`,
    `Target: ${targetName}`,
    event.notes ? `Notes: ${event.notes}` : "",
  ].filter(Boolean);

  return {
    summary: event.title,
    location: event.location ?? undefined,
    description: descriptionLines.join("\n"),
    start: {
      dateTime: event.start_at,
      timeZone,
    },
    end: {
      dateTime: event.end_at,
      timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 60 },
      ],
    },
    extendedProperties: {
      private: {
        weathertechCompanyId: event.company_id,
        weathertechScheduleEventId: event.id,
        ...(event.job_id ? { weathertechJobId: event.job_id } : {}),
        ...(event.lead_id ? { weathertechLeadId: event.lead_id } : {}),
        ...(event.customer_id ? { weathertechCustomerId: event.customer_id } : {}),
      },
    },
  };
}

export function createPayloadFingerprint(payload: GoogleCalendarEventPayload) {
  const serialized = JSON.stringify(payload);
  let hash = 0;

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash << 5) - hash + serialized.charCodeAt(index);
    hash |= 0;
  }

  return `gcal-${Math.abs(hash).toString(16)}`;
}

export function getCalendarSyncRecord(
  event: ScheduleEventRecord,
  connection: IntegrationConnectionRecord | undefined,
  syncs: CalendarEventSyncRecord[],
) {
  if (!connection) {
    return undefined;
  }

  return syncs.find(
    (sync) =>
      sync.schedule_event_id === event.id &&
      sync.integration_connection_id === connection.id,
  );
}

export function getCalendarSyncSummary(
  events: ScheduleEventRecord[],
  syncs: CalendarEventSyncRecord[],
) {
  const scheduledEvents = events.filter((event) => event.status === "scheduled");
  const synced = syncs.filter((sync) => sync.sync_status === "synced").length;
  const queued = syncs.filter((sync) => sync.sync_status === "queued").length;
  const needsUpdate = syncs.filter(
    (sync) => sync.sync_status === "needs_update" || sync.sync_status === "conflict",
  ).length;
  const errors = syncs.filter((sync) => sync.sync_status === "error").length;

  return {
    scheduled: scheduledEvents.length,
    synced,
    queued,
    needsUpdate,
    errors,
    readyToQueue: Math.max(scheduledEvents.length - syncs.length, 0),
  };
}

export function integrationStatusLabel(status: IntegrationConnectionStatus) {
  const labels: Record<IntegrationConnectionStatus, string> = {
    connected: "Connected",
    needs_reauth: "Needs reauth",
    paused: "Paused",
    error: "Error",
  };

  return labels[status];
}

export function syncDirectionLabel(direction: IntegrationSyncDirection) {
  const labels: Record<IntegrationSyncDirection, string> = {
    two_way: "Two-way",
    weathertech_to_provider: "WeatherTech to Google",
    provider_to_weathertech: "Google to WeatherTech",
  };

  return labels[direction];
}

export function integrationSyncLogStatusLabel(status: IntegrationSyncLogStatus) {
  const labels: Record<IntegrationSyncLogStatus, string> = {
    queued: "Queued",
    running: "Running",
    succeeded: "Succeeded",
    failed: "Failed",
    skipped: "Skipped",
    retrying: "Retrying",
  };

  return labels[status];
}

export function getIntegrationSyncLogSummary(logs: IntegrationSyncLogRecord[]) {
  return {
    total: logs.length,
    queued: logs.filter((log) => log.status === "queued").length,
    running: logs.filter((log) => log.status === "running").length,
    succeeded: logs.filter((log) => log.status === "succeeded").length,
    failed: logs.filter((log) => log.status === "failed").length,
    skipped: logs.filter((log) => log.status === "skipped").length,
    retrying: logs.filter((log) => log.status === "retrying").length,
    outbound: logs.filter((log) => log.direction === "weathertech_to_provider").length,
    inbound: logs.filter((log) => log.direction === "provider_to_weathertech").length,
  };
}

type IntegrationSyncLogTransitionOptions = {
  now?: Date;
  errorCode?: string | null;
  errorMessage?: string | null;
  requestSummary?: Record<string, unknown>;
  responseSummary?: Record<string, unknown>;
};

type IntegrationSyncRetryOptions = IntegrationSyncLogTransitionOptions & {
  retryDelayMinutes?: number;
  incrementAttempt?: boolean;
};

function getSyncTimestamp(now = new Date()) {
  return now.toISOString();
}

function getNextRetryTimestamp(now: Date, retryDelayMinutes: number) {
  return new Date(now.getTime() + retryDelayMinutes * 60 * 1000).toISOString();
}

function getCompletedAttemptCount(log: IntegrationSyncLogRecord) {
  return log.status === "running"
    ? Math.max(log.attempt_count, 1)
    : log.attempt_count + 1;
}

export function sanitizeIntegrationSyncLogText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/(bearer\s+)[a-z0-9._~+/=-]+/gi, `$1${REDACTED_VALUE}`)
    .replace(
      /(authorization|token|api[_-]?key|secret)(\s*[:=]\s*)["']?[^"',\s]+/gi,
      `$1$2${REDACTED_VALUE}`,
    );
}

export function sanitizeIntegrationSyncLogSummary(
  summary: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!summary) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(summary).map(([key, value]) => {
      if (/authorization|token|api[_-]?key|secret|password/i.test(key)) {
        return [key, REDACTED_VALUE];
      }

      if (typeof value === "string") {
        return [key, sanitizeIntegrationSyncLogText(value) ?? ""];
      }

      if (Array.isArray(value)) {
        return [
          key,
          value.map((item) =>
            typeof item === "string" ? sanitizeIntegrationSyncLogText(item) ?? "" : item,
          ),
        ];
      }

      if (value && typeof value === "object") {
        return [
          key,
          sanitizeIntegrationSyncLogSummary(value as Record<string, unknown>),
        ];
      }

      return [key, value];
    }),
  );
}

export function buildIntegrationSyncPendingUpdate(
  log: Pick<IntegrationSyncLogRecord, "attempt_count">,
  { now = new Date(), requestSummary, responseSummary }: IntegrationSyncLogTransitionOptions = {},
): Partial<IntegrationSyncLogInput> {
  return {
    status: "running",
    attempt_count: log.attempt_count + 1,
    last_attempted_at: getSyncTimestamp(now),
    completed_at: null,
    next_retry_at: null,
    error_code: null,
    error_message: null,
    ...(requestSummary
      ? { request_summary: sanitizeIntegrationSyncLogSummary(requestSummary) }
      : {}),
    ...(responseSummary
      ? { response_summary: sanitizeIntegrationSyncLogSummary(responseSummary) }
      : {}),
  };
}

export function buildIntegrationSyncSuccessUpdate(
  log: IntegrationSyncLogRecord,
  { now = new Date(), responseSummary }: IntegrationSyncLogTransitionOptions = {},
): Partial<IntegrationSyncLogInput> {
  return {
    status: "succeeded",
    attempt_count: getCompletedAttemptCount(log),
    last_attempted_at: log.last_attempted_at ?? getSyncTimestamp(now),
    completed_at: getSyncTimestamp(now),
    next_retry_at: null,
    error_code: null,
    error_message: null,
    ...(responseSummary
      ? { response_summary: sanitizeIntegrationSyncLogSummary(responseSummary) }
      : {}),
  };
}

export function buildIntegrationSyncFailedUpdate(
  log: IntegrationSyncLogRecord,
  {
    now = new Date(),
    errorCode = null,
    errorMessage = null,
    responseSummary,
  }: IntegrationSyncLogTransitionOptions = {},
): Partial<IntegrationSyncLogInput> {
  return {
    status: "failed",
    attempt_count: getCompletedAttemptCount(log),
    last_attempted_at: log.last_attempted_at ?? getSyncTimestamp(now),
    completed_at: getSyncTimestamp(now),
    next_retry_at: null,
    error_code: sanitizeIntegrationSyncLogText(errorCode),
    error_message: sanitizeIntegrationSyncLogText(errorMessage),
    ...(responseSummary
      ? { response_summary: sanitizeIntegrationSyncLogSummary(responseSummary) }
      : {}),
  };
}

export function buildIntegrationSyncRetryableUpdate(
  log: IntegrationSyncLogRecord,
  {
    now = new Date(),
    retryDelayMinutes = DEFAULT_RETRY_DELAY_MINUTES,
    incrementAttempt = false,
    errorCode = log.error_code,
    errorMessage = log.error_message,
    responseSummary,
  }: IntegrationSyncRetryOptions = {},
): Partial<IntegrationSyncLogInput> {
  return {
    status: "retrying",
    attempt_count: incrementAttempt ? getCompletedAttemptCount(log) : log.attempt_count,
    completed_at: null,
    next_retry_at: getNextRetryTimestamp(now, retryDelayMinutes),
    error_code: sanitizeIntegrationSyncLogText(errorCode),
    error_message: sanitizeIntegrationSyncLogText(errorMessage),
    ...(responseSummary
      ? { response_summary: sanitizeIntegrationSyncLogSummary(responseSummary) }
      : {}),
  };
}

export function buildIntegrationSyncSkippedUpdate(
  log: IntegrationSyncLogRecord,
  {
    now = new Date(),
    errorCode = null,
    errorMessage = null,
    responseSummary,
  }: IntegrationSyncLogTransitionOptions = {},
): Partial<IntegrationSyncLogInput> {
  return {
    status: "skipped",
    attempt_count: log.attempt_count,
    completed_at: getSyncTimestamp(now),
    next_retry_at: null,
    error_code: sanitizeIntegrationSyncLogText(errorCode),
    error_message: sanitizeIntegrationSyncLogText(errorMessage),
    ...(responseSummary
      ? { response_summary: sanitizeIntegrationSyncLogSummary(responseSummary) }
      : {}),
  };
}

export function canRetryIntegrationSyncLog(
  log: IntegrationSyncLogRecord,
  now = new Date(),
) {
  if (log.attempt_count >= log.max_attempts) {
    return false;
  }

  if (log.status === "failed") {
    return true;
  }

  if (log.status !== "retrying") {
    return false;
  }

  return !log.next_retry_at || Date.parse(log.next_retry_at) <= now.getTime();
}

export function getFailedIntegrationSyncLogs(logs: IntegrationSyncLogRecord[]) {
  return logs.filter((log) => log.status === "failed" || log.status === "retrying");
}

export function getRetryableIntegrationSyncLogs(
  logs: IntegrationSyncLogRecord[],
  now = new Date(),
) {
  return logs.filter((log) => canRetryIntegrationSyncLog(log, now));
}

export function calendarSyncStatusLabel(status: CalendarEventSyncStatus) {
  const labels: Record<CalendarEventSyncStatus, string> = {
    queued: "Queued",
    synced: "Synced",
    needs_update: "Needs update",
    conflict: "Conflict",
    error: "Error",
  };

  return labels[status];
}

export function getEmailOutboxSummary(messages: EmailMessageRecord[]) {
  return {
    draft: messages.filter((message) => message.status === "draft").length,
    queued: messages.filter((message) => message.status === "queued").length,
    sent: messages.filter((message) => message.status === "sent").length,
    failed: messages.filter((message) => message.status === "failed").length,
  };
}

export function emailMessageStatusLabel(status: EmailMessageStatus) {
  const labels: Record<EmailMessageStatus, string> = {
    draft: "Draft",
    queued: "Queued",
    sent: "Sent",
    failed: "Failed",
  };

  return labels[status];
}

export function emailCategoryLabel(category: EmailMessageCategory) {
  const labels: Record<EmailMessageCategory, string> = {
    estimate: "Estimate",
    invoice: "Invoice",
    follow_up: "Follow-up",
    job_update: "Job update",
    general: "General",
  };

  return labels[category];
}

export function buildGmailSendPreview(message: EmailMessageRecord) {
  return {
    to: message.to_email,
    cc: message.cc_email ?? undefined,
    subject: message.subject,
    text: message.body,
    metadata: {
      weathertechCompanyId: message.company_id,
      weathertechEmailMessageId: message.id,
      customerId: message.customer_id ?? undefined,
      estimateId: message.estimate_id ?? undefined,
      invoiceId: message.invoice_id ?? undefined,
      documentId: message.document_id ?? undefined,
    },
  };
}

export function getSmsOutboxSummary(messages: SmsMessageRecord[]) {
  return {
    draft: messages.filter((message) => message.status === "draft").length,
    queued: messages.filter((message) => message.status === "queued").length,
    sent: messages.filter((message) => message.status === "sent").length,
    failed: messages.filter((message) => message.status === "failed").length,
  };
}

export function smsMessageStatusLabel(status: SmsMessageStatus) {
  const labels: Record<SmsMessageStatus, string> = {
    draft: "Draft",
    queued: "Queued",
    sent: "Sent",
    failed: "Failed",
  };

  return labels[status];
}

export function smsCategoryLabel(category: SmsMessageCategory) {
  const labels: Record<SmsMessageCategory, string> = {
    appointment_reminder: "Appointment reminder",
    estimate_follow_up: "Estimate follow-up",
    invoice_reminder: "Invoice reminder",
    job_update: "Job update",
    weather_delay: "Weather delay",
    general: "General",
  };

  return labels[category];
}

export function normalizePhoneForSms(phone: string) {
  const trimmed = phone.trim();

  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return trimmed;
}

export function countSmsSegments(body: string) {
  if (!body.length) {
    return 0;
  }

  return Math.ceil(body.length / 160);
}

export function buildTwilioSmsPreview(message: SmsMessageRecord) {
  return {
    To: normalizePhoneForSms(message.to_phone),
    ...(message.from_phone ? { From: normalizePhoneForSms(message.from_phone) } : {}),
    ...(message.from_phone ? {} : { MessagingServiceSid: "{TWILIO_MESSAGING_SERVICE_SID}" }),
    Body: message.body,
    metadata: {
      weathertechCompanyId: message.company_id,
      weathertechSmsMessageId: message.id,
      customerId: message.customer_id ?? undefined,
      leadId: message.lead_id ?? undefined,
      jobId: message.job_id ?? undefined,
      scheduleEventId: message.schedule_event_id ?? undefined,
      invoiceId: message.invoice_id ?? undefined,
      category: message.category,
      segments: countSmsSegments(message.body),
    },
  };
}

export function hasGoogleMapsBrowserKey() {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);
}

export function formatRouteDistance(meters: number) {
  if (!meters) {
    return "0 mi";
  }

  return `${(meters / 1609.344).toFixed(1)} mi`;
}

export function formatRouteDuration(seconds: number) {
  if (!seconds) {
    return "0 min";
  }

  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (!hours) {
    return `${minutes} min`;
  }

  return `${hours} hr ${remainingMinutes} min`;
}

export function buildFullAddress(parts: {
  property_address: string;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
}) {
  return [
    parts.property_address,
    parts.city,
    parts.state,
    parts.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function cityCoordinate(address: string): RouteCoordinate {
  const value = address.toLowerCase();

  if (value.includes("scottsdale")) {
    return { latitude: 33.4942, longitude: -111.9261 };
  }

  if (value.includes("mesa")) {
    return { latitude: 33.4152, longitude: -111.8315 };
  }

  if (value.includes("glendale")) {
    return { latitude: 33.5387, longitude: -112.186 };
  }

  if (value.includes("chandler")) {
    return { latitude: 33.3062, longitude: -111.8413 };
  }

  if (value.includes("tempe")) {
    return { latitude: 33.4255, longitude: -111.94 };
  }

  return { latitude: 33.4484, longitude: -112.074 };
}

export function resolveRouteCoordinate(stop: {
  address: string;
  latitude: number | null;
  longitude: number | null;
}) {
  if (stop.latitude !== null && stop.longitude !== null) {
    return {
      latitude: stop.latitude,
      longitude: stop.longitude,
    };
  }

  return cityCoordinate(stop.address);
}

function distanceMeters(a: RouteCoordinate, b: RouteCoordinate) {
  const earthRadiusMeters = 6371000;
  const degreesToRadians = Math.PI / 180;
  const lat1 = a.latitude * degreesToRadians;
  const lat2 = b.latitude * degreesToRadians;
  const deltaLat = (b.latitude - a.latitude) * degreesToRadians;
  const deltaLng = (b.longitude - a.longitude) * degreesToRadians;
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const straightLine = 2 * earthRadiusMeters * Math.atan2(
    Math.sqrt(haversine),
    Math.sqrt(1 - haversine),
  );

  return Math.round(straightLine * 1.22);
}

export function buildRouteCandidates(
  leads: LeadRecord[],
  jobs: JobRecord[],
  events: ScheduleEventRecord[],
  routeDate: string,
) {
  const eventsByJob = new Map(
    events
      .filter((event) => event.job_id && event.start_at.slice(0, 10) === routeDate)
      .map((event) => [event.job_id as string, event]),
  );
  const eventsByLead = new Map(
    events
      .filter((event) => event.lead_id && event.start_at.slice(0, 10) === routeDate)
      .map((event) => [event.lead_id as string, event]),
  );
  const jobCandidates: RouteStopCandidate[] = jobs
    .filter(
      (job) =>
        job.property_address &&
        (job.start_date === routeDate ||
          eventsByJob.has(job.id) ||
          job.status === "scheduled" ||
          job.status === "in_progress"),
    )
    .map((job) => ({
      key: `job:${job.id}`,
      stop_type: "job",
      company_id: job.company_id,
      lead_id: null,
      job_id: job.id,
      schedule_event_id: eventsByJob.get(job.id)?.id ?? null,
      title: job.title,
      address: job.property_address,
      city: null,
      latitude: job.latitude,
      longitude: job.longitude,
      google_place_id: job.google_place_id,
      priority: job.status === "in_progress" ? 1 : 2,
      notes: job.notes,
    }));
  const leadCandidates: RouteStopCandidate[] = leads
    .filter(
      (lead) =>
        lead.property_address &&
        lead.status !== "won" &&
        lead.status !== "lost" &&
        (lead.next_follow_up === routeDate ||
          eventsByLead.has(lead.id) ||
          lead.priority === "urgent"),
    )
    .map((lead) => ({
      key: `lead:${lead.id}`,
      stop_type: "lead",
      company_id: lead.company_id,
      lead_id: lead.id,
      job_id: null,
      schedule_event_id: eventsByLead.get(lead.id)?.id ?? null,
      title: lead.contact_name,
      address: buildFullAddress(lead),
      city: lead.city,
      latitude: lead.latitude,
      longitude: lead.longitude,
      google_place_id: lead.google_place_id,
      priority: lead.priority === "urgent" ? 0 : lead.priority === "high" ? 1 : 3,
      notes: lead.notes,
    }));

  return [...leadCandidates, ...jobCandidates];
}

function sortRouteCandidates(
  candidates: RouteStopCandidate[],
  origin: RouteCoordinate,
) {
  return [...candidates].sort((a, b) => {
    const aCoord = resolveRouteCoordinate(a);
    const bCoord = resolveRouteCoordinate(b);
    return (
      a.priority - b.priority ||
      distanceMeters(origin, aCoord) - distanceMeters(origin, bCoord) ||
      a.title.localeCompare(b.title)
    );
  });
}

export function buildGoogleMapsRoutePayload(
  originAddress: string,
  orderedStops: RouteStopCandidate[],
  avoidTolls: boolean,
  avoidHighways: boolean,
) {
  const finalStop = orderedStops[orderedStops.length - 1];
  const waypointStops = orderedStops.slice(0, -1);

  return {
    origin: {
      address: originAddress,
    },
    destination: finalStop
      ? {
          address: finalStop.address,
        }
      : {
          address: originAddress,
        },
    intermediates: waypointStops.map((stop) => ({
      address: stop.address,
    })),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    routeModifiers: {
      avoidTolls,
      avoidHighways,
    },
    languageCode: "en-US",
    units: "IMPERIAL",
  };
}

export function buildRoutePreview(
  candidates: RouteStopCandidate[],
  routeDate: string,
  originAddress: string,
  avoidTolls: boolean,
  avoidHighways: boolean,
): RoutePreview {
  const origin = cityCoordinate(originAddress);
  const orderedCandidates = sortRouteCandidates(candidates, origin);
  let previousCoordinate = origin;
  let totalDistanceMeters = 0;
  let totalDurationSeconds = 0;
  const start = new Date(`${routeDate}T08:00:00`);

  const orderedStops = orderedCandidates.map((stop, index) => {
    const coordinate = resolveRouteCoordinate(stop);
    const legDistance = distanceMeters(previousCoordinate, coordinate);
    const legDuration = Math.round((legDistance / 1609.344 / 30) * 3600) + 8 * 60;
    totalDistanceMeters += legDistance;
    totalDurationSeconds += legDuration;
    const arrival = new Date(start.getTime() + totalDurationSeconds * 1000);
    const departure = new Date(arrival.getTime() + 35 * 60 * 1000);
    totalDurationSeconds += 35 * 60;
    previousCoordinate = coordinate;

    return {
      ...stop,
      sort_order: index + 1,
      estimated_arrival_at: arrival.toISOString(),
      estimated_departure_at: departure.toISOString(),
      distance_from_previous_meters: legDistance,
      duration_from_previous_seconds: legDuration,
    };
  });

  return {
    orderedStops,
    totalDistanceMeters,
    totalDurationSeconds,
    estimatedFuelCost: Math.round((totalDistanceMeters / 1609.344 / 14) * 4.25 * 100) / 100,
    providerPayload: buildGoogleMapsRoutePayload(
      originAddress,
      orderedStops,
      avoidTolls,
      avoidHighways,
    ),
  };
}

export function routePreviewToStopInputs(
  preview: RoutePreview,
): RoutePlanStopInput[] {
  return preview.orderedStops.map((stop) => ({
    company_id: stop.company_id,
    stop_type: stop.stop_type,
    lead_id: stop.lead_id,
    job_id: stop.job_id,
    schedule_event_id: stop.schedule_event_id,
    sort_order: stop.sort_order,
    title: stop.title,
    address: stop.address,
    latitude: stop.latitude,
    longitude: stop.longitude,
    google_place_id: stop.google_place_id,
    estimated_arrival_at: stop.estimated_arrival_at,
    estimated_departure_at: stop.estimated_departure_at,
    distance_from_previous_meters: stop.distance_from_previous_meters,
    duration_from_previous_seconds: stop.duration_from_previous_seconds,
    notes: stop.notes,
  }));
}
