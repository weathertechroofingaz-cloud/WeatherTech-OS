import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE_URL = "http://localhost:3000/";
const TEST_PREFIX = "TEST WTOS REGRESSION";
const LAPTOP_VIEWPORT = { width: 1366, height: 768 };
const DEFAULT_GROUPS = [
  "dashboard",
  "crm",
  "lead-intake",
  "themes",
  "layout",
  "settings",
  "calendar",
  "inspections",
  "jobs-workspace",
  "job-builder",
  "job-production",
];

function readLocalEnv(cwd) {
  const envText = readFileSync(join(cwd, ".env.local"), "utf8");
  const env = {};

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    env[key] = valueParts.join("=").trim();
  }

  return env;
}

function getRuntimeEnvValue(key) {
  const runtimeProcess =
    typeof globalThis.process === "object" && globalThis.process
      ? globalThis.process
      : null;
  const runtimeEnv =
    runtimeProcess &&
    typeof runtimeProcess.env === "object" &&
    runtimeProcess.env
      ? runtimeProcess.env
      : null;

  return typeof runtimeEnv?.[key] === "string" ? runtimeEnv[key] : undefined;
}

function buildEncryptedLeadIntakeRetryPayload(env, payload) {
  const secret = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!secret) {
    throw new Error("Supabase service role key is required to encrypt retry payloads.");
  }

  const key = createHash("sha256")
    .update(`weathertech-lead-intake-retry:${secret}`)
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);

  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
  };
}

function createProviderHmacSignature(rawBody, timestamp, secret) {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

function colorKind(rgbText) {
  const hex = rgbText.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);

  if (hex) {
    const value = hex[1].length === 3
      ? hex[1].split("").map((part) => `${part}${part}`).join("")
      : hex[1];
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);

    if (red > 180 && green > 70 && green < 180 && blue < 90) {
      return "orange";
    }

    if (blue > 130 && red > 70 && red < 180 && green < 140) {
      return "purple";
    }

    return "other";
  }

  const match = rgbText.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  if (!match) {
    return "unknown";
  }

  const red = Number(match[1]);
  const green = Number(match[2]);
  const blue = Number(match[3]);

  if (red > 180 && green > 70 && green < 180 && blue < 90) {
    return "orange";
  }

  if (blue > 130 && red > 70 && red < 180 && green < 140) {
    return "purple";
  }

  return "other";
}

function createProgressLogger(progressPath) {
  if (!progressPath) {
    return () => {};
  }

  writeFileSync(progressPath, "");

  return (step) => {
    appendFileSync(
      progressPath,
      `${JSON.stringify({ at: new Date().toISOString(), step })}\n`,
    );
  };
}

async function restRequest(env, path, options = {}) {
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !serviceRoleKey) {
    throw new Error("Supabase URL or service role key is missing.");
  }

  const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase ${options.method ?? "GET"} ${path} failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const text = await response.text();

  if (response.status === 204 || !text.trim()) {
    return null;
  }

  return JSON.parse(text);
}

async function deleteByIds(env, table, column, ids) {
  if (!ids.length) {
    return;
  }

  const idFilter = encodeURIComponent(`(${ids.join(",")})`);
  await restRequest(env, `${table}?${column}=in.${idFilter}`, { method: "DELETE" });
}

async function deleteByLike(env, table, column, prefix = TEST_PREFIX) {
  const titleFilter = encodeURIComponent(`${prefix}%`);
  await restRequest(env, `${table}?${column}=like.${titleFilter}`, { method: "DELETE" });
}

async function detectLeadNameColumn(env) {
  for (const column of ["contact_name", "customer_name", "name"]) {
    try {
      await restRequest(env, `leads?select=id,${column}&limit=1`);
      return column;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (!message.includes("does not exist")) {
        throw error;
      }
    }
  }

  throw new Error("Unable to find a supported lead name column.");
}

async function findCompanies(env) {
  const companies = await restRequest(
    env,
    "companies?select=id,name,trade,workflow_profile,brand_color",
  );
  const weatherTech = companies.find((company) => company.name === "WeatherTech Roofing LLC");
  const ihc = companies.find((company) => company.name === "IHC Painting");

  if (!weatherTech) {
    throw new Error("WeatherTech Roofing LLC company record was not found.");
  }

  if (!ihc) {
    throw new Error("IHC Painting company record was not found.");
  }

  return { weatherTech, ihc };
}

async function detectInspectionFoundationSupport(env) {
  try {
    await restRequest(
      env,
      [
        "inspections?select=",
        encodeURIComponent(
          "id,customer_id,lead_id,schedule_event_id,estimate_id,report_document_id,inspection_type,service_category,scheduled_start,scheduled_end,findings,measurements,photo_ids,activity",
        ),
        "&limit=1",
      ].join(""),
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("Could not find")
    ) {
      return false;
    }

    throw error;
  }
}

async function cleanupTestRecords(env, runId = "", leadNameColumn = null) {
  const resolvedLeadNameColumn = leadNameColumn ?? await detectLeadNameColumn(env);
  const prefixFilter = encodeURIComponent(`${TEST_PREFIX}%`);
  const jobs = await restRequest(
    env,
    `jobs?select=id,title&title=like.${prefixFilter}`,
  );
  const estimates = await restRequest(
    env,
    `estimates?select=id,title&title=like.${prefixFilter}`,
  );
  const inspections = await restRequest(
    env,
    `inspections?select=id,title&title=like.${prefixFilter}`,
  );
  const leads = await restRequest(
    env,
    `leads?select=id,${resolvedLeadNameColumn}&${resolvedLeadNameColumn}=like.${prefixFilter}`,
  );
  const customers = await restRequest(
    env,
    `customers?select=id,display_name&display_name=like.${prefixFilter}`,
  );
  const scopedJobs = runId
    ? jobs.filter((job) => job.title.includes(runId))
    : jobs;
  const scopedEstimates = runId
    ? estimates.filter((estimate) => estimate.title.includes(runId))
    : estimates;
  const scopedInspections = runId
    ? inspections.filter((inspection) => inspection.title.includes(runId))
    : inspections;
  const scopedLeads = runId
    ? leads.filter((lead) => String(lead[resolvedLeadNameColumn] ?? "").includes(runId))
    : leads;
  const scopedCustomers = runId
    ? customers.filter((customer) => String(customer.display_name ?? "").includes(runId))
    : customers;
  const jobIds = scopedJobs.map((job) => job.id);
  const estimateIds = scopedEstimates.map((estimate) => estimate.id);
  const inspectionIds = scopedInspections.map((inspection) => inspection.id);
  const leadIds = scopedLeads.map((lead) => lead.id);
  const customerIds = scopedCustomers.map((customer) => customer.id);

  await deleteByLike(env, "integration_sync_logs", "external_id");

  if (
    !jobIds.length &&
    !estimateIds.length &&
    !inspectionIds.length &&
    !leadIds.length &&
    !customerIds.length
  ) {
    return {
      jobsDeleted: 0,
      estimatesDeleted: 0,
      inspectionsDeleted: 0,
      leadsDeleted: 0,
      customersDeleted: 0,
      integrationLogsDeleted: "requested",
    };
  }

  await deleteByLike(env, "schedule_events", "title");
  await deleteByLike(env, "documents", "title");
  await deleteByLike(env, "scopes", "title");
  await deleteByIds(env, "inspections", "id", inspectionIds);
  await deleteByIds(env, "schedule_events", "job_id", jobIds);
  await deleteByIds(env, "schedule_events", "lead_id", leadIds);
  await deleteByIds(env, "job_tasks", "job_id", jobIds);
  await deleteByIds(env, "job_notes", "job_id", jobIds);
  await deleteByIds(env, "job_materials", "job_id", jobIds);
  await deleteByIds(env, "jobs", "id", jobIds);
  await deleteByIds(env, "estimate_line_items", "estimate_id", estimateIds);
  await deleteByIds(env, "estimates", "id", estimateIds);
  await deleteByIds(env, "leads", "id", leadIds);
  await deleteByIds(env, "customers", "id", customerIds);

  return {
    jobsDeleted: jobIds.length,
    estimatesDeleted: estimateIds.length,
    inspectionsDeleted: inspectionIds.length,
    leadsDeleted: leadIds.length,
    customersDeleted: customerIds.length,
    integrationLogsDeleted: "requested",
  };
}

async function seedTestJob(env, companyId, runId) {
  const title = `${TEST_PREFIX} ${runId} JOB`;
  const [job] = await restRequest(env, "jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      title,
      service_type: "roofing",
      status: "draft",
      business: "TEST Regression",
      location: "TEST Regression Roof",
      scheduled_start: null,
      scheduled_end: null,
      start_date: null,
      end_date: null,
      crew_name: "TEST Crew",
      project_manager: "TEST Manager",
      address: "123 TEST Regression Way, Phoenix, AZ",
      property_address: "123 TEST Regression Way, Phoenix, AZ",
      scope_of_work: "TEST regression scope only.",
      total: 0,
      notes: `${TEST_PREFIX} ${runId} seeded job`,
    }),
  });

  await restRequest(env, "job_tasks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      job_id: job.id,
      title: `${TEST_PREFIX} ${runId} INITIAL TASK`,
      description: "Seeded regression checklist task.",
      status: "todo",
      sort_order: 0,
    }),
  });

  return job;
}

async function findJobTaskByTitle(env, jobId, title) {
  const rows = await restRequest(
    env,
    `job_tasks?select=id,title,status,description&job_id=eq.${jobId}&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function seedTestLead(env, companyId, runId, leadNameColumn) {
  const leadName = `${TEST_PREFIX} ${runId} LEAD`;
  const basePayload = {
    company_id: companyId,
    phone: "6025550100",
    email: `regression-${runId}@example.test`,
    property_address: "456 TEST Regression Lead Ave, Phoenix, AZ",
    status: "new",
    pipeline_stage: "new_lead",
    priority: "normal",
    estimated_value: 4321,
    next_follow_up: null,
    notes: `${TEST_PREFIX} ${runId} lead note`,
  };
  const payloads = [
    {
      ...basePayload,
      contact_name: leadName,
      source: "Website",
      service_type: "roofing",
      state: "AZ",
    },
    {
      ...basePayload,
      customer_name: leadName,
      lead_source: "Website",
      service_needed: "roofing",
    },
    {
      ...basePayload,
      name: leadName,
      source: "Website",
      service_type: "roofing",
    },
  ];
  let lastError = null;

  for (const payload of payloads) {
    try {
      const [lead] = await restRequest(env, "leads", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });

      return {
        leadId: lead.id,
        leadName: lead[leadNameColumn] ?? leadName,
        pipelineStage: lead.pipeline_stage ?? "new_lead",
        priority: lead.priority ?? "normal",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = error;

      if (
        message.includes("Could not find") ||
        message.includes("does not exist") ||
        message.includes("schema cache")
      ) {
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error("Unable to seed estimate lead.");
}

async function findLeadByContactName(env, contactName, leadNameColumn) {
  const rows = await restRequest(
    env,
    `leads?select=*&${leadNameColumn}=eq.${encodeURIComponent(contactName)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function findLeadsByContactName(env, contactName, leadNameColumn) {
  return restRequest(
    env,
    `leads?select=*&${leadNameColumn}=eq.${encodeURIComponent(contactName)}`,
  );
}

function getLeadRowName(lead) {
  return lead.contact_name ?? lead.customer_name ?? lead.name ?? "";
}

function getLeadRowSource(lead) {
  return lead.source ?? lead.lead_source ?? "";
}

function getLeadRowServiceType(lead) {
  return lead.service_type ?? lead.service_needed ?? "";
}

async function findIntegrationLogsByExternalId(env, provider, externalId) {
  return restRequest(
    env,
    `integration_sync_logs?select=*&provider=eq.${encodeURIComponent(provider)}&external_id=eq.${encodeURIComponent(externalId)}&order=created_at.desc`,
  );
}

async function postAppJson(baseUrl, path, payload, headers = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    ok: response.ok,
    body,
  };
}

async function postAppRaw(baseUrl, path, body) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body,
  });
  const text = await response.text();

  return {
    status: response.status,
    ok: response.ok,
    body: text ? JSON.parse(text) : null,
  };
}

function assertNoSensitiveRequestSummary(log, sensitiveValues, label) {
  const requestSummary = JSON.stringify(log.request_summary ?? {});
  const leaked = sensitiveValues.filter((value) =>
    value && requestSummary.includes(value),
  );

  if (leaked.length > 0) {
    throw new Error(
      `${label} request_summary contained sensitive plaintext: ${leaked.join(", ")}`,
    );
  }
}

