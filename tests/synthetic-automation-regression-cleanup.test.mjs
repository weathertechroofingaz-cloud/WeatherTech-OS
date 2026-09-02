import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalSourceRecords,
  cleanupSyntheticAutomationRegressionLedger,
  createBrowserCompatibleRegressionRunId,
} from "../scripts/synthetic-automation-regression-cleanup.mjs";

const RUN_ID = "17200000000000007";
const SOURCE_MARKER = `TEST WTOS REGRESSION ${RUN_ID}`;
const PROVIDER_MARKER = `TEST WTOS MIGHTY APES REGRESSION: ${RUN_ID}`;
const OWNER_ID = "2150c43d-c5b6-4560-9ecb-142561ba1dc2";
const COMPANY_ID = "10000000-0000-4000-8000-000000000001";

const ids = {
  shared: "10000000-0000-4000-8000-000000000002",
  inspection: "10000000-0000-4000-8000-000000000003",
  estimate: "10000000-0000-4000-8000-000000000004",
  job: "10000000-0000-4000-8000-000000000005",
  invoice: "10000000-0000-4000-8000-000000000006",
  taskMarked: "10000000-0000-4000-8000-000000000007",
  taskLinked: "10000000-0000-4000-8000-000000000008",
  providerSource: "10000000-0000-4000-8000-000000000009",
  providerProvider: "10000000-0000-4000-8000-000000000010",
  email: "10000000-0000-4000-8000-000000000011",
  callSource: "10000000-0000-4000-8000-000000000012",
  callProvider: "10000000-0000-4000-8000-000000000013",
  aiAudit: "10000000-0000-4000-8000-000000000014",
  collision: "10000000-0000-4000-8000-000000000015",
  eventLead: "20000000-0000-4000-8000-000000000001",
  eventCustomer: "20000000-0000-4000-8000-000000000002",
  eventChild: "20000000-0000-4000-8000-000000000003",
  eventUnrelated: "20000000-0000-4000-8000-000000000004",
  execution: "30000000-0000-4000-8000-000000000001",
  attempt: "40000000-0000-4000-8000-000000000001",
  auditEvent: "50000000-0000-4000-8000-000000000001",
  auditExecution: "50000000-0000-4000-8000-000000000002",
  engineTask: "60000000-0000-4000-8000-000000000001",
};

function copyRows(rows) {
  return rows.map((row) => ({ ...row }));
}

