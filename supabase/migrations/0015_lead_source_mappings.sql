create table if not exists public.lead_source_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (
    provider in (
      'website',
      'yelp',
      'twilio',
      'twilio_sms',
      'gohighlevel'
    )
  ),
  external_source_id text,
  business text not null,
  location text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_source_mappings_provider_external_idx
on public.lead_source_mappings(provider, external_source_id)
where external_source_id is not null and is_active = true;

create index if not exists lead_source_mappings_provider_business_location_idx
on public.lead_source_mappings(provider, business, location)
where is_active = true;

create index if not exists lead_source_mappings_active_idx
on public.lead_source_mappings(provider, is_active);

drop trigger if exists set_lead_source_mappings_updated_at
on public.lead_source_mappings;
create trigger set_lead_source_mappings_updated_at
before update on public.lead_source_mappings
for each row execute function public.set_updated_at();

alter table public.lead_source_mappings enable row level security;

revoke all on table public.lead_source_mappings from anon;
revoke all on table public.lead_source_mappings from public;

grant select, insert, update on table public.lead_source_mappings to authenticated;
grant select, insert, update, delete on table public.lead_source_mappings to service_role;

create policy "Authenticated users read lead source mappings"
on public.lead_source_mappings for select to authenticated using (true);

create policy "Authenticated users insert lead source mappings"
on public.lead_source_mappings for insert to authenticated with check (true);

create policy "Authenticated users update lead source mappings"
on public.lead_source_mappings for update to authenticated using (true) with check (true);
