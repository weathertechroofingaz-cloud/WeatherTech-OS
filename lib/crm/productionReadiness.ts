import type { CrmSnapshot } from "./types";
import {
  buildIntegrationCenterProviders,
  integrationHealthStateLabel,
  integrationReadinessStateLabel,
  type IntegrationProviderId,
  type IntegrationProviderReadiness,
} from "./integrationCenter";
import { electronicSignatureEnvVars } from "./electronicSignatureFoundation";
import { quickBooksOnlineEnvVars } from "./quickbooksOnlineFoundation";
import {
  goHighLevelEnvVars,
  googleWorkspaceEnvVars,
  twilioEnvVars,
} from "./integrations";
import { googleBusinessProfileEnvVars } from "./googleBusinessProfileLeadCapture";

const websiteEnvVars = {
  enabled: "WEBSITE_INTAKE_ENABLED",
  signingSecret: "WEBSITE_INTAKE_SIGNING_SECRET",
  legacySigningSecret: "WEBSITE_LEAD_CAPTURE_SECRET",
  allowedOrigins: "WEBSITE_ALLOWED_ORIGINS",
  weatherTechPhoenixSourceId: "WEATHERTECH_WEBSITE_SOURCE_ID",
  weatherTechTucsonSourceId: "WEATHERTECH_TUCSON_WEBSITE_SOURCE_ID",
  ihcSourceId: "IHC_WEBSITE_SOURCE_ID",
};

const yelpEnvVars = {
  apiKey: "YELP_API_KEY",
  clientId: "YELP_CLIENT_ID",
  clientSecret: "YELP_CLIENT_SECRET",
  redirectUri: "YELP_REDIRECT_URI",
  partnerId: "YELP_PARTNER_ID",
  webhookSecret: "YELP_WEBHOOK_SECRET",
  sharedSecret: "YELP_LEAD_CAPTURE_SECRET",
};

export type ProductionReadinessTone = "green" | "amber" | "red" | "blue" | "slate";

export type ProductionReadinessState =
  | "ready_for_activation"
  | "production_disabled"
  | "credentials_required"
  | "oauth_required"
  | "connected"
  | "sync_failed"
  | "owner_setup_required"
  | "verification_required";

export type ProductionReadinessCheck = {
  id: string;
  label: string;
  status: ProductionReadinessState;
  tone: ProductionReadinessTone;
  summary: string;
  requiredActions: string[];
  evidence: string[];
};

export type ProductionActivationGuide = {
  id: string;
  label: string;
  providers: IntegrationProviderId[];
  requiredOwnerActions: string[];
  requiredCredentials: string[];
  oauthSetup: string[];
  externalApprovals: string[];
  testingSequence: string[];
  rollbackProcedure: string[];
};

export type ProductionChecklistGroup = {
  id: string;
  label: string;
  items: ProductionReadinessCheck[];
};

export type ProductionReadinessCenter = {
  score: number;
  scoreLabel: string;
  overallStatus: ProductionReadinessState;
  overallSummary: string;
  environmentStatus: ProductionReadinessCheck;
  migrationStatus: ProductionReadinessCheck;
  databaseStatus: ProductionReadinessCheck;
  integrationStatus: ProductionReadinessCheck;
  lastValidation: string;
  lastRegression: string;
  lastMigration: string;
  requiredMigrations: string[];
  pendingOwnerSetup: string[];
  providerChecks: ProductionReadinessCheck[];
  subsystemChecks: ProductionReadinessCheck[];
  activationGuides: ProductionActivationGuide[];
  deploymentChecklist: ProductionChecklistGroup[];
  blockers: string[];
};

const latestRequiredMigration = "0031_electronic_signatures_foundation.sql";

const providerIdsForActivation = new Set<IntegrationProviderId>([
  "twilio",
  "gmail",
  "google_calendar",
  "google_business_profile",
  "yelp",
  "website_forms",
  "gohighlevel",
  "quickbooks_online",
  "docusign",
  "dropbox_sign",
]);