function fixtureTables() {
  return {
    leads: [{ id: ids.shared, company_id: COMPANY_ID, contact_name: `${SOURCE_MARKER} LEAD` }],
    customers: [
      { id: ids.shared, company_id: COMPANY_ID, display_name: `${SOURCE_MARKER} CUSTOMER` },
      { id: ids.collision, company_id: COMPANY_ID, display_name: `${SOURCE_MARKER}COLLISION` },
    ],
    inspections: [{ id: ids.inspection, company_id: COMPANY_ID, title: SOURCE_MARKER }],
    estimates: [{ id: ids.estimate, company_id: COMPANY_ID, title: `${SOURCE_MARKER} ESTIMATE` }],
    jobs: [{ id: ids.job, company_id: COMPANY_ID, title: `${SOURCE_MARKER} JOB` }],
    invoices: [
      {
        id: ids.invoice,
        company_id: COMPANY_ID,
        title: `Invoice for ${SOURCE_MARKER} ACCEPTED PROPOSAL`,
      },
    ],
    office_tasks: [
      { id: ids.taskMarked, company_id: COMPANY_ID, title: `${SOURCE_MARKER} TASK` },
      { id: ids.taskLinked, company_id: COMPANY_ID, lead_id: ids.shared, title: "Linked task" },
      {
        id: ids.engineTask,
        company_id: COMPANY_ID,
        automation_execution_id: ids.execution,
        title: "Engine-created task",
      },
    ],
    communication_provider_events: [
      { id: ids.providerSource, company_id: COMPANY_ID, correlation_id: SOURCE_MARKER },
      {
        id: ids.providerProvider,
        company_id: COMPANY_ID,
        correlation_id: `${PROVIDER_MARKER} DELIVERY`,
      },
    ],
    email_messages: [
      { id: ids.email, company_id: COMPANY_ID, subject: `${SOURCE_MARKER} EMAIL` },
    ],
    call_records: [
      { id: ids.callSource, company_id: COMPANY_ID, correlation_id: `${SOURCE_MARKER} CALL` },
      { id: ids.callProvider, company_id: COMPANY_ID, correlation_id: PROVIDER_MARKER },
    ],
    ai_audit_events: [
      { id: ids.aiAudit, company_id: COMPANY_ID, metadata: { testMarker: SOURCE_MARKER } },
    ],
    automation_events: [
      {
        id: ids.eventLead,
        company_id: COMPANY_ID,
        source_table: "leads",
        source_id: ids.shared,
        causation_event_id: null,
      },
      {
        id: ids.eventCustomer,
        company_id: COMPANY_ID,
        source_table: "customers",
        source_id: ids.shared,
        causation_event_id: null,
      },
      {
        id: ids.eventChild,
        company_id: COMPANY_ID,
        source_table: "office_tasks",
        source_id: ids.taskMarked,
        causation_event_id: ids.eventLead,
      },
      {
        id: ids.eventUnrelated,
        company_id: COMPANY_ID,
        source_table: "jobs",
        source_id: ids.shared,
        causation_event_id: null,
      },
    ],
    automation_executions: [
      { id: ids.execution, company_id: COMPANY_ID, event_id: ids.eventChild },
    ],
    automation_attempts: [
      { id: ids.attempt, company_id: COMPANY_ID, execution_id: ids.execution },
    ],
    automation_audit_events: [
      { id: ids.auditEvent, company_id: COMPANY_ID, event_id: ids.eventLead },
      {
        id: ids.auditExecution,
        company_id: COMPANY_ID,
        event_id: ids.eventChild,
        execution_id: ids.execution,
      },
    ],
  };
}

function jsonPathValue(row, column) {
  if (column === "metadata->>testMarker") return row.metadata?.testMarker;
  return row[column];
}

function createMockService({ rpcError = null } = {}) {
  const tables = Object.fromEntries(
    Object.entries(fixtureTables()).map(([table, rows]) => [table, copyRows(rows)]),
  );
  const calls = [];
  let cleanupRequest = null;

  class Query {
    constructor(table) {
      this.table = table;
      this.filters = [];
    }

    select() {
      return this;
    }

    eq(column, value) {
      this.filters.push({ kind: "eq", column, value });
      return this;
    }

    like(column, value) {
      this.filters.push({ kind: "like", column, value });
      return this;
    }

    in(column, values) {
      this.filters.push({ kind: "in", column, value: values });
      return this;
    }

    execute() {
      calls.push({ type: "query", table: this.table, filters: this.filters });
      let rows = tables[this.table] ?? [];
      for (const filter of this.filters) {
        rows = rows.filter((row) => {
          const candidate = jsonPathValue(row, filter.column);
          if (filter.kind === "eq") return candidate === filter.value;
          if (filter.kind === "in") return filter.value.includes(candidate);
          const prefix = filter.value.endsWith("%")
            ? filter.value.slice(0, -1)
            : filter.value;
          return typeof candidate === "string" && candidate.startsWith(prefix);
        });
      }
      return { data: copyRows(rows), error: null };
    }

    then(resolve, reject) {
      return Promise.resolve(this.execute()).then(resolve, reject);
    }
  }

  const service = {
    auth: {
      admin: {
        async listUsers() {
          return {
            data: {
              users: [
                {
                  id: OWNER_ID,
                  email: "weathertech-os-regression@example.test",
                  app_metadata: {
                    provider: "email",
                    providers: ["email"],
                    wt_os_regression_marker: "weathertech-os-regression-owner-v1",
                    wt_os_regression_project_ref: "hygtnhmmaoboduqghhwg",
                  },
                },
              ],
            },
            error: null,
          };
        },
      },
    },
    from(table) {
      return new Query(table);
    },
    async rpc(name, args) {
      calls.push({ type: "rpc", name });
      cleanupRequest = args.cleanup_request;
      if (rpcError) return { data: null, error: { message: rpcError } };

      for (const [table, requestKey] of [
        ["automation_events", "eventIds"],
        ["automation_executions", "executionIds"],
        ["automation_attempts", "attemptIds"],
        ["automation_audit_events", "auditIds"],
        ["office_tasks", "taskIds"],
      ]) {
        const deletedIds = new Set(cleanupRequest[requestKey]);
        tables[table] = tables[table].filter((row) => !deletedIds.has(row.id));
      }

      return {
        data: {
          ok: true,
          status: "cleaned",
          counts: {
            auditEvents: cleanupRequest.auditIds.length,
            attempts: cleanupRequest.attemptIds.length,
            tasks: cleanupRequest.taskIds.length,
            executions: cleanupRequest.executionIds.length,
            events: cleanupRequest.eventIds.length,
          },
          databaseResidueCount: 0,
        },
        error: null,
      };
    },
  };

  return {
    service,
    calls,
    tables,
    get cleanupRequest() {
      return cleanupRequest;
    },
  };
}

