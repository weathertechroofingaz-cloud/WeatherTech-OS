import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const migration = fs.readFileSync(
  path.join(
    cwd,
    "supabase/migrations/20260810225320_stripe_refund_reconciliation.sql",
  ),
  "utf8",
);
const webhookRoute = fs.readFileSync(
  path.join(cwd, "app/api/integrations/stripe/webhook/route.ts"),
  "utf8",
);
const refundRoute = fs.readFileSync(
  path.join(cwd, "app/api/integrations/stripe/refunds/route.ts"),
  "utf8",
);

function refundContractModel(input) {
  const state = structuredClone(input);
  const {
    company,
    gates,
    mapping,
    paymentMapping,
    payment,
    invoice,
    event,
  } = state;

  if (company.name !== "WeatherTech Roofing LLC" || company.trade !== "roofing") {
    throw new Error("company isolation");
  }
  if (!gates.payment || !gates.refund || !gates.webhook) {
    throw new Error("gates disabled");
  }
  if (
    mapping.companyId !== company.id ||
    paymentMapping.companyId !== company.id ||
    payment.companyId !== company.id ||
    invoice.companyId !== company.id ||
    event.companyId !== company.id
  ) {
    throw new Error("company isolation");
  }
  if (
    mapping.accountId !== paymentMapping.accountId ||
    mapping.connectionId !== paymentMapping.connectionId ||
    mapping.invoiceId !== invoice.id ||
    mapping.paymentId !== payment.id ||
    payment.invoiceId !== invoice.id ||
    event.objectId !== mapping.objectId ||
    event.amountCents !== mapping.amountCents ||
    event.currency !== mapping.currency ||
    event.livemode !== mapping.livemode
  ) {
    throw new Error("mapped object mismatch");
  }

  const paymentAmountCents = Math.round(payment.amount * 100);
  if (
    mapping.amountCents !== paymentAmountCents ||
    paymentMapping.amountCents !== paymentAmountCents
  ) {
    throw new Error("full refund required");
  }

  const allowedStatuses = new Set([
    "pending",
    "requires_action",
    "succeeded",
    "failed",
    "canceled",
  ]);
  if (
    typeof event.providerStatus !== "string" ||
    !allowedStatuses.has(event.providerStatus)
  ) {
    throw new Error("unsupported provider status");
  }
  if (event.type === "refund.failed" && event.providerStatus !== "failed") {
    throw new Error("event status mismatch");
  }
  if (
    event.providerStatus === "succeeded" &&
    !["refund.created", "refund.updated"].includes(event.type)
  ) {
    throw new Error("event status mismatch");
  }

  if (mapping.applied) {
    if (["failed", "canceled"].includes(event.providerStatus)) {
      throw new Error("conflicting terminal provider state");
    }
    if (
      mapping.appliedAmountCents !== mapping.amountCents ||
      payment.status !== "refunded" ||
      paymentMapping.status !== "refunded"
    ) {
      throw new Error("conflicting local accounting state");
    }
    mapping.status = "refunded";
    event.processingStatus = "processed";
    return { state, applied: false };
  }

  if (state.priorAppliedRefund) {
    throw new Error("prior refund already reconciled");
  }

  if (event.providerStatus !== "succeeded") {
    mapping.status = event.providerStatus;
    event.processingStatus = "processed";
    return { state, applied: false };
  }

  if (payment.status !== "posted" || invoice.amountPaid < payment.amount) {
    throw new Error("invalid accounting state");
  }

  payment.status = "refunded";
  paymentMapping.status = "refunded";
  mapping.status = "refunded";
  mapping.applied = true;
  mapping.appliedAmountCents = mapping.amountCents;
  invoice.amountPaid = Number((invoice.amountPaid - payment.amount).toFixed(2));
  invoice.balanceDue = Number((invoice.total - invoice.amountPaid).toFixed(2));
  if (invoice.status === "paid" && invoice.balanceDue > 0) {
    invoice.status = invoice.overdue ? "overdue" : "sent";
  }
  event.processingStatus = "processed";

  return { state, applied: true };
}

