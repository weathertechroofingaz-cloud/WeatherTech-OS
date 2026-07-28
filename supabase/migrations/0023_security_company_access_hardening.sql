begin;

-- Security & Company Access Hardening
-- Replaces broad authenticated CRM policies with company membership checks.
-- Customer/employee portal roles are intentionally excluded from internal CRM access.

alter table public.company_memberships
drop constraint if exists company_memberships_role_check;

alter table public.company_memberships
add constraint company_memberships_role_check
check (
  role in (
    'owner',
    'admin',
    'office',
    'sales',
    'production',
    'field',
    'technician',
    'viewer',
    'team_member',
    'customer_portal',
    'employee_portal'
  )
);

with bootstrap_owner as (
  select users.id
  from auth.users as users
  where not exists (select 1 from public.company_memberships)
    and not exists (
      select 1
      from public.profiles as profile
      where profile.role in ('owner', 'admin')
    )
  order by users.created_at asc
  limit 1
),
default_company as (
  select companies.id
  from public.companies as companies
  order by companies.name asc
  limit 1
)
insert into public.profiles (id, role, default_company_id)
select
  bootstrap_owner.id,
  'owner',
  (select default_company.id from default_company)
from bootstrap_owner
on conflict (id) do update
set
  role = 'owner',
  default_company_id = coalesce(
    public.profiles.default_company_id,
    excluded.default_company_id
  );

with bootstrap_owner as (
  select profiles.id
  from public.profiles as profiles
  where profiles.role in ('owner', 'admin')
  order by profiles.created_at asc
  limit 1
)
insert into public.company_memberships (
  user_id,
  company_id,
  role,
  can_manage_settings,
  can_manage_financials,
  can_manage_production
)
select
  bootstrap_owner.id,
  companies.id,
  'owner',
  true,
  true,
  true
from bootstrap_owner
cross join public.companies as companies
where not exists (select 1 from public.company_memberships)
on conflict (user_id, company_id) do nothing;

create or replace function public.wtos_has_global_role(allowed_roles text[])
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.role = any(allowed_roles)
    ),
    false
  );
$$;

create or replace function public.wtos_has_membership_role(
  target_company_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.company_id = target_company_id
        and membership.role = any(allowed_roles)
    ),
    false
  );
$$;

create or replace function public.wtos_is_internal_user()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    public.wtos_has_global_role(array['owner', 'admin'])
    or exists (
      select 1
      from public.company_memberships as membership
      where membership.user_id = (select auth.uid())
        and membership.role not in ('customer_portal', 'employee_portal')
    ),
    false
  );
$$;

create or replace function public.wtos_can_read_company(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (
      public.wtos_has_global_role(array['owner', 'admin'])
      or exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = (select auth.uid())
          and membership.company_id = target_company_id
          and membership.role not in ('customer_portal', 'employee_portal')
      )
    ),
    false
  );
$$;

create or replace function public.wtos_can_read_nullable_company(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when target_company_id is null then public.wtos_has_global_role(array['owner', 'admin'])
    else public.wtos_can_read_company(target_company_id)
  end;
$$;

create or replace function public.wtos_can_manage_settings(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (
      public.wtos_has_global_role(array['owner', 'admin'])
      or public.wtos_has_membership_role(target_company_id, array['owner', 'admin'])
      or exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = (select auth.uid())
          and membership.company_id = target_company_id
          and membership.role not in ('customer_portal', 'employee_portal')
          and membership.can_manage_settings is true
      )
    ),
    false
  );
$$;

create or replace function public.wtos_can_manage_sales(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (
      public.wtos_has_global_role(array['owner', 'admin'])
      or public.wtos_has_membership_role(
        target_company_id,
        array['owner', 'admin', 'office', 'sales', 'team_member']
      )
    ),
    false
  );
$$;

create or replace function public.wtos_can_manage_production(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (
      public.wtos_has_global_role(array['owner', 'admin'])
      or public.wtos_has_membership_role(
        target_company_id,
        array['owner', 'admin', 'office', 'production', 'field', 'technician', 'team_member']
      )
      or exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = (select auth.uid())
          and membership.company_id = target_company_id
          and membership.role in ('owner', 'admin', 'office', 'production', 'field', 'technician', 'team_member')
          and membership.can_manage_production is true
      )
    ),
    false
  );
$$;

create or replace function public.wtos_can_manage_financials(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (
      public.wtos_has_global_role(array['owner', 'admin'])
      or public.wtos_has_membership_role(target_company_id, array['owner', 'admin', 'office'])
      or exists (
        select 1
        from public.company_memberships as membership
        where membership.user_id = (select auth.uid())
          and membership.company_id = target_company_id
          and membership.role not in ('customer_portal', 'employee_portal', 'viewer')
          and membership.can_manage_financials is true
      )
    ),
    false
  );
$$;

create or replace function public.wtos_can_manage_documents(target_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    target_company_id is not null
    and (
      public.wtos_has_global_role(array['owner', 'admin'])
      or public.wtos_has_membership_role(
        target_company_id,
        array['owner', 'admin', 'office', 'sales', 'production', 'field', 'technician', 'team_member']
      )
    ),
    false
  );
$$;

