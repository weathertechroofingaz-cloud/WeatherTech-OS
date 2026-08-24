import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const migrationName = "20260824044610_native_proposal_esign_sold_job_gate.sql";
const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", migrationName),
  "utf8",
);
const normalized = migration.replace(/\s+/g, " ").trim().toLowerCase();
const failures = [];
const proposalSigningConstants = readFileSync(
  join(process.cwd(), "lib", "proposal-signing", "constants.ts"),
  "utf8",
);
const proposalBuilderSource = readFileSync(
  join(process.cwd(), "lib", "crm", "proposals.ts"),
  "utf8",
);

function requireText(text, message) {
  if (!migration.includes(text)) failures.push(message);
}

function requireNormalized(text, message) {
  if (!normalized.includes(text.replace(/\s+/g, " ").trim().toLowerCase())) {
    failures.push(message);
  }
}

function reject(pattern, message, source = migration) {
  if (pattern.test(source)) failures.push(message);
}

function functionSource(name) {
  const marker = `create or replace function public.${name}`;
  const start = migration.indexOf(marker);
  if (start === -1) return "";
  const next = migration.indexOf("\ncreate or replace function public.", start + marker.length);
  return migration.slice(start, next === -1 ? undefined : next);
}

function requireBalancedPlpgsqlControlFlow(name) {
  const source = functionSource(name);
  const bodyStart = source.indexOf("as $$");
  const bodyEnd = source.indexOf("$$;", bodyStart + 5);
  if (bodyStart === -1 || bodyEnd === -1) {
    failures.push(`${name} must have a complete dollar-quoted PL/pgSQL body.`);
    return;
  }

  const body = source
    .slice(bodyStart + 5, bodyEnd)
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''");
  const ifOpenings = body.match(/^[ \t]*if\b/gim) ?? [];
  const ifClosings = body.match(/^[ \t]*end[ \t]+if[ \t]*;/gim) ?? [];
  const loopOpenings = body.match(/^[ \t]*loop[ \t]*$/gim) ?? [];
  const loopClosings = body.match(/^[ \t]*end[ \t]+loop[ \t]*;/gim) ?? [];
  if (ifOpenings.length !== ifClosings.length) {
    failures.push(
      `${name} must balance PL/pgSQL IF/END IF blocks (${ifOpenings.length}/${ifClosings.length}).`,
    );
  }
  if (loopOpenings.length !== loopClosings.length) {
    failures.push(
      `${name} must balance PL/pgSQL LOOP/END LOOP blocks (${loopOpenings.length}/${loopClosings.length}).`,
    );
  }

  let parenthesisDepth = 0;
  for (const character of body) {
    if (character === "(") parenthesisDepth += 1;
    if (character === ")") parenthesisDepth -= 1;
    if (parenthesisDepth < 0) break;
  }
  if (parenthesisDepth !== 0) {
    failures.push(`${name} must balance parentheses inside its PL/pgSQL body.`);
  }
}

if (!normalized.startsWith("begin;") || !normalized.endsWith("commit;")) {
  failures.push("Native proposal signing migration must use one explicit transaction.");
}
if ((migration.match(/^begin;$/gm) ?? []).length !== 1 ||
    (migration.match(/^commit;$/gm) ?? []).length !== 1) {
  failures.push("Native proposal signing migration must have exactly one outer BEGIN/COMMIT pair.");
}

for (const table of [
  "proposal_signing_requests",
  "proposal_signing_sessions",
  "proposal_signature_receipts",
  "proposal_native_rpc_guards",
  "proposal_synthetic_cleanup_guards",
]) {
  requireNormalized(`create table public.${table} (`, `${table} additive table is missing.`);
  requireNormalized(
    `alter table public.${table} enable row level security;`,
    `${table} must enable RLS.`,
  );
  requireNormalized(
    `alter table public.${table} force row level security;`,
    `${table} must force RLS.`,
  );
  requireNormalized(
    `revoke all on table public.${table} from public, anon, authenticated, service_role;`,
    `${table} must revoke every default/client privilege.`,
  );
}

const signingRequestSchema = migration.slice(
  migration.indexOf("create table public.proposal_signing_requests"),
  migration.indexOf("create table public.proposal_signing_sessions"),
);
for (const columnContract of [
  "request_token_sha256 text not null unique",
  "request_token_consumed_at timestamptz",
  "request_token_consumed_session_id uuid",
  "revision_sha256 text not null",
  "document_sha256 text not null",
  "terms_sha256 text not null",
  "consent_version text not null",
  "consent_text text not null",
  "consent_sha256 text not null",
  "intended_signer_name text not null",
  "intended_signer_email text not null",
  "delivery_email_message_id uuid",
  "exchange_attempt_count integer not null default 0",
  "session_read_attempt_count integer not null default 0",
  "action_attempt_count integer not null default 0",
]) {
  if (!signingRequestSchema.includes(columnContract)) {
    failures.push(`Signing-request schema is missing: ${columnContract}.`);
  }
}
reject(/\b(?:raw_token|request_token|session_token)\s+(?:text|varchar|character varying)\b/i,
  "Signing schema must never persist a raw request or session token.", signingRequestSchema);

for (const table of [
  "proposal_signing_requests",
  "proposal_signing_sessions",
  "proposal_signature_receipts",
  "proposal_native_rpc_guards",
  "proposal_synthetic_cleanup_guards",
]) {
  reject(
    new RegExp(`create\\s+policy\\s+"[^"]+"\\s+on\\s+public\\.${table}\\b`, "i"),
    `${table} must not expose a client RLS policy.`,
  );
  reject(
    new RegExp(`grant\\s+(?:all|insert|update|delete|truncate)\\s+on\\s+table\\s+public\\.${table}\\b`, "i"),
    `${table} must remain RPC-only for writes.`,
  );
}

const serviceRpcs = [
  "wtos_finalize_proposal_revision",
  "wtos_register_proposal_artifact",
  "wtos_prepare_proposal_signing_request",
  "wtos_transition_proposal_signing_request",
  "wtos_exchange_proposal_signing_token",
  "wtos_get_proposal_signing_session",
  "wtos_get_proposal_signing_receipt_recovery",
  "wtos_accept_proposal_signing",
  "wtos_decline_proposal_signing",
  "wtos_register_proposal_signing_receipt",
  "wtos_create_proposal_signature_email_draft",
  "wtos_activate_synthetic_proposal_signing_fixture",
  "wtos_transition_proposal_signature_email",
  "wtos_cleanup_synthetic_proposal_fixture",
];
const ownerRpcs = [
  "wtos_queue_proposal_signature_email",
  "wtos_create_proposal_deposit_invoice",
  "wtos_convert_proposal_to_sold_job",
];
for (const rpc of [...serviceRpcs, ...ownerRpcs]) {
  requireNormalized(
    `create or replace function public.${rpc}(`,
    `${rpc} RPC is missing.`,
  );
  requireNormalized(
    `revoke all on function public.${rpc}(jsonb) from public, anon, authenticated, service_role;`,
    `${rpc} must explicitly revoke default execution.`,
  );
}
for (const rpc of serviceRpcs) {
  requireNormalized(
    `grant execute on function public.${rpc}(jsonb) to service_role;`,
    `${rpc} must be service-role-only.`,
  );
}
for (const rpc of ownerRpcs) {
  requireNormalized(
    `grant execute on function public.${rpc}(jsonb) to authenticated;`,
    `${rpc} must expose only the authenticated owner entry point.`,
  );
  const source = functionSource(rpc);
  if (!source.includes("request_actor_user_id uuid := auth.uid()") ||
      !source.includes("perform public.wtos_assert_proposal_owner")) {
    failures.push(`${rpc} must derive auth.uid() and enforce exact owner membership.`);
  }
}
reject(/grant\s+execute[\s\S]*?\bto\s+(?:public|anon)\b/i,
  "No native signing RPC may be executable by PUBLIC or anon.");

const functionCount = (migration.match(/create or replace function public\./gi) ?? []).length;
const fixedPathCount = (migration.match(/set search_path = ''/gi) ?? []).length;
if (functionCount === 0 || fixedPathCount !== functionCount) {
  failures.push("Every migration-defined function must use a fixed empty search_path.");
}

for (const appendOnlyContract of [
  "estimate_proposal_acceptances_append_only",
  "proposal_audit_events_append_only",
  "proposal_signature_receipts_append_only",
  "Proposal acceptance, audit, and receipt evidence is append-only.",
  "Finalized proposal content and evidence bindings are immutable.",
  "Finalized proposal sections, options, and payment terms are immutable.",
  "Native proposal artifact bytes, digest, path, and scope are immutable.",
]) {
  requireText(appendOnlyContract, `Immutable evidence contract is missing: ${appendOnlyContract}.`);
}

