begin;

-- Core Property Intelligence Foundation
-- Adds a company-scoped Property object that can safely become the long-term
-- operational spine for customers, leads, estimates, jobs, inspections,
-- documents, invoices, photos, schedules, materials, and payments.

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  display_name text not null,
  address text not null,
  city text,
  state text not null default 'AZ',
  postal_code text,
  property_type text not null default 'single_family',
  year_built integer,
  square_feet integer,
  stories numeric(4, 1),
  occupancy text not null default 'unknown',
  hoa_name text,
  gate_code text,
  access_instructions text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  parcel_number text,
  roof_age_years integer,
  roof_manufacturer text,
  roof_system text,
  roof_pitch text,
  roof_layers integer,
  roofing_material text,
  flat_roof_sections text,
  tile_information text,
  has_solar boolean not null default false,
  has_skylights boolean not null default false,
  hvac_penetrations text,
  chimneys text,
  paint_system text,
  exterior_finish text,
  exterior_paint_colors text,
  last_inspection_at timestamptz,
  next_recommended_inspection_at timestamptz,
  roof_condition text not null default 'unknown',
  paint_condition text not null default 'unknown',
  warranty_status text not null default 'unknown',
  document_status text not null default 'unknown',
  maintenance_status text not null default 'unknown',
  health_score integer,
  is_primary boolean not null default false,
  portfolio_label text,
  manager_name text,
  notes text,
  ai_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint properties_display_name_check check (length(trim(display_name)) > 0),
  constraint properties_address_check check (length(trim(address)) > 0),
  constraint properties_type_check check (
    property_type in (
      'single_family',
      'townhome',
      'condo',
      'multi_family',
      'commercial',
      'hoa',
      'property_management',
      'other'
    )
  ),
  constraint properties_occupancy_check check (
    occupancy in (
      'owner_occupied',
      'tenant_occupied',
      'vacant',
      'commercial',
      'hoa_common_area',
      'unknown'
    )
  ),
  constraint properties_roof_condition_check check (
    roof_condition in ('unknown', 'good', 'fair', 'poor', 'critical')
  ),
  constraint properties_paint_condition_check check (
    paint_condition in ('unknown', 'good', 'fair', 'poor', 'critical')
  ),
  constraint properties_warranty_status_check check (
    warranty_status in ('unknown', 'active', 'expiring', 'expired', 'none')
  ),
  constraint properties_document_status_check check (
    document_status in ('unknown', 'complete', 'missing', 'partial')
  ),
  constraint properties_maintenance_status_check check (
    maintenance_status in ('unknown', 'current', 'due', 'overdue', 'not_required')
  ),
  constraint properties_year_built_check check (
    year_built is null or (year_built >= 1800 and year_built <= extract(year from now())::integer + 1)
  ),
  constraint properties_square_feet_check check (square_feet is null or square_feet >= 0),
  constraint properties_stories_check check (stories is null or stories >= 0),
  constraint properties_latitude_check check (latitude is null or (latitude >= -90 and latitude <= 90)),
  constraint properties_longitude_check check (longitude is null or (longitude >= -180 and longitude <= 180)),
  constraint properties_roof_age_check check (roof_age_years is null or roof_age_years >= 0),
  constraint properties_roof_layers_check check (roof_layers is null or roof_layers >= 0),
  constraint properties_health_score_check check (health_score is null or (health_score >= 0 and health_score <= 100))
);

alter table public.properties
add column if not exists customer_id uuid,
add column if not exists display_name text,
add column if not exists address text,
add column if not exists city text,
add column if not exists state text,
add column if not exists postal_code text,
add column if not exists property_type text,
add column if not exists year_built integer,
add column if not exists square_feet integer,
add column if not exists stories numeric(4, 1),
add column if not exists occupancy text,
add column if not exists hoa_name text,
add column if not exists gate_code text,
add column if not exists access_instructions text,
add column if not exists latitude numeric(10, 7),
add column if not exists longitude numeric(10, 7),
add column if not exists parcel_number text,
add column if not exists roof_age_years integer,
add column if not exists roof_manufacturer text,
add column if not exists roof_system text,
add column if not exists roof_pitch text,
add column if not exists roof_layers integer,
add column if not exists roofing_material text,
add column if not exists flat_roof_sections text,
add column if not exists tile_information text,
add column if not exists has_solar boolean,
add column if not exists has_skylights boolean,
add column if not exists hvac_penetrations text,
add column if not exists chimneys text,
add column if not exists paint_system text,
add column if not exists exterior_finish text,
add column if not exists exterior_paint_colors text,
add column if not exists last_inspection_at timestamptz,
add column if not exists next_recommended_inspection_at timestamptz,
add column if not exists roof_condition text,
add column if not exists paint_condition text,
add column if not exists warranty_status text,
add column if not exists document_status text,
add column if not exists maintenance_status text,
add column if not exists health_score integer,
add column if not exists is_primary boolean,
add column if not exists portfolio_label text,
add column if not exists manager_name text,
add column if not exists notes text,
add column if not exists ai_summary text,
add column if not exists created_at timestamptz,
add column if not exists updated_at timestamptz;

