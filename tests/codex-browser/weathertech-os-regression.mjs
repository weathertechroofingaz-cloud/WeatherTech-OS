import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { appendFileSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BASE_URL = "http://localhost:3000/";
const TEST_PREFIX = "TEST WTOS REGRESSION";
const LAPTOP_VIEWPORT = { width: 1366, height: 768 };
const DEFAULT_GROUPS = [
  "dashboard",
  "operations",
  "field-operations",
  "crm",
  "communications",
  "sales-pipeline",
  "lead-intake-workspace",
  "lead-intake",
  "marketing",
  "themes",
  "layout",
  "settings",
  "production-readiness",
  "documents",
  "customer-portal",
  "financial",
  "analytics",
  "calendar",
  "dispatch",
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

function isMissingRelationError(error) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("Could not find") ||
    message.includes("PGRST205") ||
    message.includes("42P01")
  );
}

async function deleteByLikeIfPresent(env, table, column, prefix = TEST_PREFIX) {
  try {
    await deleteByLike(env, table, column, prefix);
    return "requested";
  } catch (error) {
    if (isMissingRelationError(error)) {
      return "table_missing";
    }

    throw error;
  }
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

async function detectDocumentStorageWorkflowSupport(env) {
  try {
    await restRequest(
      env,
      [
        "documents?select=",
        encodeURIComponent(
          "id,lead_id,inspection_id,file_name,file_size_bytes,mime_type,storage_bucket,storage_path,uploaded_by,uploaded_at,archived_at,property_address,tags,requirement_level,required_for",
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
  const documents = await restRequest(
    env,
    `documents?select=id,title&title=like.${prefixFilter}`,
  );
  const invoices = await restRequest(
    env,
    `invoices?select=id,title&title=like.${prefixFilter}`,
  );
  const changeOrders = await restRequest(
    env,
    `change_orders?select=id,title&title=like.${prefixFilter}`,
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
  const scopedDocuments = runId
    ? documents.filter((document) => document.title.includes(runId))
    : documents;
  const scopedInvoices = runId
    ? invoices.filter((invoice) => invoice.title.includes(runId))
    : invoices;
  const scopedChangeOrders = runId
    ? changeOrders.filter((changeOrder) => changeOrder.title.includes(runId))
    : changeOrders;
  const scopedLeads = runId
    ? leads.filter((lead) => String(lead[resolvedLeadNameColumn] ?? "").includes(runId))
    : leads;
  const scopedCustomers = runId
    ? customers.filter((customer) => String(customer.display_name ?? "").includes(runId))
    : customers;
  const jobIds = scopedJobs.map((job) => job.id);
  const estimateIds = scopedEstimates.map((estimate) => estimate.id);
  const inspectionIds = scopedInspections.map((inspection) => inspection.id);
  const documentIds = scopedDocuments.map((document) => document.id);
  const invoiceIds = scopedInvoices.map((invoice) => invoice.id);
  const changeOrderIds = scopedChangeOrders.map((changeOrder) => changeOrder.id);
  const leadIds = scopedLeads.map((lead) => lead.id);
  const customerIds = scopedCustomers.map((customer) => customer.id);

  const communicationCleanup = {
    integrationLogsDeleted: await deleteByLikeIfPresent(env, "integration_sync_logs", "external_id"),
    leadIntakeDeleted: await deleteByLikeIfPresent(env, "lead_intake_records", "correlation_id"),
    callRecordsDeleted: await deleteByLikeIfPresent(env, "call_records", "correlation_id"),
    providerEventsDeleted: await deleteByLikeIfPresent(
      env,
      "communication_provider_events",
      "correlation_id",
    ),
    smsMessagesDeleted: await deleteByLikeIfPresent(env, "sms_messages", "correlation_id"),
    emailMessagesDeleted: await deleteByLikeIfPresent(env, "email_messages", "subject"),
    businessPhoneRoutesDeleted: await deleteByLikeIfPresent(
      env,
      "business_phone_numbers",
      "routing_key",
    ),
  };

  if (
    !jobIds.length &&
    !estimateIds.length &&
    !inspectionIds.length &&
    !documentIds.length &&
    !invoiceIds.length &&
    !changeOrderIds.length &&
    !leadIds.length &&
    !customerIds.length
  ) {
    return {
      jobsDeleted: 0,
      estimatesDeleted: 0,
      inspectionsDeleted: 0,
      documentsDeleted: 0,
      invoicesDeleted: 0,
      changeOrdersDeleted: 0,
      leadsDeleted: 0,
      customersDeleted: 0,
        ...communicationCleanup,
      };
    }

  await deleteByLike(env, "schedule_events", "title");
  await deleteByLike(env, "scopes", "title");
  await deleteByIds(env, "signatures", "document_id", documentIds);
  await deleteByIds(env, "inspections", "id", inspectionIds);
  await deleteByIds(env, "schedule_events", "job_id", jobIds);
  await deleteByIds(env, "schedule_events", "lead_id", leadIds);
  await deleteByIds(env, "daily_logs", "job_id", jobIds);
  await deleteByIds(env, "job_tasks", "job_id", jobIds);
  await deleteByIds(env, "job_notes", "job_id", jobIds);
  await deleteByIds(env, "job_materials", "job_id", jobIds);
  await deleteByIds(env, "job_photos", "job_id", jobIds);
  await deleteByIds(env, "payments", "invoice_id", invoiceIds);
  await deleteByIds(env, "invoice_line_items", "invoice_id", invoiceIds);
  await deleteByIds(env, "jobs", "id", jobIds);
  await deleteByIds(env, "estimate_line_items", "estimate_id", estimateIds);
  await deleteByIds(env, "documents", "id", documentIds);
  await deleteByIds(env, "invoices", "id", invoiceIds);
  await deleteByIds(env, "change_orders", "id", changeOrderIds);
  await deleteByIds(env, "estimates", "id", estimateIds);
  await deleteByIds(env, "leads", "id", leadIds);
  await deleteByIds(env, "customers", "id", customerIds);

  return {
    jobsDeleted: jobIds.length,
    estimatesDeleted: estimateIds.length,
    inspectionsDeleted: inspectionIds.length,
    documentsDeleted: documentIds.length,
    invoicesDeleted: invoiceIds.length,
    changeOrdersDeleted: changeOrderIds.length,
    leadsDeleted: leadIds.length,
    customersDeleted: customerIds.length,
      ...communicationCleanup,
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

async function findJobTasksByTitle(env, jobId, title) {
  return restRequest(
    env,
    `job_tasks?select=id,title,status,description&job_id=eq.${jobId}&title=eq.${encodeURIComponent(title)}`,
  );
}

async function findDailyLogByWorkCompleted(env, jobId, workCompleted) {
  const rows = await restRequest(
    env,
    `daily_logs?select=id,job_id,work_completed,blockers,tomorrow_plan,weather_summary&job_id=eq.${jobId}&work_completed=eq.${encodeURIComponent(workCompleted)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function findJobNoteContaining(env, jobId, text) {
  const rows = await restRequest(
    env,
    `job_notes?select=id,job_id,note&job_id=eq.${jobId}`,
  );

  return rows.find((row) => String(row.note ?? "").includes(text)) ?? null;
}

async function seedTestLead(env, companyId, runId, leadNameColumn, suffix = "LEAD") {
  const leadName = `${TEST_PREFIX} ${runId} ${suffix}`;
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

async function seedCommunicationHubRecords(env, companies, leadWorkflow, runId) {
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const fakeBusinessPhone = `+1602555${runId.slice(-4)}`;
  const fakeCustomerPhone = `+1480555${runId.slice(-4)}`;
  const alternateCustomerPhone = `+1480666${runId.slice(-4)}`;

  const [businessPhoneRoute] = await restRequest(env, "business_phone_numbers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      provider: "twilio",
      phone_number_e164: fakeBusinessPhone,
      display_name: `${TEST_PREFIX} ${runId} Phoenix Office Line`,
      routing_key: `${TEST_PREFIX} ${runId} PHOENIX PHONE ROUTE`,
      business_location: "Phoenix",
      team_queue: "Office",
      lead_source: "Phone",
      communication_channel: "sms_voice",
      routing_status: "active",
      settings: { testRunId: runId },
    }),
  });

  const [missedCall] = await restRequest(env, "call_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      business_phone_number_id: businessPhoneRoute.id,
      lead_id: leadWorkflow.leadId,
      provider: "twilio",
      direction: "inbound",
      call_status: "missed",
      from_phone: fakeCustomerPhone,
      to_phone: fakeBusinessPhone,
      business_phone: fakeBusinessPhone,
      customer_phone: fakeCustomerPhone,
      routing_status: "matched",
      started_at: twoHoursAgo,
      ended_at: oneHourAgo,
      duration_seconds: 0,
      recording_status: "not_requested",
      transcript_status: "not_requested",
      follow_up_required: true,
      correlation_id: `${TEST_PREFIX} ${runId} MISSED CALL`,
      metadata: { testRunId: runId },
    }),
  });

  const [voicemail] = await restRequest(env, "call_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      business_phone_number_id: businessPhoneRoute.id,
      provider: "twilio",
      direction: "inbound",
      call_status: "voicemail",
      from_phone: alternateCustomerPhone,
      to_phone: fakeBusinessPhone,
      business_phone: fakeBusinessPhone,
      customer_phone: alternateCustomerPhone,
      routing_status: "unassigned",
      started_at: twoHoursAgo,
      ended_at: oneHourAgo,
      duration_seconds: 38,
      recording_sid: `${TEST_PREFIX} ${runId} RECORDING`,
      recording_status: "completed",
      transcript_status: "queued",
      follow_up_required: true,
      correlation_id: `${TEST_PREFIX} ${runId} VOICEMAIL`,
      metadata: { testRunId: runId },
    }),
  });

  const [providerFailure] = await restRequest(env, "communication_provider_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      business_phone_number_id: businessPhoneRoute.id,
      lead_id: leadWorkflow.leadId,
      provider: "twilio",
      event_type: "sms_status",
      channel: "sms",
      direction: "outbound",
      status: "undelivered",
      from_phone: fakeBusinessPhone,
      to_phone: fakeCustomerPhone,
      business_phone: fakeBusinessPhone,
      customer_phone: fakeCustomerPhone,
      routing_status: "matched",
      correlation_id: `${TEST_PREFIX} ${runId} PROVIDER FAILURE`,
      request_fingerprint: `${TEST_PREFIX} ${runId} REQUEST FINGERPRINT`,
      payload_summary: { event: "delivery_status", testRunId: runId },
      response_summary: { status: "undelivered" },
      error_code: "test_undelivered",
      error_message: "TEST seeded SMS delivery failure.",
      occurred_at: oneHourAgo,
    }),
  });

  const [smsFailure] = await restRequest(env, "sms_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      lead_id: leadWorkflow.leadId,
      business_phone_number_id: businessPhoneRoute.id,
      provider: "twilio_sms",
      category: "general",
      status: "failed",
      direction: "outbound",
      delivery_status: "failed",
      to_phone: fakeCustomerPhone,
      from_phone: fakeBusinessPhone,
      body: `${TEST_PREFIX} ${runId} failed SMS body`,
      queued_at: twoHoursAgo,
      failed_at: oneHourAgo,
      correlation_id: `${TEST_PREFIX} ${runId} SMS FAILURE`,
      metadata: { testRunId: runId },
      last_error: "TEST seeded SMS failure.",
    }),
  });

  const [emailMessage] = await restRequest(env, "email_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      provider: "gmail",
      category: "follow_up",
      status: "queued",
      to_email: `communications-${runId}@example.test`,
      subject: `${TEST_PREFIX} ${runId} EMAIL THREAD`,
      body: `${TEST_PREFIX} ${runId} queued email thread body`,
      queued_at: oneHourAgo,
    }),
  });

  const [websiteIntake] = await restRequest(env, "lead_intake_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.weatherTech.id,
      linked_lead_id: leadWorkflow.leadId,
      provider: "website",
      provider_event_id: `${TEST_PREFIX} ${runId} WEBSITE EVENT`,
      source: "Website",
      source_detail: "WeatherTech Phoenix website",
      campaign: `${TEST_PREFIX} ${runId} Website Campaign`,
      correlation_id: `${TEST_PREFIX} ${runId} WEBSITE INBOX`,
      company_key: "weathertech_roofing",
      branch_key: "weathertech_phoenix",
      routing_status: "ready_to_create",
      status: "new",
      duplicate_confidence: "possible_match",
      follow_up_state: "required",
      urgency: "high",
      assigned_queue: "Sales",
      contact_name: `${TEST_PREFIX} ${runId} Website Inbox Lead`,
      phone: fakeCustomerPhone,
      email: `website-inbox-${runId}@example.test`,
      service_address: "555 TEST Communication Roof Rd, Phoenix, AZ",
      city: "Phoenix",
      requested_service: "roofing",
      message: `${TEST_PREFIX} ${runId} website lead needs roof repair follow-up.`,
      preferred_contact_method: "phone",
      source_metadata: { testRunId: runId, sourceAccount: "weathertech-phoenix-web" },
      possible_matches: [{ type: "lead", id: leadWorkflow.leadId, confidence: "possible" }],
      routing_reasons: ["Test fixture uses WeatherTech Phoenix website source."],
      review_notes: `${TEST_PREFIX} ${runId} possible duplicate requires review.`,
      intake_timestamp: twoHoursAgo,
    }),
  });

  const [yelpIntake] = await restRequest(env, "lead_intake_records", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companies.ihc.id,
      provider: "yelp",
      provider_event_id: `${TEST_PREFIX} ${runId} YELP EVENT`,
      source: "Yelp",
      source_detail: "IHC Yelp account",
      campaign: `${TEST_PREFIX} ${runId} Yelp Account`,
      correlation_id: `${TEST_PREFIX} ${runId} YELP INBOX`,
      company_key: "ihc_painting",
      branch_key: "ihc",
      routing_status: "needs_review",
      status: "needs_review",
      duplicate_confidence: "likely_match",
      follow_up_state: "required",
      urgency: "normal",
      assigned_queue: "Office",
      contact_name: `${TEST_PREFIX} ${runId} Yelp Inbox Lead`,
      phone: alternateCustomerPhone,
      email: `yelp-inbox-${runId}@example.test`,
      service_address: "777 TEST Communication Paint Ave, Tempe, AZ",
      city: "Tempe",
      requested_service: "painting",
      message: `${TEST_PREFIX} ${runId} Yelp account source preserved.`,
      preferred_contact_method: "email",
      source_metadata: { testRunId: runId, yelpAccount: "ihc-yelp-test" },
      possible_matches: [{ type: "lead", confidence: "likely" }],
      routing_reasons: ["Test fixture uses IHC Yelp source."],
      review_notes: `${TEST_PREFIX} ${runId} Yelp possible duplicate review.`,
      intake_timestamp: oneHourAgo,
    }),
  });

  return {
    fakeBusinessPhone,
    fakeCustomerPhone,
    alternateCustomerPhone,
    businessPhoneRoute,
    missedCall,
    voicemail,
    providerFailure,
    smsFailure,
    emailMessage,
    websiteIntake,
    yelpIntake,
  };
}

async function seedTestCustomer(
  env,
  companyId,
  runId,
  suffix = "ESTIMATE CUSTOMER",
  propertyAddress = "456 TEST Regression Lead Ave, Phoenix, AZ",
) {
  const displayName = `${TEST_PREFIX} ${runId} ${suffix}`;
  const [customer] = await restRequest(env, "customers", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      display_name: displayName,
      contact_name: `${displayName} CONTACT`,
      phone: "+16025550666",
      email: `${suffix.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${runId}@example.test`,
      property_address: propertyAddress,
      city: "Phoenix",
      state: "AZ",
      postal_code: "85001",
      customer_type: "homeowner",
      status: "active",
      notes: `${TEST_PREFIX} ${runId} seeded customer for estimate workflow`,
    }),
  });

  return customer;
}

async function seedTestDocument(
  env,
  companyId,
  customerId,
  jobId,
  runId,
  documentStorageWorkflowReady = false,
) {
  const title = `${TEST_PREFIX} ${runId} DOCUMENT CENTER PACKET`;
  const documentPayload = {
    company_id: companyId,
    customer_id: customerId,
    job_id: jobId,
    title,
    category: "estimate",
    status: "ready",
    template_key: "weathertech_estimate",
    file_url: "https://example.invalid/weathertech-os-regression-document.pdf",
    body: [
      `${TEST_PREFIX} ${runId} document center body.`,
      "Proposal packet with customer and job references for regression coverage.",
    ].join("\n"),
  };

  if (documentStorageWorkflowReady) {
    Object.assign(documentPayload, {
      file_name: `${TEST_PREFIX.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${runId}.pdf`,
      file_size_bytes: 245760,
      mime_type: "application/pdf",
      uploaded_at: new Date().toISOString(),
      property_address: "456 TEST Regression Lead Ave, Phoenix, AZ",
      tags: ["Regression", "Estimate Approval"],
      requirement_level: "required",
      required_for: ["estimate_approval"],
    });
  }

  const [document] = await restRequest(env, "documents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(documentPayload),
  });

  return document;
}

async function seedFinancialOperationsRecords(env, company, runId) {
  const customer = await seedTestCustomer(
    env,
    company.id,
    runId,
    "FINANCIAL CUSTOMER",
    `789 TEST ${runId} Financial Way, Phoenix, AZ`,
  );
  const [estimate] = await restRequest(env, "estimates", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      title: `${TEST_PREFIX} ${runId} FINANCIAL APPROVED ESTIMATE`,
      status: "approved",
      service_type: "roofing",
      issue_date: new Date().toISOString().slice(0, 10),
      expiration_date: null,
      subtotal: 5000,
      labor_total: 3200,
      material_total: 1800,
      tax_rate: 0,
      tax_total: 0,
      discount_type: "fixed",
      discount_value: 0,
      discount_total: 0,
      profit_margin_rate: 0,
      profit_margin_total: 0,
      total: 5000,
      notes: `${TEST_PREFIX} ${runId} approved estimate for financial regression`,
      business: company.name,
      location: `789 TEST ${runId} Financial Way, Phoenix, AZ`,
    }),
  });

  await restRequest(env, "estimate_line_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      estimate_id: estimate.id,
      category: "labor",
      name: `${TEST_PREFIX} ${runId} ROOF REPLACEMENT`,
      description: "Financial regression approved estimate line item.",
      quantity: 1,
      unit: "project",
      unit_cost: 5000,
      unit_price: 5000,
      markup_rate: 0,
      taxable: false,
      sort_order: 0,
      total: 5000,
    }),
  });

  const [job] = await restRequest(env, "jobs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      estimate_id: estimate.id,
      title: `${TEST_PREFIX} ${runId} FINANCIAL COMPLETED JOB`,
      service_type: "roofing",
      status: "completed",
      business: company.name,
      location: `789 TEST ${runId} Financial Way, Phoenix, AZ`,
      scheduled_start: null,
      scheduled_end: null,
      start_date: null,
      end_date: new Date().toISOString().slice(0, 10),
      crew_name: "TEST Financial Crew",
      project_manager: "TEST Financial Manager",
      address: `789 TEST ${runId} Financial Way, Phoenix, AZ`,
      property_address: `789 TEST ${runId} Financial Way, Phoenix, AZ`,
      scope_of_work: "Financial regression completed job.",
      total: 5000,
      notes: `${TEST_PREFIX} ${runId} completed job awaiting final invoice`,
    }),
  });

  const [changeOrder] = await restRequest(env, "change_orders", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      job_id: job.id,
      estimate_id: null,
      title: `${TEST_PREFIX} ${runId} FINANCIAL CHANGE ORDER`,
      status: "approved",
      reason: "Financial regression approved scope change.",
      amount: 650,
      tax_rate: 0,
      requested_date: new Date().toISOString().slice(0, 10),
      approved_at: new Date().toISOString(),
      notes: `${TEST_PREFIX} ${runId} approved change order awaiting billing`,
    }),
  });

  const [invoice] = await restRequest(env, "invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      job_id: job.id,
      estimate_id: null,
      invoice_number: `INV-TEST-${runId}`,
      title: `${TEST_PREFIX} ${runId} FINANCIAL DEPOSIT INVOICE`,
      status: "sent",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      subtotal: 1000,
      tax_rate: 0,
      tax_total: 0,
      discount_total: 0,
      total: 1000,
      amount_paid: 0,
      balance_due: 1000,
      notes: `${TEST_PREFIX} ${runId} deposit required for financial regression`,
    }),
  });

  await restRequest(env, "invoice_line_items", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      invoice_id: invoice.id,
      description: `${TEST_PREFIX} ${runId} Deposit payment`,
      quantity: 1,
      unit_cost: 1000,
      taxable: false,
      sort_order: 0,
      total: 1000,
    }),
  });

  return { customer, estimate, job, changeOrder, invoice };
}

async function seedTestSignature(env, companyId, customerId, documentId, runId) {
  const [signature] = await restRequest(env, "signatures", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      customer_id: customerId,
      document_id: documentId,
      signer_name: `${TEST_PREFIX} ${runId} SIGNER`,
      signer_email: `document-signer-${runId}@example.test`,
      status: "pending",
    }),
  });

  return signature;
}

async function findDocumentByTitle(env, title) {
  const rows = await restRequest(
    env,
    `documents?select=*&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function findInvoiceByTitle(env, title) {
  const rows = await restRequest(
    env,
    `invoices?select=*&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return rows[0] ?? null;
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

async function findLeadById(env, leadId) {
  const rows = await restRequest(
    env,
    `leads?select=*&id=eq.${encodeURIComponent(leadId)}&limit=1`,
  );

  return rows[0] ?? null;
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

async function countEstimatesByTitle(env, title) {
  const rows = await restRequest(
    env,
    `estimates?select=id&title=eq.${encodeURIComponent(title)}`,
  );

  return rows.length;
}

async function findJobByTitle(env, title) {
  const rows = await restRequest(
    env,
    `jobs?select=*&title=eq.${encodeURIComponent(title)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function findJobByEstimateId(env, estimateId) {
  const rows = await restRequest(
    env,
    `jobs?select=*&estimate_id=eq.${encodeURIComponent(estimateId)}&limit=1`,
  );

  return rows[0] ?? null;
}

async function countJobsByTitle(env, title) {
  const rows = await restRequest(
    env,
    `jobs?select=id&title=eq.${encodeURIComponent(title)}`,
  );

  return rows.length;
}

async function countJobsByEstimateId(env, estimateId) {
  const rows = await restRequest(
    env,
    `jobs?select=id&estimate_id=eq.${encodeURIComponent(estimateId)}`,
  );

  return rows.length;
}

async function findJobScheduleEvents(env, jobId) {
  return restRequest(
    env,
    `schedule_events?select=*&job_id=eq.${encodeURIComponent(jobId)}&event_type=eq.job&status=neq.canceled&order=start_at.asc`,
  );
}

async function seedDispatchInspection(env, companyId, jobId, runId, start, end) {
  const title = `${TEST_PREFIX} ${runId} DISPATCH INSPECTION`;
  const [inspection] = await restRequest(env, "inspections", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: companyId,
      job_id: jobId,
      title,
      status: "scheduled",
      inspection_type: "roof_inspection",
      service_category: "roofing",
      checklist: "Dispatch regression inspection",
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      assigned_inspector: `${TEST_PREFIX} ${runId} DISPATCH INSPECTOR`,
      property_address: "123 TEST Regression Way, Phoenix, AZ",
      priority: "normal",
      purpose: "TEST dispatch inspection visibility.",
      notes: `${TEST_PREFIX} ${runId} dispatch inspection note`,
      internal_notes: `${TEST_PREFIX} ${runId} dispatch inspection internal note`,
      findings: [],
      measurements: [],
      photo_ids: [],
      activity: [],
    }),
  });

  return inspection;
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

async function scrollSelectorIntoView(tab, selector, label, timeoutMs = 8000) {
  const startedAt = Date.now();
  let lastState = null;

  while (Date.now() - startedAt < timeoutMs) {
    lastState = await tab.playwright.evaluate((currentSelector) => {
      const element = document.querySelector(currentSelector);
      if (!element) {
        return { found: false };
      }

      const rect = element.getBoundingClientRect();
      const visible =
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth;

      return {
        found: true,
        visible,
        rect: {
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
      };
    }, selector);

    if (lastState.found && lastState.visible) {
      return;
    }

    if (!lastState.found) {
      throw new Error(`${label} was not found.`);
    }

    const centerX = Math.min(
      Math.max((lastState.rect.left + lastState.rect.right) / 2, 40),
      lastState.viewport.width - 40,
    );
    const scrollDown = lastState.rect.bottom > lastState.viewport.height;
    const scrollDistance = scrollDown
      ? Math.min(700, Math.max(160, lastState.rect.bottom - lastState.viewport.height + 120))
      : -Math.min(700, Math.max(160, Math.abs(lastState.rect.top) + 120));

    await tab.cua.scroll({
      x: centerX,
      y: scrollDown ? lastState.viewport.height - 80 : 80,
      scrollX: 0,
      scrollY: scrollDistance,
    });
    await tab.playwright.waitForTimeout(150);
  }

  throw new Error(`Timed out scrolling ${label} into view. Last state: ${JSON.stringify(lastState)}`);
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

async function withAcceptedConfirm(tab, action) {
  let actionError = null;
  let actionSettled = false;
  const actionPromise = action()
    .then((result) => {
      actionSettled = true;
      return result;
    })
    .catch((error) => {
      actionSettled = true;
      actionError = error;
      return null;
    });

  await waitForAsync(async () => {
    if (actionError) {
      throw actionError;
    }

    const dialog = await tab.getJsDialog();

    if (!dialog) {
      if (actionSettled) {
        return true;
      }

      return false;
    }

    if (dialog.type !== "confirm") {
      throw new Error(`Expected a confirm dialog, received ${dialog.type}.`);
    }

    await dialog.accept();
    return true;
  }, "confirmation dialog", 10000);

  const result = await actionPromise;

  if (actionError) {
    throw actionError;
  }

  return result;
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

async function fillDateUnique(locator, value, label) {
  await waitForUniqueLocator(locator, label);
  await locator.fill(value, { timeoutMs: 8000 });

  const currentValue = await locator.evaluate((element) =>
    "value" in element ? element.value : "",
  );

  if (currentValue === value) {
    return;
  }

  await locator.evaluate((element, nextValue) => {
    const view = element.ownerDocument?.defaultView;
    const setter = view
      ? Object.getOwnPropertyDescriptor(
          view.HTMLInputElement.prototype,
          "value",
        )?.set
      : null;

    if (setter) {
      setter.call(element, nextValue);
    } else if ("value" in element) {
      element.value = nextValue;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await waitForAsync(
    async () =>
      locator.evaluate((element) =>
        "value" in element ? element.value === value : false,
      ),
    label,
    3000,
  );
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
    `xpath=//button[@data-testid="jobs-list-item" and .//p[normalize-space(.)=${xpathString(text)}]]`,
  );
}

async function clickJobListItemByText(tab, jobTitle, label, timeoutMs = 15000) {
  await clickVisibleButtonByText(
    tab,
    '[data-testid="jobs-list-item"]',
    jobTitle,
    label,
    "paragraph",
    timeoutMs,
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
  const waitForSelection = (selectionLabel, waitMs = 2500) =>
    waitFor(
      tab,
      (input) => {
        const normalize = (value) => (value ?? "").replace(/\s+/g, " ").trim();
        const targetText = normalize(input.paragraphText);
        return [...document.querySelectorAll("aside, aside section")].some((section) =>
          normalize(section.textContent).includes(targetText),
        );
      },
      selectionLabel,
      waitMs,
      input,
    ).catch(() => false);
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
    selected = await waitForSelection(`${label} selected through locator`);
  } catch {
    selected = false;
  }

  if (!selected) {
    try {
      await row.press("Enter", { timeoutMs: 10000 });
      selected = await waitForSelection(`${label} selected through keyboard`);
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
    selected = await waitForSelection(`${label} selected through fallback click`, 4000);
  }

  if (!selected) {
    throw new Error(`${label} was visible but did not open its detail panel.`);
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

async function waitForEstimateCreateMode(tab, label, timeoutMs = 15000) {
  return waitFor(
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
    label,
    timeoutMs,
  );
}

async function openEstimateCreateMode(tab, label, attempts = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const alreadyOpen = await waitForEstimateCreateMode(
      tab,
      `${label} already open attempt ${attempt}`,
      1200,
    ).catch(() => false);

    if (alreadyOpen) {
      return;
    }

    const builderNewEstimateButton = tab.playwright.locator(
      'xpath=//section[@id="estimate-builder"]//button[normalize-space(.)="New Estimate"]',
    );

    try {
      if ((await builderNewEstimateButton.count()) === 1) {
        await clickUnique(builderNewEstimateButton, `${label} builder button`, {
          retryTransientClick: true,
        });
      } else {
        await clickVisibleDomButtonByText(
          tab,
          "New Estimate",
          `${label} visible button`,
          10000,
        );
      }

      const opened = await waitForEstimateCreateMode(
        tab,
        `${label} create mode attempt ${attempt}`,
        6000,
      ).catch((error) => {
        lastError = error;
        return false;
      });

      if (opened) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error(`${label} did not open estimate create mode.`);
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
  const waitForJobsScreen = (label) =>
    waitFor(
      tab,
      () =>
        Boolean(document.querySelector('[data-testid="jobs-search"]')) &&
        document.body.innerText.includes("Jobs / Projects"),
      label,
      15000,
    );

  try {
    await waitForJobsScreen("jobs screen ready");
  } catch {
    await clickNav(tab, "Jobs");
    await waitForJobsScreen("jobs screen ready after retry");
  }
  const clearFilters = tab.playwright.getByRole("button", { name: "Clear filters" });

  if ((await clearFilters.count()) === 1) {
    await clickUnique(clearFilters, "Clear job filters");
  }

  await fillUnique(tab.playwright.locator('[data-testid="jobs-search"]'), jobTitle, "job search");
  await tab.playwright.waitForTimeout(600);
  await clickJobListItemByText(tab, jobTitle, `job card ${jobTitle}`);
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    `selected job ${jobTitle}`,
    10000,
    jobTitle,
  );
}

function daysBetweenIsoDates(startDate, endDate) {
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.round(
    (new Date(`${endDate}T00:00:00`).getTime() - new Date(`${startDate}T00:00:00`).getTime()) /
      dayMs,
  );
}

async function moveDispatchDateTo(tab, targetDate) {
  const currentDate = await tab.playwright.evaluate(
    () => document.querySelector('[data-testid="dispatch-date"]')?.value ?? "",
  );
  const distance = daysBetweenIsoDates(currentDate, targetDate);
  const buttonName = distance >= 0 ? "Next" : "Prev";
  const button = tab.playwright.locator(
    `xpath=//*[@data-testid="dispatch-workspace"]//button[normalize-space(.)="${buttonName}"]`,
  );

  for (let index = 0; index < Math.abs(distance); index += 1) {
    await button.evaluate((element) =>
      element.scrollIntoView({ block: "center", behavior: "auto" }),
    );
    await clickUnique(button, `dispatch ${buttonName.toLowerCase()} date`, {
      retryTransientClick: true,
    });
    await tab.playwright.waitForTimeout(80);
  }

  await waitFor(
    tab,
    (targetDate) => document.querySelector('[data-testid="dispatch-date"]')?.value === targetDate,
    `dispatch date ${targetDate}`,
    5000,
    targetDate,
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
      hasOperationsDashboard:
        normalizedText.includes("weathertech command center") &&
        normalizedText.includes("owner morning brief") &&
        normalizedText.includes("search everything") &&
        normalizedText.includes("create"),
      hasOperationsSections:
        normalizedText.includes("immediate action") &&
        normalizedText.includes("owner daily workflow") &&
        normalizedText.includes("lead intake through production, billing, payment, and warranty") &&
        normalizedText.includes("today's operations") &&
        normalizedText.includes("crew activity") &&
        normalizedText.includes("financial") &&
        normalizedText.includes("operational pipeline") &&
        normalizedText.includes("leads → estimates → scheduled → in production → completed → unpaid") &&
        normalizedText.includes("all companies") &&
        normalizedText.includes("weathertech roofing") &&
        normalizedText.includes("ihc painting") &&
        normalizedText.includes("sales") &&
        normalizedText.includes("customer experience") &&
        normalizedText.includes("executive snapshot") &&
        normalizedText.includes("today's revenue") &&
        normalizedText.includes("production value") &&
        normalizedText.includes("close rate") &&
        normalizedText.includes("cash outstanding") &&
        normalizedText.includes("leads") &&
        normalizedText.includes("estimates") &&
        normalizedText.includes("scheduled") &&
        normalizedText.includes("in production") &&
        normalizedText.includes("completed") &&
        normalizedText.includes("unpaid") &&
        normalizedText.includes("crews on site") &&
        normalizedText.includes("outstanding invoices") &&
        normalizedText.includes("estimate follow-up") &&
        normalizedText.includes("quick actions") &&
        normalizedText.includes("create lead") &&
        normalizedText.includes("create estimate") &&
        normalizedText.includes("schedule inspection") &&
        normalizedText.includes("schedule job") &&
        normalizedText.includes("create work order") &&
        normalizedText.includes("upload roof photos") &&
        normalizedText.includes("customer search") &&
        normalizedText.includes("open calendar") &&
        normalizedText.includes("upcoming work and quieter risks") &&
        normalizedText.includes("upcoming inspections") &&
        normalizedText.includes("calendar conflicts") &&
        normalizedText.includes("material requests") &&
        normalizedText.includes("website") &&
        normalizedText.includes("yelp") &&
        normalizedText.includes("unassigned") &&
        normalizedText.includes("production snapshot") &&
        normalizedText.includes("weather delays") &&
        normalizedText.includes("warranty callbacks"),
      hasWorkflowHandoff: Boolean(document.querySelector('[data-testid="daily-workflow-handoff"]')),
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

  if (!state.hasOperationsDashboard || !state.hasOperationsSections || !state.hasWorkflowHandoff) {
    throw new Error("CRM operations dashboard sections are not visible.");
  }

  await clickCompanyScope(tab, "IHC Painting");
  await waitFor(
    tab,
    () => document.body.innerText.includes("IHC Painting"),
    "dashboard IHC scope",
    8000,
  );
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await waitFor(
    tab,
    () => document.body.innerText.includes("WeatherTech Roofing LLC"),
    "dashboard WeatherTech scope",
    8000,
  );
  await clickCompanyScope(tab, "All companies");

  for (const filter of ["Website", "Yelp", "Unassigned", "WeatherTech"]) {
    await clickUnique(
      tab.playwright.locator(
        `xpath=//*[@data-testid="crm-operations-dashboard"]//section[.//*[normalize-space(.)="Operational pipeline"]]//button[normalize-space(.)=${xpathString(filter)}]`,
      ),
      `dashboard pipeline ${filter}`,
    );
  }

  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="crm-operations-dashboard"]//section[.//*[normalize-space(.)="Operational pipeline"]]//button[normalize-space(.)="All"]',
    ),
    "dashboard pipeline all",
  );

  await tab.cua.keypress({ keys: ["CTRL", "K"] });
  await waitFor(
    tab,
    () => {
      const palette = document.querySelector('[data-testid="command-palette"]');
      const text = palette?.textContent?.toLowerCase() ?? "";

      return (
        Boolean(palette) &&
        text.includes("universal command palette") &&
        text.includes("open jobs") &&
        text.includes("open estimates") &&
        text.includes("open documents") &&
        text.includes("open communications")
      );
    },
    "command palette opens with Ctrl+K",
    8000,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="command-palette-search"]'),
    "open jobs",
    "command palette search",
  );
  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="command-palette"]//button[.//*[normalize-space(.)="Open Jobs"]]',
    ),
    "command palette Open Jobs result",
  );
  await waitFor(
    tab,
    () =>
      !document.querySelector('[data-testid="command-palette"]') &&
      Boolean(document.querySelector('[data-testid="jobs-search"]')),
    "command palette navigates to jobs",
    8000,
  );
  await clickNav(tab, "Dashboard");

  return state;
}

async function testOfficeOperationsWorkspace(browser, tab) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Operations");

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="office-operations-command-center"]');
      const text = workspace?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("daily operations command center") &&
        text.includes("daily workflow handoff") &&
        text.includes("lead intake, inspections, estimates, production, billing, and warranty") &&
        text.includes("jobs starting today") &&
        text.includes("jobs in progress") &&
        text.includes("jobs awaiting scheduling") &&
        text.includes("jobs awaiting estimate approval") &&
        text.includes("jobs awaiting customer signature") &&
        text.includes("jobs missing assigned crews") &&
        text.includes("inspections scheduled today") &&
        text.includes("jobs with dispatch conflicts") &&
        text.includes("warranty callbacks") &&
        text.includes("emergency leak repairs") &&
        text.includes("material readiness warnings") &&
        text.includes("production blockers") &&
        text.includes("customer follow-ups due") &&
        text.includes("recent customer communication") &&
        text.includes("recent signed estimates") &&
        text.includes("recently completed jobs") &&
        text.includes("open customer") &&
        text.includes("open estimate") &&
        text.includes("open dispatch") &&
        text.includes("open calendar") &&
        text.includes("open production") &&
        text.includes("open communications") &&
        text.includes("open inspection") &&
        text.includes("scheduling intelligence") &&
        text.includes("operations dispatch workspace") &&
        text.includes("today's schedule") &&
        text.includes("tomorrow") &&
        text.includes("unassigned jobs") &&
        text.includes("scheduling conflicts") &&
        text.includes("overbooked employees") &&
        text.includes("available capacity") &&
        text.includes("upcoming inspections") &&
        text.includes("production queue")
      );
    },
    "office operations command center",
    15000,
  );

  const desktopLayout = await tab.playwright.evaluate(() => {
    const workspace = document.querySelector('[data-testid="office-operations-command-center"]');
    const queue = document.querySelector('[data-testid="operations-intelligence-queue"]');
    const scheduling = document.querySelector('[data-testid="scheduling-intelligence-dispatch"]');
    const workflowHandoff = workspace?.querySelector('[data-testid="daily-workflow-handoff"]');
    const queueRows = [...document.querySelectorAll('[data-testid="operations-queue-row"]')];
    const schedulingAlerts = [...document.querySelectorAll('[data-testid="scheduling-alert-row"]')];
    const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
    const prioritySorted = queueRows.every((row, index) => {
      const next = queueRows[index + 1];

      if (!next) {
        return true;
      }

      const currentPriority = row.getAttribute("data-priority") ?? "low";
      const nextPriority = next.getAttribute("data-priority") ?? "low";

      return priorityRank[currentPriority] <= priorityRank[nextPriority];
    });
    const requiredQueues = [
      "jobs-starting-today",
      "awaiting-estimate-approval",
      "awaiting-customer-signature",
      "jobs-awaiting-scheduling",
      "jobs-missing-crews",
      "dispatch-conflicts",
      "jobs-in-progress",
      "material-readiness-warnings",
      "production-blockers",
      "customer-follow-ups-due",
      "recent-signed-estimates",
      "recently-completed-jobs",
    ];
    const schedulingSections = [
      "scheduling-today-schedule",
      "scheduling-tomorrow",
      "scheduling-unassigned-jobs",
      "scheduling-conflicts",
      "scheduling-overbooked-employees",
      "scheduling-available-capacity",
      "scheduling-upcoming-inspections",
      "scheduling-production-queue",
      "scheduling-alerts",
    ];

    return {
      visible: Boolean(workspace),
      workflowVisible: Boolean(workflowHandoff),
      queueVisible: Boolean(queue),
      schedulingVisible: Boolean(scheduling),
      schedulingText: scheduling?.textContent?.toLowerCase() ?? "",
      queueText: queue?.textContent?.toLowerCase() ?? "",
      queueRowCount: queueRows.length,
      schedulingAlertCount: schedulingAlerts.length,
      queueSchedulingRows: queueRows.filter(
        (row) => row.getAttribute("data-source-module") === "Scheduling Intelligence",
      ).length,
      prioritySorted,
      queueCount: workspace?.querySelectorAll('[data-testid^="operations-queue-"]').length ?? 0,
      missingQueues: requiredQueues.filter(
        (queue) => !document.querySelector(`[data-testid="operations-queue-${queue}"]`),
      ),
      missingSchedulingSections: schedulingSections.filter(
        (section) => !document.querySelector(`[data-testid="${section}"]`),
      ),
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8,
      emptyStates: workspace?.textContent?.includes("No live records currently match this operational priority.") ?? false,
    };
  });

  if (!desktopLayout.visible) {
    throw new Error("Office Operations workspace is not visible.");
  }

  if (!desktopLayout.workflowVisible) {
    throw new Error("Office Operations daily workflow handoff did not render.");
  }

  if (!desktopLayout.queueVisible) {
    throw new Error("Operations Queue did not render.");
  }

  if (!desktopLayout.schedulingVisible) {
    throw new Error("Scheduling Intelligence Dispatch workspace did not render.");
  }

  if (desktopLayout.queueRowCount < 1) {
    throw new Error("Operations Queue rendered no work items.");
  }

  if (!desktopLayout.prioritySorted) {
    throw new Error("Operations Queue rows are not sorted by priority.");
  }

  for (const expected of [
    "office follow-up engine",
    "priority",
    "company",
    "customer",
    "property",
    "category",
    "assigned owner",
    "due",
    "age",
    "stage",
    "source module",
    "suggested next action",
  ]) {
    if (!desktopLayout.queueText.includes(expected)) {
      throw new Error(`Operations Queue missing ${expected}.`);
    }
  }

  if (desktopLayout.missingQueues.length) {
    throw new Error(`Office Operations missing queues: ${desktopLayout.missingQueues.join(", ")}`);
  }

  if (desktopLayout.missingSchedulingSections.length) {
    throw new Error(
      `Scheduling Intelligence workspace missing sections: ${desktopLayout.missingSchedulingSections.join(", ")}`,
    );
  }

  for (const expected of [
    "technician availability",
    "crew availability",
    "property",
    "roof system",
    "required documents",
    "operations queue integration",
    "future routing optimization",
  ]) {
    if (!desktopLayout.schedulingText.includes(expected)) {
      throw new Error(`Scheduling Intelligence missing ${expected}.`);
    }
  }

  if (desktopLayout.schedulingAlertCount > 0 && desktopLayout.queueSchedulingRows < 1) {
    throw new Error("Scheduling alerts are not integrated into the Operations Queue.");
  }

  if (desktopLayout.queueCount < 14) {
    throw new Error(`Office Operations rendered only ${desktopLayout.queueCount} queue cards.`);
  }

  if (desktopLayout.hasHorizontalOverflow) {
    throw new Error("Office Operations desktop layout overflows horizontally.");
  }

  if (!desktopLayout.emptyStates) {
    throw new Error("Office Operations did not render truthful empty states.");
  }

  if (desktopLayout.schedulingAlertCount > 0) {
    const routedSchedulingAlert = await tab.playwright.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-testid="scheduling-alert-row"]')];
      const first = rows.find((row) => row.getAttribute("data-target-view")) ?? null;

      return {
        index: first ? rows.indexOf(first) : -1,
        targetView: first?.getAttribute("data-target-view") ?? null,
      };
    });

    if (routedSchedulingAlert.index < 0 || !routedSchedulingAlert.targetView) {
      throw new Error("Scheduling alert did not expose a target workflow.");
    }

    await clickUnique(
      tab.playwright.locator('[data-testid="scheduling-alert-row"]').nth(routedSchedulingAlert.index),
      "scheduling alert route",
    );
    await waitFor(
      tab,
      (targetView) => {
        const text = document.body.innerText;
        const selectors = {
          calendar: () => text.includes("Schedule inspections, estimates, jobs, follow-ups, and deliveries."),
          customers: () => text.includes("Customer 360"),
          documents: () => text.includes("Document Center"),
          inspections: () => text.includes("Inspections"),
          jobs: () =>
            Boolean(document.querySelector('[data-testid="jobs-search"]')) &&
            text.includes("Jobs / Projects"),
          orders: () => text.includes("Material Orders"),
        };

        return selectors[targetView]?.() ?? text.length > 0;
      },
      "scheduling alert routes to existing module",
      10000,
      routedSchedulingAlert.targetView,
    );

    await clickNav(tab, "Operations");
  }

  await selectUnique(
    tab.playwright.locator('[data-testid="operations-queue-priority-filter"]'),
    "high",
    "operations queue priority filter",
  );
  await waitFor(
    tab,
    () => {
      const rows = [...document.querySelectorAll('[data-testid="operations-queue-row"]')];

      return rows.length > 0 && rows.every((row) => row.getAttribute("data-priority") === "high");
    },
    "operations queue high priority filter",
    8000,
  );
  const queueSearchToken = await waitFor(
    tab,
    () => {
      const firstRow = document.querySelector('[data-testid="operations-queue-row"]');
      const token = firstRow?.textContent?.match(/[A-Za-z]{4,}/)?.[0] ?? null;

      return token;
    },
    "operations queue search token",
    8000,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="operations-queue-search"]'),
    queueSearchToken,
    "operations queue search",
  );
  await waitFor(
    tab,
    () => {
      const rows = [...document.querySelectorAll('[data-testid="operations-queue-row"]')];

      return rows.some((row) => row.getAttribute("data-target-view") !== null);
    },
    "operations queue routable work item",
    8000,
  );
  const routedQueueItem = await tab.playwright.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="operations-queue-row"]')];
    const targetIndex = Math.max(
      rows.findIndex((row) => row.getAttribute("data-target-view") === "jobs"),
      0,
    );
    const targetRow = rows[targetIndex] ?? null;

    if (!targetRow) {
      return { targetView: null, targetIndex: -1 };
    }

    return {
      targetView: targetRow.getAttribute("data-target-view"),
      targetIndex,
    };
  });
  await clickUnique(
    tab.playwright.locator('[data-testid="operations-queue-row"]').nth(routedQueueItem.targetIndex),
    "operations queue first work item",
  );
  await waitFor(
    tab,
    (targetView) => {
      const text = document.body.innerText;
      const selectors = {
        calendar: () => text.includes("Schedule inspections, estimates, jobs, follow-ups, and deliveries."),
        changeOrders: () => text.includes("Change Orders"),
        documents: () => text.includes("Document Center"),
        estimates: () => text.includes("Estimates"),
        inbox: () => text.includes("Unified Communications Center"),
        invoices: () => text.includes("Invoices"),
        jobs: () =>
          Boolean(document.querySelector('[data-testid="jobs-search"]')) &&
          text.includes("Jobs / Projects"),
        leads: () => text.includes("CRM Pipeline"),
        notifications: () => text.includes("Notifications"),
        orders: () => text.includes("Material Orders"),
      };

      return selectors[targetView]?.() ?? text.length > 0;
    },
    "operations queue routes to originating module",
    10000,
    routedQueueItem.targetView,
  );

  await clickNav(tab, "Operations");
  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="operations-quick-actions"]//button[contains(normalize-space(.), "Open Calendar")]',
    ),
    "operations open calendar",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Schedule inspections, estimates, jobs, follow-ups, and deliveries."),
    "operations quick action calendar",
    10000,
  );

  await clickNav(tab, "Operations");
  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="operations-quick-actions"]//button[contains(normalize-space(.), "Open Communications")]',
    ),
    "operations open communications",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Unified Communications Center"),
    "operations quick action communications",
    10000,
  );

  await clickNav(tab, "Operations");
  await clickCompanyScope(tab, "IHC Painting");
  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="office-operations-command-center"]')?.textContent ?? "";
      return text.includes("IHC Painting");
    },
    "operations IHC scope",
    10000,
  );
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="office-operations-command-center"]')?.textContent ?? "";
      return text.includes("WeatherTech Roofing LLC");
    },
    "operations WeatherTech scope",
    10000,
  );
  await clickCompanyScope(tab, "All companies");

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await clickNav(tab, "Operations");
  const mobileLayout = await tab.playwright.evaluate(() => {
    const workspace = document.querySelector('[data-testid="office-operations-command-center"]');

    return {
      visible: Boolean(workspace),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      quickActionsVisible: Boolean(document.querySelector('[data-testid="operations-quick-actions"]')),
      schedulingVisible: Boolean(document.querySelector('[data-testid="scheduling-intelligence-dispatch"]')),
    };
  });
  await viewport.set(LAPTOP_VIEWPORT);

  if (!mobileLayout.visible || !mobileLayout.quickActionsVisible || !mobileLayout.schedulingVisible) {
    throw new Error("Office Operations workspace did not render at mobile width.");
  }

  if (mobileLayout.scrollWidth > mobileLayout.viewportWidth + 8) {
    throw new Error(
      `Office Operations mobile layout overflows horizontally: ${mobileLayout.scrollWidth}px > ${mobileLayout.viewportWidth}px.`,
    );
  }

  return { desktopLayout, mobileLayout };
}

