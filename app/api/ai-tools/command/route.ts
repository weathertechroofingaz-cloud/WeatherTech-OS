import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { fetchCrmSnapshot } from "../../../../lib/crm/repository";
import {
  buildAiCompanyPilotStatus,
  getAiPilotProviderConfig,
  estimateAiRequestUsage,
  preflightAiPilotCommand,
  retrieveAuthorizedAiContext,
  resolveCompanyAiProviderConfig,
  runAiPilotCommand,
  type AiPilotCommandResult,
  type AiQuotaReservationReceipt,
} from "../../../../lib/crm/aiProvider";
import {
  AI_ACTION_CONTRACT_VERSION,
  resolveExactAiCompanyAuthorization,
} from "../../../../lib/crm/aiActionRuntime";
import type {
  AiAuditEventInsert,
  AiAuditEventType,
  AiUsageLimitRecord,
} from "../../../../lib/crm/types";
import { readBoundedJsonBody } from "../../../../lib/http/boundedJson";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  getSupabaseServiceRoleClient,
  hasSupabaseServiceRoleConfig,
} from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AiCommandRequestBody = {
  prompt?: unknown;
  companyId?: unknown;
  conversationId?: unknown;
  previousResponseId?: unknown;
};

const MAX_AI_COMMAND_BODY_BYTES = 65_536;
const MAX_AI_PROMPT_CHARACTERS = 24_000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() ?? "";
  const client = await getSupabaseServerClient();
  if (!client) {
    return noStoreJson(
      { error: "Supabase is not configured. Production AI status is unavailable." },
      503,
    );
  }

  const { data: userResult, error: userError } = await client.auth.getUser();
  const user = userResult.user;
  if (userError || !user) {
    return noStoreJson({ error: "Sign in before checking Production AI status." }, 401);
  }

  const initialAuthorization = resolveExactAiCompanyAuthorization({
    memberships: [],
    userId: user.id,
    requestedCompanyId,
  });
  if (!initialAuthorization.ok && initialAuthorization.code === "exact_company_required") {
    return noStoreJson(
      { error: initialAuthorization.message, code: initialAuthorization.code },
      initialAuthorization.status,
    );
  }

  const { data: memberships, error: membershipError } = await client
    .from("company_memberships")
    .select("user_id, company_id, role")
    .eq("user_id", user.id)
    .eq("company_id", requestedCompanyId)
    .limit(2);
  if (membershipError) {
    return noStoreJson(
      { error: "Company authorization could not be verified. Production AI status is unavailable." },
      503,
    );
  }

  const authorization = resolveExactAiCompanyAuthorization({
    memberships: memberships ?? [],
    userId: user.id,
    requestedCompanyId,
  });
  if (!authorization.ok) {
    return noStoreJson(
      { error: authorization.message, code: authorization.code },
      authorization.status,
    );
  }

  const { data: policyRows, error: policyError } = await client
    .from("ai_usage_limits")
    .select(
      "id, company_id, ai_enabled, allowed_providers, allowed_models, daily_request_limit, per_user_daily_request_limit, per_company_monthly_budget_cents, expensive_task_confirmation_cents, token_limit, timeout_ms, retry_limit, last_reviewed_at, created_at, updated_at",
    )
    .eq("company_id", authorization.companyId)
    .limit(2);
  if (policyError || policyRows?.length !== 1) {
    return noStoreJson(
      {
        error:
          "Exactly one authorized company AI policy is required before Production AI status can be shown.",
      },
      503,
    );
  }

  if (!hasSupabaseServiceRoleConfig()) {
    return noStoreJson(
      {
        error:
          "The audited AI quota service is unavailable. Production AI status is not ready.",
      },
      503,
    );
  }

  const savedAnalysesReadProbe = await client
    .from("ai_saved_analyses")
    .select(
      "id, company_id, customer_id, lead_id, estimate_id, proposal_revision_id, job_id, inspection_id, invoice_id, document_id, title, task_type, mode, provider, model, prompt_summary, output, source_records, approval_state, status, created_by, expires_at, archived_at, created_at, updated_at",
      { head: true },
    )
    .eq("company_id", authorization.companyId)
    .limit(1);

  const status = buildAiCompanyPilotStatus({
    companyId: authorization.companyId,
    policy: policyRows[0] as AiUsageLimitRecord,
    config: getAiPilotProviderConfig(),
    savedAnalysesReadAvailable: savedAnalysesReadProbe.error === null,
  });
  return noStoreJson(status, 200);
}

