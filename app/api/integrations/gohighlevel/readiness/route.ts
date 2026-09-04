import { NextRequest, NextResponse } from "next/server";
import {
  goHighLevelLiveSyncStatusLabels,
  goHighLevelOAuthEndpoints,
  goHighLevelOAuthGuardrails,
  goHighLevelOAuthScopes,
  goHighLevelProductionBridgeMigration,
  goHighLevelSyncResources,
  type GoHighLevelLiveSyncStatus,
} from "../../../../../lib/gohighlevel/foundation";
import {
  GOHIGHLEVEL_API_BASE_URL,
  GOHIGHLEVEL_SYNC_EVENT_TYPE,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
  validateGoHighLevelGrantedScopes,
} from "../../../../../lib/gohighlevel/oauth";
import type {
  GoHighLevelResourceType,
  IntegrationSyncLogRecord,
} from "../../../../../lib/crm/types";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schemaTables = [
  "gohighlevel_sync_mappings",
  "gohighlevel_discovery_snapshots",
  "gohighlevel_oauth_states",
  "gohighlevel_oauth_credentials",
  "gohighlevel_resource_snapshots",
  "gohighlevel_communication_identities",
  "gohighlevel_communication_identity_aliases",
  "gohighlevel_communication_identity_conflicts",
  "gohighlevel_webhook_events",
  "communication_provider_events",
  "call_records",
  "integration_sync_logs",
] as const;

const resourceTypes: GoHighLevelResourceType[] = [
  "contact",
  "conversation",
  "message",
  "call",
  "calendar",
  "calendar_event",
  "pipeline",
  "opportunity",
  "review",
];

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function getTokenState(expiresAt: string | null | undefined) {
  if (!expiresAt) return "missing" as const;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return "invalid" as const;
  if (expiresAtMs <= Date.now()) return "expired" as const;
  if (expiresAtMs <= Date.now() + 10 * 60 * 1000) return "expiring" as const;
  return "valid" as const;
}

function getDuplicateMetric(log: IntegrationSyncLogRecord) {
  const direct = log.response_summary.totalDuplicatesSuppressed;
  if (typeof direct === "number" && Number.isFinite(direct) && direct >= 0) {
    return Math.floor(direct);
  }
  const legacy = log.response_summary.totalDeduplicated;
  if (typeof legacy === "number" && Number.isFinite(legacy) && legacy >= 0) {
    return Math.floor(legacy);
  }
  const resources = log.response_summary.resources;
  if (!Array.isArray(resources)) return 0;
  return resources.reduce((total, resource) => {
    if (!resource || typeof resource !== "object") return total;
    const record = resource as Record<string, unknown>;
    const value = record.duplicatesSuppressed ?? record.deduplicated;
    return typeof value === "number" && Number.isFinite(value) && value >= 0
      ? total + Math.floor(value)
      : total;
  }, 0);
}

function getSafeError(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 300) || null;
}

function getContactMatchStatus(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>).matchStatus;
  return status === "matched_customer" ||
    status === "matched_lead" ||
    status === "unmatched" ||
    status === "ambiguous"
    ? status
    : null;
}

async function loadBoundedCompanyEvidence<Row>({
  companyIds,
  limitPerCompany,
  load,
}: {
  companyIds: string[];
  limitPerCompany: number;
  load: (
    companyId: string,
    limit: number,
  ) => PromiseLike<{ data: Row[] | null; error: unknown }>;
}) {
  const results = await Promise.all(
    companyIds.map(async (companyId) => ({
      companyId,
      result: await load(companyId, limitPerCompany + 1),
    })),
  );
  const failed = results.find(({ result }) => result.error);
  return {
    data: results.flatMap(({ result }) =>
      (result.data ?? []).slice(0, limitPerCompany),
    ),
    error: failed?.result.error ?? null,
    truncatedCompanyIds: new Set(
      results
        .filter(({ result }) => (result.data?.length ?? 0) > limitPerCompany)
        .map(({ companyId }) => companyId),
    ),
  };
}

