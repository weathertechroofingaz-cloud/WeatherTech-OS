import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "components/CrmApp.tsx"), "utf8");
const signatureRequestRouteSource = readFileSync(
  join(process.cwd(), "app/api/proposals/signature-requests/route.ts"),
  "utf8",
);
const proposalOperationsSource = readFileSync(
  join(process.cwd(), "lib/crm/proposalOperations.ts"),
  "utf8",
);
const proposalBuilderSource = source.slice(
  source.indexOf("function ProposalBuilderPanel("),
  source.indexOf("type ScopeDraft ="),
);
const changeOrdersSource = source.slice(
  source.indexOf("function ChangeOrdersView("),
  source.indexOf("function DocumentsAndSignaturesView("),
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const exactOwnerOptionDisclosure of [
  "Your choices below are frozen into the finalized proposal",
  "the customer does not change them while signing",
  "option.quantity",
  "option.unit",
  "option.priceEffectType",
  "option.baseReplacementAmount",
  "option.scopeDetails",
  "option.warrantyEffect",
  "option.customerNotes",
  "Customer note:",
]) {
  assert(
    proposalBuilderSource.includes(exactOwnerOptionDisclosure),
    `Proposal Builder must disclose exact owner-selected option evidence before finalization: ${exactOwnerOptionDisclosure}`,
  );
}

for (const exactOwnerIdentityDisclosure of [
  'data-testid="proposal-customer-identity"',
  "Finalized for",
  "Exact property",
  "Exact proposal",
  "model.customerName",
  "model.propertyAddress",
  "model.title",
  'model.readiness.some((item) => item.state === "blocked")',
]) {
  assert(
    proposalBuilderSource.includes(exactOwnerIdentityDisclosure),
    `Proposal Builder must disclose and gate on the exact customer/property identity: ${exactOwnerIdentityDisclosure}`,
  );
}

for (const frozenOwnerEvidence of [
  'data-testid="proposal-source-drift-warning"',
  'data-testid="proposal-line-items-list"',
  "model.sourceDriftDetected",
  "model.lineItems.map",
  "Finalized proposal source changed",
  "This panel continues to show the exact immutable customer proposal",
  "Finalize changed source first",
]) {
  assert(
    proposalBuilderSource.includes(frozenOwnerEvidence),
    `Finalized Proposal Builder must render frozen evidence and block drifted delivery: ${frozenOwnerEvidence}`,
  );
}
for (const depositRuleControl of [
  'data-testid="proposal-deposit-rule"',
  'data-testid="proposal-deposit-type"',
  'data-testid="proposal-deposit-value"',
  "No deposit required",
  "Percentage of accepted total",
  "Fixed dollar amount",
  "resulting amount are frozen into the immutable proposal.",
]) {
  assert(
    proposalBuilderSource.includes(depositRuleControl),
    `Proposal Builder must expose the exact owner-controlled deposit rule: ${depositRuleControl}`,
  );
}
assert(
  source.includes("proposalDepositType") &&
    source.includes("proposalDepositValue") &&
    source.includes("const finalizedDepositType = selectedProposalModel.depositRule.type") &&
    source.includes("const finalizedDepositValue = selectedProposalModel.depositRule.value") &&
    source.includes("depositType: finalizedDepositType") &&
    source.includes("depositValue: finalizedDepositValue") &&
    proposalOperationsSource.includes("depositType,") &&
    proposalOperationsSource.includes("depositValue,"),
  "The exact scale-normalized owner deposit rule must be displayed and sent to finalization",
);
assert(
  source.includes(
    "Revoke the active customer signing link before starting a replacement proposal revision.",
  ) &&
    proposalBuilderSource.includes("Boolean(activeSignature)") &&
    proposalBuilderSource.includes("Revoke existing link first"),
  "A live customer signing link must block implicit replacement-revision creation",
);