-- Remove legacy broad authenticated policies.
drop policy if exists "Authenticated users can read companies" on public.companies;
drop policy if exists "Authenticated users can manage companies" on public.companies;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Users can insert own profile" on public.profiles;
drop policy if exists "Authenticated users can manage customers" on public.customers;
drop policy if exists "Authenticated users can manage leads" on public.leads;
drop policy if exists "Authenticated users can manage estimates" on public.estimates;
drop policy if exists "Authenticated users can manage estimate line items" on public.estimate_line_items;
drop policy if exists "Authenticated users can manage scope templates" on public.scope_templates;
drop policy if exists "Authenticated users can manage scopes" on public.scopes;
drop policy if exists "Authenticated users manage jobs" on public.jobs;
drop policy if exists "Authenticated users manage schedule events" on public.schedule_events;
drop policy if exists "Authenticated users manage job photos" on public.job_photos;
drop policy if exists "Authenticated users manage invoices" on public.invoices;
drop policy if exists "Authenticated users manage invoice line items" on public.invoice_line_items;
drop policy if exists "Authenticated users manage material orders" on public.material_orders;
drop policy if exists "Authenticated users manage material order items" on public.material_order_items;
drop policy if exists "Authenticated users manage employees" on public.employees;
drop policy if exists "Authenticated users manage job assignments" on public.job_assignments;
drop policy if exists "Authenticated users manage time entries" on public.time_entries;
drop policy if exists "Authenticated users manage inspections" on public.inspections;
drop policy if exists "Authenticated users manage daily logs" on public.daily_logs;
drop policy if exists "Authenticated users manage change orders" on public.change_orders;
drop policy if exists "Authenticated users manage signatures" on public.signatures;
drop policy if exists "Authenticated users manage documents" on public.documents;
drop policy if exists "Authenticated users manage payments" on public.payments;
drop policy if exists "Authenticated users manage notifications" on public.notifications;
drop policy if exists "Authenticated users manage integration connections" on public.integration_connections;
drop policy if exists "Authenticated users manage calendar event syncs" on public.calendar_event_syncs;
drop policy if exists "Authenticated users manage email messages" on public.email_messages;
drop policy if exists "Authenticated users manage route plans" on public.route_plans;
drop policy if exists "Authenticated users manage route plan stops" on public.route_plan_stops;
drop policy if exists "Authenticated users manage sms messages" on public.sms_messages;
drop policy if exists "Authenticated users manage workflow settings" on public.company_workflow_settings;
drop policy if exists "Authenticated admins can manage company memberships" on public.company_memberships;
drop policy if exists "Users can read own company memberships" on public.company_memberships;
drop policy if exists "Authenticated users read integration sync logs" on public.integration_sync_logs;
drop policy if exists "Authenticated users insert integration sync logs" on public.integration_sync_logs;
drop policy if exists "Authenticated users update integration sync logs" on public.integration_sync_logs;
drop policy if exists "Authenticated users manage job tasks" on public.job_tasks;
drop policy if exists "Authenticated users manage job notes" on public.job_notes;
drop policy if exists "Authenticated users manage job materials" on public.job_materials;
drop policy if exists "Authenticated users read lead source mappings" on public.lead_source_mappings;
drop policy if exists "Authenticated users insert lead source mappings" on public.lead_source_mappings;
drop policy if exists "Authenticated users update lead source mappings" on public.lead_source_mappings;
drop policy if exists "Users can read business phone numbers by company" on public.business_phone_numbers;
drop policy if exists "Users can insert business phone numbers by company" on public.business_phone_numbers;
drop policy if exists "Users can update business phone numbers by company" on public.business_phone_numbers;
drop policy if exists "Users can read communication provider events by company" on public.communication_provider_events;
drop policy if exists "Users can insert communication provider events by company" on public.communication_provider_events;
drop policy if exists "Users can update communication provider events by company" on public.communication_provider_events;
drop policy if exists "Users can read call records by company" on public.call_records;
drop policy if exists "Users can insert call records by company" on public.call_records;
drop policy if exists "Users can update call records by company" on public.call_records;
drop policy if exists "Company members read GoHighLevel sync mappings" on public.gohighlevel_sync_mappings;
drop policy if exists "Company members insert GoHighLevel sync mappings" on public.gohighlevel_sync_mappings;
drop policy if exists "Company members update GoHighLevel sync mappings" on public.gohighlevel_sync_mappings;
drop policy if exists "Company members read GoHighLevel discovery snapshots" on public.gohighlevel_discovery_snapshots;
drop policy if exists "Company members insert GoHighLevel discovery snapshots" on public.gohighlevel_discovery_snapshots;
drop policy if exists "Company members update GoHighLevel discovery snapshots" on public.gohighlevel_discovery_snapshots;
drop policy if exists "Company members read lead intake records" on public.lead_intake_records;
drop policy if exists "Company members insert lead intake records" on public.lead_intake_records;
drop policy if exists "Company members update lead intake records" on public.lead_intake_records;

