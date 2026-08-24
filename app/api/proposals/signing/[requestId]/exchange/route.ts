import type { NextRequest } from "next/server";
import {
  PROPOSAL_SIGNING_MAX_EXCHANGE_BODY_BYTES,
  PROPOSAL_SIGNING_SESSION_TTL_SECONDS,
  isProposalSigningExchangeKey,
  isProposalSigningPublicId,
  isProposalSigningRawToken,
} from "../../../../../../lib/proposal-signing/constants";
import { exchangeProposalSigningToken } from "../../../../../../lib/proposal-signing/db";
import {
  getProposalSigningSessionCookieMaxAge,
  getRequestIdFromContext,
  getSigningHttpStatus,
  proposalSigningError,
  proposalSigningJson,
  setProposalSigningCookies,
} from "../../../../../../lib/proposal-signing/http";
import {
  ProposalSigningRequestError,
  deriveProposalSigningSessionToken,
  generateProposalSigningToken,
  hashProposalSigningClientIp,
  hashProposalSigningToken,
  readBoundedJsonObject,
  requestHasExactOrigin,
  sanitizeProposalSigningUserAgent,
} from "../../../../../../lib/proposal-signing/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ requestId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = await getRequestIdFromContext(context);
  if (!isProposalSigningPublicId(requestId)) {
    return proposalSigningError("invalid_request", "This signing link is invalid.", 400);
  }
  if (!requestHasExactOrigin(request)) {
    return proposalSigningError("invalid_request", "The request origin is not allowed.", 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, PROPOSAL_SIGNING_MAX_EXCHANGE_BODY_BYTES);
  } catch (error) {
    if (error instanceof ProposalSigningRequestError) {
      return proposalSigningError("invalid_request", error.message, error.statusCode);
    }
    return proposalSigningError("invalid_request", "The signing request is invalid.", 400);
  }

  const rawToken = body.token;
  const exchangeKey = body.exchangeKey;
  if (
    !isProposalSigningRawToken(rawToken) ||
    !isProposalSigningExchangeKey(exchangeKey)
  ) {
    return proposalSigningError(
      "invalid_or_expired",
      "This signing link is invalid, expired, or no longer active.",
      401,
    );
  }

  let sessionToken: string;
  try {
    sessionToken = deriveProposalSigningSessionToken({
      requestId,
      rawToken,
      exchangeKey,
    });
  } catch {
    return proposalSigningError(
      "unavailable",
      "The secure signing service is not configured.",
      503,
    );
  }
  const sessionExpiresAt = new Date(
    Date.now() + PROPOSAL_SIGNING_SESSION_TTL_SECONDS * 1000,
  ).toISOString();
  const result = await exchangeProposalSigningToken({
    requestId,
    tokenHash: hashProposalSigningToken(rawToken),
    sessionHash: hashProposalSigningToken(sessionToken),
    sessionExpiresAt,
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

  const response = proposalSigningJson({
    ok: true,
    status: result.status,
    sessionExpiresAt: result.sessionExpiresAt,
  });
  setProposalSigningCookies({
    response,
    requestId,
    sessionToken,
    csrfToken:
      result.status === "active" ? generateProposalSigningToken(24) : null,
    maxAge: getProposalSigningSessionCookieMaxAge(result.sessionExpiresAt),
  });
  return response;
}
