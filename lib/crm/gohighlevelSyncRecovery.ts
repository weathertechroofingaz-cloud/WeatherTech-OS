import type { IntegrationConnectionRecord, IntegrationSyncLogRecord } from "./types";

export type GoHighLevelSyncRecovery = {
  log: IntegrationSyncLogRecord;
  kind: "operation_recovered" | "setup_superseded";
};

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function completedTime(log: IntegrationSyncLogRecord) {
  return log.completed_at ? Date.parse(log.completed_at) : Number.NaN;
}

function attemptedTime(log: IntegrationSyncLogRecord) {
  const times = [log.created_at, log.last_attempted_at, log.completed_at]
    .filter((value): value is string => value !== null)
    .map((value) => Date.parse(value));
  return times.every(Number.isFinite) ? Math.max(...times) : Number.NaN;
}

function resourceCounts(value: unknown): Map<string, number> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const counts = new Map<string, number>();
  for (const resource of value) {
    if (!resource || typeof resource !== "object" || !nonempty(resource.resourceType)) {
      return null;
    }
    counts.set(resource.resourceType, (counts.get(resource.resourceType) ?? 0) + 1);
  }
  return counts;
}

function isCompleteReadOnlySync(log: IntegrationSyncLogRecord) {
  const summary = log.response_summary;
  const resources = summary.resources;
  const counts = resourceCounts(resources);
  const fullRunResources = [
    "location", "contact", "conversation", "calendar", "pipeline", "opportunity",
    "calendar_event", "review", "message", "call",
  ];
  return (
    log.request_summary.readOnlyProviderSync === true &&
    log.request_summary.outboundWrites === false &&
    summary.providerRecordsChanged === false &&
    summary.totalFailed === 0 &&
    counts !== null &&
    fullRunResources.every((type) => (counts.get(type) ?? 0) >= (type === "message" ? 2 : 1)) &&
    Array.isArray(resources) &&
    resources.every((resource) =>
      resource.failed === 0 && resource.paginationTruncated === false,
    ) &&
    summary.pagination !== null &&
    typeof summary.pagination === "object" &&
    "ceilingReached" in summary.pagination &&
    summary.pagination.ceilingReached === false &&
    summary.providerRequests !== null &&
    typeof summary.providerRequests === "object" &&
    "deadlineReached" in summary.providerRequests &&
    summary.providerRequests.deadlineReached === false
  );
}

function sameOperation(failure: IntegrationSyncLogRecord, success: IntegrationSyncLogRecord) {
  if (
    failure.company_id !== success.company_id ||
    !nonempty(failure.company_id) ||
    failure.event_type !== success.event_type ||
    failure.direction !== "provider_to_weathertech" ||
    success.direction !== failure.direction ||
    failure.related_table !== success.related_table ||
    failure.related_record_id !== success.related_record_id
  ) return false;

  if (failure.event_type === "gohighlevel.sync") {
    // Sync runs have no external_id: the non-null connection is their location binding.
    // Never equate two absent connections or let a contact/message operation clear a run.
    if (
      !nonempty(failure.integration_connection_id) ||
      failure.integration_connection_id !== success.integration_connection_id ||
      failure.external_id !== success.external_id ||
      failure.request_summary.readOnlyProviderSync !== true ||
      failure.request_summary.outboundWrites !== false ||
      !isCompleteReadOnlySync(success)
    ) return false;

    const failedResources = resourceCounts(failure.response_summary.resources);
    if (failure.response_summary.resources !== undefined && !failedResources) return false;
    const successfulResources = resourceCounts(success.response_summary.resources)!;
    // Message occurs twice (SMS and email). Preserve multiplicity instead of treating
    // one successful channel as evidence that every failed channel recovered.
    return !failedResources || [...failedResources].every(([type, count]) =>
      (successfulResources.get(type) ?? 0) >= count,
    );
  }

  if (failure.event_type === "gohighlevel.oauth") {
    if (
      failure.request_summary.oauthCallback !== true ||
      success.request_summary.oauthCallback !== true ||
      success.response_summary.connected !== true ||
      success.response_summary.tokenStoredEncrypted !== true ||
      !nonempty(success.integration_connection_id) ||
      !nonempty(success.external_id)
    ) return false;

    // A failed consent often has no location/connection. Company membership alone
    // cannot prove that a later consent was for the same provider account.
    if (
      (nonempty(failure.integration_connection_id) &&
        failure.integration_connection_id !== success.integration_connection_id) ||
      (nonempty(failure.external_id) && failure.external_id !== success.external_id)
    ) return false;
    return (
      (nonempty(failure.integration_connection_id) && nonempty(failure.external_id)) ||
      (nonempty(failure.request_fingerprint) &&
        failure.request_fingerprint === success.request_fingerprint)
    );
  }

  // In particular, sync/OAuth success never proves delivery or webhook recovery.
  return false;
}

