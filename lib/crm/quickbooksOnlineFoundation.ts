import type {
  CompanyRecord,
  CustomerRecord,
  EstimateLineItemRecord,
  EstimateRecord,
  IntegrationConnectionRecord,
  IntegrationSyncLogRecord,
  InvoiceLineItemRecord,
  InvoiceRecord,
  PaymentRecord,
} from "./types";

export type QuickBooksOnlineConnectionStatus =
  | "not_configured"
  | "oauth_required"
  | "ready"
  | "production_disabled"
  | "connected"
  | "sync_failed";
export type QuickBooksOnlineCapabilityStatus =
  | "supported"
  | "oauth_required"
  | "production_disabled"
  | "unsupported";
export type QuickBooksOnlineEntity =
  | "customer"
  | "estimate"
  | "invoice"
  | "payment";
export type QuickBooksOnlineCompanyKey = "weathertech" | "ihc";

export type QuickBooksOnlineCompanySlot = {
  key: QuickBooksOnlineCompanyKey;
  label: string;
  companyMatchTerms: string[];
  realmIdEnvVar: string;
  environmentEnvVar: string;
  defaultIncomeAccountEnvVar: string;
  defaultDepositAccountEnvVar: string;
  status: "enabled" | "disabled";
};

export type QuickBooksOnlineOfficialCapability = {
  key: string;
  label: string;
  status: QuickBooksOnlineCapabilityStatus;
  summary: string;
  officialDocumentationUrl: string;
};

export type QuickBooksOnlineReadiness = {
  status: QuickBooksOnlineConnectionStatus;
  label: string;
  oauthClientConfigured: boolean;
  configuredCompanyCount: number;
  liveSyncEnabled: boolean;
  accountingWritesEnabled: boolean;
  paymentProcessingEnabled: boolean;
  ownerActions: string[];
};

export type QuickBooksOnlineExportDraft<TEntity extends QuickBooksOnlineEntity> = {
  provider: "quickbooks_online";
  entity: TEntity;
  companyKey: QuickBooksOnlineCompanyKey | "unmapped";
  localTable: string;
  localRecordId: string;
  duplicateKey: string;
  requestFingerprint: string;
  payload: Record<string, unknown>;
  production: {
    enabled: false;
    reason: string;
  };
};

export const quickBooksOnlineProviderId = "quickbooks_online";
export const quickBooksOnlineOAuthCallbackPath =
  "/api/integrations/quickbooks-online/oauth/callback";
export const quickBooksOnlineScopes = ["com.intuit.quickbooks.accounting"];
export const quickBooksOnlineIdentityScopes = ["openid", "email", "profile"];
export const quickBooksOnlineApiBaseUrl =
  "https://quickbooks.api.intuit.com/v3/company/{realmId}";
export const quickBooksOnlineSandboxApiBaseUrl =
  "https://sandbox-quickbooks.api.intuit.com/v3/company/{realmId}";

export const quickBooksOnlineEnvVars = {
  clientId: "QUICKBOOKS_CLIENT_ID",
  clientSecret: "QUICKBOOKS_CLIENT_SECRET",
  redirectUri: "QUICKBOOKS_REDIRECT_URI",
  environment: "QUICKBOOKS_ENVIRONMENT",
  syncEnabled: "QUICKBOOKS_SYNC_ENABLED",
  accountingWritesEnabled: "QUICKBOOKS_ACCOUNTING_WRITES_ENABLED",
  paymentProcessingEnabled: "QUICKBOOKS_PAYMENT_PROCESSING_ENABLED",
  webhookVerifierToken: "QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN",
  weatherTechRealmId: "QUICKBOOKS_REALM_ID_WEATHERTECH",
  ihcRealmId: "QUICKBOOKS_REALM_ID_IHC",
  weatherTechEnvironment: "QUICKBOOKS_ENVIRONMENT_WEATHERTECH",
  ihcEnvironment: "QUICKBOOKS_ENVIRONMENT_IHC",
  weatherTechIncomeAccount: "QUICKBOOKS_INCOME_ACCOUNT_ID_WEATHERTECH",
  ihcIncomeAccount: "QUICKBOOKS_INCOME_ACCOUNT_ID_IHC",
  weatherTechDepositAccount: "QUICKBOOKS_DEPOSIT_ACCOUNT_ID_WEATHERTECH",
  ihcDepositAccount: "QUICKBOOKS_DEPOSIT_ACCOUNT_ID_IHC",
} as const;

