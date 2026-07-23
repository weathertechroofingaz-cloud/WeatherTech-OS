import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  getLeadIntakeHttpStatus,
  normalizeWebsiteLeadBody,
  previewLeadIntake,
  processLeadIntake,
  type LeadIntakeResponse,
  type WebsiteLeadRequestBody,
} from "../../../../lib/crm/leadIntake";
import { sanitizeIntegrationSyncLogText } from "../../../../lib/crm/integrations";
import type { Database } from "../../../../lib/crm/types";
import {
  buildWebsiteLeadCaptureReadiness,
  buildWebsiteLeadCaptureRequestBody,
  evaluateWebsiteLeadCaptureAbuse,
  resolveWebsiteLeadCaptureSource,
  verifyWebsiteLeadCaptureRequest,
  websiteLeadCaptureEndpointPath,
  websiteLeadCaptureMaxPayloadBytes,
  type WebsiteLeadCaptureAbuseResult,
  type WebsiteLeadCaptureVerificationResult,
} from "../../../../lib/crm/websiteLeadCapture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

type WebsiteLeadResponse = LeadIntakeResponse & {
  route?: "/api/leads/website";
  accepts?: "POST";
  correlationId?: string;
  dryRun?: boolean;
  source?: {
    key: string | null;
    status: string;
    label: string | null;
  };
  verification?: Pick<WebsiteLeadCaptureVerificationResult, "status" | "summary">;
  abuse?: Pick<WebsiteLeadCaptureAbuseResult, "status" | "signals">;
  normalized?: {
    contactName: string;
    company: string;
    branch: string;
    source: string;
  };
  readiness?: ReturnType<typeof buildWebsiteLeadCaptureReadiness>;
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

function createJsonResponse(body: WebsiteLeadResponse, status = 200) {
  return NextResponse.json(body, { status });
}

function createWebsiteJsonResponse(body: WebsiteLeadResponse, status?: number) {
  return createJsonResponse(
    {
      route: "/api/leads/website",
      ...body,
    },
    status ?? getLeadIntakeHttpStatus(body),
  );
}

function getVerificationFailureStatus(
  status: WebsiteLeadCaptureVerificationResult["status"],
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
  body: WebsiteLeadRequestBody | null;
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

  if (contentLength !== null && contentLength > websiteLeadCaptureMaxPayloadBytes) {
    return {
      body: null,
      rawBody: "",
      error: "Request body is too large.",
      status: "payload_too_large",
    };
  }

  const rawBody = await request.text();

  if (Buffer.byteLength(rawBody, "utf8") > websiteLeadCaptureMaxPayloadBytes) {
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
        body: body as WebsiteLeadRequestBody,
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
    route: websiteLeadCaptureEndpointPath,
    accepts: "POST",
    status: "healthy",
    readiness: buildWebsiteLeadCaptureReadiness(),
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

    return createWebsiteJsonResponse(
      {
        ok: false,
        status: responseStatus,
        warnings: [jsonError ?? "Request body must be valid JSON."],
      },
    );
  }

  const dryRun =
    request.nextUrl.searchParams.get("dryRun") === "1" ||
    request.nextUrl.searchParams.get("dry_run") === "1" ||
    request.nextUrl.searchParams.get("dry_run") === "true" ||
    (body as { dryRun?: unknown }).dryRun === true;
  const sourceResolution = resolveWebsiteLeadCaptureSource(body, request.headers);
  const abuse = evaluateWebsiteLeadCaptureAbuse(body, sourceResolution);

  if (abuse.status === "blocked") {
    return createWebsiteJsonResponse({
      ok: false,
      status: "source_disabled",
      source: {
        key: sourceResolution.source?.key ?? null,
        status: sourceResolution.status,
        label: sourceResolution.source?.label ?? null,
      },
      abuse: {
        status: abuse.status,
        signals: abuse.signals,
      },
      warnings: abuse.signals.map((signal) => signal.label),
    });
  }

  const verification = verifyWebsiteLeadCaptureRequest({
    rawBody,
    headers: request.headers,
    source: sourceResolution.source,
    dryRun,
  });

  if (!verification.ok) {
    return createWebsiteJsonResponse({
      ok: false,
      status: getVerificationFailureStatus(verification.status),
      source: {
        key: sourceResolution.source?.key ?? null,
        status: sourceResolution.status,
        label: sourceResolution.source?.label ?? null,
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
  const captureBody = buildWebsiteLeadCaptureRequestBody({
    body,
    resolution: sourceResolution,
    verification,
    abuse,
    correlationId,
  });
  const normalized = normalizeWebsiteLeadBody(captureBody);

  if (!normalized.lead) {
    return createWebsiteJsonResponse(
      {
        ok: false,
        status: "validation_failed",
        warnings: [...normalized.warnings, ...normalized.errors],
      },
    );
  }

  const client = getServiceSupabaseClient();

  if (dryRun) {
    const warnings = [...sourceResolution.warnings, ...normalized.lead.warnings];

    if (!client) {
      return createWebsiteJsonResponse({
        ok: true,
        provider: "website",
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
        source: {
          key: sourceResolution.source?.key ?? null,
          status: sourceResolution.status,
          label: sourceResolution.source?.label ?? null,
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

      return createWebsiteJsonResponse({
        ...preview,
        dryRun: true,
        correlationId: normalized.lead.correlationId ?? undefined,
        source: {
          key: sourceResolution.source?.key ?? null,
          status: sourceResolution.status,
          label: sourceResolution.source?.label ?? null,
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

      console.error("[CRM] Website dry-run preview failed", { message });

      return createWebsiteJsonResponse(
        {
          ok: false,
          provider: "website",
          status: "error",
          dryRun: true,
          warnings: [message],
        },
        500,
      );
    }
  }

  if (!client) {
    return createWebsiteJsonResponse(
      {
        ok: false,
        status: "crm_not_configured",
        warnings: [
          "Supabase service-role access is not configured, so website lead intake cannot create CRM leads yet.",
        ],
      },
    );
  }

  try {
    const result = await processLeadIntake(client, normalized.lead);

    return createWebsiteJsonResponse(
      {
        ...result,
        correlationId: normalized.lead.correlationId ?? undefined,
        source: {
          key: sourceResolution.source?.key ?? null,
          status: sourceResolution.status,
          label: sourceResolution.source?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        abuse: {
          status: abuse.status,
          signals: abuse.signals,
        },
      },
    );
  } catch (error) {
    const message = describeSafeError(error);

    console.error("[CRM] Website lead intake failed", { message });

    return createWebsiteJsonResponse(
      {
        ok: false,
        provider: "website",
        status: "error",
        warnings: [message],
      },
      500,
    );
  }
}
