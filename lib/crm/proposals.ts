import {
  calculateCurrencyCents,
  calculateEstimateTotals,
  calculateExtendedAmountCents,
  calculatePercentageOfCents,
  normalizeDecimalToScale,
} from "./estimates";
import type {
  CompanyRecord,
  CrmSnapshot,
  CustomerRecord,
  DocumentInput,
  EstimateLineItemRecord,
  EstimateProposalOptionRecord,
  EstimateProposalRevisionRecord,
  EstimateProposalSectionRecord,
  EstimateRecord,
  InspectionRecord,
  InvoiceInput,
  InvoiceLineItemInput,
  JobPhotoRecord,
  LeadRecord,
  PropertyRecord,
  ProposalDepositType,
  ProposalOptionType,
  ProposalPriceEffectType,
  ProposalSectionType,
  ProposalTemplateRecord,
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
  customerNotes: string | null;
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

export type ProposalLineItemModel = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  total: number;
  sortOrder: number;
};

export type ProposalReadinessItem = {
  label: string;
  state: "ready" | "attention" | "blocked";
  detail: string;
};

export type ProposalWorkspaceModel = {
  proposalNumber: string;
  title: string;
  templateName: string;
  customerName: string;
  propertyAddress: string;
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
  lineItems: ProposalLineItemModel[];
  financials: ProposalFinancials;
  depositRule: {
    type: ProposalDepositType;
    value: number;
  };
  sourceDriftDetected: boolean;
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
  return calculateCurrencyCents(value ?? 0);
}

function fromCents(value: number) {
  return value / 100;
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

export function formatProposalCustomerFinding(finding: {
  area?: string | null;
  observation?: string | null;
  recommendation?: string | null;
}) {
  return [finding.area, finding.observation, finding.recommendation]
    .map((value) => scrubCustomerFacingText(value))
    .filter(Boolean)
    .join(": ");
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
      signatureProviderLabel: "Native customer electronic signature",
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
    signatureProviderLabel: "Native customer electronic signature",
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

export function getProposalTemplateOptionSelectionId(
  templateId: string,
  optionIndex: number,
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      templateId,
    ) ||
    !Number.isInteger(optionIndex) ||
    optionIndex < 0 ||
    optionIndex > 63
  ) {
    throw new Error("Proposal template option identity is invalid.");
  }
  return `template:${templateId.toLowerCase()}:${optionIndex}`;
}

function getProposalTemplate(
  snapshot: CrmSnapshot,
  estimate: EstimateRecord,
  revision: EstimateProposalRevisionRecord | null,
) {
  const activeTemplates = snapshot.proposalTemplates
    .filter(
      (template) =>
        template.company_id === estimate.company_id && template.status === "active",
    )
    .sort((left, right) => right.version_number - left.version_number);

  return revision?.template_id
    ? activeTemplates.find((template) => template.id === revision.template_id) ?? null
    : activeTemplates.find((template) => template.is_default) ?? null;
}

function templateRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function templateString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function templateNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function templateBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

const proposalOptionTypes = new Set<ProposalOptionType>([
  "add_on_upgrade",
  "replacement_alternative",
  "required_choice",
  "optional_choice",
]);
const proposalPriceEffectTypes = new Set<ProposalPriceEffectType>([
  "additive",
  "replace_base_amount",
  "full_alternate_total",
]);
const proposalSectionTypes = new Set<ProposalSectionType>([
  "cover",
  "customer",
  "property",
  "overview",
  "inspection_summary",
  "findings",
  "recommended_solution",
  "scope",
  "line_items",
  "base_proposal",
  "optional_upgrades",
  "alternatives",
  "allowances",
  "materials",
  "photos",
  "warranty",
  "exclusions",
  "payment_schedule",
  "financing",
  "terms",
  "customer_notes",
  "signature_acceptance",
  "attachments",
  "custom",
]);
const regeneratedProposalSectionTypes = new Set<ProposalSectionType>([
  "customer",
  "property",
  "overview",
  "inspection_summary",
  "findings",
  "recommended_solution",
  "scope",
  "line_items",
  "base_proposal",
  "materials",
  "photos",
  "warranty",
  "exclusions",
  "terms",
  "signature_acceptance",
]);

type FrozenProposalWorkspaceSnapshot = {
  companyId: string;
  companyName: string;
  brandName: string;
  brandPrimaryColor: string | null;
  brandAccentColor: string | null;
  proposalNumber: string;
  revisionNumber: number;
  title: string;
  issueDate: string;
  customerId: string;
  customerName: string;
  propertyId: string | null;
  propertyAddress: string;
  lineItems: ProposalLineItemModel[];
  sections: ProposalWorkspaceModel["sections"];
  options: ProposalOptionModel[];
  financials: ProposalFinancials;
  depositRule: {
    type: ProposalDepositType;
    value: number;
  };
};

function frozenOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseFrozenProposalWorkspaceSnapshot(
  value: unknown,
): FrozenProposalWorkspaceSnapshot | null {
  const snapshot = templateRecord(value);
  const frozenCompany = templateRecord(snapshot.company);
  const frozenProposal = templateRecord(snapshot.proposal);
  const frozenCustomer = templateRecord(snapshot.customer);
  const frozenProperty = templateRecord(snapshot.property);
  const frozenPricing = templateRecord(snapshot.pricing);
  const frozenDeposit = templateRecord(snapshot.deposit);
  const frozenLineItems = Array.isArray(snapshot.lineItems) ? snapshot.lineItems : [];
  const frozenSections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  const frozenOptions = Array.isArray(snapshot.options) ? snapshot.options : [];
  const companyId = templateString(frozenCompany.id);
  const companyName = templateString(frozenCompany.name);
  const proposalNumber = templateString(frozenProposal.number);
  const title = templateString(frozenProposal.title);
  const issueDate = templateString(frozenProposal.issueDate);
  const customerId = templateString(frozenCustomer.id);
  const customerName = templateString(frozenCustomer.name);
  const propertyAddress = templateString(frozenProperty.address);
  const revisionNumber = templateNumber(frozenProposal.revisionNumber);
  const depositType = templateString(frozenDeposit.type) as ProposalDepositType;
  const depositValue = templateNumber(frozenDeposit.value, Number.NaN);

  const lineItemModels = frozenLineItems.map((value) => {
    const item = templateRecord(value);
    return {
      id: templateString(item.id),
      name: templateString(item.name),
      description: frozenOptionalString(item.description),
      quantity: templateNumber(item.quantity, Number.NaN),
      unit: templateString(item.unit),
      total: templateNumber(item.total, Number.NaN),
      sortOrder: templateNumber(item.sortOrder, Number.NaN),
    };
  });
  const sectionModels = frozenSections.map((value) => {
    const section = templateRecord(value);
    return {
      key: templateString(section.sectionKey),
      title: templateString(section.title),
      body: templateString(section.body),
      customerVisible: true,
      required: templateBoolean(section.isRequired),
    };
  });
  const optionModels = frozenOptions.map((value) => {
    const option = templateRecord(value);
    const optionType = templateString(option.optionType) as ProposalOptionType;
    const priceEffectType = templateString(
      option.priceEffectType,
    ) as ProposalPriceEffectType;
    return {
      id: templateString(option.id),
      name: templateString(option.name),
      description: templateString(option.description),
      optionType: proposalOptionTypes.has(optionType)
        ? optionType
        : "optional_choice",
      optionGroupKey: frozenOptionalString(option.optionGroupKey),
      quantity: templateNumber(option.quantity, Number.NaN),
      unit: templateString(option.unit),
      price: templateNumber(option.price, Number.NaN),
      priceEffectType: proposalPriceEffectTypes.has(priceEffectType)
        ? priceEffectType
        : "additive",
      baseReplacementAmount: templateNumber(
        option.baseReplacementAmount,
        Number.NaN,
      ),
      customerVisible: true,
      selected: templateBoolean(option.selected),
      required: templateBoolean(option.required),
      recommended: templateBoolean(option.recommended),
      bestValue: templateBoolean(option.bestValue),
      warrantyEffect: frozenOptionalString(option.warrantyEffect),
      scopeDetails: frozenOptionalString(option.scopeDetails),
      customerNotes: frozenOptionalString(option.customerNotes),
      sourceLineItemId: null,
    } satisfies ProposalOptionModel;
  });
  const financials = {
    baseSubtotal: templateNumber(frozenPricing.baseSubtotal, Number.NaN),
    discountTotal: templateNumber(frozenPricing.discountTotal, Number.NaN),
    taxTotal: templateNumber(frozenPricing.taxTotal, Number.NaN),
    baseTotal: templateNumber(frozenPricing.baseTotal, Number.NaN),
    selectedUpgradesTotal: templateNumber(
      frozenPricing.selectedUpgradesTotal,
      Number.NaN,
    ),
    acceptedTotal: templateNumber(frozenPricing.acceptedTotal, Number.NaN),
    depositAmount: templateNumber(frozenDeposit.requiredAmount, Number.NaN),
    remainingBalance: templateNumber(frozenPricing.remainingBalance, Number.NaN),
  };
  const allNumbers = [
    revisionNumber,
    ...lineItemModels.flatMap((item) => [item.quantity, item.total, item.sortOrder]),
    ...optionModels.flatMap((option) => [
      option.quantity,
      option.price,
      option.baseReplacementAmount,
    ]),
    ...Object.values(financials),
    depositValue,
  ];

  if (
    snapshot.schemaVersion !== "native-proposal-v1" ||
    !companyId ||
    !companyName ||
    !proposalNumber ||
    !title ||
    !issueDate ||
    !customerId ||
    !customerName ||
    !propertyAddress ||
    !["none", "fixed", "percent"].includes(depositType) ||
    revisionNumber < 1 ||
    !lineItemModels.length ||
    !sectionModels.length ||
    lineItemModels.some((item) => !item.id || !item.name || !item.unit) ||
    sectionModels.some((section) => !section.key || !section.title || !section.body) ||
    optionModels.some((option) => !option.id || !option.name || !option.unit) ||
    allNumbers.some((number) => !Number.isFinite(number))
  ) {
    return null;
  }

  return {
    companyId,
    companyName,
    brandName: templateString(frozenCompany.brandName, companyName),
    brandPrimaryColor: frozenOptionalString(frozenCompany.primaryColor),
    brandAccentColor: frozenOptionalString(frozenCompany.accentColor),
    proposalNumber,
    revisionNumber,
    title,
    issueDate,
    customerId,
    customerName,
    propertyId: frozenOptionalString(frozenProperty.id),
    propertyAddress,
    lineItems: lineItemModels,
    sections: sectionModels,
    options: optionModels,
    financials,
    depositRule: {
      type: depositType,
      value: depositValue,
    },
  };
}

