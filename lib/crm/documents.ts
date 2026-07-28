import type {
  ChangeOrderRecord,
  CompanyRecord,
  CrmSnapshot,
  CustomerRecord,
  DocumentCategory,
  DocumentInput,
  EstimateRecord,
  InspectionRecord,
  InvoiceRecord,
  JobRecord,
  LeadRecord,
  ScopeRecord,
  Trade,
} from "./types";
import {
  colorSelectionStatusLabel,
  paintFinishLabel,
  paintingAreaLabel,
  surfacePrepLabel,
} from "./painting";

type DocumentSourceType =
  | "lead"
  | "opportunity"
  | "estimate"
  | "invoice"
  | "scope"
  | "change_order"
  | "job"
  | "inspection"
  | "completion_certificate"
  | "warranty"
  | "customer";

export type DocumentSourceOption = {
  value: string;
  label: string;
  type: DocumentSourceType;
  category: DocumentCategory;
  templateKey: string;
};

export type GeneratedDocumentDraft = DocumentInput & {
  sourceLabel: string;
  summary: string;
  templateKey: string;
  templateName: string;
};

export type WeatherTechDocumentTemplate = {
  key: string;
  name: string;
  category: DocumentCategory;
  sourceType: DocumentSourceType;
  trade: Trade;
  description: string;
  aiPrompt: string;
};