async function testExecutiveIntelligenceWorkspace(browser, tab) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Analytics");

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="executive-intelligence-workspace"]');
      const text = workspace?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("executive intelligence") &&
        text.includes("what needs action next") &&
        text.includes("today's business snapshot") &&
        text.includes("revenue today") &&
        text.includes("revenue this week") &&
        text.includes("revenue this month") &&
        text.includes("jobs completed") &&
        text.includes("jobs scheduled") &&
        text.includes("leads received") &&
        text.includes("estimates awaiting approval") &&
        text.includes("collections due") &&
        text.includes("sales intelligence") &&
        text.includes("pipeline value") &&
        text.includes("close rate") &&
        text.includes("win/loss trend") &&
        text.includes("average estimate") &&
        text.includes("sales leaderboard") &&
        text.includes("aging estimate") &&
        text.includes("follow-up health") &&
        text.includes("operations intelligence") &&
        text.includes("jobs behind schedule") &&
        text.includes("crew utilization") &&
        text.includes("crews overloaded") &&
        text.includes("available capacity") &&
        text.includes("open inspections") &&
        text.includes("material shortages") &&
        text.includes("production bottlenecks") &&
        text.includes("customer experience") &&
        text.includes("open customer issues") &&
        text.includes("response signals") &&
        text.includes("reviews awaiting response") &&
        text.includes("warranty requests") &&
        text.includes("satisfaction indicators") &&
        text.includes("financial intelligence") &&
        text.includes("outstanding invoices") &&
        text.includes("a/r aging") &&
        text.includes("deposits received") &&
        text.includes("progress billing") &&
        text.includes("cash flow") &&
        text.includes("executive alerts") &&
        text.includes("recommended next action") &&
        text.includes("trends") &&
        text.includes("simple directional signals")
      );
    },
    "executive intelligence workspace",
    15000,
  );

  const desktopLayout = await tab.playwright.evaluate(() => {
    const workspace = document.querySelector('[data-testid="executive-intelligence-workspace"]');
    const alertFeed = document.querySelector('[data-testid="executive-alert-feed"]');
    const trendPanel = document.querySelector('[data-testid="executive-trend-panel"]');
    const openWorkflowButtons = [
      ...document.querySelectorAll('[data-testid="executive-alert-feed"] button'),
    ].filter((button) => button.textContent?.includes("Open workflow"));

    return {
      visible: Boolean(workspace),
      alertFeedVisible: Boolean(alertFeed),
      trendPanelVisible: Boolean(trendPanel),
      openWorkflowButtonCount: openWorkflowButtons.length,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8,
    };
  });

  if (!desktopLayout.visible || !desktopLayout.alertFeedVisible || !desktopLayout.trendPanelVisible) {
    throw new Error("Executive Intelligence workspace did not render its core regions.");
  }

  if (desktopLayout.openWorkflowButtonCount < 1) {
    throw new Error("Executive Intelligence alerts do not expose existing workflow actions.");
  }

  if (desktopLayout.hasHorizontalOverflow) {
    throw new Error("Executive Intelligence desktop layout overflows horizontally.");
  }

  await clickCompanyScope(tab, "IHC Painting");
  await waitFor(
    tab,
    () => document.body.innerText.includes("IHC Painting"),
    "executive intelligence IHC scope",
    8000,
  );
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await waitFor(
    tab,
    () => document.body.innerText.includes("WeatherTech Roofing LLC"),
    "executive intelligence WeatherTech scope",
    8000,
  );
  await clickCompanyScope(tab, "All companies");

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await clickNav(tab, "Analytics");
  const mobileLayout = await tab.playwright.evaluate(() => {
    const workspace = document.querySelector('[data-testid="executive-intelligence-workspace"]');

    return {
      visible: Boolean(workspace),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      alertFeedVisible: Boolean(document.querySelector('[data-testid="executive-alert-feed"]')),
      trendPanelVisible: Boolean(document.querySelector('[data-testid="executive-trend-panel"]')),
    };
  });
  await viewport.set(LAPTOP_VIEWPORT);

  if (!mobileLayout.visible || !mobileLayout.alertFeedVisible || !mobileLayout.trendPanelVisible) {
    throw new Error("Executive Intelligence workspace did not render at mobile width.");
  }

  if (mobileLayout.scrollWidth > mobileLayout.viewportWidth + 8) {
    throw new Error(
      `Executive Intelligence mobile layout overflows horizontally: ${mobileLayout.scrollWidth}px > ${mobileLayout.viewportWidth}px.`,
    );
  }

  return { desktopLayout, mobileLayout };
}

