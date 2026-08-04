begin;

-- Estimate & Proposal Builder 2.0
-- Adds immutable proposal revisions, customer-visible proposal sections,
-- optional upgrades / alternatives, acceptance evidence, payment schedules, and
-- audit events without changing existing estimate records.

alter table public.documents
drop constraint if exists documents_category_check;

alter table public.documents
add constraint documents_category_check
check (
  category in (
    'proposal',
    'signed_proposal',
    'estimate',
    'scope',
    'invoice',
    'change_order',
    'contract',
    'signed_agreement',
    'completion_certificate',
    'warranty',
    'insurance',
    'permit',
    'material_order',
    'manufacturer_warranty',
    'workmanship_warranty',
    'inspection_report',
    'photo',
    'photo_set',
    'other'
  )
) not valid;

alter table public.documents validate constraint documents_category_check;

create table if not exists public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  template_key text not null,
  name text not null,
  category text not null,
  service_type text not null check (service_type in ('roofing', 'painting', 'both')),
  status text not null default 'active' check (status in ('active', 'archived')),
  is_default boolean not null default false,
  version_number integer not null default 1 check (version_number > 0),
  description text not null default '',
  default_sections jsonb not null default '[]'::jsonb,
  default_options jsonb not null default '[]'::jsonb,
  default_terms text,
  default_warranty text,
  created_by uuid references auth.users(id) on delete set null,
  last_edited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, template_key, version_number)
);

create table if not exists public.estimate_proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  template_id uuid references public.proposal_templates(id) on delete set null,
  proposal_number text not null,
  revision_number integer not null default 1 check (revision_number > 0),
  title text not null,
  status text not null default 'draft' check (
    status in (
      'draft',
      'ready_for_review',
      'approved_internally',
      'ready_to_send',
      'sent',
      'viewed',
      'changes_requested',
      'accepted',
      'declined',
      'expired',
      'superseded',
      'converted_to_job',
      'canceled'
    )
  ),
  brand_name text not null,
  brand_primary_color text,
  brand_accent_color text,
  base_subtotal numeric(12, 2) not null default 0 check (base_subtotal >= 0),
  discount_total numeric(12, 2) not null default 0 check (discount_total >= 0),
  tax_total numeric(12, 2) not null default 0 check (tax_total >= 0),
  fee_total numeric(12, 2) not null default 0 check (fee_total >= 0),
  base_total numeric(12, 2) not null default 0 check (base_total >= 0),
  selected_upgrades_total numeric(12, 2) not null default 0 check (selected_upgrades_total >= 0),
  accepted_total numeric(12, 2) not null default 0 check (accepted_total >= 0),
  deposit_type text not null default 'none' check (
    deposit_type in ('none', 'fixed', 'percent', 'custom_schedule')
  ),
  deposit_value numeric(12, 3) not null default 0 check (deposit_value >= 0),
  deposit_required boolean not null default false,
  deposit_due_date date,
  deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  deposit_paid numeric(12, 2) not null default 0 check (deposit_paid >= 0),
  remaining_balance numeric(12, 2) not null default 0 check (remaining_balance >= 0),
  requires_signature boolean not null default true,
  requires_deposit_before_job boolean not null default false,
  signature_status text not null default 'not_configured' check (
    signature_status in (
      'not_configured',
      'sending_disabled',
      'ready_for_sandbox_testing',
      'awaiting_signature',
      'signed',
      'declined',
      'expired',
      'failed'
    )
  ),
  payment_status text not null default 'online_payments_disabled' check (
    payment_status in (
      'online_payments_disabled',
      'provider_not_configured',
      'deposit_required',
      'pending',
      'processing',
      'received',
      'failed',
      'refunded',
      'partially_refunded',
      'paid_in_full',
      'past_due'
    )
  ),
  quickbooks_sync_status text not null default 'production_disabled' check (
    quickbooks_sync_status in (
      'not_configured',
      'ready',
      'production_disabled',
      'exported',
      'sync_failed'
    )
  ),
  customer_visible_notes text,
  internal_notes text,
  terms text,
  acceptance_required boolean not null default true,
  sent_at timestamptz,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  expires_at timestamptz,
  superseded_at timestamptz,
  immutable_after_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  source_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (estimate_id, revision_number),
  unique (company_id, proposal_number, revision_number),
  check (accepted_total >= base_total),
  check (deposit_paid <= accepted_total),
  check (
    status not in ('sent', 'viewed', 'accepted', 'declined', 'superseded', 'converted_to_job')
    or immutable_after_at is not null
  )
);

