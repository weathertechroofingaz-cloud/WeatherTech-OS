#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadAutomationRegressionEnvironment } from "./automation-engine-regression.mjs";

export const GHL_WEBHOOK_REGRESSION_RUN = "WTOS_GHL_WEBHOOK_REGRESSION_RUN";

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireData(result, label) {
  if (result.error) throw new Error(`${label} failed: ${result.error.message}`);
  return result.data;
}

function requireRefusal(result, codes, label) {
  if (!result.error) throw new Error(`${label} unexpectedly succeeded.`);
  const code = String(result.error.code ?? "");
  if (!codes.includes(code)) {
    throw new Error(`${label} returned ${code || "no code"}; expected ${codes.join(" or ")}.`);
  }
}

function createNetworkGuard(fetchImpl, allowedOrigin) {
  const counters = { supabaseRequests: 0, providerRequests: 0 };
  const fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? String(input) : input.url,
    );
    if (url.origin !== allowedOrigin) {
      counters.providerRequests += 1;
      throw new Error(`GHL webhook regression blocked non-Supabase origin ${url.origin}.`);
    }
    counters.supabaseRequests += 1;
    return fetchImpl(input, {
      ...init,
      signal: init?.signal
        ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000),
    });
  };
  return { counters, fetch };
}

function createClientWithKey(url, key, fetch) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch },
  });
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function claimRequest({
  companyId,
  connectionId,
  webhookId,
  payloadSha256,
  externalLocationId,
  eventType = "InboundMessage",
}) {
  return {
    p_claim: {
      contractVersion: 1,
      maxAttempts: 13,
      companyId,
      integrationConnectionId: connectionId,
      webhookId,
      eventType,
      externalLocationId,
      externalContactId: `TEST-CONTACT-${webhookId}`,
      externalConversationId: null,
      externalMessageId: `TEST-MESSAGE-${webhookId}`,
      signatureVersion: "ed25519",
      payloadSha256,
      payloadSummary: {
        type: eventType,
        locationId: externalLocationId,
        bodyPreview: null,
      },
      occurredAt: new Date().toISOString(),
    },
  };
}

function requireClaimReceipt(result, disposition, label) {
  const receipt = requireData(result, label);
  requireCondition(receipt?.contractVersion === 1, `${label} contract mismatch.`);
  requireCondition(receipt?.disposition === disposition, `${label} disposition mismatch.`);
  requireCondition(typeof receipt?.eventId === "string", `${label} event ID missing.`);
  requireCondition(typeof receipt?.payloadSha256 === "string", `${label} SHA missing.`);
  if (disposition === "claimed") {
    requireCondition(typeof receipt.claimToken === "string", `${label} claim token missing.`);
    requireCondition(receipt.processingStatus === "received", `${label} must be received.`);
  }
  return receipt;
}

function transitionRequest(claim, status, errorMessage = null) {
  return {
    p_event_id: claim.eventId,
    p_claim_token: claim.claimToken,
    p_payload_sha256: claim.payloadSha256,
    p_target_status: status,
    p_error_message: errorMessage,
  };
}

