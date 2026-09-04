-- Additive observability and provenance hardening for the read-only HighLevel bridge.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter table public.gohighlevel_webhook_events
add column if not exists duplicate_count integer not null default 0,
add column if not exists last_duplicate_at timestamptz;

alter table public.gohighlevel_webhook_events
drop constraint if exists gohighlevel_webhook_events_duplicate_count_check;

alter table public.gohighlevel_webhook_events
add constraint gohighlevel_webhook_events_duplicate_count_check
check (duplicate_count >= 0);

-- OAuth callback persistence and rotating refresh tokens must remain coherent
-- across concurrent serverless invocations. Existing credentials are preserved;
-- the new version starts at zero and no lease is active until a refresh claims it.
alter table public.gohighlevel_oauth_credentials
add column if not exists refresh_version bigint not null default 0,
add column if not exists refresh_lease_id uuid,
add column if not exists refresh_lease_acquired_at timestamptz,
add column if not exists refresh_lease_expires_at timestamptz;

alter table public.gohighlevel_oauth_credentials
drop constraint if exists gohighlevel_oauth_credentials_refresh_version_check;

alter table public.gohighlevel_oauth_credentials
add constraint gohighlevel_oauth_credentials_refresh_version_check
check (refresh_version >= 0);

alter table public.gohighlevel_oauth_credentials
drop constraint if exists gohighlevel_oauth_credentials_refresh_lease_check;

alter table public.gohighlevel_oauth_credentials
add constraint gohighlevel_oauth_credentials_refresh_lease_check
check (
  (
    refresh_lease_id is null
    and refresh_lease_acquired_at is null
    and refresh_lease_expires_at is null
  )
  or
  (
    refresh_lease_id is not null
    and refresh_lease_acquired_at is not null
    and refresh_lease_expires_at is not null
    and refresh_lease_expires_at > refresh_lease_acquired_at
  )
);

create index if not exists gohighlevel_oauth_credentials_refresh_lease_idx
on public.gohighlevel_oauth_credentials(refresh_lease_expires_at)
where refresh_lease_id is not null;

-- Exact sync-run ownership is persisted in the audit row itself. Legacy rows
-- remain readable; a legacy running row without a lease is treated as stale by
-- the claim RPC and transitioned before a replacement run is inserted.
alter table public.integration_sync_logs
add column if not exists claim_token_sha256 text,
add column if not exists lease_expires_at timestamptz;

alter table public.integration_sync_logs
drop constraint if exists integration_sync_logs_gohighlevel_scope_check;

alter table public.integration_sync_logs
add constraint integration_sync_logs_gohighlevel_scope_check
check (
  provider <> 'gohighlevel'
  or event_type <> 'gohighlevel.sync'
  or integration_connection_id is not null
) not valid;

alter table public.integration_sync_logs
validate constraint integration_sync_logs_gohighlevel_scope_check;

alter table public.integration_sync_logs
drop constraint if exists integration_sync_logs_gohighlevel_lease_check;

alter table public.integration_sync_logs
add constraint integration_sync_logs_gohighlevel_lease_check
check (
  provider <> 'gohighlevel'
  or event_type <> 'gohighlevel.sync'
  or status <> 'running'
  or (claim_token_sha256 is not null and lease_expires_at is not null)
) not valid;

-- A predecessor deployment could leave more than one queued/running/retrying
-- row for the same connection. Keep the newest deterministic anchor for the
-- claim RPC to recover and terminalize every older duplicate before building
-- the active-run uniqueness guard.
with ranked_active_gohighlevel_syncs as (
  select
    sync_log.id,
    pg_catalog.row_number() over (
      partition by sync_log.company_id, sync_log.integration_connection_id
      order by
        pg_catalog.coalesce(
          sync_log.last_attempted_at,
          sync_log.updated_at,
          sync_log.created_at
        ) desc,
        sync_log.created_at desc,
        sync_log.id desc
    ) as active_rank
  from public.integration_sync_logs as sync_log
  where sync_log.provider = 'gohighlevel'
    and sync_log.event_type = 'gohighlevel.sync'
    and sync_log.status in ('queued', 'running', 'retrying')
)
update public.integration_sync_logs as sync_log
set
  status = 'failed',
  completed_at = pg_catalog.coalesce(
    sync_log.completed_at,
    pg_catalog.clock_timestamp()
  ),
  next_retry_at = null,
  claim_token_sha256 = null,
  lease_expires_at = null,
  response_summary = pg_catalog.coalesce(sync_log.response_summary, '{}'::jsonb)
    || pg_catalog.jsonb_build_object(
      'legacyActiveDuplicateReconciled', true,
      'providerRecordsChanged', false
    ),
  error_code = 'gohighlevel_legacy_active_duplicate',
  error_message = 'A newer HighLevel synchronization audit row superseded this legacy run.'
from ranked_active_gohighlevel_syncs as ranked
where sync_log.id = ranked.id
  and ranked.active_rank > 1;

create unique index if not exists integration_sync_logs_gohighlevel_active_uidx
on public.integration_sync_logs(
  company_id,
  integration_connection_id,
  provider,
  event_type
)
where provider = 'gohighlevel'
  and event_type = 'gohighlevel.sync'
  and status in ('queued', 'running', 'retrying');

-- Twilio identifiers are provider-global, but HighLevel identifiers are only
-- unique inside the exact WTOS company and installed-location connection.
-- Split the predecessor indexes so an agency-level identifier reused by the
-- two live companies cannot collapse evidence across company boundaries.
drop index if exists public.communication_provider_events_provider_sid_unique;

create unique index if not exists communication_provider_events_other_provider_sid_unique
on public.communication_provider_events(provider, event_type, provider_event_sid)
where provider <> 'gohighlevel'
  and provider_event_sid is not null;

create unique index if not exists communication_provider_events_gohighlevel_provider_sid_unique
on public.communication_provider_events(
  company_id,
  integration_connection_id,
  provider,
  event_type,
  provider_event_sid
)
where provider = 'gohighlevel'
  and provider_event_sid is not null;

alter table public.communication_provider_events
drop constraint if exists communication_provider_events_gohighlevel_scope_check;

alter table public.communication_provider_events
add constraint communication_provider_events_gohighlevel_scope_check
check (
  provider <> 'gohighlevel'
  or (company_id is not null and integration_connection_id is not null)
) not valid;

alter table public.communication_provider_events
validate constraint communication_provider_events_gohighlevel_scope_check;

drop index if exists public.call_records_provider_call_sid_unique;

create unique index if not exists call_records_non_gohighlevel_provider_call_sid_unique
on public.call_records(provider, provider_call_sid)
where provider <> 'gohighlevel'
  and provider_call_sid is not null;

create unique index if not exists call_records_gohighlevel_provider_call_sid_unique
on public.call_records(
  company_id,
  integration_connection_id,
  provider,
  provider_call_sid
)
where provider = 'gohighlevel'
  and provider_call_sid is not null;

alter table public.call_records
drop constraint if exists call_records_gohighlevel_scope_check;

alter table public.call_records
add constraint call_records_gohighlevel_scope_check
check (
  provider <> 'gohighlevel'
  or (company_id is not null and integration_connection_id is not null)
) not valid;

alter table public.call_records
validate constraint call_records_gohighlevel_scope_check;

-- HighLevel may deliver the same call or message through polling and webhooks.
-- Persist the provider's version separately from local updated_at so a delayed
-- observation cannot overwrite newer provider state or retrigger automation.
alter table public.communication_provider_events
add column if not exists provider_updated_at timestamptz,
add column if not exists provider_version_source text,
add column if not exists provider_status_rank integer,
add column if not exists provider_content_sha256 text;

alter table public.call_records
add column if not exists provider_updated_at timestamptz,
add column if not exists provider_version_source text,
add column if not exists provider_status_rank integer,
add column if not exists provider_content_sha256 text;

update public.communication_provider_events
set
  provider_updated_at = pg_catalog.coalesce(
    provider_updated_at,
    occurred_at,
    received_at,
    created_at
  ),
  provider_version_source = pg_catalog.coalesce(
    provider_version_source,
    'legacy_backfill'
  ),
  provider_status_rank = pg_catalog.coalesce(
    provider_status_rank,
    case pg_catalog.lower(status)
      when 'incoming' then 0
      when 'queued' then 10
      when 'pending' then 10
      when 'scheduled' then 10
      when 'ringing' then 10
      when 'in_progress' then 20
      when 'sent' then 20
      when 'answered' then 30
      when 'connected' then 30
      when 'received' then 30
      when 'delivered' then 40
      when 'read' then 50
      when 'opened' then 50
      when 'clicked' then 50
      when 'opt_out' then 50
      when 'completed' then 50
      when 'missed' then 40
      when 'voicemail' then 50
      when 'busy' then 50
      when 'failed' then 50
      when 'undelivered' then 50
      when 'canceled' then 50
      when 'cancelled' then 50
      else null
    end
  ),
  provider_content_sha256 = pg_catalog.coalesce(
    provider_content_sha256,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.jsonb_build_object(
          'providerParentId', provider_parent_sid,
          'channel', channel,
          'direction', direction,
          'status', status,
          'fromPhone', from_phone,
          'toPhone', to_phone,
          'occurredAt', occurred_at,
          'payloadSummary', payload_summary
            - 'associationAuthoritative'
            - 'matchStatus'
            - 'matchCandidateCount'
        )::text,
        'sha256'
      ),
      'hex'
    )
  )
where provider = 'gohighlevel'
  and (
    provider_updated_at is null
    or provider_version_source is null
    or provider_content_sha256 is null
  );

update public.call_records
set
  provider_updated_at = pg_catalog.coalesce(
    provider_updated_at,
    started_at,
    ended_at,
    updated_at,
    created_at
  ),
  provider_version_source = pg_catalog.coalesce(
    provider_version_source,
    'legacy_backfill'
  ),
  provider_status_rank = pg_catalog.coalesce(
    provider_status_rank,
    case call_status
      when 'incoming' then 0
      when 'ringing' then 10
      when 'in_progress' then 20
      when 'answered' then 30
      when 'connected' then 30
      when 'received' then 30
      when 'missed' then 40
      when 'completed' then 50
      when 'opened' then 50
      when 'clicked' then 50
      when 'opt_out' then 50
      when 'voicemail' then 50
      when 'busy' then 50
      when 'failed' then 50
      else null
    end
  ),
  provider_content_sha256 = pg_catalog.coalesce(
    provider_content_sha256,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.jsonb_build_object(
          'providerParentId', provider_parent_call_sid,
          'direction', direction,
          'status', call_status,
          'fromPhone', from_phone,
          'toPhone', to_phone,
          'startedAt', started_at,
          'answeredAt', answered_at,
          'endedAt', ended_at,
          'durationSeconds', duration_seconds,
          'recordingId', recording_sid,
          'recordingStatus', recording_status,
          'transcriptStatus', transcript_status,
          'payloadSummary', metadata
            - 'associationAuthoritative'
            - 'matchStatus'
            - 'matchCandidateCount'
        )::text,
        'sha256'
      ),
      'hex'
    )
  )
where provider = 'gohighlevel'
  and (
    provider_updated_at is null
    or provider_version_source is null
    or provider_content_sha256 is null
  );

alter table public.communication_provider_events
drop constraint if exists communication_provider_events_gohighlevel_version_check;

alter table public.communication_provider_events
add constraint communication_provider_events_gohighlevel_version_check
check (
  provider <> 'gohighlevel'
  or (
    provider_updated_at is not null
    and provider_version_source in (
      'updated_at',
      'created_at_fallback',
      'legacy_backfill'
    )
    and provider_content_sha256 ~ '^[0-9a-f]{64}$'
  )
) not valid;

alter table public.communication_provider_events
validate constraint communication_provider_events_gohighlevel_version_check;

alter table public.call_records
drop constraint if exists call_records_gohighlevel_version_check;

alter table public.call_records
add constraint call_records_gohighlevel_version_check
check (
  provider <> 'gohighlevel'
  or (
    provider_updated_at is not null
    and provider_version_source in (
      'updated_at',
      'created_at_fallback',
      'legacy_backfill'
    )
    and provider_content_sha256 ~ '^[0-9a-f]{64}$'
  )
) not valid;

alter table public.call_records
validate constraint call_records_gohighlevel_version_check;

-- Alias resolution must be scoped by both the WTOS company and the selected
-- installed-location connection. The redundant unique key makes that scope
-- enforceable by composite foreign keys instead of application convention.
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.integration_connections'::regclass
      and constraint_record.conname = 'integration_connections_company_id_id_key'
  ) then
    alter table public.integration_connections
    add constraint integration_connections_company_id_id_key
    unique (company_id, id);
  end if;
end;
$$;

create table if not exists public.gohighlevel_communication_identities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  integration_connection_id uuid not null,
  channel text not null check (channel in ('sms', 'voice', 'email')),
  canonical_external_id text not null check (
    pg_catalog.length(canonical_external_id) between 1 and 512
  ),
  last_observed_tuple_fingerprint text check (
    last_observed_tuple_fingerprint is null
    or last_observed_tuple_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  reconciliation_status text not null default 'resolved' check (
    reconciliation_status in ('resolved', 'needs_reconciliation')
  ),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  last_conflict_at timestamptz,
  last_conflict_reason text check (
    last_conflict_reason is null
    or last_conflict_reason in (
      'provider_alias_collision',
      'tuple_fingerprint_collision'
    )
  ),
  last_conflict_alias_fingerprint text check (
    last_conflict_alias_fingerprint is null
    or last_conflict_alias_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gohighlevel_communication_identities_connection_fkey
    foreign key (company_id, integration_connection_id)
    references public.integration_connections(company_id, id)
    on delete cascade,
  constraint gohighlevel_communication_identities_scope_id_key
    unique (company_id, integration_connection_id, channel, id),
  constraint gohighlevel_communication_identities_canonical_key
    unique (
      company_id,
      integration_connection_id,
      channel,
      canonical_external_id
    )
);

create table if not exists public.gohighlevel_communication_identity_aliases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  integration_connection_id uuid not null,
  channel text not null check (channel in ('sms', 'voice', 'email')),
  communication_identity_id uuid not null,
  alias_type text not null check (
    alias_type in (
      'messageId',
      'emailMessageId',
      'id',
      'altId'
    )
  ),
  external_id text not null check (
    pg_catalog.length(external_id) between 1 and 512
  ),
  created_at timestamptz not null default now(),
  constraint gohighlevel_communication_identity_aliases_connection_fkey
    foreign key (company_id, integration_connection_id)
    references public.integration_connections(company_id, id)
    on delete cascade,
  constraint gohighlevel_communication_identity_aliases_identity_fkey
    foreign key (
      company_id,
      integration_connection_id,
      channel,
      communication_identity_id
    ) references public.gohighlevel_communication_identities(
      company_id,
      integration_connection_id,
      channel,
      id
    ) on delete cascade,
  constraint gohighlevel_communication_identity_aliases_external_key
    unique (
      company_id,
      integration_connection_id,
      channel,
      external_id
    )
);

