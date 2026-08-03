import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../../lib/supabase/server";
import {
  createServiceSupabaseClient,
  decryptGoogleToken,
  encryptGoogleToken,
  refreshGoogleAccessToken,
} from "../../../../../../lib/googleWorkspace/serverClient";
import {
  discoverGoogleCalendars,
  GOOGLE_CALENDAR_DISCOVERY_EVENT_TYPE,
} from "../../../../../../lib/googleWorkspace/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DiscoverBody = {
  integrationConnectionId?: unknown;
};

async function getJsonBody(request: NextRequest): Promise<DiscoverBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as DiscoverBody) : {};
  } catch {
    return {};
  }
}

function getRequestString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();

  if (!client || !serviceClient) {
    return NextResponse.json(
      { ok: false, calendars: [], message: "Server-side CRM access is not configured." },
      { status: 503 },
    );
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, calendars: [], message: "Sign in before discovering calendars." },
      { status: 401 },
    );
  }

  const body = await getJsonBody(request);
  const integrationConnectionId = getRequestString(body.integrationConnectionId);

  if (!integrationConnectionId) {
    return NextResponse.json(
      { ok: false, calendars: [], message: "Select a Google Calendar connection first." },
      { status: 400 },
    );
  }

  const { data: connection } = await client
    .from("integration_connections")
    .select("*")
    .eq("id", integrationConnectionId)
    .eq("provider", "google_calendar")
    .single();

  if (!connection) {
    return NextResponse.json(
      { ok: false, calendars: [], message: "Google Calendar connection was not found." },
      { status: 404 },
    );
  }

  const { data: credential } = await serviceClient
    .from("google_calendar_credentials")
    .select("*")
    .eq("integration_connection_id", connection.id)
    .maybeSingle();

  if (!credential?.encrypted_refresh_token) {
    await serviceClient
      .from("integration_connections")
      .update({
        status: "needs_reauth",
        last_error: "Reconnect Google Calendar before discovering calendars.",
        last_failure_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.json(
      {
        ok: false,
        calendars: [],
        message: "Reconnect Google Calendar before discovering calendars.",
      },
      { status: 409 },
    );
  }

  const refresh = await refreshGoogleAccessToken({
    refreshToken: decryptGoogleToken(credential.encrypted_refresh_token),
  });

  if (!refresh.ok || !refresh.accessToken) {
    await serviceClient
      .from("integration_connections")
      .update({
        status: "needs_reauth",
        last_error: refresh.error,
        last_failure_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    return NextResponse.json(
      { ok: false, calendars: [], message: refresh.error },
      { status: 409 },
    );
  }

  await serviceClient
    .from("google_calendar_credentials")
    .update({
      encrypted_access_token: encryptGoogleToken(refresh.accessToken),
      token_expires_at: refresh.expiresAt,
      token_type: refresh.tokenType,
      scopes: refresh.scope?.length ? refresh.scope : credential.scopes,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("id", credential.id);

  const discovery = await discoverGoogleCalendars({
    accessToken: refresh.accessToken,
    companyId: connection.company_id,
    integrationConnectionId: connection.id,
    syncToken: connection.sync_token,
  });
  const now = new Date().toISOString();

  if (!discovery.ok) {
    await serviceClient.from("integration_sync_logs").insert({
      company_id: connection.company_id,
      integration_connection_id: connection.id,
      provider: "google_calendar",
      direction: "provider_to_weathertech",
      event_type: GOOGLE_CALENDAR_DISCOVERY_EVENT_TYPE,
      status: "failed",
      request_summary: { manualDiscovery: true },
      response_summary: { calendars: 0 },
      error_code: discovery.status,
      error_message: discovery.message,
      completed_at: now,
    });

    return NextResponse.json(
      { ok: false, calendars: [], message: discovery.message },
      { status: 502 },
    );
  }

  for (const calendar of discovery.calendars) {
    await serviceClient.from("google_calendar_connected_calendars").upsert(calendar, {
      onConflict: "integration_connection_id,google_calendar_id",
    });
  }

  await serviceClient
    .from("integration_connections")
    .update({
      status: "connected",
      sync_token: discovery.nextSyncToken ?? connection.sync_token,
      last_sync_at: now,
      last_successful_sync_at: now,
      last_error: null,
    })
    .eq("id", connection.id);

  await serviceClient.from("integration_sync_logs").insert({
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    provider: "google_calendar",
    direction: "provider_to_weathertech",
    event_type: GOOGLE_CALENDAR_DISCOVERY_EVENT_TYPE,
    status: "succeeded",
    request_summary: { manualDiscovery: true },
    response_summary: {
      calendars: discovery.calendars.length,
      nextSyncTokenStored: Boolean(discovery.nextSyncToken),
    },
    completed_at: now,
  });

  return NextResponse.json({
    ok: true,
    calendars: discovery.calendars.map((calendar) => ({
      googleCalendarId: calendar.google_calendar_id,
      displayName: calendar.display_name,
      accessRole: calendar.access_role,
      syncMode: calendar.sync_mode,
      selectedForSync: calendar.selected_for_sync,
    })),
    message: "Google Calendar discovery completed.",
  });
}