export const quickBooksOnlineCompanySlots: QuickBooksOnlineCompanySlot[] = [
  {
    key: "weathertech",
    label: "WeatherTech Roofing LLC",
    companyMatchTerms: ["weathertech", "roofing"],
    realmIdEnvVar: quickBooksOnlineEnvVars.weatherTechRealmId,
    environmentEnvVar: quickBooksOnlineEnvVars.weatherTechEnvironment,
    defaultIncomeAccountEnvVar: quickBooksOnlineEnvVars.weatherTechIncomeAccount,
    defaultDepositAccountEnvVar: quickBooksOnlineEnvVars.weatherTechDepositAccount,
    status: "enabled",
  },
  {
    key: "ihc",
    label: "IHC",
    companyMatchTerms: ["ihc", "painting"],
    realmIdEnvVar: quickBooksOnlineEnvVars.ihcRealmId,
    environmentEnvVar: quickBooksOnlineEnvVars.ihcEnvironment,
    defaultIncomeAccountEnvVar: quickBooksOnlineEnvVars.ihcIncomeAccount,
    defaultDepositAccountEnvVar: quickBooksOnlineEnvVars.ihcDepositAccount,
    status: "enabled",
  },
];

export const quickBooksOnlineOfficialCapabilities: QuickBooksOnlineOfficialCapability[] = [
  {
    key: "oauth",
    label: "OAuth 2.0",
    status: "oauth_required",
    summary:
      "QuickBooks Online requires OAuth 2.0 user consent; tokens are tied to a connected company realmId.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0",
  },
  {
    key: "accounting_api",
    label: "Accounting API",
    status: "oauth_required",
    summary:
      "The QuickBooks Online Accounting API supports REST/JSON accounting entities and API Explorer-driven entity operations.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api",
  },
  {
    key: "customers",
    label: "Customer mapping",
    status: "oauth_required",
    summary:
      "Customer is an officially supported list entity; WeatherTech OS prepares duplicate-safe customer export payloads only.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api",
  },
  {
    key: "estimates_invoices_payments",
    label: "Estimates, invoices, payments",
    status: "oauth_required",
    summary:
      "Estimate, Invoice, and Payment are supported accounting transaction resources; this sprint only prepares mappings and does not write them.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/learn/explore-the-quickbooks-online-api",
  },
  {
    key: "webhooks",
    label: "Webhooks",
    status: "oauth_required",
    summary:
      "QuickBooks Online webhooks are part of the official development surface for connected companies and require provider configuration.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks",
  },
  {
    key: "cdc_retry",
    label: "Change Data Capture retry",
    status: "oauth_required",
    summary:
      "Webhook reliability should be backed by Change Data Capture reconciliation before live sync is enabled.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/best-practices",
  },
  {
    key: "queries_batch",
    label: "Queries and batch operations",
    status: "oauth_required",
    summary:
      "QuickBooks Online provides query and batch development surfaces; WeatherTech OS only prepares future sync architecture.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbo/docs/develop",
  },
  {
    key: "payments_processing",
    label: "Payment processing",
    status: "unsupported",
    summary:
      "QuickBooks Payments is separate from this Accounting API foundation and is not activated by WeatherTech OS in this sprint.",
    officialDocumentationUrl:
      "https://developer.intuit.com/app/developer/qbpayments/docs/develop/authentication-and-authorization/oauth-2.0",
  },
];

function getEnvValue(name: string, env = process.env) {
  const value = env[name]?.trim();

  return value ? value : null;
}