export const weatherTechDocumentTemplates: WeatherTechDocumentTemplate[] = [
  {
    key: "weathertech_lead_summary",
    name: "WeatherTech Lead Summary",
    category: "other",
    sourceType: "lead",
    trade: "roofing",
    description: "Internal intake summary with customer, property, source, status, and notes.",
    aiPrompt: "Create a concise WeatherTech roofing lead intake summary using customer contact, property, service type, lead source, priority, status, follow-up, and internal notes.",
  },
  {
    key: "weathertech_opportunity_summary",
    name: "WeatherTech Opportunity Summary",
    category: "other",
    sourceType: "opportunity",
    trade: "roofing",
    description: "Sales opportunity brief for estimating, follow-up, and handoff readiness.",
    aiPrompt: "Create a WeatherTech roofing opportunity summary with stage, expected value, probability, next action, follow-up date, source, customer context, and estimating notes.",
  },
  {
    key: "weathertech_estimate",
    name: "WeatherTech Roofing Estimate",
    category: "estimate",
    sourceType: "estimate",
    trade: "roofing",
    description: "Customer-facing proposal with line items, totals, exclusions, and approval language.",
    aiPrompt: "Create a professional roofing estimate document using the selected estimate, property details, line items, exclusions, warranty notes, tax, discounts, and profit-aware totals.",
  },
  {
    key: "weathertech_scope_of_work",
    name: "WeatherTech Scope of Work",
    category: "scope",
    sourceType: "scope",
    trade: "roofing",
    description: "Detailed work plan for roofing, repairs, painting, underlayment, and custom production scopes.",
    aiPrompt: "Create a detailed WeatherTech scope of work from the selected scope record with project sequence, customer expectations, cleanup, exclusions, safety notes, and warranty boundaries.",
  },
  {
    key: "weathertech_inspection_report",
    name: "WeatherTech Inspection Summary",
    category: "other",
    sourceType: "inspection",
    trade: "roofing",
    description: "Internal inspection summary with findings, measurements, schedule, and report readiness.",
    aiPrompt: "Create a WeatherTech roofing inspection summary using inspection type, findings, measurements, customer-visible notes, internal notes, report status, and estimate readiness.",
  },
  {
    key: "weathertech_invoice",
    name: "WeatherTech Invoice",
    category: "invoice",
    sourceType: "invoice",
    trade: "roofing",
    description: "Payment-ready invoice packet with charges, payments, balance, and remittance notes.",
    aiPrompt: "Create a clean invoice packet with customer billing details, invoice line items, balance due, payment terms, and service summary.",
  },
  {
    key: "weathertech_completion_certificate",
    name: "WeatherTech Completion Certificate",
    category: "completion_certificate",
    sourceType: "completion_certificate",
    trade: "roofing",
    description: "Closeout certificate confirming job completion, walkthrough, photos, and open balances.",
    aiPrompt: "Create a completion certificate for the selected job with property details, completion date, final walkthrough notes, photo/document references, and customer acknowledgement language.",
  },
  {
    key: "weathertech_workmanship_warranty",
    name: "WeatherTech Workmanship Warranty",
    category: "warranty",
    sourceType: "warranty",
    trade: "roofing",
    description: "Roofing warranty packet with workmanship terms, exclusions, registration, and maintenance guidance.",
    aiPrompt: "Create a workmanship warranty document for the selected roofing job with coverage terms, exclusions, claim process, maintenance requirements, and transferable limitations.",
  },
  {
    key: "ihc_lead_summary",
    name: "IHC Lead Summary",
    category: "other",
    sourceType: "lead",
    trade: "painting",
    description:
      "Internal painting lead intake summary with customer, property, source, color needs, status, and notes.",
    aiPrompt:
      "Create a concise IHC Painting lead intake summary using customer contact, property, service type, lead source, priority, status, follow-up, color/prep context, and internal notes.",
  },
  {
    key: "ihc_opportunity_summary",
    name: "IHC Opportunity Summary",
    category: "other",
    sourceType: "opportunity",
    trade: "painting",
    description:
      "Painting opportunity brief for estimating, color selection, follow-up, and handoff readiness.",
    aiPrompt:
      "Create an IHC Painting opportunity summary with stage, expected value, probability, next action, follow-up date, source, customer context, painting scope, color readiness, and estimating notes.",
  },
  {
    key: "ihc_painting_estimate",
    name: "IHC Painting Estimate",
    category: "estimate",
    sourceType: "estimate",
    trade: "painting",
    description:
      "IHC proposal with prep level, Dunn-Edwards coating system, sheen, colors, labor, materials, and customer approval.",
    aiPrompt:
      "Create a professional IHC Painting estimate using the selected estimate, property details, surface prep, Dunn-Edwards product line, sheen, color approval status, line items, exclusions, tax, discounts, and totals.",
  },
  {
    key: "ihc_scope_of_work",
    name: "IHC Painting Scope of Work",
    category: "scope",
    sourceType: "scope",
    trade: "painting",
    description:
      "Interior, exterior, and cabinet refinishing work plan with prep, masking, color placement, and finish requirements.",
    aiPrompt:
      "Create a detailed IHC Painting scope of work from the selected scope with room/surface schedule, prep expectations, masking, Dunn-Edwards product details, sheen, color placement, cleanup, exclusions, and final walkthrough.",
  },
  {
    key: "ihc_inspection_report",
    name: "IHC Inspection Summary",
    category: "other",
    sourceType: "inspection",
    trade: "painting",
    description:
      "Lightweight painting inspection summary with surfaces, prep, colors, photos, and follow-up needs.",
    aiPrompt:
      "Create an IHC Painting inspection summary using inspection type, surfaces, prep observations, color readiness, customer-visible notes, internal notes, report status, and estimate readiness.",
  },
  {
    key: "ihc_invoice",
    name: "IHC Painting Invoice",
    category: "invoice",
    sourceType: "invoice",
    trade: "painting",
    description: "Payment-ready invoice packet for painting work, progress payments, balances, and terms.",
    aiPrompt: "Create a clean IHC Painting invoice packet with customer billing details, line items, service summary, payment terms, paid amount, and balance due.",
  },
  {
    key: "ihc_completion_certificate",
    name: "IHC Painting Completion Certificate",
    category: "completion_certificate",
    sourceType: "completion_certificate",
    trade: "painting",
    description:
      "Painting closeout certificate confirming completed surfaces, touch-ups, photos, color placement, and walkthrough.",
    aiPrompt:
      "Create an IHC Painting completion certificate for the selected job with property details, completion date, finished areas, Dunn-Edwards product/color references, touch-up review, photo references, and customer acknowledgement language.",
  },
  {
    key: "ihc_workmanship_warranty",
    name: "IHC Painting Workmanship Warranty",
    category: "warranty",
    sourceType: "warranty",
    trade: "painting",
    description:
      "IHC painting workmanship warranty with prep terms, coating exclusions, maintenance guidance, and product limits.",
    aiPrompt:
      "Create an IHC Painting workmanship warranty document for the selected job with coverage terms, exclusions, claim process, Dunn-Edwards coating manufacturer limits, maintenance requirements, and care instructions.",
  },
];

function templateByKey(key: string) {
  return (
    weatherTechDocumentTemplates.find((template) => template.key === key) ??
    weatherTechDocumentTemplates[0]
  );
}

