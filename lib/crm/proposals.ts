import { calculateEstimateTotals } from "./estimates";
import type {
  CompanyRecord,
  CrmSnapshot,
  DocumentInput,
  EstimateLineItemRecord,
  EstimateProposalOptionRecord,
  EstimateProposalRevisionRecord,
  EstimateRecord,
  InspectionRecord,
  InvoiceInput,
  InvoiceLineItemInput,
  JobPhotoRecord,
  ProposalDepositType,
  ProposalPriceEffectType,
  ScopeRecord,
} from "./types";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const internalContentPattern =
  /\b(cost|margin|markup|commission|profit|private|internal|labor rate|supplier cost)\b/i;

export type ProposalBranding = {
  companyName: string;
  shortName: string;
  primaryColor: string;
  accentColor: string;
  proposalPrefix: string;
  serviceLabel: string;
  warrantyLabel: string;
  defaultDepositType: ProposalDepositType;
  defaultDepositValue: number;
  paymentProviderLabel: string;
  signatureProviderLabel: string;
};

export type ProposalOptionModel = {
  id: string;
  name: string;
  description: string;
  optionType: EstimateProposalOptionRecord["option_type"];
  optionGroupKey: string | null;
  quantity: number;
  unit: string;
  price: number;
  priceEffectType: ProposalPriceEffectType;
  baseReplacementAmount: number;
  customerVisible: boolean;
  selected: boolean;
  required: boolean;
  recommended: boolean;
  bestValue: boolean;
  warrantyEffect: string | null;
  scopeDetails: string | null;
  sourceLineItemId: string | null;
};

export type ProposalFinancials = {
  baseSubtotal: number;
  discountTotal: number;
  taxTotal: number;
  baseTotal: number;
  selectedUpgradesTotal: number;
  acceptedTotal: number;
  depositAmount: number;
  remainingBalance: number;
};

export type ProposalReadinessItem = {
  label: string;
  state: "ready" | "attention" | "blocked";
  detail: string;
};

export type ProposalWorkspaceModel = {
  proposalNumber: string;
  templateName: string;
  brand: ProposalBranding;
  revision: EstimateProposalRevisionRecord | null;
  sections: Array<{
    key: string;
    title: string;
    body: string;
    customerVisible: boolean;
    required: boolean;
  }>;
  options: ProposalOptionModel[];
  financials: ProposalFinancials;
  readiness: ProposalReadinessItem[];
  paymentSchedules: Array<{
    label: string;
    amount: number;
    trigger: string;
    status: string;
  }>;
  customerPacket: string;
};

