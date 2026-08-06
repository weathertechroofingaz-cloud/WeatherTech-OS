import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  createGmailOutboundPayloadFingerprint,
  hasRequiredGmailSendScopes,
} from "../../../../../lib/crm/integrations";
import {
  buildEstimatePdfAttachment,
  createServiceSupabaseClient,
  decryptGoogleToken,
  encryptGoogleToken,
  GMAIL_EMAIL_SEND_EVENT_TYPE,
  getGoogleWorkspaceConfigCheckResult,
  refreshGoogleAccessToken,
  sendGmailEmail,
  validateGmailOutboundRecipients,
  validateGmailOwnerApproval,
  type GmailOutboundAttachment,
} from "../../../../../lib/googleWorkspace/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SendBody = {
  emailMessageId?: unknown;
  approvalAction?: unknown;
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

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadOutboundAttachments({
  serviceClient,
  message,
}: {
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
  message: NonNullable<Awaited<ReturnType<typeof loadEmailMessage>>>;
}) {
  const attachments: GmailOutboundAttachment[] = [];

  if (message.document_id) {
    const { data: document } = await serviceClient
      .from("documents")
      .select("*")
      .eq("id", message.document_id)
      .eq("company_id", message.company_id)
      .maybeSingle();

    if (document?.storage_path) {
      const { data, error } = await serviceClient.storage
        .from(document.storage_bucket ?? "customer-documents")
        .download(document.storage_path);

      if (error || !data) {
        throw new Error("The approved document attachment could not be loaded from Storage.");
      }

      attachments.push({
        fileName: document.file_name ?? `${document.title}.pdf`,
        mimeType: document.mime_type ?? "application/octet-stream",
        content: Buffer.from(await data.arrayBuffer()),
      });
    }
  }

  const hasPdf = attachments.some((attachment) => attachment.mimeType === "application/pdf");

  if (message.estimate_id && !hasPdf) {
    const [{ data: estimate }, { data: lineItems }, { data: company }, { data: customer }] =
      await Promise.all([
        serviceClient
          .from("estimates")
          .select("*")
          .eq("id", message.estimate_id)
          .eq("company_id", message.company_id)
          .maybeSingle(),
        serviceClient
          .from("estimate_line_items")
          .select("*")
          .eq("estimate_id", message.estimate_id)
          .order("sort_order", { ascending: true }),
        serviceClient
          .from("companies")
          .select("*")
          .eq("id", message.company_id)
          .maybeSingle(),
        message.customer_id
          ? serviceClient
              .from("customers")
              .select("*")
              .eq("id", message.customer_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

    if (!estimate || !company) {
      throw new Error("The estimate PDF attachment could not be generated from CRM records.");
    }

    const proposalNumber = getMetadataString(message.metadata, "proposalNumber");
    attachments.push(
      buildEstimatePdfAttachment({
        estimate,
        lineItems: lineItems ?? [],
        companyName: company.name,
        customerName: customer?.display_name ?? null,
        fileName: proposalNumber ? `${proposalNumber}.pdf` : null,
      }),
    );
  }

  const totalBytes = attachments.reduce(
    (total, attachment) => total + attachment.content.byteLength,
    0,
  );

  if (totalBytes > 18 * 1024 * 1024) {
    throw new Error("Email attachments exceed the controlled 18 MB delivery limit.");
  }

  return attachments;
}

async function loadEmailMessage(
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  emailMessageId: string,
) {
  const { data } = await serviceClient
    .from("email_messages")
    .select("*")
    .eq("id", emailMessageId)
    .single();
  return data;
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
  const approvalAction = getRequestString(body.approvalAction);

  if (!emailMessageId) {
    return NextResponse.json(
      { ok: false, sent: false, message: "Select an email message before sending." },
      { status: 400 },
    );
  }

  const message = await loadEmailMessage(serviceClient, emailMessageId);

  if (!message) {
    return NextResponse.json(
      { ok: false, sent: false, message: "Email message could not be loaded." },
      { status: 404 },
    );
  }

  const { data: ownerMembership } = await client
    .from("company_memberships")
    .select("user_id, company_id, role")
    .eq("company_id", message.company_id)
    .eq("user_id", userResult.user.id)
    .eq("role", "owner")
    .maybeSingle();
  const approval = validateGmailOwnerApproval({
    message,
    isOwner: Boolean(ownerMembership),
    approvalAction,
  });

  if (!approval.ok) {
    return NextResponse.json(
      { ok: false, sent: false, approval, message: approval.message },
      { status: approval.status === "owner_required" ? 403 : 409 },
    );
  }

  const recipientValidation = validateGmailOutboundRecipients(message);

  if (!recipientValidation.ok) {
    return NextResponse.json(
      { ok: false, sent: false, message: recipientValidation.message },
      { status: 409 },
    );
  }

  if (!getGoogleWorkspaceConfigCheckResult().credentials.gmailSendEnabled) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          "No email was sent. GOOGLE_GMAIL_SEND_ENABLED must be explicitly enabled for controlled live sending.",
      },
      { status: 409 },
    );
  }

  const approvedPayloadHash = getMetadataString(message.metadata, "pendingPayloadHash");
  const currentPayloadHash = createGmailOutboundPayloadFingerprint(message);

  if (!approvedPayloadHash || approvedPayloadHash !== currentPayloadHash) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          "The queued email changed after approval submission. Review and submit it again before sending.",
      },
      { status: 409 },
    );
  }

  const { data: connection } = message.integration_connection_id
    ? await serviceClient
        .from("integration_connections")
        .select("*")
        .eq("id", message.integration_connection_id)
        .eq("company_id", message.company_id)
        .eq("provider", "gmail")
        .maybeSingle()
    : { data: null };

  if (
    !connection ||
    connection.status !== "connected" ||
    !connection.account_email ||
    !hasRequiredGmailSendScopes(connection.scopes) ||
    message.from_email?.trim().toLowerCase() !== connection.account_email.trim().toLowerCase()
  ) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          "The selected company mailbox is not connected with the required Gmail permissions.",
      },
      { status: 409 },
    );
  }

  const { data: credential } = message.integration_connection_id
    ? await serviceClient
        .from("gmail_mailbox_credentials")
        .select("*")
        .eq("integration_connection_id", message.integration_connection_id)
        .eq("company_id", message.company_id)
        .maybeSingle()
    : { data: null };
  if (!credential?.encrypted_refresh_token || credential.revoked_at) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message: "Reconnect the company Gmail mailbox before sending.",
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
      .eq("id", credential.integration_connection_id);
    return NextResponse.json(
      { ok: false, sent: false, message: refresh.error },
      { status: 409 },
    );
  }

  await serviceClient
    .from("gmail_mailbox_credentials")
    .update({
      encrypted_access_token: encryptGoogleToken(refresh.accessToken),
      token_expires_at: refresh.expiresAt,
      token_type: refresh.tokenType,
      scopes: refresh.scope.length ? refresh.scope : credential.scopes,
      last_refreshed_at: new Date().toISOString(),
    })
    .eq("id", credential.id);

  let attachments: GmailOutboundAttachment[] = [];

  try {
    attachments = await loadOutboundAttachments({ serviceClient, message });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          error instanceof Error
            ? error.message
            : "The approved email attachments could not be prepared.",
      },
      { status: 409 },
    );
  }

  const approvedAt = new Date().toISOString();
  const sendAttemptId = randomUUID();
  const approvalMetadata = {
    ...(message.metadata ?? {}),
    approvalState: "owner_approved",
    approvedBy: userResult.user.id,
    approvedAt,
    sendAttemptId,
    sendClaimedAt: approvedAt,
    approvedPayloadHash: currentPayloadHash,
  };
  const { data: claimedMessage, error: claimError } = await serviceClient
    .from("email_messages")
    .update({
      sync_status: "syncing",
      from_email: connection.account_email,
      provider_account_id: connection.external_account_id ?? connection.account_email,
      provider_payload_hash: currentPayloadHash,
      metadata: approvalMetadata,
      last_error: null,
    })
    .eq("id", message.id)
    .eq("company_id", message.company_id)
    .eq("status", "queued")
    .eq("sync_status", "queued")
    .select("*")
    .maybeSingle();

  if (claimError || !claimedMessage) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          "This email is already being delivered or is no longer pending owner approval. No duplicate send was attempted.",
      },
      { status: 409 },
    );
  }

  const result = await sendGmailEmail({
    message: {
      ...claimedMessage,
      from_email: connection.account_email,
      provider_account_id: connection.external_account_id ?? connection.account_email,
    },
    accessToken: refresh.accessToken,
    attachments,
  });
  const now = new Date().toISOString();
  const metadata = {
    ...approvalMetadata,
    approvalState: result.sent ? "sent" : "owner_approved",
    attachmentCountDelivered: attachments.length,
    gmailIdempotencyKey: result.idempotencyKey,
    providerSendAttempts: result.providerSendAttempts,
    duplicatePrevented: result.duplicatePrevented,
    reconciledFromProvider: result.reconciled,
  };

  if (result.sent) {
    await serviceClient
      .from("email_messages")
      .update({
        status: "sent",
        sent_at: now,
        gmail_message_id: result.gmailMessageId,
        gmail_thread_id: result.gmailThreadId,
        sync_status: "sent",
        last_error: null,
        metadata,
      })
      .eq("id", message.id)
      .eq("sync_status", "syncing");

    if (message.estimate_id) {
      await serviceClient
        .from("estimates")
        .update({ status: "sent" })
        .eq("id", message.estimate_id)
        .eq("company_id", message.company_id);
    }

    const proposalRevisionId = getMetadataString(message.metadata, "proposalRevisionId");
    if (proposalRevisionId) {
      await serviceClient
        .from("estimate_proposal_revisions")
        .update({ status: "sent", sent_at: now, immutable_after_at: now })
        .eq("id", proposalRevisionId)
        .eq("company_id", message.company_id);
    }

    if (message.document_id) {
      await serviceClient
        .from("documents")
        .update({ status: "sent" })
        .eq("id", message.document_id)
        .eq("company_id", message.company_id);
    }
  } else {
    await serviceClient
      .from("email_messages")
      .update({
        status: result.attempted ? "failed" : message.status,
        sync_status: result.attempted ? "failed" : "queued",
        last_error: result.message,
        metadata,
      })
      .eq("id", message.id)
      .eq("sync_status", "syncing");
  }

  await serviceClient
    .from("integration_connections")
    .update({
      last_sync_at: now,
      last_successful_sync_at: result.sent ? now : connection.last_successful_sync_at,
      last_failure_at: result.sent ? connection.last_failure_at : now,
      last_error: result.sent ? null : result.message,
    })
    .eq("id", connection.id)
    .eq("company_id", message.company_id)
    .eq("provider", "gmail");

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
      providerSendAttempts: result.providerSendAttempts,
      recipients: message.to_emails?.length ?? 1,
      ownerApproval: true,
      attachmentCount: attachments.length,
      htmlFormatting: true,
    },
    response_summary: {
      sent: result.sent,
      status: result.status,
      gmailThreadId: result.sent ? result.gmailThreadId : null,
      duplicatePrevented: result.duplicatePrevented,
      reconciledFromProvider: result.reconciled,
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
