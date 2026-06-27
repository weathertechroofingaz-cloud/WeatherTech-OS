import type {
  ChangeOrderRecord,
  CrmSnapshot,
  CustomerRecord,
  DocumentCategory,
  DocumentInput,
  EstimateRecord,
  InvoiceRecord,
  JobRecord,
  ScopeRecord,
} from "./types";

type DocumentSourceType =
  | "estimate"
  | "invoice"
  | "scope"
  | "change_order"
  | "job"
  | "customer";

export type DocumentSourceOption = {
  value: string;
  label: string;
  type: DocumentSourceType;
};

export type GeneratedDocumentDraft = DocumentInput & {
  sourceLabel: string;
  summary: string;
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return currencyFormatter.format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function companyName(snapshot: CrmSnapshot, companyId: string) {
  return (
    snapshot.companies.find((company) => company.id === companyId)?.name ??
    "WeatherTech OS"
  );
}

function customerById(snapshot: CrmSnapshot, customerId: string | null) {
  return customerId
    ? snapshot.customers.find((customer) => customer.id === customerId) ?? null
    : null;
}

function leadName(snapshot: CrmSnapshot, leadId: string | null) {
  return leadId
    ? snapshot.leads.find((lead) => lead.id === leadId)?.contact_name ?? null
    : null;
}

function customerLabel(snapshot: CrmSnapshot, customerId: string | null) {
  return customerById(snapshot, customerId)?.display_name ?? null;
}

function estimateLabel(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  return (
    customerLabel(snapshot, estimate.customer_id) ??
    leadName(snapshot, estimate.lead_id) ??
    "Unassigned"
  );
}

function scopeLabel(snapshot: CrmSnapshot, scope: ScopeRecord) {
  return (
    customerLabel(snapshot, scope.customer_id) ??
    leadName(snapshot, scope.lead_id) ??
    snapshot.estimates.find((estimate) => estimate.id === scope.estimate_id)?.title ??
    "Unassigned"
  );
}

function invoiceLabel(snapshot: CrmSnapshot, invoice: InvoiceRecord) {
  return (
    customerLabel(snapshot, invoice.customer_id) ??
    snapshot.jobs.find((job) => job.id === invoice.job_id)?.title ??
    snapshot.estimates.find((estimate) => estimate.id === invoice.estimate_id)?.title ??
    "Unassigned"
  );
}

function jobLabel(snapshot: CrmSnapshot, job: JobRecord) {
  return (
    customerLabel(snapshot, job.customer_id) ??
    leadName(snapshot, job.lead_id) ??
    "Unassigned"
  );
}

function customerAddress(customer: CustomerRecord | null) {
  if (!customer) {
    return "Not linked";
  }

  return [
    customer.property_address,
    customer.city,
    customer.state,
    customer.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function list(items: string[]) {
  const filtered = items.filter(Boolean);

  if (!filtered.length) {
    return "- None";
  }

  return filtered.map((item) => `- ${item}`).join("\n");
}

function keyValueRows(rows: Array<[string, string | number | null | undefined]>) {
  return rows
    .map(([label, value]) => `- ${label}: ${value === null || value === undefined || value === "" ? "Not set" : value}`)
    .join("\n");
}

function packet({
  title,
  company,
  sections,
}: {
  title: string;
  company: string;
  sections: Array<{ title: string; body: string }>;
}) {
  return [
    `# ${title}`,
    "",
    `Prepared by ${company}`,
    `Generated ${formatDateTime(new Date().toISOString())}`,
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      section.body,
      "",
    ]),
  ].join("\n");
}

function buildEstimateDraft(
  snapshot: CrmSnapshot,
  estimate: EstimateRecord,
): GeneratedDocumentDraft {
  const lineItems = snapshot.estimateLineItems
    .filter((item) => item.estimate_id === estimate.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const customer = customerById(snapshot, estimate.customer_id);
  const company = companyName(snapshot, estimate.company_id);

  return {
    company_id: estimate.company_id,
    customer_id: estimate.customer_id,
    job_id: null,
    estimate_id: estimate.id,
    invoice_id: null,
    change_order_id: null,
    title: `${estimate.title} - Estimate Packet`,
    category: "estimate",
    file_url: null,
    body: packet({
      title: `${estimate.title} Estimate`,
      company,
      sections: [
        {
          title: "Customer",
          body: keyValueRows([
            ["Name", estimateLabel(snapshot, estimate)],
            ["Property", customerAddress(customer)],
            ["Phone", customer?.phone],
            ["Email", customer?.email],
          ]),
        },
        {
          title: "Estimate Details",
          body: keyValueRows([
            ["Status", estimate.status],
            ["Service", estimate.service_type],
            ["Issue date", formatDate(estimate.issue_date)],
            ["Expiration", formatDate(estimate.expiration_date)],
            ["Subtotal", formatMoney(estimate.subtotal)],
            ["Labor", formatMoney(estimate.labor_total)],
            ["Materials", formatMoney(estimate.material_total)],
            ["Discount", formatMoney(estimate.discount_total)],
            ["Tax", formatMoney(estimate.tax_total)],
            ["Profit margin", formatMoney(estimate.profit_margin_total)],
            ["Total", formatMoney(estimate.total)],
          ]),
        },
        {
          title: "Line Items",
          body: list(
            lineItems.map(
              (item) =>
                `${item.name} - ${item.quantity} ${item.unit} x ${formatMoney(item.unit_cost)} = ${formatMoney(item.total)}`,
            ),
          ),
        },
        {
          title: "Notes",
          body: estimate.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Estimate - ${estimate.title}`,
    summary: `${lineItems.length} line items, ${formatMoney(estimate.total)} total`,
  };
}

function buildInvoiceDraft(
  snapshot: CrmSnapshot,
  invoice: InvoiceRecord,
): GeneratedDocumentDraft {
  const lineItems = snapshot.invoiceLineItems
    .filter((item) => item.invoice_id === invoice.id)
    .sort((a, b) => a.sort_order - b.sort_order);
  const customer = customerById(snapshot, invoice.customer_id);
  const company = companyName(snapshot, invoice.company_id);

  return {
    company_id: invoice.company_id,
    customer_id: invoice.customer_id,
    job_id: invoice.job_id,
    estimate_id: invoice.estimate_id,
    invoice_id: invoice.id,
    change_order_id: null,
    title: `${invoice.invoice_number} - Invoice Packet`,
    category: "invoice",
    file_url: null,
    body: packet({
      title: `${invoice.invoice_number} Invoice`,
      company,
      sections: [
        {
          title: "Bill To",
          body: keyValueRows([
            ["Name", invoiceLabel(snapshot, invoice)],
            ["Property", customerAddress(customer)],
            ["Phone", customer?.phone],
            ["Email", customer?.email],
          ]),
        },
        {
          title: "Invoice Details",
          body: keyValueRows([
            ["Status", invoice.status],
            ["Issue date", formatDate(invoice.issue_date)],
            ["Due date", formatDate(invoice.due_date)],
            ["Subtotal", formatMoney(invoice.subtotal)],
            ["Discount", formatMoney(invoice.discount_total)],
            ["Tax", formatMoney(invoice.tax_total)],
            ["Total", formatMoney(invoice.total)],
            ["Paid", formatMoney(invoice.amount_paid)],
            ["Balance due", formatMoney(invoice.balance_due)],
          ]),
        },
        {
          title: "Line Items",
          body: list(
            lineItems.map(
              (item) =>
                `${item.description} - ${item.quantity} x ${formatMoney(item.unit_cost)} = ${formatMoney(item.total)}`,
            ),
          ),
        },
        {
          title: "Notes",
          body: invoice.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Invoice - ${invoice.invoice_number}`,
    summary: `${lineItems.length} line items, ${formatMoney(invoice.balance_due)} balance due`,
  };
}

function buildScopeDraft(
  snapshot: CrmSnapshot,
  scope: ScopeRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, scope.company_id);

  return {
    company_id: scope.company_id,
    customer_id: scope.customer_id,
    job_id: null,
    estimate_id: scope.estimate_id,
    invoice_id: null,
    change_order_id: null,
    title: `${scope.title} - Scope Packet`,
    category: "scope",
    file_url: null,
    body: packet({
      title: scope.title,
      company,
      sections: [
        {
          title: "Project",
          body: keyValueRows([
            ["Target", scopeLabel(snapshot, scope)],
            ["Category", scope.category.replace(/_/g, " ")],
            ["Status", scope.status],
          ]),
        },
        {
          title: "Scope Of Work",
          body: scope.scope_body,
        },
        {
          title: "Notes",
          body: scope.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Scope - ${scope.title}`,
    summary: `${scope.category.replace(/_/g, " ")} scope`,
  };
}

function buildChangeOrderDraft(
  snapshot: CrmSnapshot,
  changeOrder: ChangeOrderRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, changeOrder.company_id);

  return {
    company_id: changeOrder.company_id,
    customer_id: changeOrder.customer_id,
    job_id: changeOrder.job_id,
    estimate_id: changeOrder.estimate_id,
    invoice_id: null,
    change_order_id: changeOrder.id,
    title: `${changeOrder.title} - Change Order Packet`,
    category: "change_order",
    file_url: null,
    body: packet({
      title: changeOrder.title,
      company,
      sections: [
        {
          title: "Change Order",
          body: keyValueRows([
            ["Status", changeOrder.status],
            ["Requested", formatDate(changeOrder.requested_date)],
            ["Approved", formatDateTime(changeOrder.approved_at)],
            ["Amount", formatMoney(changeOrder.amount)],
            ["Tax", formatMoney(changeOrder.tax_total)],
            ["Total", formatMoney(changeOrder.total)],
          ]),
        },
        {
          title: "Reason And Scope Impact",
          body: changeOrder.reason,
        },
        {
          title: "Notes",
          body: changeOrder.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Change order - ${changeOrder.title}`,
    summary: `${formatMoney(changeOrder.total)} ${changeOrder.status}`,
  };
}

function buildJobDraft(snapshot: CrmSnapshot, job: JobRecord): GeneratedDocumentDraft {
  const company = companyName(snapshot, job.company_id);
  const scope = job.scope_id
    ? snapshot.scopes.find((item) => item.id === job.scope_id) ?? null
    : null;
  const scheduleEvents = snapshot.scheduleEvents
    .filter((event) => event.job_id === job.id)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  const materialOrders = snapshot.materialOrders.filter((order) => order.job_id === job.id);
  const invoices = snapshot.invoices.filter((invoice) => invoice.job_id === job.id);
  const changeOrders = snapshot.changeOrders.filter(
    (changeOrder) => changeOrder.job_id === job.id,
  );

  return {
    company_id: job.company_id,
    customer_id: job.customer_id,
    job_id: job.id,
    estimate_id: job.estimate_id,
    invoice_id: null,
    change_order_id: null,
    title: `${job.title} - Production Packet`,
    category: "contract",
    file_url: null,
    body: packet({
      title: `${job.title} Production Packet`,
      company,
      sections: [
        {
          title: "Job Summary",
          body: keyValueRows([
            ["Customer", jobLabel(snapshot, job)],
            ["Service", job.service_type],
            ["Status", job.status],
            ["Address", job.property_address],
            ["Start", formatDate(job.start_date)],
            ["End", formatDate(job.end_date)],
            ["Crew", job.crew_name],
            ["Project manager", job.project_manager],
          ]),
        },
        {
          title: "Scope",
          body: scope?.scope_body ?? "No scope linked.",
        },
        {
          title: "Schedule",
          body: list(
            scheduleEvents.map(
              (event) =>
                `${formatDateTime(event.start_at)} - ${event.title} (${event.status})`,
            ),
          ),
        },
        {
          title: "Material Orders",
          body: list(
            materialOrders.map(
              (order) =>
                `${order.supplier_name} - ${order.status} - ${formatMoney(order.total)}`,
            ),
          ),
        },
        {
          title: "Invoices And Change Orders",
          body: list([
            ...invoices.map(
              (invoice) =>
                `${invoice.invoice_number} - ${invoice.status} - balance ${formatMoney(invoice.balance_due)}`,
            ),
            ...changeOrders.map(
              (changeOrder) =>
                `${changeOrder.title} - ${changeOrder.status} - ${formatMoney(changeOrder.total)}`,
            ),
          ]),
        },
        {
          title: "Production Notes",
          body: job.notes ?? "No production notes recorded.",
        },
      ],
    }),
    sourceLabel: `Job - ${job.title}`,
    summary: `${scheduleEvents.length} schedule events, ${materialOrders.length} material orders`,
  };
}

function buildCustomerDraft(
  snapshot: CrmSnapshot,
  customer: CustomerRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, customer.company_id);
  const jobs = snapshot.jobs.filter((job) => job.customer_id === customer.id);
  const estimates = snapshot.estimates.filter(
    (estimate) => estimate.customer_id === customer.id,
  );
  const invoices = snapshot.invoices.filter((invoice) => invoice.customer_id === customer.id);
  const documents = snapshot.documents.filter(
    (document) => document.customer_id === customer.id,
  );

  return {
    company_id: customer.company_id,
    customer_id: customer.id,
    job_id: null,
    estimate_id: null,
    invoice_id: null,
    change_order_id: null,
    title: `${customer.display_name} - Customer Packet`,
    category: "other",
    file_url: null,
    body: packet({
      title: `${customer.display_name} Customer Packet`,
      company,
      sections: [
        {
          title: "Customer Profile",
          body: keyValueRows([
            ["Display name", customer.display_name],
            ["Primary contact", customer.contact_name],
            ["Status", customer.status],
            ["Type", customer.customer_type],
            ["Phone", customer.phone],
            ["Email", customer.email],
            ["Property", customerAddress(customer)],
          ]),
        },
        {
          title: "Jobs",
          body: list(
            jobs.map(
              (job) =>
                `${job.title} - ${job.status} - ${formatDate(job.start_date)}`,
            ),
          ),
        },
        {
          title: "Estimates",
          body: list(
            estimates.map(
              (estimate) =>
                `${estimate.title} - ${estimate.status} - ${formatMoney(estimate.total)}`,
            ),
          ),
        },
        {
          title: "Invoices",
          body: list(
            invoices.map(
              (invoice) =>
                `${invoice.invoice_number} - ${invoice.status} - balance ${formatMoney(invoice.balance_due)}`,
            ),
          ),
        },
        {
          title: "Documents",
          body: list(documents.map((document) => `${document.title} - ${document.category}`)),
        },
        {
          title: "Notes",
          body: customer.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Customer - ${customer.display_name}`,
    summary: `${jobs.length} jobs, ${estimates.length} estimates, ${invoices.length} invoices`,
  };
}

export function buildDocumentSourceOptions(snapshot: CrmSnapshot): DocumentSourceOption[] {
  return [
    ...snapshot.estimates.map((estimate) => ({
      value: `estimate:${estimate.id}`,
      label: `Estimate - ${estimate.title}`,
      type: "estimate" as const,
    })),
    ...snapshot.invoices.map((invoice) => ({
      value: `invoice:${invoice.id}`,
      label: `Invoice - ${invoice.invoice_number}`,
      type: "invoice" as const,
    })),
    ...snapshot.scopes.map((scope) => ({
      value: `scope:${scope.id}`,
      label: `Scope - ${scope.title}`,
      type: "scope" as const,
    })),
    ...snapshot.changeOrders.map((changeOrder) => ({
      value: `change_order:${changeOrder.id}`,
      label: `Change order - ${changeOrder.title}`,
      type: "change_order" as const,
    })),
    ...snapshot.jobs.map((job) => ({
      value: `job:${job.id}`,
      label: `Job packet - ${job.title}`,
      type: "job" as const,
    })),
    ...snapshot.customers.map((customer) => ({
      value: `customer:${customer.id}`,
      label: `Customer packet - ${customer.display_name}`,
      type: "customer" as const,
    })),
  ];
}

export function buildGeneratedDocumentDraft(
  snapshot: CrmSnapshot,
  sourceKey: string,
): GeneratedDocumentDraft | null {
  const [type, id] = sourceKey.split(":") as [DocumentSourceType, string];

  if (type === "estimate") {
    const estimate = snapshot.estimates.find((item) => item.id === id);
    return estimate ? buildEstimateDraft(snapshot, estimate) : null;
  }

  if (type === "invoice") {
    const invoice = snapshot.invoices.find((item) => item.id === id);
    return invoice ? buildInvoiceDraft(snapshot, invoice) : null;
  }

  if (type === "scope") {
    const scope = snapshot.scopes.find((item) => item.id === id);
    return scope ? buildScopeDraft(snapshot, scope) : null;
  }

  if (type === "change_order") {
    const changeOrder = snapshot.changeOrders.find((item) => item.id === id);
    return changeOrder ? buildChangeOrderDraft(snapshot, changeOrder) : null;
  }

  if (type === "job") {
    const job = snapshot.jobs.find((item) => item.id === id);
    return job ? buildJobDraft(snapshot, job) : null;
  }

  if (type === "customer") {
    const customer = snapshot.customers.find((item) => item.id === id);
    return customer ? buildCustomerDraft(snapshot, customer) : null;
  }

  return null;
}
