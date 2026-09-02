begin;

set local lock_timeout = '5s';

-- WeatherTech OS Automation Engine Foundation
--
-- This migration is deliberately additive. It preserves the existing CRM and
-- office-task records while replacing the four direct office-task generators
-- with a durable event -> execution -> attempt pipeline. Only internal office
-- task actions are executable. No provider send, customer message, payment,
-- or arbitrary CRM mutation action is registered here.

create or replace function public.wtos_automation_conditions_valid_v1(
  rule_conditions jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  condition_item jsonb;
  condition_field text;
  condition_operator text;
begin
  if rule_conditions is null
    or jsonb_typeof(rule_conditions) <> 'object'
    or not (rule_conditions ? 'all')
    or jsonb_typeof(rule_conditions -> 'all') <> 'array'
    or exists (
      select 1
      from jsonb_object_keys(rule_conditions) as rule_key
      where rule_key <> 'all'
    )
    or jsonb_array_length(rule_conditions -> 'all') > 8 then
    return false;
  end if;

  for condition_item in
    select value from jsonb_array_elements(rule_conditions -> 'all')
  loop
    if jsonb_typeof(condition_item) <> 'object'
      or not (condition_item ? 'field')
      or not (condition_item ? 'operator')
      or exists (
        select 1
        from jsonb_object_keys(condition_item) as condition_key
        where condition_key not in ('field', 'operator', 'value')
      ) then
      return false;
    end if;

    condition_field := condition_item ->> 'field';
    condition_operator := condition_item ->> 'operator';

    if condition_field not in (
      'status',
      'previous_status',
      'next_follow_up',
      'scheduled_start',
      'scheduled_end',
      'completed_at',
      'estimate_id',
      'signature_status',
      'has_schedule',
      'has_scheduled_job',
      'source',
      'provider',
      'branch_key',
      'priority',
      'due_at'
    ) or condition_operator not in (
      'eq', 'neq', 'in', 'not_in', 'is_null', 'not_null', 'truthy', 'falsy'
    ) then
      return false;
    end if;

    if condition_operator in ('eq', 'neq') and not (condition_item ? 'value') then
      return false;
    end if;

    if condition_operator in ('in', 'not_in')
      and (
        not (condition_item ? 'value')
        or jsonb_typeof(condition_item -> 'value') <> 'array'
        or jsonb_array_length(condition_item -> 'value') > 12
      ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.wtos_automation_action_config_valid_v1(
  rule_action_type text,
  rule_action_config jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if rule_action_config is null or jsonb_typeof(rule_action_config) <> 'object' then
    return false;
  end if;

  if rule_action_type = 'create_office_task' then
    return
      not exists (
        select 1
        from jsonb_object_keys(rule_action_config) as action_key
        where action_key not in (
          'sourceType',
          'automationKeyPrefix',
          'title',
          'notes',
          'priority',
          'dueStrategy'
        )
      )
      and rule_action_config ->> 'sourceType' in (
        'new_lead',
        'scheduled_inspection',
        'completed_inspection',
        'sent_estimate',
        'unsigned_estimate',
        'scheduled_job',
        'completed_job',
        'automation'
      )
      and length(btrim(coalesce(rule_action_config ->> 'automationKeyPrefix', ''))) between 1 and 80
      and (rule_action_config ->> 'automationKeyPrefix') ~ '^[a-z0-9][a-z0-9:_-]*$'
      and length(btrim(coalesce(rule_action_config ->> 'title', ''))) between 1 and 160
      and length(coalesce(rule_action_config ->> 'notes', '')) <= 2000
      and rule_action_config ->> 'priority' in ('low', 'normal', 'high', 'urgent')
      and rule_action_config ->> 'dueStrategy' in (
        'event_time',
        'next_follow_up_9am',
        'scheduled_start',
        'completed_at',
        'expiration_9am',
        'updated_at',
        'schedule_start_or_end'
      );
  end if;

  if rule_action_type = 'complete_office_task' then
    return
      not exists (
        select 1
        from jsonb_object_keys(rule_action_config) as action_key
        where action_key <> 'automationKeyPrefix'
      )
      and length(btrim(coalesce(rule_action_config ->> 'automationKeyPrefix', ''))) between 1 and 80
      and (rule_action_config ->> 'automationKeyPrefix') ~ '^[a-z0-9][a-z0-9:_-]*$';
  end if;

  return false;
end;
$$;

create or replace function public.wtos_automation_conditions_match_v1(
  rule_conditions jsonb,
  event_payload jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  condition_item jsonb;
  candidate_value jsonb;
  expected_value jsonb;
  condition_operator text;
  condition_matches boolean;
begin
  if not public.wtos_automation_conditions_valid_v1(rule_conditions)
    or event_payload is null
    or jsonb_typeof(event_payload) <> 'object' then
    return false;
  end if;

  for condition_item in
    select value from jsonb_array_elements(rule_conditions -> 'all')
  loop
    candidate_value := event_payload -> (condition_item ->> 'field');
    expected_value := condition_item -> 'value';
    condition_operator := condition_item ->> 'operator';

    condition_matches := case condition_operator
      when 'eq' then candidate_value = expected_value
      when 'neq' then candidate_value is distinct from expected_value
      when 'in' then exists (
        select 1
        from jsonb_array_elements(expected_value) as allowed(value)
        where allowed.value = candidate_value
      )
      when 'not_in' then not exists (
        select 1
        from jsonb_array_elements(expected_value) as denied(value)
        where denied.value = candidate_value
      )
      when 'is_null' then candidate_value is null or candidate_value = 'null'::jsonb
      when 'not_null' then candidate_value is not null and candidate_value <> 'null'::jsonb
      when 'truthy' then candidate_value = 'true'::jsonb
      when 'falsy' then candidate_value is null
        or candidate_value = 'null'::jsonb
        or candidate_value = 'false'::jsonb
      else false
    end;

    if not coalesce(condition_matches, false) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table public.company_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_key text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_locations_company_key_key unique (company_id, location_key),
  constraint company_locations_id_company_key unique (id, company_id),
  constraint company_locations_key_check check (
    location_key ~ '^[a-z0-9][a-z0-9_-]{1,62}$'
  ),
  constraint company_locations_display_name_check check (
    length(btrim(display_name)) between 1 and 120
  )
);

insert into public.company_locations (company_id, location_key, display_name)
select company.id, seed.location_key, seed.display_name
from public.companies as company
join (
  values
    ('WeatherTech Roofing LLC', 'weathertech_phoenix', 'WeatherTech Phoenix / Scottsdale'),
    ('WeatherTech Roofing LLC', 'weathertech_tucson', 'WeatherTech Tucson'),
    ('IHC Painting', 'ihc', 'IHC Painting')
) as seed(company_name, location_key, display_name)
  on seed.company_name = company.name
on conflict (company_id, location_key) do nothing;

alter table public.leads
add column company_location_id uuid;

alter table public.lead_intake_records
add column company_location_id uuid;

update public.lead_intake_records as intake
set company_location_id = location.id
from public.company_locations as location
where intake.company_id = location.company_id
  and intake.company_location_id is null
  and (
    (intake.branch_key = 'weathertech_phoenix' and location.location_key = 'weathertech_phoenix')
    or (intake.branch_key = 'weathertech_tucson' and location.location_key = 'weathertech_tucson')
    or (intake.branch_key = 'ihc' and location.location_key = 'ihc')
  );

with exact_lead_locations as (
  select
    intake.linked_lead_id,
    min(intake.company_location_id::text)::uuid as company_location_id
  from public.lead_intake_records as intake
  where intake.linked_lead_id is not null
    and intake.company_location_id is not null
  group by intake.linked_lead_id
  having count(distinct intake.company_location_id) = 1
)
update public.leads as lead
set company_location_id = exact.company_location_id
from exact_lead_locations as exact
where lead.id = exact.linked_lead_id
  and lead.company_location_id is null
  and exists (
    select 1
    from public.company_locations as location
    where location.id = exact.company_location_id
      and location.company_id = lead.company_id
  );

alter table public.leads
add constraint leads_company_location_company_fkey
foreign key (company_location_id, company_id)
references public.company_locations(id, company_id)
on delete set null (company_location_id)
not valid;

alter table public.lead_intake_records
add constraint lead_intake_records_company_location_company_fkey
foreign key (company_location_id, company_id)
references public.company_locations(id, company_id)
on delete set null (company_location_id)
not valid;

alter table public.leads
validate constraint leads_company_location_company_fkey;

alter table public.lead_intake_records
validate constraint lead_intake_records_company_location_company_fkey;

create index leads_company_location_idx
on public.leads(company_id, company_location_id)
where company_location_id is not null;

create index lead_intake_records_company_location_idx
on public.lead_intake_records(company_id, company_location_id)
where company_location_id is not null;

create table public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_location_id uuid,
  rule_key text not null,
  name text not null,
  description text,
  trigger_type text not null check (
    trigger_type in (
      'lead.created', 'lead.updated',
      'customer.created', 'customer.updated',
      'inspection.created', 'inspection.updated', 'inspection.scheduled', 'inspection.completed',
      'estimate.created', 'estimate.updated', 'estimate.sent', 'estimate.approved',
      'job.created', 'job.updated', 'job.scheduled', 'job.completed',
      'invoice.created', 'invoice.updated', 'invoice.paid',
      'task.due',
      'communication.received', 'missed_call.received',
      'website.lead.created', 'yelp.lead.created',
      'ai.action.approved', 'ai.action.rejected'
    )
  ),
  conditions jsonb not null default '{"all":[]}'::jsonb,
  condition_contract_version smallint not null default 1 check (condition_contract_version = 1),
  action_type text not null check (
    action_type in ('create_office_task', 'complete_office_task')
  ),
  action_config jsonb not null,
  action_contract_version smallint not null default 1 check (action_contract_version = 1),
  delay_seconds integer not null default 0 check (delay_seconds between 0 and 2592000),
  enabled boolean not null default false,
  approval_policy text not null default 'manual' check (approval_policy in ('none', 'manual')),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 5),
  retry_backoff_seconds integer not null default 60 check (retry_backoff_seconds between 30 and 86400),
  version integer not null default 1 check (version > 0),
  enabled_by uuid references auth.users(id) on delete set null,
  enabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  disable_reason text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_rules_company_rule_key_key unique (company_id, rule_key),
  constraint automation_rules_company_id_id_key unique (company_id, id),
  constraint automation_rules_company_location_fkey
    foreign key (company_location_id, company_id)
    references public.company_locations(id, company_id)
    on delete set null (company_location_id),
  constraint automation_rules_rule_key_check check (
    rule_key ~ '^[a-z0-9][a-z0-9:_-]{2,126}$'
  ),
  constraint automation_rules_name_check check (length(btrim(name)) between 1 and 160),
  constraint automation_rules_description_check check (
    description is null or length(description) <= 2000
  ),
  constraint automation_rules_conditions_check check (
    public.wtos_automation_conditions_valid_v1(conditions)
  ),
  constraint automation_rules_action_config_check check (
    public.wtos_automation_action_config_valid_v1(action_type, action_config)
  ),
  constraint automation_rules_activation_check check (
    (enabled and enabled_at is not null and disabled_at is null)
    or (not enabled and enabled_at is null)
  ),
  constraint automation_rules_disable_reason_check check (
    disable_reason is null or length(btrim(disable_reason)) between 1 and 500
  )
);

create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_location_id uuid,
  event_type text not null check (
    event_type in (
      'lead.created', 'lead.updated',
      'customer.created', 'customer.updated',
      'inspection.created', 'inspection.updated', 'inspection.scheduled', 'inspection.completed',
      'estimate.created', 'estimate.updated', 'estimate.sent', 'estimate.approved',
      'job.created', 'job.updated', 'job.scheduled', 'job.completed',
      'invoice.created', 'invoice.updated', 'invoice.paid',
      'task.due',
      'communication.received', 'missed_call.received',
      'website.lead.created', 'yelp.lead.created',
      'ai.action.approved', 'ai.action.rejected'
    )
  ),
  source_table text not null check (
    source_table in (
      'leads', 'customers', 'inspections', 'estimates', 'jobs', 'invoices',
      'office_tasks', 'communication_provider_events', 'email_messages',
      'call_records', 'ai_audit_events'
    )
  ),
  source_id text not null check (length(btrim(source_id)) between 1 and 160),
  source_version text not null check (length(btrim(source_version)) between 1 and 160),
  actor_user_id uuid references auth.users(id) on delete set null,
  correlation_id uuid not null default gen_random_uuid(),
  causation_event_id uuid references public.automation_events(id) on delete cascade,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),
  constraint automation_events_company_idempotency_key unique (company_id, idempotency_key),
  constraint automation_events_company_id_id_key unique (company_id, id),
  constraint automation_events_company_location_fkey
    foreign key (company_location_id, company_id)
    references public.company_locations(id, company_id)
    on delete set null (company_location_id)
);

create table public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_location_id uuid,
  rule_id uuid not null,
  event_id uuid not null,
  rule_version integer not null check (rule_version > 0),
  action_type text not null check (
    action_type in ('create_office_task', 'complete_office_task')
  ),
  action_config_snapshot jsonb not null check (jsonb_typeof(action_config_snapshot) = 'object'),
  action_input jsonb not null check (jsonb_typeof(action_input) = 'object'),
  status text not null default 'queued' check (
    status in (
      'queued', 'awaiting_approval', 'running', 'retry_scheduled',
      'succeeded', 'failed', 'cancelled', 'rejected'
    )
  ),
  approval_status text not null default 'not_required' check (
    approval_status in ('not_required', 'pending', 'approved', 'rejected')
  ),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  approval_reason text,
  scheduled_for timestamptz not null default now(),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_retry_at timestamptz,
  lease_token uuid,
  lease_expires_at timestamptz,
  worker_id text,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 240),
  version integer not null default 1 check (version > 0),
  last_error_code text,
  last_error_message text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  cancelled_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint automation_executions_company_idempotency_key unique (company_id, idempotency_key),
  constraint automation_executions_event_rule_version_key unique (event_id, rule_id, rule_version),
  constraint automation_executions_company_id_id_key unique (company_id, id),
  constraint automation_executions_company_rule_fkey
    foreign key (company_id, rule_id)
    references public.automation_rules(company_id, id)
    on delete cascade,
  constraint automation_executions_company_event_fkey
    foreign key (company_id, event_id)
    references public.automation_events(company_id, id)
    on delete cascade,
  constraint automation_executions_company_location_fkey
    foreign key (company_location_id, company_id)
    references public.company_locations(id, company_id)
    on delete set null (company_location_id),
  constraint automation_executions_approval_state_check check (
    (approval_status = 'not_required' and approved_at is null and rejected_at is null)
    or (approval_status = 'pending' and approved_at is null and rejected_at is null)
    or (approval_status = 'approved' and approved_at is not null and rejected_at is null)
    or (approval_status = 'rejected' and rejected_at is not null and approved_at is null)
  ),
  constraint automation_executions_terminal_state_check check (
    (status in ('succeeded', 'failed', 'cancelled', 'rejected') and completed_at is not null)
    or (status not in ('succeeded', 'failed', 'cancelled', 'rejected') and completed_at is null)
  ),
  constraint automation_executions_error_length_check check (
    (last_error_code is null or length(last_error_code) <= 80)
    and (last_error_message is null or length(last_error_message) <= 500)
    and (approval_reason is null or length(approval_reason) <= 500)
    and (cancel_reason is null or length(cancel_reason) <= 500)
    and (worker_id is null or length(worker_id) <= 120)
  )
);

create table public.automation_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_location_id uuid,
  execution_id uuid not null,
  attempt_number integer not null check (attempt_number between 1 and 10),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  worker_id text not null check (length(btrim(worker_id)) between 1 and 120),
  started_at timestamptz not null,
  completed_at timestamptz,
  retryable boolean not null default false,
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  constraint automation_attempts_execution_number_key unique (execution_id, attempt_number),
  constraint automation_attempts_company_execution_fkey
    foreign key (company_id, execution_id)
    references public.automation_executions(company_id, id)
    on delete cascade,
  constraint automation_attempts_company_location_fkey
    foreign key (company_location_id, company_id)
    references public.company_locations(id, company_id)
    on delete set null (company_location_id),
  constraint automation_attempts_completion_check check (
    (status = 'running' and completed_at is null)
    or (status in ('succeeded', 'failed') and completed_at is not null)
  ),
  constraint automation_attempts_retry_check check (
    (retryable and status = 'failed' and next_retry_at is not null)
    or (not retryable and next_retry_at is null)
  ),
  constraint automation_attempts_error_length_check check (
    (error_code is null or length(error_code) <= 80)
    and (error_message is null or length(error_message) <= 500)
  )
);

create table public.automation_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_location_id uuid,
  rule_id uuid,
  event_id uuid,
  execution_id uuid,
  actor_user_id uuid references auth.users(id) on delete set null,
  audit_type text not null check (
    audit_type in (
      'rule_seeded', 'rule_enabled', 'rule_disabled',
      'event_recorded', 'execution_enqueued', 'execution_approved',
      'execution_rejected', 'execution_started', 'execution_succeeded',
      'execution_retry_scheduled', 'execution_failed',
      'execution_cancelled', 'execution_manual_retry',
      'ai_action_approved', 'ai_action_rejected'
    )
  ),
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint automation_audit_events_company_rule_fkey
    foreign key (company_id, rule_id)
    references public.automation_rules(company_id, id)
    on delete cascade,
  constraint automation_audit_events_company_event_fkey
    foreign key (company_id, event_id)
    references public.automation_events(company_id, id)
    on delete cascade,
  constraint automation_audit_events_company_execution_fkey
    foreign key (company_id, execution_id)
    references public.automation_executions(company_id, id)
    on delete cascade,
  constraint automation_audit_events_company_location_fkey
    foreign key (company_location_id, company_id)
    references public.company_locations(id, company_id)
    on delete set null (company_location_id),
  constraint automation_audit_events_reason_check check (
    reason is null or length(reason) <= 500
  )
);

