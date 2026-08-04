begin;

-- AI Tools 2.0 - WeatherTech OS Operating System Brain
-- Adds additive, company-owned persistence for saved AI analyses, audit events,
-- and usage limits. Live AI providers remain disabled until owner-controlled
-- credentials and activation are approved outside this migration.

create table if not exists public.ai_saved_analyses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  estimate_id uuid references public.estimates(id) on delete set null,
  proposal_revision_id uuid references public.estimate_proposal_revisions(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  inspection_id uuid references public.inspections(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  title text not null,
  task_type text not null check (
    task_type in (
      'daily_brief',
      'command',
      'scope_writer',
      'estimate_assistant',
      'proposal_review',
      'inspection_analysis',
      'sales_analysis',
      'operations_analysis',
      'financial_analysis',
      'communication_draft',
      'marketing_analysis',
      'weather_analysis',
      'document_analysis',
      'saved_analysis'
    )
  ),
  mode text not null default 'provider_disabled' check (
    mode in ('rule_based_insight', 'provider_disabled', 'live_provider')
  ),
  provider text not null default 'disabled' check (
    provider in ('disabled', 'openai', 'anthropic', 'owner_approved')
  ),
  model text,
  prompt_summary text,
  output jsonb not null default '{}'::jsonb check (jsonb_typeof(output) = 'object'),
  source_records jsonb not null default '[]'::jsonb check (jsonb_typeof(source_records) = 'array'),
  approval_state text not null default 'draft' check (
    approval_state in ('draft', 'needs_review', 'approved', 'rejected', 'blocked')
  ),
  status text not null default 'active' check (status in ('active', 'archived', 'expired')),
  created_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  saved_analysis_id uuid references public.ai_saved_analyses(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  task_type text not null check (
    task_type in (
      'daily_brief',
      'command',
      'scope_writer',
      'estimate_assistant',
      'proposal_review',
      'inspection_analysis',
      'sales_analysis',
      'operations_analysis',
      'financial_analysis',
      'communication_draft',
      'marketing_analysis',
      'weather_analysis',
      'document_analysis',
      'saved_analysis'
    )
  ),
  event_type text not null check (
    event_type in (
      'request_initiated',
      'provider_blocked',
      'provider_failed',
      'response_generated',
      'draft_generated',
      'action_proposed',
      'action_approved',
      'action_rejected',
      'output_saved',
      'safety_block',
      'permission_block'
    )
  ),
  provider text not null default 'disabled' check (
    provider in ('disabled', 'openai', 'anthropic', 'owner_approved')
  ),
  model text,
  source_records jsonb not null default '[]'::jsonb check (jsonb_typeof(source_records) = 'array'),
  action_type text,
  action_preview jsonb not null default '{}'::jsonb check (jsonb_typeof(action_preview) = 'object'),
  status text not null default 'recorded',
  safety_flags text[] not null default '{}',
  token_count integer check (token_count is null or token_count >= 0),
  estimated_cost_cents integer check (estimated_cost_cents is null or estimated_cost_cents >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_usage_limits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ai_enabled boolean not null default false,
  allowed_providers text[] not null default '{}',
  allowed_models text[] not null default '{}',
  daily_request_limit integer not null default 0 check (daily_request_limit >= 0),
  per_user_daily_request_limit integer not null default 0 check (per_user_daily_request_limit >= 0),
  per_company_monthly_budget_cents integer not null default 0 check (per_company_monthly_budget_cents >= 0),
  expensive_task_confirmation_cents integer not null default 0 check (expensive_task_confirmation_cents >= 0),
  token_limit integer not null default 0 check (token_limit >= 0),
  timeout_ms integer not null default 0 check (timeout_ms >= 0),
  retry_limit integer not null default 0 check (retry_limit >= 0),
  last_reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists idx_ai_saved_analyses_company_updated
on public.ai_saved_analyses (company_id, updated_at desc);

create index if not exists idx_ai_saved_analyses_related_customer
on public.ai_saved_analyses (customer_id)
where customer_id is not null;

create index if not exists idx_ai_saved_analyses_related_estimate
on public.ai_saved_analyses (estimate_id)
where estimate_id is not null;

create index if not exists idx_ai_saved_analyses_related_job
on public.ai_saved_analyses (job_id)
where job_id is not null;

create index if not exists idx_ai_audit_events_company_created
on public.ai_audit_events (company_id, created_at desc);

create index if not exists idx_ai_audit_events_saved_analysis
on public.ai_audit_events (saved_analysis_id)
where saved_analysis_id is not null;

create index if not exists idx_ai_usage_limits_company
on public.ai_usage_limits (company_id);

drop trigger if exists ai_saved_analyses_set_updated_at on public.ai_saved_analyses;
create trigger ai_saved_analyses_set_updated_at
before update on public.ai_saved_analyses
for each row execute function public.set_updated_at();

drop trigger if exists ai_usage_limits_set_updated_at on public.ai_usage_limits;
create trigger ai_usage_limits_set_updated_at
before update on public.ai_usage_limits
for each row execute function public.set_updated_at();

alter table public.ai_saved_analyses enable row level security;
alter table public.ai_audit_events enable row level security;
alter table public.ai_usage_limits enable row level security;

drop policy if exists "WTOS users read AI saved analyses" on public.ai_saved_analyses;
create policy "WTOS users read AI saved analyses"
on public.ai_saved_analyses for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS users insert AI saved analyses" on public.ai_saved_analyses;
create policy "WTOS users insert AI saved analyses"
on public.ai_saved_analyses for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_documents(company_id)
);

drop policy if exists "WTOS users update AI saved analyses" on public.ai_saved_analyses;
create policy "WTOS users update AI saved analyses"
on public.ai_saved_analyses for update to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_documents(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_documents(company_id)
);

drop policy if exists "WTOS users read AI audit events" on public.ai_audit_events;
create policy "WTOS users read AI audit events"
on public.ai_audit_events for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS users insert AI audit events" on public.ai_audit_events;
create policy "WTOS users insert AI audit events"
on public.ai_audit_events for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_documents(company_id)
);

drop policy if exists "WTOS users read AI usage limits" on public.ai_usage_limits;
create policy "WTOS users read AI usage limits"
on public.ai_usage_limits for select to authenticated
using (public.wtos_can_read_company(company_id));

drop policy if exists "WTOS admins insert AI usage limits" on public.ai_usage_limits;
create policy "WTOS admins insert AI usage limits"
on public.ai_usage_limits for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

drop policy if exists "WTOS admins update AI usage limits" on public.ai_usage_limits;
create policy "WTOS admins update AI usage limits"
on public.ai_usage_limits for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

revoke all on
  public.ai_saved_analyses,
  public.ai_audit_events,
  public.ai_usage_limits
from anon;

grant select, insert, update on
  public.ai_saved_analyses,
  public.ai_usage_limits
to authenticated;

grant select, insert on
  public.ai_audit_events
to authenticated;

revoke delete on
  public.ai_saved_analyses,
  public.ai_audit_events,
  public.ai_usage_limits
from authenticated;

grant select, insert, update, delete on
  public.ai_saved_analyses,
  public.ai_audit_events,
  public.ai_usage_limits
to service_role;

commit;
