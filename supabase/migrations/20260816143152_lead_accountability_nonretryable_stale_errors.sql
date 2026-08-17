begin;

-- PostgREST retries SQLSTATE 40001 because it denotes a database serialization
-- failure. Phase 1 originally also used 40001 for reviewed-input/version
-- conflicts, which are deterministic application outcomes and must return to
-- the caller immediately. Preserve the applied Phase 1 implementation under
-- private names, then expose narrow wrappers that translate only its eight
-- exact semantic messages. Any genuine database/coordinator serialization
-- failure is re-raised unchanged.

alter function public.wtos_upsert_marketing_campaign(jsonb)
rename to wtos_upsert_marketing_campaign_phase1_base;

alter function public.wtos_upsert_marketing_spend(jsonb)
rename to wtos_upsert_marketing_spend_phase1_base;

alter function public.wtos_apply_lead_accountability_action(jsonb)
rename to wtos_apply_lead_accountability_action_phase1_base;

alter function public.wtos_create_repeat_opportunity(jsonb)
rename to wtos_create_repeat_opportunity_phase1_base;

revoke all on function public.wtos_upsert_marketing_campaign_phase1_base(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_upsert_marketing_spend_phase1_base(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_apply_lead_accountability_action_phase1_base(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_create_repeat_opportunity_phase1_base(jsonb)
from public, anon, authenticated, service_role;

create function public.wtos_upsert_marketing_campaign(
  campaign_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.wtos_upsert_marketing_campaign_phase1_base(campaign_request);
exception
  when serialization_failure then
    if sqlerrm in (
      'New marketing campaign requires expected_version 0.',
      'Marketing campaign changed after review.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_upsert_marketing_spend(
  spend_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.wtos_upsert_marketing_spend_phase1_base(spend_request);
exception
  when serialization_failure then
    if sqlerrm in (
      'New marketing spend requires expected_version 0.',
      'Marketing spend changed after review.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_apply_lead_accountability_action(
  action_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.wtos_apply_lead_accountability_action_phase1_base(action_request);
exception
  when serialization_failure then
    if sqlerrm in (
      'Lead accountability record changed during the action.',
      'Lead accountability record changed after review.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

create function public.wtos_create_repeat_opportunity(
  opportunity_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.wtos_create_repeat_opportunity_phase1_base(opportunity_request);
exception
  when serialization_failure then
    if sqlerrm in (
      'Repeat-opportunity customer changed after review.',
      'Repeat-opportunity property changed after review.'
    ) then
      raise exception using
        errcode = 'P0001',
        message = sqlerrm;
    end if;

    raise;
end;
$$;

revoke all on function public.wtos_upsert_marketing_campaign(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_upsert_marketing_spend(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_apply_lead_accountability_action(jsonb)
from public, anon, authenticated, service_role;
revoke all on function public.wtos_create_repeat_opportunity(jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_upsert_marketing_campaign(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_upsert_marketing_spend(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_apply_lead_accountability_action(jsonb)
to authenticated, service_role;
grant execute on function public.wtos_create_repeat_opportunity(jsonb)
to authenticated, service_role;

commit;
