import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import type {
  MightyApesYelpEvent,
  MightyApesYelpIntakeRequest,
} from "./types";

type RawBody = string | Uint8Array;

type HeadersLike =
  | Pick<Headers, "get">
  | Record<string, string | string[] | undefined>;

type JsonObject = Record<string, unknown>;

export type MightyApesYelpPayload = {
  version: 1;
  event: MightyApesYelpEvent;
  campaign: {
    yelp_id: string;
    name: string;
  };
  lead: {
    id: string;
    name: string;
    phone: string;
    zip_code: string;
    job_category?: string;
    message: string;
    created_at: string;
  };
};

export type MightyApesYelpVerification = {
  deliveryId: string;
  headerTimestamp: number;
  payloadFingerprint: string;
  receivedAt: string;
};

export type MightyApesYelpFailureCode =
  | "configuration_required"
  | "payload_too_large"
  | "invalid_user_agent"
  | "missing_delivery"
  | "invalid_delivery"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "stale_timestamp"
  | "missing_signature"
  | "invalid_signature"
  | "malformed_json"
  | "invalid_payload"
  | "unsupported_version"
  | "unsupported_event"
  | "unsupported_campaign";

export type MightyApesYelpFailure = {
  ok: false;
  status: 400 | 401 | 413 | 422 | 503;
  code: MightyApesYelpFailureCode;
  message: string;
};

export type MightyApesYelpVerificationResult =
  | {
      ok: true;
      verification: MightyApesYelpVerification;
    }
  | MightyApesYelpFailure;

export type MightyApesYelpPayloadResult =
  | {
      ok: true;
      payload: MightyApesYelpPayload;
    }
  | MightyApesYelpFailure;

export const mightyApesYelpWebhookEndpointPath =
  "/api/integrations/mighty-apes/yelp/webhook";
export const mightyApesYelpWebhookSecretEnvVar =
  "MIGHTY_APES_YELP_WEBHOOK_SECRET";
export const mightyApesYelpWebhookUserAgent = "MightyApes-Webhook/1";
export const mightyApesYelpCampaignId = "00LZA1SuPKX0yUnsdthgLg";
export const mightyApesYelpReplayWindowSeconds = 300;
export const mightyApesYelpMaxPayloadBytes = 32_000;
export const mightyApesYelpMaxMessageBytes = 28_000;

const allowedTopLevelFields = new Set([
  "version",
  "event",
  "campaign",
  "lead",
]);
const allowedCampaignFields = new Set(["yelp_id", "name"]);
const allowedLeadFields = new Set([
  "id",
  "name",
  "phone",
  "zip_code",
  "job_category",
  "message",
  "created_at",
]);
const e164Pattern = /^\+[1-9]\d{7,14}$/;
const postalCodePattern = /^\d{5}(?:-\d{4})?$/;
const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const signaturePattern = /^sha256=([a-fA-F0-9]{64})$/;
const unsafeIdentifierCharacterPattern = /[\u0000-\u001f\u007f]/;
const unsafeTextCharacterPattern = /\u0000/;

function asBytes(rawBody: RawBody) {
  return typeof rawBody === "string"
    ? Buffer.from(rawBody, "utf8")
    : Buffer.from(rawBody);
}

function failure(
  status: MightyApesYelpFailure["status"],
  code: MightyApesYelpFailureCode,
  message: string,
): MightyApesYelpFailure {
  return { ok: false, status, code, message };
}

function headerValue(headers: HeadersLike, name: string) {
  if ("get" in headers && typeof headers.get === "function") {
    return headers.get(name);
  }

  const record = headers as Record<
    string,
    string | string[] | undefined
  >;
  const matchingKey = Object.keys(record).find(
    (key) => key.toLowerCase() === name.toLowerCase(),
  );
  const value = matchingKey ? record[matchingKey] : undefined;

  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : null;
  }

  return value ?? null;
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyFields(value: JsonObject, allowed: ReadonlySet<string>) {
  return Object.keys(value).every((key) => allowed.has(key));
}

function requiredString(
  value: unknown,
  maxLength: number,
  options: { allowNewlines?: boolean } = {},
) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > maxLength
  ) {
    return null;
  }

  const unsafePattern = options.allowNewlines
    ? unsafeTextCharacterPattern
    : unsafeIdentifierCharacterPattern;

  return unsafePattern.test(value) ? null : value;
}

function isValidIsoTimestamp(value: string) {
  const match = isoTimestampPattern.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === undefined ? 0 : Number(match[8]);
  const offsetMinute = match[9] === undefined ? 0 : Number(match[9]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 14 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || offsetMinute === 0) &&
    Number.isFinite(Date.parse(value))
  );
}