update public.properties
set
  display_name = coalesce(nullif(display_name, ''), address, 'Property'),
  state = coalesce(nullif(state, ''), 'AZ'),
  property_type = coalesce(nullif(property_type, ''), 'single_family'),
  occupancy = coalesce(nullif(occupancy, ''), 'unknown'),
  roof_condition = coalesce(nullif(roof_condition, ''), 'unknown'),
  paint_condition = coalesce(nullif(paint_condition, ''), 'unknown'),
  warranty_status = coalesce(nullif(warranty_status, ''), 'unknown'),
  document_status = coalesce(nullif(document_status, ''), 'unknown'),
  maintenance_status = coalesce(nullif(maintenance_status, ''), 'unknown'),
  has_solar = coalesce(has_solar, false),
  has_skylights = coalesce(has_skylights, false),
  is_primary = coalesce(is_primary, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where display_name is null
  or display_name = ''
  or state is null
  or state = ''
  or property_type is null
  or property_type = ''
  or occupancy is null
  or occupancy = ''
  or roof_condition is null
  or roof_condition = ''
  or paint_condition is null
  or paint_condition = ''
  or warranty_status is null
  or warranty_status = ''
  or document_status is null
  or document_status = ''
  or maintenance_status is null
  or maintenance_status = ''
  or has_solar is null
  or has_skylights is null
  or is_primary is null
  or created_at is null
  or updated_at is null;

alter table public.properties
alter column display_name set not null,
alter column address set not null,
alter column state set default 'AZ',
alter column state set not null,
alter column property_type set default 'single_family',
alter column property_type set not null,
alter column occupancy set default 'unknown',
alter column occupancy set not null,
alter column roof_condition set default 'unknown',
alter column roof_condition set not null,
alter column paint_condition set default 'unknown',
alter column paint_condition set not null,
alter column warranty_status set default 'unknown',
alter column warranty_status set not null,
alter column document_status set default 'unknown',
alter column document_status set not null,
alter column maintenance_status set default 'unknown',
alter column maintenance_status set not null,
alter column has_solar set default false,
alter column has_solar set not null,
alter column has_skylights set default false,
alter column has_skylights set not null,
alter column is_primary set default false,
alter column is_primary set not null,
alter column created_at set default now(),
alter column created_at set not null,
alter column updated_at set default now(),
alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.properties'::regclass
      and conname = 'properties_customer_id_fkey'
  ) then
    alter table public.properties
    add constraint properties_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null
    not valid;
  end if;
end $$;

alter table public.properties validate constraint properties_customer_id_fkey;

drop trigger if exists properties_set_updated_at on public.properties;
create trigger properties_set_updated_at
before update on public.properties
for each row execute function public.set_updated_at();

create index if not exists properties_company_id_idx on public.properties(company_id);
create index if not exists properties_customer_id_idx on public.properties(customer_id);
create index if not exists properties_company_address_idx
on public.properties(company_id, lower(address), coalesce(postal_code, ''));
create index if not exists properties_health_score_idx on public.properties(health_score);
create index if not exists properties_warranty_status_idx on public.properties(warranty_status);
create index if not exists properties_next_recommended_inspection_idx
on public.properties(next_recommended_inspection_at);

do $$
declare
  property_link record;
begin
  for property_link in
    select *
    from (values
      ('leads', 'leads_property_id_fkey'),
      ('estimates', 'estimates_property_id_fkey'),
      ('jobs', 'jobs_property_id_fkey'),
      ('schedule_events', 'schedule_events_property_id_fkey'),
      ('job_photos', 'job_photos_property_id_fkey'),
      ('invoices', 'invoices_property_id_fkey'),
      ('material_orders', 'material_orders_property_id_fkey'),
      ('inspections', 'inspections_property_id_fkey'),
      ('change_orders', 'change_orders_property_id_fkey'),
      ('documents', 'documents_property_id_fkey'),
      ('payments', 'payments_property_id_fkey')
    ) as links(table_name, constraint_name)
  loop
    execute format(
      'alter table public.%I add column if not exists property_id uuid',
      property_link.table_name
    );

    if not exists (
      select 1
      from pg_constraint
      where conrelid = format('public.%I', property_link.table_name)::regclass
        and conname = property_link.constraint_name
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (property_id) references public.properties(id) on delete set null not valid',
        property_link.table_name,
        property_link.constraint_name
      );
    end if;
  end loop;