function templateMatchesCompany(
  template: WeatherTechDocumentTemplate,
  company: CompanyRecord | null | undefined,
) {
  return !company || company.trade === "both" || template.trade === company.trade;
}

export function getDocumentTemplatesForCompany(
  company?: CompanyRecord | null,
) {
  return weatherTechDocumentTemplates.filter((template) =>
    templateMatchesCompany(template, company),
  );
}

function companyById(snapshot: CrmSnapshot, companyId: string) {
  return snapshot.companies.find((company) => company.id === companyId) ?? null;
}

function templateForSource(
  snapshot: CrmSnapshot,
  companyId: string,
  sourceType: DocumentSourceType,
) {
  const company = companyById(snapshot, companyId);
  return (
    weatherTechDocumentTemplates.find(
      (template) =>
        template.sourceType === sourceType && templateMatchesCompany(template, company),
    ) ??
    weatherTechDocumentTemplates.find((template) => template.sourceType === sourceType) ??
    weatherTechDocumentTemplates[0]
  );
}

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

function leadAddress(lead: LeadRecord | null) {
  if (!lead) {
    return "Not linked";
  }

  return [
    lead.property_address,
    lead.city,
    lead.state,
    lead.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

function pipelineStageLabel(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ") : "Not set";
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
  const template = templateForSource(snapshot, estimate.company_id, "estimate");
  const companyRecord = companyById(snapshot, estimate.company_id);
  const shouldIncludePaintingSpecs =
    estimate.service_type === "painting" || companyRecord?.trade === "painting";
  const paintingSpecSection = shouldIncludePaintingSpecs
    ? [
        {
          title: "Painting Specifications",
          body: keyValueRows([
            ["Area type", paintingAreaLabel(estimate.painting_area_type)],
            ["Paint brand", estimate.paint_brand],
            ["Product line", estimate.paint_product_line],
            ["Finish / sheen", paintFinishLabel(estimate.paint_finish)],
            [
              "Color approval",
              colorSelectionStatusLabel(estimate.color_selection_status),
            ],
            ["Body / wall color", estimate.paint_color_body],
            ["Trim color", estimate.paint_color_trim],
            ["Accent / cabinet color", estimate.paint_color_accent],
            ["Surface prep", surfacePrepLabel(estimate.surface_prep_level)],
            ["Coats", estimate.coats],
            ["Primer required", estimate.primer_required ? "Yes" : "No"],
          ]),
        },
      ]
    : [];

  return {
    company_id: estimate.company_id,
    customer_id: estimate.customer_id,
    job_id: null,
    estimate_id: estimate.id,
    invoice_id: null,
    change_order_id: null,
    title: `${estimate.title} - Estimate Packet`,
    category: "estimate",
    status: "draft",
    template_key: template.key,
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
        ...paintingSpecSection,
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
          title: "Customer Approval",
          body: keyValueRows([
            ["Accepted total", formatMoney(estimate.total)],
            ["Approval status", estimate.status],
            ["Signature", "Customer signature required before production scheduling."],
            [
              "Terms",
              "Approval authorizes the selected scope, listed line items, taxes, discounts, margins, and company terms. Changes to hidden conditions, selections, colors, or access requirements require written approval.",
            ],
          ]),
        },
        {
          title: "Notes",
          body: estimate.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Estimate - ${estimate.title}`,
    summary: `${lineItems.length} line items, ${formatMoney(estimate.total)} total`,
    templateKey: template.key,
    templateName: template.name,
  };
}

function buildLeadDraft(
  snapshot: CrmSnapshot,
  lead: LeadRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, lead.company_id);
  const template = templateForSource(snapshot, lead.company_id, "lead");
  const customer = customerById(snapshot, lead.customer_id);

  return {
    company_id: lead.company_id,
    customer_id: lead.customer_id,
    job_id: null,
    estimate_id: null,
    invoice_id: null,
    change_order_id: null,
    title: `${lead.contact_name} - Lead Intake Summary`,
    category: "other",
    status: "draft",
    template_key: template.key,
    file_url: null,
    body: packet({
      title: `${lead.contact_name} Lead Intake Summary`,
      company,
      sections: [
        {
          title: "Lead",
          body: keyValueRows([
            ["Contact", lead.contact_name],
            ["Phone", lead.phone],
            ["Email", lead.email],
            ["Company", company],
            ["Source", lead.source],
            ["Status", lead.status],
            ["Pipeline stage", pipelineStageLabel(lead.pipeline_stage)],
            ["Priority", lead.priority],
            ["Service", lead.service_type],
            ["Expected value", formatMoney(lead.estimated_value)],
            ["Next follow-up", formatDate(lead.next_follow_up)],
          ]),
        },
        {
          title: "Property",
          body: keyValueRows([
            ["Address", leadAddress(lead)],
            ["Converted customer", customer?.display_name],
          ]),
        },
        {
          title: "Notes",
          body: lead.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Lead - ${lead.contact_name}`,
    summary: `${lead.source} lead, ${pipelineStageLabel(lead.pipeline_stage)}`,
    templateKey: template.key,
    templateName: template.name,
  };
}

function buildOpportunityDraft(
  snapshot: CrmSnapshot,
  lead: LeadRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, lead.company_id);
  const template = templateForSource(snapshot, lead.company_id, "opportunity");
  const estimate = snapshot.estimates.find((item) => item.lead_id === lead.id) ?? null;
  const job = snapshot.jobs.find((item) => item.lead_id === lead.id) ?? null;
  const probability =
    lead.status === "won"
      ? 100
      : lead.status === "lost"
        ? 0
        : lead.pipeline_stage === "approved"
          ? 85
          : lead.pipeline_stage === "estimate_sent"
            ? 65
            : lead.pipeline_stage === "estimate_scheduled"
              ? 45
              : lead.pipeline_stage === "contacted"
                ? 25
                : 10;

  return {
    company_id: lead.company_id,
    customer_id: lead.customer_id,
    job_id: job?.id ?? null,
    estimate_id: estimate?.id ?? null,
    invoice_id: null,
    change_order_id: null,
    title: `${lead.contact_name} - Opportunity Summary`,
    category: "other",
    status: "draft",
    template_key: template.key,
    file_url: null,
    body: packet({
      title: `${lead.contact_name} Opportunity Summary`,
      company,
      sections: [
        {
          title: "Opportunity",
          body: keyValueRows([
            ["Stage", pipelineStageLabel(lead.pipeline_stage)],
            ["Status", lead.status],
            ["Expected revenue", formatMoney(lead.estimated_value)],
            ["Probability", `${probability}%`],
            ["Assigned owner", lead.created_by],
            ["Next follow-up", formatDate(lead.next_follow_up)],
            ["Lead source", lead.source],
          ]),
        },
        {
          title: "Relationship",
          body: keyValueRows([
            ["Contact", lead.contact_name],
            ["Property", leadAddress(lead)],
            ["Estimate", estimate?.title],
            ["Job", job?.title],
          ]),
        },
        {
          title: "Next Action",
          body: lead.notes ?? "No next action recorded.",
        },
      ],
    }),
    sourceLabel: `Opportunity - ${lead.contact_name}`,
    summary: `${pipelineStageLabel(lead.pipeline_stage)}, ${formatMoney(lead.estimated_value)} expected`,
    templateKey: template.key,
    templateName: template.name,
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
  const template = templateForSource(snapshot, invoice.company_id, "invoice");

  return {
    company_id: invoice.company_id,
    customer_id: invoice.customer_id,
    job_id: invoice.job_id,
    estimate_id: invoice.estimate_id,
    invoice_id: invoice.id,
    change_order_id: null,
    title: `${invoice.invoice_number} - Invoice Packet`,
    category: "invoice",
    status: "draft",
    template_key: template.key,
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
    templateKey: template.key,
    templateName: template.name,
  };
}

function buildScopeDraft(
  snapshot: CrmSnapshot,
  scope: ScopeRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, scope.company_id);
  const template = templateForSource(snapshot, scope.company_id, "scope");

  return {
    company_id: scope.company_id,
    customer_id: scope.customer_id,
    job_id: null,
    estimate_id: scope.estimate_id,
    invoice_id: null,
    change_order_id: null,
    title: `${scope.title} - Scope Packet`,
    category: "scope",
    status: "draft",
    template_key: template.key,
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
    templateKey: template.key,
    templateName: template.name,
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
    status: "draft",
    template_key: "weathertech_change_order",
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
    templateKey: "weathertech_change_order",
    templateName: "WeatherTech Change Order",
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
    status: "draft",
    template_key: "weathertech_job_packet",
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
    templateKey: "weathertech_job_packet",
    templateName: "WeatherTech Job Packet",
  };
}

function buildCompletionCertificateDraft(
  snapshot: CrmSnapshot,
  job: JobRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, job.company_id);
  const customer = customerById(snapshot, job.customer_id);
  const invoices = snapshot.invoices.filter((invoice) => invoice.job_id === job.id);
  const photos = snapshot.jobPhotos.filter((photo) => photo.job_id === job.id);
  const documents = snapshot.documents.filter((document) => document.job_id === job.id);
  const inspections = snapshot.inspections.filter(
    (inspection) => inspection.job_id === job.id,
  );
  const template = templateForSource(
    snapshot,
    job.company_id,
    "completion_certificate",
  );
  const finalInspection = inspections.find(
    (inspection) => inspection.status === "passed",
  );

  return {
    company_id: job.company_id,
    customer_id: job.customer_id,
    job_id: job.id,
    estimate_id: job.estimate_id,
    invoice_id: invoices[0]?.id ?? null,
    change_order_id: null,
    title: `${job.title} - Completion Certificate`,
    category: "completion_certificate",
    status: "draft",
    template_key: template.key,
    file_url: null,
    body: packet({
      title: `${job.title} Completion Certificate`,
      company,
      sections: [
        {
          title: "Certificate Summary",
          body: keyValueRows([
            ["Customer", jobLabel(snapshot, job)],
            ["Property", customerAddress(customer) || job.property_address],
            ["Service", job.service_type],
            ["Job status", job.status],
            ["Completion date", formatDate(job.end_date ?? new Date().toISOString())],
            ["Project manager", job.project_manager],
            ["Crew", job.crew_name],
          ]),
        },
        {
          title: "Completion Confirmation",
          body: "WeatherTech Roofing confirms that the contracted work described in the associated scope and job packet has been completed at the property listed above, subject to any open punch-list items or approved change orders documented in WeatherTech OS.",
        },
        {
          title: "Quality Review",
          body: keyValueRows([
            ["Final inspection", finalInspection ? finalInspection.title : "Not recorded"],
            ["Inspection status", finalInspection?.status],
            ["Photo records", photos.length],
            ["Linked documents", documents.length],
            ["Open invoice balance", formatMoney(invoices.reduce((total, invoice) => total + invoice.balance_due, 0))],
          ]),
        },
        {
          title: "Customer Acknowledgement",
          body: "Customer acknowledges receipt of completion documentation and understands that warranty coverage, maintenance requirements, and exclusions are governed by the signed contract and warranty packet.",
        },
      ],
    }),
    sourceLabel: `Job - ${job.title}`,
    summary: `${photos.length} photos, ${documents.length} linked documents`,
    templateKey: template.key,
    templateName: template.name,
  };
}