const providerGuideEnv = {
  twilio: [
    twilioEnvVars.accountSid,
    twilioEnvVars.authToken,
    twilioEnvVars.messagingServiceSid,
    twilioEnvVars.publicBaseUrl,
    twilioEnvVars.weatherTechPhoenixNumber,
    twilioEnvVars.weatherTechTucsonNumber,
    twilioEnvVars.ihcNumber,
  ],
  googleWorkspace: [
    googleWorkspaceEnvVars.clientId,
    googleWorkspaceEnvVars.clientSecret,
    googleWorkspaceEnvVars.redirectUri,
    googleWorkspaceEnvVars.tokenEncryptionKey,
    googleWorkspaceEnvVars.publicBaseUrl,
    googleWorkspaceEnvVars.workspaceDomain,
  ],
  googleBusinessProfile: [
    googleBusinessProfileEnvVars.clientId,
    googleBusinessProfileEnvVars.clientSecret,
    googleBusinessProfileEnvVars.redirectUri,
    googleBusinessProfileEnvVars.pubSubTopic,
    googleBusinessProfileEnvVars.weatherTechAccountId,
    googleBusinessProfileEnvVars.weatherTechPhoenixLocationId,
    googleBusinessProfileEnvVars.weatherTechTucsonLocationId,
    googleBusinessProfileEnvVars.ihcAccountId,
    googleBusinessProfileEnvVars.ihcLocationId,
  ],
  yelp: [
    yelpEnvVars.apiKey,
    yelpEnvVars.clientId,
    yelpEnvVars.clientSecret,
    yelpEnvVars.redirectUri,
    yelpEnvVars.partnerId,
    yelpEnvVars.webhookSecret,
    yelpEnvVars.sharedSecret,
  ],
  website: [
    websiteEnvVars.enabled,
    websiteEnvVars.signingSecret,
    websiteEnvVars.legacySigningSecret,
    websiteEnvVars.allowedOrigins,
    websiteEnvVars.weatherTechPhoenixSourceId,
    websiteEnvVars.weatherTechTucsonSourceId,
    websiteEnvVars.ihcSourceId,
  ],
  quickbooks: [
    quickBooksOnlineEnvVars.clientId,
    quickBooksOnlineEnvVars.clientSecret,
    quickBooksOnlineEnvVars.redirectUri,
    quickBooksOnlineEnvVars.webhookVerifierToken,
    quickBooksOnlineEnvVars.weatherTechRealmId,
    quickBooksOnlineEnvVars.ihcRealmId,
  ],
  signatures: [
    electronicSignatureEnvVars.docusignClientId,
    electronicSignatureEnvVars.docusignClientSecret,
    electronicSignatureEnvVars.docusignRedirectUri,
    electronicSignatureEnvVars.docusignWebhookHmacKey,
    electronicSignatureEnvVars.docusignAccountIdWeatherTech,
    electronicSignatureEnvVars.docusignAccountIdIhc,
    electronicSignatureEnvVars.dropboxSignClientId,
    electronicSignatureEnvVars.dropboxSignClientSecret,
    electronicSignatureEnvVars.dropboxSignRedirectUri,
    electronicSignatureEnvVars.dropboxSignWebhookSecret,
    electronicSignatureEnvVars.dropboxSignAccountIdWeatherTech,
    electronicSignatureEnvVars.dropboxSignAccountIdIhc,
  ],
  goHighLevel: [
    goHighLevelEnvVars.privateIntegrationToken,
    goHighLevelEnvVars.weatherTechLocationId,
    goHighLevelEnvVars.ihcLocationId,
  ],
};

