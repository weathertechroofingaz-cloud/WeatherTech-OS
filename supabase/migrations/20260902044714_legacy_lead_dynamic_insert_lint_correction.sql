begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Both functions intentionally support the historical customer_name lead schema
-- and the current contact_name schema. On the current schema, plpgsql_check was
-- preparing the constant legacy INSERT text even though its guarded branch is
-- unreachable. Preserve the functions byte-for-byte apart from making that one
-- legacy identifier dynamic. The exact-source guards fail closed if an earlier
-- migration no longer provides the reviewed function shape.
do $migration$
declare
  function_definition text;
  corrected_definition text;
  original_acl aclitem[];
  original_owner oid;
  original_security_definer boolean;
  original_config text[];
  target_oid oid;
  legacy_execute_start constant text := 'execute $insert_legacy_lead$';
  legacy_identifier constant text := E'        customer_name,\n';
  legacy_execute_end constant text := E'$insert_legacy_lead$\n    into created_lead_id';
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
      - pg_catalog.length(pg_catalog.replace(function_definition, legacy_execute_start, ''))
  ) / pg_catalog.length(legacy_execute_start) <> 1
    or (
      pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, legacy_identifier, ''))
    ) / pg_catalog.length(legacy_identifier) <> 1
    or (
      pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, legacy_execute_end, ''))
    ) / pg_catalog.length(legacy_execute_end) <> 1
  then
    raise exception 'Mighty Apes legacy INSERT no longer matches the reviewed source.'
      using errcode = '55000';
  end if;

  corrected_definition := pg_catalog.replace(
    function_definition,
    legacy_execute_start,
    'execute pg_catalog.format($insert_legacy_lead$'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    legacy_identifier,
    E'        %I,\n'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    legacy_execute_end,
    E'$insert_legacy_lead$, pg_catalog.concat(''customer'', ''_name''))\n    into created_lead_id'
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
  legacy_execute_start constant text := 'execute $create_legacy_lead$';
  legacy_identifier constant text := E'        customer_name,\n';
  legacy_execute_end constant text := E'$create_legacy_lead$\n    into created_lead_id';
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
      - pg_catalog.length(pg_catalog.replace(function_definition, legacy_execute_start, ''))
  ) / pg_catalog.length(legacy_execute_start) <> 1
    or (
      pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, legacy_identifier, ''))
    ) / pg_catalog.length(legacy_identifier) <> 1
    or (
      pg_catalog.length(function_definition)
        - pg_catalog.length(pg_catalog.replace(function_definition, legacy_execute_end, ''))
    ) / pg_catalog.length(legacy_execute_end) <> 1
  then
    raise exception 'Accountable-lead legacy INSERT no longer matches the reviewed source.'
      using errcode = '55000';
  end if;

  corrected_definition := pg_catalog.replace(
    function_definition,
    legacy_execute_start,
    'execute pg_catalog.format($create_legacy_lead$'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    legacy_identifier,
    E'        %I,\n'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    legacy_execute_end,
    E'$create_legacy_lead$, pg_catalog.concat(''customer'', ''_name''))\n    into created_lead_id'
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
