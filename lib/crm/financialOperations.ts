import type {
  ChangeOrderRecord,
  CrmSnapshot,
  EstimateRecord,
  InvoiceInput,
  InvoiceLineItemInput,
  InvoiceLineItemRecord,
  InvoiceRecord,
  JobRecord,
  PaymentRecord,
} from "./types";

export type FinancialInvoiceWorkflowStatus =
  | "draft"
  | "ready_to_send"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void"
  | "disputed";

export type FinancialPaymentWorkflowStatus =
  | "pending"
  | "completed"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "voided";

export type PaymentScheduleType =
  | "fixed_deposit"
  | "percentage_deposit"
  | "progress_payment"
  | "final_payment"
  | "custom";

export type FinancialSyncState =
  | "not_connected"
  | "ready_to_queue"
  | "queued"
  | "synced"
  | "error";

export type FinancialInvoiceSummary = {
  invoice: InvoiceRecord;
  workflowStatus: FinancialInvoiceWorkflowStatus;
  lineItems: InvoiceLineItemRecord[];
  payments: PaymentRecord[];
  paymentTotal: number;
  remainingBalance: number;
  depositRequired: number;
  depositReceived: number;
  progressBillingType: PaymentScheduleType;
  syncState: FinancialSyncState;
  documentCount: number;
};

export type FinancialAttentionItem = {
  id: string;
  title: string;
  detail: string;
  companyId: string;
  amount: number;
  priority: "critical" | "high" | "medium" | "low";
  source: "invoice" | "estimate" | "job" | "change_order" | "payment" | "quickbooks";
  sourceId: string;
  suggestedAction: string;
};

export type FinancialOperationsSummary = {
  invoiceSummaries: FinancialInvoiceSummary[];
  draftInvoices: FinancialInvoiceSummary[];
  readyToSendInvoices: FinancialInvoiceSummary[];
  sentInvoices: FinancialInvoiceSummary[];
  partiallyPaidInvoices: FinancialInvoiceSummary[];
  paidInvoices: FinancialInvoiceSummary[];
  overdueInvoices: FinancialInvoiceSummary[];
  depositsRequired: number;
  depositsReceived: number;
  outstandingBalance: number;
  unappliedPayments: PaymentRecord[];
  changeOrdersAwaitingBilling: ChangeOrderRecord[];
  jobsCompletedNotInvoiced: JobRecord[];
  approvedEstimatesAwaitingInvoice: EstimateRecord[];
  syncIssues: FinancialAttentionItem[];
  recentPayments: PaymentRecord[];
  revenueByCompany: Array<{ companyId: string; total: number }>;
  attentionItems: FinancialAttentionItem[];
  quickBooksState: FinancialSyncState;
};

export const financialInvoiceWorkflowStatuses: Array<{
  value: FinancialInvoiceWorkflowStatus;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "ready_to_send", label: "Ready to Send" },
  { value: "sent", label: "Sent" },
  { value: "viewed", label: "Viewed" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
  { value: "disputed", label: "Disputed" },
];

export const financialPaymentWorkflowLabels: Record<
  FinancialPaymentWorkflowStatus,
  string
> = {
  pending: "Pending",
  completed: "Completed",
  failed: "Failed",
  refunded: "Refunded",
  partially_refunded: "Partially Refunded",
  voided: "Voided",
};

export const paymentScheduleTypeLabels: Record<PaymentScheduleType, string> = {
  fixed_deposit: "Fixed deposit",
  percentage_deposit: "Percentage deposit",
  progress_payment: "Progress payment",
  final_payment: "Final payment",
  custom: "Custom schedule",
};

export const financialSyncStateLabels: Record<FinancialSyncState, string> = {
  not_connected: "Not connected",
  ready_to_queue: "Ready to queue",
  queued: "Queued",
  synced: "Synced",
  error: "Error",
};

