import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  createServiceSupabaseClient,
  decryptGoogleToken,
  GMAIL_EMAIL_SEND_EVENT_TYPE,
  sendGmailEmail,
} from "../../../../../lib/googleWorkspace/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SendBody = {
  emailMessageId?: unknown;
};

async function getJsonBody(request: NextRequest): Promise<SendBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as SendBody) : {};
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
      { ok: false, sent: false, message: "Server-side CRM access is not configured." },
      { status: 503 },
    );
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, sent: false, message: "Sign in before sending Gmail email." },
      { status: 401 },
    );
  }

  const body = await getJsonBody(request);
  const emailMessageId = getRequestString(body.emailMessageId);

  if (!emailMessageId) {
    return NextResponse.json(
      { ok: false, sent: false, message: "Select an email message before sending." },
      { status: 400 },
    );
  }

  const { data: message } = await client
    .from("email_messages")
    .select("*")
    .eq("id", emailMessageId)
    .single();

  if (!message) {
    return NextResponse.json(
      { ok: false, sent: false, message: "Email message could not be loaded." },
      { status: 404 },
    );
  }

  const { data: credential } = message.integration_connection_id
    ? await serviceClient
        .from("gmail_mailbox_credentials")
        .select("*")
        .eq("integration_connection_id", message.integration_connection_id)
        .maybeSingle()
    : { data: null };
  const accessToken = credential?.encrypted_access_token
    ? decryptGoogleToken(credential.encrypted_access_token)
    : null;
  const result = await sendGmailEmail({ message, accessToken });
  const now = new Date().toISOString();

  if (result.sent) {
    await client
      .from("email_messages")
      .update({
        status: "sent",
        sent_at: now,
        gmail_message_id: result.gmailMessageId,
        gmail_thread_id: result.gmailThreadId,
        sync_status: "sent",
        last_error: null,
      })
      .eq("id", message.id);
  } else {
    await client
      .from("email_messages")
      .update({
        status: "failed",
        sync_status: "failed",
        last_error: result.message,
      })
      .eq("id", message.id);
  }

  await serviceClient.from("integration_sync_logs").insert({
    company_id: message.company_id,
    integration_connection_id: message.integration_connection_id,
    provider: "gmail",
    direction: "weathertech_to_provider",
    event_type: GMAIL_EMAIL_SEND_EVENT_TYPE,
    status: result.sent ? "succeeded" : "failed",
    related_table: "email_messages",
    related_record_id: message.id,
    external_id: result.sent ? result.gmailMessageId : null,
    request_summary: {
      emailMessageId: message.id,
      hasMailbox: Boolean(message.integration_connection_id),
      sendAttempted: result.attempted,
      recipients: message.to_emails?.length ?? 1,
    },
    response_summary: {
      sent: result.sent,
      status: result.status,
      gmailThreadId: result.sent ? result.gmailThreadId : null,
    },
    error_code: result.sent ? null : result.status,
    error_message: result.sent ? null : result.message,
    completed_at: now,
  });

  return NextResponse.json(
    {
      ok: result.sent,
      sent: result.sent,
      result,
    },
    { status: result.sent ? 200 : result.attempted ? 502 : 409 },
  );
}