create table if not exists public.gohighlevel_communication_identity_conflicts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  integration_connection_id uuid not null,
  channel text not null check (channel in ('sms', 'voice', 'email')),
  conflict_key text not null check (conflict_key ~ '^[0-9a-f]{64}$'),
  conflict_kind text not null check (
    conflict_kind in (
      'incomplete_identity',
      'provider_alias_collision',
      'tuple_fingerprint_collision'
    )
  ),
  tuple_fingerprint text check (
    tuple_fingerprint is null or tuple_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  alias_fingerprint text check (
    alias_fingerprint is null or alias_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  alias_evidence jsonb not null default '[]'::jsonb check (
    pg_catalog.jsonb_typeof(alias_evidence) = 'array'
    and pg_catalog.jsonb_array_length(alias_evidence) <= 6
    and pg_catalog.octet_length(alias_evidence::text) <= 4096
  ),
  candidate_identity_ids uuid[] not null default '{}' check (
    pg_catalog.cardinality(candidate_identity_ids) <= 12
  ),
  status text not null default 'open' check (
    status in ('open', 'resolved')
  ),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gohighlevel_communication_identity_conflicts_connection_fkey
    foreign key (company_id, integration_connection_id)
    references public.integration_connections(company_id, id)
    on delete cascade,
  constraint gohighlevel_communication_identity_conflicts_scope_key
    unique (
      company_id,
      integration_connection_id,
      channel,
      conflict_key
  )
);

-- Preserve canonical identity for already-persisted scoped provider evidence.
-- Event/call siblings with the same exact provider ID coalesce into one voice
-- identity. Snapshot-only rows are deliberately not used to infer a channel.
with legacy_identity_candidates as (
  select distinct
    provider_event.company_id,
    provider_event.integration_connection_id,
    provider_event.channel,
    pg_catalog.btrim(provider_event.provider_event_sid) as external_id
  from public.communication_provider_events as provider_event
  inner join public.integration_connections as connection
    on connection.id = provider_event.integration_connection_id
    and connection.company_id = provider_event.company_id
    and connection.provider = 'gohighlevel'
  where provider_event.provider = 'gohighlevel'
    and provider_event.company_id is not null
    and provider_event.integration_connection_id is not null
    and provider_event.channel in ('sms', 'voice')
    and pg_catalog.length(
      pg_catalog.btrim(provider_event.provider_event_sid)
    ) between 1 and 512
  union
  select distinct
    call.company_id,
    call.integration_connection_id,
    'voice'::text as channel,
    pg_catalog.btrim(call.provider_call_sid) as external_id
  from public.call_records as call
  inner join public.integration_connections as connection
    on connection.id = call.integration_connection_id
    and connection.company_id = call.company_id
    and connection.provider = 'gohighlevel'
  where call.provider = 'gohighlevel'
    and call.company_id is not null
    and call.integration_connection_id is not null
    and pg_catalog.length(
      pg_catalog.btrim(call.provider_call_sid)
    ) between 1 and 512
)
insert into public.gohighlevel_communication_identities (
  company_id,
  integration_connection_id,
  channel,
  canonical_external_id
)
select
  candidate.company_id,
  candidate.integration_connection_id,
  candidate.channel,
  candidate.external_id
from legacy_identity_candidates as candidate
on conflict (
  company_id,
  integration_connection_id,
  channel,
  canonical_external_id
) do nothing;

with legacy_identity_candidates as (
  select distinct
    provider_event.company_id,
    provider_event.integration_connection_id,
    provider_event.channel,
    pg_catalog.btrim(provider_event.provider_event_sid) as external_id
  from public.communication_provider_events as provider_event
  inner join public.integration_connections as connection
    on connection.id = provider_event.integration_connection_id
    and connection.company_id = provider_event.company_id
    and connection.provider = 'gohighlevel'
  where provider_event.provider = 'gohighlevel'
    and provider_event.company_id is not null
    and provider_event.integration_connection_id is not null
    and provider_event.channel in ('sms', 'voice')
    and pg_catalog.length(
      pg_catalog.btrim(provider_event.provider_event_sid)
    ) between 1 and 512
  union
  select distinct
    call.company_id,
    call.integration_connection_id,
    'voice'::text as channel,
    pg_catalog.btrim(call.provider_call_sid) as external_id
  from public.call_records as call
  inner join public.integration_connections as connection
    on connection.id = call.integration_connection_id
    and connection.company_id = call.company_id
    and connection.provider = 'gohighlevel'
  where call.provider = 'gohighlevel'
    and call.company_id is not null
    and call.integration_connection_id is not null
    and pg_catalog.length(
      pg_catalog.btrim(call.provider_call_sid)
    ) between 1 and 512
)
insert into public.gohighlevel_communication_identity_aliases (
  company_id,
  integration_connection_id,
  channel,
  communication_identity_id,
  alias_type,
  external_id
)
select
  candidate.company_id,
  candidate.integration_connection_id,
  candidate.channel,
  identity_record.id,
  'id',
  candidate.external_id
from legacy_identity_candidates as candidate
inner join public.gohighlevel_communication_identities as identity_record
  on identity_record.company_id = candidate.company_id
  and identity_record.integration_connection_id
    = candidate.integration_connection_id
  and identity_record.channel = candidate.channel
  and identity_record.canonical_external_id = candidate.external_id
on conflict (
  company_id,
  integration_connection_id,
  channel,
  external_id
) do nothing;

create index if not exists gohighlevel_communication_identity_aliases_identity_idx
on public.gohighlevel_communication_identity_aliases(
  company_id,
  integration_connection_id,
  channel,
  communication_identity_id
);

create index if not exists gohighlevel_communication_identity_conflicts_status_idx
on public.gohighlevel_communication_identity_conflicts(
  company_id,
  integration_connection_id,
  status,
  last_observed_at desc
);

drop trigger if exists gohighlevel_communication_identities_set_updated_at
on public.gohighlevel_communication_identities;
create trigger gohighlevel_communication_identities_set_updated_at
before update on public.gohighlevel_communication_identities
for each row execute function public.set_updated_at();

drop trigger if exists gohighlevel_communication_identity_conflicts_set_updated_at
on public.gohighlevel_communication_identity_conflicts;
create trigger gohighlevel_communication_identity_conflicts_set_updated_at
before update on public.gohighlevel_communication_identity_conflicts
for each row execute function public.set_updated_at();

alter table public.gohighlevel_communication_identities enable row level security;
alter table public.gohighlevel_communication_identity_aliases enable row level security;
alter table public.gohighlevel_communication_identity_conflicts enable row level security;

revoke all on table public.gohighlevel_communication_identities
from public, anon, authenticated;
revoke all on table public.gohighlevel_communication_identity_aliases
from public, anon, authenticated;
revoke all on table public.gohighlevel_communication_identity_conflicts
from public, anon, authenticated;

grant select, insert, update, delete
on table public.gohighlevel_communication_identities to service_role;
grant select, insert, update, delete
on table public.gohighlevel_communication_identity_aliases to service_role;
grant select, insert, update, delete
on table public.gohighlevel_communication_identity_conflicts to service_role;

-- Provider evidence is written only by verified server-side webhook/sync paths.
-- Authenticated users retain company-scoped SELECT through the existing policies.
revoke all on table public.gohighlevel_resource_snapshots from authenticated;
revoke all on table public.gohighlevel_webhook_events from authenticated;
revoke all on table public.communication_provider_events from authenticated;
revoke all on table public.call_records from authenticated;
revoke all on table public.gohighlevel_sync_mappings from authenticated;
revoke all on table public.gohighlevel_discovery_snapshots from authenticated;

grant select on table public.gohighlevel_resource_snapshots to authenticated;
grant select on table public.gohighlevel_webhook_events to authenticated;
grant select on table public.communication_provider_events to authenticated;
grant select on table public.call_records to authenticated;
grant select on table public.gohighlevel_sync_mappings to authenticated;
grant select on table public.gohighlevel_discovery_snapshots to authenticated;

-- This shared audit table still supports the existing authenticated non-GHL
-- insert/update workflow, but ownership-changing and table-wide privileges are
-- never required by the app and TRUNCATE is not protected by RLS.
revoke delete, truncate, references, trigger
on table public.integration_sync_logs from authenticated;

do $$
begin
  if exists (
    select 1
    from information_schema.role_table_grants as table_grant
    where table_grant.table_schema = 'public'
      and table_grant.grantee = 'authenticated'
      and table_grant.table_name in (
        'gohighlevel_resource_snapshots',
        'gohighlevel_webhook_events',
        'communication_provider_events',
        'call_records',
        'gohighlevel_sync_mappings',
        'gohighlevel_discovery_snapshots'
      )
      and table_grant.privilege_type <> 'SELECT'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Provider evidence retains an authenticated mutation privilege.';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants as table_grant
    where table_grant.table_schema = 'public'
      and table_grant.grantee = 'authenticated'
      and table_grant.table_name = 'integration_sync_logs'
      and table_grant.privilege_type in (
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Integration sync logs retain an unsafe authenticated privilege.';
  end if;
end;
$$;

drop policy if exists "WTOS users insert communication provider events"
on public.communication_provider_events;
drop policy if exists "WTOS users update communication provider events"
on public.communication_provider_events;
drop policy if exists "WTOS users insert call records"
on public.call_records;
drop policy if exists "WTOS users update call records"
on public.call_records;
drop policy if exists "WTOS users insert GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS users update GoHighLevel sync mappings"
on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS admins insert GHL sync mappings"
on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS admins update GHL sync mappings"
on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS users insert GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots;
drop policy if exists "WTOS users update GoHighLevel discovery snapshots"
on public.gohighlevel_discovery_snapshots;
drop policy if exists "WTOS admins insert GHL discovery snapshots"
on public.gohighlevel_discovery_snapshots;
drop policy if exists "WTOS admins update GHL discovery snapshots"
on public.gohighlevel_discovery_snapshots;

-- Authenticated clients may continue writing unrelated provider audit logs,
-- but the production HighLevel sync-run state machine is service-only.
drop policy if exists "Authenticated users insert integration sync logs"
on public.integration_sync_logs;
drop policy if exists "Authenticated users update integration sync logs"
on public.integration_sync_logs;

drop policy if exists "WTOS users insert integration sync logs"
on public.integration_sync_logs;
create policy "WTOS users insert integration sync logs"
on public.integration_sync_logs for insert to authenticated
with check (
  (
    public.wtos_can_manage_sales(company_id)
    or public.wtos_can_manage_settings(company_id)
  )
  and not (
    provider = 'gohighlevel'
    and event_type = 'gohighlevel.sync'
  )
);

drop policy if exists "WTOS users update integration sync logs"
on public.integration_sync_logs;
create policy "WTOS users update integration sync logs"
on public.integration_sync_logs for update to authenticated
using (
  (
    public.wtos_can_manage_sales(company_id)
    or public.wtos_can_manage_settings(company_id)
  )
  and not (
    provider = 'gohighlevel'
    and event_type = 'gohighlevel.sync'
  )
)
with check (
  (
    public.wtos_can_manage_sales(company_id)
    or public.wtos_can_manage_settings(company_id)
  )
  and not (
    provider = 'gohighlevel'
    and event_type = 'gohighlevel.sync'
  )
);

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'integration_sync_logs'
      and policy.cmd in ('ALL', 'INSERT', 'UPDATE')
      and policy.policyname not in (
        'WTOS users insert integration sync logs',
        'WTOS users update integration sync logs'
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Unexpected integration sync-log mutation policy remains active.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'integration_sync_logs'
      and policy.policyname = 'WTOS users insert integration sync logs'
      and policy.cmd = 'INSERT'
      and 'authenticated' = any(policy.roles)
      and policy.with_check like '%wtos_can_manage_sales%'
      and policy.with_check like '%wtos_can_manage_settings%'
      and policy.with_check like '%gohighlevel.sync%'
  ) or not exists (
    select 1
    from pg_catalog.pg_policies as policy
    where policy.schemaname = 'public'
      and policy.tablename = 'integration_sync_logs'
      and policy.policyname = 'WTOS users update integration sync logs'
      and policy.cmd = 'UPDATE'
      and 'authenticated' = any(policy.roles)
      and policy.qual like '%wtos_can_manage_sales%'
      and policy.qual like '%wtos_can_manage_settings%'
      and policy.qual like '%gohighlevel.sync%'
      and policy.with_check like '%wtos_can_manage_sales%'
      and policy.with_check like '%wtos_can_manage_settings%'
      and policy.with_check like '%gohighlevel.sync%'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Integration sync-log policies are not company-scoped and GHL-safe.';
  end if;
end;
$$;

create or replace function public.wtos_claim_gohighlevel_sync_v1(
  p_claim jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_contract_version constant integer := 1;
  target_company_id uuid;
  target_connection_id uuid;
  target_claim_token uuid;
  target_claim_token_sha256 text;
  target_lease_seconds integer;
  normalized_request_fingerprint text := pg_catalog.lower(
    pg_catalog.coalesce(p_claim ->> 'requestFingerprint', '')
  );
  target_connection public.integration_connections%rowtype;
  existing_run public.integration_sync_logs%rowtype;
  claimed_run public.integration_sync_logs%rowtype;
  stale_run_recovered boolean := false;
  claim_at timestamptz := pg_catalog.clock_timestamp();
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_claim) is distinct from 'object'
    or pg_catalog.coalesce((p_claim ->> 'contractVersion')::integer, 0)
      <> sync_contract_version then
    raise exception using errcode = '22023', message = 'Unsupported sync claim contract.';
  end if;

  begin
    target_company_id := (p_claim ->> 'companyId')::uuid;
    target_connection_id := (p_claim ->> 'integrationConnectionId')::uuid;
    target_claim_token := (p_claim ->> 'claimToken')::uuid;
    target_lease_seconds := (p_claim ->> 'leaseSeconds')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid sync claim.';
  end;

  if target_company_id is null
    or target_connection_id is null
    or target_claim_token is null
    or target_lease_seconds is null
    or target_lease_seconds < 60
    or target_lease_seconds > 1800
    or normalized_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid sync claim.';
  end if;

  target_claim_token_sha256 := pg_catalog.encode(
    extensions.digest(target_claim_token::text, 'sha256'),
    'hex'
  );

  select connection.*
  into target_connection
  from public.integration_connections as connection
  where connection.id = target_connection_id
    and connection.company_id = target_company_id
    and connection.provider = 'gohighlevel'
  for share;

  if target_connection.id is null then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'unavailable',
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:gohighlevel:sync:'
        || target_company_id::text
        || ':'
        || target_connection_id::text,
      0
    )
  );

  select sync_log.*
  into existing_run
  from public.integration_sync_logs as sync_log
  where sync_log.company_id = target_company_id
    and sync_log.integration_connection_id = target_connection_id
    and sync_log.provider = 'gohighlevel'
    and sync_log.event_type = 'gohighlevel.sync'
    and sync_log.status in ('queued', 'running', 'retrying')
  for update;

  if existing_run.id is not null then
    if existing_run.status = 'running'
      and existing_run.claim_token_sha256 is not null
      and existing_run.lease_expires_at > claim_at then
      return pg_catalog.jsonb_build_object(
        'contractVersion', sync_contract_version,
        'disposition', 'busy',
        'syncLogId', existing_run.id,
        'companyId', target_company_id,
        'integrationConnectionId', target_connection_id,
        'leaseExpiresAt', existing_run.lease_expires_at,
        'staleRunRecovered', false
      );
    end if;

    update public.integration_sync_logs
    set
      status = 'failed',
      completed_at = claim_at,
      next_retry_at = null,
      claim_token_sha256 = null,
      lease_expires_at = null,
      response_summary = pg_catalog.coalesce(response_summary, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'staleRunRecovered', true,
          'providerRecordsChanged', false
        ),
      error_code = 'gohighlevel_sync_lease_expired',
      error_message = 'The prior HighLevel synchronization lease expired.'
    where id = existing_run.id
      and status in ('queued', 'running', 'retrying');

    if not found then
      raise exception using errcode = '40001', message = 'Stale sync recovery was lost.';
    end if;
    stale_run_recovered := true;
  end if;

  insert into public.integration_sync_logs (
    company_id,
    integration_connection_id,
    provider,
    direction,
    event_type,
    status,
    attempt_count,
    max_attempts,
    next_retry_at,
    last_attempted_at,
    completed_at,
    request_fingerprint,
    request_summary,
    response_summary,
    error_code,
    error_message,
    claim_token_sha256,
    lease_expires_at
  ) values (
    target_company_id,
    target_connection_id,
    'gohighlevel',
    'provider_to_weathertech',
    'gohighlevel.sync',
    'running',
    1,
    1,
    null,
    claim_at,
    null,
    normalized_request_fingerprint,
    pg_catalog.jsonb_build_object(
      'readOnlyProviderSync', true,
      'outboundWrites', false
    ),
    '{}'::jsonb,
    null,
    null,
    target_claim_token_sha256,
    claim_at + pg_catalog.make_interval(secs => target_lease_seconds)
  )
  returning * into claimed_run;

  return pg_catalog.jsonb_build_object(
    'contractVersion', sync_contract_version,
    'disposition', 'claimed',
    'syncLogId', claimed_run.id,
    'companyId', claimed_run.company_id,
    'integrationConnectionId', claimed_run.integration_connection_id,
    'status', claimed_run.status,
    'leaseExpiresAt', claimed_run.lease_expires_at,
    'staleRunRecovered', stale_run_recovered
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid sync claim.';
end;
$$;

create or replace function public.wtos_renew_gohighlevel_sync_v1(
  p_renewal jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_contract_version constant integer := 1;
  target_sync_log_id uuid;
  target_company_id uuid;
  target_connection_id uuid;
  target_claim_token uuid;
  target_claim_token_sha256 text;
  target_lease_seconds integer;
  existing_run public.integration_sync_logs%rowtype;
  renewed_run public.integration_sync_logs%rowtype;
  renewal_at timestamptz := pg_catalog.clock_timestamp();
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_renewal) is distinct from 'object'
    or pg_catalog.coalesce((p_renewal ->> 'contractVersion')::integer, 0)
      <> sync_contract_version
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_renewal)
        as renewal_key(key_name)
      where renewal_key.key_name not in (
        'contractVersion',
        'syncLogId',
        'companyId',
        'integrationConnectionId',
        'claimToken',
        'leaseSeconds'
      )
    ) then
    raise exception using errcode = '22023', message = 'Unsupported sync renewal contract.';
  end if;

  begin
    target_sync_log_id := (p_renewal ->> 'syncLogId')::uuid;
    target_company_id := (p_renewal ->> 'companyId')::uuid;
    target_connection_id := (p_renewal ->> 'integrationConnectionId')::uuid;
    target_claim_token := (p_renewal ->> 'claimToken')::uuid;
    target_lease_seconds := (p_renewal ->> 'leaseSeconds')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid sync renewal.';
  end;

  if target_sync_log_id is null
    or target_company_id is null
    or target_connection_id is null
    or target_claim_token is null
    or target_lease_seconds is null
    or target_lease_seconds < 60
    or target_lease_seconds > 300 then
    raise exception using errcode = '22023', message = 'Invalid sync renewal.';
  end if;

  target_claim_token_sha256 := pg_catalog.encode(
    extensions.digest(target_claim_token::text, 'sha256'),
    'hex'
  );

  if not exists (
    select 1
    from public.integration_connections as connection
    where connection.id = target_connection_id
      and connection.company_id = target_company_id
      and connection.provider = 'gohighlevel'
  ) then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'unavailable',
      'syncLogId', target_sync_log_id,
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id
    );
  end if;

  select sync_log.*
  into existing_run
  from public.integration_sync_logs as sync_log
  where sync_log.id = target_sync_log_id
    and sync_log.company_id = target_company_id
    and sync_log.integration_connection_id = target_connection_id
    and sync_log.provider = 'gohighlevel'
    and sync_log.event_type = 'gohighlevel.sync'
  for update;

  if existing_run.id is null then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'unavailable',
      'syncLogId', target_sync_log_id,
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id
    );
  end if;

  if existing_run.status <> 'running'
    or existing_run.claim_token_sha256
      is distinct from target_claim_token_sha256 then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'stale',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', existing_run.status
    );
  end if;

  if existing_run.lease_expires_at is null
    or existing_run.lease_expires_at <= renewal_at then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'expired',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', existing_run.status,
      'leaseExpiresAt', existing_run.lease_expires_at
    );
  end if;

  update public.integration_sync_logs
  set
    lease_expires_at = pg_catalog.greatest(
      lease_expires_at,
      renewal_at + pg_catalog.make_interval(secs => target_lease_seconds)
    ),
    last_attempted_at = renewal_at
  where id = existing_run.id
    and company_id = target_company_id
    and integration_connection_id = target_connection_id
    and provider = 'gohighlevel'
    and event_type = 'gohighlevel.sync'
    and status = 'running'
    and claim_token_sha256 = target_claim_token_sha256
    and lease_expires_at > renewal_at
  returning * into renewed_run;

  if renewed_run.id is null then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'stale',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', existing_run.status
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', sync_contract_version,
    'disposition', 'renewed',
    'syncLogId', renewed_run.id,
    'companyId', renewed_run.company_id,
    'integrationConnectionId', renewed_run.integration_connection_id,
    'status', renewed_run.status,
    'leaseExpiresAt', renewed_run.lease_expires_at,
    'lastAttemptedAt', renewed_run.last_attempted_at
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid sync renewal.';
end;
$$;

