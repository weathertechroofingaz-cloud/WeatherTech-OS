import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { WebsiteLeadRequestBody } from "./leadIntake";
import type {
  CanonicalLeadBranchKey,
  CanonicalLeadCompanyKey,
} from "./leadRouting";

type HeadersLike = Headers | Record<string, string | string[] | undefined>;

export type WebsiteLeadCaptureSourceKey =
  | "weathertech-phoenix"
  | "weathertech-tucson"
  | "ihc";

export type WebsiteLeadCaptureVerificationMethod = "hmac_sha256";
export type WebsiteLeadCaptureSourceStatus = "enabled" | "disabled";
export type WebsiteLeadCaptureRoutingStatus =
  | "ready_to_route"
  | "needs_configuration";
export type WebsiteLeadCaptureResolutionStatus =
  | "matched"
  | "ambiguous"
  | "unknown"
  | "disabled";
export type WebsiteLeadCaptureVerificationStatus =
  | "valid"
  | "missing_signature"
  | "invalid_signature"
  | "verification_required"
  | "dry_run";
export type WebsiteLeadCaptureAbuseStatus =
  | "clear"
  | "review_required"
  | "blocked";
export type WebsiteLeadCaptureReadinessState =
  | "not_configured"
  | "source_registry_ready"
  | "verification_required"
  | "endpoint_ready"
  | "testing_required"
  | "ready_for_production_configuration"
  | "connected"
  | "error";

export type WebsiteLeadCaptureSource = {
  key: WebsiteLeadCaptureSourceKey;
  label: string;
  companyKey: Exclude<CanonicalLeadCompanyKey, "unassigned">;
  companyLabel: "WeatherTech" | "IHC";
  branchKey: Exclude<CanonicalLeadBranchKey, "unassigned">;
  branchLabel: string;
  domains: string[];
  domainSetupRequired: boolean;
  sourceIds: string[];
  formIdentifiers: string[];
  campaign: string;
  sourceDetail: string;
  defaultQueue: string;
  status: WebsiteLeadCaptureSourceStatus;
  verificationMethod: WebsiteLeadCaptureVerificationMethod;
  secretEnvVar: string;
  routingStatus: WebsiteLeadCaptureRoutingStatus;
};

export type WebsiteLeadCaptureSourceResolution = {
  source: WebsiteLeadCaptureSource | null;
  status: WebsiteLeadCaptureResolutionStatus;
  submittedSourceId: string | null;
  submittedFormIdentifier: string | null;
  submittedDomain: string | null;
  warnings: string[];
};

export type WebsiteLeadCaptureVerificationResult = {
  ok: boolean;
  status: WebsiteLeadCaptureVerificationStatus;
  summary: string;
  checkedAt: string;
};

export type WebsiteLeadCaptureAbuseSignal = {
  code:
    | "blocked_source"
    | "honeypot"
    | "stale_submission"
    | "future_submission"
    | "suspicious_links"
    | "script_like_content";
  label: string;
  severity: "review" | "block";
};

export type WebsiteLeadCaptureAbuseResult = {
  status: WebsiteLeadCaptureAbuseStatus;
  signals: WebsiteLeadCaptureAbuseSignal[];
  reviewReason: string | null;
};

export type WebsiteLeadCaptureReadiness = {
  state: WebsiteLeadCaptureReadinessState;
  label: string;
  endpointPath: string;
  dryRunPath: string;
  configuredSourceCount: number;
  enabledSourceCount: number;
  configuredVerificationCount: number;
  sourceCountNeedingDomain: number;
  ownerActions: string[];
};

export const websiteLeadCaptureEndpointPath = "/api/leads/website";
export const websiteLeadCaptureDryRunPath = "/api/leads/website?dryRun=1";
export const websiteLeadCaptureMaxPayloadBytes = 32_000;
export const websiteLeadCaptureSignatureHeader = "x-weathertech-signature";
export const websiteLeadCaptureTimestampHeader = "x-weathertech-timestamp";
export const websiteLeadCaptureSourceHeader = "x-weathertech-source";
export const websiteLeadCaptureSharedSecretEnvVar =
  "WEBSITE_LEAD_CAPTURE_SECRET";

export const websiteLeadCaptureReadinessLabels: Record<
  WebsiteLeadCaptureReadinessState,
  string
