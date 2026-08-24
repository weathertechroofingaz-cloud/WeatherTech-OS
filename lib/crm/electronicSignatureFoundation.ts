import type {
  CompanyRecord,
  CustomerRecord,
  DocumentRecord,
  IntegrationConnectionRecord,
  IntegrationSyncLogRecord,
  SignatureRecord,
  SignatureStatus,
} from "./types";

export type ElectronicSignatureProvider = "docusign" | "dropbox_sign";
export type ElectronicSignatureConnectionStatus =
  | "not_configured"
  | "oauth_required"
  | "ready"
  | "production_disabled"
  | "connected"
  | "sync_failed";
export type ElectronicSignatureCapabilityStatus =
  | "supported"
  | "oauth_required"
  | "production_disabled"
  | "unsupported";
export type ElectronicSignatureCompanyKey = "weathertech" | "ihc";
export type ElectronicSignatureLifecycleEvent =
  | "signature_requested"
  | "signature_viewed"
  | "signature_completed"
  | "signature_declined"
  | "signature_expired"
  | "signature_revoked"
  | "signature_superseded"
  | "sync_failed"
  | "configuration_required";

export type ElectronicSignatureCompanySlot = {
  key: ElectronicSignatureCompanyKey;
  label: string;
  companyMatchTerms: string[];
  docusignAccountIdEnvVar: string;
  dropboxSignAccountIdEnvVar: string;
  status: "enabled" | "disabled";
};

export type ElectronicSignatureOfficialCapability = {
  provider: ElectronicSignatureProvider;
  key: string;
  label: string;
  status: ElectronicSignatureCapabilityStatus;
  summary: string;
  officialDocumentationUrl: string;
};

export type ElectronicSignatureReadiness = {
  provider: ElectronicSignatureProvider;
  status: ElectronicSignatureConnectionStatus;
  label: string;
  oauthClientConfigured: boolean;
  configuredCompanyCount: number;
  liveRequestsEnabled: boolean;
  providerWritesEnabled: boolean;
  ownerActions: string[];
};

export type ElectronicSignatureRequestDraft = {
  provider: ElectronicSignatureProvider;
  companyKey: ElectronicSignatureCompanyKey | "unmapped";
  localTable: "signatures";
  localRecordId: string;
  localDocumentId: string | null;
  localCustomerId: string | null;
  duplicateKey: string;
  requestFingerprint: string;
  payload: Record<string, unknown>;
  production: {
    enabled: false;
    reason: string;
  };
};

export type ElectronicSignatureStatusEvent = {
  provider: ElectronicSignatureProvider;
  status: SignatureStatus | "configuration_required" | "sync_failed";
  event: ElectronicSignatureLifecycleEvent;
  label: string;
  customer360Summary: string;
};

export const docusignProviderId = "docusign";
export const dropboxSignProviderId = "dropbox_sign";
export const electronicSignatureProviderIds: ElectronicSignatureProvider[] = [
  docusignProviderId,
  dropboxSignProviderId,
];

export const docusignOAuthCallbackPath =
  "/api/integrations/docusign/oauth/callback";
export const dropboxSignOAuthCallbackPath =
  "/api/integrations/dropbox-sign/oauth/callback";

export const docusignScopes = ["signature", "impersonation"];
export const dropboxSignScopes = ["request_signature", "basic_account_info"];

export const docusignApiBaseUrl = "https://demo.docusign.net/restapi";
export const dropboxSignApiBaseUrl = "https://api.hellosign.com/v3";