export function financialInvoiceWorkflowStatusLabel(
  status: FinancialInvoiceWorkflowStatus,
) {
  return (
    financialInvoiceWorkflowStatuses.find((item) => item.value === status)?.label ??
    status
  );
}

export function getFinancialInvoiceWorkflowStatus(
  invoice: InvoiceRecord,
  now: Date = new Date(),
): FinancialInvoiceWorkflowStatus {
  if (invoice.status === "void") {
    return "void";
  }

  if (invoice.status === "paid" || invoice.balance_due <= 0) {
    return "paid";
  }

  const today = toDateOnly(now);

  if (
    invoice.status === "overdue" ||
    (invoice.due_date !== null && invoice.due_date < today && invoice.balance_due > 0)
  ) {
    return "overdue";
  }

  if (invoice.amount_paid > 0 && invoice.balance_due > 0) {
    return "partially_paid";
  }

  if (invoice.status === "sent") {
    return "sent";
  }

  if (invoice.customer_id && invoice.total > 0) {
    return "ready_to_send";
  }

  return "draft";
}

export function getFinancialPaymentWorkflowStatus(
  payment: PaymentRecord,
): FinancialPaymentWorkflowStatus {
  if (payment.status === "posted") {
    return "completed";
  }

  return payment.status;
}

export function getFinancialInvoiceWorkflowTone(
  status: FinancialInvoiceWorkflowStatus,
): "blue" | "green" | "amber" {
  if (status === "paid") {
    return "green";
  }

  if (status === "overdue" || status === "disputed" || status === "partially_paid") {
    return "amber";
  }

  return "blue";
}

export function getFinancialSyncState(snapshot: CrmSnapshot): FinancialSyncState {
  const quickBooksConnection = snapshot.integrationConnections.find((connection) =>
    connection.provider.toLowerCase().includes("quickbooks"),
  );

  if (!quickBooksConnection) {
    return "not_connected";
  }

  return quickBooksConnection.status === "connected" ? "ready_to_queue" : "error";
}

