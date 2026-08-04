import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-quickbooks-foundation-"));
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
      "lib/crm/quickbooksOnlineFoundation.ts",
      "lib/crm/integrationCenter.ts",
      "lib/crm/communications.ts",
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
      `Could not compile QuickBooks Online foundation.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const quickbooks = await import(
    pathToFileURL(join(outDir, "quickbooksOnlineFoundation.js"))
  );
  const integrationCenter = await import(
    pathToFileURL(join(outDir, "integrationCenter.js"))
  );
  const communications = await import(pathToFileURL(join(outDir, "communications.js")));

  assertEqual(
    quickbooks.quickBooksOnlineProviderId,
    "quickbooks_online",
    "QuickBooks provider ID remains stable",
  );
  assertEqual(
    quickbooks.quickBooksOnlineScopes.includes("com.intuit.quickbooks.accounting"),
    true,
    "QuickBooks Accounting scope is declared",
  );
  assertEqual(
    quickbooks.quickBooksOnlineIdentityScopes.includes("openid"),
    true,
    "OpenID readiness is represented separately",
  );

  const capabilityStatuses = new Map(
    quickbooks.quickBooksOnlineOfficialCapabilities.map((capability) => [
      capability.key,
      capability.status,
    ]),
  );
  assertEqual(capabilityStatuses.get("oauth"), "oauth_required", "OAuth requires owner setup");
  assertEqual(
    capabilityStatuses.get("accounting_api"),
    "oauth_required",
    "Accounting API requires OAuth",
  );
  assertEqual(
    capabilityStatuses.get("estimates_invoices_payments"),
    "oauth_required",
    "Accounting transaction mappings require OAuth",
  );
  assertEqual(
    capabilityStatuses.get("cdc_retry"),
    "oauth_required",
    "CDC retry readiness requires OAuth",
  );
  assertEqual(
    capabilityStatuses.get("payments_processing"),
    "unsupported",
    "QuickBooks Payments is not activated by this foundation",
  );

  const emptyReadiness = quickbooks.buildQuickBooksOnlineReadiness([], {});
  assertEqual(emptyReadiness.status, "not_configured", "Missing env is not configured");
  assertEqual(emptyReadiness.liveSyncEnabled, false, "Live sync defaults off");
  assertEqual(emptyReadiness.accountingWritesEnabled, false, "Accounting writes default off");
  assertEqual(emptyReadiness.paymentProcessingEnabled, false, "Payment processing defaults off");

  const oauthOnlyReadiness = quickbooks.buildQuickBooksOnlineReadiness([], {
    QUICKBOOKS_CLIENT_ID: "client",
    QUICKBOOKS_CLIENT_SECRET: "secret",
    QUICKBOOKS_REDIRECT_URI:
      "https://weathertech-os.example.test/api/integrations/quickbooks-online/oauth/callback",
  });
  assertEqual(
    oauthOnlyReadiness.status,
    "oauth_required",
    "OAuth client without company realm ID requires company authorization",
  );

  const configuredEnv = {
    QUICKBOOKS_CLIENT_ID: "client",
    QUICKBOOKS_CLIENT_SECRET: "secret",
    QUICKBOOKS_REDIRECT_URI:
      "https://weathertech-os.example.test/api/integrations/quickbooks-online/oauth/callback",
    QUICKBOOKS_REALM_ID_WEATHERTECH: "weathertech-realm",
    QUICKBOOKS_REALM_ID_IHC: "ihc-realm",
  };
  const readyReadiness = quickbooks.buildQuickBooksOnlineReadiness([], configuredEnv);
  assertEqual(readyReadiness.status, "ready", "Configured OAuth and realms become ready");
  assertEqual(readyReadiness.configuredCompanyCount, 2, "Both companies are counted");

  const disabledConnectedReadiness = quickbooks.buildQuickBooksOnlineReadiness(
    [
      {
        id: "qbo-connection",
        provider: "quickbooks_online",
        status: "connected",
        last_sync_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    configuredEnv,
  );
  assertEqual(
    disabledConnectedReadiness.status,
    "production_disabled",
    "Connected record with disabled live sync stays production disabled",
  );

  const liveReadiness = quickbooks.buildQuickBooksOnlineReadiness(
    [
      {
        id: "qbo-connection",
        provider: "quickbooks_online",
        status: "connected",
        last_sync_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    {
      ...configuredEnv,
      QUICKBOOKS_SYNC_ENABLED: "true",
      QUICKBOOKS_ACCOUNTING_WRITES_ENABLED: "true",
      QUICKBOOKS_PAYMENT_PROCESSING_ENABLED: "true",
    },
  );
  assertEqual(liveReadiness.status, "connected", "Connected state requires live sync flag");
  assertEqual(
    liveReadiness.accountingWritesEnabled,
    true,
    "Accounting writes require live sync plus write gate",
  );
  assertEqual(
    liveReadiness.paymentProcessingEnabled,
    true,
    "Payment processing requires live sync plus payment gate",
  );

  const weatherTechCompany = {
    id: "company-weathertech",
    name: "WeatherTech Roofing LLC",
    short_name: "WeatherTech",
    trade: "roofing",
    workflow_profile: "roofing",
  };
  const ihcCompany = {
    id: "company-ihc",
    name: "IHC Painting",
    short_name: "IHC",
    trade: "painting",
    workflow_profile: "painting",
  };
  assertEqual(
    quickbooks.resolveQuickBooksOnlineCompanySlot(weatherTechCompany)?.key,
    "weathertech",
    "WeatherTech company maps to WeatherTech QuickBooks slot",
  );
  assertEqual(
    quickbooks.resolveQuickBooksOnlineCompanySlot(ihcCompany)?.key,
    "ihc",
    "IHC company maps to IHC QuickBooks slot",
  );

  const customer = {
    id: "customer-1",
    company_id: weatherTechCompany.id,
    display_name: "TEST QuickBooks Customer",
    contact_name: "QuickBooks Customer",
    email: "quickbooks@example.test",
    phone: "(602) 555-0199",
    property_address: "199 Test Accounting Way",
    city: "Phoenix",
    state: "AZ",
    postal_code: "85001",
  };
  const customerDraft = quickbooks.buildQuickBooksCustomerExportDraft({
    customer,
    company: weatherTechCompany,
  });
  const repeatedCustomerDraft = quickbooks.buildQuickBooksCustomerExportDraft({
    customer,
    company: weatherTechCompany,
  });
  assertEqual(customerDraft.provider, "quickbooks_online", "Customer draft uses QBO provider");
  assertEqual(customerDraft.entity, "customer", "Customer draft entity is customer");
  assertEqual(customerDraft.companyKey, "weathertech", "Customer draft company maps");
  assertEqual(customerDraft.production.enabled, false, "Customer export is disabled");
  assertEqual(
    customerDraft.duplicateKey,
    repeatedCustomerDraft.duplicateKey,
    "Customer duplicate key is deterministic",
  );
  assertEqual(
    customerDraft.requestFingerprint,
    repeatedCustomerDraft.requestFingerprint,
    "Customer request fingerprint is deterministic",
  );

  const estimate = {
    id: "estimate-100",
    company_id: weatherTechCompany.id,
    title: "TEST QuickBooks Roof Estimate",
    issue_date: "2026-08-04",
    expiration_date: "2026-09-04",
  };
  const estimateDraft = quickbooks.buildQuickBooksEstimateExportDraft({
    estimate,
    customer,
    company: weatherTechCompany,
    lineItems: [
      {
        id: "line-1",
        name: "Roof repair",
        description: "Leak repair and flashing",
        quantity: 2,
        unit_price: 450,
        total: 900,
      },
    ],
  });
  assertEqual(estimateDraft.entity, "estimate", "Estimate draft entity is estimate");
  assertEqual(estimateDraft.payload.DocNumber, "ESTIMATE-100", "Estimate DocNumber is stable");
  assert(
    estimateDraft.payload.DocNumber.length <= 21,
    "Estimate DocNumber stays within QuickBooks length guidance",
  );
  assertEqual(estimateDraft.production.enabled, false, "Estimate export is disabled");

  const longEstimateDraft = quickbooks.buildQuickBooksEstimateExportDraft({
    estimate: {
      ...estimate,
      id: "11111111-2222-3333-4444-555555555555",
    },
    customer,
    company: weatherTechCompany,
    lineItems: [],
  });
  assert(
    /^EST-[A-F0-9]{8}$/.test(longEstimateDraft.payload.DocNumber),
    "Long estimate IDs use deterministic QuickBooks-safe DocNumber references",
  );

  const invoice = {
    id: "invoice-100",
    company_id: weatherTechCompany.id,
    invoice_number: "INV-QBO-100",
    issue_date: "2026-08-04",
    due_date: "2026-08-14",
  };
  const invoiceDraft = quickbooks.buildQuickBooksInvoiceExportDraft({
    invoice,
    customer,
    company: weatherTechCompany,
    lineItems: [
      {
        id: "invoice-line-1",
        description: "Roof repair invoice",
        quantity: 1,
        unit_cost: 900,
        total: 900,
      },
    ],
  });
  assertEqual(invoiceDraft.entity, "invoice", "Invoice draft entity is invoice");
  assertEqual(invoiceDraft.payload.DocNumber, "INV-QBO-100", "Invoice DocNumber is stable");
  assert(
    invoiceDraft.payload.DocNumber.length <= 21,
    "Invoice DocNumber stays within QuickBooks length guidance",
  );
  assertEqual(invoiceDraft.production.enabled, false, "Invoice export is disabled");

  const paymentDraft = quickbooks.buildQuickBooksPaymentExportDraft({
    payment: {
      id: "payment-100",
      company_id: weatherTechCompany.id,
      amount: 400,
      reference: "ACH-QBO-100",
      paid_at: "2026-08-04T16:00:00.000Z",
    },
    invoice,
    customer,
    company: weatherTechCompany,
  });
  assertEqual(paymentDraft.entity, "payment", "Payment draft entity is payment");
  assertEqual(paymentDraft.payload.PaymentRefNum, "ACH-QBO-100", "Payment ref is stable");
  assert(
    paymentDraft.payload.PaymentRefNum.length <= 21,
    "Payment reference stays within QuickBooks length guidance",
  );
  assertEqual(paymentDraft.production.enabled, false, "Payment export is disabled");

  const logLabels = [
    quickbooks.getQuickBooksOnlineLogLabel({
      event_type: "estimate_export_prepared",
      status: "queued",
    }),
    quickbooks.getQuickBooksOnlineLogLabel({
      event_type: "invoice_export_prepared",
      status: "queued",
    }),
    quickbooks.getQuickBooksOnlineLogLabel({
      event_type: "payment_received_sync",
      status: "queued",
    }),
    quickbooks.getQuickBooksOnlineLogLabel({
      event_type: "sync",
      status: "succeeded",
    }),
    quickbooks.getQuickBooksOnlineLogLabel({
      event_type: "sync",
      status: "failed",
    }),
  ];
  assertEqual(logLabels.join("|"), "Estimate exported|Invoice exported|Payment received|Sync completed|Sync failed", "Customer 360 log labels remain actionable");

  const providerMetadata = integrationCenter.integrationProviderRegistry.find(
    (provider) => provider.id === "quickbooks_online",
  );
  assert(providerMetadata, "QuickBooks provider is registered in Integration Center");
  assertEqual(providerMetadata.family, "financial", "QuickBooks provider belongs to financial family");
  assertEqual(providerMetadata.supportsOAuth, true, "QuickBooks provider is OAuth-ready");
  assertEqual(providerMetadata.supportsWebhooks, true, "QuickBooks provider is webhook-ready");
  assert(
    providerMetadata.capabilities.includes("accounting") &&
      providerMetadata.capabilities.includes("payments") &&
      providerMetadata.capabilities.includes("webhooks"),
    "QuickBooks provider exposes accounting, payments, and webhook capabilities",
  );

  const snapshot = {
    integrationConnections: [],
    integrationSyncLogs: [
      {
        id: "qbo-log-1",
        provider: "quickbooks_online",
        status: "succeeded",
        event_type: "invoice_export_prepared",
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    smsMessages: [],
    emailMessages: [],
    calendarEventSyncs: [],
    scheduleEvents: [],
    leads: [],
    businessPhoneNumbers: [],
  };
  const providers = integrationCenter.buildIntegrationCenterProviders(snapshot);
  const quickBooksProvider = providers.find(
    (provider) => provider.metadata.id === "quickbooks_online",
  );
  assert(quickBooksProvider, "QuickBooks readiness renders in Integration Center provider list");
  assertEqual(
    quickBooksProvider.connectionState,
    "not_connected",
    "QuickBooks does not fake connected status",
  );
  assertEqual(
    quickBooksProvider.syncState.total,
    1,
    "QuickBooks audit logs are counted in provider readiness",
  );

  const readiness = communications.buildCommunicationProviderReadiness(snapshot, [
    {
      id: "qbo-item-1",
      provider: "quickbooks",
      channel: "internal",
      title: "QuickBooks invoice export prepared",
      description: "Invoice export prepared without live sync.",
      customerId: customer.id,
      companyId: weatherTechCompany.id,
      createdAt: "2026-08-04T12:00:00.000Z",
      sortAt: "2026-08-04T12:00:00.000Z",
      statusLabel: "Sync completed",
      statusTone: "green",
      isFailed: false,
      isActionable: false,
      sourceRecordId: "qbo-log-1",
      sourceTable: "integration_sync_logs",
    },
  ]);
  const quickBooksReadiness = readiness.find((item) => item.provider === "quickbooks");
  assert(quickBooksReadiness, "Communications readiness includes QuickBooks");
  assertEqual(
    quickBooksReadiness.label,
    "QuickBooks Online",
    "Communications readiness names QuickBooks accurately",
  );
  assertEqual(
    quickBooksReadiness.connectionStatus,
    "Not connected",
    "Communications readiness does not fake QuickBooks connection",
  );
  assertEqual(
    quickBooksReadiness.syncHealth,
    "Ready",
    "Communications readiness can surface QuickBooks audit-log activity",
  );

  console.log("QuickBooks Online foundation test passed.");
  console.log("Verified official capability flags, OAuth/company readiness, disabled live sync gates, duplicate-safe mapping drafts, Integration Center registration, and communications readiness.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