function baseState() {
  return {
    company: { id: "weathertech", name: "WeatherTech Roofing LLC", trade: "roofing" },
    mapping: {
      companyId: "weathertech",
      accountId: "weathertech-stripe",
      connectionId: "weathertech-connection",
      invoiceId: "invoice-1",
      paymentId: "payment-1",
      objectId: "refund-1",
      amountCents: 50,
      currency: "usd",
      livemode: true,
      status: "succeeded",
      applied: false,
      appliedAmountCents: null,
    },
    paymentMapping: {
      companyId: "weathertech",
      accountId: "weathertech-stripe",
      connectionId: "weathertech-connection",
      amountCents: 50,
      status: "succeeded",
    },
    payment: {
      id: "payment-1",
      companyId: "weathertech",
      invoiceId: "invoice-1",
      amount: 0.5,
      status: "posted",
    },
    invoice: {
      id: "invoice-1",
      companyId: "weathertech",
      total: 100,
      amountPaid: 25.5,
      balanceDue: 74.5,
      status: "sent",
      overdue: false,
    },
    event: {
      type: "refund.updated",
      companyId: "weathertech",
      objectId: "refund-1",
      amountCents: 50,
      currency: "usd",
      livemode: true,
      providerStatus: "succeeded",
      processingStatus: "received",
    },
    gates: { payment: true, refund: true, webhook: true },
    priorAppliedRefund: false,
  };
}

const success = refundContractModel(baseState());
assert.equal(success.applied, true);
assert.equal(success.state.payment.status, "refunded");
assert.equal(success.state.paymentMapping.status, "refunded");
assert.equal(success.state.mapping.status, "refunded");
assert.equal(success.state.mapping.applied, true);
assert.equal(success.state.invoice.amountPaid, 25);
assert.equal(success.state.invoice.balanceDue, 75);
assert.equal(success.state.invoice.status, "sent");
assert.equal(success.state.event.processingStatus, "processed");

const duplicateSnapshot = structuredClone(success.state);
duplicateSnapshot.event.processingStatus = "received";
const duplicate = refundContractModel(duplicateSnapshot);
assert.equal(duplicate.applied, false);
assert.deepEqual(
  {
    payment: duplicate.state.payment,
    paymentMapping: duplicate.state.paymentMapping,
    mapping: duplicate.state.mapping,
    invoice: duplicate.state.invoice,
  },
  {
    payment: success.state.payment,
    paymentMapping: success.state.paymentMapping,
    mapping: success.state.mapping,
    invoice: success.state.invoice,
  },
  "A second webhook for the same refund must not change accounting totals",
);

const reopenedInvoice = baseState();
reopenedInvoice.invoice.total = 0.5;
reopenedInvoice.invoice.amountPaid = 0.5;
reopenedInvoice.invoice.balanceDue = 0;
reopenedInvoice.invoice.status = "paid";
const reopened = refundContractModel(reopenedInvoice);
assert.equal(reopened.state.invoice.amountPaid, 0);
assert.equal(reopened.state.invoice.balanceDue, 0.5);
assert.equal(reopened.state.invoice.status, "sent");

const overdueInvoice = baseState();
overdueInvoice.invoice.total = 0.5;
overdueInvoice.invoice.amountPaid = 0.5;
overdueInvoice.invoice.balanceDue = 0;
overdueInvoice.invoice.status = "paid";
overdueInvoice.invoice.overdue = true;
assert.equal(refundContractModel(overdueInvoice).state.invoice.status, "overdue");

const pending = baseState();
pending.event.providerStatus = "pending";
const pendingResult = refundContractModel(pending);
assert.equal(pendingResult.applied, false);
assert.equal(pendingResult.state.payment.status, "posted");
assert.equal(pendingResult.state.invoice.amountPaid, 25.5);
assert.equal(pendingResult.state.mapping.status, "pending");

const nullStatus = baseState();
nullStatus.event.providerStatus = null;
const nullStatusBefore = structuredClone(nullStatus);
assert.throws(
  () => refundContractModel(nullStatus),
  /unsupported provider status/,
);
assert.deepEqual(
  nullStatus,
  nullStatusBefore,
  "A missing provider status cannot mutate payment or invoice accounting",
);

const mismatchedFailedEvent = baseState();
mismatchedFailedEvent.event.type = "refund.failed";
assert.throws(
  () => refundContractModel(mismatchedFailedEvent),
  /event status mismatch/,
);

