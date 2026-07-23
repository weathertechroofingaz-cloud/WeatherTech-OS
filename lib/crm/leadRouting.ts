import type { ServiceType } from "./types";

export type CanonicalLeadIntakeProvider =
  | "manual"
  | "website"
  | "yelp"
  | "twilio_call"
  | "twilio_sms"
  | "gohighlevel";

export type CanonicalLeadCompanyKey =
  | "weathertech_roofing"
  | "ihc_painting"
  | "unassigned";

export type CanonicalLeadBranchKey =
  | "weathertech_phoenix"
  | "weathertech_tucson"
  | "ihc"
  | "unassigned";

export type LeadIntakeRoutingStatus =
  | "ready_to_create"
  | "needs_review"
  | "unassigned";

export type LeadIntakeRoutingConfidence =
  | "verified"
  | "inferred"
  | "uncertain";

export type LeadIntakeUrgency = "low" | "normal" | "high" | "urgent";
export type LeadIntakeFollowUpState =
  | "not_required"
  | "required"
  | "scheduled"
  | "completed";
export type LeadIntakeDuplicateConfidence =
  | "exact_match"
  | "likely_match"
  | "possible_match"
  | "no_match";

export type LeadIntakeConsentMetadata = {
  smsConsent: boolean | null;
  emailConsent: boolean | null;
  source: string | null;
  capturedAt: string | null;
};

export type LeadIntakeRoutingDecision = {
  companyKey: CanonicalLeadCompanyKey;
  branchKey: CanonicalLeadBranchKey;
  status: LeadIntakeRoutingStatus;
  confidence: LeadIntakeRoutingConfidence;
  assignedQueue: string | null;
  reasons: string[];
  warnings: string[];
};

export type CanonicalLeadIntake = {
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  fullName: string;
  phone: string | null;
  email: string | null;
  serviceAddress: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  requestedService: ServiceType | null;
  message: string | null;
  preferredContactMethod: "phone" | "sms" | "email" | "unknown";
  leadSource: string;
  sourceDetail: string | null;
  provider: CanonicalLeadIntakeProvider;
  providerExternalId: string | null;
  campaign: string | null;
  companyKey: CanonicalLeadCompanyKey;
  branchKey: CanonicalLeadBranchKey;
  receivingBusinessPhoneNumber: string | null;
  assignedQueue: string | null;
  assignedUserId: string | null;
  intakeTimestamp: string;
  originalSubmissionTimestamp: string | null;
  urgency: LeadIntakeUrgency;
  status: "new" | "needs_review" | "ready_to_create";
  duplicateConfidence: LeadIntakeDuplicateConfidence;
  followUpState: LeadIntakeFollowUpState;
  consentMetadata: LeadIntakeConsentMetadata;
  safeRawSourceReference: string | null;
  routing: LeadIntakeRoutingDecision;
  warnings: string[];
};

export type LeadIntakeAdapterDefinition = {
  provider: CanonicalLeadIntakeProvider;
  label: string;
  status: "active" | "ready" | "setup_required";
  summary: string;
};

export type LeadIntakeBranchDefinition = {
  key: CanonicalLeadBranchKey;
  label: string;
  companyKey: CanonicalLeadCompanyKey;
  queue: string | null;
  status: "active" | "setup_required" | "review_only";
};

export type LeadIntakeDuplicateCandidate = {
  id: string;
  recordType: "lead" | "customer";
  companyId: string | null;
  companyKey?: CanonicalLeadCompanyKey;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  providerExternalId?: string | null;
  source?: string | null;
  createdAt?: string | null;
};

export type LeadIntakeDuplicateMatch = {
  confidence: LeadIntakeDuplicateConfidence;
  candidate: LeadIntakeDuplicateCandidate | null;
  reasons: string[];
  autoMerge: false;
};

type GenericPayload = Record<string, unknown>;

