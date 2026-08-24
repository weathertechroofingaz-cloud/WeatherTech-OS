import type { NextRequest } from "next/server";
import {
  PROPOSAL_SIGNING_MAX_ACTION_BODY_BYTES,
  isProposalSigningPublicId,
} from "../../../../../../lib/proposal-signing/constants";
import {
  acceptProposalSigning,
  getProposalSigningSession,
} from "../../../../../../lib/proposal-signing/db";
import {
  getRequestIdFromContext,
  getSigningHttpStatus,
  proposalSigningError,
  proposalSigningJson,
} from "../../../../../../lib/proposal-signing/http";
import { toProposalSigningPublicAcceptResponse } from "../../../../../../lib/proposal-signing/public-results";
import { ensureProposalSigningReceipt } from "../../../../../../lib/proposal-signing/receipt";
import { loadProposalSigningSession } from "../../../../../../lib/proposal-signing/route-helpers";
import {
  ProposalSigningRequestError,
  hashProposalSigningClientIp,
  normalizeProposalSigningName,
  readBoundedJsonObject,
  requestHasExactOrigin,
  requestHasValidCsrf,
  safeEqual,
  sanitizeProposalSigningUserAgent,
} from "../../../../../../lib/proposal-signing/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type RouteContext = { params: Promise<{ requestId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = await getRequestIdFromContext(context);
  if (!isProposalSigningPublicId(requestId)) {
    return proposalSigningError("invalid_request", "This signing link is invalid.", 400);
  }
  if (!requestHasExactOrigin(request) || !requestHasValidCsrf(request, requestId)) {
    return proposalSigningError("invalid_request", "The signing request could not be verified.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, PROPOSAL_SIGNING_MAX_ACTION_BODY_BYTES);
  } catch (error) {
    if (error instanceof ProposalSigningRequestError) {
      return proposalSigningError("invalid_request", error.message, error.statusCode);
    }
    return proposalSigningError("invalid_request", "The signing request is invalid.", 400);
  }

  const signerName = normalizeProposalSigningName(body.signerName);
  const signatureText = normalizeProposalSigningName(body.signatureText);
  const idempotencyKey =
    typeof body.idempotencyKey === "string" && UUID_PATTERN.test(body.idempotencyKey)
      ? body.idempotencyKey.toLowerCase()
      : null;
  if (
    !signerName ||
    !signatureText ||
    !safeEqual(signerName, signatureText) ||
    !idempotencyKey ||
    body.termsAccepted !== true ||
    body.electronicRecordsConsented !== true ||
    body.signatureIntentAcknowledged !== true
  ) {
    return proposalSigningError(
      "invalid_request",
      "Enter the same legal name twice and acknowledge every required signing statement.",
      400,
    );
  }

  const loaded = await loadProposalSigningSession(request, requestId);
  if (loaded.ok === false) {
    return proposalSigningError(
      loaded.status,
      loaded.message,
      getSigningHttpStatus(loaded.status),
    );
  }
  if (!["active", "signed"].includes(loaded.session.status)) {
    return proposalSigningError(
      "conflict",
      "This proposal is no longer awaiting a signature. Refresh the page for its current status.",
      409,
    );
  }

  const intendedSignerName = normalizeProposalSigningName(loaded.session.signer.name);
  if (!intendedSignerName || !safeEqual(signerName, intendedSignerName)) {
    return proposalSigningError(
      "conflict",
      "The signer name must exactly match the intended signer shown on this proposal.",
      409,
    );
  }

  const proposal = loaded.session.proposal;
  const result = await acceptProposalSigning({
    requestId,
    sessionHash: loaded.sessionHash,
    idempotencyKey,
    signerName: intendedSignerName,
    signerEmail: loaded.session.signer.email,
    selectedOptionIds: [...proposal.selectedOptionIds].sort(),
    acceptedTotal: proposal.acceptedTotal,
    termsAccepted: true,
    electronicRecordsConsented: true,
    signatureIntentAcknowledged: true,
    revisionSha256: proposal.revisionSha256,
    documentSha256: loaded.session.document.sha256,
    termsSha256: proposal.termsSha256,
    consentSha256: proposal.consentSha256,
    ipHash: hashProposalSigningClientIp(request.headers),
    userAgent: sanitizeProposalSigningUserAgent(request.headers.get("user-agent")),
  });
  if (result.ok === false) {
    return proposalSigningError(
      result.status,
      result.message,
      getSigningHttpStatus(result.status),
    );
  }

  const signedSession = await getProposalSigningSession({
    requestId,
    sessionHash: loaded.sessionHash,
  });
  let receipt: Awaited<ReturnType<typeof ensureProposalSigningReceipt>> = {
    ok: false,
    message: "The signature is recorded, but the signed receipt is not ready yet.",
  };
  if (signedSession.ok) {
    try {
      receipt = await ensureProposalSigningReceipt(signedSession, loaded.sessionHash);
    } catch {
      // Acceptance is already committed. Never tell the customer it failed
      // merely because deterministic receipt generation/storage is temporarily
      // unavailable; owner/customer reconciliation can retry the exact evidence.
    }
  }

  return proposalSigningJson(
    toProposalSigningPublicAcceptResponse(result, {
      ready: receipt.ok && Boolean(receipt.session.receipt),
      message: receipt.ok === true ? null : receipt.message,
    }),
  );
}
