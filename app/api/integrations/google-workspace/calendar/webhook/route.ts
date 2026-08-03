import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
} from "../../../../../../lib/googleWorkspace/serverClient";
import { GOOGLE_CALENDAR_WEBHOOK_EVENT_TYPE } from "../../../../../../lib/googleWorkspace/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getHeader(request: NextRequest, name: string) {
  return request.headers.get(name) ?? request.headers.get(name.toLowerCase());
}

export async function POST(request: NextRequest) {
  const serviceClient = createServiceSupabaseClient();
  const channelId = getHeader(request, "x-goog-channel-id");
  const resourceId = getHeader(request, "x-goog-resource-id");
  const resourceState = getHeader(request, "x-goog-resource-state");
  const messageNumber = getHeader(request, "x-goog-message-number");

  if (!channelId || !resourceId) {
    return NextResponse.json(
      {
        ok: false,
        queued: false,
        message: "Google Calendar notification headers are missing.",
      },
      { status: 400 },
    );
  }

  if (!serviceClient) {
    return NextResponse.json(
      {
        ok: false,
        queued: false,
        message: "Server-side CRM access is not configured.",
      },
      { status: 503 },
    );
  }

  const { data: calendar } = await serviceClient
    .from("google_calendar_connected_calendars")
    .select("*")
    .eq("webhook_channel_id", channelId)
    .eq("webhook_resource_id", resourceId)
    .maybeSingle();

  if (!calendar) {
    return NextResponse.json(
      {
        ok: false,
        queued: false,
        message: "Google Calendar notification channel is not registered.",
      },
      { status: 404 },
    );
  }

  await serviceClient.from("integration_sync_logs").insert({
    company_id: calendar.company_id,
    integration_connection_id: calendar.integration_connection_id,
    provider: "google_calendar",
    direction: "provider_to_weathertech",
    event_type: GOOGLE_CALENDAR_WEBHOOK_EVENT_TYPE,
    status: "queued",
    request_fingerprint: `${channelId}:${resourceId}:${messageNumber ?? "unknown"}`,
    request_summary: {
      channelId,
      resourceState,
      messageNumber,
      bodyIgnored: true,
    },
    response_summary: {
      incrementalSyncRequired: true,
      connectedCalendarId: calendar.id,
    },
  });

  await serviceClient
    .from("google_calendar_connected_calendars")
    .update({
      last_sync_at: new Date().toISOString(),
      last_error: null,
      metadata: {
        ...calendar.metadata,
        lastWebhookResourceState: resourceState,
        lastWebhookMessageNumber: messageNumber,
      },
    })
    .eq("id", calendar.id);

  return NextResponse.json({
    ok: true,
    queued: true,
    message: "Google Calendar notification recorded for incremental sync.",
  });
}