function buildWarrantyDraft(snapshot: CrmSnapshot, job: JobRecord): GeneratedDocumentDraft {
  const company = companyName(snapshot, job.company_id);
  const template = templateForSource(snapshot, job.company_id, "warranty");
  const customer = customerById(snapshot, job.customer_id);
  const estimate = job.estimate_id
    ? snapshot.estimates.find((item) => item.id === job.estimate_id) ?? null
    : null;
  const scope = job.scope_id
    ? snapshot.scopes.find((item) => item.id === job.scope_id) ?? null
    : null;

  return {
    company_id: job.company_id,
    customer_id: job.customer_id,
    job_id: job.id,
    estimate_id: job.estimate_id,
    invoice_id: null,
    change_order_id: null,
    title: `${job.title} - Workmanship Warranty`,
    category: "warranty",
    status: "draft",
    template_key: template.key,
    file_url: null,
    body: packet({
      title: `${job.title} Workmanship Warranty`,
      company,
      sections: [
        {
          title: "Warranty Registration",
          body: keyValueRows([
            ["Customer", jobLabel(snapshot, job)],
            ["Property", customerAddress(customer) || job.property_address],
            ["Service", job.service_type],
            ["Completion date", formatDate(job.end_date ?? new Date().toISOString())],
            ["Estimate", estimate?.title],
            ["Scope", scope?.title],
          ]),
        },
        {
          title: "Coverage",
          body: "WeatherTech Roofing workmanship warranty covers defects in WeatherTech-installed workmanship for the warranty period stated in the signed agreement. Manufacturer materials remain subject to manufacturer terms and registration requirements.",
        },
        {
          title: "Exclusions",
          body: list([
            "Damage from storms, wind, hail, impact, structural movement, trades, pests, or customer modifications.",
            "Leaks or failures caused by pre-existing decking, framing, ventilation, drainage, or hidden conditions not included in the approved scope.",
            "Maintenance items including debris removal, sealant aging, clogged drains, or neglect of recommended inspections.",
            "Unapproved repairs, penetrations, coatings, attachments, or alterations performed after completion.",
          ]),
        },
        {
          title: "Claim Process",
          body: "Customer must notify WeatherTech Roofing promptly, provide photos when available, and allow reasonable access for inspection. Approved workmanship claims will be scheduled according to urgency, weather, material availability, and production capacity.",
        },
        {
          title: "Maintenance Guidance",
          body: "Keep roof surfaces, gutters, valleys, drains, and penetrations clear of debris. Schedule inspections after major weather events and before monsoon or storm seasons when applicable.",
        },
      ],
    }),
    sourceLabel: `Job - ${job.title}`,
    summary: `${job.service_type.replace(/_/g, " ")} warranty packet`,
    templateKey: template.key,
    templateName: template.name,
  };
}