export function buildFinancialOperationsSummary(
  snapshot: CrmSnapshot,
  options: { companyId?: string; now?: Date } = {},
): FinancialOperationsSummary {
  const companyId = options.companyId === "all" ? undefined : options.companyId;
  const now = options.now ?? new Date();
  const today = toDateOnly(now);
  const invoices = snapshot.invoices.filter((invoice) =>
    companyId ? invoice.company_id === companyId : true,
  );
  const payments = snapshot.payments.filter((payment) =>
    companyId ? payment.company_id === companyId : true,
  );
  const invoiceSummaries = invoices.map((invoice) => {
    const lineItems = snapshot.invoiceLineItems.filter(
      (item) => item.invoice_id === invoice.id,
    );
    const invoicePayments = payments.filter(
      (payment) => payment.invoice_id === invoice.id,
    );
    const paymentTotal = roundCurrency(
      invoicePayments
        .filter((payment) => getFinancialPaymentWorkflowStatus(payment) === "completed")
        .reduce((total, payment) => total + payment.amount, 0),
    );
    const workflowStatus = getFinancialInvoiceWorkflowStatus(invoice, now);
    const depositRequired = getDepositRequired(invoice, lineItems);

    return {
      invoice,
      workflowStatus,
      lineItems,
      payments: invoicePayments,
      paymentTotal,
      remainingBalance: Math.max(invoice.balance_due, 0),
      depositRequired,
      depositReceived: Math.min(paymentTotal, depositRequired),
      progressBillingType: getPaymentScheduleType(invoice, lineItems),
      syncState: getFinancialSyncState(snapshot),
      documentCount: snapshot.documents.filter((document) => document.invoice_id === invoice.id)
        .length,
    };
  });

  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const changeOrdersAwaitingBilling = snapshot.changeOrders.filter((changeOrder) => {
    if (companyId && changeOrder.company_id !== companyId) {
      return false;
    }

    if (changeOrder.status !== "approved") {
      return false;
    }

    return !invoices.some(
      (invoice) =>
        invoice.job_id === changeOrder.job_id &&
        invoice.estimate_id === changeOrder.estimate_id &&
        invoice.title.toLowerCase().includes(changeOrder.title.toLowerCase()),
    );
  });
  const jobsCompletedNotInvoiced = snapshot.jobs.filter((job) => {
    if (companyId && job.company_id !== companyId) {
      return false;
    }

    return (
      (job.status === "completed" || job.status === "closed") &&
      !invoices.some((invoice) => invoice.job_id === job.id)
    );
  });
  const approvedEstimatesAwaitingInvoice = snapshot.estimates.filter((estimate) => {
    if (companyId && estimate.company_id !== companyId) {
      return false;
    }

    return (
      estimate.status === "approved" &&
      !invoices.some((invoice) => invoice.estimate_id === estimate.id)
    );
  });
  const unappliedPayments = payments.filter((payment) => !payment.invoice_id);
  const recentPayments = [...payments]
    .sort((a, b) => (b.paid_at ?? b.created_at).localeCompare(a.paid_at ?? a.created_at))
    .slice(0, 6);
  const revenueByCompany = snapshot.companies.map((company) => ({
    companyId: company.id,
    total: payments
      .filter(
        (payment) =>
          payment.company_id === company.id &&
          getFinancialPaymentWorkflowStatus(payment) === "completed",
      )
      .reduce((total, payment) => total + payment.amount, 0),
  }));
  const quickBooksState = getFinancialSyncState(snapshot);
  const syncIssues: FinancialAttentionItem[] =
    quickBooksState === "error"
      ? [
          {
            id: "quickbooks-sync-error",
            title: "QuickBooks sync needs attention",
            detail: "The accounting provider connection is not healthy.",
            companyId: companyId ?? snapshot.companies[0]?.id ?? "",
            amount: 0,
            priority: "high",
            source: "quickbooks",
            sourceId: "quickbooks",
            suggestedAction: "Open Integration Center and review QuickBooks readiness.",
          },
        ]
      : [];

  const overdueInvoices = invoiceSummaries.filter(
    (summary) => summary.workflowStatus === "overdue",
  );
  const partiallyPaidInvoices = invoiceSummaries.filter(
    (summary) => summary.workflowStatus === "partially_paid",
  );

  const attentionItems = sortFinancialAttentionItems([
    ...overdueInvoices.map((summary) => ({
      id: `invoice-overdue-${summary.invoice.id}`,
      title: "Invoice overdue",
      detail: `${summary.invoice.invoice_number} is past due.`,
      companyId: summary.invoice.company_id,
      amount: summary.remainingBalance,
      priority: "critical" as const,
      source: "invoice" as const,
      sourceId: summary.invoice.id,
      suggestedAction: "Follow up with the customer or record payment.",
    })),
    ...partiallyPaidInvoices.map((summary) => ({
      id: `invoice-partial-${summary.invoice.id}`,
      title: "Balance still open",
      detail: `${summary.invoice.invoice_number} has a remaining balance.`,
      companyId: summary.invoice.company_id,
      amount: summary.remainingBalance,
      priority: "high" as const,
      source: "invoice" as const,
      sourceId: summary.invoice.id,
      suggestedAction: "Confirm the next progress or final payment date.",
    })),
    ...approvedEstimatesAwaitingInvoice.map((estimate) => ({
      id: `estimate-awaiting-invoice-${estimate.id}`,
      title: "Approved estimate not invoiced",
      detail: estimate.title,
      companyId: estimate.company_id,
      amount: estimate.total,
      priority: "high" as const,
      source: "estimate" as const,
      sourceId: estimate.id,
      suggestedAction: "Create deposit, progress, or final invoice.",
    })),
    ...jobsCompletedNotInvoiced.map((job) => ({
      id: `job-complete-not-invoiced-${job.id}`,
      title: "Completed job not invoiced",
      detail: job.title,
      companyId: job.company_id,
      amount: job.total,
      priority: "high" as const,
      source: "job" as const,
      sourceId: job.id,
      suggestedAction: "Create the final customer invoice.",
    })),
    ...changeOrdersAwaitingBilling.map((changeOrder) => ({
      id: `change-order-awaiting-billing-${changeOrder.id}`,
      title: "Change order awaiting billing",
      detail: changeOrder.title,
      companyId: changeOrder.company_id,
      amount: changeOrder.total,
      priority: "medium" as const,
      source: "change_order" as const,
      sourceId: changeOrder.id,
      suggestedAction: "Add approved change order to the next invoice.",
    })),
    ...unappliedPayments.map((payment) => ({
      id: `unapplied-payment-${payment.id}`,
      title: "Unapplied payment",
      detail: payment.reference ?? payment.method,
      companyId: payment.company_id,
      amount: payment.amount,
      priority: "medium" as const,
      source: "payment" as const,
      sourceId: payment.id,
      suggestedAction: "Apply this payment to the correct invoice.",
    })),
    ...syncIssues,
  ]);

  return {
    invoiceSummaries,
    draftInvoices: invoiceSummaries.filter((summary) => summary.workflowStatus === "draft"),
    readyToSendInvoices: invoiceSummaries.filter(
      (summary) => summary.workflowStatus === "ready_to_send",
    ),
    sentInvoices: invoiceSummaries.filter((summary) => summary.workflowStatus === "sent"),
    partiallyPaidInvoices,
    paidInvoices: invoiceSummaries.filter((summary) => summary.workflowStatus === "paid"),
    overdueInvoices,
    depositsRequired: invoiceSummaries.reduce(
      (total, summary) => total + summary.depositRequired,
      0,
    ),
    depositsReceived: invoiceSummaries.reduce(
      (total, summary) => total + summary.depositReceived,
      0,
    ),
    outstandingBalance: invoiceSummaries.reduce(
      (total, summary) => total + summary.remainingBalance,
      0,
    ),
    unappliedPayments,
    changeOrdersAwaitingBilling,
    jobsCompletedNotInvoiced,
    approvedEstimatesAwaitingInvoice,
    syncIssues,
    recentPayments,
    revenueByCompany,
    attentionItems,
    quickBooksState,
  };
}

