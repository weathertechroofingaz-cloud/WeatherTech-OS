begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create or replace function public.wtos_get_ai_quota_status_v1(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_request jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  utc_day_key date := (now() at time zone 'UTC')::date;
  utc_day_start timestamptz;
  utc_day_end timestamptz;
  utc_month_start timestamptz;
  utc_month_end timestamptz;
  estimated_cost_cents integer;
  global_daily_request_limit integer;
  company_daily_request_limit integer;
  user_daily_request_limit integer;
  daily_budget_cents integer;
  company_monthly_budget_cents integer;
  global_requests_today integer;
  company_requests_today integer;
  user_requests_today integer;
  reserved_cost_cents_today integer;
  company_reserved_cost_cents_this_month integer;
  blocking_reason text := 'none';
begin
  if (select auth.role()) is distinct from 'service_role' then
    raise exception 'AI quota status requires the trusted server role'
      using errcode = '42501';
  end if;

  if p_company_id is null
    or p_actor_user_id is null
    or p_request is null
    or jsonb_typeof(p_request) <> 'object'
    or not p_request ?& array[
      'contractVersion',
      'estimatedCostCents',
      'globalDailyRequestLimit',
      'companyDailyRequestLimit',
      'userDailyRequestLimit',
      'dailyBudgetCents',
      'companyMonthlyBudgetCents'
    ]
    or exists (
      select 1
      from jsonb_object_keys(p_request) as request_key
      where request_key not in (
        'contractVersion',
        'estimatedCostCents',
        'globalDailyRequestLimit',
        'companyDailyRequestLimit',
        'userDailyRequestLimit',
        'dailyBudgetCents',
        'companyMonthlyBudgetCents'
      )
    )
    or jsonb_typeof(p_request -> 'contractVersion') <> 'number'
    or jsonb_typeof(p_request -> 'estimatedCostCents') <> 'number'
    or jsonb_typeof(p_request -> 'globalDailyRequestLimit') <> 'number'
    or jsonb_typeof(p_request -> 'companyDailyRequestLimit') <> 'number'
    or jsonb_typeof(p_request -> 'userDailyRequestLimit') <> 'number'
    or jsonb_typeof(p_request -> 'dailyBudgetCents') <> 'number'
    or jsonb_typeof(p_request -> 'companyMonthlyBudgetCents') <> 'number' then
    raise exception 'AI quota status contract is invalid'
      using errcode = '22023';
  end if;

  begin
    if (p_request ->> 'contractVersion')::integer <> 1 then
      raise exception 'AI quota status contract version is unsupported'
        using errcode = '22023';
    end if;

    estimated_cost_cents := (p_request ->> 'estimatedCostCents')::integer;
    global_daily_request_limit :=
      (p_request ->> 'globalDailyRequestLimit')::integer;
    company_daily_request_limit :=
      (p_request ->> 'companyDailyRequestLimit')::integer;
    user_daily_request_limit :=
      (p_request ->> 'userDailyRequestLimit')::integer;
    daily_budget_cents := (p_request ->> 'dailyBudgetCents')::integer;
    company_monthly_budget_cents :=
      (p_request ->> 'companyMonthlyBudgetCents')::integer;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'AI quota status numeric values are invalid'
        using errcode = '22023';
  end;

  if estimated_cost_cents not between 1 and 100000000
    or global_daily_request_limit not between 1 and 100000
    or company_daily_request_limit not between 1 and 100000
    or user_daily_request_limit not between 1 and 100000
    or daily_budget_cents not between 1 and 100000000
    or company_monthly_budget_cents not between 1 and 1000000000
    or estimated_cost_cents > daily_budget_cents
    or estimated_cost_cents > company_monthly_budget_cents then
    raise exception 'AI quota status values are outside bounded limits'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.company_memberships as membership
    where membership.company_id = p_company_id
      and membership.user_id = p_actor_user_id
      and membership.role not in ('customer_portal', 'employee_portal')
  ) then
    raise exception 'AI quota actor lacks an exact internal company membership'
      using errcode = '42501';
  end if;

  utc_day_start := utc_day_key::timestamp at time zone 'UTC';
  utc_day_end := utc_day_start + interval '1 day';
  utc_month_start := date_trunc('month', utc_day_start);
  utc_month_end := utc_month_start + interval '1 month';

  select
    least(
      count(*) filter (
        where audit.created_at >= utc_day_start
          and audit.created_at < utc_day_end
      ),
      100001::bigint
    )::integer,
    least(
      count(*) filter (
        where audit.company_id = p_company_id
          and audit.created_at >= utc_day_start
          and audit.created_at < utc_day_end
      ),
      100001::bigint
    )::integer,
    least(
      count(*) filter (
        where audit.company_id = p_company_id
          and audit.actor_user_id = p_actor_user_id
          and audit.created_at >= utc_day_start
          and audit.created_at < utc_day_end
      ),
      100001::bigint
    )::integer,
    least(
      coalesce(
        sum(coalesce(audit.estimated_cost_cents, 0)) filter (
          where audit.created_at >= utc_day_start
            and audit.created_at < utc_day_end
        ),
        0::bigint
      ),
      100000001::bigint
    )::integer,
    least(
      coalesce(
        sum(coalesce(audit.estimated_cost_cents, 0)) filter (
          where audit.company_id = p_company_id
            and audit.created_at >= utc_month_start
            and audit.created_at < utc_month_end
        ),
        0::bigint
      ),
      1000000001::bigint
    )::integer
  into
    global_requests_today,
    company_requests_today,
    user_requests_today,
    reserved_cost_cents_today,
    company_reserved_cost_cents_this_month
  from public.ai_audit_events as audit
  where audit.event_type = 'request_initiated'
    and (
      (
        audit.created_at >= utc_day_start
        and audit.created_at < utc_day_end
      )
      or (
        audit.company_id = p_company_id
        and audit.created_at >= utc_month_start
        and audit.created_at < utc_month_end
      )
    );

  if global_requests_today >= global_daily_request_limit then
    blocking_reason := 'global_daily_request_limit';
  elsif company_requests_today >= company_daily_request_limit then
    blocking_reason := 'company_daily_request_limit';
  elsif user_requests_today >= user_daily_request_limit then
    blocking_reason := 'user_daily_request_limit';
  elsif reserved_cost_cents_today + estimated_cost_cents > daily_budget_cents then
    blocking_reason := 'global_daily_budget';
  elsif company_reserved_cost_cents_this_month + estimated_cost_cents
    > company_monthly_budget_cents then
    blocking_reason := 'company_monthly_budget';
  end if;

  return jsonb_build_object(
    'contractVersion', 1,
    'companyId', p_company_id,
    'actorUserId', p_actor_user_id,
    'requestCapacityAvailable', blocking_reason = 'none',
    'blockingReason', blocking_reason,
    'checkedAt', now(),
    'globalRequestsToday', global_requests_today,
    'companyRequestsToday', company_requests_today,
    'userRequestsToday', user_requests_today,
    'reservedCostCentsToday', reserved_cost_cents_today,
    'companyReservedCostCentsThisMonth',
      company_reserved_cost_cents_this_month
  );
end;
$$;

revoke execute on function public.wtos_get_ai_quota_status_v1(uuid, uuid, jsonb)
from public, anon, authenticated;

grant execute on function public.wtos_get_ai_quota_status_v1(uuid, uuid, jsonb)
to service_role;

commit;
