begin;

alter table public.gmail_oauth_states
add column if not exists provider text;

update public.gmail_oauth_states
set provider = 'gmail'
where provider is null;

alter table public.gmail_oauth_states
alter column provider set default 'gmail',
alter column provider set not null;

alter table public.gmail_oauth_states
drop constraint if exists gmail_oauth_states_provider_check;

alter table public.gmail_oauth_states
add constraint gmail_oauth_states_provider_check
check (provider in ('gmail', 'google_calendar')) not valid;

alter table public.gmail_oauth_states validate constraint gmail_oauth_states_provider_check;

alter table public.calendar_event_syncs
add column if not exists google_recurring_event_id text,
add column if not exists google_event_etag text,
add column if not exists google_event_status text,
add column if not exists provider_updated_at timestamptz,
add column if not exists deleted_at timestamptz,
add column if not exists conflict_status text,
add column if not exists conflict_reason text,
add column if not exists sync_attempt_count integer,
add column if not exists last_synced_direction text,
add column if not exists metadata jsonb;

update public.calendar_event_syncs
set
  google_event_status = coalesce(nullif(google_event_status, ''), 'confirmed'),
  conflict_status = coalesce(nullif(conflict_status, ''), 'none'),
  sync_attempt_count = coalesce(sync_attempt_count, 0),
  metadata = coalesce(metadata, '{}'::jsonb)
where google_event_status is null
  or google_event_status = ''
  or conflict_status is null
  or conflict_status = ''
  or sync_attempt_count is null
  or metadata is null;

alter table public.calendar_event_syncs
alter column google_event_status set default 'confirmed',
alter column google_event_status set not null,
alter column conflict_status set default 'none',
alter column conflict_status set not null,
alter column sync_attempt_count set default 0,
alter column sync_attempt_count set not null,
alter column metadata set default '{}'::jsonb,
alter column metadata set not null;

alter table public.calendar_event_syncs
drop constraint if exists calendar_event_syncs_google_event_status_check;

alter table public.calendar_event_syncs
add constraint calendar_event_syncs_google_event_status_check
check (google_event_status in ('confirmed', 'tentative', 'cancelled')) not valid;

alter table public.calendar_event_syncs validate constraint calendar_event_syncs_google_event_status_check;

alter table public.calendar_event_syncs
drop constraint if exists calendar_event_syncs_conflict_status_check;

alter table public.calendar_event_syncs
add constraint calendar_event_syncs_conflict_status_check
check (conflict_status in ('none', 'possible', 'confirmed', 'resolved')) not valid;

alter table public.calendar_event_syncs validate constraint calendar_event_syncs_conflict_status_check;

alter table public.calendar_event_syncs
drop constraint if exists calendar_event_syncs_sync_attempt_count_check;

alter table public.calendar_event_syncs
add constraint calendar_event_syncs_sync_attempt_count_check
check (sync_attempt_count >= 0) not valid;

alter table public.calendar_event_syncs validate constraint calendar_event_syncs_sync_attempt_count_check;

alter table public.calendar_event_syncs
drop constraint if exists calendar_event_syncs_last_synced_direction_check;

alter table public.calendar_event_syncs
add constraint calendar_event_syncs_last_synced_direction_check
check (
  last_synced_direction is null
  or last_synced_direction in ('two_way', 'weathertech_to_provider', 'provider_to_weathertech')
) not valid;

alter table public.calendar_event_syncs validate constraint calendar_event_syncs_last_synced_direction_check;

create table if not exists public.google_calendar_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  account_email text not null,
  provider_account_id text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_type text,
  scopes text[] not null default '{}',
  token_expires_at timestamptz,
  last_refreshed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id)
);

create table if not exists public.google_calendar_connected_calendars (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  google_calendar_id text not null,
  display_name text not null,
  description text,
  time_zone text,
  access_role text,
  primary_calendar boolean not null default false,
  selected_for_sync boolean not null default false,
  calendar_purpose text not null default 'operations',
  branch_location text,
  sync_mode text not null default 'read_only',
  status text not null default 'active',
  sync_token text,
  webhook_channel_id text,
  webhook_resource_id text,
  webhook_channel_expires_at timestamptz,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, google_calendar_id)
);

create table if not exists public.google_calendar_unmatched_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid not null references public.integration_connections(id) on delete cascade,
  connected_calendar_id uuid references public.google_calendar_connected_calendars(id) on delete set null,
  google_calendar_id text not null,
  google_event_id text not null,
  google_recurring_event_id text,
  google_event_etag text,
  event_status text not null default 'unmatched',
  event_summary text not null,
  event_location text,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day_date date,
  provider_updated_at timestamptz,
  review_status text not null default 'needs_review',
  review_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, google_calendar_id, google_event_id)
);

alter table public.google_calendar_connected_calendars
drop constraint if exists google_calendar_connected_calendars_access_role_check;

alter table public.google_calendar_connected_calendars
add constraint google_calendar_connected_calendars_access_role_check
check (
  access_role is null
  or access_role in ('none', 'freeBusyReader', 'reader', 'writer', 'writerWithoutPrivateAccess', 'owner')
);

alter table public.google_calendar_connected_calendars
drop constraint if exists google_calendar_connected_calendars_purpose_check;

alter table public.google_calendar_connected_calendars
add constraint google_calendar_connected_calendars_purpose_check
check (
  calendar_purpose in (
    'inspections',
    'estimates',
    'production',
    'dispatch',
    'crew',
    'follow_up',
    'materials',
    'service',
    'operations',
    'personal'
  )
);

alter table public.google_calendar_connected_calendars
drop constraint if exists google_calendar_connected_calendars_sync_mode_check;