-- Remove policy names from previous local iterations if the migration is rerun.
drop policy if exists "WTOS users read permitted companies" on public.companies;
drop policy if exists "WTOS admins update companies" on public.companies;
drop policy if exists "WTOS users read own profile" on public.profiles;
drop policy if exists "WTOS users insert own profile" on public.profiles;
drop policy if exists "WTOS users update own profile" on public.profiles;
drop policy if exists "WTOS users read memberships" on public.company_memberships;
drop policy if exists "WTOS admins insert memberships" on public.company_memberships;
drop policy if exists "WTOS admins update memberships" on public.company_memberships;
drop policy if exists "WTOS admins delete memberships" on public.company_memberships;
drop policy if exists "WTOS users read workflow settings" on public.company_workflow_settings;
drop policy if exists "WTOS admins insert workflow settings" on public.company_workflow_settings;
drop policy if exists "WTOS admins update workflow settings" on public.company_workflow_settings;
drop policy if exists "WTOS users read customers" on public.customers;
drop policy if exists "WTOS sales insert customers" on public.customers;
drop policy if exists "WTOS sales update customers" on public.customers;
drop policy if exists "WTOS users read leads" on public.leads;
drop policy if exists "WTOS sales insert leads" on public.leads;
drop policy if exists "WTOS sales update leads" on public.leads;
drop policy if exists "WTOS users read estimates" on public.estimates;
drop policy if exists "WTOS sales insert estimates" on public.estimates;
drop policy if exists "WTOS sales update estimates" on public.estimates;
drop policy if exists "WTOS users read estimate line items" on public.estimate_line_items;
drop policy if exists "WTOS sales insert estimate line items" on public.estimate_line_items;
drop policy if exists "WTOS sales update estimate line items" on public.estimate_line_items;
drop policy if exists "WTOS sales delete estimate line items" on public.estimate_line_items;
drop policy if exists "WTOS users read scopes" on public.scopes;
drop policy if exists "WTOS sales insert scopes" on public.scopes;
drop policy if exists "WTOS sales update scopes" on public.scopes;
drop policy if exists "WTOS users read scope templates" on public.scope_templates;
drop policy if exists "WTOS admins insert scope templates" on public.scope_templates;
drop policy if exists "WTOS admins update scope templates" on public.scope_templates;
drop policy if exists "WTOS users read jobs" on public.jobs;
drop policy if exists "WTOS production insert jobs" on public.jobs;
drop policy if exists "WTOS production update jobs" on public.jobs;
drop policy if exists "WTOS users read schedule events" on public.schedule_events;
drop policy if exists "WTOS users insert schedule events" on public.schedule_events;
drop policy if exists "WTOS users update schedule events" on public.schedule_events;
drop policy if exists "WTOS users read job photos" on public.job_photos;
drop policy if exists "WTOS users insert job photos" on public.job_photos;
drop policy if exists "WTOS users update job photos" on public.job_photos;
drop policy if exists "WTOS users read inspections" on public.inspections;
drop policy if exists "WTOS users insert inspections" on public.inspections;
drop policy if exists "WTOS users update inspections" on public.inspections;
drop policy if exists "WTOS users read employees" on public.employees;
drop policy if exists "WTOS production insert employees" on public.employees;
drop policy if exists "WTOS production update employees" on public.employees;
drop policy if exists "WTOS users read job assignments" on public.job_assignments;
drop policy if exists "WTOS production insert job assignments" on public.job_assignments;
drop policy if exists "WTOS production update job assignments" on public.job_assignments;
drop policy if exists "WTOS users read time entries" on public.time_entries;
drop policy if exists "WTOS production insert time entries" on public.time_entries;
drop policy if exists "WTOS production update time entries" on public.time_entries;
drop policy if exists "WTOS users read daily logs" on public.daily_logs;
drop policy if exists "WTOS production insert daily logs" on public.daily_logs;
drop policy if exists "WTOS production update daily logs" on public.daily_logs;
drop policy if exists "WTOS users read material orders" on public.material_orders;
drop policy if exists "WTOS production insert material orders" on public.material_orders;
drop policy if exists "WTOS production update material orders" on public.material_orders;
drop policy if exists "WTOS users read route plans" on public.route_plans;
drop policy if exists "WTOS production insert route plans" on public.route_plans;
drop policy if exists "WTOS production update route plans" on public.route_plans;
drop policy if exists "WTOS users read route plan stops" on public.route_plan_stops;
drop policy if exists "WTOS production insert route plan stops" on public.route_plan_stops;
drop policy if exists "WTOS production update route plan stops" on public.route_plan_stops;
drop policy if exists "WTOS users read job tasks" on public.job_tasks;
drop policy if exists "WTOS production insert job tasks" on public.job_tasks;
drop policy if exists "WTOS production update job tasks" on public.job_tasks;
drop policy if exists "WTOS production delete job tasks" on public.job_tasks;
drop policy if exists "WTOS users read job notes" on public.job_notes;
drop policy if exists "WTOS production insert job notes" on public.job_notes;
drop policy if exists "WTOS production update job notes" on public.job_notes;
drop policy if exists "WTOS users read job materials" on public.job_materials;
drop policy if exists "WTOS production insert job materials" on public.job_materials;
drop policy if exists "WTOS production update job materials" on public.job_materials;
drop policy if exists "WTOS users read material order items" on public.material_order_items;
drop policy if exists "WTOS production insert material order items" on public.material_order_items;
drop policy if exists "WTOS production update material order items" on public.material_order_items;
drop policy if exists "WTOS production delete material order items" on public.material_order_items;
drop policy if exists "WTOS users read invoices" on public.invoices;
drop policy if exists "WTOS financial insert invoices" on public.invoices;
drop policy if exists "WTOS financial update invoices" on public.invoices;
drop policy if exists "WTOS users read invoice line items" on public.invoice_line_items;
drop policy if exists "WTOS financial insert invoice line items" on public.invoice_line_items;
drop policy if exists "WTOS financial update invoice line items" on public.invoice_line_items;
drop policy if exists "WTOS financial delete invoice line items" on public.invoice_line_items;
drop policy if exists "WTOS users read payments" on public.payments;
drop policy if exists "WTOS financial insert payments" on public.payments;
drop policy if exists "WTOS financial update payments" on public.payments;
drop policy if exists "WTOS users read change orders" on public.change_orders;
drop policy if exists "WTOS financial insert change orders" on public.change_orders;
drop policy if exists "WTOS financial update change orders" on public.change_orders;
drop policy if exists "WTOS users read signatures" on public.signatures;
drop policy if exists "WTOS users insert signatures" on public.signatures;
drop policy if exists "WTOS users update signatures" on public.signatures;
drop policy if exists "WTOS users read documents" on public.documents;
drop policy if exists "WTOS users insert documents" on public.documents;
drop policy if exists "WTOS users update documents" on public.documents;
drop policy if exists "WTOS users read notifications" on public.notifications;
drop policy if exists "WTOS users insert notifications" on public.notifications;
drop policy if exists "WTOS users update notifications" on public.notifications;
drop policy if exists "WTOS users read email messages" on public.email_messages;
drop policy if exists "WTOS sales insert email messages" on public.email_messages;
drop policy if exists "WTOS sales update email messages" on public.email_messages;
drop policy if exists "WTOS users read sms messages" on public.sms_messages;
drop policy if exists "WTOS sales insert sms messages" on public.sms_messages;
drop policy if exists "WTOS sales update sms messages" on public.sms_messages;
drop policy if exists "WTOS users read integration sync logs" on public.integration_sync_logs;
drop policy if exists "WTOS users insert integration sync logs" on public.integration_sync_logs;
drop policy if exists "WTOS users update integration sync logs" on public.integration_sync_logs;
drop policy if exists "WTOS users read communication provider events" on public.communication_provider_events;
drop policy if exists "WTOS users insert communication provider events" on public.communication_provider_events;
drop policy if exists "WTOS users update communication provider events" on public.communication_provider_events;
drop policy if exists "WTOS users read call records" on public.call_records;
drop policy if exists "WTOS users insert call records" on public.call_records;
drop policy if exists "WTOS users update call records" on public.call_records;
drop policy if exists "WTOS users read lead intake records" on public.lead_intake_records;
drop policy if exists "WTOS sales insert lead intake records" on public.lead_intake_records;
drop policy if exists "WTOS sales update lead intake records" on public.lead_intake_records;
drop policy if exists "WTOS users read integration connections" on public.integration_connections;
drop policy if exists "WTOS admins insert integration connections" on public.integration_connections;
drop policy if exists "WTOS admins update integration connections" on public.integration_connections;
drop policy if exists "WTOS users read calendar event syncs" on public.calendar_event_syncs;
drop policy if exists "WTOS admins insert calendar event syncs" on public.calendar_event_syncs;
drop policy if exists "WTOS admins update calendar event syncs" on public.calendar_event_syncs;
drop policy if exists "WTOS users read business phone numbers" on public.business_phone_numbers;
drop policy if exists "WTOS admins insert business phone numbers" on public.business_phone_numbers;
drop policy if exists "WTOS admins update business phone numbers" on public.business_phone_numbers;
drop policy if exists "WTOS users read GHL sync mappings" on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS admins insert GHL sync mappings" on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS admins update GHL sync mappings" on public.gohighlevel_sync_mappings;
drop policy if exists "WTOS users read GHL discovery snapshots" on public.gohighlevel_discovery_snapshots;
drop policy if exists "WTOS admins insert GHL discovery snapshots" on public.gohighlevel_discovery_snapshots;
drop policy if exists "WTOS admins update GHL discovery snapshots" on public.gohighlevel_discovery_snapshots;
drop policy if exists "WTOS users read lead source mappings" on public.lead_source_mappings;
drop policy if exists "WTOS admins insert lead source mappings" on public.lead_source_mappings;
drop policy if exists "WTOS admins update lead source mappings" on public.lead_source_mappings;

