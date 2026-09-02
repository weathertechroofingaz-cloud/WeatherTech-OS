#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
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

export const AUTOMATION_ENGINE_REGRESSION_RUN =
  "WTOS_AUTOMATION_ENGINE_REGRESSION_RUN";
export const AUTOMATION_REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg";
export const AUTOMATION_PRODUCTION_PROJECT_REF = "gahfcgyjtfwwmsterhzu";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireData(result, label) {
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return result.data;
}

function requireRefusal(result, codes, label) {
  if (!result.error) throw new Error(`${label} unexpectedly succeeded.`);
  const actual = String(result.error.code ?? "");
  if (!codes.includes(actual)) {
    throw new Error(
      `${label} returned ${actual || "no code"} (${result.error.message ?? "no message"}); expected ${codes.join(" or ")}.`,
    );
  }
  return result.error;
}

function createNetworkGuard(fetchImpl, allowedOrigin) {
  const counters = { allowedSupabaseRequests: 0, providerNetworkRequests: 0 };
  const fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? String(input) : input.url,
    );
    if (url.origin !== allowedOrigin) {
      counters.providerNetworkRequests += 1;
      throw new Error(`Automation regression blocked non-Supabase network origin ${url.origin}.`);
    }
    counters.allowedSupabaseRequests += 1;
    const timeoutSignal = AbortSignal.timeout(15_000);
    const requestSignal = init?.signal;
    return fetchImpl(input, {
      ...init,
      signal: requestSignal
        ? AbortSignal.any([requestSignal, timeoutSignal])
        : timeoutSignal,
    });
  };
  return { counters, fetch };
}

function createIsolatedClient(config, key, fetch) {
  return createClient(config.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch },
  });
}

export function loadAutomationRegressionEnvironment({
  cwd,
  runtimeEnv = process.env,
} = {}) {
  requireCondition(cwd, "Automation regression requires an explicit repository path.");
  const externalPath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();
  requireCondition(
    externalPath && isAbsolute(externalPath),
    `${BROWSER_REGRESSION_ENV_FILE} must name a secure absolute file outside the repository. This runner never reads .env.local.`,
  );
  requireCondition(
    !runtimeEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    `Automation regression accepts target credentials only from ${BROWSER_REGRESSION_ENV_FILE}.`,
  );
  const loaded = loadBrowserRegressionEnvironment({
    cwd,
    runtimeEnv,
    remoteWritesEnabled: true,
  });
  requireCondition(
    loaded.source === "external_file",
    "Automation regression requires the secure external-file credential source.",
  );
  const config = validateRegressionEnvironment(loaded.environment);
  requireCondition(
    REGRESSION_SUPABASE_PROJECT_REF === AUTOMATION_REGRESSION_PROJECT_REF &&
      PRODUCTION_SUPABASE_PROJECT_REF === AUTOMATION_PRODUCTION_PROJECT_REF,
    "Automation regression target constants disagree with the shared guard.",
  );
  requireCondition(
    config.projectRef === AUTOMATION_REGRESSION_PROJECT_REF &&
      !config.supabaseUrl.includes(AUTOMATION_PRODUCTION_PROJECT_REF),
    "Production Supabase is permanently prohibited for automation regression.",
  );
  return { config, environment: loaded.environment };
}

function ruleRow({ id, companyId, locationId, key, enabled = true, approval = "none" }) {
  return {
    id,
    company_id: companyId,
    company_location_id: locationId,
    rule_key: key,
    name: `TEST WTOS AUTOMATION ${key}`,
    description: "Synthetic isolated automation regression rule.",
    trigger_type: "lead.created",
    conditions: { all: [{ field: "status", operator: "eq", value: "new" }] },
    action_type: "create_office_task",
    action_config: {
      sourceType: "new_lead",
      automationKeyPrefix: `${key}:`,
      title: "TEST WTOS AUTOMATION internal task",
      notes: "Synthetic internal task only.",
      priority: "normal",
      dueStrategy: "event_time",
    },
    enabled,
    approval_policy: approval,
    enabled_at: enabled ? new Date().toISOString() : null,
    disabled_at: enabled ? null : new Date().toISOString(),
    disable_reason: enabled ? null : "Synthetic disabled fixture.",
  };
}

async function countExact(client, table, column, values) {
  const result = await client.from(table).select("id", { count: "exact", head: true }).in(column, values);
  if (result.error) throw new Error(`Count ${table} failed: ${result.error.message}`);
  return result.count ?? 0;
}

async function loadSourceAutomationEvents(client, sourceTable, sourceId) {
  return requireData(
    await client
      .from("automation_events")
      .select(
        "id,company_id,company_location_id,event_type,source_table,source_id,idempotency_key,recorded_at",
      )
      .eq("source_table", sourceTable)
      .eq("source_id", sourceId)
      .order("recorded_at", { ascending: true }),
    `Automation events for ${sourceTable}:${sourceId}`,
  );
}