function buildInspectionDraft(
  snapshot: CrmSnapshot,
  inspection: InspectionRecord,
): GeneratedDocumentDraft {
  const company = companyName(snapshot, inspection.company_id);
  const template = templateForSource(snapshot, inspection.company_id, "inspection");
  const customer = customerById(snapshot, inspection.customer_id);
  const lead = inspection.lead_id
    ? snapshot.leads.find((item) => item.id === inspection.lead_id) ?? null
    : null;
  const job = inspection.job_id
    ? snapshot.jobs.find((item) => item.id === inspection.job_id) ?? null
    : null;
  const estimate = inspection.estimate_id
    ? snapshot.estimates.find((item) => item.id === inspection.estimate_id) ?? null
    : null;

  return {
    company_id: inspection.company_id,
    customer_id: inspection.customer_id,
    job_id: inspection.job_id,
    estimate_id: inspection.estimate_id,
    invoice_id: null,
    change_order_id: null,
    title: `${inspection.title} - Inspection Summary`,
    category: "other",
    status: "draft",
    template_key: template.key,
    file_url: null,
    body: packet({
      title: `${inspection.title} Inspection Summary`,
      company,
      sections: [
        {
          title: "Inspection",
          body: keyValueRows([
            ["Type", inspection.inspection_type.replace(/_/g, " ")],
            ["Service category", inspection.service_category.replace(/_/g, " ")],
            ["Status", inspection.status],
            ["Scheduled start", formatDateTime(inspection.scheduled_start)],
            ["Scheduled end", formatDateTime(inspection.scheduled_end)],
            ["Inspector", inspection.assigned_inspector],
            ["Priority", inspection.priority],
            ["Outcome", inspection.outcome],
          ]),
        },
        {
          title: "Relationships",
          body: keyValueRows([
            ["Customer", customer?.display_name],
            ["Lead", lead?.contact_name],
            ["Job", job?.title],
            ["Estimate", estimate?.title],
            ["Property", inspection.property_address ?? customerAddress(customer) ?? leadAddress(lead)],
          ]),
        },
        {
          title: "Findings",
          body: list(
            inspection.findings.map(
              (finding) =>
                `${finding.area || "Area"} - ${finding.category || "Finding"}: ${finding.observation || finding.recommendation || "No note"}`,
            ),
          ),
        },
        {
          title: "Measurements",
          body: list(
            inspection.measurements.map(
              (measurement) =>
                `${measurement.label}: ${measurement.value} ${measurement.unit ?? ""}`.trim(),
            ),
          ),
        },
        {
          title: "Internal Notes",
          body: inspection.internal_notes ?? inspection.notes ?? "No notes recorded.",
        },
      ],
    }),
    sourceLabel: `Inspection - ${inspection.title}`,
    summary: `${inspection.findings.length} findings, ${inspection.measurements.length} measurements`,
    templateKey: template.key,
    templateName: template.name,
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
    status: "draft",
    template_key: "weathertech_customer_packet",
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
    templateKey: "weathertech_customer_packet",
    templateName: "WeatherTech Customer Packet",
  };
}