export const leadIntakeAdapterDefinitions: LeadIntakeAdapterDefinition[] = [
  {
    provider: "manual",
    label: "Manual CRM entry",
    status: "active",
    summary: "Normalizes staff-created leads before duplicate and routing review.",
  },
  {
    provider: "website",
    label: "Website forms",
    status: "active",
    summary: "Receives WeatherTech and IHC website submissions through the existing API routes.",
  },
  {
    provider: "yelp",
    label: "Yelp",
    status: "active",
    summary: "Receives Yelp account payloads through the existing Yelp intake route.",
  },
  {
    provider: "twilio_call",
    label: "Twilio calls",
    status: "ready",
    summary: "Prepared for inbound call events after live phone routing is configured.",
  },
  {
    provider: "twilio_sms",
    label: "Twilio SMS",
    status: "ready",
    summary: "Prepared for inbound SMS events after signed webhooks are enabled.",
  },
  {
    provider: "gohighlevel",
    label: "GoHighLevel",
    status: "ready",
    summary: "Prepared for contact and opportunity intake after GHL credentials are configured.",
  },
];

export const leadIntakeRoutingBranches: LeadIntakeBranchDefinition[] = [
  {
    key: "weathertech_phoenix",
    label: "WeatherTech Roofing LLC - Phoenix",
    companyKey: "weathertech_roofing",
    queue: "weathertech-roofing-phoenix",
    status: "setup_required",
  },
  {
    key: "weathertech_tucson",
    label: "WeatherTech Roofing LLC - Tucson",
    companyKey: "weathertech_roofing",
    queue: "weathertech-roofing-tucson",
    status: "setup_required",
  },
  {
    key: "ihc",
    label: "IHC Painting",
    companyKey: "ihc_painting",
    queue: "ihc-painting",
    status: "setup_required",
  },
  {
    key: "unassigned",
    label: "Unassigned review queue",
    companyKey: "unassigned",
    queue: "lead-intake-review",
    status: "review_only",
  },
];

export const leadIntakeDuplicateConfidenceLabels: Record<
  LeadIntakeDuplicateConfidence,
  string
> = {
  exact_match: "Exact match",
  likely_match: "Likely match",
  possible_match: "Possible match",
  no_match: "No match",
};

const providerLabels: Record<CanonicalLeadIntakeProvider, string> = {
  manual: "Manual",
  website: "Website",
  yelp: "Yelp",
  twilio_call: "Twilio call",
  twilio_sms: "Twilio SMS",
  gohighlevel: "GoHighLevel",
};

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

function getToken(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
}

function getSearchText(values: Array<string | null | undefined>) {
  return values.map((value) => getToken(value)).join(" ");
}

