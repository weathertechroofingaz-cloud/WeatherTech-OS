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
import {
  buildPrivateStagingEnvironmentMetadata,
  type DeploymentEnvironmentMetadata,
} from "../deployment/stagingReadiness";

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

export type LaunchControlState =
  | "codex_work_complete"
  | "owner_action_required"
  | "external_approval_required"
  | "oauth_required"
  | "migration_verification_required"
  | "production_url_required"
  | "controlled_testing_required"
  | "blocked"
  | "active"
  | "failed";

export type ProductionActivationStep = {
  id: string;
  order: number;
  label: string;
  status: LaunchControlState;
  summary: string;
  dependencies: string[];
  ownerActions: string[];
  codexResponsibilities: string[];
  evidenceFields: string[];
  nextAction: string;
};

export type ProductionProviderActivationCard = {
  id: string;
  label: string;
  status: LaunchControlState;
  summary: string;
  setupDocumentPath: string;
  requiredBeforeActivation: string[];
  requiredMappings: string[];
  controlledTestPlan: string[];
  rollbackSummary: string[];
  disabledSafetyFlags: string[];
  evidenceFields: string[];
};

export type ProductionCompanyMappingGuidance = {
  id: string;
  label: string;
  company: "WeatherTech Roofing LLC" | "IHC Painting";
  branch: "Phoenix" | "Tucson" | "IHC";
  providerMappings: Array<{
    provider: string;
    mappingLabel: string;
    envVar: string;
    status: LaunchControlState;
  }>;
};

export type ProductionMigrationInventoryItem = {
  id: string;
  filename: string;
  area: string;
  repositoryStatus: "present_in_repository";
  integrityStatus: "included_in_migration_integrity_tests";
  appliedLocallyStatus: "requires_verification";
  remoteStatus: "remote_status_unknown";
  requiredAction: string;
};

export type ProductionEnvironmentVariableStatus =
  | "present"
  | "missing"
  | "invalid"
  | "unknown"
  | "disabled_safely"
  | "enabled_requires_approval";

export type ProductionEnvironmentVariableCheck = {
  name: string;
  classification:
    | "required_before_deployment"
    | "required_before_provider_connection"
    | "optional"
    | "disabled_safety_flag";
  status: ProductionEnvironmentVariableStatus;
  secret: boolean;
  summary: string;
};

export type ProductionEnvironmentGroup = {
  id: string;
  label: string;
  checks: ProductionEnvironmentVariableCheck[];
};

export type ProductionControlledTestPlan = {
  id: string;
  label: string;
  providerCardId: string;
  prerequisites: string[];
  steps: string[];
  expectedEvidence: string[];
  stopConditions: string[];
};

export type ProductionLaunchGate = {
  id: string;
  label: string;
  status: LaunchControlState;
  summary: string;
  requiredEvidence: string[];
  blockingReasons: string[];
};

export type ProductionReadinessCenter = {
  score: number;
  scoreLabel: string;
  overallStatus: ProductionReadinessState;
  overallSummary: string;
  stagingDeploymentMetadata: DeploymentEnvironmentMetadata;
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
  activationSequence: ProductionActivationStep[];
  providerActivationCards: ProductionProviderActivationCard[];
  companyMappingGuidance: ProductionCompanyMappingGuidance[];
  migrationInventory: ProductionMigrationInventoryItem[];
  environmentInventory: ProductionEnvironmentGroup[];
  controlledTestPlans: ProductionControlledTestPlan[];
  launchGates: ProductionLaunchGate[];
  evidenceFields: string[];
  blockers: string[];
};

const latestRequiredMigration =
  "20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql";

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
    twilioEnvVars.weatherTechTucsonVoiceForwardTo,
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
    goHighLevelEnvVars.clientId,
    goHighLevelEnvVars.clientSecret,
    goHighLevelEnvVars.redirectUri,
    goHighLevelEnvVars.marketplaceInstallUrl,
    goHighLevelEnvVars.tokenEncryptionKey,
    goHighLevelEnvVars.syncEnabled,
  ],
  ai: [
    "AI_ENABLED",
    "AI_PROVIDER",
    "AI_MODEL",
    "AI_OPENAI_API_KEY",
    "AI_ANTHROPIC_API_KEY",
    "AI_DAILY_BUDGET_USD",
    "AI_DAILY_REQUEST_LIMIT",
    "AI_PER_USER_DAILY_REQUEST_LIMIT",
    "AI_PER_COMPANY_DAILY_REQUEST_LIMIT",
    "AI_MAX_REQUEST_TOKENS",
    "AI_MAX_RESPONSE_TOKENS",
    "AI_MAX_INPUT_COST_USD_PER_1K_TOKENS",
    "AI_MAX_OUTPUT_COST_USD_PER_1K_TOKENS",
    "AI_TIMEOUT_MS",
    "AI_RETRY_LIMIT",
    "AI_STREAMING_ENABLED",
    "AI_STRUCTURED_OUTPUT_ENABLED",
    "AI_ACTION_EXECUTION_ENABLED",
  ],
  automation: ["CRON_SECRET"],
};

const setupDocumentPaths = {
  twilio: "docs/TWILIO_PHASE_1_SETUP.md",
  googleWorkspace: "docs/GOOGLE_WORKSPACE_PHASE_1_SETUP.md",
  googleCalendar: "docs/GOOGLE_CALENDAR_PHASE_1_SETUP.md",
  googleBusinessProfile: "docs/GOOGLE_BUSINESS_PROFILE_PHASE_1_SETUP.md",
  yelp: "docs/YELP_INTEGRATION_PHASE_1_SETUP.md",
  website: "docs/WEBSITE_INTEGRATION_PHASE_1_SETUP.md",
  quickbooks: "docs/QUICKBOOKS_ONLINE_PHASE_1_SETUP.md",
  signatures: "docs/ELECTRONIC_SIGNATURES_PHASE_1_SETUP.md",
  aiTools: "docs/AI_TOOLS_2_LIVE_PROVIDER_PILOT.md",
  automation: "docs/AUTOMATION_ENGINE.md",
  production: "docs/PRODUCTION_ACTIVATION_READINESS.md",
};

const productionEvidenceFields = [
  "Status",
  "Date checked",
  "Checked by",
  "Test record ID",
  "Provider account or location label",
  "Result",
  "Failure reason",
  "Required next action",
];