-- Role grants. RLS policies below provide row authorization.
revoke all on table
  public.companies,
  public.profiles,
  public.company_memberships,
  public.company_workflow_settings,
  public.customers,
  public.leads,
  public.estimates,
  public.estimate_line_items,
  public.scope_templates,
  public.scopes,
  public.jobs,
  public.schedule_events,
  public.job_photos,
  public.invoices,
  public.invoice_line_items,
  public.material_orders,
  public.material_order_items,
  public.employees,
  public.job_assignments,
  public.time_entries,
  public.inspections,
  public.daily_logs,
  public.change_orders,
  public.signatures,
  public.documents,
  public.payments,
  public.notifications,
  public.integration_connections,
  public.calendar_event_syncs,
  public.email_messages,
  public.sms_messages,
  public.route_plans,
  public.route_plan_stops,
  public.integration_sync_logs,
  public.job_tasks,
  public.job_notes,
  public.job_materials,
  public.lead_source_mappings,
  public.business_phone_numbers,
  public.communication_provider_events,
  public.call_records,
  public.gohighlevel_sync_mappings,
  public.gohighlevel_discovery_snapshots,
  public.lead_intake_records
from anon;

revoke all on table
  public.companies,
  public.profiles,
  public.company_memberships,
  public.company_workflow_settings,
  public.customers,
  public.leads,
  public.estimates,
  public.estimate_line_items,
  public.scope_templates,
  public.scopes,
  public.jobs,
  public.schedule_events,
  public.job_photos,
  public.invoices,
  public.invoice_line_items,
  public.material_orders,
  public.material_order_items,
  public.employees,
  public.job_assignments,
  public.time_entries,
  public.inspections,
  public.daily_logs,
  public.change_orders,
  public.signatures,
  public.documents,
  public.payments,
  public.notifications,
  public.integration_connections,
  public.calendar_event_syncs,
  public.email_messages,
  public.sms_messages,
  public.route_plans,
  public.route_plan_stops,
  public.integration_sync_logs,
  public.job_tasks,
  public.job_notes,
  public.job_materials,
  public.lead_source_mappings,
  public.business_phone_numbers,
  public.communication_provider_events,
  public.call_records,
  public.gohighlevel_sync_mappings,
  public.gohighlevel_discovery_snapshots,
  public.lead_intake_records
