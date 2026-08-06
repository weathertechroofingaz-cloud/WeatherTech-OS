-- Office Operations & Daily Task Queue (Phase 1)
begin;

create table if not exists public.office_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  source_type text not null check (
    source_type in (
      'new_lead',
      'scheduled_inspection',
      'completed_inspection',
      'sent_estimate',
      'unsigned_estimate',
      'scheduled_job',
      'completed_job'
    )
  ),
  automation_key text not null,
  title text not null check (length(trim(title)) > 0),
  notes text,
  priority text not null default 'normal' check (
    priority in ('low', 'normal', 'high', 'urgent')
  ),
  due_at timestamptz not null,
  status text not null default 'open' check (
    status in ('open', 'snoozed', 'completed')
  ),
  snoozed_until timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint office_tasks_company_automation_key_key
    unique (company_id, automation_key),
  constraint office_tasks_status_dates_check check (
    (status = 'completed' and completed_at is not null and snoozed_until is null)
    or (status = 'snoozed' and completed_at is null and snoozed_until is not null)
    or (status = 'open' and completed_at is null and snoozed_until is null)
  ),
  constraint office_tasks_source_link_check check (
    (source_type = 'new_lead' and lead_id is not null and inspection_id is null and estimate_id is null and job_id is null)
    or (source_type in ('scheduled_inspection', 'completed_inspection') and lead_id is null and inspection_id is not null and estimate_id is null and job_id is null)
    or (source_type in ('sent_estimate', 'unsigned_estimate') and lead_id is null and inspection_id is null and estimate_id is not null and job_id is null)
    or (source_type in ('scheduled_job', 'completed_job') and lead_id is null and inspection_id is null and estimate_id is null and job_id is not null)
  )
);

create index if not exists office_tasks_company_due_active_idx
on public.office_tasks (company_id, due_at, priority)
where status <> 'completed';

create index if not exists office_tasks_company_completed_idx
on public.office_tasks (company_id, completed_at desc)
where status = 'completed';

create index if not exists office_tasks_assigned_employee_active_idx
on public.office_tasks (assigned_employee_id, due_at)
where assigned_employee_id is not null and status <> 'completed';

create index if not exists office_tasks_customer_id_idx
on public.office_tasks (customer_id)
where customer_id is not null;

create index if not exists office_tasks_property_id_idx
on public.office_tasks (property_id)
where property_id is not null;

create index if not exists office_tasks_lead_id_idx
on public.office_tasks (lead_id)
where lead_id is not null;

create index if not exists office_tasks_inspection_id_idx
on public.office_tasks (inspection_id)
where inspection_id is not null;

create index if not exists office_tasks_estimate_id_idx
on public.office_tasks (estimate_id)
where estimate_id is not null;

create index if not exists office_tasks_job_id_idx
on public.office_tasks (job_id)
where job_id is not null;

create or replace function public.wtos_validate_office_task_company_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers where id = new.customer_id and company_id = new.company_id
  ) then
    raise exception 'Office task customer must belong to the task company' using errcode = '23514';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties where id = new.property_id and company_id = new.company_id
  ) then
    raise exception 'Office task property must belong to the task company' using errcode = '23514';
  end if;

  if new.assigned_employee_id is not null and not exists (
    select 1 from public.employees where id = new.assigned_employee_id and company_id = new.company_id
  ) then
    raise exception 'Office task employee must belong to the task company' using errcode = '23514';
  end if;

  if new.lead_id is not null and not exists (
    select 1 from public.leads where id = new.lead_id and company_id = new.company_id
  ) then
    raise exception 'Office task lead must belong to the task company' using errcode = '23514';
  end if;

  if new.inspection_id is not null and not exists (
    select 1 from public.inspections where id = new.inspection_id and company_id = new.company_id
  ) then
    raise exception 'Office task inspection must belong to the task company' using errcode = '23514';
  end if;

  if new.estimate_id is not null and not exists (
    select 1 from public.estimates where id = new.estimate_id and company_id = new.company_id
  ) then
    raise exception 'Office task estimate must belong to the task company' using errcode = '23514';
  end if;

  if new.job_id is not null and not exists (
    select 1 from public.jobs where id = new.job_id and company_id = new.company_id
  ) then
    raise exception 'Office task job must belong to the task company' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.wtos_set_office_task_lifecycle()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'completed' then
    new.completed_at = case
      when tg_op = 'UPDATE' and old.status = 'completed' then old.completed_at
      else coalesce(new.completed_at, now())
    end;
    new.completed_by = case
      when tg_op = 'UPDATE' and old.status = 'completed' then old.completed_by
      else coalesce((select auth.uid()), new.completed_by)
    end;
    new.snoozed_until = null;
  elsif new.status = 'snoozed' then
    new.completed_at = null;
    new.completed_by = null;

    if new.snoozed_until is null then
      raise exception 'Snoozed office tasks require snoozed_until' using errcode = '23514';
    end if;
  else
    new.completed_at = null;
    new.completed_by = null;
    new.snoozed_until = null;
  end if;

  return new;
