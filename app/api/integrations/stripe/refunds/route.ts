import { NextRequest, NextResponse } from "next/server";
import {
  createStripeOperationKey,
  sanitizeStripeErrorMessage,
} from "../../../../../lib/stripe/foundation";
import {
  createStripeApiClient,
  createStripeServiceClient,
  getStripeCompanyAccountContext,
  getStripeServerConfig,
  probeStripeAccount,
} from "../../../../../lib/stripe/serverClient";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RefundRequest = {
  companyId?: unknown;
  paymentId?: unknown;
  amountCents?: unknown;
  attemptKey?: unknown;
  reason?: unknown;
  ownerApproval?: unknown;
};

function requestString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createStripeServiceClient();
  const stripe = createStripeApiClient();
  const config = getStripeServerConfig();

  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before creating a refund." },
      { status: 401 },
    );
  }

  let body: RefundRequest;
  try {
    body = (await request.json()) as RefundRequest;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Refund request JSON is invalid." },
      { status: 400 },
    );
  }

  const companyId = requestString(body.companyId);
  const paymentId = requestString(body.paymentId);
  const attemptKey = requestString(body.attemptKey);
  const amountCents =
    typeof body.amountCents === "number" && Number.isSafeInteger(body.amountCents)
      ? body.amountCents
      : null;
  const reason =
    body.reason === "duplicate" || body.reason === "fraudulent"
      ? body.reason
      : "requested_by_customer";

  if (
    !companyId ||
    !paymentId ||
    !attemptKey ||
    amountCents === null ||
    amountCents <= 0
  ) {
    return NextResponse.json(
      { ok: false, message: "Company, payment, refund amount, and attempt key are required." },
      { status: 400 },
    );
  }

  if (body.ownerApproval !== true) {
    return NextResponse.json(
      { ok: false, message: "Explicit owner approval is required for every Stripe refund." },
      { status: 403 },
    );
  }

  const { data: ownerMembership } = await sessionClient
    .from("company_memberships")
    .select("company_id")
    .eq("user_id", userResult.user.id)
    .eq("company_id", companyId)
    .eq("role", "owner")
    .maybeSingle();

  if (!ownerMembership) {
    return NextResponse.json(
      { ok: false, message: "A company owner must approve Stripe refunds." },
      { status: 403 },
    );
  }

  if (
    !config.livePaymentsEnabled ||
    !config.refundsEnabled ||
    !config.webhookProcessingEnabled ||
    !stripe ||
    !config.weatherTechAccountId
  ) {
    return NextResponse.json(
      { ok: false, message: "Live Stripe refunds remain disabled." },
      { status: 409 },
    );
  }

  try {
    const context = await getStripeCompanyAccountContext(serviceClient, companyId);

    if (
      !context.account.payment_writes_enabled ||
      !context.account.refund_writes_enabled ||
      !context.account.webhook_processing_enabled ||
      context.account.stripe_account_id !== config.weatherTechAccountId
    ) {
      return NextResponse.json(
        { ok: false, message: "Stripe refunds are disabled for this company mapping." },
        { status: 409 },
      );
    }

    const accountProbe = await probeStripeAccount(stripe, config.weatherTechAccountId);
    if (!accountProbe.ok) {
      return NextResponse.json(
        { ok: false, message: "The mapped Stripe account did not pass the write-safety probe." },
        { status: 409 },
      );
    }

    const { data: payment, error: paymentError } = await serviceClient
      .from("payments")
      .select("*")
      .eq("id", paymentId)
      .eq("company_id", companyId)
      .single();

    if (paymentError || !payment || !payment.invoice_id) {
      return NextResponse.json(
        { ok: false, message: "The payment does not belong to an authorized company invoice." },
        { status: 404 },
      );
    }

    const paymentAmountCents = Math.round(Number(payment.amount) * 100);
    if (
      payment.method !== "stripe" ||
      paymentAmountCents <= 0
    ) {
      return NextResponse.json(
        { ok: false, message: "Only a posted Stripe payment can be refunded." },
        { status: 409 },
      );
    }

    if (amountCents !== paymentAmountCents) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "WeatherTech OS supports only a full refund of the recorded Stripe payment.",
        },
        { status: 409 },
      );
    }

    const operationKey = createStripeOperationKey({
      operation: "refund",
      companyId,
      invoiceId: payment.invoice_id,
      amountCents,
      attemptKey,
    });
    const { data: existingRefund } = await serviceClient
      .from("stripe_object_mappings")
      .select("*")
      .eq("company_id", companyId)
      .eq("operation_key", operationKey)
      .maybeSingle();

    if (existingRefund) {
      const existingRefundMatches =
        existingRefund.company_id === companyId &&
        existingRefund.stripe_company_account_id === context.account.id &&
        existingRefund.integration_connection_id === context.connection.id &&
        existingRefund.customer_id === payment.customer_id &&
        existingRefund.invoice_id === payment.invoice_id &&
        existingRefund.payment_id === payment.id &&
        existingRefund.local_object_type === "refund" &&
        existingRefund.stripe_object_type === "refund" &&
        Number(existingRefund.amount_cents) === amountCents &&
        existingRefund.currency === context.account.default_currency &&
        existingRefund.livemode === context.account.livemode;

      if (!existingRefundMatches) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "The existing Stripe refund did not pass its company-isolation check.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json({
        ok: true,
        duplicatePrevented: true,
        refundId: existingRefund.stripe_object_id,
        status: existingRefund.status,
      });
    }

    const { data: refundMappings, error: refundMappingsError } =
      await serviceClient
        .from("stripe_object_mappings")
        .select("*")
        .eq("company_id", companyId)
        .eq("payment_id", payment.id)
        .eq("local_object_type", "refund")
        .eq("stripe_object_type", "refund");

    if (refundMappingsError) {
      throw new Error("Existing Stripe refund mappings could not be checked safely.");
    }

    const activeRefund = refundMappings?.find(
      (mapping) => !["failed", "canceled"].includes(mapping.status),
    );
    if (activeRefund) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "This Stripe payment already has an active or reconciled refund.",
        },
        { status: 409 },
      );
    }

    if (payment.status !== "posted") {
      return NextResponse.json(
        { ok: false, message: "Only a posted Stripe payment can be refunded." },
        { status: 409 },
      );
    }

    const { data: paymentMapping } = await serviceClient
      .from("stripe_object_mappings")
      .select("*")
      .eq("company_id", companyId)
      .eq("stripe_company_account_id", context.account.id)
      .eq("integration_connection_id", context.connection.id)
      .eq("payment_id", payment.id)
      .eq("stripe_object_type", "payment_intent")
      .maybeSingle();

    if (!paymentMapping) {
      return NextResponse.json(
        { ok: false, message: "The payment has no company-scoped Stripe PaymentIntent mapping." },
        { status: 409 },
      );
    }

    const paymentMappingMatches =
      paymentMapping.company_id === companyId &&
      paymentMapping.stripe_company_account_id === context.account.id &&
      paymentMapping.integration_connection_id === context.connection.id &&
      paymentMapping.customer_id === payment.customer_id &&
      paymentMapping.invoice_id === payment.invoice_id &&
      paymentMapping.payment_id === payment.id &&
      (paymentMapping.local_object_type === "invoice" ||
        paymentMapping.local_object_type === "deposit") &&
      paymentMapping.stripe_object_type === "payment_intent" &&
      paymentMapping.stripe_object_id === payment.reference &&
      paymentMapping.status === "succeeded" &&
      Number(paymentMapping.amount_cents) === amountCents &&
      paymentMapping.currency === context.account.default_currency &&
      paymentMapping.livemode === context.account.livemode;

    if (!paymentMappingMatches) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "The Stripe PaymentIntent mapping did not pass its company and accounting checks.",
        },
        { status: 409 },
      );
    }

    const refund = await stripe.refunds.create(
      {
        payment_intent: paymentMapping.stripe_object_id,
        amount: amountCents,
        reason,
        metadata: {
          wtos_company_id: companyId,
          wtos_invoice_id: payment.invoice_id,
          wtos_payment_id: payment.id,
          wtos_operation_key: operationKey,
          wtos_source_of_truth: "supabase",
        },
      },
      { idempotencyKey: operationKey },
    );

    const { error: mappingError } = await serviceClient
      .from("stripe_object_mappings")
      .insert({
        company_id: companyId,
        stripe_company_account_id: context.account.id,
        integration_connection_id: context.connection.id,
        customer_id: payment.customer_id,
        invoice_id: payment.invoice_id,
        payment_id: payment.id,
        local_object_type: "refund",
        stripe_object_type: "refund",
        stripe_object_id: refund.id,
        operation_key: operationKey,
        status: refund.status ?? "pending",
        amount_cents: refund.amount,
        currency: refund.currency,
        livemode: context.account.livemode,
        metadata_summary: {
          wtos_company_id: companyId,
          wtos_invoice_id: payment.invoice_id,
          wtos_payment_id: payment.id,
          wtos_operation_key: operationKey,
        },
        last_provider_request_id: refund.lastResponse?.requestId ?? null,
      });

    if (mappingError) {
      throw new Error(
        "Stripe created the idempotent refund, but WeatherTech OS could not save its mapping.",
      );
    }

    return NextResponse.json({
      ok: true,
      duplicatePrevented: false,
      refundId: refund.id,
      status: refund.status,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: sanitizeStripeErrorMessage(error) },
      { status: 500 },
    );
  }
}
