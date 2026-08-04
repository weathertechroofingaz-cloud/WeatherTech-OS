import type { GoogleBusinessProfileLeadRequestBody } from "./leadIntake";
import type {
  CanonicalLeadBranchKey,
  CanonicalLeadCompanyKey,
} from "./leadRouting";
import type { IntegrationSyncLogRecord } from "./types";

type HeadersLike = Headers | Record<string, string | string[] | undefined>;

export type GoogleBusinessProfileLocationKey =
  | "weathertech-phoenix"
  | "weathertech-tucson"
  | "ihc";

export type GoogleBusinessProfileLocationStatus = "enabled" | "disabled";
export type GoogleBusinessProfileResolutionStatus =
  | "matched"
  | "ambiguous"
  | "unknown"
  | "disabled";
export type GoogleBusinessProfileConnectionStatus =
  | "not_configured"
  | "oauth_required"
  | "ready_for_testing"
  | "production_disabled"
  | "connected"
  | "sync_failed";
export type GoogleBusinessProfileCapabilityStatus =
  | "available"
  | "oauth_required"
  | "project_approval_required"
  | "production_disabled"
  | "discontinued"
  | "unsupported";
export type GoogleBusinessProfileReadinessState =
  | "not_configured"
  | "location_registry_ready"
  | "oauth_required"
  | "ready_for_testing"
  | "production_disabled"
  | "connected"
  | "sync_failed";

export type GoogleBusinessProfileLocation = {
  key: GoogleBusinessProfileLocationKey;
  label: string;
  companyKey: Exclude<CanonicalLeadCompanyKey, "unassigned">;
  companyLabel: "WeatherTech" | "IHC";
  branchKey: Exclude<CanonicalLeadBranchKey, "unassigned">;
  branchLabel: string;
  accountIdEnvVar: string;
  locationIdEnvVar: string;
  locationAliases: string[];
  purpose: string;
  sourceDetail: string;
  campaign: string;
  defaultQueue: string;
  status: GoogleBusinessProfileLocationStatus;
};

export type GoogleBusinessProfileLocationResolution = {
  location: GoogleBusinessProfileLocation | null;
  status: GoogleBusinessProfileResolutionStatus;
  submittedAccountIdentifier: string | null;
  submittedLocationIdentifier: string | null;
  submittedEventIdentifier: string | null;
  warnings: string[];
};

export type GoogleBusinessProfileReadiness = {
  state: GoogleBusinessProfileReadinessState;
  label: string;
  endpointPath: string;
  dryRunPath: string;
  configuredLocationCount: number;
  enabledLocationCount: number;
  oauthClientConfigured: boolean;
  pubSubTopicConfigured: boolean;
  liveSyncEnabled: boolean;
  reviewReplyEnabled: boolean;
  ownerActions: string[];
};

export type GoogleBusinessProfileOfficialCapability = {
  key: string;
  label: string;
  status: GoogleBusinessProfileCapabilityStatus;
  summary: string;
  officialDocumentationUrl: string;
};

export type GoogleBusinessProfileLocationRuntimeStatus = {
  key: GoogleBusinessProfileLocationKey;
  label: string;
  companyLabel: "WeatherTech" | "IHC";
  branchLabel: string;
  configuredAccountId: string | null;
  configuredLocationId: string | null;
  connectionStatus: GoogleBusinessProfileConnectionStatus;
  productionLabel: string;
  liveSyncEnabled: boolean;
  reviewReplyEnabled: boolean;
  lastSuccessfulSubmissionAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};

export type GoogleBusinessProfileLeadCaptureRequestContext = {
  body: GoogleBusinessProfileLeadRequestBody;
  resolution: GoogleBusinessProfileLocationResolution;
  correlationId?: string | null;
};

export const googleBusinessProfileEndpointPath =
  "/api/leads/google-business-profile";
export const googleBusinessProfileDryRunPath =
  "/api/leads/google-business-profile?dryRun=1";
export const googleBusinessProfileMaxPayloadBytes = 32_000;
export const googleBusinessProfileLocationHeader =
  "x-weathertech-google-business-profile-location";