async function findEstimateByTitle(env, title) {
  const rows = await restRequest(
    env,
    `estimates?select=*&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function findJobByTitle(env, title) {
  const rows = await restRequest(
    env,
    `jobs?select=*&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function findCustomerByDisplayName(env, displayName) {
  const rows = await restRequest(
    env,
    `customers?select=*&display_name=eq.${encodeURIComponent(displayName)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function countEstimateLineItems(env, estimateId) {
  const rows = await restRequest(
    env,
    `estimate_line_items?select=id&estimate_id=eq.${encodeURIComponent(estimateId)}`,
  );

  return rows.length;
}

async function getTab(browser) {
  const withTimeout = async (operation, fallback) => {
    let timeout = null;

    try {
      return await Promise.race([
        operation,
        new Promise((resolve) => {
          timeout = setTimeout(() => resolve(fallback), 5000);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  };

  const tabs = await withTimeout(browser.tabs.list(), []);
  const selected = await withTimeout(browser.tabs.selected(), undefined);

  if (selected) {
    const selectedUrl = await withTimeout(selected.url().catch(() => ""), "");

    if (selectedUrl && !selectedUrl.startsWith("data:")) {
      return selected;
    }
  }

  const appTab = tabs.find((tab) =>
    tab.url?.startsWith("http://localhost:3000") ||
    tab.url?.startsWith("http://127.0.0.1:3000"),
  );

  if (appTab) {
    return browser.tabs.get(appTab.id);
  }

  return browser.tabs.new();
}

async function pageText(tab) {
  return tab.playwright.evaluate(() => document.body.innerText);
}

async function getAppShellState(tab) {
  return tab.playwright.evaluate(() => {
    const text = document.body.innerText;

    return {
      href: location.href,
      hasShellNav:
        text.includes("Dashboard") &&
        text.includes("Leads") &&
        text.includes("Estimates") &&
        text.includes("Jobs"),
      isPreparing: text.includes("Preparing WeatherTech OS"),
      hasLiveDataError: text.includes("LIVE DATA ERROR"),
    };
  });
}

async function ensureAppShell(tab, baseUrl, progress) {
  progress("browser:shell-check:start");
  let state = await getAppShellState(tab).catch(() => null);
  const baseOrigin = new URL(baseUrl).origin;
  const isLocalApp = state?.href?.startsWith(baseOrigin);

  if (!isLocalApp) {
    progress("browser:goto:start");
    await tab.goto(baseUrl);
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
    progress("browser:goto:done");
  } else if (state?.isPreparing || state?.hasLiveDataError || !state?.hasShellNav) {
    progress("browser:reload:start");
    await tab.reload();
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
    progress("browser:reload:done");
  }

  await waitFor(
    tab,
    () => {
      const text = document.body.innerText;

      return (
        text.includes("Dashboard") &&
        text.includes("Leads") &&
        text.includes("Estimates") &&
        text.includes("Jobs") &&
        !text.includes("Preparing WeatherTech OS")
      );
    },
    "live CRM shell",
    45000,
  );
  progress("browser:shell-check:done");
}

async function waitFor(tab, predicate, label, timeoutMs = 10000, arg = undefined) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    let result = false;

    try {
      result = await tab.playwright.evaluate(predicate, arg);
      lastError = null;
    } catch (error) {
      lastError = error;
    }

    if (result) {
      return result;
    }

    await tab.playwright.waitForTimeout(250);
  }

  const details = lastError instanceof Error ? ` Last browser error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${details}`);
}

async function waitForAsync(predicate, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  let lastResult = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastResult = await predicate();

    if (lastResult) {
      return lastResult;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForUniqueLocator(locator, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  let count = 0;
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      count = await locator.count();
      lastError = null;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    if (count === 1) {
      return;
    }

    if (count > 1) {
      throw new Error(`${label} expected 1 match, found ${count}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const details = lastError instanceof Error ? ` Last browser error: ${lastError.message}` : "";
  throw new Error(`${label} expected 1 match, found ${count}.${details}`);
}

async function clickUnique(locator, label, options = {}) {
  await waitForUniqueLocator(locator, label);

  if (!options.retryTransientClick) {
    await locator.click({ timeoutMs: 8000 });
    return;
  }

  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < 15000) {
    try {
      await locator.click({ timeoutMs: 5000 });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  const details = lastError instanceof Error ? ` Last browser error: ${lastError.message}` : "";
  throw new Error(`${label} could not be clicked.${details}`);
}

async function clickVisibleButtonByText(
  tab,
  selector,
  text,
  label,
  mode = "exact",
  timeoutMs = 15000,
) {
  const input = { selector, text, mode };
  await waitFor(
    tab,
    (input) => {
      const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const targetText = normalize(input.text);
      const matchesTarget = (candidate) => {
        const textContent = normalize(candidate.textContent);
        const paragraphText = [...candidate.querySelectorAll("p")].some(
          (paragraph) => normalize(paragraph.textContent) === targetText,
        );

        if (input.mode === "paragraph") {
          return paragraphText || textContent.includes(targetText);
        }

        return textContent === targetText;
      };
      const hasRenderedBox = (candidate) => {
        const style = window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };
      const buttons = [...document.querySelectorAll(input.selector)];
      const button = buttons.find((candidate) => matchesTarget(candidate) && hasRenderedBox(candidate));

      if (!button) {
        return false;
      }

      button.scrollIntoView({ block: "center", behavior: "auto" });
      return true;
    },
    `${label} scroll target`,
    timeoutMs,
    input,
  );
  await tab.playwright.waitForTimeout(200);

  const box = await waitFor(
    tab,
    (input) => {
      const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const targetText = normalize(input.text);
      const matchesTarget = (candidate) => {
        const textContent = normalize(candidate.textContent);
        const paragraphText = [...candidate.querySelectorAll("p")].some(
          (paragraph) => normalize(paragraph.textContent) === targetText,
        );

        if (input.mode === "paragraph") {
          return paragraphText || textContent.includes(targetText);
        }

        return textContent === targetText;
      };
      const isVisible = (candidate) => {
        const style = window.getComputedStyle(candidate);
        const rect = candidate.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity) !== 0 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.top <= window.innerHeight &&
          rect.right >= 0 &&
          rect.left <= window.innerWidth
        );
      };
      const buttons = [...document.querySelectorAll(input.selector)];
      const button = buttons.find((candidate) => matchesTarget(candidate) && isVisible(candidate));

      if (!button) {
        return null;
      }

      const rect = button.getBoundingClientRect();
      const visibleLeft = Math.max(rect.left, 0);
      const visibleRight = Math.min(rect.right, window.innerWidth);
      const visibleTop = Math.max(rect.top, 0);
      const visibleBottom = Math.min(rect.bottom, window.innerHeight);

      if (
        visibleRight <= visibleLeft ||
        visibleBottom <= visibleTop
      ) {
        return null;
      }

      return {
        x: Math.round((visibleLeft + visibleRight) / 2),
        y: Math.round((visibleTop + visibleBottom) / 2),
      };
    },
    label,
    timeoutMs,
    input,
  );

  await tab.cua.click({ x: box.x, y: box.y });
}

async function fillUnique(locator, value, label) {
  await waitForUniqueLocator(locator, label);
  await locator.fill(value, { timeoutMs: 8000 });
}

async function selectUnique(locator, value, label) {
  await waitForUniqueLocator(locator, label);
  await locator.selectOption(value, { timeoutMs: 8000 });
}

async function checkUnique(locator, label) {
  await waitForUniqueLocator(locator, label);
  let lastError = null;

  for (const action of [
    () => locator.check({ timeoutMs: 8000 }),
    () => locator.click({ force: true, timeoutMs: 8000 }),
    () => locator.check({ timeoutMs: 8000 }),
  ]) {
    try {
      await action();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  throw lastError ?? new Error(`${label} could not be checked.`);
}

async function checkFormCheckboxByLabel(tab, formHeading, name, label) {
  let lastError = null;
  const inputLocator = tab.playwright.locator(
    `xpath=//form[.//h4[normalize-space(.)=${xpathString(formHeading)}]]//input[@name="${name}"]`,
  );
  const labelLocator = tab.playwright.locator(
    `xpath=//form[.//h4[normalize-space(.)=${xpathString(formHeading)}]]//label[.//input[@name="${name}"]]`,
  );

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForUniqueLocator(inputLocator, `${label} checkbox`);
    const isChecked = await inputLocator.evaluate((element) =>
      Boolean("checked" in element && element.checked),
    );

    if (isChecked) {
      return;
    }

    await waitForUniqueLocator(labelLocator, `${label} label`);

    try {
      await labelLocator.click({ timeoutMs: 8000 });
    } catch (error) {
      lastError = error;
      await labelLocator.click({ force: true, timeoutMs: 8000 });
    }

    const checked = await waitForAsync(
      async () =>
        inputLocator.evaluate((element) =>
          Boolean("checked" in element && element.checked),
        ).catch(() => false),
      `${label} checked`,
      2500,
    ).catch(() => false);

    if (checked) {
      return;
    }
  }

  const details = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`${label} could not be checked.${details}`);
}

async function waitForNoSavingState(tab, label) {
  await waitFor(
    tab,
    () => ![...document.querySelectorAll("button")].some(
      (button) => button.innerText.trim() === "Saving",
    ),
    label,
    15000,
  );
}

async function clickNav(tab, label) {
  await tab.playwright.evaluate(() => window.scrollTo(0, 0));
  await clickUnique(
    tab.playwright.locator(
      `xpath=//nav//button[normalize-space(.)=${xpathString(label)}]`,
    ),
    `nav ${label}`,
  );
  await tab.playwright.waitForTimeout(600);
}

function xpathString(value) {
  if (!value.includes('"')) {
    return `"${value}"`;
  }

  if (!value.includes("'")) {
    return `'${value}'`;
  }

  return `concat(${value.split('"').map((part) => `"${part}"`).join(', \'"\', ')})`;
}

function buttonContainingText(tab, text) {
  return tab.playwright.locator(
    `xpath=//button[contains(normalize-space(.), ${xpathString(text)})]`,
  );
}

function jobListItemContainingText(tab, text) {
  return tab.playwright.locator(
    `xpath=//button[@data-testid="jobs-list-item" and contains(normalize-space(.), ${xpathString(text)})]`,
  );
}

async function clickListRowByParagraph(
  tab,
  sectionHeading,
  paragraphText,
  label,
  timeoutMs = 30000,
) {
  const input = { sectionHeading, paragraphText };
  const row = tab.playwright.locator(
    [
      "xpath=//section",
      `[.//h2[normalize-space(.)=${xpathString(sectionHeading)}]]`,
      `//button[.//p[normalize-space(.)=${xpathString(paragraphText)}]]`,
    ].join(""),
  );

  await waitForUniqueLocator(row, label, timeoutMs);
  let selected = false;

  try {
    await clickUnique(row, label, { retryTransientClick: true });
    selected = await waitFor(
      tab,
      (input) => {
        const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
        const targetText = normalize(input.paragraphText);
        return [...document.querySelectorAll("aside, aside section")].some((section) =>
          normalize(section.textContent).includes(targetText),
        );
      },
      `${label} selected through locator`,
      1200,
      input,
    ).catch(() => false);
  } catch {
    selected = false;
  }

  if (!selected) {
    try {
      await row.press("Enter", { timeoutMs: 10000 });
      selected = await waitFor(
        tab,
        (input) => {
          const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
          const targetText = normalize(input.paragraphText);
          return [...document.querySelectorAll("aside, aside section")].some((section) =>
            normalize(section.textContent).includes(targetText),
          );
        },
        `${label} selected through keyboard`,
        1200,
        input,
      ).catch(() => false);
    } catch {
      selected = false;
    }
  }

  if (!selected) {
    const target = await waitFor(
      tab,
      (input) => {
        const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
        const section = [...document.querySelectorAll("section")].find((candidate) =>
          [...candidate.querySelectorAll("h2")].some(
            (heading) => normalize(heading.textContent) === input.sectionHeading,
          ),
        );
        const row = [...section?.querySelectorAll("button") ?? []].find((candidate) =>
          [...candidate.querySelectorAll("p")].some(
            (paragraph) => normalize(paragraph.textContent) === input.paragraphText,
          ),
        );

        if (!row) {
          return null;
        }

        row.scrollIntoView({ block: "center", behavior: "auto" });
        const rect = row.getBoundingClientRect();

        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= 0 ||
          rect.top >= window.innerHeight
        ) {
          return null;
        }

        return {
          x: Math.round(Math.min(rect.right - 24, rect.left + 120)),
          y: Math.round(rect.top + rect.height / 2),
        };
      },
      `${label} fallback visible row`,
      timeoutMs,
      input,
    );
    await tab.cua.click(target);
    selected = await waitFor(
      tab,
      (input) => {
        const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
        const targetText = normalize(input.paragraphText);
        return [...document.querySelectorAll("aside, aside section")].some((section) =>
          normalize(section.textContent).includes(targetText),
        );
      },
      `${label} selected through fallback click`,
      2000,
      input,
    ).catch(() => false);
  }
  await tab.playwright.waitForTimeout(600);
}

async function clickTabAndWaitSelected(tab, label, description) {
  const tabLocator = tab.playwright.getByRole("tab", { name: label });
  let selected = false;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await waitForUniqueLocator(tabLocator, `${description} attempt ${attempt}`);

    try {
      await tabLocator.click({ timeoutMs: 5000 });
    } catch {
      await tabLocator.press("Enter", { timeoutMs: 5000 });
    }

    selected = await waitFor(
      tab,
      (label) => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        return selected?.textContent?.trim() === label;
      },
      `${description} selected attempt ${attempt}`,
      3000,
      label,
    ).catch(() => false);

    if (selected) {
      return;
    }

    await tabLocator.press("Enter", { timeoutMs: 5000 }).catch(() => undefined);
    selected = await waitFor(
      tab,
      (label) => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        return selected?.textContent?.trim() === label;
      },
      `${description} keyboard selected attempt ${attempt}`,
      3000,
      label,
    ).catch(() => false);

    if (selected) {
      return;
    }
  }

  throw new Error(`Timed out waiting for selected ${label} job workspace tab.`);
}

async function clickCustomerWorkspaceTab(tab, label) {
  const tabButton = tab.playwright.locator(
    [
      'xpath=//*[@data-testid="customer-workspace"]',
      '//div[contains(@class, "overflow-x-auto")]',
      `//button[starts-with(normalize-space(.), ${xpathString(label)})]`,
    ].join(""),
  );

  await clickUnique(tabButton, `customer ${label} workspace tab`, {
    retryTransientClick: true,
  });
  await waitFor(
    tab,
    (label) => {
      const selected = document.querySelector(
        '[data-testid="customer-workspace"] [aria-pressed="true"]',
      );

      return Boolean(
        selected?.textContent?.replace(/\s+/g, " ").trim().startsWith(label),
      );
    },
    `selected customer ${label} workspace tab`,
    10000,
    label,
  );
}

function visibleDomButtonNodeId(domText, text, type = "submit") {
  const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const targetText = normalize(text);
  const buttonPattern = /<button node_id=(\d+)([^>]*)>([\s\S]*?)<\/button>/g;

  for (const match of domText.matchAll(buttonPattern)) {
    const [, nodeId, attributes, content] = match;
    const buttonText = normalize(content.replace(/<[^>]*>/g, ""));

    if (
      buttonText === targetText &&
      (!type || attributes.includes(`type="${type}"`))
    ) {
      return nodeId;
    }
  }

  return null;
}