const branchMappingGuidance: ProductionCompanyMappingGuidance[] = [
  {
    id: "weathertech-phoenix",
    label: "WeatherTech Roofing LLC - Phoenix",
    company: "WeatherTech Roofing LLC",
    branch: "Phoenix",
    providerMappings: [
      {
        provider: "Twilio",
        mappingLabel: "Phoenix business phone number",
        envVar: twilioEnvVars.weatherTechPhoenixNumber,
        status: "owner_action_required",
      },
      {
        provider: "Website",
        mappingLabel: "Phoenix website source ID",
        envVar: websiteEnvVars.weatherTechPhoenixSourceId,
        status: "owner_action_required",
      },
      {
        provider: "Google Business Profile",
        mappingLabel: "Phoenix GBP location ID",
        envVar: googleBusinessProfileEnvVars.weatherTechPhoenixLocationId,
        status: "owner_action_required",
      },
      {
        provider: "Yelp",
        mappingLabel: "Phoenix Yelp business/account ID",
        envVar: "YELP_ACCOUNT_ID_WEATHERTECH_PHOENIX",
        status: "owner_action_required",
      },
    ],
  },
  {
    id: "weathertech-tucson",
    label: "WeatherTech Roofing LLC - Tucson",
    company: "WeatherTech Roofing LLC",
    branch: "Tucson",
    providerMappings: [
      {
        provider: "Twilio",
        mappingLabel: "Tucson business phone number",
        envVar: twilioEnvVars.weatherTechTucsonNumber,
        status: "owner_action_required",
      },
      {
        provider: "Website",
        mappingLabel: "Tucson website source ID",
        envVar: websiteEnvVars.weatherTechTucsonSourceId,
        status: "owner_action_required",
      },
      {
        provider: "Google Business Profile",
        mappingLabel: "Tucson GBP location ID",
        envVar: googleBusinessProfileEnvVars.weatherTechTucsonLocationId,
        status: "owner_action_required",
      },
      {
        provider: "Yelp",
        mappingLabel: "Tucson Yelp business/account ID",
        envVar: "YELP_ACCOUNT_ID_WEATHERTECH_TUCSON",
        status: "owner_action_required",
      },
    ],
  },
  {
    id: "ihc",
    label: "IHC",
    company: "IHC Painting",
    branch: "IHC",
    providerMappings: [
      {
        provider: "Twilio",
        mappingLabel: "IHC business phone number",
        envVar: twilioEnvVars.ihcNumber,
        status: "owner_action_required",
      },
      {
        provider: "Website",
        mappingLabel: "IHC website source ID",
        envVar: websiteEnvVars.ihcSourceId,
        status: "owner_action_required",
      },
      {
        provider: "Google Business Profile",
        mappingLabel: "IHC GBP location ID",
        envVar: googleBusinessProfileEnvVars.ihcLocationId,
        status: "owner_action_required",
      },
      {
        provider: "QuickBooks Online",
        mappingLabel: "IHC QuickBooks realm ID",
        envVar: quickBooksOnlineEnvVars.ihcRealmId,
        status: "owner_action_required",
      },
      {
        provider: "Yelp",
        mappingLabel: "IHC Yelp business/account ID",
        envVar: "YELP_ACCOUNT_ID_IHC",
        status: "owner_action_required",
      },
    ],
  },
];

const providerMigrationInventory: ProductionMigrationInventoryItem[] = [
  {
    id: "integration-sync-logs",
    filename: "0012_integration_sync_logs.sql",
    area: "Integration logging",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify the production migration history before deployment.",
  },
  {
    id: "website-lead-intake-provider",
    filename: "0014_website_lead_intake_provider.sql",
    area: "Website and provider lead intake",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Confirm website, Yelp, and provider constraints are applied in production.",
  },
  {
    id: "twilio-live-foundation",
    filename: "0021_twilio_live_integration_foundation.sql",
    area: "Twilio",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Confirm Twilio integration metadata exists before live call/SMS tests.",
  },
  {
    id: "gohighlevel-sync-foundation",
    filename: "0022_gohighlevel_sync_foundation.sql",
    area: "GoHighLevel",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Confirm sync-log and conflict fields exist before any automation bridge testing.",
  },
  {
    id: "security-company-access",
    filename: "0024_security_company_access_hardening.sql",
    area: "Security and company isolation",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Run runtime RLS validation before internal pilot.",
  },
  {
    id: "document-storage-signature",
    filename: "0025_document_storage_signature_workflow.sql",
    area: "Documents and signatures",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify document storage and signature status columns before testing provider signatures.",
  },
  {
    id: "gmail-workspace-email",
    filename: "0027_gmail_workspace_email_foundation.sql",
    area: "Gmail / Google Workspace",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify mailbox and email metadata tables before mailbox sync testing.",
  },
  {
    id: "google-calendar-scheduling",
    filename: "0028_google_calendar_scheduling_foundation.sql",
    area: "Google Calendar",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify calendar mapping tables before controlled calendar sync.",
  },
  {
    id: "google-business-profile",
    filename: "0029_google_business_profile_foundation.sql",
    area: "Google Business Profile",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify GBP provider constraints before location/review testing.",
  },
  {
    id: "quickbooks-online",
    filename: "0030_quickbooks_online_foundation.sql",
    area: "QuickBooks Online",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify QuickBooks provider constraints before sandbox accounting tests.",
  },
  {
    id: "electronic-signatures",
    filename: "0031_electronic_signatures_foundation.sql",
    area: "Electronic signatures",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify DocuSign and Dropbox Sign provider constraints before sandbox signature tests.",
  },
  {
    id: "ai-tools-operating-brain",
    filename: "0033_ai_tools_operating_brain.sql",
    area: "AI Tools controlled pilot",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction: "Verify AI saved analyses, audit events, and usage limit tables before controlled live-provider testing.",
  },
  {
    id: "deferred-invariant-trigger-location-backfill-compatibility",
    filename: "20260902024803_scope_deferred_invariant_triggers_for_location_backfill.sql",
    area: "Deferred invariant trigger and location-backfill compatibility",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify the three constraint triggers retain exact functions and deferred INSERT semantics while UPDATE events are limited to their invariant dependency columns.",
  },
  {
    id: "automation-engine-foundation",
    filename: "20260902024804_automation_engine_foundation.sql",
    area: "Central automation engine and company locations",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify company/location RLS, rule controls, event/execution history, retries, and the service-only worker before scheduler activation.",
  },
  {
    id: "gohighlevel-webhook-durable-state-machine",
    filename: "20260902042428_gohighlevel_webhook_durable_state_machine.sql",
    area: "GoHighLevel webhook durability",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify exact delivery identity, leases, bounded retry, terminal receipts, uninstall, and owner requeue before enabling GoHighLevel sync.",
  },
  {
    id: "mighty-apes-legacy-service-routing-correction",
    filename: "20260902043624_mighty_apes_legacy_service_routing_correction.sql",
    area: "Mighty Apes company/location/service routing",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify only authoritative enabled campaign routes can create a correctly scoped company/location/service-scoped lead.",
  },
  {
    id: "gohighlevel-webhook-uninstall-guardrails",
    filename: "20260902044154_gohighlevel_webhook_uninstall_guardrails.sql",
    area: "GoHighLevel uninstall isolation",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify uninstall scope and owner requeue evidence remain exact and company-bound.",
  },
  {
    id: "legacy-lead-dynamic-insert-lint-correction",
    filename: "20260902044714_legacy_lead_dynamic_insert_lint_correction.sql",
    area: "Legacy lead schema compatibility",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify the legacy lead identity path remains compatible without weakening company routing.",
  },
  {
    id: "canonical-lead-dynamic-insert-lint-correction",
    filename: "20260902045112_canonical_lead_dynamic_insert_lint_correction.sql",
    area: "Canonical lead schema compatibility",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify the canonical lead identity path remains compatible without weakening company routing.",
  },
  {
    id: "automation-synthetic-regression-cleanup",
    filename: "20260902053037_automation_synthetic_regression_cleanup.sql",
    area: "Pinned non-Production regression cleanup",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify the cleanup RPC remains unusable outside the exact pinned regression project and synthetic owner graph.",
  },
  {
    id: "automation-synthetic-cleanup-lead-source-correction",
    filename: "20260902054334_automation_synthetic_cleanup_lead_source_correction.sql",
    area: "Pinned regression lead-source cleanup correction",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify exact marked lead sources participate in the guarded cleanup graph and all immutable ledgers return to zero residue.",
  },
  {
    id: "gohighlevel-inbound-automation-bridge",
    filename: "20260902061135_gohighlevel_inbound_automation_bridge.sql",
    area: "GoHighLevel inbound automation bridge",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify only explicitly inbound, matched records from an exact connected same-company GoHighLevel connection emit automation events.",
  },
  {
    id: "legacy-twilio-synthetic-automation-orphan-cleanup",
    filename: "20260902065509_legacy_twilio_synthetic_automation_orphan_cleanup.sql",
    area: "Pinned regression legacy Twilio orphan cleanup",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify the UUID-only orphan cleanup remains restricted to exact absent synthetic lead roots on the pinned regression project.",
  },
  {
    id: "legacy-twilio-browser-voice-orphan-cleanup",
    filename: "20260902071651_legacy_twilio_browser_voice_orphan_cleanup.sql",
    area: "Pinned regression Browser Voice orphan cleanup",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify the 17-digit Browser Voice recovery remains restricted to exact absent synthetic lead roots on the pinned regression project.",
  },
  {
    id: "lead-automation-event-legacy-schema-compatibility",
    filename: "20260902102714_lead_automation_event_legacy_schema_compatibility.sql",
    area: "Lead automation event schema compatibility",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify canonical and legacy lead writes emit exact company/location-scoped automation events without inferring missing identity fields.",
  },
  {
    id: "gohighlevel-reconciliation-automation-transition-fix",
    filename: "20260902134526_gohighlevel_reconciliation_automation_transition_fix.sql",
    area: "GoHighLevel reconciliation automation transition fix",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify unmatched inbound SMS and missed-call rows emit exactly once only after an exact same-company connected GoHighLevel reconciliation changes them to matched.",
  },
  {
    id: "gohighlevel-reconciliation-event-recovery-twilio-compatibility",
    filename:
      "20260902140838_gohighlevel_reconciliation_event_recovery_twilio_compatibility.sql",
    area: "GoHighLevel reconciliation recovery and Twilio compatibility",
    repositoryStatus: "present_in_repository",
    integrityStatus: "included_in_migration_integrity_tests",
    appliedLocallyStatus: "requires_verification",
    remoteStatus: "remote_status_unknown",
    requiredAction:
      "Verify a previously invalid matched GoHighLevel row emits exactly once after its binding is corrected, while Twilio SMS remains insert-only and Twilio calls emit on missed-status transitions only.",
  },
];

