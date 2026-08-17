export const canonicalAttributionSourceKeys = [
  "website",
  "google",
  "yelp",
  "phone",
  "email",
  "referral",
  "repeat_customer",
  "manual",
  "other",
  "unknown",
] as const;

export type AttributionSourceKey =
  (typeof canonicalAttributionSourceKeys)[number];

export type AttributionReviewStatus =
  | "verified"
  | "needs_review"
  | "unattributed";

export type AttributionEvidenceKind =
  | "provider_verified"
  | "provider_metadata"
  | "staff_selected"
  | "customer_stated"
  | "repeat_customer"
  | "insufficient";

export type AttributionResolution = {
  sourceKey: AttributionSourceKey;
  sourceDetail: string | null;
  intakeProvider: string | null;
  evidenceKind: AttributionEvidenceKind;
  reviewStatus: AttributionReviewStatus;
  shouldLock: boolean;
};

export type LeadAcquisitionEvidence = {
  explicitSourceKey?: string | null;
  explicitSourceDetail?: string | null;
  explicitUnknown?: boolean;
  intakeProvider?: string | null;
  provider?: string | null;
  source?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  googleClickId?: string | null;
  referrer?: string | null;
  isRepeatCustomer?: boolean;
};

export const attributionSourceLabels: Record<AttributionSourceKey, string> = {
  website: "Website",
  google: "Google",
  yelp: "Yelp",
  phone: "Phone",
  email: "Email",
  referral: "Referral",
  repeat_customer: "Repeat customer",
  manual: "Manual",
  other: "Other",
  unknown: "Unknown",
};

export const lostReasonOptions = [
  { value: "price", label: "Price" },
  { value: "no_response", label: "No response" },
  { value: "chose_competitor", label: "Chose a competitor" },
  { value: "postponed", label: "Timing or postponed" },
  { value: "not_qualified", label: "Not qualified" },
  { value: "outside_service_area", label: "Outside service area" },
  { value: "insurance_denied", label: "Insurance denied" },
  { value: "scope_mismatch", label: "Scope mismatch" },
  { value: "duplicate", label: "Duplicate opportunity" },
  { value: "other", label: "Other" },
] as const;

export type LostReasonCode = (typeof lostReasonOptions)[number]["value"];

export const wonValueBasisOptions = [
  { value: "accepted_proposal", label: "Accepted proposal" },
  { value: "signed_proposal", label: "Signed proposal" },
  { value: "approved_contract_total", label: "Approved contract total" },
] as const;

export type WonValueBasis = (typeof wonValueBasisOptions)[number]["value"];

export type FiniteFinancialInputResult =
  | { status: "empty" }
  | { status: "invalid" }
  | { status: "valid"; value: number };

/** Parses a financial field without stripping signs, punctuation, or text. */
export function parseFiniteFinancialInput(
  value: unknown,
): FiniteFinancialInputResult {
  if (value === null || value === undefined || value === "") {
    return { status: "empty" };
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return { status: "empty" };
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed)
      ? { status: "valid", value: parsed }
      : { status: "invalid" };
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { status: "valid", value };
  }

  return { status: "invalid" };
}

function canonicalOperationPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalOperationPayload);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalOperationPayload(entry)]),
    );
  }

  return value;
}