end $$;

insert into public.properties (
  company_id,
  customer_id,
  display_name,
  address,
  city,
  state,
  postal_code,
  property_type,
  occupancy,
  is_primary,
  notes,
  created_at,
  updated_at
)
select
  customer.company_id,
  customer.id,
  coalesce(nullif(customer.property_address, ''), customer.display_name),
  customer.property_address,
  customer.city,
  customer.state,
  customer.postal_code,
  case
    when customer.customer_type = 'commercial' then 'commercial'
    when customer.customer_type = 'hoa' then 'hoa'
    when customer.customer_type = 'property_manager' then 'property_management'
    else 'single_family'
  end,
  case
    when customer.customer_type = 'commercial' then 'commercial'
    when customer.customer_type = 'hoa' then 'hoa_common_area'
    else 'unknown'
  end,
  true,
  customer.notes,
  customer.created_at,
  customer.updated_at
from public.customers as customer
where customer.property_address is not null
  and customer.property_address <> ''
  and not exists (
    select 1
    from public.properties as property
    where property.company_id = customer.company_id
      and lower(trim(property.address)) = lower(trim(customer.property_address))
      and coalesce(property.postal_code, '') = coalesce(customer.postal_code, '')
  );

insert into public.properties (
  company_id,
  customer_id,
  display_name,
  address,
  city,
  state,
  postal_code,
  property_type,
  is_primary,
  notes,
  created_at,
  updated_at
)
select
  lead.company_id,
  lead.customer_id,
  lead.property_address,
  lead.property_address,
  lead.city,
  lead.state,
  lead.postal_code,
  case
    when lead.service_type = 'painting' then 'single_family'
    when lead.service_type = 'roofing' then 'single_family'
    else 'other'
  end,
  false,
  lead.notes,
  lead.created_at,
  lead.updated_at
from public.leads as lead
where lead.property_address is not null
  and lead.property_address <> ''
  and not exists (
    select 1
    from public.properties as property
    where property.company_id = lead.company_id
      and lower(trim(property.address)) = lower(trim(lead.property_address))
      and coalesce(property.postal_code, '') = coalesce(lead.postal_code, '')
  );

insert into public.properties (
  company_id,
  customer_id,
  display_name,
  address,
  property_type,
  is_primary,
  notes,
  created_at,
  updated_at
)
select
  estimate.company_id,
  estimate.customer_id,
  estimate.location,
  estimate.location,
  case when estimate.service_type = 'painting' then 'single_family' else 'single_family' end,
  false,
  estimate.notes,
  estimate.created_at,
  estimate.updated_at
from public.estimates as estimate
where estimate.location is not null
  and estimate.location <> ''
  and not exists (
    select 1
    from public.properties as property
    where property.company_id = estimate.company_id
      and lower(trim(property.address)) = lower(trim(estimate.location))
  );

insert into public.properties (
  company_id,
  customer_id,
  display_name,
  address,
  property_type,
  is_primary,
  notes,
  created_at,
  updated_at
)
select
  job.company_id,
  job.customer_id,
  coalesce(nullif(job.property_address, ''), nullif(job.address, ''), nullif(job.location, '')),
  coalesce(nullif(job.property_address, ''), nullif(job.address, ''), nullif(job.location, '')),
  case when job.service_type = 'painting' then 'single_family' else 'single_family' end,
  false,
  job.notes,
  job.created_at,
  job.updated_at
from public.jobs as job
where coalesce(nullif(job.property_address, ''), nullif(job.address, ''), nullif(job.location, '')) is not null
  and not exists (
    select 1
    from public.properties as property
    where property.company_id = job.company_id
      and lower(trim(property.address)) = lower(trim(coalesce(nullif(job.property_address, ''), nullif(job.address, ''), nullif(job.location, ''))))
  );

insert into public.properties (
  company_id,
  customer_id,
  display_name,
  address,
  property_type,
  is_primary,
  notes,
  last_inspection_at,
  created_at,
  updated_at
)
select
  inspection.company_id,
  inspection.customer_id,
  inspection.property_address,
  inspection.property_address,
  case
    when inspection.service_category like '%painting%' then 'single_family'
    when inspection.service_category like '%roof%' then 'single_family'
    else 'other'
  end,
  false,
  inspection.notes,
  coalesce(inspection.completed_at, inspection.scheduled_start, inspection.updated_at),
  inspection.created_at,
  inspection.updated_at