alter table public.google_calendar_connected_calendars
add constraint google_calendar_connected_calendars_sync_mode_check
check (sync_mode in ('read_only', 'read_write'));

alter table public.google_calendar_connected_calendars
drop constraint if exists google_calendar_connected_calendars_status_check;

alter table public.google_calendar_connected_calendars
add constraint google_calendar_connected_calendars_status_check
check (status in ('active', 'disabled', 'error', 'needs_reauth'));

alter table public.google_calendar_unmatched_events
drop constraint if exists google_calendar_unmatched_events_event_status_check;

alter table public.google_calendar_unmatched_events
add constraint google_calendar_unmatched_events_event_status_check
check (event_status in ('confirmed', 'tentative', 'cancelled', 'unmatched'));

alter table public.google_calendar_unmatched_events
drop constraint if exists google_calendar_unmatched_events_review_status_check;

alter table public.google_calendar_unmatched_events
add constraint google_calendar_unmatched_events_review_status_check
check (review_status in ('needs_review', 'linked', 'dismissed', 'ignored'));

create index if not exists calendar_event_syncs_google_event_idx
on public.calendar_event_syncs(integration_connection_id, google_calendar_id, google_event_id)
where google_event_id is not null;

create index if not exists calendar_event_syncs_recurring_event_idx
on public.calendar_event_syncs(google_recurring_event_id)
where google_recurring_event_id is not null;

create index if not exists calendar_event_syncs_conflict_status_idx
on public.calendar_event_syncs(conflict_status);

create index if not exists google_calendar_credentials_company_idx
on public.google_calendar_credentials(company_id);

create index if not exists google_calendar_credentials_connection_idx
on public.google_calendar_credentials(integration_connection_id);

create index if not exists google_calendar_connected_calendars_company_idx
on public.google_calendar_connected_calendars(company_id);

create index if not exists google_calendar_connected_calendars_connection_idx
on public.google_calendar_connected_calendars(integration_connection_id);

create index if not exists google_calendar_connected_calendars_status_idx
on public.google_calendar_connected_calendars(status, selected_for_sync);

create index if not exists google_calendar_connected_calendars_purpose_idx
on public.google_calendar_connected_calendars(calendar_purpose);

create index if not exists google_calendar_unmatched_events_company_idx
on public.google_calendar_unmatched_events(company_id);

create index if not exists google_calendar_unmatched_events_connection_idx
on public.google_calendar_unmatched_events(integration_connection_id);

create index if not exists google_calendar_unmatched_events_review_idx
on public.google_calendar_unmatched_events(review_status);

drop trigger if exists set_google_calendar_credentials_updated_at
on public.google_calendar_credentials;
create trigger set_google_calendar_credentials_updated_at
before update on public.google_calendar_credentials
for each row execute function public.set_updated_at();

drop trigger if exists set_google_calendar_connected_calendars_updated_at
on public.google_calendar_connected_calendars;
create trigger set_google_calendar_connected_calendars_updated_at
before update on public.google_calendar_connected_calendars
for each row execute function public.set_updated_at();

drop trigger if exists set_google_calendar_unmatched_events_updated_at
on public.google_calendar_unmatched_events;
create trigger set_google_calendar_unmatched_events_updated_at
before update on public.google_calendar_unmatched_events
for each row execute function public.set_updated_at();

alter table public.google_calendar_credentials enable row level security;
alter table public.google_calendar_connected_calendars enable row level security;
alter table public.google_calendar_unmatched_events enable row level security;

revoke all on table public.google_calendar_credentials from anon;
revoke all on table public.google_calendar_credentials from public;
revoke all on table public.google_calendar_credentials from authenticated;
grant select, insert, update, delete on table public.google_calendar_credentials to service_role;

revoke all on table public.google_calendar_connected_calendars from anon;
revoke all on table public.google_calendar_connected_calendars from public;
revoke delete on table public.google_calendar_connected_calendars from authenticated;
grant select, insert, update on table public.google_calendar_connected_calendars to authenticated;
grant select, insert, update, delete on table public.google_calendar_connected_calendars to service_role;

revoke all on table public.google_calendar_unmatched_events from anon;
revoke all on table public.google_calendar_unmatched_events from public;
revoke delete on table public.google_calendar_unmatched_events from authenticated;
grant select, insert, update on table public.google_calendar_unmatched_events to authenticated;
grant select, insert, update, delete on table public.google_calendar_unmatched_events to service_role;

drop policy if exists "WTOS users read Google Calendar connected calendars" on public.google_calendar_connected_calendars;
create policy "WTOS users read Google Calendar connected calendars"
on public.google_calendar_connected_calendars for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS admins insert Google Calendar connected calendars" on public.google_calendar_connected_calendars;
create policy "WTOS admins insert Google Calendar connected calendars"
on public.google_calendar_connected_calendars for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

drop policy if exists "WTOS admins update Google Calendar connected calendars" on public.google_calendar_connected_calendars;
create policy "WTOS admins update Google Calendar connected calendars"
on public.google_calendar_connected_calendars for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

drop policy if exists "WTOS users read Google Calendar unmatched events" on public.google_calendar_unmatched_events;
create policy "WTOS users read Google Calendar unmatched events"
on public.google_calendar_unmatched_events for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS admins insert Google Calendar unmatched events" on public.google_calendar_unmatched_events;
create policy "WTOS admins insert Google Calendar unmatched events"
on public.google_calendar_unmatched_events for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

drop policy if exists "WTOS admins update Google Calendar unmatched events" on public.google_calendar_unmatched_events;
create policy "WTOS admins update Google Calendar unmatched events"
on public.google_calendar_unmatched_events for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

commit;
