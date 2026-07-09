import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  sanitizeIntegrationSyncLogSummary,
  sanitizeIntegrationSyncLogText,
} from "../../../../lib/crm/integrations";
import {
  resolveLeadSourceMapping,
  type LeadSourceMappingResolution,
} from "../../../../lib/crm/leadSourceMappings";
import {
  createIntegrationSyncLog,
  createLead,
} from "../../../../lib/crm/repository";
import type {
  CompanyRecord,
  Database,
  LeadInput,
  ServiceType,
} from "../../../../lib/crm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;
type BusinessKey = "IHC" | "WeatherTech";

type WebsiteLeadRequestBody = {
  business?: unknown;
  location?: unknown;
  source?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  address?: unknown;
  serviceType?: unknown;
  message?: unknown;
  yelpBusinessId?: unknown;
  websiteUrl?: unknown;
  utmSource?: unknown;
  utmCampaign?: unknown;
  utmMedium?: unknown;
};

type WebsiteLeadResponse = {
  ok: boolean;
  route?: "/api/leads/website";
  accepts?: "POST";
  leadId?: string;
  status:
    | "healthy"
    | "created"
    | "created_with_warning"
    | "invalid_json"
    | "validation_failed"
    | "crm_not_configured"
    | "company_not_found"
    | "error";
  warnings: string[];
};

type NormalizedWebsiteLead = {
  business: BusinessKey;
  source: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  address: string;
  location: string | null;
  serviceType: ServiceType;
  message: string | null;
  yelpBusinessId: string | null;
  websiteUrl: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  sourceMappingId: string | null;
  sourceMappingDisplayName: string | null;
  sourceMappingMatchType: string | null;
  warnings: string[];
};

const DEFAULT_ADDRESS = "Website lead - address pending";
const WEBSITE_LEAD_EVENT_TYPE = "website.lead.created";

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

function getText(value: unknown, maxLength = 500) {
  if (typeof value === "string") {
    const trimmed = value.trim();

    return trimmed ? trimmed.slice(0, maxLength) : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, maxLength);
  }

  return null;
}

function getToken(value: string | null) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function normalizePhone(value: unknown) {
  const text = getText(value, 40);

  if (!text) {
    return null;
  }

  const safePhone = text.replace(/[^\d+().\-\s]/g, "").trim();

  return safePhone ? safePhone.slice(0, 40) : null;
}

function normalizeEmail(value: unknown) {
  const email = getText(value, 160)?.toLowerCase() ?? null;

  if (!email) {
    return {
      email: null,
      warning: null,
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      email: null,
      warning: "Email was not in a valid format and was not stored.",
    };
  }

  return {
    email,
    warning: null,
  };
}

function normalizeSource(value: unknown) {
  return getText(value, 80) ?? "website";
}

function normalizeBusiness(body: WebsiteLeadRequestBody):
  | { business: BusinessKey; warning: string | null }
  | { business: null; warning: string } {
  const businessText = getText(body.business, 80);
  const websiteUrl = getText(body.websiteUrl, 240);
  const serviceType = getText(body.serviceType, 80);
  const businessToken = getToken(businessText);
  const websiteToken = getToken(websiteUrl);
  const serviceToken = getToken(serviceType);

  if (businessToken.includes("ihc")) {
    return { business: "IHC", warning: null };
  }

  if (businessToken.includes("weathertech")) {
    return { business: "WeatherTech", warning: null };
  }

  if (businessText) {
    return {
      business: null,
      warning: 'Business must be "IHC" or "WeatherTech".',
    };
  }

  if (websiteToken.includes("ihc")) {
    return {
      business: "IHC",
      warning: "Business was blank and was inferred as IHC from websiteUrl.",
    };
  }

  if (websiteToken.includes("weathertech")) {
    return {
      business: "WeatherTech",
      warning:
        "Business was blank and was inferred as WeatherTech from websiteUrl.",
    };
  }

  if (serviceToken.includes("paint")) {
    return {
      business: "IHC",
      warning: "Business was blank and was inferred as IHC from serviceType.",
    };
  }

  if (serviceToken.includes("roof")) {
    return {
      business: "WeatherTech",
      warning:
        "Business was blank and was inferred as WeatherTech from serviceType.",
    };
  }

  return {
    business: "WeatherTech",
    warning: "Business was blank and was defaulted to WeatherTech.",
  };
}

