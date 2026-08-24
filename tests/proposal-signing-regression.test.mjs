import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveBrowserRegressionGroups } from "./codex-browser/regression-runtime.mjs";

const cwd = process.cwd();
const outDir = mkdtempSync(join(tmpdir(), "wtos-proposal-signing-regression-"));
const tsc = join(cwd, "node_modules", ".bin", "tsc");

function source(path) {
  return readFileSync(join(cwd, path), "utf8");
}

try {
  const compile = spawnSync(
    tsc,
    [
      "lib/proposal-signing/regression.ts",
      "lib/deployment/regressionSafety.ts",
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
  assert.equal(
    compile.status,
    0,
    `Could not compile proposal-signing regression guards.\n${compile.stdout}\n${compile.stderr}`,
  );

  const regression = await import(
    pathToFileURL(join(outDir, "proposal-signing", "regression.js"))
  );
  const safeEnv = {
    NEXT_PUBLIC_SUPABASE_URL:
      "https://hygtnhmmaoboduqghhwg.supabase.co",
    WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF:
      "hygtnhmmaoboduqghhwg",
    WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED: "true",
    NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK: "true",
  };
  assert.equal(
    regression.proposalSigningRegressionBoundaryIsEnabled({
      requestOrigin: "http://127.0.0.1:3000",
      env: safeEnv,
    }),
    true,
    "Exact isolated target and local app enable the synthetic delivery boundary",
  );
  for (const [label, env, requestOrigin] of [
    ["Production project", { ...safeEnv, NEXT_PUBLIC_SUPABASE_URL: "https://gahfcgyjtfwwmsterhzu.supabase.co" }, "http://localhost:3000"],
    ["Deployed Vercel runtime", { ...safeEnv, VERCEL: "1" }, "http://localhost:3000"],
    ["Non-local app", safeEnv, "https://weathertech-os.vercel.app"],
    ["Enabled Gmail", { ...safeEnv, GOOGLE_GMAIL_SEND_ENABLED: "true" }, "http://localhost:3000"],
    ["Demo fallback", { ...safeEnv, NEXT_PUBLIC_DISABLE_CRM_DEMO_FALLBACK: "false" }, "http://localhost:3000"],
  ]) {
    assert.equal(
      regression.proposalSigningRegressionBoundaryIsEnabled({ requestOrigin, env }),
      false,
      `${label} cannot enable synthetic signing delivery`,
    );
  }
  assert.equal(
    regression.buildProposalSigningRegressionMarker("20260824123456789"),
    "TEST WTOS PROPOSAL SIGNING 20260824123456789",
  );
  assert.throws(
    () => regression.buildProposalSigningRegressionMarker("unsafe"),
    /17-digit run ID/,
  );
  assert.equal(
    regression.resolveProposalSigningRegressionRequestExpiresInMs(undefined),
    regression.PROPOSAL_SIGNING_REGRESSION_DEFAULT_REQUEST_EXPIRES_IN_MS,
    "Ordinary isolated activations retain the exact 24-hour request deadline",
  );
  for (const requestExpiresInMs of [5_000, 10_000, 15_000]) {
    assert.equal(
      regression.resolveProposalSigningRegressionRequestExpiresInMs(
        requestExpiresInMs,
      ),
      requestExpiresInMs,
      "The strict local boundary accepts only exact bounded short-lived deadlines",
    );
  }
  for (const invalidExpiry of [4_999, 15_001, 10_000.5, "10000", null]) {
    assert.equal(
      regression.resolveProposalSigningRegressionRequestExpiresInMs(
        invalidExpiry,
      ),
      null,
      "The strict local boundary rejects malformed or out-of-range deadlines",
    );
  }
  assert.deepEqual(
    resolveBrowserRegressionGroups({ groups: ["proposal-signing"], fullRun: false }),
    { groups: ["proposal-signing"], fullRun: false },
    "Native signing is an explicit targeted Browser group and does not change the established 24-group full run",
  );

  const route = source("app/api/regression/proposal-signing/activate/route.ts");
  const browserModule = source("tests/codex-browser/proposal-signing-browser.mjs");
  const browserHarness = source("tests/codex-browser/weathertech-os-regression.mjs");
  const migration = source(
    "supabase/migrations/20260824044610_native_proposal_esign_sold_job_gate.sql",
  );
  for (const evidence of [
    "proposalSigningRegressionBoundaryIsEnabled",
    "resolveProposalSigningRegressionRequestExpiresInMs",
    "requestHasExactOrigin",
    'eq("role", "owner")',
    "SYNTHETIC_EMAIL_PATTERN",
    "wtos_activate_synthetic_proposal_signing_fixture",
    "requestTokenHash: hashProposalSigningToken(rawToken)",
    "wtos_prepare_proposal_signing_request",
    "wtos_transition_proposal_signing_request",
    "requestExpiresAt",
    "preparedExpiresAt",
    "buildProposalSigningUrl(request.nextUrl.origin, requestId, rawToken)",
    '"Cache-Control": "private, no-store, max-age=0, must-revalidate"',
  ]) {
    assert.ok(route.includes(evidence), `Synthetic activation route preserves ${evidence}`);
  }
  assert.ok(!route.includes("console."), "Raw signing tokens cannot enter application logs");
  assert.ok(
    !route.includes('.from("email_messages")'),
    "The isolated activation route must use its exact guarded synthetic RPC instead of direct signature-email writes",
  );
  assert.equal(
    (route.match(/requestTokenHash: hashProposalSigningToken\(rawToken\)/g) ?? []).length,
    1,
    "Only the raw token digest is supplied to persistent preparation",
  );
  assert.ok(
    !route.includes("body: signingUrl") &&
      !route.includes("message_preview: signingUrl") &&
      !route.includes("metadata: { signingUrl"),
    "The raw signing URL is not persisted in email body, preview, or metadata",
  );

  for (const evidence of [
    "createProtocolCookieJar",
    "createServerClient",
    'typeof error.message === "string"',
    'typeof error.stack === "string"',
    "response.headers.getSetCookie()",
    "cookieJar.applyResponse(response)",
    "mainProtocolCookieJar",
    "storedPdfDigest",
    "downloadMedia",
    "Exact proposal Storage removal response did not match the complete requested path set.",
    ".exists(path)",
    "result.data === false",
    "result.error !== null",
    "[400, 404].includes(Number(result.error.status))",
    "exact proposal Storage deletion convergence",
    "dashboardButton.click",
    "await tab.back()",
    "A draft estimate was not refused before immutable proposal finalization",
    "labor_total: BASE_SUBTOTAL",
    "material_total: 0",
    "unit_price: BASE_SUBTOTAL",
    "synthetic estimate totals do not match their exact canonical line source",
    'update({ status: "approved" })',
    "finalizeProposalFromOwnerUi",
    'proposal-deposit-type',
    "selectEditableDepositType",
    "Deposit selection diagnostic",
    "fillEditableDepositValue",
    "attempt <= 3",
    "Deposit value convergence diagnostic",
    "selectionResult",
    "immediateControls",
    "lastControls",
    "{ timeoutMs: 8000 }",
    "owner fixed-deposit control enabled",
    "owner percentage-deposit control enabled",
    "owner temporary percentage-deposit control enabled",
    "owner no-deposit control disabled its value input",
    "owner fixed-deposit preview",
    "owner percentage-deposit preview before no-deposit choice",
    "owner-selected deposit rule preview",
    "owner proposal finalization",
    'getByRole("alert",',
    'name: "Error notification"',
    "owner proposal finalization was refused",
    "owner-finalized proposal readback",
    "finalizedRevisionMatchesOwnerSelection",
    "Last immutable-finalization snapshot",
    "immutable proposal route convergence before exact cleanup",
    "Last cleanup finalization snapshot",
    "frozen owner deposit rule reload",
    "The ${mode} owner-selected deposit rule was not frozen exactly into the proposal revision.",
    "The ${mode} owner-selected upgrade was not frozen into the exact proposal revision.",
    "A null-linked generic signature referenced the native finalized proposal document.",
    "A null-linked legacy signature was updated onto the native proposal document.",
    "unrelated generic signature remains allowed",
    "Failed native-document linkage changed the unrelated generic signature.",
    "A non-electronic acceptance was inserted against the native-finalized proposal.",
    'acceptance_method: "internal_recorded"',
    "lastCustomerBootstrapState.hashPresent === false",
    "Last token-free customer bootstrap snapshot",
    "A consumed raw signing token minted or attempted to mint another session",
    "renewedSignedCookieJar",
    'renewedExchange.payload?.status === "signed"',
    "renewedSignedCookieJar.names()",
    "terminal signed renewal did not retain only its read credential",
    "expectedPublicCustomerSnapshot",
    "isDeepStrictEqual",
    "renewedSession.payload?.status === \"signed\"",
    "PII-safe predicate diagnostic",
    "proposalFieldPredicates",
    "terms: frozenSnapshot?.terms",
    "normalizePublicSnapshotNumericWireValues",
    "normalizePublicReceiptNumericWireValues",
    "numericWireSemanticExact",
    "lineItemsNumericWireSemanticExact",
    "sectionsNumericWireSemanticExact",
    "optionsNumericWireSemanticExact",
    "registeredAtTextExact",
    "registeredAtInstantExact",
    "privateValuesAbsent",
    "renewed signed session did not return the exact terminal public proposal and receipt snapshot",
    "renewedReceiptDownload",
    "renewedReceiptDigest.sha256 === receipt.signed_document_sha256",
    "terminal signed-session renewal persistence",
    'credentials: "omit"',
    "An exact lost-response retry failed to recover the already committed signing session.",
    "A different exchange key replayed the consumed invitation into another session.",
    "lost-response retry fixture revocation",
    "Persistent signing-link rate limit returned an unexpected result",
    "An expired signing request accepted its raw invitation token",
    "genuine signing request expiry",
    "responseDbDeltaMs",
    "deadlineRemainingMs",
    "deadlineDiagnostic",
    "expired fixture terminal revocation",
    "The genuinely expired request did not clear its active uniqueness terminally.",
    "A revoked signing request accepted its raw invitation token",
    "Direct proposal document access succeeded without a private signing session",
    "Cross-company signing request scope was accepted",
    "An already expired private session was accepted",
    "A tampered customer identity was accepted for the frozen signer",
    "A conflicting post-signature action replay was accepted",
    '.select("id,name,selected")',
    "selectedFinalizedOptions.length === 1",
    "finalizedSelectedOptionId",
    "selectedIdIsCanonical",
    "oneSelectedCanonicalOption",
    "frozenSnapshotPredicates",
    "selected_option_ids: [finalizedSelectedOptionId]",
    "selectedOptionIds: [finalizedSelectedOptionId]",
    "The ${mode} immutable customer snapshot did not preserve exact option/total/deposit evidence:",
    "The signed customer page exposed private evidence or omitted the exact receipt control.",
    "sourcePdf.sha256 === sourceDocument.content_sha256",
    "customerDisclosure.exact",
    "source.lineItem.description",
    "source.sourceAlternateOption.description",
    'priceEffectType === "replace_base_amount"',
    "Frozen base amount replaced",
    "Net adjustment if selected",
    "Applied to accepted total",
    "Base subtotal",
    "Discount",
    "Tax",
    "Fees",
    "Percent (percent)",
    "None (none)",
    "source.sourceSection.title",
    "Scope — Protección",
    "Условия сохранены.",
    "The ${mode} signing page omitted the exact deadline, Unicode signer, or frozen customer-visible option/line details.",
    "Taylór García",
    "Наталья Ильина",
    "receiptPdf.sha256 === receipt.signed_document_sha256",
    "Completed Signed Proposal and Customer Receipt",
    "CUSTOMER-VISIBLE PROPOSAL SECTIONS",
    "FINALIZED LINE ITEMS",
    "FINALIZED OPTIONS",
    "EXACT PROPOSAL TERMS",
    "ELECTRONIC RECORDS DISCLOSURE",
    "ELECTRONIC SIGNATURE CERTIFICATE",
    "receiptPdf.missingRequiredText.length === 0",
    "receiptPdf.presentForbiddenText.length === 0",
    "signed evidence convergence",
    '"wtos_accept_proposal_signing"',
    "signedSessionRow.session_token_sha256",
    "cidToText",
    "WTOS-TEXT-BEGIN",
    "extractedText",
    'graph.requests.length === (mode === "no-deposit" ? 5 : 1)',
    'graph.sessions.length === (mode === "no-deposit" ? 3 : 2)',
    "A raw signing token or ephemeral exchange key leaked into persistent proposal evidence",
    'rawTokensHeldOnlyInMemory.fill("")',
    'exchangeKeysHeldOnlyInMemory.fill("")',
    'estimateAfterSigning.status === "approved"',
    "exact owner proposal workspace",
    "owner proposal browser-history restoration",
    "owner proposal refresh restoration",
    "proposal-reconcile-receipt-button",
    "Required-deposit proposal converted before a posted deposit",
    "wrong-customer payment seed",
    "wrong-customer posted deposit",
    "A posted wrong-customer payment satisfied the exact proposal deposit gate.",
    "The owner workspace counted a posted wrong-customer payment",
    "Create exact deposit invoice",
    "exact deposit invoice navigation",
    'status: "posted"',
    "estimate-convert-job-button",
    "exact sold-job navigation",
    "sold-job refresh restoration",
    "conversion.created === false",
    '"wtos_cleanup_synthetic_proposal_fixture"',
    "active synthetic signing request cleanup revocation",
    "Synthetic proposal cleanup retained an active signing request.",
    "Workflow failed:",
    "Cleanup also failed:",
    '`${companyId}/proposals/${proposalRevisionId}`',
    '`${companyId}/proposal-signing/${request.id}`',
    "storageResidueCount === 0",
    "databaseResidueCount === 0",
    "consumedRequestBindingsCleared",
    "Synthetic proposal cleanup found consumed request evidence outside its exact session graph.",
    "Exact synthetic proposal cleanup post-read found database residue.",
  ]) {
    assert.ok(browserModule.includes(evidence), `Browser signing lifecycle preserves ${evidence}`);
  }
  for (const unsupportedBrowserMutation of [
    "tab.playwright.evaluate(async",
    "document.cookie",
    "browserJson",
    "browserPdfDigest",
    "download.path(",
    "download.saveAs(",
    ".download(path)",
    "history.back()",
    "instanceof HTML",
    "globalThis.",
    '.update({ status: "expired" })',
  ]) {
    assert.ok(
      !browserModule.includes(unsupportedBrowserMutation),
      `Browser signing lifecycle does not depend on unsupported page-scope mutation: ${unsupportedBrowserMutation}`,
    );
  }
  assert.ok(
    !browserModule.includes("return rows[0] ? { revision: rows[0] } : null;"),
    "Owner finalization polling cannot treat the first partial revision row as an immutable artifact",
  );
  assert.equal(
    (browserModule.match(/source\.sourceOption\.id/g) ?? []).length,
    1,
    "The editable source option ID is used only as the pre-finalization owner input; all immutable acceptance evidence uses the canonical child ID",
  );
  assert.ok(
    browserHarness.includes('enabledGroups.has("proposal-signing")') &&
      browserHarness.includes("testNativeProposalSigningWorkflow"),
    "The isolated native-signing Browser group executes its dedicated lifecycle",
  );
  for (const evidence of [
    "Finalize the revised proposal choices before preparing customer delivery.",
    "prefinalization signature preparation refusal without false success",
    "Prefinalization signature refusal created immutable proposal or signing-request residue.",
    "Waiting on proposal gates",
    "Proposal gates incomplete",
    "Incomplete proposal gates created",
    "proposalFinalized: false",
    "signaturePrepared: false",
  ]) {
    assert.ok(
      browserHarness.includes(evidence),
      `Default Estimates regression preserves truthful native-signing gate: ${evidence}`,
    );
  }
  for (const staleEvidence of [
    "Customer signature requested for the estimate packet.",
    "This estimate packet already has an active signature request.",
    "Estimates approve and convert an isolated estimate into one draft job",
    'workspace?.textContent?.includes("Ready for draft job")',
  ]) {
    assert.ok(
      !browserHarness.includes(staleEvidence),
      `Default Estimates regression no longer asserts the retired local-signature behavior: ${staleEvidence}`,
    );
  }
  assert.ok(
    !browserModule.includes("console.") &&
      !browserModule.includes("signingUrl.href}`") &&
      !browserModule.includes("rawToken}`") &&
      !browserModule.includes("exchangeKey}`"),
    "The Browser lifecycle never logs or interpolates raw customer or exchange credentials into errors",
  );

  for (const evidence of [
    "create or replace function public.wtos_cleanup_synthetic_proposal_fixture",
    "Only the exact approved isolated regression owner can clean a synthetic proposal fixture.",
    "Synthetic proposal cleanup refused an incomplete or overbroad exact graph.",
    "Synthetic proposal Storage bytes must be removed and verified absent before metadata cleanup.",
    "grant execute on function public.wtos_cleanup_synthetic_proposal_fixture(jsonb)\nto service_role",
  ]) {
    assert.ok(migration.includes(evidence), `Exact synthetic cleanup preserves ${evidence}`);
  }
  assert.ok(
    migration.includes("'lineItems', coalesce((") &&
      migration.includes("public.wtos_scrub_proposal_customer_text(item.name)") &&
      migration.includes("public.wtos_scrub_proposal_customer_text(item.description)") &&
      migration.includes("public.wtos_scrub_proposal_customer_text(item.unit)") &&
      !migration.includes("'description', item.description"),
    "The immutable customer snapshot preserves only the scrubbed customer-visible line-item fields",
  );

  console.log("Proposal signing isolated regression boundary: PASS");
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
