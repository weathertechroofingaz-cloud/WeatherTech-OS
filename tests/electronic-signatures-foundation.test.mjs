import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-electronic-signatures-"));
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
      "lib/crm/electronicSignatureFoundation.ts",
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
      `Could not compile electronic signature foundation.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const compiledModulePath = (fileName) => {
    const candidate = [
      join(outDir, fileName),
      join(outDir, "crm", fileName),
      join(outDir, "lib", "crm", fileName),
    ].find((path) => existsSync(path));
    if (!candidate) {
      throw new Error(`Could not locate compiled ${fileName}.`);
    }
    return pathToFileURL(candidate);
  };

  const signatures = await import(
    compiledModulePath("electronicSignatureFoundation.js")
  );
  const integrationCenter = await import(compiledModulePath("integrationCenter.js"));
  const communications = await import(compiledModulePath("communications.js"));

  assertEqual(
    signatures.electronicSignatureProviderIds.includes("docusign"),
    true,
    "DocuSign provider ID is registered",
  );
  assertEqual(
    signatures.electronicSignatureProviderIds.includes("dropbox_sign"),
    true,
    "Dropbox Sign provider ID is registered",
  );
  assertEqual(
    signatures.docusignScopes.includes("signature"),
    true,
    "DocuSign signature scope readiness is represented",
  );
  assertEqual(
    signatures.dropboxSignScopes.includes("request_signature"),
    true,
    "Dropbox Sign request signature scope readiness is represented",
  );

  const capabilityStatuses = new Map(
    signatures.electronicSignatureOfficialCapabilities.map((capability) => [
      `${capability.provider}:${capability.key}`,
      capability.status,
    ]),
  );
  assertEqual(
    capabilityStatuses.get("docusign:oauth"),
    "oauth_required",
    "DocuSign OAuth requires owner setup",
  );
  assertEqual(
    capabilityStatuses.get("docusign:envelopes"),
    "production_disabled",
    "DocuSign envelope creation is disabled",
  );
  assertEqual(
    capabilityStatuses.get("docusign:connect_webhooks"),
    "oauth_required",
    "DocuSign Connect requires provider setup",
  );
  assertEqual(
    capabilityStatuses.get("dropbox_sign:signature_requests"),
    "production_disabled",
    "Dropbox Sign signature requests are disabled",
  );
  assertEqual(
    capabilityStatuses.get("dropbox_sign:callbacks"),
    "oauth_required",
    "Dropbox Sign callbacks require provider setup",
  );
  assertEqual(
    capabilityStatuses.get("dropbox_sign:test_mode"),
    "supported",
    "Dropbox Sign test mode is represented separately from production",
  );

  const docusignEmptyReadiness = signatures.buildElectronicSignatureReadiness({
    provider: "docusign",
    env: {},
  });
  assertEqual(
    docusignEmptyReadiness.status,
    "not_configured",
    "DocuSign missing env is not configured",
  );
  assertEqual(
    docusignEmptyReadiness.liveRequestsEnabled,
    false,
    "DocuSign live requests default off",
  );
  assertEqual(
    docusignEmptyReadiness.providerWritesEnabled,
    false,
    "DocuSign provider writes default off",
  );

  const docusignOAuthOnlyReadiness = signatures.buildElectronicSignatureReadiness({
    provider: "docusign",
    env: {
      DOCUSIGN_CLIENT_ID: "client",
      DOCUSIGN_CLIENT_SECRET: "secret",
      DOCUSIGN_REDIRECT_URI:
        "https://weathertech-os.example.test/api/integrations/docusign/oauth/callback",
    },
  });
  assertEqual(
    docusignOAuthOnlyReadiness.status,
    "oauth_required",
    "DocuSign OAuth client without company account IDs requires authorization",
  );

  const configuredDocusignEnv = {
    DOCUSIGN_CLIENT_ID: "client",
    DOCUSIGN_CLIENT_SECRET: "secret",
    DOCUSIGN_REDIRECT_URI:
      "https://weathertech-os.example.test/api/integrations/docusign/oauth/callback",
    DOCUSIGN_ACCOUNT_ID_WEATHERTECH: "weathertech-ds",
    DOCUSIGN_ACCOUNT_ID_IHC: "ihc-ds",
  };
  const docusignReadyReadiness = signatures.buildElectronicSignatureReadiness({
    provider: "docusign",
    env: configuredDocusignEnv,
  });
  assertEqual(docusignReadyReadiness.status, "ready", "DocuSign env is ready");
  assertEqual(
    docusignReadyReadiness.configuredCompanyCount,
    2,
    "DocuSign company mappings are counted",
  );

  const docusignDisabledReadiness = signatures.buildElectronicSignatureReadiness({
    provider: "docusign",
    env: configuredDocusignEnv,
    connections: [{ provider: "docusign", status: "connected" }],
  });
  assertEqual(
    docusignDisabledReadiness.status,
    "production_disabled",
    "Connected DocuSign record stays production disabled until flag is enabled",
  );

  const docusignConnectedReadiness = signatures.buildElectronicSignatureReadiness({
    provider: "docusign",
    env: {
      ...configuredDocusignEnv,
      DOCUSIGN_SIGNATURE_REQUESTS_ENABLED: "true",
      DOCUSIGN_PROVIDER_WRITES_ENABLED: "true",
    },
    connections: [{ provider: "docusign", status: "connected" }],
  });
  assertEqual(
    docusignConnectedReadiness.status,
    "connected",
    "DocuSign connected requires explicit live request flag",
  );
  assertEqual(
    docusignConnectedReadiness.providerWritesEnabled,
    true,
    "DocuSign provider writes require live request flag plus write gate",
  );

  const dropboxReadyReadiness = signatures.buildElectronicSignatureReadiness({
    provider: "dropbox_sign",
    env: {
      DROPBOX_SIGN_CLIENT_ID: "client",
      DROPBOX_SIGN_CLIENT_SECRET: "secret",
      DROPBOX_SIGN_REDIRECT_URI:
        "https://weathertech-os.example.test/api/integrations/dropbox-sign/oauth/callback",
      DROPBOX_SIGN_ACCOUNT_ID_WEATHERTECH: "weathertech-dropbox",
      DROPBOX_SIGN_ACCOUNT_ID_IHC: "ihc-dropbox",
    },
  });
  assertEqual(dropboxReadyReadiness.status, "ready", "Dropbox Sign env is ready");
  assertEqual(
    dropboxReadyReadiness.liveRequestsEnabled,
    false,
    "Dropbox Sign live requests default off",
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
    signatures.resolveElectronicSignatureCompanySlot(weatherTechCompany)?.key,
    "weathertech",
    "WeatherTech routes to WeatherTech signature company slot",
  );
  assertEqual(
    signatures.resolveElectronicSignatureCompanySlot(ihcCompany)?.key,
    "ihc",
    "IHC routes to IHC signature company slot",
  );

  const customer = {
    id: "customer-1",
    company_id: weatherTechCompany.id,
    display_name: "TEST Signature Customer",
    contact_name: "Signature Customer",
    email: "signature@example.test",
    phone: "(602) 555-0144",
    property_address: "144 Test Signature Way",
    city: "Phoenix",
    state: "AZ",
    postal_code: "85001",
  };
  const document = {
    id: "document-1",
    company_id: weatherTechCompany.id,
    customer_id: customer.id,
    title: "TEST Signature Contract",
    file_name: "signature-contract.pdf",
  };
  const signature = {
    id: "signature-1",
    company_id: weatherTechCompany.id,
    customer_id: customer.id,
    document_id: document.id,
    signer_name: "Signature Customer",
    signer_email: "signature@example.test",
    status: "sent",
    provider: "native",
    provider_envelope_id: null,
    signed_at: null,
    updated_at: "2026-08-04T12:00:00.000Z",
  };

  const docusignDraft = signatures.buildElectronicSignatureRequestDraft({
    provider: "docusign",
    signature,
    document,
    customer,
    company: weatherTechCompany,
  });
  const repeatedDocusignDraft = signatures.buildElectronicSignatureRequestDraft({
    provider: "docusign",
    signature,
    document,
    customer,
    company: weatherTechCompany,
  });
  assertEqual(docusignDraft.provider, "docusign", "DocuSign draft provider is stable");
  assertEqual(
    docusignDraft.companyKey,
    "weathertech",
    "DocuSign draft maps company",
  );
  assertEqual(
    docusignDraft.payload.status,
    "created",
    "DocuSign draft remains unsent",
  );
  assertEqual(
    docusignDraft.production.enabled,
    false,
    "DocuSign production sending is disabled",
  );
  assertEqual(
    docusignDraft.duplicateKey,
    repeatedDocusignDraft.duplicateKey,
    "DocuSign duplicate key is deterministic",
  );
  assertEqual(
    docusignDraft.requestFingerprint,
    repeatedDocusignDraft.requestFingerprint,
    "DocuSign request fingerprint is deterministic",
  );

  const dropboxDraft = signatures.buildElectronicSignatureRequestDraft({
    provider: "dropbox_sign",
    signature,
    document,
    customer,
    company: weatherTechCompany,
  });
  assertEqual(dropboxDraft.provider, "dropbox_sign", "Dropbox Sign draft provider is stable");
  assertEqual(
    dropboxDraft.payload.test_mode,
    true,
    "Dropbox Sign draft stays in test-mode mapping",
  );
  assertEqual(
    dropboxDraft.production.enabled,
    false,
    "Dropbox Sign production sending is disabled",
  );

  const completedEvent = signatures.buildElectronicSignatureStatusEvent({
    provider: "docusign",
    status: "signed",
    signerName: signature.signer_name,
    documentTitle: document.title,
  });
  assertEqual(
    completedEvent.event,
    "signature_completed",
    "Signed maps to Customer 360 completion event",
  );
  assert(
    completedEvent.customer360Summary.includes("DocuSign"),
    "Customer 360 summary includes provider label",
  );
  const failedLogLabel = signatures.getElectronicSignatureLogLabel({
    event_type: "signature_request.failed",
    status: "failed",
  });
  assertEqual(failedLogLabel, "Sync failed", "Failed log maps to sync failure");

  const providerIds = integrationCenter.integrationProviderRegistry.map(
    (provider) => provider.id,
  );
  assertEqual(
    providerIds.includes("docusign"),
    true,
    "Integration Center registers DocuSign",
  );
  assertEqual(
    providerIds.includes("dropbox_sign"),
    true,
    "Integration Center registers Dropbox Sign",
  );
  const providerReadiness = integrationCenter.buildIntegrationCenterProviders({
    integrationConnections: [],
    integrationSyncLogs: [],
    smsMessages: [],
    emailMessages: [],
    calendarEventSyncs: [],
    scheduleEvents: [],
    leads: [],
  });
  const docusignProvider = providerReadiness.find(
    (provider) => provider.metadata.id === "docusign",
  );
  assertEqual(
    docusignProvider?.connectionState,
    "not_connected",
    "Integration Center does not fake DocuSign connection",
  );
  assertEqual(
    docusignProvider?.metadata.oauthReadiness.callbackPath,
    signatures.docusignOAuthCallbackPath,
    "DocuSign OAuth callback is surfaced",
  );

  const inboxProviders = communications.buildCommunicationProviderReadiness(
    {
      integrationConnections: [],
      integrationSyncLogs: [
        {
          id: "log-1",
          provider: "docusign",
          status: "failed",
          company_id: weatherTechCompany.id,
          direction: "provider_to_weathertech",
          event_type: "signature_request.failed",
          related_table: "signatures",
          related_record_id: signature.id,
          external_id: "provider-envelope-1",
          attempt_count: 1,
          max_attempts: 3,
          next_retry_at: null,
          last_attempted_at: "2026-08-04T12:00:00.000Z",
          completed_at: null,
          request_fingerprint: "fingerprint",
          request_summary: {},
          error_message: "Provider rejected test payload",
          created_at: "2026-08-04T12:00:00.000Z",
          updated_at: "2026-08-04T12:00:00.000Z",
        },
      ],
      smsMessages: [],
      emailMessages: [],
      callRecords: [],
      communicationProviderEvents: [],
      leadIntakeRecords: [],
      leads: [],
      customers: [],
      jobs: [],
      companies: [weatherTechCompany],
      properties: [],
      scheduleEvents: [],
      calendarEventSyncs: [],
      businessPhoneNumbers: [],
    },
    [
      {
        id: "integration-log-1",
        provider: "docusign",
        isFailed: true,
        createdAt: "2026-08-04T12:00:00.000Z",
        failureDetail: "Provider rejected test payload",
      },
    ],
  );
  const docusignInboxReadiness = inboxProviders.find(
    (provider) => provider.provider === "docusign",
  );
  assertEqual(
    docusignInboxReadiness?.connectionStatus,
    "Not connected",
    "Communications does not fake DocuSign connection",
  );
  assertEqual(
    docusignInboxReadiness?.syncHealth,
    "Needs attention",
    "Communications surfaces signature sync failure health",
  );

  console.log("Electronic signature foundation tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