export async function POST(request: NextRequest) {
  const bodyResult = await readBoundedJsonBody(
    request,
    MAX_AI_COMMAND_BODY_BYTES,
  );
  if (!bodyResult.ok && bodyResult.reason === "too_large") {
    return noStoreJson({ error: "The AI command request is too large." }, 413);
  }
  if (!bodyResult.ok) {
    return noStoreJson({ error: "The AI command request must be valid JSON." }, 400);
  }
  if (
    !bodyResult.value ||
    typeof bodyResult.value !== "object" ||
    Array.isArray(bodyResult.value)
  ) {
    return noStoreJson({ error: "The AI command request must be a JSON object." }, 400);
  }
  const body = bodyResult.value as AiCommandRequestBody;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return noStoreJson({ error: "A prompt is required." }, 400);
  }
  if (prompt.length > MAX_AI_PROMPT_CHARACTERS) {
    return noStoreJson(
      { error: "The AI command exceeds the bounded prompt size." },
      413,
    );
  }

  const client = await getSupabaseServerClient();
  if (!client) {
    return noStoreJson(
      {
        error:
          "Supabase is not configured. AI Tools can still run local rule-based mode in the browser.",
      },
      503,
    );
  }

  const { data: userResult, error: userError } = await client.auth.getUser();
  const user = userResult.user;
  if (userError || !user) {
    return noStoreJson({ error: "Sign in before using controlled AI Tools." }, 401);
  }

  const initialAuthorization = resolveExactAiCompanyAuthorization({
    memberships: [],
    userId: user.id,
    requestedCompanyId: body.companyId,
  });
  if (!initialAuthorization.ok && initialAuthorization.code === "exact_company_required") {
    return noStoreJson(
      { error: initialAuthorization.message, code: initialAuthorization.code },
      initialAuthorization.status,
    );
  }

  const requestedCompanyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  const { data: memberships, error: membershipError } = await client
    .from("company_memberships")
    .select("user_id, company_id, role")
    .eq("user_id", user.id)
    .eq("company_id", requestedCompanyId)
    .limit(2);

  if (membershipError) {
    return noStoreJson(
      { error: "Company authorization could not be verified. AI Tools did not run." },
      503,
    );
  }

  const authorization = resolveExactAiCompanyAuthorization({
    memberships: memberships ?? [],
    userId: user.id,
    requestedCompanyId,
  });
  if (!authorization.ok) {
    return noStoreJson(
      { error: authorization.message, code: authorization.code },
      authorization.status,
    );
  }

  const serviceClient = getSupabaseServiceRoleClient();
  if (!serviceClient) {
    return noStoreJson(
      { error: "The server-only AI quota service is unavailable. No provider call was attempted." },
      503,
    );
  }

  const snapshot = await fetchCrmSnapshot(client);
  const companyConfig = resolveCompanyAiProviderConfig({
    config: getAiPilotProviderConfig(),
    usageLimits: snapshot.aiUsageLimits,
    companyId: authorization.companyId,
  });
  if (!companyConfig.ok) {
    return noStoreJson(
      { error: `${companyConfig.reason} No provider call was attempted.` },
      403,
    );
  }
  const providerConfig = companyConfig.config;
  const commandNow = new Date().toISOString();
  const context = retrieveAuthorizedAiContext(snapshot, {
    prompt,
    companyId: authorization.companyId,
    userRole: authorization.role,
    now: commandNow,
  });
  const requestEstimate = estimateAiRequestUsage({
    config: providerConfig,
    context,
    prompt,
    userRole: authorization.role,
  });
  if (
    providerConfig.maxRequestTokens <= 0 ||
    requestEstimate.estimatedRequestTokens > providerConfig.maxRequestTokens ||
    providerConfig.maxResponseTokens <= 0 ||
    providerConfig.dailyBudgetUsd <= 0 ||
    providerConfig.dailyRequestLimit <= 0 ||
    providerConfig.perCompanyDailyRequestLimit <= 0 ||
    providerConfig.perUserDailyRequestLimit <= 0 ||
    requestEstimate.estimatedCostUsd <= 0
  ) {
    return noStoreJson(
      { error: "AI usage controls are not configured or this request exceeds the token limit. No provider call was attempted." },
      503,
    );
  }

  const localResult = preflightAiPilotCommand({
    prompt,
    snapshot,
    companyId: authorization.companyId,
    userRole: authorization.role,
    userId: user.id,
    conversationId:
      typeof body.conversationId === "string" ? body.conversationId : null,
    previousResponseId:
      typeof body.previousResponseId === "string" ? body.previousResponseId : null,
    now: commandNow,
    providerConfig,
  });
  if (localResult) {
    const auditedLocalResult = await persistAiCommandResult({
      client: serviceClient,
      result: localResult,
      userId: user.id,
      companyId: authorization.companyId,
      requestAuditEventId: null,
    });
    if (!auditedLocalResult) {
      return noStoreJson(
        { error: "The local AI result could not be durably audited. No provider call was attempted." },
        503,
      );
    }
    return noStoreJson(auditedLocalResult, 200);
  }

  const requestId = randomUUID();
  const estimatedCostCents = Math.max(
    1,
    Math.ceil(
      requestEstimate.estimatedCostUsd *
        100 *
        (providerConfig.retryLimit + 1),
    ),
  );
  const maxProviderAttempts = providerConfig.retryLimit + 1;
  const dailyBudgetCents = Math.floor(providerConfig.dailyBudgetUsd * 100);
  const { data: reservationData, error: reservationError } =
    await serviceClient.rpc("wtos_reserve_ai_request_v1", {
      p_company_id: authorization.companyId,
      p_actor_user_id: user.id,
      p_request_id: requestId,
      p_request: {
        contractVersion: 1,
        provider: providerConfig.provider,
        model: providerConfig.model || null,
        promptSha256: createHash("sha256").update(prompt).digest("hex"),
        promptCharacters: prompt.length,
        estimatedRequestTokens: requestEstimate.estimatedRequestTokens,
        maxResponseTokens: providerConfig.maxResponseTokens,
        estimatedCostCents,
        maxProviderAttempts,
        globalDailyRequestLimit: providerConfig.dailyRequestLimit,
        companyDailyRequestLimit: providerConfig.perCompanyDailyRequestLimit,
        userDailyRequestLimit: providerConfig.perUserDailyRequestLimit,
        dailyBudgetCents,
        companyMonthlyBudgetCents: companyConfig.companyMonthlyBudgetCents,
        maxRequestTokens: providerConfig.maxRequestTokens,
      },
    });
  if (reservationError) {
    return noStoreJson(
      {
        error:
          quotaFailureStatus(reservationError.code) === 429
            ? "The AI request or cost limit has been reached. No provider call was attempted."
            : "The atomic AI quota reservation failed. No provider call was attempted.",
      },
      quotaFailureStatus(reservationError.code),
    );
  }
  const quotaReservation = parseQuotaReservation(reservationData, {
    requestId,
    companyId: authorization.companyId,
    actorUserId: user.id,
    provider: providerConfig.provider,
    model: providerConfig.model || null,
    estimatedCostCents,
    maxProviderAttempts,
    dailyBudgetCents,
    companyMonthlyBudgetCents: companyConfig.companyMonthlyBudgetCents,
  });
  if (!quotaReservation) {
    return noStoreJson(
      { error: "The AI quota service returned an invalid receipt. No provider call was attempted." },
      503,
    );
  }

  let result: AiPilotCommandResult;
  try {
    result = await runAiPilotCommand({
      prompt,
      snapshot,
      companyId: authorization.companyId,
      userRole: authorization.role,
      userId: user.id,
      conversationId:
        typeof body.conversationId === "string" ? body.conversationId : null,
      previousResponseId:
        typeof body.previousResponseId === "string" ? body.previousResponseId : null,
      now: commandNow,
      providerConfig,
      quotaReservation,
    });
  } catch {
    await recordAiRequestFailure({
      client: serviceClient,
      companyId: authorization.companyId,
      userId: user.id,
      requestAuditEventId: quotaReservation.requestAuditEventId,
      provider: providerConfig.provider,
      model: providerConfig.model,
    });
    return noStoreJson(
      { error: "The controlled AI request failed. No action was executed." },
      503,
    );
  }

  const auditedResult = await persistAiCommandResult({
    client: serviceClient,
    result,
    userId: user.id,
    companyId: authorization.companyId,
    requestAuditEventId: quotaReservation.requestAuditEventId,
  });
  if (!auditedResult) {
    return noStoreJson(
      {
        error:
          "The AI result could not be durably audited. No action was executed or exposed for review.",
      },
      503,
    );
  }

  return noStoreJson(auditedResult, 200);
}

