import crypto, { randomUUID } from "node:crypto";

const REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg";
const REGRESSION_OWNER_ID = "2150c43d-c5b6-4560-9ecb-142561ba1dc2";
const REGRESSION_OWNER_MARKER = "weathertech-os-regression-owner-v1";
const SOURCE_PREFIX = "TEST WTOS REGRESSION";
const PROVIDER_PREFIX = "TEST WTOS MIGHTY APES REGRESSION:";

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

function exactSourceRecords(groups) {
  return [
    ...new Map(
      groups
        .flatMap(({ sourceTable, rows }) =>
          rows.map((row) => ({ sourceTable, sourceId: row.id })),
        )
        .map((record) => [`${record.sourceTable}:${record.sourceId}`, record]),
    ).values(),
  ].sort((left, right) =>
    `${left.sourceTable}:${left.sourceId}`.localeCompare(
      `${right.sourceTable}:${right.sourceId}`,
    ),
  );
}

export function createBrowserCompatibleRegressionRunId({
  now = Date.now(),
  randomSuffix = crypto.randomInt(0, 10_000),
} = {}) {
  const timestamp = String(now);
  const suffix = String(randomSuffix).padStart(4, "0");
  const runId = `${timestamp}${suffix}`;

  requireCondition(
    /^[0-9]{17}$/.test(runId),
    "Twilio cleanup requires a millisecond timestamp plus a four-digit random suffix.",
  );
  return runId;
}

async function findRegressionOwnerIdentity(service, ownerEmail) {
  const matches = [];

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`Verify Twilio regression owner failed: ${error.message}`);
    }

    const users = data?.users ?? [];
    matches.push(
      ...users.filter((user) => user.email?.toLowerCase() === ownerEmail.toLowerCase()),
    );
    if (users.length < 100) break;
  }

  requireCondition(
    matches.length === 1,
    "The exact synthetic Twilio regression owner is missing or ambiguous.",
  );
  const [owner] = matches;
  requireCondition(
    owner.id === REGRESSION_OWNER_ID &&
      owner.app_metadata?.wt_os_regression_marker === REGRESSION_OWNER_MARKER &&
      owner.app_metadata?.wt_os_regression_project_ref === REGRESSION_PROJECT_REF &&
      owner.app_metadata?.provider === "email" &&
      JSON.stringify(owner.app_metadata?.providers) === JSON.stringify(["email"]),
    "The Twilio regression owner does not carry the pinned project markers.",
  );
  return owner;
}

async function normalizeExactLedgerSourceMarkers({
  service,
  sourceMarker,
  capturedSourceIds,
}) {
  const normalized = {};

  for (const sourceTable of ["call_records", "communication_provider_events"]) {
    const capturedIds = [...new Set((capturedSourceIds[sourceTable] ?? []).filter(Boolean))];
    if (!capturedIds.length) {
      normalized[sourceTable] = [];
      continue;
    }

    const events = await requireRows(
      service
        .from("automation_events")
        .select("id,source_id")
        .eq("source_table", sourceTable)
        .in("source_id", capturedIds),
      `Discover exact ${sourceTable} automation roots`,
    );
    const rootIds = [...new Set(events.map((event) => event.source_id).filter(Boolean))].sort();
    if (!rootIds.length) {
      normalized[sourceTable] = [];
      continue;
    }

    const sourceRows = await requireRows(
      service
        .from(sourceTable)
        .select("id,company_id,correlation_id")
        .in("id", rootIds),
      `Read exact ${sourceTable} cleanup roots`,
    );
    requireCondition(
      sortedUniqueIds(sourceRows).join(",") === rootIds.join(",") &&
        sourceRows.every(
          (row) =>
            row.company_id &&
            (!String(row.correlation_id ?? "").startsWith(SOURCE_PREFIX) ||
              String(row.correlation_id).startsWith(sourceMarker)),
        ),
      `Exact ${sourceTable} cleanup roots are missing, unowned, or marker-conflicted.`,
    );

    const correlationMarker = `${sourceMarker} ${sourceTable.toUpperCase()} SOURCE`;
    const updatedRows = await requireRows(
      service
        .from(sourceTable)
        .update({ correlation_id: correlationMarker })
        .in("id", rootIds)
        .select("id,correlation_id"),
      `Mark exact ${sourceTable} automation roots for cleanup`,
    );
    requireCondition(
      sortedUniqueIds(updatedRows).join(",") === rootIds.join(",") &&
        updatedRows.every((row) => row.correlation_id === correlationMarker),
      `Exact ${sourceTable} cleanup marker update was incomplete.`,
    );
    normalized[sourceTable] = rootIds;
  }

  return normalized;
}