async function testFinancialOperationsWorkspace(browser, tab, env, company, runId, progress) {
  progress("financial:seed:start");
  const seeded = await seedFinancialOperationsRecords(env, company, runId);
  const expectedInvoiceTitle = `Invoice for ${seeded.estimate.title}`;
  progress("financial:seed:done");

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  await clickNav(tab, "Invoices");

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="financial-operations-workspace"]');
      const text = workspace?.textContent?.toLowerCase() ?? "";

      return (
        Boolean(workspace) &&
        text.includes("financial operations") &&
        text.includes("outstanding balance") &&
        text.includes("ready to bill") &&
        text.includes("deposits") &&
        text.includes("quickbooks sync") &&
        text.includes("approved estimate") &&
        text.includes("completed job") &&
        text.includes("approved change order")
      );
    },
    "financial operations workspace",
    15000,
  );

  await selectUnique(
    tab.playwright.locator('[data-testid="financial-company-filter"]'),
    company.id,
    "financial company filter",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="financial-search"]'),
    seeded.invoice.title,
    "financial invoice search",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title),
    "financial seeded invoice visible",
    10000,
    seeded.invoice.title,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="financial-workflow-filter"]'),
    "sent",
    "financial sent filter",
  );
  await waitFor(
    tab,
    () => document.querySelectorAll('[data-testid="financial-invoice-row"]').length >= 1,
    "financial sent invoice row",
    10000,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="financial-search"]'),
    "",
    "clear financial search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="financial-workflow-filter"]'),
    "all",
    "financial all workflow filter",
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="financial-create-from-estimate"]'),
    "financial create from approved estimate",
  );
  await waitFor(
    tab,
    (title) => {
      const titleInput = document.querySelector('input[name="title"]');
      return titleInput?.value === title;
    },
    "financial estimate preset title",
    10000,
    expectedInvoiceTitle,
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="financial-save-invoice"]'),
    "financial create estimate invoice",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes("Invoice created.") && document.body.innerText.includes(title),
    "financial invoice created",
    15000,
    expectedInvoiceTitle,
  );

  const createdInvoice = await waitForAsync(
    () => findInvoiceByTitle(env, expectedInvoiceTitle),
    "financial invoice persistence",
    15000,
  );

  if (!createdInvoice || createdInvoice.estimate_id !== seeded.estimate.id) {
    throw new Error("Financial estimate invoice did not persist with the expected estimate link.");
  }

  await fillUnique(
    tab.playwright.locator('[data-testid="financial-payment-form"] input[name="amount"]'),
    "250",
    "financial partial payment amount",
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="financial-record-payment"]'),
    "financial record partial payment",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Payment recorded."),
    "financial payment recorded notice",
    15000,
  );

  const paidInvoice = await waitForAsync(
    async () => {
      const invoice = await findInvoiceByTitle(env, expectedInvoiceTitle);
      return invoice && Number(invoice.amount_paid) === 250 ? invoice : null;
    },
    "financial partial payment persistence",
    15000,
  );

  if (!paidInvoice || Number(paidInvoice.amount_paid) !== 250 || Number(paidInvoice.balance_due) !== 4750) {
    throw new Error(`Financial payment totals were not updated correctly: ${JSON.stringify(paidInvoice)}`);
  }

  await fillUnique(
    tab.playwright.locator('[data-testid="financial-payment-form"] input[name="amount"]'),
    "99999",
    "financial overpayment amount",
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="financial-record-payment"]'),
    "financial overpayment guard",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Payment exceeds the remaining invoice balance."),
    "financial overpayment rejected",
    10000,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="financial-workflow-filter"]'),
    "partially_paid",
    "financial partially paid filter",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title) && document.body.innerText.includes("Partially Paid"),
    "financial partial status visible",
    10000,
    expectedInvoiceTitle,
  );

  const desktopLayout = await tab.playwright.evaluate(() => ({
    visible: Boolean(document.querySelector('[data-testid="financial-operations-workspace"]')),
    quickBooksHonest: (() => {
      const text = document.body.innerText.toLowerCase();
      return (
        text.includes("no live sync is active") ||
        text.includes("no live accounting sync is active") ||
        text.includes("not connected")
      );
    })(),
    attentionVisible: Boolean(document.querySelector('[data-testid="financial-attention-list"]')),
    hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8,
  }));

  if (!desktopLayout.visible || !desktopLayout.attentionVisible) {
    throw new Error("Financial Operations workspace did not render required panels.");
  }

  if (!desktopLayout.quickBooksHonest) {
    throw new Error("Financial Operations did not show honest QuickBooks readiness.");
  }

  if (desktopLayout.hasHorizontalOverflow) {
    throw new Error("Financial Operations desktop layout overflows horizontally.");
  }

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  const mobileLayout = await tab.playwright.evaluate(() => ({
    visible: Boolean(document.querySelector('[data-testid="financial-operations-workspace"]')),
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  await viewport.set(LAPTOP_VIEWPORT);

  if (!mobileLayout.visible || mobileLayout.scrollWidth > mobileLayout.viewportWidth + 8) {
    throw new Error("Financial Operations mobile layout is not usable.");
  }

  return { createdInvoiceId: createdInvoice.id, paidInvoice, desktopLayout, mobileLayout };
}

async function testFieldOperationsWorkspace(browser, tab, env, company, runId, progress) {
  progress("field-operations:prepare:start");
  const fieldRunId = `${runId} FIELDOPS`;
  const seededJob = await seedTestJob(env, company.id, fieldRunId);
  const seededTaskTitle = `${TEST_PREFIX} ${fieldRunId} INITIAL TASK`;
  const fieldStart = new Date();
  fieldStart.setUTCHours(16, 0, 0, 0);
  const fieldEnd = new Date(fieldStart.getTime() + 2 * 60 * 60 * 1000);
  const inspectionStart = new Date(fieldStart.getTime() + 3 * 60 * 60 * 1000);
  const inspectionEnd = new Date(fieldStart.getTime() + 4 * 60 * 60 * 1000);
  const today = fieldStart.toISOString().slice(0, 10);
  const fieldCrew = `${TEST_PREFIX} ${fieldRunId} FIELD CREW`;
  const fieldOwner = `${TEST_PREFIX} ${fieldRunId} FIELD OWNER`;
  await restRequest(env, `jobs?id=eq.${encodeURIComponent(seededJob.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "scheduled",
      scheduled_start: fieldStart.toISOString(),
      scheduled_end: fieldEnd.toISOString(),
      start_date: today,
      end_date: today,
      crew_name: fieldCrew,
      project_manager: fieldOwner,
    }),
  });
  const inspection = await seedDispatchInspection(
    env,
    company.id,
    seededJob.id,
    fieldRunId,
    inspectionStart,
    inspectionEnd,
  );

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  progress("field-operations:prepare:done");

  await clickNav(tab, "Field Ops");
  const companyFilter = tab.playwright.locator('[data-testid="field-company-filter"]');
  await selectUnique(companyFilter, "all", "field company filter all companies");
  await waitFor(
    tab,
    ({ jobTitle, inspectionTitle }) => {
      const text = document.body.innerText.toLowerCase();

      return (
        Boolean(document.querySelector('[data-testid="field-operations-workspace"]')) &&
        text.includes("mobile crew workspace") &&
        text.includes("today's assigned work") &&
        text.includes(jobTitle.toLowerCase()) &&
        text.includes(inspectionTitle.toLowerCase()) &&
        text.includes("upload field photo") &&
        text.includes("report issue") &&
        text.includes("materials")
      );
    },
    "field operations workspace",
    15000,
    {
      jobTitle: seededJob.title,
      inspectionTitle: inspection.title,
    },
  );

  const initialLayout = await tab.playwright.evaluate(() => ({
    hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8,
    detailVisible: Boolean(document.querySelector('[data-testid="field-assignment-detail"]')),
    propertyVisible: Boolean(document.querySelector('[data-testid="field-property-summary"]')),
    checklistVisible: Boolean(document.querySelector('[data-testid="field-checklist-section"]')),
    uploadStateVisible: Boolean(document.querySelector('[data-testid="field-photo-upload-state"]')),
  }));

  if (initialLayout.hasHorizontalOverflow) {
    throw new Error("Field Operations workspace has horizontal overflow at desktop width.");
  }

  if (!initialLayout.detailVisible || !initialLayout.propertyVisible || !initialLayout.checklistVisible) {
    throw new Error("Field Operations detail, property summary, or checklist did not render.");
  }

  if (!initialLayout.uploadStateVisible) {
    throw new Error("Field photo upload state is not visible.");
  }

  const selectedJobCard = tab.playwright
    .locator('[data-testid="field-assignment-card"]')
    .filter({ hasText: seededJob.title });
  await clickUnique(selectedJobCard, "field job assignment");

  await selectUnique(companyFilter, company.id, "field company filter WeatherTech");
  await waitFor(
    tab,
    (jobTitle) => document.body.innerText.includes(jobTitle),
    "field company scope includes WeatherTech job",
    10000,
    seededJob.title,
  );

  const otherCompany = await tab.playwright.evaluate((companyId) => {
    const select = document.querySelector('[data-testid="field-company-filter"]');
    return [...select?.querySelectorAll("option") ?? []]
      .map((option) => option.value)
      .find((value) => value !== "all" && value !== companyId) ?? null;
  }, company.id);

  if (otherCompany) {
    await selectUnique(companyFilter, otherCompany, "field company filter other company");
    await waitFor(
      tab,
      (jobTitle) => !document.body.innerText.includes(jobTitle),
      "field company scope hides WeatherTech job",
      10000,
      seededJob.title,
    );
    await selectUnique(companyFilter, "all", "field company filter all companies");
    await clickUnique(selectedJobCard, "field job assignment after all companies");
  }

  await selectUnique(tab.playwright.locator('[data-testid="field-status-select"]'), "paused", "field paused status");
  await clickVisibleDomSubmitByText(tab, "Save status", "save paused without reason");
  await waitFor(
    tab,
    () => document.body.innerText.includes("Add a reason before marking Paused."),
    "paused reason validation",
    10000,
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-status-reason"]'),
    `${TEST_PREFIX} ${fieldRunId} weather delay`,
    "field paused reason",
  );
  await clickVisibleDomSubmitByText(tab, "Save status", "save paused status");
  await waitFor(
    tab,
    () => document.body.innerText.includes("Field status saved as Paused."),
    "paused status saved notice",
    15000,
  );

  const pausedNote = await findJobNoteContaining(env, seededJob.id, "Field status - Paused");
  if (!pausedNote) {
    throw new Error("Field paused status did not create a job note.");
  }

  await selectUnique(tab.playwright.locator('[data-testid="field-status-select"]'), "work_started", "field work started status");
  await waitFor(
    tab,
    () => document.querySelector('[data-testid="field-status-select"]')?.value === "work_started",
    "field work started status selected",
    5000,
  );
  await clickVisibleDomSubmitByText(tab, "Save status", "save work started status");
  const startedJob = await waitForAsync(
    async () => {
      const job = await findJobByTitle(env, seededJob.title);

      return job?.status === "in_progress" ? job : null;
    },
    "field work started job persistence",
    15000,
  );
  if (startedJob?.status !== "in_progress") {
    throw new Error(`Field work started did not update job status; got ${startedJob?.status ?? "missing"}.`);
  }
  const startedLog = await findDailyLogByWorkCompleted(env, seededJob.id, "Work Started");
  if (!startedLog) {
    throw new Error("Field work started did not create a daily log.");
  }

  const seededChecklistRow = tab.playwright
    .locator('[data-testid="field-checklist-row"]')
    .filter({ hasText: seededTaskTitle });
  await scrollSelectorIntoView(tab, '[data-testid="field-checklist-section"]', "field checklist section");
  await clickUnique(
    seededChecklistRow.locator('[data-testid="field-checklist-complete"]'),
    "field checklist complete",
  );
  const completedTask = await waitForAsync(
    async () => {
      const task = await findJobTaskByTitle(env, seededJob.id, seededTaskTitle);

      return task?.status === "done" ? task : null;
    },
    "field checklist persisted",
    15000,
  );
  if (completedTask?.status !== "done") {
    throw new Error(`Field checklist action did not persist; got ${completedTask?.status ?? "missing"}.`);
  }

  await selectUnique(tab.playwright.locator('[data-testid="field-issue-category"]'), "Safety", "field issue category");
  await selectUnique(tab.playwright.locator('[data-testid="field-issue-priority"]'), "critical", "field issue priority");
  await fillUnique(
    tab.playwright.locator('[data-testid="field-issue-details"]'),
    `${TEST_PREFIX} ${fieldRunId} safety harness concern`,
    "field issue details",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-issue-office-action"]'),
    "Call crew lead and pause production",
    "field issue office action",
  );
  await scrollSelectorIntoView(tab, '[data-testid="field-issue-submit"]', "field issue submit");
  await clickVisibleDomSubmitByText(tab, "Report issue", "submit field issue");
  const fieldIssueNote = await waitForAsync(
    () => findJobNoteContaining(env, seededJob.id, "Field issue - Safety"),
    "field issue persisted",
    15000,
  );
  if (!fieldIssueNote) {
    throw new Error("Field issue did not persist as a job note.");
  }

  await selectUnique(tab.playwright.locator('[data-testid="field-material-action"]'), "Materials missing", "field material missing");
  await fillUnique(
    tab.playwright.locator('[data-testid="field-material-name"]'),
    `${TEST_PREFIX} ${fieldRunId} ridge cap`,
    "field material name",
  );
  await scrollSelectorIntoView(tab, '[data-testid="field-material-submit"]', "field material submit");
  await clickVisibleDomSubmitByText(tab, "Save material update", "save field material");
  const materialIssueNote = await waitForAsync(
    () => findJobNoteContaining(env, seededJob.id, "Field material issue - Materials missing"),
    "field material issue persisted",
    15000,
  );
  if (!materialIssueNote) {
    throw new Error("Missing material report did not create an office-visible note.");
  }

  const invalidPhotoPath = join(tmpdir(), `${TEST_PREFIX}-${fieldRunId}-not-photo.txt`);
  writeFileSync(invalidPhotoPath, "not an image");
  try {
    await scrollSelectorIntoView(tab, '[data-testid="field-photo-upload-form"]', "field photo upload form");
    const fileChooserPromise = tab.playwright.waitForEvent("filechooser", { timeoutMs: 10000 });
    await clickUnique(
      tab.playwright.locator('xpath=//*[@data-testid="field-photo-upload-form"]//label[.//*[@data-testid="field-photo-file-input"]]'),
      "field photo chooser",
    );
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(invalidPhotoPath, { timeoutMs: 10000 });
  } finally {
    try {
      unlinkSync(invalidPhotoPath);
    } catch {
      // The temporary upload fixture is best-effort cleanup only.
    }
  }
  await clickUnique(tab.playwright.locator('xpath=//*[@data-testid="field-photo-upload-form"]//button[@type="submit"]'), "submit invalid field photo");
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Choose an image file from the camera or photo library.") &&
      document.querySelector('[data-testid="field-photo-retry"]'),
    "field invalid photo retry visible",
    10000,
  );

  await clickVisibleDomButtonByText(tab, "Operations Queue", "open operations queue from field");
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="operations-intelligence-queue"]')) &&
      document.body.innerText.includes("Field Operations"),
    "field issue appears in Operations Queue",
    15000,
  );

  await clickNav(tab, "Field Ops");
  await clickUnique(selectedJobCard, "field job assignment before job navigation");
  await clickUnique(tab.playwright.getByRole("button", { name: "View job" }), "field view job");
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="jobs-search"]')) &&
      document.body.innerText.includes("Jobs / Projects"),
    "field navigation to jobs",
    15000,
  );

  await clickNav(tab, "Field Ops");
  await waitFor(
    tab,
    () => Boolean(document.querySelector('[data-testid="field-operations-workspace"]')),
    "field operations returns from job navigation",
    10000,
  );

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  await clickNav(tab, "Field Ops");
  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="field-operations-workspace"]');
      return Boolean(workspace) && document.documentElement.scrollWidth <= window.innerWidth + 8;
    },
    "field operations mobile layout",
    10000,
  );
  await viewport.set(LAPTOP_VIEWPORT);
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);

  return {
    seededJobId: seededJob.id,
    inspectionId: inspection.id,
    fieldIssueNoteId: fieldIssueNote.id,
    materialIssueNoteId: materialIssueNote.id,
  };
}

async function testLeadsWorkflow(tab, env, company, runId, leadNameColumn) {
  const leadName = `${TEST_PREFIX} ${runId} LEAD`;
  const updatedNote = `${TEST_PREFIX} ${runId} LEAD UPDATED`;
  const leadAddress = "456 TEST Regression Lead Ave, Phoenix, AZ";
  const leadPhone = "(602) 555-0100";
  const normalizedLeadPhone = "+16025550100";
  const leadEmail = `REGRESSION-${runId}@EXAMPLE.TEST`;
  const normalizedLeadEmail = `regression-${runId}@example.test`;
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

  if (createdLead.phone !== normalizedLeadPhone) {
    throw new Error(`Created lead phone was ${createdLead.phone}, expected ${normalizedLeadPhone}.`);
  }

  if (createdLead.email !== normalizedLeadEmail) {
    throw new Error(`Created lead email was ${createdLead.email}, expected ${normalizedLeadEmail}.`);
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
  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="daily-workflow-handoff"]')?.textContent ?? "";

      return text.includes("Lead next action") && text.includes("inspection, estimate, approval, and production");
    },
    "lead workflow handoff",
    10000,
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

async function testSalesPipelineWorkflow(tab, env, company, lead, runId, progress) {
  const leadName = lead.leadName;
  const opportunityNotes = `${TEST_PREFIX} ${runId} OPPORTUNITY NOTE`;
  const expectedRevenue = 8765;
  const followUpDate = new Date().toISOString().slice(0, 10);
  const estimateTitle = `${leadName} opportunity estimate`;
  const jobTitle = `${leadName} opportunity job`;
  const detailForm = '[data-testid="sales-pipeline-detail-form"]';
  const selectOpportunity = async (label) => {
    await fillUnique(
      tab.playwright.locator('[data-testid="sales-pipeline-search"]'),
      leadName,
      `${label} opportunity search`,
    );
    await tab.playwright.waitForTimeout(500);
    const opportunityRow = tab.playwright.locator(
      `xpath=//*[@data-testid="sales-pipeline-opportunity-row" and .//p[normalize-space(.)=${xpathString(leadName)}]]`,
    );
    await clickUnique(opportunityRow, `${label} opportunity row ${leadName}`, {
      retryTransientClick: true,
    });

    return opportunityRow;
  };

  progress("sales-pipeline:open:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  await clickCompanyScope(tab, company.name);
  await clickNav(tab, "Sales Pipeline");
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="sales-pipeline-workspace"]')) &&
      document.body.innerText.includes("Opportunity Management"),
    "Sales Pipeline workspace",
    15000,
  );
  progress("sales-pipeline:open:done");

  const opportunityRow = await selectOpportunity("initial");
  await waitFor(
    tab,
    (name) => {
      const heading = document.querySelector('[data-testid="sales-pipeline-detail-form"]')
        ?.closest("section")
        ?.querySelector("h3");

      return heading?.textContent?.trim() === name;
    },
    `selected opportunity ${leadName}`,
    15000,
    leadName,
  );

  await selectUnique(
    tab.playwright.locator(`${detailForm} select[name="pipeline_stage"]`),
    "estimate_sent",
    "opportunity stage",
  );
  await selectUnique(
    tab.playwright.locator(`${detailForm} select[name="owner"]`),
    "me",
    "opportunity owner",
  );
  await fillUnique(
    tab.playwright.locator(`${detailForm} input[name="estimated_value"]`),
    String(expectedRevenue),
    "opportunity expected revenue",
  );
  await fillDateUnique(
    tab.playwright.locator(`${detailForm} input[name="next_follow_up"]`),
    followUpDate,
    "opportunity follow-up date",
  );
  await selectUnique(
    tab.playwright.locator(`${detailForm} select[name="priority"]`),
    "urgent",
    "opportunity priority",
  );
  await fillUnique(
    tab.playwright.locator(`${detailForm} textarea[name="notes"]`),
    opportunityNotes,
    "opportunity notes",
  );
  await waitFor(
    tab,
    (expected) => {
      const form = document.querySelector('[data-testid="sales-pipeline-detail-form"]');

      return (
        form?.querySelector('select[name="pipeline_stage"]')?.value === "estimate_sent" &&
        form?.querySelector('select[name="owner"]')?.value === "me" &&
        form?.querySelector('input[name="estimated_value"]')?.value === String(expected.expectedRevenue) &&
        form?.querySelector('input[name="next_follow_up"]')?.value === expected.followUpDate &&
        form?.querySelector('select[name="priority"]')?.value === "urgent" &&
        form?.querySelector('textarea[name="notes"]')?.value === expected.opportunityNotes
      );
    },
    "opportunity form values before save",
    10000,
    { expectedRevenue, followUpDate, opportunityNotes },
  );
  await activateSubmitButtonByText(tab, "Save opportunity", "Save opportunity");
  const updatedLead = await waitForAsync(async () => {
    const row = await findLeadById(env, lead.leadId);

    if (
      row?.pipeline_stage === "estimate_sent" &&
      row.priority === "urgent" &&
      Number(row.estimated_value) === expectedRevenue &&
      row.next_follow_up === followUpDate &&
      row.notes === opportunityNotes &&
      row.created_by
    ) {
      return row;
    }

    return null;
  }, "updated opportunity fields", 15000);

  if (!updatedLead) {
    throw new Error("Opportunity update was not confirmed in Supabase.");
  }

  await waitFor(
    tab,
    () => document.body.innerText.includes("Opportunity updated."),
    "opportunity update success toast",
    5000,
  ).catch(() => null);

  await selectUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-stage-filter"]'),
    "estimate_sent",
    "opportunity stage filter",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    "opportunity remains visible after stage filter",
    10000,
    leadName,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-owner-filter"]'),
    "mine",
    "opportunity owner filter",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    "opportunity remains visible after owner filter",
    10000,
    leadName,
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-stage-filter"]'),
    "all",
    "reset opportunity stage filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-owner-filter"]'),
    "all",
    "reset opportunity owner filter",
  );
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    "opportunity remains visible after filters reset",
    10000,
    leadName,
  );
  await clickUnique(opportunityRow, `opportunity row ${leadName} before conversion`, {
    retryTransientClick: true,
  });
  await waitFor(
    tab,
    () => {
      const linkedWorkflow = [...document.querySelectorAll("section")].find((section) =>
        section.querySelector("h3")?.textContent?.trim() === "Linked workflow",
      );
      const text = linkedWorkflow?.textContent ?? "";

      return text.includes("Create draft estimate from opportunity");
    },
    "opportunity linked workflow ready",
    10000,
  );

  progress("sales-pipeline:estimate:start");
  await scrollSelectorIntoView(
    tab,
    '[data-testid="sales-pipeline-estimate-action"]',
    "Create opportunity estimate",
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-estimate-action"]'),
    "Create opportunity estimate",
    { retryTransientClick: true },
  );
  const estimate = await waitForAsync(
    async () => {
      const createdEstimate = await findEstimateByTitle(env, estimateTitle);

      if (createdEstimate) {
        return createdEstimate;
      }

      const visibleError = await tab.playwright.evaluate(() => {
        const lines = document.body.innerText
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(
            (line) =>
              line.startsWith("Unable") ||
              line.includes("violates") ||
              line.includes("Could not") ||
              line.includes("failed"),
          );

        return lines.slice(-3).join(" | ");
      });

      if (visibleError) {
        throw new Error(`Opportunity estimate UI error: ${visibleError}`);
      }

      return null;
    },
    "opportunity estimate",
    45000,
  );

  if (estimate.lead_id !== lead.leadId) {
    throw new Error("Opportunity estimate was not linked to the source lead.");
  }

  if (estimate.company_id !== company.id) {
    throw new Error("Opportunity estimate was not scoped to the expected company.");
  }

  if (!estimate.customer_id) {
    throw new Error("Opportunity estimate did not link or create a customer.");
  }

  const estimateCount = await countEstimatesByTitle(env, estimateTitle);
  if (estimateCount !== 1) {
    throw new Error(`Expected one opportunity estimate, found ${estimateCount}.`);
  }
  progress("sales-pipeline:estimate:done");

  await waitFor(
    tab,
    () => document.body.innerText.includes("Draft estimate created from opportunity."),
    "opportunity estimate success toast",
    15000,
  );
  try {
    await waitFor(
      tab,
      () => document.body.innerText.toLowerCase().includes("estimate linked"),
      "opportunity estimate linked badge",
      15000,
    );
  } catch {
    await tab.reload();
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
    await ensureAppShell(tab, BASE_URL, progress);
    await clickCompanyScope(tab, company.name);
    await clickNav(tab, "Sales Pipeline");
    await selectOpportunity("reloaded estimate-linked");
    await waitFor(
      tab,
      () => document.body.innerText.toLowerCase().includes("estimate linked"),
      "opportunity estimate linked badge after reload",
      15000,
    );
  }

  progress("sales-pipeline:job:start");
  await scrollSelectorIntoView(
    tab,
    '[data-testid="sales-pipeline-job-action"]',
    "Create opportunity job",
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-job-action"]'),
    "Create opportunity job",
    { retryTransientClick: true },
  );
  const job = await waitForAsync(
    async () => {
      const createdJob = await findJobByTitle(env, jobTitle);

      if (createdJob) {
        return createdJob;
      }

      const visibleError = await tab.playwright.evaluate(() => {
        const lines = document.body.innerText
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(
            (line) =>
              line.startsWith("Unable") ||
              line.includes("violates") ||
              line.includes("Could not") ||
              line.includes("failed"),
          );

        return lines.slice(-3).join(" | ");
      });

      if (visibleError) {
        throw new Error(`Opportunity job UI error: ${visibleError}`);
      }

      return null;
    },
    "opportunity job",
    45000,
  );

  if (job.lead_id !== lead.leadId) {
    throw new Error("Opportunity job was not linked to the source lead.");
  }

  if (job.company_id !== company.id) {
    throw new Error("Opportunity job was not scoped to the expected company.");
  }

  if (job.customer_id !== estimate.customer_id) {
    throw new Error("Opportunity job did not reuse the linked customer.");
  }

  const jobCount = await countJobsByTitle(env, jobTitle);
  if (jobCount !== 1) {
    throw new Error(`Expected one opportunity job, found ${jobCount}.`);
  }
  progress("sales-pipeline:job:done");

  await waitFor(
    tab,
    () => document.body.innerText.includes("Draft job created from opportunity."),
    "opportunity job success toast",
    15000,
  );
  try {
    await waitFor(
      tab,
      () => document.body.innerText.toLowerCase().includes("job linked"),
      "opportunity job linked badge",
      15000,
    );
  } catch {
    await tab.reload();
    await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
    await ensureAppShell(tab, BASE_URL, progress);
    await clickCompanyScope(tab, company.name);
    await clickNav(tab, "Sales Pipeline");
    await selectOpportunity("reloaded job-linked");
    await waitFor(
      tab,
      () => document.body.innerText.toLowerCase().includes("job linked"),
      "opportunity job linked badge after reload",
      15000,
    );
  }

  progress("sales-pipeline:refresh:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  await clickCompanyScope(tab, company.name);
  await clickNav(tab, "Sales Pipeline");
  await fillUnique(
    tab.playwright.locator('[data-testid="sales-pipeline-search"]'),
    leadName,
    "opportunity search after reload",
  );
  await waitFor(
    tab,
    (expected) => {
      const text = document.body.innerText;

      return (
        text.includes(expected.leadName) &&
        text.toLowerCase().includes("estimate linked") &&
        text.toLowerCase().includes("job linked") &&
        text.includes("95%")
      );
    },
    "opportunity conversion persisted after reload",
    20000,
    { leadName },
  );
  progress("sales-pipeline:refresh:done");

  const finalLead = await findLeadById(env, lead.leadId);

  if (finalLead?.pipeline_stage !== "job_scheduled" || finalLead.status !== "won") {
    throw new Error("Opportunity final won/job-scheduled state did not persist.");
  }

  if ("customer_id" in finalLead && finalLead.customer_id !== estimate.customer_id) {
    throw new Error("Opportunity final customer linkage did not persist.");
  }

  return {
    leadId: lead.leadId,
    estimateId: estimate.id,
    jobId: job.id,
    customerId: estimate.customer_id,
    finalStage: finalLead.pipeline_stage,
    finalStatus: finalLead.status,
  };
}

