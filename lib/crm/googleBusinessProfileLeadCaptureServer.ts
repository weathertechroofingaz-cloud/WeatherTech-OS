import { createHash } from "node:crypto";
import type { GoogleBusinessProfileLeadRequestBody } from "./leadIntake";
import { sanitizeIntegrationSyncLogSummary } from "./integrations";
import type {
  GoogleBusinessProfileLocation,
  GoogleBusinessProfileLocationResolution,
} from "./googleBusinessProfileLeadCapture";

export type GoogleBusinessProfileSafeLogContext = {
  body: GoogleBusinessProfileLeadRequestBody;
  resolution: GoogleBusinessProfileLocationResolution;
  correlationId?: string | null;
  rawBody?: string | null;
};

function getText(value: unknown, maxLength = 500) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? trimmed.slice(0, maxLength) : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, maxLength);
  }

  return null;
}

function hashValue(value: unknown) {
  const text = getText(value, 500);

  return text ? createHash("sha256").update(text).digest("hex") : null;
}

export function buildGoogleBusinessProfileSafeLogSummary({
  body,
  resolution,
  correlationId = null,
  rawBody = null,
}: GoogleBusinessProfileSafeLogContext) {
  return sanitizeIntegrationSyncLogSummary({
    provider: "google_business_profile",
    locationKey: resolution.location?.key ?? null,
    locationLabel: resolution.location?.label ?? null,
    resolutionStatus: resolution.status,
    accountIdentifier: resolution.submittedAccountIdentifier,
    locationIdentifier: resolution.submittedLocationIdentifier,
    eventIdentifier: resolution.submittedEventIdentifier,
    eventType: body.eventType ?? body.googleEventType ?? null,
    campaign: resolution.location?.campaign ?? body.campaign ?? null,
    correlationId,
    contact: {
      hasName: Boolean(body.name ?? body.customerName ?? body.reviewerName),
      phoneHash: hashValue(body.phone),
      emailHash: hashValue(body.email),
    },
    message: {
      hasMessage: Boolean(body.message ?? body.reviewText ?? body.comments),
      length: getText(body.message ?? body.reviewText ?? body.comments, 2000)?.length ?? 0,
      hash: hashValue(body.message ?? body.reviewText ?? body.comments),
    },
    rawBodyHash: hashValue(rawBody),
  });
}

export function createGoogleBusinessProfileRequestFingerprint({
  rawBody,
  location,
  externalId,
}: {
  rawBody: string;
  location: GoogleBusinessProfileLocation | null;
  externalId: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        provider: "google_business_profile",
        locationKey: location?.key ?? "unmapped",
        externalId,
        rawBodyHash: createHash("sha256").update(rawBody).digest("hex"),
      }),
    )
    .digest("hex");
}
