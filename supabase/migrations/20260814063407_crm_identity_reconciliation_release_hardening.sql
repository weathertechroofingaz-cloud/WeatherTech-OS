begin;

-- CRM Identity Integrity Phase 1: final release hardening
--
-- This additive migration preserves every prior migration byte and replaces
-- only the deployed core/function contracts identified by isolated regression.
-- It never repairs, backfills, or otherwise mutates CRM business data.

set local lock_timeout = '5s';

-- Cover each audit-ledger foreign key whose referenced-row checks cannot use the
-- existing company-leading composite index.
create index crm_identity_reconciliation_events_source_lead_fk_idx
on public.crm_identity_reconciliation_events (source_lead_id);

create index crm_identity_reconciliation_events_actor_user_fk_idx
on public.crm_identity_reconciliation_events (actor_user_id);

create index crm_identity_reconciliation_events_customer_fk_idx
on public.crm_identity_reconciliation_events (customer_id)
where customer_id is not null;

create index crm_identity_reconciliation_events_property_fk_idx
on public.crm_identity_reconciliation_events (property_id)
where property_id is not null;

-- Synthetic cleanup is authorized by the immutable source-lead marker, not by
-- the caller-supplied operation key. UUID operation keys therefore remain valid
-- while every non-regression audit event stays immutable.
create or replace function public.wtos_protect_crm_identity_reconciliation_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
    and (select auth.jwt() ->> 'role') = 'service_role'
    and exists (
      select 1
      from public.leads as source_lead
      where source_lead.id = old.source_lead_id
        and (
          coalesce(to_jsonb(source_lead) ->> 'contact_name', '')
            like 'TEST WTOS REGRESSION%'
          or coalesce(to_jsonb(source_lead) ->> 'customer_name', '')
            like 'TEST WTOS REGRESSION%'
        )
    ) then
    return old;
  end if;

  raise exception 'CRM identity reconciliation audit events are immutable.'
    using errcode = '55000';
end;
$$;

revoke all on function public.wtos_protect_crm_identity_reconciliation_event()
from public, anon, authenticated, service_role;

