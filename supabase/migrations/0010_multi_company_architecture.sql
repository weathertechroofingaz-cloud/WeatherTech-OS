alter table public.companies
add column if not exists short_name text,
add column if not exists brand_color text,
add column if not exists workflow_profile text not null default 'both';

alter table public.companies
drop constraint if exists companies_workflow_profile_check;

alter table public.companies
add constraint companies_workflow_profile_check
check (workflow_profile in ('roofing', 'painting', 'both'));

update public.companies
set
  short_name = coalesce(short_name, 'WeatherTech'),
  brand_color = coalesce(brand_color, '#0284c7'),
  workflow_profile = 'roofing'
where name = 'WeatherTech Roofing LLC';

update public.companies
set
  short_name = coalesce(short_name, 'IHC Painting'),
  brand_color = coalesce(brand_color, '#7c3aed'),
  workflow_profile = 'painting'
where name = 'IHC Painting';

alter table public.scope_templates
add column if not exists company_id uuid references public.companies(id) on delete set null;

create index if not exists scope_templates_company_id_idx
on public.scope_templates(company_id);

update public.scope_templates
set company_id = (select id from public.companies where name = 'WeatherTech Roofing LLC')
where category in ('roofing', 'roof_repairs', 'tile_underlayment')
  and company_id is null;

update public.scope_templates
set company_id = (select id from public.companies where name = 'IHC Painting')
where category in ('exterior_painting', 'interior_painting', 'cabinet_refinishing')
  and company_id is null;

create table if not exists public.company_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role text not null default 'team_member' check (
    role in ('owner', 'admin', 'sales', 'production', 'field', 'viewer', 'team_member')
  ),
  can_manage_settings boolean not null default false,
  can_manage_financials boolean not null default false,
  can_manage_production boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);

drop trigger if exists company_memberships_set_updated_at on public.company_memberships;
create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

alter table public.company_memberships enable row level security;

drop policy if exists "Users can read own company memberships" on public.company_memberships;
create policy "Users can read own company memberships"
on public.company_memberships for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Authenticated admins can manage company memberships" on public.company_memberships;
create policy "Authenticated admins can manage company memberships"
on public.company_memberships for all
to authenticated
using (true)
with check (true);

create table if not exists public.company_workflow_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  workflow_profile text not null default 'both' check (workflow_profile in ('roofing', 'painting', 'both')),
  estimate_terms text,
  invoice_terms text,
  warranty_terms text,
  production_checklist jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists company_workflow_settings_set_updated_at on public.company_workflow_settings;
create trigger company_workflow_settings_set_updated_at
before update on public.company_workflow_settings
for each row execute function public.set_updated_at();

alter table public.company_workflow_settings enable row level security;

drop policy if exists "Authenticated users manage workflow settings" on public.company_workflow_settings;
create policy "Authenticated users manage workflow settings"
on public.company_workflow_settings for all
to authenticated
using (true)
with check (true);

insert into public.company_workflow_settings (
  company_id,
  workflow_profile,
  estimate_terms,
  invoice_terms,
  warranty_terms,
  production_checklist
)
select
  id,
  workflow_profile,
  case
    when workflow_profile = 'painting' then 'Painting estimates remain valid through the expiration date and are subject to confirmed colors, access, surface condition, and approved prep scope.'
    else 'Roofing estimates remain valid through the expiration date and are subject to material availability, roof access, decking condition, and approved change orders.'
  end,
  'Payment terms follow the approved invoice and signed agreement. Balances remain due according to invoice due date unless otherwise documented.',
  case
    when workflow_profile = 'painting' then 'Painting workmanship warranty is governed by surface preparation, coating manufacturer requirements, maintenance, and the signed agreement.'
    else 'Roofing workmanship warranty is governed by WeatherTech Roofing installation terms, manufacturer material requirements, maintenance, and the signed agreement.'
  end,
  case
    when workflow_profile = 'painting' then
      '["Confirm color selections", "Protect flooring, hardscape, fixtures, and landscaping", "Complete prep and masking review", "Capture before and after photos", "Complete final walkthrough"]'::jsonb
    else
      '["Confirm roof system and material staging", "Protect landscaping, driveway, and access points", "Document decking and flashing conditions", "Capture dry-in and completion photos", "Complete final walkthrough"]'::jsonb
  end
from public.companies
on conflict (company_id) do update
set
  workflow_profile = excluded.workflow_profile,
  estimate_terms = excluded.estimate_terms,
  invoice_terms = excluded.invoice_terms,
  warranty_terms = excluded.warranty_terms,
  production_checklist = excluded.production_checklist;