export function buildInvoiceDraftFromEstimate(
  snapshot: CrmSnapshot,
  estimate: EstimateRecord,
): { input: Partial<InvoiceInput>; lineItems: InvoiceLineItemInput[]; label: string } {
  const estimateItems = snapshot.estimateLineItems.filter(
    (item) => item.estimate_id === estimate.id,
  );
  const lineItems = estimateItems.length
    ? estimateItems.map((item, index) => ({
        description: item.description
          ? `${item.name} - ${item.description}`
          : item.name,
        quantity: item.quantity,
        unit_cost: item.unit_price,
        taxable: item.taxable,
        sort_order: index,
      }))
    : [
        {
          description: `Approved estimate: ${estimate.title}`,
          quantity: 1,
          unit_cost: estimate.total,
          taxable: false,
          sort_order: 0,
        },
      ];

  return {
    input: {
      company_id: estimate.company_id,
      customer_id: estimate.customer_id,
      estimate_id: estimate.id,
      property_id: estimate.property_id ?? null,
      invoice_number: buildNextInvoiceNumber(snapshot),
      title: `Invoice for ${estimate.title}`,
      status: "draft",
      issue_date: toDateOnly(new Date()),
      due_date: addDays(toDateOnly(new Date()), 7),
      tax_rate: estimate.tax_rate,
      discount_total: 0,
      amount_paid: 0,
      notes: "Created from approved estimate. Verify deposits, progress billing, and final balance before sending.",
    },
    lineItems,
    label: `Approved estimate: ${estimate.title}`,
  };
}