create table if not exists public.estimate_proposal_sections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  proposal_revision_id uuid not null references public.estimate_proposal_revisions(id) on delete cascade,
  section_key text not null,
  title text not null,
  section_type text not null default 'scope' check (
    section_type in (
      'cover',
      'customer',
      'property',
      'overview',
      'inspection_summary',
      'findings',
      'recommended_solution',
      'scope',
      'line_items',
      'base_proposal',
      'optional_upgrades',
      'alternatives',
      'allowances',
      'materials',
      'photos',
      'warranty',
      'exclusions',
      'payment_schedule',
      'financing',
      'terms',
      'customer_notes',
      'signature_acceptance',
      'attachments',
      'custom'
    )
  ),
  body text not null default '',
  customer_visible boolean not null default true,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  source_type text,
  source_record_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (proposal_revision_id, section_key, sort_order)
);

create table if not exists public.estimate_proposal_options (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  proposal_revision_id uuid not null references public.estimate_proposal_revisions(id) on delete cascade,
  option_type text not null check (
    option_type in (
      'add_on_upgrade',
      'replacement_alternative',
      'required_choice',
      'optional_choice'
    )
  ),
  option_group_key text,
  name text not null,
  description text,
  quantity numeric(12, 3) not null default 1 check (quantity >= 0),
  unit text not null default 'each',
  price numeric(12, 2) not null default 0 check (price >= 0),
  price_effect_type text not null default 'additive' check (
    price_effect_type in ('additive', 'replace_base_amount', 'full_alternate_total')
  ),
  base_replacement_amount numeric(12, 2) not null default 0 check (base_replacement_amount >= 0),
  customer_visible boolean not null default true,
  selected boolean not null default false,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz,
  required boolean not null default false,
  recommended boolean not null default false,
  best_value boolean not null default false,
  dependency_option_id uuid references public.estimate_proposal_options(id) on delete set null,
  conflicting_option_id uuid references public.estimate_proposal_options(id) on delete set null,
  warranty_effect text,
  scope_details text,
  customer_notes text,
  internal_notes text,
  source_line_item_id uuid references public.estimate_line_items(id) on delete set null,
  source_finding_id text,
  source_photo_id uuid references public.job_photos(id) on delete set null,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.estimate_proposal_acceptances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  proposal_revision_id uuid not null references public.estimate_proposal_revisions(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  signer_name text not null,
  signer_email text,
  accepted_total numeric(12, 2) not null check (accepted_total >= 0),
  selected_option_ids uuid[] not null default '{}',
  terms_accepted boolean not null default false,
  acceptance_method text not null check (
    acceptance_method in ('internal_recorded', 'customer_portal', 'signature_provider')
  ),
  signature_status text not null default 'not_configured' check (
    signature_status in ('not_configured', 'awaiting_signature', 'signed', 'declined', 'expired', 'failed')
  ),
  ip_hash text,
  user_agent text,
  audit_metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (proposal_revision_id),
  check (terms_accepted)
);

create table if not exists public.proposal_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  proposal_revision_id uuid not null references public.estimate_proposal_revisions(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  milestone_name text not null,
  schedule_type text not null check (
    schedule_type in ('deposit', 'progress', 'final', 'change_order', 'custom')
  ),
  amount_type text not null check (amount_type in ('fixed', 'percent', 'balance')),
  amount_value numeric(12, 3) not null default 0 check (amount_value >= 0),
  calculated_amount numeric(12, 2) not null default 0 check (calculated_amount >= 0),
  due_trigger text not null default 'upon_acceptance' check (
    due_trigger in ('upon_acceptance', 'specific_date', 'production_start', 'progress_milestone', 'completion', 'custom')
  ),
  due_date date,
  status text not null default 'pending' check (
    status in ('pending', 'invoice_created', 'paid', 'waived', 'blocked')
  ),
  sort_order integer not null default 0,
  customer_visible boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposal_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  proposal_revision_id uuid references public.estimate_proposal_revisions(id) on delete cascade,
  estimate_id uuid references public.estimates(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  event_type text not null,
  actor_type text not null default 'internal' check (
    actor_type in ('internal', 'customer', 'provider', 'system')
  ),
  actor_id uuid references auth.users(id) on delete set null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (company_id, event_type, idempotency_key)
);

create index if not exists proposal_templates_company_id_idx on public.proposal_templates(company_id);
create index if not exists proposal_templates_status_idx on public.proposal_templates(status);
create index if not exists estimate_proposal_revisions_company_id_idx on public.estimate_proposal_revisions(company_id);
create index if not exists estimate_proposal_revisions_estimate_id_idx on public.estimate_proposal_revisions(estimate_id);
create index if not exists estimate_proposal_revisions_customer_id_idx on public.estimate_proposal_revisions(customer_id);
create index if not exists estimate_proposal_revisions_status_idx on public.estimate_proposal_revisions(status);
create index if not exists estimate_proposal_sections_revision_id_idx on public.estimate_proposal_sections(proposal_revision_id);
create index if not exists estimate_proposal_options_revision_id_idx on public.estimate_proposal_options(proposal_revision_id);
create index if not exists estimate_proposal_options_group_idx on public.estimate_proposal_options(proposal_revision_id, option_group_key);
create index if not exists estimate_proposal_acceptances_company_id_idx on public.estimate_proposal_acceptances(company_id);
create index if not exists estimate_proposal_acceptances_estimate_id_idx on public.estimate_proposal_acceptances(estimate_id);
create index if not exists proposal_payment_schedules_revision_id_idx on public.proposal_payment_schedules(proposal_revision_id);
create index if not exists proposal_payment_schedules_invoice_id_idx on public.proposal_payment_schedules(invoice_id);
create index if not exists proposal_audit_events_company_id_idx on public.proposal_audit_events(company_id);
create index if not exists proposal_audit_events_revision_id_idx on public.proposal_audit_events(proposal_revision_id);
create index if not exists proposal_audit_events_estimate_id_idx on public.proposal_audit_events(estimate_id);

drop trigger if exists set_proposal_templates_updated_at on public.proposal_templates;
create trigger set_proposal_templates_updated_at
before update on public.proposal_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_estimate_proposal_revisions_updated_at on public.estimate_proposal_revisions;
create trigger set_estimate_proposal_revisions_updated_at
before update on public.estimate_proposal_revisions
for each row execute function public.set_updated_at();

drop trigger if exists set_estimate_proposal_sections_updated_at on public.estimate_proposal_sections;
create trigger set_estimate_proposal_sections_updated_at
before update on public.estimate_proposal_sections
for each row execute function public.set_updated_at();

drop trigger if exists set_estimate_proposal_options_updated_at on public.estimate_proposal_options;
create trigger set_estimate_proposal_options_updated_at
before update on public.estimate_proposal_options
for each row execute function public.set_updated_at();

drop trigger if exists set_proposal_payment_schedules_updated_at on public.proposal_payment_schedules;
create trigger set_proposal_payment_schedules_updated_at
before update on public.proposal_payment_schedules
for each row execute function public.set_updated_at();

alter table public.proposal_templates enable row level security;
alter table public.estimate_proposal_revisions enable row level security;
alter table public.estimate_proposal_sections enable row level security;
alter table public.estimate_proposal_options enable row level security;
alter table public.estimate_proposal_acceptances enable row level security;
alter table public.proposal_payment_schedules enable row level security;
alter table public.proposal_audit_events enable row level security;

drop policy if exists "WTOS users read proposal templates" on public.proposal_templates;
create policy "WTOS users read proposal templates"
on public.proposal_templates for select to authenticated
using (company_id is null or public.wtos_can_read_company(company_id));

drop policy if exists "WTOS admins insert proposal templates" on public.proposal_templates;
create policy "WTOS admins insert proposal templates"
on public.proposal_templates for insert to authenticated
with check (
  (company_id is null and public.wtos_has_global_role(array['owner', 'admin']))
  or public.wtos_can_manage_settings(company_id)
);

drop policy if exists "WTOS admins update proposal templates" on public.proposal_templates;
create policy "WTOS admins update proposal templates"
on public.proposal_templates for update to authenticated
using (
  (company_id is null and public.wtos_has_global_role(array['owner', 'admin']))
  or public.wtos_can_manage_settings(company_id)
)
with check (
  (company_id is null and public.wtos_has_global_role(array['owner', 'admin']))
  or public.wtos_can_manage_settings(company_id)
);

drop policy if exists "WTOS users read proposal revisions" on public.estimate_proposal_revisions;
create policy "WTOS users read proposal revisions"
on public.estimate_proposal_revisions for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS sales insert proposal revisions" on public.estimate_proposal_revisions;
create policy "WTOS sales insert proposal revisions"
on public.estimate_proposal_revisions for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

drop policy if exists "WTOS sales update proposal revisions" on public.estimate_proposal_revisions;
create policy "WTOS sales update proposal revisions"
on public.estimate_proposal_revisions for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

drop policy if exists "WTOS users read proposal sections" on public.estimate_proposal_sections;
create policy "WTOS users read proposal sections"
on public.estimate_proposal_sections for select to authenticated
using (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_sections.proposal_revision_id
      and revision.company_id = estimate_proposal_sections.company_id
      and public.wtos_can_read_company(revision.company_id)
  )
);

drop policy if exists "WTOS sales insert proposal sections" on public.estimate_proposal_sections;
create policy "WTOS sales insert proposal sections"
on public.estimate_proposal_sections for insert to authenticated
with check (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_sections.proposal_revision_id
      and revision.company_id = estimate_proposal_sections.company_id
      and public.wtos_can_manage_sales(revision.company_id)
  )
);

