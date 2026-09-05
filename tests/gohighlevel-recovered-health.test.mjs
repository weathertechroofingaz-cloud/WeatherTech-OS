import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-ghl-recovery-"));
try {
  const compile = spawnSync(join(cwd, "node_modules", ".bin", "tsc"), [
    "lib/crm/gohighlevelSyncRecovery.ts", "lib/crm/communications.ts",
    "lib/crm/aiTools.ts", "lib/crm/aiProvider.ts", "lib/crm/demoSnapshot.ts",
    "--target", "ES2022", "--module", "commonjs", "--moduleResolution", "node",
    "--strict", "--skipLibCheck", "--esModuleInterop", "--jsx", "react-jsx",
    "--outDir", outDir,
  ], { cwd, encoding: "utf8" });
  assert.equal(compile.status, 0, `${compile.stdout}\n${compile.stderr}`);
  const { getRecoveredGoHighLevelSyncLogs: recover } = await import(pathToFileURL(join(outDir, "gohighlevelSyncRecovery.js")));
  const communications = await import(pathToFileURL(join(outDir, "communications.js")));
  const aiTools = await import(pathToFileURL(join(outDir, "aiTools.js")));
  const aiProvider = await import(pathToFileURL(join(outDir, "aiProvider.js")));
  const { createDemoCrmSnapshot } = await import(pathToFileURL(join(outDir, "demoSnapshot.js")));
  const snapshot = createDemoCrmSnapshot();
  const [weatherTech, ihc] = snapshot.companies;
  for (const key of Object.keys(snapshot)) {
    if (Array.isArray(snapshot[key]) && key !== "companies") snapshot[key] = [];
  }
  const earlier = "2026-09-04T10:00:00.000Z";
  const connectedAt = "2026-09-04T10:05:00.000Z";
  const later = "2026-09-04T10:10:00.000Z";
  const newest = "2026-09-04T10:20:00.000Z";
  const resources = [
    "location", "contact", "conversation", "calendar", "pipeline", "opportunity",
    "calendar_event", "review", "message", "message", "call",
  ].map((resourceType) => ({ resourceType, failed: 0, paginationTruncated: false }));
  const makeLog = (overrides = {}) => ({
    id: "success", company_id: weatherTech.id, integration_connection_id: "weather-connection",
    provider: "gohighlevel", direction: "provider_to_weathertech", event_type: "gohighlevel.sync",
    status: "succeeded", related_table: null, related_record_id: null, external_id: null,
    attempt_count: 1, max_attempts: 1, next_retry_at: null, last_attempted_at: later,
    completed_at: later, request_fingerprint: null,
    request_summary: { readOnlyProviderSync: true, outboundWrites: false },
    response_summary: {
      providerRecordsChanged: false, totalFailed: 0, resources: structuredClone(resources),
      pagination: { ceilingReached: false }, providerRequests: { deadlineReached: false },
    },
    error_code: null, error_message: null, claim_token_sha256: null, lease_expires_at: null,
    created_at: later, updated_at: later, ...overrides,
  });
  const failure = makeLog({
    id: "failed-review", status: "failed", completed_at: earlier, last_attempted_at: earlier,
    created_at: earlier, updated_at: earlier, error_code: "gohighlevel_partial_sync",
    error_message: "Historical review endpoint failure",
    next_retry_at: "2000-01-01T00:00:00.000Z",
    response_summary: {
      totalFailed: 1,
      resources: resources.map((resource) => ({ ...resource, failed: resource.resourceType === "review" ? 1 : 0 })),
    },
  });
  const success = makeLog();
  assert.equal(recover([failure, success]).get(failure.id)?.kind, "operation_recovered");
  assert.equal(recover([success, failure]).get(failure.id)?.log.id, success.id, "Ordering does not affect recovery");

  for (const [label, changed] of [
    ["foreign company", { company_id: ihc.id }],
    ["foreign connection", { integration_connection_id: "ihc-connection" }],
    ["missing connection", { integration_connection_id: null }],
    ["different location evidence", { external_id: "another-location" }],
    ["different operation", { event_type: "gohighlevel.oauth" }],
    ["different record", { related_record_id: "another-record" }],
    ["provider write", { direction: "weathertech_to_provider" }],
    ["incomplete status", { status: "running" }],
    ["missing completion", { completed_at: null }],
    ["old success", { completed_at: earlier }],
    ["error remains", { error_message: "still failed" }],
    ["generic success", { response_summary: {} }],
  ]) {
    assert(!recover([failure, makeLog(changed)]).has(failure.id), label);
  }
  assert(!recover([{ ...failure, integration_connection_id: null }, { ...success, integration_connection_id: null }]).has(failure.id), "Two null connections are not identity");
  for (const response_summary of [
    { ...success.response_summary, totalFailed: 1 },
    { ...success.response_summary, pagination: { ceilingReached: true } },
    { ...success.response_summary, providerRequests: { deadlineReached: true } },
    { ...success.response_summary, resources: resources.filter((resource) => resource.resourceType !== "review") },
    { ...success.response_summary, resources: resources.filter((_, index) => index !== 9) },
    { ...success.response_summary, resources: resources.map((resource) => ({ ...resource, paginationTruncated: true })) },
  ]) {
    assert(!recover([failure, makeLog({ response_summary })]).has(failure.id), "Partial/incomplete resource evidence cannot recover a full run");
  }
  const newestFailure = { ...failure, id: "new-failure", completed_at: newest, created_at: newest, last_attempted_at: newest };
  assert(!recover([failure, success, newestFailure]).has(newestFailure.id), "A newer failure stays actionable");
  const retry = { ...failure, id: "retry", status: "retrying", last_attempted_at: newest };
  assert(!recover([retry, success]).has(retry.id), "A later retry is not hidden by its older completion timestamp");
  for (const event_type of ["gohighlevel.webhook", "message.delivery", "gohighlevel.message.send"]) {
    const delivery = { ...failure, id: event_type, event_type };
    assert(!recover([delivery, success]).has(delivery.id), "Generic sync cannot recover delivery or webhook failures");
  }
  assert.equal(recover([{ ...failure, provider: "twilio" }, { ...success, provider: "twilio" }]).size, 0, "Other providers retain existing semantics");

  const connection = {
    id: "weather-connection", company_id: weatherTech.id, provider: "gohighlevel", status: "connected",
    external_account_id: "weather-location", last_error: null, created_at: connectedAt,
    updated_at: later, display_name: "WeatherTech", last_sync_at: later,
  };
  const oauthFailure = {
    ...failure, id: "initial-consent", event_type: "gohighlevel.oauth",
    integration_connection_id: null, external_id: null,
    request_summary: { oauthCallback: true }, response_summary: { connected: false },
  };
  const oauthSuccess = makeLog({
    id: "connected", event_type: "gohighlevel.oauth", external_id: "weather-location",
    request_summary: { oauthCallback: true },
    response_summary: { connected: true, tokenStoredEncrypted: true },
  });
  assert(!recover([oauthFailure, oauthSuccess]).has(oauthFailure.id), "Company-only success cannot prove an unknown OAuth attempt recovered");
  assert.equal(recover([oauthFailure, oauthSuccess], [connection]).get(oauthFailure.id)?.kind, "setup_superseded", "Initial failed setup is separately classified after exact sole connection");
  assert.equal(recover([oauthFailure, { ...oauthSuccess, completed_at: "2026-09-04T10:04:59.999Z" }], [connection]).get(oauthFailure.id)?.kind, "setup_superseded", "Callback completion may be captured before connection insert");
  for (const connections of [
    [{ ...connection, company_id: ihc.id }],
    [{ ...connection, status: "needs_reauth" }],
    [{ ...connection, last_error: "Connection is not healthy" }],
    [{ ...connection, external_account_id: null }],
    [{ ...connection, external_account_id: "foreign-location" }],
    [{ ...connection, created_at: earlier }],
    [connection, { ...connection, id: "second-connection" }],
  ]) {
    assert(!recover([oauthFailure, oauthSuccess], connections).has(oauthFailure.id), "Setup supersession requires an exact healthy first connection");
  }
  const newConsentFailure = { ...oauthFailure, id: "new-consent", completed_at: newest, last_attempted_at: newest, created_at: newest };
  assert.equal(recover([oauthFailure, oauthSuccess, newConsentFailure], [connection]).size, 0, "Newer failed consent preserves current review requirement");
  assert(!recover([{ ...oauthFailure, integration_connection_id: "foreign-connection" }, oauthSuccess], [connection]).has(oauthFailure.id), "A bound foreign attempt is never classified as unbound setup");
  assert.equal(recover([{ ...oauthFailure, request_fingerprint: "same-state" }, { ...oauthSuccess, request_fingerprint: "same-state" }]).get(oauthFailure.id)?.kind, "operation_recovered", "Exact OAuth state is explicit recovery evidence");

  snapshot.integrationSyncLogs = [failure, success, oauthFailure, oauthSuccess];
  snapshot.integrationConnections = [connection];
  const auditBefore = JSON.stringify(snapshot.integrationSyncLogs);
  const companyMap = new Map(snapshot.companies.map((company) => [company.id, company]));
  const items = communications.buildUnifiedInboxItems(snapshot, companyMap);
  const failedItem = items.find((item) => item.id === `integration-${failure.id}`);
  assert(failedItem, "Historical failure remains in the inbox");
  assert.equal(failedItem.status, "Failed (recovered)");
  assert.equal(failedItem.isFailed, false);
  assert.equal(failedItem.responseStatus, "resolved");
  assert.equal(failedItem.notes, failure.error_message, "Historical error detail remains intact");
  const setupItem = items.find((item) => item.id === `integration-${oauthFailure.id}`);
  assert.match(setupItem.suggestedNextAction, /Earlier setup attempt superseded/);
  for (const historicalItem of [failedItem, setupItem]) {
    assert.equal(historicalItem.isUnassigned, false, "Recovered history requires no assignment");
    assert.equal(historicalItem.followUpAt, null, "Recovered history has no pending follow-up");
    for (const view of ["needs_response", "unassigned", "unread", "failed_delivery"]) {
      assert.equal(communications.communicationItemMatchesInboxView(historicalItem, view), false,
        `Recovered ${historicalItem.id} is excluded from the actual ${view} inbox view`);
    }
    for (const filter of ["unassigned", "follow_up"]) {
      assert.equal(communications.communicationItemMatchesAttentionFilter(historicalItem, filter), false,
        `Recovered ${historicalItem.id} is excluded from the actual ${filter} attention filter`);
    }
    assert.equal(communications.communicationItemMatchesInboxView(historicalItem, "recently_resolved"), true,
      "Recovered audit remains available in resolved history");
  }
  const readiness = communications.buildCommunicationProviderReadiness(snapshot, items).find((item) => item.provider === "gohighlevel");
  assert.equal(readiness.syncHealth, "Healthy");
  const failedDeliveryItem = { ...failedItem, id: "failed-delivery", kind: "SMS", isFailed: true, failureDetail: "Message delivery failed" };
  assert.equal(communications.buildCommunicationProviderReadiness(snapshot, [...items, failedDeliveryItem]).find((item) => item.provider === "gohighlevel").syncHealth, "Needs attention", "Actual failed message still makes provider readiness unhealthy");
  const priorities = aiTools.buildAiPriorityItems(snapshot, { companyId: weatherTech.id, now: newest });
  assert(!priorities.some((item) => item.category === "integration"), "Recovered history produces no current deterministic AI priority");
  const context = aiProvider.retrieveAuthorizedAiContext(snapshot, { companyId: weatherTech.id, prompt: "Review integration health", now: newest, recordLimit: 50 });
  assert.match(context.records.find((record) => record.id === failure.id).snippet, /Historical failed audit, recovered/);
  assert.match(context.records.find((record) => record.id === oauthFailure.id).snippet, /Historical failed setup attempt superseded/);
  snapshot.integrationSyncLogs.push(newestFailure);
  const actionableItem = communications.buildUnifiedInboxItems(snapshot, companyMap)
    .find((item) => item.id === `integration-${newestFailure.id}`);
  for (const view of ["needs_response", "unassigned"]) {
    assert.equal(communications.communicationItemMatchesInboxView(actionableItem, view), true,
      `Unresolved current failure remains in the ${view} inbox view`);
  }
  assert.equal(communications.communicationItemMatchesAttentionFilter(actionableItem, "follow_up"), true,
    "Unresolved current failure retains its due retry follow-up");
  assert(aiTools.buildAiPriorityItems(snapshot, { companyId: weatherTech.id, now: newest }).some((item) => item.id === `integration-${newestFailure.id}`), "Unresolved current failure still reaches AI priorities");
  snapshot.integrationSyncLogs.pop();
  assert.equal(JSON.stringify(snapshot.integrationSyncLogs), auditBefore, "All consumers preserve audit rows exactly");
  console.log("GoHighLevel recovered health regression passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
