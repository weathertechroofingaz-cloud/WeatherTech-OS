import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const migrationPath = join(
  cwd,
  "supabase",
  "migrations",
  "20260816122114_lead_attribution_marketing_accountability_phase_1.sql",
);
const sql = readFileSync(migrationPath, "utf8");
const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
const staleErrorHardeningPath = join(
  cwd,
  "supabase",
  "migrations",
  "20260816143152_lead_accountability_nonretryable_stale_errors.sql",
);
const staleErrorHardeningSql = readFileSync(staleErrorHardeningPath, "utf8");
const normalizedStaleErrorHardening = staleErrorHardeningSql
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const releaseHardeningPath = join(
  cwd,
  "supabase",
  "migrations",
  "20260816164202_lead_accountability_idempotency_integrity_hardening.sql",
);
const releaseHardeningSql = readFileSync(releaseHardeningPath, "utf8");
const normalizedReleaseHardening = releaseHardeningSql
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const repositorySource = readFileSync(join(cwd, "lib", "crm", "repository.ts"), "utf8");
const leadIntakeSource = readFileSync(join(cwd, "lib", "crm", "leadIntake.ts"), "utf8");
const appSource = readFileSync(join(cwd, "components", "CrmApp.tsx"), "utf8");
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

function includes(fragment, message) {
  check(normalized.includes(fragment.replace(/\s+/g, " ").toLowerCase()), message);
}

function hardeningIncludes(fragment, message) {
  check(
    normalizedReleaseHardening.includes(
      fragment.replace(/\s+/g, " ").toLowerCase(),
    ),
    message,
  );
}

