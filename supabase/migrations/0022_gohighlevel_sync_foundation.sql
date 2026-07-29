begin;

create extension if not exists pgcrypto;

create table if not exists public.gohighlevel_sync_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'gohighlevel' check (provider = 'gohighlevel'),
  local_table text not null check (
    local_table in (
      'companies',
      'customers',
      'leads',
      'estimates',
      'inspections',
      'jobs',
      'job_notes',
      'notifications'
    )
  ),
  local_record_id uuid not null,
  external_object_type text not null check (
    external_object_type in (
      'contact',
      'opportunity',
      'company',
      'note',
      'tag',
      'task',
      'pipeline',
      'stage'
    )
  ),
  external_id text,
  external_location_id text,
  external_account_id text,
  sync_status text not null default 'pending' check (
    sync_status in ('pending', 'synced', 'conflict', 'error', 'ignored', 'disabled')
  ),
  sync_direction text not null default 'two_way' check (
    sync_direction in ('two_way', 'weathertech_to_provider', 'provider_to_weathertech')
  ),
  conflict_status text not null default 'none' check (
    conflict_status in (
      'none',
      'pending_review',
      'resolved_weathertech',
      'resolved_gohighlevel',
      'ignored'
    )
  ),
  conflict_summary text,
  last_synced_at timestamptz,
  external_updated_at timestamptz,
  pending_sync boolean not null default false,
  last_error text,
  record_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gohighlevel_sync_mappings_external_uidx
on public.gohighlevel_sync_mappings (
  provider,
  external_object_type,
  external_id
)
where external_id is not null;

create unique index if not exists gohighlevel_sync_mappings_local_uidx
on public.gohighlevel_sync_mappings (
  provider,
  local_table,
  local_record_id,
  external_object_type
);

create index if not exists gohighlevel_sync_mappings_company_idx
on public.gohighlevel_sync_mappings(company_id);

create index if not exists gohighlevel_sync_mappings_pending_idx
on public.gohighlevel_sync_mappings(pending_sync, sync_status)
where pending_sync = true or sync_status in ('pending', 'conflict', 'error');

create index if not exists gohighlevel_sync_mappings_conflict_idx
on public.gohighlevel_sync_mappings(conflict_status)
where conflict_status <> 'none';

create table if not exists public.gohighlevel_discovery_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'gohighlevel' check (provider = 'gohighlevel'),
  location_key text not null,
  external_location_id text,
  account_name text,
  location_name text,
  pipeline_count integer not null default 0 check (pipeline_count >= 0),
  pipelines jsonb not null default '[]'::jsonb,
  discovery_status text not null default 'pending' check (
    discovery_status in ('pending', 'succeeded', 'failed', 'partial')
  ),
  checked_at timestamptz not null default now(),
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists gohighlevel_discovery_snapshots_location_uidx
on public.gohighlevel_discovery_snapshots(company_id, location_key);

create index if not exists gohighlevel_discovery_snapshots_company_idx
on public.gohighlevel_discovery_snapshots(company_id);

create index if not exists gohighlevel_discovery_snapshots_status_idx
on public.gohighlevel_discovery_snapshots(discovery_status, checked_at desc);

drop trigger if exists gohighlevel_sync_mappings_set_updated_at
on public.gohighlevel_sync_mappings;
create trigger gohighlevel_sync_mappings_set_updated_at
before update on public.gohighlevel_sync_mappings
for each row execute function public.set_updated_at();

drop trigger if exists gohighlevel_discovery_snapshots_set_updated_at
on public.gohighlevel_discovery_snapshots;
create trigger gohighlevel_discovery_snapshots_set_updated_at
before update on public.gohighlevel_discovery_snapshots
for each row execute function public.set_updated_at();

alter table public.gohighlevel_sync_mappings enable row level security;
alter table public.gohighlevel_discovery_snapshots enable row level security;

revoke all on table public.gohighlevel_sync_mappings from anon;
revoke all on table public.gohighlevel_sync_mappings from public;
revoke all on table public.gohighlevel_discovery_snapshots from anon;
revoke all on table public.gohighlevel_discovery_snapshots from public;

grant select, insert, update on table public.gohighlevel_sync_mappings to authenticated;
grant select, insert, update on table public.gohighlevel_discovery_snapshots to authenticated;

grant select, insert, update, delete on table public.gohighlevel_sync_mappings to service_role;
grant select, insert, update, delete on table public.gohighlevel_discovery_snapshots to service_role;

drop policy if exists "Company members read GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings;
create policy "Company members read GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings
for select to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = gohighlevel_sync_mappings.company_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members insert GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings;
create policy "Company members insert GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings
for insert to authenticated
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = gohighlevel_sync_mappings.company_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members update GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings;
create policy "Company members update GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings
for update to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = gohighlevel_sync_mappings.company_id
      and membership.user_id = (select auth.uid())
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
    where membership.company_id = gohighlevel_sync_mappings.company_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members read GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots;
create policy "Company members read GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots
for select to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = gohighlevel_discovery_snapshots.company_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members insert GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots;
create policy "Company members insert GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots
for insert to authenticated
with check (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = gohighlevel_discovery_snapshots.company_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members update GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots;
create policy "Company members update GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots
for update to authenticated
using (
  exists (
    select 1
    from public.company_memberships membership
    where membership.company_id = gohighlevel_discovery_snapshots.company_id
      and membership.user_id = (select auth.uid())
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
    where membership.company_id = gohighlevel_discovery_snapshots.company_id
      and membership.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

commit;
