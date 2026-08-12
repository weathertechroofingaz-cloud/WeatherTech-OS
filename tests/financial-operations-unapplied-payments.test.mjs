import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-financial-operations-"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function payment(id, status) {
  return {
    id,
    company_id: "company-weathertech",
    customer_id: null,
    property_id: null,
    invoice_id: null,
    amount: 50,
    method: "stripe",
    status,
    paid_at: "2026-08-11T19:00:00.000Z",
    reference: id,
    notes: null,
    created_at: "2026-08-11T19:00:00.000Z",
    updated_at: "2026-08-11T19:00:00.000Z",
  };
}

try {
  const compile = spawnSync(
    join(cwd, "node_modules/.bin/tsc"),
    [
      "--target",
      "ES2022",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--skipLibCheck",
      "--outDir",
      outDir,
      "lib/crm/financialOperations.ts",
    ],
    { cwd, encoding: "utf8" },
  );

  assert(
    compile.status === 0,
    `Financial operations helpers did not compile: ${compile.stdout}${compile.stderr}`,
  );

  const helpers = await import(
    `${pathToFileURL(join(outDir, "financialOperations.js")).href}?v=${Date.now()}`
  );
  const snapshot = {
    companies: [
      {
        id: "company-weathertech",
        name: "WeatherTech Roofing LLC",
      },
    ],
    customers: [],
    properties: [],
    leads: [],
    estimates: [],
    estimateLineItems: [],
    scopes: [],
    jobs: [],
    scheduleEvents: [],
    employees: [],
    jobAssignments: [],
    timeEntries: [],
    jobTasks: [],
    jobNotes: [],
    jobMaterials: [],
    jobPhotos: [],
    dailyLogs: [],
    inspections: [],
    materialOrders: [],
    materialOrderItems: [],
    changeOrders: [],
    invoices: [],
    invoiceLineItems: [],
    payments: [
      payment("posted-payment", "posted"),
      payment("refunded-payment", "refunded"),
      payment("failed-payment", "failed"),
      payment("pending-payment", "pending"),
      payment("voided-payment", "voided"),
    ],
    documents: [],
    signatures: [],
    notifications: [],
    integrationConnections: [],
    calendarEventSyncs: [],
    emailMessages: [],
    smsMessages: [],
    callRecords: [],
    communicationProviderEvents: [],
    businessPhoneNumbers: [],
    integrationSyncLogs: [],
    leadSourceMappings: [],
    leadIntakeRecords: [],
    routePlans: [],
    routePlanStops: [],
    officeTasks: [],
  };

  const summary = helpers.buildFinancialOperationsSummary(snapshot, {
    now: new Date("2026-08-11T20:00:00.000Z"),
  });

  assert(
    summary.unappliedPayments.length === 1 &&
      summary.unappliedPayments[0]?.id === "posted-payment",
    "Only a completed, actionable orphaned payment should be unapplied.",
  );
  assert(
    summary.attentionItems.filter((item) => item.source === "payment").length === 1 &&
      summary.attentionItems.some((item) => item.sourceId === "posted-payment"),
    "Only the posted orphaned payment should produce an unapplied-payment alert.",
  );
  assert(
    !summary.attentionItems.some((item) =>
      [
        "refunded-payment",
        "failed-payment",
        "pending-payment",
        "voided-payment",
      ].includes(item.sourceId),
    ),
    "Refunded, failed, pending, and voided orphaned payments must remain non-actionable.",
  );

  console.log("Financial operations unapplied-payment filtering: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