create or replace function public.wtos_complete_gohighlevel_sync_v1(
  p_completion jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sync_contract_version constant integer := 1;
  target_sync_log_id uuid;
  target_company_id uuid;
  target_connection_id uuid;
  target_claim_token uuid;
  target_claim_token_sha256 text;
  target_outcome text := p_completion ->> 'outcome';
  target_error_code text := pg_catalog.nullif(
    pg_catalog.btrim(p_completion ->> 'errorCode'),
    ''
  );
  target_response_summary jsonb := p_completion -> 'responseSummary';
  existing_run public.integration_sync_logs%rowtype;
  completed_run public.integration_sync_logs%rowtype;
  completion_at timestamptz := pg_catalog.clock_timestamp();
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_completion) is distinct from 'object'
    or pg_catalog.coalesce((p_completion ->> 'contractVersion')::integer, 0)
      <> sync_contract_version then
    raise exception using errcode = '22023', message = 'Unsupported sync completion contract.';
  end if;

  begin
    target_sync_log_id := (p_completion ->> 'syncLogId')::uuid;
    target_company_id := (p_completion ->> 'companyId')::uuid;
    target_connection_id := (p_completion ->> 'integrationConnectionId')::uuid;
    target_claim_token := (p_completion ->> 'claimToken')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid sync completion.';
  end;

  if target_sync_log_id is null
    or target_company_id is null
    or target_connection_id is null
    or target_claim_token is null
    or target_outcome is null
    or target_outcome not in ('succeeded', 'failed')
    or pg_catalog.jsonb_typeof(target_response_summary) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid sync completion.';
  end if;

  if pg_catalog.octet_length(target_response_summary::text) > 65536
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(target_response_summary)
        as summary_key(key_name)
      where summary_key.key_name not in (
        'totalFetched',
        'totalSaved',
        'totalFailed',
        'totalDuplicatesSuppressed',
        'pagination',
        'providerRequests',
        'tokenRefreshed',
        'resources',
        'providerRecordsChanged'
      )
    )
    or (
      target_outcome = 'succeeded'
      and target_error_code is not null
    )
    or (
      target_outcome = 'failed'
      and (
        target_error_code is null
        or target_error_code not in (
          'gohighlevel_partial_sync',
          'gohighlevel_sync_failed'
        )
      )
    ) then
    raise exception using errcode = '22023', message = 'Invalid sync completion.';
  end if;

  target_claim_token_sha256 := pg_catalog.encode(
    extensions.digest(target_claim_token::text, 'sha256'),
    'hex'
  );

  select sync_log.*
  into existing_run
  from public.integration_sync_logs as sync_log
  where sync_log.id = target_sync_log_id
    and sync_log.company_id = target_company_id
    and sync_log.integration_connection_id = target_connection_id
    and sync_log.provider = 'gohighlevel'
    and sync_log.event_type = 'gohighlevel.sync'
  for update;

  if existing_run.id is null then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'unavailable',
      'syncLogId', target_sync_log_id,
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id
    );
  end if;

  if existing_run.claim_token_sha256 is distinct from target_claim_token_sha256 then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'stale',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', existing_run.status,
      'idempotent', false
    );
  end if;

  if existing_run.status <> 'running' then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'completed',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', existing_run.status,
      'completedAt', existing_run.completed_at,
      'idempotent', true
    );
  end if;

  if existing_run.lease_expires_at is null
    or existing_run.lease_expires_at <= completion_at then
    update public.integration_sync_logs
    set
      status = 'failed',
      completed_at = completion_at,
      next_retry_at = null,
      claim_token_sha256 = null,
      lease_expires_at = null,
      response_summary = pg_catalog.coalesce(response_summary, '{}'::jsonb)
        || pg_catalog.jsonb_build_object(
          'staleRunRecovered', true,
          'providerRecordsChanged', false
        ),
      error_code = 'gohighlevel_sync_lease_expired',
      error_message = 'The HighLevel synchronization lease expired before completion.'
    where id = existing_run.id
      and status = 'running'
      and claim_token_sha256 = target_claim_token_sha256;

    if not found then
      raise exception using errcode = '40001', message = 'Expired sync completion was lost.';
    end if;

    update public.integration_connections
    set
      last_sync_at = completion_at,
      last_failure_at = completion_at,
      last_error = 'HighLevel synchronization lease expired before completion.'
    where id = target_connection_id
      and company_id = target_company_id
      and provider = 'gohighlevel';

    if not found then
      raise exception using errcode = '23514', message = 'Sync completion connection scope mismatch.';
    end if;

    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'stale',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', 'failed',
      'idempotent', false
    );
  end if;

  update public.integration_sync_logs
  set
    status = target_outcome,
    completed_at = completion_at,
    next_retry_at = null,
    lease_expires_at = null,
    response_summary = target_response_summary,
    error_code = case
      when target_outcome = 'succeeded' then null
      else target_error_code
    end,
    error_message = case
      when target_outcome = 'succeeded' then null
      when target_error_code = 'gohighlevel_partial_sync'
        then 'One or more HighLevel resources failed to synchronize.'
      else 'HighLevel synchronization failed.'
    end
  where id = existing_run.id
    and company_id = target_company_id
    and integration_connection_id = target_connection_id
    and provider = 'gohighlevel'
    and event_type = 'gohighlevel.sync'
    and status = 'running'
    and claim_token_sha256 = target_claim_token_sha256
    and lease_expires_at > completion_at
  returning * into completed_run;

  if completed_run.id is null then
    return pg_catalog.jsonb_build_object(
      'contractVersion', sync_contract_version,
      'disposition', 'stale',
      'syncLogId', existing_run.id,
      'companyId', existing_run.company_id,
      'integrationConnectionId', existing_run.integration_connection_id,
      'status', existing_run.status,
      'idempotent', false
    );
  end if;

  update public.integration_connections
  set
    last_sync_at = completion_at,
    last_successful_sync_at = case
      when target_outcome = 'succeeded' then completion_at
      else last_successful_sync_at
    end,
    last_failure_at = case
      when target_outcome = 'failed' then completion_at
      else last_failure_at
    end,
    last_error = case
      when target_outcome = 'succeeded' then null
      when target_error_code = 'gohighlevel_partial_sync'
        then 'One or more HighLevel resources failed to synchronize.'
      else 'HighLevel synchronization failed.'
    end
  where id = target_connection_id
    and company_id = target_company_id
    and provider = 'gohighlevel';

  if not found then
    raise exception using errcode = '23514', message = 'Sync completion connection scope mismatch.';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', sync_contract_version,
    'disposition', 'completed',
    'syncLogId', completed_run.id,
    'companyId', completed_run.company_id,
    'integrationConnectionId', completed_run.integration_connection_id,
    'status', completed_run.status,
    'completedAt', completed_run.completed_at,
    'idempotent', false
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid sync completion.';
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

    -- HighLevel represents both a missed call and a voicemail as an unanswered
    -- call that requires the existing WTOS follow-up automation event.
    if new.company_id is null
      or new.direction <> 'inbound'
      or new.call_status not in ('missed', 'voicemail')
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
    -- Preserve the predecessor contract: Twilio updates emit only when the
    -- status itself transitions into missed; voicemail remains unchanged.
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

  safe_payload := pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'provider', new.provider,
      'direction', new.direction,
      'status', new.call_status,
      'routing_status', new.routing_status,
      'customer_id', new.customer_id,
      'lead_id', new.lead_id,
      'job_id', new.job_id,
      'business_phone_number_id', new.business_phone_number_id
    )
  );
  perform public.wtos_emit_automation_event_v1(
    new.company_id,
    location_id,
    'missed_call.received',
    'call_records',
    new.id::text,
    pg_catalog.encode(
      extensions.digest(
        pg_catalog.coalesce(
          pg_catalog.nullif(new.provider_call_sid, ''),
          new.id::text
        ),
        'sha256'
      ),
      'hex'
    ),
    safe_payload,
    pg_catalog.coalesce(new.ended_at, new.updated_at, pg_catalog.now()),
    null,
    stable_idempotency_key
  );

  return new;
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
set search_path = ''
as $$
declare
  transition_contract_version constant integer := 1;
  existing_event public.gohighlevel_webhook_events%rowtype;
  safe_error_message text;
  transition_at timestamptz := pg_catalog.clock_timestamp();
  normalized_payload_sha256 text := pg_catalog.lower(
    pg_catalog.coalesce(p_payload_sha256, '')
  );
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if p_event_id is null
    or p_claim_token is null
    or normalized_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_target_status is null
    or p_target_status not in ('processed', 'ignored', 'failed') then
    raise exception using errcode = '22023', message = 'Invalid webhook transition.';
  end if;

  -- Caller-supplied exception text is intentionally never persisted because it
  -- may contain customer content or credentials. Keep the signature stable for
  -- the deployed route while recording only a fixed operational failure.
  safe_error_message := case
    when p_target_status = 'failed'
      then 'HighLevel webhook processing failed safely.'
    else null
  end;

  select webhook_event.*
  into existing_event
  from public.gohighlevel_webhook_events as webhook_event
  where webhook_event.id = p_event_id
  for update;

  if existing_event.id is null then
    raise exception using errcode = 'P0002', message = 'Webhook event not found.';
  end if;

  if existing_event.payload_sha256 is distinct from normalized_payload_sha256
    or existing_event.claim_token is distinct from p_claim_token then
    raise exception using errcode = '23514', message = 'Webhook transition claim mismatch.';
  end if;

  if existing_event.processing_status = p_target_status
    and existing_event.lease_expires_at is null then
    return pg_catalog.jsonb_build_object(
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

  if existing_event.processing_status <> 'received'
    or existing_event.lease_expires_at is null
    or existing_event.lease_expires_at <= transition_at then
    raise exception using errcode = '23514', message = 'Webhook transition is stale.';
  end if;

  update public.gohighlevel_webhook_events
  set
    processing_status = p_target_status,
    error_message = safe_error_message,
    processed_at = transition_at,
    lease_expires_at = null
  where id = existing_event.id
    and processing_status = 'received'
    and claim_token = p_claim_token
    and payload_sha256 = normalized_payload_sha256
    and lease_expires_at > transition_at
  returning * into existing_event;

  if existing_event.id is null then
    raise exception using errcode = '40001', message = 'Webhook transition lost its claim.';
  end if;

  update public.integration_connections
  set
    last_sync_at = transition_at,
    last_successful_sync_at = case
      when p_target_status = 'processed' then transition_at
      else last_successful_sync_at
    end,
    last_failure_at = case
      when p_target_status = 'failed' then transition_at
      else last_failure_at
    end,
    last_error = case
      when p_target_status = 'processed' then null
      when p_target_status = 'failed' then safe_error_message
      else last_error
    end,
    settings = pg_catalog.coalesce(settings, '{}'::jsonb)
      || pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
          'webhooksVerified', true,
          'lastVerifiedWebhookAt', transition_at,
          'lastWebhookFailureAt', case
            when p_target_status = 'failed' then transition_at
            else null
          end,
          'lastWebhookSignatureVersion', existing_event.signature_version
        )
      )
  where id = existing_event.integration_connection_id
    and company_id = existing_event.company_id
    and provider = 'gohighlevel';

  if not found then
    raise exception using errcode = '23514', message = 'Webhook connection scope mismatch.';
  end if;

  return pg_catalog.jsonb_build_object(
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

create or replace function public.wtos_upsert_gohighlevel_resource_snapshots_v1(
  p_batch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_contract_version constant integer := 1;
  maximum_batch_records constant integer := 200;
  maximum_batch_bytes constant integer := 1048576;
  target_company_id uuid;
  target_connection_id uuid;
  target_connection public.integration_connections%rowtype;
  batch_synced_at timestamptz := pg_catalog.clock_timestamp();
  record_value jsonb;
  record_count integer;
  saved_count integer := 0;
  skipped_count integer := 0;
  target_resource_type text;
  target_external_id text;
  target_external_parent_id text;
  target_external_contact_id text;
  target_customer_id uuid;
  target_lead_id uuid;
  target_direction text;
  target_status text;
  target_body_preview text;
  target_occurred_at timestamptz;
  target_provider_updated_at timestamptz;
  target_payload_summary jsonb;
  association_authoritative boolean;
  existing_snapshot public.gohighlevel_resource_snapshots%rowtype;
  snapshot_exists boolean;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_batch) is distinct from 'object'
    or pg_catalog.coalesce((p_batch ->> 'contractVersion')::integer, 0)
      <> snapshot_contract_version
    or pg_catalog.octet_length(p_batch::text) > maximum_batch_bytes
    or pg_catalog.jsonb_typeof(p_batch -> 'records') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid resource snapshot batch.';
  end if;

  begin
    target_company_id := (p_batch ->> 'companyId')::uuid;
    target_connection_id := (p_batch ->> 'integrationConnectionId')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid resource snapshot scope.';
  end;

  record_count := pg_catalog.jsonb_array_length(p_batch -> 'records');
  if target_company_id is null
    or target_connection_id is null
    or record_count < 1
    or record_count > maximum_batch_records then
    raise exception using errcode = '22023', message = 'Invalid resource snapshot batch.';
  end if;

  select connection.*
  into target_connection
  from public.integration_connections as connection
  where connection.id = target_connection_id
    and connection.company_id = target_company_id
    and connection.provider = 'gohighlevel'
  for share;

  if target_connection.id is null then
    raise exception using errcode = '23514', message = 'Resource snapshot connection scope mismatch.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:gohighlevel:snapshots:'
        || target_company_id::text
        || ':'
        || target_connection_id::text,
      0
    )
  );

  for record_value in
    select batch_record.value
    from pg_catalog.jsonb_array_elements(p_batch -> 'records')
      as batch_record(value)
  loop
    if pg_catalog.jsonb_typeof(record_value) is distinct from 'object'
      or record_value ->> 'companyId' is distinct from target_company_id::text
      or record_value ->> 'integrationConnectionId'
        is distinct from target_connection_id::text
      or pg_catalog.jsonb_typeof(record_value -> 'payloadSummary')
        is distinct from 'object' then
      raise exception using errcode = '23514', message = 'Resource snapshot record scope mismatch.';
    end if;

    target_resource_type := pg_catalog.nullif(
      pg_catalog.btrim(record_value ->> 'resourceType'),
      ''
    );
    target_external_id := pg_catalog.nullif(
      pg_catalog.btrim(record_value ->> 'externalId'),
      ''
    );
    target_external_parent_id := pg_catalog.nullif(
      pg_catalog.btrim(record_value ->> 'externalParentId'),
      ''
    );
    target_external_contact_id := pg_catalog.nullif(
      pg_catalog.btrim(record_value ->> 'externalContactId'),
      ''
    );
    target_direction := pg_catalog.nullif(
      pg_catalog.btrim(record_value ->> 'direction'),
      ''
    );
    target_status := pg_catalog.nullif(
      pg_catalog.btrim(record_value ->> 'status'),
      ''
    );
    target_body_preview := record_value ->> 'bodyPreview';
    target_payload_summary := record_value -> 'payloadSummary';

    if target_resource_type is null
      or target_resource_type not in (
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
      or target_external_id is null
      or pg_catalog.length(target_external_id) > 512
      or pg_catalog.length(pg_catalog.coalesce(target_external_parent_id, '')) > 512
      or pg_catalog.length(pg_catalog.coalesce(target_external_contact_id, '')) > 512
      or target_direction not in ('inbound', 'outbound')
        and target_direction is not null
      or pg_catalog.length(pg_catalog.coalesce(target_status, '')) > 80
      or pg_catalog.length(pg_catalog.coalesce(target_body_preview, '')) > 500
      or pg_catalog.octet_length(target_payload_summary::text) > 16384
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(target_payload_summary)
          as summary_key(key_name)
        where pg_catalog.lower(summary_key.key_name) in (
          'accesstoken',
          'access_token',
          'refreshtoken',
          'refresh_token',
          'authorization',
          'rawpayload',
          'raw_payload'
        )
      )
      or (
        target_payload_summary ? 'associationAuthoritative'
        and pg_catalog.jsonb_typeof(
          target_payload_summary -> 'associationAuthoritative'
        ) is distinct from 'boolean'
      ) then
      raise exception using errcode = '22023', message = 'Invalid resource snapshot record.';
    end if;

    begin
      target_customer_id := pg_catalog.nullif(
        pg_catalog.btrim(record_value ->> 'customerId'),
        ''
      )::uuid;
      target_lead_id := pg_catalog.nullif(
        pg_catalog.btrim(record_value ->> 'leadId'),
        ''
      )::uuid;
      target_occurred_at := pg_catalog.nullif(
        pg_catalog.btrim(record_value ->> 'occurredAt'),
        ''
      )::timestamptz;
      target_provider_updated_at := pg_catalog.nullif(
        pg_catalog.btrim(record_value ->> 'providerUpdatedAt'),
        ''
      )::timestamptz;
    exception when invalid_text_representation
      or datetime_field_overflow
      or invalid_datetime_format then
      raise exception using errcode = '22023', message = 'Invalid resource snapshot identity or timestamp.';
    end;

    if target_customer_id is not null and target_lead_id is not null then
      raise exception using errcode = '23514', message = 'Resource snapshot association is ambiguous.';
    end if;
    if target_customer_id is not null
      and not exists (
        select 1
        from public.customers as customer
        where customer.id = target_customer_id
          and customer.company_id = target_company_id
      ) then
      raise exception using errcode = '23514', message = 'Resource snapshot customer scope mismatch.';
    end if;
    if target_lead_id is not null
      and not exists (
        select 1
        from public.leads as lead
        where lead.id = target_lead_id
          and lead.company_id = target_company_id
      ) then
      raise exception using errcode = '23514', message = 'Resource snapshot lead scope mismatch.';
    end if;

    association_authoritative := pg_catalog.coalesce(
      (target_payload_summary ->> 'associationAuthoritative')::boolean,
      false
    );

    select snapshot.*
    into existing_snapshot
    from public.gohighlevel_resource_snapshots as snapshot
    where snapshot.company_id = target_company_id
      and snapshot.integration_connection_id = target_connection_id
      and snapshot.resource_type = target_resource_type
      and snapshot.external_id = target_external_id
    for update;
    snapshot_exists := found;

    if snapshot_exists
      and existing_snapshot.provider_updated_at is not null
      and (
        target_provider_updated_at is null
        or target_provider_updated_at < existing_snapshot.provider_updated_at
      ) then
      update public.gohighlevel_resource_snapshots
      set last_synced_at = pg_catalog.greatest(last_synced_at, batch_synced_at)
      where id = existing_snapshot.id
        and company_id = target_company_id
        and integration_connection_id = target_connection_id;
      if not found then
        raise exception using errcode = '40001', message = 'Resource snapshot stale observation was lost.';
      end if;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if snapshot_exists then
      if target_resource_type in ('message', 'call')
        and existing_snapshot.provider_updated_at is not null
        and target_provider_updated_at = existing_snapshot.provider_updated_at then
        target_external_parent_id := pg_catalog.coalesce(
          existing_snapshot.external_parent_id,
          target_external_parent_id
        );
        target_external_contact_id := pg_catalog.coalesce(
          existing_snapshot.external_contact_id,
          target_external_contact_id
        );
        target_direction := pg_catalog.coalesce(
          existing_snapshot.direction,
          target_direction
        );
        target_status := pg_catalog.coalesce(
          existing_snapshot.status,
          target_status
        );
        target_body_preview := pg_catalog.coalesce(
          existing_snapshot.body_preview,
          target_body_preview
        );
        target_occurred_at := pg_catalog.coalesce(
          existing_snapshot.occurred_at,
          target_occurred_at
        );
        target_payload_summary := pg_catalog.jsonb_strip_nulls(
          target_payload_summary
        ) || pg_catalog.coalesce(
          existing_snapshot.payload_summary,
          '{}'::jsonb
        );
      end if;

      if not association_authoritative then
        target_customer_id := existing_snapshot.customer_id;
        target_lead_id := existing_snapshot.lead_id;
      end if;

      update public.gohighlevel_resource_snapshots
      set
        external_parent_id = target_external_parent_id,
        external_contact_id = target_external_contact_id,
        customer_id = target_customer_id,
        lead_id = target_lead_id,
        direction = target_direction,
        status = target_status,
        body_preview = target_body_preview,
        occurred_at = target_occurred_at,
        provider_updated_at = target_provider_updated_at,
        payload_summary = target_payload_summary,
        last_synced_at = pg_catalog.greatest(last_synced_at, batch_synced_at)
      where id = existing_snapshot.id
        and company_id = target_company_id
        and integration_connection_id = target_connection_id
        and resource_type = target_resource_type
        and external_id = target_external_id;

      if not found then
        raise exception using errcode = '40001', message = 'Resource snapshot update was lost.';
      end if;
    else
      insert into public.gohighlevel_resource_snapshots (
        company_id,
        integration_connection_id,
        resource_type,
        external_id,
        external_parent_id,
        external_contact_id,
        customer_id,
        lead_id,
        direction,
        status,
        body_preview,
        occurred_at,
        provider_updated_at,
        payload_summary,
        last_synced_at
      ) values (
        target_company_id,
        target_connection_id,
        target_resource_type,
        target_external_id,
        target_external_parent_id,
        target_external_contact_id,
        target_customer_id,
        target_lead_id,
        target_direction,
        target_status,
        target_body_preview,
        target_occurred_at,
        target_provider_updated_at,
        target_payload_summary,
        batch_synced_at
      );
    end if;

    saved_count := saved_count + 1;
  end loop;

  return pg_catalog.jsonb_build_object(
    'contractVersion', snapshot_contract_version,
    'companyId', target_company_id,
    'integrationConnectionId', target_connection_id,
    'receivedCount', record_count,
    'savedCount', saved_count,
    'skippedCount', skipped_count,
    'syncedAt', batch_synced_at
  );
