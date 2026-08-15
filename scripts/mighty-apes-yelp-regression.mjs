#!/usr/bin/env node

import crypto, { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  BROWSER_REGRESSION_ENV_FILE,
  loadBrowserRegressionEnvironment,
} from "../tests/codex-browser/regression-runtime.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  REGRESSION_SUPABASE_PROJECT_REF,
  runRegressionEnvironmentCommand,
  validateRegressionEnvironment,
} from "./regression-environment.mjs";

export const MIGHTY_APES_YELP_REGRESSION_RUN =
  "WTOS_MIGHTY_APES_YELP_REGRESSION_RUN";

const AUDIT_TABLE = "mighty_apes_yelp_webhook_events";
const RPC_NAME = "wtos_ingest_mighty_apes_yelp";
const MARKER_PREFIX = "TEST WTOS MIGHTY APES REGRESSION:";
const CAMPAIGN_YELP_ID = "00LZA1SuPKX0yUnsdthgLg";
const CAMPAIGN_NAME = "Weather Tech Roofing - Scottsdale, AZ 85255";
const NETWORK_TIMEOUT_MS = 20_000;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function loadMightyApesYelpRegressionEnvironment({
  cwd,
  runtimeEnv = process.env,
} = {}) {
  requireCondition(cwd, "Mighty Apes Yelp regression requires an explicit repository path.");
  const externalPath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();

  requireCondition(
    externalPath && isAbsolute(externalPath),
    `${BROWSER_REGRESSION_ENV_FILE} must name a secure absolute environment file outside the repository. This runner never reads .env.local.`,
  );
  requireCondition(
    !runtimeEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    `Mighty Apes Yelp regression accepts target credentials only from ${BROWSER_REGRESSION_ENV_FILE}.`,
  );

  const loaded = loadBrowserRegressionEnvironment({
    cwd,
    runtimeEnv,
    remoteWritesEnabled: true,
  });
  requireCondition(
    loaded.source === "external_file",
    "Mighty Apes Yelp regression requires the secure external-file credential source.",
  );
  const config = validateRegressionEnvironment(loaded.environment);
  const signingSecret = loaded.environment.MIGHTY_APES_YELP_WEBHOOK_SECRET?.trim();

  requireCondition(
    config.projectRef === REGRESSION_SUPABASE_PROJECT_REF,
    "Mighty Apes Yelp regression target is not the approved isolated regression project.",
  );
  requireCondition(
    !config.supabaseUrl.includes(PRODUCTION_SUPABASE_PROJECT_REF),
    "Production Supabase is permanently prohibited as a Mighty Apes Yelp regression target.",
  );
  requireCondition(
    signingSecret && signingSecret.length >= 32,
    "MIGHTY_APES_YELP_WEBHOOK_SECRET must be a synthetic server-only secret of at least 32 characters in the secure external regression environment.",
  );

  return {
    config,
    environment: loaded.environment,
    signingSecret,
    source: loaded.source,
  };
}

function createNetworkGuard(fetchImpl, allowedOrigin) {
  const counters = { allowedSupabaseRequests: 0, blockedExternalRequests: 0 };
  const guardedFetch = async (input, init) => {
    const rawUrl =
      typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    const url = new URL(rawUrl);

    if (url.origin !== allowedOrigin) {
      counters.blockedExternalRequests += 1;
      throw new Error(
        "Mighty Apes Yelp regression blocked a non-regression network request before transmission.",
      );
    }

    counters.allowedSupabaseRequests += 1;
    const controller = new AbortController();
    const upstreamSignal = init?.signal ?? input?.signal;
    const relayAbort = () => controller.abort(upstreamSignal?.reason);

    if (upstreamSignal?.aborted) {
      relayAbort();
    } else {
      upstreamSignal?.addEventListener?.("abort", relayAbort, { once: true });
    }

    const timeout = setTimeout(
      () => controller.abort(new Error("Mighty Apes Yelp regression request timed out.")),
      NETWORK_TIMEOUT_MS,
    );

    try {
      return await fetchImpl(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      upstreamSignal?.removeEventListener?.("abort", relayAbort);
    }
  };

  return { counters, guardedFetch };
}

async function requireRows(query, label) {
  const { data, error } = await query;

  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }

  return data ?? [];
}

async function assertNoRows(query, label) {
  const rows = await requireRows(query, label);
  requireCondition(rows.length === 0, `${label} found ${rows.length} conflicting row(s).`);
}

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) {
    throw new Error(`Count ${table} failed: ${error.message}`);
  }

  return count ?? 0;
}