function finalizedProposalSourceHasDrift({
  revision,
  estimate,
  lineItems,
  company,
  customer,
  identity,
}: {
  revision: EstimateProposalRevisionRecord;
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  company: CompanyRecord | undefined;
  customer: CustomerRecord | null;
  identity: ReturnType<typeof proposalCustomerIdentity>;
}) {
  const source = templateRecord(revision.source_snapshot);
  const expectedLines = Array.isArray(source.sourceLineItems)
    ? source.sourceLineItems.map(templateRecord)
    : [];
  const currentLines = [...lineItems]
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    )
    .map((item) => ({
      id: item.id,
      name: scrubCustomerFacingText(item.name),
      description: frozenOptionalString(scrubCustomerFacingText(item.description)),
      quantity: item.quantity,
      unit: scrubCustomerFacingText(item.unit),
      total: item.total,
      sortOrder: item.sort_order,
      updatedAt: item.updated_at,
    }));
  const normalizedExpectedLines = expectedLines.map((item) => ({
    id: templateString(item.id),
    name: templateString(item.name),
    description: frozenOptionalString(item.description),
    quantity: templateNumber(item.quantity, Number.NaN),
    unit: templateString(item.unit),
    total: templateNumber(item.total, Number.NaN),
    sortOrder: templateNumber(item.sortOrder, Number.NaN),
    updatedAt: templateString(item.updatedAt),
  }));

  return (
    templateString(source.sourceFingerprint) !==
      (revision.finalization_operation_key ?? "") ||
    revision.customer_id !== estimate.customer_id ||
    revision.lead_id !== estimate.lead_id ||
    revision.property_id !== estimate.property_id ||
    templateString(source.sourceCompanyUpdatedAt) !== (company?.updated_at ?? "") ||
    templateString(source.sourceEstimateUpdatedAt) !== estimate.updated_at ||
    templateString(source.sourceCustomerId) !== (estimate.customer_id ?? "") ||
    templateString(source.sourceCustomerUpdatedAt) !== (customer?.updated_at ?? "") ||
    templateString(source.sourceCustomerName) !== identity.customerName ||
    frozenOptionalString(source.sourcePropertyId) !== identity.propertyId ||
    frozenOptionalString(source.sourcePropertyUpdatedAt) !== identity.propertyUpdatedAt ||
    templateString(source.sourcePropertyAddress) !== identity.propertyAddress ||
    JSON.stringify(normalizedExpectedLines) !== JSON.stringify(currentLines)
  );
}

