begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Production retains the historical leads.customer_name / leads.lead_source
-- shape while the isolated regression target uses contact_name / source. A
-- trigger function is compiled against the row type of the table that invokes
-- it, so direct access to a column absent from either shape aborts the write.
-- Read row values through JSON instead: missing keys safely resolve to NULL,
-- while required lead identity and status fields retain their existing event
-- and idempotency semantics. Company location is read from the latest persisted
-- lead when that column exists, then from the exact same-company intake record,
-- then from the triggering row. No address or free-text location inference
-- is introduced.
do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.wtos_emit_lead_automation_event_v1()'
  ) is null then
    raise exception 'Expected lead automation event trigger function is missing.'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger as candidate_trigger
    where candidate_trigger.tgrelid = 'public.leads'::pg_catalog.regclass
      and candidate_trigger.tgname = 'leads_emit_automation_event'
      and not candidate_trigger.tgisinternal
  ) then
    raise exception 'Expected lead automation event trigger is missing.'
      using errcode = '55000';
  end if;
end;
$migration$;

create or replace function public.wtos_emit_lead_automation_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_row jsonb;
  old_row jsonb;
  event_payload jsonb;
  event_type text;
  payload_fingerprint text;
  resolved_location_id uuid;
  trigger_location_id uuid;
  lead_id uuid;
  event_company_id uuid;
  event_occurred_at timestamptz;
  intake_id uuid;
  intake_provider text;
  intake_branch_key text;
begin
  new_row := pg_catalog.to_jsonb(new);
  old_row := case
    when tg_op = 'UPDATE' then pg_catalog.to_jsonb(old)
    else '{}'::jsonb
  end;

  if tg_op = 'UPDATE'
    and row(new_row -> 'status', new_row -> 'next_follow_up')
      is not distinct from row(old_row -> 'status', old_row -> 'next_follow_up') then
    return new;
  end if;

  lead_id := nullif(new_row ->> 'id', '')::uuid;
  event_company_id := nullif(new_row ->> 'company_id', '')::uuid;
  trigger_location_id := nullif(
    new_row ->> 'company_location_id',
    ''
  )::uuid;

  select nullif(
    pg_catalog.to_jsonb(persisted_lead) ->> 'company_location_id',
    ''
  )::uuid
  into resolved_location_id
  from public.leads as persisted_lead
  where persisted_lead.id = lead_id
    and persisted_lead.company_id = event_company_id;

  select
    intake.id,
    coalesce(resolved_location_id, intake.company_location_id),
    intake.provider,
    intake.branch_key
  into intake_id, resolved_location_id, intake_provider, intake_branch_key
  from public.lead_intake_records as intake
  where intake.linked_lead_id = lead_id
    and intake.company_id = event_company_id
    and intake.status = 'lead_created'
  order by intake.created_at desc
  limit 1;

  resolved_location_id := coalesce(
    resolved_location_id,
    trigger_location_id
  );
  event_type := case
    when tg_op = 'INSERT' then 'lead.created'
    else 'lead.updated'
  end;
  event_payload := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'status', new_row -> 'status',
    'previous_status', case
      when tg_op = 'UPDATE' then old_row -> 'status'
      else null
    end,
    'next_follow_up', new_row -> 'next_follow_up',
    'priority', new_row -> 'priority',
    'source', coalesce(
      new_row -> 'source',
      new_row -> 'lead_source'
    ),
    'provider', intake_provider,
    'branch_key', intake_branch_key,
    'updated_at', new_row -> 'updated_at',
    'customer_id', new_row -> 'customer_id',
    'property_id', new_row -> 'property_id',
    'lead_id', new_row -> 'id'
  ));
  payload_fingerprint := pg_catalog.encode(
    extensions.digest(event_payload::text, 'sha256'),
    'hex'
  );
  event_occurred_at := coalesce(
    nullif(new_row ->> 'updated_at', '')::timestamptz,
    nullif(new_row ->> 'created_at', '')::timestamptz,
    pg_catalog.now()
  );

  perform public.wtos_emit_automation_event_v1(
    event_company_id,
    resolved_location_id,
    event_type,
    'leads',
    lead_id::text,
    payload_fingerprint,
    event_payload,
    event_occurred_at,
    (select auth.uid()),
    'crm:' || event_type || ':' || lead_id::text || ':' || payload_fingerprint
  );

  if intake_id is not null and intake_provider in ('website', 'yelp') then
    perform public.wtos_emit_automation_event_v1(
      event_company_id,
      resolved_location_id,
      case
        when intake_provider = 'website' then 'website.lead.created'
        else 'yelp.lead.created'
      end,
      'leads',
      lead_id::text,
      intake_id::text,
      event_payload,
      coalesce(
        nullif(new_row ->> 'created_at', '')::timestamptz,
        pg_catalog.now()
      ),
      (select auth.uid()),
      'intake:' || intake_id::text || ':' || intake_provider || '.lead.created'
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.wtos_emit_lead_automation_event_v1()
from public, anon, authenticated;
grant execute on function public.wtos_emit_lead_automation_event_v1()
to service_role;

comment on function public.wtos_emit_lead_automation_event_v1() is
  'Emits company-scoped lead automation events across canonical and legacy lead schemas without direct optional-row-field references.';

commit;
