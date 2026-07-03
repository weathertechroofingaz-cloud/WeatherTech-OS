create table if not exists public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null check (
    provider in (
      'google_calendar',
      'gmail',
      'google_maps',
      'twilio_sms',
      'gohighlevel'
    )
  ),
  direction text not null default 'weathertech_to_provider' check (
    direction in ('two_way', 'weathertech_to_provider', 'provider_to_weathertech')
  ),
  event_type text not null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'succeeded', 'failed', 'skipped', 'retrying')
  ),
  related_table text,
  related_record_id uuid,
  external_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  next_retry_at timestamptz,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  request_fingerprint text,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_sync_logs_company_idx
on public.integration_sync_logs(company_id);

create index if not exists integration_sync_logs_connection_idx
on public.integration_sync_logs(integration_connection_id);

create index if not exists integration_sync_logs_provider_status_idx
on public.integration_sync_logs(provider, status);

create index if not exists integration_sync_logs_retry_idx
on public.integration_sync_logs(next_retry_at)
where status in ('failed', 'retrying');

create index if not exists integration_sync_logs_related_record_idx
on public.integration_sync_logs(related_table, related_record_id);

drop trigger if exists set_integration_sync_logs_updated_at
on public.integration_sync_logs;
create trigger set_integration_sync_logs_updated_at
before update on public.integration_sync_logs
for each row execute function public.set_updated_at();

alter table public.integration_sync_logs enable row level security;

revoke all on table public.integration_sync_logs from anon;
revoke all on table public.integration_sync_logs from public;

grant select, insert, update on table public.integration_sync_logs to authenticated;
grant select, insert, update, delete on table public.integration_sync_logs to service_role;

create policy "Authenticated users read integration sync logs"
on public.integration_sync_logs for select to authenticated using (true);

create policy "Authenticated users insert integration sync logs"
on public.integration_sync_logs for insert to authenticated with check (true);

create policy "Authenticated users update integration sync logs"
on public.integration_sync_logs for update to authenticated using (true) with check (true);