create index automation_rules_company_enabled_trigger_idx
on public.automation_rules(company_id, trigger_type, company_location_id)
where enabled;

create index automation_events_company_occurred_idx
on public.automation_events(company_id, occurred_at desc);

create index automation_executions_due_idx
on public.automation_executions(scheduled_for, next_retry_at)
where status in ('queued', 'retry_scheduled');

create index automation_executions_company_status_idx
on public.automation_executions(company_id, status, created_at desc);

create index automation_attempts_company_created_idx
on public.automation_attempts(company_id, created_at desc);

create index automation_audit_events_company_created_idx
on public.automation_audit_events(company_id, created_at desc);

alter table public.office_tasks
add column company_location_id uuid,
add column automation_execution_id uuid;

update public.office_tasks as task
set company_location_id = source.company_location_id
from (
  select office_task.id, lead.company_location_id
  from public.office_tasks as office_task
  join public.leads as lead on lead.id = office_task.lead_id
  where lead.company_id = office_task.company_id

  union all

  select office_task.id, lead.company_location_id
  from public.office_tasks as office_task
  join public.inspections as inspection on inspection.id = office_task.inspection_id
  join public.leads as lead on lead.id = inspection.lead_id
  where inspection.company_id = office_task.company_id
    and lead.company_id = office_task.company_id

  union all

  select office_task.id, lead.company_location_id
  from public.office_tasks as office_task
  join public.estimates as estimate on estimate.id = office_task.estimate_id
  join public.leads as lead on lead.id = estimate.lead_id
  where estimate.company_id = office_task.company_id
    and lead.company_id = office_task.company_id

  union all

  select office_task.id, lead.company_location_id
  from public.office_tasks as office_task
  join public.jobs as job on job.id = office_task.job_id
  join public.leads as lead on lead.id = job.lead_id
  where job.company_id = office_task.company_id
    and lead.company_id = office_task.company_id
) as source
where source.id = task.id
  and source.company_location_id is not null
  and task.company_location_id is null;

alter table public.office_tasks
drop constraint office_tasks_source_type_check;

alter table public.office_tasks
add constraint office_tasks_source_type_check check (
  source_type in (
    'new_lead',
    'scheduled_inspection',
    'completed_inspection',
    'sent_estimate',
    'unsigned_estimate',
    'scheduled_job',
    'completed_job',
    'automation'
  )
) not valid;

alter table public.office_tasks
drop constraint office_tasks_source_link_check;

alter table public.office_tasks
add constraint office_tasks_source_link_check check (
  (source_type = 'new_lead' and lead_id is not null and inspection_id is null and estimate_id is null and job_id is null)
  or (source_type in ('scheduled_inspection', 'completed_inspection') and lead_id is null and inspection_id is not null and estimate_id is null and job_id is null)
  or (source_type in ('sent_estimate', 'unsigned_estimate') and lead_id is null and inspection_id is null and estimate_id is not null and job_id is null)
  or (source_type in ('scheduled_job', 'completed_job') and lead_id is null and inspection_id is null and estimate_id is null and job_id is not null)
  or (source_type = 'automation' and num_nonnulls(lead_id, inspection_id, estimate_id, job_id) <= 1)
) not valid;

alter table public.office_tasks
add constraint office_tasks_company_location_fkey
foreign key (company_location_id, company_id)
references public.company_locations(id, company_id)
on delete set null (company_location_id)
not valid;

alter table public.office_tasks
add constraint office_tasks_company_automation_execution_fkey
foreign key (company_id, automation_execution_id)
references public.automation_executions(company_id, id)
on delete set null (automation_execution_id)
not valid;

alter table public.office_tasks
add constraint office_tasks_automation_execution_key unique (automation_execution_id);

alter table public.office_tasks validate constraint office_tasks_source_type_check;
alter table public.office_tasks validate constraint office_tasks_source_link_check;
alter table public.office_tasks validate constraint office_tasks_company_location_fkey;
alter table public.office_tasks validate constraint office_tasks_company_automation_execution_fkey;

create index office_tasks_company_location_active_idx
on public.office_tasks(company_id, company_location_id, due_at)
where company_location_id is not null and status <> 'completed';

create or replace function public.wtos_reject_automation_ledger_mutation_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and not exists (
    select 1 from public.companies as company where company.id = old.company_id
  ) then
    return old;
  end if;

  raise exception 'Automation ledger rows are immutable'
    using errcode = '55000';
end;
$$;

create or replace function public.wtos_guard_automation_execution_update_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.company_id is distinct from old.company_id
    or new.company_location_id is distinct from old.company_location_id
    or new.rule_id is distinct from old.rule_id
    or new.event_id is distinct from old.event_id
    or new.rule_version is distinct from old.rule_version
    or new.action_type is distinct from old.action_type
    or new.action_config_snapshot is distinct from old.action_config_snapshot
    or new.action_input is distinct from old.action_input
    or new.idempotency_key is distinct from old.idempotency_key
    or new.created_at is distinct from old.created_at then
    raise exception 'Automation execution identity and action evidence are immutable'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create or replace function public.wtos_validate_office_task_automation_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.automation_execution_id is not null and not exists (
    select 1
    from public.automation_executions as execution
    where execution.id = new.automation_execution_id
      and execution.company_id = new.company_id
      and execution.company_location_id is not distinct from new.company_location_id
      and execution.action_type = 'create_office_task'
  ) then
    raise exception 'Office task automation execution scope does not match the task scope'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger company_locations_set_updated_at
before update on public.company_locations
for each row execute function public.set_updated_at();

create trigger automation_rules_set_updated_at
before update on public.automation_rules
for each row execute function public.set_updated_at();

create trigger automation_executions_guard_identity
before update on public.automation_executions
for each row execute function public.wtos_guard_automation_execution_update_v1();

create trigger automation_executions_delete_immutable
before delete on public.automation_executions
for each row execute function public.wtos_reject_automation_ledger_mutation_v1();

create trigger automation_executions_set_updated_at
before update on public.automation_executions
for each row execute function public.set_updated_at();

create trigger automation_events_immutable
before update or delete on public.automation_events
for each row execute function public.wtos_reject_automation_ledger_mutation_v1();

create trigger automation_attempts_immutable
before update or delete on public.automation_attempts
for each row execute function public.wtos_reject_automation_ledger_mutation_v1();

create trigger automation_audit_events_immutable
before update or delete on public.automation_audit_events
for each row execute function public.wtos_reject_automation_ledger_mutation_v1();

create trigger office_tasks_validate_automation_scope
before insert or update of company_id, company_location_id, automation_execution_id
on public.office_tasks
for each row execute function public.wtos_validate_office_task_automation_scope_v1();

alter table public.company_locations enable row level security;
alter table public.automation_rules enable row level security;
alter table public.automation_events enable row level security;
alter table public.automation_executions enable row level security;
alter table public.automation_attempts enable row level security;
alter table public.automation_audit_events enable row level security;

create policy "WTOS company members read company locations"
on public.company_locations
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS company members read automation rules"
on public.automation_rules
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS company members read automation events"
on public.automation_events
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS company members read automation executions"
on public.automation_executions
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS company members read automation attempts"
on public.automation_attempts
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS company members read automation audit events"
on public.automation_audit_events
for select
to authenticated
using (public.wtos_can_read_company(company_id));

revoke all on table
  public.company_locations,
  public.automation_rules,
  public.automation_events,
  public.automation_executions,
  public.automation_attempts,
  public.automation_audit_events
from public, anon, authenticated;

grant select on table
  public.company_locations,
  public.automation_rules,
  public.automation_events,
  public.automation_executions,
  public.automation_attempts,
  public.automation_audit_events
to authenticated;

grant all on table
  public.company_locations,
  public.automation_rules,
  public.automation_events,
  public.automation_executions,
  public.automation_attempts,
  public.automation_audit_events
to service_role;

create or replace function public.wtos_is_company_owner_or_admin_v1(
  target_company_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    target_company_id is not null
    and (select auth.uid()) is not null
    and (
      exists (
        select 1
        from public.profiles as profile
        where profile.id = (select auth.uid())
          and profile.role in ('owner', 'admin')
      )
      or exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = (select auth.uid())
          and membership.company_id = target_company_id
          and membership.role in ('owner', 'admin')
      )
    ),
    false
  );
$$;

