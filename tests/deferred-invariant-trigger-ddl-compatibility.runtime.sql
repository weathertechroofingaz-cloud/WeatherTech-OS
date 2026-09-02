begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $assert$
declare
  contract_mismatch_count integer;
begin
  with expected (
    relation_id,
    trigger_name,
    function_id,
    update_columns
  ) as (
    values
      (
        'public.leads'::pg_catalog.regclass,
        'leads_enforce_crm_identity_property_customer'::text,
        'public.wtos_enforce_crm_identity_property_customer_invariant()'::pg_catalog.regprocedure,
        array['company_id', 'customer_id', 'property_id']::text[]
      ),
      (
        'public.office_tasks'::pg_catalog.regclass,
        'office_tasks_enforce_crm_identity_property_customer'::text,
        'public.wtos_enforce_crm_identity_property_customer_invariant()'::pg_catalog.regprocedure,
        array['company_id', 'customer_id', 'property_id']::text[]
      ),
      (
        'public.leads'::pg_catalog.regclass,
        'leads_enforce_accountable_funnel_linkage'::text,
        'public.wtos_enforce_accountable_lead_funnel_linkage()'::pg_catalog.regprocedure,
        array['company_id', 'id', 'pipeline_stage', 'status']::text[]
      )
  ), actual as (
    select
      expected.*,
      trigger.oid as trigger_id,
      trigger.tgisinternal,
      trigger.tgfoid,
      trigger.tgtype,
      trigger.tgenabled,
      trigger.tgparentid,
      trigger.tgconstrrelid,
      trigger.tgconstrindid,
      trigger.tgdeferrable,
      trigger.tginitdeferred,
      trigger.tgnargs,
      trigger.tgqual,
      pg_catalog.obj_description(
        trigger.oid,
        'pg_trigger'
      ) as trigger_comment,
      constraint_record.oid as constraint_id,
      constraint_record.conrelid,
      constraint_record.conname,
      constraint_record.connamespace,
      constraint_record.contype,
      constraint_record.condeferrable,
      constraint_record.condeferred,
      constraint_record.convalidated,
      constraint_record.connoinherit,
      constraint_record.conislocal,
      constraint_record.coninhcount,
      constraint_record.conparentid,
      pg_catalog.obj_description(
        constraint_record.oid,
        'pg_constraint'
      ) as constraint_comment,
      coalesce(
        (
          select pg_catalog.array_agg(
            attribute.attname::text
            order by attribute.attname
          )
          from pg_catalog.unnest(trigger.tgattr::smallint[]) as trigger_column(attribute_number)
          join pg_catalog.pg_attribute as attribute
            on attribute.attrelid = expected.relation_id
           and attribute.attnum = trigger_column.attribute_number
           and not attribute.attisdropped
        ),
        '{}'::text[]
      ) as actual_update_columns
    from expected
    left join pg_catalog.pg_trigger as trigger
      on trigger.tgrelid = expected.relation_id
     and trigger.tgname = expected.trigger_name
    left join pg_catalog.pg_constraint as constraint_record
      on constraint_record.oid = trigger.tgconstraint
  )
  select pg_catalog.count(*)
  into contract_mismatch_count
  from actual
  where actual.trigger_id is null
    or actual.tgisinternal
    or actual.tgfoid <> actual.function_id
    or actual.tgtype <> 21
    or actual.tgenabled <> 'O'
    or actual.tgparentid <> 0
    or actual.tgconstrrelid <> 0
    or actual.tgconstrindid <> 0
    or not actual.tgdeferrable
    or not actual.tginitdeferred
    or actual.tgnargs <> 0
    or actual.tgqual is not null
    or actual.trigger_comment is not null
    or actual.constraint_id is null
    or actual.conrelid <> actual.relation_id
    or actual.conname <> actual.trigger_name
    or actual.connamespace <> 'public'::pg_catalog.regnamespace
    or actual.contype <> 't'
    or not actual.condeferrable
    or not actual.condeferred
    or not actual.convalidated
    or not actual.connoinherit
    or not actual.conislocal
    or actual.coninhcount <> 0
    or actual.conparentid <> 0
    or actual.constraint_comment is not null
    or actual.actual_update_columns <> actual.update_columns;

  if contract_mismatch_count <> 0 then
    raise exception 'Deferred invariant trigger runtime contract changed.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    where trigger.tgrelid = 'public.leads'::pg_catalog.regclass
      and trigger.tgname = 'leads_enforce_accountable_outcome_insert'
      and not trigger.tgisinternal
      and trigger.tgtype = 5
      and trigger.tgenabled = 'O'
      and trigger.tgdeferrable
      and trigger.tginitdeferred
      and trigger.tgfoid =
        'public.wtos_enforce_accountable_lead_outcome()'::pg_catalog.regprocedure
  ) then
    raise exception 'Insert-only accountable outcome trigger contract changed.';
  end if;
