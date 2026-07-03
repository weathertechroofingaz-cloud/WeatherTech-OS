alter table public.leads
add column if not exists first_name text,
add column if not exists last_name text,
add column if not exists company text,
add column if not exists address text,
add column if not exists zip text,
add column if not exists lead_source text,
add column if not exists division text,
add column if not exists assigned_to text,
add column if not exists estimate_amount numeric(12, 2),
add column if not exists appointment_date timestamptz,
add column if not exists gohighlevel_contact_id text,
add column if not exists archived boolean not null default false;

alter table public.leads
alter column status set default 'New Lead';

alter table public.leads
drop constraint if exists leads_status_check;

alter table public.leads
add constraint leads_status_check
check (
  status in (
    'new',
    'contacted',
    'qualified',
    'estimate_sent',
    'won',
    'lost',
    'New Lead',
    'Contacted',
    'Estimate Scheduled',
    'Proposal Sent',
    'Won',
    'Lost'
  )
);

alter table public.leads
drop constraint if exists leads_service_type_check;

alter table public.leads
add constraint leads_service_type_check
check (
  service_type in (
    'roofing',
    'painting',
    'both',
    'Roof Repair',
    'Roof Replacement',
    'Exterior Painting',
    'Stucco Repair',
    'Gutter Work',
    'Inspection',
    'Other'
  )
);

update public.leads
set
  first_name = coalesce(
    first_name,
    nullif(split_part(contact_name, ' ', 1), '')
  ),
  last_name = coalesce(
    last_name,
    nullif(
      trim(substr(contact_name, length(split_part(contact_name, ' ', 1)) + 1)),
      ''
    )
  ),
  address = coalesce(address, property_address),
  zip = coalesce(zip, postal_code),
  lead_source = coalesce(lead_source, source),
  division = coalesce(
    division,
    case
      when company_id = (select id from public.companies where name = 'IHC Painting')
        then 'IHC Painting'
      else 'WeatherTech Roofing'
    end
  ),
  estimate_amount = coalesce(estimate_amount, estimated_value),
  archived = coalesce(archived, false);

create index if not exists leads_lead_source_idx
on public.leads(lead_source);

create index if not exists leads_created_at_idx
on public.leads(created_at desc);

create index if not exists leads_archived_idx
on public.leads(archived);

insert into public.leads (
  company_id,
  first_name,
  last_name,
  company,
  contact_name,
  phone,
  email,
  address,
  property_address,
  city,
  state,
  zip,
  postal_code,
  lead_source,
  source,
  service_type,
  division,
  status,
  priority,
  assigned_to,
  estimate_amount,
  estimated_value,
  appointment_date,
  next_follow_up,
  notes,
  archived
)
select
  selected_company.company_id,
  lead_seed.first_name,
  lead_seed.last_name,
  lead_seed.company,
  lead_seed.first_name || ' ' || lead_seed.last_name,
  lead_seed.phone,
  lead_seed.email,
  lead_seed.address,
  lead_seed.address,
  lead_seed.city,
  'AZ',
  lead_seed.zip,
  lead_seed.zip,
  lead_seed.lead_source,
  lead_seed.lead_source,
  lead_seed.service_type,
  lead_seed.division,
  lead_seed.status,
  lead_seed.priority,
  lead_seed.assigned_to,
  lead_seed.estimate_amount,
  lead_seed.estimate_amount,
  lead_seed.appointment_date,
  lead_seed.appointment_date::date,
  lead_seed.notes,
  false
from (
  values
    (
      'Yelp',
      'Roof Repair',
      'WeatherTech Roofing',
      'New Lead',
      'urgent',
      'Marisol',
      'Rivera',
      null,
      '(602) 555-0184',
      'marisol.rivera@example.com',
      '1842 E Montecito Ave',
      'Phoenix',
      '85016',
      'A monsoon storm lifted shingles near the garage. Wants inspection before more rain arrives.',
      'Daniel',
      1800::numeric,
      now() + interval '1 day'
    ),
    (
      'Website',
      'Roof Replacement',
      'WeatherTech Roofing',
      'Contacted',
      'high',
      'Evan',
      'Brooks',
      'Brooks Family Trust',
      '(480) 555-0139',
      'evan.brooks@example.com',
      '9217 N 83rd Pl',
      'Scottsdale',
      '85258',
      'Submitted website form for full tile underlayment replacement estimate.',
      'Hope',
      24500::numeric,
      now() + interval '2 days'
    ),
    (
      'Google',
      'Exterior Painting',
      'IHC Painting',
      'Estimate Scheduled',
      'normal',
      'Tanya',
      'Mendoza',
      null,
      '(623) 555-0197',
      'tanya.mendoza@example.com',
      '7114 W Avenida Del Sol',
      'Peoria',
      '85383',
      'Needs exterior repaint and HOA color approval before listing the home.',
      'Marcus',
      6200::numeric,
      now() + interval '3 days'
    ),
    (
      'Referral',
      'Stucco Repair',
      'IHC Painting',
      'Proposal Sent',
      'normal',
      'Priya',
      'Shah',
      'Shah Residence',
      '(602) 555-0162',
      'priya.shah@example.com',
      '3301 E Flower St',
      'Phoenix',
      '85018',
      'Referred by a prior painting customer. Stucco cracking on south elevation.',
      'Lena',
      3100::numeric,
      now() + interval '4 days'
    ),
    (
      'Phone Call',
      'Roof Replacement',
      'WeatherTech Roofing',
      'Won',
      'high',
      'Robert',
      'Kim',
      null,
      '(480) 555-0116',
      'robert.kim@example.com',
      '14622 S 17th St',
      'Phoenix',
      '85048',
      'Called after neighbor project. Signed roof replacement pending production scheduling.',
      'Daniel',
      19800::numeric,
      now() + interval '5 days'
    )
) as lead_seed (
  lead_source,
  service_type,
  division,
  status,
  priority,
  first_name,
  last_name,
  company,
  phone,
  email,
  address,
  city,
  zip,
  notes,
  assigned_to,
  estimate_amount,
  appointment_date
)
cross join lateral (
  select id as company_id
  from public.companies
  where (
    lead_seed.division = 'IHC Painting'
    and (trade = 'painting' or name ilike '%ihc%')
  ) or (
    lead_seed.division = 'WeatherTech Roofing'
    and (trade = 'roofing' or name ilike '%weathertech%')
  )
  order by
    case
      when lead_seed.division = 'IHC Painting' and name = 'IHC Painting' then 0
      when lead_seed.division = 'WeatherTech Roofing' and name = 'WeatherTech Roofing LLC' then 0
      else 1
    end,
    created_at
  limit 1
) as selected_company
where not exists (select 1 from public.leads);
