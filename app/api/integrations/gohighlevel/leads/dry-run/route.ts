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
  leadLabel: string | null;
  companyId: string | null;
  syncLogId: string | null;
};

type CrmServerClient = NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>;

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
      leadLabel: null,
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

function isWeatherTechCompany(company: CompanyRecord) {
  const companyName = [company.name, company.short_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return company.trade === "roofing" || companyName.includes("weathertech");
}

function getLeadLabel(lead: LeadRecord) {
  const fullName = [lead.first_name, lead.last_name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");

  return fullName || lead.contact_name;
}

function weatherTechCompanySort(left: CompanyRecord, right: CompanyRecord) {
  const leftName = left.name.toLowerCase();
  const rightName = right.name.toLowerCase();
  const leftExact = leftName.includes("weathertech") ? 0 : 1;
  const rightExact = rightName.includes("weathertech") ? 0 : 1;

  return leftExact - rightExact || left.created_at.localeCompare(right.created_at);
}

async function loadNewestWeatherTechLead(client: CrmServerClient) {
  const { data: companyRows, error: companiesError } = await client
    .from("companies")
    .select("*")
    .order("created_at", { ascending: true });

  if (companiesError) {
    return {
      lead: null,
      company: null,
      message: `WeatherTech company lookup failed: ${describeSafeError(companiesError)}`,
      httpStatus: 500,
    };
  }

  const weatherTechCompany =
    ((companyRows ?? []) as CompanyRecord[])
      .filter(isWeatherTechCompany)
      .sort(weatherTechCompanySort)[0] ?? null;

  if (!weatherTechCompany) {
    return {
      lead: null,
      company: null,
      message: "WeatherTech Roofing company could not be found for the dry run.",
      httpStatus: 404,
    };
  }

  const { data: leadRows, error: leadError } = await client
    .from("leads")
    .select("*")
    .eq("company_id", weatherTechCompany.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (leadError) {
    return {
      lead: null,
      company: weatherTechCompany,
      message: `Newest WeatherTech lead lookup failed: ${describeSafeError(leadError)}`,
      httpStatus: 500,
    };
  }

  const newestLead =
    ((leadRows ?? []) as LeadRecord[]).find((lead) => !lead.archived) ?? null;

  if (!newestLead) {
    return {
      lead: null,
      company: weatherTechCompany,
      message: "No non-archived WeatherTech Roofing lead is available for the dry run.",
      httpStatus: 404,
    };
  }

  return {
    lead: newestLead,
    company: weatherTechCompany,
    message: null,
    httpStatus: 200,
  };
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
  let lead: LeadRecord | null = null;
  let company: CompanyRecord | null = null;

  if (leadId) {
    const { data: selectedLead, error: leadError } = await client
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !selectedLead) {
      return createFailureResponse({
        status: "not_found",
        message: "The selected lead could not be loaded for the dry run.",
        leadId,
        httpStatus: 404,
      });
    }

    lead = selectedLead as LeadRecord;
  } else {
    const defaultLead = await loadNewestWeatherTechLead(client);

    if (!defaultLead.lead) {
      return createFailureResponse({
        status: "not_found",
        message:
          defaultLead.message ??
          "No non-archived WeatherTech Roofing lead is available for the dry run.",
        companyId: defaultLead.company?.id ?? null,
        httpStatus: defaultLead.httpStatus,
      });
    }

    lead = defaultLead.lead;
    company = defaultLead.company;
  }

  if (!lead) {
    return createFailureResponse({
      status: "not_found",
      message: "No lead could be loaded for the GoHighLevel dry run.",
      httpStatus: 404,
    });
  }

  const { data: companyRecord, error: companyError } = company
    ? { data: company, error: null }
    : await client
        .from("companies")
        .select("*")
        .eq("id", lead.company_id)
        .single();

  if (companyError || !companyRecord) {
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
    company: companyRecord as CompanyRecord,
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
        payload: preview.payload,
      }),
      error_code: preview.ok ? null : preview.status,
      error_message: preview.ok ? null : preview.message,
    });
    const responseBody: DryRunLeadResponse = {
      ...preview,
      leadId: lead.id,
      leadLabel: getLeadLabel(lead),
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
