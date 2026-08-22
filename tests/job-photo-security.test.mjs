import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cwd = process.cwd();
const migration = readFileSync(
  join(
    cwd,
    "supabase",
    "migrations",
    "20260818030913_secure_company_scoped_job_photos.sql",
  ),
  "utf8",
);
const normalizedMigration = migration.replace(/\s+/g, " ").trim().toLowerCase();
const correctionMigration = readFileSync(
  join(
    cwd,
    "supabase",
    "migrations",
    "20260822054433_job_photo_storage_rollback_retry_correction.sql",
  ),
  "utf8",
);
const normalizedCorrectionMigration = correctionMigration
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();
const repository = readFileSync(join(cwd, "lib", "crm", "repository.ts"), "utf8");
const types = readFileSync(join(cwd, "lib", "crm", "types.ts"), "utf8");
const app = readFileSync(join(cwd, "components", "CrmApp.tsx"), "utf8");
const fieldOperations = readFileSync(
  join(cwd, "components", "FieldOperationsWorkspace.tsx"),
  "utf8",
);
const browserHarness = readFileSync(
  join(cwd, "tests", "codex-browser", "weathertech-os-regression.mjs"),
  "utf8",
);
const documentStorageMigration = readFileSync(
  join(cwd, "supabase", "migrations", "0025_document_storage_signature_workflow.sql"),
  "utf8",
);
let assertionCount = 0;

function check(condition, message) {
  assert.ok(condition, message);
  assertionCount += 1;
}

function migrationIncludes(fragment, message) {
  check(
    normalizedMigration.includes(fragment.replace(/\s+/g, " ").toLowerCase()),
    message,
  );
}

function correctionMigrationIncludes(fragment, message) {
  check(
    normalizedCorrectionMigration.includes(
      fragment.replace(/\s+/g, " ").toLowerCase(),
    ),
    message,
  );
}

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  check(start >= 0, `Source section starts at ${startMarker}`);
  check(end > start, `Source section ends at ${endMarker}`);
  return source.slice(start, end);
}

function migrationTimeSql(sql) {
  const outsideBlocks = [];
  let insideDollarBlock = false;

  for (const line of sql.split("\n")) {
    if (!insideDollarBlock && /\b(?:do|as)\s+\$\$\s*$/i.test(line)) {
      insideDollarBlock = true;
      continue;
    }

    if (insideDollarBlock && line.trim() === "$$;") {
      insideDollarBlock = false;
      continue;
    }

    if (!insideDollarBlock) {
      outsideBlocks.push(line);
    }
  }

  return outsideBlocks.join("\n");
}

check(normalizedMigration.startsWith("begin;"), "Migration starts in one transaction");
check(normalizedMigration.endsWith("commit;"), "Migration closes its transaction");
check(!/\bdrop\s+table\b/i.test(migration), "Migration drops no table");
check(!/\bdrop\s+column\b/i.test(migration), "Migration drops no column");
check(!/\btruncate\b/i.test(migration), "Migration truncates no data");
check(
  !/\b(?:delete\s+from|update)\s+(?:public\.job_photos|storage\.objects)\b/i.test(
    migration,
  ),
  "Migration never mutates or deletes existing job-photo metadata or Storage objects",
);
const outsideBlocks = migrationTimeSql(migration);
check(
  !/\b(?:insert\s+into|update|delete\s+from)\s+public\.job_photos\b/i.test(
    outsideBlocks,
  ),
  "Migration performs no migration-time job-photo insert, update, delete, or backfill",
);
check(
  !/\b(?:insert\s+into|update|delete\s+from)\s+storage\.objects\b/i.test(
    outsideBlocks,
  ),
  "Migration performs no migration-time Storage-object mutation",
);
migrationIncludes(
  "if exists (select 1 from public.job_photos limit 1)",
  "Migration fails closed if the verified zero-metadata baseline drifts",
);
migrationIncludes(
  "The pre-existing orphaned Storage object is intentionally preserved",
  "Migration documents immutable preservation of the Production orphan",
);

for (const columnContract of [
  "add column upload_operation_key uuid not null",
  "add column upload_request_fingerprint text not null",
  "alter column file_url drop not null",
  "job_photos_company_upload_operation_key_key",
  "job_photos_file_path_key",
  "job_photos_upload_request_fingerprint_check",
  "upload_request_fingerprint ~ '^[a-f0-9]{64}$'",
  "job_photos_file_url_not_persisted_check",
  "check (file_url is null)",
]) {
  migrationIncludes(columnContract, `Migration includes ${columnContract}`);
}

migrationIncludes(
  "create or replace function public.wtos_job_photo_storage_path_is_valid",
  "Migration validates the canonical private object path",
);
migrationIncludes(
  "coalesce(pg_catalog.array_length(folder_parts, 1), 0) <> 3",
  "Canonical object paths contain exactly company, relation kind, and relation ID folders",
);
for (const relationKind of [
  "inspection",
  "job",
  "property",
  "customer",
  "estimate",
  "company",
]) {
  migrationIncludes(`'${relationKind}'`, `Canonical path supports ${relationKind}`);
}
migrationIncludes(
  "pg_catalog.substring(object_filename, 1, 36)::uuid",
  "Canonical filename begins with its opaque UUID operation key",
);
migrationIncludes(
  "pg_catalog.substring(object_filename, 37, 1) <> '-'",
  "Canonical filename separator uses parser-safe function-call grammar",
);
check(
  !/pg_catalog\.substring\([^)]*\bfrom\b/i.test(migration) &&
    !/pg_catalog\.(?:coalesce|nullif|trim|overlay|position|extract)\b/i.test(
      migration,
    ),
  "Migration contains no schema-qualified PostgreSQL special-expression syntax",
);

const uploadAuthorizationSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_can_upload_job_photo_object",
  "create or replace function public.wtos_can_rollback_job_photo_object",
);
const recoveryAuthenticatorSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_resolve_job_photo_recovery_uploader",
  "create or replace function public.wtos_can_upload_job_photo_object",
);
const rollbackAuthorizationSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_can_rollback_job_photo_object",
  "create or replace function public.wtos_enforce_job_photo_upload_operation_transition",
);
const beginSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_begin_job_photo_upload",
  "create or replace function public.wtos_cancel_job_photo_upload",
);
const cancelSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_cancel_job_photo_upload",
  "create or replace function public.wtos_confirm_job_photo_upload_abort",
);
const confirmAbortSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_confirm_job_photo_upload_abort",
  "create or replace function public.wtos_list_my_job_photo_upload_recoveries",
);
const recoveryListSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_list_my_job_photo_upload_recoveries",
  "create or replace function public.wtos_claim_job_photo_upload_recovery",
);
const recoveryClaimSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_claim_job_photo_upload_recovery",
  "create or replace function public.wtos_confirm_job_photo_upload_recovery_abort",
);
const recoveryConfirmSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_confirm_job_photo_upload_recovery_abort",
  "create or replace function public.wtos_expire_job_photo_upload_recovery_lease",
);
const leaseExpirySqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_expire_job_photo_upload_recovery_lease",
  "create or replace function public.wtos_register_job_photo",
);
const registrationSqlSection = sourceSection(
  normalizedMigration,
  "create or replace function public.wtos_register_job_photo",
  "alter table public.job_photos enable row level security",
);

migrationIncludes(
  "create or replace function public.wtos_lock_job_photo_path( object_name text ) returns void language sql volatile security definer set search_path = ''",
  "One fixed-search-path volatile helper owns the deterministic path lock",
);
migrationIncludes(
  "pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended( 'wtos:job-photos:' || coalesce(object_name, ''), 7465628248399941 ) )",
  "Path locks use the same deterministic namespace and hash seed",
);
check(
  uploadAuthorizationSection.includes(
    "perform public.wtos_lock_job_photo_path(object_name)",
  ) &&
    uploadAuthorizationSection.indexOf(
      "perform public.wtos_lock_job_photo_path(object_name)",
    ) < uploadAuthorizationSection.indexOf("path_company_id :=") &&
    uploadAuthorizationSection.includes("volatile security definer"),
  "Storage INSERT authorization locks the path before company and relation checks",
);
check(
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
  "Storage INSERT requires an exact reserved operation, uploader, and live server lease",
);
check(
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
  "Rollback locks first and freshly verifies canonical path, company authority, ownership, and no metadata",
);
check(
  recoveryAuthenticatorSection.includes("(select auth.uid())") &&
    recoveryAuthenticatorSection.includes("public.wtos_is_service_role_request()") &&
    !recoveryAuthenticatorSection.includes("wtos_can_manage_documents") &&
    !recoveryAuthenticatorSection.includes("wtos_can_manage_production") &&
    beginSqlSection.includes("public.wtos_resolve_job_photo_recovery_uploader(") &&
    beginSqlSection.includes("public.wtos_resolve_job_photo_uploader(") &&
    beginSqlSection.indexOf("public.wtos_resolve_job_photo_recovery_uploader(") <
      beginSqlSection.indexOf("if upload_operation.id is not null") &&
    beginSqlSection.indexOf("if upload_operation.id is not null") <
      beginSqlSection.indexOf("public.wtos_resolve_job_photo_uploader(") &&
    cancelSqlSection.includes("public.wtos_resolve_job_photo_recovery_uploader(") &&
    !cancelSqlSection.includes("public.wtos_resolve_job_photo_uploader(") &&
    confirmAbortSqlSection.includes(
      "public.wtos_resolve_job_photo_recovery_uploader(",
    ) &&
    !confirmAbortSqlSection.includes("public.wtos_resolve_job_photo_uploader("),
  "Exact existing-state replay and cleanup remain available only to the immutable uploader after role revocation",
);
for (const [section, label] of [
  [beginSqlSection, "begin"],
  [cancelSqlSection, "cancel"],
  [confirmAbortSqlSection, "confirm-abort"],
  [registrationSqlSection, "register"],
]) {
  check(
    section.includes("perform public.wtos_lock_job_photo_path(target_file_path)"),
    `${label} shares the exact path transaction lock`,
  );
}
check(
  registrationSqlSection.includes(
    "perform public.wtos_lock_job_photo_path(target_file_path)",
  ) &&
    registrationSqlSection.indexOf(
      "perform public.wtos_lock_job_photo_path(target_file_path)",
    ) < registrationSqlSection.indexOf("insert into public.job_photos"),
  "Registration uses the identical path-keyed lock before object and metadata checks",
);
migrationIncludes(
  "create or replace function public.wtos_can_upload_job_photo_object",
  "Storage uploads validate company permission and linked-record scope",
);
for (const linkedTable of [
  "inspections",
  "jobs",
  "properties",
  "customers",
  "estimates",
  "companies",
]) {
  migrationIncludes(
    `from public.${linkedTable}`,
    `Storage upload validation checks ${linkedTable}`,
  );
}

