import { NextRequest, NextResponse } from "next/server";
import { createIntegrationSyncLog } from "../../../../../../lib/crm/repository";
import {
  sanitizeIntegrationSyncLogSummary,
  sanitizeIntegrationSyncLogText,
} from "../../../../../../lib/crm/integrations";
import type {
  CompanyRecord,
  CustomerRecord,
  IntegrationConnectionRecord,
  LeadRecord,
} from "../../../../../../lib/crm/types";
import {
  GHL_LEAD_CONTACT_DRY_RUN_EVENT_TYPE,
  prepareGoHighLevelLeadContactDryRun,
  type GoHighLevelLeadContactDryRunPreview,
} from "../../../../../../lib/gohighlevel/serverClient";
import { getSupabaseServerClient } from "../../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

type DryRunLeadRequestBody = {
  leadId?: unknown;
};

type DryRunLeadResponse = GoHighLevelLeadContactDryRunPreview & {
  leadId: string | null;
  companyId: string | null;
  syncLogId: string | null;
};

function getRequestString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
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

function summarizeDryRunPayload(preview: GoHighLevelLeadContactDryRunPreview) {
  const payload = preview.payload;

  if (!payload) {
    return null;
  }

  return {
    intendedRequest: payload.intendedRequest,
    contact: {
      hasEmail: Boolean(payload.contact.email),
      hasPhone: Boolean(payload.contact.phone),
      hasAddress: Boolean(payload.contact.address1),
      state: payload.contact.state,
      tagCount: payload.contact.tags.length,
      tags: payload.contact.tags,
    },
    opportunityPreview: {
      monetaryValue: payload.opportunityPreview.monetaryValue,
      status: payload.opportunityPreview.status,
      priority: payload.opportunityPreview.priority,
      serviceType: payload.opportunityPreview.serviceType,
    },
    weathertechMetadata: {
      leadId: payload.weathertechMetadata.leadId,
      companyId: payload.weathertechMetadata.companyId,
      customerLinked: Boolean(payload.weathertechMetadata.customerId),
      source: payload.weathertechMetadata.source,
      nextFollowUp: payload.weathertechMetadata.nextFollowUp,
      notesIncluded: payload.weathertechMetadata.notesIncluded,
    },
    safety: payload.safety,
  };
}

function createFailureResponse({
  status,
  message,
  leadId = null,
  companyId = null,
  httpStatus,
}: {
  status: DryRunLeadResponse["status"] | "not_found" | "log_failed" | "error";
  message: string;
  leadId?: string | null;
  companyId?: string | null;
  httpStatus: number;
}) {
  return NextResponse.json(
    {
      ok: false,
      dryRun: true,
      communicationsSent: false,
      automationTriggered: false,
      status,
      message,
      tokenConfigured: false,
      requiredFields: [],
      missingFields: [],
      location: null,
      payload: null,
      requestFingerprint: null,
      checkedAt: new Date().toISOString(),
      nextStep: "Select a valid lead and rerun the dry-run check.",
      leadId,
      companyId,
      syncLogId: null,
    },
    { status: httpStatus },
  );
}

async function getJsonBody(request: NextRequest): Promise<DryRunLeadRequestBody> {
  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object") {
      return body as DryRunLeadRequestBody;
    }
  } catch {
    return {};
  }

  return {};
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();

  if (!client) {
    return createFailureResponse({
      status: "error",
      message: "Supabase is not configured for server-side CRM access.",
      httpStatus: 503,
    });
  }

  const body = await getJsonBody(request);
  const leadId = getRequestString(body.leadId);

  if (!leadId) {
    return createFailureResponse({
      status: "validation_failed",
      message: "Select a lead before running the GoHighLevel dry run.",
      httpStatus: 400,
    });
  }

  const { data: lead, error: leadError } = await client
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return createFailureResponse({
      status: "not_found",
      message: "The selected lead could not be loaded for the dry run.",
      leadId,
      httpStatus: 404,
    });
  }

  const { data: company, error: companyError } = await client
    .from("companies")
    .select("*")
    .eq("id", lead.company_id)
    .single();

  if (companyError || !company) {
    return createFailureResponse({
      status: "not_found",
      message: "The selected lead's company could not be loaded for the dry run.",
      leadId: lead.id,
      companyId: lead.company_id,
      httpStatus: 404,
    });
  }

  let customer: CustomerRecord | null = null;

  if (lead.customer_id) {
    const { data: customerRecord } = await client
      .from("customers")
      .select("*")
      .eq("id", lead.customer_id)
      .maybeSingle();
    customer = customerRecord ?? null;
  }

  const { data: connection } = await client
    .from("integration_connections")
    .select("*")
    .eq("company_id", lead.company_id)
    .eq("provider", "gohighlevel")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const preview = prepareGoHighLevelLeadContactDryRun({
    lead: lead as LeadRecord,
    company: company as CompanyRecord,
    customer,
  });

  try {
    const syncLog = await createIntegrationSyncLog(client, {
      company_id: lead.company_id,
      integration_connection_id:
        (connection as IntegrationConnectionRecord | null)?.id ?? null,
      provider: "gohighlevel",
      direction: "weathertech_to_provider",
      event_type: GHL_LEAD_CONTACT_DRY_RUN_EVENT_TYPE,
      status: preview.ok ? "succeeded" : "failed",
      related_table: "leads",
      related_record_id: lead.id,
      attempt_count: 1,
      max_attempts: 3,
      last_attempted_at: preview.checkedAt,
      completed_at: preview.checkedAt,
      request_fingerprint: preview.requestFingerprint,
      request_summary: sanitizeIntegrationSyncLogSummary({
        dryRun: true,
        intendedEndpoint: preview.payload?.intendedRequest ?? null,
        leadId: lead.id,
        companyId: lead.company_id,
        locationKey: preview.location.key,
        requiredFields: preview.requiredFields,
      }),
      response_summary: sanitizeIntegrationSyncLogSummary({
        dryRun: true,
        communicationsSent: false,
        automationTriggered: false,
        status: preview.status,
        missingFields: preview.missingFields,
        payloadSummary: summarizeDryRunPayload(preview),
      }),
      error_code: preview.ok ? null : preview.status,
      error_message: preview.ok ? null : preview.message,
    });
    const responseBody: DryRunLeadResponse = {
      ...preview,
      leadId: lead.id,
      companyId: lead.company_id,
      syncLogId: syncLog.id,
    };

    return NextResponse.json(responseBody, {
      status: preview.ok ? 200 : preview.status === "missing_config" ? 503 : 422,
    });
  } catch (error) {
    return createFailureResponse({
      status: "log_failed",
      message: `Dry run prepared, but the sync log could not be saved: ${describeSafeError(error)}`,
      leadId: lead.id,
      companyId: lead.company_id,
      httpStatus: 500,
    });
  }
}
