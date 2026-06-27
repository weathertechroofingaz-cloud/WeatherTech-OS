alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (provider in ('google_calendar', 'gmail'));

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'gmail' check (provider in ('gmail')),
  category text not null check (
    category in ('estimate', 'invoice', 'follow_up', 'job_update', 'general')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'queued', 'sent', 'failed')
  ),
  to_email text not null,
  cc_email text,
  subject text not null,
  body text not null,
  gmail_message_id text,
  queued_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_messages_company_idx
on public.email_messages(company_id);

create index if not exists email_messages_customer_idx
on public.email_messages(customer_id);

create index if not exists email_messages_status_idx
on public.email_messages(status);

create index if not exists email_messages_connection_idx
on public.email_messages(integration_connection_id);

drop trigger if exists set_email_messages_updated_at
on public.email_messages;
create trigger set_email_messages_updated_at
before update on public.email_messages
for each row execute function public.set_updated_at();

alter table public.email_messages enable row level security;

create policy "Authenticated users manage email messages"
on public.email_messages for all to authenticated using (true) with check (true);
