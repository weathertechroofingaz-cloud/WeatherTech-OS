begin;

-- Secure Company-Scoped Job Photos & Field Upload Reliability Phase 1
--
-- This migration hardens future job-photo writes without inserting, updating,
-- deleting, moving, or reclassifying any business record or Storage object.
-- The pre-existing orphaned Storage object is intentionally preserved. Making
-- the bucket private and requiring registered metadata for reads makes every
-- orphan fail closed for ordinary clients.

lock table public.job_photos in access exclusive mode;

do $$
begin
  if exists (select 1 from public.job_photos limit 1) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo hardening requires the verified zero-metadata baseline; migration aborted without backfill.';
  end if;
end;
$$;

alter table public.job_photos
add column upload_operation_key uuid not null,
add column upload_request_fingerprint text not null,
alter column file_url drop not null;

alter table public.job_photos
add constraint job_photos_company_upload_operation_key_key
unique (company_id, upload_operation_key),
add constraint job_photos_file_path_key
unique (file_path),
add constraint job_photos_upload_request_fingerprint_check
check (upload_request_fingerprint ~ '^[a-f0-9]{64}$') not valid,
add constraint job_photos_file_url_not_persisted_check
check (file_url is null) not valid;

alter table public.job_photos
validate constraint job_photos_upload_request_fingerprint_check;

alter table public.job_photos
validate constraint job_photos_file_url_not_persisted_check;

create table public.job_photo_upload_operations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  upload_operation_key uuid not null,
  upload_request_fingerprint text not null,
  file_path text not null,
  registration_digest text not null,
  uploader_user_id uuid not null references auth.users(id) on delete restrict,
  recovery_lease_token uuid not null,
  recovery_lease_expires_at timestamptz not null,
  state text not null default 'reserved',
  reserved_at timestamptz not null default now(),
  canceling_at timestamptz,
  committed_at timestamptz,
  aborted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_photo_upload_operations_company_operation_key_key
    unique (company_id, upload_operation_key),
  constraint job_photo_upload_operations_file_path_key
    unique (file_path),
  constraint job_photo_upload_operations_request_fingerprint_check
    check (upload_request_fingerprint ~ '^[a-f0-9]{64}$'),
  constraint job_photo_upload_operations_registration_digest_check
    check (registration_digest ~ '^[a-f0-9]{64}$'),
  constraint job_photo_upload_operations_state_check
    check (state in ('reserved', 'canceling', 'committed', 'aborted')),
  constraint job_photo_upload_operations_state_timestamps_check
    check (
      (
        state = 'reserved'
        and canceling_at is null
        and committed_at is null
        and aborted_at is null
      )
      or (
        state = 'canceling'
        and canceling_at is not null
        and committed_at is null
        and aborted_at is null
      )
      or (
        state = 'committed'
        and canceling_at is null
        and committed_at is not null
        and aborted_at is null
      )
      or (
        state = 'aborted'
        and canceling_at is not null
        and committed_at is null
        and aborted_at is not null
      )
  )
);

-- The client establishes recovery_lease_token under a document-lifetime Web
-- Lock before any upload/recovery call. The server-owned five-minute expiry is
-- defense in depth: same-document retries are immediate, while a different
-- document cannot take over until the prior heartbeat expires.
create index job_photo_upload_operations_recovery_lookup_idx
on public.job_photo_upload_operations (
  uploader_user_id,
  state,
  recovery_lease_expires_at
)
where state in ('reserved', 'canceling');

alter table public.job_photos
add constraint job_photos_upload_operation_fkey
foreign key (company_id, upload_operation_key)
references public.job_photo_upload_operations (
  company_id,
  upload_operation_key
)
on delete restrict;

create or replace function public.wtos_job_photo_storage_path_is_valid(
  object_name text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  folder_parts text[];
  object_filename text;
  parsed_company_id uuid;
  parsed_relation_id uuid;
  parsed_operation_key uuid;
begin
  if object_name is null or object_name = '' then
    return false;
  end if;

  folder_parts := storage.foldername(object_name);
  object_filename := storage.filename(object_name);

  if coalesce(pg_catalog.array_length(folder_parts, 1), 0) <> 3
    or folder_parts[2] not in (
      'inspection',
      'job',
      'property',
      'customer',
      'estimate',
      'company'
    )
    or object_filename is null
    or pg_catalog.length(object_filename) < 38
    or pg_catalog.substring(object_filename, 37, 1) <> '-'
  then
    return false;
  end if;

  parsed_company_id := folder_parts[1]::uuid;
  parsed_relation_id := folder_parts[3]::uuid;
  parsed_operation_key := pg_catalog.substring(object_filename, 1, 36)::uuid;

  return parsed_company_id is not null
    and parsed_relation_id is not null
    and parsed_operation_key is not null;
exception
  when invalid_text_representation or array_subscript_error then
    return false;
end;
$$;

create or replace function public.wtos_lock_job_photo_path(
  object_name text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:job-photos:' || coalesce(object_name, ''),
      7465628248399941
    )
  );
$$;

create or replace function public.wtos_job_photo_registration_digest(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_upload_request_fingerprint text,
  target_file_path text,
  target_customer_id uuid default null,
  target_property_id uuid default null,
  target_job_id uuid default null,
  target_estimate_id uuid default null,
  target_inspection_id uuid default null,
  target_caption text default null,
  target_label text default null,
  target_taken_at date default null,
  target_is_customer_visible boolean default false,
  target_sort_order integer default 0
)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'version', 1,
        'company_id', target_company_id,
        'upload_operation_key', target_upload_operation_key,
        'upload_request_fingerprint', target_upload_request_fingerprint,
        'file_path', target_file_path,
        'customer_id', target_customer_id,
        'property_id', target_property_id,
        'job_id', target_job_id,
        'estimate_id', target_estimate_id,
        'inspection_id', target_inspection_id,
        'caption', nullif(pg_catalog.btrim(target_caption), ''),
        'label', nullif(pg_catalog.btrim(target_label), ''),
        'taken_at', target_taken_at,
        'is_customer_visible', coalesce(target_is_customer_visible, false),
        'sort_order', coalesce(target_sort_order, 0)
      )::text,
      'sha256'
    ),
    'hex'
  );
