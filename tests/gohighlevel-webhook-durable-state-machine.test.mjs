import { readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const route = readFileSync(
  join(cwd, "app/api/integrations/gohighlevel/webhook/route.ts"),
  "utf8",
);
const requeueRoute = readFileSync(
  join(cwd, "app/api/integrations/gohighlevel/webhook/requeue/route.ts"),
  "utf8",
);
const migration = readFileSync(
  join(
    cwd,
    "supabase/migrations/20260902042428_gohighlevel_webhook_durable_state_machine.sql",
  ),
  "utf8",
);
const guardrailMigration = readFileSync(
  join(
    cwd,
    "supabase/migrations/20260902044154_gohighlevel_webhook_uninstall_guardrails.sql",
  ),
  "utf8",
);
const types = readFileSync(join(cwd, "lib/crm/types.ts"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  route.includes('createHash("sha256").update(rawBody, "utf8").digest("hex")') &&
    route.indexOf("verifyGoHighLevelWebhookSignature") <
      route.indexOf('createHash("sha256")') &&
    route.includes("payloadSha256") &&
    route.includes("wtos_claim_gohighlevel_webhook_v1"),
  "The verified exact raw webhook body must be SHA-256-bound to an atomic claim.",
);

assert(
  route.includes("MAX_GHL_WEBHOOK_ATTEMPTS = 13") &&
    migration.includes("provider_max_attempts constant integer := 13") &&
    migration.includes("existing_event.lease_expires_at > clock_timestamp()") &&
    migration.includes("claim_lease_seconds constant integer := 120") &&
    migration.includes("pg_advisory_xact_lock") &&
    migration.includes("for update;"),
  "Claims must serialize concurrent deliveries, lease active work, reclaim stale work, and match the provider retry ceiling.",
);

assert(
  route.includes("wtos_transition_gohighlevel_webhook_v1") &&
    route.includes("parseTransitionReceipt") &&
    migration.includes("Webhook transition claim mismatch.") &&
    migration.includes("Webhook transition is stale.") &&
    !route.includes('.from("gohighlevel_webhook_events")\n      .insert(') &&
    !route.includes('.from("gohighlevel_webhook_events")\n      .update('),
  "The route must use checked atomic terminal-transition receipts instead of direct event writes.",
);

assert(
  route.includes("locationResult.error") &&
    route.includes("credentialsError") &&
    route.includes("anchorError") &&
    route.includes("contactLookup.error") &&
    route.includes("connectionUpdateError"),
  "Connection and local-mapping query failures must not be confused with unmapped or successful deliveries.",
);

assert(
  route.includes("wtos_finalize_gohighlevel_uninstall_v1") &&
    route.includes('uninstallScope = locationId ? "location" : "company"') &&
    migration.includes("where company_id = existing_event.company_id") &&
    migration.includes("and provider = 'gohighlevel'") &&
    migration.includes("Uninstall connection scope mismatch."),
  "Agency-level uninstall must atomically revoke every HighLevel mapping for exactly one WTOS company.",
);

assert(
  guardrailMigration.includes("lower(existing_event.event_type) not like '%uninstall%'") &&
    guardrailMigration.includes("existing_event.external_location_id not like 'company:%'") &&
    guardrailMigration.includes("credential.external_company_id = substring(") &&
    guardrailMigration.includes("connection.external_account_id = existing_event.external_location_id") &&
    guardrailMigration.includes("Company uninstall scope mismatch.") &&
    guardrailMigration.includes("Location uninstall scope mismatch."),
  "The service-only uninstall finalizer must independently bind event type and exact company/location scope before revocation.",
);

assert(
  requeueRoute.includes("getSupabaseServerClient") &&
    requeueRoute.includes("auth.getUser") &&
    requeueRoute.includes("wtos_requeue_gohighlevel_webhook_v1") &&
    requeueRoute.includes("expectedAttemptCount") &&
    requeueRoute.includes("awaitingSignedRedelivery") &&
    migration.includes("wtos_has_global_role(array['owner', 'admin'])") &&
    migration.includes("wtos_has_membership_role(existing_event.company_id, array['owner', 'admin'])") &&
    migration.includes("processing_status <> 'failed'") &&
    migration.includes("attempt_count <> p_expected_attempt_count"),
  "A signed-in company owner/admin needs a stale-safe real requeue path that still requires an exact signed provider redelivery.",
);

assert(
  guardrailMigration.includes("The reason is intentionally not persisted") &&
    guardrailMigration.includes("p_expected_attempt_count,\n    null") &&
    guardrailMigration.includes(
      "revoke all on function public.wtos_requeue_gohighlevel_webhook_v1_unbounded_reason_20260902",
    ),
  "Free-form owner requeue reasons must not persist possible customer data or credentials.",
);

assert(
  migration.includes(
    "revoke all on function public.wtos_claim_gohighlevel_webhook_v1(jsonb)\nfrom public, anon, authenticated, service_role;",
  ) &&
    migration.includes(
      "grant execute on function public.wtos_claim_gohighlevel_webhook_v1(jsonb)\nto service_role;",
    ) &&
    migration.includes(
      "grant execute on function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)\nto authenticated;",
    ) &&
    types.includes("wtos_claim_gohighlevel_webhook_v1") &&
    types.includes("wtos_requeue_gohighlevel_webhook_v1"),
  "Privileged RPC grants and generated client types must match the service/owner boundary.",
);

assert(
  !route.includes('method: "POST"') &&
    !route.includes('method: "PUT"') &&
    !route.includes('method: "DELETE"') &&
    !requeueRoute.includes('method: "POST"') &&
    !requeueRoute.includes('method: "PUT"') &&
    !requeueRoute.includes('method: "DELETE"'),
  "Webhook processing and requeue controls must not write to HighLevel or send provider messages.",
);

console.log("GoHighLevel durable webhook state-machine checks passed.");
