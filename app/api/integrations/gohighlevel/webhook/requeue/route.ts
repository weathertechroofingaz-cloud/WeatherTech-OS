import { NextRequest, NextResponse } from "next/server";
import { readBoundedJsonBody } from "../../../../../../lib/http/boundedJson";
import { getSupabaseServerClient } from "../../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REQUEUE_BODY_BYTES = 4_096;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RequeueRequest = {
  eventId?: unknown;
  expectedAttemptCount?: unknown;
  reason?: unknown;
};

export async function POST(request: NextRequest) {
  const bodyResult = await readBoundedJsonBody(request, MAX_REQUEUE_BODY_BYTES);
  if (!bodyResult.ok) {
    return noStoreJson(
      {
        ok: false,
        message:
          bodyResult.reason === "too_large"
            ? "Webhook requeue request is too large."
            : "Webhook requeue request must be valid JSON.",
      },
      bodyResult.reason === "too_large" ? 413 : 400,
    );
  }
  if (!bodyResult.value || typeof bodyResult.value !== "object" || Array.isArray(bodyResult.value)) {
    return noStoreJson({ ok: false, message: "Webhook requeue request must be an object." }, 400);
  }

  const body = bodyResult.value as RequeueRequest;
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  const expectedAttemptCount = body.expectedAttemptCount;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
  if (
    !uuidPattern.test(eventId) ||
    typeof expectedAttemptCount !== "number" ||
    !Number.isInteger(expectedAttemptCount) ||
    expectedAttemptCount < 1 ||
    expectedAttemptCount > 13 ||
    (body.reason !== undefined && typeof body.reason !== "string")
  ) {
    return noStoreJson(
      { ok: false, message: "A valid event and exact attempt count are required." },
      400,
    );
  }

  const client = await getSupabaseServerClient();
  if (!client) {
    return noStoreJson({ ok: false, message: "Supabase is not configured." }, 503);
  }
  const { data: authResult, error: authError } = await client.auth.getUser();
  if (authError || !authResult.user) {
    return noStoreJson({ ok: false, message: "Sign in before requeueing a webhook." }, 401);
  }

  const { data, error } = await client.rpc("wtos_requeue_gohighlevel_webhook_v1", {
    p_event_id: eventId,
    p_expected_attempt_count: expectedAttemptCount,
    p_reason: reason,
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "23514" ? 409 : 503;
    return noStoreJson(
      {
        ok: false,
        message:
          status === 403
            ? "A company owner or admin must requeue this webhook."
            : status === 404
              ? "Webhook event was not found."
              : status === 409
                ? "Webhook state changed before it could be requeued."
                : "Webhook requeue service is unavailable.",
      },
      status,
    );
  }

  const receipt = parseRequeueReceipt(data, eventId);
  if (!receipt) {
    return noStoreJson({ ok: false, message: "Webhook requeue receipt could not be verified." }, 503);
  }

  return noStoreJson({
    ok: true,
    eventId: receipt.eventId,
    companyId: receipt.companyId,
    status: receipt.processingStatus,
    attemptCount: receipt.attemptCount,
    requeueCount: receipt.requeueCount,
    awaitingSignedRedelivery: true,
    message: "Webhook is ready for an exact signed HighLevel redelivery.",
  });
}

function parseRequeueReceipt(value: unknown, expectedEventId: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const receipt = value as Record<string, unknown>;
  if (
    receipt.contractVersion !== 1 ||
    receipt.eventId !== expectedEventId ||
    typeof receipt.companyId !== "string" ||
    !uuidPattern.test(receipt.companyId) ||
    receipt.processingStatus !== "failed" ||
    receipt.attemptCount !== 0 ||
    typeof receipt.requeueCount !== "number" ||
    !Number.isInteger(receipt.requeueCount) ||
    receipt.requeueCount < 1 ||
    receipt.awaitingSignedRedelivery !== true
  ) {
    return null;
  }
  return receipt as {
    eventId: string;
    companyId: string;
    processingStatus: "failed";
    attemptCount: 0;
    requeueCount: number;
  };
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
