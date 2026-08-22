import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260818030913_secure_company_scoped_job_photos.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();
const correctionMigrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260822054433_job_photo_storage_rollback_retry_correction.sql",
);
const correctionMigration = fs.readFileSync(correctionMigrationPath, "utf8");
const normalizedCorrection = correctionMigration.replace(/\s+/g, " ").toLowerCase();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function includesSql(fragment) {
  return normalized.includes(fragment.replace(/\s+/g, " ").toLowerCase());
}

function correctionIncludesSql(fragment) {
  return normalizedCorrection.includes(
    fragment.replace(/\s+/g, " ").toLowerCase(),
  );
}

function correctionSqlSection(startMarker, endMarker) {
  const start = normalizedCorrection.indexOf(
    startMarker.replace(/\s+/g, " ").toLowerCase(),
  );
  const end = normalizedCorrection.indexOf(
    endMarker.replace(/\s+/g, " ").toLowerCase(),
    start + startMarker.length,
  );

  assert(start >= 0, `Correction SQL section starts at ${startMarker}`);
  assert(end > start, `Correction SQL section ends at ${endMarker}`);
  return normalizedCorrection.slice(start, end);
}

function sqlSection(startMarker, endMarker) {
  const start = normalized.indexOf(
    startMarker.replace(/\s+/g, " ").toLowerCase(),
  );
  const end = normalized.indexOf(
    endMarker.replace(/\s+/g, " ").toLowerCase(),
    start + startMarker.length,
  );

  assert(start >= 0, `SQL section starts at ${startMarker}`);
  assert(end > start, `SQL section ends at ${endMarker}`);
  return normalized.slice(start, end);
}

assert(
  includesSql("lock table public.job_photos in access exclusive mode") &&
    includesSql("if exists (select 1 from public.job_photos limit 1)") &&
    includesSql("migration aborted without backfill"),
  "Migration must lock and fail closed instead of backfilling an unexpected metadata baseline.",
);

assert(
  includesSql(
    "values ( 'job-photos', 'job-photos', false, 26214400, array['image/*']::text[] )",
  ) &&
    includesSql("public = excluded.public") &&
    includesSql("file_size_limit = excluded.file_size_limit") &&
    includesSql("allowed_mime_types = excluded.allowed_mime_types"),
  "The job-photos bucket is not private and constrained to the app's image/25 MiB contract.",
);

for (const legacyPolicy of [
  "Authenticated users read job photos",
  "Authenticated users upload job photos",
  "Authenticated users update job photos",
]) {
  assert(
    includesSql(`drop policy if exists "${legacyPolicy}" on storage.objects`),
    `Legacy broad Storage policy is not removed: ${legacyPolicy}`,
  );
}

for (const relationKind of [
  "inspection",
  "job",
  "property",
  "customer",
  "estimate",
  "company",
]) {
  assert(
    includesSql(`'${relationKind}'`),
    `Approved job-photo path relation is missing: ${relationKind}`,
  );
}

assert(
  includesSql("coalesce(pg_catalog.array_length(folder_parts, 1), 0) <> 3") &&
    includesSql("pg_catalog.substring(object_filename, 1, 36)::uuid") &&
    includesSql("pg_catalog.substring(object_filename, 37, 1) <> '-'") &&
    !/pg_catalog\.substring\([^)]*\bfrom\b/i.test(migration),
  "Storage paths do not validate the exact company/relation/operation structure.",
);

assert(
  !/pg_catalog\.(?:coalesce|nullif|trim|overlay|position|extract)\b/i.test(
    migration,
  ),
  "Migration schema-qualifies a PostgreSQL special-expression form that cannot use function-call grammar.",
);

assert(
  includesSql("create or replace function public.wtos_can_upload_job_photo_object") &&
    includesSql("public.wtos_can_manage_documents(path_company_id)") &&
    includesSql("public.wtos_can_manage_production(path_company_id)"),
  "Storage uploads are not authorized through company document/production roles.",
);