const properlyFailedEvent = baseState();
properlyFailedEvent.event.type = "refund.failed";
properlyFailedEvent.event.providerStatus = "failed";
const failedResult = refundContractModel(properlyFailedEvent);
assert.equal(failedResult.applied, false);
assert.equal(failedResult.state.payment.status, "posted");
assert.equal(failedResult.state.invoice.amountPaid, 25.5);
assert.equal(failedResult.state.mapping.status, "failed");

const stalePendingAfterSuccess = structuredClone(success.state);
stalePendingAfterSuccess.mapping.status = "pending";
stalePendingAfterSuccess.event.type = "refund.created";
stalePendingAfterSuccess.event.providerStatus = "pending";
stalePendingAfterSuccess.event.processingStatus = "received";
const stalePendingResult = refundContractModel(stalePendingAfterSuccess);
assert.equal(stalePendingResult.applied, false);
assert.equal(stalePendingResult.state.mapping.status, "refunded");
assert.equal(stalePendingResult.state.invoice.amountPaid, 25);
assert.equal(stalePendingResult.state.invoice.balanceDue, 75);

const markedStatusDrift = structuredClone(success.state);
markedStatusDrift.mapping.status = "pending";
markedStatusDrift.event.processingStatus = "received";
const markedStatusDriftResult = refundContractModel(markedStatusDrift);
assert.equal(markedStatusDriftResult.applied, false);
assert.equal(markedStatusDriftResult.state.mapping.status, "refunded");
assert.equal(markedStatusDriftResult.state.invoice.amountPaid, 25);

const terminalConflictAfterSuccess = structuredClone(success.state);
terminalConflictAfterSuccess.event.type = "refund.failed";
terminalConflictAfterSuccess.event.providerStatus = "failed";
assert.throws(
  () => refundContractModel(terminalConflictAfterSuccess),
  /conflicting terminal provider state/,
);

const priorRefund = baseState();
priorRefund.priorAppliedRefund = true;
assert.throws(
  () => refundContractModel(priorRefund),
  /prior refund already reconciled/,
);

const gatesDisabled = baseState();
gatesDisabled.gates.refund = false;
assert.throws(() => refundContractModel(gatesDisabled), /gates disabled/);

const partial = baseState();
partial.mapping.amountCents = 25;
partial.event.amountCents = 25;
assert.throws(() => refundContractModel(partial), /full refund required/);

const ihc = baseState();
ihc.company = { id: "ihc", name: "IHC Painting", trade: "painting" };
for (const record of [ihc.mapping, ihc.paymentMapping, ihc.payment, ihc.invoice, ihc.event]) {
  record.companyId = "ihc";
}
assert.throws(() => refundContractModel(ihc), /company isolation/);

const crossCompany = baseState();
crossCompany.payment.companyId = "ihc";
assert.throws(() => refundContractModel(crossCompany), /company isolation/);

for (const requiredSql of [
  "create or replace function public.wtos_reconcile_stripe_refund",
  "security invoker",
  "set search_path = ''",
  "for update",
  "WeatherTech Roofing LLC",
  "company.trade = 'roofing'",
  "account.payment_writes_enabled",
  "account.refund_writes_enabled",
  "account.webhook_processing_enabled",
  "provider_status is null",
  "webhook_event.event_type = 'refund.failed'",
  "Only refund.created or refund.updated can reconcile a successful refund",
  "WeatherTech OS supports only a full refund",
  "wtos_refund_reconciliation_applied",
  "wtos_refund_reconciliation_amount_cents",
  "conflicting terminal provider state",
  "Stripe does not guarantee event ordering",
  "status = 'refunded'",
  "updated_amount_paid := invoice_record.amount_paid - recorded_payment.amount",
  "updated_balance_due := greatest(invoice_record.total - updated_amount_paid, 0)",
  "processing_status = 'processed'",
  "revoke all on function public.wtos_reconcile_stripe_refund",
  "to service_role",
]) {
  assert(migration.includes(requiredSql), `Migration includes ${requiredSql}`);
}
assert.equal((migration.match(/for update;/g) ?? []).length >= 4, true);
assert.match(
  migration,
  /reconciliation_applied\s*:=\s*refund_mapping\.metadata_summary\s*->>\s*'wtos_refund_reconciliation_applied'\s*=\s*'true'/,
  "The durable metadata marker alone prevents duplicate accounting",
);
assert.equal(/security\s+definer/i.test(migration), false);
assert.equal(/using\s*\(\s*true\s*\)/i.test(migration), false);
assert.equal(/with\s+check\s*\(\s*true\s*\)/i.test(migration), false);
assert.equal(/sk_(?:live|test)_|whsec_/i.test(migration), false);