async function checkGoHighLevelSchemaReadiness(
  serviceClient: NonNullable<ReturnType<typeof createGoHighLevelServiceClient>>,
) {
  const tables = [];

  for (const table of schemaTables) {
    const { error } = await serviceClient
      .from(table)
      .select(
        table === "gohighlevel_oauth_credentials"
          ? "id, bridge_version, refresh_lease_acquired_at, refresh_lease_expires_at"
          : table === "gohighlevel_communication_identities"
            ? "id, canonical_external_id, last_observed_tuple_fingerprint"
            : table === "gohighlevel_communication_identity_aliases"
              ? "id, communication_identity_id, alias_type, external_id"
            : table === "gohighlevel_communication_identity_conflicts"
              ? "id, conflict_kind, status, occurrence_count, last_observed_at"
          : table === "gohighlevel_webhook_events"
            ? "id, duplicate_count, last_duplicate_at, claim_token, lease_expires_at"
            : table === "communication_provider_events" || table === "call_records"
              ? "id, provider_updated_at"
            : table === "integration_sync_logs"
              ? "id, claim_token_sha256, lease_expires_at"
          : "id",
      )
      .limit(1);
    tables.push({
      table,
      available: !error,
      message: error ? "Table is not available yet." : "Table is available.",
    });
  }

  const applied = tables.every((table) => table.available);
  return {
    checked: true,
    applied,
    migration: goHighLevelProductionBridgeMigration,
    tables,
    message: applied
      ? "GoHighLevel production communications bridge tables are available."
      : "Apply the prepared GoHighLevel production bridge migration.",
  };
}