assert.equal(
  createBrowserCompatibleRegressionRunId({ now: 1_720_000_000_000, randomSuffix: 7 }),
  RUN_ID,
);
assert.throws(
  () => createBrowserCompatibleRegressionRunId({ now: 1, randomSuffix: 7 }),
  /millisecond timestamp plus a four-digit random suffix/i,
);
assert.deepEqual(
  canonicalSourceRecords([
    { sourceTable: "leads", rows: [{ id: ids.shared }, { id: ids.shared }] },
    { sourceTable: "customers", rows: [{ id: ids.shared }] },
  ]),
  [
    { sourceTable: "customers", sourceId: ids.shared },
    { sourceTable: "leads", sourceId: ids.shared },
  ],
  "Source records are unique and canonical by the complete table/id key.",
);

const successful = createMockService();
const result = await cleanupSyntheticAutomationRegressionLedger({
  service: successful.service,
  ownerEmail: "weathertech-os-regression@example.test",
  runId: RUN_ID,
  sourceMarker: SOURCE_MARKER,
  additionalSourceCandidates: [
    {
      sourceTable: "jobs",
      sourceId: ids.job,
      title: `${SOURCE_MARKER} JOB`,
    },
    {
      sourceTable: "invoices",
      sourceId: ids.invoice,
      title: `Invoice for ${SOURCE_MARKER} ACCEPTED PROPOSAL`,
    },
    {
      sourceTable: "email_messages",
      sourceId: ids.email,
      subject: `${SOURCE_MARKER} EMAIL`,
    },
  ],
});
const request = successful.cleanupRequest;
const sourceKeys = request.sourceRecords.map(
  (record) => `${record.sourceTable}:${record.sourceId}`,
);

assert.equal(result.invoked, true);
assert.equal(result.databaseResidueCount, 0);
assert.equal(request.markerFamily, "browser");
assert.equal(request.runId, RUN_ID);
assert.equal(request.sourceMarker, SOURCE_MARKER);
assert.equal(request.providerMarker, PROVIDER_MARKER);
assert.match(request.operationKey, /^[0-9a-f-]{36}$/i);
assert.deepEqual(sourceKeys, [...sourceKeys].sort());
for (const sourceTable of [
  "leads",
  "customers",
  "inspections",
  "estimates",
  "jobs",
  "invoices",
  "office_tasks",
  "communication_provider_events",
  "email_messages",
  "call_records",
  "ai_audit_events",
]) {
  assert.ok(
    request.sourceRecords.some((record) => record.sourceTable === sourceTable),
    `${sourceTable} must be represented in the exact current-run source graph.`,
  );
}
assert.ok(sourceKeys.includes(`leads:${ids.shared}`));
assert.ok(sourceKeys.includes(`customers:${ids.shared}`));
assert.ok(!sourceKeys.includes(`customers:${ids.collision}`));
assert.deepEqual(request.eventIds, [ids.eventChild, ids.eventCustomer, ids.eventLead].sort());
assert.ok(!request.eventIds.includes(ids.eventUnrelated));
assert.deepEqual(request.executionIds, [ids.execution]);
assert.deepEqual(request.attemptIds, [ids.attempt]);
assert.deepEqual(request.auditIds, [ids.auditEvent, ids.auditExecution].sort());
assert.deepEqual(request.taskIds, [ids.engineTask]);
assert.ok(successful.tables.automation_events.some((row) => row.id === ids.eventUnrelated));
assert.ok(successful.tables.leads.some((row) => row.id === ids.shared));
assert.ok(
  successful.calls.findIndex((call) => call.type === "rpc") <
    successful.calls.findLastIndex((call) => call.type === "query"),
  "The helper independently verifies exact graph residue after the cleanup RPC.",
);