async function testLeadIntakeWorkspace(tab, env, company, runId, leadNameColumn) {
  const leadName = `${TEST_PREFIX} ${runId} INTAKE`;
  const leadAddress = "932 TEST Intake Way, Phoenix, AZ";
  const leadPhone = "(602) 555-0123";
  const normalizedLeadPhone = "+16025550123";
  const leadEmail = `INTAKE-${runId}@EXAMPLE.TEST`;
  const normalizedLeadEmail = `intake-${runId}@example.test`;
  const intakeSection = 'xpath=//h3[normalize-space(.)="New lead intake"]/ancestor::section[1]';

  await clickNav(tab, "Lead Intake");
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Lead Intake") &&
      document.body.innerText.includes("New lead intake") &&
      document.body.innerText.includes("Recent intake"),
    "lead intake workspace",
  );

  await selectUnique(
    tab.playwright.locator(`${intakeSection}//select[@name="company_id"]`),
    company.id,
    "lead intake company",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="contact_name"]`),
    leadName,
    "lead intake contact name",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="property_address"]`),
    leadAddress,
    "lead intake property address",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="phone"]`),
    leadPhone,
    "lead intake phone",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="email"]`),
    leadEmail,
    "lead intake email",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="city"]`),
    "Phoenix",
    "lead intake city",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="source"]`),
    "Office intake",
    "lead intake source",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//input[@name="estimated_value"]`),
    "7650",
    "lead intake estimated value",
  );
  await selectUnique(
    tab.playwright.locator(`${intakeSection}//select[@name="pipeline_stage"]`),
    "contacted",
    "lead intake status",
  );
  await fillUnique(
    tab.playwright.locator(`${intakeSection}//textarea[@name="notes"]`),
    `${TEST_PREFIX} ${runId} intake note`,
    "lead intake notes",
  );

  let createdLead = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await clickVisibleDomSubmitByText(
      tab,
      "Save lead intake",
      `Save lead intake attempt ${attempt}`,
    );

    try {
      createdLead = await waitForAsync(
        () => findLeadByContactName(env, leadName, leadNameColumn),
        `Supabase lead intake ${leadName}`,
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
    throw new Error("Created lead intake record was not found through Supabase.");
  }

  if (createdLead.company_id !== company.id) {
    throw new Error(`Lead intake company was ${createdLead.company_id}, expected ${company.id}.`);
  }

  if (createdLead.phone !== normalizedLeadPhone) {
    throw new Error(`Lead intake phone was ${createdLead.phone}, expected ${normalizedLeadPhone}.`);
  }

  if (createdLead.email !== normalizedLeadEmail) {
    throw new Error(`Lead intake email was ${createdLead.email}, expected ${normalizedLeadEmail}.`);
  }

  if (createdLead.pipeline_stage !== "contacted" || createdLead.status !== "contacted") {
    throw new Error(
      `Lead intake status was ${createdLead.status}/${createdLead.pipeline_stage}, expected contacted/contacted.`,
    );
  }

  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `lead intake recent record ${leadName}`,
    10000,
    leadName,
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Lead intake saved to CRM."),
    "lead intake success toast",
    12000,
  );

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await clickNav(tab, "Lead Intake");
  await waitFor(
    tab,
    (name) => document.body.innerText.includes(name),
    `lead intake persisted after reload ${leadName}`,
    15000,
    leadName,
  );

  return {
    leadId: createdLead.id,
    leadName,
    pipelineStage: createdLead.pipeline_stage,
    status: createdLead.status,
  };
}

async function testCustomersWorkflow(tab, env, company, runId) {
  const displayName = `${TEST_PREFIX} ${runId} CUSTOMER`;
  const updatedDisplayName = `${TEST_PREFIX} ${runId} CUSTOMER UPDATED`;
  const updatedContact = `${TEST_PREFIX} ${runId} CONTACT UPDATED`;
  const updatedNotes = `${TEST_PREFIX} ${runId} CUSTOMER NOTES UPDATED`;
  const updatedPhone = "(602) 555-0555";
  const normalizedUpdatedPhone = "+16025550555";
  const updatedPhoneSearch = "6025550555";
  const updatedEmail = `CUSTOMER-UPDATED-${runId}@EXAMPLE.TEST`;
  const normalizedUpdatedEmail = `customer-updated-${runId}@example.test`;
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

  if (updatedCustomer.phone !== normalizedUpdatedPhone) {
    throw new Error(
      `Updated customer phone was ${updatedCustomer.phone}, expected ${normalizedUpdatedPhone}.`,
    );
  }

  if (updatedCustomer.email !== normalizedUpdatedEmail) {
    throw new Error(
      `Updated customer email was ${updatedCustomer.email}, expected ${normalizedUpdatedEmail}.`,
    );
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
        workspaceText.includes("Customer next action") &&
        workspaceText.includes("sales, production, billing, and warranty") &&
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
            propertySection.textContent.includes("Property health") &&
            propertySection.textContent.includes("Roof condition") &&
            propertySection.textContent.includes("Paint condition") &&
            propertySection.textContent.includes("Warranty status") &&
            propertySection.textContent.includes("Document complete") &&
            propertySection.textContent.includes("Property intelligence") &&
            propertySection.textContent.includes("Roof system") &&
            propertySection.textContent.includes("Roof manufacturer") &&
            propertySection.textContent.includes("Roofing material") &&
            propertySection.textContent.includes("Exterior paint colors") &&
            propertySection.textContent.includes("Gate codes") &&
            propertySection.textContent.includes("Inspection history") &&
            propertySection.textContent.includes("Property timeline") &&
            propertySection.textContent.includes("Operational history") &&
            propertySection.textContent.includes("AI-ready summary"),
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
  await waitFor(
    tab,
    () => {
      const review = document.querySelector('[data-testid="customer-duplicate-review"]');
      const text = review?.textContent ?? "";

      return (
        text.includes("Possible duplicate customer") &&
        text.includes("same email") &&
        text.includes("Open existing Customer 360") &&
        text.includes("Create separate customer")
      );
    },
    "customer duplicate review panel",
    10000,
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="customer-duplicate-review"] button').filter({
      hasText: "Create separate customer",
    }),
    "Create separate duplicate-reviewed customer",
    { retryTransientClick: true },
  );
  const duplicateCustomer = await waitForAsync(
    () => findCustomerByDisplayName(env, `${displayName} DUPLICATE`),
    "duplicate-reviewed separate customer",
    12000,
  );

  if (!duplicateCustomer) {
    throw new Error("Duplicate-reviewed customer was not created.");
  }

  return {
    customerId: updatedCustomer.id,
    companyId: updatedCustomer.company_id,
    status: updatedCustomer.status,
    customerType: updatedCustomer.customer_type,
  };
}

async function testUnifiedInboxSearchAndFilters(
  tab,
  env,
  companies,
  leadWorkflow,
  runId,
  baseUrl,
  progress,
) {
  progress("communications:seed:start");
  const communicationsSeed = await seedCommunicationHubRecords(env, companies, leadWorkflow, runId);
  progress("communications:seed:done");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, baseUrl, progress);
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Inbox");
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
          text.includes("communications hub") &&
          text.includes("lead and communication activity") &&
          text.includes("needs response") &&
          text.includes("failed delivery") &&
          text.includes("all conversations") &&
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
          text.includes("business phone") &&
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
    communicationsSeed.websiteIntake.contact_name,
    "inbox search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="inbox-kind-filter"]'),
    "Lead Intake",
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
    "follow_up",
    "inbox follow-up state filter",
  );
  await waitFor(
    tab,
    (expected) => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes(expected.websiteName.toLowerCase()) &&
        text.includes("website") &&
        text.includes("lead intake") &&
        text.includes("possible duplicate") &&
        text.includes("needs response")
      );
    },
    "filtered inbox lead",
    10000,
    {
      websiteName: communicationsSeed.websiteIntake.contact_name,
    },
  );
  await waitFor(
    tab,
    (expected) => {
      const detail = document.querySelector('[data-testid="communication-detail"]');
      const text = detail?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("conversation detail") &&
        text.includes("source") &&
        text.includes("response") &&
        text.includes("routing") &&
        text.includes("delivery") &&
        text.includes("sync") &&
        text.includes("suggested next action") &&
        text.includes("participants") &&
        text.includes("attachments") &&
        text.includes("related records") &&
        text.includes("advanced provider details") &&
        text.includes("supported actions") &&
        text.includes("no outbound call") &&
        text.includes(expected.websiteName.toLowerCase())
      );
    },
    "communication detail panel",
    10000,
    {
      websiteName: communicationsSeed.websiteIntake.contact_name,
    },
  );
  await clickUnique(tab.playwright.getByRole("button", { name: "Clear" }), "Clear inbox filters");
  await clickUnique(
    tab.playwright.locator(
      'xpath=//div[@aria-label="Communication inbox views"]//button[contains(normalize-space(.), "Yelp")]',
    ),
    "Yelp inbox view",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="inbox-search"]'),
    communicationsSeed.yelpIntake.contact_name,
    "Yelp inbox search",
  );
  await waitFor(
    tab,
    (expected) => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes(expected.yelpName.toLowerCase()) &&
        text.includes("yelp") &&
        text.includes("ihc") &&
        text.includes("manual review")
      );
    },
    "Yelp account source and routing",
    10000,
    {
      yelpName: communicationsSeed.yelpIntake.contact_name,
    },
  );
  await clickUnique(tab.playwright.getByRole("button", { name: "Clear" }), "Clear Yelp inbox filters");
  await clickUnique(
    tab.playwright.locator(
      'xpath=//div[@aria-label="Communication inbox views"]//button[contains(normalize-space(.), "Calls")]',
    ),
    "Calls inbox view",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="inbox-search"]'),
    communicationsSeed.fakeCustomerPhone,
    "missed call search",
  );
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return text.includes("missed") && text.includes("call back or assign");
    },
    "missed call inbox item",
    10000,
  );
  await clickUnique(tab.playwright.getByRole("button", { name: "Clear" }), "Clear call inbox filters");
  await clickUnique(
    tab.playwright.locator(
      'xpath=//div[@aria-label="Communication inbox views"]//button[contains(normalize-space(.), "Failed Delivery")]',
    ),
    "Failed delivery inbox view",
  );
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes("provider delivery failure") ||
        text.includes("test seeded sms delivery failure") ||
        text.includes("failed sms body")
      );
    },
    "failed delivery inbox item",
    10000,
  );
  await clickUnique(tab.playwright.getByRole("button", { name: "Clear" }), "Clear failed delivery filters");
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
  await clickNav(tab, "Operations");
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
        text.includes("communications") &&
        (text.includes("missed call") ||
          text.includes("new voicemail") ||
          text.includes("provider delivery failure") ||
          text.includes("customer waiting for response"))
      );
    },
    "communications surfaced in Operations Queue",
    15000,
  );

  return {
    search: "passed",
    kindFilter: "Lead Intake",
    providerFilter: "Website",
    yelpAccount: "preserved",
    missedCall: "queued",
    failedDelivery: "visible",
    operationsQueue: "visible",
    detailPanel: "passed",
  };
}