function isEnabled(value: string | null | undefined) {
  return value?.toLowerCase() === "true";
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function roundCurrency(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function deterministicHash(value: unknown) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function buildFingerprint(value: unknown) {
  const first = deterministicHash(value);
  const second = deterministicHash({ value, salt: "weathertech-qbo" });

  return `${first}${second}`;
}

function getLineDescription(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.slice(0, 4000) : fallback;
}

function buildQuickBooksDocumentNumber(
  prefix: "EST" | "INV" | "PAY",
  value: string | null | undefined,
) {
  const cleanValue = (value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();

  if (cleanValue && cleanValue.length <= 21) {
    return cleanValue;
  }

  return `${prefix}-${deterministicHash(cleanValue || prefix).toUpperCase()}`;
}

function getCustomerName(customer: CustomerRecord | null | undefined) {
  return customer?.display_name || customer?.contact_name || "WeatherTech customer";
}

export function resolveQuickBooksOnlineCompanySlot(
  company: CompanyRecord | null | undefined,
): QuickBooksOnlineCompanySlot | null {
  if (!company) {
    return null;
  }

  const source = normalizeToken(
    `${company.name} ${company.short_name ?? ""} ${company.trade} ${company.workflow_profile}`,
  );

  return (
    quickBooksOnlineCompanySlots.find((slot) =>
      slot.companyMatchTerms.some((term) => source.includes(normalizeToken(term))),
    ) ?? null
  );
}

export function buildQuickBooksOnlineReadiness(
  connections: IntegrationConnectionRecord[] = [],
  env = process.env,
): QuickBooksOnlineReadiness {
  const oauthClientConfigured = Boolean(
    getEnvValue(quickBooksOnlineEnvVars.clientId, env) &&
      getEnvValue(quickBooksOnlineEnvVars.clientSecret, env) &&
      getEnvValue(quickBooksOnlineEnvVars.redirectUri, env),
  );
  const configuredCompanyCount = quickBooksOnlineCompanySlots.filter((slot) =>
    Boolean(getEnvValue(slot.realmIdEnvVar, env)),
  ).length;
  const liveSyncEnabled = isEnabled(getEnvValue(quickBooksOnlineEnvVars.syncEnabled, env));
  const accountingWritesEnabled = isEnabled(
    getEnvValue(quickBooksOnlineEnvVars.accountingWritesEnabled, env),
  );
  const paymentProcessingEnabled = isEnabled(
    getEnvValue(quickBooksOnlineEnvVars.paymentProcessingEnabled, env),
  );
  const hasConnectedRecord = connections.some(
    (connection) => connection.status === "connected",
  );
  const hasErrorRecord = connections.some((connection) => connection.status === "error");

  const status: QuickBooksOnlineConnectionStatus = hasErrorRecord
    ? "sync_failed"
    : hasConnectedRecord
      ? liveSyncEnabled
        ? "connected"
        : "production_disabled"
      : oauthClientConfigured && configuredCompanyCount > 0
        ? "ready"
        : oauthClientConfigured
          ? "oauth_required"
          : "not_configured";

  const ownerActions = [
    oauthClientConfigured ? null : "Create an Intuit app and configure server-side OAuth credentials.",
    configuredCompanyCount > 0 ? null : "Connect and map QuickBooks Online company realm IDs.",
    "Keep accounting writes disabled until owner approval.",
    "Validate customer, estimate, invoice, and payment mappings in sandbox before production.",
  ].filter((item): item is string => Boolean(item));

  return {
    status,
    label: liveSyncEnabled ? "Live sync flag enabled" : "Production disabled",
    oauthClientConfigured,
    configuredCompanyCount,
    liveSyncEnabled,
    accountingWritesEnabled: liveSyncEnabled && accountingWritesEnabled,
    paymentProcessingEnabled: liveSyncEnabled && paymentProcessingEnabled,
    ownerActions,
  };
}

export function getQuickBooksOnlineConnectionStatus(
  connections: IntegrationConnectionRecord[] = [],
  env = process.env,
) {
  return buildQuickBooksOnlineReadiness(connections, env).status;
}

export function buildQuickBooksCustomerExportDraft({
  customer,
  company,
}: {
  customer: CustomerRecord;
  company?: CompanyRecord | null;
}): QuickBooksOnlineExportDraft<"customer"> {
  const slot = resolveQuickBooksOnlineCompanySlot(company);
  const duplicateKey = normalizeToken(
    [
      "customer",
      slot?.key ?? customer.company_id,
      customer.email,
      customer.phone,
      customer.display_name,
      customer.property_address,
    ].join("|"),
  );
  const payload = {
    DisplayName: getCustomerName(customer),
    GivenName: customer.contact_name || customer.display_name,
    PrimaryEmailAddr: customer.email ? { Address: customer.email } : undefined,
    PrimaryPhone: customer.phone ? { FreeFormNumber: customer.phone } : undefined,
    BillAddr: {
      Line1: customer.property_address,
      City: customer.city ?? undefined,
      CountrySubDivisionCode: customer.state,
      PostalCode: customer.postal_code ?? undefined,
    },
    Notes: "Prepared by WeatherTech OS. Export disabled until owner-approved QuickBooks activation.",
  };

  return {
    provider: quickBooksOnlineProviderId,
    entity: "customer",
    companyKey: slot?.key ?? "unmapped",
    localTable: "customers",
    localRecordId: customer.id,
    duplicateKey,
    requestFingerprint: buildFingerprint({ entity: "customer", duplicateKey, payload }),
    payload,
    production: {
      enabled: false,
      reason: "QuickBooks customer export is disabled until live sync is owner-approved.",
    },
  };
}

export function buildQuickBooksEstimateExportDraft({
  estimate,
  lineItems,
  customer,
  company,
}: {
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  customer?: CustomerRecord | null;
  company?: CompanyRecord | null;
}): QuickBooksOnlineExportDraft<"estimate"> {
  const slot = resolveQuickBooksOnlineCompanySlot(company);
  const duplicateKey = normalizeToken(
    ["estimate", slot?.key ?? estimate.company_id, estimate.id, estimate.title].join("|"),
  );
  const payload = {
    CustomerRef: customer ? { name: getCustomerName(customer) } : undefined,
    DocNumber: buildQuickBooksDocumentNumber("EST", estimate.id),
    TxnDate: estimate.issue_date,
    ExpirationDate: estimate.expiration_date ?? undefined,
    PrivateNote: "Prepared by WeatherTech OS. Export disabled until owner approval.",
    Line: lineItems.map((item) => ({
      Description: getLineDescription(item.description ?? item.name, item.name),
      Amount: roundCurrency(item.total),
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: roundCurrency(item.unit_price),
      },
    })),
  };

  return {
    provider: quickBooksOnlineProviderId,
    entity: "estimate",
    companyKey: slot?.key ?? "unmapped",
    localTable: "estimates",
    localRecordId: estimate.id,
    duplicateKey,
    requestFingerprint: buildFingerprint({ entity: "estimate", duplicateKey, payload }),
    payload,
    production: {
      enabled: false,
      reason: "QuickBooks estimate export is disabled until live sync is owner-approved.",
    },
  };
}

export function buildQuickBooksInvoiceExportDraft({
  invoice,
  lineItems,
  customer,
  company,
}: {
  invoice: InvoiceRecord;
  lineItems: InvoiceLineItemRecord[];
  customer?: CustomerRecord | null;
  company?: CompanyRecord | null;
}): QuickBooksOnlineExportDraft<"invoice"> {
  const slot = resolveQuickBooksOnlineCompanySlot(company);
  const duplicateKey = normalizeToken(
    ["invoice", slot?.key ?? invoice.company_id, invoice.invoice_number, invoice.id].join("|"),
  );
  const payload = {
    CustomerRef: customer ? { name: getCustomerName(customer) } : undefined,
    DocNumber: buildQuickBooksDocumentNumber("INV", invoice.invoice_number),
    TxnDate: invoice.issue_date,
    DueDate: invoice.due_date ?? undefined,
    PrivateNote: "Prepared by WeatherTech OS. Export disabled until owner approval.",
    Line: lineItems.map((item) => ({
      Description: getLineDescription(item.description, "WeatherTech OS invoice item"),
      Amount: roundCurrency(item.total),
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        Qty: item.quantity,
        UnitPrice: roundCurrency(item.unit_cost),
      },
    })),
  };

  return {
    provider: quickBooksOnlineProviderId,
    entity: "invoice",
    companyKey: slot?.key ?? "unmapped",
    localTable: "invoices",
    localRecordId: invoice.id,
    duplicateKey,
    requestFingerprint: buildFingerprint({ entity: "invoice", duplicateKey, payload }),
    payload,
    production: {
      enabled: false,
      reason: "QuickBooks invoice export is disabled until live sync is owner-approved.",
    },
  };
}

export function buildQuickBooksPaymentExportDraft({
  payment,
  invoice,
  customer,
  company,
}: {
  payment: PaymentRecord;
  invoice?: InvoiceRecord | null;
  customer?: CustomerRecord | null;
  company?: CompanyRecord | null;
}): QuickBooksOnlineExportDraft<"payment"> {
  const slot = resolveQuickBooksOnlineCompanySlot(company);
  const duplicateKey = normalizeToken(
    [
      "payment",
      slot?.key ?? payment.company_id,
      payment.reference,
      payment.id,
      invoice?.invoice_number,
    ].join("|"),
  );
  const payload = {
    CustomerRef: customer ? { name: getCustomerName(customer) } : undefined,
    TotalAmt: roundCurrency(payment.amount),
    TxnDate: payment.paid_at ?? undefined,
    PaymentRefNum: payment.reference
      ? buildQuickBooksDocumentNumber("PAY", payment.reference)
      : undefined,
    PrivateNote: "Prepared by WeatherTech OS. Export disabled until owner approval.",
    Line: invoice
      ? [
          {
            Amount: roundCurrency(payment.amount),
            LinkedTxn: [{ TxnId: invoice.invoice_number, TxnType: "Invoice" }],
          },
        ]
      : [],
  };

  return {
    provider: quickBooksOnlineProviderId,
    entity: "payment",
    companyKey: slot?.key ?? "unmapped",
    localTable: "payments",
    localRecordId: payment.id,
    duplicateKey,
    requestFingerprint: buildFingerprint({ entity: "payment", duplicateKey, payload }),
    payload,
    production: {
      enabled: false,
      reason:
        "QuickBooks payment export and payment processing are disabled until owner approval.",
    },
  };
}

export function getQuickBooksOnlineLogLabel(log: IntegrationSyncLogRecord) {
  const event = log.event_type.toLowerCase();

  if (event.includes("estimate") && event.includes("export")) {
    return "Estimate exported";
  }

  if (event.includes("invoice") && event.includes("export")) {
    return "Invoice exported";
  }

  if (event.includes("payment") && (event.includes("received") || event.includes("sync"))) {
    return "Payment received";
  }

  if (log.status === "succeeded") {
    return "Sync completed";
  }

  if (log.status === "failed" || log.status === "retrying") {
    return "Sync failed";
  }

  return "Configuration required";
}
