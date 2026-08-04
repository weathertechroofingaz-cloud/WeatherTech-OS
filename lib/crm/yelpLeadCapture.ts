import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { YelpLeadRequestBody } from "./leadIntake";
import { sanitizeIntegrationSyncLogSummary } from "./integrations";
import type {
  CanonicalLeadBranchKey,
  CanonicalLeadCompanyKey,
} from "./leadRouting";
import type { IntegrationSyncLogRecord } from "./types";

type HeadersLike = Headers | Record<string, string | string[] | undefined>;

export type YelpLeadCaptureAccountKey =
  | "weathertech-phoenix"
  | "weathertech-tucson"
  | "ihc";

export type YelpLeadCaptureVerificationMethod = "hmac_sha256";
export type YelpLeadCaptureAccountStatus = "enabled" | "disabled";
export type YelpLeadCaptureRoutingStatus =
  | "ready_to_route"
  | "needs_configuration";
export type YelpLeadCaptureAuthorizationStatus =
  | "partner_approval_required"
  | "oauth_required"
  | "manual_import_ready"
  | "connected";
export type YelpLeadCaptureConnectionStatus =
  | "not_connected"
  | "configuration_required"
  | "approval_required"
  | "ready_for_manual_intake"
  | "connected"
  | "disabled"
  | "error";
export type YelpLeadCaptureCapability =
  | "manual_import"
  | "dry_run_testing"
  | "partner_leads_api"
  | "partner_webhooks"
  | "oauth"
  | "outbound_reply";
export type YelpLeadCaptureCapabilityStatus =
  | "available"
  | "ready"
  | "disabled"
  | "partner_required"
  | "unsupported";
export type YelpLeadCaptureProductionState =
  | "production_disabled"
  | "partner_access_required"
  | "credentials_required"
  | "ready_for_signed_testing"
  | "live_sync_enabled"
  | "authentication_failed"
  | "intake_error";
export type YelpLeadCaptureResolutionStatus =
  | "matched"
  | "ambiguous"
  | "unknown"
  | "disabled";
export type YelpLeadCaptureVerificationStatus =
  | "valid"
  | "missing_signature"
  | "invalid_signature"
  | "verification_required"
  | "dry_run";
export type YelpLeadCaptureAbuseStatus =
  | "clear"
  | "review_required"
  | "blocked";
export type YelpLeadCaptureReadinessState =
  | "not_configured"
  | "account_registry_ready"
  | "credentials_required"
  | "verification_required"
  | "endpoint_ready"
  | "testing_required"
  | "ready_for_production_configuration"
  | "connected"
  | "error";

export type YelpLeadCaptureAccount = {
  key: YelpLeadCaptureAccountKey;
  label: string;
  companyKey: Exclude<CanonicalLeadCompanyKey, "unassigned">;
  companyLabel: "WeatherTech" | "IHC";
  branchKey: Exclude<CanonicalLeadBranchKey, "unassigned">;
  branchLabel: string;
  providerAccountIdentifier: string;
  businessIdEnvVar: string;
  accountAliases: string[];
  accountIdEnvVar: string;
  purpose: string;
  sourceDetail: string;
  campaign: string;
  defaultQueue: string;
  status: YelpLeadCaptureAccountStatus;
  authorizationStatus: YelpLeadCaptureAuthorizationStatus;
  connectionStatus: YelpLeadCaptureConnectionStatus;
  leadIngestionCapability: YelpLeadCaptureCapabilityStatus;
  conversationCapability: YelpLeadCaptureCapabilityStatus;
  outboundMessagingCapability: YelpLeadCaptureCapabilityStatus;
  liveSyncEnabledEnvVar: string;
  outboundMessagingEnabledEnvVar: string;
  verificationMethod: YelpLeadCaptureVerificationMethod;
  secretEnvVar: string;
  routingStatus: YelpLeadCaptureRoutingStatus;
};

export type YelpLeadCaptureAccountResolution = {
  account: YelpLeadCaptureAccount | null;
  status: YelpLeadCaptureResolutionStatus;
  submittedAccountIdentifier: string | null;
  submittedBusinessIdentifier: string | null;
  submittedConversationIdentifier: string | null;
  warnings: string[];
};

export type YelpLeadCaptureVerificationResult = {
  ok: boolean;
  status: YelpLeadCaptureVerificationStatus;
  summary: string;
  checkedAt: string;
};

export type YelpLeadCaptureAbuseSignal = {
  code:
    | "blocked_account"
    | "honeypot"
    | "stale_submission"
    | "future_submission"
    | "suspicious_links"
    | "script_like_content";
  label: string;
  severity: "review" | "block";
};

export type YelpLeadCaptureAbuseResult = {
  status: YelpLeadCaptureAbuseStatus;
  signals: YelpLeadCaptureAbuseSignal[];
  reviewReason: string | null;
};

export type YelpLeadCaptureReadiness = {
  state: YelpLeadCaptureReadinessState;
  label: string;
  endpointPath: string;
  dryRunPath: string;
  configuredAccountCount: number;
  enabledAccountCount: number;
  configuredVerificationCount: number;
  configuredProviderAccountCount: number;
  configuredBusinessIdCount: number;
  oauthClientConfigured: boolean;
  partnerIdConfigured: boolean;
  liveSyncEnabled: boolean;
  outboundMessagingEnabled: boolean;
  ownerActions: string[];
};