migrationIncludes(
  "create or replace function public.wtos_validate_job_photo_scope() returns trigger",
  "Metadata has an independent scope-validation trigger",
);
migrationIncludes(
  "Job-photo company, path, operation key, and request fingerprint are immutable.",
  "Stable upload identity is immutable",
);
migrationIncludes(
  "Job-photo path relation must match the highest-priority linked record.",
  "Metadata path follows deterministic relation precedence",
);
for (const companyLink of ["customer", "property", "job", "estimate", "inspection"]) {
  migrationIncludes(
    `Job-photo ${companyLink} must belong to the photo company.`,
    `${companyLink} references fail closed across companies`,
  );
}
migrationIncludes(
  "from storage.objects as object join public.job_photo_upload_operations as operation",
  "Metadata object validation joins the exact durable reservation",
);
migrationIncludes(
  "object.name = new.file_path and object.owner_id = operation.uploader_user_id::text",
  "Metadata requires the exact uploader-owned private object",
);
migrationIncludes(
  "create trigger job_photos_validate_scope before insert or update",
  "Scope validation executes for every metadata insert and update",
);

migrationIncludes(
  "create or replace function public.wtos_register_job_photo",
  "Registration uses one audited transactional RPC boundary",
);
migrationIncludes(
  "create table public.job_photo_upload_operations",
  "Uploads use one durable internal reservation table",
);
for (const operationContract of [
  "registration_digest text not null",
  "uploader_user_id uuid not null references auth.users(id) on delete restrict",
  "recovery_lease_token uuid not null",
  "recovery_lease_expires_at timestamptz not null",
  "state in ('reserved', 'canceling', 'committed', 'aborted')",
  "unique (company_id, upload_operation_key)",
  "unique (file_path)",
  "foreign key (company_id, upload_operation_key) references public.job_photo_upload_operations",
]) {
  migrationIncludes(operationContract, `Reservation includes ${operationContract}`);
}
migrationIncludes(
  "create index job_photo_upload_operations_recovery_lookup_idx on public.job_photo_upload_operations ( uploader_user_id, state, recovery_lease_expires_at ) where state in ('reserved', 'canceling')",
  "Nonterminal uploader recovery polling uses a scoped partial index",
);

for (const [section, label] of [
  [beginSqlSection, "begin"],
  [cancelSqlSection, "cancel"],
  [confirmAbortSqlSection, "confirm-abort"],
  [registrationSqlSection, "register"],
]) {
  check(
    section.includes(
      "target_file_path text, target_recovery_lease_token uuid,",
    ),
    `${label} requires the per-tab recovery lease token as the fifth argument`,
  );
}

check(
  beginSqlSection.includes(
    "upload_operation.state in ('reserved', 'canceling')",
  ) &&
    beginSqlSection.includes(
      "upload_operation.recovery_lease_token is distinct from target_recovery_lease_token",
    ) &&
    beginSqlSection.includes("errcode = '55p03'") &&
    beginSqlSection.includes(
      "set recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'",
    ),
  "Same-token BEGIN heartbeats both nonterminal states and different-token BEGIN fails with the stable lock code",
);

check(
  recoveryListSqlSection.includes(
    "public.wtos_resolve_job_photo_recovery_uploader(",
  ) &&
    recoveryListSqlSection.includes(
      "operation.state in ('reserved', 'canceling')",
    ) &&
    recoveryListSqlSection.includes("operation.uploader_user_id") &&
    recoveryListSqlSection.includes("operation.company_id") &&
    recoveryListSqlSection.includes("operation.upload_operation_key") &&
    recoveryListSqlSection.includes("operation.recovery_lease_expires_at") &&
    !recoveryListSqlSection.includes("operation.file_path") &&
    !recoveryListSqlSection.includes("operation.upload_request_fingerprint") &&
    !recoveryListSqlSection.includes("operation.registration_digest"),
  "Recovery discovery is uploader-only, nonterminal, and excludes path, fingerprint, digest, and business metadata",
);

check(
  recoveryClaimSqlSection.includes(
    "public.wtos_resolve_job_photo_recovery_uploader(",
  ) &&
    recoveryClaimSqlSection.includes(
      "operation.uploader_user_id = request_uploader_user_id",
    ) &&
    recoveryClaimSqlSection.includes(
      "perform public.wtos_lock_job_photo_path(locked_file_path)",
    ) &&
    recoveryClaimSqlSection.includes(
      "upload_operation.recovery_lease_expires_at > pg_catalog.clock_timestamp()",
    ) &&
    recoveryClaimSqlSection.includes("errcode = '55p03'") &&
    recoveryClaimSqlSection.includes("state = 'canceling'") &&
    recoveryClaimSqlSection.includes(
      "recovery_lease_token = target_recovery_lease_token",
    ) &&
    recoveryClaimSqlSection.includes("interval '5 minutes'") &&
    recoveryClaimSqlSection.includes("null::text"),
  "Recovery claim is uploader-scoped, path-serialized, lease-safe, rotates/adopts the token, and hides terminal paths",
);