> = {
  not_configured: "Not Configured",
  source_registry_ready: "Source Registry Ready",
  verification_required: "Verification Required",
  endpoint_ready: "Endpoint Ready",
  testing_required: "Testing Required",
  ready_for_production_configuration: "Ready for Production Configuration",
  connected: "Connected",
  error: "Error",
};

export const websiteLeadCaptureSources: WebsiteLeadCaptureSource[] = [
  {
    key: "weathertech-phoenix",
    label: "WeatherTech Roofing LLC - Phoenix website",
    companyKey: "weathertech_roofing",
    companyLabel: "WeatherTech",
    branchKey: "weathertech_phoenix",
    branchLabel: "Phoenix",
    domains: ["weathertechroofingaz.com"],
    domainSetupRequired: false,
    sourceIds: [
      "weathertech-phoenix",
      "weathertech-roofing-phoenix",
      "wtr-phoenix",
    ],
    formIdentifiers: [
      "weathertech-phoenix-contact",
      "weathertech-roofing-phoenix-contact",
      "weathertech-contact-phoenix",
    ],
    campaign: "website-phoenix",
    sourceDetail: "WeatherTech Phoenix website",
    defaultQueue: "weathertech-roofing-phoenix",
    status: "enabled",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "WEBSITE_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX",
    routingStatus: "ready_to_route",
  },
  {
    key: "weathertech-tucson",
    label: "WeatherTech Roofing LLC - Tucson website",
    companyKey: "weathertech_roofing",
    companyLabel: "WeatherTech",
    branchKey: "weathertech_tucson",
    branchLabel: "Tucson",
    domains: ["weathertechroofingaz.com"],
    domainSetupRequired: false,
    sourceIds: [
      "weathertech-tucson",
      "weathertech-roofing-tucson",
      "wtr-tucson",
    ],
    formIdentifiers: [
      "weathertech-tucson-contact",
      "weathertech-roofing-tucson-contact",
      "weathertech-contact-tucson",
    ],
    campaign: "website-tucson",
    sourceDetail: "WeatherTech Tucson website",
    defaultQueue: "weathertech-roofing-tucson",
    status: "enabled",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "WEBSITE_LEAD_CAPTURE_SECRET_WEATHERTECH_TUCSON",
    routingStatus: "ready_to_route",
  },
  {
    key: "ihc",
    label: "IHC website",
    companyKey: "ihc_painting",
    companyLabel: "IHC",
    branchKey: "ihc",
    branchLabel: "IHC",
    domains: [],
    domainSetupRequired: true,
    sourceIds: ["ihc", "ihc-painting", "ihc-website"],
    formIdentifiers: [
      "ihc-contact",
      "ihc-painting-contact",
      "ihc-website-contact",
    ],
    campaign: "website-ihc",
    sourceDetail: "IHC website",
    defaultQueue: "ihc-painting",
    status: "enabled",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "WEBSITE_LEAD_CAPTURE_SECRET_IHC",
    routingStatus: "needs_configuration",
  },
];

export const websiteLeadCaptureSecretEnvVars = [
  websiteLeadCaptureSharedSecretEnvVar,
  ...websiteLeadCaptureSources.map((source) => source.secretEnvVar),
];

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

function getHeaderValue(headers: HeadersLike, key: string) {
  if (headers instanceof Headers) {
    return headers.get(key)?.trim() ?? null;
  }

  const exactValue = headers[key] ?? headers[key.toLowerCase()];
  const value = Array.isArray(exactValue) ? exactValue[0] : exactValue;

  return value?.trim() ?? null;
}

