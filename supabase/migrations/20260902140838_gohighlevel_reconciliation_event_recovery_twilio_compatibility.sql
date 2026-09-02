-- Forward-only recovery for GHL match corrections after an initially invalid
-- binding, with Twilio update behavior restored to its pre-GHL semantics.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.wtos_emit_inbound_communication_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_id uuid;
  route_location_key text;
  safe_payload jsonb;
  payload_fingerprint text;
  stable_idempotency_key text;
  existing_event_recorded boolean := false;
begin
  stable_idempotency_key := 'communication-provider-event:' || new.id::text;

  if new.provider = 'gohighlevel' then
    -- An invalid match can later receive a corrected connection/company link.
    -- Row shape alone cannot prove an event was emitted, so suppress replays
    -- only when the immutable ledger already contains this stable source key.
    if tg_op = 'UPDATE' then
      select exists (
        select 1
        from public.automation_events as event
        where event.company_id = new.company_id
          and event.idempotency_key = stable_idempotency_key
      ) into existing_event_recorded;

      if existing_event_recorded then
        return new;
      end if;
    end if;

    if new.company_id is null
      or new.direction <> 'inbound'
      or new.event_type <> 'sms_inbound'
      or new.routing_status <> 'matched'
      or new.integration_connection_id is null
      or not exists (
        select 1
        from public.integration_connections as connection
        where connection.id = new.integration_connection_id
          and connection.company_id = new.company_id
          and connection.provider = 'gohighlevel'
          and connection.status = 'connected'
      ) then
      return new;
    end if;
  elsif new.provider in ('twilio', 'twilio_sms') then
    -- Twilio SMS behavior predates the GHL reconciliation bridge and remains
    -- insert-only. No Twilio UPDATE may newly emit communication.received.
    if tg_op = 'UPDATE' then
      return new;
    end if;

    if new.company_id is null
      or new.direction <> 'inbound'
      or new.event_type <> 'sms_inbound'
      or new.routing_status <> 'matched'
      or new.business_phone_number_id is null
      or not exists (
        select 1
        from public.business_phone_numbers as route
        where route.id = new.business_phone_number_id
          and route.company_id = new.company_id
          and route.routing_status = 'active'
      ) then
      return new;
    end if;
  else
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  if location_id is null and new.provider in ('twilio', 'twilio_sms') then
    select case route.routing_key
      when 'weathertech-phoenix' then 'weathertech_phoenix'
      when 'weathertech-tucson' then 'weathertech_tucson'
      when 'ihc-primary' then 'ihc'
      else null
    end
    into route_location_key
    from public.business_phone_numbers as route
    where route.id = new.business_phone_number_id
      and route.company_id = new.company_id;

    select location.id
    into location_id
    from public.company_locations as location
    where location.company_id = new.company_id
      and location.location_key = route_location_key
      and location.is_active;
  end if;

  safe_payload := jsonb_strip_nulls(jsonb_build_object(
    'provider', new.provider,
    'channel', new.channel,
    'direction', new.direction,
    'status', new.status,
    'routing_status', new.routing_status,
    'customer_id', new.customer_id,
    'lead_id', new.lead_id,
    'job_id', new.job_id,
    'business_phone_number_id', new.business_phone_number_id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(safe_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    'communication.received',
    'communication_provider_events',
    new.id::text,
    pg_catalog.encode(extensions.digest(
      coalesce(nullif(new.provider_event_sid, ''), nullif(new.request_fingerprint, ''), new.id::text),
      'sha256'
    ), 'hex'),
    safe_payload,
    coalesce(new.occurred_at, new.received_at, now()),
    null,
    stable_idempotency_key
  );

  return new;
end;
$$;

create or replace function public.wtos_emit_missed_call_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  location_id uuid;
  route_location_key text;
  safe_payload jsonb;
  payload_fingerprint text;
  stable_idempotency_key text;
  existing_event_recorded boolean := false;
begin
  stable_idempotency_key := 'missed-call:' || new.id::text;

  if new.provider = 'gohighlevel' then
    if tg_op = 'UPDATE' then
      select exists (
        select 1
        from public.automation_events as event
        where event.company_id = new.company_id
          and event.idempotency_key = stable_idempotency_key
      ) into existing_event_recorded;

      if existing_event_recorded then
        return new;
      end if;
    end if;

    if new.company_id is null
      or new.direction <> 'inbound'
      or new.call_status <> 'missed'
      or new.routing_status <> 'matched'
      or new.integration_connection_id is null
      or not exists (
        select 1
        from public.integration_connections as connection
        where connection.id = new.integration_connection_id
          and connection.company_id = new.company_id
          and connection.provider = 'gohighlevel'
          and connection.status = 'connected'
      ) then
      return new;
    end if;
  elsif new.provider = 'twilio' then
    -- Preserve the predecessor contract: an UPDATE may emit only when the call
    -- status itself transitions into missed. A routing-only match is ignored.
    if tg_op = 'UPDATE' and old.call_status = 'missed' then
      return new;
    end if;

    if new.company_id is null
      or new.direction <> 'inbound'
      or new.call_status <> 'missed'
      or new.routing_status <> 'matched'
      or new.business_phone_number_id is null
      or not exists (
        select 1
        from public.business_phone_numbers as route
        where route.id = new.business_phone_number_id
          and route.company_id = new.company_id
          and route.routing_status = 'active'
      ) then
      return new;
    end if;
  else
    return new;
  end if;

  select lead.company_location_id
  into location_id
  from public.leads as lead
  where lead.id = new.lead_id
    and lead.company_id = new.company_id;

  if location_id is null and new.provider = 'twilio' then
    select case route.routing_key
      when 'weathertech-phoenix' then 'weathertech_phoenix'
      when 'weathertech-tucson' then 'weathertech_tucson'
      when 'ihc-primary' then 'ihc'
      else null
    end
    into route_location_key
    from public.business_phone_numbers as route
    where route.id = new.business_phone_number_id
      and route.company_id = new.company_id;

    select location.id
    into location_id
    from public.company_locations as location
    where location.company_id = new.company_id
      and location.location_key = route_location_key
      and location.is_active;
  end if;

  safe_payload := jsonb_strip_nulls(jsonb_build_object(
    'provider', new.provider,
    'direction', new.direction,
    'status', new.call_status,
    'routing_status', new.routing_status,
    'customer_id', new.customer_id,
    'lead_id', new.lead_id,
    'job_id', new.job_id,
    'business_phone_number_id', new.business_phone_number_id
  ));
  payload_fingerprint := pg_catalog.encode(extensions.digest(safe_payload::text, 'sha256'), 'hex');

  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    'missed_call.received',
    'call_records',
    new.id::text,
    pg_catalog.encode(extensions.digest(coalesce(nullif(new.provider_call_sid, ''), new.id::text), 'sha256'), 'hex'),
    safe_payload,
    coalesce(new.ended_at, new.updated_at, now()),
    null,
    stable_idempotency_key
  );

  return new;
end;
$$;

-- Restore the original all-provider INSERT triggers, then add provider-specific
-- UPDATE triggers so GHL reconciliation cannot widen Twilio behavior.
drop trigger if exists communication_provider_events_emit_inbound_automation
on public.communication_provider_events;
drop trigger if exists communication_provider_events_emit_inbound_automation_reconciliation
on public.communication_provider_events;
create trigger communication_provider_events_emit_inbound_automation
after insert on public.communication_provider_events
for each row execute function public.wtos_emit_inbound_communication_event_v1();
create trigger communication_provider_events_emit_inbound_automation_reconciliation
after update of
  company_id,
  integration_connection_id,
  customer_id,
  lead_id,
  job_id,
  provider,
  event_type,
  direction,
  routing_status
on public.communication_provider_events
for each row
when (new.provider = 'gohighlevel')
execute function public.wtos_emit_inbound_communication_event_v1();

drop trigger if exists call_records_emit_missed_automation
on public.call_records;
drop trigger if exists call_records_emit_missed_automation_gohighlevel_reconciliation
on public.call_records;
drop trigger if exists call_records_emit_missed_automation_twilio_status_transition
on public.call_records;
create trigger call_records_emit_missed_automation
after insert on public.call_records
for each row execute function public.wtos_emit_missed_call_event_v1();
create trigger call_records_emit_missed_automation_gohighlevel_reconciliation
after update of
  company_id,
  integration_connection_id,
  customer_id,
  lead_id,
  job_id,
  provider,
  direction,
  call_status,
  routing_status
on public.call_records
for each row
when (new.provider = 'gohighlevel')
execute function public.wtos_emit_missed_call_event_v1();
create trigger call_records_emit_missed_automation_twilio_status_transition
after update of call_status on public.call_records
for each row
when (new.provider = 'twilio')
execute function public.wtos_emit_missed_call_event_v1();

revoke execute on function public.wtos_emit_inbound_communication_event_v1()
from public, anon, authenticated, service_role;
revoke execute on function public.wtos_emit_missed_call_event_v1()
from public, anon, authenticated, service_role;

commit;