const signatureImmutabilitySource = functionSource(
  "wtos_enforce_native_proposal_signature_immutability",
);
for (const signatureContract of [
  "signatures_enforce_native_proposal_immutability",
  "Native proposal signatures may be created only by the approved atomic signing-request RPC",
  "Native proposal signature lifecycle may change only inside an approved atomic proposal RPC.",
  "Signed native proposal signature identity and evidence are immutable.",
  "receipt.signed_document_id = new.signed_document_id",
  "acceptance.evidence_sha256 = new.evidence_sha256",
  "not public.wtos_is_native_proposal_rpc_authorized()",
  "document.category in ('proposal', 'signed_proposal')",
  "new.proposal_revision_id is distinct from new_document_revision_id",
  "old.proposal_revision_id is distinct from old_document_revision_id",
  "Every signature referencing a native proposal artifact must carry the exact proposal revision binding.",
]) {
  requireText(signatureContract, `Native signature immutability is missing: ${signatureContract}.`);
}
if (!signatureImmutabilitySource.includes("old.status = 'signed'") ||
    !signatureImmutabilitySource.includes("old.acceptance_id is not null") ||
    !signatureImmutabilitySource.includes("old.evidence_sha256 is not null")) {
  failures.push("Signed or evidence-bound native signatures must be permanently immutable.");
}
reject(/if\s+new\.proposal_revision_id\s+is\s+null\s+then\s+return\s+new;/i,
  "A null-linked signature must not bypass native proposal-document detection.",
  signatureImmutabilitySource);
reject(/if\s+old\.proposal_revision_id\s+is\s+null\s+and\s+new\.proposal_revision_id\s+is\s+null\s+then\s+return\s+new;/i,
  "Updating a legacy signature onto a native proposal document must not bypass exact revision binding.",
  signatureImmutabilitySource);

for (const guardedSignatureRpc of [
  "wtos_prepare_proposal_signing_request",
  "wtos_transition_proposal_signing_request",
  "wtos_exchange_proposal_signing_token",
  "wtos_accept_proposal_signing",
  "wtos_decline_proposal_signing",
  "wtos_register_proposal_signing_receipt",
]) {
  const source = functionSource(guardedSignatureRpc);
  const firstSignatureMutation = Math.min(
    ...["update public.signatures", "insert into public.signatures"]
      .map((needle) => source.indexOf(needle))
      .filter((index) => index !== -1),
  );
  if (!Number.isFinite(firstSignatureMutation) ||
      source.indexOf("perform public.wtos_begin_native_proposal_rpc_guard(") === -1 ||
      source.indexOf("perform public.wtos_begin_native_proposal_rpc_guard(") > firstSignatureMutation) {
    failures.push(`${guardedSignatureRpc} must enter the private guard before mutating a native signature.`);
  }
}

