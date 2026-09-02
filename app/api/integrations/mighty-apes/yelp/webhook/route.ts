import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  buildMightyApesYelpIntakeRequest,
  mightyApesYelpMaxPayloadBytes,
  mightyApesYelpWebhookSecretEnvVar,
  parseMightyApesYelpPayload,
  verifyMightyApesYelpRequest,
  type MightyApesYelpFailure,
} from "../../../../../../lib/crm/mightyApesYelp";
import type {
  Database,
  MightyApesYelpIngestResult,
} from "../../../../../../lib/crm/types";
import { readBoundedTextBody } from "../../../../../../lib/http/boundedJson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: responseHeaders,
  });
}

function failureResponse(result: MightyApesYelpFailure) {
  return jsonResponse(
    {
      ok: false,
      code: result.code,
      message: result.message,
    },
    result.status,
  );
}

function getServerEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function getServiceClient(): CrmClient | null {
  const supabaseUrl = getServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function hasJsonContentType(request: NextRequest) {
  const contentType = request.headers.get("content-type");

  return contentType?.split(";", 1)[0].trim().toLowerCase() === "application/json";
}

function getDeclaredContentLength(request: NextRequest) {
  const value = request.headers.get("content-length");

  if (value === null) {
    return { ok: true as const, value: null };
  }

  if (!/^\d+$/.test(value)) {
    return { ok: false as const, value: null };
  }

  const length = Number(value);

  if (!Number.isSafeInteger(length)) {
    return { ok: false as const, value: null };
  }

  return { ok: true as const, value: length };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIngestResult(value: unknown): value is MightyApesYelpIngestResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const result = value as Record<string, unknown>;

  return (
    (result.status === "created" ||
      result.status === "duplicate" ||
      result.status === "test_accepted") &&
    typeof result.event_id === "string" &&
    result.event_id.length > 0 &&
    isNullableString(result.lead_id) &&
    isNullableString(result.intake_record_id) &&
    isNullableString(result.sync_log_id) &&
    isNullableString(result.notification_id)
  );
}

function hasNonEmptyId(value: string | null) {
  return typeof value === "string" && value.length > 0;
}

function hasNoPipelineIds(result: MightyApesYelpIngestResult) {
  return (
    result.lead_id === null &&
    result.intake_record_id === null &&
    result.sync_log_id === null &&
    result.notification_id === null
  );
}

function hasAllPipelineIds(result: MightyApesYelpIngestResult) {
  return (
    hasNonEmptyId(result.lead_id) &&
    hasNonEmptyId(result.intake_record_id) &&
    hasNonEmptyId(result.sync_log_id) &&
    hasNonEmptyId(result.notification_id)
  );
}

function methodNotAllowedResponse() {
  return NextResponse.json(
    {
      ok: false,
      code: "method_not_allowed",
      message: "Only POST is supported.",
    },
    {
      status: 405,
      headers: {
        ...responseHeaders,
        Allow: "POST",
      },
    },
  );
}

export async function GET() {
  return methodNotAllowedResponse();
}

export async function POST(request: NextRequest) {
  if (!hasJsonContentType(request)) {
    return jsonResponse(
      {
        ok: false,
        code: "unsupported_content_type",
        message: "Request content type must be application/json.",
      },
      415,
    );
  }

  const contentLength = getDeclaredContentLength(request);

  if (!contentLength.ok) {
    return jsonResponse(
      {
        ok: false,
        code: "invalid_content_length",
        message: "Request content length is invalid.",
      },
      400,
    );
  }

  if (
    contentLength.value !== null &&
    contentLength.value > mightyApesYelpMaxPayloadBytes
  ) {
    return jsonResponse(
      {
        ok: false,
        code: "payload_too_large",
        message: "Request body is too large.",
      },
      413,
    );
  }

  const rawBodyResult = await readBoundedTextBody(
    request,
    mightyApesYelpMaxPayloadBytes,
  );

  if (!rawBodyResult.ok) {
    return jsonResponse(
      {
        ok: false,
        code:
          rawBodyResult.reason === "too_large"
            ? "payload_too_large"
            : "invalid_body",
        message:
          rawBodyResult.reason === "too_large"
            ? "Request body is too large."
            : "Request body could not be read.",
      },
      rawBodyResult.reason === "too_large" ? 413 : 400,
    );
  }
  const rawBody = rawBodyResult.value;

  const verification = verifyMightyApesYelpRequest({
    rawBody,
    headers: request.headers,
    secret: process.env[mightyApesYelpWebhookSecretEnvVar] ?? null,
  });

  if (!verification.ok) {
    return failureResponse(verification);
  }

  const parsed = parseMightyApesYelpPayload(rawBody);

  if (!parsed.ok) {
    return failureResponse(parsed);
  }

  const serviceClient = getServiceClient();

  if (!serviceClient) {
    return jsonResponse(
      {
        ok: false,
        code: "crm_configuration_required",
        message: "CRM webhook processing is not configured.",
      },
      503,
    );
  }

  const intakeRequest = buildMightyApesYelpIntakeRequest(
    parsed.payload,
    verification.verification,
  );

  let result: MightyApesYelpIngestResult;

  try {
    const { data, error } = await serviceClient.rpc(
      "wtos_ingest_mighty_apes_yelp",
      { intake_request: intakeRequest },
    );

    if (error) {
      if (error.code === "42501") {
        return jsonResponse(
          {
            ok: false,
            code: "campaign_not_authorized",
            message: "Mighty Apes campaign is not authorized for ingestion.",
          },
          403,
        );
      }

      if (
        error.code === "23505" &&
        error.message.includes("MIGHTY_APES_YELP_DELIVERY_CONFLICT")
      ) {
        return jsonResponse(
          {
            ok: false,
            code: "delivery_conflict",
            message: "Delivery identifier does not match its original payload.",
          },
          409,
        );
      }

      if (
        error.code === "23505" &&
        error.message.includes("MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT")
      ) {
        return jsonResponse(
          {
            ok: false,
            code: "lead_payload_conflict",
            message: "Yelp lead identifier does not match its original payload.",
          },
          409,
        );
      }

      console.error("[CRM] Mighty Apes Yelp intake RPC failed", {
        code: error.code || "rpc_failed",
      });
      return jsonResponse(
        {
          ok: false,
          code: "crm_temporarily_unavailable",
          message: "Mighty Apes webhook could not be processed safely.",
        },
        503,
      );
    }

    if (!isIngestResult(data)) {
      console.error("[CRM] Mighty Apes Yelp intake RPC returned an invalid result");
      return jsonResponse(
        {
          ok: false,
          code: "invalid_crm_result",
          message: "Mighty Apes webhook could not be processed safely.",
        },
        500,
      );
    }

    result = data;
  } catch {
    console.error("[CRM] Mighty Apes Yelp intake RPC was unavailable");
    return jsonResponse(
      {
        ok: false,
        code: "crm_temporarily_unavailable",
        message: "Mighty Apes webhook could not be processed safely.",
      },
      503,
    );
  }

  if (
    (parsed.payload.event === "lead.test" &&
      (result.status !== "test_accepted" || !hasNoPipelineIds(result))) ||
    (parsed.payload.event === "lead.created" &&
      result.status === "test_accepted") ||
    (parsed.payload.event === "lead.created" && !hasAllPipelineIds(result))
  ) {
    console.error("[CRM] Mighty Apes Yelp intake RPC result was inconsistent");
    return jsonResponse(
      {
        ok: false,
        code: "invalid_crm_result",
        message: "Mighty Apes webhook could not be processed safely.",
      },
      500,
    );
  }

  if (result.status === "test_accepted") {
    return jsonResponse(
      {
        ok: true,
        event: parsed.payload.event,
        status: result.status,
        created: false,
        eventId: result.event_id,
      },
      200,
    );
  }

  return jsonResponse(
    {
      ok: true,
      event: parsed.payload.event,
      status: result.status,
      leadId: result.lead_id,
      eventId: result.event_id,
    },
    result.status === "created" ? 201 : 200,
  );
}
