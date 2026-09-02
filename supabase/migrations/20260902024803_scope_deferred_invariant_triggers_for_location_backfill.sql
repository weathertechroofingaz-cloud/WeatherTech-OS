begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- PostgreSQL will not ALTER a relation while deferred trigger events for that
-- relation remain queued. The automation foundation performs location-only
-- backfills immediately before ALTER TABLE on leads and office_tasks. Scope the
-- existing deferred invariant triggers to the columns their functions actually
-- protect so those unrelated backfills cannot queue them. The trigger functions,
-- INSERT coverage, deferred timing, and enabled state remain unchanged.

lock table public.leads, public.office_tasks in access exclusive mode;

do $precondition$
declare
  contract_mismatch_count integer;
begin
  if pg_catalog.to_regprocedure(
    'public.wtos_enforce_crm_identity_property_customer_invariant()'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Deferred invariant trigger compatibility precondition failed: CRM identity function is missing.';
  end if;

  if pg_catalog.to_regprocedure(
    'public.wtos_enforce_accountable_lead_funnel_linkage()'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Deferred invariant trigger compatibility precondition failed: accountability function is missing.';
  end if;

  with expected (
    relation_id,
    trigger_name,
    function_id
  ) as (
    values
      (
        'public.leads'::pg_catalog.regclass,
        'leads_enforce_crm_identity_property_customer'::text,
        'public.wtos_enforce_crm_identity_property_customer_invariant()'::pg_catalog.regprocedure
      ),
      (
        'public.office_tasks'::pg_catalog.regclass,
        'office_tasks_enforce_crm_identity_property_customer'::text,
        'public.wtos_enforce_crm_identity_property_customer_invariant()'::pg_catalog.regprocedure
      ),
      (
        'public.leads'::pg_catalog.regclass,
        'leads_enforce_accountable_funnel_linkage'::text,
        'public.wtos_enforce_accountable_lead_funnel_linkage()'::pg_catalog.regprocedure
      )
  )
  select pg_catalog.count(*)
  into contract_mismatch_count
  from expected
  left join pg_catalog.pg_trigger as trigger
    on trigger.tgrelid = expected.relation_id
   and trigger.tgname = expected.trigger_name
  left join pg_catalog.pg_constraint as constraint_record
    on constraint_record.oid = trigger.tgconstraint
  where trigger.oid is null
    or trigger.tgisinternal
    or trigger.tgfoid <> expected.function_id
    or trigger.tgtype <> 21
    or trigger.tgenabled <> 'O'
    or trigger.tgparentid <> 0
    or trigger.tgconstrrelid <> 0
    or trigger.tgconstrindid <> 0
    or not trigger.tgdeferrable
    or not trigger.tginitdeferred
    or trigger.tgnargs <> 0
    or trigger.tgqual is not null
    or pg_catalog.obj_description(trigger.oid, 'pg_trigger') is not null
    or pg_catalog.cardinality(trigger.tgattr::smallint[]) <> 0
    or constraint_record.oid is null
    or constraint_record.conrelid <> expected.relation_id
    or constraint_record.conname <> expected.trigger_name
    or constraint_record.connamespace <>
      'public'::pg_catalog.regnamespace
    or constraint_record.contype <> 't'
    or not constraint_record.condeferrable
    or not constraint_record.condeferred
    or not constraint_record.convalidated
    or not constraint_record.connoinherit
    or not constraint_record.conislocal
    or constraint_record.coninhcount <> 0
    or constraint_record.conparentid <> 0
    or pg_catalog.obj_description(
      constraint_record.oid,
      'pg_constraint'
    ) is not null;

  if contract_mismatch_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Deferred invariant trigger compatibility precondition failed: existing trigger contract changed.';
  end if;
end;
$precondition$;

drop trigger leads_enforce_crm_identity_property_customer on public.leads;
create constraint trigger leads_enforce_crm_identity_property_customer
after insert or update of company_id, customer_id, property_id on public.leads
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

drop trigger office_tasks_enforce_crm_identity_property_customer on public.office_tasks;
create constraint trigger office_tasks_enforce_crm_identity_property_customer
after insert or update of company_id, customer_id, property_id on public.office_tasks
deferrable initially deferred
for each row execute function public.wtos_enforce_crm_identity_property_customer_invariant();

drop trigger leads_enforce_accountable_funnel_linkage on public.leads;
create constraint trigger leads_enforce_accountable_funnel_linkage
after insert or update of id, company_id, status, pipeline_stage on public.leads
deferrable initially deferred
for each row execute function public.wtos_enforce_accountable_lead_funnel_linkage();

do $postcondition$
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
    raise exception using
      errcode = '55000',
      message = 'Deferred invariant trigger compatibility postcondition failed.';
  end if;
end;
$postcondition$;

commit;