drop policy if exists "WTOS sales update proposal sections" on public.estimate_proposal_sections;
create policy "WTOS sales update proposal sections"
on public.estimate_proposal_sections for update to authenticated
using (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_sections.proposal_revision_id
      and revision.company_id = estimate_proposal_sections.company_id
      and public.wtos_can_manage_sales(revision.company_id)
  )
)
with check (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_sections.proposal_revision_id
      and revision.company_id = estimate_proposal_sections.company_id
      and public.wtos_can_manage_sales(revision.company_id)
  )
);

drop policy if exists "WTOS users read proposal options" on public.estimate_proposal_options;
create policy "WTOS users read proposal options"
on public.estimate_proposal_options for select to authenticated
using (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_options.proposal_revision_id
      and revision.company_id = estimate_proposal_options.company_id
      and public.wtos_can_read_company(revision.company_id)
  )
);

drop policy if exists "WTOS sales insert proposal options" on public.estimate_proposal_options;
create policy "WTOS sales insert proposal options"
on public.estimate_proposal_options for insert to authenticated
with check (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_options.proposal_revision_id
      and revision.company_id = estimate_proposal_options.company_id
      and public.wtos_can_manage_sales(revision.company_id)
  )
);

drop policy if exists "WTOS sales update proposal options" on public.estimate_proposal_options;
create policy "WTOS sales update proposal options"
on public.estimate_proposal_options for update to authenticated
using (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_options.proposal_revision_id
      and revision.company_id = estimate_proposal_options.company_id
      and public.wtos_can_manage_sales(revision.company_id)
  )
)
with check (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = estimate_proposal_options.proposal_revision_id
      and revision.company_id = estimate_proposal_options.company_id
      and public.wtos_can_manage_sales(revision.company_id)
  )
);

