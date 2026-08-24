#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  BROWSER_REGRESSION_ENV_FILE,
  loadBrowserRegressionEnvironment,
} from "../tests/codex-browser/regression-runtime.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  REGRESSION_OWNER_MARKER,
  REGRESSION_SUPABASE_PROJECT_REF,
  runRegressionEnvironmentCommand,
  validateRegressionEnvironment,
} from "./regression-environment.mjs";

export const LEAD_ACCOUNTABILITY_REGRESSION_RUN =
  "WTOS_LEAD_ACCOUNTABILITY_REGRESSION_RUN";

const MARKER_PREFIX = "TEST WTOS LEAD ACCOUNTABILITY REGRESSION:";
const NETWORK_TIMEOUT_MS = 20_000;

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function loadLeadAccountabilityRegressionEnvironment({
  cwd,
  runtimeEnv = process.env,
} = {}) {
  requireCondition(cwd, "Lead accountability regression requires an explicit repository path.");
  const externalPath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();

  requireCondition(
    externalPath && isAbsolute(externalPath),
    `${BROWSER_REGRESSION_ENV_FILE} must name a secure absolute environment file outside the repository. This runner never reads .env.local.`,
  );
  requireCondition(
    !runtimeEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    `Lead accountability regression accepts target credentials only from ${BROWSER_REGRESSION_ENV_FILE}.`,
  );

  const loaded = loadBrowserRegressionEnvironment({
    cwd,
    runtimeEnv,
    remoteWritesEnabled: true,
  });
  requireCondition(
    loaded.source === "external_file",
    "Lead accountability regression requires the secure external-file credential source.",
  );
  const config = validateRegressionEnvironment(loaded.environment);
  requireCondition(
    config.projectRef === REGRESSION_SUPABASE_PROJECT_REF,
    "Lead accountability target is not the approved isolated regression project.",
  );
  requireCondition(
    !config.supabaseUrl.includes(PRODUCTION_SUPABASE_PROJECT_REF),
    "Production Supabase is permanently prohibited as a lead accountability regression target.",
  );

  return { config, environment: loaded.environment, source: loaded.source };
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
        "Lead accountability regression blocked a non-regression network request before transmission.",
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
      () => controller.abort(new Error("Lead accountability regression request timed out.")),
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

async function deleteExactIds(client, table, ids) {
  const exactIds = [...new Set(ids.filter(Boolean))];
  if (!exactIds.length) return;
  const { error } = await client.from(table).delete().in("id", exactIds);
  if (error) {
    throw new Error(`Exact-ID cleanup failed for ${table}: ${error.message}`);
  }
}

async function assertExactIdsAbsent(client, table, ids) {
  const exactIds = [...new Set(ids.filter(Boolean))];
  if (!exactIds.length) return;
  await assertNoRows(
    client.from(table).select("id").in("id", exactIds),
    `${table} exact-ID residue`,
  );
}

async function countRows(client, table) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`Count ${table} failed: ${error.message}`);
  return count ?? 0;
}

async function snapshotCounts(client, tables) {
  return Object.fromEntries(
    await Promise.all(tables.map(async (table) => [table, await countRows(client, table)])),
  );
}

