import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildIntegrationSyncFailedUpdate,
  buildIntegrationSyncPendingUpdate,
  buildIntegrationSyncRetryableUpdate,
  buildIntegrationSyncSuccessUpdate,
  canRetryIntegrationSyncLog,
  sanitizeIntegrationSyncLogSummary,
  sanitizeIntegrationSyncLogText,
} from "./integrations";
import {
  resolveLeadSourceMapping,
  type LeadSourceMappingResolution,
} from "./leadSourceMappings";
import {
  createIntegrationSyncLog,
  createLead,
  updateIntegrationSyncLog,
} from "./repository";
import type {
  CompanyRecord,
  Database,
  IntegrationProvider,
  IntegrationSyncLogRecord,
  LeadInput,
  ServiceType,
} from "./types";

type CrmClient = SupabaseClient<Database>;
type BusinessKey = "IHC" | "WeatherTech";
export type LeadIntakeProvider = Extract<IntegrationProvider, "website" | "yelp">;

export type WebsiteLeadRequestBody = {
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
  externalLeadId?: unknown;
  leadId?: unknown;
  submissionId?: unknown;
  formSubmissionId?: unknown;
  id?: unknown;
  submittedAt?: unknown;
  timestamp?: unknown;
  receivedAt?: unknown;
};

export type YelpLeadRequestBody = {
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
  submittedAt?: unknown;
  timestamp?: unknown;
  receivedAt?: unknown;
};

export type LeadIntakeResponseStatus =
  | "healthy"
  | "created"
  | "created_with_warning"
  | "duplicate"
  | "duplicate_with_warning"
  | "retry_succeeded"
  | "retry_duplicate"
  | "retry_failed"
  | "retry_not_allowed"
  | "invalid_json"
  | "validation_failed"
  | "crm_not_configured"
  | "company_not_found"
  | "not_found"
  | "error";

export type LeadIntakeResponse = {
  ok: boolean;
  status: LeadIntakeResponseStatus;
  provider?: LeadIntakeProvider;
  leadId?: string;
  duplicateOfLeadId?: string;
  syncLogId?: string;
  retriedSyncLogId?: string;
  warnings: string[];
};

type NormalizedLeadIntake = {
  provider: LeadIntakeProvider;
  business: BusinessKey;
  source: string;
  contactName: string;
  phone: string | null;
  email: string | null;
  propertyAddress: string;
  location: string | null;
  serviceType: ServiceType;
  message: string | null;
  externalLeadId: string | null;
  submittedAt: string;
  sourceAccount: string | null;
  websiteUrl: string | null;
  yelpBusinessId: string | null;
  yelpConversationId: string | null;
  yelpLeadId: string | null;
  utmSource: string | null;
  utmCampaign: string | null;
  utmMedium: string | null;
  sourceMappingId: string | null;
  sourceMappingDisplayName: string | null;
  sourceMappingMatchType: string | null;
  warnings: string[];
};

type NormalizeFailure = {
  lead: null;
  errors: string[];
  warnings: string[];
};

type NormalizeSuccess = {
  lead: NormalizedLeadIntake;
  errors: [];
};

type LeadIntakeProcessOptions = {
  logOutcome?: boolean;
};

type LeadIntakeProcessResult = LeadIntakeResponse & {
  requestFingerprint?: string;
  externalId?: string | null;
};

type RetryPayloadEncryptionEnvelope = {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
};

export const LEAD_INTAKE_EVENT_TYPES: Record<LeadIntakeProvider, string> = {
  website: "website.lead.created",
  yelp: "yelp.lead.created",
};

const DEFAULT_WEBSITE_ADDRESS = "Website lead - address pending";
const DEFAULT_YELP_ADDRESS = "Yelp lead - address pending";
const LEAD_INTAKE_MAX_ATTEMPTS = 3;

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