drop policy if exists "WTOS users read proposal acceptances" on public.estimate_proposal_acceptances;
create policy "WTOS users read proposal acceptances"
on public.estimate_proposal_acceptances for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS sales insert proposal acceptances" on public.estimate_proposal_acceptances;
create policy "WTOS sales insert proposal acceptances"
on public.estimate_proposal_acceptances for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

drop policy if exists "WTOS users read proposal payment schedules" on public.proposal_payment_schedules;
create policy "WTOS users read proposal payment schedules"
on public.proposal_payment_schedules for select to authenticated
using (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = proposal_payment_schedules.proposal_revision_id
      and revision.company_id = proposal_payment_schedules.company_id
      and public.wtos_can_read_company(revision.company_id)
  )
);

drop policy if exists "WTOS financial insert proposal payment schedules" on public.proposal_payment_schedules;
create policy "WTOS financial insert proposal payment schedules"
on public.proposal_payment_schedules for insert to authenticated
with check (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = proposal_payment_schedules.proposal_revision_id
      and revision.company_id = proposal_payment_schedules.company_id
      and (
        public.wtos_can_manage_financials(revision.company_id)
        or public.wtos_can_manage_sales(revision.company_id)
      )
  )
);

drop policy if exists "WTOS financial update proposal payment schedules" on public.proposal_payment_schedules;
create policy "WTOS financial update proposal payment schedules"
on public.proposal_payment_schedules for update to authenticated
using (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = proposal_payment_schedules.proposal_revision_id
      and revision.company_id = proposal_payment_schedules.company_id
      and (
        public.wtos_can_manage_financials(revision.company_id)
        or public.wtos_can_manage_sales(revision.company_id)
      )
  )
)
with check (
  exists (
    select 1
    from public.estimate_proposal_revisions as revision
    where revision.id = proposal_payment_schedules.proposal_revision_id
      and revision.company_id = proposal_payment_schedules.company_id
      and (
        public.wtos_can_manage_financials(revision.company_id)
        or public.wtos_can_manage_sales(revision.company_id)
      )
  )
);

