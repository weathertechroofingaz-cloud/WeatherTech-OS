import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  createGmailOutboundPayloadFingerprint,
  hasRequiredGmailSendScopes,
} from "../../../../../lib/crm/integrations";
import type { EmailMessageRecord } from "../../../../../lib/crm/types";
import {
  buildEstimatePdfAttachment,
  createServiceSupabaseClient,
  decryptGoogleToken,
  encryptGoogleToken,
  GMAIL_EMAIL_SEND_EVENT_TYPE,
  getGoogleWorkspaceConfigCheckResult,
  hashProposalDocumentContent,
  materializeProposalSignatureEmail,
  refreshGoogleAccessToken,
  sendGmailEmail,
  validateGmailOutboundRecipients,
  validateGmailOwnerApproval,
  type GmailOutboundAttachment,
  type GmailSendResult,
} from "../../../../../lib/googleWorkspace/serverClient";
import {
  PROPOSAL_SIGNING_CONSENT_TEXT,
  PROPOSAL_SIGNING_CONSENT_VERSION,
  PROPOSAL_SIGNING_LINK_PLACEHOLDER,
  buildProposalSigningUrl,
  isProposalSigningPublicId,
} from "../../../../../lib/proposal-signing/constants";
import {
  generateProposalSigningToken,
  getConfiguredProposalSigningOrigin,
  hashProposalSigningToken,
  normalizeProposalSigningOrigin,
} from "../../../../../lib/proposal-signing/security";
import { PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE } from "../../../../../lib/googleWorkspace/emailDrafts";
import { transitionProposalSignatureEmail } from "../../../../../lib/proposal-signing/emailDelivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GMAIL_PRE_SEND_CLAIM_STALE_MS = 2 * 60 * 1000;
const GMAIL_DELIVERY_STATE_PRE_SEND = "claimed_pre_send";
const GMAIL_DELIVERY_STATE_UNKNOWN = "provider_outcome_unknown";
const GMAIL_DELIVERY_STATE_CONFIRMED = "provider_confirmed";

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