exception when invalid_text_representation
  or numeric_value_out_of_range
  or datetime_field_overflow
  or invalid_datetime_format then
  raise exception using errcode = '22023', message = 'Invalid resource snapshot batch.';
end;
$$;

create or replace function public.wtos_resolve_gohighlevel_communication_identity_v1(
  p_resolution jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  identity_contract_version constant integer := 1;
  maximum_alias_count constant integer := 6;
  maximum_candidate_identity_count constant integer := 12;
  maximum_resolution_bytes constant integer := 16384;
  target_company_id uuid;
  target_connection_id uuid;
  target_channel text;
  target_tuple_fingerprint text;
  incoming_alias_fingerprint text;
  target_alias_evidence jsonb := '[]'::jsonb;
  target_conflict_key text;
  resolved_conflict_id uuid;
  canonical_external_id text;
  target_connection public.integration_connections%rowtype;
  target_identity public.gohighlevel_communication_identities%rowtype;
  target_conflict public.gohighlevel_communication_identity_conflicts%rowtype;
  matched_identity_ids uuid[];
  matched_identity_count integer := 0;
  tuple_identity_ids uuid[];
  tuple_identity_count integer := 0;
  all_conflicting_identity_ids uuid[];
  conflicting_identity_ids uuid[];
  target_conflict_reason text;
  alias_count integer;
  incoming_alias record;
  resolution_disposition text;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_resolution) is distinct from 'object'
    or pg_catalog.coalesce((p_resolution ->> 'contractVersion')::integer, 0)
      <> identity_contract_version
    or pg_catalog.octet_length(p_resolution::text) > maximum_resolution_bytes
    or pg_catalog.jsonb_typeof(p_resolution -> 'aliases') is distinct from 'array'
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_resolution)
        as resolution_key(key_name)
      where resolution_key.key_name not in (
        'contractVersion',
        'companyId',
        'integrationConnectionId',
        'channel',
        'aliases',
        'tupleFingerprint'
      )
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication identity resolution.';
  end if;

  begin
    target_company_id := (p_resolution ->> 'companyId')::uuid;
    target_connection_id := (p_resolution ->> 'integrationConnectionId')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication identity scope.';
  end;

  target_channel := p_resolution ->> 'channel';
  target_tuple_fingerprint := pg_catalog.lower(
    pg_catalog.nullif(
      pg_catalog.btrim(p_resolution ->> 'tupleFingerprint'),
      ''
    )
  );
  alias_count := pg_catalog.jsonb_array_length(p_resolution -> 'aliases');

  if target_company_id is null
    or target_connection_id is null
    or target_channel not in ('sms', 'voice', 'email')
    or alias_count > maximum_alias_count
    or (
      target_tuple_fingerprint is not null
      and target_tuple_fingerprint !~ '^[0-9a-f]{64}$'
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication identity resolution.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
      as alias_record(value)
    where pg_catalog.jsonb_typeof(alias_record.value) is distinct from 'object'
  ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication alias.';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
      as alias_record(value)
    where alias_record.value ->> 'type' is null
      or alias_record.value ->> 'type' not in (
        'messageId',
        'emailMessageId',
        'id',
        'altId'
      )
      or pg_catalog.nullif(
        pg_catalog.btrim(alias_record.value ->> 'value'),
        ''
      ) is null
      or pg_catalog.length(
        pg_catalog.btrim(alias_record.value ->> 'value')
      ) > 512
      or exists (
        select 1
        from pg_catalog.jsonb_object_keys(alias_record.value)
          as alias_key(key_name)
        where alias_key.key_name not in ('type', 'value')
      )
  ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication alias.';
  end if;

  if alias_count > 0 then
    select pg_catalog.coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'type', normalized_alias.alias_type,
          'value', normalized_alias.external_id
        ) order by normalized_alias.external_id, normalized_alias.alias_type
      ),
      '[]'::jsonb
    )
    into target_alias_evidence
    from (
      select distinct
        alias_record.value ->> 'type' as alias_type,
        pg_catalog.btrim(alias_record.value ->> 'value') as external_id
      from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
        as alias_record(value)
    ) as normalized_alias;

    incoming_alias_fingerprint := pg_catalog.encode(
      extensions.digest(target_alias_evidence::text, 'sha256'),
      'hex'
    );
  end if;

  select connection.*
  into target_connection
  from public.integration_connections as connection
  where connection.id = target_connection_id
    and connection.company_id = target_company_id
    and connection.provider = 'gohighlevel'
    and connection.external_account_id is not null
  for share;

  if target_connection.id is null then
    raise exception using errcode = '23514', message = 'HighLevel communication identity connection scope mismatch.';
  end if;

  -- The optional tuple lock serializes quarantine decisions for disjoint alias
  -- sets. It is never used to resolve or merge an identity. Alias locks then
  -- follow in deterministic lexical order for one global acquisition order.
  if target_tuple_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'wtos:gohighlevel:communication-tuple:'
          || target_company_id::text
          || ':'
          || target_connection_id::text
          || ':'
          || target_channel
          || ':'
          || target_tuple_fingerprint,
        0
      )
    );
  end if;

  if alias_count = 0 then
    if target_tuple_fingerprint is null then
      return pg_catalog.jsonb_build_object(
        'contractVersion', identity_contract_version,
        'disposition', 'incomplete',
        'companyId', target_company_id,
        'integrationConnectionId', target_connection_id,
        'channel', target_channel,
        'canonicalExternalId', null,
        'reconciliationStatus', 'needs_reconciliation',
        'conflictId', null,
        'conflictCount', 0,
        'conflictReason', 'incomplete_identity'
      );
    end if;

    target_conflict_key := pg_catalog.encode(
      extensions.digest(
        'tuple:' || target_tuple_fingerprint,
        'sha256'
      ),
      'hex'
    );
    all_conflicting_identity_ids := array(
      select communication_identity.id
      from public.gohighlevel_communication_identities
        as communication_identity
      where communication_identity.company_id = target_company_id
        and communication_identity.integration_connection_id
          = target_connection_id
        and communication_identity.channel = target_channel
        and communication_identity.last_observed_tuple_fingerprint
          = target_tuple_fingerprint
      order by communication_identity.id
    );
    conflicting_identity_ids := array(
      select candidate_identity.identity_id
      from pg_catalog.unnest(all_conflicting_identity_ids)
        as candidate_identity(identity_id)
      order by candidate_identity.identity_id
      limit maximum_candidate_identity_count
    );
    target_conflict_reason := case
      when pg_catalog.cardinality(all_conflicting_identity_ids) > 0
        then 'tuple_fingerprint_collision'
      else 'incomplete_identity'
    end;

    if pg_catalog.cardinality(all_conflicting_identity_ids) > 0 then
      update public.gohighlevel_communication_identities
      set
        reconciliation_status = 'needs_reconciliation',
        conflict_count = conflict_count + 1,
        last_conflict_at = pg_catalog.clock_timestamp(),
        last_conflict_reason = 'tuple_fingerprint_collision',
        last_conflict_alias_fingerprint = null
      where company_id = target_company_id
        and integration_connection_id = target_connection_id
        and channel = target_channel
        and id = any(all_conflicting_identity_ids);
    end if;

    insert into public.gohighlevel_communication_identity_conflicts as conflict_record (
      company_id,
      integration_connection_id,
      channel,
      conflict_key,
      conflict_kind,
      tuple_fingerprint,
      alias_fingerprint,
      alias_evidence,
      candidate_identity_ids,
      status,
      occurrence_count,
      first_observed_at,
      last_observed_at,
      resolved_at
    ) values (
      target_company_id,
      target_connection_id,
      target_channel,
      target_conflict_key,
      target_conflict_reason,
      target_tuple_fingerprint,
      null,
      '[]'::jsonb,
      conflicting_identity_ids,
      'open',
      1,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(),
      null
    )
    on conflict (
      company_id,
      integration_connection_id,
      channel,
      conflict_key
    ) do update set
      conflict_kind = excluded.conflict_kind,
      candidate_identity_ids = excluded.candidate_identity_ids,
      status = 'open',
      occurrence_count = conflict_record.occurrence_count + 1,
      last_observed_at = pg_catalog.clock_timestamp(),
      resolved_at = null
    returning * into target_conflict;

    return pg_catalog.jsonb_build_object(
      'contractVersion', identity_contract_version,
      'disposition', case
        when target_conflict.conflict_kind = 'incomplete_identity'
          then 'incomplete'
        else 'conflict'
      end,
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id,
      'channel', target_channel,
      'canonicalExternalId', null,
      'reconciliationStatus', 'needs_reconciliation',
      'conflictId', target_conflict.id,
      'conflictCount', target_conflict.occurrence_count,
      'conflictReason', target_conflict.conflict_kind
    );
  end if;

  for incoming_alias in
    select distinct
      pg_catalog.btrim(alias_record.value ->> 'value') as external_id
    from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
      as alias_record(value)
    order by external_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'wtos:gohighlevel:communication-alias:'
          || target_company_id::text
          || ':'
          || target_connection_id::text
          || ':'
          || target_channel
          || ':'
          || incoming_alias.external_id,
        0
      )
    );
  end loop;

  with incoming_aliases as (
    select distinct
      pg_catalog.btrim(alias_record.value ->> 'value') as external_id
    from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
      as alias_record(value)
  ), matched_identities as (
    select identity_alias.communication_identity_id as identity_id
    from public.gohighlevel_communication_identity_aliases as identity_alias
    inner join incoming_aliases as incoming
      on incoming.external_id = identity_alias.external_id
    where identity_alias.company_id = target_company_id
      and identity_alias.integration_connection_id = target_connection_id
      and identity_alias.channel = target_channel
    union
    select communication_identity.id as identity_id
    from public.gohighlevel_communication_identities as communication_identity
    inner join incoming_aliases as incoming
      on incoming.external_id = communication_identity.canonical_external_id
    where communication_identity.company_id = target_company_id
      and communication_identity.integration_connection_id = target_connection_id
      and communication_identity.channel = target_channel
  )
  select pg_catalog.array_agg(distinct matched.identity_id)
  into matched_identity_ids
  from matched_identities as matched;

  matched_identity_count := pg_catalog.coalesce(
    pg_catalog.cardinality(matched_identity_ids),
    0
  );

  if target_tuple_fingerprint is not null then
    select pg_catalog.array_agg(communication_identity.id order by communication_identity.id)
    into tuple_identity_ids
    from public.gohighlevel_communication_identities as communication_identity
    where communication_identity.company_id = target_company_id
      and communication_identity.integration_connection_id = target_connection_id
      and communication_identity.channel = target_channel
      and communication_identity.last_observed_tuple_fingerprint
        = target_tuple_fingerprint;
    tuple_identity_count := pg_catalog.coalesce(
      pg_catalog.cardinality(tuple_identity_ids),
      0
    );

    select conflict_record.*
    into target_conflict
    from public.gohighlevel_communication_identity_conflicts as conflict_record
    where conflict_record.company_id = target_company_id
      and conflict_record.integration_connection_id = target_connection_id
      and conflict_record.channel = target_channel
      and conflict_record.tuple_fingerprint = target_tuple_fingerprint
      and conflict_record.status = 'open'
    order by conflict_record.first_observed_at, conflict_record.id
    limit 1
    for update;

    if target_conflict.id is not null then
      if target_conflict.conflict_kind = 'incomplete_identity'
        and matched_identity_count = 0
        and tuple_identity_count = 0
        and pg_catalog.cardinality(
          target_conflict.candidate_identity_ids
        ) = 0 then
        update public.gohighlevel_communication_identity_conflicts as conflict_record
        set
          alias_fingerprint = incoming_alias_fingerprint,
          alias_evidence = target_alias_evidence,
          status = 'resolved',
          occurrence_count = conflict_record.occurrence_count + 1,
          last_observed_at = pg_catalog.clock_timestamp(),
          resolved_at = pg_catalog.clock_timestamp()
        where conflict_record.id = target_conflict.id
          and conflict_record.company_id = target_company_id
          and conflict_record.integration_connection_id = target_connection_id
          and conflict_record.channel = target_channel
          and conflict_record.status = 'open'
        returning * into target_conflict;

        if target_conflict.id is null then
          raise exception using errcode = '40001', message = 'HighLevel communication reconciliation evidence was lost.';
        end if;
        resolved_conflict_id := target_conflict.id;
      else
        all_conflicting_identity_ids := array(
        select candidate_identity.identity_id
        from pg_catalog.unnest(
          pg_catalog.coalesce(
            target_conflict.candidate_identity_ids,
            '{}'::uuid[]
          )
            || pg_catalog.coalesce(matched_identity_ids, '{}'::uuid[])
            || pg_catalog.coalesce(tuple_identity_ids, '{}'::uuid[])
        ) as candidate_identity(identity_id)
        where candidate_identity.identity_id is not null
        group by candidate_identity.identity_id
        order by candidate_identity.identity_id
      );
        conflicting_identity_ids := array(
        select candidate_identity.identity_id
        from pg_catalog.unnest(all_conflicting_identity_ids)
          as candidate_identity(identity_id)
        order by candidate_identity.identity_id
        limit maximum_candidate_identity_count
      );
        target_conflict_reason := case
          when target_conflict.conflict_kind = 'provider_alias_collision'
            then 'provider_alias_collision'
          else 'tuple_fingerprint_collision'
        end;

        if pg_catalog.cardinality(all_conflicting_identity_ids) > 0 then
          update public.gohighlevel_communication_identities
          set
            reconciliation_status = 'needs_reconciliation',
            conflict_count = conflict_count + 1,
            last_conflict_at = pg_catalog.clock_timestamp(),
            last_conflict_reason = target_conflict_reason,
            last_conflict_alias_fingerprint = incoming_alias_fingerprint
          where company_id = target_company_id
            and integration_connection_id = target_connection_id
            and channel = target_channel
            and id = any(all_conflicting_identity_ids);
        end if;

        update public.gohighlevel_communication_identity_conflicts as conflict_record
        set
        alias_fingerprint = incoming_alias_fingerprint,
        alias_evidence = (
          select pg_catalog.coalesce(
            pg_catalog.jsonb_agg(
              evidence_record.evidence
              order by
                evidence_record.evidence ->> 'value',
                evidence_record.evidence ->> 'type'
            ),
            '[]'::jsonb
          )
          from (
            select combined_evidence.evidence
            from pg_catalog.jsonb_array_elements(
              conflict_record.alias_evidence || target_alias_evidence
            ) as combined_evidence(evidence)
            group by combined_evidence.evidence
            order by
              combined_evidence.evidence ->> 'value',
              combined_evidence.evidence ->> 'type'
            limit maximum_alias_count
          ) as evidence_record
        ),
        candidate_identity_ids = conflicting_identity_ids,
        status = 'open',
        occurrence_count = conflict_record.occurrence_count + 1,
        last_observed_at = pg_catalog.clock_timestamp(),
        resolved_at = null
        where conflict_record.id = target_conflict.id
          and conflict_record.company_id = target_company_id
          and conflict_record.integration_connection_id = target_connection_id
          and conflict_record.channel = target_channel
        returning * into target_conflict;

        if target_conflict.id is null then
          raise exception using errcode = '40001', message = 'HighLevel communication conflict evidence was lost.';
        end if;

        return pg_catalog.jsonb_build_object(
          'contractVersion', identity_contract_version,
          'disposition', 'conflict',
          'companyId', target_company_id,
          'integrationConnectionId', target_connection_id,
          'channel', target_channel,
          'canonicalExternalId', null,
          'reconciliationStatus', 'needs_reconciliation',
          'conflictId', target_conflict.id,
          'conflictCount', target_conflict.occurrence_count,
          'conflictReason', target_conflict.conflict_kind
        );
      end if;
    end if;
  end if;

  if matched_identity_count > 1
    or (matched_identity_count = 0 and tuple_identity_count > 0)
    or (
      matched_identity_count = 1
      and exists (
        select 1
        from pg_catalog.unnest(
          pg_catalog.coalesce(tuple_identity_ids, '{}'::uuid[])
        ) as tuple_identity(identity_id)
        where tuple_identity.identity_id <> matched_identity_ids[1]
      )
    ) then
    target_conflict_reason := case
      when matched_identity_count > 1 then 'provider_alias_collision'
      else 'tuple_fingerprint_collision'
    end;
    all_conflicting_identity_ids := array(
      select conflict_identity.identity_id
      from pg_catalog.unnest(
        pg_catalog.coalesce(matched_identity_ids, '{}'::uuid[])
          || pg_catalog.coalesce(tuple_identity_ids, '{}'::uuid[])
      ) as conflict_identity(identity_id)
      where conflict_identity.identity_id is not null
      group by conflict_identity.identity_id
      order by conflict_identity.identity_id
    );
    conflicting_identity_ids := array(
      select conflict_identity.identity_id
      from pg_catalog.unnest(all_conflicting_identity_ids)
        as conflict_identity(identity_id)
      order by conflict_identity.identity_id
      limit maximum_candidate_identity_count
    );

    update public.gohighlevel_communication_identities
    set
      reconciliation_status = 'needs_reconciliation',
      conflict_count = conflict_count + 1,
      last_conflict_at = pg_catalog.clock_timestamp(),
      last_conflict_reason = target_conflict_reason,
      last_conflict_alias_fingerprint = incoming_alias_fingerprint
    where company_id = target_company_id
      and integration_connection_id = target_connection_id
      and channel = target_channel
      and id = any(all_conflicting_identity_ids);

    target_conflict_key := pg_catalog.encode(
      extensions.digest(
        case
          when target_tuple_fingerprint is not null
            then 'tuple:' || target_tuple_fingerprint
          else 'aliases:' || incoming_alias_fingerprint
        end,
        'sha256'
      ),
      'hex'
    );
    insert into public.gohighlevel_communication_identity_conflicts as conflict_record (
      company_id,
      integration_connection_id,
      channel,
      conflict_key,
      conflict_kind,
      tuple_fingerprint,
      alias_fingerprint,
      alias_evidence,
      candidate_identity_ids,
      status,
      occurrence_count,
      first_observed_at,
      last_observed_at,
      resolved_at
    ) values (
      target_company_id,
      target_connection_id,
      target_channel,
      target_conflict_key,
      target_conflict_reason,
      target_tuple_fingerprint,
      incoming_alias_fingerprint,
      target_alias_evidence,
      conflicting_identity_ids,
      'open',
      1,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp(),
      null
    )
    on conflict (
      company_id,
      integration_connection_id,
      channel,
      conflict_key
    ) do update set
      conflict_kind = excluded.conflict_kind,
      tuple_fingerprint = excluded.tuple_fingerprint,
      alias_fingerprint = excluded.alias_fingerprint,
      alias_evidence = excluded.alias_evidence,
      candidate_identity_ids = excluded.candidate_identity_ids,
      status = 'open',
      occurrence_count = conflict_record.occurrence_count + 1,
      last_observed_at = pg_catalog.clock_timestamp(),
      resolved_at = null
    returning * into target_conflict;

    if target_conflict.id is null then
      raise exception using errcode = '40001', message = 'HighLevel communication conflict evidence was lost.';
    end if;

    return pg_catalog.jsonb_build_object(
      'contractVersion', identity_contract_version,
      'disposition', 'conflict',
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id,
      'channel', target_channel,
      'canonicalExternalId', null,
      'reconciliationStatus', 'needs_reconciliation',
      'conflictId', target_conflict.id,
      'conflictCount', target_conflict.occurrence_count,
      'conflictReason', target_conflict.conflict_kind
    );
  end if;

  if matched_identity_count = 1 then
    select communication_identity.*
    into target_identity
    from public.gohighlevel_communication_identities as communication_identity
    where communication_identity.id = matched_identity_ids[1]
      and communication_identity.company_id = target_company_id
      and communication_identity.integration_connection_id = target_connection_id
      and communication_identity.channel = target_channel
    for update;

    if target_identity.id is null then
      raise exception using errcode = '40001', message = 'HighLevel communication identity resolution was lost.';
    end if;
    if target_identity.reconciliation_status = 'needs_reconciliation' then
      update public.gohighlevel_communication_identities
      set
        conflict_count = conflict_count + 1,
        last_conflict_at = pg_catalog.clock_timestamp(),
        last_conflict_reason = pg_catalog.coalesce(
          last_conflict_reason,
          'provider_alias_collision'
        ),
        last_conflict_alias_fingerprint = incoming_alias_fingerprint
      where id = target_identity.id
        and company_id = target_company_id
        and integration_connection_id = target_connection_id
        and channel = target_channel
      returning * into target_identity;

      target_conflict_reason := pg_catalog.coalesce(
        target_identity.last_conflict_reason,
        'provider_alias_collision'
      );
      all_conflicting_identity_ids := array[target_identity.id];
      conflicting_identity_ids := all_conflicting_identity_ids;
      target_conflict_key := pg_catalog.encode(
        extensions.digest(
          case
            when target_tuple_fingerprint is not null
              then 'tuple:' || target_tuple_fingerprint
            else 'aliases:' || incoming_alias_fingerprint
          end,
          'sha256'
        ),
        'hex'
      );
      insert into public.gohighlevel_communication_identity_conflicts as conflict_record (
        company_id,
        integration_connection_id,
        channel,
        conflict_key,
        conflict_kind,
        tuple_fingerprint,
        alias_fingerprint,
        alias_evidence,
        candidate_identity_ids,
        status,
        occurrence_count,
        first_observed_at,
        last_observed_at,
        resolved_at
      ) values (
        target_company_id,
        target_connection_id,
        target_channel,
        target_conflict_key,
        target_conflict_reason,
        target_tuple_fingerprint,
        incoming_alias_fingerprint,
        target_alias_evidence,
        conflicting_identity_ids,
        'open',
        1,
        pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp(),
        null
      )
      on conflict (
        company_id,
        integration_connection_id,
        channel,
        conflict_key
      ) do update set
        conflict_kind = excluded.conflict_kind,
        tuple_fingerprint = excluded.tuple_fingerprint,
        alias_fingerprint = excluded.alias_fingerprint,
        alias_evidence = excluded.alias_evidence,
        candidate_identity_ids = excluded.candidate_identity_ids,
        status = 'open',
        occurrence_count = conflict_record.occurrence_count + 1,
        last_observed_at = pg_catalog.clock_timestamp(),
        resolved_at = null
      returning * into target_conflict;

      if target_conflict.id is null then
        raise exception using errcode = '40001', message = 'HighLevel communication conflict evidence was lost.';
      end if;

      return pg_catalog.jsonb_build_object(
        'contractVersion', identity_contract_version,
        'disposition', 'conflict',
        'companyId', target_company_id,
        'integrationConnectionId', target_connection_id,
        'channel', target_channel,
        'canonicalExternalId', null,
        'reconciliationStatus', target_identity.reconciliation_status,
        'conflictId', target_conflict.id,
        'conflictCount', target_conflict.occurrence_count,
        'conflictReason', target_conflict.conflict_kind
      );
    end if;
    resolution_disposition := 'resolved';
  else
    select normalized_alias.external_id
    into canonical_external_id
    from (
      select distinct on (pg_catalog.btrim(alias_record.value ->> 'value'))
        pg_catalog.btrim(alias_record.value ->> 'value') as external_id,
        case alias_record.value ->> 'type'
          when 'messageId' then 1
          when 'emailMessageId' then 2
          when 'id' then 3
          else 4
        end as alias_priority,
        alias_record.ordinality
      from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
        with ordinality as alias_record(value, ordinality)
      order by
        pg_catalog.btrim(alias_record.value ->> 'value'),
        alias_priority,
        alias_record.ordinality
    ) as normalized_alias
    order by normalized_alias.alias_priority, normalized_alias.ordinality
    limit 1;

    insert into public.gohighlevel_communication_identities (
      company_id,
      integration_connection_id,
      channel,
      canonical_external_id,
      last_observed_tuple_fingerprint
    ) values (
      target_company_id,
      target_connection_id,
      target_channel,
      canonical_external_id,
      target_tuple_fingerprint
    )
    returning * into target_identity;
    resolution_disposition := 'created';
  end if;

  insert into public.gohighlevel_communication_identity_aliases (
    company_id,
    integration_connection_id,
    channel,
    communication_identity_id,
    alias_type,
    external_id
  )
  select
    target_company_id,
    target_connection_id,
    target_channel,
    target_identity.id,
    normalized_alias.alias_type,
    normalized_alias.external_id
  from (
    select distinct on (pg_catalog.btrim(alias_record.value ->> 'value'))
      alias_record.value ->> 'type' as alias_type,
      pg_catalog.btrim(alias_record.value ->> 'value') as external_id,
      case alias_record.value ->> 'type'
        when 'messageId' then 1
        when 'emailMessageId' then 2
        when 'id' then 3
        else 4
      end as alias_priority,
      alias_record.ordinality
    from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
      with ordinality as alias_record(value, ordinality)
    order by
      pg_catalog.btrim(alias_record.value ->> 'value'),
      alias_priority,
      alias_record.ordinality
  ) as normalized_alias
  on conflict (
    company_id,
    integration_connection_id,
    channel,
    external_id
  ) do nothing;

  if exists (
    with incoming_aliases as (
      select distinct
        pg_catalog.btrim(alias_record.value ->> 'value') as external_id
      from pg_catalog.jsonb_array_elements(p_resolution -> 'aliases')
        as alias_record(value)
    )
    select 1
    from incoming_aliases as incoming
    left join public.gohighlevel_communication_identity_aliases as identity_alias
      on identity_alias.company_id = target_company_id
      and identity_alias.integration_connection_id = target_connection_id
      and identity_alias.channel = target_channel
      and identity_alias.external_id = incoming.external_id
    where identity_alias.communication_identity_id
      is distinct from target_identity.id
  ) then
    raise exception using errcode = '40001', message = 'HighLevel communication alias collision was not committed.';
  end if;

  if target_tuple_fingerprint is not null then
    update public.gohighlevel_communication_identities
    set last_observed_tuple_fingerprint = target_tuple_fingerprint
    where id = target_identity.id
      and company_id = target_company_id
      and integration_connection_id = target_connection_id
      and channel = target_channel;
    if not found then
      raise exception using errcode = '40001', message = 'HighLevel communication identity diagnostics were lost.';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', identity_contract_version,
    'disposition', resolution_disposition,
    'companyId', target_company_id,
    'integrationConnectionId', target_connection_id,
    'channel', target_channel,
    'canonicalExternalId', target_identity.canonical_external_id,
    'reconciliationStatus', target_identity.reconciliation_status,
    'conflictId', null,
    'resolvedConflictId', resolved_conflict_id,
    'conflictCount', target_identity.conflict_count,
    'conflictReason', target_identity.last_conflict_reason
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid HighLevel communication identity resolution.';
end;
$$;

