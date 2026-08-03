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
import { createIntegrationSyncLog } from "../../../../lib/crm/repository";
import type { CompanyRecord, Database } from "../../../../lib/crm/types";
import {
  buildWebsiteLeadCaptureSafeLogSummary,
  buildWebsiteLeadCaptureReadiness,
  buildWebsiteLeadCaptureRequestBody,
  createWebsiteLeadCaptureRequestFingerprint,
  evaluateWebsiteLeadCaptureAbuse,
  isWebsiteLeadCaptureProductionEnabled,
  isWebsiteLeadCaptureRateLimitEnabled,
  isWebsiteLeadCaptureSpamProtectionEnabled,
  resolveWebsiteLeadCaptureForm,
  resolveWebsiteLeadCaptureSource,
  verifyWebsiteLeadCaptureRequest,
  verifyWebsiteLeadCaptureOrigin,
  websiteLeadCaptureEndpointPath,
  websiteLeadCaptureMaxPayloadBytes,
  type WebsiteLeadCaptureFormResolution,
  type WebsiteLeadCaptureOriginVerificationResult,
  type WebsiteLeadCaptureSourceResolution,
  type WebsiteLeadCaptureAbuseResult,
  type WebsiteLeadCaptureVerificationResult,
} from "../../../../lib/crm/websiteLeadCapture";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;
type RateLimitBucket = {
  count: number;
  resetAt: number;
};

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
  origin?: Pick<WebsiteLeadCaptureOriginVerificationResult, "status" | "summary" | "origin">;
  form?: {
    key: string | null;
    status: WebsiteLeadCaptureFormResolution["status"];
    label: string | null;
  };
  abuse?: Pick<WebsiteLeadCaptureAbuseResult, "status" | "signals">;
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
  readiness?: ReturnType<typeof buildWebsiteLeadCaptureReadiness>;
};

const websiteLeadRateLimitBuckets = new Map<string, RateLimitBucket>();
const websiteLeadRateLimitWindowMs = 60 * 1000;
const websiteLeadRateLimitMaxRequests = 30;

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

function getExternalId(body: WebsiteLeadRequestBody) {
  return (
    getString(body.externalLeadId) ??
    getString(body.leadId) ??
    getString(body.submissionId) ??
    getString(body.formSubmissionId) ??
    getString(body.sourceExternalId) ??
    getString(body.externalId) ??
    getString(body.id)
  );
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

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();

  return forwardedFor || realIp || "unknown";
}