for (const additionalSource of [
  { sourceTable: "jobs", sourceId: ids.job },
  { sourceTable: "invoices", sourceId: ids.invoice },
  { sourceTable: "email_messages", sourceId: ids.email },
]) {
  assert.ok(
    request.sourceRecords.some(
      (record) =>
        record.sourceTable === additionalSource.sourceTable &&
        record.sourceId === additionalSource.sourceId,
    ),
    `Supported proposal source ${additionalSource.sourceTable} must be merged into the cleanup request.`,
  );
}

for (const unsupportedCandidate of [
  {
    sourceTable: "invoices",
    sourceId: ids.invoice,
    title: `Required deposit - ${SOURCE_MARKER} ACCEPTED PROPOSAL`,
  },
  {
    sourceTable: "email_messages",
    sourceId: ids.email,
    subject: "Your proposal is ready to review",
  },
]) {
  const refused = createMockService();
  await assert.rejects(
    cleanupSyntheticAutomationRegressionLedger({
      service: refused.service,
      ownerEmail: "weathertech-os-regression@example.test",
      runId: RUN_ID,
      sourceMarker: SOURCE_MARKER,
      additionalSourceCandidates: [unsupportedCandidate],
    }),
    /outside the protected cleanup contract/i,
  );
  assert.equal(
    refused.calls.length,
    0,
    "An unsupported proposal source is refused before database discovery or RPC mutation.",
  );
  assert.equal(refused.tables.automation_events.length, 4);
  assert.equal(refused.tables.invoices.length, 1);
  assert.equal(refused.tables.email_messages.length, 1);
}

const failing = createMockService({ rpcError: "forced exact cleanup refusal" });
await assert.rejects(
  cleanupSyntheticAutomationRegressionLedger({
    service: failing.service,
    ownerEmail: "weathertech-os-regression@example.test",
    runId: RUN_ID,
    sourceMarker: SOURCE_MARKER,
  }),
  /automation ledger cleanup failed: forced exact cleanup refusal/i,
);
assert.equal(failing.tables.leads.length, 1);
assert.equal(failing.tables.automation_events.length, 4);
assert.equal(
  failing.calls.filter((call) => call.type === "rpc").length,
  1,
  "An RPC refusal propagates once without deleting a source or ledger row.",
);

const helperSource = readFileSync(
  join(process.cwd(), "scripts", "synthetic-automation-regression-cleanup.mjs"),
  "utf8",
);
for (const contract of [
  '.eq("source_table", sourceTable)',
  '.in("source_id",',
  '.in("causation_event_id", frontier)',
  'service.rpc(\n    "wtos_cleanup_synthetic_automation_fixture"',
  'markerFamily: "browser"',
  "validateAdditionalSourceCandidates(",
  "...explicitSourceRecords",
  "Invoice for ${sourceMarker}",
  "sourceRecords,\n        ...graph",
  "countExactGraphResidue(service, graph)",
]) {
  assert.ok(helperSource.includes(contract), `Shared cleanup helper must retain ${contract}`);
}
assert.doesNotMatch(helperSource, /gahfcgyjtfwwmsterhzu/);
assert.doesNotMatch(helperSource, /\.delete\s*\(/);
assert.doesNotMatch(helperSource, /api\.twilio\.com|openai\.com|anthropic\.com/i);

console.log("Synthetic automation regression cleanup helper: PASS");