create or replace function public.wtos_upsert_gohighlevel_communication_v1(
  p_communication jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  communication_contract_version constant integer := 1;
  maximum_communication_bytes constant integer := 65536;
  maximum_summary_bytes constant integer := 16384;
  target_company_id uuid;
  target_connection_id uuid;
  target_customer_id uuid;
  target_lead_id uuid;
  target_job_id uuid;
  target_provider_event_id text;
  target_parent_id text;
  target_channel text;
  target_direction text;
  target_event_type text;
  target_status text;
  target_call_status text;
  target_from_phone text;
  target_to_phone text;
  target_occurred_at timestamptz;
  target_provider_updated_at timestamptz;
  target_provider_version_source text;
  target_provider_status_rank integer;
  target_event_content_sha256 text;
  target_call_content_sha256 text;
  target_started_at timestamptz;
  target_answered_at timestamptz;
  target_ended_at timestamptz;
  target_duration_seconds integer;
  target_recording_id text;
  target_recording_status text;
  target_transcript_status text;
  target_payload_summary jsonb;
  association_authoritative boolean;
  target_routing_status text;
  target_correlation_id text;
  target_request_fingerprint text;
  target_connection public.integration_connections%rowtype;
  target_identity public.gohighlevel_communication_identities%rowtype;
  existing_event public.communication_provider_events%rowtype;
  existing_call public.call_records%rowtype;
  saved_event public.communication_provider_events%rowtype;
  saved_call public.call_records%rowtype;
  event_exists boolean := false;
  call_exists boolean := false;
  association_changed boolean := false;
  event_provider_changed boolean := false;
  call_provider_changed boolean := false;
  event_can_advance boolean := false;
  call_can_advance boolean := false;
  greatest_existing_version timestamptz;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_communication) is distinct from 'object'
    or pg_catalog.coalesce(
      (p_communication ->> 'contractVersion')::integer,
      0
    ) <> communication_contract_version
    or pg_catalog.octet_length(p_communication::text)
      > maximum_communication_bytes
    or pg_catalog.jsonb_typeof(p_communication -> 'payloadSummary')
      is distinct from 'object'
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_communication)
        as communication_key(key_name)
      where communication_key.key_name not in (
        'contractVersion',
        'companyId',
        'integrationConnectionId',
        'canonicalExternalId',
        'providerParentId',
        'channel',
        'direction',
        'status',
        'fromPhone',
        'toPhone',
        'occurredAt',
        'providerUpdatedAt',
        'providerVersionSource',
        'customerId',
        'leadId',
        'jobId',
        'startedAt',
        'answeredAt',
        'endedAt',
        'durationSeconds',
        'recordingId',
        'recordingStatus',
        'transcriptStatus',
        'payloadSummary'
      )
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication.';
  end if;

  begin
    target_company_id := (p_communication ->> 'companyId')::uuid;
    target_connection_id := (p_communication ->> 'integrationConnectionId')::uuid;
    target_customer_id := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'customerId'),
      ''
    )::uuid;
    target_lead_id := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'leadId'),
      ''
    )::uuid;
    target_job_id := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'jobId'),
      ''
    )::uuid;
    target_occurred_at := (p_communication ->> 'occurredAt')::timestamptz;
    target_provider_updated_at := (
      p_communication ->> 'providerUpdatedAt'
    )::timestamptz;
    target_started_at := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'startedAt'),
      ''
    )::timestamptz;
    target_answered_at := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'answeredAt'),
      ''
    )::timestamptz;
    target_ended_at := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'endedAt'),
      ''
    )::timestamptz;
    target_duration_seconds := pg_catalog.nullif(
      pg_catalog.btrim(p_communication ->> 'durationSeconds'),
      ''
    )::integer;
  exception when invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow
    or invalid_datetime_format then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication identity or version.';
  end;

  target_provider_event_id := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'canonicalExternalId'),
    ''
  );
  target_parent_id := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'providerParentId'),
    ''
  );
  target_channel := p_communication ->> 'channel';
  target_direction := p_communication ->> 'direction';
  target_status := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'status'),
    ''
  );
  target_provider_version_source := p_communication ->> 'providerVersionSource';
  target_from_phone := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'fromPhone'),
    ''
  );
  target_to_phone := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'toPhone'),
    ''
  );
  target_recording_id := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'recordingId'),
    ''
  );
  target_recording_status := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'recordingStatus'),
    ''
  );
  target_transcript_status := pg_catalog.nullif(
    pg_catalog.btrim(p_communication ->> 'transcriptStatus'),
    ''
  );
  target_payload_summary := p_communication -> 'payloadSummary';

  if target_company_id is null
    or target_connection_id is null
    or target_provider_event_id is null
    or pg_catalog.length(target_provider_event_id) > 512
    or pg_catalog.length(pg_catalog.coalesce(target_parent_id, '')) > 512
    or target_channel not in ('sms', 'voice')
    or target_direction not in ('inbound', 'outbound')
    or target_status is null
    or pg_catalog.length(target_status) > 80
    or target_occurred_at is null
    or target_provider_updated_at is null
    or target_provider_version_source not in (
      'updated_at',
      'created_at_fallback'
    )
    or pg_catalog.length(pg_catalog.coalesce(target_from_phone, '')) > 64
    or pg_catalog.length(pg_catalog.coalesce(target_to_phone, '')) > 64
    or pg_catalog.length(pg_catalog.coalesce(target_recording_id, '')) > 512
    or target_duration_seconds < 0
    or target_duration_seconds > 604800
    or pg_catalog.octet_length(target_payload_summary::text)
      > maximum_summary_bytes
    or exists (
      select 1
      from pg_catalog.jsonb_object_keys(target_payload_summary)
        as summary_key(key_name)
      where pg_catalog.lower(summary_key.key_name) in (
        'accesstoken',
        'access_token',
        'refreshtoken',
        'refresh_token',
        'authorization',
        'rawpayload',
        'raw_payload'
      )
    )
    or (
      target_payload_summary ? 'associationAuthoritative'
      and pg_catalog.jsonb_typeof(
        target_payload_summary -> 'associationAuthoritative'
      ) is distinct from 'boolean'
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel communication.';
  end if;

  if target_channel = 'voice'
    and target_status not in (
      'incoming',
      'ringing',
      'in_progress',
      'answered',
      'connected',
      'completed',
      'missed',
      'busy',
      'failed',
      'voicemail'
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel call status.';
  end if;
  target_call_status := case
    when target_channel = 'voice' and target_status = 'connected'
      then 'answered'
    else target_status
  end;

  target_provider_status_rank := case pg_catalog.lower(target_status)
    when 'incoming' then 0
    when 'queued' then 10
    when 'pending' then 10
    when 'scheduled' then 10
    when 'ringing' then 10
    when 'in_progress' then 20
    when 'sent' then 20
    when 'answered' then 30
    when 'connected' then 30
    when 'received' then 30
    when 'delivered' then 40
    when 'missed' then 40
    when 'read' then 50
    when 'opened' then 50
    when 'clicked' then 50
    when 'opt_out' then 50
    when 'completed' then 50
    when 'voicemail' then 50
    when 'busy' then 50
    when 'failed' then 50
    when 'undelivered' then 50
    when 'canceled' then 50
    when 'cancelled' then 50
    else null
  end;
  if target_provider_version_source = 'created_at_fallback'
    and target_provider_status_rank is null then
    raise exception using errcode = '22023', message = 'HighLevel creation-time fallback status is not monotonic.';
  end if;
  if target_channel = 'voice'
    and target_recording_status is not null
    and target_recording_status not in (
      'not_requested',
      'in_progress',
      'completed',
      'failed'
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel recording status.';
  end if;
  if target_channel = 'voice'
    and target_transcript_status is not null
    and target_transcript_status not in (
      'not_requested',
      'queued',
      'completed',
      'failed'
    ) then
    raise exception using errcode = '22023', message = 'Invalid HighLevel transcript status.';
  end if;

  if target_customer_id is not null and target_lead_id is not null then
    raise exception using errcode = '23514', message = 'HighLevel communication association is ambiguous.';
  end if;
  if target_customer_id is not null
    and not exists (
      select 1
      from public.customers as customer
      where customer.id = target_customer_id
        and customer.company_id = target_company_id
    ) then
    raise exception using errcode = '23514', message = 'HighLevel communication customer scope mismatch.';
  end if;
  if target_lead_id is not null
    and not exists (
      select 1
      from public.leads as lead
      where lead.id = target_lead_id
        and lead.company_id = target_company_id
    ) then
    raise exception using errcode = '23514', message = 'HighLevel communication lead scope mismatch.';
  end if;
  if target_job_id is not null
    and not exists (
      select 1
      from public.jobs as job
      where job.id = target_job_id
        and job.company_id = target_company_id
    ) then
    raise exception using errcode = '23514', message = 'HighLevel communication job scope mismatch.';
  end if;

  association_authoritative := pg_catalog.coalesce(
    (target_payload_summary ->> 'associationAuthoritative')::boolean,
    false
  );
  target_event_type := case
    when target_channel = 'sms' and target_direction = 'inbound'
      then 'sms_inbound'
    when target_channel = 'sms' then 'sms_status'
    when target_direction = 'inbound' then 'voice_inbound'
    else 'voice_status'
  end;
  target_started_at := pg_catalog.coalesce(
    target_started_at,
    target_occurred_at
  );
  target_event_content_sha256 := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'providerParentId', target_parent_id,
        'channel', target_channel,
        'direction', target_direction,
        'status', target_status,
        'fromPhone', target_from_phone,
        'toPhone', target_to_phone,
        'occurredAt', target_occurred_at,
        'payloadSummary', target_payload_summary
          - 'associationAuthoritative'
          - 'matchStatus'
          - 'matchCandidateCount'
      )::text,
      'sha256'
    ),
    'hex'
  );
  if target_channel = 'voice' then
    target_call_content_sha256 := pg_catalog.encode(
      extensions.digest(
        pg_catalog.jsonb_build_object(
          'providerParentId', target_parent_id,
          'direction', target_direction,
          'status', target_status,
          'fromPhone', target_from_phone,
          'toPhone', target_to_phone,
          'startedAt', target_started_at,
          'answeredAt', target_answered_at,
          'endedAt', target_ended_at,
          'durationSeconds', target_duration_seconds,
          'recordingId', target_recording_id,
          'recordingStatus', target_recording_status,
          'transcriptStatus', target_transcript_status,
          'payloadSummary', target_payload_summary
            - 'associationAuthoritative'
            - 'matchStatus'
            - 'matchCandidateCount'
        )::text,
        'sha256'
      ),
      'hex'
    );
  end if;

  select connection.*
  into target_connection
  from public.integration_connections as connection
  where connection.id = target_connection_id
    and connection.company_id = target_company_id
    and connection.provider = 'gohighlevel'
    and connection.external_account_id is not null
  for share;

  if target_connection.id is null then
    raise exception using errcode = '23514', message = 'HighLevel communication connection scope mismatch.';
  end if;

  select communication_identity.*
  into target_identity
  from public.gohighlevel_communication_identities as communication_identity
  where communication_identity.company_id = target_company_id
    and communication_identity.integration_connection_id = target_connection_id
    and communication_identity.channel = target_channel
    and communication_identity.canonical_external_id = target_provider_event_id
    and communication_identity.reconciliation_status = 'resolved'
    and not exists (
      select 1
      from public.gohighlevel_communication_identity_conflicts as conflict_record
      where conflict_record.company_id = target_company_id
        and conflict_record.integration_connection_id = target_connection_id
        and conflict_record.channel = target_channel
        and conflict_record.status = 'open'
        and communication_identity.id
          = any(conflict_record.candidate_identity_ids)
    )
  for share;

  if target_identity.id is null then
    raise exception using errcode = '23514', message = 'HighLevel communication identity must be resolved first.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:gohighlevel:communication:'
        || target_company_id::text
        || ':'
        || target_connection_id::text
        || ':'
        || target_channel
        || ':'
        || target_provider_event_id,
      0
    )
  );

  if exists (
    select 1
    from public.communication_provider_events as provider_event
    where provider_event.company_id = target_company_id
      and provider_event.integration_connection_id = target_connection_id
      and provider_event.provider = 'gohighlevel'
      and provider_event.provider_event_sid = target_provider_event_id
      and (
        provider_event.channel is distinct from target_channel
        or provider_event.direction is distinct from target_direction
      )
  ) then
    raise exception using errcode = '23514', message = 'HighLevel communication provider identity conflict.';
  end if;

  select provider_event.*
  into existing_event
  from public.communication_provider_events as provider_event
  where provider_event.company_id = target_company_id
    and provider_event.integration_connection_id = target_connection_id
    and provider_event.provider = 'gohighlevel'
    and provider_event.event_type = target_event_type
    and provider_event.provider_event_sid = target_provider_event_id
  for update;
  event_exists := found;

  if target_channel = 'voice' then
    select call.*
    into existing_call
    from public.call_records as call
    where call.company_id = target_company_id
      and call.integration_connection_id = target_connection_id
      and call.provider = 'gohighlevel'
      and call.provider_call_sid = target_provider_event_id
    for update;
    call_exists := found;
  end if;

  -- GHL has no authoritative WTOS job association. Preserve the association
  -- already held by the locked provider rows when the caller supplies no job.
  -- Divergent siblings require review; never choose one and overwrite the other.
  if event_exists
    and call_exists
    and existing_event.job_id is not null
    and existing_call.job_id is not null
    and existing_event.job_id is distinct from existing_call.job_id then
    raise exception using errcode = '23514', message = 'HighLevel communication job association state conflicts.';
  end if;
  if target_job_id is null then
    if event_exists and existing_event.job_id is not null then
      target_job_id := existing_event.job_id;
    elsif call_exists and existing_call.job_id is not null then
      target_job_id := existing_call.job_id;
    end if;
    if target_job_id is not null
      and not exists (
        select 1
        from public.jobs as job
        where job.id = target_job_id
          and job.company_id = target_company_id
      ) then
      raise exception using errcode = '23514', message = 'HighLevel communication job scope mismatch.';
    end if;
  end if;

  if event_exists
    and call_exists
    and not association_authoritative
    and (
      existing_event.customer_id is distinct from existing_call.customer_id
      or existing_event.lead_id is distinct from existing_call.lead_id
      or existing_event.job_id is distinct from existing_call.job_id
    ) then
    raise exception using errcode = '23514', message = 'HighLevel communication association state conflicts.';
  end if;

  if not association_authoritative then
    if event_exists then
      target_customer_id := existing_event.customer_id;
      target_lead_id := existing_event.lead_id;
      target_job_id := existing_event.job_id;
    elsif call_exists then
      target_customer_id := existing_call.customer_id;
      target_lead_id := existing_call.lead_id;
      target_job_id := existing_call.job_id;
    end if;
  end if;
  target_routing_status := case
    when target_customer_id is not null or target_lead_id is not null
      then 'matched'
    else 'needs_review'
  end;

  if event_exists then
    greatest_existing_version := existing_event.provider_updated_at;
  end if;
  if call_exists and (
    greatest_existing_version is null
    or existing_call.provider_updated_at > greatest_existing_version
  ) then
    greatest_existing_version := existing_call.provider_updated_at;
  end if;

  -- A strictly newer sibling makes the whole provider observation stale. Only
  -- exact local association repair is allowed; provider content is untouched,
  -- so a delayed missed state cannot fire the missed-call trigger.
  if greatest_existing_version is not null
    and greatest_existing_version > target_provider_updated_at then
    if target_channel = 'voice'
      and (not event_exists or not call_exists) then
      return pg_catalog.jsonb_build_object(
        'contractVersion', communication_contract_version,
        'disposition', 'conflict',
        'companyId', target_company_id,
        'integrationConnectionId', target_connection_id,
        'canonicalExternalId', target_provider_event_id,
        'communicationEventId', case when event_exists then existing_event.id else null end,
        'callRecordId', case when call_exists then existing_call.id else null end,
        'providerUpdatedAt', greatest_existing_version,
        'providerRecordsChanged', false,
        'associationChanged', false
      );
    end if;

    if association_authoritative then
      if event_exists and (
        existing_event.customer_id is distinct from target_customer_id
        or existing_event.lead_id is distinct from target_lead_id
        or existing_event.job_id is distinct from target_job_id
        or existing_event.routing_status is distinct from target_routing_status
      ) then
        update public.communication_provider_events
        set
          customer_id = target_customer_id,
          lead_id = target_lead_id,
          job_id = target_job_id,
          routing_status = target_routing_status
        where id = existing_event.id
          and company_id = target_company_id
          and integration_connection_id = target_connection_id
          and provider = 'gohighlevel';
        if not found then
          raise exception using errcode = '40001', message = 'HighLevel communication association update was lost.';
        end if;
        association_changed := true;
      end if;

      if call_exists and (
        existing_call.customer_id is distinct from target_customer_id
        or existing_call.lead_id is distinct from target_lead_id
        or existing_call.job_id is distinct from target_job_id
        or existing_call.routing_status is distinct from target_routing_status
      ) then
        update public.call_records
        set
          customer_id = target_customer_id,
          lead_id = target_lead_id,
          job_id = target_job_id,
          routing_status = target_routing_status
        where id = existing_call.id
          and company_id = target_company_id
          and integration_connection_id = target_connection_id
          and provider = 'gohighlevel';
        if not found then
          raise exception using errcode = '40001', message = 'HighLevel call association update was lost.';
        end if;
        association_changed := true;
      end if;
    end if;

    return pg_catalog.jsonb_build_object(
      'contractVersion', communication_contract_version,
      'disposition', case
        when association_changed then 'association_updated'
        else 'stale'
      end,
      'companyId', target_company_id,
      'integrationConnectionId', target_connection_id,
      'canonicalExternalId', target_provider_event_id,
      'communicationEventId', case when event_exists then existing_event.id else null end,
      'callRecordId', case when call_exists then existing_call.id else null end,
      'providerUpdatedAt', greatest_existing_version,
      'providerRecordsChanged', false,
      'associationChanged', association_changed
    );
  end if;

  event_can_advance := not event_exists
    or existing_event.provider_updated_at < target_provider_updated_at
    or (
      existing_event.provider_version_source = 'legacy_backfill'
      and existing_event.provider_updated_at <= target_provider_updated_at
    );
  if event_exists
    and existing_event.provider_updated_at = target_provider_updated_at then
    event_can_advance := (
      existing_event.provider_version_source = 'legacy_backfill'
    ) or (
      existing_event.provider_version_source = 'created_at_fallback'
      and target_provider_version_source = 'updated_at'
    ) or (
      existing_event.provider_version_source = 'created_at_fallback'
      and target_provider_version_source = 'created_at_fallback'
      and existing_event.provider_status_rank is not null
      and target_provider_status_rank > existing_event.provider_status_rank
    );

    if existing_event.provider_content_sha256
        is distinct from target_event_content_sha256
      and not event_can_advance then
      return pg_catalog.jsonb_build_object(
        'contractVersion', communication_contract_version,
        'disposition', 'conflict',
        'companyId', target_company_id,
        'integrationConnectionId', target_connection_id,
        'canonicalExternalId', target_provider_event_id,
        'communicationEventId', existing_event.id,
        'callRecordId', case when call_exists then existing_call.id else null end,
        'providerUpdatedAt', existing_event.provider_updated_at,
        'providerRecordsChanged', false,
        'associationChanged', false
      );
    end if;

    if existing_event.provider_content_sha256 = target_event_content_sha256
      and existing_event.provider_version_source <> 'legacy_backfill'
      and not (
        existing_event.provider_version_source = 'created_at_fallback'
        and target_provider_version_source = 'updated_at'
      ) then
      event_can_advance := false;
    end if;
  end if;

  call_can_advance := target_channel = 'voice' and (
    not call_exists
    or existing_call.provider_updated_at < target_provider_updated_at
    or (
      existing_call.provider_version_source = 'legacy_backfill'
      and existing_call.provider_updated_at <= target_provider_updated_at
    )
  );
  if call_exists
    and existing_call.provider_updated_at = target_provider_updated_at then
    call_can_advance := (
      existing_call.provider_version_source = 'legacy_backfill'
    ) or (
      existing_call.provider_version_source = 'created_at_fallback'
      and target_provider_version_source = 'updated_at'
    ) or (
      existing_call.provider_version_source = 'created_at_fallback'
      and target_provider_version_source = 'created_at_fallback'
      and existing_call.provider_status_rank is not null
      and target_provider_status_rank > existing_call.provider_status_rank
    );

    if existing_call.provider_content_sha256
        is distinct from target_call_content_sha256
      and not call_can_advance then
      return pg_catalog.jsonb_build_object(
        'contractVersion', communication_contract_version,
        'disposition', 'conflict',
        'companyId', target_company_id,
        'integrationConnectionId', target_connection_id,
        'canonicalExternalId', target_provider_event_id,
        'communicationEventId', case when event_exists then existing_event.id else null end,
        'callRecordId', existing_call.id,
        'providerUpdatedAt', existing_call.provider_updated_at,
        'providerRecordsChanged', false,
        'associationChanged', false
      );
    end if;

    if existing_call.provider_content_sha256 = target_call_content_sha256
      and existing_call.provider_version_source <> 'legacy_backfill'
      and not (
        existing_call.provider_version_source = 'created_at_fallback'
        and target_provider_version_source = 'updated_at'
      ) then
      call_can_advance := false;
    end if;
  end if;

  target_correlation_id := 'gohighlevel:' || pg_catalog.encode(
    extensions.digest(
      target_company_id::text
        || ':'
        || target_connection_id::text
        || ':'
        || target_event_type
        || ':'
        || target_provider_event_id,
      'sha256'
    ),
    'hex'
  );
  target_request_fingerprint := target_event_content_sha256;

  if event_exists and event_can_advance then
    update public.communication_provider_events
    set
      customer_id = target_customer_id,
      lead_id = target_lead_id,
      job_id = target_job_id,
      provider_account_sid = target_connection.external_account_id,
      provider_parent_sid = target_parent_id,
      channel = target_channel,
      direction = target_direction,
      status = target_status,
      from_phone = target_from_phone,
      to_phone = target_to_phone,
      business_phone = case
        when target_direction = 'inbound' then target_to_phone
        else target_from_phone
      end,
      customer_phone = case
        when target_direction = 'inbound' then target_from_phone
        else target_to_phone
      end,
      routing_status = target_routing_status,
      correlation_id = target_correlation_id,
      request_fingerprint = target_request_fingerprint,
      payload_summary = target_payload_summary,
      response_summary = pg_catalog.jsonb_build_object(
        'persistedBy',
        'gohighlevel_atomic_v1'
      ),
      error_code = null,
      error_message = null,
      occurred_at = target_occurred_at,
      provider_updated_at = target_provider_updated_at,
      provider_version_source = target_provider_version_source,
      provider_status_rank = target_provider_status_rank,
      provider_content_sha256 = target_event_content_sha256
    where id = existing_event.id
      and company_id = target_company_id
      and integration_connection_id = target_connection_id
      and provider = 'gohighlevel'
      and event_type = target_event_type
      and provider_event_sid = target_provider_event_id
      and provider_updated_at <= target_provider_updated_at
    returning * into saved_event;
    event_provider_changed := true;
  elsif event_exists then
    if association_authoritative and (
      existing_event.customer_id is distinct from target_customer_id
      or existing_event.lead_id is distinct from target_lead_id
      or existing_event.job_id is distinct from target_job_id
      or existing_event.routing_status is distinct from target_routing_status
    ) then
      update public.communication_provider_events
      set
        customer_id = target_customer_id,
        lead_id = target_lead_id,
        job_id = target_job_id,
        routing_status = target_routing_status
      where id = existing_event.id
        and company_id = target_company_id
        and integration_connection_id = target_connection_id
        and provider = 'gohighlevel';
      if not found then
        raise exception using errcode = '40001', message = 'HighLevel communication association update was lost.';
      end if;
      association_changed := true;
    end if;
    saved_event := existing_event;
  else
    insert into public.communication_provider_events (
      company_id,
      integration_connection_id,
      customer_id,
      lead_id,
      job_id,
      provider,
      provider_account_sid,
      provider_event_sid,
      provider_parent_sid,
      event_type,
      channel,
      direction,
      status,
      from_phone,
      to_phone,
      business_phone,
      customer_phone,
      routing_status,
      correlation_id,
      request_fingerprint,
      payload_summary,
      response_summary,
      error_code,
      error_message,
      occurred_at,
      provider_updated_at,
      provider_version_source,
      provider_status_rank,
      provider_content_sha256
    ) values (
      target_company_id,
      target_connection_id,
      target_customer_id,
      target_lead_id,
      target_job_id,
      'gohighlevel',
      target_connection.external_account_id,
      target_provider_event_id,
      target_parent_id,
      target_event_type,
      target_channel,
      target_direction,
      target_status,
      target_from_phone,
      target_to_phone,
      case when target_direction = 'inbound' then target_to_phone else target_from_phone end,
      case when target_direction = 'inbound' then target_from_phone else target_to_phone end,
      target_routing_status,
      target_correlation_id,
      target_request_fingerprint,
      target_payload_summary,
      pg_catalog.jsonb_build_object('persistedBy', 'gohighlevel_atomic_v1'),
      null,
      null,
      target_occurred_at,
      target_provider_updated_at,
      target_provider_version_source,
      target_provider_status_rank,
      target_event_content_sha256
    )
    returning * into saved_event;
    event_provider_changed := true;
  end if;

  if saved_event.id is null then
    raise exception using errcode = '40001', message = 'HighLevel communication version update was lost.';
  end if;

  if target_channel = 'voice' then
    if call_exists and call_can_advance then
      update public.call_records
      set
        customer_id = target_customer_id,
        lead_id = target_lead_id,
        job_id = target_job_id,
        provider_account_sid = target_connection.external_account_id,
        provider_parent_call_sid = target_parent_id,
        direction = target_direction,
        call_status = target_call_status,
        from_phone = target_from_phone,
        to_phone = target_to_phone,
        business_phone = case
          when target_direction = 'inbound' then target_to_phone
          else target_from_phone
        end,
        customer_phone = case
          when target_direction = 'inbound' then target_from_phone
          else target_to_phone
        end,
        routing_status = target_routing_status,
        started_at = target_started_at,
        answered_at = target_answered_at,
        ended_at = target_ended_at,
        duration_seconds = target_duration_seconds,
        recording_sid = target_recording_id,
        recording_status = target_recording_status,
        transcript_status = target_transcript_status,
        follow_up_required = target_call_status in ('missed', 'voicemail'),
        correlation_id = target_correlation_id,
        metadata = target_payload_summary,
        provider_updated_at = target_provider_updated_at,
        provider_version_source = target_provider_version_source,
        provider_status_rank = target_provider_status_rank,
        provider_content_sha256 = target_call_content_sha256
      where id = existing_call.id
        and company_id = target_company_id
        and integration_connection_id = target_connection_id
        and provider = 'gohighlevel'
        and provider_call_sid = target_provider_event_id
        and provider_updated_at <= target_provider_updated_at
      returning * into saved_call;
      call_provider_changed := true;
    elsif call_exists then
      if association_authoritative and (
        existing_call.customer_id is distinct from target_customer_id
        or existing_call.lead_id is distinct from target_lead_id
        or existing_call.job_id is distinct from target_job_id
        or existing_call.routing_status is distinct from target_routing_status
      ) then
        update public.call_records
        set
          customer_id = target_customer_id,
          lead_id = target_lead_id,
          job_id = target_job_id,
          routing_status = target_routing_status
        where id = existing_call.id
          and company_id = target_company_id
          and integration_connection_id = target_connection_id
          and provider = 'gohighlevel';
        if not found then
          raise exception using errcode = '40001', message = 'HighLevel call association update was lost.';
        end if;
        association_changed := true;
      end if;
      saved_call := existing_call;
    else
      insert into public.call_records (
        company_id,
        integration_connection_id,
        customer_id,
        lead_id,
        job_id,
        provider,
        provider_account_sid,
        provider_call_sid,
        provider_parent_call_sid,
        direction,
        call_status,
        from_phone,
        to_phone,
        business_phone,
        customer_phone,
        routing_status,
        started_at,
        answered_at,
        ended_at,
        duration_seconds,
        recording_sid,
        recording_status,
        transcript_status,
        follow_up_required,
        correlation_id,
        metadata,
        provider_updated_at,
        provider_version_source,
        provider_status_rank,
        provider_content_sha256
      ) values (
        target_company_id,
        target_connection_id,
        target_customer_id,
        target_lead_id,
        target_job_id,
        'gohighlevel',
        target_connection.external_account_id,
        target_provider_event_id,
        target_parent_id,
        target_direction,
        target_call_status,
        target_from_phone,
        target_to_phone,
        case when target_direction = 'inbound' then target_to_phone else target_from_phone end,
        case when target_direction = 'inbound' then target_from_phone else target_to_phone end,
        target_routing_status,
        target_started_at,
        target_answered_at,
        target_ended_at,
        target_duration_seconds,
        target_recording_id,
        target_recording_status,
        target_transcript_status,
        target_call_status in ('missed', 'voicemail'),
        target_correlation_id,
        target_payload_summary,
        target_provider_updated_at,
        target_provider_version_source,
        target_provider_status_rank,
        target_call_content_sha256
      )
      returning * into saved_call;
      call_provider_changed := true;
    end if;

    if saved_call.id is null then
      raise exception using errcode = '40001', message = 'HighLevel call version update was lost.';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', communication_contract_version,
    'disposition', case
      when event_provider_changed or call_provider_changed then 'saved'
      when association_changed then 'association_updated'
      else 'same_version'
    end,
    'companyId', target_company_id,
    'integrationConnectionId', target_connection_id,
    'canonicalExternalId', target_provider_event_id,
    'communicationEventId', saved_event.id,
    'callRecordId', case when target_channel = 'voice' then saved_call.id else null end,
    'providerUpdatedAt', target_provider_updated_at,
    'providerRecordsChanged', event_provider_changed or call_provider_changed,
    'associationChanged', association_changed
  );
