import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  calculateEstimateTotals,
  normalizeDecimalToScale,
} from "../../../../lib/crm/estimates";
import {
  buildProposalNumber,
  formatProposalCustomerFinding,
  getProposalBranding,
  resolveProposalCustomerIdentity,
  scrubCustomerFacingText,
} from "../../../../lib/crm/proposals";
import type {
  EstimateProposalOptionRecord,
  EstimateProposalSectionRecord,
  ProposalOptionType,
  ProposalPriceEffectType,
  ProposalSectionType,
} from "../../../../lib/crm/types";
import {
  buildFinalizedProposalPdfAttachment,
  createServiceSupabaseClient,
  hashProposalDocumentContent,
} from "../../../../lib/googleWorkspace/serverClient";
import {
  getExistingFinalizedProposalStatus,
  getFailedCanonicalSourceRead,
  isExactRegisteredProposalArtifact,
  type ExpectedProposalArtifact,
} from "../../../../lib/proposal-signing/finalizationSafety";
import { findUnsupportedDeterministicPdfGlyph } from "../../../../lib/pdf/deterministicUnicodePdf";
import { getSupabaseServerClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECTION_TYPES = new Set<ProposalSectionType>([
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
const OPTION_TYPES = new Set<ProposalOptionType>([
  "add_on_upgrade",
  "replacement_alternative",
  "required_choice",
  "optional_choice",
]);
const PRICE_EFFECT_TYPES = new Set<ProposalPriceEffectType>([
  "additive",
  "replace_base_amount",
  "full_alternate_total",
]);

type FinalizeBody = {
  estimateId?: unknown;
  selectedOptionIds?: unknown;
  depositType?: unknown;
  depositValue?: unknown;
};

type CanonicalProposalSnapshot = {
  schemaVersion: "native-proposal-v1";
  companyId: string;
  companyName: string;
  proposalRevisionId: string;
  proposalNumber: string;
  revisionNumber: number;
  title: string;
  issueDate: string;
  customerName: string;
  propertyAddress: string | null;
  baseSubtotal: number;
  discountTotal: number;
  taxTotal: number;
  feeTotal: number;
  baseTotal: number;
  selectedUpgradesTotal: number;
  acceptedTotal: number;
  depositRequired: boolean;
  depositType: "none" | "fixed" | "percent" | "custom_schedule";
  depositValue: number;
  requiredDepositAmount: number;
  remainingBalance: number;
  terms: string;
  selectedOptionIds: string[];
  lineItems: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    total: number;
    sortOrder: number;
  }>;
  sections: Array<{
    id: string;
    title: string;
    body: string;
    sortOrder: number;
  }>;
  options: Array<{
    id: string;
    name: string;
    description: string | null;
    selected: boolean;
    quantity: number;
    unit: string;
    price: number;
    priceEffectType: "additive" | "replace_base_amount" | "full_alternate_total";
    baseReplacementAmount: number;
    scopeDetails: string | null;
    warrantyEffect: string | null;
    customerNotes: string | null;
    sortOrder: number;
  }>;
};

type PreparedSection = {
  sourceId: string;
  sectionKey: string;
  title: string;
  sectionType: ProposalSectionType;
  body: string;
  customerVisible: true;
  isRequired: boolean;
  sortOrder: number;
  sourceType: string | null;
  sourceRecordId: string | null;
};

type PreparedOption = {
  sourceId: string;
  optionType: ProposalOptionType;
  optionGroupKey: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  price: number;
  priceEffectType: ProposalPriceEffectType;
  baseReplacementAmount: number;
  customerVisible: true;
  selected: boolean;
  required: boolean;
  recommended: boolean;
  bestValue: boolean;
  dependencySourceId: string | null;
  conflictingSourceId: string | null;
  warrantyEffect: string | null;
  scopeDetails: string | null;
  customerNotes: string | null;
  sourceLineItemId: string | null;
  sourceFindingId: string | null;
  sourcePhotoId: string | null;
  sortOrder: number;
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getJsonBody(request: NextRequest): Promise<FinalizeBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as FinalizeBody)
      : {};
  } catch {
    return {};
  }
}

function getUuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value)
    ? value.toLowerCase()
    : null;
}

function getSelectedOptionIds(value: unknown) {
  if (!Array.isArray(value) || value.length > 64) {
    return null;
  }

  const values = value.map((item) => {
    const uuid = getUuid(item);
    if (uuid) {
      return uuid;
    }
    if (typeof item !== "string") {
      return null;
    }
    const match = /^template:([0-9a-f-]{36}):(0|[1-5]?\d|6[0-3])$/i.exec(item);
    const templateId = getUuid(match?.[1]);
    return templateId && match
      ? `template:${templateId}:${Number.parseInt(match[2], 10)}`
      : null;
  });
  return values.some((item) => item === null)
    ? null
    : [...new Set(values as string[])].sort();
}