function checkWebsiteRateLimit({
  request,
  sourceKey,
  dryRun,
}: {
  request: NextRequest;
  sourceKey: string | null;
  dryRun: boolean;
}) {
  if (dryRun || !isWebsiteLeadCaptureRateLimitEnabled()) {
    return { ok: true, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  const key = `${sourceKey ?? "unknown"}:${getRequestIp(request)}`;
  const current = websiteLeadRateLimitBuckets.get(key);

  if (!current || current.resetAt <= now) {
    websiteLeadRateLimitBuckets.set(key, {
      count: 1,
      resetAt: now + websiteLeadRateLimitWindowMs,
    });

    return { ok: true, retryAfterSeconds: 0 };
  }

  current.count += 1;

  if (current.count <= websiteLeadRateLimitMaxRequests) {
    return { ok: true, retryAfterSeconds: 0 };
  }

  return {
    ok: false,
    retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
  };
}

function getClearAbuseResult(): WebsiteLeadCaptureAbuseResult {
  return {
    status: "clear",
    signals: [],
    reviewReason: null,
  };
}

async function findCompanyForWebsiteSource(
  client: CrmClient,
  sourceResolution: WebsiteLeadCaptureSourceResolution,
) {
  const source = sourceResolution.source;

  if (!source) {
    return null;
  }

  const { data, error } = await client.from("companies").select("*");

  if (error) {
    throw error;
  }

  const companies = (data ?? []) as CompanyRecord[];

  if (source.companyKey === "weathertech_roofing") {
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

async function logWebsiteLeadCaptureRouteEvent({
  client,
  body,
  rawBody,
  sourceResolution,
  formResolution,
  verification = null,
  originVerification = null,
  abuse = null,
  correlationId = null,
  status,
  errorCode,
  message,
}: {
  client: CrmClient | null;
  body: WebsiteLeadRequestBody;
  rawBody: string;
  sourceResolution: WebsiteLeadCaptureSourceResolution;
  formResolution: WebsiteLeadCaptureFormResolution;
  verification?: WebsiteLeadCaptureVerificationResult | null;
  originVerification?: WebsiteLeadCaptureOriginVerificationResult | null;
  abuse?: WebsiteLeadCaptureAbuseResult | null;
  correlationId?: string | null;
  status: "failed" | "skipped";
  errorCode: string;
  message: string;
}) {
  if (!client || !sourceResolution.source) {
    return;
  }

  try {
    const company = await findCompanyForWebsiteSource(client, sourceResolution);

    if (!company) {
      return;
    }

    const now = new Date().toISOString();

    await createIntegrationSyncLog(client, {
      company_id: company.id,
      provider: "website",
      direction: "provider_to_weathertech",
      event_type: "website.lead.rejected",
      status,
      external_id: getExternalId(body),
      attempt_count: 1,
      max_attempts: 1,
      last_attempted_at: now,
      completed_at: now,
      request_fingerprint: createWebsiteLeadCaptureRequestFingerprint({
        rawBody,
        source: sourceResolution.source,
        externalId: getExternalId(body),
      }),
      request_summary: buildWebsiteLeadCaptureSafeLogSummary({
        body,
        resolution: sourceResolution,
        formResolution,
        verification,
        originVerification,
        abuse,
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

    console.error("[CRM] Website intake audit log failed", { message: safeMessage });
  }
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
  const correlationId =
    request.headers.get("x-correlation-id") ??
    request.headers.get("x-request-id") ??
    null;
  const client = getServiceSupabaseClient();
  const sourceResolution = resolveWebsiteLeadCaptureSource(body, request.headers);
  const formResolution = resolveWebsiteLeadCaptureForm(body, sourceResolution.source);
  const originVerification = verifyWebsiteLeadCaptureOrigin({
    headers: request.headers,
    source: sourceResolution.source,
    dryRun,
  });
  const abuse = isWebsiteLeadCaptureSpamProtectionEnabled()
    ? evaluateWebsiteLeadCaptureAbuse(body, sourceResolution)
    : getClearAbuseResult();

  if (formResolution.status === "unsupported") {
    const message = formResolution.warnings.join(" ");

    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      originVerification,
      abuse,
      correlationId,
      status: "failed",
      errorCode: "unsupported_form_type",
      message,
    });

    return createWebsiteJsonResponse({
      ok: false,
      status: "unsupported_form_type",
      source: {
        key: sourceResolution.source?.key ?? null,
        status: sourceResolution.status,
        label: sourceResolution.source?.label ?? null,
      },
      form: {
        key: formResolution.form?.key ?? null,
        status: formResolution.status,
        label: formResolution.form?.label ?? null,
      },
      origin: {
        status: originVerification.status,
        summary: originVerification.summary,
        origin: originVerification.origin,
      },
      warnings: formResolution.warnings,
    });
  }

  if (!originVerification.ok) {
    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      originVerification,
      abuse,
      correlationId,
      status: "failed",
      errorCode: "invalid_origin",
      message: originVerification.summary,
    });

    return createWebsiteJsonResponse({
      ok: false,
      status: "invalid_origin",
      source: {
        key: sourceResolution.source?.key ?? null,
        status: sourceResolution.status,
        label: sourceResolution.source?.label ?? null,
      },
      form: {
        key: formResolution.form?.key ?? null,
        status: formResolution.status,
        label: formResolution.form?.label ?? null,
      },
      origin: {
        status: originVerification.status,
        summary: originVerification.summary,
        origin: originVerification.origin,
      },
      warnings: [originVerification.summary],
    });
  }

  const rateLimit = checkWebsiteRateLimit({
    request,
    sourceKey: sourceResolution.source?.key ?? null,
    dryRun,
  });

  if (!rateLimit.ok) {
    const message = "Website lead intake rate limit exceeded.";

    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      originVerification,
      abuse,
      correlationId,
      status: "failed",
      errorCode: "rate_limited",
      message,
    });

    return createWebsiteJsonResponse(
      {
        ok: false,
        status: "rate_limited",
        source: {
          key: sourceResolution.source?.key ?? null,
          status: sourceResolution.status,
          label: sourceResolution.source?.label ?? null,
        },
        form: {
          key: formResolution.form?.key ?? null,
          status: formResolution.status,
          label: formResolution.form?.label ?? null,
        },
        warnings: [message, `Retry after ${rateLimit.retryAfterSeconds} seconds.`],
      },
      429,
    );
  }

  if (abuse.status === "blocked") {
    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      originVerification,
      abuse,
      correlationId,
      status: "failed",
      errorCode: "source_disabled",
      message: abuse.signals.map((signal) => signal.label).join(" "),
    });

    return createWebsiteJsonResponse({
      ok: false,
      status: "source_disabled",
      source: {
        key: sourceResolution.source?.key ?? null,
        status: sourceResolution.status,
        label: sourceResolution.source?.label ?? null,
      },
      form: {
        key: formResolution.form?.key ?? null,
        status: formResolution.status,
        label: formResolution.form?.label ?? null,
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
    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      verification,
      originVerification,
      abuse,
      correlationId,
      status: "failed",
      errorCode: verification.status,
      message: verification.summary,
    });

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
      form: {
        key: formResolution.form?.key ?? null,
        status: formResolution.status,
        label: formResolution.form?.label ?? null,
      },
      origin: {
        status: originVerification.status,
        summary: originVerification.summary,
        origin: originVerification.origin,
      },
      warnings: [verification.summary],
    });
  }

  const captureBody = buildWebsiteLeadCaptureRequestBody({
    body,
    resolution: sourceResolution,
    formResolution,
    verification,
    originVerification,
    abuse,
    correlationId,
    rawBody,
  });
  const normalized = normalizeWebsiteLeadBody(captureBody);

  if (!normalized.lead) {
    const normalizeFailure = normalized as {
      errors: string[];
      warnings: string[];
    };
    const warnings = [...normalizeFailure.warnings, ...normalizeFailure.errors];

    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      verification,
      originVerification,
      abuse,
      correlationId,
      status: "failed",
      errorCode: "validation_failed",
      message: warnings.join(" "),
    });

    return createWebsiteJsonResponse(
      {
        ok: false,
        status: "validation_failed",
        form: {
          key: formResolution.form?.key ?? null,
          status: formResolution.status,
          label: formResolution.form?.label ?? null,
        },
        warnings,
      },
    );
  }

  const productionEnabled = isWebsiteLeadCaptureProductionEnabled(sourceResolution.source);

  if (!dryRun && !productionEnabled) {
    const message =
      "Website intake is configured for signed testing only. Enable production website intake in server environment after owner-approved website setup.";

    await logWebsiteLeadCaptureRouteEvent({
      client,
      body,
      rawBody,
      sourceResolution,
      formResolution,
      verification,
      originVerification,
      abuse,
      correlationId,
      status: "skipped",
      errorCode: "production_disabled",
      message,
    });

    return createWebsiteJsonResponse({
      ok: false,
      provider: "website",
      status: "production_disabled",
      correlationId: normalized.lead.correlationId ?? undefined,
      source: {
        key: sourceResolution.source?.key ?? null,
        status: sourceResolution.status,
        label: sourceResolution.source?.label ?? null,
      },
      form: {
        key: formResolution.form?.key ?? null,
        status: formResolution.status,
        label: formResolution.form?.label ?? null,
      },
      verification: {
        status: verification.status,
        summary: verification.summary,
      },
      origin: {
        status: originVerification.status,
        summary: originVerification.summary,
        origin: originVerification.origin,
      },
      production: {
        enabled: false,
        status: "disabled",
      },
      warnings: [message],
    });
  }

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
        form: {
          key: formResolution.form?.key ?? null,
          status: formResolution.status,
          label: formResolution.form?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        origin: {
          status: originVerification.status,
          summary: originVerification.summary,
          origin: originVerification.origin,
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
        production: {
          enabled: false,
          status: "disabled",
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
        form: {
          key: formResolution.form?.key ?? null,
          status: formResolution.status,
          label: formResolution.form?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        origin: {
          status: originVerification.status,
          summary: originVerification.summary,
          origin: originVerification.origin,
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
        production: {
          enabled: false,
          status: "disabled",
        },
        warnings: [...warnings, ...preview.warnings],
      });
    } catch (error) {
      const message = describeSafeError(error);

      console.error("[CRM] Website dry-run preview failed", { message });

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
        form: {
          key: formResolution.form?.key ?? null,
          status: formResolution.status,
          label: formResolution.form?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        origin: {
          status: originVerification.status,
          summary: originVerification.summary,
          origin: originVerification.origin,
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
        production: {
          enabled: false,
          status: "disabled",
        },
        warnings: [
          ...warnings,
          message,
          "CRM duplicate preview was unavailable, so this dry-run returned routing and validation details only.",
        ],
      });
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
        form: {
          key: formResolution.form?.key ?? null,
          status: formResolution.status,
          label: formResolution.form?.label ?? null,
        },
        verification: {
          status: verification.status,
          summary: verification.summary,
        },
        origin: {
          status: originVerification.status,
          summary: originVerification.summary,
          origin: originVerification.origin,
        },
        abuse: {
          status: abuse.status,
          signals: abuse.signals,
        },
        production: {
          enabled: productionEnabled,
          status: "enabled",
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