function toCents(value: number | null | undefined) {
  if (!Number.isFinite(value ?? 0)) {
    return 0;
  }

  return Math.round((value ?? 0) * 100);
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

export function formatProposalMoney(value: number) {
  return currencyFormatter.format(value);
}

export function isProposalCustomerFacingTextSafe(value: string | null | undefined) {
  return !internalContentPattern.test(value ?? "");
}

export function scrubCustomerFacingText(value: string | null | undefined) {
  return (value ?? "")
    .split(/\r?\n/)
    .filter((line) => !internalContentPattern.test(line))
    .join("\n")
    .trim();
}

function isPaintingBrand(company: CompanyRecord | undefined | null) {
  return company?.trade === "painting" || /ihc|paint/i.test(company?.name ?? "");
}

export function getProposalBranding(company: CompanyRecord | undefined | null): ProposalBranding {
  if (isPaintingBrand(company)) {
    return {
      companyName: company?.name ?? "IHC Painting",
      shortName: company?.short_name ?? "IHC",
      primaryColor: company?.brand_color ?? "#f97316",
      accentColor: "#7c2d12",
      proposalPrefix: "IHC",
      serviceLabel: "Painting proposal",
      warrantyLabel: "Workmanship and coating terms",
      defaultDepositType: "percent",
      defaultDepositValue: 25,
      paymentProviderLabel: "IHC merchant routing not connected",
      signatureProviderLabel: "Signature provider not connected",
    };
  }

  return {
    companyName: company?.name ?? "WeatherTech Roofing LLC",
    shortName: company?.short_name ?? "WeatherTech",
    primaryColor: company?.brand_color ?? "#6d28d9",
    accentColor: "#f97316",
    proposalPrefix: "WT",
    serviceLabel: "Roofing proposal",
    warrantyLabel: "Roofing workmanship and manufacturer terms",
    defaultDepositType: "percent",
    defaultDepositValue: 10,
    paymentProviderLabel: "WeatherTech merchant routing not connected",
    signatureProviderLabel: "Signature provider not connected",
  };
}

export function buildProposalNumber(
  estimate: Pick<EstimateRecord, "id" | "issue_date" | "created_at">,
  company: CompanyRecord | undefined | null,
) {
  const brand = getProposalBranding(company);
  const date = (estimate.issue_date || estimate.created_at || new Date().toISOString())
    .slice(0, 10)
    .replace(/-/g, "");
  const suffix = estimate.id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "DRAFT";

  return `${brand.proposalPrefix}-${date}-${suffix}`;
}

function getSelectedOptionIds(selectedOptionIds: Iterable<string> | undefined) {
  return new Set(selectedOptionIds ?? []);
}

function optionTotalCents(option: ProposalOptionModel) {
  return toCents(option.price) * Math.max(option.quantity, 0);
}

function buildOptionModel(
  option: EstimateProposalOptionRecord,
  selectedIds: Set<string>,
): ProposalOptionModel {
  return {
    id: option.id,
    name: option.name,
    description: option.description ?? "",
    optionType: option.option_type,
    optionGroupKey: option.option_group_key,
    quantity: option.quantity,
    unit: option.unit,
    price: option.price,
    priceEffectType: option.price_effect_type,
    baseReplacementAmount: option.base_replacement_amount,
    customerVisible: option.customer_visible,
    selected: selectedIds.has(option.id) || option.selected,
    required: option.required,
    recommended: option.recommended,
    bestValue: option.best_value,
    warrantyEffect: option.warranty_effect,
    scopeDetails: option.scope_details,
    sourceLineItemId: option.source_line_item_id,
  };
}

export function calculateProposalFinancials({
  estimate,
  lineItems,
  options,
  depositType,
  depositValue,
}: {
  estimate: Pick<
    EstimateRecord,
    "tax_rate" | "discount_type" | "discount_value" | "profit_margin_rate" | "total"
  >;
  lineItems: EstimateLineItemRecord[];
  options: ProposalOptionModel[];
  depositType: ProposalDepositType;
  depositValue: number;
}): ProposalFinancials {
  const totals = calculateEstimateTotals(estimate, lineItems);
  const baseTotalCents = toCents(totals.total || estimate.total);
  const selectedOptions = options.filter((item) => item.selected && item.customerVisible);
  const fullAlternateOption = selectedOptions.find(
    (option) => option.priceEffectType === "full_alternate_total",
  );
  let acceptedTotalCents = fullAlternateOption
    ? optionTotalCents(fullAlternateOption)
    : baseTotalCents;
  let selectedDeltaCents = fullAlternateOption
    ? Math.max(acceptedTotalCents - baseTotalCents, 0)
    : 0;

  for (const option of selectedOptions) {
    if (option.id === fullAlternateOption?.id) {
      continue;
    }

    if (fullAlternateOption && option.priceEffectType !== "additive") {
      continue;
    }

    const priceCents = optionTotalCents(option);

    if (option.priceEffectType === "replace_base_amount") {
      const replacementDelta = priceCents - toCents(option.baseReplacementAmount);
      acceptedTotalCents += replacementDelta;
      selectedDeltaCents += Math.max(replacementDelta, 0);
      continue;
    }

    acceptedTotalCents += priceCents;
    selectedDeltaCents += priceCents;
  }

  acceptedTotalCents = Math.max(acceptedTotalCents, 0);
  const depositAmountCents =
    depositType === "fixed"
      ? toCents(depositValue)
      : depositType === "percent"
        ? Math.round(acceptedTotalCents * (Math.max(depositValue, 0) / 100))
        : 0;

  return {
    baseSubtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    baseTotal: fromCents(baseTotalCents),
    selectedUpgradesTotal: fromCents(selectedDeltaCents),
    acceptedTotal: fromCents(acceptedTotalCents),
    depositAmount: fromCents(Math.min(depositAmountCents, acceptedTotalCents)),
    remainingBalance: fromCents(Math.max(acceptedTotalCents - depositAmountCents, 0)),
  };
}

function findCustomer(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  return estimate.customer_id
    ? snapshot.customers.find((customer) => customer.id === estimate.customer_id) ?? null
    : null;
}

function findLead(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  return estimate.lead_id
    ? snapshot.leads.find((lead) => lead.id === estimate.lead_id) ?? null
    : null;
}

function customerName(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  return (
    findCustomer(snapshot, estimate)?.display_name ??
    findLead(snapshot, estimate)?.contact_name ??
    "Customer to confirm"
  );
}

function propertyAddress(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  const customer = findCustomer(snapshot, estimate);
  const lead = findLead(snapshot, estimate);

  return (
    estimate.location ??
    customer?.property_address ??
    lead?.property_address ??
    "Property address to confirm"
  );
}

function buildDefaultSections({
  snapshot,
  estimate,
  scope,
  inspection,
  photos,
}: {
  snapshot: CrmSnapshot;
  estimate: EstimateRecord;
  scope: ScopeRecord | null;
  inspection: InspectionRecord | null;
  photos: JobPhotoRecord[];
}) {
  const visibleFindings =
    inspection?.findings
      .filter((finding) => finding.customer_visible && finding.include_in_estimate)
      .map((finding) => `${finding.area}: ${finding.observation}. ${finding.recommendation}`) ??
    [];
  const visiblePhotos = photos.filter((photo) => photo.is_customer_visible);

  return [
    {
      key: "customer",
      title: "Customer and property",
      body: `${customerName(snapshot, estimate)}\n${propertyAddress(snapshot, estimate)}`,
      customerVisible: true,
      required: true,
    },
    {
      key: "overview",
      title: "Project overview",
      body:
        scrubCustomerFacingText(estimate.scope_of_work) ||
        scrubCustomerFacingText(scope?.scope_body) ||
        "Scope will be confirmed before this proposal is sent to the customer.",
      customerVisible: true,
      required: true,
    },
    {
      key: "findings",
      title: "Inspection findings",
      body: visibleFindings.length
        ? visibleFindings.join("\n")
        : "Customer-visible findings will appear here when they are selected from an inspection.",
      customerVisible: true,
      required: Boolean(visibleFindings.length),
    },
    {
      key: "photos",
      title: "Customer-visible photos",
      body: visiblePhotos.length
        ? visiblePhotos
            .map((photo) => photo.caption ?? photo.label ?? "Customer-visible project photo")
            .join("\n")
        : "Customer-visible photos can be attached from inspections, jobs, or photo uploads.",
      customerVisible: true,
      required: false,
    },
    {
      key: "terms",
      title: "Terms and acceptance",
      body:
        "Approval authorizes the listed customer-facing scope, selected options, taxes, discounts, payment schedule, and company terms. Hidden conditions or additional work require written approval.",
      customerVisible: true,
      required: true,
    },
  ];
}

export function buildProposalCustomerPacket(model: {
  proposalNumber: string;
  title: string;
  companyName: string;
  customerName: string;
  propertyAddress: string;
  sections: ProposalWorkspaceModel["sections"];
  lineItems: EstimateLineItemRecord[];
  options: ProposalOptionModel[];
  financials: ProposalFinancials;
}) {
  const optionLines = model.options
    .filter((option) => option.customerVisible)
    .map(
      (option) =>
        `- ${option.name}: ${option.selected ? "Selected" : "Optional"} ${formatProposalMoney(option.price)}`,
    );

  return [
    `# ${model.title}`,
    "",
    `Proposal ${model.proposalNumber}`,
    `Prepared by ${model.companyName}`,
    "",
    `Customer: ${model.customerName}`,
    `Property: ${model.propertyAddress}`,
    "",
    "## Customer-facing scope",
    ...model.sections
      .filter((section) => section.customerVisible)
      .flatMap((section) => [`### ${section.title}`, section.body, ""]),
    "## Base proposal",
    ...model.lineItems.map(
      (item) =>
        `- ${item.name}: ${item.quantity} ${item.unit} - ${formatProposalMoney(item.total)}`,
    ),
    "",
    "## Optional upgrades and alternatives",
    optionLines.length ? optionLines.join("\n") : "No customer-selected upgrades are configured.",
    "",
    "## Pricing",
    `Base total: ${formatProposalMoney(model.financials.baseTotal)}`,
    `Selected upgrades: ${formatProposalMoney(model.financials.selectedUpgradesTotal)}`,
    `Accepted total: ${formatProposalMoney(model.financials.acceptedTotal)}`,
    `Deposit due before job conversion: ${formatProposalMoney(model.financials.depositAmount)}`,
    `Remaining balance: ${formatProposalMoney(model.financials.remainingBalance)}`,
    "",
    "## Acceptance",
    "Customer signature and deposit collection remain disabled until provider configuration is completed.",
  ].join("\n");
}

export function buildProposalWorkspaceModel({
  snapshot,
  estimate,
  lineItems,
  company,
  scope,
  inspection,
  photos,
  selectedOptionIds,
}: {
  snapshot: CrmSnapshot;
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  company: CompanyRecord | undefined;
  scope: ScopeRecord | null;
  inspection: InspectionRecord | null;
  photos: JobPhotoRecord[];
  selectedOptionIds?: Iterable<string>;
}): ProposalWorkspaceModel {
  const revision =
    snapshot.proposalRevisions
      .filter((item) => item.estimate_id === estimate.id)
      .sort((left, right) => right.revision_number - left.revision_number)[0] ?? null;
  const brand = getProposalBranding(company);
  const proposalNumber =
    revision?.proposal_number ?? buildProposalNumber(estimate, company);
  const selectedIds = getSelectedOptionIds(selectedOptionIds);
  const options = snapshot.proposalOptions
    .filter((option) => option.proposal_revision_id === revision?.id)
    .map((option) => buildOptionModel(option, selectedIds));
  const sectionsFromRevision = revision
    ? snapshot.proposalSections
        .filter((section) => section.proposal_revision_id === revision.id)
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((section) => ({
          key: section.section_key,
          title: section.title,
          body: scrubCustomerFacingText(section.body),
          customerVisible: section.customer_visible,
          required: section.is_required,
        }))
    : [];
  const sections = sectionsFromRevision.length
    ? sectionsFromRevision
    : buildDefaultSections({ snapshot, estimate, scope, inspection, photos });
  const financials = calculateProposalFinancials({
    estimate,
    lineItems,
    options,
    depositType: revision?.deposit_type ?? brand.defaultDepositType,
    depositValue: revision?.deposit_value ?? brand.defaultDepositValue,
  });
  const readiness: ProposalReadinessItem[] = [
    {
      label: "Customer-safe content",
      state: sections.every((section) => isProposalCustomerFacingTextSafe(section.body))
        ? "ready"
        : "blocked",
      detail: "Customer packet excludes internal costs, margins, markup, commissions, and private notes.",
    },
    {
      label: "Line items",
      state: lineItems.length ? "ready" : "blocked",
      detail: lineItems.length
        ? `${lineItems.length} priced item${lineItems.length === 1 ? "" : "s"} ready for proposal.`
        : "Add priced line items before presenting the proposal.",
    },
    {
      label: "Optional upgrades",
      state: options.length ? "ready" : "attention",
      detail: options.length
        ? `${options.length} option${options.length === 1 ? "" : "s"} configured.`
        : "No saved proposal options yet; base proposal remains clear.",
    },
    {
      label: "Signature readiness",
      state: revision?.signature_status === "signed" ? "ready" : "attention",
      detail:
        revision?.signature_status === "signed"
          ? "Signature complete."
          : `${brand.signatureProviderLabel}; live signature requests are disabled.`,
    },
    {
      label: "Payment readiness",
      state: "attention",
      detail: `${brand.paymentProviderLabel}; online deposit collection is disabled.`,
    },
  ];
  const paymentSchedules = snapshot.proposalPaymentSchedules
    .filter((schedule) => schedule.proposal_revision_id === revision?.id)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((schedule) => ({
      label: schedule.milestone_name,
      amount: schedule.calculated_amount,
      trigger: schedule.due_trigger.replace(/_/g, " "),
      status: schedule.status.replace(/_/g, " "),
    }));
  const packet = buildProposalCustomerPacket({
    proposalNumber,
    title: estimate.title,
    companyName: brand.companyName,
    customerName: customerName(snapshot, estimate),
    propertyAddress: propertyAddress(snapshot, estimate),
    sections,
    lineItems,
    options,
    financials,
  });

  return {
    proposalNumber,
    templateName: revision?.title ?? `${brand.serviceLabel} template`,
    brand,
    revision,
    sections,
    options,
    financials,
    readiness,
    paymentSchedules,
    customerPacket: packet,
  };
}

export function buildProposalDocumentDraft({
  snapshot,
  estimate,
  lineItems,
  company,
  scope,
  inspection,
  photos,
}: {
  snapshot: CrmSnapshot;
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  company: CompanyRecord | undefined;
  scope: ScopeRecord | null;
  inspection: InspectionRecord | null;
  photos: JobPhotoRecord[];
}): DocumentInput {
  const model = buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope,
    inspection,
    photos,
  });

  return {
    company_id: estimate.company_id,
    customer_id: estimate.customer_id,
    lead_id: estimate.lead_id,
    job_id: null,
    estimate_id: estimate.id,
    inspection_id: inspection?.id ?? null,
    invoice_id: null,
    change_order_id: null,
    property_id: estimate.property_id ?? null,
    property_address: propertyAddress(snapshot, estimate),
    title: `${estimate.title} - Proposal Packet`,
    category: "proposal",
    status: "draft",
    template_key: isPaintingBrand(company)
      ? "ihc_painting_proposal_v2"
      : "weathertech_roofing_proposal_v2",
    file_url: null,
    body: model.customerPacket,
    tags: ["proposal", model.brand.shortName.toLowerCase(), "customer-facing"],
    requirement_level: "required",
    required_for: ["estimate_approval"],
  };
}