async function clickVisibleDomSubmitByText(tab, text, label, timeoutMs = 30000) {
  const startedAt = Date.now();
  const input = { text };
  let lastDom = "";

  while (Date.now() - startedAt < timeoutMs) {
    await tab.playwright.evaluate((input) => {
      const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const button = [...document.querySelectorAll('button[type="submit"]')].find(
        (candidate) => normalize(candidate.textContent) === input.text,
      );

      button?.scrollIntoView({ block: "center", behavior: "auto" });
    }, input);
    await tab.playwright.waitForTimeout(200);

    const visibleDom = await tab.dom_cua.get_visible_dom();
    lastDom = typeof visibleDom === "string" ? visibleDom : JSON.stringify(visibleDom);
    const nodeId = visibleDomButtonNodeId(lastDom, text);

    if (nodeId) {
      try {
        await tab.dom_cua.click({ node_id: nodeId });
        await tab.playwright.waitForTimeout(500);
        return;
      } catch (error) {
        lastDom = `${lastDom}\nLast click error: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    await tab.playwright.waitForTimeout(250);
  }

  throw new Error(`${label} visible submit button was not found. Visible DOM: ${lastDom.slice(0, 500)}`);
}

async function clickVisibleDomButtonByText(tab, text, label, timeoutMs = 30000) {
  const startedAt = Date.now();
  const input = { text };
  let lastDom = "";

  while (Date.now() - startedAt < timeoutMs) {
    await tab.playwright.evaluate((input) => {
      const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const button = [...document.querySelectorAll("button")].find(
        (candidate) => normalize(candidate.textContent) === input.text,
      );

      button?.scrollIntoView({ block: "center", behavior: "auto" });
    }, input);
    await tab.playwright.waitForTimeout(200);

    const visibleDom = await tab.dom_cua.get_visible_dom();
    lastDom = typeof visibleDom === "string" ? visibleDom : JSON.stringify(visibleDom);
    const nodeId = visibleDomButtonNodeId(lastDom, text, null);

    if (nodeId) {
      try {
        await tab.dom_cua.click({ node_id: nodeId });
        await tab.playwright.waitForTimeout(500);
        return;
      } catch (error) {
        lastDom = `${lastDom}\nLast click error: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }

    await tab.playwright.waitForTimeout(250);
  }

  throw new Error(`${label} visible button was not found. Visible DOM: ${lastDom.slice(0, 500)}`);
}

async function clickSubmitUntilText(tab, submitText, expectedText, label, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await clickVisibleDomSubmitByText(
      tab,
      submitText,
      `${label} attempt ${attempt}`,
    );

    try {
      await waitFor(
        tab,
        (text) => document.body.innerText.includes(text),
        label,
        7000,
        expectedText,
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`Timed out waiting for ${label}.`);
}

async function forceClickSubmitButtonByText(tab, text, label, timeoutMs = 30000) {
  const button = tab.playwright.locator(
    `xpath=//button[@type="submit" and normalize-space(.)=${xpathString(text)}]`,
  );

  await waitForUniqueLocator(button, label, timeoutMs);
  await tab.playwright.evaluate((buttonText) => {
    const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
    const button = [...document.querySelectorAll('button[type="submit"]')].find(
      (candidate) => normalize(candidate.textContent) === buttonText,
    );

    button?.scrollIntoView({ block: "center", behavior: "auto" });
  }, text);
  await tab.playwright.waitForTimeout(200);
  await button.click({ force: true, timeoutMs: 10000 });
  await tab.playwright.waitForTimeout(500);
}

async function activateSubmitButtonByText(tab, text, label) {
  const errors = [];

  for (const strategy of [
    () => forceClickSubmitButtonByText(tab, text, `${label} force click`, 10000),
    () => clickVisibleDomSubmitByText(tab, text, `${label} visible DOM click`, 10000),
    () =>
      clickVisibleButtonByText(
        tab,
        'button[type="submit"]',
        text,
        `${label} coordinate click`,
        "exact",
        10000,
      ),
  ]) {
    try {
      await strategy();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (errors.length === 3) {
    throw new Error(`${label} could not be activated: ${errors.join(" | ")}`);
  }
}

function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function clickCompanyScope(tab, companyName) {
  await tab.playwright.evaluate(() => window.scrollTo(0, 0));
  await tab.playwright.waitForTimeout(300);
  const scopeButton = tab.playwright.locator(
    `xpath=//button[@aria-pressed and (.//p[normalize-space(.)=${xpathString(companyName)}] or contains(normalize-space(.), ${xpathString(companyName)}))]`,
  );
  await waitForUniqueLocator(scopeButton, `company scope ${companyName}`);
  await scopeButton.click({ timeoutMs: 10000 });
  await tab.playwright.waitForTimeout(600);
}

async function selectTestJob(tab, jobTitle) {
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await clickNav(tab, "Jobs");
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="jobs-search"]')) &&
      document.body.innerText.includes("Jobs / Projects"),
    "jobs screen ready",
    15000,
  );
  const clearFilters = tab.playwright.getByRole("button", { name: "Clear filters" });

  if ((await clearFilters.count()) === 1) {
    await clickUnique(clearFilters, "Clear job filters");
  }

  await fillUnique(tab.playwright.locator('[data-testid="jobs-search"]'), jobTitle, "job search");
  await tab.playwright.waitForTimeout(600);
  const jobCard = jobListItemContainingText(tab, jobTitle);
  await clickUnique(jobCard, `job card ${jobTitle}`);
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `selected job ${jobTitle}`,
    10000,
    jobTitle,
  );
}

async function getScrollY(tab) {
  return tab.playwright.evaluate(() => window.scrollY);
}

async function preserveScrollAround(tab, action, label, tolerance = 240) {
  const before = await getScrollY(tab);
  await action();
  await tab.playwright.waitForTimeout(900);
  const after = await getScrollY(tab);
  const delta = Math.abs(after - before);

  if (delta > tolerance) {
    throw new Error(`${label} changed scroll by ${delta}px, expected <= ${tolerance}px.`);
  }

  return { before, after, delta };
}

async function preserveScrollAfterControlActivation(tab, activate, settle, label, tolerance = 240) {
  const before = await getScrollY(tab);
  await activate();
  await tab.playwright.waitForTimeout(300);
  const activated = await getScrollY(tab);
  await settle();
  await tab.playwright.waitForTimeout(900);
  const after = await getScrollY(tab);
  const delta = Math.abs(after - activated);

  if (delta > tolerance) {
    throw new Error(`${label} changed scroll by ${delta}px after activation, expected <= ${tolerance}px.`);
  }

  if (activated > 300 && after < 180) {
    throw new Error(`${label} jumped near the top of the page after activation.`);
  }

  return { before, activated, after, delta };
}

async function preventTopJumpAround(tab, action, label) {
  const before = await getScrollY(tab);
  await action();
  await tab.playwright.waitForTimeout(900);
  const after = await getScrollY(tab);
  const delta = Math.abs(after - before);

  if (before > 300 && after < 180) {
    throw new Error(`${label} jumped near the top of the page.`);
  }

  return { before, after, delta };
}

async function scrollTextIntoView(tab, text) {
  await tab.playwright.evaluate((targetText) => {
    const node = [...document.querySelectorAll("main *")]
      .find((element) => element.textContent?.trim() === targetText);

    node?.scrollIntoView({ block: "center", behavior: "auto" });
  }, text);
  await tab.playwright.waitForTimeout(250);
}

async function scrollChecklistTaskIntoView(tab, taskTitle) {
  await waitFor(
    tab,
    (taskTitle) => {
      const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
      const checklist = document.querySelector("#job-section-checklist");
      const taskCard = [...checklist?.querySelectorAll(".rounded-lg.border") ?? []].find(
        (candidate) => [...candidate.querySelectorAll("p")].some(
          (paragraph) => normalize(paragraph.textContent) === taskTitle,
        ),
      );

      if (!taskCard) {
        return false;
      }

      taskCard.scrollIntoView({ block: "center", behavior: "auto" });
      return true;
    },
    `checklist task ${taskTitle} scroll target`,
    10000,
    taskTitle,
  );
  await tab.playwright.waitForTimeout(250);
}

async function clickInspectionTabAndWait(tab, label, expectedTexts) {
  const expected = Array.isArray(expectedTexts) ? expectedTexts : [expectedTexts];
  let opened = false;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await scrollTextIntoView(tab, label);
    await clickUnique(
      tab.playwright.getByRole("button", { name: label }),
      `${label} inspection tab attempt ${attempt}`,
    );

    try {
      await waitFor(
        tab,
        (expected) => {
          const text = document.body.innerText.toLowerCase();

          return expected.every((item) => text.includes(item.toLowerCase()));
        },
        `${label} inspection tab panel`,
        attempt === 2 ? 10000 : 2500,
        expected,
      );
      opened = true;
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  if (!opened) {
    throw new Error(`${label} inspection tab did not open.`);
  }
}

async function testTheme(tab, companyName, expectedPrimary, expectedAccent = null) {
  await clickNav(tab, "Dashboard");
  await clickCompanyScope(tab, companyName);

  const colors = await tab.playwright.evaluate(() => {
    const main = document.querySelector("main");
    const rootStyles = getComputedStyle(document.documentElement);
    const fallbackVariables = {
      "--wt-roofing-purple": "#6d28d9",
      "--wt-roofing-orange": "#f97316",
      "--wt-painting-orange": "#f97316",
      "--wt-accent": "#f97316",
    };
    const getCustomProperty = (name) =>
      rootStyles.getPropertyValue(name).trim() || fallbackVariables[name] || "";
    const resolve = (value) => {
      const match = value.match(/^var\((--[^),]+)\)$/);
      return match ? getCustomProperty(match[1]) : value;
    };
    const brandBadge = document.querySelector("aside [style*=\"background-color\"]");
    const primary = resolve(
      brandBadge?.style.backgroundColor || getCustomProperty("--wt-primary"),
    );
    const accent = resolve(getCustomProperty("--wt-accent"));
    const hasPaintingClass = main?.classList.contains("wt-company-painting") ?? false;

    return { primary, accent, hasPaintingClass };
  });

  const primaryKind = colorKind(colors.primary);
  const accentKind = colorKind(colors.accent);

  if (primaryKind !== expectedPrimary) {
    throw new Error(`${companyName} primary color was ${colors.primary} (${primaryKind}), expected ${expectedPrimary}.`);
  }

  if (expectedAccent && accentKind !== expectedAccent) {
    throw new Error(`${companyName} accent color was ${colors.accent} (${accentKind}), expected ${expectedAccent}.`);
  }

  if (companyName === "IHC Painting" && !colors.hasPaintingClass) {
    throw new Error("IHC Painting did not apply wt-company-painting class.");
  }

  return { ...colors, primaryKind, accentKind };
}

async function testDashboardLiveMode(tab) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Dashboard");

  const state = await tab.playwright.evaluate(() => {
    const text = document.body.innerText;
    const normalizedText = text.toLowerCase();
    const main = document.querySelector("main");

    return {
      hasDemoBanner: text.includes("Using local demo CRM data"),
      hasLiveDataError: text.includes("LIVE DATA ERROR"),
      hasDashboardMetrics:
        text.includes("Open leads") &&
        text.includes("Open estimates") &&
        text.includes("Active jobs"),
      hasOperationsDashboard:
        normalizedText.includes("crm operations dashboard") &&
        normalizedText.includes("morning command center") &&
        normalizedText.includes("owner priorities"),
      hasOperationsSections:
        normalizedText.includes("command focus") &&
        normalizedText.includes("all companies") &&
        normalizedText.includes("weathertech roofing") &&
        normalizedText.includes("ihc painting") &&
        normalizedText.includes("phoenix") &&
        normalizedText.includes("tucson") &&
        normalizedText.includes("new or unassigned leads") &&
        normalizedText.includes("overdue follow-ups") &&
        normalizedText.includes("schedule gaps") &&
        normalizedText.includes("comms and integrations") &&
        normalizedText.includes("today") &&
        normalizedText.includes("lead pipeline") &&
        normalizedText.includes("website") &&
        normalizedText.includes("yelp") &&
        normalizedText.includes("unassigned") &&
        normalizedText.includes("customer activity") &&
        normalizedText.includes("operations") &&
        normalizedText.includes("communications") &&
        normalizedText.includes("integration health") &&
        normalizedText.includes("quick actions") &&
        normalizedText.includes("create change order") &&
        normalizedText.includes("upload photos") &&
        normalizedText.includes("upload documents") &&
        normalizedText.includes("weathertech roofing workflow") &&
        normalizedText.includes("ihc painting workflow") &&
        normalizedText.includes("upcoming roof inspections") &&
        normalizedText.includes("roofing production today") &&
        normalizedText.includes("painting follow-ups") &&
        normalizedText.includes("surface preparation"),
      visibleEmail: text.split("\n").find((line) => line.includes("@")) ?? null,
      companyShellClass: main?.className ?? "",
    };
  });

  if (state.hasDemoBanner) {
    throw new Error("Local demo banner is visible.");
  }

  if (state.hasLiveDataError) {
    throw new Error("Live data error is visible.");
  }

  if (!state.visibleEmail) {
    throw new Error("No signed-in account email is visible.");
  }

  if (!state.hasDashboardMetrics) {
    throw new Error("Dashboard metrics are not visible.");
  }

  if (!state.hasOperationsDashboard || !state.hasOperationsSections) {
    throw new Error("CRM operations dashboard sections are not visible.");
  }

  for (const filter of [
    ["Phoenix", "Phoenix · Phoenix-area records"],
    ["Tucson", "Tucson · Tucson-area records"],
    ["IHC Painting", "IHC Painting · Painting workstream"],
    ["WeatherTech Roofing", "WeatherTech Roofing · Roofing workstream"],
    ["All companies", "All companies · Combined owner view"],
  ]) {
    await clickUnique(
      tab.playwright.locator(
        `xpath=//*[@data-testid="crm-operations-dashboard"]//button[normalize-space(.)=${xpathString(filter[0])}]`,
      ),
      `dashboard focus ${filter[0]}`,
    );
    await waitFor(
      tab,
      (expected) => document.body.innerText.includes(expected),
      `dashboard focus result ${filter[0]}`,
      8000,
      filter[1],
    );
  }

  for (const filter of ["Website", "Yelp", "Unassigned", "WeatherTech"]) {
    await clickUnique(
      tab.playwright.locator(
        `xpath=//*[@data-testid="crm-operations-dashboard"]//section[.//h3[normalize-space(.)="Lead pipeline"]]//button[normalize-space(.)=${xpathString(filter)}]`,
      ),
      `dashboard pipeline ${filter}`,
    );
  }

  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="crm-operations-dashboard"]//section[.//h3[normalize-space(.)="Lead pipeline"]]//button[normalize-space(.)="All"]',
    ),
    "dashboard pipeline all",
  );

  return state;
}

async function testLeadsWorkflow(tab, env, company, runId, leadNameColumn) {
  const leadName = `${TEST_PREFIX} ${runId} LEAD`;
  const updatedNote = `${TEST_PREFIX} ${runId} LEAD UPDATED`;
  const leadAddress = "456 TEST Regression Lead Ave, Phoenix, AZ";
  const leadPhone = "6025550100";
  const leadEmail = `regression-${runId}@example.test`;
  const leadUpdateForm = 'xpath=//form[.//button[normalize-space(.)="Save lead"]]';

  await clickNav(tab, "Leads");
  await waitFor(
    tab,
    () => document.body.innerText.includes("CRM Pipeline"),
    "leads list",
  );

  await selectUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//select[@name="company_id"]'),
    company.id,
    "lead company",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="contact_name"]'),
    leadName,
    "lead contact name",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="property_address"]'),
    leadAddress,
    "lead property address",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="phone"]'),
    leadPhone,
    "lead phone",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="email"]'),
    leadEmail,
    "lead email",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="city"]'),
    "Phoenix",
    "lead city",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="estimated_value"]'),
    "4321",
    "lead value",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//textarea[@name="notes"]'),
    `${TEST_PREFIX} ${runId} lead note`,
    "lead notes",
  );
  let createdLead = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await clickVisibleDomSubmitByText(tab, "Create lead", `Create lead attempt ${attempt}`);

    try {
      createdLead = await waitForAsync(
        () => findLeadByContactName(env, leadName, leadNameColumn),
        `Supabase lead ${leadName}`,
        12000,
      );
      break;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }

  if (!createdLead) {
    throw new Error("Created lead was not found through Supabase.");
  }

  try {
    await waitFor(
      tab,
      (name) => document.body.innerText.includes(name),
      `created lead ${leadName}`,
      10000,
      leadName,
    );
  } catch {
    await tab.reload();
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
    await clickNav(tab, "Leads");
    await waitFor(
      tab,
      (name) => document.body.innerText.includes(name),
      `created lead ${leadName}`,
      15000,
      leadName,
    );
  }

  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), leadName, "lead search");
  await tab.playwright.waitForTimeout(500);
  await clickListRowByParagraph(tab, "CRM Pipeline", leadName, `lead card ${leadName}`);
  await waitFor(
    tab,
    (name) => {
      const detailPanel = [...document.querySelectorAll("aside section")].find((section) =>
        [...section.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Save lead",
        ),
      );

      return Boolean(detailPanel?.querySelector("h3")?.textContent?.trim() === name);
    },
    `selected lead detail ${leadName}`,
    10000,
    leadName,
  );

  await selectUnique(
    tab.playwright.locator(`${leadUpdateForm}//select[@name="pipeline_stage"]`),
    "estimate_scheduled",
    "lead pipeline stage",
  );
  await selectUnique(
    tab.playwright.locator(`${leadUpdateForm}//select[@name="priority"]`),
    "high",
    "lead priority",
  );
  await fillUnique(
    tab.playwright.locator(`${leadUpdateForm}//textarea[@name="notes"]`),
    updatedNote,
    "lead update notes",
  );
  await waitFor(
    tab,
    (expected) => {
      const form = [...document.querySelectorAll("form")].find((candidate) =>
        [...candidate.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Save lead",
        ),
      );
      const stage = form?.querySelector('select[name="pipeline_stage"]');
      const priority = form?.querySelector('select[name="priority"]');
      const notes = form?.querySelector('textarea[name="notes"]');

      return (
        stage?.tagName === "SELECT" &&
        stage.value === "estimate_scheduled" &&
        priority?.tagName === "SELECT" &&
        priority.value === "high" &&
        notes?.tagName === "TEXTAREA" &&
        notes.value === expected.updatedNote
      );
    },
    "lead edit form values before save",
    10000,
    { updatedNote },
  );
  let updatedLead = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await activateSubmitButtonByText(tab, "Save lead", `Save lead attempt ${attempt}`);

    try {
      updatedLead = await waitForAsync(async () => {
        const lead = await findLeadByContactName(env, leadName, leadNameColumn);

        if (
          lead?.pipeline_stage === "estimate_scheduled" &&
          lead.priority === "high" &&
          lead.notes === updatedNote
        ) {
          return lead;
        }

        return null;
      }, `Supabase updated lead ${leadName}`, 12000);
      break;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }

  if (!updatedLead) {
    throw new Error("Lead update was not confirmed in Supabase.");
  }

  await waitFor(
    tab,
    () => document.body.innerText.includes("Lead updated."),
    "lead update success toast",
    12000,
  );

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await clickNav(tab, "Leads");
  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), leadName, "lead search after reload");
  await tab.playwright.waitForTimeout(500);
  await clickListRowByParagraph(
    tab,
    "CRM Pipeline",
    leadName,
    `lead card ${leadName} after reload`,
  );
  await waitFor(
    tab,
    (name) => {
      const detailPanel = [...document.querySelectorAll("aside section")].find((section) =>
        [...section.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Save lead",
        ),
      );

      return Boolean(detailPanel?.querySelector("h3")?.textContent?.trim() === name);
    },
    `selected lead detail after reload ${leadName}`,
    10000,
    leadName,
  );
  await waitFor(
    tab,
    (expected) => {
      const form = [...document.querySelectorAll("form")].find((candidate) =>
        [...candidate.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Save lead",
        ),
      );
      const stage = form?.querySelector('select[name="pipeline_stage"]');
      const priority = form?.querySelector('select[name="priority"]');
      const notes = form?.querySelector('textarea[name="notes"]');

      return (
        stage?.tagName === "SELECT" &&
        stage.value === "estimate_scheduled" &&
        priority?.tagName === "SELECT" &&
        priority.value === "high" &&
        notes?.tagName === "TEXTAREA" &&
        notes.value === expected.updatedNote
      );
    },
    "lead persisted after reload",
    30000,
    { updatedNote },
  );

  await selectUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//select[@name="company_id"]'),
    company.id,
    "duplicate lead company",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="contact_name"]'),
    leadName,
    "duplicate lead contact name",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="property_address"]'),
    leadAddress,
    "duplicate lead property address",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="phone"]'),
    leadPhone,
    "duplicate lead phone",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="email"]'),
    leadEmail,
    "duplicate lead email",
  );
  await clickSubmitUntilText(
    tab,
    "Create lead",
    "Possible duplicate lead",
    "duplicate lead protection",
  );

  return {
    leadId: createdLead.id,
    leadName,
    pipelineStage: "estimate_scheduled",
    priority: "high",
  };
}