export async function runGoHighLevelWebhookStateMachineRegression({
  cwd,
  runtimeEnv = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireCondition(
    runtimeEnv[GHL_WEBHOOK_REGRESSION_RUN] === "true",
    `${GHL_WEBHOOK_REGRESSION_RUN}=true is required.`,
  );
  const { config } = loadAutomationRegressionEnvironment({ cwd, runtimeEnv });
  const network = createNetworkGuard(fetchImpl, new URL(config.supabaseUrl).origin);
  const service = createClientWithKey(config.supabaseUrl, config.serviceRoleKey, network.fetch);
  const owner = createClientWithKey(config.supabaseUrl, config.anonKey, network.fetch);
  const anonymous = createClientWithKey(config.supabaseUrl, config.anonKey, network.fetch);

  const runId = `${Date.now()}-${randomUUID()}`;
  const marker = `TEST WTOS GHL WEBHOOK ${runId}`;
  const companyA = randomUUID();
  const companyB = randomUUID();
  const connectionA1 = randomUUID();
  const connectionA2 = randomUUID();
  const connectionB = randomUUID();
  const locationA1 = `TEST-GHL-LOCATION-A1-${runId}`;
  const locationA2 = `TEST-GHL-LOCATION-A2-${runId}`;
  const locationB = `TEST-GHL-LOCATION-B-${runId}`;
  const externalCompanyA = `TEST-GHL-COMPANY-A-${runId}`;
  const externalCompanyB = `TEST-GHL-COMPANY-B-${runId}`;
  const webhookIds = {
    concurrent: `TEST-GHL-WEBHOOK-CONCURRENT-${runId}`,
    retry: `TEST-GHL-WEBHOOK-RETRY-${runId}`,
    ignored: `TEST-GHL-WEBHOOK-IGNORED-${runId}`,
    uninstall: `TEST-GHL-WEBHOOK-UNINSTALL-${runId}`,
  };
  let ownerId = null;
  let assertionCount = 0;
  let primaryError = null;
  const check = (condition, message) => {
    requireCondition(condition, message);
    assertionCount += 1;
  };

  try {
    const ownerSession = requireData(
      await owner.auth.signInWithPassword({
        email: config.ownerEmail,
        password: config.ownerPassword,
      }),
      "Regression owner sign-in",
    );
    ownerId = ownerSession.user?.id ?? null;
    check(Boolean(ownerId), "Regression owner must authenticate.");

    requireData(
      await service.from("companies").insert([
        {
          id: companyA,
          name: `${marker} A`,
          short_name: "GHL A",
          trade: "roofing",
          workflow_profile: "roofing",
        },
        {
          id: companyB,
          name: `${marker} B`,
          short_name: "GHL B",
          trade: "painting",
          workflow_profile: "painting",
        },
      ]),
      "Synthetic companies",
    );
    requireData(
      await service.from("company_memberships").insert({
        user_id: ownerId,
        company_id: companyA,
        role: "owner",
        can_manage_settings: true,
        can_manage_financials: true,
        can_manage_production: true,
      }),
      "Synthetic owner membership",
    );
    requireData(
      await service.from("integration_connections").insert([
        {
          id: connectionA1,
          company_id: companyA,
          provider: "gohighlevel",
          status: "connected",
          display_name: `${marker} A1`,
          external_account_id: locationA1,
          sync_direction: "provider_to_weathertech",
        },
        {
          id: connectionA2,
          company_id: companyA,
          provider: "gohighlevel",
          status: "connected",
          display_name: `${marker} A2`,
          external_account_id: locationA2,
          sync_direction: "provider_to_weathertech",
        },
        {
          id: connectionB,
          company_id: companyB,
          provider: "gohighlevel",
          status: "connected",
          display_name: `${marker} B`,
          external_account_id: locationB,
          sync_direction: "provider_to_weathertech",
        },
      ]),
      "Synthetic GHL connections",
    );
    requireData(
      await service.from("gohighlevel_oauth_credentials").insert(
        [
          [companyA, connectionA1, locationA1, externalCompanyA],
          [companyA, connectionA2, locationA2, externalCompanyA],
          [companyB, connectionB, locationB, externalCompanyB],
        ].map(([companyId, connectionId, locationId, externalCompanyId]) => ({
          company_id: companyId,
          integration_connection_id: connectionId,
          external_location_id: locationId,
          external_company_id: externalCompanyId,
          encrypted_access_token: `${marker} ACCESS`,
          encrypted_refresh_token: `${marker} REFRESH`,
          scopes: [],
          token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        })),
      ),
      "Synthetic GHL credentials",
    );

    const concurrentSha = sha256(JSON.stringify({ marker, kind: "concurrent" }));
    const concurrentRequest = claimRequest({
      companyId: companyA,
      connectionId: connectionA1,
      webhookId: webhookIds.concurrent,
      payloadSha256: concurrentSha,
      externalLocationId: locationA1,
    });
    const concurrentResults = await Promise.all([
      service.rpc("wtos_claim_gohighlevel_webhook_v1", concurrentRequest),
      service.rpc("wtos_claim_gohighlevel_webhook_v1", concurrentRequest),
    ]);
    const receipts = concurrentResults.map((result) => requireData(result, "Concurrent claim"));
    check(receipts.filter((receipt) => receipt.disposition === "claimed").length === 1,
      "Exactly one concurrent delivery must claim processing.");
    check(receipts.filter((receipt) => receipt.disposition === "busy").length === 1,
      "The concurrent duplicate must receive a busy receipt.");
    const concurrentClaim = receipts.find((receipt) => receipt.disposition === "claimed");
    requireRefusal(
      await service.rpc("wtos_finalize_gohighlevel_uninstall_v1", {
        p_event_id: concurrentClaim.eventId,
        p_claim_token: concurrentClaim.claimToken,
        p_payload_sha256: concurrentClaim.payloadSha256,
        p_scope: "location",
      }),
      ["23514"],
      "Non-uninstall event revocation attempt",
    );

    const terminalResults = await Promise.all([
      service.rpc(
        "wtos_transition_gohighlevel_webhook_v1",
        transitionRequest(concurrentClaim, "processed"),
      ),
      service.rpc(
        "wtos_transition_gohighlevel_webhook_v1",
        transitionRequest(concurrentClaim, "processed"),
      ),
    ]);
    const terminals = terminalResults.map((result) => requireData(result, "Concurrent terminal"));
    check(terminals.every((receipt) => receipt.processingStatus === "processed"),
      "Concurrent same-terminal transitions must converge to processed.");
    check(terminals.filter((receipt) => receipt.idempotent === false).length === 1,
      "Exactly one terminal transition must commit.");
    check(terminals.filter((receipt) => receipt.idempotent === true).length === 1,
      "The duplicate terminal transition must be idempotent.");
    requireRefusal(
      await service.rpc("wtos_transition_gohighlevel_webhook_v1", {
        ...transitionRequest(concurrentClaim, "failed", "Conflicting terminal."),
      }),
      ["23514"],
      "Conflicting terminal transition",
    );

    const duplicate = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", concurrentRequest),
      "duplicate",
      "Processed replay",
    );
    check(duplicate.eventId === concurrentClaim.eventId, "Processed replay must return the same event.");
    requireRefusal(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", {
        p_claim: { ...concurrentRequest.p_claim, payloadSha256: sha256(`${marker}:conflict`) },
      }),
      ["23514"],
      "Conflicting raw payload replay",
    );
    requireRefusal(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", {
        p_claim: { ...concurrentRequest.p_claim, companyId: companyB },
      }),
      ["23514"],
      "Cross-company connection claim",
    );

    const retrySha = sha256(JSON.stringify({ marker, kind: "retry" }));
    const retryRequest = claimRequest({
      companyId: companyA,
      connectionId: connectionA1,
      webhookId: webhookIds.retry,
      payloadSha256: retrySha,
      externalLocationId: locationA1,
    });
    let retryClaim = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", retryRequest),
      "claimed",
      "Initial crash claim",
    );
    requireData(
      await service
        .from("gohighlevel_webhook_events")
        .update({ lease_expires_at: new Date(Date.now() - 1_000).toISOString() })
        .eq("id", retryClaim.eventId),
      "Expire synthetic claim lease",
    );
    const staleToken = retryClaim.claimToken;
    retryClaim = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", retryRequest),
      "claimed",
      "Stale crash reclaim",
    );
    check(retryClaim.attemptCount === 2, "Stale lease reclaim must increment the attempt count.");
    check(retryClaim.claimToken !== staleToken, "Stale lease reclaim must rotate the claim token.");
    requireRefusal(
      await service.rpc("wtos_transition_gohighlevel_webhook_v1", {
        p_event_id: retryClaim.eventId,
        p_claim_token: staleToken,
        p_payload_sha256: retryClaim.payloadSha256,
        p_target_status: "processed",
        p_error_message: null,
      }),
      ["23514"],
      "Stale crash claim terminal transition",
    );

    for (let attempt = 2; attempt <= 13; attempt += 1) {
      const failed = requireData(
        await service.rpc(
          "wtos_transition_gohighlevel_webhook_v1",
          transitionRequest(retryClaim, "failed", "Synthetic safe failure."),
        ),
        `Fail attempt ${attempt}`,
      );
      check(failed.processingStatus === "failed", `Attempt ${attempt} must finish failed.`);
      if (attempt < 13) {
        retryClaim = requireClaimReceipt(
          await service.rpc("wtos_claim_gohighlevel_webhook_v1", retryRequest),
          "claimed",
          `Retry claim ${attempt + 1}`,
        );
        check(retryClaim.attemptCount === attempt + 1, "Retry count must increase exactly once.");
      }
    }
    const exhausted = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", retryRequest),
      "exhausted",
      "Exhausted retry claim",
    );
    check(exhausted.attemptCount === 13, "Provider-aligned retry ceiling must be thirteen claims.");

    requireRefusal(
      await anonymous.rpc("wtos_requeue_gohighlevel_webhook_v1", {
        p_event_id: retryClaim.eventId,
        p_expected_attempt_count: 13,
        p_reason: "Unauthorized synthetic attempt.",
      }),
      ["42501"],
      "Anonymous webhook requeue",
    );
    requireRefusal(
      await owner.rpc("wtos_requeue_gohighlevel_webhook_v1", {
        p_event_id: retryClaim.eventId,
        p_expected_attempt_count: 12,
        p_reason: "Stale synthetic attempt.",
      }),
      ["23514"],
      "Stale owner webhook requeue",
    );
    const requeue = requireData(
      await owner.rpc("wtos_requeue_gohighlevel_webhook_v1", {
        p_event_id: retryClaim.eventId,
        p_expected_attempt_count: 13,
        p_reason: "Synthetic owner-reviewed recovery.",
      }),
      "Owner webhook requeue",
    );
    check(requeue.awaitingSignedRedelivery === true && requeue.attemptCount === 0,
      "Owner requeue must wait for a signed provider redelivery and reset the claim budget.");
    const requeuedRow = requireData(
      await service
        .from("gohighlevel_webhook_events")
        .select("error_message,requeued_by,requeue_count")
        .eq("id", retryClaim.eventId)
        .single(),
      "Requeue audit row",
    );
    check(requeuedRow.requeued_by === ownerId && requeuedRow.requeue_count === 1,
      "Requeue audit must bind the exact owner and count.");
    check(!requeuedRow.error_message.includes("Synthetic owner-reviewed recovery"),
      "Free-form requeue reasons must not persist in the webhook ledger.");
    const redelivery = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", retryRequest),
      "claimed",
      "Signed redelivery after requeue",
    );
    check(redelivery.attemptCount === 1, "Signed redelivery after requeue must begin a fresh bounded budget.");
    requireData(
      await service.rpc(
        "wtos_transition_gohighlevel_webhook_v1",
        transitionRequest(redelivery, "failed", "Synthetic cleanup terminal."),
      ),
      "Finish requeued event",
    );

    const ignoredSha = sha256(JSON.stringify({ marker, kind: "ignored" }));
    const ignoredClaim = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", claimRequest({
        companyId: companyA,
        connectionId: connectionA2,
        webhookId: webhookIds.ignored,
        payloadSha256: ignoredSha,
        externalLocationId: locationA2,
      })),
      "claimed",
      "Ignored event claim",
    );
    const ignored = requireData(
      await service.rpc(
        "wtos_transition_gohighlevel_webhook_v1",
        transitionRequest(ignoredClaim, "ignored"),
      ),
      "Ignored terminal transition",
    );
    check(ignored.processingStatus === "ignored", "Ignored terminal receipt must be exact.");

    const uninstallSha = sha256(JSON.stringify({ marker, kind: "company-uninstall" }));
    const uninstallClaim = requireClaimReceipt(
      await service.rpc("wtos_claim_gohighlevel_webhook_v1", claimRequest({
        companyId: companyA,
        connectionId: connectionA1,
        webhookId: webhookIds.uninstall,
        payloadSha256: uninstallSha,
        externalLocationId: `company:${externalCompanyA}`,
        eventType: "UNINSTALL",
      })),
      "claimed",
      "Company uninstall claim",
    );
    requireRefusal(
      await service.rpc("wtos_finalize_gohighlevel_uninstall_v1", {
        p_event_id: uninstallClaim.eventId,
        p_claim_token: uninstallClaim.claimToken,
        p_payload_sha256: uninstallClaim.payloadSha256,
        p_scope: "location",
      }),
      ["23514"],
      "Company uninstall downgraded to location scope",
    );
    const uninstall = requireData(
      await service.rpc("wtos_finalize_gohighlevel_uninstall_v1", {
        p_event_id: uninstallClaim.eventId,
        p_claim_token: uninstallClaim.claimToken,
        p_payload_sha256: uninstallClaim.payloadSha256,
        p_scope: "company",
      }),
      "Company uninstall terminal",
    );
    check(uninstall.processingStatus === "processed", "Company uninstall must finish processed.");
    check(uninstall.connectionCount === 2 && uninstall.credentialCount === 2,
      "Company uninstall must update both exact company-A mappings.");

    const connections = requireData(
      await service
        .from("integration_connections")
        .select("id,status")
        .in("id", [connectionA1, connectionA2, connectionB]),
      "Post-uninstall connection state",
    );
    check(connections.filter((row) => [connectionA1, connectionA2].includes(row.id))
      .every((row) => row.status === "needs_reauth"),
    "Every company-A location must require reauthorization.");
    check(connections.find((row) => row.id === connectionB)?.status === "connected",
      "Company-B connection must remain unchanged.");
    const credentials = requireData(
      await service
        .from("gohighlevel_oauth_credentials")
        .select("company_id,revoked_at")
        .in("integration_connection_id", [connectionA1, connectionA2, connectionB]),
      "Post-uninstall credential state",
    );
    check(credentials.filter((row) => row.company_id === companyA).every((row) => row.revoked_at),
      "Every company-A credential must be revoked.");
    check(credentials.find((row) => row.company_id === companyB)?.revoked_at === null,
      "Company-B credential must remain active.");

    check(network.counters.providerRequests === 0, "Hosted regression must not contact any provider.");
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];
    const cleanup = async (label, operation) => {
      const result = await operation;
      if (result.error) cleanupErrors.push(`${label}: ${result.error.message}`);
    };
    await cleanup(
      "Webhook events",
      service.from("gohighlevel_webhook_events").delete().in("webhook_id", Object.values(webhookIds)),
    );
    await cleanup(
      "GHL credentials",
      service
        .from("gohighlevel_oauth_credentials")
        .delete()
        .in("integration_connection_id", [connectionA1, connectionA2, connectionB]),
    );
    await cleanup(
      "GHL connections",
      service
        .from("integration_connections")
        .delete()
        .in("id", [connectionA1, connectionA2, connectionB]),
    );
    if (ownerId) {
      await cleanup(
        "Owner membership",
        service
          .from("company_memberships")
          .delete()
          .eq("user_id", ownerId)
          .eq("company_id", companyA),
      );
    }
    await cleanup("Synthetic companies", service.from("companies").delete().in("id", [companyA, companyB]));

    const [eventResidue, connectionResidue, companyResidue] = await Promise.all([
      service
        .from("gohighlevel_webhook_events")
        .select("id", { count: "exact", head: true })
        .in("webhook_id", Object.values(webhookIds)),
      service
        .from("integration_connections")
        .select("id", { count: "exact", head: true })
        .in("id", [connectionA1, connectionA2, connectionB]),
      service
        .from("companies")
        .select("id", { count: "exact", head: true })
        .in("id", [companyA, companyB]),
    ]);
    for (const [label, result] of [
      ["event residue", eventResidue],
      ["connection residue", connectionResidue],
      ["company residue", companyResidue],
    ]) {
      if (result.error) cleanupErrors.push(`${label}: ${result.error.message}`);
      else if ((result.count ?? 0) !== 0) cleanupErrors.push(`${label}: ${result.count}`);
    }
    if (cleanupErrors.length) {
      const cleanupError = new Error(`GHL regression cleanup failed: ${cleanupErrors.join("; ")}`);
      if (!primaryError) primaryError = cleanupError;
    }
  }

  if (primaryError) throw primaryError;
  return {
    ok: true,
    target: config.projectRef,
    assertions: assertionCount,
    supabaseRequests: network.counters.supabaseRequests,
    providerRequests: network.counters.providerRequests,
    residueCount: 0,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  runGoHighLevelWebhookStateMachineRegression({
    cwd: process.cwd(),
    runtimeEnv: process.env,
  })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