const uploadAuthorizationSection = sqlSection(
  "create or replace function public.wtos_can_upload_job_photo_object",
  "create or replace function public.wtos_can_rollback_job_photo_object",
);
const recoveryAuthenticatorSection = sqlSection(
  "create or replace function public.wtos_resolve_job_photo_recovery_uploader",
  "create or replace function public.wtos_can_upload_job_photo_object",
);
const rollbackAuthorizationSection = sqlSection(
  "create or replace function public.wtos_can_rollback_job_photo_object",
  "create or replace function public.wtos_enforce_job_photo_upload_operation_transition",
);
const beginSection = sqlSection(
  "create or replace function public.wtos_begin_job_photo_upload",
  "create or replace function public.wtos_cancel_job_photo_upload",
);
const cancelSection = sqlSection(
  "create or replace function public.wtos_cancel_job_photo_upload",
  "create or replace function public.wtos_confirm_job_photo_upload_abort",
);
const confirmAbortSection = sqlSection(
  "create or replace function public.wtos_confirm_job_photo_upload_abort",
  "create or replace function public.wtos_list_my_job_photo_upload_recoveries",
);
const recoveryListSection = sqlSection(
  "create or replace function public.wtos_list_my_job_photo_upload_recoveries",
  "create or replace function public.wtos_claim_job_photo_upload_recovery",
);
const recoveryClaimSection = sqlSection(
  "create or replace function public.wtos_claim_job_photo_upload_recovery",
  "create or replace function public.wtos_confirm_job_photo_upload_recovery_abort",
);
const recoveryConfirmSection = sqlSection(
  "create or replace function public.wtos_confirm_job_photo_upload_recovery_abort",
  "create or replace function public.wtos_expire_job_photo_upload_recovery_lease",
);
const leaseExpiryOverrideSection = sqlSection(
  "create or replace function public.wtos_expire_job_photo_upload_recovery_lease",
  "create or replace function public.wtos_register_job_photo",
);
const registrationSection = sqlSection(
  "create or replace function public.wtos_register_job_photo",
  "alter table public.job_photos enable row level security",
);

assert(
  includesSql("create or replace function public.wtos_lock_job_photo_path") &&
    includesSql("volatile security definer set search_path = ''") &&
    includesSql("pg_catalog.pg_advisory_xact_lock(") &&
    includesSql("'wtos:job-photos:' || coalesce(object_name, '')") &&
    includesSql("7465628248399941"),
  "The deterministic transaction-scoped path lock is missing or not hardened.",
);

assert(
  uploadAuthorizationSection.includes(
    "perform public.wtos_lock_job_photo_path(object_name)",
  ) &&
    uploadAuthorizationSection.indexOf(
      "perform public.wtos_lock_job_photo_path(object_name)",
    ) < uploadAuthorizationSection.indexOf("path_company_id :=") &&
    uploadAuthorizationSection.includes("volatile security definer"),
  "Storage INSERT authorization must acquire the shared path lock before company/relation checks.",
);

assert(
  uploadAuthorizationSection.includes(
    "from public.job_photo_upload_operations as operation",
  ) &&
    uploadAuthorizationSection.includes(
      "operation.uploader_user_id = request_user_id",
    ) &&
    uploadAuthorizationSection.includes("operation.state = 'reserved'") &&
    uploadAuthorizationSection.includes(
      "operation.recovery_lease_expires_at > pg_catalog.clock_timestamp()",
    ),
  "Storage INSERT must require the exact reserved uploader and a live server lease after locking.",
);

assert(
  rollbackAuthorizationSection.includes(
    "perform public.wtos_lock_job_photo_path(object_name)",
  ) &&
    rollbackAuthorizationSection.indexOf(
      "perform public.wtos_lock_job_photo_path(object_name)",
    ) <
      rollbackAuthorizationSection.indexOf(
        "public.wtos_job_photo_storage_path_is_valid(object_name)",
      ) &&
    rollbackAuthorizationSection.includes("volatile security definer") &&
    rollbackAuthorizationSection.includes(
      "object_owner_id is distinct from request_user_id::text",
    ) &&
    rollbackAuthorizationSection.includes("return not exists (") &&
    rollbackAuthorizationSection.includes("photo.file_path = object_name") &&
    rollbackAuthorizationSection.includes("operation.state = 'canceling'") &&
    !rollbackAuthorizationSection.includes("wtos_can_manage_documents") &&
    !rollbackAuthorizationSection.includes("wtos_can_manage_production"),
  "Rollback authorization must lock first, then freshly recheck path, authority, ownership, and metadata absence.",
);