end;
$assert$;

-- Exercise the actual PostgreSQL deferred-event/DDL behavior without touching
-- persistent rows. The temporary tables use the same functions and UPDATE OF
-- scopes as the installed triggers.
create temporary table wtos_deferred_lead_scope_probe (
  id uuid primary key,
  company_id uuid,
  customer_id uuid,
  property_id uuid,
  company_location_id uuid,
  status text,
  pipeline_stage text
) on commit drop;

create temporary table wtos_deferred_office_task_scope_probe (
  id uuid primary key,
  company_id uuid,
  customer_id uuid,
  property_id uuid,
  company_location_id uuid
) on commit drop;

insert into wtos_deferred_lead_scope_probe (
  id, company_id, customer_id, status, pipeline_stage
) values (
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  'new',
  'new'
);

insert into wtos_deferred_office_task_scope_probe (
  id, company_id, customer_id
) values (
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid()
);

create constraint trigger wtos_probe_lead_identity
after insert or update of company_id, customer_id, property_id
on wtos_deferred_lead_scope_probe
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

create constraint trigger wtos_probe_lead_funnel
after insert or update of id, company_id, status, pipeline_stage
on wtos_deferred_lead_scope_probe
deferrable initially deferred
for each row execute function public.wtos_enforce_accountable_lead_funnel_linkage();

create constraint trigger wtos_probe_office_task_identity
after insert or update of company_id, customer_id, property_id
on wtos_deferred_office_task_scope_probe
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

-- Location-only updates must not queue any of the narrowed triggers, so DDL in
-- the same transaction must remain legal.
update wtos_deferred_lead_scope_probe
set company_location_id = pg_catalog.gen_random_uuid();

alter table wtos_deferred_lead_scope_probe
add column location_only_ddl_succeeded boolean;

update wtos_deferred_office_task_scope_probe
set company_location_id = pg_catalog.gen_random_uuid();

alter table wtos_deferred_office_task_scope_probe
add column location_only_ddl_succeeded boolean;

-- Relevant UPDATE targets must still queue deferred events and block ALTER
-- until their checks are explicitly drained.
update wtos_deferred_lead_scope_probe set status = status;

do $expect_lead_funnel_pending$
begin
  begin
    execute 'alter table wtos_deferred_lead_scope_probe add column unexpected_funnel_ddl boolean';
    raise exception 'Relevant lead funnel update did not queue a deferred trigger event.';
  exception
    when sqlstate '55006' then null;
  end;
end;
$expect_lead_funnel_pending$;

set constraints all immediate;
set constraints all deferred;

update wtos_deferred_lead_scope_probe set customer_id = customer_id;

do $expect_lead_identity_pending$
begin
  begin
    execute 'alter table wtos_deferred_lead_scope_probe add column unexpected_identity_ddl boolean';
    raise exception 'Relevant lead identity update did not queue a deferred trigger event.';
  exception
    when sqlstate '55006' then null;
  end;
end;
$expect_lead_identity_pending$;

set constraints all immediate;
set constraints all deferred;

update wtos_deferred_office_task_scope_probe set customer_id = customer_id;

do $expect_office_task_identity_pending$
begin
  begin
    execute 'alter table wtos_deferred_office_task_scope_probe add column unexpected_identity_ddl boolean';
    raise exception 'Relevant office-task identity update did not queue a deferred trigger event.';
  exception
    when sqlstate '55006' then null;
  end;
end;
$expect_office_task_identity_pending$;

set constraints all immediate;
set constraints all deferred;

rollback;
