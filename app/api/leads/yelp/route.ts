import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  sanitizeIntegrationSyncLogSummary,
  sanitizeIntegrationSyncLogText,
} from "../../../../lib/crm/integrations";
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

type YelpLeadRequestBody = {
  yelpBusinessId?: unknown;
  business?: unknown;
  location?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  message?: unknown;
  serviceType?: unknown;
  yelpConversationId?: unknown;
  yelpLeadId?: unknown;
  source?: unknown;
};

type YelpLeadResponse = {
  ok: boolean;
  route?: "/api/leads/yelp";
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

type NormalizedYelpLead = {
  business: BusinessKey;
  yelpAccount: string;
  source: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  propertyAddress: string;
  serviceType: ServiceType;
  message: string | null;
  yelpBusinessId: string | null;
  yelpConversationId: string | null;
  yelpLeadId: string | null;
  warnings: string[];
};

const DEFAULT_ADDRESS = "Yelp lead - address pending";
const YELP_LEAD_EVENT_TYPE = "yelp.lead.created";

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

function createJsonResponse(body: YelpLeadResponse, status = 200) {
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
  return getText(value, 80) ?? "yelp";
}

function inferBusiness(body: YelpLeadRequestBody):
  | { business: BusinessKey; warning: string | null }
  | { business: null; warning: string } {
  const businessText = getText(body.business, 100);
  const businessToken = getToken(businessText);
  const locationToken = getToken(getText(body.location, 160));
  const yelpBusinessToken = getToken(getText(body.yelpBusinessId, 160));
  const serviceToken = getToken(getText(body.serviceType, 80));
  const searchableToken = [
    businessToken,
    locationToken,
    yelpBusinessToken,
    serviceToken,
  ].join(" ");

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

  if (searchableToken.includes("ihc") || searchableToken.includes("paint")) {
    return {
      business: "IHC",
      warning:
        "Business was blank and was inferred as IHC from Yelp lead metadata.",
    };
  }

  if (
    searchableToken.includes("weathertech") ||
    searchableToken.includes("roof")
  ) {
    return {
      business: "WeatherTech",
      warning:
        "Business was blank and was inferred as WeatherTech from Yelp lead metadata.",
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

function getYelpAccountLabel(body: YelpLeadRequestBody, business: BusinessKey) {
  if (business === "IHC") {
    return "IHC";
  }

  const locationToken = getToken(getText(body.location, 160));
  const yelpBusinessToken = getToken(getText(body.yelpBusinessId, 160));
  const combined = `${locationToken} ${yelpBusinessToken}`;

  if (combined.includes("location2") || combined.includes("weathertech2")) {
    return "WeatherTech location 2";
  }

  if (combined.includes("location1") || combined.includes("weathertech1")) {
    return "WeatherTech location 1";
  }

  return "WeatherTech";
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
): Promise<{ body: YelpLeadRequestBody | null; error: string | null }> {
  try {
    const body: unknown = await request.json();

    if (body && typeof body === "object" && !Array.isArray(body)) {
      return { body: body as YelpLeadRequestBody, error: null };
    }

    return { body: null, error: "Request body must be a JSON object." };
  } catch {
    return { body: null, error: "Request body must be valid JSON." };
  }
}

function normalizeYelpLeadBody(body: YelpLeadRequestBody):
  | { lead: NormalizedYelpLead; errors: [] }
  | { lead: null; errors: string[]; warnings: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rawName = getText(body.name, 160);
  const phone = normalizePhone(body.phone);
  const { email, warning: emailWarning } = normalizeEmail(body.email);
  const message = getText(body.message, 1500);
  const businessResult = inferBusiness(body);

  if (emailWarning) {
    warnings.push(emailWarning);
  }

  if (businessResult.warning) {
    warnings.push(businessResult.warning);
  }

  if (!businessResult.business) {
    errors.push(businessResult.warning);
  }

  if (!rawName && !phone && !email && !message) {
    errors.push(
      "At least one contact field is required: name, phone, email, or message.",
    );
  }

  if (errors.length > 0 || !businessResult.business) {
    return { lead: null, errors, warnings };
  }

  const location = getText(body.location, 160);
  const propertyAddress = location ?? DEFAULT_ADDRESS;
  const { serviceType, warning: serviceWarning } = normalizeServiceType(
    body.serviceType,
    businessResult.business,
  );

  if (!location) {
    warnings.push(
      "location was blank, so a placeholder lead address was used.",
    );
  }

  if (serviceWarning) {
    warnings.push(serviceWarning);
  }

  return {
    lead: {
      business: businessResult.business,
      yelpAccount: getYelpAccountLabel(body, businessResult.business),
      source: normalizeSource(body.source),
      contactName: rawName ?? phone ?? email ?? "Yelp lead",
      phone,
      email,
      location,
      propertyAddress,
      serviceType,
      message,
      yelpBusinessId: getText(body.yelpBusinessId, 160),
      yelpConversationId: getText(body.yelpConversationId, 160),
      yelpLeadId: getText(body.yelpLeadId, 160),
      warnings,
    },
    errors: [],
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

async function getCompanyForYelpLead(
  client: CrmClient,
  business: BusinessKey,
) {
  const { data, error } = await client.from("companies").select("*").order("name");

  if (error) {
    throw error;
  }

  return findCompanyForBusiness((data ?? []) as CompanyRecord[], business) ?? null;
}

function buildLeadNotes(lead: NormalizedYelpLead) {
  return [
    "Yelp lead intake mapping:",
    `Yelp account: ${lead.yelpAccount}`,
    `Business: ${lead.business}`,
    `Source: ${lead.source}`,
    `Location: ${lead.location ?? "Not provided"}`,
    `Yelp Business ID: ${lead.yelpBusinessId ?? "Not provided"}`,
    `Yelp Conversation ID: ${lead.yelpConversationId ?? "Not provided"}`,
    `Yelp Lead ID: ${lead.yelpLeadId ?? "Not provided"}`,
    `Message: ${lead.message ?? "Not provided"}`,
    "CRM mapping: name -> contact_name, location -> property_address/city, serviceType -> service_type.",
  ].join("\n");
}

function buildLeadInput(
  company: CompanyRecord,
  lead: NormalizedYelpLead,
): LeadInput {
  return {
    company_id: company.id,
    contact_name: lead.contactName,
    phone: lead.phone,
    email: lead.email,
    property_address: lead.propertyAddress,
    city: lead.location,
    state: "AZ",
    postal_code: null,
    service_type: lead.serviceType,
    source: lead.source,
    status: "new",
    priority: "normal",
    estimated_value: 0,
    next_follow_up: null,
    notes: buildLeadNotes(lead),
  };
}

async function writeYelpLeadSyncLog({
  client,
  company,
  lead,
  leadId,
}: {
  client: CrmClient;
  company: CompanyRecord;
  lead: NormalizedYelpLead;
  leadId: string;
}) {
  const now = new Date().toISOString();

  return createIntegrationSyncLog(client, {
    company_id: company.id,
    integration_connection_id: null,
    provider: "yelp",
    direction: "provider_to_weathertech",
    event_type: YELP_LEAD_EVENT_TYPE,
    status: "succeeded",
    related_table: "leads",
    related_record_id: leadId,
    external_id: lead.yelpLeadId ?? lead.yelpConversationId ?? lead.yelpBusinessId,
    attempt_count: 1,
    max_attempts: 1,
    last_attempted_at: now,
    completed_at: now,
    request_summary: sanitizeIntegrationSyncLogSummary({
      business: lead.business,
      yelpAccount: lead.yelpAccount,
      source: lead.source,
      location: lead.location,
      yelpBusinessId: lead.yelpBusinessId,
      yelpConversationId: lead.yelpConversationId,
      yelpLeadId: lead.yelpLeadId,
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
      mapping: {
        business: "company_id",
        name: "contact_name",
        location: "property_address/city",
        source: "source",
        serviceType: "service_type",
        yelpAttribution: "notes",
      },
      warnings: lead.warnings,
    }),
  });
}

export async function GET() {
  return createJsonResponse({
    ok: true,
    route: "/api/leads/yelp",
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

  const normalized = normalizeYelpLeadBody(body);

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
          "Supabase service-role access is not configured, so Yelp lead intake cannot create CRM leads yet.",
        ],
      },
      503,
    );
  }

  try {
    const company = await getCompanyForYelpLead(
      client,
      normalized.lead.business,
    );

    if (!company) {
      return createJsonResponse(
        {
          ok: false,
          status: "company_not_found",
          warnings: [
            `No CRM company record was found for ${normalized.lead.business}.`,
          ],
        },
        503,
      );
    }

    const lead = await createLead(client, buildLeadInput(company, normalized.lead));
    const warnings = [...normalized.lead.warnings];

    try {
      await writeYelpLeadSyncLog({
        client,
        company,
        lead: normalized.lead,
        leadId: lead.id,
      });
    } catch (syncLogError) {
      warnings.push(
        `Lead was created, but Yelp intake sync logging failed: ${describeSafeError(
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

    console.error("[CRM] Yelp lead intake failed", { message });

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