check(
  recoveryConfirmSqlSection.includes(
    "operation.uploader_user_id = request_uploader_user_id",
  ) &&
    recoveryConfirmSqlSection.includes(
      "perform public.wtos_lock_job_photo_path(locked_file_path)",
    ) &&
    recoveryConfirmSqlSection.includes(
      "upload_operation.recovery_lease_token is distinct from target_recovery_lease_token",
    ) &&
    recoveryConfirmSqlSection.includes("from storage.objects as object") &&
    recoveryConfirmSqlSection.includes("from public.job_photos as photo") &&
    recoveryConfirmSqlSection.includes("state = 'aborted'") &&
    recoveryConfirmSqlSection.includes(
      "upload_operation.state in ('committed', 'aborted')",
    ),
  "Recovery confirmation requires exact uploader/token, shared locking, zero residue, and terminal idempotency",
);

check(
  leaseExpirySqlSection.includes(
    "if not public.wtos_is_service_role_request()",
  ) &&
    leaseExpirySqlSection.includes(
      "operation.uploader_user_id = target_uploader_user_id",
    ) &&
    leaseExpirySqlSection.includes(
      "perform public.wtos_lock_job_photo_path(locked_file_path)",
    ) &&
    leaseExpirySqlSection.includes(
      "upload_operation.state not in ('reserved', 'canceling')",
    ) &&
    normalizedMigration.includes(
      "grant execute on function public.wtos_expire_job_photo_upload_recovery_lease( uuid, uuid, uuid ) to service_role",
    ) &&
    !normalizedMigration.includes(
      "grant execute on function public.wtos_expire_job_photo_upload_recovery_lease( uuid, uuid, uuid ) to authenticated",
    ),
  "Hosted lease-expiry control is exact-operation scoped and executable only by service role",
);
migrationIncludes(
  "create or replace function public.wtos_job_photo_registration_digest",
  "Server computes a canonical registration digest",
);
for (const digestField of [
  "company_id",
  "upload_operation_key",
  "upload_request_fingerprint",
  "file_path",
  "customer_id",
  "property_id",
  "job_id",
  "estimate_id",
  "inspection_id",
  "caption",
  "label",
  "taken_at",
  "is_customer_visible",
  "sort_order",
]) {
  migrationIncludes(`'${digestField}',`, `Canonical digest binds ${digestField}`);
}
migrationIncludes(
  "extensions.digest(",
  "Canonical registration identity uses SHA-256",
);
check(
  beginSqlSection.includes(
    "on conflict (company_id, upload_operation_key) do nothing",
  ) &&
    beginSqlSection.includes("return upload_operation") &&
    beginSqlSection.includes("already used for a different request"),
  "Begin converges exact state replay and refuses changed requests",
);
check(
  cancelSqlSection.includes("upload_operation.state = 'reserved'") &&
    cancelSqlSection.includes("state = 'canceling'") &&
    confirmAbortSqlSection.includes(
      "upload_operation.state in ('committed', 'aborted')",
    ) &&
    confirmAbortSqlSection.includes("upload_operation.state <> 'canceling'") &&
    confirmAbortSqlSection.includes("from storage.objects as object") &&
    confirmAbortSqlSection.includes("from public.job_photos as photo") &&
    confirmAbortSqlSection.includes("state = 'aborted'"),
  "Cancel and confirm-abort enforce reserved→canceling→aborted with zero residue",
);
migrationIncludes(
  "create or replace function public.wtos_enforce_job_photo_upload_operation_transition",
  "Reservation state transitions have an independent immutable trigger",
);
migrationIncludes(
  "old.state = 'reserved' and new.state in ('canceling', 'committed')",
  "Reserved operations transition only to canceling or committed",
);
migrationIncludes(
  "old.state = 'reserved' and new.state = 'reserved'",
  "Reserved operations permit only guarded lease-heartbeat replays",
);
migrationIncludes(
  "old.state = 'canceling' and new.state = 'canceling'",
  "Canceling operations permit only guarded recovery-lease replays",
);
migrationIncludes(
  "old.state = 'canceling' and new.state = 'aborted'",
  "Only canceling operations transition to aborted",
);
migrationIncludes(
  "new.recovery_lease_token is distinct from old.recovery_lease_token",
  "Terminal transitions cannot rewrite the recovery lease token",
);
migrationIncludes(
  "new.recovery_lease_expires_at is distinct from old.recovery_lease_expires_at",
  "Terminal transitions cannot rewrite recovery lease expiry",
);
check(
  registrationSqlSection.includes("upload_operation.state = 'committed'") &&
    registrationSqlSection.includes("upload_operation.state <> 'reserved'") &&
    registrationSqlSection.includes("insert into public.job_photos") &&
    registrationSqlSection.indexOf("insert into public.job_photos") <
      registrationSqlSection.lastIndexOf("state = 'committed'"),
  "Register recovers committed replay and atomically commits a reserved operation",
);
migrationIncludes(
  "target_file_path, null, target_taken_at",
  "Registration persists no durable public or signed URL",
);