async function signIn(environment, email, password, guardedFetch) {
  const client = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: guardedFetch },
    },
  );
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw new Error(`Synthetic authenticated login failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

async function callRpc(client, name, argumentName, request) {
  const { data, error } = await client.rpc(name, { [argumentName]: request });
  if (error) throw error;
  requireCondition(data && typeof data === "object", `${name} returned no object result.`);
  return data;
}

async function readSyntheticProposalCleanupGraph(service, proposalRevisionId) {
  const [acceptances, requests, signatures, documents, invoices, jobs] =
    await Promise.all([
      requireRows(
        service
          .from("estimate_proposal_acceptances")
          .select("id")
          .eq("proposal_revision_id", proposalRevisionId),
        "Discover exact synthetic proposal acceptances",
      ),
      requireRows(
        service
          .from("proposal_signing_requests")
          .select("id,delivery_email_message_id")
          .eq("proposal_revision_id", proposalRevisionId),
        "Discover exact synthetic proposal signing requests",
      ),
      requireRows(
        service
          .from("signatures")
          .select("id")
          .eq("proposal_revision_id", proposalRevisionId),
        "Discover exact synthetic proposal signatures",
      ),
      requireRows(
        service
          .from("documents")
          .select("id,storage_bucket,storage_path")
          .eq("proposal_revision_id", proposalRevisionId),
        "Discover exact synthetic proposal documents",
      ),
      requireRows(
        service
          .from("invoices")
          .select("id")
          .eq("proposal_revision_id", proposalRevisionId),
        "Discover exact synthetic proposal invoices",
      ),
      requireRows(
        service
          .from("jobs")
          .select("id")
          .eq("proposal_revision_id", proposalRevisionId),
        "Discover exact synthetic proposal jobs",
      ),
    ]);
  const deliveryEmailIds = [
    ...new Set(requests.map((row) => row.delivery_email_message_id).filter(Boolean)),
  ];
  const [deliveryEmails, metadataEmails] = await Promise.all([
    deliveryEmailIds.length
      ? requireRows(
          service.from("email_messages").select("id").in("id", deliveryEmailIds),
          "Discover exact synthetic proposal delivery emails",
        )
      : [],
    requireRows(
      service
        .from("email_messages")
        .select("id")
        .contains("metadata", {
          draftType: "proposal_signature_request",
          proposalRevisionId,
        }),
      "Discover exact synthetic proposal metadata emails",
    ),
  ]);

  return {
    acceptances,
    requests,
    signatures,
    documents,
    invoices,
    jobs,
    emails: [
      ...new Map(
        [...deliveryEmails, ...metadataEmails].map((row) => [row.id, row]),
      ).values(),
    ],
  };
}

async function removeSyntheticProposalDocumentObjects(
  service,
  companyId,
  documents,
) {
  const paths = documents.map((document) => {
    requireCondition(
      document.storage_bucket === "customer-documents" &&
        typeof document.storage_path === "string" &&
        document.storage_path.startsWith(`${companyId}/`),
      "Synthetic proposal cleanup refused an unexpected Storage scope.",
    );
    return document.storage_path;
  });
  if (paths.length) {
    const { error } = await service.storage.from("customer-documents").remove(paths);
    if (error) {
      throw new Error(`Exact synthetic proposal Storage cleanup failed: ${error.message}`);
    }
  }
  for (const path of paths) {
    const { data, error } = await service.storage
      .from("customer-documents")
      .download(path);
    requireCondition(
      !data && Boolean(error),
      `Synthetic proposal Storage residue remains at exact path ${path}.`,
    );
  }
}

async function cleanupSyntheticProposalRevision({
  service,
  ownerUserId,
  marker,
  proposalRevisionId,
}) {
  const revisions = await requireRows(
    service
      .from("estimate_proposal_revisions")
      .select("id,company_id")
      .eq("id", proposalRevisionId),
    "Discover exact synthetic proposal revision",
  );
  requireCondition(
    revisions.length <= 1,
    "Exact synthetic proposal cleanup found duplicate revision identity.",
  );
  if (!revisions.length) return;

  const companyId = revisions[0].company_id;
  const graph = await readSyntheticProposalCleanupGraph(
    service,
    proposalRevisionId,
  );
  await removeSyntheticProposalDocumentObjects(
    service,
    companyId,
    graph.documents,
  );
  const cleaned = await callRpc(
    service,
    "wtos_cleanup_synthetic_proposal_fixture",
    "cleanup_request",
    {
      operationKey: randomUUID(),
      regressionOwnerUserId: ownerUserId,
      companyId,
      marker,
      proposalRevisionId,
      acceptanceIds: graph.acceptances.map((row) => row.id).sort(),
      signingRequestIds: graph.requests.map((row) => row.id).sort(),
      signatureIds: graph.signatures.map((row) => row.id).sort(),
      documentIds: graph.documents.map((row) => row.id).sort(),
      emailMessageIds: graph.emails.map((row) => row.id).sort(),
      invoiceIds: graph.invoices.map((row) => row.id).sort(),
      jobIds: graph.jobs.map((row) => row.id).sort(),
    },
  );
  requireCondition(
    cleaned.ok === true &&
      cleaned.status === "cleaned" &&
      cleaned.proposalRevisionId === proposalRevisionId &&
      cleaned.storageResidueCount === 0 &&
      cleaned.databaseResidueCount === 0,
    "Exact synthetic proposal cleanup did not prove zero residue.",
  );
}

async function expectRejected(callback, label, expectedCode, expectedMessage) {
  try {
    await callback();
  } catch (error) {
    const code = error?.code ?? null;
    const evidence = [error?.message, error?.details, error?.hint]
      .filter((value) => typeof value === "string" && value.trim())
      .join(" | ");
    if (expectedCode) {
      const acceptedCodes = Array.isArray(expectedCode) ? expectedCode : [expectedCode];
      requireCondition(
        acceptedCodes.includes(code),
        `${label} returned ${code ?? "no SQLSTATE"}: ${evidence}`,
      );
    }
    if (expectedMessage) {
      requireCondition(
        expectedMessage.test(evidence),
        `${label} failed for the wrong reason: ${evidence}`,
      );
    }
    return { code, evidence };
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function observeOutcome(promise) {
  try {
    return { ok: true, value: await promise, error: null };
  } catch (error) {
    return { ok: false, value: null, error };
  }
}

async function readAccountability(client, leadId, label = "Read lead accountability") {
  const rows = await requireRows(
    client.from("lead_accountability").select("*").eq("lead_id", leadId),
    label,
  );
  requireCondition(rows.length === 1, `${label} returned ${rows.length} rows.`);
  return rows[0];
}

async function readEvents(client, leadId, label = "Read lead accountability events") {
  return requireRows(
    client
      .from("lead_accountability_events")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true }),
    label,
  );
}

function createLeadRequest({
  marker,
  operationKey = randomUUID(),
  operation,
  companyId,
  contactName,
  sourceKey,
  sourceDetail = null,
  intakeProvider = null,
  campaignId = null,
  evidenceKind = "staff_selected",
  reviewStatus = "verified",
  ownerUserId = null,
  receivedAt,
  nextFollowUp = null,
  serviceType = "roofing",
  estimatedValue = 0,
}) {
  return {
    operation_key: operationKey,
    company_id: companyId,
    contact_name: contactName,
    phone: null,
    email: null,
    property_address: `${operation} ${marker} Way`,
    city: "Phoenix",
    state: "AZ",
    postal_code: "85001",
    service_type: serviceType,
    priority: "normal",
    estimated_value: estimatedValue,
    next_follow_up: nextFollowUp,
    notes: marker,
    source_key: sourceKey,
    source_detail: sourceDetail,
    intake_provider: intakeProvider,
    campaign_id: campaignId,
    intake_record_id: null,
    evidence_kind: evidenceKind,
    review_status: reviewStatus,
    owner_user_id: ownerUserId,
    received_at: receivedAt,
  };
}

async function assertActionStateUnchanged(client, leadId, before, label) {
  const after = await readAccountability(client, leadId, `${label} state readback`);
  const events = await readEvents(client, leadId, `${label} event readback`);
  requireCondition(
    after.record_version === before.recordVersion && events.length === before.eventCount,
    `${label} left a partial accountability mutation.`,
  );
}

async function createWorkflowEvidence(service, ids, companyId, leadId, marker, index) {
  const scheduleId = randomUUID();
  const inspectionId = randomUUID();
  const estimateId = randomUUID();
  const baseTime = Date.now() - 10 * 60 * 1000 + index * 1000;
  const appointmentAt = new Date(baseTime).toISOString();
  const inspectionAt = new Date(baseTime + 60 * 1000).toISOString();
  const estimateAt = new Date(baseTime + 2 * 60 * 1000).toISOString();
  ids.schedule_events.push(scheduleId);
  ids.inspections.push(inspectionId);
  ids.estimates.push(estimateId);

  await requireRows(
    service.from("schedule_events").insert({
      id: scheduleId,
      company_id: companyId,
      customer_id: null,
      lead_id: leadId,
      job_id: null,
      title: `${marker} APPOINTMENT ${index}`,
      event_type: "inspection",
      status: "scheduled",
      start_at: new Date(baseTime + 24 * 60 * 60 * 1000).toISOString(),
      end_at: new Date(baseTime + 25 * 60 * 60 * 1000).toISOString(),
      notes: marker,
      created_at: appointmentAt,
      updated_at: appointmentAt,
    }).select("id"),
    `Create workflow appointment ${index}`,
  );
  await requireRows(
    service.from("inspections").insert({
      id: inspectionId,
      company_id: companyId,
      customer_id: null,
      lead_id: leadId,
      job_id: null,
      schedule_event_id: scheduleId,
      estimate_id: null,
      title: `${marker} INSPECTION ${index}`,
      status: "completed",
      checklist: "[]",
      completed_at: inspectionAt,
      created_at: inspectionAt,
      updated_at: inspectionAt,
    }).select("id"),
    `Create workflow inspection ${index}`,
  );
  await requireRows(
    service.from("estimates").insert({
      id: estimateId,
      company_id: companyId,
      customer_id: null,
      lead_id: leadId,
      title: `${marker} ESTIMATE ${index}`,
      status: "sent",
      service_type: "roofing",
      total: 12000 + index,
      notes: marker,
      created_at: estimateAt,
      updated_at: estimateAt,
    }).select("id"),
    `Create workflow estimate ${index}`,
  );

  return { scheduleId, inspectionId, estimateId };
}

async function settleWithTimeout(promise, label) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out.`)),
          NETWORK_TIMEOUT_MS + 1_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runLeadAccountabilityRegression({
  cwd = process.cwd(),
  runtimeEnv = process.env,
  fetchImpl = fetch,
} = {}) {
  const loaded = loadLeadAccountabilityRegressionEnvironment({ cwd: resolve(cwd), runtimeEnv });
  const { guardedFetch, counters } = createNetworkGuard(fetchImpl, loaded.config.supabaseUrl);
  const preflight = await runRegressionEnvironmentCommand({
    command: "verify",
    env: loaded.environment,
    fetchImpl: guardedFetch,
  });
  requireCondition(
    preflight.target === REGRESSION_SUPABASE_PROJECT_REF && preflight.residueCount === 0,
    "Isolated lead accountability preflight did not prove target identity and zero residue.",
  );

  const service = createClient(loaded.config.supabaseUrl, loaded.config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  const anonymous = createClient(loaded.config.supabaseUrl, loaded.config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  const ownerSession = await signIn(
    loaded.environment,
    loaded.config.ownerEmail,
    loaded.config.ownerPassword,
    guardedFetch,
  );
  const owner = ownerSession.client;
  const ownerUserId = ownerSession.user.id;
  const ownerRaceSession = await signIn(
    loaded.environment,
    loaded.config.ownerEmail,
    loaded.config.ownerPassword,
    guardedFetch,
  );
  const ownerRace = ownerRaceSession.client;
  const runId = randomUUID();
  const marker = `${MARKER_PREFIX}${runId}`;
  const safeKey = `accountability_${runId.replaceAll("-", "_")}`;
  const ids = {
    customers: [],
    properties: [],
    leads: [],
    schedule_events: [],
    inspections: [],
    estimates: [],
    estimate_proposal_acceptances: [],
    estimate_proposal_revisions: [],
    lead_intake_records: [],
    lead_accountability_events: [],
    lead_accountability: [],
    marketing_accountability_operation_receipts: [],
    marketing_spend_months: [],
    marketing_campaigns: [],
  };
  let salesUserId = null;
  let sales = null;
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
    requireCondition(weatherTech?.trade === "roofing" && ihc?.trade === "painting", "Approved company identities are missing.");

    await Promise.all([
      assertNoRows(
        service.from("leads").select("id").like("contact_name", `${marker}%`),
        "Lead accountability lead marker collision",
      ),
      assertNoRows(
        service.from("marketing_campaigns").select("id").like("campaign_name", `${marker}%`),
        "Lead accountability campaign marker collision",
      ),
      assertNoRows(
        service.from("marketing_spend_months").select("id").like("notes", `${marker}%`),
        "Lead accountability spend marker collision",
      ),
    ]);
    cleanupAuthorized = true;

    const salesEmail = `weathertech-os-regression-accountability-${runId}@example.test`;
    const salesPassword = `Synthetic-${runId}-only`;
    const { data: createdAuth, error: createAuthError } = await service.auth.admin.createUser({
      email: salesEmail,
      password: salesPassword,
      email_confirm: true,
      app_metadata: {
        wt_os_regression_marker: REGRESSION_OWNER_MARKER,
        wt_os_regression_project_ref: REGRESSION_SUPABASE_PROJECT_REF,
      },
    });
    if (createAuthError || !createdAuth.user) {
      throw new Error(`Sales regression user creation failed: ${createAuthError?.message}`);
    }
    salesUserId = createdAuth.user.id;
    await requireRows(
      service.from("profiles").upsert({
        id: salesUserId,
        full_name: marker,
        role: "sales",
        default_company_id: weatherTech.id,
      }).select("id"),
      "Create sales regression profile",
    );
    await requireRows(
      service.from("company_memberships").upsert({
        user_id: salesUserId,
        company_id: weatherTech.id,
        role: "sales",
        can_manage_settings: false,
        can_manage_financials: false,
        can_manage_production: false,
      }).select("user_id"),
      "Create sales regression membership",
    );
    sales = (await signIn(loaded.environment, salesEmail, salesPassword, guardedFetch)).client;

    const protectedBefore = await snapshotCounts(service, [
      "communication_provider_events",
      "sms_messages",
      "email_messages",
      "invoices",
      "payments",
    ]);

    const directTerminalStateBefore = await snapshotCounts(service, [
      "leads",
      "lead_accountability",
      "lead_accountability_events",
    ]);
    for (const [label, status, pipelineStage] of [
      ["Direct authenticated terminal lead insert", "won", "approved"],
      ["Direct authenticated lost lead insert", "lost", "lost"],
      ["Direct authenticated split lead insert", "won", "lost"],
    ]) {
      const rejectedLeadId = randomUUID();
      ids.leads.push(rejectedLeadId);
      const { error: directTerminalError } = await sales.from("leads").insert({
        id: rejectedLeadId,
        company_id: weatherTech.id,
        customer_id: null,
        contact_name: `${marker} ${label.toUpperCase()}`,
        phone: null,
        email: null,
        property_address: `${marker} ${label} Way`,
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        service_type: "roofing",
        source: "Manual",
        status,
        pipeline_stage: pipelineStage,
        priority: "normal",
        estimated_value: 0,
        notes: marker,
        created_by: salesUserId,
      });
      requireCondition(
        directTerminalError?.code === "23514" &&
          /accountable|won|lost|status|stage/i.test(directTerminalError.message),
        `${label} returned ${directTerminalError?.code ?? "no SQLSTATE"}: ${directTerminalError?.message ?? "no message"}.`,
      );
      await Promise.all([
        assertNoRows(
          service.from("leads").select("id").eq("id", rejectedLeadId),
          `${label} lead rollback`,
        ),
        assertNoRows(
          service.from("lead_accountability").select("id").eq("lead_id", rejectedLeadId),
          `${label} accountability rollback`,
        ),
        assertNoRows(
          service.from("lead_accountability_events").select("id").eq("lead_id", rejectedLeadId),
          `${label} event rollback`,
        ),
      ]);
    }
    requireCondition(
      JSON.stringify(
        await snapshotCounts(service, [
          "leads",
          "lead_accountability",
          "lead_accountability_events",
        ]),
      ) === JSON.stringify(directTerminalStateBefore),
      "Rejected direct terminal/split lead inserts left partial current-state or ledger rows.",
    );

    const campaignBase = {
      expected_version: 0,
      source_key: "google",
      source_detail: "google_ads",
      intake_provider: "website",
      vendor_key: "same_vendor",
      vendor_name: "Same Vendor",
      campaign_key: safeKey,
      campaign_name: `${marker} SAME CAMPAIGN`,
      external_campaign_id: null,
      starts_on: "2026-08-01",
      ends_on: null,
      is_active: true,
    };
    const wtCampaignRequest = {
      ...campaignBase,
      operation_key: randomUUID(),
      company_id: weatherTech.id,
      campaign_id: null,
    };
    const wtCampaign = await callRpc(
      owner,
      "wtos_upsert_marketing_campaign",
      "campaign_request",
      wtCampaignRequest,
    );
    requireCondition(wtCampaign.status === "created" && wtCampaign.record_version === 1, "WeatherTech campaign was not created at version 1.");
    ids.marketing_campaigns.push(wtCampaign.campaign_id);
    const wtCampaignRetry = await callRpc(owner, "wtos_upsert_marketing_campaign", "campaign_request", wtCampaignRequest);
    requireCondition(wtCampaignRetry.status === "idempotent" && wtCampaignRetry.campaign_id === wtCampaign.campaign_id, "Campaign exact retry did not converge.");
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_campaign", "campaign_request", {
        ...wtCampaignRequest,
        operation_key: randomUUID(),
        campaign_name: `${marker} DUPLICATE SAME-COMPANY IDENTITY`,
      }),
      "Same-company duplicate campaign identity",
      "23505",
      /identity|already exists|campaign/i,
    );

    const ihcCampaign = await callRpc(
      owner,
      "wtos_upsert_marketing_campaign",
      "campaign_request",
      {
        ...campaignBase,
        operation_key: randomUUID(),
        company_id: ihc.id,
        campaign_id: null,
      },
    );
    ids.marketing_campaigns.push(ihcCampaign.campaign_id);
    requireCondition(ihcCampaign.campaign_id !== wtCampaign.campaign_id, "Same campaign/vendor identity leaked across companies.");

    await expectRejected(
      () => callRpc(sales, "wtos_upsert_marketing_campaign", "campaign_request", {
        ...campaignBase,
        operation_key: randomUUID(),
        company_id: weatherTech.id,
        campaign_id: null,
        campaign_key: `${safeKey}_sales_refused`,
        campaign_name: `${marker} SALES REFUSED`,
      }),
      "Sales campaign mutation",
      "42501",
      /owner|admin|marketing/i,
    );

    const campaignUpdated = await callRpc(owner, "wtos_upsert_marketing_campaign", "campaign_request", {
      ...wtCampaignRequest,
      operation_key: randomUUID(),
      campaign_id: wtCampaign.campaign_id,
      expected_version: 1,
      campaign_name: `${marker} SAME CAMPAIGN UPDATED`,
    });
    requireCondition(campaignUpdated.status === "updated" && campaignUpdated.record_version === 2, "Campaign update did not advance one version.");
    const delayedCampaignRetry = await callRpc(
      owner,
      "wtos_upsert_marketing_campaign",
      "campaign_request",
      wtCampaignRequest,
    );
    const [campaignAfterDelayedRetry] = await requireRows(
      service
        .from("marketing_campaigns")
        .select("id,campaign_name,record_version,last_operation_key")
        .eq("id", wtCampaign.campaign_id),
      "Read campaign after delayed exact retry",
    );
    requireCondition(
      delayedCampaignRetry.status === "idempotent" &&
        delayedCampaignRetry.campaign_id === wtCampaign.campaign_id &&
        delayedCampaignRetry.record_version === 1 &&
        campaignAfterDelayedRetry.record_version === 2 &&
        campaignAfterDelayedRetry.campaign_name === `${marker} SAME CAMPAIGN UPDATED` &&
        campaignAfterDelayedRetry.last_operation_key !== wtCampaignRequest.operation_key,
      "Delayed campaign retry did not resolve its immutable original receipt without reverting the later edit.",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_campaign", "campaign_request", {
        ...campaignBase,
        operation_key: wtCampaignRequest.operation_key,
        company_id: weatherTech.id,
        campaign_id: null,
        campaign_key: `${safeKey}_reused_target`,
        campaign_name: `${marker} REUSED CAMPAIGN OPERATION TARGET`,
      }),
      "Old campaign operation key reused on a different target",
      "23000",
      /operation key|different|target/i,
    );
    await assertNoRows(
      service
        .from("marketing_campaigns")
        .select("id")
        .eq("campaign_key", `${safeKey}_reused_target`),
      "Different-target campaign operation-key rollback",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_campaign", "campaign_request", {
        ...wtCampaignRequest,
        operation_key: randomUUID(),
        campaign_id: wtCampaign.campaign_id,
        expected_version: 1,
        campaign_name: `${marker} STALE CAMPAIGN`,
      }),
      "Stale campaign update",
      "P0001",
      /marketing campaign changed after review\./i,
    );

    const cohorts = [
      ["GOOGLE WON", "google", "google_ads", wtCampaign.campaign_id, "2026-08-05T16:00:00.000Z", "2026-08-20"],
      ["GOOGLE LOST", "google", "google_ads", wtCampaign.campaign_id, "2026-08-06T16:00:00.000Z", "2026-08-20"],
      ["YELP AWAITING", "yelp", "mighty_apes", null, "2026-08-07T16:00:00.000Z", null],
      ["UNKNOWN AWAITING", "unknown", null, null, "2026-08-08T16:00:00.000Z", null],
      ["WEBSITE OVERDUE", "website", null, null, "2026-08-09T16:00:00.000Z", "2026-08-10"],
      ["WEBSITE NO FOLLOWUP", "website", null, null, "2026-08-10T16:00:00.000Z", null],
      ["JULY BOUNDARY", "manual", null, null, "2026-08-01T06:59:59.999Z", null],
      ["SEPTEMBER BOUNDARY", "manual", null, null, "2026-09-01T07:00:00.000Z", null],
    ];
    const leadResults = [];
    for (const [index, cohort] of cohorts.entries()) {
      const [label, sourceKey, sourceDetail, campaignId, receivedAt, nextFollowUp] = cohort;
      const unknown = sourceKey === "unknown";
      const provider = sourceKey === "yelp";
      const request = createLeadRequest({
        marker,
        operation: `LEAD:${index}`,
        companyId: weatherTech.id,
        contactName: `${marker} ${label}`,
        sourceKey,
        sourceDetail,
        intakeProvider: provider ? "mighty_apes" : sourceKey === "google" ? "website" : sourceKey === "website" ? "website" : "manual",
        campaignId,
        evidenceKind: unknown ? "insufficient" : provider ? "provider_verified" : "staff_selected",
        reviewStatus: unknown ? "needs_review" : "verified",
        ownerUserId: null,
        receivedAt,
        nextFollowUp,
      });
      const actor = service;
      const result = await callRpc(actor, "wtos_create_accountable_lead", "accountability_request", request);
      requireCondition(result.status === "created", `Accountable lead ${label} was not created.`);
      ids.leads.push(result.lead_id);
      ids.lead_accountability.push(result.accountability_id);
      leadResults.push({ request, result });
    }

    const [
      wonLead,
      lostLead,
      yelpLead,
      ,
      overdueLead,
      noFollowUpLead,
      julyBoundaryLead,
    ] = leadResults;
    const wonInitial = await readAccountability(service, wonLead.result.lead_id);

    const exactRetry = await callRpc(
      sales,
      "wtos_create_accountable_lead",
      "accountability_request",
      wonLead.request,
    );
    requireCondition(exactRetry.status === "idempotent" && exactRetry.lead_id === wonLead.result.lead_id, "Accountable lead exact retry did not converge.");
    await expectRejected(
      () => callRpc(sales, "wtos_create_accountable_lead", "accountability_request", {
        ...wonLead.request,
        contact_name: `${marker} CONFLICTING RETRY`,
      }),
      "Conflicting accountable lead operation reuse",
      "23000",
      /operation key|different/i,
    );

    const nanLeadOperation = randomUUID();
    const beforeNanLead = await countRows(service, "leads");
    await expectRejected(
      () => callRpc(sales, "wtos_create_accountable_lead", "accountability_request", createLeadRequest({
        marker,
        operationKey: nanLeadOperation,
        operation: "LEAD:NAN-ESTIMATED-VALUE",
        companyId: weatherTech.id,
        contactName: `${marker} NAN ESTIMATED VALUE`,
        sourceKey: "manual",
        sourceDetail: "staff_entered",
        intakeProvider: "manual",
        evidenceKind: "staff_selected",
        reviewStatus: "verified",
        receivedAt: null,
        estimatedValue: "NaN",
      })),
      "NaN accountable-lead estimated value",
      ["22023", "23514"],
      /estimated|numeric|number|invalid/i,
    );
    requireCondition(
      (await countRows(service, "leads")) === beforeNanLead,
      "NaN estimated-value rejection left a partial lead.",
    );
    await assertNoRows(
      service
        .from("lead_accountability_events")
        .select("id")
        .eq("operation_key", nanLeadOperation),
      "NaN estimated-value event rollback",
    );

    const piiLikeOperationKey = "Jane Doe jane@example.test";
    const beforePiiLikeOperation = await countRows(service, "leads");
    await expectRejected(
      () => callRpc(sales, "wtos_create_accountable_lead", "accountability_request", {
        ...createLeadRequest({
          marker,
          operation: "LEAD:UNSAFE-OPERATION-KEY",
          companyId: weatherTech.id,
          contactName: `${marker} UNSAFE OPERATION KEY`,
          sourceKey: "manual",
          sourceDetail: "staff_entered",
          intakeProvider: "manual",
          evidenceKind: "staff_selected",
          reviewStatus: "verified",
          receivedAt: null,
        }),
        operation_key: piiLikeOperationKey,
      }),
      "PII-like unsafe operation key",
      "22023",
      /operation|opaque|safe|invalid/i,
    );
    requireCondition(
      (await countRows(service, "leads")) === beforePiiLikeOperation,
      "PII-like operation-key rejection left a partial lead.",
    );
    await assertNoRows(
      service
        .from("lead_accountability_events")
        .select("id")
        .eq("operation_key", piiLikeOperationKey),
      "PII-like operation-key rollback",
    );

    const beforeCrossCompany = await countRows(service, "leads");
    await expectRejected(
      () => callRpc(sales, "wtos_create_accountable_lead", "accountability_request", createLeadRequest({
        marker,
        operation: "LEAD:CROSS-COMPANY-CAMPAIGN",
        companyId: weatherTech.id,
        contactName: `${marker} CROSS COMPANY CAMPAIGN`,
        sourceKey: "google",
        sourceDetail: "google_ads",
        intakeProvider: "website",
        campaignId: ihcCampaign.campaign_id,
        evidenceKind: "staff_selected",
        reviewStatus: "verified",
        receivedAt: "2026-08-11T16:00:00.000Z",
      })),
      "Cross-company campaign reference",
      "23503",
      /campaign|company|source/i,
    );
    requireCondition(await countRows(service, "leads") === beforeCrossCompany, "Cross-company campaign rejection left a partial lead.");

    const beforeGenericRepeat = await countRows(service, "leads");
    const genericRepeatOperation = randomUUID();
    await expectRejected(
      () => callRpc(sales, "wtos_create_accountable_lead", "accountability_request", createLeadRequest({
        marker,
        operationKey: genericRepeatOperation,
        operation: "LEAD:GENERIC-REPEAT-REFUSED",
        companyId: weatherTech.id,
        contactName: `${marker} GENERIC REPEAT REFUSED`,
        sourceKey: "repeat_customer",
        sourceDetail: "repeat_customer",
        intakeProvider: null,
        evidenceKind: "repeat_customer",
        reviewStatus: "verified",
        receivedAt: null,
      })),
      "Generic accountable lead repeat-customer attribution",
      ["42501", "23514"],
      /repeat|customer 360|opportunity/i,
    );
    requireCondition(
      (await countRows(service, "leads")) === beforeGenericRepeat,
      "Refused generic repeat-customer creation left a partial lead.",
    );
    await assertNoRows(
      service
        .from("lead_accountability_events")
        .select("id")
        .eq("operation_key", genericRepeatOperation),
      "Refused generic repeat-customer event rollback",
    );

    const repeatReviewTarget = await readAccountability(
      service,
      yelpLead.result.lead_id,
      "Read generic repeat-review target",
    );
    const repeatReviewBefore = {
      recordVersion: repeatReviewTarget.record_version,
      eventCount: (await readEvents(service, yelpLead.result.lead_id)).length,
    };
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: yelpLead.result.lead_id,
        expected_version: repeatReviewTarget.record_version,
        action: "attribution_reviewed",
        source_key: "repeat_customer",
        source_detail: "repeat_customer",
        intake_provider: null,
        campaign_id: null,
        intake_record_id: null,
        evidence_kind: "repeat_customer",
        review_status: "verified",
        reason_code: "staff_correction",
      }),
      "Generic attribution review to repeat-customer",
      ["42501", "23514"],
      /repeat|customer 360|opportunity/i,
    );
    await assertActionStateUnchanged(
      service,
      yelpLead.result.lead_id,
      repeatReviewBefore,
      "Generic repeat-customer review rollback",
    );

    const reviewRequest = {
      operation_key: randomUUID(),
      lead_id: wonLead.result.lead_id,
      expected_version: wonInitial.record_version,
      action: "attribution_reviewed",
      source_key: "referral",
      source_detail: "customer_referral",
      intake_provider: "manual",
      campaign_id: null,
      intake_record_id: null,
      evidence_kind: "customer_stated",
      review_status: "verified",
      reason_code: "staff_correction",
    };
    const reviewed = await callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", reviewRequest);
    requireCondition(reviewed.status === "applied", "Audited attribution correction was not applied.");
    const corrected = await readAccountability(service, wonLead.result.lead_id);
    requireCondition(corrected.source_key === "referral" && corrected.attribution_locked_at, "Attribution correction did not remain explicitly locked.");

    const beforeInvalidReview = {
      recordVersion: corrected.record_version,
      eventCount: (await readEvents(service, wonLead.result.lead_id)).length,
    };
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        ...reviewRequest,
        operation_key: randomUUID(),
        expected_version: corrected.record_version,
        source_key: "google",
        source_detail: "google_ads",
        campaign_id: ihcCampaign.campaign_id,
      }),
      "Cross-company attribution correction",
      "23503",
      /campaign|company|source/i,
    );
    await assertActionStateUnchanged(service, wonLead.result.lead_id, beforeInvalidReview, "Invalid attribution rollback");

    const preContact = await readAccountability(service, wonLead.result.lead_id);
    await expectRejected(
      () => callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: wonLead.result.lead_id,
        expected_version: preContact.record_version,
        action: "contacted",
        human_contact: false,
        first_response_channel: "sms",
        occurred_at: "2026-08-05T17:00:00.000Z",
      }),
      "Automated acknowledgement as first human response",
      "23514",
      /human|contact/i,
    );
    const contactOperationKey = randomUUID();
    const contactRequest = {
      operation_key: contactOperationKey,
      lead_id: wonLead.result.lead_id,
      expected_version: preContact.record_version,
      action: "contacted",
      human_contact: true,
      first_response_channel: "phone",
      occurred_at: "2026-08-05T17:00:00.000Z",
    };
    const contactResults = await Promise.all([
      callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", contactRequest),
      callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
        ...contactRequest,
        operation_key: contactOperationKey.toUpperCase(),
      }),
    ]);
    const contactEvents = (await readEvents(service, wonLead.result.lead_id)).filter(
      (event) =>
        event.event_type === "contacted" &&
        event.operation_key === contactOperationKey,
    );
    requireCondition(
      contactResults.some((row) => row.status === "applied") &&
        contactResults.some((row) => row.status === "idempotent") &&
        new Set(contactResults.map((row) => row.event_id)).size === 1 &&
        contactEvents.length === 1,
      "Concurrent uppercase/lowercase UUID retries did not converge to one first-contact result and event.",
    );
    const afterContact = await readAccountability(service, wonLead.result.lead_id);
    requireCondition(
      afterContact.source_key === "referral" &&
        afterContact.first_response_channel === "phone" &&
        afterContact.first_response_at &&
        afterContact.last_operation_key === contactOperationKey &&
        afterContact.record_version === preContact.record_version + 1,
      "Later communication overwrote first-touch attribution or failed to record human contact.",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: wonLead.result.lead_id,
        expected_version: preContact.record_version,
        action: "owner_assigned",
        owner_user_id: ownerUserId,
      }),
      "Stale accountability action",
      "P0001",
      /lead accountability record changed after review\./i,
    );

    for (const [index, lead] of [lostLead, overdueLead, noFollowUpLead].entries()) {
      const current = await readAccountability(service, lead.result.lead_id);
      const receivedAtMs = new Date(current.received_at).getTime();
      const contactOccurredAt = new Date(receivedAtMs + 60 * 60 * 1_000);
      requireCondition(
        Number.isFinite(receivedAtMs) &&
          contactOccurredAt.getTime() >= receivedAtMs &&
          contactOccurredAt.getTime() <= Date.now(),
        "Fixture contact must occur after lead receipt and no later than the current time.",
      );
      await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: lead.result.lead_id,
        expected_version: current.record_version,
        action: "contacted",
        human_contact: true,
        first_response_channel: index === 0 ? "email" : "phone",
        occurred_at: contactOccurredAt.toISOString(),
      });
    }

    const outOfOrder = await readAccountability(service, yelpLead.result.lead_id);
    const outOfOrderBefore = {
      recordVersion: outOfOrder.record_version,
      eventCount: (await readEvents(service, yelpLead.result.lead_id)).length,
    };
    await expectRejected(
      () => callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: yelpLead.result.lead_id,
        expected_version: outOfOrder.record_version,
        action: "inspection_completed",
        inspection_id: randomUUID(),
      }),
      "Out-of-order manual inspection milestone",
      "23514",
      /appointment|inspection|order|evidence/i,
    );
    await assertActionStateUnchanged(service, yelpLead.result.lead_id, outOfOrderBefore, "Out-of-order workflow rollback");

    const linkageGapEstimateId = randomUUID();
    ids.estimates.push(linkageGapEstimateId);
    await requireRows(
      service.from("estimates").insert({
        id: linkageGapEstimateId,
        company_id: weatherTech.id,
        customer_id: null,
        lead_id: julyBoundaryLead.result.lead_id,
        title: `${marker} LINKAGE GAP ESTIMATE`,
        status: "sent",
        service_type: "roofing",
        total: 9000,
        notes: marker,
      }).select("id"),
      "Create authoritative out-of-order estimate",
    );
    const preGapEvents = await readEvents(service, julyBoundaryLead.result.lead_id);
    requireCondition(
      !preGapEvents.some((event) => event.event_type === "estimate_sent"),
      "Automatic out-of-order estimate fabricated an estimate-sent KPI milestone.",
    );
    const gapDashboard = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-07-01", source_key: "manual" },
    );
    requireCondition(
      gapDashboard.metrics.workflow_linkage_gap_count === 1,
      "Authoritative workflow record missing its prerequisite event was not visible as one linkage gap.",
    );
    const gapScheduleId = randomUUID();
    const gapInspectionId = randomUUID();
    ids.schedule_events.push(gapScheduleId);
    ids.inspections.push(gapInspectionId);
    const gapBeforeContact = await readAccountability(service, julyBoundaryLead.result.lead_id);
    await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: julyBoundaryLead.result.lead_id,
      expected_version: gapBeforeContact.record_version,
      action: "contacted",
      human_contact: true,
      first_response_channel: "phone",
    });
    await requireRows(
      service.from("schedule_events").insert({
        id: gapScheduleId,
        company_id: weatherTech.id,
        customer_id: null,
        lead_id: julyBoundaryLead.result.lead_id,
        job_id: null,
        title: `${marker} LINKAGE GAP APPOINTMENT`,
        event_type: "inspection",
        status: "scheduled",
        start_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        end_at: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
        notes: marker,
      }).select("id"),
      "Create linkage-gap prerequisite appointment",
    );
    await requireRows(
      service.from("inspections").insert({
        id: gapInspectionId,
        company_id: weatherTech.id,
        customer_id: null,
        lead_id: julyBoundaryLead.result.lead_id,
        job_id: null,
        schedule_event_id: gapScheduleId,
        estimate_id: linkageGapEstimateId,
        title: `${marker} LINKAGE GAP INSPECTION`,
        status: "completed",
        checklist: "[]",
      }).select("id"),
      "Create linkage-gap prerequisite inspection",
    );
    const gapPrerequisiteEvents = await readEvents(
      service,
      julyBoundaryLead.result.lead_id,
      "Read linkage-gap prerequisite milestones",
    );
    const gapAppointmentEvent = gapPrerequisiteEvents.find(
      (event) =>
        event.event_type === "appointment_scheduled" &&
        event.linked_table === "schedule_events" &&
        event.linked_record_id === gapScheduleId,
    );
    const gapInspectionEvent = gapPrerequisiteEvents.find(
      (event) =>
        event.event_type === "inspection_completed" &&
        event.linked_table === "inspections" &&
        event.linked_record_id === gapInspectionId,
    );
    requireCondition(
      gapAppointmentEvent &&
        gapInspectionEvent &&
        new Date(gapInspectionEvent.occurred_at).getTime() >=
          new Date(gapAppointmentEvent.occurred_at).getTime(),
      "Linkage-gap fixture did not persist ordered appointment and inspection prerequisites before estimate send.",
    );
    const gapReady = await readAccountability(service, julyBoundaryLead.result.lead_id);
    await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: julyBoundaryLead.result.lead_id,
      expected_version: gapReady.record_version,
      action: "estimate_sent",
      estimate_id: linkageGapEstimateId,
    });
    const clearedGapDashboard = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-07-01", source_key: "manual" },
    );
    requireCondition(
      clearedGapDashboard.metrics.workflow_linkage_gap_count === 0,
      "Valid ordered milestone did not clear the workflow-linkage gap.",
    );

    const workflowEvidenceByLead = new Map();
    for (const [index, lead] of [wonLead, lostLead, overdueLead, noFollowUpLead].entries()) {
      workflowEvidenceByLead.set(
        lead.result.lead_id,
        await createWorkflowEvidence(
          service,
          ids,
          weatherTech.id,
          lead.result.lead_id,
          marker,
          index,
        ),
      );
    }

    const overdueWorkflow = workflowEvidenceByLead.get(overdueLead.result.lead_id);
    const wonWorkflow = workflowEvidenceByLead.get(wonLead.result.lead_id);
    requireCondition(overdueWorkflow?.estimateId, "Overdue lead proposal fixture has no estimate.");
    requireCondition(wonWorkflow?.estimateId, "Won lead proposal fixture has no estimate.");
    const proposalRevisionId = randomUUID();
    ids.estimate_proposal_revisions.push(proposalRevisionId);
    await requireRows(
      service.from("estimate_proposal_revisions").insert({
        id: proposalRevisionId,
        company_id: weatherTech.id,
        estimate_id: overdueWorkflow.estimateId,
        customer_id: null,
        lead_id: overdueLead.result.lead_id,
        property_id: null,
        template_id: null,
        proposal_number: `WTOS-${runId}`,
        revision_number: 1,
        title: `${marker} NAN PROPOSAL`,
        status: "sent",
        brand_name: "WeatherTech Roofing LLC",
        base_total: 12002,
        accepted_total: 12002,
        sent_at: new Date().toISOString(),
        immutable_after_at: new Date().toISOString(),
        source_snapshot: { test_marker: marker },
      }).select("id"),
      "Create NaN proposal-acceptance revision fixture",
    );
    const acceptanceMismatchCustomerId = randomUUID();
    ids.customers.push(acceptanceMismatchCustomerId);
    await requireRows(
      service
        .from("customers")
        .insert({
          id: acceptanceMismatchCustomerId,
          company_id: weatherTech.id,
          display_name: `${marker} ACCEPTANCE MISMATCH CUSTOMER`,
          contact_name: `${marker} ACCEPTANCE MISMATCH CUSTOMER`,
          property_address: `${marker} Acceptance Mismatch Way`,
          city: "Phoenix",
          state: "AZ",
          postal_code: "85001",
          customer_type: "homeowner",
          status: "active",
          notes: marker,
        })
        .select("id"),
      "Create proposal-acceptance mismatch customer fixture",
    );
    const invalidAcceptanceState = {
      won: {
        recordVersion: (await readAccountability(service, wonLead.result.lead_id))
          .record_version,
        eventCount: (await readEvents(service, wonLead.result.lead_id)).length,
      },
      overdue: {
        recordVersion: (
          await readAccountability(service, overdueLead.result.lead_id)
        ).record_version,
        eventCount: (await readEvents(service, overdueLead.result.lead_id)).length,
      },
      acceptanceCount: await countRows(service, "estimate_proposal_acceptances"),
    };
    const invalidAcceptanceBase = {
      proposal_revision_id: proposalRevisionId,
      estimate_id: overdueWorkflow.estimateId,
      customer_id: null,
      signer_name: `${marker} INVALID ACCEPTANCE SIGNER`,
      signer_email: null,
      accepted_total: 12002,
      selected_option_ids: [],
      terms_accepted: true,
      acceptance_method: "internal_recorded",
      signature_status: "not_configured",
      audit_metadata: { test_marker: marker },
    };
    for (const [label, overrides] of [
      [
        "Cross-company proposal acceptance scope",
        { company_id: ihc.id },
      ],
      [
        "Mismatched proposal revision and estimate",
        {
          company_id: weatherTech.id,
          estimate_id: wonWorkflow.estimateId,
        },
      ],
      [
        "Mismatched proposal acceptance customer",
        {
          company_id: weatherTech.id,
          customer_id: acceptanceMismatchCustomerId,
        },
      ],
    ]) {
      const invalidAcceptanceId = randomUUID();
      ids.estimate_proposal_acceptances.push(invalidAcceptanceId);
      const { error: invalidAcceptanceError } = await service
        .from("estimate_proposal_acceptances")
        .insert({
          id: invalidAcceptanceId,
          ...invalidAcceptanceBase,
          ...overrides,
        });
      requireCondition(
        invalidAcceptanceError?.code === "23514",
        `${label} returned ${invalidAcceptanceError?.code ?? "no SQLSTATE"}.`,
      );
      await assertNoRows(
        service
          .from("estimate_proposal_acceptances")
          .select("id")
          .eq("id", invalidAcceptanceId),
        `${label} rollback`,
      );
    }
    requireCondition(
      (await countRows(service, "estimate_proposal_acceptances")) ===
        invalidAcceptanceState.acceptanceCount,
      "Rejected proposal-acceptance scope mismatches left a partial acceptance row.",
    );
    await assertActionStateUnchanged(
      service,
      wonLead.result.lead_id,
      invalidAcceptanceState.won,
      "Proposal-acceptance mismatch won-lead rollback",
    );
    await assertActionStateUnchanged(
      service,
      overdueLead.result.lead_id,
      invalidAcceptanceState.overdue,
      "Proposal-acceptance mismatch revision-lead rollback",
    );
    const nanAcceptanceId = randomUUID();
    ids.estimate_proposal_acceptances.push(nanAcceptanceId);
    const overdueBeforeNanAcceptance = await readAccountability(
      service,
      overdueLead.result.lead_id,
      "Read accountability before NaN proposal acceptance",
    );
    const overdueEventsBeforeNanAcceptance = await readEvents(
      service,
      overdueLead.result.lead_id,
      "Read events before NaN proposal acceptance",
    );
    const { error: nanAcceptanceError } = await service
      .from("estimate_proposal_acceptances")
      .insert({
        id: nanAcceptanceId,
        company_id: weatherTech.id,
        proposal_revision_id: proposalRevisionId,
        estimate_id: overdueWorkflow.estimateId,
        customer_id: null,
        signer_name: `${marker} SIGNER`,
        signer_email: null,
        accepted_total: "NaN",
        selected_option_ids: [],
        terms_accepted: true,
        acceptance_method: "internal_recorded",
        signature_status: "not_configured",
        audit_metadata: { test_marker: marker },
      });
    requireCondition(
      nanAcceptanceError &&
        ["22023", "23502", "23514"].includes(nanAcceptanceError.code),
      `NaN authoritative proposal acceptance returned ${nanAcceptanceError?.code ?? "no SQLSTATE"}.`,
    );
    await assertNoRows(
      service.from("estimate_proposal_acceptances").select("id").eq("id", nanAcceptanceId),
      "NaN proposal acceptance rollback",
    );
    await assertActionStateUnchanged(
      service,
      overdueLead.result.lead_id,
      {
        recordVersion: overdueBeforeNanAcceptance.record_version,
        eventCount: overdueEventsBeforeNanAcceptance.length,
      },
      "NaN proposal acceptance accountability rollback",
    );

    const wonReady = await readAccountability(service, wonLead.result.lead_id);
    const beforeNanWon = {
      recordVersion: wonReady.record_version,
      eventCount: (await readEvents(service, wonLead.result.lead_id)).length,
    };
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: wonLead.result.lead_id,
        expected_version: wonReady.record_version,
        action: "won",
        won_contract_value: "NaN",
        won_value_basis: "approved_contract_total",
      }),
      "NaN manual won contract value",
      ["22023", "23514"],
      /won|contract|value|numeric|number|invalid/i,
    );
    await assertActionStateUnchanged(
      service,
      wonLead.result.lead_id,
      beforeNanWon,
      "NaN manual won rollback",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: wonLead.result.lead_id,
        expected_version: wonReady.record_version,
        action: "won",
        won_contract_value: 0,
        won_value_basis: "approved_contract_total",
      }),
      "Won without positive contract value",
      "23514",
      /value|contract|greater than zero/i,
    );
    const validProposalRevisionId = randomUUID();
    ids.estimate_proposal_revisions.push(validProposalRevisionId);
    await requireRows(
      service
        .from("estimate_proposal_revisions")
        .insert({
          id: validProposalRevisionId,
          company_id: weatherTech.id,
          estimate_id: wonWorkflow.estimateId,
          customer_id: null,
          lead_id: wonLead.result.lead_id,
          property_id: null,
          template_id: null,
          proposal_number: `WTOS-VALID-${runId}`,
          revision_number: 1,
          title: `${marker} VALID ACCEPTED PROPOSAL`,
          status: "sent",
          brand_name: "WeatherTech Roofing LLC",
          base_total: 12000,
          accepted_total: 12000,
          sent_at: new Date().toISOString(),
          immutable_after_at: new Date().toISOString(),
          source_snapshot: { test_marker: marker },
        })
        .select("id"),
      "Create valid accepted-proposal revision fixture",
    );
    const validAcceptanceId = randomUUID();
    ids.estimate_proposal_acceptances.push(validAcceptanceId);
    await requireRows(
      service
        .from("estimate_proposal_acceptances")
        .insert({
          id: validAcceptanceId,
          company_id: weatherTech.id,
          proposal_revision_id: validProposalRevisionId,
          estimate_id: wonWorkflow.estimateId,
          customer_id: null,
          signer_name: `${marker} VALID ACCEPTANCE SIGNER`,
          signer_email: null,
          accepted_total: 12000,
          selected_option_ids: [],
          terms_accepted: true,
          acceptance_method: "internal_recorded",
          signature_status: "not_configured",
          audit_metadata: { test_marker: marker },
        })
        .select("id"),
      "Create valid company-scoped accepted proposal",
    );
    const wonFinal = await readAccountability(service, wonLead.result.lead_id);
    const validWonEvents = (await readEvents(service, wonLead.result.lead_id)).filter(
      (event) =>
        event.event_type === "won" &&
        event.linked_table === "estimate_proposal_acceptances" &&
        event.linked_record_id === validAcceptanceId,
    );
    requireCondition(
      wonFinal.outcome === "won" &&
        Number(wonFinal.won_contract_value) === 12000 &&
        wonFinal.won_value_basis === "accepted_proposal" &&
        validWonEvents.length === 1,
      "Valid company-scoped accepted proposal did not create exactly one verified won state/event.",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: wonLead.result.lead_id,
        expected_version: wonFinal.record_version,
        action: "lost",
        lost_reason_code: "price",
        lost_reason_notes: null,
      }),
      "Won-to-lost terminal outcome reversal",
      "23514",
      /won|lost|outcome|terminal/i,
    );

    const lostReady = await readAccountability(service, lostLead.result.lead_id);
    await expectRejected(
      () => callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: lostLead.result.lead_id,
        expected_version: lostReady.record_version,
        action: "lost",
        lost_reason_code: "other",
        lost_reason_notes: null,
      }),
      "Lost other without notes",
      "23514",
      /notes|other/i,
    );
    const lostResult = await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: lostLead.result.lead_id,
      expected_version: lostReady.record_version,
      action: "lost",
      lost_reason_code: "price",
      lost_reason_notes: null,
    });
    requireCondition(lostResult.status === "applied", "Structured lost outcome was not applied.");
    const lostFinal = await readAccountability(service, lostLead.result.lead_id);
    await expectRejected(
      () => callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: lostLead.result.lead_id,
        expected_version: lostFinal.record_version,
        action: "won",
        won_contract_value: 12000,
        won_value_basis: "approved_contract_total",
      }),
      "Lost-to-won terminal outcome reversal",
      "23514",
      /won|lost|outcome|terminal/i,
    );

    const customerId = randomUUID();
    const propertyId = randomUUID();
    ids.customers.push(customerId);
    ids.properties.push(propertyId);
    const [repeatCustomer] = await requireRows(service.from("customers").insert({
      id: customerId,
      company_id: weatherTech.id,
      display_name: `${marker} REPEAT CUSTOMER`,
      contact_name: `${marker} REPEAT CUSTOMER`,
      property_address: `${marker} Repeat Property`,
      city: "Phoenix",
      state: "AZ",
      postal_code: "85001",
      customer_type: "homeowner",
      status: "active",
      notes: marker,
    }).select("id,updated_at"), "Create repeat customer fixture");
    const [repeatProperty] = await requireRows(service.from("properties").insert({
      id: propertyId,
      company_id: weatherTech.id,
      customer_id: customerId,
      display_name: `${marker} REPEAT PROPERTY`,
      address: `${marker} Repeat Property`,
      city: "Phoenix",
      state: "AZ",
      postal_code: "85001",
      notes: marker,
    }).select("id,updated_at"), "Create repeat property fixture");
    const repeatRequest = {
      operation_key: randomUUID(),
      company_id: weatherTech.id,
      customer_id: customerId,
      customer_expected_updated_at: repeatCustomer.updated_at,
      property_id: propertyId,
      property_expected_updated_at: repeatProperty.updated_at,
      service_type: "roofing",
      owner_user_id: null,
      priority: "normal",
      next_follow_up: "2026-08-25",
      notes: marker,
      received_at: "2026-08-11T16:00:00.000Z",
    };
    const repeat = await callRpc(sales, "wtos_create_repeat_opportunity", "opportunity_request", repeatRequest);
    ids.leads.push(repeat.lead_id);
    ids.lead_accountability.push(repeat.accountability_id);
    const repeatRetry = await callRpc(sales, "wtos_create_repeat_opportunity", "opportunity_request", repeatRequest);
    const repeatAccountability = await readAccountability(service, repeat.lead_id);
    const [repeatLeadBeforeConflict] = await requireRows(
      service
        .from("leads")
        .select("id,customer_id,property_id")
        .eq("id", repeat.lead_id),
      "Read repeat opportunity lead links before retry-conflict checks",
    );
    requireCondition(
      repeatRetry.status === "idempotent" &&
        repeatRetry.lead_id === repeat.lead_id &&
        repeatAccountability.source_key === "repeat_customer" &&
        repeatAccountability.source_detail === null &&
        repeatAccountability.intake_provider === "manual" &&
        repeatLeadBeforeConflict?.customer_id === customerId &&
        repeatLeadBeforeConflict?.property_id === propertyId &&
        repeatAccountability.company_id === weatherTech.id,
      "Same-company repeat opportunity did not converge with canonical repeat source/detail/provider and reviewed links.",
    );
    const advancedCustomerAt = new Date(
      new Date(repeatCustomer.updated_at).getTime() + 1_000,
    ).toISOString();
    const [advancedRepeatCustomer] = await requireRows(
      service
        .from("customers")
        .update({
          notes: `${marker} STALE REPEAT CUSTOMER`,
          updated_at: advancedCustomerAt,
        })
        .eq("id", customerId)
        .select("id,updated_at"),
      "Advance repeat customer version",
    );
    requireCondition(
      advancedRepeatCustomer.updated_at !== repeatCustomer.updated_at,
      "Repeat customer fixture version did not advance for stale/retry coverage.",
    );
    const exactRetryAfterGraphAdvance = await callRpc(
      sales,
      "wtos_create_repeat_opportunity",
      "opportunity_request",
      repeatRequest,
    );
    requireCondition(
      exactRetryAfterGraphAdvance.status === "idempotent" &&
        exactRetryAfterGraphAdvance.lead_id === repeat.lead_id,
      "Exact repeat retry did not converge before stale reviewed-graph checks.",
    );
    const changedPropertyTimestamp = new Date(
      new Date(repeatProperty.updated_at).getTime() + 1_000,
    ).toISOString();
    await expectRejected(
      () => callRpc(sales, "wtos_create_repeat_opportunity", "opportunity_request", {
        ...repeatRequest,
        customer_expected_updated_at: advancedRepeatCustomer.updated_at,
        property_expected_updated_at: changedPropertyTimestamp,
      }),
      "Same operation UUID with changed repeat customer/property review timestamps",
      "23000",
      /operation key|different|review input/i,
    );
    const [repeatLeadAfterConflict] = await requireRows(
      service
        .from("leads")
        .select("id,customer_id,property_id")
        .eq("id", repeat.lead_id),
      "Read repeat opportunity lead links after retry-conflict checks",
    );
    requireCondition(
      repeatLeadAfterConflict.customer_id === repeatLeadBeforeConflict.customer_id &&
        repeatLeadAfterConflict.property_id === repeatLeadBeforeConflict.property_id &&
        (await readEvents(service, repeat.lead_id)).length === 2,
      "Conflicting same-key repeat retry changed the original lead links or immutable ledger.",
    );
    const repeatCountBeforeStale = await countRows(service, "leads");
    await expectRejected(
      () => callRpc(sales, "wtos_create_repeat_opportunity", "opportunity_request", {
        ...repeatRequest,
        operation_key: randomUUID(),
      }),
      "Stale repeat opportunity source graph",
      "P0001",
      /repeat-opportunity customer changed after review\./i,
    );
    requireCondition(
      (await countRows(service, "leads")) === repeatCountBeforeStale,
      "Stale repeat opportunity left a partial lead.",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_create_repeat_opportunity", "opportunity_request", {
        ...repeatRequest,
        operation_key: randomUUID(),
        company_id: ihc.id,
        service_type: "painting",
      }),
      "Cross-company repeat opportunity",
      "23503",
      /customer|property|company/i,
    );

    const spendBase = {
      expected_version: 0,
      spend_month: "2026-08-01",
      source_key: "google",
      source_detail: "google_ads",
      vendor_key: "same_vendor",
      vendor_name: "Same Vendor",
      spend_amount: 3000,
      currency: "USD",
    };
    const wtSpendRequest = {
      ...spendBase,
      operation_key: randomUUID(),
      company_id: weatherTech.id,
      spend_id: null,
      campaign_id: wtCampaign.campaign_id,
      notes: `${marker} WT GOOGLE SPEND`,
    };
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
        operation_key: wtCampaignRequest.operation_key,
        company_id: weatherTech.id,
        spend_id: null,
        expected_version: 0,
        spend_month: "2026-12-01",
        source_key: "manual",
        source_detail: "staff_entered",
        vendor_key: null,
        vendor_name: null,
        campaign_id: null,
        spend_amount: 1,
        currency: "USD",
        notes: `${marker} CROSS KIND OPERATION REUSE`,
      }),
      "Campaign operation key reused for marketing spend",
      "23000",
      /operation key|different|target/i,
    );
    await assertNoRows(
      service
        .from("marketing_spend_months")
        .select("id")
        .eq("notes", `${marker} CROSS KIND OPERATION REUSE`),
      "Cross-kind operation-key rollback",
    );
    const wtSpend = await callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", wtSpendRequest);
    ids.marketing_spend_months.push(wtSpend.spend_id);
    const wtSpendRetry = await callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", wtSpendRequest);
    requireCondition(wtSpendRetry.status === "idempotent" && wtSpendRetry.spend_id === wtSpend.spend_id, "Spend exact retry did not converge.");
    const wtSpendUpdated = await callRpc(
      owner,
      "wtos_upsert_marketing_spend",
      "spend_request",
      {
        ...wtSpendRequest,
        operation_key: randomUUID(),
        spend_id: wtSpend.spend_id,
        expected_version: 1,
        notes: `${marker} WT GOOGLE SPEND UPDATED`,
      },
    );
    requireCondition(
      wtSpendUpdated.status === "updated" && wtSpendUpdated.record_version === 2,
      "Marketing spend update did not advance one version.",
    );
    const delayedSpendRetry = await callRpc(
      owner,
      "wtos_upsert_marketing_spend",
      "spend_request",
      wtSpendRequest,
    );
    const [spendAfterDelayedRetry] = await requireRows(
      service
        .from("marketing_spend_months")
        .select("id,notes,record_version,last_operation_key")
        .eq("id", wtSpend.spend_id),
      "Read spend after delayed exact retry",
    );
    requireCondition(
      delayedSpendRetry.status === "idempotent" &&
        delayedSpendRetry.spend_id === wtSpend.spend_id &&
        delayedSpendRetry.record_version === 1 &&
        spendAfterDelayedRetry.record_version === 2 &&
        spendAfterDelayedRetry.notes === `${marker} WT GOOGLE SPEND UPDATED` &&
        spendAfterDelayedRetry.last_operation_key !== wtSpendRequest.operation_key,
      "Delayed spend retry did not resolve its immutable original receipt without reverting the later edit.",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
        ...wtSpendRequest,
        operation_key: wtSpendRequest.operation_key,
        spend_id: null,
        spend_month: "2026-11-01",
        source_key: "yelp",
        source_detail: "mighty_apes",
        vendor_key: "mighty_apes",
        vendor_name: "Mighty Apes",
        campaign_id: null,
        spend_amount: 10,
        notes: `${marker} REUSED SPEND OPERATION TARGET`,
      }),
      "Old spend operation key reused on a different target",
      "23000",
      /operation key|different|target/i,
    );
    await assertNoRows(
      service
        .from("marketing_spend_months")
        .select("id")
        .eq("notes", `${marker} REUSED SPEND OPERATION TARGET`),
      "Different-target spend operation-key rollback",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
        ...wtSpendRequest,
        operation_key: randomUUID(),
        notes: `${marker} DUPLICATE SAME-COMPANY SPEND`,
      }),
      "Same-company duplicate spend identity",
      "23505",
      /identity|already exists|spend/i,
    );
    const ihcSpend = await callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
      ...spendBase,
      operation_key: randomUUID(),
      company_id: ihc.id,
      spend_id: null,
      campaign_id: ihcCampaign.campaign_id,
      notes: `${marker} IHC GOOGLE SPEND`,
    });
    ids.marketing_spend_months.push(ihcSpend.spend_id);
    const nanSpendOperation = randomUUID();
    const beforeNanSpend = await countRows(service, "marketing_spend_months");
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
        operation_key: nanSpendOperation,
        company_id: weatherTech.id,
        spend_id: null,
        expected_version: 0,
        spend_month: "2026-11-01",
        source_key: "manual",
        source_detail: "staff_entered",
        vendor_key: null,
        vendor_name: null,
        campaign_id: null,
        spend_amount: "NaN",
        currency: "USD",
        notes: `${marker} NAN SPEND`,
      }),
      "NaN marketing spend",
      ["22023", "23514"],
      /spend|amount|numeric|number|invalid/i,
    );
    requireCondition(
      (await countRows(service, "marketing_spend_months")) === beforeNanSpend,
      "NaN marketing-spend rejection left a partial spend row.",
    );
    await assertNoRows(
      service
        .from("marketing_spend_months")
        .select("id")
        .eq("last_operation_key", nanSpendOperation),
      "NaN marketing-spend rollback",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
        ...wtSpendRequest,
        operation_key: randomUUID(),
        spend_id: null,
        campaign_id: null,
        source_key: "yelp",
        source_detail: "mighty_apes",
        spend_amount: -1,
      }),
      "Negative marketing spend",
      "23514",
      /nonnegative|negative|spend amount/i,
    );
    const yelpSpend = await callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
      ...wtSpendRequest,
      operation_key: randomUUID(),
      spend_id: null,
      source_key: "yelp",
      source_detail: "mighty_apes",
      vendor_key: "mighty_apes",
      vendor_name: "Mighty Apes",
      campaign_id: null,
      spend_amount: 1000,
      notes: `${marker} WT YELP SPEND`,
    });
    ids.marketing_spend_months.push(yelpSpend.spend_id);
    const campaignBeforeSemanticMutation = (
      await requireRows(
        service.from("marketing_campaigns").select("*").eq("id", wtCampaign.campaign_id),
        "Read referenced campaign before semantic mutation",
      )
    )[0];
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_campaign", "campaign_request", {
        ...wtCampaignRequest,
        operation_key: randomUUID(),
        campaign_id: wtCampaign.campaign_id,
        expected_version: campaignUpdated.record_version,
        source_key: "yelp",
        source_detail: "mighty_apes",
        intake_provider: "mighty_apes",
        campaign_name: `${marker} REFERENCED MUTATION REFUSED`,
      }),
      "Referenced campaign semantic identity mutation",
      "23514",
      /referenced|source|identity|campaign/i,
    );
    const campaignAfterSemanticMutation = (
      await requireRows(
        service.from("marketing_campaigns").select("*").eq("id", wtCampaign.campaign_id),
        "Read referenced campaign after refused semantic mutation",
      )
    )[0];
    requireCondition(
      campaignAfterSemanticMutation.record_version === campaignBeforeSemanticMutation.record_version &&
        campaignAfterSemanticMutation.source_key === campaignBeforeSemanticMutation.source_key &&
        campaignAfterSemanticMutation.source_detail === campaignBeforeSemanticMutation.source_detail &&
        campaignAfterSemanticMutation.intake_provider === campaignBeforeSemanticMutation.intake_provider,
      "Refused referenced-campaign semantic mutation left a partial update.",
    );
    await expectRejected(
      () => callRpc(owner, "wtos_upsert_marketing_spend", "spend_request", {
        ...wtSpendRequest,
        operation_key: randomUUID(),
        spend_id: wtSpend.spend_id,
        expected_version: 0,
        spend_amount: 3100,
      }),
      "Stale marketing spend update",
      "P0001",
      /marketing spend changed after review\./i,
    );

    await expectRejected(
      () => callRpc(sales, "wtos_upsert_marketing_spend", "spend_request", {
        ...wtSpendRequest,
        operation_key: randomUUID(),
        spend_id: null,
        campaign_id: null,
        source_key: "manual",
        source_detail: null,
        vendor_key: null,
        vendor_name: null,
        spend_amount: 10,
      }),
      "Sales marketing spend mutation",
      "42501",
      /owner|admin|marketing/i,
    );

    const directInsert = await owner.from("marketing_spend_months").insert({
      company_id: weatherTech.id,
      spend_month: "2026-08-01",
      source_key: "manual",
      spend_amount: 1,
      currency: "USD",
      notes: marker,
      last_operation_key: randomUUID(),
      last_request_fingerprint: "0".repeat(64),
    });
    requireCondition(Boolean(directInsert.error), "Authenticated direct marketing spend insert was not revoked.");
    const anonymousRead = await anonymous.from("lead_accountability").select("id").limit(1);
    requireCondition(Boolean(anonymousRead.error) || (anonymousRead.data ?? []).length === 0, "Anonymous caller read private accountability state.");

    const immutableEvent = (await readEvents(service, wonLead.result.lead_id))[0];
    const authenticatedUpdate = await owner
      .from("lead_accountability_events")
      .update({ reason_code: "tampered" })
      .eq("id", immutableEvent.id);
    requireCondition(Boolean(authenticatedUpdate.error), "Authenticated accountability event update was not rejected.");
    const serviceUpdate = await service
      .from("lead_accountability_events")
      .update({ reason_code: "tampered" })
      .eq("id", immutableEvent.id);
    requireCondition(serviceUpdate.error?.code === "42501", "Service-role accountability event update did not fail with immutability SQLSTATE 42501.");

    const salesReceiptRows = await requireRows(
      sales
        .from("marketing_accountability_operation_receipts")
        .select("id,company_id,operation_key,operation_kind,campaign_id,spend_id,resulting_record_version"),
      "Read sales-visible marketing operation receipts",
    );
    requireCondition(
      salesReceiptRows.some(
        (row) =>
          row.company_id === weatherTech.id &&
          row.operation_key === wtCampaignRequest.operation_key &&
          row.operation_kind === "campaign_upsert" &&
          row.campaign_id === wtCampaign.campaign_id &&
          row.resulting_record_version === 1,
      ) &&
        salesReceiptRows.some(
          (row) =>
            row.company_id === weatherTech.id &&
            row.operation_key === wtSpendRequest.operation_key &&
            row.operation_kind === "spend_upsert" &&
            row.spend_id === wtSpend.spend_id &&
            row.resulting_record_version === 1,
        ) &&
        salesReceiptRows.every((row) => row.company_id === weatherTech.id),
      "Marketing operation receipt RLS did not preserve exact WeatherTech scope or original results.",
    );
    const immutableReceipt = salesReceiptRows.find(
      (row) => row.operation_key === wtSpendRequest.operation_key,
    );
    requireCondition(immutableReceipt?.id, "Marketing operation receipt fixture was not found.");
    const authenticatedReceiptUpdate = await owner
      .from("marketing_accountability_operation_receipts")
      .update({ resulting_record_version: 99 })
      .eq("id", immutableReceipt.id);
    requireCondition(
      Boolean(authenticatedReceiptUpdate.error),
      "Authenticated direct marketing operation receipt update was not revoked.",
    );
    const serviceReceiptUpdate = await service
      .from("marketing_accountability_operation_receipts")
      .update({ resulting_record_version: 99 })
      .eq("id", immutableReceipt.id);
    requireCondition(
      serviceReceiptUpdate.error?.code === "42501",
      "Service-role marketing operation receipt update did not fail with immutability SQLSTATE 42501.",
    );
    const anonymousReceiptRead = await anonymous
      .from("marketing_accountability_operation_receipts")
      .select("id")
      .limit(1);
    requireCondition(
      Boolean(anonymousReceiptRead.error) ||
        (anonymousReceiptRead.data ?? []).length === 0,
      "Anonymous caller read private marketing operation receipts.",
    );

    const salesCampaignRows = await requireRows(
      sales.from("marketing_campaigns").select("id,company_id,campaign_key"),
      "Read sales-visible campaigns",
    );
    requireCondition(
      salesCampaignRows.some((row) => row.id === wtCampaign.campaign_id) &&
        !salesCampaignRows.some((row) => row.id === ihcCampaign.campaign_id),
      "Sales RLS did not preserve strict company campaign isolation.",
    );

    const dashboard = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-08-01", source_key: null },
    );
    const metrics = dashboard.metrics;
    requireCondition(dashboard.timezone === "America/Phoenix", "Dashboard did not use Phoenix business boundaries.");
    requireCondition(metrics.lead_count === 7, `Dashboard expected 7 August leads including one repeat opportunity, got ${metrics.lead_count}.`);
    requireCondition(Number(metrics.marketing_spend) === 4000, "Dashboard marketing spend was not exact.");
    requireCondition(Math.abs(Number(metrics.cost_per_lead) - 4000 / 7) < 0.000001, "Dashboard cost per lead formula was not exact.");
    requireCondition(metrics.booked_lead_count === 4 && Math.abs(Number(metrics.booking_rate) - 4 / 7) < 0.000001, "Dashboard booking formula was not exact.");
    requireCondition(metrics.inspection_completed_lead_count === 4 && Number(metrics.inspection_completion_rate) === 1, "Dashboard inspection formula was not exact.");
    requireCondition(metrics.won_lead_count === 1 && Number(metrics.closing_rate) === 0.25, "Dashboard closing formula was not exact.");
    requireCondition(Number(metrics.cost_per_sold_job) === 4000, "Dashboard cost per sold job was not exact.");
    requireCondition(Number(metrics.attributed_contract_revenue) === 12000 && Number(metrics.marketing_revenue_divided_by_spend) === 3, "Dashboard revenue and revenue/spend formulas were not exact.");
    requireCondition(metrics.new_awaiting_contact === 3, "Dashboard awaiting-contact queue was not exact.");
    requireCondition(metrics.unsold_estimates_overdue === 1 && metrics.unsold_estimates_missing_follow_up === 1, "Dashboard explicit follow-up queues were not exact.");
    requireCondition(metrics.unattributed_lead_count === 1 && Math.abs(Number(metrics.attribution_coverage) - 6 / 7) < 0.000001, "Dashboard attribution quality metrics were not exact.");
    requireCondition(metrics.missing_won_value_count === 0, "Dashboard reported a missing won value after verified win evidence.");
    requireCondition(metrics.workflow_linkage_gap_count === 0, "Ordered August workflow retained a false linkage gap.");
    requireCondition(
      metrics.untracked_legacy_lead_count === 0,
      "Isolated accountable cohort unexpectedly included an untracked legacy lead in KPI state.",
    );

    const googleDashboard = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-08-01", source_key: "google" },
    );
    requireCondition(
      googleDashboard.metrics.lead_count === 1 &&
        Number(googleDashboard.metrics.marketing_spend) === 3000 &&
        googleDashboard.metrics.untracked_legacy_lead_count ===
          metrics.untracked_legacy_lead_count &&
        googleDashboard.metrics.untracked_legacy_lead_scope ===
          "company_month_unallocatable" &&
        googleDashboard.metrics.untracked_legacy_lead_source_allocatable === false,
      "Source-filtered dashboard did not honor first-touch/spend filters while retaining the non-source-allocatable company/month legacy gap.",
    );
    const emptyDashboard = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-07-01", source_key: "yelp" },
    );
    requireCondition(
      emptyDashboard.metrics.lead_count === 0 &&
        emptyDashboard.metrics.cost_per_lead === null &&
        emptyDashboard.metrics.booking_rate === null &&
        emptyDashboard.metrics.marketing_revenue_divided_by_spend === null,
      "Zero-denominator dashboard metrics did not remain unavailable.",
    );

    const chronologyContactBefore = await readAccountability(
      service,
      yelpLead.result.lead_id,
      "Read chronology lead before contact",
    );
    await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: yelpLead.result.lead_id,
      expected_version: chronologyContactBefore.record_version,
      action: "contacted",
      human_contact: true,
      first_response_channel: "phone",
      occurred_at: "2026-08-08T17:00:00.000Z",
    });
    const chronologyScheduleId = randomUUID();
    ids.schedule_events.push(chronologyScheduleId);
    await requireRows(
      service.from("schedule_events").insert({
        id: chronologyScheduleId,
        company_id: weatherTech.id,
        customer_id: null,
        lead_id: yelpLead.result.lead_id,
        job_id: null,
        title: `${marker} CHRONOLOGY APPOINTMENT`,
        event_type: "inspection",
        status: "scheduled",
        start_at: "2026-08-09T16:00:00.000Z",
        end_at: "2026-08-09T17:00:00.000Z",
        notes: marker,
        created_at: "2026-08-08T16:30:00.000Z",
        updated_at: "2026-08-08T16:30:00.000Z",
      }).select("id"),
      "Create chronologically invalid automatic appointment evidence",
    );
    const chronologyBefore = await readAccountability(
      service,
      yelpLead.result.lead_id,
      "Read chronology lead before explicit rejection",
    );
    const chronologyEventsBefore = await readEvents(
      service,
      yelpLead.result.lead_id,
      "Read chronology events after automatic no-op",
    );
    requireCondition(
      !chronologyEventsBefore.some((event) => event.event_type === "appointment_scheduled"),
      "Automatic workflow hook fabricated a chronologically invalid appointment milestone.",
    );
    const chronologyGap = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-08-01", source_key: "yelp" },
    );
    requireCondition(
      chronologyGap.metrics.workflow_linkage_gap_count === 1,
      "Chronologically invalid authoritative workflow evidence was not visible as a linkage gap.",
    );
    await expectRejected(
      () => callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
        operation_key: randomUUID(),
        lead_id: yelpLead.result.lead_id,
        expected_version: chronologyBefore.record_version,
        action: "appointment_scheduled",
        schedule_event_id: chronologyScheduleId,
        occurred_at: "2026-08-08T16:30:00.000Z",
      }),
      "Chronologically invalid explicit appointment milestone",
      "23514",
      /before|contact|chronolog|appointment/i,
    );
    await assertActionStateUnchanged(
      service,
      yelpLead.result.lead_id,
      {
        recordVersion: chronologyBefore.record_version,
        eventCount: chronologyEventsBefore.length,
      },
      "Chronology rejection rollback",
    );
    await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: yelpLead.result.lead_id,
      expected_version: chronologyBefore.record_version,
      action: "appointment_scheduled",
      schedule_event_id: chronologyScheduleId,
      occurred_at: "2026-08-08T18:00:00.000Z",
    });
    const chronologyCleared = await callRpc(
      owner,
      "wtos_get_marketing_accountability_dashboard",
      "report_request",
      { company_id: weatherTech.id, month: "2026-08-01", source_key: "yelp" },
    );
    requireCondition(
      chronologyCleared.metrics.workflow_linkage_gap_count === 0,
      "Valid chronological appointment milestone did not clear the linkage gap.",
    );

    const leadRaceCampaignRequest = {
      ...campaignBase,
      operation_key: randomUUID(),
      company_id: weatherTech.id,
      campaign_id: null,
      campaign_key: `${safeKey}_race_lead`,
      campaign_name: `${marker} RACE LEAD CAMPAIGN`,
    };
    const leadRaceCampaign = await callRpc(
      owner,
      "wtos_upsert_marketing_campaign",
      "campaign_request",
      leadRaceCampaignRequest,
    );
    ids.marketing_campaigns.push(leadRaceCampaign.campaign_id);
    const leadRaceSemanticRequest = {
      ...leadRaceCampaignRequest,
      operation_key: randomUUID(),
      campaign_id: leadRaceCampaign.campaign_id,
      expected_version: leadRaceCampaign.record_version,
      source_key: "yelp",
      source_detail: "mighty_apes",
      intake_provider: "mighty_apes",
      campaign_name: `${marker} RACE LEAD CAMPAIGN UPDATED`,
    };
    const leadRaceReferenceRequest = createLeadRequest({
      marker,
      operation: "RACE:LEAD:REFERENCE",
      companyId: weatherTech.id,
      contactName: `${marker} RACE LEAD REFERENCE`,
      sourceKey: "google",
      sourceDetail: "google_ads",
      intakeProvider: "website",
      campaignId: leadRaceCampaign.campaign_id,
      evidenceKind: "staff_selected",
      reviewStatus: "verified",
      receivedAt: null,
    });
    const leadRaceSemanticPromise = observeOutcome(
      callRpc(
        owner,
        "wtos_upsert_marketing_campaign",
        "campaign_request",
        leadRaceSemanticRequest,
      ),
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    const leadRaceReferencePromise = observeOutcome(
      callRpc(
        ownerRace,
        "wtos_create_accountable_lead",
        "accountability_request",
        leadRaceReferenceRequest,
      ),
    );
    const [leadRaceSemantic, leadRaceReference] = await Promise.all([
      leadRaceSemanticPromise,
      leadRaceReferencePromise,
    ]);
    requireCondition(
      Number(leadRaceSemantic.ok) + Number(leadRaceReference.ok) === 1,
      "Concurrent semantic-update-first lead-reference race did not serialize to exactly one outcome.",
    );
    if (leadRaceReference.ok) {
      ids.leads.push(leadRaceReference.value.lead_id);
      ids.lead_accountability.push(leadRaceReference.value.accountability_id);
      requireCondition(
        leadRaceSemantic.error?.code === "23514",
        `Lead-reference race semantic loser returned ${leadRaceSemantic.error?.code ?? "no SQLSTATE"}.`,
      );
    } else {
      requireCondition(
        leadRaceReference.error?.code === "23514",
        `Lead-reference race reference loser returned ${leadRaceReference.error?.code ?? "no SQLSTATE"}.`,
      );
    }
    const [leadRaceCampaignAfter] = await requireRows(
      service
        .from("marketing_campaigns")
        .select("id,source_key,source_detail,intake_provider")
        .eq("id", leadRaceCampaign.campaign_id),
      "Read lead-reference race campaign",
    );
    const leadRaceReferences = await requireRows(
      service
        .from("lead_accountability")
        .select("id,lead_id,source_key,source_detail,intake_provider,campaign_id")
        .eq("campaign_id", leadRaceCampaign.campaign_id),
      "Read lead-reference race accountability",
    );
    requireCondition(
      leadRaceSemantic.ok
        ? leadRaceCampaignAfter.source_key === "yelp" &&
            leadRaceCampaignAfter.source_detail === "mighty_apes" &&
            leadRaceCampaignAfter.intake_provider === "mighty_apes" &&
            leadRaceReferences.length === 0
        : leadRaceCampaignAfter.source_key === "google" &&
            leadRaceCampaignAfter.source_detail === "google_ads" &&
            leadRaceCampaignAfter.intake_provider === "website" &&
            leadRaceReferences.length === 1 &&
            leadRaceReferences[0].source_key === "google" &&
            leadRaceReferences[0].source_detail === "google_ads" &&
            leadRaceReferences[0].intake_provider === "website",
      "Lead-reference race left a campaign/accountability semantic mismatch.",
    );

    const spendRaceCampaignRequest = {
      ...campaignBase,
      operation_key: randomUUID(),
      company_id: weatherTech.id,
      campaign_id: null,
      campaign_key: `${safeKey}_race_spend`,
      campaign_name: `${marker} RACE SPEND CAMPAIGN`,
    };
    const spendRaceCampaign = await callRpc(
      owner,
      "wtos_upsert_marketing_campaign",
      "campaign_request",
      spendRaceCampaignRequest,
    );
    ids.marketing_campaigns.push(spendRaceCampaign.campaign_id);
    const spendRaceReferenceRequest = {
      operation_key: randomUUID(),
      company_id: weatherTech.id,
      spend_id: null,
      expected_version: 0,
      spend_month: "2026-10-01",
      source_key: "google",
      source_detail: "google_ads",
      vendor_key: "same_vendor",
      vendor_name: "Same Vendor",
      campaign_id: spendRaceCampaign.campaign_id,
      spend_amount: 250,
      currency: "USD",
      notes: `${marker} RACE SPEND REFERENCE`,
    };
    const spendRaceSemanticRequest = {
      ...spendRaceCampaignRequest,
      operation_key: randomUUID(),
      campaign_id: spendRaceCampaign.campaign_id,
      expected_version: spendRaceCampaign.record_version,
      source_key: "yelp",
      source_detail: "mighty_apes",
      intake_provider: "mighty_apes",
      campaign_name: `${marker} RACE SPEND CAMPAIGN UPDATED`,
    };
    const spendRaceReferencePromise = observeOutcome(
      callRpc(
        ownerRace,
        "wtos_upsert_marketing_spend",
        "spend_request",
        spendRaceReferenceRequest,
      ),
    );
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
    const spendRaceSemanticPromise = observeOutcome(
      callRpc(
        owner,
        "wtos_upsert_marketing_campaign",
        "campaign_request",
        spendRaceSemanticRequest,
      ),
    );
    const [spendRaceReference, spendRaceSemantic] = await Promise.all([
      spendRaceReferencePromise,
      spendRaceSemanticPromise,
    ]);
    requireCondition(
      Number(spendRaceReference.ok) + Number(spendRaceSemantic.ok) === 1,
      "Concurrent spend-reference-first semantic-update race did not serialize to exactly one outcome.",
    );
    if (spendRaceReference.ok) {
      ids.marketing_spend_months.push(spendRaceReference.value.spend_id);
      requireCondition(
        spendRaceSemantic.error?.code === "23514",
        `Spend-reference race semantic loser returned ${spendRaceSemantic.error?.code ?? "no SQLSTATE"}.`,
      );
    } else {
      requireCondition(
        spendRaceReference.error?.code === "23514",
        `Spend-reference race reference loser returned ${spendRaceReference.error?.code ?? "no SQLSTATE"}.`,
      );
    }
    const [spendRaceCampaignAfter] = await requireRows(
      service
        .from("marketing_campaigns")
        .select("id,source_key,source_detail,intake_provider")
        .eq("id", spendRaceCampaign.campaign_id),
      "Read spend-reference race campaign",
    );
    const spendRaceReferences = await requireRows(
      service
        .from("marketing_spend_months")
        .select("id,source_key,source_detail,vendor_key,vendor_name,campaign_id")
        .eq("campaign_id", spendRaceCampaign.campaign_id),
      "Read spend-reference race spend",
    );
    requireCondition(
      spendRaceSemantic.ok
        ? spendRaceCampaignAfter.source_key === "yelp" &&
            spendRaceCampaignAfter.source_detail === "mighty_apes" &&
            spendRaceCampaignAfter.intake_provider === "mighty_apes" &&
            spendRaceReferences.length === 0
        : spendRaceCampaignAfter.source_key === "google" &&
            spendRaceCampaignAfter.source_detail === "google_ads" &&
            spendRaceCampaignAfter.intake_provider === "website" &&
            spendRaceReferences.length === 1 &&
            spendRaceReferences[0].source_key === "google" &&
            spendRaceReferences[0].source_detail === "google_ads" &&
            spendRaceReferences[0].vendor_key === "same_vendor" &&
            spendRaceReferences[0].vendor_name === "Same Vendor",
      "Spend-reference race left a campaign/spend semantic mismatch.",
    );

    const creatorOwnerRequest = createLeadRequest({
      marker,
      operation: "LEAD:CREATOR-OWNER-SEPARATION",
      companyId: weatherTech.id,
      contactName: `${marker} CREATOR OWNER SEPARATION`,
      sourceKey: "manual",
      sourceDetail: "staff_entered",
      intakeProvider: "manual",
      evidenceKind: "staff_selected",
      reviewStatus: "verified",
      ownerUserId: null,
      receivedAt: null,
    });
    const creatorOwnerLead = await callRpc(
      sales,
      "wtos_create_accountable_lead",
      "accountability_request",
      creatorOwnerRequest,
    );
    ids.leads.push(creatorOwnerLead.lead_id);
    ids.lead_accountability.push(creatorOwnerLead.accountability_id);
    const [creatorRow] = await requireRows(
      service.from("leads").select("id,created_by").eq("id", creatorOwnerLead.lead_id),
      "Read creator-owner separation lead",
    );
    const creatorOwnerBefore = await readAccountability(service, creatorOwnerLead.lead_id);
    requireCondition(
      creatorRow.created_by === salesUserId && creatorOwnerBefore.owner_user_id === null,
      "Sales lead creation did not preserve creator independently of unassigned ownership.",
    );
    await callRpc(owner, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: creatorOwnerLead.lead_id,
      expected_version: creatorOwnerBefore.record_version,
      action: "owner_assigned",
      owner_user_id: ownerUserId,
    });
    const creatorOwnerAfter = await readAccountability(service, creatorOwnerLead.lead_id);
    requireCondition(
      creatorRow.created_by === salesUserId &&
        creatorOwnerAfter.owner_user_id === ownerUserId &&
        creatorOwnerAfter.owner_user_id !== creatorRow.created_by,
      "Authorized owner assignment overwrote creator identity or did not persist separately.",
    );

    const transitionScheduleId = randomUUID();
    ids.schedule_events.push(transitionScheduleId);
    const transitionStartAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
    const [canceledSchedule] = await requireRows(
      service
        .from("schedule_events")
        .insert({
          id: transitionScheduleId,
          company_id: weatherTech.id,
          customer_id: null,
          lead_id: creatorOwnerLead.lead_id,
          job_id: null,
          title: `${marker} CANCELED BEFORE CONTACT`,
          event_type: "inspection",
          status: "canceled",
          start_at: transitionStartAt.toISOString(),
          end_at: new Date(transitionStartAt.getTime() + 60 * 60 * 1_000).toISOString(),
          notes: marker,
        })
        .select("id,created_at,updated_at,status"),
      "Create nonqualifying schedule before contact",
    );
    const preTransitionEvents = await readEvents(
      service,
      creatorOwnerLead.lead_id,
      "Read transition lead events before contact",
    );
    requireCondition(
      canceledSchedule.status === "canceled" &&
        !preTransitionEvents.some(
          (event) =>
            event.event_type === "appointment_scheduled" &&
            event.linked_record_id === transitionScheduleId,
        ),
      "Canceled schedule created before contact fabricated an appointment milestone.",
    );
    const transitionContactBefore = await readAccountability(
      service,
      creatorOwnerLead.lead_id,
      "Read transition lead before contact",
    );
    await callRpc(sales, "wtos_apply_lead_accountability_action", "action_request", {
      operation_key: randomUUID(),
      lead_id: creatorOwnerLead.lead_id,
      expected_version: transitionContactBefore.record_version,
      action: "contacted",
      human_contact: true,
      first_response_channel: "phone",
    });
    const transitionAfterContact = await readAccountability(
      service,
      creatorOwnerLead.lead_id,
      "Read transition lead after contact",
    );
    const [activatedSchedule] = await requireRows(
      service
        .from("schedule_events")
        .update({ status: "scheduled" })
        .eq("id", transitionScheduleId)
        .select("id,created_at,updated_at,status"),
      "Activate post-contact schedule",
    );
    const activatedEvents = (
      await readEvents(
        service,
        creatorOwnerLead.lead_id,
        "Read post-activation appointment events",
      )
    ).filter(
      (event) =>
        event.event_type === "appointment_scheduled" &&
        event.linked_table === "schedule_events" &&
        event.linked_record_id === transitionScheduleId,
    );
    requireCondition(
      activatedSchedule.status === "scheduled" &&
        new Date(activatedSchedule.updated_at).getTime() >
          new Date(canceledSchedule.created_at).getTime() &&
        activatedEvents.length === 1 &&
        new Date(activatedEvents[0].occurred_at).getTime() ===
          new Date(activatedSchedule.updated_at).getTime() &&
        new Date(activatedEvents[0].occurred_at).getTime() >=
          new Date(transitionAfterContact.first_response_at).getTime(),
      "Canceled-before-contact schedule activation did not create exactly one appointment at its authoritative UPDATE time.",
    );
    const transitionAfterActivation = await readAccountability(
      service,
      creatorOwnerLead.lead_id,
      "Read transition lead after schedule activation",
    );
    await requireRows(
      service
        .from("schedule_events")
        .update({
          start_at: new Date(transitionStartAt.getTime() + 10 * 60 * 1_000).toISOString(),
        })
        .eq("id", transitionScheduleId)
        .select("id"),
      "Retry qualifying schedule update",
    );
    const transitionAfterRetry = await readAccountability(
      service,
      creatorOwnerLead.lead_id,
      "Read transition lead after qualifying schedule retry",
    );
    const retryEvents = (
      await readEvents(
        service,
        creatorOwnerLead.lead_id,
        "Read schedule transition events after retry",
      )
    ).filter(
      (event) =>
        event.event_type === "appointment_scheduled" &&
        event.linked_table === "schedule_events" &&
        event.linked_record_id === transitionScheduleId,
    );
    requireCondition(
      retryEvents.length === 1 &&
        transitionAfterRetry.record_version ===
          transitionAfterActivation.record_version,
      "Repeated qualifying schedule update duplicated its appointment milestone.",
    );

    const protectedAfter = await snapshotCounts(service, Object.keys(protectedBefore));
    requireCondition(
      JSON.stringify(protectedAfter) === JSON.stringify(protectedBefore),
      "Lead accountability regression changed provider or financial state.",
    );
    requireCondition(counters.blockedExternalRequests === 0, "A provider network request was attempted.");

    report = {
      result: "PASS",
      target: loaded.config.projectRef,
      externalEnvironmentOnly: loaded.source === "external_file",
      campaignSameIdentityAcrossCompanies: true,
      campaignIdempotencyAndStaleWrites: true,
      immutableMarketingOperationReceipts: true,
      delayedMarketingRetriesConverged: true,
      crossTargetMarketingOperationReuseRejected: true,
      creatorOwnerSeparation: true,
      crossCompanyReferencesRejected: true,
      firstTouchCorrectionAuditedAndLocked: true,
      laterContactPreservedFirstTouch: true,
      humanContactRequired: true,
      concurrentRetriesConverged: true,
      caseInsensitiveOperationRetriesConverged: true,
      staleActionsRejected: true,
      invalidWritesRolledBack: true,
      workflowOrderingEnforced: true,
      workflowChronologyEnforced: true,
      scheduleUpdateTransitionTimestampVerified: true,
      terminalLeadInsertRollbackVerified: true,
      workflowLinkageGapSurfacedAndCleared: true,
      genericRepeatAttributionRefused: true,
      campaignReferenceRacesSerialized: true,
      safeOpaqueOperationKeysEnforced: true,
      nonFiniteNumericInputsRejected: true,
      proposalAcceptanceScopeRejectedAtomically: true,
      validAcceptedProposalWins: true,
      wonRequirementsEnforced: true,
      lostRequirementsEnforced: true,
      repeatOpportunityCompanyScopedAndIdempotent: true,
      repeatOperationFingerprintAndLinksProtected: true,
      staleRepeatRejected: true,
      spendCompanyScopedValidatedAndIdempotent: true,
      referencedCampaignMutationRolledBack: true,
      dashboardFormulasVerified: true,
      untrackedLegacyExcludedFromKpis: true,
      sourceFilteredLegacyGapRetained: true,
      phoenixMonthBoundariesVerified: true,
      zeroDenominatorsUnavailable: true,
      rlsAndGrantIsolationVerified: true,
      eventsImmutable: true,
      providerOrFinancialEffects: 0,
      providerNetworkRequests: 0,
      cleanupResidue: null,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    if (cleanupAuthorized) {
      try {
        const markedLeads = await requireRows(
          service.from("leads").select("id").like("contact_name", `${marker}%`),
          "Discover marked accountability leads",
        );
        ids.leads.push(...markedLeads.map((row) => row.id));
        const exactLeadIds = [...new Set(ids.leads.filter(Boolean))];
        if (exactLeadIds.length) {
          const accountabilities = await requireRows(
            service.from("lead_accountability").select("id").in("lead_id", exactLeadIds),
            "Discover exact lead accountability rows",
          );
          const events = await requireRows(
            service.from("lead_accountability_events").select("id").in("lead_id", exactLeadIds),
            "Discover exact lead accountability events",
          );
          ids.lead_accountability.push(...accountabilities.map((row) => row.id));
          ids.lead_accountability_events.push(...events.map((row) => row.id));
        }
        const markedSpend = await requireRows(
          service.from("marketing_spend_months").select("id").like("notes", `${marker}%`),
          "Discover marked marketing spend",
        );
        ids.marketing_spend_months.push(...markedSpend.map((row) => row.id));
        const markedCampaigns = await requireRows(
          service.from("marketing_campaigns").select("id").like("campaign_name", `${marker}%`),
          "Discover marked marketing campaigns",
        );
        ids.marketing_campaigns.push(...markedCampaigns.map((row) => row.id));
        const exactSpendIds = [
          ...new Set(ids.marketing_spend_months.filter(Boolean)),
        ];
        const exactCampaignIds = [
          ...new Set(ids.marketing_campaigns.filter(Boolean)),
        ];
        if (exactSpendIds.length) {
          const spendReceipts = await requireRows(
            service
              .from("marketing_accountability_operation_receipts")
              .select("id")
              .in("spend_id", exactSpendIds),
            "Discover exact marketing spend operation receipts",
          );
          ids.marketing_accountability_operation_receipts.push(
            ...spendReceipts.map((row) => row.id),
          );
        }
        if (exactCampaignIds.length) {
          const campaignReceipts = await requireRows(
            service
              .from("marketing_accountability_operation_receipts")
              .select("id")
              .in("campaign_id", exactCampaignIds),
            "Discover exact marketing campaign operation receipts",
          );
          ids.marketing_accountability_operation_receipts.push(
            ...campaignReceipts.map((row) => row.id),
          );
        }

        for (const proposalRevisionId of [
          ...new Set(ids.estimate_proposal_revisions.filter(Boolean)),
        ]) {
          await cleanupSyntheticProposalRevision({
            service,
            ownerUserId,
            marker,
            proposalRevisionId,
          });
        }
        await deleteExactIds(service, "inspections", ids.inspections);
        await deleteExactIds(service, "schedule_events", ids.schedule_events);
        await deleteExactIds(service, "estimates", ids.estimates);
        await deleteExactIds(service, "lead_intake_records", ids.lead_intake_records);
        await deleteExactIds(service, "lead_accountability_events", ids.lead_accountability_events);
        await deleteExactIds(service, "lead_accountability", ids.lead_accountability);
        await deleteExactIds(
          service,
          "marketing_accountability_operation_receipts",
          ids.marketing_accountability_operation_receipts,
        );
        await deleteExactIds(service, "marketing_spend_months", ids.marketing_spend_months);
        await deleteExactIds(service, "marketing_campaigns", ids.marketing_campaigns);
        await deleteExactIds(service, "leads", ids.leads);
        await deleteExactIds(service, "properties", ids.properties);
        await deleteExactIds(service, "customers", ids.customers);

        for (const [table, values] of Object.entries(ids)) {
          await assertExactIdsAbsent(service, table, values);
        }
        if (salesUserId) {
          const { error: membershipError } = await service
            .from("company_memberships")
            .delete()
            .eq("user_id", salesUserId);
          if (membershipError) throw new Error(`Sales membership cleanup failed: ${membershipError.message}`);
          const { error: profileError } = await service.from("profiles").delete().eq("id", salesUserId);
          if (profileError) throw new Error(`Sales profile cleanup failed: ${profileError.message}`);
          const { error: authError } = await service.auth.admin.deleteUser(salesUserId);
          if (authError) throw new Error(`Sales auth cleanup failed: ${authError.message}`);
        }
        const finalVerification = await runRegressionEnvironmentCommand({
          command: "verify",
          env: loaded.environment,
          fetchImpl: guardedFetch,
        });
        requireCondition(finalVerification.residueCount === 0, "Final lead accountability zero-residue verification failed.");
        if (report) report.cleanupResidue = 0;
      } catch (error) {
        cleanupError = error;
      }
    }

    await Promise.allSettled([
      settleWithTimeout(owner.auth.signOut({ scope: "local" }), "Owner sign-out"),
      settleWithTimeout(
        ownerRace.auth.signOut({ scope: "local" }),
        "Independent owner race-session sign-out",
      ),
      sales
        ? settleWithTimeout(sales.auth.signOut({ scope: "local" }), "Sales sign-out")
        : Promise.resolve(),
    ]);
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Lead accountability regression and exact cleanup both failed.",
    );
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  requireCondition(report?.cleanupResidue === 0, "Lead accountability regression did not prove zero residue.");
  return report;
}

if (
  typeof process !== "undefined" &&
  process.argv?.[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.env[LEAD_ACCOUNTABILITY_REGRESSION_RUN] !== "true") {
    console.log(
      `Lead accountability hosted regression: NOT RUN (set ${LEAD_ACCOUNTABILITY_REGRESSION_RUN}=true with the secure external regression environment after the migration is applied)`,
    );
  } else {
    runLeadAccountabilityRegression()
      .then((result) => console.log(JSON.stringify(result, null, 2)))
      .catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
  }
}
