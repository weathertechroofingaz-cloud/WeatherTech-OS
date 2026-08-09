begin;

-- Stripe is deliberately restricted to WeatherTech Roofing LLC. IHC Painting
-- remains ineligible until it has a separately authorized account mapping.

alter table public.integration_connections
drop constraint if exists integration_connections_provider_check;

alter table public.integration_connections
add constraint integration_connections_provider_check
check (
  provider in (
    'docusign',
    'dropbox_sign',
    'google_calendar',
    'gmail',
    'google_maps',
    'google_business_profile',
    'gohighlevel',
    'quickbooks_online',
    'stripe',
    'twilio',
    'twilio_sms',
    'website',
    'yelp'
  )
);

alter table public.integration_sync_logs
drop constraint if exists integration_sync_logs_provider_check;

alter table public.integration_sync_logs
add constraint integration_sync_logs_provider_check
check (
  provider in (
    'docusign',
    'dropbox_sign',
    'google_calendar',
    'gmail',
    'google_maps',
    'google_business_profile',
    'gohighlevel',
    'quickbooks_online',
    'stripe',
    'twilio',
    'twilio_sms',
    'website',
    'yelp'
  )
);

create unique index if not exists integration_connections_stripe_account_uidx
on public.integration_connections(external_account_id)
where provider = 'stripe' and external_account_id is not null;

create table if not exists public.stripe_company_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  integration_connection_id uuid not null unique
    references public.integration_connections(id) on delete cascade,
  stripe_account_id text not null unique,
  account_display_name text not null,
  country text not null check (char_length(country) = 2),
  default_currency text not null check (char_length(default_currency) = 3),
  livemode boolean not null default true,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  card_payments_status text not null default 'inactive'
    check (card_payments_status in ('active', 'inactive', 'pending', 'restricted')),
  ach_payments_status text not null default 'inactive'
    check (ach_payments_status in ('active', 'inactive', 'pending', 'restricted')),
  payment_writes_enabled boolean not null default false,
  refund_writes_enabled boolean not null default false,
  webhook_processing_enabled boolean not null default false,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  check (default_currency = lower(default_currency)),
  check (not payment_writes_enabled or charges_enabled),
  check (not refund_writes_enabled or payment_writes_enabled),
  check (not webhook_processing_enabled or payment_writes_enabled)
);

create table if not exists public.stripe_object_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stripe_company_account_id uuid not null
    references public.stripe_company_accounts(id) on delete cascade,
  integration_connection_id uuid not null
    references public.integration_connections(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  local_object_type text not null check (
    local_object_type in ('customer', 'invoice', 'deposit', 'payment', 'refund')
  ),
  stripe_object_type text not null check (
    stripe_object_type in (
      'customer',
      'invoice',
      'payment_intent',
      'charge',
      'checkout_session',
      'refund'
    )
  ),
  stripe_object_id text not null,
  operation_key text not null,
  status text not null,
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  currency text check (currency is null or char_length(currency) = 3),
  livemode boolean not null,
  metadata_summary jsonb not null default '{}'::jsonb,
  last_provider_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_connection_id, stripe_object_type, stripe_object_id),
  unique (company_id, operation_key),
  check (customer_id is not null or invoice_id is not null or payment_id is not null),
  check (currency is null or currency = lower(currency))
);

create table if not exists public.stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stripe_company_account_id uuid not null
    references public.stripe_company_accounts(id) on delete cascade,
  integration_connection_id uuid not null
    references public.integration_connections(id) on delete cascade,
  stripe_event_id text not null unique,
  stripe_account_id text not null,
  event_type text not null,
  api_version text,
  livemode boolean not null,
  processing_status text not null default 'received' check (
    processing_status in ('received', 'processed', 'ignored', 'failed')
  ),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  payload_summary jsonb not null default '{}'::jsonb,
  error_message text,
  provider_created_at timestamptz,
  processed_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_object_mappings_company_idx
on public.stripe_object_mappings(company_id, created_at desc);

create index if not exists stripe_object_mappings_invoice_idx
on public.stripe_object_mappings(invoice_id, created_at desc)
where invoice_id is not null;

create index if not exists stripe_object_mappings_payment_idx
on public.stripe_object_mappings(payment_id, created_at desc)
where payment_id is not null;

