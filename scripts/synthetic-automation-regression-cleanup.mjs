import crypto, { randomUUID } from "node:crypto";

const REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg";
const REGRESSION_OWNER_ID = "2150c43d-c5b6-4560-9ecb-142561ba1dc2";
const REGRESSION_OWNER_EMAIL = "weathertech-os-regression@example.test";
const REGRESSION_OWNER_MARKER = "weathertech-os-regression-owner-v1";
const SOURCE_PREFIX = "TEST WTOS REGRESSION";
const PROVIDER_PREFIX = "TEST WTOS MIGHTY APES REGRESSION:";
const MAX_SOURCE_RECORDS = 500;
const MAX_AUTOMATION_EVENTS = 2000;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requireRows(query, label) {
  const { data, error } = await query;
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
  return data ?? [];
}

function sortedUniqueIds(rows) {
  return [...new Set(rows.map((row) => row?.id).filter(Boolean))].sort();
}

function mergeRowsById(...groups) {
  return [
    ...new Map(
      groups
        .flat()
        .filter((row) => row?.id)
        .map((row) => [row.id, row]),
    ).values(),
  ];
}

function canonicalizeSourceRecordList(records) {
  return [
    ...new Map(
      records
        .filter((record) => record.sourceTable && record.sourceId)
        .map((record) => [`${record.sourceTable}:${record.sourceId}`, record]),
    ).values(),
  ].sort((left, right) =>
    `${left.sourceTable}:${left.sourceId}`.localeCompare(
      `${right.sourceTable}:${right.sourceId}`,
    ),
  );
}

export function canonicalSourceRecords(groups) {
  return canonicalizeSourceRecordList(
    groups.flatMap(({ sourceTable, rows }) =>
      rows.map((row) => ({ sourceTable, sourceId: row.id })),
    ),
  );
}

export function createBrowserCompatibleRegressionRunId({
  now = Date.now(),
  randomSuffix = crypto.randomInt(0, 10_000),
} = {}) {
  const runId = `${String(now)}${String(randomSuffix).padStart(4, "0")}`;
  requireCondition(
    /^[0-9]{17}$/.test(runId),
    "Synthetic automation cleanup requires a millisecond timestamp plus a four-digit random suffix.",
  );
  return runId;
}

async function findRegressionOwnerIdentity(service, ownerEmail) {
  requireCondition(
    ownerEmail?.toLowerCase() === REGRESSION_OWNER_EMAIL,
    "Synthetic automation cleanup requires the canonical isolated regression owner email.",
  );
  const matches = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`Verify synthetic automation regression owner failed: ${error.message}`);
    }

    const users = data?.users ?? [];
    matches.push(
      ...users.filter((user) => user.email?.toLowerCase() === REGRESSION_OWNER_EMAIL),
    );
    if (users.length < 100) break;
  }

  requireCondition(
    matches.length === 1,
    "The exact synthetic automation regression owner is missing or ambiguous.",
  );
  const [owner] = matches;
  requireCondition(
    owner.id === REGRESSION_OWNER_ID &&
      owner.app_metadata?.wt_os_regression_marker === REGRESSION_OWNER_MARKER &&
      owner.app_metadata?.wt_os_regression_project_ref === REGRESSION_PROJECT_REF &&
      owner.app_metadata?.provider === "email" &&
      JSON.stringify(owner.app_metadata?.providers) === JSON.stringify(["email"]),
    "The synthetic automation regression owner does not carry the pinned project markers.",
  );
  return owner;
}

async function discoverMarkerRows(service, table, column, marker, label) {
  const [exactRows, suffixedRows] = await Promise.all([
    requireRows(
      service.from(table).select("id").eq(column, marker),
      `${label} by exact marker`,
    ),
    requireRows(
      service.from(table).select("id").like(column, `${marker} %`),
      `${label} by suffixed marker`,
    ),
  ]);
  return mergeRowsById(exactRows, suffixedRows);
}

function markerMatches(candidate, exactMarker) {
  return (
    typeof candidate === "string" &&
    (candidate === exactMarker || candidate.startsWith(`${exactMarker} `))
  );
}

