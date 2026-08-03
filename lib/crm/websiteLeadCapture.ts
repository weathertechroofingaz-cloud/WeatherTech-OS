import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { WebsiteLeadRequestBody } from "./leadIntake";
import { sanitizeIntegrationSyncLogSummary } from "./integrations";
import type {
  CanonicalLeadBranchKey,
  CanonicalLeadCompanyKey,
  LeadIntakeUrgency,
} from "./leadRouting";
import type { IntegrationSyncLogRecord, ServiceType } from "./types";

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
export type WebsiteLeadCaptureAuthenticationMethod =
  | "hmac_sha256"
  | "server_to_server_proxy";
export type WebsiteLeadCaptureProductionState =
  | "production_disabled"
  | "ready_for_testing"
  | "active"
  | "authentication_failed"
  | "intake_error";
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
export type WebsiteLeadCaptureOriginStatus =
  | "valid"
  | "not_supplied"
  | "not_configured"
  | "invalid_origin"
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
  allowedOrigins: string[];
  allowedOriginsEnvVar: string;
  sourceIds: string[];
  sourceIdEnvVar: string;
  formIdentifiers: string[];
  acceptedFormTypes: WebsiteLeadCaptureFormType[];
  authenticationMethod: WebsiteLeadCaptureAuthenticationMethod;
  campaign: string;
  sourceDetail: string;
  defaultLeadSourceLabel: string;
  defaultQueue: string;
  status: WebsiteLeadCaptureSourceStatus;
  verificationMethod: WebsiteLeadCaptureVerificationMethod;
  secretEnvVar: string;
  productionEnabledEnvVar: string;
  productionEnabledByDefault: false;
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

export type WebsiteLeadCaptureFormType =
  | "contact_request"
  | "roofing_estimate_request"
  | "roof_inspection_request"
  | "roof_repair_request"
  | "painting_estimate_request"
  | "interior_painting_request"
  | "exterior_painting_request"
  | "general_service_inquiry"
  | "commercial_inquiry"
  | "referral_submission"
  | "property_manager_referral"
  | "emergency_service_request"
  | "landing_page_lead";

export type WebsiteLeadCaptureFormDefinition = {
  key: WebsiteLeadCaptureFormType;
  label: string;
  aliases: string[];
  serviceType: ServiceType | null;
  defaultUrgency: LeadIntakeUrgency;
  defaultLeadSourceLabel: string;
  suggestedNextAction: string;
};

export type WebsiteLeadCaptureFormResolution = {
  form: WebsiteLeadCaptureFormDefinition | null;
  status: "matched" | "defaulted" | "unsupported" | "unknown";
  submittedFormType: string | null;
  warnings: string[];
};

export type WebsiteLeadCaptureOriginVerificationResult = {
  ok: boolean;
  status: WebsiteLeadCaptureOriginStatus;
  origin: string | null;
  summary: string;
};

export type WebsiteLeadCaptureSourceRuntimeStatus = {
  key: WebsiteLeadCaptureSourceKey;
  label: string;
  companyLabel: "WeatherTech" | "IHC";
  branchLabel: string;
  configuredSourceIds: string[];
  acceptedFormTypes: WebsiteLeadCaptureFormType[];
  authenticationMethod: WebsiteLeadCaptureAuthenticationMethod;
  allowedOrigins: string[];
  productionEnabled: boolean;
  productionState: WebsiteLeadCaptureProductionState;
  productionLabel: string;
  hasSigningSecret: boolean;
  lastSuccessfulSubmissionAt: string | null;
  lastFailureAt: string | null;
};

export type WebsiteLeadCaptureSafeLogContext = {
  body: WebsiteLeadRequestBody;
  resolution: WebsiteLeadCaptureSourceResolution;
  formResolution: WebsiteLeadCaptureFormResolution;
  verification?: WebsiteLeadCaptureVerificationResult | null;
  originVerification?: WebsiteLeadCaptureOriginVerificationResult | null;
  abuse?: WebsiteLeadCaptureAbuseResult | null;
  correlationId?: string | null;
  rawBody?: string | null;
};

export const websiteLeadCaptureEndpointPath = "/api/leads/website";
export const websiteLeadCaptureDryRunPath = "/api/leads/website?dryRun=1";
export const websiteLeadCaptureMaxPayloadBytes = 32_000;
export const websiteLeadCaptureSignatureHeader = "x-weathertech-signature";
export const websiteLeadCaptureTimestampHeader = "x-weathertech-timestamp";
export const websiteLeadCaptureSourceHeader = "x-weathertech-source";
export const websiteLeadCaptureOriginHeader = "origin";
export const websiteLeadCaptureSharedSecretEnvVar =
  "WEBSITE_LEAD_CAPTURE_SECRET";

