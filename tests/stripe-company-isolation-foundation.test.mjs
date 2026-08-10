import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".tmp-weathertech-stripe-foundation-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");
const migrationPath = path.join(
  cwd,
  "supabase",
  "migrations",
  "20260808222141_stripe_company_isolation.sql",
);

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

async function assertRejects(promise, expectedMessage, message) {
  try {
    await promise;
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      `${message}. Received ${error instanceof Error ? error.message : String(error)}.`,
    );
    return;
  }

  throw new Error(`${message}. Expected the promise to reject.`);
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/stripe/foundation.ts",
      "lib/stripe/clientPayment.ts",
      "lib/stripe/serverClient.ts",
      "lib/crm/integrationCenter.ts",
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
    { cwd, encoding: "utf8" },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile Stripe foundation.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const stripe = await import(pathToFileURL(join(outDir, "stripe", "foundation.js")));
  const stripeClient = await import(
    pathToFileURL(join(outDir, "stripe", "clientPayment.js"))
  );
  const stripeServer = await import(
    pathToFileURL(join(outDir, "stripe", "serverClient.js"))
  );
  const integrationCenter = await import(
    pathToFileURL(join(outDir, "crm", "integrationCenter.js"))
  );

  assertEqual(
    stripe.STRIPE_ALLOWED_COMPANY_NAME,
    "WeatherTech Roofing LLC",
    "WeatherTech Roofing remains the only allowed company",
  );
  assertEqual(
    stripe.getStripeCompanyEligibility({
      id: "weathertech",
      name: "WeatherTech Roofing LLC",
      trade: "roofing",
    }).eligible,
    true,
    "WeatherTech Roofing is eligible",
  );
  assertEqual(
    stripe.getStripeCompanyEligibility({
      id: "ihc",
      name: "IHC Painting",
      trade: "painting",
    }).eligible,
    false,
    "IHC Painting is explicitly ineligible",
  );
  assertEqual(
    stripe.getStripeCompanyEligibility({
      id: "lookalike",
      name: "WeatherTech Roofing LLC",
      trade: "painting",
    }).eligible,
    false,
    "Company name alone cannot bypass the roofing-company check",
  );

  const missingConfig = stripe.getStripeConfigCheckResult({}, new Date(0));
  assertEqual(missingConfig.status, "missing_config", "Missing Stripe config is detected");
  assertEqual(
    missingConfig.credentials.livePaymentsEnabled,
    false,
    "Live payments default off",
  );
  assertEqual(
    missingConfig.credentials.refundsEnabled,
    false,
    "Refunds default off",
  );
  assertEqual(
    missingConfig.credentials.webhookProcessingEnabled,
    false,
    "Webhook processing defaults off",
  );

  const readyButDisabled = stripe.getStripeConfigCheckResult({
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example123",
    STRIPE_SECRET_KEY: "sk_live_example123",
    STRIPE_WEBHOOK_SECRET: "whsec_example123",
    STRIPE_WEATHERTECH_ACCOUNT_ID: "acct_example123",
    STRIPE_PUBLIC_BASE_URL: "https://example.test",
    STRIPE_LIVE_PAYMENTS_ENABLED: "false",
    STRIPE_REFUNDS_ENABLED: "false",
    STRIPE_WEBHOOK_PROCESSING_ENABLED: "false",
  });
  assertEqual(readyButDisabled.ok, true, "Configuration contract can be complete while writes stay off");
  assertEqual(
    readyButDisabled.credentials.publishableKeyDetected,
    true,
    "Stripe.js publishable-key configuration is detected",
  );
  assertEqual(
    readyButDisabled.credentials.livePaymentsEnabled,
    false,
    "Exact false keeps payment writes off",
  );
  assert(
    stripe.getStripeConfigCheckResult({
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example123",
      STRIPE_SECRET_KEY: "sk_live_example123",
      STRIPE_WEBHOOK_SECRET: "whsec_example123",
      STRIPE_WEATHERTECH_ACCOUNT_ID: "acct_example123",
      STRIPE_PUBLIC_BASE_URL: "https://example.test",
    }).malformed.includes("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"),
    "Live and test browser/server key modes cannot be mixed",
  );

  assertEqual(
    stripeClient.parseStripePaymentAmount("0.50", 100).amountCents,
    50,
    "Minimum Stripe payment parses into exact integer cents",
  );
  assertEqual(
    stripeClient.parseStripePaymentAmount("10", 100).amountCents,
    1000,
    "Whole-dollar Stripe payment parses into exact integer cents",
  );
  for (const [amount, balance] of [
    ["0.49", 100],
    ["101.00", 100],
    ["-1.00", 100],
    ["not-money", 100],
    ["1.001", 100],
  ]) {
    assertEqual(
      stripeClient.parseStripePaymentAmount(amount, balance).ok,
      false,
      `Unsafe payment amount ${amount} is rejected`,
    );
  }
  assertEqual(
    stripeClient.isStripeClientCompanyEligible({
      id: "weathertech",
      name: "WeatherTech Roofing LLC",
      trade: "roofing",
    }),
    true,
    "Browser payment eligibility permits exact WeatherTech roofing identity",
  );
  assertEqual(
    stripeClient.isStripeClientCompanyEligible({
      id: "ihc",
      name: "IHC Painting",
      trade: "painting",
    }),
    false,
    "Browser payment eligibility denies IHC",
  );
  assertEqual(
    stripeClient.isStripeClientCompanyEligible({
      id: "lookalike",
      name: "WeatherTech Roofing LLC",
      trade: "painting",
    }),
    false,
    "Browser payment eligibility denies a company-name lookalike",
  );

  const browserRequest = stripeClient.buildStripePaymentIntentRequest({
    companyId: "weathertech",
    invoiceId: "invoice-1",
    amountCents: 50,
    attemptKey: "stable-browser-attempt",
  });
  assertEqual(
    Object.keys(browserRequest).sort().join(","),
    [
      "amountCents",
      "attemptKey",
      "companyId",
      "invoiceId",
      "kind",
      "ownerApproval",
    ].sort().join(","),
    "Browser request contains only the approved non-PII fields",
  );
  assertEqual(browserRequest.ownerApproval, true, "Browser request records explicit owner approval");
  assert(
    !JSON.stringify(browserRequest).match(/email|phone|customer|secret|key_live/i),
    "Browser payment request contains no customer PII or credentials",
  );

  let capturedRequest = null;
  const recoveredIntent = await stripeClient.requestStripePaymentIntent(
    browserRequest,
    async (url, init) => {
      capturedRequest = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          duplicatePrevented: true,
          paymentIntentId: "pi_existing",
          clientSecret: "pi_existing_secret_recoverable",
          status: "requires_payment_method",
        }),
      };
    },
  );
  assertEqual(
    capturedRequest.url,
    "/api/integrations/stripe/payment-intents",
    "Browser caller uses the existing PaymentIntent route",
  );
  assertEqual(capturedRequest.init.method, "POST", "Browser caller uses POST");
  assertEqual(
    capturedRequest.init.credentials,
    "same-origin",
    "Browser caller preserves signed-in same-origin authentication",
  );
  assertEqual(capturedRequest.init.cache, "no-store", "Browser caller disables response caching");
  assertEqual(
    recoveredIntent.clientSecret,
    "pi_existing_secret_recoverable",
    "Idempotent browser retry recovers the existing client secret",
  );
  await assertRejects(
    stripeClient.requestStripePaymentIntent(browserRequest, async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        paymentIntentId: "pi_missing_secret",
        status: "requires_payment_method",
      }),
    })),
    "secure confirmation token",
    "A non-terminal response without a client secret is rejected",
  );
  await assertRejects(
    stripeClient.requestStripePaymentIntent(browserRequest, async () => ({
      ok: false,
      status: 409,
      json: async () => ({ ok: false, message: "Live Stripe payment writes remain disabled." }),
    })),
    "remain disabled",
    "Provider and safety-gate failures surface as sanitized errors",
  );

  const operation = {
    operation: "deposit",
    companyId: "weathertech",
    invoiceId: "invoice-1",
    amountCents: 12500,
    attemptKey: "owner-approved-attempt-1",
  };
  const firstOperationKey = stripe.createStripeOperationKey(operation);
  assertEqual(
    firstOperationKey,
    stripe.createStripeOperationKey(operation),
    "Operation keys are deterministic for safe retries",
  );
  assert(
    firstOperationKey !==
      stripe.createStripeOperationKey({ ...operation, companyId: "ihc" }),
    "Company ID participates in duplicate prevention",
  );
  const metadata = stripe.buildStripeObjectMetadata({
    companyId: "weathertech",
    customerId: "customer-1",
    invoiceId: "invoice-1",
    operationKey: firstOperationKey,
  });
  assertEqual(metadata.wtos_source_of_truth, "supabase", "Supabase remains source of truth");
  assert(
    !JSON.stringify(metadata).includes("email") &&
      !JSON.stringify(metadata).includes("phone"),
    "Stripe metadata does not include customer PII fields",
  );
  assert(
    !stripe.sanitizeStripeErrorMessage(
      "sk_live_secret whsec_secret client_secret=unsafe",
    ).includes("sk_live_secret"),
    "Stripe errors redact credentials",
  );
  const originalStripeSecretKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_live_example123";
  const accountProbe = await stripeServer.probeStripeAccount(
    {
      accounts: {
        retrieveCurrent: async () => ({
          id: "acct_example123",
          business_profile: { name: "Weather-Tech Roofing LLC" },
          settings: { dashboard: { display_name: "Weather-Tech Roofing LLC" } },
          charges_enabled: true,
          payouts_enabled: true,
          country: "US",
          default_currency: "usd",
          capabilities: {
            card_payments: "active",
            us_bank_account_ach_payments: "active",
          },
        }),
      },
    },
    "acct_example123",
  );
  if (originalStripeSecretKey === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = originalStripeSecretKey;
  }
  assertEqual(accountProbe.ok, true, "Verified live WeatherTech account spelling is accepted");
  assertEqual(accountProbe.livemode, true, "Account probe requires a live secret-key mode");

  const stripeProvider = integrationCenter.integrationProviderRegistry.find(
    (provider) => provider.id === "stripe",
  );
  assert(stripeProvider, "Integration Center registers Stripe");
  assertEqual(
    stripeProvider.connectionProviders.length,
    1,
    "Stripe has one provider mapping",
  );
  assertEqual(
    stripeProvider.connectionProviders[0],
    "stripe",
    "Stripe provider mapping is stable",
  );
  assert(
    stripeProvider.summaryWhenDisconnected.includes("disabled"),
    "Integration Center does not imply live payments are enabled",
  );

  const migration = fs.readFileSync(migrationPath, "utf8");
  assert(migration.trim().startsWith("begin;"), "Stripe migration is transactional");
  assert(migration.trim().endsWith("commit;"), "Stripe migration commits explicitly");
  for (const requiredTable of [
    "stripe_company_accounts",
    "stripe_object_mappings",
    "stripe_webhook_events",
  ]) {
    assert(migration.includes(requiredTable), `Migration includes ${requiredTable}`);
    assert(
      migration.includes(`alter table public.${requiredTable} enable row level security`),
      `${requiredTable} enables RLS`,
    );
  }
  assert(
    migration.includes("integration_connections_enforce_stripe_company"),
    "Stripe connections enforce the authorized company",
  );
  assert(
    migration.includes("companies_preserve_stripe_identity"),
    "Mapped company identity cannot be changed into an unauthorized company",
  );
  assert(
    migration.includes("payments_enforce_company_scope"),
    "Payments enforce linked-record company scope",
  );
  assert(
    migration.includes("wtos_record_stripe_payment"),
    "Webhook payment recording is transactionally encapsulated",
  );
  assert(
    migration.includes("unique (company_id, operation_key)"),
    "Stripe operations have a durable idempotency constraint",
  );
  assert(
    migration.includes("stripe_event_id text not null unique"),
    "Stripe webhook event IDs are deduplicated",
  );
  assert(
    migration.includes("WeatherTech Roofing LLC") &&
      !migration.includes("'IHC Painting'"),
    "The database allow-rule names WeatherTech only and does not authorize IHC",
  );
  assert(
    !/using\s*\(\s*true\s*\)/i.test(migration) &&
      !/with\s+check\s*\(\s*true\s*\)/i.test(migration),
    "Stripe migration adds no broad RLS policy",
  );
  assert(
    !/sk_(live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/.test(migration),
    "Stripe migration contains no credentials",
  );

  const paymentIntentRoute = fs.readFileSync(
    path.join(cwd, "app/api/integrations/stripe/payment-intents/route.ts"),
    "utf8",
  );
  const refundRoute = fs.readFileSync(
    path.join(cwd, "app/api/integrations/stripe/refunds/route.ts"),
    "utf8",
  );
  const webhookRoute = fs.readFileSync(
    path.join(cwd, "app/api/integrations/stripe/webhook/route.ts"),
    "utf8",
  );
  assert(
    paymentIntentRoute.includes("body.ownerApproval !== true") &&
      paymentIntentRoute.includes("config.livePaymentsEnabled"),
    "PaymentIntent route requires owner approval and the live-write gate",
  );
  assert(
    paymentIntentRoute.includes("stripe.paymentIntents.retrieve") &&
      paymentIntentRoute.includes("clientSecret: existingIntent.client_secret") &&
      paymentIntentRoute.includes('"Cache-Control": "private, no-store"'),
    "Idempotent PaymentIntent retries securely recover a non-cacheable client secret",
  );
  assert(
    paymentIntentRoute.indexOf("body.ownerApproval !== true") <
      paymentIntentRoute.indexOf("stripe.paymentIntents.retrieve") &&
      paymentIntentRoute.indexOf("config.livePaymentsEnabled") <
        paymentIntentRoute.indexOf("stripe.paymentIntents.retrieve") &&
      paymentIntentRoute.indexOf("Payment amount exceeds the invoice balance") <
        paymentIntentRoute.indexOf("stripe.paymentIntents.retrieve"),
    "Existing PaymentIntent retrieval happens only after approval, gate, and invoice checks",
  );

  const paymentElementComponent = fs.readFileSync(
    path.join(cwd, "components/StripeInvoicePayment.tsx"),
    "utf8",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(cwd, "package.json"), "utf8"),
  );
  assert(
    packageJson.dependencies["@stripe/react-stripe-js"] &&
      packageJson.dependencies["@stripe/stripe-js"],
    "Stripe.js and React Stripe.js are production dependencies",
  );
  for (const requiredClientPrimitive of [
    "loadStripe",
    "Elements",
    "PaymentElement",
    "useStripe",
    "useElements",
    "stripe.confirmPayment",
    'redirect: "if_required"',
  ]) {
    assert(
      paymentElementComponent.includes(requiredClientPrimitive),
      `Payment Element uses ${requiredClientPrimitive}`,
    );
  }
  assert(
    !paymentElementComponent.includes("STRIPE_SECRET_KEY") &&
      !paymentElementComponent.includes("STRIPE_WEBHOOK_SECRET") &&
      !paymentElementComponent.includes("console.") &&
      !paymentElementComponent.includes("localStorage") &&
      !paymentElementComponent.includes("sessionStorage"),
    "Payment Element never references server secrets or persists/logs browser payment state",
  );
  assert(
    paymentElementComponent.includes('"stripe-payment-ihc-disabled"') &&
      paymentElementComponent.includes('data-testid="stripe-payment-owner-required"'),
    "Payment Element renders explicit IHC and non-owner denial states",
  );
  assert(
    refundRoute.includes("body.ownerApproval !== true") &&
      refundRoute.includes("config.refundsEnabled"),
    "Refund route requires owner approval and the refund gate",
  );
  assert(
    webhookRoute.includes("request.text()") &&
      webhookRoute.includes("stripe.webhooks.constructEvent"),
    "Webhook verifies the unmodified raw request body",
  );
  assert(
    webhookRoute.includes("stripe_event_id") &&
      webhookRoute.includes("duplicatePrevented"),
    "Webhook route deduplicates provider events",
  );

  console.log("Stripe company-isolation foundation tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
