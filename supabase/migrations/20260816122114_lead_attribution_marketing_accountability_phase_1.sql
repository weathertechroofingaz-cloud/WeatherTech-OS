begin;

-- Lead Attribution & Marketing Accountability Phase 1
--
-- This migration is intentionally additive. It creates no campaign or spend
-- rows and does not backfill the existing leads. Future lead inserts receive
-- an explicit unknown/unattributed accountability row until deterministic
-- evidence or an authorized review establishes first-touch attribution.

create extension if not exists pgcrypto;

create unique index if not exists leads_company_id_id_uidx
on public.leads(company_id, id);

create unique index if not exists lead_intake_records_company_id_id_uidx
on public.lead_intake_records(company_id, id);

-- NOT VALID avoids scanning or rewriting existing business rows while still
-- refusing non-finite values on every future insert or update.
alter table public.leads
add constraint leads_estimated_value_not_nan_check
check (estimated_value <> 'NaN'::numeric)
not valid;

alter table public.estimate_proposal_acceptances
add constraint estimate_proposal_acceptances_accepted_total_not_nan_check
check (accepted_total <> 'NaN'::numeric)
not valid;

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_key text not null check (
    source_key in (
      'website',
      'google',
      'yelp',
      'phone',
      'email',
      'referral',
      'repeat_customer',
      'manual',
      'other'
    )
  ),
  source_detail text,
  intake_provider text,
  vendor_key text,
  vendor_name text,
  campaign_key text not null,
  campaign_name text not null,
  external_campaign_id text,
  starts_on date,
  ends_on date,
  is_active boolean not null default true,
  record_version integer not null default 1 check (record_version > 0),
  last_operation_key text not null,
  last_request_fingerprint text not null check (
    last_request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_source_detail_check check (
    (source_detail is null or source_detail ~ '^[a-z0-9][a-z0-9_-]{0,159}$')
    and (source_key <> 'other' or source_detail is not null)
  ),
  constraint marketing_campaigns_intake_provider_check check (
    intake_provider is null
    or intake_provider ~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  ),
  constraint marketing_campaigns_vendor_key_check check (
    vendor_key is null
    or vendor_key ~ '^[a-z0-9][a-z0-9_-]{0,119}$'
  ),
  constraint marketing_campaigns_vendor_name_check check (
    vendor_name is null
    or length(btrim(vendor_name)) between 1 and 200
  ),
  constraint marketing_campaigns_vendor_consistency_check check (
    (vendor_key is null and vendor_name is null)
    or (vendor_key is not null and vendor_name is not null)
  ),
  constraint marketing_campaigns_campaign_key_check check (
    campaign_key ~ '^[a-z0-9][a-z0-9_-]{0,159}$'
  ),
  constraint marketing_campaigns_campaign_name_check check (
    length(btrim(campaign_name)) between 1 and 240
  ),
  constraint marketing_campaigns_external_campaign_id_check check (
    external_campaign_id is null
    or length(btrim(external_campaign_id)) between 1 and 240
  ),
  constraint marketing_campaigns_external_provider_check check (
    external_campaign_id is null or intake_provider is not null
  ),
  constraint marketing_campaigns_date_range_check check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  ),
  constraint marketing_campaigns_operation_key_check check (
    last_operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  unique (company_id, campaign_key),
  unique (id, company_id),
  unique (company_id, last_operation_key)
);

create unique index marketing_campaigns_external_identity_uidx
on public.marketing_campaigns(company_id, intake_provider, external_campaign_id)
where external_campaign_id is not null;

create index marketing_campaigns_company_source_idx
on public.marketing_campaigns(company_id, source_key, is_active, starts_on, ends_on);

create index marketing_campaigns_created_by_idx
on public.marketing_campaigns(created_by)
where created_by is not null;

create index marketing_campaigns_updated_by_idx
on public.marketing_campaigns(updated_by)
where updated_by is not null;

