alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (provider in ('google_calendar', 'gmail', 'google_maps'));

alter table public.leads
add column if not exists latitude numeric(10, 7),
add column if not exists longitude numeric(10, 7),
add column if not exists google_place_id text,
add column if not exists address_verified_at timestamptz;

alter table public.jobs
add column if not exists latitude numeric(10, 7),
add column if not exists longitude numeric(10, 7),
add column if not exists google_place_id text,
add column if not exists address_verified_at timestamptz;

create table if not exists public.route_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  route_date date not null,
  status text not null default 'draft' check (
    status in ('draft', 'optimized', 'dispatched')
  ),
  origin_address text not null,
  destination_address text,
  travel_mode text not null default 'driving' check (travel_mode in ('driving')),
  avoid_tolls boolean not null default false,
  avoid_highways boolean not null default false,
  total_distance_meters integer not null default 0,
  total_duration_seconds integer not null default 0,
  estimated_fuel_cost numeric(12, 2) not null default 0,
  google_route_token text,
  encoded_polyline text,
  provider_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_plan_stops (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.route_plans(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  stop_type text not null check (stop_type in ('lead', 'job')),
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  sort_order integer not null default 0,
  title text not null,
  address text not null,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  google_place_id text,
  estimated_arrival_at timestamptz,
  estimated_departure_at timestamptz,
  distance_from_previous_meters integer not null default 0,
  duration_from_previous_seconds integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_google_place_id_idx
on public.leads(google_place_id);

create index if not exists jobs_google_place_id_idx
on public.jobs(google_place_id);

create index if not exists route_plans_company_date_idx
on public.route_plans(company_id, route_date);

create index if not exists route_plan_stops_plan_idx
on public.route_plan_stops(route_plan_id, sort_order);

create index if not exists route_plan_stops_lead_idx
on public.route_plan_stops(lead_id);

create index if not exists route_plan_stops_job_idx
on public.route_plan_stops(job_id);

drop trigger if exists set_route_plans_updated_at
on public.route_plans;
create trigger set_route_plans_updated_at
before update on public.route_plans
for each row execute function public.set_updated_at();

drop trigger if exists set_route_plan_stops_updated_at
on public.route_plan_stops;
create trigger set_route_plan_stops_updated_at
before update on public.route_plan_stops
for each row execute function public.set_updated_at();

alter table public.route_plans enable row level security;
alter table public.route_plan_stops enable row level security;

create policy "Authenticated users manage route plans"
on public.route_plans for all to authenticated using (true) with check (true);

create policy "Authenticated users manage route plan stops"
on public.route_plan_stops for all to authenticated using (true) with check (true);
