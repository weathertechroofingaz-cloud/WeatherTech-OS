import type {
  ProposalSigningAcceptanceEvidence,
  ProposalSigningOption,
  ProposalSigningSessionRecord,
} from "./contracts";
import { buildDeterministicUnicodeTextPdf } from "../pdf/deterministicUnicodePdf";
import { calculateProposalSigningOptionTotal } from "./pricing";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function signedMoney(value: number) {
  if (Math.abs(value) < 0.005) return money(0);
  return `${value > 0 ? "+" : "-"}${money(Math.abs(value))}`;
}

function optionTotal(option: ProposalSigningOption) {
  return calculateProposalSigningOptionTotal(option);
}

function optionNetAdjustment(option: ProposalSigningOption, baseTotal: number) {
  const total = optionTotal(option);
  if (option.priceEffectType === "replace_base_amount") {
    return total - option.baseReplacementAmount;
  }
  if (option.priceEffectType === "full_alternate_total") {
    return total - baseTotal;
  }
  return total;
}

function optionPricingEffect(option: ProposalSigningOption) {
  if (option.priceEffectType === "replace_base_amount") {
    return "Replace base amount - substitutes this option total for the frozen replacement amount shown below";
  }
  if (option.priceEffectType === "full_alternate_total") {
    return "Full alternate total - substitutes this option total for the full base proposal";
  }
  return "Additive - adds this option total to the proposal";
}

function depositValue(proposal: ProposalSigningSessionRecord["proposal"]) {
  if (proposal.depositType === "percent") return `${proposal.depositValue}%`;
  if (proposal.depositType === "fixed") return money(proposal.depositValue);
  return `${proposal.depositValue} (not applicable)`;
}

function groupPdfSection(
  heading: string,
  blocks: readonly (readonly string[])[],
  emptyLines: readonly string[],
) {
  if (!blocks.length) {
    return [[heading, ...emptyLines]] as const;
  }
  return [[heading, ...blocks[0]], ...blocks.slice(1)];
}

