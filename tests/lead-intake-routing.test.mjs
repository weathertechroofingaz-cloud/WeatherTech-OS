import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-lead-routing-"));
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
      `Could not compile leadRouting.ts.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const routing = await import(pathToFileURL(join(outDir, "leadRouting.js")));
  const websiteCapture = await import(
    pathToFileURL(join(outDir, "websiteLeadCapture.js"))
  );

  const website = routing.normalizeWebsiteLeadIntake({
    business: "WeatherTech",
    websiteUrl: "https://weathertechroofingaz.com/contact",
    name: "TEST Website Lead",
    phone: "602-555-0101",
    address: "111 Test Roof Way",
    location: "Tucson",
    serviceType: "roofing",
  });
  assertEqual(website.companyKey, "weathertech_roofing", "Website routes to WeatherTech");
  assertEqual(website.branchKey, "weathertech_tucson", "Website Tucson routes to Tucson branch");
  assertEqual(website.routing.status, "ready_to_create", "Website routed lead is ready");

  const rawWebsiteBody = JSON.stringify({
    sourceId: "weathertech-phoenix",
    formIdentifier: "weathertech-phoenix-contact",
    name: "TEST Website Capture",
    phone: "6025550108",
    email: "capture@example.test",
    serviceType: "roofing",
    message: "Need a roofing estimate",
    websiteUrl: "https://weathertechroofingaz.com/contact",
    submittedAt: new Date().toISOString(),
  });
  const signatureTimestamp = new Date().toISOString();
  const testSecret = "test-only-website-capture-secret";
  const validSignature = websiteCapture.createWebsiteLeadCaptureSignature({
    rawBody: rawWebsiteBody,
    timestamp: signatureTimestamp,
    secret: testSecret,
  });
  const phoenixResolution = websiteCapture.resolveWebsiteLeadCaptureSource(
    JSON.parse(rawWebsiteBody),
  );
  assertEqual(phoenixResolution.status, "matched", "Phoenix website source resolves");
  assertEqual(
    phoenixResolution.source?.branchKey,
    "weathertech_phoenix",
    "Phoenix website source resolves to Phoenix branch",
  );

  const verifiedCapture = websiteCapture.verifyWebsiteLeadCaptureRequest({
    rawBody: rawWebsiteBody,
    headers: {
      "x-weathertech-timestamp": signatureTimestamp,
      "x-weathertech-signature": `sha256=${validSignature}`,
    },
    source: phoenixResolution.source,
    secretOverride: testSecret,
    now: new Date(signatureTimestamp),
  });
  assertEqual(verifiedCapture.status, "valid", "Valid website capture signature passes");

  const missingSignature = websiteCapture.verifyWebsiteLeadCaptureRequest({
    rawBody: rawWebsiteBody,
    headers: {},
    source: phoenixResolution.source,
    secretOverride: testSecret,
    now: new Date(signatureTimestamp),
  });
  assertEqual(
    missingSignature.status,
    "missing_signature",
    "Missing website capture signature is rejected",
  );

  const invalidSignature = websiteCapture.verifyWebsiteLeadCaptureRequest({
    rawBody: rawWebsiteBody,
    headers: {
      "x-weathertech-timestamp": signatureTimestamp,
      "x-weathertech-signature": `sha256=${"0".repeat(64)}`,
    },
    source: phoenixResolution.source,
    secretOverride: testSecret,
    now: new Date(signatureTimestamp),
  });
  assertEqual(
    invalidSignature.status,
    "invalid_signature",
    "Invalid website capture signature is rejected",
  );

  const tucsonResolution = websiteCapture.resolveWebsiteLeadCaptureSource({
    sourceId: "weathertech-tucson",
    formIdentifier: "weathertech-tucson-contact",
  });
  const tucsonCaptureBody = websiteCapture.buildWebsiteLeadCaptureRequestBody({
    body: {
      sourceId: "weathertech-tucson",
      formIdentifier: "weathertech-tucson-contact",
      firstName: "TEST",
      lastName: "Tucson",
      phone: "5205550109",
      serviceType: "roofing",
    },
    resolution: tucsonResolution,
    verification: verifiedCapture,
    abuse: websiteCapture.evaluateWebsiteLeadCaptureAbuse(
      { sourceId: "weathertech-tucson" },
      tucsonResolution,
    ),
    correlationId: "test-tucson-correlation",
  });
  const tucsonCanonical = routing.normalizeWebsiteLeadIntake(tucsonCaptureBody);
  assertEqual(
    tucsonCanonical.branchKey,
    "weathertech_tucson",
    "Tucson source registry routes to Tucson branch",
  );

  const ihcResolution = websiteCapture.resolveWebsiteLeadCaptureSource({
    sourceId: "ihc",
    formIdentifier: "ihc-contact",
  });
  const ihcCaptureBody = websiteCapture.buildWebsiteLeadCaptureRequestBody({
    body: {
      sourceId: "ihc",
      formIdentifier: "ihc-contact",
      name: "TEST IHC Website",
      email: "ihc-capture@example.test",
      serviceType: "painting",
    },
    resolution: ihcResolution,
    verification: verifiedCapture,
    abuse: websiteCapture.evaluateWebsiteLeadCaptureAbuse(
      { sourceId: "ihc" },
      ihcResolution,
    ),
    correlationId: "test-ihc-correlation",
  });
  const ihcCanonical = routing.normalizeWebsiteLeadIntake(ihcCaptureBody);
  assertEqual(ihcCanonical.companyKey, "ihc_painting", "IHC source registry routes to IHC");
  assertEqual(ihcCanonical.branchKey, "ihc", "IHC source registry routes to IHC branch");

  const unknownResolution = websiteCapture.resolveWebsiteLeadCaptureSource({
    sourceId: "unknown-source",
    serviceType: "roofing",
    websiteUrl: "https://unknown.example/form",
  });
  const unknownCaptureBody = websiteCapture.buildWebsiteLeadCaptureRequestBody({
    body: {
      sourceId: "unknown-source",
      name: "TEST Unknown Website",
      phone: "6025550110",
      serviceType: "roofing",
      websiteUrl: "https://unknown.example/form",
    },
    resolution: unknownResolution,
    verification: verifiedCapture,
    abuse: websiteCapture.evaluateWebsiteLeadCaptureAbuse(
      { sourceId: "unknown-source" },
      unknownResolution,
    ),
    correlationId: "test-unknown-correlation",
  });
  const unknownCanonical = routing.normalizeWebsiteLeadIntake(unknownCaptureBody);
  assertEqual(unknownResolution.status, "unknown", "Unknown website source remains unknown");
  assertEqual(
    unknownCanonical.companyKey,
    "unassigned",
    "Unknown website source does not infer company from service type",
  );
  assertEqual(
    unknownCanonical.routing.status,
    "needs_review",
    "Unknown website source routes to review",
  );

  const honeypot = websiteCapture.evaluateWebsiteLeadCaptureAbuse(
    { honeypot: "filled" },
    phoenixResolution,
  );
  assertEqual(honeypot.status, "review_required", "Honeypot submissions require review");

  const yelp = routing.normalizeYelpLeadIntake({
    yelpBusinessId: "IHC Painting Yelp Account",
    name: "TEST Yelp Lead",
    email: "test@example.com",
    location: "Tempe",
    serviceType: "painting",
  });
  assertEqual(yelp.companyKey, "ihc_painting", "Yelp routes to IHC");
  assertEqual(yelp.branchKey, "ihc", "Yelp IHC routes to IHC branch");

  const manual = routing.normalizeManualLeadIntake({
    name: "TEST Manual Unknown",
    phone: "6025550102",
  });
  assertEqual(manual.companyKey, "unassigned", "Manual unknown company stays unassigned");
  assertEqual(manual.branchKey, "unassigned", "Manual unknown branch stays unassigned");
  assertEqual(manual.routing.status, "needs_review", "Manual unknown requires review");

  const call = routing.normalizeTwilioCallLeadIntake({
    callSid: "CA_TEST",
    from: "+16025550103",
    to: "+14805550100",
    city: "Phoenix",
    serviceType: "roofing",
  });
  assertEqual(call.provider, "twilio_call", "Twilio call adapter identifies provider");
  assertEqual(call.branchKey, "weathertech_phoenix", "Twilio roofing call routes Phoenix");

  const sms = routing.normalizeTwilioSmsLeadIntake({
    messageSid: "SM_TEST",
    from: "+16025550104",
    to: "+14805550101",
    body: "Need exterior painting",
    serviceType: "painting",
  });
  assertEqual(sms.provider, "twilio_sms", "Twilio SMS adapter identifies provider");
  assertEqual(sms.companyKey, "ihc_painting", "Twilio painting SMS routes to IHC");

  const ghl = routing.normalizeGoHighLevelLeadIntake({
    contactId: "GHL_TEST_CONTACT",
    firstName: "TEST",
    lastName: "GHL",
    locationName: "WeatherTech Phoenix",
    serviceType: "roofing",
  });
  assertEqual(ghl.provider, "gohighlevel", "GoHighLevel adapter identifies provider");
  assertEqual(ghl.branchKey, "weathertech_phoenix", "GoHighLevel location routes branch");

  const exactMatches = routing.detectLeadIntakeDuplicates(website, [
    {
      id: "lead-exact",
      recordType: "lead",
      companyId: "company",
      name: "Existing Website Lead",
      phone: "+16025550101",
      email: null,
      address: "111 Test Roof Way",
    },
  ]);
  assertEqual(exactMatches[0]?.confidence, "exact_match", "Phone and address duplicate is exact");
  assertEqual(exactMatches[0]?.autoMerge, false, "Exact duplicates still do not auto-merge");

  const likelyMatches = routing.detectLeadIntakeDuplicates(website, [
    {
      id: "lead-likely",
      recordType: "lead",
      companyId: "company",
      name: "Existing Phone Lead",
      phone: "+16025550101",
      email: null,
      address: "999 Different Way",
    },
  ]);
  assertEqual(likelyMatches[0]?.confidence, "likely_match", "Phone duplicate is likely");

  const possibleMatches = routing.detectLeadIntakeDuplicates(website, [
    {
      id: "customer-possible",
      recordType: "customer",
      companyId: "company",
      name: "Other Owner",
      phone: null,
      email: null,
      address: "111 Test Roof Way",
    },
  ]);
  assertEqual(possibleMatches[0]?.confidence, "possible_match", "Address-only duplicate is possible");

  const noMatches = routing.detectLeadIntakeDuplicates(website, [
    {
      id: "lead-none",
      recordType: "lead",
      companyId: "company",
      name: "Different Lead",
      phone: "+16025559999",
      email: "different@example.com",
      address: "999 Different Way",
    },
  ]);
  assertEqual(noMatches.length, 0, "Unrelated records are not duplicate matches");
  assertEqual(routing.leadIntakeDuplicatePolicy.autoMerge, false, "Policy prevents automatic merge");

  console.log("Lead intake routing regression: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