async function testUnifiedLeadIntake(tab, env, companies, runId, baseUrl, leadNameColumn, progress) {
  const websiteExternalId = `${TEST_PREFIX} ${runId} WEBSITE EXT`;
  const websiteLeadName = `${TEST_PREFIX} ${runId} WEBSITE INTAKE`;
  const yelpExternalId = `${TEST_PREFIX} ${runId} YELP EXT`;
  const yelpLeadName = `${TEST_PREFIX} ${runId} YELP INTAKE`;
  const gbpExternalId = `${TEST_PREFIX} ${runId} GBP EXT`;
  const gbpLeadName = `${TEST_PREFIX} ${runId} GBP INTAKE`;
  const retryExternalId = `${TEST_PREFIX} ${runId} RETRY EXT`;
  const retryLeadName = `${TEST_PREFIX} ${runId} RETRY INTAKE`;
  const submittedAt = new Date().toISOString();

  progress("lead-intake:invalid-json:start");
  for (const path of [
    "/api/leads/website",
    "/api/leads/yelp",
    "/api/leads/google-business-profile",
  ]) {
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

  progress("lead-intake:gbp:request-guards:start");
  const unsupportedGbpContentType = await fetch(
    new URL("/api/leads/google-business-profile", baseUrl),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "text/plain",
      },
      body: "not-json",
    },
  );
  const unsupportedGbpBody = await unsupportedGbpContentType.json();

  if (
    unsupportedGbpContentType.status !== 415 ||
    unsupportedGbpBody?.status !== "unsupported_content_type"
  ) {
    throw new Error(
      `GBP unsupported content type was ${unsupportedGbpContentType.status} ${JSON.stringify(unsupportedGbpBody)}`,
    );
  }

  const oversizedGbp = await postAppJson(
    baseUrl,
    "/api/leads/google-business-profile",
    {
      locationKey: "weathertech-phoenix",
      reviewerName: `${TEST_PREFIX} ${runId} OVERSIZED GBP`,
      reviewText: "x".repeat(33000),
    },
  );

  if (oversizedGbp.status !== 413 || oversizedGbp.body?.status !== "payload_too_large") {
    throw new Error(
      `GBP oversized payload was ${oversizedGbp.status} ${JSON.stringify(oversizedGbp.body)}`,
    );
  }
  progress("lead-intake:gbp:request-guards:done");

  progress("lead-intake:website:dry-run:start");
  const websitePayload = {
    sourceId: "weathertech-phoenix",
    formType: "roof_inspection_request",
    websiteUrl: "https://weathertechroofingaz.com/test-intake",
    landingPage: "https://weathertechroofingaz.com/phoenix-roof-inspection",
    source: "Website",
    utmSource: "test-suite",
    utmMedium: "form",
    utmCampaign: `${TEST_PREFIX} ${runId} CAMPAIGN`,
    utmTerm: "roof inspection phoenix",
    utmContent: "regression-form",
    externalLeadId: websiteExternalId,
    submittedAt,
    name: websiteLeadName,
    phone: "6025550111",
    email: `website-${runId}@example.test`,
    address: "111 TEST Website Intake Way, Phoenix, AZ",
    location: "Phoenix",
    requestedService: "roofing",
    textConsent: true,
    callConsent: true,
    privacyPolicyAccepted: true,
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

  if (websiteDryRun.body.form?.key !== "roof_inspection_request") {
    throw new Error(`Website dry run form was ${JSON.stringify(websiteDryRun.body.form)}.`);
  }

  if (websiteDryRun.body.production?.status !== "disabled") {
    throw new Error(`Website dry run did not report disabled production state: ${JSON.stringify(websiteDryRun.body.production)}`);
  }

  const tucsonDryRun = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", {
    ...websitePayload,
    sourceId: "weathertech-tucson",
    formType: "roofing_estimate_request",
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
    formType: "exterior_painting_request",
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

  if (ihcDryRun.body.form?.key !== "exterior_painting_request") {
    throw new Error(`IHC website form was ${JSON.stringify(ihcDryRun.body.form)}.`);
  }

  const unsupportedForm = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", {
    ...websitePayload,
    sourceId: "weathertech-phoenix",
    formType: "painting_estimate_request",
    externalLeadId: `${websiteExternalId} UNSUPPORTED`,
    name: `${websiteLeadName} UNSUPPORTED`,
  });

  if (unsupportedForm.status !== 422 || unsupportedForm.body?.status !== "unsupported_form_type") {
    throw new Error(`Unsupported website form was not rejected: ${unsupportedForm.status} ${JSON.stringify(unsupportedForm.body)}`);
  }

  const unknownDryRun = await postAppJson(baseUrl, "/api/leads/website?dryRun=1", {
    ...websitePayload,
    sourceId: "unknown-website-source",
    formType: "general_service_inquiry",
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

  progress("lead-intake:gbp:dry-run:start");
  const gbpPayload = {
    googleBusinessProfileLocationKey: "weathertech-phoenix",
    source: "Google Business Profile",
    googleReviewId: gbpExternalId,
    submittedAt,
    reviewerName: gbpLeadName,
    phone: "6025550444",
    email: `gbp-${runId}@example.test`,
    city: "Phoenix",
    serviceType: "roofing",
    reviewRating: 3,
    reviewText: `${TEST_PREFIX} ${runId} Google Business Profile intake message`,
  };
  const gbpPhoenixDryRun = await postAppJson(
    baseUrl,
    "/api/leads/google-business-profile?dryRun=1",
    gbpPayload,
  );

  if (
    gbpPhoenixDryRun.status !== 200 ||
    gbpPhoenixDryRun.body?.routing?.company !== "weathertech_roofing" ||
    gbpPhoenixDryRun.body?.routing?.branch !== "weathertech_phoenix"
  ) {
    throw new Error(`Phoenix GBP dry run failed: ${gbpPhoenixDryRun.status} ${JSON.stringify(gbpPhoenixDryRun.body)}`);
  }

  const gbpTucsonDryRun = await postAppJson(
    baseUrl,
    "/api/leads/google-business-profile?dryRun=1",
    {
      ...gbpPayload,
      googleBusinessProfileLocationKey: "weathertech-tucson",
      googleReviewId: `${gbpExternalId} TUCSON`,
      reviewerName: `${gbpLeadName} TUCSON`,
      phone: "5205550444",
      email: `gbp-tucson-${runId}@example.test`,
      city: "Tucson",
    },
  );

  if (gbpTucsonDryRun.status !== 200 || gbpTucsonDryRun.body?.routing?.branch !== "weathertech_tucson") {
    throw new Error(`Tucson GBP dry run failed: ${gbpTucsonDryRun.status} ${JSON.stringify(gbpTucsonDryRun.body)}`);
  }

  const gbpIhcDryRun = await postAppJson(
    baseUrl,
    "/api/leads/google-business-profile?dryRun=1",
    {
      ...gbpPayload,
      googleBusinessProfileLocationKey: "ihc",
      googleReviewId: `${gbpExternalId} IHC`,
      reviewerName: `${gbpLeadName} IHC`,
      phone: "6025550445",
      email: `gbp-ihc-${runId}@example.test`,
      city: "Tempe",
      serviceType: "painting",
    },
  );

  if (gbpIhcDryRun.status !== 200 || gbpIhcDryRun.body?.routing?.company !== "ihc_painting") {
    throw new Error(`IHC GBP dry run failed: ${gbpIhcDryRun.status} ${JSON.stringify(gbpIhcDryRun.body)}`);
  }

  const unknownGbpDryRun = await postAppJson(
    baseUrl,
    "/api/leads/google-business-profile?dryRun=1",
    {
      ...gbpPayload,
      googleBusinessProfileLocationKey: "unknown-gbp-location",
      googleReviewId: `${gbpExternalId} UNKNOWN`,
      reviewerName: `${gbpLeadName} UNKNOWN`,
    },
  );

  if (
    unknownGbpDryRun.status !== 200 ||
    unknownGbpDryRun.body?.routing?.company !== "unassigned"
  ) {
    throw new Error(`Unknown GBP location was not unassigned: ${unknownGbpDryRun.status} ${JSON.stringify(unknownGbpDryRun.body)}`);
  }

  const unsignedGbp = await postAppJson(
    baseUrl,
    "/api/leads/google-business-profile",
    gbpPayload,
  );

  if (unsignedGbp.status !== 503 || unsignedGbp.body?.status !== "production_disabled") {
    throw new Error(`Unsigned GBP intake was not held behind the disabled live gate: ${unsignedGbp.status} ${JSON.stringify(unsignedGbp.body)}`);
  }
  progress("lead-intake:gbp:dry-run:done");

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

    if (yelpCreate.status !== 503 || yelpCreate.body?.status !== "production_disabled") {
      throw new Error(`Signed Yelp intake was not held behind the disabled live gate: ${yelpCreate.status} ${JSON.stringify(yelpCreate.body)}`);
    }

    yelpCreateMode = "signed_live_disabled";
  }

  if (yelpCreateMode !== "signed_endpoint") {
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
      notes: `${TEST_PREFIX} ${runId} seeded Yelp source badge record. Endpoint live create skipped because Yelp live sync is disabled in the local server.`,
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

  progress("lead-intake:gbp:create:start");
  const gbpSeedBase = {
    company_id: companies.weatherTech.id,
    [leadNameColumn]: gbpLeadName,
    phone: gbpPayload.phone,
    email: gbpPayload.email,
    property_address: "444 TEST GBP Intake Way, Phoenix, AZ",
    status: "new",
    pipeline_stage: "new_lead",
    priority: "normal",
    estimated_value: 0,
    next_follow_up: null,
    notes: `${TEST_PREFIX} ${runId} seeded Google Business Profile source badge record. Endpoint live create skipped because GBP live sync is disabled in the local server.`,
  };
  const gbpSeedPayloads = [
    {
      ...gbpSeedBase,
      source: "Google Business Profile",
    },
    {
      ...gbpSeedBase,
      lead_source: "Google Business Profile",
      service_needed: "roofing",
    },
  ];
  let seededGbpLead = null;
  let lastGbpSeedError = null;

  for (const payload of gbpSeedPayloads) {
    try {
      [seededGbpLead] = await restRequest(env, "leads", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastGbpSeedError = error;

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

  if (!seededGbpLead) {
    throw lastGbpSeedError ?? new Error("Unable to seed GBP UI regression lead.");
  }

  const gbpLeads = await findLeadsByContactName(env, gbpLeadName, leadNameColumn);

  if (gbpLeads.length !== 1) {
    throw new Error(`GBP intake created ${gbpLeads.length} matching leads, expected 1.`);
  }

  const gbpLead = gbpLeads[0];

  if (gbpLead.company_id !== companies.weatherTech.id) {
    throw new Error("GBP intake did not route to WeatherTech Roofing LLC.");
  }

  if (!getLeadRowSource(gbpLead).toLowerCase().includes("google business profile")) {
    throw new Error(`GBP lead source was ${getLeadRowSource(gbpLead)}.`);
  }
  progress("lead-intake:gbp:create:done");

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
    ({ websiteName, yelpName, gbpName }) => {
      const text = document.body.innerText;

      return (
        text.includes(websiteName) &&
        text.includes(yelpName) &&
        text.includes(gbpName) &&
        text.includes("Website") &&
        text.includes("Google Business Profile") &&
        text.includes("Yelp")
      );
    },
    "Website, GBP, and Yelp intake records in Inbox",
    15000,
    { websiteName: retryLeadName, yelpName: yelpLeadName, gbpName: gbpLeadName },
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
        text.includes("google business profile") &&
        text.includes("twilio calls") &&
        text.includes("twilio sms") &&
        text.includes("gmail") &&
        text.includes("google business profile") &&
        text.includes("facebook") &&
        text.includes("gohighlevel") &&
        text.includes("weathertech roofing llc - phoenix") &&
        text.includes("weathertech roofing llc - tucson") &&
        text.includes("ihc painting") &&
        text.includes("unassigned review queue") &&
        text.includes("customer 360 matching") &&
        text.includes("existing customer matches attach to customer 360") &&
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
  await fillUnique(tab.playwright.getByPlaceholder("Search leads", { exact: true }), gbpLeadName, "GBP lead search");
  await waitFor(
    tab,
    (name) =>
      document.body.innerText.includes(name) &&
      document.body.innerText.includes("Google Business Profile"),
    "GBP source badge in Leads",
    15000,
    gbpLeadName,
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
    gbpPhoenixDryRunRouting: gbpPhoenixDryRun.body.routing,
    gbpTucsonDryRunRouting: gbpTucsonDryRun.body.routing,
    gbpIhcDryRunRouting: gbpIhcDryRun.body.routing,
    unknownGbpDryRunRouting: unknownGbpDryRun.body.routing,
    unsignedGbpStatus: unsignedGbp.body.status,
    yelpCreateMode,
    yelpLeadId: yelpLeadRecordId,
    gbpLeadId: gbpLead.id,
    retryLeadId: retryLead.id,
    retryLogId: failedLog.id,
  };
}

async function testEstimatesWorkflow(tab, env, company, lead, runId, progress) {
  const estimateTitle = `${TEST_PREFIX} ${runId} ESTIMATE`;
  const scopeText = `${TEST_PREFIX} ${runId} estimate scope`;
  const estimateLocation = `456 TEST ${runId} Regression Lead Ave, Phoenix, AZ`;
  const estimateCustomer = await seedTestCustomer(
    env,
    company.id,
    runId,
    "ESTIMATE CUSTOMER",
    estimateLocation,
  );

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);

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

  await openEstimateCreateMode(tab, "estimate editor create mode");

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
    estimateLocation,
    "estimate location",
  );
  await clickVisibleDomSubmitByText(
    tab,
    "Create estimate",
    "Create estimate without customer",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Select a customer before saving this estimate."),
    "estimate requires customer validation",
    10000,
  );
  await selectUnique(
    tab.playwright.locator('#estimate-builder select[name="customer_id"]'),
    estimateCustomer.id,
    "estimate customer association",
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

  const savedEstimate = await waitForAsync(
    () => findEstimateByTitle(env, estimateTitle),
    "created estimate persistence",
    30000,
  );

  if (savedEstimate.status !== "draft") {
    throw new Error(`Saved estimate status was ${savedEstimate.status}.`);
  }

  if (savedEstimate.lead_id !== lead.leadId) {
    throw new Error("Saved estimate was not associated with the test lead.");
  }

  if (savedEstimate.customer_id !== estimateCustomer.id) {
    throw new Error("Saved estimate was not associated with the test customer.");
  }

  const lineItemCount = await countEstimateLineItems(env, savedEstimate.id);

  if (lineItemCount < 2) {
    throw new Error(`Expected at least 2 estimate line items, found ${lineItemCount}.`);
  }

  await openEstimateCreateMode(tab, "estimate editor duplicate create mode");
  await selectUnique(
    tab.playwright.locator('#estimate-builder select[name="company_id"]'),
    company.id,
    "duplicate estimate company",
  );
  await selectUnique(
    tab.playwright.locator('#estimate-builder select[name="customer_id"]'),
    estimateCustomer.id,
    "duplicate estimate customer",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder input[name="title"]'),
    estimateTitle,
    "duplicate estimate title",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder input[name="business"]'),
    company.name,
    "duplicate estimate business",
  );
  await fillUnique(
    tab.playwright.locator('#estimate-builder input[name="location"]'),
    estimateLocation,
    "duplicate estimate location",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Item name"])[1]'),
    `${TEST_PREFIX} ${runId} LABOR DUPLICATE`,
    "duplicate estimate labor item",
  );
  await fillUnique(
    tab.playwright.locator('xpath=(//section[@id="estimate-builder"]//input[@placeholder="Price"])[1]'),
    "150",
    "duplicate estimate labor price",
  );
  await clickVisibleDomSubmitByText(
    tab,
    "Create estimate",
    "Create duplicate estimate",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Possible duplicate estimate"),
    "duplicate estimate protection",
    10000,
  );

  const matchingEstimateCount = await countEstimatesByTitle(env, estimateTitle);

  if (matchingEstimateCount !== 1) {
    throw new Error(`Duplicate estimate protection left ${matchingEstimateCount} matching estimates.`);
  }

  await clickListRowByParagraph(
    tab,
    "Estimates",
    estimateTitle,
    `existing estimate row ${estimateTitle}`,
  );

  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="daily-workflow-handoff"]')?.textContent ?? "";

      return text.includes("Estimate next action") && text.includes("signature, approval, job handoff");
    },
    "estimate workflow handoff",
    10000,
  );

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="estimate-approval-workspace"]');
      const requestButton = document.querySelector(
        '[data-testid="estimate-request-signature-button"]',
      );

      return Boolean(
        workspace?.textContent?.includes("Draft approval pending") &&
          requestButton?.textContent?.includes("Request signature"),
      );
    },
    "estimate signature request workspace ready",
    15000,
  );

  progress("estimates:signature-toast:start");
  const signatureButton = tab.playwright.locator(
    '[data-testid="estimate-request-signature-button"]',
  );
  await waitForUniqueLocator(signatureButton, "estimate request signature button");
  await signatureButton.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "auto" }),
  );
  await tab.playwright.waitForTimeout(200);
  await clickUnique(signatureButton, "request estimate signature", {
    retryTransientClick: true,
  });
  await waitFor(
    tab,
    () => {
      const toasts = [...document.querySelectorAll('[role="status"][aria-label="Success notification"]')]
        .filter((toast) => {
          const style = window.getComputedStyle(toast);
          const rect = toast.getBoundingClientRect();

          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        });

      return (
        toasts.length === 1 &&
        toasts[0].textContent.includes("Customer signature requested for the estimate packet.") &&
        Boolean(toasts[0].querySelector('button[aria-label="Dismiss success notification"]'))
      );
    },
    "single dismissible signature request toast",
    20000,
  );
  const toastOverlayAllowsNavigation = await tab.playwright.evaluate(() => {
    const overlay = document.querySelector('[aria-live="polite"]');

    return Boolean(
      overlay &&
        window.getComputedStyle(overlay).pointerEvents === "none",
    );
  });

  if (!toastOverlayAllowsNavigation) {
    throw new Error("Toast overlay can intercept unrelated navigation clicks.");
  }

  await waitFor(
    tab,
    () =>
      ![...document.querySelectorAll('[role="status"][aria-label="Success notification"]')]
        .some((toast) =>
          toast.textContent.includes("Customer signature requested for the estimate packet."),
        ),
    "signature request toast auto-dismiss",
    10000,
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Signature requested"),
    "active signature UI state",
    15000,
  );
  await signatureButton.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "auto" }),
  );
  await tab.playwright.waitForTimeout(200);
  await clickUnique(signatureButton, "duplicate signature request guard", {
    retryTransientClick: true,
  });
  await waitFor(
    tab,
    () => {
      const toasts = [...document.querySelectorAll('[role="status"][aria-label="Success notification"]')]
        .filter((toast) => toast.textContent.includes("active signature request"));

      return toasts.length === 1;
    },
    "single active signature request toast",
    15000,
  );
  await clickUnique(
    tab.playwright.locator('button[aria-label="Dismiss success notification"]'),
    "dismiss success notification",
    { retryTransientClick: true },
  );
  await waitFor(
    tab,
    () =>
      ![...document.querySelectorAll('[role="status"][aria-label="Success notification"]')]
        .some((toast) => toast.textContent.includes("active signature request")),
    "signature duplicate toast dismissed",
    5000,
  );
  progress("estimates:signature-toast:done");

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="estimate-approval-workspace"]');
      const approveButton = document.querySelector('[data-testid="estimate-approve-button"]');

      return Boolean(
        workspace?.textContent?.includes("Draft approval pending") &&
          approveButton &&
          approveButton.disabled === false,
      );
    },
    "estimate approval workspace ready",
    15000,
  );
  await withAcceptedConfirm(tab, async () => {
    await clickUnique(
      tab.playwright.locator('[data-testid="estimate-approve-button"]'),
      "Approve estimate",
      { retryTransientClick: true },
    );
  });

  const approvedEstimate = await waitForAsync(async () => {
    const currentEstimate = await findEstimateByTitle(env, estimateTitle);

    return currentEstimate?.status === "approved" ? currentEstimate : null;
  }, "approved estimate persistence", 15000);

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="estimate-approval-workspace"]');
      const convertButton = document.querySelector('[data-testid="estimate-convert-job-button"]');

      return Boolean(
        workspace?.textContent?.includes("Approved") &&
          workspace?.textContent?.includes("Ready for draft job") &&
          convertButton &&
          convertButton.disabled === false,
      );
    },
    "approved estimate UI state",
    15000,
  );

  await withAcceptedConfirm(tab, async () => {
    await clickUnique(
      tab.playwright.locator('[data-testid="estimate-convert-job-button"]'),
      "Convert estimate to draft job",
      { retryTransientClick: true },
    );
  });

  let linkedJob = await waitForAsync(async () => {
    const job = await findJobByEstimateId(env, approvedEstimate.id);

    return job?.estimate_id === approvedEstimate.id ? job : null;
  }, "estimate-linked draft job persistence", 30000).catch(() => null);

  if (!linkedJob) {
    const conversionStillReady = await tab.playwright.evaluate(() => {
      const workspace = document.querySelector('[data-testid="estimate-approval-workspace"]');
      const convertButton = document.querySelector('[data-testid="estimate-convert-job-button"]');

      return Boolean(
        workspace?.textContent?.includes("Approved") &&
          workspace?.textContent?.includes("Ready for draft job") &&
          convertButton &&
          convertButton.disabled === false,
      );
    });

    if (conversionStillReady) {
      await withAcceptedConfirm(tab, async () => {
        await clickUnique(
          tab.playwright.locator('[data-testid="estimate-convert-job-button"]'),
          "Retry convert estimate to draft job",
          { retryTransientClick: true },
        );
      });

      linkedJob = await waitForAsync(async () => {
        const job = await findJobByEstimateId(env, approvedEstimate.id);

        return job?.estimate_id === approvedEstimate.id ? job : null;
      }, "estimate-linked draft job persistence retry", 30000).catch(() => null);
    }
  }

  if (!linkedJob) {
    throw new Error("Timed out waiting for estimate-linked draft job persistence.");
  }

  if (linkedJob.status !== "draft") {
    throw new Error(`Converted job status was ${linkedJob.status}, expected draft.`);
  }

  if (linkedJob.scheduled_start !== null || linkedJob.scheduled_end !== null) {
    throw new Error("Converted draft job unexpectedly received a schedule.");
  }

  const linkedJobCount = await countJobsByEstimateId(env, approvedEstimate.id);

  if (linkedJobCount !== 1) {
    throw new Error(`Estimate handoff created ${linkedJobCount} linked jobs, expected 1.`);
  }

  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="estimate-approval-workspace"]');
      const convertButton = document.querySelector('[data-testid="estimate-convert-job-button"]');

      return Boolean(
        workspace?.textContent?.includes("Job linked") &&
          workspace?.textContent?.includes("Handoff readiness") &&
          convertButton?.disabled === true,
      );
    },
    "linked job handoff UI state",
    15000,
  );

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText;

      return (
        text.includes("Dashboard") &&
        text.includes("Leads") &&
        text.includes("Estimates") &&
        !text.includes("Customer signature requested for the estimate packet.") &&
        !text.includes("This estimate packet already has an active signature request.")
      );
    },
    "signature toast remains cleared after refresh",
    45000,
  );

  return {
    estimateId: approvedEstimate.id,
    estimateTitle,
    status: approvedEstimate.status,
    lineItemCount,
    total: approvedEstimate.total,
    linkedJobId: linkedJob.id,
    linkedJobStatus: linkedJob.status,
  };
}

