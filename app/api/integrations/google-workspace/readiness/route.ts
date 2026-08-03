import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  getGoogleWorkspaceReadinessSummary,
  summarizeGmailConnection,
} from "../../../../../lib/googleWorkspace/serverClient";
import {
  getGoogleCalendarConfigCheckResult,
  summarizeGoogleCalendarConnection,
} from "../../../../../lib/googleWorkspace/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkSchemaReadiness() {
  const client = await getSupabaseServerClient();

  if (!client) {
    return {
      schemaApplied: null,
      calendarSchemaApplied: null,
      connectedMailboxCount: 0,
      connectedCalendarCount: 0,
      mailboxes: [],
      calendarConnections: [],
      calendars: [],
    };
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return {
      schemaApplied: null,
      calendarSchemaApplied: null,
      connectedMailboxCount: 0,
      connectedCalendarCount: 0,
      mailboxes: [],
      calendarConnections: [],
      calendars: [],
    };
  }

  const [
    { error: threadsError },
    { error: calendarSchemaError },
    { data: connections },
    { data: calendarConnections },
    { data: calendars },
  ] = await Promise.all([
    client.from("gmail_email_threads").select("id", { count: "exact", head: true }),
    client
      .from("google_calendar_connected_calendars")
      .select("id", { count: "exact", head: true }),
    client
      .from("integration_connections")
      .select("*")
      .eq("provider", "gmail")
      .order("updated_at", { ascending: false }),
    client
      .from("integration_connections")
      .select("*")
      .eq("provider", "google_calendar")
      .order("updated_at", { ascending: false }),
    client
      .from("google_calendar_connected_calendars")
      .select("*")
      .order("updated_at", { ascending: false }),
  ]);
  const mailboxes = (connections ?? []).map(summarizeGmailConnection);
  const connectedCalendars = calendars ?? [];
  const summarizedCalendarConnections = (calendarConnections ?? []).map((connection) =>
    summarizeGoogleCalendarConnection(connection, connectedCalendars),
  );

  return {
    schemaApplied: !threadsError,
    calendarSchemaApplied: !calendarSchemaError,
    connectedMailboxCount: mailboxes.length,
    connectedCalendarCount: connectedCalendars.filter(
      (calendar) => calendar.status === "active" && calendar.selected_for_sync,
    ).length,
    mailboxes,
    calendarConnections: summarizedCalendarConnections,
    calendars: connectedCalendars.map((calendar) => ({
      id: calendar.id,
      companyId: calendar.company_id,
      integrationConnectionId: calendar.integration_connection_id,
      googleCalendarId: calendar.google_calendar_id,
      displayName: calendar.display_name,
      purpose: calendar.calendar_purpose,
      syncMode: calendar.sync_mode,
      status: calendar.status,
      selectedForSync: calendar.selected_for_sync,
      accessRole: calendar.access_role,
      lastSyncAt: calendar.last_successful_sync_at ?? calendar.last_sync_at,
      lastError: calendar.last_error,
    })),
  };
}

export async function GET() {
  const schema = await checkSchemaReadiness();

  return NextResponse.json({
    ...getGoogleWorkspaceReadinessSummary(schema),
    mailboxes: schema.mailboxes,
    calendar: {
      config: getGoogleCalendarConfigCheckResult(),
      schema: {
        migration: "0028_google_calendar_scheduling_foundation.sql",
        applied: schema.calendarSchemaApplied,
        message:
          schema.calendarSchemaApplied === true
            ? "Google Calendar foundation tables are available."
            : schema.calendarSchemaApplied === false
              ? "Apply the Google Calendar scheduling foundation migration before connecting calendars."
              : "Calendar schema readiness could not be checked.",
      },
      connectedCalendarCount: schema.connectedCalendarCount,
      connections: schema.calendarConnections,
      calendars: schema.calendars,
    },
  });
}