async function discoverMarkedSources(service, sourceMarker) {
  const markerPattern = `${sourceMarker}%`;
  const [leads, customers, calls, providerEvents, tasksByTitle, tasksByNotes] =
    await Promise.all([
      requireRows(
        service.from("leads").select("id").like("contact_name", markerPattern),
        "Discover marked Twilio leads",
      ),
      requireRows(
        service.from("customers").select("id").like("display_name", markerPattern),
        "Discover marked Twilio customers",
      ),
      requireRows(
        service.from("call_records").select("id").like("correlation_id", markerPattern),
        "Discover marked Twilio calls",
      ),
      requireRows(
        service
          .from("communication_provider_events")
          .select("id")
          .like("correlation_id", markerPattern),
        "Discover marked Twilio provider events",
      ),
      requireRows(
        service.from("office_tasks").select("id").like("title", markerPattern),
        "Discover marked Twilio tasks by title",
      ),
      requireRows(
        service.from("office_tasks").select("id").like("notes", markerPattern),
        "Discover marked Twilio tasks by notes",
      ),
    ]);
  const leadIds = sortedUniqueIds(leads);
  const tasksByLead = leadIds.length
    ? await requireRows(
        service.from("office_tasks").select("id").in("lead_id", leadIds),
        "Discover marked-lead Twilio automation tasks",
      )
    : [];

  return exactSourceRecords([
    { sourceTable: "leads", rows: leads },
    { sourceTable: "customers", rows: customers },
    {
      sourceTable: "office_tasks",
      rows: mergeRowsById(tasksByTitle, tasksByNotes, tasksByLead),
    },
    { sourceTable: "call_records", rows: calls },
    { sourceTable: "communication_provider_events", rows: providerEvents },
  ]);
}

async function discoverAutomationLedgerGraph(service, sourceRecords) {
  const sourceIdsByTable = new Map();
  for (const source of sourceRecords) {
    const ids = sourceIdsByTable.get(source.sourceTable) ?? [];
    ids.push(source.sourceId);
    sourceIdsByTable.set(source.sourceTable, ids);
  }

  const baseEvents = [];
  for (const [sourceTable, sourceIds] of sourceIdsByTable) {
    baseEvents.push(
      ...(await requireRows(
        service
          .from("automation_events")
          .select("id,company_id,source_table,source_id,causation_event_id")
          .eq("source_table", sourceTable)
          .in("source_id", [...new Set(sourceIds)]),
        `Discover ${sourceTable} Twilio automation events`,
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
      "Discover recursive Twilio automation events",
    );
    const next = [];
    for (const child of children) {
      if (!eventsById.has(child.id)) {
        eventsById.set(child.id, child);
        next.push(child.id);
      }
    }
    requireCondition(
      eventsById.size <= 2000,
      "Twilio automation graph exceeds its cleanup bound.",
    );
    frontier = next;
  }

  const eventIds = [...eventsById.keys()].sort();
  const executions = eventIds.length
    ? await requireRows(
        service
          .from("automation_executions")
          .select("id,company_id,event_id")
          .in("event_id", eventIds),
        "Discover Twilio automation executions",
      )
    : [];
  const executionIds = sortedUniqueIds(executions);
  const attempts = executionIds.length
    ? await requireRows(
        service
          .from("automation_attempts")
          .select("id,company_id,execution_id")
          .in("execution_id", executionIds),
        "Discover Twilio automation attempts",
      )
    : [];
  const [eventAudits, executionAudits, engineTasks] = await Promise.all([
    eventIds.length
      ? requireRows(
          service
            .from("automation_audit_events")
            .select("id,company_id,event_id,execution_id,audit_type")
            .in("event_id", eventIds),
          "Discover Twilio event audits",
        )
      : [],
    executionIds.length
      ? requireRows(
          service
            .from("automation_audit_events")
            .select("id,company_id,event_id,execution_id,audit_type")
            .in("execution_id", executionIds),
          "Discover Twilio execution audits",
        )
      : [],
    executionIds.length
      ? requireRows(
          service
            .from("office_tasks")
            .select("id,company_id,automation_execution_id")
            .in("automation_execution_id", executionIds),
          "Discover Twilio automation office tasks",
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

export async function cleanupTwilioSyntheticAutomationLedger({
  service,
  ownerEmail,
  runId,
  sourceMarker,
  capturedSourceIds,
}) {
  requireCondition(
    /^[0-9]{17}$/.test(runId) && sourceMarker === `${SOURCE_PREFIX} ${runId}`,
    "Twilio cleanup marker is not an exact Browser-compatible regression marker.",
  );
  const normalizedSources = await normalizeExactLedgerSourceMarkers({
    service,
    sourceMarker,
    capturedSourceIds,
  });
  const sourceRecords = await discoverMarkedSources(service, sourceMarker);
  if (!sourceRecords.length) {
    return {
      invoked: false,
      normalizedSources,
      sourceRecords: 0,
      counts: { auditEvents: 0, attempts: 0, tasks: 0, executions: 0, events: 0 },
      databaseResidueCount: 0,
    };
  }

  const graph = await discoverAutomationLedgerGraph(service, sourceRecords);
  if (!graph.eventIds.length) {
    return {
      invoked: false,
      normalizedSources,
      sourceRecords: sourceRecords.length,
      counts: { auditEvents: 0, attempts: 0, tasks: 0, executions: 0, events: 0 },
      databaseResidueCount: 0,
    };
  }
  requireCondition(
    graph.auditIds.length > 0,
    "Twilio automation events are missing immutable audit evidence.",
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
        providerMarker: `${PROVIDER_PREFIX} ${runId}`,
        sourceRecords,
        ...graph,
      },
    },
  );
  if (error) {
    throw new Error(`Twilio automation ledger cleanup failed: ${error.message}`);
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
    "Twilio automation cleanup returned an inexact sanitized receipt.",
  );

  return {
    invoked: true,
    normalizedSources,
    sourceRecords: sourceRecords.length,
    ...receipt,
  };
}