drop policy if exists "WTOS users read proposal audit events" on public.proposal_audit_events;
create policy "WTOS users read proposal audit events"
on public.proposal_audit_events for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS users insert proposal audit events" on public.proposal_audit_events;
create policy "WTOS users insert proposal audit events"
on public.proposal_audit_events for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_financials(company_id)
);

grant select, insert, update on
  public.proposal_templates,
  public.estimate_proposal_revisions,
  public.estimate_proposal_sections,
  public.estimate_proposal_options,
  public.estimate_proposal_acceptances,
  public.proposal_payment_schedules,
  public.proposal_audit_events
to authenticated;

revoke delete on
  public.proposal_templates,
  public.estimate_proposal_revisions,
  public.estimate_proposal_sections,
  public.estimate_proposal_options,
  public.estimate_proposal_acceptances,
  public.proposal_payment_schedules,
  public.proposal_audit_events
from authenticated;

grant select, insert, update, delete on
  public.proposal_templates,
  public.estimate_proposal_revisions,
  public.estimate_proposal_sections,
  public.estimate_proposal_options,
  public.estimate_proposal_acceptances,
  public.proposal_payment_schedules,
  public.proposal_audit_events
to service_role;

with weathertech_company as (
  select id
  from public.companies
  where name = 'WeatherTech Roofing LLC'
  order by created_at asc
  limit 1
)
insert into public.proposal_templates (
  company_id,
  template_key,
  name,
  category,
  service_type,
  status,
  is_default,
  version_number,
  description,
  default_sections,
  default_options,
  default_terms,
  default_warranty
)
select
  weathertech_company.id,
  template.template_key,
  template.name,
  template.category,
  'roofing',
  'active',
  template.is_default,
  1,
  template.description,
  template.default_sections::jsonb,
  template.default_options::jsonb,
  template.default_terms,
  template.default_warranty
