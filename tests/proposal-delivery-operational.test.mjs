import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(cwd, ".weathertech-proposal-delivery-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function countOccurrences(value, needle) {
  return value.split(needle).length - 1;
}

function source(path) {
  return readFileSync(join(cwd, path), "utf8");
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/googleWorkspace/serverClient.ts",
      "lib/googleWorkspace/emailDrafts.ts",
      "lib/proposal-signing/constants.ts",
      "lib/proposal-signing/security.ts",
      "lib/proposal-signing/finalizationSafety.ts",
      "lib/pdf/deterministicUnicodePdf.ts",
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
    { cwd, encoding: "utf8" },
  );
  if (compile.status !== 0) {
    throw new Error(
      `Could not compile proposal delivery helpers.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  const serverClient = await import(
    pathToFileURL(join(outDir, "googleWorkspace", "serverClient.js"))
  );
  const emailDrafts = await import(
    pathToFileURL(join(outDir, "googleWorkspace", "emailDrafts.js"))
  );
  const constants = await import(
    pathToFileURL(join(outDir, "proposal-signing", "constants.js"))
  );
  const security = await import(
    pathToFileURL(join(outDir, "proposal-signing", "security.js"))
  );
  const finalizationSafety = await import(
    pathToFileURL(join(outDir, "proposal-signing", "finalizationSafety.js"))
  );
  const unicodePdf = await import(
    pathToFileURL(join(outDir, "pdf", "deterministicUnicodePdf.js"))
  );

  const proposalPdfInput = {
    proposalNumber: "WT-20260823-000001",
    revisionNumber: 2,
    title: "TEST roof replacement — Привет",
    companyName: "WeatherTech Roofing LLC",
    customerName: "José Иванов",
    propertyAddress: "100 Test Roof Way, Phoenix, AZ 85001",
    issueDate: "2026-08-23",
    sections: [
      {
        title: "Scope — Объём",
        body: "Remove and replace the customer-approved roof system.\nЗащита дома.",
      },
      { title: "Warranty", body: "Ten-year workmanship warranty." },
    ],
    lineItems: [
      {
        name: "Roof replacement",
        description: "Línea descriptiva con protección.\nОписание объёма работ.",
        quantity: 1,
        unit: "project",
        total: 10000,
      },
    ],
    options: [
      {
        name: "Premium underlayment",
        description: "Customer-visible upgrade — улучшение",
        selected: true,
        quantity: 2,
        unit: "squares",
        price: 1200,
        priceEffectType: "additive",
        baseReplacementAmount: 0,
        scopeDetails: "Install beneath the full approved roof area.",
        warrantyEffect: "Extends material protection.",
        customerNotes: "Cliente pidió protección adicional.",
      },
      {
        name: "Skylight allowance replacement",
        description: "Replace the exact base allowance.",
        selected: true,
        quantity: 2,
        unit: "each",
        price: 1500,
        priceEffectType: "replace_base_amount",
        baseReplacementAmount: 1000,
        scopeDetails: "Install two customer-selected skylights.",
        warrantyEffect: null,
        customerNotes: null,
      },
      {
        name: "Full alternate system",
        description: "Alternative complete system price.",
        selected: false,
        quantity: 1,
        unit: "project",
        price: 16000,
        priceEffectType: "full_alternate_total",
        baseReplacementAmount: 0,
        scopeDetails: "Replaces the complete base system if selected.",
        warrantyEffect: "Alternate manufacturer warranty.",
        customerNotes: null,
      },
      {
        name: "Fractional cent-rounding boundary",
        description: "Exact immutable cent arithmetic check.",
        selected: false,
        quantity: 0.58,
        unit: "units",
        price: 0.25,
        priceEffectType: "additive",
        baseReplacementAmount: 0,
        scopeDetails: null,
        warrantyEffect: null,
        customerNotes: null,
      },
    ],
    baseSubtotal: 10000,
    discountTotal: 200,
    taxTotal: 100,
    feeTotal: 100,
    baseTotal: 10000,
    selectedUpgradesTotal: 4400,
    acceptedTotal: 14400,
    depositRequired: true,
    depositType: "percent",
    depositValue: 10,
    depositAmount: 1440,
    remainingBalance: 12960,
    terms: "Términos finalizados. Условия окончательны.",
  };
  const proposalPdf = serverClient.buildFinalizedProposalPdfAttachment(proposalPdfInput);
  const repeatPdf = serverClient.buildFinalizedProposalPdfAttachment(proposalPdfInput);
  assertEqual(
    proposalPdf.content.subarray(0, 8).toString("utf8"),
    "%PDF-1.7",
    "Finalized customer artifact is a PDF",
  );
  assertEqual(
    serverClient.hashProposalDocumentContent(proposalPdf.content),
    serverClient.hashProposalDocumentContent(repeatPdf.content),
    "The same immutable proposal snapshot renders byte-for-byte deterministically",
  );
  const extractedProposalText = unicodePdf
    .extractDeterministicUnicodePdfTextForTesting(proposalPdf.content)
    .join("\n");
  const normalizedExtractedProposalText = extractedProposalText.replace(/\s+/g, " ");
  assert(
    extractedProposalText.includes("Accepted total: $14400.00"),
    "Finalized PDF includes the exact quantity-aware accepted total",
  );
  for (const pricingDisclosure of [
    "Base subtotal: $10000.00",
    "Discount total: $200.00",
    "Tax total: $100.00",
    "Fee total: $100.00",
  ]) {
    assert(
      extractedProposalText.includes(pricingDisclosure),
      `Finalized PDF preserves pricing disclosure: ${pricingDisclosure}`,
    );
  }
  assert(
    extractedProposalText.includes("SELECTED: Premium underlayment") &&
      extractedProposalText.includes("Option total: $2400.00"),
    "Finalized PDF includes the exact selected option and quantity-times-price total",
  );
  assert(
    extractedProposalText.includes("NOT SELECTED: Fractional cent-rounding boundary") &&
      extractedProposalText.includes("Option total: $0.15"),
    "Finalized PDF quantizes option quantity thousandths before exact half-up cent rounding",
  );
  assert(
    normalizedExtractedProposalText.includes(
      "Pricing effect: Replaces $1000.00 of the base proposal. Net adjustment: +$2000.00.",
    ) &&
      extractedProposalText.includes("Selected upgrades: $4400.00") &&
      extractedProposalText.includes("Accepted total: $14400.00"),
    "Non-additive replacement math disclosed in the PDF reconciles base total plus selected adjustments to accepted total",
  );
  assert(
    normalizedExtractedProposalText.includes(
      "Pricing effect: Sets the full alternate total to $16000.00, replacing the $10000.00 base total. Net adjustment: +$6000.00.",
    ),
    "Full-alternate option contract discloses its exact base replacement math",
  );
  assert(
    extractedProposalText.includes("Deposit terms: 10% of the accepted total") &&
      extractedProposalText.includes("Required deposit: $1440.00"),
    "Finalized PDF preserves deposit type, value, and resulting required amount",
  );
  for (const customerVisibleText of [
    "José Иванов",
    "Привет",
    "Scope — Объём",
    "Línea descriptiva con protección.",
    "Описание объёма работ.",
    "Customer-visible upgrade — улучшение",
    "Install beneath the full approved roof area.",
    "Extends material protection.",
    "Cliente pidió protección adicional.",
    "Términos finalizados. Условия окончательны.",
  ]) {
    assert(
      extractedProposalText.includes(customerVisibleText),
      `Finalized PDF preserves exact Unicode customer text: ${customerVisibleText}`,
    );
  }
  const unsupportedGlyph = unicodePdf.findUnsupportedDeterministicPdfGlyph([
    "Unsupported roof character 屋",
  ]);
  assertEqual(
    unsupportedGlyph?.codePointLabel,
    "U+5C4B",
    "Unsupported customer script is refused before transliteration",
  );
  const unsafeNamePdf = serverClient.buildFinalizedProposalPdfAttachment({
    ...proposalPdfInput,
    proposalNumber: '../WT "QA"/0001',
  });
  assertEqual(
    unsafeNamePdf.fileName,
    "WT-QA-0001-revision-2.pdf",
    "Attachment filename is a bounded safe basename independent of the exact displayed proposal number",
  );
  assert(
    unicodePdf
      .extractDeterministicUnicodePdfTextForTesting(unsafeNamePdf.content)
      .join("\n")
      .includes('Proposal ../WT "QA"/0001 - Revision 2'),
    "Filename normalization does not alter the proposal number displayed inside the immutable PDF",
  );
  const longToken = "A".repeat(320);
  const longTokenPdf = unicodePdf.buildDeterministicUnicodeTextPdf({
    lines: [longToken],
  });
  assert(
    unicodePdf
      .extractDeterministicUnicodePdfTextForTesting(longTokenPdf)
      .join("")
      .includes(longToken),
    "Unicode PDF wrapping never truncates a long unbroken customer-visible token",
  );
  const groupedPdf = unicodePdf.buildDeterministicUnicodeTextPdf({
    lines: [
      ["Header", "Customer", ""],
      ["SELECTED: Whole option", "Quantity: 1 project", "Option total: $1.00", ""],
    ],
    linesPerPage: 4,
  });
  const groupedText = unicodePdf.extractDeterministicUnicodePdfTextForTesting(groupedPdf);
  assert(
    groupedText.indexOf("Page 1 of 2") < groupedText.indexOf("SELECTED: Whole option") &&
      groupedText.indexOf("SELECTED: Whole option") < groupedText.indexOf("Page 2 of 2"),
    "A customer option block that fits on a page is never split or orphaned across pages",
  );
  assert(
    !proposalPdf.content.toString("utf8").includes("internal margin") &&
      !proposalPdf.content.toString("utf8").includes("estimate.notes"),
    "Finalized PDF helper has no internal estimate-note fallback",
  );

  const signingRequestId = "123e4567-e89b-42d3-a456-426614174000";
  const draftPlan = emailDrafts.buildProposalSignatureEmailDraft({
    companyId: "223e4567-e89b-42d3-a456-426614174000",
    companyName: "WeatherTech Roofing LLC",
    customerId: "323e4567-e89b-42d3-a456-426614174000",
    customerName: "TEST Homeowner",
    recipientEmail: "homeowner@example.test",
    leadId: null,
    propertyId: "423e4567-e89b-42d3-a456-426614174000",
    estimateId: "523e4567-e89b-42d3-a456-426614174000",
    proposalRevisionId: "623e4567-e89b-42d3-a456-426614174000",
    proposalNumber: "WT-20260823-000001",
    revisionNumber: 2,
    acceptedTotal: 11200,
    revisionSha256: "a".repeat(64),
    termsSha256: "b".repeat(64),
    documentId: "723e4567-e89b-42d3-a456-426614174000",
    documentSha256: "c".repeat(64),
    signingRequestId,
    integrationConnectionId: "823e4567-e89b-42d3-a456-426614174000",
    fromEmail: "sales@weathertech.example",
  });
  assert(draftPlan.ok, "Exact immutable proposal data prepares a Gmail draft");
  const draft = {
    ...draftPlan.input,
    id: "923e4567-e89b-42d3-a456-426614174000",
    provider: "gmail",
    cc_email: null,
    gmail_message_id: null,
    last_error: null,
    created_at: "2026-08-23T20:00:00.000Z",
    updated_at: "2026-08-23T20:00:00.000Z",
  };
  assertEqual(
    draft.body.split(constants.PROPOSAL_SIGNING_LINK_PLACEHOLDER).length - 1,
    1,
    "Persisted owner draft contains exactly one safe link placeholder",
  );
  assertEqual(
    draft.metadata.proposalSigningRequestId,
    signingRequestId,
    "Persisted owner draft carries the exact token-free request identity",
  );
  assertEqual(
    draft.metadata.proposalDocumentSha256,
    "c".repeat(64),
    "Persisted owner draft binds the exact proposal PDF digest",
  );
  assert(
    draft.body.includes(
      "For security, this signing link expires 14 days after this email is sent.",
    ),
    "Customer signature draft truthfully states the deterministic 14-day link lifetime",
  );
  const alreadySentApproval = serverClient.validateGmailOwnerApproval({
    message: { ...draft, status: "sent", sync_status: "sent" },
    isOwner: true,
    approvalAction: "owner_approved_send",
  });
  assertEqual(
    alreadySentApproval.status,
    "already_sent",
    "A provider-confirmed sent signature email cannot enter Gmail delivery again",
  );

  const rawToken = security.generateProposalSigningToken();
  const signingUrl = constants.buildProposalSigningUrl(
    "https://weathertech-os.vercel.app",
    signingRequestId,
    rawToken,
  );
  const outbound = serverClient.materializeProposalSignatureEmail({
    message: draft,
    signingUrl,
  });
  assert(
    outbound.body.includes(`#token=${rawToken}`) &&
      !outbound.body.includes(constants.PROPOSAL_SIGNING_LINK_PLACEHOLDER),
    "Raw bearer token exists only in the in-memory outbound URL fragment",
  );
  assert(
    draft.body.includes(constants.PROPOSAL_SIGNING_LINK_PLACEHOLDER) &&
      !draft.body.includes(rawToken),
    "In-memory substitution does not mutate the persisted draft",
  );
  assert(
    !JSON.stringify(outbound.metadata).includes(rawToken) &&
      !JSON.stringify(outbound.metadata).includes(security.hashProposalSigningToken(rawToken)),
    "Neither raw token nor its hash is added to email metadata",
  );
  const rawMessage = Buffer.from(
    serverClient.buildGmailRawMessage(outbound),
    "base64url",
  ).toString("utf8");
  assert(
    rawMessage.includes(`#token=${rawToken}`),
    "Only the provider-bound MIME message contains the raw signing URL",
  );

  const canonicalReadNames = [
    "photo",
    "section",
    "option",
    "template",
    "revision",
    "stale_option",
    "stale_revision",
  ];
  for (const failedRead of canonicalReadNames) {
    const canonicalReads = canonicalReadNames.map((name) => ({
        name,
        error: name === failedRead ? new Error(`${name} read unavailable`) : null,
      }));
    assertEqual(
      finalizationSafety.getFailedCanonicalSourceRead(canonicalReads),
      failedRead,
      `A mocked ${failedRead} query error blocks canonical proposal finalization`,
    );
  }

  const expectedArtifact = {
    documentId: "a23e4567-e89b-42d3-a456-426614174000",
    companyId: "b23e4567-e89b-42d3-a456-426614174000",
    proposalRevisionId: "c23e4567-e89b-42d3-a456-426614174000",
    artifactOperationKey: "d23e4567-e89b-42d3-a456-426614174000",
    contentSha256: serverClient.hashProposalDocumentContent(proposalPdf.content),
    storageBucket: "customer-documents",
    storagePath:
      "b23e4567-e89b-42d3-a456-426614174000/proposals/c23e4567-e89b-42d3-a456-426614174000/a23e4567-e89b-42d3-a456-426614174000.pdf",
    fileName: proposalPdf.fileName,
    fileSizeBytes: proposalPdf.content.byteLength,
    mimeType: "application/pdf",
  };
  for (const preservedStatus of [
    "ready_to_send",
    "sent",
    "viewed",
    "accepted",
    "converted_to_job",
  ]) {
    assertEqual(
      finalizationSafety.getExistingFinalizedProposalStatus(preservedStatus),
      preservedStatus,
      `An exact finalization retry preserves the existing ${preservedStatus} lifecycle state`,
    );
  }
  assertEqual(
    finalizationSafety.getExistingFinalizedProposalStatus("declined"),
    null,
    "A terminal proposal outside the retry contract is refused instead of relabeled ready to send",
  );
  const exactRegisteredArtifact = {
    id: expectedArtifact.documentId,
    company_id: expectedArtifact.companyId,
    proposal_revision_id: expectedArtifact.proposalRevisionId,
    artifact_operation_key: expectedArtifact.artifactOperationKey,
    content_sha256: expectedArtifact.contentSha256,
    storage_bucket: expectedArtifact.storageBucket,
    storage_path: expectedArtifact.storagePath,
    file_name: expectedArtifact.fileName,
    file_size_bytes: expectedArtifact.fileSizeBytes,
    mime_type: expectedArtifact.mimeType,
    file_url: null,
    immutable_after_at: "2026-08-23T20:00:00.000Z",
  };
  assert(
    finalizationSafety.isExactRegisteredProposalArtifact(
      exactRegisteredArtifact,
      expectedArtifact,
    ),
    "An ambiguous registration converges only to the exact immutable document row",
  );
  assert(
    !finalizationSafety.isExactRegisteredProposalArtifact(
      { ...exactRegisteredArtifact, storage_path: "unexpected/object.pdf" },
      expectedArtifact,
    ),
    "A mismatching document row cannot be treated as converged registration",
  );

  function artifactStorageMock({
    content = proposalPdf.content,
    downloadError = null,
    removed = [{ name: expectedArtifact.storagePath }],
    removeError = null,
    exists = false,
    existsError = { status: 404 },
  } = {}) {
    const calls = { download: 0, remove: 0, exists: 0 };
    return {
      calls,
      storage: {
        async download(path) {
          calls.download += 1;
          assertEqual(path, expectedArtifact.storagePath, "Cleanup downloads only the exact path");
          return {
            data: downloadError
              ? null
              : {
                  async arrayBuffer() {
                    return Uint8Array.from(content).buffer;
                  },
                },
            error: downloadError,
          };
        },
        async remove(paths) {
          calls.remove += 1;
          assertEqual(paths.length, 1, "Cleanup removes exactly one path");
          assertEqual(
            paths[0],
            expectedArtifact.storagePath,
            "Cleanup removes only the exact expected path",
          );
          return { data: removed, error: removeError };
        },
        async exists(path) {
          calls.exists += 1;
          assertEqual(path, expectedArtifact.storagePath, "Cleanup verifies the exact path");
          return { data: exists, error: existsError };
        },
      },
    };
  }

  const verifiedCleanup = artifactStorageMock();
  assert(
    await finalizationSafety.removeExactUnregisteredProposalArtifact({
      storage: verifiedCleanup.storage,
      storagePath: expectedArtifact.storagePath,
      contentSha256: expectedArtifact.contentSha256,
    }),
    "Exact unregistered proposal bytes can be removed with one-path and missing-object proof",
  );
  assertEqual(verifiedCleanup.calls.remove, 1, "Verified cleanup removes once");
  assertEqual(verifiedCleanup.calls.exists, 1, "Verified cleanup proves absence once");

  const downloadFault = artifactStorageMock({ downloadError: new Error("timeout") });
  assert(
    !(await finalizationSafety.removeExactUnregisteredProposalArtifact({
      storage: downloadFault.storage,
      storagePath: expectedArtifact.storagePath,
      contentSha256: expectedArtifact.contentSha256,
    })),
    "Ambiguous pre-delete download failure stops cleanup",
  );
  assertEqual(downloadFault.calls.remove, 0, "Download fault never issues deletion");

  const mismatchingBytes = artifactStorageMock({ content: Buffer.from("not the proposal") });
  assert(
    !(await finalizationSafety.removeExactUnregisteredProposalArtifact({
      storage: mismatchingBytes.storage,
      storagePath: expectedArtifact.storagePath,
      contentSha256: expectedArtifact.contentSha256,
    })),
    "Unexpected bytes at the deterministic path are preserved",
  );
  assertEqual(mismatchingBytes.calls.remove, 0, "Digest mismatch never issues deletion");

  const wrongRemoveResponse = artifactStorageMock({
    removed: [{ name: "unexpected/object.pdf" }],
  });
  assert(
    !(await finalizationSafety.removeExactUnregisteredProposalArtifact({
      storage: wrongRemoveResponse.storage,
      storagePath: expectedArtifact.storagePath,
      contentSha256: expectedArtifact.contentSha256,
    })),
    "Cleanup rejects a removal response for any other path",
  );
  assertEqual(
    wrongRemoveResponse.calls.exists,
    0,
    "Wrong-path removal response cannot advance to absence confirmation",
  );

  const ambiguousAbsence = artifactStorageMock({ existsError: new Error("timeout") });
  assert(
    !(await finalizationSafety.removeExactUnregisteredProposalArtifact({
      storage: ambiguousAbsence.storage,
      storagePath: expectedArtifact.storagePath,
      contentSha256: expectedArtifact.contentSha256,
    })),
    "Cleanup fails closed when post-delete absence cannot be proven",
  );

  const finalizeSource = source("app/api/proposals/finalize/route.ts");
  const finalizationSafetySource = source(
    "lib/proposal-signing/finalizationSafety.ts",
  );
  const requestSource = source("app/api/proposals/signature-requests/route.ts");
  const sendSource = source("app/api/integrations/google-workspace/send/route.ts");
  const emailDeliverySource = source(
    "lib/proposal-signing/emailDelivery.ts",
  );
  const draftSource = source("lib/googleWorkspace/emailDrafts.ts");
  const crmAppSource = source("components/CrmApp.tsx");
  const nextConfigSource = source("next.config.js");
  const migrationSource = source(
    "supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql",
  );

  assert(
    finalizeSource.includes('.eq("role", "owner")') &&
      requestSource.includes('.eq("role", "owner")'),
    "Finalization and delivery preparation require an authenticated company owner",
  );
  assert(
    finalizeSource.includes('estimate.status !== "approved"') &&
      finalizeSource.includes(
        "Approve the estimate internally before finalizing an immutable customer proposal.",
      ),
    "Server-side proposal finalization requires the owner-approved estimate state",
  );
  assert(
    finalizeSource.includes("getRequestedDepositRule(body)") &&
      finalizeSource.includes('body.depositType !== "none"') &&
      finalizeSource.includes('body.depositType !== "fixed"') &&
      finalizeSource.includes('body.depositType !== "percent"') &&
      finalizeSource.includes("normalizeDecimalToScale(body.depositValue, 3)") &&
      finalizeSource.includes('depositType === "percent" && depositValue > 100') &&
      finalizeSource.includes("A proposal deposit percentage cannot exceed 100%.") &&
      finalizeSource.indexOf('depositType === "percent" && depositValue > 100') <
        finalizeSource.indexOf('const canonicalSource = {') &&
      finalizeSource.indexOf('depositType === "percent" && depositValue > 100') <
        finalizeSource.indexOf('"wtos_finalize_proposal_revision"'),
    "An invalid deposit percentage fails closed before snapshot construction or immutable finalization",
  );
  assert(
    finalizeSource.includes("const proposalTitle = scrubCustomerFacingText(") &&
      finalizeSource.includes("latestRevision?.title ?? estimate.title") &&
      finalizeSource.includes("Complete the customer-safe proposal title before finalizing.") &&
      finalizeSource.includes("unit: scrubCustomerFacingText(option.unit)") &&
      finalizeSource.includes(
        'unit: scrubCustomerFacingText(getString(option.unit, "each"))',
      ) &&
      finalizeSource.includes(
        "formatProposalCustomerFinding({",
      ) &&
      finalizeSource.includes("observation: getString(finding.observation)") &&
      finalizeSource.includes("recommendation: getString(finding.recommendation)") &&
      source("lib/crm/proposals.ts").includes(
        "export function formatProposalCustomerFinding",
      ),
    "Every rendered title, option unit, and customer-visible inspection finding passes through the customer-safe scrub before finalization",
  );
  assert(
    finalizeSource.includes('"wtos_finalize_proposal_revision"') &&
      finalizeSource.includes('"wtos_register_proposal_artifact"'),
    "Finalization uses the service-only atomic revision and artifact RPCs",
  );
  assert(
    finalizeSource.includes("getExistingFinalizedProposalStatus") &&
      finalizeSource.includes("status: existingProposalStatus") &&
      !finalizeSource.slice(
        finalizeSource.indexOf("if (existingDocumentId)"),
        finalizeSource.indexOf("const documentId = deterministicUuid"),
      ).includes('status: "ready_to_send"'),
    "An existing accepted or converted proposal is never mislabeled ready to send on exact retry",
  );
  assert(
    finalizeSource.includes("resolveProposalCustomerIdentity({") &&
      finalizeSource.includes("propertyId: proposalIdentity.propertyId") &&
      finalizeSource.includes("propertyUpdatedAt: proposalIdentity.propertyUpdatedAt") &&
      finalizeSource.includes("companyUpdatedAt: company.updated_at") &&
      finalizeSource.includes("propertyAddress,") &&
      source("lib/crm/proposals.ts").includes("exactProperty?.address?.trim()") &&
      source("lib/crm/proposals.ts").indexOf("exactProperty?.address?.trim()") <
        source("lib/crm/proposals.ts").indexOf("estimate.location?.trim()"),
    "Owner preview, immutable artifact, and idempotency fingerprint share property-row-first customer identity",
  );
  for (const exactSourceKey of [
    "sourceCompanyUpdatedAt",
    "sourceEstimateUpdatedAt",
    "sourceCustomerId",
    "sourceCustomerUpdatedAt",
    "sourceCustomerName",
    "sourcePropertyId",
    "sourcePropertyUpdatedAt",
    "sourcePropertyAddress",
    "sourceLineItems",
  ]) {
    assert(
      finalizeSource.includes(`${exactSourceKey}: canonicalSource.`),
      `Finalization RPC carries the locked source contract field ${exactSourceKey}`,
    );
  }
  assert(
    (finalizeSource.match(/\.order\("id", \{ ascending: (?:true|false) \}\)/g) ?? [])
      .length >= 8 &&
      finalizeSource.includes(
        "left.sort_order - right.sort_order || left.id.localeCompare(right.id)",
      ) &&
      finalizeSource.includes(
        "left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)",
      ),
    "Canonical reads and immutable PDF arrays use stable ID tie-breakers for equal sort orders",
  );
  assert(
    finalizeSource.includes("findUnsupportedDeterministicPdfGlyph") &&
      finalizeSource.indexOf("const unsupportedPdfGlyph") <
        finalizeSource.indexOf('"wtos_finalize_proposal_revision"') &&
      finalizeSource.includes("unsupportedPdfGlyph.codePointLabel") &&
      requestSource.includes("collectStringValues(revision.customer_snapshot)"),
    "Unsupported proposal or signer glyphs fail closed before revision finalization or delivery preparation",
  );
  assert(
    finalizeSource.includes("description: getOptionalString(item.description)") &&
      finalizeSource.includes("quantity: getNumber(option.quantity)") &&
      finalizeSource.includes("scopeDetails: getOptionalString(option.scopeDetails)") &&
      finalizeSource.includes("warrantyEffect: getOptionalString(option.warrantyEffect)") &&
      finalizeSource.includes("customerNotes: getOptionalString(option.customerNotes)") &&
      source("lib/googleWorkspace/serverClient.ts").includes(
        "`Option total: ${money(optionTotal(option))}`",
      ),
    "Immutable proposal parsing and PDF rendering preserve the full option and line-item contract",
  );
  assert(
    finalizeSource.includes('.from("customer-documents")') &&
      finalizeSource.includes("upsert: false") &&
      finalizationSafetySource.includes("removed.data[0]?.name !== storagePath") &&
      finalizationSafetySource.includes("existence.data === false"),
    "Final proposal PDF uses private non-overwriting Storage and the exact cleanup helper remains fail-closed",
  );
  const artifactRegistrationSource = finalizeSource.slice(
    finalizeSource.indexOf("const registerResponse = await callServiceRpc"),
    finalizeSource.indexOf(
      'message: "The exact customer-safe proposal revision is finalized and ready to send."',
    ),
  );
  assert(
    artifactRegistrationSource.includes("if (registerResponse.error)") &&
      artifactRegistrationSource.indexOf("if (registerResponse.error)") <
        artifactRegistrationSource.indexOf('.from("documents")') &&
      artifactRegistrationSource.includes(
        "The exact private artifact was preserved for an idempotent retry.",
      ) &&
      !artifactRegistrationSource.includes("removeExactUnregisteredProposalArtifact") &&
      finalizeSource.includes("isExactRegisteredProposalArtifact") &&
      finalizeSource.includes("artifactOperationKey"),
    "A transport-ambiguous artifact registration preserves exact bytes without a lock-free cleanup race",
  );
  assert(
    finalizeSource.includes('{ name: "photo", error: photosResult.error }') &&
      finalizeSource.includes('{ name: "revision", error: revisionsResult.error }') &&
      finalizeSource.includes('{ name: "section", error: sourceSectionsResult.error }') &&
      finalizeSource.includes('{ name: "option", error: sourceOptionsResult.error }') &&
      finalizeSource.includes('{ name: "template", error: templateError }') &&
      finalizeSource.includes(
        '{ name: "stale_option", error: staleOptionsResult.error }',
      ) &&
      finalizeSource.includes(
        '{ name: "stale_revision", error: staleRevisionsResult.error }',
      ),
    "Canonical photo, revision, section, option, and template read errors fail closed",
  );
  assert(
    !finalizeSource.includes("estimate.notes") &&
      !requestSource.includes("estimate.notes") &&
      sendSource.includes("!hasPdf && !requiresExactProposalPdf"),
    "Proposal delivery cannot fall back to raw estimate notes",
  );
  assert(
    sendSource.indexOf('sync_status: "syncing"') <
      sendSource.indexOf("generateProposalSigningToken()") &&
      sendSource.indexOf("generateProposalSigningToken()") <
        sendSource.indexOf("sendGmailEmail({"),
    "Raw token is minted only after the approved email is atomically claimed and before Gmail delivery",
  );
  assert(
    sendSource.includes("getConfiguredProposalSigningOrigin()") &&
      sendSource.includes("normalizeProposalSigningOrigin(publicBaseUrl)") &&
      sendSource.indexOf("deliveryOrigin !== signingApiOrigin") <
        sendSource.indexOf("generateProposalSigningToken()") &&
      sendSource.includes(
        "The proposal signing delivery URL does not match the application origin trusted by the signing APIs.",
      ),
    "Signing delivery fails before token creation and Gmail when its configured origin differs from the signing API trust anchor",
  );
  assert(
    sendSource.includes('"wtos_prepare_proposal_signing_request"') &&
      sendSource.includes('action: "mark_sent"') &&
      sendSource.includes('action: "mark_failed"'),
    "Signature request is persisted by hash and transitions only from truthful Gmail outcome",
  );
  assert(
    requestSource.includes("email_messages_one_active_proposal_signature_draft_idx") &&
      requestSource.includes('record.code === "23505"') &&
      requestSource.includes("getExactActiveDraftRequestId"),
    "A concurrent duplicate-draft conflict reconciles only to the exact active immutable draft",
  );
  assert(
    requestSource.includes('requestedAction === "revoke"') &&
      requestSource.includes('.eq("proposal_revision_id", revision.id)') &&
      requestSource.includes('["prepared", "sent", "viewed"]') &&
      requestSource.includes('action: "revoke"') &&
      requestSource.includes("owner-revoke:") &&
      !requestSource.includes("requestTokenHash"),
    "An authenticated company owner can idempotently revoke only the server-resolved active signing link without token exposure",
  );
  assert(
    migrationSource.includes("request_action in ('mark_failed', 'revoke')") &&
      migrationSource.includes("selected_request.status not in ('prepared', 'sent', 'viewed')") &&
      migrationSource.includes("revision.accepted_acceptance_id is null") &&
      migrationSource.includes("revision.accepted_signature_id is null") &&
      migrationSource.includes("signature.acceptance_id is null") &&
      migrationSource.includes(
        "Signed, declined, expired, failed, revoked, or superseded proposal evidence cannot be failed or revoked.",
      ),
    "The locked transition RPC prevents a revoke race from overwriting accepted or terminal evidence",
  );
  assert(
    migrationSource.includes(
      "create unique index email_messages_one_active_proposal_signature_draft_idx",
    ) &&
      migrationSource.includes("where status in ('draft', 'queued')") &&
      migrationSource.includes(
        "metadata ->> 'draftType' = 'proposal_signature_request'",
      ),
    "Database uniqueness permits only one active native signature draft per exact revision artifact",
  );
  assert(
    sendSource.includes("signatureActivationDeferred") &&
      sendSource.includes('"sent_activation_deferred"') &&
      sendSource.includes("durableSigningMetadata") &&
      sendSource.includes("proposalSigningDeliveryStatus: durableSigningStatus") &&
      sendSource.includes("? 202"),
    "Gmail-confirmed delivery reports truthful deferred activation without inviting a resend",
  );
  assert(
    requestSource.includes('requestedAction === "reconcile_delivery"') &&
      requestSource.includes("isExactProviderConfirmedSignatureEmail") &&
      requestSource.includes("owner-reconcile-delivery:") &&
      requestSource.includes('action: "mark_sent"') &&
      requestSource.includes("No email was resent.") &&
      !requestSource.includes("sendGmailEmail"),
    "Owner activation reconciliation uses exact durable Gmail evidence and cannot call the provider",
  );
  assert(
    requestSource.includes('"wtos_create_proposal_signature_email_draft"') &&
      requestSource.includes("signature-email-draft:${signingRequestId}") &&
      !requestSource.includes('.from("email_messages")\n    .insert(plan.input)') &&
      crmAppSource.includes("queueProposalSignatureEmail(client, {") &&
      source("lib/crm/proposalOperations.ts").includes(
        'client.rpc("wtos_queue_proposal_signature_email"',
      ),
    "Native signature drafts and owner queue transitions use their guarded database RPCs instead of direct table writes",
  );
  assert(
    requestSource.includes("function existingSignatureDraftResponse({") &&
      requestSource.includes('deliveryState === "provider_outcome_unknown"') &&
      requestSource.includes('deliveryState === "provider_confirmed"') &&
      requestSource.includes('deliveryState === "claimed_pre_send"') &&
      requestSource.includes("Reconcile the existing attempt") &&
      requestSource.includes("Reconcile activation only; do not resend") &&
      requestSource.includes("This signature delivery is already in progress") &&
      requestSource.includes('status === "draft" && syncStatus === "local"') &&
      requestSource.includes('status === "queued" && syncStatus === "queued"'),
    "Preparing a signature request reports durable claimed, unknown, and provider-confirmed states truthfully and only reuses an untouched draft or owner queue",
  );
  assert(
    requestSource.includes('.in("status", ["prepared", "sent", "viewed"])') &&
      requestSource.includes("const activeSigningRequest = activeSigningRequests?.[0] ?? null") &&
      requestSource.includes("Revoke that link before preparing a replacement") &&
      countOccurrences(crmAppSource, "Boolean(activeSignature)") >= 2 &&
      countOccurrences(crmAppSource, "Revoke existing link first") >= 2 &&
      !crmAppSource.includes("Prepare replacement signature email"),
    "An active customer signing link blocks duplicate draft preparation and is stated truthfully to the owner",
  );
  assert(
    requestSource.includes('requestedAction === "cancel_unsent"') &&
      requestSource.includes('action: "cancel_unsent"') &&
      requestSource.includes('approvalState: "canceled_unsent"') &&
      requestSource.includes("emailMessage.provider_payload_hash") &&
      requestSource.includes("emailMessage.gmail_message_id") &&
      crmAppSource.includes("cancelUnsentProposalSignatureDraft") &&
      crmAppSource.includes("Cancel unsent signature draft") &&
      crmAppSource.includes("prove that no provider attempt exists"),
    "An owner can cancel only a proven-unsent signature draft before preparing a replacement for changed customer contact data",
  );
  for (const transitionAction of [
    "recover_pre_send",
    "claim_send",
    "mark_prepare_failed",
    "mark_provider_attempt",
    "checkpoint_provider",
    "mark_sent",
    "mark_provider_unknown",
    "mark_provider_failed",
    "mark_pre_send_interrupted",
    "cancel_unsent",
    "abandon_unknown",
    "finalize_delivery",
    "reconcile_delivery",
  ]) {
    assert(
      emailDeliverySource.includes(`"${transitionAction}"`),
      `Guarded signature-email transition adapter includes ${transitionAction}`,
    );
  }
  assert(
    sendSource.includes("transitionProposalSignatureEmail(serviceClient") &&
      requestSource.includes("transitionProposalSignatureEmail(serviceClient") &&
      emailDeliverySource.includes(
        'client.rpc(\n    "wtos_transition_proposal_signature_email"',
      ) &&
      emailDeliverySource.includes("envelope.emailStatus !== emailMessage.status") &&
      emailDeliverySource.includes("envelope.syncStatus !== emailMessage.sync_status"),
    "Every native-signature delivery mutation uses the strict guarded transition envelope while generic Gmail paths remain separate",
  );
  assert(
    emailDeliverySource.includes('"conflict" | "source_changed" | "unavailable"') &&
      emailDeliverySource.includes('envelope.status === "source_changed"') &&
      sendSource.includes("const sourceChangedBeforeProvider = Boolean(") &&
      sendSource.includes('deliveryStatus:') &&
      sendSource.includes('? "source_changed"') &&
      crmAppSource.includes('result.deliveryStatus === "source_changed"') &&
      crmAppSource.includes("No email was sent; finalize a new revision"),
    "Source drift is propagated truthfully as a no-provider-call owner action instead of a generic delivery conflict",
  );
  assert(
    sendSource.includes("const { data: preparedSigningRequest } = recoveringProviderOutcome") &&
      sendSource.includes("preparedSigningRequest?.intended_signer_email") &&
      sendSource.includes("preparedSigningRequest.delivery_email_message_id === message.id") &&
      sendSource.includes("const exactPreparedRecovery =") &&
      sendSource.includes("recoveringProviderOutcome\n      ? frozenSignerEmail\n      : normalizedCustomerEmail") &&
      !sendSource.includes(
        "toRecipients[0]?.trim().toLowerCase() === normalizedCustomerEmail",
      ),
    "Provider-outcome recovery binds the immutable prepared signer and exact email claim instead of mutable current customer contact data",
  );
  assert(
    requestSource.includes('requestedAction === "abandon_unknown"') &&
      requestSource.includes('gmailDeliveryState: "provider_outcome_unknown"') &&
      requestSource.includes('action: "abandon_unknown"') &&
      requestSource.includes('gmailDeliveryState: "provider_outcome_abandoned"') &&
      requestSource.includes(
        'proposalSigningDeliveryStatus: "provider_outcome_abandoned"',
      ) &&
      !requestSource.includes(
        'gmailDeliveryState: "provider_outcome_abandoned",\n        proposalSigningDeliveryStatus: "failed_before_send"',
      ) &&
      requestSource.includes("Prior delivery remains unknown") &&
      crmAppSource.includes("abandonUnknownProposalSignatureDelivery") &&
      crmAppSource.includes("Abandon unknown attempt") &&
      crmAppSource.includes("Unknown attempt abandoned · prior delivery unknown") &&
      crmAppSource.includes("!hasActiveSigningLink"),
    "After explicit link revocation, an owner can abandon one unresolved provider attempt without claiming non-delivery or resending",
  );
  assert(
    sendSource.includes("const deliveredAttachmentCount = recoveringProviderOutcome") &&
      sendSource.includes("message.has_attachments !== true") &&
      sendSource.includes("message.attachment_count !== 1") &&
      sendSource.includes("attachmentCountDelivered: deliveredAttachmentCount") &&
      sendSource.includes("attachmentCount: deliveredAttachmentCount") &&
      !sendSource.includes("attachmentCountDelivered: attachments.length") &&
      !sendSource.includes("attachmentCount: attachments.length"),
    "Provider-outcome recovery preserves and verifies the exact one-PDF delivery evidence instead of recording a false zero attachment count",
  );
  assert(
      crmAppSource.includes("getProposalSigningDeliveryStatus(message)") &&
      crmAppSource.includes("Reconcile activation only") &&
      crmAppSource.includes("!failedNativeProposalSignatureDraft") &&
      crmAppSource.includes('action: "reconcile_delivery"'),
    "Reloaded Gmail activity renders durable native-signing status and never generically requeues a failed signature draft",
  );
  assert(
    migrationSource.includes("if selected_request.status = 'prepared' then") &&
      migrationSource.includes("email.status = 'sent'") &&
      migrationSource.includes("email.sync_status = 'sent'") &&
      migrationSource.includes("nullif(email.gmail_message_id, '') is not null") &&
      migrationSource.includes("if selected_request.status not in ('sent', 'viewed') then") &&
      migrationSource.includes("native_signature_request_delivery_reconciled"),
    "Only an exact provider-confirmed sent email can self-heal a prepared request before token exchange",
  );
  assert(
    draftSource.includes("PROPOSAL_SIGNING_LINK_PLACEHOLDER") &&
      draftSource.includes("expires 14 days after this email is sent") &&
      !draftSource.includes("generateProposalSigningToken"),
    "Owner-reviewable drafts cannot mint signing credentials",
  );
  assert(
    nextConfigSource.includes('"/api/proposals/**/*"') &&
      nextConfigSource.includes('"/api/integrations/google-workspace/send"') &&
      nextConfigSource.includes("Geist-Regular.ttf"),
    "Every proposal/signing server path traces the pinned bundled Unicode font",
  );

  console.log("Proposal finalization and truthful Gmail delivery tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