migrationIncludes(
  "revoke all on table public.job_photos from public, anon, authenticated, service_role",
  "Metadata privileges start fully revoked",
);
migrationIncludes(
  "grant select on table public.job_photos to authenticated, service_role",
  "Authenticated users receive company-scoped metadata reads only",
);
migrationIncludes(
  "grant delete on table public.job_photos to service_role",
  "Only service role receives exact isolated-test metadata cleanup",
);
check(
  !/grant\s+(?:insert|update|delete|truncate|references|trigger|all)[^;]*on\s+table\s+public\.job_photos\s+to\s+authenticated/i.test(
    migration,
  ),
  "Authenticated users cannot bypass the registration RPC with direct metadata writes",
);
migrationIncludes(
  "alter table public.job_photo_upload_operations enable row level security",
  "Internal reservations have RLS enabled",
);
migrationIncludes(
  "revoke all on table public.job_photo_upload_operations from public, anon, authenticated, service_role",
  "Internal reservation table privileges start fully revoked",
);
migrationIncludes(
  "grant select, delete on table public.job_photo_upload_operations to service_role",
  "Only service role receives isolated reservation inspection and cleanup",
);
migrationIncludes(
  'create policy "WTOS users read own job photo upload operations"',
  "Reservation RLS has a future-safe authenticated read policy",
);
migrationIncludes(
  "uploader_user_id = (select auth.uid()) and public.wtos_can_read_company(company_id)",
  "Reservation RLS is scoped to exact uploader and company",
);
check(
  !/grant\s+(?:select|insert|update|delete|truncate|references|trigger|all)[^;]*on\s+table\s+public\.job_photo_upload_operations\s+to\s+authenticated/i.test(
    migration,
  ),
  "Authenticated callers cannot access durable reservations outside guarded RPCs",
);

migrationIncludes(
  "values ( 'job-photos', 'job-photos', false, 26214400, array['image/*']::text[] )",
  "The job-photos bucket enforces the app's 25 MiB image-only upload contract",
);
migrationIncludes(
  "public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types",
  "The job-photos bucket is deterministically private and constrained on replay",
);
for (const legacyPolicy of [
  "Authenticated users read job photos",
  "Authenticated users upload job photos",
  "Authenticated users update job photos",
]) {
  migrationIncludes(
    `drop policy if exists \"${legacyPolicy}\" on storage.objects`,
    `Migration drops broad legacy Storage policy ${legacyPolicy}`,
  );
}
for (const scopedPolicy of [
  "WTOS users read company job photos",
  "WTOS users upload company job photos",
  "WTOS users rollback own job photo uploads",
]) {
  migrationIncludes(
    `create policy \"${scopedPolicy}\"`,
    `Migration creates scoped Storage policy ${scopedPolicy}`,
  );
}
migrationIncludes(
  'drop policy if exists "WTOS users update company job photos" on storage.objects',
  "Migration removes any prior authenticated Storage UPDATE policy",
);
check(
  !normalizedMigration.includes(
    'create policy "wtos users update company job photos"',
  ),
  "Authenticated callers cannot replace registered or pending upload bytes",
);
migrationIncludes(
  "exists ( select 1 from public.job_photos as photo where photo.file_path = storage.objects.name",
  "Storage reads require registered metadata so pre-existing orphans fail closed",
);
migrationIncludes(
  "public.wtos_can_rollback_job_photo_object(name, owner_id)",
  "Storage DELETE delegates to the lock-aware rollback authorization helper",
);
correctionMigrationIncludes(
  'create policy "WTOS users select own rollback job photo deletes" on storage.objects for select to authenticated',
  "Storage delete preflight receives an authenticated SELECT policy",
);
correctionMigrationIncludes(
  "bucket_id = 'job-photos' and storage.allow_any_operation( array[ 'storage.object.delete', 'storage.object.delete_many' ] ) and public.wtos_can_rollback_job_photo_object(name, owner_id)",
  "Storage delete preflight is limited to exact delete operations and the existing rollback helper",
);
check(
  !normalizedCorrectionMigration.includes("storage.object.list") &&
    !normalizedCorrectionMigration.includes("storage.object.get") &&
    !normalizedCorrectionMigration.includes("object.get_authenticated"),
  "The correction grants no ordinary Storage list/read/download visibility",
);
check(
  (correctionMigration.match(/when\s+serialization_failure\s+then/gi) ?? [])
    .length === 5 &&
    (correctionMigration.match(/errcode\s*=\s*'P0001'/gi) ?? []).length === 5 &&
    (correctionMigration.match(/^\s*raise;\s*$/gim) ?? []).length === 5 &&
    !/errcode\s*=\s*'40001'/i.test(correctionMigration) &&
    !/when\s+others/i.test(correctionMigration),
  "Correction wrappers translate only exact semantic conflicts and preserve genuine serialization failures",
);
migrationIncludes(
  "revoke all on function public.wtos_lock_job_photo_path(text) from public, anon, authenticated, service_role",
  "Authenticated callers cannot invoke the raw lock helper directly",
);
check(
  !normalizedMigration.includes(
    "grant execute on function public.wtos_lock_job_photo_path(text)",
  ),
  "The raw lock helper receives no public API grant",
);
migrationIncludes(
  "grant execute on function public.wtos_can_upload_job_photo_object(text) to authenticated",
  "Authenticated Storage INSERT policy can execute only its bounded helper",
);
migrationIncludes(
  "grant execute on function public.wtos_can_rollback_job_photo_object(text, text) to authenticated",
  "Authenticated Storage DELETE policy can execute only its bounded helper",
);
for (const guardedRecoveryGrant of [
  "grant execute on function public.wtos_list_my_job_photo_upload_recoveries(uuid) to authenticated, service_role",
  "grant execute on function public.wtos_claim_job_photo_upload_recovery( uuid, uuid, uuid, uuid ) to authenticated, service_role",
  "grant execute on function public.wtos_confirm_job_photo_upload_recovery_abort( uuid, uuid, uuid, uuid ) to authenticated, service_role",
]) {
  migrationIncludes(
    guardedRecoveryGrant,
    `Guarded uploader recovery API grant exists: ${guardedRecoveryGrant}`,
  );
}