export function buildDocumentSourceOptions(snapshot: CrmSnapshot): DocumentSourceOption[] {
  const opportunityLeads = snapshot.leads.filter(
    (lead) =>
      lead.pipeline_stage !== "new_lead" ||
      lead.status === "qualified" ||
      lead.status === "estimate_sent" ||
      lead.status === "won" ||
      lead.status === "lost" ||
      lead.estimated_value > 0,
  );

  return [
    ...snapshot.leads.map((lead) => ({
      value: `lead:${lead.id}`,
      label: `Lead - ${lead.contact_name}`,
      type: "lead" as const,
      category: "other" as const,
      templateKey: templateForSource(snapshot, lead.company_id, "lead").key,
    })),
    ...opportunityLeads.map((lead) => ({
      value: `opportunity:${lead.id}`,
      label: `Opportunity - ${lead.contact_name}`,
      type: "opportunity" as const,
      category: "other" as const,
      templateKey: templateForSource(snapshot, lead.company_id, "opportunity").key,
    })),
    ...snapshot.estimates.map((estimate) => ({
      value: `estimate:${estimate.id}`,
      label: `Estimate - ${estimate.title}`,
      type: "estimate" as const,
      category: "estimate" as const,
      templateKey: templateForSource(snapshot, estimate.company_id, "estimate").key,
    })),
    ...snapshot.invoices.map((invoice) => ({
      value: `invoice:${invoice.id}`,
      label: `Invoice - ${invoice.invoice_number}`,
      type: "invoice" as const,
      category: "invoice" as const,
      templateKey: templateForSource(snapshot, invoice.company_id, "invoice").key,
    })),
    ...snapshot.scopes.map((scope) => ({
      value: `scope:${scope.id}`,
      label: `Scope - ${scope.title}`,
      type: "scope" as const,
      category: "scope" as const,
      templateKey: templateForSource(snapshot, scope.company_id, "scope").key,
    })),
    ...snapshot.jobs.map((job) => ({
      value: `completion_certificate:${job.id}`,
      label: `Completion certificate - ${job.title}`,
      type: "completion_certificate" as const,
      category: "completion_certificate" as const,
      templateKey: templateForSource(snapshot, job.company_id, "completion_certificate").key,
    })),
    ...snapshot.jobs.map((job) => ({
      value: `warranty:${job.id}`,
      label: `Warranty - ${job.title}`,
      type: "warranty" as const,
      category: "warranty" as const,
      templateKey: templateForSource(snapshot, job.company_id, "warranty").key,
    })),
    ...snapshot.changeOrders.map((changeOrder) => ({
      value: `change_order:${changeOrder.id}`,
      label: `Change order - ${changeOrder.title}`,
      type: "change_order" as const,
      category: "change_order" as const,
      templateKey: "weathertech_change_order",
    })),
    ...snapshot.jobs.map((job) => ({
      value: `job:${job.id}`,
      label: `Job packet - ${job.title}`,
      type: "job" as const,
      category: "contract" as const,
      templateKey: "weathertech_job_packet",
    })),
    ...snapshot.inspections.map((inspection) => ({
      value: `inspection:${inspection.id}`,
      label: `Inspection summary - ${inspection.title}`,
      type: "inspection" as const,
      category: "other" as const,
      templateKey: templateForSource(snapshot, inspection.company_id, "inspection").key,
    })),
    ...snapshot.customers.map((customer) => ({
      value: `customer:${customer.id}`,
      label: `Customer packet - ${customer.display_name}`,
      type: "customer" as const,
      category: "other" as const,
      templateKey: "weathertech_customer_packet",
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

  if (type === "lead") {
    const lead = snapshot.leads.find((item) => item.id === id);
    return lead ? buildLeadDraft(snapshot, lead) : null;
  }

  if (type === "opportunity") {
    const lead = snapshot.leads.find((item) => item.id === id);
    return lead ? buildOpportunityDraft(snapshot, lead) : null;
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

  if (type === "completion_certificate") {
    const job = snapshot.jobs.find((item) => item.id === id);
    return job ? buildCompletionCertificateDraft(snapshot, job) : null;
  }

  if (type === "warranty") {
    const job = snapshot.jobs.find((item) => item.id === id);
    return job ? buildWarrantyDraft(snapshot, job) : null;
  }

  if (type === "job") {
    const job = snapshot.jobs.find((item) => item.id === id);
    return job ? buildJobDraft(snapshot, job) : null;
  }

  if (type === "inspection") {
    const inspection = snapshot.inspections.find((item) => item.id === id);
    return inspection ? buildInspectionDraft(snapshot, inspection) : null;
  }

  if (type === "customer") {
    const customer = snapshot.customers.find((item) => item.id === id);
    return customer ? buildCustomerDraft(snapshot, customer) : null;
  }

  return null;
}