export async function runAutomationEngineRegression({
  cwd,
  runtimeEnv = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireCondition(runtimeEnv[AUTOMATION_ENGINE_REGRESSION_RUN] === "true",
    `${AUTOMATION_ENGINE_REGRESSION_RUN}=true is required for this explicit synthetic run.`);
  const { config, environment } = loadAutomationRegressionEnvironment({ cwd, runtimeEnv });
  const network = createNetworkGuard(fetchImpl, new URL(config.supabaseUrl).origin);
  await runRegressionEnvironmentCommand({ command: "verify", env: environment, fetchImpl: network.fetch });

  const service = createIsolatedClient(config, config.serviceRoleKey, network.fetch);
  const owner = createIsolatedClient(config, config.anonKey, network.fetch);
  const viewer = createIsolatedClient(config, config.anonKey, network.fetch);
  const runId = Date.now().toString();
  const marker = `TEST WTOS REGRESSION AUTOMATION ${runId}`;
  const companyA = randomUUID();
  const companyB = randomUUID();
  const locationA = randomUUID();
  const locationB = randomUUID();
  const viewerUserId = randomUUID();
  const viewerEmail = `weathertech-os-regression+automation-${runId}@example.test`;
  const viewerPassword = `Regression!${randomUUID()}aA1`;
  const leadDisabled = randomUUID();
  const leadEnabled = randomUUID();
  const leadDue = randomUUID();
  const leadWithoutLocation = randomUUID();
  const newLeadRuleId = randomUUID();
  const crossRuleId = randomUUID();
  const failureRuleId = randomUUID();
  const aiRuleId = randomUUID();
  const concurrentRuleId = randomUUID();
  const approvedEstimateRuleId = randomUUID();
  const approvedEstimateId = randomUUID();
  const mightyApesRouteId = randomUUID();
  const mightyApesCampaignId = `TEST-WTOS-MIGHTY-APES-${runId}`;
  const mightyApesDeliveryId = `TEST WTOS MIGHTY APES REGRESSION:${runId}:delivery`;
  const mightyApesLeadId = `TEST WTOS MIGHTY APES REGRESSION:${runId}:lead`;
  const dueTaskId = randomUUID();
  const connectedGhlA = randomUUID();
  const pausedGhlA = randomUUID();
  const connectedGhlB = randomUUID();
  const twilioConnectionA = randomUUID();
  const activePhoneA = randomUUID();
  const inactivePhoneA = randomUUID();
  const activePhoneB = randomUUID();
  const communicationSourceIds = {
    ghlLocated: randomUUID(),
    ghlReconciled: randomUUID(),
    ghlReconciledPaused: randomUUID(),
    ghlReconciledCrossCompany: randomUUID(),
    ghlReconciledOutbound: randomUUID(),
    ghlReconciledWrongType: randomUUID(),
    ghlNoLocation: randomUUID(),
    ghlOutbound: randomUUID(),
    ghlMissingDirection: randomUUID(),
    ghlUnknownDirection: randomUUID(),
    ghlIdentityCompanyB: randomUUID(),
    ghlPaused: randomUUID(),
    ghlUnmatched: randomUUID(),
    ghlWrongProvider: randomUUID(),
    twilioActive: randomUUID(),
    twilioReconciled: randomUUID(),
    twilioMissingPhone: randomUUID(),
    twilioInactivePhone: randomUUID(),
  };
  const callSourceIds = {
    ghlLocated: randomUUID(),
    ghlReconciled: randomUUID(),
    ghlReconciledPaused: randomUUID(),
    ghlReconciledCrossCompany: randomUUID(),
    ghlReconciledOutbound: randomUUID(),
    ghlReconciledCompleted: randomUUID(),
    ghlCrossCompany: randomUUID(),
    ghlMissingBinding: randomUUID(),
    twilioActive: randomUUID(),
    twilioReconciled: randomUUID(),
    twilioStatusTransition: randomUUID(),
    twilioCrossCompanyPhone: randomUUID(),
  };
  const capturedEventIds = [];
  const capturedExecutionIds = [];
  const capturedAuditIds = [];
  let cleanupResidue = -1;
  let primaryError = null;
  let assertions = 0;

  const check = (condition, message) => {
    requireCondition(condition, message);
    assertions += 1;
  };
  const progress = (stage) => console.log(`Automation regression: ${stage}`);

  try {
    progress("auth and isolated fixture setup");
    const ownerSession = requireData(
      await owner.auth.signInWithPassword({ email: config.ownerEmail, password: config.ownerPassword }),
      "Regression owner sign-in",
    );
    check(Boolean(ownerSession.user?.id), "Regression owner must authenticate");
    const ownerId = ownerSession.user.id;

    requireData(await service.from("companies").insert([
      { id: companyA, name: `${marker} A`, trade: "roofing", short_name: "Automation A", workflow_profile: "roofing" },
      { id: companyB, name: `${marker} B`, trade: "painting", short_name: "Automation B", workflow_profile: "painting" },
    ]), "Synthetic companies");
    requireData(await service.from("company_locations").insert([
      { id: locationA, company_id: companyA, location_key: `regression_a_${runId}`, display_name: `${marker} A` },
      { id: locationB, company_id: companyB, location_key: `regression_b_${runId}`, display_name: `${marker} B` },
    ]), "Synthetic locations");
    requireData(await service.from("company_memberships").insert([
      { user_id: ownerId, company_id: companyA, role: "owner", can_manage_settings: true, can_manage_financials: true, can_manage_production: true },
      { user_id: ownerId, company_id: companyB, role: "owner", can_manage_settings: true, can_manage_financials: true, can_manage_production: true },
    ]), "Owner synthetic memberships");
    requireData(await service.from("integration_connections").insert([
      {
        id: connectedGhlA,
        company_id: companyA,
        provider: "gohighlevel",
        status: "connected",
        display_name: `${marker} GHL CONNECTED A`,
        external_account_id: `regression-ghl-a-${runId}`,
        sync_direction: "provider_to_weathertech",
      },
      {
        id: pausedGhlA,
        company_id: companyA,
        provider: "gohighlevel",
        status: "paused",
        display_name: `${marker} GHL PAUSED A`,
        external_account_id: `regression-ghl-paused-${runId}`,
        sync_direction: "provider_to_weathertech",
      },
      {
        id: connectedGhlB,
        company_id: companyB,
        provider: "gohighlevel",
        status: "connected",
        display_name: `${marker} GHL CONNECTED B`,
        external_account_id: `regression-ghl-b-${runId}`,
        sync_direction: "provider_to_weathertech",
      },
      {
        id: twilioConnectionA,
        company_id: companyA,
        provider: "twilio",
        status: "connected",
        display_name: `${marker} TWILIO CONNECTION A`,
        external_account_id: `regression-twilio-a-${runId}`,
        sync_direction: "provider_to_weathertech",
      },
    ]), "Synthetic provider connections");
    requireData(await service.from("business_phone_numbers").insert([
      {
        id: activePhoneA,
        company_id: companyA,
        integration_connection_id: twilioConnectionA,
        provider: "twilio",
        display_name: `${marker} ACTIVE PHONE A`,
        routing_key: `regression-active-a-${runId}`,
        business_location: `${marker} A`,
        team_queue: `regression-a-${runId}`,
        lead_source: "Regression",
        communication_channel: "sms_voice",
        routing_status: "active",
      },
      {
        id: inactivePhoneA,
        company_id: companyA,
        integration_connection_id: twilioConnectionA,
        provider: "twilio",
        display_name: `${marker} INACTIVE PHONE A`,
        routing_key: `regression-inactive-a-${runId}`,
        business_location: `${marker} A`,
        team_queue: `regression-a-${runId}`,
        lead_source: "Regression",
        communication_channel: "sms_voice",
        routing_status: "disabled",
      },
      {
        id: activePhoneB,
        company_id: companyB,
        provider: "twilio",
        display_name: `${marker} ACTIVE PHONE B`,
        routing_key: `regression-active-b-${runId}`,
        business_location: `${marker} B`,
        team_queue: `regression-b-${runId}`,
        lead_source: "Regression",
        communication_channel: "sms_voice",
        routing_status: "active",
      },
    ]), "Synthetic Twilio business-phone routes");

    const createdViewer = requireData(await service.auth.admin.createUser({
      id: viewerUserId,
      email: viewerEmail,
      password: viewerPassword,
      email_confirm: true,
      app_metadata: { wt_os_regression_marker: marker, wt_os_regression_project_ref: config.projectRef },
    }), "Synthetic viewer");
    check(createdViewer.user.id === viewerUserId, "Viewer exact ID must be captured");
    requireData(await service.from("profiles").upsert({ id: viewerUserId, full_name: marker, role: "team_member", default_company_id: companyA }), "Viewer profile");
    requireData(await service.from("company_memberships").insert({
      user_id: viewerUserId, company_id: companyA, role: "viewer",
      can_manage_settings: false, can_manage_financials: false, can_manage_production: false,
    }), "Viewer membership");
    requireData(await viewer.auth.signInWithPassword({ email: viewerEmail, password: viewerPassword }), "Viewer sign-in");

    const aiRule = ruleRow({ id: aiRuleId, companyId: companyA, locationId: null, key: "ai:reviewed-follow-up", approval: "manual" });
    aiRule.trigger_type = "ai.action.approved";
    aiRule.action_config = {
      sourceType: "automation", automationKeyPrefix: "ai-follow-up:",
      title: "Review approved AI follow-up", notes: "Synthetic approved internal follow-up.",
      priority: "normal", dueStrategy: "event_time",
    };
    const failureRule = ruleRow({ id: failureRuleId, companyId: companyA, locationId: locationA, key: "regression-failure" });
    failureRule.trigger_type = "communication.received";
    const approvedEstimateRule = ruleRow({
      id: approvedEstimateRuleId,
      companyId: companyA,
      locationId: locationA,
      key: "approved-estimate:schedule-handoff",
    });
    approvedEstimateRule.trigger_type = "estimate.approved";
    approvedEstimateRule.conditions = {
      all: [{ field: "has_scheduled_job", operator: "falsy" }],
    };
    approvedEstimateRule.action_config = {
      sourceType: "automation",
      automationKeyPrefix: "approved_estimate_schedule:",
      title: "Schedule approved estimate and create production handoff",
      notes: "Synthetic approved estimate operations handoff.",
      priority: "high",
      dueStrategy: "event_time",
    };
    requireData(await service.from("automation_rules").insert([
      ruleRow({ id: newLeadRuleId, companyId: companyA, locationId: locationA, key: "regression-new-lead" }),
      ruleRow({ id: crossRuleId, companyId: companyB, locationId: locationB, key: "regression-cross-company" }),
      failureRule,
      aiRule,
      approvedEstimateRule,
    ]), "Synthetic automation rules");

    progress("RLS and rule disable/re-enable");
    const visibleRules = requireData(await viewer.from("automation_rules").select("id,company_id"), "Viewer scoped rule read");
    check(visibleRules.some((row) => row.id === newLeadRuleId), "Viewer must see own-company rule");
    check(!visibleRules.some((row) => row.id === crossRuleId), "Viewer must not see cross-company rule");
    requireRefusal(await viewer.from("automation_rules").insert(ruleRow({
      id: randomUUID(), companyId: companyA, locationId: locationA, key: "forged-viewer-rule",
    })), ["42501"], "Viewer direct automation-rule insert");

    let toggled = requireData(await owner.rpc("wtos_set_automation_rule_enabled_v1", {
      p_rule_id: newLeadRuleId, p_expected_version: 1, p_enabled: false,
      p_reason: "Synthetic disable-before-event assertion.",
    }), "Disable new-lead rule");
    check(toggled.version === 2 && toggled.enabled === false, "Disable must advance rule version");
    requireRefusal(await owner.rpc("wtos_set_automation_rule_enabled_v1", {
      p_rule_id: newLeadRuleId, p_expected_version: 1, p_enabled: false,
      p_reason: "Stale replay must fail.",
    }), ["P0001"], "Stale rule toggle");

    const baseLead = (id, label) => ({
      id, company_id: companyA, company_location_id: locationA,
      contact_name: `${marker} ${label}`, property_address: "100 Regression Way",
      service_type: "roofing", source: "Regression", status: "new", priority: "normal",
    });
    requireData(await service.from("leads").insert(baseLead(leadDisabled, "DISABLED")), "Disabled-rule lead");
    check(await countExact(service, "office_tasks", "automation_key", [`regression-new-lead:${leadDisabled}`]) === 0,
      "Disabled new-lead rule must create no task");

    toggled = requireData(await owner.rpc("wtos_set_automation_rule_enabled_v1", {
      p_rule_id: newLeadRuleId, p_expected_version: 2, p_enabled: true,
      p_reason: "Synthetic re-enable assertion.",
    }), "Re-enable new-lead rule");
    check(toggled.version === 3 && toggled.enabled === true, "Re-enable must advance rule version");
    requireData(await service.from("leads").insert(baseLead(leadEnabled, "ENABLED")), "Enabled-rule lead");
    check(await countExact(service, "office_tasks", "automation_key", [`regression-new-lead:${leadEnabled}`]) === 1,
      "Re-enabled new-lead rule must create exactly one task");
    requireData(
      await service.from("leads").insert({
        ...baseLead(leadWithoutLocation, "NO LOCATION"),
        company_location_id: null,
      }),
      "Location-null lead",
    );
    requireData(await service.from("leads").update({ next_follow_up: "2099-01-01" }).eq("id", leadEnabled), "Idempotent lead update");
    check(await countExact(service, "office_tasks", "automation_key", [`regression-new-lead:${leadEnabled}`]) === 1,
      "Lead update must not duplicate the task");

    const concurrentRule = ruleRow({
      id: concurrentRuleId,
      companyId: companyA,
      locationId: locationA,
      key: "regression-concurrent-update",
    });
    concurrentRule.trigger_type = "lead.updated";
    concurrentRule.conditions = {
      all: [{ field: "next_follow_up", operator: "eq", value: "2099-01-02" }],
    };
    concurrentRule.action_config.automationKeyPrefix = "regression-concurrent:";
    requireData(await service.from("automation_rules").insert(concurrentRule), "Concurrent automation rule");
    const concurrentUpdates = await Promise.all([
      service.from("leads").update({ next_follow_up: "2099-01-02" }).eq("id", leadEnabled),
      service.from("leads").update({ next_follow_up: "2099-01-02" }).eq("id", leadEnabled),
    ]);
    concurrentUpdates.forEach((result, index) => requireData(result, `Concurrent lead update ${index + 1}`));
    const concurrentEvents = await service
      .from("automation_events")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyA)
      .eq("event_type", "lead.updated")
      .eq("source_id", leadEnabled)
      .contains("payload", { next_follow_up: "2099-01-02" });
    requireData(concurrentEvents, "Concurrent event count");
    check(concurrentEvents.count === 1, "Concurrent trigger updates must persist exactly one event");
    const concurrentExecutions = await service
      .from("automation_executions")
      .select("id", { count: "exact", head: true })
      .eq("rule_id", concurrentRuleId);
    requireData(concurrentExecutions, "Concurrent execution count");
    check(concurrentExecutions.count === 1, "Concurrent trigger updates must enqueue exactly one execution");
    check(await countExact(service, "office_tasks", "automation_key", [`regression-concurrent:${leadEnabled}`]) === 1,
      "Concurrent trigger updates must create exactly one internal task");

    requireData(await service.from("estimates").insert({
      id: approvedEstimateId,
      company_id: companyA,
      lead_id: leadEnabled,
      title: marker,
      status: "draft",
      service_type: "roofing",
    }), "Approved estimate fixture");
    requireData(await service.from("estimates").update({ status: "approved" }).eq("id", approvedEstimateId),
      "Approve unscheduled estimate");
    check(await countExact(service, "office_tasks", "automation_key", [`approved_estimate_schedule:${approvedEstimateId}`]) === 1,
      "Approved unscheduled estimate must create exactly one operations handoff task");

    progress("GHL inbound automation binding and Twilio compatibility");
    const communicationRow = ({
      id,
      provider = "gohighlevel",
      connectionId = connectedGhlA,
      phoneId = null,
      leadId = leadEnabled,
      routingStatus = "matched",
      companyId = companyA,
      direction = "inbound",
      eventType = direction === "inbound" ? "sms_inbound" : "sms_status",
      label,
      providerEventSid = `${marker}:${label}`,
    }) => ({
      id,
      company_id: companyId,
      integration_connection_id: connectionId,
      business_phone_number_id: phoneId,
      lead_id: leadId,
      provider,
      provider_event_sid: providerEventSid,
      event_type: eventType,
      channel: "sms",
      direction,
      status: "received",
      routing_status: routingStatus,
      correlation_id: `${marker} ${label}`,
      payload_summary: { synthetic: true },
      response_summary: { synthetic: true },
    });
    const callRow = ({
      id,
      provider = "gohighlevel",
      connectionId = connectedGhlA,
      phoneId = null,
      leadId = leadEnabled,
      companyId = companyA,
      routingStatus = "matched",
      direction = "inbound",
      callStatus = "missed",
      label,
      providerCallSid = `${marker}:${label}`,
    }) => ({
      id,
      company_id: companyId,
      integration_connection_id: connectionId,
      business_phone_number_id: phoneId,
      lead_id: leadId,
      provider,
      provider_call_sid: providerCallSid,
      direction,
      call_status: callStatus,
      routing_status: routingStatus,
      correlation_id: `${marker} ${label}`,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      follow_up_required: callStatus === "missed",
      metadata: { synthetic: true },
    });

    const locatedGhlSms = communicationRow({
      id: communicationSourceIds.ghlLocated,
      label: "GHL SMS LOCATED",
    });
    requireData(
      await service.from("communication_provider_events").insert(locatedGhlSms),
      "Connected GHL inbound SMS",
    );
    let sourceEvents = await loadSourceAutomationEvents(
      service,
      "communication_provider_events",
      communicationSourceIds.ghlLocated,
    );
    check(
      sourceEvents.length === 1 &&
        sourceEvents[0].company_id === companyA &&
        sourceEvents[0].company_location_id === locationA &&
        sourceEvents[0].event_type === "communication.received" &&
        sourceEvents[0].idempotency_key ===
          `communication-provider-event:${communicationSourceIds.ghlLocated}`,
      "Connected matched GHL SMS must emit exactly one lead-located company event",
    );
    requireRefusal(
      await service.from("communication_provider_events").insert({
        ...locatedGhlSms,
        id: randomUUID(),
        correlation_id: `${marker} GHL SMS DUPLICATE REFUSAL`,
      }),
      ["23505"],
      "Duplicate GHL inbound SMS provider identity",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "communication_provider_events",
      communicationSourceIds.ghlLocated,
    );
    check(sourceEvents.length === 1, "Duplicate GHL SMS delivery must leave one automation event");

    const reconciledGhlSms = communicationRow({
      id: communicationSourceIds.ghlReconciled,
      routingStatus: "needs_review",
      leadId: null,
      label: "GHL SMS RECONCILIATION",
    });
    requireData(
      await service.from("communication_provider_events").insert(reconciledGhlSms),
      "Unmatched GHL inbound SMS before reconciliation",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "communication_provider_events",
        communicationSourceIds.ghlReconciled,
      )).length === 0,
      "Unmatched GHL inbound SMS must emit zero automation events before reconciliation",
    );
    requireData(
      await service
        .from("communication_provider_events")
        .update({ routing_status: "matched", lead_id: leadEnabled })
        .eq("id", communicationSourceIds.ghlReconciled),
      "Reconcile GHL inbound SMS to matched",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "communication_provider_events",
      communicationSourceIds.ghlReconciled,
    );
    check(
      sourceEvents.length === 1 &&
        sourceEvents[0].company_id === companyA &&
        sourceEvents[0].company_location_id === locationA &&
        sourceEvents[0].event_type === "communication.received" &&
        sourceEvents[0].idempotency_key ===
          `communication-provider-event:${communicationSourceIds.ghlReconciled}`,
      "GHL inbound SMS needs_review-to-matched reconciliation must emit exactly once",
    );
    requireData(
      await service
        .from("communication_provider_events")
        .update({ routing_status: "matched", lead_id: leadEnabled })
        .eq("id", communicationSourceIds.ghlReconciled),
      "Replay matched GHL inbound SMS reconciliation",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "communication_provider_events",
        communicationSourceIds.ghlReconciled,
      )).length === 1,
      "Repeated eligible GHL SMS reconciliation must remain exactly once",
    );

    for (const [sourceId, row, label] of [
      [
        communicationSourceIds.ghlReconciledPaused,
        communicationRow({
          id: communicationSourceIds.ghlReconciledPaused,
          connectionId: pausedGhlA,
          routingStatus: "needs_review",
          label: "GHL SMS RECONCILIATION PAUSED",
        }),
        "non-connected",
      ],
      [
        communicationSourceIds.ghlReconciledCrossCompany,
        communicationRow({
          id: communicationSourceIds.ghlReconciledCrossCompany,
          connectionId: connectedGhlB,
          routingStatus: "needs_review",
          label: "GHL SMS RECONCILIATION CROSS COMPANY",
        }),
        "cross-company",
      ],
      [
        communicationSourceIds.ghlReconciledOutbound,
        communicationRow({
          id: communicationSourceIds.ghlReconciledOutbound,
          direction: "outbound",
          eventType: "sms_inbound",
          routingStatus: "needs_review",
          label: "GHL SMS RECONCILIATION OUTBOUND",
        }),
        "outbound",
      ],
      [
        communicationSourceIds.ghlReconciledWrongType,
        communicationRow({
          id: communicationSourceIds.ghlReconciledWrongType,
          eventType: "voice_inbound",
          routingStatus: "needs_review",
          label: "GHL SMS RECONCILIATION WRONG TYPE",
        }),
        "wrong-type",
      ],
    ]) {
      requireData(
        await service.from("communication_provider_events").insert(row),
        `Insert ${label} GHL SMS transition fixture`,
      );
      requireData(
        await service
          .from("communication_provider_events")
          .update({ routing_status: "matched", lead_id: leadEnabled })
          .eq("id", sourceId),
        `Attempt ${label} GHL SMS reconciliation`,
      );
      check(
        (await loadSourceAutomationEvents(
          service,
          "communication_provider_events",
          sourceId,
        )).length === 0,
        `${label} GHL SMS needs_review-to-matched update must emit zero automation events`,
      );

      if (label === "non-connected" || label === "cross-company") {
        requireData(
          await service
            .from("communication_provider_events")
            .update({ integration_connection_id: connectedGhlA, lead_id: leadEnabled })
            .eq("id", sourceId),
          `Correct ${label} GHL SMS binding after invalid matched state`,
        );
        sourceEvents = await loadSourceAutomationEvents(
          service,
          "communication_provider_events",
          sourceId,
        );
        check(
          sourceEvents.length === 1 &&
            sourceEvents[0].company_id === companyA &&
            sourceEvents[0].company_location_id === locationA &&
            sourceEvents[0].event_type === "communication.received" &&
            sourceEvents[0].idempotency_key === `communication-provider-event:${sourceId}`,
          `${label} matched GHL SMS must emit exactly once after binding correction`,
        );
        requireData(
          await service
            .from("communication_provider_events")
            .update({ integration_connection_id: connectedGhlA, lead_id: leadEnabled })
            .eq("id", sourceId),
          `Replay corrected ${label} GHL SMS binding`,
        );
        check(
          (await loadSourceAutomationEvents(
            service,
            "communication_provider_events",
            sourceId,
          )).length === 1,
          `${label} corrected GHL SMS replay must remain exactly once`,
        );
      }
    }

    requireData(
      await service.from("communication_provider_events").insert(communicationRow({
        id: communicationSourceIds.ghlNoLocation,
        leadId: leadWithoutLocation,
        label: "GHL SMS NO LOCATION",
      })),
      "Connected GHL inbound SMS without lead location",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "communication_provider_events",
      communicationSourceIds.ghlNoLocation,
    );
    check(
      sourceEvents.length === 1 && sourceEvents[0].company_location_id === null,
      "Connected GHL SMS without an exact lead location must emit once with null location",
    );

    requireData(
      await service.from("communication_provider_events").insert(communicationRow({
        id: communicationSourceIds.ghlOutbound,
        direction: "outbound",
        label: "GHL EXPLICIT OUTBOUND",
      })),
      "Connected explicit outbound GHL SMS",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "communication_provider_events",
        communicationSourceIds.ghlOutbound,
      )).length === 0,
      "Explicit outbound GHL SMS must emit no inbound automation event",
    );

    requireRefusal(
      await service.from("communication_provider_events").insert({
        ...communicationRow({
          id: communicationSourceIds.ghlMissingDirection,
          label: "GHL MISSING DIRECTION",
        }),
        direction: null,
      }),
      ["23502"],
      "Missing GHL direction",
    );
    requireRefusal(
      await service.from("communication_provider_events").insert({
        ...communicationRow({
          id: communicationSourceIds.ghlUnknownDirection,
          label: "GHL UNKNOWN DIRECTION",
        }),
        direction: "sideways",
      }),
      ["23514"],
      "Unrecognized GHL direction",
    );
    for (const sourceId of [
      communicationSourceIds.ghlMissingDirection,
      communicationSourceIds.ghlUnknownDirection,
    ]) {
      check(
        (await loadSourceAutomationEvents(
          service,
          "communication_provider_events",
          sourceId,
        )).length === 0,
        `Rejected missing or unknown GHL direction ${sourceId} must leave zero automation events`,
      );
    }

    const crossCompanyProviderSid = `${marker}:GHL CROSS COMPANY PROVIDER ID`;
    requireData(
      await service.from("communication_provider_events").insert(communicationRow({
        id: communicationSourceIds.ghlIdentityCompanyB,
        companyId: companyB,
        connectionId: connectedGhlB,
        leadId: null,
        routingStatus: "needs_review",
        label: "GHL IDENTITY COMPANY B",
        providerEventSid: crossCompanyProviderSid,
      })),
      "Cross-company GHL provider identity owner",
    );
    requireRefusal(
      await service.from("communication_provider_events").insert(communicationRow({
        id: randomUUID(),
        companyId: companyA,
        connectionId: connectedGhlA,
        label: "GHL IDENTITY COMPANY A COLLISION",
        providerEventSid: crossCompanyProviderSid,
      })),
      ["23505"],
      "Cross-company GHL provider identity collision",
    );
    const preservedIdentity = requireData(
      await service
        .from("communication_provider_events")
        .select("company_id,integration_connection_id")
        .eq("id", communicationSourceIds.ghlIdentityCompanyB)
        .single(),
      "Cross-company GHL provider identity preservation",
    );
    check(
      preservedIdentity.company_id === companyB &&
        preservedIdentity.integration_connection_id === connectedGhlB &&
        (await loadSourceAutomationEvents(
          service,
          "communication_provider_events",
          communicationSourceIds.ghlIdentityCompanyB,
        )).length === 0,
      "Cross-company GHL provider collision must preserve the original binding and emit nothing",
    );

    const locatedGhlCall = callRow({
      id: callSourceIds.ghlLocated,
      label: "GHL MISSED CALL LOCATED",
    });
    requireData(
      await service.from("call_records").insert(locatedGhlCall),
      "Connected GHL missed call",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "call_records",
      callSourceIds.ghlLocated,
    );
    check(
      sourceEvents.length === 1 &&
        sourceEvents[0].company_id === companyA &&
        sourceEvents[0].company_location_id === locationA &&
        sourceEvents[0].event_type === "missed_call.received" &&
        sourceEvents[0].idempotency_key === `missed-call:${callSourceIds.ghlLocated}`,
      "Connected matched GHL missed call must emit exactly one lead-located company event",
    );
    requireData(
      await service.from("call_records").update({ call_status: "missed" }).eq("id", callSourceIds.ghlLocated),
      "GHL missed-call replay update",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "call_records",
      callSourceIds.ghlLocated,
    );
    check(sourceEvents.length === 1, "GHL missed-call replay update must remain exactly once");

    const reconciledGhlCall = callRow({
      id: callSourceIds.ghlReconciled,
      routingStatus: "needs_review",
      leadId: null,
      label: "GHL MISSED CALL RECONCILIATION",
    });
    requireData(
      await service.from("call_records").insert(reconciledGhlCall),
      "Unmatched GHL missed call before reconciliation",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "call_records",
        callSourceIds.ghlReconciled,
      )).length === 0,
      "Missed + needs_review GHL call must emit zero events before reconciliation",
    );
    requireData(
      await service
        .from("call_records")
        .update({ routing_status: "matched", lead_id: leadEnabled })
        .eq("id", callSourceIds.ghlReconciled),
      "Reconcile GHL missed call to matched",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "call_records",
      callSourceIds.ghlReconciled,
    );
    check(
      sourceEvents.length === 1 &&
        sourceEvents[0].company_id === companyA &&
        sourceEvents[0].company_location_id === locationA &&
        sourceEvents[0].event_type === "missed_call.received" &&
        sourceEvents[0].idempotency_key === `missed-call:${callSourceIds.ghlReconciled}`,
      "GHL missed + needs_review-to-matched reconciliation must emit exactly once",
    );
    requireData(
      await service
        .from("call_records")
        .update({ call_status: "missed", routing_status: "matched", lead_id: leadEnabled })
        .eq("id", callSourceIds.ghlReconciled),
      "Replay matched GHL missed-call reconciliation",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "call_records",
        callSourceIds.ghlReconciled,
      )).length === 1,
      "Repeated eligible GHL missed-call reconciliation must remain exactly once",
    );

    for (const [sourceId, row, label] of [
      [
        callSourceIds.ghlReconciledPaused,
        callRow({
          id: callSourceIds.ghlReconciledPaused,
          connectionId: pausedGhlA,
          routingStatus: "needs_review",
          label: "GHL MISSED CALL RECONCILIATION PAUSED",
        }),
        "non-connected",
      ],
      [
        callSourceIds.ghlReconciledCrossCompany,
        callRow({
          id: callSourceIds.ghlReconciledCrossCompany,
          connectionId: connectedGhlB,
          routingStatus: "needs_review",
          label: "GHL MISSED CALL RECONCILIATION CROSS COMPANY",
        }),
        "cross-company",
      ],
      [
        callSourceIds.ghlReconciledOutbound,
        callRow({
          id: callSourceIds.ghlReconciledOutbound,
          direction: "outbound",
          routingStatus: "needs_review",
          label: "GHL MISSED CALL RECONCILIATION OUTBOUND",
        }),
        "outbound",
      ],
      [
        callSourceIds.ghlReconciledCompleted,
        callRow({
          id: callSourceIds.ghlReconciledCompleted,
          callStatus: "completed",
          routingStatus: "needs_review",
          label: "GHL COMPLETED CALL RECONCILIATION",
        }),
        "not-missed",
      ],
    ]) {
      requireData(
        await service.from("call_records").insert(row),
        `Insert ${label} GHL call transition fixture`,
      );
      requireData(
        await service
          .from("call_records")
          .update({ routing_status: "matched", lead_id: leadEnabled })
          .eq("id", sourceId),
        `Attempt ${label} GHL call reconciliation`,
      );
      check(
        (await loadSourceAutomationEvents(service, "call_records", sourceId)).length === 0,
        `${label} GHL call needs_review-to-matched update must emit zero automation events`,
      );

      if (label === "non-connected" || label === "cross-company") {
        requireData(
          await service
            .from("call_records")
            .update({ integration_connection_id: connectedGhlA, lead_id: leadEnabled })
            .eq("id", sourceId),
          `Correct ${label} GHL missed-call binding after invalid matched state`,
        );
        sourceEvents = await loadSourceAutomationEvents(service, "call_records", sourceId);
        check(
          sourceEvents.length === 1 &&
            sourceEvents[0].company_id === companyA &&
            sourceEvents[0].company_location_id === locationA &&
            sourceEvents[0].event_type === "missed_call.received" &&
            sourceEvents[0].idempotency_key === `missed-call:${sourceId}`,
          `${label} matched GHL missed call must emit exactly once after binding correction`,
        );
        requireData(
          await service
            .from("call_records")
            .update({ integration_connection_id: connectedGhlA, lead_id: leadEnabled })
            .eq("id", sourceId),
          `Replay corrected ${label} GHL missed-call binding`,
        );
        check(
          (await loadSourceAutomationEvents(service, "call_records", sourceId)).length === 1,
          `${label} corrected GHL missed-call replay must remain exactly once`,
        );
      }
    }

    requireRefusal(
      await service.from("call_records").insert({
        ...locatedGhlCall,
        id: randomUUID(),
        correlation_id: `${marker} GHL CALL DUPLICATE REFUSAL`,
      }),
      ["23505"],
      "Duplicate GHL missed-call provider identity",
    );

    requireData(await service.from("communication_provider_events").insert([
      communicationRow({
        id: communicationSourceIds.ghlPaused,
        connectionId: pausedGhlA,
        label: "GHL PAUSED BINDING",
      }),
      communicationRow({
        id: communicationSourceIds.ghlUnmatched,
        routingStatus: "needs_review",
        label: "GHL UNMATCHED",
      }),
      communicationRow({
        id: communicationSourceIds.ghlWrongProvider,
        connectionId: twilioConnectionA,
        label: "GHL WRONG PROVIDER BINDING",
      }),
    ]), "Rejected GHL SMS binding fixtures");
    requireData(await service.from("call_records").insert([
      callRow({
        id: callSourceIds.ghlCrossCompany,
        connectionId: connectedGhlB,
        label: "GHL CROSS COMPANY BINDING",
      }),
      callRow({
        id: callSourceIds.ghlMissingBinding,
        connectionId: null,
        label: "GHL MISSING BINDING",
      }),
    ]), "Rejected GHL missed-call binding fixtures");
    for (const sourceId of [
      communicationSourceIds.ghlPaused,
      communicationSourceIds.ghlUnmatched,
      communicationSourceIds.ghlWrongProvider,
    ]) {
      check(
        (await loadSourceAutomationEvents(service, "communication_provider_events", sourceId)).length === 0,
        `Invalid GHL SMS binding ${sourceId} must emit no automation event`,
      );
    }
    for (const sourceId of [
      callSourceIds.ghlCrossCompany,
      callSourceIds.ghlMissingBinding,
    ]) {
      check(
        (await loadSourceAutomationEvents(service, "call_records", sourceId)).length === 0,
        `Invalid GHL call binding ${sourceId} must emit no automation event`,
      );
    }

    requireData(await service.from("communication_provider_events").insert([
      communicationRow({
        id: communicationSourceIds.twilioActive,
        provider: "twilio_sms",
        connectionId: twilioConnectionA,
        phoneId: activePhoneA,
        label: "TWILIO ACTIVE ROUTE",
      }),
      communicationRow({
        id: communicationSourceIds.twilioReconciled,
        provider: "twilio_sms",
        connectionId: twilioConnectionA,
        phoneId: activePhoneA,
        routingStatus: "needs_review",
        leadId: null,
        label: "TWILIO SMS ROUTING RECONCILIATION",
      }),
      communicationRow({
        id: communicationSourceIds.twilioMissingPhone,
        provider: "twilio_sms",
        connectionId: twilioConnectionA,
        phoneId: null,
        label: "TWILIO MISSING PHONE ROUTE",
      }),
      communicationRow({
        id: communicationSourceIds.twilioInactivePhone,
        provider: "twilio_sms",
        connectionId: twilioConnectionA,
        phoneId: inactivePhoneA,
        label: "TWILIO INACTIVE PHONE ROUTE",
      }),
    ]), "Twilio SMS compatibility fixtures");
    requireData(await service.from("call_records").insert([
      callRow({
        id: callSourceIds.twilioActive,
        provider: "twilio",
        connectionId: twilioConnectionA,
        phoneId: activePhoneA,
        label: "TWILIO ACTIVE CALL ROUTE",
      }),
      callRow({
        id: callSourceIds.twilioReconciled,
        provider: "twilio",
        connectionId: twilioConnectionA,
        phoneId: activePhoneA,
        routingStatus: "needs_review",
        leadId: null,
        label: "TWILIO MISSED CALL ROUTING RECONCILIATION",
      }),
      callRow({
        id: callSourceIds.twilioStatusTransition,
        provider: "twilio",
        connectionId: twilioConnectionA,
        phoneId: activePhoneA,
        callStatus: "incoming",
        label: "TWILIO CALL STATUS TRANSITION",
      }),
      callRow({
        id: callSourceIds.twilioCrossCompanyPhone,
        provider: "twilio",
        connectionId: twilioConnectionA,
        phoneId: activePhoneB,
        label: "TWILIO CROSS COMPANY PHONE ROUTE",
      }),
    ]), "Twilio call compatibility fixtures");
    for (const [sourceTable, sourceId, eventType] of [
      ["communication_provider_events", communicationSourceIds.twilioActive, "communication.received"],
      ["call_records", callSourceIds.twilioActive, "missed_call.received"],
    ]) {
      sourceEvents = await loadSourceAutomationEvents(service, sourceTable, sourceId);
      check(
        sourceEvents.length === 1 &&
          sourceEvents[0].event_type === eventType &&
          sourceEvents[0].company_location_id === locationA,
        `Active exact-company Twilio source ${sourceId} must retain its existing automation route`,
      );
    }

    for (const [sourceTable, sourceId] of [
      ["communication_provider_events", communicationSourceIds.twilioReconciled],
      ["call_records", callSourceIds.twilioReconciled],
      ["call_records", callSourceIds.twilioStatusTransition],
    ]) {
      check(
        (await loadSourceAutomationEvents(service, sourceTable, sourceId)).length === 0,
        `Pre-transition Twilio source ${sourceId} must emit zero automation events`,
      );
    }

    requireData(
      await service
        .from("communication_provider_events")
        .update({ routing_status: "matched", lead_id: leadEnabled })
        .eq("id", communicationSourceIds.twilioReconciled),
      "Attempt Twilio SMS needs_review-to-matched reconciliation",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "communication_provider_events",
        communicationSourceIds.twilioReconciled,
      )).length === 0,
      "Twilio SMS needs_review-to-matched update must preserve insert-only behavior",
    );

    requireData(
      await service
        .from("call_records")
        .update({ routing_status: "matched", lead_id: leadEnabled })
        .eq("id", callSourceIds.twilioReconciled),
      "Attempt Twilio missed-call needs_review-to-matched reconciliation",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "call_records",
        callSourceIds.twilioReconciled,
      )).length === 0,
      "Twilio missed plus needs_review-to-matched routing update must emit zero events",
    );

    requireData(
      await service
        .from("call_records")
        .update({ call_status: "missed" })
        .eq("id", callSourceIds.twilioStatusTransition),
      "Transition matched Twilio call status to missed",
    );
    sourceEvents = await loadSourceAutomationEvents(
      service,
      "call_records",
      callSourceIds.twilioStatusTransition,
    );
    check(
      sourceEvents.length === 1 &&
        sourceEvents[0].company_id === companyA &&
        sourceEvents[0].company_location_id === locationA &&
        sourceEvents[0].event_type === "missed_call.received" &&
        sourceEvents[0].idempotency_key === `missed-call:${callSourceIds.twilioStatusTransition}`,
      "Twilio non-missed-to-missed status transition must emit exactly once",
    );
    requireData(
      await service
        .from("call_records")
        .update({ call_status: "missed" })
        .eq("id", callSourceIds.twilioStatusTransition),
      "Replay Twilio missed-call status transition",
    );
    check(
      (await loadSourceAutomationEvents(
        service,
        "call_records",
        callSourceIds.twilioStatusTransition,
      )).length === 1,
      "Repeated Twilio missed status update must remain exactly once",
    );
    for (const [sourceTable, sourceId] of [
      ["communication_provider_events", communicationSourceIds.twilioMissingPhone],
      ["communication_provider_events", communicationSourceIds.twilioInactivePhone],
      ["call_records", callSourceIds.twilioCrossCompanyPhone],
    ]) {
      check(
        (await loadSourceAutomationEvents(service, sourceTable, sourceId)).length === 0,
        `Invalid Twilio phone route ${sourceId} must emit no automation event`,
      );
    }

    requireRefusal(await service.from("automation_events").insert({
      company_id: companyA, company_location_id: locationB, event_type: "lead.created",
      source_table: "leads", source_id: leadEnabled, source_version: "cross-company",
      idempotency_key: `cross-company:${runId}`, payload: { status: "new" },
    }), ["23503", "23514"], "Cross-company event location");

    const pendingEventId = randomUUID();
    const pendingExecutionId = randomUUID();
    capturedEventIds.push(pendingEventId);
    capturedExecutionIds.push(pendingExecutionId);
    requireData(await service.from("automation_events").insert({
      id: pendingEventId, company_id: companyA, company_location_id: locationA,
      event_type: "lead.created", source_table: "leads", source_id: leadEnabled,
      source_version: "pending-disable", idempotency_key: `pending-disable:${runId}`,
      payload: { status: "new", lead_id: leadEnabled },
    }), "Pending-disable event");
    requireData(await service.from("automation_executions").insert({
      id: pendingExecutionId, company_id: companyA, company_location_id: locationA,
      rule_id: newLeadRuleId, event_id: pendingEventId, rule_version: 3,
      action_type: "create_office_task", action_config_snapshot: toggled.action_config,
      action_input: {
        automation_key: `pending-disabled:${leadEnabled}`, source_type: "new_lead",
        title: marker, priority: "normal", due_at: new Date().toISOString(), lead_id: leadEnabled,
      }, status: "queued", approval_status: "not_required", max_attempts: 2,
      idempotency_key: `pending-disabled:${runId}`,
    }), "Pending-disable execution");
    toggled = requireData(await owner.rpc("wtos_set_automation_rule_enabled_v1", {
      p_rule_id: newLeadRuleId, p_expected_version: 3, p_enabled: false,
      p_reason: "Disable after enqueue before worker.",
    }), "Disable queued rule");
    const cancelled = requireData(await service.from("automation_executions").select("status").eq("id", pendingExecutionId).single(), "Cancelled execution read");
    check(cancelled.status === "cancelled", "Disabling rule must cancel queued execution");
    check(await countExact(service, "office_tasks", "automation_key", [`pending-disabled:${leadEnabled}`]) === 0,
      "Cancelled queued execution must create no task");

    requireData(await service.from("leads").insert(baseLead(leadDue, "DUE")), "Due-task lead");
    const now = new Date();
    const futureSnooze = new Date(now.getTime() + 3_600_000);
    requireData(await service.from("office_tasks").insert({
      id: dueTaskId, company_id: companyA, company_location_id: locationA,
      lead_id: leadDue, source_type: "new_lead", automation_key: `manual-due:${runId}`,
      title: marker, priority: "high", due_at: new Date(now.getTime() - 3_600_000).toISOString(),
      status: "snoozed", snoozed_until: futureSnooze.toISOString(),
    }), "Snoozed due task");
    let worker = requireData(await service.rpc("wtos_run_automation_worker_v1", {
      p_worker_now: now.toISOString(), p_batch_size: 25,
    }), "Worker before snooze expiry");
    check(worker.dueEventsRecorded === 0, "Future snooze must not emit task.due early");
    worker = requireData(await service.rpc("wtos_run_automation_worker_v1", {
      p_worker_now: new Date(futureSnooze.getTime() + 1000).toISOString(), p_batch_size: 25,
    }), "Worker after snooze expiry");
    check(worker.dueEventsRecorded === 1, "Expired snooze must emit one task.due event");
    worker = requireData(await service.rpc("wtos_run_automation_worker_v1", {
      p_worker_now: new Date(futureSnooze.getTime() + 2000).toISOString(), p_batch_size: 25,
    }), "Idempotent due worker replay");
    check(worker.dueEventsRecorded === 0, "Repeated due scan must emit no duplicate event");

    const failureEventId = randomUUID();
    const failureExecutionId = randomUUID();
    capturedEventIds.push(failureEventId);
    capturedExecutionIds.push(failureExecutionId);
    progress("due-event idempotency and bounded retries");
    const failureRuleRecord = requireData(await service.from("automation_rules").select("version,action_config").eq("id", failureRuleId).single(), "Failure rule read");
    requireData(await service.from("automation_events").insert({
      id: failureEventId, company_id: companyA, company_location_id: locationA,
      event_type: "communication.received", source_table: "communication_provider_events", source_id: randomUUID(),
      source_version: "failure", idempotency_key: `failure:${runId}`, payload: { status: "new" },
    }), "Failure event");
    requireData(await service.from("automation_executions").insert({
      id: failureExecutionId, company_id: companyA, company_location_id: locationA,
      rule_id: failureRuleId, event_id: failureEventId, rule_version: failureRuleRecord.version,
      action_type: "create_office_task", action_config_snapshot: failureRuleRecord.action_config,
      action_input: {
        automation_key: `forced-failure:${runId}`, source_type: "new_lead",
        title: marker, priority: "normal", due_at: now.toISOString(), lead_id: randomUUID(),
      }, status: "queued", approval_status: "not_required", max_attempts: 2,
      idempotency_key: `forced-failure:${runId}`,
    }), "Failure execution");
    const firstFailureWorkerTime = new Date(Date.now() + 5_000);
    requireData(await service.rpc("wtos_run_automation_worker_v1", { p_worker_now: firstFailureWorkerTime.toISOString(), p_batch_size: 25 }), "First failure attempt");
    let failedExecution = requireData(await service.from("automation_executions").select("status,version,attempt_count").eq("id", failureExecutionId).single(), "Retry state");
    check(failedExecution.status === "retry_scheduled" && failedExecution.attempt_count === 1,
      "First safe failure must schedule retry");
    requireData(await service.rpc("wtos_run_automation_worker_v1", { p_worker_now: new Date(firstFailureWorkerTime.getTime() + 120_000).toISOString(), p_batch_size: 25 }), "Terminal failure attempt");
    failedExecution = requireData(await service.from("automation_executions").select("status,version,attempt_count").eq("id", failureExecutionId).single(), "Terminal failure state");
    check(failedExecution.status === "failed" && failedExecution.attempt_count === 2,
      "Bounded retries must reach terminal failed state");
    failedExecution = requireData(await owner.rpc("wtos_retry_automation_execution_v1", {
      p_execution_id: failureExecutionId, p_expected_version: failedExecution.version,
      p_reason: "Synthetic bounded manual retry.",
    }), "Manual terminal retry");
    check(failedExecution.status === "queued", "Owner manual retry must requeue terminal failure");
    requireData(await service.rpc("wtos_run_automation_worker_v1", { p_worker_now: new Date(firstFailureWorkerTime.getTime() + 600_000).toISOString(), p_batch_size: 25 }), "Manual retry worker");
    failedExecution = requireData(await service.from("automation_executions").select("status,attempt_count").eq("id", failureExecutionId).single(), "Manual retry terminal state");
    check(failedExecution.status === "failed" && failedExecution.attempt_count === 3,
      "Manual retry remains bounded and terminal");

    progress("atomic AI quota and reviewed internal action");
    const quotaRequestId = randomUUID();
    const promptHash = createHash("sha256").update(`${marker}:quota`).digest("hex");
    const quotaRequest = {
      contractVersion: 1, provider: "disabled", model: null,
      promptSha256: promptHash, promptCharacters: 120, estimatedRequestTokens: 60,
      maxResponseTokens: 100, estimatedCostCents: 0, maxProviderAttempts: 1,
      globalDailyRequestLimit: 10000, companyDailyRequestLimit: 100,
      userDailyRequestLimit: 100, dailyBudgetCents: 10000,
      companyMonthlyBudgetCents: 10000, maxRequestTokens: 1000,
    };
    quotaRequest.estimatedCostCents = 3;
    quotaRequest.maxProviderAttempts = 3;
    const concurrentReservations = (await Promise.all([
      service.rpc("wtos_reserve_ai_request_v1", {
        p_company_id: companyA, p_actor_user_id: ownerId, p_request_id: quotaRequestId,
        p_request: quotaRequest,
      }),
      service.rpc("wtos_reserve_ai_request_v1", {
        p_company_id: companyA, p_actor_user_id: ownerId, p_request_id: quotaRequestId,
        p_request: quotaRequest,
      }),
    ])).map((result, index) => requireData(result, `Concurrent AI quota reservation ${index + 1}`));
    const reservationIds = new Set(concurrentReservations.map((item) => item.requestAuditEventId));
    check(reservationIds.size === 1, "Concurrent exact quota requests must resolve one durable reservation");
    check(concurrentReservations.filter((item) => item.idempotent === false).length === 1,
      "Concurrent quota reservation must insert exactly once");
    let reservation = concurrentReservations[0];
    capturedAuditIds.push(reservation.requestAuditEventId);
    check(
      reservation.status === "reserved" &&
        reservation.requestId === quotaRequestId &&
        reservation.companyId === companyA &&
        reservation.actorUserId === ownerId &&
        reservation.provider === quotaRequest.provider &&
        reservation.model === quotaRequest.model &&
        reservation.estimatedCostCents === quotaRequest.estimatedCostCents &&
        reservation.maxProviderAttempts === quotaRequest.maxProviderAttempts &&
        reservation.reservedCostCentsToday >= quotaRequest.estimatedCostCents &&
        reservation.companyReservedCostCentsThisMonth >= quotaRequest.estimatedCostCents,
      "Quota receipt must bind exact request identity and conservative cost",
    );
    reservation = requireData(await service.rpc("wtos_reserve_ai_request_v1", {
      p_company_id: companyA, p_actor_user_id: ownerId, p_request_id: quotaRequestId,
      p_request: quotaRequest,
    }), "AI quota replay");
    check(reservation.idempotent === true, "Exact quota transport replay must be idempotent");
    const reservationCount = await service
      .from("ai_audit_events")
      .select("id", { count: "exact", head: true })
      .contains("metadata", { requestId: quotaRequestId });
    requireData(reservationCount, "AI reservation exact-once count");
    check(reservationCount.count === 1, "Concurrent exact quota replay must persist one canonical request row");
    requireRefusal(await service.rpc("wtos_reserve_ai_request_v1", {
      p_company_id: companyA, p_actor_user_id: ownerId, p_request_id: quotaRequestId,
      p_request: { ...quotaRequest, promptSha256: "0".repeat(64) },
    }), ["23505"], "Conflicting quota replay");
    const malformedQuotaRequest = { ...quotaRequest };
    delete malformedQuotaRequest.companyMonthlyBudgetCents;
    requireRefusal(await service.rpc("wtos_reserve_ai_request_v1", {
      p_company_id: companyA, p_actor_user_id: ownerId, p_request_id: randomUUID(),
      p_request: malformedQuotaRequest,
    }), ["22023"], "Malformed quota reservation");
    requireRefusal(await viewer.rpc("wtos_reserve_ai_request_v1", {
      p_company_id: companyA, p_actor_user_id: viewerUserId, p_request_id: randomUUID(),
      p_request: quotaRequest,
    }), ["42501", "PGRST202"], "Browser quota reservation");
    requireRefusal(await viewer.from("ai_audit_events").insert({
      company_id: companyA, actor_user_id: viewerUserId, task_type: "command",
      event_type: "action_proposed", provider: "disabled", source_records: [],
      action_type: "create_follow_up_draft", action_preview: {}, status: "pending_review",
      safety_flags: [], metadata: {},
    }), ["42501"], "Authenticated forged AI audit row");

    progress("Mighty Apes campaign registry isolation");
    const ihcCompany = requireData(await service
      .from("companies")
      .select("id")
      .eq("name", "IHC Painting")
      .eq("trade", "painting")
      .single(), "Exact IHC company route target");
    const ihcLocation = requireData(await service
      .from("company_locations")
      .select("id")
      .eq("company_id", ihcCompany.id)
      .eq("location_key", "ihc")
      .single(), "Exact IHC location route target");
    requireData(await service.from("mighty_apes_campaign_routes").insert({
      id: mightyApesRouteId,
      campaign_yelp_id: mightyApesCampaignId,
      company_id: ihcCompany.id,
      company_location_id: ihcLocation.id,
      company_key: "ihc_painting",
      branch_key: "ihc",
      assigned_queue: "ihc-painting",
      service_type: "painting",
      enabled: true,
      authorized_at: new Date().toISOString(),
    }), "Synthetic authorized Mighty Apes route");
    const viewerCampaignRoutes = requireData(
      await viewer.from("mighty_apes_campaign_routes").select("id"),
      "Viewer Mighty Apes route visibility",
    );
    check(!viewerCampaignRoutes.some((route) => route.id === mightyApesRouteId),
      "Viewer must not read campaign authorization routes");
    const mightyNow = new Date();
    const mightyRequest = {
      version: 1,
      event: "lead.test",
      delivery_id: mightyApesDeliveryId,
      payload_fingerprint: createHash("sha256").update(`${marker}:mighty-apes`).digest("hex"),
      header_timestamp: Math.floor(mightyNow.getTime() / 1000),
      received_at: mightyNow.toISOString(),
      campaign: { yelp_id: mightyApesCampaignId, name: `${marker} IHC` },
      lead: {
        id: mightyApesLeadId,
        name: `${marker} TEST LEAD`,
        phone: "+14805550199",
        zip_code: "85250",
        job_category: "painting",
        message: "Synthetic audit-only campaign route test.",
        created_at: mightyNow.toISOString(),
      },
    };
    const mightyReceipt = requireData(await service.rpc("wtos_ingest_mighty_apes_yelp", {
      intake_request: mightyRequest,
    }), "Authorized IHC lead.test audit");
    check(
      mightyReceipt.status === "test_accepted" &&
        mightyReceipt.lead_id === null &&
        mightyReceipt.intake_record_id === null,
      "Authorized lead.test must remain audit-only",
    );
    check(await countExact(service, "mighty_apes_yelp_webhook_events", "delivery_id", [mightyApesDeliveryId]) === 1,
      "Authorized lead.test must persist one audit event");
    requireData(await service.from("mighty_apes_campaign_routes").update({ enabled: false, version: 2 }).eq("id", mightyApesRouteId),
      "Disable synthetic Mighty Apes route");
    requireRefusal(await service.rpc("wtos_ingest_mighty_apes_yelp", {
      intake_request: {
        ...mightyRequest,
        delivery_id: `${mightyApesDeliveryId}:disabled`,
        lead: { ...mightyRequest.lead, id: `${mightyApesLeadId}:disabled` },
      },
    }), ["42501"], "Disabled Mighty Apes campaign");
    requireRefusal(await service.rpc("wtos_ingest_mighty_apes_yelp", {
      intake_request: {
        ...mightyRequest,
        delivery_id: `${mightyApesDeliveryId}:unknown`,
        campaign: { ...mightyRequest.campaign, yelp_id: `${mightyApesCampaignId}-UNKNOWN` },
        lead: { ...mightyRequest.lead, id: `${mightyApesLeadId}:unknown` },
      },
    }), ["42501"], "Unknown Mighty Apes campaign");

    const previewId = randomUUID();
    const preview = {
      id: `preview-${runId}`, actionType: "create_follow_up_draft",
      targetRecord: { table: "leads", id: leadEnabled, companyId: companyA },
      companyId: companyA, reason: "Synthetic internal follow-up.",
      before: { status: "unchanged" }, after: { status: "preview_only" },
      fieldsAffected: ["draft_preview"], requiredPermission: "authorized internal user",
      confirmationRequired: true, providerDependency: "disabled",
      auditReference: `pending:${runId}`, status: "blocked_requires_confirmation",
    };
    requireData(await service.from("ai_audit_events").insert({
      id: previewId, company_id: companyA, actor_user_id: ownerId, task_type: "command",
      event_type: "action_proposed", provider: "disabled", source_records: [],
      action_type: "create_follow_up_draft", action_preview: preview,
      status: "pending_review", safety_flags: [],
      metadata: { contractVersion: 1, requestAuditEventId: reservation.requestAuditEventId },
    }), "Trusted AI action preview");
    capturedAuditIds.push(previewId);
    const fingerprint = requireData(await owner.rpc("wtos_ai_action_preview_fingerprint_v1", {
      p_action_preview: preview, p_contract_version: 1,
    }), "AI preview fingerprint");
    let review = requireData(await owner.rpc("wtos_review_ai_action_v1", {
      p_ai_audit_event_id: previewId, p_decision: "approve",
      p_expected_action_type: "create_follow_up_draft",
      p_expected_payload_sha256: fingerprint, p_expected_contract_version: 1,
      p_reason: "Synthetic owner approval.",
    }), "Approved AI follow-up");
    check(review.executionStatus === "succeeded" && Boolean(review.officeTaskId),
      "Approved follow-up must atomically create one internal task");
    review = requireData(await owner.rpc("wtos_review_ai_action_v1", {
      p_ai_audit_event_id: previewId, p_decision: "approve",
      p_expected_action_type: "create_follow_up_draft",
      p_expected_payload_sha256: fingerprint, p_expected_contract_version: 1,
      p_reason: "Synthetic owner approval.",
    }), "AI review replay");
    check(review.idempotent === true, "Exact AI review replay must be idempotent");
    requireRefusal(await owner.rpc("wtos_review_ai_action_v1", {
      p_ai_audit_event_id: previewId, p_decision: "reject",
      p_expected_action_type: "create_follow_up_draft",
      p_expected_payload_sha256: fingerprint, p_expected_contract_version: 1,
      p_reason: "Conflicting review.",
    }), ["P0001"], "Conflicting AI review");

    const untrustedPreviewId = randomUUID();
    requireData(await service.from("ai_audit_events").insert({
      id: untrustedPreviewId, company_id: companyA, actor_user_id: ownerId,
      task_type: "command", event_type: "action_proposed", provider: "disabled",
      source_records: [], action_type: "create_follow_up_draft", action_preview: preview,
      status: "pending_review", safety_flags: [], metadata: { contractVersion: 1 },
    }), "Untrusted preview fixture");
    capturedAuditIds.push(untrustedPreviewId);
    requireRefusal(await owner.rpc("wtos_review_ai_action_v1", {
      p_ai_audit_event_id: untrustedPreviewId, p_decision: "reject",
      p_expected_action_type: "create_follow_up_draft",
      p_expected_payload_sha256: fingerprint, p_expected_contract_version: 1,
      p_reason: "Must not trust unreserved preview.",
    }), ["55000"], "Unreserved AI preview review");

    progress("immutable ledger and exact cleanup");
    const immutableEventId = pendingEventId;
    requireRefusal(await service.from("automation_events").delete().eq("id", immutableEventId),
      ["55000"], "Direct immutable ledger delete");

    check(network.counters.providerNetworkRequests === 0,
      "Automation regression must make zero provider network requests");
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    for (const operation of [
      async () => service.from("communication_provider_events").delete().in(
        "id",
        Object.values(communicationSourceIds),
      ),
      async () => service.from("call_records").delete().in("id", Object.values(callSourceIds)),
      async () => service.from("lead_accountability_events").delete().in(
        "lead_id",
        [leadDisabled, leadEnabled, leadDue, leadWithoutLocation],
      ),
      async () => service.from("lead_accountability").delete().in(
        "lead_id",
        [leadDisabled, leadEnabled, leadDue, leadWithoutLocation],
      ),
      async () => service.from("office_tasks").delete().in("company_id", [companyA, companyB]),
      async () => service.from("mighty_apes_yelp_webhook_events").delete().in("delivery_id", [mightyApesDeliveryId]),
      async () => service.from("mighty_apes_campaign_routes").delete().eq("id", mightyApesRouteId),
      async () => service.from("estimates").delete().in("id", [approvedEstimateId]),
      async () => service.from("leads").delete().in(
        "id",
        [leadDisabled, leadEnabled, leadDue, leadWithoutLocation],
      ),
      async () => service.auth.admin.deleteUser(viewerUserId),
      async () => service.from("companies").delete().in("id", [companyA, companyB]),
    ]) {
      try {
        const result = await operation();
        if (result.error && result.error.code !== "PGRST116") cleanupErrors.push(result.error);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    try {
      const residueCounts = await Promise.all([
        countExact(service, "companies", "id", [companyA, companyB]),
        countExact(service, "company_locations", "company_id", [companyA, companyB]),
        countExact(service, "automation_rules", "company_id", [companyA, companyB]),
        countExact(service, "automation_events", "company_id", [companyA, companyB]),
        countExact(service, "automation_executions", "company_id", [companyA, companyB]),
        countExact(service, "automation_attempts", "company_id", [companyA, companyB]),
        countExact(service, "automation_audit_events", "company_id", [companyA, companyB]),
        countExact(service, "ai_audit_events", "company_id", [companyA, companyB]),
        countExact(service, "office_tasks", "company_id", [companyA, companyB]),
        countExact(service, "leads", "company_id", [companyA, companyB]),
        countExact(
          service,
          "communication_provider_events",
          "id",
          Object.values(communicationSourceIds),
        ),
        countExact(service, "call_records", "id", Object.values(callSourceIds)),
        countExact(
          service,
          "integration_connections",
          "id",
          [connectedGhlA, pausedGhlA, connectedGhlB, twilioConnectionA],
        ),
        countExact(
          service,
          "business_phone_numbers",
          "id",
          [activePhoneA, inactivePhoneA, activePhoneB],
        ),
        countExact(service, "mighty_apes_campaign_routes", "id", [mightyApesRouteId]),
        countExact(service, "mighty_apes_yelp_webhook_events", "delivery_id", [mightyApesDeliveryId]),
      ]);
      cleanupResidue = residueCounts.reduce((sum, count) => sum + count, 0);
      if (cleanupResidue !== 0) cleanupErrors.push(new Error(`Exact cleanup residue is ${cleanupResidue}.`));
      await runRegressionEnvironmentCommand({ command: "verify-residue", env: environment, fetchImpl: network.fetch });
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (cleanupErrors.length > 0) {
      if (primaryError) {
        throw new AggregateError([primaryError, ...cleanupErrors], "Automation regression and exact cleanup failed.");
      }
      throw new AggregateError(cleanupErrors, "Automation regression exact cleanup failed.");
    }
  }

  if (primaryError) throw primaryError;
  return {
    result: "PASS",
    target: config.projectRef,
    assertions,
    providerNetworkRequests: network.counters.providerNetworkRequests,
    cleanupResidue,
    parentCompanyCascadeVerified: true,
  };
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runAutomationEngineRegression({ cwd: process.cwd() })
    .then((report) => {
      console.log("Automation engine hosted regression: PASS");
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(`Automation engine hosted regression: FAIL: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