export function normalizeLeadIntakePhone(value: unknown) {
  const text = getText(value, 40);

  if (!text) {
    return null;
  }

  const digits = text.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (text.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  const safePhone = text.replace(/[^\d+().\-\s]/g, "").trim();

  return safePhone ? safePhone.slice(0, 40) : null;
}

export function normalizeLeadIntakeEmail(value: unknown) {
  const email = getText(value, 160)?.toLowerCase() ?? null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
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

function normalizeService(value: unknown): ServiceType | null {
  const token = getToken(getText(value, 80));

  if (!token) {
    return null;
  }

  if (token.includes("both") || token.includes("roofandpaint")) {
    return "both";
  }

  if (token.includes("paint") || token.includes("cabinet")) {
    return "painting";
  }

  if (token.includes("roof") || token.includes("tile") || token.includes("underlayment")) {
    return "roofing";
  }

  return null;
}

function splitName(name: string | null) {
  if (!name) {
    return {
      firstName: null,
      lastName: null,
      fullName: "Unknown lead",
    };
  }

  const parts = name.split(/\s+/).filter(Boolean);

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
    fullName: name,
  };
}

function resolveCompanyKey(input: {
  explicitCompany?: string | null;
  requestedService?: ServiceType | null;
  websiteUrl?: string | null;
  yelpBusinessId?: string | null;
  goHighLevelLocation?: string | null;
  sourceDetail?: string | null;
}) {
  const explicit = getToken(input.explicitCompany);
  const searchable = getSearchText([
    input.websiteUrl,
    input.yelpBusinessId,
    input.goHighLevelLocation,
    input.sourceDetail,
  ]);

  if (explicit.includes("ihc")) {
    return {
      companyKey: "ihc_painting" as const,
      confidence: "verified" as const,
      reason: "Explicit company signal selected IHC.",
    };
  }

  if (explicit.includes("weathertech")) {
    return {
      companyKey: "weathertech_roofing" as const,
      confidence: "verified" as const,
      reason: "Explicit company signal selected WeatherTech Roofing LLC.",
    };
  }

  if (searchable.includes("ihc") || searchable.includes("painting")) {
    return {
      companyKey: "ihc_painting" as const,
      confidence: "inferred" as const,
      reason: "Source account metadata points to IHC Painting.",
    };
  }

  if (searchable.includes("weathertech") || searchable.includes("roofing")) {
    return {
      companyKey: "weathertech_roofing" as const,
      confidence: "inferred" as const,
      reason: "Source account metadata points to WeatherTech Roofing LLC.",
    };
  }

  if (input.requestedService === "painting") {
    return {
      companyKey: "ihc_painting" as const,
      confidence: "inferred" as const,
      reason: "Requested service is painting.",
    };
  }

  if (input.requestedService === "roofing") {
    return {
      companyKey: "weathertech_roofing" as const,
      confidence: "inferred" as const,
      reason: "Requested service is roofing.",
    };
  }

  return {
    companyKey: "unassigned" as const,
    confidence: "uncertain" as const,
    reason: "No verified company signal was provided.",
  };
}

function resolveWeatherTechBranch(input: {
  city?: string | null;
  postalCode?: string | null;
  sourceDetail?: string | null;
}) {
  const searchable = getSearchText([input.city, input.postalCode, input.sourceDetail]);
  const postalCode = input.postalCode?.trim() ?? "";

  if (searchable.includes("tucson") || postalCode.startsWith("857")) {
    return {
      branchKey: "weathertech_tucson" as const,
      reason: "Service area signal points to Tucson.",
    };
  }

  if (
    searchable.includes("phoenix") ||
    searchable.includes("scottsdale") ||
    searchable.includes("tempe") ||
    searchable.includes("mesa") ||
    searchable.includes("glendale") ||
    searchable.includes("chandler") ||
    searchable.includes("gilbert") ||
    postalCode.startsWith("850") ||
    postalCode.startsWith("852") ||
    postalCode.startsWith("853")
  ) {
    return {
      branchKey: "weathertech_phoenix" as const,
      reason: "Service area signal points to Phoenix metro.",
    };
  }

  return {
    branchKey: "unassigned" as const,
    reason: "WeatherTech branch could not be verified.",
  };
}

export function routeCanonicalLeadIntake(input: {
  explicitCompany?: string | null;
  requestedService?: ServiceType | null;
  city?: string | null;
  postalCode?: string | null;
  websiteUrl?: string | null;
  yelpBusinessId?: string | null;
  goHighLevelLocation?: string | null;
  sourceDetail?: string | null;
}): LeadIntakeRoutingDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const company = resolveCompanyKey(input);
  let branchKey: CanonicalLeadBranchKey = "unassigned";

  reasons.push(company.reason);

  if (company.companyKey === "ihc_painting") {
    branchKey = "ihc";
    reasons.push("IHC uses the IHC review/dispatch queue.");
  } else if (company.companyKey === "weathertech_roofing") {
    const branch = resolveWeatherTechBranch(input);
    branchKey = branch.branchKey;
    reasons.push(branch.reason);
  }

  const branch = leadIntakeRoutingBranches.find((item) => item.key === branchKey);
  const status =
    company.companyKey === "unassigned" || branchKey === "unassigned"
      ? "needs_review"
      : "ready_to_create";

  if (status === "needs_review") {
    warnings.push(
      "Lead intake routing is uncertain. Keep this item in the review queue before creating production records.",
    );
  }

  return {
    companyKey: company.companyKey,
    branchKey,
    status,
    confidence:
      status === "needs_review" ? "uncertain" : company.confidence,
    assignedQueue:
      status === "needs_review" ? "lead-intake-review" : branch?.queue ?? null,
    reasons,
    warnings,
  };
}

