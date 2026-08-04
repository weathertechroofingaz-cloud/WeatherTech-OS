import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-proposal-builder-v2-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/crm/proposals.ts",
      "lib/crm/estimates.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outDir,
    ],
    {
      cwd,
      encoding: "utf8",
    },
  );

  if (compile.status !== 0) {
    throw new Error(
      `Could not compile proposal builder helpers.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const proposals = await import(pathToFileURL(join(outDir, "proposals.js")));
  const company = {
    id: "company-weathertech",
    name: "WeatherTech Roofing LLC",
    short_name: "WeatherTech",
    trade: "roofing",
    workflow_profile: "roofing",
    brand_color: "#6d28d9",
  };
  const estimate = {
    id: "estimate-abc123",
    company_id: company.id,
    customer_id: "customer-1",
    lead_id: null,
    property_id: null,
    title: "Tile roof replacement",
    status: "approved",
    service_type: "roofing",
    issue_date: "2026-08-04",
    created_at: "2026-08-04T12:00:00.000Z",
    updated_at: "2026-08-04T12:00:00.000Z",
    tax_rate: 0,
    discount_type: "fixed",
    discount_value: 0,
    profit_margin_rate: 0,
    subtotal: 10000,
    discount_total: 0,
    tax_total: 0,
    total: 10000,
    location: "100 Tile Roof Way",
    scope_of_work: "Replace underlayment.\nInternal margin target: 18%",
  };
  const lineItems = [
    {
      id: "line-1",
      estimate_id: estimate.id,
      category: "labor",
      name: "Tile lift and reset labor",
      description: "Customer-safe work description",
      quantity: 1,
      unit: "project",
      unit_cost: 6000,
      markup_rate: 0,
      taxable: false,
      sort_order: 0,
      total: 6000,
    },
    {
      id: "line-2",
      estimate_id: estimate.id,
      category: "material",
      name: "Underlayment material package",
      description: "Customer-safe material description",
      quantity: 1,
      unit: "package",
      unit_cost: 4000,
      markup_rate: 0,
      taxable: false,
      sort_order: 1,
      total: 4000,
    },
  ];
  const revision = {
    id: "proposal-revision-1",
    company_id: company.id,
    estimate_id: estimate.id,
    customer_id: "customer-1",
    proposal_number: "WT-20260804-ABC123",
    revision_number: 1,
    title: "Tile roof proposal",
    status: "ready_to_send",
    brand_name: company.name,
    deposit_type: "percent",
    deposit_value: 10,
    requires_signature: true,
    signature_status: "not_configured",
    payment_status: "online_payments_disabled",
  };
  const addOn = {
    id: "option-upgrade",
    company_id: company.id,
    proposal_revision_id: revision.id,
    option_type: "add_on_upgrade",
    option_group_key: "upgrades",
    name: "Premium underlayment upgrade",
    description: "Upgrade to premium underlayment.",
    quantity: 1,
    unit: "project",
    price: 1200,
    price_effect_type: "additive",
    base_replacement_amount: 0,
    customer_visible: true,
    selected: false,
    selected_by: null,
    selected_at: null,
    required: false,
    recommended: true,
    best_value: true,
    dependency_option_id: null,
    conflicting_option_id: null,
    warranty_effect: "Extends manufacturer material coverage",
    scope_details: null,
    source_line_item_id: null,
  };
  const alternate = {
    ...addOn,
    id: "option-alternate",
    option_type: "replacement_alternative",
    option_group_key: "roof-system",
    name: "Foam roofing alternate",
    price: 11800,
    price_effect_type: "full_alternate_total",
    recommended: false,
    best_value: false,
  };
  const replacementCredit = {
    ...addOn,
    id: "option-replacement-credit",
    option_type: "replacement_alternative",
    option_group_key: "roof-system",
    name: "Tile reuse pricing alternate",
    price: 9500,
    price_effect_type: "replace_base_amount",
    base_replacement_amount: 10000,
    recommended: false,
    best_value: false,
  };
  const snapshot = {
    companies: [company],
    customers: [
      {
        id: "customer-1",
        company_id: company.id,
        display_name: "Jane Homeowner",
        contact_name: "Jane Homeowner",
        phone: "+16025550123",
        email: "jane@example.test",
        property_address: "100 Tile Roof Way",
      },
    ],
    leads: [],
    proposalRevisions: [revision],
    proposalSections: [
      {
        id: "section-1",
        company_id: company.id,
        proposal_revision_id: revision.id,
        section_key: "scope",
        title: "Scope",
        section_type: "scope",
        body: "Install customer-facing roof system.\nInternal cost target: hidden",
        customer_visible: true,
        is_required: true,
        sort_order: 1,
      },
    ],
    proposalOptions: [addOn, alternate, replacementCredit],
    proposalPaymentSchedules: [],
  };

  const baseModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
  });

  assertEqual(
    baseModel.financials.baseTotal,
    10000,
    "Base proposal total is derived from current estimate totals",
  );
  assertEqual(
    baseModel.financials.acceptedTotal,
    10000,
    "Unselected upgrades do not alter accepted total",
  );
  assert(
    !baseModel.customerPacket.toLowerCase().includes("margin"),
    "Customer packet excludes margin language",
  );
  assert(
    !baseModel.customerPacket.toLowerCase().includes("internal cost"),
    "Customer packet excludes internal cost language",
  );

  const upgradeModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: ["option-upgrade"],
  });
  assertEqual(upgradeModel.financials.baseTotal, 10000, "Base total remains unchanged");
  assertEqual(
    upgradeModel.financials.selectedUpgradesTotal,
    1200,
    "Selected upgrade total is tracked separately",
  );
  assertEqual(
    upgradeModel.financials.acceptedTotal,
    11200,
    "Accepted total includes selected additive upgrades",
  );
  assertEqual(upgradeModel.financials.depositAmount, 1120, "Deposit uses accepted total");

  const alternateModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: ["option-alternate"],
  });
  assertEqual(
    alternateModel.financials.acceptedTotal,
    11800,
    "Full-alternate option replaces the base total",
  );

  const alternatePlusUpgradeModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: ["option-alternate", "option-upgrade"],
  });
  assertEqual(
    alternatePlusUpgradeModel.financials.baseTotal,
    10000,
    "Base proposal remains unchanged when an alternate and add-on are selected",
  );
  assertEqual(
    alternatePlusUpgradeModel.financials.acceptedTotal,
    13000,
    "Full-alternate plus additive upgrade is calculated once",
  );

  const alternatePlusReplacementModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: ["option-alternate", "option-replacement-credit"],
  });
  assertEqual(
    alternatePlusReplacementModel.financials.acceptedTotal,
    11800,
    "Full-alternate pricing does not stack another replacement adjustment",
  );

  const invoiceDraft = proposals.buildDepositInvoiceDraftFromProposal({
    estimate,
    model: upgradeModel,
  });
  assertEqual(
    invoiceDraft.input.invoice_number,
    "DEP-WT-20260804-ABC123",
    "Deposit invoice numbers derive from proposal number",
  );
  assertEqual(
    invoiceDraft.lineItems[0].unit_cost,
    1120,
    "Deposit invoice line uses calculated deposit",
  );
  assert(
    invoiceDraft.input.notes.includes("Online payment collection is disabled"),
    "Deposit invoice does not pretend online payments are active",
  );

  const conversionBlocked = proposals.proposalCanConvertToJob({
    estimate,
    model: upgradeModel,
    hasSignedAcceptance: false,
    hasDepositInvoice: false,
  });
  assertEqual(conversionBlocked.ready, false, "Missing deposit/signature blocks handoff");

  const conversionReady = proposals.proposalCanConvertToJob({
    estimate,
    model: upgradeModel,
    hasSignedAcceptance: true,
    hasDepositInvoice: true,
  });
  assertEqual(conversionReady.ready, true, "Accepted proposal can use existing job handoff");

  const ihcBrand = proposals.getProposalBranding({
    id: "company-ihc",
    name: "IHC Painting",
    short_name: "IHC",
    trade: "painting",
    workflow_profile: "painting",
    brand_color: "#f97316",
  });
  assertEqual(ihcBrand.proposalPrefix, "IHC", "IHC proposal numbering is brand-specific");
  assertEqual(ihcBrand.serviceLabel, "Painting proposal", "IHC terminology is painting-specific");

  console.log("Estimate Proposal Builder 2.0 tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
