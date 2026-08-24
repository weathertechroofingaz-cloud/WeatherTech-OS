import { createHash, randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getBrowserRegressionAuthCredentials } from "./regression-runtime.mjs";

const CUSTOMER_DOCUMENT_BUCKET = "customer-documents";
const MARKER_PREFIX = "TEST WTOS PROPOSAL SIGNING";
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const LAPTOP_VIEWPORT = { width: 1366, height: 768 };
const BASE_SUBTOTAL = 1000;
const DISCOUNT_TOTAL = 100;
const TAX_TOTAL = 90;
const FEE_TOTAL = 0;
const BASE_TOTAL = 990;
const SELECTED_UPGRADES_TOTAL = 250;
const ACCEPTED_TOTAL = 1240;
const REQUIRED_DEPOSIT_AMOUNT = 124;
const SHORT_REQUEST_EXPIRES_IN_MS = 10_000;

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function describeThrownValue(error) {
  if (error instanceof Error) return error.stack || error.message;
  if (error && typeof error === "object") {
    try {
      const message =
        typeof error.message === "string" ? error.message.trim() : "";
      const stack = typeof error.stack === "string" ? error.stack.trim() : "";
      if (stack) return stack;
      if (message) return message;
    } catch {
      // Fall through to safe serialization for foreign/proxied thrown values.
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function finalizedRevisionArtifactIsRegistered(revision) {
  return Boolean(
    revision?.id &&
      revision.status === "ready_to_send" &&
      revision.finalized_document_id &&
      revision.revision_sha256 &&
      revision.terms_sha256 &&
      revision.customer_snapshot &&
      revision.finalized_at &&
      revision.immutable_after_at,
  );
}

function finalizedRevisionMatchesOwnerSelection(
  revision,
  { depositType, depositValue, depositAmount, depositRequired },
) {
  return finalizedRevisionArtifactIsRegistered(revision) &&
    Number(revision.accepted_total) === ACCEPTED_TOTAL &&
    revision.deposit_type === depositType &&
    Number(revision.deposit_value) === depositValue &&
    revision.deposit_required === depositRequired &&
    Number(revision.deposit_amount) === depositAmount &&
    Number(revision.remaining_balance) === ACCEPTED_TOTAL - depositAmount &&
    revision.requires_deposit_before_job === depositRequired;
}

function finalizedRevisionDiagnostic(revision) {
  if (!revision) return null;
  return {
    id: revision.id,
    status: revision.status,
    acceptedTotal: revision.accepted_total,
    depositType: revision.deposit_type,
    depositValue: revision.deposit_value,
    depositRequired: revision.deposit_required,
    depositAmount: revision.deposit_amount,
    remainingBalance: revision.remaining_balance,
    requiresDepositBeforeJob: revision.requires_deposit_before_job,
    hasFinalizedDocument: Boolean(revision.finalized_document_id),
    hasRevisionSha256: Boolean(revision.revision_sha256),
    hasTermsSha256: Boolean(revision.terms_sha256),
    hasCustomerSnapshot: Boolean(revision.customer_snapshot),
    hasFinalizedAt: Boolean(revision.finalized_at),
    hasImmutableAfterAt: Boolean(revision.immutable_after_at),
  };
}

function normalizeRpcData(data) {
  return Array.isArray(data) && data.length === 1 ? data[0] : data;
}

async function requireSingle(query, label) {
  const { data, error } = await query;
  if (error || !data) {
    throw new Error(`${label} failed: ${error?.message ?? "no row returned"}`);
  }
  return data;
}

async function requireRows(query, label) {
  const { data, error } = await query;
  if (error) throw new Error(`${label} failed: ${error.message}`);
  return data ?? [];
}

async function callRpc(client, name, argumentName, request, label = name) {
  const { data, error } = await client.rpc(name, { [argumentName]: request });
  if (error) throw new Error(`${label} failed: ${error.message}`);
  const result = normalizeRpcData(data);
  requireCondition(result && typeof result === "object", `${label} returned no object.`);
  return result;
}

async function expectRpcRefusal(client, name, argumentName, request, message) {
  const { data, error } = await client.rpc(name, { [argumentName]: request });
  requireCondition(Boolean(error) || normalizeRpcData(data)?.ok === false, message);
}

async function expectPostgresSemanticRefusal(query, message, expectedMessage) {
  const { error } = await query;
  requireCondition(
    error?.code === "P0001" &&
      (!expectedMessage || error.message?.includes(expectedMessage)),
    `${message} Expected P0001${expectedMessage ? ` (${expectedMessage})` : ""}, received ${error?.code ?? "success"}: ${error?.message ?? "no error"}.`,
  );
}

function createServiceClient(env) {
  return createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function createOwnerClient(env) {
  const credentials = getBrowserRegressionAuthCredentials(env);
  const cookieJar = createProtocolCookieJar();
  const client = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      cookies: {
        getAll() {
          return cookieJar.getAll();
        },
        setAll(cookiesToSet) {
          cookieJar.setAll(cookiesToSet);
        },
      },
    },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  if (error || !data.user) {
    throw new Error(`Proposal signing owner login failed: ${error?.message ?? "no user"}`);
  }
  requireCondition(
    cookieJar.getAll().length > 0,
    "Proposal signing owner login did not produce the server auth cookie boundary.",
  );
  return { client, user: data.user, cookieJar };
}

function createProtocolCookieJar() {
  const cookies = new Map();

  const setCookie = (name, value, options = {}) => {
    if (!name) return;
    if (value === "" || options.maxAge === 0) {
      cookies.delete(name);
      return;
    }
    cookies.set(name, value);
  };

  return {
    getAll() {
      return [...cookies].map(([name, value]) => ({ name, value }));
    },
    names() {
      return [...cookies.keys()];
    },
    setAll(cookiesToSet) {
      for (const cookie of cookiesToSet) {
        setCookie(cookie.name, cookie.value, cookie.options);
      }
    },
    applyResponse(response) {
      for (const header of response.headers.getSetCookie()) {
        const [pair, ...attributes] = header.split(";");
        const separator = pair.indexOf("=");
        if (separator <= 0) continue;
        const name = pair.slice(0, separator).trim();
        const value = pair.slice(separator + 1).trim();
        const maxAgeAttribute = attributes.find((attribute) =>
          /^\s*max-age\s*=/i.test(attribute),
        );
        const maxAge = maxAgeAttribute
          ? Number(maxAgeAttribute.split("=").slice(1).join("=").trim())
          : undefined;
        setCookie(name, value, { maxAge });
      }
    },
    header() {
      return [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ");
    },
  };
}

async function protocolBytes(
  baseUrl,
  path,
  { credentials = "same-origin", cookieJar = createProtocolCookieJar() } = {},
) {
  const requestUrl = new URL(path, baseUrl);
  const expectedOrigin = new URL(baseUrl).origin;
  requireCondition(
    requestUrl.origin === expectedOrigin,
    "Proposal signing protocol downloads must stay on the exact local application origin.",
  );
  const cookieHeader = credentials === "omit" ? "" : cookieJar.header();
  const response = await fetch(requestUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers: {
      Accept: "application/pdf",
      Origin: expectedOrigin,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
  });
  if (credentials !== "omit") cookieJar.applyResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    bytes: new Uint8Array(await response.arrayBuffer()),
    cacheControl: response.headers.get("cache-control"),
    contentLength: response.headers.get("content-length"),
    contentType: response.headers.get("content-type"),
  };
}

function expectedPublicCustomerSnapshot({
  activeRequest,
  finalizedRevision,
  frozenSnapshot,
}) {
  const lineItems = Array.isArray(frozenSnapshot?.lineItems)
    ? frozenSnapshot.lineItems.map(({ id: _id, ...lineItem }) => lineItem)
    : [];
  const sections = Array.isArray(frozenSnapshot?.sections)
    ? frozenSnapshot.sections.map(
        ({ id: _id, sectionKey: _sectionKey, ...section }) => section,
      )
    : [];
  const options = Array.isArray(frozenSnapshot?.options)
    ? frozenSnapshot.options.map(
        ({
          id: _id,
          optionGroupKey: _optionGroupKey,
          dependencyOptionId: _dependencyOptionId,
          conflictingOptionId: _conflictingOptionId,
          ...option
        }) => option,
      )
    : [];
  return {
    schemaVersion: frozenSnapshot?.schemaVersion,
    companyName: frozenSnapshot?.company?.name,
    brandName: frozenSnapshot?.company?.brandName,
    brandPrimaryColor: frozenSnapshot?.company?.primaryColor,
    brandAccentColor: frozenSnapshot?.company?.accentColor,
    proposalNumber: frozenSnapshot?.proposal?.number,
    revisionNumber: Number(frozenSnapshot?.proposal?.revisionNumber),
    title: frozenSnapshot?.proposal?.title,
    issueDate: frozenSnapshot?.proposal?.issueDate,
    customerName: frozenSnapshot?.customer?.name,
    propertyAddress: frozenSnapshot?.property?.address,
    baseSubtotal: Number(frozenSnapshot?.pricing?.baseSubtotal),
    discountTotal: Number(frozenSnapshot?.pricing?.discountTotal),
    taxTotal: Number(frozenSnapshot?.pricing?.taxTotal),
    feeTotal: Number(frozenSnapshot?.pricing?.feeTotal),
    baseTotal: Number(frozenSnapshot?.pricing?.baseTotal),
    lineItems,
    selectedUpgradesTotal: Number(
      frozenSnapshot?.pricing?.selectedUpgradesTotal,
    ),
    acceptedTotal: Number(frozenSnapshot?.pricing?.acceptedTotal),
    depositType: frozenSnapshot?.deposit?.type,
    depositValue: Number(frozenSnapshot?.deposit?.value),
    depositRequired: frozenSnapshot?.deposit?.required,
    requiresDepositBeforeJob: frozenSnapshot?.deposit?.requiredBeforeJob,
    requiredDepositAmount: Number(frozenSnapshot?.deposit?.requiredAmount),
    remainingBalance: Number(frozenSnapshot?.pricing?.remainingBalance),
    terms: frozenSnapshot?.terms,
    electronicRecordsDisclosure: activeRequest.consent_text,
    revisionSha256: finalizedRevision.revision_sha256,
    termsSha256: finalizedRevision.terms_sha256,
    consentSha256: activeRequest.consent_sha256,
    sections,
    options,
  };
}

function normalizePublicSnapshotNumericWireValues(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const finiteNumberOrOriginal = (value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  };
  return {
    ...snapshot,
    lineItems: Array.isArray(snapshot.lineItems)
      ? snapshot.lineItems.map((item) => ({
          ...item,
          quantity: finiteNumberOrOriginal(item.quantity),
          total: finiteNumberOrOriginal(item.total),
          sortOrder: finiteNumberOrOriginal(item.sortOrder),
        }))
      : snapshot.lineItems,
    sections: Array.isArray(snapshot.sections)
      ? snapshot.sections.map((section) => ({
          ...section,
          sortOrder: finiteNumberOrOriginal(section.sortOrder),
        }))
      : snapshot.sections,
    options: Array.isArray(snapshot.options)
      ? snapshot.options.map((option) => ({
          ...option,
          quantity: finiteNumberOrOriginal(option.quantity),
          price: finiteNumberOrOriginal(option.price),
          baseReplacementAmount: finiteNumberOrOriginal(
            option.baseReplacementAmount,
          ),
          sortOrder: finiteNumberOrOriginal(option.sortOrder),
        }))
      : snapshot.options,
  };
}

function normalizePublicReceiptNumericWireValues(receipt) {
  if (!receipt || typeof receipt !== "object") return receipt;
  const sizeBytes = Number(receipt.sizeBytes);
  return {
    ...receipt,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : receipt.sizeBytes,
  };
}

async function protocolJson(
  baseUrl,
  path,
  {
    method = "GET",
    body,
    headers = {},
    credentials = "same-origin",
    cookieJar = createProtocolCookieJar(),
  } = {},
) {
  const requestUrl = new URL(path, baseUrl);
  const expectedOrigin = new URL(baseUrl).origin;
  requireCondition(
    requestUrl.origin === expectedOrigin,
    "Proposal signing protocol requests must stay on the exact local application origin.",
  );
  const cookieHeader = credentials === "omit" ? "" : cookieJar.header();
  const response = await fetch(requestUrl, {
    method,
    cache: "no-store",
    redirect: "manual",
    headers: {
      Accept: "application/json",
      Origin: expectedOrigin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (credentials !== "omit") cookieJar.applyResponse(response);
  const payload = await response.json().catch(() => null);
  return {
    ok: response.ok,
    status: response.status,
    payload,
    cacheControl: response.headers.get("cache-control"),
  };
}

function pdfDigest(bytes, requiredText = [], forbiddenText = []) {
  const decoded = new TextDecoder().decode(bytes);
  const cidToText = new Map();
  for (const match of decoded.matchAll(/<([0-9A-F]{4})> <([0-9A-F]{4}|[0-9A-F]{8})>/g)) {
    const codeUnits = [];
    for (let offset = 0; offset < match[2].length; offset += 4) {
      codeUnits.push(Number.parseInt(match[2].slice(offset, offset + 4), 16));
    }
    cidToText.set(Number.parseInt(match[1], 16), String.fromCharCode(...codeUnits));
  }
  const extractedLines = [];
  for (const block of decoded.matchAll(/% WTOS-TEXT-BEGIN\n([\s\S]*?)\n% WTOS-TEXT-END/g)) {
    for (const text of block[1].matchAll(/<([0-9A-F]*)> Tj/g)) {
      let line = "";
      for (let offset = 0; offset < text[1].length; offset += 4) {
        line += cidToText.get(Number.parseInt(text[1].slice(offset, offset + 4), 16)) ?? "";
      }
      extractedLines.push(line);
    }
  }
  const extractedText = extractedLines.join("\n");
  const unwrappedText = extractedLines.join("");
  const normalizedText = extractedLines.join(" ").replace(/\s+/g, " ");
  return {
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    missingRequiredText: requiredText.filter(
      (value) =>
        !extractedText.includes(value) &&
        !unwrappedText.includes(value) &&
        !normalizedText.includes(value),
    ),
    presentForbiddenText: forbiddenText.filter(
      (value) =>
        extractedText.includes(value) ||
        unwrappedText.includes(value) ||
        normalizedText.includes(value),
    ),
  };
}

async function storedPdfDigest(
  service,
  documentId,
  requiredText = [],
  forbiddenText = [],
) {
  const document = await requireSingle(
    service.from("documents").select("*").eq("id", documentId).single(),
    "exact stored PDF evidence",
  );
  const { data, error } = await service.storage
    .from(document.storage_bucket)
    .download(document.storage_path);
  if (error || !data) {
    throw new Error(`Exact stored PDF download failed: ${error?.message ?? "no bytes"}`);
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  return {
    ok: true,
    contentType: document.mime_type,
    document,
    ...pdfDigest(bytes, requiredText, forbiddenText),
  };
}

async function waitForPage(tab, predicate, label, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await tab.playwright.evaluate(predicate)) return;
    await tab.playwright.waitForTimeout(150);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function readCustomerSigningBootstrapState(tab) {
  return tab.playwright.evaluate(() => {
    const statusTitle = document.getElementById("status-title");
    const statusMessage = document.getElementById("status-message");
    const continueActions = document.getElementById("continue-actions");
    const continueButton = document.getElementById("continue-button");
    return {
      path: `${location.pathname}${location.search}`,
      hashPresent: location.hash.length > 0,
      hashLength: location.hash.length,
      readyState: document.readyState,
      title: document.title,
      statusTitle: statusTitle?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      statusMessage:
        statusMessage?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      continueButtonText:
        continueButton?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      continueButtonDisabled:
        continueButton?.tagName === "BUTTON" ? continueButton.disabled : null,
      continueActionsHidden:
        continueActions?.classList.contains("hidden") ?? null,
      proposalContentHidden:
        document.getElementById("proposal-content")?.classList.contains("hidden") ??
        null,
      scriptCount: document.scripts.length,
    };
  });
}

async function waitForAsync(predicate, label, timeoutMs = 30_000) {
  const started = Date.now();
  let lastErrorMessage = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await predicate();
      if (value) return value;
    } catch (error) {
      lastErrorMessage = describeThrownValue(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Timed out waiting for ${label}${lastErrorMessage ? `: ${lastErrorMessage}` : "."}`,
  );
}

async function readOwnerEstimateWorkspaceState(tab, expected) {
  return tab.playwright.evaluate((target) => {
    const workspace = document.querySelector('[data-testid="proposal-builder-2-workspace"]');
    const approval = document.querySelector('[data-testid="estimate-approval-workspace"]');
    const workspaceText = `${workspace?.textContent ?? ""}\n${approval?.textContent ?? ""}`;
    const normalizedText = workspaceText.replace(/\s+/g, " ").trim();
    const activeCompany = [...document.querySelectorAll('button[aria-pressed="true"]')]
      .some((button) => button.textContent?.includes(target.companyName));
    const reconcileButton = document.querySelector(
      '[data-testid="proposal-reconcile-receipt-button"]',
    );
    const convertButton = document.querySelector(
      '[data-testid="estimate-convert-job-button"]',
    );
    const depositButton = [...document.querySelectorAll("button")].find((button) =>
      /Create exact deposit invoice|Deposit invoice exists/.test(button.textContent ?? ""),
    );
    const params = new URLSearchParams(location.search);
    return {
      ready:
        location.pathname === "/" &&
        params.get("view") === "estimates" &&
        params.get("estimate") === target.estimateId &&
        Boolean(workspace && approval) &&
        activeCompany &&
        normalizedText.includes(target.proposalNumber) &&
        normalizedText.includes(target.signerName) &&
        normalizedText.toLowerCase().includes("electronically signed") &&
        normalizedText.includes("$1,240.00"),
      href: location.href,
      text: normalizedText,
      activeCompany,
      reconcileVisible: Boolean(reconcileButton),
      depositButtonText: depositButton?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      depositButtonEnabled: Boolean(depositButton && !depositButton.disabled),
      convertButtonText: convertButton?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      convertButtonEnabled: Boolean(convertButton && !convertButton.disabled),
    };
  }, expected);
}

async function waitForOwnerEstimateWorkspace(tab, expected, label) {
  return waitForAsync(async () => {
    const state = await readOwnerEstimateWorkspaceState(tab, expected);
    return state.ready ? state : null;
  }, label, 35_000);
}

async function navigateToOwnerEstimateWorkspace({
  tab,
  baseUrl,
  estimateId,
  companyName,
  proposalNumber,
  signerName,
  proveHistoryAndRefresh,
}) {
  const expected = { estimateId, companyName, proposalNumber, signerName };
  const ownerUrl = new URL("/", baseUrl);
  ownerUrl.searchParams.set("view", "estimates");
  ownerUrl.searchParams.set("estimate", estimateId);
  await tab.goto(ownerUrl.href);
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
  let state = await waitForOwnerEstimateWorkspace(
    tab,
    expected,
    "exact owner proposal workspace",
  );

  if (proveHistoryAndRefresh) {
    const dashboardButton = tab.playwright
      .locator('nav[aria-label="WeatherTech OS navigation"]')
      .getByRole("button", { name: "Dashboard", exact: true });
    requireCondition(
      (await dashboardButton.count()) === 1 && (await dashboardButton.isVisible()),
      "Owner history proof could not find Dashboard in the app navigation.",
    );
    await dashboardButton.click();
    await waitForAsync(
      () => tab.playwright.evaluate(() => new URLSearchParams(location.search).get("view") === "dashboard"),
      "owner Dashboard history entry",
    );
    await tab.back();
    state = await waitForOwnerEstimateWorkspace(
      tab,
      expected,
      "owner proposal browser-history restoration",
    );
    await tab.reload();
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
    state = await waitForOwnerEstimateWorkspace(
      tab,
      expected,
      "owner proposal refresh restoration",
    );
  }

  return { expected, state };
}

async function reconcileReceiptFromOwnerUiIfNeeded({
  tab,
  service,
  proposalRevisionId,
  ownerWorkspace,
}) {
  if (!ownerWorkspace.state.reconcileVisible) return ownerWorkspace;

  const button = tab.playwright.locator(
    '[data-testid="proposal-reconcile-receipt-button"]',
  );
  requireCondition(
    (await button.isVisible()) && (await button.isEnabled()),
    "Visible owner receipt recovery was not actionable.",
  );
  await button.click();
  await waitForAsync(async () => {
    const revision = await requireSingle(
      service
        .from("estimate_proposal_revisions")
        .select("signed_document_id")
        .eq("id", proposalRevisionId)
        .single(),
      "owner receipt recovery readback",
    );
    return revision.signed_document_id ?? null;
  }, "owner receipt recovery registration");
  const state = await waitForAsync(async () => {
    const current = await readOwnerEstimateWorkspaceState(
      tab,
      ownerWorkspace.expected,
    );
    return current.ready && !current.reconcileVisible ? current : null;
  }, "owner receipt recovery UI convergence");
  return { ...ownerWorkspace, state };
}

async function withAcceptedConfirm(tab, action, label) {
  let actionError = null;
  let actionSettled = false;
  const actionPromise = action()
    .then((value) => {
      actionSettled = true;
      return value;
    })
    .catch((error) => {
      actionSettled = true;
      actionError = error;
      return null;
    });

  await waitForAsync(async () => {
    if (actionError) throw actionError;
    const dialog = await tab.getJsDialog();
    if (!dialog) {
      return actionSettled ? "settled-without-dialog" : null;
    }
    requireCondition(dialog.type === "confirm", `${label} opened ${dialog.type} instead of a confirm dialog.`);
    await dialog.accept();
    return "accepted";
  }, `${label} confirmation`, 10_000).then((result) => {
    requireCondition(result === "accepted", `${label} completed without the required owner confirmation.`);
  });

  await actionPromise;
  if (actionError) throw actionError;
}

async function finalizeProposalFromOwnerUi({
  tab,
  baseUrl,
  service,
  source,
  company,
  mode,
}) {
  const expectedDepositType = mode === "deposit" ? "percent" : "none";
  const expectedDepositValue = mode === "deposit" ? 10 : 0;
  const expectedDepositAmount = mode === "deposit" ? REQUIRED_DEPOSIT_AMOUNT : 0;
  const ownerUrl = new URL("/", baseUrl);
  ownerUrl.searchParams.set("view", "estimates");
  ownerUrl.searchParams.set("estimate", source.estimate.id);
  await tab.goto(ownerUrl.href);
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });

  const readControls = () =>
    tab.playwright.evaluate((expected) => {
      const workspace = document.querySelector('[data-testid="proposal-builder-2-workspace"]');
      const depositType = document.querySelector('[data-testid="proposal-deposit-type"]');
      const depositValue = document.querySelector('[data-testid="proposal-deposit-value"]');
      const depositTotal = document.querySelector('[data-testid="proposal-deposit-total"]');
      const acceptedTotal = document.querySelector('[data-testid="proposal-accepted-total"]');
      const finalizeButton = document.querySelector('[data-testid="proposal-finalize-button"]');
      const optionLabel = [...document.querySelectorAll('[data-testid="proposal-options-list"] label')]
        .find((label) => label.textContent?.includes(expected.optionName));
      const optionCheckbox = optionLabel?.querySelector('input[type="checkbox"]');
      const activeCompany = [...document.querySelectorAll('button[aria-pressed="true"]')]
        .some((button) => button.textContent?.includes(expected.companyName));
      const workspaceText = workspace?.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const activeCompanyLabels = [
        ...document.querySelectorAll('button[aria-pressed="true"]'),
      ].map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "");
      const params = new URLSearchParams(location.search);
      return {
        ready:
          location.pathname === "/" &&
          params.get("view") === "estimates" &&
          params.get("estimate") === expected.estimateId &&
          Boolean(workspace && depositType && depositValue && finalizeButton) &&
          activeCompany,
        path: `${location.pathname}${location.search}`,
        workspaceExists: Boolean(workspace),
        activeCompany,
        activeCompanyLabels,
        workspaceText: workspaceText.slice(0, 2500),
        exactCustomSectionVisible:
          workspaceText.includes(expected.sectionTitle) &&
          workspaceText.includes(expected.sectionBody),
        hiddenSectionAbsent:
          !workspaceText.includes(expected.hiddenSectionTitle) &&
          !workspaceText.includes(expected.hiddenSectionBody),
        depositType: depositType?.tagName === "SELECT" ? depositType.value : null,
        depositTypeDisabled:
          depositType?.tagName === "SELECT" ? depositType.disabled : null,
        depositValue: depositValue?.tagName === "INPUT" ? depositValue.value : null,
        depositValueDisabled:
          depositValue?.tagName === "INPUT" ? depositValue.disabled : null,
        depositTotal: depositTotal?.textContent?.trim() ?? null,
        acceptedTotal: acceptedTotal?.textContent?.trim() ?? null,
        finalizeButtonText: finalizeButton?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        finalizeButtonDisabled:
          finalizeButton?.tagName === "BUTTON" ? finalizeButton.disabled : null,
        optionSelected:
          optionCheckbox?.tagName === "INPUT" ? optionCheckbox.checked : null,
        optionDisabled:
          optionCheckbox?.tagName === "INPUT" ? optionCheckbox.disabled : null,
      };
    }, {
      estimateId: source.estimate.id,
      companyName: company.name,
      optionName: source.sourceOption.name,
      sectionTitle: source.sourceSection.title,
      sectionBody: source.sourceSection.body,
      hiddenSectionTitle: source.sourceHiddenSection.title,
      hiddenSectionBody: source.sourceHiddenSection.body,
    });

  let lastControlsState = null;
  try {
    await waitForAsync(async () => {
      let state;
      try {
        state = await readControls();
      } catch (error) {
        const evaluateError = describeThrownValue(error);
        lastControlsState = { evaluateError };
        throw new Error(evaluateError);
      }
      lastControlsState = state;
      return state.ready &&
        state.acceptedTotal === "$1,240.00" &&
        state.optionSelected === true &&
        state.optionDisabled === false &&
        state.exactCustomSectionVisible === true &&
        state.hiddenSectionAbsent === true &&
        state.finalizeButtonDisabled === false
        ? state
        : null;
    }, `${mode} owner proposal controls ready`, 35_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message} Last read-only controls snapshot: ${JSON.stringify(lastControlsState)}`,
    );
  }

  const depositType = tab.playwright.locator('[data-testid="proposal-deposit-type"]');
  const depositValue = tab.playwright.locator('[data-testid="proposal-deposit-value"]');
  const selectEditableDepositType = async (
    value,
    label,
    { valueInputDisabled = false } = {},
  ) => {
    const diagnostic = {
      requestedValue: value,
      locatorCount: await depositType.count(),
      before: null,
      selectionResult: null,
      immediateControls: null,
      lastControls: null,
    };
    try {
      if (diagnostic.locatorCount === 1) {
        diagnostic.before = await depositType.evaluate((element) => ({
          tagName: element.tagName,
          value: "value" in element ? element.value : null,
          disabled: "disabled" in element ? element.disabled : null,
          options:
            element.tagName === "SELECT" && "options" in element
              ? Array.from(element.options).map((option) => ({
                  value: option.value,
                  text: option.textContent?.replace(/\s+/g, " ").trim() ?? "",
                  selected: option.selected,
                  disabled: option.disabled,
                }))
              : [],
        }));
      }
      diagnostic.selectionResult = await depositType.selectOption(
        { value },
        { timeoutMs: 8000 },
      );
      diagnostic.immediateControls = await readControls();
      await waitForAsync(async () => {
        const state = await readControls();
        diagnostic.lastControls = state;
        return state.depositType === value &&
          state.depositValueDisabled === valueInputDisabled
          ? state
          : null;
      }, label);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message} Deposit selection diagnostic: ${JSON.stringify(diagnostic)}.`,
      );
    }
  };
  const fillEditableDepositValue = async ({
    value,
    expectedType,
    expectedTotal,
    label,
  }) => {
    const diagnostic = { requestedValue: value, attempts: [] };
    let lastErrorMessage = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const attemptDiagnostic = {
        attempt,
        immediateControls: null,
        lastControls: null,
      };
      diagnostic.attempts.push(attemptDiagnostic);
      try {
        await depositValue.fill(value);
        attemptDiagnostic.immediateControls = await readControls();
        return await waitForAsync(async () => {
          const state = await readControls();
          attemptDiagnostic.lastControls = state;
          return state.depositType === expectedType &&
            state.depositValue === value &&
            state.depositValueDisabled === false &&
            state.depositTotal === expectedTotal
            ? state
            : null;
        }, label, 3_000);
      } catch (error) {
        lastErrorMessage = describeThrownValue(error);
      }
    }
    throw new Error(
      `${lastErrorMessage ?? `Timed out waiting for ${label}.`} Deposit value convergence diagnostic: ${JSON.stringify(diagnostic)}.`,
    );
  };
  if (mode === "deposit") {
    await selectEditableDepositType("fixed", "owner fixed-deposit control enabled");
    await depositValue.fill("1");
    await waitForAsync(async () => {
      const state = await readControls();
      return state.depositType === "fixed" &&
        state.depositValue === "1" &&
        state.depositTotal === "$1.00"
        ? state
        : null;
    }, "owner fixed-deposit preview");
    await selectEditableDepositType(
      "percent",
      "owner percentage-deposit control enabled",
    );
    await depositValue.fill("10");
  } else {
    await selectEditableDepositType(
      "percent",
      "owner temporary percentage-deposit control enabled",
    );
    await fillEditableDepositValue({
      value: "5",
      expectedType: "percent",
      expectedTotal: "$62.00",
      label: "owner percentage-deposit preview before no-deposit choice",
    });
    await selectEditableDepositType(
      "none",
      "owner no-deposit control disabled its value input",
      { valueInputDisabled: true },
    );
  }

  await waitForAsync(async () => {
    const state = await readControls();
    return state.depositType === expectedDepositType &&
      Number(state.depositValue) === expectedDepositValue &&
      state.depositValueDisabled === (mode === "no-deposit") &&
      state.depositTotal === (mode === "deposit" ? "$124.00" : "$0.00") &&
      state.acceptedTotal === "$1,240.00" &&
      state.optionSelected === true &&
      state.finalizeButtonDisabled === false
      ? state
      : null;
  }, `${mode} owner-selected deposit rule preview`);

  await withAcceptedConfirm(
    tab,
    () => tab.playwright.locator('[data-testid="proposal-finalize-button"]').click(),
    `${mode} owner proposal finalization`,
  );

  let lastFinalizationRevision = null;
  let finalizationOutcome;
  try {
    finalizationOutcome = await waitForAsync(async () => {
      const errorNotification = tab.playwright.getByRole("alert", {
        name: "Error notification",
        exact: true,
      });
      if (
        (await errorNotification.count()) === 1 &&
        (await errorNotification.isVisible())
      ) {
        return {
          error:
            (await errorNotification.textContent())?.replace(/\s+/g, " ").trim() ||
            "Unable to finalize the proposal.",
        };
      }
      const rows = await requireRows(
        service
          .from("estimate_proposal_revisions")
          .select(
            "id,proposal_number,revision_number,title,status,accepted_total,deposit_type,deposit_value,deposit_required,deposit_amount,remaining_balance,requires_deposit_before_job,finalized_document_id,revision_sha256,terms_sha256,customer_snapshot,finalized_at,immutable_after_at",
          )
          .eq("estimate_id", source.estimate.id)
          .not("finalized_at", "is", null)
          .order("revision_number", { ascending: false }),
        `${mode} owner-finalized proposal readback`,
      );
      requireCondition(rows.length <= 1, `${mode} owner finalization created duplicate immutable revisions.`);
      lastFinalizationRevision = rows[0] ?? null;
      return finalizedRevisionMatchesOwnerSelection(lastFinalizationRevision, {
        depositType: expectedDepositType,
        depositValue: expectedDepositValue,
        depositAmount: expectedDepositAmount,
        depositRequired: mode === "deposit",
      })
        ? { revision: lastFinalizationRevision }
        : null;
    }, `${mode} owner proposal finalization persistence`, 35_000);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${message} Last immutable-finalization snapshot: ${JSON.stringify(finalizedRevisionDiagnostic(lastFinalizationRevision))}.`,
    );
  }
  if ("error" in finalizationOutcome) {
    throw new Error(
      `${mode} owner proposal finalization was refused: ${finalizationOutcome.error}`,
    );
  }
  const finalizedRevision = finalizationOutcome.revision;
  requireCondition(
    finalizedRevisionMatchesOwnerSelection(finalizedRevision, {
      depositType: expectedDepositType,
      depositValue: expectedDepositValue,
      depositAmount: expectedDepositAmount,
      depositRequired: mode === "deposit",
    }),
    `The ${mode} owner-selected deposit rule was not frozen exactly into the proposal revision.`,
  );

  const finalizedOptions = await requireRows(
    service
      .from("estimate_proposal_options")
      .select("id,name,selected")
      .eq("proposal_revision_id", finalizedRevision.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    `${mode} owner-finalized proposal options`,
  );
  const selectedFinalizedOptions = finalizedOptions.filter(
    (option) => option.selected === true,
  );
  requireCondition(
    selectedFinalizedOptions.length === 1 &&
      selectedFinalizedOptions[0].name === source.sourceOption.name,
    `The ${mode} owner-selected upgrade was not frozen into the exact proposal revision.`,
  );

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
  await waitForAsync(async () => {
    const state = await readControls();
    return state.ready &&
      state.depositType === expectedDepositType &&
      Number(state.depositValue) === expectedDepositValue &&
      state.depositTypeDisabled === true &&
      state.depositValueDisabled === true &&
      state.depositTotal === (mode === "deposit" ? "$124.00" : "$0.00") &&
      state.acceptedTotal === "$1,240.00" &&
      state.optionSelected === true &&
      state.optionDisabled === true &&
      state.finalizeButtonDisabled === true &&
      state.finalizeButtonText === "Exact proposal finalized"
      ? state
      : null;
  }, `${mode} frozen owner deposit rule reload`, 35_000);

  return {
    revision: finalizedRevision,
    selectedOption: selectedFinalizedOptions[0],
  };
}

async function createDepositInvoiceFromOwnerUi({
  tab,
  service,
  proposalRevisionId,
}) {
  const button = tab.playwright.getByRole("button", {
    name: "Create exact deposit invoice",
    exact: true,
  });
  requireCondition(
    (await button.isVisible()) && (await button.isEnabled()),
    "The exact owner deposit-invoice action was not enabled after signature.",
  );
  await button.click();
  const invoice = await waitForAsync(async () => {
    const rows = await requireRows(
      service
        .from("invoices")
        .select("*")
        .eq("proposal_revision_id", proposalRevisionId)
        .eq("invoice_purpose", "proposal_deposit"),
      "owner-created deposit invoice readback",
    );
    requireCondition(rows.length <= 1, "Owner deposit action created duplicate exact invoices.");
    return rows[0] ?? null;
  }, "owner-created exact deposit invoice");
  requireCondition(
    Number(invoice.total) === REQUIRED_DEPOSIT_AMOUNT &&
      Number(invoice.balance_due) === REQUIRED_DEPOSIT_AMOUNT &&
      invoice.status === "draft",
    "Owner deposit action created incorrect amount or state.",
  );
  await waitForAsync(async () =>
    tab.playwright.evaluate((expected) => {
      const params = new URLSearchParams(location.search);
      const workspace = document.querySelector('[data-testid="financial-operations-workspace"]');
      const invoiceNumberInput = workspace?.querySelector('input[name="invoice_number"]');
      return (
        params.get("view") === "invoices" &&
        params.get("invoice") === expected.invoiceId &&
        invoiceNumberInput?.value === expected.invoiceNumber &&
        Boolean(workspace?.textContent?.includes("$124.00"))
      );
    }, { invoiceId: invoice.id, invoiceNumber: invoice.invoice_number }),
  "exact deposit invoice navigation", 35_000);
  return invoice;
}

async function convertProposalFromOwnerUi({
  tab,
  service,
  proposalRevisionId,
  expectedTitle,
  companyName,
}) {
  const button = tab.playwright.locator(
    '[data-testid="estimate-convert-job-button"]',
  );
  requireCondition(
    (await button.isVisible()) && (await button.isEnabled()),
    "The owner sold-job action was not enabled after all exact proposal gates passed.",
  );
  await withAcceptedConfirm(
    tab,
    () => button.click(),
    "Sold-job conversion",
  );
  const job = await waitForAsync(async () => {
    const rows = await requireRows(
      service
        .from("jobs")
        .select("*")
        .eq("proposal_revision_id", proposalRevisionId),
      "owner-created sold job readback",
    );
    requireCondition(rows.length <= 1, "Owner sold-job action created duplicate jobs.");
    return rows[0] ?? null;
  }, "owner-created exact sold job");
  requireCondition(
    job.title === expectedTitle && Number(job.total) === ACCEPTED_TOTAL,
    "Owner sold-job action did not preserve the exact proposal title and total.",
  );
  await waitForAsync(async () =>
    tab.playwright.evaluate((expected) => {
      const params = new URLSearchParams(location.search);
      const detailHeading = [...document.querySelectorAll("aside h3")]
        .find((heading) => heading.textContent?.trim() === expected.title);
      const companyHeading = document.querySelector(".wt-workspace-header h1");
      return (
        params.get("view") === "jobs" &&
        params.get("job") === expected.jobId &&
        Boolean(detailHeading) &&
        companyHeading?.textContent?.trim() === expected.companyName
      );
    }, { jobId: job.id, title: job.title, companyName }),
  "exact sold-job navigation", 35_000);
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
  await waitForAsync(async () =>
    tab.playwright.evaluate((expected) => {
      const params = new URLSearchParams(location.search);
      const detailHeading = [...document.querySelectorAll("aside h3")]
        .find((heading) => heading.textContent?.trim() === expected.title);
      return params.get("job") === expected.jobId && Boolean(detailHeading);
    }, { jobId: job.id, title: job.title }),
  "sold-job refresh restoration", 35_000);
  return job;
}

async function seedProposalSource({ service, company, ownerUserId, marker, runId, mode }) {
  const slug = mode === "deposit" ? "weathertech" : "ihc";
  const signerName = mode === "deposit" ? "Taylór García" : "Наталья Ильина";
  const customer = await requireSingle(
    service
      .from("customers")
      .insert({
        company_id: company.id,
        display_name: `${marker} ${slug} customer`,
        contact_name: signerName,
        email: `proposal-signing-${runId}-${slug}-customer@example.test`,
        phone: "555-010-0000",
        property_address: `${mode === "deposit" ? "101" : "202"} Test Proposal Way`,
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        customer_type: "homeowner",
        status: "active",
        notes: `${marker} synthetic customer; never contact`,
      })
      .select("*")
      .single(),
    `${mode} customer seed`,
  );
  const wrongDepositCustomer = mode === "deposit"
    ? await requireSingle(
        service
          .from("customers")
          .insert({
            company_id: company.id,
            display_name: `${marker} ${slug} wrong deposit customer`,
            contact_name: "Wrong Deposit Customer",
            email: `proposal-signing-${runId}-${slug}-wrong-deposit@example.test`,
            phone: "555-010-0001",
            property_address: "303 Test Proposal Way",
            city: "Phoenix",
            state: "AZ",
            postal_code: "85001",
            customer_type: "homeowner",
            status: "active",
            notes: `${marker} wrong-customer deposit refusal fixture; never contact`,
          })
          .select("*")
          .single(),
        `${mode} wrong-customer payment seed`,
      )
    : null;
  const estimate = await requireSingle(
    service
      .from("estimates")
      .insert({
        company_id: company.id,
        customer_id: customer.id,
        title: `${marker} ${slug} estimate`,
        status: "draft",
        service_type: mode === "deposit" ? "roofing" : "painting",
        issue_date: new Date().toISOString().slice(0, 10),
        subtotal: BASE_SUBTOTAL,
        labor_total: BASE_SUBTOTAL,
        material_total: 0,
        tax_rate: 10,
        tax_total: TAX_TOTAL,
        discount_type: "fixed",
        discount_value: DISCOUNT_TOTAL,
        discount_total: DISCOUNT_TOTAL,
        profit_margin_rate: 0,
        profit_margin_total: 0,
        total: BASE_TOTAL,
        notes: `${marker} synthetic estimate`,
      })
      .select("*")
      .single(),
    `${mode} estimate seed`,
  );
  const lineItem = await requireSingle(
    service
      .from("estimate_line_items")
      .insert({
        estimate_id: estimate.id,
        category: "labor",
        name: `${marker} base scope`,
        description: "Synthetic customer-visible proposal scope.",
        quantity: 1,
        unit: "project",
        unit_cost: 1000,
        unit_price: BASE_SUBTOTAL,
        markup_rate: 0,
        taxable: true,
        sort_order: 0,
        total: 1000,
      })
      .select("*")
      .single(),
    `${mode} line-item seed`,
  );
  requireCondition(
    Number(estimate.subtotal) === BASE_SUBTOTAL &&
      Number(estimate.labor_total) === BASE_SUBTOTAL &&
      Number(estimate.material_total) === 0 &&
      Number(lineItem.unit_price) === BASE_SUBTOTAL &&
      Number(lineItem.total) === BASE_SUBTOTAL,
    `${mode} synthetic estimate totals do not match their exact canonical line source.`,
  );
  const template = await requireSingle(
    service
      .from("proposal_templates")
      .select("*")
      .eq("company_id", company.id)
      .eq("status", "active")
      .eq("is_default", true)
      .order("version_number", { ascending: false })
      .limit(1)
      .single(),
    `${mode} default template`,
  );
  const sourceRevision = await requireSingle(
    service
      .from("estimate_proposal_revisions")
      .insert({
        company_id: company.id,
        estimate_id: estimate.id,
        customer_id: customer.id,
        template_id: template.id,
        proposal_number: `${mode === "deposit" ? "WT" : "IHC"}-REG-${runId}`,
        revision_number: 1,
        title: `${marker} ${slug} proposal`,
        status: "draft",
        brand_name: company.name,
        brand_primary_color: company.brand_color ?? (mode === "deposit" ? "#6d28d9" : "#f97316"),
        brand_accent_color: mode === "deposit" ? "#f97316" : "#7c2d12",
        base_subtotal: BASE_SUBTOTAL,
        discount_total: DISCOUNT_TOTAL,
        tax_total: TAX_TOTAL,
        fee_total: FEE_TOTAL,
        base_total: BASE_TOTAL,
        accepted_total: BASE_TOTAL,
        deposit_type: mode === "deposit" ? "percent" : "none",
        deposit_value: mode === "deposit" ? 10 : 0,
        deposit_required: mode === "deposit",
        deposit_amount: mode === "deposit" ? 99 : 0,
        remaining_balance: mode === "deposit" ? 891 : BASE_TOTAL,
        requires_signature: true,
        requires_deposit_before_job: mode === "deposit",
        terms: `${marker} exact synthetic terms for electronic acceptance.`,
        created_by: ownerUserId,
        updated_by: ownerUserId,
        source_snapshot: { test_marker: marker, regression_mode: mode },
      })
      .select("*")
      .single(),
    `${mode} source proposal revision`,
  );
  const sourceOption = await requireSingle(
    service
      .from("estimate_proposal_options")
      .insert({
        company_id: company.id,
        proposal_revision_id: sourceRevision.id,
        option_type: "add_on_upgrade",
        option_group_key: null,
        name: `${marker} selected upgrade`,
        description: "Exact frozen synthetic upgrade.",
        scope_details: "Install the exact synthetic upgrade across the finalized project scope.",
        warranty_effect: "Adds the synthetic upgraded-system warranty.",
        customer_notes: "Synthetic customer selected this exact finalized upgrade.",
        quantity: 1,
        unit: "project",
        price: 250,
        price_effect_type: "additive",
        base_replacement_amount: 0,
        customer_visible: true,
        selected: true,
        required: false,
        recommended: true,
        best_value: false,
        sort_order: 0,
        created_by: ownerUserId,
      })
      .select("*")
      .single(),
    `${mode} source option`,
  );
  const sourceAlternateOption = await requireSingle(
    service
      .from("estimate_proposal_options")
      .insert({
        company_id: company.id,
        proposal_revision_id: sourceRevision.id,
        option_type: "replacement_alternative",
        option_group_key: "frozen_system_alternative",
        name: `${marker} unselected replacement alternate`,
        description: "Exact frozen non-additive pricing alternative.",
        scope_details: "Replace the frozen base allowance with this exact alternate scope.",
        warranty_effect: "Alternate-system warranty applies only if this option is selected.",
        customer_notes: "Synthetic customer did not select this replacement alternative.",
        quantity: 1,
        unit: "project",
        price: 150,
        price_effect_type: "replace_base_amount",
        base_replacement_amount: 100,
        customer_visible: true,
        selected: false,
        required: false,
        recommended: false,
        best_value: false,
        sort_order: 1,
        created_by: ownerUserId,
      })
      .select("*")
      .single(),
    `${mode} source replacement option`,
  );
  const sourceSection = await requireSingle(
    service
      .from("estimate_proposal_sections")
      .insert({
        company_id: company.id,
        proposal_revision_id: sourceRevision.id,
        section_key: "regression_customer_scope",
        title: `${marker} Scope — Protección`,
        section_type: "custom",
        body: "Exact mixed-case customer scope. Условия сохранены.",
        customer_visible: true,
        is_required: false,
        sort_order: 900,
        created_by: ownerUserId,
      })
      .select("*")
      .single(),
    `${mode} source customer-visible section`,
  );
  const sourceHiddenSection = await requireSingle(
    service
      .from("estimate_proposal_sections")
      .insert({
        company_id: company.id,
        proposal_revision_id: sourceRevision.id,
        section_key: "regression_owner_private",
        title: `${marker} OWNER-ONLY SECTION`,
        section_type: "custom",
        body: "Synthetic owner-only proposal content must never reach customer review.",
        customer_visible: false,
        is_required: false,
        sort_order: 901,
        created_by: ownerUserId,
      })
      .select("*")
      .single(),
    `${mode} hidden owner-only section`,
  );
  return {
    customer,
    wrongDepositCustomer,
    estimate,
    lineItem,
    sourceRevision,
    sourceOption,
    sourceAlternateOption,
    sourceSection,
    sourceHiddenSection,
    template,
    signerName,
  };
}

async function readNativeGraph(service, proposalRevisionId) {
  const requests = await requireRows(
    service.from("proposal_signing_requests").select("*").eq("proposal_revision_id", proposalRevisionId),
    "proposal signing requests read",
  );
  const requestIds = requests.map((row) => row.id);
  const [sessions, acceptances, signatures, documents, invoices, jobs] = await Promise.all([
    requestIds.length
      ? requireRows(service.from("proposal_signing_sessions").select("*").in("signing_request_id", requestIds), "proposal signing sessions read")
      : [],
    requireRows(service.from("estimate_proposal_acceptances").select("*").eq("proposal_revision_id", proposalRevisionId), "proposal acceptances read"),
    requireRows(service.from("signatures").select("*").eq("proposal_revision_id", proposalRevisionId), "proposal signatures read"),
    requireRows(service.from("documents").select("*").eq("proposal_revision_id", proposalRevisionId), "proposal documents read"),
    requireRows(service.from("invoices").select("*").eq("proposal_revision_id", proposalRevisionId), "proposal invoices read"),
    requireRows(service.from("jobs").select("*").eq("proposal_revision_id", proposalRevisionId), "proposal jobs read"),
  ]);
  const requestEmailIds = [...new Set(requests.map((row) => row.delivery_email_message_id).filter(Boolean))];
  const [requestEmails, metadataEmails] = await Promise.all([
    requestEmailIds.length
      ? requireRows(service.from("email_messages").select("*").in("id", requestEmailIds), "request email read")
      : [],
    requireRows(
      service
        .from("email_messages")
        .select("*")
        .contains("metadata", {
          draftType: "proposal_signature_request",
          proposalRevisionId,
        }),
      "proposal metadata email read",
    ),
  ]);
  const emails = [...new Map([...requestEmails, ...metadataEmails].map((row) => [row.id, row])).values()];
  const receipts = await requireRows(
    service.from("proposal_signature_receipts").select("*").eq("proposal_revision_id", proposalRevisionId),
    "proposal receipts read",
  );
  return { requests, sessions, acceptances, signatures, documents, invoices, jobs, emails, receipts };
}

async function listExactStorageFolder(service, prefix) {
  const { data, error } = await service.storage
    .from(CUSTOMER_DOCUMENT_BUCKET)
    .list(prefix, { limit: 100, offset: 0, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Exact proposal Storage discovery failed: ${error.message}`);
  return (data ?? [])
    .filter((entry) => entry.id && entry.name)
    .map((entry) => `${prefix}/${entry.name}`);
}

async function removeExactDocumentObjects(service, graph, companyId, proposalRevisionId) {
  const registeredPaths = graph.documents
    .filter((row) => row.storage_bucket === CUSTOMER_DOCUMENT_BUCKET && row.storage_path)
    .map((row) => row.storage_path);
  const proposalFolderPaths = await listExactStorageFolder(
    service,
    `${companyId}/proposals/${proposalRevisionId}`,
  );
  const signingFolderPaths = (
    await Promise.all(
      graph.requests.map((request) =>
        listExactStorageFolder(service, `${companyId}/proposal-signing/${request.id}`),
      ),
    )
  ).flat();
  const paths = [...new Set([
    ...registeredPaths,
    ...proposalFolderPaths,
    ...signingFolderPaths,
  ])];
  if (paths.length) {
    const { data, error } = await service.storage
      .from(CUSTOMER_DOCUMENT_BUCKET)
      .remove(paths);
    if (error) throw new Error(`Exact proposal Storage cleanup failed: ${error.message}`);
    requireCondition(
      Array.isArray(data) &&
        data.every((object) => typeof object?.name === "string") &&
        JSON.stringify(data.map((object) => object.name).sort()) ===
          JSON.stringify(paths.slice().sort()),
      "Exact proposal Storage removal response did not match the complete requested path set.",
    );
  }
  for (const path of paths) {
    await waitForAsync(async () => {
      const result = await service.storage
        .from(CUSTOMER_DOCUMENT_BUCKET)
        .exists(path);
      if (result.data === true && result.error === null) return null;
      if (
        result.data === false &&
        result.error !== null &&
        [400, 404].includes(Number(result.error.status))
      ) {
        return true;
      }
      throw new Error(
        `Exact proposal Storage existence returned an unrecognized result for ${path}: data=${String(result.data)}, status=${String(result.error?.status ?? "none")}, message=${result.error?.message ?? "none"}.`,
      );
    }, `exact proposal Storage deletion convergence for ${path}`, 30_000);
  }
  return paths;
}

async function cleanupFixture({ service, ownerUserId, companyId, marker, finalizedRevisionId, source }) {
  let exactFinalizedRevisionId = finalizedRevisionId;
  if (!exactFinalizedRevisionId && source?.estimate?.id) {
    const readFinalizationCandidates = async () => {
      const candidates = await requireRows(
        service
          .from("estimate_proposal_revisions")
          .select(
            "id,title,status,accepted_total,deposit_type,deposit_value,deposit_required,deposit_amount,remaining_balance,requires_deposit_before_job,finalized_document_id,revision_sha256,terms_sha256,customer_snapshot,finalized_at,immutable_after_at",
          )
          .eq("estimate_id", source.estimate.id)
          .not("finalized_at", "is", null),
        "partial finalization cleanup discovery",
      );
      const exactCandidates = candidates.filter((row) =>
        row.title?.startsWith(marker),
      );
      requireCondition(
        exactCandidates.length <= 1,
        "Cleanup found multiple finalized synthetic revisions.",
      );
      return exactCandidates[0] ?? null;
    };
    let lastCleanupFinalizationCandidate = await readFinalizationCandidates();
    if (
      lastCleanupFinalizationCandidate &&
      !finalizedRevisionArtifactIsRegistered(lastCleanupFinalizationCandidate)
    ) {
      try {
        lastCleanupFinalizationCandidate = await waitForAsync(async () => {
          const candidate = await readFinalizationCandidates();
          if (candidate) lastCleanupFinalizationCandidate = candidate;
          return finalizedRevisionArtifactIsRegistered(candidate)
            ? candidate
            : null;
        }, "immutable proposal route convergence before exact cleanup", 35_000);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${message} Last cleanup finalization snapshot: ${JSON.stringify(finalizedRevisionDiagnostic(lastCleanupFinalizationCandidate))}.`,
        );
      }
    }
    exactFinalizedRevisionId = lastCleanupFinalizationCandidate?.id ?? null;
  }

  if (exactFinalizedRevisionId) {
    let graph = await readNativeGraph(service, exactFinalizedRevisionId);
    requireCondition(
      graph.requests.every(
        (request) =>
          request.company_id === companyId &&
          request.proposal_revision_id === exactFinalizedRevisionId,
      ),
      "Cleanup discovered a signing request outside the exact synthetic proposal graph.",
    );
    const activeRequests = graph.requests
      .filter((request) => ["prepared", "sent", "viewed"].includes(request.status))
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const request of activeRequests) {
      const revoked = await callRpc(
        service,
        "wtos_transition_proposal_signing_request",
        "transition_request",
        {
          operationKey: randomUUID(),
          actorUserId: ownerUserId,
          companyId,
          requestId: request.id,
          action: "revoke",
          emailMessageId: request.delivery_email_message_id,
          failureCode: null,
          reason: "Synthetic regression failure cleanup.",
        },
        "active synthetic signing request cleanup revocation",
      );
      requireCondition(
        revoked.ok === true && revoked.status === "revoked",
        "Active synthetic signing request cleanup did not revoke terminally.",
      );
    }
    if (activeRequests.length) {
      graph = await readNativeGraph(service, exactFinalizedRevisionId);
      requireCondition(
        graph.requests.every(
          (request) => !["prepared", "sent", "viewed"].includes(request.status),
        ),
        "Synthetic proposal cleanup retained an active signing request.",
      );
    }
    const consumedRequestBindings = graph.requests.filter(
      (request) =>
        request.request_token_consumed_at &&
        request.request_token_consumed_session_id,
    );
    requireCondition(
      consumedRequestBindings.every((request) =>
        graph.sessions.some(
          (session) =>
            session.id === request.request_token_consumed_session_id &&
            session.signing_request_id === request.id &&
            session.company_id === companyId,
        ),
      ),
      "Synthetic proposal cleanup found consumed request evidence outside its exact session graph.",
    );
    await removeExactDocumentObjects(
      service,
      graph,
      companyId,
      exactFinalizedRevisionId,
    );
    const cleaned = await callRpc(
      service,
      "wtos_cleanup_synthetic_proposal_fixture",
      "cleanup_request",
      {
        operationKey: randomUUID(),
        regressionOwnerUserId: ownerUserId,
        companyId,
        marker,
        proposalRevisionId: exactFinalizedRevisionId,
        acceptanceIds: graph.acceptances.map((row) => row.id).sort(),
        signingRequestIds: graph.requests.map((row) => row.id).sort(),
        signatureIds: graph.signatures.map((row) => row.id).sort(),
        documentIds: graph.documents.map((row) => row.id).sort(),
        emailMessageIds: graph.emails.map((row) => row.id).sort(),
        invoiceIds: graph.invoices.map((row) => row.id).sort(),
        jobIds: graph.jobs.map((row) => row.id).sort(),
      },
      "exact synthetic proposal cleanup",
    );
    requireCondition(
      cleaned.ok === true &&
        cleaned.status === "cleaned" &&
        cleaned.storageResidueCount === 0 &&
        cleaned.databaseResidueCount === 0 &&
        cleaned.counts?.consumedRequestBindingsCleared ===
          consumedRequestBindings.length,
      "Exact synthetic proposal cleanup did not prove zero residue.",
    );
    const residueGraph = await readNativeGraph(service, exactFinalizedRevisionId);
    requireCondition(
      Object.values(residueGraph).every((rows) => rows.length === 0),
      "Exact synthetic proposal cleanup post-read found database residue.",
    );
  }

  if (source?.sourceRevision?.id) {
    await service.from("estimate_proposal_options").delete().eq("proposal_revision_id", source.sourceRevision.id);
    await service.from("estimate_proposal_sections").delete().eq("proposal_revision_id", source.sourceRevision.id);
    await service.from("estimate_proposal_revisions").delete().eq("id", source.sourceRevision.id);
  }
  if (source?.genericSignature?.id) {
    await service.from("signatures").delete().eq("id", source.genericSignature.id);
  }
  if (source?.genericDocument?.id) {
    await service.from("documents").delete().eq("id", source.genericDocument.id);
  }
  if (source?.estimate?.id) {
    await service.from("estimate_line_items").delete().eq("estimate_id", source.estimate.id);
    await service.from("estimates").delete().eq("id", source.estimate.id);
  }
  if (source?.customer?.id) {
    await service.from("customers").delete().eq("id", source.customer.id);
  }
  if (source?.wrongDepositCustomer?.id) {
    await service.from("customers").delete().eq("id", source.wrongDepositCustomer.id);
  }

  const checks = await Promise.all([
    source?.customer?.id
      ? requireRows(service.from("customers").select("id").eq("id", source.customer.id), "customer residue read")
      : [],
    source?.wrongDepositCustomer?.id
      ? requireRows(
          service
            .from("customers")
            .select("id")
            .eq("id", source.wrongDepositCustomer.id),
          "wrong-customer payment fixture residue read",
        )
      : [],
    source?.estimate?.id
      ? requireRows(service.from("estimates").select("id").eq("id", source.estimate.id), "estimate residue read")
      : [],
    source?.sourceRevision?.id
      ? requireRows(service.from("estimate_proposal_revisions").select("id").eq("id", source.sourceRevision.id), "source revision residue read")
      : [],
    source?.genericSignature?.id
      ? requireRows(
          service.from("signatures").select("id").eq("id", source.genericSignature.id),
          "generic signature residue read",
        )
      : [],
    source?.genericDocument?.id
      ? requireRows(
          service.from("documents").select("id").eq("id", source.genericDocument.id),
          "generic signature document residue read",
        )
      : [],
    exactFinalizedRevisionId
      ? requireRows(service.from("estimate_proposal_revisions").select("id").eq("id", exactFinalizedRevisionId), "final revision residue read")
      : [],
  ]);
  requireCondition(checks.every((rows) => rows.length === 0), "Synthetic proposal database residue remains.");
}

async function runOneSigningCase({
  browser,
  tab,
  env,
  baseUrl,
  ownerClient,
  ownerCookieJar,
  ownerUserId,
  service,
  company,
  otherCompany,
  marker,
  runId,
  mode,
  progress,
}) {
  let source = null;
  let finalizedRevisionId = null;
  let workflowFailure = null;
  const rawTokensHeldOnlyInMemory = [];
  const exchangeKeysHeldOnlyInMemory = [];
  const createExchangeKey = () => {
    const exchangeKey = randomBytes(32).toString("base64url");
    exchangeKeysHeldOnlyInMemory.push(exchangeKey);
    return exchangeKey;
  };
  try {
    progress?.(`proposal-signing:${mode}:seed:start`);
    source = await seedProposalSource({ service, company, ownerUserId, marker, runId, mode });
    progress?.(`proposal-signing:${mode}:seed:done`);

    const preApproval = await protocolJson(baseUrl, "/api/proposals/finalize", {
      method: "POST",
      cookieJar: ownerCookieJar,
      body: {
        estimateId: source.estimate.id,
        selectedOptionIds: [source.sourceOption.id],
        depositType: mode === "deposit" ? "percent" : "none",
        depositValue: mode === "deposit" ? 10 : 0,
      },
    });
    requireCondition(
      preApproval.status === 409 && preApproval.payload?.ok === false,
      "A draft estimate was not refused before immutable proposal finalization.",
    );
    const preApprovalRevisions = await requireRows(
      service
        .from("estimate_proposal_revisions")
        .select("id")
        .eq("estimate_id", source.estimate.id)
        .not("finalized_at", "is", null),
      "pre-approval finalization residue read",
    );
    requireCondition(preApprovalRevisions.length === 0, "Pre-approval finalization left immutable residue.");

    await requireSingle(
      service.from("estimates").update({ status: "approved" }).eq("id", source.estimate.id).select("*").single(),
      "approve synthetic estimate",
    );
    const {
      revision: finalizedRevision,
      selectedOption: finalizedSelectedOption,
    } = await finalizeProposalFromOwnerUi({
      tab,
      baseUrl,
      service,
      source,
      company,
      mode,
    });
    finalizedRevisionId = finalizedRevision.id;
    const finalizedSelectedOptionId = finalizedSelectedOption.id;
    requireCondition(
      Boolean(finalizedRevision.finalized_document_id),
      "Finalized proposal omitted its exact private document linkage.",
    );
    await expectPostgresSemanticRefusal(
      service.from("signatures").insert({
        company_id: company.id,
        customer_id: source.customer.id,
        document_id: finalizedRevision.finalized_document_id,
        proposal_revision_id: null,
        signer_name: `${marker} null-linked native-document bypass`,
        signer_email: `proposal-signing-${runId}-${mode}-bypass@example.test`,
        // If the native-artifact trigger were bypassed, the ordinary status
        // constraint still rolls this probe back instead of leaving residue.
        status: "__invalid_native_linkage_probe__",
        provider: "native",
        signature_method: "typed_name",
      }),
      "A null-linked generic signature referenced the native finalized proposal document.",
      "Native proposal signatures may be created only by the approved atomic signing-request RPC",
    );
    source.genericDocument = await requireSingle(
      service
        .from("documents")
        .insert({
          company_id: company.id,
          customer_id: source.customer.id,
          estimate_id: source.estimate.id,
          title: `${marker} unrelated generic signature document`,
          category: "other",
          status: "draft",
          body: "Synthetic unrelated generic signature document.",
        })
        .select("*")
        .single(),
      "unrelated generic signature document",
    );
    source.genericSignature = await requireSingle(
      service
        .from("signatures")
        .insert({
          company_id: company.id,
          customer_id: source.customer.id,
          document_id: source.genericDocument.id,
          proposal_revision_id: null,
          signer_name: `${marker} unrelated generic signer`,
          signer_email: `proposal-signing-${runId}-${mode}-generic@example.test`,
          status: "pending",
          provider: "native",
        })
        .select("*")
        .single(),
      "unrelated generic signature remains allowed",
    );
    await expectPostgresSemanticRefusal(
      service
        .from("signatures")
        .update({
          document_id: finalizedRevision.finalized_document_id,
          // Preserve zero residue even if the exact binding trigger regresses.
          status: "__invalid_native_linkage_probe__",
        })
        .eq("id", source.genericSignature.id),
      "A null-linked legacy signature was updated onto the native proposal document.",
      "Every signature referencing a native proposal artifact must carry the exact proposal revision binding.",
    );
    const unchangedGenericSignature = await requireSingle(
      service
        .from("signatures")
        .select("id,document_id,proposal_revision_id,status")
        .eq("id", source.genericSignature.id)
        .single(),
      "generic signature failed-update readback",
    );
    requireCondition(
      unchangedGenericSignature.document_id === source.genericDocument.id &&
        unchangedGenericSignature.proposal_revision_id === null &&
        unchangedGenericSignature.status === "pending",
      "Failed native-document linkage changed the unrelated generic signature.",
    );

    const activate = async (label, { requestExpiresInMs } = {}) => {
      const cookieJar = createProtocolCookieJar();
      const activation = await protocolJson(baseUrl, "/api/regression/proposal-signing/activate", {
        method: "POST",
        cookieJar: ownerCookieJar,
        body: {
          runId,
          proposalRevisionId: finalizedRevisionId,
          ...(requestExpiresInMs === undefined ? {} : { requestExpiresInMs }),
        },
      });
      requireCondition(
        activation.ok && activation.payload?.ok === true && activation.payload.signingUrl,
        `${label} synthetic signature delivery did not activate.`,
      );
      requireCondition(
        /private,\s*no-store/i.test(activation.cacheControl ?? ""),
        "Synthetic signing URL response was cacheable.",
      );
      const signingUrl = new URL(activation.payload.signingUrl);
      const rawToken = new URLSearchParams(signingUrl.hash.slice(1)).get("token");
      requireCondition(
        /^[A-Za-z0-9_-]{43}$/.test(rawToken ?? ""),
        `${label} activation omitted a valid one-time token fragment.`,
      );
      requireCondition(
        Number.isFinite(Date.parse(activation.payload.expiresAt ?? "")),
        `${label} activation omitted its exact server request deadline.`,
      );
      rawTokensHeldOnlyInMemory.push(rawToken);
      return { activation, signingUrl, rawToken, cookieJar };
    };

    if (mode === "no-deposit") {
      const rateFixture = await activate("rate-limit fixture");
      const rateExchangeKey = createExchangeKey();
      for (let attempt = 1; attempt <= 13; attempt += 1) {
        const refused = await protocolJson(
          baseUrl,
          `/api/proposals/signing/${rateFixture.activation.payload.requestId}/exchange`,
          {
            method: "POST",
            cookieJar: rateFixture.cookieJar,
            body: { token: "A".repeat(43), exchangeKey: rateExchangeKey },
          },
        );
        requireCondition(
          attempt === 13
            ? refused.status === 429 && refused.payload?.status === "rate_limited"
            : refused.status === 401 && refused.payload?.status === "invalid_or_expired",
          `Persistent signing-link rate limit returned an unexpected result at attempt ${attempt}.`,
        );
      }
      const rateRequest = await requireSingle(
        service
          .from("proposal_signing_requests")
          .select("exchange_attempt_count,exchange_blocked_until")
          .eq("id", rateFixture.activation.payload.requestId)
          .single(),
        "persistent exchange rate-limit evidence",
      );
      requireCondition(
        rateRequest.exchange_attempt_count === 13 && Boolean(rateRequest.exchange_blocked_until),
        "Signing-link rate limit was not persisted server-side.",
      );
      await callRpc(
        service,
        "wtos_transition_proposal_signing_request",
        "transition_request",
        {
          operationKey: randomUUID(),
          actorUserId: ownerUserId,
          companyId: company.id,
          requestId: rateFixture.activation.payload.requestId,
          action: "revoke",
          emailMessageId: rateFixture.activation.payload.emailMessageId,
          failureCode: null,
          reason: "Synthetic rate-limit fixture complete.",
        },
        "rate-limit fixture revocation",
      );

      const expiredFixture = await activate("expired fixture", {
        requestExpiresInMs: SHORT_REQUEST_EXPIRES_IN_MS,
      });
      const expiringRequest = await requireSingle(
        service
          .from("proposal_signing_requests")
          .select("id,status,expires_at")
          .eq("id", expiredFixture.activation.payload.requestId)
          .single(),
        "short-lived request deadline evidence",
      );
      const expiringRequestDeadline = Date.parse(expiringRequest.expires_at);
      const responseDeadline = Date.parse(
        expiredFixture.activation.payload.expiresAt,
      );
      const deadlineObservedAt = Date.now();
      const responseDbDeltaMs = Math.abs(
        responseDeadline - expiringRequestDeadline,
      );
      const deadlineRemainingMs = expiringRequestDeadline - deadlineObservedAt;
      const deadlineDiagnostic = {
        status: expiringRequest.status,
        responseExpiresAt: expiredFixture.activation.payload.expiresAt,
        databaseExpiresAt: expiringRequest.expires_at,
        observedAt: new Date(deadlineObservedAt).toISOString(),
        responseDbDeltaMs,
        deadlineRemainingMs,
      };
      requireCondition(
        expiringRequest.status === "sent" &&
          Number.isFinite(expiringRequestDeadline) &&
          Number.isFinite(responseDeadline) &&
          responseDbDeltaMs === 0 &&
          deadlineRemainingMs >= -1_500 &&
          deadlineRemainingMs <= SHORT_REQUEST_EXPIRES_IN_MS + 2_000,
        `The short-lived signing request did not preserve its exact bounded server deadline: ${JSON.stringify(deadlineDiagnostic)}.`,
      );
      await waitForAsync(
        async () =>
          Date.now() > expiringRequestDeadline + 250 ? true : null,
        "genuine signing request expiry",
        SHORT_REQUEST_EXPIRES_IN_MS + 10_000,
      );
      const expiredRefusal = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${expiredFixture.activation.payload.requestId}/exchange`,
        {
          method: "POST",
          cookieJar: expiredFixture.cookieJar,
          body: { token: expiredFixture.rawToken, exchangeKey: createExchangeKey() },
        },
      );
      requireCondition(
        expiredRefusal.status === 401 && expiredRefusal.payload?.status === "invalid_or_expired",
        "An expired signing request accepted its raw invitation token.",
      );
      const expiredTerminal = await callRpc(
        service,
        "wtos_transition_proposal_signing_request",
        "transition_request",
        {
          operationKey: randomUUID(),
          actorUserId: ownerUserId,
          companyId: company.id,
          requestId: expiredFixture.activation.payload.requestId,
          action: "revoke",
          emailMessageId: expiredFixture.activation.payload.emailMessageId,
          failureCode: null,
          reason: "Synthetic genuine-expiry fixture complete.",
        },
        "expired fixture terminal revocation",
      );
      requireCondition(
        expiredTerminal.status === "revoked",
        "The genuinely expired request did not clear its active uniqueness terminally.",
      );

      const revokedFixture = await activate("revoked fixture");
      const revoked = await callRpc(
        service,
        "wtos_transition_proposal_signing_request",
        "transition_request",
        {
          operationKey: randomUUID(),
          actorUserId: ownerUserId,
          companyId: company.id,
          requestId: revokedFixture.activation.payload.requestId,
          action: "revoke",
          emailMessageId: revokedFixture.activation.payload.emailMessageId,
          failureCode: null,
          reason: "Synthetic revocation refusal fixture.",
        },
        "synthetic request revocation",
      );
      requireCondition(revoked.status === "revoked", "Synthetic signing request was not revoked.");
      const revokedRefusal = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${revokedFixture.activation.payload.requestId}/exchange`,
        {
          method: "POST",
          cookieJar: revokedFixture.cookieJar,
          body: { token: revokedFixture.rawToken, exchangeKey: createExchangeKey() },
        },
      );
      requireCondition(
        revokedRefusal.status === 401 && revokedRefusal.payload?.status === "invalid_or_expired",
        "A revoked signing request accepted its raw invitation token.",
      );

      const lostResponseFixture = await activate("lost-response retry fixture");
      const lostResponseExchangeKey = createExchangeKey();
      const lostResponseExchange = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${lostResponseFixture.activation.payload.requestId}/exchange`,
        {
          method: "POST",
          credentials: "omit",
          cookieJar: lostResponseFixture.cookieJar,
          body: {
            token: lostResponseFixture.rawToken,
            exchangeKey: lostResponseExchangeKey,
          },
        },
      );
      requireCondition(
        lostResponseExchange.ok && lostResponseExchange.payload?.status === "active",
        "The synthetic lost-response exchange did not commit its one exact session.",
      );
      const lostResponseMissingCookie = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${lostResponseFixture.activation.payload.requestId}/session`,
        { cookieJar: lostResponseFixture.cookieJar },
      );
      requireCondition(
        lostResponseMissingCookie.status === 401 &&
          lostResponseMissingCookie.payload?.status === "invalid_or_expired",
        "The lost-response fixture unexpectedly retained the omitted session cookie.",
      );
      const exactLostResponseRetry = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${lostResponseFixture.activation.payload.requestId}/exchange`,
        {
          method: "POST",
          cookieJar: lostResponseFixture.cookieJar,
          body: {
            token: lostResponseFixture.rawToken,
            exchangeKey: lostResponseExchangeKey,
          },
        },
      );
      requireCondition(
        exactLostResponseRetry.ok && exactLostResponseRetry.payload?.status === "active",
        "An exact lost-response retry failed to recover the already committed signing session.",
      );
      const recoveredLostResponseSession = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${lostResponseFixture.activation.payload.requestId}/session`,
        { cookieJar: lostResponseFixture.cookieJar },
      );
      requireCondition(
        recoveredLostResponseSession.ok && recoveredLostResponseSession.payload?.status === "active",
        "The exact lost-response retry did not install the recovered private session cookie.",
      );
      const differentKeyReplay = await protocolJson(
        baseUrl,
        `/api/proposals/signing/${lostResponseFixture.activation.payload.requestId}/exchange`,
        {
          method: "POST",
          cookieJar: lostResponseFixture.cookieJar,
          body: {
            token: lostResponseFixture.rawToken,
            exchangeKey: createExchangeKey(),
          },
        },
      );
      requireCondition(
        differentKeyReplay.status === 401 &&
          differentKeyReplay.payload?.status === "invalid_or_expired",
        "A different exchange key replayed the consumed invitation into another session.",
      );
      await callRpc(
        service,
        "wtos_transition_proposal_signing_request",
        "transition_request",
        {
          operationKey: randomUUID(),
          actorUserId: ownerUserId,
          companyId: company.id,
          requestId: lostResponseFixture.activation.payload.requestId,
          action: "revoke",
          emailMessageId: lostResponseFixture.activation.payload.emailMessageId,
          failureCode: null,
          reason: "Synthetic lost-response retry fixture complete.",
        },
        "lost-response retry fixture revocation",
      );
    }

    const {
      activation,
      signingUrl,
      rawToken,
      cookieJar: mainProtocolCookieJar,
    } = await activate(mode);
    const directDocument = await protocolJson(
      baseUrl,
      `/api/proposals/signing/${activation.payload.requestId}/document`,
      { cookieJar: mainProtocolCookieJar },
    );
    requireCondition(
      directDocument.status === 401 && directDocument.payload?.status === "invalid_or_expired",
      "Direct proposal document access succeeded without a private signing session.",
    );
    const activeRequest = await requireSingle(
      service.from("proposal_signing_requests").select("*").eq("id", activation.payload.requestId).single(),
      "active signing request evidence",
    );
    await expectRpcRefusal(
      service,
      "wtos_prepare_proposal_signing_request",
      "signing_request",
      {
        operationKey: randomUUID(),
        requestId: randomUUID(),
        actorUserId: ownerUserId,
        companyId: otherCompany.id,
        proposalRevisionId: finalizedRevisionId,
        requestTokenHash: createHash("sha256").update(randomUUID()).digest("hex"),
        signerName: source.signerName,
        signerEmail: source.customer.email,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        consentVersion: activeRequest.consent_version,
        consentText: activeRequest.consent_text,
        consentSha256: activeRequest.consent_sha256,
      },
      "Cross-company signing request scope was accepted.",
    );
    const expiredSession = await callRpc(
      service,
      "wtos_exchange_proposal_signing_token",
      "signing_request",
      {
        requestId: activation.payload.requestId,
        tokenHash: createHash("sha256").update(rawToken).digest("hex"),
        sessionHash: createHash("sha256").update(randomUUID()).digest("hex"),
        sessionExpiresAt: new Date(Date.now() - 1000).toISOString(),
        ipHash: createHash("sha256").update("synthetic-expired-session").digest("hex"),
        userAgent: "WeatherTech OS isolated regression",
      },
      "expired session exchange refusal",
    );
    requireCondition(
      expiredSession.ok === false && expiredSession.status === "invalid_or_expired",
      "An already expired private session was accepted.",
    );

    const viewport = await browser.capabilities.get("viewport");
    await viewport.set(MOBILE_VIEWPORT);
    await tab.goto(signingUrl.href);
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15_000 });
    let lastCustomerBootstrapState = null;
    try {
      await waitForAsync(async () => {
        lastCustomerBootstrapState = await readCustomerSigningBootstrapState(tab);
        return lastCustomerBootstrapState.statusTitle === "Ready to verify invitation" &&
          lastCustomerBootstrapState.continueButtonText === "Continue securely" &&
          lastCustomerBootstrapState.continueActionsHidden === false &&
          lastCustomerBootstrapState.hashPresent === false
          ? lastCustomerBootstrapState
          : null;
      }, `${mode} fragment stripping and deliberate exchange control`, 20_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message} Last token-free customer bootstrap snapshot: ${JSON.stringify(lastCustomerBootstrapState)}.`,
      );
    }
    const mobileState = await tab.playwright.evaluate(() => ({
      width: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      tokenVisible: document.body.innerText.includes("#token=") || document.documentElement.outerHTML.includes("#token="),
    }));
    requireCondition(
      mobileState.width === MOBILE_VIEWPORT.width && mobileState.overflow <= 1 && !mobileState.tokenVisible,
      `The ${mode} public signing page failed mobile/token-safety checks.`,
    );

    await tab.playwright.locator("#continue-button").click();
    await waitForPage(
      tab,
      () => document.body.innerText.includes("Secure proposal ready") && !document.getElementById("proposal-content")?.classList.contains("hidden"),
      `${mode} secure proposal session`,
    );

    const replay = await protocolJson(baseUrl, `/api/proposals/signing/${activation.payload.requestId}/exchange`, {
      method: "POST",
      cookieJar: mainProtocolCookieJar,
      body: { token: rawToken, exchangeKey: createExchangeKey() },
    });
    requireCondition(
      replay.status === 401 && replay.payload?.status === "invalid_or_expired",
      "A consumed raw signing token minted or attempted to mint another session.",
    );

    const sourceDocument = await requireSingle(
      service
        .from("documents")
        .select("*")
        .eq("id", finalizedRevision.finalized_document_id)
        .eq("proposal_revision_id", finalizedRevisionId)
        .single(),
      "exact finalized source document",
    );
    const frozenSnapshot = finalizedRevision.customer_snapshot;
    const frozenSnapshotOptions = Array.isArray(frozenSnapshot?.options)
      ? frozenSnapshot.options
      : [];
    const frozenSnapshotSelectedOptions = frozenSnapshotOptions.filter(
      (option) => option?.selected === true,
    );
    const frozenSnapshotPredicates = {
      snapshotPresent: Boolean(frozenSnapshot),
      selectedIdsAreArray: Array.isArray(frozenSnapshot?.selectedOptionIds),
      selectedIdCount: frozenSnapshot?.selectedOptionIds?.length === 1,
      selectedIdIsCanonical:
        frozenSnapshot?.selectedOptionIds?.[0] === finalizedSelectedOptionId,
      oneSelectedCanonicalOption:
        frozenSnapshotSelectedOptions.length === 1 &&
        frozenSnapshotSelectedOptions[0]?.id === finalizedSelectedOptionId &&
        frozenSnapshotSelectedOptions[0]?.name === source.sourceOption.name,
      baseSubtotal:
        Number(frozenSnapshot?.pricing?.baseSubtotal) === BASE_SUBTOTAL,
      discountTotal:
        Number(frozenSnapshot?.pricing?.discountTotal) === DISCOUNT_TOTAL,
      taxTotal: Number(frozenSnapshot?.pricing?.taxTotal) === TAX_TOTAL,
      feeTotal: Number(frozenSnapshot?.pricing?.feeTotal) === FEE_TOTAL,
      baseTotal: Number(frozenSnapshot?.pricing?.baseTotal) === BASE_TOTAL,
      selectedUpgradesTotal:
        Number(frozenSnapshot?.pricing?.selectedUpgradesTotal) ===
        SELECTED_UPGRADES_TOTAL,
      acceptedTotal:
        Number(frozenSnapshot?.pricing?.acceptedTotal) === ACCEPTED_TOTAL,
      unselectedReplacementOption: frozenSnapshotOptions.some(
        (option) =>
          option.name === source.sourceAlternateOption.name &&
          option.selected === false &&
          option.priceEffectType === "replace_base_amount" &&
          Number(option.baseReplacementAmount) === 100 &&
          Number(option.price) === 150,
      ),
      depositRule:
        mode === "deposit"
          ? frozenSnapshot?.deposit?.required === true &&
            frozenSnapshot?.deposit?.type === "percent" &&
            Number(frozenSnapshot?.deposit?.value) === 10 &&
            Number(frozenSnapshot?.deposit?.requiredAmount) ===
              REQUIRED_DEPOSIT_AMOUNT
          : frozenSnapshot?.deposit?.required === false &&
            frozenSnapshot?.deposit?.type === "none" &&
            Number(frozenSnapshot?.deposit?.value) === 0 &&
            Number(frozenSnapshot?.deposit?.requiredAmount) === 0,
    };
    requireCondition(
      Object.values(frozenSnapshotPredicates).every(Boolean),
      `The ${mode} immutable customer snapshot did not preserve exact option/total/deposit evidence: ${JSON.stringify(frozenSnapshotPredicates)}.`,
    );
    const forbiddenPublicValues = [
      activation.payload.requestId,
      finalizedRevisionId,
      finalizedRevision.finalized_document_id,
      company.id,
      sourceDocument.storage_bucket,
      sourceDocument.storage_path,
      source.sourceHiddenSection.title,
      source.sourceHiddenSection.body,
    ];
    const customerDisclosure = await tab.playwright.evaluate((expected) => {
      const text = document.body.innerText;
      const deadline = document.getElementById("request-expires")?.textContent ?? "";
      const documentHref = document.getElementById("proposal-document")?.getAttribute("href") ?? "";
      return {
        exact:
          text.includes(expected.signerName) &&
          deadline.includes(expected.requestExpiresAt) &&
          text.includes(expected.lineDescription) &&
          text.includes(expected.optionDescription) &&
          text.includes(expected.scopeDetails) &&
          text.includes(expected.warrantyEffect) &&
          text.includes(expected.customerNotes) &&
          text.includes(expected.sectionTitle) &&
          text.includes(expected.sectionBody) &&
          text.includes("Quantity / unit") &&
          text.includes("1 project") &&
          text.includes("Option total") &&
          text.includes("$250.00") &&
          text.includes(expected.alternateName) &&
          text.includes(expected.alternateDescription) &&
          text.includes(expected.alternateScope) &&
          text.includes(expected.alternateWarranty) &&
          text.includes(expected.alternateNotes) &&
          text.includes("Pricing effect") &&
          text.includes("Additive - adds this option total to the proposal") &&
          text.includes("replace_base_amount") &&
          text.includes("Replace base amount - substitutes this option total for the frozen replacement amount shown below") &&
          text.includes("Frozen base amount replaced") &&
          text.includes("$100.00") &&
          text.includes("Net adjustment if selected") &&
          text.includes("+$50.00") &&
          text.includes("Applied to accepted total") &&
          text.includes("$0.00 (not selected)") &&
          text.includes("Base subtotal") &&
          text.includes("$1,000.00") &&
          text.includes("Discount") &&
          text.includes("Tax") &&
          text.includes("$90.00") &&
          text.includes("Fees") &&
          text.includes("$990.00") &&
          text.includes(expected.depositType) &&
          text.includes(expected.depositValue),
        privateValuesAbsent: expected.forbiddenValues.every((value) => !text.includes(value)),
        deadline,
        documentHref,
      };
    }, {
      signerName: source.signerName,
      requestExpiresAt: activeRequest.expires_at,
      lineDescription: source.lineItem.description,
      optionDescription: source.sourceOption.description,
      scopeDetails: source.sourceOption.scope_details,
      warrantyEffect: source.sourceOption.warranty_effect,
      customerNotes: source.sourceOption.customer_notes,
      alternateName: source.sourceAlternateOption.name,
      alternateDescription: source.sourceAlternateOption.description,
      alternateScope: source.sourceAlternateOption.scope_details,
      alternateWarranty: source.sourceAlternateOption.warranty_effect,
      alternateNotes: source.sourceAlternateOption.customer_notes,
      sectionTitle: source.sourceSection.title,
      sectionBody: source.sourceSection.body,
      depositType: mode === "deposit" ? "Percent (percent)" : "None (none)",
      depositValue: mode === "deposit" ? "10%" : "0 (not applicable)",
      forbiddenValues: forbiddenPublicValues,
    });
    requireCondition(
      customerDisclosure.exact &&
        customerDisclosure.privateValuesAbsent &&
        customerDisclosure.documentHref ===
          `/api/proposals/signing/${activation.payload.requestId}/document`,
      `The ${mode} signing page omitted the exact deadline, Unicode signer, or frozen customer-visible option/line details.`,
    );
    await expectPostgresSemanticRefusal(
      service.from("estimate_proposal_acceptances").insert({
        company_id: company.id,
        proposal_revision_id: finalizedRevisionId,
        estimate_id: source.estimate.id,
        customer_id: source.customer.id,
        signer_name: source.signerName,
        signer_email: source.customer.email,
        accepted_total: ACCEPTED_TOTAL,
        selected_option_ids: [finalizedSelectedOptionId],
        terms_accepted: true,
        acceptance_method: "internal_recorded",
        signature_status: "signed",
        audit_metadata: { test_marker: marker, negative_fixture: "native_non_electronic" },
      }),
      "A non-electronic acceptance was inserted against the native-finalized proposal.",
      "A native-finalized proposal revision may be accepted only through the exact guarded native electronic-signature workflow.",
    );
    await tab.playwright.locator("#proposal-document").downloadMedia({ timeoutMs: 30_000 });
    const sourcePdf = await storedPdfDigest(
      service,
      finalizedRevision.finalized_document_id,
    );
    requireCondition(
      sourcePdf.ok &&
        sourcePdf.contentType?.startsWith("application/pdf") &&
        sourcePdf.sha256 === sourceDocument.content_sha256 &&
        sourcePdf.sizeBytes === Number(sourceDocument.file_size_bytes),
      `The ${mode} private finalized PDF failed Browser integrity validation.`,
    );

    if (mode === "no-deposit") {
      const alteredSignerName = source.signerName.toLocaleUpperCase("en-US");
      await tab.playwright.locator("#signer-name").fill(alteredSignerName);
      await tab.playwright.locator("#signature-text").fill(alteredSignerName);
      await tab.playwright.locator("#terms-accepted").check();
      await tab.playwright.locator("#electronic-consent").check();
      await tab.playwright.locator("#signature-intent").check();
      await tab.playwright.locator("#sign-button").click();
      const identityTamper = await waitForAsync(async () => {
        const statusTitle = await tab.playwright.locator("#status-title").textContent();
        const statusMessage = await tab.playwright.locator("#status-message").textContent();
        const buttonEnabled = await tab.playwright.locator("#sign-button").isEnabled();
        return statusTitle === "Signature outcome not confirmed" && buttonEnabled
          ? { statusTitle, statusMessage }
          : null;
      }, "frozen signer identity refusal");
      requireCondition(
        identityTamper.statusMessage?.includes(
          "The signer name must exactly match the intended signer shown on this proposal.",
        ),
        "A tampered customer identity was accepted for the frozen signer.",
      );
      const preSignAcceptances = await requireRows(
        service
          .from("estimate_proposal_acceptances")
          .select("id")
          .eq("proposal_revision_id", finalizedRevisionId),
        "tamper acceptance residue read",
      );
      requireCondition(preSignAcceptances.length === 0, "Tampered signing attempt persisted acceptance evidence.");
      await tab.playwright.locator("#signer-name").fill(source.signerName);
    }

    await viewport.set(LAPTOP_VIEWPORT);
    await tab.playwright.locator("#signature-text").fill(source.signerName);
    await tab.playwright.locator("#terms-accepted").check();
    await tab.playwright.locator("#electronic-consent").check();
    await tab.playwright.locator("#signature-intent").check();
    await tab.playwright.locator("#sign-button").click();
    await waitForPage(
      tab,
      () => document.body.innerText.includes("Electronic signature complete") && document.body.innerText.includes("Proposal signed"),
      `${mode} electronic acceptance`,
      30_000,
    );
    const signedGraph = await waitForAsync(async () => {
      const current = await readNativeGraph(service, finalizedRevisionId);
      return current.acceptances.length === 1 &&
        current.requests.some(
          (request) =>
            request.id === activation.payload.requestId && request.status === "signed",
        ) &&
        current.sessions.some(
          (session) =>
            session.signing_request_id === activation.payload.requestId &&
            session.status === "signed",
        )
        ? current
        : null;
    }, `${mode} signed evidence convergence`, 30_000);
    const acceptance = signedGraph.acceptances[0];
    const signedSessionRow = signedGraph.sessions.find(
      (session) => session.signing_request_id === activation.payload.requestId,
    );
    requireCondition(
      Boolean(signedSessionRow?.session_token_sha256),
      `The ${mode} signed session omitted its exact hashed replay authority.`,
    );
    const signedInternalEvidence = {
      id: acceptance.id,
      signature_id: acceptance.signature_id,
    };
    const signedCustomerState = await tab.playwright.evaluate((expected) => {
      const text = document.body.innerText;
      const completionCard = document.getElementById("completion-card");
      const receiptActions = document.getElementById("receipt-actions");
      const signingCard = document.getElementById("signing-card");
      return {
        complete:
          text.includes("Electronic signature complete") &&
          text.includes("Proposal signed") &&
          !completionCard?.classList.contains("hidden") &&
          !receiptActions?.classList.contains("hidden") &&
          signingCard?.classList.contains("hidden"),
        receiptHref:
          document.getElementById("receipt-link")?.getAttribute("href") ?? "",
        privateValuesAbsent: expected.forbiddenValues.every(
          (value) => !text.includes(value),
        ),
      };
    }, {
      forbiddenValues: [
        activation.payload.requestId,
        finalizedRevisionId,
        finalizedRevision.finalized_document_id,
        signedInternalEvidence.id,
        signedInternalEvidence.signature_id,
        signedSessionRow.id,
        company.id,
        sourceDocument.storage_bucket,
        sourceDocument.storage_path,
        rawToken,
        ...exchangeKeysHeldOnlyInMemory,
      ],
    });
    requireCondition(
      signedCustomerState.complete &&
        signedCustomerState.privateValuesAbsent &&
        signedCustomerState.receiptHref ===
          `/api/proposals/signing/${activation.payload.requestId}/receipt`,
      "The signed customer page exposed private evidence or omitted the exact receipt control.",
    );
    await tab.playwright.locator("#receipt-link").downloadMedia({ timeoutMs: 30_000 });
    let graph = await waitForAsync(async () => {
      const current = await readNativeGraph(service, finalizedRevisionId);
      const currentReceipt = current.receipts[0];
      return current.acceptances.length === 1 &&
        current.receipts.length === 1 &&
        current.documents.some(
          (document) => document.id === currentReceipt?.signed_document_id,
        )
        ? current
        : null;
    }, `${mode} signed receipt registration`, 30_000);
    const receipt = graph.receipts[0];
    const receiptDocument = graph.documents.find(
      (document) => document.id === receipt.signed_document_id,
    );
    requireCondition(
      Boolean(receiptDocument),
      `The ${mode} signed receipt omitted its exact registered document.`,
    );
    const receiptPdf = await storedPdfDigest(
      service,
      receipt.signed_document_id,
      [
        "Completed Signed Proposal and Customer Receipt",
        "CUSTOMER-VISIBLE PROPOSAL SECTIONS",
        source.sourceSection.title,
        source.sourceSection.body,
        "FINALIZED LINE ITEMS",
        `${marker} base scope`,
        "Synthetic customer-visible proposal scope.",
        "FINALIZED OPTIONS",
        "SELECTED:",
        "selected upgrade",
        "Exact frozen synthetic upgrade.",
        "Install the exact synthetic upgrade across the finalized project scope.",
        "Adds the synthetic upgraded-system warranty.",
        "Synthetic customer selected this exact finalized upgrade.",
        "Pricing effect: Additive - adds this option total to the proposal",
        "Frozen price-effect type: additive",
        "Net adjustment if selected: +$250.00",
        "Applied to accepted total: +$250.00",
        "NOT SELECTED:",
        "unselected replacement alternate",
        "Exact frozen non-additive pricing alternative.",
        "Replace the frozen base allowance with this exact alternate scope.",
        "Alternate-system warranty applies only if this option is selected.",
        "Synthetic customer did not select this replacement alternative.",
        "Pricing effect: Replace base amount - substitutes this option total for the frozen replacement amount shown below",
        "Frozen price-effect type: replace_base_amount",
        "Frozen base amount replaced: $100.00",
        "Net adjustment if selected: +$50.00",
        "Applied to accepted total: $0.00 (not selected)",
        "Accepted options:",
        "FINALIZED PRICING",
        "Base subtotal: $1,000.00",
        "Discount: $100.00",
        "Tax: $90.00",
        "Fees: $0.00",
        "Base total: $990.00",
        "Selected upgrades: $250.00",
        "Accepted total: $1,240.00",
        `Deposit type: ${mode === "deposit" ? "percent" : "none"}`,
        `Deposit value: ${mode === "deposit" ? "10%" : "0 (not applicable)"}`,
        mode === "deposit" ? "Required deposit: $124.00" : "Required deposit: None",
        "EXACT PROPOSAL TERMS",
        "exact synthetic terms for electronic acceptance.",
        "ELECTRONIC RECORDS DISCLOSURE",
        "applies only to this exact finalized proposal, your acceptance, and the signed receipt",
        "withdraw this consent before signing",
        "request a paper copy by contacting the company",
        "availability and any fees",
        "The normal acceptance workflow remains electronic",
        "ELECTRONIC SIGNATURE CERTIFICATE",
        source.signerName,
        acceptance.evidence_sha256,
      ],
      [
        activation.payload.requestId,
        finalizedRevisionId,
        finalizedRevision.finalized_document_id,
        signedInternalEvidence.id,
        signedInternalEvidence.signature_id,
        signedSessionRow.id,
        receipt.id,
        receiptDocument.id,
        company.id,
        sourceDocument.storage_bucket,
        sourceDocument.storage_path,
        receiptDocument.storage_bucket,
        receiptDocument.storage_path,
        source.sourceHiddenSection.title,
        source.sourceHiddenSection.body,
        rawToken,
        ...exchangeKeysHeldOnlyInMemory,
      ],
    );
    requireCondition(
      receiptPdf.ok &&
        receiptPdf.contentType?.startsWith("application/pdf") &&
        receiptPdf.sha256 === receipt.signed_document_sha256 &&
        receiptPdf.sizeBytes === Number(receiptDocument.file_size_bytes) &&
        receiptPdf.missingRequiredText.length === 0 &&
        receiptPdf.presentForbiddenText.length === 0,
      `The ${mode} combined signed customer copy failed Browser content/integrity/privacy validation: missing ${receiptPdf.missingRequiredText.join(", ")}; forbidden ${receiptPdf.presentForbiddenText.join(", ")}.`,
    );

    const renewedSignedCookieJar = createProtocolCookieJar();
    const renewedExchange = await protocolJson(
      baseUrl,
      `/api/proposals/signing/${activation.payload.requestId}/exchange`,
      {
        method: "POST",
        cookieJar: renewedSignedCookieJar,
        body: { token: rawToken, exchangeKey: createExchangeKey() },
      },
    );
    requireCondition(
      renewedExchange.status === 200 &&
        renewedExchange.payload?.ok === true &&
        renewedExchange.payload?.status === "signed",
      `The ${mode} exact signed invitation did not mint terminal read-only renewal access.`,
    );
    const renewedCookieNames = renewedSignedCookieJar.names();
    requireCondition(
      renewedCookieNames.includes(
        `__Host-wtos-ps-${activation.payload.requestId}`,
      ) &&
        !renewedCookieNames.includes(
          `__Host-wtos-pc-${activation.payload.requestId}`,
        ),
      `The ${mode} terminal signed renewal did not retain only its read credential.`,
    );
    const renewedSession = await protocolJson(
      baseUrl,
      `/api/proposals/signing/${activation.payload.requestId}/session`,
      { cookieJar: renewedSignedCookieJar },
    );
    const expectedPublicProposal = expectedPublicCustomerSnapshot({
      activeRequest,
      finalizedRevision,
      frozenSnapshot,
    });
    const expectedPublicReceipt = {
      fileName: receiptDocument.file_name,
      mimeType: receiptDocument.mime_type,
      sizeBytes: Number(receiptDocument.file_size_bytes),
      sha256: receipt.signed_document_sha256,
      registeredAt: receipt.registered_at,
    };
    const renewedPublicSessionText = JSON.stringify(renewedSession.payload);
    const actualPublicProposal = renewedSession.payload?.proposal;
    const actualPublicReceipt = renewedSession.payload?.receipt;
    const actualPublicAcceptance = renewedSession.payload?.acceptance;
    const normalizedActualPublicProposal =
      normalizePublicSnapshotNumericWireValues(actualPublicProposal);
    const normalizedExpectedPublicProposal =
      normalizePublicSnapshotNumericWireValues(expectedPublicProposal);
    const normalizedActualPublicReceipt =
      normalizePublicReceiptNumericWireValues(actualPublicReceipt);
    const normalizedExpectedPublicReceipt =
      normalizePublicReceiptNumericWireValues(expectedPublicReceipt);
    const privateValuesAbsent = ![
      activation.payload.requestId,
      finalizedRevisionId,
      finalizedRevision.finalized_document_id,
      signedInternalEvidence.id,
      signedInternalEvidence.signature_id,
      signedSessionRow.id,
      receipt.id,
      receiptDocument.id,
      company.id,
      sourceDocument.storage_bucket,
      sourceDocument.storage_path,
      receiptDocument.storage_bucket,
      receiptDocument.storage_path,
      source.customer.email,
      rawToken,
      ...exchangeKeysHeldOnlyInMemory,
    ].some((value) => renewedPublicSessionText.includes(value));
    const scalarPublicProposalFields = [
      "schemaVersion",
      "companyName",
      "brandName",
      "brandPrimaryColor",
      "brandAccentColor",
      "proposalNumber",
      "revisionNumber",
      "title",
      "issueDate",
      "customerName",
      "propertyAddress",
      "baseSubtotal",
      "discountTotal",
      "taxTotal",
      "feeTotal",
      "baseTotal",
      "selectedUpgradesTotal",
      "acceptedTotal",
      "depositType",
      "depositValue",
      "depositRequired",
      "requiresDepositBeforeJob",
      "requiredDepositAmount",
      "remainingBalance",
      "terms",
      "electronicRecordsDisclosure",
      "revisionSha256",
      "termsSha256",
      "consentSha256",
    ];
    const proposalFieldPredicates = Object.fromEntries(
      scalarPublicProposalFields.map((field) => [
        field,
        isDeepStrictEqual(
          actualPublicProposal?.[field],
          expectedPublicProposal[field],
        ),
      ]),
    );
    const proposalSnapshotPredicates = {
      exact: isDeepStrictEqual(actualPublicProposal, expectedPublicProposal),
      numericWireSemanticExact: isDeepStrictEqual(
        normalizedActualPublicProposal,
        normalizedExpectedPublicProposal,
      ),
      fieldSetExact: isDeepStrictEqual(
        Object.keys(actualPublicProposal ?? {}).sort(),
        Object.keys(expectedPublicProposal).sort(),
      ),
      scalarFields: proposalFieldPredicates,
      lineItemsExact: isDeepStrictEqual(
        actualPublicProposal?.lineItems,
        expectedPublicProposal.lineItems,
      ),
      lineItemsNumericWireSemanticExact: isDeepStrictEqual(
        normalizedActualPublicProposal?.lineItems,
        normalizedExpectedPublicProposal.lineItems,
      ),
      lineItemCountExact:
        actualPublicProposal?.lineItems?.length ===
        expectedPublicProposal.lineItems.length,
      sectionsExact: isDeepStrictEqual(
        actualPublicProposal?.sections,
        expectedPublicProposal.sections,
      ),
      sectionsNumericWireSemanticExact: isDeepStrictEqual(
        normalizedActualPublicProposal?.sections,
        normalizedExpectedPublicProposal.sections,
      ),
      sectionCountExact:
        actualPublicProposal?.sections?.length ===
        expectedPublicProposal.sections.length,
      optionsExact: isDeepStrictEqual(
        actualPublicProposal?.options,
        expectedPublicProposal.options,
      ),
      optionsNumericWireSemanticExact: isDeepStrictEqual(
        normalizedActualPublicProposal?.options,
        normalizedExpectedPublicProposal.options,
      ),
      optionCountExact:
        actualPublicProposal?.options?.length ===
        expectedPublicProposal.options.length,
    };
    const expectedRegisteredAtMs = Date.parse(expectedPublicReceipt.registeredAt);
    const actualRegisteredAtMs = Date.parse(
      actualPublicReceipt?.registeredAt ?? "",
    );
    const receiptSnapshotPredicates = {
      exact: isDeepStrictEqual(actualPublicReceipt, expectedPublicReceipt),
      numericWireSemanticExact: isDeepStrictEqual(
        normalizedActualPublicReceipt,
        normalizedExpectedPublicReceipt,
      ),
      fieldSetExact: isDeepStrictEqual(
        Object.keys(actualPublicReceipt ?? {}).sort(),
        Object.keys(expectedPublicReceipt).sort(),
      ),
      fileNameExact:
        actualPublicReceipt?.fileName === expectedPublicReceipt.fileName,
      mimeTypeExact:
        actualPublicReceipt?.mimeType === expectedPublicReceipt.mimeType,
      sizeBytesExact:
        Number(actualPublicReceipt?.sizeBytes) === expectedPublicReceipt.sizeBytes,
      sha256Exact:
        actualPublicReceipt?.sha256 === expectedPublicReceipt.sha256,
      registeredAtTextExact:
        actualPublicReceipt?.registeredAt === expectedPublicReceipt.registeredAt,
      registeredAtInstantExact:
        Number.isFinite(actualRegisteredAtMs) &&
        actualRegisteredAtMs === expectedRegisteredAtMs,
    };
    const renewalSessionDiagnostic = {
      response: {
        http200: renewedSession.status === 200,
        ok: renewedSession.payload?.ok === true,
        terminalSigned: renewedSession.payload?.status === "signed",
      },
      proposal: proposalSnapshotPredicates,
      receipt: receiptSnapshotPredicates,
      acceptance: {
        present: Boolean(actualPublicAcceptance),
        signerNameExact:
          actualPublicAcceptance?.signerName === source.signerName,
        acceptedTotalExact:
          Number(actualPublicAcceptance?.acceptedTotal) === ACCEPTED_TOTAL,
        evidenceSha256Exact:
          actualPublicAcceptance?.evidenceSha256 === acceptance.evidence_sha256,
      },
      privacy: { privateValuesAbsent },
    };
    requireCondition(
      renewalSessionDiagnostic.response.http200 &&
        renewalSessionDiagnostic.response.ok &&
        renewalSessionDiagnostic.response.terminalSigned &&
        proposalSnapshotPredicates.numericWireSemanticExact &&
        receiptSnapshotPredicates.numericWireSemanticExact &&
        renewalSessionDiagnostic.acceptance.signerNameExact &&
        renewalSessionDiagnostic.acceptance.acceptedTotalExact &&
        renewalSessionDiagnostic.acceptance.evidenceSha256Exact &&
        privateValuesAbsent,
      `The ${mode} renewed signed session did not return the exact terminal public proposal and receipt snapshot. PII-safe predicate diagnostic: ${JSON.stringify(renewalSessionDiagnostic)}.`,
    );
    const renewedReceiptDownload = await protocolBytes(
      baseUrl,
      `/api/proposals/signing/${activation.payload.requestId}/receipt`,
      { cookieJar: renewedSignedCookieJar },
    );
    const renewedReceiptDigest = pdfDigest(renewedReceiptDownload.bytes);
    requireCondition(
      renewedReceiptDownload.status === 200 &&
        renewedReceiptDownload.ok &&
        renewedReceiptDownload.contentType?.startsWith("application/pdf") &&
        Number(renewedReceiptDownload.contentLength) ===
          Number(receiptDocument.file_size_bytes) &&
        renewedReceiptDigest.sizeBytes ===
          Number(receiptDocument.file_size_bytes) &&
        renewedReceiptDigest.sha256 === receipt.signed_document_sha256,
      `The ${mode} renewed read-only session did not stream the exact registered receipt bytes.`,
    );
    graph = await waitForAsync(async () => {
      const current = await readNativeGraph(service, finalizedRevisionId);
      const exactRequestSessions = current.sessions.filter(
        (session) =>
          session.signing_request_id === activation.payload.requestId &&
          session.status === "signed",
      );
      return exactRequestSessions.length === 2 &&
        exactRequestSessions.some((session) => session.id === signedSessionRow.id)
        ? current
        : null;
    }, `${mode} terminal signed-session renewal persistence`);

    const actionReplay = await callRpc(
      service,
      "wtos_accept_proposal_signing",
      "signing_request",
      {
        requestId: activation.payload.requestId,
        sessionHash: signedSessionRow.session_token_sha256,
        idempotencyKey: randomUUID(),
        signerName: source.signerName,
        signerEmail: source.customer.email,
        selectedOptionIds: [finalizedSelectedOptionId],
        acceptedTotal: ACCEPTED_TOTAL,
        termsAccepted: true,
        electronicRecordsConsented: true,
        signatureIntentAcknowledged: true,
        revisionSha256: finalizedRevision.revision_sha256,
        documentSha256: sourceDocument.content_sha256,
        termsSha256: finalizedRevision.terms_sha256,
        consentSha256: activeRequest.consent_sha256,
        ipHash: null,
        userAgent: "WeatherTech OS isolated regression replay proof",
      },
      `${mode} conflicting post-signature action replay`,
    );
    requireCondition(
      actionReplay.ok === false && actionReplay.status === "conflict",
      "A conflicting post-signature action replay was accepted.",
    );

    requireCondition(
      graph.requests.length === (mode === "no-deposit" ? 5 : 1) &&
        graph.sessions.length === (mode === "no-deposit" ? 3 : 2),
      "Signing security fixtures did not preserve the exact original and terminal read-only session graph.",
    );
    requireCondition(
      graph.emails.length === graph.requests.length &&
        graph.requests.filter((row) => row.status === "signed").length === 1 &&
        (mode !== "no-deposit" ||
          (graph.requests.filter((row) => row.status === "revoked").length === 4 &&
            graph.requests.filter((row) => row.status === "expired").length === 0)),
      "Signing security request/delivery terminal states were not exact.",
    );
    requireCondition(
      graph.acceptances.length === 1 &&
        graph.signatures.length === (mode === "no-deposit" ? 5 : 1) &&
        graph.receipts.length === 1,
      "Electronic acceptance evidence graph is incomplete.",
    );
    requireCondition(
      graph.signatures.some((signature) => signature.id === acceptance.signature_id && signature.status === "signed") &&
      acceptance.signer_name === source.signerName &&
        acceptance.signer_email === source.customer.email &&
        Number(acceptance.accepted_total) === ACCEPTED_TOTAL &&
        Number(acceptance.required_deposit_amount) ===
          (mode === "deposit" ? REQUIRED_DEPOSIT_AMOUNT : 0) &&
        acceptance.terms_accepted === true &&
        acceptance.electronic_records_consented === true &&
        acceptance.signature_intent_acknowledged === true &&
        /^[0-9a-f]{64}$/.test(acceptance.evidence_sha256),
      `The ${mode} acceptance row did not preserve exact auditable evidence.`,
    );
    const persistedGraphText = JSON.stringify(graph);
    requireCondition(
      rawTokensHeldOnlyInMemory.every((token) => !persistedGraphText.includes(token)) &&
        exchangeKeysHeldOnlyInMemory.every((key) => !persistedGraphText.includes(key)),
      "A raw signing token or ephemeral exchange key leaked into persistent proposal evidence.",
    );
    const estimateAfterSigning = await requireSingle(
      service.from("estimates").select("status").eq("id", source.estimate.id).single(),
      "signed estimate state",
    );
    requireCondition(estimateAfterSigning.status === "approved", "Delivery/signing changed the approved estimate out of conversion eligibility.");

    let ownerWorkspace = await navigateToOwnerEstimateWorkspace({
      tab,
      baseUrl,
      estimateId: source.estimate.id,
      companyName: company.name,
      proposalNumber: finalizedRevision.proposal_number,
      signerName: source.signerName,
      proveHistoryAndRefresh: true,
    });
    ownerWorkspace = await reconcileReceiptFromOwnerUiIfNeeded({
      tab,
      service,
      proposalRevisionId: finalizedRevisionId,
      ownerWorkspace,
    });
    requireCondition(
      !ownerWorkspace.state.reconcileVisible,
      "The owner proposal workspace retained an unresolved signed-receipt recovery action.",
    );

    const conversionRequest = {
      operationKey: randomUUID(),
      companyId: company.id,
      proposalRevisionId: finalizedRevisionId,
      acceptanceId: acceptance.id,
      existingJobId: null,
    };
    let depositInvoice = null;
    if (mode === "deposit") {
      requireCondition(
        ownerWorkspace.state.depositButtonEnabled &&
          ownerWorkspace.state.depositButtonText === "Create exact deposit invoice" &&
          !ownerWorkspace.state.convertButtonEnabled,
        "The signed required-deposit owner workspace did not expose the exact invoice action while keeping sold-job conversion gated.",
      );
      await expectRpcRefusal(
        ownerClient,
        "wtos_convert_proposal_to_sold_job",
        "conversion_request",
        conversionRequest,
        "Required-deposit proposal converted before a posted deposit.",
      );
      depositInvoice = await createDepositInvoiceFromOwnerUi({
        tab,
        service,
        proposalRevisionId: finalizedRevisionId,
      });
      requireCondition(
        Boolean(source.wrongDepositCustomer?.id),
        "Required-deposit regression omitted its same-company wrong-customer fixture.",
      );
      await requireSingle(
        service
          .from("payments")
          .insert({
            company_id: company.id,
            customer_id: source.wrongDepositCustomer.id,
            invoice_id: depositInvoice.id,
            amount: REQUIRED_DEPOSIT_AMOUNT,
            method: "Check",
            status: "posted",
            paid_at: new Date().toISOString(),
            reference: `${marker} wrong-customer posted deposit`,
            notes: "Synthetic negative fixture; it must never satisfy this proposal deposit gate.",
          })
          .select("*")
          .single(),
        "synthetic wrong-customer posted deposit",
      );
      await expectRpcRefusal(
        ownerClient,
        "wtos_convert_proposal_to_sold_job",
        "conversion_request",
        { ...conversionRequest, operationKey: randomUUID() },
        "A posted wrong-customer payment satisfied the exact proposal deposit gate.",
      );
      ownerWorkspace = await navigateToOwnerEstimateWorkspace({
        tab,
        baseUrl,
        estimateId: source.estimate.id,
        companyName: company.name,
        proposalNumber: finalizedRevision.proposal_number,
        signerName: source.signerName,
        proveHistoryAndRefresh: false,
      });
      requireCondition(
        !ownerWorkspace.state.convertButtonEnabled &&
          ownerWorkspace.state.text.includes("$0.00 of $124.00") &&
          !ownerWorkspace.state.text.toLowerCase().includes("deposit gate satisfied"),
        "The owner workspace counted a posted wrong-customer payment toward the exact deposit gate.",
      );
      await requireSingle(
        service
          .from("payments")
          .insert({
            company_id: company.id,
            customer_id: source.customer.id,
            invoice_id: depositInvoice.id,
            amount: REQUIRED_DEPOSIT_AMOUNT,
            method: "Check",
            status: "posted",
            paid_at: new Date().toISOString(),
            reference: `${marker} exact posted deposit`,
            notes: "Synthetic isolated regression payment; no provider was called.",
          })
          .select("*")
          .single(),
        "synthetic posted deposit",
      );
      ownerWorkspace = await navigateToOwnerEstimateWorkspace({
        tab,
        baseUrl,
        estimateId: source.estimate.id,
        companyName: company.name,
        proposalNumber: finalizedRevision.proposal_number,
        signerName: source.signerName,
        proveHistoryAndRefresh: false,
      });
      requireCondition(
        ownerWorkspace.state.convertButtonEnabled &&
          ownerWorkspace.state.text.includes("$124.00 of $124.00") &&
          ownerWorkspace.state.text.toLowerCase().includes("deposit gate satisfied"),
        "The owner proposal workspace did not become visibly conversion-ready after the exact posted deposit.",
      );
    } else {
      requireCondition(
        ownerWorkspace.state.convertButtonEnabled &&
          ownerWorkspace.state.text.includes("does not require a deposit"),
        "The signed no-deposit owner workspace was not visibly ready for sold-job conversion.",
      );
    }

    const soldJob = await convertProposalFromOwnerUi({
      tab,
      service,
      proposalRevisionId: finalizedRevisionId,
      expectedTitle: finalizedRevision.title,
      companyName: company.name,
    });
    const conversion = await callRpc(
      ownerClient,
      "wtos_convert_proposal_to_sold_job",
      "conversion_request",
      {
        operationKey: acceptance.id,
        companyId: company.id,
        proposalRevisionId: finalizedRevisionId,
        acceptanceId: acceptance.id,
        existingJobId: null,
      },
      `${mode} sold-job exact retry`,
    );
    requireCondition(
      conversion.ok === true &&
        conversion.status === "sold_job" &&
        conversion.jobId === soldJob.id &&
        conversion.created === false &&
        Number(conversion.acceptedTotal) === ACCEPTED_TOTAL &&
        Number(conversion.requiredDepositAmount) ===
          (mode === "deposit" ? REQUIRED_DEPOSIT_AMOUNT : 0) &&
        Number(conversion.postedDepositAmount) ===
          (mode === "deposit" ? REQUIRED_DEPOSIT_AMOUNT : 0),
      `The ${mode} sold-job gate returned incorrect proposal/deposit evidence.`,
    );

    return {
      company: company.name,
      depositRequired: mode === "deposit",
      acceptedTotal: Number(acceptance.accepted_total),
      requiredDepositAmount: Number(acceptance.required_deposit_amount),
      sourceDocumentSha256: sourceDocument.content_sha256,
      receiptSha256: receipt.signed_document_sha256,
      oneTimeSessionCount: graph.sessions.length,
      estimateStatus: estimateAfterSigning.status,
      ownerHistoryAndRefreshRestored: true,
      depositInvoiceId: depositInvoice?.id ?? null,
      soldJobId: soldJob.id,
    };
  } catch (error) {
    workflowFailure = error;
    throw error;
  } finally {
    rawTokensHeldOnlyInMemory.fill("");
    rawTokensHeldOnlyInMemory.length = 0;
    exchangeKeysHeldOnlyInMemory.fill("");
    exchangeKeysHeldOnlyInMemory.length = 0;
    try {
      await cleanupFixture({
        service,
        ownerUserId,
        companyId: company.id,
        marker,
        finalizedRevisionId,
        source,
      });
    } catch (cleanupError) {
      if (workflowFailure) {
        throw new Error(
          `Workflow failed: ${describeThrownValue(workflowFailure)} Cleanup also failed: ${describeThrownValue(cleanupError)}`,
        );
      }
      throw cleanupError;
    }
  }
}

export async function testNativeProposalSigningWorkflow({
  browser,
  tab,
  env,
  companies,
  runId,
  baseUrl,
  progress,
}) {
  requireCondition(/^\d{17}$/.test(runId), "Proposal signing Browser run ID must be exactly 17 digits.");
  const marker = `${MARKER_PREFIX} ${runId}`;
  const service = createServiceClient(env);
  const owner = await createOwnerClient(env);
  try {
    const noDeposit = await runOneSigningCase({
      browser,
      tab,
      env,
      baseUrl,
      ownerClient: owner.client,
      ownerCookieJar: owner.cookieJar,
      ownerUserId: owner.user.id,
      service,
      company: companies.ihc,
      otherCompany: companies.weatherTech,
      marker,
      runId,
      mode: "no-deposit",
      progress,
    });
    const requiredDeposit = await runOneSigningCase({
      browser,
      tab,
      env,
      baseUrl,
      ownerClient: owner.client,
      ownerCookieJar: owner.cookieJar,
      ownerUserId: owner.user.id,
      service,
      company: companies.weatherTech,
      otherCompany: companies.ihc,
      marker,
      runId,
      mode: "deposit",
      progress,
    });
    return { marker, noDeposit, requiredDeposit, zeroResidue: true };
  } finally {
    await owner.client.auth.signOut().catch(() => {});
  }
}

export function proposalSigningBrowserModuleDigest(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}
