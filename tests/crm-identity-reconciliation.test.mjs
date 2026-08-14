import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-crm-reconciliation-"));
const migrationPath = join(
  cwd,
  "supabase/migrations/20260814051533_crm_identity_reconciliation.sql",
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

function assertThrows(callback, pattern, message) {
  try {
    callback();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    assert(pattern.test(detail), `${message}. Received ${detail}.`);
    return;
  }

  throw new Error(`${message}. Expected the callback to throw.`);
}

function lead(overrides = {}) {
  return {
    id: "lead-weathertech",
    company_id: "company-weathertech",
    customer_id: null,
    property_id: null,
    contact_name: "Taylor Homeowner",
    phone: "+14805550101",
    email: "TAYLOR@example.test",
    property_address: "100 Main Street, Scottsdale, AZ",
    city: "Scottsdale",
    state: "AZ",
    postal_code: "85251",
    service_type: "roofing",
    source: "Owner review",
    status: "contacted",
    pipeline_stage: "contacted",
    priority: "normal",
    estimated_value: 0,
    next_follow_up: null,
    notes: "Reviewed identity fixture",
    created_by: null,
    created_at: "2026-08-13T12:00:00.000Z",
    updated_at: "2026-08-13T12:01:00.000Z",
    ...overrides,
  };
}

function customer(overrides = {}) {
  return {
    id: "customer-weathertech",
    company_id: "company-weathertech",
    display_name: "Taylor Homeowner",
    contact_name: "Taylor Homeowner",
    phone: "(480) 555-0101",
    email: "taylor@example.test",
    property_address: "100 Main Street, Scottsdale, AZ",
    city: "Scottsdale",
    state: "AZ",
    postal_code: "85251",
    customer_type: "homeowner",
    status: "active",
    notes: null,
    created_at: "2026-08-13T11:00:00.000Z",
    updated_at: "2026-08-13T11:01:00.000Z",
    ...overrides,
  };
}

function property(overrides = {}) {
  return {
    id: "property-weathertech",
    company_id: "company-weathertech",
    customer_id: null,
    display_name: "Taylor Scottsdale property",
    address: "100 Main Street, Scottsdale, AZ",
    city: "Scottsdale",
    state: "AZ",
    postal_code: "85251",
    updated_at: "2026-08-13T11:02:00.000Z",
    ...overrides,
  };
}

function linkedRecord(table, overrides = {}) {
  return {
    id: `${table}-weathertech`,
    company_id: "company-weathertech",
    customer_id: null,
    property_id: null,
    lead_id: "lead-weathertech",
    title: `${table} fixture`,
    updated_at: "2026-08-13T11:03:00.000Z",
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    leads: [lead()],
    customers: [customer()],
    properties: [property()],
    estimates: [linkedRecord("estimate")],
    inspections: [linkedRecord("inspection")],
    jobs: [linkedRecord("job")],
    scheduleEvents: [linkedRecord("schedule")],
    officeTasks: [linkedRecord("office-task")],
    ...overrides,
  };
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules/.bin/tsc"),
    [
      "lib/crm/identityReconciliation.ts",
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--skipLibCheck",
      "--outDir",
      outDir,
    ],
    { cwd, encoding: "utf8" },
  );

  assert(
    compile.status === 0,
    `Identity reconciliation helpers did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const helpers = await import(
    `${pathToFileURL(join(outDir, "identityReconciliation.js")).href}?v=${Date.now()}`
  );

  assertEqual(
    helpers.normalizeIdentityPhone("+1 (480) 555-0101"),
    "4805550101",
    "US phone normalization accepts country-code punctuation",
  );
  assertEqual(
    helpers.normalizeIdentityPhone("480.555.0101"),
    "4805550101",
    "US phone normalization accepts local punctuation",
  );
  assertEqual(
    helpers.normalizeIdentityPhone("555-0101"),
    "",
    "Malformed phones are not treated as identity evidence",
  );
  assertEqual(
    helpers.normalizeIdentityEmail("  Taylor@EXAMPLE.TEST "),
    "taylor@example.test",
    "Email normalization is exact after case and whitespace normalization",
  );
  assertEqual(
    helpers.normalizeIdentityAddress("100 MAIN Street, Scottsdale AZ"),
    "100 main street scottsdale az",
    "Address normalization is conservative and punctuation independent",
  );

  const [exactCase] = helpers.buildIdentityReconciliationCases(snapshot());
  assertEqual(exactCase.state, "ready_link", "One evidenced same-company customer is linkable");
  assertEqual(
    exactCase.targetCustomer.id,
    "customer-weathertech",
    "Exact evidence resolves the reviewed same-company customer",
  );
  assertEqual(exactCase.customerCandidates.length, 1, "Exact match remains unique");
  assert(
    exactCase.customerCandidates[0].evidence.some((item) => item.kind === "phone") &&
      exactCase.customerCandidates[0].evidence.some((item) => item.kind === "email") &&
      exactCase.customerCandidates[0].evidence.some((item) => item.kind === "address_name"),
    "Exact phone, email, and address-plus-name evidence are visible for review",
  );
  assertEqual(exactCase.links.length, 6, "The reviewed graph exposes every in-scope link type");

  const scheduleOnlyId = "schedule-weathertech-only";
  const inspectionViaScheduleId = "inspection-via-schedule";
  const [scheduleConnectedCase] = helpers.buildIdentityReconciliationCases(
    snapshot({
      properties: [],
      estimates: [],
      jobs: [],
      scheduleEvents: [
        linkedRecord("schedule", {
          id: scheduleOnlyId,
          lead_id: "lead-weathertech",
        }),
      ],
      inspections: [
        linkedRecord("inspection", {
          id: inspectionViaScheduleId,
          lead_id: null,
          schedule_event_id: scheduleOnlyId,
        }),
      ],
      officeTasks: [
        linkedRecord("office-task", {
          id: "office-task-via-inspection",
          lead_id: null,
          inspection_id: inspectionViaScheduleId,
        }),
      ],
    }),
  );
  const scheduleConnectedLinkKeys = new Set(
    scheduleConnectedCase.links.map((link) => link.key),
  );
  assert(
    scheduleConnectedLinkKeys.has(`schedule_events:${scheduleOnlyId}`) &&
      scheduleConnectedLinkKeys.has(`inspections:${inspectionViaScheduleId}`) &&
      scheduleConnectedLinkKeys.has("office_tasks:office-task-via-inspection"),
    "A selected schedule event exposes its inspection and the inspection's dependent office task",
  );
  const scheduleConnectedRequest = helpers.buildIdentityReconciliationRequest({
    reconciliationCase: scheduleConnectedCase,
    operationKey: "TEST WTOS REGRESSION RECONCILIATION unit-schedule-inspection",
    selectedLinkKeys: scheduleConnectedLinkKeys,
  });
  assertEqual(
    scheduleConnectedRequest.links.schedule_events.length,
    1,
    "Schedule-only graph request carries the selected schedule event",
  );
  assertEqual(
    scheduleConnectedRequest.links.inspections.length,
    1,
    "Schedule-only graph request carries the inspection reached through that event",
  );
  assertEqual(
    scheduleConnectedRequest.links.office_tasks.length,
    1,
    "Schedule-only graph request carries the office task reached through that inspection",
  );

  const [noMatchCase] = helpers.buildIdentityReconciliationCases(
    snapshot({ customers: [], properties: [], estimates: [], inspections: [], jobs: [], scheduleEvents: [], officeTasks: [] }),
  );
  assertEqual(noMatchCase.state, "ready_create", "Sufficient unmatched identity can create one reviewed customer");
  assertEqual(noMatchCase.targetCustomer, null, "No-match does not invent a target customer");

  const [insufficientCase] = helpers.buildIdentityReconciliationCases(
    snapshot({
      leads: [lead({ phone: null, email: null })],
      customers: [],
      properties: [],
      estimates: [],
      inspections: [],
      jobs: [],
      scheduleEvents: [],
      officeTasks: [],
    }),
  );
  assertEqual(
    insufficientCase.state,
    "insufficient_evidence",
    "Address alone never establishes customer identity",
  );
  assertEqual(insufficientCase.decision, null, "Insufficient evidence cannot be approved");

  const [ambiguousCase] = helpers.buildIdentityReconciliationCases(
    snapshot({
      customers: [
        customer(),
        customer({ id: "customer-weathertech-two", display_name: "Taylor duplicate" }),
      ],
    }),
  );
  assertEqual(ambiguousCase.state, "ambiguous", "Multiple same-company matches are refused");
  assertEqual(ambiguousCase.targetCustomer, null, "Ambiguity never selects the first customer");
  assertEqual(ambiguousCase.decision, null, "Ambiguity has no approvable decision");

  const [crossCompanyCase] = helpers.buildIdentityReconciliationCases(
    snapshot({
      customers: [customer({ id: "customer-ihc", company_id: "company-ihc" })],
      properties: [],
      estimates: [],
      inspections: [],
      jobs: [],
      scheduleEvents: [],
      officeTasks: [],
    }),
  );
  assertEqual(crossCompanyCase.targetCustomer, null, "A matching IHC customer is never a WeatherTech target");
  assertEqual(crossCompanyCase.customerCandidates.length, 0, "Cross-company candidates are excluded");
  assertEqual(crossCompanyCase.crossCompanyMatches.length, 1, "Cross-company evidence is surfaced as a warning");
  assertEqual(crossCompanyCase.state, "ready_create", "Separate companies may retain distinct reviewed identities");

  const [conflictCase] = helpers.buildIdentityReconciliationCases(
    snapshot({
      estimates: [
        linkedRecord("estimate", {
          customer_id: "different-weathertech-customer",
        }),
      ],
      inspections: [],
      jobs: [],
      scheduleEvents: [],
      officeTasks: [],
    }),
  );
  assertEqual(conflictCase.state, "conflict", "Existing conflicting graph ownership is refused");
  assertEqual(conflictCase.decision, null, "A graph conflict cannot be approved");

  const selectedKeys = new Set(exactCase.links.map((link) => link.key));
  const request = helpers.buildIdentityReconciliationRequest({
    reconciliationCase: exactCase,
    operationKey: "TEST WTOS REGRESSION RECONCILIATION unit-link",
    selectedLinkKeys: selectedKeys,
  });
  assertEqual(request.company_id, exactCase.companyId, "Request remains company scoped");
  assertEqual(request.lead.id, exactCase.lead.id, "Request identifies the reviewed lead");
  assertEqual(
    request.lead.expected_updated_at,
    exactCase.lead.updated_at,
    "Request carries the exact reviewed lead version",
  );
  assertEqual(request.customer.id, exactCase.targetCustomer.id, "Request carries one explicit customer");
  assertEqual(request.property.id, exactCase.targetProperty.id, "Request carries one explicit property");
  assertEqual(request.links.estimates.length, 1, "Only selected estimates are propagated");
  assertEqual(request.links.inspections.length, 1, "Only selected inspections are propagated");
  assertEqual(request.links.jobs.length, 1, "Only selected jobs are propagated");
  assertEqual(request.links.schedule_events.length, 1, "Only selected schedule events are propagated");
  assertEqual(request.links.office_tasks.length, 1, "Only selected office tasks are propagated");
  assert(!("status" in request.lead), "Reconciliation never requests a lead status mutation");
  assert(!("pipeline_stage" in request.lead), "Reconciliation never requests a lead pipeline mutation");

  const dismissRequest = helpers.buildIdentityReconciliationRequest({
    reconciliationCase: ambiguousCase,
    operationKey: "TEST WTOS REGRESSION RECONCILIATION unit-dismiss",
    selectedLinkKeys: new Set(),
    decision: "dismiss",
  });
  assertEqual(dismissRequest.decision, "dismiss", "Ambiguous review can be dismissed auditably");
  assert(!dismissRequest.customer, "Dismissal carries no customer mutation or create payload");

  assertThrows(
    () =>
      helpers.buildIdentityReconciliationRequest({
        reconciliationCase: ambiguousCase,
        operationKey: "TEST WTOS REGRESSION RECONCILIATION unit-unsafe",
        selectedLinkKeys: new Set(),
      }),
    /not safe to approve/i,
    "Ambiguous cases fail closed before RPC submission",
  );
  assertThrows(
    () =>
      helpers.buildIdentityReconciliationRequest({
        reconciliationCase: exactCase,
        operationKey: " ",
        selectedLinkKeys: new Set(),
      }),
    /stable operation key/i,
    "Blank idempotency keys are rejected",
  );

  const migration = readFileSync(migrationPath, "utf8");
  const repository = readFileSync(join(cwd, "lib/crm/repository.ts"), "utf8");
  const repositoryRpcStart = repository.indexOf(
    "export async function reconcileCustomerPropertyIdentity",
  );
  const repositoryRpcEnd = repository.indexOf("\nfunction ", repositoryRpcStart);
  const repositoryRpc = repository.slice(repositoryRpcStart, repositoryRpcEnd);

  assert(repositoryRpcStart >= 0, "Repository exposes the reconciliation boundary");
  assert(
    repositoryRpc.includes('.rpc("wtos_reconcile_customer_property"'),
    "Repository submits one transactional reconciliation RPC",
  );
  assertEqual(
    (repositoryRpc.match(/\.rpc\(/g) ?? []).length,
    1,
    "Repository reconciliation uses exactly one RPC call",
  );
  assert(
    !repositoryRpc.includes(".from("),
    "Repository reconciliation cannot split mutations across client writes",
  );

  for (const requiredSql of [
    "create table public.crm_identity_reconciliation_events",
    "unique (company_id, operation_key)",
    "create or replace function public.wtos_reconcile_customer_property",
    "security definer",
    "set search_path = ''",
    "for update",
    "request_sha256",
    "expected_updated_at",
    "actor_user_id",
    "revoke all on function public.wtos_reconcile_customer_property(jsonb)",
  ]) {
    assert(
      migration.toLowerCase().includes(requiredSql.toLowerCase()),
      `Migration includes required transactional contract: ${requiredSql}`,
    );
  }
  assert(
    /grant execute on function public\.wtos_reconcile_customer_property\(jsonb\)\s+to authenticated/i.test(migration),
    "Only authenticated callers receive reconciliation execute access",
  );
  assert(
    /decision[^\n]+(?:link_existing|create_customer|dismiss)/i.test(migration),
    "Migration validates the closed decision set",
  );
  assert(
    /owner[^\n]+admin|admin[^\n]+owner/i.test(migration),
    "Migration contains the explicit owner/admin authorization boundary",
  );
  assert(
    !/\b(truncate|drop\s+table|delete\s+from\s+public\.(?:customers|properties|leads))\b/i.test(migration),
    "Migration contains no destructive CRM data operation",
  );
  assert(
    !/(integration_connections|sms_messages|email_messages|payments|invoices|stripe_|twilio_|gmail_|quickbooks)/i.test(migration),
    "Reconciliation migration has no provider or financial target",
  );

  console.log("CRM identity reconciliation tests: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
