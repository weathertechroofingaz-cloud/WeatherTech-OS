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

export const CRM_IDENTITY_RECONCILIATION_REGRESSION_RUN =
  "WTOS_CRM_IDENTITY_RECONCILIATION_REGRESSION_RUN";

const AUDIT_TABLE = "crm_identity_reconciliation_events";
const NETWORK_TIMEOUT_MS = 20_000;
const EMPTY_LINKS = Object.freeze({
  estimates: [],
  inspections: [],
  jobs: [],
  schedule_events: [],
  office_tasks: [],
});

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function loadCrmIdentityReconciliationRegressionEnvironment({
  cwd,
  runtimeEnv = process.env,
} = {}) {
  requireCondition(cwd, "CRM reconciliation regression requires an explicit repository path.");
  const externalPath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();

  requireCondition(
    externalPath && isAbsolute(externalPath),
    `${BROWSER_REGRESSION_ENV_FILE} must name a secure absolute environment file outside the repository. This runner never reads .env.local.`,
  );
  requireCondition(
    !runtimeEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    `CRM reconciliation regression accepts target credentials only from ${BROWSER_REGRESSION_ENV_FILE}.`,
  );

  const loaded = loadBrowserRegressionEnvironment({
    cwd,
    runtimeEnv,
    remoteWritesEnabled: true,
  });
  requireCondition(
    loaded.source === "external_file",
    "CRM reconciliation regression requires the secure external-file credential source.",
  );
  const config = validateRegressionEnvironment(loaded.environment);
  requireCondition(
    config.projectRef === REGRESSION_SUPABASE_PROJECT_REF,
    "CRM reconciliation target is not the approved isolated regression project.",
  );
  requireCondition(
    !config.supabaseUrl.includes(PRODUCTION_SUPABASE_PROJECT_REF),
    "Production Supabase is permanently prohibited as a CRM reconciliation regression target.",
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
        "CRM reconciliation regression blocked a non-regression network request before transmission.",
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
      () => controller.abort(new Error("CRM reconciliation regression network request timed out.")),
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

async function insertRows(client, table, rows) {
  const inserted = await requireRows(
    client.from(table).insert(rows).select("*"),
    `Insert ${table}`,
  );
  requireCondition(
    inserted.length === rows.length,
    `Insert ${table} did not return every exact fixture.`,
  );
  return inserted;
}

async function assertNoRows(query, label) {
  const rows = await requireRows(query, label);
  requireCondition(rows.length === 0, `${label} found ${rows.length} conflicting row(s).`);
}

async function deleteExactIds(client, table, ids) {
  if (!ids.length) return;
  const { error } = await client.from(table).delete().in("id", [...new Set(ids)]);
  if (error) throw new Error(`Exact-ID cleanup failed for ${table}: ${error.message}`);
}

async function assertExactIdsAbsent(client, table, ids) {
  if (!ids.length) return;
  await assertNoRows(
    client.from(table).select("id").in("id", [...new Set(ids)]),
    `${table} exact-ID residue`,
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
  return client;
}

async function callReconciliation(client, request) {
  const { data, error } = await client.rpc("wtos_reconcile_customer_property", {
    reconciliation_request: request,
  });
  if (error) throw error;
  requireCondition(data && typeof data === "object", "Reconciliation RPC returned no result.");
  return data;
}

async function expectRejected(callback, label, expectedMessage) {
  try {
    await callback();
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : error && typeof error === "object"
        ? [error.message, error.details, error.hint, error.code]
            .filter((value) => typeof value === "string" && value.trim())
            .join(" | ") || JSON.stringify(error)
        : String(error);
    requireCondition(
      expectedMessage.test(message),
      `${label} failed for the wrong reason: ${message}`,
    );
    return message;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
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

function requestFor({ companyId, operationKey, decision, lead, customer, property, links }) {
  return {
    company_id: companyId,
    operation_key: operationKey,
    decision,
    lead: { id: lead.id, expected_updated_at: lead.updated_at },
    ...(customer ? { customer } : {}),
    ...(property ? { property } : {}),
    links: links ?? { ...EMPTY_LINKS },
  };
}

function versioned(row) {
  return { id: row.id, expected_updated_at: row.updated_at };
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(`Count ${table} failed: ${error.message}`);
  return count ?? 0;
}

export async function runCrmIdentityReconciliationRegression({
  cwd = process.cwd(),
  runtimeEnv = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireCondition(typeof fetchImpl === "function", "CRM reconciliation regression requires Fetch API support.");
  const loaded = loadCrmIdentityReconciliationRegressionEnvironment({
    cwd: resolve(cwd),
    runtimeEnv,
  });
  const { guardedFetch, counters } = createNetworkGuard(fetchImpl, loaded.config.supabaseUrl);
  const preflight = await runRegressionEnvironmentCommand({
    command: "verify",
    env: loaded.environment,
    fetchImpl: guardedFetch,
  });
  requireCondition(
    preflight.target === REGRESSION_SUPABASE_PROJECT_REF && preflight.residueCount === 0,
    "Isolated regression preflight did not prove target identity and zero residue.",
  );

  const service = createClient(loaded.config.supabaseUrl, loaded.config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  const owner = await signIn(
    loaded.environment,
    loaded.config.ownerEmail,
    loaded.config.ownerPassword,
    guardedFetch,
  );
  const runId = randomUUID();
  const marker = `TEST WTOS REGRESSION CRM RECONCILIATION ${runId}`;
  const uuidOperationKey = randomUUID();
  const ids = {
    customers: Array.from({ length: 8 }, () => randomUUID()),
    properties: [randomUUID(), randomUUID(), randomUUID()],
    leads: Array.from({ length: 11 }, () => randomUUID()),
    estimates: [randomUUID(), randomUUID(), randomUUID()],
    jobs: [randomUUID(), randomUUID()],
    schedule_events: [randomUUID()],
    inspections: [randomUUID()],
    office_tasks: [randomUUID(), randomUUID()],
    crm_identity_reconciliation_events: [],
  };
  let restrictedUserId = null;
  let restrictedClient = null;
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
      ...Object.entries(ids)
        .filter(([table, values]) => table !== AUDIT_TABLE && values.length)
        .map(([table, values]) =>
          assertNoRows(service.from(table).select("id").in("id", values), `${table} ID collision`),
        ),
      assertNoRows(
        service.from(AUDIT_TABLE).select("id").like("operation_key", `${marker}%`),
        "Reconciliation operation marker collision",
      ),
      assertNoRows(
        service.from(AUDIT_TABLE).select("id").eq("operation_key", uuidOperationKey),
        "Reconciliation UUID operation collision",
      ),
      assertNoRows(
        service.from("customers").select("id").like("display_name", `${marker}%`),
        "Reconciliation customer marker collision",
      ),
      assertNoRows(
        service.from("leads").select("id").like("contact_name", `${marker}%`),
        "Reconciliation lead marker collision",
      ),
    ]);
    cleanupAuthorized = true;

    const restrictedEmail = `wtos-reconciliation-${runId}@example.test`;
    const restrictedPassword = `Synthetic-${runId}-only`;
    const { data: restrictedAuth, error: restrictedAuthError } =
      await service.auth.admin.createUser({
        email: restrictedEmail,
        password: restrictedPassword,
        email_confirm: true,
        app_metadata: {
          wt_os_regression_marker: REGRESSION_OWNER_MARKER,
          wt_os_regression_project_ref: REGRESSION_SUPABASE_PROJECT_REF,
        },
      });
    if (restrictedAuthError || !restrictedAuth.user) {
      throw new Error(`Restricted regression user creation failed: ${restrictedAuthError?.message}`);
    }
    restrictedUserId = restrictedAuth.user.id;
    await requireRows(
      service.from("profiles").upsert({
        id: restrictedUserId,
        full_name: marker,
        role: "team_member",
        default_company_id: weatherTech.id,
      }).select("id"),
      "Create restricted profile",
    );
    await requireRows(
      service.from("company_memberships").upsert({
        user_id: restrictedUserId,
        company_id: weatherTech.id,
        role: "team_member",
        can_manage_settings: false,
        can_manage_financials: false,
        can_manage_production: false,
      }).select("user_id"),
      "Create restricted membership",
    );
    restrictedClient = await signIn(
      loaded.environment,
      restrictedEmail,
      restrictedPassword,
      guardedFetch,
    );

    const financialBefore = {
      invoices: await countRows(service, "invoices"),
      payments: await countRows(service, "payments"),
      providerEvents: await countRows(service, "communication_provider_events"),
      smsMessages: await countRows(service, "sms_messages"),
      emailMessages: await countRows(service, "email_messages"),
    };
    const addresses = Array.from({ length: 11 }, (_, index) =>
      `${1000 + index} ${marker} Way, Scottsdale, AZ`,
    );
    const customerRows = await insertRows(service, "customers", [
      { id: ids.customers[0], company_id: weatherTech.id, display_name: `${marker} EXACT`, contact_name: `${marker} EXACT`, phone: "+14805550101", email: `exact-${runId}@example.test`, property_address: addresses[0], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[1], company_id: weatherTech.id, display_name: `${marker} AMBIGUOUS A`, contact_name: `${marker} AMBIGUOUS A`, phone: "+14805550104", email: null, property_address: addresses[3], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[2], company_id: weatherTech.id, display_name: `${marker} AMBIGUOUS B`, contact_name: `${marker} AMBIGUOUS B`, phone: "+14805550104", email: null, property_address: addresses[3], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[3], company_id: ihc.id, display_name: `${marker} IHC`, contact_name: `${marker} IHC`, phone: "+14805550105", email: null, property_address: addresses[4], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[4], company_id: weatherTech.id, display_name: `${marker} CONCURRENT`, contact_name: `${marker} CONCURRENT`, phone: "+14805550106", email: null, property_address: addresses[5], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[5], company_id: weatherTech.id, display_name: `${marker} ROLLBACK`, contact_name: `${marker} ROLLBACK`, phone: "+14805550107", email: null, property_address: addresses[6], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[6], company_id: weatherTech.id, display_name: `${marker} OMITTED TARGET`, contact_name: `${marker} OMITTED TARGET`, phone: "+14805550109", email: `omitted-${runId}@example.test`, property_address: addresses[8], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
      { id: ids.customers[7], company_id: weatherTech.id, display_name: `${marker} PHONE EMAIL ONLY`, contact_name: `${marker} PHONE EMAIL ONLY`, phone: "+14805550111", email: `exact-minimal-${runId}@example.test`, property_address: addresses[10], city: "Scottsdale", state: "AZ", postal_code: "85251", customer_type: "homeowner", status: "active", notes: marker },
    ]);
    const propertyRows = await insertRows(service, "properties", [
      { id: ids.properties[0], company_id: weatherTech.id, customer_id: null, display_name: `${marker} PROPERTY MAIN`, address: addresses[0], city: "Scottsdale", state: "AZ", postal_code: "85251", notes: marker },
      { id: ids.properties[1], company_id: weatherTech.id, customer_id: null, display_name: `${marker} PROPERTY ROLLBACK`, address: addresses[6], city: "Scottsdale", state: "AZ", postal_code: "85251", notes: marker },
      { id: ids.properties[2], company_id: weatherTech.id, customer_id: null, display_name: `${marker} PROPERTY OMITTED`, address: addresses[8], city: "Scottsdale", state: "AZ", postal_code: "85251", notes: marker },
    ]);
    const leadRows = await insertRows(service, "leads", ids.leads.map((id, index) => ({
      id,
      company_id: weatherTech.id,
      customer_id: null,
      property_id: index === 0
        ? ids.properties[0]
        : index === 6
          ? ids.properties[1]
          : index === 8
            ? ids.properties[2]
            : null,
      contact_name: index === 10 ? `${marker} LEAD EXACT WITHOUT ADDRESS` : `${marker} LEAD ${index}`,
      phone: index === 9 ? null : index === 10 ? "+14805550111" : `+1480555010${index + 1}`,
      email: index === 0
        ? `exact-${runId}@example.test`
        : index === 8
          ? `omitted-${runId}@example.test`
          : index === 9
            ? null
            : index === 10
              ? `exact-minimal-${runId}@example.test`
            : `lead-${index}-${runId}@example.test`,
      property_address: index === 10 ? "" : addresses[index],
      city: "Scottsdale",
      state: "AZ",
      postal_code: "85251",
      service_type: "roofing",
      source: marker,
      status: "contacted",
      pipeline_stage: "contacted",
      priority: "normal",
      estimated_value: 0,
      notes: marker,
    })));
    const byLeadId = new Map(leadRows.map((row) => [row.id, row]));
    const byCustomerId = new Map(customerRows.map((row) => [row.id, row]));
    const byPropertyId = new Map(propertyRows.map((row) => [row.id, row]));

    const estimateRows = await insertRows(service, "estimates", [
      { id: ids.estimates[0], company_id: weatherTech.id, customer_id: null, lead_id: ids.leads[0], property_id: ids.properties[0], title: `${marker} ESTIMATE MAIN`, status: "draft", service_type: "roofing" },
      { id: ids.estimates[1], company_id: weatherTech.id, customer_id: null, lead_id: ids.leads[6], property_id: ids.properties[1], title: `${marker} ESTIMATE ROLLBACK`, status: "draft", service_type: "roofing" },
      { id: ids.estimates[2], company_id: weatherTech.id, customer_id: ids.customers[4], lead_id: ids.leads[8], property_id: ids.properties[2], title: `${marker} ESTIMATE OMITTED CONFLICT`, status: "draft", service_type: "roofing" },
    ]);
    const jobRows = await insertRows(service, "jobs", [
      { id: ids.jobs[0], company_id: weatherTech.id, customer_id: null, lead_id: ids.leads[0], estimate_id: ids.estimates[0], property_id: ids.properties[0], title: `${marker} JOB MAIN`, service_type: "roofing", status: "draft", property_address: addresses[0] },
      { id: ids.jobs[1], company_id: weatherTech.id, customer_id: null, lead_id: ids.leads[6], estimate_id: ids.estimates[1], property_id: ids.properties[1], title: `${marker} JOB ROLLBACK`, service_type: "roofing", status: "draft", property_address: addresses[6] },
    ]);
    const scheduleRows = await insertRows(service, "schedule_events", [{
      id: ids.schedule_events[0], company_id: weatherTech.id, customer_id: null, lead_id: ids.leads[0], job_id: ids.jobs[0], property_id: ids.properties[0], title: `${marker} SCHEDULE MAIN`, event_type: "job", status: "scheduled", start_at: "2026-08-20T16:00:00.000Z", end_at: "2026-08-20T17:00:00.000Z",
    }]);
    const inspectionRows = await insertRows(service, "inspections", [{
      id: ids.inspections[0], company_id: weatherTech.id, customer_id: null, lead_id: ids.leads[0], job_id: ids.jobs[0], estimate_id: ids.estimates[0], property_id: ids.properties[0], title: `${marker} INSPECTION MAIN`, status: "draft", checklist: "[]",
    }]);
    const officeRows = await insertRows(service, "office_tasks", [
      {
        id: ids.office_tasks[0], company_id: weatherTech.id, customer_id: null, property_id: ids.properties[0], lead_id: ids.leads[0], inspection_id: null, estimate_id: null, job_id: null, source_type: "new_lead", automation_key: `${marker}:office-main`, title: `${marker} OFFICE MAIN`, priority: "normal", due_at: "2026-08-20T16:00:00.000Z", status: "open",
      },
      {
        id: ids.office_tasks[1], company_id: weatherTech.id, customer_id: null, property_id: ids.properties[0], lead_id: ids.leads[7], inspection_id: null, estimate_id: null, job_id: null, source_type: "new_lead", automation_key: `${marker}:office-property-only`, title: `${marker} OFFICE PROPERTY ONLY`, priority: "normal", due_at: "2026-08-20T17:00:00.000Z", status: "open",
      },
    ]);

    const mainLead = byLeadId.get(ids.leads[0]);
    const mainRequest = requestFor({
      companyId: weatherTech.id,
      operationKey: `${marker} LINK`,
      decision: "link_existing",
      lead: mainLead,
      customer: versioned(byCustomerId.get(ids.customers[0])),
      property: versioned(byPropertyId.get(ids.properties[0])),
      links: {
        estimates: [versioned(estimateRows[0])],
        inspections: [versioned(inspectionRows[0])],
        jobs: [versioned(jobRows[0])],
        schedule_events: [versioned(scheduleRows[0])],
        office_tasks: officeRows.map(versioned),
      },
    });
    const first = await callReconciliation(owner, mainRequest);
    requireCondition(first.status === "applied" && first.duplicate === false, "Reviewed link did not apply.");
    requireCondition(
      first.customer_id === ids.customers[0] && first.property_id === ids.properties[0],
      "Reviewed link returned the wrong customer or property.",
    );
    requireCondition(
      first.customer_created === false &&
        first.decision === "link_existing" &&
        first.company_id === weatherTech.id &&
        first.lead_id === ids.leads[0] &&
        first.updated?.leads === 1 &&
        first.updated?.properties === 1 &&
        first.updated?.estimates === 1 &&
        first.updated?.inspections === 1 &&
        first.updated?.jobs === 1 &&
        first.updated?.schedule_events === 1 &&
        first.updated?.office_tasks === 2,
      "Reviewed link did not report every selected graph mutation exactly once.",
    );
    const replay = await callReconciliation(owner, mainRequest);
    requireCondition(
      replay.status === "duplicate" && replay.duplicate === true && replay.event_id === first.event_id,
      "Exact retry did not return the durable result.",
    );
    await expectRejected(
      () => callReconciliation(owner, { ...mainRequest, decision: "dismiss" }),
      "Conflicting operation-key reuse",
      /operation key was reused with a conflicting request/i,
    );
    await expectRejected(
      () => callReconciliation(owner, { ...mainRequest, company_id: ihc.id }),
      "Wrong-company duplicate",
      /lead was not found in the selected company/i,
    );

    const concurrentRequest = requestFor({
      companyId: weatherTech.id,
      operationKey: `${marker} CONCURRENT`,
      decision: "link_existing",
      lead: byLeadId.get(ids.leads[5]),
      customer: versioned(byCustomerId.get(ids.customers[4])),
    });
    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => callReconciliation(owner, concurrentRequest)),
    );
    requireCondition(
      new Set(concurrent.map((item) => item.event_id)).size === 1 &&
        concurrent.filter((item) => item.duplicate === false && item.status === "applied").length === 1 &&
        concurrent.filter((item) => item.duplicate === true && item.status === "duplicate").length === 7,
      "Concurrent approvals did not converge to one event and result.",
    );

    const createLead = byLeadId.get(ids.leads[1]);
    const createResult = await callReconciliation(owner, requestFor({
      companyId: weatherTech.id,
      operationKey: `${marker} CREATE`,
      decision: "create_customer",
      lead: createLead,
      customer: { display_name: createLead.contact_name, contact_name: createLead.contact_name, customer_type: "homeowner" },
    }));
    requireCondition(
      createResult.customer_created === true &&
        createResult.customer_id &&
        createResult.company_id === weatherTech.id &&
        createResult.lead_id === createLead.id &&
        createResult.updated?.leads === 1 &&
        createResult.updated?.properties === 0 &&
        createResult.updated?.estimates === 0 &&
        createResult.updated?.inspections === 0 &&
        createResult.updated?.jobs === 0 &&
        createResult.updated?.schedule_events === 0 &&
        createResult.updated?.office_tasks === 0,
      "Reviewed create did not create exactly one customer.",
    );
    ids.customers.push(createResult.customer_id);

    const exactWithoutAddressLead = byLeadId.get(ids.leads[10]);
    const exactWithoutAddressResult = await callReconciliation(owner, requestFor({
      companyId: weatherTech.id,
      operationKey: `${marker} EXACT WITHOUT ADDRESS`,
      decision: "link_existing",
      lead: exactWithoutAddressLead,
      customer: versioned(byCustomerId.get(ids.customers[7])),
    }));
    requireCondition(
      exactWithoutAddressResult.status === "applied" &&
        exactWithoutAddressResult.duplicate === false &&
        exactWithoutAddressResult.customer_created === false &&
        exactWithoutAddressResult.customer_id === ids.customers[7] &&
        exactWithoutAddressResult.lead_id === exactWithoutAddressLead.id &&
        exactWithoutAddressResult.updated?.leads === 1 &&
        exactWithoutAddressResult.updated?.properties === 0 &&
        exactWithoutAddressResult.updated?.estimates === 0 &&
        exactWithoutAddressResult.updated?.inspections === 0 &&
        exactWithoutAddressResult.updated?.jobs === 0 &&
        exactWithoutAddressResult.updated?.schedule_events === 0 &&
        exactWithoutAddressResult.updated?.office_tasks === 0,
      "Unique exact phone/email linking incorrectly required address evidence.",
    );

    await expectRejected(
      () => callReconciliation(owner, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} AMBIGUOUS`,
        decision: "link_existing",
        lead: byLeadId.get(ids.leads[3]),
        customer: versioned(byCustomerId.get(ids.customers[1])),
      })),
      "Ambiguous identity",
      /identity is ambiguous within the selected company/i,
    );
    await expectRejected(
      () => callReconciliation(owner, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} CROSS COMPANY`,
        decision: "link_existing",
        lead: byLeadId.get(ids.leads[4]),
        customer: versioned(byCustomerId.get(ids.customers[3])),
      })),
      "Cross-company identity",
      /not the sole evidenced company-scoped match|not found in the selected company/i,
    );

    const staleLead = byLeadId.get(ids.leads[2]);
    await requireRows(
      service.from("leads").update({ notes: `${marker} STALE` }).eq("id", staleLead.id).select("id"),
      "Advance stale lead version",
    );
    await expectRejected(
      () => callReconciliation(owner, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} STALE`,
        decision: "create_customer",
        lead: staleLead,
        customer: { display_name: staleLead.contact_name, contact_name: staleLead.contact_name, customer_type: "homeowner" },
      })),
      "Stale review",
      /lead changed after review/i,
    );

    const rollbackLead = byLeadId.get(ids.leads[6]);
    await expectRejected(
      () => callReconciliation(owner, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} ROLLBACK`,
        decision: "link_existing",
        lead: rollbackLead,
        customer: versioned(byCustomerId.get(ids.customers[5])),
        property: versioned(byPropertyId.get(ids.properties[1])),
        links: {
          ...EMPTY_LINKS,
          estimates: [versioned(estimateRows[1])],
          jobs: [{ id: jobRows[1].id, expected_updated_at: "2000-01-01T00:00:00.000Z" }],
        },
      })),
      "Transactional rollback",
      /selected job changed after review/i,
    );

    const omittedConflictLead = byLeadId.get(ids.leads[8]);
    await expectRejected(
      () => callReconciliation(owner, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} OMITTED CHILD CONFLICT`,
        decision: "link_existing",
        lead: omittedConflictLead,
        customer: versioned(byCustomerId.get(ids.customers[6])),
        property: versioned(byPropertyId.get(ids.properties[2])),
      })),
      "Omitted-child conflict",
      /property customer assignment conflicts with an existing CRM graph row/i,
    );

    const insufficientEvidenceLead = byLeadId.get(ids.leads[9]);
    await expectRejected(
      () => callReconciliation(owner, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} INSUFFICIENT EVIDENCE`,
        decision: "create_customer",
        lead: insufficientEvidenceLead,
        customer: {
          display_name: insufficientEvidenceLead.contact_name,
          contact_name: insufficientEvidenceLead.contact_name,
          customer_type: "homeowner",
        },
      })),
      "Insufficient create evidence",
      /creating a customer requires reviewed name, address, and phone or email evidence/i,
    );

    await expectRejected(
      () => callReconciliation(restrictedClient, requestFor({
        companyId: weatherTech.id,
        operationKey: `${marker} ROLE DENIED`,
        decision: "dismiss",
        lead: byLeadId.get(ids.leads[7]),
      })),
      "Unauthorized role",
      /requires an owner or admin/i,
    );
    const dismissed = await callReconciliation(owner, requestFor({
      companyId: weatherTech.id,
      operationKey: uuidOperationKey,
      decision: "dismiss",
      lead: byLeadId.get(ids.leads[7]),
    }));
    requireCondition(
      dismissed.status === "dismissed" &&
        dismissed.operation_key === uuidOperationKey &&
        !uuidOperationKey.startsWith("TEST WTOS REGRESSION"),
      "Reviewed UUID-key dismissal was not recorded independently of the test marker.",
    );

    await expectRejected(
      () => requireRows(
        restrictedClient
          .from("leads")
          .update({ customer_id: ids.customers[0] })
          .eq("id", ids.leads[7])
          .select("id"),
        "Direct authenticated lead customer reassignment",
      ),
      "Direct lead customer reassignment",
      /permission denied for (?:table|relation) leads/i,
    );
    await expectRejected(
      () => requireRows(
        restrictedClient
          .from("leads")
          .update({ property_id: ids.properties[0] })
          .eq("id", ids.leads[7])
          .select("id"),
        "Direct authenticated lead property reassignment",
      ),
      "Direct lead property reassignment",
      /permission denied for (?:table|relation) leads/i,
    );
    await expectRejected(
      () => requireRows(
        restrictedClient
          .from("properties")
          .update({ customer_id: ids.customers[0] })
          .eq("id", ids.properties[2])
          .select("id"),
        "Direct authenticated property customer reassignment",
      ),
      "Direct property customer reassignment",
      /permission denied for (?:table|relation) properties/i,
    );

    const ordinaryLeadUpdate = await requireRows(
      restrictedClient
        .from("leads")
        .update({ status: "qualified" })
        .eq("id", ids.leads[2])
        .select("id,status"),
      "Ordinary authenticated lead status update",
    );
    const ordinaryPropertyAddress = `${addresses[6]} REVIEWED`;
    const ordinaryPropertyUpdate = await requireRows(
      restrictedClient
        .from("properties")
        .update({ address: ordinaryPropertyAddress })
        .eq("id", ids.properties[1])
        .select("id,address"),
      "Ordinary authenticated property address update",
    );
    requireCondition(
      ordinaryLeadUpdate.length === 1 &&
        ordinaryLeadUpdate[0].status === "qualified" &&
        ordinaryPropertyUpdate.length === 1 &&
        ordinaryPropertyUpdate[0].address === ordinaryPropertyAddress,
      "Reconciliation column hardening blocked an ordinary same-company operational update.",
    );

    const [
      mainAfter,
      mainPropertyAfter,
      mainEstimateAfter,
      mainInspectionAfter,
      mainJobAfter,
      mainScheduleAfter,
      mainOfficeAfter,
      createdLeadAfter,
      createdCustomerAfter,
      rollbackAfter,
      rollbackPropertyAfter,
      rollbackEstimateAfter,
      rollbackJobAfter,
      omittedLeadAfter,
      omittedPropertyAfter,
      omittedEstimateAfter,
      insufficientEvidenceLeadAfter,
      insufficientEvidenceCustomersAfter,
      insufficientEvidenceAuditAfter,
      exactWithoutAddressLeadAfter,
      directMutationLeadAfter,
      directMutationPropertyAfter,
      ordinaryLeadAfter,
      ordinaryPropertyAfter,
    ] = await Promise.all([
      requireRows(service.from("leads").select("customer_id,property_id,status,pipeline_stage").eq("id", ids.leads[0]), "Verify main lead"),
      requireRows(service.from("properties").select("customer_id").eq("id", ids.properties[0]), "Verify main property"),
      requireRows(service.from("estimates").select("customer_id,property_id").eq("id", ids.estimates[0]), "Verify main estimate"),
      requireRows(service.from("inspections").select("customer_id,property_id").eq("id", ids.inspections[0]), "Verify main inspection"),
      requireRows(service.from("jobs").select("customer_id,property_id").eq("id", ids.jobs[0]), "Verify main job"),
      requireRows(service.from("schedule_events").select("customer_id,property_id").eq("id", ids.schedule_events[0]), "Verify main schedule event"),
      requireRows(service.from("office_tasks").select("id,customer_id,property_id").in("id", ids.office_tasks), "Verify reviewed office tasks"),
      requireRows(service.from("leads").select("customer_id,property_id,status,pipeline_stage").eq("id", ids.leads[1]), "Verify create lead"),
      requireRows(service.from("customers").select("id,company_id,display_name,contact_name,phone,email,property_address").eq("id", createResult.customer_id), "Verify created customer"),
      requireRows(service.from("leads").select("customer_id,property_id,status,pipeline_stage").eq("id", ids.leads[6]), "Verify rollback lead"),
      requireRows(service.from("properties").select("customer_id").eq("id", ids.properties[1]), "Verify rollback property"),
      requireRows(service.from("estimates").select("customer_id,property_id").eq("id", ids.estimates[1]), "Verify rollback estimate"),
      requireRows(service.from("jobs").select("customer_id,property_id").eq("id", ids.jobs[1]), "Verify rollback job"),
      requireRows(service.from("leads").select("customer_id,property_id,status,pipeline_stage").eq("id", ids.leads[8]), "Verify omitted-conflict lead"),
      requireRows(service.from("properties").select("customer_id").eq("id", ids.properties[2]), "Verify omitted-conflict property"),
      requireRows(service.from("estimates").select("customer_id,property_id").eq("id", ids.estimates[2]), "Verify omitted-conflict estimate"),
      requireRows(service.from("leads").select("customer_id,status,pipeline_stage").eq("id", ids.leads[9]), "Verify insufficient-evidence lead"),
      requireRows(service.from("customers").select("id").eq("display_name", insufficientEvidenceLead.contact_name), "Verify insufficient-evidence customer absence"),
      requireRows(service.from(AUDIT_TABLE).select("id").eq("operation_key", `${marker} INSUFFICIENT EVIDENCE`), "Verify insufficient-evidence audit absence"),
      requireRows(service.from("leads").select("customer_id,property_id,status,pipeline_stage").eq("id", ids.leads[10]), "Verify exact link without address"),
      requireRows(service.from("leads").select("customer_id,property_id").eq("id", ids.leads[7]), "Verify direct lead reassignment refusal"),
      requireRows(service.from("properties").select("customer_id").eq("id", ids.properties[2]), "Verify direct property reassignment refusal"),
      requireRows(service.from("leads").select("status").eq("id", ids.leads[2]), "Verify ordinary lead status update"),
      requireRows(service.from("properties").select("address").eq("id", ids.properties[1]), "Verify ordinary property address update"),
    ]);
    requireCondition(
      mainAfter[0]?.status === mainLead.status &&
        mainAfter[0]?.pipeline_stage === mainLead.pipeline_stage &&
        mainAfter[0]?.customer_id === ids.customers[0],
      "Approved reconciliation changed lead status/stage or missed the customer link.",
    );
    for (const [label, rows] of [
      ["property", mainPropertyAfter],
      ["estimate", mainEstimateAfter],
      ["inspection", mainInspectionAfter],
      ["job", mainJobAfter],
      ["schedule event", mainScheduleAfter],
    ]) {
      requireCondition(
        rows.length === 1 &&
          rows[0].customer_id === ids.customers[0] &&
          (label === "property" || rows[0].property_id === ids.properties[0]),
        `Approved reconciliation did not persist the reviewed ${label} graph links.`,
      );
    }
    requireCondition(
      mainOfficeAfter.length === ids.office_tasks.length &&
        mainOfficeAfter.every(
          (row) =>
            ids.office_tasks.includes(row.id) &&
            row.customer_id === ids.customers[0] &&
            row.property_id === ids.properties[0],
        ),
      "Approved reconciliation did not persist both lead-linked and property-only office-task links.",
    );
    requireCondition(
      createdLeadAfter.length === 1 &&
        createdLeadAfter[0].customer_id === createResult.customer_id &&
        createdLeadAfter[0].property_id === createLead.property_id &&
        createdLeadAfter[0].status === createLead.status &&
        createdLeadAfter[0].pipeline_stage === createLead.pipeline_stage &&
        createdCustomerAfter.length === 1 &&
        createdCustomerAfter[0].id === createResult.customer_id &&
        createdCustomerAfter[0].company_id === weatherTech.id &&
        createdCustomerAfter[0].display_name === createLead.contact_name &&
        createdCustomerAfter[0].contact_name === createLead.contact_name &&
        createdCustomerAfter[0].phone === createLead.phone &&
        createdCustomerAfter[0].email === createLead.email &&
        createdCustomerAfter[0].property_address === createLead.property_address,
      "Reviewed create did not persist exactly one company-scoped customer and preserve lead workflow state.",
    );
    requireCondition(
      rollbackAfter[0]?.customer_id === null &&
        rollbackPropertyAfter[0]?.customer_id === null &&
        rollbackEstimateAfter[0]?.customer_id === null &&
        rollbackJobAfter[0]?.customer_id === null,
      "Failed reconciliation left a partial graph mutation.",
    );
    requireCondition(
      omittedLeadAfter[0]?.customer_id === null &&
        omittedLeadAfter[0]?.property_id === ids.properties[2] &&
        omittedPropertyAfter[0]?.customer_id === null &&
        omittedEstimateAfter[0]?.customer_id === ids.customers[4] &&
        omittedEstimateAfter[0]?.property_id === ids.properties[2],
      "Omitted-child conflict changed part of the existing graph.",
    );
    requireCondition(
      insufficientEvidenceLeadAfter.length === 1 &&
        insufficientEvidenceLeadAfter[0].customer_id === null &&
        insufficientEvidenceLeadAfter[0].status === insufficientEvidenceLead.status &&
        insufficientEvidenceLeadAfter[0].pipeline_stage ===
          insufficientEvidenceLead.pipeline_stage &&
        insufficientEvidenceCustomersAfter.length === 0 &&
        insufficientEvidenceAuditAfter.length === 0,
      "Insufficient create evidence left a customer, link, audit event, or workflow mutation.",
    );
    requireCondition(
      exactWithoutAddressLeadAfter.length === 1 &&
        exactWithoutAddressLeadAfter[0].customer_id === ids.customers[7] &&
        exactWithoutAddressLeadAfter[0].property_id === null &&
        exactWithoutAddressLeadAfter[0].status === exactWithoutAddressLead.status &&
        exactWithoutAddressLeadAfter[0].pipeline_stage === exactWithoutAddressLead.pipeline_stage,
      "Unique exact phone/email linking without an address changed workflow state or missed the customer link.",
    );
    requireCondition(
      directMutationLeadAfter.length === 1 &&
        directMutationLeadAfter[0].customer_id === null &&
        directMutationLeadAfter[0].property_id === null &&
        directMutationPropertyAfter.length === 1 &&
        directMutationPropertyAfter[0].customer_id === null,
      "A forbidden authenticated direct identity reassignment changed the CRM graph.",
    );
    requireCondition(
      ordinaryLeadAfter.length === 1 &&
        ordinaryLeadAfter[0].status === "qualified" &&
        ordinaryPropertyAfter.length === 1 &&
        ordinaryPropertyAfter[0].address === ordinaryPropertyAddress,
      "An ordinary same-company status or property-address update was not persisted.",
    );

    const auditRows = await requireRows(
      service.from(AUDIT_TABLE).select("*").in("source_lead_id", ids.leads),
      "Read reconciliation audit events",
    );
    ids.crm_identity_reconciliation_events.push(...auditRows.map((row) => row.id));
    requireCondition(
      auditRows.length === 5 &&
        auditRows.some((row) => row.operation_key === uuidOperationKey),
      `Expected five durable successful decisions including the UUID-key audit; found ${auditRows.length}.`,
    );
    const { data: updateAttempt, error: updateError } = await owner
      .from(AUDIT_TABLE)
      .update({ operation_key: `${marker} MUTATED` })
      .eq("id", first.event_id)
      .select("id");
    requireCondition(updateError || updateAttempt?.length === 0, "Authenticated audit update was not refused.");
    const { data: deleteAttempt, error: deleteError } = await owner
      .from(AUDIT_TABLE)
      .delete()
      .eq("id", first.event_id)
      .select("id");
    requireCondition(deleteError || deleteAttempt?.length === 0, "Authenticated audit delete was not refused.");

    const financialAfter = {
      invoices: await countRows(service, "invoices"),
      payments: await countRows(service, "payments"),
      providerEvents: await countRows(service, "communication_provider_events"),
      smsMessages: await countRows(service, "sms_messages"),
      emailMessages: await countRows(service, "email_messages"),
    };
    requireCondition(
      JSON.stringify(financialAfter) === JSON.stringify(financialBefore),
      "Reconciliation changed provider or financial records.",
    );
    requireCondition(counters.blockedExternalRequests === 0, "A provider network request was attempted.");

    report = {
      result: "PASS",
      target: REGRESSION_SUPABASE_PROJECT_REF,
      runId,
      externalEnvironmentOnly: loaded.source === "external_file",
      exactMatchLinked: true,
      createReviewed: true,
      ambiguityRejected: true,
      crossCompanyRejected: true,
      staleReviewRejected: true,
      rollbackVerified: true,
      omittedChildConflictRejected: true,
      insufficientEvidenceRejected: true,
      exactLinkWithoutAddressVerified: true,
      propertyOnlyOfficeTaskLinked: true,
      directIdentityMutationRejected: true,
      ordinaryOperationalUpdatesPreserved: true,
      uuidOperationAuditRecorded: true,
      selectedGraphLinksVerified: true,
      resultMutationCountsVerified: true,
      statusAndStagePreserved: true,
      exactRetryIdempotent: true,
      conflictingOperationRejected: true,
      concurrentApprovalsConverged: true,
      unauthorizedRoleRejected: true,
      auditImmutableForAuthenticatedUsers: true,
      providerOrFinancialEffects: 0,
      providerNetworkRequests: 0,
      cleanupResidue: null,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      if (cleanupAuthorized) {
        const discoveredEvents = await requireRows(
          service.from(AUDIT_TABLE).select("id,operation_key").in("source_lead_id", ids.leads),
          "Discover source-lead-owned reconciliation events for cleanup",
        );
        const uuidAuditDiscovered = discoveredEvents.some(
          (row) => row.operation_key === uuidOperationKey,
        );
        ids.crm_identity_reconciliation_events.push(...discoveredEvents.map((row) => row.id));
        const discoveredCustomers = await requireRows(
          service.from("customers").select("id").like("display_name", `${marker}%`),
          "Discover current-run created customer for cleanup",
        );
        ids.customers.push(...discoveredCustomers.map((row) => row.id));
        await deleteExactIds(service, AUDIT_TABLE, ids.crm_identity_reconciliation_events);
        await deleteExactIds(service, "office_tasks", ids.office_tasks);
        await deleteExactIds(service, "inspections", ids.inspections);
        await deleteExactIds(service, "schedule_events", ids.schedule_events);
        await deleteExactIds(service, "jobs", ids.jobs);
        await deleteExactIds(service, "estimates", ids.estimates);
        await deleteExactIds(service, "leads", ids.leads);
        await deleteExactIds(service, "properties", ids.properties);
        await deleteExactIds(service, "customers", ids.customers);
        for (const [table, values] of Object.entries(ids)) {
          await assertExactIdsAbsent(service, table, values);
        }
        if (restrictedUserId) {
          const { error: membershipCleanupError } = await service
            .from("company_memberships")
            .delete()
            .eq("user_id", restrictedUserId);
          if (membershipCleanupError) {
            throw new Error(
              `Restricted membership cleanup failed: ${membershipCleanupError.message}`,
            );
          }
          const { error: profileCleanupError } = await service
            .from("profiles")
            .delete()
            .eq("id", restrictedUserId);
          if (profileCleanupError) {
            throw new Error(`Restricted profile cleanup failed: ${profileCleanupError.message}`);
          }
          const { error } = await service.auth.admin.deleteUser(restrictedUserId);
          if (error) throw new Error(`Restricted user cleanup failed: ${error.message}`);
        }
        const finalVerification = await runRegressionEnvironmentCommand({
          command: "verify",
          env: loaded.environment,
          fetchImpl: guardedFetch,
        });
        requireCondition(finalVerification.residueCount === 0, "Final zero-residue verification failed.");
        if (report) {
          requireCondition(
            uuidAuditDiscovered,
            "UUID-key reconciliation audit was not discovered through the exact synthetic source lead.",
          );
          report.uuidOperationAuditCleanupVerified = true;
          report.cleanupResidue = 0;
        }
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      await Promise.allSettled([
        settleWithTimeout(owner.auth.signOut({ scope: "local" }), "Owner sign-out"),
        restrictedClient
          ? settleWithTimeout(
              restrictedClient.auth.signOut({ scope: "local" }),
              "Restricted-user sign-out",
            )
          : Promise.resolve(),
      ]);
    }
  }

  if (primaryError && cleanupError) {
    throw new AggregateError([primaryError, cleanupError], "CRM reconciliation regression and cleanup both failed.");
  }
  if (cleanupError) throw cleanupError;
  if (primaryError) throw primaryError;
  requireCondition(report?.cleanupResidue === 0, "CRM reconciliation regression did not prove zero residue.");
  return report;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runCrmIdentityReconciliationRegression({ cwd: resolve(process.cwd()) })
    .then((report) => {
      console.log("WeatherTech OS CRM identity reconciliation regression: PASS");
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        `WeatherTech OS CRM identity reconciliation regression: FAIL: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