export const productionActivationGuides: ProductionActivationGuide[] = [
  {
    id: "twilio",
    label: "Twilio",
    providers: ["twilio"],
    requiredOwnerActions: [
      "Confirm WeatherTech Phoenix, WeatherTech Tucson, and IHC business numbers.",
      "Approve inbound SMS, voice, recording, and status callback URLs.",
      "Complete controlled live-call and SMS tests before enabling outbound messaging.",
    ],
    requiredCredentials: providerGuideEnv.twilio,
    oauthSetup: ["OAuth is not used for this Twilio foundation; signed webhooks and server credentials are required."],
    externalApprovals: ["Twilio account ownership, phone-number ownership, messaging compliance, and sender verification."],
    testingSequence: [
      "Run the existing Twilio readiness check.",
      "Send signed sandbox webhook payloads.",
      "Run controlled live inbound SMS and voice tests.",
      "Enable outbound SMS only in a later owner-approved activation sprint.",
    ],
    rollbackProcedure: [
      "Disable Twilio webhook URLs in Twilio Console.",
      "Set outbound send gates back to false.",
      "Pause saved Twilio connection records if any provider error appears.",
    ],
  },
  {
    id: "gmail",
    label: "Gmail / Google Workspace",
    providers: ["gmail"],
    requiredOwnerActions: [
      "Create or approve the Google Cloud OAuth app.",
      "Authorize the WeatherTech/IHC mailbox accounts.",
      "Approve any Gmail send capability separately from read/import sync.",
    ],
    requiredCredentials: providerGuideEnv.googleWorkspace,
    oauthSetup: [
      "Configure OAuth consent, redirect URI, Gmail read/send/compose scopes, and token encryption before mailbox sync.",
    ],
    externalApprovals: ["Google Cloud OAuth verification may be required before production use."],
    testingSequence: [
      "Run the Google Workspace readiness endpoint.",
      "Complete OAuth with a test mailbox.",
      "Import a small mailbox sample.",
      "Confirm no customer email is sent unless the send gate is explicitly enabled later.",
    ],
    rollbackProcedure: [
      "Revoke Google OAuth tokens.",
      "Pause Gmail integration connection records.",
      "Disable Gmail send gates and clear webhook channels.",
    ],
  },
  {
    id: "google_calendar",
    label: "Google Calendar",
    providers: ["google_calendar"],
    requiredOwnerActions: [
      "Authorize the calendars used for inspections, dispatch, production, and follow-ups.",
      "Map WeatherTech and IHC calendars to approved companies.",
      "Approve write activation separately from discovery/readiness.",
    ],
    requiredCredentials: providerGuideEnv.googleWorkspace,
    oauthSetup: ["Use the existing Google Workspace OAuth flow with Calendar scopes."],
    externalApprovals: ["Google OAuth verification may be required before production calendar writes."],
    testingSequence: [
      "Run calendar discovery.",
      "Confirm calendar-company mapping.",
      "Run a write-disabled event sync validation.",
      "Enable writes only after owner-approved activation.",
    ],
    rollbackProcedure: [
      "Disable Google Calendar write gate.",
      "Pause affected calendar connection records.",
      "Remove webhook channels from Google Cloud if configured.",
    ],
  },
  {
    id: "google_business_profile",
    label: "Google Business Profile",
    providers: ["google_business_profile"],
    requiredOwnerActions: [
      "Confirm Google Business Profile API project approval.",
      "Map WeatherTech Phoenix, WeatherTech Tucson, and IHC locations.",
      "Approve review-response behavior separately from read/lead intake.",
    ],
    requiredCredentials: providerGuideEnv.googleBusinessProfile,
    oauthSetup: ["Configure Google Business Profile OAuth, account/location scopes, and Pub/Sub readiness."],
    externalApprovals: ["Business Profile API access and Pub/Sub setup are required."],
    testingSequence: [
      "Run dry-run Google Business Profile lead intake.",
      "Validate account/location mapping.",
      "Verify duplicate prevention and Customer 360 activity.",
      "Enable live sync only after signed owner acceptance.",
    ],
    rollbackProcedure: [
      "Disable Google Business Profile sync and review-reply gates.",
      "Pause connection records.",
      "Remove Pub/Sub subscriptions if live notifications were configured.",
    ],
  },
  {
    id: "yelp",
    label: "Yelp",
    providers: ["yelp"],
    requiredOwnerActions: [
      "Confirm Yelp partner/API access path.",
      "Map WeatherTech Phoenix, WeatherTech Tucson, and IHC business IDs.",
      "Approve lead conversation/reply behavior only after partner access is verified.",
    ],
    requiredCredentials: providerGuideEnv.yelp,
    oauthSetup: ["Configure Yelp OAuth/client credentials only after official partner access is available."],
    externalApprovals: ["Yelp partner or approved business access is required for live lead conversations."],
    testingSequence: [
      "Run dry-run Yelp lead intake.",
      "Validate account routing and duplicate prevention.",
      "Run signed endpoint tests.",
      "Keep live sync disabled until Yelp access and owner approval are complete.",
    ],
    rollbackProcedure: [
      "Disable Yelp live sync and outbound messaging gates.",
      "Pause Yelp connection records.",
      "Remove live webhook subscriptions if configured later.",
    ],
  },
  {
    id: "website",
    label: "Website",
    providers: ["website_forms"],
    requiredOwnerActions: [
      "Approve production website domains and source IDs.",
      "Install signed form posting from each WeatherTech/IHC website.",
      "Approve abuse/rate-limit thresholds before public launch.",
    ],
    requiredCredentials: providerGuideEnv.website,
    oauthSetup: ["OAuth is not required; signed server-to-server form delivery is required."],
    externalApprovals: ["Website administrator access and DNS/domain ownership are required."],
    testingSequence: [
      "Run website dry-run payload tests.",
      "Validate HMAC signature and origin checks.",
      "Confirm leads attach to existing customers or create exactly one lead.",
      "Enable production source IDs only after owner acceptance.",
    ],
    rollbackProcedure: [
      "Disable website intake gates.",
      "Remove form endpoint wiring from websites.",
      "Rotate signing secrets if a website integration is compromised.",
    ],
  },
  {
    id: "quickbooks",
    label: "QuickBooks Online",
    providers: ["quickbooks_online"],
    requiredOwnerActions: [
      "Approve the Intuit app and OAuth consent.",
      "Map WeatherTech and IHC realm IDs.",
      "Approve income/deposit account mappings before any accounting writes.",
    ],
    requiredCredentials: providerGuideEnv.quickbooks,
    oauthSetup: ["Configure Intuit OAuth and Accounting API scope before sandbox tests."],
    externalApprovals: ["Intuit app setup, QuickBooks company admin consent, and webhook verifier configuration."],
    testingSequence: [
      "Run QuickBooks foundation tests.",
      "Validate customer, estimate, invoice, and payment mapping drafts in sandbox.",
      "Confirm duplicate prevention and rollback behavior.",
      "Enable sync/accounting writes only in a later owner-approved activation sprint.",
    ],
    rollbackProcedure: [
      "Disable QuickBooks sync, accounting write, and payment-processing gates.",
      "Pause QuickBooks connection records.",
      "Revoke Intuit OAuth tokens if live testing is stopped.",
    ],
  },
  {
    id: "electronic_signatures",
    label: "Electronic Signatures",
    providers: ["docusign", "dropbox_sign"],
    requiredOwnerActions: [
      "Create or approve DocuSign and Dropbox Sign apps.",
      "Map WeatherTech and IHC provider account IDs.",
      "Approve webhook/callback validation and sandbox signature tests.",
    ],
    requiredCredentials: providerGuideEnv.signatures,
    oauthSetup: [
      "Configure DocuSign OAuth and Dropbox Sign OAuth redirect URIs before any provider request is attempted.",
    ],
    externalApprovals: ["Provider account/API access, sender identity, and webhook validation setup."],
    testingSequence: [
      "Validate local signature request draft mapping.",
      "Run sandbox/test-mode provider flows without production sends.",
      "Verify status callbacks and signed-document retrieval in a later activation sprint.",
      "Enable live requests only after owner approval.",
    ],
    rollbackProcedure: [
      "Disable signature request and provider write gates.",
      "Pause DocuSign/Dropbox Sign connection records.",
      "Keep native signature records intact in WeatherTech OS.",
    ],
  },
];

