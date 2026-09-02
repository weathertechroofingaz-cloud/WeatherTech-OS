begin;

-- GoHighLevel Marketplace currently documents twelve automatic retries after
-- the original delivery. WTOS therefore accepts at most thirteen signed
-- processing claims before requiring an explicit owner/admin requeue.

alter table public.gohighlevel_webhook_events
add column if not exists payload_sha256 text,
add column if not exists claim_token uuid,
add column if not exists lease_expires_at timestamptz,
add column if not exists last_attempted_at timestamptz,
add column if not exists requeued_at timestamptz,
add column if not exists requeued_by uuid references auth.users(id) on delete set null,
add column if not exists requeue_count integer not null default 0;

update public.gohighlevel_webhook_events
set
  processing_status = 'failed',
  error_message = 'Legacy webhook claim requires an exact signed provider redelivery.',
  processed_at = coalesce(processed_at, now())
where processing_status = 'received';

alter table public.gohighlevel_webhook_events
drop constraint if exists gohighlevel_webhook_events_payload_sha256_check;

alter table public.gohighlevel_webhook_events
add constraint gohighlevel_webhook_events_payload_sha256_check
check (
  payload_sha256 is null
  or payload_sha256 ~ '^[0-9a-f]{64}$'
);

alter table public.gohighlevel_webhook_events
drop constraint if exists gohighlevel_webhook_events_claim_lease_check;

alter table public.gohighlevel_webhook_events
add constraint gohighlevel_webhook_events_claim_lease_check
check (
  (processing_status = 'received'
    and payload_sha256 is not null
    and claim_token is not null
    and lease_expires_at is not null)
  or
  (processing_status <> 'received' and lease_expires_at is null)
);

alter table public.gohighlevel_webhook_events
drop constraint if exists gohighlevel_webhook_events_requeue_count_check;

alter table public.gohighlevel_webhook_events
add constraint gohighlevel_webhook_events_requeue_count_check
check (requeue_count >= 0);

create index if not exists gohighlevel_webhook_events_stale_claim_idx
on public.gohighlevel_webhook_events(lease_expires_at)
where processing_status = 'received';