/** Returns a non-PII SHA-256 token suitable for in-memory retry-key matching. */
export async function getOperationPayloadFingerprint(
  payload: unknown,
): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure operation fingerprinting is unavailable.");
  }

  const encoded = new TextEncoder().encode(
    JSON.stringify(canonicalOperationPayload(payload)),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const sourceKeySet = new Set<string>(canonicalAttributionSourceKeys);

function normalizedToken(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizedDetail(value: unknown) {
  const detail = typeof value === "string" ? value.trim().toLowerCase() : "";
  return detail ? detail.replace(/[\s-]+/g, "_") : null;
}

function canonicalExplicitSource(value: unknown): AttributionSourceKey | null {
  const token = normalizedDetail(value);
  return token && sourceKeySet.has(token) ? (token as AttributionSourceKey) : null;
}

export function getAttributionReferrerHost(value: unknown): string | null {
  const referrer = normalizedToken(value);
  if (!referrer) {
    return null;
  }

  try {
    const parsed = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(referrer)
        ? referrer
        : `https://${referrer}`,
    );
    return parsed.hostname.toLowerCase().replace(/\.$/, "") || null;
  } catch {
    return null;
  }
}

function googleReferrerHasEvidence(referrer: string) {
  const hostname = getAttributionReferrerHost(referrer);
  if (!hostname) {
    return false;
  }

  return (
    hostname === "google.com" ||
    hostname.endsWith(".google.com")
  );
}

/**
 * Resolves only deterministic acquisition evidence. The caller must preserve an
 * already-locked first touch instead of invoking this resolver as an overwrite.
 */
export function resolveLeadAcquisitionAttribution(
  evidence: LeadAcquisitionEvidence,
): AttributionResolution {
  const provider = normalizedDetail(evidence.intakeProvider ?? evidence.provider);
  const source = normalizedDetail(evidence.source);
  const utmSource = normalizedDetail(evidence.utmSource);
  const utmMedium = normalizedDetail(evidence.utmMedium);
  const utmCampaign = normalizedDetail(evidence.utmCampaign);
  const referrer = normalizedToken(evidence.referrer);
  const explicitSource = canonicalExplicitSource(evidence.explicitSourceKey);
  const explicitDetail = normalizedDetail(evidence.explicitSourceDetail);

  if (evidence.explicitUnknown || explicitSource === "unknown") {
    return {
      sourceKey: "unknown",
      sourceDetail: explicitDetail,
      intakeProvider: provider,
      evidenceKind: "insufficient",
      reviewStatus: "unattributed",
      shouldLock: false,
    };
  }

  if (evidence.isRepeatCustomer || explicitSource === "repeat_customer") {
    return {
      sourceKey: "repeat_customer",
      sourceDetail: explicitDetail,
      intakeProvider: provider ?? "manual",
      evidenceKind: "repeat_customer",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (explicitSource) {
    return {
      sourceKey: explicitSource,
      sourceDetail: explicitDetail,
      intakeProvider: provider ?? (explicitSource === "manual" ? "manual" : null),
      evidenceKind: "staff_selected",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  const hasGoogleAdsEvidence =
    Boolean(normalizedToken(evidence.googleClickId)) ||
    source === "google_ads" ||
    source === "googleadwords" ||
    utmSource === "google_ads" ||
    (utmSource === "google" &&
      ["cpc", "ppc", "paid", "paid_search"].includes(utmMedium ?? ""));

  const hasGoogleBusinessProfileEvidence =
    provider === "google_business_profile" ||
    provider === "google_my_business" ||
    source === "google_business_profile" ||
    source === "google_my_business" ||
    utmSource === "google_business_profile" ||
    utmSource === "google_my_business";

  const hasGoogleOrganicEvidence =
    (utmSource === "google" && utmMedium === "organic") ||
    googleReferrerHasEvidence(referrer);

  if (provider === "website") {
    const supportedWebsiteSources = new Set([
      "website",
      "google",
      "google_ads",
      "googleadwords",
      "google_business_profile",
      "google_my_business",
    ]);
    const supportedWebsiteUtmSources = new Set([
      "google",
      "google_ads",
      "google_business_profile",
      "google_my_business",
    ]);
    const hasUnsupportedSource = Boolean(
      source && !supportedWebsiteSources.has(source),
    );
    const hasUnsupportedUtmSource = Boolean(
      utmSource && !supportedWebsiteUtmSources.has(utmSource),
    );
    const hasIncompleteUtm = Boolean(
      !utmSource && (utmMedium || utmCampaign),
    );
    const hasUnsupportedReferrer = Boolean(
      referrer && !googleReferrerHasEvidence(referrer),
    );

    if (
      hasUnsupportedSource ||
      hasUnsupportedUtmSource ||
      hasIncompleteUtm ||
      hasUnsupportedReferrer
    ) {
      const hasKnownGoogleSignal =
        hasGoogleAdsEvidence ||
        hasGoogleBusinessProfileEvidence ||
        hasGoogleOrganicEvidence ||
        source === "google" ||
        utmSource === "google";
      const sourceDetail = hasKnownGoogleSignal
        ? "conflicting_acquisition_evidence"
        : hasUnsupportedSource
          ? "unsupported_source"
          : hasUnsupportedUtmSource
            ? "unsupported_utm_source"
            : hasIncompleteUtm
              ? "incomplete_utm"
              : "unsupported_referrer";

      return {
        sourceKey: "unknown",
        sourceDetail,
        intakeProvider: "website",
        evidenceKind: "insufficient",
        reviewStatus: "needs_review",
        shouldLock: false,
      };
    }
  }

  if (hasGoogleAdsEvidence) {
    return {
      sourceKey: "google",
      sourceDetail: "google_ads",
      intakeProvider: provider ?? "website",
      evidenceKind: "provider_metadata",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (hasGoogleBusinessProfileEvidence) {
    return {
      sourceKey: "google",
      sourceDetail: "google_business_profile",
      intakeProvider: provider,
      evidenceKind: "provider_metadata",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (hasGoogleOrganicEvidence) {
    return {
      sourceKey: "google",
      sourceDetail: "google_organic",
      intakeProvider: provider ?? "website",
      evidenceKind: "provider_metadata",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (provider === "mighty_apes" || provider === "yelp" || source === "yelp") {
    return {
      sourceKey: "yelp",
      sourceDetail: source === "yelp" ? "yelp" : null,
      intakeProvider: provider ?? "yelp",
      evidenceKind: "provider_verified",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (provider === "gmail") {
    return {
      sourceKey: "email",
      sourceDetail: "gmail",
      intakeProvider: "gmail",
      evidenceKind: "provider_verified",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (
    provider === "twilio" ||
    provider === "twilio_sms" ||
    provider === "twilio_voice" ||
    provider === "twilio_call"
  ) {
    return {
      sourceKey: "phone",
      sourceDetail: provider === "twilio_sms" ? "sms" : "voice",
      intakeProvider: provider,
      evidenceKind: "provider_verified",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (
    provider === "website" &&
    (!source || source === "website") &&
    !utmSource &&
    !utmMedium &&
    !utmCampaign &&
    !referrer
  ) {
    return {
      sourceKey: "website",
      sourceDetail: null,
      intakeProvider: "website",
      evidenceKind: "provider_verified",
      reviewStatus: "verified",
      shouldLock: true,
    };
  }

  if (source === "google" || utmSource === "google") {
    return {
      sourceKey: "unknown",
      sourceDetail: "ambiguous_google",
      intakeProvider: provider,
      evidenceKind: "insufficient",
      reviewStatus: "needs_review",
      shouldLock: false,
    };
  }

  return {
    sourceKey: "unknown",
    sourceDetail: null,
    intakeProvider: provider,
    evidenceKind: "insufficient",
    reviewStatus: "needs_review",
    shouldLock: false,
  };
}

export type PhoenixMonthBounds = {
  month: string;
  start: string;
  endExclusive: string;
};

export function getPhoenixMonthBounds(month: string): PhoenixMonthBounds {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) {
    throw new Error("Month must use YYYY-MM format.");
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, 7, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, monthIndex + 1, 1, 7, 0, 0, 0));

  return {
    month,
    start: start.toISOString(),
    endExclusive: endExclusive.toISOString(),
  };
}

export type MarketingAccountabilityLead = {
  leadId: string;
  companyId: string;
  sourceKey: AttributionSourceKey;
  reviewStatus: AttributionReviewStatus;
  receivedAt: string;
  firstResponseAt?: string | null;
  outcome?: "open" | "won" | "lost" | null;
  wonContractValue?: number | null;
  nextFollowUpAt?: string | null;
};

export type MarketingAccountabilityEvent = {
  leadId: string;
  companyId: string;
  eventType:
    | "lead_created"
    | "attribution_reviewed"
    | "owner_assigned"
    | "contacted"
    | "appointment_scheduled"
    | "inspection_completed"
    | "estimate_sent"
    | "won"
    | "lost";
  occurredAt: string;
};

export type AccountabilityLifecycleAction =
  | "attribution_reviewed"
  | "owner_assigned"
  | "contacted"
  | "appointment_scheduled"
  | "inspection_completed"
  | "estimate_sent"
  | "won"
  | "lost";

export function getAccountabilityActionPreflightError(input: {
  action: AccountabilityLifecycleAction;
  outcome: "open" | "won" | "lost";
  firstResponseAt?: string | null;
  occurredAt?: string | null;
  events: readonly Pick<MarketingAccountabilityEvent, "eventType" | "occurredAt">[];
}): string | null {
  const hasTerminalEvent = input.events.some(
    (event) => event.eventType === "won" || event.eventType === "lost",
  );
  if (
    input.action !== "attribution_reviewed" &&
    input.action !== "owner_assigned" &&
    (input.outcome !== "open" || hasTerminalEvent)
  ) {
    return "Won or lost lead accountability is terminal.";
  }

  if (
    input.action === "contacted" &&
    (input.firstResponseAt ||
      input.events.some((event) => event.eventType === "contacted"))
  ) {
    return "First successful human response is already recorded.";
  }

  const sequenceByAction: Partial<
    Record<
      AccountabilityLifecycleAction,
      readonly MarketingAccountabilityEvent["eventType"][]
    >
  > = {
    appointment_scheduled: ["contacted"],
    inspection_completed: ["contacted", "appointment_scheduled"],
    estimate_sent: [
      "contacted",
      "appointment_scheduled",
      "inspection_completed",
    ],
    won: [
      "contacted",
      "appointment_scheduled",
      "inspection_completed",
      "estimate_sent",
    ],
  };
  const required = sequenceByAction[input.action];
  if (!required) {
    return null;
  }

  let previousTime = Number.NEGATIVE_INFINITY;
  for (const eventType of required) {
    const times = input.events
      .filter((event) => event.eventType === eventType)
      .map((event) => new Date(event.occurredAt).getTime())
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    const nextTime = times.find((time) => time >= previousTime);
    if (nextTime === undefined) {
      return "Lifecycle milestones must follow contact, appointment, inspection, estimate sent, then won.";
    }
    previousTime = nextTime;
  }

  if (input.occurredAt) {
    const occurredTime = new Date(input.occurredAt).getTime();
    if (!Number.isFinite(occurredTime) || occurredTime < previousTime) {
      return "Lifecycle event time cannot precede its required milestone.";
    }
  }

  return null;
}

export type MarketingAccountabilitySpend = {
  companyId: string;
  spendMonth: string;
  sourceKey: AttributionSourceKey;
  amount: number;
};

export type LeadOwnerAccountability = {
  lead_id: string;
  company_id: string;
  owner_user_id: string | null;
};

export function getLeadAccountabilityForLead<T extends LeadOwnerAccountability>(
  accountability: readonly T[] | null | undefined,
  leadId: string,
  companyId?: string | null,
): T | null {
  return (
    accountability?.find(
      (record) =>
        record.lead_id === leadId &&
        (!companyId || record.company_id === companyId),
    ) ?? null
  );
}

export function getLeadOwnerUserId(
  accountability: readonly LeadOwnerAccountability[] | null | undefined,
  leadId: string,
  companyId?: string | null,
): string | null {
  return (
    getLeadAccountabilityForLead(accountability, leadId, companyId)
      ?.owner_user_id ?? null
  );
}

export type MarketingAccountabilityMetricsInput = {
  month: string;
  companyId?: string | null;
  sourceKey?: AttributionSourceKey | "all";
  leads: readonly MarketingAccountabilityLead[];
  events: readonly MarketingAccountabilityEvent[];
  spend: readonly MarketingAccountabilitySpend[];
  now?: string | Date;
  missingAccountabilityLeadCount?: number;
  workflowLinkageGapCount?: number;
};

export type MarketingAccountabilityMetrics = {
  leadCount: number;
  marketingSpend: number;
  costPerLead: number | null;
  bookedLeadCount: number;
  bookingRate: number | null;
  inspectionCompletedLeadCount: number;
  inspectionCompletionRate: number | null;
  wonLeadCount: number;
  closingRate: number | null;
  costPerSoldJob: number | null;
  attributedContractRevenue: number;
  marketingRevenuePerSpend: number | null;
  newAwaitingContact: number;
  unsoldEstimatesNeedingFollowUp: number;
  unsoldEstimatesMissingFollowUp: number;
  unattributedLeadCount: number;
  attributionCoverage: number | null;
  missingWonValueCount: number;
  missingAccountabilityLeadCount: number;
  workflowLinkageGapCount: number;
};

function safeRatio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null;
}

function validDate(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function phoenixDateKey(time: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Rates are returned as 0..1 ratios. Monetary values are numeric USD amounts. */
export function calculateMarketingAccountabilityMetrics(
  input: MarketingAccountabilityMetricsInput,
): MarketingAccountabilityMetrics {
  const bounds = getPhoenixMonthBounds(input.month);
  const startTime = new Date(bounds.start).getTime();
  const endTime = new Date(bounds.endExclusive).getTime();
  const nowTime =
    input.now instanceof Date
      ? input.now.getTime()
      : new Date(input.now ?? Date.now()).getTime();
  const sourceFilter = input.sourceKey ?? "all";

  const cohort = input.leads.filter((lead) => {
    const receivedTime = validDate(lead.receivedAt);
    return (
      receivedTime !== null &&
      receivedTime >= startTime &&
      receivedTime < endTime &&
      (!input.companyId || lead.companyId === input.companyId) &&
      (sourceFilter === "all" || lead.sourceKey === sourceFilter)
    );
  });
  const cohortByLeadId = new Map(cohort.map((lead) => [lead.leadId, lead]));
  const eventTypesByLead = new Map<string, Set<MarketingAccountabilityEvent["eventType"]>>();

  for (const event of input.events) {
    const cohortLead = cohortByLeadId.get(event.leadId);
    if (!cohortLead || event.companyId !== cohortLead.companyId) {
      continue;
    }

    const types = eventTypesByLead.get(event.leadId) ?? new Set();
    types.add(event.eventType);
    eventTypesByLead.set(event.leadId, types);
  }

  const bookedLeadIds = new Set<string>();
  const inspectedLeadIds = new Set<string>();
  const wonLeadIds = new Set<string>();
  let newAwaitingContact = 0;
  let unsoldEstimatesNeedingFollowUp = 0;
  let unsoldEstimatesMissingFollowUp = 0;
  let unattributedLeadCount = 0;
  let missingWonValueCount = 0;
  let attributedContractRevenue = 0;

  for (const lead of cohort) {
    const events = eventTypesByLead.get(lead.leadId) ?? new Set();
    const isOpen = !lead.outcome || lead.outcome === "open";
    const hasContact = Boolean(lead.firstResponseAt) || events.has("contacted");
    const isAttributed =
      lead.reviewStatus === "verified" && lead.sourceKey !== "unknown";

    if (events.has("appointment_scheduled")) {
      bookedLeadIds.add(lead.leadId);
    }
    if (events.has("inspection_completed")) {
      inspectedLeadIds.add(lead.leadId);
    }
    if (lead.outcome === "won" || events.has("won")) {
      wonLeadIds.add(lead.leadId);
      if (typeof lead.wonContractValue === "number" && lead.wonContractValue > 0) {
        if (isAttributed) {
          attributedContractRevenue += lead.wonContractValue;
        }
      } else {
        missingWonValueCount += 1;
      }
    }
    if (isOpen && !hasContact) {
      newAwaitingContact += 1;
    }
    if (isOpen && events.has("estimate_sent")) {
      if (!lead.nextFollowUpAt) {
        unsoldEstimatesMissingFollowUp += 1;
      } else {
        const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(lead.nextFollowUpAt);
        const followUpTime = validDate(lead.nextFollowUpAt);
        if (
          (isDateOnly && lead.nextFollowUpAt < phoenixDateKey(nowTime)) ||
          (!isDateOnly && followUpTime !== null && followUpTime < nowTime)
        ) {
          unsoldEstimatesNeedingFollowUp += 1;
        }
      }
    }
    if (!isAttributed) {
      unattributedLeadCount += 1;
    }
  }

  const marketingSpend = input.spend
    .filter(
      (entry) =>
        entry.spendMonth === input.month &&
        (!input.companyId || entry.companyId === input.companyId) &&
        (sourceFilter === "all" || entry.sourceKey === sourceFilter),
    )
    .reduce((sum, entry) => sum + Math.max(0, entry.amount), 0);
  const leadCount = cohortByLeadId.size;

  return {
    leadCount,
    marketingSpend,
    costPerLead: safeRatio(marketingSpend, leadCount),
    bookedLeadCount: bookedLeadIds.size,
    bookingRate: safeRatio(bookedLeadIds.size, leadCount),
    inspectionCompletedLeadCount: inspectedLeadIds.size,
    inspectionCompletionRate: safeRatio(inspectedLeadIds.size, bookedLeadIds.size),
    wonLeadCount: wonLeadIds.size,
    closingRate: safeRatio(wonLeadIds.size, inspectedLeadIds.size),
    costPerSoldJob: safeRatio(marketingSpend, wonLeadIds.size),
    attributedContractRevenue,
    marketingRevenuePerSpend: safeRatio(attributedContractRevenue, marketingSpend),
    newAwaitingContact,
    unsoldEstimatesNeedingFollowUp,
    unsoldEstimatesMissingFollowUp,
    unattributedLeadCount,
    attributionCoverage: safeRatio(
      leadCount - unattributedLeadCount,
      leadCount,
    ),
    missingWonValueCount,
    missingAccountabilityLeadCount: Math.max(
      0,
      input.missingAccountabilityLeadCount ?? 0,
    ),
    workflowLinkageGapCount: Math.max(0, input.workflowLinkageGapCount ?? 0),
  };
}
