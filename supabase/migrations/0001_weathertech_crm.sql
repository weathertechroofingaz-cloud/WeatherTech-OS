create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  trade text not null check (trade in ('roofing', 'painting', 'both')),
  phone text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'team_member' check (role in ('owner', 'admin', 'sales', 'production', 'team_member')),
  default_company_id uuid references public.companies(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  display_name text not null,
  contact_name text not null,
  phone text,
  email text,
  property_address text not null,
  city text,
  state text not null default 'AZ',
  postal_code text,
  customer_type text not null default 'homeowner' check (customer_type in ('homeowner', 'commercial', 'hoa', 'property_manager')),
  status text not null default 'active' check (status in ('active', 'inactive', 'prospect')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  customer_id uuid references public.customers(id),
  contact_name text not null,
  phone text,
  email text,
  property_address text not null,
  city text,
  state text not null default 'AZ',
  postal_code text,
  service_type text not null check (service_type in ('roofing', 'painting', 'both')),
  source text not null default 'Website',
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'estimate_sent', 'won', 'lost')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  estimated_value numeric(12, 2) not null default 0,
  next_follow_up date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists companies_trade_idx on public.companies(trade);
create index if not exists customers_company_id_idx on public.customers(company_id);
create index if not exists customers_status_idx on public.customers(status);
create index if not exists leads_company_id_idx on public.leads(company_id);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_priority_idx on public.leads(priority);
create index if not exists leads_next_follow_up_idx on public.leads(next_follow_up);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_updated_at();

drop trigger if exists leads_set_updated_at on public.leads;
create trigger leads_set_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;

drop policy if exists "Authenticated users can read companies" on public.companies;
create policy "Authenticated users can read companies"
on public.companies for select
to authenticated
using (true);

drop policy if exists "Authenticated users can manage companies" on public.companies;
create policy "Authenticated users can manage companies"
on public.companies for all
to authenticated
using (true)
with check (true);

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "Authenticated users can manage customers" on public.customers;
create policy "Authenticated users can manage customers"
on public.customers for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage leads" on public.leads;
create policy "Authenticated users can manage leads"
on public.leads for all
to authenticated
using (true)
with check (true);

insert into public.companies (name, trade, phone, email)
values
  ('WeatherTech Roofing LLC', 'roofing', null, null),
  ('IHC Painting', 'painting', null, null)
on conflict (name) do nothing;
