import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-production-readiness-"));
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

function emptySnapshot() {
  return {
    companies: [
      {
        id: "company-weathertech",
        name: "WeatherTech Roofing LLC",
        short_name: "WeatherTech",
        trade: "roofing",
        workflow_profile: "roofing",
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
      {
        id: "company-ihc",
        name: "IHC Painting",
        short_name: "IHC",
        trade: "painting",
        workflow_profile: "painting",
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    properties: [],
    leads: [
      {
        id: "lead-1",
        company_id: "company-weathertech",
        customer_name: "Jane Homeowner",
        phone: "+16025550123",
        email: "jane@example.test",
        property_address: "100 Roof Way",
        service_needed: "roofing",
        source: "Website",
        status: "new",
        pipeline_stage: "new_lead",
        priority: "normal",
        estimated_value: 2500,
        assigned_to: null,
        next_follow_up: null,
        notes: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    customers: [
      {
        id: "customer-1",
        company_id: "company-weathertech",
        display_name: "Jane Homeowner",
        contact_name: "Jane Homeowner",
        company_name: null,
        phone: "+16025550123",
        email: "jane@example.test",
        property_address: "100 Roof Way",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        billing_address: null,
        status: "active",
        preferred_contact: "phone",
        lead_source: "Website",
        tags: [],
        notes: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    estimates: [
      {
        id: "estimate-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: "lead-1",
        job_id: null,
        property_id: null,
        title: "Roof repair proposal",
        estimate_number: "EST-1",
        status: "sent",
        subtotal: 2500,
        discount_total: 0,
        tax_rate: 0,
        total: 2500,
        valid_until: null,
        notes: null,
        terms: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    estimateLineItems: [],
    scopeTemplates: [],
    scopes: [],
    jobs: [
      {
        id: "job-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: "lead-1",
        estimate_id: "estimate-1",
        property_id: null,
        title: "Roof repair",
        job_number: "JOB-1",
        service_type: "roofing",
        status: "scheduled",
        scheduled_start: "2026-08-05T15:00:00.000Z",
        scheduled_end: "2026-08-05T20:00:00.000Z",
        start_date: null,
        end_date: null,
        crew_name: "Roof Crew",
        project_manager: "Office",
        address: "100 Roof Way",
        property_address: "100 Roof Way",
        scope_of_work: "Repair roof leak.",
        total: 2500,
        latitude: null,
        longitude: null,
        google_place_id: null,
        address_verified_at: null,
        notes: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    jobTasks: [],
    jobNotes: [],
    jobMaterials: [],
    scheduleEvents: [
      {
        id: "event-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: null,
        job_id: "job-1",
        property_id: null,
        title: "Roof repair",
        event_type: "job",
        status: "scheduled",
        start_at: "2026-08-05T15:00:00.000Z",
        end_at: "2026-08-05T20:00:00.000Z",
        location: "100 Roof Way",
        notes: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    jobPhotos: [],
    invoices: [
      {
        id: "invoice-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        job_id: "job-1",
        estimate_id: "estimate-1",
        property_id: null,
        invoice_number: "INV-1",
        title: "Roof repair invoice",
        status: "sent",
        issue_date: "2026-08-04",
        due_date: "2026-08-15",
        subtotal: 2500,
        discount_total: 0,
        tax_rate: 0,
        tax_total: 0,
        total: 2500,
        amount_paid: 0,
        notes: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    invoiceLineItems: [],
    materialOrders: [],
    materialOrderItems: [],
    employees: [],
    jobAssignments: [],
    timeEntries: [],
    inspections: [
      {
        id: "inspection-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: "lead-1",
        job_id: "job-1",
        property_id: null,
        title: "Roof inspection",
        inspection_type: "roof_inspection",
        service_category: "roofing",
        status: "completed",
        severity: "moderate",
        scheduled_start: "2026-08-04T15:00:00.000Z",
        scheduled_end: "2026-08-04T16:00:00.000Z",
        completed_at: "2026-08-04T16:00:00.000Z",
        assigned_inspector: "Estimator",
        property_address: "100 Roof Way",
        summary: "Inspection complete.",
        internal_notes: null,
        customer_notes: null,
        estimate_id: "estimate-1",
        report_document_id: null,
        outcome: "estimate_only",
        findings: [],
        measurements: [],
        photo_ids: [],
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    dailyLogs: [],
    changeOrders: [],
    signatures: [],
    documents: [
      {
        id: "document-1",
        company_id: "company-weathertech",
        customer_id: "customer-1",
        lead_id: null,
        job_id: "job-1",
        estimate_id: "estimate-1",
        inspection_id: "inspection-1",
        invoice_id: null,
        change_order_id: null,
        property_id: null,
        title: "Signed proposal",
        category: "signed_agreement",
        status: "ready",
        template_key: null,
        file_url: null,
        file_name: "signed-proposal.pdf",
        file_size_bytes: 1000,
        mime_type: "application/pdf",
        storage_bucket: null,
        storage_path: null,
        uploaded_by: "Office",
        uploaded_at: "2026-08-04T12:00:00.000Z",
        archived_at: null,
        property_address: "100 Roof Way",
        tags: [],
        requirement_level: "required",
        required_for: ["estimate_approval"],
        body: null,
        created_at: "2026-08-04T12:00:00.000Z",
        updated_at: "2026-08-04T12:00:00.000Z",
      },
    ],
    payments: [],
    notifications: [],
    integrationConnections: [],
    integrationSyncLogs: [],
    leadIntakeRecords: [],
    calendarEventSyncs: [],
    googleCalendarConnectedCalendars: [],
    googleCalendarUnmatchedEvents: [],
    emailMessages: [],
    gmailEmailThreads: [],
    gmailEmailAttachments: [],
    smsMessages: [],
    businessPhoneNumbers: [],
    communicationProviderEvents: [],
    callRecords: [],
    routePlans: [],
    routePlanStops: [],
    companyMemberships: [],
    companyWorkflowSettings: [],
  };
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/crm/productionReadiness.ts",
      "lib/crm/integrationCenter.ts",
      "lib/crm/electronicSignatureFoundation.ts",
      "lib/crm/quickbooksOnlineFoundation.ts",
      "lib/crm/googleBusinessProfileLeadCapture.ts",
      "lib/crm/integrations.ts",
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
      `Could not compile production readiness center.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const compiledReadinessPath = [
    join(outDir, "productionReadiness.js"),
    join(outDir, "crm", "productionReadiness.js"),
    join(outDir, "lib", "crm", "productionReadiness.js"),
  ].find((candidate) => existsSync(candidate));

  if (!compiledReadinessPath) {
    throw new Error("Could not locate compiled production readiness module.");
  }

  const readinessModule = await import(pathToFileURL(compiledReadinessPath));
  const center = readinessModule.buildProductionReadinessCenter(emptySnapshot());

  assert(center.score > 0, "Production readiness score is calculated");
  assert(center.score < 100, "Production readiness score must not fake full readiness");
  assertEqual(
    center.overallStatus,
    "production_disabled",
    "Production readiness remains disabled until owner setup is complete",
  );
  assert(
    center.blockers.some((blocker) => blocker.includes("Production deployment evidence must be verified")),
    "Exact release deployment-evidence blocker is present",
  );
  assert(
    center.blockers.some((blocker) => blocker.includes("Live integrations remain disabled")),
    "Live integration blocker is present",
  );
  assertEqual(
    center.stagingDeploymentMetadata.healthEndpoint,
    "/api/health",
    "Health endpoint is exposed in deployment metadata",
  );
  assertEqual(
    center.stagingDeploymentMetadata.readinessEndpoint,
    "/api/readiness",
    "Readiness endpoint is exposed in deployment metadata",
  );
  assertEqual(
    center.stagingDeploymentMetadata.productionActivationStatus,
    "not_granted",
    "Production activation remains unapproved in browser metadata",
  );
  assertEqual(
    center.stagingDeploymentMetadata.liveProviderWritesStatus,
    "disabled",
    "Provider writes remain disabled in browser metadata",
  );
  assertEqual(
    center.lastMigration,
    "20260902102714_lead_automation_event_legacy_schema_compatibility.sql",
    "Latest required migration is exact",
  );
  assertEqual(
    JSON.stringify(center.requiredMigrations),
    JSON.stringify(["20260902102714_lead_automation_event_legacy_schema_compatibility.sql"]),
    "Required migration checkpoint is the exact latest singleton",
  );

  const guideLabels = center.activationGuides.map((guide) => guide.label);
  [
    "Twilio",
    "Gmail / Google Workspace",
    "Google Calendar",
    "Google Business Profile",
    "Yelp",
    "Website",
    "QuickBooks Online",
    "Electronic Signatures",
    "AI Command Center 3.0",
    "Automation Engine",
  ].forEach((label) => assert(guideLabels.includes(label), `${label} guide is present`));

  const yelpGuide = center.activationGuides.find((guide) => guide.label === "Yelp");
  assert(yelpGuide, "Yelp activation guide is present");
  const yelpGuideText = JSON.stringify(yelpGuide);
  assert(
    yelpGuideText.includes("Mighty Apes Phoenix campaign") &&
      yelpGuideText.includes("WeatherTech Tucson and IHC") &&
      yelpGuideText.includes("lead.test") &&
      yelpGuideText.includes("lead.created") &&
      yelpGuideText.includes("direct-Yelp partner access"),
    "Yelp guide separates the signed Mighty Apes registry from direct Yelp access and keeps unverified routes fail-closed",
  );

  const twilioGuide = center.activationGuides.find((guide) => guide.label === "Twilio");
  assert(twilioGuide, "Twilio activation guide is present");
  const twilioGuideText = JSON.stringify(twilioGuide);
  assert(
    twilioGuide.requiredOwnerActions.some(
      (action) => action.includes("existing Verizon line") && action.includes("existing AT&T line"),
    ) &&
      twilioGuide.requiredOwnerActions.some(
        (action) =>
          action.includes("Phoenix and IHC Twilio ingress Voice handling blank") &&
          action.includes("SMS-only"),
      ),
    "Twilio guidance preserves Phoenix/IHC direct-carrier voice and SMS-only ingresses",
  );
  assert(
    !twilioGuideText.includes("choose the Phoenix and IHC protected terminals") &&
      !twilioGuideText.includes("carrier voice forwarding from each public Phoenix/IHC line"),
    "Twilio guidance does not request retired Phoenix/IHC voice destinations or forwarding",
  );

  const requiredCredentialNames = center.activationGuides.flatMap(
    (guide) => guide.requiredCredentials,
  );
  [
    "TWILIO_ACCOUNT_SID",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_BUSINESS_PROFILE_CLIENT_ID",
    "YELP_CLIENT_ID",
    "WEBSITE_INTAKE_SIGNING_SECRET",
    "QUICKBOOKS_CLIENT_ID",
    "DOCUSIGN_CLIENT_ID",
    "DROPBOX_SIGN_CLIENT_ID",
    "AI_OPENAI_API_KEY",
    "AI_ANTHROPIC_API_KEY",
    "CRON_SECRET",
  ].forEach((envName) =>
    assert(requiredCredentialNames.includes(envName), `${envName} is included in owner setup`),
  );
  const retiredVoiceEnvNames = [
    "TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER",
    "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO",
    "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED",
    "TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
    "TWILIO_IHC_PUBLIC_NUMBER",
    "TWILIO_IHC_VOICE_FORWARD_TO",
    "TWILIO_IHC_VOICE_FORWARDING_ENABLED",
    "TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  ];
  const providerLabels = center.providerChecks.map((check) => check.label);
  [
    "Twilio",
    "Gmail",
    "Google Calendar",
    "Google Business Profile",
    "Yelp",
    "Website Lead Capture",
    "GoHighLevel",
    "QuickBooks Online",
    "DocuSign",
    "Dropbox Sign",
  ].forEach((label) => assert(providerLabels.includes(label), `${label} provider is checked`));

  const providerStatuses = new Set(center.providerChecks.map((check) => check.status));
  assert(
    providerStatuses.has("credentials_required") || providerStatuses.has("oauth_required"),
    "Providers require credentials or OAuth before production activation",
  );

  const checklistLabels = center.deploymentChecklist.map((group) => group.label);
  [
    "Database and Supabase",
    "Integrations and credentials",
    "Documents, portal, financial, communications, and website",
    "Monitoring, backups, and launch control",
  ].forEach((label) => assert(checklistLabels.includes(label), `${label} checklist exists`));

  const activationLabels = center.activationSequence.map((step) => step.label);
  [
    "Repository and release checkpoint",
    "Supabase production migration validation",
    "Authentication and redirect configuration",
    "Vercel or approved production deployment",
    "Custom production URL",
    "Monitoring, backups, and rollback",
    "Twilio",
    "Gmail / Google Workspace",
    "Google Calendar",
    "Website lead capture",
    "Yelp",
    "Google Business Profile",
    "QuickBooks Online",
    "Electronic signatures",
    "Customer portal, if owner-approved",
    "Controlled internal pilot",
    "Final production-use approval",
  ].forEach((label) => assert(activationLabels.includes(label), `${label} activation step exists`));

  const productionUrlStep = center.activationSequence.find(
    (step) => step.id === "production-deployment",
  );
  const websiteStep = center.activationSequence.find(
    (step) => step.id === "website-lead-capture",
  );
  assert(productionUrlStep.order < websiteStep.order, "Production URL comes before website lead capture");
  assertEqual(
    productionUrlStep.status,
    "production_url_required",
    "Missing production URL blocks deployment stage",
  );

  const providerCardLabels = center.providerActivationCards.map((card) => card.label);
  [
    "Supabase",
    "Vercel or approved deployment provider",
    "Twilio",
    "Google Workspace / Gmail",
    "Google Calendar",
    "Website lead capture",
    "Yelp",
    "Google Business Profile",
    "QuickBooks Online",
    "DocuSign",
    "Dropbox Sign",
    "AI Command Center 3.0",
    "Automation Engine",
  ].forEach((label) => assert(providerCardLabels.includes(label), `${label} provider activation card exists`));

  assert(
    center.providerActivationCards.every((card) => card.status !== "active"),
    "Provider cards must not fake active connections",
  );
  assert(
    center.providerActivationCards.every((card) => card.rollbackSummary.length > 0),
    "Every provider card documents rollback",
  );

  const yelpCard = center.providerActivationCards.find((card) => card.label === "Yelp");
  assert(yelpCard, "Yelp provider activation card exists");
  const yelpCardText = JSON.stringify(yelpCard);
  assert(
    yelpCardText.includes("signed Mighty Apes receiver") &&
      yelpCardText.includes("Phoenix is the only seeded route") &&
      yelpCardText.includes("Tucson and IHC require authoritative campaign IDs") &&
      yelpCardText.includes("lead.test") &&
      yelpCardText.includes("first real lead.created"),
    "Yelp card truthfully exposes the Phoenix-only seed and the external Tucson/IHC provider actions",
  );

  const migrationNames = center.migrationInventory.map((migration) => migration.filename);
  const expectedAutomationMigrationSuffix = [
    "20260902024804_automation_engine_foundation.sql",
    "20260902042428_gohighlevel_webhook_durable_state_machine.sql",
    "20260902043624_mighty_apes_legacy_service_routing_correction.sql",
    "20260902044154_gohighlevel_webhook_uninstall_guardrails.sql",
    "20260902044714_legacy_lead_dynamic_insert_lint_correction.sql",
    "20260902045112_canonical_lead_dynamic_insert_lint_correction.sql",
    "20260902053037_automation_synthetic_regression_cleanup.sql",
    "20260902054334_automation_synthetic_cleanup_lead_source_correction.sql",
    "20260902061135_gohighlevel_inbound_automation_bridge.sql",
    "20260902065509_legacy_twilio_synthetic_automation_orphan_cleanup.sql",
    "20260902071651_legacy_twilio_browser_voice_orphan_cleanup.sql",
    "20260902102714_lead_automation_event_legacy_schema_compatibility.sql",
  ];
  [
    "0027_gmail_workspace_email_foundation.sql",
    "0028_google_calendar_scheduling_foundation.sql",
    "0029_google_business_profile_foundation.sql",
    "0030_quickbooks_online_foundation.sql",
    "0031_electronic_signatures_foundation.sql",
    "0033_ai_tools_operating_brain.sql",
    ...expectedAutomationMigrationSuffix,
  ].forEach((filename) => assert(migrationNames.includes(filename), `${filename} migration is inventoried`));
  assertEqual(
    JSON.stringify(
      migrationNames.slice(
        migrationNames.indexOf("20260902024804_automation_engine_foundation.sql"),
      ),
    ),
    JSON.stringify(expectedAutomationMigrationSuffix),
    "Automation release migrations are inventoried as one exact ordered suffix",
  );
  assert(
    center.migrationInventory.every(
      (migration) =>
        migration.repositoryStatus === "present_in_repository" &&
        migration.integrityStatus === "included_in_migration_integrity_tests" &&
        migration.remoteStatus === "remote_status_unknown",
    ),
    "Migrations distinguish repository presence from unknown remote application",
  );

  const mappingLabels = center.companyMappingGuidance.map((mapping) => mapping.label);
  [
    "WeatherTech Roofing LLC - Phoenix",
    "WeatherTech Roofing LLC - Tucson",
    "IHC",
  ].forEach((label) => assert(mappingLabels.includes(label), `${label} mapping guidance exists`));
  assert(
    center.companyMappingGuidance.every((mapping) =>
      mapping.providerMappings.every((provider) => provider.status === "owner_action_required"),
    ),
    "Unknown account mappings remain blocked for owner action",
  );

  const controlledPlanLabels = center.controlledTestPlans.map((plan) => plan.label);
  assert(
    controlledPlanLabels.some((label) => label.includes("Twilio controlled test")),
    "Twilio controlled-test plan exists",
  );
  assert(
    center.controlledTestPlans.every((plan) =>
      plan.stopConditions.some((condition) => condition.includes("wrong WeatherTech/IHC company")),
    ),
    "Controlled tests stop on company-mapping mistakes",
  );

  const launchGateStatuses = new Map(
    center.launchGates.map((gate) => [gate.id, gate.status]),
  );
  assertEqual(
    launchGateStatuses.get("internal-pilot-ready"),
    "blocked",
    "Internal pilot remains blocked without evidence",
  );
  assertEqual(
    launchGateStatuses.get("daily-production-use"),
    "blocked",
    "Daily production use requires owner approval",
  );

  const unknownEnvironmentInventory = center.environmentInventory.flatMap(
    (group) => group.checks,
  );
  assert(
    unknownEnvironmentInventory.some((check) => check.status === "unknown"),
    "Browser-readiness environment inventory stays unknown until server-side validation",
  );
  [
    "WTOS_DEPLOYMENT_ENV",
    "WTOS_STAGING_URL",
    "WTOS_PRODUCTION_APPROVED",
    "WTOS_CUSTOMER_PORTAL_ENABLED",
    "WTOS_AUTOMATED_CUSTOMER_NOTIFICATIONS_ENABLED",
    "WTOS_PUBLIC_REGISTRATION_ENABLED",
    "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
    "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
    "AI_ENABLED",
    "AI_ACTION_EXECUTION_ENABLED",
    "CRON_SECRET",
  ].forEach((envName) =>
    assert(
      unknownEnvironmentInventory.some((check) => check.name === envName),
      `${envName} is included in the staging environment inventory`,
    ),
  );
  assert(
    retiredVoiceEnvNames.every(
      (envName) => !unknownEnvironmentInventory.some((check) => check.name === envName),
    ),
    "Retired Phoenix/IHC voice variables are absent from environment readiness",
  );

  const validatedEnvironmentInventory = readinessModule.buildProductionEnvironmentInventory({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-key",
    CRON_SECRET: "test-only-cron-secret-at-least-32-characters",
    NEXT_PUBLIC_APP_URL: "https://app.example.test",
    TWILIO_OUTBOUND_SMS_ENABLED: "false",
    TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED: "false",
    TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO: "+16235550101",
    GOOGLE_GMAIL_SEND_ENABLED: "maybe",
    WEBSITE_INTAKE_ENABLED: "true",
  });
  const validatedChecks = validatedEnvironmentInventory.flatMap((group) => group.checks);
  assert(
    retiredVoiceEnvNames.every(
      (envName) => !validatedChecks.some((check) => check.name === envName),
    ),
    "Validated readiness never requests retired Phoenix/IHC voice variables",
  );
  assert(
    validatedChecks.some(
      (check) =>
        check.name === "SUPABASE_SERVICE_ROLE_KEY" &&
        check.status === "present" &&
        check.secret,
    ),
    "Server-side environment inventory reports secret presence without exposing value",
  );
  assert(
    !JSON.stringify(validatedEnvironmentInventory).includes("super-secret-service-key"),
    "Secret values are redacted from environment inventory",
  );
  assert(
    validatedChecks.some(
      (check) =>
        check.name === "CRON_SECRET" &&
        check.status === "present" &&
        check.secret,
    ),
    "The scheduler secret is required server-side and remains redacted",
  );
  const invalidCronInventory = readinessModule.buildProductionEnvironmentInventory({
    CRON_SECRET: "too-short",
  });
  assert(
    invalidCronInventory
      .flatMap((group) => group.checks)
      .some(
        (check) => check.name === "CRON_SECRET" && check.status === "invalid",
      ),
    "Weak scheduler secrets fail readiness",
  );
  assert(
    validatedChecks.some(
      (check) => check.name === "TWILIO_OUTBOUND_SMS_ENABLED" && check.status === "disabled_safely",
    ),
    "Disabled provider-write gates are recognized as safe",
  );
  assert(
    validatedChecks.filter(
      (check) => check.name === "TWILIO_WEATHERTECH_TUCSON_NUMBER",
    ).length === 1,
    "Each Twilio business-number environment check appears exactly once",
  );
  assert(
    validatedChecks.some(
      (check) =>
        check.name === "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO" &&
        check.status === "present" &&
        check.secret,
    ),
    "The protected Tucson forwarding destination is explicitly redacted",
  );
  assert(
    validatedChecks.some(
      (check) =>
        check.name === "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED" &&
        check.status === "disabled_safely",
    ),
    "The Tucson voice forwarding gate is tracked as a disabled safety flag",
  );
  assert(
    validatedChecks.some(
      (check) => check.name === "GOOGLE_GMAIL_SEND_ENABLED" && check.status === "invalid",
    ),
    "Invalid safety flag values are rejected",
  );
  assert(
    validatedChecks.some(
      (check) => check.name === "WEBSITE_INTAKE_ENABLED" && check.status === "enabled_requires_approval",
    ),
    "Enabled production switches require approval",
  );

  assertEqual(
    readinessModule.productionReadinessStateLabel("credentials_required"),
    "Credentials required",
    "Readiness labels are user-facing",
  );
  assertEqual(
    readinessModule.launchControlStateLabel("owner_action_required"),
    "Owner action required",
    "Launch-control labels are user-facing",
  );

  console.log("Production readiness center tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
