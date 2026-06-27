create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  role text not null check (
    role in ('owner', 'admin', 'sales', 'project_manager', 'crew_lead', 'technician')
  ),
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  title text not null,
  status text not null default 'assigned' check (
    status in ('assigned', 'accepted', 'completed', 'missed')
  ),
  assigned_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  clock_in_at timestamptz not null,
  clock_out_at timestamptz,
  break_minutes integer not null default 0,
  status text not null default 'clocked_in' check (
    status in ('clocked_in', 'submitted', 'approved')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  status text not null default 'pending' check (
    status in ('pending', 'passed', 'failed', 'needs_review')
  ),
  checklist text not null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  log_date date not null default current_date,
  weather_summary text,
  work_completed text not null,
  blockers text,
  tomorrow_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  title text not null,
  status text not null default 'draft' check (
    status in ('draft', 'sent', 'approved', 'rejected')
  ),
  reason text not null,
  amount numeric(12, 2) not null default 0,
  tax_rate numeric(6, 3) not null default 0,
  tax_total numeric(12, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  requested_date date not null default current_date,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  document_id uuid,
  change_order_id uuid references public.change_orders(id) on delete set null,
  signer_name text not null,
  signer_email text,
  status text not null default 'pending' check (
    status in ('pending', 'signed', 'declined')
  ),
  signature_data text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  change_order_id uuid references public.change_orders(id) on delete set null,
  title text not null,
  category text not null check (
    category in ('estimate', 'scope', 'invoice', 'change_order', 'contract', 'photo', 'other')
  ),
  file_url text,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.signatures
add constraint signatures_document_id_fkey
foreign key (document_id) references public.documents(id) on delete set null
not valid;

alter table public.signatures validate constraint signatures_document_id_fkey;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(12, 2) not null default 0,
  method text not null,
  status text not null default 'posted' check (
    status in ('pending', 'posted', 'failed', 'refunded')
  ),
  paid_at timestamptz,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  title text not null,
  message text not null,
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  status text not null default 'queued' check (
    status in ('queued', 'sent', 'read', 'dismissed')
  ),
  remind_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employees_company_id_idx on public.employees(company_id);
create index if not exists job_assignments_employee_id_idx on public.job_assignments(employee_id);
create index if not exists job_assignments_job_id_idx on public.job_assignments(job_id);
create index if not exists time_entries_employee_id_idx on public.time_entries(employee_id);
create index if not exists time_entries_job_id_idx on public.time_entries(job_id);
create index if not exists inspections_job_id_idx on public.inspections(job_id);
create index if not exists daily_logs_job_id_idx on public.daily_logs(job_id);
create index if not exists change_orders_job_id_idx on public.change_orders(job_id);
create index if not exists signatures_customer_id_idx on public.signatures(customer_id);
create index if not exists documents_customer_id_idx on public.documents(customer_id);
create index if not exists payments_invoice_id_idx on public.payments(invoice_id);
create index if not exists notifications_remind_at_idx on public.notifications(remind_at);

drop trigger if exists set_employees_updated_at on public.employees;
create trigger set_employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists set_job_assignments_updated_at on public.job_assignments;
create trigger set_job_assignments_updated_at
before update on public.job_assignments
for each row execute function public.set_updated_at();

drop trigger if exists set_time_entries_updated_at on public.time_entries;
create trigger set_time_entries_updated_at
before update on public.time_entries
for each row execute function public.set_updated_at();

drop trigger if exists set_inspections_updated_at on public.inspections;
create trigger set_inspections_updated_at
before update on public.inspections
for each row execute function public.set_updated_at();

drop trigger if exists set_daily_logs_updated_at on public.daily_logs;
create trigger set_daily_logs_updated_at
before update on public.daily_logs
for each row execute function public.set_updated_at();

drop trigger if exists set_change_orders_updated_at on public.change_orders;
create trigger set_change_orders_updated_at
before update on public.change_orders
for each row execute function public.set_updated_at();

drop trigger if exists set_signatures_updated_at on public.signatures;
create trigger set_signatures_updated_at
before update on public.signatures
for each row execute function public.set_updated_at();

drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

drop trigger if exists set_notifications_updated_at on public.notifications;
create trigger set_notifications_updated_at
before update on public.notifications
for each row execute function public.set_updated_at();

alter table public.employees enable row level security;
alter table public.job_assignments enable row level security;
alter table public.time_entries enable row level security;
alter table public.inspections enable row level security;
alter table public.daily_logs enable row level security;
alter table public.change_orders enable row level security;
alter table public.signatures enable row level security;
alter table public.documents enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;

create policy "Authenticated users manage employees"
on public.employees for all to authenticated using (true) with check (true);

create policy "Authenticated users manage job assignments"
on public.job_assignments for all to authenticated using (true) with check (true);

create policy "Authenticated users manage time entries"
on public.time_entries for all to authenticated using (true) with check (true);

create policy "Authenticated users manage inspections"
on public.inspections for all to authenticated using (true) with check (true);

create policy "Authenticated users manage daily logs"
on public.daily_logs for all to authenticated using (true) with check (true);

create policy "Authenticated users manage change orders"
on public.change_orders for all to authenticated using (true) with check (true);

create policy "Authenticated users manage signatures"
on public.signatures for all to authenticated using (true) with check (true);

create policy "Authenticated users manage documents"
on public.documents for all to authenticated using (true) with check (true);

create policy "Authenticated users manage payments"
on public.payments for all to authenticated using (true) with check (true);

create policy "Authenticated users manage notifications"
on public.notifications for all to authenticated using (true) with check (true);
