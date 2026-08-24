const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const PROPOSAL_SIGNING_PATH_PREFIX = "/proposal/sign";
export const PROPOSAL_SIGNING_API_PREFIX = "/api/proposals/signing";
export const PROPOSAL_SIGNING_FRAGMENT_KEY = "token";
export const PROPOSAL_SIGNING_LINK_PLACEHOLDER = "[[WTOS_PROPOSAL_SIGNING_LINK]]";
export const PROPOSAL_SIGNING_CONSENT_VERSION = "wtos-native-esign-v1";
export const PROPOSAL_SIGNING_CONSENT_TEXT =
  "Electronic records and signature consent for this proposal. This consent applies only to this exact finalized proposal, your acceptance, and the signed receipt. Before signing, you can open, download, print, and save the exact finalized proposal PDF. By selecting the electronic-records checkbox, you confirm that you can access and retain these electronic records. You may decline electronic signing or withdraw this consent before signing by replying to the proposal email or contacting the company; doing so will not affect electronic actions already completed. Keep your email address current by contacting the company. This process requires internet access, a current JavaScript- and cookie-enabled browser, a PDF viewer, and storage or printing capability to retain records. You may request a paper copy by contacting the company; contact the company about availability and any fees. The normal acceptance workflow remains electronic. By selecting all electronic-signature acknowledgements and submitting your typed legal name, you intend that name to be your electronic signature on this exact finalized proposal revision.";
export const PROPOSAL_SIGNING_RAW_TOKEN_BYTES = 32;
export const PROPOSAL_SIGNING_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const PROPOSAL_SIGNING_MAX_EXCHANGE_BODY_BYTES = 1024;
export const PROPOSAL_SIGNING_MAX_ACTION_BODY_BYTES = 12 * 1024;

export function isProposalSigningPublicId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isProposalSigningRawToken(value: unknown): value is string {
  return typeof value === "string" && BASE64URL_TOKEN_PATTERN.test(value);
}

export function isProposalSigningExchangeKey(value: unknown): value is string {
  return typeof value === "string" && BASE64URL_TOKEN_PATTERN.test(value);
}

export function getProposalSigningSessionCookieName(requestId: string) {
  if (!isProposalSigningPublicId(requestId)) {
    throw new Error("A valid proposal signing request ID is required.");
  }

  return `__Host-wtos-ps-${requestId.toLowerCase()}`;
}

export function getProposalSigningCsrfCookieName(requestId: string) {
  if (!isProposalSigningPublicId(requestId)) {
    throw new Error("A valid proposal signing request ID is required.");
  }

  return `__Host-wtos-pc-${requestId.toLowerCase()}`;
}

/**
 * Builds the one customer URL that may contain the raw request token. Callers
 * must keep the returned value in memory only and must never log or persist it.
 */
export function buildProposalSigningUrl(
  origin: string,
  requestId: string,
  rawToken: string,
) {
  if (!isProposalSigningPublicId(requestId)) {
    throw new Error("A valid proposal signing request ID is required.");
  }

  if (!isProposalSigningRawToken(rawToken)) {
    throw new Error("A valid proposal signing token is required.");
  }

  const parsedOrigin = new URL(origin);
  const isLoopback =
    parsedOrigin.hostname === "localhost" ||
    parsedOrigin.hostname === "127.0.0.1" ||
    parsedOrigin.hostname === "[::1]";
  if (
    parsedOrigin.username ||
    parsedOrigin.password ||
    (parsedOrigin.protocol !== "https:" && !(parsedOrigin.protocol === "http:" && isLoopback))
  ) {
    throw new Error("The proposal signing origin must use HTTPS (or local HTTP for regression).");
  }

  const url = new URL(
    `${PROPOSAL_SIGNING_PATH_PREFIX}/${encodeURIComponent(requestId.toLowerCase())}`,
    parsedOrigin.origin,
  );
  url.hash = new URLSearchParams({
    [PROPOSAL_SIGNING_FRAGMENT_KEY]: rawToken,
  }).toString();
  return url.toString();
}