assert(
  recoveryAuthenticatorSection.includes("(select auth.uid())") &&
    recoveryAuthenticatorSection.includes("public.wtos_is_service_role_request()") &&
    recoveryAuthenticatorSection.includes("target_uploader_user_id") &&
    !recoveryAuthenticatorSection.includes("wtos_can_manage_documents") &&
    !recoveryAuthenticatorSection.includes("wtos_can_manage_production") &&
    beginSection.includes("public.wtos_resolve_job_photo_recovery_uploader(") &&
    beginSection.includes("public.wtos_resolve_job_photo_uploader(") &&
    beginSection.indexOf("public.wtos_resolve_job_photo_recovery_uploader(") <
      beginSection.indexOf("if upload_operation.id is not null") &&
    beginSection.indexOf("if upload_operation.id is not null") <
      beginSection.indexOf("public.wtos_resolve_job_photo_uploader(") &&
    cancelSection.includes("public.wtos_resolve_job_photo_recovery_uploader(") &&
    !cancelSection.includes("public.wtos_resolve_job_photo_uploader(") &&
    confirmAbortSection.includes(
      "public.wtos_resolve_job_photo_recovery_uploader(",
    ) &&
    !confirmAbortSection.includes("public.wtos_resolve_job_photo_uploader("),
  "Existing reservation replay and cleanup are not limited to the immutable uploader independently of current company role.",
);

for (const [section, label] of [
  [beginSection, "begin"],
  [cancelSection, "cancel"],
  [confirmAbortSection, "confirm-abort"],
  [registrationSection, "register"],
]) {
  assert(
    section.includes("perform public.wtos_lock_job_photo_path(target_file_path)"),
    `The ${label} RPC does not share the exact path transaction lock.`,
  );
}

assert(
  registrationSection.includes(
    "perform public.wtos_lock_job_photo_path(target_file_path)",
  ) &&
    registrationSection.indexOf(
      "perform public.wtos_lock_job_photo_path(target_file_path)",
    ) < registrationSection.indexOf("insert into public.job_photos"),
  "Metadata registration must use the identical path-keyed lock before object/metadata checks.",
);

for (const linkedTable of [
  "public.customers",
  "public.properties",
  "public.jobs",
  "public.estimates",
  "public.inspections",
]) {
  assert(
    includesSql(`from ${linkedTable}`),
    `Migration does not validate the linked-record company for ${linkedTable}.`,
  );
}

assert(
  includesSql("from storage.objects as object") &&
    includesSql("object.bucket_id = 'job-photos'") &&
    includesSql("object.name = new.file_path"),
  "Metadata registration does not require the exact uploaded Storage object.",
);

assert(
  includesSql("upload_operation_key uuid not null") &&
    includesSql("upload_request_fingerprint text not null") &&
    includesSql("unique (company_id, upload_operation_key)") &&
    includesSql("unique (file_path)") &&
    includesSql("upload_request_fingerprint ~ '^[a-f0-9]{64}$'"),
  "Durable operation identity, exact fingerprint, or uniqueness is missing.",
);

assert(
  includesSql("create table public.job_photo_upload_operations") &&
    includesSql("registration_digest text not null") &&
    includesSql("uploader_user_id uuid not null references auth.users(id) on delete restrict") &&
    includesSql("recovery_lease_token uuid not null") &&
    includesSql("recovery_lease_expires_at timestamptz not null") &&
    includesSql("state in ('reserved', 'canceling', 'committed', 'aborted')") &&
    includesSql("unique (company_id, upload_operation_key)") &&
    includesSql("unique (file_path)") &&
    includesSql("foreign key (company_id, upload_operation_key) references public.job_photo_upload_operations") &&
    includesSql("on delete restrict"),
  "The durable company-scoped upload reservation and metadata foreign-key contract is incomplete.",
);

assert(
  includesSql(
    "create index job_photo_upload_operations_recovery_lookup_idx on public.job_photo_upload_operations ( uploader_user_id, state, recovery_lease_expires_at ) where state in ('reserved', 'canceling')",
  ),
  "Uploader recovery polling lacks a bounded nonterminal lookup index.",
);

for (const [section, label] of [
  [beginSection, "begin"],
  [cancelSection, "cancel"],
  [confirmAbortSection, "confirm-abort"],
  [registrationSection, "register"],
]) {
  assert(
    section.includes(
      "target_file_path text, target_recovery_lease_token uuid,",
    ),
    `The ${label} RPC does not require the lease token immediately after the immutable path.`,
  );
}