export const electronicSignatureEnvVars = {
  docusignClientId: "DOCUSIGN_CLIENT_ID",
  docusignClientSecret: "DOCUSIGN_CLIENT_SECRET",
  docusignRedirectUri: "DOCUSIGN_REDIRECT_URI",
  docusignBaseUri: "DOCUSIGN_BASE_URI",
  docusignAuthBaseUri: "DOCUSIGN_AUTH_BASE_URI",
  docusignWebhookHmacKey: "DOCUSIGN_WEBHOOK_HMAC_KEY",
  docusignSignatureRequestsEnabled: "DOCUSIGN_SIGNATURE_REQUESTS_ENABLED",
  docusignProviderWritesEnabled: "DOCUSIGN_PROVIDER_WRITES_ENABLED",
  docusignAccountIdWeatherTech: "DOCUSIGN_ACCOUNT_ID_WEATHERTECH",
  docusignAccountIdIhc: "DOCUSIGN_ACCOUNT_ID_IHC",
  dropboxSignClientId: "DROPBOX_SIGN_CLIENT_ID",
  dropboxSignClientSecret: "DROPBOX_SIGN_CLIENT_SECRET",
  dropboxSignRedirectUri: "DROPBOX_SIGN_REDIRECT_URI",
  dropboxSignWebhookSecret: "DROPBOX_SIGN_WEBHOOK_SECRET",
  dropboxSignSignatureRequestsEnabled: "DROPBOX_SIGN_SIGNATURE_REQUESTS_ENABLED",
  dropboxSignProviderWritesEnabled: "DROPBOX_SIGN_PROVIDER_WRITES_ENABLED",
  dropboxSignTestMode: "DROPBOX_SIGN_TEST_MODE",
  dropboxSignAccountIdWeatherTech: "DROPBOX_SIGN_ACCOUNT_ID_WEATHERTECH",
  dropboxSignAccountIdIhc: "DROPBOX_SIGN_ACCOUNT_ID_IHC",
} as const;

export const electronicSignatureCompanySlots: ElectronicSignatureCompanySlot[] = [
  {
    key: "weathertech",
    label: "WeatherTech Roofing LLC",
    companyMatchTerms: ["weathertech", "roofing"],
    docusignAccountIdEnvVar: electronicSignatureEnvVars.docusignAccountIdWeatherTech,
    dropboxSignAccountIdEnvVar: electronicSignatureEnvVars.dropboxSignAccountIdWeatherTech,
    status: "enabled",
  },
  {
    key: "ihc",
    label: "IHC",
    companyMatchTerms: ["ihc", "painting"],
    docusignAccountIdEnvVar: electronicSignatureEnvVars.docusignAccountIdIhc,
    dropboxSignAccountIdEnvVar: electronicSignatureEnvVars.dropboxSignAccountIdIhc,
    status: "enabled",
  },
];

export const electronicSignatureOfficialCapabilities: ElectronicSignatureOfficialCapability[] = [
  {
    provider: "docusign",
    key: "oauth",
    label: "OAuth 2.0",
    status: "oauth_required",
    summary:
      "DocuSign eSignature integrations require OAuth before envelope or account APIs can be used.",
    officialDocumentationUrl: "https://developers.docusign.com/platform/auth/",
  },
  {
    provider: "docusign",
    key: "envelopes",
    label: "Envelope creation",
    status: "production_disabled",
    summary:
      "DocuSign envelopes can contain documents, recipients, and tabs; WeatherTech OS only prepares draft mappings in this sprint.",
    officialDocumentationUrl:
      "https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/create/",
  },
  {
    provider: "docusign",
    key: "status",
    label: "Envelope status",
    status: "oauth_required",
    summary:
      "DocuSign supports envelope status retrieval and status-list APIs after authorization.",
    officialDocumentationUrl:
      "https://developers.docusign.com/docs/esign-rest-api/reference/envelopes/envelopes/get/",
  },
  {
    provider: "docusign",
    key: "documents",
    label: "Signed document retrieval",
    status: "oauth_required",
    summary:
      "DocuSign envelope documents can be listed and downloaded after the provider is authorized.",
    officialDocumentationUrl:
      "https://developers.docusign.com/docs/esign-rest-api/esign101/concepts/documents/",
  },
  {
    provider: "docusign",
    key: "connect_webhooks",
    label: "Connect webhooks",
    status: "oauth_required",
    summary:
      "DocuSign Connect can notify WeatherTech OS when envelope events occur after webhook setup.",
    officialDocumentationUrl: "https://developers.docusign.com/platform/webhooks/connect/",
  },
  {
    provider: "dropbox_sign",
    key: "oauth",
    label: "OAuth 2.0",
    status: "oauth_required",
    summary:
      "Dropbox Sign supports OAuth for API apps; WeatherTech OS keeps tokens server-side in a future activation sprint.",
    officialDocumentationUrl:
      "https://developers.hellosign.com/docs/guides/o-auth/overview",
  },
  {
    provider: "dropbox_sign",
    key: "signature_requests",
    label: "Signature requests",
    status: "production_disabled",
    summary:
      "Dropbox Sign signature_request endpoints support send, get, list, reminders, updates, and cancel flows; this sprint does not send requests.",
    officialDocumentationUrl:
      "https://developers.hellosign.com/api/signature-request/get",
  },
  {
    provider: "dropbox_sign",
    key: "files",
    label: "Signed file download",
    status: "oauth_required",
    summary:
      "Dropbox Sign can return completed files after a signature request is ready for download.",
    officialDocumentationUrl:
      "https://developers.hellosign.com/api/signature-request/files",
  },
  {
    provider: "dropbox_sign",
    key: "callbacks",
    label: "Events and callbacks",
    status: "oauth_required",
    summary:
      "Dropbox Sign callbacks can report signature request events and must be verified before processing.",
    officialDocumentationUrl:
      "https://developers.hellosign.com/docs/guides/events-and-callbacks/overview",
  },
  {
    provider: "dropbox_sign",
    key: "test_mode",
    label: "Test mode",
    status: "supported",
    summary:
      "Dropbox Sign test_mode can exercise most endpoints, but test requests are not legally binding and still appear in Dropbox Sign accounts.",
    officialDocumentationUrl: "https://developers.hellosign.com/docs/overview",
  },
];