check(
  !normalizedMigration.includes("customer-documents"),
  "Job-photo migration does not alter the customer-documents bucket or policies",
);
for (const documentPolicy of [
  "WTOS users read customer documents",
  "WTOS users upload customer documents",
  "WTOS users update customer documents",
]) {
  check(
    documentStorageMigration.includes(documentPolicy),
    `Existing customer-document policy remains registered: ${documentPolicy}`,
  );
}

const createPhotoSection = sourceSection(
  repository,
  "export async function createJobPhoto(",
  "export async function createInvoice(",
);
const preparePhotoSection = sourceSection(
  repository,
  "export async function prepareJobPhotoUploadAttempt(",
  "function randomStorageId()",
);
const documentLockSection = sourceSection(
  repository,
  "function holdJobPhotoRecoveryDocumentLock(",
  "export async function getJobPhotoRecoveryLeaseToken()",
);
const recoveryTokenSection = sourceSection(
  repository,
  "export async function getJobPhotoRecoveryLeaseToken()",
  "function getPhotoCrypto()",
);
const settleRecoverySection = sourceSection(
  repository,
  "export async function settleJobPhotoUploadRecovery(",
  "async function hydrateRegisteredJobPhoto(",
);
const rootRecoveryCycleSection = sourceSection(
  app,
  "const runJobPhotoRecoveryCycle = async () => {",
  "void runJobPhotoRecoveryCycle();",
);
const hydratePhotoSection = sourceSection(
  repository,
  "export async function hydrateJobPhotoSignedUrls(",
  "export async function getJobPhotoFileSignedUrl(",
);
const inspectionsPhotoSurface = sourceSection(
  app,
  "function InspectionsView(",
  "type PhotosViewProps =",
);
const photosSurface = sourceSection(
  app,
  "function PhotosView(",
  "type InvoicesViewProps =",
);
const cancelPhotoSection = sourceSection(
  repository,
  "async function cancelJobPhotoUploadAttempt(",
  "async function hydrateRegisteredJobPhoto(",
);
check(
  documentLockSection.includes("window.navigator.locks.request(") &&
    documentLockSection.includes('{ mode: "exclusive", ifAvailable: true }') &&
    documentLockSection.includes("if (!lock)") &&
    documentLockSection.includes("resolve(false)") &&
    documentLockSection.includes("await new Promise<void>(() => undefined)"),
  "Each browser document holds one fail-closed exclusive Web Lock for its non-PII recovery token",
);
check(
  recoveryTokenSection.includes("window.sessionStorage") &&
    recoveryTokenSection.includes("storedToken && jobPhotoUuidPattern.test(storedToken)") &&
    recoveryTokenSection.includes("crypto.randomUUID().toLowerCase()") &&
    recoveryTokenSection.indexOf(
      "await holdJobPhotoRecoveryDocumentLock(candidate)",
    ) < recoveryTokenSection.indexOf("window.sessionStorage.setItem(") &&
    recoveryTokenSection.includes("if (!window.navigator.locks)") &&
    recoveryTokenSection.includes(
      "Secure photo recovery could not establish safe tab ownership.",
    ),
  "A cloned session token is tested under Web Locks, rotated before persistence when occupied, and fails closed without arbitration",
);
check(
  preparePhotoSection.includes("await getJobPhotoRecoveryLeaseToken()") &&
    createPhotoSection.indexOf("await prepareJobPhotoUploadAttempt(") <
      createPhotoSection.indexOf('"wtos_begin_job_photo_upload"') &&
    createPhotoSection.indexOf('"wtos_begin_job_photo_upload"') <
      createPhotoSection.indexOf(".upload(attempt.filePath, file"),
  "Web Lock arbitration completes before upload reservation and Storage INSERT",
);
check(
  settleRecoverySection.indexOf("await getJobPhotoRecoveryLeaseToken()") <
      settleRecoverySection.indexOf(
        '"wtos_claim_job_photo_upload_recovery"',
      ) &&
    rootRecoveryCycleSection.indexOf(
      "await getJobPhotoRecoveryLeaseToken()",
    ) < rootRecoveryCycleSection.indexOf("await listMyJobPhotoUploadRecoveries(") &&
    rootRecoveryCycleSection.indexOf("activeJobPhotoUploadsRef.current.has(") <
      rootRecoveryCycleSection.indexOf("await settleJobPhotoUploadRecovery("),
  "Root recovery arbitrates the tab before list/claim and never claims a locally active upload",
);
check(
  rootRecoveryCycleSection.indexOf("await heartbeatJobPhotoUploadAttempt(") <
      rootRecoveryCycleSection.indexOf("await listMyJobPhotoUploadRecoveries(") &&
    app.includes("JOB_PHOTO_RECOVERY_POLL_INTERVAL_MS") &&
    app.includes('data-testid="job-photo-recovery-status"') &&
    app.includes('setJobPhotoRecoveryState("blocked")') &&
    app.includes('setJobPhotoRecoveryState("waiting")'),
  "Root recovery heartbeats live uploads, polls durable operations, and exposes stable blocked/waiting state hooks",
);
check(
  settleRecoverySection.indexOf(
    '"wtos_claim_job_photo_upload_recovery"',
  ) < settleRecoverySection.indexOf(".remove([claim.file_path])") &&
    settleRecoverySection.indexOf(".remove([claim.file_path])") <
      settleRecoverySection.indexOf(
        '"wtos_confirm_job_photo_upload_recovery_abort"',
      ) &&
    settleRecoverySection.includes('=== "55P03"'),
  "Recovery claims before exact removal, confirms only afterward, and leaves another live tab untouched",
);
check(
  !repository.includes(".getPublicUrl("),
  "Repository generates no durable public job-photo URL",
);
check(
  createPhotoSection.includes(
    "buildJobPhotoUploadRpcArgs(normalizedInput, attempt)",
  ) &&
    createPhotoSection.includes("attempt.filePath") &&
    repository.includes("target_upload_operation_key: attempt.operationKey") &&
    repository.includes(
      "target_upload_request_fingerprint: attempt.requestFingerprint",
    ) &&
    repository.includes("target_file_path: attempt.filePath") &&
    repository.includes(
      "target_recovery_lease_token: attempt.recoveryLeaseToken",
    ),
  "Upload identity includes stable operation, fingerprint, private path, and owned recovery lease values",
);
check(
  createPhotoSection.includes(".upload(") &&
    createPhotoSection.includes("upsert: false"),
  "Storage upload refuses blind replacement",
);
check(
  createPhotoSection.includes('"wtos_begin_job_photo_upload"') &&
    repository.includes('"wtos_register_job_photo"'),
  "Upload uses durable reservation before hardened metadata registration",
);
check(
  cancelPhotoSection.includes('"wtos_cancel_job_photo_upload"') &&
    cancelPhotoSection.includes(".remove([attempt.filePath])") &&
    cancelPhotoSection.includes('"wtos_confirm_job_photo_upload_abort"'),
  "Failure recovery durably cancels, removes only the exact object, then confirms abort",
);
check(
  createPhotoSection.indexOf(
    '.select("upload_operation_key, upload_request_fingerprint")',
  ) < createPhotoSection.indexOf('"wtos_begin_job_photo_upload"') &&
    createPhotoSection.indexOf('"wtos_begin_job_photo_upload"') <
      createPhotoSection.indexOf(".upload(attempt.filePath, file") &&
    createPhotoSection.indexOf(".upload(attempt.filePath, file") <
      createPhotoSection.indexOf("await tryRegisterJobPhoto("),
  "Schema readiness and durable reservation precede Storage upload and registration",
);
check(
  createPhotoSection.includes(
    "// Registration and durable cancellation below resolve ambiguous transport results.",
  ) &&
    !createPhotoSection.includes("if (!uploadError)") &&
    !createPhotoSection.includes("createdObjectThisAttempt"),
  "Ambiguous upload responses still proceed through registration or durable cancellation",
);
check(
  cancelPhotoSection.indexOf('"wtos_cancel_job_photo_upload"') <
    cancelPhotoSection.indexOf(".remove([attempt.filePath])") &&
    cancelPhotoSection.indexOf(".remove([attempt.filePath])") <
      cancelPhotoSection.indexOf('"wtos_confirm_job_photo_upload_abort"') &&
    cancelPhotoSection.includes('cancellation.state === "committed"') &&
    cancelPhotoSection.includes('confirmation.state === "committed"'),
  "Cancellation is tombstoned before exact removal and committed attempts are never deleted",
);
check(
  createPhotoSection.includes('reservation.state === "committed"') &&
    createPhotoSection.includes('reservation.state === "canceling"') &&
    createPhotoSection.includes('reservation.state === "aborted"') &&
    repository.includes("export class JobPhotoUploadAttemptAbortedError"),
  "Terminal reservation states are explicit and aborted attempts require a fresh identity",
);
check(
  repository.includes("JOB_PHOTO_SIGNED_URL_TTL_SECONDS") &&
    repository.includes("export const JOB_PHOTO_SIGNED_URL_TTL_SECONDS = 60 * 10") &&
    repository.includes("createSignedUrls(paths, JOB_PHOTO_SIGNED_URL_TTL_SECONDS)"),
  "Authorized snapshot reads hydrate short-lived signed URLs",
);
check(
  hydratePhotoSection.indexOf("try {") <
      hydratePhotoSection.indexOf(".createSignedUrls(") &&
    hydratePhotoSection.indexOf(".createSignedUrls(") <
      hydratePhotoSection.indexOf("} catch {") &&
    hydratePhotoSection.includes("file_url: null") &&
    hydratePhotoSection.includes("signed_url: null"),
  "Thrown signed-URL transport failures fail closed per batch without rejecting the CRM snapshot",
);
check(
  repository.includes("file_url: null") && repository.includes("signed_url:"),
  "Signed access is in-memory and durable URL state remains null",
);
check(
  types.includes("file_url: string | null") &&
    types.includes("signed_url: string | null") &&
    types.includes("upload_operation_key: string") &&
    types.includes("upload_request_fingerprint: string"),
  "CRM types distinguish persisted private metadata from ephemeral access",
);
check(
  app.includes("photo.signed_url") && !app.includes("copyPhotoUrl(photo.file_url)"),
  "Photos workspace renders and copies only ephemeral signed access",
);
const customerProfilePhotoSection = sourceSection(
  app,
  "function CustomerProfilePanel(",
  "function CustomerQuickAction(",
);
const customerPropertiesPhotoSection = sourceSection(
  app,
  "function CustomerPropertiesSection(",
  "function CustomerCommunicationsSection(",
);
check(
  customerProfilePhotoSection.includes("src={primaryPhoto.signed_url}") &&
    customerProfilePhotoSection.includes("<img") &&
    !customerProfilePhotoSection.includes("<Image"),
  "Customer 360 renders transient signed photos without the Next Image dimension heuristic",
);
check(
  customerPropertiesPhotoSection.includes(
    "src={property.photos.find(hasSignedJobPhotoUrl)!.signed_url}",
  ) &&
    customerPropertiesPhotoSection.includes("<img") &&
    !customerPropertiesPhotoSection.includes("<Image"),
  "Customer property cards render transient signed photos without the Next Image dimension heuristic",
);
check(
  app.includes('window.open(signedUrl, "_blank", "noopener,noreferrer")'),
  "Photos workspace opens temporary links in an isolated tab",
);
for (const testId of [
  "job-photo-upload-form",
  "job-photo-company-select",
  "job-photo-company-filter",
  "job-photo-relation-filter",
  "job-photo-image",
  "job-photo-copy-link",
  "job-photo-open",
  "customer-360-photos",
]) {
  check(app.includes(`data-testid="${testId}"`), `Application exposes ${testId} regression coverage`);
}
check(
  fieldOperations.includes("operationKey") &&
    fieldOperations.includes("createJobPhoto(") &&
    fieldOperations.includes("photoUploadAttemptRef.current = uploadAttempt"),
  "Field upload attempts retain a stable operation key for retry",
);