export const websiteLeadCaptureEnvVars = {
  enabled: "WEBSITE_INTAKE_ENABLED",
  signingSecret: "WEBSITE_INTAKE_SIGNING_SECRET",
  legacySigningSecret: websiteLeadCaptureSharedSecretEnvVar,
  allowedOrigins: "WEBSITE_ALLOWED_ORIGINS",
  rateLimitEnabled: "WEBSITE_RATE_LIMIT_ENABLED",
  spamProtectionEnabled: "WEBSITE_SPAM_PROTECTION_ENABLED",
  productionSourceIds: "WEBSITE_PRODUCTION_ENABLED_SOURCE_IDS",
  weatherTechPhoenixSourceId: "WEATHERTECH_WEBSITE_SOURCE_ID",
  weatherTechTucsonSourceId: "WEATHERTECH_TUCSON_WEBSITE_SOURCE_ID",
  ihcSourceId: "IHC_WEBSITE_SOURCE_ID",
} as const;

export const websiteLeadCaptureFormDefinitions: WebsiteLeadCaptureFormDefinition[] = [
  {
    key: "contact_request",
    label: "Contact request",
    aliases: ["contact", "contact-request", "general-contact"],
    serviceType: null,
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website contact request",
    suggestedNextAction: "Call new website lead",
  },
  {
    key: "roofing_estimate_request",
    label: "Roofing estimate request",
    aliases: ["roofing-estimate", "roof-estimate", "estimate-request"],
    serviceType: "roofing",
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website roofing estimate request",
    suggestedNextAction: "Prepare roofing estimate follow-up",
  },
  {
    key: "roof_inspection_request",
    label: "Roof inspection request",
    aliases: ["roof-inspection", "inspection-request", "roofing-inspection"],
    serviceType: "roofing",
    defaultUrgency: "high",
    defaultLeadSourceLabel: "Website roof inspection request",
    suggestedNextAction: "Schedule roof inspection",
  },
  {
    key: "roof_repair_request",
    label: "Roof repair request",
    aliases: ["roof-repair", "leak-repair", "repair-request"],
    serviceType: "roofing",
    defaultUrgency: "high",
    defaultLeadSourceLabel: "Website roof repair request",
    suggestedNextAction: "Review roof repair request",
  },
  {
    key: "painting_estimate_request",
    label: "Painting estimate request",
    aliases: ["painting-estimate", "paint-estimate", "ihc-estimate"],
    serviceType: "painting",
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website painting estimate request",
    suggestedNextAction: "Prepare painting estimate follow-up",
  },
  {
    key: "interior_painting_request",
    label: "Interior painting request",
    aliases: ["interior-painting", "interior-paint"],
    serviceType: "painting",
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website interior painting request",
    suggestedNextAction: "Review interior painting request",
  },
  {
    key: "exterior_painting_request",
    label: "Exterior painting request",
    aliases: ["exterior-painting", "exterior-paint"],
    serviceType: "painting",
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website exterior painting request",
    suggestedNextAction: "Review exterior painting request",
  },
  {
    key: "general_service_inquiry",
    label: "General service inquiry",
    aliases: ["general-service", "service-inquiry", "general-inquiry"],
    serviceType: null,
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website service inquiry",
    suggestedNextAction: "Qualify website service request",
  },
  {
    key: "commercial_inquiry",
    label: "Commercial inquiry",
    aliases: ["commercial", "commercial-request", "commercial-lead"],
    serviceType: null,
    defaultUrgency: "high",
    defaultLeadSourceLabel: "Website commercial inquiry",
    suggestedNextAction: "Contact commercial prospect",
  },
  {
    key: "referral_submission",
    label: "Referral submission",
    aliases: ["referral", "customer-referral"],
    serviceType: null,
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website referral submission",
    suggestedNextAction: "Review referral submission",
  },
  {
    key: "property_manager_referral",
    label: "Realtor or property-manager referral",
    aliases: ["property-manager", "realtor-referral", "property-manager-referral"],
    serviceType: null,
    defaultUrgency: "high",
    defaultLeadSourceLabel: "Website property manager referral",
    suggestedNextAction: "Contact property manager referral",
  },
  {
    key: "emergency_service_request",
    label: "Emergency or urgent service request",
    aliases: ["emergency", "urgent", "emergency-leak", "urgent-service"],
    serviceType: null,
    defaultUrgency: "urgent",
    defaultLeadSourceLabel: "Website urgent service request",
    suggestedNextAction: "Call urgent website lead immediately",
  },
  {
    key: "landing_page_lead",
    label: "Landing-page lead form",
    aliases: ["landing-page", "campaign-form", "landing-page-lead"],
    serviceType: null,
    defaultUrgency: "normal",
    defaultLeadSourceLabel: "Website landing page lead",
    suggestedNextAction: "Review landing-page lead",
  },
];