function stateTone(status: ProductionReadinessState): ProductionReadinessTone {
  if (status === "connected" || status === "ready_for_activation") {
    return "green";
  }

  if (status === "sync_failed") {
    return "red";
  }

  if (
    status === "credentials_required" ||
    status === "oauth_required" ||
    status === "owner_setup_required" ||
    status === "verification_required"
  ) {
    return "amber";
  }

  if (status === "production_disabled") {
    return "blue";
  }

  return "slate";
}

export function productionReadinessStateLabel(status: ProductionReadinessState) {
  const labels: Record<ProductionReadinessState, string> = {
    ready_for_activation: "Ready for activation",
    production_disabled: "Production disabled",
    credentials_required: "Credentials required",
    oauth_required: "OAuth required",
    connected: "Connected",
    sync_failed: "Sync failed",
    owner_setup_required: "Owner setup required",
    verification_required: "Verification required",
  };

  return labels[status];
}

function latestTimestamp(values: Array<string | null | undefined>) {
  const timestamps = values
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter(Number.isFinite);

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
}

function providerStatus(provider: IntegrationProviderReadiness): ProductionReadinessState {
  if (provider.syncState.failed > 0 || provider.syncState.retrying > 0 || provider.healthState === "needs_attention") {
    return "sync_failed";
  }

  if (provider.connectionState === "connected") {
    return "connected";
  }

  if (provider.metadata.supportsOAuth) {
    return "oauth_required";
  }

  if (provider.metadata.requiresCredentials) {
    return "credentials_required";
  }

  return provider.readinessState === "disabled"
    ? "production_disabled"
    : "owner_setup_required";
}