from public.inspections as inspection
where inspection.property_address is not null
  and inspection.property_address <> ''
  and not exists (
    select 1
    from public.properties as property
    where property.company_id = inspection.company_id
      and lower(trim(property.address)) = lower(trim(inspection.property_address))
  );

update public.properties as property
set
  customer_id = coalesce(property.customer_id, customer.id),
  city = coalesce(property.city, customer.city),
  state = coalesce(property.state, customer.state),
  postal_code = coalesce(property.postal_code, customer.postal_code),
  is_primary = property.is_primary or lower(trim(property.address)) = lower(trim(customer.property_address))
from public.customers as customer
where property.company_id = customer.company_id
  and lower(trim(property.address)) = lower(trim(customer.property_address));

update public.properties as property
set
  last_inspection_at = coalesce(
    property.last_inspection_at,
    (
      select max(coalesce(inspection.completed_at, inspection.scheduled_start, inspection.updated_at))
      from public.inspections as inspection
      where inspection.company_id = property.company_id
        and lower(trim(inspection.property_address)) = lower(trim(property.address))
    )
  )
where property.last_inspection_at is null;

update public.leads as lead
set property_id = property.id
from public.properties as property
where lead.property_id is null
  and property.company_id = lead.company_id
  and lower(trim(property.address)) = lower(trim(lead.property_address))
  and (
    lead.postal_code is null
    or property.postal_code is null
    or property.postal_code = lead.postal_code
  );

update public.estimates as estimate
set property_id = property.id
from public.properties as property
where estimate.property_id is null
  and property.company_id = estimate.company_id
  and (
    (estimate.customer_id is not null and property.customer_id = estimate.customer_id)
    or (
      estimate.location is not null
      and lower(trim(property.address)) = lower(trim(estimate.location))
    )
  );

update public.jobs as job
set property_id = property.id
from public.properties as property
where job.property_id is null
  and property.company_id = job.company_id
  and (
    (job.customer_id is not null and property.customer_id = job.customer_id)
    or lower(trim(property.address)) = lower(trim(coalesce(nullif(job.property_address, ''), nullif(job.address, ''), nullif(job.location, ''))))
  );

update public.inspections as inspection
set property_id = property.id
from public.properties as property
where inspection.property_id is null
  and property.company_id = inspection.company_id
  and (
    (inspection.customer_id is not null and property.customer_id = inspection.customer_id)
    or (
      inspection.property_address is not null
      and lower(trim(property.address)) = lower(trim(inspection.property_address))
    )
  );

update public.schedule_events as event
set property_id = property.id
from public.properties as property
where event.property_id is null
  and property.company_id = event.company_id
  and (
    (event.customer_id is not null and property.customer_id = event.customer_id)
    or (
      event.job_id is not null
      and exists (
        select 1
        from public.jobs as job
        where job.id = event.job_id
          and job.property_id = property.id
      )
    )
    or (
      event.lead_id is not null
      and exists (
        select 1
        from public.leads as lead
        where lead.id = event.lead_id
          and lead.property_id = property.id
      )
    )
    or (
      event.location is not null
      and lower(trim(property.address)) = lower(trim(event.location))
    )
  );

update public.invoices as invoice
set property_id = property.id
from public.properties as property
where invoice.property_id is null
  and property.company_id = invoice.company_id
  and (
    (invoice.customer_id is not null and property.customer_id = invoice.customer_id)
    or (
      invoice.job_id is not null
      and exists (
        select 1
        from public.jobs as job
        where job.id = invoice.job_id
          and job.property_id = property.id
      )
    )
    or (
      invoice.estimate_id is not null
      and exists (
        select 1
        from public.estimates as estimate
        where estimate.id = invoice.estimate_id
          and estimate.property_id = property.id
      )
    )
  );

update public.job_photos as photo
set property_id = property.id
from public.properties as property
where photo.property_id is null
  and property.company_id = photo.company_id
  and (
    (photo.customer_id is not null and property.customer_id = photo.customer_id)
    or (
      photo.job_id is not null
      and exists (
        select 1
        from public.jobs as job
        where job.id = photo.job_id
          and job.property_id = property.id
      )
    )
    or (
      photo.estimate_id is not null
      and exists (
        select 1
        from public.estimates as estimate
        where estimate.id = photo.estimate_id
          and estimate.property_id = property.id
      )
    )
    or (
      photo.inspection_id is not null
      and exists (
        select 1
        from public.inspections as inspection
        where inspection.id = photo.inspection_id
          and inspection.property_id = property.id
      )
    )
  );