const weatherTechWebsiteFormTypes: WebsiteLeadCaptureFormType[] = [
  "contact_request",
  "roofing_estimate_request",
  "roof_inspection_request",
  "roof_repair_request",
  "general_service_inquiry",
  "commercial_inquiry",
  "referral_submission",
  "property_manager_referral",
  "emergency_service_request",
  "landing_page_lead",
];

const ihcWebsiteFormTypes: WebsiteLeadCaptureFormType[] = [
  "contact_request",
  "painting_estimate_request",
  "interior_painting_request",
  "exterior_painting_request",
  "general_service_inquiry",
  "commercial_inquiry",
  "referral_submission",
  "property_manager_referral",
  "landing_page_lead",
];

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
    allowedOrigins: [
      "https://weathertechroofingaz.com",
      "https://www.weathertechroofingaz.com",
    ],
    allowedOriginsEnvVar: "WEATHERTECH_WEBSITE_ALLOWED_ORIGINS",
    sourceIds: [
      "weathertech-phoenix",
      "weathertech-roofing-phoenix",
      "wtr-phoenix",
    ],
    sourceIdEnvVar: websiteLeadCaptureEnvVars.weatherTechPhoenixSourceId,
    formIdentifiers: [
      "weathertech-phoenix-contact",
      "weathertech-roofing-phoenix-contact",
      "weathertech-contact-phoenix",
    ],
    acceptedFormTypes: weatherTechWebsiteFormTypes,
    authenticationMethod: "hmac_sha256",
    campaign: "website-phoenix",
    sourceDetail: "WeatherTech Phoenix website",
    defaultLeadSourceLabel: "WeatherTech website",
    defaultQueue: "weathertech-roofing-phoenix",
    status: "enabled",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "WEBSITE_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX",
    productionEnabledEnvVar: "WEATHERTECH_WEBSITE_INTAKE_ENABLED",
    productionEnabledByDefault: false,
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
    allowedOrigins: [
      "https://weathertechroofingaz.com",
      "https://www.weathertechroofingaz.com",
    ],
    allowedOriginsEnvVar: "WEATHERTECH_TUCSON_WEBSITE_ALLOWED_ORIGINS",
    sourceIds: [
      "weathertech-tucson",
      "weathertech-roofing-tucson",
      "wtr-tucson",
    ],
    sourceIdEnvVar: websiteLeadCaptureEnvVars.weatherTechTucsonSourceId,
    formIdentifiers: [
      "weathertech-tucson-contact",
      "weathertech-roofing-tucson-contact",
      "weathertech-contact-tucson",
    ],
    acceptedFormTypes: weatherTechWebsiteFormTypes,
    authenticationMethod: "hmac_sha256",
    campaign: "website-tucson",
    sourceDetail: "WeatherTech Tucson website",
    defaultLeadSourceLabel: "WeatherTech website",
    defaultQueue: "weathertech-roofing-tucson",
    status: "enabled",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "WEBSITE_LEAD_CAPTURE_SECRET_WEATHERTECH_TUCSON",
    productionEnabledEnvVar: "WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED",
    productionEnabledByDefault: false,
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
    allowedOrigins: [],
    allowedOriginsEnvVar: "IHC_WEBSITE_ALLOWED_ORIGINS",
    sourceIds: ["ihc", "ihc-painting", "ihc-website"],
    sourceIdEnvVar: websiteLeadCaptureEnvVars.ihcSourceId,
    formIdentifiers: [
      "ihc-contact",
      "ihc-painting-contact",
      "ihc-website-contact",
    ],
    acceptedFormTypes: ihcWebsiteFormTypes,
    authenticationMethod: "hmac_sha256",
    campaign: "website-ihc",
    sourceDetail: "IHC website",
    defaultLeadSourceLabel: "IHC website",
    defaultQueue: "ihc-painting",
    status: "enabled",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "WEBSITE_LEAD_CAPTURE_SECRET_IHC",
    productionEnabledEnvVar: "IHC_WEBSITE_INTAKE_ENABLED",
    productionEnabledByDefault: false,
    routingStatus: "needs_configuration",
  },
];