create table public.lead_accountability (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  lead_id uuid not null,
  source_key text not null default 'unknown' check (
    source_key in (
      'website',
      'google',
      'yelp',
      'phone',
      'email',
      'referral',
      'repeat_customer',
      'manual',
      'other',
      'unknown'
    )
  ),
  source_detail text,
  intake_provider text,
  campaign_id uuid,
  intake_record_id uuid,
  attribution_model text not null default 'first_touch' check (
    attribution_model = 'first_touch'
  ),
  received_at timestamptz not null default now(),
  evidence_kind text not null default 'insufficient' check (
    evidence_kind in (
      'provider_verified',
      'provider_metadata',
      'staff_selected',
      'customer_stated',
      'repeat_customer',
      'insufficient'
    )
  ),
  review_status text not null default 'unattributed' check (
    review_status in ('verified', 'needs_review', 'unattributed')
  ),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  attribution_locked_at timestamptz,
  owner_user_id uuid references auth.users(id) on delete restrict,
  owner_assigned_at timestamptz,
  first_response_at timestamptz,
  first_response_channel text check (
    first_response_channel is null
    or first_response_channel in ('phone', 'sms', 'email', 'in_person', 'other')
  ),
  outcome text not null default 'open' check (outcome in ('open', 'won', 'lost')),
  outcome_at timestamptz,
  lost_reason_code text check (
    lost_reason_code is null
    or lost_reason_code in (
      'price',
      'no_response',
      'chose_competitor',
      'postponed',
      'not_qualified',
      'outside_service_area',
      'insurance_denied',
      'scope_mismatch',
      'duplicate',
      'other'
    )
  ),
  lost_reason_notes text,
  won_contract_value numeric(14, 2),
  won_value_basis text check (
    won_value_basis is null
    or won_value_basis in (
      'accepted_proposal',
      'signed_proposal',
      'approved_contract_total'
    )
  ),
  record_version integer not null default 1 check (record_version > 0),
  last_operation_key text not null,
  last_request_fingerprint text not null check (
    last_request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_accountability_lead_company_fkey
    foreign key (company_id, lead_id)
    references public.leads(company_id, id)
    on delete restrict,
  constraint lead_accountability_campaign_company_fkey
    foreign key (campaign_id, company_id)
    references public.marketing_campaigns(id, company_id)
    on delete restrict,
  constraint lead_accountability_intake_company_fkey
    foreign key (company_id, intake_record_id)
    references public.lead_intake_records(company_id, id)
    on delete restrict,
  constraint lead_accountability_source_detail_check check (
    (source_detail is null or source_detail ~ '^[a-z0-9][a-z0-9_-]{0,159}$')
    and (source_key <> 'other' or source_detail is not null)
  ),
  constraint lead_accountability_intake_provider_check check (
    intake_provider is null
    or intake_provider ~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  ),
  constraint lead_accountability_operation_key_check check (
    last_operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or last_operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:lead_created$'
    or last_operation_key ~* '^lead_created:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or last_operation_key ~* '^intake_attribution:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or last_operation_key ~* '^workflow:schedule_events:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:appointment_scheduled$'
    or last_operation_key ~* '^workflow:inspections:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:inspection_completed$'
    or last_operation_key ~* '^workflow:estimates:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:estimate_sent$'
    or last_operation_key ~* '^workflow:estimate_proposal_acceptances:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:won$'
  ),
  constraint lead_accountability_review_consistency_check check (
    (
      source_key = 'unknown'
      and review_status in ('needs_review', 'unattributed')
      and attribution_locked_at is null
    )
    or (
      source_key <> 'unknown'
      and review_status = 'verified'
      and evidence_kind <> 'insufficient'
      and attribution_locked_at is not null
    )
  ),
  constraint lead_accountability_owner_consistency_check check (
    (owner_user_id is null and owner_assigned_at is null)
    or (owner_user_id is not null and owner_assigned_at is not null)
  ),
  constraint lead_accountability_first_response_consistency_check check (
    (first_response_at is null and first_response_channel is null)
    or (first_response_at is not null and first_response_channel is not null)
  ),
  constraint lead_accountability_outcome_consistency_check check (
    (
      outcome = 'open'
      and outcome_at is null
      and lost_reason_code is null
      and lost_reason_notes is null
      and won_contract_value is null
      and won_value_basis is null
    )
    or (
      outcome = 'lost'
      and outcome_at is not null
      and lost_reason_code is not null
      and won_contract_value is null
      and won_value_basis is null
      and (
        lost_reason_code <> 'other'
        or length(btrim(coalesce(lost_reason_notes, ''))) > 0
      )
    )
    or (
      outcome = 'won'
      and outcome_at is not null
      and lost_reason_code is null
      and lost_reason_notes is null
      and won_contract_value is not null
      and won_contract_value <> 'NaN'::numeric
      and won_contract_value > 0
      and won_value_basis is not null
    )
  ),
  constraint lead_accountability_lost_reason_notes_check check (
    lost_reason_notes is null or length(lost_reason_notes) <= 2000
  ),
  unique (lead_id),
  unique (id, company_id, lead_id),
  unique (company_id, last_operation_key)
);

create index lead_accountability_company_received_idx
on public.lead_accountability(company_id, received_at desc);

create index lead_accountability_company_source_idx
on public.lead_accountability(company_id, source_key, received_at desc);

create index lead_accountability_awaiting_contact_idx
on public.lead_accountability(company_id, received_at desc)
where outcome = 'open' and first_response_at is null;

create index lead_accountability_owner_idx
on public.lead_accountability(company_id, owner_user_id, outcome)
where owner_user_id is not null;

create index lead_accountability_owner_user_id_idx
on public.lead_accountability(owner_user_id)
where owner_user_id is not null;

create index lead_accountability_campaign_id_idx
on public.lead_accountability(campaign_id)
where campaign_id is not null;

create index lead_accountability_intake_record_id_idx
on public.lead_accountability(intake_record_id)
where intake_record_id is not null;

create index lead_accountability_reviewed_by_idx
on public.lead_accountability(reviewed_by)
where reviewed_by is not null;

create table public.lead_accountability_events (
  id uuid primary key default gen_random_uuid(),
  lead_accountability_id uuid not null,
  company_id uuid not null references public.companies(id) on delete restrict,
  lead_id uuid not null,
  event_type text not null check (
    event_type in (
      'lead_created',
      'attribution_reviewed',
      'owner_assigned',
      'contacted',
      'appointment_scheduled',
      'inspection_completed',
      'estimate_sent',
      'won',
      'lost'
    )
  ),
  operation_key text not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_kind text not null check (actor_kind in ('user', 'provider', 'system')),
  reason_code text,
  source_key text check (
    source_key is null
    or source_key in (
      'website',
      'google',
      'yelp',
      'phone',
      'email',
      'referral',
      'repeat_customer',
      'manual',
      'other',
      'unknown'
    )
  ),
  source_detail text,
  intake_provider text,
  campaign_id uuid,
  owner_user_id uuid references auth.users(id) on delete restrict,
  first_response_channel text check (
    first_response_channel is null
    or first_response_channel in ('phone', 'sms', 'email', 'in_person', 'other')
  ),
  linked_table text check (
    linked_table is null
    or linked_table in (
      'leads',
      'lead_intake_records',
      'schedule_events',
      'inspections',
      'estimates',
      'estimate_proposal_acceptances'
    )
  ),
  linked_record_id uuid,
  outcome text check (outcome is null or outcome in ('open', 'won', 'lost')),
  lost_reason_code text check (
    lost_reason_code is null
    or lost_reason_code in (
      'price',
      'no_response',
      'chose_competitor',
      'postponed',
      'not_qualified',
      'outside_service_area',
      'insurance_denied',
      'scope_mismatch',
      'duplicate',
      'other'
    )
  ),
  won_contract_value numeric(14, 2) check (
    won_contract_value is null
    or (
      won_contract_value <> 'NaN'::numeric
      and won_contract_value > 0
    )
  ),
  won_value_basis text check (
    won_value_basis is null
    or won_value_basis in (
      'accepted_proposal',
      'signed_proposal',
      'approved_contract_total'
    )
  ),
  occurred_at timestamptz not null,
  resulting_record_version integer not null check (resulting_record_version > 0),
  created_at timestamptz not null default now(),
  constraint lead_accountability_events_accountability_scope_fkey
    foreign key (lead_accountability_id, company_id, lead_id)
    references public.lead_accountability(id, company_id, lead_id)
    on delete restrict,
  constraint lead_accountability_events_campaign_company_fkey
    foreign key (campaign_id, company_id)
    references public.marketing_campaigns(id, company_id)
    on delete restrict,
  constraint lead_accountability_events_operation_key_check check (
    operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:lead_created$'
    or operation_key ~* '^lead_created:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or operation_key ~* '^intake_attribution:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or operation_key ~* '^workflow:schedule_events:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:appointment_scheduled$'
    or operation_key ~* '^workflow:inspections:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:inspection_completed$'
    or operation_key ~* '^workflow:estimates:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:estimate_sent$'
    or operation_key ~* '^workflow:estimate_proposal_acceptances:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:won$'
  ),
  constraint lead_accountability_events_source_detail_check check (
    (source_detail is null or source_detail ~ '^[a-z0-9][a-z0-9_-]{0,159}$')
    and (source_key <> 'other' or source_detail is not null)
  ),
  constraint lead_accountability_events_intake_provider_check check (
    intake_provider is null
    or intake_provider ~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  ),
  constraint lead_accountability_events_reason_code_check check (
    reason_code is null
    or reason_code in (
      'initial_review',
      'provider_evidence',
      'staff_correction',
      'campaign_correction',
      'unknown_confirmed',
      'workflow_record',
      'manual_action',
      'repeat_customer'
    )
  ),
  constraint lead_accountability_events_outcome_consistency_check check (
    (
      event_type = 'won'
      and outcome is not distinct from 'won'
      and lost_reason_code is null
      and won_contract_value is not null
      and won_contract_value <> 'NaN'::numeric
      and won_contract_value > 0
      and won_value_basis is not null
    )
    or (
      event_type = 'lost'
      and outcome is not distinct from 'lost'
      and lost_reason_code is not null
      and won_contract_value is null
      and won_value_basis is null
    )
    or (
      event_type = 'lead_created'
      and outcome is not distinct from 'open'
      and lost_reason_code is null
      and won_contract_value is null
      and won_value_basis is null
    )
    or (
      event_type not in ('won', 'lost', 'lead_created')
      and outcome is null
      and lost_reason_code is null
      and won_contract_value is null
      and won_value_basis is null
    )
  ),
  constraint lead_accountability_events_link_consistency_check check (
    (linked_table is null and linked_record_id is null)
    or (linked_table is not null and linked_record_id is not null)
  ),
  unique (company_id, operation_key)
);

create index lead_accountability_events_lead_timeline_idx
on public.lead_accountability_events(company_id, lead_id, occurred_at, created_at);

create index lead_accountability_events_type_idx
on public.lead_accountability_events(company_id, event_type, occurred_at);

create index lead_accountability_events_accountability_id_idx
on public.lead_accountability_events(lead_accountability_id);

create index lead_accountability_events_campaign_id_idx
on public.lead_accountability_events(campaign_id)
where campaign_id is not null;

create index lead_accountability_events_actor_user_id_idx
on public.lead_accountability_events(actor_user_id)
where actor_user_id is not null;

create index lead_accountability_events_owner_user_id_idx
on public.lead_accountability_events(owner_user_id)
where owner_user_id is not null;

create unique index lead_accountability_events_workflow_evidence_uidx
on public.lead_accountability_events(
  lead_accountability_id,
  event_type,
  linked_table,
  linked_record_id
)
where linked_record_id is not null
  and event_type in (
    'appointment_scheduled',
    'inspection_completed',
    'estimate_sent',
    'won'
  );

create table public.marketing_spend_months (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  spend_month date not null,
  source_key text not null check (
    source_key in (
      'website',
      'google',
      'yelp',
      'phone',
      'email',
      'referral',
      'repeat_customer',
      'manual',
      'other'
    )
  ),
  source_detail text,
  vendor_key text,
  vendor_name text,
  campaign_id uuid,
  spend_amount numeric(14, 2) not null check (
    spend_amount <> 'NaN'::numeric and spend_amount >= 0
  ),
  currency text not null default 'USD' check (currency = 'USD'),
  notes text,
  entered_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  record_version integer not null default 1 check (record_version > 0),
  last_operation_key text not null,
  last_request_fingerprint text not null check (
    last_request_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_spend_months_campaign_company_fkey
    foreign key (campaign_id, company_id)
    references public.marketing_campaigns(id, company_id)
    on delete restrict,
  constraint marketing_spend_months_month_check check (
    spend_month = date_trunc('month', spend_month)::date
  ),
  constraint marketing_spend_months_source_detail_check check (
    (source_detail is null or source_detail ~ '^[a-z0-9][a-z0-9_-]{0,159}$')
    and (source_key <> 'other' or source_detail is not null)
  ),
  constraint marketing_spend_months_vendor_key_check check (
    vendor_key is null
    or vendor_key ~ '^[a-z0-9][a-z0-9_-]{0,119}$'
  ),
  constraint marketing_spend_months_vendor_name_check check (
    vendor_name is null
    or length(btrim(vendor_name)) between 1 and 200
  ),
  constraint marketing_spend_months_vendor_consistency_check check (
    (vendor_key is null and vendor_name is null)
    or (vendor_key is not null and vendor_name is not null)
  ),
  constraint marketing_spend_months_notes_check check (
    notes is null or length(notes) <= 2000
  ),
  constraint marketing_spend_months_operation_key_check check (
    last_operation_key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  unique (id, company_id),
  unique (company_id, last_operation_key)
);

create unique index marketing_spend_months_identity_uidx
on public.marketing_spend_months(
  company_id,
  spend_month,
  source_key,
  coalesce(source_detail, ''),
  coalesce(vendor_key, ''),
  coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create index marketing_spend_months_report_idx
on public.marketing_spend_months(company_id, spend_month, source_key);

create index marketing_spend_months_campaign_id_idx
on public.marketing_spend_months(campaign_id)
where campaign_id is not null;

create index marketing_spend_months_entered_by_idx
on public.marketing_spend_months(entered_by)
where entered_by is not null;

create index marketing_spend_months_updated_by_idx
on public.marketing_spend_months(updated_by)
where updated_by is not null;

drop trigger if exists marketing_campaigns_set_updated_at
on public.marketing_campaigns;
create trigger marketing_campaigns_set_updated_at
before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists lead_accountability_set_updated_at
on public.lead_accountability;
create trigger lead_accountability_set_updated_at
before update on public.lead_accountability
for each row execute function public.set_updated_at();

drop trigger if exists marketing_spend_months_set_updated_at
on public.marketing_spend_months;
create trigger marketing_spend_months_set_updated_at
before update on public.marketing_spend_months
for each row execute function public.set_updated_at();

create or replace function public.wtos_is_service_role_request()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
    or current_setting('role', true) = 'service_role',
    false
  );
$$;

create or replace function public.wtos_can_manage_marketing_accountability(
  target_company_id uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    public.wtos_has_global_role(array['owner', 'admin'])
    or public.wtos_has_membership_role(target_company_id, array['owner', 'admin']),
    false
  );
$$;

create or replace function public.wtos_json_fingerprint(payload jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.encode(
    extensions.digest(coalesce(payload, '{}'::jsonb)::text, 'sha256'),
    'hex'
  );
$$;

create or replace function public.wtos_lock_accountability_operation(
  target_company_id uuid,
  target_operation_key text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:marketing-accountability:operation:'
      || target_company_id::text
      || ':'
      || target_operation_key,
      0
    )
  );
end;
$$;

create or replace function public.wtos_upsert_marketing_campaign(
  campaign_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_campaign_id uuid;
  request_expected_version integer;
  request_operation_key text;
  request_fingerprint text;
  request_source_key text;
  request_source_detail text;
  request_intake_provider text;
  request_vendor_key text;
  request_vendor_name text;
  request_campaign_key text;
  request_campaign_name text;
  request_external_campaign_id text;
  request_starts_on date;
  request_ends_on date;
  request_is_active boolean;
  actor_user_id uuid := (select auth.uid());
  service_request boolean := public.wtos_is_service_role_request();
  current_campaign public.marketing_campaigns%rowtype;
  conflicting_campaign_id uuid;
  lock_identity text;
begin
  if pg_catalog.jsonb_typeof(campaign_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Marketing campaign request must be a JSON object.';
  end if;

  request_company_id := nullif(campaign_request ->> 'company_id', '')::uuid;
  request_campaign_id := nullif(campaign_request ->> 'campaign_id', '')::uuid;
  request_expected_version := nullif(campaign_request ->> 'expected_version', '')::integer;
  request_operation_key := nullif(pg_catalog.btrim(campaign_request ->> 'operation_key'), '');
  request_source_key := pg_catalog.lower(nullif(pg_catalog.btrim(campaign_request ->> 'source_key'), ''));
  request_source_detail := pg_catalog.lower(nullif(pg_catalog.btrim(campaign_request ->> 'source_detail'), ''));
  request_intake_provider := pg_catalog.lower(nullif(pg_catalog.btrim(campaign_request ->> 'intake_provider'), ''));
  request_vendor_key := pg_catalog.lower(nullif(pg_catalog.btrim(campaign_request ->> 'vendor_key'), ''));
  request_vendor_name := nullif(pg_catalog.btrim(campaign_request ->> 'vendor_name'), '');
  request_campaign_key := pg_catalog.lower(nullif(pg_catalog.btrim(campaign_request ->> 'campaign_key'), ''));
  request_campaign_name := nullif(pg_catalog.btrim(campaign_request ->> 'campaign_name'), '');
  request_external_campaign_id := nullif(pg_catalog.btrim(campaign_request ->> 'external_campaign_id'), '');
  request_starts_on := nullif(campaign_request ->> 'starts_on', '')::date;
  request_ends_on := nullif(campaign_request ->> 'ends_on', '')::date;
  request_is_active := coalesce((campaign_request ->> 'is_active')::boolean, true);
  if request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing campaign request contains invalid fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;
  request_fingerprint := public.wtos_json_fingerprint(
    pg_catalog.jsonb_set(
      campaign_request,
      '{operation_key}',
      pg_catalog.to_jsonb(request_operation_key),
      true
    )
  );

  if request_company_id is null
    or request_expected_version is null
    or request_expected_version < 0
    or not public.wtos_is_canonical_attribution_source(request_source_key)
    or request_source_key = 'unknown'
    or (request_source_key = 'other' and request_source_detail is null)
    or (request_source_detail is not null and request_source_detail !~ '^[a-z0-9][a-z0-9_-]{0,159}$')
    or (request_intake_provider is not null and request_intake_provider !~ '^[a-z0-9][a-z0-9_-]{0,79}$')
    or (request_vendor_key is not null and request_vendor_key !~ '^[a-z0-9][a-z0-9_-]{0,119}$')
    or ((request_vendor_key is null) <> (request_vendor_name is null))
    or (request_vendor_name is not null and pg_catalog.length(request_vendor_name) > 200)
    or request_campaign_key is null
    or request_campaign_key !~ '^[a-z0-9][a-z0-9_-]{0,159}$'
    or request_campaign_name is null
    or pg_catalog.length(request_campaign_name) > 240
    or (request_external_campaign_id is not null and request_intake_provider is null)
    or (request_external_campaign_id is not null and pg_catalog.length(request_external_campaign_id) > 240)
    or (request_starts_on is not null and request_ends_on is not null and request_ends_on < request_starts_on)
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing campaign request contains invalid fields.';
  end if;

  if not service_request
    and not public.wtos_can_manage_marketing_accountability(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Owner or admin access is required to manage marketing campaigns.';
  end if;

  perform public.wtos_lock_accountability_operation(
    request_company_id,
    request_operation_key
  );

  for lock_identity in
    select identity_value
    from pg_catalog.unnest(array[
      'campaign-key:' || request_company_id::text || ':' || request_campaign_key,
      case when request_external_campaign_id is null then null else
        'campaign-external:' || request_company_id::text || ':'
        || request_intake_provider || ':' || request_external_campaign_id
      end
    ]) as identity_value
    where identity_value is not null
    order by identity_value
  loop
    perform public.wtos_lock_marketing_identity(lock_identity);
  end loop;

  select campaign.*
  into current_campaign
  from public.marketing_campaigns as campaign
  where campaign.company_id = request_company_id
    and campaign.last_operation_key = request_operation_key
  for update;

  if current_campaign.id is not null then
    if current_campaign.last_request_fingerprint <> request_fingerprint
      or (request_campaign_id is not null and current_campaign.id <> request_campaign_id)
    then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different campaign input.';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'idempotent',
      'campaign_id', current_campaign.id,
      'record_version', current_campaign.record_version
    );
  end if;

  if request_campaign_id is null then
    if request_expected_version <> 0 then
      raise exception using
        errcode = '40001',
        message = 'New marketing campaign requires expected_version 0.';
    end if;

    select campaign.id
    into conflicting_campaign_id
    from public.marketing_campaigns as campaign
    where campaign.company_id = request_company_id
      and (
        campaign.campaign_key = request_campaign_key
        or (
          request_external_campaign_id is not null
          and campaign.intake_provider = request_intake_provider
          and campaign.external_campaign_id = request_external_campaign_id
        )
      )
    limit 1;

    if conflicting_campaign_id is not null then
      raise exception using
        errcode = '23505',
        message = 'Marketing campaign identity already exists in this company.';
    end if;

    insert into public.marketing_campaigns (
      company_id,
      source_key,
      source_detail,
      intake_provider,
      vendor_key,
      vendor_name,
      campaign_key,
      campaign_name,
      external_campaign_id,
      starts_on,
      ends_on,
      is_active,
      record_version,
      last_operation_key,
      last_request_fingerprint,
      created_by,
      updated_by
    ) values (
      request_company_id,
      request_source_key,
      request_source_detail,
      request_intake_provider,
      request_vendor_key,
      request_vendor_name,
      request_campaign_key,
      request_campaign_name,
      request_external_campaign_id,
      request_starts_on,
      request_ends_on,
      request_is_active,
      1,
      request_operation_key,
      request_fingerprint,
      actor_user_id,
      actor_user_id
    )
    returning * into current_campaign;

    return pg_catalog.jsonb_build_object(
      'status', 'created',
      'campaign_id', current_campaign.id,
      'record_version', current_campaign.record_version
    );
  end if;

  select campaign.*
  into current_campaign
  from public.marketing_campaigns as campaign
  where campaign.id = request_campaign_id
    and campaign.company_id = request_company_id
  for update;

  if current_campaign.id is null then
    raise exception using
      errcode = '23503',
      message = 'Marketing campaign was not found in the selected company.';
  end if;

  if current_campaign.record_version <> request_expected_version then
    raise exception using
      errcode = '40001',
      message = 'Marketing campaign changed after review.';
  end if;

  if (
    current_campaign.source_key is distinct from request_source_key
    or current_campaign.source_detail is distinct from request_source_detail
    or current_campaign.intake_provider is distinct from request_intake_provider
    or current_campaign.vendor_key is distinct from request_vendor_key
    or current_campaign.vendor_name is distinct from request_vendor_name
    or current_campaign.campaign_key is distinct from request_campaign_key
    or current_campaign.external_campaign_id is distinct from request_external_campaign_id
  ) and (
    exists (
      select 1
      from public.lead_accountability as accountability
      where accountability.campaign_id = current_campaign.id
    )
    or exists (
      select 1
      from public.lead_accountability_events as event
      where event.campaign_id = current_campaign.id
    )
    or exists (
      select 1
      from public.marketing_spend_months as spend
      where spend.campaign_id = current_campaign.id
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Referenced campaign attribution identity is immutable; only name, dates, and active status may change.';
  end if;

  if exists (
    select 1
    from public.marketing_campaigns as campaign
    where campaign.company_id = request_company_id
      and campaign.id <> current_campaign.id
      and (
        campaign.campaign_key = request_campaign_key
        or (
          request_external_campaign_id is not null
          and campaign.intake_provider = request_intake_provider
          and campaign.external_campaign_id = request_external_campaign_id
        )
      )
  ) then
    raise exception using
      errcode = '23505',
      message = 'Marketing campaign identity already exists in this company.';
  end if;

  update public.marketing_campaigns
  set
    source_key = request_source_key,
    source_detail = request_source_detail,
    intake_provider = request_intake_provider,
    vendor_key = request_vendor_key,
    vendor_name = request_vendor_name,
    campaign_key = request_campaign_key,
    campaign_name = request_campaign_name,
    external_campaign_id = request_external_campaign_id,
    starts_on = request_starts_on,
    ends_on = request_ends_on,
    is_active = request_is_active,
    record_version = record_version + 1,
    last_operation_key = request_operation_key,
    last_request_fingerprint = request_fingerprint,
    updated_by = actor_user_id
  where id = current_campaign.id
  returning * into current_campaign;

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'campaign_id', current_campaign.id,
    'record_version', current_campaign.record_version
  );
end;
$$;

create or replace function public.wtos_upsert_marketing_spend(
  spend_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_spend_id uuid;
  request_expected_version integer;
  request_operation_key text;
  request_fingerprint text;
  request_spend_month date;
  request_source_key text;
  request_source_detail text;
  request_vendor_key text;
  request_vendor_name text;
  request_campaign_id uuid;
  request_spend_amount numeric(14, 2);
  request_currency text;
  request_notes text;
  actor_user_id uuid := (select auth.uid());
  service_request boolean := public.wtos_is_service_role_request();
  current_spend public.marketing_spend_months%rowtype;
  selected_campaign public.marketing_campaigns%rowtype;
  conflicting_spend_id uuid;
  identity_value text;
begin
  if pg_catalog.jsonb_typeof(spend_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Marketing spend request must be a JSON object.';
  end if;

  request_company_id := nullif(spend_request ->> 'company_id', '')::uuid;
  request_spend_id := nullif(spend_request ->> 'spend_id', '')::uuid;
  request_expected_version := nullif(spend_request ->> 'expected_version', '')::integer;
  request_operation_key := nullif(pg_catalog.btrim(spend_request ->> 'operation_key'), '');
  request_spend_month := nullif(spend_request ->> 'spend_month', '')::date;
  request_source_key := pg_catalog.lower(nullif(pg_catalog.btrim(spend_request ->> 'source_key'), ''));
  request_source_detail := pg_catalog.lower(nullif(pg_catalog.btrim(spend_request ->> 'source_detail'), ''));
  request_vendor_key := pg_catalog.lower(nullif(pg_catalog.btrim(spend_request ->> 'vendor_key'), ''));
  request_vendor_name := nullif(pg_catalog.btrim(spend_request ->> 'vendor_name'), '');
  request_campaign_id := nullif(spend_request ->> 'campaign_id', '')::uuid;
  request_spend_amount := nullif(spend_request ->> 'spend_amount', '')::numeric;
  request_currency := pg_catalog.upper(coalesce(nullif(pg_catalog.btrim(spend_request ->> 'currency'), ''), 'USD'));
  request_notes := nullif(pg_catalog.btrim(spend_request ->> 'notes'), '');
  if request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing spend request contains invalid fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;
  request_fingerprint := public.wtos_json_fingerprint(
    pg_catalog.jsonb_set(
      spend_request,
      '{operation_key}',
      pg_catalog.to_jsonb(request_operation_key),
      true
    )
  );

  if request_company_id is null
    or request_expected_version is null
    or request_expected_version < 0
    or request_spend_month is null
    or request_spend_month <> pg_catalog.date_trunc('month', request_spend_month)::date
    or not public.wtos_is_canonical_attribution_source(request_source_key)
    or request_source_key = 'unknown'
    or (request_source_key = 'other' and request_source_detail is null)
    or (request_source_detail is not null and request_source_detail !~ '^[a-z0-9][a-z0-9_-]{0,159}$')
    or (request_vendor_key is not null and request_vendor_key !~ '^[a-z0-9][a-z0-9_-]{0,119}$')
    or ((request_vendor_key is null) <> (request_vendor_name is null))
    or (request_vendor_name is not null and pg_catalog.length(request_vendor_name) > 200)
    or request_spend_amount is null
    or request_spend_amount = 'NaN'::numeric
    or request_spend_amount > 999999999999.99
    or request_currency <> 'USD'
    or (request_notes is not null and pg_catalog.length(request_notes) > 2000)
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing spend request contains invalid fields.';
  end if;

  if request_spend_amount < 0 then
    raise exception using
      errcode = '23514',
      message = 'Marketing spend amount must be nonnegative.';
  end if;

  if not service_request
    and not public.wtos_can_manage_marketing_accountability(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Owner or admin access is required to manage marketing spend.';
  end if;

  perform public.wtos_lock_accountability_operation(
    request_company_id,
    request_operation_key
  );

  identity_value := 'spend:' || request_company_id::text || ':'
    || request_spend_month::text || ':' || request_source_key || ':'
    || coalesce(request_source_detail, '') || ':'
    || coalesce(request_vendor_key, '') || ':'
    || coalesce(request_campaign_id::text, '');
  perform public.wtos_lock_marketing_identity(identity_value);

  if request_campaign_id is not null then
    select campaign.*
    into selected_campaign
    from public.marketing_campaigns as campaign
    where campaign.id = request_campaign_id
      and campaign.company_id = request_company_id
    for share;

    if selected_campaign.id is null then
      raise exception using
        errcode = '23503',
        message = 'Marketing campaign was not found in the selected company.';
    end if;

    if selected_campaign.source_key is distinct from request_source_key
      or selected_campaign.source_detail is distinct from request_source_detail
      or selected_campaign.vendor_key is distinct from request_vendor_key
      or selected_campaign.vendor_name is distinct from request_vendor_name
    then
      raise exception using
        errcode = '23514',
        message = 'Marketing campaign semantics do not exactly match marketing spend.';
    end if;
  end if;

  select spend.*
  into current_spend
  from public.marketing_spend_months as spend
  where spend.company_id = request_company_id
    and spend.last_operation_key = request_operation_key
  for update;

  if current_spend.id is not null then
    if current_spend.last_request_fingerprint <> request_fingerprint
      or (request_spend_id is not null and current_spend.id <> request_spend_id)
    then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different marketing spend input.';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'idempotent',
      'spend_id', current_spend.id,
      'record_version', current_spend.record_version
    );
  end if;

  select spend.id
  into conflicting_spend_id
  from public.marketing_spend_months as spend
  where spend.company_id = request_company_id
    and spend.spend_month = request_spend_month
    and spend.source_key = request_source_key
    and coalesce(spend.source_detail, '') = coalesce(request_source_detail, '')
    and coalesce(spend.vendor_key, '') = coalesce(request_vendor_key, '')
    and coalesce(spend.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
      = coalesce(request_campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and (request_spend_id is null or spend.id <> request_spend_id)
  limit 1;

  if conflicting_spend_id is not null then
    raise exception using
      errcode = '23505',
      message = 'Marketing spend already exists for this company, month, source, vendor, and campaign.';
  end if;

  if request_spend_id is null then
    if request_expected_version <> 0 then
      raise exception using
        errcode = '40001',
        message = 'New marketing spend requires expected_version 0.';
    end if;

    insert into public.marketing_spend_months (
      company_id,
      spend_month,
      source_key,
      source_detail,
      vendor_key,
      vendor_name,
      campaign_id,
      spend_amount,
      currency,
      notes,
      entered_by,
      updated_by,
      record_version,
      last_operation_key,
      last_request_fingerprint
    ) values (
      request_company_id,
      request_spend_month,
      request_source_key,
      request_source_detail,
      request_vendor_key,
      request_vendor_name,
      request_campaign_id,
      request_spend_amount,
      request_currency,
      request_notes,
      actor_user_id,
      actor_user_id,
      1,
      request_operation_key,
      request_fingerprint
    )
    returning * into current_spend;

    return pg_catalog.jsonb_build_object(
      'status', 'created',
      'spend_id', current_spend.id,
      'record_version', current_spend.record_version
    );
  end if;

  select spend.*
  into current_spend
  from public.marketing_spend_months as spend
  where spend.id = request_spend_id
    and spend.company_id = request_company_id
  for update;

  if current_spend.id is null then
    raise exception using
      errcode = '23503',
      message = 'Marketing spend was not found in the selected company.';
  end if;

  if current_spend.record_version <> request_expected_version then
    raise exception using
      errcode = '40001',
      message = 'Marketing spend changed after review.';
  end if;

  update public.marketing_spend_months
  set
    spend_month = request_spend_month,
    source_key = request_source_key,
    source_detail = request_source_detail,
    vendor_key = request_vendor_key,
    vendor_name = request_vendor_name,
    campaign_id = request_campaign_id,
    spend_amount = request_spend_amount,
    currency = request_currency,
    notes = request_notes,
    updated_by = actor_user_id,
    record_version = record_version + 1,
    last_operation_key = request_operation_key,
    last_request_fingerprint = request_fingerprint
  where id = current_spend.id
  returning * into current_spend;

  return pg_catalog.jsonb_build_object(
    'status', 'updated',
    'spend_id', current_spend.id,
    'record_version', current_spend.record_version
  );
end;
$$;

create or replace function public.wtos_lock_marketing_identity(
  target_identity text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wtos:marketing-accountability:identity:' || target_identity,
      0
    )
  );
end;
$$;

create or replace function public.wtos_is_canonical_attribution_source(
  candidate text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    candidate in (
      'website',
      'google',
      'yelp',
      'phone',
      'email',
      'referral',
      'repeat_customer',
      'manual',
      'other',
      'unknown'
    ),
    false
  );
$$;

create or replace function public.wtos_is_deterministic_attribution_evidence(
  candidate_source text,
  candidate_provider text,
  candidate_evidence_kind text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    candidate_source <> 'unknown'
    and candidate_evidence_kind in ('provider_verified', 'provider_metadata')
    and (
      (candidate_source = 'website' and candidate_provider = 'website')
      or (
        candidate_source = 'google'
        and candidate_provider in ('website', 'google_business_profile')
      )
      or (candidate_source = 'yelp' and candidate_provider in ('yelp', 'mighty_apes'))
      or (candidate_source = 'phone' and candidate_provider in ('twilio', 'twilio_sms'))
      or (candidate_source = 'email' and candidate_provider in ('gmail', 'email'))
    ),
    false
  );
$$;

create or replace function public.wtos_validate_lead_accountability_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  campaign_source text;
  campaign_detail text;
  campaign_provider text;
  intake_lead_id uuid;
begin
  if new.owner_user_id is not null and not exists (
    select 1
    from public.company_memberships as membership
    where membership.user_id = new.owner_user_id
      and membership.company_id = new.company_id
      and membership.role not in ('customer_portal', 'employee_portal')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Assigned lead owner must be an internal member of the selected company.';
  end if;

  if new.campaign_id is not null then
    select campaign.source_key, campaign.source_detail, campaign.intake_provider
    into campaign_source, campaign_detail, campaign_provider
    from public.marketing_campaigns as campaign
    where campaign.id = new.campaign_id
      and campaign.company_id = new.company_id
    for share;

    if campaign_source is null then
      raise exception using
        errcode = '23503',
        message = 'Marketing campaign was not found in the selected company.';
    end if;

    if campaign_source is distinct from new.source_key then
      raise exception using
        errcode = '23514',
        message = 'Marketing campaign source does not match lead attribution source.';
    end if;

    if campaign_detail is distinct from new.source_detail then
      raise exception using
        errcode = '23514',
        message = 'Marketing campaign detail does not match lead attribution detail.';
    end if;

    if campaign_provider is distinct from new.intake_provider then
      raise exception using
        errcode = '23514',
        message = 'Marketing campaign provider does not match lead intake provider.';
    end if;
  end if;

  if new.intake_record_id is not null then
    select intake.linked_lead_id
    into intake_lead_id
    from public.lead_intake_records as intake
    where intake.id = new.intake_record_id
      and intake.company_id = new.company_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'Lead intake record was not found in the selected company.';
    end if;

    if intake_lead_id is not null and intake_lead_id <> new.lead_id then
      raise exception using
        errcode = '23514',
        message = 'Lead intake record is linked to a different lead.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_accountability_validate_scope
on public.lead_accountability;
create trigger lead_accountability_validate_scope
before insert or update on public.lead_accountability
for each row execute function public.wtos_validate_lead_accountability_scope();

create or replace function public.wtos_validate_marketing_spend_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  campaign_source text;
  campaign_detail text;
  campaign_vendor_key text;
  campaign_vendor_name text;
begin
  if new.campaign_id is null then
    return new;
  end if;

  select
    campaign.source_key,
    campaign.source_detail,
    campaign.vendor_key,
    campaign.vendor_name
  into
    campaign_source,
    campaign_detail,
    campaign_vendor_key,
    campaign_vendor_name
  from public.marketing_campaigns as campaign
  where campaign.id = new.campaign_id
    and campaign.company_id = new.company_id
  for share;

  if campaign_source is null then
    raise exception using
      errcode = '23503',
      message = 'Marketing campaign was not found in the selected company.';
  end if;

  if campaign_source is distinct from new.source_key then
    raise exception using
      errcode = '23514',
      message = 'Marketing spend source does not match campaign source.';
  end if;

  if campaign_detail is distinct from new.source_detail then
    raise exception using
      errcode = '23514',
      message = 'Marketing spend detail does not match campaign detail.';
  end if;

  if (
    campaign_vendor_key is distinct from new.vendor_key
    or campaign_vendor_name is distinct from new.vendor_name
  ) then
    raise exception using
      errcode = '23514',
      message = 'Marketing spend vendor does not match campaign vendor.';
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_spend_months_validate_scope
on public.marketing_spend_months;
create trigger marketing_spend_months_validate_scope
before insert or update on public.marketing_spend_months
for each row execute function public.wtos_validate_marketing_spend_scope();

create or replace function public.wtos_validate_accountability_event_scope()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  campaign_source text;
  campaign_detail text;
  campaign_provider text;
begin
  if new.campaign_id is null then
    return new;
  end if;

  select campaign.source_key, campaign.source_detail, campaign.intake_provider
  into campaign_source, campaign_detail, campaign_provider
  from public.marketing_campaigns as campaign
  where campaign.id = new.campaign_id
    and campaign.company_id = new.company_id
  for share;

  if campaign_source is null
    or campaign_source is distinct from new.source_key
    or campaign_detail is distinct from new.source_detail
    or campaign_provider is distinct from new.intake_provider
  then
    raise exception using
      errcode = '23514',
      message = 'Accountability event campaign is outside the event source scope.';
  end if;

  return new;
end;
$$;

drop trigger if exists lead_accountability_events_validate_scope
on public.lead_accountability_events;
create trigger lead_accountability_events_validate_scope
before insert on public.lead_accountability_events
for each row execute function public.wtos_validate_accountability_event_scope();

create or replace function public.wtos_protect_lead_accountability_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_lead_label text;
begin
  if tg_op = 'DELETE' then
    select coalesce(
      nullif(pg_catalog.to_jsonb(lead) ->> 'contact_name', ''),
      nullif(pg_catalog.to_jsonb(lead) ->> 'customer_name', ''),
      ''
    )
    into linked_lead_label
    from public.leads as lead
    where lead.id = old.lead_id
      and lead.company_id = old.company_id;
  end if;

  if tg_op = 'DELETE'
    and public.wtos_is_service_role_request()
    and (
      linked_lead_label like 'TEST WTOS REGRESSION %'
      or linked_lead_label like 'TEST WTOS LEAD ACCOUNTABILITY REGRESSION:%'
    )
  then
    return old;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Lead accountability events are immutable.';
end;
$$;

drop trigger if exists lead_accountability_events_immutable
on public.lead_accountability_events;
create trigger lead_accountability_events_immutable
before update or delete on public.lead_accountability_events
for each row execute function public.wtos_protect_lead_accountability_event();

create or replace function public.wtos_initialize_lead_accountability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_accountability_id uuid;
  event_operation_key text;
  event_fingerprint text;
  requested_operation_key text;
  received_timestamp timestamptz;
begin
  if new.company_id is null then
    raise exception using
      errcode = '23514',
      message = 'Every new lead must be assigned to a company.';
  end if;

  if pg_catalog.to_jsonb(new) ->> 'estimated_value' = 'NaN' then
    raise exception using
      errcode = '23514',
      message = 'Lead estimated value cannot be NaN.';
  end if;

  requested_operation_key := nullif(
    current_setting('wtos.accountability_operation_key', true),
    ''
  );

  if requested_operation_key is not null then
    event_operation_key := requested_operation_key || ':lead_created';
  else
    event_operation_key := 'lead_created:' || new.id::text;
  end if;

  received_timestamp := coalesce(
    nullif(to_jsonb(new) ->> 'created_at', '')::timestamptz,
    now()
  );
  event_fingerprint := public.wtos_json_fingerprint(
    jsonb_build_object(
      'company_id', new.company_id,
      'lead_id', new.id,
      'event_type', 'lead_created',
      'received_at', received_timestamp
    )
  );

  insert into public.lead_accountability (
    company_id,
    lead_id,
    source_key,
    attribution_model,
    received_at,
    evidence_kind,
    review_status,
    outcome,
    record_version,
    last_operation_key,
    last_request_fingerprint
  ) values (
    new.company_id,
    new.id,
    'unknown',
    'first_touch',
    received_timestamp,
    'insufficient',
    'unattributed',
    'open',
    1,
    event_operation_key,
    event_fingerprint
  )
  returning id into created_accountability_id;

  insert into public.lead_accountability_events (
    lead_accountability_id,
    company_id,
    lead_id,
    event_type,
    operation_key,
    request_fingerprint,
    actor_user_id,
    actor_kind,
    reason_code,
    source_key,
    linked_table,
    linked_record_id,
    outcome,
    occurred_at,
    resulting_record_version
  ) values (
    created_accountability_id,
    new.company_id,
    new.id,
    'lead_created',
    event_operation_key,
    event_fingerprint,
    (select auth.uid()),
    case when (select auth.uid()) is null then 'system' else 'user' end,
    'workflow_record',
    'unknown',
    'leads',
    new.id,
    'open',
    received_timestamp,
    1
  );

  return new;
end;
$$;

drop trigger if exists leads_initialize_accountability
on public.leads;
create trigger leads_initialize_accountability
after insert on public.leads
for each row execute function public.wtos_initialize_lead_accountability();

create or replace function public.wtos_apply_verified_intake_attribution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence jsonb;
  candidate_source text;
  candidate_detail text;
  candidate_provider text;
  candidate_evidence_kind text;
  candidate_campaign_id uuid;
  evidence_campaign_text text;
  evidence_external_campaign_id text;
  current_accountability public.lead_accountability%rowtype;
  selected_campaign public.marketing_campaigns%rowtype;
  updated_version integer;
  event_fingerprint text;
begin
  if not public.wtos_is_service_role_request()
    or new.linked_lead_id is null
    or new.company_id is null
    or new.status <> 'lead_created'
    or new.routing_status <> 'ready_to_create'
  then
    return new;
  end if;

  select accountability.*
  into current_accountability
  from public.lead_accountability as accountability
  where accountability.lead_id = new.linked_lead_id
    and accountability.company_id = new.company_id
  for update;

  if current_accountability.id is null
    or current_accountability.source_key <> 'unknown'
    or current_accountability.attribution_locked_at is not null
    or current_accountability.reviewed_at is not null
    or current_accountability.intake_record_id is not null
    or current_accountability.record_version <> 1
  then
    return new;
  end if;

  evidence := new.source_metadata -> 'attributionEvidence';

  if jsonb_typeof(evidence) = 'object'
    and evidence ->> 'verified' = 'true'
  then
    candidate_source := lower(nullif(btrim(evidence ->> 'sourceKey'), ''));
    candidate_detail := lower(nullif(btrim(evidence ->> 'sourceDetail'), ''));
    candidate_provider := lower(nullif(btrim(evidence ->> 'intakeProvider'), ''));
    candidate_evidence_kind := lower(nullif(btrim(evidence ->> 'evidenceKind'), ''));
    evidence_campaign_text := nullif(btrim(evidence ->> 'campaignId'), '');
    evidence_external_campaign_id := nullif(
      btrim(evidence #>> '{inputs,externalCampaignId}'),
      ''
    );
  elsif new.provider = 'yelp'
    and lower(coalesce(new.source_detail, '')) = 'mighty apes'
    and new.source_metadata ->> 'provider' = 'mighty_apes'
    and new.source_metadata ->> 'signature_validated' = 'true'
  then
    candidate_source := 'yelp';
    candidate_detail := 'mighty_apes';
    candidate_provider := 'mighty_apes';
    candidate_evidence_kind := 'provider_verified';
    evidence_campaign_text := null;
    evidence_external_campaign_id := new.source_metadata ->> 'campaign_yelp_id';
  else
    return new;
  end if;

  if not public.wtos_is_canonical_attribution_source(candidate_source)
    or not public.wtos_is_deterministic_attribution_evidence(
      candidate_source,
      candidate_provider,
      candidate_evidence_kind
    )
    or (
      candidate_detail is not null
      and candidate_detail !~ '^[a-z0-9][a-z0-9_-]{0,159}$'
    )
    or candidate_provider !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
  then
    return new;
  end if;

  if evidence_campaign_text is not null then
    if evidence_campaign_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      return new;
    end if;

    select campaign.*
    into selected_campaign
    from public.marketing_campaigns as campaign
    where campaign.id = evidence_campaign_text::uuid
      and campaign.company_id = new.company_id
    for share;

    if selected_campaign.id is null
      or selected_campaign.source_key is distinct from candidate_source
      or selected_campaign.source_detail is distinct from candidate_detail
      or selected_campaign.intake_provider is distinct from candidate_provider
    then
      return new;
    end if;

    candidate_campaign_id := selected_campaign.id;
  elsif evidence_external_campaign_id is not null then
    select campaign.*
    into selected_campaign
    from public.marketing_campaigns as campaign
    where campaign.company_id = new.company_id
      and campaign.intake_provider = candidate_provider
      and campaign.external_campaign_id = evidence_external_campaign_id
    for share;

    if selected_campaign.id is not null then
      if selected_campaign.is_active is not true
        or selected_campaign.source_key is distinct from candidate_source
        or selected_campaign.source_detail is distinct from candidate_detail
        or selected_campaign.intake_provider is distinct from candidate_provider
      then
        return new;
      end if;

      candidate_campaign_id := selected_campaign.id;
    end if;
  end if;

  event_fingerprint := public.wtos_json_fingerprint(
    jsonb_build_object(
      'company_id', new.company_id,
      'lead_id', new.linked_lead_id,
      'intake_record_id', new.id,
      'source_key', candidate_source,
      'source_detail', candidate_detail,
      'intake_provider', candidate_provider,
      'campaign_id', candidate_campaign_id,
      'evidence_kind', candidate_evidence_kind
    )
  );
  updated_version := current_accountability.record_version + 1;

  update public.lead_accountability
  set
    source_key = candidate_source,
    source_detail = candidate_detail,
    intake_provider = candidate_provider,
    campaign_id = candidate_campaign_id,
    intake_record_id = new.id,
    evidence_kind = candidate_evidence_kind,
    review_status = 'verified',
    reviewed_by = null,
    reviewed_at = now(),
    attribution_locked_at = now(),
    record_version = updated_version,
    last_operation_key = 'intake_attribution:' || new.id::text,
    last_request_fingerprint = event_fingerprint
  where id = current_accountability.id;

  insert into public.lead_accountability_events (
    lead_accountability_id,
    company_id,
    lead_id,
    event_type,
    operation_key,
    request_fingerprint,
    actor_kind,
    reason_code,
    source_key,
    source_detail,
    intake_provider,
    campaign_id,
    linked_table,
    linked_record_id,
    occurred_at,
    resulting_record_version
  ) values (
    current_accountability.id,
    new.company_id,
    new.linked_lead_id,
    'attribution_reviewed',
    'intake_attribution:' || new.id::text,
    event_fingerprint,
    'provider',
    'provider_evidence',
    candidate_source,
    candidate_detail,
    candidate_provider,
    candidate_campaign_id,
    'lead_intake_records',
    new.id,
    now(),
    updated_version
  );

  return new;
end;
$$;

create or replace function public.wtos_enforce_accountable_lead_outcome()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  accountable_outcome text;
  next_status text;
  next_pipeline_stage text;
begin
  if new.company_id is null then
    return new;
  end if;

  select accountability.outcome
  into accountable_outcome
  from public.lead_accountability as accountability
  where accountability.company_id = new.company_id
    and accountability.lead_id = new.id;

  if accountable_outcome is null then
    return new;
  end if;

  next_status := lower(coalesce(to_jsonb(new) ->> 'status', ''));
  next_pipeline_stage := lower(coalesce(to_jsonb(new) ->> 'pipeline_stage', ''));

  if (
    next_status = 'won'
    or next_pipeline_stage in ('approved', 'job_scheduled', 'completed', 'paid')
  ) and accountable_outcome <> 'won' then
    raise exception using
      errcode = '23514',
      message = 'Lead cannot enter a won-stage state before accountable won evidence is recorded.';
  end if;

  if (next_status = 'lost' or next_pipeline_stage = 'lost')
    and accountable_outcome <> 'lost'
  then
    raise exception using
      errcode = '23514',
      message = 'Lead cannot be marked lost before an accountable lost reason is recorded.';
  end if;

  if accountable_outcome = 'won'
    and (
      next_status <> 'won'
      or next_pipeline_stage not in ('approved', 'job_scheduled', 'completed', 'paid')
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Won lead outcome must remain synchronized with a won lead status.';
  end if;

  if accountable_outcome = 'lost'
    and (next_status <> 'lost' or next_pipeline_stage <> 'lost')
  then
    raise exception using
      errcode = '23514',
      message = 'Lost lead outcome must remain synchronized with a lost lead status and stage.';
  end if;

  return new;
end;
$$;

drop trigger if exists leads_enforce_accountable_outcome
on public.leads;
create trigger leads_enforce_accountable_outcome
before update of status, pipeline_stage on public.leads
for each row execute function public.wtos_enforce_accountable_lead_outcome();

create or replace function public.wtos_enforce_accountable_lead_funnel_linkage()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  accountability_id uuid;
  accountable_first_response_at timestamptz;
  next_status text;
  next_pipeline_stage text;
begin
  select accountability.id, accountability.first_response_at
  into accountability_id, accountable_first_response_at
  from public.lead_accountability as accountability
  where accountability.company_id = new.company_id
    and accountability.lead_id = new.id;

  if accountability_id is null then
    return null;
  end if;

  next_status := pg_catalog.lower(coalesce(pg_catalog.to_jsonb(new) ->> 'status', ''));
  next_pipeline_stage := pg_catalog.lower(coalesce(pg_catalog.to_jsonb(new) ->> 'pipeline_stage', ''));

  if (next_status = 'contacted' or next_pipeline_stage = 'contacted')
    and accountable_first_response_at is null
  then
    raise exception using
      errcode = '23514',
      message = 'Contacted lead state requires an accountable successful human-contact event.';
  end if;

  if (next_status = 'qualified' or next_pipeline_stage = 'estimate_scheduled')
    and not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = accountability_id
        and event.event_type = 'appointment_scheduled'
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Qualified or scheduled lead state requires an accountable appointment event.';
  end if;

  if (next_status = 'estimate_sent' or next_pipeline_stage = 'estimate_sent')
    and not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = accountability_id
        and event.event_type = 'estimate_sent'
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Estimate-sent lead state requires accountable sent-estimate evidence.';
  end if;

  return null;
end;
$$;

drop trigger if exists leads_enforce_accountable_funnel_linkage
on public.leads;
create constraint trigger leads_enforce_accountable_funnel_linkage
after insert or update on public.leads
deferrable initially deferred
for each row execute function public.wtos_enforce_accountable_lead_funnel_linkage();

drop trigger if exists lead_intake_records_apply_verified_attribution
on public.lead_intake_records;
create trigger lead_intake_records_apply_verified_attribution
after insert on public.lead_intake_records
for each row execute function public.wtos_apply_verified_intake_attribution();

create or replace function public.wtos_record_automatic_lead_milestone(
  target_company_id uuid,
  target_lead_id uuid,
  milestone_type text,
  evidence_table text,
  evidence_id uuid,
  milestone_at timestamptz,
  contract_value numeric default null,
  value_basis text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_accountability public.lead_accountability%rowtype;
  event_operation_key text;
  event_fingerprint text;
  updated_version integer;
begin
  if target_company_id is null or target_lead_id is null or evidence_id is null then
    return;
  end if;

  if milestone_type not in (
    'appointment_scheduled',
    'inspection_completed',
    'estimate_sent',
    'won'
  ) then
    raise exception using
      errcode = '22023',
      message = 'Unsupported automatic lead accountability milestone.';
  end if;

  if (milestone_type = 'appointment_scheduled' and evidence_table <> 'schedule_events')
    or (milestone_type = 'inspection_completed' and evidence_table <> 'inspections')
    or (milestone_type = 'estimate_sent' and evidence_table <> 'estimates')
    or (milestone_type = 'won' and evidence_table <> 'estimate_proposal_acceptances')
  then
    raise exception using
      errcode = '22023',
      message = 'Automatic accountability milestone evidence table is invalid.';
  end if;

  perform public.wtos_acquire_crm_identity_invariant_lock();

  select accountability.*
  into current_accountability
  from public.lead_accountability as accountability
  where accountability.company_id = target_company_id
    and accountability.lead_id = target_lead_id
  for update;

  if current_accountability.id is null then
    return;
  end if;

  if current_accountability.outcome <> 'open' then
    return;
  end if;

  milestone_at := coalesce(milestone_at, pg_catalog.now());

  if milestone_at < current_accountability.received_at
    or milestone_at > pg_catalog.now()
  then
    return;
  end if;

  if milestone_type = 'appointment_scheduled' and (
    not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'contacted'
    )
    or milestone_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'contacted'
    )
  ) then
    return;
  end if;

  if milestone_type = 'inspection_completed' and (
    not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'appointment_scheduled'
    )
    or milestone_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'appointment_scheduled'
    )
  ) then
    return;
  end if;

  if milestone_type = 'estimate_sent' and (
    not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'inspection_completed'
    )
    or milestone_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'inspection_completed'
    )
  ) then
    return;
  end if;

  if milestone_type = 'won' and (
    not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'estimate_sent'
    )
    or milestone_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'estimate_sent'
    )
  ) then
    return;
  end if;

  if milestone_type = 'won' and (
    contract_value is null
    or contract_value = 'NaN'::numeric
    or contract_value <= 0
    or value_basis not in ('accepted_proposal', 'signed_proposal')
  ) then
    raise exception using
      errcode = '23514',
      message = 'A valid accepted proposal value and basis are required to mark a lead won.';
  end if;

  event_operation_key := 'workflow:' || evidence_table || ':'
    || evidence_id::text || ':' || milestone_type;

  if exists (
    select 1
    from public.lead_accountability_events as event
    where event.company_id = target_company_id
      and event.operation_key = event_operation_key
  ) then
    return;
  end if;

  event_fingerprint := public.wtos_json_fingerprint(
    jsonb_build_object(
      'company_id', target_company_id,
      'lead_id', target_lead_id,
      'event_type', milestone_type,
      'linked_table', evidence_table,
      'linked_record_id', evidence_id,
      'occurred_at', milestone_at,
      'won_contract_value', contract_value,
      'won_value_basis', value_basis
    )
  );
  updated_version := current_accountability.record_version + 1;

  update public.lead_accountability
  set
    outcome = case when milestone_type = 'won' then 'won' else outcome end,
    outcome_at = case when milestone_type = 'won' then coalesce(milestone_at, now()) else outcome_at end,
    won_contract_value = case when milestone_type = 'won' then contract_value else won_contract_value end,
    won_value_basis = case when milestone_type = 'won' then value_basis else won_value_basis end,
    record_version = updated_version,
    last_operation_key = event_operation_key,
    last_request_fingerprint = event_fingerprint
  where id = current_accountability.id;

  if milestone_type = 'appointment_scheduled' then
    update public.leads
    set
      status = case
        when status in ('new', 'contacted') then 'qualified'
        else status
      end,
      pipeline_stage = case
        when pipeline_stage in ('new_lead', 'contacted') then 'estimate_scheduled'
        else pipeline_stage
      end
    where id = target_lead_id
      and company_id = target_company_id;
  elsif milestone_type = 'inspection_completed' then
    update public.leads
    set
      status = case
        when status in ('new', 'contacted') then 'qualified'
        else status
      end,
      pipeline_stage = case
        when pipeline_stage in ('new_lead', 'contacted') then 'estimate_scheduled'
        else pipeline_stage
      end
    where id = target_lead_id
      and company_id = target_company_id;
  elsif milestone_type = 'estimate_sent' then
    update public.leads
    set
      status = case
        when status in ('new', 'contacted', 'qualified') then 'estimate_sent'
        else status
      end,
      pipeline_stage = case
        when pipeline_stage in ('new_lead', 'contacted', 'estimate_scheduled') then 'estimate_sent'
        else pipeline_stage
      end
    where id = target_lead_id
      and company_id = target_company_id;
  elsif milestone_type = 'won' then
    update public.leads
    set
      status = 'won',
      pipeline_stage = 'approved'
    where id = target_lead_id
      and company_id = target_company_id;
  end if;

  insert into public.lead_accountability_events (
    lead_accountability_id,
    company_id,
    lead_id,
    event_type,
    operation_key,
    request_fingerprint,
    actor_kind,
    reason_code,
    source_key,
    source_detail,
    intake_provider,
    campaign_id,
    linked_table,
    linked_record_id,
    outcome,
    won_contract_value,
    won_value_basis,
    occurred_at,
    resulting_record_version
  ) values (
    current_accountability.id,
    target_company_id,
    target_lead_id,
    milestone_type,
    event_operation_key,
    event_fingerprint,
    'system',
    'workflow_record',
    current_accountability.source_key,
    current_accountability.source_detail,
    current_accountability.intake_provider,
    current_accountability.campaign_id,
    evidence_table,
    evidence_id,
    case when milestone_type = 'won' then 'won' else null end,
    case when milestone_type = 'won' then contract_value else null end,
    case when milestone_type = 'won' then value_basis else null end,
    coalesce(milestone_at, now()),
    updated_version
  );
end;
$$;

-- Existing CRM identity hardening already serializes INSERT statements on
-- schedule_events, inspections, and estimates. These narrow UPDATE triggers,
-- plus proposal-acceptance INSERTs, acquire that same coordinator before any
-- milestone-driving workflow tuple can be locked.
drop trigger if exists schedule_events_serialize_accountability_milestone_update
on public.schedule_events;
create trigger schedule_events_serialize_accountability_milestone_update
before update of status, start_at on public.schedule_events
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

drop trigger if exists inspections_serialize_accountability_milestone_update
on public.inspections;
create trigger inspections_serialize_accountability_milestone_update
before update of status, completed_at on public.inspections
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

drop trigger if exists estimates_serialize_accountability_milestone_update
on public.estimates;
create trigger estimates_serialize_accountability_milestone_update
before update of status on public.estimates
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

create or replace function public.wtos_validate_proposal_acceptance_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_revision public.estimate_proposal_revisions%rowtype;
  selected_estimate public.estimates%rowtype;
  selected_customer public.customers%rowtype;
begin
  select revision.*
  into selected_revision
  from public.estimate_proposal_revisions as revision
  where revision.id = new.proposal_revision_id
  for share;

  if selected_revision.id is null then
    raise exception using
      errcode = '23503',
      message = 'Proposal acceptance revision was not found.';
  end if;

  select estimate.*
  into selected_estimate
  from public.estimates as estimate
  where estimate.id = new.estimate_id
  for share;

  if selected_estimate.id is null then
    raise exception using
      errcode = '23503',
      message = 'Proposal acceptance estimate was not found.';
  end if;

  if selected_revision.company_id is distinct from new.company_id
    or selected_revision.estimate_id is distinct from new.estimate_id
    or selected_estimate.company_id is distinct from new.company_id
    or selected_revision.customer_id is distinct from new.customer_id
    or selected_estimate.customer_id is distinct from new.customer_id
  then
    raise exception using
      errcode = '23514',
      message = 'Proposal acceptance revision, estimate, customer, and company scope must match exactly.';
  end if;

  if new.customer_id is not null then
    select customer.*
    into selected_customer
    from public.customers as customer
    where customer.id = new.customer_id
    for share;

    if selected_customer.id is null then
      raise exception using
        errcode = '23503',
        message = 'Proposal acceptance customer was not found.';
    end if;

    if selected_customer.company_id is distinct from new.company_id then
      raise exception using
        errcode = '23514',
        message = 'Proposal acceptance customer must belong to the selected company.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists proposal_acceptances_serialize_accountability_milestone_insert
on public.estimate_proposal_acceptances;
create trigger proposal_acceptances_serialize_accountability_milestone_insert
before insert on public.estimate_proposal_acceptances
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

drop trigger if exists proposal_acceptances_serialize_accountability_scope_update
on public.estimate_proposal_acceptances;
create trigger proposal_acceptances_serialize_accountability_scope_update
before update of company_id, proposal_revision_id, estimate_id, customer_id
on public.estimate_proposal_acceptances
for each statement execute function public.wtos_serialize_crm_identity_link_statement();

drop trigger if exists estimate_proposal_acceptances_validate_scope_insert
on public.estimate_proposal_acceptances;
create trigger estimate_proposal_acceptances_validate_scope_insert
before insert on public.estimate_proposal_acceptances
for each row execute function public.wtos_validate_proposal_acceptance_scope();

drop trigger if exists estimate_proposal_acceptances_validate_scope_update
on public.estimate_proposal_acceptances;
create trigger estimate_proposal_acceptances_validate_scope_update
before update of company_id, proposal_revision_id, estimate_id, customer_id
on public.estimate_proposal_acceptances
for each row execute function public.wtos_validate_proposal_acceptance_scope();

create or replace function public.wtos_capture_schedule_accountability_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null
    and new.event_type in ('inspection', 'estimate')
    and new.status in ('scheduled', 'completed')
    and (
      tg_op = 'INSERT'
      or old.status is distinct from new.status
      or old.start_at is distinct from new.start_at
    )
  then
    perform public.wtos_record_automatic_lead_milestone(
      new.company_id,
      new.lead_id,
      'appointment_scheduled',
      'schedule_events',
      new.id,
      coalesce(new.created_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists schedule_events_capture_accountability_milestone
on public.schedule_events;
create trigger schedule_events_capture_accountability_milestone
after insert or update of status, start_at on public.schedule_events
for each row execute function public.wtos_capture_schedule_accountability_milestone();

create or replace function public.wtos_capture_inspection_accountability_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_lead_id uuid;
begin
  if not (
    new.status in ('completed', 'passed', 'failed', 'no_work_needed')
    or new.completed_at is not null
  ) then
    return new;
  end if;

  target_lead_id := new.lead_id;

  if target_lead_id is null and new.estimate_id is not null then
    select estimate.lead_id
    into target_lead_id
    from public.estimates as estimate
    where estimate.id = new.estimate_id
      and estimate.company_id = new.company_id;
  end if;

  if target_lead_id is null and new.job_id is not null then
    select job.lead_id
    into target_lead_id
    from public.jobs as job
    where job.id = new.job_id
      and job.company_id = new.company_id;
  end if;

  if target_lead_id is not null and (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.completed_at is distinct from new.completed_at
  ) then
    perform public.wtos_record_automatic_lead_milestone(
      new.company_id,
      target_lead_id,
      'inspection_completed',
      'inspections',
      new.id,
      coalesce(new.completed_at, new.updated_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists inspections_capture_accountability_milestone
on public.inspections;
create trigger inspections_capture_accountability_milestone
after insert or update of status, completed_at on public.inspections
for each row execute function public.wtos_capture_inspection_accountability_milestone();

create or replace function public.wtos_capture_estimate_accountability_milestone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null
    and new.status = 'sent'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform public.wtos_record_automatic_lead_milestone(
      new.company_id,
      new.lead_id,
      'estimate_sent',
      'estimates',
      new.id,
      coalesce(new.updated_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists estimates_capture_accountability_milestone
on public.estimates;
create trigger estimates_capture_accountability_milestone
after insert or update of status on public.estimates
for each row execute function public.wtos_capture_estimate_accountability_milestone();

create or replace function public.wtos_capture_proposal_acceptance_win()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_lead_id uuid;
  target_basis text;
begin
  select estimate.lead_id
  into target_lead_id
  from public.estimates as estimate
  where estimate.id = new.estimate_id
    and estimate.company_id = new.company_id;

  if target_lead_id is null or not exists (
    select 1
    from public.lead_accountability as accountability
    where accountability.company_id = new.company_id
      and accountability.lead_id = target_lead_id
  ) then
    return new;
  end if;

  if new.acceptance_method = 'signature_provider'
    and new.signature_status <> 'signed'
  then
    return new;
  end if;

  if new.accepted_total = 'NaN'::numeric or new.accepted_total <= 0 then
    raise exception using
      errcode = '23514',
      message = 'Accepted proposal total must be greater than zero for a won lead.';
  end if;

  target_basis := case
    when new.signature_status = 'signed' then 'signed_proposal'
    else 'accepted_proposal'
  end;

  perform public.wtos_record_automatic_lead_milestone(
    new.company_id,
    target_lead_id,
    'won',
    'estimate_proposal_acceptances',
    new.id,
    coalesce(new.accepted_at, new.created_at, now()),
    new.accepted_total,
    target_basis
  );

  return new;
end;
$$;

drop trigger if exists estimate_proposal_acceptances_capture_accountability_win
on public.estimate_proposal_acceptances;
create trigger estimate_proposal_acceptances_capture_accountability_win
after insert on public.estimate_proposal_acceptances
for each row execute function public.wtos_capture_proposal_acceptance_win();

create or replace function public.wtos_create_accountable_lead_core(
  accountability_request jsonb,
  allow_repeat_customer boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_operation_key text;
  request_fingerprint text;
  request_contact_name text;
  request_phone text;
  request_email text;
  request_property_address text;
  request_city text;
  request_state text;
  request_postal_code text;
  request_service_type text;
  request_priority text;
  request_estimated_value numeric(12, 2);
  request_next_follow_up date;
  request_notes text;
  request_source_key text;
  request_source_detail text;
  request_intake_provider text;
  request_campaign_id uuid;
  request_intake_record_id uuid;
  request_evidence_kind text;
  request_review_status text;
  request_owner_user_id uuid;
  request_received_at timestamptz;
  actor_user_id uuid := (select auth.uid());
  service_request boolean := public.wtos_is_service_role_request();
  source_display text;
  request_company_trade text;
  created_lead_id uuid;
  selected_campaign public.marketing_campaigns%rowtype;
  created_accountability public.lead_accountability%rowtype;
  existing_event public.lead_accountability_events%rowtype;
  created_event_id uuid;
begin
  if jsonb_typeof(accountability_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Accountable lead request must be a JSON object.';
  end if;

  request_company_id := nullif(accountability_request ->> 'company_id', '')::uuid;
  request_operation_key := nullif(btrim(accountability_request ->> 'operation_key'), '');
  request_contact_name := nullif(btrim(accountability_request ->> 'contact_name'), '');
  request_phone := nullif(btrim(accountability_request ->> 'phone'), '');
  request_email := lower(nullif(btrim(accountability_request ->> 'email'), ''));
  request_property_address := nullif(btrim(accountability_request ->> 'property_address'), '');
  request_city := nullif(btrim(accountability_request ->> 'city'), '');
  request_state := coalesce(nullif(upper(btrim(accountability_request ->> 'state')), ''), 'AZ');
  request_postal_code := nullif(btrim(accountability_request ->> 'postal_code'), '');
  request_service_type := lower(nullif(btrim(accountability_request ->> 'service_type'), ''));
  request_priority := coalesce(
    lower(nullif(btrim(accountability_request ->> 'priority'), '')),
    'normal'
  );
  request_estimated_value := coalesce(
    nullif(accountability_request ->> 'estimated_value', '')::numeric,
    0
  );
  request_next_follow_up := nullif(accountability_request ->> 'next_follow_up', '')::date;
  request_notes := nullif(accountability_request ->> 'notes', '');
  request_source_key := lower(nullif(btrim(accountability_request ->> 'source_key'), ''));
  request_source_detail := lower(nullif(btrim(accountability_request ->> 'source_detail'), ''));
  request_intake_provider := lower(nullif(btrim(accountability_request ->> 'intake_provider'), ''));
  request_campaign_id := nullif(accountability_request ->> 'campaign_id', '')::uuid;
  request_intake_record_id := nullif(accountability_request ->> 'intake_record_id', '')::uuid;
  request_evidence_kind := lower(nullif(btrim(accountability_request ->> 'evidence_kind'), ''));
  request_review_status := lower(nullif(btrim(accountability_request ->> 'review_status'), ''));
  request_owner_user_id := nullif(accountability_request ->> 'owner_user_id', '')::uuid;
  request_received_at := coalesce(
    nullif(accountability_request ->> 'received_at', '')::timestamptz,
    now()
  );
  if not service_request then
    request_received_at := now();
  end if;

  if request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Accountable lead request contains invalid required fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;
  request_fingerprint := case
    when allow_repeat_customer then
      nullif(accountability_request ->> 'repeat_request_fingerprint', '')
    else public.wtos_json_fingerprint(
      pg_catalog.jsonb_set(
        accountability_request,
        '{operation_key}',
        pg_catalog.to_jsonb(request_operation_key),
        true
      )
    )
  end;

  if request_company_id is null
    or request_fingerprint is null
    or request_fingerprint !~ '^[a-f0-9]{64}$'
    or request_contact_name is null
    or length(request_contact_name) > 200
    or (request_phone is not null and length(request_phone) > 40)
    or (request_email is not null and length(request_email) > 320)
    or request_property_address is null
    or length(request_property_address) > 300
    or (request_city is not null and length(request_city) > 160)
    or length(request_state) > 40
    or (request_postal_code is not null and length(request_postal_code) > 20)
    or (request_notes is not null and length(request_notes) > 4000)
    or request_service_type not in ('roofing', 'painting', 'both')
    or request_priority not in ('low', 'normal', 'high', 'urgent')
    or request_estimated_value = 'NaN'::numeric
    or request_estimated_value < 0
    or request_estimated_value > 9999999999.99
    or not public.wtos_is_canonical_attribution_source(request_source_key)
    or (request_source_key = 'other' and request_source_detail is null)
    or request_evidence_kind not in (
      'provider_verified',
      'provider_metadata',
      'staff_selected',
      'customer_stated',
      'repeat_customer',
      'insufficient'
    )
    or request_review_status not in ('verified', 'needs_review', 'unattributed')
    or (
      request_source_detail is not null
      and request_source_detail !~ '^[a-z0-9][a-z0-9_-]{0,159}$'
    )
    or (
      request_intake_provider is not null
      and request_intake_provider !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Accountable lead request contains invalid required fields.';
  end if;

  if allow_repeat_customer then
    if request_source_key <> 'repeat_customer'
      or request_source_detail is not null
      or request_intake_provider is distinct from 'manual'
      or request_campaign_id is not null
      or request_intake_record_id is not null
      or request_evidence_kind <> 'repeat_customer'
      or request_review_status <> 'verified'
    then
      raise exception using
        errcode = '23514',
        message = 'Internal repeat-customer creation requires exact reviewed repeat evidence.';
    end if;
  elsif request_source_key = 'repeat_customer'
    or request_evidence_kind = 'repeat_customer'
  then
    raise exception using
      errcode = '42501',
      message = 'Repeat-customer attribution requires the reviewed Customer 360 workflow.';
  end if;

  if request_source_key = 'unknown' and (
    request_review_status not in ('needs_review', 'unattributed')
    or request_evidence_kind <> 'insufficient'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Unknown acquisition evidence must remain unattributed or needs review.';
  end if;

  if request_source_key <> 'unknown' and (
    request_review_status <> 'verified'
    or request_evidence_kind = 'insufficient'
  ) then
    raise exception using
      errcode = '23514',
      message = 'Verified acquisition source requires explicit evidence.';
  end if;

  if request_evidence_kind in ('provider_verified', 'provider_metadata')
    and not service_request
  then
    raise exception using
      errcode = '42501',
      message = 'Provider attribution evidence may only be recorded by a trusted provider pathway.';
  end if;

  if request_evidence_kind in ('provider_verified', 'provider_metadata')
    and not public.wtos_is_deterministic_attribution_evidence(
      request_source_key,
      request_intake_provider,
      request_evidence_kind
    )
  then
    raise exception using
      errcode = '23514',
      message = 'Provider attribution evidence is not deterministic for this source and provider.';
  end if;

  if not service_request
    and not public.wtos_can_manage_sales(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Sales access is required to create an accountable lead.';
  end if;

  select company.trade
  into request_company_trade
  from public.companies as company
  where company.id = request_company_id;

  if request_company_trade is null
    or (request_company_trade <> 'both' and request_service_type <> request_company_trade)
  then
    raise exception using
      errcode = '23514',
      message = 'Lead service type is not offered by the selected company.';
  end if;

  -- Lead inserts participate in the CRM identity graph. The coordinator must
  -- precede operation, campaign, and lead tuple locks in every creation path.
  perform public.wtos_acquire_crm_identity_invariant_lock();

  perform public.wtos_lock_accountability_operation(
    request_company_id,
    request_operation_key
  );

  select event.*
  into existing_event
  from public.lead_accountability_events as event
  where event.company_id = request_company_id
    and event.operation_key = request_operation_key;

  if existing_event.id is not null then
    if existing_event.request_fingerprint <> request_fingerprint then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different accountable lead input.';
    end if;

    select accountability.*
    into created_accountability
    from public.lead_accountability as accountability
    where accountability.id = existing_event.lead_accountability_id;

    return jsonb_build_object(
      'status', 'idempotent',
      'lead_id', existing_event.lead_id,
      'accountability_id', existing_event.lead_accountability_id,
      'record_version', created_accountability.record_version
    );
  end if;

  if request_owner_user_id is not null and not exists (
    select 1
    from public.company_memberships as membership
    where membership.user_id = request_owner_user_id
      and membership.company_id = request_company_id
      and membership.role not in ('customer_portal', 'employee_portal')
  ) then
    raise exception using
      errcode = '23514',
      message = 'Assigned lead owner must be an internal member of the selected company.';
  end if;

  if request_owner_user_id is not null
    and not service_request
    and not public.wtos_can_manage_marketing_accountability(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Owner or admin access is required to assign a lead owner during creation.';
  end if;

  if request_campaign_id is not null then
    select campaign.*
    into selected_campaign
    from public.marketing_campaigns as campaign
    where campaign.id = request_campaign_id
      and campaign.company_id = request_company_id
    for share;

    if selected_campaign.id is null then
      raise exception using
        errcode = '23503',
        message = 'Marketing campaign was not found in the selected company.';
    end if;

    if selected_campaign.source_key is distinct from request_source_key
      or selected_campaign.source_detail is distinct from request_source_detail
      or selected_campaign.intake_provider is distinct from request_intake_provider
    then
      raise exception using
        errcode = '23514',
        message = 'Marketing campaign semantics do not exactly match lead attribution.';
    end if;
  end if;

  if request_intake_record_id is not null and not exists (
    select 1
    from public.lead_intake_records as intake
    where intake.id = request_intake_record_id
      and intake.company_id = request_company_id
      and intake.linked_lead_id is null
  ) then
    raise exception using
      errcode = '23503',
      message = 'Available lead intake record was not found in the selected company.';
  end if;

  source_display := case request_source_key
    when 'website' then 'Website'
    when 'google' then 'Google'
    when 'yelp' then 'Yelp'
    when 'phone' then 'Phone'
    when 'email' then 'Email'
    when 'referral' then 'Referral'
    when 'repeat_customer' then 'Repeat Customer'
    when 'manual' then 'Manual'
    when 'other' then 'Other'
    else 'Unknown'
  end;

  perform set_config('wtos.accountability_operation_key', request_operation_key, true);

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'customer_name'
  ) then
    execute $create_legacy_lead$
      insert into public.leads (
        company_id,
        customer_id,
        property_id,
        customer_name,
        phone,
        email,
        property_address,
        city,
        state,
        postal_code,
        service_type,
        service_needed,
        lead_source,
        status,
        pipeline_stage,
        priority,
        estimated_value,
        next_follow_up,
        notes,
        created_by,
        created_at
      ) values (
        $1, null, null, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10,
        'new', 'new_lead', $11, $16, $12, $13, $14, $15
      ) returning id
    $create_legacy_lead$
    into created_lead_id
    using
      request_company_id,
      request_contact_name,
      request_phone,
      request_email,
      request_property_address,
      request_city,
      request_state,
      request_postal_code,
      request_service_type,
      source_display,
      request_priority,
      request_next_follow_up,
      request_notes,
      actor_user_id,
      request_received_at,
      request_estimated_value;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'contact_name'
  ) then
    execute $create_canonical_lead$
      insert into public.leads (
        company_id,
        customer_id,
        property_id,
        contact_name,
        phone,
        email,
        property_address,
        city,
        state,
        postal_code,
        service_type,
        source,
        status,
        pipeline_stage,
        priority,
        estimated_value,
        next_follow_up,
        notes,
        created_by,
        created_at
      ) values (
        $1, null, null, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        'new', 'new_lead', $11, $16, $12, $13, $14, $15
      ) returning id
    $create_canonical_lead$
    into created_lead_id
    using
      request_company_id,
      request_contact_name,
      request_phone,
      request_email,
      request_property_address,
      request_city,
      request_state,
      request_postal_code,
      request_service_type,
      source_display,
      request_priority,
      request_next_follow_up,
      request_notes,
      actor_user_id,
      request_received_at,
      request_estimated_value;
  else
    raise exception using
      errcode = '55000',
      message = 'CRM lead schema is not compatible with accountable lead creation.';
  end if;

  select accountability.*
  into created_accountability
  from public.lead_accountability as accountability
  where accountability.lead_id = created_lead_id
  for update;

  if request_intake_record_id is not null then
    update public.lead_intake_records
    set linked_lead_id = created_lead_id
    where id = request_intake_record_id
      and company_id = request_company_id
      and linked_lead_id is null;
  end if;

  update public.lead_accountability
  set
    source_key = request_source_key,
    source_detail = request_source_detail,
    intake_provider = request_intake_provider,
    campaign_id = request_campaign_id,
    intake_record_id = request_intake_record_id,
    evidence_kind = request_evidence_kind,
    review_status = request_review_status,
    reviewed_by = actor_user_id,
    reviewed_at = now(),
    attribution_locked_at = case
      when request_source_key = 'unknown' then null
      else now()
    end,
    owner_user_id = request_owner_user_id,
    owner_assigned_at = case
      when request_owner_user_id is null then null
      else now()
    end,
    record_version = created_accountability.record_version + 1,
    last_operation_key = request_operation_key,
    last_request_fingerprint = request_fingerprint
  where id = created_accountability.id
  returning * into created_accountability;

  insert into public.lead_accountability_events (
    lead_accountability_id,
    company_id,
    lead_id,
    event_type,
    operation_key,
    request_fingerprint,
    actor_user_id,
    actor_kind,
    reason_code,
    source_key,
    source_detail,
    intake_provider,
    campaign_id,
    linked_table,
    linked_record_id,
    occurred_at,
    resulting_record_version
  ) values (
    created_accountability.id,
    request_company_id,
    created_lead_id,
    'attribution_reviewed',
    request_operation_key,
    request_fingerprint,
    actor_user_id,
    case
      when service_request
        and request_evidence_kind in ('provider_verified', 'provider_metadata')
      then 'provider'
      when service_request then 'system'
      else 'user'
    end,
    case
      when request_source_key = 'repeat_customer' then 'repeat_customer'
      when service_request
        and request_evidence_kind in ('provider_verified', 'provider_metadata')
      then 'provider_evidence'
      else 'initial_review'
    end,
    request_source_key,
    request_source_detail,
    request_intake_provider,
    request_campaign_id,
    case when request_intake_record_id is null then 'leads' else 'lead_intake_records' end,
    coalesce(request_intake_record_id, created_lead_id),
    now(),
    created_accountability.record_version
  )
  returning id into created_event_id;

  return jsonb_build_object(
    'status', 'created',
    'lead_id', created_lead_id,
    'accountability_id', created_accountability.id,
    'record_version', created_accountability.record_version
  );
end;
$$;

create or replace function public.wtos_create_accountable_lead(
  accountability_request jsonb
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.wtos_create_accountable_lead_core(
    accountability_request,
    false
  );
$$;

create or replace function public.wtos_apply_lead_accountability_action(
  action_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_operation_key text;
  request_lead_id uuid;
  request_expected_version integer;
  request_action text;
  request_fingerprint text;
  actor_user_id uuid := (select auth.uid());
  service_request boolean := public.wtos_is_service_role_request();
  preliminary_company_id uuid;
  current_accountability public.lead_accountability%rowtype;
  updated_accountability public.lead_accountability%rowtype;
  selected_campaign public.marketing_campaigns%rowtype;
  existing_event public.lead_accountability_events%rowtype;
  created_event_id uuid;
  event_actor_kind text;
  event_reason_code text := 'manual_action';
  event_source_key text;
  event_source_detail text;
  event_campaign_id uuid;
  event_owner_user_id uuid;
  event_channel text;
  event_linked_table text := 'leads';
  event_linked_record_id uuid;
  event_outcome text;
  event_lost_reason text;
  event_won_value numeric(14, 2);
  event_won_basis text;
  event_occurred_at timestamptz;
  request_source_key text;
  request_source_detail text;
  request_intake_provider text;
  request_campaign_id uuid;
  request_intake_record_id uuid;
  request_evidence_kind text;
  request_review_status text;
  request_reason_code text;
  request_owner_user_id uuid;
  request_owner_key_present boolean;
  request_human_contact boolean;
  request_channel text;
  request_schedule_event_id uuid;
  request_inspection_id uuid;
  request_estimate_id uuid;
  request_proposal_acceptance_id uuid;
  request_lost_reason text;
  request_lost_notes text;
  request_won_value numeric(14, 2);
  request_won_basis text;
  evidence_company_id uuid;
  evidence_lead_id uuid;
  evidence_status text;
  evidence_type text;
  acceptance_value numeric(14, 2);
  acceptance_signature_status text;
  acceptance_method text;
begin
  if jsonb_typeof(action_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Lead accountability action request must be a JSON object.';
  end if;

  request_operation_key := nullif(btrim(action_request ->> 'operation_key'), '');
  request_lead_id := nullif(action_request ->> 'lead_id', '')::uuid;
  request_expected_version := nullif(action_request ->> 'expected_version', '')::integer;
  request_action := lower(nullif(btrim(action_request ->> 'action'), ''));
  event_occurred_at := coalesce(
    nullif(action_request ->> 'occurred_at', '')::timestamptz,
    now()
  );
  event_linked_record_id := request_lead_id;

  if request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Lead accountability action request contains invalid required fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;
  request_fingerprint := public.wtos_json_fingerprint(
    pg_catalog.jsonb_set(
      action_request,
      '{operation_key}',
      pg_catalog.to_jsonb(request_operation_key),
      true
    )
  );

  if request_lead_id is null
    or request_expected_version is null
    or request_expected_version <= 0
    or request_action not in (
      'attribution_reviewed',
      'owner_assigned',
      'contacted',
      'appointment_scheduled',
      'inspection_completed',
      'estimate_sent',
      'won',
      'lost'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Lead accountability action request contains invalid required fields.';
  end if;

  select accountability.company_id
  into preliminary_company_id
  from public.lead_accountability as accountability
  where accountability.lead_id = request_lead_id;

  if preliminary_company_id is null then
    raise exception using
      errcode = '23503',
      message = 'Lead accountability record was not found.';
  end if;

  if request_action in (
    'contacted',
    'appointment_scheduled',
    'inspection_completed',
    'estimate_sent',
    'won',
    'lost'
  ) then
    perform public.wtos_acquire_crm_identity_invariant_lock();
  end if;

  perform public.wtos_lock_accountability_operation(
    preliminary_company_id,
    request_operation_key
  );

  select accountability.*
  into current_accountability
  from public.lead_accountability as accountability
  where accountability.lead_id = request_lead_id
  for update;

  if current_accountability.id is null
    or current_accountability.company_id <> preliminary_company_id
  then
    raise exception using
      errcode = '40001',
      message = 'Lead accountability record changed during the action.';
  end if;

  select event.*
  into existing_event
  from public.lead_accountability_events as event
  where event.company_id = current_accountability.company_id
    and event.operation_key = request_operation_key;

  if existing_event.id is not null then
    if existing_event.lead_id <> request_lead_id
      or existing_event.request_fingerprint <> request_fingerprint
      or existing_event.event_type <> request_action
    then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different accountability action input.';
    end if;

    return jsonb_build_object(
      'status', 'idempotent',
      'action', request_action,
      'event_id', existing_event.id,
      'lead_id', existing_event.lead_id,
      'accountability_id', existing_event.lead_accountability_id,
      'record_version', existing_event.resulting_record_version
    );
  end if;

  if current_accountability.record_version <> request_expected_version then
    raise exception using
      errcode = '40001',
      message = 'Lead accountability record changed after review.';
  end if;

  if event_occurred_at < current_accountability.received_at
    or event_occurred_at > now()
  then
    raise exception using
      errcode = '22007',
      message = 'Accountability event time must be between lead receipt and the current time.';
  end if;

  if request_action in ('attribution_reviewed', 'owner_assigned') then
    if not service_request and not public.wtos_can_manage_marketing_accountability(
      current_accountability.company_id
    ) then
      raise exception using
        errcode = '42501',
        message = 'Owner or admin access is required for this accountability action.';
    end if;
  elsif not service_request and not public.wtos_can_manage_sales(
    current_accountability.company_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Sales access is required for this accountability action.';
  end if;

  if request_action not in ('attribution_reviewed', 'owner_assigned')
    and current_accountability.outcome <> 'open'
  then
    raise exception using
      errcode = '23514',
      message = 'Won or lost lead accountability is terminal.';
  end if;

  event_actor_kind := case
    when service_request and request_action = 'attribution_reviewed' then 'provider'
    when service_request then 'system'
    else 'user'
  end;
  event_source_key := current_accountability.source_key;
  event_source_detail := current_accountability.source_detail;
  event_campaign_id := current_accountability.campaign_id;

  if request_action = 'attribution_reviewed' then
    request_source_key := lower(nullif(btrim(action_request ->> 'source_key'), ''));
    request_source_detail := lower(nullif(btrim(action_request ->> 'source_detail'), ''));
    request_intake_provider := lower(nullif(btrim(action_request ->> 'intake_provider'), ''));
    request_campaign_id := nullif(action_request ->> 'campaign_id', '')::uuid;
    request_intake_record_id := nullif(action_request ->> 'intake_record_id', '')::uuid;
    request_evidence_kind := lower(nullif(btrim(action_request ->> 'evidence_kind'), ''));
    request_review_status := lower(nullif(btrim(action_request ->> 'review_status'), ''));
    request_reason_code := lower(nullif(btrim(action_request ->> 'reason_code'), ''));

    if not public.wtos_is_canonical_attribution_source(request_source_key)
      or (request_source_key = 'other' and request_source_detail is null)
      or request_evidence_kind not in (
        'provider_verified',
        'provider_metadata',
        'staff_selected',
        'customer_stated',
        'repeat_customer',
        'insufficient'
      )
      or request_review_status not in ('verified', 'needs_review', 'unattributed')
      or request_reason_code not in (
        'initial_review',
        'provider_evidence',
        'staff_correction',
        'campaign_correction',
        'unknown_confirmed'
      )
      or (
        request_source_detail is not null
        and request_source_detail !~ '^[a-z0-9][a-z0-9_-]{0,159}$'
      )
      or (
        request_intake_provider is not null
        and request_intake_provider !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
      )
    then
      raise exception using
        errcode = '22023',
        message = 'Attribution review contains invalid evidence fields.';
    end if;

    if request_source_key = 'repeat_customer'
      or request_evidence_kind = 'repeat_customer'
    then
      raise exception using
        errcode = '42501',
        message = 'Repeat-customer attribution requires the reviewed Customer 360 workflow.';
    end if;

    if request_source_key = 'unknown' and (
      request_review_status not in ('needs_review', 'unattributed')
      or request_evidence_kind <> 'insufficient'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Unknown acquisition evidence must remain unattributed or needs review.';
    end if;

    if request_source_key <> 'unknown' and (
      request_review_status <> 'verified'
      or request_evidence_kind = 'insufficient'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Verified acquisition source requires explicit evidence.';
    end if;

    if request_evidence_kind in ('provider_verified', 'provider_metadata')
      and not service_request
    then
      raise exception using
        errcode = '42501',
        message = 'Provider evidence may only be asserted by a trusted provider pathway.';
    end if;

    if request_evidence_kind in ('provider_verified', 'provider_metadata')
      and not public.wtos_is_deterministic_attribution_evidence(
        request_source_key,
        request_intake_provider,
        request_evidence_kind
      )
    then
      raise exception using
        errcode = '23514',
        message = 'Provider attribution evidence is not deterministic for this source and provider.';
    end if;

    if (
      request_evidence_kind in ('provider_verified', 'provider_metadata')
      and request_reason_code <> 'provider_evidence'
    ) or (
      request_evidence_kind not in ('provider_verified', 'provider_metadata')
      and request_reason_code = 'provider_evidence'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Provider evidence kind and review reason must agree.';
    end if;

    event_actor_kind := case
      when service_request
        and request_evidence_kind in ('provider_verified', 'provider_metadata')
      then 'provider'
      when service_request then 'system'
      else 'user'
    end;

    if request_campaign_id is not null then
      select campaign.*
      into selected_campaign
      from public.marketing_campaigns as campaign
      where campaign.id = request_campaign_id
        and campaign.company_id = current_accountability.company_id
      for share;

      if selected_campaign.id is null then
        raise exception using
          errcode = '23503',
          message = 'Marketing campaign was not found in the selected company.';
      end if;

      if selected_campaign.source_key is distinct from request_source_key
        or selected_campaign.source_detail is distinct from request_source_detail
        or selected_campaign.intake_provider is distinct from request_intake_provider
      then
        raise exception using
          errcode = '23514',
          message = 'Marketing campaign semantics do not exactly match lead attribution.';
      end if;
    end if;

    if request_intake_record_id is not null and not exists (
      select 1
      from public.lead_intake_records as intake
      where intake.id = request_intake_record_id
        and intake.company_id = current_accountability.company_id
        and intake.linked_lead_id = request_lead_id
    ) then
      raise exception using
        errcode = '23503',
        message = 'Lead intake record does not prove this company-scoped lead.';
    end if;

    update public.lead_accountability
    set
      source_key = request_source_key,
      source_detail = request_source_detail,
      intake_provider = request_intake_provider,
      campaign_id = request_campaign_id,
      intake_record_id = request_intake_record_id,
      evidence_kind = request_evidence_kind,
      review_status = request_review_status,
      reviewed_by = actor_user_id,
      reviewed_at = now(),
      attribution_locked_at = case
        when request_source_key = 'unknown' then null
        else now()
      end,
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    event_reason_code := request_reason_code;
    event_source_key := request_source_key;
    event_source_detail := request_source_detail;
    event_campaign_id := request_campaign_id;
    event_linked_table := case
      when request_intake_record_id is null then 'leads'
      else 'lead_intake_records'
    end;
    event_linked_record_id := coalesce(request_intake_record_id, request_lead_id);
  elsif request_action = 'owner_assigned' then
    request_owner_key_present := action_request ? 'owner_user_id';
    request_owner_user_id := nullif(action_request ->> 'owner_user_id', '')::uuid;

    if not request_owner_key_present then
      raise exception using
        errcode = '22023',
        message = 'Owner assignment action must explicitly include owner_user_id or null.';
    end if;

    if request_owner_user_id is not null and not exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = request_owner_user_id
        and membership.company_id = current_accountability.company_id
        and membership.role not in ('customer_portal', 'employee_portal')
    ) then
      raise exception using
        errcode = '23514',
        message = 'Assigned lead owner must be an internal member of the selected company.';
    end if;

    update public.lead_accountability
    set
      owner_user_id = request_owner_user_id,
      owner_assigned_at = case
        when request_owner_user_id is null then null
        else now()
      end,
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    event_owner_user_id := request_owner_user_id;
  elsif request_action = 'contacted' then
    request_human_contact := coalesce((action_request ->> 'human_contact')::boolean, false);
    request_channel := lower(nullif(btrim(action_request ->> 'first_response_channel'), ''));

    if not request_human_contact
      or request_channel not in ('phone', 'sms', 'email', 'in_person', 'other')
    then
      raise exception using
        errcode = '23514',
        message = 'First response requires a successful human contact and channel.';
    end if;

    if current_accountability.first_response_at is not null then
      raise exception using
        errcode = '23514',
        message = 'First successful human response is already recorded.';
    end if;

    update public.lead_accountability
    set
      first_response_at = event_occurred_at,
      first_response_channel = request_channel,
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    update public.leads
    set
      status = case when status = 'new' then 'contacted' else status end,
      pipeline_stage = case
        when pipeline_stage = 'new_lead' then 'contacted'
        else pipeline_stage
      end
    where id = request_lead_id
      and company_id = current_accountability.company_id;

    event_channel := request_channel;
  elsif request_action = 'appointment_scheduled' then
    request_schedule_event_id := nullif(action_request ->> 'schedule_event_id', '')::uuid;

    if not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'contacted'
    ) then
      raise exception using
        errcode = '23514',
      message = 'Appointment scheduling requires a recorded successful human contact.';
    end if;

    if event_occurred_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'contacted'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Appointment milestone cannot occur before successful human contact.';
    end if;

    select schedule.company_id, schedule.lead_id, schedule.status, schedule.event_type
    into evidence_company_id, evidence_lead_id, evidence_status, evidence_type
    from public.schedule_events as schedule
    where schedule.id = request_schedule_event_id;

    if evidence_company_id is distinct from current_accountability.company_id
      or evidence_lead_id is distinct from request_lead_id
      or evidence_status not in ('scheduled', 'completed')
      or evidence_type not in ('inspection', 'estimate')
    then
      raise exception using
        errcode = '23514',
        message = 'Appointment milestone requires a linked scheduled company-scoped workflow event.';
    end if;

    if exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'appointment_scheduled'
        and event.linked_table = 'schedule_events'
        and event.linked_record_id = request_schedule_event_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'This appointment evidence is already recorded for the lead.';
    end if;

    update public.lead_accountability
    set
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    update public.leads
    set
      status = case
        when status in ('new', 'contacted') then 'qualified'
        else status
      end,
      pipeline_stage = case
        when pipeline_stage in ('new_lead', 'contacted') then 'estimate_scheduled'
        else pipeline_stage
      end
    where id = request_lead_id
      and company_id = current_accountability.company_id;

    event_linked_table := 'schedule_events';
    event_linked_record_id := request_schedule_event_id;
  elsif request_action = 'inspection_completed' then
    request_inspection_id := nullif(action_request ->> 'inspection_id', '')::uuid;

    if not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'appointment_scheduled'
    ) then
      raise exception using
        errcode = '23514',
      message = 'Inspection completion requires a recorded appointment milestone.';
    end if;

    if event_occurred_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'appointment_scheduled'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Inspection milestone cannot occur before its accountable appointment.';
    end if;

    select inspection.company_id, inspection.lead_id, inspection.status
    into evidence_company_id, evidence_lead_id, evidence_status
    from public.inspections as inspection
    where inspection.id = request_inspection_id;

    if evidence_company_id is distinct from current_accountability.company_id
      or evidence_lead_id is distinct from request_lead_id
      or not exists (
        select 1
        from public.inspections as inspection
        where inspection.id = request_inspection_id
          and (
            inspection.status in ('completed', 'passed', 'failed', 'no_work_needed')
            or inspection.completed_at is not null
          )
      )
    then
      raise exception using
        errcode = '23514',
        message = 'Inspection milestone requires a linked completed company-scoped inspection.';
    end if;

    if exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'inspection_completed'
        and event.linked_table = 'inspections'
        and event.linked_record_id = request_inspection_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'This inspection evidence is already recorded for the lead.';
    end if;

    update public.lead_accountability
    set
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    update public.leads
    set
      status = case
        when status in ('new', 'contacted') then 'qualified'
        else status
      end,
      pipeline_stage = case
        when pipeline_stage in ('new_lead', 'contacted') then 'estimate_scheduled'
        else pipeline_stage
      end
    where id = request_lead_id
      and company_id = current_accountability.company_id;

    event_linked_table := 'inspections';
    event_linked_record_id := request_inspection_id;
  elsif request_action = 'estimate_sent' then
    request_estimate_id := nullif(action_request ->> 'estimate_id', '')::uuid;

    if not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'inspection_completed'
    ) then
      raise exception using
        errcode = '23514',
      message = 'Estimate sent requires a recorded inspection completion milestone.';
    end if;

    if event_occurred_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'inspection_completed'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Estimate-sent milestone cannot occur before inspection completion.';
    end if;

    select estimate.company_id, estimate.lead_id, estimate.status
    into evidence_company_id, evidence_lead_id, evidence_status
    from public.estimates as estimate
    where estimate.id = request_estimate_id;

    if evidence_company_id is distinct from current_accountability.company_id
      or evidence_lead_id is distinct from request_lead_id
      or evidence_status <> 'sent'
    then
      raise exception using
        errcode = '23514',
        message = 'Estimate milestone requires a linked sent company-scoped estimate.';
    end if;

    if exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'estimate_sent'
        and event.linked_table = 'estimates'
        and event.linked_record_id = request_estimate_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'This estimate evidence is already recorded for the lead.';
    end if;

    update public.lead_accountability
    set
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    update public.leads
    set
      status = case
        when status in ('new', 'contacted', 'qualified') then 'estimate_sent'
        else status
      end,
      pipeline_stage = case
        when pipeline_stage in ('new_lead', 'contacted', 'estimate_scheduled') then 'estimate_sent'
        else pipeline_stage
      end
    where id = request_lead_id
      and company_id = current_accountability.company_id;

    event_linked_table := 'estimates';
    event_linked_record_id := request_estimate_id;
  elsif request_action = 'won' then
    if not exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'estimate_sent'
    ) then
      raise exception using
        errcode = '23514',
      message = 'Won outcome requires a recorded estimate sent milestone.';
    end if;

    if event_occurred_at < (
      select pg_catalog.max(event.occurred_at)
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'estimate_sent'
    ) then
      raise exception using
        errcode = '23514',
        message = 'Won outcome cannot occur before the accountable estimate-sent milestone.';
    end if;

    request_proposal_acceptance_id := nullif(
      action_request ->> 'proposal_acceptance_id',
      ''
    )::uuid;

    if request_proposal_acceptance_id is not null then
      select
        acceptance.company_id,
        estimate.lead_id,
        acceptance.accepted_total,
        acceptance.signature_status,
        acceptance.acceptance_method
      into
        evidence_company_id,
        evidence_lead_id,
        acceptance_value,
        acceptance_signature_status,
        acceptance_method
      from public.estimate_proposal_acceptances as acceptance
      join public.estimate_proposal_revisions as revision
        on revision.id = acceptance.proposal_revision_id
       and revision.company_id = acceptance.company_id
       and revision.estimate_id = acceptance.estimate_id
       and revision.customer_id is not distinct from acceptance.customer_id
      join public.estimates as estimate
        on estimate.id = acceptance.estimate_id
       and estimate.company_id = acceptance.company_id
       and estimate.customer_id is not distinct from acceptance.customer_id
      where acceptance.id = request_proposal_acceptance_id
        and (
          acceptance.customer_id is null
          or exists (
            select 1
            from public.customers as customer
            where customer.id = acceptance.customer_id
              and customer.company_id = acceptance.company_id
          )
        );

      if evidence_company_id is distinct from current_accountability.company_id
        or evidence_lead_id is distinct from request_lead_id
        or acceptance_value is null
        or acceptance_value = 'NaN'::numeric
        or acceptance_value <= 0
        or (
          acceptance_method = 'signature_provider'
          and acceptance_signature_status <> 'signed'
        )
      then
        raise exception using
          errcode = '23514',
          message = 'Won outcome requires a valid linked company-scoped proposal acceptance.';
      end if;

      request_won_value := acceptance_value;
      request_won_basis := case
        when acceptance_signature_status = 'signed' then 'signed_proposal'
        else 'accepted_proposal'
      end;
      event_linked_table := 'estimate_proposal_acceptances';
      event_linked_record_id := request_proposal_acceptance_id;
    else
      request_won_value := nullif(action_request ->> 'won_contract_value', '')::numeric;
      request_won_basis := lower(nullif(btrim(action_request ->> 'won_value_basis'), ''));

      if not service_request and not public.wtos_can_manage_marketing_accountability(
        current_accountability.company_id
      ) then
        raise exception using
          errcode = '42501',
          message = 'Owner or admin access is required to approve a manual contract total.';
      end if;

      if request_won_value is null
        or request_won_value = 'NaN'::numeric
        or request_won_value <= 0
        or request_won_basis <> 'approved_contract_total'
      then
        raise exception using
          errcode = '23514',
          message = 'Won outcome requires a positive approved contract total and basis.';
      end if;
    end if;

    if exists (
      select 1
      from public.lead_accountability_events as event
      where event.lead_accountability_id = current_accountability.id
        and event.event_type = 'won'
        and event.linked_table = event_linked_table
        and event.linked_record_id = event_linked_record_id
    ) then
      raise exception using
        errcode = '23514',
        message = 'This won evidence is already recorded for the lead.';
    end if;

    update public.lead_accountability
    set
      outcome = 'won',
      outcome_at = event_occurred_at,
      won_contract_value = request_won_value,
      won_value_basis = request_won_basis,
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    update public.leads
    set status = 'won', pipeline_stage = 'approved'
    where id = request_lead_id
      and company_id = current_accountability.company_id;

    event_outcome := 'won';
    event_won_value := request_won_value;
    event_won_basis := request_won_basis;
  elsif request_action = 'lost' then
    request_lost_reason := lower(nullif(btrim(action_request ->> 'lost_reason_code'), ''));
    request_lost_notes := nullif(btrim(action_request ->> 'lost_reason_notes'), '');

    if request_lost_reason not in (
      'price',
      'no_response',
      'chose_competitor',
      'postponed',
      'not_qualified',
      'outside_service_area',
      'insurance_denied',
      'scope_mismatch',
      'duplicate',
      'other'
    ) or (request_lost_reason = 'other' and request_lost_notes is null)
      or length(coalesce(request_lost_notes, '')) > 2000
    then
      raise exception using
        errcode = '23514',
        message = 'Lost outcome requires a structured reason; other requires notes.';
    end if;

    update public.lead_accountability
    set
      outcome = 'lost',
      outcome_at = event_occurred_at,
      lost_reason_code = request_lost_reason,
      lost_reason_notes = request_lost_notes,
      record_version = record_version + 1,
      last_operation_key = request_operation_key,
      last_request_fingerprint = request_fingerprint
    where id = current_accountability.id
    returning * into updated_accountability;

    update public.leads
    set status = 'lost', pipeline_stage = 'lost'
    where id = request_lead_id
      and company_id = current_accountability.company_id;

    event_outcome := 'lost';
    event_lost_reason := request_lost_reason;
  end if;

  insert into public.lead_accountability_events (
    lead_accountability_id,
    company_id,
    lead_id,
    event_type,
    operation_key,
    request_fingerprint,
    actor_user_id,
    actor_kind,
    reason_code,
    source_key,
    source_detail,
    intake_provider,
    campaign_id,
    owner_user_id,
    first_response_channel,
    linked_table,
    linked_record_id,
    outcome,
    lost_reason_code,
    won_contract_value,
    won_value_basis,
    occurred_at,
    resulting_record_version
  ) values (
    updated_accountability.id,
    updated_accountability.company_id,
    updated_accountability.lead_id,
    request_action,
    request_operation_key,
    request_fingerprint,
    actor_user_id,
    event_actor_kind,
    event_reason_code,
    coalesce(event_source_key, updated_accountability.source_key),
    coalesce(event_source_detail, updated_accountability.source_detail),
    updated_accountability.intake_provider,
    coalesce(event_campaign_id, updated_accountability.campaign_id),
    event_owner_user_id,
    event_channel,
    event_linked_table,
    event_linked_record_id,
    event_outcome,
    event_lost_reason,
    event_won_value,
    event_won_basis,
    event_occurred_at,
    updated_accountability.record_version
  )
  returning id into created_event_id;

  return jsonb_build_object(
    'status', 'applied',
    'action', request_action,
    'event_id', created_event_id,
    'lead_id', updated_accountability.lead_id,
    'accountability_id', updated_accountability.id,
    'record_version', updated_accountability.record_version
  );
end;
$$;

create or replace function public.wtos_create_repeat_opportunity(
  opportunity_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_customer_id uuid;
  request_customer_expected_updated_at timestamptz;
  request_property_id uuid;
  request_property_expected_updated_at timestamptz;
  request_operation_key text;
  request_service_type text;
  request_owner_user_id uuid;
  request_priority text;
  request_next_follow_up date;
  request_notes text;
  request_received_at timestamptz;
  request_fingerprint text;
  service_request boolean := public.wtos_is_service_role_request();
  selected_customer public.customers%rowtype;
  selected_property public.properties%rowtype;
  existing_event public.lead_accountability_events%rowtype;
  existing_accountability public.lead_accountability%rowtype;
  existing_lead public.leads%rowtype;
  accountable_request jsonb;
  accountable_result jsonb;
  created_lead_id uuid;
begin
  if pg_catalog.jsonb_typeof(opportunity_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Repeat opportunity request must be a JSON object.';
  end if;

  request_company_id := nullif(opportunity_request ->> 'company_id', '')::uuid;
  request_customer_id := nullif(opportunity_request ->> 'customer_id', '')::uuid;
  request_customer_expected_updated_at := nullif(
    opportunity_request ->> 'customer_expected_updated_at',
    ''
  )::timestamptz;
  request_property_id := nullif(opportunity_request ->> 'property_id', '')::uuid;
  request_property_expected_updated_at := nullif(
    opportunity_request ->> 'property_expected_updated_at',
    ''
  )::timestamptz;
  request_operation_key := nullif(pg_catalog.btrim(opportunity_request ->> 'operation_key'), '');
  request_service_type := pg_catalog.lower(nullif(pg_catalog.btrim(opportunity_request ->> 'service_type'), ''));
  request_owner_user_id := nullif(opportunity_request ->> 'owner_user_id', '')::uuid;
  request_priority := coalesce(
    pg_catalog.lower(nullif(pg_catalog.btrim(opportunity_request ->> 'priority'), '')),
    'normal'
  );
  request_next_follow_up := nullif(opportunity_request ->> 'next_follow_up', '')::date;
  request_notes := nullif(opportunity_request ->> 'notes', '');
  request_received_at := nullif(opportunity_request ->> 'received_at', '')::timestamptz;

  if not service_request then
    request_received_at := null;
  end if;

  if request_operation_key is null
    or request_operation_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using
      errcode = '22023',
      message = 'Repeat opportunity request contains invalid fields.';
  end if;

  request_operation_key := request_operation_key::uuid::text;

  if request_company_id is null
    or request_customer_id is null
    or request_customer_expected_updated_at is null
    or request_service_type not in ('roofing', 'painting', 'both')
    or request_priority not in ('low', 'normal', 'high', 'urgent')
    or (request_notes is not null and pg_catalog.length(request_notes) > 4000)
    or (request_property_id is null and request_property_expected_updated_at is not null)
    or (request_property_id is not null and request_property_expected_updated_at is null)
  then
    raise exception using
      errcode = '22023',
      message = 'Repeat opportunity request contains invalid fields.';
  end if;

  request_fingerprint := public.wtos_json_fingerprint(
    pg_catalog.jsonb_build_object(
      'contract', 'repeat_opportunity_v1',
      'operation_key', request_operation_key,
      'company_id', request_company_id,
      'customer_id', request_customer_id,
      'customer_expected_updated_at', request_customer_expected_updated_at,
      'property_id', request_property_id,
      'property_expected_updated_at', request_property_expected_updated_at,
      'service_type', request_service_type,
      'owner_user_id', request_owner_user_id,
      'priority', request_priority,
      'next_follow_up', request_next_follow_up,
      'notes', request_notes,
      'received_at', request_received_at
    )
  );

  if not service_request
    and not public.wtos_can_manage_sales(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Sales access is required to create a repeat-customer opportunity.';
  end if;

  perform public.wtos_acquire_crm_identity_invariant_lock();

  perform public.wtos_lock_accountability_operation(
    request_company_id,
    request_operation_key
  );

  select event.*
  into existing_event
  from public.lead_accountability_events as event
  where event.company_id = request_company_id
    and event.operation_key = request_operation_key;

  if existing_event.id is not null then
    if existing_event.request_fingerprint <> request_fingerprint
      or existing_event.event_type is distinct from 'attribution_reviewed'
      or existing_event.reason_code is distinct from 'repeat_customer'
    then
      raise exception using
        errcode = '23000',
        message = 'Operation key was already used with different repeat-opportunity review input.';
    end if;

    select accountability.*
    into existing_accountability
    from public.lead_accountability as accountability
    where accountability.id = existing_event.lead_accountability_id
      and accountability.company_id = request_company_id
      and accountability.lead_id = existing_event.lead_id;

    select lead.*
    into existing_lead
    from public.leads as lead
    where lead.id = existing_event.lead_id
      and lead.company_id = request_company_id;

    if existing_accountability.id is null
      or existing_accountability.source_key <> 'repeat_customer'
      or existing_accountability.source_detail is not null
      or existing_accountability.intake_provider is distinct from 'manual'
      or existing_lead.id is null
      or existing_lead.customer_id is distinct from request_customer_id
      or existing_lead.property_id is distinct from request_property_id
    then
      raise exception using
        errcode = '23514',
        message = 'Idempotent repeat opportunity conflicts with its reviewed customer or property graph.';
    end if;

    return pg_catalog.jsonb_build_object(
      'status', 'idempotent',
      'lead_id', existing_lead.id,
      'accountability_id', existing_accountability.id,
      'record_version', existing_accountability.record_version
    );
  end if;

  select customer.*
  into selected_customer
  from public.customers as customer
  where customer.id = request_customer_id
    and customer.company_id = request_company_id
  for update;

  if selected_customer.id is null then
    raise exception using
      errcode = '23503',
      message = 'Repeat-customer opportunity requires a customer in the selected company.';
  end if;

  if selected_customer.updated_at is distinct from request_customer_expected_updated_at then
    raise exception using
      errcode = '40001',
      message = 'Repeat-opportunity customer changed after review.';
  end if;

  if request_property_id is not null then
    select property.*
    into selected_property
    from public.properties as property
    where property.id = request_property_id
      and property.company_id = request_company_id
      and property.customer_id = request_customer_id
    for update;

    if selected_property.id is null then
      raise exception using
        errcode = '23503',
        message = 'Repeat opportunity property must belong to the customer and selected company.';
    end if;

    if selected_property.updated_at is distinct from request_property_expected_updated_at then
      raise exception using
        errcode = '40001',
        message = 'Repeat-opportunity property changed after review.';
    end if;
  end if;

  accountable_request := pg_catalog.jsonb_build_object(
    'operation_key', request_operation_key,
    'company_id', request_company_id,
    'contact_name', selected_customer.contact_name,
    'phone', selected_customer.phone,
    'email', selected_customer.email,
    'property_address', coalesce(selected_property.address, selected_customer.property_address),
    'city', coalesce(selected_property.city, selected_customer.city),
    'state', coalesce(selected_property.state, selected_customer.state),
    'postal_code', coalesce(selected_property.postal_code, selected_customer.postal_code),
    'service_type', request_service_type,
    'priority', request_priority,
    'next_follow_up', request_next_follow_up,
    'notes', request_notes,
    'source_key', 'repeat_customer',
    'source_detail', null,
    'intake_provider', 'manual',
    'campaign_id', null,
    'intake_record_id', null,
    'evidence_kind', 'repeat_customer',
    'review_status', 'verified',
    'owner_user_id', request_owner_user_id,
    'repeat_request_fingerprint', request_fingerprint
  );

  if service_request and request_received_at is not null then
    accountable_request := accountable_request || pg_catalog.jsonb_build_object(
      'received_at', request_received_at
    );
  end if;

  accountable_result := public.wtos_create_accountable_lead_core(
    accountable_request,
    true
  );
  created_lead_id := (accountable_result ->> 'lead_id')::uuid;

  if not exists (
    select 1
    from public.leads as lead
    where lead.id = created_lead_id
      and lead.company_id = request_company_id
      and lead.customer_id is null
      and lead.property_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'New repeat opportunity lead was unexpectedly linked before reviewed graph assignment.';
  end if;

  update public.leads
  set
    customer_id = request_customer_id,
    property_id = request_property_id
  where id = created_lead_id
    and company_id = request_company_id;

  return accountable_result;
end;
$$;

create or replace function public.wtos_marketing_metrics_for_scope(
  target_company_id uuid,
  target_month date,
  target_source_key text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  month_start timestamptz;
  month_end timestamptz;
  phoenix_today date;
  lead_count_value bigint;
  spend_value numeric;
  booked_count bigint;
  inspection_count bigint;
  won_count bigint;
  revenue_value numeric;
  awaiting_contact_count bigint;
  overdue_follow_up_count bigint;
  missing_follow_up_count bigint;
  unattributed_count bigint;
  missing_won_value_count bigint;
  untracked_legacy_count bigint;
  workflow_linkage_gap_count bigint;
begin
  month_start := target_month::timestamp at time zone 'America/Phoenix';
  month_end := (target_month + interval '1 month')::timestamp at time zone 'America/Phoenix';
  phoenix_today := (pg_catalog.now() at time zone 'America/Phoenix')::date;

  with cohort as (
    select
      accountability.*,
      lead.next_follow_up,
      exists (
        select 1
        from public.lead_accountability_events as event
        where event.lead_accountability_id = accountability.id
          and event.event_type = 'appointment_scheduled'
      ) as is_booked,
      exists (
        select 1
        from public.lead_accountability_events as event
        where event.lead_accountability_id = accountability.id
          and event.event_type = 'inspection_completed'
      ) as is_inspected,
      exists (
        select 1
        from public.lead_accountability_events as event
        where event.lead_accountability_id = accountability.id
          and event.event_type = 'estimate_sent'
      ) as has_estimate_sent
    from public.lead_accountability as accountability
    join public.leads as lead
      on lead.id = accountability.lead_id
     and lead.company_id = accountability.company_id
    where accountability.company_id = target_company_id
      and accountability.received_at >= month_start
      and accountability.received_at < month_end
      and (
        target_source_key is null
        or accountability.source_key = target_source_key
      )
  )
  select
    pg_catalog.count(*),
    pg_catalog.count(*) filter (where is_booked),
    pg_catalog.count(*) filter (where is_inspected),
    pg_catalog.count(*) filter (where outcome = 'won'),
    coalesce(
      pg_catalog.sum(won_contract_value) filter (
        where outcome = 'won'
          and review_status = 'verified'
          and source_key <> 'unknown'
      ),
      0
    ),
    pg_catalog.count(*) filter (
      where outcome = 'open' and first_response_at is null
    ),
    pg_catalog.count(*) filter (
      where outcome = 'open'
        and has_estimate_sent
        and next_follow_up is not null
        and next_follow_up < phoenix_today
    ),
    pg_catalog.count(*) filter (
      where outcome = 'open'
        and has_estimate_sent
        and next_follow_up is null
    ),
    pg_catalog.count(*) filter (
      where source_key = 'unknown' or review_status <> 'verified'
    ),
    pg_catalog.count(*) filter (
      where outcome = 'won' and won_contract_value is null
    )
  into
    lead_count_value,
    booked_count,
    inspection_count,
    won_count,
    revenue_value,
    awaiting_contact_count,
    overdue_follow_up_count,
    missing_follow_up_count,
    unattributed_count,
    missing_won_value_count
  from cohort;

  select coalesce(pg_catalog.sum(spend.spend_amount), 0)
  into spend_value
  from public.marketing_spend_months as spend
  where spend.company_id = target_company_id
    and spend.spend_month = target_month
    and (target_source_key is null or spend.source_key = target_source_key);

  -- Legacy rows have no defensible source allocation. Keep this as the full
  -- company/month total even when accountable metrics are source-filtered.
  select pg_catalog.count(*)
  into untracked_legacy_count
  from public.leads as lead
  where lead.company_id = target_company_id
    and lead.created_at >= month_start
    and lead.created_at < month_end
    and not exists (
      select 1
      from public.lead_accountability as accountability
      where accountability.company_id = target_company_id
        and accountability.lead_id = lead.id
    );

  select pg_catalog.count(*)
  into workflow_linkage_gap_count
  from public.lead_accountability as accountability
  where accountability.company_id = target_company_id
    and accountability.received_at >= month_start
    and accountability.received_at < month_end
    and (target_source_key is null or accountability.source_key = target_source_key)
    and (
      exists (
        select 1
        from public.schedule_events as schedule
        where schedule.company_id = accountability.company_id
          and schedule.lead_id = accountability.lead_id
          and schedule.event_type in ('inspection', 'estimate')
          and schedule.status in ('scheduled', 'completed')
          and not exists (
            select 1
            from public.lead_accountability_events as event
            where event.lead_accountability_id = accountability.id
              and event.event_type = 'appointment_scheduled'
              and event.linked_table = 'schedule_events'
              and event.linked_record_id = schedule.id
          )
      )
      or exists (
        select 1
        from public.inspections as inspection
        left join public.estimates as estimate
          on estimate.id = inspection.estimate_id
         and estimate.company_id = inspection.company_id
        left join public.jobs as job
          on job.id = inspection.job_id
         and job.company_id = inspection.company_id
        where inspection.company_id = accountability.company_id
          and (
            inspection.lead_id = accountability.lead_id
            or estimate.lead_id = accountability.lead_id
            or job.lead_id = accountability.lead_id
          )
          and (
            inspection.status in ('completed', 'passed', 'failed', 'no_work_needed')
            or inspection.completed_at is not null
          )
          and not exists (
            select 1
            from public.lead_accountability_events as event
            where event.lead_accountability_id = accountability.id
              and event.event_type = 'inspection_completed'
              and event.linked_table = 'inspections'
              and event.linked_record_id = inspection.id
          )
      )
      or exists (
        select 1
        from public.estimates as estimate
        where estimate.company_id = accountability.company_id
          and estimate.lead_id = accountability.lead_id
          and estimate.status = 'sent'
          and not exists (
            select 1
            from public.lead_accountability_events as event
            where event.lead_accountability_id = accountability.id
              and event.event_type = 'estimate_sent'
              and event.linked_table = 'estimates'
              and event.linked_record_id = estimate.id
          )
      )
      or exists (
        select 1
        from public.estimate_proposal_acceptances as acceptance
        join public.estimate_proposal_revisions as revision
          on revision.id = acceptance.proposal_revision_id
         and revision.company_id = acceptance.company_id
         and revision.estimate_id = acceptance.estimate_id
         and revision.customer_id is not distinct from acceptance.customer_id
        join public.estimates as estimate
          on estimate.id = acceptance.estimate_id
         and estimate.company_id = acceptance.company_id
         and estimate.customer_id is not distinct from acceptance.customer_id
        where acceptance.company_id = accountability.company_id
          and estimate.lead_id = accountability.lead_id
          and (
            acceptance.customer_id is null
            or exists (
              select 1
              from public.customers as customer
              where customer.id = acceptance.customer_id
                and customer.company_id = acceptance.company_id
            )
          )
          and acceptance.accepted_total <> 'NaN'::numeric
          and acceptance.accepted_total > 0
          and (
            acceptance.acceptance_method <> 'signature_provider'
            or acceptance.signature_status = 'signed'
          )
          and not exists (
            select 1
            from public.lead_accountability_events as event
            where event.lead_accountability_id = accountability.id
              and event.event_type = 'won'
              and event.linked_table = 'estimate_proposal_acceptances'
              and event.linked_record_id = acceptance.id
          )
      )
    );

  return pg_catalog.jsonb_build_object(
    'lead_count', lead_count_value,
    'marketing_spend', spend_value,
    'cost_per_lead', case
      when lead_count_value = 0 then null
      else spend_value / lead_count_value
    end,
    'booked_lead_count', booked_count,
    'booking_rate', case
      when lead_count_value = 0 then null
      else booked_count::numeric / lead_count_value
    end,
    'inspection_completed_lead_count', inspection_count,
    'inspection_completion_rate', case
      when booked_count = 0 then null
      else inspection_count::numeric / booked_count
    end,
    'won_lead_count', won_count,
    'closing_rate', case
      when inspection_count = 0 then null
      else won_count::numeric / inspection_count
    end,
    'cost_per_sold_job', case
      when won_count = 0 then null
      else spend_value / won_count
    end,
    'attributed_contract_revenue', revenue_value,
    'marketing_revenue_divided_by_spend', case
      when spend_value = 0 then null
      else revenue_value / spend_value
    end,
    'new_awaiting_contact', awaiting_contact_count,
    'unsold_estimates_overdue', overdue_follow_up_count,
    'unsold_estimates_missing_follow_up', missing_follow_up_count,
    'unattributed_lead_count', unattributed_count,
    'attribution_coverage', case
      when lead_count_value = 0 then null
      else (lead_count_value - unattributed_count)::numeric / lead_count_value
    end,
    'missing_won_value_count', missing_won_value_count,
    'workflow_linkage_gap_count', workflow_linkage_gap_count,
    'untracked_legacy_lead_count', untracked_legacy_count,
    'untracked_legacy_lead_scope', 'company_month_unallocatable',
    'untracked_legacy_lead_source_allocatable', false
  );
end;
$$;

create or replace function public.wtos_get_marketing_accountability_dashboard(
  report_request jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  request_company_id uuid;
  request_month date;
  request_source_key text;
  metrics_result jsonb;
  by_source_result jsonb;
begin
  if pg_catalog.jsonb_typeof(report_request) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Marketing accountability report request must be a JSON object.';
  end if;

  request_company_id := nullif(report_request ->> 'company_id', '')::uuid;
  request_month := nullif(report_request ->> 'month', '')::date;
  request_source_key := pg_catalog.lower(nullif(pg_catalog.btrim(report_request ->> 'source_key'), ''));

  if request_company_id is null
    or request_month is null
    or request_month <> pg_catalog.date_trunc('month', request_month)::date
    or (
      request_source_key is not null
      and not public.wtos_is_canonical_attribution_source(request_source_key)
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Marketing accountability report request contains invalid fields.';
  end if;

  if not public.wtos_is_service_role_request()
    and not public.wtos_can_read_company(request_company_id)
  then
    raise exception using
      errcode = '42501',
      message = 'Company access is required to view marketing accountability.';
  end if;

  metrics_result := public.wtos_marketing_metrics_for_scope(
    request_company_id,
    request_month,
    request_source_key
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'source_key', source.source_key,
        'lead_count', source.metrics -> 'lead_count',
        'marketing_spend', source.metrics -> 'marketing_spend',
        'cost_per_lead', source.metrics -> 'cost_per_lead',
        'booked_lead_count', source.metrics -> 'booked_lead_count',
        'booking_rate', source.metrics -> 'booking_rate',
        'inspection_completed_lead_count', source.metrics -> 'inspection_completed_lead_count',
        'inspection_completion_rate', source.metrics -> 'inspection_completion_rate',
        'won_lead_count', source.metrics -> 'won_lead_count',
        'closing_rate', source.metrics -> 'closing_rate',
        'cost_per_sold_job', source.metrics -> 'cost_per_sold_job',
        'attributed_contract_revenue', source.metrics -> 'attributed_contract_revenue',
        'marketing_revenue_divided_by_spend', source.metrics -> 'marketing_revenue_divided_by_spend',
        'unattributed_lead_count', source.metrics -> 'unattributed_lead_count',
        'attribution_coverage', source.metrics -> 'attribution_coverage',
        'missing_won_value_count', source.metrics -> 'missing_won_value_count',
        'workflow_linkage_gap_count', source.metrics -> 'workflow_linkage_gap_count'
      )
      order by source.source_key
    ),
    '[]'::jsonb
  )
  into by_source_result
  from (
    select
      source_key,
      public.wtos_marketing_metrics_for_scope(
        request_company_id,
        request_month,
        source_key
      ) as metrics
    from pg_catalog.unnest(array[
      'website',
      'google',
      'yelp',
      'phone',
      'email',
      'referral',
      'repeat_customer',
      'manual',
      'other',
      'unknown'
    ]::text[]) as source_key
    where request_source_key is null or source_key = request_source_key
  ) as source;

  return pg_catalog.jsonb_build_object(
    'company_id', request_company_id,
    'month', pg_catalog.to_char(request_month, 'YYYY-MM-DD'),
    'timezone', 'America/Phoenix',
    'source_key', request_source_key,
    'metrics', metrics_result,
    'by_source', by_source_result
  );
end;
$$;

create or replace function public.wtos_protect_accountability_test_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  synthetic_marker text;
begin
  if not public.wtos_is_service_role_request() then
    raise exception using
      errcode = '42501',
      message = 'Accountability records may only be removed by the isolated test cleanup pathway.';
  end if;

  if tg_table_name = 'lead_accountability' then
    select coalesce(
      nullif(pg_catalog.to_jsonb(lead) ->> 'contact_name', ''),
      nullif(pg_catalog.to_jsonb(lead) ->> 'customer_name', ''),
      ''
    )
    into synthetic_marker
    from public.leads as lead
    where lead.id = old.lead_id
      and lead.company_id = old.company_id;
  elsif tg_table_name = 'marketing_campaigns' then
    synthetic_marker := old.campaign_name;
  elsif tg_table_name = 'marketing_spend_months' then
    synthetic_marker := old.notes;
  end if;

  if synthetic_marker like 'TEST WTOS REGRESSION %'
    or synthetic_marker like 'TEST WTOS LEAD ACCOUNTABILITY REGRESSION:%'
  then
    return old;
  end if;

  raise exception using
    errcode = '42501',
    message = 'Only exact isolated-test accountability records may be removed.';
end;
$$;

drop trigger if exists lead_accountability_test_cleanup_guard
on public.lead_accountability;
create trigger lead_accountability_test_cleanup_guard
before delete on public.lead_accountability
for each row execute function public.wtos_protect_accountability_test_cleanup();

drop trigger if exists marketing_campaigns_test_cleanup_guard
on public.marketing_campaigns;
create trigger marketing_campaigns_test_cleanup_guard
before delete on public.marketing_campaigns
for each row execute function public.wtos_protect_accountability_test_cleanup();

drop trigger if exists marketing_spend_months_test_cleanup_guard
on public.marketing_spend_months;
create trigger marketing_spend_months_test_cleanup_guard
before delete on public.marketing_spend_months
for each row execute function public.wtos_protect_accountability_test_cleanup();

alter table public.marketing_campaigns enable row level security;
alter table public.lead_accountability enable row level security;
alter table public.lead_accountability_events enable row level security;
alter table public.marketing_spend_months enable row level security;

revoke all on table public.marketing_campaigns from public, anon, authenticated, service_role;
revoke all on table public.lead_accountability from public, anon, authenticated, service_role;
revoke all on table public.lead_accountability_events from public, anon, authenticated, service_role;
revoke all on table public.marketing_spend_months from public, anon, authenticated, service_role;

grant select on table public.marketing_campaigns to authenticated, service_role;
grant select on table public.lead_accountability to authenticated, service_role;
grant select on table public.lead_accountability_events to authenticated, service_role;
grant select on table public.marketing_spend_months to authenticated, service_role;

grant delete on table public.marketing_campaigns to service_role;
grant delete on table public.lead_accountability to service_role;
grant delete on table public.lead_accountability_events to service_role;
grant delete on table public.marketing_spend_months to service_role;

create policy "Company members read marketing campaigns"
on public.marketing_campaigns
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "Company members read lead accountability"
on public.lead_accountability
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "Company members read lead accountability events"
on public.lead_accountability_events
for select
to authenticated
using (public.wtos_can_read_company(company_id));

create policy "Company members read marketing spend"
on public.marketing_spend_months
for select
to authenticated
using (public.wtos_can_read_company(company_id));

revoke all on function public.wtos_is_service_role_request()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_can_manage_marketing_accountability(uuid)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_json_fingerprint(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_lock_accountability_operation(uuid, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_lock_marketing_identity(text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_is_canonical_attribution_source(text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_is_deterministic_attribution_evidence(text, text, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_validate_lead_accountability_scope()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_validate_marketing_spend_scope()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_validate_accountability_event_scope()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_protect_lead_accountability_event()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_initialize_lead_accountability()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_apply_verified_intake_attribution()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_enforce_accountable_lead_outcome()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_enforce_accountable_lead_funnel_linkage()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_record_automatic_lead_milestone(uuid, uuid, text, text, uuid, timestamptz, numeric, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_capture_schedule_accountability_milestone()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_capture_inspection_accountability_milestone()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_capture_estimate_accountability_milestone()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_validate_proposal_acceptance_scope()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_capture_proposal_acceptance_win()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_marketing_metrics_for_scope(uuid, date, text)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_protect_accountability_test_cleanup()
from public, anon, authenticated, service_role;
revoke all on function public.wtos_create_accountable_lead_core(jsonb, boolean)
from public, anon, authenticated, service_role;

revoke all on function public.wtos_create_accountable_lead(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_apply_lead_accountability_action(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_upsert_marketing_campaign(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_upsert_marketing_spend(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_create_repeat_opportunity(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_get_marketing_accountability_dashboard(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_create_accountable_lead(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_apply_lead_accountability_action(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_upsert_marketing_campaign(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_upsert_marketing_spend(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_create_repeat_opportunity(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_get_marketing_accountability_dashboard(jsonb)
to authenticated, service_role;

commit;