function decodeUtf8(rawBody: RawBody) {
  if (typeof rawBody === "string") {
    return rawBody;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(rawBody);
  } catch {
    return null;
  }
}

export function createMightyApesYelpSignature(
  rawBody: RawBody,
  secret: string,
) {
  return `sha256=${createHmac("sha256", secret)
    .update(asBytes(rawBody))
    .digest("hex")}`;
}

export function createMightyApesYelpPayloadFingerprint(rawBody: RawBody) {
  return createHash("sha256").update(asBytes(rawBody)).digest("hex");
}

export function verifyMightyApesYelpRequest({
  rawBody,
  headers,
  secret,
  now = new Date(),
}: {
  rawBody: RawBody;
  headers: HeadersLike;
  secret: string | null | undefined;
  now?: Date;
}): MightyApesYelpVerificationResult {
  const bodyBytes = asBytes(rawBody);

  if (secret === null || secret === undefined || secret.length === 0) {
    return failure(
      503,
      "configuration_required",
      "Mighty Apes webhook processing is not configured.",
    );
  }

  if (bodyBytes.byteLength > mightyApesYelpMaxPayloadBytes) {
    return failure(413, "payload_too_large", "Request body is too large.");
  }

  if (
    headerValue(headers, "user-agent") !== mightyApesYelpWebhookUserAgent
  ) {
    return failure(
      400,
      "invalid_user_agent",
      "Request user agent is not supported.",
    );
  }

  const deliveryId = headerValue(headers, "x-mightyapes-delivery");

  if (deliveryId === null || deliveryId === "") {
    return failure(
      400,
      "missing_delivery",
      "Mighty Apes delivery identifier is required.",
    );
  }

  if (
    deliveryId.length > 240 ||
    deliveryId !== deliveryId.trim() ||
    unsafeIdentifierCharacterPattern.test(deliveryId)
  ) {
    return failure(
      400,
      "invalid_delivery",
      "Mighty Apes delivery identifier is invalid.",
    );
  }

  const timestampHeader = headerValue(headers, "x-mightyapes-timestamp");

  if (timestampHeader === null || timestampHeader === "") {
    return failure(
      401,
      "missing_timestamp",
      "Mighty Apes request timestamp is required.",
    );
  }

  if (!/^\d{1,12}$/.test(timestampHeader)) {
    return failure(
      401,
      "invalid_timestamp",
      "Mighty Apes request timestamp is invalid.",
    );
  }

  const headerTimestamp = Number(timestampHeader);
  const currentTimestamp = Math.floor(now.getTime() / 1000);

  if (
    !Number.isSafeInteger(headerTimestamp) ||
    !Number.isFinite(currentTimestamp)
  ) {
    return failure(
      401,
      "invalid_timestamp",
      "Mighty Apes request timestamp is invalid.",
    );
  }

  if (
    Math.abs(currentTimestamp - headerTimestamp) >
    mightyApesYelpReplayWindowSeconds
  ) {
    return failure(
      401,
      "stale_timestamp",
      "Mighty Apes request timestamp is outside the accepted window.",
    );
  }

  const signatureHeader = headerValue(headers, "x-mightyapes-signature");

  if (signatureHeader === null || signatureHeader === "") {
    return failure(
      401,
      "missing_signature",
      "Mighty Apes request signature is required.",
    );
  }

  const signatureMatch = signaturePattern.exec(signatureHeader);

  if (!signatureMatch) {
    return failure(
      401,
      "invalid_signature",
      "Mighty Apes request signature is invalid.",
    );
  }

  const suppliedDigest = Buffer.from(signatureMatch[1], "hex");
  const expectedDigest = Buffer.from(
    createMightyApesYelpSignature(bodyBytes, secret).slice("sha256=".length),
    "hex",
  );

  if (
    suppliedDigest.byteLength !== expectedDigest.byteLength ||
    !timingSafeEqual(suppliedDigest, expectedDigest)
  ) {
    return failure(
      401,
      "invalid_signature",
      "Mighty Apes request signature is invalid.",
    );
  }

  return {
    ok: true,
    verification: {
      deliveryId,
      headerTimestamp,
      payloadFingerprint: createMightyApesYelpPayloadFingerprint(bodyBytes),
      receivedAt: now.toISOString(),
    },
  };
}

