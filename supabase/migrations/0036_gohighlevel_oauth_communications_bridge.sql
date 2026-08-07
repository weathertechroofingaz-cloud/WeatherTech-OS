begin;

create extension if not exists pgcrypto;

create table if not exists public.gohighlevel_oauth_states (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  initiated_by uuid references auth.users(id) on delete set null,
  state_hash text not null unique,
  redirect_path text not null default '/?view=integrations',
  requested_scopes text[] not null default '{}',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.gohighlevel_oauth_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  external_location_id text not null,
  external_company_id text,
  external_user_id text,
  encrypted_access_token text not null,
  encrypted_refresh_token text not null,
  bridge_version text not null default '0036' check (bridge_version = '0036'),
  token_type text not null default 'Bearer',
  scopes text[] not null default '{}',
  user_type text not null default 'Location' check (user_type in ('Location', 'Company')),
  token_expires_at timestamptz not null,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id),
  unique (external_location_id)
);

create table if not exists public.gohighlevel_resource_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  resource_type text not null check (
    resource_type in (
      'contact',
      'conversation',
      'message',
      'call',
      'calendar',
      'calendar_event',
      'pipeline',
      'opportunity',
      'review'
    )
  ),
  external_id text not null,
  external_parent_id text,
  external_contact_id text,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  direction text check (direction is null or direction in ('inbound', 'outbound')),
  status text,
  body_preview text,
  occurred_at timestamptz,
  provider_updated_at timestamptz,
  payload_summary jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, resource_type, external_id)
);

create table if not exists public.gohighlevel_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  webhook_id text not null unique,
  event_type text not null,
  external_location_id text not null,
  external_contact_id text,
  external_conversation_id text,
  external_message_id text,
  signature_version text not null check (signature_version in ('ed25519', 'rsa_legacy')),
  processing_status text not null default 'received' check (
    processing_status in ('received', 'processed', 'ignored', 'failed')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  payload_summary jsonb not null default '{}'::jsonb,
  error_message text,
  occurred_at timestamptz,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gohighlevel_oauth_credentials
add column if not exists bridge_version text not null default '0036';

create unique index if not exists integration_connections_gohighlevel_location_uidx
on public.integration_connections(company_id, provider, external_account_id)
where provider = 'gohighlevel' and external_account_id is not null;

drop index if exists public.gohighlevel_sync_mappings_external_uidx;
create unique index gohighlevel_sync_mappings_external_uidx
on public.gohighlevel_sync_mappings (
  company_id,
  integration_connection_id,
  provider,
  external_object_type,
  external_id
)
where external_id is not null;

drop index if exists public.gohighlevel_sync_mappings_local_uidx;
create unique index gohighlevel_sync_mappings_local_uidx
on public.gohighlevel_sync_mappings (
  company_id,
  integration_connection_id,
  provider,
  local_table,
  local_record_id,
  external_object_type
);

create index if not exists gohighlevel_oauth_states_company_idx
on public.gohighlevel_oauth_states(company_id);

create index if not exists gohighlevel_oauth_states_expiry_idx
on public.gohighlevel_oauth_states(expires_at);

create index if not exists gohighlevel_oauth_credentials_company_idx
on public.gohighlevel_oauth_credentials(company_id);

create index if not exists gohighlevel_resource_snapshots_company_idx
on public.gohighlevel_resource_snapshots(company_id, resource_type, occurred_at desc);

create index if not exists gohighlevel_resource_snapshots_customer_idx
on public.gohighlevel_resource_snapshots(customer_id, occurred_at desc)
where customer_id is not null;

create index if not exists gohighlevel_resource_snapshots_lead_idx
on public.gohighlevel_resource_snapshots(lead_id, occurred_at desc)
where lead_id is not null;

create index if not exists gohighlevel_webhook_events_company_idx
on public.gohighlevel_webhook_events(company_id, received_at desc);

create index if not exists gohighlevel_webhook_events_status_idx
on public.gohighlevel_webhook_events(processing_status, received_at);

alter table public.communication_provider_events
drop constraint if exists communication_provider_events_provider_check;

alter table public.communication_provider_events
add constraint communication_provider_events_provider_check
check (provider in ('twilio', 'twilio_sms', 'gohighlevel')) not valid;

alter table public.communication_provider_events
validate constraint communication_provider_events_provider_check;

alter table public.call_records
drop constraint if exists call_records_provider_check;

alter table public.call_records
add constraint call_records_provider_check
check (provider in ('twilio', 'gohighlevel')) not valid;

alter table public.call_records
validate constraint call_records_provider_check;

drop trigger if exists gohighlevel_oauth_states_set_updated_at
on public.gohighlevel_oauth_states;
create trigger gohighlevel_oauth_states_set_updated_at
before update on public.gohighlevel_oauth_states
for each row execute function public.set_updated_at();

drop trigger if exists gohighlevel_oauth_credentials_set_updated_at
on public.gohighlevel_oauth_credentials;
create trigger gohighlevel_oauth_credentials_set_updated_at
before update on public.gohighlevel_oauth_credentials
for each row execute function public.set_updated_at();

drop trigger if exists gohighlevel_resource_snapshots_set_updated_at
on public.gohighlevel_resource_snapshots;
create trigger gohighlevel_resource_snapshots_set_updated_at
before update on public.gohighlevel_resource_snapshots
for each row execute function public.set_updated_at();

drop trigger if exists gohighlevel_webhook_events_set_updated_at
on public.gohighlevel_webhook_events;
create trigger gohighlevel_webhook_events_set_updated_at
before update on public.gohighlevel_webhook_events
for each row execute function public.set_updated_at();

alter table public.gohighlevel_oauth_states enable row level security;
alter table public.gohighlevel_oauth_credentials enable row level security;
alter table public.gohighlevel_resource_snapshots enable row level security;
alter table public.gohighlevel_webhook_events enable row level security;

revoke all on table public.gohighlevel_oauth_states from anon, public, authenticated;
revoke all on table public.gohighlevel_oauth_credentials from anon, public, authenticated;
revoke all on table public.gohighlevel_resource_snapshots from anon, public;
revoke all on table public.gohighlevel_webhook_events from anon, public;

grant select, insert, update, delete on table public.gohighlevel_oauth_states to service_role;
grant select, insert, update, delete on table public.gohighlevel_oauth_credentials to service_role;
grant select on table public.gohighlevel_resource_snapshots to authenticated;
grant select, insert, update, delete on table public.gohighlevel_resource_snapshots to service_role;
grant select on table public.gohighlevel_webhook_events to authenticated;
grant select, insert, update, delete on table public.gohighlevel_webhook_events to service_role;

drop policy if exists "WTOS users read GoHighLevel resource snapshots"
on public.gohighlevel_resource_snapshots;
create policy "WTOS users read GoHighLevel resource snapshots"
on public.gohighlevel_resource_snapshots
for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS users read GoHighLevel webhook events"
on public.gohighlevel_webhook_events;
create policy "WTOS users read GoHighLevel webhook events"
on public.gohighlevel_webhook_events
for select to authenticated
using (public.wtos_can_read_company(company_id));

commit;
