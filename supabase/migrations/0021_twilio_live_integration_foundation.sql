begin;

create table if not exists public.business_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'twilio' check (
    provider in ('twilio', 'twilio_sms')
  ),
  provider_account_sid text,
  messaging_service_sid text,
  phone_number_e164 text,
  display_name text not null,
  routing_key text not null,
  business_location text not null,
  team_queue text not null,
  lead_source text not null,
  communication_channel text not null default 'sms_voice' check (
    communication_channel in ('sms', 'voice', 'sms_voice')
  ),
  time_zone text not null default 'America/Phoenix',
  routing_status text not null default 'needs_review' check (
    routing_status in ('active', 'needs_review', 'disabled', 'unassigned')
  ),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (routing_key)
);

create unique index if not exists business_phone_numbers_phone_number_e164_unique
on public.business_phone_numbers(phone_number_e164)
where phone_number_e164 is not null;

create index if not exists business_phone_numbers_company_idx
on public.business_phone_numbers(company_id);

create index if not exists business_phone_numbers_provider_account_idx
on public.business_phone_numbers(provider, provider_account_sid);

create index if not exists business_phone_numbers_routing_status_idx
on public.business_phone_numbers(routing_status);

alter table public.sms_messages
add column if not exists business_phone_number_id uuid
references public.business_phone_numbers(id) on delete set null;

alter table public.sms_messages
add column if not exists direction text not null default 'outbound' check (
  direction in ('inbound', 'outbound')
);

