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
  detectLeadIntakeDuplicates,
  getStrongestLeadIntakeDuplicateConfidence,
  normalizeWebsiteLeadIntake,
  normalizeYelpLeadIntake,
  routeCanonicalLeadIntake,
  type CanonicalLeadCompanyKey,
  type CanonicalLeadIntake,
  type CanonicalLeadBranchKey,
  type LeadIntakeDuplicateConfidence,
  type LeadIntakeDuplicateMatch,
  type LeadIntakeRoutingConfidence,
  type LeadIntakeRoutingStatus,
  type LeadIntakeUrgency,
} from "./leadRouting";
import {
  createIntegrationSyncLog,
  createLead,
  updateIntegrationSyncLog,
} from "./repository";
import type {
  CompanyRecord,
  CustomerRecord,
  Database,
  IntegrationProvider,
  IntegrationSyncLogRecord,
  LeadIntakeRecordInput,
  LeadInput,
  LeadRecord,
  ServiceType,
} from "./types";

type CrmClient = SupabaseClient<Database>;
type BusinessKey = "IHC" | "WeatherTech" | "Unassigned";
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
  | "routing_needs_review"
  | "accepted_for_review"
  | "migration_required"
  | "not_found"
  | "error";

export type LeadIntakeResponse = {
  ok: boolean;
  status: LeadIntakeResponseStatus;
  provider?: LeadIntakeProvider;
  leadId?: string;
  duplicateOfLeadId?: string;
  intakeRecordId?: string;
  syncLogId?: string;
  retriedSyncLogId?: string;
  routing?: LeadIntakeResponseRouting;
  duplicateConfidence?: LeadIntakeDuplicateConfidence;
  warnings: string[];
};

type LeadIntakeResponseRouting = {
  company: CanonicalLeadCompanyKey;
  branch: CanonicalLeadBranchKey;
  status: LeadIntakeRoutingStatus;
  confidence: LeadIntakeRoutingConfidence;
  assignedQueue: string | null;
};

