import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
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

  const readinessModule = await import(pathToFileURL(join(outDir, "productionReadiness.js")));
  const center = readinessModule.buildProductionReadinessCenter(emptySnapshot());

  assert(center.score > 0, "Production readiness score is calculated");
  assert(center.score < 100, "Production readiness score must not fake full readiness");
  assertEqual(
    center.overallStatus,
    "production_disabled",
    "Production readiness remains disabled until owner setup is complete",
  );
  assert(
    center.blockers.some((blocker) => blocker.includes("Production deployment has not been run")),
    "Deployment blocker is present",
  );
  assert(
    center.blockers.some((blocker) => blocker.includes("Live integrations remain disabled")),
    "Live integration blocker is present",
  );
  assert(
    center.requiredMigrations.includes("0031_electronic_signatures_foundation.sql"),
    "Latest required migration is tracked",
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
  ].forEach((label) => assert(guideLabels.includes(label), `${label} guide is present`));

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
  ].forEach((envName) =>
    assert(requiredCredentialNames.includes(envName), `${envName} is included in owner setup`),
  );

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
  ].forEach((label) => assert(providerCardLabels.includes(label), `${label} provider activation card exists`));

  assert(
    center.providerActivationCards.every((card) => card.status !== "active"),
    "Provider cards must not fake active connections",
  );
  assert(
    center.providerActivationCards.every((card) => card.rollbackSummary.length > 0),
    "Every provider card documents rollback",
  );

  const migrationNames = center.migrationInventory.map((migration) => migration.filename);
  [
    "0027_gmail_workspace_email_foundation.sql",
    "0028_google_calendar_scheduling_foundation.sql",
    "0029_google_business_profile_foundation.sql",
    "0030_quickbooks_online_foundation.sql",
    "0031_electronic_signatures_foundation.sql",
  ].forEach((filename) => assert(migrationNames.includes(filename), `${filename} migration is inventoried`));
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

  const validatedEnvironmentInventory = readinessModule.buildProductionEnvironmentInventory({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-key",
    NEXT_PUBLIC_APP_URL: "https://app.example.test",
    TWILIO_OUTBOUND_SMS_ENABLED: "false",
    GOOGLE_GMAIL_SEND_ENABLED: "maybe",
    WEBSITE_INTAKE_ENABLED: "true",
  });
  const validatedChecks = validatedEnvironmentInventory.flatMap((group) => group.checks);
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
      (check) => check.name === "TWILIO_OUTBOUND_SMS_ENABLED" && check.status === "disabled_safely",
    ),
    "Disabled provider-write gates are recognized as safe",
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