export function buildProposalSigningReceiptPdf({
  session,
  acceptance,
}: {
  session: ProposalSigningSessionRecord;
  acceptance: ProposalSigningAcceptanceEvidence;
}) {
  const orderedLineItems = session.proposal.lineItems
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const orderedSections = session.proposal.sections
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const orderedOptions = session.proposal.options
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  const acceptedOptionIds = [...acceptance.selectedOptionIds].sort();
  const acceptedOptionNames = orderedOptions
    .filter((option) => acceptedOptionIds.includes(option.id))
    .map((option) => option.name);
  const selectedFullAlternateId = orderedOptions.find(
    (option) =>
      acceptedOptionIds.includes(option.id) &&
      option.priceEffectType === "full_alternate_total",
  )?.id;
  const sectionBlocks = orderedSections.map((section) => [
    section.title,
    section.body,
    "",
  ]);
  const lineItemBlocks = orderedLineItems.map((item) => [
    item.name,
    `Quantity / unit: ${item.quantity} ${item.unit}`,
    `Line total: ${money(item.total)}`,
    `Description: ${item.description ?? "Not specified"}`,
    "",
  ]);
  const optionBlocks = orderedOptions.map((option) => {
    const selected = acceptedOptionIds.includes(option.id);
    const netAdjustment = optionNetAdjustment(option, session.proposal.baseTotal);
    const applied =
      selected &&
      (!selectedFullAlternateId ||
        option.id === selectedFullAlternateId ||
        option.priceEffectType === "additive");
    return [
      `${selected ? "SELECTED" : "NOT SELECTED"}: ${option.name}`,
      `Quantity / unit: ${option.quantity} ${option.unit}`,
      `Unit price: ${money(option.price)}`,
      `Option total: ${money(optionTotal(option))}`,
      `Pricing effect: ${optionPricingEffect(option)}`,
      `Frozen price-effect type: ${option.priceEffectType}`,
      `Frozen base amount replaced: ${money(option.baseReplacementAmount)}`,
      `Net adjustment if selected: ${signedMoney(netAdjustment)}`,
      `Applied to accepted total: ${applied ? signedMoney(netAdjustment) : selected ? `${money(0)} (superseded by full alternate)` : `${money(0)} (not selected)`}`,
      `Description: ${option.description ?? "Not specified"}`,
      `Scope details: ${option.scopeDetails ?? "Not specified"}`,
      `Warranty effect: ${option.warrantyEffect ?? "Not specified"}`,
      `Customer notes: ${option.customerNotes ?? "Not specified"}`,
      "",
    ];
  });
  const rawLines: Array<string | readonly string[]> = [
    [
      session.proposal.companyName,
      "Completed Signed Proposal and Customer Receipt",
      "",
      `Proposal: ${session.proposal.proposalNumber}`,
      `Revision: ${session.proposal.revisionNumber}`,
      `Title: ${session.proposal.title}`,
      `Proposal date: ${session.proposal.issueDate}`,
      `Prepared for: ${session.proposal.customerName}`,
      `Property: ${session.proposal.propertyAddress ?? "Not listed"}`,
      "",
    ],
    ...groupPdfSection(
      "CUSTOMER-VISIBLE PROPOSAL SECTIONS",
      sectionBlocks,
      ["No additional customer-visible sections were included.", ""],
    ),
    ...groupPdfSection(
      "FINALIZED LINE ITEMS",
      lineItemBlocks,
      ["No separate line items were included in this finalized revision.", ""],
    ),
    ...groupPdfSection(
      "FINALIZED OPTIONS",
      optionBlocks,
      ["No proposal options were included.", ""],
    ),
    [
      "FINALIZED PRICING",
      `Base subtotal: ${money(session.proposal.baseSubtotal)}`,
      `Discount: ${money(session.proposal.discountTotal)}`,
      `Tax: ${money(session.proposal.taxTotal)}`,
      `Fees: ${money(session.proposal.feeTotal)}`,
      `Base total: ${money(session.proposal.baseTotal)}`,
      `Selected upgrades: ${money(session.proposal.selectedUpgradesTotal)}`,
      `Accepted total: ${money(acceptance.acceptedTotal)}`,
      `Deposit type: ${session.proposal.depositType}`,
      `Deposit value: ${depositValue(session.proposal)}`,
      session.proposal.depositRequired
        ? `Required deposit: ${money(acceptance.requiredDepositAmount)}`
        : "Required deposit: None",
      `Remaining balance: ${money(session.proposal.remainingBalance)}`,
      "",
    ],
    ["EXACT PROPOSAL TERMS", session.proposal.terms, ""],
    [
      "ELECTRONIC RECORDS DISCLOSURE",
      session.proposal.electronicRecordsDisclosure,
      "",
    ],
    [
      "ELECTRONIC SIGNATURE CERTIFICATE",
      `Signer: ${acceptance.signerName}`,
      `Signer email: ${acceptance.signerEmail}`,
      `Electronic signature: /s/ ${acceptance.signerName}`,
      `Accepted at: ${acceptance.acceptedAt}`,
      `Accepted options: ${acceptedOptionNames.length ? acceptedOptionNames.join(", ") : "None"}`,
      `Accepted total: ${money(acceptance.acceptedTotal)}`,
      `Required deposit: ${money(acceptance.requiredDepositAmount)}`,
      "Terms acknowledged: Yes",
      "Electronic records consented: Yes",
      "Signature intent acknowledged: Yes",
      "The signer acknowledged the proposal terms, consented to electronic records and",
      "signatures, and intentionally adopted the typed name above as an electronic signature.",
      "",
      `Evidence SHA-256: ${acceptance.evidenceSha256}`,
      `Proposal revision SHA-256: ${session.proposal.revisionSha256}`,
      `Proposal document SHA-256: ${session.document.sha256}`,
      `Terms SHA-256: ${acceptance.termsSha256}`,
      `Electronic consent SHA-256: ${acceptance.consentSha256}`,
      "",
      "This private completed customer copy combines the full frozen proposal snapshot with",
      "the electronic-signature certificate bound to the exact proposal and document digests.",
    ],
  ];
  return buildDeterministicUnicodeTextPdf({
    lines: rawLines,
    fallbackTitle: "Completed Signed Proposal and Customer Receipt",
    linesPerPage: 38,
  });
}

export function getProposalSigningReceiptFileName(session: ProposalSigningSessionRecord) {
  const safeNumber = session.proposal.proposalNumber
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safeNumber || "proposal"}-signed-receipt.pdf`;
}