export type YelpLeadCaptureOfficialCapability = {
  key: string;
  label: string;
  status: YelpLeadCaptureCapabilityStatus;
  summary: string;
  officialDocumentationUrl: string;
};

export type YelpLeadCaptureAccountRuntimeStatus = {
  key: YelpLeadCaptureAccountKey;
  label: string;
  companyLabel: "WeatherTech" | "IHC";
  branchLabel: string;
  providerAccountIdentifier: string;
  configuredAccountIdentifiers: string[];
  configuredBusinessId: string | null;
  authorizationStatus: YelpLeadCaptureAuthorizationStatus;
  connectionStatus: YelpLeadCaptureConnectionStatus;
  leadIngestionCapability: YelpLeadCaptureCapabilityStatus;
  conversationCapability: YelpLeadCaptureCapabilityStatus;
  outboundMessagingCapability: YelpLeadCaptureCapabilityStatus;
  liveSyncEnabled: boolean;
  outboundMessagingEnabled: boolean;
  productionState: YelpLeadCaptureProductionState;
  productionLabel: string;
  hasSigningSecret: boolean;
  lastSuccessfulSubmissionAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export type YelpLeadCaptureSafeLogContext = {
  body: YelpLeadRequestBody;
  resolution: YelpLeadCaptureAccountResolution;
  verification?: YelpLeadCaptureVerificationResult | null;
  abuse?: YelpLeadCaptureAbuseResult | null;
  correlationId?: string | null;
  rawBody?: string | null;
};

export const yelpLeadCaptureEndpointPath = "/api/leads/yelp";
export const yelpLeadCaptureDryRunPath = "/api/leads/yelp?dryRun=1";
export const yelpLeadCaptureMaxPayloadBytes = 32_000;
export const yelpLeadCaptureSignatureHeader = "x-weathertech-signature";
export const yelpLeadCaptureTimestampHeader = "x-weathertech-timestamp";
export const yelpLeadCaptureAccountHeader = "x-weathertech-yelp-account";
export const yelpLeadCaptureSharedSecretEnvVar = "YELP_LEAD_CAPTURE_SECRET";

export const yelpLeadCaptureEnvVars = {
  apiKey: "YELP_API_KEY",
  clientId: "YELP_CLIENT_ID",
  clientSecret: "YELP_CLIENT_SECRET",
  redirectUri: "YELP_REDIRECT_URI",
  partnerId: "YELP_PARTNER_ID",
  webhookSecret: "YELP_WEBHOOK_SECRET",
  liveSyncEnabled: "YELP_LIVE_SYNC_ENABLED",
  outboundMessagingEnabled: "YELP_OUTBOUND_MESSAGING_ENABLED",
  productionEnabledAccountIds: "YELP_PRODUCTION_ENABLED_ACCOUNT_IDS",
} as const;

export const yelpLeadCaptureOfficialCapabilities: YelpLeadCaptureOfficialCapability[] = [
  {
    key: "fusion_business_search",
    label: "Business profile lookup",
    status: "available",
    summary: "Yelp Places/Fusion supports business search and lookup for approved API keys.",
    officialDocumentationUrl: "https://docs.developer.yelp.com/reference/v3_business_search",
  },
  {
    key: "fusion_reviews",
    label: "Review excerpts",
    status: "available",
    summary: "Yelp review endpoints return limited review excerpts and require appropriate plan permission.",
    officialDocumentationUrl: "https://docs.developer.yelp.com/reference/v3_business_reviews",
  },
  {
    key: "leads_api",
    label: "Request-a-Quote leads",
    status: "partner_required",
    summary: "Yelp Leads API requires partner access, OAuth, advertising eligibility, and business subscription setup.",
    officialDocumentationUrl: "https://docs.developer.yelp.com/docs/leads-api",
  },
  {
    key: "leads_webhooks",
    label: "Lead webhooks",
    status: "partner_required",
    summary: "Yelp lead webhooks are available after partner setup and business subscriptions.",
    officialDocumentationUrl: "https://docs.developer.yelp.com/docs/leads-webhooks",
  },
  {
    key: "outbound_replies",
    label: "Yelp replies",
    status: "partner_required",
    summary: "Reply/read write actions require authorized Yelp Leads API access and are disabled in WeatherTech OS.",
    officialDocumentationUrl: "https://docs.developer.yelp.com/docs/partner-integration-guide",
  },
  {
    key: "profile_message_business",
    label: "Message the business",
    status: "unsupported",
    summary: "The Yelp Leads API documentation says Message the Business profiles are not eligible for Leads API use.",
    officialDocumentationUrl: "https://docs.developer.yelp.com/docs/leads-api",
  },
];

export const yelpLeadCaptureReadinessLabels: Record<
  YelpLeadCaptureReadinessState,
  string
> = {
  not_configured: "Not Configured",
  account_registry_ready: "Account Registry Ready",
  credentials_required: "Credentials Required",
  verification_required: "Verification Required",
  endpoint_ready: "Endpoint Ready",
  testing_required: "Testing Required",
  ready_for_production_configuration: "Ready for Production Configuration",
  connected: "Connected",
  error: "Error",
};

export const yelpLeadCaptureAccounts: YelpLeadCaptureAccount[] = [
  {
    key: "weathertech-phoenix",
    label: "WeatherTech Roofing LLC - Phoenix Yelp",
    companyKey: "weathertech_roofing",
    companyLabel: "WeatherTech",
    branchKey: "weathertech_phoenix",
    branchLabel: "Phoenix",
    providerAccountIdentifier: "weathertech-phoenix",
    businessIdEnvVar: "YELP_BUSINESS_ID_WEATHERTECH_PHOENIX",
    accountAliases: [
      "weathertech-phoenix",
      "weathertech-roofing-phoenix",
      "weathertech phoenix yelp",
      "wtr-yelp-phoenix",
    ],
    accountIdEnvVar: "YELP_ACCOUNT_ID_WEATHERTECH_PHOENIX",
    purpose: "Phoenix roofing lead intake and Request-a-Quote review.",
    sourceDetail: "WeatherTech Phoenix Yelp account",
    campaign: "yelp-phoenix",
    defaultQueue: "weathertech-roofing-phoenix",
    status: "enabled",
    authorizationStatus: "partner_approval_required",
    connectionStatus: "ready_for_manual_intake",
    leadIngestionCapability: "partner_required",
    conversationCapability: "partner_required",
    outboundMessagingCapability: "disabled",
    liveSyncEnabledEnvVar: "YELP_LIVE_SYNC_ENABLED_WEATHERTECH_PHOENIX",
    outboundMessagingEnabledEnvVar: "YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_PHOENIX",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX",
    routingStatus: "ready_to_route",
  },
  {
    key: "weathertech-tucson",
    label: "WeatherTech Roofing LLC - Tucson Yelp",
    companyKey: "weathertech_roofing",
    companyLabel: "WeatherTech",
    branchKey: "weathertech_tucson",
    branchLabel: "Tucson",
    providerAccountIdentifier: "weathertech-tucson",
    businessIdEnvVar: "YELP_BUSINESS_ID_WEATHERTECH_TUCSON",
    accountAliases: [
      "weathertech-tucson",
      "weathertech-roofing-tucson",
      "weathertech tucson yelp",
      "wtr-yelp-tucson",
    ],
    accountIdEnvVar: "YELP_ACCOUNT_ID_WEATHERTECH_TUCSON",
    purpose: "Tucson roofing lead intake and Request-a-Quote review.",
    sourceDetail: "WeatherTech Tucson Yelp account",
    campaign: "yelp-tucson",
    defaultQueue: "weathertech-roofing-tucson",
    status: "enabled",
    authorizationStatus: "partner_approval_required",
    connectionStatus: "ready_for_manual_intake",
    leadIngestionCapability: "partner_required",
    conversationCapability: "partner_required",
    outboundMessagingCapability: "disabled",
    liveSyncEnabledEnvVar: "YELP_LIVE_SYNC_ENABLED_WEATHERTECH_TUCSON",
    outboundMessagingEnabledEnvVar: "YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_TUCSON",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_TUCSON",
    routingStatus: "ready_to_route",
  },
  {
    key: "ihc",
    label: "IHC Yelp",
    companyKey: "ihc_painting",
    companyLabel: "IHC",
    branchKey: "ihc",
    branchLabel: "IHC",
    providerAccountIdentifier: "ihc",
    businessIdEnvVar: "YELP_BUSINESS_ID_IHC",
    accountAliases: ["ihc", "ihc-painting", "ihc yelp", "ihc-painting-yelp"],
    accountIdEnvVar: "YELP_ACCOUNT_ID_IHC",
    purpose: "IHC painting lead intake and Request-a-Quote review.",
    sourceDetail: "IHC Yelp account",
    campaign: "yelp-ihc",
    defaultQueue: "ihc-painting",
    status: "enabled",
    authorizationStatus: "partner_approval_required",
    connectionStatus: "ready_for_manual_intake",
    leadIngestionCapability: "partner_required",
    conversationCapability: "partner_required",
    outboundMessagingCapability: "disabled",
    liveSyncEnabledEnvVar: "YELP_LIVE_SYNC_ENABLED_IHC",
    outboundMessagingEnabledEnvVar: "YELP_OUTBOUND_MESSAGING_ENABLED_IHC",
    verificationMethod: "hmac_sha256",
    secretEnvVar: "YELP_LEAD_CAPTURE_SECRET_IHC",
    routingStatus: "ready_to_route",
  },
];

export const yelpLeadCaptureSecretEnvVars = [
  yelpLeadCaptureSharedSecretEnvVar,
  ...yelpLeadCaptureAccounts.map((account) => account.secretEnvVar),
];

export const yelpLeadCaptureAccountIdEnvVars = yelpLeadCaptureAccounts.map(
  (account) => account.accountIdEnvVar,
);

export const yelpLeadCaptureBusinessIdEnvVars = yelpLeadCaptureAccounts.map(
  (account) => account.businessIdEnvVar,
);

function getEnvFlag(env: NodeJS.ProcessEnv, key: string, defaultValue = false) {
  const value = env[key]?.trim().toLowerCase();

  if (!value) {
    return defaultValue;
  }

  return ["1", "true", "yes", "enabled", "on"].includes(value);
}

function getEnvList(env: NodeJS.ProcessEnv, key: string) {
  return (env[key] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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

function getPayloadText(
  payload: Record<string, unknown>,
  keys: string[],
  maxLength = 240,
) {
  for (const key of keys) {
    const value = getText(payload[key], maxLength);

    if (value) {
      return value;
    }
  }

  return null;
}

function getAccountEnvIdentifiers(
  account: YelpLeadCaptureAccount,
  env: NodeJS.ProcessEnv,
) {
  return [
    env[account.accountIdEnvVar]?.trim(),
    env[account.businessIdEnvVar]?.trim(),
  ].filter((value): value is string => Boolean(value));
}

export function getYelpLeadCaptureConfiguredAccountIdentifiers(
  account: YelpLeadCaptureAccount,
  env: NodeJS.ProcessEnv = process.env,
) {
  return [
    account.providerAccountIdentifier,
    account.key,
    ...account.accountAliases,
    ...getAccountEnvIdentifiers(account, env),
  ].filter((value, index, values) => values.indexOf(value) === index);
}

export function getYelpLeadCaptureConfiguredBusinessId(
  account: YelpLeadCaptureAccount,
  env: NodeJS.ProcessEnv = process.env,
) {
  return env[account.businessIdEnvVar]?.trim() || null;
}

export function isYelpLeadCaptureLiveSyncEnabled(
  account: YelpLeadCaptureAccount | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!account) {
    return false;
  }

  const globalEnabled = getEnvFlag(env, yelpLeadCaptureEnvVars.liveSyncEnabled, false);
  const accountEnabled = getEnvFlag(env, account.liveSyncEnabledEnvVar, false);
  const enabledAccountIds = getEnvList(
    env,
    yelpLeadCaptureEnvVars.productionEnabledAccountIds,
  ).map(getToken);
  const accountIdEnabled =
    enabledAccountIds.length === 0 ||
    enabledAccountIds.some((token) =>
      getYelpLeadCaptureConfiguredAccountIdentifiers(account, env)
        .map(getToken)
        .includes(token),
    );

  return globalEnabled && accountEnabled && accountIdEnabled;
}

export function isYelpOutboundMessagingEnabled(
  account: YelpLeadCaptureAccount | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!account) {
    return false;
  }

  return (
    getEnvFlag(env, yelpLeadCaptureEnvVars.outboundMessagingEnabled, false) &&
    getEnvFlag(env, account.outboundMessagingEnabledEnvVar, false)
  );
}

function accountMatchesToken(
  account: YelpLeadCaptureAccount,
  token: string,
  env: NodeJS.ProcessEnv,
) {
  const registryTokens = [
    account.key,
    account.label,
    account.sourceDetail,
    ...account.accountAliases,
    ...getAccountEnvIdentifiers(account, env),
  ].map(getToken);

  return registryTokens.includes(token);
}

export function resolveYelpLeadCaptureAccount(
  body: YelpLeadRequestBody,
  headers: HeadersLike = {},
  env: NodeJS.ProcessEnv = process.env,
): YelpLeadCaptureAccountResolution {
  const payload = body as Record<string, unknown>;
  const headerAccount = getText(
    getHeaderValue(headers, yelpLeadCaptureAccountHeader),
    160,
  );
  const submittedAccountIdentifier =
    headerAccount ??
    getPayloadText(
      payload,
      [
        "yelpAccountKey",
        "yelpAccountId",
        "accountId",
        "providerAccountId",
        "sourceAccount",
        "sourceId",
        "yelpSource",
      ],
      160,
    );
  const submittedBusinessIdentifier = getPayloadText(
    payload,
    [
      "yelpBusinessId",
      "businessId",
      "businessAlias",
      "businessName",
      "business",
    ],
    160,
  );
  const submittedConversationIdentifier = getPayloadText(
    payload,
    ["yelpConversationId", "conversationId", "threadId"],
    160,
  );
  const tokens = [
    submittedAccountIdentifier,
    submittedBusinessIdentifier,
  ]
    .map(getToken)
    .filter(Boolean);
  const matches = yelpLeadCaptureAccounts.filter((account) =>
    tokens.some((token) => accountMatchesToken(account, token, env)),
  );

  if (matches.length === 1) {
    const account = matches[0];

    return {
      account,
      status: account.status === "disabled" ? "disabled" : "matched",
      submittedAccountIdentifier,
      submittedBusinessIdentifier,
      submittedConversationIdentifier,
      warnings: [],
    };
  }

  if (matches.length > 1) {
    return {
      account: null,
      status: "ambiguous",
      submittedAccountIdentifier,
      submittedBusinessIdentifier,
      submittedConversationIdentifier,
      warnings: [
        "Yelp account identifier matched multiple registry entries. Review before routing.",
      ],
    };
  }

  return {
    account: null,
    status: "unknown",
    submittedAccountIdentifier,
    submittedBusinessIdentifier,
    submittedConversationIdentifier,
    warnings: [
      "Yelp account is unknown. Submission will remain unassigned for review.",
    ],
  };
}

export function getYelpLeadCaptureSecret(
  account: YelpLeadCaptureAccount | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  const accountSecret = account ? env[account.secretEnvVar]?.trim() : null;
  const sharedSecret = env[yelpLeadCaptureSharedSecretEnvVar]?.trim();

  return accountSecret || sharedSecret || null;
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

export function createYelpLeadCaptureSignature({
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

export function createYelpLeadCaptureRequestFingerprint({
  rawBody,
  account,
  externalId,
}: {
  rawBody: string;
  account: YelpLeadCaptureAccount | null;
  externalId?: string | null;
}) {
  return createHash("sha256")
    .update(`${account?.key ?? "unknown"}:${externalId ?? ""}:${rawBody}`)
    .digest("hex");
}

export function verifyYelpLeadCaptureRequest({
  rawBody,
  headers,
  account,
  dryRun = false,
  now = new Date(),
  secretOverride = null,
}: {
  rawBody: string;
  headers: HeadersLike;
  account: YelpLeadCaptureAccount | null;
  dryRun?: boolean;
  now?: Date;
  secretOverride?: string | null;
}): YelpLeadCaptureVerificationResult {
  const checkedAt = now.toISOString();

  if (dryRun) {
    return {
      ok: true,
      status: "dry_run",
      summary: "Dry-run preview. Signature validation was not required.",
      checkedAt,
    };
  }

  const secret = secretOverride ?? getYelpLeadCaptureSecret(account);

  if (!secret) {
    return {
      ok: false,
      status: "verification_required",
      summary: "Yelp lead capture signing secret is not configured.",
      checkedAt,
    };
  }

  const timestamp = getHeaderValue(headers, yelpLeadCaptureTimestampHeader);
  const signature = normalizeSignatureHeader(
    getHeaderValue(headers, yelpLeadCaptureSignatureHeader),
  );

  if (!timestamp || !signature) {
    return {
      ok: false,
      status: "missing_signature",
      summary: "Signed Yelp submissions must include timestamp and signature headers.",
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
      summary: "Yelp submission signature timestamp is outside the accepted window.",
      checkedAt,
    };
  }

  const expected = createYelpLeadCaptureSignature({
    rawBody,
    timestamp,
    secret,
  });

  if (!signaturesMatch(signature, expected)) {
    return {
      ok: false,
      status: "invalid_signature",
      summary: "Yelp submission signature is invalid.",
      checkedAt,
    };
  }

  return {
    ok: true,
    status: "valid",
    summary: "Yelp submission signature is valid.",
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

function getSubmittedAt(body: YelpLeadRequestBody) {
  return (
    sanitizeText(body.submittedAt, 80) ??
    sanitizeText(body.timestamp, 80) ??
    sanitizeText(body.receivedAt, 80)
  );
}

function countLinks(value: string | null) {
  return (value?.match(/https?:\/\/|www\./gi) ?? []).length;
}

export function evaluateYelpLeadCaptureAbuse(
  body: YelpLeadRequestBody,
  resolution: YelpLeadCaptureAccountResolution,
  now = new Date(),
): YelpLeadCaptureAbuseResult {
  const signals: YelpLeadCaptureAbuseSignal[] = [];
  const rawBody = body as Record<string, unknown>;
  const honeypotValue =
    sanitizeText(rawBody.honeypot, 80) ??
    sanitizeText(rawBody.companyWebsite, 80) ??
    sanitizeText(rawBody.hiddenWebsite, 80) ??
    sanitizeText(rawBody.fax, 80) ??
    sanitizeText(rawBody.middleName, 80);
  const submittedAt = getSubmittedAt(body);
  const submittedAtMs = submittedAt ? Date.parse(submittedAt) : null;
  const message = sanitizeText(body.message ?? rawBody.comments ?? rawBody.notes, 1500);

  if (resolution.status === "disabled") {
    signals.push({
      code: "blocked_account",
      label: "Yelp account is disabled.",
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

  const status: YelpLeadCaptureAbuseStatus = signals.some(
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

function buildName(body: YelpLeadRequestBody) {
  const rawBody = body as Record<string, unknown>;
  const firstName = sanitizeText(rawBody.firstName, 80);
  const lastName = sanitizeText(rawBody.lastName, 120);

  return sanitizeText(body.name, 160) ??
    sanitizeText(rawBody.customerName, 160) ??
    sanitizeText(rawBody.contactName, 160) ??
    ([firstName, lastName].filter(Boolean).join(" ") || null);
}

function getExternalLeadId(body: YelpLeadRequestBody) {
  const rawBody = body as Record<string, unknown>;

  return (
    sanitizeText(body.yelpLeadId, 160) ??
    sanitizeText(rawBody.leadId, 160) ??
    sanitizeText(rawBody.externalLeadId, 160) ??
    sanitizeText(rawBody.sourceExternalId, 160) ??
    sanitizeText(rawBody.externalId, 160) ??
    sanitizeText(rawBody.id, 160)
  );
}

export function buildYelpLeadCaptureRequestBody({
  body,
  resolution,
  verification,
  abuse,
  correlationId,
}: {
  body: YelpLeadRequestBody;
  resolution: YelpLeadCaptureAccountResolution;
  verification: YelpLeadCaptureVerificationResult;
  abuse: YelpLeadCaptureAbuseResult;
  correlationId?: string | null;
}): YelpLeadRequestBody {
  const rawBody = body as Record<string, unknown>;
  const account = resolution.account;
  const sourceDetail = account
    ? account.sourceDetail
    : [
        resolution.submittedAccountIdentifier,
        resolution.submittedBusinessIdentifier,
        resolution.submittedConversationIdentifier,
      ].filter(Boolean).join(" / ") || "Unknown Yelp account";
  const forceReviewReason =
    abuse.status === "review_required"
      ? abuse.reviewReason
      : resolution.status === "matched"
        ? null
        : resolution.warnings.join(" ");
  const submittedAt = getSubmittedAt(body) ?? new Date().toISOString();
  const yelpBusinessId =
    resolution.submittedBusinessIdentifier ??
    resolution.submittedAccountIdentifier ??
    sanitizeText(body.yelpBusinessId, 160);
  const yelpConversationId =
    sanitizeText(body.yelpConversationId, 160) ??
    sanitizeText(rawBody.conversationId, 160) ??
    sanitizeText(rawBody.threadId, 160);

  return {
    business: account?.companyLabel ?? "Unassigned",
    company: account?.companyLabel ?? "Unassigned",
    location: account?.branchLabel ?? sanitizeText(rawBody.city ?? body.location, 120),
    city: sanitizeText(rawBody.city ?? body.location, 120),
    state: sanitizeText(rawBody.state, 40) ?? "AZ",
    zip: sanitizeText(rawBody.zip ?? rawBody.postalCode, 20),
    postalCode: sanitizeText(rawBody.zip ?? rawBody.postalCode, 20),
    source: account ? `${account.companyLabel} Yelp` : "Yelp",
    sourceDetail,
    sourceAccount: account?.sourceDetail ?? resolution.submittedAccountIdentifier,
    yelpAccountKey: account?.key ?? sanitizeText(rawBody.yelpAccountKey, 160),
    yelpAccountId:
      resolution.submittedAccountIdentifier ??
      sanitizeText(rawBody.yelpAccountId, 160),
    providerAccountId:
      sanitizeText(rawBody.providerAccountId, 160) ??
      resolution.submittedAccountIdentifier,
    name: buildName(body),
    firstName: sanitizeText(rawBody.firstName, 80),
    lastName: sanitizeText(rawBody.lastName, 120),
    companyName: sanitizeText(rawBody.companyName, 160),
    phone: sanitizeText(body.phone, 40),
    email: sanitizeText(body.email, 160),
    address: sanitizeText(rawBody.address ?? rawBody.serviceAddress, 240),
    serviceAddress: sanitizeText(rawBody.serviceAddress ?? rawBody.address, 240),
    serviceType: sanitizeText(
      body.serviceType ?? rawBody.requestedService ?? rawBody.service,
      80,
    ),
    requestedService: sanitizeText(
      rawBody.requestedService ?? body.serviceType ?? rawBody.service,
      80,
    ),
    message: sanitizeText(body.message ?? rawBody.comments ?? rawBody.notes, 1500),
    preferredContactMethod: sanitizeText(
      rawBody.preferredContactMethod ?? rawBody.preferredContact,
      40,
    ),
    yelpBusinessId,
    businessId: sanitizeText(rawBody.businessId, 160),
    businessAlias: sanitizeText(rawBody.businessAlias, 160),
    businessName: sanitizeText(rawBody.businessName, 160),
    yelpConversationId,
    conversationId: sanitizeText(rawBody.conversationId, 160),
    yelpLeadId: getExternalLeadId(body),
    leadId: sanitizeText(rawBody.leadId, 160),
    externalLeadId: getExternalLeadId(body),
    sourceExternalId: sanitizeText(rawBody.sourceExternalId, 160),
    externalId: sanitizeText(rawBody.externalId, 160),
    submittedAt,
    timestamp: sanitizeText(body.timestamp, 80),
    receivedAt: sanitizeText(body.receivedAt, 80),
    campaign: sanitizeText(rawBody.campaign, 160) ?? account?.campaign,
    smsConsent: typeof rawBody.smsConsent === "boolean" ? rawBody.smsConsent : null,
    emailConsent:
      typeof rawBody.emailConsent === "boolean" ? rawBody.emailConsent : null,
    consentSource: sanitizeText(rawBody.consentSource, 120),
    consentCapturedAt: sanitizeText(rawBody.consentCapturedAt, 80),
    verifiedCompanyKey: account?.companyKey ?? "unassigned",
    verifiedBranchKey: account?.branchKey ?? "unassigned",
    forceUnassignedRouting: !account,
    forceReviewReason,
    correlationId:
      sanitizeText(correlationId, 120) ??
      sanitizeText(rawBody.correlationId, 120) ??
      randomUUID(),
    verifiedSourceMetadata: {
      sourceRegistryKey: account?.key ?? null,
      sourceResolutionStatus: resolution.status,
      submittedAccountIdentifier: resolution.submittedAccountIdentifier,
      submittedBusinessIdentifier: resolution.submittedBusinessIdentifier,
      submittedConversationIdentifier: resolution.submittedConversationIdentifier,
      verificationStatus: verification.status,
      verificationMethod: account?.verificationMethod ?? "hmac_sha256",
      routingStatus: account?.routingStatus ?? "needs_configuration",
      defaultQueue: account?.defaultQueue ?? "lead-intake-review",
      spamReviewStatus: abuse.status,
      spamSignals: abuse.signals.map((signal) => signal.code),
    },
  };
}

function getLogAccountKey(log: IntegrationSyncLogRecord) {
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

function getProductionLabel(state: YelpLeadCaptureProductionState) {
  if (state === "live_sync_enabled") {
    return "Live sync enabled";
  }

  if (state === "ready_for_signed_testing") {
    return "Ready for signed testing";
  }

  if (state === "partner_access_required") {
    return "Partner access required";
  }

  if (state === "credentials_required") {
    return "Credentials required";
  }

  if (state === "authentication_failed") {
    return "Authentication failing";
  }

  if (state === "intake_error") {
    return "Intake error";
  }

  return "Production disabled";
}

export function buildYelpLeadCaptureAccountRuntimeStatuses({
  logs,
  env = process.env,
}: {
  logs: IntegrationSyncLogRecord[];
  env?: NodeJS.ProcessEnv;
}): YelpLeadCaptureAccountRuntimeStatus[] {
  return yelpLeadCaptureAccounts.map((account) => {
    const accountLogs = logs.filter(
      (log) => log.provider === "yelp" && getLogAccountKey(log) === account.key,
    );
    const successfulLogs = accountLogs.filter((log) => log.status === "succeeded");
    const failureLogs = accountLogs.filter(
      (log) => log.status === "failed" || log.status === "retrying",
    );
    const lastSuccessfulSubmissionAt =
      successfulLogs.map(getLogTimestamp).sort().at(-1) ?? null;
    const lastFailureAt = failureLogs.map(getLogTimestamp).sort().at(-1) ?? null;
    const latestFailure = failureLogs
      .slice()
      .sort((a, b) => getLogTimestamp(a).localeCompare(getLogTimestamp(b)))
      .at(-1);
    const latestFailureIsNewest =
      Boolean(lastFailureAt) &&
      (!lastSuccessfulSubmissionAt || lastFailureAt! > lastSuccessfulSubmissionAt);
    const hasSigningSecret = Boolean(getYelpLeadCaptureSecret(account, env));
    const liveSyncEnabled = isYelpLeadCaptureLiveSyncEnabled(account, env);
    const outboundMessagingEnabled = isYelpOutboundMessagingEnabled(account, env);
    const oauthReady = Boolean(
      env[yelpLeadCaptureEnvVars.clientId]?.trim() &&
        env[yelpLeadCaptureEnvVars.clientSecret]?.trim() &&
        env[yelpLeadCaptureEnvVars.redirectUri]?.trim(),
    );
    const partnerReady = Boolean(env[yelpLeadCaptureEnvVars.partnerId]?.trim());
    const productionState: YelpLeadCaptureProductionState = latestFailureIsNewest
      ? latestFailure?.error_code === "missing_signature" ||
        latestFailure?.error_code === "invalid_signature" ||
        latestFailure?.error_code === "verification_required"
        ? "authentication_failed"
        : "intake_error"
      : liveSyncEnabled
        ? "live_sync_enabled"
        : !partnerReady
          ? "partner_access_required"
          : !oauthReady || !hasSigningSecret
            ? "credentials_required"
            : "ready_for_signed_testing";

    return {
      key: account.key,
      label: account.label,
      companyLabel: account.companyLabel,
      branchLabel: account.branchLabel,
      providerAccountIdentifier: account.providerAccountIdentifier,
      configuredAccountIdentifiers: getYelpLeadCaptureConfiguredAccountIdentifiers(account, env),
      configuredBusinessId: getYelpLeadCaptureConfiguredBusinessId(account, env),
      authorizationStatus: account.authorizationStatus,
      connectionStatus: account.connectionStatus,
      leadIngestionCapability: account.leadIngestionCapability,
      conversationCapability: account.conversationCapability,
      outboundMessagingCapability: account.outboundMessagingCapability,
      liveSyncEnabled,
      outboundMessagingEnabled,
      productionState,
      productionLabel: getProductionLabel(productionState),
      hasSigningSecret,
      lastSuccessfulSubmissionAt,
      lastFailureAt,
      lastError: latestFailure?.error_message ?? null,
    };
  });
}

export function buildYelpLeadCaptureReadiness(
  env: NodeJS.ProcessEnv = process.env,
): YelpLeadCaptureReadiness {
  const enabledAccountCount = yelpLeadCaptureAccounts.filter(
    (account) => account.status === "enabled",
  ).length;
  const configuredVerificationCount = yelpLeadCaptureAccounts.filter((account) =>
    Boolean(getYelpLeadCaptureSecret(account, env)),
  ).length;
  const configuredProviderAccountCount = yelpLeadCaptureAccounts.filter((account) =>
    Boolean(env[account.accountIdEnvVar]?.trim()),
  ).length;
  const configuredBusinessIdCount = yelpLeadCaptureAccounts.filter((account) =>
    Boolean(env[account.businessIdEnvVar]?.trim()),
  ).length;
  const hasSharedSecret = Boolean(env[yelpLeadCaptureSharedSecretEnvVar]?.trim());
  const oauthClientConfigured = Boolean(
    env[yelpLeadCaptureEnvVars.clientId]?.trim() &&
      env[yelpLeadCaptureEnvVars.clientSecret]?.trim() &&
      env[yelpLeadCaptureEnvVars.redirectUri]?.trim(),
  );
  const partnerIdConfigured = Boolean(env[yelpLeadCaptureEnvVars.partnerId]?.trim());
  const liveSyncEnabled = yelpLeadCaptureAccounts.some((account) =>
    isYelpLeadCaptureLiveSyncEnabled(account, env),
  );
  const outboundMessagingEnabled = yelpLeadCaptureAccounts.some((account) =>
    isYelpOutboundMessagingEnabled(account, env),
  );
  const state: YelpLeadCaptureReadinessState =
    !yelpLeadCaptureAccounts.length
      ? "not_configured"
      : !partnerIdConfigured
        ? "credentials_required"
        : configuredProviderAccountCount === 0 && configuredBusinessIdCount === 0
        ? "credentials_required"
        : !oauthClientConfigured || (configuredVerificationCount === 0 && !hasSharedSecret)
          ? "verification_required"
          : liveSyncEnabled
            ? "connected"
            : "testing_required";

  return {
    state,
    label: yelpLeadCaptureReadinessLabels[state],
    endpointPath: yelpLeadCaptureEndpointPath,
    dryRunPath: yelpLeadCaptureDryRunPath,
    configuredAccountCount: yelpLeadCaptureAccounts.length,
    enabledAccountCount,
    configuredVerificationCount,
    configuredProviderAccountCount,
    configuredBusinessIdCount,
    oauthClientConfigured,
    partnerIdConfigured,
    liveSyncEnabled,
    outboundMessagingEnabled,
    ownerActions: [
      "Confirm Yelp partner approval, Request-a-Quote eligibility, and subscribed business IDs.",
      "Add server-side Yelp OAuth, partner, webhook, signing secret, account ID, and business ID variables in hosting.",
      "Keep Yelp live sync and outbound messaging disabled until signed end-to-end tests pass.",
      "Run dry-run previews for Phoenix, Tucson, and IHC before accepting live leads.",
      "Run one signed production test per Yelp account before marking Yelp connected.",
    ],
  };
}

export function buildYelpLeadCaptureSafeLogSummary({
  body,
  resolution,
  verification = null,
  abuse = null,
  correlationId = null,
  rawBody = null,
}: YelpLeadCaptureSafeLogContext) {
  return sanitizeIntegrationSyncLogSummary({
    sourceRegistryKey: resolution.account?.key ?? null,
    sourceResolutionStatus: resolution.status,
    submittedAccountIdentifier: resolution.submittedAccountIdentifier,
    submittedBusinessIdentifier: resolution.submittedBusinessIdentifier,
    submittedConversationIdentifier: resolution.submittedConversationIdentifier,
    verificationStatus: verification?.status ?? null,
    productionEnabled: isYelpLeadCaptureLiveSyncEnabled(resolution.account),
    outboundMessagingEnabled: isYelpOutboundMessagingEnabled(resolution.account),
    spamReviewStatus: abuse?.status ?? null,
    spamSignals: abuse?.signals.map((signal) => signal.code) ?? [],
    yelp: {
      hasBusinessId: Boolean(sanitizeText(body.yelpBusinessId ?? body.businessId, 160)),
      hasLeadId: Boolean(sanitizeText(body.yelpLeadId ?? body.leadId, 160)),
      hasConversationId: Boolean(
        sanitizeText(body.yelpConversationId ?? body.conversationId ?? body.threadId, 160),
      ),
      accountKey: resolution.account?.key ?? null,
      branch: resolution.account?.branchLabel ?? null,
      company: resolution.account?.companyLabel ?? null,
    },
    contact: {
      hasName: Boolean(buildName(body)),
      hasPhone: Boolean(sanitizeText(body.phone, 40)),
      hasEmail: Boolean(sanitizeText(body.email, 160)),
    },
    property: {
      hasAddress: Boolean(sanitizeText(body.address ?? body.serviceAddress, 240)),
      hasLocation: Boolean(sanitizeText(body.city ?? body.location, 120)),
    },
    message: {
      hasMessage: Boolean(sanitizeText(body.message ?? body.comments ?? body.notes, 1500)),
      length:
        sanitizeText(body.message ?? body.comments ?? body.notes, 1500)?.length ?? 0,
    },
    correlationId: sanitizeText(correlationId, 120),
    payloadHash: rawBody ? createHash("sha256").update(rawBody).digest("hex") : null,
  });
}
