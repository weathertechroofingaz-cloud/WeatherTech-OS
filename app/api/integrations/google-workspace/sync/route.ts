import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  buildGmailMessageImportPlan,
  createServiceSupabaseClient,
  decryptGoogleToken,
  encryptGoogleToken,
  getGmailMessage,
  GMAIL_EMAIL_SYNC_EVENT_TYPE,
  listGmailMessages,
  refreshGoogleAccessToken,
} from "../../../../../lib/googleWorkspace/serverClient";
import type { CrmSnapshot } from "../../../../../lib/crm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SyncBody = {
  integrationConnectionId?: unknown;
};

async function getJsonBody(request: NextRequest): Promise<SyncBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as SyncBody) : {};
  } catch {
    return {};
  }
}

function getRequestString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadSyncSnapshot(
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
): Promise<Pick<CrmSnapshot, "customers" | "leads" | "jobs" | "estimates" | "emailMessages">> {
  const [customers, leads, jobs, estimates, emailMessages] = await Promise.all([
    serviceClient.from("customers").select("*"),
    serviceClient.from("leads").select("*"),
    serviceClient.from("jobs").select("*"),
    serviceClient.from("estimates").select("*"),
    serviceClient.from("email_messages").select("*"),
  ]);

  return {
    customers: customers.data ?? [],
    leads: leads.data ?? [],
    jobs: jobs.data ?? [],
    estimates: estimates.data ?? [],
    emailMessages: emailMessages.data ?? [],
  };
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();

  if (!client || !serviceClient) {
    return NextResponse.json(
      { ok: false, imported: 0, message: "Server-side CRM access is not configured." },
      { status: 503 },
    );
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, imported: 0, message: "Sign in before syncing Gmail." },
      { status: 401 },
    );
  }

  const body = await getJsonBody(request);
  const integrationConnectionId = getRequestString(body.integrationConnectionId);

  if (!integrationConnectionId) {
    return NextResponse.json(
      { ok: false, imported: 0, message: "Select a Gmail connection before syncing." },
      { status: 400 },
    );
  }

  const { data: connection } = await client
    .from("integration_connections")
    .select("*")
    .eq("id", integrationConnectionId)
    .eq("provider", "gmail")
    .single();

  if (!connection) {
    return NextResponse.json(
      { ok: false, imported: 0, message: "The Gmail connection could not be loaded." },
      { status: 404 },
    );
  }

  const { data: credential } = await serviceClient
    .from("gmail_mailbox_credentials")
    .select("*")
    .eq("integration_connection_id", connection.id)
    .maybeSingle();

  if (!credential?.encrypted_refresh_token) {
    await client
      .from("integration_connections")
      .update({
        status: "needs_reauth",
        last_error: "Reconnect Gmail before syncing this mailbox.",
        last_failure_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    return NextResponse.json(
      { ok: false, imported: 0, message: "Reconnect Gmail before syncing this mailbox." },
      { status: 409 },
    );
  }

  const refresh = await refreshGoogleAccessToken({
    refreshToken: decryptGoogleToken(credential.encrypted_refresh_token),
  });

  if (!refresh.ok || !refresh.accessToken) {
    await client
      .from("integration_connections")
      .update({
        status: "needs_reauth",
        last_error: refresh.error,
        last_failure_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    return NextResponse.json(
      { ok: false, imported: 0, message: refresh.error },
      { status: 409 },
    );
  }

  await serviceClient
    .from("gmail_mailbox_credentials")
    .update({
      encrypted_access_token: encryptGoogleToken(refresh.accessToken),
      token_expires_at: refresh.expiresAt,
      token_type: refresh.tokenType,
      scopes: refresh.scope ?? credential.scopes,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("id", credential.id);

  const list = await listGmailMessages({
    accessToken: refresh.accessToken,
    historyId: connection.sync_token,
  });

  if (!list.ok) {
    await client
      .from("integration_connections")
      .update({
        status: "error",
        last_error: "Gmail message list request failed.",
        last_failure_at: new Date().toISOString(),
      })
      .eq("id", connection.id);
    return NextResponse.json(
      { ok: false, imported: 0, message: "Gmail message list request failed." },
      { status: 502 },
    );
  }

  const messageRefs = Array.isArray(list.payload.messages)
    ? list.payload.messages
        .map((item) =>
          item && typeof item === "object" && "id" in item && typeof item.id === "string"
            ? item.id
            : null,
        )
        .filter((id): id is string => Boolean(id))
        .slice(0, 10)
    : [];
  const snapshot = await loadSyncSnapshot(serviceClient);
  let imported = 0;
  let duplicates = 0;
  let failed = 0;

  for (const messageId of messageRefs) {
    const loadedMessage = await getGmailMessage({
      accessToken: refresh.accessToken,
      messageId,
    });

    if (!loadedMessage.ok) {
      failed += 1;
      continue;
    }

    const plan = buildGmailMessageImportPlan({
      mailbox: {
        integrationConnectionId: connection.id,
        companyId: connection.company_id,
        accountEmail: connection.account_email ?? credential.account_email,
        providerAccountId:
          connection.provider_account_id ?? credential.provider_account_id,
      },
      message: loadedMessage.payload,
      snapshot,
    });

    if (plan.duplicate || !plan.emailMessage) {
      duplicates += 1;
      continue;
    }

    const { data: createdEmail } = await serviceClient
      .from("email_messages")
      .insert(plan.emailMessage)
      .select("*")
      .single();

    if (!createdEmail) {
      failed += 1;
      continue;
    }

    if (plan.thread) {
      await serviceClient.from("gmail_email_threads").upsert(plan.thread, {
        onConflict: "integration_connection_id,gmail_thread_id",
      });
    }

    for (const attachment of plan.attachments) {
      await serviceClient.from("gmail_email_attachments").insert({
        ...attachment,
        email_message_id: createdEmail.id,
      });
    }

    snapshot.emailMessages.push(createdEmail);
    imported += 1;
  }

  const now = new Date().toISOString();
  await client
    .from("integration_connections")
    .update({
      status: "connected",
      last_sync_at: now,
      last_successful_sync_at: now,
      last_error: failed ? `${failed} Gmail messages could not be imported.` : null,
      sync_token:
        typeof list.payload.historyId === "string"
          ? list.payload.historyId
          : connection.sync_token,
    })
    .eq("id", connection.id);
  await serviceClient.from("integration_sync_logs").insert({
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    provider: "gmail",
    direction: "provider_to_weathertech",
    event_type: GMAIL_EMAIL_SYNC_EVENT_TYPE,
    status: failed ? "retrying" : "succeeded",
    request_summary: {
      manualSync: true,
      messageRefs: messageRefs.length,
    },
    response_summary: {
      imported,
      duplicates,
      failed,
    },
    completed_at: now,
  });

  return NextResponse.json({
    ok: failed === 0,
    imported,
    duplicates,
    failed,
    message:
      failed === 0
        ? "Gmail sync completed."
        : "Gmail sync completed with messages needing retry.",
  });
}