function getMetadataNumber(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getGmailDeliveryState(message: {
  metadata?: Record<string, unknown>;
}) {
  return getMetadataString(message.metadata, "gmailDeliveryState");
}

function isStalePreSendClaim(
  message: {
    status: string;
    sync_status?: string;
    metadata?: Record<string, unknown>;
  },
  now = Date.now(),
) {
  const claimedAt = Date.parse(
    getMetadataString(message.metadata, "sendClaimedAt") ?? "",
  );
  return (
    message.status === "queued" &&
    message.sync_status === "syncing" &&
    getGmailDeliveryState(message) === GMAIL_DELIVERY_STATE_PRE_SEND &&
    Number.isFinite(claimedAt) &&
    claimedAt <= now - GMAIL_PRE_SEND_CLAIM_STALE_MS
  );
}

function isProviderOutcomeRecovery(message: {
  status: string;
  sync_status?: string;
  metadata?: Record<string, unknown>;
}) {
  const state = getGmailDeliveryState(message);
  return (
    message.status === "queued" &&
    message.sync_status === "syncing" &&
    (state === GMAIL_DELIVERY_STATE_UNKNOWN ||
      state === GMAIL_DELIVERY_STATE_CONFIRMED)
  );
}

function deterministicUuid(seed: string) {
  const digest = createHash("sha256").update(seed, "utf8").digest("hex");
  const variant = ((Number.parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function isSha256(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function isProposalSignatureDelivery(message: {
  metadata?: Record<string, unknown>;
}) {
  return (
    getMetadataString(message.metadata, "draftType") ===
    PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE
  );
}

function getProposalSignatureDeliveryMetadata(message: {
  document_id: string | null;
  body: string;
  metadata?: Record<string, unknown>;
}) {
  if (!isProposalSignatureDelivery(message)) {
    return null;
  }

  const requestId = getMetadataString(message.metadata, "proposalSigningRequestId");
  const proposalRevisionId = getMetadataString(message.metadata, "proposalRevisionId");
  const proposalDocumentId = getMetadataString(message.metadata, "proposalDocumentId");
  const documentSha256 = getMetadataString(message.metadata, "proposalDocumentSha256");
  const revisionSha256 = getMetadataString(message.metadata, "proposalRevisionSha256");
  const termsSha256 = getMetadataString(message.metadata, "proposalTermsSha256");
  const placeholder = getMetadataString(message.metadata, "signingLinkPlaceholder");
  const placeholderCount = message.body.split(PROPOSAL_SIGNING_LINK_PLACEHOLDER).length - 1;

  if (
    !isProposalSigningPublicId(requestId) ||
    !isProposalSigningPublicId(proposalRevisionId) ||
    !isProposalSigningPublicId(proposalDocumentId) ||
    proposalDocumentId !== message.document_id ||
    !isSha256(documentSha256) ||
    !isSha256(revisionSha256) ||
    !isSha256(termsSha256) ||
    placeholder !== PROPOSAL_SIGNING_LINK_PLACEHOLDER ||
    placeholderCount !== 1
  ) {
    throw new Error(
      "The approved signature email is not bound to one exact immutable proposal artifact.",
    );
  }

  return {
    requestId,
    proposalRevisionId,
    proposalDocumentId,
    documentSha256: documentSha256.toLowerCase(),
    revisionSha256: revisionSha256.toLowerCase(),
    termsSha256: termsSha256.toLowerCase(),
  };
}

async function callProposalDeliveryRpc(
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  functionName: string,
  args: Record<string, unknown>,
) {
  return (await serviceClient.rpc(functionName as never, args as never)) as unknown as {
    data: unknown;
    error: {
      code?: string;
      details?: string;
      hint?: string;
      message?: string;
    } | null;
    status: number;
  };
}

function isRetryableProposalDeliveryRpcFailure(result: {
  error: { code?: string; message?: string } | null;
  status: number;
}) {
  return Boolean(
    result.error &&
      (result.status === 0 ||
        result.status >= 500 ||
        (!result.error.code && /fetch|network|timeout/i.test(result.error.message ?? ""))),
  );
}

async function recoverStalePreSendClaim({
  serviceClient,
  message,
  actorUserId,
}: {
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
  message: EmailMessageRecord;
  actorUserId: string;
}) {
  if (!isStalePreSendClaim(message)) {
    return null;
  }
  const priorSendAttemptId = getMetadataString(message.metadata, "sendAttemptId");
  if (!priorSendAttemptId) {
    return null;
  }

  const isSignatureDraft = isProposalSignatureDelivery(message);
  let replacementSigningRequestId: string | null = null;
  if (isSignatureDraft) {
    const signingRequestId = getMetadataString(
      message.metadata,
      "proposalSigningRequestId",
    );
    if (!isProposalSigningPublicId(signingRequestId)) {
      return null;
    }
    const { data: signingRequest, error: signingRequestError } = await serviceClient
      .from("proposal_signing_requests")
      .select("id,status")
      .eq("id", signingRequestId)
      .eq("company_id", message.company_id)
      .maybeSingle();
    if (signingRequestError) {
      return null;
    }
    if (signingRequest?.status === "prepared") {
      const transition = await callProposalDeliveryRpc(
        serviceClient,
        "wtos_transition_proposal_signing_request",
        {
          transition_request: {
            operationKey: deterministicUuid(
              `recover-pre-send:${signingRequestId}:${priorSendAttemptId}`,
            ),
            actorUserId,
            companyId: message.company_id,
            requestId: signingRequestId,
            action: "mark_failed",
            emailMessageId: message.id,
            failureCode: "stale_pre_send_claim_recovered",
            reason:
              "A stale claim was recovered before any Gmail provider call; the unsent signing credential was rotated.",
          },
        },
      );
      const transitionResult = Array.isArray(transition.data)
        ? transition.data[0]
        : transition.data;
      if (
        transition.error ||
        !transitionResult ||
        typeof transitionResult !== "object" ||
        (transitionResult as Record<string, unknown>).ok !== true ||
        (transitionResult as Record<string, unknown>).status !== "failed"
      ) {
        return null;
      }
    } else if (
      signingRequest &&
      !["failed", "revoked", "superseded", "expired"].includes(
        signingRequest.status,
      )
    ) {
      return null;
    }
    replacementSigningRequestId = randomUUID();
  }

  const recoveredMetadata: Record<string, unknown> = {
    ...(message.metadata ?? {}),
  };
  for (const key of [
    "approvedAt",
    "approvedBy",
    "approvedPayloadHash",
    "gmailDeliveryState",
    "gmailProviderAttemptStartedAt",
    "gmailProviderConfirmedAt",
    "gmailConfirmedMessageId",
    "gmailConfirmedThreadId",
    "sendAttemptId",
    "sendClaimedAt",
  ]) {
    delete recoveredMetadata[key];
  }
  recoveredMetadata.approvalState = "pending_owner_approval";
  recoveredMetadata.recoveredPreSendClaimAt = new Date().toISOString();
  recoveredMetadata.recoveredFromSendAttemptId = priorSendAttemptId;
  recoveredMetadata.gmailClaimRecoveryCount =
    (getMetadataNumber(message.metadata, "gmailClaimRecoveryCount") ?? 0) + 1;
  if (replacementSigningRequestId) {
    recoveredMetadata.proposalSigningRequestId = replacementSigningRequestId;
  }

  if (isSignatureDraft) {
    const recovery = await transitionProposalSignatureEmail(serviceClient, {
      operationKey: deterministicUuid(
        `signature-email:recover-pre-send:${message.id}:${priorSendAttemptId}`,
      ),
      actorUserId,
      companyId: message.company_id,
      emailMessageId: message.id,
      action: "recover_pre_send",
      expectedSendAttemptId: priorSendAttemptId,
      metadata: recoveredMetadata,
      lastError: null,
    });
    return recovery.ok ? recovery.emailMessage : null;
  }

  const { data: recoveredMessage, error: recoveryError } = await serviceClient
    .from("email_messages")
    .update({
      status: "queued",
      sync_status: "queued",
      metadata: recoveredMetadata,
      last_error: null,
    })
    .eq("id", message.id)
    .eq("company_id", message.company_id)
    .eq("status", "queued")
    .eq("sync_status", "syncing")
    .contains("metadata", {
      sendAttemptId: priorSendAttemptId,
      gmailDeliveryState: GMAIL_DELIVERY_STATE_PRE_SEND,
    })
    .select("*")
    .maybeSingle();

  return recoveryError ? null : recoveredMessage;
}

async function loadOutboundAttachments({
  serviceClient,
  message,
}: {
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
  message: NonNullable<Awaited<ReturnType<typeof loadEmailMessage>>>;
}) {
  const attachments: GmailOutboundAttachment[] = [];
  const signatureMetadata = getProposalSignatureDeliveryMetadata(message);
  const draftType = getMetadataString(message.metadata, "draftType");
  const requiresExactProposalPdf =
    Boolean(signatureMetadata) ||
    draftType === "proposal_delivery" ||
    getMetadataString(message.metadata, "attachmentPolicy") === "exact_proposal_pdf";

  if (message.document_id) {
    const { data: document } = await serviceClient
      .from("documents")
      .select("*")
      .eq("id", message.document_id)
      .eq("company_id", message.company_id)
      .maybeSingle();

    if (
      requiresExactProposalPdf &&
      (!document ||
        document.category !== "proposal" ||
        document.mime_type !== "application/pdf" ||
        document.storage_bucket !== "customer-documents" ||
        !document.storage_path ||
        document.file_url !== null ||
        !document.immutable_after_at ||
        !document.content_sha256 ||
        (signatureMetadata &&
          (document.id !== signatureMetadata.proposalDocumentId ||
            document.proposal_revision_id !== signatureMetadata.proposalRevisionId ||
            document.content_sha256.toLowerCase() !==
              signatureMetadata.documentSha256)))
    ) {
      throw new Error(
        "The approved email is not attached to the exact private immutable proposal PDF.",
      );
    }

    if (document?.storage_path) {
      const { data, error } = await serviceClient.storage
        .from(document.storage_bucket ?? "customer-documents")
        .download(document.storage_path);

      if (error || !data) {
        throw new Error("The approved document attachment could not be loaded from Storage.");
      }

      const content = Buffer.from(await data.arrayBuffer());
      if (
        requiresExactProposalPdf &&
        document.content_sha256?.toLowerCase() !== hashProposalDocumentContent(content)
      ) {
        throw new Error("The finalized proposal PDF failed its SHA-256 integrity check.");
      }

      attachments.push({
        fileName: document.file_name ?? `${document.title}.pdf`,
        mimeType: document.mime_type ?? "application/octet-stream",
        content,
      });
    }
  }

  const hasPdf = attachments.some((attachment) => attachment.mimeType === "application/pdf");

  if (requiresExactProposalPdf && !hasPdf) {
    throw new Error("The exact finalized proposal PDF is required for this delivery.");
  }

  if (message.estimate_id && !hasPdf && !requiresExactProposalPdf) {
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

  let message = await loadEmailMessage(serviceClient, emailMessageId);

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
  const initialDeliveryState = getGmailDeliveryState(message);
  const approvedThreadEvidence = message.metadata?.approvedGmailThreadId;
  const hasApprovedThreadEvidence = Object.prototype.hasOwnProperty.call(
    message.metadata ?? {},
    "approvedGmailThreadId",
  );
  if (
    initialDeliveryState === GMAIL_DELIVERY_STATE_CONFIRMED &&
    (!hasApprovedThreadEvidence ||
      (approvedThreadEvidence !== null &&
        typeof approvedThreadEvidence !== "string"))
  ) {
    return NextResponse.json(
      {
        ok: false,
        sent: true,
        deliveryStatus: "failed_after_provider_send",
        signatureActivationDeferred: false,
        message:
          "The provider-confirmed Gmail recovery is missing its exact original approved thread evidence. No resend was attempted.",
      },
      { status: 502 },
    );
  }
  const approvedPayloadHash = getMetadataString(message.metadata, "pendingPayloadHash");
  const currentPayloadHash = createGmailOutboundPayloadFingerprint(
    initialDeliveryState === GMAIL_DELIVERY_STATE_CONFIRMED
      ? {
          ...message,
          gmail_thread_id:
            typeof approvedThreadEvidence === "string"
              ? approvedThreadEvidence
              : null,
        }
      : message,
  );

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

  if (isStalePreSendClaim(message)) {
    if (!ownerMembership || approvalAction !== "owner_approved_send") {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message:
            "A company owner must explicitly approve recovery of this unsent Gmail claim.",
        },
        { status: ownerMembership ? 409 : 403 },
      );
    }
    const recoveredMessage = await recoverStalePreSendClaim({
      serviceClient,
      message,
      actorUserId: userResult.user.id,
    });
    if (!recoveredMessage) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message:
            "The stale pre-send Gmail claim could not be recovered safely. No provider call was attempted.",
        },
        { status: 409 },
      );
    }
    message = recoveredMessage;
  }

  const recoveringProviderOutcome = isProviderOutcomeRecovery(message);
  const recoveredDeliveryState = getGmailDeliveryState(message);
  const recoveringUnknownProviderOutcome =
    recoveringProviderOutcome &&
    recoveredDeliveryState === GMAIL_DELIVERY_STATE_UNKNOWN;
  const recoveringConfirmedProviderOutcome =
    recoveringProviderOutcome &&
    recoveredDeliveryState === GMAIL_DELIVERY_STATE_CONFIRMED;
  const approval = validateGmailOwnerApproval({
    message: recoveringProviderOutcome
      ? { ...message, status: "queued", sync_status: "queued" }
      : message,
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
  const googleWorkspaceConfig = getGoogleWorkspaceConfigCheckResult();
  if (
    !googleWorkspaceConfig.credentials.gmailSendEnabled &&
    !recoveringProviderOutcome
  ) {
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

  let signatureMetadata: ReturnType<typeof getProposalSignatureDeliveryMetadata> = null;
  let signatureContext: {
    signerName: string;
    signerEmail: string;
  } | null = null;
  try {
    signatureMetadata = getProposalSignatureDeliveryMetadata(message);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          error instanceof Error
            ? error.message
            : "The approved signature email is missing immutable proposal evidence.",
      },
      { status: 409 },
    );
  }

  if (signatureMetadata) {
    const [{ data: revision }, { data: customer }] = await Promise.all([
      serviceClient
        .from("estimate_proposal_revisions")
        .select("*")
        .eq("id", signatureMetadata.proposalRevisionId)
        .eq("company_id", message.company_id)
        .maybeSingle(),
      message.customer_id
        ? serviceClient
            .from("customers")
            .select("*")
            .eq("id", message.customer_id)
            .eq("company_id", message.company_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const { data: preparedSigningRequest } = recoveringProviderOutcome
      ? await serviceClient
          .from("proposal_signing_requests")
          .select("*")
          .eq("id", signatureMetadata.requestId)
          .eq("company_id", message.company_id)
          .eq("proposal_revision_id", signatureMetadata.proposalRevisionId)
          .maybeSingle()
      : { data: null };
    const toRecipients = message.to_emails?.length
      ? message.to_emails
      : [message.to_email];
    const normalizedCustomerEmail = customer?.email?.trim().toLowerCase() ?? null;
    const frozenSignerEmail = (getRequestString(
      preparedSigningRequest?.intended_signer_email,
    ) ?? "").toLowerCase();
    const preparedRequestExpiresAt = getRequestString(
      preparedSigningRequest?.expires_at,
    );
    const preparedRequestExpired = Boolean(
      recoveringProviderOutcome &&
        (!preparedRequestExpiresAt ||
          !Number.isFinite(Date.parse(preparedRequestExpiresAt)) ||
          Date.parse(preparedRequestExpiresAt) <= Date.now()),
    );
    const expectedRecipientEmail = recoveringProviderOutcome
      ? frozenSignerEmail
      : normalizedCustomerEmail;
    const exactRecipient =
      toRecipients.length === 1 &&
      toRecipients[0]?.trim().toLowerCase() === expectedRecipientEmail &&
      !(message.cc_emails?.length || message.cc_email || message.bcc_emails?.length);
    const exactPreparedRecovery =
      !recoveringProviderOutcome ||
      Boolean(
        preparedSigningRequest &&
          preparedSigningRequest.id === signatureMetadata.requestId &&
          preparedSigningRequest.company_id === message.company_id &&
          preparedSigningRequest.proposal_revision_id === revision?.id &&
          preparedSigningRequest.customer_id === customer?.id &&
          preparedSigningRequest.estimate_id === message.estimate_id &&
          preparedSigningRequest.proposal_document_id ===
            signatureMetadata.proposalDocumentId &&
          preparedSigningRequest.delivery_email_message_id === message.id &&
          preparedSigningRequest.revision_sha256?.toLowerCase() ===
            signatureMetadata.revisionSha256 &&
          preparedSigningRequest.document_sha256?.toLowerCase() ===
            signatureMetadata.documentSha256 &&
          preparedSigningRequest.terms_sha256?.toLowerCase() ===
            signatureMetadata.termsSha256 &&
          ["prepared", "sent", "viewed"].includes(preparedSigningRequest.status) &&
          !preparedRequestExpired &&
          frozenSignerEmail,
      );

    if (preparedRequestExpired) {
      return NextResponse.json(
        {
          ok: false,
          sent: recoveringConfirmedProviderOutcome,
          deliveryStatus: recoveringConfirmedProviderOutcome
            ? "failed_after_provider_send"
            : recoveredDeliveryState,
          message: recoveringConfirmedProviderOutcome
            ? "Gmail delivery is confirmed, but the signing link expired before activation. No resend was attempted; revoke the expired request and prepare a fresh link."
            : "The prior Gmail delivery outcome remains unresolved and the signing link has expired. Do not resend automatically; reconcile or revoke the expired request first.",
        },
        { status: 409 },
      );
    }

    if (
      !revision ||
      !customer ||
      (!recoveringProviderOutcome && !normalizedCustomerEmail) ||
      !expectedRecipientEmail ||
      !exactRecipient ||
      !exactPreparedRecovery ||
      revision.customer_id !== customer.id ||
      revision.estimate_id !== message.estimate_id ||
      revision.finalized_document_id !== signatureMetadata.proposalDocumentId ||
      revision.revision_sha256?.toLowerCase() !== signatureMetadata.revisionSha256 ||
      revision.terms_sha256?.toLowerCase() !== signatureMetadata.termsSha256 ||
      !revision.immutable_after_at ||
      !["ready_to_send", "sent"].includes(revision.status) ||
      revision.accepted_acceptance_id ||
      (recoveringProviderOutcome &&
        (message.has_attachments !== true || message.attachment_count !== 1))
    ) {
      return NextResponse.json(
        {
          ok: false,
          sent: recoveringConfirmedProviderOutcome,
          deliveryStatus: recoveringProviderOutcome
            ? recoveredDeliveryState
            : undefined,
          message:
            "The signature delivery no longer matches one unsigned company customer, immutable proposal revision, and frozen intended signer.",
        },
        { status: 409 },
      );
    }

    signatureContext = {
      signerName: recoveringProviderOutcome
        ? (getRequestString(preparedSigningRequest?.intended_signer_name) ?? "")
        : customer.contact_name || customer.display_name,
      signerEmail: expectedRecipientEmail,
    };
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
    !connection.account_email ||
    (!recoveringConfirmedProviderOutcome &&
      (connection.status !== "connected" ||
        !hasRequiredGmailSendScopes(connection.scopes))) ||
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

  let gmailAccessToken: string | null = null;
  if (!recoveringConfirmedProviderOutcome) {
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
          message: "Reconnect the company Gmail mailbox before sending or reconciling.",
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

    gmailAccessToken = refresh.accessToken;
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
  }

  let attachments: GmailOutboundAttachment[] = [];

  if (!recoveringProviderOutcome) {
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
  }
  const deliveredAttachmentCount = recoveringProviderOutcome
    ? message.attachment_count
    : attachments.length;

  const approvedAt = new Date().toISOString();
  let sendAttemptId =
    getMetadataString(message.metadata, "sendAttemptId") ?? randomUUID();
  let approvalMetadata: Record<string, unknown> = {
    ...(message.metadata ?? {}),
  };
  let claimedMessage: EmailMessageRecord | null = null;
  let signatureClaimFailure: {
    status: "conflict" | "source_changed" | "unavailable";
    message: string;
  } | null = null;

  if (recoveringProviderOutcome) {
    if (!getMetadataString(message.metadata, "sendAttemptId")) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          message:
            "The durable Gmail recovery claim is incomplete. No resend was attempted.",
        },
        { status: 409 },
      );
    }
    claimedMessage = message;
  } else {
    sendAttemptId = randomUUID();
    approvalMetadata = {
      ...(message.metadata ?? {}),
      approvalState: "owner_approved",
      approvedBy: userResult.user.id,
      approvedAt,
      sendAttemptId,
      sendClaimedAt: approvedAt,
      approvedPayloadHash: currentPayloadHash,
      approvedGmailThreadId: message.gmail_thread_id ?? null,
      gmailDeliveryState: GMAIL_DELIVERY_STATE_PRE_SEND,
    };
    if (signatureMetadata) {
      const claim = await transitionProposalSignatureEmail(serviceClient, {
        operationKey: deterministicUuid(
          `signature-email:claim:${message.id}:${sendAttemptId}`,
        ),
        actorUserId: userResult.user.id,
        companyId: message.company_id,
        emailMessageId: message.id,
        action: "claim_send",
        metadata: approvalMetadata,
        fromEmail: connection.account_email,
        providerAccountId:
          connection.external_account_id ?? connection.account_email,
        providerPayloadHash: currentPayloadHash,
        lastError: null,
      });
      claimedMessage = claim.ok ? claim.emailMessage : null;
      signatureClaimFailure = claim.ok ? null : claim;
    } else {
      const { data, error: claimError } = await serviceClient
        .from("email_messages")
        .update({
          sync_status: "syncing",
          from_email: connection.account_email,
          provider_account_id:
            connection.external_account_id ?? connection.account_email,
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
      claimedMessage = claimError ? null : data;
    }

    if (!claimedMessage) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          deliveryStatus:
            signatureClaimFailure?.status === "source_changed"
              ? "source_changed"
              : "failed",
          message:
            signatureClaimFailure?.status === "source_changed"
              ? signatureClaimFailure.message
              : "This email is already being delivered or is no longer pending owner approval. No duplicate send was attempted.",
        },
        { status: 409 },
      );
    }
  }

  let outboundMessage: EmailMessageRecord = {
    ...claimedMessage,
    from_email: connection.account_email,
    provider_account_id: connection.external_account_id ?? connection.account_email,
  };
  let signingRequestPrepared = false;
  let signaturePreparationError: string | null = null;

  if (signatureMetadata && signatureContext && !recoveringProviderOutcome) {
    try {
      const publicBaseUrl = googleWorkspaceConfig.credentials.publicBaseUrl;
      if (!publicBaseUrl) {
        throw new Error("The public WeatherTech OS URL is not configured for signing links.");
      }
      const signingApiOrigin = getConfiguredProposalSigningOrigin();
      const deliveryOrigin = normalizeProposalSigningOrigin(publicBaseUrl);
      if (!signingApiOrigin || deliveryOrigin !== signingApiOrigin) {
        throw new Error(
          "The proposal signing delivery URL does not match the application origin trusted by the signing APIs.",
        );
      }
      const rawToken = generateProposalSigningToken();
      const requestTokenHash = hashProposalSigningToken(rawToken);
      const consentSha256 = createHash("sha256")
        .update(PROPOSAL_SIGNING_CONSENT_TEXT, "utf8")
        .digest("hex");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const prepareResponse = await callProposalDeliveryRpc(
        serviceClient,
        "wtos_prepare_proposal_signing_request",
        {
          signing_request: {
            operationKey: deterministicUuid(`prepare:${signatureMetadata.requestId}`),
            requestId: signatureMetadata.requestId,
            actorUserId: userResult.user.id,
            companyId: message.company_id,
            proposalRevisionId: signatureMetadata.proposalRevisionId,
            requestTokenHash,
            signerName: signatureContext.signerName,
            signerEmail: signatureContext.signerEmail,
            expiresAt,
            consentVersion: PROPOSAL_SIGNING_CONSENT_VERSION,
            consentText: PROPOSAL_SIGNING_CONSENT_TEXT,
            consentSha256,
          },
        },
      );
      const prepared =
        prepareResponse.data && typeof prepareResponse.data === "object"
          ? Array.isArray(prepareResponse.data)
            ? prepareResponse.data[0]
            : prepareResponse.data
          : null;
      if (
        prepareResponse.error ||
        !prepared ||
        typeof prepared !== "object" ||
        (prepared as Record<string, unknown>).ok !== true ||
        (prepared as Record<string, unknown>).requestId !== signatureMetadata.requestId
      ) {
        throw new Error("The one-time signature request could not be prepared safely.");
      }

      const signingUrl = buildProposalSigningUrl(
        publicBaseUrl,
        signatureMetadata.requestId,
        rawToken,
      );
      outboundMessage = materializeProposalSignatureEmail({
        message: outboundMessage,
        signingUrl,
      });
      signingRequestPrepared = true;
    } catch (error) {
      signaturePreparationError =
        error instanceof Error
          ? error.message
          : "The one-time signature request could not be prepared safely.";
    }
  }

  if (
    signatureMetadata &&
    !recoveringProviderOutcome &&
    (!signingRequestPrepared || signaturePreparationError)
  ) {
    const failedAt = new Date().toISOString();
    const failedEmail = await transitionProposalSignatureEmail(serviceClient, {
      operationKey: deterministicUuid(
        `signature-email:prepare-failed:${message.id}:${sendAttemptId}`,
      ),
      actorUserId: userResult.user.id,
      companyId: message.company_id,
      emailMessageId: message.id,
      action: "mark_prepare_failed",
      expectedSendAttemptId: sendAttemptId,
      metadata: {
        ...approvalMetadata,
        approvalState: "failed",
        proposalSigningDeliveryStatus: "failed_before_send",
        failedAt,
      },
      lastError:
        signaturePreparationError ??
        "The one-time signature request could not be prepared safely.",
    });
    if (!failedEmail.ok) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          deliveryStatus: "pre_send_state_unknown",
          message:
            "No Gmail provider call was attempted, but the unsent signature-email state could not be persisted. Wait for stale-claim recovery; do not submit another send.",
        },
        { status: 503 },
      );
    }
    const failedRequest = await callProposalDeliveryRpc(
      serviceClient,
      "wtos_transition_proposal_signing_request",
      {
        transition_request: {
          operationKey: deterministicUuid(
            `prepare-failed:${signatureMetadata.requestId}:${sendAttemptId}`,
          ),
          actorUserId: userResult.user.id,
          companyId: message.company_id,
          requestId: signatureMetadata.requestId,
          action: "mark_failed",
          emailMessageId: message.id,
          failureCode: "request_prepare_failed",
          reason: "Signature delivery was stopped before Gmail was called.",
        },
      },
    );
    const failedRequestResult = Array.isArray(failedRequest.data)
      ? failedRequest.data[0]
      : failedRequest.data;
    if (
      failedRequest.error ||
      !failedRequestResult ||
      typeof failedRequestResult !== "object" ||
      (failedRequestResult as Record<string, unknown>).ok !== true ||
      (failedRequestResult as Record<string, unknown>).status !== "failed"
    ) {
      return NextResponse.json(
        {
          ok: false,
          sent: false,
          deliveryStatus: "failed_before_send",
          message:
            "No Gmail provider call was attempted and the email is durably failed, but the signing request still requires owner revocation before replacement.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      {
        ok: false,
        sent: false,
        message:
          signaturePreparationError ??
          "The one-time signature request could not be prepared safely.",
      },
      { status: 502 },
    );
  }

  let deliveryMetadata: Record<string, unknown> = { ...approvalMetadata };
  let result: GmailSendResult;
  const providerPreSendFailureRef: {
    current: {
      status: "conflict" | "source_changed" | "unavailable";
      message: string;
    } | null;
  } = { current: null };
  if (recoveringConfirmedProviderOutcome) {
    const confirmedMessageId = getMetadataString(
      message.metadata,
      "gmailConfirmedMessageId",
    );
    const confirmedThreadId = getMetadataString(
      message.metadata,
      "gmailConfirmedThreadId",
    );
    if (
      !confirmedMessageId ||
      message.gmail_message_id !== confirmedMessageId ||
      (message.gmail_thread_id ?? null) !== (confirmedThreadId ?? null)
    ) {
      return NextResponse.json(
        {
          ok: false,
          sent: true,
          deliveryStatus: "failed_after_provider_send",
          signatureActivationDeferred: false,
          message:
            "Gmail delivery was previously confirmed, but its durable provider identity is inconsistent. No resend was attempted.",
        },
        { status: 502 },
      );
    }
    result = {
      attempted: false,
      sent: true,
      status: "reconciled",
      message: "Gmail provider-confirmed delivery was recovered from durable evidence.",
      gmailMessageId: confirmedMessageId,
      gmailThreadId: confirmedThreadId,
      providerSendAttempts: 0,
      duplicatePrevented: true,
      reconciled: true,
      idempotencyKey:
        getMetadataString(message.metadata, "gmailIdempotencyKey") ?? null,
      providerOutcomeKnown: true,
    };
  } else {
    result = await sendGmailEmail({
      message: outboundMessage,
      accessToken: gmailAccessToken,
      attachments,
      reconciliationOnly: recoveringUnknownProviderOutcome,
      beforeProviderSend: recoveringUnknownProviderOutcome
        ? undefined
        : async () => {
            const providerAttemptStartedAt = new Date().toISOString();
            const providerAttemptMetadata = {
              ...approvalMetadata,
              gmailDeliveryState: GMAIL_DELIVERY_STATE_UNKNOWN,
              gmailProviderAttemptStartedAt: providerAttemptStartedAt,
            };
            let providerClaimed = false;
            if (signatureMetadata) {
              const providerClaim = await transitionProposalSignatureEmail(
                serviceClient,
                {
                  operationKey: deterministicUuid(
                    `signature-email:provider-attempt:${message.id}:${sendAttemptId}`,
                  ),
                  actorUserId: userResult.user.id,
                  companyId: message.company_id,
                  emailMessageId: message.id,
                  action: "mark_provider_attempt",
                  expectedSendAttemptId: sendAttemptId,
                  metadata: providerAttemptMetadata,
                },
              );
              providerClaimed = providerClaim.ok;
              providerPreSendFailureRef.current = providerClaim.ok
                ? null
                : providerClaim;
            } else {
              const { data: providerClaim, error: providerClaimError } =
                await serviceClient
                  .from("email_messages")
                  .update({ metadata: providerAttemptMetadata })
                  .eq("id", message.id)
                  .eq("company_id", message.company_id)
                  .eq("status", "queued")
                  .eq("sync_status", "syncing")
                  .contains("metadata", {
                    sendAttemptId,
                    gmailDeliveryState: GMAIL_DELIVERY_STATE_PRE_SEND,
                  })
                  .select("id")
                  .maybeSingle();
              providerClaimed = Boolean(!providerClaimError && providerClaim);
            }
            if (providerClaimed) {
              deliveryMetadata = providerAttemptMetadata;
              return true;
            }
            return false;
          },
    });
  }
  const sourceChangedBeforeProvider = Boolean(
    !result.sent &&
      result.status === "pre_send_stopped" &&
      providerPreSendFailureRef.current?.status === "source_changed",
  );
  if (sourceChangedBeforeProvider && providerPreSendFailureRef.current) {
    result = {
      ...result,
      message: providerPreSendFailureRef.current.message,
      error: undefined,
    };
  }
  outboundMessage = claimedMessage;
  const now = new Date().toISOString();
  const outcomeMetadata: Record<string, unknown> = {
    ...deliveryMetadata,
    attachmentCountDelivered: deliveredAttachmentCount,
    gmailIdempotencyKey: result.idempotencyKey,
    providerSendAttempts: result.providerSendAttempts,
    providerOutcomeKnown: result.providerOutcomeKnown,
    duplicatePrevented: result.duplicatePrevented,
    reconciledFromProvider: result.reconciled,
    ...(signatureMetadata
      ? {
          proposalSigningDeliveryStatus: result.sent
            ? "provider_confirmed_pending_activation"
            : result.status,
        }
      : {}),
  };
  let sentMessagePersisted = false;
  let signingTransitionSucceeded = !signatureMetadata;
  let signingTransitionTransportFailed = false;
  let signingActivationCanSelfHeal = false;
  let signingTransitionMessage: string | null = null;

  if (result.sent && result.gmailMessageId) {
    const providerConfirmedMetadata = {
      ...outcomeMetadata,
      approvalState: "provider_confirmed",
      gmailDeliveryState: GMAIL_DELIVERY_STATE_CONFIRMED,
      gmailProviderConfirmedAt:
        getMetadataString(message.metadata, "gmailProviderConfirmedAt") ?? now,
      gmailConfirmedMessageId: result.gmailMessageId,
      gmailConfirmedThreadId: result.gmailThreadId,
    };
    let providerCheckpointPersisted = recoveringConfirmedProviderOutcome;
    if (!providerCheckpointPersisted) {
      if (signatureMetadata) {
        const checkpoint = await transitionProposalSignatureEmail(serviceClient, {
          operationKey: deterministicUuid(
            `signature-email:provider-checkpoint:${message.id}:${sendAttemptId}`,
          ),
          actorUserId: userResult.user.id,
          companyId: message.company_id,
          emailMessageId: message.id,
          action: "checkpoint_provider",
          expectedSendAttemptId: sendAttemptId,
          metadata: providerConfirmedMetadata,
          gmailMessageId: result.gmailMessageId,
          gmailThreadId: result.gmailThreadId,
          lastError: null,
        });
        providerCheckpointPersisted = checkpoint.ok;
      } else {
        const { data: providerCheckpoint, error: providerCheckpointError } =
          await serviceClient
            .from("email_messages")
            .update({
              gmail_message_id: result.gmailMessageId,
              gmail_thread_id: result.gmailThreadId,
              metadata: providerConfirmedMetadata,
              last_error: null,
            })
            .eq("id", message.id)
            .eq("company_id", message.company_id)
            .eq("status", "queued")
            .eq("sync_status", "syncing")
            .contains("metadata", { sendAttemptId })
            .select("id")
            .maybeSingle();
        providerCheckpointPersisted = Boolean(
          !providerCheckpointError && providerCheckpoint,
        );
      }
    }

    if (providerCheckpointPersisted) {
      const sentMetadata = {
        ...providerConfirmedMetadata,
        approvalState: "sent",
      };
      if (signatureMetadata) {
        const sentTransition = await transitionProposalSignatureEmail(
          serviceClient,
          {
            operationKey: deterministicUuid(
              `signature-email:mark-sent:${message.id}:${result.gmailMessageId}`,
            ),
            actorUserId: userResult.user.id,
            companyId: message.company_id,
            emailMessageId: message.id,
            action: "mark_sent",
            expectedGmailMessageId: result.gmailMessageId,
            metadata: sentMetadata,
            sentAt: now,
            lastError: null,
          },
        );
        sentMessagePersisted = sentTransition.ok;
      } else {
        const { data: sentMessage, error: sentMessageError } = await serviceClient
          .from("email_messages")
          .update({
            status: "sent",
            sent_at: now,
            gmail_message_id: result.gmailMessageId,
            gmail_thread_id: result.gmailThreadId,
            sync_status: "sent",
            last_error: null,
            metadata: sentMetadata,
          })
          .eq("id", message.id)
          .eq("company_id", message.company_id)
          .eq("status", "queued")
          .eq("sync_status", "syncing")
          .eq("gmail_message_id", result.gmailMessageId)
          .select("id")
          .maybeSingle();
        sentMessagePersisted = Boolean(!sentMessageError && sentMessage);
      }
      if (!sentMessagePersisted) {
        const { data: alreadyPersisted } = await serviceClient
          .from("email_messages")
          .select("id")
          .eq("id", message.id)
          .eq("company_id", message.company_id)
          .eq("status", "sent")
          .eq("sync_status", "sent")
          .eq("gmail_message_id", result.gmailMessageId)
          .maybeSingle();
        sentMessagePersisted = Boolean(alreadyPersisted);
      }

      if (signatureMetadata && sentMessagePersisted) {
        signingActivationCanSelfHeal = true;
        let transitionError: {
          code?: string;
          details?: string;
          hint?: string;
          message?: string;
        } | null = null;
        let transitionData: unknown = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const transition = await callProposalDeliveryRpc(
            serviceClient,
            "wtos_transition_proposal_signing_request",
            {
              transition_request: {
                operationKey: deterministicUuid(`mark-sent:${signatureMetadata.requestId}`),
                actorUserId: userResult.user.id,
                companyId: message.company_id,
                requestId: signatureMetadata.requestId,
                action: "mark_sent",
                emailMessageId: message.id,
                failureCode: null,
                reason: "Gmail provider-confirmed customer signature delivery.",
              },
            },
          );
          transitionError = transition.error;
          transitionData = transition.data;
          if (!transition.error) {
            break;
          }
          signingTransitionTransportFailed =
            isRetryableProposalDeliveryRpcFailure(transition);
          if (!signingTransitionTransportFailed) {
            break;
          }
        }
        const transitionResult = Array.isArray(transitionData)
          ? transitionData[0]
          : transitionData;
        signingTransitionSucceeded = Boolean(
          !transitionError &&
            transitionResult &&
            typeof transitionResult === "object" &&
            (transitionResult as Record<string, unknown>).ok === true &&
            (transitionResult as Record<string, unknown>).status === "sent",
        );
        if (!signingTransitionSucceeded) {
          signingTransitionMessage = signingTransitionTransportFailed
            ? "Gmail delivery is confirmed. Signing-request activation is deferred and the exact customer link will self-heal when first opened."
            : "Gmail confirmed delivery, but the signing request could not be activated.";
        }
      }

      if (sentMessagePersisted && message.estimate_id && !signatureMetadata) {
        await serviceClient
          .from("estimates")
          .update({ status: "sent" })
          .eq("id", message.estimate_id)
          .eq("company_id", message.company_id);
      }

      const proposalRevisionId = getMetadataString(
        message.metadata,
        "proposalRevisionId",
      );
      if (sentMessagePersisted && proposalRevisionId && !signatureMetadata) {
        await serviceClient
          .from("estimate_proposal_revisions")
          .update({ status: "sent", sent_at: now, immutable_after_at: now })
          .eq("id", proposalRevisionId)
          .eq("company_id", message.company_id);
      }

      if (sentMessagePersisted && message.document_id) {
        await serviceClient
          .from("documents")
          .update({ status: "sent" })
          .eq("id", message.document_id)
          .eq("company_id", message.company_id);
      }
    }
  } else if (result.status === "provider_outcome_unknown") {
    const unknownMetadata = {
      ...outcomeMetadata,
      approvalState: "provider_outcome_unknown",
      gmailDeliveryState: GMAIL_DELIVERY_STATE_UNKNOWN,
      lastProviderReconciliationAt: now,
    };
    if (signatureMetadata) {
      await transitionProposalSignatureEmail(serviceClient, {
        operationKey: deterministicUuid(
          `signature-email:provider-unknown:${message.id}:${sendAttemptId}`,
        ),
        actorUserId: userResult.user.id,
        companyId: message.company_id,
        emailMessageId: message.id,
        action: "mark_provider_unknown",
        expectedSendAttemptId: sendAttemptId,
        metadata: unknownMetadata,
        lastError: result.message,
      });
    } else {
      await serviceClient
        .from("email_messages")
        .update({
          last_error: result.message,
          metadata: unknownMetadata,
        })
        .eq("id", message.id)
        .eq("company_id", message.company_id)
        .eq("status", "queued")
        .eq("sync_status", "syncing")
        .contains("metadata", { sendAttemptId });
    }
    signingTransitionSucceeded = false;
    signingTransitionMessage = result.message;
  } else if (result.attempted && result.providerOutcomeKnown) {
    const failedMetadata = {
      ...outcomeMetadata,
      approvalState: "failed",
      gmailDeliveryState: "provider_failed",
    };
    let failedEmailPersisted = !signatureMetadata;
    if (signatureMetadata) {
      const failedEmail = await transitionProposalSignatureEmail(serviceClient, {
        operationKey: deterministicUuid(
          `signature-email:provider-failed:${message.id}:${sendAttemptId}`,
        ),
        actorUserId: userResult.user.id,
        companyId: message.company_id,
        emailMessageId: message.id,
        action: "mark_provider_failed",
        expectedSendAttemptId: sendAttemptId,
        metadata: failedMetadata,
        lastError: result.message,
      });
      failedEmailPersisted = failedEmail.ok;
    } else {
      const { data: failedEmail, error: failedEmailError } = await serviceClient
        .from("email_messages")
        .update({
          status: "failed",
          sync_status: "failed",
          last_error: result.message,
          metadata: failedMetadata,
        })
        .eq("id", message.id)
        .eq("sync_status", "syncing")
        .contains("metadata", { sendAttemptId })
        .select("id")
        .maybeSingle();
      failedEmailPersisted = Boolean(!failedEmailError && failedEmail);
    }

    if (signatureMetadata && failedEmailPersisted) {
      const transition = await callProposalDeliveryRpc(
        serviceClient,
        "wtos_transition_proposal_signing_request",
        {
          transition_request: {
            operationKey: deterministicUuid(`mark-failed:${signatureMetadata.requestId}`),
            actorUserId: userResult.user.id,
            companyId: message.company_id,
            requestId: signatureMetadata.requestId,
            action: "mark_failed",
            emailMessageId: message.id,
            failureCode: `gmail_${result.status}`,
            reason: "Gmail returned a definitive non-delivery result.",
          },
        },
      );
      const transitionResult = Array.isArray(transition.data)
        ? transition.data[0]
        : transition.data;
      signingTransitionSucceeded = Boolean(
        !transition.error &&
          transitionResult &&
          typeof transitionResult === "object" &&
          (transitionResult as Record<string, unknown>).ok === true &&
          (transitionResult as Record<string, unknown>).status === "failed",
      );
    } else if (signatureMetadata) {
      signingTransitionSucceeded = false;
      signingTransitionMessage =
        "Gmail reported definitive non-delivery, but WeatherTech OS could not persist the matching email state. The signing request remains recoverable; do not prepare a replacement yet.";
    }
    signingTransitionMessage ??= result.message;
  } else {
    const interruptedMetadata = {
      ...outcomeMetadata,
      approvalState: "owner_approved_pre_send",
    };
    if (signatureMetadata) {
      await transitionProposalSignatureEmail(serviceClient, {
        operationKey: deterministicUuid(
          `signature-email:pre-send-interrupted:${message.id}:${sendAttemptId}`,
        ),
        actorUserId: userResult.user.id,
        companyId: message.company_id,
        emailMessageId: message.id,
        action: "mark_pre_send_interrupted",
        expectedSendAttemptId: sendAttemptId,
        metadata: interruptedMetadata,
        lastError: result.message,
      });
    } else {
      await serviceClient
        .from("email_messages")
        .update({
          last_error: result.message,
          metadata: interruptedMetadata,
        })
        .eq("id", message.id)
        .eq("sync_status", "syncing")
        .contains("metadata", { sendAttemptId });
    }
    signingTransitionSucceeded = false;
    signingTransitionMessage = result.message;
  }

  let signatureActivationDeferred = Boolean(
    result.sent &&
      sentMessagePersisted &&
      signatureMetadata &&
      !signingTransitionSucceeded &&
      signingTransitionTransportFailed &&
      signingActivationCanSelfHeal,
  );
  let failedAfterProviderSend = Boolean(
    result.sent &&
      (!sentMessagePersisted ||
        (signatureMetadata &&
          !signingTransitionSucceeded &&
          !signatureActivationDeferred)),
  );
  let deliverySucceeded = Boolean(
    result.sent &&
      sentMessagePersisted &&
      (signingTransitionSucceeded || signatureActivationDeferred),
  );

  if (signatureMetadata && result.sent && result.gmailMessageId) {
    const durableSigningStatus = signatureActivationDeferred
      ? "sent_activation_deferred"
      : failedAfterProviderSend
        ? "failed_after_provider_send"
        : signingTransitionSucceeded
          ? "sent"
          : "failed_after_provider_send";
    const durableSigningMetadata = {
      ...outcomeMetadata,
      approvalState: sentMessagePersisted ? "sent" : "provider_confirmed",
      gmailDeliveryState: GMAIL_DELIVERY_STATE_CONFIRMED,
      gmailProviderConfirmedAt:
        getMetadataString(message.metadata, "gmailProviderConfirmedAt") ?? now,
      gmailConfirmedMessageId: result.gmailMessageId,
      gmailConfirmedThreadId: result.gmailThreadId,
      proposalSigningDeliveryStatus: durableSigningStatus,
      signatureActivationDeferred,
    };
    const durableSigningUpdate = await transitionProposalSignatureEmail(
      serviceClient,
      {
        operationKey: deterministicUuid(
          `signature-email:finalize:${message.id}:${result.gmailMessageId}`,
        ),
        actorUserId: userResult.user.id,
        companyId: message.company_id,
        emailMessageId: message.id,
        action: "finalize_delivery",
        expectedGmailMessageId: result.gmailMessageId,
        metadata: durableSigningMetadata,
        lastError:
          durableSigningStatus === "sent"
            ? null
            : signingTransitionMessage ?? result.message,
      },
    );
    const durableSigningStatusPersisted = durableSigningUpdate.ok;
    if (sentMessagePersisted && !durableSigningStatusPersisted) {
      signatureActivationDeferred = false;
      failedAfterProviderSend = true;
      deliverySucceeded = false;
      signingTransitionMessage =
        "Gmail confirmed the email was sent, but WeatherTech OS could not persist its final signing-delivery status. Do not resend; use reconciliation only.";
    }
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
    status: result.sent
      ? "succeeded"
      : result.status === "provider_outcome_unknown"
        ? "retrying"
        : "failed",
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
      attachmentCount: deliveredAttachmentCount,
      htmlFormatting: true,
      proposalSigningRequestId: signatureMetadata?.requestId ?? null,
    },
    response_summary: {
      sent: result.sent,
      status: result.status,
      gmailThreadId: result.sent ? result.gmailThreadId : null,
      duplicatePrevented: result.duplicatePrevented,
      reconciledFromProvider: result.reconciled,
      providerOutcomeKnown: result.providerOutcomeKnown,
      sentMessagePersisted,
      failedAfterProviderSend,
      signatureRequestActivated: signatureMetadata
        ? signingTransitionSucceeded
        : null,
      signatureActivationDeferred: signatureMetadata
        ? signatureActivationDeferred
        : null,
    },
    error_code: result.sent
      ? failedAfterProviderSend
        ? "post_provider_processing_failed"
        : null
      : result.status,
    error_message:
      result.sent && !failedAfterProviderSend
        ? null
        : signingTransitionMessage ?? result.message,
    completed_at: now,
  });

  const deliveryStatus = signatureActivationDeferred
    ? "sent_activation_deferred"
    : failedAfterProviderSend
      ? "failed_after_provider_send"
      : deliverySucceeded
        ? "sent"
        : sourceChangedBeforeProvider
          ? "source_changed"
        : result.status === "provider_outcome_unknown"
          ? "provider_outcome_unknown"
          : "failed";
  const responseMessage = signatureActivationDeferred
    ? signingTransitionMessage
    : failedAfterProviderSend
      ? signingTransitionMessage ??
        "Gmail confirmed the email was sent, but WeatherTech OS could not finish durable post-send processing. No resend will be attempted."
      : deliverySucceeded
        ? result.message
        : signingTransitionMessage ?? result.message;

  return NextResponse.json(
    {
      ok: deliverySucceeded,
      sent: result.sent,
      deliveryStatus,
      signatureActivationDeferred,
      message: responseMessage,
      result,
    },
    {
      status: signatureActivationDeferred
        ? 202
        : sourceChangedBeforeProvider
          ? 409
        : result.status === "provider_outcome_unknown"
          ? 202
        : deliverySucceeded
          ? 200
          : result.sent || result.attempted || signatureMetadata
            ? 502
            : 409,
    },
  );
}
