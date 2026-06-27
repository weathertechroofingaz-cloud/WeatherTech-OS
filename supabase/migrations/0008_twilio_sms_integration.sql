alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (provider in ('google_calendar', 'gmail', 'google_maps', 'twilio_sms'));

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  schedule_event_id uuid references public.schedule_events(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  integration_connection_id uuid references public.integration_connections(id) on delete set null,
  provider text not null default 'twilio_sms' check (provider in ('twilio_sms')),
  category text not null check (
    category in (
      'appointment_reminder',
      'estimate_follow_up',
      'invoice_reminder',
      'job_update',
      'weather_delay',
      'general'
    )
  ),
  status text not null default 'draft' check (
    status in ('draft', 'queued', 'sent', 'failed')
  ),
  to_phone text not null,
  from_phone text,
  body text not null,
  twilio_message_sid text,
  queued_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_messages_company_idx
on public.sms_messages(company_id);

create index if not exists sms_messages_customer_idx
on public.sms_messages(customer_id);

create index if not exists sms_messages_lead_idx
on public.sms_messages(lead_id);

create index if not exists sms_messages_job_idx
on public.sms_messages(job_id);

create index if not exists sms_messages_schedule_event_idx
on public.sms_messages(schedule_event_id);

create index if not exists sms_messages_invoice_idx
on public.sms_messages(invoice_id);

create index if not exists sms_messages_connection_idx
on public.sms_messages(integration_connection_id);

create index if not exists sms_messages_status_idx
on public.sms_messages(status);

drop trigger if exists set_sms_messages_updated_at
on public.sms_messages;
create trigger set_sms_messages_updated_at
before update on public.sms_messages
for each row execute function public.set_updated_at();

alter table public.sms_messages enable row level security;

create policy "Authenticated users manage sms messages"
on public.sms_messages for all to authenticated using (true) with check (true);
