import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { isIP } from "node:net";
import type { NextRequest } from "next/server";
import {
  PROPOSAL_SIGNING_RAW_TOKEN_BYTES,
  getProposalSigningCsrfCookieName,
  getProposalSigningSessionCookieName,
  isProposalSigningExchangeKey,
  isProposalSigningPublicId,
  isProposalSigningRawToken,
} from "./constants";

const JSON_CONTENT_TYPE = /^application\/json(?:\s*;\s*charset=utf-8)?$/i;
const MAX_USER_AGENT_LENGTH = 500;

export function normalizeProposalSigningOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value.trim());
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    if (parsed.protocol !== "https:" && !originIsLocal(parsed.origin)) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getConfiguredProposalSigningOrigin(
  env: Record<string, string | undefined> = process.env,
) {
  return normalizeProposalSigningOrigin(env.NEXT_PUBLIC_APP_URL);
}

function originIsLocal(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

export class ProposalSigningRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ProposalSigningRequestError";
    this.statusCode = statusCode;
  }
}

export function generateProposalSigningToken(bytes = PROPOSAL_SIGNING_RAW_TOKEN_BYTES) {
  return randomBytes(bytes).toString("base64url");
}

export function hashProposalSigningToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function deriveProposalSigningSessionToken({
  requestId,
  rawToken,
  exchangeKey,
  serverSecret = process.env.SUPABASE_SERVICE_ROLE_KEY,
}: {
  requestId: string;
  rawToken: string;
  exchangeKey: string;
  serverSecret?: string;
}) {
  if (
    !isProposalSigningPublicId(requestId) ||
    !isProposalSigningRawToken(rawToken) ||
    !isProposalSigningExchangeKey(exchangeKey) ||
    !serverSecret?.trim()
  ) {
    throw new Error("A valid deterministic signing-session exchange is required.");
  }

  const derivedKey = createHmac("sha256", serverSecret.trim())
    .update("wtos-proposal-signing-session-v1", "utf8")
    .digest();
  return createHmac("sha256", derivedKey)
    .update(requestId.toLowerCase(), "utf8")
    .update("\0", "utf8")
    .update(rawToken, "utf8")
    .update("\0", "utf8")
    .update(exchangeKey, "utf8")
    .digest("base64url");
}

export function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function normalizeForwardedIp(value: string | null) {
  if (!value) {
    return null;
  }

  const first = value.split(",", 1)[0]?.trim();
  if (!first) {
    return null;
  }

  const withoutBrackets = first.startsWith("[")
    ? first.slice(1, first.indexOf("]") > 0 ? first.indexOf("]") : undefined)
    : first;
  const withoutIpv4Port = /^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(withoutBrackets)
    ? withoutBrackets.slice(0, withoutBrackets.lastIndexOf(":"))
    : withoutBrackets;
  return isIP(withoutIpv4Port) ? withoutIpv4Port.toLowerCase() : null;
}

export function getProposalSigningClientIp(headers: Headers) {
  return (
    normalizeForwardedIp(headers.get("x-vercel-forwarded-for")) ??
    normalizeForwardedIp(headers.get("x-forwarded-for")) ??
    normalizeForwardedIp(headers.get("x-real-ip"))
  );
}

export function hashProposalSigningClientIp(headers: Headers) {
  const ip = getProposalSigningClientIp(headers);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!ip || !serviceRoleKey) {
    return null;
  }

  const derivedKey = createHmac("sha256", serviceRoleKey)
    .update("wtos-proposal-signing-ip-v1", "utf8")
    .digest();
  return createHmac("sha256", derivedKey).update(ip, "utf8").digest("hex");
}

export function sanitizeProposalSigningUserAgent(value: string | null) {
  if (!value) {
    return null;
  }

  const sanitized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return sanitized ? sanitized.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

export function getProposalSigningAllowedOrigins(
  request: Pick<NextRequest, "headers" | "nextUrl">,
  env: Record<string, string | undefined> = process.env,
) {
  const allowedOrigins = new Set<string>();
  const configuredOrigin = getConfiguredProposalSigningOrigin(env);
  if (configuredOrigin) {
    allowedOrigins.add(configuredOrigin);
  }

  // Localhost is deliberately retained for isolated regression and local
  // development. Non-local Host headers never become trust anchors.
  const requestOrigin = normalizeProposalSigningOrigin(request.nextUrl.origin);
  if (requestOrigin && originIsLocal(requestOrigin)) {
    allowedOrigins.add(requestOrigin);
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const host = forwardedHost || request.headers.get("host")?.trim();
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  const protocol = forwardedProtocol === "http" || forwardedProtocol === "https"
    ? forwardedProtocol
    : request.nextUrl.protocol.replace(/:$/, "");
  if (host && /^[a-z0-9.\-\[\]:]+$/i.test(host)) {
    const presentedOrigin = normalizeProposalSigningOrigin(`${protocol}://${host}`);
    if (presentedOrigin && originIsLocal(presentedOrigin)) {
      allowedOrigins.add(presentedOrigin);
    }
  }

  return allowedOrigins;
}

export function requestHasExactOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return false;
  }

  try {
    const presentedOrigin = new URL(origin).origin;
    return getProposalSigningAllowedOrigins(request).has(presentedOrigin);
  } catch {
    return false;
  }
}

export function optionalRequestOriginIsSafe(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  return requestHasExactOrigin(request);
}

export async function readBoundedJsonObject(
  request: NextRequest,
  maxBytes: number,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.trim() ?? "";
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    throw new ProposalSigningRequestError("A JSON request body is required.", 415);
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBytes) {
      throw new ProposalSigningRequestError("The request body is too large.", 413);
    }
  }

  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new ProposalSigningRequestError("The request body is too large.", 413);
      }
      chunks.push(value);
    }
  }
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProposalSigningRequestError("The request body is not valid JSON.", 400);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProposalSigningRequestError("A JSON object is required.", 400);
  }

  return parsed as Record<string, unknown>;
}

export function getProposalSigningSessionToken(request: NextRequest, requestId: string) {
  return request.cookies.get(getProposalSigningSessionCookieName(requestId))?.value ?? null;
}

export function requestHasValidCsrf(request: NextRequest, requestId: string) {
  const cookieValue = request.cookies.get(getProposalSigningCsrfCookieName(requestId))?.value;
  const headerValue = request.headers.get("x-wtos-csrf")?.trim();
  return Boolean(cookieValue && headerValue && safeEqual(cookieValue, headerValue));
}

export function maskProposalSigningEmail(email: string) {
  const normalized = email.trim();
  const separator = normalized.lastIndexOf("@");
  if (separator <= 0 || separator === normalized.length - 1) {
    return "email on file";
  }

  const local = normalized.slice(0, separator);
  const domain = normalized.slice(separator + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

export function normalizeProposalSigningName(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return normalized.length >= 2 && normalized.length <= 160 ? normalized : null;
}

export function normalizeProposalSigningReason(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "customer_declined";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 80);
  return normalized || null;
}

export function normalizeUuidList(value: unknown, maxItems = 64) {
  if (!Array.isArray(value) || value.length > maxItems) {
    return null;
  }

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const normalized = value.map((item) =>
    typeof item === "string" && uuidPattern.test(item) ? item.toLowerCase() : null,
  );
  if (normalized.some((item) => item === null)) {
    return null;
  }

  return [...new Set(normalized as string[])].sort();
}