export function validateAdditionalSourceCandidates(candidates, sourceMarker) {
  requireCondition(
    Array.isArray(candidates),
    "Synthetic automation additional source candidates must be an array.",
  );

  return canonicalizeSourceRecordList(
    candidates.map((candidate) => {
      requireCondition(
        candidate &&
          typeof candidate === "object" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            candidate.sourceId ?? "",
          ),
        "Synthetic automation additional source candidates require exact table and id values.",
      );

      let markerValid = false;
      if (candidate.sourceTable === "jobs") {
        markerValid = markerMatches(candidate.title, sourceMarker);
      } else if (candidate.sourceTable === "invoices") {
        markerValid =
          markerMatches(candidate.title, sourceMarker) ||
          markerMatches(candidate.title, `Invoice for ${sourceMarker}`);
      } else if (candidate.sourceTable === "email_messages") {
        markerValid = markerMatches(candidate.subject, sourceMarker);
      } else {
        throw new Error(
          `Synthetic automation additional source table ${candidate.sourceTable ?? "<missing>"} is unsupported.`,
        );
      }

      requireCondition(
        markerValid,
        `Synthetic automation cleanup refused proposal-linked ${candidate.sourceTable} ${candidate.sourceId} because its marker field is outside the protected cleanup contract.`,
      );
      return { sourceTable: candidate.sourceTable, sourceId: candidate.sourceId };
    }),
  );
}

async function discoverCurrentRunSources(service, sourceMarker, providerMarker) {
  const [
    leads,
    customers,
    inspections,
    estimates,
    jobs,
    invoicesBySource,
    invoicesByGeneratedTitle,
    tasksByTitle,
    tasksByNotes,
    providerEventsBySource,
    providerEventsByProvider,
    emailMessages,
    callsBySource,
    callsByProvider,
    aiAudits,
  ] = await Promise.all([
    discoverMarkerRows(
      service,
      "leads",
      "contact_name",
      sourceMarker,
      "Discover marked regression leads",
    ),
    discoverMarkerRows(
      service,
      "customers",
      "display_name",
      sourceMarker,
      "Discover marked regression customers",
    ),
    discoverMarkerRows(
      service,
      "inspections",
      "title",
      sourceMarker,
      "Discover marked regression inspections",
    ),
    discoverMarkerRows(
      service,
      "estimates",
      "title",
      sourceMarker,
      "Discover marked regression estimates",
    ),
    discoverMarkerRows(
      service,
      "jobs",
      "title",
      sourceMarker,
      "Discover marked regression jobs",
    ),
    discoverMarkerRows(
      service,
      "invoices",
      "title",
      sourceMarker,
      "Discover marked regression invoices",
    ),
    discoverMarkerRows(
      service,
      "invoices",
      "title",
      `Invoice for ${sourceMarker}`,
      "Discover generated regression invoices",
    ),
    discoverMarkerRows(
      service,
      "office_tasks",
      "title",
      sourceMarker,
      "Discover marked regression tasks by title",
    ),
    discoverMarkerRows(
      service,
      "office_tasks",
      "notes",
      sourceMarker,
      "Discover marked regression tasks by notes",
    ),
    discoverMarkerRows(
      service,
      "communication_provider_events",
      "correlation_id",
      sourceMarker,
      "Discover source-marked regression provider events",
    ),
    discoverMarkerRows(
      service,
      "communication_provider_events",
      "correlation_id",
      providerMarker,
      "Discover provider-marked regression provider events",
    ),
    discoverMarkerRows(
      service,
      "email_messages",
      "subject",
      sourceMarker,
      "Discover marked regression emails",
    ),
    discoverMarkerRows(
      service,
      "call_records",
      "correlation_id",
      sourceMarker,
      "Discover source-marked regression calls",
    ),
    discoverMarkerRows(
      service,
      "call_records",
      "correlation_id",
      providerMarker,
      "Discover provider-marked regression calls",
    ),
    requireRows(
      service.from("ai_audit_events").select("id").eq("metadata->>testMarker", sourceMarker),
      "Discover marked regression AI audit events",
    ),
  ]);

  const linkedTaskQueries = [
    ["lead_id", sortedUniqueIds(leads)],
    ["inspection_id", sortedUniqueIds(inspections)],
    ["estimate_id", sortedUniqueIds(estimates)],
    ["job_id", sortedUniqueIds(jobs)],
  ].map(([column, ids]) =>
    ids.length
      ? requireRows(
          service.from("office_tasks").select("id").in(column, ids),
          `Discover regression tasks linked by ${column}`,
        )
      : [],
  );
  const linkedTasks = (await Promise.all(linkedTaskQueries)).flat();

  const sourceRecords = canonicalSourceRecords([
    { sourceTable: "leads", rows: leads },
    { sourceTable: "customers", rows: customers },
    { sourceTable: "inspections", rows: inspections },
    { sourceTable: "estimates", rows: estimates },
    { sourceTable: "jobs", rows: jobs },
    {
      sourceTable: "invoices",
      rows: mergeRowsById(invoicesBySource, invoicesByGeneratedTitle),
    },
    {
      sourceTable: "office_tasks",
      rows: mergeRowsById(tasksByTitle, tasksByNotes, linkedTasks),
    },
    {
      sourceTable: "communication_provider_events",
      rows: mergeRowsById(providerEventsBySource, providerEventsByProvider),
    },
    { sourceTable: "email_messages", rows: emailMessages },
    {
      sourceTable: "call_records",
      rows: mergeRowsById(callsBySource, callsByProvider),
    },
    { sourceTable: "ai_audit_events", rows: aiAudits },
  ]);

  requireCondition(
    sourceRecords.length <= MAX_SOURCE_RECORDS,
    "Synthetic automation source graph exceeds its cleanup bound.",
  );
  return sourceRecords;
}

