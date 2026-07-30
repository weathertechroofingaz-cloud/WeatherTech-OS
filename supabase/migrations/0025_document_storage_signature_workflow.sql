begin;

alter table public.documents
add column if not exists lead_id uuid,
add column if not exists inspection_id uuid,
add column if not exists file_name text,
add column if not exists file_size_bytes bigint,
add column if not exists mime_type text,
add column if not exists storage_bucket text,
add column if not exists storage_path text,
add column if not exists uploaded_by uuid,
add column if not exists uploaded_at timestamptz,
add column if not exists archived_at timestamptz,
add column if not exists property_address text,
add column if not exists tags text[],
add column if not exists requirement_level text,
add column if not exists required_for text[];

update public.documents
set
  tags = coalesce(tags, '{}'),
  requirement_level = coalesce(nullif(requirement_level, ''), 'optional'),
  required_for = coalesce(required_for, '{}'),
  uploaded_at = coalesce(uploaded_at, created_at),
  file_name = coalesce(
    nullif(file_name, ''),
    case
      when file_url is not null and file_url <> '' then reverse(split_part(reverse(file_url), '/', 1))
      else null
    end
  ),
  property_address = coalesce(
    nullif(property_address, ''),
    (
      select customer.property_address
      from public.customers as customer
      where customer.id = documents.customer_id
      limit 1
    ),
    (
      select job.property_address
      from public.jobs as job
      where job.id = documents.job_id
      limit 1
    ),
    (
      select estimate.location
      from public.estimates as estimate
      where estimate.id = documents.estimate_id
      limit 1
    )
  )
where tags is null
  or requirement_level is null
  or requirement_level = ''
  or required_for is null
  or uploaded_at is null
  or file_name is null
  or file_name = ''
  or property_address is null
  or property_address = '';

alter table public.documents
alter column tags set default '{}',
alter column tags set not null,
alter column requirement_level set default 'optional',
alter column requirement_level set not null,
alter column required_for set default '{}',
alter column required_for set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_lead_id_fkey'
  ) then
    alter table public.documents
    add constraint documents_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_inspection_id_fkey'
  ) then
    alter table public.documents
    add constraint documents_inspection_id_fkey
    foreign key (inspection_id) references public.inspections(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_uploaded_by_fkey'
  ) then
    alter table public.documents
    add constraint documents_uploaded_by_fkey
    foreign key (uploaded_by) references auth.users(id) on delete set null
    not valid;
  end if;
end $$;

alter table public.documents validate constraint documents_lead_id_fkey;
alter table public.documents validate constraint documents_inspection_id_fkey;
alter table public.documents validate constraint documents_uploaded_by_fkey;

alter table public.documents
drop constraint if exists documents_category_check;

alter table public.documents
add constraint documents_category_check
check (
  category in (
    'estimate',
    'scope',
    'invoice',
    'change_order',
    'contract',
    'signed_agreement',
    'completion_certificate',
    'warranty',
    'insurance',
    'permit',
    'material_order',
    'manufacturer_warranty',
    'workmanship_warranty',
    'inspection_report',
    'photo',
    'photo_set',
    'other'
  )
) not valid;

alter table public.documents validate constraint documents_category_check;

alter table public.documents
drop constraint if exists documents_requirement_level_check;

alter table public.documents
add constraint documents_requirement_level_check
check (requirement_level in ('required', 'optional')) not valid;

alter table public.documents validate constraint documents_requirement_level_check;

alter table public.documents
drop constraint if exists documents_file_size_bytes_check;

alter table public.documents
add constraint documents_file_size_bytes_check
check (file_size_bytes is null or file_size_bytes >= 0) not valid;

alter table public.documents validate constraint documents_file_size_bytes_check;

alter table public.documents
drop constraint if exists documents_storage_bucket_check;

alter table public.documents
add constraint documents_storage_bucket_check
check (storage_bucket is null or storage_bucket = 'customer-documents') not valid;

alter table public.documents validate constraint documents_storage_bucket_check;

alter table public.signatures
add column if not exists provider text,
add column if not exists provider_envelope_id text,
add column if not exists sent_at timestamptz,
add column if not exists viewed_at timestamptz,
add column if not exists declined_at timestamptz,
add column if not exists expires_at timestamptz;

update public.signatures
set provider = coalesce(nullif(provider, ''), 'native')
where provider is null or provider = '';

alter table public.signatures
alter column provider set default 'native';

alter table public.signatures
drop constraint if exists signatures_status_check;

alter table public.signatures
add constraint signatures_status_check
check (status in ('pending', 'sent', 'viewed', 'signed', 'declined', 'expired')) not valid;

alter table public.signatures validate constraint signatures_status_check;

alter table public.signatures
drop constraint if exists signatures_provider_check;

alter table public.signatures
add constraint signatures_provider_check
check (provider is null or provider in ('native', 'docusign', 'dropbox_sign')) not valid;

alter table public.signatures validate constraint signatures_provider_check;

create index if not exists documents_lead_id_idx on public.documents(lead_id);
create index if not exists documents_inspection_id_idx on public.documents(inspection_id);
create index if not exists documents_category_status_idx on public.documents(category, status);
create index if not exists documents_uploaded_at_idx on public.documents(uploaded_at);
create index if not exists documents_requirement_level_idx on public.documents(requirement_level);
create index if not exists documents_storage_path_idx on public.documents(storage_path);
create index if not exists signatures_status_idx on public.signatures(status);
create index if not exists signatures_provider_idx on public.signatures(provider);

insert into storage.buckets (id, name, public)
values ('customer-documents', 'customer-documents', false)
on conflict (id) do update set public = false;

create or replace function public.wtos_storage_company_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public, storage
as $$
declare
  folder_parts text[];
begin
  folder_parts := storage.foldername(object_name);
  return nullif(folder_parts[1], '')::uuid;
exception
  when invalid_text_representation or array_subscript_error then
    return null;
end;
$$;

drop policy if exists "WTOS users read customer documents" on storage.objects;
create policy "WTOS users read customer documents"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-documents'
  and public.wtos_can_read_company(public.wtos_storage_company_id(name))
);

drop policy if exists "WTOS users upload customer documents" on storage.objects;
create policy "WTOS users upload customer documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-documents'
  and public.wtos_can_manage_documents(public.wtos_storage_company_id(name))
);

drop policy if exists "WTOS users update customer documents" on storage.objects;
create policy "WTOS users update customer documents"
on storage.objects for update to authenticated
using (
  bucket_id = 'customer-documents'
  and public.wtos_can_manage_documents(public.wtos_storage_company_id(name))
)
with check (
  bucket_id = 'customer-documents'
  and public.wtos_can_manage_documents(public.wtos_storage_company_id(name))
);

commit;
