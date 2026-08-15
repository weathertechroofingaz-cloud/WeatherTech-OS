import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-staging-readiness-"));
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

const baseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
  NEXT_PUBLIC_APP_ENV: "staging",
  NEXT_PUBLIC_APP_URL: "https://weathertech-os-staging.example.test",
  WTOS_DEPLOYMENT_ENV: "staging",
  WTOS_DEPLOYMENT_PROVIDER: "vercel",
  WTOS_STAGING_URL: "https://weathertech-os-staging.example.test",
  WTOS_AUTH_REDIRECTS_VERIFIED: "true",
  WTOS_SUPABASE_MIGRATIONS_VERIFIED: "true",
  WTOS_STAGING_REGRESSION_VERIFIED: "true",
  WTOS_PRODUCTION_APPROVED: "false",
  TWILIO_AUTH_TOKEN: "twilio-secret-value",
  TWILIO_INBOUND_SMS_ENABLED: "false",
  TWILIO_OUTBOUND_SMS_ENABLED: "false",
  GOOGLE_GMAIL_SEND_ENABLED: "false",
  GOOGLE_CALENDAR_WRITE_ENABLED: "false",
  WEBSITE_INTAKE_ENABLED: "false",
  WEATHERTECH_WEBSITE_INTAKE_ENABLED: "false",
  WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED: "false",
  IHC_WEBSITE_INTAKE_ENABLED: "false",
  YELP_LIVE_SYNC_ENABLED: "false",
  YELP_OUTBOUND_MESSAGING_ENABLED: "false",
  GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: "false",
  GOOGLE_BUSINESS_PROFILE_REVIEW_REPLY_ENABLED: "false",
  QUICKBOOKS_SYNC_ENABLED: "false",
  QUICKBOOKS_ACCOUNTING_WRITES_ENABLED: "false",
  QUICKBOOKS_PAYMENT_PROCESSING_ENABLED: "false",
  DOCUSIGN_SIGNATURE_REQUESTS_ENABLED: "false",
  DOCUSIGN_PROVIDER_WRITES_ENABLED: "false",
  DROPBOX_SIGN_SIGNATURE_REQUESTS_ENABLED: "false",
  DROPBOX_SIGN_PROVIDER_WRITES_ENABLED: "false",
  WTOS_CUSTOMER_PORTAL_ENABLED: "false",
  WTOS_AUTOMATED_CUSTOMER_NOTIFICATIONS_ENABLED: "false",
  WTOS_PUBLIC_REGISTRATION_ENABLED: "false",
};

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/deployment/stagingReadiness.ts",
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
      `Could not compile staging deployment readiness helper.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const readinessModule = await import(pathToFileURL(join(outDir, "stagingReadiness.js")));
  const now = new Date("2026-08-04T12:00:00.000Z");
  const health = readinessModule.buildPrivateStagingHealthReport({ env: baseEnv, now });

  assertEqual(health.status, "healthy", "Health endpoint reports process health only");
  assertEqual(
    health.metadata.productionActivationStatus,
    "not_granted",
    "Production activation remains disabled in staging",
  );
  assertEqual(
    health.metadata.liveProviderWritesStatus,
    "disabled",
    "Provider writes stay disabled in staging",
  );

  const noSecretHealth = readinessModule.assertNoSecretValuesInDeploymentReport(health, baseEnv);
  assert(noSecretHealth.ok, "Health report does not expose secret environment values");

  const successfulFetch = async () => ({
    status: 403,
    ok: false,
    statusText: "Forbidden",
  });
  const readyReport = await readinessModule.buildPrivateStagingReadinessReport({
    env: baseEnv,
    now,
    fetchImpl: successfulFetch,
  });

  assertEqual(
    readyReport.status,
    "ready",
    "Readiness can become ready only after staging evidence is recorded",
  );
  assert(
    readyReport.checks.some(
      (check) => check.id === "supabase-data-api" && check.status === "pass",
    ),
    "Supabase Data API probe treats anonymous restriction as a reachable private-staging result",
  );
  const noSecretReadiness = readinessModule.assertNoSecretValuesInDeploymentReport(
    readyReport,
    baseEnv,
  );
  assert(noSecretReadiness.ok, "Readiness report does not expose secret environment values");

  const missingEnvReport = await readinessModule.buildPrivateStagingReadinessReport({
    env: {},
    now,
    fetchImpl: successfulFetch,
  });
  assertEqual(
    missingEnvReport.status,
    "blocked",
    "Missing environment variables block staging readiness",
  );
  assert(
    missingEnvReport.blockers.some((blocker) =>
      blocker.includes("Required staging runtime variables"),
    ),
    "Missing runtime environment blocker is explicit",
  );

  const unsafeReport = await readinessModule.buildPrivateStagingReadinessReport({
    env: {
      ...baseEnv,
      TWILIO_OUTBOUND_SMS_ENABLED: "true",
      WTOS_PRODUCTION_APPROVED: "true",
    },
    now,
    fetchImpl: successfulFetch,
  });
  assertEqual(unsafeReport.status, "blocked", "Enabled live gates block staging readiness");
  assert(
    unsafeReport.blockers.some((blocker) =>
      blocker.includes("Live provider write safety flags"),
    ),
    "Enabled provider safety gate is a blocker",
  );
  assert(
    unsafeReport.blockers.some((blocker) =>
      blocker.includes("Production activation approval"),
    ),
    "Production activation approval is not silently accepted",
  );

  const invalidFlagReport = await readinessModule.buildPrivateStagingReadinessReport({
    env: {
      ...baseEnv,
      GOOGLE_GMAIL_SEND_ENABLED: "maybe",
    },
    now,
    fetchImpl: successfulFetch,
  });
  assertEqual(invalidFlagReport.status, "blocked", "Invalid boolean flags block readiness");

  const mightyApesInboundReport = await readinessModule.buildPrivateStagingReadinessReport({
    env: {
      ...baseEnv,
      MIGHTY_APES_YELP_WEBHOOK_SECRET: "synthetic-mighty-apes-secret",
    },
    now,
    fetchImpl: successfulFetch,
  });
  assertEqual(
    mightyApesInboundReport.status,
    "blocked",
    "A configured Mighty Apes inbound secret is treated as an active provider write path",
  );
  assert(
    mightyApesInboundReport.checks
      .find((check) => check.id === "provider-safety-flags")
      ?.evidence.includes(
        "MIGHTY_APES_YELP_WEBHOOK_SECRET: present, secret redacted",
      ),
    "Mighty Apes secret presence is reported without exposing its value",
  );

  assert(
    readinessModule.STAGING_PROVIDER_SAFETY_FLAGS.includes("QUICKBOOKS_ACCOUNTING_WRITES_ENABLED"),
    "QuickBooks accounting writes are part of staging safety checks",
  );
  assert(
    readinessModule.STAGING_PROVIDER_SAFETY_FLAGS.includes("DOCUSIGN_PROVIDER_WRITES_ENABLED"),
    "Electronic signature provider writes are part of staging safety checks",
  );
  assert(
    readinessModule.STAGING_PROVIDER_SAFETY_FLAGS.includes("WTOS_CUSTOMER_PORTAL_ENABLED"),
    "Customer portal activation is part of staging safety checks",
  );
  assert(
    readinessModule.STAGING_PROVIDER_SECRET_ACTIVATORS.includes(
      "MIGHTY_APES_YELP_WEBHOOK_SECRET",
    ),
    "Mighty Apes inbound activation is part of staging safety checks",
  );

  console.log("Private staging deployment readiness tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
