alter table public.estimates
add column if not exists business text,
add column if not exists location text,
add column if not exists scope_of_work text;

update public.estimates as estimate
set
  business = coalesce(
    nullif(estimate.business, ''),
    (
      select company.name
      from public.companies as company
      where company.id = estimate.company_id
      limit 1
    )
  ),
  location = coalesce(
    nullif(estimate.location, ''),
    (
      select customer.property_address
      from public.customers as customer
      where customer.id = estimate.customer_id
      limit 1
    ),
    (
      select lead.property_address
      from public.leads as lead
      where lead.id = estimate.lead_id
      limit 1
    )
  ),
  scope_of_work = coalesce(nullif(estimate.scope_of_work, ''), estimate.notes)
where estimate.business is null
  or estimate.business = ''
  or estimate.location is null
  or estimate.location = ''
  or estimate.scope_of_work is null
  or estimate.scope_of_work = '';

alter table public.estimates
drop constraint if exists estimates_status_check;

alter table public.estimates
add constraint estimates_status_check
check (
  status in (
    'draft',
    'sent',
    'approved',
    'declined',
    'rejected',
    'expired'
  )
);

alter table public.estimate_line_items
add column if not exists unit_price numeric(12, 2);

update public.estimate_line_items
set unit_price = unit_cost
where unit_price is null;

alter table public.estimate_line_items
alter column unit_price set default 0,
alter column unit_price set not null;
