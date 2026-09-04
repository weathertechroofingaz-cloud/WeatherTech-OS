begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table public.ai_quota_probe_refresh_cooldowns (
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  next_allowed_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (company_id, actor_user_id)
);

alter table public.ai_quota_probe_refresh_cooldowns enable row level security;
alter table public.ai_quota_probe_refresh_cooldowns force row level security;

revoke all on table public.ai_quota_probe_refresh_cooldowns
from public, anon, authenticated, service_role;

grant select, insert, update on table public.ai_quota_probe_refresh_cooldowns
to service_role;

create or replace function public.wtos_claim_ai_quota_probe_refresh_v1(
  p_company_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  trusted_claims jsonb := coalesce((select auth.jwt()), '{}'::jsonb);
  checked_at timestamptz := clock_timestamp();
  claimed_next_allowed_at timestamptz;
  claim_allowed boolean := false;
  retry_after_seconds integer := 0;
begin
  if trusted_claims ->> 'role' is distinct from 'service_role' then
    raise exception 'AI quota-probe refresh claims require the trusted server role'
      using errcode = '42501';
  end if;

  if p_company_id is null or p_actor_user_id is null then
    raise exception 'Exact company and actor identifiers are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.company_memberships as membership
    where membership.company_id = p_company_id
      and membership.user_id = p_actor_user_id
      and membership.role not in ('customer_portal', 'employee_portal')
  ) then
    raise exception 'AI quota-probe refresh actor lacks an exact internal company membership'
      using errcode = '42501';
  end if;

  insert into public.ai_quota_probe_refresh_cooldowns as cooldown (
    company_id,
    actor_user_id,
    next_allowed_at,
    updated_at
  )
  values (
    p_company_id,
    p_actor_user_id,
    checked_at + interval '30 seconds',
    checked_at
  )
  on conflict (company_id, actor_user_id) do update
  set
    next_allowed_at = excluded.next_allowed_at,
    updated_at = excluded.updated_at
  where cooldown.next_allowed_at <= checked_at
  returning next_allowed_at into claimed_next_allowed_at;

  claim_allowed := found;

  if not claim_allowed then
    select cooldown.next_allowed_at
    into claimed_next_allowed_at
    from public.ai_quota_probe_refresh_cooldowns as cooldown
    where cooldown.company_id = p_company_id
      and cooldown.actor_user_id = p_actor_user_id;

    if not found or claimed_next_allowed_at is null then
      raise exception 'AI quota-probe refresh cooldown could not be verified'
        using errcode = '55000';
    end if;

    retry_after_seconds := greatest(
      1,
      least(
        30,
        ceil(extract(epoch from claimed_next_allowed_at - checked_at))::integer
      )
    );
  end if;

  return jsonb_build_object(
    'contractVersion', 1,
    'companyId', p_company_id,
    'actorUserId', p_actor_user_id,
    'allowed', claim_allowed,
    'retryAfterSeconds', retry_after_seconds,
    'checkedAt', checked_at
  );
end;
$$;

revoke all on function public.wtos_claim_ai_quota_probe_refresh_v1(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.wtos_claim_ai_quota_probe_refresh_v1(uuid, uuid)
to service_role;

commit;
