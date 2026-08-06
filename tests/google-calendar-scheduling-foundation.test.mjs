import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-google-calendar-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function restoreEnv(originalEnv) {
  for (const key of [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
    "GOOGLE_PUBLIC_BASE_URL",
    "GOOGLE_WORKSPACE_DOMAIN",
    "GOOGLE_TOKEN_ENCRYPTION_KEY",
    "GOOGLE_GMAIL_SEND_ENABLED",
    "GOOGLE_CALENDAR_WRITE_ENABLED",
  ]) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

function configureGoogleEnv(writeEnabled = "false") {
  process.env.GOOGLE_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
  process.env.GOOGLE_REDIRECT_URI =
    "https://app.weathertech.test/api/integrations/google-workspace/oauth/callback";
  process.env.GOOGLE_PUBLIC_BASE_URL = "https://app.weathertech.test";
  process.env.GOOGLE_WORKSPACE_DOMAIN = "weathertech.example";
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY =
    "weathertech-test-token-encryption-key-that-is-not-real";
  process.env.GOOGLE_GMAIL_SEND_ENABLED = "false";
  process.env.GOOGLE_CALENDAR_WRITE_ENABLED = writeEnabled;
}

function createScheduleEvent(overrides = {}) {
  return {
    id: "schedule-event-1",
    company_id: "company-weathertech",
    customer_id: "customer-1",
    lead_id: null,
    job_id: "job-1",
    title: "TEST WTOS REGRESSION Roof inspection",
    event_type: "inspection",
    status: "scheduled",
    start_at: "2026-08-02T16:00:00.000Z",
    end_at: "2026-08-02T17:00:00.000Z",
    location: "123 Test Roof Way, Phoenix, AZ",
    notes: "Internal note: customer gate code is 1234.",
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function createConnection(overrides = {}) {
  return {
    id: "connection-1",
    company_id: "company-weathertech",
    provider: "google_calendar",
    status: "connected",
    account_email: "scheduler@weathertech.example",
    display_name: "WeatherTech Test Calendar",
    external_account_id: "google-user-1",
    provider_account_id: "google-user-1",
    default_calendar_id: "calendar-weathertech",
    scopes: [],
    sync_direction: "two_way",
    credential_reference: null,
    webhook_channel_id: null,
    webhook_resource_id: null,
    sync_token: null,
    last_sync_at: null,
    last_error: null,
    settings: {},
    created_at: "2026-08-01T12:00:00.000Z",
    updated_at: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/googleWorkspace/calendar.ts",
      "lib/googleWorkspace/serverClient.ts",
      "lib/googleWorkspace/foundation.ts",
      "lib/crm/integrations.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Google Calendar foundation modules.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const calendar = await import(pathToFileURL(join(outDir, "googleWorkspace", "calendar.js")));
  const serverClient = await import(
    pathToFileURL(join(outDir, "googleWorkspace", "serverClient.js"))
  );
  const integrations = await import(pathToFileURL(join(outDir, "crm", "integrations.js")));
  const originalEnv = { ...process.env };

  const crmAppSource = readFileSync(join(cwd, "components", "CrmApp.tsx"), "utf8");
  const discoveryRouteSource = readFileSync(
    join(
      cwd,
      "app",
      "api",
      "integrations",
      "google-workspace",
      "calendar",
      "discover",
      "route.ts",
    ),
    "utf8",
  );
  const discoveryHandlerStart = crmAppSource.indexOf(
    "const handleDiscoverGoogleCalendars = async () => {",
  );
  const discoveryHandlerEnd = crmAppSource.indexOf(
    "const handleSyncGoogleCalendarEvent = async",
    discoveryHandlerStart,
  );
  const discoveryHandlerSource = crmAppSource.slice(
    discoveryHandlerStart,
    discoveryHandlerEnd,
  );
  assert(
    discoveryHandlerStart >= 0 && discoveryHandlerEnd > discoveryHandlerStart,
    "Calendar discovery handler is available for reload regression coverage",
  );
  assert(
    discoveryHandlerSource.includes("await onBackgroundReload()") &&
      !discoveryHandlerSource.includes("await onReload()"),
    "Calendar discovery refreshes CRM data without rebooting the workspace",
  );
  assert(
    discoveryHandlerSource.includes(
      'onError(result.message ?? "Google Calendar discovery is not available yet.");\n        return;',
    ),
    "Failed Calendar discovery preserves the current workspace instead of reloading it",
  );
  const discoveryRequestStart = discoveryRouteSource.indexOf(
    "const discovery = await discoverGoogleCalendars({",
  );
  const discoveryRequestEnd = discoveryRouteSource.indexOf(
    "});",
    discoveryRequestStart,
  );
  const discoveryRequestSource = discoveryRouteSource.slice(
    discoveryRequestStart,
    discoveryRequestEnd,
  );
  assert(
    discoveryRequestStart >= 0 &&
      discoveryRequestEnd > discoveryRequestStart &&
      !discoveryRequestSource.includes("syncToken"),
    "Repeated manual Calendar discovery performs a complete list request",
  );

  restoreEnv({});
  const missingConfig = calendar.getGoogleCalendarConfigCheckResult();
  assertEqual(missingConfig.ok, false, "Missing Google env keeps Calendar readiness disabled");
  assert(
    missingConfig.missing.includes("GOOGLE_CLIENT_ID") &&
      missingConfig.missing.includes("GOOGLE_CLIENT_SECRET") &&
      missingConfig.missing.includes("GOOGLE_REDIRECT_URI") &&
      missingConfig.missing.includes("GOOGLE_TOKEN_ENCRYPTION_KEY"),
    "Calendar readiness reports required server env vars",
  );

  configureGoogleEnv("false");
  const readyConfig = calendar.getGoogleCalendarConfigCheckResult();
  assertEqual(readyConfig.ok, true, "Complete Google env marks Calendar backend ready");
  assertEqual(readyConfig.writeEnabled, false, "Calendar writes are disabled by default");
  for (const scope of [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "openid",
    "email",
    "profile",
  ]) {
    assert(
      calendar.googleCalendarSupportedScopes.includes(scope),
      `Google Calendar supported scopes include ${scope}`,
    );
  }

  assert(
    serverClient
      .getGoogleWorkspaceConfigCheckResult()
      .scopes.includes("https://www.googleapis.com/auth/calendar.events"),
    "Google Workspace readiness includes Calendar scopes for scope-upgrade",
  );
  assertEqual(
    integrations.googleWorkspaceEnvVars.googleCalendarWriteEnabled,
    "GOOGLE_CALENDAR_WRITE_ENABLED",
    "Calendar write enablement uses an explicit server env var",
  );

  const normalizedCalendar = calendar.normalizeGoogleCalendarListEntry({
    entry: {
      id: "calendar-weathertech",
      summary: "WeatherTech Roofing LLC Inspections",
      description: "Test calendar",
      timeZone: "America/Phoenix",
      accessRole: "writer",
      primary: true,
      selected: true,
    },
    companyId: "company-weathertech",
    integrationConnectionId: "connection-1",
    fallbackPurpose: "inspections",
  });
  assert(normalizedCalendar, "Writable Google calendar list entry normalizes");
  assertEqual(
    normalizedCalendar.sync_mode,
    "read_write",
    "Writable Google Calendar access becomes read-write mode",
  );
  assertEqual(
    normalizedCalendar.calendar_purpose,
    "inspections",
    "Calendar purpose is preserved",
  );

  const discoverCalls = [];
  const discovery = await calendar.discoverGoogleCalendars({
    accessToken: "calendar-access-token",
    companyId: "company-weathertech",
    integrationConnectionId: "connection-1",
    fetchImpl: async (url, options) => {
      discoverCalls.push({ url: String(url), options });
      return Response.json({
        items: [
          {
            id: "calendar-weathertech",
            summary: "WeatherTech Roofing LLC Production",
            timeZone: "America/Phoenix",
            accessRole: "reader",
          },
        ],
        nextSyncToken: "sync-token-1",
      });
    },
  });
  assertEqual(discovery.ok, true, "Calendar discovery succeeds with mocked API");
  assertEqual(discovery.nextSyncToken, "sync-token-1", "Calendar discovery preserves next sync token");
  assert(
    discoverCalls[0].url.includes("/users/me/calendarList?") &&
      discoverCalls[0].options.headers.Authorization === "Bearer calendar-access-token",
    "Calendar discovery calls the calendarList endpoint with bearer auth",
  );

  const event = createScheduleEvent();
  const safePayload = integrations.buildGoogleCalendarEventPayload(
    event,
    "Jane Homeowner",
    "America/Phoenix",
  );
  assert(
    !JSON.stringify(safePayload).includes("gate code is 1234"),
    "Calendar event payload does not expose internal schedule notes",
  );
  assert(
    JSON.stringify(safePayload).includes(
      "Operational notes and private customer details remain in WeatherTech OS.",
    ),
    "Calendar event payload states private details stay inside WeatherTech OS",
  );

  const connection = createConnection({
    scopes: calendar.googleCalendarSupportedScopes,
  });
  const plan = calendar.buildGoogleCalendarEventSyncPlan({
    event,
    targetName: "Jane Homeowner",
    connection,
    calendar: normalizedCalendar,
    writeEnabled: false,
  });
  assertEqual(plan.action, "create", "New schedule event plans a provider create");
  assertEqual(plan.writeEnabled, false, "Sync plan preserves disabled write state");
  assert(
    /^a[a-f0-9]{31}$/.test(plan.deterministicEventId),
    "Google event id is deterministic and Calendar-safe",
  );

  let writeFetchCalled = false;
  const disabledSync = await calendar.syncGoogleCalendarEvent({
    event,
    targetName: "Jane Homeowner",
    connection,
    calendar: normalizedCalendar,
    sync: null,
    accessToken: "calendar-access-token",
    fetchImpl: async () => {
      writeFetchCalled = true;
      throw new Error("Google Calendar API must not be called when writes are disabled.");
    },
  });
  assertEqual(disabledSync.status, "disabled", "Calendar writes are disabled without explicit flag");
  assertEqual(writeFetchCalled, false, "Disabled Calendar sync does not call Google");

  configureGoogleEnv("true");
  let createBody = null;
  const createSync = await calendar.syncGoogleCalendarEvent({
    event,
    targetName: "Jane Homeowner",
    connection,
    calendar: normalizedCalendar,
    sync: null,
    accessToken: "calendar-access-token",
    fetchImpl: async (url, options) => {
      createBody = JSON.parse(options.body);
      assert(String(url).includes("/events?sendUpdates=none"), "Calendar create suppresses guest updates");
      assertEqual(options.method, "POST", "New Calendar sync uses POST");
      assertEqual(options.headers.Authorization, "Bearer calendar-access-token", "Calendar create uses bearer auth");
      return Response.json({
        id: createBody.id,
        etag: "etag-create",
        updated: "2026-08-02T16:05:00.000Z",
      });
    },
  });
  assertEqual(createSync.synced, true, "Enabled Calendar sync can create mocked event");
  assertEqual(createBody.id, plan.deterministicEventId, "Calendar create body uses deterministic event id");

  let updateEndpoint = "";
  const updateSync = await calendar.syncGoogleCalendarEvent({
    event,
    targetName: "Jane Homeowner",
    connection,
    calendar: normalizedCalendar,
    sync: {
      id: "sync-1",
      company_id: "company-weathertech",
      schedule_event_id: event.id,
      integration_connection_id: connection.id,
      provider: "google_calendar",
      google_calendar_id: "calendar-weathertech",
      google_event_id: "existing-google-event",
      sync_status: "needs_update",
      sync_direction: "two_way",
      last_synced_at: null,
      external_updated_at: null,
      last_error: null,
      last_payload_hash: "old-hash",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-01T12:00:00.000Z",
    },
    accessToken: "calendar-access-token",
    fetchImpl: async (url, options) => {
      updateEndpoint = String(url);
      assertEqual(options.method, "PATCH", "Existing Calendar mapping uses PATCH");
      return Response.json({
        id: "existing-google-event",
        etag: "etag-update",
        updated: "2026-08-02T16:10:00.000Z",
      });
    },
  });
  assertEqual(updateSync.synced, true, "Enabled Calendar sync can update mocked event");
  assert(
    updateEndpoint.includes("/events/existing-google-event?sendUpdates=none"),
    "Calendar update targets existing Google event id",
  );

  const inbound = await calendar.listGoogleCalendarEvents({
    accessToken: "calendar-access-token",
    calendarId: "calendar-weathertech",
    syncToken: "sync-token-1",
    fetchImpl: async (url, options) => {
      assert(String(url).includes("syncToken=sync-token-1"), "Inbound Calendar sync uses incremental token");
      assertEqual(options.headers.Authorization, "Bearer calendar-access-token", "Inbound Calendar sync uses bearer auth");
      return Response.json({
        items: [{ id: "google-event-1", summary: "Roof inspection", status: "confirmed" }],
        nextSyncToken: "sync-token-2",
      });
    },
  });
  assertEqual(inbound.ok, true, "Inbound Calendar event listing succeeds");
  assertEqual(inbound.nextSyncToken, "sync-token-2", "Inbound Calendar sync stores next sync token");

  const expiredInbound = await calendar.listGoogleCalendarEvents({
    accessToken: "calendar-access-token",
    calendarId: "calendar-weathertech",
    syncToken: "expired-token",
    fetchImpl: async () =>
      Response.json({ error: { message: "Sync token expired" } }, { status: 410 }),
  });
  assertEqual(
    expiredInbound.status,
    "sync_token_expired",
    "Expired Google Calendar sync token is handled explicitly",
  );

  const unmatchedReview = calendar.buildUnmatchedGoogleCalendarEventReview({
    companyId: "company-weathertech",
    integrationConnectionId: "connection-1",
    connectedCalendarId: "calendar-row-1",
    googleCalendarId: "calendar-weathertech",
    event: {
      id: "google-event-2",
      etag: "etag-2",
      status: "confirmed",
      summary: "Unknown meeting",
      description: "Private provider description",
      location: "Phoenix",
      start: { dateTime: "2026-08-03T16:00:00.000Z" },
      end: { dateTime: "2026-08-03T16:30:00.000Z" },
      updated: "2026-08-03T16:05:00.000Z",
    },
  });
  assertEqual(
    unmatchedReview.metadata.rawPayloadStored,
    false,
    "Unmatched Calendar events do not store full provider payloads",
  );
  assertEqual(
    unmatchedReview.review_status,
    "needs_review",
    "Unmatched provider events stay reviewable",
  );

  const doubleBooking = calendar.detectGoogleCalendarSchedulingConflicts({
    scheduleEvents: [
      event,
      createScheduleEvent({
        id: "schedule-event-2",
        start_at: "2026-08-02T16:30:00.000Z",
        end_at: "2026-08-02T17:30:00.000Z",
      }),
    ],
    jobAssignments: [
      {
        id: "assignment-1",
        company_id: "company-weathertech",
        employee_id: "employee-1",
        job_id: "job-1",
        schedule_event_id: "schedule-event-1",
        title: "Inspector",
        status: "assigned",
        assigned_date: "2026-08-02",
        notes: null,
        created_at: "2026-08-01T12:00:00.000Z",
        updated_at: "2026-08-01T12:00:00.000Z",
      },
      {
        id: "assignment-2",
        company_id: "company-weathertech",
        employee_id: "employee-1",
        job_id: "job-2",
        schedule_event_id: "schedule-event-2",
        title: "Inspector",
        status: "assigned",
        assigned_date: "2026-08-02",
        notes: null,
        created_at: "2026-08-01T12:00:00.000Z",
        updated_at: "2026-08-01T12:00:00.000Z",
      },
    ],
  });
  assertEqual(
    doubleBooking[0]?.type,
    "employee_double_booking",
    "Calendar conflict detection flags employee double booking",
  );

  const duplicateProviderMapping = calendar.detectGoogleCalendarSchedulingConflicts({
    scheduleEvents: [event],
    syncs: [
      {
        id: "sync-1",
        company_id: "company-weathertech",
        schedule_event_id: "schedule-event-1",
        integration_connection_id: "connection-1",
        provider: "google_calendar",
        google_calendar_id: "calendar-weathertech",
        google_event_id: "google-event-duplicate",
        sync_status: "synced",
        sync_direction: "two_way",
        last_synced_at: null,
        external_updated_at: null,
        last_error: null,
        last_payload_hash: null,
        created_at: "2026-08-01T12:00:00.000Z",
        updated_at: "2026-08-01T12:00:00.000Z",
      },
      {
        id: "sync-2",
        company_id: "company-weathertech",
        schedule_event_id: "schedule-event-2",
        integration_connection_id: "connection-1",
        provider: "google_calendar",
        google_calendar_id: "calendar-weathertech",
        google_event_id: "google-event-duplicate",
        sync_status: "synced",
        sync_direction: "two_way",
        last_synced_at: null,
        external_updated_at: null,
        last_error: null,
        last_payload_hash: null,
        created_at: "2026-08-01T12:00:00.000Z",
        updated_at: "2026-08-01T12:00:00.000Z",
      },
    ],
  });
  assertEqual(
    duplicateProviderMapping[0]?.type,
    "duplicate_provider_mapping",
    "Calendar conflict detection flags duplicate provider event mappings",
  );

  restoreEnv(originalEnv);
  console.log("Google Calendar scheduling foundation regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