/** View-only recovery evidence; never changes or discards the immutable audit rows. */
export function getRecoveredGoHighLevelSyncLogs(
  logs: readonly IntegrationSyncLogRecord[],
  connections: readonly IntegrationConnectionRecord[] = [],
): Map<string, GoHighLevelSyncRecovery> {
  const recovered = new Map<string, GoHighLevelSyncRecovery>();
  const successes = logs
    .filter((log) =>
      log.provider === "gohighlevel" && log.status === "succeeded" &&
      !log.error_code && !log.error_message && Number.isFinite(completedTime(log)),
    )
    .sort((left, right) => completedTime(right) - completedTime(left));
  for (const failure of logs) {
    if (
      failure.provider !== "gohighlevel" ||
      (failure.status !== "failed" && failure.status !== "retrying")
    ) continue;
    const failedAt = attemptedTime(failure);
    if (!Number.isFinite(failedAt)) continue;
    const success = successes.find((candidate) =>
      completedTime(candidate) > failedAt && sameOperation(failure, candidate),
    );
    if (success) {
      recovered.set(failure.id, { log: success, kind: "operation_recovered" });
      continue;
    }

    // Initial consent can fail before any location is bound. It remains a failed
    // audit, but no longer describes current company setup after an exact first
    // connection succeeds. This does not claim that an unknown location recovered.
    if (
      failure.event_type !== "gohighlevel.oauth" ||
      failure.direction !== "provider_to_weathertech" ||
      failure.integration_connection_id !== null ||
      failure.external_id !== null ||
      failure.related_table !== null ||
      failure.related_record_id !== null ||
      failure.request_summary.oauthCallback !== true ||
      failure.response_summary.connected !== false
    ) continue;
    const companyConnections = connections.filter((connection) =>
      connection.provider === "gohighlevel" && connection.company_id === failure.company_id,
    );
    const connection = companyConnections[0];
    if (
      companyConnections.length !== 1 ||
      connection.status !== "connected" ||
      connection.last_error ||
      !nonempty(connection.id) ||
      !nonempty(connection.external_account_id) ||
      !(Date.parse(connection.created_at) > failedAt)
    ) continue;
    const setupSuccess = successes.find((candidate) =>
      candidate.company_id === failure.company_id &&
      candidate.event_type === "gohighlevel.oauth" &&
      candidate.direction === "provider_to_weathertech" &&
      candidate.integration_connection_id === connection.id &&
      candidate.external_id === connection.external_account_id &&
      candidate.request_summary.oauthCallback === true &&
      candidate.response_summary.connected === true &&
      candidate.response_summary.tokenStoredEncrypted === true &&
      // The callback captures completed_at before inserting the connection, so
      // require the success audit insert (not its captured timestamp) afterward.
      Date.parse(candidate.created_at) >= Date.parse(connection.created_at) &&
      completedTime(candidate) > failedAt,
    );
    if (!setupSuccess) continue;
    const laterFailure = logs.some((candidate) =>
      candidate.provider === "gohighlevel" &&
      candidate.company_id === failure.company_id &&
      candidate.event_type === "gohighlevel.oauth" &&
      (candidate.status === "failed" || candidate.status === "retrying") &&
      (!Number.isFinite(attemptedTime(candidate)) ||
        attemptedTime(candidate) >= completedTime(setupSuccess)),
    );
    if (!laterFailure) {
      recovered.set(failure.id, { log: setupSuccess, kind: "setup_superseded" });
    }
  }
  return recovered;
}