function providerCheck(provider: IntegrationProviderReadiness): ProductionReadinessCheck {
  const status = providerStatus(provider);

  return {
    id: `provider-${provider.metadata.id}`,
    label: provider.metadata.label,
    status,
    tone: stateTone(status),
    summary: `${integrationReadinessStateLabel(provider.readinessState)}; ${integrationHealthStateLabel(provider.healthState)}. ${provider.connectionSummary}`,
    requiredActions: [
      provider.metadata.requiresCredentials
        ? "Verify required server-side credentials and account routing."
        : "Verify provider-specific setup requirements.",
      provider.metadata.supportsOAuth
        ? "Complete OAuth consent and token storage validation before activation."
        : "Complete signed webhook or API credential validation before activation.",
      "Run provider-specific sandbox or dry-run validation.",
    ],
    evidence: [
      `Connection: ${provider.connectionState}`,
      `Health: ${provider.healthState}`,
      `Sync logs: ${provider.syncState.total}`,
      `Last activity: ${provider.syncState.lastActivityAt ?? "Not recorded"}`,
    ],
  };
}

function subsystemCheck(
  id: string,
  label: string,
  count: number,
  summary: string,
  requiredActions: string[] = ["Run targeted workflow validation before deployment."],
): ProductionReadinessCheck {
  const status: ProductionReadinessState = count > 0 ? "ready_for_activation" : "verification_required";

  return {
    id,
    label,
    status,
    tone: stateTone(status),
    summary,
    requiredActions,
    evidence: [`Visible records: ${count}`],
  };
}

function countProvidersByStatus(
  checks: ProductionReadinessCheck[],
  status: ProductionReadinessState,
) {
  return checks.filter((check) => check.status === status).length;
}

function buildEnvironmentStatus(): ProductionReadinessCheck {
  const expectedNames = Array.from(
    new Set([
      ...providerGuideEnv.twilio,
      ...providerGuideEnv.googleWorkspace,
      ...providerGuideEnv.googleBusinessProfile,
      ...providerGuideEnv.yelp,
      ...providerGuideEnv.website,
      ...providerGuideEnv.goHighLevel,
      ...providerGuideEnv.quickbooks,
      ...providerGuideEnv.signatures,
    ]),
  ).sort();

  return {
    id: "environment",
    label: "Environment status",
    status: "credentials_required",
    tone: "amber",
    summary:
      "Server-side environment variables must be verified in hosting before production activation. Browser code does not inspect or expose secrets.",
    requiredActions: [
      "Populate provider secrets in the production hosting environment only.",
      "Verify no provider secret uses a NEXT_PUBLIC_ prefix.",
      "Run provider readiness checks after deployment variables are configured.",
    ],
    evidence: [`Expected server-side variables tracked: ${expectedNames.length}`],
  };
}

function buildMigrationStatus(): ProductionReadinessCheck {
  return {
    id: "migrations",
    label: "Required migrations",
    status: "verification_required",
    tone: "amber",
    summary:
      "Repository migrations must be applied and verified against the correct WeatherTech OS Supabase project before deployment.",
    requiredActions: [
      "Confirm remote Supabase migration history through the verified CLI link.",
      `Verify ${latestRequiredMigration} and all prior migrations are recorded as applied.`,
      "Run runtime RLS and live data smoke validation after migration deployment.",
    ],
    evidence: [`Latest repository migration: ${latestRequiredMigration}`],
  };
}

function buildDatabaseStatus(snapshot: CrmSnapshot): ProductionReadinessCheck {
  const coreRecordCount =
    snapshot.companies.length +
    snapshot.customers.length +
    snapshot.leads.length +
    snapshot.jobs.length +
    snapshot.estimates.length +
    snapshot.documents.length;

  return {
    id: "database",
    label: "Database readiness",
    status: coreRecordCount > 0 ? "ready_for_activation" : "verification_required",
    tone: coreRecordCount > 0 ? "green" : "amber",
    summary:
      coreRecordCount > 0
        ? "Core CRM records are loading through the existing snapshot."
        : "No core CRM records are visible in the current snapshot.",
    requiredActions: [
      "Verify the production Supabase project reference before deployment.",
      "Run live RLS smoke tests for internal, portal, and anonymous access boundaries.",
      "Confirm backup and point-in-time recovery expectations with the owner.",
    ],
    evidence: [
      `Companies: ${snapshot.companies.length}`,
      `Customers: ${snapshot.customers.length}`,
      `Leads: ${snapshot.leads.length}`,
      `Jobs: ${snapshot.jobs.length}`,
      `Estimates: ${snapshot.estimates.length}`,
      `Documents: ${snapshot.documents.length}`,
    ],
  };
}