end;
$$;

drop trigger if exists office_tasks_validate_company_links on public.office_tasks;
create trigger office_tasks_validate_company_links
before insert or update on public.office_tasks
for each row execute function public.wtos_validate_office_task_company_links();

drop trigger if exists office_tasks_lifecycle on public.office_tasks;
create trigger office_tasks_lifecycle
before insert or update on public.office_tasks
for each row execute function public.wtos_set_office_task_lifecycle();

drop trigger if exists office_tasks_set_updated_at on public.office_tasks;
create trigger office_tasks_set_updated_at
before update on public.office_tasks
for each row execute function public.set_updated_at();

create or replace function public.wtos_create_generated_office_task(
  task_company_id uuid,
  task_customer_id uuid,
  task_property_id uuid,
  task_employee_id uuid,
  task_lead_id uuid,
  task_inspection_id uuid,
  task_estimate_id uuid,
  task_job_id uuid,
  task_source_type text,
  task_automation_key text,
  task_title text,
  task_notes text,
  task_priority text,
  task_due_at timestamptz
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.office_tasks (
    company_id,
    customer_id,
    property_id,
    assigned_employee_id,
    lead_id,
    inspection_id,
    estimate_id,
    job_id,
    source_type,
    automation_key,
    title,
    notes,
    priority,
    due_at
  )
  values (
    task_company_id,
    task_customer_id,
    task_property_id,
    task_employee_id,
    task_lead_id,
    task_inspection_id,
    task_estimate_id,
    task_job_id,
    task_source_type,
    task_automation_key,
    task_title,
    task_notes,
    task_priority,
    task_due_at
  )
  on conflict (company_id, automation_key) do nothing;
$$;

create or replace function public.wtos_complete_generated_office_task(
  task_company_id uuid,
  task_automation_key text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.office_tasks
  set status = 'completed'
  where company_id = task_company_id
    and automation_key = task_automation_key
    and status <> 'completed';
$$;

create or replace function public.wtos_generate_lead_office_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lead_due_at timestamptz;
begin
  if new.status = 'new' then
    lead_due_at := case
      when new.next_follow_up is not null
        then (new.next_follow_up + time '09:00') at time zone 'America/Phoenix'
      else new.created_at
    end;

    perform public.wtos_create_generated_office_task(
      new.company_id,
      new.customer_id,
      new.property_id,
      null,
      new.id,
      null,
      null,
      null,
      'new_lead',
      'new_lead:' || new.id::text,
      'Qualify new lead and set next action',
      'Contact the lead, confirm the property, and schedule the inspection.',
      new.priority,
      lead_due_at
    );
  else
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'new_lead:' || new.id::text
    );
  end if;

  return new;
end;
$$;

create or replace function public.wtos_generate_inspection_office_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'scheduled' and new.scheduled_start is not null then
    perform public.wtos_create_generated_office_task(
      new.company_id,
      new.customer_id,
      new.property_id,
      new.employee_id,
      null,
      new.id,
      null,
      null,
      'scheduled_inspection',
      'scheduled_inspection:' || new.id::text,
      'Confirm scheduled inspection',
      'Confirm the appointment details, property access, and assigned inspector.',
      new.priority,
      new.scheduled_start
    );
  elsif new.status in ('completed', 'canceled', 'no_work_needed') then
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'scheduled_inspection:' || new.id::text
    );
  end if;

  if new.status = 'completed' then
    perform public.wtos_create_generated_office_task(
      new.company_id,
      new.customer_id,
      new.property_id,
      new.employee_id,
      null,
      new.id,
      null,
      null,
      'completed_inspection',
      'completed_inspection:' || new.id::text,
      'Create estimate or close out inspection',
      'Review findings and create the estimate, follow-up, or no-work closeout.',
      'high',
      coalesce(new.completed_at, new.updated_at)
    );
  end if;

  if new.estimate_id is not null then
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'completed_inspection:' || new.id::text
    );
  end if;

  return new;
end;
$$;

