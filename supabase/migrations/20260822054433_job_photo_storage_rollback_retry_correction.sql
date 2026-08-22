begin;

-- Supabase Storage authorizes object deletion through both DELETE and SELECT
-- policies. Keep the existing exact-object rollback helper as the sole scope
-- predicate, and expose that SELECT path only while Storage is executing one
-- of its two delete operations. Ordinary list, read, download, and transform
-- operations do not satisfy this policy.
drop policy if exists "WTOS users select own rollback job photo deletes"
on storage.objects;

create policy "WTOS users select own rollback job photo deletes"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'job-photos'
  and storage.allow_any_operation(
    array[
      'storage.object.delete',
      'storage.object.delete_many'
    ]
  )
  and public.wtos_can_rollback_job_photo_object(name, owner_id)
);

-- PostgREST retries SQLSTATE 40001 because it denotes a database serialization
-- failure. The immutable Phase 1 migration also used 40001 for six exact,
-- deterministic upload/recovery outcomes. Preserve those implementations
-- under private names, then expose wrappers that translate only the known
-- application-authored messages. Genuine database/coordinator serialization
-- failures are re-raised unchanged.
alter function public.wtos_begin_job_photo_upload(
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
rename to wtos_begin_job_photo_upload_phase1_base;

alter function public.wtos_confirm_job_photo_upload_abort(
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
rename to wtos_confirm_job_photo_upload_abort_phase1_base;

alter function public.wtos_claim_job_photo_upload_recovery(
  uuid,
  uuid,
  uuid,
  uuid
)
rename to wtos_claim_job_photo_upload_recovery_phase1_base;

alter function public.wtos_confirm_job_photo_upload_recovery_abort(
  uuid,
  uuid,
  uuid,
  uuid
)
rename to wtos_confirm_job_photo_upload_recovery_abort_phase1_base;

alter function public.wtos_expire_job_photo_upload_recovery_lease(
  uuid,
  uuid,
  uuid
)
rename to wtos_expire_job_photo_upload_recovery_lease_phase1_base;

revoke all on function public.wtos_begin_job_photo_upload_phase1_base(
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

revoke all on function public.wtos_confirm_job_photo_upload_abort_phase1_base(
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

revoke all on function public.wtos_claim_job_photo_upload_recovery_phase1_base(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_confirm_job_photo_upload_recovery_abort_phase1_base(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_expire_job_photo_upload_recovery_lease_phase1_base(
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

create function public.wtos_begin_job_photo_upload(
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
begin
  return public.wtos_begin_job_photo_upload_phase1_base(
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    target_recovery_lease_token,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    target_caption,
    target_label,
    target_taken_at,
    target_is_customer_visible,
    target_sort_order,
    target_uploader_user_id
  );
exception
  when serialization_failure then
    if sqlerrm in (
      'Job-photo upload reservation did not converge; retry the same operation.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_confirm_job_photo_upload_abort(
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
begin
  return public.wtos_confirm_job_photo_upload_abort_phase1_base(
    target_company_id,
    target_upload_operation_key,
    target_upload_request_fingerprint,
    target_file_path,
    target_recovery_lease_token,
    target_customer_id,
    target_property_id,
    target_job_id,
    target_estimate_id,
    target_inspection_id,
    target_caption,
    target_label,
    target_taken_at,
    target_is_customer_visible,
    target_sort_order,
    target_uploader_user_id
  );
exception
  when serialization_failure then
    if sqlerrm in (
      'Job-photo upload residue remains; remove the exact unregistered object and retry confirmation.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_claim_job_photo_upload_recovery(
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
begin
  return query
  select
    recovery.state,
    recovery.file_path,
    recovery.lease_expires_at
  from public.wtos_claim_job_photo_upload_recovery_phase1_base(
    target_company_id,
    target_upload_operation_key,
    target_recovery_lease_token,
    target_uploader_user_id
  ) as recovery;
exception
  when serialization_failure then
    if sqlerrm in (
      'Job-photo recovery claim did not converge; retry the same operation.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_confirm_job_photo_upload_recovery_abort(
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
begin
  return public.wtos_confirm_job_photo_upload_recovery_abort_phase1_base(
    target_company_id,
    target_upload_operation_key,
    target_recovery_lease_token,
    target_uploader_user_id
  );
exception
  when serialization_failure then
    if sqlerrm in (
      'Job-photo recovery abort confirmation did not converge; retry the same operation.',
      'Job-photo upload residue remains; remove the exact unregistered object and retry confirmation.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_expire_job_photo_upload_recovery_lease(
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
begin
  return public.wtos_expire_job_photo_upload_recovery_lease_phase1_base(
    target_company_id,
    target_upload_operation_key,
    target_uploader_user_id
  );
exception
  when serialization_failure then
    if sqlerrm in (
      'Lease expiry did not converge; retry the same exact operation.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

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

revoke all on function public.wtos_claim_job_photo_upload_recovery(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_confirm_job_photo_upload_recovery_abort(
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_expire_job_photo_upload_recovery_lease(
  uuid,
  uuid,
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

grant execute on function public.wtos_claim_job_photo_upload_recovery(
  uuid,
  uuid,
  uuid,
  uuid
)
to authenticated, service_role;

grant execute on function public.wtos_confirm_job_photo_upload_recovery_abort(
  uuid,
  uuid,
  uuid,
  uuid
)
to authenticated, service_role;

grant execute on function public.wtos_expire_job_photo_upload_recovery_lease(
  uuid,
  uuid,
  uuid
)
to service_role;

commit;
