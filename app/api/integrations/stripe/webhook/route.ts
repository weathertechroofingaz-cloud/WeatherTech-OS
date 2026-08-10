import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { sanitizeStripeErrorMessage } from "../../../../../lib/stripe/foundation";
import {
  createStripeApiClient,
  createStripeServiceClient,
  getStripeServerConfig,
} from "../../../../../lib/stripe/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const refundEventTypes = new Set([
  "refund.created",
  "refund.updated",
  "refund.failed",
]);

const supportedEventTypes = new Set([
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "charge.refunded",
  ...refundEventTypes,
]);

function metadataValue(
  metadata: Stripe.Metadata | null | undefined,
  key: string,
  pattern: RegExp,
) {
  const value = metadata?.[key];
  return typeof value === "string" && pattern.test(value) ? value : null;
}

function objectSummary(object: Stripe.Event.Data.Object) {
  const candidate = object as Stripe.Event.Data.Object & {
    id?: string;
    object?: string;
    status?: string;
    amount?: number;
    amount_received?: number;
    amount_refunded?: number;
    currency?: string;
    payment_intent?: string | Stripe.PaymentIntent | null;
    metadata?: Stripe.Metadata | null;
  };

  return {
    objectId: candidate.id ?? null,
    objectType: candidate.object ?? null,
    status: candidate.status ?? null,
    amount:
      candidate.amount_received ??
      candidate.amount_refunded ??
      candidate.amount ??
      null,
    currency: candidate.currency ?? null,
    paymentIntentId:
      typeof candidate.payment_intent === "string"
        ? candidate.payment_intent
        : candidate.payment_intent?.id ?? null,
    wtosCompanyId: metadataValue(
      candidate.metadata,
      "wtos_company_id",
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
    wtosInvoiceId: metadataValue(
      candidate.metadata,
      "wtos_invoice_id",
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
    wtosPaymentId: metadataValue(
      candidate.metadata,
      "wtos_payment_id",
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    ),
    wtosOperationKey: metadataValue(
      candidate.metadata,
      "wtos_operation_key",
      /^wtos_[a-f0-9]{64}$/,
    ),
    wtosSourceOfTruth:
      candidate.metadata?.wtos_source_of_truth === "supabase"
        ? "supabase"
        : null,
  };
}

function mappingLookup(summary: ReturnType<typeof objectSummary>) {
  if (summary.objectType === "payment_intent" && summary.objectId) {
    return { stripeObjectType: "payment_intent" as const, objectId: summary.objectId };
  }

  if (summary.objectType === "refund" && summary.objectId) {
    return { stripeObjectType: "refund" as const, objectId: summary.objectId };
  }

  if (summary.objectType === "charge" && summary.paymentIntentId) {
    return {
      stripeObjectType: "payment_intent" as const,
      objectId: summary.paymentIntentId,
    };
  }

  return null;
}

export async function POST(request: NextRequest) {
  const config = getStripeServerConfig();
  const stripe = createStripeApiClient();
  const serviceClient = createStripeServiceClient();

  if (
    !config.webhookSecret ||
    !config.weatherTechAccountId ||
    !config.webhookProcessingEnabled ||
    !stripe ||
    !serviceClient
  ) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook processing remains disabled." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { ok: false, message: "Stripe signature is required." },
      { status: 400 },
    );
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      config.webhookSecret,
    );
  } catch {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook signature verification failed." },
      { status: 400 },
    );
  }

  const eventAccountId = event.account ?? config.weatherTechAccountId;
  if (eventAccountId !== config.weatherTechAccountId) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook account is not authorized." },
      { status: 403 },
    );
  }

  const { data: account } = await serviceClient
    .from("stripe_company_accounts")
    .select("*")
    .eq("stripe_account_id", eventAccountId)
    .maybeSingle();

  if (
    !account ||
    !account.webhook_processing_enabled ||
    account.livemode !== event.livemode
  ) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook has no enabled company mapping." },
      { status: 403 },
    );
  }

  const { data: existingEvent } = await serviceClient
    .from("stripe_webhook_events")
    .select("id, processing_status, attempt_count")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existingEvent?.processing_status === "processed" ||
      existingEvent?.processing_status === "ignored") {
    return NextResponse.json({ ok: true, duplicatePrevented: true });
  }

  const summary = objectSummary(event.data.object);
  const { data: storedEvent, error: eventInsertError } = await serviceClient
    .from("stripe_webhook_events")
    .upsert(
      {
        company_id: account.company_id,
        stripe_company_account_id: account.id,
        integration_connection_id: account.integration_connection_id,
        stripe_event_id: event.id,
        stripe_account_id: eventAccountId,
        event_type: event.type,
        api_version: event.api_version ?? null,
        livemode: event.livemode,
        processing_status: "received",
        attempt_count: (existingEvent?.attempt_count ?? 0) + 1,
        payload_summary: summary,
        error_message: null,
        provider_created_at: new Date(event.created * 1000).toISOString(),
        processed_at: null,
      },
      { onConflict: "stripe_event_id" },
    )
    .select("*")
    .single();

  if (eventInsertError || !storedEvent) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook could not be recorded safely." },
      { status: 500 },
    );
  }

  if (!supportedEventTypes.has(event.type)) {
    await serviceClient
      .from("stripe_webhook_events")
      .update({
        processing_status: "ignored",
        processed_at: new Date().toISOString(),
      })
      .eq("id", storedEvent.id)
      .eq("company_id", account.company_id);
    return NextResponse.json({ ok: true, ignored: true });
  }

  try {
    const lookup = mappingLookup(summary);
    if (!lookup) {
      await serviceClient
        .from("stripe_webhook_events")
        .update({
          processing_status: "ignored",
          processed_at: new Date().toISOString(),
        })
        .eq("id", storedEvent.id)
        .eq("company_id", account.company_id);
      return NextResponse.json({ ok: true, ignored: true });
    }

    const { data: mapping } = await serviceClient
      .from("stripe_object_mappings")
      .select("*")
      .eq("company_id", account.company_id)
      .eq("stripe_company_account_id", account.id)
      .eq("integration_connection_id", account.integration_connection_id)
      .eq("stripe_object_type", lookup.stripeObjectType)
      .eq("stripe_object_id", lookup.objectId)
      .maybeSingle();

    if (!mapping) {
      const isWeatherTechRefundMappingRace =
        refundEventTypes.has(event.type) &&
        summary.objectType === "refund" &&
        summary.wtosCompanyId === account.company_id &&
        summary.wtosInvoiceId !== null &&
        summary.wtosPaymentId !== null &&
        summary.wtosOperationKey !== null &&
        summary.wtosSourceOfTruth === "supabase";

      if (isWeatherTechRefundMappingRace) {
        throw new Error(
          "No company-scoped Stripe refund mapping exists yet; Stripe should retry this webhook.",
        );
      }

      await serviceClient
        .from("stripe_webhook_events")
        .update({
          processing_status: "ignored",
          processed_at: new Date().toISOString(),
        })
        .eq("id", storedEvent.id)
        .eq("company_id", account.company_id);
      return NextResponse.json({ ok: true, ignored: true });
    }

    if (
      event.type === "payment_intent.succeeded" &&
      (summary.amount !== mapping.amount_cents ||
        summary.currency !== mapping.currency ||
        mapping.livemode !== event.livemode)
    ) {
      throw new Error(
        "Stripe payment amount, currency, or live mode does not match its approved mapping.",
      );
    }

    if (refundEventTypes.has(event.type)) {
      if (
        mapping.stripe_object_type !== "refund" ||
        summary.objectType !== "refund" ||
        summary.amount !== mapping.amount_cents ||
        summary.currency !== mapping.currency ||
        mapping.livemode !== event.livemode
      ) {
        throw new Error(
          "Stripe refund amount, currency, live mode, or object type does not match its approved mapping.",
        );
      }

      const { error: refundError } = await serviceClient.rpc(
        "wtos_reconcile_stripe_refund",
        {
          target_refund_mapping_id: mapping.id,
          target_webhook_event_id: storedEvent.id,
        },
      );

      if (refundError) {
        throw new Error("Stripe refund could not be reconciled atomically.");
      }

      return NextResponse.json({ ok: true, duplicatePrevented: false });
    }

    if (event.type === "charge.refunded") {
      // Refund-object events own the atomic accounting transition. Stripe also
      // emits charge.refunded for partial refunds, so this aggregate event is
      // intentionally observational and cannot mark a full payment refunded.
      await serviceClient
        .from("stripe_webhook_events")
        .update({
          processing_status: "processed",
          processed_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", storedEvent.id)
        .eq("company_id", account.company_id);
      return NextResponse.json({ ok: true, duplicatePrevented: false });
    }

    const mappingStatus =
      event.type === "payment_intent.succeeded"
        ? "succeeded"
        : event.type === "payment_intent.payment_failed"
          ? "failed"
          : event.type === "payment_intent.canceled"
            ? "canceled"
            : summary.status ?? event.type;
    const { error: mappingUpdateError } = await serviceClient
      .from("stripe_object_mappings")
      .update({ status: mappingStatus })
      .eq("id", mapping.id)
      .eq("company_id", account.company_id)
      .eq("integration_connection_id", account.integration_connection_id);

    if (mappingUpdateError) {
      throw new Error("Stripe object mapping could not be updated.");
    }

    if (event.type === "payment_intent.succeeded" && !mapping.payment_id) {
      const { error: paymentError } = await serviceClient.rpc(
        "wtos_record_stripe_payment",
        {
          target_mapping_id: mapping.id,
          provider_paid_at: new Date(event.created * 1000).toISOString(),
        },
      );

      if (paymentError) {
        throw new Error("Stripe payment could not be recorded atomically.");
      }
    }

    await serviceClient
      .from("stripe_webhook_events")
      .update({
        processing_status: "processed",
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", storedEvent.id)
      .eq("company_id", account.company_id);

    return NextResponse.json({ ok: true, duplicatePrevented: false });
  } catch (error) {
    const message = sanitizeStripeErrorMessage(error);
    await serviceClient
      .from("stripe_webhook_events")
      .update({ processing_status: "failed", error_message: message })
      .eq("id", storedEvent.id)
      .eq("company_id", account.company_id);

    return NextResponse.json(
      { ok: false, message },
      { status: 500 },
    );
  }
}