function buildSubsystemChecks(snapshot: CrmSnapshot): ProductionReadinessCheck[] {
  return [
    subsystemCheck("crm", "CRM", snapshot.customers.length + snapshot.leads.length, "Customers and leads are available through the existing CRM snapshot."),
    subsystemCheck("customer-360", "Customer 360", snapshot.customers.length, "Customer workspace can render when customers exist."),
    subsystemCheck("dashboard", "Dashboard", snapshot.companies.length, "Dashboard is backed by the company-scoped CRM snapshot."),
    subsystemCheck("office-operations", "Office Operations", snapshot.jobs.length + snapshot.estimates.length + snapshot.inspections.length, "Operations queues can derive work from jobs, estimates, and inspections."),
    subsystemCheck("dispatch", "Dispatch", snapshot.jobs.length + snapshot.scheduleEvents.length, "Dispatch uses jobs and schedule events already present in the snapshot."),
    subsystemCheck("inspections", "Inspections", snapshot.inspections.length, "Inspection records are available when the inspections migration is applied."),
    subsystemCheck("jobs", "Jobs", snapshot.jobs.length, "Job production records are available in the existing workspace."),
    subsystemCheck("documents", "Documents", snapshot.documents.length, "Document Center reads existing document records and signature status."),
    subsystemCheck("customer-portal", "Customer Portal", snapshot.customers.length + snapshot.jobs.length + snapshot.documents.length, "Portal workspace has internal preview data; real portal access remains an owner setup item.", [
      "Verify customer portal authentication and company/customer isolation before public access.",
      "Confirm which documents/photos are customer-visible.",
    ]),
    subsystemCheck("financial", "Financial workspace", snapshot.invoices.length + snapshot.payments.length, "Financial workspace reads invoices and payments from the existing snapshot.", [
      "Confirm QuickBooks remains disabled until owner-approved activation.",
      "Run invoice/payment workflow validation before launch.",
    ]),
  ];
}

function buildIntegrationStatus(providerChecks: ProductionReadinessCheck[]): ProductionReadinessCheck {
  const failed = countProvidersByStatus(providerChecks, "sync_failed");
  const connected = countProvidersByStatus(providerChecks, "connected");
  const blocked =
    countProvidersByStatus(providerChecks, "credentials_required") +
    countProvidersByStatus(providerChecks, "oauth_required") +
    countProvidersByStatus(providerChecks, "owner_setup_required");
  const status: ProductionReadinessState = failed
    ? "sync_failed"
    : blocked
      ? "production_disabled"
      : connected === providerChecks.length
        ? "connected"
        : "ready_for_activation";

  return {
    id: "integrations",
    label: "Integration readiness",
    status,
    tone: stateTone(status),
    summary:
      "Provider foundations are registered, but live activation remains disabled until credentials, OAuth, webhooks, and owner approval are complete.",
    requiredActions: [
      "Complete each provider activation guide.",
      "Run sandbox or dry-run tests before production credentials are enabled.",
      "Confirm rollback steps for every provider before live activation.",
    ],
    evidence: [
      `Providers checked: ${providerChecks.length}`,
      `Connected records: ${connected}`,
      `Provider errors/retries: ${failed}`,
      `Credential/OAuth blockers: ${blocked}`,
    ],
  };
}

