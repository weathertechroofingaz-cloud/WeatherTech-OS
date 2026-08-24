import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "weathertech-native-proposal-signing-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, got ${actual}.`);
  }
}

function source(path) {
  return readFileSync(join(cwd, path), "utf8");
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/proposal-signing/constants.ts",
      "lib/proposal-signing/contracts.ts",
      "lib/proposal-signing/security.ts",
      "lib/proposal-signing/public-session.ts",
      "lib/proposal-signing/pricing.ts",
      "lib/proposal-signing/pdf.ts",
      "lib/proposal-signing/public-results.ts",
      "lib/proposal-signing/rpc-response.ts",
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
    throw new Error(`Could not compile native proposal signing helpers.\n${compile.stdout}\n${compile.stderr}`);
  }
  const signingOutDir = join(outDir, "proposal-signing");
  const constants = await import(pathToFileURL(join(signingOutDir, "constants.js")));
  const security = await import(pathToFileURL(join(signingOutDir, "security.js")));
  const publicSessionHelpers = await import(
    pathToFileURL(join(signingOutDir, "public-session.js"))
  );
  const pricing = await import(pathToFileURL(join(signingOutDir, "pricing.js")));
  const pdf = await import(pathToFileURL(join(signingOutDir, "pdf.js")));
  const publicResults = await import(pathToFileURL(join(signingOutDir, "public-results.js")));
  const rpcResponse = await import(pathToFileURL(join(signingOutDir, "rpc-response.js")));
  const unicodePdf = await import(
    pathToFileURL(join(outDir, "pdf", "deterministicUnicodePdf.js")),
  );

  const requestId = "123e4567-e89b-42d3-a456-426614174000";
  const rawToken = security.generateProposalSigningToken();
  assertEqual(rawToken.length, 43, "A request token contains 256 bits in base64url form");
  assert(constants.isProposalSigningRawToken(rawToken), "Generated request token is accepted");
  assertEqual(
    constants.PROPOSAL_SIGNING_LINK_PLACEHOLDER,
    "[[WTOS_PROPOSAL_SIGNING_LINK]]",
    "Owner drafts use one token-free link placeholder",
  );
  assertEqual(
    constants.PROPOSAL_SIGNING_CONSENT_VERSION,
    "wtos-native-esign-v1",
    "Electronic consent evidence is explicitly versioned",
  );
  for (const requiredDisclosure of [
    "applies only to this exact finalized proposal, your acceptance, and the signed receipt",
    "open, download, print, and save the exact finalized proposal PDF",
    "confirm that you can access and retain these electronic records",
    "withdraw this consent before signing",
    "will not affect electronic actions already completed",
    "Keep your email address current",
    "current JavaScript- and cookie-enabled browser",
    "a PDF viewer",
    "storage or printing capability to retain records",
    "request a paper copy by contacting the company",
    "availability and any fees",
    "The normal acceptance workflow remains electronic",
  ]) {
    assert(
      constants.PROPOSAL_SIGNING_CONSENT_TEXT.includes(requiredDisclosure),
      `Electronic-records disclosure includes ${requiredDisclosure}`,
    );
  }
  const signingUrl = new URL(
    constants.buildProposalSigningUrl("https://weathertech-os.vercel.app/settings", requestId, rawToken),
  );
  assertEqual(
    signingUrl.pathname,
    `/proposal/sign/${requestId}`,
    "Customer signing URL binds the public request ID in the path",
  );
  assertEqual(signingUrl.search, "", "Raw signing credentials never enter the query string");
  assertEqual(
    new URLSearchParams(signingUrl.hash.slice(1)).get("token"),
    rawToken,
    "Raw signing credential is carried only in the URL fragment",
  );
  let insecureOriginRejected = false;
  try {
    constants.buildProposalSigningUrl("http://weathertech-os.example.test", requestId, rawToken);
  } catch {
    insecureOriginRejected = true;
  }
  assert(insecureOriginRejected, "Non-local signing links require HTTPS");
  assertEqual(
    security.hashProposalSigningToken(rawToken).length,
    64,
    "Only a lowercase SHA-256 request token digest reaches Postgres",
  );
  const exchangeKey = security.generateProposalSigningToken();
  const secondExchangeKey = security.generateProposalSigningToken();
  assert(constants.isProposalSigningExchangeKey(exchangeKey), "A page-generated 256-bit exchange key is valid");
  const deterministicSessionToken = security.deriveProposalSigningSessionToken({
    requestId,
    rawToken,
    exchangeKey,
    serverSecret: "test-only-service-secret",
  });
  const exactRetrySessionToken = security.deriveProposalSigningSessionToken({
    requestId,
    rawToken,
    exchangeKey,
    serverSecret: "test-only-service-secret",
  });
  const differentExchangeSessionToken = security.deriveProposalSigningSessionToken({
    requestId,
    rawToken,
    exchangeKey: secondExchangeKey,
    serverSecret: "test-only-service-secret",
  });
  assertEqual(deterministicSessionToken.length, 43, "Deterministic signing session contains 256 bits");
  assertEqual(
    exactRetrySessionToken,
    deterministicSessionToken,
    "A lost exchange response can retry with the same in-memory key and derive the exact same session",
  );
  assert(
    differentExchangeSessionToken !== deterministicSessionToken,
    "A different exchange key cannot reproduce the consumed signing session",
  );
  assert(
    !deterministicSessionToken.includes(rawToken) &&
      !deterministicSessionToken.includes(exchangeKey) &&
      !deterministicSessionToken.includes(requestId),
    "The derived session credential does not expose its request token, exchange key, or public request ID",
  );
  assertEqual(
    security.maskProposalSigningEmail("homeowner@example.test"),
    "ho*******@example.test",
    "Customer-facing session masks the intended signer email",
  );
  assertEqual(
    security.sanitizeProposalSigningUserAgent("Browser\nInjected\u0000Value").includes("\n"),
    false,
    "User-agent audit evidence removes control characters",
  );
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://weathertech-os.example.test";
  assert(
    security.requestHasExactOrigin({
      headers: new Headers({ origin: "https://weathertech-os.example.test", host: "internal.example.test" }),
      nextUrl: new URL("https://internal.example.test/test"),
    }),
    "Configured canonical application Origin is authoritative behind a proxy",
  );
  assert(
    !security.requestHasExactOrigin({
      headers: new Headers({ origin: "https://evil.example", host: "evil.example" }),
      nextUrl: new URL("https://evil.example/test"),
    }),
    "An attacker-controlled non-local Host cannot become a trusted Origin",
  );
  assert(
    security.requestHasExactOrigin({
      headers: new Headers({ origin: "http://127.0.0.1:3107", host: "127.0.0.1:3107" }),
      nextUrl: new URL("http://localhost:3107/test"),
    }),
    "Exact local Origin remains valid for isolated regression",
  );
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;

  const committedRateLimit = rpcResponse.parseProposalSigningRpcEnvelope({
    ok: false,
    status: "rate_limited",
    message: "Too many signing attempts. Wait a few minutes and try again.",
  });
  assertEqual(committedRateLimit?.status, "rate_limited", "Committed rate-limit envelopes survive RPC parsing");
  const committedInvalidAttempt = rpcResponse.parseProposalSigningRpcEnvelope([{
    ok: false,
    status: "invalid_or_expired",
    message: "This signing link is invalid, expired, or no longer active.",
  }]);
  assertEqual(committedInvalidAttempt?.status, "invalid_or_expired", "Committed invalid-attempt envelopes survive one-row RPC normalization");
  assertEqual(
    rpcResponse.parseProposalSigningRpcEnvelope({ ok: false, status: "internal_error", message: "leak" }),
    null,
    "Unknown database error envelopes fail closed",
  );
  const publicAccept = publicResults.toProposalSigningPublicAcceptResponse(
    {
      ok: true,
      status: "signed",
      requestId,
      sessionId: "private-session-id",
      proposalRevisionId: "private-revision-id",
      acceptanceId: "private-acceptance-id",
      signatureId: "private-signature-id",
      acceptedTotal: 11200,
      requiredDepositAmount: 1120,
      acceptedAt: "2026-08-23T20:00:00.000Z",
      evidenceSha256: "e".repeat(64),
      receiptStatus: "pending",
    },
    { ready: true, message: null },
  );
  assertEqual(
    Object.keys(publicAccept).sort().join(","),
    [
      "acceptedAt",
      "acceptedTotal",
      "evidenceSha256",
      "ok",
      "receiptMessage",
      "receiptReady",
      "requiredDepositAmount",
      "status",
    ].join(","),
    "Public acceptance response uses an explicit allowlist",
  );
  assert(
    !JSON.stringify(publicAccept).includes("private-"),
    "Public acceptance response excludes session, revision, acceptance, and signature IDs",
  );
  const publicDecline = publicResults.toProposalSigningPublicDeclineResponse({
    ok: true,
    status: "declined",
    requestId,
    sessionId: "private-session-id",
    proposalRevisionId: "private-revision-id",
    declinedAt: "2026-08-23T20:00:00.000Z",
  });
  assertEqual(
    Object.keys(publicDecline).sort().join(","),
    ["declinedAt", "ok", "status"].join(","),
    "Public decline response uses an explicit allowlist",
  );
  assert(
    !JSON.stringify(publicDecline).includes("private-"),
    "Public decline response excludes session and revision IDs",
  );

  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-role-key";
  const ipHeaders = new Headers({ "x-vercel-forwarded-for": "203.0.113.10" });
  const ipHash = security.hashProposalSigningClientIp(ipHeaders);
  assert(ipHash && ipHash.length === 64, "IP evidence is keyed and stored only as a digest");
  assert(!ipHash.includes("203.0.113.10"), "IP digest does not expose the address");
  if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;

  const boundedRequest = new Request("https://weathertech-os.example.test/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: rawToken, exchangeKey }),
  });
  const boundedBody = await security.readBoundedJsonObject(boundedRequest, 1024);
  assertEqual(boundedBody.token, rawToken, "Bounded JSON reader accepts the exact token body");
  assertEqual(boundedBody.exchangeKey, exchangeKey, "Bounded JSON reader accepts the exact ephemeral exchange key");
  let oversizedRejected = false;
  try {
    await security.readBoundedJsonObject(
      new Request("https://weathertech-os.example.test/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "x".repeat(2000) }),
      }),
      200,
    );
  } catch (error) {
    oversizedRejected = error?.statusCode === 413;
  }
  assert(oversizedRejected, "Oversized public signing bodies fail before parsing");

  const longTermsEvidence = `LONG-TERMS-${"x".repeat(190)}-TAIL`;
  const proposal = {
    schemaVersion: "native-proposal-v1",
    companyId: "company-1",
    companyName: "WeatherTech Roofing LLC",
    brandName: "WeatherTech Roofing LLC",
    brandPrimaryColor: "#0f172a",
    brandAccentColor: "#0284c7",
    proposalNumber: "WT-20260823-001",
    revisionNumber: 2,
    title: "Roof replacement proposal",
    issueDate: "2026-08-23",
    customerName: "José Йордан",
    propertyAddress: "100 Test Roof Way",
    baseSubtotal: 10000,
    discountTotal: 500,
    taxTotal: 450,
    feeTotal: 50,
    baseTotal: 10000,
    lineItems: [{
      id:"line-1",
      name:"Roof system",
      description:"Complete customer-visible tear-off and replacement scope.",
      quantity:1,
      unit:"project",
      total:10000,
      sortOrder:0,
    }],
    selectedOptionIds: [
      "123e4567-e89b-42d3-a456-426614174001",
      "123e4567-e89b-42d3-a456-426614174004",
    ],
    selectedUpgradesTotal: 1500,
    acceptedTotal: 11500,
    depositType: "percent",
    depositValue: 10,
    depositRequired: true,
    requiresDepositBeforeJob: true,
    requiredDepositAmount: 1150,
    remainingBalance: 10350,
    terms: `Finalized proposal terms.\nAll frozen roofing work is included exactly as listed.\n${longTermsEvidence}`,
    electronicRecordsDisclosure: constants.PROPOSAL_SIGNING_CONSENT_TEXT,
    revisionSha256: "a".repeat(64),
    termsSha256: "b".repeat(64),
    consentSha256: "c".repeat(64),
    sections: [
      {
        id: "section-1",
        sectionKey: "scope",
        title: "Roofing Scope — Protección",
        sectionType: "scope",
        body: "Remove the existing roof and install the finalized roofing system.",
        isRequired: true,
        sortOrder: 0,
      },
    ],
    options: [
      {
        id: "123e4567-e89b-42d3-a456-426614174001",
        optionType: "add_on_upgrade",
        optionGroupKey: "upgrade",
        name: "Premium underlayment",
        description: "Customer-visible option",
        quantity: 1,
        unit: "project",
        price: 1200,
        priceEffectType: "additive",
        baseReplacementAmount: 0,
        selected: true,
        required: false,
        recommended: true,
        bestValue: true,
        dependencyOptionId: null,
        conflictingOptionId: null,
        warrantyEffect: "Extends the underlayment warranty.",
        scopeDetails: "Install premium synthetic underlayment on the full roof deck.",
        customerNotes: "Customer selected this upgrade during proposal review.",
        sortOrder: 0,
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174003",
        optionType: "add_on_upgrade",
        optionGroupKey: "upgrade",
        name: "Skylight replacement",
        description: "Frozen but not selected",
        quantity: 1,
        unit: "each",
        price: 800,
        priceEffectType: "additive",
        baseReplacementAmount: 0,
        selected: false,
        required: false,
        recommended: false,
        bestValue: false,
        dependencyOptionId: null,
        conflictingOptionId: null,
        warrantyEffect: "Skylight warranty would apply only if selected.",
        scopeDetails: "Remove and replace one existing skylight.",
        customerNotes: "Customer did not select this option.",
        sortOrder: 1,
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174004",
        optionType: "replacement_alternative",
        optionGroupKey: "system",
        name: "Solar-ready underlayment replacement",
        description: "Selected replacement-price fixture",
        quantity: 1,
        unit: "project",
        price: 1300,
        priceEffectType: "replace_base_amount",
        baseReplacementAmount: 1000,
        selected: true,
        required: false,
        recommended: false,
        bestValue: false,
        dependencyOptionId: null,
        conflictingOptionId: null,
        warrantyEffect: "Preserves the selected upgraded-system warranty.",
        scopeDetails: "Replace the frozen underlayment allowance with the solar-ready system.",
        customerNotes: "Customer accepted the exact replacement adjustment.",
        sortOrder: 2,
      },
      {
        id: "123e4567-e89b-42d3-a456-426614174005",
        optionType: "replacement_alternative",
        optionGroupKey: "system",
        name: "Complete metal roof alternate",
        description: "Frozen full-alternate fixture",
        quantity: 1,
        unit: "project",
        price: 15000,
        priceEffectType: "full_alternate_total",
        baseReplacementAmount: 0,
        selected: false,
        required: false,
        recommended: false,
        bestValue: false,
        dependencyOptionId: null,
        conflictingOptionId: null,
        warrantyEffect: "Metal-system warranty applies if selected.",
        scopeDetails: "Use the complete metal roofing scope instead of the base proposal.",
        customerNotes: "Customer did not select the full alternate.",
        sortOrder: 3,
      },
    ],
  };
  assertEqual(
    pricing.calculateProposalSigningAcceptedTotal(proposal, proposal.selectedOptionIds),
    proposal.acceptedTotal,
    "Server preview reproduces the frozen accepted total",
  );
  assertEqual(
    pricing.calculateProposalSigningAcceptedTotal(proposal, [
      "123e4567-e89b-42d3-a456-426614174004",
    ]),
    10300,
    "Replace-base pricing exposes the exact net replacement adjustment",
  );
  assertEqual(
    pricing.calculateProposalSigningAcceptedTotal(proposal, [
      "123e4567-e89b-42d3-a456-426614174001",
      "123e4567-e89b-42d3-a456-426614174004",
      "123e4567-e89b-42d3-a456-426614174005",
    ]),
    16200,
    "A full alternate replaces the base while a selected additive remains visible in the accepted total",
  );
  assertEqual(
    pricing.calculateProposalSigningRequiredDeposit(proposal, proposal.acceptedTotal),
    1150,
    "Percent deposit value reproduces the exact required deposit",
  );
  const fractionalQuantityProposal = {
    ...proposal,
    baseTotal: 100,
    depositValue: 33.333,
    options: [{
      ...proposal.options[0],
      id: "123e4567-e89b-42d3-a456-426614174006",
      price: 0.01,
      quantity: 1.5,
    }],
  };
  const fractionalAcceptedTotal = pricing.calculateProposalSigningAcceptedTotal(
    fractionalQuantityProposal,
    [fractionalQuantityProposal.options[0].id],
  );
  assertEqual(
    fractionalAcceptedTotal,
    100.02,
    "Fractional-quantity option totals round once to the exact SQL cent boundary",
  );
  assertEqual(
    pricing.calculateProposalSigningOptionTotal({
      ...fractionalQuantityProposal.options[0],
      price: 2.01,
    }),
    3.02,
    "Customer-facing option totals use integer cents before fractional quantity multiplication",
  );
  assertEqual(
    pricing.calculateProposalSigningOptionTotal({ price: 0.25, quantity: 0.58 }),
    0.15,
    "Option totals quantize quantity to thousandths before exact half-up cent rounding",
  );
  assertEqual(
    pricing.calculateProposalSigningRequiredDeposit(
      fractionalQuantityProposal,
      fractionalAcceptedTotal,
    ),
    33.34,
    "Fractional option pricing still yields the same rounded percent deposit as SQL",
  );
  assertEqual(
    pricing.calculateProposalSigningRequiredDeposit(
      {
        ...proposal,
        depositValue: 64.6,
      },
      2.5,
    ),
    1.62,
    "Public signing deposit math uses exact thousandth-percent rational rounding",
  );
  assertEqual(
    pricing.calculateProposalSigningRequiredDeposit(
      {
        ...proposal,
        depositType: "fixed",
        depositValue: 2.135,
      },
      100,
    ),
    2.14,
    "Public signing fixed deposits quantize thousandths before cent rounding",
  );
  const session = {
    ok: true,
    status: "signed",
    requestId,
    sessionId: "session-1",
    sessionExpiresAt: "2026-08-24T03:00:00.000Z",
    requestExpiresAt: "2026-08-30T03:00:00.000Z",
    signer: { name: "José Йордан", email: "homeowner@example.test" },
    proposal,
    document: {
      id: "document-1",
      bucket: "customer-documents",
      path: "company-1/proposals/document.pdf",
      fileName: "proposal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 100,
      sha256: "d".repeat(64),
    },
    receipt: null,
    acceptance: {
      acceptanceId: "123e4567-e89b-42d3-a456-426614174002",
      signatureId: "signature-1",
      signerName: "José Йордан",
      signerEmail: "homeowner@example.test",
      selectedOptionIds: proposal.selectedOptionIds,
      acceptedTotal: 11500,
      requiredDepositAmount: 1150,
      acceptedAt: "2026-08-23T20:00:00.000Z",
      evidenceSha256: "e".repeat(64),
      termsSha256: proposal.termsSha256,
      consentSha256: proposal.consentSha256,
    },
  };
  const receiptPdf = pdf.buildProposalSigningReceiptPdf({
    session,
    acceptance: session.acceptance,
  });
  const repeatedReceiptPdf = pdf.buildProposalSigningReceiptPdf({
    session,
    acceptance: session.acceptance,
  });
  assertEqual(receiptPdf.subarray(0, 8).toString("utf8"), "%PDF-1.7", "Signed receipt is a PDF");
  assert(receiptPdf.equals(repeatedReceiptPdf), "Signed customer copy is byte-deterministic for exact immutable evidence");
  const receiptTextLines = unicodePdf.extractDeterministicUnicodePdfTextForTesting(receiptPdf);
  const receiptText = receiptTextLines.join("\n");
  const unwrappedReceiptText = receiptTextLines.join("");
  const normalizedReceiptText = receiptTextLines.join(" ").replace(/\s+/g, " ");
  for (const evidence of [
    "Completed Signed Proposal and Customer Receipt",
    "CUSTOMER-VISIBLE PROPOSAL SECTIONS",
    "Roofing Scope — Protección",
    "Remove the existing roof and install the finalized roofing system.",
    "FINALIZED LINE ITEMS",
    "Roof system",
    "Quantity / unit: 1 project",
    "Line total: $10,000.00",
    "Complete customer-visible tear-off and replacement scope.",
    "SELECTED: Premium underlayment",
    "Unit price: $1,200.00",
    "Option total: $1,200.00",
    "Pricing effect: Additive - adds this option total to the proposal",
    "Frozen price-effect type: additive",
    "Frozen base amount replaced: $0.00",
    "Net adjustment if selected: +$1,200.00",
    "Applied to accepted total: +$1,200.00",
    "Install premium synthetic underlayment on the full roof deck.",
    "Extends the underlayment warranty.",
    "Customer selected this upgrade during proposal review.",
    "NOT SELECTED: Skylight replacement",
    "Remove and replace one existing skylight.",
    "Skylight warranty would apply only if selected.",
    "Customer did not select this option.",
    "SELECTED: Solar-ready underlayment replacement",
    "Option total: $1,300.00",
    "Pricing effect: Replace base amount - substitutes this option total for the frozen replacement amount shown below",
    "Frozen price-effect type: replace_base_amount",
    "Frozen base amount replaced: $1,000.00",
    "Net adjustment if selected: +$300.00",
    "Applied to accepted total: +$300.00",
    "NOT SELECTED: Complete metal roof alternate",
    "Pricing effect: Full alternate total - substitutes this option total for the full base proposal",
    "Frozen price-effect type: full_alternate_total",
    "Net adjustment if selected: +$5,000.00",
    "Applied to accepted total: $0.00 (not selected)",
    "FINALIZED PRICING",
    "Base subtotal: $10,000.00",
    "Discount: $500.00",
    "Tax: $450.00",
    "Fees: $50.00",
    "Base total: $10,000.00",
    "Accepted total: $11,500.00",
    "Deposit type: percent",
    "Deposit value: 10%",
    "Required deposit: $1,150.00",
    "EXACT PROPOSAL TERMS",
    "All frozen roofing work is included exactly as listed.",
    "ELECTRONIC RECORDS DISCLOSURE",
    "withdraw this consent before signing",
    "request a paper copy by contacting the company",
    "The normal acceptance workflow remains electronic",
    "ELECTRONIC SIGNATURE CERTIFICATE",
    "Terms acknowledged: Yes",
    "Electronic records consented: Yes",
    "Signature intent acknowledged: Yes",
    "Accepted options: Premium underlayment, Solar-ready underlayment replacement",
    "José Йордан",
  ]) {
    assert(
      receiptText.includes(evidence) ||
        unwrappedReceiptText.includes(evidence) ||
        normalizedReceiptText.includes(evidence),
      `Completed signed customer copy includes ${evidence}`,
    );
  }
  assert(
    unwrappedReceiptText.includes(longTermsEvidence),
    "Completed signed customer copy preserves every character of an uninterrupted long terms token",
  );
  assert(receiptText.includes(session.acceptance.evidenceSha256), "Receipt binds the database evidence digest");
  for (const privateIdentifier of [
    session.requestId,
    session.sessionId,
    session.acceptance.acceptanceId,
    session.acceptance.signatureId,
    session.document.id,
    session.proposal.companyId,
    session.proposal.lineItems[0].id,
    ...session.proposal.options.map((option) => option.id),
  ]) {
    assert(
      !receiptText.includes(privateIdentifier),
      `Completed customer copy omits private internal identifier ${privateIdentifier}`,
    );
  }
  const publicSession = publicSessionHelpers.toProposalSigningPublicSession(session);
  const publicSessionText = JSON.stringify(publicSession);
  assertEqual(
    Object.keys(publicSession).sort().join(","),
    [
      "acceptance",
      "document",
      "ok",
      "proposal",
      "receipt",
      "requestExpiresAt",
      "sessionExpiresAt",
      "signer",
      "status",
    ].join(","),
    "Public session uses a token-free top-level allowlist",
  );
  for (const privateIdentifier of [
    session.requestId,
    session.sessionId,
    session.acceptance.acceptanceId,
    session.acceptance.signatureId,
    session.document.id,
    session.document.bucket,
    session.document.path,
    session.proposal.companyId,
    session.proposal.lineItems[0].id,
    ...session.proposal.options.map((option) => option.id),
  ]) {
    assert(
      !publicSessionText.includes(privateIdentifier),
      `Public session omits private internal value ${privateIdentifier}`,
    );
  }
  for (const privateField of [
    '"id":',
    '"companyId":',
    '"selectedOptionIds":',
    '"optionGroupKey":',
    '"dependencyOptionId":',
    '"conflictingOptionId":',
    '"bucket":',
    '"path":',
  ]) {
    assert(
      !publicSessionText.includes(privateField),
      `Public session omits private internal field ${privateField}`,
    );
  }
  let unsupportedGlyphRefused = false;
  try {
    pdf.buildProposalSigningReceiptPdf({
      session: {
        ...session,
        proposal: { ...session.proposal, customerName: "Unsupported 张 customer" },
      },
      acceptance: session.acceptance,
    });
  } catch (error) {
    unsupportedGlyphRefused =
      error instanceof unicodePdf.UnsupportedDeterministicPdfGlyphError &&
      error.unsupported?.codePointLabel === "U+5F20";
  }
  assert(
    unsupportedGlyphRefused,
    "Signed customer copy fails closed when the pinned font cannot preserve an exact glyph",
  );

  const pageSource = source("app/proposal/sign/[requestId]/route.ts");
  const exchangeSource = source("app/api/proposals/signing/[requestId]/exchange/route.ts");
  const sessionSource = source("app/api/proposals/signing/[requestId]/session/route.ts");
  const acceptSource = source("app/api/proposals/signing/[requestId]/accept/route.ts");
  const declineSource = source("app/api/proposals/signing/[requestId]/decline/route.ts");
  const documentSource = source("app/api/proposals/signing/[requestId]/document/route.ts");
  const receiptSource = source("app/api/proposals/signing/[requestId]/receipt/route.ts");
  const dbSource = source("lib/proposal-signing/db.ts");
  const publicSessionSource = source("lib/proposal-signing/public-session.ts");
  const httpSource = source("lib/proposal-signing/http.ts");
  const receiptSourceHelper = source("lib/proposal-signing/receipt.ts");
  const receiptPdfSource = source("lib/proposal-signing/pdf.ts");
  const contractsSource = source("lib/proposal-signing/contracts.ts");
  const nextConfigSource = source("next.config.js");
  const allPublicSource = [pageSource, exchangeSource, sessionSource, acceptSource, declineSource, documentSource, receiptSource].join("\n");
  const publicSessionMapperSource = publicSessionSource;
  const publicExchangePayloadStart = exchangeSource.indexOf(
    "const response = proposalSigningJson",
  );
  const publicExchangePayloadSource = exchangeSource.slice(
    publicExchangePayloadStart,
    exchangeSource.indexOf("setProposalSigningCookies({", publicExchangePayloadStart),
  );

  const signingHtmlTemplateStart = pageSource.indexOf("`<!doctype html>");
  const signingHtmlTemplateEnd = pageSource.indexOf(
    "</html>`;",
    signingHtmlTemplateStart,
  );
  assert(
    signingHtmlTemplateStart >= 0 && signingHtmlTemplateEnd > signingHtmlTemplateStart,
    "Customer signing page exposes one deterministic HTML template for syntax validation",
  );
  const signingHtmlTemplate = pageSource.slice(
    signingHtmlTemplateStart,
    signingHtmlTemplateEnd + "</html>`".length,
  );
  const renderSigningHtml = new Function(
    "nonce",
    "serializedRequestId",
    "serializedFragmentKey",
    "serializedCsrfCookieName",
    `return ${signingHtmlTemplate};`,
  );
  const renderedSigningHtml = renderSigningHtml(
    "test-nonce",
    JSON.stringify("00000000-0000-4000-8000-000000000000"),
    JSON.stringify("token"),
    JSON.stringify("wts_test_csrf"),
  );
  const renderedSigningScript = renderedSigningHtml.match(
    /<script nonce="test-nonce">([\s\S]*?)<\/script>/,
  )?.[1];
  assert(renderedSigningScript, "Customer signing page emits its nonce-bound bootstrap script");
  let renderedSigningScriptSyntaxError = null;
  try {
    new Function(renderedSigningScript);
  } catch (error) {
    renderedSigningScriptSyntaxError = error;
  }
  assert(
    renderedSigningScriptSyntaxError === null,
    `The exact emitted customer bootstrap script must compile before a token is stripped or exchanged: ${renderedSigningScriptSyntaxError?.message ?? "unknown syntax error"}`,
  );
  assert(
    renderedSigningScript.includes('.replace(/[+]/g, "-")') &&
      renderedSigningScript.includes('.replace(/[/]/g, "_")') &&
      !renderedSigningScript.includes(".replace(/+/g"),
    "The emitted Base64URL conversion keeps template-safe regular expressions",
  );
  assert(
    (renderedSigningScript.match(/\.replace\(\/\\s\+\/g,/g) ?? []).length === 2 &&
      !renderedSigningScript.includes(".replace(/s+/g"),
    "The emitted signer and signature normalization preserves exact whitespace-class matching",
  );

  assert(pageSource.includes('history.replaceState(null, "", location.pathname + location.search)'), "Customer page strips the fragment before exchange");
  assert(pageSource.includes('byId("continue-button").addEventListener("click"'), "Token exchange requires a deliberate customer click");
  assert(pageSource.includes('renderSession(await jsonRequest("session"))'), "A revisited one-time link reuses an existing secure browser session before exchange");
  assert(!pageSource.includes("console."), "Customer signing page produces no browser console noise");
  assert(pageSource.includes("textContent ="), "Customer data is rendered with textContent rather than HTML injection");
  assert(pageSource.includes('setText("signer-identity", session.signer.name)') && pageSource.includes('byId("signer-name").value = session.signer.name'), "Customer sees and starts with the exact frozen intended signer name required by the database");
  assert(pageSource.includes('setText(\n        "request-expires"') && pageSource.includes("session.requestExpiresAt"), "Customer sees the exact signing-request deadline after secure exchange");
  for (const evidence of [
    'addRow(article, "Quantity / unit"',
    'addRow(article, "Line total"',
    'item.description || "Not specified"',
    'addRow(article, "Selection"',
    'addRow(article, "Unit price"',
    'addRow(article, "Option total"',
    'addRow(article, "Pricing effect"',
    'addRow(article, "Frozen price-effect type"',
    'addRow(article, "Frozen base amount replaced"',
    'addRow(article, "Net adjustment if selected"',
    'addRow(article, "Applied to accepted total"',
    'option.description || "Not specified"',
    'option.scopeDetails || "Not specified"',
    'option.warrantyEffect || "Not specified"',
    'option.customerNotes || "Not specified"',
  ]) {
    assert(pageSource.includes(evidence), `Customer signing page discloses full frozen field: ${evidence}`);
  }
  for (const evidence of [
    'id="base-subtotal"',
    'id="discount-total"',
    'id="tax-total"',
    'id="fee-total"',
    'id="deposit-type"',
    'id="deposit-value"',
    '"Percent (percent)"',
    '"Fixed amount (fixed)"',
    '"None (none)"',
    '" (not applicable)"',
    "pendingExchangeKey = generateExchangeKey()",
    "button.textContent = \"Retry securely\"",
    "body:JSON.stringify({token,exchangeKey})",
    "clearPendingExchange();",
  ]) {
    assert(pageSource.includes(evidence), `Customer signing page preserves disclosure/retry contract: ${evidence}`);
  }
  assert(pageSource.includes("noindex,nofollow,noarchive,nosnippet,noimageindex"), "Customer page blocks indexing and snippets");
  assert(
    receiptPdfSource.includes("buildDeterministicUnicodeTextPdf") &&
      receiptPdfSource.includes("groupPdfSection") &&
      receiptPdfSource.includes("calculateProposalSigningOptionTotal") &&
      receiptPdfSource.includes("Array<string | readonly string[]>") &&
      !receiptPdfSource.includes('normalize("NFKD")') &&
      !receiptPdfSource.includes("function ascii") &&
      !receiptPdfSource.includes("section.title.toUpperCase()"),
    "Signed receipt uses keep-together Unicode blocks without transliteration or section-title case changes",
  );
  assert(
    pageSource.includes("roundRationalHalfAwayFromZero") &&
      pageSource.includes("const quantityMilli = BigInt") &&
      pageSource.includes("priceCents * quantityMilli, 1000n"),
    "Public signing review uses the same exact cents-by-quantity-thousandths arithmetic as SQL and the immutable PDFs",
  );
  assert(
    nextConfigSource.includes('source: "/proposal/sign/:path*"') &&
      nextConfigSource.includes('source: "/api/proposals/signing/:path*"') &&
      nextConfigSource.match(/value: "no-referrer"/g)?.length === 2,
    "Signing page and API override the global referrer header with no-referrer",
  );
  assert(httpSource.includes('httpOnly: true') && httpSource.includes('sameSite: "strict"') && httpSource.includes('secure: true'), "Session cookie is HttpOnly, Secure, and SameSite Strict");
  assert(acceptSource.includes("requestHasExactOrigin") && acceptSource.includes("requestHasValidCsrf"), "Acceptance enforces exact Origin and CSRF");
  assert(declineSource.includes("requestHasExactOrigin") && declineSource.includes("requestHasValidCsrf"), "Decline enforces exact Origin and CSRF");
  assert(exchangeSource.includes("PROPOSAL_SIGNING_MAX_EXCHANGE_BODY_BYTES"), "One-time token exchange has a byte bound");
  assert(
    exchangeSource.includes("isProposalSigningExchangeKey(exchangeKey)") &&
      exchangeSource.includes("deriveProposalSigningSessionToken") &&
      exchangeSource.includes("exchangeKey,"),
    "Token exchange derives an exact retryable server session from the ephemeral browser key",
  );
  assert(
    !publicExchangePayloadSource.includes("requestId") &&
      !publicExchangePayloadSource.includes("sessionId") &&
      !publicExchangePayloadSource.includes("sessionToken"),
    "Successful exchange response contains only status and expiry, never internal identifiers or credentials",
  );
  assert(
    !dbSource.includes("exchangeKey") &&
      !contractsSource.includes("exchangeKey"),
    "The ephemeral exchange key never enters database RPC or persisted signing contracts",
  );
  assert(acceptSource.includes("PROPOSAL_SIGNING_MAX_ACTION_BODY_BYTES"), "Signature acceptance has a byte bound");
  assert(acceptSource.includes("loaded.session.signer.email"), "Signer email is derived from the server session, not browser input");
  assert(
    acceptSource.includes("safeEqual(signerName, intendedSignerName)") &&
      acceptSource.includes("signerName: intendedSignerName"),
    "Acceptance requires the typed normalized name to match and persists the canonical frozen intended signer name",
  );
  assert(
    !publicSessionMapperSource.includes("acceptanceId:") &&
      !publicSessionMapperSource.includes("signatureId:") &&
      !publicSessionMapperSource.includes("requestId:") &&
      contractsSource.includes('| "requestId"') &&
      contractsSource.includes('| "selectedOptionIds"'),
    "Public session evidence excludes request, row, option, acceptance, signature, and session identifiers",
  );
  assert(acceptSource.includes("proposal.selectedOptionIds") && acceptSource.includes("proposal.acceptedTotal"), "Accepted options and total come from the immutable server snapshot");
  assert(
    acceptSource.includes('["active", "signed"].includes(loaded.session.status)') &&
      declineSource.includes('["active", "declined"].includes(loaded.session.status)') &&
      pageSource.includes("Signature outcome not confirmed") &&
      pageSource.includes("Decline outcome not confirmed") &&
      !pageSource.includes("Signature was not recorded") &&
      !pageSource.includes("Response was not recorded"),
    "Lost acceptance or decline responses can converge through the exact idempotent RPC without a false non-commit claim",
  );
  assert(
    acceptSource.includes("Acceptance is already committed") &&
      acceptSource.includes(
        "The signature is recorded, but the signed receipt is not ready yet.",
      ),
    "A post-commit receipt failure cannot be misreported as a failed customer signature",
  );
  assert(
    acceptSource.includes("toProposalSigningPublicAcceptResponse") &&
      !acceptSource.includes("...result") &&
      !acceptSource.includes("sessionId") &&
      !acceptSource.includes("signatureId"),
    "Acceptance route returns only the explicit token-free public result",
  );
  assert(
    declineSource.includes("toProposalSigningPublicDeclineResponse") &&
      !declineSource.includes("proposalSigningJson(result)") &&
      !declineSource.includes("sessionId"),
    "Decline route returns only the explicit token-free public result",
  );
  assert(dbSource.includes('exchange: "wtos_exchange_proposal_signing_token"'), "Adapter uses the frozen token exchange RPC");
  assert(dbSource.includes('session: "wtos_get_proposal_signing_session"'), "Adapter uses the frozen session RPC");
  assert(dbSource.includes('accept: "wtos_accept_proposal_signing"'), "Adapter uses the atomic acceptance RPC");
  assert(dbSource.includes('decline: "wtos_decline_proposal_signing"'), "Adapter uses the atomic decline RPC");
  assert(dbSource.includes('registerReceipt: "wtos_register_proposal_signing_receipt"'), "Adapter uses the immutable receipt registration RPC");
  assert(dbSource.includes('receiptRecovery: "wtos_get_proposal_signing_receipt_recovery"'), "Adapter uses the service-only receipt recovery RPC");
  assert(dbSource.includes('"receiptRecovery",\n    "recovery_request",\n    input'), "Receipt recovery sends only the frozen recovery envelope to Postgres");
  assert(publicSessionSource.includes("maskProposalSigningEmail") && !sessionSource.includes("bucket:"), "Browser session masks email and does not author Storage access fields");
  assert(documentSource.includes('document.bucket !== "customer-documents"') && documentSource.includes('document.path.startsWith(expectedPrefix)'), "Final proposal streaming rechecks private bucket and company path");
  assert(documentSource.includes('createHash("sha256")') && documentSource.includes("bytes.byteLength !== document.sizeBytes"), "Final proposal bytes must match frozen digest and size");
  assert(receiptSource.includes('receipt.bucket !== "customer-documents"') && receiptSource.includes('createHash("sha256")'), "Receipt streaming verifies private Storage and digest");
  assert(
    receiptSource.includes("try {") &&
      receiptSource.includes(
        "The signature is recorded, but the signed receipt is not ready yet.",
      ),
    "Receipt generation failures return a truthful retryable response without changing acceptance",
  );
  assert(receiptSourceHelper.includes("upsert: false") && receiptSourceHelper.includes("exactObjectAlreadyExists"), "Receipt creation is non-overwriting and idempotently digest reconciled");
  assert(receiptSourceHelper.includes('registration.status !== "unavailable"') && receiptSourceHelper.includes("conclusiveRead.receipt?.sha256 === sha256"), "Conclusive receipt registration failures re-read exact database state before cleanup while ambiguous transport remains retryable");
  assert(
    receiptSourceHelper.includes("removed.length !== 1") &&
      receiptSourceHelper.includes("existence.data === false") &&
      receiptSourceHelper.includes("existence.error !== null") &&
      receiptSourceHelper.includes("missingStatus === 400 || missingStatus === 404"),
    "Unregistered receipt cleanup requires exact-path removal and the installed Storage missing-object proof shape",
  );
  assert(receiptSourceHelper.includes("ensureProposalSigningReceiptWithRefresh") && receiptSourceHelper.includes("getProposalSigningReceiptRecovery(recoveryKeys)"), "Owner recovery reuses the same deterministic receipt creation and convergence path");
  assert(
    receiptSourceHelper.includes("session.requestId !== recoveryKeys.requestId") &&
      receiptSourceHelper.includes("session.proposal.companyId !== recoveryKeys.companyId") &&
      receiptSourceHelper.includes("session.acceptance?.acceptanceId !== recoveryKeys.acceptanceId"),
    "Owner recovery rejects a session outside the exact request, company, or acceptance scope before upload",
  );
  assert(!allPublicSource.includes("createSignedUrl"), "Public signing routes never mint or persist durable Storage URLs");
  assert(!allPublicSource.includes("NEXT_PUBLIC_SUPABASE"), "Customer browser surface never receives Supabase configuration");

  console.log("Native proposal signing security tests passed.");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
