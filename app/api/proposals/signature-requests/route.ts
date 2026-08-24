import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { hasRequiredGmailSendScopes } from "../../../../lib/crm/integrations";
import {
  buildProposalSignatureEmailDraft,
  PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE,
} from "../../../../lib/googleWorkspace/emailDrafts";
import { createServiceSupabaseClient } from "../../../../lib/googleWorkspace/serverClient";
import {
  PROPOSAL_SIGNING_LINK_PLACEHOLDER,
  isProposalSigningPublicId,
} from "../../../../lib/proposal-signing/constants";
import { getProposalSigningReceiptRecovery } from "../../../../lib/proposal-signing/db";
import { transitionProposalSignatureEmail } from "../../../../lib/proposal-signing/emailDelivery";
import { ensureProposalSigningReceiptFromRecovery } from "../../../../lib/proposal-signing/receipt";
import { findUnsupportedDeterministicPdfGlyph } from "../../../../lib/pdf/deterministicUnicodePdf";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SignatureRequestBody = {
  proposalRevisionId?: unknown;
  action?: unknown;
};

const ACTIVE_SIGNATURE_DRAFT_INDEX =
  "email_messages_one_active_proposal_signature_draft_idx";

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getJsonBody(request: NextRequest): Promise<SignatureRequestBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as SignatureRequestBody)
      : {};
  } catch {
    return {};
  }
}

function getMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getRequestedAction(value: unknown) {
  if (value === undefined || value === null || value === "prepare") {
    return "prepare" as const;
  }
  if (
    value === "revoke" ||
    value === "cancel_unsent" ||
    value === "abandon_unknown" ||
    value === "reconcile_receipt" ||
    value === "reconcile_delivery"
  ) {
    return value;
  }
  return null;
}

function collectStringValues(value: unknown, collected: string[] = []): string[] {
  if (typeof value === "string") {
    collected.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((item) => collectStringValues(item, collected));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      collectStringValues(item, collected),
    );
  }
  return collected;
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

async function callSigningRequestRpc(
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  functionName: string,
  args: Record<string, unknown>,
) {
  return (await serviceClient.rpc(functionName as never, args as never)) as unknown as {
    data: unknown;
    error: { message?: string } | null;
  };
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getExactActiveDraftRequestId({
  draft,
  companyId,
  customerId,
  customerEmail,
  estimateId,
  proposalRevisionId,
  revisionSha256,
  termsSha256,
  documentId,
  documentSha256,
}: {
  draft: unknown;
  companyId: string;
  customerId: string;
  customerEmail: string;
  estimateId: string;
  proposalRevisionId: string;
  revisionSha256: string;
  termsSha256: string;
  documentId: string;
  documentSha256: string;
}) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) {
    return null;
  }
  const row = draft as Record<string, unknown>;
  const metadata = row.metadata;
  const requestId = getMetadataString(metadata, "proposalSigningRequestId");
  const toEmails = getStringArray(row.to_emails);
  const recipients = toEmails.length ? toEmails : [getString(row.to_email)];
  const normalizedCustomerEmail = customerEmail.trim().toLowerCase();
  const hasCarbonCopy =
    getStringArray(row.cc_emails).length > 0 ||
    Boolean(getString(row.cc_email)) ||
    getStringArray(row.bcc_emails).length > 0;
  const body = getString(row.body);

  if (
    !isProposalSigningPublicId(requestId) ||
    row.company_id !== companyId ||
    row.customer_id !== customerId ||
    row.estimate_id !== estimateId ||
    row.document_id !== documentId ||
    !["draft", "queued"].includes(getString(row.status)) ||
    recipients.length !== 1 ||
    recipients[0]?.trim().toLowerCase() !== normalizedCustomerEmail ||
    hasCarbonCopy ||
    getMetadataString(metadata, "draftType") !==
      PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE ||
    getMetadataString(metadata, "proposalRevisionId") !== proposalRevisionId ||
    getMetadataString(metadata, "proposalDocumentId") !== documentId ||
    getMetadataString(metadata, "proposalRevisionSha256")?.toLowerCase() !==
      revisionSha256.toLowerCase() ||
    getMetadataString(metadata, "proposalTermsSha256")?.toLowerCase() !==
      termsSha256.toLowerCase() ||
    getMetadataString(metadata, "proposalDocumentSha256")?.toLowerCase() !==
      documentSha256.toLowerCase() ||
    getMetadataString(metadata, "attachmentPolicy") !== "exact_proposal_pdf" ||
    getMetadataString(metadata, "signingLinkPlaceholder") !==
      PROPOSAL_SIGNING_LINK_PLACEHOLDER ||
    body.split(PROPOSAL_SIGNING_LINK_PLACEHOLDER).length - 1 !== 1 ||
    body.includes("#token=")
  ) {
    return null;
  }

  return requestId.toLowerCase();
}

function isActiveDraftUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return false;
  }
  const record = error as Record<string, unknown>;
  const evidence = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return record.code === "23505" && evidence.includes(ACTIVE_SIGNATURE_DRAFT_INDEX);
}

function isExactProviderConfirmedSignatureEmail({
  message,
  signingRequest,
  revision,
}: {
  message: unknown;
  signingRequest: Record<string, unknown>;
  revision: Record<string, unknown>;
}) {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return false;
  }
  const row = message as Record<string, unknown>;
  const metadata = row.metadata;
  const recipient = getString(row.to_email).toLowerCase();
  const toEmails = getStringArray(row.to_emails).map((item) => item.trim().toLowerCase());
  const intendedSignerEmail = getString(signingRequest.intended_signer_email).toLowerCase();
  const hasCarbonCopy =
    getStringArray(row.cc_emails).length > 0 ||
    Boolean(getString(row.cc_email)) ||
    getStringArray(row.bcc_emails).length > 0;

  return Boolean(
    signingRequest.company_id === revision.company_id &&
      signingRequest.proposal_revision_id === revision.id &&
      signingRequest.customer_id === revision.customer_id &&
      signingRequest.estimate_id === revision.estimate_id &&
      signingRequest.proposal_document_id === revision.finalized_document_id &&
    row.id === signingRequest.delivery_email_message_id &&
      row.company_id === revision.company_id &&
      row.customer_id === revision.customer_id &&
      row.estimate_id === revision.estimate_id &&
      row.document_id === revision.finalized_document_id &&
      getString(row.status) === "sent" &&
      getString(row.sync_status) === "sent" &&
      getString(row.direction) === "outbound" &&
      getString(row.category) === "estimate" &&
      getString(row.gmail_message_id) &&
      recipient === intendedSignerEmail &&
      toEmails.length === 1 &&
      toEmails[0] === intendedSignerEmail &&
      !hasCarbonCopy &&
      getMetadataString(metadata, "draftType") ===
        PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE &&
      getMetadataString(metadata, "proposalSigningRequestId") === signingRequest.id &&
      getMetadataString(metadata, "proposalRevisionId") === revision.id &&
      getMetadataString(metadata, "proposalDocumentId") === revision.finalized_document_id &&
      getMetadataString(metadata, "proposalRevisionSha256")?.toLowerCase() ===
        getString(signingRequest.revision_sha256).toLowerCase() &&
      getMetadataString(metadata, "proposalTermsSha256")?.toLowerCase() ===
        getString(signingRequest.terms_sha256).toLowerCase() &&
      getMetadataString(metadata, "proposalDocumentSha256")?.toLowerCase() ===
        getString(signingRequest.document_sha256).toLowerCase(),
  );
}

function preparedDraftResponse({
  proposalRevisionId,
  signingRequestId,
  emailMessageId,
  queued,
}: {
  proposalRevisionId: string;
  signingRequestId: string;
  emailMessageId: string;
  queued: boolean;
}) {
  return jsonResponse(
    {
      ok: true,
      message: queued
        ? "This exact signature email is already awaiting owner approval. Nothing was sent."
        : "This exact signature email draft is already prepared. Nothing was sent.",
      proposalRevisionId,
      signingRequestId,
      emailMessageId,
      deliveryStatus: "prepared",
    },
    200,
  );
}