function normalizePhoneForFingerprint(value: string | null) {
  return value?.replace(/\D/g, "") ?? "";
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

function normalizeSource(value: unknown, fallback: LeadIntakeProvider) {
  return getText(value, 80) ?? (fallback === "website" ? "Website" : "Yelp");
}

function normalizeTimestamp(...values: unknown[]) {
  for (const value of values) {
    const text = getText(value, 80);

    if (!text) {
      continue;
    }

    const date = new Date(text);

    if (Number.isFinite(date.getTime())) {
      return date.toISOString();
    }
  }

  return new Date().toISOString();
}

function normalizeWebsiteExternalLeadId(body: WebsiteLeadRequestBody) {
  return (
    getText(body.externalLeadId, 160) ??
    getText(body.leadId, 160) ??
    getText(body.submissionId, 160) ??
    getText(body.formSubmissionId, 160) ??
    getText(body.id, 160)
  );
}

function normalizeBusinessFromWebsite(body: WebsiteLeadRequestBody):
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
      warning: "Business was blank and was inferred as WeatherTech from websiteUrl.",
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
      warning: "Business was blank and was inferred as WeatherTech from serviceType.",
    };
  }

  return {
    business: "WeatherTech",
    warning: "Business was blank and was defaulted to WeatherTech.",
  };
}

function normalizeBusinessFromYelp(body: YelpLeadRequestBody):
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
      warning: "Business was blank and was inferred as IHC from Yelp lead metadata.",
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
    return { serviceType: "both", warning: null };
  }

  if (serviceToken.includes("paint")) {
    return { serviceType: "painting", warning: null };
  }

  if (serviceToken.includes("roof")) {
    return { serviceType: "roofing", warning: null };
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
  lead: NormalizedLeadIntake,
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
  const defaultAddress =
    lead.provider === "website" ? DEFAULT_WEBSITE_ADDRESS : DEFAULT_YELP_ADDRESS;
  const shouldUseMappedAddress =
    !lead.propertyAddress ||
    lead.propertyAddress === defaultAddress ||
    lead.propertyAddress === lead.location;

  return {
    ...lead,
    business: mappedBusiness ?? lead.business,
    sourceAccount:
      lead.provider === "yelp"
        ? resolution.mapping.display_name
        : lead.sourceAccount,
    location: mappedLocation,
    propertyAddress: shouldUseMappedAddress
      ? mappedLocation ?? lead.propertyAddress
      : lead.propertyAddress,
    sourceMappingId: resolution.mapping.id,
    sourceMappingDisplayName: resolution.mapping.display_name,
    sourceMappingMatchType: resolution.matchType,
    warnings,
  };
}