async function testQuickActionsDoNotOverlap(browser, tab) {
  const viewport = await browser.capabilities.get("viewport");
  await viewport.set(LAPTOP_VIEWPORT);
  await clickNav(tab, "Dashboard");
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");

  const overlaps = await tab.playwright.evaluate(() => {
    const quickActionLabels = [
      "Create Lead",
      "Create Estimate",
      "Schedule Inspection",
      "Schedule Job",
      "Create Work Order",
      "Upload Roof Photos",
      "Customer Search",
      "Open Calendar",
    ];
    const matchesQuickAction = (text) =>
      quickActionLabels.some((label) =>
        text.toLowerCase().includes(label.toLowerCase()),
      );
    const buttons = [...document.querySelectorAll("main button")]
      .filter((button) => !button.closest("nav"))
      .filter((button) => matchesQuickAction(button.innerText))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const label =
          quickActionLabels.find((candidate) =>
            button.innerText.toLowerCase().includes(candidate.toLowerCase()),
          ) ?? button.innerText.trim();
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
  const commandCenterOverlaps = await tab.playwright.evaluate(() => {
    const quickActionLabels = [
      "Create Lead",
      "Create Estimate",
      "Schedule Inspection",
      "Schedule Job",
      "Create Work Order",
      "Upload Roof Photos",
      "Customer Search",
      "Open Calendar",
    ];
    const matchesQuickAction = (text) =>
      quickActionLabels.some((label) =>
        text.toLowerCase().includes(label.toLowerCase()),
      );
    const buttons = [...document.querySelectorAll('[data-testid="crm-operations-dashboard"] button')]
      .filter((button) => matchesQuickAction(button.innerText))
      .map((button) => {
        const rect = button.getBoundingClientRect();
        const label =
          quickActionLabels.find((candidate) =>
            button.innerText.toLowerCase().includes(candidate.toLowerCase()),
          ) ?? button.innerText.trim();

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

  if (overlaps.checked < 8) {
    throw new Error(`Expected 8 dashboard quick-action buttons, checked ${overlaps.checked}.`);
  }

  if (overlaps.collisions.length) {
    throw new Error(`Found ${overlaps.collisions.length} overlapping quick-action button pairs.`);
  }

  if (commandCenterOverlaps.checked < 8) {
    throw new Error(`Expected 8 CRM operations quick-action buttons, checked ${commandCenterOverlaps.checked}.`);
  }

  if (commandCenterOverlaps.collisions.length) {
    throw new Error(`Found ${commandCenterOverlaps.collisions.length} overlapping CRM operations quick-action button pairs.`);
  }

  await viewport.set({ width: 390, height: 844 });
  await tab.playwright.waitForTimeout(500);
  const mobileLayout = await tab.playwright.evaluate(() => {
    const commandCenter = document.querySelector('[data-testid="crm-operations-dashboard"]');
    commandCenter?.scrollIntoView({ block: "start", behavior: "auto" });
    const commandBar = commandCenter?.querySelector(".wt-dashboard-command");
    const urgentPanel = commandCenter?.querySelector(".wt-dashboard-panel-urgent");
    const schedulePanel = commandCenter?.querySelector(".wt-dashboard-panel-schedule");
    const quickActionsPanel = commandCenter?.querySelector(".wt-dashboard-panel-actions");
    const commandRect = commandBar?.getBoundingClientRect() ?? null;
    const urgentRect = urgentPanel?.getBoundingClientRect() ?? null;
    const todayRect = schedulePanel?.getBoundingClientRect() ?? null;
    const quickActionsRect = quickActionsPanel?.getBoundingClientRect() ?? null;

    return {
      visible: Boolean(commandCenter),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      commandBeforeUrgent:
        Boolean(commandRect && urgentRect) && commandRect.top <= urgentRect.top,
      urgentBeforeToday:
        Boolean(urgentRect && todayRect) && urgentRect.top <= todayRect.top,
      todayBeforeQuickActions:
        Boolean(todayRect && quickActionsRect) && todayRect.top <= quickActionsRect.top,
    };
  });

  if (!mobileLayout.visible) {
    throw new Error("CRM operations dashboard is not visible on mobile viewport.");
  }

  if (mobileLayout.hasHorizontalOverflow) {
    throw new Error(`Dashboard mobile layout overflows horizontally: ${mobileLayout.scrollWidth} > ${mobileLayout.viewportWidth}.`);
  }

  if (!mobileLayout.commandBeforeUrgent) {
    throw new Error("Dashboard command bar does not appear before urgent attention on mobile.");
  }

  if (!mobileLayout.urgentBeforeToday) {
    throw new Error("Urgent attention does not appear before Today's Schedule on mobile.");
  }

  if (!mobileLayout.todayBeforeQuickActions) {
    throw new Error("Dashboard quick actions appear before the primary schedule area on mobile.");
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
        text.includes("oauth ready") &&
        text.includes("connect gmail oauth later before enabling live send or mailbox sync") &&
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
        text.includes("0022_gohighlevel_sync_foundation.sql") &&
        text.includes("website lead capture") &&
        text.includes("secure form-intake foundation") &&
        text.includes("/api/leads/website") &&
        text.includes("?dryrun=1") &&
        text.includes("source registry ready") &&
        text.includes("verification required") &&
        text.includes("production disabled") &&
        text.includes("supported form types") &&
        text.includes("allowed origins") &&
        text.includes("website_intake_enabled") &&
        text.includes("roof_inspection_request") &&
        text.includes("painting_estimate_request") &&
        text.includes("weathertech-phoenix") &&
        text.includes("weathertech-tucson") &&
        text.includes("ihc") &&
        text.includes("yelp lead integration") &&
        text.includes("secure yelp intake foundation") &&
        text.includes("/api/leads/yelp") &&
        text.includes("account registry ready") &&
        text.includes("partner access required") &&
        text.includes("manual intake ready") &&
        text.includes("live sync disabled") &&
        text.includes("weathertech-phoenix") &&
        text.includes("weathertech-tucson") &&
        text.includes("private yelp business ids") &&
        text.includes("oauth credentials stay server-side") &&
        text.includes("google business profile") &&
        text.includes("multi-location local-search foundation") &&
        text.includes("/api/leads/google-business-profile") &&
        text.includes("oauth required") &&
        text.includes("ready for testing") &&
        text.includes("production disabled") &&
        text.includes("pub/sub") &&
        text.includes("google chat, request-a-quote, and q&a intake are") &&
        text.includes("weathertech roofing llc - phoenix gbp") &&
        text.includes("weathertech roofing llc - tucson gbp") &&
        text.includes("ihc painting gbp") &&
        text.includes("quickbooks online") &&
        text.includes("accounting integration foundation") &&
        text.includes("invoice creation in quickbooks") &&
        text.includes("payment processing are disabled") &&
        text.includes("com.intuit.quickbooks.accounting") &&
        text.includes("/api/integrations/quickbooks-online/oauth/callback") &&
        text.includes("realm id env var quickbooks_realm_id_weathertech") &&
        text.includes("realm id env var quickbooks_realm_id_ihc") &&
        text.includes("official capability boundary") &&
        text.includes("payment processing") &&
        text.includes("electronic signatures") &&
        text.includes("docusign and dropbox sign provider foundation") &&
        text.includes("native signature capture remains the only active signature workflow") &&
        text.includes("/api/integrations/docusign/oauth/callback") &&
        text.includes("/api/integrations/dropbox-sign/oauth/callback") &&
        text.includes("signature, impersonation") &&
        text.includes("request_signature, basic_account_info") &&
        text.includes("docusign_account_id_weathertech") &&
        text.includes("dropbox_sign_account_id_ihc") &&
        text.includes("live docusign and dropbox sign requests are disabled") &&
        [
          "twilio",
          "gmail",
          "google calendar",
          "google business profile",
          "quickbooks online",
          "docusign",
          "dropbox sign",
          "yelp",
          "website lead capture",
          "gohighlevel",
        ].every((provider) => text.includes(provider)) &&
        [
          "accounting",
          "sms",
          "calling",
          "email",
          "calendar",
          "reviews",
          "website leads",
          "crm sync",
          "photos",
          "documents",
          "signatures",
          "payments",
          "ai",
          "webhooks",
        ].every((capability) => text.includes(capability)) &&
        Boolean(section?.querySelector('[data-testid="quickbooks-online-foundation"]')) &&
        Boolean(section?.querySelector('[data-testid="electronic-signatures-foundation"]')) &&
        cards.length >= 11
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

async function testProductionReadinessCenter(browser, tab, baseUrl) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Readiness");
  await waitFor(
    tab,
    () => {
      const section = document.querySelector('[data-testid="production-readiness-center"]');
      const text = section?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("production readiness center") &&
        text.includes("safe deployment and staged activation") &&
        text.includes("overall readiness") &&
        text.includes("environment status") &&
        text.includes("required migrations") &&
        text.includes("provider blockers") &&
        text.includes("last validation") &&
        text.includes("last regression") &&
        text.includes("last migration") &&
        text.includes("private staging deployment") &&
        text.includes("health checks and safe deployment metadata") &&
        text.includes("/api/health") &&
        text.includes("/api/readiness") &&
        text.includes("provider writes") &&
        text.includes("production activation") &&
        text.includes("0031_electronic_signatures_foundation.sql") &&
        text.includes("remaining blockers") &&
        text.includes("do not deploy or activate") &&
        text.includes("guided activation sequence") &&
        text.includes("launch-control order") &&
        text.includes("repository and release checkpoint") &&
        text.includes("supabase production migration validation") &&
        text.includes("vercel or approved production deployment") &&
        text.includes("custom production url") &&
        text.includes("controlled internal pilot") &&
        text.includes("final production-use approval") &&
        text.includes("launch gates") &&
        text.includes("no gate passes without evidence") &&
        text.includes("deployment-ready") &&
        text.includes("ready for provider setup") &&
        text.includes("ready for internal pilot") &&
        text.includes("pending owner setup") &&
        text.includes("provider activation cards") &&
        text.includes("guided setup without fake connectivity") &&
        text.includes("supabase") &&
        text.includes("vercel or approved deployment provider") &&
        text.includes("pending migration inventory") &&
        text.includes("repository migrations require production verification") &&
        text.includes("remote status unknown") &&
        text.includes("0027_gmail_workspace_email_foundation.sql") &&
        text.includes("0028_google_calendar_scheduling_foundation.sql") &&
        text.includes("0029_google_business_profile_foundation.sql") &&
        text.includes("0030_quickbooks_online_foundation.sql") &&
        text.includes("environment readiness inventory") &&
        text.includes("server-side validation, redacted by design") &&
        text.includes("twilio_outbound_sms_enabled") &&
        text.includes("wtos_deployment_env") &&
        text.includes("wtos_staging_url") &&
        text.includes("wtos_production_approved") &&
        text.includes("wtos_customer_portal_enabled") &&
        text.includes("google_gmail_send_enabled") &&
        text.includes("quickbooks_accounting_writes_enabled") &&
        text.includes("three-company mapping guidance") &&
        text.includes("unknown mappings stay blocked") &&
        text.includes("weathertech roofing llc - phoenix") &&
        text.includes("weathertech roofing llc - tucson") &&
        text.includes("ihc") &&
        text.includes("controlled-test plans") &&
        text.includes("test before moving to the next provider") &&
        text.includes("evidence must not store credentials") &&
        text.includes("production activation guides") &&
        text.includes("unified production checklist") &&
        text.includes("deployment readiness checks") &&
        text.includes("database and supabase") &&
        text.includes("authentication") &&
        text.includes("security") &&
        text.includes("monitoring") &&
        text.includes("backups") &&
        text.includes("browser regression status") &&
        text.includes("missing server credentials are not inspected in browser code") &&
        text.includes("no live activation") &&
        [
          "twilio",
          "gmail / google workspace",
          "google calendar",
          "google business profile",
          "yelp",
          "website",
          "quickbooks online",
          "electronic signatures",
        ].every((provider) => text.includes(provider)) &&
        [
          "crm",
          "customer 360",
          "dashboard",
          "office operations",
          "dispatch",
          "inspections",
          "jobs",
          "documents",
          "customer portal",
          "financial workspace",
        ].every((subsystem) => text.includes(subsystem))
      );
    },
    "production readiness center",
    15000,
  );

  const healthResponse = await fetch(new URL("/api/health", baseUrl), { cache: "no-store" });
  const health = await healthResponse.json();
  const readinessResponse = await fetch(new URL("/api/readiness", baseUrl), {
    cache: "no-store",
  });
  const readiness = await readinessResponse.json();
  const serializedEndpoints = JSON.stringify({ health, readiness }).toLowerCase();
  const endpointResult = {
    healthStatus: healthResponse.status,
    readinessStatus: readinessResponse.status,
    healthService: health?.service,
    readinessService: readiness?.service,
    readinessState: readiness?.status,
    exposesSecrets:
      serializedEndpoints.includes("service_role") ||
      serializedEndpoints.includes("auth_token") ||
      serializedEndpoints.includes("client_secret"),
  };

  if (endpointResult.healthStatus !== 200 || endpointResult.healthService !== "WeatherTech OS") {
    throw new Error(
      `Production health endpoint failed: ${JSON.stringify(endpointResult)}`,
    );
  }

  if (
    ![200, 503].includes(endpointResult.readinessStatus) ||
    endpointResult.readinessService !== "WeatherTech OS" ||
    !["ready", "blocked", "warning"].includes(endpointResult.readinessState)
  ) {
    throw new Error(
      `Production readiness endpoint returned an invalid response: ${JSON.stringify(endpointResult)}`,
    );
  }

  if (endpointResult.exposesSecrets) {
    throw new Error("Production readiness endpoints expose secret-shaped values.");
  }

  const desktopOverflow = await tab.playwright.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 8,
  );
  if (desktopOverflow) {
    throw new Error("Production Readiness Center has horizontal overflow on desktop.");
  }

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await waitFor(
    tab,
    () => Boolean(document.querySelector('[data-testid="production-readiness-center"]')),
    "production readiness center mobile render",
    10000,
  );
  const mobileOverflow = await tab.playwright.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 8,
  );
  await viewport.set(LAPTOP_VIEWPORT);

  if (mobileOverflow) {
    throw new Error("Production Readiness Center has horizontal overflow on mobile.");
  }

  await clickUnique(
    tab.playwright.getByRole("button", { name: "Open Integration Center" }),
    "open integration center from production readiness",
  );
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();
      return (
        text.includes("integration hub") &&
        text.includes("real-world service connections") &&
        text.includes("google calendar") &&
        text.includes("gmail / google workspace email foundation") &&
        text.includes("twilio") &&
        text.includes("gohighlevel live synchronization foundation")
      );
    },
    "production readiness routes to integration center",
    10000,
  );

  await clickNav(tab, "Readiness");
  await clickUnique(
    tab.playwright.getByRole("button", { name: "Open Settings" }),
    "open settings from production readiness",
  );
  await waitFor(
    tab,
    () => document.body.innerText.toLowerCase().includes("settings"),
    "production readiness routes to settings",
    10000,
  );

  return { desktopOverflow, mobileOverflow };
}

async function testWebsiteMarketingFoundation(browser, tab) {
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Website & Marketing");
  await waitFor(
    tab,
    () => {
      const workspace = document.querySelector('[data-testid="website-marketing-foundation"]');
      const text = workspace?.textContent?.toLowerCase() ?? "";

      return (
        text.includes("marketing integration foundation") &&
        text.includes("read-only operating view") &&
        text.includes("website, google business profile, yelp, and gohighlevel intake") &&
        text.includes("no live provider activation") &&
        text.includes("weathertech roofing llc - phoenix") &&
        text.includes("weathertech roofing llc - tucson") &&
        text.includes("ihc painting") &&
        text.includes("website lead capture") &&
        text.includes("secure form-intake foundation") &&
        text.includes("google business profile") &&
        text.includes("multi-location local-search foundation") &&
        text.includes("yelp lead integration") &&
        text.includes("secure yelp intake foundation") &&
        text.includes("marketing providers are architecture-ready, not live-connected") &&
        text.includes("open lead intake") &&
        text.includes("review crm leads") &&
        text.includes("provider setup") &&
        text.includes("source settings")
      );
    },
    "website marketing foundation",
    15000,
  );

  const desktopState = await tab.playwright.evaluate(() => {
    const workspace = document.querySelector('[data-testid="website-marketing-foundation"]');

    return {
      visible: Boolean(workspace),
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8,
      providerCards: workspace?.querySelectorAll("article").length ?? 0,
      actionButtons: [...(workspace?.querySelectorAll("button") ?? [])]
        .filter((button) =>
          ["Open lead intake", "Review CRM leads", "Provider setup", "Source settings"]
            .includes(button.textContent?.trim() ?? ""),
        ).length,
      statesLiveConnectivityHonestly:
        workspace?.textContent?.toLowerCase().includes("does not connect providers") ?? false,
    };
  });

  if (!desktopState.visible) {
    throw new Error("Website & Marketing foundation workspace is not visible.");
  }

  if (desktopState.hasHorizontalOverflow) {
    throw new Error("Website & Marketing desktop layout overflows horizontally.");
  }

  if (desktopState.providerCards < 3 || desktopState.actionButtons < 4) {
    throw new Error(
      `Website & Marketing rendered ${desktopState.providerCards} provider cards and ${desktopState.actionButtons} actions.`,
    );
  }

  if (!desktopState.statesLiveConnectivityHonestly) {
    throw new Error("Website & Marketing page does not clearly state live provider connectivity is disabled.");
  }

  await clickCompanyScope(tab, "IHC Painting");
  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="website-marketing-foundation"]')?.textContent ?? "";
      return text.includes("IHC Painting");
    },
    "website marketing IHC scope",
    10000,
  );
  await clickCompanyScope(tab, "WeatherTech Roofing LLC");
  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="website-marketing-foundation"]')?.textContent ?? "";
      return text.includes("WeatherTech Roofing LLC");
    },
    "website marketing WeatherTech scope",
    10000,
  );
  await clickCompanyScope(tab, "All companies");

  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="website-marketing-foundation"]//button[contains(normalize-space(.), "Provider setup")]',
    ),
    "marketing provider setup quick action",
  );
  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();
      return (
        text.includes("integration hub") &&
        text.includes("real-world service connections") &&
        text.includes("production scheduling foundation") &&
        text.includes("weathertech os remains") &&
        text.includes("live writes disabled") &&
        text.includes("connected calendars") &&
        text.includes("event payload preview") &&
        text.includes("prepare connection") &&
        text.includes("connect calendar") &&
        text.includes("gmail / google workspace email foundation") &&
        text.includes("production google workspace foundation") &&
        text.includes("server-side oauth") &&
        text.includes("live send disabled") &&
        text.includes("/api/integrations/google-workspace/oauth/callback") &&
        text.includes("check readiness") &&
        text.includes("connect with google") &&
        text.includes("gmail activity")
      );
    },
    "marketing provider setup navigation",
    10000,
  );
  const calendarFoundationState = await tab.playwright.evaluate(() => {
    const section = document.querySelector('[data-testid="google-calendar-scheduling-foundation"]');
    const text = section?.textContent?.toLowerCase() ?? "";

    return {
      visible: Boolean(section),
      statesWriteDisabled: text.includes("live writes disabled"),
      hasFakeSyncedAction: text.includes("mark synced"),
      hasPayloadPreview: text.includes("event payload preview"),
    };
  });

  if (!calendarFoundationState.visible) {
    throw new Error("Google Calendar scheduling foundation panel is not visible.");
  }

  if (!calendarFoundationState.statesWriteDisabled) {
    throw new Error("Google Calendar foundation does not state live writes are disabled.");
  }

  if (calendarFoundationState.hasFakeSyncedAction) {
    throw new Error("Google Calendar foundation still exposes fake Mark synced action.");
  }

  if (!calendarFoundationState.hasPayloadPreview) {
    throw new Error("Google Calendar foundation no longer shows the event payload preview.");
  }

  await clickNav(tab, "Website & Marketing");
  await clickUnique(
    tab.playwright.locator(
      'xpath=//*[@data-testid="website-marketing-foundation"]//button[contains(normalize-space(.), "Open lead intake")]',
    ),
    "marketing lead intake quick action",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Unified Communications Center"),
    "marketing lead intake navigation",
    10000,
  );

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await clickNav(tab, "Website & Marketing");
  const mobileState = await tab.playwright.evaluate(() => {
    const workspace = document.querySelector('[data-testid="website-marketing-foundation"]');

    return {
      visible: Boolean(workspace),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 8,
      hasFoundationPanels:
        (workspace?.textContent?.includes("Website Lead Capture") ?? false) &&
        (workspace?.textContent?.includes("Yelp Lead Integration") ?? false),
    };
  });
  await viewport.set(LAPTOP_VIEWPORT);

  if (!mobileState.visible || !mobileState.hasFoundationPanels) {
    throw new Error("Website & Marketing mobile layout did not render the foundation panels.");
  }

  if (mobileState.hasHorizontalOverflow) {
    throw new Error(
      `Website & Marketing mobile layout overflows horizontally: ${mobileState.scrollWidth}px > ${mobileState.viewportWidth}px.`,
    );
  }

  return { desktopState, mobileState };
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

async function seedCustomerPortalRecords(env, company, runId) {
  const portalRunId = `${runId} PORTAL`;
  const documentStorageWorkflowReady = await detectDocumentStorageWorkflowSupport(env);
  const customer = await seedTestCustomer(
    env,
    company.id,
    portalRunId,
    "PORTAL CUSTOMER",
    `321 TEST ${portalRunId} Portal Way, Phoenix, AZ`,
  );
  const otherCustomer = await seedTestCustomer(
    env,
    company.id,
    `${portalRunId} OTHER`,
    "OTHER PORTAL CUSTOMER",
    `654 TEST ${portalRunId} Other Way, Phoenix, AZ`,
  );
  const job = await seedTestJob(env, company.id, portalRunId);
  const otherJob = await seedTestJob(env, company.id, `${portalRunId} OTHER`);
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  await restRequest(env, `jobs?id=eq.${encodeURIComponent(job.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      customer_id: customer.id,
      status: "scheduled",
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      start_date: start.toISOString().slice(0, 10),
      end_date: start.toISOString().slice(0, 10),
      project_manager: `${TEST_PREFIX} ${portalRunId} PM`,
      address: customer.property_address,
      property_address: customer.property_address,
    }),
  });
  await restRequest(env, `jobs?id=eq.${encodeURIComponent(otherJob.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      customer_id: otherCustomer.id,
      address: otherCustomer.property_address,
      property_address: otherCustomer.property_address,
    }),
  });

  const [scheduleEvent] = await restRequest(env, "schedule_events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      job_id: job.id,
      title: `${TEST_PREFIX} ${portalRunId} PORTAL PRODUCTION VISIT`,
      event_type: "job",
      status: "scheduled",
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      location: customer.property_address,
      notes: `${TEST_PREFIX} ${portalRunId} portal schedule note`,
    }),
  });
  const documentRecord = await seedTestDocument(
    env,
    company.id,
    customer.id,
    job.id,
    portalRunId,
    documentStorageWorkflowReady,
  );
  const warrantyDocumentPayload = {
    company_id: company.id,
    customer_id: customer.id,
    job_id: job.id,
    title: `${TEST_PREFIX} ${portalRunId} WORKMANSHIP WARRANTY`,
    category: "warranty",
    status: "ready",
    file_url: "https://example.invalid/weathertech-os-portal-warranty.pdf",
    body: `${TEST_PREFIX} ${portalRunId} customer-visible warranty document.`,
  };

  if (documentStorageWorkflowReady) {
    Object.assign(warrantyDocumentPayload, {
      file_name: `${portalRunId.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-warranty.pdf`,
      file_size_bytes: 98304,
      uploaded_at: new Date().toISOString(),
      property_address: customer.property_address,
      tags: ["Warranty", "Portal"],
      requirement_level: "required",
      required_for: ["job_completion"],
    });
  }

  const [warrantyDocument] = await restRequest(env, "documents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(warrantyDocumentPayload),
  });
  const [otherDocument] = await restRequest(env, "documents", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: otherCustomer.id,
      job_id: otherJob.id,
      title: `${TEST_PREFIX} ${portalRunId} OTHER CUSTOMER PRIVATE DOCUMENT`,
      category: "contract",
      status: "ready",
      file_url: "https://example.invalid/weathertech-os-other-document.pdf",
      body: `${TEST_PREFIX} ${portalRunId} other customer document should stay hidden.`,
    }),
  });
  const [invoice] = await restRequest(env, "invoices", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      job_id: job.id,
      invoice_number: `INV-PORTAL-${runId}`,
      title: `${TEST_PREFIX} ${portalRunId} PORTAL INVOICE`,
      status: "sent",
      issue_date: start.toISOString().slice(0, 10),
      due_date: end.toISOString().slice(0, 10),
      subtotal: 2400,
      tax_rate: 0,
      tax_total: 0,
      discount_total: 0,
      total: 2400,
      amount_paid: 400,
      balance_due: 2000,
      notes: `${TEST_PREFIX} ${portalRunId} portal invoice note`,
    }),
  });
  const [payment] = await restRequest(env, "payments", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      invoice_id: invoice.id,
      amount: 400,
      method: "Check",
      status: "posted",
      paid_at: start.toISOString(),
      reference: `${TEST_PREFIX} ${portalRunId} PAYMENT`,
      notes: `${TEST_PREFIX} ${portalRunId} portal payment history`,
    }),
  });
  const [visiblePhoto] = await restRequest(env, "job_photos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      job_id: job.id,
      caption: `${TEST_PREFIX} ${portalRunId} CUSTOMER VISIBLE BEFORE PHOTO`,
      label: "Before",
      file_path: `regression/${portalRunId}/before.jpg`,
      file_url: "https://example.invalid/weathertech-os-portal-before.jpg",
      taken_at: start.toISOString(),
      is_customer_visible: true,
      sort_order: 0,
    }),
  });
  const [internalPhoto] = await restRequest(env, "job_photos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      job_id: job.id,
      caption: `${TEST_PREFIX} ${portalRunId} INTERNAL ONLY ROOF PHOTO`,
      label: "Inspection",
      file_path: `regression/${portalRunId}/internal.jpg`,
      file_url: "https://example.invalid/weathertech-os-portal-internal.jpg",
      taken_at: start.toISOString(),
      is_customer_visible: false,
      sort_order: 1,
    }),
  });
  const [otherPhoto] = await restRequest(env, "job_photos", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: otherCustomer.id,
      job_id: otherJob.id,
      caption: `${TEST_PREFIX} ${portalRunId} OTHER CUSTOMER PHOTO`,
      label: "After",
      file_path: `regression/${portalRunId}/other.jpg`,
      file_url: "https://example.invalid/weathertech-os-portal-other.jpg",
      taken_at: start.toISOString(),
      is_customer_visible: true,
      sort_order: 0,
    }),
  });
  const [emailMessage] = await restRequest(env, "email_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company_id: company.id,
      customer_id: customer.id,
      provider: "gmail",
      category: "job_update",
      status: "queued",
      to_email: customer.email,
      subject: `${TEST_PREFIX} ${portalRunId} PORTAL EMAIL UPDATE`,
      body: `${TEST_PREFIX} ${portalRunId} customer portal communication.`,
      queued_at: start.toISOString(),
    }),
  });

  return {
    customer,
    otherCustomer,
    job,
    otherJob,
    scheduleEvent,
    documentRecord,
    warrantyDocument,
    otherDocument,
    invoice,
    payment,
    visiblePhoto,
    internalPhoto,
    otherPhoto,
    emailMessage,
  };
}