assert(
  beginSection.includes(
    "upload_operation.recovery_lease_token is distinct from target_recovery_lease_token",
  ) &&
    beginSection.includes("errcode = '55p03'") &&
    beginSection.includes(
      "set recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'",
    ) &&
    beginSection.includes("upload_operation.state in ('reserved', 'canceling')"),
  "Exact-token begin replay does not heartbeat both nonterminal states while refusing a different live session.",
);

assert(
  recoveryListSection.includes(
    "public.wtos_resolve_job_photo_recovery_uploader(",
  ) &&
    recoveryListSection.includes(
      "operation.state in ('reserved', 'canceling')",
    ) &&
    recoveryListSection.includes("operation.uploader_user_id") &&
    recoveryListSection.includes("operation.company_id") &&
    recoveryListSection.includes("operation.upload_operation_key") &&
    recoveryListSection.includes("operation.recovery_lease_expires_at") &&
    !recoveryListSection.includes("operation.file_path") &&
    !recoveryListSection.includes("operation.upload_request_fingerprint") &&
    !recoveryListSection.includes("operation.registration_digest"),
  "Uploader recovery discovery must expose only nonterminal non-PII operation identity and lease state.",
);

assert(
  recoveryClaimSection.includes(
    "public.wtos_resolve_job_photo_recovery_uploader(",
  ) &&
    recoveryClaimSection.includes(
      "perform public.wtos_lock_job_photo_path(locked_file_path)",
    ) &&
    recoveryClaimSection.includes(
      "upload_operation.recovery_lease_token is distinct from target_recovery_lease_token",
    ) &&
    recoveryClaimSection.includes(
      "upload_operation.recovery_lease_expires_at > pg_catalog.clock_timestamp()",
    ) &&
    recoveryClaimSection.includes("errcode = '55p03'") &&
    recoveryClaimSection.includes("state = 'canceling'") &&
    recoveryClaimSection.includes(
      "recovery_lease_token = target_recovery_lease_token",
    ) &&
    recoveryClaimSection.includes("interval '5 minutes'") &&
    recoveryClaimSection.includes("null::text"),
  "Recovery claim does not serialize the path, reject an active different token, adopt the claimant lease, and hide terminal paths.",
);

assert(
  recoveryConfirmSection.includes(
    "public.wtos_resolve_job_photo_recovery_uploader(",
  ) &&
    recoveryConfirmSection.includes(
      "perform public.wtos_lock_job_photo_path(locked_file_path)",
    ) &&
    recoveryConfirmSection.includes(
      "upload_operation.recovery_lease_token is distinct from target_recovery_lease_token",
    ) &&
    recoveryConfirmSection.includes("from storage.objects as object") &&
    recoveryConfirmSection.includes("from public.job_photos as photo") &&
    recoveryConfirmSection.includes("state = 'aborted'") &&
    recoveryConfirmSection.includes(
      "upload_operation.state in ('committed', 'aborted')",
    ),
  "Recovery abort confirmation is not exact-token, zero-residue, path-serialized, and terminal-idempotent.",
);

assert(
  leaseExpiryOverrideSection.includes(
    "if not public.wtos_is_service_role_request()",
  ) &&
    leaseExpiryOverrideSection.includes(
      "operation.uploader_user_id = target_uploader_user_id",
    ) &&
    leaseExpiryOverrideSection.includes(
      "perform public.wtos_lock_job_photo_path(locked_file_path)",
    ) &&
    leaseExpiryOverrideSection.includes(
      "upload_operation.state not in ('reserved', 'canceling')",
    ) &&
    includesSql(
      "grant execute on function public.wtos_expire_job_photo_upload_recovery_lease( uuid, uuid, uuid ) to service_role",
    ) &&
    !includesSql(
      "grant execute on function public.wtos_expire_job_photo_upload_recovery_lease( uuid, uuid, uuid ) to authenticated",
    ),
  "The hosted lease-expiry override is not narrowly service-role-only and exact-operation scoped.",
);