function getSubmittedDomain(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sourceMatchesToken(source: WebsiteLeadCaptureSource, token: string) {
  const registryTokens = [
    source.key,
    ...source.sourceIds,
    ...source.formIdentifiers,
  ].map(getToken);

  return registryTokens.includes(token);
}

function sourceMatchesDomain(source: WebsiteLeadCaptureSource, domain: string) {
  return source.domains.some((sourceDomain) => {
    const normalized = sourceDomain.replace(/^www\./, "").toLowerCase();

    return domain === normalized || domain.endsWith(`.${normalized}`);
  });
}

export function resolveWebsiteLeadCaptureSource(
  body: WebsiteLeadRequestBody,
  headers: HeadersLike = {},
): WebsiteLeadCaptureSourceResolution {
  const headerSource = getText(
    getHeaderValue(headers, websiteLeadCaptureSourceHeader),
    120,
  );
  const submittedSourceId =
    headerSource ??
    getText(body.sourceId, 120) ??
    getText(body.websiteSource, 120);
  const submittedFormIdentifier =
    getText(body.formIdentifier, 160) ?? getText(body.formId, 160);
  const submittedDomain = getSubmittedDomain(
    getText(body.websiteUrl ?? body.pageUrl ?? body.referrer, 240),
  );
  const sourceTokens = [submittedSourceId, submittedFormIdentifier]
    .map((value) => getToken(value))
    .filter(Boolean);
  const tokenMatches = websiteLeadCaptureSources.filter((source) =>
    sourceTokens.some((token) => sourceMatchesToken(source, token)),
  );

  if (tokenMatches.length === 1) {
    const source = tokenMatches[0];

    return {
      source,
      status: source.status === "disabled" ? "disabled" : "matched",
      submittedSourceId,
      submittedFormIdentifier,
      submittedDomain,
      warnings: [],
    };
  }

  if (tokenMatches.length > 1) {
    return {
      source: null,
      status: "ambiguous",
      submittedSourceId,
      submittedFormIdentifier,
      submittedDomain,
      warnings: [
        "Website source identifier matched multiple registry entries. Review before routing.",
      ],
    };
  }

  if (submittedDomain) {
    const domainMatches = websiteLeadCaptureSources.filter((source) =>
      sourceMatchesDomain(source, submittedDomain),
    );

    if (domainMatches.length === 1) {
      const source = domainMatches[0];

      return {
        source,
        status: source.status === "disabled" ? "disabled" : "matched",
        submittedSourceId,
        submittedFormIdentifier,
        submittedDomain,
        warnings: [],
      };
    }

    if (domainMatches.length > 1) {
      return {
        source: null,
        status: "ambiguous",
        submittedSourceId,
        submittedFormIdentifier,
        submittedDomain,
        warnings: [
          "Website domain is shared by multiple WeatherTech sources. Provide a verified sourceId or formIdentifier.",
        ],
      };
    }
  }

  return {
    source: null,
    status: "unknown",
    submittedSourceId,
    submittedFormIdentifier,
    submittedDomain,
    warnings: [
      "Website source is unknown. Submission will remain unassigned for review.",
    ],
  };
}

export function getWebsiteLeadCaptureSecret(
  source: WebsiteLeadCaptureSource | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  const sourceSecret = source ? env[source.secretEnvVar]?.trim() : null;
  const sharedSecret = env[websiteLeadCaptureSharedSecretEnvVar]?.trim();

  return sourceSecret || sharedSecret || null;
}

function normalizeSignatureHeader(value: string | null) {
  if (!value) {
    return null;
  }

  const signature = value
    .split(",")
    .map((part) => part.trim())
    .find(Boolean);
  const candidate = signature?.includes("=")
    ? signature.split("=").slice(1).join("=")
    : signature;

  return /^[a-f0-9]{64}$/i.test(candidate ?? "")
    ? candidate?.toLowerCase() ?? null
    : null;
}

function signaturesMatch(actualHex: string, expectedHex: string) {
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createWebsiteLeadCaptureSignature({
  rawBody,
  timestamp,
  secret,
}: {
  rawBody: string;
  timestamp: string;
  secret: string;
}) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function verifyWebsiteLeadCaptureRequest({
  rawBody,
  headers,
  source,
  dryRun = false,
  now = new Date(),
  secretOverride = null,
}: {
  rawBody: string;
  headers: HeadersLike;
  source: WebsiteLeadCaptureSource | null;
  dryRun?: boolean;
  now?: Date;
  secretOverride?: string | null;
}): WebsiteLeadCaptureVerificationResult {
  const checkedAt = now.toISOString();

  if (dryRun) {
    return {
      ok: true,
      status: "dry_run",
      summary: "Dry-run preview. Signature validation was not required.",
      checkedAt,
    };
  }

  const secret = secretOverride ?? getWebsiteLeadCaptureSecret(source);

  if (!secret) {
    return {
      ok: false,
      status: "verification_required",
      summary: "Website lead capture signing secret is not configured.",
      checkedAt,
    };
  }

  const timestamp = getHeaderValue(headers, websiteLeadCaptureTimestampHeader);
  const signature = normalizeSignatureHeader(
    getHeaderValue(headers, websiteLeadCaptureSignatureHeader),
  );

  if (!timestamp || !signature) {
    return {
      ok: false,
      status: "missing_signature",
      summary: "Signed website submissions must include timestamp and signature headers.",
      checkedAt,
    };
  }

  const timestampMs = Date.parse(timestamp);
  const nowMs = now.getTime();

  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(nowMs - timestampMs) > 10 * 60 * 1000
  ) {
    return {
      ok: false,
      status: "invalid_signature",
      summary: "Website submission signature timestamp is outside the accepted window.",
      checkedAt,
    };
  }

  const expected = createWebsiteLeadCaptureSignature({
    rawBody,
    timestamp,
    secret,
  });

  if (!signaturesMatch(signature, expected)) {
    return {
      ok: false,
      status: "invalid_signature",
      summary: "Website submission signature is invalid.",
      checkedAt,
    };
  }

  return {
    ok: true,
    status: "valid",
    summary: "Website submission signature is valid.",
    checkedAt,
  };
}

function sanitizeText(value: unknown, maxLength = 500) {
  const text = getText(value, maxLength);

  if (!text) {
    return null;
  }

  const withoutControls = text.replace(/[\u0000-\u001f\u007f]/g, " ");
  const withoutTags = withoutControls.replace(/<[^>]*>/g, " ");
  const withoutAngles = withoutTags.replace(/[<>]/g, " ");

  return withoutAngles.replace(/\s+/g, " ").trim().slice(0, maxLength) || null;
}

function getSubmittedAt(body: WebsiteLeadRequestBody) {
  return (
    sanitizeText(body.submittedAt, 80) ??
    sanitizeText(body.timestamp, 80) ??
    sanitizeText(body.receivedAt, 80)
  );
}

function countLinks(value: string | null) {
  return (value?.match(/https?:\/\/|www\./gi) ?? []).length;
}

export function evaluateWebsiteLeadCaptureAbuse(
  body: WebsiteLeadRequestBody,
  resolution: WebsiteLeadCaptureSourceResolution,
  now = new Date(),
): WebsiteLeadCaptureAbuseResult {
  const signals: WebsiteLeadCaptureAbuseSignal[] = [];
  const rawBody = body as Record<string, unknown>;
  const honeypotValue =
    sanitizeText(rawBody.honeypot, 80) ??
    sanitizeText(rawBody.companyWebsite, 80) ??
    sanitizeText(rawBody.hiddenWebsite, 80) ??
    sanitizeText(rawBody.fax, 80) ??
    sanitizeText(rawBody.middleName, 80);
  const submittedAt = getSubmittedAt(body);
  const submittedAtMs = submittedAt ? Date.parse(submittedAt) : null;
  const message = sanitizeText(body.message ?? body.comments ?? body.notes, 1500);

  if (resolution.status === "disabled") {
    signals.push({
      code: "blocked_source",
      label: "Website source is disabled.",
      severity: "block",
    });
  }

  if (honeypotValue) {
    signals.push({
      code: "honeypot",
      label: "Honeypot field was filled.",
      severity: "review",
    });
  }

  if (submittedAtMs && Number.isFinite(submittedAtMs)) {
    const ageMs = now.getTime() - submittedAtMs;

    if (ageMs > 30 * 24 * 60 * 60 * 1000) {
      signals.push({
        code: "stale_submission",
        label: "Submission timestamp is older than 30 days.",
        severity: "review",
      });
    }

    if (ageMs < -10 * 60 * 1000) {
      signals.push({
        code: "future_submission",
        label: "Submission timestamp is too far in the future.",
        severity: "review",
      });
    }
  }

  if (countLinks(message) >= 3) {
    signals.push({
      code: "suspicious_links",
      label: "Message contains multiple links.",
      severity: "review",
    });
  }

  if (/<\s*script|javascript:|onerror\s*=|<\s*iframe/i.test(message ?? "")) {
    signals.push({
      code: "script_like_content",
      label: "Message contained script-like text.",
      severity: "review",
    });
  }

  const status: WebsiteLeadCaptureAbuseStatus = signals.some(
    (signal) => signal.severity === "block",
  )
    ? "blocked"
    : signals.length
      ? "review_required"
      : "clear";

  return {
    status,
    signals,
    reviewReason: signals.length
      ? signals.map((signal) => signal.label).join(" ")
      : null,
  };
}

function buildName(body: WebsiteLeadRequestBody) {
  const firstName = sanitizeText(body.firstName, 80);
  const lastName = sanitizeText(body.lastName, 120);

  return sanitizeText(body.name, 160) ??
    ([firstName, lastName].filter(Boolean).join(" ") || null);
}

function getSourceUrl(
  body: WebsiteLeadRequestBody,
  source: WebsiteLeadCaptureSource | null,
) {
  const submittedUrl = sanitizeText(
    body.websiteUrl ?? body.pageUrl ?? body.referrer,
    240,
  );

  if (submittedUrl) {
    return submittedUrl;
  }

  return source?.domains[0] ? `https://${source.domains[0]}` : null;
}

export function buildWebsiteLeadCaptureRequestBody({
  body,
  resolution,
  verification,
  abuse,
  correlationId,
}: {
  body: WebsiteLeadRequestBody;
  resolution: WebsiteLeadCaptureSourceResolution;
  verification: WebsiteLeadCaptureVerificationResult;
  abuse: WebsiteLeadCaptureAbuseResult;
  correlationId?: string | null;
}): WebsiteLeadRequestBody {
  const source = resolution.source;
  const sourceDetail = source
    ? source.sourceDetail
    : [
        resolution.submittedDomain,
        resolution.submittedFormIdentifier,
        resolution.submittedSourceId,
      ].filter(Boolean).join(" / ") || "Unknown website source";
  const forceReviewReason =
    abuse.status === "review_required"
      ? abuse.reviewReason
      : resolution.status === "matched"
        ? null
        : resolution.warnings.join(" ");

  return {
    business: source?.companyLabel ?? "Unassigned",
    location: source?.branchLabel ?? sanitizeText(body.city ?? body.location, 120),
    city: sanitizeText(body.city ?? body.location, 120),
    state: sanitizeText(body.state, 40) ?? "AZ",
    zip: sanitizeText(body.zip ?? body.postalCode, 20),
    postalCode: sanitizeText(body.zip ?? body.postalCode, 20),
    source: source ? `${source.companyLabel} Website` : "Website",
    sourceDetail,
    sourceId: source?.key ?? sanitizeText(body.sourceId ?? body.websiteSource, 120),
    websiteSource:
      source?.key ?? sanitizeText(body.websiteSource ?? body.sourceId, 120),
    formIdentifier:
      resolution.submittedFormIdentifier ??
      sanitizeText(body.formIdentifier ?? body.formId, 160),
    formId:
      resolution.submittedFormIdentifier ??
      sanitizeText(body.formId ?? body.formIdentifier, 160),
    name: buildName(body),
    firstName: sanitizeText(body.firstName, 80),
    lastName: sanitizeText(body.lastName, 120),
    companyName: sanitizeText(body.companyName, 160),
    phone: sanitizeText(body.phone, 40),
    email: sanitizeText(body.email, 160),
    address: sanitizeText(body.address ?? body.serviceAddress ?? body.streetAddress, 240),
    serviceAddress: sanitizeText(
      body.serviceAddress ?? body.address ?? body.streetAddress,
      240,
    ),
    serviceType: sanitizeText(body.serviceType ?? body.requestedService ?? body.service, 80),
    requestedService: sanitizeText(
      body.requestedService ?? body.serviceType ?? body.service,
      80,
    ),
    message: sanitizeText(body.message ?? body.comments ?? body.notes, 1500),
    preferredContactMethod: sanitizeText(
      body.preferredContactMethod ?? body.preferredContact,
      40,
    ),
    websiteUrl: getSourceUrl(body, source),
    pageUrl: sanitizeText(body.pageUrl, 240),
    referrer: sanitizeText(body.referrer, 240),
    utmSource: sanitizeText(body.utmSource, 120) ?? "website",
    utmCampaign: sanitizeText(body.utmCampaign ?? body.campaign, 160) ??
      source?.campaign,
    utmMedium: sanitizeText(body.utmMedium, 120) ?? "form",
    campaign: sanitizeText(body.campaign ?? body.utmCampaign, 160) ??
      source?.campaign,
    externalLeadId:
      sanitizeText(body.externalLeadId, 160) ??
      sanitizeText(body.leadId, 160) ??
      sanitizeText(body.submissionId, 160) ??
      sanitizeText(body.formSubmissionId, 160) ??
      sanitizeText(body.sourceExternalId, 160) ??
      sanitizeText(body.externalId, 160),
    leadId: sanitizeText(body.leadId, 160),
    submissionId: sanitizeText(body.submissionId, 160),
    formSubmissionId: sanitizeText(body.formSubmissionId, 160),
    sourceExternalId: sanitizeText(body.sourceExternalId, 160),
    externalId: sanitizeText(body.externalId, 160),
    submittedAt: getSubmittedAt(body) ?? new Date().toISOString(),
    timestamp: sanitizeText(body.timestamp, 80),
    receivedAt: sanitizeText(body.receivedAt, 80),
    smsConsent: typeof body.smsConsent === "boolean" ? body.smsConsent : null,
    emailConsent:
      typeof body.emailConsent === "boolean" ? body.emailConsent : null,
    consentSource: sanitizeText(body.consentSource, 120),
    consentCapturedAt: sanitizeText(body.consentCapturedAt, 80),
    verifiedCompanyKey: source?.companyKey ?? "unassigned",
    verifiedBranchKey: source?.branchKey ?? "unassigned",
    forceUnassignedRouting: !source,
    forceReviewReason,
    correlationId: sanitizeText(correlationId, 120) ?? randomUUID(),
    verifiedSourceMetadata: {
      sourceRegistryKey: source?.key ?? null,
      sourceResolutionStatus: resolution.status,
      submittedSourceId: resolution.submittedSourceId,
      submittedFormIdentifier: resolution.submittedFormIdentifier,
      submittedDomain: resolution.submittedDomain,
      verificationStatus: verification.status,
      verificationMethod: source?.verificationMethod ?? "hmac_sha256",
      routingStatus: source?.routingStatus ?? "needs_configuration",
      defaultQueue: source?.defaultQueue ?? "lead-intake-review",
      spamReviewStatus: abuse.status,
      spamSignals: abuse.signals.map((signal) => signal.code),
    },
  };
}

export function buildWebsiteLeadCaptureReadiness(
  env: NodeJS.ProcessEnv = process.env,
): WebsiteLeadCaptureReadiness {
  const enabledSourceCount = websiteLeadCaptureSources.filter(
    (source) => source.status === "enabled",
  ).length;
  const configuredVerificationCount = websiteLeadCaptureSources.filter((source) =>
    Boolean(getWebsiteLeadCaptureSecret(source, env)),
  ).length;
  const sourceCountNeedingDomain = websiteLeadCaptureSources.filter(
    (source) => source.domainSetupRequired || source.domains.length === 0,
  ).length;
  const hasSharedSecret = Boolean(env[websiteLeadCaptureSharedSecretEnvVar]?.trim());
  const state: WebsiteLeadCaptureReadinessState =
    !websiteLeadCaptureSources.length
      ? "not_configured"
      : configuredVerificationCount === 0 && !hasSharedSecret
        ? "verification_required"
        : sourceCountNeedingDomain > 0
          ? "ready_for_production_configuration"
          : "testing_required";

  return {
    state,
    label: websiteLeadCaptureReadinessLabels[state],
    endpointPath: websiteLeadCaptureEndpointPath,
    dryRunPath: websiteLeadCaptureDryRunPath,
    configuredSourceCount: websiteLeadCaptureSources.length,
    enabledSourceCount,
    configuredVerificationCount,
    sourceCountNeedingDomain,
    ownerActions: [
      "Add server-side HMAC secret environment variables in hosting.",
      "Add hidden sourceId or formIdentifier to each approved website form.",
      "Run a signed test submission for WeatherTech Phoenix, WeatherTech Tucson, and IHC.",
      "Enable production forms only after signed tests show accepted or review outcomes.",
    ],
  };
}
