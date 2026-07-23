import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getLeadIntakeHttpStatus,
  normalizeYelpLeadBody,
  previewLeadIntake,
  processLeadIntake,
  type LeadIntakeResponse,
  type YelpLeadRequestBody,
} from "../../../../lib/crm/leadIntake";
import { sanitizeIntegrationSyncLogText } from "../../../../lib/crm/integrations";
import type { Database } from "../../../../lib/crm/types";
import {
  buildYelpLeadCaptureReadiness,
  buildYelpLeadCaptureRequestBody,
  evaluateYelpLeadCaptureAbuse,
  resolveYelpLeadCaptureAccount,
  verifyYelpLeadCaptureRequest,
  yelpLeadCaptureEndpointPath,
  yelpLeadCaptureMaxPayloadBytes,
  type YelpLeadCaptureAbuseResult,
  type YelpLeadCaptureVerificationResult,
} from "../../../../lib/crm/yelpLeadCapture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

type YelpLeadResponse = LeadIntakeResponse & {
  route?: "/api/leads/yelp";
  accepts?: "POST";
  correlationId?: string;
  dryRun?: boolean;
  account?: {
    key: string | null;
    status: string;
    label: string | null;
  };
  verification?: Pick<YelpLeadCaptureVerificationResult, "status" | "summary">;
  abuse?: Pick<YelpLeadCaptureAbuseResult, "status" | "signals">;
  normalized?: {
    contactName: string;
    company: string;
    branch: string;
    source: string;
  };
  readiness?: ReturnType<typeof buildYelpLeadCaptureReadiness>;
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

function createJsonResponse(body: YelpLeadResponse, status = 200) {
  return NextResponse.json(body, { status });
}

function createYelpJsonResponse(body: YelpLeadResponse, status?: number) {
  return createJsonResponse(
    {
      route: "/api/leads/yelp",
      ...body,
    },
    status ?? getLeadIntakeHttpStatus(body),
  );
}

function getVerificationFailureStatus(
  status: YelpLeadCaptureVerificationResult["status"],
): LeadIntakeResponse["status"] {
  if (status === "missing_signature" || status === "invalid_signature") {
    return status;
  }

  return "verification_required";
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

function isSupportedJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  return (
    contentType.includes("application/json") ||
    contentType.includes("+json")
  );
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
  body: YelpLeadRequestBody | null;
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

  if (contentLength !== null && contentLength > yelpLeadCaptureMaxPayloadBytes) {
    return {
      body: null,
      rawBody: "",
      error: "Request body is too large.",
      status: "payload_too_large",
    };
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > yelpLeadCaptureMaxPayloadBytes) {
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
        body: body as YelpLeadRequestBody,
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
    route: yelpLeadCaptureEndpointPath,
    accepts: "POST",
    status: "healthy",
    readiness: buildYelpLeadCaptureReadiness(),
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

    return createYelpJsonResponse({
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
  const accountResolution = resolveYelpLeadCaptureAccount(
    body,
    request.headers,
  );
  const abuse = evaluateYelpLeadCaptureAbuse(body, accountResolution);

  if (abuse.status === "blocked") {
    return createYelpJsonResponse({
      ok: false,
      status: "source_disabled",
      account: {
        key: accountResolution.account?.key ?? null,
        status: accountResolution.status,
        label: accountResolution.account?.label ?? null,
      },
      abuse: {
        status: abuse.status,
        signals: abuse.signals,
      },
      warnings: abuse.signals.map((signal) => signal.label),
    });
  }

  const verification = verifyYelpLeadCaptureRequest({
    rawBody,
    headers: request.headers,
    account: accountResolution.account,
    dryRun,
  });

  if (!verification.ok) {
    return createYelpJsonResponse({
      ok: false,
      status: getVerificationFailureStatus(verification.status),
      account: {
        key: accountResolution.account?.key ?? null,
        status: accountResolution.status,
        label: accountResolution.account?.label ?? null,
      },
      verification: {
        status: verification.status,
        summary: verification.summary,
      },
      warnings: [verification.summary],
    });
  }

  const correlationId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id") ??
    null;
  const captureBody = buildYelpLeadCaptureRequestBody({
    body,
    resolution: accountResolution,
    verification,
    abuse,
    correlationId,
  });
  const normalized = normalizeYelpLeadBody(captureBody);

  if (!normalized.lead) {
    return createYelpJsonResponse({
      ok: false,
      status: "validation_failed",
      warnings: [...normalized.warnings, ...normalized.errors],
    });
  }

  const client = getServiceSupabaseClient();

  if (dryRun) {
    const warnings = [...accountResolution.warnings, ...normalized.lead.warnings];

    if (!client) {
      return createYelpJsonResponse({
        ok: true,
        provider: "yelp",
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
        account: {
          key: accountResolution.account?.key ?? null,
          status: accountResolution.status,
          label: accountResolution.account?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        abuse: {
          status: abuse.status,
          signals: abuse.signals,
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

      return createYelpJsonResponse({
        ...preview,
        dryRun: true,
        correlationId: normalized.lead.correlationId ?? undefined,
        account: {
          key: accountResolution.account?.key ?? null,
          status: accountResolution.status,
          label: accountResolution.account?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        abuse: {
          status: abuse.status,
          signals: abuse.signals,
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

      console.error("[CRM] Yelp dry-run preview failed", { message });

      return createYelpJsonResponse(
        {
          ok: false,
          provider: "yelp",
          status: "error",
          dryRun: true,
          warnings: [message],
        },
        500,
      );
    }
  }

  if (!client) {
    return createYelpJsonResponse({
      ok: false,
      status: "crm_not_configured",
      warnings: [
        "Supabase service-role access is not configured, so Yelp lead intake cannot create CRM leads yet.",
      ],
    });
  }

  try {
    const result = await processLeadIntake(client, normalized.lead);

    return createYelpJsonResponse({
      ...result,
      correlationId: normalized.lead.correlationId ?? undefined,
      account: {
        key: accountResolution.account?.key ?? null,
        status: accountResolution.status,
        label: accountResolution.account?.label ?? null,
      },
      verification: {
        status: verification.status,
        summary: verification.summary,
      },
      abuse: {
        status: abuse.status,
        signals: abuse.signals,
      },
    });
  } catch (error) {
    const message = describeSafeError(error);

    console.error("[CRM] Yelp lead intake failed", { message });

    return createYelpJsonResponse(
      {
        ok: false,
        provider: "yelp",
        status: "error",
        warnings: [message],
      },
      500,
    );
  }
}