type NormalizedLeadIntake = {
  provider: LeadIntakeProvider;
  business: BusinessKey;
  companyKey: CanonicalLeadCompanyKey;
  branchKey: CanonicalLeadBranchKey;
  routingStatus: LeadIntakeRoutingStatus;
  routingConfidence: LeadIntakeRoutingConfidence;
  routingReasons: string[];
  assignedQueue: string | null;
  source: string;
  contactName: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  phone: string | null;
  email: string | null;
  propertyAddress: string;
  location: string | null;
  state: string | null;
  postalCode: string | null;
  serviceType: ServiceType;
  message: string | null;
  preferredContactMethod: CanonicalLeadIntake["preferredContactMethod"];
  externalLeadId: string | null;
  submittedAt: string;
  sourceAccount: string | null;
  campaign: string | null;
  receivingBusinessPhoneNumber: string | null;
  assignedUserId: string | null;
  urgency: LeadIntakeUrgency;
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
  duplicateConfidence: LeadIntakeDuplicateConfidence;
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

function businessFromCompanyKey(companyKey: CanonicalLeadCompanyKey): BusinessKey {
  if (companyKey === "ihc_painting") {
    return "IHC";
  }

  if (companyKey === "weathertech_roofing") {
    return "WeatherTech";
  }

  return "Unassigned";
}

function companyKeyFromBusiness(business: BusinessKey): CanonicalLeadCompanyKey {
  if (business === "IHC") {
    return "ihc_painting";
  }

  if (business === "WeatherTech") {
    return "weathertech_roofing";
  }

  return "unassigned";
}

function branchLabel(branchKey: CanonicalLeadBranchKey) {
  const labels: Record<CanonicalLeadBranchKey, string> = {
    weathertech_phoenix: "WeatherTech Phoenix",
    weathertech_tucson: "WeatherTech Tucson",
    ihc: "IHC",
    unassigned: "Unassigned",
  };

  return labels[branchKey];
}

function responseRouting(lead: NormalizedLeadIntake): LeadIntakeResponseRouting {
  return {
    company: lead.companyKey,
    branch: lead.branchKey,
    status: lead.routingStatus,
    confidence: lead.routingConfidence,
    assignedQueue: lead.assignedQueue,
  };
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
  const nextBusiness = mappedBusiness ?? lead.business;
  const nextCompanyKey = companyKeyFromBusiness(nextBusiness);
  const nextRouting = routeCanonicalLeadIntake({
    explicitCompany: resolution.mapping.business,
    requestedService: lead.serviceType,
    city: mappedLocation,
    postalCode: lead.postalCode,
    websiteUrl: lead.websiteUrl,
    yelpBusinessId: lead.yelpBusinessId,
    sourceDetail: resolution.mapping.external_source_id ?? resolution.mapping.display_name,
  });
  const defaultAddress =
    lead.provider === "website" ? DEFAULT_WEBSITE_ADDRESS : DEFAULT_YELP_ADDRESS;
  const shouldUseMappedAddress =
    !lead.propertyAddress ||
    lead.propertyAddress === defaultAddress ||
    lead.propertyAddress === lead.location;

  return {
    ...lead,
    business: nextBusiness,
    companyKey: nextCompanyKey,
    branchKey: nextRouting.branchKey,
    routingStatus: nextRouting.status,
    routingConfidence: nextRouting.confidence,
    routingReasons: [...lead.routingReasons, ...nextRouting.reasons],
    assignedQueue: nextRouting.assignedQueue,
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
  const canonical = normalizeWebsiteLeadIntake(body as Record<string, unknown>);
  const rawName = canonical.fullName === "Unknown lead" ? null : canonical.fullName;
  const phone = canonical.phone ?? normalizePhone(body.phone);
  const { email, warning: emailWarning } = normalizeEmail(body.email);
  const business = businessFromCompanyKey(canonical.companyKey);

  if (emailWarning) {
    warnings.push(emailWarning);
  }

  warnings.push(...canonical.warnings);

  if (!rawName && !phone && !email) {
    errors.push("At least one contact field is required: name, phone, or email.");
  }

  if (errors.length > 0) {
    return { lead: null, errors, warnings };
  }

  const location = canonical.city ?? getText(body.location, 160);
  const address = canonical.serviceAddress ?? location ?? DEFAULT_WEBSITE_ADDRESS;
  const { serviceType, warning: serviceWarning } = normalizeServiceType(
    body.serviceType,
    business === "Unassigned" ? "WeatherTech" : business,
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
      business,
      companyKey: canonical.companyKey,
      branchKey: canonical.branchKey,
      routingStatus: canonical.routing.status,
      routingConfidence: canonical.routing.confidence,
      routingReasons: canonical.routing.reasons,
      assignedQueue: canonical.assignedQueue,
      source: normalizeSource(body.source, "website"),
      contactName: rawName ?? phone ?? email ?? "Website lead",
      firstName: canonical.firstName,
      lastName: canonical.lastName,
      companyName: canonical.companyName,
      phone,
      email,
      propertyAddress: address,
      location,
      state: canonical.state,
      postalCode: canonical.postalCode,
      serviceType,
      message: getText(body.message, 1500),
      externalLeadId: normalizeWebsiteExternalLeadId(body),
      submittedAt: normalizeTimestamp(body.submittedAt, body.timestamp, body.receivedAt),
      sourceAccount: getText(body.websiteUrl, 240),
      campaign: canonical.campaign,
      receivingBusinessPhoneNumber: canonical.receivingBusinessPhoneNumber,
      assignedUserId: canonical.assignedUserId,
      urgency: canonical.urgency,
      preferredContactMethod: canonical.preferredContactMethod,
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
      duplicateConfidence: "no_match",
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
  const canonical = normalizeYelpLeadIntake(body as Record<string, unknown>);
  const rawName = canonical.fullName === "Unknown lead" ? null : canonical.fullName;
  const phone = canonical.phone ?? normalizePhone(body.phone);
  const { email, warning: emailWarning } = normalizeEmail(body.email);
  const message = canonical.message ?? getText(body.message, 1500);
  const business = businessFromCompanyKey(canonical.companyKey);

  if (emailWarning) {
    warnings.push(emailWarning);
  }

  warnings.push(...canonical.warnings);

  if (!rawName && !phone && !email && !message) {
    errors.push(
      "At least one contact field is required: name, phone, email, or message.",
    );
  }

  if (errors.length > 0) {
    return { lead: null, errors, warnings };
  }

  const location = canonical.city ?? getText(body.location, 160);
  const { serviceType, warning: serviceWarning } = normalizeServiceType(
    body.serviceType,
    business === "Unassigned" ? "WeatherTech" : business,
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
      business,
      companyKey: canonical.companyKey,
      branchKey: canonical.branchKey,
      routingStatus: canonical.routing.status,
      routingConfidence: canonical.routing.confidence,
      routingReasons: canonical.routing.reasons,
      assignedQueue: canonical.assignedQueue,
      source: normalizeSource(body.source, "yelp"),
      contactName: rawName ?? phone ?? email ?? "Yelp lead",
      firstName: canonical.firstName,
      lastName: canonical.lastName,
      companyName: canonical.companyName,
      phone,
      email,
      propertyAddress: canonical.serviceAddress ?? location ?? DEFAULT_YELP_ADDRESS,
      location,
      state: canonical.state,
      postalCode: canonical.postalCode,
      serviceType,
      message,
      externalLeadId: yelpLeadId ?? yelpConversationId,
      submittedAt: normalizeTimestamp(body.submittedAt, body.timestamp, body.receivedAt),
      sourceAccount:
        business === "Unassigned"
          ? getText(body.yelpBusinessId, 160)
          : getYelpAccountLabel(body, business),
      campaign: canonical.campaign,
      receivingBusinessPhoneNumber: canonical.receivingBusinessPhoneNumber,
      assignedUserId: canonical.assignedUserId,
      urgency: canonical.urgency,
      preferredContactMethod: canonical.preferredContactMethod,
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
      duplicateConfidence: "no_match",
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
  if (business === "Unassigned") {
    return null;
  }

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

function isMissingLeadIntakeRecordsTable(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" ? candidate.message : "";

  return (
    candidate.code === "42P01" ||
    message.includes("lead_intake_records") ||
    message.includes("Could not find the table")
  );
}

function buildIntakeRecordMetadata(
  lead: NormalizedLeadIntake,
  matches: LeadIntakeDuplicateMatch[],
) {
  return {
    sourceMapping: {
      id: lead.sourceMappingId,
      displayName: lead.sourceMappingDisplayName,
      matchType: lead.sourceMappingMatchType,
    },
    duplicatePolicy: {
      autoMerge: false,
      confidence: lead.duplicateConfidence,
    },
    duplicateMatches: matches.slice(0, 6).map((match) => ({
      confidence: match.confidence,
      recordType: match.candidate?.recordType ?? null,
      recordId: match.candidate?.id ?? null,
      reasons: match.reasons,
      autoMerge: false,
    })),
  };
}

async function tryCreateLeadIntakeRecord({
  client,
  company,
  lead,
  status,
  linkedLeadId = null,
  duplicateMatches = [],
  syncLogId = null,
  reviewNotes = null,
}: {
  client: CrmClient;
  company: CompanyRecord | null;
  lead: NormalizedLeadIntake;
  status:
    | "new"
    | "needs_review"
    | "lead_created"
    | "duplicate"
    | "non_lead"
    | "dismissed";
  linkedLeadId?: string | null;
  duplicateMatches?: LeadIntakeDuplicateMatch[];
  syncLogId?: string | null;
  reviewNotes?: string | null;
}) {
  const insert: LeadIntakeRecordInput = {
    company_id: company?.id ?? null,
    linked_lead_id: linkedLeadId,
    integration_sync_log_id: syncLogId,
    provider: lead.provider,
    provider_event_id: lead.externalLeadId,
    source: lead.source,
    source_detail: lead.sourceAccount,
    campaign: lead.campaign,
    company_key: lead.companyKey,
    branch_key: lead.branchKey,
    routing_status: lead.routingStatus,
    status,
    duplicate_confidence: lead.duplicateConfidence,
    follow_up_state: lead.routingStatus === "needs_review" ? "required" : "not_required",
    urgency: lead.urgency,
    assigned_queue: lead.assignedQueue,
    assigned_user_id: lead.assignedUserId,
    first_name: lead.firstName,
    last_name: lead.lastName,
    contact_name: lead.contactName,
    company_name: lead.companyName,
    phone: lead.phone,
    email: lead.email,
    service_address: lead.propertyAddress,
    city: lead.location,
    state: lead.state ?? "AZ",
    postal_code: lead.postalCode,
    requested_service: lead.serviceType,
    message: lead.message,
    preferred_contact_method: lead.preferredContactMethod,
    receiving_business_phone_number: lead.receivingBusinessPhoneNumber,
    source_metadata: buildIntakeRecordMetadata(lead, duplicateMatches),
    possible_matches: duplicateMatches.slice(0, 6).map((match) => ({
      confidence: match.confidence,
      recordType: match.candidate?.recordType ?? null,
      recordId: match.candidate?.id ?? null,
      name: match.candidate?.name ?? null,
      reasons: match.reasons,
    })),
    routing_reasons: lead.routingReasons,
    review_notes: reviewNotes,
    intake_timestamp: new Date().toISOString(),
    original_submission_timestamp: lead.submittedAt,
  };

  const { data, error } = await client
    .from("lead_intake_records")
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    if (isMissingLeadIntakeRecordsTable(error)) {
      return {
        status: "missing_table" as const,
        id: null,
        warning:
          "Lead intake review record was not stored because migration 0022 has not been applied.",
      };
    }

    throw error;
  }

  return {
    status: "created" as const,
    id: data?.id ?? null,
    warning: null,
  };
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
    companyKey: lead.companyKey,
    branchKey: lead.branchKey,
    routingStatus: lead.routingStatus,
    routingConfidence: lead.routingConfidence,
    routingReasons: lead.routingReasons,
    assignedQueue: lead.assignedQueue,
    source: lead.source,
    contactName: lead.contactName,
    firstName: lead.firstName,
    lastName: lead.lastName,
    companyName: lead.companyName,
    phone: lead.phone,
    email: lead.email,
    propertyAddress: lead.propertyAddress,
    location: lead.location,
    state: lead.state,
    postalCode: lead.postalCode,
    serviceType: lead.serviceType,
    message: lead.message,
    preferredContactMethod: lead.preferredContactMethod,
    externalLeadId: lead.externalLeadId,
    submittedAt: lead.submittedAt,
    sourceAccount: lead.sourceAccount,
    campaign: lead.campaign,
    receivingBusinessPhoneNumber: lead.receivingBusinessPhoneNumber,
    assignedUserId: lead.assignedUserId,
    urgency: lead.urgency,
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
    companyKey: lead.companyKey,
    branchKey: lead.branchKey,
    routingStatus: lead.routingStatus,
    routingConfidence: lead.routingConfidence,
    assignedQueue: lead.assignedQueue,
    source: lead.source,
    sourceAccount: lead.sourceAccount,
    campaign: lead.campaign,
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
    duplicate: {
      confidence: lead.duplicateConfidence,
      autoMerge: false,
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
    `Company routing: ${lead.companyKey}`,
    `Branch routing: ${branchLabel(lead.branchKey)}`,
    `Routing status: ${lead.routingStatus}`,
    `Assigned queue: ${lead.assignedQueue ?? "Unassigned review"}`,
    `Routing reasons: ${lead.routingReasons.join(" | ") || "Not provided"}`,
    `Duplicate confidence: ${lead.duplicateConfidence}`,
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
    state: lead.state ?? "AZ",
    postal_code: lead.postalCode,
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

function toDuplicateCandidateFromLead(lead: LeadRecord) {
  return {
    id: lead.id,
    recordType: "lead" as const,
    companyId: lead.company_id,
    name: lead.contact_name,
    phone: lead.phone,
    email: lead.email,
    address: lead.property_address,
    source: lead.source,
    createdAt: lead.created_at,
  };
}

function toDuplicateCandidateFromCustomer(customer: CustomerRecord) {
  return {
    id: customer.id,
    recordType: "customer" as const,
    companyId: customer.company_id,
    name: customer.display_name || customer.contact_name,
    phone: customer.phone,
    email: customer.email,
    address: customer.property_address,
    source: "Customer",
    createdAt: customer.created_at,
  };
}

function toCanonicalForDuplicateCheck(
  lead: NormalizedLeadIntake,
): CanonicalLeadIntake {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    companyName: lead.companyName,
    fullName: lead.contactName,
    phone: lead.phone,
    email: lead.email,
    serviceAddress: lead.propertyAddress,
    city: lead.location,
    state: lead.state,
    postalCode: lead.postalCode,
    requestedService: lead.serviceType,
    message: lead.message,
    preferredContactMethod: lead.preferredContactMethod,
    leadSource: lead.source,
    sourceDetail: lead.sourceAccount,
    provider: lead.provider,
    providerExternalId: lead.externalLeadId,
    campaign: lead.campaign,
    companyKey: lead.companyKey,
    branchKey: lead.branchKey,
    receivingBusinessPhoneNumber: lead.receivingBusinessPhoneNumber,
    assignedQueue: lead.assignedQueue,
    assignedUserId: lead.assignedUserId,
    intakeTimestamp: new Date().toISOString(),
    originalSubmissionTimestamp: lead.submittedAt,
    urgency: lead.urgency,
    status: lead.routingStatus === "ready_to_create" ? "ready_to_create" : "needs_review",
    duplicateConfidence: lead.duplicateConfidence,
    followUpState: "not_required",
    consentMetadata: {
      smsConsent: null,
      emailConsent: null,
      source: null,
      capturedAt: null,
    },
    safeRawSourceReference: null,
    routing: {
      companyKey: lead.companyKey,
      branchKey: lead.branchKey,
      status: lead.routingStatus,
      confidence: lead.routingConfidence,
      assignedQueue: lead.assignedQueue,
      reasons: lead.routingReasons,
      warnings: lead.warnings,
    },
    warnings: lead.warnings,
  };
}

async function findCrmDuplicateMatches(
  client: CrmClient,
  company: CompanyRecord,
  lead: NormalizedLeadIntake,
) {
  const [leadRows, customerRows] = await Promise.all([
    client
      .from("leads")
      .select("*")
      .eq("company_id", company.id)
      .order("updated_at", { ascending: false })
      .limit(250),
    client
      .from("customers")
      .select("*")
      .eq("company_id", company.id)
      .order("updated_at", { ascending: false })
      .limit(250),
  ]);

  if (leadRows.error) {
    throw leadRows.error;
  }

  if (customerRows.error) {
    throw customerRows.error;
  }

  return detectLeadIntakeDuplicates(toCanonicalForDuplicateCheck(lead), [
    ...((leadRows.data ?? []) as LeadRecord[]).map(toDuplicateCandidateFromLead),
    ...((customerRows.data ?? []) as CustomerRecord[]).map(
      toDuplicateCandidateFromCustomer,
    ),
  ]);
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
  let mappedLead = applyLeadSourceMapping(
    lead,
    await resolveSourceMapping(client, lead),
  );
  const requestFingerprint = buildLeadIntakeFingerprint(mappedLead);
  const externalId = getLeadIntakeExternalId(mappedLead);
  const company = await getCompanyForLeadIntake(client, mappedLead.business);

  if (!company || mappedLead.routingStatus !== "ready_to_create") {
    try {
      const intakeRecord = await tryCreateLeadIntakeRecord({
        client,
        company,
        lead: mappedLead,
        status: "needs_review",
        reviewNotes:
          mappedLead.business === "Unassigned"
            ? "Company routing is unassigned. Review before creating a CRM lead."
            : "Branch routing is unassigned. Review before creating a CRM lead.",
      });

      if (intakeRecord.status === "missing_table") {
        return {
          ok: false,
          provider: mappedLead.provider,
          status: "migration_required",
          routing: responseRouting(mappedLead),
          duplicateConfidence: mappedLead.duplicateConfidence,
          warnings: [
            intakeRecord.warning,
            "Migration 0022 is required before uncertain intake can be safely retained for review.",
          ],
          requestFingerprint,
          externalId,
        };
      }

      return {
        ok: true,
        provider: mappedLead.provider,
        status: "accepted_for_review",
        intakeRecordId: intakeRecord.id ?? undefined,
        routing: responseRouting(mappedLead),
        duplicateConfidence: mappedLead.duplicateConfidence,
        warnings: mappedLead.warnings,
        requestFingerprint,
        externalId,
      };
    } catch (error) {
      return {
        ok: false,
        provider: mappedLead.provider,
        status: "routing_needs_review",
        routing: responseRouting(mappedLead),
        duplicateConfidence: mappedLead.duplicateConfidence,
        warnings: [describeSafeError(error)],
        requestFingerprint,
        externalId,
      };
    }
  }

  if (!company) {
    return {
      ok: false,
      provider: mappedLead.provider,
      status: "company_not_found",
      warnings: [`No CRM company record was found for ${mappedLead.business}.`],
    };
  }

  const duplicate = await findDuplicateIntakeLog({
    client,
    lead: mappedLead,
    externalId,
    requestFingerprint,
  });
  const duplicateMatches = await findCrmDuplicateMatches(client, company, mappedLead);
  const duplicateConfidence =
    duplicate?.related_record_id
      ? "exact_match"
      : getStrongestLeadIntakeDuplicateConfidence(duplicateMatches);
  mappedLead = {
    ...mappedLead,
    duplicateConfidence,
  };
  const exactLeadMatch = duplicateMatches.find(
    (match) =>
      match.confidence === "exact_match" && match.candidate?.recordType === "lead",
  );
  const warnings = [...mappedLead.warnings];

  if (duplicate?.related_record_id || exactLeadMatch?.candidate?.id) {
    const duplicateLeadId =
      duplicate?.related_record_id ?? exactLeadMatch?.candidate?.id ?? "";
    let syncLogId: string | undefined;
    let intakeRecordId: string | undefined;

    if (logOutcome) {
      try {
        const log = await logLeadIntakeDuplicate({
          client,
          company,
          lead: mappedLead,
          duplicateLeadId,
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

    try {
      const intakeRecord = await tryCreateLeadIntakeRecord({
        client,
        company,
        lead: mappedLead,
        status: "duplicate",
        linkedLeadId: duplicateLeadId,
        duplicateMatches,
        syncLogId: syncLogId ?? null,
        reviewNotes: "Duplicate lead creation skipped. Manual review can link records if needed.",
      });

      if (intakeRecord.status === "created" && intakeRecord.id) {
        intakeRecordId = intakeRecord.id;
      } else if (intakeRecord.warning) {
        warnings.push(intakeRecord.warning);
      }
    } catch (error) {
      warnings.push(
        `Duplicate was detected, but intake review record creation failed: ${describeSafeError(error)}`,
      );
    }

    return {
      ok: true,
      provider: mappedLead.provider,
      status: responseStatusForDuplicate(warnings),
      leadId: duplicateLeadId,
      duplicateOfLeadId: duplicateLeadId,
      intakeRecordId,
      syncLogId,
      routing: responseRouting(mappedLead),
      duplicateConfidence,
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

    let intakeRecordId: string | undefined;

    try {
      const intakeRecord = await tryCreateLeadIntakeRecord({
        client,
        company,
        lead: mappedLead,
        status: "lead_created",
        linkedLeadId: createdLead.id,
        duplicateMatches,
        syncLogId: syncLogId ?? null,
        reviewNotes:
          duplicateConfidence === "no_match"
            ? null
            : "Possible existing record found. No records were merged automatically.",
      });

      if (intakeRecord.status === "created" && intakeRecord.id) {
        intakeRecordId = intakeRecord.id;
      } else if (intakeRecord.warning) {
        warnings.push(intakeRecord.warning);
      }
    } catch (error) {
      warnings.push(
        `Lead was created, but intake review record creation failed: ${describeSafeError(error)}`,
      );
    }

    return {
      ok: true,
      provider: mappedLead.provider,
      status: responseStatusForSuccess(warnings),
      leadId: createdLead.id,
      intakeRecordId,
      syncLogId,
      routing: responseRouting(mappedLead),
      duplicateConfidence,
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
      routing: responseRouting(mappedLead),
      duplicateConfidence,
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
    : payload.business === "Unassigned"
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

  const companyKey =
    payload.companyKey === "weathertech_roofing" ||
    payload.companyKey === "ihc_painting" ||
    payload.companyKey === "unassigned"
      ? payload.companyKey
      : companyKeyFromBusiness(business);
  const route = routeCanonicalLeadIntake({
    explicitCompany: business,
    requestedService: serviceType,
    city: getText(payload.location, 160),
    postalCode: getText(payload.postalCode, 20),
    websiteUrl: getText(payload.websiteUrl, 240),
    yelpBusinessId: getText(payload.yelpBusinessId, 160),
    sourceDetail: getText(payload.sourceAccount, 240),
  });
  const branchKey =
    payload.branchKey === "weathertech_phoenix" ||
    payload.branchKey === "weathertech_tucson" ||
    payload.branchKey === "ihc" ||
    payload.branchKey === "unassigned"
      ? payload.branchKey
      : route.branchKey;

  return {
    provider,
    business,
    companyKey,
    branchKey,
    routingStatus:
      payload.routingStatus === "ready_to_create" ||
      payload.routingStatus === "needs_review" ||
      payload.routingStatus === "unassigned"
        ? payload.routingStatus
        : route.status,
    routingConfidence:
      payload.routingConfidence === "verified" ||
      payload.routingConfidence === "inferred" ||
      payload.routingConfidence === "uncertain"
        ? payload.routingConfidence
        : route.confidence,
    routingReasons: Array.isArray(payload.routingReasons)
      ? payload.routingReasons.filter((value): value is string => typeof value === "string")
      : route.reasons,
    assignedQueue: getText(payload.assignedQueue, 120) ?? route.assignedQueue,
    source: getText(payload.source, 80) ?? (provider === "website" ? "Website" : "Yelp"),
    contactName,
    firstName: getText(payload.firstName, 80),
    lastName: getText(payload.lastName, 120),
    companyName: getText(payload.companyName, 160),
    phone: normalizePhone(payload.phone),
    email: normalizeEmail(payload.email).email,
    propertyAddress,
    location: getText(payload.location, 160),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.postalCode, 20),
    serviceType,
    message: getText(payload.message, 1500),
    preferredContactMethod:
      payload.preferredContactMethod === "phone" ||
      payload.preferredContactMethod === "sms" ||
      payload.preferredContactMethod === "email" ||
      payload.preferredContactMethod === "unknown"
        ? payload.preferredContactMethod
        : "unknown",
    externalLeadId: getText(payload.externalLeadId, 160),
    submittedAt: normalizeTimestamp(payload.submittedAt),
    sourceAccount: getText(payload.sourceAccount, 240),
    campaign: getText(payload.campaign, 160),
    receivingBusinessPhoneNumber: getText(payload.receivingBusinessPhoneNumber, 40),
    assignedUserId: getText(payload.assignedUserId, 80),
    urgency:
      payload.urgency === "low" ||
      payload.urgency === "normal" ||
      payload.urgency === "high" ||
      payload.urgency === "urgent"
        ? payload.urgency
        : "normal",
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
    duplicateConfidence: "no_match",
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
    if (result.status === "accepted_for_review") {
      return 202;
    }

    return result.status.includes("duplicate") ? 200 : 201;
  }

  if (result.status === "validation_failed") {
    return 400;
  }

  if (
    result.status === "crm_not_configured" ||
    result.status === "company_not_found" ||
    result.status === "migration_required"
  ) {
    return 503;
  }

  if (result.status === "routing_needs_review") {
    return 409;
  }

  if (result.status === "not_found") {
    return 404;
  }

  if (result.status === "retry_not_allowed") {
    return 409;
  }

  return 500;
}