assert(
  includesSql("create or replace function public.wtos_job_photo_registration_digest") &&
    includesSql("'upload_request_fingerprint', target_upload_request_fingerprint") &&
    includesSql("'customer_id', target_customer_id") &&
    includesSql("'property_id', target_property_id") &&
    includesSql("'job_id', target_job_id") &&
    includesSql("'estimate_id', target_estimate_id") &&
    includesSql("'inspection_id', target_inspection_id") &&
    includesSql("'caption', nullif(pg_catalog.btrim(target_caption), '')") &&
    includesSql("'label', nullif(pg_catalog.btrim(target_label), '')") &&
    includesSql("'taken_at', target_taken_at") &&
    includesSql("'is_customer_visible', coalesce(target_is_customer_visible, false)") &&
    includesSql("'sort_order', coalesce(target_sort_order, 0)") &&
    includesSql("extensions.digest(") &&
    includesSql("'sha256'"),
  "The server canonical digest does not bind every normalized registration argument.",
);

assert(
  beginSection.includes("on conflict (company_id, upload_operation_key) do nothing") &&
    beginSection.includes("return upload_operation") &&
    beginSection.includes("already used for a different request"),
  "Reservation begin does not converge exact state replays and reject changed requests.",
);

assert(
  cancelSection.includes("upload_operation.state = 'reserved'") &&
    cancelSection.includes("state = 'canceling'") &&
    confirmAbortSection.includes("upload_operation.state in ('committed', 'aborted')") &&
    confirmAbortSection.includes("upload_operation.state <> 'canceling'") &&
    confirmAbortSection.includes("from storage.objects as object") &&
    confirmAbortSection.includes("from public.job_photos as photo") &&
    confirmAbortSection.includes("state = 'aborted'"),
  "Cancel/confirm-abort does not enforce the reserved→canceling→aborted state machine and zero-residue proof.",
);

assert(
  includesSql(
    "create or replace function public.wtos_enforce_job_photo_upload_operation_transition",
  ) &&
    includesSql("Job-photo upload operation identity is immutable.") &&
    includesSql("old.state = 'reserved' and new.state = 'reserved'") &&
    includesSql("old.state = 'reserved' and new.state in ('canceling', 'committed')") &&
    includesSql("old.state = 'canceling' and new.state = 'canceling'") &&
    includesSql("old.state = 'canceling' and new.state = 'aborted'") &&
    includesSql(
      "new.recovery_lease_token is distinct from old.recovery_lease_token",
    ) &&
    includesSql(
      "new.recovery_lease_expires_at is distinct from old.recovery_lease_expires_at",
    ) &&
    includesSql(
      "create trigger job_photo_upload_operations_enforce_transition before insert or update",
    ),
  "Reservation identity or terminal state transitions can be rewritten outside the approved state machine.",
);

assert(
  registrationSection.includes("upload_operation.state = 'committed'") &&
    registrationSection.includes("upload_operation.state <> 'reserved'") &&
    registrationSection.includes("insert into public.job_photos") &&
    registrationSection.includes("state = 'committed'") &&
    registrationSection.indexOf("insert into public.job_photos") <
      registrationSection.lastIndexOf("state = 'committed'"),
  "Registration does not require a reserved operation, recover committed replay, and commit metadata/state atomically.",
);

assert(
  includesSql("security definer") &&
    includesSql("public.wtos_is_service_role_request()") &&
    includesSql("company document or production access is required"),
  "The privileged registration boundary lacks explicit authorization.",
);

assert(
  includesSql("alter column file_url drop not null") &&
    includesSql("check (file_url is null)") &&
    includesSql("target_file_path, null, target_taken_at"),
  "Durable public/signed URL persistence is not prohibited.",
);

assert(
  includesSql("revoke all on table public.job_photos from public, anon, authenticated, service_role") &&
    includesSql("grant select on table public.job_photos to authenticated, service_role") &&
    !includesSql("grant insert, update on table public.job_photos to authenticated"),
  "Authenticated callers can bypass the RPC-only metadata boundary.",
);

assert(
  includesSql("alter table public.job_photo_upload_operations enable row level security") &&
    includesSql("revoke all on table public.job_photo_upload_operations from public, anon, authenticated, service_role") &&
    includesSql("grant select, delete on table public.job_photo_upload_operations to service_role") &&
    !includesSql("grant select on table public.job_photo_upload_operations to authenticated") &&
    !includesSql("grant insert on table public.job_photo_upload_operations to authenticated") &&
    !includesSql("grant update on table public.job_photo_upload_operations to authenticated") &&
    !includesSql("grant delete on table public.job_photo_upload_operations to authenticated"),
  "Upload reservations are not internal, RLS-protected, and limited to isolated service cleanup.",
);