create or replace function public.wtos_generate_estimate_office_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  unsigned_due_at timestamptz;
begin
  if new.status = 'sent' then
    perform public.wtos_create_generated_office_task(
      new.company_id,
      new.customer_id,
      new.property_id,
      null,
      null,
      null,
      new.id,
      null,
      'sent_estimate',
      'sent_estimate:' || new.id::text,
      'Confirm sent estimate delivery',
      'Confirm the customer received the estimate and record the next follow-up.',
      'normal',
      new.updated_at
    );

    if not exists (
      select 1
      from public.estimate_proposal_acceptances acceptance
      where acceptance.estimate_id = new.id
        and acceptance.signature_status = 'signed'
    ) then
      unsigned_due_at := case
        when new.expiration_date is not null
          then (new.expiration_date + time '09:00') at time zone 'America/Phoenix'
        else new.updated_at
      end;

      perform public.wtos_create_generated_office_task(
        new.company_id,
        new.customer_id,
        new.property_id,
        null,
        null,
        null,
        new.id,
        null,
        'unsigned_estimate',
        'unsigned_estimate:' || new.id::text,
        'Follow up on unsigned estimate',
        'Contact the customer for a decision and record approval, decline, or signature status.',
        'high',
        unsigned_due_at
      );
    end if;
  else
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'sent_estimate:' || new.id::text
    );
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'unsigned_estimate:' || new.id::text
    );
  end if;

  return new;
end;
$$;

create or replace function public.wtos_generate_job_office_tasks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  task_employee_id uuid;
  scheduled_due_at timestamptz;
