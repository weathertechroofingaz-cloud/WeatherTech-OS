begin;

create extension if not exists pgcrypto;

create table if not exists public.lead_intake_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  linked_lead_id uuid references public.leads(id) on delete set null,
  linked_customer_id uuid references public.customers(id) on delete set null,
  related_communication_event_id uuid references public.communication_provider_events(id) on delete set null,
  integration_sync_log_id uuid references public.integration_sync_logs(id) on delete set null,
  provider text not null check (
    provider in (
      'manual',
      'website',
      'yelp',
      'twilio',
      'twilio_sms',
      'gohighlevel',
      'gmail',
      'referral',
      'email'
    )
  ),
  provider_event_id text,
  source text not null,
  source_detail text,
  campaign text,
  correlation_id text not null default gen_random_uuid()::text,
  company_key text not null default 'unassigned' check (
    company_key in ('weathertech_roofing', 'ihc_painting', 'unassigned')
  ),
  branch_key text not null default 'unassigned' check (
    branch_key in ('weathertech_phoenix', 'weathertech_tucson', 'ihc', 'unassigned')
  ),
  routing_status text not null default 'needs_review' check (
    routing_status in ('ready_to_create', 'needs_review', 'unassigned')
  ),
  status text not null default 'new' check (
    status in (
      'new',
      'needs_review',
      'lead_created',
      'duplicate',
      'non_lead',
      'dismissed'
    )
  ),
  duplicate_confidence text not null default 'no_match' check (
    duplicate_confidence in ('exact_match', 'likely_match', 'possible_match', 'no_match')
  ),
  follow_up_state text not null default 'not_required' check (
    follow_up_state in ('not_required', 'required', 'scheduled', 'completed')
  ),
  urgency text not null default 'normal' check (
    urgency in ('low', 'normal', 'high', 'urgent')
  ),
  assigned_queue text,
  assigned_user_id uuid references public.profiles(id) on delete set null,
  first_name text,
  last_name text,
  contact_name text not null,
  company_name text,
  phone text,
  email text,
  service_address text,
  city text,
  state text not null default 'AZ',
  postal_code text,
  requested_service text check (
    requested_service is null or requested_service in ('roofing', 'painting', 'both')
  ),
  message text,
  preferred_contact_method text not null default 'unknown' check (
    preferred_contact_method in ('phone', 'sms', 'email', 'unknown')
  ),
  receiving_business_phone_number text,
  consent_metadata jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  safe_raw_source_reference text,
  possible_matches jsonb not null default '[]'::jsonb,
  routing_reasons jsonb not null default '[]'::jsonb,
  review_notes text,
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  non_lead_reason text,
  intake_timestamp timestamptz not null default now(),
  original_submission_timestamp timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_intake_records_correlation_uidx
on public.lead_intake_records(correlation_id);

create unique index if not exists lead_intake_records_provider_event_uidx
on public.lead_intake_records(provider, provider_event_id)
where provider_event_id is not null;

create index if not exists lead_intake_records_company_status_idx
on public.lead_intake_records(company_id, status, intake_timestamp desc);

create index if not exists lead_intake_records_route_review_idx
on public.lead_intake_records(company_key, branch_key, routing_status, intake_timestamp desc);

create index if not exists lead_intake_records_duplicate_idx
on public.lead_intake_records(duplicate_confidence, intake_timestamp desc)
where duplicate_confidence <> 'no_match';

create index if not exists lead_intake_records_follow_up_idx
on public.lead_intake_records(follow_up_state, intake_timestamp desc)
where follow_up_state in ('required', 'scheduled');

create index if not exists lead_intake_records_linked_lead_idx
on public.lead_intake_records(linked_lead_id)
where linked_lead_id is not null;

drop trigger if exists lead_intake_records_set_updated_at
on public.lead_intake_records;
create trigger lead_intake_records_set_updated_at
before update on public.lead_intake_records
for each row execute function public.set_updated_at();

alter table public.lead_intake_records enable row level security;

revoke all on table public.lead_intake_records from anon;
revoke all on table public.lead_intake_records from public;

grant select, insert, update on table public.lead_intake_records to authenticated;
grant select, insert, update, delete on table public.lead_intake_records to service_role;

drop policy if exists "Company members read lead intake records"
on public.lead_intake_records;
create policy "Company members read lead intake records"
on public.lead_intake_records
for select to authenticated
using (
  (
    lead_intake_records.company_id is not null
    and exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = lead_intake_records.company_id
        and membership.user_id = (select auth.uid())
    )
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members insert lead intake records"
on public.lead_intake_records;
create policy "Company members insert lead intake records"
on public.lead_intake_records
for insert to authenticated
with check (
  (
    lead_intake_records.company_id is not null
    and exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = lead_intake_records.company_id
        and membership.user_id = (select auth.uid())
    )
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

drop policy if exists "Company members update lead intake records"
on public.lead_intake_records;
create policy "Company members update lead intake records"
on public.lead_intake_records
for update to authenticated
using (
  (
    lead_intake_records.company_id is not null
    and exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = lead_intake_records.company_id
        and membership.user_id = (select auth.uid())
    )
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
)
with check (
  (
    lead_intake_records.company_id is not null
    and exists (
      select 1
      from public.company_memberships membership
      where membership.company_id = lead_intake_records.company_id
        and membership.user_id = (select auth.uid())
    )
  )
  or exists (
    select 1
    from public.profiles profile
    where profile.id = (select auth.uid())
      and profile.role in ('owner', 'admin')
  )
);

commit;