from weathertech_company
cross join (
  values
    (
      'weathertech_tile_roof_replacement',
      'Tile roof replacement proposal',
      'tile_roof_replacement',
      true,
      'Tile roof replacement proposal with underlayment, flashing, material selection, warranty, and optional upgrades.',
      '[
        {"key":"overview","title":"Project overview","type":"overview","required":true},
        {"key":"scope","title":"Scope of work","type":"scope","required":true},
        {"key":"materials","title":"Roof system and materials","type":"materials","required":true},
        {"key":"warranty","title":"Warranty","type":"warranty","required":true},
        {"key":"terms","title":"Terms and acceptance","type":"terms","required":true}
      ]',
      '[
        {"name":"Premium underlayment upgrade","type":"add_on_upgrade","unit":"roof","price":0,"recommended":true},
        {"name":"Extended workmanship warranty","type":"add_on_upgrade","unit":"project","price":0},
        {"name":"Skylight replacement allowance","type":"add_on_upgrade","unit":"each","price":0}
      ]',
      'Proposal is valid through the expiration date. Hidden decking, structural repairs, and owner-requested changes require approved change order.',
      'Workmanship warranty applies only to the approved roof replacement scope and documented work areas.'
    ),
    (
      'weathertech_leak_repair',
      'Leak repair proposal',
      'leak_repair',
      false,
      'Targeted repair proposal with finding summary, repair limitations, photo evidence, and optional warranty choices.',
      '[
        {"key":"findings","title":"Inspection findings","type":"findings","required":true},
        {"key":"scope","title":"Repair scope","type":"scope","required":true},
        {"key":"photos","title":"Photos","type":"photos","required":false},
        {"key":"exclusions","title":"Repair exclusions","type":"exclusions","required":true}
      ]',
      '[
        {"name":"Additional roof ventilation","type":"add_on_upgrade","unit":"each","price":0},
        {"name":"Bird stop repair","type":"add_on_upgrade","unit":"linear foot","price":0},
        {"name":"Wood replacement allowance","type":"add_on_upgrade","unit":"allowance","price":0}
      ]',
      'Repair proposals cover only the documented repair area unless additional work is approved in writing.',
      'Targeted repair warranty does not imply whole-roof coverage.'
    )
) as template(
  template_key,
  name,
  category,
  is_default,
  description,
  default_sections,
  default_options,
  default_terms,
  default_warranty
)
on conflict (company_id, template_key, version_number) do nothing;

with ihc_company as (
  select id
  from public.companies
  where name = 'IHC Painting'
  order by created_at asc
  limit 1
)
insert into public.proposal_templates (
  company_id,
  template_key,
  name,
  category,
  service_type,
  status,
  is_default,
  version_number,
  description,
  default_sections,
  default_options,
  default_terms,
  default_warranty
)
select
  ihc_company.id,
  template.template_key,
  template.name,
  template.category,
  'painting',
  'active',
  template.is_default,
  1,
  template.description,
  template.default_sections::jsonb,
  template.default_options::jsonb,
  template.default_terms,
  template.default_warranty
from ihc_company
cross join (
  values
    (
      'ihc_exterior_painting',
      'Exterior painting proposal',
      'exterior_painting',
      true,
      'Exterior painting proposal with prep, masking, coatings, color approvals, warranty, and optional upgrades.',
      '[
        {"key":"overview","title":"Project overview","type":"overview","required":true},
        {"key":"prep","title":"Preparation and repairs","type":"scope","required":true},
        {"key":"materials","title":"Paint system and colors","type":"materials","required":true},
        {"key":"walkthrough","title":"Final walkthrough","type":"signature_acceptance","required":true}
      ]',
      '[
        {"name":"Premium paint upgrade","type":"add_on_upgrade","unit":"project","price":0,"recommended":true},
        {"name":"Elastomeric coating upgrade","type":"replacement_alternative","unit":"project","price":0},
        {"name":"Additional stucco repair allowance","type":"add_on_upgrade","unit":"allowance","price":0}
      ]',
      'Color selections and surface repairs must be approved before production scheduling. Additional repair areas require approved change order.',
      'Workmanship warranty applies only to approved painted surfaces and documented prep level.'
    ),
    (
      'ihc_interior_painting',
      'Interior painting proposal',
      'interior_painting',
      false,
      'Interior painting proposal with room protection, finish selections, schedule coordination, and optional upgrades.',
      '[
        {"key":"overview","title":"Project overview","type":"overview","required":true},
        {"key":"rooms","title":"Rooms and surfaces","type":"scope","required":true},
        {"key":"materials","title":"Paint system and finishes","type":"materials","required":true},
        {"key":"terms","title":"Terms and acceptance","type":"terms","required":true}
      ]',
      '[
        {"name":"Premium primer","type":"add_on_upgrade","unit":"project","price":0},
        {"name":"Door or cabinet painting","type":"add_on_upgrade","unit":"each","price":0},
        {"name":"Additional drywall repair allowance","type":"add_on_upgrade","unit":"allowance","price":0}
      ]',
      'Furniture moving, major drywall repairs, and color changes after approval require written approval.',
      'Warranty applies only to listed interior surfaces and approved finish system.'
    )
) as template(
  template_key,
  name,
  category,
  is_default,
  description,
  default_sections,
  default_options,
  default_terms,
  default_warranty
)
on conflict (company_id, template_key, version_number) do nothing;

commit;
