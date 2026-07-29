begin;

alter table public.inspections
alter column job_id drop not null,
add column if not exists customer_id uuid,
add column if not exists lead_id uuid,
add column if not exists schedule_event_id uuid,
add column if not exists estimate_id uuid,
add column if not exists report_document_id uuid,
add column if not exists inspection_type text,
add column if not exists service_category text,
add column if not exists scheduled_start timestamptz,
add column if not exists scheduled_end timestamptz,
add column if not exists assigned_inspector text,
add column if not exists property_address text,
add column if not exists priority text,
add column if not exists purpose text,
add column if not exists internal_notes text,
add column if not exists outcome text,
add column if not exists report_requested boolean,
add column if not exists report_created_at timestamptz,
add column if not exists findings jsonb,
add column if not exists measurements jsonb,
add column if not exists photo_ids uuid[],
add column if not exists activity jsonb;

update public.inspections
set
  inspection_type = coalesce(nullif(inspection_type, ''), 'site_inspection'),
  service_category = coalesce(nullif(service_category, ''), 'roofing'),
  priority = coalesce(nullif(priority, ''), 'normal'),
  internal_notes = coalesce(internal_notes, notes),
  report_requested = coalesce(report_requested, false),
  photo_ids = coalesce(photo_ids, '{}'),
  activity = case
    when activity is not null and jsonb_typeof(activity) = 'array' then activity
    else '[]'::jsonb
  end,
  findings = case
    when findings is not null and jsonb_typeof(findings) = 'array' then findings
    else '[]'::jsonb
  end,
  measurements = case
    when measurements is not null and jsonb_typeof(measurements) = 'array' then measurements
    else '[]'::jsonb
  end
where inspection_type is null
  or inspection_type = ''
  or service_category is null
  or service_category = ''
  or priority is null
  or priority = ''
  or internal_notes is null
  or report_requested is null
  or photo_ids is null
  or activity is null
  or jsonb_typeof(activity) <> 'array'
  or findings is null
  or jsonb_typeof(findings) <> 'array'
  or measurements is null
  or jsonb_typeof(measurements) <> 'array';

alter table public.inspections
alter column inspection_type set default 'site_inspection',
alter column inspection_type set not null,
alter column service_category set default 'roofing',
alter column service_category set not null,
alter column priority set default 'normal',
alter column priority set not null,
alter column report_requested set default false,
alter column report_requested set not null,
alter column findings set default '[]'::jsonb,
alter column findings set not null,
alter column measurements set default '[]'::jsonb,
alter column measurements set not null,
alter column photo_ids set default '{}',
alter column photo_ids set not null,
alter column activity set default '[]'::jsonb,
alter column activity set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inspections'::regclass
      and conname = 'inspections_customer_id_fkey'
  ) then
    alter table public.inspections
    add constraint inspections_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inspections'::regclass
      and conname = 'inspections_lead_id_fkey'
  ) then
    alter table public.inspections
    add constraint inspections_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inspections'::regclass
      and conname = 'inspections_schedule_event_id_fkey'
  ) then
    alter table public.inspections
    add constraint inspections_schedule_event_id_fkey
    foreign key (schedule_event_id) references public.schedule_events(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inspections'::regclass
      and conname = 'inspections_estimate_id_fkey'
  ) then
    alter table public.inspections
    add constraint inspections_estimate_id_fkey
    foreign key (estimate_id) references public.estimates(id) on delete set null
    not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inspections'::regclass
      and conname = 'inspections_report_document_id_fkey'
  ) then
    alter table public.inspections
    add constraint inspections_report_document_id_fkey
    foreign key (report_document_id) references public.documents(id) on delete set null
    not valid;
  end if;
end $$;

alter table public.inspections validate constraint inspections_customer_id_fkey;
alter table public.inspections validate constraint inspections_lead_id_fkey;
alter table public.inspections validate constraint inspections_schedule_event_id_fkey;
alter table public.inspections validate constraint inspections_estimate_id_fkey;
alter table public.inspections validate constraint inspections_report_document_id_fkey;