function normalizeServiceType(
  value: unknown,
  business: BusinessKey,
): { serviceType: ServiceType; warning: string | null } {
  const serviceText = getText(value, 80);
  const serviceToken = getToken(serviceText);
  const defaultServiceType: ServiceType =
    business === "IHC" ? "painting" : "roofing";

  if (!serviceText) {
    return {
      serviceType: defaultServiceType,
      warning: `serviceType was blank and was defaulted to ${defaultServiceType}.`,
    };
  }

  if (serviceToken.includes("both") || serviceToken.includes("roofandpaint")) {
    return { serviceType: "both" satisfies ServiceType, warning: null };
  }

  if (serviceToken.includes("paint")) {
    return { serviceType: "painting" satisfies ServiceType, warning: null };
  }

  if (serviceToken.includes("roof")) {
    return { serviceType: "roofing" satisfies ServiceType, warning: null };
  }

  return {
    serviceType: defaultServiceType,
    warning: `serviceType was not recognized and was defaulted to ${defaultServiceType}.`,
  };
}

function maskPhone(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length > 4 ? `****${digits.slice(-4)}` : digits ? "****" : null;
}

function maskEmail(value: string | null) {
  if (!value) {
    return null;
  }

  const [localPart, domain] = value.split("@");

  if (!domain) {
    return "***";
  }

  return `${localPart.slice(0, 1) || "*"}***@${domain}`;
}

function describeSafeError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeIntegrationSyncLogText(error.message) ?? "Request failed.";
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return sanitizeIntegrationSyncLogText(message) ?? "Request failed.";
    }
  }

  return "Request failed.";
}

async function getJsonBody(
  request: NextRequest,
): Promise<{ body: WebsiteLeadRequestBody | null; error: string | null }> {
  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return { body: body as WebsiteLeadRequestBody, error: null };
    }

    return { body: null, error: "Request body must be a JSON object." };
  } catch {
    return { body: null, error: "Request body must be valid JSON." };
  }
}

function normalizeWebsiteLeadBody(body: WebsiteLeadRequestBody):
  | { lead: NormalizedWebsiteLead; errors: [] }
  | { lead: null; errors: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rawName = getText(body.name, 160);
  const phone = normalizePhone(body.phone);
  const { email, warning: emailWarning } = normalizeEmail(body.email);
  const businessResult = normalizeBusiness(body);

  if (emailWarning) {
    warnings.push(emailWarning);
  }

  if (businessResult.warning) {
    warnings.push(businessResult.warning);
  }

  if (!businessResult.business) {
    errors.push(businessResult.warning);
  }

  if (!rawName && !phone && !email) {
    errors.push("At least one contact field is required: name, phone, or email.");
  }

  if (errors.length > 0 || !businessResult.business) {
    return { lead: null, errors, warnings };
  }

  const contactName = rawName ?? phone ?? email ?? "Website lead";
  const source = normalizeSource(body.source);
  const location = getText(body.location, 160);
  const address = getText(body.address, 240) ?? location ?? DEFAULT_ADDRESS;
  const { serviceType, warning: serviceWarning } = normalizeServiceType(
    body.serviceType,
    businessResult.business,
  );

  if (!getText(body.address, 240)) {
    warnings.push(
      location
        ? "address was blank, so location was used as the lead address."
        : "address was blank, so a placeholder lead address was used.",
    );
  }

  if (serviceWarning) {
    warnings.push(serviceWarning);
  }

  return {
    lead: {
      business: businessResult.business,
      source,
      contactName,
      phone,
      email,
      address,
      location,
      serviceType,
      message: getText(body.message, 1500),
      yelpBusinessId: getText(body.yelpBusinessId, 160),
      websiteUrl: getText(body.websiteUrl, 240),
      utmSource: getText(body.utmSource, 120),
      utmCampaign: getText(body.utmCampaign, 120),
      utmMedium: getText(body.utmMedium, 120),
      sourceMappingId: null,
      sourceMappingDisplayName: null,
      sourceMappingMatchType: null,
      warnings,
    },
    errors: [],
  };
}

