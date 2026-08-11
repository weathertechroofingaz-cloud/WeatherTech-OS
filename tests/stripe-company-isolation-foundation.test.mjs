import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

function assertThrows(callback, expectedMessage, message) {
  try {
    callback();
  } catch (error) {
    assert(
      error instanceof Error && error.message.includes(expectedMessage),
      `${message}. Received ${error instanceof Error ? error.message : String(error)}.`,
    );
    return;
  }

  throw new Error(`${message}. Expected the callback to throw.`);
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
      "lib/stripe/paymentIntentRecovery.ts",
      "lib/stripe/serverClient.ts",
      "lib/crm/integrationCenter.ts",
      "components/StripeInvoiceRefund.tsx",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--jsx",
      "react-jsx",
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

  const stripe = await import(pathToFileURL(join(outDir, "lib", "stripe", "foundation.js")));
  const stripeClient = await import(
    pathToFileURL(join(outDir, "lib", "stripe", "clientPayment.js"))
  );
  const stripeServer = await import(
    pathToFileURL(join(outDir, "lib", "stripe", "serverClient.js"))
  );
  const paymentIntentRecovery = await import(
    pathToFileURL(join(outDir, "lib", "stripe", "paymentIntentRecovery.js"))
  );
  const integrationCenter = await import(
    pathToFileURL(join(outDir, "lib", "crm", "integrationCenter.js"))
  );
  const stripeRefundComponentModule = await import(
    pathToFileURL(join(outDir, "components", "StripeInvoiceRefund.js"))
  );
  const StripeInvoiceRefund = stripeRefundComponentModule.default.default ??
    stripeRefundComponentModule.default;

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

  const recoveryMapping = {
    id: "mapping-1",
    company_id: "weathertech",
    stripe_company_account_id: "account-mapping-1",
    integration_connection_id: "connection-1",
    customer_id: null,
    invoice_id: "invoice-1",
    payment_id: null,
    local_object_type: "invoice",
    stripe_object_type: "payment_intent",
    stripe_object_id: "pi_existing",
    operation_key: "wtos_existing_operation",
    status: "requires_payment_method",
    amount_cents: 50,
    currency: "usd",
    livemode: true,
    metadata_summary: {
      wtos_company_id: "weathertech",
      wtos_customer_id: "none",
      wtos_invoice_id: "invoice-1",
      wtos_operation_key: "wtos_existing_operation",
      wtos_source_of_truth: "supabase",
    },
    last_provider_request_id: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
  };
  const recoveryIntent = {
    id: "pi_existing",
    amount: 50,
    currency: "usd",
    livemode: true,
    status: "requires_payment_method",
    client_secret: "pi_existing_secret_recoverable",
    metadata: {
      wtos_company_id: "weathertech",
      wtos_customer_id: "none",
      wtos_invoice_id: "invoice-1",
      wtos_operation_key: "wtos_existing_operation",
      wtos_source_of_truth: "supabase",
    },
  };
  const recoveryContext = {
    companyId: "weathertech",
    connectionId: "connection-1",
    accountMappingId: "account-mapping-1",
    invoiceId: "invoice-1",
    customerId: null,
    localObjectType: "invoice",
    amountCents: 50,
    currency: "usd",
    livemode: true,
  };
  const stableGenerationKey =
    paymentIntentRecovery.createStripePaymentIntentGenerationKey({
      priorPaymentIntentMappingId: null,
    });
  assertEqual(
    stableGenerationKey,
    paymentIntentRecovery.createStripePaymentIntentGenerationKey({
      priorPaymentIntentMappingId: null,
    }),
    "The authoritative invoice state produces one stable cross-session idempotency generation",
  );
  assert(
    stableGenerationKey !==
      paymentIntentRecovery.createStripePaymentIntentGenerationKey({
        priorPaymentIntentMappingId: "7084f25f-b0f6-4f8e-90c5-1dfbe0f1d8de",
      }),
    "A completed mapped payment creates a new generation even after a full refund restores the invoice totals",
  );
  assertThrows(
    () =>
      paymentIntentRecovery.createStripePaymentIntentGenerationKey({
        priorPaymentIntentMappingId: "not-a-database-mapping-id",
      }),
    "cannot safely identify",
    "A malformed prior mapping identity fails closed before a provider write",
  );
  assertEqual(
    paymentIntentRecovery.paymentIntentMatchesMapping({
      ...recoveryContext,
      mapping: recoveryMapping,
      intent: recoveryIntent,
    }),
    true,
    "An active PaymentIntent can be recovered only when every saved and provider identity matches",
  );
  const recoveryMismatches = [
    { mapping: { ...recoveryMapping, company_id: "ihc" }, intent: recoveryIntent },
    {
      mapping: { ...recoveryMapping, integration_connection_id: "other-connection" },
      intent: recoveryIntent,
    },
    {
      mapping: { ...recoveryMapping, stripe_company_account_id: "other-account" },
      intent: recoveryIntent,
    },
    { mapping: { ...recoveryMapping, invoice_id: "other-invoice" }, intent: recoveryIntent },
    { mapping: { ...recoveryMapping, customer_id: "other-customer" }, intent: recoveryIntent },
    { mapping: { ...recoveryMapping, local_object_type: "deposit" }, intent: recoveryIntent },
    { mapping: { ...recoveryMapping, stripe_object_type: "charge" }, intent: recoveryIntent },
    { mapping: { ...recoveryMapping, amount_cents: 51 }, intent: recoveryIntent },
    { mapping: { ...recoveryMapping, currency: "cad" }, intent: recoveryIntent },
    { mapping: { ...recoveryMapping, livemode: false }, intent: recoveryIntent },
    {
      mapping: {
        ...recoveryMapping,
        metadata_summary: {
          ...recoveryMapping.metadata_summary,
          wtos_source_of_truth: "provider",
        },
      },
      intent: recoveryIntent,
    },
    { mapping: recoveryMapping, intent: { ...recoveryIntent, id: "pi_other" } },
    { mapping: recoveryMapping, intent: { ...recoveryIntent, amount: 51 } },
    { mapping: recoveryMapping, intent: { ...recoveryIntent, currency: "cad" } },
    { mapping: recoveryMapping, intent: { ...recoveryIntent, livemode: false } },
    {
      mapping: recoveryMapping,
      intent: {
        ...recoveryIntent,
        metadata: { ...recoveryIntent.metadata, wtos_company_id: "ihc" },
      },
    },
    {
      mapping: recoveryMapping,
      intent: {
        ...recoveryIntent,
        metadata: { ...recoveryIntent.metadata, wtos_customer_id: "other-customer" },
      },
    },
    {
      mapping: recoveryMapping,
      intent: {
        ...recoveryIntent,
        metadata: { ...recoveryIntent.metadata, wtos_invoice_id: "other-invoice" },
      },
    },
    {
      mapping: recoveryMapping,
      intent: {
        ...recoveryIntent,
        metadata: { ...recoveryIntent.metadata, wtos_operation_key: "wtos_other" },
      },
    },
    {
      mapping: recoveryMapping,
      intent: {
        ...recoveryIntent,
        metadata: { ...recoveryIntent.metadata, wtos_source_of_truth: "provider" },
      },
    },
  ];
  for (const mismatch of recoveryMismatches) {
    assertEqual(
      paymentIntentRecovery.paymentIntentMatchesMapping({
        ...recoveryContext,
        ...mismatch,
      }),
      false,
      "PaymentIntent recovery fails closed on every company, account, invoice, amount, mode, and metadata mismatch",
    );
  }
  for (const recoverableStatus of [
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
    "succeeded",
  ]) {
    assertEqual(
      paymentIntentRecovery.isRecoverablePaymentIntentProviderStatus(recoverableStatus),
      true,
      `Provider status ${recoverableStatus} prevents creation of a second PaymentIntent`,
    );
  }
  for (const unsafeRecoveryStatus of ["canceled", "requires_capture"]) {
    assertEqual(
      paymentIntentRecovery.isRecoverablePaymentIntentProviderStatus(unsafeRecoveryStatus),
      false,
      `Provider status ${unsafeRecoveryStatus} requires review instead of another write`,
    );
  }
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

  const readinessDiagnostic = stripeClient.parseStripeReadinessDiagnostic({
    status: "malformed_config",
    missing: [
      "STRIPE_WEBHOOK_SECRET",
      "UNRECOGNIZED_ENV",
      "STRIPE_SECRET_KEY=sk_live_syntheticneverrender",
      "whsec_syntheticneverrender",
    ],
    malformed: [
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_syntheticneverrender",
    ],
    credentials: { secretKey: "sk_live_syntheticneverrender" },
  });
  assertEqual(
    readinessDiagnostic.status,
    "malformed_config",
    "Browser diagnostic exposes the readiness configuration status",
  );
  assertEqual(
    readinessDiagnostic.missing.join(","),
    "STRIPE_WEBHOOK_SECRET",
    "Browser diagnostic allows only known missing environment-variable names",
  );
  assertEqual(
    readinessDiagnostic.malformed.join(","),
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "Browser diagnostic allows only known malformed environment-variable names",
  );
  assert(
    !/sk_live_|whsec_|pk_live_|syntheticneverrender/.test(
      JSON.stringify(readinessDiagnostic),
    ),
    "Browser diagnostic discards values, prefixes, arbitrary fields, and unrecognized strings",
  );
  assertEqual(
    stripeClient.parseStripeReadinessDiagnostic({ status: "unexpected" }),
    null,
    "Browser diagnostic rejects an unrecognized configuration status",
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

  assertEqual(
    stripeClient.getStripeRefundAmountCents(0.5),
    50,
    "The controlled minimum full refund converts to exact integer cents",
  );
  for (const unsafeRefundAmount of [0.49, -1, Number.NaN, 1.001]) {
    assertEqual(
      stripeClient.getStripeRefundAmountCents(unsafeRefundAmount),
      null,
      `Unsafe refund amount ${String(unsafeRefundAmount)} is rejected`,
    );
  }
  const refundablePayment = {
    company: {
      id: "weathertech",
      name: "WeatherTech Roofing LLC",
      trade: "roofing",
    },
    paymentCompanyId: "weathertech",
    paymentMethod: "stripe",
    paymentStatus: "posted",
    isCompanyOwner: true,
    isDemoMode: false,
  };
  assertEqual(
    stripeClient.isStripeClientRefundEligible(refundablePayment),
    true,
    "A posted WeatherTech Stripe payment is owner-refundable",
  );
  for (const ineligibleRefund of [
    {
      ...refundablePayment,
      company: { id: "ihc", name: "IHC Painting", trade: "painting" },
      paymentCompanyId: "ihc",
    },
    {
      ...refundablePayment,
      company: {
        id: "lookalike",
        name: "WeatherTech Roofing LLC",
        trade: "painting",
      },
      paymentCompanyId: "lookalike",
    },
    { ...refundablePayment, paymentCompanyId: "another-company" },
    { ...refundablePayment, paymentMethod: "Check" },
    { ...refundablePayment, paymentStatus: "pending" },
    { ...refundablePayment, paymentStatus: "refunded" },
    { ...refundablePayment, isCompanyOwner: false },
    { ...refundablePayment, isDemoMode: true },
  ]) {
    assertEqual(
      stripeClient.isStripeClientRefundEligible(ineligibleRefund),
      false,
      "Refund eligibility rejects non-WeatherTech, cross-company, offline, non-posted, non-owner, and demo inputs",
    );
  }
  assertEqual(
    stripeClient.isStripeRefundSubmissionAllowed({
      readinessStatus: "ready",
      ownerApproved: true,
      isSubmitting: false,
      submitted: false,
    }),
    true,
    "Refund submission unlocks only after readiness and explicit owner approval",
  );
  for (const lockedRefundSubmission of [
    {
      readinessStatus: "checking",
      ownerApproved: true,
      isSubmitting: false,
      submitted: false,
    },
    {
      readinessStatus: "disabled",
      ownerApproved: true,
      isSubmitting: false,
      submitted: false,
    },
    {
      readinessStatus: "ready",
      ownerApproved: false,
      isSubmitting: false,
      submitted: false,
    },
    {
      readinessStatus: "ready",
      ownerApproved: true,
      isSubmitting: true,
      submitted: false,
    },
    {
      readinessStatus: "ready",
      ownerApproved: true,
      isSubmitting: false,
      submitted: true,
    },
  ]) {
    assertEqual(
      stripeClient.isStripeRefundSubmissionAllowed(lockedRefundSubmission),
      false,
      "Refund submission stays locked while readiness, approval, or idempotency safeguards are incomplete",
    );
  }
  assertEqual(
    stripeClient.isStripeRefundReadinessEnabled({
      responseOk: true,
      ok: true,
      livePaymentsEnabled: true,
      refundsEnabled: true,
      webhookProcessingEnabled: true,
    }),
    true,
    "Refund readiness requires the healthy response and all three live gates",
  );
  assertEqual(
    stripeClient.isStripeRefundReadinessEnabled({
      responseOk: true,
      ok: false,
      livePaymentsEnabled: true,
      refundsEnabled: true,
      webhookProcessingEnabled: true,
    }),
    false,
    "A failed overall readiness result keeps refunds locked even if all gate booleans are true",
  );
  assertEqual(
    stripeClient.isStripePaymentReadinessEnabled({
      responseOk: true,
      ok: true,
      livePaymentsEnabled: true,
    }),
    true,
    "Payment readiness requires a healthy response and the live-payment gate",
  );
  assertEqual(
    stripeClient.isStripePaymentReadinessEnabled({
      responseOk: true,
      ok: false,
      livePaymentsEnabled: true,
    }),
    false,
    "A failed overall readiness result keeps payments locked even when the live-payment gate is true",
  );

  const refundRenderBase = {
    company: refundablePayment.company,
    paymentId: "payment-1",
    paymentCompanyId: "weathertech",
    paymentAmount: 0.5,
    paymentMethod: "stripe",
    paymentStatus: "posted",
    isCompanyOwner: true,
    isDemoMode: false,
    onReload: async () => {},
    onNotice: () => {},
  };
  const eligibleRefundMarkup = renderToStaticMarkup(
    React.createElement(StripeInvoiceRefund, refundRenderBase),
  );
  assert(
    eligibleRefundMarkup.includes('data-testid="stripe-refund-action"') &&
      eligibleRefundMarkup.includes('data-testid="stripe-refund-submit"') &&
      eligibleRefundMarkup.includes("disabled"),
    "An eligible WeatherTech refund renders but starts locked pending readiness and approval",
  );
  const ihcRefundMarkup = renderToStaticMarkup(
    React.createElement(StripeInvoiceRefund, {
      ...refundRenderBase,
      company: { id: "ihc", name: "IHC Painting", trade: "painting" },
      paymentCompanyId: "ihc",
    }),
  );
  assert(
    ihcRefundMarkup.includes('data-testid="stripe-refund-ihc-disabled"') &&
      !ihcRefundMarkup.includes('data-testid="stripe-refund-submit"'),
    "IHC receives only the disabled isolation state",
  );
  const nonOwnerRefundMarkup = renderToStaticMarkup(
    React.createElement(StripeInvoiceRefund, {
      ...refundRenderBase,
      isCompanyOwner: false,
    }),
  );
  assert(
    nonOwnerRefundMarkup.includes('data-testid="stripe-refund-owner-required"') &&
      !nonOwnerRefundMarkup.includes('data-testid="stripe-refund-submit"'),
    "A non-owner receives no active refund control",
  );
  const offlineRefundMarkup = renderToStaticMarkup(
    React.createElement(StripeInvoiceRefund, {
      ...refundRenderBase,
      paymentMethod: "Check",
    }),
  );
  assertEqual(offlineRefundMarkup, "", "Offline payments render no Stripe refund UI");
  const refundedPaymentMarkup = renderToStaticMarkup(
    React.createElement(StripeInvoiceRefund, {
      ...refundRenderBase,
      paymentStatus: "refunded",
    }),
  );
  assert(
    refundedPaymentMarkup.includes('data-testid="stripe-refund-completed"') &&
      !refundedPaymentMarkup.includes('data-testid="stripe-refund-submit"'),
    "A reconciled refund renders only its completed state",
  );

  const refundRequest = stripeClient.buildStripeRefundRequest({
    companyId: "weathertech",
    paymentId: "payment-1",
    amountCents: 50,
    attemptKey: "stable-refund-attempt",
  });
  assertEqual(
    Object.keys(refundRequest).sort().join(","),
    [
      "amountCents",
      "attemptKey",
      "companyId",
      "ownerApproval",
      "paymentId",
      "reason",
    ].sort().join(","),
    "Refund request contains only the approved non-PII fields",
  );
  assertEqual(refundRequest.ownerApproval, true, "Refund request records explicit owner approval");
  assertEqual(
    refundRequest.reason,
    "requested_by_customer",
    "Refund caller uses the approved fixed Stripe reason",
  );
  assert(
    !JSON.stringify(refundRequest).match(/email|phone|customerId|invoiceId|secret|key_live/i),
    "Refund request contains no customer PII, invoice data, or credentials",
  );

  let capturedRefundRequest = null;
  const recoveredRefund = await stripeClient.requestStripeRefund(
    refundRequest,
    async (url, init) => {
      capturedRefundRequest = { url, init };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          duplicatePrevented: true,
          refundId: "re_existing",
          status: "succeeded",
        }),
      };
    },
  );
  assertEqual(
    capturedRefundRequest.url,
    "/api/integrations/stripe/refunds",
    "Refund caller uses the existing protected route",
  );
  assertEqual(capturedRefundRequest.init.method, "POST", "Refund caller uses POST");
  assertEqual(
    capturedRefundRequest.init.headers["Content-Type"],
    "application/json",
    "Refund caller sends only JSON",
  );
  assertEqual(
    capturedRefundRequest.init.credentials,
    "same-origin",
    "Refund caller preserves the signed-in owner session",
  );
  assertEqual(
    capturedRefundRequest.init.cache,
    "no-store",
    "Refund caller disables response caching",
  );
  assertEqual(
    JSON.parse(capturedRefundRequest.init.body).attemptKey,
    "stable-refund-attempt",
    "Refund caller preserves the stable idempotency attempt key",
  );
  assertEqual(
    capturedRefundRequest.init.body,
    JSON.stringify(refundRequest),
    "Refund caller sends exactly the approved request body",
  );
  assertEqual(
    recoveredRefund.duplicatePrevented,
    true,
    "An idempotent refund retry recovers the existing provider result",
  );
  await assertRejects(
    stripeClient.requestStripeRefund(refundRequest, async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("invalid json");
      },
    })),
    "invalid Stripe refund response",
    "An invalid JSON refund response is rejected without provider data",
  );
  await assertRejects(
    stripeClient.requestStripeRefund(refundRequest, async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, status: "succeeded" }),
    })),
    "valid refund result",
    "A malformed successful refund response is rejected",
  );
  await assertRejects(
    stripeClient.requestStripeRefund(refundRequest, async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        message: "Live Stripe refunds remain disabled. sk_live_syntheticneverrender",
      }),
    })),
    "[redacted]",
    "Refund safety-gate and provider failures surface only after sanitization",
  );
  await assertRejects(
    stripeClient.requestStripeRefund(refundRequest, async () => ({
      ok: false,
      status: 503,
      json: async () => ({ ok: false }),
    })),
    "could not issue the approved Stripe refund",
    "A missing provider message uses the refund-specific sanitized fallback",
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
  const paymentIntentRecoverySource = fs.readFileSync(
    path.join(cwd, "lib/stripe/paymentIntentRecovery.ts"),
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
      paymentIntentRoute.includes("const clientSecret = confirmationComplete ? null") &&
      paymentIntentRoute.includes("clientSecret,") &&
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
  const activeRecoveryIndex = paymentIntentRoute.indexOf(
    "data: recoverableMappings",
  );
  const latestPriorMappingIndex = paymentIntentRoute.indexOf(
    "data: latestPriorMapping",
  );
  const providerCreateIndex = paymentIntentRoute.indexOf(
    "stripe.paymentIntents.create",
  );
  assert(
    latestPriorMappingIndex >
      paymentIntentRoute.indexOf("Payment amount exceeds the invoice balance") &&
      latestPriorMappingIndex < activeRecoveryIndex &&
      activeRecoveryIndex >
      paymentIntentRoute.indexOf("Payment amount exceeds the invoice balance") &&
      activeRecoveryIndex < providerCreateIndex,
    "The stable prior generation is captured before unresolved recovery, after every invoice check, and before any provider write",
  );
  assert(
    paymentIntentRoute.includes("recoverableMappingsError") &&
      paymentIntentRoute.includes("latestPriorMappingError") &&
      paymentIntentRoute.includes('.is("payment_id", null)') &&
      !paymentIntentRoute.includes('.eq("amount_cents"') &&
      !paymentIntentRoute.includes('.in("status"') &&
      paymentIntentRoute.includes('.limit(2)') &&
      paymentIntentRoute.includes("recoveryCandidates.length > 1") &&
      paymentIntentRoute.includes("isRecoverablePaymentIntentProviderStatus") &&
      paymentIntentRoute.includes("paymentIntentMatchesMapping") &&
      paymentIntentRoute.includes("return existingPaymentIntentResponse(recoverableIntent)"),
    "PaymentIntent recovery fails closed on lookup errors, multiple active candidates, identity mismatches, and unsafe provider states",
  );
  assert(
    paymentIntentRoute.includes("createStripePaymentIntentGenerationKey") &&
      paymentIntentRoute.includes("amountCents: 0") &&
      paymentIntentRoute.includes("attemptKey: paymentIntentGenerationKey") &&
      paymentIntentRoute.includes("priorPaymentIntentMappingId:") &&
      paymentIntentRoute.includes("racedMapping") &&
      paymentIntentRoute.includes("raceMatchesRequest"),
    "Concurrent browser amounts use one authoritative invoice-generation Stripe key and recover the winning mapping",
  );
  assert(
    paymentIntentRoute.indexOf("recoveryCandidates.length > 1") <
      providerCreateIndex &&
      paymentIntentRoute.indexOf("return existingPaymentIntentResponse(recoverableIntent)") <
        providerCreateIndex &&
      paymentIntentRoute.includes("duplicatePrevented: true") &&
      paymentIntentRoute.includes('"Cache-Control": "private, no-store"') &&
      paymentIntentRoute.includes("const clientSecret = confirmationComplete ? null") &&
      paymentIntentRoute.includes('intent.status === "succeeded"') &&
      paymentIntentRoute.includes('intent.status === "processing"'),
    "A recovered PaymentIntent returns the original private confirmation response and never creates a second object",
  );
  for (const requiredRecoveryIdentity of [
    "mapping.company_id === input.companyId",
    "mapping.integration_connection_id === input.connectionId",
    "mapping.stripe_company_account_id === input.accountMappingId",
    "mapping.customer_id === input.customerId",
    "mapping.invoice_id === input.invoiceId",
    "Number(mapping.amount_cents) === input.amountCents",
    "mapping.currency === input.currency",
    "mapping.livemode === input.livemode",
    "mappingMetadata.wtos_operation_key === mapping.operation_key",
    "intent.metadata.wtos_operation_key === mapping.operation_key",
    'intent.metadata.wtos_source_of_truth === "supabase"',
  ]) {
    assert(
      paymentIntentRecoverySource.includes(requiredRecoveryIdentity),
      `PaymentIntent recovery validates ${requiredRecoveryIdentity}`,
    );
  }

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
    paymentElementComponent.includes("parseStripeReadinessDiagnostic") &&
      paymentElementComponent.includes("isStripePaymentReadinessEnabled") &&
      paymentElementComponent.includes("ok: payload.ok") &&
      paymentElementComponent.includes('data-testid="stripe-readiness-config-status"') &&
      paymentElementComponent.includes('data-testid="stripe-readiness-config-missing"') &&
      paymentElementComponent.includes('data-testid="stripe-readiness-config-malformed"') &&
      !paymentElementComponent.includes("config.credentials"),
    "Payment diagnostics render only sanitized status and environment-variable names",
  );
  const refundComponent = fs.readFileSync(
    path.join(cwd, "components/StripeInvoiceRefund.tsx"),
    "utf8",
  );
  const crmApp = fs.readFileSync(
    path.join(cwd, "components/CrmApp.tsx"),
    "utf8",
  );
  for (const requiredRefundControl of [
    "isStripeClientRefundEligible",
    "isStripeRefundReadinessEnabled",
    "isStripeRefundSubmissionAllowed",
    "getStripeRefundAmountCents",
    "buildStripeRefundRequest",
    "requestStripeRefund",
    "livePaymentsEnabled: payload.livePaymentsEnabled",
    "refundsEnabled: payload.refundsEnabled",
    "webhookProcessingEnabled: payload.webhookProcessingEnabled",
    "window.crypto.randomUUID()",
    'data-testid="stripe-refund-owner-approval"',
    'data-testid="stripe-refund-submit"',
    "I approve one full",
    "original Stripe payment method",
    "await onReload()",
  ]) {
    assert(
      refundComponent.includes(requiredRefundControl),
      `Refund control includes ${requiredRefundControl}`,
    );
  }
  assert(
    refundComponent.includes('data-testid="stripe-refund-ihc-disabled"') &&
      refundComponent.includes('data-testid="stripe-refund-owner-required"') &&
      refundComponent.includes('paymentStatus === "refunded"'),
    "Refund control renders explicit IHC, non-owner, and completed-refund safety states",
  );
  assert(
    !refundComponent.includes("STRIPE_SECRET_KEY") &&
      !refundComponent.includes("STRIPE_WEBHOOK_SECRET") &&
      !refundComponent.includes("console.") &&
      !refundComponent.includes("localStorage") &&
      !refundComponent.includes("sessionStorage"),
    "Refund control never references server secrets or persists/logs refund state",
  );
  assert(
    crmApp.includes('payment.method === "stripe"') &&
      crmApp.includes("<StripeInvoiceRefund") &&
      crmApp.indexOf("<StripeInvoiceRefund") <
        crmApp.indexOf("{invoice.balance_due > 0 ? ("),
    "Refund control mounts only for Stripe payment rows and remains outside the invoice-balance branch",
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
