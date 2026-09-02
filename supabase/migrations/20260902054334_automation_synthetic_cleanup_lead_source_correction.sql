begin;

set local lock_timeout = '10s';
set local statement_timeout = '120s';

-- Force the leads relation alias to resolve as a composite row inside PL/pgSQL.
-- The prior plain to_jsonb(source) form resolved to the PL/pgSQL SOURCE
-- diagnostic rather than the relation alias.
create or replace function public.wtos_cleanup_synthetic_automation_fixture(
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
  request_provider_marker text;
  expected_source_marker text;
  expected_provider_marker text;
  selected_owner record;
  requested_source jsonb;
  requested_source_table text;
  requested_source_id uuid;
  requested_source_company_id uuid;
  requested_source_key text;
  request_source_keys text[] := '{}';
  actual_source_keys text[] := '{}';
  request_event_ids uuid[] := '{}';
  request_execution_ids uuid[] := '{}';
  request_attempt_ids uuid[] := '{}';
  request_audit_ids uuid[] := '{}';
  request_task_ids uuid[] := '{}';
  actual_event_ids uuid[] := '{}';
  actual_execution_ids uuid[] := '{}';
  actual_attempt_ids uuid[] := '{}';
  actual_audit_ids uuid[] := '{}';
  actual_task_ids uuid[] := '{}';
  deleted_audit_events integer := 0;
  deleted_attempts integer := 0;
  deleted_tasks integer := 0;
  deleted_executions integer := 0;
  deleted_events integer := 0;
  final_residue_count integer := 0;
begin
  -- The issuer alone is not project-unique for the legacy service JWT. Bind the
  -- call to all trusted service claims, especially the exact project ref.
  if trusted_claims ->> 'iss' is distinct from 'supabase'
    or trusted_claims ->> 'role' is distinct from 'service_role'
    or trusted_claims ->> 'ref' is distinct from 'hygtnhmmaoboduqghhwg' then
    raise exception using
      errcode = '42501',
      message = 'Synthetic automation cleanup is restricted to the pinned regression project.';
  end if;

  if cleanup_request is null or jsonb_typeof(cleanup_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Exact synthetic automation cleanup identity and graph arrays are required.';
  end if;

  if cleanup_request - array[
      'operationKey',
      'regressionOwnerUserId',
      'markerFamily',
      'runId',
      'sourceMarker',
      'providerMarker',
      'sourceRecords',
      'eventIds',
      'executionIds',
      'attemptIds',
      'auditIds',
      'taskIds'
    ]::text[] <> '{}'::jsonb
    or not cleanup_request ?& array[
      'operationKey',
      'regressionOwnerUserId',
      'markerFamily',
      'runId',
      'sourceMarker',
      'providerMarker',
      'sourceRecords',
      'eventIds',
      'executionIds',
      'attemptIds',
      'auditIds',
      'taskIds'
    ]::text[]
    or jsonb_typeof(cleanup_request -> 'operationKey') <> 'string'
    or jsonb_typeof(cleanup_request -> 'regressionOwnerUserId') <> 'string'
    or jsonb_typeof(cleanup_request -> 'markerFamily') <> 'string'
    or jsonb_typeof(cleanup_request -> 'runId') <> 'string'
    or jsonb_typeof(cleanup_request -> 'sourceMarker') <> 'string'
    or jsonb_typeof(cleanup_request -> 'providerMarker') <> 'string'
    or jsonb_typeof(cleanup_request -> 'sourceRecords') <> 'array'
    or jsonb_typeof(cleanup_request -> 'eventIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'executionIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'attemptIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'auditIds') <> 'array'
    or jsonb_typeof(cleanup_request -> 'taskIds') <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Exact synthetic automation cleanup identity and graph arrays are required.';
  end if;

  request_marker_family := nullif(cleanup_request ->> 'markerFamily', '');
  request_run_id := lower(nullif(cleanup_request ->> 'runId', ''));
  request_source_marker := nullif(cleanup_request ->> 'sourceMarker', '');
  request_provider_marker := nullif(cleanup_request ->> 'providerMarker', '');

  if cleanup_request ->> 'operationKey'
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
    or cleanup_request ->> 'regressionOwnerUserId'
      !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    or request_marker_family is null
    or request_marker_family not in ('browser', 'mighty')
    or request_run_id is null
    or request_source_marker is null
    or request_provider_marker is null then
    raise exception using
      errcode = '22023',
      message = 'Exact synthetic automation cleanup identity and graph arrays are required.';
  end if;

  request_operation_key := (cleanup_request ->> 'operationKey')::uuid;
  request_regression_owner_user_id :=
    (cleanup_request ->> 'regressionOwnerUserId')::uuid;

  if request_regression_owner_user_id is distinct from
      '2150c43d-c5b6-4560-9ecb-142561ba1dc2'::uuid then
    raise exception using
      errcode = '42501',
      message = 'Only the canonical isolated regression owner can clean synthetic automation evidence.';
  end if;

  if request_marker_family = 'browser' then
    if request_run_id !~ '^[0-9]{17}$' then
      raise exception using errcode = '22023', message = 'Browser cleanup requires an exact 17-digit run id.';
    end if;
    expected_source_marker := 'TEST WTOS REGRESSION ' || request_run_id;
    expected_provider_marker := 'TEST WTOS MIGHTY APES REGRESSION: ' || request_run_id;
  else
    if request_run_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'Mighty cleanup requires an exact canonical UUID run id.';
    end if;
    expected_source_marker := 'TEST WTOS REGRESSION ' || request_run_id || ' MIGHTY APES';
    expected_provider_marker := 'TEST WTOS MIGHTY APES REGRESSION:' || request_run_id;
  end if;

  if request_source_marker <> expected_source_marker
    or request_provider_marker <> expected_provider_marker then
    raise exception using
      errcode = '22023',
      message = 'Synthetic automation cleanup markers do not match the exact run family.';
  end if;

  if jsonb_array_length(cleanup_request -> 'sourceRecords') not between 1 and 500
    or jsonb_array_length(cleanup_request -> 'eventIds') not between 1 and 2000
    or jsonb_array_length(cleanup_request -> 'executionIds') > 2000
    or jsonb_array_length(cleanup_request -> 'attemptIds') > 4000
    or jsonb_array_length(cleanup_request -> 'auditIds') not between 1 and 8000
    or jsonb_array_length(cleanup_request -> 'taskIds') > 2000 then
    raise exception using
      errcode = '22023',
      message = 'Synthetic automation cleanup graph exceeds its bounded contract.';
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
      message = 'Only the exact approved isolated regression owner can clean synthetic automation evidence.';
  end if;

  -- Freeze every supported source and ledger relation for the short exact-graph
  -- derivation so a concurrent insert cannot turn a complete request partial.
  lock table
    public.leads,
    public.customers,
    public.inspections,
    public.estimates,
    public.jobs,
    public.invoices,
    public.office_tasks,
    public.communication_provider_events,
    public.email_messages,
    public.call_records,
    public.ai_audit_events,
    public.automation_events,
    public.automation_executions,
    public.automation_attempts,
    public.automation_audit_events
  in share row exclusive mode;

  for requested_source in
    select value
    from jsonb_array_elements(cleanup_request -> 'sourceRecords')
  loop
    if jsonb_typeof(requested_source) <> 'object'
      or (select count(*) from jsonb_object_keys(requested_source)) <> 2
      or not requested_source ? 'sourceTable'
      or not requested_source ? 'sourceId' then
      raise exception using errcode = '22023', message = 'Synthetic automation source records must use the exact table/id contract.';
    end if;

    requested_source_table := nullif(requested_source ->> 'sourceTable', '');
    requested_source_id := nullif(requested_source ->> 'sourceId', '')::uuid;
    requested_source_company_id := null;

    case requested_source_table
      when 'leads' then
        select source.company_id into requested_source_company_id
        from public.leads as source where source.id = requested_source_id for update;
      when 'customers' then
        select source.company_id into requested_source_company_id
        from public.customers as source where source.id = requested_source_id for update;
      when 'inspections' then
        select source.company_id into requested_source_company_id
        from public.inspections as source where source.id = requested_source_id for update;
      when 'estimates' then
        select source.company_id into requested_source_company_id
        from public.estimates as source where source.id = requested_source_id for update;
      when 'jobs' then
        select source.company_id into requested_source_company_id
        from public.jobs as source where source.id = requested_source_id for update;
      when 'invoices' then
        select source.company_id into requested_source_company_id
        from public.invoices as source where source.id = requested_source_id for update;
      when 'office_tasks' then
        select source.company_id into requested_source_company_id
        from public.office_tasks as source where source.id = requested_source_id for update;
      when 'communication_provider_events' then
        select source.company_id into requested_source_company_id
        from public.communication_provider_events as source where source.id = requested_source_id for update;
      when 'email_messages' then
        select source.company_id into requested_source_company_id
        from public.email_messages as source where source.id = requested_source_id for update;
      when 'call_records' then
        select source.company_id into requested_source_company_id
        from public.call_records as source where source.id = requested_source_id for update;
      when 'ai_audit_events' then
        select source.company_id into requested_source_company_id
        from public.ai_audit_events as source where source.id = requested_source_id for update;
      else
        raise exception using errcode = '22023', message = 'Synthetic automation source table is unsupported.';
    end case;

    if requested_source_company_id is null
      or not exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = selected_owner.id
          and membership.company_id = requested_source_company_id
          and membership.role = 'owner'
      ) then
      raise exception using
        errcode = '42501',
        message = 'Synthetic automation source does not belong to an exact regression-owner company.';
    end if;

    requested_source_key := requested_source_table || ':' || requested_source_id::text;
    request_source_keys := array_append(request_source_keys, requested_source_key);
  end loop;

  if cardinality(request_source_keys) <> (
    select count(distinct source_key) from unnest(request_source_keys) as source_rows(source_key)
  ) then
    raise exception using errcode = '22023', message = 'Synthetic automation source records cannot contain duplicates.';
  end if;

  select coalesce(array_agg(source_key order by source_key), '{}')
  into request_source_keys
  from unnest(request_source_keys) as source_rows(source_key);

  select coalesce(array_agg(source_key order by source_key), '{}')
  into actual_source_keys
  from (
    select 'leads:' || source.id::text as source_key
    from public.leads as source
    where public.wtos_synthetic_automation_marker_matches_v1(
      coalesce(
        to_jsonb(source.*) ->> 'contact_name',
        to_jsonb(source.*) ->> 'customer_name',
        to_jsonb(source.*) ->> 'name'
      ),
      request_source_marker
    )
    union all
    select 'customers:' || source.id::text
    from public.customers as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.display_name, request_source_marker)
    union all
    select 'inspections:' || source.id::text
    from public.inspections as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.title, request_source_marker)
    union all
    select 'estimates:' || source.id::text
    from public.estimates as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.title, request_source_marker)
    union all
    select 'jobs:' || source.id::text
    from public.jobs as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.title, request_source_marker)
    union all
    select 'invoices:' || source.id::text
    from public.invoices as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.title, request_source_marker)
       or public.wtos_synthetic_automation_marker_matches_v1(
         source.title,
         'Invoice for ' || request_source_marker
       )
    union all
    select 'office_tasks:' || source.id::text
    from public.office_tasks as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.title, request_source_marker)
       or public.wtos_synthetic_automation_marker_matches_v1(source.notes, request_source_marker)
       or exists (
         select 1 from public.leads as linked
         where linked.id = source.lead_id
           and public.wtos_synthetic_automation_marker_matches_v1(
             coalesce(
               to_jsonb(linked) ->> 'contact_name',
               to_jsonb(linked) ->> 'customer_name',
               to_jsonb(linked) ->> 'name'
             ),
             request_source_marker
           )
       )
       or exists (
         select 1 from public.inspections as linked
         where linked.id = source.inspection_id
           and public.wtos_synthetic_automation_marker_matches_v1(linked.title, request_source_marker)
       )
       or exists (
         select 1 from public.estimates as linked
         where linked.id = source.estimate_id
           and public.wtos_synthetic_automation_marker_matches_v1(linked.title, request_source_marker)
       )
       or exists (
         select 1 from public.jobs as linked
         where linked.id = source.job_id
           and public.wtos_synthetic_automation_marker_matches_v1(linked.title, request_source_marker)
       )
    union all
    select 'communication_provider_events:' || source.id::text
    from public.communication_provider_events as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.correlation_id, request_source_marker)
       or public.wtos_synthetic_automation_marker_matches_v1(source.correlation_id, request_provider_marker)
    union all
    select 'email_messages:' || source.id::text
    from public.email_messages as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.subject, request_source_marker)
    union all
    select 'call_records:' || source.id::text
    from public.call_records as source
    where public.wtos_synthetic_automation_marker_matches_v1(source.correlation_id, request_source_marker)
       or public.wtos_synthetic_automation_marker_matches_v1(source.correlation_id, request_provider_marker)
    union all
    select 'ai_audit_events:' || source.id::text
    from public.ai_audit_events as source
    where source.metadata ->> 'testMarker' = request_source_marker
  ) as exact_sources;

  if actual_source_keys is distinct from request_source_keys then
    raise exception using
      errcode = '22023',
      message = 'Synthetic automation cleanup refused an incomplete or overbroad exact source graph.';
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
  select coalesce(array_agg(value::uuid order by value::uuid), '{}')
  into request_task_ids
  from jsonb_array_elements_text(cleanup_request -> 'taskIds');

  if cardinality(request_event_ids) <> (
      select count(distinct id) from unnest(request_event_ids) as ids(id)
    )
    or cardinality(request_execution_ids) <> (
      select count(distinct id) from unnest(request_execution_ids) as ids(id)
    )
    or cardinality(request_attempt_ids) <> (
      select count(distinct id) from unnest(request_attempt_ids) as ids(id)
    )
    or cardinality(request_audit_ids) <> (
      select count(distinct id) from unnest(request_audit_ids) as ids(id)
    )
    or cardinality(request_task_ids) <> (
      select count(distinct id) from unnest(request_task_ids) as ids(id)
    ) then
    raise exception using errcode = '22023', message = 'Synthetic automation graph IDs cannot contain duplicates.';
  end if;

  with recursive event_graph(id) as (
    select event.id
    from public.automation_events as event
    where event.source_table || ':' || event.source_id = any(request_source_keys)
    union
    select child.id
    from public.automation_events as child
    join event_graph as parent on parent.id = child.causation_event_id
  )
  select coalesce(array_agg(id order by id), '{}')
  into actual_event_ids
  from event_graph;

  perform 1
  from public.automation_events as event
  where event.id = any(actual_event_ids)
  order by event.id
  for update;

  select coalesce(array_agg(execution.id order by execution.id), '{}')
  into actual_execution_ids
  from public.automation_executions as execution
  where execution.event_id = any(actual_event_ids);

  perform 1
  from public.automation_executions as execution
  where execution.id = any(actual_execution_ids)
  order by execution.id
  for update;

  select coalesce(array_agg(attempt.id order by attempt.id), '{}')
  into actual_attempt_ids
  from public.automation_attempts as attempt
  where attempt.execution_id = any(actual_execution_ids);

  perform 1
  from public.automation_attempts as attempt
  where attempt.id = any(actual_attempt_ids)
  order by attempt.id
  for update;

  select coalesce(array_agg(audit.id order by audit.id), '{}')
  into actual_audit_ids
  from public.automation_audit_events as audit
  where audit.event_id = any(actual_event_ids)
     or audit.execution_id = any(actual_execution_ids);

  perform 1
  from public.automation_audit_events as audit
  where audit.id = any(actual_audit_ids)
  order by audit.id
  for update;

  select coalesce(array_agg(task.id order by task.id), '{}')
  into actual_task_ids
  from public.office_tasks as task
  where task.automation_execution_id = any(actual_execution_ids);

  perform 1
  from public.office_tasks as task
  where task.id = any(actual_task_ids)
  order by task.id
  for update;

  if actual_event_ids is distinct from request_event_ids
    or actual_execution_ids is distinct from request_execution_ids
    or actual_attempt_ids is distinct from request_attempt_ids
    or actual_audit_ids is distinct from request_audit_ids
    or actual_task_ids is distinct from request_task_ids then
    raise exception using
      errcode = '22023',
      message = 'Synthetic automation cleanup refused a partial or mismatched ledger graph.';
  end if;

  -- Every event must remain inside a company that the exact regression owner
  -- owns. This applies to roots and every recursively derived descendant.
  if exists (
    select 1
    from public.automation_events as event
    where event.id = any(actual_event_ids)
      and not exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = selected_owner.id
          and membership.company_id = event.company_id
          and membership.role = 'owner'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Synthetic automation event company is outside the regression owner scope.';
  end if;

  -- Root events are joined to source companies by the complete table:id key.
  -- UUID equality alone is deliberately insufficient because unrelated source
  -- tables can contain the same UUID.
  if exists (
    with source_companies(source_key, company_id) as (
      select 'leads:' || source.id::text, source.company_id from public.leads as source
      union all select 'customers:' || source.id::text, source.company_id from public.customers as source
      union all select 'inspections:' || source.id::text, source.company_id from public.inspections as source
      union all select 'estimates:' || source.id::text, source.company_id from public.estimates as source
      union all select 'jobs:' || source.id::text, source.company_id from public.jobs as source
      union all select 'invoices:' || source.id::text, source.company_id from public.invoices as source
      union all select 'office_tasks:' || source.id::text, source.company_id from public.office_tasks as source
      union all select 'communication_provider_events:' || source.id::text, source.company_id from public.communication_provider_events as source
      union all select 'email_messages:' || source.id::text, source.company_id from public.email_messages as source
      union all select 'call_records:' || source.id::text, source.company_id from public.call_records as source
      union all select 'ai_audit_events:' || source.id::text, source.company_id from public.ai_audit_events as source
    )
    select 1
    from public.automation_events as event
    left join source_companies as source_company
      on source_company.source_key = event.source_table || ':' || event.source_id
    where event.id = any(actual_event_ids)
      and event.source_table || ':' || event.source_id = any(request_source_keys)
      and (
        source_company.company_id is null
        or event.company_id is distinct from source_company.company_id
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Synthetic automation event company does not match its exact source company.';
  end if;

  -- A causation child is safe only when its exact parent is also inside the
  -- derived graph and the company is unchanged across that edge. Requiring
  -- this for every edge proves the invariant recursively, not just at roots.
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
      message = 'Synthetic automation causation graph crosses or omits an exact company parent.';
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

  delete from public.office_tasks
  where id = any(actual_task_ids);
  get diagnostics deleted_tasks = row_count;

  delete from public.automation_executions
  where id = any(actual_execution_ids);
  get diagnostics deleted_executions = row_count;

  delete from public.automation_events
  where id = any(actual_event_ids);
  get diagnostics deleted_events = row_count;

  if deleted_audit_events <> cardinality(actual_audit_ids)
    or deleted_attempts <> cardinality(actual_attempt_ids)
    or deleted_tasks <> cardinality(actual_task_ids)
    or deleted_executions <> cardinality(actual_execution_ids)
    or deleted_events <> cardinality(actual_event_ids) then
    raise exception using errcode = 'P0001', message = 'Synthetic automation cleanup did not delete the exact guarded graph.';
  end if;

  select
    (select count(*) from public.automation_audit_events where id = any(actual_audit_ids))
    + (select count(*) from public.automation_attempts where id = any(actual_attempt_ids))
    + (select count(*) from public.office_tasks where id = any(actual_task_ids))
    + (select count(*) from public.automation_executions where id = any(actual_execution_ids))
    + (select count(*) from public.automation_events where id = any(actual_event_ids))
  into final_residue_count;

  if final_residue_count <> 0 then
    raise exception using errcode = 'P0001', message = 'Synthetic automation cleanup did not reach exact zero ledger residue.';
  end if;

  delete from public.automation_synthetic_cleanup_guards
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.txid_current()
    and operation_key = request_operation_key;
  perform pg_catalog.set_config('wtos.synthetic_automation_cleanup_operation', '', true);

  return jsonb_build_object(
    'ok', true,
    'status', 'cleaned',
    'counts', jsonb_build_object(
      'auditEvents', deleted_audit_events,
      'attempts', deleted_attempts,
      'tasks', deleted_tasks,
      'executions', deleted_executions,
      'events', deleted_events
    ),
    'databaseResidueCount', final_residue_count
  );
end;
$$;

revoke all on function public.wtos_cleanup_synthetic_automation_fixture(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_cleanup_synthetic_automation_fixture(jsonb)
to service_role;

commit;