function createCanonicalLeadIntake(input: {
  provider: CanonicalLeadIntakeProvider;
  fullName: string | null;
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  serviceAddress?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  requestedService?: ServiceType | null;
  message?: string | null;
  preferredContactMethod?: CanonicalLeadIntake["preferredContactMethod"];
  leadSource?: string | null;
  sourceDetail?: string | null;
  providerExternalId?: string | null;
  campaign?: string | null;
  explicitCompany?: string | null;
  websiteUrl?: string | null;
  yelpBusinessId?: string | null;
  goHighLevelLocation?: string | null;
  receivingBusinessPhoneNumber?: string | null;
  assignedUserId?: string | null;
  intakeTimestamp?: string;
  originalSubmissionTimestamp?: string | null;
  urgency?: LeadIntakeUrgency;
  consentMetadata?: Partial<LeadIntakeConsentMetadata>;
  safeRawSourceReference?: string | null;
}) {
  const name = splitName(input.fullName);
  const routing = routeCanonicalLeadIntake({
    explicitCompany: input.explicitCompany,
    requestedService: input.requestedService,
    city: input.city,
    postalCode: input.postalCode,
    websiteUrl: input.websiteUrl,
    yelpBusinessId: input.yelpBusinessId,
    goHighLevelLocation: input.goHighLevelLocation,
    sourceDetail: input.sourceDetail,
  });

  return {
    firstName: name.firstName,
    lastName: name.lastName,
    companyName: input.companyName ?? null,
    fullName: name.fullName,
    phone: input.phone ?? null,
    email: input.email ?? null,
    serviceAddress: input.serviceAddress ?? null,
    city: input.city ?? null,
    state: input.state ?? "AZ",
    postalCode: input.postalCode ?? null,
    requestedService: input.requestedService ?? null,
    message: input.message ?? null,
    preferredContactMethod: input.preferredContactMethod ?? "unknown",
    leadSource: input.leadSource ?? providerLabels[input.provider],
    sourceDetail: input.sourceDetail ?? null,
    provider: input.provider,
    providerExternalId: input.providerExternalId ?? null,
    campaign: input.campaign ?? null,
    companyKey: routing.companyKey,
    branchKey: routing.branchKey,
    receivingBusinessPhoneNumber: input.receivingBusinessPhoneNumber ?? null,
    assignedQueue: routing.assignedQueue,
    assignedUserId: input.assignedUserId ?? null,
    intakeTimestamp: input.intakeTimestamp ?? new Date().toISOString(),
    originalSubmissionTimestamp: input.originalSubmissionTimestamp ?? null,
    urgency: input.urgency ?? "normal",
    status: routing.status === "ready_to_create" ? "ready_to_create" : "needs_review",
    duplicateConfidence: "no_match",
    followUpState: "not_required",
    consentMetadata: {
      smsConsent: input.consentMetadata?.smsConsent ?? null,
      emailConsent: input.consentMetadata?.emailConsent ?? null,
      source: input.consentMetadata?.source ?? null,
      capturedAt: input.consentMetadata?.capturedAt ?? null,
    },
    safeRawSourceReference: input.safeRawSourceReference ?? null,
    routing,
    warnings: routing.warnings,
  } satisfies CanonicalLeadIntake;
}

function getExternalId(payload: GenericPayload, keys: string[]) {
  for (const key of keys) {
    const value = getText(payload[key], 160);

    if (value) {
      return value;
    }
  }

  return null;
}