function buildDeploymentChecklist(
  environmentStatus: ProductionReadinessCheck,
  migrationStatus: ProductionReadinessCheck,
  databaseStatus: ProductionReadinessCheck,
  integrationStatus: ProductionReadinessCheck,
  providerChecks: ProductionReadinessCheck[],
): ProductionChecklistGroup[] {
  const providerErrorCount = countProvidersByStatus(providerChecks, "sync_failed");

  return [
    {
      id: "database",
      label: "Database and Supabase",
      items: [
        migrationStatus,
        databaseStatus,
        {
          id: "authentication",
          label: "Authentication",
          status: "verification_required",
          tone: "amber",
          summary: "Production authentication must be validated with owner/admin, staff, portal, and anonymous access boundaries before launch.",
          requiredActions: [
            "Verify internal owner/admin and staff sign-in.",
            "Verify portal roles cannot access internal CRM records.",
            "Verify anonymous users cannot access CRM data.",
          ],
          evidence: ["Authentication behavior is preserved; deployment validation remains required."],
        },
        {
          id: "supabase-rls",
          label: "Supabase and RLS validation",
          status: "verification_required",
          tone: "amber",
          summary: "Company access policies must be verified against the live project after migration deployment.",
          requiredActions: [
            "Run the security/company-access policy test.",
            "Verify anonymous users cannot read CRM data.",
            "Verify WeatherTech and IHC company boundaries.",
          ],
          evidence: ["Security hardening foundation exists; runtime deployment verification remains required."],
        },
      ],
    },
    {
      id: "integrations",
      label: "Integrations and credentials",
      items: [
        environmentStatus,
        integrationStatus,
        {
          id: "oauth",
          label: "OAuth configuration",
          status: "oauth_required",
          tone: "amber",
          summary: "Google, GBP, QuickBooks, DocuSign, Dropbox Sign, Yelp, and future providers require owner-controlled OAuth or provider setup.",
          requiredActions: [
            "Configure redirect URIs in each provider console.",
            "Verify token storage and callback validation.",
            "Run provider-specific sandbox tests.",
          ],
          evidence: ["No production OAuth credentials are committed or enabled."],
        },
      ],
    },
    {
      id: "operations",
      label: "Documents, portal, financial, communications, and website",
      items: [
        {
          id: "documents",
          label: "Documents and signatures",
          status: "production_disabled",
          tone: "blue",
          summary: "Native documents/signatures exist; provider signature delivery and upload activation remain disabled.",
          requiredActions: [
            "Confirm required document workflows.",
            "Verify customer-visible document rules.",
            "Activate DocuSign/Dropbox Sign only after sandbox validation.",
          ],
          evidence: ["Document and electronic signature foundations are present."],
        },
        {
          id: "communications",
          label: "Communications",
          status: providerErrorCount ? "sync_failed" : "production_disabled",
          tone: providerErrorCount ? "red" : "blue",
          summary: "Inbox and provider activity foundations exist; live outbound SMS/email remain disabled.",
          requiredActions: [
            "Complete Twilio and Gmail activation guides.",
            "Verify no customer messages can send until approved gates are enabled.",
            "Run live smoke tests with owner-approved test contacts only.",
          ],
          evidence: [`Provider sync failures/retries visible: ${providerErrorCount}`],
        },
        {
          id: "website",
          label: "Website intake",
          status: "production_disabled",
          tone: "blue",
          summary: "Signed website intake foundation exists, but production websites are not connected by this sprint.",
          requiredActions: [
            "Install signed forms on approved production sites.",
            "Verify domains, source IDs, HMAC signing, and dry-run intake.",
            "Enable production source IDs only after acceptance.",
          ],
          evidence: ["Website lead intake endpoint and dry-run validation exist."],
        },
      ],
    },
    {
      id: "operations-readiness",
      label: "Monitoring, backups, and launch control",
      items: [
        {
          id: "monitoring",
          label: "Monitoring",
          status: "owner_setup_required",
          tone: "amber",
          summary: "Production monitoring and alert ownership must be configured outside this repository before broad rollout.",
          requiredActions: [
            "Choose uptime and error monitoring destinations.",
            "Configure provider webhook failure alerts.",
            "Document escalation owner and alert schedule.",
          ],
          evidence: ["No monitoring provider is activated by this sprint."],
        },
        {
          id: "backups",
          label: "Backups and rollback",
          status: "owner_setup_required",
          tone: "amber",
          summary: "Supabase backup/PITR expectations and provider rollback steps must be verified before activation.",
          requiredActions: [
            "Confirm Supabase backup and restore plan.",
            "Confirm migration rollback/runbook procedure.",
            "Keep every provider activation reversible through disabled gates.",
          ],
          evidence: ["Provider guides include rollback steps."],
        },
        {
          id: "browser-regression",
          label: "Browser regression status",
          status: "verification_required",
          tone: "amber",
          summary: "A deployment candidate must have a fresh full signed-in browser regression result recorded.",
          requiredActions: [
            "Run full signed-in regression after final deployment candidate build.",
            "Confirm no console-breaking errors.",
            "Clean all disposable test records.",
          ],
          evidence: ["This center records the requirement; runtime regression is run by Codex during sprint validation."],
        },
      ],
    },
  ];
}

