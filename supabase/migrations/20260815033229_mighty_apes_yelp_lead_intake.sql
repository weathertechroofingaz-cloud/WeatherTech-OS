begin;

create table public.mighty_apes_yelp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  delivery_id text not null unique,
  payload_fingerprint text not null check (
    payload_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  header_timestamp bigint not null check (header_timestamp > 0),
  payload_version integer not null check (payload_version = 1),
  event_type text not null check (event_type in ('lead.created', 'lead.test')),
  provider_lead_id text not null,
  campaign_yelp_id text not null,
  campaign_name text not null,
  provider_created_at timestamptz not null,
  outcome text not null check (
    outcome in ('created', 'duplicate', 'test_accepted')
  ),
  linked_lead_id uuid references public.leads(id) on delete restrict,
  lead_intake_record_id uuid references public.lead_intake_records(id) on delete restrict,
  integration_sync_log_id uuid references public.integration_sync_logs(id) on delete restrict,
  notification_id uuid references public.notifications(id) on delete restrict,
  received_at timestamptz not null,
  processed_at timestamptz not null default now(),
  constraint mighty_apes_yelp_webhook_events_delivery_id_length check (
    length(delivery_id) between 1 and 240
  ),
  constraint mighty_apes_yelp_webhook_events_provider_lead_id_length check (
    length(provider_lead_id) between 1 and 200
  ),
  constraint mighty_apes_yelp_webhook_events_campaign_id_length check (
    length(campaign_yelp_id) between 1 and 160
  ),
  constraint mighty_apes_yelp_webhook_events_campaign_name_length check (
    length(campaign_name) between 1 and 240
  ),
  constraint mighty_apes_yelp_webhook_events_outcome_links_check check (
    (
      event_type = 'lead.test'
      and outcome = 'test_accepted'
      and linked_lead_id is null
      and lead_intake_record_id is null
      and integration_sync_log_id is null
      and notification_id is null
    )
    or
    (
      event_type = 'lead.created'
      and outcome in ('created', 'duplicate')
      and linked_lead_id is not null
      and lead_intake_record_id is not null
      and integration_sync_log_id is not null
      and notification_id is not null
    )
  )
);

create index mighty_apes_yelp_webhook_events_company_received_idx
on public.mighty_apes_yelp_webhook_events(company_id, received_at desc);

create index mighty_apes_yelp_webhook_events_provider_lead_idx
on public.mighty_apes_yelp_webhook_events(provider_lead_id, received_at desc);

create index mighty_apes_yelp_webhook_events_linked_lead_idx
on public.mighty_apes_yelp_webhook_events(linked_lead_id)
where linked_lead_id is not null;

create index mighty_apes_yelp_webhook_events_intake_idx
on public.mighty_apes_yelp_webhook_events(lead_intake_record_id)
where lead_intake_record_id is not null;

create index mighty_apes_yelp_webhook_events_sync_log_idx
on public.mighty_apes_yelp_webhook_events(integration_sync_log_id)
where integration_sync_log_id is not null;

create index mighty_apes_yelp_webhook_events_notification_idx
on public.mighty_apes_yelp_webhook_events(notification_id)
where notification_id is not null;

alter table public.mighty_apes_yelp_webhook_events enable row level security;

revoke all on table public.mighty_apes_yelp_webhook_events from public;
revoke all on table public.mighty_apes_yelp_webhook_events from anon;
revoke all on table public.mighty_apes_yelp_webhook_events from authenticated;
revoke all on table public.mighty_apes_yelp_webhook_events from service_role;

grant select on table public.mighty_apes_yelp_webhook_events to authenticated;
grant select, insert, delete on table public.mighty_apes_yelp_webhook_events to service_role;

create policy "Company members read Mighty Apes Yelp webhook events"
on public.mighty_apes_yelp_webhook_events
for select to authenticated
using (public.wtos_can_read_company(company_id));

create or replace function public.wtos_protect_mighty_apes_yelp_webhook_event()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if
    tg_op = 'DELETE'
    and current_user = 'service_role'
    and old.delivery_id like 'TEST WTOS MIGHTY APES REGRESSION:%'
    and old.provider_lead_id like 'TEST WTOS MIGHTY APES REGRESSION:%'
  then
    return old;
  end if;

  raise exception using
    errcode = '55000',
    message = 'Mighty Apes Yelp webhook audit events are immutable.';
end;
$$;

revoke all on function public.wtos_protect_mighty_apes_yelp_webhook_event()
from public, anon, authenticated, service_role;