for (const [surface, source, mountedRef, inFlightRef] of [
  [
    "Photos workspace",
    photosSurface,
    "uploadMountedRef",
    "uploadInFlightRef",
  ],
  [
    "inspection upload",
    inspectionsPhotoSurface,
    "inspectionPhotoUploadMountedRef",
    "inspectionPhotoUploadInFlightRef",
  ],
  [
    "Field Operations",
    fieldOperations,
    "photoUploadMountedRef",
    "photoUploadInFlightRef",
  ],
]) {
  check(
    source.includes(`${mountedRef}.current = false`) &&
      source.includes(`!${inFlightRef}.current`) &&
      source.includes(`if (!${mountedRef}.current)`) &&
      source.includes("onJobPhotoUploadActive({ input: photoInput, attempt: uploadAttempt })") &&
      source.includes("onJobPhotoUploadInactive(") &&
      source.includes("onJobPhotoUploadSettled("),
    `${surface} preserves an in-flight operation through unmount and releases durable recovery only after the live call settles`,
  );
}

check(
  browserHarness.includes("removeRegressionJobPhotoObjects(env, jobPhotoStoragePaths)") &&
    browserHarness.includes('deleteByIds(env, "job_photos", "id", jobPhotoIds)'),
  "Browser cleanup removes exact Storage paths and exact metadata IDs",
);
check(
  browserHarness.indexOf(
    "removeRegressionJobPhotoObjects(env, jobPhotoStoragePaths)",
  ) < browserHarness.indexOf('deleteByIds(env, "job_photos", "id", jobPhotoIds)'),
  "Browser cleanup removes private objects before metadata",
);
check(
  browserHarness.includes("assertRegressionJobPhotoObjectsRemoved(") &&
    browserHarness.includes("jobPhotoObjectsDeleted"),
  "Browser cleanup proves zero private object residue",
);

console.log(`Secure company-scoped job photos: PASS (${assertionCount} assertions)`);