async function recordAiRequestFailure({
  client,
  companyId,
  userId,
  requestAuditEventId,
  provider,
  model,
}: {
  client: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>;
  companyId: string;
  userId: string;
  requestAuditEventId: string;
  provider: ReturnType<typeof getAiPilotProviderConfig>["provider"];
  model: string;
}) {
  await client.from("ai_audit_events").insert({
    company_id: companyId,
    actor_user_id: userId,
    task_type: "command",
    event_type: "provider_failed",
    provider,
    model: model || null,
    source_records: [],
    action_type: null,
    action_preview: {},
    status: "failed",
    safety_flags: ["request_failed"],
    metadata: { requestAuditEventId },
  });
}

async function persistAiCommandResult({
  client,
  result,
  userId,
  companyId,
  requestAuditEventId,
}: {
  client: NonNullable<ReturnType<typeof getSupabaseServiceRoleClient>>;
  result: AiPilotCommandResult;
  userId: string;
  companyId: string;
  requestAuditEventId: string | null;
}): Promise<AiPilotCommandResult | null> {
  const previewIds = new Set(result.actionPreviews.map((preview) => preview.id));
  if (
    result.companyId !== companyId ||
    previewIds.size !== result.actionPreviews.length ||
    result.actionPreviews.some(
      (preview) => preview.companyId !== companyId,
    ) ||
    result.response.actions.some((action) => !previewIds.has(action.id))
  ) {
    return null;
  }

  const common = {
    company_id: companyId,
    actor_user_id: userId,
    task_type: result.response.taskType,
    provider: result.readiness.provider,
    model: result.readiness.model === "not selected" ? null : result.readiness.model,
    source_records: result.response.supportingRecords.map((record) => ({
      table: record.table,
      id: record.id,
      safeReference: record.safeReference,
    })),
    safety_flags: result.response.safetyFlags,
    token_count: result.usage.estimatedRequestTokens + result.usage.maxResponseTokens,
    estimated_cost_cents: requestAuditEventId
      ? Math.round(result.usage.estimatedCostUsd * 100)
      : 0,
  };
  const responseEventType: AiAuditEventType =
    result.response.mode === "safety_block"
      ? "safety_block"
      : result.response.mode === "provider_disabled" && !result.providerHealth.tested
        ? "provider_blocked"
        : result.providerHealth.tested && !result.providerHealth.ok
          ? "provider_failed"
          : "response_generated";
  const auditRows: AiAuditEventInsert[] = [
    {
      ...common,
      event_type: responseEventType,
      action_type: null,
      action_preview: {},
      status: "recorded",
      metadata: {
        auditKind: "response",
        ...(requestAuditEventId ? { requestAuditEventId } : {}),
        quotaReserved: Boolean(requestAuditEventId),
        commandResponseId: result.response.id,
        readiness: result.readiness.state,
        productionDisabled: result.readiness.productionDisabled,
      },
    },
    ...(requestAuditEventId ? result.actionPreviews : []).map((preview) => ({
      ...common,
      event_type: "action_proposed" as const,
      action_type: preview.actionType,
      action_preview: { ...preview },
      status: "pending_review",
      metadata: {
        auditKind: "action_preview",
        requestAuditEventId,
        commandResponseId: result.response.id,
        previewId: preview.id,
        contractVersion: AI_ACTION_CONTRACT_VERSION,
      },
    })),
  ];

  const { data, error } = await client
    .from("ai_audit_events")
    .insert(auditRows)
    .select("id, metadata");
  if (error || !data) {
    return null;
  }

  const auditReferenceByPreviewId = new Map<string, string>();
  for (const event of data) {
    const metadata = event.metadata;
    const previewId =
      metadata &&
      typeof metadata === "object" &&
      typeof (metadata as Record<string, unknown>).previewId === "string"
        ? ((metadata as Record<string, unknown>).previewId as string)
        : null;
    if (previewId) {
      auditReferenceByPreviewId.set(previewId, event.id);
    }
  }

  if (
    requestAuditEventId &&
    result.actionPreviews.some(
      (preview) => !auditReferenceByPreviewId.has(preview.id),
    )
  ) {
    return null;
  }

  const actionPreviews = result.actionPreviews.map((preview) => ({
    ...preview,
    auditReference: auditReferenceByPreviewId.get(preview.id) ?? preview.auditReference,
  }));

  return {
    ...result,
    actionPreviews,
    response: {
      ...result.response,
      actions: result.response.actions.map((action) => ({
        ...action,
        auditReference:
          auditReferenceByPreviewId.get(action.id) ?? action.auditReference,
      })),
    },
  };
}