function getEnvValue(name: string, env: Record<string, string | undefined> = process.env) {
  const value = env[name]?.trim();

  return value ? value : null;
}

function isEnabled(value: string | null | undefined) {
  return value?.toLowerCase() === "true";
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
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
  const second = deterministicHash({ value, salt: "weathertech-signature" });

  return `${first}${second}`;
}

function getCustomerName(customer: CustomerRecord | null | undefined) {
  return customer?.display_name || customer?.contact_name || "WeatherTech customer";
}

function providerAccountEnvVar(
  provider: ElectronicSignatureProvider,
  slot: ElectronicSignatureCompanySlot,
) {
  return provider === "docusign"
    ? slot.docusignAccountIdEnvVar
    : slot.dropboxSignAccountIdEnvVar;
}

function getProviderEnvConfig(provider: ElectronicSignatureProvider) {
  if (provider === "docusign") {
    return {
      clientId: electronicSignatureEnvVars.docusignClientId,
      clientSecret: electronicSignatureEnvVars.docusignClientSecret,
      redirectUri: electronicSignatureEnvVars.docusignRedirectUri,
      liveRequestsEnabled: electronicSignatureEnvVars.docusignSignatureRequestsEnabled,
      providerWritesEnabled: electronicSignatureEnvVars.docusignProviderWritesEnabled,
    };
  }

  return {
    clientId: electronicSignatureEnvVars.dropboxSignClientId,
    clientSecret: electronicSignatureEnvVars.dropboxSignClientSecret,
    redirectUri: electronicSignatureEnvVars.dropboxSignRedirectUri,
    liveRequestsEnabled: electronicSignatureEnvVars.dropboxSignSignatureRequestsEnabled,
    providerWritesEnabled: electronicSignatureEnvVars.dropboxSignProviderWritesEnabled,
  };
}

export function getElectronicSignatureProviderLabel(
  provider: ElectronicSignatureProvider | string | null | undefined,
) {
  if (provider === "docusign") {
    return "DocuSign";
  }

  if (provider === "dropbox_sign") {
    return "Dropbox Sign";
  }

  return "Native signature";
}

export function resolveElectronicSignatureCompanySlot(
  company: CompanyRecord | null | undefined,
): ElectronicSignatureCompanySlot | null {
  if (!company) {
    return null;
  }

  const source = normalizeToken(
    `${company.name} ${company.short_name ?? ""} ${company.trade} ${company.workflow_profile}`,
  );

  return (
    electronicSignatureCompanySlots.find((slot) =>
      slot.companyMatchTerms.some((term) => source.includes(normalizeToken(term))),
    ) ?? null
  );
}