function getRequestedDepositRule(body: FinalizeBody) {
  if (
    body.depositType !== "none" &&
    body.depositType !== "fixed" &&
    body.depositType !== "percent"
  ) {
    return null;
  }
  if (typeof body.depositValue !== "number" || !Number.isFinite(body.depositValue)) {
    return null;
  }
  const value = normalizeDecimalToScale(body.depositValue, 3);
  if (
    value < 0 ||
    value > 999_999_999.999 ||
    (body.depositType === "none" && value !== 0) ||
    (body.depositType !== "none" && value <= 0) ||
    (body.depositType === "percent" && value > 100)
  ) {
    return null;
  }
  return { type: body.depositType, value } as const;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function deterministicUuid(seed: string) {
  const digest = crypto.createHash("sha256").update(seed, "utf8").digest("hex");
  const variant = ((Number.parseInt(digest[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join("-");
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function getOptionalString(value: unknown) {
  const normalized = getString(value);
  return normalized || null;
}

function getNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getSectionType(value: unknown): ProposalSectionType {
  const normalized = getString(value) as ProposalSectionType;
  return SECTION_TYPES.has(normalized) ? normalized : "custom";
}

function getOptionType(value: unknown): ProposalOptionType {
  const normalized = getString(value) as ProposalOptionType;
  return OPTION_TYPES.has(normalized) ? normalized : "optional_choice";
}

function getPriceEffectType(value: unknown): ProposalPriceEffectType {
  const normalized = getString(value) as ProposalPriceEffectType;
  return PRICE_EFFECT_TYPES.has(normalized) ? normalized : "additive";
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getDefaultSectionBody({
  sectionKey,
  sectionType,
  estimate,
  scope,
  inspection,
  customerName,
  propertyAddress,
  lineItemNames,
  photoLabels,
  defaultTerms,
  defaultWarranty,
}: {
  sectionKey: string;
  sectionType: ProposalSectionType;
  estimate: Record<string, unknown>;
  scope: Record<string, unknown> | null;
  inspection: Record<string, unknown> | null;
  customerName: string;
  propertyAddress: string;
  lineItemNames: string[];
  photoLabels: string[];
  defaultTerms: string;
  defaultWarranty: string;
}) {
  const scopeText =
    scrubCustomerFacingText(getString(estimate.scope_of_work)) ||
    scrubCustomerFacingText(getString(scope?.scope_body));
  const visibleFindings = getArray(inspection?.findings)
    .map(getRecord)
    .filter(
      (finding) =>
        getBoolean(finding.customer_visible) && getBoolean(finding.include_in_estimate),
    )
    .map((finding) =>
      formatProposalCustomerFinding({
        area: getString(finding.area),
        observation: getString(finding.observation),
        recommendation: getString(finding.recommendation),
      }),
    )
    .filter(Boolean);

  if (sectionType === "customer") {
    return `${customerName}\n${propertyAddress}`;
  }
  if (sectionType === "property") {
    return propertyAddress;
  }
  if (sectionType === "findings" || sectionType === "inspection_summary") {
    return visibleFindings.join("\n");
  }
  if (sectionType === "photos") {
    return photoLabels.join("\n");
  }
  if (sectionType === "warranty") {
    return scrubCustomerFacingText(defaultWarranty);
  }
  if (sectionType === "terms" || sectionType === "exclusions") {
    return scrubCustomerFacingText(defaultTerms);
  }
  if (sectionType === "materials" || sectionType === "line_items") {
    return lineItemNames.join("\n");
  }
  if (sectionType === "signature_acceptance") {
    return "Electronic acceptance applies only to this exact finalized revision, selected options, accepted total, and terms.";
  }
  if (sectionKey === "walkthrough") {
    return "A final customer walkthrough will confirm the completed approved scope and any documented follow-up items.";
  }
  return scopeText;
}

function prepareSections({
  sourceSections,
  templateSections,
  context,
}: {
  sourceSections: EstimateProposalSectionRecord[];
  templateSections: unknown[];
  context: Parameters<typeof getDefaultSectionBody>[0];
}): PreparedSection[] {
  if (sourceSections.length) {
    const regeneratedSectionTypes = new Set<ProposalSectionType>([
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
    return sourceSections
      .filter((section) => section.customer_visible)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.id.localeCompare(right.id),
      )
      .map((section) => {
        const regeneratedBody = regeneratedSectionTypes.has(section.section_type)
          ? getDefaultSectionBody({
              ...context,
              sectionKey: section.section_key,
              sectionType: section.section_type,
            })
          : section.body;
        return {
          sourceId: section.id,
          sectionKey: section.section_key,
          title: scrubCustomerFacingText(section.title),
          sectionType: section.section_type,
          body: scrubCustomerFacingText(regeneratedBody),
          customerVisible: true,
          isRequired: section.is_required,
          sortOrder: section.sort_order,
          sourceType: section.source_type,
          sourceRecordId: section.source_record_id,
        };
      });
  }

  return templateSections.map((value, index) => {
    const section = getRecord(value);
    const sectionKey = getString(section.key, `section-${index + 1}`);
    const sectionType = getSectionType(section.type);
    return {
      sourceId: `template-section-${index}`,
      sectionKey,
      title: scrubCustomerFacingText(
        getString(section.title, `Proposal section ${index + 1}`),
      ),
      sectionType,
      body: getDefaultSectionBody({ ...context, sectionKey, sectionType }),
      customerVisible: true,
      isRequired: getBoolean(section.required),
      sortOrder: index,
      sourceType: "proposal_template",
      sourceRecordId: null,
    };
  });
}

function prepareOptions({
  sourceOptions,
  templateOptions,
  templateId,
  selectedIds,
}: {
  sourceOptions: EstimateProposalOptionRecord[];
  templateOptions: unknown[];
  templateId: string;
  selectedIds: Set<string>;
}): PreparedOption[] {
  if (sourceOptions.length) {
    return sourceOptions
      .filter((option) => option.customer_visible)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.id.localeCompare(right.id),
      )
      .map((option) => ({
        sourceId: option.id,
        optionType: option.option_type,
        optionGroupKey: option.option_group_key,
        name: scrubCustomerFacingText(option.name),
        description: getOptionalString(scrubCustomerFacingText(option.description)),
        quantity: option.quantity,
        unit: scrubCustomerFacingText(option.unit),
        price: option.price,
        priceEffectType: option.price_effect_type,
        baseReplacementAmount: option.base_replacement_amount,
        customerVisible: true,
        selected: option.required || selectedIds.has(option.id),
        required: option.required,
        recommended: option.recommended,
        bestValue: option.best_value,
        dependencySourceId: option.dependency_option_id,
        conflictingSourceId: option.conflicting_option_id,
        warrantyEffect: getOptionalString(scrubCustomerFacingText(option.warranty_effect)),
        scopeDetails: getOptionalString(scrubCustomerFacingText(option.scope_details)),
        customerNotes: getOptionalString(scrubCustomerFacingText(option.customer_notes)),
        sourceLineItemId: option.source_line_item_id,
        sourceFindingId: option.source_finding_id,
        sourcePhotoId: option.source_photo_id,
        sortOrder: option.sort_order,
      }));
  }

  return templateOptions.map((value, index) => {
    const option = getRecord(value);
    const optionType = getOptionType(option.type);
    const name = scrubCustomerFacingText(
      getString(option.name, `Option ${index + 1}`),
    );
    return {
      sourceId: `template:${templateId.toLowerCase()}:${index}`,
      optionType,
      optionGroupKey: getOptionalString(option.groupKey),
      name,
      description: getOptionalString(scrubCustomerFacingText(getString(option.description))),
      quantity: Math.max(0, getNumber(option.quantity, 1)),
      unit: scrubCustomerFacingText(getString(option.unit, "each")),
      price: Math.max(0, getNumber(option.price)),
      priceEffectType: getPriceEffectType(option.priceEffectType),
      baseReplacementAmount: Math.max(0, getNumber(option.baseReplacementAmount)),
      customerVisible: true,
      selected: getBoolean(option.required),
      required: getBoolean(option.required),
      recommended: getBoolean(option.recommended),
      bestValue: getBoolean(option.bestValue),
      dependencySourceId: null,
      conflictingSourceId: null,
      warrantyEffect: getOptionalString(scrubCustomerFacingText(getString(option.warrantyEffect))),
      scopeDetails: getOptionalString(scrubCustomerFacingText(getString(option.scopeDetails))),
      customerNotes: getOptionalString(scrubCustomerFacingText(getString(option.customerNotes))),
      sourceLineItemId: null,
      sourceFindingId: null,
      sourcePhotoId: null,
      sortOrder: index,
    };
  });
}

function validatePreparedContent(
  sections: PreparedSection[],
  options: PreparedOption[],
  requestedSelectedIds: string[],
) {
  if (!sections.length || sections.some((section) => !section.title || !section.body)) {
    return "Complete every customer-visible proposal section before finalizing.";
  }
  if (options.some((option) => !option.name || !option.unit || option.price < 0)) {
    return "Complete every customer-visible proposal option before finalizing.";
  }

  const optionBySourceId = new Map(options.map((option) => [option.sourceId, option]));
  const unknownSelections = requestedSelectedIds.filter((id) => !optionBySourceId.has(id));
  if (unknownSelections.length) {
    return "The selected proposal options changed. Reload the estimate before finalizing.";
  }

  for (const option of options.filter((item) => item.selected)) {
    if (option.dependencySourceId && !optionBySourceId.get(option.dependencySourceId)?.selected) {
      return `Select the required option dependency before choosing ${option.name}.`;
    }
    if (option.conflictingSourceId && optionBySourceId.get(option.conflictingSourceId)?.selected) {
      return `${option.name} conflicts with another selected option.`;
    }
  }

  const requiredGroups = new Set(
    options
      .filter((option) => option.optionType === "required_choice" && option.optionGroupKey)
      .map((option) => option.optionGroupKey as string),
  );
  for (const group of requiredGroups) {
    if (options.filter((option) => option.optionGroupKey === group && option.selected).length !== 1) {
      return "Choose exactly one option in each required proposal option group.";
    }
  }

  if (options.filter((option) => option.selected && option.priceEffectType === "full_alternate_total").length > 1) {
    return "Choose only one full alternate proposal total.";
  }
  return null;
}

function proposalOptionSelectionKey(option: {
  optionType: ProposalOptionType;
  optionGroupKey: string | null;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  priceEffectType: ProposalPriceEffectType;
  baseReplacementAmount: number;
  sortOrder: number;
}) {
  return stableJson({
    optionType: option.optionType,
    optionGroupKey: option.optionGroupKey,
    name: option.name,
    quantity: option.quantity,
    unit: option.unit,
    price: option.price,
    priceEffectType: option.priceEffectType,
    baseReplacementAmount: option.baseReplacementAmount,
    sortOrder: option.sortOrder,
  });
}

function parseCanonicalSnapshot(value: unknown): CanonicalProposalSnapshot | null {
  const snapshot = getRecord(value);
  const company = getRecord(snapshot.company);
  const proposal = getRecord(snapshot.proposal);
  const customer = getRecord(snapshot.customer);
  const property = getRecord(snapshot.property);
  const pricing = getRecord(snapshot.pricing);
  const deposit = getRecord(snapshot.deposit);
  const lineItems = getArray(snapshot.lineItems).map(getRecord);
  const sections = getArray(snapshot.sections).map(getRecord);
  const options = getArray(snapshot.options).map(getRecord);
  const parsed: CanonicalProposalSnapshot = {
    schemaVersion: "native-proposal-v1",
    companyId: getString(company.id),
    companyName: getString(company.name),
    proposalRevisionId: getString(proposal.id),
    proposalNumber: getString(proposal.number),
    revisionNumber: getNumber(proposal.revisionNumber),
    title: getString(proposal.title),
    issueDate: getString(proposal.issueDate),
    customerName: getString(customer.name),
    propertyAddress: getOptionalString(property.address),
    baseSubtotal: getNumber(pricing.baseSubtotal),
    discountTotal: getNumber(pricing.discountTotal),
    taxTotal: getNumber(pricing.taxTotal),
    feeTotal: getNumber(pricing.feeTotal),
    baseTotal: getNumber(pricing.baseTotal),
    selectedUpgradesTotal: getNumber(pricing.selectedUpgradesTotal),
    acceptedTotal: getNumber(pricing.acceptedTotal),
    depositRequired: getBoolean(deposit.required),
    depositType: getString(deposit.type) as CanonicalProposalSnapshot["depositType"],
    depositValue: getNumber(deposit.value),
    requiredDepositAmount: getNumber(deposit.requiredAmount),
    remainingBalance: getNumber(pricing.remainingBalance),
    terms: getString(snapshot.terms),
    selectedOptionIds: getArray(snapshot.selectedOptionIds).map((item) => getString(item)),
    lineItems: lineItems.map((item) => ({
      id: getString(item.id),
      name: getString(item.name),
      description: getOptionalString(item.description),
      quantity: getNumber(item.quantity),
      unit: getString(item.unit),
      total: getNumber(item.total),
      sortOrder: getNumber(item.sortOrder),
    })),
    sections: sections.map((section) => ({
      id: getString(section.id),
      title: getString(section.title),
      body: getString(section.body),
      sortOrder: getNumber(section.sortOrder),
    })),
    options: options.map((option) => ({
      id: getString(option.id),
      name: getString(option.name),
      description: getOptionalString(option.description),
      selected: getBoolean(option.selected),
      quantity: getNumber(option.quantity),
      unit: getString(option.unit),
      price: getNumber(option.price),
      priceEffectType: getString(option.priceEffectType) as CanonicalProposalSnapshot["options"][number]["priceEffectType"],
      baseReplacementAmount: getNumber(option.baseReplacementAmount),
      scopeDetails: getOptionalString(option.scopeDetails),
      warrantyEffect: getOptionalString(option.warrantyEffect),
      customerNotes: getOptionalString(option.customerNotes),
      sortOrder: getNumber(option.sortOrder),
    })),
  };

  if (
    snapshot.schemaVersion !== "native-proposal-v1" ||
    !parsed.companyId ||
    !parsed.companyName ||
    !getUuid(parsed.proposalRevisionId) ||
    !parsed.proposalNumber ||
    parsed.revisionNumber < 1 ||
    !parsed.title ||
    !parsed.issueDate ||
    !parsed.customerName ||
    !parsed.terms ||
    !["none", "fixed", "percent", "custom_schedule"].includes(parsed.depositType) ||
    !parsed.lineItems.length ||
    !parsed.sections.length ||
    parsed.lineItems.some((item) => !item.id || !item.name || !item.unit) ||
    parsed.options.some(
      (option) =>
        !option.id ||
        !option.name ||
        !option.unit ||
        !PRICE_EFFECT_TYPES.has(option.priceEffectType),
    ) ||
    parsed.sections.some((section) => !section.id || !section.title || !section.body)
  ) {
    return null;
  }
  return parsed;
}

async function callServiceRpc(
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  functionName: string,
  args: Record<string, unknown>,
) {
  return (await serviceClient.rpc(functionName as never, args as never)) as unknown as {
    data: unknown;
    error: { message?: string } | null;
  };
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();
  if (!client || !serviceClient) {
    return jsonResponse(
      { ok: false, message: "Server-side CRM access is not configured." },
      503,
    );
  }

  const { data: authResult } = await client.auth.getUser();
  if (!authResult.user) {
    return jsonResponse(
      { ok: false, message: "Sign in before finalizing a proposal." },
      401,
    );
  }

  const body = await getJsonBody(request);
  const estimateId = getUuid(body.estimateId);
  const requestedSelectedOptionIds = getSelectedOptionIds(body.selectedOptionIds);
  const requestedDepositRule = getRequestedDepositRule(body);
  if (!estimateId || !requestedSelectedOptionIds || !requestedDepositRule) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Select a valid estimate, proposal options, and no-deposit, fixed, or percentage deposit rule.",
      },
      400,
    );
  }

  const { data: estimate, error: estimateError } = await client
    .from("estimates")
    .select("*")
    .eq("id", estimateId)
    .maybeSingle();
  if (estimateError) {
    return jsonResponse(
      {
        ok: false,
        message: "The estimate could not be loaded safely. Try finalizing again.",
      },
      502,
    );
  }
  if (!estimate) {
    return jsonResponse({ ok: false, message: "Estimate was not found." }, 404);
  }
  if (estimate.status !== "approved") {
    return jsonResponse(
      {
        ok: false,
        message:
          "Approve the estimate internally before finalizing an immutable customer proposal.",
      },
      409,
    );
  }

  const { data: ownerMembership, error: ownerMembershipError } = await client
    .from("company_memberships")
    .select("user_id,company_id,role")
    .eq("company_id", estimate.company_id)
    .eq("user_id", authResult.user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (ownerMembershipError) {
    return jsonResponse(
      {
        ok: false,
        message: "Company-owner authorization could not be verified safely.",
      },
      502,
    );
  }
  if (!ownerMembership) {
    return jsonResponse(
      { ok: false, message: "A company owner must finalize customer proposals." },
      403,
    );
  }
  if (!estimate.customer_id) {
    return jsonResponse(
      { ok: false, message: "Link a company customer before finalizing this proposal." },
      409,
    );
  }

  const canonicalSourceResults = await Promise.all([
    serviceClient.from("companies").select("*").eq("id", estimate.company_id).maybeSingle(),
    serviceClient
      .from("customers")
      .select("*")
      .eq("id", estimate.customer_id)
      .eq("company_id", estimate.company_id)
      .maybeSingle(),
    serviceClient
      .from("estimate_line_items")
      .select("*")
      .eq("estimate_id", estimate.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    serviceClient
      .from("scopes")
      .select("*")
      .eq("estimate_id", estimate.id)
      .eq("company_id", estimate.company_id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    serviceClient
      .from("inspections")
      .select("*")
      .eq("estimate_id", estimate.id)
      .eq("company_id", estimate.company_id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    serviceClient
      .from("estimate_proposal_revisions")
      .select("*")
      .eq("estimate_id", estimate.id)
      .eq("company_id", estimate.company_id)
      .order("revision_number", { ascending: false })
      .order("id", { ascending: false })
      .limit(1),
    serviceClient
      .from("job_photos")
      .select("id,caption,label,sort_order")
      .eq("estimate_id", estimate.id)
      .eq("company_id", estimate.company_id)
      .eq("is_customer_visible", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    estimate.property_id
      ? serviceClient
          .from("properties")
          .select("*")
          .eq("id", estimate.property_id)
          .eq("company_id", estimate.company_id)
          .eq("customer_id", estimate.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const [
    companyResult,
    customerResult,
    lineItemsResult,
    scopesResult,
    inspectionsResult,
    revisionsResult,
    photosResult,
    propertyResult,
  ] = canonicalSourceResults;
  const failedCanonicalSourceRead = getFailedCanonicalSourceRead([
    { name: "company", error: companyResult.error },
    { name: "customer", error: customerResult.error },
    { name: "line_items", error: lineItemsResult.error },
    { name: "scope", error: scopesResult.error },
    { name: "inspection", error: inspectionsResult.error },
    { name: "revision", error: revisionsResult.error },
    { name: "photo", error: photosResult.error },
    { name: "property", error: propertyResult.error },
  ]);
  if (failedCanonicalSourceRead) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Proposal source records could not be loaded safely. Try finalizing again.",
      },
      502,
    );
  }
  const company = companyResult.data;
  const customer = customerResult.data;
  const lineItems = lineItemsResult.data;
  const scopes = scopesResult.data;
  const inspections = inspectionsResult.data;
  const revisions = revisionsResult.data;
  const photos = photosResult.data;
  const property = propertyResult.data;

  if (!company || !customer || !lineItems?.length) {
    return jsonResponse(
      {
        ok: false,
        message:
          "A company-scoped customer and at least one priced line item are required before finalization.",
      },
      409,
    );
  }

  const latestRevision = revisions?.[0] ?? null;
  const sourceContentResults = latestRevision
    ? await Promise.all([
        serviceClient
          .from("estimate_proposal_sections")
          .select("*")
          .eq("proposal_revision_id", latestRevision.id)
          .eq("company_id", estimate.company_id)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true }),
        serviceClient
          .from("estimate_proposal_options")
          .select("*")
          .eq("proposal_revision_id", latestRevision.id)
          .eq("company_id", estimate.company_id)
          .order("sort_order", { ascending: true })
          .order("id", { ascending: true }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  const [sourceSectionsResult, sourceOptionsResult] = sourceContentResults;
  const failedProposalContentRead = getFailedCanonicalSourceRead([
    { name: "section", error: sourceSectionsResult.error },
    { name: "option", error: sourceOptionsResult.error },
  ]);
  if (failedProposalContentRead) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Proposal revision content could not be loaded safely. Try finalizing again.",
      },
      502,
    );
  }
  const sourceSections = sourceSectionsResult.data;
  const sourceOptions = sourceOptionsResult.data;

  let templateQuery = serviceClient
    .from("proposal_templates")
    .select("*")
    .eq("company_id", estimate.company_id)
    .eq("status", "active");
  templateQuery = latestRevision?.template_id
    ? templateQuery.eq("id", latestRevision.template_id)
    : templateQuery.eq("is_default", true);
  const { data: templates, error: templateError } = await templateQuery
    .order("version_number", { ascending: false })
    .order("id", { ascending: false })
    .limit(1);
  const failedTemplateRead = getFailedCanonicalSourceRead([
    { name: "template", error: templateError },
  ]);
  if (failedTemplateRead) {
    return jsonResponse(
      {
        ok: false,
        message: "The active proposal template could not be loaded safely.",
      },
      502,
    );
  }
  const template = templates?.[0] ?? null;
  if (!template) {
    return jsonResponse(
      { ok: false, message: "Configure an active company proposal template first." },
      409,
    );
  }
  const templateOptions = getArray(template.default_options);
  if (templateOptions.length > 64) {
    return jsonResponse(
      {
        ok: false,
        message: "The active proposal template exceeds the 64-option safety limit.",
      },
      409,
    );
  }

  const proposalIdentity = resolveProposalCustomerIdentity({
    estimate,
    customer,
    lead: null,
    property,
  });
  const { customerName, propertyAddress } = proposalIdentity;
  const scope = getRecord(scopes?.[0] ?? null);
  const inspection = getRecord(inspections?.[0] ?? null);
  const sections = prepareSections({
    sourceSections: (sourceSections ?? []) as EstimateProposalSectionRecord[],
    templateSections: getArray(template.default_sections),
    context: {
      sectionKey: "",
      sectionType: "custom",
      estimate: getRecord(estimate),
      scope: Object.keys(scope).length ? scope : null,
      inspection: Object.keys(inspection).length ? inspection : null,
      customerName,
      propertyAddress,
      lineItemNames: lineItems.map((item) => scrubCustomerFacingText(item.name)),
      photoLabels: (photos ?? [])
        .map((photo) => scrubCustomerFacingText(photo.caption ?? photo.label))
        .filter(Boolean),
      defaultTerms: template.default_terms ?? "",
      defaultWarranty: template.default_warranty ?? "",
    },
  });
  let options = prepareOptions({
    sourceOptions: (sourceOptions ?? []) as EstimateProposalOptionRecord[],
    templateOptions,
    templateId: template.id,
    selectedIds: new Set(requestedSelectedOptionIds),
  });
  const selectedSourceIds = new Set(
    options
      .filter((option) => requestedSelectedOptionIds.includes(option.sourceId))
      .map((option) => option.sourceId),
  );
  const unmatchedSelectionIds = new Set(
    requestedSelectedOptionIds.filter((id) => !selectedSourceIds.has(id)),
  );

  if (unmatchedSelectionIds.size && sourceOptions?.length) {
    const templateOptionModels = prepareOptions({
      sourceOptions: [],
      templateOptions,
      templateId: template.id,
      selectedIds: new Set(),
    });
    const currentBySelectionKey = new Map(
      options.map((option) => [proposalOptionSelectionKey(option), option]),
    );

    for (const templateOption of templateOptionModels) {
      if (!unmatchedSelectionIds.has(templateOption.sourceId)) {
        continue;
      }
      const current = currentBySelectionKey.get(
        proposalOptionSelectionKey(templateOption),
      );
      if (current) {
        selectedSourceIds.add(current.sourceId);
        unmatchedSelectionIds.delete(templateOption.sourceId);
      }
    }
  }

  if (unmatchedSelectionIds.size) {
    const unmatchedUuidSelectionIds = [...unmatchedSelectionIds].filter((id) =>
      Boolean(getUuid(id)),
    );
    const staleOptionsResult = unmatchedUuidSelectionIds.length
      ? await serviceClient
          .from("estimate_proposal_options")
          .select("*")
          .eq("company_id", estimate.company_id)
          .in("id", unmatchedUuidSelectionIds)
      : { data: [], error: null };
    const failedStaleOptionRead = getFailedCanonicalSourceRead([
      { name: "stale_option", error: staleOptionsResult.error },
    ]);
    if (failedStaleOptionRead) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Proposal option lineage could not be loaded safely. Reload before finalizing.",
        },
        502,
      );
    }
    const staleOptions = staleOptionsResult.data;
    const staleRevisionIds = [
      ...new Set((staleOptions ?? []).map((option) => option.proposal_revision_id)),
    ];
    const staleRevisionsResult = staleRevisionIds.length
      ? await serviceClient
          .from("estimate_proposal_revisions")
          .select("id")
          .eq("company_id", estimate.company_id)
          .eq("estimate_id", estimate.id)
          .in("id", staleRevisionIds)
      : { data: [], error: null };
    const failedStaleRevisionRead = getFailedCanonicalSourceRead([
      { name: "stale_revision", error: staleRevisionsResult.error },
    ]);
    if (failedStaleRevisionRead) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Proposal revision lineage could not be loaded safely. Reload before finalizing.",
        },
        502,
      );
    }
    const staleRevisions = staleRevisionsResult.data;
    const allowedStaleRevisionIds = new Set(
      (staleRevisions ?? []).map((revision) => revision.id),
    );
    const staleModels = prepareOptions({
      sourceOptions: ((staleOptions ?? []).filter((option) =>
        allowedStaleRevisionIds.has(option.proposal_revision_id),
      )) as EstimateProposalOptionRecord[],
      templateOptions: [],
      templateId: template.id,
      selectedIds: new Set(),
    });
    const currentBySelectionKey = new Map(
      options.map((option) => [proposalOptionSelectionKey(option), option]),
    );

    for (const staleOption of staleModels) {
      if (!unmatchedSelectionIds.has(staleOption.sourceId)) {
        continue;
      }
      const current = currentBySelectionKey.get(proposalOptionSelectionKey(staleOption));
      if (current) {
        selectedSourceIds.add(current.sourceId);
        unmatchedSelectionIds.delete(staleOption.sourceId);
      }
    }
  }

  options = options.map((option) => ({
    ...option,
    selected: option.required || selectedSourceIds.has(option.sourceId),
  }));
  const normalizedSelectedSourceIds = [...selectedSourceIds].sort();
  const validationError = validatePreparedContent(
    sections,
    options,
    unmatchedSelectionIds.size ? requestedSelectedOptionIds : normalizedSelectedSourceIds,
  );
  if (validationError) {
    return jsonResponse({ ok: false, message: validationError }, 409);
  }

  const branding = getProposalBranding(company);
  const totals = calculateEstimateTotals(estimate, lineItems);
  const depositType = requestedDepositRule.type;
  const depositValue = requestedDepositRule.value;
  if (depositType === "percent" && depositValue > 100) {
    return jsonResponse(
      {
        ok: false,
        message: "A proposal deposit percentage cannot exceed 100%.",
      },
      409,
    );
  }
  const terms =
    scrubCustomerFacingText(latestRevision?.terms) ||
    scrubCustomerFacingText(template.default_terms);
  const proposalTitle = scrubCustomerFacingText(
    latestRevision?.title ?? estimate.title,
  );
  if (!proposalTitle) {
    return jsonResponse(
      { ok: false, message: "Complete the customer-safe proposal title before finalizing." },
      409,
    );
  }
  if (!terms) {
    return jsonResponse(
      { ok: false, message: "Complete the customer proposal terms before finalizing." },
      409,
    );
  }

  const canonicalSource = {
    companyId: estimate.company_id,
    companyUpdatedAt: company.updated_at,
    estimateId: estimate.id,
    estimateUpdatedAt: estimate.updated_at,
    customerId: customer.id,
    customerUpdatedAt: customer.updated_at,
    customerName,
    propertyId: proposalIdentity.propertyId,
    propertyUpdatedAt: proposalIdentity.propertyUpdatedAt,
    propertyAddress,
    templateId: template.id,
    proposalNumber: latestRevision?.proposal_number ?? buildProposalNumber(estimate, company),
    title: proposalTitle,
    branding,
    totals,
    depositType,
    depositValue,
    terms,
    lineItems: lineItems.map((item) => ({
      id: item.id,
      name: scrubCustomerFacingText(item.name),
      description: getOptionalString(scrubCustomerFacingText(item.description)),
      quantity: item.quantity,
      unit: scrubCustomerFacingText(item.unit),
      total: item.total,
      sortOrder: item.sort_order,
      updatedAt: item.updated_at,
    })),
    sections: sections.map(({ sourceId: _sourceId, ...section }) => section),
    options: options.map(
      ({ sourceId: _sourceId, dependencySourceId, conflictingSourceId, ...option }) => ({
        ...option,
        dependencyIndex: dependencySourceId
          ? options.findIndex((candidate) => candidate.sourceId === dependencySourceId)
          : null,
        conflictingIndex: conflictingSourceId
          ? options.findIndex((candidate) => candidate.sourceId === conflictingSourceId)
          : null,
      }),
    ),
  };
  const unsupportedPdfGlyph = findUnsupportedDeterministicPdfGlyph([
    branding.companyName,
    canonicalSource.proposalNumber,
    canonicalSource.title,
    customerName,
    customer.contact_name ?? "",
    customer.display_name ?? "",
    customer.email ?? "",
    propertyAddress,
    terms,
    ...canonicalSource.lineItems.flatMap((item) => [
      item.name,
      item.description ?? "",
      item.unit,
    ]),
    ...sections.flatMap((section) => [section.title, section.body]),
    ...options.flatMap((option) => [
      option.name,
      option.description ?? "",
      option.unit,
      option.scopeDetails ?? "",
      option.warrantyEffect ?? "",
      option.customerNotes ?? "",
    ]),
  ]);
  if (unsupportedPdfGlyph) {
    return jsonResponse(
      {
        ok: false,
        message: `The finalized customer proposal contains ${unsupportedPdfGlyph.codePointLabel}, which the approved PDF font cannot render without changing the text. Update that customer-visible text before finalizing.`,
      },
      409,
    );
  }
  const operationKey = deterministicUuid(stableJson(canonicalSource));
  const sectionPayload = sections.map((section, index) => ({
    id: deterministicUuid(`${operationKey}:section:${index}:${section.sectionKey}`),
    sectionKey: section.sectionKey,
    title: section.title,
    sectionType: section.sectionType,
    body: section.body,
    customerVisible: true,
    isRequired: section.isRequired,
    sortOrder: section.sortOrder,
    sourceType: section.sourceType,
    sourceRecordId: section.sourceRecordId,
  }));
  const targetOptionIds = options.map((option, index) =>
    deterministicUuid(`${operationKey}:option:${index}:${option.name}`),
  );
  const optionIndexBySourceId = new Map(
    options.map((option, index) => [option.sourceId, index]),
  );
  const optionPayload = options.map((option, index) => {
    const dependencyIndex = option.dependencySourceId
      ? optionIndexBySourceId.get(option.dependencySourceId)
      : undefined;
    const conflictingIndex = option.conflictingSourceId
      ? optionIndexBySourceId.get(option.conflictingSourceId)
      : undefined;
    return {
      id: targetOptionIds[index],
      optionType: option.optionType,
      optionGroupKey: option.optionGroupKey,
      name: option.name,
      description: option.description,
      quantity: option.quantity,
      unit: option.unit,
      price: option.price,
      priceEffectType: option.priceEffectType,
      baseReplacementAmount: option.baseReplacementAmount,
      customerVisible: true,
      selected: option.selected,
      required: option.required,
      recommended: option.recommended,
      bestValue: option.bestValue,
      dependencyOptionId:
        dependencyIndex === undefined ? null : targetOptionIds[dependencyIndex],
      conflictingOptionId:
        conflictingIndex === undefined ? null : targetOptionIds[conflictingIndex],
      warrantyEffect: option.warrantyEffect,
      scopeDetails: option.scopeDetails,
      customerNotes: option.customerNotes,
      sourceLineItemId: option.sourceLineItemId,
      sourceFindingId: option.sourceFindingId,
      sourcePhotoId: option.sourcePhotoId,
      sortOrder: option.sortOrder,
    };
  });
  const selectedOptionIds = optionPayload
    .filter((option) => option.selected)
    .map((option) => option.id)
    .sort();
  const finalizationRequest = {
    operationKey,
    actorUserId: authResult.user.id,
    companyId: estimate.company_id,
    estimateId: estimate.id,
    proposalNumber: canonicalSource.proposalNumber,
    title: canonicalSource.title,
    templateId: template.id,
    brandName: branding.companyName,
    brandPrimaryColor: branding.primaryColor,
    brandAccentColor: branding.accentColor,
    baseSubtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    feeTotal: 0,
    baseTotal: totals.total,
    depositType,
    depositValue,
    depositRequired: depositType !== "none" && depositValue > 0,
    requiresDepositBeforeJob: depositType !== "none" && depositValue > 0,
    customerVisibleNotes: null,
    terms,
    selectedOptionIds,
    sections: sectionPayload,
    options: optionPayload,
    sourceCompanyUpdatedAt: canonicalSource.companyUpdatedAt,
    sourceEstimateUpdatedAt: canonicalSource.estimateUpdatedAt,
    sourceCustomerId: canonicalSource.customerId,
    sourceCustomerUpdatedAt: canonicalSource.customerUpdatedAt,
    sourceCustomerName: canonicalSource.customerName,
    sourcePropertyId: canonicalSource.propertyId,
    sourcePropertyUpdatedAt: canonicalSource.propertyUpdatedAt,
    sourcePropertyAddress: canonicalSource.propertyAddress,
    sourceLineItems: canonicalSource.lineItems,
  };
  const finalizeResponse = await callServiceRpc(
    serviceClient,
    "wtos_finalize_proposal_revision",
    { finalization_request: finalizationRequest },
  );
  if (finalizeResponse.error) {
    return jsonResponse(
      {
        ok: false,
        message: "The immutable proposal revision could not be finalized safely.",
      },
      409,
    );
  }

  const finalizeResult = getRecord(
    Array.isArray(finalizeResponse.data)
      ? finalizeResponse.data[0]
      : finalizeResponse.data,
  );
  const proposalRevisionId = getUuid(finalizeResult.proposalRevisionId);
  const revisionNumber = getNumber(finalizeResult.revisionNumber);
  const revisionSha256 = getString(finalizeResult.revisionSha256).toLowerCase();
  const snapshot = parseCanonicalSnapshot(finalizeResult.customerSnapshot);
  if (
    finalizeResult.ok !== true ||
    !proposalRevisionId ||
    revisionNumber < 1 ||
    !/^[a-f0-9]{64}$/.test(revisionSha256) ||
    !snapshot ||
    snapshot.companyId !== estimate.company_id ||
    snapshot.proposalRevisionId !== proposalRevisionId ||
    snapshot.revisionNumber !== revisionNumber ||
    snapshot.selectedOptionIds.slice().sort().join(",") !== selectedOptionIds.join(",")
  ) {
    return jsonResponse(
      { ok: false, message: "Proposal finalization returned invalid immutable evidence." },
      502,
    );
  }

  const attachment = buildFinalizedProposalPdfAttachment({
    proposalNumber: snapshot.proposalNumber,
    revisionNumber: snapshot.revisionNumber,
    title: snapshot.title,
    companyName: snapshot.companyName,
    customerName: snapshot.customerName,
    propertyAddress: snapshot.propertyAddress ?? propertyAddress,
    issueDate: snapshot.issueDate,
    sections: snapshot.sections
      .slice()
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      ),
    lineItems: snapshot.lineItems
      .slice()
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      ),
    options: snapshot.options
      .slice()
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
      ),
    baseSubtotal: snapshot.baseSubtotal,
    discountTotal: snapshot.discountTotal,
    taxTotal: snapshot.taxTotal,
    feeTotal: snapshot.feeTotal,
    baseTotal: snapshot.baseTotal,
    selectedUpgradesTotal: snapshot.selectedUpgradesTotal,
    acceptedTotal: snapshot.acceptedTotal,
    depositRequired: snapshot.depositRequired,
    depositType: snapshot.depositType,
    depositValue: snapshot.depositValue,
    depositAmount: snapshot.requiredDepositAmount,
    remainingBalance: snapshot.remainingBalance,
    terms: snapshot.terms,
  });
  const contentSha256 = hashProposalDocumentContent(attachment.content);
  const existingDocumentId = getUuid(finalizeResult.documentId);
  const existingDocumentSha256 = getString(finalizeResult.documentSha256).toLowerCase();
  if (existingDocumentId) {
    if (existingDocumentSha256 !== contentSha256) {
      return jsonResponse(
        { ok: false, message: "The existing finalized artifact digest does not match." },
        409,
      );
    }
    const existingProposalStatus = getExistingFinalizedProposalStatus(
      finalizeResult.proposalStatus,
    );
    if (!existingProposalStatus) {
      return jsonResponse(
        {
          ok: false,
          message:
            "This exact immutable proposal is no longer in a state that can be finalized again.",
        },
        409,
      );
    }
    return jsonResponse(
      {
        ok: true,
        message:
          existingProposalStatus === "ready_to_send"
            ? "This exact immutable proposal revision was already finalized and is ready to send."
            : `This exact immutable proposal revision was already finalized and remains ${existingProposalStatus}.`,
        proposalRevisionId,
        documentId: existingDocumentId,
        proposalNumber: snapshot.proposalNumber,
        revisionNumber,
        contentSha256,
        status: existingProposalStatus,
      },
      200,
    );
  }

  const documentId = deterministicUuid(`${proposalRevisionId}:${contentSha256}:document`);
  const artifactOperationKey = deterministicUuid(
    `${proposalRevisionId}:${contentSha256}:artifact`,
  );
  const storagePath = `${estimate.company_id}/proposals/${proposalRevisionId}/${documentId}.pdf`;
  const expectedArtifact: ExpectedProposalArtifact = {
    documentId,
    companyId: estimate.company_id,
    proposalRevisionId,
    artifactOperationKey,
    contentSha256,
    storageBucket: "customer-documents",
    storagePath,
    fileName: attachment.fileName,
    fileSizeBytes: attachment.content.byteLength,
    mimeType: attachment.mimeType,
  };
  let objectMatches = false;
  const upload = await serviceClient.storage
    .from("customer-documents")
    .upload(storagePath, attachment.content, {
      contentType: "application/pdf",
      cacheControl: "3600",
      upsert: false,
    });
  if (upload.error) {
    const existingObject = await serviceClient.storage
      .from("customer-documents")
      .download(storagePath);
    if (!existingObject.error && existingObject.data) {
      const existingContent = Buffer.from(await existingObject.data.arrayBuffer());
      objectMatches = hashProposalDocumentContent(existingContent) === contentSha256;
    }
    if (!objectMatches) {
      return jsonResponse(
        { ok: false, message: "The private finalized proposal PDF could not be stored." },
        502,
      );
    }
  } else {
    objectMatches = true;
  }

  const registerResponse = await callServiceRpc(
    serviceClient,
    "wtos_register_proposal_artifact",
    {
      artifact_request: {
        operationKey: artifactOperationKey,
        actorUserId: authResult.user.id,
        companyId: estimate.company_id,
        proposalRevisionId,
        documentId,
        fileName: attachment.fileName,
        fileSizeBytes: attachment.content.byteLength,
        mimeType: attachment.mimeType,
        storageBucket: "customer-documents",
        storagePath,
        documentSha256: contentSha256,
      },
    },
  );
  const registerResult = getRecord(
    Array.isArray(registerResponse.data) ? registerResponse.data[0] : registerResponse.data,
  );
  if (registerResponse.error) {
    return jsonResponse(
      {
        ok: false,
        message:
          "Proposal registration outcome is not yet conclusive. The exact private artifact was preserved for an idempotent retry.",
      },
      502,
    );
  }
  const registrationResponseMatches = Boolean(
    registerResult.ok === true &&
      registerResult.status === "ready_to_send" &&
      getUuid(registerResult.proposalRevisionId) === proposalRevisionId &&
      getUuid(registerResult.documentId) === documentId &&
      getString(registerResult.documentSha256).toLowerCase() === contentSha256,
  );
  if (!registrationResponseMatches) {
    const { data: registeredDocument, error: registeredDocumentError } =
      await serviceClient
        .from("documents")
        .select(
          "id,company_id,proposal_revision_id,artifact_operation_key,content_sha256,storage_bucket,storage_path,file_name,file_size_bytes,mime_type,file_url,immutable_after_at",
        )
        .eq("id", documentId)
        .eq("company_id", estimate.company_id)
        .maybeSingle();
    if (registeredDocumentError) {
      return jsonResponse(
        {
          ok: false,
          message:
            "Proposal registration outcome is not yet conclusive. No private object was removed; retry finalization safely.",
        },
        502,
      );
    }

    if (registeredDocument) {
      if (!isExactRegisteredProposalArtifact(registeredDocument, expectedArtifact)) {
        return jsonResponse(
          {
            ok: false,
            message:
              "Proposal registration state conflicts with the exact immutable artifact. No private object was removed.",
          },
          409,
        );
      }
    } else {
      return jsonResponse(
        {
          ok: false,
          message:
            "Proposal registration did not return conclusive immutable evidence. The exact private artifact was preserved for an idempotent retry.",
        },
        502,
      );
    }
  }

  return jsonResponse(
    {
      ok: true,
      message: "The exact customer-safe proposal revision is finalized and ready to send.",
      proposalRevisionId,
      documentId,
      proposalNumber: snapshot.proposalNumber,
      revisionNumber,
      contentSha256,
      status: "ready_to_send",
    },
    200,
  );
}