function buildTemplateOptionModels(
  template: ProposalTemplateRecord | null,
  selectedIds: Set<string>,
): ProposalOptionModel[] {
  if (!template) return [];

  return template.default_options.slice(0, 64).map((value, index) => {
    const option = templateRecord(value);
    const id = getProposalTemplateOptionSelectionId(template.id, index);
    const optionTypeValue = templateString(option.type) as ProposalOptionType;
    const priceEffectValue = templateString(
      option.priceEffectType,
    ) as ProposalPriceEffectType;
    const required = templateBoolean(option.required);

    return {
      id,
      name: scrubCustomerFacingText(
        templateString(option.name, `Option ${index + 1}`),
      ),
      description: scrubCustomerFacingText(templateString(option.description)),
      optionType: proposalOptionTypes.has(optionTypeValue)
        ? optionTypeValue
        : "optional_choice",
      optionGroupKey: templateString(option.groupKey) || null,
      quantity: Math.max(0, templateNumber(option.quantity, 1)),
      unit: scrubCustomerFacingText(templateString(option.unit, "each")),
      price: Math.max(0, templateNumber(option.price)),
      priceEffectType: proposalPriceEffectTypes.has(priceEffectValue)
        ? priceEffectValue
        : "additive",
      baseReplacementAmount: Math.max(
        0,
        templateNumber(option.baseReplacementAmount),
      ),
      customerVisible: true,
      selected: required || selectedIds.has(id),
      required,
      recommended: templateBoolean(option.recommended),
      bestValue: templateBoolean(option.bestValue),
      warrantyEffect:
        scrubCustomerFacingText(templateString(option.warrantyEffect)) || null,
      scopeDetails:
        scrubCustomerFacingText(templateString(option.scopeDetails)) || null,
      customerNotes:
        scrubCustomerFacingText(templateString(option.customerNotes)) || null,
      sourceLineItemId: null,
    };
  });
}

function optionTotalCents(option: ProposalOptionModel) {
  return calculateExtendedAmountCents(
    option.price,
    Math.max(option.quantity, 0),
  );
}

export function calculateProposalOptionTotal(
  option: Pick<ProposalOptionModel, "price" | "quantity">,
) {
  return (
    calculateExtendedAmountCents(option.price, Math.max(option.quantity, 0)) / 100
  );
}