export function normalizeManualLeadIntake(payload: GenericPayload) {
  const name =
    getText(payload.name, 160) ??
    ([getText(payload.firstName, 80), getText(payload.lastName, 80)]
      .filter(Boolean)
      .join(" ") ||
      null);

  return createCanonicalLeadIntake({
    provider: "manual",
    fullName: name,
    companyName: getText(payload.companyName, 160),
    phone: normalizeLeadIntakePhone(payload.phone),
    email: normalizeLeadIntakeEmail(payload.email),
    serviceAddress: getText(payload.address ?? payload.serviceAddress, 240),
    city: getText(payload.city ?? payload.location, 120),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.zip ?? payload.postalCode, 20),
    requestedService: normalizeService(payload.serviceType ?? payload.requestedService),
    message: getText(payload.notes ?? payload.message, 1500),
    preferredContactMethod:
      getToken(getText(payload.preferredContactMethod, 40)).includes("email")
        ? "email"
        : getToken(getText(payload.preferredContactMethod, 40)).includes("sms")
          ? "sms"
          : getToken(getText(payload.preferredContactMethod, 40)).includes("phone")
            ? "phone"
            : "unknown",
    leadSource: getText(payload.source, 80) ?? "Manual",
    sourceDetail: getText(payload.sourceDetail, 240),
    providerExternalId: getExternalId(payload, ["externalLeadId", "id"]),
    campaign: getText(payload.campaign, 160),
    explicitCompany: getText(payload.business ?? payload.company, 120),
    originalSubmissionTimestamp: normalizeTimestamp(payload.submittedAt, payload.timestamp),
  });
}

export function normalizeWebsiteLeadIntake(payload: GenericPayload) {
  const submittedAt = normalizeTimestamp(
    payload.submittedAt,
    payload.timestamp,
    payload.receivedAt,
  );

  return createCanonicalLeadIntake({
    provider: "website",
    fullName: getText(payload.name, 160),
    companyName: getText(payload.companyName, 160),
    phone: normalizeLeadIntakePhone(payload.phone),
    email: normalizeLeadIntakeEmail(payload.email),
    serviceAddress: getText(payload.address ?? payload.serviceAddress, 240),
    city: getText(payload.city ?? payload.location, 120),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.zip ?? payload.postalCode, 20),
    requestedService: normalizeService(payload.serviceType ?? payload.requestedService),
    message: getText(payload.message, 1500),
    preferredContactMethod: "unknown",
    leadSource: getText(payload.source, 80) ?? "Website",
    sourceDetail: getText(payload.websiteUrl, 240),
    providerExternalId: getExternalId(payload, [
      "externalLeadId",
      "leadId",
      "submissionId",
      "formSubmissionId",
      "id",
    ]),
    campaign: getText(payload.utmCampaign ?? payload.campaign, 160),
    explicitCompany: getText(payload.business ?? payload.company, 120),
    websiteUrl: getText(payload.websiteUrl, 240),
    intakeTimestamp: new Date().toISOString(),
    originalSubmissionTimestamp: submittedAt,
    consentMetadata: {
      smsConsent: typeof payload.smsConsent === "boolean" ? payload.smsConsent : null,
      emailConsent:
        typeof payload.emailConsent === "boolean" ? payload.emailConsent : null,
      source: getText(payload.consentSource, 120),
      capturedAt: getText(payload.consentCapturedAt, 80),
    },
  });
}

export function normalizeYelpLeadIntake(payload: GenericPayload) {
  const yelpBusinessId = getText(payload.yelpBusinessId, 160);
  const submittedAt = normalizeTimestamp(
    payload.submittedAt,
    payload.timestamp,
    payload.receivedAt,
  );

  return createCanonicalLeadIntake({
    provider: "yelp",
    fullName: getText(payload.name, 160),
    phone: normalizeLeadIntakePhone(payload.phone),
    email: normalizeLeadIntakeEmail(payload.email),
    serviceAddress: getText(payload.address ?? payload.location, 240),
    city: getText(payload.city ?? payload.location, 120),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.zip ?? payload.postalCode, 20),
    requestedService: normalizeService(payload.serviceType ?? payload.requestedService),
    message: getText(payload.message, 1500),
    leadSource: getText(payload.source, 80) ?? "Yelp",
    sourceDetail: yelpBusinessId,
    providerExternalId: getExternalId(payload, [
      "yelpLeadId",
      "yelpConversationId",
      "externalLeadId",
      "id",
    ]),
    campaign: getText(payload.campaign, 160),
    explicitCompany: getText(payload.business ?? payload.company, 120),
    yelpBusinessId,
    intakeTimestamp: new Date().toISOString(),
    originalSubmissionTimestamp: submittedAt,
  });
}