export function buildElectronicSignatureReadiness({
  provider,
  connections = [],
  env = process.env,
}: {
  provider: ElectronicSignatureProvider;
  connections?: Array<Pick<IntegrationConnectionRecord, "provider" | "status">>;
  env?: Record<string, string | undefined>;
}): ElectronicSignatureReadiness {
  const envConfig = getProviderEnvConfig(provider);
  const oauthClientConfigured = Boolean(
    getEnvValue(envConfig.clientId, env) &&
      getEnvValue(envConfig.clientSecret, env) &&
      getEnvValue(envConfig.redirectUri, env),
  );
  const configuredCompanyCount = electronicSignatureCompanySlots.filter((slot) =>
    Boolean(getEnvValue(providerAccountEnvVar(provider, slot), env)),
  ).length;
  const liveRequestsEnabled = isEnabled(getEnvValue(envConfig.liveRequestsEnabled, env));
  const providerWritesEnabled = isEnabled(getEnvValue(envConfig.providerWritesEnabled, env));
  const providerConnections = connections.filter(
    (connection) => connection.provider === provider,
  );
  const hasConnectedRecord = providerConnections.some(
    (connection) => connection.status === "connected",
  );
  const hasErrorRecord = providerConnections.some((connection) => connection.status === "error");

  const status: ElectronicSignatureConnectionStatus = hasErrorRecord
    ? "sync_failed"
    : hasConnectedRecord
      ? liveRequestsEnabled
        ? "connected"
        : "production_disabled"
      : oauthClientConfigured && configuredCompanyCount > 0
        ? "ready"
        : oauthClientConfigured
          ? "oauth_required"
          : "not_configured";

  const ownerActions = [
    oauthClientConfigured
      ? null
      : `Create a ${getElectronicSignatureProviderLabel(provider)} app and configure server-side OAuth credentials.`,
    configuredCompanyCount > 0
      ? null
      : `Map WeatherTech Roofing LLC and IHC ${getElectronicSignatureProviderLabel(provider)} account IDs.`,
    "Keep live signature requests disabled until owner approval.",
    "Verify webhooks, status mapping, duplicate keys, and signed-document download in sandbox before production.",
  ].filter((item): item is string => Boolean(item));

  return {
    provider,
    status,
    label: liveRequestsEnabled ? "Live request flag enabled" : "Production disabled",
    oauthClientConfigured,
    configuredCompanyCount,
    liveRequestsEnabled,
    providerWritesEnabled: liveRequestsEnabled && providerWritesEnabled,
    ownerActions,
  };
}

function buildSignatureDuplicateKey({
  provider,
  signature,
  document,
  customer,
  companyKey,
}: {
  provider: ElectronicSignatureProvider;
  signature: SignatureRecord;
  document?: DocumentRecord | null;
  customer?: CustomerRecord | null;
  companyKey: ElectronicSignatureCompanyKey | "unmapped";
}) {
  return normalizeToken(
    [
      provider,
      companyKey,
      signature.document_id ?? document?.id,
      signature.customer_id ?? customer?.id,
      signature.signer_email,
      signature.signer_name,
    ].join("|"),
  );
}