from public;

revoke delete on table
  public.companies,
  public.profiles,
  public.company_memberships,
  public.company_workflow_settings,
  public.customers,
  public.leads,
  public.estimates,
  public.scope_templates,
  public.scopes,
  public.jobs,
  public.schedule_events,
  public.job_photos,
  public.invoices,
  public.material_orders,
  public.employees,
  public.job_assignments,
  public.time_entries,
  public.inspections,
  public.daily_logs,
  public.change_orders,
  public.signatures,
  public.documents,
  public.payments,
  public.notifications,
  public.integration_connections,
  public.calendar_event_syncs,
  public.email_messages,
  public.sms_messages,
  public.route_plans,
  public.route_plan_stops,
  public.integration_sync_logs,
  public.job_notes,
  public.job_materials,
  public.lead_source_mappings,
  public.business_phone_numbers,
  public.communication_provider_events,
  public.call_records,
  public.gohighlevel_sync_mappings,
  public.gohighlevel_discovery_snapshots,
  public.lead_intake_records
from authenticated;

grant select on table
  public.companies,
  public.profiles,
  public.company_memberships,
  public.company_workflow_settings,
  public.customers,
  public.leads,
  public.estimates,
  public.estimate_line_items,
  public.scope_templates,
  public.scopes,
  public.jobs,
  public.schedule_events,
  public.job_photos,
  public.invoices,
  public.invoice_line_items,
  public.material_orders,
  public.material_order_items,
  public.employees,
  public.job_assignments,
  public.time_entries,
  public.inspections,
  public.daily_logs,
  public.change_orders,
  public.signatures,
  public.documents,
  public.payments,
  public.notifications,
  public.integration_connections,
  public.calendar_event_syncs,
  public.email_messages,
  public.sms_messages,
  public.route_plans,
  public.route_plan_stops,
  public.integration_sync_logs,
  public.job_tasks,
  public.job_notes,
  public.job_materials,
  public.lead_source_mappings,
  public.business_phone_numbers,
  public.communication_provider_events,
  public.call_records,
  public.gohighlevel_sync_mappings,
  public.gohighlevel_discovery_snapshots,
  public.lead_intake_records
to authenticated;

grant insert, update on table
  public.company_memberships,
  public.company_workflow_settings,
  public.customers,
  public.leads,
  public.estimates,
  public.estimate_line_items,
  public.scope_templates,
  public.scopes,
  public.jobs,
  public.schedule_events,
  public.job_photos,
  public.invoices,
  public.invoice_line_items,
  public.material_orders,
  public.material_order_items,
  public.employees,
  public.job_assignments,
  public.time_entries,
  public.inspections,
  public.daily_logs,
  public.change_orders,
  public.signatures,
  public.documents,
  public.payments,
  public.notifications,
  public.integration_connections,
  public.calendar_event_syncs,
  public.email_messages,
  public.sms_messages,
  public.route_plans,
  public.route_plan_stops,
  public.integration_sync_logs,
  public.job_tasks,
  public.job_notes,
  public.job_materials,
  public.lead_source_mappings,
  public.business_phone_numbers,
  public.communication_provider_events,
  public.call_records,
  public.gohighlevel_sync_mappings,
  public.gohighlevel_discovery_snapshots,
  public.lead_intake_records
to authenticated;

grant update on table public.companies to authenticated;
grant insert on table public.profiles to authenticated;
grant update (full_name, default_company_id, updated_at) on table public.profiles to authenticated;
grant delete on table
  public.estimate_line_items,
  public.invoice_line_items,
  public.material_order_items,
  public.job_tasks
to authenticated;

grant select, insert, update, delete on table
  public.companies,
  public.profiles,
  public.company_memberships,
  public.company_workflow_settings,
  public.customers,
  public.leads,
  public.estimates,
  public.estimate_line_items,
  public.scope_templates,
  public.scopes,
  public.jobs,
  public.schedule_events,
  public.job_photos,
  public.invoices,
  public.invoice_line_items,
  public.material_orders,
  public.material_order_items,
  public.employees,
  public.job_assignments,
  public.time_entries,
  public.inspections,
  public.daily_logs,
  public.change_orders,
  public.signatures,
  public.documents,
  public.payments,
  public.notifications,
  public.integration_connections,
  public.calendar_event_syncs,
  public.email_messages,
  public.sms_messages,
  public.route_plans,
  public.route_plan_stops,
  public.integration_sync_logs,
  public.job_tasks,
  public.job_notes,
  public.job_materials,
  public.lead_source_mappings,
  public.business_phone_numbers,
  public.communication_provider_events,
  public.call_records,
  public.gohighlevel_sync_mappings,
  public.gohighlevel_discovery_snapshots,
  public.lead_intake_records
to service_role;

-- Core identity and membership policies.
create policy "WTOS users read permitted companies"
on public.companies
for select to authenticated
using (public.wtos_can_read_company(id));

create policy "WTOS admins update companies"
on public.companies
for update to authenticated
using (public.wtos_can_manage_settings(id))
with check (public.wtos_can_manage_settings(id));

create policy "WTOS users read own profile"
on public.profiles
for select to authenticated
using (id = (select auth.uid()));