export function parseMightyApesYelpPayload(
  rawBody: RawBody,
): MightyApesYelpPayloadResult {
  const rawText = decodeUtf8(rawBody);

  if (rawText === null) {
    return failure(400, "malformed_json", "Request body is not valid JSON.");
  }

  let candidate: unknown;

  try {
    candidate = JSON.parse(rawText);
  } catch {
    return failure(400, "malformed_json", "Request body is not valid JSON.");
  }

  if (!isJsonObject(candidate) || !hasOnlyFields(candidate, allowedTopLevelFields)) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  if (!("version" in candidate)) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  if (candidate.version !== 1) {
    return failure(
      422,
      "unsupported_version",
      "Mighty Apes payload version is not supported.",
    );
  }

  if (!("event" in candidate)) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  if (candidate.event !== "lead.created" && candidate.event !== "lead.test") {
    return failure(
      422,
      "unsupported_event",
      "Mighty Apes event is not supported.",
    );
  }

  if (
    !isJsonObject(candidate.campaign) ||
    !hasOnlyFields(candidate.campaign, allowedCampaignFields)
  ) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  const campaignId = requiredString(candidate.campaign.yelp_id, 160);
  const campaignName = requiredString(candidate.campaign.name, 240);

  if (!campaignId || !campaignName) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  if (campaignId !== mightyApesYelpCampaignId) {
    return failure(
      422,
      "unsupported_campaign",
      "Mighty Apes campaign is not authorized.",
    );
  }

  if (
    !isJsonObject(candidate.lead) ||
    !hasOnlyFields(candidate.lead, allowedLeadFields)
  ) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  const leadId = requiredString(candidate.lead.id, 200);
  const leadName = requiredString(candidate.lead.name, 160);
  const leadPhone = requiredString(candidate.lead.phone, 16);
  const leadZipCode = requiredString(candidate.lead.zip_code, 10);
  const leadMessage = requiredString(candidate.lead.message, 32_000, {
    allowNewlines: true,
  });
  const leadCreatedAt = requiredString(candidate.lead.created_at, 80);
  const jobCategoryValue = candidate.lead.job_category;
  const jobCategory =
    jobCategoryValue === undefined || jobCategoryValue === null
      ? undefined
      : requiredString(jobCategoryValue, 240);

  if (
    !leadId ||
    !leadName ||
    !leadPhone ||
    !leadZipCode ||
    !leadMessage ||
    !leadCreatedAt ||
    leadId !== leadId.trim() ||
    !e164Pattern.test(leadPhone) ||
    !postalCodePattern.test(leadZipCode) ||
    Buffer.byteLength(leadMessage, "utf8") > mightyApesYelpMaxMessageBytes ||
    !isValidIsoTimestamp(leadCreatedAt) ||
    (jobCategoryValue !== undefined &&
      jobCategoryValue !== null &&
      !jobCategory)
  ) {
    return failure(400, "invalid_payload", "Request payload is invalid.");
  }

  return {
    ok: true,
    payload: {
      version: 1,
      event: candidate.event,
      campaign: {
        yelp_id: campaignId,
        name: campaignName,
      },
      lead: {
        id: leadId,
        name: leadName,
        phone: leadPhone,
        zip_code: leadZipCode,
        ...(typeof jobCategory === "string"
          ? { job_category: jobCategory }
          : {}),
        message: leadMessage,
        created_at: leadCreatedAt,
      },
    },
  };
}

export function buildMightyApesYelpIntakeRequest(
  payload: MightyApesYelpPayload,
  verification: MightyApesYelpVerification,
): MightyApesYelpIntakeRequest {
  const jobCategory = payload.lead.job_category;

  return {
    version: 1,
    event: payload.event,
    delivery_id: verification.deliveryId,
    payload_fingerprint: verification.payloadFingerprint,
    header_timestamp: verification.headerTimestamp,
    received_at: verification.receivedAt,
    campaign: {
      yelp_id: payload.campaign.yelp_id,
      name: payload.campaign.name,
    },
    lead: {
      id: payload.lead.id,
      name: payload.lead.name,
      phone: payload.lead.phone,
      zip_code: payload.lead.zip_code,
      ...(jobCategory === undefined ? {} : { job_category: jobCategory }),
      message: payload.lead.message,
      created_at: payload.lead.created_at,
    },
  };
}

export function buildMightyApesYelpSafeAuditSummary(
  payload: MightyApesYelpPayload,
  verification: MightyApesYelpVerification,
) {
  return {
    provider: "mighty_apes",
    source: "Yelp",
    event: payload.event,
    version: payload.version,
    deliveryId: verification.deliveryId,
    payloadFingerprint: verification.payloadFingerprint,
    headerTimestamp: verification.headerTimestamp,
    receivedAt: verification.receivedAt,
    campaignYelpId: payload.campaign.yelp_id,
    providerLeadId: payload.lead.id,
  } as const;
}
