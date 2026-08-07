import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  GOHIGHLEVEL_SYNC_EVENT_TYPE,
  createGoHighLevelFingerprint,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
} from "../../../../../lib/gohighlevel/oauth";
import { synchronizeGoHighLevelConnection } from "../../../../../lib/gohighlevel/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createGoHighLevelServiceClient();
  const config = getGoHighLevelOAuthConfig();

  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before synchronizing HighLevel." },
      { status: 401 },
    );
  }

  if (!config.syncEnabled) {
    return NextResponse.json(
      {
        ok: false,
        message: "GoHighLevel inbound synchronization is disabled by the server feature gate.",
      },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => ({}));
  const connectionId =
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).integrationConnectionId === "string"
      ? String((body as Record<string, unknown>).integrationConnectionId).trim()
      : "";
  if (!connectionId) {
    return NextResponse.json(
      { ok: false, message: "Select a GoHighLevel connection to synchronize." },
      { status: 400 },
    );
  }

  const { data: connection } = await sessionClient
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("provider", "gohighlevel")
    .maybeSingle();
  if (!connection) {
    return NextResponse.json(
      { ok: false, message: "The GoHighLevel connection is unavailable." },
      { status: 404 },
    );
  }

  const { data: ownerMembership } = await sessionClient
    .from("company_memberships")
    .select("user_id, company_id, role")
    .eq("company_id", connection.company_id)
    .eq("user_id", userResult.user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!ownerMembership) {
    return NextResponse.json(
      { ok: false, message: "A company owner must run the HighLevel synchronization." },
      { status: 403 },
    );
  }

  const startedAt = new Date().toISOString();
  const requestFingerprint = createGoHighLevelFingerprint({
    connectionId,
    companyId: connection.company_id,
    locationId: connection.external_account_id,
    startedAt,
  });
  const { data: syncLog } = await serviceClient
    .from("integration_sync_logs")
    .insert({
      company_id: connection.company_id,
      integration_connection_id: connection.id,
      provider: "gohighlevel",
      direction: "provider_to_weathertech",
      event_type: GOHIGHLEVEL_SYNC_EVENT_TYPE,
      status: "running",
      attempt_count: 1,
      last_attempted_at: startedAt,
      request_fingerprint: requestFingerprint,
      request_summary: { readOnlyProviderSync: true, outboundWrites: false },
    })
    .select("id")
    .maybeSingle();

  try {
    const result = await synchronizeGoHighLevelConnection({
      serviceClient,
      connection,
    });
    if (syncLog) {
      await serviceClient
        .from("integration_sync_logs")
        .update({
          status: result.ok ? "succeeded" : "failed",
          completed_at: result.checkedAt,
          response_summary: {
            totalFetched: result.totalFetched,
            totalSaved: result.totalSaved,
            totalFailed: result.totalFailed,
            tokenRefreshed: result.tokenRefreshed,
            resources: result.resources,
          },
          error_code: result.ok ? null : "gohighlevel_partial_sync",
          error_message: result.ok
            ? null
            : "One or more HighLevel resources failed to synchronize.",
        })
        .eq("id", syncLog.id);
    }

    return NextResponse.json({
      ...result,
      message: result.ok
        ? "GoHighLevel inbound synchronization completed. No provider records were changed."
        : "GoHighLevel synchronization completed with resource errors.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GoHighLevel synchronization failed.";
    if (syncLog) {
      await serviceClient
        .from("integration_sync_logs")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_code: "gohighlevel_sync_failed",
          error_message: message,
          response_summary: { providerRecordsChanged: false },
        })
        .eq("id", syncLog.id);
    }
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