export function buildDepositInvoiceDraftFromProposal({
  estimate,
  model,
}: {
  estimate: EstimateRecord;
  model: ProposalWorkspaceModel;
}): {
  input: InvoiceInput;
  lineItems: InvoiceLineItemInput[];
} {
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const deposit = model.financials.depositAmount;

  return {
    input: {
      company_id: estimate.company_id,
      customer_id: estimate.customer_id,
      job_id: null,
      estimate_id: estimate.id,
      property_id: estimate.property_id ?? null,
      invoice_number: `DEP-${model.proposalNumber}`,
      title: `${estimate.title} deposit invoice`,
      status: "draft",
      issue_date: today,
      due_date: dueDate.toISOString().slice(0, 10),
      tax_rate: 0,
      discount_total: 0,
      amount_paid: 0,
      notes:
        "Deposit invoice draft created from the accepted proposal total. Online payment collection is disabled until provider activation.",
    },
    lineItems: [
      {
        description: `Deposit due for proposal ${model.proposalNumber}`,
        quantity: 1,
        unit_cost: deposit,
        taxable: false,
        sort_order: 0,
      },
    ],
  };
}

export function proposalCanConvertToJob({
  estimate,
  model,
  hasSignedAcceptance,
  hasDepositInvoice,
}: {
  estimate: EstimateRecord;
  model: ProposalWorkspaceModel;
  hasSignedAcceptance: boolean;
  hasDepositInvoice: boolean;
}) {
  if (estimate.status !== "approved") {
    return {
      ready: false,
      reason: "Estimate must be approved before job conversion.",
    };
  }

  if (model.financials.depositAmount > 0 && !hasDepositInvoice) {
    return {
      ready: false,
      reason: "Create a deposit invoice before job conversion.",
    };
  }

  if (!hasSignedAcceptance && model.revision?.requires_signature !== false) {
    return {
      ready: false,
      reason: "Signature readiness must be resolved before production handoff.",
    };
  }

  return {
    ready: true,
    reason: "Proposal is ready for the existing job handoff workflow.",
  };
}
