begin;

-- Lead Accountability Phase 1 release hardening
--
-- This migration is additive and performs no business-data insert, update,
-- delete, or backfill at migration time. It adds an immutable, non-PII receipt
-- for future campaign/spend mutations, hardens schedule transition chronology,
-- and enforces terminal lead/accountability consistency on future inserts.

create table public.marketing_accountability_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  operation_key text not null,
  operation_kind text not null check (
    operation_kind in ('campaign_upsert', 'spend_upsert')
  ),
  request_fingerprint text not null check (
    request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  campaign_id uuid,
  spend_id uuid,
  resulting_record_version integer not null check (
    resulting_record_version > 0
  ),
  created_at timestamptz not null default now(),
  constraint marketing_operation_receipts_operation_key_check check (
    operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint marketing_operation_receipts_target_check check (
    (
      operation_kind = 'campaign_upsert'
      and campaign_id is not null
      and spend_id is null
    )
    or (
      operation_kind = 'spend_upsert'
      and campaign_id is null
      and spend_id is not null
    )
  ),
  constraint marketing_operation_receipts_campaign_scope_fkey
    foreign key (campaign_id, company_id)
    references public.marketing_campaigns(id, company_id)
    on delete restrict,
  constraint marketing_operation_receipts_spend_scope_fkey
    foreign key (spend_id, company_id)
    references public.marketing_spend_months(id, company_id)
    on delete restrict,
  unique (company_id, operation_key)
);

create index marketing_operation_receipts_company_created_idx
on public.marketing_accountability_operation_receipts(company_id, created_at);

create index marketing_operation_receipts_campaign_id_idx
on public.marketing_accountability_operation_receipts(campaign_id)
where campaign_id is not null;

create index marketing_operation_receipts_spend_id_idx
on public.marketing_accountability_operation_receipts(spend_id)
where spend_id is not null;

create or replace function public.wtos_protect_marketing_operation_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  synthetic_marker text;
begin
  if tg_op = 'DELETE' and public.wtos_is_service_role_request() then
    if old.operation_kind = 'campaign_upsert' then
      select campaign.campaign_name
      into synthetic_marker
      from public.marketing_campaigns as campaign
      where campaign.id = old.campaign_id
        and campaign.company_id = old.company_id;
    elsif old.operation_kind = 'spend_upsert' then
      select spend.notes
      into synthetic_marker
      from public.marketing_spend_months as spend
      where spend.id = old.spend_id
        and spend.company_id = old.company_id;
    end if;

    if synthetic_marker like 'TEST WTOS REGRESSION %'
      or synthetic_marker like 'TEST WTOS LEAD ACCOUNTABILITY REGRESSION:%'
    then
      return old;
    end if;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Marketing operation receipts are immutable.';
end;
$$;

drop trigger if exists marketing_operation_receipts_immutable
on public.marketing_accountability_operation_receipts;
create trigger marketing_operation_receipts_immutable
before update or delete on public.marketing_accountability_operation_receipts
for each row execute function public.wtos_protect_marketing_operation_receipt();

alter table public.marketing_accountability_operation_receipts
enable row level security;

revoke all on table public.marketing_accountability_operation_receipts
from public, anon, authenticated, service_role;

grant select on table public.marketing_accountability_operation_receipts
to authenticated, service_role;

grant delete on table public.marketing_accountability_operation_receipts
to service_role;

create policy "Company members read marketing operation receipts"
on public.marketing_accountability_operation_receipts
for select
to authenticated
using (public.wtos_can_read_company(company_id));

revoke all on function public.wtos_protect_marketing_operation_receipt()
from public, anon, authenticated, service_role;

-- Preserve the already-applied non-retryable wrappers privately. The new
-- public boundaries add durable operation receipts without changing their
-- validation, authorization, optimistic concurrency, or error translation.
alter function public.wtos_upsert_marketing_campaign(jsonb)
rename to wtos_upsert_marketing_campaign_phase1_nonretryable;

alter function public.wtos_upsert_marketing_spend(jsonb)
rename to wtos_upsert_marketing_spend_phase1_nonretryable;

revoke all on function public.wtos_upsert_marketing_campaign_phase1_nonretryable(jsonb)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_upsert_marketing_spend_phase1_nonretryable(jsonb)
from public, anon, authenticated, service_role;

create function public.wtos_upsert_marketing_campaign(
  campaign_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_campaign_id uuid;
  request_operation_key text;
  request_fingerprint text;
  service_request boolean := public.wtos_is_service_role_request();
  existing_receipt public.marketing_accountability_operation_receipts%rowtype;
  mutation_result jsonb;
  result_campaign_id uuid;
  result_record_version integer;
begin
  if pg_catalog.jsonb_typeof(campaign_request) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'Marketing campaign request must be a JSON object.';
  end if;

  request_company_id := nullif(campaign_request ->> 'company_id', '')::uuid;
  request_campaign_id := nullif(campaign_request ->> 'campaign_id', '')::uuid;
  request_operation_key := nullif(
    pg_catalog.btrim(campaign_request ->> 'operation_key'),
    ''
  );

  if request_company_id is null
    or request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing campaign request contains invalid fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;
  request_fingerprint := public.wtos_json_fingerprint(
    pg_catalog.jsonb_set(
      campaign_request,
      '{operation_key}',
      pg_catalog.to_jsonb(request_operation_key),
      true
    )
  );

  if not service_request
    and not public.wtos_can_manage_marketing_accountability(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Owner or admin access is required to manage marketing campaigns.';
  end if;

  perform public.wtos_lock_accountability_operation(
    request_company_id,
    request_operation_key
  );

  select receipt.*
  into existing_receipt
  from public.marketing_accountability_operation_receipts as receipt
  where receipt.company_id = request_company_id
    and receipt.operation_key = request_operation_key
  for update;

  if existing_receipt.id is not null then
    if existing_receipt.operation_kind is distinct from 'campaign_upsert'
      or existing_receipt.request_fingerprint is distinct from request_fingerprint
      or (
        request_campaign_id is not null
        and existing_receipt.campaign_id is distinct from request_campaign_id
      )
    then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different marketing campaign input or target.';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'idempotent',
      'campaign_id', existing_receipt.campaign_id,
      'record_version', existing_receipt.resulting_record_version
    );
  end if;

  mutation_result := public.wtos_upsert_marketing_campaign_phase1_nonretryable(
    campaign_request
  );
  result_campaign_id := nullif(mutation_result ->> 'campaign_id', '')::uuid;
  result_record_version := nullif(
    mutation_result ->> 'record_version',
    ''
  )::integer;

  if result_campaign_id is null
    or result_record_version is null
    or result_record_version < 1
  then
    raise exception using
      errcode = '55000',
      message = 'Marketing campaign mutation returned an invalid operation result.';
  end if;

  insert into public.marketing_accountability_operation_receipts (
    company_id,
    operation_key,
    operation_kind,
    request_fingerprint,
    campaign_id,
    spend_id,
    resulting_record_version
  ) values (
    request_company_id,
    request_operation_key,
    'campaign_upsert',
    request_fingerprint,
    result_campaign_id,
    null,
    result_record_version
  );

  return mutation_result;
end;
$$;

create function public.wtos_upsert_marketing_spend(
  spend_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_spend_id uuid;
  request_operation_key text;
  request_fingerprint text;
  service_request boolean := public.wtos_is_service_role_request();
  existing_receipt public.marketing_accountability_operation_receipts%rowtype;
  mutation_result jsonb;
  result_spend_id uuid;
  result_record_version integer;
begin
  if pg_catalog.jsonb_typeof(spend_request) is distinct from 'object' then
    raise exception using
      errcode = '22023',
      message = 'Marketing spend request must be a JSON object.';
  end if;

  request_company_id := nullif(spend_request ->> 'company_id', '')::uuid;
  request_spend_id := nullif(spend_request ->> 'spend_id', '')::uuid;
  request_operation_key := nullif(
    pg_catalog.btrim(spend_request ->> 'operation_key'),
    ''
  );

  if request_company_id is null
    or request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing spend request contains invalid fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;
  request_fingerprint := public.wtos_json_fingerprint(
    pg_catalog.jsonb_set(
      spend_request,
      '{operation_key}',
      pg_catalog.to_jsonb(request_operation_key),
      true
    )
  );

  if not service_request
    and not public.wtos_can_manage_marketing_accountability(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Owner or admin access is required to manage marketing spend.';
  end if;

  perform public.wtos_lock_accountability_operation(
    request_company_id,
    request_operation_key
  );

  select receipt.*
  into existing_receipt
  from public.marketing_accountability_operation_receipts as receipt
  where receipt.company_id = request_company_id
    and receipt.operation_key = request_operation_key
  for update;

  if existing_receipt.id is not null then
    if existing_receipt.operation_kind is distinct from 'spend_upsert'
      or existing_receipt.request_fingerprint is distinct from request_fingerprint
      or (
        request_spend_id is not null
        and existing_receipt.spend_id is distinct from request_spend_id
      )
    then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different marketing spend input or target.';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'idempotent',
      'spend_id', existing_receipt.spend_id,
      'record_version', existing_receipt.resulting_record_version
    );
  end if;

  mutation_result := public.wtos_upsert_marketing_spend_phase1_nonretryable(
    spend_request
  );
  result_spend_id := nullif(mutation_result ->> 'spend_id', '')::uuid;
  result_record_version := nullif(
    mutation_result ->> 'record_version',
    ''
  )::integer;

  if result_spend_id is null
    or result_record_version is null
    or result_record_version < 1
  then
    raise exception using
      errcode = '55000',
      message = 'Marketing spend mutation returned an invalid operation result.';
  end if;

  insert into public.marketing_accountability_operation_receipts (
    company_id,
    operation_key,
    operation_kind,
    request_fingerprint,
    campaign_id,
    spend_id,
    resulting_record_version
  ) values (
    request_company_id,
    request_operation_key,
    'spend_upsert',
    request_fingerprint,
    null,
    result_spend_id,
    result_record_version
  );

  return mutation_result;
end;
$$;

revoke all on function public.wtos_upsert_marketing_campaign(jsonb)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_upsert_marketing_spend(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_upsert_marketing_campaign(jsonb)
to authenticated, service_role;

grant execute on function public.wtos_upsert_marketing_spend(jsonb)
to authenticated, service_role;

-- The schedule row's creation time is authoritative for INSERT. On UPDATE,
-- the actual status/start transition time is the row's set_updated_at value;
-- reusing created_at would silently discard a valid post-contact activation.
create or replace function public.wtos_capture_schedule_accountability_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transition_at timestamptz;
begin
  transition_at := case
    when tg_op = 'UPDATE' then coalesce(new.updated_at, pg_catalog.now())
    else coalesce(new.created_at, pg_catalog.now())
  end;

  if new.lead_id is not null
    and new.event_type in ('inspection', 'estimate')
    and new.status in ('scheduled', 'completed')
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.start_at is distinct from new.start_at
    )
  then
    perform public.wtos_record_automatic_lead_milestone(
      new.company_id,
      new.lead_id,
      'appointment_scheduled',
      'schedule_events',
      new.id,
      transition_at
    );
  end if;

  return new;
end;
$$;

revoke all on function public.wtos_capture_schedule_accountability_milestone()
from public, anon, authenticated, service_role;

-- The existing immediate outcome guard protects UPDATE. This deferred INSERT
-- guard runs after the normal accountability initializer, so a direct terminal
-- or split lead insert cannot commit with an open accountability record. It
-- does not scan, validate, or mutate any pre-existing lead.
alter function public.wtos_enforce_accountable_lead_outcome()
security definer;

revoke all on function public.wtos_enforce_accountable_lead_outcome()
from public, anon, authenticated, service_role;

drop trigger if exists leads_enforce_accountable_outcome_insert
on public.leads;
create constraint trigger leads_enforce_accountable_outcome_insert
after insert on public.leads
deferrable initially deferred
for each row execute function public.wtos_enforce_accountable_lead_outcome();

commit;
