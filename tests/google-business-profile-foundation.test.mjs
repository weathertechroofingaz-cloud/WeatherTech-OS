import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-gbp-foundation-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/crm/leadRouting.ts",
      "lib/crm/googleBusinessProfileLeadCapture.ts",
      "lib/crm/googleBusinessProfileLeadCaptureServer.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Google Business Profile foundation.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const routing = await import(pathToFileURL(join(outDir, "leadRouting.js")));
  const gbpCapture = await import(
    pathToFileURL(join(outDir, "googleBusinessProfileLeadCapture.js"))
  );
  const gbpServer = await import(
    pathToFileURL(join(outDir, "googleBusinessProfileLeadCaptureServer.js"))
  );

  const gbpAdapter = routing.leadIntakeAdapterDefinitions.find(
    (adapter) => adapter.provider === "google_business_profile",
  );
  assert(gbpAdapter, "Google Business Profile adapter is registered");
  assertEqual(
    gbpAdapter.status,
    "setup_required",
    "GBP adapter does not imply live connectivity",
  );

  const reviewsCapability = gbpCapture.googleBusinessProfileOfficialCapabilities.find(
    (capability) => capability.key === "reviews",
  );
  const performanceCapability =
    gbpCapture.googleBusinessProfileOfficialCapabilities.find(
      (capability) => capability.key === "performance",
    );
  const notificationsCapability =
    gbpCapture.googleBusinessProfileOfficialCapabilities.find(
      (capability) => capability.key === "notifications",
    );
  const messagingCapability =
    gbpCapture.googleBusinessProfileOfficialCapabilities.find(
      (capability) => capability.key === "messaging",
    );
  const qAndACapability = gbpCapture.googleBusinessProfileOfficialCapabilities.find(
    (capability) => capability.key === "q_and_a",
  );

  assertEqual(
    reviewsCapability?.status,
    "oauth_required",
    "GBP reviews require OAuth readiness",
  );
  assertEqual(
    performanceCapability?.status,
    "oauth_required",
    "GBP performance metrics require OAuth readiness",
  );
  assertEqual(
    notificationsCapability?.status,
    "oauth_required",
    "GBP notifications require OAuth/PubSub readiness",
  );
  assertEqual(
    messagingCapability?.status,
    "unsupported",
    "GBP messaging is not presented as a supported live intake path",
  );
  assertEqual(
    qAndACapability?.status,
    "discontinued",
    "GBP Q&A is not presented as a supported live intake path",
  );

  const env = {
    GOOGLE_BUSINESS_PROFILE_CLIENT_ID: "gbp-client",
    GOOGLE_BUSINESS_PROFILE_CLIENT_SECRET: "gbp-client-secret",
    GOOGLE_BUSINESS_PROFILE_REDIRECT_URI:
      "https://weathertech-os.example.test/api/integrations/google-business-profile/oauth/callback",
    GOOGLE_BUSINESS_PROFILE_PUBSUB_TOPIC:
      "projects/weathertech-os/topics/gbp-updates",
    GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID_WEATHERTECH: "accounts/weathertech",
    GOOGLE_BUSINESS_PROFILE_LOCATION_ID_WEATHERTECH_PHOENIX:
      "locations/weathertech-phoenix",
    GOOGLE_BUSINESS_PROFILE_LOCATION_ID_WEATHERTECH_TUCSON:
      "locations/weathertech-tucson",
    GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID_IHC: "accounts/ihc",
    GOOGLE_BUSINESS_PROFILE_LOCATION_ID_IHC: "locations/ihc",
  };

  const phoenixResolution = gbpCapture.resolveGoogleBusinessProfileLocation(
    {
      googleLocationId: "locations/weathertech-phoenix",
      googleReviewId: "GBP_REVIEW_1",
    },
    {},
    env,
  );
  assertEqual(phoenixResolution.status, "matched", "Phoenix GBP location resolves");
  assertEqual(
    phoenixResolution.location?.branchKey,
    "weathertech_phoenix",
    "Phoenix GBP location routes to Phoenix branch",
  );

  const tucsonResolution = gbpCapture.resolveGoogleBusinessProfileLocation(
    { locationKey: "weathertech-tucson" },
    {},
    env,
  );
  assertEqual(tucsonResolution.status, "matched", "Tucson GBP location resolves");
  assertEqual(
    tucsonResolution.location?.branchKey,
    "weathertech_tucson",
    "Tucson GBP location routes to Tucson branch",
  );

  const ihcResolution = gbpCapture.resolveGoogleBusinessProfileLocation(
    { locationId: "locations/ihc" },
    {},
    env,
  );
  assertEqual(ihcResolution.status, "matched", "IHC GBP location resolves");
  assertEqual(ihcResolution.location?.companyKey, "ihc_painting", "IHC routes to IHC");

  const unknownResolution = gbpCapture.resolveGoogleBusinessProfileLocation(
    { locationKey: "unknown-google-location" },
    {},
    env,
  );
  assertEqual(
    unknownResolution.status,
    "unknown",
    "Unknown GBP location is not silently routed",
  );

  assertEqual(
    gbpCapture.isGoogleBusinessProfileSyncEnabled(phoenixResolution.location, env),
    false,
    "GBP live sync is disabled unless global and location flags are enabled",
  );
  const enabledEnv = {
    ...env,
    GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: "true",
    GOOGLE_BUSINESS_PROFILE_PRODUCTION_LOCATION_KEYS: "weathertech-phoenix",
  };
  assertEqual(
    gbpCapture.isGoogleBusinessProfileSyncEnabled(
      phoenixResolution.location,
      enabledEnv,
    ),
    true,
    "GBP live sync requires global and location allow-list enablement",
  );
  assertEqual(
    gbpCapture.isGoogleBusinessProfileSyncEnabled(tucsonResolution.location, enabledEnv),
    false,
    "GBP live sync allow-list does not enable other locations",
  );
  assertEqual(
    gbpCapture.isGoogleBusinessProfileReviewReplyEnabled(env),
    false,
    "GBP review replies are disabled by default",
  );

  const readiness = gbpCapture.buildGoogleBusinessProfileReadiness(env);
  assertEqual(readiness.oauthClientConfigured, true, "GBP OAuth readiness is tracked");
  assertEqual(readiness.pubSubTopicConfigured, true, "GBP Pub/Sub readiness is tracked");
  assertEqual(readiness.configuredLocationCount, 3, "All three GBP location slots are tracked");
  assertEqual(readiness.liveSyncEnabled, false, "Readiness does not fake live sync");

  const payload = {
    googleLocationId: "locations/weathertech-phoenix",
    googleReviewId: "GBP_REVIEW_1",
    reviewerName: "TEST GBP Foundation",
    phone: "6025550197",
    email: "gbp-foundation@example.test",
    city: "Phoenix",
    serviceType: "roofing",
    reviewRating: 3,
    reviewText: "Need help with a roof leak after the last storm.",
    submittedAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const captureBody = gbpCapture.buildGoogleBusinessProfileLeadCaptureRequestBody({
    body: payload,
    resolution: phoenixResolution,
    correlationId: "test-gbp-foundation",
    rawBody,
  });
  const canonical = routing.normalizeGoogleBusinessProfileLeadIntake(captureBody);
  assertEqual(
    canonical.companyKey,
    "weathertech_roofing",
    "Canonical GBP routes WeatherTech",
  );
  assertEqual(
    canonical.branchKey,
    "weathertech_phoenix",
    "Canonical GBP routes Phoenix",
  );
  assertEqual(
    canonical.providerExternalId,
    "GBP_REVIEW_1",
    "GBP event ID is the provider key",
  );
  assertEqual(
    canonical.campaign,
    "google-business-profile-phoenix",
    "GBP campaign preserves source account",
  );

  const safeLogSummary = gbpServer.buildGoogleBusinessProfileSafeLogSummary({
    body: {
      ...payload,
      reviewText: "Authorization: Bearer super-secret-token",
    },
    resolution: phoenixResolution,
    correlationId: "test-gbp-foundation",
    rawBody,
  });
  const safeLogJson = JSON.stringify(safeLogSummary);

  assert(!safeLogJson.includes("6025550197"), "Safe GBP log summary excludes raw phone number");
  assert(!safeLogJson.includes("gbp-foundation@example.test"), "Safe GBP log summary excludes raw email");
  assert(!safeLogJson.includes("super-secret-token"), "Safe GBP log summary redacts secret-like text");
  assert(
    typeof safeLogSummary.rawBodyHash === "string" &&
      safeLogSummary.rawBodyHash.length === 64,
    "Safe GBP log summary includes raw body hash",
  );

  const firstFingerprint =
    gbpServer.createGoogleBusinessProfileRequestFingerprint({
      rawBody,
      location: phoenixResolution.location,
      externalId: "GBP_REVIEW_1",
    });
  const secondFingerprint =
    gbpServer.createGoogleBusinessProfileRequestFingerprint({
      rawBody,
      location: phoenixResolution.location,
      externalId: "GBP_REVIEW_1",
    });
  const changedFingerprint =
    gbpServer.createGoogleBusinessProfileRequestFingerprint({
      rawBody,
      location: phoenixResolution.location,
      externalId: "GBP_REVIEW_2",
    });

  assertEqual(firstFingerprint, secondFingerprint, "GBP request fingerprint is deterministic");
  assert(firstFingerprint !== changedFingerprint, "GBP request fingerprint changes by external ID");

  const runtimeStatuses =
    gbpCapture.buildGoogleBusinessProfileLocationRuntimeStatuses({
      logs: [
        {
          id: "log-1",
          company_id: "company-1",
          integration_connection_id: null,
          provider: "google_business_profile",
          direction: "provider_to_weathertech",
          event_type: "google_business_profile.lead.created",
          status: "succeeded",
          related_table: "leads",
          related_record_id: "lead-1",
          external_id: "GBP_REVIEW_1",
          attempt_count: 1,
          max_attempts: 3,
          next_retry_at: null,
          last_attempted_at: "2026-08-04T12:00:00.000Z",
          completed_at: "2026-08-04T12:00:01.000Z",
          request_fingerprint: firstFingerprint,
          request_summary: {
            locationKey: "weathertech-phoenix",
          },
          response_summary: {},
          error_code: null,
          error_message: null,
          created_at: "2026-08-04T12:00:00.000Z",
          updated_at: "2026-08-04T12:00:01.000Z",
        },
      ],
      env,
    });
  const phoenixRuntime = runtimeStatuses.find(
    (status) => status.key === "weathertech-phoenix",
  );

  assertEqual(
    phoenixRuntime?.connectionStatus,
    "ready_for_testing",
    "Runtime status does not claim live sync when flags are disabled",
  );
  assertEqual(
    phoenixRuntime?.lastSuccessfulSubmissionAt,
    "2026-08-04T12:00:01.000Z",
    "Runtime status reports latest successful GBP log",
  );

  console.log("Google Business Profile foundation regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