create index if not exists stripe_webhook_events_company_idx
on public.stripe_webhook_events(company_id, received_at desc);

create index if not exists stripe_webhook_events_status_idx
on public.stripe_webhook_events(processing_status, received_at);

do $$
begin
  if exists (
    select 1
    from public.payments as payment
    join public.customers as customer on customer.id = payment.customer_id
    where customer.company_id <> payment.company_id
  ) then
    raise exception 'Existing payment/customer company mismatch must be resolved before Stripe activation.';
  end if;

  if exists (
    select 1
    from public.payments as payment
    join public.invoices as invoice on invoice.id = payment.invoice_id
    where invoice.company_id <> payment.company_id
  ) then
    raise exception 'Existing payment/invoice company mismatch must be resolved before Stripe activation.';
  end if;

  if exists (
    select 1
    from public.payments as payment
    join public.properties as property on property.id = payment.property_id
    where property.company_id <> payment.company_id
  ) then
    raise exception 'Existing payment/property company mismatch must be resolved before Stripe activation.';
  end if;

  if exists (
    select 1
    from public.invoices as invoice
    join public.customers as customer on customer.id = invoice.customer_id
    where customer.company_id <> invoice.company_id
  ) then
    raise exception 'Existing invoice/customer company mismatch must be resolved before Stripe activation.';
  end if;
end;
$$;

create or replace function public.wtos_enforce_stripe_connection_company()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  company_name text;
  company_trade text;
begin
  if new.provider <> 'stripe' then
    return new;
  end if;

  select company.name, company.trade
  into company_name, company_trade
  from public.companies as company
  where company.id = new.company_id;

  if company_name is distinct from 'WeatherTech Roofing LLC'
    or company_trade is distinct from 'roofing' then
    raise exception 'Stripe is not authorized for this company.';
  end if;

  if nullif(btrim(new.external_account_id), '') is null then
    raise exception 'A verified Stripe account ID is required.';
  end if;

  return new;
end;
$$;

drop trigger if exists integration_connections_enforce_stripe_company
on public.integration_connections;
create trigger integration_connections_enforce_stripe_company
before insert or update of company_id, provider, external_account_id
on public.integration_connections
for each row execute function public.wtos_enforce_stripe_connection_company();

create or replace function public.wtos_preserve_stripe_company_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.integration_connections as connection
    where connection.company_id = old.id
      and connection.provider = 'stripe'
  ) and (
    new.name is distinct from 'WeatherTech Roofing LLC'
    or new.trade is distinct from 'roofing'
  ) then
    raise exception 'A company with a Stripe mapping must remain WeatherTech Roofing LLC.';
  end if;

  return new;
end;
$$;

drop trigger if exists companies_preserve_stripe_identity on public.companies;
create trigger companies_preserve_stripe_identity
before update of name, trade on public.companies
for each row execute function public.wtos_preserve_stripe_company_identity();

create or replace function public.wtos_enforce_stripe_account_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  company_name text;
  company_trade text;
  connection_company_id uuid;
  connection_provider text;
  connection_account_id text;
begin
  select company.name, company.trade
  into company_name, company_trade
  from public.companies as company
  where company.id = new.company_id;

  if company_name is distinct from 'WeatherTech Roofing LLC'
    or company_trade is distinct from 'roofing' then
    raise exception 'Stripe account mappings are restricted to WeatherTech Roofing LLC.';
  end if;

  select connection.company_id, connection.provider, connection.external_account_id
  into connection_company_id, connection_provider, connection_account_id
  from public.integration_connections as connection
  where connection.id = new.integration_connection_id;

  if connection_company_id is distinct from new.company_id
    or connection_provider is distinct from 'stripe'
    or connection_account_id is distinct from new.stripe_account_id then
    raise exception 'Stripe account mapping does not match its company-scoped connection.';
  end if;

  return new;
end;
$$;

drop trigger if exists stripe_company_accounts_enforce_scope
on public.stripe_company_accounts;
create trigger stripe_company_accounts_enforce_scope
before insert or update of company_id, integration_connection_id, stripe_account_id
on public.stripe_company_accounts
for each row execute function public.wtos_enforce_stripe_account_scope();