export const googleBusinessProfileEnvVars = {
  clientId: "GOOGLE_BUSINESS_PROFILE_CLIENT_ID",
  clientSecret: "GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET",
  redirectUri: "GOOGLE_BUSINESS_PROFILE_REDIRECT_URI",
  pubSubTopic: "GOOGLE_BUSINESS_PROFILE_PUBSUB_TOPIC",
  syncEnabled: "GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED",
  reviewReplyEnabled: "GOOGLE_BUSINESS_PROFILE_REVIEW_REPLY_ENABLED",
  productionLocationKeys: "GOOGLE_BUSINESS_PROFILE_PRODUCTION_LOCATION_KEYS",
  weatherTechAccountId: "GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID_WEATHERTECH",
  weatherTechPhoenixLocationId:
    "GOOGLE_BUSINESS_PROFILE_LOCATION_ID_WEATHERTECH_PHOENIX",
  weatherTechTucsonLocationId:
    "GOOGLE_BUSINESS_PROFILE_LOCATION_ID_WEATHERTECH_TUCSON",
  ihcAccountId: "GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID_IHC",
  ihcLocationId: "GOOGLE_BUSINESS_PROFILE_LOCATION_ID_IHC",
} as const;

export const googleBusinessProfileOfficialCapabilities: GoogleBusinessProfileOfficialCapability[] = [
  {
    key: "account_location_management",
    label: "Accounts and locations",
    status: "oauth_required",
    summary:
      "Business Profile Account Management and Business Information APIs can list accessible accounts and locations after project approval and OAuth consent.",
    officialDocumentationUrl:
      "https://developers.google.com/my-business/reference/accountmanagement/rest/v1/accounts/list",
  },
  {
    key: "reviews",
    label: "Reviews",
    status: "oauth_required",
    summary:
      "Reviews can be listed for verified locations through the Business Profile Reviews API with business.manage scope.",
    officialDocumentationUrl:
      "https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list",
  },
  {
    key: "performance",
    label: "Performance metrics",
    status: "oauth_required",
    summary:
      "Performance APIs expose profile interaction metrics such as calls, directions, clicks, and impressions after OAuth approval.",
    officialDocumentationUrl:
      "https://developers.google.com/my-business/reference/performance/rpc/google.mybusiness.performance.v1",
  },
  {
    key: "notifications",
    label: "Review/location notifications",
    status: "oauth_required",
    summary:
      "Google supports Pub/Sub notifications for review and location updates after OAuth setup and Pub/Sub topic authorization.",
    officialDocumentationUrl:
      "https://developers.google.com/my-business/content/notification-setup",
  },
  {
    key: "messaging",
    label: "Customer messaging",
    status: "unsupported",
    summary:
      "Google Business Profile chat and call history are no longer available, and customers can no longer request quotes through Business Profile chat.",
    officialDocumentationUrl: "https://support.google.com/business/answer/14919056",
  },
  {
    key: "q_and_a",
    label: "Questions and answers",
    status: "discontinued",
    summary:
      "The Business Profile Q&A API has been discontinued and is not a supported lead or activity source.",
    officialDocumentationUrl:
      "https://developers.google.com/my-business/content/qanda/change-log",
  },
];

