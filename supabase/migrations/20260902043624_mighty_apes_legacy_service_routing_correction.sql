begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Migration 20260902024804 is already applied to the isolated regression target
-- and hash-registered; preserve its validated contract. Its Mighty Apes
-- compatibility branch creates a legacy lead before the intake row exists.
-- Propagate the registry-owned service together with the exact location once
-- that intake row is inserted, before the deferred lead automation event is
-- forced at transaction commit.
create or replace function public.wtos_propagate_lead_intake_location_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.linked_lead_id is null or new.company_location_id is null then
    return new;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'customer_name'
  ) then
    execute $update_legacy_lead$
      update public.leads
      set
        company_location_id = $1,
        service_needed = coalesce($2, service_needed)
      where id = $3
        and company_id = $4
        and (
          company_location_id is distinct from $1
          or ($2 is not null and service_needed is distinct from $2)
        )
    $update_legacy_lead$
    using
      new.company_location_id,
      new.requested_service,
      new.linked_lead_id,
      new.company_id;
  elsif exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'contact_name'
  ) then
    execute $update_modern_lead$
      update public.leads
      set
        company_location_id = $1,
        service_type = coalesce($2, service_type)
      where id = $3
        and company_id = $4
        and (
          company_location_id is distinct from $1
          or ($2 is not null and service_type is distinct from $2)
        )
    $update_modern_lead$
    using
      new.company_location_id,
      new.requested_service,
      new.linked_lead_id,
      new.company_id;
  else
    raise exception 'The CRM lead schema is not compatible with lead-intake routing.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists lead_intake_records_propagate_automation_location
on public.lead_intake_records;
create trigger lead_intake_records_propagate_automation_location
after insert or update of company_id, branch_key, linked_lead_id, requested_service
on public.lead_intake_records
for each row execute function public.wtos_propagate_lead_intake_location_v1();

revoke execute on function public.wtos_propagate_lead_intake_location_v1()
from public, anon, authenticated, service_role;

commit;