async function snapshotCounts(client, tables) {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => [table, await countRows(client, table)]),
    ),
  );
}

async function deleteExactIds(client, table, ids) {
  const exactIds = [...new Set(ids.filter(Boolean))];

  if (!exactIds.length) {
    return;
  }

  const { error } = await client.from(table).delete().in("id", exactIds);

  if (error) {
    throw new Error(`Exact-ID cleanup failed for ${table}: ${error.message}`);
  }
}

async function assertExactIdsAbsent(client, table, ids) {
  const exactIds = [...new Set(ids.filter(Boolean))];

  if (!exactIds.length) {
    return;
  }

  await assertNoRows(
    client.from(table).select("id").in("id", exactIds),
    `${table} exact-ID residue`,
  );
}

function fingerprintPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildProviderPayload({
  event,
  providerLeadId,
  name,
  phone,
  zipCode,
  jobCategory,
  message,
  createdAt,
}) {
  return {
    version: 1,
    event,
    campaign: {
      yelp_id: CAMPAIGN_YELP_ID,
      name: CAMPAIGN_NAME,
    },
    lead: {
      id: providerLeadId,
      name,
      phone,
      zip_code: zipCode,
      ...(jobCategory === undefined ? {} : { job_category: jobCategory }),
      message,
      created_at: createdAt,
    },
  };
}

function buildIntakeRequest({ payload, deliveryId }) {
  const receivedAt = new Date().toISOString();

  return {
    ...payload,
    delivery_id: deliveryId,
    payload_fingerprint: fingerprintPayload(payload),
    header_timestamp: Math.floor(Date.now() / 1000),
    received_at: receivedAt,
  };
}

async function callIngest(client, request) {
  const { data, error } = await client.rpc(RPC_NAME, {
    intake_request: request,
  });

  if (error) {
    throw error;
  }

  requireCondition(data && typeof data === "object", "Mighty Apes ingest RPC returned no result.");
  return data;
}

function describeError(error) {
  return error instanceof Error
    ? error.message
    : error && typeof error === "object"
      ? [error.message, error.details, error.hint, error.code]
          .filter((value) => typeof value === "string" && value.trim())
          .join(" | ") || JSON.stringify(error)
      : String(error);
}

async function expectRejected(callback, label, expectedMessage) {
  try {
    await callback();
  } catch (error) {
    const message = describeError(error);
    requireCondition(
      expectedMessage.test(message),
      `${label} failed for the wrong reason: ${message}`,
    );
    return message;
  }

  throw new Error(`${label} unexpectedly succeeded.`);
}

function pushResultIds(ids, result) {
  ids.mighty_apes_yelp_webhook_events.push(result?.event_id);
  ids.leads.push(result?.lead_id);
  ids.lead_intake_records.push(result?.intake_record_id);
  ids.integration_sync_logs.push(result?.sync_log_id);
  ids.notifications.push(result?.notification_id);
}

async function discoverRunRows(service, marker, ids) {
  const [auditByDelivery, auditByLead, intakes, logs, leads] = await Promise.all([
    requireRows(
      service.from(AUDIT_TABLE).select("*").like("delivery_id", `${marker}%`),
      "Discover Mighty Apes audit rows by delivery",
    ),
    requireRows(
      service.from(AUDIT_TABLE).select("*").like("provider_lead_id", `${marker}%`),
      "Discover Mighty Apes audit rows by provider lead",
    ),
    requireRows(
      service
        .from("lead_intake_records")
        .select("id,linked_lead_id,integration_sync_log_id,provider_event_id")
        .eq("provider", "yelp")
        .like("provider_event_id", `${marker}%`),
      "Discover Mighty Apes intake rows",
    ),
    requireRows(
      service
        .from("integration_sync_logs")
        .select("id,related_record_id,external_id")
        .eq("provider", "yelp")
        .like("external_id", `${marker}%`),
      "Discover Mighty Apes sync logs",
    ),
    requireRows(
      service.from("leads").select("id").like("contact_name", `${marker}%`),
      "Discover Mighty Apes CRM leads",
    ),
  ]);
  const auditRows = [
    ...new Map(
      [...auditByDelivery, ...auditByLead].map((row) => [row.id, row]),
    ).values(),
  ];

  ids.mighty_apes_yelp_webhook_events.push(...auditRows.map((row) => row.id));
  ids.lead_intake_records.push(
    ...intakes.map((row) => row.id),
    ...auditRows.map((row) => row.lead_intake_record_id),
  );
  ids.integration_sync_logs.push(
    ...logs.map((row) => row.id),
    ...intakes.map((row) => row.integration_sync_log_id),
    ...auditRows.map((row) => row.integration_sync_log_id),
  );
  ids.notifications.push(...auditRows.map((row) => row.notification_id));
  ids.leads.push(
    ...leads.map((row) => row.id),
    ...intakes.map((row) => row.linked_lead_id),
    ...logs.map((row) => row.related_record_id),
    ...auditRows.map((row) => row.linked_lead_id),
  );

  return auditRows;
}

