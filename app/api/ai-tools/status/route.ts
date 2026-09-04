import { NextRequest, NextResponse } from "next/server";
import {
  buildAiCompanyPilotStatus,
  buildAiQuotaStatusRequest,
  estimateAiQuotaStatusProbe,
  getAiPilotProviderConfig,
  parseAiQuotaStatusReceipt,
  resolveCompanyAiProviderConfig,
} from "../../../../lib/crm/aiProvider";
import { resolveExactAiCompanyAuthorization } from "../../../../lib/crm/aiActionRuntime";
import { fetchCrmSnapshot } from "../../../../lib/crm/repository";
import type { AiUsageLimitRecord } from "../../../../lib/crm/types";
import { readBoundedJsonBody } from "../../../../lib/http/boundedJson";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  claimSupabaseAiQuotaProbeRefresh,
  readCachedAiQuotaProbeEstimatedRequestTokens,
  readSupabaseAiQuotaStatus,
  verifySupabaseAiQuotaServiceCapability,
} from "../../../../lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AI_STATUS_BODY_BYTES = 1_024;
const LEGACY_FORCE_REFRESH_HEADER = "x-wtos-ai-quota-probe-refresh";
const REFRESH_ACKNOWLEDGEMENT_HEADER = "x-wtos-ai-quota-probe-refreshed";

type AiStatusRefreshRequestBody = {
  companyId?: unknown;
};

async function readAiCompanyPilotStatus({
  requestedCompanyId,
  explicitRefresh,
}: {
  requestedCompanyId: string;
  explicitRefresh: boolean;
}) {
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
  const companyPolicy = policyRows[0] as AiUsageLimitRecord;

  if (!(await verifySupabaseAiQuotaServiceCapability())) {
    return noStoreJson(
      {
        error:
          "The audited AI quota service is unavailable. Production AI status is not ready.",
      },
      503,
    );
  }

  const providerConfig = getAiPilotProviderConfig();
  const companyConfig = resolveCompanyAiProviderConfig({
    config: providerConfig,
    usageLimits: [companyPolicy],
    companyId: authorization.companyId,
  });

  let refreshClaimed = false;
  if (explicitRefresh) {
    const refreshClaim = await claimSupabaseAiQuotaProbeRefresh({
      companyId: authorization.companyId,
      actorUserId: user.id,
    });
    if (!refreshClaim) {
      return noStoreJson(
        {
          error:
            "The Production AI context refresh could not be authorized. No context probe was run.",
        },
        503,
      );
    }
    if (!refreshClaim.allowed) {
      return noStoreJson(
        {
          error:
            "Production AI context refresh is temporarily limited. Try Refresh again after the cooldown.",
          code: "ai_quota_probe_refresh_rate_limited",
          retryAfterSeconds: refreshClaim.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(refreshClaim.retryAfterSeconds) },
      );
    }
    refreshClaimed = true;
  }

  let quotaStatus = null;
  let quotaProbeEstimatedRequestTokens = null;
  if (companyConfig.ok) {
    quotaProbeEstimatedRequestTokens =
      await readCachedAiQuotaProbeEstimatedRequestTokens({
        companyId: authorization.companyId,
        actorUserId: user.id,
        userRole: authorization.role,
        policyId: companyPolicy.id,
        policyUpdatedAt: companyPolicy.updated_at,
        companyMonthlyBudgetCents: companyConfig.companyMonthlyBudgetCents,
        config: companyConfig.config,
        forceRefresh: refreshClaimed,
        load: async () => {
          const quotaProbeSnapshot = await fetchCrmSnapshot(client);
          return estimateAiQuotaStatusProbe({
            config: companyConfig.config,
            snapshot: quotaProbeSnapshot,
            companyId: authorization.companyId,
            userRole: authorization.role,
          }).estimatedRequestTokens;
        },
      });
    if (quotaProbeEstimatedRequestTokens === null) {
      return noStoreJson(
        {
          error:
            "Current audited AI quota capacity could not be verified. Production AI status is unavailable.",
        },
        503,
      );
    }
    const quotaStatusRequest = buildAiQuotaStatusRequest({
      config: companyConfig.config,
      companyMonthlyBudgetCents: companyConfig.companyMonthlyBudgetCents,
      estimatedRequestTokens: quotaProbeEstimatedRequestTokens,
    });
    if (!quotaStatusRequest) {
      return noStoreJson(
        {
          error:
            "Current audited AI quota capacity could not be verified. Production AI status is unavailable.",
        },
        503,
      );
    }
    const quotaStatusPayload = await readSupabaseAiQuotaStatus({
      companyId: authorization.companyId,
      actorUserId: user.id,
      request: quotaStatusRequest,
    });
    quotaStatus = parseAiQuotaStatusReceipt(quotaStatusPayload, {
      companyId: authorization.companyId,
      actorUserId: user.id,
    });
    if (!quotaStatus) {
      return noStoreJson(
        {
          error:
            "Current audited AI quota capacity could not be verified. Production AI status is unavailable.",
        },
        503,
      );
    }
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
    policy: companyPolicy,
    config: providerConfig,
    savedAnalysesReadAvailable: savedAnalysesReadProbe.error === null,
    quotaStatus,
    quotaProbeEstimatedRequestTokens,
  });
  const statusResponse = noStoreJson(status, 200);
  if (refreshClaimed) {
    statusResponse.headers.set(REFRESH_ACKNOWLEDGEMENT_HEADER, "1");
  }
  return statusResponse;
}

export async function GET(request: NextRequest) {
  if (request.headers.has(LEGACY_FORCE_REFRESH_HEADER)) {
    return noStoreJson(
      {
        error:
          "Production AI context refreshes require the rate-limited status refresh endpoint.",
        code: "ai_quota_probe_refresh_method_required",
      },
      400,
    );
  }
  return readAiCompanyPilotStatus({
    requestedCompanyId: request.nextUrl.searchParams.get("companyId")?.trim() ?? "",
    explicitRefresh: false,
  });
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    return noStoreJson(
      { error: "Production AI status refreshes require an application/json request." },
      415,
    );
  }
  const bodyResult = await readBoundedJsonBody(request, MAX_AI_STATUS_BODY_BYTES);
  if (!bodyResult.ok && bodyResult.reason === "too_large") {
    return noStoreJson({ error: "The Production AI status refresh request is too large." }, 413);
  }
  if (
    !bodyResult.ok ||
    !bodyResult.value ||
    typeof bodyResult.value !== "object" ||
    Array.isArray(bodyResult.value)
  ) {
    return noStoreJson(
      { error: "The Production AI status refresh request must be valid JSON." },
      400,
    );
  }
  const body = bodyResult.value as AiStatusRefreshRequestBody;
  if (
    Object.keys(body).length !== 1 ||
    typeof body.companyId !== "string"
  ) {
    return noStoreJson(
      { error: "An exact company is required for Production AI status refresh." },
      400,
    );
  }
  return readAiCompanyPilotStatus({
    requestedCompanyId: body.companyId.trim(),
    explicitRefresh: true,
  });
}

function noStoreJson(
  body: unknown,
  status: number,
  additionalHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...additionalHeaders },
  });
}