assert(
  includesSql('create policy "wtos users read own job photo upload operations"') &&
    includesSql("uploader_user_id = (select auth.uid())") &&
    includesSql("public.wtos_can_read_company(company_id)"),
  "Reservation RLS is not defensively scoped to the exact uploader and company.",
);

assert(
  includesSql('create policy "wtos users read company job photos"') &&
    includesSql("photo.file_path = storage.objects.name") &&
    includesSql('create policy "wtos users upload company job photos"') &&
    includesSql("public.wtos_can_upload_job_photo_object(name)"),
  "Private-object reads or uploads are not bound to registered company metadata.",
);

assert(
  includesSql('drop policy if exists "wtos users update company job photos"') &&
    !includesSql('create policy "wtos users update company job photos"') &&
    includesSql('create policy "wtos users rollback own job photo uploads"') &&
    includesSql("public.wtos_can_rollback_job_photo_object(name, owner_id)"),
  "Registered bytes must be immutable while rollback uses only the lock-aware authorization helper.",
);

assert(
  includesSql(
    "revoke all on function public.wtos_lock_job_photo_path(text) from public, anon, authenticated, service_role",
  ) &&
    !includesSql(
      "grant execute on function public.wtos_lock_job_photo_path(text)",
    ) &&
    includesSql(
      "grant execute on function public.wtos_can_upload_job_photo_object(text) to authenticated",
    ) &&
    includesSql(
      "grant execute on function public.wtos_can_rollback_job_photo_object(text, text) to authenticated",
    ),
  "Advisory-lock and policy helpers do not follow the least-privilege execution contract.",
);

assert(
  !/^\s*(delete|update)\s+(from\s+)?storage\.objects\b/im.test(migration),
  "Migration mutates an existing Storage object instead of preserving the orphan.",
);

assert(
  normalizedCorrection.trim().startsWith("begin;") &&
    normalizedCorrection.trim().endsWith("commit;"),
  "The rollback/retry correction must execute as one transaction.",
);
assert(
  !/\b(?:create|alter|drop)\s+table\b/i.test(correctionMigration) &&
    !/\b(?:add|drop|alter)\s+column\b/i.test(correctionMigration) &&
    !/\b(?:insert\s+into|update|delete\s+from|truncate)\s+(?:public\.|storage\.)/i.test(
      correctionMigration,
    ),
  "The rollback/retry correction must not change schema or mutate business/Storage data.",
);

const rollbackDeleteSelectPolicy = correctionSqlSection(
  'create policy "wtos users select own rollback job photo deletes"',
  "-- postgrest retries sqlstate 40001",
);
assert(
  rollbackDeleteSelectPolicy.includes("on storage.objects") &&
    rollbackDeleteSelectPolicy.includes("for select") &&
    rollbackDeleteSelectPolicy.includes("to authenticated") &&
    rollbackDeleteSelectPolicy.includes("bucket_id = 'job-photos'") &&
    rollbackDeleteSelectPolicy.includes("storage.allow_any_operation(") &&
    rollbackDeleteSelectPolicy.includes("'storage.object.delete'") &&
    rollbackDeleteSelectPolicy.includes("'storage.object.delete_many'") &&
    rollbackDeleteSelectPolicy.includes(
      "public.wtos_can_rollback_job_photo_object(name, owner_id)",
    ),
  "Rollback SELECT visibility is not gated by the exact bucket, delete operations, and existing rollback helper.",
);
assert(
  !rollbackDeleteSelectPolicy.includes("storage.object.list") &&
    !rollbackDeleteSelectPolicy.includes("storage.object.get") &&
    !rollbackDeleteSelectPolicy.includes("object.get_authenticated") &&
    !/\busing\s*\(\s*true\s*\)/i.test(rollbackDeleteSelectPolicy),
  "Rollback SELECT visibility must not authorize ordinary list/read/download operations.",
);

