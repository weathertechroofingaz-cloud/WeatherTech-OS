begin;

-- Stripe refund events can be delivered more than once and in a different
-- order than the API response that creates the local refund mapping. Keep the
-- payment, invoice, object mapping, and webhook ledger transition in one
-- service-role-only database transaction so a retry can never subtract twice.
create or replace function public.wtos_reconcile_stripe_refund(
  target_refund_mapping_id uuid,
  target_webhook_event_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  refund_mapping public.stripe_object_mappings%rowtype;
  payment_mapping public.stripe_object_mappings%rowtype;
  webhook_event public.stripe_webhook_events%rowtype;
  recorded_payment public.payments%rowtype;
  invoice_record public.invoices%rowtype;
  provider_status text;
  provider_amount_cents bigint;
  payment_amount_cents bigint;
  reconciled_amount_cents bigint;
  updated_amount_paid numeric(12, 2);
  updated_balance_due numeric(12, 2);
  updated_invoice_status text;
  reconciliation_applied boolean;
begin
  select object_mapping.*
  into refund_mapping
  from public.stripe_object_mappings as object_mapping
  where object_mapping.id = target_refund_mapping_id
  for update;

  if refund_mapping.id is null then
    raise exception 'Stripe refund mapping was not found.';
  end if;

  select event_record.*
  into webhook_event
  from public.stripe_webhook_events as event_record
  where event_record.id = target_webhook_event_id
  for update;

  if webhook_event.id is null then
    raise exception 'Stripe refund webhook event was not found.';
  end if;

  if refund_mapping.local_object_type <> 'refund'
    or refund_mapping.stripe_object_type <> 'refund'
    or refund_mapping.payment_id is null
    or refund_mapping.invoice_id is null
    or refund_mapping.amount_cents is null
    or refund_mapping.amount_cents <= 0
    or refund_mapping.currency is null then
    raise exception 'Stripe refund mapping is incomplete.';
  end if;

  if webhook_event.company_id is distinct from refund_mapping.company_id
    or webhook_event.stripe_company_account_id is distinct from refund_mapping.stripe_company_account_id
    or webhook_event.integration_connection_id is distinct from refund_mapping.integration_connection_id
    or webhook_event.livemode is distinct from refund_mapping.livemode
    or webhook_event.event_type not in ('refund.created', 'refund.updated', 'refund.failed')
    or webhook_event.payload_summary ->> 'objectType' is distinct from 'refund'
    or webhook_event.payload_summary ->> 'objectId' is distinct from refund_mapping.stripe_object_id
    or webhook_event.payload_summary ->> 'currency' is distinct from refund_mapping.currency then
    raise exception 'Stripe refund webhook does not match its company-scoped mapping.';
  end if;

  provider_status := webhook_event.payload_summary ->> 'status';
  if provider_status is null
    or provider_status not in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') then
    raise exception 'Stripe refund webhook status is unsupported.';
  end if;

  if webhook_event.event_type = 'refund.failed'
    and provider_status <> 'failed' then
    raise exception 'Stripe refund.failed webhook has a conflicting provider status.';
  end if;

  if provider_status = 'succeeded'
    and webhook_event.event_type not in ('refund.created', 'refund.updated') then
    raise exception 'Only refund.created or refund.updated can reconcile a successful refund.';
  end if;

  if coalesce(webhook_event.payload_summary ->> 'amount', '') !~ '^[0-9]+$' then
    raise exception 'Stripe refund webhook amount is invalid.';
  end if;
  provider_amount_cents := (webhook_event.payload_summary ->> 'amount')::bigint;

  if provider_amount_cents is distinct from refund_mapping.amount_cents then
    raise exception 'Stripe refund webhook amount does not match its mapping.';
  end if;

  if not exists (
    select 1
    from public.companies as company
    join public.stripe_company_accounts as account
      on account.company_id = company.id
    join public.integration_connections as connection
      on connection.id = account.integration_connection_id
    where company.id = refund_mapping.company_id
      and company.name = 'WeatherTech Roofing LLC'
      and company.trade = 'roofing'
      and account.id = refund_mapping.stripe_company_account_id
      and account.integration_connection_id = refund_mapping.integration_connection_id
      and account.stripe_account_id = webhook_event.stripe_account_id
      and account.livemode = refund_mapping.livemode
      and account.payment_writes_enabled
      and account.refund_writes_enabled
      and account.webhook_processing_enabled
      and connection.company_id = company.id
      and connection.provider = 'stripe'
      and connection.external_account_id = account.stripe_account_id
  ) then
    raise exception 'Stripe refund reconciliation is not enabled for this company mapping.';
  end if;

  select payment.*
  into recorded_payment
  from public.payments as payment
  where payment.id = refund_mapping.payment_id
    and payment.company_id = refund_mapping.company_id
  for update;

  if recorded_payment.id is null
    or recorded_payment.invoice_id is distinct from refund_mapping.invoice_id
    or recorded_payment.customer_id is distinct from refund_mapping.customer_id
    or recorded_payment.method <> 'stripe' then
    raise exception 'Stripe refund payment does not match its company-scoped mapping.';
  end if;

  select invoice.*
  into invoice_record
  from public.invoices as invoice
  where invoice.id = refund_mapping.invoice_id
    and invoice.company_id = refund_mapping.company_id
  for update;

  if invoice_record.id is null
    or invoice_record.customer_id is distinct from refund_mapping.customer_id
    or recorded_payment.invoice_id is distinct from invoice_record.id then
    raise exception 'Stripe refund invoice does not match its company-scoped payment.';
  end if;

  select object_mapping.*
  into payment_mapping
  from public.stripe_object_mappings as object_mapping
  where object_mapping.company_id = refund_mapping.company_id
    and object_mapping.stripe_company_account_id = refund_mapping.stripe_company_account_id
    and object_mapping.integration_connection_id = refund_mapping.integration_connection_id
    and object_mapping.payment_id = recorded_payment.id
    and object_mapping.invoice_id = invoice_record.id
    and object_mapping.customer_id is not distinct from recorded_payment.customer_id
    and object_mapping.stripe_object_type = 'payment_intent'
    and object_mapping.stripe_object_id = recorded_payment.reference
  for update;

  if payment_mapping.id is null
    or payment_mapping.amount_cents is null
    or payment_mapping.currency is distinct from refund_mapping.currency
    or payment_mapping.livemode is distinct from refund_mapping.livemode
    or webhook_event.payload_summary ->> 'paymentIntentId' is distinct from payment_mapping.stripe_object_id then
    raise exception 'Stripe refund does not match its original PaymentIntent.';
  end if;

  payment_amount_cents := round(recorded_payment.amount * 100)::bigint;
  if payment_amount_cents <= 0
    or refund_mapping.amount_cents is distinct from payment_amount_cents
    or payment_mapping.amount_cents is distinct from payment_amount_cents then
    raise exception 'WeatherTech OS supports only a full refund of the recorded Stripe payment.';
  end if;

  reconciliation_applied :=
    refund_mapping.metadata_summary ->> 'wtos_refund_reconciliation_applied' = 'true';

  if reconciliation_applied then
    if provider_status in ('failed', 'canceled') then
      raise exception 'A reconciled Stripe refund received a conflicting terminal provider state.';
    end if;

    if coalesce(
      refund_mapping.metadata_summary ->> 'wtos_refund_reconciliation_amount_cents',
      ''
    ) !~ '^[0-9]+$' then
      raise exception 'A reconciled Stripe refund has an invalid durable accounting marker.';
    end if;

    reconciled_amount_cents := (
      refund_mapping.metadata_summary ->> 'wtos_refund_reconciliation_amount_cents'
    )::bigint;

    if reconciled_amount_cents is distinct from refund_mapping.amount_cents
      or recorded_payment.status <> 'refunded'
      or payment_mapping.status <> 'refunded' then
      raise exception 'A reconciled Stripe refund has a conflicting local accounting state.';
    end if;

    -- Stripe does not guarantee event ordering. A pending snapshot can arrive
    -- after the succeeded snapshot; the durable reconciliation marker remains
    -- authoritative and the stale event is an accounting no-op.
    update public.stripe_object_mappings
    set status = 'refunded'
    where id = refund_mapping.id
      and company_id = refund_mapping.company_id
      and stripe_company_account_id = refund_mapping.stripe_company_account_id
      and integration_connection_id = refund_mapping.integration_connection_id;

    update public.stripe_webhook_events
    set
      processing_status = 'processed',
      processed_at = coalesce(processed_at, now()),
      error_message = null
    where id = webhook_event.id
      and company_id = refund_mapping.company_id;

    return recorded_payment.id;
  end if;

  if exists (
    select 1
    from public.stripe_object_mappings as prior_refund
    where prior_refund.company_id = refund_mapping.company_id
      and prior_refund.stripe_company_account_id = refund_mapping.stripe_company_account_id
      and prior_refund.integration_connection_id = refund_mapping.integration_connection_id
      and prior_refund.payment_id = recorded_payment.id
      and prior_refund.stripe_object_type = 'refund'
      and prior_refund.id <> refund_mapping.id
      and prior_refund.metadata_summary ->> 'wtos_refund_reconciliation_applied' = 'true'
  ) then
    raise exception 'The Stripe payment already has a reconciled refund.';
  end if;

  if provider_status <> 'succeeded' then
    update public.stripe_object_mappings
    set status = provider_status
    where id = refund_mapping.id
      and company_id = refund_mapping.company_id
      and stripe_company_account_id = refund_mapping.stripe_company_account_id
      and integration_connection_id = refund_mapping.integration_connection_id;

    update public.stripe_webhook_events
    set
      processing_status = 'processed',
      processed_at = now(),
      error_message = null
    where id = webhook_event.id
      and company_id = refund_mapping.company_id;

    return recorded_payment.id;
  end if;

  if recorded_payment.status <> 'posted' then
    raise exception 'Only a posted Stripe payment can be refunded.';
  end if;

  if invoice_record.amount_paid < recorded_payment.amount then
    raise exception 'Stripe refund exceeds the invoice paid amount.';
  end if;

  updated_amount_paid := invoice_record.amount_paid - recorded_payment.amount;
  updated_balance_due := greatest(invoice_record.total - updated_amount_paid, 0);
  updated_invoice_status := case
    when invoice_record.status = 'void' then 'void'
    when updated_balance_due = 0 then 'paid'
    when invoice_record.status = 'paid'
      and invoice_record.due_date is not null
      and invoice_record.due_date < current_date then 'overdue'
    when invoice_record.status = 'paid' then 'sent'
    else invoice_record.status
  end;

  update public.payments
  set
    status = 'refunded',
    notes = concat_ws(
      ' ',
      nullif(btrim(notes), ''),
      'Refunded from a verified Stripe webhook.'
    )
  where id = recorded_payment.id
    and company_id = refund_mapping.company_id;

  update public.invoices
  set
    amount_paid = updated_amount_paid,
    balance_due = updated_balance_due,
    status = updated_invoice_status
  where id = invoice_record.id
    and company_id = refund_mapping.company_id;

  update public.stripe_object_mappings
  set status = 'refunded'
  where id = payment_mapping.id
    and company_id = refund_mapping.company_id
    and stripe_company_account_id = refund_mapping.stripe_company_account_id
    and integration_connection_id = refund_mapping.integration_connection_id;

  update public.stripe_object_mappings
  set
    status = 'refunded',
    metadata_summary = coalesce(metadata_summary, '{}'::jsonb) || jsonb_build_object(
      'wtos_refund_reconciliation_applied', true,
      'wtos_refund_reconciliation_applied_at', coalesce(webhook_event.provider_created_at, now()),
      'wtos_refund_reconciliation_amount_cents', refund_mapping.amount_cents
    )
  where id = refund_mapping.id
    and company_id = refund_mapping.company_id
    and stripe_company_account_id = refund_mapping.stripe_company_account_id
    and integration_connection_id = refund_mapping.integration_connection_id;

  update public.stripe_webhook_events
  set
    processing_status = 'processed',
    processed_at = now(),
    error_message = null
  where id = webhook_event.id
    and company_id = refund_mapping.company_id;

  return recorded_payment.id;
end;
$$;

revoke all on function public.wtos_reconcile_stripe_refund(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.wtos_reconcile_stripe_refund(uuid, uuid)
to service_role;

commit;
