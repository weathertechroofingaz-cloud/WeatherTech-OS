import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-website-foundation-"));
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
      "lib/crm/websiteLeadCapture.ts",
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
      `Could not compile website integration foundation.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const routing = await import(pathToFileURL(join(outDir, "leadRouting.js")));
  const websiteCapture = await import(
    pathToFileURL(join(outDir, "websiteLeadCapture.js"))
  );

  const env = {
    WEBSITE_INTAKE_ENABLED: "true",
    WEBSITE_INTAKE_SIGNING_SECRET: "test-only-website-secret",
    WEBSITE_ALLOWED_ORIGINS: "https://forms.weathertechroofingaz.com",
    WEBSITE_PRODUCTION_ENABLED_SOURCE_IDS: "phoenix-custom",
    WEATHERTECH_WEBSITE_SOURCE_ID: "phoenix-custom",
    WEATHERTECH_WEBSITE_INTAKE_ENABLED: "true",
    WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED: "false",
    IHC_WEBSITE_INTAKE_ENABLED: "false",
    IHC_WEBSITE_ALLOWED_ORIGINS: "https://ihc.example.test",
  };

  const phoenixResolution = websiteCapture.resolveWebsiteLeadCaptureSource(
    {
      sourceId: "phoenix-custom",
      formType: "roof_inspection_request",
      websiteUrl: "https://weathertechroofingaz.com/roof-inspection",
    },
    {},
    env,
  );

  assertEqual(phoenixResolution.status, "matched", "Env source alias resolves");
  assertEqual(
    phoenixResolution.source?.key,
    "weathertech-phoenix",
    "Env source alias resolves to WeatherTech Phoenix",
  );

  const roofInspection = websiteCapture.resolveWebsiteLeadCaptureForm(
    { formType: "roof_inspection_request" },
    phoenixResolution.source,
  );
  assertEqual(roofInspection.status, "matched", "Roof inspection form is supported");
  assertEqual(
    roofInspection.form?.serviceType,
    "roofing",
    "Roof inspection maps to roofing service type",
  );

  const unsupportedPainting = websiteCapture.resolveWebsiteLeadCaptureForm(
    { formType: "painting_estimate_request" },
    phoenixResolution.source,
  );
  assertEqual(
    unsupportedPainting.status,
    "unsupported",
    "Painting form is rejected for WeatherTech Roofing source",
  );

  const ihcResolution = websiteCapture.resolveWebsiteLeadCaptureSource(
    { sourceId: "ihc" },
    {},
    env,
  );
  const exteriorPainting = websiteCapture.resolveWebsiteLeadCaptureForm(
    { formType: "exterior_painting_request" },
    ihcResolution.source,
  );
  assertEqual(exteriorPainting.status, "matched", "IHC exterior painting form is supported");
  assertEqual(
    exteriorPainting.form?.serviceType,
    "painting",
    "IHC exterior painting form maps to painting",
  );

  const validOrigin = websiteCapture.verifyWebsiteLeadCaptureOrigin({
    headers: { origin: "https://forms.weathertechroofingaz.com" },
    source: phoenixResolution.source,
    env,
  });
  assertEqual(validOrigin.status, "valid", "Allowed origin passes");

  const invalidOrigin = websiteCapture.verifyWebsiteLeadCaptureOrigin({
    headers: { origin: "https://evil.example" },
    source: phoenixResolution.source,
    env,
  });
  assertEqual(invalidOrigin.ok, false, "Unexpected origin fails");
  assertEqual(invalidOrigin.status, "invalid_origin", "Unexpected origin reports invalid_origin");

  assertEqual(
    websiteCapture.isWebsiteLeadCaptureProductionEnabled(phoenixResolution.source, env),
    true,
    "Production enablement requires global and source flags",
  );
  assertEqual(
    websiteCapture.isWebsiteLeadCaptureProductionEnabled(ihcResolution.source, env),
    false,
    "IHC production remains disabled until configured",
  );

  const payload = {
    sourceId: "phoenix-custom",
    formType: "roof_inspection_request",
    name: "TEST Website Foundation",
    phone: "6025550144",
    email: "foundation@example.test",
    address: "144 Test Roof Way",
    city: "Phoenix",
    projectDescription: "Need a roof inspection after a storm.",
    landingPage: "https://weathertechroofingaz.com/phoenix-roof-inspection",
    referrer: "https://search.example",
    utmSource: "google",
    utmMedium: "cpc",
    utmCampaign: "storm-repair",
    utmTerm: "roof leak phoenix",
    utmContent: "hero-form",
    gclid: "TEST-GCLID",
    campaignId: "campaign-144",
    textConsent: true,
    callConsent: true,
    emailConsent: false,
    privacyPolicyAccepted: true,
    consentSource: "website form",
    submittedAt: new Date().toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const signature = websiteCapture.createWebsiteLeadCaptureSignature({
    rawBody,
    timestamp,
    secret: env.WEBSITE_INTAKE_SIGNING_SECRET,
  });
  const verification = websiteCapture.verifyWebsiteLeadCaptureRequest({
    rawBody,
    headers: {
      "x-weathertech-timestamp": timestamp,
      "x-weathertech-signature": `sha256=${signature}`,
    },
    source: phoenixResolution.source,
    secretOverride: env.WEBSITE_INTAKE_SIGNING_SECRET,
    now: new Date(timestamp),
  });

  assertEqual(verification.status, "valid", "Signed website payload verifies");

  const captureBody = websiteCapture.buildWebsiteLeadCaptureRequestBody({
    body: payload,
    resolution: phoenixResolution,
    formResolution: roofInspection,
    verification,
    originVerification: validOrigin,
    abuse: websiteCapture.evaluateWebsiteLeadCaptureAbuse(payload, phoenixResolution),
    correlationId: "test-website-foundation",
    rawBody,
  });
  const canonical = routing.normalizeWebsiteLeadIntake(captureBody);

  assertEqual(canonical.companyKey, "weathertech_roofing", "Canonical intake routes to WeatherTech");
  assertEqual(canonical.branchKey, "weathertech_phoenix", "Canonical intake routes to Phoenix");
  assertEqual(canonical.requestedService, "roofing", "Canonical intake keeps roofing service");
  assertEqual(canonical.leadSource, "Website roof inspection request", "Form-specific source is preserved");
  assertEqual(canonical.consentMetadata.smsConsent, true, "Text consent maps to SMS consent");
  assertEqual(
    captureBody.verifiedSourceMetadata.attribution.utmTerm,
    "roof leak phoenix",
    "UTM term is preserved in source metadata",
  );
  assertEqual(
    captureBody.verifiedSourceMetadata.consent.privacyPolicyAccepted,
    true,
    "Privacy consent is preserved in source metadata",
  );
  assertEqual(
    captureBody.verifiedSourceMetadata.suggestedNextAction,
    "Schedule roof inspection",
    "Form-specific next action is preserved",
  );

  const safeLogSummary = websiteCapture.buildWebsiteLeadCaptureSafeLogSummary({
    body: {
      ...payload,
      message: "token=super-secret Authorization: Bearer abc123",
    },
    resolution: phoenixResolution,
    formResolution: roofInspection,
    verification,
    originVerification: validOrigin,
    abuse: websiteCapture.evaluateWebsiteLeadCaptureAbuse(payload, phoenixResolution),
    correlationId: "test-website-foundation",
    rawBody,
  });
  const safeLogJson = JSON.stringify(safeLogSummary);

  assert(!safeLogJson.includes("6025550144"), "Safe log summary excludes raw phone number");
  assert(!safeLogJson.includes("foundation@example.test"), "Safe log summary excludes raw email");
  assert(!safeLogJson.includes("super-secret"), "Safe log summary redacts secret-like text");
  assert(
    typeof safeLogSummary.payloadHash === "string" &&
      safeLogSummary.payloadHash.length === 64,
    "Safe log summary includes request payload hash",
  );

  const firstFingerprint = websiteCapture.createWebsiteLeadCaptureRequestFingerprint({
    rawBody,
    source: phoenixResolution.source,
    externalId: "external-1",
  });
  const secondFingerprint = websiteCapture.createWebsiteLeadCaptureRequestFingerprint({
    rawBody,
    source: phoenixResolution.source,
    externalId: "external-1",
  });
  const changedFingerprint = websiteCapture.createWebsiteLeadCaptureRequestFingerprint({
    rawBody,
    source: phoenixResolution.source,
    externalId: "external-2",
  });

  assertEqual(firstFingerprint, secondFingerprint, "Request fingerprint is deterministic");
  assert(
    firstFingerprint !== changedFingerprint,
    "Request fingerprint changes when external ID changes",
  );

  const runtimeStatuses = websiteCapture.buildWebsiteLeadCaptureSourceRuntimeStatuses({
    logs: [
      {
        id: "log-1",
        company_id: "company-1",
        integration_connection_id: null,
        provider: "website",
        direction: "provider_to_weathertech",
        event_type: "website.lead.created",
        status: "succeeded",
        related_table: "leads",
        related_record_id: "lead-1",
        external_id: "external-1",
        attempt_count: 1,
        max_attempts: 3,
        next_retry_at: null,
        last_attempted_at: "2026-07-27T12:00:00.000Z",
        completed_at: "2026-07-27T12:00:01.000Z",
        request_fingerprint: firstFingerprint,
        request_summary: {
          sourceMetadata: {
            sourceRegistryKey: "weathertech-phoenix",
          },
        },
        response_summary: {},
        error_code: null,
        error_message: null,
        created_at: "2026-07-27T12:00:00.000Z",
        updated_at: "2026-07-27T12:00:01.000Z",
      },
    ],
    env,
  });
  const phoenixRuntime = runtimeStatuses.find((status) => status.key === "weathertech-phoenix");

  assertEqual(phoenixRuntime?.productionState, "active", "Runtime status shows enabled source as active");
  assertEqual(
    phoenixRuntime?.lastSuccessfulSubmissionAt,
    "2026-07-27T12:00:01.000Z",
    "Runtime status reports latest successful website submission",
  );

  console.log("Website integration foundation regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
