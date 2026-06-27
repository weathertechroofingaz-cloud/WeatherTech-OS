create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  customer_id uuid references public.customers(id),
  lead_id uuid references public.leads(id),
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'rejected', 'expired')),
  service_type text not null check (service_type in ('roofing', 'painting', 'both')),
  issue_date date not null default current_date,
  expiration_date date,
  subtotal numeric(12, 2) not null default 0,
  labor_total numeric(12, 2) not null default 0,
  material_total numeric(12, 2) not null default 0,
  tax_rate numeric(6, 3) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  discount_type text not null default 'fixed' check (discount_type in ('fixed', 'percent')),
  discount_value numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  profit_margin_rate numeric(6, 3) not null default 0,
  profit_margin_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  category text not null check (category in ('labor', 'material', 'other')),
  name text not null,
  description text,
  quantity numeric(12, 3) not null default 1,
  unit text not null default 'each',
  unit_cost numeric(12, 2) not null default 0,
  markup_rate numeric(6, 3) not null default 0,
  taxable boolean not null default true,
  sort_order integer not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scope_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('roofing', 'exterior_painting', 'interior_painting', 'cabinet_refinishing', 'roof_repairs', 'tile_underlayment', 'custom')),
  description text not null,
  template_body text not null,
  ai_prompt text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scopes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  customer_id uuid references public.customers(id),
  lead_id uuid references public.leads(id),
  estimate_id uuid references public.estimates(id),
  template_id uuid references public.scope_templates(id),
  title text not null,
  category text not null check (category in ('roofing', 'exterior_painting', 'interior_painting', 'cabinet_refinishing', 'roof_repairs', 'tile_underlayment', 'custom')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'sent', 'approved')),
  scope_body text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists estimates_company_id_idx on public.estimates(company_id);
create index if not exists estimates_customer_id_idx on public.estimates(customer_id);
create index if not exists estimates_lead_id_idx on public.estimates(lead_id);
create index if not exists estimates_status_idx on public.estimates(status);
create index if not exists estimate_line_items_estimate_id_idx on public.estimate_line_items(estimate_id);
create index if not exists scope_templates_category_idx on public.scope_templates(category);
create index if not exists scopes_company_id_idx on public.scopes(company_id);
create index if not exists scopes_customer_id_idx on public.scopes(customer_id);
create index if not exists scopes_estimate_id_idx on public.scopes(estimate_id);
create index if not exists scopes_status_idx on public.scopes(status);

drop trigger if exists estimates_set_updated_at on public.estimates;
create trigger estimates_set_updated_at
before update on public.estimates
for each row execute function public.set_updated_at();

drop trigger if exists estimate_line_items_set_updated_at on public.estimate_line_items;
create trigger estimate_line_items_set_updated_at
before update on public.estimate_line_items
for each row execute function public.set_updated_at();

drop trigger if exists scope_templates_set_updated_at on public.scope_templates;
create trigger scope_templates_set_updated_at
before update on public.scope_templates
for each row execute function public.set_updated_at();

drop trigger if exists scopes_set_updated_at on public.scopes;
create trigger scopes_set_updated_at
before update on public.scopes
for each row execute function public.set_updated_at();

alter table public.estimates enable row level security;
alter table public.estimate_line_items enable row level security;
alter table public.scope_templates enable row level security;
alter table public.scopes enable row level security;

drop policy if exists "Authenticated users can manage estimates" on public.estimates;
create policy "Authenticated users can manage estimates"
on public.estimates for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage estimate line items" on public.estimate_line_items;
create policy "Authenticated users can manage estimate line items"
on public.estimate_line_items for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage scope templates" on public.scope_templates;
create policy "Authenticated users can manage scope templates"
on public.scope_templates for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users can manage scopes" on public.scopes;
create policy "Authenticated users can manage scopes"
on public.scopes for all
to authenticated
using (true)
with check (true);

