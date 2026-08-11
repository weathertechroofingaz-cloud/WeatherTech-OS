import type Stripe from "stripe";
import type { StripeObjectMappingRecord } from "../crm/types";

const recoverablePaymentIntentProviderStatuses = new Set<Stripe.PaymentIntent.Status>([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "processing",
  "succeeded",
]);

export function createStripePaymentIntentGenerationKey(input: {
  priorPaymentIntentMappingId: string | null;
}) {
  const priorMappingId = input.priorPaymentIntentMappingId?.trim() || null;

  if (
    priorMappingId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      priorMappingId,
    )
  ) {
    throw new Error("The invoice state cannot safely identify a Stripe payment request.");
  }

  return `prior-payment-intent:${priorMappingId ?? "none"}`;
}

export function isRecoverablePaymentIntentProviderStatus(
  status: Stripe.PaymentIntent.Status,
) {
  return recoverablePaymentIntentProviderStatuses.has(status);
}

export function paymentIntentMatchesMapping(input: {
  mapping: StripeObjectMappingRecord;
  intent: Stripe.PaymentIntent;
  companyId: string;
  connectionId: string;
  accountMappingId: string;
  invoiceId: string;
  customerId: string | null;
  localObjectType: "invoice" | "deposit";
  amountCents: number;
  currency: string;
  livemode: boolean;
}) {
  const { mapping, intent } = input;
  const mappingMetadata =
    mapping.metadata_summary &&
    typeof mapping.metadata_summary === "object" &&
    !Array.isArray(mapping.metadata_summary)
      ? mapping.metadata_summary
      : null;
  const expectedCustomerId = input.customerId ?? "none";

  return (
    mapping.company_id === input.companyId &&
    mapping.integration_connection_id === input.connectionId &&
    mapping.stripe_company_account_id === input.accountMappingId &&
    mapping.customer_id === input.customerId &&
    mapping.invoice_id === input.invoiceId &&
    mapping.local_object_type === input.localObjectType &&
    mapping.stripe_object_type === "payment_intent" &&
    Number(mapping.amount_cents) === input.amountCents &&
    mapping.currency === input.currency &&
    mapping.livemode === input.livemode &&
    mappingMetadata?.wtos_company_id === input.companyId &&
    mappingMetadata.wtos_customer_id === expectedCustomerId &&
    mappingMetadata.wtos_invoice_id === input.invoiceId &&
    mappingMetadata.wtos_operation_key === mapping.operation_key &&
    mappingMetadata.wtos_source_of_truth === "supabase" &&
    intent.id === mapping.stripe_object_id &&
    intent.amount === input.amountCents &&
    intent.currency === input.currency &&
    intent.livemode === input.livemode &&
    intent.metadata.wtos_company_id === input.companyId &&
    intent.metadata.wtos_customer_id === expectedCustomerId &&
    intent.metadata.wtos_invoice_id === input.invoiceId &&
    intent.metadata.wtos_operation_key === mapping.operation_key &&
    intent.metadata.wtos_source_of_truth === "supabase"
  );
}