begin
  if new.scheduled_start is not null or new.scheduled_end is not null then
    select assignment.employee_id
    into task_employee_id
    from public.job_assignments assignment
    where assignment.job_id = new.id
      and assignment.status in ('assigned', 'accepted')
    order by assignment.created_at desc
    limit 1;

    scheduled_due_at := coalesce(new.scheduled_start, new.scheduled_end, new.updated_at);

    perform public.wtos_create_generated_office_task(
      new.company_id,
      new.customer_id,
      new.property_id,
      task_employee_id,
      null,
      null,
      null,
      new.id,
      'scheduled_job',
      'scheduled_job:' || new.id::text,
      'Confirm production schedule and crew',
      'Confirm production dates, crew assignment, access, and material readiness.',
      'high',
      scheduled_due_at
    );
  end if;

  if new.status in ('in_progress', 'completed', 'cancelled', 'canceled', 'closed') then
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'scheduled_job:' || new.id::text
    );
  end if;

  if new.status = 'completed' then
    perform public.wtos_create_generated_office_task(
      new.company_id,
      new.customer_id,
      new.property_id,
      task_employee_id,
      null,
      null,
      null,
      new.id,
      'completed_job',
      'completed_job:' || new.id::text,
      'Complete job closeout and start warranty',
      'Create the final invoice, complete closeout documents, and start warranty tracking.',
      'high',
      new.updated_at
    );
  elsif new.status = 'closed' then
    perform public.wtos_complete_generated_office_task(
      new.company_id,
      'completed_job:' || new.id::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists leads_generate_office_tasks on public.leads;
create trigger leads_generate_office_tasks
after insert or update of status, next_follow_up on public.leads
for each row execute function public.wtos_generate_lead_office_tasks();

drop trigger if exists inspections_generate_office_tasks on public.inspections;
create trigger inspections_generate_office_tasks
after insert or update of status, scheduled_start, completed_at, estimate_id on public.inspections
for each row execute function public.wtos_generate_inspection_office_tasks();

drop trigger if exists estimates_generate_office_tasks on public.estimates;
create trigger estimates_generate_office_tasks
after insert or update of status, expiration_date on public.estimates
for each row execute function public.wtos_generate_estimate_office_tasks();

drop trigger if exists jobs_generate_office_tasks on public.jobs;
create trigger jobs_generate_office_tasks
after insert or update of status, scheduled_start, scheduled_end on public.jobs
for each row execute function public.wtos_generate_job_office_tasks();

select public.wtos_create_generated_office_task(
  lead.company_id,
  lead.customer_id,
  lead.property_id,
  null,
  lead.id,
  null,
  null,
  null,
  'new_lead',
  'new_lead:' || lead.id::text,
  'Qualify new lead and set next action',
  'Contact the lead, confirm the property, and schedule the inspection.',
  lead.priority,
  case
    when lead.next_follow_up is not null
      then (lead.next_follow_up + time '09:00') at time zone 'America/Phoenix'
    else lead.created_at
  end
)
from public.leads lead
where lead.status = 'new';

select public.wtos_create_generated_office_task(
  inspection.company_id,
  inspection.customer_id,
  inspection.property_id,
  inspection.employee_id,
  null,
  inspection.id,
  null,
  null,
  'scheduled_inspection',
  'scheduled_inspection:' || inspection.id::text,
  'Confirm scheduled inspection',
  'Confirm the appointment details, property access, and assigned inspector.',
  inspection.priority,
  inspection.scheduled_start
)
from public.inspections inspection
where inspection.status = 'scheduled'
  and inspection.scheduled_start is not null;

select public.wtos_create_generated_office_task(
  inspection.company_id,
  inspection.customer_id,
  inspection.property_id,
  inspection.employee_id,
  null,
  inspection.id,
  null,
  null,
  'completed_inspection',
  'completed_inspection:' || inspection.id::text,
  'Create estimate or close out inspection',
  'Review findings and create the estimate, follow-up, or no-work closeout.',
  'high',
  coalesce(inspection.completed_at, inspection.updated_at)
)
from public.inspections inspection
where inspection.status = 'completed'
  and inspection.estimate_id is null;

select public.wtos_create_generated_office_task(
  estimate.company_id,
  estimate.customer_id,
  estimate.property_id,
  null,
  null,
  null,
  estimate.id,
  null,
  'sent_estimate',
  'sent_estimate:' || estimate.id::text,
  'Confirm sent estimate delivery',
  'Confirm the customer received the estimate and record the next follow-up.',
  'normal',
  estimate.updated_at
)
from public.estimates estimate
where estimate.status = 'sent';

select public.wtos_create_generated_office_task(
  estimate.company_id,
  estimate.customer_id,
  estimate.property_id,
  null,
  null,
  null,
  estimate.id,
  null,
  'unsigned_estimate',
  'unsigned_estimate:' || estimate.id::text,
  'Follow up on unsigned estimate',
  'Contact the customer for a decision and record approval, decline, or signature status.',
  'high',
  case
    when estimate.expiration_date is not null
      then (estimate.expiration_date + time '09:00') at time zone 'America/Phoenix'
    else estimate.updated_at
  end
)
from public.estimates estimate
where estimate.status = 'sent'
  and not exists (
    select 1
    from public.estimate_proposal_acceptances acceptance
    where acceptance.estimate_id = estimate.id
      and acceptance.signature_status = 'signed'
  );

select public.wtos_create_generated_office_task(
  job.company_id,
  job.customer_id,
  job.property_id,
  assignment.employee_id,
  null,
  null,
  null,
  job.id,
  'scheduled_job',
  'scheduled_job:' || job.id::text,
  'Confirm production schedule and crew',
  'Confirm production dates, crew assignment, access, and material readiness.',
  'high',
  coalesce(job.scheduled_start, job.scheduled_end, job.updated_at)
)
from public.jobs job
left join lateral (
  select job_assignment.employee_id
  from public.job_assignments job_assignment
  where job_assignment.job_id = job.id
    and job_assignment.status in ('assigned', 'accepted')
  order by job_assignment.created_at desc
  limit 1
) assignment on true
where (job.scheduled_start is not null or job.scheduled_end is not null)
  and job.status not in ('in_progress', 'completed', 'cancelled', 'canceled', 'closed');

select public.wtos_create_generated_office_task(
  job.company_id,
  job.customer_id,
  job.property_id,
  assignment.employee_id,
  null,
  null,
  null,
  job.id,
  'completed_job',
  'completed_job:' || job.id::text,
  'Complete job closeout and start warranty',
  'Create the final invoice, complete closeout documents, and start warranty tracking.',
  'high',
  job.updated_at
)
from public.jobs job
left join lateral (
  select job_assignment.employee_id
  from public.job_assignments job_assignment
  where job_assignment.job_id = job.id
    and job_assignment.status in ('assigned', 'accepted')
  order by job_assignment.created_at desc
  limit 1
) assignment on true
where job.status = 'completed';

alter table public.office_tasks enable row level security;

drop policy if exists "WTOS company members read office tasks" on public.office_tasks;
create policy "WTOS company members read office tasks"
on public.office_tasks
for select
to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS office staff update office tasks" on public.office_tasks;
create policy "WTOS office staff update office tasks"
on public.office_tasks
for update
to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_settings(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_settings(company_id)
);

revoke all on table public.office_tasks from anon, authenticated;
grant select on table public.office_tasks to authenticated;
grant update (
  assigned_employee_id,
  priority,
  due_at,
  notes,
  status,
  snoozed_until,
  completed_at,
  completed_by,
  updated_at
) on table public.office_tasks to authenticated;
grant all on table public.office_tasks to service_role;

revoke execute on function public.wtos_validate_office_task_company_links() from public, anon, authenticated;
revoke execute on function public.wtos_set_office_task_lifecycle() from public, anon, authenticated;
revoke execute on function public.wtos_create_generated_office_task(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.wtos_complete_generated_office_task(uuid, text) from public, anon, authenticated;
revoke execute on function public.wtos_generate_lead_office_tasks() from public, anon, authenticated;
revoke execute on function public.wtos_generate_inspection_office_tasks() from public, anon, authenticated;
revoke execute on function public.wtos_generate_estimate_office_tasks() from public, anon, authenticated;
revoke execute on function public.wtos_generate_job_office_tasks() from public, anon, authenticated;

commit;
