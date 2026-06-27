create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  scope_id uuid references public.scopes(id) on delete set null,
  title text not null,
  service_type text not null check (service_type in ('roofing', 'painting', 'both')),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'in_progress', 'blocked', 'completed', 'closed')
  ),
  start_date date,
  end_date date,
  crew_name text,
  project_manager text,
  property_address text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete cascade,
  title text not null,
  event_type text not null check (
    event_type in ('inspection', 'estimate', 'job', 'follow_up', 'material_delivery')
  ),
  status text not null default 'scheduled' check (
    status in ('scheduled', 'completed', 'canceled')
  ),
  start_at timestamptz not null,
  end_at timestamptz not null,
  location text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete set null,
  caption text,
  file_path text not null,
  file_url text not null,
  taken_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_number text not null,
  title text not null,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'paid', 'overdue', 'void')
  ),
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12, 2) not null default 0,
  tax_rate numeric(6, 3) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  amount_paid numeric(12, 2) not null default 0,
  balance_due numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, invoice_number)
);

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_cost numeric(12, 2) not null default 0,
  taxable boolean not null default true,
  sort_order integer not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  supplier_name text not null,
  status text not null default 'draft' check (
    status in ('draft', 'ordered', 'partial', 'received', 'canceled')
  ),
  requested_date date not null default current_date,
  expected_delivery_date date,
  delivery_address text,
  total numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_order_items (
  id uuid primary key default gen_random_uuid(),
  material_order_id uuid not null references public.material_orders(id) on delete cascade,
  name text not null,
  quantity numeric(12, 2) not null default 1,
  unit text not null default 'each',
  unit_cost numeric(12, 2) not null default 0,
  sort_order integer not null default 0,
  total numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jobs_company_id_idx on public.jobs(company_id);
create index if not exists jobs_customer_id_idx on public.jobs(customer_id);
create index if not exists jobs_start_date_idx on public.jobs(start_date);
create index if not exists schedule_events_start_at_idx on public.schedule_events(start_at);
create index if not exists schedule_events_job_id_idx on public.schedule_events(job_id);
create index if not exists job_photos_job_id_idx on public.job_photos(job_id);
create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
create index if not exists invoices_job_id_idx on public.invoices(job_id);
create index if not exists invoice_line_items_invoice_id_idx on public.invoice_line_items(invoice_id);
create index if not exists material_orders_job_id_idx on public.material_orders(job_id);
create index if not exists material_order_items_order_id_idx on public.material_order_items(material_order_id);

drop trigger if exists set_jobs_updated_at on public.jobs;
create trigger set_jobs_updated_at
before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists set_schedule_events_updated_at on public.schedule_events;
create trigger set_schedule_events_updated_at
before update on public.schedule_events
for each row execute function public.set_updated_at();

drop trigger if exists set_job_photos_updated_at on public.job_photos;
create trigger set_job_photos_updated_at
before update on public.job_photos
for each row execute function public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

drop trigger if exists set_invoice_line_items_updated_at on public.invoice_line_items;
create trigger set_invoice_line_items_updated_at
before update on public.invoice_line_items
for each row execute function public.set_updated_at();

drop trigger if exists set_material_orders_updated_at on public.material_orders;
create trigger set_material_orders_updated_at
before update on public.material_orders
for each row execute function public.set_updated_at();

drop trigger if exists set_material_order_items_updated_at on public.material_order_items;
create trigger set_material_order_items_updated_at
before update on public.material_order_items
for each row execute function public.set_updated_at();

alter table public.jobs enable row level security;
alter table public.schedule_events enable row level security;
alter table public.job_photos enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.material_orders enable row level security;
alter table public.material_order_items enable row level security;

create policy "Authenticated users manage jobs"
on public.jobs for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users manage schedule events"
on public.schedule_events for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users manage job photos"
on public.job_photos for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users manage invoices"
on public.invoices for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users manage invoice line items"
on public.invoice_line_items for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users manage material orders"
on public.material_orders for all
to authenticated
using (true)
with check (true);

create policy "Authenticated users manage material order items"
on public.material_order_items for all
to authenticated
using (true)
with check (true);

insert into storage.buckets (id, name, public)
values ('job-photos', 'job-photos', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Authenticated users read job photos" on storage.objects;
create policy "Authenticated users read job photos"
on storage.objects for select
to authenticated
using (bucket_id = 'job-photos');

drop policy if exists "Authenticated users upload job photos" on storage.objects;
create policy "Authenticated users upload job photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'job-photos');

drop policy if exists "Authenticated users update job photos" on storage.objects;
create policy "Authenticated users update job photos"
on storage.objects for update
to authenticated
using (bucket_id = 'job-photos')
with check (bucket_id = 'job-photos');