export const googleBusinessProfileLocations: GoogleBusinessProfileLocation[] = [
  {
    key: "weathertech-phoenix",
    label: "WeatherTech Roofing LLC - Phoenix GBP",
    companyKey: "weathertech_roofing",
    companyLabel: "WeatherTech",
    branchKey: "weathertech_phoenix",
    branchLabel: "Phoenix",
    accountIdEnvVar: googleBusinessProfileEnvVars.weatherTechAccountId,
    locationIdEnvVar: googleBusinessProfileEnvVars.weatherTechPhoenixLocationId,
    locationAliases: [
      "weathertech-phoenix",
      "weathertech roofing phoenix",
      "weathertech phoenix",
      "phoenix",
    ],
    purpose: "Phoenix Google reviews, local profile activity, and controlled lead tests.",
    sourceDetail: "WeatherTech Phoenix Google Business Profile",
    campaign: "google-business-profile-phoenix",
    defaultQueue: "weathertech-roofing-phoenix",
    status: "enabled",
  },
  {
    key: "weathertech-tucson",
    label: "WeatherTech Roofing LLC - Tucson GBP",
    companyKey: "weathertech_roofing",
    companyLabel: "WeatherTech",
    branchKey: "weathertech_tucson",
    branchLabel: "Tucson",
    accountIdEnvVar: googleBusinessProfileEnvVars.weatherTechAccountId,
    locationIdEnvVar: googleBusinessProfileEnvVars.weatherTechTucsonLocationId,
    locationAliases: [
      "weathertech-tucson",
      "weathertech roofing tucson",
      "weathertech tucson",
      "tucson",
    ],
    purpose: "Tucson Google reviews, local profile activity, and controlled lead tests.",
    sourceDetail: "WeatherTech Tucson Google Business Profile",
    campaign: "google-business-profile-tucson",
    defaultQueue: "weathertech-roofing-tucson",
    status: "enabled",
  },
  {
    key: "ihc",
    label: "IHC Painting GBP",
    companyKey: "ihc_painting",
    companyLabel: "IHC",
    branchKey: "ihc",
    branchLabel: "IHC",
    accountIdEnvVar: googleBusinessProfileEnvVars.ihcAccountId,
    locationIdEnvVar: googleBusinessProfileEnvVars.ihcLocationId,
    locationAliases: ["ihc", "ihc painting", "painting"],
    purpose: "IHC Painting Google reviews, local profile activity, and controlled lead tests.",
    sourceDetail: "IHC Google Business Profile",
    campaign: "google-business-profile-ihc",
    defaultQueue: "ihc-painting",
    status: "enabled",
  },
];