function buildBlockers(
  providerChecks: ProductionReadinessCheck[],
  migrationStatus: ProductionReadinessCheck,
) {
  const blockers = [
    "Production deployment has not been run from this sprint.",
    "Live provider credentials are not configured or verified in this repository.",
    "Live integrations remain disabled by design.",
    "Owner must verify production Supabase migration history before activation.",
  ];

  const failedProviders = providerChecks
    .filter((check) => check.status === "sync_failed")
    .map((check) => check.label);

  if (failedProviders.length) {
    blockers.push(`Provider sync failures need review: ${failedProviders.join(", ")}.`);
  }

  if (migrationStatus.status === "verification_required") {
    blockers.push("Pending migration verification remains required before deployment.");
  }

  return blockers;
}

function calculateScore({
  subsystemChecks,
  providerChecks,
  databaseStatus,
}: {
  subsystemChecks: ProductionReadinessCheck[];
  providerChecks: ProductionReadinessCheck[];
  databaseStatus: ProductionReadinessCheck;
}) {
  const subsystemPoints = subsystemChecks.reduce(
    (total, check) => total + (check.status === "ready_for_activation" ? 4 : 2),
    0,
  );
  const providerPoints = providerChecks.reduce((total, check) => {
    if (check.status === "connected") {
      return total + 4;
    }

    if (check.status === "sync_failed") {
      return total;
    }

    return total + 2;
  }, 0);
  const databasePoints = databaseStatus.status === "ready_for_activation" ? 10 : 5;
  const safetyPoints = 10;
  const maxPoints = subsystemChecks.length * 4 + providerChecks.length * 4 + 20;

  return Math.round(((subsystemPoints + providerPoints + databasePoints + safetyPoints) / maxPoints) * 100);
}

export function buildProductionReadinessCenter(snapshot: CrmSnapshot): ProductionReadinessCenter {
  const providers = buildIntegrationCenterProviders(snapshot).filter((provider) =>
    providerIdsForActivation.has(provider.metadata.id),
  );
  const providerChecks = providers.map(providerCheck);
  const subsystemChecks = buildSubsystemChecks(snapshot);
  const environmentStatus = buildEnvironmentStatus();
  const migrationStatus = buildMigrationStatus();
  const databaseStatus = buildDatabaseStatus(snapshot);
  const integrationStatus = buildIntegrationStatus(providerChecks);
  const deploymentChecklist = buildDeploymentChecklist(
    environmentStatus,
    migrationStatus,
    databaseStatus,
    integrationStatus,
    providerChecks,
  );
  const blockers = buildBlockers(providerChecks, migrationStatus);
  const score = calculateScore({ subsystemChecks, providerChecks, databaseStatus });
  const lastSyncOrActivity = latestTimestamp([
    ...snapshot.integrationSyncLogs.map(
      (log) => log.completed_at ?? log.last_attempted_at ?? log.updated_at,
    ),
    ...snapshot.integrationConnections.map(
      (connection) => connection.last_sync_at ?? connection.updated_at,
    ),
    ...snapshot.leadIntakeRecords.map((record) => record.updated_at),
  ]);

  return {
    score,
    scoreLabel: `${score}%`,
    overallStatus: blockers.length ? "production_disabled" : "ready_for_activation",
    overallSummary:
      "WeatherTech OS has a strong internal operating-system foundation, but production deployment and live integration activation remain gated by owner setup, migration verification, credentials, OAuth, webhooks, monitoring, and final regression evidence.",
    environmentStatus,
    migrationStatus,
    databaseStatus,
    integrationStatus,
    lastValidation: "Current sprint validation must be run before commit and again before deployment.",
    lastRegression: "No deployment telemetry is stored in the app; use the latest signed-in browser regression run from the release checklist.",
    lastMigration: latestRequiredMigration,
    requiredMigrations: [latestRequiredMigration],
    pendingOwnerSetup: Array.from(
      new Set([
        ...productionActivationGuides.flatMap((guide) => guide.requiredOwnerActions),
        "Confirm production monitoring and backup ownership.",
        "Confirm final deployment window and rollback owner.",
      ]),
    ),
    providerChecks,
    subsystemChecks,
    activationGuides: productionActivationGuides,
    deploymentChecklist,
    blockers,
  };
}
