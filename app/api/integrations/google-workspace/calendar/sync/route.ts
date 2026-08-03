import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../../lib/supabase/server";
import {
  createServiceSupabaseClient,
  decryptGoogleToken,
  encryptGoogleToken,
  refreshGoogleAccessToken,
} from "../../../../../../lib/googleWorkspace/serverClient";
import {
  GOOGLE_CALENDAR_SYNC_EVENT_TYPE,
  buildGoogleCalendarEventSyncPlan,
  detectGoogleCalendarSchedulingConflicts,
  syncGoogleCalendarEvent,
} from "../../../../../../lib/googleWorkspace/calendar";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CalendarSyncBody = {
  integrationConnectionId?: unknown;
  scheduleEventId?: unknown;
};

async function getJsonBody(request: NextRequest): Promise<CalendarSyncBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as CalendarSyncBody) : {};
  } catch {
    return {};
  }
}

function getRequestString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveTargetName({
  serviceClient,
  event,
}: {
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
  event: {
    title: string;
    customer_id: string | null;
    lead_id: string | null;
    job_id: string | null;
  };
}) {
  if (event.customer_id) {
    const { data: customer } = await serviceClient
      .from("customers")
      .select("display_name,contact_name")
      .eq("id", event.customer_id)
      .maybeSingle();

    if (customer?.contact_name || customer?.display_name) {
      return customer.contact_name ?? customer.display_name;
    }
  }

  if (event.job_id) {
    const { data: job } = await serviceClient
      .from("jobs")
      .select("title")
      .eq("id", event.job_id)
      .maybeSingle();

    if (job?.title) {
      return job.title;
    }
  }

  if (event.lead_id) {
    const { data: lead } = await serviceClient
      .from("leads")
      .select("contact_name")
      .eq("id", event.lead_id)
      .maybeSingle();

    if (lead?.contact_name) {
      return lead.contact_name;
    }
  }

  return event.title;
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();

  if (!client || !serviceClient) {
    return NextResponse.json(
      { ok: false, synced: false, message: "Server-side CRM access is not configured." },
      { status: 503 },
    );
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, synced: false, message: "Sign in before syncing Google Calendar." },
      { status: 401 },
    );
  }

  const body = await getJsonBody(request);
  const integrationConnectionId = getRequestString(body.integrationConnectionId);
  const scheduleEventId = getRequestString(body.scheduleEventId);

  if (!integrationConnectionId || !scheduleEventId) {
    return NextResponse.json(
      {
        ok: false,
        synced: false,
        message: "Select a Google Calendar connection and schedule event before syncing.",
      },
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
      { ok: false, synced: false, message: "Google Calendar connection was not found." },
      { status: 404 },
    );
  }

  const { data: event } = await client
    .from("schedule_events")
    .select("*")
    .eq("id", scheduleEventId)
    .eq("company_id", connection.company_id)
    .single();

  if (!event) {
    return NextResponse.json(
      { ok: false, synced: false, message: "Schedule event was not found." },
      { status: 404 },
    );
  }

  const [{ data: calendar }, { data: sync }, { data: credential }] = await Promise.all([
    serviceClient
      .from("google_calendar_connected_calendars")
      .select("*")
      .eq("integration_connection_id", connection.id)
      .eq("google_calendar_id", connection.default_calendar_id ?? "primary")
      .maybeSingle(),
    serviceClient
      .from("calendar_event_syncs")
      .select("*")
      .eq("integration_connection_id", connection.id)
      .eq("schedule_event_id", event.id)
      .maybeSingle(),
    serviceClient
      .from("google_calendar_credentials")
      .select("*")
      .eq("integration_connection_id", connection.id)
      .maybeSingle(),
  ]);
  const targetName = await resolveTargetName({ serviceClient, event });
  const plan = buildGoogleCalendarEventSyncPlan({
    event,
    targetName,
    connection,
    calendar,
    sync,
  });
  const [
    { data: companyScheduleEvents },
    { data: companyJobAssignments },
    { data: companyCalendarSyncs },
  ] = await Promise.all([
    client
      .from("schedule_events")
      .select("*")
      .eq("company_id", event.company_id)
      .order("start_at", { ascending: true }),
    client
      .from("job_assignments")
      .select("*")
      .eq("company_id", event.company_id),
    serviceClient
      .from("calendar_event_syncs")
      .select("*")
      .eq("company_id", event.company_id)
      .eq("provider", "google_calendar"),
  ]);
  const conflicts = detectGoogleCalendarSchedulingConflicts({
    scheduleEvents: companyScheduleEvents?.length ? companyScheduleEvents : [event],
    jobAssignments: companyJobAssignments ?? [],
    syncs: companyCalendarSyncs ?? (sync ? [sync] : []),
  }).filter((conflict) => conflict.scheduleEventIds.includes(event.id));
  const now = new Date().toISOString();

  if (conflicts.length) {
    await serviceClient.from("calendar_event_syncs").upsert(
      {
        company_id: event.company_id,
        schedule_event_id: event.id,
        integration_connection_id: connection.id,
        provider: "google_calendar",
        google_calendar_id: plan.calendarId,
        google_event_id: sync?.google_event_id ?? null,
        sync_status: "conflict",
        sync_direction: connection.sync_direction,
        conflict_status: "confirmed",
        conflict_reason: conflicts[0].message,
        last_error: conflicts[0].message,
        last_payload_hash: plan.payloadHash,
        metadata: {
          conflictType: conflicts[0].type,
        },
      },
      { onConflict: "integration_connection_id,schedule_event_id" },
    );

    return NextResponse.json(
      {
        ok: false,
        synced: false,
        message: conflicts[0].message,
        conflict: conflicts[0],
      },
      { status: 409 },
    );
  }

  let accessToken: string | null = null;

  if (credential?.encrypted_refresh_token) {
    const refresh = await refreshGoogleAccessToken({
      refreshToken: decryptGoogleToken(credential.encrypted_refresh_token),
    });

    if (refresh.ok && refresh.accessToken) {
      accessToken = refresh.accessToken;
      await serviceClient
        .from("google_calendar_credentials")
        .update({
          encrypted_access_token: encryptGoogleToken(refresh.accessToken),
          token_expires_at: refresh.expiresAt,
          token_type: refresh.tokenType,
          scopes: refresh.scope?.length ? refresh.scope : credential.scopes,
          last_refreshed_at: now,
        })
        .eq("id", credential.id);
    } else {
      await serviceClient
        .from("integration_connections")
        .update({
          status: "needs_reauth",
          last_error: refresh.error,
          last_failure_at: now,
        })
        .eq("id", connection.id);
    }
  }

  const result = await syncGoogleCalendarEvent({
    event,
    targetName,
    connection,
    calendar,
    sync,
    accessToken,
  });

  await serviceClient.from("calendar_event_syncs").upsert(
    {
      company_id: event.company_id,
      schedule_event_id: event.id,
      integration_connection_id: connection.id,
      provider: "google_calendar",
      google_calendar_id: result.plan?.calendarId ?? plan.calendarId,
      google_event_id: result.synced ? result.googleEventId : sync?.google_event_id ?? null,
      google_event_etag: result.synced ? result.googleEventEtag : sync?.google_event_etag ?? null,
      sync_status: result.synced
        ? "synced"
        : result.status === "disabled"
          ? plan.syncStatus
          : "error",
      sync_direction: connection.sync_direction,
      last_synced_at: result.synced ? now : sync?.last_synced_at ?? null,
      external_updated_at: result.synced
        ? result.providerUpdatedAt
        : sync?.external_updated_at ?? null,
      provider_updated_at: result.synced
        ? result.providerUpdatedAt
        : sync?.provider_updated_at ?? null,
      conflict_status: "none",
      conflict_reason: null,
      sync_attempt_count: (sync?.sync_attempt_count ?? 0) + (result.attempted ? 1 : 0),
      last_synced_direction: result.synced ? "weathertech_to_provider" : null,
      last_error: result.synced ? null : result.message,
      last_payload_hash: result.plan?.payloadHash ?? plan.payloadHash,
      metadata: {
        writeEnabled: result.plan?.writeEnabled ?? plan.writeEnabled,
        attemptedProviderWrite: result.attempted,
        resultStatus: result.status,
      },
    },
    { onConflict: "integration_connection_id,schedule_event_id" },
  );

  await serviceClient.from("integration_sync_logs").insert({
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    provider: "google_calendar",
    direction: "weathertech_to_provider",
    event_type: GOOGLE_CALENDAR_SYNC_EVENT_TYPE,
    status: result.synced ? "succeeded" : result.status === "disabled" ? "skipped" : "failed",
    related_table: "schedule_events",
    related_record_id: event.id,
    external_id: result.synced ? result.googleEventId : sync?.google_event_id ?? null,
    request_fingerprint: result.plan?.payloadHash ?? plan.payloadHash,
    request_summary: {
      scheduleEventId: event.id,
      calendarId: result.plan?.calendarId ?? plan.calendarId,
      action: result.plan?.action ?? plan.action,
      writeEnabled: result.plan?.writeEnabled ?? plan.writeEnabled,
    },
    response_summary: {
      synced: result.synced,
      status: result.status,
      providerUpdatedAt: result.synced ? result.providerUpdatedAt : null,
    },
    error_code: result.synced ? null : result.status,
    error_message: result.synced ? null : result.message,
    completed_at: now,
  });

  const safeNoWriteResult = !result.synced && result.status === "disabled";

  return NextResponse.json(
    {
      ok: result.synced || safeNoWriteResult,
      synced: result.synced,
      writeDisabled: safeNoWriteResult,
      result,
      message: result.message,
    },
    { status: result.synced || safeNoWriteResult ? 200 : result.attempted ? 502 : 409 },
  );
}