insert into public.scope_templates (id, title, category, description, template_body, ai_prompt, is_active)
values
  ('00000000-0000-4000-8000-000000000101', 'Roof Replacement', 'roofing', 'Full roofing replacement scope with tear-off, dry-in, and cleanup.', '1. Protect landscaping, driveway, and adjacent surfaces before work begins.\n2. Remove existing roofing materials down to suitable decking.\n3. Inspect decking and notify customer of any required wood replacement.\n4. Install underlayment, flashings, drip edge, penetrations, and roof covering per manufacturer specifications.\n5. Haul away job debris and complete magnetic nail sweep.\n6. Provide final walkthrough and workmanship documentation.', 'Generate a professional roof replacement scope using customer property details, roof system, material selection, exclusions, warranty notes, and cleanup requirements.', true),
  ('00000000-0000-4000-8000-000000000102', 'Exterior Painting', 'exterior_painting', 'Exterior preparation, masking, coating, and cleanup scope.', '1. Pressure wash exterior surfaces scheduled for coating.\n2. Scrape loose paint, sand rough edges, and spot-prime bare areas.\n3. Caulk open seams and mask windows, fixtures, hardscape, and landscaping.\n4. Apply approved exterior coating system to body, trim, fascia, doors, and selected accents.\n5. Remove masking, clean work areas, and perform final touch-ups.', 'Generate an exterior painting scope with prep level, surface repairs, coating system, color areas, exclusions, access notes, and final walkthrough steps.', true),
  ('00000000-0000-4000-8000-000000000103', 'Interior Painting', 'interior_painting', 'Interior room painting scope with protection and finish schedule.', '1. Move or cover furniture and protect flooring before painting.\n2. Patch minor wall imperfections and sand prepared areas.\n3. Mask fixtures, trim edges, and adjacent surfaces.\n4. Apply selected primer and finish coats to approved walls, ceilings, doors, and trim.\n5. Remove protection, clean rooms, and complete touch-up walkthrough.', 'Generate an interior painting scope with rooms, surfaces, prep requirements, paint finish, color selections, exclusions, and occupancy coordination.', true),
  ('00000000-0000-4000-8000-000000000104', 'Cabinet Refinishing', 'cabinet_refinishing', 'Cabinet cleaning, sanding, priming, spraying, and reassembly scope.', '1. Remove cabinet doors and drawer fronts and label hardware for reassembly.\n2. Clean and degloss cabinet surfaces scheduled for refinishing.\n3. Sand, fill minor imperfections, and apply bonding primer.\n4. Apply selected cabinet-grade finish to doors, drawer fronts, and boxes.\n5. Reinstall doors, drawers, and hardware after cure window.', 'Generate a cabinet refinishing scope with cabinet count, finish system, hardware handling, masking, cure timing, exclusions, and customer care notes.', true),
  ('00000000-0000-4000-8000-000000000105', 'Roof Repairs', 'roof_repairs', 'Targeted roof leak or damaged area repair scope.', '1. Identify affected roof area and document current conditions.\n2. Remove damaged materials only as needed to complete repair.\n3. Replace compromised underlayment, flashing, tile, shingle, or sealant components.\n4. Water-test repair area when practical and clean affected work zone.\n5. Provide repair photos and recommended maintenance notes.', 'Generate a targeted roof repair scope with leak location, diagnosis, affected materials, repair method, limitations, and photo documentation requirements.', true),
  ('00000000-0000-4000-8000-000000000106', 'Tile Underlayment', 'tile_underlayment', 'Tile lift, underlayment replacement, and reset scope.', '1. Carefully lift and stack existing roof tile from work areas.\n2. Remove failed underlayment and inspect exposed decking.\n3. Replace damaged wood only as approved by customer.\n4. Install new tile underlayment, flashings, battens, and related waterproofing.\n5. Reset existing tile, replace broken tile as needed, and clean the work area.', 'Generate a tile underlayment replacement scope with tile handling, underlayment system, flashing details, broken tile allowance, wood replacement process, and cleanup.', true)
on conflict (id) do nothing;