alter table public.inspections
drop constraint if exists inspections_status_check;

alter table public.inspections
add constraint inspections_status_check
check (
  status in (
    'draft',
    'scheduled',
    'in_progress',
    'completed',
    'follow_up_required',
    'no_work_needed',
    'canceled',
    'pending',
    'passed',
    'failed',
    'needs_review'
  )
) not valid;

alter table public.inspections validate constraint inspections_status_check;

alter table public.inspections
drop constraint if exists inspections_type_check;

alter table public.inspections
add constraint inspections_type_check
check (
  inspection_type in (
    'site_inspection',
    'roof_inspection',
    'roof_repair',
    'maintenance',
    'insurance_hoa',
    'painting_exterior',
    'painting_interior',
    'cabinet_refinishing',
    'follow_up'
  )
) not valid;

alter table public.inspections validate constraint inspections_type_check;

alter table public.inspections
drop constraint if exists inspections_service_category_check;

alter table public.inspections
add constraint inspections_service_category_check
check (
  service_category in (
    'roofing',
    'roof_repair',
    'tile_underlayment',
    'exterior_painting',
    'interior_painting',
    'cabinet_refinishing',
    'general_exterior'
  )
) not valid;

alter table public.inspections validate constraint inspections_service_category_check;

alter table public.inspections
drop constraint if exists inspections_priority_check;

alter table public.inspections
add constraint inspections_priority_check
check (priority in ('low', 'normal', 'high', 'urgent')) not valid;

alter table public.inspections validate constraint inspections_priority_check;

alter table public.inspections
drop constraint if exists inspections_outcome_check;

alter table public.inspections
add constraint inspections_outcome_check
check (
  outcome is null
  or outcome in (
    'estimate_only',
    'roof_report',
    'maintenance_report',
    'insurance_hoa_documentation',
    'schedule_follow_up',
    'no_work_needed',
    'internal_only',
    'save_and_close'
  )
) not valid;

alter table public.inspections validate constraint inspections_outcome_check;

create index if not exists inspections_company_id_idx
on public.inspections(company_id);

create index if not exists inspections_customer_id_idx
on public.inspections(customer_id);

create index if not exists inspections_lead_id_idx
on public.inspections(lead_id);

create index if not exists inspections_schedule_event_id_idx
on public.inspections(schedule_event_id);

create index if not exists inspections_status_idx
on public.inspections(status);

create index if not exists inspections_scheduled_start_idx
on public.inspections(scheduled_start);

create index if not exists inspections_outcome_idx
on public.inspections(outcome);

alter table public.job_photos
add column if not exists inspection_id uuid,
add column if not exists label text,
add column if not exists is_customer_visible boolean,
add column if not exists sort_order integer;

update public.job_photos
set
  is_customer_visible = coalesce(is_customer_visible, false),
  sort_order = coalesce(sort_order, 0)
where is_customer_visible is null
  or sort_order is null;

alter table public.job_photos
alter column is_customer_visible set default false,
alter column is_customer_visible set not null,
alter column sort_order set default 0,
alter column sort_order set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.job_photos'::regclass
      and conname = 'job_photos_inspection_id_fkey'
  ) then
    alter table public.job_photos
    add constraint job_photos_inspection_id_fkey
    foreign key (inspection_id) references public.inspections(id) on delete set null
    not valid;
  end if;
end $$;

alter table public.job_photos validate constraint job_photos_inspection_id_fkey;

create index if not exists job_photos_inspection_id_idx
on public.job_photos(inspection_id);

alter table public.inspections enable row level security;
alter table public.job_photos enable row level security;

revoke delete on public.inspections from authenticated;
revoke delete on public.job_photos from authenticated;

grant select, insert, update on public.inspections to authenticated;
grant select, insert, update on public.job_photos to authenticated;
grant select, insert, update, delete on public.inspections to service_role;
grant select, insert, update, delete on public.job_photos to service_role;

commit;