-- Preserve the hardened transaction body while tightening create-customer
-- evidence and accepting an explicitly reviewed property-only office-task link.
create or replace function public.wtos_reconcile_customer_property_serialized_core(
  reconciliation_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_operation_key text;
  request_decision text;
  request_sha256 text;
  request_actor_user_id uuid;
  request_lead_id uuid;
  request_lead_updated_at timestamptz;
  request_customer_id uuid;
  request_customer_updated_at timestamptz;
  request_property_id uuid;
  request_property_updated_at timestamptz;
  request_customer_type text;
  source_lead_name text;
  affected_rows integer := 0;
  source_lead public.leads%rowtype;
  target_customer public.customers%rowtype;
  target_property public.properties%rowtype;
  estimate_record public.estimates%rowtype;
  inspection_record public.inspections%rowtype;
  job_record public.jobs%rowtype;
  schedule_record public.schedule_events%rowtype;
  office_task_record public.office_tasks%rowtype;
  existing_event public.crm_identity_reconciliation_events%rowtype;
  target jsonb;
  target_id uuid;
  target_updated_at timestamptz;
  event_id uuid := gen_random_uuid();
  customer_created boolean := false;
  normalized_phone text;
  normalized_email text;
  normalized_address text;
  normalized_name text;
  candidate_ids uuid[] := '{}';
  evidence_types text[] := '{}';
  estimate_ids uuid[] := '{}';
  inspection_ids uuid[] := '{}';
  job_ids uuid[] := '{}';
  schedule_ids uuid[] := '{}';
  office_task_ids uuid[] := '{}';
  estimate_links jsonb;
  inspection_links jsonb;
  job_links jsonb;
  schedule_links jsonb;
  office_task_links jsonb;
  linked_estimates integer := 0;
  linked_inspections integer := 0;
  linked_jobs integer := 0;
  linked_schedules integer := 0;
  linked_office_tasks integer := 0;
  linked_lead integer := 0;
  linked_property integer := 0;
  result_payload jsonb;
  identity_lock text;
begin
  if reconciliation_request is null
    or jsonb_typeof(reconciliation_request) <> 'object' then
    raise exception 'Reconciliation request must be a JSON object.' using errcode = '22023';
  end if;

  begin
    request_company_id := (reconciliation_request ->> 'company_id')::uuid;
    request_lead_id := (reconciliation_request #>> '{lead,id}')::uuid;
    request_lead_updated_at := (reconciliation_request #>> '{lead,expected_updated_at}')::timestamptz;
  exception when others then
    raise exception 'Reconciliation company, lead, and expected version are required.'
      using errcode = '22023';
  end;

  request_actor_user_id := (select auth.uid());
  request_operation_key := trim(coalesce(reconciliation_request ->> 'operation_key', ''));
  request_decision := coalesce(reconciliation_request ->> 'decision', '');

  if request_actor_user_id is null
    or not public.wtos_can_reconcile_customer_property(request_company_id) then
    raise exception 'Reconciliation requires an owner or admin for the selected company.'
      using errcode = '42501';
  end if;

  if length(request_operation_key) not between 8 and 180 then
    raise exception 'Reconciliation operation key is invalid.' using errcode = '22023';
  end if;

  if request_decision not in ('link_existing', 'create_customer', 'dismiss') then
    raise exception 'Reconciliation decision is invalid.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(reconciliation_request -> 'links', '{}'::jsonb)) <> 'object' then
    raise exception 'Reconciliation links must be an object.' using errcode = '22023';
  end if;

  estimate_links := coalesce(reconciliation_request #> '{links,estimates}', '[]'::jsonb);
  inspection_links := coalesce(reconciliation_request #> '{links,inspections}', '[]'::jsonb);
  job_links := coalesce(reconciliation_request #> '{links,jobs}', '[]'::jsonb);
  schedule_links := coalesce(reconciliation_request #> '{links,schedule_events}', '[]'::jsonb);
  office_task_links := coalesce(reconciliation_request #> '{links,office_tasks}', '[]'::jsonb);

  if jsonb_typeof(estimate_links) <> 'array'
    or jsonb_typeof(inspection_links) <> 'array'
    or jsonb_typeof(job_links) <> 'array'
    or jsonb_typeof(schedule_links) <> 'array'
    or jsonb_typeof(office_task_links) <> 'array' then
    raise exception 'Every reconciliation link collection must be an array.'
      using errcode = '22023';
  end if;

  begin
    select coalesce(array_agg(parsed_id order by parsed_id), '{}')
    into estimate_ids
    from (
      select distinct (value ->> 'id')::uuid as parsed_id
      from jsonb_array_elements(estimate_links)
    ) as parsed;
    select coalesce(array_agg(parsed_id order by parsed_id), '{}')
    into inspection_ids
    from (
      select distinct (value ->> 'id')::uuid as parsed_id
      from jsonb_array_elements(inspection_links)
    ) as parsed;
    select coalesce(array_agg(parsed_id order by parsed_id), '{}')
    into job_ids
    from (
      select distinct (value ->> 'id')::uuid as parsed_id
      from jsonb_array_elements(job_links)
    ) as parsed;
    select coalesce(array_agg(parsed_id order by parsed_id), '{}')
    into schedule_ids
    from (
      select distinct (value ->> 'id')::uuid as parsed_id
      from jsonb_array_elements(schedule_links)
    ) as parsed;
    select coalesce(array_agg(parsed_id order by parsed_id), '{}')
    into office_task_ids
    from (
      select distinct (value ->> 'id')::uuid as parsed_id
      from jsonb_array_elements(office_task_links)
    ) as parsed;
  exception when others then
    raise exception 'Every selected reconciliation target requires a valid id.'
      using errcode = '22023';
  end;

  if coalesce(array_length(estimate_ids, 1), 0) <> jsonb_array_length(estimate_links)
    or coalesce(array_length(inspection_ids, 1), 0) <> jsonb_array_length(inspection_links)
    or coalesce(array_length(job_ids, 1), 0) <> jsonb_array_length(job_links)
    or coalesce(array_length(schedule_ids, 1), 0) <> jsonb_array_length(schedule_links)
    or coalesce(array_length(office_task_ids, 1), 0) <> jsonb_array_length(office_task_links) then
    raise exception 'Duplicate reconciliation target ids are not allowed.'
      using errcode = '22023';
  end if;

  request_sha256 := encode(extensions.digest(reconciliation_request::text, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(
    hashtextextended(request_company_id::text || ':' || request_operation_key, 0)
  );

  select event_record.*
  into existing_event
  from public.crm_identity_reconciliation_events as event_record
  where event_record.company_id = request_company_id
    and event_record.operation_key = request_operation_key;

  if existing_event.id is not null then
    if existing_event.request_sha256 is distinct from request_sha256 then
      raise exception 'Reconciliation operation key was reused with a conflicting request.'
        using errcode = '23505';
    end if;
    return existing_event.result || jsonb_build_object(
      'status', 'duplicate',
      'duplicate', true
    );
  end if;

  select lead.*
  into source_lead
  from public.leads as lead
  where lead.id = request_lead_id
    and lead.company_id = request_company_id
  for update;

  if source_lead.id is null then
    raise exception 'Reconciliation lead was not found in the selected company.'
      using errcode = 'P0002';
  end if;

  if source_lead.updated_at is distinct from request_lead_updated_at then
    raise exception 'Reconciliation lead changed after review.' using errcode = '40001';
  end if;

  -- A different operation key may have completed while this request waited for
  -- the source row. Never silently overwrite its reviewed association.
  if request_decision = 'create_customer' and source_lead.customer_id is not null then
    raise exception 'Reconciliation lead is already linked to a customer.'
      using errcode = '23514';
  end if;

  if request_decision = 'dismiss' then
    if reconciliation_request ? 'customer' then
      raise exception 'Dismissal cannot include a customer mutation.' using errcode = '22023';
    end if;

    result_payload := jsonb_build_object(
      'event_id', event_id,
      'operation_key', request_operation_key,
      'decision', request_decision,
      'status', 'dismissed',
      'company_id', request_company_id,
      'lead_id', source_lead.id,
      'customer_id', null,
      'property_id', source_lead.property_id,
      'customer_created', false,
      'duplicate', false,
      'updated', jsonb_build_object(
        'leads', 0,
        'properties', 0,
        'estimates', 0,
        'inspections', 0,
        'jobs', 0,
        'schedule_events', 0,
        'office_tasks', 0
      )
    );

    insert into public.crm_identity_reconciliation_events (
      id,
      company_id,
      operation_key,
      request_sha256,
      decision,
      source_lead_id,
      source_updated_at,
      actor_user_id,
      customer_id,
      property_id,
      evidence_types,
      selected_targets,
      result
    ) values (
      event_id,
      request_company_id,
      request_operation_key,
      request_sha256,
      request_decision,
      source_lead.id,
      source_lead.updated_at,
      request_actor_user_id,
      null,
      source_lead.property_id,
      '{}',
      jsonb_build_object('lead', reconciliation_request -> 'lead'),
      result_payload
    );

    return result_payload;
  end if;

  source_lead_name := coalesce(
    nullif(trim(to_jsonb(source_lead) ->> 'contact_name'), ''),
    nullif(trim(to_jsonb(source_lead) ->> 'customer_name'), '')
  );

  normalized_phone := public.wtos_normalize_identity_phone(source_lead.phone);
  normalized_email := public.wtos_normalize_identity_email(source_lead.email);
  normalized_address := public.wtos_normalize_identity_address(source_lead.property_address);
  normalized_name := public.wtos_normalize_identity_address(source_lead_name);

  if request_decision = 'create_customer'
    and (
      source_lead_name is null
      or normalized_address is null
      or (normalized_phone is null and normalized_email is null)
    ) then
    raise exception
      'Creating a customer requires reviewed name, address, and phone or email evidence.'
      using errcode = '23514';
  end if;

  -- Serialize customer creation for identical company-scoped evidence even
  -- when callers use different operation keys or different source leads.
  for identity_lock in
    select lock_value
    from (
      values
        (case when normalized_phone is null then null else 'phone:' || normalized_phone end),
        (case when normalized_email is null then null else 'email:' || normalized_email end),
        (
          case
            when normalized_name is null or normalized_address is null then null
            else 'name_address:' || normalized_name || ':' || normalized_address
          end
        )
    ) as locks(lock_value)
    where lock_value is not null
    order by lock_value
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(request_company_id::text || ':' || identity_lock, 0)
    );
  end loop;

  perform 1
  from public.customers as customer
  where customer.company_id = request_company_id
    and (
      (
        normalized_phone is not null
        and public.wtos_normalize_identity_phone(customer.phone) = normalized_phone
      )
      or (
        normalized_email is not null
        and public.wtos_normalize_identity_email(customer.email) = normalized_email
      )
      or (
        normalized_address is not null
        and normalized_name is not null
        and public.wtos_normalize_identity_address(customer.property_address) = normalized_address
        and public.wtos_normalize_identity_address(
          coalesce(nullif(customer.contact_name, ''), customer.display_name)
        ) = normalized_name
      )
    )
  order by customer.id
  for update;

  select coalesce(array_agg(customer.id order by customer.id), '{}')
  into candidate_ids
  from public.customers as customer
  where customer.company_id = request_company_id
    and (
      (
        normalized_phone is not null
        and public.wtos_normalize_identity_phone(customer.phone) = normalized_phone
      )
      or (
        normalized_email is not null
        and public.wtos_normalize_identity_email(customer.email) = normalized_email
      )
      or (
        normalized_address is not null
        and normalized_name is not null
        and public.wtos_normalize_identity_address(customer.property_address) = normalized_address
        and public.wtos_normalize_identity_address(
          coalesce(nullif(customer.contact_name, ''), customer.display_name)
        ) = normalized_name
      )
    );

  if coalesce(array_length(candidate_ids, 1), 0) > 1 then
    raise exception 'Reconciliation identity is ambiguous within the selected company.'
      using errcode = '21000';
  end if;

  if request_decision = 'link_existing' then
    if jsonb_typeof(reconciliation_request -> 'customer') <> 'object' then
      raise exception 'Existing-customer reconciliation request is invalid.'
        using errcode = '22023';
    end if;

    begin
      request_customer_id := (reconciliation_request #>> '{customer,id}')::uuid;
      request_customer_updated_at := (
        reconciliation_request #>> '{customer,expected_updated_at}'
      )::timestamptz;
    exception when others then
      raise exception 'Existing customer id and expected version are required.'
        using errcode = '22023';
    end;

    if coalesce(array_length(candidate_ids, 1), 0) <> 1
      or candidate_ids[1] is distinct from request_customer_id then
      raise exception 'Existing customer is not the sole evidenced company-scoped match.'
        using errcode = '23514';
    end if;

    select customer.*
    into target_customer
    from public.customers as customer
    where customer.id = request_customer_id
      and customer.company_id = request_company_id
    for update;

    if target_customer.id is null then
      raise exception 'Existing customer was not found in the selected company.'
        using errcode = 'P0002';
    end if;

    if target_customer.updated_at is distinct from request_customer_updated_at then
      raise exception 'Existing customer changed after review.' using errcode = '40001';
    end if;

    if source_lead.customer_id is not null
      and source_lead.customer_id is distinct from target_customer.id then
      raise exception 'Lead already has a conflicting customer link.' using errcode = '23514';
    end if;

    evidence_types := array_remove(array[
      case when normalized_phone is not null
        and public.wtos_normalize_identity_phone(target_customer.phone) = normalized_phone
        then 'exact_phone' end,
      case when normalized_email is not null
        and public.wtos_normalize_identity_email(target_customer.email) = normalized_email
        then 'exact_email' end,
      case when normalized_address is not null
        and normalized_name is not null
        and public.wtos_normalize_identity_address(target_customer.property_address) = normalized_address
        and public.wtos_normalize_identity_address(
          coalesce(nullif(target_customer.contact_name, ''), target_customer.display_name)
        ) = normalized_name
        then 'exact_name_address' end
    ], null);
  else
    if jsonb_typeof(reconciliation_request -> 'customer') <> 'object' then
      raise exception 'Create-customer reconciliation request is invalid.'
        using errcode = '22023';
    end if;

    if coalesce(array_length(candidate_ids, 1), 0) <> 0 then
      raise exception 'A same-company customer already matches the reviewed identity.'
        using errcode = '23505';
    end if;

    if trim(coalesce(reconciliation_request #>> '{customer,display_name}', source_lead_name))
        <> trim(source_lead_name)
      or trim(coalesce(reconciliation_request #>> '{customer,contact_name}', source_lead_name))
        <> trim(source_lead_name) then
      raise exception 'Created customer identity must be derived from the locked lead.'
        using errcode = '23514';
    end if;

    request_customer_type := coalesce(
      nullif(reconciliation_request #>> '{customer,customer_type}', ''),
      'homeowner'
    );
    if request_customer_type not in ('homeowner', 'commercial', 'hoa', 'property_manager') then
      raise exception 'Created customer type is invalid.' using errcode = '22023';
    end if;

    insert into public.customers (
      company_id,
      display_name,
      contact_name,
      phone,
      email,
      property_address,
      city,
      state,
      postal_code,
      customer_type,
      status,
      notes
    ) values (
      request_company_id,
      source_lead_name,
      source_lead_name,
      source_lead.phone,
      source_lead.email,
      source_lead.property_address,
      source_lead.city,
      coalesce(nullif(source_lead.state, ''), 'AZ'),
      source_lead.postal_code,
      request_customer_type,
      'active',
      source_lead.notes
    )
    returning * into target_customer;

    customer_created := true;
    evidence_types := array['reviewed_lead_identity'];
  end if;

  if reconciliation_request ? 'property' then
    if jsonb_typeof(reconciliation_request -> 'property') <> 'object' then
      raise exception 'Reconciliation property must be an object.' using errcode = '22023';
    end if;

    begin
      request_property_id := (reconciliation_request #>> '{property,id}')::uuid;
      request_property_updated_at := (
        reconciliation_request #>> '{property,expected_updated_at}'
      )::timestamptz;
    exception when others then
      raise exception 'Property id and expected version are required.' using errcode = '22023';
    end;

    select property.*
    into target_property
    from public.properties as property
    where property.id = request_property_id
      and property.company_id = request_company_id
    for update;

    if target_property.id is null then
      raise exception 'Property was not found in the selected company.' using errcode = 'P0002';
    end if;

    if target_property.updated_at is distinct from request_property_updated_at then
      raise exception 'Property changed after review.' using errcode = '40001';
    end if;

    if public.wtos_normalize_identity_address(target_property.address)
        is distinct from normalized_address
      or (
        source_lead.postal_code is not null
        and target_property.postal_code is not null
        and trim(source_lead.postal_code) <> trim(target_property.postal_code)
      ) then
      raise exception 'Property does not have exact reviewed address evidence.'
        using errcode = '23514';
    end if;

    if source_lead.property_id is not null
      and source_lead.property_id is distinct from target_property.id then
      raise exception 'Lead already has a conflicting property link.' using errcode = '23514';
    end if;

    if target_property.customer_id is not null
      and target_property.customer_id is distinct from target_customer.id then
      raise exception 'Property already has a conflicting customer link.' using errcode = '23514';
    end if;

    if (
      select count(*)
      from public.properties as property
      where property.company_id = request_company_id
        and public.wtos_normalize_identity_address(property.address) = normalized_address
        and (
          source_lead.postal_code is null
          or property.postal_code is null
          or trim(property.postal_code) = trim(source_lead.postal_code)
        )
    ) <> 1 then
      raise exception 'Property evidence is ambiguous within the selected company.'
        using errcode = '21000';
    end if;
  end if;

  -- Lock and validate every selected row before the first graph mutation.
  for target in
    select value
    from jsonb_array_elements(estimate_links)
    order by (value ->> 'id')::uuid
  loop
    begin
      target_id := (target ->> 'id')::uuid;
      target_updated_at := (target ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Selected estimate requires an exact expected version.'
        using errcode = '22023';
    end;

    select estimate.*
    into estimate_record
    from public.estimates as estimate
    where estimate.id = target_id
      and estimate.company_id = request_company_id
    for update;

    if estimate_record.id is null then
      raise exception 'Selected estimate was not found in the selected company.'
        using errcode = 'P0002';
    end if;
    if estimate_record.updated_at is distinct from target_updated_at then
      raise exception 'Selected estimate changed after review.' using errcode = '40001';
    end if;
    if estimate_record.customer_id is not null
      and estimate_record.customer_id is distinct from target_customer.id then
      raise exception 'Selected estimate has a conflicting customer link.' using errcode = '23514';
    end if;
    if target_property.id is not null
      and estimate_record.property_id is not null
      and estimate_record.property_id is distinct from target_property.id then
      raise exception 'Selected estimate has a conflicting property link.' using errcode = '23514';
    end if;
    if estimate_record.lead_id is distinct from source_lead.id
      and (
        target_property.id is null
        or estimate_record.property_id is distinct from target_property.id
      ) then
      raise exception 'Selected estimate is outside the reviewed lead/property graph.'
        using errcode = '23514';
    end if;
  end loop;

  for target in
    select value
    from jsonb_array_elements(job_links)
    order by (value ->> 'id')::uuid
  loop
    begin
      target_id := (target ->> 'id')::uuid;
      target_updated_at := (target ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Selected job requires an exact expected version.'
        using errcode = '22023';
    end;

    select job.*
    into job_record
    from public.jobs as job
    where job.id = target_id
      and job.company_id = request_company_id
    for update;

    if job_record.id is null then
      raise exception 'Selected job was not found in the selected company.' using errcode = 'P0002';
    end if;
    if job_record.updated_at is distinct from target_updated_at then
      raise exception 'Selected job changed after review.' using errcode = '40001';
    end if;
    if job_record.customer_id is not null
      and job_record.customer_id is distinct from target_customer.id then
      raise exception 'Selected job has a conflicting customer link.' using errcode = '23514';
    end if;
    if target_property.id is not null
      and job_record.property_id is not null
      and job_record.property_id is distinct from target_property.id then
      raise exception 'Selected job has a conflicting property link.' using errcode = '23514';
    end if;
    if job_record.lead_id is distinct from source_lead.id
      and not coalesce(job_record.estimate_id = any(estimate_ids), false)
      and (
        target_property.id is null
        or job_record.property_id is distinct from target_property.id
      ) then
      raise exception 'Selected job is outside the reviewed lead/property graph.'
        using errcode = '23514';
    end if;
  end loop;

  for target in
    select value
    from jsonb_array_elements(schedule_links)
    order by (value ->> 'id')::uuid
  loop
    begin
      target_id := (target ->> 'id')::uuid;
      target_updated_at := (target ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Selected schedule event requires an exact expected version.'
        using errcode = '22023';
    end;

    select schedule_event.*
    into schedule_record
    from public.schedule_events as schedule_event
    where schedule_event.id = target_id
      and schedule_event.company_id = request_company_id
    for update;

    if schedule_record.id is null then
      raise exception 'Selected schedule event was not found in the selected company.'
        using errcode = 'P0002';
    end if;
    if schedule_record.updated_at is distinct from target_updated_at then
      raise exception 'Selected schedule event changed after review.' using errcode = '40001';
    end if;
    if schedule_record.customer_id is not null
      and schedule_record.customer_id is distinct from target_customer.id then
      raise exception 'Selected schedule event has a conflicting customer link.'
        using errcode = '23514';
    end if;
    if target_property.id is not null
      and schedule_record.property_id is not null
      and schedule_record.property_id is distinct from target_property.id then
      raise exception 'Selected schedule event has a conflicting property link.'
        using errcode = '23514';
    end if;
    if schedule_record.lead_id is distinct from source_lead.id
      and not coalesce(schedule_record.job_id = any(job_ids), false)
      and (
        target_property.id is null
        or schedule_record.property_id is distinct from target_property.id
      ) then
      raise exception 'Selected schedule event is outside the reviewed lead/property graph.'
        using errcode = '23514';
    end if;
  end loop;

  for target in
    select value
    from jsonb_array_elements(inspection_links)
    order by (value ->> 'id')::uuid
  loop
    begin
      target_id := (target ->> 'id')::uuid;
      target_updated_at := (target ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Selected inspection requires an exact expected version.'
        using errcode = '22023';
    end;

    select inspection.*
    into inspection_record
    from public.inspections as inspection
    where inspection.id = target_id
      and inspection.company_id = request_company_id
    for update;

    if inspection_record.id is null then
      raise exception 'Selected inspection was not found in the selected company.'
        using errcode = 'P0002';
    end if;
    if inspection_record.updated_at is distinct from target_updated_at then
      raise exception 'Selected inspection changed after review.' using errcode = '40001';
    end if;
    if inspection_record.customer_id is not null
      and inspection_record.customer_id is distinct from target_customer.id then
      raise exception 'Selected inspection has a conflicting customer link.'
        using errcode = '23514';
    end if;
    if target_property.id is not null
      and inspection_record.property_id is not null
      and inspection_record.property_id is distinct from target_property.id then
      raise exception 'Selected inspection has a conflicting property link.'
        using errcode = '23514';
    end if;
    if inspection_record.lead_id is distinct from source_lead.id
      and not coalesce(inspection_record.estimate_id = any(estimate_ids), false)
      and not coalesce(inspection_record.job_id = any(job_ids), false)
      and not coalesce(inspection_record.schedule_event_id = any(schedule_ids), false)
      and (
        target_property.id is null
        or inspection_record.property_id is distinct from target_property.id
      ) then
      raise exception 'Selected inspection is outside the reviewed lead/property graph.'
        using errcode = '23514';
    end if;
  end loop;

  for target in
    select value
    from jsonb_array_elements(office_task_links)
    order by (value ->> 'id')::uuid
  loop
    begin
      target_id := (target ->> 'id')::uuid;
      target_updated_at := (target ->> 'expected_updated_at')::timestamptz;
    exception when others then
      raise exception 'Selected office task requires an exact expected version.'
        using errcode = '22023';
    end;

    select office_task.*
    into office_task_record
    from public.office_tasks as office_task
    where office_task.id = target_id
      and office_task.company_id = request_company_id
    for update;

    if office_task_record.id is null then
      raise exception 'Selected office task was not found in the selected company.'
        using errcode = 'P0002';
    end if;
    if office_task_record.updated_at is distinct from target_updated_at then
      raise exception 'Selected office task changed after review.' using errcode = '40001';
    end if;
    if office_task_record.customer_id is not null
      and office_task_record.customer_id is distinct from target_customer.id then
      raise exception 'Selected office task has a conflicting customer link.'
        using errcode = '23514';
    end if;
    if target_property.id is not null
      and office_task_record.property_id is not null
      and office_task_record.property_id is distinct from target_property.id then
      raise exception 'Selected office task has a conflicting property link.'
        using errcode = '23514';
    end if;
    if office_task_record.lead_id is distinct from source_lead.id
      and not coalesce(office_task_record.inspection_id = any(inspection_ids), false)
      and not coalesce(office_task_record.estimate_id = any(estimate_ids), false)
      and not coalesce(office_task_record.job_id = any(job_ids), false)
      and (
        target_property.id is null
        or office_task_record.property_id is distinct from target_property.id
      ) then
      raise exception 'Selected office task is outside the reviewed lead/property graph.'
        using errcode = '23514';
    end if;
  end loop;

  if target_property.id is not null
    and target_property.customer_id is distinct from target_customer.id then
    update public.properties
    set customer_id = target_customer.id
    where id = target_property.id
      and company_id = request_company_id;
    get diagnostics linked_property = row_count;
  end if;

  if source_lead.customer_id is distinct from target_customer.id
    or (
      target_property.id is not null
      and source_lead.property_id is distinct from target_property.id
    ) then
    update public.leads
    set
      customer_id = target_customer.id,
      property_id = coalesce(target_property.id, source_lead.property_id)
    where id = source_lead.id
      and company_id = request_company_id;
    get diagnostics linked_lead = row_count;
  end if;

  for target in select value from jsonb_array_elements(estimate_links) loop
    target_id := (target ->> 'id')::uuid;
    update public.estimates
    set
      customer_id = target_customer.id,
      property_id = coalesce(target_property.id, property_id)
    where id = target_id
      and company_id = request_company_id
      and (
        customer_id is distinct from target_customer.id
        or (target_property.id is not null and property_id is distinct from target_property.id)
      );
    get diagnostics affected_rows = row_count;
    linked_estimates := linked_estimates + affected_rows;
  end loop;

  for target in select value from jsonb_array_elements(job_links) loop
    target_id := (target ->> 'id')::uuid;
    update public.jobs
    set
      customer_id = target_customer.id,
      property_id = coalesce(target_property.id, property_id)
    where id = target_id
      and company_id = request_company_id
      and (
        customer_id is distinct from target_customer.id
        or (target_property.id is not null and property_id is distinct from target_property.id)
      );
    get diagnostics affected_rows = row_count;
    linked_jobs := linked_jobs + affected_rows;
  end loop;

  for target in select value from jsonb_array_elements(schedule_links) loop
    target_id := (target ->> 'id')::uuid;
    update public.schedule_events
    set
      customer_id = target_customer.id,
      property_id = coalesce(target_property.id, property_id)
    where id = target_id
      and company_id = request_company_id
      and (
        customer_id is distinct from target_customer.id
        or (target_property.id is not null and property_id is distinct from target_property.id)
      );
    get diagnostics affected_rows = row_count;
    linked_schedules := linked_schedules + affected_rows;
  end loop;

  for target in select value from jsonb_array_elements(inspection_links) loop
    target_id := (target ->> 'id')::uuid;
    update public.inspections
    set
      customer_id = target_customer.id,
      property_id = coalesce(target_property.id, property_id)
    where id = target_id
      and company_id = request_company_id
      and (
        customer_id is distinct from target_customer.id
        or (target_property.id is not null and property_id is distinct from target_property.id)
      );
    get diagnostics affected_rows = row_count;
    linked_inspections := linked_inspections + affected_rows;
  end loop;

  for target in select value from jsonb_array_elements(office_task_links) loop
    target_id := (target ->> 'id')::uuid;
    update public.office_tasks
    set
      customer_id = target_customer.id,
      property_id = coalesce(target_property.id, property_id)
    where id = target_id
      and company_id = request_company_id
      and (
        customer_id is distinct from target_customer.id
        or (target_property.id is not null and property_id is distinct from target_property.id)
      );
    get diagnostics affected_rows = row_count;
    linked_office_tasks := linked_office_tasks + affected_rows;
  end loop;

  result_payload := jsonb_build_object(
    'event_id', event_id,
    'operation_key', request_operation_key,
    'decision', request_decision,
    'status', 'applied',
    'company_id', request_company_id,
    'lead_id', source_lead.id,
    'customer_id', target_customer.id,
    'property_id', coalesce(target_property.id, source_lead.property_id),
    'customer_created', customer_created,
    'duplicate', false,
    'updated', jsonb_build_object(
      'leads', linked_lead,
      'properties', linked_property,
      'estimates', linked_estimates,
      'inspections', linked_inspections,
      'jobs', linked_jobs,
      'schedule_events', linked_schedules,
      'office_tasks', linked_office_tasks
    )
  );

  insert into public.crm_identity_reconciliation_events (
    id,
    company_id,
    operation_key,
    request_sha256,
    decision,
    source_lead_id,
    source_updated_at,
    actor_user_id,
    customer_id,
    property_id,
    evidence_types,
    selected_targets,
    result
  ) values (
    event_id,
    request_company_id,
    request_operation_key,
    request_sha256,
    request_decision,
    source_lead.id,
    request_lead_updated_at,
    request_actor_user_id,
    target_customer.id,
    coalesce(target_property.id, source_lead.property_id),
    evidence_types,
    jsonb_build_object(
      'lead', reconciliation_request -> 'lead',
      'customer', reconciliation_request -> 'customer',
      'property', reconciliation_request -> 'property',
      'links', reconciliation_request -> 'links'
    ),
    result_payload
  );

  return result_payload;
end;
$$;

revoke all on function public.wtos_reconcile_customer_property_serialized_core(jsonb)
from public, anon, authenticated, service_role;

-- Customer identity changes and property-address changes affect deterministic
-- matching. Serialize those statements on the same transaction coordinator.
create trigger customers_serialize_crm_identity_insert
before insert on public.customers
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create trigger customers_serialize_crm_identity_update
before update of company_id, display_name, contact_name, phone, email, property_address
on public.customers
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

drop trigger properties_serialize_crm_identity_update on public.properties;
create trigger properties_serialize_crm_identity_update
before update of company_id, customer_id, address, postal_code on public.properties
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

-- Direct authenticated writes retain every deployed operational column while
-- the reconciliation spine can only be reassociated through the reviewed RPC.
revoke update on table public.leads, public.properties from authenticated;
revoke update (customer_id, property_id) on table public.leads from authenticated;
revoke update (customer_id) on table public.properties from authenticated;

do $$
declare
  lead_update_columns text;
  property_update_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into lead_update_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'leads'
    and column_name not in ('customer_id', 'property_id');

  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into property_update_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'properties'
    and column_name <> 'customer_id';

  if lead_update_columns is null or property_update_columns is null then
    raise exception 'CRM operational update-column discovery failed.'
      using errcode = '55000';
  end if;

  execute format(
    'grant update (%s) on table public.leads to authenticated',
    lead_update_columns
  );
  execute format(
    'grant update (%s) on table public.properties to authenticated',
    property_update_columns
  );
end;
$$;

-- Hold a short write freeze while replaying the complete company/source graph
-- and reverse property/customer invariant. Abort on drift; never repair it.
lock table
  public.customers,
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
    from public.leads as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    left join public.properties as property on property.id = row_record.property_id
    where (row_record.customer_id is not null and customer.company_id is distinct from row_record.company_id)
       or (row_record.property_id is not null and property.company_id is distinct from row_record.company_id)
       or (
         customer.id is not null
         and property.id is not null
         and property.customer_id is not null
         and property.customer_id is distinct from customer.id
       )
  ) or exists (
    select 1
    from public.properties as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    where row_record.customer_id is not null
      and customer.company_id is distinct from row_record.company_id
  ) or exists (
    select 1
    from public.estimates as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    left join public.properties as property on property.id = row_record.property_id
    left join public.leads as lead on lead.id = row_record.lead_id
    where (row_record.customer_id is not null and customer.company_id is distinct from row_record.company_id)
       or (row_record.property_id is not null and property.company_id is distinct from row_record.company_id)
       or (row_record.lead_id is not null and lead.company_id is distinct from row_record.company_id)
  ) or exists (
    select 1
    from public.inspections as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    left join public.properties as property on property.id = row_record.property_id
    left join public.leads as lead on lead.id = row_record.lead_id
    left join public.estimates as estimate on estimate.id = row_record.estimate_id
    left join public.jobs as job on job.id = row_record.job_id
    left join public.schedule_events as schedule_event on schedule_event.id = row_record.schedule_event_id
    where (row_record.customer_id is not null and customer.company_id is distinct from row_record.company_id)
       or (row_record.property_id is not null and property.company_id is distinct from row_record.company_id)
       or (row_record.lead_id is not null and lead.company_id is distinct from row_record.company_id)
       or (row_record.estimate_id is not null and estimate.company_id is distinct from row_record.company_id)
       or (row_record.job_id is not null and job.company_id is distinct from row_record.company_id)
       or (row_record.schedule_event_id is not null and schedule_event.company_id is distinct from row_record.company_id)
  ) or exists (
    select 1
    from public.jobs as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    left join public.properties as property on property.id = row_record.property_id
    left join public.leads as lead on lead.id = row_record.lead_id
    left join public.estimates as estimate on estimate.id = row_record.estimate_id
    where (row_record.customer_id is not null and customer.company_id is distinct from row_record.company_id)
       or (row_record.property_id is not null and property.company_id is distinct from row_record.company_id)
       or (row_record.lead_id is not null and lead.company_id is distinct from row_record.company_id)
       or (row_record.estimate_id is not null and estimate.company_id is distinct from row_record.company_id)
  ) or exists (
    select 1
    from public.schedule_events as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    left join public.properties as property on property.id = row_record.property_id
    left join public.leads as lead on lead.id = row_record.lead_id
    left join public.jobs as job on job.id = row_record.job_id
    where (row_record.customer_id is not null and customer.company_id is distinct from row_record.company_id)
       or (row_record.property_id is not null and property.company_id is distinct from row_record.company_id)
       or (row_record.lead_id is not null and lead.company_id is distinct from row_record.company_id)
       or (row_record.job_id is not null and job.company_id is distinct from row_record.company_id)
  ) or exists (
    select 1
    from public.office_tasks as row_record
    left join public.customers as customer on customer.id = row_record.customer_id
    left join public.properties as property on property.id = row_record.property_id
    left join public.leads as lead on lead.id = row_record.lead_id
    left join public.inspections as inspection on inspection.id = row_record.inspection_id
    left join public.estimates as estimate on estimate.id = row_record.estimate_id
    left join public.jobs as job on job.id = row_record.job_id
    where (row_record.customer_id is not null and customer.company_id is distinct from row_record.company_id)
       or (row_record.property_id is not null and property.company_id is distinct from row_record.company_id)
       or (row_record.lead_id is not null and lead.company_id is distinct from row_record.company_id)
       or (row_record.inspection_id is not null and inspection.company_id is distinct from row_record.company_id)
       or (row_record.estimate_id is not null and estimate.company_id is distinct from row_record.company_id)
       or (row_record.job_id is not null and job.company_id is distinct from row_record.company_id)
  ) then
    raise exception 'Existing CRM graph contains a cross-company relationship; reconciliation migration aborted.'
      using errcode = '23514';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from public.properties as property
    join public.leads as child on child.property_id = property.id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.properties as property
    join public.estimates as child on child.property_id = property.id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.properties as property
    join public.inspections as child on child.property_id = property.id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.properties as property
    join public.jobs as child on child.property_id = property.id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.properties as property
    join public.schedule_events as child on child.property_id = property.id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) or exists (
    select 1
    from public.properties as property
    join public.office_tasks as child on child.property_id = property.id
    where property.customer_id is not null
      and child.customer_id is not null
      and child.customer_id is distinct from property.customer_id
  ) then
    raise exception
      'Existing CRM graph contains a property/customer mismatch; release hardening aborted.'
      using errcode = '23514';
  end if;
end;
$$;

commit;
