import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-ai-daily-ops-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function emptySnapshot(overrides = {}) {
  return {
    companies: [],
    companyLocations: [],
    properties: [],
    leads: [],
    marketingCampaigns: [],
    leadAccountability: [],
    leadAccountabilityEvents: [],
    marketingSpendMonths: [],
    customers: [],
    estimates: [],
    estimateLineItems: [],
    scopeTemplates: [],
    scopes: [],
    jobs: [],
    jobTasks: [],
    officeTasks: [],
    jobNotes: [],
    jobMaterials: [],
    scheduleEvents: [],
    jobPhotos: [],
    invoices: [],
    invoiceLineItems: [],
    materialOrders: [],
    materialOrderItems: [],
    employees: [],
    jobAssignments: [],
    timeEntries: [],
    inspections: [],
    dailyLogs: [],
    changeOrders: [],
    signatures: [],
    documents: [],
    payments: [],
    proposalTemplates: [],
    proposalRevisions: [],
    proposalSections: [],
    proposalOptions: [],
    proposalAcceptances: [],
    proposalPaymentSchedules: [],
    proposalAuditEvents: [],
    notifications: [],
    integrationConnections: [],
    integrationSyncLogs: [],
    automationRules: [],
    automationEvents: [],
    automationExecutions: [],
    automationAttempts: [],
    automationAuditEvents: [],
    aiSavedAnalyses: [],
    aiAuditEvents: [],
    aiUsageLimits: [],
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
    ...overrides,
  };
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/crm/aiTools.ts",
      "lib/crm/companyScope.ts",
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
    throw new Error(`Could not compile Daily Operations AI modules.\n${compile.stdout}\n${compile.stderr}`);
  }

  const aiTools = await import(pathToFileURL(join(outDir, "aiTools.js")));
  const now = "2026-09-01T16:00:00.000Z";
  const wtCompanyId = "11111111-1111-4111-8111-111111111111";
  const ihcCompanyId = "22222222-2222-4222-8222-222222222222";
  const wtLocationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const ihcLocationId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  const lead = {
    id: "lead-wt",
    company_id: wtCompanyId,
    company_location_id: wtLocationId,
    customer_id: "customer-wt",
    contact_name: "Phoenix Roof Customer",
    phone: "602-555-0101",
    email: "roof@example.test",
    property_address: "100 Roof Way",
    city: "Phoenix",
    state: "AZ",
    postal_code: "85001",
    service_type: "roof_replacement",
    source: "website",
    status: "new",
    pipeline_stage: "new_lead",
    priority: "high",
    estimated_value: 18000,
    next_follow_up: "2026-09-01",
    notes: null,
    created_by: null,
    created_at: "2026-08-28T16:00:00.000Z",
    updated_at: "2026-08-28T16:00:00.000Z",
  };
  const ihcLead = {
    ...lead,
    id: "lead-ihc",
    company_id: ihcCompanyId,
    company_location_id: ihcLocationId,
    customer_id: "customer-ihc",
    contact_name: "IHC Customer",
    email: "ihc@example.test",
  };

  const snapshot = emptySnapshot({
    companies: [
      { id: wtCompanyId, name: "WeatherTech Roofing LLC", trade: "roofing" },
      { id: ihcCompanyId, name: "IHC Painting", trade: "painting" },
    ],
    companyLocations: [
      {
        id: wtLocationId,
        company_id: wtCompanyId,
        location_key: "weathertech_phoenix",
        display_name: "WeatherTech Phoenix",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
      {
        id: ihcLocationId,
        company_id: ihcCompanyId,
        location_key: "ihc_scottsdale",
        display_name: "IHC Scottsdale",
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ],
    customers: [
      { id: "customer-wt", company_id: wtCompanyId, display_name: "Phoenix Roof Customer" },
      { id: "customer-ihc", company_id: ihcCompanyId, display_name: "IHC Customer" },
    ],
    leads: [lead, ihcLead],
    leadAccountability: [
      {
        id: "accountability-wt",
        company_id: wtCompanyId,
        lead_id: lead.id,
        first_response_at: null,
        owner_user_id: "owner-wt",
      },
      {
        id: "accountability-ihc",
        company_id: ihcCompanyId,
        lead_id: ihcLead.id,
        first_response_at: null,
        owner_user_id: "owner-ihc",
      },
    ],
    estimates: [
      {
        id: "estimate-follow-up",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        title: "Phoenix roof estimate",
        status: "sent",
        service_type: "roof_replacement",
        expiration_date: "2026-08-31",
        total: 18000,
        profit_margin_total: 4000,
        created_at: "2026-08-20T16:00:00.000Z",
        updated_at: "2026-08-25T16:00:00.000Z",
      },
      {
        id: "estimate-approved",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        title: "Approved Phoenix roof",
        status: "approved",
        service_type: "roof_replacement",
        expiration_date: null,
        total: 22000,
        profit_margin_total: 5000,
        created_at: "2026-08-20T16:00:00.000Z",
        updated_at: "2026-08-31T16:00:00.000Z",
      },
    ],
    jobs: [
      {
        id: "job-approved-unscheduled",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        estimate_id: "estimate-approved",
        proposal_acceptance_id: null,
        title: "Approved unscheduled roof",
        status: "draft",
        scheduled_start: null,
        start_date: null,
        crew_name: null,
        project_manager: "pm-wt",
        property_address: "100 Roof Way",
        total: 22000,
        created_at: "2026-08-31T16:00:00.000Z",
        updated_at: "2026-08-31T16:00:00.000Z",
      },
      {
        id: "job-today",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        estimate_id: "estimate-approved",
        title: "Today's Phoenix roof",
        status: "scheduled",
        scheduled_start: "2026-09-01T17:00:00.000Z",
        start_date: null,
        crew_name: "Crew One",
        project_manager: "pm-wt",
        property_address: "100 Roof Way",
        total: 22000,
        created_at: "2026-08-31T16:00:00.000Z",
        updated_at: "2026-08-31T16:00:00.000Z",
      },
      {
        id: "job-end-only-tomorrow",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        estimate_id: "estimate-approved",
        proposal_acceptance_id: null,
        title: "End-only scheduled Phoenix roof",
        status: "draft",
        scheduled_start: null,
        scheduled_end: "2026-09-02T19:00:00.000Z",
        start_date: null,
        end_date: null,
        crew_name: null,
        project_manager: "pm-wt",
        property_address: "100 Roof Way",
        total: 22000,
        created_at: "2026-08-31T16:00:00.000Z",
        updated_at: "2026-08-31T16:00:00.000Z",
      },
    ],
    scheduleEvents: [
      {
        id: "event-tomorrow",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        job_id: null,
        title: "Tomorrow production job",
        event_type: "job",
        status: "scheduled",
        start_at: "2026-09-02T17:00:00.000Z",
        end_at: "2026-09-02T18:00:00.000Z",
        location: "IHC Scottsdale free-text label must not drive identity",
        notes: null,
        created_at: now,
        updated_at: now,
      },
    ],
    invoices: [
      {
        id: "invoice-wt",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        job_id: "job-today",
        estimate_id: "estimate-approved",
        invoice_number: "INV-WT-001",
        status: "sent",
        balance_due: 2500,
        due_date: "2026-09-05",
        created_at: "2026-08-30T16:00:00.000Z",
        updated_at: "2026-08-31T16:00:00.000Z",
      },
    ],
    officeTasks: [
      {
        id: "task-overdue",
        company_id: wtCompanyId,
        company_location_id: wtLocationId,
        customer_id: "customer-wt",
        property_id: null,
        assigned_employee_id: "office-wt",
        lead_id: lead.id,
        inspection_id: null,
        estimate_id: null,
        job_id: null,
        source_type: "automation",
        automation_key: "ai-daily-test",
        title: "Call Phoenix customer",
        notes: null,
        priority: "urgent",
        due_at: "2026-09-01T15:00:00.000Z",
        status: "open",
        snoozed_until: null,
        completed_at: null,
        completed_by: null,
        created_at: "2026-08-31T16:00:00.000Z",
        updated_at: "2026-08-31T16:00:00.000Z",
      },
    ],
    emailMessages: [
      {
        id: "email-inbound",
        company_id: wtCompanyId,
        customer_id: "customer-wt",
        lead_id: lead.id,
        job_id: null,
        estimate_id: null,
        invoice_id: null,
        document_id: null,
        integration_connection_id: null,
        provider: "gmail",
        category: "general",
        status: "sent",
        direction: "inbound",
        from_email: "roof@example.test",
        to_email: "office@example.test",
        cc_email: null,
        subject: "Can you call me?",
        body: "Please call.",
        gmail_message_id: "gmail-inbound",
        gmail_thread_id: "thread-wt",
        queued_at: null,
        sent_at: null,
        received_at: "2026-09-01T14:00:00.000Z",
        last_error: null,
        created_at: "2026-09-01T14:00:00.000Z",
        updated_at: "2026-09-01T14:00:00.000Z",
      },
    ],
    automationEvents: [
      {
        id: "automation-event-wt",
        company_id: wtCompanyId,
        company_location_id: wtLocationId,
        event_type: "lead.created",
        source_table: "leads",
        source_id: lead.id,
        actor_user_id: null,
        occurred_at: "2026-09-01T12:00:00.000Z",
      },
      {
        id: "automation-event-old",
        company_id: wtCompanyId,
        company_location_id: wtLocationId,
        event_type: "lead.updated",
        source_table: "leads",
        source_id: lead.id,
        actor_user_id: null,
        occurred_at: "2026-08-30T12:00:00.000Z",
      },
    ],
  });

  const questions = [
    ["What needs my attention today?", ["office_tasks"]],
    ["Which leads haven't been contacted?", ["leads"]],
    ["Which estimates need follow-up?", ["estimates"]],
    ["Which approved jobs aren't scheduled?", ["jobs"]],
    ["What jobs are scheduled today/tomorrow?", ["jobs", "schedule_events"]],
    ["Which invoices are outstanding?", ["invoices"]],
    ["Which customers are waiting on us?", ["email_messages"]],
    ["What tasks are overdue?", ["office_tasks"]],
    ["What happened since yesterday?", ["automation_events"]],
    ["What are the highest-priority actions today?", ["office_tasks"]],
  ];

  for (const [prompt, expectedTables] of questions) {
    const response = aiTools.answerAiCommand({
      prompt,
      snapshot,
      options: { companyId: wtCompanyId, now },
    });
    assertEqual(response.taskType, "daily_brief", `${prompt} routes to Daily Operations`);
    assertEqual(response.completeness, "complete", `${prompt} is deterministic and complete`);
    assertEqual(response.missingInformation.length, 0, `${prompt} does not require a model provider`);
    assert(
      expectedTables.every((table) =>
        response.supportingRecords.some((record) => record.table === table),
      ),
      `${prompt} cites ${expectedTables.join(", ")}`,
    );
    assert(
      response.supportingRecords.every((record) => record.companyId === wtCompanyId),
      `${prompt} remains in the exact company scope`,
    );
    assert(
      response.actions.every((action) =>
        ["open_record", "create_follow_up_draft"].includes(action.type),
      ),
      `${prompt} exposes internal/read-only actions only`,
    );
  }

  const priorities = aiTools.buildAiPriorityItems(snapshot, {
    companyId: wtCompanyId,
    now,
  });
  const groundedRecords = priorities.filter((item) =>
    [
      "lead-wt",
      "task-overdue",
      "event-tomorrow",
      "automation-event-wt",
    ].includes(item.source.id),
  );
  assert(
    groundedRecords.length === 4 &&
      groundedRecords.every(
        (item) =>
          item.companyLocationId === wtLocationId &&
          item.companyLocationLabel === "WeatherTech Phoenix" &&
          item.source.companyLocationId === wtLocationId &&
          item.source.companyLocationLabel === "WeatherTech Phoenix",
      ),
    "Authoritative location IDs and labels propagate through source and priority records",
  );
  assert(
    !groundedRecords.some((item) => item.companyLocationLabel === "IHC Scottsdale free-text label must not drive identity"),
    "Free-text schedule labels never determine branch identity",
  );
  assert(
    !priorities.some((item) => item.companyId === ihcCompanyId || item.source.id === "lead-ihc"),
    "IHC records cannot leak into a WeatherTech Daily Operations result",
  );
  assert(
    !priorities.some((item) => item.source.id === "automation-event-old"),
    "Since-yesterday activity is bounded to the previous 24 hours",
  );
  const endOnlyScheduledJob = priorities.find(
    (item) => item.source.id === "job-end-only-tomorrow",
  );
  assert(
    endOnlyScheduledJob?.dailyOperationsTopics.includes("scheduled_tomorrow") &&
      !endOnlyScheduledJob.dailyOperationsTopics.includes("approved_unscheduled_jobs") &&
      endOnlyScheduledJob.companyLocationId === wtLocationId,
    "An end-only saved job schedule is grounded as scheduled tomorrow and never approved-unscheduled",
  );

  console.log("AI Daily Operations grounding checks passed (10 owner questions, company/location isolation, bounded activity, safe actions).\n");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
