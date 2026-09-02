begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temporary table wtos_lead_trigger_test_context (
  company_id uuid not null,
  company_location_id uuid not null,
  canonical_lead_id uuid not null,
  legacy_lead_id uuid not null,
  customer_id uuid not null,
  property_id uuid not null
) on commit drop;

insert into wtos_lead_trigger_test_context (
  company_id,
  company_location_id,
  canonical_lead_id,
  legacy_lead_id,
  customer_id,
  property_id
)
select
  company.id,
  location.id,
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid()
from public.companies as company
join public.company_locations as location
  on location.company_id = company.id
 and location.is_active
order by company.id, location.location_key
limit 1;

do $assert$
begin
  if (select count(*) from wtos_lead_trigger_test_context) <> 1 then
    raise exception 'Lead trigger compatibility test requires one active company location.';
  end if;
end;
$assert$;

create temporary table wtos_canonical_leads (
  id uuid primary key,
  company_id uuid not null,
  company_location_id uuid,
  customer_id uuid,
  property_id uuid,
  contact_name text not null,
  source text not null,
  status text not null,
  priority text,
  next_follow_up date,
  created_at timestamptz not null,
  updated_at timestamptz not null
) on commit drop;

create temporary table wtos_legacy_leads (
  id uuid primary key,
  company_id uuid not null,
  customer_name text not null,
  lead_source text not null,
  status text not null,
  priority text,
  next_follow_up date,
  created_at timestamptz not null,
  updated_at timestamptz not null
) on commit drop;

create trigger wtos_canonical_leads_emit_automation_event
after insert or update on wtos_canonical_leads
for each row execute function public.wtos_emit_lead_automation_event_v1();

create trigger wtos_legacy_leads_emit_automation_event
after insert or update on wtos_legacy_leads
for each row execute function public.wtos_emit_lead_automation_event_v1();

insert into wtos_canonical_leads (
  id,
  company_id,
  company_location_id,
  customer_id,
  property_id,
  contact_name,
  source,
  status,
  priority,
  next_follow_up,
  created_at,
  updated_at
)
select
  canonical_lead_id,
  company_id,
  company_location_id,
  customer_id,
  property_id,
  'WTOS TEST canonical lead',
  'Website',
  'new',
  'normal',
  current_date + 1,
  pg_catalog.now(),
  pg_catalog.now()
from wtos_lead_trigger_test_context;

insert into wtos_legacy_leads (
  id,
  company_id,
  customer_name,
  lead_source,
  status,
  priority,
  next_follow_up,
  created_at,
  updated_at
)
select
  legacy_lead_id,
  company_id,
  'WTOS TEST legacy lead',
  'Yelp',
  'new',
  'high',
  current_date + 2,
  pg_catalog.now(),
  pg_catalog.now()
from wtos_lead_trigger_test_context;

do $assert$
declare
  context_row wtos_lead_trigger_test_context%rowtype;
  canonical_event public.automation_events%rowtype;
  legacy_event public.automation_events%rowtype;
begin
  select * into strict context_row from wtos_lead_trigger_test_context;

  select *
  into strict canonical_event
  from public.automation_events as event
  where event.company_id = context_row.company_id
    and event.source_table = 'leads'
    and event.source_id = context_row.canonical_lead_id::text
    and event.event_type = 'lead.created';

  if canonical_event.company_location_id is distinct from context_row.company_location_id
    or canonical_event.payload ->> 'source' is distinct from 'Website'
    or canonical_event.payload ->> 'status' is distinct from 'new'
    or (canonical_event.payload ->> 'customer_id')::uuid is distinct from context_row.customer_id
    or (canonical_event.payload ->> 'property_id')::uuid is distinct from context_row.property_id then
    raise exception 'Canonical lead trigger event contract changed.';
  end if;

  select *
  into strict legacy_event
  from public.automation_events as event
  where event.company_id = context_row.company_id
    and event.source_table = 'leads'
    and event.source_id = context_row.legacy_lead_id::text
    and event.event_type = 'lead.created';

  if legacy_event.company_location_id is not null
    or legacy_event.payload ->> 'source' is distinct from 'Yelp'
    or legacy_event.payload ->> 'status' is distinct from 'new'
    or legacy_event.payload ? 'customer_id'
    or legacy_event.payload ? 'property_id' then
    raise exception 'Legacy lead trigger event contract changed.';
  end if;
end;
$assert$;

-- Priority-only writes retain the original short-circuit behavior.
update wtos_canonical_leads set priority = 'high';
update wtos_legacy_leads set priority = 'normal';

do $assert$
declare
  context_row wtos_lead_trigger_test_context%rowtype;
begin
  select * into strict context_row from wtos_lead_trigger_test_context;

  if (
    select count(*)
    from public.automation_events as event
    where event.company_id = context_row.company_id
      and event.source_table = 'leads'
      and event.source_id in (
        context_row.canonical_lead_id::text,
        context_row.legacy_lead_id::text
      )
  ) <> 2 then
    raise exception 'Non-semantic lead updates emitted automation events.';
  end if;
end;
$assert$;

update wtos_canonical_leads set status = 'contacted';
update wtos_legacy_leads set status = 'contacted';

do $assert$
declare
  context_row wtos_lead_trigger_test_context%rowtype;
begin
  select * into strict context_row from wtos_lead_trigger_test_context;

  if (
    select count(*)
    from public.automation_events as event
    where event.company_id = context_row.company_id
      and event.source_table = 'leads'
      and event.source_id in (
        context_row.canonical_lead_id::text,
        context_row.legacy_lead_id::text
      )
  ) <> 4 then
    raise exception 'Semantic lead updates did not emit exactly one event per schema.';
  end if;

  if exists (
    select 1
    from public.automation_events as event
    where event.company_id = context_row.company_id
      and event.source_table = 'leads'
      and event.source_id in (
        context_row.canonical_lead_id::text,
        context_row.legacy_lead_id::text
      )
      and event.event_type = 'lead.updated'
      and (
        event.payload ->> 'status' is distinct from 'contacted'
        or event.payload ->> 'previous_status' is distinct from 'new'
      )
  ) then
    raise exception 'Lead update payload semantics changed.';
  end if;
end;
$assert$;

rollback;
