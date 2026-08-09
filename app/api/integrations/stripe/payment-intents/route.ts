import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  buildStripeObjectMetadata,
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PaymentIntentRequest = {
  companyId?: unknown;
  invoiceId?: unknown;
  amountCents?: unknown;
  kind?: unknown;
  attemptKey?: unknown;
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
      { ok: false, message: "Sign in before creating a payment request." },
      { status: 401 },
    );
  }

  let body: PaymentIntentRequest;
  try {
    body = (await request.json()) as PaymentIntentRequest;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Payment request JSON is invalid." },
      { status: 400 },
    );
  }

  const companyId = requestString(body.companyId);
  const invoiceId = requestString(body.invoiceId);
  const attemptKey = requestString(body.attemptKey);
  const kind = body.kind === "deposit" ? "deposit" : "payment_intent";
  const amountCents =
    typeof body.amountCents === "number" && Number.isSafeInteger(body.amountCents)
      ? body.amountCents
      : null;

  if (
    !companyId ||
    !invoiceId ||
    !attemptKey ||
    amountCents === null ||
    amountCents < 50
  ) {
    return NextResponse.json(
      { ok: false, message: "Company, invoice, amount, and attempt key are required." },
      { status: 400 },
    );
  }

  if (body.ownerApproval !== true) {
    return NextResponse.json(
      { ok: false, message: "Explicit owner approval is required for every Stripe object write." },
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
      { ok: false, message: "A company owner must approve Stripe payment requests." },
      { status: 403 },
    );
  }

  if (!config.livePaymentsEnabled || !stripe || !config.weatherTechAccountId) {
    return NextResponse.json(
      { ok: false, message: "Live Stripe payment writes remain disabled." },
      { status: 409 },
    );
  }

  try {
    const context = await getStripeCompanyAccountContext(serviceClient, companyId);

    if (!context.account.payment_writes_enabled) {
      return NextResponse.json(
        { ok: false, message: "Stripe payment writes are disabled for this company mapping." },
        { status: 409 },
      );
    }

    if (context.account.stripe_account_id !== config.weatherTechAccountId) {
      return NextResponse.json(
        { ok: false, message: "Stripe configuration does not match the WeatherTech account mapping." },
        { status: 409 },
      );
    }

    const accountProbe = await probeStripeAccount(stripe, config.weatherTechAccountId);
    if (!accountProbe.ok || !accountProbe.chargesEnabled) {
      return NextResponse.json(
        { ok: false, message: "The mapped Stripe account did not pass the write-safety probe." },
        { status: 409 },
      );
    }

    const { data: invoice, error: invoiceError } = await serviceClient
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { ok: false, message: "The invoice does not belong to the authorized company." },
        { status: 404 },
      );
    }

    if (invoice.status === "void" || Number(invoice.balance_due) <= 0) {
      return NextResponse.json(
        { ok: false, message: "The invoice does not have a collectible balance." },
        { status: 409 },
      );
    }

    if (invoice.customer_id) {
      const { data: invoiceCustomer } = await serviceClient
        .from("customers")
        .select("id")
        .eq("id", invoice.customer_id)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!invoiceCustomer) {
        return NextResponse.json(
          { ok: false, message: "The invoice customer does not belong to the authorized company." },
          { status: 409 },
        );
      }
    }

    const maximumAmountCents = Math.round(Number(invoice.balance_due) * 100);
    if (amountCents > maximumAmountCents) {
      return NextResponse.json(
        { ok: false, message: "Payment amount exceeds the invoice balance." },
        { status: 409 },
      );
    }

    const operationKey = createStripeOperationKey({
      operation: kind,
      companyId,
      invoiceId,
      amountCents,
      attemptKey,
    });
    const { data: existingMapping } = await serviceClient
      .from("stripe_object_mappings")
      .select("*")
      .eq("company_id", companyId)
      .eq("operation_key", operationKey)
      .maybeSingle();

    if (existingMapping) {
      return NextResponse.json({
        ok: true,
        duplicatePrevented: true,
        paymentIntentId: existingMapping.stripe_object_id,
        status: existingMapping.status,
      });
    }

    const metadata = buildStripeObjectMetadata({
      companyId,
      customerId: invoice.customer_id,
      invoiceId,
      operationKey,
    });
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency: context.account.default_currency,
        automatic_payment_methods: { enabled: true },
        description: `WeatherTech OS invoice ${invoice.invoice_number}`,
        metadata,
      },
      { idempotencyKey: operationKey },
    );

    const { error: mappingError } = await serviceClient
      .from("stripe_object_mappings")
      .insert({
        company_id: companyId,
        stripe_company_account_id: context.account.id,
        integration_connection_id: context.connection.id,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        payment_id: null,
        local_object_type: kind === "deposit" ? "deposit" : "invoice",
        stripe_object_type: "payment_intent",
        stripe_object_id: paymentIntent.id,
        operation_key: operationKey,
        status: paymentIntent.status,
        amount_cents: amountCents,
        currency: paymentIntent.currency,
        livemode: paymentIntent.livemode,
        metadata_summary: metadata,
        last_provider_request_id: paymentIntent.lastResponse?.requestId ?? null,
      });

    if (mappingError) {
      throw new Error(
        "Stripe created the idempotent PaymentIntent, but WeatherTech OS could not save its mapping.",
      );
    }

    await serviceClient.from("integration_sync_logs").insert({
      company_id: companyId,
      integration_connection_id: context.connection.id,
      provider: "stripe",
      direction: "weathertech_to_provider",
      event_type: "stripe.payment_intent.created",
      status: "succeeded",
      related_table: "invoices",
      related_record_id: invoice.id,
      request_summary: { operationKey, amountCents, kind },
      response_summary: {
        stripeObjectType: "payment_intent",
        status: paymentIntent.status,
      },
      completed_at: new Date().toISOString(),
      last_attempted_at: new Date().toISOString(),
    });

    return NextResponse.json({
      ok: true,
      duplicatePrevented: false,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: sanitizeStripeErrorMessage(error) },
      { status: 500 },
    );
  }
}