async function discoverAutomationLedgerGraph(service, sourceRecords) {
  const sourceIdsByTable = new Map();
  for (const source of sourceRecords) {
    const ids = sourceIdsByTable.get(source.sourceTable) ?? [];
    ids.push(source.sourceId);
    sourceIdsByTable.set(source.sourceTable, ids);
  }

  const baseEvents = [];
  for (const sourceTable of [...sourceIdsByTable.keys()].sort()) {
    baseEvents.push(
      ...(await requireRows(
        service
          .from("automation_events")
          .select("id,company_id,source_table,source_id,causation_event_id")
          .eq("source_table", sourceTable)
          .in("source_id", [...new Set(sourceIdsByTable.get(sourceTable))].sort()),
        `Discover ${sourceTable} regression automation roots`,
      )),
    );
  }

  const eventsById = new Map(baseEvents.map((event) => [event.id, event]));
  let frontier = sortedUniqueIds(baseEvents);
  while (frontier.length) {
    const children = await requireRows(
      service
        .from("automation_events")
        .select("id,company_id,source_table,source_id,causation_event_id")
        .in("causation_event_id", frontier),
      "Discover recursive regression automation descendants",
    );
    const next = [];
    for (const child of children) {
      if (!eventsById.has(child.id)) {
        eventsById.set(child.id, child);
        next.push(child.id);
      }
    }
    requireCondition(
      eventsById.size <= MAX_AUTOMATION_EVENTS,
      "Synthetic automation event graph exceeds its cleanup bound.",
    );
    frontier = next.sort();
  }

  const eventIds = [...eventsById.keys()].sort();
  const executions = eventIds.length
    ? await requireRows(
        service
          .from("automation_executions")
          .select("id,company_id,event_id")
          .in("event_id", eventIds),
        "Discover regression automation executions",
      )
    : [];
  const executionIds = sortedUniqueIds(executions);
  const attempts = executionIds.length
    ? await requireRows(
        service
          .from("automation_attempts")
          .select("id,company_id,execution_id")
          .in("execution_id", executionIds),
        "Discover regression automation attempts",
      )
    : [];
  const [eventAudits, executionAudits, engineTasks] = await Promise.all([
    eventIds.length
      ? requireRows(
          service
            .from("automation_audit_events")
            .select("id,company_id,event_id,execution_id,audit_type")
            .in("event_id", eventIds),
          "Discover regression automation event audits",
        )
      : [],
    executionIds.length
      ? requireRows(
          service
            .from("automation_audit_events")
            .select("id,company_id,event_id,execution_id,audit_type")
            .in("execution_id", executionIds),
          "Discover regression automation execution audits",
        )
      : [],
    executionIds.length
      ? requireRows(
          service
            .from("office_tasks")
            .select("id,company_id,automation_execution_id")
            .in("automation_execution_id", executionIds),
          "Discover regression automation-linked tasks",
        )
      : [],
  ]);

  return {
    eventIds,
    executionIds,
    attemptIds: sortedUniqueIds(attempts),
    auditIds: sortedUniqueIds(mergeRowsById(eventAudits, executionAudits)),
    taskIds: sortedUniqueIds(engineTasks),
  };
}

