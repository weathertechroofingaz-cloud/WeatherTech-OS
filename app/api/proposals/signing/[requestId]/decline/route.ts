import type { NextRequest } from "next/server";
import {
  PROPOSAL_SIGNING_MAX_ACTION_BODY_BYTES,
  isProposalSigningPublicId,
} from "../../../../../../lib/proposal-signing/constants";
import { declineProposalSigning } from "../../../../../../lib/proposal-signing/db";
import {
  getRequestIdFromContext,
  getSigningHttpStatus,
  proposalSigningError,
  proposalSigningJson,
} from "../../../../../../lib/proposal-signing/http";
import { toProposalSigningPublicDeclineResponse } from "../../../../../../lib/proposal-signing/public-results";
import { loadProposalSigningSession } from "../../../../../../lib/proposal-signing/route-helpers";
import {
  ProposalSigningRequestError,
  hashProposalSigningClientIp,
  normalizeProposalSigningReason,
  readBoundedJsonObject,
  requestHasExactOrigin,
  requestHasValidCsrf,
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

  const idempotencyKey =
    typeof body.idempotencyKey === "string" && UUID_PATTERN.test(body.idempotencyKey)
      ? body.idempotencyKey.toLowerCase()
      : null;
  const reasonCode = normalizeProposalSigningReason(body.reasonCode);
  if (!idempotencyKey || !reasonCode || body.confirmDecline !== true) {
    return proposalSigningError(
      "invalid_request",
      "Confirm that you want to decline this proposal.",
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
  if (!["active", "declined"].includes(loaded.session.status)) {
    return proposalSigningError(
      "conflict",
      "This proposal is no longer awaiting a response. Refresh the page for its current status.",
      409,
    );
  }

  const result = await declineProposalSigning({
    requestId,
    sessionHash: loaded.sessionHash,
    idempotencyKey,
    reasonCode,
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

  return proposalSigningJson(toProposalSigningPublicDeclineResponse(result));
}