export function normalizeWebsiteLeadBody(
  body: WebsiteLeadRequestBody,
): NormalizeSuccess | NormalizeFailure {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rawName = getText(body.name, 160);
  const phone = normalizePhone(body.phone);
  const { email, warning: emailWarning } = normalizeEmail(body.email);
  const businessResult = normalizeBusinessFromWebsite(body);

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

  const location = getText(body.location, 160);
  const address = getText(body.address, 240) ?? location ?? DEFAULT_WEBSITE_ADDRESS;
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
      provider: "website",
      business: businessResult.business,
      source: normalizeSource(body.source, "website"),
      contactName: rawName ?? phone ?? email ?? "Website lead",
      phone,
      email,
      propertyAddress: address,
      location,
      serviceType,
      message: getText(body.message, 1500),
      externalLeadId: normalizeWebsiteExternalLeadId(body),
      submittedAt: normalizeTimestamp(body.submittedAt, body.timestamp, body.receivedAt),
      sourceAccount: getText(body.websiteUrl, 240),
      websiteUrl: getText(body.websiteUrl, 240),
      yelpBusinessId: getText(body.yelpBusinessId, 160),
      yelpConversationId: null,
      yelpLeadId: null,
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

export function normalizeYelpLeadBody(
  body: YelpLeadRequestBody,
): NormalizeSuccess | NormalizeFailure {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rawName = getText(body.name, 160);
  const phone = normalizePhone(body.phone);
  const { email, warning: emailWarning } = normalizeEmail(body.email);
  const message = getText(body.message, 1500);
  const businessResult = normalizeBusinessFromYelp(body);

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
  const { serviceType, warning: serviceWarning } = normalizeServiceType(
    body.serviceType,
    businessResult.business,
  );

  if (!location) {
    warnings.push("location was blank, so a placeholder lead address was used.");
  }

  if (serviceWarning) {
    warnings.push(serviceWarning);
  }

  const yelpLeadId = getText(body.yelpLeadId, 160);
  const yelpConversationId = getText(body.yelpConversationId, 160);
  const yelpBusinessId = getText(body.yelpBusinessId, 160);

  return {
    lead: {
      provider: "yelp",
      business: businessResult.business,
      source: normalizeSource(body.source, "yelp"),
      contactName: rawName ?? phone ?? email ?? "Yelp lead",
      phone,
      email,
      propertyAddress: location ?? DEFAULT_YELP_ADDRESS,
      location,
      serviceType,
      message,
      externalLeadId: yelpLeadId ?? yelpConversationId,
      submittedAt: normalizeTimestamp(body.submittedAt, body.timestamp, body.receivedAt),
      sourceAccount: getYelpAccountLabel(body, businessResult.business),
      websiteUrl: null,
      yelpBusinessId,
      yelpConversationId,
      yelpLeadId,
      utmSource: null,
      utmCampaign: null,
      utmMedium: null,
      sourceMappingId: null,
      sourceMappingDisplayName: null,
      sourceMappingMatchType: null,
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

async function getCompanyForLeadIntake(
  client: CrmClient,
  business: BusinessKey,
) {
  const { data, error } = await client.from("companies").select("*").order("name");

  if (error) {
    throw error;
  }

  return findCompanyForBusiness((data ?? []) as CompanyRecord[], business) ?? null;
}

function normalizeFingerprintValue(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function buildLeadIntakeFingerprint(lead: NormalizedLeadIntake) {
  const payload = {
    provider: lead.provider,
    business: lead.business,
    sourceAccount: normalizeFingerprintValue(lead.sourceAccount),
    externalLeadId: normalizeFingerprintValue(lead.externalLeadId),
    contactName: normalizeFingerprintValue(lead.contactName),
    phone: normalizePhoneForFingerprint(lead.phone),
    email: normalizeFingerprintValue(lead.email),
    propertyAddress: normalizeFingerprintValue(lead.propertyAddress),
    serviceType: lead.serviceType,
    message: normalizeFingerprintValue(lead.message),
    websiteUrl: normalizeFingerprintValue(lead.websiteUrl),
    yelpBusinessId: normalizeFingerprintValue(lead.yelpBusinessId),
    yelpConversationId: normalizeFingerprintValue(lead.yelpConversationId),
    yelpLeadId: normalizeFingerprintValue(lead.yelpLeadId),
    utmCampaign: normalizeFingerprintValue(lead.utmCampaign),
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function getLeadIntakeExternalId(lead: NormalizedLeadIntake) {
  return lead.externalLeadId;
}

function buildRetryPayload(lead: NormalizedLeadIntake) {
  return {
    provider: lead.provider,
    business: lead.business,
    source: lead.source,
    contactName: lead.contactName,
    phone: lead.phone,
    email: lead.email,
    propertyAddress: lead.propertyAddress,
    location: lead.location,
    serviceType: lead.serviceType,
    message: lead.message,
    externalLeadId: lead.externalLeadId,
    submittedAt: lead.submittedAt,
    sourceAccount: lead.sourceAccount,
    websiteUrl: lead.websiteUrl,
    yelpBusinessId: lead.yelpBusinessId,
    yelpConversationId: lead.yelpConversationId,
    yelpLeadId: lead.yelpLeadId,
    utmSource: lead.utmSource,
    utmCampaign: lead.utmCampaign,
    utmMedium: lead.utmMedium,
  };
}

function getRetryPayloadEncryptionKey() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    return null;
  }

  return createHash("sha256")
    .update(`weathertech-lead-intake-retry:${secret}`)
    .digest();
}

function encryptRetryPayload(
  lead: NormalizedLeadIntake,
): RetryPayloadEncryptionEnvelope | null {
  const key = getRetryPayloadEncryptionKey();

  if (!key) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(buildRetryPayload(lead)), "utf8"),
    cipher.final(),
  ]);

  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function decryptRetryPayload(
  envelope: unknown,
): Record<string, unknown> | null {
  const key = getRetryPayloadEncryptionKey();

  if (!key || !envelope || typeof envelope !== "object") {
    return null;
  }

  const candidate = envelope as Partial<RetryPayloadEncryptionEnvelope>;

  if (
    candidate.v !== 1 ||
    candidate.alg !== "aes-256-gcm" ||
    typeof candidate.iv !== "string" ||
    typeof candidate.tag !== "string" ||
    typeof candidate.data !== "string"
  ) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(candidate.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(candidate.tag, "base64"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(candidate.data, "base64")),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(decrypted.toString("utf8"));

    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
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

function buildRequestSummary(lead: NormalizedLeadIntake) {
  const encryptedRetryPayload = encryptRetryPayload(lead);

  return sanitizeIntegrationSyncLogSummary({
    provider: lead.provider,
    business: lead.business,
    source: lead.source,
    sourceAccount: lead.sourceAccount,
    submittedAt: lead.submittedAt,
    externalLeadId: lead.externalLeadId,
    websiteUrl: lead.websiteUrl,
    yelpBusinessId: lead.yelpBusinessId,
    yelpConversationId: lead.yelpConversationId,
    yelpLeadId: lead.yelpLeadId,
    utmSource: lead.utmSource,
    utmCampaign: lead.utmCampaign,
    utmMedium: lead.utmMedium,
    sourceMapping: {
      id: lead.sourceMappingId,
      displayName: lead.sourceMappingDisplayName,
      matchType: lead.sourceMappingMatchType,
    },
    contact: {
      hasName: Boolean(lead.contactName),
      phone: maskPhone(lead.phone),
      email: maskEmail(lead.email),
    },
    property: {
      hasAddress: Boolean(lead.propertyAddress),
      hasLocation: Boolean(lead.location),
    },
    message: {
      hasMessage: Boolean(lead.message),
      length: lead.message?.length ?? 0,
    },
    retry: {
      encrypted: Boolean(encryptedRetryPayload),
      payloadVersion: encryptedRetryPayload?.v ?? null,
    },
    ...(encryptedRetryPayload
      ? { retryPayloadEncrypted: encryptedRetryPayload }
      : {}),
  });
}

function buildLeadNotes(lead: NormalizedLeadIntake) {
  const label = lead.provider === "website" ? "Website" : "Yelp";
  const campaignValues = [
    lead.utmSource ? `source=${lead.utmSource}` : null,
    lead.utmMedium ? `medium=${lead.utmMedium}` : null,
    lead.utmCampaign ? `campaign=${lead.utmCampaign}` : null,
  ].filter(Boolean);

  return [
    `${label} lead intake mapping:`,
    `Business: ${lead.business}`,
    `Source: ${lead.source}`,
    `Account/campaign: ${lead.sourceAccount ?? lead.utmCampaign ?? "Not provided"}`,
    `External Lead ID: ${lead.externalLeadId ?? "Not provided"}`,
    `Submitted At: ${lead.submittedAt}`,
    `Location: ${lead.location ?? "Not provided"}`,
    `Website URL: ${lead.websiteUrl ?? "Not provided"}`,
    `Yelp Business ID: ${lead.yelpBusinessId ?? "Not provided"}`,
    `Yelp Conversation ID: ${lead.yelpConversationId ?? "Not provided"}`,
    `Yelp Lead ID: ${lead.yelpLeadId ?? "Not provided"}`,
    `Lead Source Mapping: ${
      lead.sourceMappingDisplayName
        ? `${lead.sourceMappingDisplayName} (${lead.sourceMappingMatchType})`
        : "Not matched"
    }`,
    `UTM: ${campaignValues.length > 0 ? campaignValues.join(", ") : "Not provided"}`,
    `Message: ${lead.message ?? "Not provided"}`,
    "CRM mapping: name -> contact_name, address/location -> property_address, serviceType -> service_type.",
  ].join("\n");
}

function buildLeadInput(company: CompanyRecord, lead: NormalizedLeadIntake): LeadInput {
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
    pipeline_stage: "new_lead",
    priority: "normal",
    estimated_value: 0,
    next_follow_up: null,
    notes: buildLeadNotes(lead),
  };
}

async function resolveSourceMapping(client: CrmClient, lead: NormalizedLeadIntake) {
  const externalSourceId =
    lead.provider === "website" ? lead.websiteUrl : lead.yelpBusinessId;

  return resolveLeadSourceMapping(client, {
    provider: lead.provider,
    externalSourceId,
    business: lead.business,
    location: lead.location,
  });
}

async function findExistingLeadId(client: CrmClient, leadId: string | null) {
  if (!leadId) {
    return null;
  }

  const { data, error } = await client
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

async function findDuplicateIntakeLog({
  client,
  lead,
  externalId,
  requestFingerprint,
}: {
  client: CrmClient;
  lead: NormalizedLeadIntake;
  externalId: string | null;
  requestFingerprint: string;
}) {
  const eventType = LEAD_INTAKE_EVENT_TYPES[lead.provider];
  const columns = "id,related_record_id,status,external_id,request_fingerprint";

  const findBy = async (column: "external_id" | "request_fingerprint", value: string) => {
    const { data, error } = await client
      .from("integration_sync_logs")
      .select(columns)
      .eq("provider", lead.provider)
      .eq("event_type", eventType)
      .eq("related_table", "leads")
      .not("related_record_id", "is", null)
      .in("status", ["succeeded", "skipped"])
      .eq(column, value)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    for (const candidate of (data ?? []) as Pick<
      IntegrationSyncLogRecord,
      "id" | "related_record_id" | "status" | "external_id" | "request_fingerprint"
    >[]) {
      const existingLeadId = await findExistingLeadId(client, candidate.related_record_id);

      if (existingLeadId) {
        return {
          ...candidate,
          related_record_id: existingLeadId,
        };
      }
    }

    return null;
  };

  if (externalId) {
    const duplicateByExternalId = await findBy("external_id", externalId);

    if (duplicateByExternalId) {
      return duplicateByExternalId;
    }
  }

  return findBy("request_fingerprint", requestFingerprint);
}

async function logLeadIntakeSuccess({
  client,
  company,
  lead,
  leadId,
  requestFingerprint,
  externalId,
  warnings,
}: {
  client: CrmClient;
  company: CompanyRecord;
  lead: NormalizedLeadIntake;
  leadId: string;
  requestFingerprint: string;
  externalId: string | null;
  warnings: string[];
}) {
  const now = new Date().toISOString();

  return createIntegrationSyncLog(client, {
    company_id: company.id,
    integration_connection_id: null,
    provider: lead.provider,
    direction: "provider_to_weathertech",
    event_type: LEAD_INTAKE_EVENT_TYPES[lead.provider],
    status: "succeeded",
    related_table: "leads",
    related_record_id: leadId,
    external_id: externalId,
    attempt_count: 1,
    max_attempts: LEAD_INTAKE_MAX_ATTEMPTS,
    last_attempted_at: now,
    completed_at: now,
    request_fingerprint: requestFingerprint,
    request_summary: buildRequestSummary(lead),
    response_summary: sanitizeIntegrationSyncLogSummary({
      leadId,
      companyId: company.id,
      companyName: company.name,
      warnings,
      deduplication: {
        externalId: externalId ? "used" : "not_provided",
        requestFingerprint: "stored",
      },
    }),
  });
}

async function logLeadIntakeDuplicate({
  client,
  company,
  lead,
  duplicateLeadId,
  requestFingerprint,
  externalId,
  warnings,
}: {
  client: CrmClient;
  company: CompanyRecord;
  lead: NormalizedLeadIntake;
  duplicateLeadId: string;
  requestFingerprint: string;
  externalId: string | null;
  warnings: string[];
}) {
  const now = new Date().toISOString();

  return createIntegrationSyncLog(client, {
    company_id: company.id,
    integration_connection_id: null,
    provider: lead.provider,
    direction: "provider_to_weathertech",
    event_type: LEAD_INTAKE_EVENT_TYPES[lead.provider],
    status: "skipped",
    related_table: "leads",
    related_record_id: duplicateLeadId,
    external_id: externalId,
    attempt_count: 1,
    max_attempts: LEAD_INTAKE_MAX_ATTEMPTS,
    last_attempted_at: now,
    completed_at: now,
    request_fingerprint: requestFingerprint,
    request_summary: buildRequestSummary(lead),
    response_summary: sanitizeIntegrationSyncLogSummary({
      duplicate: true,
      duplicateOfLeadId: duplicateLeadId,
      skippedReason: "Duplicate lead intake was ignored.",
      warnings,
    }),
  });
}

async function logLeadIntakeFailure({
  client,
  company,
  lead,
  requestFingerprint,
  externalId,
  error,
}: {
  client: CrmClient;
  company: CompanyRecord;
  lead: NormalizedLeadIntake;
  requestFingerprint: string;
  externalId: string | null;
  error: unknown;
}) {
  const now = new Date().toISOString();
  const message = describeSafeError(error);

  return createIntegrationSyncLog(client, {
    company_id: company.id,
    integration_connection_id: null,
    provider: lead.provider,
    direction: "provider_to_weathertech",
    event_type: LEAD_INTAKE_EVENT_TYPES[lead.provider],
    status: "failed",
    related_table: "leads",
    related_record_id: null,
    external_id: externalId,
    attempt_count: 1,
    max_attempts: LEAD_INTAKE_MAX_ATTEMPTS,
    next_retry_at: null,
    last_attempted_at: now,
    completed_at: now,
    request_fingerprint: requestFingerprint,
    request_summary: buildRequestSummary(lead),
    response_summary: sanitizeIntegrationSyncLogSummary({
      ok: false,
      status: "error",
      provider: lead.provider,
    }),
    error_code: "lead_intake_failed",
    error_message: message,
  });
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

function responseStatusForSuccess(warnings: string[]) {
  return warnings.length > 0 ? "created_with_warning" : "created";
}

function responseStatusForDuplicate(warnings: string[]) {
  return warnings.length > 0 ? "duplicate_with_warning" : "duplicate";
}

export async function processLeadIntake(
  client: CrmClient,
  lead: NormalizedLeadIntake,
  { logOutcome = true }: LeadIntakeProcessOptions = {},
): Promise<LeadIntakeProcessResult> {
  const mappedLead = applyLeadSourceMapping(
    lead,
    await resolveSourceMapping(client, lead),
  );
  const company = await getCompanyForLeadIntake(client, mappedLead.business);

  if (!company) {
    return {
      ok: false,
      provider: mappedLead.provider,
      status: "company_not_found",
      warnings: [`No CRM company record was found for ${mappedLead.business}.`],
    };
  }

  const requestFingerprint = buildLeadIntakeFingerprint(mappedLead);
  const externalId = getLeadIntakeExternalId(mappedLead);
  const duplicate = await findDuplicateIntakeLog({
    client,
    lead: mappedLead,
    externalId,
    requestFingerprint,
  });
  const warnings = [...mappedLead.warnings];

  if (duplicate?.related_record_id) {
    let syncLogId: string | undefined;

    if (logOutcome) {
      try {
        const log = await logLeadIntakeDuplicate({
          client,
          company,
          lead: mappedLead,
          duplicateLeadId: duplicate.related_record_id,
          requestFingerprint,
          externalId,
          warnings,
        });
        syncLogId = log.id;
      } catch (error) {
        warnings.push(
          `Duplicate was detected, but intake duplicate logging failed: ${describeSafeError(error)}`,
        );
      }
    }

    return {
      ok: true,
      provider: mappedLead.provider,
      status: responseStatusForDuplicate(warnings),
      leadId: duplicate.related_record_id,
      duplicateOfLeadId: duplicate.related_record_id,
      syncLogId,
      warnings,
      requestFingerprint,
      externalId,
    };
  }

  try {
    const createdLead = await createLead(client, buildLeadInput(company, mappedLead));
    let syncLogId: string | undefined;

    if (logOutcome) {
      try {
        const log = await logLeadIntakeSuccess({
          client,
          company,
          lead: mappedLead,
          leadId: createdLead.id,
          requestFingerprint,
          externalId,
          warnings,
        });
        syncLogId = log.id;
      } catch (error) {
        warnings.push(
          `Lead was created, but intake success logging failed: ${describeSafeError(error)}`,
        );
      }
    }

    return {
      ok: true,
      provider: mappedLead.provider,
      status: responseStatusForSuccess(warnings),
      leadId: createdLead.id,
      syncLogId,
      warnings,
      requestFingerprint,
      externalId,
    };
  } catch (error) {
    let syncLogId: string | undefined;

    if (logOutcome) {
      try {
        const log = await logLeadIntakeFailure({
          client,
          company,
          lead: mappedLead,
          requestFingerprint,
          externalId,
          error,
        });
        syncLogId = log.id;
      } catch (logError) {
        console.error("[CRM] Lead intake failure logging failed", {
          message: describeSafeError(logError),
        });
      }
    }

    return {
      ok: false,
      provider: mappedLead.provider,
      status: "error",
      syncLogId,
      warnings: [describeSafeError(error)],
      requestFingerprint,
      externalId,
    };
  }
}

function getRetryPayload(log: IntegrationSyncLogRecord): NormalizedLeadIntake | null {
  const summary = log.request_summary;
  const encryptedPayload =
    summary && typeof summary === "object"
      ? summary.retryPayloadEncrypted
      : undefined;
  const legacyPayload =
    summary && typeof summary === "object"
      ? (summary.retryPayload as Record<string, unknown> | undefined)
      : undefined;
  const payload = decryptRetryPayload(encryptedPayload) ?? legacyPayload;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const provider = payload.provider === "website" || payload.provider === "yelp"
    ? payload.provider
    : null;
  const business = payload.business === "IHC" || payload.business === "WeatherTech"
    ? payload.business
    : null;
  const serviceType =
    payload.serviceType === "roofing" ||
    payload.serviceType === "painting" ||
    payload.serviceType === "both"
      ? payload.serviceType
      : null;
  const contactName = getText(payload.contactName, 160);
  const propertyAddress = getText(payload.propertyAddress, 240);

  if (!provider || !business || !serviceType || !contactName || !propertyAddress) {
    return null;
  }

  return {
    provider,
    business,
    source: getText(payload.source, 80) ?? (provider === "website" ? "Website" : "Yelp"),
    contactName,
    phone: normalizePhone(payload.phone),
    email: normalizeEmail(payload.email).email,
    propertyAddress,
    location: getText(payload.location, 160),
    serviceType,
    message: getText(payload.message, 1500),
    externalLeadId: getText(payload.externalLeadId, 160),
    submittedAt: normalizeTimestamp(payload.submittedAt),
    sourceAccount: getText(payload.sourceAccount, 240),
    websiteUrl: getText(payload.websiteUrl, 240),
    yelpBusinessId: getText(payload.yelpBusinessId, 160),
    yelpConversationId: getText(payload.yelpConversationId, 160),
    yelpLeadId: getText(payload.yelpLeadId, 160),
    utmSource: getText(payload.utmSource, 120),
    utmCampaign: getText(payload.utmCampaign, 120),
    utmMedium: getText(payload.utmMedium, 120),
    sourceMappingId: null,
    sourceMappingDisplayName: null,
    sourceMappingMatchType: null,
    warnings: [],
  };
}

export async function retryLeadIntake(
  client: CrmClient,
  syncLogId: string,
): Promise<LeadIntakeResponse> {
  const { data, error } = await client
    .from("integration_sync_logs")
    .select("*")
    .eq("id", syncLogId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      ok: false,
      status: "not_found",
      warnings: ["The intake sync log was not found."],
    };
  }

  const log = data as IntegrationSyncLogRecord;

  if (log.provider !== "website" && log.provider !== "yelp") {
    return {
      ok: false,
      provider: undefined,
      status: "retry_not_allowed",
      warnings: ["Only Website and Yelp lead intake logs can be retried here."],
    };
  }

  if (!canRetryIntegrationSyncLog(log)) {
    return {
      ok: false,
      provider: log.provider,
      status: "retry_not_allowed",
      syncLogId: log.id,
      warnings: ["This intake sync log is not retryable yet."],
    };
  }

  const retryPayload = getRetryPayload(log);

  if (!retryPayload) {
    return {
      ok: false,
      provider: log.provider,
      status: "retry_not_allowed",
      syncLogId: log.id,
      warnings: ["This intake sync log does not include a safe retry payload."],
    };
  }

  const now = new Date();
  const runningLog = await updateIntegrationSyncLog(
    client,
    log.id,
    buildIntegrationSyncPendingUpdate(log, {
      now,
      responseSummary: {
        ...log.response_summary,
        retryRequestedAt: now.toISOString(),
      },
    }),
  );

  const result = await processLeadIntake(client, retryPayload, { logOutcome: false });

  if (result.ok && result.leadId) {
    await updateIntegrationSyncLog(client, log.id, {
      ...buildIntegrationSyncSuccessUpdate(runningLog, {
        now: new Date(),
        responseSummary: {
          ...runningLog.response_summary,
          retryResult: result.status,
          leadId: result.leadId,
          duplicateOfLeadId: result.duplicateOfLeadId ?? null,
        },
      }),
      related_record_id: result.leadId,
      external_id: result.externalId ?? log.external_id,
      request_fingerprint: result.requestFingerprint ?? log.request_fingerprint,
    });

    return {
      ...result,
      status: result.duplicateOfLeadId ? "retry_duplicate" : "retry_succeeded",
      syncLogId: log.id,
      retriedSyncLogId: log.id,
    };
  }

  await updateIntegrationSyncLog(client, log.id, {
    ...buildIntegrationSyncFailedUpdate(runningLog, {
      now: new Date(),
      errorCode: "lead_intake_retry_failed",
      errorMessage: result.warnings.join(" "),
      responseSummary: {
        ...runningLog.response_summary,
        retryResult: result.status,
        warnings: result.warnings,
      },
    }),
    ...(runningLog.attempt_count + 1 < runningLog.max_attempts
      ? buildIntegrationSyncRetryableUpdate(runningLog, {
          now: new Date(),
          retryDelayMinutes: 15,
          errorCode: "lead_intake_retry_failed",
          errorMessage: result.warnings.join(" "),
        })
      : {}),
  });

  return {
    ok: false,
    provider: log.provider,
    status: "retry_failed",
    syncLogId: log.id,
    retriedSyncLogId: log.id,
    warnings: result.warnings,
  };
}

export function getLeadIntakeHttpStatus(result: LeadIntakeResponse) {
  if (result.ok) {
    return result.status.includes("duplicate") ? 200 : 201;
  }

  if (result.status === "validation_failed") {
    return 400;
  }

  if (result.status === "crm_not_configured" || result.status === "company_not_found") {
    return 503;
  }

  if (result.status === "not_found") {
    return 404;
  }

  if (result.status === "retry_not_allowed") {
    return 409;
  }

  return 500;
}