assert(webhookRoute.includes('const refundEventTypes = new Set(['));
assert(webhookRoute.includes('"wtos_reconcile_stripe_refund"'));
assert(webhookRoute.includes("target_refund_mapping_id: mapping.id"));
assert(webhookRoute.includes("target_webhook_event_id: storedEvent.id"));
assert(webhookRoute.includes("Stripe should retry this webhook"));
assert(webhookRoute.includes("isWeatherTechRefundMappingRace"));
assert(webhookRoute.includes('summary.wtosSourceOfTruth === "supabase"'));
assert(webhookRoute.includes('processing_status: "ignored"'));
assert(webhookRoute.includes("existingEvent?.attempt_count ?? 0"));
assert(webhookRoute.includes("summary.amount !== mapping.amount_cents"));
assert(webhookRoute.includes("summary.currency !== mapping.currency"));
assert(webhookRoute.includes("mapping.livemode !== event.livemode"));
const refundRpcIndex = webhookRoute.indexOf('"wtos_reconcile_stripe_refund"');
const chargeRefundedIndex = webhookRoute.indexOf(
  'if (event.type === "charge.refunded")',
);
const genericMappingStatusIndex = webhookRoute.indexOf("const mappingStatus =");
assert(
  refundRpcIndex >= 0 &&
    chargeRefundedIndex > refundRpcIndex &&
    genericMappingStatusIndex > chargeRefundedIndex,
  "Refund objects reconcile atomically while charge.refunded remains observational",
);
assert.equal(
  /event\.type\s*===\s*["']charge\.refunded["'][\s\S]{0,100}\?\s*["']refunded["']/.test(
    webhookRoute,
  ),
  false,
  "charge.refunded cannot mark a whole PaymentIntent mapping refunded",
);

const refundValidationIndex = refundRoute.indexOf(
  "amountCents !== paymentAmountCents",
);
const existingRefundIndex = refundRoute.indexOf("if (existingRefund)");
const activeRefundIndex = refundRoute.indexOf("const activeRefund =");
const postedPaymentIndex = refundRoute.indexOf('payment.status !== "posted"');
const paymentMappingCheckIndex = refundRoute.indexOf(
  "const paymentMappingMatches =",
);
const providerWriteIndex = refundRoute.indexOf("stripe.refunds.create");
assert(refundValidationIndex >= 0 && refundValidationIndex < providerWriteIndex);
assert(
  existingRefundIndex >= 0 &&
    existingRefundIndex < activeRefundIndex &&
    activeRefundIndex < postedPaymentIndex &&
    postedPaymentIndex < paymentMappingCheckIndex &&
    paymentMappingCheckIndex < providerWriteIndex,
  "An exact refund retry is recovered before a reconciled payment is rejected",
);
assert(refundRoute.includes("This Stripe payment already has an active or reconciled refund."));
assert(refundRoute.includes("The existing Stripe refund did not pass its company-isolation check."));
assert(refundRoute.includes("paymentMapping.stripe_company_account_id === context.account.id"));
assert(refundRoute.includes("paymentMapping.integration_connection_id === context.connection.id"));
assert(refundRoute.includes("paymentMapping.stripe_object_id === payment.reference"));
assert(refundRoute.includes('paymentMapping.status === "succeeded"'));
assert(refundRoute.includes("!config.webhookProcessingEnabled"));
assert(refundRoute.includes("!context.account.webhook_processing_enabled"));
assert(refundRoute.includes('payment.status !== "posted"'));
assert(refundRoute.includes('payment.method !== "stripe"'));
assert.equal((refundRoute.match(/stripe\.refunds\.create/g) ?? []).length, 1);
assert.equal(/sk_(?:live|test)_|whsec_/i.test(webhookRoute + refundRoute), false);

console.log("Stripe refund reconciliation tests passed.");