async function testCustomersWorkflow(tab, env, company, runId) {
  const displayName = `${TEST_PREFIX} ${runId} CUSTOMER`;
  const updatedDisplayName = `${TEST_PREFIX} ${runId} CUSTOMER UPDATED`;
  const updatedContact = `${TEST_PREFIX} ${runId} CONTACT UPDATED`;
  const updatedNotes = `${TEST_PREFIX} ${runId} CUSTOMER NOTES UPDATED`;
  const updatedPhone = "(602) 555-0555";
  const updatedPhoneSearch = "6025550555";
  const updatedEmail = `customer-updated-${runId}@example.test`;
  const updatedAddress = "790 TEST Customer Profile Dr, Phoenix, AZ";
  const profileForm = 'xpath=//form[.//button[contains(normalize-space(.), "Save customer")]]';

  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Customers");
  await waitFor(
    tab,
    () => document.body.innerText.includes("Customer management"),
    "customers screen",
    15000,
  );

  await selectUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//select[@name="company_id"]'),
    company.id,
    "customer company",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="display_name"]'),
    displayName,
    "customer display name",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="contact_name"]'),
    `${TEST_PREFIX} ${runId} CUSTOMER CONTACT`,
    "customer contact",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="property_address"]'),
    "789 TEST Customer Profile Dr, Phoenix, AZ",
    "customer property address",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="phone"]'),
    "6025550444",
    "customer phone",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="email"]'),
    `customer-${runId}@example.test`,
    "customer email",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="city"]'),
    "Phoenix",
    "customer city",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="postal_code"]'),
    "85001",
    "customer ZIP",
  );
  let createdCustomer = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await clickVisibleDomSubmitByText(
      tab,
      "Create customer",
      `Create customer attempt ${attempt}`,
    );

    try {
      createdCustomer = await waitForAsync(
        () => findCustomerByDisplayName(env, displayName),
        `Supabase customer ${displayName}`,
        12000,
      );
      break;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }

  if (!createdCustomer) {
    throw new Error("Created customer was not found through Supabase.");
  }

  try {
    await waitFor(
      tab,
      (name) => document.body.innerText.includes(name),
      `created customer ${displayName}`,
      10000,
      displayName,
    );
  } catch {
    await tab.reload();
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
    await clickNav(tab, "Customers");
    await waitFor(
      tab,
      (name) => document.body.innerText.includes(name),
      `created customer ${displayName}`,
      15000,
      displayName,
    );
  }

  if (createdCustomer.company_id !== company.id) {
    throw new Error("Customer was not saved to the selected company.");
  }

  await fillUnique(
    tab.playwright.locator('[data-testid="customers-search"]'),
    displayName,
    "customers search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customers-company-filter"]'),
    company.id,
    "customers company filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customers-status-filter"]'),
    "active",
    "customers status filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customers-type-filter"]'),
    "homeowner",
    "customers type filter",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `filtered customer ${displayName}`,
    10000,
    displayName,
  );
  await clickListRowByParagraph(
    tab,
    "Customer management",
    displayName,
    `customer row ${displayName}`,
  );

  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="display_name"]`),
    updatedDisplayName,
    "updated customer display name",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="contact_name"]`),
    updatedContact,
    "updated customer contact",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="phone"]`),
    updatedPhone,
    "updated customer phone",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="email"]`),
    updatedEmail,
    "updated customer email",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="property_address"]`),
    updatedAddress,
    "updated customer address",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="city"]`),
    "Scottsdale",
    "updated customer city",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//input[@name="postal_code"]`),
    "85251",
    "updated customer ZIP",
  );
  await selectUnique(
    tab.playwright.locator(`${profileForm}//select[@name="status"]`),
    "prospect",
    "updated customer status",
  );
  await selectUnique(
    tab.playwright.locator(`${profileForm}//select[@name="customer_type"]`),
    "commercial",
    "updated customer type",
  );
  await fillUnique(
    tab.playwright.locator(`${profileForm}//textarea[@name="notes"]`),
    updatedNotes,
    "updated customer notes",
  );
  let updatedCustomer = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await clickVisibleDomSubmitByText(
      tab,
      "Save customer",
      `Save customer attempt ${attempt}`,
    );

    try {
      updatedCustomer = await waitForAsync(async () => {
        const customer = await findCustomerByDisplayName(env, updatedDisplayName);

        if (
          customer?.status === "prospect" &&
          customer.customer_type === "commercial" &&
          customer.notes === updatedNotes
        ) {
          return customer;
        }

        return null;
      }, `Supabase updated customer ${updatedDisplayName}`, 12000);
      break;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
    }
  }

  await waitFor(
    tab,
    ({ name, notes }) => {
      const profileForm = [...document.querySelectorAll("form")].find((form) =>
        [...form.querySelectorAll("button")]
          .some((button) => button.textContent?.trim().includes("Save customer")),
      );
      const displayNameInput = profileForm?.querySelector('input[name="display_name"]');
      const notesTextarea = profileForm?.querySelector('textarea[name="notes"]');
      const text = document.body.innerText;

      return (
        text.includes(name) &&
        displayNameInput?.tagName === "INPUT" &&
        displayNameInput.value === name &&
        notesTextarea?.tagName === "TEXTAREA" &&
        notesTextarea.value === notes
      );
    },
    "updated customer profile",
    30000,
    { name: updatedDisplayName, notes: updatedNotes },
  );

  if (updatedCustomer.status !== "prospect") {
    throw new Error(`Updated customer status was ${updatedCustomer.status}.`);
  }

  if (updatedCustomer.customer_type !== "commercial") {
    throw new Error(`Updated customer type was ${updatedCustomer.customer_type}.`);
  }

  if (updatedCustomer.notes !== updatedNotes) {
    throw new Error("Updated customer notes did not persist.");
  }

  await fillUnique(
    tab.playwright.locator('[data-testid="customers-search"]'),
    updatedPhoneSearch,
    "customers phone search",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `phone search customer ${updatedDisplayName}`,
    10000,
    updatedDisplayName,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="customers-search"]'),
    "85251",
    "customers ZIP search",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `ZIP search customer ${updatedDisplayName}`,
    10000,
    updatedDisplayName,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="customers-search"]'),
    "Scottsdale",
    "customers city search",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `city search customer ${updatedDisplayName}`,
    10000,
    updatedDisplayName,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="customers-search"]'),
    "Customer Profile Dr",
    "customers partial address search",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `partial address search customer ${updatedDisplayName}`,
    10000,
    updatedDisplayName,
  );

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="customer-workspace"]');
      const header = workspace?.querySelector('[data-testid="customer-360-header"]');
      const quickActions = workspace?.querySelector('[data-testid="customer-quick-actions"]');
      const workspaceText = workspace?.textContent ?? "";
      const headerText = header?.textContent ?? "";
      const quickActionText = quickActions?.textContent ?? "";

      return (
        headerText.includes("Customer 360 workspace") &&
        headerText.includes("Lifetime revenue") &&
        headerText.includes("Customer since") &&
        headerText.includes("Last communication") &&
        workspaceText.includes("Properties") &&
        workspaceText.includes("Warranty") &&
        workspaceText.includes("Maintenance") &&
        workspaceText.includes("Financial") &&
        workspaceText.includes("Assigned salesperson") &&
        workspaceText.includes("Tags") &&
        workspaceText.includes("Internal notes") &&
        workspaceText.includes("Open Estimates") &&
        workspaceText.includes("Scheduled Jobs") &&
        workspaceText.includes("Upcoming Inspections") &&
        workspaceText.includes("Outstanding Invoices") &&
        workspaceText.includes("Recent Communications") &&
        workspaceText.includes("Integration Status") &&
        workspaceText.includes("Twilio") &&
        workspaceText.includes("Gmail") &&
        workspaceText.includes("GoHighLevel") &&
        workspaceText.includes("Website Lead Capture") &&
        workspaceText.includes("Yelp") &&
        quickActionText.includes("New Estimate") &&
        quickActionText.includes("Schedule Inspection") &&
        quickActionText.includes("Schedule Job") &&
        quickActionText.includes("Send SMS") &&
        quickActionText.includes("Compose Email") &&
        quickActionText.includes("Add Internal Note") &&
        quickActionText.includes("Upload Photos") &&
        quickActionText.includes("Upload Documents") &&
        quickActionText.includes("Create Invoice") &&
        quickActionText.includes("Create Change Order") &&
        quickActionText.includes("Open Calendar") &&
        workspaceText.includes("Communications")
      );
    },
    "customer 360 workspace sections and quick actions",
    10000,
  );
  await clickCustomerWorkspaceTab(tab, "Properties");
  await waitFor(
    tab,
    (address) => {
      const propertySection = document.querySelector('[data-testid="customer-properties-section"]');

      return Boolean(
        propertySection?.textContent?.includes("Primary service property") &&
          propertySection.textContent.includes(address) &&
          propertySection.textContent.includes("Roof system") &&
          propertySection.textContent.includes("Exterior paint colors") &&
          propertySection.textContent.includes("Gate codes") &&
          propertySection.textContent.includes("Inspection history"),
      );
    },
    "customer properties workspace section",
    10000,
    updatedAddress,
  );
  await clickCustomerWorkspaceTab(tab, "Activity");
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Activity timeline") &&
      document.body.innerText.includes("Internal note") &&
      document.body.innerText.includes("Customer created"),
    "customer activity timeline",
    10000,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-timeline-filter"]'),
    "note",
    "customer timeline note filter",
  );
  await waitFor(
    tab,
    (notes) =>
      document.body.innerText.includes("Internal note") &&
      document.body.innerText.includes(notes),
    "customer filtered note timeline",
    10000,
    updatedNotes,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-timeline-filter"]'),
    "all",
    "customer timeline all filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-timeline-filter"]'),
    "change_order",
    "customer timeline change order filter",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("No activity matches this filter."),
    "customer filtered change order empty timeline",
    10000,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-timeline-filter"]'),
    "all",
    "customer timeline all filter after change order",
  );
  await clickCustomerWorkspaceTab(tab, "Change Orders");
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Change Orders") &&
      document.body.innerText.includes("No change orders linked yet."),
    "customer change orders workspace section",
    10000,
  );
  await clickCustomerWorkspaceTab(tab, "Warranty");
  await waitFor(
    tab,
    () => document.body.innerText.includes("Warranty tracking is ready"),
    "customer warranty placeholder",
    10000,
  );
  await clickCustomerWorkspaceTab(tab, "Maintenance");
  await waitFor(
    tab,
    () => document.body.innerText.includes("Maintenance plans are prepared"),
    "customer maintenance placeholder",
    10000,
  );
  await clickCustomerWorkspaceTab(tab, "Communications");
  await waitFor(
    tab,
    () => {
      const section = document.querySelector('[data-testid="customer-communications-section"]');
      const text = section?.textContent ?? "";

      return (
        text.includes("Communications") &&
        text.includes("Open Hub") &&
        text.includes("Internal records stay staff-facing") &&
        text.includes("Latest SMS") &&
        text.includes("Latest call") &&
        text.includes("Missed calls") &&
        text.includes("Unread messages") &&
        text.includes("Live Twilio SMS/call routing is setup-required")
      );
    },
    "customer communications workspace section",
    10000,
  );
  await clickCustomerWorkspaceTab(tab, "Notes");
  await waitFor(
    tab,
    (notes) => document.body.innerText.includes(notes),
    "customer notes workspace section",
    10000,
    updatedNotes,
  );
  await clickUnique(
    tab.playwright.locator('xpath=//*[@data-testid="customer-workspace"]//button[contains(normalize-space(.), "Add Internal Note")]'),
    "customer add note quick action",
  );
  await waitFor(
    tab,
    () => document.activeElement?.getAttribute("name") === "notes",
    "customer add note focuses notes field",
    10000,
  );

  await fillUnique(
    tab.playwright.locator('[data-testid="customers-search"]'),
    "",
    "clear customers search before duplicate test",
  );
  await selectUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//select[@name="company_id"]'),
    company.id,
    "duplicate customer company",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="display_name"]'),
    `${displayName} DUPLICATE`,
    "duplicate customer display name",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="contact_name"]'),
    updatedContact,
    "duplicate customer contact",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="property_address"]'),
    updatedAddress,
    "duplicate customer property address",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="phone"]'),
    updatedPhone,
    "duplicate customer phone",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New customer"]/ancestor::section[1]//input[@name="email"]'),
    updatedEmail,
    "duplicate customer email",
  );
  await clickSubmitUntilText(
    tab,
    "Create customer",
    "Possible duplicate customer",
    "duplicate customer protection",
  );

  return {
    customerId: updatedCustomer.id,
    companyId: updatedCustomer.company_id,
    status: updatedCustomer.status,
    customerType: updatedCustomer.customer_type,
  };
}

async function testUnifiedInboxSearchAndFilters(tab, leadWorkflow) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Inbox");
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes("communications hub") &&
        text.includes("lead and communication activity") &&
        text.includes("twilio") &&
        text.includes("gmail") &&
        text.includes("google calendar") &&
        text.includes("google business profile") &&
        text.includes("yelp") &&
        text.includes("gohighlevel") &&
        text.includes("sync health") &&
        text.includes("last sync") &&
        text.includes("last activity") &&
        text.includes("error state") &&
        text.includes("twilio live setup required") &&
        text.includes("no outbound sms or calls") &&
        text.includes("weathertech roofing llc - phoenix") &&
        text.includes("weathertech roofing llc - tucson") &&
        text.includes("ihc painting - ihc")
      );
    },
    "unified inbox",
    15000,
  );

  await fillUnique(
    tab.playwright.locator('[data-testid="inbox-search"]'),
    leadWorkflow.leadName,
    "inbox search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="inbox-kind-filter"]'),
    "Lead",
    "inbox activity type filter",
  );
  await clickUnique(
    tab.playwright.locator(
      'xpath=//div[@aria-label="Communication channels"]//button[contains(normalize-space(.), "Website")]',
    ),
    "Website inbox source filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="inbox-attention-filter"]'),
    "unassigned",
    "inbox unassigned state filter",
  );
  await waitFor(
    tab,
    (leadName) => {
      const text = document.body.innerText.toLowerCase();
      const normalizedLeadName = leadName.toLowerCase();

      return (
        text.includes(normalizedLeadName) &&
        text.includes("website") &&
        text.includes("lead") &&
        text.includes("unassigned")
      );
    },
    "filtered inbox lead",
    10000,
    leadWorkflow.leadName,
  );
  await waitFor(
    tab,
    (leadName) => {
      const detail = document.querySelector('[data-testid="communication-detail"]');
      const text = detail?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("conversation detail") &&
        text.includes("source") &&
        text.includes("participants") &&
        text.includes("attachments") &&
        text.includes("related records") &&
        text.includes("supported actions") &&
        text.includes("no outbound call") &&
        text.includes(leadName.toLowerCase())
      );
    },
    "communication detail panel",
    10000,
    leadWorkflow.leadName,
  );
  await clickUnique(tab.playwright.getByRole("button", { name: "Clear" }), "Clear inbox filters");
  await waitFor(
    tab,
    () => {
      const search = document.querySelector('[data-testid="inbox-search"]');
      const kind = document.querySelector('[data-testid="inbox-kind-filter"]');
      const attention = document.querySelector('[data-testid="inbox-attention-filter"]');

      return (
        document.body.innerText.includes("Recent activity") &&
        search?.tagName === "INPUT" &&
        search.value === "" &&
        kind?.tagName === "SELECT" &&
        kind.value === "all" &&
        attention?.tagName === "SELECT" &&
        attention.value === "all"
      );
    },
    "cleared inbox filters",
    10000,
  );

  return {
    search: "passed",
    kindFilter: "Lead",
    providerFilter: "Website",
    detailPanel: "passed",
  };
}