export function launchControlStateLabel(status: LaunchControlState) {
  const labels: Record<LaunchControlState, string> = {
    codex_work_complete: "Codex work complete",
    owner_action_required: "Owner action required",
    external_approval_required: "External approval required",
    oauth_required: "OAuth required",
    migration_verification_required: "Migration verification required",
    production_url_required: "Production URL required",
    controlled_testing_required: "Controlled testing required",
    blocked: "Blocked",
    active: "Active",
    failed: "Failed",
  };

  return labels[status];
}

export const productionActivationGuides: ProductionActivationGuide[] = [
  {
    id: "twilio",
    label: "Twilio",
    providers: ["twilio"],
    requiredOwnerActions: [
      "Verify each company-controlled Twilio number before creating its exact active company mapping.",
      "Configure the signed inbound SMS callback URL for each mapped number.",
      "Complete one controlled live inbound SMS test before marking inbound messaging validated.",
      "Keep the verified assistant terminal and its protected attestation Tucson-only; never reuse that destination or attestation for another route.",
      "Keep Tucson on its verified assistant through the protected destination and route-specific gate; do not change its existing Twilio Voice or SMS webhook.",
      "Keep WeatherTech Phoenix voice on its existing Verizon line and IHC voice on its existing AT&T line, without carrier forwarding to Twilio.",
      "Leave the Phoenix and IHC Twilio ingress Voice handling blank; those numbers remain SMS-only WeatherTech OS identities.",
      "Approve any future real Tucson validation call separately after configuration is verified.",
    ],
    requiredCredentials: providerGuideEnv.twilio,
    oauthSetup: ["OAuth is not used for this Twilio foundation; signed webhooks and server credentials are required."],
    externalApprovals: ["Twilio account ownership, phone-number ownership, messaging compliance, and sender verification."],
      testingSequence: [
      "Run the existing Twilio readiness check.",
      "Send signed sandbox webhook payloads.",
      "Run one controlled live inbound SMS test for each company actually mapped.",
      "Run the provider-isolated Tucson voice lifecycle with the Tucson gate and attestation disabled outside the fixture.",
      "Verify the protected Tucson destination, exact sms_voice route, loop refusal against every configured Twilio ingress, and Phoenix/IHC voice rejection without placing a call.",
      "Verify Phoenix and IHC remain exact SMS-only routes with blank Twilio Voice handling.",
      "Enable outbound SMS only in a later owner-approved activation sprint.",
    ],
    rollbackProcedure: [
      "For Tucson rollback, disable its gate before repairing the protected terminal; do not alter its existing Twilio webhook or SMS route.",
      "Keep Phoenix and IHC on direct carrier voice with their Twilio Voice handling blank.",
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
      "Keep the verified Mighty Apes Phoenix campaign enabled only through its exact company/location registry route.",
      "Provide the authoritative Mighty Apes campaign IDs for WeatherTech Tucson and IHC before either route is individually enabled.",
      "Use Mighty Apes Send Test Delivery for audit-only lead.test evidence, then observe the first real lead.created exactly once.",
      "Treat direct Yelp API/OAuth and any lead conversation or reply behavior as a separate partner-access approval path.",
    ],
    requiredCredentials: providerGuideEnv.yelp,
    oauthSetup: [
      "Mighty Apes inbound delivery uses the server-only HMAC secret and company/location campaign registry; OAuth is not used.",
      "Configure Yelp OAuth/client credentials only if separate official direct-Yelp partner access is later approved.",
    ],
    externalApprovals: [
      "Mighty Apes must supply the authoritative Tucson and IHC campaign identities and send the official test delivery.",
      "Yelp partner or approved business access is separately required for direct API lead conversations.",
    ],
    testingSequence: [
      "Verify the canonical /api/integrations/mighty-apes/webhook receiver and its compatibility alias use the same signed handler.",
      "Send lead.test through Mighty Apes and prove it records audit evidence without creating a CRM lead or workflow.",
      "Observe the first real lead.created and prove exact company/location routing, service classification, and exactly-once CRM automation.",
      "Keep unknown, disabled, Tucson, and IHC campaign identities fail-closed until each authoritative mapping is supplied and enabled.",
    ],
    rollbackProcedure: [
      "Disable the affected Mighty Apes campaign-registry row or rotate/remove its inbound secret and redeploy.",
      "Keep Yelp direct live sync and outbound messaging gates disabled.",
      "Preserve durable audit and CRM evidence; do not delete it as a rollback shortcut.",
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
  {
    id: "ai-tools",
    label: "AI Command Center 3.0",
    providers: [],
    requiredOwnerActions: [
      "Approve the AI provider, model, and authorized internal users.",
      "Configure server-only AI credentials in the approved hosting environment.",
      "Approve strict budget, request, token, timeout, retry, and audit controls before Production use.",
    ],
    requiredCredentials: providerGuideEnv.ai,
    oauthSetup: [
      "OAuth is not used by the current AI provider adapter; server-side provider API keys and disabled external-action gates are required.",
    ],
    externalApprovals: [
      "Provider account access, data-usage review, migration verification, and the owner-approved internal-use boundary are required.",
    ],
    testingSequence: [
      "Verify migrations 0033 and the centralized automation foundation in the exact Supabase project.",
      "Set provider credentials and limits in the server runtime.",
      "Run grounded prompts against one exact authorized company at a time.",
      "Verify per-preview audit logging, prompt-safety blocking, and exact target validation.",
      "Verify only reviewed safe internal follow-up tasks can enter the automation engine.",
    ],
    rollbackProcedure: [
      "Set AI_ENABLED=false.",
      "Remove provider API keys from the hosting environment.",
      "Keep AI_ACTION_EXECUTION_ENABLED=false.",
      "Disable the AI-reviewed internal follow-up rule if its bounded execution path must be paused.",
    ],
  },
  {
    id: "automation-engine",
    label: "Automation Engine",
    providers: [],
    requiredOwnerActions: [
      "Use the Automation Control Center to keep only intended internal rules enabled.",
      "Approve any future customer-facing automation rule separately before it is implemented or activated.",
    ],
    requiredCredentials: providerGuideEnv.automation,
    oauthSetup: [
      "OAuth is not used. The scheduler uses a server-only random CRON_SECRET and a service-role-only bounded worker RPC.",
    ],
    externalApprovals: [
      "No provider approval is required for internal office-task actions. Customer-facing and provider actions remain outside the executable action registry.",
    ],
    testingSequence: [
      "Apply the exact automation migration to the isolated regression project.",
      "Prove company/location isolation, rule disablement, idempotency, approval, retry, cancellation, and zero residue.",
      "Verify the scheduler secret is server-only and at least 32 random characters.",
      "Verify one due safe internal rule produces exactly one existing office-task record and no provider request.",
    ],
    rollbackProcedure: [
      "Disable the affected rule in the Automation Control Center.",
      "Remove or rotate CRON_SECRET and redeploy to pause scheduled processing globally.",
      "Preserve the immutable event, execution, attempt, and audit history.",
      "Do not delete CRM or office-task records as a rollback shortcut.",
    ],
  },
];

const baseActivationSequence: ProductionActivationStep[] = [
  {
    id: "repository-release-checkpoint",
    order: 1,
    label: "Repository and release checkpoint",
    status: "codex_work_complete",
    summary: "Code must be committed, pushed, validated, and clean before deployment planning begins.",
    dependencies: ["Approved sprint scope", "Clean working tree", "Local main equals origin/main"],
    ownerActions: ["Review the final sprint summary and approve the deployment candidate."],
    codexResponsibilities: ["Run build, type-check, lint, browser regression, and final Git synchronization checks."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Use the latest pushed commit as the only deployment candidate.",
  },
  {
    id: "supabase-migration-validation",
    order: 2,
    label: "Supabase production migration validation",
    status: "migration_verification_required",
    summary: "Provider and security migrations must be verified against the correct WeatherTech OS Supabase project before deployment.",
    dependencies: ["Repository checkpoint", "Verified Supabase project reference", "No pending migration history conflicts"],
    ownerActions: ["Authorize the production migration verification window."],
    codexResponsibilities: ["Use the documented Supabase CLI path only after the project is positively verified."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Verify remote migration history; do not apply migrations from this workspace.",
  },
  {
    id: "authentication-redirects",
    order: 3,
    label: "Authentication and redirect configuration",
    status: "owner_action_required",
    summary: "Production auth URLs and OAuth redirects depend on the final production URL.",
    dependencies: ["Supabase migration validation", "Production URL selected"],
    ownerActions: ["Confirm allowed auth redirect URLs for the production domain."],
    codexResponsibilities: ["Document required redirect paths without committing credentials."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Configure production auth URLs after the deployment URL is known.",
  },
  {
    id: "production-deployment",
    order: 4,
    label: "Vercel or approved production deployment",
    status: "production_url_required",
    summary: "A real deployment is needed before webhooks, OAuth callbacks, and live provider tests can be configured.",
    dependencies: ["Repository checkpoint", "Production build", "Owner-approved deployment provider"],
    ownerActions: ["Connect the approved hosting project and set production environment variables."],
    codexResponsibilities: ["Provide the readiness checklist and verify no deployment occurred in this sprint."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Deploy only in a separate owner-controlled deployment step.",
  },
  {
    id: "custom-url",
    order: 5,
    label: "Custom production URL",
    status: "production_url_required",
    summary: "Provider callback URLs, webhook endpoints, website form posting, and OAuth apps require a stable HTTPS production URL.",
    dependencies: ["Production deployment"],
    ownerActions: ["Approve domain, DNS, SSL, and final callback base URL."],
    codexResponsibilities: ["Keep callback path documentation aligned with existing provider setup docs."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Record the production URL before configuring provider consoles.",
  },
  {
    id: "monitoring-backups-rollback",
    order: 6,
    label: "Monitoring, backups, and rollback",
    status: "owner_action_required",
    summary: "Launch must have error monitoring, Supabase backup expectations, rollback owner, and release owner before internal pilot.",
    dependencies: ["Production deployment", "Supabase project verification"],
    ownerActions: ["Assign monitoring destination, backup expectations, rollback owner, release owner, and launch window."],
    codexResponsibilities: ["Keep rollback instructions non-destructive and provider-specific."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Record owner and rollback evidence before provider activation.",
  },
  {
    id: "twilio",
    order: 7,
    label: "Twilio",
    status: "controlled_testing_required",
    summary: "Call and SMS testing requires production URLs, Twilio account access, business-number mapping, and outbound gates disabled until approval.",
    dependencies: ["Production URL", "Webhook URL", "Company number mapping", "Controlled test contacts"],
    ownerActions: ["Sign into Twilio, confirm numbers, configure callbacks, and approve controlled inbound tests."],
    codexResponsibilities: ["Verify Customer 360 activity and duplicate prevention using controlled records only."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Run controlled inbound call/SMS tests before any outbound enablement.",
  },
  {
    id: "gmail",
    order: 8,
    label: "Gmail / Google Workspace",
    status: "oauth_required",
    summary: "Mailbox sync requires Google Cloud OAuth setup, authorized mailbox mapping, and send gates disabled until explicit approval.",
    dependencies: ["Production URL", "Google Cloud OAuth app", "Mailbox mapping"],
    ownerActions: ["Approve Google Cloud OAuth app and connect a controlled mailbox."],
    codexResponsibilities: ["Validate import/matching without sending customer email."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Connect a test mailbox and validate controlled email intake.",
  },
  {
    id: "google-calendar",
    order: 9,
    label: "Google Calendar",
    status: "oauth_required",
    summary: "Calendar sync requires the same production OAuth base URL and approved company-calendar mappings.",
    dependencies: ["Production URL", "Google Workspace OAuth", "Calendar mapping"],
    ownerActions: ["Authorize a controlled calendar for inspections and production scheduling."],
    codexResponsibilities: ["Validate no duplicate event creation during controlled sync tests."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Sync one controlled inspection and reschedule it without duplication.",
  },
  {
    id: "website-lead-capture",
    order: 10,
    label: "Website lead capture",
    status: "controlled_testing_required",
    summary: "Website forms require production URL, HMAC signing, allowed origins, branch source IDs, and abuse controls.",
    dependencies: ["Production URL", "Website admin access", "Signing secret", "Source mapping"],
    ownerActions: ["Install signed test form posts on approved WeatherTech/IHC domains."],
    codexResponsibilities: ["Verify attribution, routing, follow-up, and duplicate handling."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Submit one controlled signed test form per approved website source.",
  },
  {
    id: "yelp",
    order: 11,
    label: "Yelp",
    status: "external_approval_required",
    summary:
      "Mighty Apes inbound lead intake uses a signed company/location campaign registry: the verified Phoenix route is seeded, while Tucson and IHC remain fail-closed until their authoritative campaign IDs are supplied. Direct Yelp API/OAuth remains a separate disabled path.",
    dependencies: [
      "Mighty Apes signing secret",
      "Authoritative per-branch campaign IDs",
      "Official lead.test delivery",
      "First real lead.created evidence",
    ],
    ownerActions: [
      "Obtain the authoritative Tucson and IHC campaign IDs from Mighty Apes and use the provider's Send Test Delivery control.",
    ],
    codexResponsibilities: [
      "Keep lead.test audit-only, enforce exact company/location routing and deduplication, and keep unknown campaigns plus outbound Yelp behavior disabled.",
    ],
    evidenceFields: productionEvidenceFields,
    nextAction:
      "Validate the seeded Phoenix route with an official audit-only provider test; add Tucson or IHC only after each authoritative campaign identity is supplied.",
  },
  {
    id: "google-business-profile",
    order: 12,
    label: "Google Business Profile",
    status: "external_approval_required",
    summary: "GBP requires authorized accounts, location IDs, approved API access, OAuth, and Pub/Sub readiness.",
    dependencies: ["Production URL", "GBP API access", "Location mapping", "Pub/Sub setup"],
    ownerActions: ["Authorize GBP accounts and confirm WeatherTech Phoenix, Tucson, and IHC location IDs."],
    codexResponsibilities: ["Keep replies and unsupported messaging disabled."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Validate account/location discovery before accepting live activity.",
  },
  {
    id: "quickbooks-online",
    order: 13,
    label: "QuickBooks Online",
    status: "controlled_testing_required",
    summary: "QuickBooks activation starts in sandbox and must not create production accounting records without separate approval.",
    dependencies: ["Production URL", "Intuit OAuth app", "Realm ID mapping", "Sandbox company"],
    ownerActions: ["Approve Intuit app, sandbox company, and WeatherTech/IHC realm mapping."],
    codexResponsibilities: ["Validate customer, estimate, invoice, and payment mapping drafts only."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Use a sandbox company and keep accounting writes disabled.",
  },
  {
    id: "electronic-signatures",
    order: 14,
    label: "Electronic signatures",
    status: "controlled_testing_required",
    summary: "DocuSign and Dropbox Sign require sandbox OAuth, account mapping, webhooks, and provider writes disabled until approval.",
    dependencies: ["Production URL", "Provider sandbox", "Account mapping", "Webhook validation"],
    ownerActions: ["Approve DocuSign/Dropbox Sign app setup and sandbox sender identity."],
    codexResponsibilities: ["Validate signature request mapping without real customer sends."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Run sandbox signature status tests before any live signature request.",
  },
  {
    id: "customer-portal",
    order: 15,
    label: "Customer portal, if owner-approved",
    status: "owner_action_required",
    summary: "Customer portal activation remains optional and must wait for customer-visible data rules and portal access validation.",
    dependencies: ["Authentication verification", "Document visibility rules", "Owner approval"],
    ownerActions: ["Approve whether the portal enters pilot and which customers may access it."],
    codexResponsibilities: ["Verify customer isolation and visibility rules before any external access."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Keep portal public access blocked until owner approval.",
  },
  {
    id: "internal-pilot",
    order: 16,
    label: "Controlled internal pilot",
    status: "blocked",
    summary: "Internal pilot is blocked until migrations, auth, production URL, rollback, backups, monitoring, and controlled provider tests pass.",
    dependencies: ["All prior gates", "Controlled test evidence", "Owner pilot approval"],
    ownerActions: ["Name pilot users, launch window, rollback owner, and acceptance criteria."],
    codexResponsibilities: ["Confirm no critical regression failures and no live customer automation surprises."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Start only after the launch gates report ready for internal pilot.",
  },
  {
    id: "final-production-approval",
    order: 17,
    label: "Final production-use approval",
    status: "blocked",
    summary: "Daily production use must remain blocked until the owner explicitly approves it after controlled pilot evidence.",
    dependencies: ["Internal pilot evidence", "Owner approval", "Provider rollback confidence"],
    ownerActions: ["Approve daily production use in writing after reviewing pilot evidence."],
    codexResponsibilities: ["Do not auto-approve production use."],
    evidenceFields: productionEvidenceFields,
    nextAction: "Wait for explicit owner approval after pilot review.",
  },
];

function buildProviderActivationCards(): ProductionProviderActivationCard[] {
  return [
    {
      id: "supabase",
      label: "Supabase",
      status: "migration_verification_required",
      summary: "Database, RLS, auth, storage, and migration history must be verified against the correct production project before deployment.",
      setupDocumentPath: setupDocumentPaths.production,
      requiredBeforeActivation: [
        "Correct project reference verified",
        "Remote migration history verified",
        "Company-access RLS runtime tests passed",
        "Backups and rollback owner confirmed",
      ],
      requiredMappings: ["WeatherTech Roofing LLC company records", "IHC Painting company records", "Portal roles remain isolated"],
      controlledTestPlan: [
        "Run read-only migration list verification.",
        "Run anonymous access denial checks.",
        "Run authorized company-scoped access checks.",
      ],
      rollbackSummary: [
        "Use the documented migration rollback plan only after owner approval.",
        "Do not delete production CRM records.",
        "Preserve imported records even if provider activation is paused.",
      ],
      disabledSafetyFlags: [
        "Exact remote migration evidence must be verified for this release before activation.",
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "vercel",
      label: "Vercel or approved deployment provider",
      status: "production_url_required",
      summary: "Production deployment and URL setup are required before OAuth callbacks, webhooks, and live provider tests.",
      setupDocumentPath: setupDocumentPaths.production,
      requiredBeforeActivation: [
        "Vercel project connected",
        "Production domain and SSL configured",
        "Production environment variables configured server-side",
        "Health and browser smoke validation passed",
      ],
      requiredMappings: ["Production URL used for every OAuth callback and webhook base URL"],
      controlledTestPlan: [
        "Deploy the approved commit only.",
        "Verify app load, auth callback, and no console-breaking errors.",
        "Run post-deploy smoke tests before provider tests.",
      ],
      rollbackSummary: [
        "Rollback to the previous Vercel deployment.",
        "Disable provider webhooks before reverting provider tests if needed.",
        "Keep database records intact.",
      ],
      disabledSafetyFlags: [
        "Exact deployment and canonical health evidence must be verified for this release.",
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "twilio",
      label: "Twilio",
      status: "controlled_testing_required",
      summary: "Inbound SMS remains exact and outbound SMS remains unavailable. Tucson alone uses the signed canonical voice handler with a protected destination, exact branch identity, and loop protection. WeatherTech Phoenix and IHC remain direct carrier voice lines whose Twilio ingresses are SMS-only with blank Voice handling.",
      setupDocumentPath: setupDocumentPaths.twilio,
      requiredBeforeActivation: productionActivationGuides[0].requiredOwnerActions,
      requiredMappings: [
        "Each connected Twilio number must map to exactly one verified company, branch identity, and active connection",
        "Only the Tucson voice ingress may have an exact sms_voice company and branch route",
        "The protected Tucson terminal must remain distinct from every configured Twilio ingress and must not forward or ring onward",
        "WeatherTech Phoenix and IHC public voice remains at the existing carriers; their Twilio ingresses stay SMS-only with blank Voice handling",
        "SMS sent to the existing public Verizon or AT&T numbers does not enter WeatherTech OS through the Twilio ingress",
        "Unverified or unavailable company numbers remain unconfigured",
      ],
      controlledTestPlan: productionActivationGuides[0].testingSequence,
      rollbackSummary: productionActivationGuides[0].rollbackProcedure,
      disabledSafetyFlags: [
        twilioEnvVars.outboundSmsEnabled ?? "TWILIO_OUTBOUND_SMS_ENABLED",
        twilioEnvVars.voiceTerminalForwardingDisabledConfirmed ??
          "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
        twilioEnvVars.weatherTechTucsonVoiceForwardingEnabled ??
          "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
        "Recording, transcription, automatic replies, and automatic lead creation remain disabled",
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "gmail",
      label: "Google Workspace / Gmail",
      status: "oauth_required",
      summary: "Email foundation exists, but OAuth, mailbox authorization, token storage, and send approval are still required.",
      setupDocumentPath: setupDocumentPaths.googleWorkspace,
      requiredBeforeActivation: productionActivationGuides[1].requiredOwnerActions,
      requiredMappings: ["WeatherTech mailbox", "IHC mailbox", "Authorized sender policy"],
      controlledTestPlan: productionActivationGuides[1].testingSequence,
      rollbackSummary: productionActivationGuides[1].rollbackProcedure,
      disabledSafetyFlags: [googleWorkspaceEnvVars.gmailSendEnabled ?? "GOOGLE_GMAIL_SEND_ENABLED"],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "google-calendar",
      label: "Google Calendar",
      status: "oauth_required",
      summary: "Calendar foundation exists, but production OAuth, calendar mapping, and write approval are required.",
      setupDocumentPath: setupDocumentPaths.googleCalendar,
      requiredBeforeActivation: productionActivationGuides[2].requiredOwnerActions,
      requiredMappings: ["Inspection calendar", "Production calendar", "IHC calendar"],
      controlledTestPlan: productionActivationGuides[2].testingSequence,
      rollbackSummary: productionActivationGuides[2].rollbackProcedure,
      disabledSafetyFlags: [googleWorkspaceEnvVars.googleCalendarWriteEnabled],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "website",
      label: "Website lead capture",
      status: "controlled_testing_required",
      summary: "Signed website intake foundation exists, but production websites, HMAC secrets, source IDs, and origin controls require setup.",
      setupDocumentPath: setupDocumentPaths.website,
      requiredBeforeActivation: productionActivationGuides[5].requiredOwnerActions,
      requiredMappings: ["WeatherTech Phoenix source", "WeatherTech Tucson source", "IHC source"],
      controlledTestPlan: productionActivationGuides[5].testingSequence,
      rollbackSummary: productionActivationGuides[5].rollbackProcedure,
      disabledSafetyFlags: [
        websiteEnvVars.enabled,
        "WEATHERTECH_WEBSITE_INTAKE_ENABLED",
        "WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED",
        "IHC_WEBSITE_INTAKE_ENABLED",
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "yelp",
      label: "Yelp",
      status: "external_approval_required",
      summary:
        "The signed Mighty Apes receiver and campaign registry are distinct from direct Yelp OAuth: Phoenix is the only seeded route, while Tucson and IHC require authoritative campaign IDs and provider test evidence.",
      setupDocumentPath: setupDocumentPaths.yelp,
      requiredBeforeActivation: productionActivationGuides[4].requiredOwnerActions,
      requiredMappings: [
        "Verified Mighty Apes Phoenix campaign route",
        "Authoritative Mighty Apes Tucson campaign route",
        "Authoritative Mighty Apes IHC campaign route",
      ],
      controlledTestPlan: productionActivationGuides[4].testingSequence,
      rollbackSummary: productionActivationGuides[4].rollbackProcedure,
      disabledSafetyFlags: ["YELP_LIVE_SYNC_ENABLED", "YELP_OUTBOUND_MESSAGING_ENABLED"],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "google-business-profile",
      label: "Google Business Profile",
      status: "external_approval_required",
      summary: "GBP foundation exists, but API access, OAuth, Pub/Sub, account IDs, and location IDs remain owner setup.",
      setupDocumentPath: setupDocumentPaths.googleBusinessProfile,
      requiredBeforeActivation: productionActivationGuides[3].requiredOwnerActions,
      requiredMappings: ["WeatherTech Phoenix GBP location", "WeatherTech Tucson GBP location", "IHC GBP location"],
      controlledTestPlan: productionActivationGuides[3].testingSequence,
      rollbackSummary: productionActivationGuides[3].rollbackProcedure,
      disabledSafetyFlags: [
        googleBusinessProfileEnvVars.syncEnabled,
        googleBusinessProfileEnvVars.reviewReplyEnabled,
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "quickbooks",
      label: "QuickBooks Online",
      status: "controlled_testing_required",
      summary: "Accounting mapping foundation exists, but sandbox OAuth, realm IDs, and explicit accounting-write approval are required.",
      setupDocumentPath: setupDocumentPaths.quickbooks,
      requiredBeforeActivation: productionActivationGuides[6].requiredOwnerActions,
      requiredMappings: ["WeatherTech QuickBooks company realm", "IHC QuickBooks company realm"],
      controlledTestPlan: productionActivationGuides[6].testingSequence,
      rollbackSummary: productionActivationGuides[6].rollbackProcedure,
      disabledSafetyFlags: [
        quickBooksOnlineEnvVars.syncEnabled,
        quickBooksOnlineEnvVars.accountingWritesEnabled,
        quickBooksOnlineEnvVars.paymentProcessingEnabled,
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "docusign",
      label: "DocuSign",
      status: "controlled_testing_required",
      summary: "DocuSign support is provider-ready, but OAuth, account IDs, webhooks, sandbox tests, and write gates remain disabled.",
      setupDocumentPath: setupDocumentPaths.signatures,
      requiredBeforeActivation: productionActivationGuides[7].requiredOwnerActions,
      requiredMappings: ["WeatherTech DocuSign account", "IHC DocuSign account"],
      controlledTestPlan: productionActivationGuides[7].testingSequence,
      rollbackSummary: productionActivationGuides[7].rollbackProcedure,
      disabledSafetyFlags: [
        electronicSignatureEnvVars.docusignSignatureRequestsEnabled,
        electronicSignatureEnvVars.docusignProviderWritesEnabled,
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "dropbox-sign",
      label: "Dropbox Sign",
      status: "controlled_testing_required",
      summary: "Dropbox Sign support is provider-ready, but OAuth, account IDs, webhooks, sandbox tests, and write gates remain disabled.",
      setupDocumentPath: setupDocumentPaths.signatures,
      requiredBeforeActivation: productionActivationGuides[7].requiredOwnerActions,
      requiredMappings: ["WeatherTech Dropbox Sign account", "IHC Dropbox Sign account"],
      controlledTestPlan: productionActivationGuides[7].testingSequence,
      rollbackSummary: productionActivationGuides[7].rollbackProcedure,
      disabledSafetyFlags: [
        electronicSignatureEnvVars.dropboxSignSignatureRequestsEnabled,
        electronicSignatureEnvVars.dropboxSignProviderWritesEnabled,
      ],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "ai-tools",
      label: "AI Command Center 3.0",
      status: "controlled_testing_required",
      summary:
        "AI Command Center 3.0 uses a bounded server-side provider with exact-company authorization, usage limits, durable per-action audit evidence, and reviewed internal actions. External action execution remains disabled.",
      setupDocumentPath: setupDocumentPaths.aiTools,
      requiredBeforeActivation: [
        "Apply and verify migrations 0033 and the centralized automation foundation.",
        "Choose the owner-approved OpenAI, Anthropic, or other provider.",
        "Configure server-only API credentials in hosting.",
        "Set daily budget, request limits, token limits, timeout, and retry limits.",
        "Keep external action execution disabled.",
      ],
      requiredMappings: [
        "WeatherTech Roofing LLC AI company scope",
        "IHC Painting AI company scope",
        "Authorized internal user roles",
      ],
      controlledTestPlan: [
        "Run provider readiness without exposing credentials.",
        "Ask grounded commands for one exact company scope at a time.",
        "Verify prompt-injection blocks.",
        "Verify invalid, ambiguous, and cross-company action targets fail before provider/action execution.",
        "Verify each action preview has a durable audit reference.",
        "Verify only a reviewed safe internal follow-up can enqueue an office-task action.",
      ],
      rollbackSummary: [
        "Set AI_ENABLED=false.",
        "Remove provider API keys from hosting environment.",
        "Do not delete AI audit records unless the owner approves a retention action.",
      ],
      disabledSafetyFlags: ["AI_ACTION_EXECUTION_ENABLED"],
      evidenceFields: productionEvidenceFields,
    },
    {
      id: "automation-engine",
      label: "Automation Engine",
      status: "migration_verification_required",
      summary:
        "The central event, rule, approval, execution, attempt, retry, cancellation, and audit foundation requires exact migration and scheduler verification before Production processing.",
      setupDocumentPath: setupDocumentPaths.automation,
      requiredBeforeActivation: productionActivationGuides[9].requiredOwnerActions,
      requiredMappings: [
        "WeatherTech Roofing LLC company with Phoenix/Scottsdale and Tucson locations",
        "IHC Painting company with its IHC location",
        "Owner/admin company memberships for rule controls",
      ],
      controlledTestPlan: productionActivationGuides[9].testingSequence,
      rollbackSummary: productionActivationGuides[9].rollbackProcedure,
      disabledSafetyFlags: [
        "Customer/provider action types are not registered",
        "AI_ACTION_EXECUTION_ENABLED remains false",
      ],
      evidenceFields: productionEvidenceFields,
    },
  ];
}

export function launchControlTone(status: LaunchControlState): ProductionReadinessTone {
  if (status === "codex_work_complete" || status === "active") {
    return "green";
  }

  if (status === "failed" || status === "blocked") {
    return "red";
  }

  if (
    status === "owner_action_required" ||
    status === "external_approval_required" ||
    status === "oauth_required" ||
    status === "migration_verification_required" ||
    status === "production_url_required" ||
    status === "controlled_testing_required"
  ) {
    return "amber";
  }

  return "slate";
}

export function productionEnvironmentVariableStatusLabel(
  status: ProductionEnvironmentVariableStatus,
) {
  const labels: Record<ProductionEnvironmentVariableStatus, string> = {
    present: "Present",
    missing: "Missing",
    invalid: "Invalid",
    unknown: "Unknown",
    disabled_safely: "Disabled safely",
    enabled_requires_approval: "Enabled - approval required",
  };

  return labels[status];
}

export function productionEnvironmentClassificationLabel(
  classification: ProductionEnvironmentVariableCheck["classification"],
) {
  const labels: Record<ProductionEnvironmentVariableCheck["classification"], string> = {
    required_before_deployment: "Required before deployment",
    required_before_provider_connection: "Required before provider connection",
    optional: "Optional",
    disabled_safety_flag: "Disabled safety flag",
  };

  return labels[classification];
}

function getEnvironmentValue(
  env: Record<string, string | undefined> | undefined,
  name: string,
) {
  if (!env) {
    return null;
  }

  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isBooleanFlagName(name: string) {
  return name.endsWith("_ENABLED") || name.endsWith("_TEST_MODE");
}

function classifyEnvironmentVariable(
  name: string,
  classification: ProductionEnvironmentVariableCheck["classification"],
  env?: Record<string, string | undefined>,
): ProductionEnvironmentVariableStatus {
  const value = getEnvironmentValue(env, name);

  if (value === null) {
    return "unknown";
  }

  if (name === "CRON_SECRET" && value.length < 32) {
    return "invalid";
  }

  if (classification === "disabled_safety_flag") {
    if (!value || value === "false") {
      return "disabled_safely";
    }

    if (value === "true") {
      return "enabled_requires_approval";
    }

    return "invalid";
  }

  if (isBooleanFlagName(name) && value && value !== "true" && value !== "false") {
    return "invalid";
  }

  if (!value) {
    return classification === "optional" ? "missing" : "missing";
  }

  return "present";
}

function environmentVariableSummary(
  status: ProductionEnvironmentVariableStatus,
  classification: ProductionEnvironmentVariableCheck["classification"],
) {
  if (status === "unknown") {
    return "Requires server-side production environment verification.";
  }

  if (status === "present") {
    return "Configured; value is intentionally redacted.";
  }

  if (status === "disabled_safely") {
    return "Disabled safety flag is off.";
  }

  if (status === "enabled_requires_approval") {
    return "Enabled flag must be reviewed against owner approval before launch.";
  }

  if (status === "invalid") {
    return "Configured value does not match the expected safe format.";
  }

  return classification === "optional"
    ? "Optional value is not configured."
    : "Required value is missing.";
}

function isSecretEnvironmentVariable(name: string) {
  return /SECRET|TOKEN|KEY|SID|HMAC|VERIFIER|FORWARD_TO/i.test(name) &&
    !name.startsWith("NEXT_PUBLIC_");
}

function buildEnvironmentCheck(
  name: string,
  classification: ProductionEnvironmentVariableCheck["classification"],
  env?: Record<string, string | undefined>,
): ProductionEnvironmentVariableCheck {
  const status = classifyEnvironmentVariable(name, classification, env);

  return {
    name,
    classification,
    status,
    secret: isSecretEnvironmentVariable(name),
    summary: environmentVariableSummary(status, classification),
  };
}

function buildEnvironmentGroup(
  id: string,
  label: string,
  variables: Array<{
    name: string;
    classification: ProductionEnvironmentVariableCheck["classification"];
  }>,
  env?: Record<string, string | undefined>,
): ProductionEnvironmentGroup {
  return {
    id,
    label,
    checks: variables.map((variable) =>
      buildEnvironmentCheck(variable.name, variable.classification, env),
    ),
  };
}

export function buildProductionEnvironmentInventory(
  env?: Record<string, string | undefined>,
): ProductionEnvironmentGroup[] {
  return [
    buildEnvironmentGroup(
      "deployment",
      "Deployment and Supabase",
      [
        { name: "WTOS_DEPLOYMENT_ENV", classification: "required_before_deployment" },
        { name: "NEXT_PUBLIC_APP_ENV", classification: "optional" },
        { name: "WTOS_DEPLOYMENT_PROVIDER", classification: "optional" },
        { name: "WTOS_STAGING_URL", classification: "required_before_deployment" },
        { name: "NEXT_PUBLIC_SUPABASE_URL", classification: "required_before_deployment" },
        { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", classification: "required_before_deployment" },
        { name: "SUPABASE_SERVICE_ROLE_KEY", classification: "required_before_deployment" },
        { name: "NEXT_PUBLIC_APP_URL", classification: "required_before_deployment" },
        { name: "WTOS_PRODUCTION_APPROVED", classification: "disabled_safety_flag" },
        { name: "WTOS_CUSTOMER_PORTAL_ENABLED", classification: "disabled_safety_flag" },
        {
          name: "WTOS_AUTOMATED_CUSTOMER_NOTIFICATIONS_ENABLED",
          classification: "disabled_safety_flag",
        },
        { name: "WTOS_PUBLIC_REGISTRATION_ENABLED", classification: "disabled_safety_flag" },
        { name: "PRODUCTION_HEALTHCHECK_URL", classification: "optional" },
        { name: "MONITORING_HEALTHCHECK_URL", classification: "optional" },
      ],
      env,
    ),
    buildEnvironmentGroup(
      "automation-engine",
      "Automation Engine",
      [
        {
          name: "CRON_SECRET",
          classification: "required_before_deployment" as const,
        },
      ],
      env,
    ),
    buildEnvironmentGroup(
      "twilio",
      "Twilio",
      [
        ...providerGuideEnv.twilio.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        {
          name: twilioEnvVars.inboundSmsEnabled,
          classification: "required_before_provider_connection" as const,
        },
        { name: twilioEnvVars.outboundSmsEnabled, classification: "disabled_safety_flag" },
        {
          name: twilioEnvVars.voiceTerminalForwardingDisabledConfirmed,
          classification: "disabled_safety_flag",
        },
        {
          name: twilioEnvVars.weatherTechTucsonVoiceForwardingEnabled,
          classification: "disabled_safety_flag",
        },
      ],
      env,
    ),
    buildEnvironmentGroup(
      "google-workspace",
      "Google Workspace and Calendar",
      [
        ...providerGuideEnv.googleWorkspace.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        { name: googleWorkspaceEnvVars.gmailSendEnabled, classification: "disabled_safety_flag" },
        {
          name: googleWorkspaceEnvVars.googleCalendarWriteEnabled,
          classification: "disabled_safety_flag",
        },
      ],
      env,
    ),
    buildEnvironmentGroup(
      "website-yelp-gbp",
      "Website, Yelp, and Google Business Profile",
      [
        ...providerGuideEnv.website.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        ...providerGuideEnv.yelp.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        ...providerGuideEnv.googleBusinessProfile.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        { name: websiteEnvVars.enabled, classification: "disabled_safety_flag" },
        { name: "YELP_LIVE_SYNC_ENABLED", classification: "disabled_safety_flag" },
        { name: "YELP_OUTBOUND_MESSAGING_ENABLED", classification: "disabled_safety_flag" },
        { name: googleBusinessProfileEnvVars.syncEnabled, classification: "disabled_safety_flag" },
        {
          name: googleBusinessProfileEnvVars.reviewReplyEnabled,
          classification: "disabled_safety_flag",
        },
      ],
      env,
    ),
    buildEnvironmentGroup(
      "quickbooks-signatures",
      "QuickBooks and Electronic Signatures",
      [
        ...providerGuideEnv.quickbooks.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        ...providerGuideEnv.signatures.map((name) => ({
          name,
          classification: "required_before_provider_connection" as const,
        })),
        { name: quickBooksOnlineEnvVars.syncEnabled, classification: "disabled_safety_flag" },
        {
          name: quickBooksOnlineEnvVars.accountingWritesEnabled,
          classification: "disabled_safety_flag",
        },
        {
          name: quickBooksOnlineEnvVars.paymentProcessingEnabled,
          classification: "disabled_safety_flag",
        },
        {
          name: electronicSignatureEnvVars.docusignSignatureRequestsEnabled,
          classification: "disabled_safety_flag",
        },
        {
          name: electronicSignatureEnvVars.docusignProviderWritesEnabled,
          classification: "disabled_safety_flag",
        },
        {
          name: electronicSignatureEnvVars.dropboxSignSignatureRequestsEnabled,
          classification: "disabled_safety_flag",
        },
        {
          name: electronicSignatureEnvVars.dropboxSignProviderWritesEnabled,
          classification: "disabled_safety_flag",
        },
      ],
      env,
    ),
    buildEnvironmentGroup(
      "ai-tools",
      "AI Tools controlled pilot",
      [
        ...providerGuideEnv.ai.map((name) => ({
          name,
          classification: name.includes("API_KEY")
            ? "required_before_provider_connection" as const
            : name === "AI_ACTION_EXECUTION_ENABLED"
              ? "disabled_safety_flag" as const
              : "required_before_provider_connection" as const,
        })),
      ],
      env,
    ),
  ];
}

function buildControlledTestPlans(
  providerCards: ProductionProviderActivationCard[],
): ProductionControlledTestPlan[] {
  return providerCards
    .filter((card) => card.id !== "vercel")
    .map((card) => ({
      id: `${card.id}-controlled-test`,
      label: `${card.label} controlled test`,
      providerCardId: card.id,
      prerequisites: [
        "Production URL and callback paths are configured where required.",
        "Required migrations and RLS runtime validation are verified.",
        "Owner-controlled account access is available.",
        "Production writes or sends remain disabled unless this specific test is approved.",
      ],
      steps: card.controlledTestPlan,
      expectedEvidence: card.evidenceFields,
      stopConditions: [
        "Unexpected customer-facing communication occurs.",
        "A provider account maps to the wrong WeatherTech/IHC company or branch.",
        "Duplicate CRM activity is created.",
        "A required rollback path is missing.",
      ],
    }));
}

function buildLaunchGates(): ProductionLaunchGate[] {
  return [
    {
      id: "deployment-ready",
      label: "Deployment-ready",
      status: "blocked",
      summary: "Blocked until production environment variables, Supabase project verification, and migration history evidence exist.",
      requiredEvidence: [
        "Clean pushed commit",
        "Production build pass",
        "Supabase project reference verified",
        "Remote migration history verified",
        "Production environment variables configured server-side",
      ],
      blockingReasons: [
        "Exact Production deployment evidence has not been verified by this browser view.",
        "Production environment status is not verified by this browser view.",
        "Remote migration status is unknown until CLI verification.",
      ],
    },
    {
      id: "provider-setup-ready",
      label: "Ready for provider setup",
      status: "blocked",
      summary: "Blocked until the production URL and callback base paths are confirmed.",
      requiredEvidence: [
        "Production URL",
        "OAuth redirect URI list",
        "Webhook URL list",
        "Provider setup owner",
      ],
      blockingReasons: [
        "OAuth redirect URIs require a real production URL.",
        "Webhook configuration requires a deployed HTTPS endpoint.",
      ],
    },
    {
      id: "controlled-testing-ready",
      label: "Ready for controlled testing",
      status: "blocked",
      summary: "Blocked until provider credentials, account mapping, safety flags, and rollback paths are validated.",
      requiredEvidence: [
        "Provider account mapping",
        "Controlled test record ID",
        "Disabled production-write gates",
        "Rollback procedure confirmed",
      ],
      blockingReasons: [
        "Provider credentials are owner-controlled and not configured by this sprint.",
        "Unknown account mappings must remain blocked.",
      ],
    },
    {
      id: "internal-pilot-ready",
      label: "Ready for internal pilot",
      status: "blocked",
      summary: "Blocked until migrations, auth, RLS, backups, monitoring, rollback ownership, and critical regression evidence pass.",
      requiredEvidence: [
        "Runtime RLS validation",
        "Authentication URL validation",
        "Full signed-in browser regression",
        "Monitoring destination",
        "Backup and rollback owner",
        "Pilot user list",
      ],
      blockingReasons: [
        "Daily production use has not been owner-approved.",
        "Backup, monitoring, rollback, and pilot owner evidence is not recorded.",
      ],
    },
    {
      id: "daily-production-use",
      label: "Ready for daily production use",
      status: "blocked",
      summary: "Daily production use remains blocked until the owner explicitly approves after internal pilot evidence.",
      requiredEvidence: [
        "Owner production-use approval",
        "Internal pilot sign-off",
        "No critical regression failures",
        "Provider rollback confidence",
      ],
      blockingReasons: [
        "WeatherTech OS must not approve itself for daily production use.",
      ],
    },
  ];
}

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
      ...providerGuideEnv.ai,
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
    "Exact Production deployment evidence must be verified for this release.",
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
  const providerActivationCards = buildProviderActivationCards();
  const controlledTestPlans = buildControlledTestPlans(providerActivationCards);
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
      "WeatherTech OS has a strong internal operating-system foundation, but exact release deployment evidence and live integration activation remain gated by owner setup, migration verification, credentials, OAuth, webhooks, monitoring, and final regression evidence.",
    stagingDeploymentMetadata: buildPrivateStagingEnvironmentMetadata(),
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
    activationSequence: baseActivationSequence,
    providerActivationCards,
    companyMappingGuidance: branchMappingGuidance,
    migrationInventory: providerMigrationInventory,
    environmentInventory: buildProductionEnvironmentInventory(),
    controlledTestPlans,
    launchGates: buildLaunchGates(),
    evidenceFields: productionEvidenceFields,
    blockers,
  };
}