export function normalizeTwilioCallLeadIntake(payload: GenericPayload) {
  return createCanonicalLeadIntake({
    provider: "twilio_call",
    fullName: getText(payload.callerName ?? payload.name, 160),
    phone: normalizeLeadIntakePhone(payload.from ?? payload.phone),
    serviceAddress: getText(payload.address, 240),
    city: getText(payload.city ?? payload.location, 120),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.zip ?? payload.postalCode, 20),
    requestedService: normalizeService(payload.serviceType ?? payload.requestedService),
    message: getText(payload.transcriptSummary ?? payload.notes, 1500),
    preferredContactMethod: "phone",
    leadSource: "Phone",
    sourceDetail: getText(payload.to ?? payload.receivingBusinessPhoneNumber, 120),
    providerExternalId: getExternalId(payload, ["callSid", "providerEventSid", "id"]),
    campaign: getText(payload.campaign, 160),
    explicitCompany: getText(payload.business ?? payload.company, 120),
    receivingBusinessPhoneNumber: normalizeLeadIntakePhone(
      payload.to ?? payload.receivingBusinessPhoneNumber,
    ),
    originalSubmissionTimestamp: normalizeTimestamp(payload.occurredAt, payload.timestamp),
  });
}

export function normalizeTwilioSmsLeadIntake(payload: GenericPayload) {
  return createCanonicalLeadIntake({
    provider: "twilio_sms",
    fullName: getText(payload.senderName ?? payload.name, 160),
    phone: normalizeLeadIntakePhone(payload.from ?? payload.phone),
    serviceAddress: getText(payload.address, 240),
    city: getText(payload.city ?? payload.location, 120),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.zip ?? payload.postalCode, 20),
    requestedService: normalizeService(payload.serviceType ?? payload.requestedService),
    message: getText(payload.body ?? payload.message, 1500),
    preferredContactMethod: "sms",
    leadSource: "SMS",
    sourceDetail: getText(payload.to ?? payload.receivingBusinessPhoneNumber, 120),
    providerExternalId: getExternalId(payload, [
      "messageSid",
      "smsSid",
      "providerEventSid",
      "id",
    ]),
    campaign: getText(payload.campaign, 160),
    explicitCompany: getText(payload.business ?? payload.company, 120),
    receivingBusinessPhoneNumber: normalizeLeadIntakePhone(
      payload.to ?? payload.receivingBusinessPhoneNumber,
    ),
    originalSubmissionTimestamp: normalizeTimestamp(payload.occurredAt, payload.timestamp),
  });
}

export function normalizeGoHighLevelLeadIntake(payload: GenericPayload) {
  const name =
    getText(payload.name, 160) ??
    ([getText(payload.firstName, 80), getText(payload.lastName, 80)]
      .filter(Boolean)
      .join(" ") ||
      null);

  return createCanonicalLeadIntake({
    provider: "gohighlevel",
    fullName: name,
    companyName: getText(payload.companyName, 160),
    phone: normalizeLeadIntakePhone(payload.phone),
    email: normalizeLeadIntakeEmail(payload.email),
    serviceAddress: getText(payload.address ?? payload.serviceAddress, 240),
    city: getText(payload.city ?? payload.location, 120),
    state: getText(payload.state, 40) ?? "AZ",
    postalCode: getText(payload.zip ?? payload.postalCode, 20),
    requestedService: normalizeService(payload.serviceType ?? payload.requestedService),
    message: getText(payload.message ?? payload.notes, 1500),
    preferredContactMethod: "unknown",
    leadSource: getText(payload.source, 80) ?? "GoHighLevel",
    sourceDetail: getText(payload.locationId ?? payload.locationName, 180),
    providerExternalId: getExternalId(payload, [
      "contactId",
      "opportunityId",
      "externalLeadId",
      "id",
    ]),
    campaign: getText(payload.campaign, 160),
    explicitCompany: getText(payload.business ?? payload.company, 120),
    goHighLevelLocation: getText(payload.locationId ?? payload.locationName, 180),
    originalSubmissionTimestamp: normalizeTimestamp(payload.updatedAt, payload.createdAt),
  });
}

