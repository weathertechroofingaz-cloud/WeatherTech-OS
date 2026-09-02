import { NextRequest, NextResponse } from "next/server";
import {
  AI_ACTION_CONTRACT_VERSION,
  isAiActionType,
  isApprovableAiActionTarget,
  resolveExactAiCompanyAuthorization,
  validateStoredAiActionPreview,
} from "../../../../../lib/crm/aiActionRuntime";
import {
  sanitizeBusinessText,
  type AiActionType,
} from "../../../../../lib/crm/aiTools";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import { readBoundedJsonBody } from "../../../../../lib/http/boundedJson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AiActionReviewRequestBody = {
  auditReference?: unknown;
  decision?: unknown;
  reason?: unknown;
};

type AiActionReviewDecision = "approve" | "reject";

type AiActionReviewResult = {
  aiAuditEventId: string;
  decision: AiActionReviewDecision;
  executionId: string | null;
  executionStatus: string;
  officeTaskId: string | null;
  idempotent: boolean;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const MAX_AI_REVIEW_BODY_BYTES = 4_096;

export async function POST(request: NextRequest) {
  const bodyResult = await readBoundedJsonBody(request, MAX_AI_REVIEW_BODY_BYTES);
  if (!bodyResult.ok && bodyResult.reason === "too_large") {
    return noStoreJson({ error: "The AI action review request is too large." }, 413);
  }
  if (!bodyResult.ok) {
    return noStoreJson({ error: "The AI action review request must be valid JSON." }, 400);
  }
  if (
    !bodyResult.value ||
    typeof bodyResult.value !== "object" ||
    Array.isArray(bodyResult.value)
  ) {
    return noStoreJson(
      { error: "The AI action review request must be a JSON object." },
      400,
    );
  }
  const body = bodyResult.value as AiActionReviewRequestBody;
  const auditReference =
    typeof body.auditReference === "string" ? body.auditReference.trim() : "";
  const decision = parseDecision(body.decision);

  if (!uuidPattern.test(auditReference) || !decision) {
    return noStoreJson(
      { error: "A valid AI audit reference and review decision are required." },
      400,
    );
  }

  if (body.reason !== undefined && typeof body.reason !== "string") {
    return noStoreJson({ error: "The review reason must be text." }, 400);
  }
  const reason =
    typeof body.reason === "string"
      ? sanitizeBusinessText(body.reason).slice(0, 500) || null
      : null;

  const client = await getSupabaseServerClient();
  if (!client) {
    return noStoreJson({ error: "Supabase is not configured." }, 503);
  }

  const { data: userResult, error: userError } = await client.auth.getUser();
  const user = userResult.user;
  if (userError || !user) {
    return noStoreJson({ error: "Sign in before reviewing AI actions." }, 401);
  }

  const { data: event, error: eventError } = await client
    .from("ai_audit_events")
    .select(
      "id, company_id, actor_user_id, event_type, action_type, action_preview, metadata",
    )
    .eq("id", auditReference)
    .maybeSingle();

  if (eventError) {
    return noStoreJson(
      { error: "The AI action audit record could not be verified." },
      503,
    );
  }
  if (!event) {
    return noStoreJson({ error: "The AI action audit record was not found." }, 404);
  }
  if (event.event_type !== "action_proposed" || !isAiActionType(event.action_type)) {
    return noStoreJson(
      { error: "The audit reference is not a reviewable AI action." },
      409,
    );
  }

  const { data: memberships, error: membershipError } = await client
    .from("company_memberships")
    .select("user_id, company_id, role")
    .eq("user_id", user.id)
    .eq("company_id", event.company_id)
    .limit(2);
  if (membershipError) {
    return noStoreJson(
      { error: "Company authorization could not be verified." },
      503,
    );
  }

  const authorization = resolveExactAiCompanyAuthorization({
    memberships: memberships ?? [],
    userId: user.id,
    requestedCompanyId: event.company_id,
  });
  if (!authorization.ok) {
    return noStoreJson(
      { error: authorization.message, code: authorization.code },
      authorization.status,
    );
  }

  const contractVersion = readContractVersion(event.metadata);
  const preview = validateStoredAiActionPreview({
    value: event.action_preview,
    expectedActionType: event.action_type,
    expectedCompanyId: authorization.companyId,
  });
  if (contractVersion !== AI_ACTION_CONTRACT_VERSION || !preview) {
    return noStoreJson(
      { error: "The stored AI action does not match the supported review contract." },
      409,
    );
  }

  if (
    decision === "approve" &&
    (preview.targetRecord.companyId !== authorization.companyId ||
      !isApprovableAiActionTarget(
        preview.actionType,
        preview.targetRecord.table,
      ))
  ) {
    return noStoreJson(
      {
        error:
          "This action can be reviewed or rejected, but it is not approved for execution.",
      },
      409,
    );
  }

  const { data: fingerprint, error: fingerprintError } = await client.rpc(
    "wtos_ai_action_preview_fingerprint_v1",
    {
      p_action_preview: event.action_preview,
      p_contract_version: contractVersion,
    },
  );
  if (
    fingerprintError ||
    typeof fingerprint !== "string" ||
    !sha256Pattern.test(fingerprint)
  ) {
    return noStoreJson(
      { error: "The stored AI action fingerprint could not be verified." },
      503,
    );
  }

  const { data: rpcResult, error: reviewError } = await client.rpc(
    "wtos_review_ai_action_v1",
    {
      p_ai_audit_event_id: event.id,
      p_decision: decision,
      p_expected_action_type: preview.actionType,
      p_expected_payload_sha256: fingerprint,
      p_expected_contract_version: contractVersion,
      p_reason: reason,
    },
  );
  if (reviewError) {
    const status = reviewFailureStatus(reviewError.code);
    return noStoreJson(
      {
        error:
          status === 403
            ? "You are not authorized to review this AI action."
            : status === 409
              ? "The AI action review was not accepted. No action was executed."
              : "The AI action review service is unavailable. No action was executed.",
      },
      status,
    );
  }

  const result = parseReviewResult(
    rpcResult,
    event.id,
    decision,
    preview.actionType,
  );
  if (!result) {
    return noStoreJson(
      { error: "The AI action review returned an invalid receipt." },
      503,
    );
  }

  return noStoreJson(result, 200);
}

function parseDecision(value: unknown): AiActionReviewDecision | null {
  return value === "approve" || value === "reject" ? value : null;
}

function readContractVersion(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const contractVersion = (value as Record<string, unknown>).contractVersion;
  return Number.isInteger(contractVersion) ? (contractVersion as number) : null;
}

function parseReviewResult(
  value: unknown,
  expectedAuditEventId: string,
  expectedDecision: AiActionReviewDecision,
  expectedActionType: AiActionType,
): AiActionReviewResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const result = value as Record<string, unknown>;
  if (
    result.aiAuditEventId !== expectedAuditEventId ||
    result.decision !== expectedDecision ||
    !isNullableUuid(result.executionId) ||
    typeof result.executionStatus !== "string" ||
    !result.executionStatus.trim() ||
    !isNullableUuid(result.officeTaskId) ||
    typeof result.idempotent !== "boolean"
  ) {
    return null;
  }

  if (
    !reviewReceiptMatchesOutcome({
      decision: expectedDecision,
      actionType: expectedActionType,
      executionId: result.executionId,
      executionStatus: result.executionStatus,
      officeTaskId: result.officeTaskId,
    })
  ) {
    return null;
  }

  return {
    aiAuditEventId: expectedAuditEventId,
    decision: expectedDecision,
    executionId: result.executionId,
    executionStatus: result.executionStatus,
    officeTaskId: result.officeTaskId,
    idempotent: result.idempotent,
  };
}

function reviewReceiptMatchesOutcome({
  decision,
  actionType,
  executionId,
  executionStatus,
  officeTaskId,
}: {
  decision: AiActionReviewDecision;
  actionType: AiActionType;
  executionId: string | null;
  executionStatus: string;
  officeTaskId: string | null;
}) {
  if (decision === "reject") {
    return (
      executionId === null &&
      officeTaskId === null &&
      executionStatus === "rejected"
    );
  }
  if (actionType === "create_follow_up_draft") {
    return (
      executionId !== null &&
      officeTaskId !== null &&
      executionStatus === "succeeded"
    );
  }
  return false;
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && uuidPattern.test(value));
}

function reviewFailureStatus(code: string | undefined): 403 | 409 | 503 {
  if (code === "42501" || code === "PGRST301") {
    return 403;
  }
  if (
    code === "40001" ||
    code === "P0001" ||
    code === "23505" ||
    code === "23514"
  ) {
    return 409;
  }
  return 503;
}

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
