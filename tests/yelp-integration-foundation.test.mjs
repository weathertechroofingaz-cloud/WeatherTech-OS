import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-yelp-foundation-"));
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
      "lib/crm/yelpLeadCapture.ts",
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
      `Could not compile Yelp integration foundation.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const routing = await import(pathToFileURL(join(outDir, "leadRouting.js")));
  const yelpCapture = await import(pathToFileURL(join(outDir, "yelpLeadCapture.js")));

  const yelpAdapter = routing.leadIntakeAdapterDefinitions.find(
    (adapter) => adapter.provider === "yelp",
  );
  assert(yelpAdapter, "Yelp adapter is registered");
  assertEqual(
    yelpAdapter.status,
    "setup_required",
    "Yelp adapter does not imply live connectivity",
  );

  const leadsCapability = yelpCapture.yelpLeadCaptureOfficialCapabilities.find(
    (capability) => capability.key === "leads_api",
  );
  const reviewsCapability = yelpCapture.yelpLeadCaptureOfficialCapabilities.find(
    (capability) => capability.key === "fusion_reviews",
  );
  const messageBusinessCapability =
    yelpCapture.yelpLeadCaptureOfficialCapabilities.find(
      (capability) => capability.key === "profile_message_business",
    );

  assertEqual(
    leadsCapability?.status,
    "partner_required",
    "Yelp Leads API is documented as partner-required",
  );
  assertEqual(
    reviewsCapability?.status,
    "available",
    "Yelp business/review capability is represented separately from leads",
  );
  assertEqual(
    messageBusinessCapability?.status,
    "unsupported",
    "Message the Business is not presented as a live Leads API path",
  );

  const env = {
    YELP_PARTNER_ID: "partner-test",
    YELP_CLIENT_ID: "client-test",
    YELP_CLIENT_SECRET: "client-secret-test",
    YELP_REDIRECT_URI: "https://weathertech-os.example.test/yelp/callback",
    YELP_WEBHOOK_SECRET: "webhook-secret-test",
    YELP_ACCOUNT_ID_WEATHERTECH_PHOENIX: "phoenix-live-id",
    YELP_ACCOUNT_ID_WEATHERTECH_TUCSON: "tucson-live-id",
    YELP_ACCOUNT_ID_IHC: "ihc-live-id",
    YELP_BUSINESS_ID_WEATHERTECH_PHOENIX: "phoenix-business-id",
    YELP_BUSINESS_ID_WEATHERTECH_TUCSON: "tucson-business-id",
    YELP_BUSINESS_ID_IHC: "ihc-business-id",
    YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX: "phoenix-secret",
    YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_TUCSON: "tucson-secret",
    YELP_LEAD_CAPTURE_SECRET_IHC: "ihc-secret",
  };

  const phoenixResolution = yelpCapture.resolveYelpLeadCaptureAccount(
    {
      yelpBusinessId: "phoenix-business-id",
      yelpLeadId: "TEST_YELP_LEAD_1",
      yelpConversationId: "TEST_YELP_CONVERSATION_1",
    },
    {},
    env,
  );
  assertEqual(phoenixResolution.status, "matched", "Phoenix env business ID resolves");
  assertEqual(
    phoenixResolution.account?.branchKey,
    "weathertech_phoenix",
    "Phoenix account routes to Phoenix branch",
  );

  const tucsonResolution = yelpCapture.resolveYelpLeadCaptureAccount(
    { providerAccountId: "tucson-live-id" },
    {},
    env,
  );
  assertEqual(tucsonResolution.status, "matched", "Tucson env provider account resolves");
  assertEqual(
    tucsonResolution.account?.branchKey,
    "weathertech_tucson",
    "Tucson account routes to Tucson branch",
  );

  const ihcResolution = yelpCapture.resolveYelpLeadCaptureAccount(
    { businessId: "ihc-business-id" },
    {},
    env,
  );
  assertEqual(ihcResolution.status, "matched", "IHC env business ID resolves");
  assertEqual(ihcResolution.account?.companyKey, "ihc_painting", "IHC account routes to IHC");

  assertEqual(
    yelpCapture.isYelpLeadCaptureLiveSyncEnabled(phoenixResolution.account, env),
    false,
    "Yelp live sync is disabled unless global and account flags are enabled",
  );
  assertEqual(
    yelpCapture.isYelpOutboundMessagingEnabled(phoenixResolution.account, env),
    false,
    "Yelp outbound messaging is disabled by default",
  );

  const enabledEnv = {
    ...env,
    YELP_LIVE_SYNC_ENABLED: "true",
    YELP_LIVE_SYNC_ENABLED_WEATHERTECH_PHOENIX: "true",
    YELP_PRODUCTION_ENABLED_ACCOUNT_IDS: "phoenix-live-id",
  };
  assertEqual(
    yelpCapture.isYelpLeadCaptureLiveSyncEnabled(
      phoenixResolution.account,
      enabledEnv,
    ),
    true,
    "Yelp live sync requires global, account, and allow-list enablement",
  );
  assertEqual(
    yelpCapture.isYelpLeadCaptureLiveSyncEnabled(tucsonResolution.account, enabledEnv),
    false,
    "Yelp live sync allow-list does not enable other accounts",
  );

  const readiness = yelpCapture.buildYelpLeadCaptureReadiness(env);
  assertEqual(readiness.partnerIdConfigured, true, "Yelp partner ID readiness is tracked");
  assertEqual(readiness.oauthClientConfigured, true, "Yelp OAuth readiness is tracked");
  assertEqual(readiness.configuredBusinessIdCount, 3, "All three Yelp business ID slots are tracked");
  assertEqual(readiness.liveSyncEnabled, false, "Readiness does not fake live sync");

  const payload = {
    yelpBusinessId: "phoenix-business-id",
    yelpLeadId: "TEST_YELP_LEAD_1",
    yelpConversationId: "TEST_YELP_CONVERSATION_1",
    name: "TEST Yelp Foundation",
    phone: "6025550198",
    email: "foundation-yelp@example.test",
    location: "Phoenix",
    serviceType: "roofing",
    message: "Need a roof leak estimate.",
    submittedAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = yelpCapture.createYelpLeadCaptureSignature({
    rawBody,
    timestamp,
    secret: env.YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX,
  });
  const verification = yelpCapture.verifyYelpLeadCaptureRequest({
    rawBody,
    headers: {
      "x-weathertech-timestamp": timestamp,
      "x-weathertech-signature": `sha256=${signature}`,
    },
    account: phoenixResolution.account,
    secretOverride: env.YELP_LEAD_CAPTURE_SECRET_WEATHERTECH_PHOENIX,
    now: new Date(timestamp),
  });
  assertEqual(verification.status, "valid", "Signed Yelp payload verifies");

  const captureBody = yelpCapture.buildYelpLeadCaptureRequestBody({
    body: payload,
    resolution: phoenixResolution,
    verification,
    abuse: yelpCapture.evaluateYelpLeadCaptureAbuse(payload, phoenixResolution),
    correlationId: "test-yelp-foundation",
  });
  const canonical = routing.normalizeYelpLeadIntake(captureBody);
  assertEqual(canonical.companyKey, "weathertech_roofing", "Canonical Yelp routes WeatherTech");
  assertEqual(canonical.branchKey, "weathertech_phoenix", "Canonical Yelp routes Phoenix");
  assertEqual(canonical.providerExternalId, "TEST_YELP_LEAD_1", "Yelp lead ID is the provider key");
  assertEqual(canonical.campaign, "yelp-phoenix", "Yelp campaign preserves source account");

  const safeLogSummary = yelpCapture.buildYelpLeadCaptureSafeLogSummary({
    body: {
      ...payload,
      message: "Authorization: Bearer super-secret-token",
    },
    resolution: phoenixResolution,
    verification,
    abuse: yelpCapture.evaluateYelpLeadCaptureAbuse(payload, phoenixResolution),
    correlationId: "test-yelp-foundation",
    rawBody,
  });
  const safeLogJson = JSON.stringify(safeLogSummary);

  assert(!safeLogJson.includes("6025550198"), "Safe Yelp log summary excludes raw phone number");
  assert(!safeLogJson.includes("foundation-yelp@example.test"), "Safe Yelp log summary excludes raw email");
  assert(!safeLogJson.includes("super-secret-token"), "Safe Yelp log summary redacts secret-like text");
  assert(
    typeof safeLogSummary.payloadHash === "string" &&
      safeLogSummary.payloadHash.length === 64,
    "Safe Yelp log summary includes payload hash",
  );

  const firstFingerprint = yelpCapture.createYelpLeadCaptureRequestFingerprint({
    rawBody,
    account: phoenixResolution.account,
    externalId: "TEST_YELP_LEAD_1",
  });
  const secondFingerprint = yelpCapture.createYelpLeadCaptureRequestFingerprint({
    rawBody,
    account: phoenixResolution.account,
    externalId: "TEST_YELP_LEAD_1",
  });
  const changedFingerprint = yelpCapture.createYelpLeadCaptureRequestFingerprint({
    rawBody,
    account: phoenixResolution.account,
    externalId: "TEST_YELP_LEAD_2",
  });

  assertEqual(firstFingerprint, secondFingerprint, "Yelp request fingerprint is deterministic");
  assert(firstFingerprint !== changedFingerprint, "Yelp request fingerprint changes by external ID");

  const runtimeStatuses = yelpCapture.buildYelpLeadCaptureAccountRuntimeStatuses({
    logs: [
      {
        id: "log-1",
        company_id: "company-1",
        integration_connection_id: null,
        provider: "yelp",
        direction: "provider_to_weathertech",
        event_type: "yelp.lead.created",
        status: "succeeded",
        related_table: "leads",
        related_record_id: "lead-1",
        external_id: "TEST_YELP_LEAD_1",
        attempt_count: 1,
        max_attempts: 3,
        next_retry_at: null,
        last_attempted_at: "2026-08-04T12:00:00.000Z",
        completed_at: "2026-08-04T12:00:01.000Z",
        request_fingerprint: firstFingerprint,
        request_summary: {
          sourceMetadata: {
            sourceRegistryKey: "weathertech-phoenix",
          },
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
  const phoenixRuntime = runtimeStatuses.find((status) => status.key === "weathertech-phoenix");

  assertEqual(
    phoenixRuntime?.productionState,
    "ready_for_signed_testing",
    "Runtime status does not claim live sync when flags are disabled",
  );
  assertEqual(
    phoenixRuntime?.lastSuccessfulSubmissionAt,
    "2026-08-04T12:00:01.000Z",
    "Runtime status reports latest successful Yelp log",
  );

  console.log("Yelp integration foundation regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