create or replace function public.wtos_claim_gohighlevel_webhook_v1(
  p_claim jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  claim_contract_version constant integer := 1;
  provider_max_attempts constant integer := 13;
  claim_lease_seconds constant integer := 120;
  target_company_id uuid;
  target_connection_id uuid;
  target_webhook_id text;
  target_event_type text;
  target_external_location_id text;
  target_external_contact_id text;
  target_external_conversation_id text;
  target_external_message_id text;
  target_signature_version text;
  target_payload_sha256 text;
  target_payload_summary jsonb;
  target_occurred_at timestamptz;
  existing_event public.gohighlevel_webhook_events%rowtype;
  next_claim_token uuid;
  next_lease_expires_at timestamptz;
  next_attempt_count integer;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if jsonb_typeof(p_claim) is distinct from 'object'
    or coalesce((p_claim ->> 'contractVersion')::integer, 0) <> claim_contract_version
    or coalesce((p_claim ->> 'maxAttempts')::integer, 0) <> provider_max_attempts then
    raise exception using errcode = '22023', message = 'Unsupported webhook claim contract.';
  end if;

  begin
    target_company_id := (p_claim ->> 'companyId')::uuid;
    target_connection_id := (p_claim ->> 'integrationConnectionId')::uuid;
    target_occurred_at := nullif(p_claim ->> 'occurredAt', '')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid webhook claim identity.';
  end;

  target_webhook_id := nullif(btrim(p_claim ->> 'webhookId'), '');
  target_event_type := nullif(btrim(p_claim ->> 'eventType'), '');
  target_external_location_id := nullif(btrim(p_claim ->> 'externalLocationId'), '');
  target_external_contact_id := nullif(btrim(p_claim ->> 'externalContactId'), '');
  target_external_conversation_id := nullif(btrim(p_claim ->> 'externalConversationId'), '');
  target_external_message_id := nullif(btrim(p_claim ->> 'externalMessageId'), '');
  target_signature_version := nullif(btrim(p_claim ->> 'signatureVersion'), '');
  target_payload_sha256 := lower(nullif(btrim(p_claim ->> 'payloadSha256'), ''));
  target_payload_summary := p_claim -> 'payloadSummary';

  if target_company_id is null
    or target_connection_id is null
    or target_webhook_id is null
    or length(target_webhook_id) > 256
    or target_event_type is null
    or length(target_event_type) > 160
    or target_external_location_id is null
    or length(target_external_location_id) > 256
    or target_signature_version not in ('ed25519', 'rsa_legacy')
    or target_payload_sha256 !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(target_payload_summary) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid webhook claim.';
  end if;

  if not exists (
    select 1
    from public.integration_connections as connection
    where connection.id = target_connection_id
      and connection.company_id = target_company_id
      and connection.provider = 'gohighlevel'
  ) then
    raise exception using errcode = '23514', message = 'Webhook connection scope mismatch.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_webhook_id, 0));

  select webhook_event.*
  into existing_event
  from public.gohighlevel_webhook_events as webhook_event
  where webhook_event.webhook_id = target_webhook_id
  for update;

  if not found then
    next_claim_token := gen_random_uuid();
    next_lease_expires_at := clock_timestamp() + make_interval(secs => claim_lease_seconds);

    insert into public.gohighlevel_webhook_events (
      company_id,
      integration_connection_id,
      webhook_id,
      event_type,
      external_location_id,
      external_contact_id,
      external_conversation_id,
      external_message_id,
      signature_version,
      processing_status,
      attempt_count,
      payload_summary,
      payload_sha256,
      claim_token,
      lease_expires_at,
      last_attempted_at,
      error_message,
      occurred_at,
      processed_at
    ) values (
      target_company_id,
      target_connection_id,
      target_webhook_id,
      target_event_type,
      target_external_location_id,
      target_external_contact_id,
      target_external_conversation_id,
      target_external_message_id,
      target_signature_version,
      'received',
      1,
      target_payload_summary,
      target_payload_sha256,
      next_claim_token,
      next_lease_expires_at,
      clock_timestamp(),
      null,
      target_occurred_at,
      null
    )
    returning * into existing_event;

    return jsonb_build_object(
      'contractVersion', claim_contract_version,
      'eventId', existing_event.id,
      'companyId', existing_event.company_id,
      'integrationConnectionId', existing_event.integration_connection_id,
      'payloadSha256', existing_event.payload_sha256,
      'claimToken', existing_event.claim_token,
      'processingStatus', existing_event.processing_status,
      'attemptCount', existing_event.attempt_count,
      'leaseExpiresAt', existing_event.lease_expires_at,
      'disposition', 'claimed'
    );
  end if;

  if existing_event.company_id is distinct from target_company_id
    or existing_event.integration_connection_id is distinct from target_connection_id
    or existing_event.event_type is distinct from target_event_type
    or existing_event.external_location_id is distinct from target_external_location_id
    or existing_event.external_contact_id is distinct from target_external_contact_id
    or existing_event.external_conversation_id is distinct from target_external_conversation_id
    or existing_event.external_message_id is distinct from target_external_message_id then
    raise exception using errcode = '23514', message = 'Webhook replay identity mismatch.';
  end if;

  if existing_event.payload_sha256 is null then
    update public.gohighlevel_webhook_events
    set payload_sha256 = target_payload_sha256
    where id = existing_event.id
      and payload_sha256 is null
    returning * into existing_event;
  elsif existing_event.payload_sha256 is distinct from target_payload_sha256 then
    raise exception using errcode = '23514', message = 'Webhook replay payload mismatch.';
  end if;

  if existing_event.processing_status in ('processed', 'ignored') then
    return jsonb_build_object(
      'contractVersion', claim_contract_version,
      'eventId', existing_event.id,
      'companyId', existing_event.company_id,
      'integrationConnectionId', existing_event.integration_connection_id,
      'payloadSha256', existing_event.payload_sha256,
      'claimToken', existing_event.claim_token,
      'processingStatus', existing_event.processing_status,
      'attemptCount', existing_event.attempt_count,
      'leaseExpiresAt', null,
      'disposition', 'duplicate'
    );
  end if;

  if existing_event.processing_status = 'received'
    and existing_event.lease_expires_at > clock_timestamp() then
    return jsonb_build_object(
      'contractVersion', claim_contract_version,
      'eventId', existing_event.id,
      'companyId', existing_event.company_id,
      'integrationConnectionId', existing_event.integration_connection_id,
      'payloadSha256', existing_event.payload_sha256,
      'claimToken', null,
      'processingStatus', existing_event.processing_status,
      'attemptCount', existing_event.attempt_count,
      'leaseExpiresAt', existing_event.lease_expires_at,
      'disposition', 'busy'
    );
  end if;

  if existing_event.attempt_count >= provider_max_attempts then
    if existing_event.processing_status = 'received' then
      update public.gohighlevel_webhook_events
      set
        processing_status = 'failed',
        error_message = 'HighLevel webhook retry limit reached after a stale processing lease.',
        processed_at = clock_timestamp(),
        lease_expires_at = null
      where id = existing_event.id
      returning * into existing_event;
    end if;

    return jsonb_build_object(
      'contractVersion', claim_contract_version,
      'eventId', existing_event.id,
      'companyId', existing_event.company_id,
      'integrationConnectionId', existing_event.integration_connection_id,
      'payloadSha256', existing_event.payload_sha256,
      'claimToken', null,
      'processingStatus', existing_event.processing_status,
      'attemptCount', existing_event.attempt_count,
      'leaseExpiresAt', null,
      'disposition', 'exhausted'
    );
  end if;

  next_claim_token := gen_random_uuid();
  next_lease_expires_at := clock_timestamp() + make_interval(secs => claim_lease_seconds);
  next_attempt_count := existing_event.attempt_count + 1;

  update public.gohighlevel_webhook_events
  set
    processing_status = 'received',
    attempt_count = next_attempt_count,
    payload_summary = target_payload_summary,
    signature_version = target_signature_version,
    claim_token = next_claim_token,
    lease_expires_at = next_lease_expires_at,
    last_attempted_at = clock_timestamp(),
    error_message = null,
    occurred_at = coalesce(target_occurred_at, occurred_at),
    processed_at = null
  where id = existing_event.id
  returning * into existing_event;

  return jsonb_build_object(
    'contractVersion', claim_contract_version,
    'eventId', existing_event.id,
    'companyId', existing_event.company_id,
    'integrationConnectionId', existing_event.integration_connection_id,
    'payloadSha256', existing_event.payload_sha256,
    'claimToken', existing_event.claim_token,
    'processingStatus', existing_event.processing_status,
    'attemptCount', existing_event.attempt_count,
    'leaseExpiresAt', existing_event.lease_expires_at,
    'disposition', 'claimed'
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid webhook claim identity.';
end;
$$;

create or replace function public.wtos_transition_gohighlevel_webhook_v1(
  p_event_id uuid,
  p_claim_token uuid,
  p_payload_sha256 text,
  p_target_status text,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  transition_contract_version constant integer := 1;
  existing_event public.gohighlevel_webhook_events%rowtype;
  safe_error_message text;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if p_event_id is null
    or p_claim_token is null
    or lower(coalesce(p_payload_sha256, '')) !~ '^[0-9a-f]{64}$'
    or p_target_status not in ('processed', 'ignored', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid webhook transition.';
  end if;

  safe_error_message := case
    when p_target_status = 'failed'
      then left(coalesce(nullif(btrim(p_error_message), ''), 'HighLevel webhook processing failed safely.'), 500)
    else null
  end;

  select webhook_event.*
  into existing_event
  from public.gohighlevel_webhook_events as webhook_event
  where webhook_event.id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Webhook event not found.';
  end if;

  if existing_event.payload_sha256 is distinct from lower(p_payload_sha256)
    or existing_event.claim_token is distinct from p_claim_token then
    raise exception using errcode = '23514', message = 'Webhook transition claim mismatch.';
  end if;

  if existing_event.processing_status = p_target_status
    and existing_event.lease_expires_at is null then
    return jsonb_build_object(
      'contractVersion', transition_contract_version,
      'eventId', existing_event.id,
      'companyId', existing_event.company_id,
      'payloadSha256', existing_event.payload_sha256,
      'claimToken', existing_event.claim_token,
      'processingStatus', existing_event.processing_status,
      'attemptCount', existing_event.attempt_count,
      'idempotent', true
    );
  end if;

  if existing_event.processing_status <> 'received' then
    raise exception using errcode = '23514', message = 'Webhook transition is stale.';
  end if;

  update public.gohighlevel_webhook_events
  set
    processing_status = p_target_status,
    error_message = safe_error_message,
    processed_at = clock_timestamp(),
    lease_expires_at = null
  where id = existing_event.id
    and processing_status = 'received'
    and claim_token = p_claim_token
    and payload_sha256 = lower(p_payload_sha256)
  returning * into existing_event;

  if not found then
    raise exception using errcode = '40001', message = 'Webhook transition lost its claim.';
  end if;

  return jsonb_build_object(
    'contractVersion', transition_contract_version,
    'eventId', existing_event.id,
    'companyId', existing_event.company_id,
    'payloadSha256', existing_event.payload_sha256,
    'claimToken', existing_event.claim_token,
    'processingStatus', existing_event.processing_status,
    'attemptCount', existing_event.attempt_count,
    'idempotent', false
  );
end;
$$;

create or replace function public.wtos_finalize_gohighlevel_uninstall_v1(
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
  transition_contract_version constant integer := 1;
  existing_event public.gohighlevel_webhook_events%rowtype;
  transition_at timestamptz := clock_timestamp();
  credential_count integer := 0;
  connection_count integer := 0;
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
  where webhook_event.id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Webhook event not found.';
  end if;

  if existing_event.payload_sha256 is distinct from lower(p_payload_sha256)
    or existing_event.claim_token is distinct from p_claim_token then
    raise exception using errcode = '23514', message = 'Uninstall transition claim mismatch.';
  end if;

  if existing_event.processing_status = 'processed'
    and existing_event.lease_expires_at is null then
    return jsonb_build_object(
      'contractVersion', transition_contract_version,
      'eventId', existing_event.id,
      'companyId', existing_event.company_id,
      'payloadSha256', existing_event.payload_sha256,
      'claimToken', existing_event.claim_token,
      'processingStatus', existing_event.processing_status,
      'attemptCount', existing_event.attempt_count,
      'scope', p_scope,
      'credentialCount', 0,
      'connectionCount', 0,
      'idempotent', true
    );
  end if;

  if existing_event.processing_status <> 'received' then
    raise exception using errcode = '23514', message = 'Uninstall transition is stale.';
  end if;

  if p_scope = 'company' then
    update public.gohighlevel_oauth_credentials
    set revoked_at = transition_at
    where company_id = existing_event.company_id;
    get diagnostics credential_count = row_count;

    update public.integration_connections
    set
      status = 'needs_reauth',
      last_failure_at = transition_at,
      last_error = 'The HighLevel Marketplace app was uninstalled from this company.'
    where company_id = existing_event.company_id
      and provider = 'gohighlevel';
    get diagnostics connection_count = row_count;
  else
    update public.gohighlevel_oauth_credentials
    set revoked_at = transition_at
    where integration_connection_id = existing_event.integration_connection_id
      and company_id = existing_event.company_id;
    get diagnostics credential_count = row_count;

    update public.integration_connections
    set
      status = 'needs_reauth',
      last_failure_at = transition_at,
      last_error = 'The HighLevel Marketplace app was uninstalled from this location.'
    where id = existing_event.integration_connection_id
      and company_id = existing_event.company_id
      and provider = 'gohighlevel';
    get diagnostics connection_count = row_count;
  end if;

  if connection_count < 1 then
    raise exception using errcode = '23514', message = 'Uninstall connection scope mismatch.';
  end if;

  update public.gohighlevel_webhook_events
  set
    processing_status = 'processed',
    error_message = null,
    processed_at = transition_at,
    lease_expires_at = null
  where id = existing_event.id
    and processing_status = 'received'
    and claim_token = p_claim_token
    and payload_sha256 = lower(p_payload_sha256)
  returning * into existing_event;

  if not found then
    raise exception using errcode = '40001', message = 'Uninstall transition lost its claim.';
  end if;

  return jsonb_build_object(
    'contractVersion', transition_contract_version,
    'eventId', existing_event.id,
    'companyId', existing_event.company_id,
    'payloadSha256', existing_event.payload_sha256,
    'claimToken', existing_event.claim_token,
    'processingStatus', existing_event.processing_status,
    'attemptCount', existing_event.attempt_count,
    'scope', p_scope,
    'credentialCount', credential_count,
    'connectionCount', connection_count,
    'idempotent', false
  );
end;
$$;

create or replace function public.wtos_requeue_gohighlevel_webhook_v1(
  p_event_id uuid,
  p_expected_attempt_count integer,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requeue_contract_version constant integer := 1;
  actor_user_id uuid := (select auth.uid());
  existing_event public.gohighlevel_webhook_events%rowtype;
  safe_reason text;
begin
  if actor_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;

  if p_event_id is null or p_expected_attempt_count is null or p_expected_attempt_count < 1 then
    raise exception using errcode = '22023', message = 'Invalid webhook requeue request.';
  end if;

  select webhook_event.*
  into existing_event
  from public.gohighlevel_webhook_events as webhook_event
  where webhook_event.id = p_event_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Webhook event not found.';
  end if;

  if not (
    public.wtos_has_global_role(array['owner', 'admin'])
    or public.wtos_has_membership_role(existing_event.company_id, array['owner', 'admin'])
  ) then
    raise exception using errcode = '42501', message = 'Company owner or admin required.';
  end if;

  if existing_event.processing_status <> 'failed'
    or existing_event.attempt_count <> p_expected_attempt_count then
    raise exception using errcode = '23514', message = 'Webhook requeue request is stale.';
  end if;

  safe_reason := left(coalesce(nullif(btrim(p_reason), ''), 'Owner or admin approved a signed provider redelivery.'), 500);

  update public.gohighlevel_webhook_events
  set
    attempt_count = 0,
    claim_token = null,
    lease_expires_at = null,
    processed_at = null,
    error_message = 'Requeued for an exact signed HighLevel redelivery: ' || safe_reason,
    requeued_at = clock_timestamp(),
    requeued_by = actor_user_id,
    requeue_count = requeue_count + 1
  where id = existing_event.id
    and processing_status = 'failed'
    and attempt_count = p_expected_attempt_count
  returning * into existing_event;

  if not found then
    raise exception using errcode = '40001', message = 'Webhook requeue lost its claim.';
  end if;

  return jsonb_build_object(
    'contractVersion', requeue_contract_version,
    'eventId', existing_event.id,
    'companyId', existing_event.company_id,
    'processingStatus', existing_event.processing_status,
    'attemptCount', existing_event.attempt_count,
    'requeueCount', existing_event.requeue_count,
    'awaitingSignedRedelivery', true
  );
end;
$$;

revoke all on function public.wtos_claim_gohighlevel_webhook_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_transition_gohighlevel_webhook_v1(uuid, uuid, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_claim_gohighlevel_webhook_v1(jsonb)
to service_role;
grant execute on function public.wtos_transition_gohighlevel_webhook_v1(uuid, uuid, text, text, text)
to service_role;
grant execute on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
to service_role;
grant execute on function public.wtos_requeue_gohighlevel_webhook_v1(uuid, integer, text)
to authenticated;

commit;