assert(
  source.includes("function readWorkspaceLocation()") &&
    source.includes("function writeWorkspaceLocation(") &&
    source.includes('window.addEventListener("popstate", handleHistoryNavigation)'),
  "Owner record context must be restored from URL state and browser history",
);
assert(
  source.includes('url.searchParams.set("view", view)') &&
    source.includes('url.searchParams.set(focus.type, focus.id)'),
  "Workspace history must retain the exact non-PII record identifier",
);
assert(
  source.includes("focusedRecordCompanyId") &&
    source.includes("scopeCrmSnapshotByCompany(snapshot, focusedRecordCompanyId)") &&
    source.includes("setSelectedCompanyId(focusedRecordCompanyId)"),
  "Exact-record navigation must restore the record's company scope",
);
assert(
  source.includes('onViewChange("jobs", { type: "job", id: selectedEstimateSoldJob.id })') &&
    source.includes('onViewChange("jobs", { type: "job", id: job.id })'),
  "Only exact evidence-linked existing and newly converted sold jobs must open by identity",
);
assert(
  source.includes("function findExactProposalSoldJob(") &&
    source.includes("job.estimate_id === estimate.id") &&
    source.includes("job.proposal_revision_id === proposalRevisionId") &&
    source.includes("job.proposal_acceptance_id === acceptanceId") &&
    source.includes("job.conversion_operation_key === acceptanceId") &&
    source.includes("if (selectedEstimateSoldJob)") &&
    !source.includes("if (selectedEstimateJob)"),
  "An ordinary pre-created estimate job must never bypass native signature and deposit conversion",
);
assert(
  source.includes('(job.estimate_id !== null && job.estimate_id !== estimate.id)') &&
  source.includes('job.status !== "draft"') &&
    source.includes("job.proposal_revision_id !== null") &&
    source.includes("job.proposal_acceptance_id !== null") &&
    source.includes("job.conversion_operation_key !== null") &&
    source.includes("conflictingCustomer || conflictingLead || conflictingProperty") &&
    source.includes("const allAvailableIdentitiesMatch = [") &&
    source.includes("!estimate.lead_id || job.lead_id === estimate.lead_id") &&
    source.includes("job.service_type === estimate.service_type") &&
    source.includes("const projectIdentityMatches = Boolean(") &&
    source.includes("normalizedJobAddresses.includes(normalizedEstimateAddress)") &&
    source.includes("const exactEstimateCandidates = candidates.filter(") &&
    source.includes("const preferredCandidates = exactEstimateCandidates.length") &&
    source.includes("return preferredCandidates.length === 1") &&
    source.indexOf('job.status !== "draft"') >
      source.indexOf("function findPotentialEstimateJob("),
  "Only one unambiguous unbound draft with an exact estimate or exact same-trade project identity may be offered for guarded proposal-to-sold adoption",
);
assert(
  source.includes("const sameEstimateJobs = snapshot.jobs.filter(") &&
    source.includes("sameEstimateJobs.length !== 1") &&
    source.includes("potentialJob?.id !== sameEstimateJobs[0]?.id") &&
    source.includes("WeatherTech OS will not create or attach a second job automatically."),
  "A conflicting, ambiguous, or already operational same-estimate job must block automatic duplicate sold-job creation",
);
assert(
  source.includes("id: selectedProposalDepositInvoice.id") &&
    source.includes('onViewChange("invoices", { type: "invoice", id: result.invoiceId })'),
  "Existing and newly created proposal deposit invoices must open by exact identity",
);
assert(
  source.includes("focusedEstimateId: string | null") &&
    source.includes("focusedInvoiceId: string | null") &&
    source.includes("focusedJobId: string | null"),
  "Estimate, invoice, and job workspaces must accept explicit record focus",
);
assert(
  source.includes(
    "const focusedJobAlreadySelected = selectedJobId === focusedJob.id",
  ) &&
    source.includes("if (!focusedJobAlreadySelected) {") &&
    source.includes("[focusedJobId, selectedJobId, snapshot.jobs]"),
  "Selecting a visible job preserves its active list filters while external exact-job focus still clears filters",
);
assert(
  source.includes("const FINANCIAL_INVOICE_PAGE_SIZE = 8") &&
    source.includes(
      "usePagination(filteredInvoices, FINANCIAL_INVOICE_PAGE_SIZE)",
    ) &&
    source.includes(
      "pagedInvoices.some((summary) => summary.invoice.id === selectedInvoiceRecord.id)",
    ) &&
    source.includes("const focusedInvoiceIndex = buildFinancialOperationsSummary(") &&
    source.includes(
      "Math.floor(focusedInvoiceIndex / FINANCIAL_INVOICE_PAGE_SIZE) + 1",
    ),
  "An exact focused invoice opens on its real page while off-page invoices cannot retain hidden owner actions",
);
assert(
  source.includes("revokeProposalElectronicSignatureRequest({") &&
    source.includes("proposalRevisionId: revision.id") &&
    source.includes('data-testid="proposal-revoke-signature-button"'),
  "The owner must be able to revoke the exact active unsigned proposal link",
);
assert(
  source.includes("activeSignature && !signedAcceptance"),
  "The revocation control must not remain available after customer acceptance",
);
assert(
  source.includes('acceptance.acceptance_method === "native_electronic"') &&
    source.includes(
      "acceptance.id === selectedProposalRevision.accepted_acceptance_id",
    ) &&
    source.includes(
      "acceptance.signature_id === selectedProposalRevision.accepted_signature_id",
    ) &&
    source.includes(
      "acceptance.proposal_document_sha256 === selectedProposalDocument?.content_sha256",
    ) &&
    source.includes("acceptance.electronic_records_consented === true") &&
    source.includes("acceptance.signature_intent_acknowledged === true"),
  "Owner readiness must recognize only the exact native electronic acceptance and immutable proposal evidence",
);
assert(
  source.includes("const selectedProposalHasRegisteredReceipt = Boolean(") &&
    source.includes(
      "selectedProposalAcceptedSignature?.signed_document_id ===",
    ) &&
    source.includes(
      "selectedProposalAcceptance !== null && selectedProposalHasRegisteredReceipt",
    ) &&
    source.includes(
      "Recover and register the immutable electronic-signature receipt before creating the deposit invoice.",
    ),
  "Owner deposit and sold-job readiness must require the exact registered signature receipt",
);
assert(
  source.includes(
    "invoice.proposal_acceptance_id ===\n              selectedProposalModel.revision?.accepted_acceptance_id",
  ) &&
    source.includes("invoice.estimate_id === selectedEstimate.id") &&
    source.includes('selectedProposalDepositInvoice?.status !== "void"') &&
    source.includes("invoice.total === selectedProposalModel.financials.depositAmount") &&
    source.includes('payment.status === "posted"') &&
    source.includes("payment.customer_id === selectedProposalDepositInvoice.customer_id"),
  "Owner deposit readiness mirrors the exact non-void acceptance, estimate, amount, customer, and posted-payment database gate",
);
assert(
  proposalBuilderSource.includes(
    "hasSignedAcceptance: signedAcceptance !== null && hasRegisteredReceipt",
  ) &&
    proposalBuilderSource.includes("!signedAcceptance ||\n            !hasRegisteredReceipt") &&
    proposalBuilderSource.includes("Signed receipt required before deposit"),
  "Proposal readiness and exact-deposit creation remain disabled until the immutable signed receipt is registered",
);
assert(
  changeOrdersSource.includes('data-testid="change-order-signature-delivery-status"') &&
    changeOrdersSource.includes(
      "No change-order signing request is sent from this workspace.",
    ) &&
    !changeOrdersSource.includes("createSignature(") &&
    !changeOrdersSource.includes("Request signature"),
  "Change orders must not create or claim delivery of a fake customer signature request",
);
assert(
  source.includes("reconcileProposalElectronicSignatureReceipt({") &&
    source.includes('data-testid="proposal-reconcile-receipt-button"') &&
    source.includes("signedAcceptance && !model.revision?.signed_document_id"),
  "A signed proposal with missing receipt evidence must expose exact owner recovery",
);
assert(
  signatureRequestRouteSource.includes('requestedAction === "reconcile_receipt"') &&
    signatureRequestRouteSource.includes("getProposalSigningReceiptRecovery(recoveryKeys)") &&
    signatureRequestRouteSource.includes(
      "ensureProposalSigningReceiptFromRecovery(\n      recovered,\n      recoveryKeys",
    ),
  "Owner receipt recovery must rebuild only from the exact signed service-side evidence",
);
assert(
  signatureRequestRouteSource.indexOf("if (!ownerMembership)") <
    signatureRequestRouteSource.indexOf('requestedAction === "reconcile_receipt"'),
  "Receipt recovery must remain behind the exact company-owner authorization check",
);

console.log("Proposal owner exact-record navigation tests passed.");
