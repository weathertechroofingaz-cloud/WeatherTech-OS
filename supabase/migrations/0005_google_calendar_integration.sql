create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  provider text not null check (provider in ('google_calendar')),
  status text not null default 'connected' check (
    status in ('connected', 'needs_reauth', 'paused', 'error')
  ),
  account_email text,
  display_name text not null,
  external_account_id text,
  default_calendar_id text,
  scopes text[] not null default '{}',
  sync_direction text not null default 'two_way' check (
    sync_direction in ('two_way', 'weathertech_to_provider', 'provider_to_weathertech')
  ),
  credential_reference text,
  webhook_channel_id text,
  webhook_resource_id text,
  sync_token text,
  last_sync_at timestamptz,
  last_error text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, account_email)
);

create table if not exists public.calendar_event_syncs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  schedule_event_id uuid not null references public.schedule_events(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  provider text not null default 'google_calendar' check (provider in ('google_calendar')),
  google_calendar_id text not null,
  google_event_id text,
  sync_status text not null default 'queued' check (
    sync_status in ('queued', 'synced', 'needs_update', 'conflict', 'error')
  ),
  sync_direction text not null default 'two_way' check (
    sync_direction in ('two_way', 'weathertech_to_provider', 'provider_to_weathertech')
  ),
  last_synced_at timestamptz,
  external_updated_at timestamptz,
  last_error text,
  last_payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, schedule_event_id)
);

create index if not exists integration_connections_company_idx
on public.integration_connections(company_id);

create index if not exists integration_connections_provider_idx
on public.integration_connections(provider);

create index if not exists calendar_event_syncs_event_idx
on public.calendar_event_syncs(schedule_event_id);

create index if not exists calendar_event_syncs_connection_idx
on public.calendar_event_syncs(integration_connection_id);

create index if not exists calendar_event_syncs_status_idx
on public.calendar_event_syncs(sync_status);

drop trigger if exists set_integration_connections_updated_at
on public.integration_connections;
create trigger set_integration_connections_updated_at
before update on public.integration_connections
for each row execute function public.set_updated_at();

drop trigger if exists set_calendar_event_syncs_updated_at
on public.calendar_event_syncs;
create trigger set_calendar_event_syncs_updated_at
before update on public.calendar_event_syncs
for each row execute function public.set_updated_at();

alter table public.integration_connections enable row level security;
alter table public.calendar_event_syncs enable row level security;

create policy "Authenticated users manage integration connections"
on public.integration_connections for all to authenticated using (true) with check (true);

create policy "Authenticated users manage calendar event syncs"
on public.calendar_event_syncs for all to authenticated using (true) with check (true);