async function testUnifiedLeadIntake(tab, env, companies, runId, baseUrl, leadNameColumn, progress) {
  const websiteExternalId = `${TEST_PREFIX} ${runId} WEBSITE EXT`;
  const websiteLeadName = `${TEST_PREFIX} ${runId} WEBSITE INTAKE`;
  const yelpExternalId = `${TEST_PREFIX} ${runId} YELP EXT`;
  const yelpLeadName = `${TEST_PREFIX} ${runId} YELP INTAKE`;
  const retryExternalId = `${TEST_PREFIX} ${runId} RETRY EXT`;
  const retryLeadName = `${TEST_PREFIX} ${runId} RETRY INTAKE`;
  const submittedAt = new Date().toISOString();

  progress("lead-intake:invalid-json:start");
  for (const path of ["/api/leads/website", "/api/leads/yelp"]) {
    const invalidJson = await postAppRaw(baseUrl, path, "{");

    if (invalidJson.status !== 400 || invalidJson.body?.status !== "invalid_json") {
      throw new Error(
        `${path} invalid JSON status was ${invalidJson.status} ${JSON.stringify(invalidJson.body)}`,
      );
    }
  }
  progress("lead-intake:invalid-json:done");

  progress("lead-intake:yelp:request-guards:start");
  const unsupportedYelpContentType = await fetch(new URL("/api/leads/yelp", baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "text/plain",
    },
    body: "not-json",
  });
  const unsupportedYelpBody = await unsupportedYelpContentType.json();

  if (
    unsupportedYelpContentType.status !== 415 ||
    unsupportedYelpBody?.status !== "unsupported_content_type"
  ) {
    throw new Error(
      `Yelp unsupported content type was ${unsupportedYelpContentType.status} ${JSON.stringify(unsupportedYelpBody)}`,
    );
  }

  const oversizedYelp = await postAppJson(baseUrl, "/api/leads/yelp", {
    yelpAccountKey: "ihc",
    name: `${TEST_PREFIX} ${runId} OVERSIZED YELP`,
    message: "x".repeat(33000),
  });

  if (oversizedYelp.status !== 413 || oversizedYelp.body?.status !== "payload_too_large") {
    throw new Error(
      `Yelp oversized payload was ${oversizedYelp.status} ${JSON.stringify(oversizedYelp.body)}`,
    );
  }
  progress("lead-intake:yelp:request-guards:done");

  progress("lead-intake:website:dry-run:start");
  const websitePayload = {
    sourceId: "weathertech-phoenix",
    formIdentifier: "weathertech-phoenix-contact",
    websiteUrl: "https://weathertechroofingaz.com/test-intake",
    source: "Website",
    utmSource: "test-suite",
    utmMedium: "form",
    utmCampaign: `${TEST_PREFIX} ${runId} CAMPAIGN`,
    externalLeadId: websiteExternalId,
    submittedAt,
    name: websiteLeadName,
    phone: "6025550111",
    email: `website-${runId}@example.test`,
    address: "111 TEST Website Intake Way, Phoenix, AZ",
    location: "Phoenix",
    serviceType: "roofing",
    message: `${TEST_PREFIX} ${runId} website intake message`,
  };
  const websiteDryRun = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", websitePayload);

  if (websiteDryRun.status !== 200 || !websiteDryRun.body?.ok || websiteDryRun.body.status !== "dry_run") {
    throw new Error(`Website dry run failed: ${websiteDryRun.status} ${JSON.stringify(websiteDryRun.body)}`);
  }

  if (websiteDryRun.body.routing?.company !== "weathertech_roofing") {
    throw new Error("Website dry run did not route to WeatherTech Roofing LLC.");
  }

  if (websiteDryRun.body.routing?.branch !== "weathertech_phoenix") {
    throw new Error(`Website dry run branch was ${websiteDryRun.body.routing?.branch}.`);
  }

  if (websiteDryRun.body.source?.key !== "weathertech-phoenix") {
    throw new Error(`Website dry run source was ${JSON.stringify(websiteDryRun.body.source)}.`);
  }

  const tucsonDryRun = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", {
    ...websitePayload,
    sourceId: "weathertech-tucson",
    formIdentifier: "weathertech-tucson-contact",
    externalLeadId: `${websiteExternalId} TUCSON`,
    name: `${websiteLeadName} TUCSON`,
    location: "Tucson",
    phone: "5205550111",
    email: `website-tucson-${runId}@example.test`,
  });

  if (tucsonDryRun.status !== 200 || tucsonDryRun.body?.routing?.branch !== "weathertech_tucson") {
    throw new Error(`Tucson website dry run failed: ${tucsonDryRun.status} ${JSON.stringify(tucsonDryRun.body)}`);
  }

  const ihcDryRun = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", {
    ...websitePayload,
    sourceId: "ihc",
    formIdentifier: "ihc-contact",
    externalLeadId: `${websiteExternalId} IHC`,
    name: `${websiteLeadName} IHC`,
    location: "Tempe",
    serviceType: "painting",
    phone: "6025550112",
    email: `website-ihc-${runId}@example.test`,
  });

  if (ihcDryRun.status !== 200 || ihcDryRun.body?.routing?.company !== "ihc_painting") {
    throw new Error(`IHC website dry run failed: ${ihcDryRun.status} ${JSON.stringify(ihcDryRun.body)}`);
  }

  const unknownDryRun = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", {
    ...websitePayload,
    sourceId: "unknown-website-source",
    formIdentifier: "unknown-form",
    websiteUrl: "https://unknown.example/form",
    externalLeadId: `${websiteExternalId} UNKNOWN`,
    name: `${websiteLeadName} UNKNOWN`,
  });

  if (unknownDryRun.status !== 200 || unknownDryRun.body?.routing?.company !== "unassigned") {
    throw new Error(`Unknown website source was not unassigned: ${unknownDryRun.status} ${JSON.stringify(unknownDryRun.body)}`);
  }

  const unsignedWebsite = await postAppJson(baseUrl, "/api/leads/website", websitePayload);

  if (
    ![401, 503].includes(unsignedWebsite.status) ||
    !["missing_signature", "verification_required"].includes(String(unsignedWebsite.body?.status))
  ) {
    throw new Error(`Unsigned website intake was not safely rejected: ${unsignedWebsite.status} ${JSON.stringify(unsignedWebsite.body)}`);
  }
  progress("lead-intake:website:dry-run:done");

  progress("lead-intake:yelp:dry-run:start");
  const yelpPayload = {
    yelpAccountKey: "ihc",
    source: "Yelp",
    yelpBusinessId: "ihc",
    yelpConversationId: `${TEST_PREFIX} ${runId} YELP CONVERSATION`,
    yelpLeadId: yelpExternalId,
    submittedAt,
    name: yelpLeadName,
    phone: "6025550222",
    email: `yelp-${runId}@example.test`,
    location: "Tempe",
    serviceType: "painting",
    message: `${TEST_PREFIX} ${runId} Yelp intake message`,
  };
  const yelpPhoenixDryRun = await postAppJson(baseUrl, "/api/leads/yelp?dryRun=1", {
    ...yelpPayload,
    yelpAccountKey: "weathertech-phoenix",
    yelpBusinessId: "weathertech-phoenix",
    yelpLeadId: `${yelpExternalId} PHOENIX`,
    yelpConversationId: `${TEST_PREFIX} ${runId} YELP PHOENIX CONVERSATION`,
    name: `${yelpLeadName} PHOENIX`,
    phone: "6025550220",
    email: `yelp-phoenix-${runId}@example.test`,
    location: "Phoenix",
    serviceType: "roofing",
  });

  if (
    yelpPhoenixDryRun.status !== 200 ||
    yelpPhoenixDryRun.body?.routing?.company !== "weathertech_roofing" ||
    yelpPhoenixDryRun.body?.routing?.branch !== "weathertech_phoenix"
  ) {
    throw new Error(`Phoenix Yelp dry run failed: ${yelpPhoenixDryRun.status} ${JSON.stringify(yelpPhoenixDryRun.body)}`);
  }

  const yelpTucsonDryRun = await postAppJson(baseUrl, "/api/leads/yelp?dryRun=1", {
    ...yelpPayload,
    yelpAccountKey: "weathertech-tucson",
    yelpBusinessId: "weathertech-tucson",
    yelpLeadId: `${yelpExternalId} TUCSON`,
    yelpConversationId: `${TEST_PREFIX} ${runId} YELP TUCSON CONVERSATION`,
    name: `${yelpLeadName} TUCSON`,
    phone: "5205550220",
    email: `yelp-tucson-${runId}@example.test`,
    location: "Tucson",
    serviceType: "roofing",
  });

  if (yelpTucsonDryRun.status !== 200 || yelpTucsonDryRun.body?.routing?.branch !== "weathertech_tucson") {
    throw new Error(`Tucson Yelp dry run failed: ${yelpTucsonDryRun.status} ${JSON.stringify(yelpTucsonDryRun.body)}`);
  }

  const yelpIhcDryRun = await postAppJson(baseUrl, "/api/leads/yelp?dryRun=1", yelpPayload);

  if (yelpIhcDryRun.status !== 200 || yelpIhcDryRun.body?.routing?.company !== "ihc_painting") {
    throw new Error(`IHC Yelp dry run failed: ${yelpIhcDryRun.status} ${JSON.stringify(yelpIhcDryRun.body)}`);
  }

  const unknownYelpDryRun = await postAppJson(baseUrl, "/api/leads/yelp?dryRun=1", {
    ...yelpPayload,
    yelpAccountKey: "unknown-yelp-account",
    yelpBusinessId: "unknown-yelp-account",
    yelpLeadId: `${yelpExternalId} UNKNOWN`,
    yelpConversationId: `${TEST_PREFIX} ${runId} YELP UNKNOWN CONVERSATION`,
    name: `${yelpLeadName} UNKNOWN`,
    serviceType: "roofing",
  });

  if (unknownYelpDryRun.status !== 200 || unknownYelpDryRun.body?.routing?.company !== "unassigned") {
    throw new Error(`Unknown Yelp account was not unassigned: ${unknownYelpDryRun.status} ${JSON.stringify(unknownYelpDryRun.body)}`);
  }

  const unsignedYelp = await postAppJson(baseUrl, "/api/leads/yelp", yelpPayload);

  if (
    ![401, 503].includes(unsignedYelp.status) ||
    !["missing_signature", "verification_required"].includes(String(unsignedYelp.body?.status))
  ) {
    throw new Error(`Unsigned Yelp intake was not safely rejected: ${unsignedYelp.status} ${JSON.stringify(unsignedYelp.body)}`);
  }
  progress("lead-intake:yelp:dry-run:done");

  progress("lead-intake:yelp:create:start");
  const yelpSensitiveValues = [
    yelpLeadName,
    yelpPayload.phone,
    yelpPayload.email,
    yelpPayload.message,
  ];
  const yelpReadinessResponse = await fetch(new URL("/api/leads/yelp", baseUrl));
  const yelpReadiness = await yelpReadinessResponse.json();
  const yelpSigningSecret =
    getRuntimeEnvValue("YELP_LEAD_CAPTURE_SECRET") ?? env.YELP_LEAD_CAPTURE_SECRET;
  let yelpCreate = null;
  let yelpLeadRecordId = null;
  let yelpCreateMode = "seeded";

  if (
    yelpSigningSecret &&
    Number(yelpReadiness?.readiness?.configuredVerificationCount ?? 0) > 0
  ) {
    const yelpSignatureTimestamp = new Date().toISOString();
    const yelpRawBody = JSON.stringify(yelpPayload);
    const yelpSignature = createProviderHmacSignature(
      yelpRawBody,
      yelpSignatureTimestamp,
      yelpSigningSecret,
    );

    yelpCreate = await postAppJson(baseUrl, "/api/leads/yelp", yelpPayload, {
      "x-weathertech-timestamp": yelpSignatureTimestamp,
      "x-weathertech-signature": `sha256=${yelpSignature}`,
    });

    if (yelpCreate.status !== 201 || !yelpCreate.body?.ok) {
      throw new Error(`Yelp intake create failed: ${yelpCreate.status} ${JSON.stringify(yelpCreate.body)}`);
    }

    yelpLeadRecordId = yelpCreate.body.leadId;
    yelpCreateMode = "signed_endpoint";
  } else {
    const yelpSeedBase = {
      company_id: companies.ihc.id,
      [leadNameColumn]: yelpLeadName,
      phone: yelpPayload.phone,
      email: yelpPayload.email,
      property_address: "222 TEST Yelp Intake Way, Tempe, AZ",
      status: "new",
      pipeline_stage: "new_lead",
      priority: "normal",
      estimated_value: 0,
      next_follow_up: null,
      notes: `${TEST_PREFIX} ${runId} seeded Yelp source badge record. Endpoint live create skipped because Yelp signing secret is not configured in the local server.`,
    };
    const yelpSeedPayloads = [
      {
        ...yelpSeedBase,
        source: "Yelp",
      },
      {
        ...yelpSeedBase,
        lead_source: "Yelp",
        service_needed: "painting",
      },
    ];
    let seededYelpLead = null;
    let lastSeedError = null;

    for (const payload of yelpSeedPayloads) {
      try {
        [seededYelpLead] = await restRequest(env, "leads", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(payload),
        });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastSeedError = error;

        if (
          message.includes("Could not find") ||
          message.includes("does not exist") ||
          message.includes("schema cache")
        ) {
          continue;
        }

        throw error;
      }
    }

    if (!seededYelpLead) {
      throw lastSeedError ?? new Error("Unable to seed Yelp UI regression lead.");
    }

    yelpLeadRecordId = seededYelpLead.id;
  }

  const yelpLeads = await findLeadsByContactName(env, yelpLeadName, leadNameColumn);

  if (yelpLeads.length !== 1) {
    throw new Error(`Yelp intake created ${yelpLeads.length} matching leads, expected 1.`);
  }

  const yelpLead = yelpLeads[0];

  if (yelpLead.company_id !== companies.ihc.id) {
    throw new Error("Yelp intake did not route to IHC Painting.");
  }

  if (!getLeadRowSource(yelpLead).toLowerCase().includes("yelp")) {
    throw new Error(`Yelp lead source was ${getLeadRowSource(yelpLead)}.`);
  }

  if (
    yelpCreateMode === "signed_endpoint" &&
    !getLeadRowServiceType(yelpLead).toLowerCase().includes("paint")
  ) {
    throw new Error(`Yelp service type was ${getLeadRowServiceType(yelpLead)}.`);
  }

  if (yelpCreateMode === "signed_endpoint") {
    const yelpLogs = await findIntegrationLogsByExternalId(env, "yelp", yelpExternalId);

    if (!yelpLogs.some((log) => log.status === "succeeded")) {
      throw new Error("Yelp intake did not write a succeeded sync log.");
    }

    for (const log of yelpLogs) {
      assertNoSensitiveRequestSummary(log, yelpSensitiveValues, "Yelp intake");
    }
  }
  progress("lead-intake:yelp:create:done");

  progress("lead-intake:retry:start");
  const retryPayload = {
    provider: "website",
    business: "WeatherTech",
    source: "Website",
    contactName: retryLeadName,
    phone: "6025550333",
    email: `retry-${runId}@example.test`,
    propertyAddress: "333 TEST Retry Intake Way, Phoenix, AZ",
    location: "Phoenix",
    serviceType: "roofing",
    message: `${TEST_PREFIX} ${runId} retry intake message`,
    externalLeadId: retryExternalId,
    submittedAt,
    sourceAccount: "https://weathertechroofingaz.com/test-retry",
    websiteUrl: "https://weathertechroofingaz.com/test-retry",
    yelpBusinessId: null,
    yelpConversationId: null,
    yelpLeadId: null,
    utmSource: "test-suite",
    utmCampaign: `${TEST_PREFIX} ${runId} RETRY CAMPAIGN`,
    utmMedium: "retry",
  };
  const [failedLog] = await restRequest(env, "integration_sync_logs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      provider: "website",
      direction: "provider_to_weathertech",
      event_type: "website.lead.created",
      status: "failed",
      related_table: "leads",
      related_record_id: null,
      external_id: retryExternalId,
      attempt_count: 1,
      max_attempts: 3,
      request_fingerprint: `test-${runId}-retry`,
      request_summary: {
        provider: "website",
        testRunId: runId,
        retry: {
          encrypted: true,
          payloadVersion: 1,
        },
        retryPayloadEncrypted: buildEncryptedLeadIntakeRetryPayload(env, retryPayload),
      },
      response_summary: {
        testSeed: true,
      },
      error_code: "test_seed_failure",
      error_message: "TEST seeded failed intake log.",
    }),
  });
  assertNoSensitiveRequestSummary(
    failedLog,
    [
      retryLeadName,
      retryPayload.phone,
      retryPayload.email,
      retryPayload.propertyAddress,
      retryPayload.message,
    ],
    "Retry seed",
  );

  const retryResponse = await postAppJson(baseUrl, "/api/leads/intake/retry", {
    syncLogId: failedLog.id,
  });

  if (retryResponse.status !== 201 || !retryResponse.body?.ok) {
    throw new Error(`Lead intake retry failed: ${retryResponse.status} ${JSON.stringify(retryResponse.body)}`);
  }

  const retryLead = await findLeadByContactName(env, retryLeadName, leadNameColumn);

  if (!retryLead) {
    throw new Error("Lead intake retry did not create a CRM lead.");
  }

  const [updatedRetryLog] = await restRequest(
    env,
    `integration_sync_logs?select=*&id=eq.${encodeURIComponent(failedLog.id)}`,
  );

  if (updatedRetryLog.status !== "succeeded") {
    throw new Error(`Retry log status was ${updatedRetryLog.status}.`);
  }

  if (updatedRetryLog.related_record_id !== retryLead.id) {
    throw new Error("Retry log was not associated with the retried lead.");
  }
  progress("lead-intake:retry:done");

  progress("lead-intake:ui:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, baseUrl, progress);
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Inbox");
  await waitFor(
    tab,
    ({ websiteName, yelpName }) => {
      const text = document.body.innerText;

      return (
        text.includes(websiteName) &&
        text.includes(yelpName) &&
        text.includes("Website") &&
        text.includes("Yelp")
      );
    },
    "Website and Yelp intake records in Inbox",
    15000,
    { websiteName: retryLeadName, yelpName: yelpLeadName },
  );
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes("lead intake & routing engine") &&
        text.includes("manual crm entry") &&
        text.includes("website forms") &&
        text.includes("weathertech phoenix website") &&
        text.includes("weathertech tucson website") &&
        text.includes("ihc website") &&
        text.includes("suspicious submission") &&
        text.includes("weathertech phoenix yelp") &&
        text.includes("weathertech tucson yelp") &&
        text.includes("ihc yelp") &&
        text.includes("unassigned yelp account") &&
        text.includes("yelp") &&
        text.includes("twilio calls") &&
        text.includes("twilio sms") &&
        text.includes("gohighlevel") &&
        text.includes("weathertech roofing llc - phoenix") &&
        text.includes("weathertech roofing llc - tucson") &&
        text.includes("ihc painting") &&
        text.includes("unassigned review queue") &&
        text.includes("auto-merge is disabled")
      );
    },
    "Unified lead intake routing engine panel",
    15000,
  );

  await clickNav(tab, "Leads");
  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), retryLeadName, "website lead search");
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name) && document.body.innerText.includes("Website"),
    "Website source badge in Leads",
    15000,
    retryLeadName,
  );
  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), yelpLeadName, "Yelp lead search");
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name) && document.body.innerText.includes("Yelp"),
    "Yelp source badge in Leads",
    15000,
    yelpLeadName,
  );
  progress("lead-intake:ui:done");

  return {
    websiteDryRunRouting: websiteDryRun.body.routing,
    tucsonDryRunRouting: tucsonDryRun.body.routing,
    ihcDryRunRouting: ihcDryRun.body.routing,
    unknownDryRunRouting: unknownDryRun.body.routing,
    unsignedWebsiteStatus: unsignedWebsite.body.status,
    yelpPhoenixDryRunRouting: yelpPhoenixDryRun.body.routing,
    yelpTucsonDryRunRouting: yelpTucsonDryRun.body.routing,
    yelpIhcDryRunRouting: yelpIhcDryRun.body.routing,
    unknownYelpDryRunRouting: unknownYelpDryRun.body.routing,
    unsignedYelpStatus: unsignedYelp.body.status,
    yelpCreateMode,
    yelpLeadId: yelpLeadRecordId,
    retryLeadId: retryLead.id,
    retryLogId: failedLog.id,
  };
}

async function testEstimatesWorkflow(tab, env, company, lead, runId) {
  const estimateTitle = `${TEST_PREFIX} ${runId} ESTIMATE`;
  const scopeText = `${TEST_PREFIX} ${runId} estimate scope`;

  let estimatesOpened = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await clickNav(tab, "Estimates");
    estimatesOpened = Boolean(
      await waitFor(
        tab,
        () => {
          const text = document.body.innerText;
          return (
            text.includes("Estimate Builder") ||
            text.includes("Create draft estimate") ||
            text.includes("Edit estimate")
          );
        },
        "estimates screen",
        15000,
      ).catch(() => false),
    );

    if (estimatesOpened) {
      break;
    }

    await tab.playwright.waitForTimeout(1000);
  }

  if (!estimatesOpened) {
    throw new Error("Timed out waiting for estimates screen.");
  }

  const newEstimateButton = tab.playwright.locator(
    'xpath=//section[@id="estimate-builder"]//button[normalize-space(.)="New Estimate"]',
  );
  if ((await newEstimateButton.count()) === 1) {
    await clickUnique(newEstimateButton, "New Estimate", { retryTransientClick: true });
  }
  await waitFor(
    tab,
    () => {
      const builder = document.querySelector("#estimate-builder");

      return Boolean(
        builder?.textContent?.includes("Create draft estimate") &&
          [...builder.querySelectorAll('button[type="submit"]')].some(
            (button) => button.textContent?.trim() === "Create estimate",
          ),
      );
    },
    "estimate editor create mode",
    15000,
  );

  await selectUnique(
    tab.playwright.locator('#estimate-builder select[name="company_id"]'),
    company.id,
    "estimate company",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder input[name="title"]'),
    estimateTitle,
    "estimate title",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder input[name="business"]'),
    company.name,
    "estimate business",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder input[name="location"]'),
    "456 TEST Regression Lead Ave, Phoenix, AZ",
    "estimate location",
  );
  await selectUnique(
    tab.playwright.locator('#estimate-builder select[name="lead_id"]'),
    lead.leadId,
    "estimate lead association",
  );
  await selectUnique(
    tab.playwright.locator('#estimate-builder select[name="service_type"]'),
    "roofing",
    "estimate service type",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Item name"])[1]'),
    `${TEST_PREFIX} ${runId} LABOR`,
    "estimate labor item",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Qty"])[1]'),
    "2",
    "estimate labor quantity",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Unit"])[1]'),
    "hour",
    "estimate labor unit",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Price"])[1]'),
    "150",
    "estimate labor price",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Item name"])[2]'),
    `${TEST_PREFIX} ${runId} MATERIAL`,
    "estimate material item",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Price"])[2]'),
    "90",
    "estimate material price",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder textarea[name="scope_of_work"]'),
    scopeText,
    "estimate scope",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder textarea[name="notes"]'),
    `${TEST_PREFIX} ${runId} estimate notes`,
    "estimate notes",
  );
  await clickVisibleDomSubmitByText(tab, "Create estimate", "Create estimate");
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `draft estimate ${estimateTitle}`,
    15000,
    estimateTitle,
  );

  const savedEstimate = await findEstimateByTitle(env, estimateTitle);

  if (!savedEstimate) {
    throw new Error("Created estimate was not found through Supabase.");
  }

  if (savedEstimate.status !== "draft") {
    throw new Error(`Saved estimate status was ${savedEstimate.status}.`);
  }

  if (savedEstimate.lead_id !== lead.leadId) {
    throw new Error("Saved estimate was not associated with the test lead.");
  }

  const lineItemCount = await countEstimateLineItems(env, savedEstimate.id);

  if (lineItemCount < 2) {
    throw new Error(`Expected at least 2 estimate line items, found ${lineItemCount}.`);
  }

  return {
    estimateId: savedEstimate.id,
    estimateTitle,
    status: savedEstimate.status,
    lineItemCount,
    total: savedEstimate.total,
  };
}