create policy "WTOS users insert own profile"
on public.profiles
for insert to authenticated
with check (id = (select auth.uid()) and role = 'team_member');

create policy "WTOS users update own profile"
on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "WTOS users read memberships"
on public.company_memberships
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.wtos_has_global_role(array['owner', 'admin'])
);

create policy "WTOS admins insert memberships"
on public.company_memberships
for insert to authenticated
with check (public.wtos_has_global_role(array['owner', 'admin']));

create policy "WTOS admins update memberships"
on public.company_memberships
for update to authenticated
using (public.wtos_has_global_role(array['owner', 'admin']))
with check (public.wtos_has_global_role(array['owner', 'admin']));

create policy "WTOS admins delete memberships"
on public.company_memberships
for delete to authenticated
using (public.wtos_has_global_role(array['owner', 'admin']));

create policy "WTOS users read workflow settings"
on public.company_workflow_settings
for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS admins insert workflow settings"
on public.company_workflow_settings
for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS admins update workflow settings"
on public.company_workflow_settings
for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

-- Sales and CRM records.
create policy "WTOS users read customers"
on public.customers for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS sales insert customers"
on public.customers for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS sales update customers"
on public.customers for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS users read leads"
on public.leads for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS sales insert leads"
on public.leads for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS sales update leads"
on public.leads for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS users read estimates"
on public.estimates for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS sales insert estimates"
on public.estimates for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS sales update estimates"
on public.estimates for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS users read estimate line items"
on public.estimate_line_items for select to authenticated
using (
  exists (
    select 1 from public.estimates as estimate
    where estimate.id = estimate_line_items.estimate_id
      and public.wtos_can_read_company(estimate.company_id)
  )
);

create policy "WTOS sales insert estimate line items"
on public.estimate_line_items for insert to authenticated
with check (
  exists (
    select 1 from public.estimates as estimate
    where estimate.id = estimate_line_items.estimate_id
      and public.wtos_can_manage_sales(estimate.company_id)
  )
);

create policy "WTOS sales update estimate line items"
on public.estimate_line_items for update to authenticated
using (
  exists (
    select 1 from public.estimates as estimate
    where estimate.id = estimate_line_items.estimate_id
      and public.wtos_can_manage_sales(estimate.company_id)
  )
)
with check (
  exists (
    select 1 from public.estimates as estimate
    where estimate.id = estimate_line_items.estimate_id
      and public.wtos_can_manage_sales(estimate.company_id)
  )
);

create policy "WTOS sales delete estimate line items"
on public.estimate_line_items for delete to authenticated
using (
  exists (
    select 1 from public.estimates as estimate
    where estimate.id = estimate_line_items.estimate_id
      and public.wtos_can_manage_sales(estimate.company_id)
  )
);

create policy "WTOS users read scopes"
on public.scopes for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS sales insert scopes"
on public.scopes for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS sales update scopes"
on public.scopes for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS users read scope templates"
on public.scope_templates for select to authenticated
using (company_id is null or public.wtos_can_read_company(company_id));

create policy "WTOS admins insert scope templates"
on public.scope_templates for insert to authenticated
with check (
  (company_id is null and public.wtos_has_global_role(array['owner', 'admin']))
  or public.wtos_can_manage_settings(company_id)
);

create policy "WTOS admins update scope templates"
on public.scope_templates for update to authenticated
using (
  (company_id is null and public.wtos_has_global_role(array['owner', 'admin']))
  or public.wtos_can_manage_settings(company_id)
)
with check (
  (company_id is null and public.wtos_has_global_role(array['owner', 'admin']))
  or public.wtos_can_manage_settings(company_id)
);

-- Jobs, scheduling, production, and field records.
create policy "WTOS users read jobs"
on public.jobs for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert jobs"
on public.jobs for insert to authenticated
with check (
  public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_sales(company_id)
);

create policy "WTOS production update jobs"
on public.jobs for update to authenticated
using (
  public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_sales(company_id)
)
with check (
  public.wtos_can_manage_production(company_id)
  or public.wtos_can_manage_sales(company_id)
);

create policy "WTOS users read schedule events"
on public.schedule_events for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert schedule events"
on public.schedule_events for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
);

create policy "WTOS users update schedule events"
on public.schedule_events for update to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
);

create policy "WTOS users read job photos"
on public.job_photos for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert job photos"
on public.job_photos for insert to authenticated
with check (
  public.wtos_can_manage_documents(company_id)
  or public.wtos_can_manage_production(company_id)
);

create policy "WTOS users update job photos"
on public.job_photos for update to authenticated
using (
  public.wtos_can_manage_documents(company_id)
  or public.wtos_can_manage_production(company_id)
)
with check (
  public.wtos_can_manage_documents(company_id)
  or public.wtos_can_manage_production(company_id)
);

create policy "WTOS users read inspections"
on public.inspections for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert inspections"
on public.inspections for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
);

create policy "WTOS users update inspections"
on public.inspections for update to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_production(company_id)
);

create policy "WTOS users read employees"
on public.employees for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert employees"
on public.employees for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update employees"
on public.employees for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS users read job assignments"
on public.job_assignments for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert job assignments"
on public.job_assignments for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update job assignments"
on public.job_assignments for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS users read time entries"
on public.time_entries for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert time entries"
on public.time_entries for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update time entries"
on public.time_entries for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS users read daily logs"
on public.daily_logs for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert daily logs"
on public.daily_logs for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update daily logs"
on public.daily_logs for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS users read material orders"
on public.material_orders for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert material orders"
on public.material_orders for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update material orders"
on public.material_orders for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS users read route plans"
on public.route_plans for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert route plans"
on public.route_plans for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update route plans"
on public.route_plans for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS users read route plan stops"
on public.route_plan_stops for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS production insert route plan stops"
on public.route_plan_stops for insert to authenticated
with check (public.wtos_can_manage_production(company_id));

