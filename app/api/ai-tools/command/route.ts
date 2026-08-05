import { NextRequest, NextResponse } from "next/server";
import { fetchCrmSnapshot } from "../../../../lib/crm/repository";
import type { CompanyMembershipRole } from "../../../../lib/crm/types";
import {
  runAiPilotCommand,
  type AiPilotCommandResult,
} from "../../../../lib/crm/aiProvider";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import type { CompanyScopeId } from "../../../../lib/crm/companyScope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AiCommandRequestBody = {
  prompt?: unknown;
  companyId?: unknown;
  conversationId?: unknown;
  previousResponseId?: unknown;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as AiCommandRequestBody;
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  if (!prompt) {
    return NextResponse.json(
      { error: "A prompt is required." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const client = await getSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      {
        error:
          "Supabase is not configured. AI Tools can still run local rule-based mode in the browser.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: userResult } = await client.auth.getUser();
  const user = userResult.user;
  if (!user) {
    return NextResponse.json(
      { error: "Sign in before using controlled AI Tools." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const snapshot = await fetchCrmSnapshot(client);
  const companyId = normalizeCompanyScope(body.companyId);
  const userRole = inferUserRole(snapshot.companyMemberships, user.id, companyId);
  const result = await runAiPilotCommand({
    prompt,
    snapshot,
    companyId,
    userRole,
    userId: user.id,
    conversationId:
      typeof body.conversationId === "string" ? body.conversationId : null,
    previousResponseId:
      typeof body.previousResponseId === "string" ? body.previousResponseId : null,
  });

  await recordAiAuditEvent({ client, result, userId: user.id, companyId });

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function normalizeCompanyScope(value: unknown): CompanyScopeId {
  if (typeof value !== "string" || !value) {
    return "all";
  }

  return value as CompanyScopeId;
}

function inferUserRole(
  memberships: Array<{ user_id: string; company_id: string; role: CompanyMembershipRole }>,
  userId: string,
  companyId: CompanyScopeId,
): CompanyMembershipRole | "owner" | "admin" {
  const visibleMemberships = memberships.filter((membership) =>
    companyId === "all" ? membership.user_id === userId : membership.user_id === userId && membership.company_id === companyId,
  );
  if (visibleMemberships.some((membership) => membership.role === "owner")) {
    return "owner";
  }
  if (visibleMemberships.some((membership) => membership.role === "admin")) {
    return "admin";
  }
  return visibleMemberships[0]?.role ?? "office";
}

async function recordAiAuditEvent({
  client,
  result,
  userId,
  companyId,
}: {
  client: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  result: AiPilotCommandResult;
  userId: string;
  companyId: CompanyScopeId;
}) {
  const auditCompanyId =
    companyId === "all"
      ? result.context.records.find((record) => record.companyId)?.companyId
      : companyId;

  if (!client || !auditCompanyId || result.savedWork.status === "migration_pending") {
    return;
  }

  await client.from("ai_audit_events").insert({
    company_id: auditCompanyId,
    actor_user_id: userId,
    task_type: result.response.taskType,
    event_type:
      result.response.mode === "safety_block"
        ? "safety_block"
        : result.providerHealth.tested && !result.providerHealth.ok
          ? "provider_failed"
          : "response_generated",
    provider: result.readiness.provider,
    model: result.readiness.model === "not selected" ? null : result.readiness.model,
    source_records: result.response.supportingRecords.map((record) => ({
      table: record.table,
      id: record.id,
      safeReference: record.safeReference,
    })),
    action_type: result.actionPreviews[0]?.actionType ?? null,
    action_preview: result.actionPreviews[0] ?? {},
    status: "recorded",
    safety_flags: result.response.safetyFlags,
    token_count:
      result.usage.estimatedRequestTokens + result.usage.maxResponseTokens,
    estimated_cost_cents: Math.round(result.usage.estimatedCostUsd * 100),
    metadata: {
      promptSummary: result.context.promptSummary,
      readiness: result.readiness.state,
      productionDisabled: result.readiness.productionDisabled,
    },
  });
}