export async function GET(request: NextRequest) {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createGoHighLevelServiceClient();
  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before checking HighLevel readiness." },
      { status: 401 },
    );
  }

  const { data: ownerMemberships, error: ownerMembershipsError } = await sessionClient
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userResult.user.id)
    .eq("role", "owner");
  if (ownerMembershipsError) {
    return NextResponse.json(
      { ok: false, message: "HighLevel owner access could not be verified." },
      { status: 503 },
    );
  }
  const companyIds = Array.from(
    new Set((ownerMemberships ?? []).map((membership) => membership.company_id)),
  );
  if (!companyIds.length) {
    return NextResponse.json(
      { ok: false, message: "A company owner must check HighLevel readiness." },
      { status: 403 },
    );
  }

  const requestedCompanyId = request.nextUrl.searchParams.get("companyId")?.trim() || null;
  if (requestedCompanyId && !companyIds.includes(requestedCompanyId)) {
    return NextResponse.json(
      { ok: false, message: "The selected company is not available to this owner." },
      { status: 403 },
    );
  }
  const targetCompanyIds = requestedCompanyId
    ? [requestedCompanyId]
    : companyIds;

  const config = getGoHighLevelOAuthConfig();
  const schema = await checkGoHighLevelSchemaReadiness(serviceClient);
  const [
    { data: companies, error: companiesError },
    { data: connections, error: connectionsError },
    { data: credentials, error: credentialsError },
    resourceEvidence,
    webhookEvidence,
    mappingEvidence,
    communicationIdentityConflictEvidence,
    syncLogEvidence,
    automationEvidence,
  ] =
    await Promise.all([
      serviceClient.from("companies").select("id, name").in("id", targetCompanyIds),
      serviceClient
        .from("integration_connections")
        .select("*")
        .eq("provider", "gohighlevel")
        .in("company_id", targetCompanyIds),
      schema.applied
        ? serviceClient
            .from("gohighlevel_oauth_credentials")
            .select("company_id, integration_connection_id, external_location_id, scopes, token_expires_at, revoked_at")
            .in("company_id", targetCompanyIds)
            .is("revoked_at", null)
        : Promise.resolve({ data: [], error: null }),
      schema.applied
        ? loadBoundedCompanyEvidence({
            companyIds: targetCompanyIds,
            limitPerCompany: 5_000,
            load: (companyId, limit) =>
              serviceClient
                .from("gohighlevel_resource_snapshots")
                .select(
                  "company_id, integration_connection_id, resource_type, external_id, customer_id, lead_id, payload_summary, last_synced_at",
                )
                .eq("company_id", companyId)
                .order("id", { ascending: true })
                .limit(limit),
          })
        : Promise.resolve({
            data: [],
            error: null,
            truncatedCompanyIds: new Set<string>(),
          }),
      schema.applied
        ? loadBoundedCompanyEvidence({
            companyIds: targetCompanyIds,
            limitPerCompany: 2_000,
            load: (companyId, limit) =>
              serviceClient
                .from("gohighlevel_webhook_events")
                .select(
                  "id, company_id, integration_connection_id, event_type, signature_version, processing_status, attempt_count, payload_sha256, lease_expires_at, last_attempted_at, error_message, occurred_at, processed_at, requeued_at, requeue_count, duplicate_count, last_duplicate_at, received_at",
                )
                .eq("company_id", companyId)
                .order("received_at", { ascending: false })
                .limit(limit),
          })
        : Promise.resolve({
            data: [],
            error: null,
            truncatedCompanyIds: new Set<string>(),
          }),
      schema.applied
        ? loadBoundedCompanyEvidence({
            companyIds: targetCompanyIds,
            limitPerCompany: 5_000,
            load: (companyId, limit) =>
              serviceClient
                .from("gohighlevel_sync_mappings")
                .select(
                  "company_id, integration_connection_id, external_object_type, external_id, sync_status, conflict_status, pending_sync, last_synced_at",
                )
                .eq("company_id", companyId)
                .order("id", { ascending: true })
                .limit(limit),
          })
        : Promise.resolve({
            data: [],
            error: null,
            truncatedCompanyIds: new Set<string>(),
          }),
      schema.applied
        ? loadBoundedCompanyEvidence({
            companyIds: targetCompanyIds,
            limitPerCompany: 2_000,
            load: (companyId, limit) =>
              serviceClient
                .from("gohighlevel_communication_identity_conflicts")
                .select(
                  "company_id, integration_connection_id, conflict_kind, status, occurrence_count, last_observed_at",
                )
                .eq("company_id", companyId)
                .eq("status", "open")
                .order("last_observed_at", { ascending: false })
                .limit(limit),
          })
        : Promise.resolve({
            data: [],
            error: null,
            truncatedCompanyIds: new Set<string>(),
          }),
      loadBoundedCompanyEvidence({
        companyIds: targetCompanyIds,
        limitPerCompany: 500,
        load: (companyId, limit) =>
          serviceClient
            .from("integration_sync_logs")
            .select("*")
            .eq("provider", "gohighlevel")
            .eq("event_type", GOHIGHLEVEL_SYNC_EVENT_TYPE)
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(limit),
      }),
      loadBoundedCompanyEvidence({
        companyIds: targetCompanyIds,
        limitPerCompany: 2_000,
        load: (companyId, limit) =>
          serviceClient
            .from("automation_events")
            .select("company_id, event_type, source_table, payload, occurred_at")
            .eq("company_id", companyId)
            .in("event_type", ["communication.received", "missed_call.received"])
            .contains("payload", { provider: "gohighlevel" })
            .order("occurred_at", { ascending: false })
            .limit(limit),
      }),
    ]);

  const { data: resourceSnapshots, error: resourceSnapshotsError } = resourceEvidence;
  const { data: webhookEvents, error: webhookEventsError } = webhookEvidence;
  const { data: syncMappings, error: syncMappingsError } = mappingEvidence;
  const {
    data: communicationIdentityConflicts,
    error: communicationIdentityConflictsError,
  } = communicationIdentityConflictEvidence;
  const { data: syncLogs, error: syncLogsError } = syncLogEvidence;
  const { data: automationEvents, error: automationEventsError } = automationEvidence;

  if (
    companiesError ||
    connectionsError ||
    credentialsError ||
    resourceSnapshotsError ||
    webhookEventsError ||
    syncMappingsError ||
    communicationIdentityConflictsError ||
    syncLogsError ||
    automationEventsError
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: "GoHighLevel operational readiness could not be loaded safely.",
      },
      { status: 503 },
    );
  }

  const connected = (connections ?? []).filter(
    (connection) => connection.status === "connected" && connection.external_account_id,
  );
  const activeCredentials = credentials ?? [];
  const allScopesValid = activeCredentials.every(
    (credential) => validateGoHighLevelGrantedScopes(credential.scopes).ok,
  );

  const companyStatuses = (companies ?? [])
    .map((company) => {
      const companyConnections = (connections ?? []).filter(
        (connection) => connection.company_id === company.id,
      );
      const connectedCompanyConnections = companyConnections.filter(
        (connection) =>
          connection.status === "connected" && Boolean(connection.external_account_id),
      );
      const connection = connectedCompanyConnections[0] ?? companyConnections[0] ?? null;
      const ambiguousConnections = connectedCompanyConnections.length > 1;
      const credential = connection
        ? activeCredentials.find(
            (candidate) => candidate.integration_connection_id === connection.id,
          ) ?? null
        : null;
      const credentialBindingValid = Boolean(
        credential &&
          credential.company_id === company.id &&
          credential.integration_connection_id === connection?.id &&
          credential.external_location_id === connection?.external_account_id,
      );
      const scopesValid = credential
        ? validateGoHighLevelGrantedScopes(credential.scopes).ok
        : false;
      const tokenState = getTokenState(credential?.token_expires_at);
      const companySnapshots = (resourceSnapshots ?? []).filter(
        (snapshot) =>
          snapshot.company_id === company.id &&
          (!connection || snapshot.integration_connection_id === connection.id),
      );
      const companyMappings = (syncMappings ?? []).filter(
        (mapping) =>
          mapping.company_id === company.id &&
          (!connection || mapping.integration_connection_id === connection.id),
      );
      const companyCommunicationIdentityConflicts =
        (communicationIdentityConflicts ?? []).filter(
          (conflict) =>
            conflict.company_id === company.id &&
            (!connection ||
              conflict.integration_connection_id === connection.id),
        );
      const companyWebhooks = (webhookEvents ?? []).filter(
        (event) =>
          event.company_id === company.id &&
          (!connection || event.integration_connection_id === connection.id),
      );
      const companySyncLogs = ((syncLogs ?? []) as IntegrationSyncLogRecord[]).filter(
        (log) =>
          log.company_id === company.id &&
          (!connection || log.integration_connection_id === connection.id),
      );
      const companyAutomationEvents = (automationEvents ?? []).filter(
        (event) =>
          event.company_id === company.id &&
          event.payload &&
          typeof event.payload === "object" &&
          !Array.isArray(event.payload) &&
          (event.payload as Record<string, unknown>).provider === "gohighlevel",
      );
      const resourceEvidenceTruncated =
        resourceEvidence.truncatedCompanyIds.has(company.id);
      const mappingEvidenceTruncated =
        mappingEvidence.truncatedCompanyIds.has(company.id);
      const communicationIdentityConflictEvidenceTruncated =
        communicationIdentityConflictEvidence.truncatedCompanyIds.has(company.id);
      const webhookEvidenceTruncated =
        webhookEvidence.truncatedCompanyIds.has(company.id);
      const syncLogEvidenceTruncated =
        syncLogEvidence.truncatedCompanyIds.has(company.id);
      const automationEvidenceTruncated =
        automationEvidence.truncatedCompanyIds.has(company.id);
      const byResource = Object.fromEntries(
        resourceTypes.map((resourceType) => [
          resourceType,
          companySnapshots.filter((snapshot) => snapshot.resource_type === resourceType)
            .length,
        ]),
      ) as Record<GoHighLevelResourceType, number>;
      const contactSnapshots = companySnapshots.filter(
        (snapshot) => snapshot.resource_type === "contact",
      );
      const unresolvedContacts = contactSnapshots.filter(
        (snapshot) => !snapshot.customer_id && !snapshot.lead_id,
      ).length;
      const unmatchedContacts = contactSnapshots.filter(
        (snapshot) => getContactMatchStatus(snapshot.payload_summary) === "unmatched",
      ).length;
      const ambiguousContactSnapshots = contactSnapshots.filter(
        (snapshot) => getContactMatchStatus(snapshot.payload_summary) === "ambiguous",
      );
      const ambiguousContacts = ambiguousContactSnapshots.length;
      const unclassifiedUnresolvedContacts = Math.max(
        0,
        unresolvedContacts - unmatchedContacts - ambiguousContacts,
      );
      const conflictingMappings = companyMappings.filter(
        (mapping) =>
          mapping.sync_status === "conflict" || mapping.conflict_status !== "none",
      );
      const mappingConflictCount = conflictingMappings.length;
      const mappedContactConflictIds = new Set(
        conflictingMappings
          .filter(
            (mapping) =>
              mapping.external_object_type === "contact" && mapping.external_id,
          )
          .map((mapping) => mapping.external_id as string),
      );
      const unmappedAmbiguousContactCount = ambiguousContactSnapshots.filter(
        (snapshot) => !mappedContactConflictIds.has(snapshot.external_id),
      ).length;
      const communicationIdentityConflictCount =
        companyCommunicationIdentityConflicts.length;
      const conflictCount =
        mappingConflictCount +
        unmappedAmbiguousContactCount +
        communicationIdentityConflictCount;
      const pendingMappingCount = companyMappings.filter(
        (mapping) => mapping.pending_sync,
      ).length;
      const processedWebhooks = companyWebhooks.filter(
        (event) => event.processing_status === "processed",
      );
      const ignoredWebhooks = companyWebhooks.filter(
        (event) => event.processing_status === "ignored",
      );
      const failedWebhooks = companyWebhooks.filter(
        (event) => event.processing_status === "failed",
      );
      const readinessNow = Date.now();
      const processingWebhooks = companyWebhooks.filter(
        (event) =>
          event.processing_status === "received" &&
          Boolean(event.lease_expires_at) &&
          new Date(event.lease_expires_at!).getTime() > readinessNow,
      );
      const stalledWebhooks = companyWebhooks.filter(
        (event) =>
          event.processing_status === "received" &&
          Boolean(event.lease_expires_at) &&
          new Date(event.lease_expires_at!).getTime() <= readinessNow,
      );
      const queuedWebhooks = companyWebhooks.filter(
        (event) =>
          event.processing_status === "received" && !event.lease_expires_at,
      );
      const webhookDuplicateCount = companyWebhooks.reduce(
        (total, event) => total + event.duplicate_count,
        0,
      );
      const webhookRequeueCount = companyWebhooks.reduce(
        (total, event) => total + event.requeue_count,
        0,
      );
      const latestWebhook = companyWebhooks[0] ?? null;
      const lastFailedWebhook = failedWebhooks[0] ?? null;
      const duplicateSyncRecords = companySyncLogs.reduce(
        (total, log) => total + getDuplicateMetric(log),
        0,
      );
      const lastSyncLog = companySyncLogs[0] ?? null;
      const authenticated = Boolean(
        !ambiguousConnections &&
          connection?.status === "connected" &&
          credential &&
          credentialBindingValid &&
          scopesValid,
      );
      const webhookHealth =
        webhookEvidenceTruncated || failedWebhooks.length || stalledWebhooks.length
        ? "attention"
        : processingWebhooks.length || queuedWebhooks.length
          ? "processing"
          : companyWebhooks.length
            ? "verified"
            : "awaiting_first_delivery";
      const syncHealth = !connection
        ? "not_connected"
        : ambiguousConnections
          ? "ambiguous_connections"
          : !credential || !credentialBindingValid || !scopesValid
            ? "reauthorization_required"
            : connection.status === "error" || connection.last_error
              ? "attention"
              : mappingEvidenceTruncated ||
                    communicationIdentityConflictEvidenceTruncated ||
                    conflictCount > 0 ||
                    unresolvedContacts > 0
                ? "attention"
              : tokenState === "expired" || tokenState === "invalid"
                ? "token_refresh_required"
                : !config.syncEnabled
                  ? "inbound_disabled"
                  : connection.last_successful_sync_at
                    ? "healthy"
                    : "ready_for_first_sync";

      return {
        companyId: company.id,
        companyName: company.name,
        connectionId: connection?.id ?? null,
        connectionStatus: connection?.status ?? "not_connected",
        connectionCount: companyConnections.length,
        ambiguousConnections,
        authenticated,
        credentialStored: Boolean(credential),
        credentialBindingValid,
        scopesValid,
        locationId: connection?.external_account_id ?? null,
        locationName: connection?.display_name ?? null,
        tokenState,
        tokenExpiresAt: credential?.token_expires_at ?? null,
        syncEnabled: config.syncEnabled,
        syncHealth,
        lastSyncAt: connection?.last_sync_at ?? null,
        lastSuccessfulSyncAt: connection?.last_successful_sync_at ?? null,
        lastFailureAt: connection?.last_failure_at ?? null,
        lastError: getSafeError(connection?.last_error),
        resources: {
          total: companySnapshots.length,
          truncated: resourceEvidenceTruncated,
          byType: byResource,
          matchedContacts: contactSnapshots.length - unresolvedContacts,
          unresolvedContacts,
          unmatchedContacts,
          ambiguousContacts,
          unclassifiedUnresolvedContacts,
          conflictCount,
          mappingConflictCount,
          communicationIdentityConflictCount,
          pendingMappingCount,
          duplicatesSuppressed: duplicateSyncRecords,
          lastSyncedAt: latestTimestamp(
            companySnapshots.map((snapshot) => snapshot.last_synced_at),
          ),
        },
        syncRuns: {
          recentTotal: companySyncLogs.length,
          truncated: syncLogEvidenceTruncated,
          succeeded: companySyncLogs.filter((log) => log.status === "succeeded").length,
          failed: companySyncLogs.filter((log) => log.status === "failed").length,
          active: companySyncLogs.filter((log) =>
            ["queued", "running", "retrying"].includes(log.status) &&
            (!log.lease_expires_at ||
              new Date(log.lease_expires_at).getTime() > readinessNow),
          ).length,
          expiredActive: companySyncLogs.filter((log) =>
            ["queued", "running", "retrying"].includes(log.status) &&
            Boolean(log.lease_expires_at) &&
            new Date(log.lease_expires_at!).getTime() <= readinessNow,
          ).length,
          lastRunAt:
            lastSyncLog?.completed_at ??
            lastSyncLog?.last_attempted_at ??
            lastSyncLog?.created_at ??
            null,
          lastStatus: lastSyncLog?.status ?? null,
        },
        automationEvents: {
          total: companyAutomationEvents.length,
          truncated: automationEvidenceTruncated,
          communications: companyAutomationEvents.filter(
            (event) => event.event_type === "communication.received",
          ).length,
          missedCalls: companyAutomationEvents.filter(
            (event) => event.event_type === "missed_call.received",
          ).length,
          lastEventAt: companyAutomationEvents[0]?.occurred_at ?? null,
          customerFacingActionsEnabled: false,
        },
        webhooks: {
          health: webhookHealth,
          verified: companyWebhooks.length > 0,
          total: companyWebhooks.length,
          truncated: webhookEvidenceTruncated,
          processed: processedWebhooks.length,
          ignored: ignoredWebhooks.length,
          failed: failedWebhooks.length,
          processing: processingWebhooks.length,
          queued: queuedWebhooks.length,
          stalled: stalledWebhooks.length,
          duplicatesSuppressed: webhookDuplicateCount,
          requeueCount: webhookRequeueCount,
          awaitingSignedRedelivery: failedWebhooks.filter(
            (event) => event.attempt_count === 0 && event.requeue_count > 0,
          ).length,
          lastVerifiedAt: latestWebhook?.received_at ?? null,
          lastProcessedAt: latestTimestamp(
            companyWebhooks.map((event) => event.processed_at),
          ),
          lastFailureAt: lastFailedWebhook?.processed_at ?? null,
          lastSignatureVersion: latestWebhook?.signature_version ?? null,
          recentFailures: failedWebhooks.slice(0, 5).map((event) => ({
            eventId: event.id,
            eventType: event.event_type,
            attemptCount: event.attempt_count,
            maxAttempts: 13,
            requeueCount: event.requeue_count,
            awaitingSignedRedelivery:
              event.attempt_count === 0 && event.requeue_count > 0,
            error: getSafeError(event.error_message),
            receivedAt: event.received_at,
            lastAttemptedAt: event.last_attempted_at,
          })),
        },
        evidence: {
          truncated:
            resourceEvidenceTruncated ||
            mappingEvidenceTruncated ||
            communicationIdentityConflictEvidenceTruncated ||
            webhookEvidenceTruncated ||
            syncLogEvidenceTruncated ||
            automationEvidenceTruncated,
          resources: resourceEvidenceTruncated,
          mappings: mappingEvidenceTruncated,
          communicationIdentityConflicts:
            communicationIdentityConflictEvidenceTruncated,
          webhooks: webhookEvidenceTruncated,
          syncRuns: syncLogEvidenceTruncated,
          automationEvents: automationEvidenceTruncated,
          countsAreLowerBounds:
            resourceEvidenceTruncated ||
            mappingEvidenceTruncated ||
            communicationIdentityConflictEvidenceTruncated ||
            webhookEvidenceTruncated ||
            syncLogEvidenceTruncated ||
            automationEvidenceTruncated,
        },
      };
    })
    .sort((left, right) => left.companyName.localeCompare(right.companyName));

  const targetStatuses = requestedCompanyId
    ? companyStatuses.filter((company) => company.companyId === requestedCompanyId)
    : companyStatuses;

  let status: GoHighLevelLiveSyncStatus = "credentials_required";
  if (
    config.ok &&
    schema.applied &&
    targetStatuses.length > 0 &&
    targetStatuses.every((company) => company.authenticated)
  ) {
    status = targetStatuses.some((company) => company.syncHealth === "attention")
      ? "sync_error"
      : config.syncEnabled
        ? "ready_to_sync"
        : "connected";
  } else if (config.ok && schema.applied) {
    status = targetStatuses.some(
      (company) =>
        company.connectionStatus === "error" || company.ambiguousConnections,
    )
      ? "sync_error"
      : "not_connected";
  } else if (config.ok && !schema.applied) {
    status = "validation_failed";
  }

  const ok =
    config.ok &&
    schema.applied &&
    targetStatuses.length > 0 &&
    targetStatuses.every(
      (company) =>
        company.authenticated && company.syncHealth !== "attention",
    );
  const message = !config.ok
    ? "GoHighLevel Marketplace OAuth configuration is incomplete."
    : !schema.applied
      ? schema.message
      : !targetStatuses.length ||
          targetStatuses.some(
            (company) =>
              !company.connectionId ||
              company.ambiguousConnections ||
              !company.credentialStored,
          )
        ? "Every selected company needs one exact authorized HighLevel location."
        : !targetStatuses.every((company) => company.scopesValid)
          ? "A selected HighLevel token does not match the approved scope set."
          : !targetStatuses.every((company) => company.authenticated)
            ? "A selected HighLevel connection needs reauthorization."
          : targetStatuses.some((company) => company.syncHealth === "attention")
            ? "A selected HighLevel connection has conflicts, failures, or incomplete evidence that needs review."
          : config.syncEnabled
            ? "HighLevel Marketplace OAuth is authenticated and read-only synchronization is enabled."
            : "HighLevel Marketplace OAuth is authenticated; inbound synchronization remains disabled.";

  const locations = companyStatuses.map((company) => ({
    key: company.companyId,
    label: company.companyName,
    envVar: "Marketplace OAuth",
    locationId: company.locationId,
    configured: Boolean(company.connectionId),
    readCheck: company.authenticated ? "ok" : "unauthorized",
    statusCode: null,
    message: company.authenticated
      ? "Encrypted location-scoped OAuth credential is stored."
      : "This company mapping needs OAuth authorization.",
    locationName: company.locationName,
  }));

  return NextResponse.json({
    ok,
    dryRun: false,
    communicationsSent: false,
    automationTriggered: false,
    liveSyncEnabled: config.syncEnabled,
    status,
    statusLabel: goHighLevelLiveSyncStatusLabels[status],
    message,
    tokenConfigured: activeCredentials.length > 0,
    requiredEnvVars: config.missing,
    configuredLocationIds: connected
      .map((connection) => connection.external_account_id)
      .filter((value): value is string => Boolean(value)),
    apiBaseUrl: GOHIGHLEVEL_API_BASE_URL,
    checkedAt: new Date().toISOString(),
    selectedCompanyId: requestedCompanyId,
    companies: companyStatuses,
    accountMetadata: {
      authMethod: "marketplace_oauth",
      oauthSupported: true,
      accessMode: "read_only",
      webhookVerification: "ed25519_with_rsa_legacy_fallback",
    },
    phoneCapabilities: {
      phoneNumberScopeGranted: false,
      providerNumberInventoryVerified: false,
      carrierSmsReceptionVerified: false,
      carrierRoutingChanged: false,
      twilioRoutingPreserved: true,
    },
    locations,
    pipelines: [],
    syncResources: goHighLevelSyncResources,
    phaseOneGuardrails: goHighLevelOAuthGuardrails,
    migration: {
      required: goHighLevelProductionBridgeMigration,
      applied: schema.applied,
      checked: true,
      message: schema.message,
    },
    schema,
    syncResourceCount: goHighLevelSyncResources.length,
    oauth: {
      configured: config.ok,
      missing: config.missing,
      malformed: config.malformed,
      syncEnabled: config.syncEnabled,
      scopes: [...goHighLevelOAuthScopes],
      endpoints: goHighLevelOAuthEndpoints,
      authenticatedLocationCount: companyStatuses.filter(
        (company) => company.authenticated,
      ).length,
      connectedLocationCount: connected.length,
      encryptedCredentialCount: activeCredentials.length,
      allScopesValid,
    },
    nextStep: ok
      ? config.syncEnabled
        ? "Run an owner-approved inbound synchronization for each mapped company."
        : "Set GHL_SYNC_ENABLED=true only when the owner is ready to ingest provider data."
      : "Complete the reported Marketplace OAuth readiness item.",
  });
}