async function testQuickActionsDoNotOverlap(browser, tab) {
  const viewport = await browser.capabilities.get("viewport");
  await viewport.set(LAPTOP_VIEWPORT);
  await clickNav(tab, "Dashboard");
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");

  const overlaps = await tab.playwright.evaluate(() => {
    const buttons = [...document.querySelectorAll("main button")]
      .filter((button) => !button.closest("nav"))
      .filter((button) => ["Leads", "Estimates", "Calendar", "Documents"].includes(button.innerText.trim()))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        return {
          label: button.innerText.trim(),
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);

    const collisions = [];

    for (let index = 0; index < buttons.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < buttons.length; otherIndex += 1) {
        const a = buttons[index];
        const b = buttons[otherIndex];
        const overlap =
          a.left < b.right - 1 &&
          a.right > b.left + 1 &&
          a.top < b.bottom - 1 &&
          a.bottom > b.top + 1;

        if (overlap) {
          collisions.push([a, b]);
        }
      }
    }

    return { checked: buttons.length, collisions };
  });
  const commandCenterOverlaps = await tab.playwright.evaluate(() => {
    const quickActionLabels = [
      "New Lead",
      "New Customer",
      "New Estimate",
      "Schedule Inspection",
      "Schedule Job",
      "Compose Email",
      "Send SMS",
      "Create Invoice",
      "Create Change Order",
      "Upload Photos",
      "Upload Documents",
    ];
    const buttons = [...document.querySelectorAll('[data-testid="crm-operations-dashboard"] button')]
      .filter((button) => quickActionLabels.some((label) => button.innerText.includes(label)))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const label = quickActionLabels.find((candidate) => button.innerText.includes(candidate)) ?? button.innerText.trim();

        return {
          label,
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((rect) => rect.width > 0 && rect.height > 0);
    const collisions = [];

    for (let index = 0; index < buttons.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < buttons.length; otherIndex += 1) {
        const a = buttons[index];
        const b = buttons[otherIndex];
        const overlap =
          a.left < b.right - 1 &&
          a.right > b.left + 1 &&
          a.top < b.bottom - 1 &&
          a.bottom > b.top + 1;

        if (overlap) {
          collisions.push([a, b]);
        }
      }
    }

    return { checked: buttons.length, collisions };
  });

  if (overlaps.checked < 4) {
    throw new Error(`Expected at least 4 dashboard quick-action buttons, checked ${overlaps.checked}.`);
  }

  if (overlaps.collisions.length) {
    throw new Error(`Found ${overlaps.collisions.length} overlapping quick-action button pairs.`);
  }

  if (commandCenterOverlaps.checked < 11) {
    throw new Error(`Expected 11 CRM operations quick-action buttons, checked ${commandCenterOverlaps.checked}.`);
  }

  if (commandCenterOverlaps.collisions.length) {
    throw new Error(`Found ${commandCenterOverlaps.collisions.length} overlapping CRM operations quick-action button pairs.`);
  }

  await viewport.set({ width: 390, height: 844 });
  await tab.playwright.waitForTimeout(500);
  const mobileLayout = await tab.playwright.evaluate(() => {
    const commandCenter = document.querySelector('[data-testid="crm-operations-dashboard"]');
    const findHeading = (text) =>
      [...document.querySelectorAll("h3")].find(
        (heading) => heading.textContent?.trim() === text,
      );
    const prioritiesRect = findHeading("Owner priorities")?.getBoundingClientRect() ?? null;
    const todayRect = findHeading("Today")?.getBoundingClientRect() ?? null;
    const quickActionsRect = findHeading("Quick actions")?.getBoundingClientRect() ?? null;

    return {
      visible: Boolean(commandCenter),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      ownerPrioritiesBeforeToday:
        Boolean(prioritiesRect && todayRect) && prioritiesRect.top <= todayRect.top,
      quickActionsReachable:
        Boolean(quickActionsRect) && quickActionsRect.top < window.innerHeight * 2.5,
    };
  });

  if (!mobileLayout.visible) {
    throw new Error("CRM operations dashboard is not visible on mobile viewport.");
  }

  if (mobileLayout.hasHorizontalOverflow) {
    throw new Error(`Dashboard mobile layout overflows horizontally: ${mobileLayout.scrollWidth} > ${mobileLayout.viewportWidth}.`);
  }

  if (!mobileLayout.ownerPrioritiesBeforeToday) {
    throw new Error("Owner priorities do not appear before Today on mobile.");
  }

  if (!mobileLayout.quickActionsReachable) {
    throw new Error("Dashboard quick actions are not reachable near the top on mobile.");
  }

  await viewport.set(LAPTOP_VIEWPORT);

  return { ...overlaps, commandCenter: commandCenterOverlaps, mobileLayout };
}

async function testSettingsIntegrationCenter(tab) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Settings");
  await waitFor(
    tab,
    () => {
      const section = document.querySelector('[data-testid="integration-center"]');
      const text = section?.textContent?.toLowerCase() ?? "";
      const cards = [
        ...(section?.querySelectorAll('[data-testid="integration-provider-card"]') ?? []),
      ];

      return (
        text.includes("integration center") &&
        text.includes("provider readiness foundation") &&
        text.includes("connected") &&
        text.includes("not connected") &&
        text.includes("ready") &&
        text.includes("requires configuration") &&
        text.includes("disabled") &&
        text.includes("last sync") &&
        text.includes("last activity") &&
        text.includes("health") &&
        text.includes("connection summary") &&
        text.includes("connection status model") &&
        text.includes("ready to configure") &&
        text.includes("error") &&
        text.includes("no live connectivity") &&
        text.includes("connection wizard") &&
        text.includes("configuration page") &&
        text.includes("disconnect flow") &&
        text.includes("reconnect flow") &&
        text.includes("twilio live integration foundation") &&
        text.includes("calls and sms routing setup") &&
        text.includes("backend ready") &&
        text.includes("credentials required") &&
        text.includes("migration required") &&
        text.includes("webhook setup required") &&
        text.includes("ready for live test") &&
        text.includes("weathertech roofing llc - phoenix") &&
        text.includes("weathertech roofing llc - tucson") &&
        text.includes("ihc painting - ihc") &&
        text.includes("/api/integrations/twilio/webhook") &&
        text.includes("/api/integrations/twilio/status") &&
        text.includes("/api/integrations/twilio/voice") &&
        text.includes("/api/integrations/twilio/recording") &&
        text.includes("gohighlevel live synchronization foundation") &&
        text.includes("check sync readiness") &&
        text.includes("no live sync") &&
        text.includes("credentials required") &&
        text.includes("validation failed") &&
        text.includes("ready to sync") &&
        text.includes("sync disabled") &&
        text.includes("external ids") &&
        text.includes("duplicate protection") &&
        text.includes("conflict detection") &&
        text.includes("sync timestamps") &&
        text.includes("retry readiness") &&
        text.includes("pipeline discovery") &&
        text.includes("/api/integrations/gohighlevel/readiness") &&
        text.includes("0021_gohighlevel_sync_foundation.sql") &&
        text.includes("website lead capture") &&
        text.includes("secure form-intake foundation") &&
        text.includes("/api/leads/website") &&
        text.includes("?dryrun=1") &&
        text.includes("source registry ready") &&
        text.includes("verification required") &&
        text.includes("weathertech-phoenix") &&
        text.includes("weathertech-tucson") &&
        text.includes("ihc-contact") &&
        text.includes("yelp lead integration") &&
        text.includes("secure yelp intake foundation") &&
        text.includes("/api/leads/yelp") &&
        text.includes("account registry ready") &&
        text.includes("weathertech-phoenix") &&
        text.includes("weathertech-tucson") &&
        text.includes("private yelp business ids stay server-side") &&
        [
          "twilio",
          "gmail",
          "google calendar",
          "google business profile",
          "yelp",
          "website lead capture",
          "gohighlevel",
        ].every((provider) => text.includes(provider)) &&
        [
          "sms",
          "calling",
          "email",
          "calendar",
          "reviews",
          "website leads",
          "crm sync",
          "photos",
          "documents",
          "ai",
          "webhooks",
        ].every((capability) => text.includes(capability)) &&
        cards.length >= 8
      );
    },
    "settings integration center",
    15000,
  );

  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-provider-id="twilio"]//button[normalize-space(.)="Connection wizard"]',
    ),
    "Twilio connection wizard",
  );

  await waitFor(
    tab,
    () => {
      const dialog = document.querySelector('[data-testid="integration-connection-dialog"]');
      const text = dialog?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("twilio") &&
        text.includes("architecture only") &&
        text.includes("connection wizard") &&
        text.includes("configuration page") &&
        text.includes("credential validation interface") &&
        text.includes("oauth readiness") &&
        text.includes("capability summary") &&
        text.includes("live action unavailable") &&
        text.includes("server-side only") &&
        text.includes("webhook signature check")
      );
    },
    "integration connection wizard dialog",
    15000,
  );

  const result = await tab.playwright.evaluate(() => {
    const section = document.querySelector('[data-testid="integration-center"]');
    const dialog = document.querySelector('[data-testid="integration-connection-dialog"]');
    const cards = [
      ...(section?.querySelectorAll('[data-testid="integration-provider-card"]') ?? []),
    ];

    return {
      dialogOpened: Boolean(dialog),
      hasSettingsAccess: Boolean(section),
      providerCards: cards.length,
    };
  });

  await clickUnique(
    tab.playwright.getByRole("button", { name: "Close integration connection dialog" }),
    "Close integration connection dialog",
  );

  return result;
}

async function testCalendarScreen(tab) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Calendar");
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes("calendar") &&
        text.includes("schedule inspections, estimates, jobs, follow-ups, and deliveries.") &&
        text.includes("this week") &&
        text.includes("scheduled") &&
        text.includes("conflicts") &&
        text.includes("unscheduled jobs") &&
        text.includes("new")
      );
    },
    "calendar screen",
    15000,
  );

  return { opened: true };
}

async function testJobsWorkspaceFiltersAndSections(browser, tab, company, testJob) {
  const viewport = await browser.capabilities.get("viewport");

  await viewport.set(LAPTOP_VIEWPORT);
  await selectTestJob(tab, testJob.title);
  await tab.playwright.evaluate(() => {
    document
      .querySelector('[data-testid="job-production-command-center"]')
      ?.scrollIntoView({ block: "center" });
  });

  const commandCenterLabels = [
    "Job production command center",
    "Active jobs",
    "Scheduled today",
    "Waiting on customer",
    "Waiting on material",
    "In production",
    "Final walkthrough",
    "Completed",
    "Warranty",
  ];
  const roofingLabels = [
    "WeatherTech Roofing production",
    "Roof inspections",
    "Roof replacements",
    "Roof repairs",
    "Foam roofing",
    "Tile roofing",
    "Flat roofing",
    "Warranty calls",
    "Emergency leaks",
  ];
  const paintingLabels = [
    "IHC Painting production",
    "Exterior painting",
    "Interior painting",
    "Commercial painting",
    "HOA projects",
    "Cabinet refinishing",
    "Stucco repair",
    "Drywall repair",
    "Surface preparation",
  ];
  const quickActionLabels = [
    "Start Job",
    "Complete Inspection",
    "Upload Photos",
    "Create Change Order",
    "Request Material",
    "Create Invoice",
    "Schedule Follow-up",
    "Send Customer Update",
  ];
  const timelineLabels = [
    "Inspection",
    "Estimate",
    "Contract",
    "Material ordered",
    "Production scheduled",
    "Work started",
    "Final inspection",
    "Invoice",
    "Paid",
  ];

  const productionWorkspace = await tab.playwright.evaluate(
    ({ commandCenterLabels, roofingLabels, paintingLabels, quickActionLabels, timelineLabels }) => {
      const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
      const textFor = (id) => byTestId(id)?.textContent ?? "";
      const panelIds = [
        "job-production-command-center",
        "crew-assignment-panel",
        "weathertech-roofing-production-cards",
        "ihc-painting-production-cards",
        "job-production-summary",
        "job-production-quick-actions",
        "job-production-timeline",
      ];

      return {
        missingPanels: panelIds.filter((id) => !byTestId(id)),
        missingCommandLabels: commandCenterLabels.filter(
          (label) => !textFor("job-production-command-center").includes(label),
        ),
        missingRoofingLabels: roofingLabels.filter(
          (label) => !textFor("weathertech-roofing-production-cards").includes(label),
        ),
        missingPaintingLabels: paintingLabels.filter(
          (label) => !textFor("ihc-painting-production-cards").includes(label),
        ),
        missingSummaryLabels: [
          "Job production summary",
          "Customer",
          "Address",
          "Company",
          "Crew",
          "Status",
          "Estimate",
          "Inspection",
          "Photos",
          "Documents",
          "Change orders",
          "Invoices",
          "Communications",
        ].filter((label) => !textFor("job-production-summary").includes(label)),
        missingQuickActions: quickActionLabels.filter(
          (label) => !textFor("job-production-quick-actions").includes(label),
        ),
        missingTimelineLabels: timelineLabels.filter(
          (label) => !textFor("job-production-timeline").includes(label),
        ),
      };
    },
    { commandCenterLabels, roofingLabels, paintingLabels, quickActionLabels, timelineLabels },
  );

  const missingProductionWorkspaceItems = Object.entries(productionWorkspace)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${value.join(", ")}`);

  if (missingProductionWorkspaceItems.length) {
    throw new Error(
      `Job production workspace is missing expected items: ${missingProductionWorkspaceItems.join("; ")}`,
    );
  }

  const responsiveChecks = [];

  for (const [label, dimensions] of [
    ["tablet", { width: 768, height: 1024 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    await viewport.set(dimensions);
    await tab.playwright.evaluate(() => {
      document
        .querySelector('[data-testid="job-production-command-center"]')
        ?.scrollIntoView({ block: "center" });
    });
    await tab.playwright.waitForTimeout(300);
    responsiveChecks.push({
      label,
      ...(await tab.playwright.evaluate(() => {
        const commandCenter = document.querySelector('[data-testid="job-production-command-center"]');
        const quickActions = document.querySelector('[data-testid="job-production-quick-actions"]');

        return {
          commandCenterVisible: Boolean(commandCenter),
          quickActionsVisible: Boolean(quickActions),
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
          touchTargets: [...(quickActions?.querySelectorAll("button") ?? [])].map((button) => {
            const rect = button.getBoundingClientRect();

            return { width: rect.width, height: rect.height };
          }),
        };
      })),
    });
  }

  for (const check of responsiveChecks) {
    if (!check.commandCenterVisible || !check.quickActionsVisible) {
      throw new Error(`Job production workspace is missing on ${check.label} viewport.`);
    }

    if (check.hasHorizontalOverflow) {
      throw new Error(
        `Job production workspace overflows horizontally on ${check.label}: ${check.scrollWidth} > ${check.viewportWidth}.`,
      );
    }

    if (check.touchTargets.some((target) => target.height < 44)) {
      throw new Error(`Job production quick-action touch targets are too small on ${check.label}.`);
    }
  }

  await viewport.set(LAPTOP_VIEWPORT);

  await fillUnique(
    tab.playwright.locator('[data-testid="jobs-search"]'),
    testJob.title,
    "jobs workspace search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="jobs-company-filter"]'),
    company.id,
    "jobs company filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="jobs-service-filter"]'),
    "roofing",
    "jobs service filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="jobs-crew-filter"]'),
    "assigned",
    "jobs crew filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="jobs-schedule-filter"]'),
    "unscheduled",
    "jobs schedule filter",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    "filtered seeded job",
    10000,
    testJob.title,
  );

  await selectUnique(
    tab.playwright.locator('[data-testid="jobs-schedule-filter"]'),
    "scheduled",
    "jobs scheduled filter",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="jobs-search"]'),
    `${testJob.title} NO RESULTS`,
    "jobs workspace no-results search",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("No jobs match these filters."),
    "jobs no-results state",
    10000,
  );

  await clickUnique(tab.playwright.getByRole("button", { name: "Clear filters" }), "Clear filters");
  await fillUnique(
    tab.playwright.locator('[data-testid="jobs-search"]'),
    testJob.title,
    "jobs workspace search after clear",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    "seeded job after clearing filters",
    10000,
    testJob.title,
  );

  const sections = ["Overview", "Checklist", "Schedule", "Crew", "Activity", "Materials", "Financial", "Files"];

  for (const section of sections) {
    await clickTabAndWaitSelected(tab, section, `job workspace ${section} tab`);
  }

  return {
    search: "passed",
    filters: ["company", "service", "crew", "schedule"],
    productionWorkspace,
    responsiveChecks,
    sections,
  };
}

async function findInspectionByTitle(env, title) {
  const [inspection] = await restRequest(
    env,
    `inspections?select=*&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return inspection ?? null;
}