create trigger mighty_apes_yelp_webhook_events_immutable
before update or delete on public.mighty_apes_yelp_webhook_events
for each row execute function public.wtos_protect_mighty_apes_yelp_webhook_event();

create or replace function public.wtos_ingest_mighty_apes_yelp(intake_request jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_company public.companies%rowtype;
  existing_delivery public.mighty_apes_yelp_webhook_events%rowtype;
  prior_delivery public.mighty_apes_yelp_webhook_events%rowtype;
  existing_intake public.lead_intake_records%rowtype;
  existing_lead_company_id uuid;
  existing_sync_company_id uuid;
  existing_sync_provider text;
  existing_sync_external_id text;
  existing_sync_related_table text;
  existing_sync_related_record_id uuid;
  request_version integer;
  request_event text;
  request_delivery_id text;
  request_fingerprint text;
  request_header_timestamp bigint;
  request_received_at timestamptz;
  request_campaign_id text;
  request_campaign_name text;
  request_lead_id text;
  request_lead_name text;
  request_lead_phone text;
  request_zip_code text;
  request_job_category text;
  request_message text;
  request_created_at timestamptz;
  request_created_at_raw text;
  created_lead_id uuid;
  created_sync_log_id uuid;
  created_intake_id uuid;
  created_notification_id uuid;
  created_event_id uuid;
  lead_notes text;
  lead_property_address text;
begin
  if intake_request is null or jsonb_typeof(intake_request) <> 'object' then
    raise exception using errcode = '22023', message = 'Mighty Apes intake request is invalid.';
  end if;

  if jsonb_typeof(intake_request -> 'campaign') <> 'object'
    or jsonb_typeof(intake_request -> 'lead') <> 'object'
  then
    raise exception using errcode = '22023', message = 'Mighty Apes intake request is invalid.';
  end if;

  request_event := intake_request ->> 'event';
  request_delivery_id := intake_request ->> 'delivery_id';
  request_fingerprint := intake_request ->> 'payload_fingerprint';
  request_campaign_id := intake_request -> 'campaign' ->> 'yelp_id';
  request_campaign_name := intake_request -> 'campaign' ->> 'name';
  request_lead_id := intake_request -> 'lead' ->> 'id';
  request_lead_name := intake_request -> 'lead' ->> 'name';
  request_lead_phone := intake_request -> 'lead' ->> 'phone';
  request_zip_code := intake_request -> 'lead' ->> 'zip_code';
  request_job_category := nullif(intake_request -> 'lead' ->> 'job_category', '');
  request_message := intake_request -> 'lead' ->> 'message';
  request_created_at_raw := intake_request -> 'lead' ->> 'created_at';

  begin
    request_version := (intake_request ->> 'version')::integer;
    request_header_timestamp := (intake_request ->> 'header_timestamp')::bigint;
    request_received_at := (intake_request ->> 'received_at')::timestamptz;
    request_created_at := request_created_at_raw::timestamptz;
  exception
    when sqlstate '22003' or sqlstate '22007' or sqlstate '22008' or sqlstate '22P02'
    then
      raise exception using
        errcode = '22023',
        message = 'Mighty Apes intake request is invalid.';
  end;

  if request_version is null
    or request_version is distinct from 1
    or request_event is null
    or request_event not in ('lead.created', 'lead.test')
    or request_delivery_id is null
    or length(request_delivery_id) not between 1 and 240
    or request_delivery_id <> btrim(request_delivery_id)
    or request_delivery_id ~ '[[:cntrl:]]'
    or request_fingerprint is null
    or request_fingerprint !~ '^[a-f0-9]{64}$'
    or request_header_timestamp is null
    or request_header_timestamp <= 0
    or request_received_at is null
    or abs(
      extract(epoch from request_received_at)::bigint - request_header_timestamp
    ) > 300
    or request_campaign_id is null
    or request_campaign_id <> '00LZA1SuPKX0yUnsdthgLg'
    or request_campaign_name is null
    or length(request_campaign_name) not between 1 and 240
    or btrim(request_campaign_name) = ''
    or request_lead_id is null
    or length(request_lead_id) not between 1 and 200
    or request_lead_id <> btrim(request_lead_id)
    or request_lead_id ~ '[[:cntrl:]]'
    or request_lead_name is null
    or length(request_lead_name) not between 1 and 160
    or btrim(request_lead_name) = ''
    or request_lead_name ~ '[[:cntrl:]]'
    or request_lead_phone is null
    or request_lead_phone !~ '^\+[1-9][0-9]{7,14}$'
    or request_zip_code is null
    or request_zip_code !~ '^[0-9]{5}(-[0-9]{4})?$'
    or request_message is null
    or btrim(request_message) = ''
    or octet_length(request_message) > 28000
    or request_created_at_raw is null
    or length(request_created_at_raw) > 80
    or (request_job_category is not null and length(request_job_category) > 240)
  then
    raise exception using errcode = '22023', message = 'Mighty Apes intake request is invalid.';
  end if;

  select company.*
  into target_company
  from public.companies as company
  where company.name = 'WeatherTech Roofing LLC'
    and company.trade = 'roofing';

  if target_company.id is null then
    raise exception using
      errcode = '55000',
      message = 'WeatherTech Roofing LLC routing target is unavailable.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'mighty-apes:yelp:delivery:' || request_delivery_id,
      0
    )
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mighty-apes:yelp:lead:' || request_lead_id, 0)
  );

  select webhook_event.*
  into existing_delivery
  from public.mighty_apes_yelp_webhook_events as webhook_event
  where webhook_event.delivery_id = request_delivery_id
  for update;

  if existing_delivery.id is not null then
    if existing_delivery.payload_fingerprint <> request_fingerprint
      or existing_delivery.event_type <> request_event
      or existing_delivery.provider_lead_id <> request_lead_id
      or existing_delivery.campaign_yelp_id <> request_campaign_id
    then
      raise exception using
        errcode = '23505',
        message = 'MIGHTY_APES_YELP_DELIVERY_CONFLICT';
    end if;

    return jsonb_build_object(
      'status', case
        when existing_delivery.event_type = 'lead.test' then 'test_accepted'
        else 'duplicate'
      end,
      'event_id', existing_delivery.id,
      'lead_id', existing_delivery.linked_lead_id,
      'intake_record_id', existing_delivery.lead_intake_record_id,
      'sync_log_id', existing_delivery.integration_sync_log_id,
      'notification_id', existing_delivery.notification_id
    );
  end if;

  if request_event = 'lead.test' then
    insert into public.mighty_apes_yelp_webhook_events (
      company_id,
      delivery_id,
      payload_fingerprint,
      header_timestamp,
      payload_version,
      event_type,
      provider_lead_id,
      campaign_yelp_id,
      campaign_name,
      provider_created_at,
      outcome,
      received_at
    ) values (
      target_company.id,
      request_delivery_id,
      request_fingerprint,
      request_header_timestamp,
      request_version,
      request_event,
      request_lead_id,
      request_campaign_id,
      request_campaign_name,
      request_created_at,
      'test_accepted',
      request_received_at
    )
    returning id into created_event_id;

    return jsonb_build_object(
      'status', 'test_accepted',
      'event_id', created_event_id,
      'lead_id', null,
      'intake_record_id', null,
      'sync_log_id', null,
      'notification_id', null
    );
  end if;

  select intake.*
  into existing_intake
  from public.lead_intake_records as intake
  where intake.provider = 'yelp'
    and intake.provider_event_id = request_lead_id
  for update;

  if existing_intake.id is not null then
    select
      lead.company_id
    into existing_lead_company_id
    from public.leads as lead
    where lead.id = existing_intake.linked_lead_id
    for share;

    select
      sync_log.company_id,
      sync_log.provider,
      sync_log.external_id,
      sync_log.related_table,
      sync_log.related_record_id
    into
      existing_sync_company_id,
      existing_sync_provider,
      existing_sync_external_id,
      existing_sync_related_table,
      existing_sync_related_record_id
    from public.integration_sync_logs as sync_log
    where sync_log.id = existing_intake.integration_sync_log_id
    for share;

    if existing_intake.company_id is distinct from target_company.id
      or existing_intake.linked_lead_id is null
      or existing_intake.integration_sync_log_id is null
      or existing_lead_company_id is distinct from target_company.id
      or existing_sync_company_id is distinct from target_company.id
      or existing_sync_provider is distinct from 'yelp'
      or existing_sync_external_id is distinct from request_lead_id
      or existing_sync_related_table is distinct from 'leads'
      or existing_sync_related_record_id is distinct from existing_intake.linked_lead_id
    then
      raise exception using
        errcode = '55000',
        message = 'Existing Yelp intake does not match the authorized WeatherTech route.';
    end if;

    select webhook_event.*
    into prior_delivery
    from public.mighty_apes_yelp_webhook_events as webhook_event
    where webhook_event.provider_lead_id = request_lead_id
      and webhook_event.event_type = 'lead.created'
      and webhook_event.linked_lead_id = existing_intake.linked_lead_id
      and webhook_event.notification_id is not null
    order by webhook_event.processed_at asc
    limit 1;

    if prior_delivery.notification_id is null then
      raise exception using
        errcode = '55000',
        message = 'Existing Yelp intake is missing its durable delivery evidence.';
    end if;

    if prior_delivery.company_id is distinct from target_company.id
      or prior_delivery.campaign_yelp_id is distinct from request_campaign_id
      or prior_delivery.payload_fingerprint is distinct from request_fingerprint
    then
      raise exception using
        errcode = '23505',
        message = 'MIGHTY_APES_YELP_LEAD_PAYLOAD_CONFLICT';
    end if;

    insert into public.mighty_apes_yelp_webhook_events (
      company_id,
      delivery_id,
      payload_fingerprint,
      header_timestamp,
      payload_version,
      event_type,
      provider_lead_id,
      campaign_yelp_id,
      campaign_name,
      provider_created_at,
      outcome,
      linked_lead_id,
      lead_intake_record_id,
      integration_sync_log_id,
      notification_id,
      received_at
    ) values (
      target_company.id,
      request_delivery_id,
      request_fingerprint,
      request_header_timestamp,
      request_version,
      request_event,
      request_lead_id,
      request_campaign_id,
      request_campaign_name,
      request_created_at,
      'duplicate',
      existing_intake.linked_lead_id,
      existing_intake.id,
      existing_intake.integration_sync_log_id,
      prior_delivery.notification_id,
      request_received_at
    )
    returning id into created_event_id;

    return jsonb_build_object(
      'status', 'duplicate',
      'event_id', created_event_id,
      'lead_id', existing_intake.linked_lead_id,
      'intake_record_id', existing_intake.id,
      'sync_log_id', existing_intake.integration_sync_log_id,
      'notification_id', prior_delivery.notification_id
    );
  end if;

  lead_property_address := 'Yelp lead - address pending';
  lead_notes := concat(
    'Mighty Apes Yelp lead intake:', E'\n',
    'Provider: Mighty Apes', E'\n',
    'Source: Yelp', E'\n',
    'Company routing: WeatherTech Roofing LLC', E'\n',
    'Branch routing: WeatherTech Phoenix', E'\n',
    'Campaign Yelp ID: ', request_campaign_id, E'\n',
    'Campaign name: ', request_campaign_name, E'\n',
    'Yelp Lead ID: ', request_lead_id, E'\n',
    'ZIP code: ', request_zip_code, E'\n',
    'Job category: ', coalesce(request_job_category, 'Not provided'), E'\n',
    'Provider created at: ', request_created_at_raw, E'\n',
    'Email: Not provided by Yelp', E'\n',
    'Questionnaire:', E'\n', request_message
  );

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'customer_name'
  ) then
    execute $insert_legacy_lead$
      insert into public.leads (
        company_id,
        customer_name,
        phone,
        email,
        property_address,
        lead_source,
        service_needed,
        status,
        pipeline_stage,
        priority,
        estimated_value,
        next_follow_up,
        notes
      ) values ($1, $2, $3, null, $4, 'Yelp', 'roofing', 'new', 'new_lead', 'normal', 0, null, $5)
      returning id
    $insert_legacy_lead$
    into created_lead_id
    using
      target_company.id,
      request_lead_name,
      request_lead_phone,
      concat(lead_property_address, ', AZ ', request_zip_code),
      lead_notes;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'contact_name'
  ) then
    insert into public.leads (
      company_id,
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
      null,
      request_lead_name,
      request_lead_phone,
      null,
      lead_property_address,
      null,
      'AZ',
      request_zip_code,
      'roofing',
      'Yelp',
      'new',
      'new_lead',
      'normal',
      0,
      null,
      lead_notes
    )
    returning id into created_lead_id;
  else
    raise exception using
      errcode = '55000',
      message = 'The CRM lead schema is not compatible with Mighty Apes intake.';
  end if;

  insert into public.integration_sync_logs (
    company_id,
    integration_connection_id,
    provider,
    direction,
    event_type,
    status,
    related_table,
    related_record_id,
    external_id,
    attempt_count,
    max_attempts,
    last_attempted_at,
    completed_at,
    request_fingerprint,
    request_summary,
    response_summary
  ) values (
    target_company.id,
    null,
    'yelp',
    'provider_to_weathertech',
    'yelp.lead.created',
    'succeeded',
    'leads',
    created_lead_id,
    request_lead_id,
    1,
    1,
    request_received_at,
    now(),
    request_fingerprint,
    jsonb_build_object(
      'adapter', 'mighty_apes',
      'event', request_event,
      'delivery_id', request_delivery_id,
      'campaign_yelp_id', request_campaign_id,
      'provider_lead_id', request_lead_id,
      'provider_created_at', request_created_at_raw,
      'has_name', true,
      'has_phone', true,
      'has_zip_code', true,
      'has_job_category', request_job_category is not null,
      'message_length', length(request_message),
      'signature_validated', true
    ),
    jsonb_build_object(
      'persisted', true,
      'lead_id', created_lead_id,
      'outbound_sent', false
    )
  )
  returning id into created_sync_log_id;

  insert into public.notifications (
    company_id,
    customer_id,
    employee_id,
    title,
    message,
    channel,
    status,
    remind_at
  ) values (
    target_company.id,
    null,
    null,
    concat('Follow up: ', request_lead_name),
    concat(
      'New Yelp lead from Mighty Apes was added to WeatherTech Roofing LLC. ',
      'Review CRM lead ', created_lead_id, ' in Leads or Unified Inbox.'
    ),
    'in_app',
    'queued',
    request_received_at
  )
  returning id into created_notification_id;

  insert into public.lead_intake_records (
    company_id,
    linked_lead_id,
    linked_customer_id,
    integration_sync_log_id,
    provider,
    provider_event_id,
    source,
    source_detail,
    campaign,
    correlation_id,
    company_key,
    branch_key,
    routing_status,
    status,
    duplicate_confidence,
    follow_up_state,
    urgency,
    assigned_queue,
    contact_name,
    phone,
    email,
    service_address,
    city,
    state,
    postal_code,
    requested_service,
    message,
    preferred_contact_method,
    source_metadata,
    safe_raw_source_reference,
    possible_matches,
    routing_reasons,
    review_notes,
    intake_timestamp,
    original_submission_timestamp
  ) values (
    target_company.id,
    created_lead_id,
    null,
    created_sync_log_id,
    'yelp',
    request_lead_id,
    'Yelp',
    'Mighty Apes',
    request_campaign_name,
    concat('mighty-apes-yelp:', request_lead_id),
    'weathertech_roofing',
    'weathertech_phoenix',
    'ready_to_create',
    'lead_created',
    'no_match',
    'scheduled',
    'normal',
    'weathertech-roofing-phoenix',
    request_lead_name,
    request_lead_phone,
    null,
    lead_property_address,
    null,
    'AZ',
    request_zip_code,
    'roofing',
    request_message,
    'phone',
    jsonb_build_object(
      'provider', 'mighty_apes',
      'provider_event', request_event,
      'delivery_id', request_delivery_id,
      'payload_fingerprint', request_fingerprint,
      'signature_validated', true,
      'campaign_yelp_id', request_campaign_id,
      'campaign_name', request_campaign_name,
      'provider_lead_id', request_lead_id,
      'provider_created_at', request_created_at_raw,
      'job_category', request_job_category,
      'email_supplied', false,
      'outbound_sent', false
    ),
    concat('mighty-apes:yelp:', request_lead_id),
    '[]'::jsonb,
    jsonb_build_array(
      'Verified Mighty Apes campaign routed to WeatherTech Roofing LLC.',
      'Scottsdale campaign routed to WeatherTech Phoenix queue.'
    ),
    null,
    request_received_at,
    request_created_at
  )
  returning id into created_intake_id;

  insert into public.mighty_apes_yelp_webhook_events (
    company_id,
    delivery_id,
    payload_fingerprint,
    header_timestamp,
    payload_version,
    event_type,
    provider_lead_id,
    campaign_yelp_id,
    campaign_name,
    provider_created_at,
    outcome,
    linked_lead_id,
    lead_intake_record_id,
    integration_sync_log_id,
    notification_id,
    received_at
  ) values (
    target_company.id,
    request_delivery_id,
    request_fingerprint,
    request_header_timestamp,
    request_version,
    request_event,
    request_lead_id,
    request_campaign_id,
    request_campaign_name,
    request_created_at,
    'created',
    created_lead_id,
    created_intake_id,
    created_sync_log_id,
    created_notification_id,
    request_received_at
  )
  returning id into created_event_id;

  return jsonb_build_object(
    'status', 'created',
    'event_id', created_event_id,
    'lead_id', created_lead_id,
    'intake_record_id', created_intake_id,
    'sync_log_id', created_sync_log_id,
    'notification_id', created_notification_id
  );
end;
$$;

revoke all on function public.wtos_ingest_mighty_apes_yelp(jsonb)
from public, anon, authenticated;
grant execute on function public.wtos_ingest_mighty_apes_yelp(jsonb)
to service_role;

commit;
