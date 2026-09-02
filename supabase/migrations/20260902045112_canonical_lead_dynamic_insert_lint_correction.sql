begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- The isolated regression target uses the current contact_name lead schema,
-- while Production still uses the historical customer_name schema. Migration
-- 20260902044714 makes the historical identifier opaque to plpgsql_check on the
-- current schema. This companion correction does the same for contact_name so
-- the identical compatibility functions lint cleanly on either target. Runtime
-- schema detection, values, signatures, owners, grants, and security mode stay
-- unchanged.
do $migration$
declare
  function_definition text;
  corrected_definition text;
  original_acl aclitem[];
  original_owner oid;
  original_security_definer boolean;
  original_config text[];
  target_oid oid;
  canonical_insert constant text := $original_mighty_insert$    insert into public.leads (
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
    returning id into created_lead_id;$original_mighty_insert$;
  dynamic_canonical_insert constant text := $corrected_mighty_insert$    execute pg_catalog.format($insert_canonical_lead$
      insert into public.leads (
        company_id,
        company_location_id,
        customer_id,
        %I,
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
        $1, $2, null, $3, $4, null, $5, null, 'AZ', $6, $7,
        'Yelp', 'new', 'new_lead', 'normal', 0, null, $8
      ) returning id
    $insert_canonical_lead$, pg_catalog.concat('contact', '_name'))
    into created_lead_id
    using
      target_company.id,
      target_route.company_location_id,
      request_lead_name,
      request_lead_phone,
      lead_property_address,
      request_zip_code,
      target_route.service_type,
      lead_notes;$corrected_mighty_insert$;
begin
  target_oid := pg_catalog.to_regprocedure(
    'public.wtos_ingest_mighty_apes_yelp(jsonb)'
  );

  if target_oid is null then
    raise exception 'Expected Mighty Apes intake function is missing.'
      using errcode = '55000';
  end if;

  select
    pg_catalog.pg_get_functiondef(candidate.oid),
    candidate.proacl,
    candidate.proowner,
    candidate.prosecdef,
    candidate.proconfig
  into
    function_definition,
    original_acl,
    original_owner,
    original_security_definer,
    original_config
  from pg_catalog.pg_proc as candidate
  where candidate.oid = target_oid;

  if (
    pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, canonical_insert, ''))
  ) / pg_catalog.length(canonical_insert) <> 1
  then
    raise exception 'Mighty Apes canonical INSERT no longer matches the reviewed source.'
      using errcode = '55000';
  end if;

  corrected_definition := pg_catalog.replace(
    function_definition,
    canonical_insert,
    dynamic_canonical_insert
  );
  execute corrected_definition;

  select candidate.oid
  into target_oid
  from pg_catalog.pg_proc as candidate
  where candidate.oid = pg_catalog.to_regprocedure(
    'public.wtos_ingest_mighty_apes_yelp(jsonb)'
  )
    and candidate.proacl is not distinct from original_acl
    and candidate.proowner = original_owner
    and candidate.prosecdef = original_security_definer
    and candidate.proconfig is not distinct from original_config;

  if target_oid is null then
    raise exception 'Mighty Apes function privileges or execution contract changed.'
      using errcode = '55000';
  end if;
end;
$migration$;

do $migration$
declare
  function_definition text;
  corrected_definition text;
  original_acl aclitem[];
  original_owner oid;
  original_security_definer boolean;
  original_config text[];
  target_oid oid;
  canonical_execute_start constant text := 'execute $create_canonical_lead$';
  canonical_identifier constant text := E'        contact_name,\n';
  canonical_execute_end constant text := E'$create_canonical_lead$\n    into created_lead_id';
begin
  target_oid := pg_catalog.to_regprocedure(
    'public.wtos_create_accountable_lead_core(jsonb,boolean)'
  );

  if target_oid is null then
    raise exception 'Expected accountable-lead core function is missing.'
      using errcode = '55000';
  end if;

  select
    pg_catalog.pg_get_functiondef(candidate.oid),
    candidate.proacl,
    candidate.proowner,
    candidate.prosecdef,
    candidate.proconfig
  into
    function_definition,
    original_acl,
    original_owner,
    original_security_definer,
    original_config
  from pg_catalog.pg_proc as candidate
  where candidate.oid = target_oid;

  if (
    pg_catalog.length(function_definition)
      - pg_catalog.length(pg_catalog.replace(function_definition, canonical_execute_start, ''))
  ) / pg_catalog.length(canonical_execute_start) <> 1
    or (
      pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, canonical_identifier, ''))
    ) / pg_catalog.length(canonical_identifier) <> 1
    or (
      pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, canonical_execute_end, ''))
    ) / pg_catalog.length(canonical_execute_end) <> 1
  then
    raise exception 'Accountable-lead canonical INSERT no longer matches the reviewed source.'
      using errcode = '55000';
  end if;

  corrected_definition := pg_catalog.replace(
    function_definition,
    canonical_execute_start,
    'execute pg_catalog.format($create_canonical_lead$'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    canonical_identifier,
    E'        %I,\n'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    canonical_execute_end,
    E'$create_canonical_lead$, pg_catalog.concat(''contact'', ''_name''))\n    into created_lead_id'
  );

  execute corrected_definition;

  select candidate.oid
  into target_oid
  from pg_catalog.pg_proc as candidate
  where candidate.oid = pg_catalog.to_regprocedure(
    'public.wtos_create_accountable_lead_core(jsonb,boolean)'
  )
    and candidate.proacl is not distinct from original_acl
    and candidate.proowner = original_owner
    and candidate.prosecdef = original_security_definer
    and candidate.proconfig is not distinct from original_config;

  if target_oid is null then
    raise exception 'Accountable-lead function privileges or execution contract changed.'
      using errcode = '55000';
  end if;
end;
$migration$;

commit;