exception when invalid_text_representation
  or numeric_value_out_of_range
  or datetime_field_overflow
  or invalid_datetime_format then
  raise exception using errcode = '22023', message = 'Invalid HighLevel communication.';
end;
$$;

create or replace function public.wtos_bind_gohighlevel_oauth_v1(
  p_binding jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  binding_contract_version constant integer := 1;
  target_company_id uuid;
  target_location_id text;
  target_external_company_id text;
  target_external_user_id text;
  target_display_name text;
  target_scopes text[];
  target_token_expires_at timestamptz;
  target_encrypted_access_token text;
  target_encrypted_refresh_token text;
  target_token_type text;
  target_user_type text;
  target_settings jsonb;
  existing_credential public.gohighlevel_oauth_credentials%rowtype;
  attached_credential public.gohighlevel_oauth_credentials%rowtype;
  target_connection public.integration_connections%rowtype;
  reconnect boolean := false;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_binding) is distinct from 'object'
    or pg_catalog.coalesce((p_binding ->> 'contractVersion')::integer, 0)
      <> binding_contract_version then
    raise exception using errcode = '22023', message = 'Unsupported OAuth binding contract.';
  end if;

  begin
    target_company_id := (p_binding ->> 'companyId')::uuid;
    target_token_expires_at := (p_binding ->> 'tokenExpiresAt')::timestamptz;
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid OAuth binding identity.';
  end;

  target_location_id := pg_catalog.nullif(
    pg_catalog.btrim(p_binding ->> 'externalLocationId'),
    ''
  );
  target_external_company_id := pg_catalog.nullif(
    pg_catalog.btrim(p_binding ->> 'externalCompanyId'),
    ''
  );
  target_external_user_id := pg_catalog.nullif(
    pg_catalog.btrim(p_binding ->> 'externalUserId'),
    ''
  );
  target_display_name := pg_catalog.nullif(
    pg_catalog.btrim(p_binding ->> 'displayName'),
    ''
  );
  target_encrypted_access_token := p_binding ->> 'encryptedAccessToken';
  target_encrypted_refresh_token := p_binding ->> 'encryptedRefreshToken';
  target_token_type := pg_catalog.nullif(
    pg_catalog.btrim(p_binding ->> 'tokenType'),
    ''
  );
  target_user_type := p_binding ->> 'userType';
  target_settings := p_binding -> 'settings';

  if target_company_id is null
    or target_location_id is null
    or pg_catalog.length(target_location_id) > 256
    or target_external_company_id is null
    or pg_catalog.length(target_external_company_id) > 256
    or pg_catalog.length(pg_catalog.coalesce(target_external_user_id, '')) > 256
    or target_display_name is null
    or pg_catalog.length(target_display_name) > 200
    or target_token_type is null
    or pg_catalog.length(target_token_type) > 32
    or target_user_type is null
    or target_user_type <> 'Location'
    or target_token_expires_at is null
    or target_token_expires_at <= pg_catalog.clock_timestamp()
    or target_encrypted_access_token is null
    or target_encrypted_access_token !~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'
    or target_encrypted_refresh_token is null
    or target_encrypted_refresh_token !~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'
    or pg_catalog.jsonb_typeof(p_binding -> 'scopes') is distinct from 'array'
    or pg_catalog.jsonb_typeof(target_settings) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Invalid OAuth binding.';
  end if;

  if pg_catalog.octet_length(target_settings::text) > 16384
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_binding -> 'scopes') as scope_value
      where pg_catalog.jsonb_typeof(scope_value) is distinct from 'string'
    ) then
    raise exception using errcode = '22023', message = 'Invalid OAuth binding.';
  end if;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(granted_scope.scope_value order by granted_scope.scope_value),
    '{}'::text[]
  )
  into target_scopes
  from pg_catalog.jsonb_array_elements_text(p_binding -> 'scopes')
    as granted_scope(scope_value);

  if pg_catalog.cardinality(target_scopes) < 1
    or pg_catalog.cardinality(target_scopes) > 50
    or exists (
      select 1
      from pg_catalog.unnest(target_scopes) as scope_value
      where pg_catalog.length(scope_value) < 1
        or pg_catalog.length(scope_value) > 200
    ) then
    raise exception using errcode = '22023', message = 'Invalid OAuth scope binding.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:gohighlevel:oauth:' || target_location_id,
      0
    )
  );

  select credential.*
  into existing_credential
  from public.gohighlevel_oauth_credentials as credential
  where credential.external_location_id = target_location_id
  for update;

  if existing_credential.id is not null
    and existing_credential.company_id is distinct from target_company_id then
    return pg_catalog.jsonb_build_object(
      'contractVersion', binding_contract_version,
      'disposition', 'conflict',
      'companyId', target_company_id,
      'locationId', target_location_id
    );
  end if;

  if existing_credential.id is not null then
    select connection.*
    into target_connection
    from public.integration_connections as connection
    where connection.id = existing_credential.integration_connection_id
    for update;

    if target_connection.id is null
      or target_connection.company_id is distinct from target_company_id
      or target_connection.provider is distinct from 'gohighlevel' then
      raise exception using errcode = '23514', message = 'OAuth connection scope mismatch.';
    end if;
    reconnect := true;
  else
    select connection.*
    into target_connection
    from public.integration_connections as connection
    where connection.company_id = target_company_id
      and connection.provider = 'gohighlevel'
      and connection.external_account_id = target_location_id
    for update;

    if target_connection.id is null then
      insert into public.integration_connections (
        company_id,
        provider,
        status,
        account_email,
        display_name,
        external_account_id,
        provider_account_id,
        default_calendar_id,
        scopes,
        sync_direction,
        credential_reference,
        token_expires_at,
        last_failure_at,
        last_error,
        settings
      ) values (
        target_company_id,
        'gohighlevel',
        'connected',
        null,
        target_display_name,
        target_location_id,
        target_location_id,
        null,
        target_scopes,
        'provider_to_weathertech',
        null,
        target_token_expires_at,
        null,
        null,
        target_settings
      )
      returning * into target_connection;
    else
      reconnect := true;
    end if;
  end if;

  select credential.*
  into attached_credential
  from public.gohighlevel_oauth_credentials as credential
  where credential.integration_connection_id = target_connection.id
  for update;

  if attached_credential.id is not null
    and (
      attached_credential.company_id is distinct from target_company_id
      or attached_credential.external_location_id is distinct from target_location_id
    ) then
    raise exception using errcode = '23514', message = 'OAuth credential scope mismatch.';
  end if;

  update public.integration_connections
  set
    status = 'connected',
    account_email = null,
    display_name = target_display_name,
    external_account_id = target_location_id,
    provider_account_id = target_location_id,
    default_calendar_id = null,
    scopes = target_scopes,
    sync_direction = 'provider_to_weathertech',
    credential_reference = null,
    token_expires_at = target_token_expires_at,
    last_failure_at = null,
    last_error = null,
    settings = pg_catalog.coalesce(settings, '{}'::jsonb) || target_settings
  where id = target_connection.id
    and company_id = target_company_id
    and provider = 'gohighlevel'
  returning * into target_connection;

  if target_connection.id is null then
    raise exception using errcode = '40001', message = 'OAuth connection binding was lost.';
  end if;

  if existing_credential.id is not null then
    update public.gohighlevel_oauth_credentials
    set
      integration_connection_id = target_connection.id,
      external_company_id = target_external_company_id,
      external_user_id = target_external_user_id,
      encrypted_access_token = target_encrypted_access_token,
      encrypted_refresh_token = target_encrypted_refresh_token,
      token_type = target_token_type,
      scopes = target_scopes,
      user_type = target_user_type,
      token_expires_at = target_token_expires_at,
      last_refreshed_at = pg_catalog.clock_timestamp(),
      revoked_at = null,
      refresh_version = refresh_version + 1,
      refresh_lease_id = null,
      refresh_lease_acquired_at = null,
      refresh_lease_expires_at = null
    where id = existing_credential.id;
  elsif attached_credential.id is not null then
    update public.gohighlevel_oauth_credentials
    set
      external_company_id = target_external_company_id,
      external_user_id = target_external_user_id,
      encrypted_access_token = target_encrypted_access_token,
      encrypted_refresh_token = target_encrypted_refresh_token,
      token_type = target_token_type,
      scopes = target_scopes,
      user_type = target_user_type,
      token_expires_at = target_token_expires_at,
      last_refreshed_at = pg_catalog.clock_timestamp(),
      revoked_at = null,
      refresh_version = refresh_version + 1,
      refresh_lease_id = null,
      refresh_lease_acquired_at = null,
      refresh_lease_expires_at = null
    where id = attached_credential.id;
    reconnect := true;
  else
    insert into public.gohighlevel_oauth_credentials (
      company_id,
      integration_connection_id,
      external_location_id,
      external_company_id,
      external_user_id,
      encrypted_access_token,
      encrypted_refresh_token,
      token_type,
      scopes,
      user_type,
      token_expires_at,
      last_refreshed_at,
      revoked_at,
      refresh_version,
      refresh_lease_id,
      refresh_lease_acquired_at,
      refresh_lease_expires_at
    ) values (
      target_company_id,
      target_connection.id,
      target_location_id,
      target_external_company_id,
      target_external_user_id,
      target_encrypted_access_token,
      target_encrypted_refresh_token,
      target_token_type,
      target_scopes,
      target_user_type,
      target_token_expires_at,
      pg_catalog.clock_timestamp(),
      null,
      0,
      null,
      null,
      null
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', binding_contract_version,
    'disposition', case when reconnect then 'reconnected' else 'connected' end,
    'connectionId', target_connection.id,
    'companyId', target_company_id,
    'locationId', target_location_id
  );