export const websiteLeadCaptureSecretEnvVars = [
  websiteLeadCaptureEnvVars.signingSecret,
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

function getSubmittedFormType(body: WebsiteLeadRequestBody) {
  return (
    getText(body.formType, 160) ??
    getText(body.formCategory, 160) ??
    getText(body.formIdentifier, 160) ??
    getText(body.formId, 160) ??
    getText(body.requestedService, 160) ??
    getText(body.serviceType, 160)
  );
}

function getEnvList(env: NodeJS.ProcessEnv, key: string) {
  return (env[key] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getEnvFlag(env: NodeJS.ProcessEnv, key: string, defaultValue = false) {
  const value = env[key]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "enabled", "on"].includes(value);
}

export function getWebsiteLeadCaptureConfiguredSourceIds(
  source: WebsiteLeadCaptureSource,
  env: NodeJS.ProcessEnv = process.env,
) {
  return [
    ...source.sourceIds,
    ...getEnvList(env, source.sourceIdEnvVar),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

export function getWebsiteLeadCaptureAllowedOrigins(
  source: WebsiteLeadCaptureSource,
  env: NodeJS.ProcessEnv = process.env,
) {
  return [
    ...source.allowedOrigins,
    ...getEnvList(env, websiteLeadCaptureEnvVars.allowedOrigins),
    ...getEnvList(env, source.allowedOriginsEnvVar),
  ]
    .map((origin) => normalizeWebsiteLeadCaptureOrigin(origin))
    .filter((origin): origin is string => Boolean(origin))
    .filter((origin, index, values) => values.indexOf(origin) === index);
}

export function isWebsiteLeadCaptureRateLimitEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return getEnvFlag(env, websiteLeadCaptureEnvVars.rateLimitEnabled, true);
}

export function isWebsiteLeadCaptureSpamProtectionEnabled(
  env: NodeJS.ProcessEnv = process.env,
) {
  return getEnvFlag(env, websiteLeadCaptureEnvVars.spamProtectionEnabled, true);
}

export function isWebsiteLeadCaptureProductionEnabled(
  source: WebsiteLeadCaptureSource | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!source) {
    return false;
  }

  const globalEnabled = getEnvFlag(env, websiteLeadCaptureEnvVars.enabled, false);
  const sourceEnabled = getEnvFlag(
    env,
    source.productionEnabledEnvVar,
    source.productionEnabledByDefault,
  );
  const enabledSourceIds = getEnvList(env, websiteLeadCaptureEnvVars.productionSourceIds)
    .map(getToken);
  const sourceIdEnabled =
    enabledSourceIds.length === 0 ||
    enabledSourceIds.some((token) =>
      getWebsiteLeadCaptureConfiguredSourceIds(source, env)
        .map(getToken)
        .includes(token),
    );

  return globalEnabled && sourceEnabled && sourceIdEnabled;
}

function getHeaderValue(headers: HeadersLike, key: string) {
  if (headers instanceof Headers) {
    return headers.get(key)?.trim() ?? null;
  }

  const exactValue = headers[key] ?? headers[key.toLowerCase()];
  const value = Array.isArray(exactValue) ? exactValue[0] : exactValue;

  return value?.trim() ?? null;
}

export function normalizeWebsiteLeadCaptureOrigin(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);

    return `${url.protocol}//${url.hostname.toLowerCase()}${
      url.port ? `:${url.port}` : ""
    }`;
  } catch {
    return null;
  }
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

function sourceMatchesToken(
  source: WebsiteLeadCaptureSource,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const registryTokens = [
    source.key,
    ...getWebsiteLeadCaptureConfiguredSourceIds(source, env),
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
  env: NodeJS.ProcessEnv = process.env,
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
    sourceTokens.some((token) => sourceMatchesToken(source, token, env)),
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

export function resolveWebsiteLeadCaptureForm(
  body: WebsiteLeadRequestBody,
  source: WebsiteLeadCaptureSource | null,
): WebsiteLeadCaptureFormResolution {
  const submittedFormType = getSubmittedFormType(body);
  const submittedToken = getToken(submittedFormType);
  const availableDefinitions = websiteLeadCaptureFormDefinitions.filter((definition) =>
    source ? source.acceptedFormTypes.includes(definition.key) : true,
  );

  if (!submittedToken) {
    const defaultForm = availableDefinitions.find(
      (definition) => definition.key === "contact_request",
    ) ?? availableDefinitions[0] ?? null;

    return {
      form: defaultForm,
      status: defaultForm ? "defaulted" : "unknown",
      submittedFormType: null,
      warnings: defaultForm
        ? ["Website form type was not supplied. Contact request defaults were used."]
        : ["Website form type was not supplied and no source form defaults exist."],
    };
  }

  const matchesDefinition = (definition: WebsiteLeadCaptureFormDefinition) => {
    const aliases = [definition.key, definition.label, ...definition.aliases].map(getToken);

    return aliases.includes(submittedToken);
  };
  const matchedDefinition = websiteLeadCaptureFormDefinitions.find(matchesDefinition) ?? null;

  if (
    matchedDefinition &&
    (!source || source.acceptedFormTypes.includes(matchedDefinition.key))
  ) {
    return {
      form: matchedDefinition,
      status: "matched",
      submittedFormType,
      warnings: [],
    };
  }

  if (
    source &&
    source.formIdentifiers.some((identifier) => getToken(identifier) === submittedToken)
  ) {
    const contactForm =
      availableDefinitions.find((definition) => definition.key === "contact_request") ??
      availableDefinitions[0] ??
      null;

    return {
      form: contactForm,
      status: contactForm ? "defaulted" : "unknown",
      submittedFormType,
      warnings: contactForm
        ? [
            "Legacy website form identifier was accepted and routed through the contact-request form type.",
          ]
        : ["Legacy website form identifier matched, but no accepted source form type exists."],
    };
  }

  return {
    form: matchedDefinition,
    status: "unsupported",
    submittedFormType,
    warnings: [
      matchedDefinition
        ? `${matchedDefinition.label} is not approved for this website source.`
        : "Website form type is not supported by the approved intake registry.",
    ],
  };
}

export function verifyWebsiteLeadCaptureOrigin({
  headers,
  source,
  dryRun = false,
  env = process.env,
}: {
  headers: HeadersLike;
  source: WebsiteLeadCaptureSource | null;
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
}): WebsiteLeadCaptureOriginVerificationResult {
  if (dryRun) {
    return {
      ok: true,
      status: "dry_run",
      origin: null,
      summary: "Dry-run preview. Origin validation was not required.",
    };
  }

  const origin = normalizeWebsiteLeadCaptureOrigin(
    getHeaderValue(headers, websiteLeadCaptureOriginHeader),
  );

  if (!origin) {
    return {
      ok: true,
      status: "not_supplied",
      origin,
      summary: "Origin header was not supplied. Server-to-server submissions may omit it.",
    };
  }

  if (!source) {
    return {
      ok: true,
      status: "not_configured",
      origin,
      summary: "Origin could not be matched because the website source was not resolved.",
    };
  }

  const allowedOrigins = getWebsiteLeadCaptureAllowedOrigins(source, env);

  if (allowedOrigins.length === 0) {
    return {
      ok: true,
      status: "not_configured",
      origin,
      summary: "No allowed origins are configured for this source yet.",
    };
  }

  if (allowedOrigins.includes(origin)) {
    return {
      ok: true,
      status: "valid",
      origin,
      summary: "Origin matches an approved website source.",
    };
  }

  return {
    ok: false,
    status: "invalid_origin",
    origin,
    summary: "Origin does not match the approved website source list.",
  };
}

export function createWebsiteLeadCaptureRequestFingerprint({
  rawBody,
  source,
  externalId,
}: {
  rawBody: string;
  source: WebsiteLeadCaptureSource | null;
  externalId?: string | null;
}) {
  return createHash("sha256")
    .update(`${source?.key ?? "unknown"}:${externalId ?? ""}:${rawBody}`)
    .digest("hex");
}

function getLogSourceKey(log: IntegrationSyncLogRecord) {
  const summary = log.request_summary;
  const sourceMetadata =
    summary &&
    typeof summary === "object" &&
    "sourceMetadata" in summary &&
    summary.sourceMetadata &&
    typeof summary.sourceMetadata === "object"
      ? (summary.sourceMetadata as Record<string, unknown>)
      : null;
  const directKey =
    summary &&
    typeof summary === "object" &&
    typeof summary.sourceRegistryKey === "string"
      ? summary.sourceRegistryKey
      : null;
  const metadataKey =
    typeof sourceMetadata?.sourceRegistryKey === "string"
      ? sourceMetadata.sourceRegistryKey
      : null;

  return directKey ?? metadataKey ?? null;
}

function getLogTimestamp(log: IntegrationSyncLogRecord) {
  return log.completed_at ?? log.last_attempted_at ?? log.updated_at ?? log.created_at;
}

function getProductionLabel(state: WebsiteLeadCaptureProductionState) {
  if (state === "active") {
    return "Production enabled";
  }

  if (state === "ready_for_testing") {
    return "Ready for signed testing";
  }

  if (state === "authentication_failed") {
    return "Authentication failing";
  }

  if (state === "intake_error") {
    return "Intake error";
  }

  return "Production disabled";
}

export function buildWebsiteLeadCaptureSourceRuntimeStatuses({
  logs,
  env = process.env,
}: {
  logs: IntegrationSyncLogRecord[];
  env?: NodeJS.ProcessEnv;
}): WebsiteLeadCaptureSourceRuntimeStatus[] {
  return websiteLeadCaptureSources.map((source) => {
    const sourceLogs = logs.filter(
      (log) => log.provider === "website" && getLogSourceKey(log) === source.key,
    );
    const successfulLogs = sourceLogs.filter((log) => log.status === "succeeded");
    const failureLogs = sourceLogs.filter(
      (log) => log.status === "failed" || log.status === "retrying",
    );
    const lastSuccessfulSubmissionAt =
      successfulLogs.map(getLogTimestamp).sort().at(-1) ?? null;
    const lastFailureAt = failureLogs.map(getLogTimestamp).sort().at(-1) ?? null;
    const hasSigningSecret = Boolean(getWebsiteLeadCaptureSecret(source, env));
    const productionEnabled = isWebsiteLeadCaptureProductionEnabled(source, env);
    const latestFailure = failureLogs
      .slice()
      .sort((a, b) => getLogTimestamp(a).localeCompare(getLogTimestamp(b)))
      .at(-1);
    const latestFailureIsNewest =
      Boolean(lastFailureAt) &&
      (!lastSuccessfulSubmissionAt || lastFailureAt! > lastSuccessfulSubmissionAt);
    const productionState: WebsiteLeadCaptureProductionState = latestFailureIsNewest
      ? latestFailure?.error_code === "missing_signature" ||
        latestFailure?.error_code === "invalid_signature" ||
        latestFailure?.error_code === "verification_required" ||
        latestFailure?.error_code === "invalid_origin"
        ? "authentication_failed"
        : "intake_error"
      : productionEnabled
        ? "active"
        : hasSigningSecret
          ? "ready_for_testing"
          : "production_disabled";

    return {
      key: source.key,
      label: source.label,
      companyLabel: source.companyLabel,
      branchLabel: source.branchLabel,
      configuredSourceIds: getWebsiteLeadCaptureConfiguredSourceIds(source, env),
      acceptedFormTypes: source.acceptedFormTypes,
      authenticationMethod: source.authenticationMethod,
      allowedOrigins: getWebsiteLeadCaptureAllowedOrigins(source, env),
      productionEnabled,
      productionState,
      productionLabel: getProductionLabel(productionState),
      hasSigningSecret,
      lastSuccessfulSubmissionAt,
      lastFailureAt,
    };
  });
}

export function getWebsiteLeadCaptureSecret(
  source: WebsiteLeadCaptureSource | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  const sourceSecret = source ? env[source.secretEnvVar]?.trim() : null;
  const signingSecret = env[websiteLeadCaptureEnvVars.signingSecret]?.trim();
  const sharedSecret = env[websiteLeadCaptureSharedSecretEnvVar]?.trim();

  return sourceSecret || signingSecret || sharedSecret || null;
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
    body.websiteUrl ??
      body.pageUrl ??
      body.landingPage ??
      body.website ??
      body.domain ??
      body.referringPage ??
      body.referrer,
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
  formResolution = resolveWebsiteLeadCaptureForm(body, resolution.source),
  verification,
  originVerification = null,
  abuse,
  correlationId,
  rawBody = null,
}: {
  body: WebsiteLeadRequestBody;
  resolution: WebsiteLeadCaptureSourceResolution;
  formResolution?: WebsiteLeadCaptureFormResolution;
  verification: WebsiteLeadCaptureVerificationResult;
  originVerification?: WebsiteLeadCaptureOriginVerificationResult | null;
  abuse: WebsiteLeadCaptureAbuseResult;
  correlationId?: string | null;
  rawBody?: string | null;
}): WebsiteLeadRequestBody {
  const source = resolution.source;
  const form = formResolution.form;
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
      : formResolution.status === "unsupported"
        ? formResolution.warnings.join(" ")
        : resolution.status === "matched"
        ? null
        : [...resolution.warnings, ...formResolution.warnings].join(" ");
  const serviceType =
    sanitizeText(body.serviceType ?? body.requestedService ?? body.service, 80) ??
    form?.serviceType ??
    null;
  const textConsent =
    typeof body.textConsent === "boolean" ? body.textConsent : body.smsConsent;

  return {
    business: source?.companyLabel ?? "Unassigned",
    location: source?.branchLabel ?? sanitizeText(body.city ?? body.location, 120),
    city: sanitizeText(body.city ?? body.location, 120),
    state: sanitizeText(body.state, 40) ?? "AZ",
    zip: sanitizeText(body.zip ?? body.postalCode, 20),
    postalCode: sanitizeText(body.zip ?? body.postalCode, 20),
    source: form?.defaultLeadSourceLabel ?? source?.defaultLeadSourceLabel ?? "Website",
    sourceDetail,
    sourceId: source?.key ?? sanitizeText(body.sourceId ?? body.websiteSource, 120),
    websiteSource:
      source?.key ?? sanitizeText(body.websiteSource ?? body.sourceId, 120),
    formType: form?.key ?? sanitizeText(body.formType ?? body.formCategory, 160),
    formCategory: form?.label ?? sanitizeText(body.formCategory ?? body.formType, 160),
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
    serviceType,
    requestedService: serviceType,
    preferredAppointmentTime: sanitizeText(body.preferredAppointmentTime, 120),
    projectType: sanitizeText(body.projectType, 120),
    projectDescription: sanitizeText(body.projectDescription, 1500),
    message: sanitizeText(
      body.message ??
        body.projectDescription ??
        body.comments ??
        body.notes,
      1500,
    ),
    preferredContactMethod: sanitizeText(
      body.preferredContactMethod ?? body.preferredContact,
      40,
    ),
    websiteUrl: getSourceUrl(body, source),
    pageUrl: sanitizeText(body.pageUrl ?? body.landingPage, 240),
    referrer: sanitizeText(body.referrer ?? body.referringPage, 240),
    referralSource: sanitizeText(body.referralSource, 160),
    referringPage: sanitizeText(body.referringPage, 240),
    utmSource: sanitizeText(body.utmSource, 120) ?? "website",
    utmCampaign: sanitizeText(body.utmCampaign ?? body.campaign, 160) ??
      source?.campaign,
    utmMedium: sanitizeText(body.utmMedium, 120) ?? "form",
    utmTerm: sanitizeText(body.utmTerm, 160),
    utmContent: sanitizeText(body.utmContent, 160),
    gclid: sanitizeText(body.gclid ?? body.googleClickId, 220),
    googleClickId: sanitizeText(body.googleClickId ?? body.gclid, 220),
    campaignId: sanitizeText(body.campaignId, 160),
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
    smsConsent: typeof textConsent === "boolean" ? textConsent : null,
    textConsent: typeof textConsent === "boolean" ? textConsent : null,
    callConsent: typeof body.callConsent === "boolean" ? body.callConsent : null,
    emailConsent:
      typeof body.emailConsent === "boolean" ? body.emailConsent : null,
    privacyPolicyAccepted:
      typeof body.privacyPolicyAccepted === "boolean"
        ? body.privacyPolicyAccepted
        : null,
    consentSource: sanitizeText(body.consentSource, 120),
    consentCapturedAt: sanitizeText(body.consentCapturedAt, 80),
    captchaResult: sanitizeText(body.captchaResult, 120),
    spamVerificationResult: sanitizeText(body.spamVerificationResult, 120),
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
      formType: form?.key ?? null,
      formLabel: form?.label ?? null,
      formResolutionStatus: formResolution.status,
      submittedFormType: formResolution.submittedFormType,
      defaultLeadSourceLabel: form?.defaultLeadSourceLabel ?? source?.defaultLeadSourceLabel ?? null,
      suggestedNextAction: form?.suggestedNextAction ?? "Review website lead",
      verificationStatus: verification.status,
      verificationMethod: source?.verificationMethod ?? "hmac_sha256",
      originStatus: originVerification?.status ?? null,
      origin: originVerification?.origin ?? null,
      authenticationMethod: source?.authenticationMethod ?? "hmac_sha256",
      productionEnabled: isWebsiteLeadCaptureProductionEnabled(source),
      allowedOriginConfigured: source
        ? getWebsiteLeadCaptureAllowedOrigins(source).length > 0
        : false,
      routingStatus: source?.routingStatus ?? "needs_configuration",
      defaultQueue: source?.defaultQueue ?? "lead-intake-review",
      spamReviewStatus: abuse.status,
      spamSignals: abuse.signals.map((signal) => signal.code),
      attribution: {
        website: sanitizeText(body.website ?? body.domain, 180),
        landingPage: sanitizeText(body.landingPage ?? body.pageUrl, 240),
        referrer: sanitizeText(body.referrer ?? body.referringPage, 240),
        referralSource: sanitizeText(body.referralSource, 160),
        utmSource: sanitizeText(body.utmSource, 120),
        utmMedium: sanitizeText(body.utmMedium, 120),
        utmCampaign: sanitizeText(body.utmCampaign ?? body.campaign, 160),
        utmTerm: sanitizeText(body.utmTerm, 160),
        utmContent: sanitizeText(body.utmContent, 160),
        campaignId: sanitizeText(body.campaignId, 160),
        clickIdPresent: Boolean(sanitizeText(body.gclid ?? body.googleClickId, 220)),
      },
      consent: {
        sms: typeof textConsent === "boolean" ? textConsent : null,
        call: typeof body.callConsent === "boolean" ? body.callConsent : null,
        email:
          typeof body.emailConsent === "boolean" ? body.emailConsent : null,
        privacyPolicyAccepted:
          typeof body.privacyPolicyAccepted === "boolean"
            ? body.privacyPolicyAccepted
            : null,
        source: sanitizeText(body.consentSource, 120),
        capturedAt: sanitizeText(body.consentCapturedAt, 80),
      },
      payloadHash: rawBody
        ? createHash("sha256").update(rawBody).digest("hex")
        : null,
    },
  };
}

export function buildWebsiteLeadCaptureSafeLogSummary({
  body,
  resolution,
  formResolution,
  verification = null,
  originVerification = null,
  abuse = null,
  correlationId = null,
  rawBody = null,
}: WebsiteLeadCaptureSafeLogContext) {
  return sanitizeIntegrationSyncLogSummary({
    sourceRegistryKey: resolution.source?.key ?? null,
    sourceResolutionStatus: resolution.status,
    submittedSourceId: resolution.submittedSourceId,
    submittedFormIdentifier: resolution.submittedFormIdentifier,
    submittedDomain: resolution.submittedDomain,
    formType: formResolution.form?.key ?? null,
    formLabel: formResolution.form?.label ?? null,
    formResolutionStatus: formResolution.status,
    submittedFormType: formResolution.submittedFormType,
    verificationStatus: verification?.status ?? null,
    originStatus: originVerification?.status ?? null,
    origin: originVerification?.origin ?? null,
    productionEnabled: isWebsiteLeadCaptureProductionEnabled(resolution.source),
    spamReviewStatus: abuse?.status ?? null,
    spamSignals: abuse?.signals.map((signal) => signal.code) ?? [],
    attribution: {
      website: sanitizeText(body.website ?? body.domain, 180),
      landingPage: sanitizeText(body.landingPage ?? body.pageUrl, 240),
      referralSource: sanitizeText(body.referralSource, 160),
      utmSource: sanitizeText(body.utmSource, 120),
      utmMedium: sanitizeText(body.utmMedium, 120),
      utmCampaign: sanitizeText(body.utmCampaign ?? body.campaign, 160),
      utmTerm: sanitizeText(body.utmTerm, 160),
      utmContent: sanitizeText(body.utmContent, 160),
      campaignId: sanitizeText(body.campaignId, 160),
      clickIdPresent: Boolean(sanitizeText(body.gclid ?? body.googleClickId, 220)),
    },
    contact: {
      hasName: Boolean(buildName(body)),
      hasPhone: Boolean(sanitizeText(body.phone, 40)),
      hasEmail: Boolean(sanitizeText(body.email, 160)),
    },
    property: {
      hasAddress: Boolean(
        sanitizeText(body.address ?? body.serviceAddress ?? body.streetAddress, 240),
      ),
      hasLocation: Boolean(sanitizeText(body.city ?? body.location, 120)),
    },
    message: {
      hasMessage: Boolean(
        sanitizeText(
          body.message ?? body.projectDescription ?? body.comments ?? body.notes,
          1500,
        ),
      ),
      length:
        sanitizeText(
          body.message ?? body.projectDescription ?? body.comments ?? body.notes,
          1500,
        )?.length ?? 0,
    },
    consent: {
      sms:
        typeof body.textConsent === "boolean"
          ? body.textConsent
          : typeof body.smsConsent === "boolean"
            ? body.smsConsent
            : null,
      call: typeof body.callConsent === "boolean" ? body.callConsent : null,
      email:
        typeof body.emailConsent === "boolean" ? body.emailConsent : null,
      privacyPolicyAccepted:
        typeof body.privacyPolicyAccepted === "boolean"
          ? body.privacyPolicyAccepted
          : null,
      source: sanitizeText(body.consentSource, 120),
      capturedAt: sanitizeText(body.consentCapturedAt, 80),
    },
    correlationId: sanitizeText(correlationId, 120),
    payloadHash: rawBody
      ? createHash("sha256").update(rawBody).digest("hex")
      : null,
  });
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
  const hasSharedSecret = Boolean(
    env[websiteLeadCaptureEnvVars.signingSecret]?.trim() ||
      env[websiteLeadCaptureSharedSecretEnvVar]?.trim(),
  );
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
      "Add hidden sourceId and formType values to each approved website form.",
      "Configure allowed origins for each approved domain as a secondary control.",
      "Run dry-run previews and signed test submissions for WeatherTech Phoenix, WeatherTech Tucson, and IHC.",
      "Set WEBSITE_INTAKE_ENABLED and the source-specific production flag only after owner-approved live form testing.",
    ],
  };
}
