begin;

-- CRM Identity Integrity Phase 1: final invariant hardening
--
-- The service role may read the immutable ledger and remove only synthetic
-- regression rows accepted by its existing prefix-gated delete trigger. It
-- must not insert, update, truncate, reference, or trigger the ledger directly.

revoke all on table public.crm_identity_reconciliation_events from service_role;
grant select, delete on table public.crm_identity_reconciliation_events to service_role;

-- Freeze the seven relationship tables while checking the graph and installing
-- the invariant. No relationship write can slip between preflight and trigger
-- creation. Properties are locked first to minimize one-time migration cycles.
set local lock_timeout = '5s';
lock table
  public.properties,
  public.leads,
  public.estimates,
  public.inspections,
  public.jobs,
  public.schedule_events,
  public.office_tasks
in share row exclusive mode;

do $$
begin
  if exists (
    select 1
    from public.leads as child
    join public.properties as property on property.id = child.property_id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.estimates as child
    join public.properties as property on property.id = child.property_id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.inspections as child
    join public.properties as property on property.id = child.property_id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.jobs as child
    join public.properties as property on property.id = child.property_id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.schedule_events as child
    join public.properties as property on property.id = child.property_id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.office_tasks as child
    join public.properties as property on property.id = child.property_id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) then
    raise exception
      'Existing CRM graph contains a property/customer mismatch; invariant hardening aborted.'
      using errcode = '23514';
  end if;
end;
$$;

-- Serialize every identity-link statement before PostgreSQL takes a property or
-- child tuple lock. If another identity transaction already owns the lock, wait
-- for it to finish and fail with a retryable serialization error instead of
-- continuing under the statement snapshot captured before that commit.
create or replace function public.wtos_acquire_crm_identity_invariant_lock()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invariant_lock_key bigint := hashtextextended(
    'wtos:crm-identity-property-invariant:coordinator',
    0
  );
begin
  if not pg_try_advisory_xact_lock(invariant_lock_key) then
    perform pg_advisory_xact_lock(invariant_lock_key);
    raise exception 'Concurrent CRM identity mutation completed; retry with fresh versions.'
      using errcode = '40001';
  end if;
end;
$$;

revoke all on function public.wtos_acquire_crm_identity_invariant_lock()
from public, anon, authenticated, service_role;

create or replace function public.wtos_serialize_crm_identity_link_statement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wtos_acquire_crm_identity_invariant_lock();
  return null;
end;
$$;

revoke all on function public.wtos_serialize_crm_identity_link_statement()
from public, anon, authenticated, service_role;

-- The reviewed RPC locks rows before issuing its first UPDATE, so it must take
-- the same coordinator before entering the already-validated hardened core.
alter function public.wtos_reconcile_customer_property(jsonb)
rename to wtos_reconcile_customer_property_serialized_core;

revoke all on function public.wtos_reconcile_customer_property_serialized_core(jsonb)
from public, anon, authenticated, service_role;