create or replace function public.wtos_enforce_payment_company_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers as customer
    where customer.id = new.customer_id and customer.company_id = new.company_id
  ) then
    raise exception 'Payment customer must belong to the payment company.';
  end if;

  if new.invoice_id is not null and not exists (
    select 1 from public.invoices as invoice
    where invoice.id = new.invoice_id and invoice.company_id = new.company_id
  ) then
    raise exception 'Payment invoice must belong to the payment company.';
  end if;

  if new.property_id is not null and not exists (
    select 1 from public.properties as property
    where property.id = new.property_id and property.company_id = new.company_id
  ) then
    raise exception 'Payment property must belong to the payment company.';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_company_scope on public.payments;
create trigger payments_enforce_company_scope
before insert or update of company_id, customer_id, invoice_id, property_id
on public.payments
for each row execute function public.wtos_enforce_payment_company_scope();

create or replace function public.wtos_enforce_stripe_object_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.stripe_company_accounts as account
    join public.integration_connections as connection
      on connection.id = account.integration_connection_id
    where account.id = new.stripe_company_account_id
      and account.company_id = new.company_id
      and account.integration_connection_id = new.integration_connection_id
      and account.livemode = new.livemode
      and connection.company_id = new.company_id
      and connection.provider = 'stripe'
      and connection.external_account_id = account.stripe_account_id
  ) then
    raise exception 'Stripe object mapping does not match its company account.';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from public.customers as customer
    where customer.id = new.customer_id and customer.company_id = new.company_id
  ) then
    raise exception 'Stripe customer mapping crosses company boundaries.';
  end if;

  if new.invoice_id is not null and not exists (
    select 1 from public.invoices as invoice
    where invoice.id = new.invoice_id and invoice.company_id = new.company_id
  ) then
    raise exception 'Stripe invoice mapping crosses company boundaries.';
  end if;

  if new.payment_id is not null and not exists (
    select 1 from public.payments as payment
    where payment.id = new.payment_id and payment.company_id = new.company_id
  ) then
    raise exception 'Stripe payment mapping crosses company boundaries.';
  end if;

  return new;
end;
$$;

drop trigger if exists stripe_object_mappings_enforce_scope
on public.stripe_object_mappings;
create trigger stripe_object_mappings_enforce_scope
before insert or update of
  company_id,
  stripe_company_account_id,
  integration_connection_id,
  customer_id,
  invoice_id,
  payment_id
on public.stripe_object_mappings
for each row execute function public.wtos_enforce_stripe_object_scope();

create or replace function public.wtos_enforce_stripe_webhook_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.stripe_company_accounts as account
    join public.integration_connections as connection
      on connection.id = account.integration_connection_id
    where account.id = new.stripe_company_account_id
      and account.company_id = new.company_id
      and account.integration_connection_id = new.integration_connection_id
      and account.stripe_account_id = new.stripe_account_id
      and account.livemode = new.livemode
      and connection.company_id = new.company_id
      and connection.provider = 'stripe'
      and connection.external_account_id = new.stripe_account_id
  ) then
    raise exception 'Stripe webhook does not match its company account.';
  end if;

  return new;
end;
$$;

drop trigger if exists stripe_webhook_events_enforce_scope
on public.stripe_webhook_events;
create trigger stripe_webhook_events_enforce_scope
before insert or update of
  company_id,
  stripe_company_account_id,
  integration_connection_id,
  stripe_account_id,
  livemode
on public.stripe_webhook_events
for each row execute function public.wtos_enforce_stripe_webhook_scope();

