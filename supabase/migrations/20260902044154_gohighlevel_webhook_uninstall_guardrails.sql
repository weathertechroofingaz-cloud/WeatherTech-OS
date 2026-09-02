begin;

alter function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
rename to wtos_finalize_gohighlevel_uninstall_v1_unscoped_20260902;

create function public.wtos_finalize_gohighlevel_uninstall_v1(
  p_event_id uuid,
  p_claim_token uuid,
  p_payload_sha256 text,
  p_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_event public.gohighlevel_webhook_events%rowtype;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if p_event_id is null
    or p_claim_token is null
    or lower(coalesce(p_payload_sha256, '')) !~ '^[0-9a-f]{64}$'
    or p_scope not in ('location', 'company') then
    raise exception using errcode = '22023', message = 'Invalid uninstall transition.';
  end if;

  select webhook_event.*
  into existing_event
  from public.gohighlevel_webhook_events as webhook_event
  where webhook_event.id = p_event_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Webhook event not found.';
  end if;

  if lower(existing_event.event_type) not like '%uninstall%'
    or existing_event.payload_sha256 is distinct from lower(p_payload_sha256)
    or existing_event.claim_token is distinct from p_claim_token then
    raise exception using errcode = '23514', message = 'Uninstall event identity mismatch.';
  end if;

  if p_scope = 'company' then
    if existing_event.external_location_id not like 'company:%'
      or not exists (
        select 1
        from public.gohighlevel_oauth_credentials as credential
        where credential.company_id = existing_event.company_id
          and credential.external_company_id = substring(
            existing_event.external_location_id
            from length('company:') + 1
          )
      ) then
      raise exception using errcode = '23514', message = 'Company uninstall scope mismatch.';
    end if;
  elsif existing_event.external_location_id like 'company:%'
    or not exists (
      select 1
      from public.integration_connections as connection
      where connection.id = existing_event.integration_connection_id
        and connection.company_id = existing_event.company_id
        and connection.provider = 'gohighlevel'
        and connection.external_account_id = existing_event.external_location_id
    ) then
    raise exception using errcode = '23514', message = 'Location uninstall scope mismatch.';
  end if;

  return public.wtos_finalize_gohighlevel_uninstall_v1_unscoped_20260902(
    p_event_id,
    p_claim_token,
    lower(p_payload_sha256),
    p_scope
  );
end;
$$;

alter function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)
rename to wtos_requeue_gohighlevel_webhook_v1_unbounded_reason_20260902;

create function public.wtos_requeue_gohighlevel_webhook_v1(
  p_event_id uuid,
  p_expected_attempt_count integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_reason is not null and length(p_reason) > 500 then
    raise exception using errcode = '22023', message = 'Webhook requeue reason is too long.';
  end if;

  -- The reason is intentionally not persisted: it can contain customer data or
  -- credentials. The durable ledger records actor, time, count, and a fixed
  -- operational explanation instead.
  return public.wtos_requeue_gohighlevel_webhook_v1_unbounded_reason_20260902(
    p_event_id,
    p_expected_attempt_count,
    null
  );
end;
$$;

revoke all on function public.wtos_finalize_gohighlevel_uninstall_v1_unscoped_20260902(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_requeue_gohighlevel_webhook_v1_unbounded_reason_20260902(uuid, integer, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
to service_role;
grant execute on function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)
to authenticated;

commit;
