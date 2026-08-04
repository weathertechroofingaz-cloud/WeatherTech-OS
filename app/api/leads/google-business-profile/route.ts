import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getLeadIntakeHttpStatus,
  normalizeGoogleBusinessProfileLeadBody,
  previewLeadIntake,
  processLeadIntake,
  type GoogleBusinessProfileLeadRequestBody,
  type LeadIntakeResponse,
} from "../../../../lib/crm/leadIntake";
import { sanitizeIntegrationSyncLogText } from "../../../../lib/crm/integrations";
import { createIntegrationSyncLog } from "../../../../lib/crm/repository";
import type { CompanyRecord, Database } from "../../../../lib/crm/types";
import {
  buildGoogleBusinessProfileLeadCaptureRequestBody,
  buildGoogleBusinessProfileReadiness,
  googleBusinessProfileEndpointPath,
  googleBusinessProfileMaxPayloadBytes,
  isGoogleBusinessProfileSyncEnabled,
  resolveGoogleBusinessProfileLocation,
  type GoogleBusinessProfileLocationResolution,
} from "../../../../lib/crm/googleBusinessProfileLeadCapture";
import {
  buildGoogleBusinessProfileSafeLogSummary,
  createGoogleBusinessProfileRequestFingerprint,
} from "../../../../lib/crm/googleBusinessProfileLeadCaptureServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

type GoogleBusinessProfileLeadResponse = LeadIntakeResponse & {
  route?: "/api/leads/google-business-profile";
  accepts?: "POST";
  correlationId?: string;
  dryRun?: boolean;
  location?: {
    key: string | null;
    status: string;
    label: string | null;
  };
  production?: {
    enabled: boolean;
    status: "enabled" | "disabled";
  };
  normalized?: {
    contactName: string;
    company: string;
    branch: string;
    source: string;
  };
  readiness?: ReturnType<typeof buildGoogleBusinessProfileReadiness>;
};

function getServiceSupabaseClient(): CrmClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

function createJsonResponse(body: GoogleBusinessProfileLeadResponse, status = 200) {
  return NextResponse.json(body, { status });
}

function createGoogleBusinessProfileJsonResponse(
  body: GoogleBusinessProfileLeadResponse,
  status?: number,
) {
  return createJsonResponse(
    {
      route: "/api/leads/google-business-profile",
      ...body,
    },
    status ?? getLeadIntakeHttpStatus(body),
  );
}

function describeSafeError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeIntegrationSyncLogText(error.message) ?? "Request failed.";
  }

  if (typeof error === "string") {
    return sanitizeIntegrationSyncLogText(error) ?? "Request failed.";
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return sanitizeIntegrationSyncLogText(message) ?? "Request failed.";
    }
  }

  return "Request failed.";
}

function getString(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? trimmed.slice(0, 160) : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getExternalId(body: GoogleBusinessProfileLeadRequestBody) {
  return (
    getString(body.googleReviewId) ??
    getString(body.reviewId) ??
    getString(body.googleEventId) ??
    getString(body.eventId) ??
    getString(body.externalLeadId) ??
    getString(body.sourceExternalId) ??
    getString(body.externalId) ??
    getString(body.id)
  );
}

async function findCompanyForGoogleBusinessProfileLocation(
  client: CrmClient,
  locationResolution: GoogleBusinessProfileLocationResolution,
) {
  const location = locationResolution.location;

  if (!location) {
    return null;
  }

  const { data, error } = await client.from("companies").select("*");

  if (error) {
    throw error;
  }

  const companies = (data ?? []) as CompanyRecord[];

  if (location.companyKey === "weathertech_roofing") {
    return (
      companies.find((company) => /weathertech/i.test(company.name)) ??
      companies.find((company) => /roof/i.test(`${company.name} ${company.trade ?? ""}`)) ??
      null
    );
  }

  return (
    companies.find((company) => /\bihc\b/i.test(company.name)) ??
    companies.find((company) => /paint/i.test(`${company.name} ${company.trade ?? ""}`)) ??
    null
  );
}

async function logGoogleBusinessProfileRouteEvent({
  client,
  body,
  rawBody,
  locationResolution,
  correlationId = null,
  status,
  errorCode,
  message,
}: {
  client: CrmClient | null;
  body: GoogleBusinessProfileLeadRequestBody;
  rawBody: string;
  locationResolution: GoogleBusinessProfileLocationResolution;
  correlationId?: string | null;
  status: "failed" | "skipped";
  errorCode: string;
  message: string;
}) {
  if (!client || !locationResolution.location) {
    return;
  }

  try {
    const company = await findCompanyForGoogleBusinessProfileLocation(
      client,
      locationResolution,
    );

    if (!company) {
      return;
    }

    const now = new Date().toISOString();

    await createIntegrationSyncLog(client, {
      company_id: company.id,
      provider: "google_business_profile",
      direction: "provider_to_weathertech",
      event_type: "google_business_profile.lead.rejected",
      status,
      external_id: getExternalId(body),
      attempt_count: 1,
      max_attempts: 1,
      last_attempted_at: now,
      completed_at: now,
      request_fingerprint: createGoogleBusinessProfileRequestFingerprint({
        rawBody,
        location: locationResolution.location,
        externalId: getExternalId(body),
      }),
      request_summary: buildGoogleBusinessProfileSafeLogSummary({
        body,
        resolution: locationResolution,
        correlationId,
        rawBody,
      }),
      response_summary: {
        ok: false,
        status,
        reason: errorCode,
      },
      error_code: errorCode,
      error_message: sanitizeIntegrationSyncLogText(message),
    });
  } catch (error) {
    const safeMessage = describeSafeError(error);

    console.error("[CRM] Google Business Profile intake audit log failed", {
      message: safeMessage,
    });
  }
}

function isSupportedJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  return contentType.includes("application/json") || contentType.includes("+json");
}