async function testInspectionsWorkflow(tab, env, company, testJob, runId, progress) {
  const migrationReady = await detectInspectionFoundationSupport(env);
  const inspectionTitle = `${TEST_PREFIX} ${runId} INSPECTION`;
  const estimateTitle = `${TEST_PREFIX} ${runId} INSPECTION ESTIMATE`;
  const reportTitle = `${TEST_PREFIX} ${runId} INSPECTION REPORT`;
  const internalOnlyNote = `${TEST_PREFIX} ${runId} INTERNAL ONLY NOTE`;
  const fieldInternalNote = `${TEST_PREFIX} ${runId} FIELD INTERNAL NOTE`;
  const measurementLabel = `${TEST_PREFIX} ${runId} ROOF SQUARES`;
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  progress("inspections:open:start");
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await clickNav(tab, "Inspections");
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Schedule site visits") &&
      document.body.innerText.includes("Create site inspection"),
    "inspections screen",
  );
  progress("inspections:open:done");

  await clickUnique(tab.playwright.getByRole("button", { name: "New inspection" }), "New inspection");
  await fillUnique(
    tab.playwright.locator('xpath=//aside//form//input[@name="title"]'),
    inspectionTitle,
    "inspection title",
  );
  await clickVisibleDomSubmitByText(
    tab,
    "Create inspection",
    "Create inspection validation",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Choose a lead, customer, job, or calendar event"),
    "inspection relation validation",
  );

  if (!migrationReady) {
    return {
      migrationReady,
      verified: "UI and validation verified; live persistence waits for migration 0019.",
    };
  }

  progress("inspections:create:start");
  await selectUnique(
    tab.playwright.locator('xpath=//aside//form//select[@name="company_id"]'),
    company.id,
    "inspection company",
  );
  await selectUnique(
    tab.playwright.locator('xpath=//aside//form//select[@name="job_id"]'),
    testJob.id,
    "inspection job",
  );
  await selectUnique(
    tab.playwright.locator('xpath=//aside//form//select[@name="inspection_type"]'),
    "roof_inspection",
    "inspection type",
  );
  await selectUnique(
    tab.playwright.locator('xpath=//aside//form//select[@name="service_category"]'),
    "roofing",
    "inspection service category",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//aside//form//input[@name="scheduled_start"]'),
    toDateTimeLocalValue(start),
    "inspection scheduled start",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//aside//form//input[@name="scheduled_end"]'),
    toDateTimeLocalValue(end),
    "inspection scheduled end",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//aside//form//input[@name="assigned_inspector"]'),
    `${TEST_PREFIX} ${runId} Inspector`,
    "inspection inspector",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//aside//form//textarea[@name="purpose"]'),
    "TEST roof condition documentation for estimate review.",
    "inspection purpose",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//aside//form//textarea[@name="notes"]'),
    internalOnlyNote,
    "inspection internal note",
  );
  await clickUnique(
    tab.playwright.locator('xpath=//aside//form//button[@type="submit"]'),
    "Create inspection",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `inspection ${inspectionTitle}`,
    15000,
    inspectionTitle,
  );
  const savedInspection = await waitForAsync(
    () => findInspectionByTitle(env, inspectionTitle),
    `Supabase inspection ${inspectionTitle}`,
    15000,
  );

  if (savedInspection.status !== "scheduled") {
    throw new Error(`Created inspection status was ${savedInspection.status}.`);
  }

  if (!savedInspection.schedule_event_id) {
    throw new Error("Created inspection did not link to a schedule event.");
  }
  progress("inspections:create:done");

  progress("inspections:filters:start");
  await fillUnique(
    tab.playwright.locator('[data-testid="inspections-search"]'),
    inspectionTitle,
    "inspections search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="inspections-status-filter"]'),
    "scheduled",
    "inspections status filter",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `filtered inspection ${inspectionTitle}`,
    10000,
    inspectionTitle,
  );
  progress("inspections:filters:done");

  progress("inspections:finding:start");
  await clickInspectionTabAndWait(tab, "Field mode", [
    "quick capture",
    "estimate-ready by default",
  ]);
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add finding"]]//input[@name="area"]'),
    "South roof slope",
    "finding area",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add finding"]]//textarea[@name="observation"]'),
    "TEST cracked tile observed by inspector.",
    "finding observation",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add finding"]]//textarea[@name="recommendation"]'),
    "Replace cracked tile and review surrounding underlayment before estimate is sent.",
    "finding recommendation",
  );
  for (const name of ["action_required", "include_in_estimate", "customer_visible", "include_in_report"]) {
    await checkFormCheckboxByLabel(
      tab,
      "Add finding",
      name,
      `inspection finding ${name}`,
    );
  }
  await clickUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add finding"]]//button[@type="submit"]'),
    "Add finding",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("TEST cracked tile observed by inspector."),
    "inspection finding rendered",
    15000,
  );
  const inspectionWithFinding = await findInspectionByTitle(env, inspectionTitle);

  if (!Array.isArray(inspectionWithFinding.findings) || inspectionWithFinding.findings.length < 1) {
    throw new Error("Inspection finding did not persist.");
  }
  const savedFinding = inspectionWithFinding.findings.find((finding) =>
    finding.observation === "TEST cracked tile observed by inspector.",
  );

  if (
    !savedFinding?.action_required ||
    !savedFinding.include_in_estimate ||
    !savedFinding.customer_visible ||
    !savedFinding.include_in_report
  ) {
    throw new Error("Inspection finding did not persist selected customer-facing flags.");
  }
  progress("inspections:finding:done");

  progress("inspections:measurement:start");
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add measurement"]]//input[@name="label"]'),
    measurementLabel,
    "inspection measurement label",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add measurement"]]//input[@name="value"]'),
    "23",
    "inspection measurement value",
  );
  await clickUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add measurement"]]//button[@type="submit"]'),
    "Add measurement",
  );
  await waitForNoSavingState(tab, "inspection measurement save complete");
  const inspectionWithMeasurement = await waitForAsync(
    async () => {
      const inspection = await findInspectionByTitle(env, inspectionTitle);

      return inspection?.measurements?.some((measurement) => measurement.label === measurementLabel)
        ? inspection
        : null;
    },
    "inspection measurement persistence",
    25000,
  );
  progress("inspections:measurement:done");

  progress("inspections:note:start");
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add internal note"]]//textarea[@name="note"]'),
    fieldInternalNote,
    "inspection internal field note",
  );
  let inspectionWithNote = null;
  let internalNoteError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await scrollTextIntoView(tab, "Add internal note");
    await clickVisibleDomSubmitByText(tab, "Add internal note", `Add internal note attempt ${attempt}`);

    try {
      inspectionWithNote = await waitForAsync(
        async () => {
          const inspection = await findInspectionByTitle(env, inspectionTitle);

          return inspection?.internal_notes?.includes(fieldInternalNote) ? inspection : null;
        },
        "inspection internal note persistence",
        attempt === 3 ? 15000 : 5000,
      );
      break;
    } catch (error) {
      internalNoteError = error;
    }
  }

  if (!inspectionWithNote) {
    throw internalNoteError ?? new Error("Inspection internal note did not persist.");
  }

  await waitFor(
    tab,
    () => document.body.innerText.includes("Internal note added."),
    "inspection internal note UI acknowledgement",
    15000,
  );
  await waitForNoSavingState(tab, "inspection internal note save complete");
  progress("inspections:note:done");

  progress("inspections:estimate:start");
  await clickInspectionTabAndWait(tab, "Estimate / report", [
    "Estimate review",
    "Optional roof report draft",
  ]);
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Estimate review"]]//input[@name="estimate_title"]'),
    estimateTitle,
    "inspection estimate title",
  );
  await scrollTextIntoView(tab, "Create estimate draft");
  await clickUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Estimate review"]]//button[@type="submit"]'),
    "Create estimate draft",
  );
  await waitForAsync(
    () =>
      restRequest(env, `estimates?select=id,title&title=eq.${encodeURIComponent(estimateTitle)}&limit=1`)
        .then((rows) => rows[0]),
    `inspection estimate ${estimateTitle}`,
    15000,
  );
  await waitForNoSavingState(tab, "inspection estimate save complete");
  progress("inspections:estimate:done");

  progress("inspections:report:start");
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Optional roof report draft"]]//input[@name="report_title"]'),
    reportTitle,
    "inspection report title",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Optional roof report draft"]]//textarea[@name="report_summary"]'),
    "Customer-visible TEST report summary.",
    "inspection report summary",
  );
  let report = null;
  let reportError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await scrollTextIntoView(tab, "Create report draft");
    await clickVisibleDomSubmitByText(tab, "Create report draft", `Create report draft attempt ${attempt}`);

    try {
      report = await waitForAsync(
        () =>
          restRequest(env, `documents?select=id,title,body&title=eq.${encodeURIComponent(reportTitle)}&limit=1`)
            .then((rows) => rows[0]),
        `inspection report ${reportTitle}`,
        attempt === 3 ? 15000 : 5000,
      );
      break;
    } catch (error) {
      reportError = error;
    }
  }

  if (!report) {
    throw reportError ?? new Error("Inspection report did not persist.");
  }

  if (!report?.body?.includes("TEST cracked tile observed by inspector.")) {
    throw new Error("Inspection report did not include selected customer-visible finding.");
  }

  if (report.body.includes(internalOnlyNote)) {
    throw new Error("Inspection report included internal-only notes.");
  }

  if (report.body.includes(fieldInternalNote)) {
    throw new Error("Inspection report included internal field notes.");
  }
  await waitFor(
    tab,
    () => document.body.innerText.includes("Inspection report draft saved to documents."),
    "inspection report UI acknowledgement",
    15000,
  );
  await waitForNoSavingState(tab, "inspection report save complete");
  progress("inspections:report:done");

  progress("inspections:record-management:start");
  const cancelConfirmation = tab.playwright.locator(
    '[role="alertdialog"][aria-label="Cancel inspection confirmation"]',
  );
  let cancelConfirmationOpened = false;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await scrollTextIntoView(tab, "Cancel inspection");
    await clickUnique(
      tab.playwright.locator('[data-testid="inspection-cancel-button"]'),
      `Cancel inspection attempt ${attempt}`,
    );

    try {
      await waitForUniqueLocator(
        cancelConfirmation,
        "cancel inspection confirmation",
        attempt === 2 ? 10000 : 2500,
      );
      cancelConfirmationOpened = true;
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  if (!cancelConfirmationOpened) {
    throw new Error("Cancel inspection confirmation did not open.");
  }

  const cancelConfirmationText = await cancelConfirmation.innerText({ timeoutMs: 8000 });

  if (
    !cancelConfirmationText.includes("Cancel") ||
    !cancelConfirmationText.includes("related records stay connected")
  ) {
    throw new Error("Cancel inspection confirmation did not explain the action.");
  }

  await clickUnique(
    tab.playwright.locator('[data-testid="inspection-confirm-cancel-button"]'),
    "Confirm cancel inspection",
    { retryTransientClick: true },
  );
  await waitForAsync(
    async () => {
      const inspection = await findInspectionByTitle(env, inspectionTitle);

      return inspection?.status === "canceled" ? inspection : null;
    },
    "inspection canceled persistence",
    15000,
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Inspection canceled."),
    "inspection canceled UI acknowledgement",
    15000,
  );
  await waitForNoSavingState(tab, "inspection cancel save complete");
  await selectUnique(
    tab.playwright.locator('[data-testid="inspections-lifecycle-filter"]'),
    "canceled",
    "canceled inspections filter",
  );
  await waitFor(
    tab,
    (title) => {
      const text = document.body.innerText;

      return (
        text.includes(title) &&
        text.toLowerCase().includes("canceled - hidden from active work")
      );
    },
    "canceled inspection visible when requested",
    10000,
    inspectionTitle,
  );
  const restoreConfirmation = tab.playwright.locator(
    '[role="alertdialog"][aria-label="Restore inspection confirmation"]',
  );
  let restoreConfirmationOpened = false;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await scrollTextIntoView(tab, "Restore inspection");
    await clickUnique(
      tab.playwright.locator('[data-testid="inspection-restore-button"]'),
      `Restore inspection attempt ${attempt}`,
    );

    try {
      await waitForUniqueLocator(
        restoreConfirmation,
        "restore inspection confirmation",
        attempt === 2 ? 10000 : 2500,
      );
      restoreConfirmationOpened = true;
      break;
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }
  }

  if (!restoreConfirmationOpened) {
    throw new Error("Restore inspection confirmation did not open.");
  }

  const restoreConfirmationText = await restoreConfirmation.innerText({ timeoutMs: 8000 });

  if (
    !restoreConfirmationText.includes("Restore") ||
    !restoreConfirmationText.includes("return to active work")
  ) {
    throw new Error("Restore inspection confirmation did not explain the action.");
  }

  await clickUnique(
    tab.playwright.locator('[data-testid="inspection-confirm-restore-button"]'),
    "Confirm restore inspection",
    { retryTransientClick: true },
  );
  await waitForAsync(
    async () => {
      const inspection = await findInspectionByTitle(env, inspectionTitle);

      return inspection && inspection.status !== "canceled" ? inspection : null;
    },
    "inspection restored persistence",
    15000,
  );
  progress("inspections:record-management:done");

  return {
    migrationReady,
    inspectionId: savedInspection.id,
    estimateTitle,
    reportTitle,
    measurements: inspectionWithMeasurement.measurements.length,
    internalNoteSaved: inspectionWithNote.internal_notes.includes(fieldInternalNote),
  };
}