function getEnvValue(name: string, env = process.env) {
  const value = env[name]?.trim();

  return value ? value : null;
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

function getHeader(headers: HeadersLike | undefined, name: string) {
  if (!headers) {
    return null;
  }

  if (headers instanceof Headers) {
    return getText(headers.get(name), 160);
  }

  const direct = headers[name] ?? headers[name.toLowerCase()];

  if (Array.isArray(direct)) {
    return getText(direct[0], 160);
  }

  return getText(direct, 160);
}

function getConfiguredLocationId(
  location: GoogleBusinessProfileLocation,
  env = process.env,
) {
  return getEnvValue(location.locationIdEnvVar, env);
}

function getConfiguredAccountId(
  location: GoogleBusinessProfileLocation,
  env = process.env,
) {
  return getEnvValue(location.accountIdEnvVar, env);
}

function parseList(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getGoogleBusinessProfileConfiguredLocationIdentifiers(
  location: GoogleBusinessProfileLocation,
  env = process.env,
) {
  return [
    location.key,
    ...location.locationAliases,
    getConfiguredLocationId(location, env),
    getConfiguredAccountId(location, env),
  ].filter((value): value is string => Boolean(value));
}

export function resolveGoogleBusinessProfileLocation(
  body: GoogleBusinessProfileLeadRequestBody,
  headers?: HeadersLike,
  env = process.env,
): GoogleBusinessProfileLocationResolution {
  const submittedLocationIdentifier =
    getText(body.googleBusinessProfileLocationKey, 160) ??
    getText(body.gbpLocationKey, 160) ??
    getText(body.locationKey, 160) ??
    getText(body.googleLocationId, 160) ??
    getText(body.locationId, 160) ??
    getText(body.locationName, 160) ??
    getHeader(headers, googleBusinessProfileLocationHeader);
  const submittedAccountIdentifier =
    getText(body.googleAccountId, 160) ??
    getText(body.accountId, 160) ??
    getText(body.providerAccountId, 160);
  const submittedEventIdentifier =
    getText(body.googleReviewId, 160) ??
    getText(body.reviewId, 160) ??
    getText(body.googleEventId, 160) ??
    getText(body.eventId, 160) ??
    getText(body.externalLeadId, 160) ??
    getText(body.id, 160);
  const searchToken = getToken(
    [
      submittedLocationIdentifier,
      submittedAccountIdentifier,
      getText(body.businessName, 160),
      getText(body.company, 120),
      getText(body.business, 120),
    ]
      .filter(Boolean)
      .join(" "),
  );
  const matches = googleBusinessProfileLocations.filter((location) =>
    getGoogleBusinessProfileConfiguredLocationIdentifiers(location, env).some(
      (identifier) => {
        const token = getToken(identifier);

        return Boolean(token && searchToken.includes(token));
      },
    ),
  );

  if (matches.length === 1) {
    const [location] = matches;

    if (location.status === "disabled") {
      return {
        location,
        status: "disabled",
        submittedAccountIdentifier,
        submittedLocationIdentifier,
        submittedEventIdentifier,
        warnings: [`${location.label} is disabled in the GBP location registry.`],
      };
    }

    return {
      location,
      status: "matched",
      submittedAccountIdentifier,
      submittedLocationIdentifier,
      submittedEventIdentifier,
      warnings: [],
    };
  }

  if (matches.length > 1) {
    return {
      location: null,
      status: "ambiguous",
      submittedAccountIdentifier,
      submittedLocationIdentifier,
      submittedEventIdentifier,
      warnings: [
        "Google Business Profile account/location matched more than one WeatherTech OS location. Route to review.",
      ],
    };
  }

  return {
    location: null,
    status: "unknown",
    submittedAccountIdentifier,
    submittedLocationIdentifier,
    submittedEventIdentifier,
    warnings: [
      "Google Business Profile account/location is not mapped to WeatherTech Roofing LLC Phoenix, WeatherTech Roofing LLC Tucson, or IHC.",
    ],
  };
}

export function isGoogleBusinessProfileSyncEnabled(
  location: GoogleBusinessProfileLocation | null,
  env = process.env,
) {
  if (!location) {
    return false;
  }

  if (getEnvValue(googleBusinessProfileEnvVars.syncEnabled, env) !== "true") {
    return false;
  }

  return parseList(
    getEnvValue(googleBusinessProfileEnvVars.productionLocationKeys, env),
  ).includes(location.key);
}

export function isGoogleBusinessProfileReviewReplyEnabled(env = process.env) {
  return (
    getEnvValue(googleBusinessProfileEnvVars.reviewReplyEnabled, env) === "true"
  );
}

export function buildGoogleBusinessProfileReadiness(
  env = process.env,
): GoogleBusinessProfileReadiness {
  const configuredLocationCount = googleBusinessProfileLocations.filter(
    (location) => getConfiguredLocationId(location, env),
  ).length;
  const enabledLocationCount = googleBusinessProfileLocations.filter(
    (location) => location.status === "enabled",
  ).length;
  const oauthClientConfigured = Boolean(
    getEnvValue(googleBusinessProfileEnvVars.clientId, env) &&
      getEnvValue(googleBusinessProfileEnvVars.clientSecret, env) &&
      getEnvValue(googleBusinessProfileEnvVars.redirectUri, env),
  );
  const pubSubTopicConfigured = Boolean(
    getEnvValue(googleBusinessProfileEnvVars.pubSubTopic, env),
  );
  const liveSyncEnabled =
    getEnvValue(googleBusinessProfileEnvVars.syncEnabled, env) === "true";
  const reviewReplyEnabled = isGoogleBusinessProfileReviewReplyEnabled(env);
  const ownerActions = [
    "Request and receive Google Business Profile API project approval.",
    "Create a server-side OAuth client with business.manage scope.",
    "Map each approved GBP account/location to WeatherTech Phoenix, WeatherTech Tucson, or IHC.",
    "Configure Pub/Sub notifications for reviews and location updates before enabling live sync.",
    "Approve review response and customer messaging rules before any outbound action is enabled.",
  ];
  const state: GoogleBusinessProfileReadinessState =
    liveSyncEnabled && oauthClientConfigured && configuredLocationCount > 0
      ? "connected"
      : oauthClientConfigured && configuredLocationCount > 0 && pubSubTopicConfigured
        ? "ready_for_testing"
        : oauthClientConfigured || configuredLocationCount > 0
          ? "oauth_required"
          : "not_configured";

  return {
    state,
    label:
      state === "connected"
        ? "Connected"
        : state === "ready_for_testing"
          ? "Ready for testing"
          : state === "oauth_required"
            ? "OAuth required"
            : "Not configured",
    endpointPath: googleBusinessProfileEndpointPath,
    dryRunPath: googleBusinessProfileDryRunPath,
    configuredLocationCount,
    enabledLocationCount,
    oauthClientConfigured,
    pubSubTopicConfigured,
    liveSyncEnabled,
    reviewReplyEnabled,
    ownerActions,
  };
}

export function buildGoogleBusinessProfileLocationRuntimeStatuses({
  logs = [],
  env = process.env,
}: {
  logs?: IntegrationSyncLogRecord[];
  env?: NodeJS.ProcessEnv;
} = {}): GoogleBusinessProfileLocationRuntimeStatus[] {
  return googleBusinessProfileLocations.map((location) => {
    const locationLogs = logs.filter(
      (log) =>
        log.provider === "google_business_profile" &&
        (log.event_type.includes(location.key) ||
          log.request_summary?.sourceAccount === location.sourceDetail ||
          log.request_summary?.locationKey === location.key),
    );
    const latestSuccess = locationLogs.find((log) => log.status === "succeeded");
    const latestFailure = locationLogs.find((log) => log.status === "failed");
    const liveSyncEnabled = isGoogleBusinessProfileSyncEnabled(location, env);
    const configuredAccountId = getConfiguredAccountId(location, env);
    const configuredLocationId = getConfiguredLocationId(location, env);
    const connectionStatus: GoogleBusinessProfileConnectionStatus =
      latestFailure?.error_message
        ? "sync_failed"
        : liveSyncEnabled
          ? "connected"
          : configuredAccountId && configuredLocationId
            ? "ready_for_testing"
            : "oauth_required";

    return {
      key: location.key,
      label: location.label,
      companyLabel: location.companyLabel,
      branchLabel: location.branchLabel,
      configuredAccountId,
      configuredLocationId,
      connectionStatus,
      productionLabel: liveSyncEnabled
        ? "Live sync enabled"
        : "Production disabled",
      liveSyncEnabled,
      reviewReplyEnabled: isGoogleBusinessProfileReviewReplyEnabled(env),
      lastSuccessfulSubmissionAt:
        latestSuccess?.completed_at ?? latestSuccess?.created_at ?? null,
      lastFailureAt: latestFailure?.completed_at ?? latestFailure?.created_at ?? null,
      lastError: latestFailure?.error_message ?? null,
    };
  });
}

export function buildGoogleBusinessProfileLeadCaptureRequestBody({
  body,
  resolution,
  correlationId = null,
}: GoogleBusinessProfileLeadCaptureRequestContext): GoogleBusinessProfileLeadRequestBody {
  const location = resolution.location;

  return {
    ...body,
    source: "Google Business Profile",
    sourceDetail: location?.sourceDetail ?? body.sourceDetail,
    campaign: location?.campaign ?? body.campaign,
    googleBusinessProfileLocationKey: location?.key ?? body.googleBusinessProfileLocationKey,
    googleAccountId:
      resolution.submittedAccountIdentifier ?? body.googleAccountId ?? body.accountId,
    googleLocationId:
      resolution.submittedLocationIdentifier ?? body.googleLocationId ?? body.locationId,
    googleEventId:
      resolution.submittedEventIdentifier ?? body.googleEventId ?? body.eventId,
    verifiedCompanyKey: location?.companyKey ?? "unassigned",
    verifiedBranchKey: location?.branchKey ?? "unassigned",
    forceUnassignedRouting: !location || resolution.status !== "matched",
    forceReviewReason:
      !location || resolution.status !== "matched"
        ? resolution.warnings[0] ?? "Google Business Profile location mapping needs review."
        : body.forceReviewReason,
    verifiedSourceMetadata: {
      provider: "google_business_profile",
      locationKey: location?.key ?? null,
      locationLabel: location?.label ?? null,
      accountId: resolution.submittedAccountIdentifier,
      locationId: resolution.submittedLocationIdentifier,
      eventId: resolution.submittedEventIdentifier,
      eventType: body.eventType ?? body.googleEventType ?? null,
      reviewRating: body.reviewRating ?? body.rating ?? null,
      officialLimits: {
        messaging: "unsupported",
        requestQuotes: "unsupported",
        qAndA: "discontinued",
      },
      correlationId,
    },
    correlationId: correlationId ?? body.correlationId,
  };
}