update public.material_orders as material_order
set property_id = property.id
from public.properties as property
where material_order.property_id is null
  and property.company_id = material_order.company_id
  and (
    (
      material_order.job_id is not null
      and exists (
        select 1
        from public.jobs as job
        where job.id = material_order.job_id
          and job.property_id = property.id
      )
    )
    or (
      material_order.delivery_address is not null
      and lower(trim(property.address)) = lower(trim(material_order.delivery_address))
    )
  );

update public.change_orders as change_order
set property_id = property.id
from public.properties as property
where change_order.property_id is null
  and property.company_id = change_order.company_id
  and (
    (change_order.customer_id is not null and property.customer_id = change_order.customer_id)
    or (
      change_order.job_id is not null
      and exists (
        select 1
        from public.jobs as job
        where job.id = change_order.job_id
          and job.property_id = property.id
      )
    )
    or (
      change_order.estimate_id is not null
      and exists (
        select 1
        from public.estimates as estimate
        where estimate.id = change_order.estimate_id
          and estimate.property_id = property.id
      )
    )
  );

update public.documents as document
set property_id = property.id
from public.properties as property
where document.property_id is null
  and property.company_id = document.company_id
  and (
    (document.customer_id is not null and property.customer_id = document.customer_id)
    or (
      document.job_id is not null
      and exists (
        select 1
        from public.jobs as job
        where job.id = document.job_id
          and job.property_id = property.id
      )
    )
    or (
      document.estimate_id is not null
      and exists (
        select 1
        from public.estimates as estimate
        where estimate.id = document.estimate_id
          and estimate.property_id = property.id
      )
    )
    or (
      document.inspection_id is not null
      and exists (
        select 1
        from public.inspections as inspection
        where inspection.id = document.inspection_id
          and inspection.property_id = property.id
      )
    )
    or (
      document.property_address is not null
      and lower(trim(property.address)) = lower(trim(document.property_address))
    )
  );

update public.payments as payment
set property_id = property.id
from public.properties as property
where payment.property_id is null
  and property.company_id = payment.company_id
  and (
    (payment.customer_id is not null and property.customer_id = payment.customer_id)
    or (
      payment.invoice_id is not null
      and exists (
        select 1
        from public.invoices as invoice
        where invoice.id = payment.invoice_id
          and invoice.property_id = property.id
      )
    )
  );

alter table public.leads validate constraint leads_property_id_fkey;
alter table public.estimates validate constraint estimates_property_id_fkey;
alter table public.jobs validate constraint jobs_property_id_fkey;
alter table public.schedule_events validate constraint schedule_events_property_id_fkey;
alter table public.job_photos validate constraint job_photos_property_id_fkey;
alter table public.invoices validate constraint invoices_property_id_fkey;
alter table public.material_orders validate constraint material_orders_property_id_fkey;
alter table public.inspections validate constraint inspections_property_id_fkey;
alter table public.change_orders validate constraint change_orders_property_id_fkey;
alter table public.documents validate constraint documents_property_id_fkey;
alter table public.payments validate constraint payments_property_id_fkey;

create index if not exists leads_property_id_idx on public.leads(property_id);
create index if not exists estimates_property_id_idx on public.estimates(property_id);
create index if not exists jobs_property_id_idx on public.jobs(property_id);
create index if not exists schedule_events_property_id_idx on public.schedule_events(property_id);
create index if not exists job_photos_property_id_idx on public.job_photos(property_id);
create index if not exists invoices_property_id_idx on public.invoices(property_id);
create index if not exists material_orders_property_id_idx on public.material_orders(property_id);
create index if not exists inspections_property_id_idx on public.inspections(property_id);
create index if not exists change_orders_property_id_idx on public.change_orders(property_id);
create index if not exists documents_property_id_idx on public.documents(property_id);
create index if not exists payments_property_id_idx on public.payments(property_id);

alter table public.properties enable row level security;

revoke all on table public.properties from anon;
revoke delete on table public.properties from authenticated;
grant select, insert, update on table public.properties to authenticated;
grant select, insert, update, delete on table public.properties to service_role;

drop policy if exists "WTOS users read properties" on public.properties;
create policy "WTOS users read properties"
on public.properties for select
to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS users insert properties" on public.properties;
create policy "WTOS users insert properties"
on public.properties for insert
to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_documents(company_id)
);

drop policy if exists "WTOS users update properties" on public.properties;
create policy "WTOS users update properties"
on public.properties for update
to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_documents(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_documents(company_id)
);

commit;