function parseQuotaReservation(
  value: unknown,
  expected: {
    requestId: string;
    companyId: string;
    actorUserId: string;
    provider: string;
    model: string | null;
    estimatedCostCents: number;
    maxProviderAttempts: number;
    dailyBudgetCents: number;
    companyMonthlyBudgetCents: number;
  },
): AiQuotaReservationReceipt | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const receipt = value as Record<string, unknown>;
  if (
    receipt.contractVersion !== 1 ||
    !uuidPattern.test(String(receipt.reservationId ?? "")) ||
    !uuidPattern.test(String(receipt.requestAuditEventId ?? "")) ||
    receipt.reservationId !== receipt.requestAuditEventId ||
    receipt.requestId !== expected.requestId ||
    receipt.companyId !== expected.companyId ||
    receipt.actorUserId !== expected.actorUserId ||
    receipt.provider !== expected.provider ||
    receipt.model !== expected.model ||
    receipt.estimatedCostCents !== expected.estimatedCostCents ||
    receipt.maxProviderAttempts !== expected.maxProviderAttempts ||
    receipt.status !== "reserved" ||
    typeof receipt.idempotent !== "boolean" ||
    !isBoundedPositiveInteger(receipt.globalRequestsToday) ||
    !isBoundedPositiveInteger(receipt.companyRequestsToday) ||
    !isBoundedPositiveInteger(receipt.userRequestsToday) ||
    !isBoundedPositiveInteger(receipt.reservedCostCentsToday) ||
    !isBoundedPositiveInteger(receipt.companyReservedCostCentsThisMonth) ||
    Number(receipt.companyRequestsToday) > Number(receipt.globalRequestsToday) ||
    Number(receipt.userRequestsToday) > Number(receipt.companyRequestsToday) ||
    Number(receipt.reservedCostCentsToday) < expected.estimatedCostCents ||
    Number(receipt.reservedCostCentsToday) > expected.dailyBudgetCents ||
    Number(receipt.companyReservedCostCentsThisMonth) < expected.estimatedCostCents ||
    Number(receipt.companyReservedCostCentsThisMonth) >
      expected.companyMonthlyBudgetCents
  ) {
    return null;
  }
  return receipt as AiQuotaReservationReceipt;
}

function isBoundedPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 100_000_000;
}

function quotaFailureStatus(code: string | undefined): 403 | 409 | 429 | 503 {
  if (code === "42501") {
    return 403;
  }
  if (code === "40001" || code === "23505") {
    return 409;
  }
  if (code === "P0001") {
    return 429;
  }
  return 503;
}

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