check(normalized.startsWith("begin;"), "Migration starts in one transaction");
check(normalized.endsWith("commit;"), "Migration closes its transaction");
check(!/\bdrop\s+table\b/i.test(sql), "Migration drops no table");
check(!/\bdrop\s+column\b/i.test(sql), "Migration drops no column");
check(!/\btruncate\b/i.test(sql), "Migration truncates no data");
check(!/\bdelete\s+from\b/i.test(sql), "Migration deletes no business rows");
check(!/\balter\s+column\b[\s\S]{0,80}\btype\b/i.test(sql), "Migration changes no existing column type");
check(
  !/\b[a-z_][a-z0-9_$]*\.(?:coalesce|nullif|greatest|least)\s*\(/i.test(sql),
  "Migration leaves SQL conditional expressions unqualified for PostgreSQL parsing",
);
check(
  normalizedStaleErrorHardening.startsWith("begin;") &&
    normalizedStaleErrorHardening.endsWith("commit;"),
  "Non-retryable stale-error hardening is one additive transaction",
);
check(
  (normalizedStaleErrorHardening.match(/when serialization_failure then/g) ?? [])
    .length === 4 &&
    (normalizedStaleErrorHardening.match(/raise exception using errcode = 'p0001', message = sqlerrm;/g) ?? [])
      .length === 4 &&
    (normalizedStaleErrorHardening.match(/end if; raise; end;/g) ?? []).length === 4,
  "Only four public wrappers translate recognized semantic conflicts to P0001 and re-raise genuine coordinator serialization failures unchanged",
);
for (const staleConflictMessage of [
  "New marketing campaign requires expected_version 0.",
  "Marketing campaign changed after review.",
  "New marketing spend requires expected_version 0.",
  "Marketing spend changed after review.",
  "Lead accountability record changed during the action.",
  "Lead accountability record changed after review.",
  "Repeat-opportunity customer changed after review.",
  "Repeat-opportunity property changed after review.",
]) {
  check(
    normalizedStaleErrorHardening.includes(`'${staleConflictMessage.toLowerCase()}'`),
    `Non-retryable hardening recognizes exact applied Phase 1 message: ${staleConflictMessage}`,
  );
}
for (const publicRpc of [
  "wtos_upsert_marketing_campaign",
  "wtos_upsert_marketing_spend",
  "wtos_apply_lead_accountability_action",
  "wtos_create_repeat_opportunity",
]) {
  check(
    normalizedStaleErrorHardening.includes(
      `alter function public.${publicRpc}(jsonb) rename to ${publicRpc}_phase1_base;`,
    ) &&
      normalizedStaleErrorHardening.includes(
        `revoke all on function public.${publicRpc}_phase1_base(jsonb) from public, anon, authenticated, service_role;`,
      ) &&
      normalizedStaleErrorHardening.includes(
        `grant execute on function public.${publicRpc}(jsonb) to authenticated, service_role;`,
      ),
    `${publicRpc} preserves its applied implementation privately and exposes only the hardened wrapper`,
  );
}
check(
  normalizedReleaseHardening.startsWith("begin;") &&
    normalizedReleaseHardening.endsWith("commit;"),
  "Release integrity hardening is one additive transaction",
);
check(!/\bdrop\s+table\b/i.test(releaseHardeningSql), "Release hardening drops no table");
check(!/\bdrop\s+column\b/i.test(releaseHardeningSql), "Release hardening drops no column");
check(!/\btruncate\b/i.test(releaseHardeningSql), "Release hardening truncates no data");
const releaseHardeningOutsideFunctions = [];
let insideReleaseHardeningFunction = false;
for (const line of releaseHardeningSql.split("\n")) {
  if (!insideReleaseHardeningFunction && /\bas \$\$\s*$/i.test(line)) {
    insideReleaseHardeningFunction = true;
    continue;
  }
  if (insideReleaseHardeningFunction && line.trim() === "$$;") {
    insideReleaseHardeningFunction = false;
    continue;
  }
  if (!insideReleaseHardeningFunction) releaseHardeningOutsideFunctions.push(line);
}
check(
  !/\b(?:insert\s+into|update\s+public\.|delete\s+from)\b/i.test(
    releaseHardeningOutsideFunctions.join("\n"),
  ),
  "Release hardening performs no migration-time business DML or backfill",
);

for (const receiptContract of [
  "create table public.marketing_accountability_operation_receipts",
  "operation_kind in ('campaign_upsert', 'spend_upsert')",
  "unique (company_id, operation_key)",
  "foreign key (campaign_id, company_id) references public.marketing_campaigns(id, company_id) on delete restrict",
  "foreign key (spend_id, company_id) references public.marketing_spend_months(id, company_id) on delete restrict",
  "operation_kind = 'campaign_upsert' and campaign_id is not null and spend_id is null",
  "operation_kind = 'spend_upsert' and campaign_id is null and spend_id is not null",
  "request_fingerprint ~ '^[a-f0-9]{64}$'",
  "marketing_operation_receipts_immutable",
  "Marketing operation receipts are immutable.",
  "alter table public.marketing_accountability_operation_receipts enable row level security",
  "revoke all on table public.marketing_accountability_operation_receipts from public, anon, authenticated, service_role",
  "grant select on table public.marketing_accountability_operation_receipts to authenticated, service_role",
  "grant delete on table public.marketing_accountability_operation_receipts to service_role",
  "using (public.wtos_can_read_company(company_id))",
  "TEST WTOS LEAD ACCOUNTABILITY REGRESSION:%",
]) {
  hardeningIncludes(receiptContract, `Durable receipt contract is present: ${receiptContract}`);
}
const receiptDefinition = normalizedReleaseHardening.slice(
  normalizedReleaseHardening.indexOf(
    "create table public.marketing_accountability_operation_receipts",
  ),
  normalizedReleaseHardening.indexOf(
    "create index marketing_operation_receipts_company_created_idx",
  ),
);
for (const piiColumn of [
  " phone ",
  " email ",
  " address ",
  " message_body ",
  " raw_payload ",
  " notes ",
]) {
  check(
    !receiptDefinition.includes(piiColumn),
    `Durable marketing receipt excludes ${piiColumn.trim()} PII`,
  );
}
check(
  !/grant\s+(?:all|insert|update|truncate)[^;]*on\s+table\s+public\.marketing_accountability_operation_receipts\s+to\s+(?:anon|authenticated|service_role)/i.test(
    releaseHardeningSql,
  ),
  "Durable receipts remain RPC-only for writes with narrow service cleanup delete",
);

for (const [rpc, privateName, kind, targetField] of [
  [
    "wtos_upsert_marketing_campaign",
    "wtos_upsert_marketing_campaign_phase1_nonretryable",
    "campaign_upsert",
    "campaign_id",
  ],
  [
    "wtos_upsert_marketing_spend",
    "wtos_upsert_marketing_spend_phase1_nonretryable",
    "spend_upsert",
    "spend_id",
  ],
]) {
  for (const wrapperContract of [
    `alter function public.${rpc}(jsonb) rename to ${privateName}`,
    `revoke all on function public.${privateName}(jsonb) from public, anon, authenticated, service_role`,
    `create function public.${rpc}`,
    "perform public.wtos_lock_accountability_operation",
    "from public.marketing_accountability_operation_receipts as receipt",
    `existing_receipt.operation_kind is distinct from '${kind}'`,
    "existing_receipt.request_fingerprint is distinct from request_fingerprint",
    `return public.${privateName}`.replace("return ", "mutation_result := "),
    "insert into public.marketing_accountability_operation_receipts",
    `'${kind}'`,
    `'${targetField}', existing_receipt.${targetField}`,
    "'record_version', existing_receipt.resulting_record_version",
    `grant execute on function public.${rpc}(jsonb) to authenticated, service_role`,
  ]) {
    hardeningIncludes(
      wrapperContract,
      `${rpc} durable receipt wrapper includes ${wrapperContract}`,
    );
  }
}
hardeningIncludes(
  "when tg_op = 'update' then coalesce(new.updated_at, pg_catalog.now()) else coalesce(new.created_at, pg_catalog.now())",
  "Schedule INSERT uses creation time while UPDATE uses the authoritative transition timestamp",
);
hardeningIncludes(
  "create constraint trigger leads_enforce_accountable_outcome_insert after insert on public.leads deferrable initially deferred",
  "Future direct lead inserts receive a deferred accountability outcome guard",
);
hardeningIncludes(
  "alter function public.wtos_enforce_accountable_lead_outcome() security definer",
  "Terminal insert enforcement reads accountability fail-closed across RLS",
);
const ddlPrefix = sql.slice(0, sql.indexOf("create or replace function"));
check(
  !/\b(?:insert\s+into|update\s+public\.|delete\s+from)\b/i.test(ddlPrefix),
  "Migration performs no migration-time insert, update, or backfill",
);

for (const table of [
  "marketing_campaigns",
  "lead_accountability",
  "lead_accountability_events",
  "marketing_spend_months",
]) {
  includes(`create table public.${table}`, `${table} is created additively`);
  includes(`alter table public.${table} enable row level security`, `${table} has RLS enabled`);
  includes(`revoke all on table public.${table} from public, anon, authenticated, service_role`, `${table} starts with revoked table privileges`);
  includes(`grant select on table public.${table} to authenticated, service_role`, `${table} exposes only company-filtered authenticated reads`);
  includes(`grant delete on table public.${table} to service_role`, `${table} exposes cleanup delete only to service role`);
}

includes("unique (company_id, campaign_key)", "Campaign keys are deterministic within one company");
includes("unique (lead_id)", "Exactly one accountability row exists per lead");
includes("unique (company_id, operation_key)", "Event operation keys are company-idempotent");
includes("marketing_spend_months_identity_uidx", "Monthly spend has a deterministic company/source/vendor/campaign identity");
includes("foreign key (campaign_id, company_id)", "Campaign references use composite company scope");
includes("foreign key (company_id, lead_id)", "Lead references use composite company scope");
includes("foreign key (company_id, intake_record_id)", "Intake references use composite company scope");
includes("spend_amount >= 0", "Marketing spend must be nonnegative");
includes("spend_amount <> 'nan'::numeric", "Marketing spend rejects PostgreSQL NaN values");
includes("currency text not null default 'usd'", "Marketing spend is explicitly USD");
includes("spend_month = date_trunc('month', spend_month)::date", "Spend accepts whole calendar months only");
includes("attribution_model = 'first_touch'", "Attribution model is fixed to first touch");
includes("owner_user_id uuid references auth.users", "Assigned lead owner is separate from lead creator");
includes("won_contract_value <> 'nan'::numeric", "Accountability state rejects non-finite won values");
includes(
  "outcome = 'open' and outcome_at is null and lost_reason_code is null and lost_reason_notes is null and won_contract_value is null and won_value_basis is null",
  "Open accountability rows cannot retain won or lost values",
);
includes(
  "outcome = 'lost' and outcome_at is not null and lost_reason_code is not null and won_contract_value is null and won_value_basis is null",
  "Lost accountability rows cannot retain a contract value or basis",
);
includes(
  "event_type not in ('won', 'lost', 'lead_created') and outcome is null and lost_reason_code is null and won_contract_value is null and won_value_basis is null",
  "Non-outcome ledger events cannot carry won or lost values",
);
includes(
  "event_type = 'lead_created' and outcome is not distinct from 'open' and lost_reason_code is null and won_contract_value is null and won_value_basis is null",
  "Lead-created ledger events explicitly start open with no won value",
);
includes("record_version integer not null default 1", "Optimistic record versions are persisted");
includes("last_operation_key", "Mutation idempotency keys are persisted");
includes("last_request_fingerprint", "Mutation request fingerprints are persisted");
includes("pg_advisory_xact_lock", "Concurrent operation and semantic identities are transaction-locked");
includes("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "Every public mutation RPC requires a bare canonical UUID operation key");
check(
  (normalized.match(/request_operation_key := request_operation_key::uuid::text;/g) ?? [])
    .length === 5,
  "All five public mutation RPCs canonicalize UUID operation-key case before locking and fingerprinting",
);
check(
  (normalized.match(/'\{operation_key\}', pg_catalog\.to_jsonb\(request_operation_key\), true/g) ?? [])
    .length === 4 &&
    normalized.includes("'contract', 'repeat_opportunity_v1', 'operation_key', request_operation_key"),
  "Equivalent uppercase/lowercase UUID requests fingerprint the same canonical operation key",
);
const canonicalOperationKeyAssignment =
  "request_operation_key := request_operation_key::uuid::text;";
check(
  (normalized.match(/request_operation_key := request_operation_key::uuid::text;/g) ?? []).length === 5,
  "Each public mutation boundary canonicalizes UUID operation-key casing exactly once",
);
for (const operationBoundary of [
  "wtos_upsert_marketing_campaign",
  "wtos_upsert_marketing_spend",
  "wtos_create_accountable_lead_core",
  "wtos_apply_lead_accountability_action",
  "wtos_create_repeat_opportunity",
]) {
  const start = normalized.indexOf(`create or replace function public.${operationBoundary}`);
  const end = normalized.indexOf("create or replace function public.", start + 1);
  const body = normalized.slice(start, end === -1 ? undefined : end);
  check(
    body.indexOf(canonicalOperationKeyAssignment) > -1 &&
      body.indexOf(canonicalOperationKeyAssignment) < body.indexOf("request_fingerprint :=") &&
      body.indexOf(canonicalOperationKeyAssignment) <
        body.indexOf("perform public.wtos_lock_accountability_operation("),
    `${operationBoundary} canonicalizes its UUID before fingerprinting and locking`,
  );
}
includes("last_operation_key ~* '^workflow:schedule_events:", "Persisted state permits only enumerated internal workflow operation namespaces beyond UUIDs");
includes("operation_key ~* '^intake_attribution:", "Immutable events permit only enumerated intake operation namespaces beyond UUIDs");

const eventsStart = normalized.indexOf("create table public.lead_accountability_events");
const eventsEnd = normalized.indexOf("create index lead_accountability_events", eventsStart);
const eventDefinition = normalized.slice(eventsStart, eventsEnd);
for (const piiColumn of [" phone ", " email ", " address ", " message_body ", " raw_payload "]) {
  check(!eventDefinition.includes(piiColumn), `Immutable event ledger excludes ${piiColumn.trim()} PII`);
}

for (const sourceKey of [
  "website",
  "google",
  "yelp",
  "phone",
  "email",
  "referral",
  "repeat_customer",
  "manual",
  "other",
  "unknown",
]) {
  includes(`'${sourceKey}'`, `Canonical source ${sourceKey} is registered`);
}

for (const eventType of [
  "lead_created",
  "attribution_reviewed",
  "owner_assigned",
  "contacted",
  "appointment_scheduled",
  "inspection_completed",
  "estimate_sent",
  "won",
  "lost",
]) {
  includes(`'${eventType}'`, `Accountability event ${eventType} is registered`);
}

for (const lostReason of [
  "price",
  "no_response",
  "chose_competitor",
  "postponed",
  "not_qualified",
  "outside_service_area",
  "insurance_denied",
  "scope_mismatch",
  "duplicate",
  "other",
]) {
  includes(`'${lostReason}'`, `Lost reason ${lostReason} is registered`);
}

for (const rpc of [
  "wtos_create_accountable_lead",
  "wtos_apply_lead_accountability_action",
  "wtos_upsert_marketing_campaign",
  "wtos_upsert_marketing_spend",
  "wtos_create_repeat_opportunity",
  "wtos_get_marketing_accountability_dashboard",
]) {
  includes(`create or replace function public.${rpc}`, `${rpc} is implemented`);
  includes(`revoke all on function public.${rpc}(jsonb) from public, anon, authenticated, service_role`, `${rpc} starts with revoked execution`);
  includes(`grant execute on function public.${rpc}(jsonb) to authenticated, service_role`, `${rpc} exposes only approved authenticated/provider entrypoints`);
}

includes("lead_accountability_events_immutable", "Accountability events have an immutable trigger");
includes("lead accountability events are immutable", "Event mutations fail closed");
includes("leads_initialize_accountability", "Every future lead receives explicit accountability state");
includes("'unknown'", "New unsupported leads start explicitly unknown");
includes("'unattributed'", "New unsupported leads remain explicitly unattributed");
includes("lead_intake_records_apply_verified_attribution", "Verified intake evidence can set first touch");
includes("current_accountability.attribution_locked_at is not null", "Locked first touch refuses later provider overwrite");
includes("provider attribution evidence may only be recorded by a trusted provider pathway", "Provider evidence is restricted to trusted ingestion");
includes("assigned lead owner must be an internal member of the selected company", "Owner membership is validated");
includes("first response requires a successful human contact and channel", "Automated responses cannot set first contact");
includes("lost outcome requires a structured reason; other requires notes", "Other lost reasons require notes");
includes("won outcome requires a positive approved contract total and basis", "Won requires a valid contract value and basis");
includes("request_estimated_value = 'nan'::numeric", "Accountable lead creation rejects non-finite estimated values");
includes("request_spend_amount = 'nan'::numeric", "Spend RPC rejects non-finite amounts before persistence");
includes("contract_value = 'nan'::numeric", "Automatic proposal wins reject non-finite accepted totals");
includes("referenced campaign attribution identity is immutable", "Referenced campaign semantics cannot drift");
includes("from public.marketing_campaigns as campaign where campaign.id = new.campaign_id", "Campaign references are revalidated at the row-write boundary");
includes("for share", "First campaign references share-lock campaign semantics against concurrent edits");
includes("repeat-customer attribution requires the reviewed customer 360 workflow", "Generic create and attribution review cannot manufacture repeat-customer evidence");
includes("wtos_create_accountable_lead_core", "Repeat opportunity uses a private accountable-lead core boundary");
includes("accountability_request, false", "The public generic create wrapper cannot opt into repeat-customer evidence");
includes("accountable_request, true", "The reviewed repeat-opportunity RPC is the only repeat-customer opt-in path");
includes("repeat-opportunity customer changed after review", "Repeat customer stale reviews are refused");
includes("repeat-opportunity property changed after review", "Repeat property stale reviews are refused");
includes("repeat opportunity property must belong to the customer and selected company", "Repeat opportunity property stays same-company");
includes("'contract', 'repeat_opportunity_v1'", "Repeat retries fingerprint an explicit versioned request contract");
for (const field of [
  "'company_id', request_company_id",
  "'customer_id', request_customer_id",
  "'customer_expected_updated_at', request_customer_expected_updated_at",
  "'property_id', request_property_id",
  "'property_expected_updated_at', request_property_expected_updated_at",
  "'service_type', request_service_type",
  "'priority', request_priority",
  "'next_follow_up', request_next_follow_up",
  "'notes', request_notes",
]) {
  includes(field, `Repeat retry fingerprint binds ${field.split(",")[0].replaceAll("'", "")}`);
}
includes("'source_key', 'repeat_customer'", "Repeat opportunity persists the canonical repeat source");
includes("'source_detail', null", "Repeat opportunity persists no fabricated source detail");
includes("'intake_provider', 'manual'", "Repeat opportunity preserves manual as transport/provider");
includes("operation key was already used with different repeat-opportunity review input", "Changed same-key repeat requests conflict before graph reuse");
includes("existing_lead.customer_id is distinct from request_customer_id", "Idempotent repeat readback verifies the original customer link");
includes("existing_lead.property_id is distinct from request_property_id", "Idempotent repeat readback verifies the original property link");

includes("leads_enforce_accountable_outcome", "Loose lead status cannot bypass accountable outcomes");
includes("leads_enforce_accountable_funnel_linkage", "Loose lead pipeline stages cannot bypass linked milestones");
includes("schedule_events_capture_accountability_milestone", "Authoritative appointments drive funnel events");
includes("inspections_capture_accountability_milestone", "Authoritative completed inspections drive funnel events");
includes("estimates_capture_accountability_milestone", "Authoritative sent estimates drive funnel events");
includes("estimate_proposal_acceptances_capture_accountability_win", "Accepted proposals drive verified wins");
includes("wtos_validate_proposal_acceptance_scope", "Proposal acceptances validate their full relational scope before persistence");
includes("selected_revision.company_id is distinct from new.company_id", "Proposal acceptance revision company must match");
includes("selected_revision.estimate_id is distinct from new.estimate_id", "Proposal acceptance revision and estimate must match");
includes("selected_estimate.company_id is distinct from new.company_id", "Proposal acceptance estimate company must match");
includes("selected_revision.customer_id is distinct from new.customer_id", "Proposal acceptance revision customer must match");
includes("selected_estimate.customer_id is distinct from new.customer_id", "Proposal acceptance estimate customer must match");
includes("selected_customer.company_id is distinct from new.company_id", "Proposal acceptance customer must belong to the selected company");
includes("before insert on public.estimate_proposal_acceptances for each row execute function public.wtos_validate_proposal_acceptance_scope()", "Proposal acceptance INSERT validates exact scope before the automatic win hook");
includes("before update of company_id, proposal_revision_id, estimate_id, customer_id on public.estimate_proposal_acceptances for each row execute function public.wtos_validate_proposal_acceptance_scope()", "Proposal acceptance scope cannot be mutated into a mismatch");
includes("join public.estimate_proposal_revisions as revision on revision.id = acceptance.proposal_revision_id", "Accepted-proposal won evidence rechecks the linked revision");
includes("revision.estimate_id = acceptance.estimate_id", "Accepted-proposal won evidence rechecks revision/estimate identity");
includes("revision.customer_id is not distinct from acceptance.customer_id", "Accepted-proposal won evidence rechecks revision/customer identity");
includes("estimate.customer_id is not distinct from acceptance.customer_id", "Accepted-proposal won evidence rechecks estimate/customer identity");
includes("create or replace function public.wtos_validate_proposal_acceptance_scope", "Proposal acceptances validate their complete linked company graph");
includes("estimate_proposal_acceptances_validate_scope_insert", "Proposal acceptance scope validation runs before insert");
includes("estimate_proposal_acceptances_validate_scope_update", "Privileged proposal acceptance scope changes are revalidated");
includes("proposal_acceptances_serialize_accountability_scope_update", "Privileged proposal acceptance scope changes acquire the CRM coordinator first");
for (const proposalScopeContract of [
  "selected_revision.company_id is distinct from new.company_id",
  "selected_revision.estimate_id is distinct from new.estimate_id",
  "selected_estimate.company_id is distinct from new.company_id",
  "selected_revision.customer_id is distinct from new.customer_id",
  "selected_estimate.customer_id is distinct from new.customer_id",
  "selected_customer.company_id is distinct from new.company_id",
]) {
  includes(proposalScopeContract, `Proposal acceptance rejects mismatched graph edge: ${proposalScopeContract}`);
}
includes("revision.customer_id is not distinct from acceptance.customer_id", "Won readers exclude legacy acceptances with mismatched revision customers");
includes("estimate.customer_id is not distinct from acceptance.customer_id", "Won readers exclude legacy acceptances with mismatched estimate customers");
includes("customer.company_id = acceptance.company_id", "Won readers require acceptance customers in the acceptance company");
includes("acceptance_signature_status <> 'signed'", "Signature-provider wins require a signed record");
includes("accepted_proposal", "Accepted proposals use an approved won-value basis");
includes("signed_proposal", "Signed proposals use an approved won-value basis");
includes("approved_contract_total", "Owner-approved contract totals use an explicit basis");
includes("milestone_at < current_accountability.received_at", "Predated automatic milestone evidence fails as a no-op");
includes("milestone_at > pg_catalog.now()", "Future automatic milestone evidence fails as a no-op");
includes("inspection completion requires a recorded appointment milestone", "Explicit out-of-order inspection actions are rejected");
includes("estimate sent requires a recorded inspection completion milestone", "Explicit out-of-order estimate actions are rejected");
includes("won outcome requires a recorded estimate sent milestone", "Explicit out-of-order win actions are rejected");

const actionStart = normalized.indexOf(
  "create or replace function public.wtos_apply_lead_accountability_action",
);
const actionEnd = normalized.indexOf(
  "create or replace function public.wtos_create_repeat_opportunity",
  actionStart,
);
const actionBody = normalized.slice(actionStart, actionEnd);
check(
  actionBody.indexOf("perform public.wtos_acquire_crm_identity_invariant_lock()") > -1 &&
    actionBody.indexOf("perform public.wtos_acquire_crm_identity_invariant_lock()") <
      actionBody.indexOf("from public.lead_accountability as accountability where accountability.lead_id = request_lead_id for update"),
  "Lifecycle actions acquire the CRM coordinator before locking the accountability row",
);

const repeatStart = normalized.indexOf(
  "create or replace function public.wtos_create_repeat_opportunity",
);
const repeatEnd = normalized.indexOf(
  "create or replace function public.wtos_marketing_metrics_for_scope",
  repeatStart,
);
const repeatBody = normalized.slice(repeatStart, repeatEnd);
check(
  repeatBody.indexOf("perform public.wtos_acquire_crm_identity_invariant_lock()") > -1 &&
    repeatBody.indexOf("perform public.wtos_acquire_crm_identity_invariant_lock()") <
      repeatBody.indexOf("from public.customers as customer") &&
    repeatBody.indexOf("perform public.wtos_acquire_crm_identity_invariant_lock()") <
      repeatBody.indexOf("from public.properties as property"),
  "Repeat opportunity acquires the CRM coordinator before customer/property row locks",
);

for (const [fragment, message] of [
  [
    "before update of status, start_at on public.schedule_events for each statement execute function public.wtos_serialize_crm_identity_link_statement()",
    "Schedule milestone-driving updates serialize at statement start",
  ],
  [
    "before update of status, completed_at on public.inspections for each statement execute function public.wtos_serialize_crm_identity_link_statement()",
    "Inspection milestone-driving updates serialize at statement start",
  ],
  [
    "before update of status on public.estimates for each statement execute function public.wtos_serialize_crm_identity_link_statement()",
    "Estimate milestone-driving updates serialize at statement start",
  ],
  [
    "before insert on public.estimate_proposal_acceptances for each statement execute function public.wtos_serialize_crm_identity_link_statement()",
    "Proposal acceptance inserts serialize before tuple locks",
  ],
  [
    "before update of company_id, proposal_revision_id, estimate_id, customer_id on public.estimate_proposal_acceptances for each statement execute function public.wtos_serialize_crm_identity_link_statement()",
    "Proposal acceptance scope updates serialize before tuple locks",
  ],
]) {
  includes(fragment, message);
}

includes("at time zone 'america/phoenix'", "Reporting uses America/Phoenix month boundaries");
includes("accountability.received_at >= month_start", "Lead cohorts start at the Phoenix month boundary");
includes("accountability.received_at < month_end", "Lead cohorts use an exclusive next-month boundary");
includes("'cost_per_lead'", "Dashboard returns cost per lead");
includes("spend_value / lead_count_value", "Cost per lead formula is exact");
includes("booked_count::numeric / lead_count_value", "Booking rate formula is exact");
includes("inspection_count::numeric / booked_count", "Inspection completion rate formula is exact");
includes("won_count::numeric / inspection_count", "Closing rate formula is exact");
includes("spend_value / won_count", "Cost per sold job formula is exact");
includes("revenue_value / spend_value", "Marketing revenue divided by spend is exact");
includes("when lead_count_value = 0 then null", "Zero lead denominators are unavailable");
includes("when booked_count = 0 then null", "Zero booking denominators are unavailable");
includes("when inspection_count = 0 then null", "Zero inspection denominators are unavailable");
includes("when won_count = 0 then null", "Zero sold-job denominators are unavailable");
includes("when spend_value = 0 then null", "Zero spend denominators are unavailable");
includes("'new_awaiting_contact'", "Dashboard returns new leads awaiting contact");
includes("'unsold_estimates_overdue'", "Dashboard returns overdue explicit estimate follow-up");
includes("'unsold_estimates_missing_follow_up'", "Dashboard preserves missing follow-up gaps");
includes("'unattributed_lead_count'", "Dashboard returns unattributed lead count");
includes("'attribution_coverage'", "Dashboard returns attribution coverage");
includes("'missing_won_value_count'", "Dashboard returns missing won values");
includes("'workflow_linkage_gap_count'", "Dashboard returns authoritative workflow linkage gaps");
includes("'untracked_legacy_lead_count'", "Dashboard reports pre-migration leads without fabricating attribution");
includes("'untracked_legacy_lead_scope', 'company_month_unallocatable'", "Dashboard labels legacy gaps as company/month unallocatable");
includes("'untracked_legacy_lead_source_allocatable', false", "Dashboard refuses a fabricated source allocation for legacy gaps");
includes("not exists ( select 1 from public.lead_accountability", "Legacy/test records are counted as untracked rather than KPI cohort leads");

const legacyCountStart = normalized.indexOf(
  "select pg_catalog.count(*) into untracked_legacy_count",
);
const legacyCountEnd = normalized.indexOf(
  "select pg_catalog.count(*) into workflow_linkage_gap_count",
  legacyCountStart,
);
const legacyCountQuery = normalized.slice(legacyCountStart, legacyCountEnd);
check(
  legacyCountStart > -1 &&
    !legacyCountQuery.includes("target_source_key") &&
    legacyCountQuery.includes("lead.company_id = target_company_id") &&
    legacyCountQuery.includes("lead.created_at >= month_start") &&
    legacyCountQuery.includes("lead.created_at < month_end"),
  "Source-filtered reports retain the full company/month untracked legacy gap",
);

const readinessStart = repositorySource.indexOf(
  "export async function assertLeadAccountabilityIntakeReady",
);
const readinessEnd = repositorySource.indexOf("\nexport async function ", readinessStart + 1);
const readinessSource = repositorySource.slice(readinessStart, readinessEnd);
check(
  readinessSource.includes('.from("lead_accountability")') &&
    readinessSource.includes("getMarketingAccountabilityDashboard") &&
    readinessSource.includes("Lead accountability schema is unavailable; provider lead creation is blocked.") &&
    !readinessSource.includes("isMissing") &&
    !readinessSource.includes("fallback") &&
    !readinessSource.includes("catch"),
  "Provider readiness requires the accountability table and dashboard RPC with no missing-schema fallback",
);
check(
  /await assertLeadAccountabilityIntakeReady\(client, company\.id\);\s*const createdLead = await createLead\(/.test(
    leadIntakeSource,
  ),
  "Provider intake runs the strict accountability readiness check immediately before legacy lead creation",
);

const exactEventFetchStart = repositorySource.indexOf(
  "export async function getLeadAccountabilityEventsForRecord",
);
const exactEventFetchEnd = repositorySource.indexOf(
  "\nexport async function ",
  exactEventFetchStart + 1,
);
const exactEventFetchSource = repositorySource.slice(
  exactEventFetchStart,
  exactEventFetchEnd,
);
check(
  /\.from\("lead_accountability_events"\)\s*\.select\("\*"\)\s*\.order\("occurred_at", \{ ascending: false \}\)\s*\.limit\(500\)/.test(
    repositorySource,
  ) &&
  exactEventFetchSource.includes('.from("lead_accountability_events")') &&
    exactEventFetchSource.includes(
      '.eq("lead_accountability_id", input.accountabilityId)',
    ) &&
    exactEventFetchSource.includes('.eq("company_id", input.companyId)') &&
    exactEventFetchSource.includes('.eq("lead_id", input.leadId)') &&
    !exactEventFetchSource.includes(".limit("),
  "Selected live accountability actions fetch the exact company/lead/accountability ledger beyond the global 500-event snapshot cap",
);
check(
  appSource.includes(
    ": await getLeadAccountabilityEventsForRecord(client, {",
  ) &&
    appSource.includes(
      "accountabilityId: selectedOpportunityAccountability.id,",
    ) &&
    appSource.includes(
      "companyId: selectedOpportunityAccountability.company_id,",
    ) &&
    appSource.includes(
      "leadId: selectedOpportunityAccountability.lead_id,",
    ),
  "Live lifecycle preflight uses the exact selected-account event fetch instead of the capped global snapshot",
);

check(
  !/grant\s+(?:insert|update|all)[^;]*on\s+table\s+public\.(?:marketing_campaigns|lead_accountability|lead_accountability_events|marketing_spend_months)\s+to\s+(?:anon|authenticated)/i.test(sql),
  "Anonymous and authenticated callers receive no direct new-table write grants",
);
check(
  !/create\s+policy[\s\S]{0,180}\bfor\s+(?:insert|update|delete|all)\b/i.test(
    sql.slice(sql.indexOf('create policy "Company members read marketing campaigns"')),
  ),
  "New-table RLS policies are read-only",
);

console.log(`Lead attribution and marketing accountability migration contract: PASS (${assertionCount} assertions)`);