async function testCustomerPortalWorkspace(browser, tab, env, company, runId, progress) {
  progress("customer-portal:seed:start");
  const seeded = await seedCustomerPortalRecords(env, company, runId);
  progress("customer-portal:seed:done");

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Customer Portal");
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-portal-customer-select"]'),
    seeded.customer.id,
    "customer portal selected customer",
  );

  await waitFor(
    tab,
    ({ customerName, jobTitle, privateDocumentTitle }) => {
      const text = document.body.innerText.toLowerCase();

      return (
        Boolean(document.querySelector('[data-testid="customer-portal-workspace"]')) &&
        text.includes("customer portal preview") &&
        text.includes(customerName.toLowerCase()) &&
        text.includes(jobTitle.toLowerCase()) &&
        !text.includes(privateDocumentTitle.toLowerCase())
      );
    },
    "customer portal home loads selected customer only",
    15000,
    {
      customerName: seeded.customer.display_name,
      jobTitle: seeded.job.title,
      privateDocumentTitle: seeded.otherDocument.title,
    },
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-project"]'),
    "customer portal project tab",
  );
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="customer-portal-project"]')) &&
      document.body.innerText.includes("Lead") &&
      document.body.innerText.includes("Estimate") &&
      document.body.innerText.includes("Production"),
    "customer portal project timeline",
    10000,
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-documents"]'),
    "customer portal documents tab",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="customer-portal-document-search"]'),
    "DOCUMENT CENTER PACKET",
    "customer portal document search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-portal-document-filter"]'),
    "estimate",
    "customer portal document category filter",
  );
  await waitFor(
    tab,
    ({ visibleTitle, hiddenTitle }) => {
      const text = document.body.innerText;

      return text.includes(visibleTitle) && !text.includes(hiddenTitle);
    },
    "customer portal document isolation",
    10000,
    {
      visibleTitle: seeded.documentRecord.title,
      hiddenTitle: seeded.otherDocument.title,
    },
  );
  await clickUnique(
    tab.playwright
      .locator('[data-testid="customer-portal-document-card"]')
      .filter({ hasText: seeded.documentRecord.title })
      .getByRole("button", { name: "Preview" }),
    "customer portal document preview",
  );
  await waitFor(
    tab,
    () => Boolean(document.querySelector('[data-testid="customer-portal-document-preview"]')),
    "customer portal document preview visible",
    10000,
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-photos"]'),
    "customer portal photos tab",
  );
  await waitFor(
    tab,
    ({ visibleCaption, internalCaption, otherCaption }) => {
      const text = document.body.innerText;

      return (
        text.includes(visibleCaption) &&
        !text.includes(internalCaption) &&
        !text.includes(otherCaption)
      );
    },
    "customer portal photo visibility",
    10000,
    {
      visibleCaption: seeded.visiblePhoto.caption,
      internalCaption: seeded.internalPhoto.caption,
      otherCaption: seeded.otherPhoto.caption,
    },
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-messages"]'),
    "customer portal messages tab",
  );
  await waitFor(
    tab,
    ({ subject }) => document.body.innerText.includes(subject),
    "customer portal communication visible",
    10000,
    { subject: seeded.emailMessage.subject },
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="customer-portal-message-draft"]'),
    `${TEST_PREFIX} ${runId} PORTAL DRAFT ONLY`,
    "customer portal draft message",
  );
  await clickUnique(
    tab.playwright.getByRole("button", { name: "Save draft only" }),
    "customer portal save draft only",
  );
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="customer-portal-message-drafts"]')) &&
      document.body.innerText.includes("PORTAL DRAFT ONLY") &&
      document.body.innerText.includes("No message was sent."),
    "customer portal draft saved without sending",
    10000,
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-schedule"]'),
    "customer portal schedule tab",
  );
  await waitFor(
    tab,
    ({ scheduleTitle }) => document.body.innerText.includes(scheduleTitle),
    "customer portal schedule visible",
    10000,
    { scheduleTitle: seeded.scheduleEvent.title },
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-payments"]'),
    "customer portal payments tab",
  );
  await waitFor(
    tab,
    ({ invoiceNumber }) => {
      const text = document.body.innerText;

      return (
        Boolean(document.querySelector('[data-testid="customer-portal-payment-disconnected"]')) &&
        text.includes("Payment integration not connected") &&
        text.includes(invoiceNumber) &&
        !text.includes("Pay balance")
      );
    },
    "customer portal payments are read only",
    10000,
    { invoiceNumber: seeded.invoice.invoice_number },
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-warranty"]'),
    "customer portal warranty tab",
  );
  await waitFor(
    tab,
    ({ warrantyTitle }) => document.body.innerText.includes(warrantyTitle),
    "customer portal warranty visible",
    10000,
    { warrantyTitle: seeded.warrantyDocument.title },
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="customer-portal-tab-profile"]'),
    "customer portal profile tab",
  );
  await waitFor(
    tab,
    ({ address }) =>
      Boolean(document.querySelector('[data-testid="customer-portal-profile"]')) &&
      document.body.innerText.includes(address),
    "customer portal profile visible",
    10000,
    { address: seeded.customer.property_address },
  );

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Customer Portal");
  await selectUnique(
    tab.playwright.locator('[data-testid="customer-portal-customer-select"]'),
    seeded.customer.id,
    "customer portal mobile selected customer",
  );
  await waitFor(
    tab,
    () =>
      Boolean(document.querySelector('[data-testid="customer-portal-workspace"]')) &&
      document.documentElement.scrollWidth <= window.innerWidth + 8,
    "customer portal mobile layout has no horizontal overflow",
    10000,
  );
  await viewport.set(LAPTOP_VIEWPORT);
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, progress);

  return {
    customerId: seeded.customer.id,
    documentId: seeded.documentRecord.id,
    hiddenDocumentId: seeded.otherDocument.id,
    visiblePhotoId: seeded.visiblePhoto.id,
    hiddenInternalPhotoId: seeded.internalPhoto.id,
    paymentIntegration: "not_connected",
  };
}

async function testDocumentCenterWorkspace(browser, tab, env, company, testJob, runId) {
  const viewport = await browser.capabilities.get("viewport");
  const documentStorageWorkflowReady = await detectDocumentStorageWorkflowSupport(env);
  const customer = await seedTestCustomer(
    env,
    company.id,
    runId,
    "DOCUMENT CENTER CUSTOMER",
  );
  const documentRecord = await seedTestDocument(
    env,
    company.id,
    customer.id,
    testJob.id,
    runId,
    documentStorageWorkflowReady,
  );
  await seedTestSignature(env, company.id, customer.id, documentRecord.id, runId);
  const updatedTitle = `${TEST_PREFIX} ${runId} DOCUMENT CENTER RENAMED`;

  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await ensureAppShell(tab, BASE_URL, () => {});
  await clickCompanyScope(tab, "All companies");
  await clickNav(tab, "Documents");

  await waitFor(
    tab,
    () => {
      const text = document.body.innerText.toLowerCase();

      return (
        Boolean(document.querySelector('[data-testid="document-center-workspace"]')) &&
        text.includes("document center") &&
        text.includes("missing required documents") &&
        text.includes("recent documents") &&
        text.includes("stored files") &&
        text.includes("awaiting signatures") &&
        text.includes("upload or draft document")
      );
    },
    "Document Center workspace",
    20000,
  );

  await fillUnique(
    tab.playwright.locator('[data-testid="document-search"]'),
    documentRecord.title,
    "document center search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="document-company-filter"]'),
    company.id,
    "document company filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="document-customer-filter"]'),
    customer.id,
    "document customer filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="document-category-filter"]'),
    "proposal",
    "document category filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="document-relation-filter"]'),
    "customer",
    "document relation filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="document-status-filter"]'),
    "awaiting_signature",
    "document status filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="document-upload-date-filter"]'),
    "last_30",
    "document upload date filter",
  );

  await waitFor(
    tab,
    (title) => {
      const workspace = document.querySelector('[data-testid="document-center-workspace"]');
      const text = workspace?.textContent ?? "";

      return (
        text.includes(title) &&
        text.includes("Proposal") &&
        text.includes("Ready") &&
        text.includes("Linked file") &&
        text.toLowerCase().includes("awaiting signatures")
      );
    },
    "seeded document filtered row",
    15000,
    documentRecord.title,
  );

  const seededDocumentRow = tab.playwright.locator(
    `xpath=//*[@data-testid="document-library-row" and contains(normalize-space(.), ${xpathString(documentRecord.title)})]`,
  );
  const seededDocumentRowCount = await seededDocumentRow.count();
  if (seededDocumentRowCount !== 1) {
    const documentCenterState = await tab.playwright.evaluate((title) => {
      const workspace = document.querySelector('[data-testid="document-center-workspace"]');
      const rows = [...document.querySelectorAll('[data-testid="document-library-row"]')];

      return {
        title,
        rowCount: rows.length,
        matchingRows: rows
          .map((row) => row.textContent ?? "")
          .filter((text) => text.includes(title)),
        selectedFilters: Object.fromEntries(
          [...document.querySelectorAll('[data-testid^="document-"]')]
            .filter((element) => ["INPUT", "SELECT"].includes(element.tagName))
            .map((element) => [element.getAttribute("data-testid"), element.value]),
        ),
        workspaceText: workspace?.textContent?.slice(0, 1200) ?? "",
      };
    }, documentRecord.title);

    throw new Error(
      `seeded document row expected 1 match, found ${seededDocumentRowCount}. State: ${JSON.stringify(documentCenterState)}`,
    );
  }
  await seededDocumentRow.click({ timeoutMs: 8000 });

  await waitFor(
    tab,
    (title) => {
      const selectedPanel = document.querySelector('[data-testid="document-selected-panel"]');
      const selectedPanelText = selectedPanel?.textContent ?? "";
      const renameInput = selectedPanel?.querySelector('[aria-label="Rename document"]');

      return (
        renameInput?.value === title &&
        selectedPanelText.toLowerCase().includes("activity history") &&
        selectedPanelText.includes("Pending Signature") &&
        selectedPanelText.includes("Filename") &&
        selectedPanelText.includes("Size") &&
        (selectedPanelText.includes("Open") || selectedPanelText.includes("Download"))
      );
    },
    "selected document detail",
    15000,
    documentRecord.title,
  );

  await fillUnique(
    tab.playwright.locator('[aria-label="Rename document"]'),
    updatedTitle,
    "rename document title",
  );
  await clickVisibleDomSubmitByText(tab, "Save document changes", "Save document changes");
  await waitFor(
    tab,
    (title) =>
      document.body.innerText.includes("Document draft updated.") &&
      document.body.innerText.includes(title),
    "renamed document UI",
    15000,
    updatedTitle,
  );

  const renamedDocument = await waitForAsync(
    () => findDocumentByTitle(env, updatedTitle),
    "renamed document persistence",
    15000,
  );

  if (renamedDocument.status !== "ready") {
    throw new Error(`Renamed document status changed unexpectedly to ${renamedDocument.status}.`);
  }

  await clickVisibleDomButtonByText(tab, "Archive", "Archive document", 15000);
  const archivedDocument = await waitForAsync(
    async () => {
      const current = await findDocumentByTitle(env, updatedTitle);

      return current?.status === "archived" ? current : null;
    },
    "archived document persistence",
    30000,
  );
  await waitFor(
    tab,
    () => {
      const selectedPanel = document.querySelector('[data-testid="document-selected-panel"]');
      const selectedPanelText = selectedPanel?.textContent ?? "";

      return (
        document.body.innerText.includes("Document marked Archived.") ||
        selectedPanelText.includes("Archived")
      );
    },
    "archive document UI confirmation",
    15000,
  );

  await selectUnique(
    tab.playwright.locator('[data-testid="document-status-filter"]'),
    "archived",
    "document archived status filter",
  );
  await waitFor(
    tab,
    (title) => document.body.innerText.includes(title) && document.body.innerText.includes("Archived"),
    "archived document filtered row",
    15000,
    updatedTitle,
  );

  await viewport.set({ width: 390, height: 844 });
  await tab.playwright.waitForTimeout(500);
  const mobileLayout = await tab.playwright.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    workspaceVisible: Boolean(document.querySelector('[data-testid="document-center-workspace"]')),
  }));
  await viewport.set(LAPTOP_VIEWPORT);

  if (mobileLayout.scrollWidth > mobileLayout.clientWidth + 8) {
    throw new Error(
      `Document Center overflowed on mobile: ${mobileLayout.scrollWidth}px > ${mobileLayout.clientWidth}px.`,
    );
  }

  return {
    documentId: archivedDocument.id,
    customerId: customer.id,
    updatedTitle,
    mobileLayout,
  };
}