$$;

create or replace function public.wtos_job_photo_request_scope_is_valid(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_file_path text,
  target_customer_id uuid default null,
  target_property_id uuid default null,
  target_job_id uuid default null,
  target_estimate_id uuid default null,
  target_inspection_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  folder_parts text[];
  object_filename text;
  path_company_id uuid;
  path_relation_id uuid;
  path_relation_kind text;
  path_operation_key uuid;
  expected_relation_id uuid;
  expected_relation_kind text;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or not public.wtos_job_photo_storage_path_is_valid(target_file_path)
  then
    return false;
  end if;

  folder_parts := storage.foldername(target_file_path);
  object_filename := storage.filename(target_file_path);
  path_company_id := folder_parts[1]::uuid;
  path_relation_kind := folder_parts[2];
  path_relation_id := folder_parts[3]::uuid;
  path_operation_key := pg_catalog.substring(object_filename, 1, 36)::uuid;

  if path_company_id is distinct from target_company_id
    or path_operation_key is distinct from target_upload_operation_key
  then
    return false;
  end if;

  if target_inspection_id is not null then
    expected_relation_kind := 'inspection';
    expected_relation_id := target_inspection_id;
  elsif target_job_id is not null then
    expected_relation_kind := 'job';
    expected_relation_id := target_job_id;
  elsif target_property_id is not null then
    expected_relation_kind := 'property';
    expected_relation_id := target_property_id;
  elsif target_customer_id is not null then
    expected_relation_kind := 'customer';
    expected_relation_id := target_customer_id;
  elsif target_estimate_id is not null then
    expected_relation_kind := 'estimate';
    expected_relation_id := target_estimate_id;
  else
    expected_relation_kind := 'company';
    expected_relation_id := target_company_id;
  end if;

  if path_relation_kind is distinct from expected_relation_kind
    or path_relation_id is distinct from expected_relation_id
    or not exists (
      select 1
      from public.companies as company
      where company.id = target_company_id
    )
  then
    return false;
  end if;

  return (target_customer_id is null or exists (
      select 1
      from public.customers as customer
      where customer.id = target_customer_id
        and customer.company_id = target_company_id
    ))
    and (target_property_id is null or exists (
      select 1
      from public.properties as property
      where property.id = target_property_id
        and property.company_id = target_company_id
    ))
    and (target_job_id is null or exists (
      select 1
      from public.jobs as job
      where job.id = target_job_id
        and job.company_id = target_company_id
    ))
    and (target_estimate_id is null or exists (
      select 1
      from public.estimates as estimate
      where estimate.id = target_estimate_id
        and estimate.company_id = target_company_id
    ))
    and (target_inspection_id is null or exists (
      select 1
      from public.inspections as inspection
      where inspection.id = target_inspection_id
        and inspection.company_id = target_company_id
    ));
exception
  when invalid_text_representation or array_subscript_error then
    return false;
end;
$$;

create or replace function public.wtos_resolve_job_photo_uploader(
  target_company_id uuid,
  target_uploader_user_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := (select auth.uid());
begin
  if public.wtos_is_service_role_request() then
    if target_uploader_user_id is null or not exists (
      select 1
      from auth.users as account
      where account.id = target_uploader_user_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'Service job-photo requests require an existing uploader user.';
    end if;

    return target_uploader_user_id;
  end if;

  if request_user_id is null
    or (
      target_uploader_user_id is not null
      and target_uploader_user_id is distinct from request_user_id
    )
    or not (
      public.wtos_can_manage_documents(target_company_id)
      or public.wtos_can_manage_production(target_company_id)
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Company document or production access is required for job-photo uploads.';
  end if;

  return request_user_id;
end;
$$;

create or replace function public.wtos_resolve_job_photo_recovery_uploader(
  target_uploader_user_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := (select auth.uid());
begin
  if public.wtos_is_service_role_request() then
    if target_uploader_user_id is null or not exists (
      select 1
      from auth.users as account
      where account.id = target_uploader_user_id
    ) then
      raise exception using
        errcode = '22023',
        message = 'Service job-photo recovery requires an existing uploader user.';
    end if;

    return target_uploader_user_id;
  end if;

  if request_user_id is null
    or (
      target_uploader_user_id is not null
      and target_uploader_user_id is distinct from request_user_id
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Only the original job-photo uploader may recover an upload operation.';
  end if;

  return request_user_id;
end;
$$;

create or replace function public.wtos_can_upload_job_photo_object(
  object_name text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  folder_parts text[];
  path_company_id uuid;
  path_relation_id uuid;
  path_relation_kind text;
  request_user_id uuid;
begin
  if not public.wtos_job_photo_storage_path_is_valid(object_name) then
    return false;
  end if;

  perform public.wtos_lock_job_photo_path(object_name);

  folder_parts := storage.foldername(object_name);
  path_company_id := folder_parts[1]::uuid;
  path_relation_kind := folder_parts[2];
  path_relation_id := folder_parts[3]::uuid;
  request_user_id := (select auth.uid());

  if request_user_id is null
    or not (
      public.wtos_can_manage_documents(path_company_id)
      or public.wtos_can_manage_production(path_company_id)
    )
    or not exists (
      select 1
      from public.job_photo_upload_operations as operation
      where operation.company_id = path_company_id
        and operation.file_path = object_name
        and operation.uploader_user_id = request_user_id
        and operation.state = 'reserved'
        and operation.recovery_lease_expires_at > pg_catalog.clock_timestamp()
    )
  then
    return false;
  end if;

  return case path_relation_kind
    when 'inspection' then exists (
      select 1
      from public.inspections as inspection
      where inspection.id = path_relation_id
        and inspection.company_id = path_company_id
    )
    when 'job' then exists (
      select 1
      from public.jobs as job
      where job.id = path_relation_id
        and job.company_id = path_company_id
    )
    when 'property' then exists (
      select 1
      from public.properties as property
      where property.id = path_relation_id
        and property.company_id = path_company_id
    )
    when 'customer' then exists (
      select 1
      from public.customers as customer
      where customer.id = path_relation_id
        and customer.company_id = path_company_id
    )
    when 'estimate' then exists (
      select 1
      from public.estimates as estimate
      where estimate.id = path_relation_id
        and estimate.company_id = path_company_id
    )
    when 'company' then path_relation_id = path_company_id
      and exists (
        select 1
        from public.companies as company
        where company.id = path_company_id
      )
    else false
  end;
exception
  when invalid_text_representation or array_subscript_error then
    return false;
end;
$$;

create or replace function public.wtos_can_rollback_job_photo_object(
  object_name text,
  object_owner_id text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  path_company_id uuid;
  request_user_id uuid;
begin
  perform public.wtos_lock_job_photo_path(object_name);

  if not public.wtos_job_photo_storage_path_is_valid(object_name) then
    return false;
  end if;

  request_user_id := (select auth.uid());
  path_company_id := public.wtos_storage_company_id(object_name);

  if request_user_id is null
    or path_company_id is null
    or object_owner_id is distinct from request_user_id::text
    or not exists (
      select 1
      from public.job_photo_upload_operations as operation
      where operation.company_id = path_company_id
        and operation.file_path = object_name
        and operation.uploader_user_id = request_user_id
        and operation.state = 'canceling'
    )
  then
    return false;
  end if;

  return not exists (
    select 1
    from public.job_photos as photo
    where photo.file_path = object_name
      and photo.company_id = path_company_id
  );
exception
  when invalid_text_representation or array_subscript_error then
    return false;
end;
$$;

create or replace function public.wtos_enforce_job_photo_upload_operation_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.state <> 'reserved'
      or new.canceling_at is not null
      or new.committed_at is not null
      or new.aborted_at is not null
    then
      raise exception using
        errcode = '23514',
        message = 'Job-photo upload operations must begin in the reserved state.';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.upload_operation_key is distinct from old.upload_operation_key
    or new.upload_request_fingerprint is distinct from old.upload_request_fingerprint
    or new.file_path is distinct from old.file_path
    or new.registration_digest is distinct from old.registration_digest
    or new.uploader_user_id is distinct from old.uploader_user_id
    or new.reserved_at is distinct from old.reserved_at
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '23514',
      message = 'Job-photo upload operation identity is immutable.';
  end if;

  if not (
    (
      old.state = 'reserved'
      and new.state = 'reserved'
      and new.canceling_at is not distinct from old.canceling_at
      and new.committed_at is not distinct from old.committed_at
      and new.aborted_at is not distinct from old.aborted_at
    )
    or (old.state = 'reserved' and new.state in ('canceling', 'committed'))
    or (
      old.state = 'canceling'
      and new.state = 'canceling'
      and new.canceling_at is not distinct from old.canceling_at
      and new.committed_at is not distinct from old.committed_at
      and new.aborted_at is not distinct from old.aborted_at
    )
    or (old.state = 'canceling' and new.state = 'aborted')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Invalid job-photo upload operation state transition.';
  end if;

  if (
    old.state = 'reserved'
    and new.state = 'committed'
  ) or (
    old.state = 'canceling'
    and new.state = 'aborted'
  ) then
    if new.recovery_lease_token is distinct from old.recovery_lease_token
      or new.recovery_lease_expires_at is distinct from old.recovery_lease_expires_at
    then
      raise exception using
        errcode = '23514',
        message = 'Terminal job-photo transitions cannot change recovery lease identity.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists job_photo_upload_operations_enforce_transition
on public.job_photo_upload_operations;
create trigger job_photo_upload_operations_enforce_transition
before insert or update on public.job_photo_upload_operations
for each row execute function public.wtos_enforce_job_photo_upload_operation_transition();

drop trigger if exists job_photo_upload_operations_set_updated_at
on public.job_photo_upload_operations;
create trigger job_photo_upload_operations_set_updated_at
before update on public.job_photo_upload_operations
for each row execute function public.set_updated_at();

create or replace function public.wtos_validate_job_photo_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  folder_parts text[];
  object_filename text;
  path_company_id uuid;
  path_relation_id uuid;
  path_relation_kind text;
  path_operation_key uuid;
  expected_relation_id uuid;
  expected_relation_kind text;
begin
  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id
      or new.file_path is distinct from old.file_path
      or new.upload_operation_key is distinct from old.upload_operation_key
      or new.upload_request_fingerprint is distinct from old.upload_request_fingerprint
    then
      raise exception using
        errcode = '23514',
        message = 'Job-photo company, path, operation key, and request fingerprint are immutable.';
    end if;
  end if;

  if not public.wtos_job_photo_storage_path_is_valid(new.file_path) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo path does not match the approved company/relation/operation contract.';
  end if;

  folder_parts := storage.foldername(new.file_path);
  object_filename := storage.filename(new.file_path);
  path_company_id := folder_parts[1]::uuid;
  path_relation_kind := folder_parts[2];
  path_relation_id := folder_parts[3]::uuid;
  path_operation_key := pg_catalog.substring(object_filename, 1, 36)::uuid;

  if path_company_id is distinct from new.company_id
    or path_operation_key is distinct from new.upload_operation_key
  then
    raise exception using
      errcode = '23514',
      message = 'Job-photo path company and operation key must match its metadata.';
  end if;

  if new.inspection_id is not null then
    expected_relation_kind := 'inspection';
    expected_relation_id := new.inspection_id;
  elsif new.job_id is not null then
    expected_relation_kind := 'job';
    expected_relation_id := new.job_id;
  elsif new.property_id is not null then
    expected_relation_kind := 'property';
    expected_relation_id := new.property_id;
  elsif new.customer_id is not null then
    expected_relation_kind := 'customer';
    expected_relation_id := new.customer_id;
  elsif new.estimate_id is not null then
    expected_relation_kind := 'estimate';
    expected_relation_id := new.estimate_id;
  else
    expected_relation_kind := 'company';
    expected_relation_id := new.company_id;
  end if;

  if path_relation_kind is distinct from expected_relation_kind
    or path_relation_id is distinct from expected_relation_id
  then
    raise exception using
      errcode = '23514',
      message = 'Job-photo path relation must match the highest-priority linked record.';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customers as customer
    where customer.id = new.customer_id
      and customer.company_id = new.company_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo customer must belong to the photo company.';
  end if;

  if new.property_id is not null and not exists (
    select 1
    from public.properties as property
    where property.id = new.property_id
      and property.company_id = new.company_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo property must belong to the photo company.';
  end if;

  if new.job_id is not null and not exists (
    select 1
    from public.jobs as job
    where job.id = new.job_id
      and job.company_id = new.company_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo job must belong to the photo company.';
  end if;

  if new.estimate_id is not null and not exists (
    select 1
    from public.estimates as estimate
    where estimate.id = new.estimate_id
      and estimate.company_id = new.company_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo estimate must belong to the photo company.';
  end if;

  if new.inspection_id is not null and not exists (
    select 1
    from public.inspections as inspection
    where inspection.id = new.inspection_id
      and inspection.company_id = new.company_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo inspection must belong to the photo company.';
  end if;

  if not exists (
    select 1
    from public.job_photo_upload_operations as operation
    where operation.company_id = new.company_id
      and operation.upload_operation_key = new.upload_operation_key
      and operation.upload_request_fingerprint = new.upload_request_fingerprint
      and operation.file_path = new.file_path
      and operation.registration_digest = public.wtos_job_photo_registration_digest(
        new.company_id,
        new.upload_operation_key,
        new.upload_request_fingerprint,
        new.file_path,
        new.customer_id,
        new.property_id,
        new.job_id,
        new.estimate_id,
        new.inspection_id,
        new.caption,
        new.label,
        new.taken_at,
        new.is_customer_visible,
        new.sort_order
      )
      and operation.state in ('reserved', 'committed')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo metadata requires its exact durable upload reservation.';
  end if;

  if not exists (
    select 1
    from storage.objects as object
    join public.job_photo_upload_operations as operation
      on operation.company_id = new.company_id
      and operation.upload_operation_key = new.upload_operation_key
      and operation.file_path = new.file_path
    where object.bucket_id = 'job-photos'
      and object.name = new.file_path
      and object.owner_id = operation.uploader_user_id::text
  ) then
    raise exception using
      errcode = '23503',
      message = 'Job-photo metadata requires its exact uploader-owned Storage object.';
  end if;

  return new;
end;
$$;

drop trigger if exists job_photos_validate_scope on public.job_photos;
create trigger job_photos_validate_scope
before insert or update on public.job_photos
for each row execute function public.wtos_validate_job_photo_scope();

create or replace function public.wtos_begin_job_photo_upload(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_upload_request_fingerprint text,
  target_file_path text,
  target_recovery_lease_token uuid,
  target_customer_id uuid default null,
  target_property_id uuid default null,
  target_job_id uuid default null,
  target_estimate_id uuid default null,
  target_inspection_id uuid default null,
  target_caption text default null,
  target_label text default null,
  target_taken_at date default null,
  target_is_customer_visible boolean default false,
  target_sort_order integer default 0,
  target_uploader_user_id uuid default null
)
returns public.job_photo_upload_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_digest text;
  request_uploader_user_id uuid;
  upload_operation public.job_photo_upload_operations%rowtype;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or target_upload_request_fingerprint is null
    or target_upload_request_fingerprint !~ '^[a-f0-9]{64}$'
    or not public.wtos_job_photo_storage_path_is_valid(target_file_path)
    or target_recovery_lease_token is null
  then
    raise exception using
      errcode = '22023',
      message = 'Job-photo upload reservation requires valid company, operation, fingerprint, and path values.';
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_recovery_uploader(
    target_uploader_user_id
  );
  perform public.wtos_lock_job_photo_path(target_file_path);
  request_digest := public.wtos_job_photo_registration_digest(
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    target_caption,
    target_label,
    target_taken_at,
    target_is_customer_visible,
    target_sort_order
  );

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is not null then
    if upload_operation.upload_request_fingerprint is distinct from target_upload_request_fingerprint
      or upload_operation.file_path is distinct from target_file_path
      or upload_operation.registration_digest is distinct from request_digest
      or upload_operation.uploader_user_id is distinct from request_uploader_user_id
    then
      raise exception using
        errcode = '23505',
        message = 'Job-photo upload operation key was already used for a different request.';
    end if;

    if upload_operation.state in ('reserved', 'canceling') then
      if upload_operation.recovery_lease_token is distinct from target_recovery_lease_token then
        raise exception using
          errcode = '55P03',
          message = 'Job-photo upload operation is active in another browser session.';
      end if;

      update public.job_photo_upload_operations as operation
      set recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'
      where operation.id = upload_operation.id
      returning operation.* into upload_operation;
    end if;

    return upload_operation;
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_uploader(
    target_company_id,
    target_uploader_user_id
  );

  if not public.wtos_job_photo_request_scope_is_valid(
    target_company_id,
    target_upload_operation_key,
    target_file_path,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo upload reservation does not match valid same-company records and path precedence.';
  end if;

  insert into public.job_photo_upload_operations (
    company_id,
    upload_operation_key,
    upload_request_fingerprint,
    file_path,
    registration_digest,
    uploader_user_id,
    recovery_lease_token,
    recovery_lease_expires_at,
    state
  )
  values (
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    request_digest,
    request_uploader_user_id,
    target_recovery_lease_token,
    pg_catalog.clock_timestamp() + interval '5 minutes',
    'reserved'
  )
  on conflict (company_id, upload_operation_key) do nothing
  returning * into upload_operation;

  if upload_operation.id is null then
    select operation.*
    into upload_operation
    from public.job_photo_upload_operations as operation
    where operation.company_id = target_company_id
      and operation.upload_operation_key = target_upload_operation_key
    for update;
  end if;

  if upload_operation.id is null then
    raise exception using
      errcode = '40001',
      message = 'Job-photo upload reservation did not converge; retry the same operation.';
  end if;

  if upload_operation.upload_request_fingerprint is distinct from target_upload_request_fingerprint
    or upload_operation.file_path is distinct from target_file_path
    or upload_operation.registration_digest is distinct from request_digest
    or upload_operation.uploader_user_id is distinct from request_uploader_user_id
  then
    raise exception using
      errcode = '23505',
      message = 'Job-photo upload operation key was already used for a different request.';
  end if;

  if upload_operation.state in ('reserved', 'canceling')
    and upload_operation.recovery_lease_token is distinct from target_recovery_lease_token
  then
    raise exception using
      errcode = '55P03',
      message = 'Job-photo upload operation is active in another browser session.';
  end if;

  if upload_operation.state in ('reserved', 'canceling') then
    update public.job_photo_upload_operations as operation
    set recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'
    where operation.id = upload_operation.id
    returning operation.* into upload_operation;
  end if;

  return upload_operation;
end;
$$;

create or replace function public.wtos_cancel_job_photo_upload(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_upload_request_fingerprint text,
  target_file_path text,
  target_recovery_lease_token uuid,
  target_customer_id uuid default null,
  target_property_id uuid default null,
  target_job_id uuid default null,
  target_estimate_id uuid default null,
  target_inspection_id uuid default null,
  target_caption text default null,
  target_label text default null,
  target_taken_at date default null,
  target_is_customer_visible boolean default false,
  target_sort_order integer default 0,
  target_uploader_user_id uuid default null
)
returns public.job_photo_upload_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_digest text;
  request_uploader_user_id uuid;
  upload_operation public.job_photo_upload_operations%rowtype;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or target_upload_request_fingerprint is null
    or target_upload_request_fingerprint !~ '^[a-f0-9]{64}$'
    or not public.wtos_job_photo_storage_path_is_valid(target_file_path)
    or target_recovery_lease_token is null
  then
    raise exception using
      errcode = '22023',
      message = 'Job-photo upload cancellation requires valid company, operation, fingerprint, and path values.';
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_recovery_uploader(
    target_uploader_user_id
  );
  perform public.wtos_lock_job_photo_path(target_file_path);
  request_digest := public.wtos_job_photo_registration_digest(
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    target_caption,
    target_label,
    target_taken_at,
    target_is_customer_visible,
    target_sort_order
  );

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is null then
    raise exception using
      errcode = '23503',
      message = 'Job-photo upload cancellation requires an existing reservation.';
  end if;

  if upload_operation.upload_request_fingerprint is distinct from target_upload_request_fingerprint
    or upload_operation.file_path is distinct from target_file_path
    or upload_operation.registration_digest is distinct from request_digest
    or upload_operation.uploader_user_id is distinct from request_uploader_user_id
  then
    raise exception using
      errcode = '23505',
      message = 'Job-photo upload cancellation does not match the reserved request.';
  end if;

  if upload_operation.state in ('committed', 'aborted') then
    return upload_operation;
  end if;

  if upload_operation.recovery_lease_token is distinct from target_recovery_lease_token then
    raise exception using
      errcode = '55P03',
      message = 'Job-photo upload operation is active in another browser session.';
  end if;

  if upload_operation.state = 'reserved' then
    update public.job_photo_upload_operations as operation
    set
      state = 'canceling',
      canceling_at = pg_catalog.clock_timestamp(),
      recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'
    where operation.id = upload_operation.id
    returning operation.* into upload_operation;
  elsif upload_operation.state = 'canceling' then
    update public.job_photo_upload_operations as operation
    set recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'
    where operation.id = upload_operation.id
    returning operation.* into upload_operation;
  end if;

  return upload_operation;
end;
$$;

create or replace function public.wtos_confirm_job_photo_upload_abort(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_upload_request_fingerprint text,
  target_file_path text,
  target_recovery_lease_token uuid,
  target_customer_id uuid default null,
  target_property_id uuid default null,
  target_job_id uuid default null,
  target_estimate_id uuid default null,
  target_inspection_id uuid default null,
  target_caption text default null,
  target_label text default null,
  target_taken_at date default null,
  target_is_customer_visible boolean default false,
  target_sort_order integer default 0,
  target_uploader_user_id uuid default null
)
returns public.job_photo_upload_operations
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_digest text;
  request_uploader_user_id uuid;
  upload_operation public.job_photo_upload_operations%rowtype;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or target_upload_request_fingerprint is null
    or target_upload_request_fingerprint !~ '^[a-f0-9]{64}$'
    or not public.wtos_job_photo_storage_path_is_valid(target_file_path)
    or target_recovery_lease_token is null
  then
    raise exception using
      errcode = '22023',
      message = 'Job-photo upload abort confirmation requires valid company, operation, fingerprint, and path values.';
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_recovery_uploader(
    target_uploader_user_id
  );
  perform public.wtos_lock_job_photo_path(target_file_path);
  request_digest := public.wtos_job_photo_registration_digest(
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    target_caption,
    target_label,
    target_taken_at,
    target_is_customer_visible,
    target_sort_order
  );

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is null then
    raise exception using
      errcode = '23503',
      message = 'Job-photo upload abort confirmation requires an existing reservation.';
  end if;

  if upload_operation.upload_request_fingerprint is distinct from target_upload_request_fingerprint
    or upload_operation.file_path is distinct from target_file_path
    or upload_operation.registration_digest is distinct from request_digest
    or upload_operation.uploader_user_id is distinct from request_uploader_user_id
  then
    raise exception using
      errcode = '23505',
      message = 'Job-photo upload abort confirmation does not match the reserved request.';
  end if;

  if upload_operation.state in ('committed', 'aborted') then
    return upload_operation;
  end if;

  if upload_operation.recovery_lease_token is distinct from target_recovery_lease_token then
    raise exception using
      errcode = '55P03',
      message = 'Job-photo upload operation is active in another browser session.';
  end if;

  if upload_operation.state <> 'canceling' then
    raise exception using
      errcode = '23514',
      message = 'Job-photo upload must enter canceling before abort can be confirmed.';
  end if;

  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'job-photos'
      and object.name = target_file_path
  ) or exists (
    select 1
    from public.job_photos as photo
    where photo.company_id = target_company_id
      and photo.upload_operation_key = target_upload_operation_key
  ) then
    raise exception using
      errcode = '40001',
      message = 'Job-photo upload residue remains; remove the exact unregistered object and retry confirmation.';
  end if;

  update public.job_photo_upload_operations as operation
  set
    state = 'aborted',
    aborted_at = pg_catalog.clock_timestamp()
  where operation.id = upload_operation.id
  returning operation.* into upload_operation;

  return upload_operation;
end;
$$;

create or replace function public.wtos_list_my_job_photo_upload_recoveries(
  target_uploader_user_id uuid default null
)
returns table (
  uploader_user_id uuid,
  company_id uuid,
  upload_operation_key uuid,
  state text,
  lease_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_uploader_user_id uuid;
begin
  request_uploader_user_id := public.wtos_resolve_job_photo_recovery_uploader(
    target_uploader_user_id
  );

  return query
  select
    operation.uploader_user_id,
    operation.company_id,
    operation.upload_operation_key,
    operation.state,
    operation.recovery_lease_expires_at
  from public.job_photo_upload_operations as operation
  where operation.uploader_user_id = request_uploader_user_id
    and operation.state in ('reserved', 'canceling')
  order by operation.created_at, operation.id;
end;
$$;

create or replace function public.wtos_claim_job_photo_upload_recovery(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_recovery_lease_token uuid,
  target_uploader_user_id uuid default null
)
returns table (
  state text,
  file_path text,
  lease_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_uploader_user_id uuid;
  locked_file_path text;
  upload_operation public.job_photo_upload_operations%rowtype;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or target_recovery_lease_token is null
  then
    raise exception using
      errcode = '22023',
      message = 'Job-photo recovery claim requires company, operation, and lease-token values.';
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_recovery_uploader(
    target_uploader_user_id
  );

  select operation.file_path
  into locked_file_path
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
    and operation.uploader_user_id = request_uploader_user_id;

  if locked_file_path is null then
    raise exception using
      errcode = '23503',
      message = 'Job-photo recovery claim requires an existing upload operation.';
  end if;

  perform public.wtos_lock_job_photo_path(locked_file_path);

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is null then
    raise exception using
      errcode = '40001',
      message = 'Job-photo recovery claim did not converge; retry the same operation.';
  end if;

  if upload_operation.uploader_user_id is distinct from request_uploader_user_id then
    raise exception using
      errcode = '42501',
      message = 'Only the original job-photo uploader may claim recovery.';
  end if;

  if upload_operation.state in ('committed', 'aborted') then
    return query select
      upload_operation.state,
      null::text,
      upload_operation.recovery_lease_expires_at;
    return;
  end if;

  if upload_operation.state not in ('reserved', 'canceling') then
    raise exception using
      errcode = '23514',
      message = 'Job-photo upload operation is not recoverable.';
  end if;

  if upload_operation.recovery_lease_token is distinct from target_recovery_lease_token
    and upload_operation.recovery_lease_expires_at > pg_catalog.clock_timestamp()
  then
    raise exception using
      errcode = '55P03',
      message = 'Job-photo upload operation is active in another browser session.';
  end if;

  update public.job_photo_upload_operations as operation
  set
    state = 'canceling',
    canceling_at = case
      when upload_operation.state = 'reserved'
        then pg_catalog.clock_timestamp()
      else upload_operation.canceling_at
    end,
    recovery_lease_token = target_recovery_lease_token,
    recovery_lease_expires_at = pg_catalog.clock_timestamp() + interval '5 minutes'
  where operation.id = upload_operation.id
  returning operation.* into upload_operation;

  return query select
    upload_operation.state,
    upload_operation.file_path,
    upload_operation.recovery_lease_expires_at;
end;
$$;

create or replace function public.wtos_confirm_job_photo_upload_recovery_abort(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_recovery_lease_token uuid,
  target_uploader_user_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_uploader_user_id uuid;
  locked_file_path text;
  upload_operation public.job_photo_upload_operations%rowtype;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or target_recovery_lease_token is null
  then
    raise exception using
      errcode = '22023',
      message = 'Job-photo recovery abort confirmation requires company, operation, and lease-token values.';
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_recovery_uploader(
    target_uploader_user_id
  );

  select operation.file_path
  into locked_file_path
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
    and operation.uploader_user_id = request_uploader_user_id;

  if locked_file_path is null then
    raise exception using
      errcode = '23503',
      message = 'Job-photo recovery abort confirmation requires an existing upload operation.';
  end if;

  perform public.wtos_lock_job_photo_path(locked_file_path);

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is null then
    raise exception using
      errcode = '40001',
      message = 'Job-photo recovery abort confirmation did not converge; retry the same operation.';
  end if;

  if upload_operation.uploader_user_id is distinct from request_uploader_user_id then
    raise exception using
      errcode = '42501',
      message = 'Only the original job-photo uploader may confirm recovery.';
  end if;

  if upload_operation.state in ('committed', 'aborted') then
    return upload_operation.state;
  end if;

  if upload_operation.recovery_lease_token is distinct from target_recovery_lease_token then
    raise exception using
      errcode = '55P03',
      message = 'Job-photo upload operation is active in another browser session.';
  end if;

  if upload_operation.state <> 'canceling' then
    raise exception using
      errcode = '23514',
      message = 'Job-photo recovery must be claimed before abort can be confirmed.';
  end if;

  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'job-photos'
      and object.name = upload_operation.file_path
  ) or exists (
    select 1
    from public.job_photos as photo
    where photo.company_id = upload_operation.company_id
      and photo.upload_operation_key = upload_operation.upload_operation_key
  ) then
    raise exception using
      errcode = '40001',
      message = 'Job-photo upload residue remains; remove the exact unregistered object and retry confirmation.';
  end if;

  update public.job_photo_upload_operations as operation
  set
    state = 'aborted',
    aborted_at = pg_catalog.clock_timestamp()
  where operation.id = upload_operation.id
  returning operation.* into upload_operation;

  return upload_operation.state;
end;
$$;

create or replace function public.wtos_expire_job_photo_upload_recovery_lease(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_uploader_user_id uuid
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  locked_file_path text;
  expired_lease_at timestamptz;
  upload_operation public.job_photo_upload_operations%rowtype;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using
      errcode = '42501',
      message = 'Only the service role may expire a job-photo recovery lease.';
  end if;

  if target_company_id is null
    or target_upload_operation_key is null
    or target_uploader_user_id is null
  then
    raise exception using
      errcode = '22023',
      message = 'Lease expiry requires exact company, operation, and uploader values.';
  end if;

  select operation.file_path
  into locked_file_path
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
    and operation.uploader_user_id = target_uploader_user_id;

  if locked_file_path is null then
    raise exception using
      errcode = '23503',
      message = 'Lease expiry requires an existing job-photo upload operation.';
  end if;

  perform public.wtos_lock_job_photo_path(locked_file_path);

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is null then
    raise exception using
      errcode = '40001',
      message = 'Lease expiry did not converge; retry the same exact operation.';
  end if;

  if upload_operation.uploader_user_id is distinct from target_uploader_user_id then
    raise exception using
      errcode = '42501',
      message = 'Lease expiry uploader does not match the immutable reservation uploader.';
  end if;

  if upload_operation.state not in ('reserved', 'canceling') then
    raise exception using
      errcode = '23514',
      message = 'Only nonterminal job-photo recovery leases can be expired.';
  end if;

  update public.job_photo_upload_operations as operation
  set recovery_lease_expires_at = pg_catalog.clock_timestamp()
  where operation.id = upload_operation.id
  returning operation.recovery_lease_expires_at
  into expired_lease_at;

  return expired_lease_at;
end;
$$;

create or replace function public.wtos_register_job_photo(
  target_company_id uuid,
  target_upload_operation_key uuid,
  target_upload_request_fingerprint text,
  target_file_path text,
  target_recovery_lease_token uuid,
  target_customer_id uuid default null,
  target_property_id uuid default null,
  target_job_id uuid default null,
  target_estimate_id uuid default null,
  target_inspection_id uuid default null,
  target_caption text default null,
  target_label text default null,
  target_taken_at date default null,
  target_is_customer_visible boolean default false,
  target_sort_order integer default 0,
  target_uploader_user_id uuid default null
)
returns public.job_photos
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_digest text;
  request_uploader_user_id uuid;
  upload_operation public.job_photo_upload_operations%rowtype;
  registered_photo public.job_photos%rowtype;
begin
  if target_company_id is null
    or target_upload_operation_key is null
    or target_upload_request_fingerprint is null
    or target_upload_request_fingerprint !~ '^[a-f0-9]{64}$'
    or not public.wtos_job_photo_storage_path_is_valid(target_file_path)
    or target_recovery_lease_token is null
  then
    raise exception using
      errcode = '22023',
      message = 'Job-photo registration requires valid company, operation, fingerprint, and path values.';
  end if;

  request_uploader_user_id := public.wtos_resolve_job_photo_uploader(
    target_company_id,
    target_uploader_user_id
  );
  perform public.wtos_lock_job_photo_path(target_file_path);
  request_digest := public.wtos_job_photo_registration_digest(
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    target_caption,
    target_label,
    target_taken_at,
    target_is_customer_visible,
    target_sort_order
  );

  select operation.*
  into upload_operation
  from public.job_photo_upload_operations as operation
  where operation.company_id = target_company_id
    and operation.upload_operation_key = target_upload_operation_key
  for update;

  if upload_operation.id is null then
    raise exception using
      errcode = '23503',
      message = 'Job-photo registration requires an existing upload reservation.';
  end if;

  if upload_operation.upload_request_fingerprint is distinct from target_upload_request_fingerprint
    or upload_operation.file_path is distinct from target_file_path
    or upload_operation.registration_digest is distinct from request_digest
    or upload_operation.uploader_user_id is distinct from request_uploader_user_id
  then
    raise exception using
      errcode = '23505',
      message = 'Job-photo registration does not match the reserved request.';
  end if;

  if upload_operation.state = 'committed' then
    select photo.*
    into registered_photo
    from public.job_photos as photo
    where photo.company_id = target_company_id
      and photo.upload_operation_key = target_upload_operation_key;

    if registered_photo.id is null
      or registered_photo.upload_request_fingerprint is distinct from target_upload_request_fingerprint
      or registered_photo.file_path is distinct from target_file_path
      or registered_photo.customer_id is distinct from target_customer_id
      or registered_photo.property_id is distinct from target_property_id
      or registered_photo.job_id is distinct from target_job_id
      or registered_photo.estimate_id is distinct from target_estimate_id
      or registered_photo.inspection_id is distinct from target_inspection_id
      or registered_photo.caption is distinct from nullif(pg_catalog.btrim(target_caption), '')
      or registered_photo.label is distinct from nullif(pg_catalog.btrim(target_label), '')
      or registered_photo.taken_at is distinct from target_taken_at
      or registered_photo.is_customer_visible is distinct from coalesce(target_is_customer_visible, false)
      or registered_photo.sort_order is distinct from coalesce(target_sort_order, 0)
    then
      raise exception using
        errcode = '23514',
        message = 'Committed job-photo reservation is missing its exact metadata.';
    end if;

    return registered_photo;
  end if;

  if not public.wtos_job_photo_request_scope_is_valid(
    target_company_id,
    target_upload_operation_key,
    target_file_path,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'Job-photo registration does not match valid same-company records and path precedence.';
  end if;

  if upload_operation.state <> 'reserved' then
    raise exception using
      errcode = '23514',
      message = 'Canceled or aborted job-photo uploads cannot be registered.';
  end if;

  if upload_operation.recovery_lease_token is distinct from target_recovery_lease_token then
    raise exception using
      errcode = '55P03',
      message = 'Job-photo upload operation is active in another browser session.';
  end if;

  insert into public.job_photos (
    company_id,
    customer_id,
    property_id,
    job_id,
    estimate_id,
    inspection_id,
    caption,
    label,
    file_path,
    file_url,
    taken_at,
    is_customer_visible,
    sort_order,
    upload_operation_key,
    upload_request_fingerprint
  )
  values (
    target_company_id,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    nullif(pg_catalog.btrim(target_caption), ''),
    nullif(pg_catalog.btrim(target_label), ''),
    target_file_path,
    null,
    target_taken_at,
    coalesce(target_is_customer_visible, false),
    coalesce(target_sort_order, 0),
    target_upload_operation_key,
    target_upload_request_fingerprint
  )
  returning * into registered_photo;

  update public.job_photo_upload_operations as operation
  set
    state = 'committed',
    committed_at = pg_catalog.clock_timestamp()
  where operation.id = upload_operation.id;

  return registered_photo;
end;
$$;

alter table public.job_photos enable row level security;
alter table public.job_photo_upload_operations enable row level security;

revoke all on table public.job_photos
from public, anon, authenticated, service_role;

grant select on table public.job_photos
to authenticated, service_role;

grant delete on table public.job_photos
to service_role;

revoke all on table public.job_photo_upload_operations
from public, anon, authenticated, service_role;

grant select, delete on table public.job_photo_upload_operations
to service_role;

drop policy if exists "WTOS users read job photos" on public.job_photos;
drop policy if exists "WTOS users insert job photos" on public.job_photos;
drop policy if exists "WTOS users update job photos" on public.job_photos;

create policy "WTOS users read job photos"
on public.job_photos for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS users read own job photo upload operations"
on public.job_photo_upload_operations;
create policy "WTOS users read own job photo upload operations"
on public.job_photo_upload_operations for select to authenticated
using (
  uploader_user_id = (select auth.uid())
  and public.wtos_can_read_company(company_id)
);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'job-photos',
  'job-photos',
  false,
  26214400,
  array['image/*']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users read job photos" on storage.objects;
drop policy if exists "Authenticated users upload job photos" on storage.objects;
drop policy if exists "Authenticated users update job photos" on storage.objects;
drop policy if exists "WTOS users read company job photos" on storage.objects;
drop policy if exists "WTOS users upload company job photos" on storage.objects;
drop policy if exists "WTOS users update company job photos" on storage.objects;
drop policy if exists "WTOS users rollback own job photo uploads" on storage.objects;

create policy "WTOS users read company job photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'job-photos'
  and public.wtos_job_photo_storage_path_is_valid(name)
  and public.wtos_can_read_company(public.wtos_storage_company_id(name))
  and exists (
    select 1
    from public.job_photos as photo
    where photo.file_path = storage.objects.name
      and photo.company_id = public.wtos_storage_company_id(storage.objects.name)
  )
);

create policy "WTOS users upload company job photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'job-photos'
  and public.wtos_can_upload_job_photo_object(name)
);

create policy "WTOS users rollback own job photo uploads"
on storage.objects for delete to authenticated
using (
  bucket_id = 'job-photos'
  and public.wtos_can_rollback_job_photo_object(name, owner_id)
);

revoke all on function public.wtos_job_photo_storage_path_is_valid(text)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_job_photo_storage_path_is_valid(text)
to authenticated;

revoke all on function public.wtos_lock_job_photo_path(text)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_job_photo_registration_digest(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer
)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_job_photo_request_scope_is_valid(
  uuid,
  uuid,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_resolve_job_photo_uploader(uuid, uuid)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_resolve_job_photo_recovery_uploader(uuid)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_can_upload_job_photo_object(text)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_can_upload_job_photo_object(text)
to authenticated;

revoke all on function public.wtos_can_rollback_job_photo_object(text, text)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_can_rollback_job_photo_object(text, text)
to authenticated;

revoke all on function public.wtos_enforce_job_photo_upload_operation_transition()
from public, anon, authenticated, service_role;

revoke all on function public.wtos_validate_job_photo_scope()
from public, anon, authenticated, service_role;

revoke all on function public.wtos_begin_job_photo_upload(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_begin_job_photo_upload(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
to authenticated, service_role;

revoke all on function public.wtos_cancel_job_photo_upload(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_cancel_job_photo_upload(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
to authenticated, service_role;

revoke all on function public.wtos_confirm_job_photo_upload_abort(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_confirm_job_photo_upload_abort(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
to authenticated, service_role;

revoke all on function public.wtos_list_my_job_photo_upload_recoveries(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_list_my_job_photo_upload_recoveries(uuid)
to authenticated, service_role;

revoke all on function public.wtos_claim_job_photo_upload_recovery(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_claim_job_photo_upload_recovery(
  uuid,
  uuid,
  uuid,
  uuid
)
to authenticated, service_role;

revoke all on function public.wtos_confirm_job_photo_upload_recovery_abort(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_confirm_job_photo_upload_recovery_abort(
  uuid,
  uuid,
  uuid,
  uuid
)
to authenticated, service_role;

revoke all on function public.wtos_expire_job_photo_upload_recovery_lease(
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_expire_job_photo_upload_recovery_lease(
  uuid,
  uuid,
  uuid
)
to service_role;

revoke all on function public.wtos_register_job_photo(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_register_job_photo(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  date,
  boolean,
  integer,
  uuid
)
to authenticated, service_role;

commit;