alter table public.sms_messages
add column if not exists delivery_status text check (
  delivery_status in ('accepted', 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received')
);

alter table public.sms_messages
add column if not exists provider_account_sid text;

alter table public.sms_messages
add column if not exists provider_messaging_service_sid text;

alter table public.sms_messages
add column if not exists delivered_at timestamptz;

alter table public.sms_messages
add column if not exists failed_at timestamptz;

alter table public.sms_messages
add column if not exists correlation_id text not null default gen_random_uuid()::text;

alter table public.sms_messages
add column if not exists provider_payload_fingerprint text;

alter table public.sms_messages
add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists sms_messages_business_phone_number_idx
on public.sms_messages(business_phone_number_id);

create index if not exists sms_messages_delivery_status_idx
on public.sms_messages(delivery_status);

create index if not exists sms_messages_direction_idx
on public.sms_messages(direction);

create index if not exists sms_messages_correlation_id_idx
on public.sms_messages(correlation_id);

create table if not exists public.communication_provider_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  business_phone_number_id uuid references public.business_phone_numbers(id) on delete set null,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  sms_message_id uuid references public.sms_messages(id) on delete set null,
  provider text not null default 'twilio' check (
    provider in ('twilio', 'twilio_sms')
  ),
  provider_account_sid text,
  provider_event_sid text,
  provider_parent_sid text,
  event_type text not null check (
    event_type in (
      'sms_inbound',
      'sms_status',
      'voice_inbound',
      'voice_status',
      'recording_status'
    )
  ),
  channel text not null check (channel in ('sms', 'voice')),
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null,
  from_phone text,
  to_phone text,
  business_phone text,
  customer_phone text,
  routing_status text not null default 'needs_review' check (
    routing_status in ('matched', 'needs_review', 'unassigned', 'migration_required')
  ),
  correlation_id text not null default gen_random_uuid()::text,
  request_fingerprint text,
  payload_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists communication_provider_events_provider_sid_unique
on public.communication_provider_events(provider, event_type, provider_event_sid)
where provider_event_sid is not null;

create index if not exists communication_provider_events_company_idx
on public.communication_provider_events(company_id);

create index if not exists communication_provider_events_business_phone_idx
on public.communication_provider_events(business_phone_number_id);

create index if not exists communication_provider_events_customer_idx
on public.communication_provider_events(customer_id);

create index if not exists communication_provider_events_lead_idx
on public.communication_provider_events(lead_id);

create index if not exists communication_provider_events_event_status_idx
on public.communication_provider_events(event_type, status);

create index if not exists communication_provider_events_received_idx
on public.communication_provider_events(received_at desc);

create table if not exists public.call_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  business_phone_number_id uuid references public.business_phone_numbers(id) on delete set null,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  provider text not null default 'twilio' check (provider in ('twilio')),
  provider_account_sid text,
  provider_call_sid text,
  provider_parent_call_sid text,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  call_status text not null default 'incoming' check (
    call_status in ('incoming', 'ringing', 'in_progress', 'answered', 'completed', 'missed', 'busy', 'failed', 'voicemail')
  ),
  from_phone text,
  to_phone text,
  business_phone text,
  customer_phone text,
  routing_status text not null default 'needs_review' check (
    routing_status in ('matched', 'needs_review', 'unassigned', 'migration_required')
  ),
  started_at timestamptz,
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  recording_sid text,
  recording_status text check (
    recording_status in ('not_requested', 'in_progress', 'completed', 'failed')
  ),
  recording_duration_seconds integer check (
    recording_duration_seconds is null or recording_duration_seconds >= 0
  ),
  transcript_status text check (
    transcript_status in ('not_requested', 'queued', 'completed', 'failed')
  ),
  follow_up_required boolean not null default false,
  correlation_id text not null default gen_random_uuid()::text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists call_records_provider_call_sid_unique
on public.call_records(provider, provider_call_sid)
where provider_call_sid is not null;

create index if not exists call_records_company_idx
on public.call_records(company_id);

create index if not exists call_records_business_phone_idx
on public.call_records(business_phone_number_id);

create index if not exists call_records_customer_idx
on public.call_records(customer_id);

create index if not exists call_records_lead_idx
on public.call_records(lead_id);

create index if not exists call_records_status_idx
on public.call_records(call_status);

create index if not exists call_records_started_at_idx
on public.call_records(started_at desc);

drop trigger if exists set_business_phone_numbers_updated_at
on public.business_phone_numbers;
create trigger set_business_phone_numbers_updated_at
before update on public.business_phone_numbers
for each row execute function public.set_updated_at();

drop trigger if exists set_communication_provider_events_updated_at
on public.communication_provider_events;
create trigger set_communication_provider_events_updated_at
before update on public.communication_provider_events
for each row execute function public.set_updated_at();

drop trigger if exists set_call_records_updated_at
on public.call_records;
create trigger set_call_records_updated_at
before update on public.call_records
for each row execute function public.set_updated_at();

alter table public.business_phone_numbers enable row level security;
alter table public.communication_provider_events enable row level security;
alter table public.call_records enable row level security;

revoke all on table public.business_phone_numbers from anon;
revoke all on table public.business_phone_numbers from public;
revoke all on table public.communication_provider_events from anon;
revoke all on table public.communication_provider_events from public;
revoke all on table public.call_records from anon;
revoke all on table public.call_records from public;

grant select, insert, update on table public.business_phone_numbers to authenticated;
grant select, insert, update on table public.communication_provider_events to authenticated;
grant select, insert, update on table public.call_records to authenticated;

grant select, insert, update, delete on table public.business_phone_numbers to service_role;
grant select, insert, update, delete on table public.communication_provider_events to service_role;
grant select, insert, update, delete on table public.call_records to service_role;

drop policy if exists "Users can read business phone numbers by company" on public.business_phone_numbers;
create policy "Users can read business phone numbers by company"
on public.business_phone_numbers for select
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = business_phone_numbers.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can insert business phone numbers by company" on public.business_phone_numbers;
create policy "Users can insert business phone numbers by company"
on public.business_phone_numbers for insert
to authenticated
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = business_phone_numbers.company_id
      and (membership.can_manage_settings or membership.role in ('owner', 'admin'))
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can update business phone numbers by company" on public.business_phone_numbers;
create policy "Users can update business phone numbers by company"
on public.business_phone_numbers for update
to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = business_phone_numbers.company_id
      and (membership.can_manage_settings or membership.role in ('owner', 'admin'))
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = business_phone_numbers.company_id
      and (membership.can_manage_settings or membership.role in ('owner', 'admin'))
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can read communication provider events by company" on public.communication_provider_events;
create policy "Users can read communication provider events by company"
on public.communication_provider_events for select
to authenticated
using (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = communication_provider_events.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can insert communication provider events by company" on public.communication_provider_events;
create policy "Users can insert communication provider events by company"
on public.communication_provider_events for insert
to authenticated
with check (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = communication_provider_events.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can update communication provider events by company" on public.communication_provider_events;
create policy "Users can update communication provider events by company"
on public.communication_provider_events for update
to authenticated
using (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = communication_provider_events.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
)
with check (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = communication_provider_events.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can read call records by company" on public.call_records;
create policy "Users can read call records by company"
on public.call_records for select
to authenticated
using (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = call_records.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can insert call records by company" on public.call_records;
create policy "Users can insert call records by company"
on public.call_records for insert
to authenticated
with check (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = call_records.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Users can update call records by company" on public.call_records;
create policy "Users can update call records by company"
on public.call_records for update
to authenticated
using (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = call_records.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
)
with check (
  company_id is null
  or exists (
    select 1
    from public.company_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.company_id = call_records.company_id
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

commit;