async function testDispatchWorkspace(browser, tab, env, company, testJob, runId, progress) {
  const migrationReady = await detectInspectionFoundationSupport(env);
  const dispatchStart = new Date();
  dispatchStart.setDate(dispatchStart.getDate() + 5);
  dispatchStart.setHours(8, 30, 0, 0);
  const dispatchEnd = new Date(dispatchStart.getTime() + 5 * 60 * 60 * 1000);
  const rescheduledStart = new Date(dispatchStart.getTime() + 24 * 60 * 60 * 1000);
  rescheduledStart.setHours(7, 45, 0, 0);
  const rescheduledEnd = new Date(rescheduledStart.getTime() + 4 * 60 * 60 * 1000);
  const dispatchStartInput = toDateTimeLocalValue(dispatchStart);
  const dispatchEndInput = toDateTimeLocalValue(dispatchEnd);
  const rescheduledStartInput = toDateTimeLocalValue(rescheduledStart);
  const rescheduledEndInput = toDateTimeLocalValue(rescheduledEnd);
  const crewName = `${TEST_PREFIX} ${runId} DISPATCH CREW`;
  const foremanName = `${TEST_PREFIX} ${runId} DISPATCH FOREMAN`;
  let inspection = null;

  if (migrationReady) {
    progress("dispatch:inspection-seed:start");
    const inspectionStart = new Date(dispatchStart.getTime() + 2 * 60 * 60 * 1000);
    const inspectionEnd = new Date(inspectionStart.getTime() + 60 * 60 * 1000);
    inspection = await seedDispatchInspection(
      env,
      company.id,
      testJob.id,
      runId,
      inspectionStart,
      inspectionEnd,
    );
    progress("dispatch:inspection-seed:done");
  }

  progress("dispatch:open:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await selectTestJob(tab, testJob.title);
  await tab.playwright.evaluate(() => {
    document.querySelector('[data-testid="dispatch-workspace"]')?.scrollIntoView({ block: "center" });
  });
  await waitFor(
    tab,
    () => {
      const text = document.querySelector('[data-testid="dispatch-workspace"]')?.textContent ?? "";

      return (
        text.includes("Dispatch and crew scheduling") &&
        text.includes("Day and week dispatch") &&
        text.includes("Save dispatch changes") &&
        text.includes("Dispatch warnings")
      );
    },
    "dispatch workspace",
    15000,
  );
  progress("dispatch:open:done");

  await selectUnique(
    tab.playwright.locator('[data-testid="dispatch-company-filter"]'),
    company.id,
    "dispatch company filter",
  );
  await moveDispatchDateTo(tab, dispatchStartInput.slice(0, 10));
  if (inspection) {
    await waitFor(
      tab,
      (title) => document.querySelector('[data-testid="dispatch-list"]')?.textContent?.includes(title),
      "dispatch linked inspection",
      15000,
      inspection.title,
    );
  }
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-search"]'),
    testJob.title,
    "dispatch search",
  );
  await waitFor(
    tab,
    (title) => document.querySelector('[data-testid="dispatch-list"]')?.textContent?.includes(title),
    "dispatch searched test job",
    15000,
    testJob.title,
  );

  progress("dispatch:save:start");
  await selectUnique(
    tab.playwright.locator('[data-testid="dispatch-job-select"]'),
    testJob.id,
    "dispatch job select",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-scheduled-start"]'),
    dispatchStartInput,
    "dispatch scheduled start",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-scheduled-end"]'),
    dispatchEndInput,
    "dispatch scheduled end",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-crew-name"]'),
    crewName,
    "dispatch crew",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-foreman-name"]'),
    foremanName,
    "dispatch foreman",
  );
  await withAcceptedConfirm(tab, () =>
    clickVisibleDomSubmitByText(tab, "Save dispatch changes", "Save dispatch changes"),
  );
  const dispatchedJob = await waitForAsync(
    async () => {
      const job = await findJobByTitle(env, testJob.title);

      return job?.crew_name === crewName &&
        job?.project_manager === foremanName &&
        job?.scheduled_start
        ? job
        : null;
    },
    "dispatch job persistence",
    15000,
  );
  const firstDispatchEvents = await waitForAsync(
    async () => {
      const events = await findJobScheduleEvents(env, testJob.id);
      return events.length === 1 ? events : null;
    },
    "one dispatch schedule event",
    15000,
  );
  await waitFor(
    tab,
    ({ crewName, foremanName, dispatchStartInput }) => {
      const workspace = document.querySelector('[data-testid="dispatch-workspace"]');
      const text = workspace?.textContent ?? "";

      return (
        text.includes(crewName) &&
        text.includes(foremanName) &&
        text.includes("Scheduled") &&
        !text.includes("Saving dispatch")
      );
    },
    "dispatch first save UI settled",
    15000,
    { crewName, foremanName, dispatchStartInput },
  );
  progress("dispatch:save:done");

  progress("dispatch:reschedule:start");
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-scheduled-start"]'),
    rescheduledStartInput,
    "dispatch rescheduled start",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-scheduled-end"]'),
    rescheduledEndInput,
    "dispatch rescheduled end",
  );
  await withAcceptedConfirm(tab, () =>
    clickVisibleDomSubmitByText(tab, "Save dispatch changes", "Save dispatch reschedule"),
  );
  let rescheduleObservation = null;
  let rescheduledEvents = null;

  try {
    rescheduledEvents = await waitForAsync(
      async () => {
        const events = await findJobScheduleEvents(env, testJob.id);
        const job = await findJobByTitle(env, testJob.title);
        rescheduleObservation = {
          eventCount: events.length,
          eventIds: events.map((event) => event.id),
          eventStarts: events.map((event) => event.start_at),
          eventEnds: events.map((event) => event.end_at),
          jobScheduledStart: job?.scheduled_start ?? null,
          jobScheduledEnd: job?.scheduled_end ?? null,
          expectedStart: new Date(rescheduledStartInput).toISOString(),
          expectedEnd: new Date(rescheduledEndInput).toISOString(),
        };

        return events.length === 1 &&
          events[0].id === firstDispatchEvents[0].id &&
          Date.parse(events[0].start_at) === Date.parse(rescheduledStartInput) &&
          Date.parse(job?.scheduled_start ?? "") === Date.parse(rescheduledStartInput)
          ? events
          : null;
      },
      "dispatch reschedule update without duplicate event",
      15000,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} Last observed: ${JSON.stringify(rescheduleObservation)}`);
  }
  progress("dispatch:reschedule:done");

  progress("dispatch:refresh:start");
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
  await selectTestJob(tab, testJob.title);
  await tab.playwright.evaluate(() => {
    document.querySelector('[data-testid="dispatch-workspace"]')?.scrollIntoView({ block: "center" });
  });
  await moveDispatchDateTo(tab, rescheduledStartInput.slice(0, 10));
  await fillUnique(
    tab.playwright.locator('[data-testid="dispatch-search"]'),
    testJob.title,
    "dispatch persisted search",
  );
  await waitFor(
    tab,
    ({ title, crewName, foremanName }) => {
      const text = document.querySelector('[data-testid="dispatch-workspace"]')?.textContent ?? "";

      return (
        text.includes(title) &&
        text.includes(crewName) &&
        text.includes(foremanName) &&
        text.includes("Dispatch warnings")
      );
    },
    "dispatch refresh persistence",
    15000,
    { title: testJob.title, crewName, foremanName },
  );
  progress("dispatch:refresh:done");

  const viewport = await browser.capabilities.get("viewport");
  await viewport.set({ width: 390, height: 844 });
  await tab.playwright.waitForTimeout(500);
  const mobileOverflow = await tab.playwright.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  await viewport.set(LAPTOP_VIEWPORT);

  if (mobileOverflow.scrollWidth > mobileOverflow.clientWidth + 8) {
    throw new Error(
      `Dispatch workspace overflowed on mobile: ${mobileOverflow.scrollWidth}px > ${mobileOverflow.clientWidth}px.`,
    );
  }

  return {
    migrationReady,
    inspectionVisible: Boolean(inspection),
    dispatchedJobId: dispatchedJob.id,
    scheduleEventId: rescheduledEvents[0].id,
    scheduleEventCount: rescheduledEvents.length,
    mobileOverflow,
  };
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
    "Update Job Status",
    "Start Job",
    "Open Customer 360",
    "Complete Inspection",
    "View Inspection",
    "Upload Photos",
    "Upload Documents",
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
  const productionBoardLabels = [
    "Production Board",
    "Visual production queues",
    "Unscheduled",
    "Scheduled",
    "In Production",
    "Waiting on Customer",
    "Waiting on Materials",
    "Inspection Required",
    "Final Walkthrough",
    "Completed",
    "Warranty",
    "No fake dispatch",
  ];
  const crewSchedulerLabels = [
    "Crew Scheduler",
    "Crew and foreman schedule foundation",
    "day",
    "week",
    "Open Calendar",
    "Schedule conflicts and setup alerts",
    "Equipment and vehicle readiness is not tracked",
  ];

  const productionWorkspace = await tab.playwright.evaluate(
    ({
      commandCenterLabels,
      roofingLabels,
      paintingLabels,
      quickActionLabels,
      timelineLabels,
      productionBoardLabels,
      crewSchedulerLabels,
    }) => {
      const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
      const textFor = (id) => byTestId(id)?.textContent ?? "";
      const panelIds = [
        "job-production-command-center",
        "field-production-mobile-workspace",
        "field-my-work",
        "field-production-checklist",
        "field-daily-progress",
        "field-materials-issues",
        "field-final-walkthrough-readiness",
        "crew-assignment-panel",
        "weathertech-roofing-production-cards",
        "ihc-painting-production-cards",
        "job-production-summary",
        "job-production-quick-actions",
        "job-production-timeline",
        "production-board",
        "crew-scheduler",
        "daily-production-log",
        "photo-progress-panel",
        "daily-workflow-handoff",
      ];

      return {
        missingPanels: panelIds.filter((id) => !byTestId(id)),
        missingWorkflowHandoffLabels: [
          "Job next action",
          "invoice, payment, and warranty handoff",
        ].filter((label) => !textFor("daily-workflow-handoff").includes(label)),
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
          "Weather delay",
        ].filter((label) => !textFor("job-production-summary").includes(label)),
        missingQuickActions: quickActionLabels.filter(
          (label) => !textFor("job-production-quick-actions").includes(label),
        ),
        missingFieldWorkspaceLabels: [
          "Field mobile workspace",
          "Field home / My work",
          "Job essentials",
          "Production checklist",
          "Daily progress",
          "Material readiness",
          "Photos and documents",
          "Issue or blocker",
          "Final walkthrough readiness",
          "Tear-off",
          "Underlayment",
          "Final roof walkthrough",
          "Open photo upload",
          "Open change orders",
        ].filter((label) => !textFor("field-production-mobile-workspace").includes(label)),
        missingTimelineLabels: timelineLabels.filter(
          (label) => !textFor("job-production-timeline").includes(label),
        ),
        missingProductionBoardLabels: productionBoardLabels.filter(
          (label) => !textFor("production-board").includes(label),
        ),
        missingCrewSchedulerLabels: crewSchedulerLabels.filter(
          (label) => !textFor("crew-scheduler").includes(label),
        ),
        missingProductionLogLabels: ["Daily production log", "Read-only activity"].filter(
          (label) => !textFor("daily-production-log").includes(label),
        ),
        missingPhotoProgressLabels: [
          "Photo progress",
          "Before",
          "During",
          "After",
          "Issue",
          "Completion",
          "Open Photos",
        ].filter((label) => !textFor("photo-progress-panel").includes(label)),
      };
    },
    {
      commandCenterLabels,
      roofingLabels,
      paintingLabels,
      quickActionLabels,
      timelineLabels,
      productionBoardLabels,
      crewSchedulerLabels,
    },
  );

  const missingProductionWorkspaceItems = Object.entries(productionWorkspace)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([key, value]) => `${key}: ${value.join(", ")}`);

  if (missingProductionWorkspaceItems.length) {
    throw new Error(
      `Job production workspace is missing expected items: ${missingProductionWorkspaceItems.join("; ")}`,
    );
  }

  await fillUnique(
    tab.playwright.locator('[data-testid="production-board-search"]'),
    testJob.title,
    "production board search",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-company-filter"]'),
    company.id,
    "production board company filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-location-filter"]'),
    "Phoenix",
    "production board Phoenix filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-location-filter"]'),
    "Tucson",
    "production board Tucson filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-location-filter"]'),
    "all",
    "production board all branch filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-crew-filter"]'),
    "unassigned",
    "production board unassigned crew filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-crew-filter"]'),
    "all",
    "production board all crew filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-foreman-filter"]'),
    "unassigned",
    "production board unassigned foreman filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-foreman-filter"]'),
    "all",
    "production board all foreman filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-material-filter"]'),
    "needs_attention",
    "production board material readiness filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-material-filter"]'),
    "not_recorded",
    "production board material not recorded filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-material-filter"]'),
    "all",
    "production board all material filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-inspection-filter"]'),
    "required",
    "production board inspection required filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-inspection-filter"]'),
    "not_recorded",
    "production board inspection not recorded filter",
  );
  await selectUnique(
    tab.playwright.locator('[data-testid="production-board-inspection-filter"]'),
    "all",
    "production board all inspection filter",
  );
  await tab.playwright.evaluate(() => {
    const clearButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Clear board filters",
    );
    clearButton?.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  });
  await tab.playwright.waitForTimeout(300);
  await clickUnique(
    tab.playwright.getByRole("button", { name: "Clear board filters" }),
    "Clear production board filters",
    { retryTransientClick: true },
  );
  await waitFor(
    tab,
    () => {
      const board = document.querySelector('[data-testid="production-board"]');

      return Boolean(board) && board.textContent?.includes("Unscheduled");
    },
    "production board after clearing filters",
  );

  await clickUnique(
    tab.playwright.locator('[data-testid="photo-progress-panel"] button'),
    "Open Photos from job production",
  );
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Photos") &&
      document.body.innerText.includes("Upload, search, and organize job"),
    "Photos opened from production progress",
    15000,
  );
  await selectTestJob(tab, testJob.title);

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
        const fieldWorkspace = document.querySelector('[data-testid="field-production-mobile-workspace"]');
        const productionBoard = document.querySelector('[data-testid="production-board"]');
        const crewScheduler = document.querySelector('[data-testid="crew-scheduler"]');

        return {
          commandCenterVisible: Boolean(commandCenter),
          quickActionsVisible: Boolean(quickActions),
          fieldWorkspaceVisible: Boolean(fieldWorkspace),
          productionBoardVisible: Boolean(productionBoard),
          crewSchedulerVisible: Boolean(crewScheduler),
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2,
          touchTargets: [
            ...(quickActions?.querySelectorAll("button") ?? []),
            ...(fieldWorkspace?.querySelectorAll("button") ?? []),
          ].map((button) => {
            const rect = button.getBoundingClientRect();

            return { width: rect.width, height: rect.height };
          }),
        };
      })),
    });
  }

  for (const check of responsiveChecks) {
    if (
      !check.commandCenterVisible ||
      !check.quickActionsVisible ||
      !check.fieldWorkspaceVisible ||
      !check.productionBoardVisible ||
      !check.crewSchedulerVisible
    ) {
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
  await scrollTextIntoView(tab, "Add finding");
  await clickVisibleDomSubmitByText(tab, "Add finding", "Add finding");
  await waitFor(
    tab,
    () => document.body.innerText.includes("TEST cracked tile observed by inspector."),
    "inspection finding rendered",
    15000,
  );
  await waitForNoSavingState(tab, "inspection finding save complete");
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
  await scrollTextIntoView(tab, "Add measurement");
  await clickVisibleDomSubmitByText(tab, "Add measurement", "Add measurement");
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
    30000,
  ).catch(async (error) => {
    const pageState = await tab.playwright.evaluate(() => {
      const text = document.body.innerText;
      const confirmation = document.querySelector(
        '[role="alertdialog"][aria-label="Restore inspection confirmation"]',
      );

      return {
        restoreConfirmationOpen: Boolean(confirmation),
        hasRestoreNotice: text.includes("Inspection restored."),
        hasRestoreError: text.includes("Unable to restore inspection"),
        recordManagementText:
          document.querySelector('[data-testid="inspection-record-management"]')
            ?.textContent ?? null,
      };
    });

    throw new Error(
      `${error instanceof Error ? error.message : String(error)} State: ${JSON.stringify(pageState)}`,
    );
  });
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
  const fieldTaskTitle = `${TEST_PREFIX} ${runId} FIELD TASK`;
  const noteText = `${TEST_PREFIX} ${runId} NOTE`;
  const progressText = `${TEST_PREFIX} ${runId} DAILY PROGRESS`;
  const issueText = `${TEST_PREFIX} ${runId} HIDDEN DAMAGE ISSUE`;
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
  await clickJobListItemByText(tab, testJob.title, `job card ${testJob.title}`);
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
  const selectedJobId = (await findJobByTitle(env, testJob.title))?.id ?? testJob.id;

  progress("job:field-workspace:start");
  await tab.playwright.evaluate(() => {
    document
      .querySelector('[data-testid="field-production-mobile-workspace"]')
      ?.scrollIntoView({ block: "center" });
  });
  const fieldWorkspace = await tab.playwright.evaluate((title) => {
    const text = document.querySelector('[data-testid="field-production-mobile-workspace"]')?.textContent ?? "";

    return {
      hasWorkspace: text.includes("Field mobile workspace"),
      hasJob: text.includes(title),
      hasCustomer: text.includes("TEST Regression"),
      hasAddress: text.includes("123 TEST Regression Way"),
      hasCompany: text.includes("WeatherTech Roofing LLC"),
      hasTrade: text.includes("Roofing"),
      hasStatus: text.includes("Draft") || text.includes("In progress"),
      hasRoofingTerms:
        text.includes("Tear-off") &&
        text.includes("Underlayment") &&
        text.includes("Final roof walkthrough"),
      hasPaintingTerms:
        text.includes("Masking") ||
        text.includes("Surface preparation") ||
        text.includes("Final paint walkthrough"),
      hasMaterialReadiness: text.includes("Material readiness"),
      hasChangeOrderHandoff: text.includes("Open change orders"),
      hasFinalWalkthrough: text.includes("Final walkthrough readiness"),
    };
  }, testJob.title);

  if (
    !fieldWorkspace.hasWorkspace ||
    !fieldWorkspace.hasJob ||
    !fieldWorkspace.hasCustomer ||
    !fieldWorkspace.hasAddress ||
    !fieldWorkspace.hasCompany ||
    !fieldWorkspace.hasTrade ||
    !fieldWorkspace.hasStatus ||
    !fieldWorkspace.hasRoofingTerms ||
    fieldWorkspace.hasPaintingTerms ||
    !fieldWorkspace.hasMaterialReadiness ||
    !fieldWorkspace.hasChangeOrderHandoff ||
    !fieldWorkspace.hasFinalWalkthrough
  ) {
    throw new Error(`Field production workspace did not render expected roofing-only job details: ${JSON.stringify(fieldWorkspace)}`);
  }

  const currentJobBeforeStart = await findJobByTitle(env, testJob.title);
  if (currentJobBeforeStart?.status !== "in_progress") {
    await withAcceptedConfirm(tab, async () => {
      await clickVisibleDomButtonByText(tab, "Start job", "field Start job", 15000);
    });
    await waitForAsync(
      async () => {
        const updatedJob = await findJobByTitle(env, testJob.title);

        return updatedJob?.status === "in_progress" ? updatedJob : null;
      },
      "field status transition persistence",
      15000,
    );
  }
  progress("job:field-workspace:done");

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

  progress("job:field-task:start");
  await tab.playwright.evaluate(() => {
    document
      .querySelector('[data-testid="field-production-checklist"]')
      ?.scrollIntoView({ block: "center" });
  });
  await fillUnique(
    tab.playwright.locator('[data-testid="field-add-task-form"] input[name="title"]'),
    fieldTaskTitle,
    "field task title",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-add-task-form"] textarea[name="description"]'),
    "Field regression task detail.",
    "field task description",
  );
  results.addFieldTask = await preventTopJumpAround(
    tab,
    async () => {
      await clickVisibleDomSubmitByText(tab, "Add field task", "Add field task");
      await waitForAsync(
        () => findJobTaskByTitle(env, selectedJobId, fieldTaskTitle),
        `field task persistence ${fieldTaskTitle}`,
        15000,
      );
      await waitFor(
        tab,
        (title) => document.body.innerText.includes(title),
        `field task ${fieldTaskTitle}`,
        10000,
        fieldTaskTitle,
      );
    },
    "adding field task",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-add-task-form"] input[name="title"]'),
    fieldTaskTitle,
    "duplicate field task title",
  );
  await clickVisibleDomSubmitByText(tab, "Add field task", "Duplicate field task");
  await waitFor(
    tab,
    () => document.body.innerText.includes("That checklist task already exists for this job."),
    "duplicate field task error",
    10000,
  );
  const duplicateFieldTasks = await findJobTasksByTitle(env, selectedJobId, fieldTaskTitle);

  if (duplicateFieldTasks.length !== 1) {
    throw new Error(`Expected one field task after duplicate prevention, found ${duplicateFieldTasks.length}.`);
  }
  progress("job:field-task:done");

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
          const task = await findJobTaskByTitle(env, selectedJobId, addedTaskTitle);

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
        () => findJobTaskByTitle(env, selectedJobId, editedTaskTitle),
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
  await scrollTextIntoView(tab, "Add note");
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

  progress("job:field-progress:start");
  await tab.playwright.evaluate(() => {
    document
      .querySelector('[data-testid="field-daily-progress-form"]')
      ?.scrollIntoView({ block: "center" });
  });
  await fillUnique(
    tab.playwright.locator('[data-testid="field-daily-progress-form"] textarea[name="work_completed"]'),
    progressText,
    "field daily progress work completed",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-daily-progress-form"] textarea[name="tomorrow_plan"]'),
    `${TEST_PREFIX} ${runId} WORK REMAINING`,
    "field daily progress work remaining",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-daily-progress-form"] textarea[name="blockers"]'),
    `${TEST_PREFIX} ${runId} CUSTOMER COMMUNICATION AND MATERIAL NOTE`,
    "field daily progress blockers",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-daily-progress-form"] input[name="weather_summary"]'),
    `${TEST_PREFIX} ${runId} WEATHER NOTE`,
    "field daily progress weather",
  );
  results.addDailyProgress = await preventTopJumpAround(
    tab,
    async () => {
      await clickVisibleDomSubmitByText(tab, "Save progress log", "Save progress log");
      await waitForAsync(
        () => findDailyLogByWorkCompleted(env, selectedJobId, progressText),
        `daily progress persistence ${progressText}`,
        15000,
      );
      await waitFor(
        tab,
        (text) => document.body.innerText.includes(text),
        `daily progress ${progressText}`,
        10000,
        progressText,
      );
    },
    "adding daily progress",
  );
  progress("job:field-progress:done");

  progress("job:field-issue:start");
  await tab.playwright.evaluate(() => {
    document
      .querySelector('[data-testid="field-issue-form"]')
      ?.scrollIntoView({ block: "center" });
  });
  await selectUnique(
    tab.playwright.locator('[data-testid="field-issue-form"] select[name="issue_type"]'),
    "Hidden damage",
    "field issue type",
  );
  await fillUnique(
    tab.playwright.locator('[data-testid="field-issue-form"] textarea[name="details"]'),
    issueText,
    "field issue details",
  );
  await checkUnique(
    tab.playwright.locator('[data-testid="field-issue-form"] input[name="change_order_needed"]'),
    "field issue change order checkbox",
  );
  results.addFieldIssue = await preventTopJumpAround(
    tab,
    async () => {
      await clickVisibleDomSubmitByText(tab, "Record issue", "Record issue");
      await waitForAsync(
        () => findJobNoteContaining(env, selectedJobId, issueText),
        `field issue note persistence ${issueText}`,
        15000,
      );
      await waitFor(
        tab,
        (text) => document.body.innerText.includes(text),
        `field issue ${issueText}`,
        10000,
        issueText,
      );
    },
    "recording field issue",
  );
  await clickUnique(
    tab.playwright.locator('[data-testid="field-issue-form"] button').filter({ hasText: "Open change orders" }),
    "Open change orders from field issue",
  );
  await waitFor(
    tab,
    () => document.body.innerText.includes("Change Orders"),
    "change orders opened from field issue handoff",
    15000,
  );
  await selectTestJob(tab, testJob.title);
  progress("job:field-issue:done");

  progress("job:field-photos:start");
  await tab.playwright.evaluate(() => {
    document
      .querySelector('[data-testid="field-materials-issues"]')
      ?.scrollIntoView({ block: "center" });
  });
  await clickUnique(
    tab.playwright.locator('xpath=//*[@data-testid="field-materials-issues"]//button[normalize-space(.)="Open photo upload"]'),
    "Open photo upload from field workspace",
  );
  await waitFor(
    tab,
    () =>
      document.body.innerText.includes("Photos") &&
      document.body.innerText.includes("Upload, search, and organize job"),
    "Photos opened from field workspace",
    15000,
  );
  await selectTestJob(tab, testJob.title);
  progress("job:field-photos:done");

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
    fieldTaskTitle,
    noteText,
    progressText,
    issueText,
    materialName,
    scheduleTitle,
  ].filter((value) => !textAfterRefresh.includes(value));

  if (missingAfterRefresh.length) {
    throw new Error(`Missing after refresh: ${missingAfterRefresh.join(", ")}`);
  }
  progress("job:refresh:done");

  results.refreshPersistence = {
    checked: [
      editedTaskTitle,
      fieldTaskTitle,
      noteText,
      progressText,
      issueText,
      materialName,
      scheduleTitle,
    ],
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
      enabledGroups.has("crm-inbox") ||
      enabledGroups.has("communications");
    const shouldRunEstimatesWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-estimates");
    const shouldRunSalesPipelineWorkflow = enabledGroups.has("sales-pipeline");
    const shouldSeedLeadForEstimates =
      enabledGroups.has("crm-estimates") && !shouldRunLeadWorkflow;
    const shouldRunCustomersWorkflow =
      enabledGroups.has("crm") || enabledGroups.has("crm-customers");
    const shouldRunInboxWorkflow =
      enabledGroups.has("crm") ||
      enabledGroups.has("crm-inbox") ||
      enabledGroups.has("communications");
    const shouldReloadFreshSnapshot =
      shouldRunLeadWorkflow ||
      shouldRunEstimatesWorkflow ||
      shouldRunSalesPipelineWorkflow ||
      shouldRunCustomersWorkflow ||
      shouldRunInboxWorkflow ||
        enabledGroups.has("operations") ||
        enabledGroups.has("financial") ||
        enabledGroups.has("customer-portal") ||
        enabledGroups.has("marketing") ||
        enabledGroups.has("lead-intake-workspace") ||
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
      enabledGroups.has("dispatch") ||
      enabledGroups.has("field-operations") ||
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

      if (enabledGroups.has("operations")) {
        await record("Office Operations Command Center shows live priority queues and routes to existing modules", () =>
          testOfficeOperationsWorkspace(browser, tab),
        );
      }

    if (enabledGroups.has("settings")) {
      await record("Settings Integration Center displays provider readiness", () =>
        testSettingsIntegrationCenter(tab),
      );
    }

    if (enabledGroups.has("production-readiness")) {
      await record("Production Readiness Center reports deployment and provider activation blockers", () =>
        testProductionReadinessCenter(browser, tab, baseUrl),
      );
    }

    if (enabledGroups.has("documents")) {
      await record("Document Center filters, previews, renames, archives, and stays responsive", () =>
        testDocumentCenterWorkspace(browser, tab, env, weatherTech, seededJob, runId),
      );
    }

    if (enabledGroups.has("customer-portal")) {
      await record("Customer Portal shows isolated project status, documents, photos, messages, schedule, payments, warranty, and profile", () =>
        testCustomerPortalWorkspace(browser, tab, env, weatherTech, runId, progress),
      );
    }

    if (enabledGroups.has("financial")) {
      await record("Financial Operations creates invoices, records payments, guards overpayment, and stays responsive", () =>
        testFinancialOperationsWorkspace(browser, tab, env, weatherTech, runId, progress),
      );
    }

    if (enabledGroups.has("analytics")) {
      await record("Executive Intelligence summarizes revenue, sales, operations, customer, financial, alerts, and trends", () =>
        testExecutiveIntelligenceWorkspace(browser, tab),
      );
    }

    if (enabledGroups.has("marketing")) {
      await record("Website & Marketing foundation opens and routes to existing workspaces", () =>
        testWebsiteMarketingFoundation(browser, tab),
      );
    }

    if (enabledGroups.has("calendar")) {
      await record("Calendar screen opens with schedule metrics", () =>
        testCalendarScreen(tab),
      );
    }

    let leadWorkflow = null;
    let salesPipelineLead = null;
    let jobBuilderWorkflow = null;
    let jobBuilderSeededJob = seededJob;

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
      await record("Estimates approve and convert an isolated estimate into one draft job", async () => {
        if (!leadWorkflow) {
          throw new Error("Lead workflow did not produce a test lead.");
        }

        return testEstimatesWorkflow(tab, env, weatherTech, leadWorkflow, runId, progress);
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

          return testUnifiedInboxSearchAndFilters(
            tab,
            env,
            companies,
            leadWorkflow,
            runId,
            baseUrl,
            progress,
          );
        });
      }

    if (shouldRunSalesPipelineWorkflow) {
      progress("lead:seed-for-sales-pipeline:start");
      salesPipelineLead = await seedTestLead(
        env,
        weatherTech.id,
        runId,
        leadNameColumn,
        "OPPORTUNITY",
      );
      await tab.reload();
      await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
      await ensureAppShell(tab, baseUrl, progress);
      progress("lead:seed-for-sales-pipeline:done");

      await record("Sales Pipeline manages opportunities, conversion, filters, and reload persistence", async () => {
        if (!salesPipelineLead) {
          throw new Error("Sales Pipeline seed did not produce a test lead.");
        }

        return testSalesPipelineWorkflow(tab, env, weatherTech, salesPipelineLead, runId, progress);
      });
    }

    if (enabledGroups.has("lead-intake-workspace")) {
      await record("Lead Intake workspace creates a company-scoped CRM lead", () =>
        testLeadIntakeWorkspace(tab, env, weatherTech, runId, leadNameColumn),
      );
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

    if (enabledGroups.has("dispatch")) {
      await record("Dispatch workspace schedules jobs, shows inspections, and avoids duplicate job events", () =>
        testDispatchWorkspace(browser, tab, env, weatherTech, seededJob, runId, progress),
      );
    }

    if (enabledGroups.has("field-operations")) {
      await record("Field Operations workspace manages mobile assignments, status, issues, materials, and routing", () =>
        testFieldOperationsWorkspace(browser, tab, env, weatherTech, runId, progress),
      );
    }

    if (enabledGroups.has("jobs-workspace")) {
      await record("Jobs workspace filters and section navigation render", () =>
        testJobsWorkspaceFiltersAndSections(browser, tab, weatherTech, seededJob),
      );
    }

    if (enabledGroups.has("job-builder") || enabledGroups.has("job-production")) {
      progress("job-builder:seed-isolated:start");
      jobBuilderSeededJob = await seedTestJob(env, weatherTech.id, `${runId} JOBFLOW`);
      await tab.reload();
      await tab.playwright.waitForLoadState({ state: "domcontentloaded", timeoutMs: 15000 });
      await ensureAppShell(tab, baseUrl, progress);
      progress("job-builder:seed-isolated:done");
    }

    if (enabledGroups.has("job-builder")) {
      await record("Jobs screen opens and isolated draft job can be edited and scheduled", async () => {
        jobBuilderWorkflow = await testJobBuilderEditAndSchedule(tab, env, jobBuilderSeededJob, runId, progress);
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
              ...jobBuilderSeededJob,
              id: jobBuilderWorkflow?.jobId ?? jobBuilderSeededJob.id,
              title: jobBuilderWorkflow?.updatedJobTitle ?? jobBuilderSeededJob.title,
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
