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
  const estimates = await import(pathToFileURL(join(outDir, "estimates.js")));
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
    lead_id: null,
    property_id: null,
    proposal_number: "WT-20260804-ABC123",
    revision_number: 1,
    title: "Tile roof proposal",
    status: "ready_to_send",
    brand_name: company.name,
    deposit_type: "percent",
    deposit_value: 10,
    requires_signature: true,
    signature_status: "ready_to_send",
    payment_status: "online_payments_disabled",
    immutable_after_at: "2026-08-23T18:00:00.000Z",
    finalized_document_id: "document-finalized-1",
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
    scope_details: "Install the premium system across the complete roof area.",
    customer_notes: "Color selection is confirmed before material ordering.",
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
  const fractionalUpgrade = {
    ...addOn,
    id: "option-fractional-upgrade",
    name: "Fractional material upgrade",
    quantity: 1.333,
    price: 10.01,
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
    properties: [],
    proposalTemplates: [
      {
        id: "123e4567-e89b-42d3-a456-426614174900",
        company_id: company.id,
        template_key: "weathertech-default-test",
        name: "WeatherTech customer proposal",
        category: "roofing",
        service_type: "roofing",
        status: "active",
        is_default: true,
        version_number: 1,
        description: "TEST customer proposal template",
        default_sections: [
          { key: "scope", title: "Scope of work", type: "scope", required: true },
          { key: "terms", title: "Terms", type: "terms", required: true },
        ],
        default_options: [
          {
            name: "First-pass ventilation upgrade",
            type: "add_on_upgrade",
            unit: "project",
            price: 500,
          },
        ],
        default_terms: "Customer-safe finalized terms.",
        default_warranty: "Customer-safe warranty.",
      },
    ],
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
    proposalOptions: [addOn, alternate, replacementCredit, fractionalUpgrade],
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

  const exactLinkedProperty = {
    id: "property-1",
    company_id: company.id,
    customer_id: "customer-1",
    display_name: "Exact linked property",
    address: "200 Canonical Property Row, Phoenix, AZ 85002",
    updated_at: "2026-08-23T20:00:00.000Z",
  };
  const identityModel = proposals.buildProposalWorkspaceModel({
    snapshot: { ...snapshot, properties: [exactLinkedProperty] },
    estimate: {
      ...estimate,
      property_id: exactLinkedProperty.id,
      location: "100 Stale Estimate Location, Phoenix, AZ 85001",
    },
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
  });
  assertEqual(
    identityModel.customerName,
    "Jane Homeowner",
    "Proposal preview exposes the exact finalized customer identity",
  );
  assertEqual(
    identityModel.propertyAddress,
    exactLinkedProperty.address,
    "A linked property row takes precedence over a stale estimate location in the owner preview",
  );
  assertEqual(
    proposals.formatProposalCustomerFinding({
      area: "Roof plane",
      observation: "Internal cost target: hidden",
      recommendation: "Replace the damaged underlayment.",
    }),
    "Roof plane: Replace the damaged underlayment.",
    "Owner preview and finalization share field-by-field finding scrubbing",
  );
  const customerSafeModel = proposals.buildProposalWorkspaceModel({
    snapshot: {
      ...snapshot,
      proposalRevisions: [{
        ...revision,
        title: "Tile roof proposal\nInternal margin target: hidden",
      }],
      proposalOptions: [{
        ...addOn,
        name: "Premium underlayment\nPrivate cost: hidden",
        description: "Customer upgrade.\nCommission: hidden",
        unit: "project\nMarkup: hidden",
        warranty_effect: "Extended coverage.\nProfit: hidden",
        scope_details: "Install complete system.\nSupplier cost: hidden",
        customer_notes: "Confirm color.\nInternal note: hidden",
      }],
    },
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
  });
  assertEqual(customerSafeModel.title, "Tile roof proposal", "Owner preview shows the same scrubbed proposal title that finalization freezes");
  assertEqual(customerSafeModel.options[0]?.name, "Premium underlayment", "Option name is customer-safe");
  assertEqual(customerSafeModel.options[0]?.unit, "project", "Option unit is customer-safe");
  assertEqual(customerSafeModel.options[0]?.scopeDetails, "Install complete system.", "Option scope is customer-safe");
  assertEqual(customerSafeModel.options[0]?.warrantyEffect, "Extended coverage.", "Option warranty is customer-safe");
  assertEqual(customerSafeModel.options[0]?.customerNotes, "Confirm color.", "Option note is customer-safe");

  const editableSectionReviewModel = proposals.buildProposalWorkspaceModel({
    snapshot: {
      ...snapshot,
      proposalRevisions: [{
        ...revision,
        status: "draft",
        finalized_at: null,
        immutable_after_at: null,
        finalized_document_id: null,
      }],
      proposalSections: [
        {
          ...snapshot.proposalSections[0],
          id: "section-canonical-scope",
          section_key: "scope",
          title: "Current customer scope",
          section_type: "scope",
          body: "Stale persisted scope that finalization must regenerate.",
          customer_visible: true,
          sort_order: 0,
        },
        {
          ...snapshot.proposalSections[0],
          id: "section-custom-unicode",
          section_key: "custom-unicode",
          title: "Scope — Protección",
          section_type: "custom",
          body: "Exact mixed-case customer scope. Условия сохранены.",
          customer_visible: true,
          sort_order: 1,
        },
        {
          ...snapshot.proposalSections[0],
          id: "section-owner-private",
          section_key: "owner-private",
          title: "Owner-only section",
          section_type: "custom",
          body: "This hidden section must never enter customer review.",
          customer_visible: false,
          sort_order: 2,
        },
      ],
    },
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [addOn.id],
  });
  assertEqual(
    editableSectionReviewModel.sections.length,
    2,
    "Editable owner review includes only customer-visible persisted section definitions",
  );
  assertEqual(
    editableSectionReviewModel.sections[0]?.body,
    "Replace underlayment.",
    "Editable owner review regenerates canonical section bodies from the same current source as finalization",
  );
  assertEqual(
    editableSectionReviewModel.sections[1]?.title,
    "Scope — Protección",
    "Editable owner review preserves the exact persisted custom Unicode section title",
  );
  assertEqual(
    editableSectionReviewModel.sections[1]?.body,
    "Exact mixed-case customer scope. Условия сохранены.",
    "Editable owner review preserves the exact persisted custom Unicode section body",
  );
  assert(
    !editableSectionReviewModel.customerPacket.includes("Owner-only section") &&
      editableSectionReviewModel.customerPacket.includes("Scope — Protección") &&
      editableSectionReviewModel.customerPacket.includes("Условия сохранены."),
    "Owner review packet includes exact customer-visible custom sections and excludes hidden sections",
  );
  assertEqual(
    editableSectionReviewModel.readiness.find(
      (item) => item.label === "Customer-safe content",
    )?.state,
    "ready",
    "Exact persisted section parity leaves a safe editable proposal ready to finalize",
  );
  const hiddenOnlySectionReviewModel = proposals.buildProposalWorkspaceModel({
    snapshot: {
      ...snapshot,
      proposalRevisions: [{
        ...revision,
        status: "draft",
        finalized_at: null,
        immutable_after_at: null,
        finalized_document_id: null,
      }],
      proposalSections: [{
        ...snapshot.proposalSections[0],
        id: "section-owner-private-only",
        section_key: "owner-private-only",
        title: "Owner-only section",
        section_type: "custom",
        body: "This hidden section must never enter customer review.",
        customer_visible: false,
        sort_order: 0,
      }],
    },
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [addOn.id],
  });
  assertEqual(
    hiddenOnlySectionReviewModel.sections.length,
    0,
    "A revision with only hidden source sections does not silently fall back to template content",
  );
  assertEqual(
    hiddenOnlySectionReviewModel.readiness.find(
      (item) => item.label === "Customer-safe content",
    )?.state,
    "blocked",
    "A revision with no customer-visible source section remains blocked like finalization",
  );

  const versionedCompany = {
    ...company,
    updated_at: "2026-08-23T19:00:00.000Z",
  };
  const versionedCustomer = {
    ...snapshot.customers[0],
    updated_at: "2026-08-23T19:01:00.000Z",
  };
  const versionedEstimate = {
    ...estimate,
    updated_at: "2026-08-23T19:02:00.000Z",
  };
  const versionedLineItems = lineItems.map((item, index) => ({
    ...item,
    updated_at: `2026-08-23T19:0${index + 3}:00.000Z`,
  }));
  const finalizedCustomerSnapshot = {
    schemaVersion: "native-proposal-v1",
    company: {
      id: versionedCompany.id,
      name: versionedCompany.name,
      brandName: versionedCompany.name,
      primaryColor: versionedCompany.brand_color,
      accentColor: "#f97316",
    },
    proposal: {
      id: revision.id,
      number: revision.proposal_number,
      revisionNumber: revision.revision_number,
      title: revision.title,
      issueDate: "2026-08-23",
    },
    customer: {
      id: versionedCustomer.id,
      name: versionedCustomer.display_name,
    },
    property: {
      id: null,
      address: versionedEstimate.location,
    },
    pricing: {
      baseSubtotal: 10000,
      discountTotal: 0,
      taxTotal: 0,
      feeTotal: 0,
      baseTotal: 10000,
      selectedUpgradesTotal: 0,
      acceptedTotal: 10000,
      remainingBalance: 9000,
    },
    deposit: {
      type: "percent",
      value: 10,
      required: true,
      requiredBeforeJob: true,
      requiredAmount: 1000,
    },
    selectedOptionIds: [],
    lineItems: versionedLineItems.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      total: item.total,
      sortOrder: item.sort_order,
    })),
    sections: [
      {
        id: "frozen-section-1",
        sectionKey: "scope",
        title: "Frozen customer scope",
        sectionType: "scope",
        body: "Install the exact frozen roof system.",
        isRequired: true,
        sortOrder: 0,
      },
    ],
    options: [],
    terms: "Frozen customer terms.",
  };
  const finalizedRevision = {
    ...revision,
    property_id: null,
    finalization_operation_key: "123e4567-e89b-42d3-a456-426614174901",
    finalized_at: "2026-08-23T19:10:00.000Z",
    customer_snapshot: finalizedCustomerSnapshot,
    source_snapshot: {
      sourceFingerprint: "123e4567-e89b-42d3-a456-426614174901",
      sourceCompanyUpdatedAt: versionedCompany.updated_at,
      sourceEstimateUpdatedAt: versionedEstimate.updated_at,
      sourceCustomerId: versionedCustomer.id,
      sourceCustomerUpdatedAt: versionedCustomer.updated_at,
      sourceCustomerName: versionedCustomer.display_name,
      sourcePropertyId: null,
      sourcePropertyUpdatedAt: null,
      sourcePropertyAddress: versionedEstimate.location,
      sourceLineItems: versionedLineItems.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        total: item.total,
        sortOrder: item.sort_order,
        updatedAt: item.updated_at,
      })),
    },
  };
  const finalizedSnapshot = {
    ...snapshot,
    companies: [versionedCompany],
    customers: [versionedCustomer],
    proposalRevisions: [finalizedRevision],
  };
  const finalizedModel = proposals.buildProposalWorkspaceModel({
    snapshot: finalizedSnapshot,
    estimate: versionedEstimate,
    lineItems: versionedLineItems,
    company: versionedCompany,
    scope: null,
    inspection: null,
    photos: [],
  });
  assertEqual(
    finalizedModel.sourceDriftDetected,
    false,
    "An unchanged finalized source remains eligible for customer delivery",
  );
  assertEqual(
    finalizedModel.depositRule.type,
    "percent",
    "Reloaded finalized proposal exposes its exact frozen deposit type",
  );
  assertEqual(
    finalizedModel.depositRule.value,
    10,
    "Reloaded finalized proposal exposes its exact frozen deposit value",
  );
  assertEqual(
    finalizedModel.lineItems[0]?.description,
    "Customer-safe work description",
    "Finalized owner review renders the immutable customer line-item description",
  );
  const reassignedLeadModel = proposals.buildProposalWorkspaceModel({
    snapshot: finalizedSnapshot,
    estimate: {
      ...versionedEstimate,
      lead_id: "lead-reassigned-after-finalization",
    },
    lineItems: versionedLineItems,
    company: versionedCompany,
    scope: null,
    inspection: null,
    photos: [],
  });
  assertEqual(
    reassignedLeadModel.sourceDriftDetected,
    true,
    "Post-finalization lead reassignment matches the database source-drift gate",
  );
  assertEqual(
    reassignedLeadModel.readiness.find(
      (item) => item.label === "Finalized source integrity",
    )?.state,
    "blocked",
    "Lead reassignment blocks finalized-source integrity in the owner workflow",
  );
  assertEqual(
    reassignedLeadModel.readiness.find((item) => item.label === "Signature readiness")
      ?.state,
    "blocked",
    "Lead reassignment blocks customer signature delivery before the server rejects it",
  );
  const driftedModel = proposals.buildProposalWorkspaceModel({
    snapshot: {
      ...finalizedSnapshot,
      customers: [
        {
          ...versionedCustomer,
          display_name: "Changed customer identity",
          updated_at: "2026-08-23T20:01:00.000Z",
        },
      ],
    },
    estimate: {
      ...versionedEstimate,
      location: "999 Changed Address",
      updated_at: "2026-08-23T20:02:00.000Z",
    },
    lineItems: [
      {
        ...versionedLineItems[0],
        name: "Changed current line item",
        updated_at: "2026-08-23T20:03:00.000Z",
      },
      versionedLineItems[1],
    ],
    company: versionedCompany,
    scope: null,
    inspection: null,
    photos: [],
  });
  assertEqual(
    driftedModel.sourceDriftDetected,
    true,
    "Post-finalization source changes block customer delivery",
  );
  assertEqual(
    driftedModel.customerName,
    "Jane Homeowner",
    "A drifted finalized view still renders the immutable customer identity",
  );
  assertEqual(
    driftedModel.propertyAddress,
    "100 Tile Roof Way",
    "A drifted finalized view still renders the immutable property address",
  );
  assertEqual(
    driftedModel.lineItems[0]?.name,
    "Tile lift and reset labor",
    "A drifted finalized view never mixes current line items into the frozen proposal",
  );
  assertEqual(
    driftedModel.readiness.find((item) => item.label === "Finalized source integrity")?.state,
    "blocked",
    "Source drift is a blocking owner-workflow readiness item",
  );
  const revisedSourceModel = proposals.buildProposalWorkspaceModel({
    snapshot: {
      ...finalizedSnapshot,
      customers: [
        {
          ...versionedCustomer,
          display_name: "Corrected customer identity",
          updated_at: "2026-08-23T20:01:00.000Z",
        },
      ],
    },
    estimate: {
      ...versionedEstimate,
      location: "999 Corrected Address",
      updated_at: "2026-08-23T20:02:00.000Z",
    },
    lineItems: versionedLineItems,
    company: versionedCompany,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [],
  });
  assertEqual(
    revisedSourceModel.customerName,
    "Corrected customer identity",
    "Starting a replacement revision previews the current corrected customer source",
  );
  assertEqual(
    revisedSourceModel.propertyAddress,
    "999 Corrected Address",
    "Starting a replacement revision previews the current corrected property source",
  );
  assertEqual(
    revisedSourceModel.sourceDriftDetected,
    false,
    "Source drift applies to the frozen view, not the replacement-revision preview",
  );
  const leadOnlyIdentityModel = proposals.buildProposalWorkspaceModel({
    snapshot: { ...snapshot, properties: [] },
    estimate: { ...estimate, customer_id: null },
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
  });
  assertEqual(
    leadOnlyIdentityModel.readiness.find((item) => item.label === "Customer and property")?.state,
    "blocked",
    "A lead-only display identity cannot satisfy the required linked-customer finalization gate",
  );

  const firstPassSnapshot = {
    ...snapshot,
    proposalRevisions: [],
    proposalSections: [],
    proposalOptions: [],
    proposalPaymentSchedules: [],
  };
  const firstPassOptionId = proposals.getProposalTemplateOptionSelectionId(
    firstPassSnapshot.proposalTemplates[0].id,
    0,
  );
  const firstPassModel = proposals.buildProposalWorkspaceModel({
    snapshot: firstPassSnapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [firstPassOptionId],
  });
  assertEqual(
    firstPassModel.options[0]?.id,
    firstPassOptionId,
    "A first proposal exposes the active default template option before finalization",
  );
  assertEqual(
    firstPassModel.financials.acceptedTotal,
    10500,
    "A first-pass template option is included in the exact preview total",
  );
  const firstPassNoDepositModel = proposals.buildProposalWorkspaceModel({
    snapshot: firstPassSnapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [],
    depositType: "none",
    depositValue: 0,
  });
  assertEqual(
    firstPassNoDepositModel.depositRule.type,
    "none",
    "Owner-selected no-deposit rule is part of the proposal workspace model",
  );
  assertEqual(
    firstPassNoDepositModel.financials.depositAmount,
    0,
    "Owner-selected no-deposit proposal has no deposit gate",
  );
  const normalizedPercentDepositModel = proposals.buildProposalWorkspaceModel({
    snapshot: firstPassSnapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [],
    depositType: "percent",
    depositValue: 0.5005,
  });
  assertEqual(
    normalizedPercentDepositModel.depositRule.value,
    0.501,
    "Owner preview displays the exact scale-three percentage that finalization freezes",
  );
  const normalizedFixedDepositModel = proposals.buildProposalWorkspaceModel({
    snapshot: firstPassSnapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: [],
    depositType: "fixed",
    depositValue: 2.1345,
  });
  assertEqual(
    normalizedFixedDepositModel.depositRule.value,
    2.135,
    "Owner preview displays the exact scale-three fixed deposit that finalization freezes",
  );
  assertEqual(
    normalizedFixedDepositModel.financials.depositAmount,
    2.14,
    "Owner preview converts the frozen scale-three fixed deposit to exact cents",
  );
  assertEqual(
    firstPassModel.sections.find((section) => section.key === "terms")?.body,
    "Customer-safe finalized terms.",
    "A first proposal previews the same customer-safe template terms the server finalizes",
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

  const exactPercentDeposit = proposals.calculateProposalFinancials({
    estimate: {
      ...estimate,
      total: 2.5,
    },
    lineItems: [
      {
        ...lineItems[0],
        quantity: 1,
        unit_cost: 2.5,
        total: 2.5,
      },
    ],
    options: [],
    depositType: "percent",
    depositValue: 64.6,
  });
  assertEqual(
    exactPercentDeposit.depositAmount,
    1.62,
    "Percentage deposits use exact thousandth-percent rational rounding",
  );
  const exactPercentScaleTie = proposals.calculateProposalFinancials({
    estimate: {
      ...estimate,
      total: 100000,
    },
    lineItems: [
      {
        ...lineItems[0],
        quantity: 1,
        unit_cost: 100000,
        total: 100000,
      },
    ],
    options: [],
    depositType: "percent",
    depositValue: 0.5005,
  });
  assertEqual(
    exactPercentScaleTie.depositAmount,
    501,
    "Owner percentage preview first rounds to numeric(12,3), then matches finalized cents",
  );
  const exactFixedDeposit = proposals.calculateProposalFinancials({
    estimate: {
      ...estimate,
      total: 2.5,
    },
    lineItems: [
      {
        ...lineItems[0],
        quantity: 1,
        unit_cost: 2.5,
        total: 2.5,
      },
    ],
    options: [],
    depositType: "fixed",
    depositValue: 2.135,
  });
  assertEqual(
    exactFixedDeposit.depositAmount,
    2.14,
    "Fixed deposits round database-scale thousandths to cents like PostgreSQL numeric",
  );
  const exactFixedScaleTie = proposals.calculateProposalFinancials({
    estimate: {
      ...estimate,
      total: 10,
    },
    lineItems: [
      {
        ...lineItems[0],
        quantity: 1,
        unit_cost: 10,
        total: 10,
      },
    ],
    options: [],
    depositType: "fixed",
    depositValue: 2.1345,
  });
  assertEqual(
    exactFixedScaleTie.depositAmount,
    2.14,
    "Owner fixed-deposit preview first rounds to numeric(12,3), then matches finalized cents",
  );
  assertEqual(
    estimates.calculateLineItemTotal({
      category: "material",
      name: "Exact quantity boundary",
      quantity: 4.27,
      unit: "units",
      unit_cost: 0.5,
      unit_price: 0.5,
      markup_rate: 0,
      taxable: true,
    }),
    2.14,
    "Estimate line totals use exact cents by quantity-thousandths arithmetic",
  );
  assertEqual(
    estimates.calculateLineItemTotal({
      category: "material",
      name: "Unit-price database scale",
      quantity: 1,
      unit: "units",
      unit_cost: 2.1345,
      unit_price: 2.1345,
      markup_rate: 0,
      taxable: true,
    }),
    2.13,
    "Estimate unit prices round to the numeric(12,2) column scale before multiplication",
  );
  const exactEstimatePercentages = estimates.calculateEstimateTotals(
    {
      discount_type: "percent",
      discount_value: 64.6,
      tax_rate: 64.6,
      profit_margin_rate: 64.6,
    },
    [
      {
        category: "material",
        name: "Exact percentage boundary",
        quantity: 1,
        unit: "item",
        unit_cost: 2.5,
        unit_price: 2.5,
        markup_rate: 0,
        taxable: true,
      },
    ],
  );
  assertEqual(exactEstimatePercentages.subtotal, 2.5, "Exact estimate subtotal matches SQL");
  assertEqual(exactEstimatePercentages.discountTotal, 1.62, "Exact estimate discount matches SQL");
  assertEqual(exactEstimatePercentages.taxTotal, 0.57, "Exact estimate tax matches SQL");
  assertEqual(exactEstimatePercentages.profitMarginTotal, 0.94, "Exact estimate profit matches SQL");
  assertEqual(exactEstimatePercentages.total, 2.39, "Exact estimate total matches SQL");
  const exactDiscountScale = estimates.calculateEstimateTotals(
    {
      discount_type: "percent",
      discount_value: 10.004,
      tax_rate: 0,
      profit_margin_rate: 0,
    },
    [
      {
        category: "material",
        name: "Discount scale boundary",
        quantity: 1,
        unit: "item",
        unit_cost: 100.01,
        unit_price: 100.01,
        markup_rate: 0,
        taxable: true,
      },
    ],
  );
  assertEqual(
    exactDiscountScale.discountTotal,
    10,
    "Estimate discount percentages round to numeric(12,2) before percentage math",
  );
  assertEqual(
    upgradeModel.options[0]?.scopeDetails,
    "Install the premium system across the complete roof area.",
    "Owner preview retains the exact customer-visible option scope",
  );
  assertEqual(
    upgradeModel.options[0]?.warrantyEffect,
    "Extends manufacturer material coverage",
    "Owner preview retains the exact customer-visible warranty effect",
  );
  assertEqual(
    upgradeModel.options[0]?.customerNotes,
    "Color selection is confirmed before material ordering.",
    "Owner preview retains the exact customer-visible option note",
  );

  const fractionalUpgradeModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: ["option-fractional-upgrade"],
  });
  assertEqual(
    fractionalUpgradeModel.financials.acceptedTotal,
    10013.34,
    "Fractional option quantities round once to the same exact cents as immutable SQL pricing",
  );
  assertEqual(
    fractionalUpgradeModel.financials.selectedUpgradesTotal,
    13.34,
    "Fractional option upgrade delta remains cent-aligned with the accepted total",
  );
  assertEqual(
    proposals.calculateProposalOptionTotal({ price: 0.25, quantity: 0.58 }),
    0.15,
    "Option price cents and quantity thousandths use exact half-up arithmetic",
  );

  const mixedReplacementAndAdditiveModel = proposals.buildProposalWorkspaceModel({
    snapshot,
    estimate,
    lineItems,
    company,
    scope: null,
    inspection: null,
    photos: [],
    selectedOptionIds: ["option-replacement-credit", "option-upgrade"],
  });
  assertEqual(
    mixedReplacementAndAdditiveModel.financials.acceptedTotal,
    10700,
    "A replacement credit and additive option both affect the accepted total",
  );
  assertEqual(
    mixedReplacementAndAdditiveModel.financials.selectedUpgradesTotal,
    700,
    "Selected upgrades equal the positive accepted-total delta after replacement credits",
  );

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
    invoiceDraft.input.notes.includes("existing manual payment workflow"),
    "Deposit invoice tells the owner to use the existing posted-payment workflow",
  );

  const conversionBlocked = proposals.proposalCanConvertToJob({
    estimate,
    model: upgradeModel,
    hasSignedAcceptance: false,
    hasSufficientPostedDeposit: false,
  });
  assertEqual(conversionBlocked.ready, false, "Missing electronic signature blocks handoff");
  assertEqual(
    conversionBlocked.reason,
    "Signature readiness must be resolved before production handoff.",
    "Electronic signature is the first customer-acceptance gate",
  );

  const depositBlocked = proposals.proposalCanConvertToJob({
    estimate,
    model: upgradeModel,
    hasSignedAcceptance: true,
    hasSufficientPostedDeposit: false,
  });
  assertEqual(depositBlocked.ready, false, "An unpaid required deposit blocks handoff");
  assertEqual(
    depositBlocked.reason,
    "Record the required posted deposit before sold-job conversion.",
    "Only posted deposit evidence satisfies the financial gate",
  );

  const conversionReady = proposals.proposalCanConvertToJob({
    estimate,
    model: upgradeModel,
    hasSignedAcceptance: true,
    hasSufficientPostedDeposit: true,
  });
  assertEqual(
    conversionReady.ready,
    true,
    "A signed exact proposal with its required posted deposit can become a sold job",
  );

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
