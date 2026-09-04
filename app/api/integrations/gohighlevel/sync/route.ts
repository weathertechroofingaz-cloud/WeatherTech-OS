import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  createGoHighLevelFingerprint,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
} from "../../../../../lib/gohighlevel/oauth";
import { synchronizeGoHighLevelConnection } from "../../../../../lib/gohighlevel/sync";
import { readBoundedJsonBody } from "../../../../../lib/http/boundedJson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;
const MAX_SYNC_REQUEST_BODY_BYTES = 4_096;
const SYNC_LEASE_SECONDS = 180;
const SYNC_HEARTBEAT_INTERVAL_MS = 45_000;

function noStoreJson(
  body: Record<string, unknown>,
  status = 200,
  headers: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseRenewalReceipt(
  value: unknown,
  expected: {
    syncLogId: string;
    companyId: string;
    integrationConnectionId: string;
  },
) {
  const receipt = asRecord(value);
  const leaseExpiresAt =
    typeof receipt?.leaseExpiresAt === "string"
      ? Date.parse(receipt.leaseExpiresAt)
      : Number.NaN;
  return receipt?.contractVersion === 1 &&
    receipt.disposition === "renewed" &&
    receipt.syncLogId === expected.syncLogId &&
    receipt.companyId === expected.companyId &&
    receipt.integrationConnectionId === expected.integrationConnectionId &&
    receipt.status === "running" &&
    Number.isFinite(leaseExpiresAt) &&
    leaseExpiresAt > Date.now()
    ? receipt
    : null;
}

export async function POST(request: NextRequest) {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createGoHighLevelServiceClient();
  const config = getGoHighLevelOAuthConfig();

  if (!sessionClient || !serviceClient) {
    return noStoreJson(
      { ok: false, message: "Server-side Supabase access is required." },
      503,
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return noStoreJson(
      { ok: false, message: "Sign in before synchronizing HighLevel." },
      401,
    );
  }

  if (!config.syncEnabled) {
    return noStoreJson(
      {
        ok: false,
        message: "GoHighLevel inbound synchronization is disabled by the server feature gate.",
      },
      503,
    );
  }

  const bodyResult = await readBoundedJsonBody(request, MAX_SYNC_REQUEST_BODY_BYTES);
  if (!bodyResult.ok) {
    return noStoreJson(
      {
        ok: false,
        message:
          bodyResult.reason === "too_large"
            ? "HighLevel synchronization request is too large."
            : "HighLevel synchronization request must be valid JSON.",
      },
      bodyResult.reason === "too_large" ? 413 : 400,
    );
  }
  const body: unknown = bodyResult.value;
  const connectionId =
    body &&
    typeof body === "object" &&
    typeof (body as Record<string, unknown>).integrationConnectionId === "string"
      ? String((body as Record<string, unknown>).integrationConnectionId).trim()
      : "";
  if (!connectionId) {
    return noStoreJson(
      { ok: false, message: "Select a GoHighLevel connection to synchronize." },
      400,
    );
  }

  const { data: connection, error: connectionError } = await sessionClient
    .from("integration_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("provider", "gohighlevel")
    .maybeSingle();
  if (connectionError) {
    return noStoreJson(
      { ok: false, message: "The GoHighLevel connection could not be verified." },
      503,
    );
  }
  if (!connection) {
    return noStoreJson(
      { ok: false, message: "The GoHighLevel connection is unavailable." },
      404,
    );
  }

  const { data: ownerMembership, error: ownerMembershipError } = await sessionClient
    .from("company_memberships")
    .select("user_id, company_id, role")
    .eq("company_id", connection.company_id)
    .eq("user_id", userResult.user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerMembershipError) {
    return noStoreJson(
      { ok: false, message: "HighLevel owner access could not be verified." },
      503,
    );
  }
  if (!ownerMembership) {
    return noStoreJson(
      { ok: false, message: "A company owner must run the HighLevel synchronization." },
      403,
    );
  }

  const { data: connectedCompanyMappings, error: mappingError } =
    await sessionClient
      .from("integration_connections")
      .select("id, external_account_id")
      .eq("company_id", connection.company_id)
      .eq("provider", "gohighlevel")
      .eq("status", "connected")
      .not("external_account_id", "is", null)
      .limit(2);
  if (mappingError) {
    return noStoreJson(
      { ok: false, message: "The exact HighLevel company mapping could not be verified." },
      503,
    );
  }
  if (
    connectedCompanyMappings?.length !== 1 ||
    connectedCompanyMappings[0]?.id !== connection.id ||
    connectedCompanyMappings[0]?.external_account_id !==
      connection.external_account_id
  ) {
    return noStoreJson(
      {
        ok: false,
        message:
          "This company must have exactly one connected HighLevel location before synchronization.",
      },
      409,
    );
  }

  const startedAt = new Date().toISOString();
  const claimToken = randomUUID();
  const requestFingerprint = createGoHighLevelFingerprint({
    connectionId,
    companyId: connection.company_id,
    locationId: connection.external_account_id,
    startedAt,
  });
  const { data: claimData, error: claimError } = await serviceClient.rpc(
    "wtos_claim_gohighlevel_sync_v1",
    {
      p_claim: {
        contractVersion: 1,
        companyId: connection.company_id,
        integrationConnectionId: connection.id,
        claimToken,
        leaseSeconds: SYNC_LEASE_SECONDS,
        requestFingerprint,
      },
    },
  );
  const claim = asRecord(claimData);
  if (claimError || !claim) {
    return noStoreJson(
      {
        ok: false,
        message: "HighLevel synchronization could not acquire a durable run lease.",
      },
      503,
    );
  }
  if (claim.disposition === "busy") {
    const leaseExpiresAt =
      typeof claim.leaseExpiresAt === "string"
        ? Date.parse(claim.leaseExpiresAt)
        : Number.NaN;
    const retryAfterSeconds = Number.isFinite(leaseExpiresAt)
      ? Math.max(1, Math.min(600, Math.ceil((leaseExpiresAt - Date.now()) / 1000)))
      : 30;
    return noStoreJson(
      {
        ok: false,
        busy: true,
        message: "A HighLevel synchronization is already running for this company.",
      },
      409,
      { "Retry-After": String(retryAfterSeconds) },
    );
  }
  const syncLogId =
    claim.disposition === "claimed" && typeof claim.syncLogId === "string"
      ? claim.syncLogId
      : null;
  if (!syncLogId) {
    return noStoreJson(
      {
        ok: false,
        message: "The selected HighLevel company mapping is unavailable for synchronization.",
      },
      503,
    );
  }

  let nextHeartbeatAt = Date.now() + SYNC_HEARTBEAT_INTERVAL_MS;
  let heartbeatInFlight: Promise<void> | null = null;
  const heartbeatIfDue = async () => {
    if (Date.now() < nextHeartbeatAt) return;
    if (heartbeatInFlight) return heartbeatInFlight;

    const renewal = (async () => {
      const { data, error } = await serviceClient.rpc(
        "wtos_renew_gohighlevel_sync_v1",
        {
          p_renewal: {
            contractVersion: 1,
            syncLogId,
            companyId: connection.company_id,
            integrationConnectionId: connection.id,
            claimToken,
            leaseSeconds: SYNC_LEASE_SECONDS,
          },
        },
      );
      if (
        error ||
        !parseRenewalReceipt(data, {
          syncLogId,
          companyId: connection.company_id,
          integrationConnectionId: connection.id,
        })
      ) {
        throw new Error("HighLevel synchronization lease could not be renewed safely.");
      }
      nextHeartbeatAt = Date.now() + SYNC_HEARTBEAT_INTERVAL_MS;
    })();
    heartbeatInFlight = renewal;
    try {
      await renewal;
    } finally {
      if (heartbeatInFlight === renewal) heartbeatInFlight = null;
    }
  };

  const completeSync = async ({
    outcome,
    errorCode,
    responseSummary,
  }: {
    outcome: "succeeded" | "failed";
    errorCode:
      | null
      | "gohighlevel_partial_sync"
      | "gohighlevel_sync_failed";
    responseSummary: Record<string, unknown>;
  }) => {
    const { data, error } = await serviceClient.rpc(
      "wtos_complete_gohighlevel_sync_v1",
      {
        p_completion: {
          contractVersion: 1,
          syncLogId,
          companyId: connection.company_id,
          integrationConnectionId: connection.id,
          claimToken,
          outcome,
          errorCode,
          responseSummary,
        },
      },
    );
    const receipt = asRecord(data);
    return {
      ok: !error && receipt?.disposition === "completed",
      receipt,
    };
  };

  try {
    const result = await synchronizeGoHighLevelConnection({
      serviceClient,
      connection,
      heartbeat: heartbeatIfDue,
    });
    await heartbeatIfDue();
    const completion = await completeSync({
      outcome: result.ok ? "succeeded" : "failed",
      errorCode: result.ok ? null : "gohighlevel_partial_sync",
      responseSummary: {
        totalFetched: result.totalFetched,
        totalSaved: result.totalSaved,
        totalFailed: result.totalFailed,
        totalDuplicatesSuppressed: result.totalDuplicatesSuppressed,
        pagination: result.pagination,
        providerRequests: result.providerRequests,
        tokenRefreshed: result.tokenRefreshed,
        resources: result.resources,
        providerRecordsChanged: false,
      },
    });
    if (!completion.ok) {
      throw new Error("HighLevel synchronization result could not be logged durably.");
    }

    return noStoreJson({
      ...result,
      message: result.ok
        ? "GoHighLevel inbound synchronization completed. No provider records were changed."
        : "GoHighLevel synchronization completed with resource errors.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "GoHighLevel synchronization failed.";
    const failedCompletion = await completeSync({
      outcome: "failed",
      errorCode: "gohighlevel_sync_failed",
      responseSummary: { providerRecordsChanged: false },
    });
    return noStoreJson(
      {
        ok: false,
        message: !failedCompletion.ok
          ? "HighLevel synchronization and its failure log could not be completed safely."
          : message,
      },
      502,
    );
  }
}