create policy "WTOS production update route plan stops"
on public.route_plan_stops for update to authenticated
using (public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_production(company_id));

-- Production child rows authorized through the parent job.
create policy "WTOS users read job tasks"
on public.job_tasks for select to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_tasks.job_id
      and public.wtos_can_read_company(job.company_id)
  )
);

create policy "WTOS production insert job tasks"
on public.job_tasks for insert to authenticated
with check (
  exists (
    select 1 from public.jobs as job
    where job.id = job_tasks.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS production update job tasks"
on public.job_tasks for update to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_tasks.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
)
with check (
  exists (
    select 1 from public.jobs as job
    where job.id = job_tasks.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS production delete job tasks"
on public.job_tasks for delete to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_tasks.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS users read job notes"
on public.job_notes for select to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_notes.job_id
      and public.wtos_can_read_company(job.company_id)
  )
);

create policy "WTOS production insert job notes"
on public.job_notes for insert to authenticated
with check (
  exists (
    select 1 from public.jobs as job
    where job.id = job_notes.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS production update job notes"
on public.job_notes for update to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_notes.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
)
with check (
  exists (
    select 1 from public.jobs as job
    where job.id = job_notes.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS users read job materials"
on public.job_materials for select to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_materials.job_id
      and public.wtos_can_read_company(job.company_id)
  )
);

create policy "WTOS production insert job materials"
on public.job_materials for insert to authenticated
with check (
  exists (
    select 1 from public.jobs as job
    where job.id = job_materials.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS production update job materials"
on public.job_materials for update to authenticated
using (
  exists (
    select 1 from public.jobs as job
    where job.id = job_materials.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
)
with check (
  exists (
    select 1 from public.jobs as job
    where job.id = job_materials.job_id
      and public.wtos_can_manage_production(job.company_id)
  )
);

create policy "WTOS users read material order items"
on public.material_order_items for select to authenticated
using (
  exists (
    select 1 from public.material_orders as material_order
    where material_order.id = material_order_items.material_order_id
      and public.wtos_can_read_company(material_order.company_id)
  )
);

create policy "WTOS production insert material order items"
on public.material_order_items for insert to authenticated
with check (
  exists (
    select 1 from public.material_orders as material_order
    where material_order.id = material_order_items.material_order_id
      and public.wtos_can_manage_production(material_order.company_id)
  )
);

create policy "WTOS production update material order items"
on public.material_order_items for update to authenticated
using (
  exists (
    select 1 from public.material_orders as material_order
    where material_order.id = material_order_items.material_order_id
      and public.wtos_can_manage_production(material_order.company_id)
  )
)
with check (
  exists (
    select 1 from public.material_orders as material_order
    where material_order.id = material_order_items.material_order_id
      and public.wtos_can_manage_production(material_order.company_id)
  )
);

create policy "WTOS production delete material order items"
on public.material_order_items for delete to authenticated
using (
  exists (
    select 1 from public.material_orders as material_order
    where material_order.id = material_order_items.material_order_id
      and public.wtos_can_manage_production(material_order.company_id)
  )
);

-- Financial records.
create policy "WTOS users read invoices"
on public.invoices for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS financial insert invoices"
on public.invoices for insert to authenticated
with check (public.wtos_can_manage_financials(company_id));

create policy "WTOS financial update invoices"
on public.invoices for update to authenticated
using (public.wtos_can_manage_financials(company_id))
with check (public.wtos_can_manage_financials(company_id));

create policy "WTOS users read invoice line items"
on public.invoice_line_items for select to authenticated
using (
  exists (
    select 1 from public.invoices as invoice
    where invoice.id = invoice_line_items.invoice_id
      and public.wtos_can_read_company(invoice.company_id)
  )
);

create policy "WTOS financial insert invoice line items"
on public.invoice_line_items for insert to authenticated
with check (
  exists (
    select 1 from public.invoices as invoice
    where invoice.id = invoice_line_items.invoice_id
      and public.wtos_can_manage_financials(invoice.company_id)
  )
);

create policy "WTOS financial update invoice line items"
on public.invoice_line_items for update to authenticated
using (
  exists (
    select 1 from public.invoices as invoice
    where invoice.id = invoice_line_items.invoice_id
      and public.wtos_can_manage_financials(invoice.company_id)
  )
)
with check (
  exists (
    select 1 from public.invoices as invoice
    where invoice.id = invoice_line_items.invoice_id
      and public.wtos_can_manage_financials(invoice.company_id)
  )
);

create policy "WTOS financial delete invoice line items"
on public.invoice_line_items for delete to authenticated
using (
  exists (
    select 1 from public.invoices as invoice
    where invoice.id = invoice_line_items.invoice_id
      and public.wtos_can_manage_financials(invoice.company_id)
  )
);

create policy "WTOS users read payments"
on public.payments for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS financial insert payments"
on public.payments for insert to authenticated
with check (public.wtos_can_manage_financials(company_id));

create policy "WTOS financial update payments"
on public.payments for update to authenticated
using (public.wtos_can_manage_financials(company_id))
with check (public.wtos_can_manage_financials(company_id));

create policy "WTOS users read change orders"
on public.change_orders for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS financial insert change orders"
on public.change_orders for insert to authenticated
with check (
  public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_sales(company_id)
);

create policy "WTOS financial update change orders"
on public.change_orders for update to authenticated
using (
  public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_sales(company_id)
)
with check (
  public.wtos_can_manage_financials(company_id)
  or public.wtos_can_manage_sales(company_id)
);

create policy "WTOS users read signatures"
on public.signatures for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert signatures"
on public.signatures for insert to authenticated
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_financials(company_id)
);

create policy "WTOS users update signatures"
on public.signatures for update to authenticated
using (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_financials(company_id)
)
with check (
  public.wtos_can_manage_sales(company_id)
  or public.wtos_can_manage_financials(company_id)
);

-- Documents and notifications.
create policy "WTOS users read documents"
on public.documents for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert documents"
on public.documents for insert to authenticated
with check (public.wtos_can_manage_documents(company_id));

create policy "WTOS users update documents"
on public.documents for update to authenticated
using (public.wtos_can_manage_documents(company_id))
with check (public.wtos_can_manage_documents(company_id));

create policy "WTOS users read notifications"
on public.notifications for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert notifications"
on public.notifications for insert to authenticated
with check (public.wtos_can_manage_sales(company_id) or public.wtos_can_manage_production(company_id));

create policy "WTOS users update notifications"
on public.notifications for update to authenticated
using (public.wtos_can_manage_sales(company_id) or public.wtos_can_manage_production(company_id))
with check (public.wtos_can_manage_sales(company_id) or public.wtos_can_manage_production(company_id));

-- Communications and intake records.
create policy "WTOS users read email messages"
on public.email_messages for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS sales insert email messages"
on public.email_messages for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS sales update email messages"
on public.email_messages for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS users read sms messages"
on public.sms_messages for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS sales insert sms messages"
on public.sms_messages for insert to authenticated
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS sales update sms messages"
on public.sms_messages for update to authenticated
using (public.wtos_can_manage_sales(company_id))
with check (public.wtos_can_manage_sales(company_id));

create policy "WTOS users read integration sync logs"
on public.integration_sync_logs for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS users insert integration sync logs"
on public.integration_sync_logs for insert to authenticated
with check (public.wtos_can_manage_sales(company_id) or public.wtos_can_manage_settings(company_id));

create policy "WTOS users update integration sync logs"
on public.integration_sync_logs for update to authenticated
using (public.wtos_can_manage_sales(company_id) or public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_sales(company_id) or public.wtos_can_manage_settings(company_id));

create policy "WTOS users read communication provider events"
on public.communication_provider_events for select to authenticated
using (public.wtos_can_read_nullable_company(company_id));

create policy "WTOS users insert communication provider events"
on public.communication_provider_events for insert to authenticated
with check (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
);

create policy "WTOS users update communication provider events"
on public.communication_provider_events for update to authenticated
using (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
)
with check (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
);

create policy "WTOS users read call records"
on public.call_records for select to authenticated
using (public.wtos_can_read_nullable_company(company_id));

create policy "WTOS users insert call records"
on public.call_records for insert to authenticated
with check (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
);

create policy "WTOS users update call records"
on public.call_records for update to authenticated
using (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
)
with check (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
);

create policy "WTOS users read lead intake records"
on public.lead_intake_records for select to authenticated
using (public.wtos_can_read_nullable_company(company_id));

create policy "WTOS sales insert lead intake records"
on public.lead_intake_records for insert to authenticated
with check (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
);

create policy "WTOS sales update lead intake records"
on public.lead_intake_records for update to authenticated
using (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
)
with check (
  company_id is not null
  and public.wtos_can_manage_sales(company_id)
);

-- Integration configuration records.
create policy "WTOS users read integration connections"
on public.integration_connections for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS admins insert integration connections"
on public.integration_connections for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS admins update integration connections"
on public.integration_connections for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS users read calendar event syncs"
on public.calendar_event_syncs for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS admins insert calendar event syncs"
on public.calendar_event_syncs for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS admins update calendar event syncs"
on public.calendar_event_syncs for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS users read business phone numbers"
on public.business_phone_numbers for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS admins insert business phone numbers"
on public.business_phone_numbers for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS admins update business phone numbers"
on public.business_phone_numbers for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS users read GHL sync mappings"
on public.gohighlevel_sync_mappings for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS admins insert GHL sync mappings"
on public.gohighlevel_sync_mappings for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS admins update GHL sync mappings"
on public.gohighlevel_sync_mappings for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS users read GHL discovery snapshots"
on public.gohighlevel_discovery_snapshots for select to authenticated
using (public.wtos_can_read_company(company_id));

create policy "WTOS admins insert GHL discovery snapshots"
on public.gohighlevel_discovery_snapshots for insert to authenticated
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS admins update GHL discovery snapshots"
on public.gohighlevel_discovery_snapshots for update to authenticated
using (public.wtos_can_manage_settings(company_id))
with check (public.wtos_can_manage_settings(company_id));

create policy "WTOS users read lead source mappings"
on public.lead_source_mappings for select to authenticated
using (public.wtos_is_internal_user());

create policy "WTOS admins insert lead source mappings"
on public.lead_source_mappings for insert to authenticated
with check (public.wtos_has_global_role(array['owner', 'admin']));

create policy "WTOS admins update lead source mappings"
on public.lead_source_mappings for update to authenticated
using (public.wtos_has_global_role(array['owner', 'admin']))
with check (public.wtos_has_global_role(array['owner', 'admin']));

commit;