create or replace function public.wtos_record_stripe_payment(
  target_mapping_id uuid,
  provider_paid_at timestamptz
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  mapping public.stripe_object_mappings%rowtype;
  invoice public.invoices%rowtype;
  recorded_payment_id uuid;
  payment_amount numeric(12, 2);
  updated_amount_paid numeric(12, 2);
  updated_balance_due numeric(12, 2);
begin
  select object_mapping.*
  into mapping
  from public.stripe_object_mappings as object_mapping
  where object_mapping.id = target_mapping_id
  for update;

  if mapping.id is null then
    raise exception 'Stripe object mapping was not found.';
  end if;

  if mapping.payment_id is not null then
    return mapping.payment_id;
  end if;

  if mapping.stripe_object_type <> 'payment_intent'
    or mapping.status <> 'succeeded'
    or mapping.invoice_id is null
    or mapping.amount_cents is null
    or mapping.amount_cents <= 0 then
    raise exception 'Stripe mapping is not a completed invoice payment.';
  end if;

  select invoice_record.*
  into invoice
  from public.invoices as invoice_record
  where invoice_record.id = mapping.invoice_id
    and invoice_record.company_id = mapping.company_id
  for update;

  if invoice.id is null then
    raise exception 'Stripe invoice does not belong to the mapped company.';
  end if;

  payment_amount := mapping.amount_cents::numeric / 100;
  if payment_amount > invoice.balance_due then
    raise exception 'Stripe payment exceeds the remaining invoice balance.';
  end if;

  insert into public.payments (
    company_id,
    customer_id,
    invoice_id,
    amount,
    method,
    status,
    paid_at,
    reference,
    notes
  )
  values (
    mapping.company_id,
    mapping.customer_id,
    mapping.invoice_id,
    payment_amount,
    'stripe',
    'posted',
    coalesce(provider_paid_at, now()),
    mapping.stripe_object_id,
    'Recorded from a verified Stripe payment webhook.'
  )
  returning id into recorded_payment_id;

  updated_amount_paid := invoice.amount_paid + payment_amount;
  updated_balance_due := greatest(invoice.total - updated_amount_paid, 0);

  update public.invoices
  set
    amount_paid = updated_amount_paid,
    balance_due = updated_balance_due,
    status = case when updated_balance_due = 0 then 'paid' else status end
  where id = invoice.id and company_id = mapping.company_id;

  update public.stripe_object_mappings
  set payment_id = recorded_payment_id
  where id = mapping.id and company_id = mapping.company_id;

  return recorded_payment_id;
end;
$$;

drop trigger if exists stripe_company_accounts_set_updated_at
on public.stripe_company_accounts;
create trigger stripe_company_accounts_set_updated_at
before update on public.stripe_company_accounts
for each row execute function public.set_updated_at();

drop trigger if exists stripe_object_mappings_set_updated_at
on public.stripe_object_mappings;
create trigger stripe_object_mappings_set_updated_at
before update on public.stripe_object_mappings
for each row execute function public.set_updated_at();

drop trigger if exists stripe_webhook_events_set_updated_at
on public.stripe_webhook_events;
create trigger stripe_webhook_events_set_updated_at
before update on public.stripe_webhook_events
for each row execute function public.set_updated_at();

alter table public.stripe_company_accounts enable row level security;
alter table public.stripe_object_mappings enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on table public.stripe_company_accounts from anon, public, authenticated;
revoke all on table public.stripe_object_mappings from anon, public, authenticated;
revoke all on table public.stripe_webhook_events from anon, public, authenticated;

grant select on table
  public.stripe_company_accounts,
  public.stripe_object_mappings,
  public.stripe_webhook_events
to authenticated;

grant select, insert, update, delete on table
  public.stripe_company_accounts,
  public.stripe_object_mappings,
  public.stripe_webhook_events
to service_role;

drop policy if exists "WTOS financial users read Stripe company accounts"
on public.stripe_company_accounts;
create policy "WTOS financial users read Stripe company accounts"
on public.stripe_company_accounts
for select to authenticated
using (public.wtos_can_manage_financials(company_id));

drop policy if exists "WTOS financial users read Stripe object mappings"
on public.stripe_object_mappings;
create policy "WTOS financial users read Stripe object mappings"
on public.stripe_object_mappings
for select to authenticated
using (public.wtos_can_manage_financials(company_id));

drop policy if exists "WTOS financial users read Stripe webhook events"
on public.stripe_webhook_events;
create policy "WTOS financial users read Stripe webhook events"
on public.stripe_webhook_events
for select to authenticated
using (public.wtos_can_manage_financials(company_id));

revoke all on function public.wtos_enforce_stripe_connection_company() from public;
revoke all on function public.wtos_preserve_stripe_company_identity() from public;
revoke all on function public.wtos_enforce_stripe_account_scope() from public;
revoke all on function public.wtos_enforce_payment_company_scope() from public;
revoke all on function public.wtos_enforce_stripe_object_scope() from public;
revoke all on function public.wtos_enforce_stripe_webhook_scope() from public;
revoke all on function public.wtos_record_stripe_payment(uuid, timestamptz)
from public, anon, authenticated;
grant execute on function public.wtos_record_stripe_payment(uuid, timestamptz)
to service_role;

commit;
