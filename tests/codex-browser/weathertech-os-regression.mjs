import {
  createCipheriv,
  createHash,
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

async function postAppJson(baseUrl, path, payload) {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
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
  const tabs = await browser.tabs.list();
  const selected = await browser.tabs.selected();

  if (selected) {
    const selectedUrl = await selected.url().catch(() => "");

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

async function clickVisibleButtonByText(tab, selector, text, label, mode = "exact") {
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
    15000,
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
    15000,
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
  await tab.playwright.waitForTimeout(200);
  const box = await waitFor(
    tab,
    (targetLabel) => {
      const button = [...document.querySelectorAll("nav button")].find(
        (candidate) => candidate.textContent?.trim() === targetLabel,
      );

      if (!button) {
        return null;
      }

      const rect = button.getBoundingClientRect();

      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom < 0 ||
        rect.top > window.innerHeight
      ) {
        return null;
      }

      return {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
      };
    },
    `nav ${label}`,
    15000,
    label,
  );
  await tab.cua.click({ x: box.x, y: box.y });
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

function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function clickCompanyScope(tab, companyName) {
  await clickVisibleButtonByText(
    tab,
    "button[aria-pressed]",
    companyName,
    `company scope ${companyName}`,
    "paragraph",
  );
  await tab.playwright.waitForTimeout(600);
}

async function selectTestJob(tab, jobTitle) {
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await clickNav(tab, "Jobs");
  await fillUnique(tab.playwright.getByPlaceholder("Search jobs", { exact: true }), jobTitle, "job search");
  await tab.playwright.waitForTimeout(600);
  const jobCard = buttonContainingText(tab, jobTitle);
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

async function scrollTextIntoView(tab, text) {
  await tab.playwright.evaluate((targetText) => {
    const node = [...document.querySelectorAll("main *")]
      .find((element) => element.textContent?.trim() === targetText);

    node?.scrollIntoView({ block: "center", behavior: "auto" });
  }, text);
  await tab.playwright.waitForTimeout(250);
}

async function testTheme(tab, companyName, expectedPrimary, expectedAccent = null) {
  await clickNav(tab, "Dashboard");
  await clickCompanyScope(tab, companyName);

  const colors = await tab.playwright.evaluate(() => {
    const main = document.querySelector("main");
    const styles = getComputedStyle(main);
    const getCustomProperty = (name) => styles.getPropertyValue(name).trim();
    const resolve = (value) => {
      const match = value.match(/^var\((--[^),]+)\)$/);
      return match ? getCustomProperty(match[1]) : value;
    };
    const primary = resolve(getCustomProperty("--wt-primary"));
    const accent = resolve(getCustomProperty("--wt-accent"));
    const hasPaintingClass = main.classList.contains("wt-company-painting");

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
  await clickNav(tab, "Dashboard");

  const state = await tab.playwright.evaluate(() => {
    const text = document.body.innerText;
    const main = document.querySelector("main");

    return {
      hasDemoBanner: text.includes("Using local demo CRM data"),
      hasLiveDataError: text.includes("LIVE DATA ERROR"),
      hasDashboardMetrics:
        text.includes("Open leads") &&
        text.includes("Open estimates") &&
        text.includes("Active jobs"),
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

  return state;
}

async function testLeadsWorkflow(tab, env, company, runId, leadNameColumn) {
  const leadName = `${TEST_PREFIX} ${runId} LEAD`;
  const updatedNote = `${TEST_PREFIX} ${runId} LEAD UPDATED`;
  const leadAddress = "456 TEST Regression Lead Ave, Phoenix, AZ";
  const leadPhone = "6025550100";
  const leadEmail = `regression-${runId}@example.test`;

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
  await clickVisibleButtonByText(tab, "button", "Create lead", "Create lead");
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `created lead ${leadName}`,
    15000,
    leadName,
  );

  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), leadName, "lead search");
  await tab.playwright.waitForTimeout(500);
  await clickVisibleButtonByText(tab, "button", leadName, `lead card ${leadName}`, "paragraph");

  await selectUnique(
    tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Save lead"]]//select[@name="pipeline_stage"]'),
    "estimate_scheduled",
    "lead pipeline stage",
  );
  await selectUnique(
    tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Save lead"]]//select[@name="priority"]'),
    "high",
    "lead priority",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//button[normalize-space(.)="Save lead"]]//textarea[@name="notes"]'),
    updatedNote,
    "lead update notes",
  );
  await clickVisibleButtonByText(tab, "button", "Save lead", "Save lead");
  await waitFor(
    tab,
    (note) => document.body.innerText.includes(note),
    `updated lead note ${updatedNote}`,
    15000,
    updatedNote,
  );

  const savedLead = await findLeadByContactName(env, leadName, leadNameColumn);

  if (!savedLead) {
    throw new Error("Created lead was not found through Supabase.");
  }

  if (savedLead.pipeline_stage !== "estimate_scheduled") {
    throw new Error(`Saved lead pipeline stage was ${savedLead.pipeline_stage}.`);
  }

  if (savedLead.notes !== updatedNote) {
    throw new Error("Saved lead note did not persist.");
  }

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
  await clickVisibleButtonByText(
    tab,
    "button",
    "Create lead",
    "Create duplicate lead",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Possible duplicate lead"),
    "duplicate lead protection",
    10000,
  );

  return {
    leadId: savedLead.id,
    leadName,
    pipelineStage: savedLead.pipeline_stage,
    priority: savedLead.priority,
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
  await clickVisibleButtonByText(tab, "button", "Create customer", "Create customer");
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `created customer ${displayName}`,
    15000,
    displayName,
  );

  const createdCustomer = await waitForAsync(
    () => findCustomerByDisplayName(env, displayName),
    `Supabase customer ${displayName}`,
    15000,
  );

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
  await clickVisibleButtonByText(
    tab,
    "button",
    displayName,
    `customer row ${displayName}`,
    "paragraph",
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
  await clickVisibleButtonByText(tab, "button", "Save customer", "Save customer");
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
    15000,
    { name: updatedDisplayName, notes: updatedNotes },
  );

  const updatedCustomer = await waitForAsync(
    () => findCustomerByDisplayName(env, updatedDisplayName),
    `Supabase updated customer ${updatedDisplayName}`,
    15000,
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

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="customer-workspace"]');
      const quickActions = workspace?.querySelector('[data-testid="customer-quick-actions"]');
      const workspaceText = workspace?.textContent ?? "";
      const quickActionText = quickActions?.textContent ?? "";

      return (
        workspaceText.includes("Customer workspace") &&
        quickActionText.includes("New Estimate") &&
        workspaceText.includes("Future Communications")
      );
    },
    "customer workspace sections and quick actions",
    10000,
  );

  await clickUnique(
    tab.playwright.locator('xpath=//*[@data-testid="customer-workspace"]//button[contains(normalize-space(.), "Activity")]'),
    "customer activity workspace tab",
  );
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Customer note") &&
      document.body.innerText.includes("Customer created"),
    "customer activity timeline",
    10000,
  );
  await clickUnique(
    tab.playwright.locator('xpath=//*[@data-testid="customer-workspace"]//button[contains(normalize-space(.), "Notes")]'),
    "customer notes workspace tab",
  );
  await waitFor(
    tab,
    (notes) => document.body.innerText.includes(notes),
    "customer notes workspace section",
    10000,
    updatedNotes,
  );
  await clickUnique(
    tab.playwright.locator('xpath=//*[@data-testid="customer-workspace"]//button[contains(normalize-space(.), "Add Note")]'),
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
  await clickVisibleButtonByText(
    tab,
    "button",
    "Create customer",
    "Create duplicate customer",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Possible duplicate customer"),
    "duplicate customer protection",
    10000,
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
    () => document.body.innerText.includes("Lead and communication activity"),
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
    tab.playwright.locator('xpath=//button[contains(normalize-space(.), "Website")]'),
    "Website inbox source filter",
  );
  await waitFor(
    tab,
    (leadName) => {
      const text = document.body.innerText;

      return (
        text.includes(leadName) &&
        text.includes("Website") &&
        text.includes("Lead")
      );
    },
    "filtered inbox lead",
    10000,
    leadWorkflow.leadName,
  );
  await clickUnique(tab.playwright.getByRole("button", { name: "Clear" }), "Clear inbox filters");
  await waitFor(
    tab,
    () => {
      const search = document.querySelector('[data-testid="inbox-search"]');
      const kind = document.querySelector('[data-testid="inbox-kind-filter"]');

      return (
        document.body.innerText.includes("Recent activity") &&
        search?.tagName === "INPUT" &&
        search.value === "" &&
        kind?.tagName === "SELECT" &&
        kind.value === "all"
      );
    },
    "cleared inbox filters",
    10000,
  );

  return {
    search: "passed",
    kindFilter: "Lead",
    providerFilter: "Website",
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

  progress("lead-intake:website:create:start");
  const websitePayload = {
    business: "WeatherTech",
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
  const websiteSensitiveValues = [
    websiteLeadName,
    websitePayload.phone,
    websitePayload.email,
    websitePayload.address,
    websitePayload.message,
  ];
  const websiteCreate = await postAppJson(baseUrl, "/api/leads/website", websitePayload);

  if (websiteCreate.status !== 201 || !websiteCreate.body?.ok) {
    throw new Error(`Website intake create failed: ${websiteCreate.status} ${JSON.stringify(websiteCreate.body)}`);
  }

  if (!websiteCreate.body.leadId) {
    throw new Error("Website intake did not return a leadId.");
  }
  progress("lead-intake:website:create:done");

  progress("lead-intake:website:duplicate:start");
  const websiteDuplicate = await postAppJson(baseUrl, "/api/leads/website", websitePayload);

  if (websiteDuplicate.status !== 200 || !websiteDuplicate.body?.ok) {
    throw new Error(`Website intake duplicate failed: ${websiteDuplicate.status} ${JSON.stringify(websiteDuplicate.body)}`);
  }

  if (!String(websiteDuplicate.body.status).includes("duplicate")) {
    throw new Error(`Website duplicate status was ${websiteDuplicate.body.status}.`);
  }

  if (websiteDuplicate.body.leadId !== websiteCreate.body.leadId) {
    throw new Error("Website duplicate did not return the original leadId.");
  }
  progress("lead-intake:website:duplicate:done");

  const websiteLeads = await findLeadsByContactName(env, websiteLeadName, leadNameColumn);

  if (websiteLeads.length !== 1) {
    throw new Error(`Website intake created ${websiteLeads.length} matching leads, expected 1.`);
  }

  const websiteLead = websiteLeads[0];

  if (websiteLead.company_id !== companies.weatherTech.id) {
    throw new Error("Website intake did not route to WeatherTech Roofing LLC.");
  }

  if (!getLeadRowSource(websiteLead).toLowerCase().includes("website")) {
    throw new Error(`Website lead source was ${getLeadRowSource(websiteLead)}.`);
  }

  if (!String(websiteLead.notes ?? "").includes(websiteExternalId)) {
    throw new Error("Website lead notes did not preserve external lead ID.");
  }

  const websiteLogs = await findIntegrationLogsByExternalId(env, "website", websiteExternalId);
  const websiteStatuses = websiteLogs.map((log) => log.status);

  if (!websiteStatuses.includes("succeeded") || !websiteStatuses.includes("skipped")) {
    throw new Error(`Website intake logs did not include succeeded and skipped statuses: ${websiteStatuses.join(", ")}`);
  }

  const websiteSuccessLog = websiteLogs.find((log) => log.status === "succeeded");

  if (!websiteSuccessLog?.request_fingerprint) {
    throw new Error("Website intake success log did not store a request fingerprint.");
  }

  if (websiteSuccessLog.related_record_id !== websiteCreate.body.leadId) {
    throw new Error("Website intake success log was not associated with the created lead.");
  }

  for (const log of websiteLogs) {
    assertNoSensitiveRequestSummary(log, websiteSensitiveValues, "Website intake");
  }

  progress("lead-intake:yelp:create:start");
  const yelpPayload = {
    business: "IHC",
    source: "Yelp",
    yelpBusinessId: `${TEST_PREFIX} ${runId} IHC YELP ACCOUNT`,
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
  const yelpSensitiveValues = [
    yelpLeadName,
    yelpPayload.phone,
    yelpPayload.email,
    yelpPayload.message,
  ];
  const yelpCreate = await postAppJson(baseUrl, "/api/leads/yelp", yelpPayload);

  if (yelpCreate.status !== 201 || !yelpCreate.body?.ok) {
    throw new Error(`Yelp intake create failed: ${yelpCreate.status} ${JSON.stringify(yelpCreate.body)}`);
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

  if (!getLeadRowServiceType(yelpLead).toLowerCase().includes("paint")) {
    throw new Error(`Yelp service type was ${getLeadRowServiceType(yelpLead)}.`);
  }

  const yelpLogs = await findIntegrationLogsByExternalId(env, "yelp", yelpExternalId);

  if (!yelpLogs.some((log) => log.status === "succeeded")) {
    throw new Error("Yelp intake did not write a succeeded sync log.");
  }

  for (const log of yelpLogs) {
    assertNoSensitiveRequestSummary(log, yelpSensitiveValues, "Yelp intake");
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
    { websiteName: websiteLeadName, yelpName: yelpLeadName },
  );

  await clickNav(tab, "Leads");
  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), websiteLeadName, "website lead search");
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name) && document.body.innerText.includes("Website"),
    "Website source badge in Leads",
    15000,
    websiteLeadName,
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
    websiteLeadId: websiteCreate.body.leadId,
    websiteDuplicateStatus: websiteDuplicate.body.status,
    yelpLeadId: yelpCreate.body.leadId,
    retryLeadId: retryLead.id,
    retryLogId: failedLog.id,
    websiteLogStatuses: websiteStatuses,
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

  const newEstimateButton = tab.playwright.locator('xpath=//section[@id="estimate-builder"]//button[normalize-space(.)="New Estimate"]');
  if ((await newEstimateButton.count()) === 1) {
    await clickVisibleButtonByText(tab, "button", "New Estimate", "New Estimate");
    await tab.playwright.waitForTimeout(500);
  }

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
  await clickVisibleButtonByText(tab, "button", "Create estimate", "Create estimate");
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

  if (overlaps.checked < 4) {
    throw new Error(`Expected at least 4 dashboard quick-action buttons, checked ${overlaps.checked}.`);
  }

  if (overlaps.collisions.length) {
    throw new Error(`Found ${overlaps.collisions.length} overlapping quick-action button pairs.`);
  }

  return overlaps;
}

async function testJobsWorkspaceFiltersAndSections(tab, company, testJob) {
  await selectTestJob(tab, testJob.title);

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
    "jobs scheduled no-results filter",
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
    await clickUnique(tab.playwright.getByRole("tab", { name: section }), `job workspace ${section} tab`);
    await waitFor(
      tab,
      (label) => {
        const selected = document.querySelector('[role="tab"][aria-selected="true"]');
        return selected?.textContent?.trim() === label;
      },
      `selected ${section} job workspace tab`,
      10000,
      section,
    );
  }

  return {
    search: "passed",
    filters: ["company", "service", "crew", "schedule"],
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
  await clickUnique(
    tab.playwright.locator('xpath=//aside//form//button[@type="submit"]'),
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
  await clickUnique(tab.playwright.getByRole("button", { name: "Field mode" }), "Field mode");
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return text.includes("quick capture") && text.includes("estimate-ready by default");
    },
    "inspection quick capture panel",
  );
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
    await tab.playwright.locator(`xpath=//form[.//h4[normalize-space(.)="Add finding"]]//input[@name="${name}"]`).check();
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
  const inspectionWithMeasurement = await waitForAsync(
    async () => {
      const inspection = await findInspectionByTitle(env, inspectionTitle);

      return inspection?.measurements?.some((measurement) => measurement.label === measurementLabel)
        ? inspection
        : null;
    },
    "inspection measurement persistence",
    15000,
  );
  progress("inspections:measurement:done");

  progress("inspections:note:start");
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add internal note"]]//textarea[@name="note"]'),
    fieldInternalNote,
    "inspection internal field note",
  );
  await clickUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Add internal note"]]//button[@type="submit"]'),
    "Add internal note",
  );
  const inspectionWithNote = await waitForAsync(
    async () => {
      const inspection = await findInspectionByTitle(env, inspectionTitle);

      return inspection?.internal_notes?.includes(fieldInternalNote) ? inspection : null;
    },
    "inspection internal note persistence",
    15000,
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Internal note added."),
    "inspection internal note UI acknowledgement",
    15000,
  );
  await waitForNoSavingState(tab, "inspection internal note save complete");
  progress("inspections:note:done");

  progress("inspections:estimate:start");
  await clickUnique(tab.playwright.getByRole("button", { name: "Estimate / report" }), "Estimate / report");
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Estimate review") &&
      document.body.innerText.includes("Optional roof report draft"),
    "inspection estimate/report panel",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Estimate review"]]//input[@name="estimate_title"]'),
    estimateTitle,
    "inspection estimate title",
  );
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
  await clickUnique(
    tab.playwright.locator('xpath=//form[.//h4[normalize-space(.)="Optional roof report draft"]]//button[@type="submit"]'),
    "Create report draft",
  );
  const report = await waitForAsync(
    () =>
      restRequest(env, `documents?select=id,title,body&title=eq.${encodeURIComponent(reportTitle)}&limit=1`)
        .then((rows) => rows[0]),
    `inspection report ${reportTitle}`,
    15000,
  );

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
  await clickUnique(
    tab.playwright.locator('[data-testid="inspection-cancel-button"]'),
    "Cancel inspection",
  );
  const cancelConfirmation = tab.playwright.locator(
    '[role="alertdialog"][aria-label="Cancel inspection confirmation"]',
  );
  await waitForUniqueLocator(cancelConfirmation, "cancel inspection confirmation");
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
  await clickUnique(
    tab.playwright.locator('[data-testid="inspection-restore-button"]'),
    "Restore inspection",
  );
  const restoreConfirmation = tab.playwright.locator(
    '[role="alertdialog"][aria-label="Restore inspection confirmation"]',
  );
  await waitForUniqueLocator(restoreConfirmation, "restore inspection confirmation");
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

async function runUiMutationTests(tab, testJob, runId, progress) {
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
  await clickUnique(tab.playwright.locator("button").filter({ hasText: testJob.title }), `job card ${testJob.title}`);
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
  results.addTask = await preserveScrollAround(
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

  await scrollTextIntoView(tab, addedTaskTitle);
  progress("job:status:start");
  results.changeTaskStatus = await preserveScrollAround(
    tab,
    async () => {
      const doneButton = tab.playwright.locator(`xpath=//*[normalize-space(.)="${addedTaskTitle}"]/ancestor::*[contains(@class,"rounded-lg")][1]//button[normalize-space(.)="Done"]`);
      await clickUnique(doneButton, "added task Done button");
      await waitFor(tab, () => document.body.innerText.includes("Checklist task marked Done."), "task status notice");
    },
    "changing task status",
  );
  progress("job:status:done");

  await scrollTextIntoView(tab, addedTaskTitle);
  progress("job:edit-task:start");
  results.editTask = await preserveScrollAround(
    tab,
    async () => {
      const editButton = tab.playwright.locator(`xpath=//*[normalize-space(.)="${addedTaskTitle}"]/ancestor::*[contains(@class,"rounded-lg")][1]//button[@title="Edit task"]`);
      await clickUnique(editButton, "added task edit button");
      const editTitleInput = tab.playwright.locator(`xpath=//form[.//*[normalize-space(.)="Save task"]]//input[@name="title"]`);
      await fillUnique(editTitleInput, editedTaskTitle, "edit task title");
      await clickUnique(tab.playwright.getByRole("button", { name: "Save task" }), "Save task");
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
  results.addNote = await preserveScrollAround(
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
  results.addMaterial = await preserveScrollAround(
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
  results.addSchedule = await preserveScrollAround(
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
    240,
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

    let leadWorkflow = null;
    let jobBuilderWorkflow = null;
    const shouldRunLeadWorkflow =
      enabledGroups.has("crm") ||
      enabledGroups.has("crm-leads") ||
      enabledGroups.has("crm-estimates") ||
      enabledGroups.has("crm-inbox");
    const shouldRunEstimatesWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-estimates");
    const shouldRunCustomersWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-customers");
    const shouldRunInboxWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-inbox");

    if (shouldRunLeadWorkflow) {
      await record("Leads list opens and isolated lead can be created and updated", async () => {
        leadWorkflow = await testLeadsWorkflow(tab, env, weatherTech, runId, leadNameColumn);
        return leadWorkflow;
      });
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
        testJobsWorkspaceFiltersAndSections(tab, weatherTech, seededJob),
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
        runUiMutationTests(
          tab,
          {
            ...seededJob,
            title: jobBuilderWorkflow?.updatedJobTitle ?? seededJob.title,
          },
          runId,
          progress,
        ),
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