export async function runMightyApesYelpRegression({
  cwd = process.cwd(),
  runtimeEnv = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireCondition(
    typeof fetchImpl === "function",
    "Mighty Apes Yelp regression requires Fetch API support.",
  );
  const loaded = loadMightyApesYelpRegressionEnvironment({
    cwd: resolve(cwd),
    runtimeEnv,
  });
  const { guardedFetch, counters } = createNetworkGuard(
    fetchImpl,
    loaded.config.supabaseUrl,
  );
  const preflight = await runRegressionEnvironmentCommand({
    command: "verify",
    env: loaded.environment,
    fetchImpl: guardedFetch,
  });
  requireCondition(
    preflight.target === REGRESSION_SUPABASE_PROJECT_REF && preflight.residueCount === 0,
    "Isolated Mighty Apes regression preflight did not prove target identity and zero residue.",
  );

  const service = createClient(loaded.config.supabaseUrl, loaded.config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  const anonymous = createClient(loaded.config.supabaseUrl, loaded.config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  const runId = randomUUID();
  const marker = `${MARKER_PREFIX}${runId}`;
  const ids = {
    mighty_apes_yelp_webhook_events: [],
    leads: [],
    lead_intake_records: [],
    integration_sync_logs: [],
    notifications: [],
    office_tasks: [],
  };
  let cleanupAuthorized = false;
  let report = null;
  let primaryError = null;
  let cleanupError = null;

  try {
    const companies = await requireRows(
      service.from("companies").select("id,name,trade"),
      "Read approved companies",
    );
    const weatherTech = companies.find((row) => row.name === "WeatherTech Roofing LLC");
    const ihc = companies.find((row) => row.name === "IHC Painting");
    requireCondition(weatherTech && ihc, "Approved company identities are missing.");

    await Promise.all([
      assertNoRows(
        service.from(AUDIT_TABLE).select("id").like("delivery_id", `${marker}%`),
        "Mighty Apes delivery marker collision",
      ),
      assertNoRows(
        service.from(AUDIT_TABLE).select("id").like("provider_lead_id", `${marker}%`),
        "Mighty Apes provider-lead marker collision",
      ),
      assertNoRows(
        service.from("lead_intake_records").select("id").like("provider_event_id", `${marker}%`),
        "Mighty Apes intake marker collision",
      ),
      assertNoRows(
        service.from("integration_sync_logs").select("id").like("external_id", `${marker}%`),
        "Mighty Apes sync-log marker collision",
      ),
      assertNoRows(
        service.from("leads").select("id").like("contact_name", `${marker}%`),
        "Mighty Apes lead marker collision",
      ),
    ]);
    cleanupAuthorized = true;

    const sideEffectTables = [
      "customers",
      "communication_provider_events",
      "sms_messages",
      "email_messages",
      "invoices",
      "payments",
    ];
    const sideEffectsBefore = await snapshotCounts(service, sideEffectTables);
    const officeTasksBefore = await requireRows(
      service.from("office_tasks").select("id").order("id"),
      "Read unrelated office-task baseline",
    );
    const testIsolationTables = [
      "leads",
      "lead_intake_records",
      "integration_sync_logs",
      "notifications",
      "office_tasks",
      "customers",
      "sms_messages",
      "email_messages",
    ];
    const testBefore = await snapshotCounts(service, testIsolationTables);
    const createdAt = "2026-08-12T17:04:22.000Z";
    const testLeadId = `${marker}:lead:test`;
    const testPayload = buildProviderPayload({
      event: "lead.test",
      providerLeadId: testLeadId,
      name: `${marker} TEST DELIVERY`,
      phone: "+14805550101",
      zipCode: "85255",
      message: `${marker} authenticated test delivery`,
      createdAt,
    });
    const testResult = await callIngest(
      service,
      buildIntakeRequest({ payload: testPayload, deliveryId: `${marker}:delivery:test` }),
    );
    pushResultIds(ids, testResult);
    requireCondition(
      testResult.status === "test_accepted" &&
        testResult.event_id &&
        !testResult.lead_id &&
        !testResult.intake_record_id &&
        !testResult.sync_log_id &&
        !testResult.notification_id,
      "Authenticated lead.test did not remain audit-only.",
    );
    const testAuditBeforeRows = await requireRows(
      service.from(AUDIT_TABLE).select("*").eq("id", testResult.event_id),
      "Read lead.test audit evidence before immutable update attempt",
    );
    requireCondition(
      testAuditBeforeRows.length === 1 &&
        testAuditBeforeRows[0].outcome === "test_accepted",
      "Authenticated lead.test did not persist exactly one audit-only event.",
    );
    const { data: auditUpdateData, error: auditUpdateError } = await service
      .from(AUDIT_TABLE)
      .update({ id: testResult.event_id })
      .eq("id", testResult.event_id)
      .select("*");
    requireCondition(
      auditUpdateError?.code === "55000" &&
        /immutable/i.test(auditUpdateError.message ?? "") &&
        (!auditUpdateData || auditUpdateData.length === 0),
      "Service-role id=id audit update was not rejected by the immutable ledger trigger with SQLSTATE 55000.",
    );
    const testAuditAfterRows = await requireRows(
      service.from(AUDIT_TABLE).select("*").eq("id", testResult.event_id),
      "Read lead.test audit evidence after immutable update attempt",
    );
    requireCondition(
      JSON.stringify(testAuditAfterRows) === JSON.stringify(testAuditBeforeRows),
      "Immutable Mighty Apes audit row changed after the refused service-role update.",
    );
    const testAfter = await snapshotCounts(service, testIsolationTables);
    requireCondition(
      JSON.stringify(testAfter) === JSON.stringify(testBefore),
      "Authenticated lead.test changed salesperson, CRM, task, communication, or sync-log state.",
    );

    const primaryLeadId = `${marker}:lead:created`;
    const multilineMessage = `${marker} questionnaire\nRoof age: 17 years\nLeak active: yes`;
    const createdPayload = buildProviderPayload({
      event: "lead.created",
      providerLeadId: primaryLeadId,
      name: `${marker} CREATED`,
      phone: "+14805550102",
      zipCode: "85255",
      message: multilineMessage,
      createdAt,
    });
    const createdRequest = buildIntakeRequest({
      payload: createdPayload,
      deliveryId: `${marker}:delivery:created`,
    });
    const created = await callIngest(service, createdRequest);
    pushResultIds(ids, created);
    requireCondition(
      created.status === "created" &&
        created.event_id &&
        created.lead_id &&
        created.intake_record_id &&
        created.sync_log_id &&
        created.notification_id,
      "Valid lead.created did not return the complete durable created result.",
    );

    const [leadRows, intakeRows, auditRows, syncRows] = await Promise.all([
      requireRows(service.from("leads").select("*").eq("id", created.lead_id), "Read created CRM lead"),
      requireRows(
        service.from("lead_intake_records").select("*").eq("id", created.intake_record_id),
        "Read created intake record",
      ),
      requireRows(service.from(AUDIT_TABLE).select("*").eq("id", created.event_id), "Read created audit row"),
      requireRows(
        service.from("integration_sync_logs").select("*").eq("id", created.sync_log_id),
        "Read created sync log",
      ),
    ]);
    const lead = leadRows[0];
    const intake = intakeRows[0];
    const audit = auditRows[0];
    const syncLog = syncRows[0];
    requireCondition(
      leadRows.length === 1 &&
        lead.company_id === weatherTech.id &&
        lead.company_id !== ihc.id &&
        lead.contact_name === createdPayload.lead.name &&
        lead.phone === createdPayload.lead.phone &&
        !lead.email &&
        lead.postal_code === createdPayload.lead.zip_code &&
        String(lead.source ?? "").toLowerCase().includes("yelp"),
      "Created CRM lead did not preserve identity, no-email, Yelp source, or WeatherTech isolation.",
    );
    requireCondition(
      intakeRows.length === 1 &&
        intake.company_id === weatherTech.id &&
        intake.company_id !== ihc.id &&
        intake.provider === "yelp" &&
        intake.provider_event_id === primaryLeadId &&
        intake.contact_name === createdPayload.lead.name &&
        intake.phone === createdPayload.lead.phone &&
        !intake.email &&
        intake.postal_code === createdPayload.lead.zip_code &&
        intake.message === multilineMessage &&
        Date.parse(intake.original_submission_timestamp) === Date.parse(createdAt),
      "Unified intake did not preserve multiline provider data, null email, timestamp, or WeatherTech routing.",
    );
    requireCondition(
      auditRows.length === 1 &&
        audit.company_id === weatherTech.id &&
        audit.company_id !== ihc.id &&
        audit.delivery_id === createdRequest.delivery_id &&
        audit.provider_lead_id === primaryLeadId &&
        audit.campaign_yelp_id === CAMPAIGN_YELP_ID &&
        audit.campaign_name === CAMPAIGN_NAME &&
        Date.parse(audit.provider_created_at) === Date.parse(createdAt) &&
        audit.outcome === "created" &&
        audit.linked_lead_id === created.lead_id,
      "Mighty Apes audit row did not preserve non-sensitive provider evidence.",
    );
    requireCondition(
      syncRows.length === 1 &&
        syncLog.company_id === weatherTech.id &&
        syncLog.external_id === primaryLeadId &&
        syncLog.status === "succeeded",
      "Mighty Apes sync evidence is missing or routed outside WeatherTech.",
    );
    const primaryOfficeTasks = await requireRows(
      service
        .from("office_tasks")
        .select("id,company_id,lead_id,source_type")
        .eq("lead_id", created.lead_id),
      "Read generated office task for primary Mighty Apes lead",
    );
    requireCondition(
      primaryOfficeTasks.length === 1 &&
        primaryOfficeTasks[0].company_id === weatherTech.id &&
        primaryOfficeTasks[0].lead_id === created.lead_id &&
        primaryOfficeTasks[0].source_type === "new_lead",
      "Primary Mighty Apes CRM lead did not enter the normal one-task office workflow.",
    );
    ids.office_tasks.push(primaryOfficeTasks[0].id);

    const exactRetry = await callIngest(service, createdRequest);
    pushResultIds(ids, exactRetry);
    requireCondition(
      exactRetry.status === "duplicate" &&
        exactRetry.event_id === created.event_id &&
        exactRetry.lead_id === created.lead_id &&
        exactRetry.intake_record_id === created.intake_record_id &&
        exactRetry.sync_log_id === created.sync_log_id &&
        exactRetry.notification_id === created.notification_id,
      "Exact retry did not return the same durable result as a duplicate.",
    );

    const alternateDelivery = await callIngest(service, {
      ...createdRequest,
      delivery_id: `${marker}:delivery:alternate`,
      received_at: new Date().toISOString(),
    });
    pushResultIds(ids, alternateDelivery);
    requireCondition(
      alternateDelivery.status === "duplicate" &&
        alternateDelivery.lead_id === created.lead_id &&
        alternateDelivery.intake_record_id === created.intake_record_id,
      "A provider retry with a new delivery ID created a second CRM identity.",
    );
    const primaryOfficeTasksAfterDuplicates = await requireRows(
      service.from("office_tasks").select("id").eq("lead_id", created.lead_id),
      "Verify duplicate deliveries did not duplicate the primary office task",
    );
    requireCondition(
      primaryOfficeTasksAfterDuplicates.length === 1 &&
        primaryOfficeTasksAfterDuplicates[0].id === primaryOfficeTasks[0].id,
      "Exact or alternate delivery retry created an extra office task.",
    );

    await expectRejected(
      () => callIngest(service, {
        ...createdRequest,
        payload_fingerprint: crypto.createHash("sha256").update("conflicting payload").digest("hex"),
        lead: { ...createdRequest.lead, name: `${marker} CONFLICT` },
      }),
      "Conflicting delivery reuse",
      /MIGHTY_APES_YELP_DELIVERY_CONFLICT|conflict/i,
    );

    const transactionTables = [
      AUDIT_TABLE,
      "leads",
      "lead_intake_records",
      "integration_sync_logs",
      "notifications",
      "office_tasks",
    ];
    const leadPayloadConflictBefore = await snapshotCounts(
      service,
      transactionTables,
    );
    const changedLeadPayload = buildProviderPayload({
      event: "lead.created",
      providerLeadId: primaryLeadId,
      name: `${marker} CHANGED PAYLOAD`,
      phone: "+14805550102",
      zipCode: "85255",
      message: `${marker} changed provider body for the same stable lead ID`,
      createdAt,
    });
    const changedLeadRequest = buildIntakeRequest({
      payload: changedLeadPayload,
      deliveryId: `${marker}:delivery:lead-payload-conflict`,
    });
    await expectRejected(
      () => callIngest(service, changedLeadRequest),
      "New delivery with conflicting stable-lead payload",
      /MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT/,
    );
    const leadPayloadConflictAfter = await snapshotCounts(
      service,
      transactionTables,
    );
    requireCondition(
      JSON.stringify(leadPayloadConflictAfter) ===
        JSON.stringify(leadPayloadConflictBefore),
      "Stable-lead payload conflict left an extra lead, intake, sync log, notification, or audit row.",
    );

    const sharedDeliveryId = `${marker}:delivery:concurrent-conflicting-leads`;
    const deliveryCollisionLeadIds = [
      `${marker}:lead:delivery-collision:a`,
      `${marker}:lead:delivery-collision:b`,
    ];
    const deliveryCollisionPayloads = deliveryCollisionLeadIds.map(
      (providerLeadId, index) => buildProviderPayload({
        event: "lead.created",
        providerLeadId,
        name: `${marker} DELIVERY COLLISION ${index === 0 ? "A" : "B"}`,
        phone: index === 0 ? "+14805550104" : "+14805550105",
        zipCode: "85255",
        jobCategory: "Roofing",
        message: `${marker} concurrent shared-delivery body ${index + 1}`,
        createdAt,
      }),
    );
    const deliveryCollisionBefore = await snapshotCounts(
      service,
      transactionTables,
    );
    const deliveryCollisionResults = await Promise.allSettled(
      deliveryCollisionPayloads.map((payload) =>
        callIngest(
          service,
          buildIntakeRequest({ payload, deliveryId: sharedDeliveryId }),
        ),
      ),
    );
    const deliveryCollisionSuccesses = deliveryCollisionResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    const deliveryCollisionFailures = deliveryCollisionResults.filter(
      (result) => result.status === "rejected",
    );
    deliveryCollisionSuccesses.forEach((result) => pushResultIds(ids, result));
    requireCondition(
      deliveryCollisionSuccesses.length === 1 &&
        deliveryCollisionSuccesses[0].status === "created" &&
        deliveryCollisionFailures.length === 1 &&
        /MIGHTY_APES_YELP_DELIVERY_CONFLICT/.test(
          describeError(deliveryCollisionFailures[0].reason),
        ),
      "Concurrent shared delivery ID with different lead IDs did not deterministically create one result and reject one delivery conflict.",
    );
    const deliveryCollisionAfter = await snapshotCounts(
      service,
      transactionTables,
    );

    for (const table of transactionTables) {
      requireCondition(
        deliveryCollisionAfter[table] === deliveryCollisionBefore[table] + 1,
        `Concurrent delivery conflict left an unexpected ${table} row count.`,
      );
    }

    const [
      deliveryCollisionAudits,
      deliveryCollisionIntakes,
      deliveryCollisionLogs,
      deliveryCollisionOfficeTasks,
    ] =
      await Promise.all([
        requireRows(
          service
            .from(AUDIT_TABLE)
            .select("id,provider_lead_id,linked_lead_id")
            .eq("delivery_id", sharedDeliveryId),
          "Verify concurrent shared-delivery audit residue",
        ),
        requireRows(
          service
            .from("lead_intake_records")
            .select("id,provider_event_id,linked_lead_id")
            .eq("provider", "yelp")
            .in("provider_event_id", deliveryCollisionLeadIds),
          "Verify concurrent shared-delivery intake residue",
        ),
        requireRows(
          service
            .from("integration_sync_logs")
            .select("id,external_id,related_record_id")
            .eq("provider", "yelp")
            .in("external_id", deliveryCollisionLeadIds),
          "Verify concurrent shared-delivery sync-log residue",
        ),
        requireRows(
          service
            .from("office_tasks")
            .select("id,company_id,lead_id,source_type")
            .eq("lead_id", deliveryCollisionSuccesses[0].lead_id),
          "Verify concurrent shared-delivery office-task residue",
        ),
      ]);
    requireCondition(
      deliveryCollisionAudits.length === 1 &&
        deliveryCollisionIntakes.length === 1 &&
        deliveryCollisionLogs.length === 1 &&
        deliveryCollisionOfficeTasks.length === 1 &&
        deliveryCollisionAudits[0].provider_lead_id ===
          deliveryCollisionIntakes[0].provider_event_id &&
        deliveryCollisionAudits[0].provider_lead_id ===
          deliveryCollisionLogs[0].external_id &&
        deliveryCollisionAudits[0].linked_lead_id ===
          deliveryCollisionIntakes[0].linked_lead_id &&
        deliveryCollisionAudits[0].linked_lead_id ===
          deliveryCollisionLogs[0].related_record_id &&
        deliveryCollisionOfficeTasks[0].lead_id ===
          deliveryCollisionAudits[0].linked_lead_id &&
        deliveryCollisionOfficeTasks[0].company_id === weatherTech.id &&
        deliveryCollisionOfficeTasks[0].source_type === "new_lead",
      "Rejected concurrent delivery left partial or mismatched persistence residue.",
    );
    ids.office_tasks.push(deliveryCollisionOfficeTasks[0].id);

    const concurrentLeadId = `${marker}:lead:concurrent`;
    const concurrentPayload = buildProviderPayload({
      event: "lead.created",
      providerLeadId: concurrentLeadId,
      name: `${marker} CONCURRENT`,
      phone: "+14805550103",
      zipCode: "85255",
      jobCategory: "Roofing",
      message: `${marker} concurrent delivery`,
      createdAt,
    });
    const concurrentBase = buildIntakeRequest({
      payload: concurrentPayload,
      deliveryId: `${marker}:delivery:concurrent:a`,
    });
    const concurrentResults = await Promise.all([
      callIngest(service, concurrentBase),
      callIngest(service, {
        ...concurrentBase,
        delivery_id: `${marker}:delivery:concurrent:b`,
        received_at: new Date().toISOString(),
      }),
    ]);
    concurrentResults.forEach((result) => pushResultIds(ids, result));
    requireCondition(
      concurrentResults.filter((result) => result.status === "created").length === 1 &&
        concurrentResults.filter((result) => result.status === "duplicate").length === 1 &&
        new Set(concurrentResults.map((result) => result.lead_id)).size === 1 &&
        new Set(concurrentResults.map((result) => result.intake_record_id)).size === 1,
      "Concurrent duplicate deliveries did not converge on one CRM lead and intake record.",
    );
    const concurrentLeadOfficeTasks = await requireRows(
      service
        .from("office_tasks")
        .select("id,company_id,lead_id,source_type")
        .eq("lead_id", concurrentResults[0].lead_id),
      "Verify converged concurrent lead office task",
    );
    requireCondition(
      concurrentLeadOfficeTasks.length === 1 &&
        concurrentLeadOfficeTasks[0].company_id === weatherTech.id &&
        concurrentLeadOfficeTasks[0].source_type === "new_lead",
      "Concurrent duplicate deliveries did not create exactly one normal lead-owned office task.",
    );
    ids.office_tasks.push(concurrentLeadOfficeTasks[0].id);

    const providerLeadRows = await requireRows(
      service
        .from("lead_intake_records")
        .select("id,linked_lead_id")
        .eq("provider", "yelp")
        .in("provider_event_id", [primaryLeadId, concurrentLeadId]),
      "Verify one intake per Mighty Apes provider lead",
    );
    requireCondition(
      providerLeadRows.length === 2 &&
        new Set(providerLeadRows.map((row) => row.linked_lead_id)).size === 2,
      "Mighty Apes provider lead IDs did not remain uniquely mapped to CRM leads.",
    );

    await expectRejected(
      () => callIngest(anonymous, createdRequest),
      "Anonymous Mighty Apes RPC call",
      /permission|denied|schema cache|function|42501|PGRST/i,
    );
    const { data: anonymousAuditRows, error: anonymousAuditError } = await anonymous
      .from(AUDIT_TABLE)
      .select("id")
      .like("delivery_id", `${marker}%`);
    requireCondition(
      anonymousAuditError || (anonymousAuditRows ?? []).length === 0,
      "Anonymous callers could read the private Mighty Apes delivery ledger.",
    );

    const newlyCreatedProviderLeadIds = [
      created.lead_id,
      deliveryCollisionSuccesses[0].lead_id,
      concurrentResults[0].lead_id,
    ];
    requireCondition(
      new Set(newlyCreatedProviderLeadIds).size === 3,
      "Hosted scenarios did not produce exactly three distinct provider-created CRM leads.",
    );
    const officeTasksAfter = await requireRows(
      service
        .from("office_tasks")
        .select("id,company_id,lead_id,source_type")
        .order("id"),
      "Verify normal and unrelated office tasks after Mighty Apes scenarios",
    );
    const generatedOfficeTasks = officeTasksAfter.filter((row) =>
      newlyCreatedProviderLeadIds.includes(row.lead_id),
    );
    const unrelatedOfficeTaskIdsAfter = officeTasksAfter
      .filter((row) => !newlyCreatedProviderLeadIds.includes(row.lead_id))
      .map((row) => row.id)
      .sort();
    const unrelatedOfficeTaskIdsBefore = officeTasksBefore
      .map((row) => row.id)
      .sort();
    requireCondition(
      generatedOfficeTasks.length === 3 &&
        new Set(generatedOfficeTasks.map((row) => row.lead_id)).size === 3 &&
        generatedOfficeTasks.every(
          (row) =>
            row.company_id === weatherTech.id && row.source_type === "new_lead",
        ) &&
        officeTasksAfter.length === officeTasksBefore.length + 3,
      "Each newly created Mighty Apes provider lead did not create exactly one normal WeatherTech office task.",
    );
    requireCondition(
      JSON.stringify(unrelatedOfficeTaskIdsAfter) ===
        JSON.stringify(unrelatedOfficeTaskIdsBefore),
      "Mighty Apes regression added, removed, or replaced an unrelated office task.",
    );
    ids.office_tasks.push(...generatedOfficeTasks.map((row) => row.id));

    const sideEffectsAfter = await snapshotCounts(service, sideEffectTables);
    requireCondition(
      JSON.stringify(sideEffectsAfter) === JSON.stringify(sideEffectsBefore),
      "Mighty Apes ingestion changed customer, communication, provider, or financial state outside the approved lead path.",
    );
    requireCondition(
      counters.blockedExternalRequests === 0,
      "A provider or non-regression network request was attempted.",
    );

    report = {
      result: "PASS",
      target: REGRESSION_SUPABASE_PROJECT_REF,
      runId,
      externalEnvironmentOnly: loaded.source === "external_file",
      leadTestAuditOnly: true,
      serviceRoleAuditUpdateRejected: true,
      auditUnchangedAfterUpdateAttempt: true,
      validLeadCreated: true,
      missingOptionalJobCategoryPreserved: true,
      multilineMessagePreserved: true,
      emailRemainedNull: true,
      weatherTechCompanyIsolationVerified: true,
      exactRetryIdempotent: true,
      alternateDeliveryIdempotent: true,
      conflictingDeliveryRejected: true,
      conflictingLeadPayloadRejected: true,
      conflictingLeadPayloadNoResidue: true,
      concurrentDeliveryConflictRejected: true,
      concurrentDeliveryConflictNoResidue: true,
      concurrentDuplicatesConverged: true,
      normalLeadOfficeTasksVerified: true,
      duplicateAndConflictOfficeTaskIsolation: true,
      unrelatedOfficeTasksPreserved: true,
      anonymousRpcRejected: true,
      privateAuditLedgerVerified: true,
      providerOrFinancialEffects: 0,
      providerNetworkRequests: 0,
      cleanupResidue: null,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (cleanupAuthorized) {
      try {
        await discoverRunRows(service, marker, ids);
        const leadIds = [...new Set(ids.leads.filter(Boolean))];
        const officeTasks = leadIds.length
          ? await requireRows(
              service.from("office_tasks").select("id").in("lead_id", leadIds),
              "Discover Mighty Apes lead-owned office tasks",
            )
          : [];
        ids.office_tasks.push(...officeTasks.map((row) => row.id));

        await deleteExactIds(service, AUDIT_TABLE, ids.mighty_apes_yelp_webhook_events);
        await deleteExactIds(service, "notifications", ids.notifications);
        await deleteExactIds(service, "office_tasks", ids.office_tasks);
        await deleteExactIds(service, "lead_intake_records", ids.lead_intake_records);
        await deleteExactIds(service, "integration_sync_logs", ids.integration_sync_logs);
        await deleteExactIds(service, "leads", ids.leads);

        for (const [table, values] of Object.entries(ids)) {
          await assertExactIdsAbsent(service, table, values);
        }
        const finalVerification = await runRegressionEnvironmentCommand({
          command: "verify",
          env: loaded.environment,
          fetchImpl: guardedFetch,
        });
        requireCondition(
          finalVerification.residueCount === 0,
          "Final Mighty Apes zero-residue verification failed.",
        );
        if (report) {
          report.cleanupResidue = 0;
        }
      } catch (error) {
        cleanupError = error;
      }
    }
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Mighty Apes Yelp regression and exact cleanup both failed.",
    );
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  requireCondition(
    report?.cleanupResidue === 0,
    "Mighty Apes Yelp regression did not prove zero residue.",
  );
  return report;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runMightyApesYelpRegression({ cwd: resolve(process.cwd()) })
    .then((report) => {
      console.log("WeatherTech OS Mighty Apes Yelp regression: PASS");
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        `WeatherTech OS Mighty Apes Yelp regression: FAIL: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
