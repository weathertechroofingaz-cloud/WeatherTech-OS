alter table public.jobs
add column if not exists business text,
add column if not exists location text,
add column if not exists scheduled_start timestamptz,
add column if not exists scheduled_end timestamptz,
add column if not exists address text,
add column if not exists scope_of_work text,
add column if not exists total numeric(12, 2) not null default 0;

update public.jobs as job
set
  business = coalesce(
    nullif(job.business, ''),
    (
      select company.name
      from public.companies as company
      where company.id = job.company_id
      limit 1
    )
  ),
  location = coalesce(
    nullif(job.location, ''),
    nullif(job.address, ''),
    nullif(job.property_address, ''),
    (
      select customer.property_address
      from public.customers as customer
      where customer.id = job.customer_id
      limit 1
    ),
    (
      select lead.property_address
      from public.leads as lead
      where lead.id = job.lead_id
      limit 1
    )
  ),
  scheduled_start = coalesce(
    job.scheduled_start,
    case
      when job.start_date is not null then job.start_date::timestamptz
      else null
    end
  ),
  scheduled_end = coalesce(
    job.scheduled_end,
    case
      when job.end_date is not null then (job.end_date + interval '1 day')::timestamptz
      else null
    end
  ),
  address = coalesce(
    nullif(job.address, ''),
    nullif(job.property_address, ''),
    (
      select customer.property_address
      from public.customers as customer
      where customer.id = job.customer_id
      limit 1
    ),
    (
      select lead.property_address
      from public.leads as lead
      where lead.id = job.lead_id
      limit 1
    )
  ),
  scope_of_work = coalesce(
    nullif(job.scope_of_work, ''),
    (
      select scope.scope_body
      from public.scopes as scope
      where scope.id = job.scope_id
      limit 1
    ),
    job.notes
  ),
  total = coalesce(
    nullif(job.total, 0),
    (
      select estimate.total
      from public.estimates as estimate
      where estimate.id = job.estimate_id
      limit 1
    ),
    0
  )
where job.business is null
  or job.business = ''
  or job.location is null
  or job.location = ''
  or job.scheduled_start is null
  or job.scheduled_end is null
  or job.address is null
  or job.address = ''
  or job.scope_of_work is null
  or job.scope_of_work = ''
  or job.total = 0;

alter table public.jobs
drop constraint if exists jobs_status_check;

alter table public.jobs
add constraint jobs_status_check
check (
  status in (
    'draft',
    'scheduled',
    'in_progress',
    'blocked',
    'completed',
    'cancelled',
    'canceled',
    'closed'
  )
);

create index if not exists jobs_estimate_id_idx
on public.jobs(estimate_id);

create index if not exists jobs_status_idx
on public.jobs(status);

create index if not exists jobs_scheduled_start_idx
on public.jobs(scheduled_start);
