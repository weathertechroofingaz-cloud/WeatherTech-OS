import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  PROPOSAL_SIGNING_SESSION_TTL_SECONDS,
  getProposalSigningCsrfCookieName,
  getProposalSigningSessionCookieName,
} from "./constants";
import type { ProposalSigningErrorStatus } from "./contracts";

export const PROPOSAL_SIGNING_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  Vary: "Origin, Cookie",
} as const;

export function proposalSigningJson(
  body: Record<string, unknown>,
  status = 200,
  headers?: HeadersInit,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...PROPOSAL_SIGNING_RESPONSE_HEADERS,
      "Content-Security-Policy":
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
      ...headers,
    },
  });
}

export function proposalSigningError(
  status: ProposalSigningErrorStatus,
  message: string,
  httpStatus: number,
) {
  return proposalSigningJson({ ok: false, status, message }, httpStatus);
}

export function setProposalSigningCookies({
  response,
  requestId,
  sessionToken,
  csrfToken,
  maxAge = PROPOSAL_SIGNING_SESSION_TTL_SECONDS,
}: {
  response: NextResponse;
  requestId: string;
  sessionToken: string;
  csrfToken: string | null;
  maxAge?: number;
}) {
  response.cookies.set(getProposalSigningSessionCookieName(requestId), sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge,
  });
  response.cookies.set(
    getProposalSigningCsrfCookieName(requestId),
    csrfToken ?? "",
    {
      httpOnly: false,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: csrfToken ? maxAge : 0,
    },
  );
}

export function getProposalSigningSessionCookieMaxAge(
  sessionExpiresAt: string,
  now = Date.now(),
) {
  const expiresAt = Date.parse(sessionExpiresAt);
  if (!Number.isFinite(expiresAt)) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(
      PROPOSAL_SIGNING_SESSION_TTL_SECONDS,
      Math.floor((expiresAt - now) / 1000),
    ),
  );
}

export function getRequestIdFromContext(
  context: { params: Promise<{ requestId: string }> },
) {
  return context.params.then((params) => params.requestId.toLowerCase());
}

export function getRequestEvidence(request: NextRequest) {
  return {
    userAgent: request.headers.get("user-agent"),
  };
}

export function getSigningHttpStatus(status: string) {
  switch (status) {
    case "rate_limited":
      return 429;
    case "conflict":
    case "signed":
    case "declined":
    case "superseded":
      return 409;
    case "unavailable":
      return 503;
    case "invalid_request":
      return 400;
    default:
      return 401;
  }
}