function normalizeDuplicatePhone(value: string | null | undefined) {
  return value?.replace(/\D/g, "") ?? "";
}

function normalizeDuplicateText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function isSamePhone(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeDuplicatePhone(left);
  const normalizedRight = normalizeDuplicatePhone(right);

  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function isSameText(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeDuplicateText(left);
  const normalizedRight = normalizeDuplicateText(right);

  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function scoreDuplicateCandidate(
  intake: CanonicalLeadIntake,
  candidate: LeadIntakeDuplicateCandidate,
): LeadIntakeDuplicateMatch {
  const reasons: string[] = [];
  const sameExternalId = Boolean(
    intake.providerExternalId &&
      candidate.providerExternalId &&
      intake.providerExternalId === candidate.providerExternalId,
  );
  const samePhone = isSamePhone(intake.phone, candidate.phone);
  const sameEmail = isSameText(intake.email, candidate.email);
  const sameAddress = isSameText(intake.serviceAddress, candidate.address);
  const sameName = isSameText(intake.fullName, candidate.name);

  if (sameExternalId) {
    reasons.push("Provider external ID already exists.");

    return {
      confidence: "exact_match",
      candidate,
      reasons,
      autoMerge: false,
    };
  }

  if ((samePhone || sameEmail) && sameAddress) {
    reasons.push("Contact and service address match an existing record.");

    return {
      confidence: "exact_match",
      candidate,
      reasons,
      autoMerge: false,
    };
  }

  if (samePhone || sameEmail) {
    reasons.push("Phone or email matches an existing record.");

    return {
      confidence: "likely_match",
      candidate,
      reasons,
      autoMerge: false,
    };
  }

  if (sameAddress || (sameName && Boolean(intake.city && candidate.address))) {
    reasons.push("Name or address resembles an existing record.");

    return {
      confidence: "possible_match",
      candidate,
      reasons,
      autoMerge: false,
    };
  }

  return {
    confidence: "no_match",
    candidate: null,
    reasons: [],
    autoMerge: false,
  };
}

const duplicateConfidenceRank: Record<LeadIntakeDuplicateConfidence, number> = {
  exact_match: 3,
  likely_match: 2,
  possible_match: 1,
  no_match: 0,
};

export function detectLeadIntakeDuplicates(
  intake: CanonicalLeadIntake,
  candidates: LeadIntakeDuplicateCandidate[],
) {
  return candidates
    .map((candidate) => scoreDuplicateCandidate(intake, candidate))
    .filter((match) => match.confidence !== "no_match")
    .sort(
      (left, right) =>
        duplicateConfidenceRank[right.confidence] -
        duplicateConfidenceRank[left.confidence],
    );
}

export function getStrongestLeadIntakeDuplicateConfidence(
  matches: LeadIntakeDuplicateMatch[],
): LeadIntakeDuplicateConfidence {
  return matches[0]?.confidence ?? "no_match";
}

export const leadIntakeDuplicatePolicy = {
  autoMerge: false,
  exactProviderOrFingerprintDuplicatesSkipLeadCreation: true,
  possibleCustomerMatchesRequireManualReview: true,
  crossCompanyMatchesDoNotLinkAutomatically: true,
} as const;
