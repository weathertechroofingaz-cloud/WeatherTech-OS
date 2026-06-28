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
    'completion_certificate',
    'warranty',
    'photo',
    'other'
  )
);

alter table public.documents
add column if not exists status text not null default 'draft';

alter table public.documents
drop constraint if exists documents_status_check;

alter table public.documents
add constraint documents_status_check
check (status in ('draft', 'ready', 'sent', 'signed', 'archived'));

alter table public.documents
add column if not exists template_key text;

create index if not exists documents_status_idx on public.documents(status);
create index if not exists documents_job_id_idx on public.documents(job_id);
create index if not exists documents_template_key_idx on public.documents(template_key);
