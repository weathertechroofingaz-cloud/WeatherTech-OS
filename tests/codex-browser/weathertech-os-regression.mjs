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
  const leads = await restRequest(
    env,
    `leads?select=id,${resolvedLeadNameColumn}&${resolvedLeadNameColumn}=like.${prefixFilter}`,
  );
  const scopedJobs = runId
    ? jobs.filter((job) => job.title.includes(runId))
    : jobs;
  const scopedEstimates = runId
    ? estimates.filter((estimate) => estimate.title.includes(runId))
    : estimates;
  const scopedLeads = runId
    ? leads.filter((lead) => String(lead[resolvedLeadNameColumn] ?? "").includes(runId))
    : leads;
  const jobIds = scopedJobs.map((job) => job.id);
  const estimateIds = scopedEstimates.map((estimate) => estimate.id);
  const leadIds = scopedLeads.map((lead) => lead.id);

  await deleteByLike(env, "integration_sync_logs", "external_id");

  if (!jobIds.length && !estimateIds.length && !leadIds.length) {
    return {
      jobsDeleted: 0,
      estimatesDeleted: 0,
      leadsDeleted: 0,
      integrationLogsDeleted: "requested",
    };
  }

  await deleteByLike(env, "schedule_events", "title");
  await deleteByLike(env, "documents", "title");
  await deleteByLike(env, "scopes", "title");
  await deleteByIds(env, "schedule_events", "job_id", jobIds);
  await deleteByIds(env, "schedule_events", "lead_id", leadIds);
  await deleteByIds(env, "job_tasks", "job_id", jobIds);
  await deleteByIds(env, "job_notes", "job_id", jobIds);
  await deleteByIds(env, "job_materials", "job_id", jobIds);
  await deleteByIds(env, "jobs", "id", jobIds);
  await deleteByIds(env, "estimate_line_items", "estimate_id", estimateIds);
  await deleteByIds(env, "estimates", "id", estimateIds);
  await deleteByIds(env, "leads", "id", leadIds);

  return {
    jobsDeleted: jobIds.length,
    estimatesDeleted: estimateIds.length,
    leadsDeleted: leadIds.length,
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

  while (Date.now() - startedAt < timeoutMs) {
    const result = await tab.playwright.evaluate(predicate, arg);

    if (result) {
      return result;
    }

    await tab.playwright.waitForTimeout(250);
  }

  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForUniqueLocator(locator, label, timeoutMs = 10000) {
  const startedAt = Date.now();
  let count = 0;

  while (Date.now() - startedAt < timeoutMs) {
    count = await locator.count();

    if (count === 1) {
      return;
    }

    if (count > 1) {
      throw new Error(`${label} expected 1 match, found ${count}.`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${label} expected 1 match, found ${count}.`);
}

async function clickUnique(locator, label) {
  await waitForUniqueLocator(locator, label);
  await locator.click({ timeoutMs: 8000 });
}

async function fillUnique(locator, value, label) {
  await waitForUniqueLocator(locator, label);
  await locator.fill(value, { timeoutMs: 8000 });
}

async function selectUnique(locator, value, label) {
  await waitForUniqueLocator(locator, label);
  await locator.selectOption(value, { timeoutMs: 8000 });
}

async function clickNav(tab, label) {
  await clickUnique(
    tab.playwright.locator("nav").getByRole("button", { name: label }),
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

function toDateTimeLocalValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function clickCompanyScope(tab, companyName) {
  const button = tab.playwright.locator(
    `xpath=//button[@aria-pressed and contains(normalize-space(.), ${xpathString(companyName)})]`,
  );
  await clickUnique(button, `company scope ${companyName}`);
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
    "456 TEST Regression Lead Ave, Phoenix, AZ",
    "lead property address",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="phone"]'),
    "6025550100",
    "lead phone",
  );
  await fillUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//input[@name="email"]'),
    `regression-${runId}@example.test`,
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
  await clickUnique(
    tab.playwright.locator('xpath=//h3[normalize-space(.)="New lead"]/ancestor::section[1]//button[@type="submit"]'),
    "Create lead",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `created lead ${leadName}`,
    15000,
    leadName,
  );

  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), leadName, "lead search");
  await tab.playwright.waitForTimeout(500);
  await clickUnique(buttonContainingText(tab, leadName), `lead card ${leadName}`);

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
  await clickUnique(tab.playwright.getByRole("button", { name: "Save lead" }), "Save lead");
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

  return {
    leadId: savedLead.id,
    leadName,
    pipelineStage: savedLead.pipeline_stage,
    priority: savedLead.priority,
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
    await newEstimateButton.click({ timeoutMs: 8000 });
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
  await clickUnique(
    tab.playwright.locator('xpath=//section[@id="estimate-builder"]//form//button[@type="submit"]'),
    "Create estimate",
  );
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
      results.push({
        name,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      progress(`record:${name}:failed`);
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

    if (enabledGroups.has("job-builder") || enabledGroups.has("job-production")) {
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

    if (enabledGroups.has("crm")) {
      await record("Leads list opens and isolated lead can be created and updated", async () => {
        leadWorkflow = await testLeadsWorkflow(tab, env, weatherTech, runId, leadNameColumn);
        return leadWorkflow;
      });

      await record("Estimates screen opens and isolated draft estimate can be created", async () => {
        if (!leadWorkflow) {
          throw new Error("Lead workflow did not produce a test lead.");
        }

        return testEstimatesWorkflow(tab, env, weatherTech, leadWorkflow, runId);
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