exception when invalid_text_representation
  or numeric_value_out_of_range
  or datetime_field_overflow then
  raise exception using errcode = '22023', message = 'Invalid OAuth binding.';
end;
$$;

create or replace function public.wtos_claim_gohighlevel_token_refresh_v1(
  p_claim jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  refresh_contract_version constant integer := 1;
  target_connection_id uuid;
  target_lease_id uuid;
  expected_refresh_version bigint;
  lease_seconds integer;
  target_credential public.gohighlevel_oauth_credentials%rowtype;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_claim) is distinct from 'object'
    or pg_catalog.coalesce((p_claim ->> 'contractVersion')::integer, 0)
      <> refresh_contract_version then
    raise exception using errcode = '22023', message = 'Unsupported token refresh claim.';
  end if;

  begin
    target_connection_id := (p_claim ->> 'integrationConnectionId')::uuid;
    target_lease_id := (p_claim ->> 'leaseId')::uuid;
    expected_refresh_version := (p_claim ->> 'expectedRefreshVersion')::bigint;
    lease_seconds := (p_claim ->> 'leaseSeconds')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid token refresh claim.';
  end;

  if target_connection_id is null
    or target_lease_id is null
    or expected_refresh_version is null
    or expected_refresh_version < 0
    or lease_seconds is null
    or lease_seconds < 15
    or lease_seconds > 60 then
    raise exception using errcode = '22023', message = 'Invalid token refresh claim.';
  end if;

  select credential.*
  into target_credential
  from public.gohighlevel_oauth_credentials as credential
  where credential.integration_connection_id = target_connection_id
  for update;

  if target_credential.id is null
    or target_credential.revoked_at is not null
    or not exists (
      select 1
      from public.integration_connections as connection
      where connection.id = target_credential.integration_connection_id
        and connection.company_id = target_credential.company_id
        and connection.provider = 'gohighlevel'
        and connection.external_account_id
          = target_credential.external_location_id
    ) then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'unavailable'
    );
  end if;

  if target_credential.refresh_version <> expected_refresh_version then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'superseded',
      'credentialId', target_credential.id,
      'refreshVersion', target_credential.refresh_version,
      'tokenExpiresAt', target_credential.token_expires_at
    );
  end if;

  if target_credential.refresh_lease_id is not null
    and target_credential.refresh_lease_expires_at > pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'busy',
      'credentialId', target_credential.id,
      'refreshVersion', target_credential.refresh_version,
      'leaseExpiresAt', target_credential.refresh_lease_expires_at
    );
  end if;

  update public.gohighlevel_oauth_credentials
  set
    refresh_lease_id = target_lease_id,
    refresh_lease_acquired_at = pg_catalog.clock_timestamp(),
    refresh_lease_expires_at = pg_catalog.clock_timestamp()
      + pg_catalog.make_interval(secs => lease_seconds)
  where id = target_credential.id
    and refresh_version = expected_refresh_version
    and revoked_at is null
  returning * into target_credential;

  if target_credential.id is null then
    raise exception using errcode = '40001', message = 'Token refresh claim was lost.';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', refresh_contract_version,
    'disposition', 'claimed',
    'credentialId', target_credential.id,
    'refreshVersion', target_credential.refresh_version,
    'leaseExpiresAt', target_credential.refresh_lease_expires_at
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid token refresh claim.';
end;
$$;

create or replace function public.wtos_adopt_gohighlevel_token_refresh_v1(
  p_adoption jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  refresh_contract_version constant integer := 1;
  target_connection_id uuid;
  minimum_refresh_version bigint;
  minimum_token_expires_at timestamptz;
  target_credential public.gohighlevel_oauth_credentials%rowtype;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_adoption) is distinct from 'object'
    or pg_catalog.coalesce((p_adoption ->> 'contractVersion')::integer, 0)
      <> refresh_contract_version then
    raise exception using errcode = '22023', message = 'Unsupported token refresh adoption.';
  end if;

  begin
    target_connection_id := (p_adoption ->> 'integrationConnectionId')::uuid;
    minimum_refresh_version := (p_adoption ->> 'minimumRefreshVersion')::bigint;
    minimum_token_expires_at := (p_adoption ->> 'minimumTokenExpiresAt')::timestamptz;
  exception when invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid token refresh adoption.';
  end;

  if target_connection_id is null
    or minimum_refresh_version is null
    or minimum_refresh_version < 0
    or minimum_token_expires_at is null then
    raise exception using errcode = '22023', message = 'Invalid token refresh adoption.';
  end if;

  select credential.*
  into target_credential
  from public.gohighlevel_oauth_credentials as credential
  where credential.integration_connection_id = target_connection_id;

  if target_credential.id is null
    or target_credential.revoked_at is not null
    or not exists (
      select 1
      from public.integration_connections as connection
      where connection.id = target_credential.integration_connection_id
        and connection.company_id = target_credential.company_id
        and connection.provider = 'gohighlevel'
        and connection.external_account_id
          = target_credential.external_location_id
    ) then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'unavailable'
    );
  end if;

  if target_credential.refresh_version > minimum_refresh_version
    and target_credential.token_expires_at > minimum_token_expires_at then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'adopted',
      'credentialId', target_credential.id,
      'refreshVersion', target_credential.refresh_version,
      'encryptedAccessToken', target_credential.encrypted_access_token,
      'tokenExpiresAt', target_credential.token_expires_at,
      'lastRefreshedAt', target_credential.last_refreshed_at
    );
  end if;

  if target_credential.refresh_lease_id is not null
    and target_credential.refresh_lease_expires_at > pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'busy',
      'credentialId', target_credential.id,
      'refreshVersion', target_credential.refresh_version,
      'leaseExpiresAt', target_credential.refresh_lease_expires_at
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', refresh_contract_version,
    'disposition', 'reclaimable',
    'credentialId', target_credential.id,
    'refreshVersion', target_credential.refresh_version,
    'tokenExpiresAt', target_credential.token_expires_at
  );
exception when invalid_text_representation
  or numeric_value_out_of_range
  or datetime_field_overflow then
  raise exception using errcode = '22023', message = 'Invalid token refresh adoption.';
end;
$$;