const childImmutabilitySource = functionSource(
  "wtos_enforce_finalized_proposal_child_immutability",
);
for (const scheduleContract of [
  "tg_table_name = 'proposal_payment_schedules'",
  "old_revision_is_finalized",
  "new_revision_is_finalized",
  "new.proposal_revision_id is distinct from old.proposal_revision_id",
  "A finalized proposal child cannot be reparented to another revision.",
  "array['invoice_id', 'status', 'updated_at']",
  "public.wtos_is_native_proposal_rpc_authorized()",
]) {
  if (!childImmutabilitySource.includes(scheduleContract)) {
    failures.push(`Finalized payment-schedule guard is missing: ${scheduleContract}.`);
  }
}
reject(/array\['invoice_id',\s*'status',\s*'due_date'/,
  "Finalized proposal payment due dates must not remain client-mutable.", childImmutabilitySource);

const depositInvoiceSource = functionSource("wtos_create_proposal_deposit_invoice");
const depositScheduleUpdate = depositInvoiceSource.slice(
  depositInvoiceSource.indexOf("update public.proposal_payment_schedules"),
  depositInvoiceSource.indexOf("perform public.wtos_end_native_proposal_rpc_guard"),
);
reject(/\bdue_date\s*=/i,
  "Deposit-invoice RPC must bind only invoice_id/status and preserve finalized due terms.",
  depositScheduleUpdate);

for (const guardContract of [
  "create table public.proposal_native_rpc_guards",
  "wtos_begin_native_proposal_rpc_guard",
  "wtos_end_native_proposal_rpc_guard",
  "wtos_is_native_proposal_rpc_authorized",
  "pg_catalog.pg_backend_pid()",
  "pg_catalog.txid_current()",
  "wtos.native_proposal_rpc_operation",
  "Finalized proposal lifecycle and evidence bindings may change only inside an approved atomic proposal RPC.",
  "Proposal finalization may occur only inside the approved atomic finalization RPC.",
]) {
  requireText(guardContract, `Private finalized-lifecycle guard is missing: ${guardContract}.`);
}
const beginGuardCalls = (migration.match(/perform public\.wtos_begin_native_proposal_rpc_guard\(/g) ?? []).length;
const endGuardCalls = (migration.match(/perform public\.wtos_end_native_proposal_rpc_guard\(/g) ?? []).length;
if (beginGuardCalls < 10 || beginGuardCalls !== endGuardCalls) {
  failures.push("Every native lifecycle guard must have an exact successful-path cleanup pair.");
}
requireNormalized(
  "before insert or update or delete on public.estimate_proposal_revisions",
  "Direct inserts and lifecycle updates of native finalized revisions must be trigger-guarded.",
);

for (const storageContract of [
  "create or replace function public.wtos_can_update_customer_document_object",
  "document.proposal_revision_id is not null",
  "document.immutable_after_at is not null",
  "drop policy if exists \"WTOS users update customer documents\" on storage.objects",
  "public.wtos_can_update_customer_document_object(bucket_id, name)",
  "request_company_id::text || '/proposals/' || request_revision_id::text || '/' || request_document_id::text || '.pdf'",
]) {
  requireText(storageContract, `Immutable private Storage contract is missing: ${storageContract}.`);
}
reject(/drop\s+policy\s+if\s+exists\s+"WTOS users (?:read|upload) customer documents"/i,
  "Native signing must not broaden or replace customer-document read/insert policy behavior.");

for (const tokenContract of [
  "request_token_consumed_at = attempt_time",
  "request_token_consumed_session_id = created_session.id",
  "selected_request.request_token_consumed_at is not null",
  "proposal_signing_requests_token_consumption_check",
  "attempt_count > 12",
  "attempt_count > 180",
  "exchange_blocked_until",
  "session_read_blocked_until",
  "action_blocked_until",
]) {
  requireText(tokenContract, `Single-use or bounded signing-session contract is missing: ${tokenContract}.`);
}
const requestTransitionSource = functionSource(
  "wtos_enforce_proposal_signing_request_transition",
);
for (const cleanupOnlyTokenResetContract of [
  "public.wtos_is_synthetic_proposal_cleanup_authorized()",
  "old.request_token_consumed_at is not null",
  "old.request_token_consumed_session_id is not null",
  "new.request_token_consumed_at is null",
  "new.request_token_consumed_session_id is null",
  "'request_token_consumed_at',\n      'request_token_consumed_session_id'",
]) {
  if (!requestTransitionSource.includes(cleanupOnlyTokenResetContract)) {
    failures.push(
      `Synthetic cleanup must narrowly authorize clearing consumed-token FK evidence: ${cleanupOnlyTokenResetContract}.`,
    );
  }
}
if (
  requestTransitionSource.indexOf(
    "public.wtos_is_synthetic_proposal_cleanup_authorized()",
  ) > requestTransitionSource.indexOf(
    "Signing request token consumption evidence is immutable.",
  )
) {
  failures.push(
    "The exact synthetic cleanup exception must be evaluated before ordinary consumed-token immutability.",
  );
}
const exchangeSource = functionSource("wtos_exchange_proposal_signing_token");
const exchangeRateAccountingIndex = exchangeSource.indexOf(
  "exchange_attempt_count = attempt_count",
);
const consumedRetryIndex = exchangeSource.indexOf(
  "if selected_request.request_token_consumed_at is not null then",
);
const newSessionExpiryValidationIndex = exchangeSource.indexOf(
  "if request_session_expires_at <= attempt_time",
);
if (exchangeRateAccountingIndex === -1 || consumedRetryIndex === -1 ||
    newSessionExpiryValidationIndex === -1 ||
    !(exchangeRateAccountingIndex < consumedRetryIndex &&
      consumedRetryIndex < newSessionExpiryValidationIndex)) {
  failures.push("Idempotent exchange retry must remain rate-controlled and precede validation used only for a new session expiry.");
}
for (const cappedSessionContract of [
  "request_session_expires_at := least(",
  "selected_request.expires_at",
  "attempt_time + interval '24 hours'",
]) {
  if (!exchangeSource.includes(cappedSessionContract)) {
    failures.push(`Near-expiry signing sessions must be capped rather than rejected: ${cappedSessionContract}.`);
  }
}
reject(
  /request_session_expires_at\s*>\s*least\s*\(/i,
  "A still-valid request near expiry must cap its session deadline instead of rejecting a longer requested lifetime.",
  exchangeSource,
);
const selfHealIndex = exchangeSource.indexOf(
  "if selected_request.status = 'prepared' then",
);
const requestExpiryIndex = exchangeSource.indexOf(
  "selected_request.expires_at <= attempt_time",
);
if (requestExpiryIndex === -1 || selfHealIndex === -1 ||
    requestExpiryIndex > selfHealIndex) {
  failures.push("Provider-confirmed self-heal must reject an expired signing request before activating it.");
}
const consumedRetrySource = exchangeSource.slice(
  consumedRetryIndex,
  newSessionExpiryValidationIndex,
);
for (const retryContract of [
  "session.id = selected_request.request_token_consumed_session_id",
  "session.company_id = selected_request.company_id",
  "session.signing_request_id = selected_request.id",
  "session.session_token_sha256 = request_session_sha256",
  "for update;",
  "created_session.status <> 'active'",
  "created_session.expires_at <= attempt_time",
  "selected_request.status <> 'viewed'",
  "'sessionId', created_session.id",
  "'sessionExpiresAt', created_session.expires_at",
]) {
  if (!consumedRetrySource.includes(retryContract)) {
    failures.push(`Response-loss-safe exact exchange retry is missing: ${retryContract}.`);
  }
}
if (exchangeSource.indexOf(
  "selected_request.request_token_sha256 is distinct from request_token_sha256",
) > consumedRetryIndex) {
  failures.push("A consumed-token retry must verify the exact original request-token digest before consulting its bound session.");
}
reject(/created_session\.status\s+(?:in|=)\s*\([^)]*(?:signed|declined|revoked)|created_session\.status\s*=\s*'(?:signed|declined|revoked)'/i,
  "Exchange retry must never reopen a signed, declined, or revoked session.",
  consumedRetrySource);
requireNormalized(
  "or selected_session.expires_at <= access_time or selected_request.expires_at <= access_time",
  "Signed/declined session reads must remain bounded by request and session expiry.",
);

for (const deliveryContract of [
  "email_messages_one_active_proposal_signature_draft_idx",
  "metadata ->> 'draftType' = 'proposal_signature_request'",
  "email.status = 'queued'",
  "email.sync_status = 'syncing'",
  "email.status = 'sent'",
  "email.sync_status = 'sent'",
  "nullif(email.gmail_message_id, '') is not null",
  "Activated an exact delivered signing request from durable Gmail provider evidence.",
]) {
  requireText(deliveryContract, `Truthful signing-delivery contract is missing: ${deliveryContract}.`);
}

const signatureEmailGuardSource = functionSource(
  "wtos_enforce_proposal_signature_email_security",
);
const signatureEmailCreateSource = functionSource(
  "wtos_create_proposal_signature_email_draft",
);
const signatureEmailQueueSource = functionSource(
  "wtos_queue_proposal_signature_email",
);
const syntheticSignatureActivationSource = functionSource(
  "wtos_activate_synthetic_proposal_signing_fixture",
);
const signatureEmailDeliverySource = functionSource(
  "wtos_transition_proposal_signature_email",
);
for (const signatureEmailContract of [
  "email_messages_enforce_proposal_signature_security",
  "before insert or update or delete on public.email_messages",
  "Proposal signature email drafts and provider delivery evidence may change only inside an approved private RPC.",
  "Proposal signature email recipient, content, mailbox, artifact, and company identity are immutable.",
  "proposal_signature_email_delivery_recover_pre_send",
  "Provider-confirmed Gmail message identity is immutable.",
  "Sent proposal signature email state requires exact durable Gmail provider evidence.",
  "target_signing_request.intended_signer_email",
  "target_signing_request.delivery_email_message_id is distinct from new.id",
  "Stored proposal signature email drafts must remain token-free with one exact signing-link placeholder.",
]) {
  if (!signatureEmailGuardSource.includes(signatureEmailContract)) {
    failures.push(`Proposal signature email trigger contract is missing: ${signatureEmailContract}.`);
  }
}
for (const signatureEmailCreateContract of [
  "create_proposal_signature_email_draft",
  "perform public.wtos_assert_proposal_owner",
  "selected_revision.finalized_document_id is distinct from selected_document.id",
  "lower(selected_customer.email) is distinct from request_to_email",
  "length(request_body) - length(replace(request_body, link_placeholder, ''))",
  "'proposalSigningRequestId', request_signing_request_id",
  "'proposalDocumentSha256', selected_document.content_sha256",
]) {
  if (!signatureEmailCreateSource.includes(signatureEmailCreateContract)) {
    failures.push(`Guarded signature-email draft creation is missing: ${signatureEmailCreateContract}.`);
  }
}
for (const signatureEmailQueueContract of [
  "request_actor_user_id uuid := auth.uid()",
  "perform public.wtos_assert_proposal_owner",
  "request_payload_fingerprint !~ '^gmail-v1-[0-9a-f]{8}$'",
  "selected_email.status <> 'draft' or selected_email.sync_status <> 'local'",
  "'approvalState', 'pending_owner_approval'",
]) {
  if (!signatureEmailQueueSource.includes(signatureEmailQueueContract)) {
    failures.push(`Authenticated signature-email queue transition is missing: ${signatureEmailQueueContract}.`);
  }
}
for (const signatureEmailDeliveryContract of [
  "'recover_pre_send'",
  "'claim_send'",
  "'checkpoint_provider'",
  "'mark_sent'",
  "'cancel_unsent'",
  "'abandon_unknown'",
  "'reconcile_delivery'",
  "selected_email.metadata ->> 'gmailDeliveryState' = 'claimed_pre_send'",
  "when request_action = 'recover_pre_send' then null",
  "request_metadata ->> 'gmailDeliveryState' = 'provider_confirmed'",
  "request_expected_gmail_message_id = selected_email.gmail_message_id",
  "'proposal_signature_email_delivery_' || request_action",
  "selected_signing_request.status <> 'prepared'",
  "selected_revision.status <> 'ready_to_send'",
  "The exact active prepared signing request is no longer eligible for a Gmail provider call.",
]) {
  if (!signatureEmailDeliverySource.includes(signatureEmailDeliveryContract)) {
    failures.push(`Service-only signature-email delivery transition is missing: ${signatureEmailDeliveryContract}.`);
  }
}
for (const abandonUnknownContract of [
  "request_action = 'abandon_unknown'",
  "selected_email.metadata ->> 'gmailDeliveryState'\n        = 'provider_outcome_unknown'",
  "request_metadata ->> 'gmailDeliveryState'\n        = 'provider_outcome_abandoned'",
  "signing_request.status = 'revoked'",
  "signature.status = 'revoked'",
  "session.status = 'active'",
  "selected_email.gmail_message_id is null",
]) {
  if (!signatureEmailDeliverySource.includes(abandonUnknownContract)) {
    failures.push(`Fail-closed unknown-provider abandonment is missing: ${abandonUnknownContract}.`);
  }
}
if ((signatureEmailDeliverySource.match(
  /when request_action = 'recover_pre_send' then null/g,
) ?? []).length < 2) {
  failures.push("Exact pre-provider recovery must clear both claim-only provider account and payload hash evidence.");
}
for (const syntheticActivationContract of [
  "weathertech-os-regression-owner-v1",
  "hygtnhmmaoboduqghhwg",
  "request_run_id !~ '^[0-9]{17}$'",
  "weathertech-os-regression@example.test",
  "regressionSyntheticDelivery",
  "'gmailDeliveryState', 'provider_confirmed'",
  "'proposalSigningRequestId', request_signing_request_id",
  "perform public.wtos_begin_native_proposal_rpc_guard(\n    'activate_synthetic_proposal_signing_fixture'",
]) {
  if (!syntheticSignatureActivationSource.includes(syntheticActivationContract)) {
    failures.push(`Isolated synthetic signature activation is missing: ${syntheticActivationContract}.`);
  }
}
for (const cancelUnsentContract of [
  "request_action = 'cancel_unsent'",
  "selected_email.status = 'draft'",
  "selected_email.sync_status = 'local'",
  "selected_email.status = 'queued'",
  "selected_email.sync_status = 'queued'",
  "selected_email.gmail_message_id is null",
  "selected_email.provider_payload_hash is null",
  "request_metadata ->> 'approvalState' in (",
  "from public.proposal_signing_requests as signing_request",
]) {
  if (!signatureEmailDeliverySource.includes(cancelUnsentContract)) {
    failures.push(`Fail-closed unsent signature-email cancellation is missing: ${cancelUnsentContract}.`);
  }
}
reject(/grant execute on function public\.wtos_(?:create|transition)_proposal_signature_email\(jsonb\)\s+to authenticated/i,
  "Signature email create/provider-delivery transitions must never be client executable.");

const prepareSource = functionSource("wtos_prepare_proposal_signing_request");
const signingRequestTransitionSource = functionSource(
  "wtos_transition_proposal_signing_request",
);
if (!signingRequestTransitionSource.includes(
  "and selected_request.expires_at <= transition_time",
) || !signingRequestTransitionSource.includes(
  "Provider-confirmed delivery is preserved, but an expired signing request cannot be activated; revoke it and issue a new link.",
)) {
  failures.push("Provider-confirmed mark_sent must never activate an expired signing request.");
}
for (const activeRequestContract of [
  "An active signing request must be explicitly revoked before preparing a replacement.",
  "active_request.status in ('prepared', 'sent', 'viewed')",
  "A concurrent exact retry waits on the revision lock above.",
]) {
  if (!prepareSource.includes(activeRequestContract)) {
    failures.push(`Fail-closed signing-request replacement contract is missing: ${activeRequestContract}.`);
  }
}
if ((prepareSource.match(/where prepared_request\.operation_key = request_operation_key/g) ?? []).length < 2) {
  failures.push("Concurrent identical signing-request preparation must re-read its exact idempotency identity after the revision lock.");
}
reject(
  /update public\.proposal_signing_requests as active_request[\s\S]*?status = 'revoked'/i,
  "Ordinary signing-request preparation must never silently revoke an active request.",
  prepareSource,
);
for (const syntheticPrepareContract of [
  "email.metadata ->> 'regressionSyntheticDelivery' = 'true'",
  "email.from_email = 'weathertech-os-regression@example.test'",
  "'regression-' || (email.metadata ->> 'proposalSigningRequestId')",
]) {
  if (!prepareSource.includes(syntheticPrepareContract)) {
    failures.push(`Prepare RPC isolated synthetic-email boundary is missing: ${syntheticPrepareContract}.`);
  }
}
const consentTextConstantMatch = proposalSigningConstants.match(
  /export const PROPOSAL_SIGNING_CONSENT_TEXT\s*=\s*("(?:\\.|[^"\\])*");/s,
);
const consentVersionConstantMatch = proposalSigningConstants.match(
  /export const PROPOSAL_SIGNING_CONSENT_VERSION\s*=\s*("(?:\\.|[^"\\])*");/s,
);
const sqlConsentTextMatch = prepareSource.match(
  /expected_consent_text constant text := '((?:''|[^'])*)';/,
);
const sqlConsentConstraintMatch = signingRequestSchema.match(
  /constraint proposal_signing_requests_consent_text_check[\s\S]*?consent_text = '((?:''|[^'])*)'/,
);
if (!consentTextConstantMatch || !consentVersionConstantMatch ||
    !sqlConsentTextMatch || !sqlConsentConstraintMatch) {
  failures.push("Application and SQL electronic-consent constants must remain statically extractable.");
} else {
  const appConsentText = JSON.parse(consentTextConstantMatch[1]);
  const appConsentVersion = JSON.parse(consentVersionConstantMatch[1]);
  const sqlConsentText = sqlConsentTextMatch[1].replace(/''/g, "'");
  const sqlConsentConstraintText = sqlConsentConstraintMatch[1].replace(/''/g, "'");
  const appConsentSha256 = createHash("sha256").update(appConsentText, "utf8").digest("hex");
  const sqlConsentSha256 = createHash("sha256").update(sqlConsentText, "utf8").digest("hex");
  const sqlConsentConstraintSha256 = createHash("sha256")
    .update(sqlConsentConstraintText, "utf8")
    .digest("hex");
  if (sqlConsentText !== appConsentText ||
      sqlConsentConstraintText !== appConsentText ||
      sqlConsentSha256 !== appConsentSha256 ||
      sqlConsentConstraintSha256 !== appConsentSha256) {
    failures.push("Prepare RPC and signing-request CHECK consent text/SHA must exactly match the shared application disclosure.");
  }
  if (!prepareSource.includes(`request_consent_version <> '${appConsentVersion}'`)) {
    failures.push("Prepare RPC consent version must exactly match the shared application version.");
  }
  if (!signingRequestSchema.includes(`check (consent_version = '${appConsentVersion}')`)) {
    failures.push("Signing-request CHECK consent version must exactly match the shared application version.");
  }
  for (const digestContract of [
    "extensions.digest(convert_to(expected_consent_text, 'UTF8'), 'sha256')",
    "request_consent_sha256 is distinct from encode(",
  ]) {
    if (!prepareSource.includes(digestContract)) {
      failures.push(`Prepare RPC consent digest contract is missing: ${digestContract}.`);
    }
  }
}