create or replace function public.wtos_build_automation_action_input_v1(
  target_rule_id uuid,
  target_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_rule public.automation_rules%rowtype;
  selected_event public.automation_events%rowtype;
  task_due_at timestamptz;
begin
  select *
  into selected_rule
  from public.automation_rules
  where id = target_rule_id;

  select *
  into selected_event
  from public.automation_events
  where id = target_event_id;

  if selected_rule.id is null
    or selected_event.id is null
    or selected_rule.company_id <> selected_event.company_id
    or (
      selected_rule.company_location_id is not null
      and selected_rule.company_location_id is distinct from selected_event.company_location_id
    ) then
    raise exception 'Automation rule and event scope mismatch'
      using errcode = '23514';
  end if;

  if selected_rule.action_type = 'complete_office_task' then
    return jsonb_build_object(
      'automation_key',
      (selected_rule.action_config ->> 'automationKeyPrefix') || selected_event.source_id
    );
  end if;

  task_due_at := case selected_rule.action_config ->> 'dueStrategy'
    when 'next_follow_up_9am' then coalesce(
      ((selected_event.payload ->> 'next_follow_up')::date + time '09:00')
        at time zone 'America/Phoenix',
      selected_event.occurred_at
    )
    when 'scheduled_start' then coalesce(
      (selected_event.payload ->> 'scheduled_start')::timestamptz,
      selected_event.occurred_at
    )
    when 'completed_at' then coalesce(
      (selected_event.payload ->> 'completed_at')::timestamptz,
      (selected_event.payload ->> 'updated_at')::timestamptz,
      selected_event.occurred_at
    )
    when 'expiration_9am' then coalesce(
      ((selected_event.payload ->> 'expiration_date')::date + time '09:00')
        at time zone 'America/Phoenix',
      (selected_event.payload ->> 'updated_at')::timestamptz,
      selected_event.occurred_at
    )
    when 'updated_at' then coalesce(
      (selected_event.payload ->> 'updated_at')::timestamptz,
      selected_event.occurred_at
    )
    when 'schedule_start_or_end' then coalesce(
      (selected_event.payload ->> 'scheduled_start')::timestamptz,
      (selected_event.payload ->> 'scheduled_end')::timestamptz,
      (selected_event.payload ->> 'updated_at')::timestamptz,
      selected_event.occurred_at
    )
    else selected_event.occurred_at
  end;

  return jsonb_strip_nulls(jsonb_build_object(
    'automation_key',
      (selected_rule.action_config ->> 'automationKeyPrefix') || selected_event.source_id,
    'source_type', selected_rule.action_config ->> 'sourceType',
    'title', selected_rule.action_config ->> 'title',
    'notes', selected_rule.action_config ->> 'notes',
    'priority', case
      when selected_rule.action_config ->> 'sourceType' in ('new_lead', 'scheduled_inspection')
        then coalesce(selected_event.payload ->> 'priority', selected_rule.action_config ->> 'priority')
      else selected_rule.action_config ->> 'priority'
    end,
    'due_at', task_due_at,
    'customer_id', selected_event.payload ->> 'customer_id',
    'property_id', selected_event.payload ->> 'property_id',
    'employee_id', selected_event.payload ->> 'employee_id',
    'lead_id', selected_event.payload ->> 'lead_id',
    'inspection_id', selected_event.payload ->> 'inspection_id',
    'estimate_id', selected_event.payload ->> 'estimate_id',
    'job_id', selected_event.payload ->> 'job_id'
  ));
end;
$$;

create or replace function public.wtos_execute_automation_execution_v1(
  target_execution_id uuid,
  worker_now timestamptz,
  execution_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_execution public.automation_executions%rowtype;
  selected_rule public.automation_rules%rowtype;
  task_id uuid;
  current_attempt integer;
  retry_at timestamptz;
  should_retry boolean;
  execution_result jsonb;
  failure_code text;
begin
  if worker_now is null
    or length(btrim(coalesce(execution_worker_id, ''))) not between 1 and 120 then
    raise exception 'Automation worker ID is required' using errcode = '22023';
  end if;

  select *
  into selected_execution
  from public.automation_executions
  where id = target_execution_id
  for update;

  if selected_execution.id is null then
    return jsonb_build_object('status', 'missing', 'executionId', target_execution_id);
  end if;

  if selected_execution.status = 'succeeded' then
    return jsonb_build_object(
      'status', 'succeeded',
      'executionId', selected_execution.id,
      'officeTaskId', selected_execution.result ->> 'officeTaskId',
      'idempotent', true
    );
  end if;

  if selected_execution.status not in ('queued', 'retry_scheduled')
    or selected_execution.scheduled_for > worker_now
    or (
      selected_execution.status = 'retry_scheduled'
      and selected_execution.next_retry_at > worker_now
    )
    or selected_execution.approval_status not in ('not_required', 'approved') then
    return jsonb_build_object(
      'status', 'skipped',
      'executionId', selected_execution.id,
      'idempotent', true
    );
  end if;

  select *
  into selected_rule
  from public.automation_rules
  where id = selected_execution.rule_id;

  if selected_rule.id is null then
    raise exception 'Automation rule is missing' using errcode = '23503';
  end if;

  if not selected_rule.enabled
    or selected_rule.version <> selected_execution.rule_version then
    update public.automation_executions
    set
      status = 'cancelled',
      completed_at = worker_now,
      cancelled_at = worker_now,
      cancel_reason = 'Rule disabled or version changed before execution.',
      lease_token = null,
      lease_expires_at = null,
      version = version + 1
    where id = selected_execution.id;

    insert into public.automation_audit_events (
      company_id,
      company_location_id,
      rule_id,
      event_id,
      execution_id,
      audit_type,
      reason,
      metadata
    ) values (
      selected_execution.company_id,
      selected_execution.company_location_id,
      selected_execution.rule_id,
      selected_execution.event_id,
      selected_execution.id,
      'execution_cancelled',
      'Rule disabled or version changed before execution.',
      jsonb_build_object(
        'executionRuleVersion', selected_execution.rule_version,
        'currentRuleVersion', selected_rule.version,
        'ruleEnabled', selected_rule.enabled
      )
    );

    return jsonb_build_object(
      'status', 'cancelled',
      'executionId', selected_execution.id,
      'idempotent', false
    );
  end if;

  current_attempt := selected_execution.attempt_count + 1;

  update public.automation_executions
  set
    status = 'running',
    attempt_count = current_attempt,
    lease_token = gen_random_uuid(),
    lease_expires_at = worker_now + interval '60 seconds',
    worker_id = execution_worker_id,
    started_at = coalesce(started_at, worker_now),
    next_retry_at = null,
    version = version + 1
  where id = selected_execution.id;

  insert into public.automation_audit_events (
    company_id,
    company_location_id,
    rule_id,
    event_id,
    execution_id,
    audit_type,
    metadata
  ) values (
    selected_execution.company_id,
    selected_execution.company_location_id,
    selected_execution.rule_id,
    selected_execution.event_id,
    selected_execution.id,
    'execution_started',
    jsonb_build_object('attemptNumber', current_attempt, 'workerId', execution_worker_id)
  );

  begin
    if selected_execution.action_type = 'create_office_task' then
      insert into public.office_tasks (
        company_id,
        company_location_id,
        automation_execution_id,
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
      ) values (
        selected_execution.company_id,
        selected_execution.company_location_id,
        selected_execution.id,
        nullif(selected_execution.action_input ->> 'customer_id', '')::uuid,
        nullif(selected_execution.action_input ->> 'property_id', '')::uuid,
        nullif(selected_execution.action_input ->> 'employee_id', '')::uuid,
        nullif(selected_execution.action_input ->> 'lead_id', '')::uuid,
        nullif(selected_execution.action_input ->> 'inspection_id', '')::uuid,
        nullif(selected_execution.action_input ->> 'estimate_id', '')::uuid,
        nullif(selected_execution.action_input ->> 'job_id', '')::uuid,
        selected_execution.action_input ->> 'source_type',
        selected_execution.action_input ->> 'automation_key',
        selected_execution.action_input ->> 'title',
        nullif(selected_execution.action_input ->> 'notes', ''),
        selected_execution.action_input ->> 'priority',
        (selected_execution.action_input ->> 'due_at')::timestamptz
      )
      on conflict (company_id, automation_key) do nothing
      returning id into task_id;

      if task_id is null then
        select office_task.id
        into task_id
        from public.office_tasks as office_task
        where office_task.company_id = selected_execution.company_id
          and office_task.automation_key = selected_execution.action_input ->> 'automation_key';

        update public.office_tasks
        set
          automation_execution_id = selected_execution.id,
          company_location_id = selected_execution.company_location_id
        where id = task_id
          and automation_execution_id is null;
      end if;

      if task_id is null then
        raise exception 'Office task action did not resolve an idempotent task'
          using errcode = 'P0001';
      end if;

      execution_result := jsonb_build_object(
        'officeTaskId', task_id,
        'action', 'create_office_task'
      );
    elsif selected_execution.action_type = 'complete_office_task' then
      select office_task.id
      into task_id
      from public.office_tasks as office_task
      where office_task.company_id = selected_execution.company_id
        and office_task.automation_key = selected_execution.action_input ->> 'automation_key';

      if task_id is not null then
        update public.office_tasks
        set status = 'completed'
        where id = task_id
          and status <> 'completed';
      end if;

      execution_result := jsonb_strip_nulls(jsonb_build_object(
        'officeTaskId', task_id,
        'action', 'complete_office_task'
      ));
    else
      raise exception 'Automation action type is not executable'
        using errcode = '0A000';
    end if;

    insert into public.automation_attempts (
      company_id,
      company_location_id,
      execution_id,
      attempt_number,
      status,
      worker_id,
      started_at,
      completed_at,
      result
    ) values (
      selected_execution.company_id,
      selected_execution.company_location_id,
      selected_execution.id,
      current_attempt,
      'succeeded',
      execution_worker_id,
      worker_now,
      clock_timestamp(),
      execution_result
    );

    update public.automation_executions
    set
      status = 'succeeded',
      completed_at = clock_timestamp(),
      lease_token = null,
      lease_expires_at = null,
      next_retry_at = null,
      last_error_code = null,
      last_error_message = null,
      result = execution_result,
      version = version + 1
    where id = selected_execution.id;

    insert into public.automation_audit_events (
      company_id,
      company_location_id,
      rule_id,
      event_id,
      execution_id,
      audit_type,
      metadata
    ) values (
      selected_execution.company_id,
      selected_execution.company_location_id,
      selected_execution.rule_id,
      selected_execution.event_id,
      selected_execution.id,
      'execution_succeeded',
      jsonb_build_object('attemptNumber', current_attempt, 'result', execution_result)
    );

    return jsonb_build_object(
      'status', 'succeeded',
      'executionId', selected_execution.id,
      'officeTaskId', task_id,
      'idempotent', false
    );
  exception when others then
    failure_code := sqlstate;
    should_retry := current_attempt < selected_execution.max_attempts;
    retry_at := case
      when should_retry then worker_now + make_interval(
        secs => least(
          selected_rule.retry_backoff_seconds
            * power(2, greatest(current_attempt - 1, 0))::integer,
          86400
        )
      )
      else null
    end;

    insert into public.automation_attempts (
      company_id,
      company_location_id,
      execution_id,
      attempt_number,
      status,
      worker_id,
      started_at,
      completed_at,
      retryable,
      next_retry_at,
      error_code,
      error_message
    ) values (
      selected_execution.company_id,
      selected_execution.company_location_id,
      selected_execution.id,
      current_attempt,
      'failed',
      execution_worker_id,
      worker_now,
      clock_timestamp(),
      should_retry,
      retry_at,
      failure_code,
      'Automation action failed safely.'
    );

    update public.automation_executions
    set
      status = case when should_retry then 'retry_scheduled' else 'failed' end,
      completed_at = case when should_retry then null else clock_timestamp() end,
      next_retry_at = retry_at,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = failure_code,
      last_error_message = 'Automation action failed safely.',
      version = version + 1
    where id = selected_execution.id;

    insert into public.automation_audit_events (
      company_id,
      company_location_id,
      rule_id,
      event_id,
      execution_id,
      audit_type,
      reason,
      metadata
    ) values (
      selected_execution.company_id,
      selected_execution.company_location_id,
      selected_execution.rule_id,
      selected_execution.event_id,
      selected_execution.id,
      case when should_retry then 'execution_retry_scheduled' else 'execution_failed' end,
      'Automation action failed safely.',
      jsonb_strip_nulls(jsonb_build_object(
        'attemptNumber', current_attempt,
        'errorCode', failure_code,
        'nextRetryAt', retry_at
      ))
    );

    return jsonb_strip_nulls(jsonb_build_object(
      'status', case when should_retry then 'retry_scheduled' else 'failed' end,
      'executionId', selected_execution.id,
      'errorCode', failure_code,
      'nextRetryAt', retry_at,
      'idempotent', false
    ));
  end;
end;
$$;

create or replace function public.wtos_emit_automation_event_v1(
  event_company_id uuid,
  event_company_location_id uuid,
  automation_event_type text,
  event_source_table text,
  event_source_id text,
  event_source_version text,
  event_payload jsonb,
  event_occurred_at timestamptz,
  event_actor_user_id uuid,
  event_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_event_id uuid;
  existing_event_id uuid;
  selected_rule public.automation_rules%rowtype;
  inserted_execution_id uuid;
  execution_status text;
  execution_approval_status text;
  execution_scheduled_for timestamptz;
  built_action_input jsonb;
begin
  if event_company_id is null
    or length(btrim(coalesce(event_source_id, ''))) not between 1 and 160
    or length(btrim(coalesce(event_source_version, ''))) not between 1 and 160
    or length(btrim(coalesce(event_idempotency_key, ''))) not between 1 and 240
    or jsonb_typeof(event_payload) <> 'object' then
    raise exception 'Automation event input is invalid' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.companies where id = event_company_id
  ) then
    raise exception 'Automation event company does not exist' using errcode = '23503';
  end if;

  if event_company_location_id is not null and not exists (
    select 1
    from public.company_locations as location
    where location.id = event_company_location_id
      and location.company_id = event_company_id
      and location.is_active
  ) then
    raise exception 'Automation event location does not belong to its company'
      using errcode = '23514';
  end if;

  insert into public.automation_events (
    company_id,
    company_location_id,
    event_type,
    source_table,
    source_id,
    source_version,
    actor_user_id,
    idempotency_key,
    payload,
    occurred_at
  ) values (
    event_company_id,
    event_company_location_id,
    automation_event_type,
    event_source_table,
    event_source_id,
    event_source_version,
    event_actor_user_id,
    event_idempotency_key,
    event_payload,
    coalesce(event_occurred_at, now())
  )
  on conflict (company_id, idempotency_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    select id
    into existing_event_id
    from public.automation_events
    where company_id = event_company_id
      and idempotency_key = event_idempotency_key;

    return existing_event_id;
  end if;

  insert into public.automation_audit_events (
    company_id,
    company_location_id,
    event_id,
    actor_user_id,
    audit_type,
    metadata
  ) values (
    event_company_id,
    event_company_location_id,
    inserted_event_id,
    event_actor_user_id,
    'event_recorded',
    jsonb_build_object('eventType', automation_event_type, 'sourceTable', event_source_table)
  );

  for selected_rule in
    select rule.*
    from public.automation_rules as rule
    where rule.company_id = event_company_id
      and rule.trigger_type = automation_event_type
      and rule.enabled
      and (
        rule.company_location_id is null
        or rule.company_location_id = event_company_location_id
      )
      and public.wtos_automation_conditions_match_v1(rule.conditions, event_payload)
    order by rule.rule_key
  loop
    built_action_input := public.wtos_build_automation_action_input_v1(
      selected_rule.id,
      inserted_event_id
    );
    execution_scheduled_for := coalesce(event_occurred_at, now())
      + make_interval(secs => selected_rule.delay_seconds);
    execution_status := case
      when selected_rule.approval_policy = 'manual' then 'awaiting_approval'
      else 'queued'
    end;
    execution_approval_status := case
      when selected_rule.approval_policy = 'manual' then 'pending'
      else 'not_required'
    end;

    insert into public.automation_executions (
      company_id,
      company_location_id,
      rule_id,
      event_id,
      rule_version,
      action_type,
      action_config_snapshot,
      action_input,
      status,
      approval_status,
      scheduled_for,
      max_attempts,
      idempotency_key
    ) values (
      event_company_id,
      event_company_location_id,
      selected_rule.id,
      inserted_event_id,
      selected_rule.version,
      selected_rule.action_type,
      selected_rule.action_config,
      built_action_input,
      execution_status,
      execution_approval_status,
      execution_scheduled_for,
      selected_rule.max_attempts,
      'event:' || inserted_event_id::text || ':rule:' || selected_rule.id::text
        || ':v' || selected_rule.version::text
    )
    on conflict (event_id, rule_id, rule_version) do nothing
    returning id into inserted_execution_id;

    if inserted_execution_id is not null then
      insert into public.automation_audit_events (
        company_id,
        company_location_id,
        rule_id,
        event_id,
        execution_id,
        audit_type,
        metadata
      ) values (
        event_company_id,
        event_company_location_id,
        selected_rule.id,
        inserted_event_id,
        inserted_execution_id,
        'execution_enqueued',
        jsonb_build_object(
          'status', execution_status,
          'approvalStatus', execution_approval_status,
          'scheduledFor', execution_scheduled_for
        )
      );

      if execution_status = 'queued' and execution_scheduled_for <= now() then
        perform public.wtos_execute_automation_execution_v1(
          inserted_execution_id,
          now(),
          'database-trigger-v1'
        );
      end if;
    end if;

    inserted_execution_id := null;
  end loop;

  return inserted_event_id;
end;
$$;

create or replace function public.wtos_emit_lead_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
  resolved_location_id uuid;
  intake_id uuid;
  intake_provider text;
  intake_branch_key text;
begin
  if tg_op = 'UPDATE'
    and row(new.status, new.next_follow_up)
      is not distinct from row(old.status, old.next_follow_up) then
    return new;
  end if;

  select lead.company_location_id
  into resolved_location_id
  from public.leads as lead
  where lead.id = new.id
    and lead.company_id = new.company_id;

  select
    intake.id,
    coalesce(resolved_location_id, intake.company_location_id),
    intake.provider,
    intake.branch_key
  into intake_id, resolved_location_id, intake_provider, intake_branch_key
  from public.lead_intake_records as intake
  where intake.linked_lead_id = new.id
    and intake.company_id = new.company_id
    and intake.status = 'lead_created'
  order by intake.created_at desc
  limit 1;

  resolved_location_id := coalesce(resolved_location_id, new.company_location_id);
  event_type := case when tg_op = 'INSERT' then 'lead.created' else 'lead.updated' end;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
    'next_follow_up', new.next_follow_up,
    'priority', new.priority,
    'source', new.source,
    'provider', intake_provider,
    'branch_key', intake_branch_key,
    'updated_at', new.updated_at,
    'customer_id', new.customer_id,
    'property_id', new.property_id,
    'lead_id', new.id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    resolved_location_id,
    event_type,
    'leads',
    new.id::text,
    payload_fingerprint,
    event_payload,
    coalesce(new.updated_at, new.created_at, now()),
    (select auth.uid()),
    'crm:' || event_type || ':' || new.id::text || ':' || payload_fingerprint
  );

  if intake_id is not null and intake_provider in ('website', 'yelp') then
    perform public.wtos_emit_automation_event_v1(
      new.company_id,
      resolved_location_id,
      case when intake_provider = 'website' then 'website.lead.created' else 'yelp.lead.created' end,
      'leads',
      new.id::text,
      intake_id::text,
      event_payload,
      coalesce(new.created_at, now()),
      (select auth.uid()),
      'intake:' || intake_id::text || ':' || intake_provider || '.lead.created'
    );
  end if;

  return new;
end;
$$;

create or replace function public.wtos_assign_lead_intake_location_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_location_key text;
begin
  if new.company_id is null or new.branch_key = 'unassigned' then
    new.company_location_id := null;
    return new;
  end if;

  expected_location_key := case new.branch_key
    when 'weathertech_phoenix' then 'weathertech_phoenix'
    when 'weathertech_tucson' then 'weathertech_tucson'
    when 'ihc' then 'ihc'
    else null
  end;

  if expected_location_key is null then
    new.company_location_id := null;
    return new;
  end if;

  select location.id
  into new.company_location_id
  from public.company_locations as location
  where location.company_id = new.company_id
    and location.location_key = expected_location_key
    and location.is_active;

  if new.company_location_id is null then
    raise exception 'Lead intake branch is not valid for the selected company'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.wtos_propagate_lead_intake_location_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linked_lead_id is not null and new.company_location_id is not null then
    update public.leads
    set company_location_id = new.company_location_id
    where id = new.linked_lead_id
      and company_id = new.company_id
      and company_location_id is distinct from new.company_location_id;
  end if;

  return new;
end;
$$;

create or replace function public.wtos_emit_inspection_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
  location_id uuid;
begin
  if tg_op = 'UPDATE'
    and row(new.status, new.scheduled_start, new.completed_at, new.estimate_id)
      is not distinct from row(old.status, old.scheduled_start, old.completed_at, old.estimate_id) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  event_type := case
    when new.status = 'completed' then 'inspection.completed'
    when new.status = 'scheduled' and new.scheduled_start is not null then 'inspection.scheduled'
    when tg_op = 'INSERT' then 'inspection.created'
    else 'inspection.updated'
  end;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
    'scheduled_start', new.scheduled_start,
    'completed_at', new.completed_at,
    'priority', new.priority,
    'estimate_id', new.estimate_id,
    'updated_at', new.updated_at,
    'customer_id', new.customer_id,
    'property_id', new.property_id,
    'employee_id', new.employee_id,
    'inspection_id', new.id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    event_type,
    'inspections',
    new.id::text,
    payload_fingerprint,
    event_payload,
    coalesce(new.updated_at, new.created_at, now()),
    (select auth.uid()),
    'crm:' || event_type || ':' || new.id::text || ':' || payload_fingerprint
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_estimate_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
  location_id uuid;
  signature_status text;
  has_scheduled_job boolean;
begin
  if tg_op = 'UPDATE'
    and row(new.status, new.expiration_date)
      is not distinct from row(old.status, old.expiration_date) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  signature_status := case when exists (
    select 1
    from public.estimate_proposal_acceptances as acceptance
    where acceptance.estimate_id = new.id
      and acceptance.signature_status = 'signed'
  ) then 'signed' else 'unsigned' end;

  has_scheduled_job := exists (
    select 1
    from public.jobs as job
    where job.company_id = new.company_id
      and job.estimate_id = new.id
      and (job.scheduled_start is not null or job.scheduled_end is not null)
      and job.status not in ('cancelled', 'canceled')
  );

  event_type := case
    when new.status = 'sent' then 'estimate.sent'
    when new.status = 'approved' then 'estimate.approved'
    when tg_op = 'INSERT' then 'estimate.created'
    else 'estimate.updated'
  end;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
    'expiration_date', new.expiration_date,
    'signature_status', signature_status,
    'has_scheduled_job', has_scheduled_job,
    'updated_at', new.updated_at,
    'customer_id', new.customer_id,
    'property_id', new.property_id,
    'estimate_id', new.id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    event_type,
    'estimates',
    new.id::text,
    payload_fingerprint,
    event_payload,
    coalesce(new.updated_at, new.created_at, now()),
    (select auth.uid()),
    'crm:' || event_type || ':' || new.id::text || ':' || payload_fingerprint
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_job_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
  location_id uuid;
  assigned_employee_id uuid;
begin
  if tg_op = 'UPDATE'
    and row(new.status, new.scheduled_start, new.scheduled_end)
      is not distinct from row(old.status, old.scheduled_start, old.scheduled_end) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  select assignment.employee_id
  into assigned_employee_id
  from public.job_assignments as assignment
  where assignment.job_id = new.id
    and assignment.status in ('assigned', 'accepted')
  order by assignment.created_at desc
  limit 1;

  if new.status = 'completed' then
    event_type := 'job.completed';
  elsif tg_op = 'INSERT' then
    event_type := case
      when (new.scheduled_start is not null or new.scheduled_end is not null)
        and new.status not in ('in_progress', 'completed', 'cancelled', 'canceled', 'closed')
        then 'job.scheduled'
      else 'job.created'
    end;
  elsif (new.scheduled_start is not null or new.scheduled_end is not null)
    and new.status not in ('in_progress', 'completed', 'cancelled', 'canceled', 'closed')
    and (
      new.scheduled_start is distinct from old.scheduled_start
      or new.scheduled_end is distinct from old.scheduled_end
    ) then
    event_type := 'job.scheduled';
  else
    event_type := 'job.updated';
  end if;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
    'scheduled_start', new.scheduled_start,
    'scheduled_end', new.scheduled_end,
    'has_schedule', new.scheduled_start is not null or new.scheduled_end is not null,
    'updated_at', new.updated_at,
    'customer_id', new.customer_id,
    'property_id', new.property_id,
    'employee_id', assigned_employee_id,
    'job_id', new.id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    event_type,
    'jobs',
    new.id::text,
    payload_fingerprint,
    event_payload,
    coalesce(new.updated_at, new.created_at, now()),
    (select auth.uid()),
    'crm:' || event_type || ':' || new.id::text || ':' || payload_fingerprint
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_customer_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  event_type := case when tg_op = 'INSERT' then 'customer.created' else 'customer.updated' end;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
    'updated_at', new.updated_at,
    'customer_id', new.id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    null,
    event_type,
    'customers',
    new.id::text,
    payload_fingerprint,
    event_payload,
    coalesce(new.updated_at, new.created_at, now()),
    (select auth.uid()),
    'crm:' || event_type || ':' || new.id::text || ':' || payload_fingerprint
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_invoice_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
  location_id uuid;
begin
  if tg_op = 'UPDATE'
    and row(new.status, new.due_date, new.balance_due)
      is not distinct from row(old.status, old.due_date, old.balance_due) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = coalesce(
    (select job.lead_id from public.jobs as job where job.id = new.job_id),
    (select estimate.lead_id from public.estimates as estimate where estimate.id = new.estimate_id)
  )
    and lead.company_id = new.company_id;

  event_type := case
    when new.status = 'paid' then 'invoice.paid'
    when tg_op = 'INSERT' then 'invoice.created'
    else 'invoice.updated'
  end;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'status', new.status,
    'previous_status', case when tg_op = 'UPDATE' then old.status else null end,
    'updated_at', new.updated_at,
    'customer_id', new.customer_id,
    'property_id', new.property_id,
    'job_id', new.job_id,
    'estimate_id', new.estimate_id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(event_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    event_type,
    'invoices',
    new.id::text,
    payload_fingerprint,
    event_payload,
    coalesce(new.updated_at, new.created_at, now()),
    (select auth.uid()),
    'crm:' || event_type || ':' || new.id::text || ':' || payload_fingerprint
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_inbound_communication_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_id uuid;
  route_location_key text;
  safe_payload jsonb;
  payload_fingerprint text;
begin
  if new.company_id is null
    or new.direction <> 'inbound'
    or new.event_type <> 'sms_inbound'
    or new.routing_status <> 'matched'
    or new.business_phone_number_id is null
    or not exists (
      select 1
      from public.business_phone_numbers as route
      where route.id = new.business_phone_number_id
        and route.company_id = new.company_id
        and route.routing_status = 'active'
    ) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  if location_id is null then
    select case route.routing_key
      when 'weathertech-phoenix' then 'weathertech_phoenix'
      when 'weathertech-tucson' then 'weathertech_tucson'
      when 'ihc-primary' then 'ihc'
      else null
    end
    into route_location_key
    from public.business_phone_numbers as route
    where route.id = new.business_phone_number_id
      and route.company_id = new.company_id;

    select location.id
    into location_id
    from public.company_locations as location
    where location.company_id = new.company_id
      and location.location_key = route_location_key
      and location.is_active;
  end if;

  safe_payload := jsonb_strip_nulls(jsonb_build_object(
    'provider', new.provider,
    'channel', new.channel,
    'direction', new.direction,
    'status', new.status,
    'routing_status', new.routing_status,
    'customer_id', new.customer_id,
    'lead_id', new.lead_id,
    'job_id', new.job_id,
    'business_phone_number_id', new.business_phone_number_id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(safe_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    'communication.received',
    'communication_provider_events',
    new.id::text,
    pg_catalog.encode(extensions.digest(
      coalesce(nullif(new.provider_event_sid, ''), nullif(new.request_fingerprint, ''), new.id::text),
      'sha256'
    ), 'hex'),
    safe_payload,
    coalesce(new.occurred_at, new.received_at, now()),
    null,
    'communication-provider-event:' || new.id::text
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_inbound_email_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_id uuid;
  safe_payload jsonb;
  payload_fingerprint text;
begin
  if new.direction <> 'inbound'
    or new.gmail_message_id is null
    or new.sync_status not in ('imported', 'synced')
    or new.integration_connection_id is null
    or not exists (
      select 1
      from public.integration_connections as connection
      where connection.id = new.integration_connection_id
        and connection.company_id = new.company_id
        and connection.provider = 'gmail'
    ) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  safe_payload := jsonb_strip_nulls(jsonb_build_object(
    'provider', new.provider,
    'channel', 'email',
    'direction', new.direction,
    'status', new.status,
    'sync_status', new.sync_status,
    'category', new.category,
    'customer_id', new.customer_id,
    'lead_id', new.lead_id,
    'job_id', new.job_id,
    'estimate_id', new.estimate_id,
    'invoice_id', new.invoice_id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(safe_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    'communication.received',
    'email_messages',
    new.id::text,
    pg_catalog.encode(extensions.digest(new.gmail_message_id, 'sha256'), 'hex'),
    safe_payload,
    coalesce(new.received_at, new.created_at, now()),
    null,
    'email-message:' || new.id::text || ':' || payload_fingerprint
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_missed_call_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_id uuid;
  route_location_key text;
  safe_payload jsonb;
  payload_fingerprint text;
begin
  if new.company_id is null
    or new.direction <> 'inbound'
    or new.call_status <> 'missed'
    or new.routing_status <> 'matched'
    or new.business_phone_number_id is null
    or (tg_op = 'UPDATE' and old.call_status = 'missed')
    or not exists (
      select 1
      from public.business_phone_numbers as route
      where route.id = new.business_phone_number_id
        and route.company_id = new.company_id
        and route.routing_status = 'active'
    ) then
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  if location_id is null then
    select case route.routing_key
      when 'weathertech-phoenix' then 'weathertech_phoenix'
      when 'weathertech-tucson' then 'weathertech_tucson'
      when 'ihc-primary' then 'ihc'
      else null
    end
    into route_location_key
    from public.business_phone_numbers as route
    where route.id = new.business_phone_number_id
      and route.company_id = new.company_id;

    select location.id
    into location_id
    from public.company_locations as location
    where location.company_id = new.company_id
      and location.location_key = route_location_key
      and location.is_active;
  end if;

  safe_payload := jsonb_strip_nulls(jsonb_build_object(
    'provider', new.provider,
    'direction', new.direction,
    'status', new.call_status,
    'routing_status', new.routing_status,
    'customer_id', new.customer_id,
    'lead_id', new.lead_id,
    'job_id', new.job_id,
    'business_phone_number_id', new.business_phone_number_id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(safe_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    'missed_call.received',
    'call_records',
    new.id::text,
    pg_catalog.encode(extensions.digest(coalesce(nullif(new.provider_call_sid, ''), new.id::text), 'sha256'), 'hex'),
    safe_payload,
    coalesce(new.ended_at, new.updated_at, now()),
    null,
    'missed-call:' || new.id::text
  );

  return new;
end;
$$;

-- Real cutover: the old functions remain for migration history compatibility,
-- but these four direct side-effect triggers are replaced atomically. Rule
-- disable now truthfully stops the corresponding task automation.
drop trigger if exists leads_generate_office_tasks on public.leads;
drop trigger if exists inspections_generate_office_tasks on public.inspections;
drop trigger if exists estimates_generate_office_tasks on public.estimates;
drop trigger if exists jobs_generate_office_tasks on public.jobs;

create constraint trigger leads_emit_automation_event
after insert or update on public.leads
deferrable initially deferred
for each row execute function public.wtos_emit_lead_automation_event_v1();

create trigger lead_intake_records_assign_automation_location
before insert or update of company_id, branch_key on public.lead_intake_records
for each row execute function public.wtos_assign_lead_intake_location_v1();

create trigger lead_intake_records_propagate_automation_location
after insert or update of company_id, branch_key, linked_lead_id on public.lead_intake_records
for each row execute function public.wtos_propagate_lead_intake_location_v1();

create trigger inspections_emit_automation_event
after insert or update of status, scheduled_start, completed_at, estimate_id on public.inspections
for each row execute function public.wtos_emit_inspection_automation_event_v1();

create trigger estimates_emit_automation_event
after insert or update of status, expiration_date on public.estimates
for each row execute function public.wtos_emit_estimate_automation_event_v1();

create trigger jobs_emit_automation_event
after insert or update of status, scheduled_start, scheduled_end on public.jobs
for each row execute function public.wtos_emit_job_automation_event_v1();

create trigger customers_emit_automation_event
after insert or update of status on public.customers
for each row execute function public.wtos_emit_customer_automation_event_v1();

create trigger invoices_emit_automation_event
after insert or update of status, due_date, balance_due on public.invoices
for each row execute function public.wtos_emit_invoice_automation_event_v1();

create trigger communication_provider_events_emit_inbound_automation
after insert on public.communication_provider_events
for each row execute function public.wtos_emit_inbound_communication_event_v1();

create trigger email_messages_emit_inbound_automation
after insert on public.email_messages
for each row execute function public.wtos_emit_inbound_email_event_v1();

create trigger call_records_emit_missed_automation
after insert or update of call_status on public.call_records
for each row execute function public.wtos_emit_missed_call_event_v1();

-- Enabled rules below are exact replacements for the seven owner-approved
-- internal office-task workflows from migration 0034. Disabled templates are
-- visible control-center starting points only; they cannot send to a customer.
with starter_rules (
  rule_key,
  name,
  description,
  trigger_type,
  conditions,
  action_type,
  action_config,
  enabled,
  approval_policy
) as (
  values
    (
      'office:new-lead:create',
      'New lead qualification task',
      'Creates the existing internal qualification task for a newly created lead.',
      'lead.created',
      '{"all":[{"field":"status","operator":"eq","value":"new"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"new_lead","automationKeyPrefix":"new_lead:","title":"Qualify new lead and set next action","notes":"Contact the lead, confirm the property, and schedule the inspection.","priority":"normal","dueStrategy":"next_follow_up_9am"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:new-lead:create-on-reopen',
      'Reopened new lead qualification task',
      'Preserves the prior idempotent behavior when a lead returns to new status.',
      'lead.updated',
      '{"all":[{"field":"status","operator":"eq","value":"new"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"new_lead","automationKeyPrefix":"new_lead:","title":"Qualify new lead and set next action","notes":"Contact the lead, confirm the property, and schedule the inspection.","priority":"normal","dueStrategy":"next_follow_up_9am"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:new-lead:complete',
      'Complete new lead qualification task',
      'Completes the internal qualification task after the lead leaves new status.',
      'lead.updated',
      '{"all":[{"field":"status","operator":"neq","value":"new"}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"new_lead:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:scheduled-inspection:create',
      'Scheduled inspection confirmation task',
      'Creates the existing internal inspection confirmation task.',
      'inspection.scheduled',
      '{"all":[{"field":"status","operator":"eq","value":"scheduled"},{"field":"scheduled_start","operator":"not_null"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"scheduled_inspection","automationKeyPrefix":"scheduled_inspection:","title":"Confirm scheduled inspection","notes":"Confirm the appointment details, property access, and assigned inspector.","priority":"high","dueStrategy":"scheduled_start"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:scheduled-inspection:complete-on-update',
      'Complete scheduled inspection task after cancellation',
      'Completes inspection confirmation work for canceled or no-work inspections.',
      'inspection.updated',
      '{"all":[{"field":"status","operator":"in","value":["canceled","no_work_needed"]}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"scheduled_inspection:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:scheduled-inspection:complete-on-finish',
      'Complete scheduled inspection task after completion',
      'Completes inspection confirmation work when the inspection finishes.',
      'inspection.completed',
      '{"all":[]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"scheduled_inspection:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:completed-inspection:create',
      'Completed inspection estimate task',
      'Creates the existing internal estimate-or-closeout task after inspection.',
      'inspection.completed',
      '{"all":[{"field":"estimate_id","operator":"is_null"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"completed_inspection","automationKeyPrefix":"completed_inspection:","title":"Create estimate or close out inspection","notes":"Review findings and create the estimate, follow-up, or no-work closeout.","priority":"high","dueStrategy":"completed_at"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:completed-inspection:complete',
      'Complete inspection estimate task',
      'Completes estimate-or-closeout work when an estimate is linked.',
      'inspection.completed',
      '{"all":[{"field":"estimate_id","operator":"not_null"}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"completed_inspection:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:sent-estimate:create',
      'Sent estimate delivery task',
      'Creates the existing internal sent-estimate delivery confirmation task.',
      'estimate.sent',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"sent_estimate","automationKeyPrefix":"sent_estimate:","title":"Confirm sent estimate delivery","notes":"Confirm the customer received the estimate and record the next follow-up.","priority":"normal","dueStrategy":"updated_at"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:unsigned-estimate:create',
      'Unsigned estimate follow-up task',
      'Creates the existing internal unsigned-estimate follow-up task.',
      'estimate.sent',
      '{"all":[{"field":"signature_status","operator":"neq","value":"signed"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"unsigned_estimate","automationKeyPrefix":"unsigned_estimate:","title":"Follow up on unsigned estimate","notes":"Contact the customer for a decision and record approval, decline, or signature status.","priority":"high","dueStrategy":"expiration_9am"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:sent-estimate:complete',
      'Complete sent estimate delivery task',
      'Completes sent-estimate delivery work after the estimate leaves sent status.',
      'estimate.updated',
      '{"all":[{"field":"status","operator":"neq","value":"sent"}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"sent_estimate:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:unsigned-estimate:complete',
      'Complete unsigned estimate task',
      'Completes unsigned-estimate follow-up after the estimate leaves sent status.',
      'estimate.updated',
      '{"all":[{"field":"status","operator":"neq","value":"sent"}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"unsigned_estimate:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:sent-estimate:complete-on-approval',
      'Complete sent estimate task on approval',
      'Completes sent-estimate delivery work on the semantic approval event.',
      'estimate.approved',
      '{"all":[]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"sent_estimate:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:unsigned-estimate:complete-on-approval',
      'Complete unsigned estimate task on approval',
      'Completes unsigned-estimate work on the semantic approval event.',
      'estimate.approved',
      '{"all":[]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"unsigned_estimate:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:approved-estimate:schedule-handoff',
      'Approved estimate scheduling handoff',
      'Creates an internal operations task when an approved estimate does not yet have a scheduled job.',
      'estimate.approved',
      '{"all":[{"field":"has_scheduled_job","operator":"falsy"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"approved_estimate_schedule:","title":"Schedule approved estimate and create production handoff","notes":"Create or confirm the production job, schedule dates, ownership, and material readiness for this approved estimate.","priority":"high","dueStrategy":"event_time"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:scheduled-job:create',
      'Scheduled job readiness task',
      'Creates the existing internal production schedule and crew task.',
      'job.scheduled',
      '{"all":[{"field":"has_schedule","operator":"truthy"}]}'::jsonb,
      'create_office_task',
      '{"sourceType":"scheduled_job","automationKeyPrefix":"scheduled_job:","title":"Confirm production schedule and crew","notes":"Confirm production dates, crew assignment, access, and material readiness.","priority":"high","dueStrategy":"schedule_start_or_end"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:scheduled-job:complete-on-progress',
      'Complete scheduled job task on progress',
      'Completes production scheduling work when a job starts or closes.',
      'job.updated',
      '{"all":[{"field":"status","operator":"in","value":["in_progress","cancelled","canceled","closed"]}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"scheduled_job:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:scheduled-job:complete-on-finish',
      'Complete scheduled job task on completion',
      'Completes production scheduling work on the semantic job completion event.',
      'job.completed',
      '{"all":[]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"scheduled_job:"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:completed-job:create',
      'Completed job closeout task',
      'Creates the existing internal job closeout and warranty task.',
      'job.completed',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"completed_job","automationKeyPrefix":"completed_job:","title":"Complete job closeout and start warranty","notes":"Create the final invoice, complete closeout documents, and start warranty tracking.","priority":"high","dueStrategy":"updated_at"}'::jsonb,
      true,
      'none'
    ),
    (
      'office:completed-job:complete',
      'Complete job closeout task',
      'Completes job closeout work when the job is closed.',
      'job.updated',
      '{"all":[{"field":"status","operator":"eq","value":"closed"}]}'::jsonb,
      'complete_office_task',
      '{"automationKeyPrefix":"completed_job:"}'::jsonb,
      true,
      'none'
    ),
    (
      'ai:reviewed-follow-up',
      'Reviewed AI follow-up task',
      'System rule used only after an action-capable user explicitly approves an AI follow-up preview.',
      'ai.action.approved',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"ai-follow-up:","title":"Review approved AI follow-up","notes":"Review the approved AI follow-up recommendation in WeatherTech OS.","priority":"normal","dueStrategy":"event_time"}'::jsonb,
      true,
      'manual'
    ),
    (
      'template:website-lead-owner-review',
      'Website lead owner review template',
      'Disabled template for an internal website-lead review task. It cannot send a message.',
      'website.lead.created',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"template_website_review:","title":"Review website lead follow-up","notes":"Review the website lead and prepare the next approved internal action.","priority":"normal","dueStrategy":"event_time"}'::jsonb,
      false,
      'manual'
    ),
    (
      'template:yelp-lead-owner-review',
      'Yelp lead owner review template',
      'Disabled template for an internal Yelp-lead review task. It cannot send a message.',
      'yelp.lead.created',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"template_yelp_review:","title":"Review Yelp lead follow-up","notes":"Review the Yelp lead and prepare the next approved internal action.","priority":"normal","dueStrategy":"event_time"}'::jsonb,
      false,
      'manual'
    ),
    (
      'template:missed-call-owner-review',
      'Missed call owner review template',
      'Disabled template for an internal missed-call task. It cannot place a call or send a message.',
      'missed_call.received',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"template_missed_call:","title":"Review missed inbound call","notes":"Review the verified inbound call record and choose the next approved action.","priority":"high","dueStrategy":"event_time"}'::jsonb,
      false,
      'manual'
    ),
    (
      'template:completed-job-review-request',
      'Completed job review-request preparation template',
      'Disabled customer-gated template that creates only an internal preparation task; it never sends.',
      'job.completed',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"template_review_request:","title":"Prepare review request draft","notes":"Prepare a customer review-request draft for separate human approval. Do not send automatically.","priority":"normal","dueStrategy":"updated_at"}'::jsonb,
      false,
      'manual'
    ),
    (
      'template:due-task-owner-review',
      'Due office task owner review template',
      'Disabled template for one internal review task when a non-automation office task becomes due.',
      'task.due',
      '{"all":[]}'::jsonb,
      'create_office_task',
      '{"sourceType":"automation","automationKeyPrefix":"template_due_task:","title":"Review overdue office task","notes":"Review the original overdue office task and choose the next approved internal action.","priority":"normal","dueStrategy":"event_time"}'::jsonb,
      false,
      'manual'
    )
)
insert into public.automation_rules (
  company_id,
  rule_key,
  name,
  description,
  trigger_type,
  conditions,
  action_type,
  action_config,
  enabled,
  approval_policy,
  enabled_at,
  disabled_at,
  disable_reason
)
select
  company.id,
  starter.rule_key,
  starter.name,
  starter.description,
  starter.trigger_type,
  starter.conditions,
  starter.action_type,
  starter.action_config,
  starter.enabled,
  starter.approval_policy,
  case when starter.enabled then now() else null end,
  case when starter.enabled then null else now() end,
  case when starter.enabled then null else 'Starter template disabled by default.' end
from public.companies as company
cross join starter_rules as starter
on conflict (company_id, rule_key) do nothing;

insert into public.automation_audit_events (
  company_id,
  company_location_id,
  rule_id,
  audit_type,
  reason,
  metadata
)
select
  rule.company_id,
  rule.company_location_id,
  rule.id,
  'rule_seeded',
  case when rule.enabled
    then 'Owner-approved internal task rule enabled during central cutover.'
    else 'Starter template seeded disabled.'
  end,
  jsonb_build_object(
    'enabled', rule.enabled,
    'approvalPolicy', rule.approval_policy,
    'actionType', rule.action_type
  )
from public.automation_rules as rule
where not exists (
  select 1
  from public.automation_audit_events as audit
  where audit.rule_id = rule.id
    and audit.audit_type = 'rule_seeded'
);

create or replace function public.wtos_emit_due_task_events_v1(
  p_worker_now timestamptz,
  p_batch_size integer,
  p_company_filter uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  due_task record;
  recorded_count integer := 0;
begin
  if p_worker_now is null
    or p_batch_size is null
    or p_batch_size not between 1 and 100 then
    raise exception 'Due-task event scan input is invalid'
      using errcode = '22023';
  end if;

  for due_task in
    select
      task.id,
      task.company_id,
      task.company_location_id,
      task.status,
      task.priority,
      case
        when task.status = 'snoozed' then task.snoozed_until
        else task.due_at
      end as effective_due_at,
      pg_catalog.encode(
        extensions.digest(
          extract(epoch from case
            when task.status = 'snoozed' then task.snoozed_until
            else task.due_at
          end)::text,
          'sha256'
        ),
        'hex'
      ) as due_version
    from public.office_tasks as task
    where task.status in ('open', 'snoozed')
      and case
        when task.status = 'snoozed' then task.snoozed_until
        else task.due_at
      end <= p_worker_now
      and task.automation_execution_id is null
      and (p_company_filter is null or task.company_id = p_company_filter)
      and not exists (
        select 1
        from public.automation_events as existing_event
        where existing_event.company_id = task.company_id
          and existing_event.idempotency_key =
            'office-task:due:' || task.id::text || ':' || pg_catalog.encode(
              extensions.digest(
                extract(epoch from case
                  when task.status = 'snoozed' then task.snoozed_until
                  else task.due_at
                end)::text,
                'sha256'
              ),
              'hex'
            )
      )
    order by case
      when task.status = 'snoozed' then task.snoozed_until
      else task.due_at
    end, task.id
    for update of task skip locked
    limit p_batch_size
  loop
    perform public.wtos_emit_automation_event_v1(
      due_task.company_id,
      due_task.company_location_id,
      'task.due',
      'office_tasks',
      due_task.id::text,
      due_task.due_version,
      jsonb_build_object(
        'office_task_id', due_task.id,
        'status', due_task.status,
        'priority', due_task.priority,
        'due_at', due_task.effective_due_at
      ),
      due_task.effective_due_at,
      null,
      'office-task:due:' || due_task.id::text || ':' || due_task.due_version
    );

    recorded_count := recorded_count + 1;
  end loop;

  return recorded_count;
end;
$$;

create or replace function public.wtos_run_automation_worker_core_v1(
  worker_now timestamptz,
  batch_size integer,
  company_filter uuid,
  execution_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_execution record;
  execution_receipt jsonb;
  claimed_count integer := 0;
  succeeded_count integer := 0;
  retry_count integer := 0;
  failed_count integer := 0;
  cancelled_count integer := 0;
  skipped_count integer := 0;
  due_events_recorded integer := 0;
begin
  if worker_now is null or batch_size is null or batch_size not between 1 and 100 then
    raise exception 'Automation batch size must be between 1 and 100'
      using errcode = '22023';
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('wtos-automation-worker-v1', 0)) then
    return jsonb_build_object(
      'busy', true,
      'claimed', 0,
      'succeeded', 0,
      'retryScheduled', 0,
      'failed', 0,
      'cancelled', 0,
      'skipped', 0,
      'dueEventsRecorded', 0
    );
  end if;

  due_events_recorded := public.wtos_emit_due_task_events_v1(
    worker_now,
    batch_size,
    company_filter
  );

  for selected_execution in
    select execution.id
    from public.automation_executions as execution
    where execution.status in ('queued', 'retry_scheduled')
      and execution.approval_status in ('not_required', 'approved')
      and execution.scheduled_for <= worker_now
      and (
        execution.status = 'queued'
        or execution.next_retry_at <= worker_now
      )
      and (company_filter is null or execution.company_id = company_filter)
    order by coalesce(execution.next_retry_at, execution.scheduled_for), execution.created_at
    for update skip locked
    limit batch_size
  loop
    claimed_count := claimed_count + 1;
    execution_receipt := public.wtos_execute_automation_execution_v1(
      selected_execution.id,
      worker_now,
      execution_worker_id
    );

    case execution_receipt ->> 'status'
      when 'succeeded' then succeeded_count := succeeded_count + 1;
      when 'retry_scheduled' then retry_count := retry_count + 1;
      when 'failed' then failed_count := failed_count + 1;
      when 'cancelled' then cancelled_count := cancelled_count + 1;
      else skipped_count := skipped_count + 1;
    end case;
  end loop;

  return jsonb_build_object(
    'busy', false,
    'claimed', claimed_count,
    'succeeded', succeeded_count,
    'retryScheduled', retry_count,
    'failed', failed_count,
    'cancelled', cancelled_count,
    'skipped', skipped_count,
    'dueEventsRecorded', due_events_recorded
  );
end;
$$;

create or replace function public.wtos_run_automation_worker_v1(
  p_worker_now timestamptz default now(),
  p_batch_size integer default 25
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.wtos_run_automation_worker_core_v1(
    p_worker_now,
    p_batch_size,
    null,
    'service-worker-v1'
  );
$$;

create or replace function public.wtos_run_due_automations_v1(
  p_company_id uuid,
  p_batch_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.wtos_can_manage_settings(p_company_id) then
    raise exception 'Not authorized to run company automations'
      using errcode = '42501';
  end if;

  return public.wtos_run_automation_worker_core_v1(
    now(),
    p_batch_size,
    p_company_id,
    'owner-manual-run-v1'
  );
end;
$$;

create or replace function public.wtos_set_automation_rule_enabled_v1(
  p_rule_id uuid,
  p_expected_version integer,
  p_enabled boolean,
  p_reason text default null
)
returns public.automation_rules
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_rule public.automation_rules%rowtype;
  updated_rule public.automation_rules%rowtype;
  request_actor uuid := (select auth.uid());
  bounded_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select *
  into selected_rule
  from public.automation_rules
  where id = p_rule_id
  for update;

  if selected_rule.id is null then
    raise exception 'Automation rule not found' using errcode = 'P0002';
  end if;

  if not public.wtos_can_manage_settings(selected_rule.company_id) then
    raise exception 'Not authorized to manage this automation rule'
      using errcode = '42501';
  end if;

  if p_enabled is null then
    raise exception 'Automation rule enabled state is required' using errcode = '22023';
  end if;

  if selected_rule.version is distinct from p_expected_version then
    raise exception 'Automation rule version conflict' using errcode = 'P0001';
  end if;

  if bounded_reason is null or length(bounded_reason) > 500 then
    raise exception 'A bounded rule-change reason is required' using errcode = '22023';
  end if;

  if selected_rule.enabled = p_enabled then
    return selected_rule;
  end if;

  if p_enabled and selected_rule.company_location_id is not null and not exists (
    select 1
    from public.company_locations as location
    where location.id = selected_rule.company_location_id
      and location.company_id = selected_rule.company_id
      and location.is_active
  ) then
    raise exception 'Cannot enable a rule for an inactive location'
      using errcode = '23514';
  end if;

  update public.automation_rules
  set
    enabled = p_enabled,
    enabled_by = case when p_enabled then request_actor else null end,
    enabled_at = case when p_enabled then now() else null end,
    disabled_by = case when p_enabled then null else request_actor end,
    disabled_at = case when p_enabled then null else now() end,
    disable_reason = case when p_enabled then null else bounded_reason end,
    updated_by = request_actor,
    version = version + 1
  where id = selected_rule.id
  returning * into updated_rule;

  insert into public.automation_audit_events (
    company_id,
    company_location_id,
    rule_id,
    actor_user_id,
    audit_type,
    reason,
    metadata
  ) values (
    updated_rule.company_id,
    updated_rule.company_location_id,
    updated_rule.id,
    request_actor,
    case when p_enabled then 'rule_enabled' else 'rule_disabled' end,
    bounded_reason,
    jsonb_build_object('previousVersion', selected_rule.version, 'version', updated_rule.version)
  );

  if not p_enabled then
    with cancelled as (
      update public.automation_executions
      set
        status = 'cancelled',
        cancelled_by = request_actor,
        cancelled_at = now(),
        completed_at = now(),
        cancel_reason = 'Rule disabled: ' || bounded_reason,
        lease_token = null,
        lease_expires_at = null,
        version = version + 1
      where rule_id = updated_rule.id
        and status in ('queued', 'awaiting_approval', 'retry_scheduled')
      returning *
    )
    insert into public.automation_audit_events (
      company_id,
      company_location_id,
      rule_id,
      event_id,
      execution_id,
      actor_user_id,
      audit_type,
      reason
    )
    select
      cancelled.company_id,
      cancelled.company_location_id,
      cancelled.rule_id,
      cancelled.event_id,
      cancelled.id,
      request_actor,
      'execution_cancelled',
      'Rule disabled: ' || bounded_reason
    from cancelled;
  end if;

  return updated_rule;
end;
$$;

create or replace function public.wtos_review_automation_execution_v1(
  p_execution_id uuid,
  p_expected_version integer,
  p_decision text,
  p_reason text default null
)
returns public.automation_executions
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_execution public.automation_executions%rowtype;
  updated_execution public.automation_executions%rowtype;
  request_actor uuid := (select auth.uid());
  bounded_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_decision is null or p_decision not in ('approve', 'reject') then
    raise exception 'Automation review decision must be approve or reject'
      using errcode = '22023';
  end if;

  select *
  into selected_execution
  from public.automation_executions
  where id = p_execution_id
  for update;

  if selected_execution.id is null then
    raise exception 'Automation execution not found' using errcode = 'P0002';
  end if;

  if not public.wtos_can_manage_settings(selected_execution.company_id) then
    raise exception 'Not authorized to review this automation execution'
      using errcode = '42501';
  end if;

  if selected_execution.version is distinct from p_expected_version then
    raise exception 'Automation execution version conflict' using errcode = 'P0001';
  end if;

  if (p_decision = 'approve' and selected_execution.approval_status = 'approved')
    or (p_decision = 'reject' and selected_execution.approval_status = 'rejected') then
    return selected_execution;
  end if;

  if selected_execution.status <> 'awaiting_approval'
    or selected_execution.approval_status <> 'pending' then
    raise exception 'Automation execution is not awaiting approval'
      using errcode = '55000';
  end if;

  if bounded_reason is not null and length(bounded_reason) > 500 then
    raise exception 'Automation review reason is too long' using errcode = '22023';
  end if;

  update public.automation_executions
  set
    status = case when p_decision = 'approve' then 'queued' else 'rejected' end,
    approval_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
    approved_by = case when p_decision = 'approve' then request_actor else null end,
    approved_at = case when p_decision = 'approve' then now() else null end,
    rejected_by = case when p_decision = 'reject' then request_actor else null end,
    rejected_at = case when p_decision = 'reject' then now() else null end,
    approval_reason = bounded_reason,
    completed_at = case when p_decision = 'reject' then now() else null end,
    version = version + 1
  where id = selected_execution.id
  returning * into updated_execution;

  insert into public.automation_audit_events (
    company_id, company_location_id, rule_id, event_id, execution_id,
    actor_user_id, audit_type, reason
  ) values (
    updated_execution.company_id,
    updated_execution.company_location_id,
    updated_execution.rule_id,
    updated_execution.event_id,
    updated_execution.id,
    request_actor,
    case when p_decision = 'approve' then 'execution_approved' else 'execution_rejected' end,
    bounded_reason
  );

  if p_decision = 'approve' and updated_execution.scheduled_for <= now() then
    perform public.wtos_execute_automation_execution_v1(
      updated_execution.id,
      now(),
      'owner-approval-v1'
    );

    select * into updated_execution
    from public.automation_executions
    where id = selected_execution.id;
  end if;

  return updated_execution;
end;
$$;

create or replace function public.wtos_cancel_automation_execution_v1(
  p_execution_id uuid,
  p_expected_version integer,
  p_reason text
)
returns public.automation_executions
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_execution public.automation_executions%rowtype;
  updated_execution public.automation_executions%rowtype;
  request_actor uuid := (select auth.uid());
  bounded_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into selected_execution
  from public.automation_executions
  where id = p_execution_id
  for update;

  if selected_execution.id is null then
    raise exception 'Automation execution not found' using errcode = 'P0002';
  end if;
  if not public.wtos_can_manage_settings(selected_execution.company_id) then
    raise exception 'Not authorized to cancel this automation execution' using errcode = '42501';
  end if;
  if selected_execution.version is distinct from p_expected_version then
    raise exception 'Automation execution version conflict' using errcode = 'P0001';
  end if;
  if bounded_reason is null or length(bounded_reason) > 500 then
    raise exception 'A bounded cancellation reason is required' using errcode = '22023';
  end if;
  if selected_execution.status = 'cancelled' then
    return selected_execution;
  end if;
  if selected_execution.status not in ('queued', 'awaiting_approval', 'retry_scheduled') then
    raise exception 'Only pending automation executions can be cancelled' using errcode = '55000';
  end if;

  update public.automation_executions
  set
    status = 'cancelled',
    cancelled_by = request_actor,
    cancelled_at = now(),
    completed_at = now(),
    cancel_reason = bounded_reason,
    lease_token = null,
    lease_expires_at = null,
    version = version + 1
  where id = selected_execution.id
  returning * into updated_execution;

  insert into public.automation_audit_events (
    company_id, company_location_id, rule_id, event_id, execution_id,
    actor_user_id, audit_type, reason
  ) values (
    updated_execution.company_id, updated_execution.company_location_id,
    updated_execution.rule_id, updated_execution.event_id, updated_execution.id,
    request_actor, 'execution_cancelled', bounded_reason
  );

  return updated_execution;
end;
$$;

create or replace function public.wtos_retry_automation_execution_v1(
  p_execution_id uuid,
  p_expected_version integer,
  p_reason text
)
returns public.automation_executions
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_execution public.automation_executions%rowtype;
  updated_execution public.automation_executions%rowtype;
  selected_rule public.automation_rules%rowtype;
  request_actor uuid := (select auth.uid());
  bounded_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into selected_execution
  from public.automation_executions
  where id = p_execution_id
  for update;

  if selected_execution.id is null then
    raise exception 'Automation execution not found' using errcode = 'P0002';
  end if;
  if not public.wtos_can_manage_settings(selected_execution.company_id) then
    raise exception 'Not authorized to retry this automation execution' using errcode = '42501';
  end if;
  if selected_execution.version is distinct from p_expected_version then
    raise exception 'Automation execution version conflict' using errcode = 'P0001';
  end if;
  if selected_execution.status <> 'failed' then
    raise exception 'Only terminal failed automation executions can be retried' using errcode = '55000';
  end if;
  if bounded_reason is null or length(bounded_reason) > 500 then
    raise exception 'A bounded retry reason is required' using errcode = '22023';
  end if;

  select * into selected_rule
  from public.automation_rules
  where id = selected_execution.rule_id;

  if selected_rule.id is null or not selected_rule.enabled
    or selected_rule.version <> selected_execution.rule_version then
    raise exception 'Cannot retry an execution for a disabled or changed rule' using errcode = '55000';
  end if;

  if selected_execution.attempt_count >= 10 then
    raise exception 'Automation execution reached the manual retry limit' using errcode = '54000';
  end if;

  update public.automation_executions
  set
    status = 'queued',
    scheduled_for = now(),
    next_retry_at = null,
    completed_at = null,
    max_attempts = least(10, greatest(max_attempts, attempt_count + 1)),
    last_error_code = null,
    last_error_message = null,
    worker_id = null,
    version = version + 1
  where id = selected_execution.id
  returning * into updated_execution;

  insert into public.automation_audit_events (
    company_id, company_location_id, rule_id, event_id, execution_id,
    actor_user_id, audit_type, reason,
    metadata
  ) values (
    updated_execution.company_id, updated_execution.company_location_id,
    updated_execution.rule_id, updated_execution.event_id, updated_execution.id,
    request_actor, 'execution_manual_retry', bounded_reason,
    jsonb_build_object('attemptCount', updated_execution.attempt_count)
  );

  return updated_execution;
end;
$$;

create unique index ai_audit_events_request_reservation_key
on public.ai_audit_events ((metadata ->> 'requestId'))
where event_type = 'request_initiated'
  and metadata ? 'requestId';

create index ai_audit_events_quota_day_idx
on public.ai_audit_events (created_at, company_id, actor_user_id)
where event_type = 'request_initiated';

drop policy if exists "WTOS users insert AI audit events"
on public.ai_audit_events;

revoke insert, update, delete on table public.ai_audit_events
from public, anon, authenticated;

create or replace function public.wtos_reserve_ai_request_v1(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_request_id uuid,
  p_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_reservation public.ai_audit_events%rowtype;
  inserted_reservation public.ai_audit_events%rowtype;
  utc_day_key date := (now() at time zone 'UTC')::date;
  utc_day_start timestamptz;
  utc_day_end timestamptz;
  utc_month_start timestamptz;
  utc_month_end timestamptz;
  request_provider text;
  request_model text;
  prompt_sha256 text;
  prompt_characters integer;
  estimated_request_tokens integer;
  max_response_tokens integer;
  estimated_cost_cents integer;
  max_provider_attempts integer;
  global_daily_request_limit integer;
  company_daily_request_limit integer;
  user_daily_request_limit integer;
  daily_budget_cents integer;
  company_monthly_budget_cents integer;
  max_request_tokens integer;
  global_requests_today integer;
  company_requests_today integer;
  user_requests_today integer;
  reserved_cost_cents_today integer;
  company_reserved_cost_cents_this_month integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'AI quota reservation requires the trusted server role'
      using errcode = '42501';
  end if;

  if p_company_id is null
    or p_actor_user_id is null
    or p_request_id is null
    or p_request is null
    or jsonb_typeof(p_request) <> 'object'
    or not p_request ?& array[
      'contractVersion',
      'provider',
      'model',
      'promptSha256',
      'promptCharacters',
      'estimatedRequestTokens',
      'maxResponseTokens',
      'estimatedCostCents',
      'maxProviderAttempts',
      'globalDailyRequestLimit',
      'companyDailyRequestLimit',
      'userDailyRequestLimit',
      'dailyBudgetCents',
      'companyMonthlyBudgetCents',
      'maxRequestTokens'
    ]
    or exists (
      select 1
      from jsonb_object_keys(p_request) as request_key
      where request_key not in (
        'contractVersion',
        'provider',
        'model',
        'promptSha256',
        'promptCharacters',
        'estimatedRequestTokens',
        'maxResponseTokens',
        'estimatedCostCents',
        'maxProviderAttempts',
        'globalDailyRequestLimit',
        'companyDailyRequestLimit',
        'userDailyRequestLimit',
        'dailyBudgetCents',
        'companyMonthlyBudgetCents',
        'maxRequestTokens'
      )
    )
    or jsonb_typeof(p_request -> 'contractVersion') <> 'number'
    or jsonb_typeof(p_request -> 'provider') <> 'string'
    or jsonb_typeof(p_request -> 'model') not in ('string', 'null')
    or jsonb_typeof(p_request -> 'promptSha256') <> 'string'
    or jsonb_typeof(p_request -> 'promptCharacters') <> 'number'
    or jsonb_typeof(p_request -> 'estimatedRequestTokens') <> 'number'
    or jsonb_typeof(p_request -> 'maxResponseTokens') <> 'number'
    or jsonb_typeof(p_request -> 'estimatedCostCents') <> 'number'
    or jsonb_typeof(p_request -> 'maxProviderAttempts') <> 'number'
    or jsonb_typeof(p_request -> 'globalDailyRequestLimit') <> 'number'
    or jsonb_typeof(p_request -> 'companyDailyRequestLimit') <> 'number'
    or jsonb_typeof(p_request -> 'userDailyRequestLimit') <> 'number'
    or jsonb_typeof(p_request -> 'dailyBudgetCents') <> 'number'
    or jsonb_typeof(p_request -> 'companyMonthlyBudgetCents') <> 'number'
    or jsonb_typeof(p_request -> 'maxRequestTokens') <> 'number' then
    raise exception 'AI quota reservation contract is invalid'
      using errcode = '22023';
  end if;

  begin
    if (p_request ->> 'contractVersion')::integer <> 1 then
      raise exception 'AI quota reservation contract version is unsupported'
        using errcode = '22023';
    end if;

    request_provider := p_request ->> 'provider';
    request_model := nullif(btrim(coalesce(p_request ->> 'model', '')), '');
    prompt_sha256 := p_request ->> 'promptSha256';
    prompt_characters := (p_request ->> 'promptCharacters')::integer;
    estimated_request_tokens := (p_request ->> 'estimatedRequestTokens')::integer;
    max_response_tokens := (p_request ->> 'maxResponseTokens')::integer;
    estimated_cost_cents := (p_request ->> 'estimatedCostCents')::integer;
    max_provider_attempts := (p_request ->> 'maxProviderAttempts')::integer;
    global_daily_request_limit := (p_request ->> 'globalDailyRequestLimit')::integer;
    company_daily_request_limit := (p_request ->> 'companyDailyRequestLimit')::integer;
    user_daily_request_limit := (p_request ->> 'userDailyRequestLimit')::integer;
    daily_budget_cents := (p_request ->> 'dailyBudgetCents')::integer;
    company_monthly_budget_cents :=
      (p_request ->> 'companyMonthlyBudgetCents')::integer;
    max_request_tokens := (p_request ->> 'maxRequestTokens')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'AI quota reservation numeric values are invalid'
        using errcode = '22023';
  end;

  if request_provider not in ('disabled', 'openai', 'anthropic', 'owner_approved')
    or (request_provider in ('openai', 'anthropic') and request_model is null)
    or (request_model is not null and length(request_model) not between 1 and 160)
    or prompt_sha256 !~ '^[0-9a-f]{64}$'
    or prompt_characters not between 1 and 50000
    or estimated_request_tokens not between 1 and 1000000
    or estimated_request_tokens < ceil(prompt_characters / 8.0)::integer
    or max_response_tokens not between 1 and 1000000
    or estimated_cost_cents not between 0 and 100000000
    or (request_provider in ('openai', 'anthropic') and estimated_cost_cents < 1)
    or max_provider_attempts not between 1 and 3
    or global_daily_request_limit not between 1 and 100000
    or company_daily_request_limit not between 1 and 100000
    or user_daily_request_limit not between 1 and 100000
    or daily_budget_cents not between 1 and 100000000
    or company_monthly_budget_cents not between 1 and 1000000000
    or max_request_tokens not between 1 and 1000000
    or estimated_request_tokens > max_request_tokens then
    raise exception 'AI quota reservation values are outside bounded limits'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.company_memberships as membership
    where membership.company_id = p_company_id
      and membership.user_id = p_actor_user_id
      and membership.role not in ('customer_portal', 'employee_portal')
  ) then
    raise exception 'AI quota actor lacks an exact internal company membership'
      using errcode = '42501';
  end if;

  utc_day_start := utc_day_key::timestamp at time zone 'UTC';
  utc_month_start := date_trunc('month', utc_day_start);
  utc_month_end := utc_month_start + interval '1 month';

  perform pg_advisory_xact_lock(
    hashtextextended('wtos-ai-quota-v1:' || utc_day_key::text, 0)
  );

  select *
  into existing_reservation
  from public.ai_audit_events as audit
  where audit.event_type = 'request_initiated'
    and audit.metadata ->> 'requestId' = p_request_id::text
  for update;

  if existing_reservation.id is not null then
    if existing_reservation.company_id is distinct from p_company_id
      or existing_reservation.actor_user_id is distinct from p_actor_user_id
      or existing_reservation.provider is distinct from request_provider
      or existing_reservation.model is distinct from request_model
      or existing_reservation.token_count is distinct from
        estimated_request_tokens + max_response_tokens
      or existing_reservation.estimated_cost_cents is distinct from estimated_cost_cents
      or (existing_reservation.metadata ->> 'maxProviderAttempts')::integer
        is distinct from max_provider_attempts
      or existing_reservation.metadata ->> 'promptSha256' is distinct from prompt_sha256
      or (existing_reservation.metadata ->> 'promptCharacters')::integer
        is distinct from prompt_characters
      or (existing_reservation.metadata ->> 'globalDailyRequestLimit')::integer
        is distinct from global_daily_request_limit
      or (existing_reservation.metadata ->> 'companyDailyRequestLimit')::integer
        is distinct from company_daily_request_limit
      or (existing_reservation.metadata ->> 'userDailyRequestLimit')::integer
        is distinct from user_daily_request_limit
      or (existing_reservation.metadata ->> 'dailyBudgetCents')::integer
        is distinct from daily_budget_cents
      or (existing_reservation.metadata ->> 'companyMonthlyBudgetCents')::integer
        is distinct from company_monthly_budget_cents
      or (existing_reservation.metadata ->> 'maxRequestTokens')::integer
        is distinct from max_request_tokens then
      raise exception 'AI quota reservation replay conflicts with durable evidence'
        using errcode = '23505';
    end if;
  end if;

  utc_day_end := utc_day_start + interval '1 day';

  select
    count(*)::integer,
    count(*) filter (where audit.company_id = p_company_id)::integer,
    count(*) filter (
      where audit.company_id = p_company_id
        and audit.actor_user_id = p_actor_user_id
    )::integer,
    coalesce(sum(audit.estimated_cost_cents), 0)::integer
  into
    global_requests_today,
    company_requests_today,
    user_requests_today,
    reserved_cost_cents_today
  from public.ai_audit_events as audit
  where audit.event_type = 'request_initiated'
    and audit.created_at >= utc_day_start
    and audit.created_at < utc_day_end;

  select coalesce(sum(audit.estimated_cost_cents), 0)::integer
  into company_reserved_cost_cents_this_month
  from public.ai_audit_events as audit
  where audit.event_type = 'request_initiated'
    and audit.company_id = p_company_id
    and audit.created_at >= utc_month_start
    and audit.created_at < utc_month_end;

  if existing_reservation.id is not null then
    return jsonb_build_object(
      'contractVersion', 1,
      'reservationId', existing_reservation.id,
      'requestAuditEventId', existing_reservation.id,
      'requestId', p_request_id,
      'companyId', p_company_id,
      'actorUserId', p_actor_user_id,
      'provider', request_provider,
      'model', request_model,
      'estimatedCostCents', estimated_cost_cents,
      'maxProviderAttempts', max_provider_attempts,
      'status', 'reserved',
      'idempotent', true,
      'globalRequestsToday', global_requests_today,
      'companyRequestsToday', company_requests_today,
      'userRequestsToday', user_requests_today,
      'reservedCostCentsToday', reserved_cost_cents_today,
      'companyReservedCostCentsThisMonth',
        company_reserved_cost_cents_this_month
    );
  end if;

  if global_requests_today >= global_daily_request_limit then
    raise exception 'AI global daily request limit reached' using errcode = 'P0001';
  end if;
  if company_requests_today >= company_daily_request_limit then
    raise exception 'AI company daily request limit reached' using errcode = 'P0001';
  end if;
  if user_requests_today >= user_daily_request_limit then
    raise exception 'AI user daily request limit reached' using errcode = 'P0001';
  end if;
  if reserved_cost_cents_today + estimated_cost_cents > daily_budget_cents then
    raise exception 'AI global daily budget reached' using errcode = 'P0001';
  end if;
  if company_reserved_cost_cents_this_month + estimated_cost_cents
    > company_monthly_budget_cents then
    raise exception 'AI company monthly budget reached' using errcode = 'P0001';
  end if;

  insert into public.ai_audit_events (
    company_id,
    actor_user_id,
    task_type,
    event_type,
    provider,
    model,
    source_records,
    action_type,
    action_preview,
    status,
    safety_flags,
    token_count,
    estimated_cost_cents,
    metadata
  ) values (
    p_company_id,
    p_actor_user_id,
    'command',
    'request_initiated',
    request_provider,
    request_model,
    '[]'::jsonb,
    null,
    '{}'::jsonb,
    'started',
    '{}',
    estimated_request_tokens + max_response_tokens,
    estimated_cost_cents,
    jsonb_build_object(
      'reservationContractVersion', 1,
      'requestId', p_request_id,
      'promptSha256', prompt_sha256,
      'promptCharacters', prompt_characters,
      'estimatedRequestTokens', estimated_request_tokens,
      'maxResponseTokens', max_response_tokens,
      'maxProviderAttempts', max_provider_attempts,
      'globalDailyRequestLimit', global_daily_request_limit,
      'companyDailyRequestLimit', company_daily_request_limit,
      'userDailyRequestLimit', user_daily_request_limit,
      'dailyBudgetCents', daily_budget_cents,
      'companyMonthlyBudgetCents', company_monthly_budget_cents,
      'maxRequestTokens', max_request_tokens,
      'exactCompanyScope', true,
      'reservationStatus', 'counted_conservatively'
    )
  )
  returning * into inserted_reservation;

  return jsonb_build_object(
    'contractVersion', 1,
    'reservationId', inserted_reservation.id,
    'requestAuditEventId', inserted_reservation.id,
    'requestId', p_request_id,
    'companyId', p_company_id,
    'actorUserId', p_actor_user_id,
    'provider', request_provider,
    'model', request_model,
    'estimatedCostCents', estimated_cost_cents,
    'maxProviderAttempts', max_provider_attempts,
    'status', 'reserved',
    'idempotent', false,
    'globalRequestsToday', global_requests_today + 1,
    'companyRequestsToday', company_requests_today + 1,
    'userRequestsToday', user_requests_today + 1,
    'reservedCostCentsToday', reserved_cost_cents_today + estimated_cost_cents,
    'companyReservedCostCentsThisMonth',
      company_reserved_cost_cents_this_month + estimated_cost_cents
  );
end;
$$;

create or replace function public.wtos_ai_action_preview_fingerprint_v1(
  p_action_preview jsonb,
  p_contract_version integer default 1
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_contract_version is distinct from 1
    or p_action_preview is null
    or jsonb_typeof(p_action_preview) <> 'object' then
    raise exception 'Unsupported AI action preview contract'
      using errcode = '22023';
  end if;

  return pg_catalog.encode(
    extensions.digest(p_contract_version::text || ':' || p_action_preview::text, 'sha256'),
    'hex'
  );
end;
$$;

create or replace function public.wtos_review_ai_action_v1(
  p_ai_audit_event_id uuid,
  p_decision text,
  p_expected_action_type text,
  p_expected_payload_sha256 text,
  p_expected_contract_version integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposed_action public.ai_audit_events%rowtype;
  request_reservation public.ai_audit_events%rowtype;
  review_event public.automation_events%rowtype;
  selected_rule public.automation_rules%rowtype;
  execution_row public.automation_executions%rowtype;
  request_actor uuid := (select auth.uid());
  bounded_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  stored_fingerprint text;
  stored_contract_version integer;
  request_reservation_id uuid;
  target_record jsonb;
  target_table text;
  target_id uuid;
  target_company_id uuid;
  target_location_id uuid;
  target_customer_id uuid;
  target_property_id uuid;
  target_lead_id uuid;
  target_estimate_id uuid;
  action_capable boolean;
  may_reject boolean;
  task_id uuid;
  execution_receipt jsonb;
  is_replay boolean := false;
begin
  if request_actor is null then
    raise exception 'Authentication required for AI action review'
      using errcode = '42501';
  end if;

  if p_ai_audit_event_id is null
    or p_decision is null
    or p_decision not in ('approve', 'reject')
    or length(btrim(coalesce(p_expected_action_type, ''))) not between 1 and 80
    or p_expected_contract_version is distinct from 1
    or p_expected_payload_sha256 is null
    or p_expected_payload_sha256 !~ '^[0-9a-f]{64}$'
    or length(bounded_reason) > 500 then
    raise exception 'AI action review input is invalid' using errcode = '22023';
  end if;

  select *
  into proposed_action
  from public.ai_audit_events
  where id = p_ai_audit_event_id
  for update;

  if proposed_action.id is null then
    raise exception 'AI action preview audit event not found' using errcode = 'P0002';
  end if;

  if proposed_action.event_type <> 'action_proposed'
    or proposed_action.action_type is null
    or jsonb_typeof(proposed_action.action_preview) <> 'object' then
    raise exception 'AI audit event is not a reviewable action preview'
      using errcode = '55000';
  end if;

  begin
    request_reservation_id := nullif(
      proposed_action.metadata ->> 'requestAuditEventId',
      ''
    )::uuid;
  exception when invalid_text_representation then
    raise exception 'AI action preview lacks a valid server reservation'
      using errcode = '55000';
  end;

  select *
  into request_reservation
  from public.ai_audit_events as reservation
  where reservation.id = request_reservation_id
    and reservation.company_id = proposed_action.company_id
    and reservation.actor_user_id is not distinct from proposed_action.actor_user_id
    and reservation.event_type = 'request_initiated'
    and reservation.provider = proposed_action.provider
    and reservation.model is not distinct from proposed_action.model
    and reservation.metadata ->> 'reservationContractVersion' = '1'
    and reservation.metadata ->> 'reservationStatus' = 'counted_conservatively'
    and reservation.metadata ->> 'requestId' ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and reservation.created_at <= proposed_action.created_at;

  if request_reservation.id is null then
    raise exception 'AI action preview is not linked to trusted server reservation evidence'
      using errcode = '55000';
  end if;

  stored_contract_version := (proposed_action.metadata ->> 'contractVersion')::integer;
  stored_fingerprint := public.wtos_ai_action_preview_fingerprint_v1(
    proposed_action.action_preview,
    stored_contract_version
  );

  if proposed_action.action_type <> p_expected_action_type
    or coalesce(proposed_action.action_preview ->> 'actionType', '') <> p_expected_action_type
    or stored_contract_version <> p_expected_contract_version
    or stored_fingerprint <> p_expected_payload_sha256 then
    raise exception 'AI action preview changed before review'
      using errcode = 'P0001';
  end if;

  action_capable :=
    exists (
      select 1
      from public.profiles as profile
      where profile.id = request_actor
        and profile.role in ('owner', 'admin')
    )
    or exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = request_actor
        and membership.company_id = proposed_action.company_id
        and membership.role in ('owner', 'admin', 'office')
    );

  may_reject := action_capable or (
    proposed_action.actor_user_id = request_actor
    and public.wtos_can_read_company(proposed_action.company_id)
  );

  if (p_decision = 'approve' and not action_capable)
    or (p_decision = 'reject' and not may_reject) then
    raise exception 'Not authorized to review this AI action'
      using errcode = '42501';
  end if;

  if p_decision = 'approve'
    and p_expected_action_type <> 'create_follow_up_draft' then
    raise exception 'This AI action type cannot be approved for execution'
      using errcode = '0A000';
  end if;

  select *
  into review_event
  from public.automation_events
  where company_id = proposed_action.company_id
    and idempotency_key = 'ai-action-review:' || proposed_action.id::text;

  if review_event.id is not null then
    if review_event.payload ->> 'decision' <> p_decision
      or review_event.payload ->> 'action_type' <> p_expected_action_type
      or review_event.payload ->> 'fingerprint' <> stored_fingerprint
      or (review_event.payload ->> 'contract_version')::integer <> stored_contract_version then
      raise exception 'AI action already received a conflicting review decision'
        using errcode = 'P0001';
    end if;

    is_replay := true;
    select *
    into execution_row
    from public.automation_executions
    where event_id = review_event.id
    order by created_at
    limit 1;

    task_id := nullif(execution_row.result ->> 'officeTaskId', '')::uuid;

    return jsonb_build_object(
      'aiAuditEventId', proposed_action.id,
      'decision', p_decision,
      'executionId', execution_row.id,
      'executionStatus', case
        when p_decision = 'reject' then 'rejected'
        else execution_row.status
      end,
      'officeTaskId', task_id,
      'idempotent', is_replay
    );
  end if;

  target_record := proposed_action.action_preview -> 'targetRecord';
  target_table := target_record ->> 'table';

  if p_decision = 'approve' then
    begin
      target_company_id := nullif(target_record ->> 'companyId', '')::uuid;
      target_id := nullif(target_record ->> 'id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'AI action target identity is invalid'
        using errcode = '22023';
    end;

    if target_company_id is distinct from proposed_action.company_id or target_id is null then
      raise exception 'AI action target is not bound to the audited company'
        using errcode = '23514';
    end if;

    if target_table = 'leads' then
      select
        lead.company_id,
        lead.company_location_id,
        lead.customer_id,
        lead.property_id,
        lead.id,
        null::uuid
      into
        target_company_id,
        target_location_id,
        target_customer_id,
        target_property_id,
        target_lead_id,
        target_estimate_id
      from public.leads as lead
      where lead.id = target_id;
    elsif target_table = 'estimates' then
      select
        estimate.company_id,
        lead.company_location_id,
        estimate.customer_id,
        estimate.property_id,
        null::uuid,
        estimate.id
      into
        target_company_id,
        target_location_id,
        target_customer_id,
        target_property_id,
        target_lead_id,
        target_estimate_id
      from public.estimates as estimate
      left join public.leads as lead
        on lead.id = estimate.lead_id
        and lead.company_id = estimate.company_id
      where estimate.id = target_id;
    else
      raise exception 'AI follow-up target table is unsupported'
        using errcode = '0A000';
    end if;

    if target_company_id is distinct from proposed_action.company_id then
      raise exception 'AI action target does not belong to the audited company'
        using errcode = '23514';
    end if;
  end if;

  insert into public.automation_events (
    company_id,
    company_location_id,
    event_type,
    source_table,
    source_id,
    source_version,
    actor_user_id,
    idempotency_key,
    payload,
    occurred_at
  ) values (
    proposed_action.company_id,
    target_location_id,
    case when p_decision = 'approve' then 'ai.action.approved' else 'ai.action.rejected' end,
    'ai_audit_events',
    proposed_action.id::text,
    stored_fingerprint,
    request_actor,
    'ai-action-review:' || proposed_action.id::text,
    jsonb_build_object(
      'decision', p_decision,
      'action_type', p_expected_action_type,
      'fingerprint', stored_fingerprint,
      'contract_version', stored_contract_version
    ),
    now()
  )
  returning * into review_event;

  insert into public.automation_audit_events (
    company_id,
    company_location_id,
    event_id,
    actor_user_id,
    audit_type,
    reason,
    metadata
  ) values (
    proposed_action.company_id,
    target_location_id,
    review_event.id,
    request_actor,
    case when p_decision = 'approve' then 'ai_action_approved' else 'ai_action_rejected' end,
    bounded_reason,
    jsonb_build_object(
      'aiAuditEventId', proposed_action.id,
      'actionType', p_expected_action_type,
      'contractVersion', stored_contract_version,
      'fingerprint', stored_fingerprint
    )
  );

  insert into public.ai_audit_events (
    company_id,
    saved_analysis_id,
    actor_user_id,
    task_type,
    event_type,
    provider,
    model,
    source_records,
    action_type,
    action_preview,
    status,
    safety_flags,
    metadata
  ) values (
    proposed_action.company_id,
    proposed_action.saved_analysis_id,
    request_actor,
    proposed_action.task_type,
    case when p_decision = 'approve' then 'action_approved' else 'action_rejected' end,
    proposed_action.provider,
    proposed_action.model,
    proposed_action.source_records,
    proposed_action.action_type,
    proposed_action.action_preview,
    case when p_decision = 'approve' then 'approved' else 'rejected' end,
    proposed_action.safety_flags,
    jsonb_strip_nulls(jsonb_build_object(
      'reviewOfAiAuditEventId', proposed_action.id,
      'contractVersion', stored_contract_version,
      'fingerprint', stored_fingerprint,
      'reason', bounded_reason
    ))
  );

  if p_decision = 'reject' then
    return jsonb_build_object(
      'aiAuditEventId', proposed_action.id,
      'decision', p_decision,
      'executionId', null,
      'executionStatus', 'rejected',
      'officeTaskId', null,
      'idempotent', false
    );
  end if;

  select *
  into selected_rule
  from public.automation_rules
  where company_id = proposed_action.company_id
    and rule_key = 'ai:reviewed-follow-up'
    and enabled
  for update;

  if selected_rule.id is null then
    raise exception 'Reviewed AI follow-up rule is disabled'
      using errcode = '55000';
  end if;

  insert into public.automation_executions (
    company_id,
    company_location_id,
    rule_id,
    event_id,
    rule_version,
    action_type,
    action_config_snapshot,
    action_input,
    status,
    approval_status,
    approved_by,
    approved_at,
    approval_reason,
    scheduled_for,
    max_attempts,
    idempotency_key
  ) values (
    proposed_action.company_id,
    target_location_id,
    selected_rule.id,
    review_event.id,
    selected_rule.version,
    'create_office_task',
    selected_rule.action_config,
    jsonb_strip_nulls(jsonb_build_object(
      'automation_key', 'ai-follow-up:' || proposed_action.id::text,
      'source_type', 'automation',
      'title', 'Review approved AI follow-up',
      'notes', 'Review the approved AI follow-up recommendation in WeatherTech OS.',
      'priority', 'normal',
      'due_at', now(),
      'customer_id', target_customer_id,
      'property_id', target_property_id,
      'lead_id', target_lead_id,
      'estimate_id', target_estimate_id
    )),
    'queued',
    'approved',
    request_actor,
    now(),
    bounded_reason,
    now(),
    selected_rule.max_attempts,
    'ai-action:' || proposed_action.id::text
  )
  returning * into execution_row;

  insert into public.automation_audit_events (
    company_id, company_location_id, rule_id, event_id, execution_id,
    actor_user_id, audit_type, reason,
    metadata
  ) values (
    execution_row.company_id, execution_row.company_location_id,
    execution_row.rule_id, execution_row.event_id, execution_row.id,
    request_actor, 'execution_enqueued', bounded_reason,
    jsonb_build_object('approvalStatus', 'approved', 'source', 'ai_action_review')
  );

  execution_receipt := public.wtos_execute_automation_execution_v1(
    execution_row.id,
    now(),
    'ai-action-review-v1'
  );

  select * into execution_row
  from public.automation_executions
  where id = execution_row.id;

  task_id := nullif(execution_row.result ->> 'officeTaskId', '')::uuid;

  if execution_row.status <> 'succeeded' or task_id is null then
    raise exception 'Approved AI follow-up did not complete its internal task atomically'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'aiAuditEventId', proposed_action.id,
    'decision', p_decision,
    'executionId', execution_row.id,
    'executionStatus', execution_row.status,
    'officeTaskId', task_id,
    'idempotent', false
  );
end;
$$;

-- Mighty Apes campaign authorization is data-driven and fail-closed.
create table public.mighty_apes_campaign_routes (
  id uuid primary key default gen_random_uuid(),
  campaign_yelp_id text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  company_location_id uuid not null,
  company_key text not null check (company_key in ('weathertech_roofing', 'ihc_painting')),
  branch_key text not null check (branch_key in ('weathertech_phoenix', 'weathertech_tucson', 'ihc')),
  assigned_queue text not null,
  service_type text not null check (service_type in ('roofing', 'painting', 'both')),
  enabled boolean not null default false,
  version integer not null default 1 check (version > 0),
  authorized_by uuid references auth.users(id) on delete set null,
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mighty_apes_campaign_routes_location_fkey foreign key (company_location_id, company_id)
    references public.company_locations(id, company_id) on delete restrict,
  constraint mighty_apes_campaign_routes_campaign_id_check check (
    length(campaign_yelp_id) between 1 and 160 and campaign_yelp_id = btrim(campaign_yelp_id)
    and campaign_yelp_id !~ '[[:cntrl:]]'
  ),
  constraint mighty_apes_campaign_routes_queue_check check (assigned_queue ~ '^[a-z0-9][a-z0-9_-]{2,119}$'),
  constraint mighty_apes_campaign_routes_authorization_check check (not enabled or authorized_at is not null),
  constraint mighty_apes_campaign_routes_company_branch_check check (
    (company_key = 'weathertech_roofing' and branch_key in ('weathertech_phoenix', 'weathertech_tucson') and service_type = 'roofing')
    or (company_key = 'ihc_painting' and branch_key = 'ihc' and service_type = 'painting')
  )
);

insert into public.mighty_apes_campaign_routes (
  campaign_yelp_id, company_id, company_location_id, company_key, branch_key,
  assigned_queue, service_type, enabled, authorized_at
)
select '00LZA1SuPKX0yUnsdthgLg', company.id, location.id,
  'weathertech_roofing', 'weathertech_phoenix', 'weathertech-roofing-phoenix',
  'roofing', true, now()
from public.companies as company
join public.company_locations as location on location.company_id = company.id
  and location.location_key = 'weathertech_phoenix'
where company.name = 'WeatherTech Roofing LLC' and company.trade = 'roofing'
on conflict (campaign_yelp_id) do nothing;

alter table public.mighty_apes_campaign_routes enable row level security;
create policy "Settings managers read Mighty Apes campaign routes"
on public.mighty_apes_campaign_routes for select to authenticated
using (public.wtos_can_manage_settings(company_id));
revoke all on table public.mighty_apes_campaign_routes from public, anon, authenticated;
grant select on table public.mighty_apes_campaign_routes to authenticated;
grant select, insert, update, delete on table public.mighty_apes_campaign_routes to service_role;

create or replace function public.wtos_ingest_mighty_apes_yelp(intake_request jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company public.companies%rowtype;
  target_route public.mighty_apes_campaign_routes%rowtype;
  existing_delivery public.mighty_apes_yelp_webhook_events%rowtype;
  prior_delivery public.mighty_apes_yelp_webhook_events%rowtype;
  existing_intake public.lead_intake_records%rowtype;
  existing_lead_company_id uuid;
  existing_sync_company_id uuid;
  existing_sync_provider text;
  existing_sync_external_id text;
  existing_sync_related_table text;
  existing_sync_related_record_id uuid;
  request_version integer;
  request_event text;
  request_delivery_id text;
  request_fingerprint text;
  request_header_timestamp bigint;
  request_received_at timestamptz;
  request_campaign_id text;
  request_campaign_name text;
  request_lead_id text;
  request_lead_name text;
  request_lead_phone text;
  request_zip_code text;
  request_job_category text;
  request_message text;
  request_created_at timestamptz;
  request_created_at_raw text;
  created_lead_id uuid;
  created_sync_log_id uuid;
  created_intake_id uuid;
  created_notification_id uuid;
  created_event_id uuid;
  lead_notes text;
  lead_property_address text;
begin
  if intake_request is null or jsonb_typeof(intake_request) <> 'object' then
    raise exception using errcode = '22023', message = 'Mighty Apes intake request is invalid.';
  end if;

  if jsonb_typeof(intake_request -> 'campaign') <> 'object'
    or jsonb_typeof(intake_request -> 'lead') <> 'object'
  then
    raise exception using errcode = '22023', message = 'Mighty Apes intake request is invalid.';
  end if;

  request_event := intake_request ->> 'event';
  request_delivery_id := intake_request ->> 'delivery_id';
  request_fingerprint := intake_request ->> 'payload_fingerprint';
  request_campaign_id := intake_request -> 'campaign' ->> 'yelp_id';
  request_campaign_name := intake_request -> 'campaign' ->> 'name';
  request_lead_id := intake_request -> 'lead' ->> 'id';
  request_lead_name := intake_request -> 'lead' ->> 'name';
  request_lead_phone := intake_request -> 'lead' ->> 'phone';
  request_zip_code := intake_request -> 'lead' ->> 'zip_code';
  request_job_category := nullif(intake_request -> 'lead' ->> 'job_category', '');
  request_message := intake_request -> 'lead' ->> 'message';
  request_created_at_raw := intake_request -> 'lead' ->> 'created_at';

  begin
    request_version := (intake_request ->> 'version')::integer;
    request_header_timestamp := (intake_request ->> 'header_timestamp')::bigint;
    request_received_at := (intake_request ->> 'received_at')::timestamptz;
    request_created_at := request_created_at_raw::timestamptz;
  exception
    when sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22P02'
    then
      raise exception using
        errcode = '22023',
        message = 'Mighty Apes intake request is invalid.';
  end;

  if request_version is null
    or request_version is distinct from 1
    or request_event is null
    or request_event not in ('lead.created', 'lead.test')
    or request_delivery_id is null
    or length(request_delivery_id) not between 1 and 240
    or request_delivery_id <> btrim(request_delivery_id)
    or request_delivery_id ~ '[[:cntrl:]]'
    or request_fingerprint is null
    or request_fingerprint !~ '^[a-f0-9]{64}$'
    or request_header_timestamp is null
    or request_header_timestamp <= 0
    or request_received_at is null
    or abs(
      extract(epoch from request_received_at)::bigint - request_header_timestamp
    ) > 300
    or request_campaign_id is null
    or length(request_campaign_id) not between 1 and 160
    or request_campaign_id <> btrim(request_campaign_id)
    or request_campaign_id ~ '[[:cntrl:]]'
    or request_campaign_name is null
    or length(request_campaign_name) not between 1 and 240
    or btrim(request_campaign_name) = ''
    or request_lead_id is null
    or length(request_lead_id) not between 1 and 200
    or request_lead_id <> btrim(request_lead_id)
    or request_lead_id ~ '[[:cntrl:]]'
    or request_lead_name is null
    or length(request_lead_name) not between 1 and 160
    or btrim(request_lead_name) = ''
    or request_lead_name ~ '[[:cntrl:]]'
    or request_lead_phone is null
    or request_lead_phone !~ '^\+[1-9][0-9]{7,14}$'
    or request_zip_code is null
    or request_zip_code !~ '^[0-9]{5}(-[0-9]{4})?$'
    or request_message is null
    or btrim(request_message) = ''
    or octet_length(request_message) > 28000
    or request_created_at_raw is null
    or length(request_created_at_raw) > 80
    or (request_job_category is not null and length(request_job_category) > 240)
  then
    raise exception using errcode = '22023', message = 'Mighty Apes intake request is invalid.';
  end if;

  select route.*
  into target_route
  from public.mighty_apes_campaign_routes as route
  where route.campaign_yelp_id = request_campaign_id
    and route.enabled
  for share;

  if target_route.id is null then
    raise exception using
      errcode = '42501',
      message = 'Mighty Apes campaign is not authorized for ingestion.';
  end if;

  select company.*
  into target_company
  from public.companies as company
  where company.id = target_route.company_id;

  if target_company.id is null
    or (
      target_route.company_key = 'weathertech_roofing'
      and (target_company.name <> 'WeatherTech Roofing LLC' or target_company.trade <> 'roofing')
    )
    or (
      target_route.company_key = 'ihc_painting'
      and (target_company.name <> 'IHC Painting' or target_company.trade <> 'painting')
    )
    or not exists (
    select 1 from public.company_locations as location
    where location.id = target_route.company_location_id
      and location.company_id = target_route.company_id
      and location.location_key = target_route.branch_key
      and location.is_active
  ) then
    raise exception using errcode = '55000',
      message = 'Authorized Mighty Apes routing target is unavailable.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mighty-apes:yelp:delivery:' || request_delivery_id,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mighty-apes:yelp:lead:' || request_lead_id, 0)
  );

  select webhook_event.*
  into existing_delivery
  from public.mighty_apes_yelp_webhook_events as webhook_event
  where webhook_event.delivery_id = request_delivery_id
  for update;

  if existing_delivery.id is not null then
    if existing_delivery.payload_fingerprint <> request_fingerprint
      or existing_delivery.event_type <> request_event
      or existing_delivery.provider_lead_id <> request_lead_id
      or existing_delivery.campaign_yelp_id <> request_campaign_id
    then
      raise exception using
        errcode = '23505',
        message = 'MIGHTY_APES_YELP_DELIVERY_CONFLICT';
    end if;

    return jsonb_build_object(
      'status', case
        when existing_delivery.event_type = 'lead.test' then 'test_accepted'
        else 'duplicate'
      end,
      'event_id', existing_delivery.id,
      'lead_id', existing_delivery.linked_lead_id,
      'intake_record_id', existing_delivery.lead_intake_record_id,
      'sync_log_id', existing_delivery.integration_sync_log_id,
      'notification_id', existing_delivery.notification_id
    );
  end if;

  if request_event = 'lead.test' then
    insert into public.mighty_apes_yelp_webhook_events (
      company_id,
      delivery_id,
      payload_fingerprint,
      header_timestamp,
      payload_version,
      event_type,
      provider_lead_id,
      campaign_yelp_id,
      campaign_name,
      provider_created_at,
      outcome,
      received_at
    ) values (
      target_company.id,
      request_delivery_id,
      request_fingerprint,
      request_header_timestamp,
      request_version,
      request_event,
      request_lead_id,
      request_campaign_id,
      request_campaign_name,
      request_created_at,
      'test_accepted',
      request_received_at
    )
    returning id into created_event_id;

    return jsonb_build_object(
      'status', 'test_accepted',
      'event_id', created_event_id,
      'lead_id', null,
      'intake_record_id', null,
      'sync_log_id', null,
      'notification_id', null
    );
  end if;

  select intake.*
  into existing_intake
  from public.lead_intake_records as intake
  where intake.provider = 'yelp'
    and intake.provider_event_id = request_lead_id
  for update;

  if existing_intake.id is not null then
    select
      lead.company_id
    into existing_lead_company_id
    from public.leads as lead
    where lead.id = existing_intake.linked_lead_id
    for share;

    select
      sync_log.company_id,
      sync_log.provider,
      sync_log.external_id,
      sync_log.related_table,
      sync_log.related_record_id
    into
      existing_sync_company_id,
      existing_sync_provider,
      existing_sync_external_id,
      existing_sync_related_table,
      existing_sync_related_record_id
    from public.integration_sync_logs as sync_log
    where sync_log.id = existing_intake.integration_sync_log_id
    for share;

    if existing_intake.company_id is distinct from target_company.id
      or existing_intake.company_location_id is distinct from target_route.company_location_id
      or existing_intake.company_key is distinct from target_route.company_key
      or existing_intake.branch_key is distinct from target_route.branch_key
      or existing_intake.assigned_queue is distinct from target_route.assigned_queue
      or existing_intake.linked_lead_id is null
      or existing_intake.integration_sync_log_id is null
      or existing_lead_company_id is distinct from target_company.id
      or existing_sync_company_id is distinct from target_company.id
      or existing_sync_provider is distinct from 'yelp'
      or existing_sync_external_id is distinct from request_lead_id
      or existing_sync_related_table is distinct from 'leads'
      or existing_sync_related_record_id is distinct from existing_intake.linked_lead_id
    then
      raise exception using
        errcode = '55000',
        message = 'Existing Yelp intake does not match the authorized campaign route.';
    end if;

    select webhook_event.*
    into prior_delivery
    from public.mighty_apes_yelp_webhook_events as webhook_event
    where webhook_event.provider_lead_id = request_lead_id
      and webhook_event.event_type = 'lead.created'
      and webhook_event.linked_lead_id = existing_intake.linked_lead_id
      and webhook_event.notification_id is not null
    order by webhook_event.processed_at asc
    limit 1;

    if prior_delivery.notification_id is null then
      raise exception using
        errcode = '55000',
        message = 'Existing Yelp intake is missing its durable delivery evidence.';
    end if;

    if prior_delivery.company_id is distinct from target_company.id
      or prior_delivery.campaign_yelp_id is distinct from request_campaign_id
      or prior_delivery.payload_fingerprint is distinct from request_fingerprint
    then
      raise exception using
        errcode = '23505',
        message = 'MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT';
    end if;

    insert into public.mighty_apes_yelp_webhook_events (
      company_id,
      delivery_id,
      payload_fingerprint,
      header_timestamp,
      payload_version,
      event_type,
      provider_lead_id,
      campaign_yelp_id,
      campaign_name,
      provider_created_at,
      outcome,
      linked_lead_id,
      lead_intake_record_id,
      integration_sync_log_id,
      notification_id,
      received_at
    ) values (
      target_company.id,
      request_delivery_id,
      request_fingerprint,
      request_header_timestamp,
      request_version,
      request_event,
      request_lead_id,
      request_campaign_id,
      request_campaign_name,
      request_created_at,
      'duplicate',
      existing_intake.linked_lead_id,
      existing_intake.id,
      existing_intake.integration_sync_log_id,
      prior_delivery.notification_id,
      request_received_at
    )
    returning id into created_event_id;

    return jsonb_build_object(
      'status', 'duplicate',
      'event_id', created_event_id,
      'lead_id', existing_intake.linked_lead_id,
      'intake_record_id', existing_intake.id,
      'sync_log_id', existing_intake.integration_sync_log_id,
      'notification_id', prior_delivery.notification_id
    );
  end if;

  lead_property_address := 'Yelp lead - address pending';
  lead_notes := concat(
    'Mighty Apes Yelp lead intake:', E'\n',
    'Provider: Mighty Apes', E'\n',
    'Source: Yelp', E'\n',
    'Company routing: ', target_company.name, E'\n',
    'Branch routing: ', target_route.branch_key, E'\n',
    'Campaign Yelp ID: ', request_campaign_id, E'\n',
    'Campaign name: ', request_campaign_name, E'\n',
    'Yelp Lead ID: ', request_lead_id, E'\n',
    'ZIP code: ', request_zip_code, E'\n',
    'Job category: ', coalesce(request_job_category, 'Not provided'), E'\n',
    'Provider created at: ', request_created_at_raw, E'\n',
    'Email: Not provided by Yelp', E'\n',
    'Questionnaire:', E'\n', request_message
  );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'customer_name'
  ) then
    execute $insert_legacy_lead$
      insert into public.leads (
        company_id,
        customer_name,
        phone,
        email,
        property_address,
        lead_source,
        service_needed,
        status,
        pipeline_stage,
        priority,
        estimated_value,
        next_follow_up,
        notes
      ) values ($1, $2, $3, null, $4, 'Yelp', 'roofing', 'new', 'new_lead', 'normal', 0, null, $5)
      returning id
    $insert_legacy_lead$
    into created_lead_id
    using
      target_company.id,
      request_lead_name,
      request_lead_phone,
      concat(lead_property_address, ', AZ ', request_zip_code),
      lead_notes;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'contact_name'
  ) then
    insert into public.leads (
      company_id,
      company_location_id,
      customer_id,
      contact_name,
      phone,
      email,
      property_address,
      city,
      state,
      postal_code,
      service_type,
      source,
      status,
      pipeline_stage,
      priority,
      estimated_value,
      next_follow_up,
      notes
    ) values (
      target_company.id,
      target_route.company_location_id,
      null,
      request_lead_name,
      request_lead_phone,
      null,
      lead_property_address,
      null,
      'AZ',
      request_zip_code,
      target_route.service_type,
      'Yelp',
      'new',
      'new_lead',
      'normal',
      0,
      null,
      lead_notes
    )
    returning id into created_lead_id;
  else
    raise exception using
      errcode = '55000',
      message = 'The CRM lead schema is not compatible with Mighty Apes intake.';
  end if;

  insert into public.integration_sync_logs (
    company_id,
    integration_connection_id,
    provider,
    direction,
    event_type,
    status,
    related_table,
    related_record_id,
    external_id,
    attempt_count,
    max_attempts,
    last_attempted_at,
    completed_at,
    request_fingerprint,
    request_summary,
    response_summary
  ) values (
    target_company.id,
    null,
    'yelp',
    'provider_to_weathertech',
    'yelp.lead.created',
    'succeeded',
    'leads',
    created_lead_id,
    request_lead_id,
    1,
    1,
    request_received_at,
    now(),
    request_fingerprint,
    jsonb_build_object(
      'adapter', 'mighty_apes',
      'event', request_event,
      'delivery_id', request_delivery_id,
      'campaign_yelp_id', request_campaign_id,
      'provider_lead_id', request_lead_id,
      'provider_created_at', request_created_at_raw,
      'has_name', true,
      'has_phone', true,
      'has_zip_code', true,
      'has_job_category', request_job_category is not null,
      'message_length', length(request_message),
      'signature_validated', true
    ),
    jsonb_build_object(
      'persisted', true,
      'lead_id', created_lead_id,
      'outbound_sent', false
    )
  )
  returning id into created_sync_log_id;

  insert into public.notifications (
    company_id,
    customer_id,
    employee_id,
    title,
    message,
    channel,
    status,
    remind_at
  ) values (
    target_company.id,
    null,
    null,
    concat('Follow up: ', request_lead_name),
    concat(
      'New Yelp lead from Mighty Apes was added to ', target_company.name, '. ',
      'Review CRM lead ', created_lead_id, ' in Leads or Unified Inbox.'
    ),
    'in_app',
    'queued',
    request_received_at
  )
  returning id into created_notification_id;

  insert into public.lead_intake_records (
    company_id,
    company_location_id,
    linked_lead_id,
    linked_customer_id,
    integration_sync_log_id,
    provider,
    provider_event_id,
    source,
    source_detail,
    campaign,
    correlation_id,
    company_key,
    branch_key,
    routing_status,
    status,
    duplicate_confidence,
    follow_up_state,
    urgency,
    assigned_queue,
    contact_name,
    phone,
    email,
    service_address,
    city,
    state,
    postal_code,
    requested_service,
    message,
    preferred_contact_method,
    source_metadata,
    safe_raw_source_reference,
    possible_matches,
    routing_reasons,
    review_notes,
    intake_timestamp,
    original_submission_timestamp
  ) values (
    target_company.id,
    target_route.company_location_id,
    created_lead_id,
    null,
    created_sync_log_id,
    'yelp',
    request_lead_id,
    'Yelp',
    'Mighty Apes',
    request_campaign_name,
    concat('mighty-apes-yelp:', request_lead_id),
    target_route.company_key,
    target_route.branch_key,
    'ready_to_create',
    'lead_created',
    'no_match',
    'scheduled',
    'normal',
    target_route.assigned_queue,
    request_lead_name,
    request_lead_phone,
    null,
    lead_property_address,
    null,
    'AZ',
    request_zip_code,
    target_route.service_type,
    request_message,
    'phone',
    jsonb_build_object(
      'provider', 'mighty_apes',
      'provider_event', request_event,
      'delivery_id', request_delivery_id,
      'payload_fingerprint', request_fingerprint,
      'signature_validated', true,
      'campaign_yelp_id', request_campaign_id,
      'campaign_name', request_campaign_name,
      'provider_lead_id', request_lead_id,
      'provider_created_at', request_created_at_raw,
      'job_category', request_job_category,
      'email_supplied', false,
      'outbound_sent', false
    ),
    concat('mighty-apes:yelp:', request_lead_id),
    '[]'::jsonb,
    jsonb_build_array(
      'Verified Mighty Apes campaign routed by the authorized campaign registry.',
      concat('Authorized queue: ', target_route.assigned_queue, '.')
    ),
    null,
    request_received_at,
    request_created_at
  )
  returning id into created_intake_id;

  insert into public.mighty_apes_yelp_webhook_events (
    company_id,
    delivery_id,
    payload_fingerprint,
    header_timestamp,
    payload_version,
    event_type,
    provider_lead_id,
    campaign_yelp_id,
    campaign_name,
    provider_created_at,
    outcome,
    linked_lead_id,
    lead_intake_record_id,
    integration_sync_log_id,
    notification_id,
    received_at
  ) values (
    target_company.id,
    request_delivery_id,
    request_fingerprint,
    request_header_timestamp,
    request_version,
    request_event,
    request_lead_id,
    request_campaign_id,
    request_campaign_name,
    request_created_at,
    'created',
    created_lead_id,
    created_intake_id,
    created_sync_log_id,
    created_notification_id,
    request_received_at
  )
  returning id into created_event_id;

  return jsonb_build_object(
    'status', 'created',
    'event_id', created_event_id,
    'lead_id', created_lead_id,
    'intake_record_id', created_intake_id,
    'sync_log_id', created_sync_log_id,
    'notification_id', created_notification_id
  );
end;
$$;

revoke all on function public.wtos_ingest_mighty_apes_yelp(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_ingest_mighty_apes_yelp(jsonb) to service_role;


revoke execute on function public.wtos_automation_conditions_valid_v1(jsonb)
from public, anon, authenticated;
revoke execute on function public.wtos_automation_action_config_valid_v1(text, jsonb)
from public, anon, authenticated;
revoke execute on function public.wtos_automation_conditions_match_v1(jsonb, jsonb)
from public, anon, authenticated;
revoke execute on function public.wtos_reject_automation_ledger_mutation_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_guard_automation_execution_update_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_validate_office_task_automation_scope_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_is_company_owner_or_admin_v1(uuid)
from public, anon, authenticated;
revoke execute on function public.wtos_build_automation_action_input_v1(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.wtos_execute_automation_execution_v1(uuid, timestamptz, text)
from public, anon, authenticated;
revoke execute on function public.wtos_emit_automation_event_v1(
  uuid, uuid, text, text, text, text, jsonb, timestamptz, uuid, text
) from public, anon, authenticated;
revoke execute on function public.wtos_emit_lead_automation_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_assign_lead_intake_location_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_propagate_lead_intake_location_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_inspection_automation_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_estimate_automation_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_job_automation_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_customer_automation_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_invoice_automation_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_inbound_communication_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_inbound_email_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_missed_call_event_v1()
from public, anon, authenticated;
revoke execute on function public.wtos_emit_due_task_events_v1(timestamptz, integer, uuid)
from public, anon, authenticated;
revoke execute on function public.wtos_run_automation_worker_core_v1(
  timestamptz, integer, uuid, text
) from public, anon, authenticated;
revoke execute on function public.wtos_run_automation_worker_v1(timestamptz, integer)
from public, anon, authenticated;
revoke execute on function public.wtos_run_due_automations_v1(uuid, integer)
from public, anon, authenticated;
revoke execute on function public.wtos_set_automation_rule_enabled_v1(
  uuid, integer, boolean, text
) from public, anon, authenticated;
revoke execute on function public.wtos_review_automation_execution_v1(
  uuid, integer, text, text
) from public, anon, authenticated;
revoke execute on function public.wtos_cancel_automation_execution_v1(
  uuid, integer, text
) from public, anon, authenticated;
revoke execute on function public.wtos_retry_automation_execution_v1(
  uuid, integer, text
) from public, anon, authenticated;
revoke execute on function public.wtos_reserve_ai_request_v1(uuid, uuid, uuid, jsonb)
from public, anon, authenticated;
revoke execute on function public.wtos_ai_action_preview_fingerprint_v1(jsonb, integer)
from public, anon, authenticated;
revoke execute on function public.wtos_review_ai_action_v1(
  uuid, text, text, text, integer, text
) from public, anon, authenticated;

grant execute on function public.wtos_set_automation_rule_enabled_v1(
  uuid, integer, boolean, text
) to authenticated;
grant execute on function public.wtos_review_automation_execution_v1(
  uuid, integer, text, text
) to authenticated;
grant execute on function public.wtos_cancel_automation_execution_v1(
  uuid, integer, text
) to authenticated;
grant execute on function public.wtos_retry_automation_execution_v1(
  uuid, integer, text
) to authenticated;
grant execute on function public.wtos_run_due_automations_v1(uuid, integer)
to authenticated;
grant execute on function public.wtos_ai_action_preview_fingerprint_v1(jsonb, integer)
to authenticated;
grant execute on function public.wtos_review_ai_action_v1(
  uuid, text, text, text, integer, text
) to authenticated;

grant execute on function public.wtos_run_automation_worker_v1(timestamptz, integer)
to service_role;
grant execute on function public.wtos_reserve_ai_request_v1(uuid, uuid, uuid, jsonb)
to service_role;
grant execute on function public.wtos_automation_conditions_valid_v1(jsonb)
to service_role;
grant execute on function public.wtos_automation_action_config_valid_v1(text, jsonb)
to service_role;
grant execute on function public.wtos_automation_conditions_match_v1(jsonb, jsonb)
to service_role;
grant execute on function public.wtos_ai_action_preview_fingerprint_v1(jsonb, integer)
to service_role;
grant execute on function public.wtos_review_ai_action_v1(
  uuid, text, text, text, integer, text
) to service_role;

commit;