export function buildElectronicSignatureRequestDraft({
  provider,
  signature,
  document,
  customer,
  company,
}: {
  provider: ElectronicSignatureProvider;
  signature: SignatureRecord;
  document?: DocumentRecord | null;
  customer?: CustomerRecord | null;
  company?: CompanyRecord | null;
}): ElectronicSignatureRequestDraft {
  const slot = resolveElectronicSignatureCompanySlot(company);
  const companyKey = slot?.key ?? "unmapped";
  const duplicateKey = buildSignatureDuplicateKey({
    provider,
    signature,
    document,
    customer,
    companyKey,
  });
  const subject = `${company?.name ?? "WeatherTech OS"} signature request`;
  const documentName = document?.title ?? "WeatherTech document";

  const payload =
    provider === "docusign"
      ? {
          emailSubject: subject,
          status: "created",
          documents: [
            {
              documentId: document?.id ?? signature.document_id ?? signature.id,
              name: documentName,
            },
          ],
          recipients: {
            signers: [
              {
                recipientId: signature.id,
                name: signature.signer_name,
                email: signature.signer_email,
                roleName: "Customer",
              },
            ],
          },
          customFields: {
            textCustomFields: [
              { name: "weathertechSignatureId", value: signature.id },
              { name: "weathertechCustomerId", value: signature.customer_id ?? "" },
              { name: "weathertechCompanyKey", value: companyKey },
            ],
          },
        }
      : {
          title: documentName,
          subject,
          message:
            "Please review and sign through the approved WeatherTech OS signature workflow.",
          signers: [
            {
              name: signature.signer_name,
              email_address: signature.signer_email,
              order: 0,
            },
          ],
          metadata: {
            weathertech_signature_id: signature.id,
            weathertech_customer_id: signature.customer_id,
            weathertech_company_key: companyKey,
          },
          test_mode: true,
        };

  return {
    provider,
    companyKey,
    localTable: "signatures",
    localRecordId: signature.id,
    localDocumentId: signature.document_id ?? document?.id ?? null,
    localCustomerId: signature.customer_id ?? customer?.id ?? null,
    duplicateKey,
    requestFingerprint: buildFingerprint({ provider, duplicateKey, payload }),
    payload,
    production: {
      enabled: false,
      reason: `${getElectronicSignatureProviderLabel(provider)} requests are disabled until owner-approved activation.`,
    },
  };
}

export function buildElectronicSignatureStatusEvent({
  provider,
  status,
  signerName,
  documentTitle,
}: {
  provider: ElectronicSignatureProvider;
  status: SignatureStatus | "configuration_required" | "sync_failed";
  signerName: string;
  documentTitle?: string | null;
}): ElectronicSignatureStatusEvent {
  const providerLabel = getElectronicSignatureProviderLabel(provider);
  const subject = documentTitle?.trim() || "the signature packet";

  const map: Record<
    SignatureStatus | "configuration_required" | "sync_failed",
    { event: ElectronicSignatureLifecycleEvent; label: string }
  > = {
    pending: { event: "signature_requested", label: "Signature requested" },
    sent: { event: "signature_requested", label: "Signature requested" },
    viewed: { event: "signature_viewed", label: "Signature viewed" },
    signed: { event: "signature_completed", label: "Signature completed" },
    declined: { event: "signature_declined", label: "Signature declined" },
    expired: { event: "signature_expired", label: "Signature expired" },
    failed: { event: "sync_failed", label: "Signature failed" },
    revoked: { event: "signature_revoked", label: "Signature revoked" },
    superseded: {
      event: "signature_superseded",
      label: "Signature superseded",
    },
    sync_failed: { event: "sync_failed", label: "Signature sync failed" },
    configuration_required: {
      event: "configuration_required",
      label: "Signature configuration required",
    },
  };
  const mapped = map[status];

  return {
    provider,
    status,
    event: mapped.event,
    label: mapped.label,
    customer360Summary: `${providerLabel}: ${mapped.label.toLowerCase()} for ${signerName} on ${subject}.`,
  };
}

export function getElectronicSignatureLogLabel(log: IntegrationSyncLogRecord) {
  const event = log.event_type.toLowerCase();

  if (log.status === "failed" || log.status === "retrying") {
    return "Sync failed";
  }

  if (event.includes("view")) {
    return "Signature viewed";
  }

  if (event.includes("complete") || event.includes("signed")) {
    return "Signature completed";
  }

  if (event.includes("decline")) {
    return "Signature declined";
  }

  if (event.includes("expire")) {
    return "Signature expired";
  }

  if (event.includes("request") || event.includes("send")) {
    return "Signature requested";
  }

  if (log.status === "succeeded") {
    return "Sync completed";
  }

  return "Configuration required";
}

export function buildElectronicSignatureRetryPlan(log: IntegrationSyncLogRecord) {
  const attemptsRemaining = Math.max(log.max_attempts - log.attempt_count, 0);

  return {
    provider: log.provider,
    canRetry: log.status === "failed" || log.status === "retrying",
    attemptsRemaining,
    nextRetryAt: log.next_retry_at,
    auditSummary:
      attemptsRemaining > 0
        ? "Retry can be scheduled after webhook/provider validation succeeds."
        : "Manual review required before another provider attempt.",
  };
}