function existingSignatureDraftResponse({
  draft,
  proposalRevisionId,
  signingRequestId,
}: {
  draft: Record<string, unknown>;
  proposalRevisionId: string;
  signingRequestId: string;
}) {
  const emailMessageId = getString(draft.id);
  const status = getString(draft.status);
  const syncStatus = getString(draft.sync_status);
  const deliveryState = getMetadataString(draft.metadata, "gmailDeliveryState");
  const hasProviderIdentity = Boolean(
    getString(draft.gmail_message_id) ||
      getMetadataString(draft.metadata, "gmailConfirmedMessageId"),
  );

  if (
    (status === "draft" && syncStatus === "local" && !deliveryState) ||
    (status === "queued" && syncStatus === "queued" && !deliveryState)
  ) {
    return preparedDraftResponse({
      proposalRevisionId,
      signingRequestId,
      emailMessageId,
      queued: status === "queued",
    });
  }

  if (deliveryState === "provider_confirmed" || hasProviderIdentity) {
    return jsonResponse(
      {
        ok: false,
        sent: true,
        deliveryStatus: "sent_activation_deferred",
        message:
          "Gmail delivery evidence already exists for this signature request. Reconcile activation only; do not resend or prepare another message.",
      },
      409,
    );
  }

  if (deliveryState === "provider_outcome_unknown") {
    return jsonResponse(
      {
        ok: false,
        deliveryStatus: "provider_outcome_unknown",
        message:
          "The Gmail delivery outcome is unknown. Reconcile the existing attempt before taking any other action; do not resend.",
      },
      409,
    );
  }

  if (syncStatus === "syncing" || deliveryState === "claimed_pre_send") {
    return jsonResponse(
      {
        ok: false,
        deliveryStatus: "delivery_in_progress",
        message:
          "This signature delivery is already in progress. Refresh its durable status before taking another action; do not resend.",
      },
      409,
    );
  }

  return jsonResponse(
    {
      ok: false,
      deliveryStatus: "invalid_delivery_state",
      message:
        "The existing signature delivery is not in a safe preparable state. Resolve its durable status before taking another action.",
    },
    409,
  );
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();
  if (!client || !serviceClient) {
    return jsonResponse(
      { ok: false, message: "Server-side CRM access is not configured." },
      503,
    );
  }

  const { data: authResult } = await client.auth.getUser();
  if (!authResult.user) {
    return jsonResponse(
      { ok: false, message: "Sign in before preparing a signature request." },
      401,
    );
  }

  const body = await getJsonBody(request);
  const requestedAction = getRequestedAction(body.action);
  const proposalRevisionId = isProposalSigningPublicId(body.proposalRevisionId)
    ? body.proposalRevisionId.toLowerCase()
    : null;
  if (!proposalRevisionId || !requestedAction) {
    return jsonResponse(
      {
        ok: false,
        message: "Select a valid finalized proposal revision and signing action.",
      },
      400,
    );
  }

  const { data: revision } = await serviceClient
    .from("estimate_proposal_revisions")
    .select("*")
    .eq("id", proposalRevisionId)
    .maybeSingle();
  if (!revision) {
    return jsonResponse({ ok: false, message: "Proposal revision was not found." }, 404);
  }

  const { data: ownerMembership } = await client
    .from("company_memberships")
    .select("user_id,company_id,role")
    .eq("company_id", revision.company_id)
    .eq("user_id", authResult.user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (!ownerMembership) {
    return jsonResponse(
      { ok: false, message: "A company owner must prepare customer signature delivery." },
      403,
    );
  }

  if (requestedAction === "cancel_unsent") {
    if (!revision.finalized_document_id) {
      return jsonResponse(
        { ok: false, message: "The exact finalized proposal document is missing." },
        409,
      );
    }
    const { data: emailMessages, error: emailMessagesError } = await serviceClient
      .from("email_messages")
      .select("*")
      .eq("company_id", revision.company_id)
      .eq("document_id", revision.finalized_document_id)
      .in("status", ["draft", "queued"])
      .contains("metadata", {
        draftType: PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE,
        proposalRevisionId: revision.id,
      })
      .order("created_at", { ascending: false })
      .limit(2);
    if (emailMessagesError || emailMessages?.length !== 1) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Exactly one safely cancelable unsent signature email could not be resolved.",
        },
        409,
      );
    }
    const emailMessage = emailMessages[0];
    const currentMetadata = getRecord(emailMessage.metadata);
    const safeUnsentState =
      (emailMessage.status === "draft" && emailMessage.sync_status === "local") ||
      (emailMessage.status === "queued" && emailMessage.sync_status === "queued");
    if (
      !safeUnsentState ||
      emailMessage.gmail_message_id ||
      emailMessage.provider_payload_hash ||
      emailMessage.sent_at ||
      getMetadataString(currentMetadata, "gmailDeliveryState")
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "This signature delivery has provider or in-progress evidence and cannot be canceled as unsent. Reconcile it without resending.",
        },
        409,
      );
    }
    const canceledAt = new Date().toISOString();
    const canceledEmail = await transitionProposalSignatureEmail(serviceClient, {
      operationKey: deterministicUuid(
        `signature-email:cancel-unsent:${emailMessage.id}`,
      ),
      actorUserId: authResult.user.id,
      companyId: revision.company_id,
      emailMessageId: emailMessage.id,
      action: "cancel_unsent",
      metadata: {
        ...currentMetadata,
        approvalState: "canceled_unsent",
        proposalSigningDeliveryStatus: "failed_before_send",
        canceledUnsentAt: canceledAt,
        canceledUnsentBy: authResult.user.id,
      },
      lastError:
        "Canceled by the company owner before any Gmail provider attempt. Nothing was sent.",
    });
    if (!canceledEmail.ok) {
      return jsonResponse(
        {
          ok: false,
          message: "The unsent signature email could not be canceled safely.",
        },
        409,
      );
    }
    return jsonResponse(
      {
        ok: true,
        sent: false,
        status: "canceled_unsent",
        proposalRevisionId: revision.id,
        emailMessageId: emailMessage.id,
        message:
          "Unsent signature email canceled. Nothing was delivered; a fresh draft may now use the customer's current email.",
      },
      200,
    );
  }

  if (requestedAction === "abandon_unknown") {
    if (!revision.finalized_document_id) {
      return jsonResponse(
        { ok: false, message: "The exact finalized proposal document is missing." },
        409,
      );
    }
    const { data: unknownMessages, error: unknownMessagesError } =
      await serviceClient
        .from("email_messages")
        .select("*")
        .eq("company_id", revision.company_id)
        .eq("document_id", revision.finalized_document_id)
        .eq("status", "queued")
        .eq("sync_status", "syncing")
        .contains("metadata", {
          draftType: PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE,
          proposalRevisionId: revision.id,
          gmailDeliveryState: "provider_outcome_unknown",
        })
        .order("created_at", { ascending: false })
        .limit(2);
    if (unknownMessagesError || unknownMessages?.length !== 1) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Exactly one unresolved Gmail delivery could not be proven for abandonment.",
        },
        409,
      );
    }
    const emailMessage = unknownMessages[0];
    const currentMetadata = getRecord(emailMessage.metadata);
    const sendAttemptId = getMetadataString(currentMetadata, "sendAttemptId");
    if (
      !sendAttemptId ||
      emailMessage.gmail_message_id ||
      emailMessage.gmail_thread_id ||
      emailMessage.sent_at
    ) {
      return jsonResponse(
        {
          ok: false,
          message:
            "This Gmail attempt has confirmed provider evidence or lacks its exact attempt identity and cannot be abandoned.",
        },
        409,
      );
    }
    const abandonedAt = new Date().toISOString();
    const abandonedEmail = await transitionProposalSignatureEmail(serviceClient, {
      operationKey: deterministicUuid(
        `signature-email:abandon-unknown:${emailMessage.id}:${sendAttemptId}`,
      ),
      actorUserId: authResult.user.id,
      companyId: revision.company_id,
      emailMessageId: emailMessage.id,
      action: "abandon_unknown",
      expectedSendAttemptId: sendAttemptId,
      metadata: {
        ...currentMetadata,
        approvalState: "provider_outcome_abandoned",
        gmailDeliveryState: "provider_outcome_abandoned",
        proposalSigningDeliveryStatus: "provider_outcome_abandoned",
        providerOutcomeAbandonedAt: abandonedAt,
        providerOutcomeAbandonedBy: authResult.user.id,
      },
      lastError:
        "The company owner abandoned this unresolved Gmail attempt only after revoking its customer signing link. Prior delivery remains unknown; no resend occurred in this action.",
    });
    if (!abandonedEmail.ok) {
      return jsonResponse(
        {
          ok: false,
          message:
            "The unresolved Gmail attempt cannot be abandoned until its exact signing link is revoked and no active session remains.",
        },
        409,
      );
    }
    return jsonResponse(
      {
        ok: true,
        status: "provider_outcome_abandoned",
        deliveryStatus: "provider_outcome_abandoned",
        proposalRevisionId: revision.id,
        emailMessageId: emailMessage.id,
        message:
          "Unknown Gmail attempt abandoned after link revocation. Prior delivery remains unknown, the old link is invalid, and a fresh owner-reviewed draft may now be prepared.",
      },
      200,
    );
  }

  if (requestedAction === "reconcile_receipt") {
    const acceptanceId = isProposalSigningPublicId(revision.accepted_acceptance_id)
      ? revision.accepted_acceptance_id.toLowerCase()
      : null;
    if (!acceptanceId || revision.signature_status !== "signed") {
      return jsonResponse(
        {
          ok: false,
          message: "The exact proposal has no completed electronic acceptance to reconcile.",
        },
        409,
      );
    }

    const { data: acceptance, error: acceptanceError } = await serviceClient
      .from("estimate_proposal_acceptances")
      .select("id,company_id,proposal_revision_id,signing_request_id,signature_status")
      .eq("id", acceptanceId)
      .eq("company_id", revision.company_id)
      .eq("proposal_revision_id", revision.id)
      .eq("signature_status", "signed")
      .maybeSingle();
    const signingRequestId = isProposalSigningPublicId(acceptance?.signing_request_id)
      ? acceptance.signing_request_id.toLowerCase()
      : null;
    if (acceptanceError || !acceptance || !signingRequestId) {
      return jsonResponse(
        {
          ok: false,
          message: "The exact signed proposal evidence could not be resolved safely.",
        },
        409,
      );
    }

    const recoveryKeys = {
      requestId: signingRequestId,
      companyId: revision.company_id,
      proposalRevisionId: revision.id,
      acceptanceId,
    };
    const recovered = await getProposalSigningReceiptRecovery(recoveryKeys);
    if (!recovered.ok) {
      return jsonResponse(
        {
          ok: false,
          message: "The exact signed proposal receipt could not be recovered safely.",
        },
        recovered.status === "unavailable" ? 503 : 409,
      );
    }

    const receipt = await ensureProposalSigningReceiptFromRecovery(
      recovered,
      recoveryKeys,
    );
    if (!receipt.ok) {
      return jsonResponse(
        {
          ok: false,
          message: receipt.message,
        },
        503,
      );
    }
    if (!receipt.session.receipt) {
      return jsonResponse(
        {
          ok: false,
          message: "The signature is recorded, but its receipt is not ready yet.",
        },
        503,
      );
    }

    return jsonResponse(
      {
        ok: true,
        message:
          "The immutable electronic-signature receipt is registered and the sold-job evidence gate is restored.",
        proposalRevisionId: revision.id,
        acceptanceId,
        receiptDocumentId: receipt.session.receipt.documentId,
        status: "receipt_registered",
      },
      200,
    );
  }

  if (requestedAction === "reconcile_delivery") {
    const { data: signingRequests, error: signingRequestError } = await serviceClient
      .from("proposal_signing_requests")
      .select(
        "id,company_id,proposal_revision_id,estimate_id,customer_id,proposal_document_id,status,delivery_email_message_id,intended_signer_email,revision_sha256,document_sha256,terms_sha256,expires_at,created_at",
      )
      .eq("company_id", revision.company_id)
      .eq("proposal_revision_id", revision.id)
      .order("created_at", { ascending: false });
    if (signingRequestError) {
      return jsonResponse(
        {
          ok: false,
          sent: true,
          message:
            "The already-sent signature delivery could not be resolved safely. No resend was attempted.",
        },
        502,
      );
    }
    const signingRequest = (signingRequests ?? []).find(
      (item) =>
        ["prepared", "sent", "viewed"].includes(item.status) &&
        isProposalSigningPublicId(item.id) &&
        isProposalSigningPublicId(item.delivery_email_message_id),
    );
    if (!signingRequest?.delivery_email_message_id) {
      return jsonResponse(
        {
          ok: false,
          sent: false,
          message:
            "No provider-confirmed unsigned signature delivery is available to reconcile. Nothing was sent.",
        },
        409,
      );
    }

    const { data: emailMessage, error: emailMessageError } = await serviceClient
      .from("email_messages")
      .select("*")
      .eq("id", signingRequest.delivery_email_message_id)
      .eq("company_id", revision.company_id)
      .maybeSingle();
    if (
      emailMessageError ||
      !emailMessage ||
      !isExactProviderConfirmedSignatureEmail({
        message: emailMessage,
        signingRequest: signingRequest as unknown as Record<string, unknown>,
        revision: revision as unknown as Record<string, unknown>,
      })
    ) {
      return jsonResponse(
        {
          ok: false,
          sent: true,
          deliveryStatus: "failed_after_provider_send",
          message:
            "The Gmail delivery record does not prove the exact proposal, recipient, document, and provider identity. No resend or activation was attempted.",
        },
        409,
      );
    }
    const confirmedGmailMessageId = getString(emailMessage.gmail_message_id);
    const signingRequestExpiresAt = Date.parse(
      getString(signingRequest.expires_at),
    );
    if (
      !Number.isFinite(signingRequestExpiresAt) ||
      signingRequestExpiresAt <= Date.now()
    ) {
      return jsonResponse(
        {
          ok: false,
          sent: true,
          deliveryStatus: "failed_after_provider_send",
          message:
            "Gmail delivery is confirmed, but the signing link expired before activation. No email was resent; revoke the expired request and prepare a fresh link.",
        },
        409,
      );
    }

    if (signingRequest.status === "prepared") {
      const transition = await callSigningRequestRpc(
        serviceClient,
        "wtos_transition_proposal_signing_request",
        {
          transition_request: {
            operationKey: deterministicUuid(`owner-reconcile-delivery:${signingRequest.id}`),
            actorUserId: authResult.user.id,
            companyId: revision.company_id,
            requestId: signingRequest.id,
            action: "mark_sent",
            emailMessageId: emailMessage.id,
            failureCode: null,
            reason:
              "Owner reconciled exact provider-confirmed Gmail evidence without another send.",
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
        (transitionResult as Record<string, unknown>).status !== "sent"
      ) {
        return jsonResponse(
          {
            ok: false,
            sent: true,
            deliveryStatus: "failed_after_provider_send",
            message:
              "Gmail delivery is confirmed, but the exact signing request could not be activated. No resend was attempted.",
          },
          502,
        );
      }
    }

    const currentMetadata =
      emailMessage.metadata &&
      typeof emailMessage.metadata === "object" &&
      !Array.isArray(emailMessage.metadata)
        ? (emailMessage.metadata as Record<string, unknown>)
        : {};
    const persistedDelivery = await transitionProposalSignatureEmail(serviceClient, {
      operationKey: deterministicUuid(
        `signature-email:owner-reconcile:${emailMessage.id}:${confirmedGmailMessageId}`,
      ),
      actorUserId: authResult.user.id,
      companyId: revision.company_id,
      emailMessageId: emailMessage.id,
      action: "reconcile_delivery",
      expectedGmailMessageId: confirmedGmailMessageId,
      metadata: {
        ...currentMetadata,
        approvalState: "sent",
        proposalSigningDeliveryStatus: "sent",
        signatureActivationDeferred: false,
        proposalSigningDeliveryReconciledAt: new Date().toISOString(),
      },
      lastError: null,
    });
    if (!persistedDelivery.ok) {
      return jsonResponse(
        {
          ok: false,
          sent: true,
          signatureRequestActivated: true,
          deliveryStatus: "failed_after_provider_send",
          message:
            "The signing request is activated from exact Gmail evidence, but its owner-facing delivery status could not be persisted. Retry reconciliation only; do not resend.",
        },
        502,
      );
    }

    return jsonResponse(
      {
        ok: true,
        sent: true,
        signatureRequestActivated: true,
        signatureActivationDeferred: false,
        deliveryStatus: "sent",
        message:
          "The existing Gmail delivery is reconciled and the exact customer signing link is active. No email was resent.",
        proposalRevisionId: revision.id,
        signingRequestId: signingRequest.id,
        emailMessageId: emailMessage.id,
        status: "sent",
      },
      200,
    );
  }

  if (requestedAction === "revoke") {
    const { data: signingRequests, error: signingRequestError } = await serviceClient
      .from("proposal_signing_requests")
      .select("id,status,created_at")
      .eq("company_id", revision.company_id)
      .eq("proposal_revision_id", revision.id)
      .order("created_at", { ascending: false });
    if (signingRequestError) {
      return jsonResponse(
        {
          ok: false,
          message: "The active customer signing link could not be resolved safely.",
        },
        502,
      );
    }
    const activeRequest = (signingRequests ?? []).find((item) =>
      ["prepared", "sent", "viewed"].includes(item.status),
    );
    if (!activeRequest) {
      const revokedRequest = (signingRequests ?? []).find(
        (item) => item.status === "revoked",
      );
      if (revokedRequest) {
        return jsonResponse(
          {
            ok: true,
            message: "This customer signing link is already revoked.",
            proposalRevisionId: revision.id,
            signingRequestId: revokedRequest.id,
            status: "revoked",
          },
          200,
        );
      }
      return jsonResponse(
        {
          ok: false,
          message:
            "No active unsigned customer signing link exists for this proposal revision.",
        },
        409,
      );
    }

    const transition = await callSigningRequestRpc(
      serviceClient,
      "wtos_transition_proposal_signing_request",
      {
        transition_request: {
          operationKey: deterministicUuid(`owner-revoke:${activeRequest.id}`),
          actorUserId: authResult.user.id,
          companyId: revision.company_id,
          requestId: activeRequest.id,
          action: "revoke",
          emailMessageId: null,
          failureCode: null,
          reason: "Revoked by the company owner before customer acceptance.",
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
      (transitionResult as Record<string, unknown>).status !== "revoked"
    ) {
      return jsonResponse(
        {
          ok: false,
          message: "The customer signing link could not be revoked safely.",
        },
        409,
      );
    }

    return jsonResponse(
      {
        ok: true,
        message:
          "Customer signing link revoked. The prior link can no longer be exchanged or used.",
        proposalRevisionId: revision.id,
        signingRequestId: activeRequest.id,
        status: "revoked",
      },
      200,
    );
  }

  if (
    !revision.immutable_after_at ||
    !revision.finalized_document_id ||
    !revision.revision_sha256 ||
    !revision.terms_sha256 ||
    !["ready_to_send", "sent"].includes(revision.status) ||
    ["signed", "declined"].includes(revision.signature_status)
  ) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Finalize an immutable unsigned proposal artifact before preparing signature delivery.",
      },
      409,
    );
  }
  if (!revision.customer_id) {
    return jsonResponse(
      { ok: false, message: "The finalized proposal is not linked to a customer." },
      409,
    );
  }

  const [
    { data: company },
    { data: customer },
    { data: document },
    { data: connections },
    { data: existingDrafts },
    { data: activeSigningRequests },
  ] = await Promise.all([
    serviceClient.from("companies").select("*").eq("id", revision.company_id).maybeSingle(),
    serviceClient
      .from("customers")
      .select("*")
      .eq("id", revision.customer_id)
      .eq("company_id", revision.company_id)
      .maybeSingle(),
    serviceClient
      .from("documents")
      .select("*")
      .eq("id", revision.finalized_document_id)
      .eq("company_id", revision.company_id)
      .eq("proposal_revision_id", revision.id)
      .maybeSingle(),
    serviceClient
      .from("integration_connections")
      .select("*")
      .eq("company_id", revision.company_id)
      .eq("provider", "gmail")
      .eq("status", "connected")
      .order("updated_at", { ascending: false }),
    serviceClient
      .from("email_messages")
      .select("*")
      .eq("company_id", revision.company_id)
      .eq("document_id", revision.finalized_document_id)
      .in("status", ["draft", "queued"])
      .contains("metadata", {
        draftType: PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE,
        proposalRevisionId: revision.id,
      })
      .order("created_at", { ascending: false })
      .limit(1),
    serviceClient
      .from("proposal_signing_requests")
      .select("id,status,delivery_email_message_id")
      .eq("company_id", revision.company_id)
      .eq("proposal_revision_id", revision.id)
      .in("status", ["prepared", "sent", "viewed"])
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  if (!company || !customer || !customer.email) {
    return jsonResponse(
      {
        ok: false,
        message: "Add the linked customer's email address before preparing delivery.",
      },
      409,
    );
  }
  const normalizedCustomerEmail = customer.email.trim().toLowerCase();
  const unsupportedPdfGlyph = findUnsupportedDeterministicPdfGlyph([
    ...collectStringValues(revision.customer_snapshot),
    company.name,
    customer.contact_name || customer.display_name,
    normalizedCustomerEmail,
  ]);
  if (unsupportedPdfGlyph) {
    return jsonResponse(
      {
        ok: false,
        message: `The exact proposal or signer identity contains ${unsupportedPdfGlyph.codePointLabel}, which the approved PDF font cannot preserve. Correct that customer-visible text before preparing delivery.`,
      },
      409,
    );
  }
  if (
    !document ||
    document.category !== "proposal" ||
    document.mime_type !== "application/pdf" ||
    document.storage_bucket !== "customer-documents" ||
    !document.storage_path ||
    document.file_url !== null ||
    !document.immutable_after_at ||
    !document.content_sha256 ||
    !/^[a-f0-9]{64}$/i.test(document.content_sha256)
  ) {
    return jsonResponse(
      {
        ok: false,
        message: "The exact private finalized proposal PDF is not available for delivery.",
      },
      409,
    );
  }
  const activeSigningRequest = activeSigningRequests?.[0] ?? null;
  if (activeSigningRequest) {
    return jsonResponse(
      {
        ok: false,
        sent: ["sent", "viewed"].includes(activeSigningRequest.status),
        message:
          "An active customer signing link already exists for this exact revision. Revoke that link before preparing a replacement; no email was created or sent.",
      },
      409,
    );
  }

  const existingDraft = existingDrafts?.[0] ?? null;
  const existingRequestId = getExactActiveDraftRequestId({
    draft: existingDraft,
    companyId: revision.company_id,
    customerId: customer.id,
    customerEmail: normalizedCustomerEmail,
    estimateId: revision.estimate_id,
    proposalRevisionId: revision.id,
    revisionSha256: revision.revision_sha256,
    termsSha256: revision.terms_sha256,
    documentId: document.id,
    documentSha256: document.content_sha256,
  });
  if (existingDraft && !existingRequestId) {
    return jsonResponse(
      {
        ok: false,
        message:
          "An active signature draft exists but no longer matches the exact immutable proposal evidence.",
      },
      409,
    );
  }
  if (existingDraft && existingRequestId) {
    return existingSignatureDraftResponse({
      draft: existingDraft as Record<string, unknown>,
      proposalRevisionId: revision.id,
      signingRequestId: existingRequestId,
    });
  }

  const gmailConnection = (connections ?? []).find(
    (connection) =>
      Boolean(connection.account_email) && hasRequiredGmailSendScopes(connection.scopes),
  );
  if (!gmailConnection?.account_email) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Connect the proposal company Gmail mailbox with the approved send scope before preparing delivery.",
      },
      409,
    );
  }

  const signingRequestId = randomUUID();
  const plan = buildProposalSignatureEmailDraft({
    companyId: revision.company_id,
    companyName: company.name,
    customerId: customer.id,
    customerName: customer.contact_name || customer.display_name,
    recipientEmail: normalizedCustomerEmail,
    leadId: revision.lead_id,
    propertyId: revision.property_id,
    estimateId: revision.estimate_id,
    proposalRevisionId: revision.id,
    proposalNumber: revision.proposal_number,
    revisionNumber: revision.revision_number,
    acceptedTotal: revision.accepted_total,
    revisionSha256: revision.revision_sha256,
    termsSha256: revision.terms_sha256,
    documentId: document.id,
    documentSha256: document.content_sha256,
    signingRequestId,
    integrationConnectionId: gmailConnection.id,
    fromEmail: gmailConnection.account_email,
  });
  if (!plan.ok) {
    return jsonResponse({ ok: false, message: plan.error }, 409);
  }

  const emailMessageId = randomUUID();
  const createDraft = await callSigningRequestRpc(
    serviceClient,
    "wtos_create_proposal_signature_email_draft",
    {
      draft_request: {
        operationKey: deterministicUuid(`signature-email-draft:${signingRequestId}`),
        actorUserId: authResult.user.id,
        emailMessageId,
        companyId: revision.company_id,
        customerId: customer.id,
        leadId: revision.lead_id,
        propertyId: revision.property_id,
        estimateId: revision.estimate_id,
        proposalRevisionId: revision.id,
        documentId: document.id,
        integrationConnectionId: gmailConnection.id,
        signingRequestId,
        fromEmail: gmailConnection.account_email,
        toEmail: normalizedCustomerEmail,
        subject: plan.input.subject,
        body: plan.input.body,
      },
    },
  );
  const createDraftResult = getRecord(
    Array.isArray(createDraft.data) ? createDraft.data[0] : createDraft.data,
  );
  const emailMessage = getRecord(createDraftResult.emailMessage);
  if (
    createDraft.error ||
    createDraftResult.ok !== true ||
    createDraftResult.status !== "draft" ||
    createDraftResult.emailMessageId !== emailMessageId ||
    createDraftResult.signingRequestId !== signingRequestId ||
    emailMessage.id !== emailMessageId
  ) {
    if (isActiveDraftUniqueConflict(createDraft.error)) {
      const { data: concurrentDrafts, error: concurrentDraftError } =
        await serviceClient
          .from("email_messages")
          .select("*")
          .eq("company_id", revision.company_id)
          .eq("document_id", document.id)
          .in("status", ["draft", "queued"])
          .contains("metadata", {
            draftType: PROPOSAL_SIGNATURE_EMAIL_DRAFT_TYPE,
            proposalRevisionId: revision.id,
          })
          .order("created_at", { ascending: false })
          .limit(1);
      const concurrentDraft = concurrentDrafts?.[0] ?? null;
      const concurrentRequestId = getExactActiveDraftRequestId({
        draft: concurrentDraft,
        companyId: revision.company_id,
        customerId: customer.id,
        customerEmail: normalizedCustomerEmail,
        estimateId: revision.estimate_id,
        proposalRevisionId: revision.id,
        revisionSha256: revision.revision_sha256,
        termsSha256: revision.terms_sha256,
        documentId: document.id,
        documentSha256: document.content_sha256,
      });
      if (!concurrentDraftError && concurrentDraft && concurrentRequestId) {
        return existingSignatureDraftResponse({
          draft: concurrentDraft as Record<string, unknown>,
          proposalRevisionId: revision.id,
          signingRequestId: concurrentRequestId,
        });
      }
    }
    return jsonResponse(
      { ok: false, message: "The owner-reviewable signature email draft was not created." },
      502,
    );
  }

  return jsonResponse(
    {
      ok: true,
      message:
        "Electronic signature email prepared for owner review. Nothing was sent and no signing token exists yet.",
      proposalRevisionId: revision.id,
      signingRequestId,
      emailMessageId: emailMessage.id,
      deliveryStatus: "prepared",
    },
    200,
  );
}