create or replace function public.wtos_finalize_gohighlevel_token_refresh_v1(
  p_finalization jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  refresh_contract_version constant integer := 1;
  target_credential_id uuid;
  target_lease_id uuid;
  expected_refresh_version bigint;
  target_encrypted_access_token text;
  target_encrypted_refresh_token text;
  target_token_type text;
  target_scopes text[];
  target_token_expires_at timestamptz;
  target_credential public.gohighlevel_oauth_credentials%rowtype;
  connection_updated boolean := false;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_finalization) is distinct from 'object'
    or pg_catalog.coalesce((p_finalization ->> 'contractVersion')::integer, 0)
      <> refresh_contract_version then
    raise exception using errcode = '22023', message = 'Unsupported token refresh finalization.';
  end if;

  begin
    target_credential_id := (p_finalization ->> 'credentialId')::uuid;
    target_lease_id := (p_finalization ->> 'leaseId')::uuid;
    expected_refresh_version := (p_finalization ->> 'expectedRefreshVersion')::bigint;
    target_token_expires_at := (p_finalization ->> 'tokenExpiresAt')::timestamptz;
  exception when invalid_text_representation
    or numeric_value_out_of_range
    or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'Invalid token refresh finalization.';
  end;

  target_encrypted_access_token := p_finalization ->> 'encryptedAccessToken';
  target_encrypted_refresh_token := p_finalization ->> 'encryptedRefreshToken';
  target_token_type := pg_catalog.nullif(
    pg_catalog.btrim(p_finalization ->> 'tokenType'),
    ''
  );

  if target_credential_id is null
    or target_lease_id is null
    or expected_refresh_version is null
    or expected_refresh_version < 0
    or target_token_expires_at is null
    or target_token_expires_at <= pg_catalog.clock_timestamp()
    or target_token_type is null
    or pg_catalog.length(target_token_type) > 32
    or target_encrypted_access_token is null
    or target_encrypted_access_token !~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'
    or target_encrypted_refresh_token is null
    or target_encrypted_refresh_token !~ '^v1:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}:[A-Za-z0-9+/]+={0,2}$'
    or pg_catalog.jsonb_typeof(p_finalization -> 'scopes') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid token refresh finalization.';
  end if;

  if exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_finalization -> 'scopes') as scope_value
      where pg_catalog.jsonb_typeof(scope_value) is distinct from 'string'
    ) then
    raise exception using errcode = '22023', message = 'Invalid token refresh finalization.';
  end if;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(granted_scope.scope_value order by granted_scope.scope_value),
    '{}'::text[]
  )
  into target_scopes
  from pg_catalog.jsonb_array_elements_text(p_finalization -> 'scopes')
    as granted_scope(scope_value);

  if pg_catalog.cardinality(target_scopes) < 1
    or pg_catalog.cardinality(target_scopes) > 50
    or exists (
      select 1
      from pg_catalog.unnest(target_scopes) as scope_value
      where pg_catalog.length(scope_value) < 1
        or pg_catalog.length(scope_value) > 200
    ) then
    raise exception using errcode = '22023', message = 'Invalid token refresh scopes.';
  end if;

  select credential.*
  into target_credential
  from public.gohighlevel_oauth_credentials as credential
  where credential.id = target_credential_id
  for update;

  if target_credential.id is null
    or target_credential.revoked_at is not null
    or not exists (
      select 1
      from public.integration_connections as connection
      where connection.id = target_credential.integration_connection_id
        and connection.company_id = target_credential.company_id
        and connection.provider = 'gohighlevel'
        and connection.external_account_id
          = target_credential.external_location_id
    )
    or target_credential.refresh_version <> expected_refresh_version
    or target_credential.refresh_lease_id is distinct from target_lease_id
    or target_credential.refresh_lease_expires_at <= pg_catalog.clock_timestamp() then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'stale'
    );
  end if;

  update public.gohighlevel_oauth_credentials
  set
    encrypted_access_token = target_encrypted_access_token,
    encrypted_refresh_token = target_encrypted_refresh_token,
    token_type = target_token_type,
    scopes = target_scopes,
    token_expires_at = target_token_expires_at,
    last_refreshed_at = pg_catalog.clock_timestamp(),
    refresh_version = refresh_version + 1,
    refresh_lease_id = null,
    refresh_lease_acquired_at = null,
    refresh_lease_expires_at = null
  where id = target_credential.id
    and refresh_version = expected_refresh_version
    and refresh_lease_id = target_lease_id
    and refresh_lease_expires_at > pg_catalog.clock_timestamp()
    and revoked_at is null
  returning * into target_credential;

  if target_credential.id is null then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'stale'
    );
  end if;

  update public.integration_connections
  set
    status = case
      when status in ('connected', 'needs_reauth') then 'connected'
      else status
    end,
    token_expires_at = target_token_expires_at,
    last_error = case
      when status in ('connected', 'needs_reauth') then null
      else last_error
    end
  where id = target_credential.integration_connection_id
    and company_id = target_credential.company_id
    and provider = 'gohighlevel'
    and external_account_id = target_credential.external_location_id;
  connection_updated := found;

  if not connection_updated then
    raise exception using errcode = '23514', message = 'Token refresh connection scope mismatch.';
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', refresh_contract_version,
    'disposition', 'finalized',
    'credentialId', target_credential.id,
    'refreshVersion', target_credential.refresh_version,
    'tokenExpiresAt', target_credential.token_expires_at,
    'lastRefreshedAt', target_credential.last_refreshed_at
  );
exception when invalid_text_representation
  or numeric_value_out_of_range
  or datetime_field_overflow then
  raise exception using errcode = '22023', message = 'Invalid token refresh finalization.';
end;
$$;

create or replace function public.wtos_release_gohighlevel_token_refresh_v1(
  p_release jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  refresh_contract_version constant integer := 1;
  target_credential_id uuid;
  target_lease_id uuid;
  expected_refresh_version bigint;
  mark_needs_reauth boolean;
  target_credential public.gohighlevel_oauth_credentials%rowtype;
  connection_marked boolean := false;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if pg_catalog.jsonb_typeof(p_release) is distinct from 'object'
    or pg_catalog.coalesce((p_release ->> 'contractVersion')::integer, 0)
      <> refresh_contract_version
    or pg_catalog.jsonb_typeof(p_release -> 'markNeedsReauth')
      is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'Unsupported token refresh release.';
  end if;

  begin
    target_credential_id := (p_release ->> 'credentialId')::uuid;
    target_lease_id := (p_release ->> 'leaseId')::uuid;
    expected_refresh_version := (p_release ->> 'expectedRefreshVersion')::bigint;
    mark_needs_reauth := (p_release ->> 'markNeedsReauth')::boolean;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'Invalid token refresh release.';
  end;

  if target_credential_id is null
    or target_lease_id is null
    or expected_refresh_version is null
    or expected_refresh_version < 0 then
    raise exception using errcode = '22023', message = 'Invalid token refresh release.';
  end if;

  select credential.*
  into target_credential
  from public.gohighlevel_oauth_credentials as credential
  where credential.id = target_credential_id
  for update;

  if target_credential.id is null
    or target_credential.revoked_at is not null
    or target_credential.refresh_version <> expected_refresh_version
    or target_credential.refresh_lease_id is distinct from target_lease_id then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'stale',
      'connectionMarkedNeedsReauth', false
    );
  end if;

  update public.gohighlevel_oauth_credentials
  set
    refresh_lease_id = null,
    refresh_lease_acquired_at = null,
    refresh_lease_expires_at = null
  where id = target_credential.id
    and refresh_version = expected_refresh_version
    and refresh_lease_id = target_lease_id;

  if not found then
    return pg_catalog.jsonb_build_object(
      'contractVersion', refresh_contract_version,
      'disposition', 'stale',
      'connectionMarkedNeedsReauth', false
    );
  end if;

  if mark_needs_reauth then
    update public.integration_connections
    set
      status = 'needs_reauth',
      last_failure_at = pg_catalog.clock_timestamp(),
      last_error = 'HighLevel OAuth token refresh failed; reconnect is required.'
    where id = target_credential.integration_connection_id
      and company_id = target_credential.company_id
      and provider = 'gohighlevel'
      and external_account_id = target_credential.external_location_id;
    connection_marked := found;

    if not connection_marked then
      raise exception using errcode = '23514', message = 'Token refresh connection scope mismatch.';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'contractVersion', refresh_contract_version,
    'disposition', 'released',
    'credentialId', target_credential.id,
    'refreshVersion', target_credential.refresh_version,
    'connectionMarkedNeedsReauth', connection_marked
  );
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'Invalid token refresh release.';
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
set search_path = ''
as $$
declare
  transition_contract_version constant integer := 1;
  existing_event public.gohighlevel_webhook_events%rowtype;
  anchor_credential public.gohighlevel_oauth_credentials%rowtype;
  transition_at timestamptz := pg_catalog.clock_timestamp();
  normalized_payload_sha256 text := pg_catalog.lower(
    pg_catalog.coalesce(p_payload_sha256, '')
  );
  target_external_company_id text;
  credential_count integer := 0;
  connection_count integer := 0;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using errcode = '42501', message = 'Service role required.';
  end if;

  if p_event_id is null
    or p_claim_token is null
    or normalized_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_scope is null
    or p_scope not in ('location', 'company') then
    raise exception using errcode = '22023', message = 'Invalid uninstall transition.';
  end if;

  select webhook_event.*
  into existing_event
  from public.gohighlevel_webhook_events as webhook_event
  where webhook_event.id = p_event_id
  for update;

  if existing_event.id is null then
    raise exception using errcode = 'P0002', message = 'Webhook event not found.';
  end if;

  if pg_catalog.lower(existing_event.event_type) not like '%uninstall%'
    or existing_event.payload_sha256 is distinct from normalized_payload_sha256
    or existing_event.claim_token is distinct from p_claim_token then
    raise exception using errcode = '23514', message = 'Uninstall event identity mismatch.';
  end if;

  if p_scope = 'company' then
    if existing_event.external_location_id not like 'company:%' then
      raise exception using errcode = '23514', message = 'Company uninstall scope mismatch.';
    end if;

    target_external_company_id := pg_catalog.nullif(
      pg_catalog.btrim(
        pg_catalog.substr(
          existing_event.external_location_id,
          pg_catalog.length('company:') + 1
        )
      ),
      ''
    );
    if target_external_company_id is null
      or pg_catalog.length(target_external_company_id) > 256 then
      raise exception using errcode = '23514', message = 'Company uninstall scope mismatch.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'wtos:gohighlevel:uninstall:company:' || target_external_company_id,
        0
      )
    );

    select credential.*
    into anchor_credential
    from public.gohighlevel_oauth_credentials as credential
    where credential.integration_connection_id = existing_event.integration_connection_id
      and credential.company_id = existing_event.company_id
      and credential.external_company_id = target_external_company_id
    for update;

    if anchor_credential.id is null then
      raise exception using errcode = '23514', message = 'Company uninstall scope mismatch.';
    end if;
  else
    if existing_event.external_location_id like 'company:%' then
      raise exception using errcode = '23514', message = 'Location uninstall scope mismatch.';
    end if;

    select credential.*
    into anchor_credential
    from public.gohighlevel_oauth_credentials as credential
    where credential.integration_connection_id = existing_event.integration_connection_id
      and credential.company_id = existing_event.company_id
      and credential.external_location_id = existing_event.external_location_id
    for update;

    if anchor_credential.id is null then
      raise exception using errcode = '23514', message = 'Location uninstall scope mismatch.';
    end if;
  end if;

  if existing_event.processing_status = 'processed'
    and existing_event.lease_expires_at is null then
    return pg_catalog.jsonb_build_object(
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
    set
      revoked_at = pg_catalog.coalesce(revoked_at, transition_at),
      refresh_lease_id = null,
      refresh_lease_acquired_at = null,
      refresh_lease_expires_at = null
    where external_company_id = target_external_company_id
      and revoked_at is null;
    get diagnostics credential_count = row_count;

    update public.integration_connections as connection
    set
      status = 'needs_reauth',
      last_failure_at = transition_at,
      last_error = 'The HighLevel Marketplace app was uninstalled from this agency.'
    where connection.provider = 'gohighlevel'
      and connection.id in (
        select credential.integration_connection_id
        from public.gohighlevel_oauth_credentials as credential
        where credential.external_company_id = target_external_company_id
      );
    get diagnostics connection_count = row_count;
  else
    update public.gohighlevel_oauth_credentials
    set
      revoked_at = pg_catalog.coalesce(revoked_at, transition_at),
      refresh_lease_id = null,
      refresh_lease_acquired_at = null,
      refresh_lease_expires_at = null
    where id = anchor_credential.id
      and company_id = existing_event.company_id
      and integration_connection_id = existing_event.integration_connection_id;
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
    and payload_sha256 = normalized_payload_sha256
  returning * into existing_event;

  if existing_event.id is null then
    raise exception using errcode = '40001', message = 'Uninstall transition lost its claim.';
  end if;

  return pg_catalog.jsonb_build_object(
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

create or replace function public.wtos_record_gohighlevel_webhook_duplicate_v1(
  p_event_id uuid,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event public.gohighlevel_webhook_events%rowtype;
  normalized_payload_sha256 text := lower(nullif(btrim(p_payload_sha256), ''));
begin
  if p_event_id is null
    or normalized_payload_sha256 is null
    or normalized_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'A webhook event and SHA-256 payload identity are required.';
  end if;

  update public.gohighlevel_webhook_events
  set
    duplicate_count = duplicate_count + 1,
    last_duplicate_at = clock_timestamp()
  where id = p_event_id
    and payload_sha256 = normalized_payload_sha256
    and processing_status in ('processed', 'ignored')
  returning * into target_event;

  if target_event.id is null then
    if exists (
      select 1
      from public.gohighlevel_webhook_events as existing
      where existing.id = p_event_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'Webhook duplicate identity is not in a verified terminal state.';
    end if;

    raise exception using
      errcode = 'P0002',
      message = 'Webhook event was not found.';
  end if;

  return jsonb_build_object(
    'contractVersion', 1,
    'eventId', target_event.id,
    'companyId', target_event.company_id,
    'payloadSha256', target_event.payload_sha256,
    'processingStatus', target_event.processing_status,
    'duplicateCount', target_event.duplicate_count,
    'lastDuplicateAt', target_event.last_duplicate_at
  );
end;
$$;

revoke all on function public.wtos_claim_gohighlevel_sync_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_renew_gohighlevel_sync_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_complete_gohighlevel_sync_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_bind_gohighlevel_oauth_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_claim_gohighlevel_token_refresh_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_adopt_gohighlevel_token_refresh_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_finalize_gohighlevel_token_refresh_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_release_gohighlevel_token_refresh_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_transition_gohighlevel_webhook_v1(uuid, uuid, text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_upsert_gohighlevel_resource_snapshots_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_resolve_gohighlevel_communication_identity_v1(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_upsert_gohighlevel_communication_v1(jsonb)
from public, anon, authenticated, service_role;
revoke execute on function public.wtos_emit_missed_call_event_v1()
from public, anon, authenticated, service_role;

grant execute on function public.wtos_claim_gohighlevel_sync_v1(jsonb)
to service_role;
grant execute on function public.wtos_renew_gohighlevel_sync_v1(jsonb)
to service_role;
grant execute on function public.wtos_complete_gohighlevel_sync_v1(jsonb)
to service_role;
grant execute on function public.wtos_bind_gohighlevel_oauth_v1(jsonb)
to service_role;
grant execute on function public.wtos_claim_gohighlevel_token_refresh_v1(jsonb)
to service_role;
grant execute on function public.wtos_adopt_gohighlevel_token_refresh_v1(jsonb)
to service_role;
grant execute on function public.wtos_finalize_gohighlevel_token_refresh_v1(jsonb)
to service_role;
grant execute on function public.wtos_release_gohighlevel_token_refresh_v1(jsonb)
to service_role;
grant execute on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
to service_role;
grant execute on function public.wtos_transition_gohighlevel_webhook_v1(uuid, uuid, text, text, text)
to service_role;
grant execute on function public.wtos_upsert_gohighlevel_resource_snapshots_v1(jsonb)
to service_role;
grant execute on function public.wtos_resolve_gohighlevel_communication_identity_v1(jsonb)
to service_role;
grant execute on function public.wtos_upsert_gohighlevel_communication_v1(jsonb)
to service_role;

revoke all on function public.wtos_record_gohighlevel_webhook_duplicate_v1(uuid, text)
from public, anon, authenticated;
grant execute on function public.wtos_record_gohighlevel_webhook_duplicate_v1(uuid, text)
to service_role;

comment on function public.wtos_claim_gohighlevel_sync_v1(jsonb)
is 'Claims the single active, exact-company HighLevel sync audit row and recovers an expired predecessor lease.';
comment on function public.wtos_renew_gohighlevel_sync_v1(jsonb)
is 'Renews only an unexpired exact-scope HighLevel sync lease for its current service claim owner.';
comment on function public.wtos_complete_gohighlevel_sync_v1(jsonb)
is 'CAS-completes an exact HighLevel sync audit row for its service claim owner without stale overwrite.';
comment on function public.wtos_emit_missed_call_event_v1()
is 'Emits the existing missed-call follow-up for GHL missed or voicemail calls while retaining Twilio missed-only semantics.';
comment on function public.wtos_bind_gohighlevel_oauth_v1(jsonb)
is 'Atomically binds one WTOS company and exact HighLevel location to encrypted OAuth credentials.';
comment on function public.wtos_claim_gohighlevel_token_refresh_v1(jsonb)
is 'Claims an expiring, version-bound service-only lease before a rotating HighLevel token refresh.';
comment on function public.wtos_adopt_gohighlevel_token_refresh_v1(jsonb)
is 'Returns only encrypted access-token material when another service worker safely completes refresh.';
comment on function public.wtos_finalize_gohighlevel_token_refresh_v1(jsonb)
is 'CAS-finalizes an encrypted rotating HighLevel token pair for the exact lease owner.';
comment on function public.wtos_release_gohighlevel_token_refresh_v1(jsonb)
is 'Releases an exact refresh lease and conditionally records reauthorization without stale status clobber.';
comment on function public.wtos_finalize_gohighlevel_uninstall_v1(uuid, uuid, text, text)
is 'Atomically applies exact-location or shared external-agency HighLevel uninstall scope.';
comment on function public.wtos_transition_gohighlevel_webhook_v1(uuid, uuid, text, text, text)
is 'CAS-transitions one claimed HighLevel webhook and its exact connection health in one transaction.';
comment on function public.wtos_upsert_gohighlevel_resource_snapshots_v1(jsonb)
is 'Atomically upserts a bounded exact-scope HighLevel snapshot batch without provider-version or association regression.';
comment on function public.wtos_resolve_gohighlevel_communication_identity_v1(jsonb)
is 'Resolves bounded exact-scope HighLevel provider aliases without tuple-based conflation or automatic merges.';
comment on function public.wtos_upsert_gohighlevel_communication_v1(jsonb)
is 'Atomically persists version-ordered HighLevel communication and call evidence after canonical alias resolution.';

comment on function public.wtos_record_gohighlevel_webhook_duplicate_v1(uuid, text)
is 'Atomically records a verified terminal HighLevel webhook redelivery without retaining raw payloads.';

commit;