create or replace function public.wtos_reconcile_customer_property(
  reconciliation_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.wtos_acquire_crm_identity_invariant_lock();
  return public.wtos_reconcile_customer_property_serialized_core(reconciliation_request);
end;
$$;

revoke all on function public.wtos_reconcile_customer_property(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_reconcile_customer_property(jsonb)
to authenticated;

-- INSERT triggers cover newly linked rows; the UPDATE triggers are deliberately
-- column-specific so unrelated operational edits retain normal concurrency.
create trigger properties_serialize_crm_identity_insert
before insert on public.properties
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger properties_serialize_crm_identity_update
before update of company_id, customer_id on public.properties
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger leads_serialize_crm_identity_insert
before insert on public.leads
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger leads_serialize_crm_identity_update
before update of company_id, customer_id, property_id on public.leads
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger estimates_serialize_crm_identity_insert
before insert on public.estimates
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger estimates_serialize_crm_identity_update
before update of company_id, customer_id, property_id on public.estimates
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger inspections_serialize_crm_identity_insert
before insert on public.inspections
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger inspections_serialize_crm_identity_update
before update of company_id, customer_id, property_id on public.inspections
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger jobs_serialize_crm_identity_insert
before insert on public.jobs
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger jobs_serialize_crm_identity_update
before update of company_id, customer_id, property_id on public.jobs
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger schedule_events_serialize_crm_identity_insert
before insert on public.schedule_events
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger schedule_events_serialize_crm_identity_update
before update of company_id, customer_id, property_id on public.schedule_events
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger office_tasks_serialize_crm_identity_insert
before insert on public.office_tasks
for each statement execute function public.wtos_serialize_crm_identity_link_statement();
create trigger office_tasks_serialize_crm_identity_update
before update of company_id, customer_id, property_id on public.office_tasks
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

-- Validate final graph state at transaction end. The statement coordinator is
-- already held, so this function does not wait on property or child tuples and
-- cannot form a property-to-child/child-to-property lock cycle. It never repairs
-- or backfills a business row.
create or replace function public.wtos_enforce_crm_identity_property_customer_invariant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(new);
  old_row_data jsonb;
  current_property_id uuid;
  prior_property_id uuid;
  property_to_validate uuid;
begin
  perform public.wtos_acquire_crm_identity_invariant_lock();

  if tg_table_schema = 'public' and tg_table_name = 'properties' then
    current_property_id := nullif(row_data ->> 'id', '')::uuid;
  else
    current_property_id := nullif(row_data ->> 'property_id', '')::uuid;
  end if;

  if tg_op = 'UPDATE' then
    old_row_data := to_jsonb(old);
    if tg_table_schema = 'public' and tg_table_name = 'properties' then
      prior_property_id := nullif(old_row_data ->> 'id', '')::uuid;
    else
      prior_property_id := nullif(old_row_data ->> 'property_id', '')::uuid;
    end if;
  end if;

  for property_to_validate in
    select distinct candidate.property_id
    from unnest(array[current_property_id, prior_property_id])
      as candidate(property_id)
    where candidate.property_id is not null
    order by candidate.property_id
  loop
    if exists (
      select 1
      from public.properties as property
      join public.leads as child on child.property_id = property.id
      where property.id = property_to_validate
        and property.customer_id is not null
        and child.customer_id is not null
        and child.customer_id is distinct from property.customer_id
    ) or exists (
      select 1
      from public.properties as property
      join public.estimates as child on child.property_id = property.id
      where property.id = property_to_validate
        and property.customer_id is not null
        and child.customer_id is not null
        and child.customer_id is distinct from property.customer_id
    ) or exists (
      select 1
      from public.properties as property
      join public.inspections as child on child.property_id = property.id
      where property.id = property_to_validate
        and property.customer_id is not null
        and child.customer_id is not null
        and child.customer_id is distinct from property.customer_id
    ) or exists (
      select 1
      from public.properties as property
      join public.jobs as child on child.property_id = property.id
      where property.id = property_to_validate
        and property.customer_id is not null
        and child.customer_id is not null
        and child.customer_id is distinct from property.customer_id
    ) or exists (
      select 1
      from public.properties as property
      join public.schedule_events as child on child.property_id = property.id
      where property.id = property_to_validate
        and property.customer_id is not null
        and child.customer_id is not null
        and child.customer_id is distinct from property.customer_id
    ) or exists (
      select 1
      from public.properties as property
      join public.office_tasks as child on child.property_id = property.id
      where property.id = property_to_validate
        and property.customer_id is not null
        and child.customer_id is not null
        and child.customer_id is distinct from property.customer_id
    ) then
      raise exception 'Property customer assignment conflicts with an existing CRM graph row.'
        using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.wtos_enforce_crm_identity_property_customer_invariant()
from public, anon, authenticated, service_role;

create constraint trigger properties_enforce_crm_identity_property_customer
after insert or update on public.properties
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger leads_enforce_crm_identity_property_customer
after insert or update on public.leads
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger estimates_enforce_crm_identity_property_customer
after insert or update on public.estimates
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger inspections_enforce_crm_identity_property_customer
after insert or update on public.inspections
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger jobs_enforce_crm_identity_property_customer
after insert or update on public.jobs
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger schedule_events_enforce_crm_identity_property_customer
after insert or update on public.schedule_events
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger office_tasks_enforce_crm_identity_property_customer
after insert or update on public.office_tasks
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

commit;