function getContentLength(request: NextRequest) {
  const value = request.headers.get("content-length");

  if (!value) {
    return null;
  }

  const length = Number(value);

  return Number.isFinite(length) ? length : null;
}

async function getJsonBody(request: NextRequest): Promise<{
  body: GoogleBusinessProfileLeadRequestBody | null;
  rawBody: string;
  error: string | null;
  status: "ok" | "invalid_json" | "payload_too_large" | "unsupported_content_type";
}> {
  if (!isSupportedJsonContentType(request)) {
    return {
      body: null,
      rawBody: "",
      error: "Request content type must be application/json.",
      status: "unsupported_content_type",
    };
  }

  const contentLength = getContentLength(request);

  if (
    contentLength !== null &&
    contentLength > googleBusinessProfileMaxPayloadBytes
  ) {
    return {
      body: null,
      rawBody: "",
      error: "Request body is too large.",
      status: "payload_too_large",
    };
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > googleBusinessProfileMaxPayloadBytes) {
    return {
      body: null,
      rawBody,
      error: "Request body is too large.",
      status: "payload_too_large",
    };
  }

  try {
    const body: unknown = JSON.parse(rawBody);

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return {
        body: body as GoogleBusinessProfileLeadRequestBody,
        rawBody,
        error: null,
        status: "ok",
      };
    }

    return {
      body: null,
      rawBody,
      error: "Request body must be a JSON object.",
      status: "invalid_json",
    };
  } catch {
    return {
      body: null,
      rawBody,
      error: "Request body must be valid JSON.",
      status: "invalid_json",
    };
  }
}

export async function GET() {
  return createJsonResponse({
    ok: true,
    route: googleBusinessProfileEndpointPath,
    accepts: "POST",
    status: "healthy",
    readiness: buildGoogleBusinessProfileReadiness(),
    warnings: [],
  });
}