export function buildInvoiceDraftFromJob(
  snapshot: CrmSnapshot,
  job: JobRecord,
): { input: Partial<InvoiceInput>; lineItems: InvoiceLineItemInput[]; label: string } {
  const estimate = job.estimate_id
    ? snapshot.estimates.find((item) => item.id === job.estimate_id) ?? null
    : null;

  return {
    input: {
      company_id: job.company_id,
      customer_id: job.customer_id,
      job_id: job.id,
      estimate_id: job.estimate_id,
      property_id: job.property_id ?? null,
      invoice_number: buildNextInvoiceNumber(snapshot),
      title: `Final invoice for ${job.title}`,
      status: "draft",
      issue_date: toDateOnly(new Date()),
      due_date: addDays(toDateOnly(new Date()), 7),
      tax_rate: estimate?.tax_rate ?? 0,
      discount_total: 0,
      amount_paid: 0,
      notes: "Created from job completion context. Confirm change orders and required documents before sending.",
    },
    lineItems: [
      {
        description: job.scope_of_work || job.title,
        quantity: 1,
        unit_cost: job.total || estimate?.total || 0,
        taxable: true,
        sort_order: 0,
      },
    ],
    label: `Job: ${job.title}`,
  };
}

export function buildInvoiceDraftFromChangeOrder(
  snapshot: CrmSnapshot,
  changeOrder: ChangeOrderRecord,
): { input: Partial<InvoiceInput>; lineItems: InvoiceLineItemInput[]; label: string } {
  return {
    input: {
      company_id: changeOrder.company_id,
      customer_id: changeOrder.customer_id,
      job_id: changeOrder.job_id,
      estimate_id: changeOrder.estimate_id,
      property_id: changeOrder.property_id ?? null,
      invoice_number: buildNextInvoiceNumber(snapshot),
      title: `Change order billing: ${changeOrder.title}`,
      status: "draft",
      issue_date: toDateOnly(new Date()),
      due_date: addDays(toDateOnly(new Date()), 7),
      tax_rate: changeOrder.tax_rate,
      discount_total: 0,
      amount_paid: 0,
      notes:
        "Created from approved change order. Confirm this is not already included on another invoice.",
    },
    lineItems: [
      {
        description: `Change order: ${changeOrder.title}`,
        quantity: 1,
        unit_cost: changeOrder.amount,
        taxable: changeOrder.tax_rate > 0,
        sort_order: 0,
      },
    ],
    label: `Change order: ${changeOrder.title}`,
  };
}

function getDepositRequired(
  invoice: InvoiceRecord,
  lineItems: InvoiceLineItemRecord[],
) {
  const text = [invoice.title, invoice.notes ?? "", ...lineItems.map((item) => item.description)]
    .join(" ")
    .toLowerCase();

  return text.includes("deposit") ? invoice.total : 0;
}

function getPaymentScheduleType(
  invoice: InvoiceRecord,
  lineItems: InvoiceLineItemRecord[],
): PaymentScheduleType {
  const text = [invoice.title, invoice.notes ?? "", ...lineItems.map((item) => item.description)]
    .join(" ")
    .toLowerCase();

  if (text.includes("deposit") && text.includes("%")) {
    return "percentage_deposit";
  }

  if (text.includes("deposit")) {
    return "fixed_deposit";
  }

  if (text.includes("progress") || text.includes("milestone")) {
    return "progress_payment";
  }

  if (text.includes("final")) {
    return "final_payment";
  }

  return "custom";
}

function buildNextInvoiceNumber(snapshot: CrmSnapshot) {
  const maxNumber = snapshot.invoices.reduce((max, invoice) => {
    const match = invoice.invoice_number.match(/(\d+)$/);

    return match ? Math.max(max, Number(match[1])) : max;
  }, 1000);

  return `INV-${maxNumber + 1}`;
}

function sortFinancialAttentionItems(items: FinancialAttentionItem[]) {
  const priorityRank: Record<FinancialAttentionItem["priority"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return [...items].sort((a, b) => {
    const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    return b.amount - a.amount;
  });
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);

  return toDateOnly(date);
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