for (const acceptanceContract of [
  "selected_estimate.status <> 'approved'",
  "Only an owner-approved estimate can be finalized as an immutable proposal.",
  "option.selected is distinct from (option.id = any(request_selected_option_ids))",
  "Selected proposal option dependencies must also be selected",
  "evidence_sha256",
  "calculated_evidence_sha256",
  "acceptance_method <> 'native_electronic'",
  "new.signer_name is distinct from selected_request.intended_signer_name",
  "or not public.wtos_is_native_proposal_rpc_authorized()",
  "and session.status = 'active'",
  "and session.expires_at > new.accepted_at",
]) {
  requireText(acceptanceContract, `Exact native acceptance contract is missing: ${acceptanceContract}.`);
}
requireNormalized(
  "required_deposit_amount, evidence_sha256 ) values",
  "Native acceptance INSERT must target the real evidence_sha256 column.",
);

const acceptSource = functionSource("wtos_accept_proposal_signing");
for (const signerEvidenceContract of [
  "regexp_replace(btrim(signing_request ->> 'signerName'), '\\s+', ' ', 'g')",
  "selected_request.intended_signer_name is distinct from request_signer_name",
  "'signerName', selected_request.intended_signer_name",
  "'acceptedTotal', selected_revision.accepted_total",
  "signer_name = selected_request.intended_signer_name",
  "signature_data = '/s/ ' || selected_request.intended_signer_name",
]) {
  if (!acceptSource.includes(signerEvidenceContract)) {
    failures.push(`Canonical signer evidence contract is missing: ${signerEvidenceContract}.`);
  }
}
reject(
  /lower\s*\(\s*regexp_replace\s*\([^)]*(?:request_signer_name|intended_signer_name)/i,
  "Signer-name acceptance must preserve exact Unicode/case instead of comparing case-insensitively.",
  acceptSource,
);
if ((acceptSource.match(/selected_request\.intended_signer_name/g) ?? []).length < 6) {
  failures.push("Acceptance must persist the frozen intended signer name throughout evidence and signature rows.");
}

const finalizeSource = functionSource("wtos_finalize_proposal_revision");
requireBalancedPlpgsqlControlFlow("wtos_finalize_proposal_revision");
if (!/request_brand_accent_color\s+is\s+distinct\s+from\s*\(\s*case[\s\S]*?end\s*\)\s*then/i.test(
  finalizeSource,
)) {
  failures.push(
    "Finalization must parenthesize the terminal brand-accent CASE before the PL/pgSQL THEN boundary.",
  );
}
reject(
  /request_brand_accent_color\s+is\s+distinct\s+from\s+case[\s\S]*?end\s+then/i,
  "A bare terminal CASE followed by END THEN is ambiguous to the PL/pgSQL parser.",
  finalizeSource,
);
const artifactRegistrationSource = functionSource(
  "wtos_register_proposal_artifact",
);
const customerTextScrubSource = functionSource("wtos_scrub_proposal_customer_text");
const sourceCurrentSource = functionSource("wtos_native_proposal_source_is_current");
const estimateIdentityGuardSource = functionSource(
  "wtos_enforce_finalized_proposal_estimate_identity",
);
const artifactRevisionLockIndex = artifactRegistrationSource.indexOf(
  "where revision.id = request_revision_id\n    and revision.company_id = request_company_id\n  for update;",
);
const artifactIdentityReads = [...artifactRegistrationSource.matchAll(
  /where document\.artifact_operation_key = request_operation_key/g,
)].map((match) => match.index ?? -1);
if (artifactRevisionLockIndex === -1 || artifactIdentityReads.length < 2 ||
    artifactIdentityReads[1] < artifactRevisionLockIndex) {
  failures.push("Concurrent proposal artifact registration must re-read exact document identity after estimate/revision serialization.");
}
for (const finalizeEnvelopeContract of [
  "'proposalStatus', existing_revision.status",
  "'proposalStatus', 'approved_internally'",
]) {
  if (!finalizeSource.includes(finalizeEnvelopeContract)) {
    failures.push(`Truthful finalization response contract is missing: ${finalizeEnvelopeContract}.`);
  }
}
for (const scrubContract of [
  "regexp_split_to_table(coalesce(source_text, ''), E'\\r?\\n')",
  "string_agg(",
  "source_line.line_value !~*",
  "cost|margin|markup|commission|profit|private|internal|labor rate|supplier cost",
  "btrim(",
]) {
  if (!customerTextScrubSource.includes(scrubContract)) {
    failures.push(`Server customer-text scrub contract is missing: ${scrubContract}.`);
  }
}

for (const sourceSnapshotContract of [
  "'sourceFingerprint', request_operation_key",
  "'sourceCompanyUpdatedAt', selected_company.updated_at",
  "'sourceEstimateUpdatedAt', selected_estimate.updated_at",
  "'sourceCustomerId', selected_customer.id",
  "'sourceCustomerUpdatedAt', selected_customer.updated_at",
  "'sourceCustomerName', request_source_customer_name",
  "'sourcePropertyId', selected_property.id",
  "'sourcePropertyUpdatedAt', selected_property.updated_at",
  "'sourcePropertyAddress', property_address",
  "'sourceLineItems', locked_source_line_items",
]) {
  if (!finalizeSource.includes(sourceSnapshotContract)) {
    failures.push(`Finalized source snapshot is missing exact locked evidence: ${sourceSnapshotContract}.`);
  }
}
for (const sourceCurrentContract of [
  "from public.estimates as estimate",
  "for update;",
  "from public.estimate_line_items as line_item",
  "order by line_item.id",
  "for share;",
  "selected_revision.source_snapshot ->> 'sourceFingerprint'",
  "selected_revision.source_snapshot -> 'sourceLineItems'",
  "selected_revision.customer_id is not distinct from selected_estimate.customer_id",
  "selected_revision.lead_id is not distinct from selected_estimate.lead_id",
  "selected_revision.property_id is not distinct from selected_estimate.property_id",
  "selected_revision.status in (",
  "selected_revision.accepted_acceptance_id is null",
]) {
  if (!sourceCurrentSource.includes(sourceCurrentContract)) {
    failures.push(`Pre-delivery finalized-source proof is missing: ${sourceCurrentContract}.`);
  }
}
if (!proposalBuilderSource.includes("revision.lead_id !== estimate.lead_id")) {
  failures.push(
    "Owner proposal source-drift readiness must enforce the same frozen lead identity as the database gate.",
  );
}
for (const providerSupersessionContract of [
  "email.sync_status = 'syncing'",
  "email.status = 'sent'",
  "email.metadata ->> 'gmailDeliveryState' = 'provider_confirmed'",
  "terminal_request.status in (",
  "'revoked'",
  "terminal_session.status = 'active'",
  "Proposal delivery is in progress or provider-confirmed and must be reconciled before finalizing a replacement revision.",
]) {
  if (!finalizeSource.includes(providerSupersessionContract)) {
    failures.push(`Provider-safe finalization serialization is missing: ${providerSupersessionContract}.`);
  }
}
const finalizeEstimateLockPosition = finalizeSource.indexOf(
  "where estimate.id = request_estimate_id\n    and estimate.company_id = request_company_id\n  for update;",
);
const finalizeActiveRequestLockPosition = finalizeSource.indexOf(
  "for update of signing_request;",
);
const prepareSourceLockPosition = prepareSource.indexOf(
  "wtos_native_proposal_source_is_current",
);
const prepareActiveRequestLockPosition = prepareSource.indexOf(
  "for update;",
  prepareSource.indexOf("from public.proposal_signing_requests as active_request"),
);
if (finalizeEstimateLockPosition === -1 || finalizeActiveRequestLockPosition === -1 ||
    finalizeEstimateLockPosition > finalizeActiveRequestLockPosition ||
    prepareSourceLockPosition === -1 || prepareActiveRequestLockPosition === -1 ||
    prepareSourceLockPosition > prepareActiveRequestLockPosition) {
  failures.push("Finalize and prepare must share the estimate-first serialization boundary before active signing-request locks.");
}
for (const sourceGate of [
  signatureEmailCreateSource,
  prepareSource,
  acceptSource,
  signatureEmailDeliverySource,
]) {
  if (!sourceGate.includes("wtos_native_proposal_source_is_current")) {
    failures.push("Every draft/prepare/provider/accept boundary must revalidate the exact finalized proposal source.");
  }
}
if (depositInvoiceSource.includes("wtos_native_proposal_source_is_current") ||
    functionSource("wtos_convert_proposal_to_sold_job").includes(
      "wtos_native_proposal_source_is_current",
    )) {
  failures.push("Post-acceptance deposit and sold-job operations must trust immutable signed evidence instead of broad mutable source versions.");
}
for (const estimateIdentityContract of [
  "estimates_enforce_finalized_proposal_identity",
  "before update of company_id, customer_id, lead_id, property_id",
  "revision.finalization_operation_key is not null",
  "An estimate with a finalized native proposal cannot be reassigned to another company.",
  "revision.accepted_acceptance_id is not null",
  "signing_request.status in ('prepared', 'sent', 'viewed')",
  "session.status = 'active'",
  "email.status in ('draft', 'queued')",
  "email.metadata ->> 'gmailDeliveryState'\n                = 'provider_outcome_unknown'",
  "A customer-active, provider-in-flight, signed, or converted native proposal estimate cannot be reassigned to another customer, lead, or property.",
]) {
  if (!estimateIdentityGuardSource.includes(estimateIdentityContract) &&
      !migration.includes(estimateIdentityContract)) {
    failures.push(`Finalized estimate identity protection is missing: ${estimateIdentityContract}.`);
  }
}
for (const explicitRevocationContract of [
  "Every active signing request and session must be explicitly revoked before finalizing a replacement revision.",
  "signing_request.status in ('prepared', 'sent', 'viewed')",
  "session.status = 'active'",
]) {
  if (!finalizeSource.includes(explicitRevocationContract)) {
    failures.push(`Finalization explicit-revocation gate is missing: ${explicitRevocationContract}.`);
  }
}
reject(
  /update public\.proposal_signing_requests as signing_request[\s\S]*?status = 'superseded'/i,
  "Finalization must never silently supersede an active signing request.",
  finalizeSource,
);

for (const lockedSourceContract of [
  "finalization_request ->> 'sourceCompanyUpdatedAt'",
  "finalization_request ->> 'sourceEstimateUpdatedAt'",
  "finalization_request ->> 'sourceCustomerId'",
  "finalization_request ->> 'sourceCustomerUpdatedAt'",
  "finalization_request ->> 'sourceCustomerName'",
  "finalization_request ->> 'sourcePropertyId'",
  "finalization_request ->> 'sourcePropertyUpdatedAt'",
  "finalization_request ->> 'sourcePropertyAddress'",
  "finalization_request -> 'sourceLineItems'",
  "from public.companies as company\n  where company.id = request_company_id\n  for share;",
  "from public.customers as customer",
  "from public.properties as property",
  "'updatedAt', line_item.updated_at",
  "locked_source_line_items is distinct from request_source_line_items",
  "selected_company.updated_at is distinct from request_source_company_updated_at",
  "selected_estimate.updated_at is distinct from request_source_estimate_updated_at",
  "selected_customer.updated_at is distinct from request_source_customer_updated_at",
  "selected_property.updated_at is distinct from request_source_property_updated_at",
  "Proposal source identity or version changed before its deterministic finalization lock.",
  "Proposal branding must match the exact locked company source.",
  "perform line_item.id",
  "order by line_item.id",
  "for update;",
  "get diagnostics locked_line_item_count = row_count;",
  "source_line_item_count is distinct from locked_line_item_count",
  "line_item.quantity\n          * line_item.unit_price\n          * (1 + line_item.markup_rate / 100)",
  "coalesce(bool_and(stored_total = calculated_total), false)",
  "selected_estimate.subtotal is distinct from source_base_subtotal",
  "selected_estimate.labor_total is distinct from source_labor_total",
  "selected_estimate.material_total is distinct from source_material_total",
  "selected_estimate.discount_total is distinct from source_discount_total",
  "selected_estimate.tax_total is distinct from source_tax_total",
  "selected_estimate.profit_margin_total is distinct from source_profit_margin_total",
  "selected_estimate.total is distinct from source_base_total",
  "request_base_subtotal is distinct from source_base_subtotal",
  "request_discount_total is distinct from source_discount_total",
  "request_tax_total is distinct from source_tax_total",
  "request_fee_total is distinct from 0::numeric",
  "request_base_total is distinct from source_base_total",
  "request_deposit_type = 'percent' and request_deposit_value > 100",
  "A percentage proposal deposit cannot exceed 100 percent.",
  "Proposal totals must exactly match the deterministically locked estimate and line-item source.",
]) {
  if (!finalizeSource.includes(lockedSourceContract)) {
    failures.push(`Locked estimate-source finalization contract is missing: ${lockedSourceContract}.`);
  }
}

const estimateLockIndex = finalizeSource.indexOf(
  "where estimate.id = request_estimate_id\n    and estimate.company_id = request_company_id\n  for update;",
);
const finalizationKeyReads = [...finalizeSource.matchAll(
  /where revision\.finalization_operation_key = request_operation_key/g,
)].map((match) => match.index ?? -1);
if (estimateLockIndex === -1 || finalizationKeyReads.length < 2 ||
    finalizationKeyReads[1] < estimateLockIndex) {
  failures.push("Concurrent identical finalization must re-read its operation key after the estimate serialization lock.");
}

for (const customerFacingBoundary of [
  "Proposal title, terms, and customer-visible notes cannot contain internal financial or private text.",
  "Finalized customer proposal sections must be visible and free of internal financial or private text.",
  "Finalized customer proposal options must be visible and free of internal financial or private text.",
  "public.wtos_scrub_proposal_customer_text(option_item ->> 'name')",
  "coalesce(option_item ->> 'unit', '')",
  "coalesce(option_item ->> 'warrantyEffect', '')",
  "coalesce(option_item ->> 'scopeDetails', '')",
  "coalesce(option_item ->> 'customerNotes', '')",
]) {
  if (!finalizeSource.includes(customerFacingBoundary)) {
    failures.push(`Server customer-visible finalization boundary is missing: ${customerFacingBoundary}.`);
  }
}

for (const canonicalLineItemContract of [
  "'name', public.wtos_scrub_proposal_customer_text(item.name)",
  "'description', nullif(",
  "public.wtos_scrub_proposal_customer_text(item.description)",
  "'unit', public.wtos_scrub_proposal_customer_text(item.unit)",
  "'baseSubtotal', source_base_subtotal",
  "'discountTotal', source_discount_total",
  "'taxTotal', source_tax_total",
  "'baseTotal', source_base_total",
]) {
  if (!finalizeSource.includes(canonicalLineItemContract)) {
    failures.push(`Canonical locked proposal snapshot is missing: ${canonicalLineItemContract}.`);
  }
}

requireNormalized(
  "select count(*), max(round(option.price * option.quantity, 2))",
  "A selected full-alternate option with fractional quantity must round its extended price to cents.",
);
const fractionalOptionCentRound =
  "round((option_item ->> 'price')::numeric * (option_item ->> 'quantity')::numeric, 2)";
if ((finalizeSource.match(new RegExp(
  fractionalOptionCentRound.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "g",
)) ?? []).length < 2) {
  failures.push("Additive and replace-base options must both round fractional-quantity extended prices to cents.");
}
reject(
  /round\s*\(\s*\(option_item ->> 'price'\)::numeric\s*,\s*2\s*\)\s*\*\s*\(option_item ->> 'quantity'\)::numeric/i,
  "Option unit prices must not be rounded before multiplying a fractional quantity.",
  finalizeSource,
);

for (const finiteContract of [
  "request_base_subtotal::text in ('NaN', 'Infinity', '-Infinity')",
  "request_discount_total::text in ('NaN', 'Infinity', '-Infinity')",
  "request_tax_total::text in ('NaN', 'Infinity', '-Infinity')",
  "request_fee_total::text in ('NaN', 'Infinity', '-Infinity')",
  "request_base_total::text in ('NaN', 'Infinity', '-Infinity')",
  "request_deposit_value::text in ('NaN', 'Infinity', '-Infinity')",
  "line_item.quantity::text in ('NaN', 'Infinity', '-Infinity')",
  "option_quantity::text in ('NaN', 'Infinity', '-Infinity')",
  "option_price::text in ('NaN', 'Infinity', '-Infinity')",
  "option_base_replacement_amount::text in ('NaN', 'Infinity', '-Infinity')",
  "calculated_accepted_total::text in ('NaN', 'Infinity', '-Infinity')",
  "calculated_required_deposit_amount::text in ('NaN', 'Infinity', '-Infinity')",
]) {
  if (!finalizeSource.includes(finiteContract)) {
    failures.push(`Proposal finalization finite-number guard is missing: ${finiteContract}.`);
  }
}
reject(/=\s*'NaN'::numeric/i,
  "NaN-only checks are insufficient because PostgreSQL numeric also supports positive and negative Infinity.",
  finalizeSource);

for (const finiteAcceptanceContract of [
  "request_accepted_total::text in ('NaN', 'Infinity', '-Infinity')",
  "selected_revision.accepted_total::text in ('NaN', 'Infinity', '-Infinity')",
  "selected_revision.deposit_amount::text in ('NaN', 'Infinity', '-Infinity')",
]) {
  if (!acceptSource.includes(finiteAcceptanceContract)) {
    failures.push(`Native acceptance finite-number guard is missing: ${finiteAcceptanceContract}.`);
  }
}

const acceptanceScopeSource = functionSource(
  "wtos_validate_native_proposal_acceptance_scope",
);
for (const nativeRevisionAcceptanceContract of [
  "selected_revision.finalization_operation_key is not null",
  "selected_revision.revision_sha256 is not null",
  "selected_revision.finalized_at is not null",
  "A native-finalized proposal revision may be accepted only through the exact guarded native electronic-signature workflow.",
]) {
  if (!acceptanceScopeSource.includes(nativeRevisionAcceptanceContract)) {
    failures.push(`Native-finalized revision acceptance guard is missing: ${nativeRevisionAcceptanceContract}.`);
  }
}
reject(/if\s+new\.acceptance_method\s*<>\s*'native_electronic'\s+then\s+return\s+new;/i,
  "Non-native acceptance methods must not bypass native-finalized revision detection.",
  acceptanceScopeSource);

const recoverySource = functionSource("wtos_get_proposal_signing_receipt_recovery");
for (const recoveryContract of [
  "requestId",
  "companyId",
  "proposalRevisionId",
  "acceptanceId",
  "for share",
  "selected_request.status <> 'signed'",
  "selected_session.status <> 'signed'",
  "selected_revision.status not in ('accepted', 'converted_to_job')",
  "receipt_payload",
  "'status', 'signed'",
]) {
  if (!recoverySource.includes(recoveryContract)) {
    failures.push(`Receipt-recovery RPC is missing exact contract: ${recoveryContract}.`);
  }
}
reject(/(?:tokenHash|sessionHash|request_token_sha256|session_token_sha256)/,
  "Receipt recovery must not accept or return token/session secrets or hashes.", recoverySource);

for (const conversionContract of [
  "jobs_enforce_native_proposal_conversion_insert",
  "jobs_enforce_native_proposal_conversion_update",
  "A job for an estimate with a finalized native proposal must use the exact signed proposal conversion gate.",
  "linked_acceptance.acceptance_method <> 'native_electronic'",
  "receipt.signed_document_id = linked_revision.signed_document_id",
  "payment.status = 'posted'",
  "posted_deposit < linked_acceptance.required_deposit_amount",
  "invoice.invoice_purpose = 'proposal_deposit'",
  "invoice.status <> 'void'",
  "payment.customer_id is not distinct from invoice.customer_id",
  "Proposal-linked sold jobs may be created only inside the authenticated owner conversion RPC.",
  "Exact proposal deposit invoice linkage may be created only inside the authenticated owner RPC.",
  "estimate.customer_id is not distinct from linked_revision.customer_id",
  "estimate.lead_id is not distinct from linked_revision.lead_id",
  "estimate.property_id is not distinct from linked_revision.property_id",
  "selected_estimate.customer_id is distinct from selected_revision.customer_id",
  "selected_estimate.lead_id is distinct from selected_revision.lead_id",
  "selected_estimate.property_id is distinct from selected_revision.property_id",
]) {
  requireText(conversionContract, `Server-enforced sold-job gate is missing: ${conversionContract}.`);
}

const jobGateSource = functionSource("wtos_enforce_native_proposal_job_conversion");
const invoiceGateSource = functionSource("wtos_validate_proposal_deposit_invoice_scope");
if (!jobGateSource.includes("not public.wtos_is_native_proposal_rpc_authorized()")) {
  failures.push("A direct authenticated proposal-linked job insert/attachment must fail without the private conversion guard.");
}
requireNormalized(
  "create trigger jobs_enforce_native_proposal_conversion_update before update on public.jobs for each row execute function public.wtos_enforce_native_proposal_job_conversion();",
  "Every update to a pre-existing estimate-linked job must re-evaluate the finalized native-proposal conversion gate.",
);
for (const boundJobUpdateContract of [
  "old.proposal_revision_id is not null",
  "new.company_id is not distinct from old.company_id",
  "new.customer_id is not distinct from old.customer_id",
  "new.lead_id is not distinct from old.lead_id",
  "new.estimate_id is not distinct from old.estimate_id",
  "new.property_id is not distinct from old.property_id",
  "new.proposal_acceptance_id is not distinct from old.proposal_acceptance_id",
  "new.conversion_operation_key is not distinct from old.conversion_operation_key then",
  "new.total::text in ('NaN', 'Infinity', '-Infinity')",
  "new.total is distinct from linked_acceptance.accepted_total",
  "A proposal-linked sold job must preserve the exact finite signed accepted total.",
]) {
  if (!jobGateSource.includes(boundJobUpdateContract)) {
    failures.push(`Post-conversion ordinary job updates are missing exact immutable binding proof: ${boundJobUpdateContract}.`);
  }
}
if (!invoiceGateSource.includes("not public.wtos_is_native_proposal_rpc_authorized()")) {
  failures.push("A direct authenticated proposal-linked invoice insert/attachment must fail without the private owner guard.");
}
const conversionSource = functionSource("wtos_convert_proposal_to_sold_job");
const conversionGuardIndex = conversionSource.indexOf(
  "perform public.wtos_begin_native_proposal_rpc_guard(",
);
const firstJobMutationIndex = Math.min(
  ...["update public.jobs", "insert into public.jobs"]
    .map((needle) => conversionSource.indexOf(needle))
    .filter((index) => index !== -1),
);
if (conversionGuardIndex === -1 || !Number.isFinite(firstJobMutationIndex) ||
    conversionGuardIndex > firstJobMutationIndex) {
  failures.push("Sold-job conversion must enter its private guard before inserting or attaching the proposal-linked job.");
}
const depositGuardIndex = depositInvoiceSource.indexOf(
  "perform public.wtos_begin_native_proposal_rpc_guard(",
);
const invoiceInsertIndex = depositInvoiceSource.indexOf("insert into public.invoices");
if (depositGuardIndex === -1 || invoiceInsertIndex === -1 ||
    depositGuardIndex > invoiceInsertIndex) {
  failures.push("Deposit-invoice creation must enter its private owner guard before inserting the proposal-linked invoice.");
}

const depositLineGuardSource = functionSource(
  "wtos_enforce_proposal_deposit_line_immutability",
);
for (const depositLineContract of [
  "invoice_line_items_enforce_proposal_deposit_immutability",
  "before insert or update or delete on public.invoice_line_items",
  "create_proposal_deposit_invoice",
  "Exact proposal deposit invoice lines are permanently immutable after creation.",
  "new.quantity is distinct from 1::numeric",
  "new.unit_cost is distinct from linked_invoice.total",
  "new.taxable",
  "new.sort_order is distinct from 0",
  "new.total is distinct from linked_invoice.total",
]) {
  if (!depositLineGuardSource.includes(depositLineContract)) {
    failures.push(`Immutable proposal deposit line contract is missing: ${depositLineContract}.`);
  }
}

const depositRevisionLockIndex = depositInvoiceSource.indexOf(
  "where revision.id = request_revision_id\n    and revision.company_id = request_company_id\n  for update;",
);
const depositPostLockIdempotencyIndex = depositInvoiceSource.indexOf(
  "where invoice.proposal_invoice_operation_key = request_operation_key;",
);
if (depositRevisionLockIndex === -1 || depositPostLockIdempotencyIndex === -1 ||
    depositPostLockIdempotencyIndex < depositRevisionLockIndex ||
    !depositInvoiceSource.includes("existing_invoice.due_date is distinct from coalesce(") ||
    !depositInvoiceSource.includes("selected_schedule.invoice_id is distinct from existing_invoice.id")) {
  failures.push("Concurrent identical deposit-invoice requests must converge only after exact revision/schedule locks and due-date/binding validation.");
}

const firstDepositPaymentLockIndex = conversionSource.indexOf("perform payment.id");
const depositInvoiceLockIndex = conversionSource.indexOf(
  "where invoice.id = selected_deposit_invoice.id\n    for update;",
);
const secondDepositPaymentLockIndex = conversionSource.indexOf(
  "perform payment.id",
  firstDepositPaymentLockIndex + 1,
);
const firstDepositValidationIndex = conversionSource.indexOf(
  "into posted_deposit",
  secondDepositPaymentLockIndex,
);
const secondDepositValidationIndex = conversionSource.indexOf(
  "into revalidated_posted_deposit",
);
if (firstDepositPaymentLockIndex === -1 || depositInvoiceLockIndex === -1 ||
    secondDepositPaymentLockIndex === -1 || firstDepositValidationIndex === -1 ||
    secondDepositValidationIndex === -1 ||
    !(firstDepositPaymentLockIndex < depositInvoiceLockIndex &&
      depositInvoiceLockIndex < secondDepositPaymentLockIndex &&
      secondDepositPaymentLockIndex < firstDepositValidationIndex &&
      firstDepositValidationIndex < secondDepositValidationIndex &&
      secondDepositValidationIndex < conversionGuardIndex &&
      conversionGuardIndex < firstJobMutationIndex)) {
  failures.push("Sold-job conversion must lock every linked payment in ID order, then its invoice, re-lock payments, and revalidate exact posted evidence before the guarded job mutation.");
}
const firstPaymentLockSource = conversionSource.slice(
  firstDepositPaymentLockIndex,
  depositInvoiceLockIndex,
);
for (const depositConcurrencyContract of [
  "where payment.invoice_id = selected_deposit_invoice.id",
  "order by payment.id",
  "for update;",
]) {
  if (!firstPaymentLockSource.includes(depositConcurrencyContract)) {
    failures.push(`Deterministic deposit payment lock is missing: ${depositConcurrencyContract}.`);
  }
}
if (firstPaymentLockSource.includes("payment.status")) {
  failures.push("Deposit conversion must lock every linked payment before filtering posted evidence so a concurrent status reversal cannot evade the lock.");
}
for (const depositRevalidationContract of [
  "revalidated_posted_deposit is distinct from posted_deposit",
  "selected_deposit_invoice.status = 'void'",
  "selected_deposit_invoice.company_id is distinct from selected_revision.company_id",
  "selected_deposit_invoice.customer_id is distinct from selected_revision.customer_id",
  "selected_deposit_invoice.estimate_id is distinct from selected_revision.estimate_id",
  "selected_deposit_invoice.proposal_revision_id is distinct from selected_revision.id",
  "selected_deposit_invoice.proposal_acceptance_id is distinct from selected_acceptance.id",
  "selected_deposit_invoice.total is distinct from selected_acceptance.required_deposit_amount",
  "Linked deposit evidence changed before the sold-job conversion could commit.",
]) {
  if (!conversionSource.includes(depositRevalidationContract)) {
    failures.push(`Exact locked deposit revalidation is missing: ${depositRevalidationContract}.`);
  }
}
reject(/(?:insert into|update|delete from) public\.payments/i,
  "Sold-job conversion must hold and read payment evidence without mutating or permanently blocking later refund events.",
  conversionSource);

const conversionRevisionLockIndex = conversionSource.indexOf(
  "where revision.id = request_revision_id\n    and revision.company_id = request_company_id\n  for update;",
);
const conversionPostLockJobReadIndex = conversionSource.indexOf(
  "where job.conversion_operation_key = request_operation_key",
);
if (conversionRevisionLockIndex === -1 || conversionPostLockJobReadIndex === -1 ||
    conversionPostLockJobReadIndex < conversionRevisionLockIndex ||
    !conversionSource.includes("'acceptedTotal', selected_acceptance.accepted_total") ||
    conversionSource.includes("'acceptedTotal', existing_job.total")) {
  failures.push("Concurrent sold-job retries must converge after the revision lock and return immutable acceptance totals, never mutable job totals.");
}
for (const existingDraftContract of [
  "existing_job.status <> 'draft'",
  "exact_estimate_job_count",
  "candidate.estimate_id = selected_revision.estimate_id",
  "candidate.estimate_id is null",
  "candidate.customer_id is not distinct from selected_revision.customer_id",
  "candidate.lead_id is not distinct from selected_revision.lead_id",
  "candidate.property_id is not distinct from selected_revision.property_id",
  "candidate.service_type is not distinct from selected_estimate.service_type",
  "lower(btrim(candidate.title)) = lower(btrim(selected_estimate.title))",
  "lower(project_identity_address) in (",
  "eligible_existing_job_count <> 1",
  "order by candidate.id",
  "for update;",
  "customer_id = coalesce(existing_job.customer_id, selected_revision.customer_id)",
  "lead_id = coalesce(existing_job.lead_id, selected_revision.lead_id)",
  "property_id = coalesce(existing_job.property_id, selected_revision.property_id)",
  "service_type = selected_estimate.service_type",
  "location = proposal_property_address",
  "scope_of_work = scope_text",
  "estimate_job_reference_count",
  "An existing exact draft job must be explicitly selected for signed proposal conversion.",
]) {
  if (!conversionSource.includes(existingDraftContract)) {
    failures.push(`Fail-closed existing draft-job adoption is missing: ${existingDraftContract}.`);
  }
}
if ((conversionSource.match(
  /candidate\.service_type is not distinct from selected_estimate\.service_type/g,
) ?? []).length !== 4) {
  failures.push("Candidate lock/count paths must all enforce the same exact service-type project rule for estimate-null draft adoption.");
}
const nativeJobGuardSource = functionSource(
  "wtos_enforce_native_proposal_job_conversion",
);
if (!nativeJobGuardSource.includes("old.estimate_id is not null") ||
    !nativeJobGuardSource.includes(
      "An unlinked job cannot detach from or advance beyond an estimate with a finalized native proposal.",
    )) {
  failures.push("A pre-finalized unlinked job must not detach its OLD estimate identity to bypass sold-job conversion.");
}
const nullCreateGuardIndex = conversionSource.indexOf(
  "A caller that omits existingJobId may create a fresh job only when no",
);
const freshJobInsertIndex = conversionSource.indexOf("insert into public.jobs (");
if (nullCreateGuardIndex === -1 || freshJobInsertIndex === -1 ||
    nullCreateGuardIndex > freshJobInsertIndex) {
  failures.push("Sold-job creation without existingJobId must lock and reject existing exact/unique draft candidates before inserting a duplicate.");
}

for (const exactDepositContract of [
  "invoice.company_id = linked_revision.company_id",
  "invoice.customer_id is not distinct from linked_revision.customer_id",
  "invoice.company_id = existing_job.company_id",
  "invoice.customer_id is not distinct from selected_acceptance.customer_id",
  "invoice.company_id = selected_revision.company_id",
  "invoice.customer_id is not distinct from selected_revision.customer_id",
  "invoice.total = linked_acceptance.required_deposit_amount",
  "invoice.total = selected_acceptance.required_deposit_amount",
  "invoice.total = selected_acceptance.required_deposit_amount",
  "posted_deposit::text in ('NaN', 'Infinity', '-Infinity')",
]) {
  requireText(exactDepositContract, `Exact same-company/customer finite deposit proof is missing: ${exactDepositContract}.`);
}
if ((migration.match(/payment\.customer_id is not distinct from invoice\.customer_id/g) ?? []).length !== 4) {
  failures.push("All four posted-deposit proofs, including the locked final revalidation, must reject cross-customer payments.");
}
reject(/before\s+insert\s+or\s+update\s+of/i,
  "INSERT and UPDATE OF trigger events must remain split for PostgreSQL grammar safety.");

for (const cleanupContract of [
  "wtos_cleanup_synthetic_proposal_fixture",
  "weathertech-os-regression-owner-v1",
  "hygtnhmmaoboduqghhwg",
  "@example.test",
  "TEST WTOS LEAD ACCOUNTABILITY REGRESSION:",
  "TEST WTOS PROPOSAL SIGNING ",
  "Synthetic proposal Storage bytes must be removed and verified absent before metadata cleanup.",
  "Synthetic proposal cleanup refused an incomplete or overbroad exact graph.",
  "storageResidueCount",
  "databaseResidueCount",
]) {
  requireText(cleanupContract, `Fail-closed synthetic cleanup contract is missing: ${cleanupContract}.`);
}
const cleanupSource = functionSource("wtos_cleanup_synthetic_proposal_fixture");
const cleanupGuardIndex = cleanupSource.indexOf(
  "insert into public.proposal_synthetic_cleanup_guards",
);
const consumedBindingClearIndex = cleanupSource.indexOf(
  "update public.proposal_signing_requests\n  set\n    request_token_consumed_at = null,\n    request_token_consumed_session_id = null",
);
const revisionLinkResetIndex = cleanupSource.indexOf(
  "update public.estimate_proposal_revisions\n  set\n    finalized_document_id = null",
);
const sessionDeleteIndex = cleanupSource.indexOf(
  "delete from public.proposal_signing_sessions",
);
const requestDeleteIndex = cleanupSource.indexOf(
  "delete from public.proposal_signing_requests",
);
if (
  cleanupGuardIndex === -1 ||
  consumedBindingClearIndex === -1 ||
  revisionLinkResetIndex === -1 ||
  sessionDeleteIndex === -1 ||
  requestDeleteIndex === -1 ||
  !(cleanupGuardIndex < consumedBindingClearIndex &&
    consumedBindingClearIndex < revisionLinkResetIndex &&
    consumedBindingClearIndex < sessionDeleteIndex &&
    sessionDeleteIndex < requestDeleteIndex)
) {
  failures.push(
    "Exact synthetic cleanup must install its private guard, clear both consumed-token FK fields before unlinking validated revision scope, then delete sessions before requests.",
  );
}
for (const cleanupConsumedBindingContract of [
  "where id = any(request_signing_request_ids)",
  "and request_token_consumed_at is not null",
  "and request_token_consumed_session_id is not null",
  "get diagnostics cleared_consumed_request_bindings = row_count",
  "'consumedRequestBindingsCleared', cleared_consumed_request_bindings",
]) {
  if (!cleanupSource.includes(cleanupConsumedBindingContract)) {
    failures.push(
      `Exact synthetic cleanup must prove its bounded consumed-session unlink: ${cleanupConsumedBindingContract}.`,
    );
  }
}
requireNormalized(
  "foreign key (request_token_consumed_session_id) references public.proposal_signing_sessions(id) on delete restrict not valid",
  "Consumed-session evidence must preserve its restrictive production foreign key.",
);

for (const indexName of [
  "estimate_proposal_revisions_finalized_by_idx",
  "estimate_proposal_revisions_finalized_document_id_idx",
  "estimate_proposal_revisions_accepted_signature_id_idx",
  "estimate_proposal_revisions_accepted_acceptance_id_idx",
  "estimate_proposal_revisions_signed_document_id_idx",
  "documents_proposal_revision_category_idx",
  "signatures_proposal_revision_id_idx",
  "signatures_acceptance_id_idx",
  "signatures_signed_document_id_idx",
  "estimate_proposal_acceptances_proposal_document_id_idx",
  "proposal_signing_requests_company_id_idx",
  "proposal_signing_requests_revision_status_idx",
  "proposal_signing_requests_estimate_id_idx",
  "proposal_signing_requests_customer_id_idx",
  "proposal_signing_requests_signature_id_idx",
  "proposal_signing_requests_proposal_document_id_idx",
  "proposal_signing_requests_delivery_email_message_id_idx",
  "proposal_signing_requests_consumed_session_id_idx",
  "proposal_signing_requests_created_by_idx",
  "proposal_signing_sessions_request_status_idx",
  "proposal_signing_sessions_company_id_idx",
  "proposal_signature_receipts_company_id_idx",
  "proposal_signature_receipts_source_document_id_idx",
]) {
  requireText(indexName, `Foreign-key lookup index is missing: ${indexName}.`);
}
reject(/estimate_proposal_revisions_finalization_operation_key_idx/,
  "Finalization operation key must not carry a redundant partial index in addition to its UNIQUE constraint.");

reject(/\b40001\b|when\s+serialization_failure/i,
  "This migration must not translate or suppress genuine PostgreSQL serialization behavior.");
reject(/\bdrop\s+(?:table|column)\b|\btruncate\b/i,
  "Native proposal signing migration must not contain destructive schema/data operations.");
const withoutFunctions = migration.replace(
  /create or replace function public\.[\s\S]*?\n\$\$;/gi,
  "",
);
reject(/\b(?:insert\s+into|update|delete\s+from)\s+(?:public|storage)\./i,
  "Migration application must not mutate business rows or Storage objects outside RPC bodies.",
  withoutFunctions);

if (failures.length > 0) {
  console.error("Proposal-to-sold-job security check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Proposal-to-sold-job security check passed.");
console.log(
  "Verified immutable revisions/artifacts, single-use bounded signing, exact acceptance evidence, truthful delivery, receipt recovery, deposit gating, sold-job conversion, and fail-closed synthetic cleanup.",
);