export async function POST(request: NextRequest) {
  const { body, rawBody, error: jsonError, status: parseStatus } =
    await getJsonBody(request);

  if (!body) {
    const responseStatus =
      parseStatus === "unsupported_content_type"
        ? "unsupported_content_type"
        : parseStatus === "payload_too_large"
          ? "payload_too_large"
          : "invalid_json";

    return createGoogleBusinessProfileJsonResponse({
      ok: false,
      status: responseStatus,
      warnings: [jsonError ?? "Request body must be valid JSON."],
    });
  }

  const dryRun =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dry_run") === "1" ||
    request.nextUrl.searchParams.get("dry_run") === "true" ||
    (body as { dryRun?: unknown }).dryRun === true;
  const locationResolution = resolveGoogleBusinessProfileLocation(
    body,
    request.headers,
  );
  const correlationId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id") ??
    getString(body.correlationId);
  const captureBody = buildGoogleBusinessProfileLeadCaptureRequestBody({
    body,
    resolution: locationResolution,
    correlationId,
  });
  const normalized = normalizeGoogleBusinessProfileLeadBody(captureBody);

  if (!normalized.lead) {
    const normalizeFailure = normalized as {
      errors: string[];
      warnings: string[];
    };
    const warnings = [...normalizeFailure.warnings, ...normalizeFailure.errors];
    const client = getServiceSupabaseClient();

    await logGoogleBusinessProfileRouteEvent({
      client,
      body,
      rawBody,
      locationResolution,
      correlationId,
      status: "failed",
      errorCode: "validation_failed",
      message: warnings.join(" "),
    });

    return createGoogleBusinessProfileJsonResponse({
      ok: false,
      status: "validation_failed",
      warnings,
    });
  }

  const client = getServiceSupabaseClient();
  const productionEnabled = isGoogleBusinessProfileSyncEnabled(
    locationResolution.location,
  );

  if (!dryRun && !productionEnabled) {
    const message =
      "Google Business Profile live sync is disabled. Google API approval, server-side OAuth, Pub/Sub notification verification, location mapping, and owner approval are required before CRM records can be created from live GBP activity.";

    await logGoogleBusinessProfileRouteEvent({
      client,
      body,
      rawBody,
      locationResolution,
      correlationId,
      status: "skipped",
      errorCode: "production_disabled",
      message,
    });

    return createGoogleBusinessProfileJsonResponse({
      ok: false,
      provider: "google_business_profile",
      status: "production_disabled",
      correlationId: normalized.lead.correlationId ?? undefined,
      location: {
        key: locationResolution.location?.key ?? null,
        status: locationResolution.status,
        label: locationResolution.location?.label ?? null,
      },
      production: {
        enabled: false,
        status: "disabled",
      },
      warnings: [message],
    });
  }

  if (dryRun) {
    const warnings = [
      ...locationResolution.warnings,
      ...normalized.lead.warnings,
    ];

    if (!client) {
      return createGoogleBusinessProfileJsonResponse({
        ok: true,
        provider: "google_business_profile",
        status: "dry_run",
        dryRun: true,
        correlationId: normalized.lead.correlationId ?? undefined,
        routing: {
          company: normalized.lead.companyKey,
          branch: normalized.lead.branchKey,
          status: normalized.lead.routingStatus,
          confidence: normalized.lead.routingConfidence,
          assignedQueue: normalized.lead.assignedQueue,
        },
        duplicateConfidence: normalized.lead.duplicateConfidence,
        location: {
          key: locationResolution.location?.key ?? null,
          status: locationResolution.status,
          label: locationResolution.location?.label ?? null,
        },
        normalized: {
          contactName: normalized.lead.contactName,
          company: normalized.lead.companyKey,
          branch: normalized.lead.branchKey,
          source: normalized.lead.source,
        },
        warnings: [
          ...warnings,
          "CRM duplicate preview was skipped because Supabase service-role access is not configured.",
        ],
      });
    }

    try {
      const preview = await previewLeadIntake(client, normalized.lead);

      return createGoogleBusinessProfileJsonResponse({
        ...preview,
        dryRun: true,
        correlationId: normalized.lead.correlationId ?? undefined,
        location: {
          key: locationResolution.location?.key ?? null,
          status: locationResolution.status,
          label: locationResolution.location?.label ?? null,
        },
        normalized: {
          contactName: normalized.lead.contactName,
          company: normalized.lead.companyKey,
          branch: normalized.lead.branchKey,
          source: normalized.lead.source,
        },
        warnings: [...warnings, ...preview.warnings],
      });
    } catch (error) {
      const message = describeSafeError(error);

      console.error("[CRM] Google Business Profile dry-run preview failed", {
        message,
      });

      return createGoogleBusinessProfileJsonResponse(
        {
          ok: false,
          provider: "google_business_profile",
          status: "error",
          dryRun: true,
          warnings: [message],
        },
        500,
      );
    }
  }

  if (!client) {
    return createGoogleBusinessProfileJsonResponse({
      ok: false,
      provider: "google_business_profile",
      status: "crm_not_configured",
      warnings: [
        "Supabase service-role access is not configured, so Google Business Profile intake cannot create CRM records.",
      ],
    });
  }

  try {
    const result = await processLeadIntake(client, normalized.lead);

    return createGoogleBusinessProfileJsonResponse({
      ...result,
      correlationId: normalized.lead.correlationId ?? undefined,
      location: {
        key: locationResolution.location?.key ?? null,
        status: locationResolution.status,
        label: locationResolution.location?.label ?? null,
      },
      normalized: {
        contactName: normalized.lead.contactName,
        company: normalized.lead.companyKey,
        branch: normalized.lead.branchKey,
        source: normalized.lead.source,
      },
      warnings: [
        ...locationResolution.warnings,
        ...normalized.lead.warnings,
        ...result.warnings,
      ],
    });
  } catch (error) {
    const message = describeSafeError(error);

    console.error("[CRM] Google Business Profile intake failed", { message });

    return createGoogleBusinessProfileJsonResponse(
      {
        ok: false,
        provider: "google_business_profile",
        status: "error",
        warnings: [message],
      },
      500,
    );
  }
}