async function runUiMutationTests(tab, env, testJob, runId, progress) {
  const addedTaskTitle = `${TEST_PREFIX} ${runId} ADDED TASK`;
  const editedTaskTitle = `${TEST_PREFIX} ${runId} EDITED TASK`;
  const noteText = `${TEST_PREFIX} ${runId} NOTE`;
  const materialName = `${TEST_PREFIX} ${runId} MATERIAL`;
  const scheduleTitle = `${TEST_PREFIX} ${runId} SCHEDULE`;
  const results = {};

  progress("job:scope-weathertech");
  await clickNav(tab, "Dashboard");
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  progress("job:select-initial");
  await selectTestJob(tab, testJob.title);

  progress("job:open-existing:start");
  await tab.playwright.evaluate(() => window.scrollTo(0, 260));
  const openBefore = await getScrollY(tab);
  await clickUnique(tab.playwright.getByRole("button", { name: "New Job" }), "New Job");
  await tab.playwright.waitForTimeout(300);
  await fillUnique(tab.playwright.getByPlaceholder("Search jobs", { exact: true }), testJob.title, "job search");
  await tab.playwright.waitForTimeout(300);
  await tab.playwright.evaluate(() => window.scrollTo(0, 260));
  await clickUnique(jobListItemContainingText(tab, testJob.title), `job card ${testJob.title}`);
  await waitFor(
    tab,
    () => {
      const builder = document.querySelector("#job-builder");

      if (!builder) {
        return false;
      }

      const rect = builder.getBoundingClientRect();
      return rect.top >= -20 && rect.top <= 120;
    },
    "job builder scroll target",
  );
  const openAfter = await getScrollY(tab);
  await tab.playwright.waitForTimeout(800);
  const openSettled = await getScrollY(tab);
  const openDeltaAfterSettle = Math.abs(openSettled - openAfter);

  if (openDeltaAfterSettle > 90) {
    throw new Error(`opening existing job moved again by ${openDeltaAfterSettle}px after settling.`);
  }

  results.openExistingJob = {
    before: openBefore,
    after: openAfter,
    settled: openSettled,
    deltaAfterSettle: openDeltaAfterSettle,
  };
  results.openExistingJob.startingScrollBeforeNewJob = openBefore;
  progress("job:open-existing:done");

  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `test job detail ${testJob.title}`,
    10000,
    testJob.title,
  );

  progress("job:add-task:start");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add checklist task"]]//input[@name="title"]'), addedTaskTitle, "add task title");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add checklist task"]]//textarea[@name="description"]'), "Regression task details.", "add task details");
  results.addTask = await preventTopJumpAround(
    tab,
    async () => {
      await clickUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add checklist task"]]//button[@type="submit"]'), "Add checklist task");
      await waitFor(
        tab,
        (title) => document.body.innerText.includes(title),
        `added task ${addedTaskTitle}`,
        10000,
        addedTaskTitle,
      );
    },
    "adding task",
  );
  progress("job:add-task:done");

  await scrollChecklistTaskIntoView(tab, addedTaskTitle);
  progress("job:status:start");
  results.changeTaskStatus = await preserveScrollAfterControlActivation(
    tab,
    async () => {
      const doneButton = tab.playwright.locator(
        [
          `xpath=//*[@id="job-section-checklist"]//p[normalize-space(.)=${xpathString(addedTaskTitle)}]`,
          '/ancestor::*[contains(@class,"rounded-lg")][1]',
          '//button[normalize-space(.)="Done"]',
        ].join(""),
      );
      await clickUnique(doneButton, "added task Done button");
    },
    async () => {
      await waitForAsync(
        async () => {
          const task = await findJobTaskByTitle(env, testJob.id, addedTaskTitle);

          return task?.status === "done" ? task : null;
        },
        `added task done persistence ${addedTaskTitle}`,
        15000,
      );
      await waitFor(tab, () => document.body.innerText.includes("Checklist task marked Done."), "task status notice");
    },
    "changing task status",
  );
  progress("job:status:done");

  await scrollChecklistTaskIntoView(tab, addedTaskTitle);
  progress("job:edit-task:start");
  results.editTask = await preserveScrollAfterControlActivation(
    tab,
    async () => {
      const editButton = tab.playwright.locator(
        [
          `xpath=//*[@id="job-section-checklist"]//p[normalize-space(.)=${xpathString(addedTaskTitle)}]`,
          '/ancestor::*[contains(@class,"rounded-lg")][1]',
          '//button[@title="Edit task"]',
        ].join(""),
      );
      await clickUnique(editButton, "added task edit button");
    },
    async () => {
      const editTitleInput = tab.playwright.locator(`xpath=//form[.//*[normalize-space(.)="Save task"]]//input[@name="title"]`);
      await waitFor(
        tab,
        (title) => {
          const form = [...document.querySelectorAll("form")].find((candidate) =>
            [...candidate.querySelectorAll("button")].some(
              (button) => button.textContent?.trim() === "Save task",
            ),
          );
          const input = form?.querySelector('input[name="title"]');

          return input?.value === title;
        },
        "added task edit form",
        10000,
        addedTaskTitle,
      );
      await fillUnique(editTitleInput, editedTaskTitle, "edit task title");
      await clickVisibleDomSubmitByText(tab, "Save task", "Save task");
      await waitForAsync(
        () => findJobTaskByTitle(env, testJob.id, editedTaskTitle),
        `edited task persistence ${editedTaskTitle}`,
        15000,
      );
      await waitFor(
        tab,
        (title) => document.body.innerText.includes(title),
        `edited task ${editedTaskTitle}`,
        10000,
        editedTaskTitle,
      );
    },
    "editing task",
  );
  progress("job:edit-task:done");

  progress("job:add-note:start");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add note"]]//textarea[@name="note"]'), noteText, "job note");
  results.addNote = await preventTopJumpAround(
    tab,
    async () => {
      await clickUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add note"]]//button[@type="submit"]'), "Add note");
      await waitFor(
        tab,
        (note) => document.body.innerText.includes(note),
        `note ${noteText}`,
        10000,
        noteText,
      );
    },
    "adding note",
  );
  progress("job:add-note:done");

  progress("job:add-material:start");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add material"]]//input[@name="name"]'), materialName, "material name");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add material"]]//input[@name="quantity"]'), "3", "material quantity");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add material"]]//input[@name="unit"]'), "bundle", "material unit");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add material"]]//textarea[@name="notes"]'), "Regression material notes.", "material notes");
  await scrollTextIntoView(tab, "Add material");
  results.addMaterial = await preventTopJumpAround(
    tab,
    async () => {
      await clickUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add material"]]//button[@type="submit"]'), "Add material");
      await waitFor(
        tab,
        (name) => document.body.innerText.includes(name),
        `material ${materialName}`,
        10000,
        materialName,
      );
    },
    "adding material",
  );
  progress("job:add-material:done");

  progress("job:add-schedule:start");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add schedule"]]//input[@name="title"]'), scheduleTitle, "schedule title");
  await fillUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add schedule"]]//textarea[@name="notes"]'), `${TEST_PREFIX} ${runId} schedule notes`, "schedule notes");
  await scrollTextIntoView(tab, "Add schedule");
  results.addSchedule = await preventTopJumpAround(
    tab,
    async () => {
      await clickUnique(tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Add schedule"]]//button[@type="submit"]'), "Add schedule");
      await waitFor(
        tab,
        (title) => document.body.innerText.includes(title),
        `schedule ${scheduleTitle}`,
        10000,
        scheduleTitle,
      );
    },
    "adding schedule",
  );
  progress("job:add-schedule:done");

  progress("job:refresh:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await tab.playwright.waitForTimeout(1200);
  await selectTestJob(tab, testJob.title);
  const textAfterRefresh = await pageText(tab);
  const missingAfterRefresh = [
    editedTaskTitle,
    noteText,
    materialName,
    scheduleTitle,
  ].filter((value) => !textAfterRefresh.includes(value));

  if (missingAfterRefresh.length) {
    throw new Error(`Missing after refresh: ${missingAfterRefresh.join(", ")}`);
  }
  progress("job:refresh:done");

  results.refreshPersistence = {
    checked: [editedTaskTitle, noteText, materialName, scheduleTitle],
  };

  return results;
}

async function testJobBuilderEditAndSchedule(tab, env, testJob, runId, progress) {
  const updatedJobTitle = `${TEST_PREFIX} ${runId} UPDATED JOB`;
  const scheduleStart = new Date();
  scheduleStart.setDate(scheduleStart.getDate() + 3);
  scheduleStart.setHours(9, 15, 0, 0);
  const scheduleEnd = new Date(scheduleStart.getTime() + 3 * 60 * 60 * 1000);
  const scheduledStartInput = toDateTimeLocalValue(scheduleStart);
  const scheduledEndInput = toDateTimeLocalValue(scheduleEnd);

  progress("job-builder:select:start");
  await selectTestJob(tab, testJob.title);
  progress("job-builder:select:done");

  await fillUnique(
    tab.playwright.locator('#job-builder input[name="title"]'),
    updatedJobTitle,
    "job title",
  );

  const moreDetailsSummary = tab.playwright.locator('xpath=//section[@id="job-builder"]//summary[contains(normalize-space(.),"More details")]');
  if ((await moreDetailsSummary.count()) === 1) {
    await moreDetailsSummary.click({ timeoutMs: 8000 });
    await tab.playwright.waitForTimeout(300);
  }

  await fillUnique(
    tab.playwright.locator('#job-builder input[name="scheduled_start"]'),
    scheduledStartInput,
    "job scheduled start",
  );
  await fillUnique(
    tab.playwright.locator('#job-builder input[name="scheduled_end"]'),
    scheduledEndInput,
    "job scheduled end",
  );
  await fillUnique(
    tab.playwright.locator('#job-builder input[name="crew_name"]'),
    `${TEST_PREFIX} ${runId} CREW`,
    "job crew",
  );
  await clickUnique(
    tab.playwright.locator('xpath=//section[@id="job-builder"]//form//button[@type="submit"]'),
    "Save job",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `updated job ${updatedJobTitle}`,
    15000,
    updatedJobTitle,
  );

  const savedJob = await findJobByTitle(env, updatedJobTitle);

  if (!savedJob) {
    throw new Error("Updated job was not found through Supabase.");
  }

  if (!savedJob.scheduled_start || !savedJob.scheduled_end) {
    throw new Error("Updated job did not save scheduled start/end values.");
  }

  progress("job-builder:refresh:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await tab.playwright.waitForTimeout(1200);
  await selectTestJob(tab, updatedJobTitle);

  const moreDetailsAfterRefresh = tab.playwright.locator('xpath=//section[@id="job-builder"]//summary[contains(normalize-space(.),"More details")]');
  if ((await moreDetailsAfterRefresh.count()) === 1) {
    await moreDetailsAfterRefresh.click({ timeoutMs: 8000 });
    await tab.playwright.waitForTimeout(300);
  }

  const persistedInputs = await tab.playwright.evaluate(() => {
    const start = document.querySelector('#job-builder input[name="scheduled_start"]');
    const end = document.querySelector('#job-builder input[name="scheduled_end"]');

    return {
      scheduledStart: start?.value ?? "",
      scheduledEnd: end?.value ?? "",
    };
  });
  progress("job-builder:refresh:done");

  if (persistedInputs.scheduledStart !== scheduledStartInput) {
    throw new Error(
      `Scheduled start after refresh was ${persistedInputs.scheduledStart}, expected ${scheduledStartInput}.`,
    );
  }

  if (persistedInputs.scheduledEnd !== scheduledEndInput) {
    throw new Error(
      `Scheduled end after refresh was ${persistedInputs.scheduledEnd}, expected ${scheduledEndInput}.`,
    );
  }

  return {
    jobId: savedJob.id,
    originalTitle: testJob.title,
    updatedJobTitle,
    scheduledStartInput,
    scheduledEndInput,
    persistedInputs,
  };
}

function formatRecord(record) {
  if (record.status === "passed") {
    return `PASS ${record.name}`;
  }

  return `FAIL ${record.name}: ${record.error}`;
}

export function formatRegressionReport(result) {
  const lines = [
    `WeatherTech OS Codex Browser regression: ${result.ok ? "PASS" : "FAIL"}`,
    `Run id: ${result.runId}`,
    `Groups: ${(result.groups ?? DEFAULT_GROUPS).join(", ")}`,
    `Seeded job: ${result.seededJobTitle ?? "none"}`,
    `Cleanup before: ${JSON.stringify(result.cleanup.before)}`,
    `Cleanup after: ${JSON.stringify(result.cleanup.after)}`,
    "",
    ...result.results.map(formatRecord),
  ];

  if (!result.ok) {
    lines.push("", `${result.failureCount} test group(s) failed.`);
  }

  return `${lines.join("\n")}\n`;
}

export function getCodexBrowserRegressionCommand({
  cwd = "/Users/spotty/Documents/New project",
  progressPath = "/tmp/weathertech-os-regression-progress.jsonl",
  groups = null,
} = {}) {
  const moduleUrl = pathToFileURL(
    join(cwd, "tests/codex-browser/weathertech-os-regression.mjs"),
  ).href;

  return [
    `var weatherTechRegression = await import("${moduleUrl}?run=" + Date.now());`,
    "var weatherTechRegressionResult = await weatherTechRegression.runWeatherTechOsRegression({",
    "  browser,",
    "  nodeRepl,",
    `  progressPath: "${progressPath}",`,
    ...(groups ? [`  groups: ${JSON.stringify(groups)},`] : []),
    "});",
    "nodeRepl.write(weatherTechRegression.formatRegressionReport(weatherTechRegressionResult));",
    "if (!weatherTechRegressionResult.ok) { throw new Error(`${weatherTechRegressionResult.failureCount} WeatherTech OS regression group(s) failed.`); }",
  ].join("\n");
}

export async function runWeatherTechOsRegression({
  browser,
  nodeRepl,
  baseUrl = BASE_URL,
  cwd = nodeRepl?.cwd ?? ".",
  progressPath = null,
  groups = DEFAULT_GROUPS,
} = {}) {
  if (!browser) {
    throw new Error("A Codex in-app browser instance is required.");
  }

  const env = readLocalEnv(cwd);
  const progress = createProgressLogger(progressPath);
  const enabledGroups = new Set(groups);
  const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const results = [];
  const commands = [
    `await import("${new URL(import.meta.url).pathname}").then((module) => module.runWeatherTechOsRegression({ browser, nodeRepl }))`,
  ];
  let seededJob = null;

  const record = async (name, fn) => {
    try {
      progress(`record:${name}:start`);
      const details = await fn();
      results.push({ name, status: "passed", details });
      progress(`record:${name}:passed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        name,
        status: "failed",
        error: message,
      });
      progress(`record:${name}:failed:${message}`);
    }
  };

  let cleanup = { before: null, after: null };

  try {
    const leadNameColumn = await detectLeadNameColumn(env);
    progress("cleanup:before:start");
    cleanup.before = await cleanupTestRecords(env, "", leadNameColumn);
    progress("cleanup:before:done");
    const companies = await findCompanies(env);
    const { weatherTech } = companies;
    progress("seed:start");
    seededJob = await seedTestJob(env, weatherTech.id, runId);
    progress("seed:done");

    const tab = await getTab(browser);
    await ensureAppShell(tab, baseUrl, progress);

    const shouldRunLeadWorkflow =
      enabledGroups.has("crm") ||
      enabledGroups.has("crm-leads") ||
      enabledGroups.has("crm-inbox");
    const shouldRunEstimatesWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-estimates");
    const shouldSeedLeadForEstimates =
      enabledGroups.has("crm-estimates") && !shouldRunLeadWorkflow;
    const shouldRunCustomersWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-customers");
    const shouldRunInboxWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-inbox");
    const shouldReloadFreshSnapshot =
      shouldRunLeadWorkflow ||
      shouldRunEstimatesWorkflow ||
      shouldRunCustomersWorkflow ||
      shouldRunInboxWorkflow ||
      enabledGroups.has("lead-intake");

    if (shouldReloadFreshSnapshot) {
      progress("fresh-snapshot:reload:start");
      await tab.reload();
      await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
      await ensureAppShell(tab, baseUrl, progress);
      progress("fresh-snapshot:reload:done");
    }

    if (
      enabledGroups.has("inspections") ||
      enabledGroups.has("jobs-workspace") ||
      enabledGroups.has("job-builder") ||
      enabledGroups.has("job-production")
    ) {
      progress("seeded-job:reload:start");
      await tab.reload();
      await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
      await ensureAppShell(tab, baseUrl, progress);
      progress("seeded-job:reload:done");
    }

    if (enabledGroups.has("dashboard")) {
      await record("Dashboard loads in live Supabase mode", () =>
        testDashboardLiveMode(tab),
      );
    }

    if (enabledGroups.has("settings")) {
      await record("Settings Integration Center displays provider readiness", () =>
        testSettingsIntegrationCenter(tab),
      );
    }

    if (enabledGroups.has("calendar")) {
      await record("Calendar screen opens with schedule metrics", () =>
        testCalendarScreen(tab),
      );
    }

    let leadWorkflow = null;
    let jobBuilderWorkflow = null;

    if (shouldRunLeadWorkflow) {
      await record("Leads list opens and isolated lead can be created and updated", async () => {
        leadWorkflow = await testLeadsWorkflow(tab, env, weatherTech, runId, leadNameColumn);
        return leadWorkflow;
      });
    } else if (shouldSeedLeadForEstimates) {
      progress("lead:seed-for-estimates:start");
      leadWorkflow = await seedTestLead(env, weatherTech.id, runId, leadNameColumn);
      await tab.reload();
      await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
      await ensureAppShell(tab, baseUrl, progress);
      progress("lead:seed-for-estimates:done");
    }

    if (shouldRunEstimatesWorkflow) {
      await record("Estimates screen opens and isolated draft estimate can be created", async () => {
        if (!leadWorkflow) {
          throw new Error("Lead workflow did not produce a test lead.");
        }

        return testEstimatesWorkflow(tab, env, weatherTech, leadWorkflow, runId);
      });
    }

    if (shouldRunCustomersWorkflow) {
      await record("Customers list opens and isolated customer can be created and updated", () =>
        testCustomersWorkflow(tab, env, weatherTech, runId),
      );
    }

    if (shouldRunInboxWorkflow) {
      await record("Unified Inbox search and activity filters narrow CRM activity", async () => {
        if (!leadWorkflow) {
          throw new Error("Lead workflow did not produce a test lead.");
        }

        return testUnifiedInboxSearchAndFilters(tab, leadWorkflow);
      });
    }

    if (enabledGroups.has("lead-intake")) {
      await record("Unified Website and Yelp lead intake routes, deduplicates, logs, retries, and appears in CRM", () =>
        testUnifiedLeadIntake(
          tab,
          env,
          companies,
          runId,
          baseUrl,
          leadNameColumn,
          progress,
        ),
      );
    }

    if (enabledGroups.has("themes")) {
      await record("WeatherTech Roofing LLC theme keeps purple primary and orange accent", () =>
        testTheme(tab, "WeatherTech Roofing LLC", "purple", "orange"),
      );

      await record("IHC Painting switches to orange-focused theme", () =>
        testTheme(tab, "IHC Painting", "orange"),
      );
    }

    if (enabledGroups.has("layout")) {
      await record("Dashboard quick actions do not overlap at laptop width", () =>
        testQuickActionsDoNotOverlap(browser, tab),
      );
    }

    if (enabledGroups.has("inspections")) {
      await record("Inspections module opens, validates, and runs live workflow when migration is available", () =>
        testInspectionsWorkflow(tab, env, weatherTech, seededJob, runId, progress),
      );
    }

    if (enabledGroups.has("jobs-workspace")) {
      await record("Jobs workspace filters and section navigation render", () =>
        testJobsWorkspaceFiltersAndSections(browser, tab, weatherTech, seededJob),
      );
    }

    if (enabledGroups.has("job-builder")) {
      await record("Jobs screen opens and isolated draft job can be edited and scheduled", async () => {
        jobBuilderWorkflow = await testJobBuilderEditAndSchedule(tab, env, seededJob, runId, progress);
        return jobBuilderWorkflow;
      });
    }

    if (enabledGroups.has("job-production")) {
      await record("Job workflow scroll and refresh regression flows", () =>
        (async () => {
          const viewport = await browser.capabilities.get("viewport");
          await viewport.set(LAPTOP_VIEWPORT);
          return runUiMutationTests(
            tab,
            env,
            {
              ...seededJob,
              title: jobBuilderWorkflow?.updatedJobTitle ?? seededJob.title,
            },
            runId,
            progress,
          );
        })(),
      );
    }
  } finally {
    progress("cleanup:after:start");
    cleanup.after = await cleanupTestRecords(env, runId);
    progress("cleanup:after:done");
    try {
      const viewport = await browser.capabilities.get("viewport");
      await viewport.reset();
      progress("viewport:reset:done");
    } catch {
      // Ignore viewport reset failures; results above are still valid.
    }
  }

  const failureCount = results.filter((result) => result.status === "failed").length;

  return {
    ok: failureCount === 0,
    failureCount,
    groups,
    runId,
    testPrefix: TEST_PREFIX,
    seededJobTitle: seededJob?.title ?? null,
    cleanup,
    commands,
    results,
  };
}

if (
  typeof process !== "undefined" &&
  process.argv?.[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log("Run this suite from a signed-in Codex in-app Browser session:");
  console.log("");
  console.log(getCodexBrowserRegressionCommand({ cwd: process.cwd() }));
}