function getBusinessFromMapping(value: string) {
  const token = getToken(value);

  if (token.includes("ihc")) {
    return "IHC" satisfies BusinessKey;
  }

  if (token.includes("weathertech")) {
    return "WeatherTech" satisfies BusinessKey;
  }

  return null;
}

function applyLeadSourceMapping(
  lead: NormalizedWebsiteLead,
  resolution: LeadSourceMappingResolution,
) {
  const warnings = [...lead.warnings, ...resolution.warnings];

  if (!resolution.mapping) {
    return {
      ...lead,
      warnings,
    };
  }

  const mappedBusiness = getBusinessFromMapping(resolution.mapping.business);

  if (!mappedBusiness) {
    warnings.push(
      `Lead source mapping ${resolution.mapping.display_name} has an unsupported business value and was not used for business routing.`,
    );
  }

  const mappedLocation = resolution.mapping.location || lead.location;
  const shouldUseMappedAddress =
    !lead.address ||
    lead.address === DEFAULT_ADDRESS ||
    lead.address === lead.location;

  return {
    ...lead,
    business: mappedBusiness ?? lead.business,
    location: mappedLocation,
    address: shouldUseMappedAddress
      ? mappedLocation ?? lead.address
      : lead.address,
    sourceMappingId: resolution.mapping.id,
    sourceMappingDisplayName: resolution.mapping.display_name,
    sourceMappingMatchType: resolution.matchType,
    warnings,
  };
}

function getCompanyText(company: CompanyRecord) {
  return `${company.name} ${company.short_name ?? ""} ${company.trade}`.toLowerCase();
}

function findCompanyForBusiness(
  companies: CompanyRecord[],
  business: BusinessKey,
) {
  if (business === "IHC") {
    return (
      companies.find((company) => getCompanyText(company).includes("ihc")) ??
      companies.find((company) => company.trade === "painting")
    );
  }

  return (
    companies.find((company) => getCompanyText(company).includes("weathertech")) ??
    companies.find((company) => company.trade === "roofing")
  );
}

async function getCompanyForWebsiteLead(
  client: CrmClient,
  business: BusinessKey,
) {
  const { data, error } = await client.from("companies").select("*").order("name");

  if (error) {
    throw error;
  }

  return findCompanyForBusiness((data ?? []) as CompanyRecord[], business) ?? null;
}

function buildLeadNotes(lead: NormalizedWebsiteLead) {
  const utmValues = [
    lead.utmSource ? `source=${lead.utmSource}` : null,
    lead.utmMedium ? `medium=${lead.utmMedium}` : null,
    lead.utmCampaign ? `campaign=${lead.utmCampaign}` : null,
  ].filter(Boolean);

  return [
    "Website lead intake mapping:",
    `Business: ${lead.business}`,
    `Source: ${lead.source}`,
    `Location: ${lead.location ?? "Not provided"}`,
    `Website URL: ${lead.websiteUrl ?? "Not provided"}`,
    `Yelp Business ID: ${lead.yelpBusinessId ?? "Not provided"}`,
    `Lead Source Mapping: ${
      lead.sourceMappingDisplayName
        ? `${lead.sourceMappingDisplayName} (${lead.sourceMappingMatchType})`
        : "Not matched"
    }`,
    `UTM: ${utmValues.length > 0 ? utmValues.join(", ") : "Not provided"}`,
    `Message: ${lead.message ?? "Not provided"}`,
    "CRM mapping: name -> contact_name, address/location -> property_address, serviceType -> service_type.",
  ].join("\n");
}

function buildLeadInput(
  company: CompanyRecord,
  lead: NormalizedWebsiteLead,
): LeadInput {
  return {
    company_id: company.id,
    contact_name: lead.contactName,
    phone: lead.phone,
    email: lead.email,
    property_address: lead.address,
    city: lead.location,
    state: "AZ",
    postal_code: null,
    service_type: lead.serviceType,
    source: lead.source,
    status: "new",
    pipeline_stage: "new_lead",
    priority: "normal",
    estimated_value: 0,
    next_follow_up: null,
    notes: buildLeadNotes(lead),
  };
}