function buildOptionModel(
  option: EstimateProposalOptionRecord,
  selectedIds: Set<string>,
  hasExplicitSelection: boolean,
): ProposalOptionModel {
  return {
    id: option.id,
    name: scrubCustomerFacingText(option.name),
    description: scrubCustomerFacingText(option.description),
    optionType: option.option_type,
    optionGroupKey: option.option_group_key,
    quantity: option.quantity,
    unit: scrubCustomerFacingText(option.unit),
    price: option.price,
    priceEffectType: option.price_effect_type,
    baseReplacementAmount: option.base_replacement_amount,
    customerVisible: option.customer_visible,
    selected: hasExplicitSelection ? selectedIds.has(option.id) : option.selected,
    required: option.required,
    recommended: option.recommended,
    bestValue: option.best_value,
    warrantyEffect: scrubCustomerFacingText(option.warranty_effect) || null,
    scopeDetails: scrubCustomerFacingText(option.scope_details) || null,
    customerNotes: scrubCustomerFacingText(option.customer_notes) || null,
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
      continue;
    }

    acceptedTotalCents += priceCents;
  }

  acceptedTotalCents = Math.max(acceptedTotalCents, 0);
  const selectedUpgradesTotalCents = Math.max(
    acceptedTotalCents - baseTotalCents,
    0,
  );
  const normalizedDepositValue =
    depositType === "none" ? 0 : normalizeDecimalToScale(depositValue, 3);
  const depositAmountCents =
    depositType === "fixed"
      ? toCents(normalizedDepositValue)
      : depositType === "percent"
        ? calculatePercentageOfCents(
            acceptedTotalCents,
            Math.max(normalizedDepositValue, 0),
            3,
          )
        : 0;

  return {
    baseSubtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    baseTotal: fromCents(baseTotalCents),
    selectedUpgradesTotal: fromCents(selectedUpgradesTotalCents),
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

export function resolveProposalCustomerIdentity({
  estimate,
  customer,
  lead,
  property,
}: {
  estimate: Pick<
    EstimateRecord,
    "company_id" | "customer_id" | "property_id" | "location"
  >;
  customer: CustomerRecord | null;
  lead: LeadRecord | null;
  property: PropertyRecord | null;
}) {
  const exactProperty =
    property &&
    property.id === estimate.property_id &&
    property.company_id === estimate.company_id &&
    property.customer_id === estimate.customer_id
      ? property
      : null;
  const customerName =
    customer?.display_name?.trim() ||
    customer?.contact_name?.trim() ||
    lead?.contact_name?.trim() ||
    "Customer to confirm";
  const propertyAddress =
    exactProperty?.address?.trim() ||
    (estimate.property_id ? "" : estimate.location?.trim()) ||
    (estimate.property_id ? "" : customer?.property_address?.trim()) ||
    (estimate.property_id ? "" : lead?.property_address?.trim()) ||
    "Property address to confirm";

  return {
    customerName,
    propertyAddress,
    propertyId: exactProperty?.id ?? null,
    propertyUpdatedAt: exactProperty?.updated_at ?? null,
  };
}

function proposalCustomerIdentity(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  const customer = findCustomer(snapshot, estimate);
  const lead = findLead(snapshot, estimate);
  const property = estimate.property_id
    ? (snapshot.properties ?? []).find(
        (item) =>
          item.id === estimate.property_id &&
          item.company_id === estimate.company_id &&
          item.customer_id === estimate.customer_id,
      ) ?? null
    : null;

  return resolveProposalCustomerIdentity({ estimate, customer, lead, property });
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
  const identity = proposalCustomerIdentity(snapshot, estimate);
  const visibleFindings =
    inspection?.findings
      .filter((finding) => finding.customer_visible && finding.include_in_estimate)
      .map(formatProposalCustomerFinding)
      .filter(Boolean) ??
    [];
  const visiblePhotos = photos.filter((photo) => photo.is_customer_visible);

  return [
    {
      key: "customer",
      title: "Customer and property",
      body: `${identity.customerName}\n${identity.propertyAddress}`,
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
            .map((photo) =>
              scrubCustomerFacingText(
                photo.caption ?? photo.label ?? "Customer-visible project photo",
              ),
            )
            .filter(Boolean)
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

type CurrentProposalSectionContext = {
  scopeText: string;
  customerName: string;
  propertyAddress: string;
  visibleFindings: string[];
  photoLabels: string[];
  lineItemNames: string[];
  defaultTerms: string;
  defaultWarranty: string;
};

function buildCurrentProposalSectionContext({
  snapshot,
  estimate,
  lineItems,
  scope,
  inspection,
  photos,
  template,
}: {
  snapshot: CrmSnapshot;
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  scope: ScopeRecord | null;
  inspection: InspectionRecord | null;
  photos: JobPhotoRecord[];
  template: ProposalTemplateRecord | null;
}): CurrentProposalSectionContext {
  const scopeText =
    scrubCustomerFacingText(estimate.scope_of_work) ||
    scrubCustomerFacingText(scope?.scope_body);
  const visibleFindings =
    inspection?.findings
      .filter((finding) => finding.customer_visible && finding.include_in_estimate)
      .map(formatProposalCustomerFinding)
      .filter(Boolean) ?? [];
  const photoLabels = photos
    .filter((photo) => photo.is_customer_visible)
    .map((photo) => scrubCustomerFacingText(photo.caption ?? photo.label))
    .filter(Boolean);
  const identity = proposalCustomerIdentity(snapshot, estimate);
  return {
    scopeText,
    customerName: identity.customerName,
    propertyAddress: identity.propertyAddress,
    visibleFindings,
    photoLabels,
    lineItemNames: lineItems
      .map((item) => scrubCustomerFacingText(item.name))
      .filter(Boolean),
    defaultTerms: scrubCustomerFacingText(template?.default_terms),
    defaultWarranty: scrubCustomerFacingText(template?.default_warranty),
  };
}

function resolveCurrentProposalSectionBody(
  sectionKey: string,
  sectionType: ProposalSectionType,
  context: CurrentProposalSectionContext,
) {
  if (sectionType === "customer") {
    return `${context.customerName}\n${context.propertyAddress}`;
  }
  if (sectionType === "property") return context.propertyAddress;
  if (sectionType === "findings" || sectionType === "inspection_summary") {
    return context.visibleFindings.join("\n");
  }
  if (sectionType === "photos") return context.photoLabels.join("\n");
  if (sectionType === "warranty") return context.defaultWarranty;
  if (sectionType === "terms" || sectionType === "exclusions") {
    return context.defaultTerms;
  }
  if (sectionType === "materials" || sectionType === "line_items") {
    return context.lineItemNames.join("\n");
  }
  if (sectionType === "signature_acceptance") {
    return "Electronic acceptance applies only to this exact finalized revision, selected options, accepted total, and terms.";
  }
  if (sectionKey === "walkthrough") {
    return "A final customer walkthrough will confirm the completed approved scope and any documented follow-up items.";
  }
  return context.scopeText;
}

function buildRevisionSections({
  sourceSections,
  context,
}: {
  sourceSections: EstimateProposalSectionRecord[];
  context: CurrentProposalSectionContext;
}) {
  return sourceSections
    .filter((section) => section.customer_visible)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    )
    .map((section) => ({
      key: section.section_key,
      title: scrubCustomerFacingText(section.title),
      body: regeneratedProposalSectionTypes.has(section.section_type)
        ? resolveCurrentProposalSectionBody(
            section.section_key,
            section.section_type,
            context,
          )
        : scrubCustomerFacingText(section.body),
      customerVisible: true,
      required: section.is_required,
    }));
}

function buildTemplateSections({
  template,
  snapshot,
  estimate,
  lineItems,
  scope,
  inspection,
  photos,
}: {
  template: ProposalTemplateRecord | null;
  snapshot: CrmSnapshot;
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  scope: ScopeRecord | null;
  inspection: InspectionRecord | null;
  photos: JobPhotoRecord[];
}) {
  if (!template) {
    return buildDefaultSections({ snapshot, estimate, scope, inspection, photos });
  }

  const context = buildCurrentProposalSectionContext({
    snapshot,
    estimate,
    lineItems,
    scope,
    inspection,
    photos,
    template,
  });

  return template.default_sections.map((value, index) => {
    const section = templateRecord(value);
    const key = templateString(section.key, `section-${index + 1}`);
    const requestedType = templateString(section.type) as ProposalSectionType;
    const type = proposalSectionTypes.has(requestedType) ? requestedType : "custom";

    return {
      key,
      title: scrubCustomerFacingText(
        templateString(section.title, `Proposal section ${index + 1}`),
      ),
      body: resolveCurrentProposalSectionBody(key, type, context),
      customerVisible: true,
      required: templateBoolean(section.required),
    };
  });
}

export function buildProposalCustomerPacket(model: {
  proposalNumber: string;
  title: string;
  companyName: string;
  customerName: string;
  propertyAddress: string;
  sections: ProposalWorkspaceModel["sections"];
  lineItems: ProposalLineItemModel[];
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
    ...model.lineItems.flatMap((item) => [
      `- ${item.name}: ${item.quantity} ${item.unit} - ${formatProposalMoney(item.total)}`,
      ...(item.description ? [`  ${item.description}`] : []),
    ]),
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
    "This proposal becomes accepted only after the intended customer reviews this exact finalized revision, confirms the selected options and total, acknowledges the terms and electronic-record disclosure, and signs electronically. Any required deposit must be recorded before the work becomes a sold job.",
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
  depositType,
  depositValue,
}: {
  snapshot: CrmSnapshot;
  estimate: EstimateRecord;
  lineItems: EstimateLineItemRecord[];
  company: CompanyRecord | undefined;
  scope: ScopeRecord | null;
  inspection: InspectionRecord | null;
  photos: JobPhotoRecord[];
  selectedOptionIds?: Iterable<string>;
  depositType?: ProposalDepositType;
  depositValue?: number;
}): ProposalWorkspaceModel {
  const revision =
    snapshot.proposalRevisions
      .filter((item) => item.estimate_id === estimate.id)
      .sort((left, right) => right.revision_number - left.revision_number)[0] ?? null;
  const isViewingFinalizedSnapshot = Boolean(
    revision?.finalized_at && selectedOptionIds === undefined,
  );
  const parsedFrozenSnapshot = isViewingFinalizedSnapshot
    ? parseFrozenProposalWorkspaceSnapshot(revision?.customer_snapshot)
    : null;
  const frozenSnapshot =
    parsedFrozenSnapshot &&
    revision &&
    parsedFrozenSnapshot.companyId === revision.company_id &&
    parsedFrozenSnapshot.customerId === revision.customer_id &&
    parsedFrozenSnapshot.propertyId === revision.property_id &&
    parsedFrozenSnapshot.proposalNumber === revision.proposal_number &&
    parsedFrozenSnapshot.revisionNumber === revision.revision_number
      ? parsedFrozenSnapshot
      : null;
  const frozenSnapshotUnavailable = isViewingFinalizedSnapshot && !frozenSnapshot;
  const liveBrand = getProposalBranding(company);
  const brand: ProposalBranding = frozenSnapshot
    ? {
        ...liveBrand,
        companyName: frozenSnapshot.brandName || frozenSnapshot.companyName,
        primaryColor: frozenSnapshot.brandPrimaryColor ?? liveBrand.primaryColor,
        accentColor: frozenSnapshot.brandAccentColor ?? liveBrand.accentColor,
      }
    : liveBrand;
  const proposalNumber =
    frozenSnapshot?.proposalNumber ??
    revision?.proposal_number ??
    buildProposalNumber(estimate, company);
  const proposalTitle = frozenSnapshotUnavailable
    ? scrubCustomerFacingText(revision?.title) || "Frozen proposal unavailable"
    : frozenSnapshot?.title ?? scrubCustomerFacingText(revision?.title ?? estimate.title);
  const template = getProposalTemplate(snapshot, estimate, revision);
  const selectedIds = getSelectedOptionIds(selectedOptionIds);
  const hasExplicitSelection = selectedOptionIds !== undefined;
  const persistedOptions = snapshot.proposalOptions.filter(
    (option) => option.proposal_revision_id === revision?.id,
  ).sort(
    (left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id),
  );
  const options = frozenSnapshot
    ? frozenSnapshot.options
    : frozenSnapshotUnavailable
      ? []
      : persistedOptions.length
        ? persistedOptions.map((option) =>
            buildOptionModel(option, selectedIds, hasExplicitSelection),
          )
        : buildTemplateOptionModels(template, selectedIds);
  const currentSectionContext = buildCurrentProposalSectionContext({
    snapshot,
    estimate,
    lineItems,
    scope,
    inspection,
    photos,
    template,
  });
  const sourceSectionsFromRevision = revision
    ? snapshot.proposalSections.filter(
        (section) => section.proposal_revision_id === revision.id,
      )
    : [];
  const sectionsFromRevision = revision
    ? buildRevisionSections({
        sourceSections: sourceSectionsFromRevision,
        context: currentSectionContext,
      })
    : [];
  const currentTemplateSections = buildTemplateSections({
    template,
    snapshot,
    estimate,
    lineItems,
    scope,
    inspection,
    photos,
  });
  const sections = frozenSnapshot
    ? frozenSnapshot.sections
    : frozenSnapshotUnavailable
      ? []
      : sourceSectionsFromRevision.length
        ? sectionsFromRevision
        : currentTemplateSections;
  const currentLineItemModels = [...lineItems]
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    )
    .map((item) => ({
      id: item.id,
      name: scrubCustomerFacingText(item.name),
      description: frozenOptionalString(scrubCustomerFacingText(item.description)),
      quantity: item.quantity,
      unit: scrubCustomerFacingText(item.unit),
      total: item.total,
      sortOrder: item.sort_order,
    }));
  const proposalLineItems = frozenSnapshot
    ? frozenSnapshot.lineItems
    : frozenSnapshotUnavailable
      ? []
      : currentLineItemModels;
  const activeDepositType =
    depositType ?? revision?.deposit_type ?? brand.defaultDepositType;
  const requestedDepositValue =
    depositValue ?? revision?.deposit_value ?? brand.defaultDepositValue;
  const activeDepositValue =
    activeDepositType === "none"
      ? 0
      : normalizeDecimalToScale(requestedDepositValue, 3);
  const calculatedFinancials = calculateProposalFinancials({
    estimate,
    lineItems,
    options,
    depositType: activeDepositType,
    depositValue: activeDepositValue,
  });
  const financials: ProposalFinancials = frozenSnapshot
    ? frozenSnapshot.financials
    : revision?.finalized_at
    ? {
        baseSubtotal: revision.base_subtotal,
        discountTotal: revision.discount_total,
        taxTotal: revision.tax_total,
        baseTotal: revision.base_total,
        selectedUpgradesTotal: revision.selected_upgrades_total,
        acceptedTotal: revision.accepted_total,
        depositAmount: revision.deposit_amount,
        remainingBalance: revision.remaining_balance,
      }
    : calculatedFinancials;
  const identity = proposalCustomerIdentity(snapshot, estimate);
  const displayCustomerName = frozenSnapshotUnavailable
    ? "Frozen customer evidence unavailable"
    : frozenSnapshot?.customerName ?? identity.customerName;
  const displayPropertyAddress = frozenSnapshotUnavailable
    ? "Frozen property evidence unavailable"
    : frozenSnapshot?.propertyAddress ?? identity.propertyAddress;
  const sourceDriftDetected = Boolean(
    frozenSnapshotUnavailable ||
      (isViewingFinalizedSnapshot &&
        frozenSnapshot &&
        revision &&
        finalizedProposalSourceHasDrift({
          revision,
          estimate,
          lineItems,
          company,
          customer: findCustomer(snapshot, estimate),
          identity,
        })),
  );
  const customerAcceptanceComplete = Boolean(
    revision?.signature_status === "signed" ||
      revision?.status === "accepted" ||
      revision?.status === "converted_to_job",
  );
  const sourceDriftBlocksDelivery =
    sourceDriftDetected && !customerAcceptanceComplete;
  const readiness: ProposalReadinessItem[] = [
    ...(isViewingFinalizedSnapshot
      ? [
          {
            label: "Finalized source integrity",
            state: sourceDriftDetected
              ? customerAcceptanceComplete
                ? ("attention" as const)
                : ("blocked" as const)
              : ("ready" as const),
            detail: frozenSnapshotUnavailable
              ? "The immutable customer snapshot is unavailable. Customer delivery is blocked."
              : sourceDriftDetected
                ? customerAcceptanceComplete
                  ? "Source records changed after acceptance. The exact signed proposal remains immutable and governs the deposit and sold-job handoff."
                  : "Source records changed after finalization. Start and finalize a new revision before customer delivery."
                : "This view is rendered entirely from the immutable finalized customer snapshot.",
          },
        ]
      : []),
    {
      label: "Customer and property",
      state:
        frozenSnapshotUnavailable ||
        !estimate.customer_id ||
        displayCustomerName === "Customer to confirm" ||
        displayPropertyAddress === "Property address to confirm"
          ? "blocked"
          : "ready",
      detail: `${displayCustomerName} · ${displayPropertyAddress}`,
    },
    {
      label: "Customer-safe content",
      state: proposalTitle &&
        sections.length > 0 &&
        sections.every(
          (section) =>
            section.title &&
            section.body &&
            isProposalCustomerFacingTextSafe(section.title) &&
            isProposalCustomerFacingTextSafe(section.body),
        ) &&
        options.every(
          (option) =>
            option.name &&
            option.unit &&
            [
              option.name,
              option.description,
              option.unit,
              option.scopeDetails,
              option.warrantyEffect,
              option.customerNotes,
            ].every((value) => isProposalCustomerFacingTextSafe(value)),
        ) &&
        proposalLineItems.every(
          (item) =>
            item.name &&
            item.unit &&
            [item.name, item.description, item.unit].every((value) =>
              isProposalCustomerFacingTextSafe(value),
            ),
        )
        ? "ready"
        : "blocked",
      detail: "Customer packet excludes internal costs, margins, markup, commissions, and private notes.",
    },
    {
      label: "Line items",
      state: proposalLineItems.length ? "ready" : "blocked",
      detail: proposalLineItems.length
        ? `${proposalLineItems.length} priced item${proposalLineItems.length === 1 ? "" : "s"} ready for proposal.`
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
      state: revision?.signature_status === "signed"
          ? "ready"
          : sourceDriftBlocksDelivery
            ? "blocked"
            : "attention",
      detail:
        revision?.signature_status === "signed"
          ? "Signature complete."
          : sourceDriftBlocksDelivery
            ? "Customer delivery is blocked until a new immutable revision is finalized from the current source records."
          : revision?.immutable_after_at
            ? `${brand.signatureProviderLabel} is ready for an owner-approved delivery request.`
            : "Finalize an immutable customer-safe revision before requesting an electronic signature.",
    },
    {
      label: "Payment readiness",
      state: "attention",
      detail: `${brand.paymentProviderLabel}; online deposit collection is disabled.`,
    },
  ];
  const paymentSchedules = snapshot.proposalPaymentSchedules
    .filter((schedule) => schedule.proposal_revision_id === revision?.id)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id),
    )
    .map((schedule) => ({
      label: schedule.milestone_name,
      amount: schedule.calculated_amount,
      trigger: schedule.due_trigger.replace(/_/g, " "),
      status: schedule.status.replace(/_/g, " "),
    }));
  const packet = buildProposalCustomerPacket({
    proposalNumber,
    title: proposalTitle,
    companyName: brand.companyName,
    customerName: displayCustomerName,
    propertyAddress: displayPropertyAddress,
    sections,
    lineItems: proposalLineItems,
    options,
    financials,
  });

  return {
    proposalNumber,
    title: proposalTitle,
    templateName: frozenSnapshot
      ? `Finalized revision ${frozenSnapshot.revisionNumber}`
      : frozenSnapshotUnavailable
        ? "Finalized snapshot unavailable"
        : template?.name ?? revision?.title ?? `${brand.serviceLabel} template`,
    customerName: displayCustomerName,
    propertyAddress: displayPropertyAddress,
    brand,
    revision,
    sections,
    options,
    lineItems: proposalLineItems,
    financials,
    depositRule:
      frozenSnapshot?.depositRule ?? {
        type: activeDepositType,
        value: activeDepositType === "none" ? 0 : activeDepositValue,
      },
    sourceDriftDetected,
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
    property_address: model.propertyAddress,
    title: `${model.title} - Proposal Packet`,
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
        "Deposit invoice draft created from the finalized proposal total. Record the customer's posted deposit through the existing manual payment workflow before sold-job conversion.",
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
  hasSufficientPostedDeposit,
}: {
  estimate: EstimateRecord;
  model: ProposalWorkspaceModel;
  hasSignedAcceptance: boolean;
  hasSufficientPostedDeposit: boolean;
}) {
  if (estimate.status !== "approved") {
    return {
      ready: false,
      reason: "Estimate must be approved before job conversion.",
    };
  }

  if (!model.revision?.immutable_after_at || !model.revision.finalized_document_id) {
    return {
      ready: false,
      reason: "Finalize the immutable proposal artifact before production handoff.",
    };
  }

  if (!hasSignedAcceptance && model.revision?.requires_signature !== false) {
    return {
      ready: false,
      reason: "Signature readiness must be resolved before production handoff.",
    };
  }

  if (
    model.revision.requires_deposit_before_job !== false &&
    model.financials.depositAmount > 0 &&
    !hasSufficientPostedDeposit
  ) {
    return {
      ready: false,
      reason: "Record the required posted deposit before sold-job conversion.",
    };
  }

  return {
    ready: true,
    reason: "Proposal is ready for the existing job handoff workflow.",
  };
}