async function countExactGraphResidue(service, graph) {
  const targets = [
    ["automation_events", graph.eventIds],
    ["automation_executions", graph.executionIds],
    ["automation_attempts", graph.attemptIds],
    ["automation_audit_events", graph.auditIds],
    ["office_tasks", graph.taskIds],
  ];
  const residue = await Promise.all(
    targets.map(([table, ids]) =>
      ids.length
        ? requireRows(
            service.from(table).select("id").in("id", ids),
            `Verify exact ${table} automation cleanup`,
          )
        : [],
    ),
  );
  return residue.reduce((count, rows) => count + rows.length, 0);
}

export async function cleanupSyntheticAutomationRegressionLedger({
  service,
  ownerEmail,
  runId,
  sourceMarker,
  additionalSourceCandidates = [],
}) {
  requireCondition(
    /^[0-9]{17}$/.test(runId) && sourceMarker === `${SOURCE_PREFIX} ${runId}`,
    "Synthetic automation cleanup marker is not an exact Browser-compatible regression marker.",
  );
  const providerMarker = `${PROVIDER_PREFIX} ${runId}`;
  const explicitSourceRecords = validateAdditionalSourceCandidates(
    additionalSourceCandidates,
    sourceMarker,
  );
  const discoveredSourceRecords = await discoverCurrentRunSources(
    service,
    sourceMarker,
    providerMarker,
  );
  const sourceRecords = canonicalizeSourceRecordList([
    ...discoveredSourceRecords,
    ...explicitSourceRecords,
  ]);
  requireCondition(
    sourceRecords.length <= MAX_SOURCE_RECORDS,
    "Synthetic automation source graph exceeds its cleanup bound.",
  );

  if (!sourceRecords.length) {
    return {
      invoked: false,
      sourceRecords: 0,
      counts: { auditEvents: 0, attempts: 0, tasks: 0, executions: 0, events: 0 },
      databaseResidueCount: 0,
    };
  }

  const graph = await discoverAutomationLedgerGraph(service, sourceRecords);
  if (!graph.eventIds.length) {
    return {
      invoked: false,
      sourceRecords: sourceRecords.length,
      counts: { auditEvents: 0, attempts: 0, tasks: 0, executions: 0, events: 0 },
      databaseResidueCount: 0,
    };
  }
  requireCondition(
    graph.auditIds.length > 0,
    "Synthetic automation events are missing immutable audit evidence.",
  );

  const owner = await findRegressionOwnerIdentity(service, ownerEmail);
  const { data: receipt, error } = await service.rpc(
    "wtos_cleanup_synthetic_automation_fixture",
    {
      cleanup_request: {
        operationKey: randomUUID(),
        regressionOwnerUserId: owner.id,
        markerFamily: "browser",
        runId,
        sourceMarker,
        providerMarker,
        sourceRecords,
        ...graph,
      },
    },
  );
  if (error) {
    throw new Error(`Synthetic automation ledger cleanup failed: ${error.message}`);
  }

  const expectedCounts = {
    auditEvents: graph.auditIds.length,
    attempts: graph.attemptIds.length,
    tasks: graph.taskIds.length,
    executions: graph.executionIds.length,
    events: graph.eventIds.length,
  };
  requireCondition(
    receipt?.ok === true &&
      receipt?.status === "cleaned" &&
      receipt?.databaseResidueCount === 0 &&
      Object.entries(expectedCounts).every(
        ([key, count]) => receipt?.counts?.[key] === count,
      ),
    "Synthetic automation cleanup returned an inexact sanitized receipt.",
  );

  const databaseResidueCount = await countExactGraphResidue(service, graph);
  requireCondition(
    databaseResidueCount === 0,
    "Synthetic automation cleanup did not reach exact graph zero.",
  );

  return {
    invoked: true,
    sourceRecords: sourceRecords.length,
    ...receipt,
    databaseResidueCount,
  };
}
