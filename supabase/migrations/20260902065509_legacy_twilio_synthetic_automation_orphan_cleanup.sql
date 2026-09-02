-- This narrow boundary exists only for legacy non-Production Twilio regression
-- fixtures whose ordinary cleanup removed their exact lead roots before the
-- immutable automation ledger was checked. It cannot run outside the pinned
-- regression project and cannot delete a graph while any source lead remains.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.wtos_cleanup_legacy_twilio_automation_orphan(
  cleanup_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  trusted_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  request_operation_key uuid;
  request_regression_owner_user_id uuid;
  request_marker_family text;
  request_run_id text;
  request_source_marker text;
  expected_source_marker text;
  selected_owner record;
  request_event_ids uuid[] := '{}';
  request_execution_ids uuid[] := '{}';
  request_attempt_ids uuid[] := '{}';
  request_audit_ids uuid[] := '{}';
  actual_root_event_ids uuid[] := '{}';
  actual_event_ids uuid[] := '{}';
  actual_execution_ids uuid[] := '{}';
  actual_attempt_ids uuid[] := '{}';
  actual_audit_ids uuid[] := '{}';
  deleted_audit_events integer := 0;
  deleted_attempts integer := 0;
  deleted_executions integer := 0;
  deleted_events integer := 0;
  final_residue_count integer := 0;
begin
  if trusted_claims ->> 'iss' is distinct from 'supabase'
    or trusted_claims ->> 'role' is distinct from 'service_role'
    or trusted_claims ->> 'ref' is distinct from 'hygtnhmmaoboduqghhwg' then
    raise exception using
      errcode = '42501',
      message = 'Legacy Twilio automation orphan cleanup is restricted to the pinned regression project.';
  end if;

  if cleanup_request is null
    or jsonb_typeof(cleanup_request) <> 'object'
    or cleanup_request - array[
      'operationKey',
      'regressionOwnerUserId',
      'markerFamily',
      'runId',
      'sourceMarker',
      'eventIds',
      'executionIds',
      'attemptIds',
      'auditIds',
      'expectedCounts'
    ]::text[] <> '{}'::jsonb
    or not cleanup_request ?& array[
      'operationKey',
      'regressionOwnerUserId',
      'markerFamily',
      'runId',
      'sourceMarker',
      'eventIds',
      'executionIds',
      'attemptIds',
      'auditIds',
      'expectedCounts'
    ]::text[]
    or jsonb_typeof(cleanup_request -> 'operationKey') <> 'string'
    or jsonb_typeof(cleanup_request -> 'regressionOwnerUserId') <> 'string'
    or jsonb_typeof(cleanup_request -> 'markerFamily') <> 'string'
    or jsonb_typeof(cleanup_request -> 'runId') <> 'string'
    or jsonb_typeof(cleanup_request -> 'sourceMarker') <> 'string'
    or jsonb_typeof(cleanup_request -> 'eventIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'executionIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'attemptIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'auditIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'expectedCounts') <> 'object'
    or (cleanup_request -> 'expectedCounts') - array[
      'events',
      'executions',
      'attempts',
      'auditEvents'
    ]::text[] <> '{}'::jsonb
    or not ((cleanup_request -> 'expectedCounts') ?& array[
      'events',
      'executions',
      'attempts',
      'auditEvents'
    ]::text[]) then
    raise exception using
      errcode = '22023',
      message = 'Exact legacy Twilio orphan cleanup identity, graph arrays, and counts are required.';
  end if;

  if cleanup_request ->> 'operationKey'
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or cleanup_request ->> 'regressionOwnerUserId'
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception using
      errcode = '22023',
      message = 'Exact legacy Twilio orphan cleanup identity, graph arrays, and counts are required.';
  end if;

  request_operation_key := (cleanup_request ->> 'operationKey')::uuid;
  request_regression_owner_user_id :=
    (cleanup_request ->> 'regressionOwnerUserId')::uuid;
  request_marker_family := nullif(cleanup_request ->> 'markerFamily', '');
  request_run_id := lower(nullif(cleanup_request ->> 'runId', ''));
  request_source_marker := nullif(cleanup_request ->> 'sourceMarker', '');

  if request_regression_owner_user_id is distinct from
      '2150c43d-c5b6-4560-9ecb-142561ba1dc2'::uuid then
    raise exception using
      errcode = '42501',
      message = 'Only the canonical isolated regression owner can clean legacy Twilio automation orphans.';
  end if;

  if request_marker_family is null
    or request_run_id is null
    or request_marker_family not in ('twilio_voice', 'twilio_inbound')
    or request_run_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup requires an exact Voice or Inbound UUID marker.';
  end if;

  if request_marker_family = 'twilio_voice' then
    expected_source_marker :=
      'TEST WTOS REGRESSION TWILIO VOICE ' || request_run_id;
  elsif request_marker_family = 'twilio_inbound' then
    expected_source_marker :=
      'TEST WTOS REGRESSION TWILIO INBOUND ' || request_run_id;
  else
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup requires an exact Voice or Inbound UUID marker.';
  end if;

  if request_source_marker is distinct from expected_source_marker then
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup marker does not match the exact run family.';
  end if;

  select
    user_record.id,
    user_record.email,
    user_record.raw_app_meta_data
  into selected_owner
  from auth.users as user_record
  where user_record.id = request_regression_owner_user_id;

  if selected_owner.id is null
    or lower(selected_owner.email) is distinct from
      'weathertech-os-regression@example.test'
    or selected_owner.raw_app_meta_data is distinct from
      '{"provider":"email","providers":["email"],"wt_os_regression_marker":"weathertech-os-regression-owner-v1","wt_os_regression_project_ref":"hygtnhmmaoboduqghhwg"}'::jsonb
    or not exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = selected_owner.id
        and membership.role = 'owner'
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only the exact approved isolated regression owner can clean legacy Twilio automation orphans.';
  end if;

  if jsonb_array_length(cleanup_request -> 'eventIds') not between 1 and 100
    or jsonb_array_length(cleanup_request -> 'executionIds') > 100
    or jsonb_array_length(cleanup_request -> 'attemptIds') > 200
    or jsonb_array_length(cleanup_request -> 'auditIds') not between 1 and 500
    or exists (
      select 1
      from jsonb_each(cleanup_request -> 'expectedCounts') as count_entry(key, value)
      where jsonb_typeof(value) <> 'number'
        or value::text !~ '^[0-9]+$'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup graph exceeds its bounded contract.';
  end if;

  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_event_ids
  from jsonb_array_elements_text(cleanup_request -> 'eventIds');
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_execution_ids
  from jsonb_array_elements_text(cleanup_request -> 'executionIds');
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_attempt_ids
  from jsonb_array_elements_text(cleanup_request -> 'attemptIds');
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_audit_ids
  from jsonb_array_elements_text(cleanup_request -> 'auditIds');

  if cleanup_request -> 'eventIds' is distinct from to_jsonb(request_event_ids)
    or cleanup_request -> 'executionIds' is distinct from to_jsonb(request_execution_ids)
    or cleanup_request -> 'attemptIds' is distinct from to_jsonb(request_attempt_ids)
    or cleanup_request -> 'auditIds' is distinct from to_jsonb(request_audit_ids)
    or (cleanup_request -> 'expectedCounts' ->> 'events')::integer
      is distinct from cardinality(request_event_ids)
    or (cleanup_request -> 'expectedCounts' ->> 'executions')::integer
      is distinct from cardinality(request_execution_ids)
    or (cleanup_request -> 'expectedCounts' ->> 'attempts')::integer
      is distinct from cardinality(request_attempt_ids)
    or (cleanup_request -> 'expectedCounts' ->> 'auditEvents')::integer
      is distinct from cardinality(request_audit_ids) then
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup requires sorted unique graph IDs and exact counts.';
  end if;

  lock table
    public.leads,
    public.office_tasks,
    public.automation_events,
    public.automation_executions,
    public.automation_attempts,
    public.automation_audit_events
  in share row exclusive mode;

  select coalesce(array_agg(event.id order by event.id), '{}')
  into actual_root_event_ids
  from public.automation_events as event
  where event.causation_event_id is null
    and event.event_type = 'lead.created'
    and event.source_table = 'leads'
    and event.source_id
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and event.payload ->> 'source' = expected_source_marker
    and event.payload ->> 'lead_id' = event.source_id
    and event.payload ->> 'status' = 'new'
    and event.payload ->> 'priority' = 'normal';

  with recursive event_graph(id) as (
    select unnest(actual_root_event_ids)
    union
    select child.id
    from public.automation_events as child
    join event_graph as parent on parent.id = child.causation_event_id
  )
  select coalesce(array_agg(id order by id), '{}')
  into actual_event_ids
  from event_graph;

  if cardinality(actual_root_event_ids) < 1
    or actual_event_ids is distinct from actual_root_event_ids
    or actual_event_ids is distinct from request_event_ids then
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup requires an exact root-only orphan event graph.';
  end if;

  perform 1
  from public.automation_events as event
  where event.id = any(actual_event_ids)
  order by event.id
  for update;

  if exists (
    select 1
    from public.automation_events as root_event
    where root_event.id = any(actual_root_event_ids)
      and (
        root_event.company_id not in (
          '503d4701-ea18-4300-a4fa-91eb62cf6609'::uuid,
          'c0ae6238-909a-4273-9841-d044dd42a010'::uuid
        )
        or exists (
          select 1
          from public.leads as source_lead
          where source_lead.id = root_event.source_id::uuid
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy Twilio orphan cleanup requires exact absent lead sources in approved regression companies.';
  end if;

  if exists (
    select 1
    from public.automation_events as event
    where event.id = any(actual_event_ids)
      and (
        not exists (
          select 1
          from public.company_memberships as membership
          where membership.user_id = selected_owner.id
            and membership.company_id = event.company_id
            and membership.role = 'owner'
        )
        or not exists (
          select 1
          from public.companies as company
          where company.id = event.company_id
            and (
              (company.id = '503d4701-ea18-4300-a4fa-91eb62cf6609'::uuid
                and company.name = 'WeatherTech Roofing LLC'
                and company.trade = 'roofing')
              or
              (company.id = 'c0ae6238-909a-4273-9841-d044dd42a010'::uuid
                and company.name = 'IHC Painting'
                and company.trade = 'painting')
            )
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy Twilio orphan event company is outside the exact regression owner scope.';
  end if;

  if exists (
    select 1
    from public.automation_events as child
    left join public.automation_events as parent
      on parent.id = child.causation_event_id
    where child.id = any(actual_event_ids)
      and child.causation_event_id is not null
      and (
        parent.id is null
        or not (parent.id = any(actual_event_ids))
        or child.company_id is distinct from parent.company_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy Twilio orphan causation graph crosses or omits an exact company parent.';
  end if;

  select coalesce(array_agg(execution.id order by execution.id), '{}')
  into actual_execution_ids
  from public.automation_executions as execution
  where execution.event_id = any(actual_event_ids);

  select coalesce(array_agg(attempt.id order by attempt.id), '{}')
  into actual_attempt_ids
  from public.automation_attempts as attempt
  where attempt.execution_id = any(actual_execution_ids);

  select coalesce(array_agg(audit.id order by audit.id), '{}')
  into actual_audit_ids
  from public.automation_audit_events as audit
  where audit.event_id = any(actual_event_ids)
     or audit.execution_id = any(actual_execution_ids);

  perform 1
  from public.automation_executions as execution
  where execution.id = any(actual_execution_ids)
  order by execution.id
  for update;
  perform 1
  from public.automation_attempts as attempt
  where attempt.id = any(actual_attempt_ids)
  order by attempt.id
  for update;
  perform 1
  from public.automation_audit_events as audit
  where audit.id = any(actual_audit_ids)
  order by audit.id
  for update;

  if actual_execution_ids is distinct from request_execution_ids
    or actual_attempt_ids is distinct from request_attempt_ids
    or actual_audit_ids is distinct from request_audit_ids then
    raise exception using
      errcode = '22023',
      message = 'Legacy Twilio orphan cleanup refused a partial or mismatched ledger graph.';
  end if;

  if exists (
    select 1
    from public.office_tasks as task
    where task.automation_execution_id = any(actual_execution_ids)
  ) then
    raise exception using
      errcode = '23514',
      message = 'Legacy Twilio orphan cleanup refuses a graph with a remaining engine-created task.';
  end if;

  insert into public.automation_synthetic_cleanup_guards (
    backend_pid,
    transaction_id,
    operation_key,
    regression_owner_user_id,
    run_id
  ) values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.txid_current(),
    request_operation_key,
    request_regression_owner_user_id,
    request_run_id
  );
  perform pg_catalog.set_config(
    'wtos.synthetic_automation_cleanup_operation',
    request_operation_key::text,
    true
  );

  delete from public.automation_audit_events
  where id = any(actual_audit_ids);
  get diagnostics deleted_audit_events = row_count;

  delete from public.automation_attempts
  where id = any(actual_attempt_ids);
  get diagnostics deleted_attempts = row_count;

  delete from public.automation_executions
  where id = any(actual_execution_ids);
  get diagnostics deleted_executions = row_count;

  delete from public.automation_events
  where id = any(actual_event_ids);
  get diagnostics deleted_events = row_count;

  if deleted_audit_events <> cardinality(actual_audit_ids)
    or deleted_attempts <> cardinality(actual_attempt_ids)
    or deleted_executions <> cardinality(actual_execution_ids)
    or deleted_events <> cardinality(actual_event_ids) then
    raise exception using
      errcode = 'P0001',
      message = 'Legacy Twilio orphan cleanup did not delete the exact guarded graph.';
  end if;

  select
    (select count(*) from public.automation_audit_events
      where id = any(actual_audit_ids))
    + (select count(*) from public.automation_attempts
      where id = any(actual_attempt_ids))
    + (select count(*) from public.automation_executions
      where id = any(actual_execution_ids))
    + (select count(*) from public.automation_events
      where id = any(actual_event_ids))
  into final_residue_count;

  if final_residue_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Legacy Twilio orphan cleanup did not reach exact zero ledger residue.';
  end if;

  delete from public.automation_synthetic_cleanup_guards
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.txid_current()
    and operation_key = request_operation_key;
  perform pg_catalog.set_config(
    'wtos.synthetic_automation_cleanup_operation',
    '',
    true
  );

  return jsonb_build_object(
    'ok', true,
    'status', 'cleaned',
    'markerFamily', request_marker_family,
    'counts', jsonb_build_object(
      'auditEvents', deleted_audit_events,
      'attempts', deleted_attempts,
      'executions', deleted_executions,
      'events', deleted_events
    ),
    'databaseResidueCount', final_residue_count
  );
end;
$$;

revoke all on function public.wtos_cleanup_legacy_twilio_automation_orphan(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_cleanup_legacy_twilio_automation_orphan(jsonb)
to service_role;

commit;