const semanticSerializationMessages = [
  "Job-photo upload reservation did not converge; retry the same operation.",
  "Job-photo upload residue remains; remove the exact unregistered object and retry confirmation.",
  "Job-photo recovery claim did not converge; retry the same operation.",
  "Job-photo recovery abort confirmation did not converge; retry the same operation.",
  "Lease expiry did not converge; retry the same exact operation.",
];
for (const message of semanticSerializationMessages) {
  assert(
    correctionMigration.includes(`'${message}'`),
    `The correction does not translate the exact semantic serialization message: ${message}`,
  );
}
assert(
  (correctionMigration.match(/when\s+serialization_failure\s+then/gi) ?? [])
    .length === 5 &&
    (correctionMigration.match(/errcode\s*=\s*'P0001'/gi) ?? []).length === 5 &&
    (correctionMigration.match(/^\s*raise;\s*$/gim) ?? []).length === 5 &&
    !/errcode\s*=\s*'40001'/i.test(correctionMigration) &&
    !/when\s+others/i.test(correctionMigration),
  "Every wrapper must translate only its exact semantic 40001 outcomes and bare-rethrow every other serialization failure.",
);

for (const [functionName, baseName, nextMarker] of [
  [
    "wtos_begin_job_photo_upload",
    "wtos_begin_job_photo_upload_phase1_base",
    "create function public.wtos_confirm_job_photo_upload_abort",
  ],
  [
    "wtos_confirm_job_photo_upload_abort",
    "wtos_confirm_job_photo_upload_abort_phase1_base",
    "create function public.wtos_claim_job_photo_upload_recovery",
  ],
  [
    "wtos_claim_job_photo_upload_recovery",
    "wtos_claim_job_photo_upload_recovery_phase1_base",
    "create function public.wtos_confirm_job_photo_upload_recovery_abort",
  ],
  [
    "wtos_confirm_job_photo_upload_recovery_abort",
    "wtos_confirm_job_photo_upload_recovery_abort_phase1_base",
    "create function public.wtos_expire_job_photo_upload_recovery_lease",
  ],
  [
    "wtos_expire_job_photo_upload_recovery_lease",
    "wtos_expire_job_photo_upload_recovery_lease_phase1_base",
    "revoke all on function public.wtos_begin_job_photo_upload",
  ],
]) {
  assert(
    correctionIncludesSql(`rename to ${baseName}`) &&
      correctionIncludesSql(
        `revoke all on function public.${baseName}`,
      ),
    `${functionName} does not preserve its immutable implementation under a non-executable private base.`,
  );

  const wrapper = correctionSqlSection(
    `create function public.${functionName}`,
    nextMarker,
  );
  assert(
    wrapper.includes(`public.${baseName}(`) &&
      wrapper.includes("security definer") &&
      wrapper.includes("set search_path = ''") &&
      wrapper.includes("when serialization_failure then") &&
      wrapper.includes("errcode = 'p0001'") &&
      /\braise;/.test(wrapper),
    `${functionName} is not a fixed-search-path exact-message wrapper with a genuine-serialization bare rethrow.`,
  );
}

assert(
  correctionIncludesSql(
    "grant execute on function public.wtos_begin_job_photo_upload( uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, date, boolean, integer, uuid ) to authenticated, service_role",
  ) &&
    correctionIncludesSql(
      "grant execute on function public.wtos_confirm_job_photo_upload_abort( uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text, text, date, boolean, integer, uuid ) to authenticated, service_role",
    ) &&
    correctionIncludesSql(
      "grant execute on function public.wtos_claim_job_photo_upload_recovery( uuid, uuid, uuid, uuid ) to authenticated, service_role",
    ) &&
    correctionIncludesSql(
      "grant execute on function public.wtos_confirm_job_photo_upload_recovery_abort( uuid, uuid, uuid, uuid ) to authenticated, service_role",
    ) &&
    correctionIncludesSql(
      "grant execute on function public.wtos_expire_job_photo_upload_recovery_lease( uuid, uuid, uuid ) to service_role",
    ) &&
    !correctionIncludesSql(
      "grant execute on function public.wtos_expire_job_photo_upload_recovery_lease( uuid, uuid, uuid ) to authenticated",
    ),
  "Correction wrapper grants do not exactly preserve the Phase 1 RPC privilege boundary.",
);

console.log("Job-photo Storage hardening contract: PASS");
