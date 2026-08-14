begin;

-- PostgREST retries SQLSTATE 40001. Keep genuine coordinator contention
-- retryable, but classify the hardened core's expected-version refusals as a
-- non-retryable application exception so stale reviews fail promptly.
create or replace function public.wtos_reconcile_customer_property(
  reconciliation_request jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- This call intentionally remains outside the exception block. A real
  -- concurrent identity mutation must preserve its serialization-failure code.
  perform public.wtos_acquire_crm_identity_invariant_lock();

  begin
    return public.wtos_reconcile_customer_property_serialized_core(
      reconciliation_request
    );
  exception
    when serialization_failure then
      raise exception using
        message = sqlerrm,
        errcode = 'P0001';
  end;
end;
$$;

revoke all on function public.wtos_reconcile_customer_property(jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.wtos_reconcile_customer_property(jsonb)
to authenticated;

commit;