async function writeWebsiteLeadSyncLog({
  client,
  company,
  lead,
  leadId,
}: {
  client: CrmClient;
  company: CompanyRecord;
  lead: NormalizedWebsiteLead;
  leadId: string;
}) {
  const now = new Date().toISOString();

  return createIntegrationSyncLog(client, {
    company_id: company.id,
    integration_connection_id: null,
    provider: "website",
    direction: "provider_to_weathertech",
    event_type: WEBSITE_LEAD_EVENT_TYPE,
    status: "succeeded",
    related_table: "leads",
    related_record_id: leadId,
    external_id: lead.yelpBusinessId,
    attempt_count: 1,
    max_attempts: 1,
    last_attempted_at: now,
    completed_at: now,
    request_summary: sanitizeIntegrationSyncLogSummary({
      business: lead.business,
      source: lead.source,
      location: lead.location,
      websiteUrl: lead.websiteUrl,
      yelpBusinessId: lead.yelpBusinessId,
      sourceMapping: {
        id: lead.sourceMappingId,
        displayName: lead.sourceMappingDisplayName,
        matchType: lead.sourceMappingMatchType,
      },
      utmSource: lead.utmSource,
      utmCampaign: lead.utmCampaign,
      utmMedium: lead.utmMedium,
      contact: {
        hasName: Boolean(lead.contactName),
        phone: maskPhone(lead.phone),
        email: maskEmail(lead.email),
      },
      messageLength: lead.message?.length ?? 0,
    }),
    response_summary: sanitizeIntegrationSyncLogSummary({
      leadId,
      companyId: company.id,
      companyName: company.name,
      sourceMapping: {
        id: lead.sourceMappingId,
        displayName: lead.sourceMappingDisplayName,
        matchType: lead.sourceMappingMatchType,
      },
      mapping: {
        business: "company_id",
        name: "contact_name",
        address: "property_address",
        location: "city",
        source: "source",
        serviceType: "service_type",
        messageAndAttribution: "notes",
      },
      warnings: lead.warnings,
    }),
  });
}

export async function GET() {
  return createJsonResponse({
    ok: true,
    route: "/api/leads/website",
    accepts: "POST",
    status: "healthy",
    warnings: [],
  });
}

export async function POST(request: NextRequest) {
  const { body, error: jsonError } = await getJsonBody(request);

  if (!body) {
    return createJsonResponse(
      {
        ok: false,
        status: "invalid_json",
        warnings: [jsonError ?? "Request body must be valid JSON."],
      },
      400,
    );
  }

  const normalized = normalizeWebsiteLeadBody(body);

  if (!normalized.lead) {
    return createJsonResponse(
      {
        ok: false,
        status: "validation_failed",
        warnings: [...normalized.warnings, ...normalized.errors],
      },
      400,
    );
  }

  const client = getServiceSupabaseClient();

  if (!client) {
    return createJsonResponse(
      {
        ok: false,
        status: "crm_not_configured",
        warnings: [
          "Supabase service-role access is not configured, so website lead intake cannot create CRM leads yet.",
        ],
      },
      503,
    );
  }

  try {
    const mappedLead = applyLeadSourceMapping(
      normalized.lead,
      await resolveLeadSourceMapping(client, {
        provider: "website",
        externalSourceId: normalized.lead.websiteUrl,
        business: normalized.lead.business,
        location: normalized.lead.location,
      }),
    );
    const company = await getCompanyForWebsiteLead(
      client,
      mappedLead.business,
    );

    if (!company) {
      return createJsonResponse(
        {
          ok: false,
          status: "company_not_found",
          warnings: [
            `No CRM company record was found for ${mappedLead.business}.`,
          ],
        },
        503,
      );
    }

    const lead = await createLead(client, buildLeadInput(company, mappedLead));
    const warnings = [...mappedLead.warnings];

    try {
      await writeWebsiteLeadSyncLog({
        client,
        company,
        lead: mappedLead,
        leadId: lead.id,
      });
    } catch (syncLogError) {
      warnings.push(
        `Lead was created, but website intake sync logging failed: ${describeSafeError(
          syncLogError,
        )}`,
      );
    }

    return createJsonResponse(
      {
        ok: true,
        leadId: lead.id,
        status: warnings.length > 0 ? "created_with_warning" : "created",
        warnings,
      },
      201,
    );
  } catch (error) {
    const message = describeSafeError(error);

    console.error("[CRM] Website lead intake failed", { message });

    return createJsonResponse(
      {
        ok: false,
        status: "error",
        warnings: [message],
      },
      500,
    );
  }
}
