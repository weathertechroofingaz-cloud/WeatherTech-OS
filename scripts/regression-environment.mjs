#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const REGRESSION_SUPABASE_PROJECT_REF = "hygtnhmmaoboduqghhwg";
export const PRODUCTION_SUPABASE_PROJECT_REF = "gahfcgyjtfwwmsterhzu";
export const REGRESSION_OWNER_MARKER = "weathertech-os-regression-owner-v1";
const JOB_PHOTO_BUCKET = "job-photos";
const CUSTOMER_DOCUMENT_BUCKET = "customer-documents";
const JOB_PHOTO_LIFECYCLE_MARKER = "weathertech-os-job-photo-lifecycle-v1";
const JOB_PHOTO_TEST_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const JOB_PHOTO_CROSS_UPDATE_BYTES = Buffer.from(
  "cross-company-update-must-not-persist",
  "utf8",
);
const JOB_PHOTO_NONRETRYABLE_REFUSAL_MAX_MS = 10_000;

export const REQUIRED_DISABLED_SIDE_EFFECT_FLAGS = [
  "AI_ACTION_EXECUTION_ENABLED",
  "AI_ENABLED",
  "DOCUSIGN_PROVIDER_WRITES_ENABLED",
  "DOCUSIGN_SIGNATURE_REQUESTS_ENABLED",
  "DROPBOX_SIGN_PROVIDER_WRITES_ENABLED",
  "DROPBOX_SIGN_SIGNATURE_REQUESTS_ENABLED",
  "GHL_SYNC_ENABLED",
  "GOOGLE_BUSINESS_PROFILE_REVIEW_REPLY_ENABLED",
  "GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED",
  "GOOGLE_CALENDAR_WRITE_ENABLED",
  "GOOGLE_GMAIL_SEND_ENABLED",
  "IHC_WEBSITE_INTAKE_ENABLED",
  "QUICKBOOKS_ACCOUNTING_WRITES_ENABLED",
  "QUICKBOOKS_PAYMENT_PROCESSING_ENABLED",
  "QUICKBOOKS_SYNC_ENABLED",
  "STRIPE_LIVE_PAYMENTS_ENABLED",
  "STRIPE_REFUNDS_ENABLED",
  "STRIPE_WEBHOOK_PROCESSING_ENABLED",
  "TWILIO_INBOUND_SMS_ENABLED",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
  "WEATHERTECH_TUCSON_WEBSITE_INTAKE_ENABLED",
  "WEATHERTECH_WEBSITE_INTAKE_ENABLED",
  "WEBSITE_INTAKE_ENABLED",
  "WTOS_AUTOMATED_CUSTOMER_NOTIFICATIONS_ENABLED",
  "WTOS_CUSTOMER_PORTAL_ENABLED",
  "WTOS_PRODUCTION_APPROVED",
  "WTOS_PUBLIC_REGISTRATION_ENABLED",
  "YELP_LIVE_SYNC_ENABLED",
  "YELP_LIVE_SYNC_ENABLED_IHC",
  "YELP_LIVE_SYNC_ENABLED_WEATHERTECH_PHOENIX",
  "YELP_LIVE_SYNC_ENABLED_WEATHERTECH_TUCSON",
  "YELP_OUTBOUND_MESSAGING_ENABLED",
  "YELP_OUTBOUND_MESSAGING_ENABLED_IHC",
  "YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_PHOENIX",
  "YELP_OUTBOUND_MESSAGING_ENABLED_WEATHERTECH_TUCSON",
];

const EXPECTED_COMPANIES = [
  { name: "WeatherTech Roofing LLC", trade: "roofing" },
  { name: "IHC Painting", trade: "painting" },
];

const PROVIDER_EMPTY_TABLES = [
  "business_phone_numbers",
  "calendar_event_syncs",
  "communication_provider_events",
  "gmail_email_attachments",
  "gmail_email_threads",
  "gmail_mailbox_credentials",
  "gmail_oauth_states",
  "gohighlevel_discovery_snapshots",
  "gohighlevel_oauth_credentials",
  "gohighlevel_oauth_states",
  "gohighlevel_resource_snapshots",
  "gohighlevel_sync_mappings",
  "gohighlevel_webhook_events",
  "google_calendar_connected_calendars",
  "google_calendar_credentials",
  "google_calendar_unmatched_events",
  "integration_connections",
  "integration_sync_logs",
  "mighty_apes_yelp_webhook_events",
  "stripe_company_accounts",
  "stripe_object_mappings",
  "stripe_webhook_events",
];

const RESIDUE_PROBES = [
  ["business_phone_numbers", "routing_key"],
  ["call_records", "correlation_id"],
  ["change_orders", "title"],
  ["communication_provider_events", "correlation_id"],
  ["crm_identity_reconciliation_events", "operation_key"],
  ["customers", "display_name"],
  ["daily_logs", "work_completed"],
  ["documents", "title"],
  ["email_messages", "subject"],
  ["estimates", "title"],
  ["inspections", "title"],
  ["invoices", "title"],
  ["job_notes", "note"],
  ["job_photo_upload_operations", "file_path", "*"],
  ["job_photos", "caption"],
  ["jobs", "title"],
  ["lead_accountability_events", "operation_key"],
  ["lead_intake_records", "contact_name"],
  ["lead_intake_records", "provider_event_id"],
  ["leads", "contact_name"],
  ["marketing_accountability_operation_receipts", "operation_kind", "*"],
  ["marketing_campaigns", "campaign_name"],
  ["marketing_spend_months", "notes"],
  [
    "mighty_apes_yelp_webhook_events",
    "delivery_id",
    "TEST WTOS MIGHTY APES REGRESSION:*",
  ],
  [
    "mighty_apes_yelp_webhook_events",
    "provider_lead_id",
    "TEST WTOS MIGHTY APES REGRESSION:*",
  ],
  ["notifications", "title"],
  ["office_tasks", "title"],
  ["schedule_events", "title"],
  ["scopes", "title"],
  ["sms_messages", "correlation_id"],
];

const OWNER_REFERENCE_PROBES = [
  ["ai_audit_events", "actor_user_id"],
  ["ai_saved_analyses", "created_by"],
  ["crm_identity_reconciliation_events", "actor_user_id"],
  ["documents", "uploaded_by"],
  ["estimate_proposal_options", "created_by"],
  ["estimate_proposal_options", "selected_by"],
  ["estimate_proposal_revisions", "created_by"],
  ["estimate_proposal_revisions", "updated_by"],
  ["estimate_proposal_sections", "created_by"],
  ["gmail_oauth_states", "initiated_by"],
  ["gohighlevel_oauth_states", "initiated_by"],
  ["lead_accountability", "owner_user_id"],
  ["lead_accountability", "reviewed_by"],
  ["lead_accountability_events", "actor_user_id"],
  ["leads", "created_by"],
  ["marketing_campaigns", "created_by"],
  ["marketing_spend_months", "entered_by"],
  ["office_tasks", "completed_by"],
  ["proposal_audit_events", "actor_id"],
  ["proposal_templates", "created_by"],
  ["proposal_templates", "last_edited_by"],
];

function readEnv(env, name) {
  const value = env?.[name];
  return typeof value === "string" ? value.trim() : "";
}

function decodeJwt(value) {
  const parts = value.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function requireValue(env, name) {
  const value = readEnv(env, name);

  if (!value) {
    throw new Error(`${name} is required. This script never reads .env.local.`);
  }

  return value;
}

export function validateRegressionEnvironment(env = process.env) {
  const supabaseUrl = requireValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = requireValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const expectedProjectRef = requireValue(
    env,
    "WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF",
  ).toLowerCase();
  const remoteWritesEnabled = requireValue(
    env,
    "WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED",
  );
  const ownerEmail = requireValue(env, "WTOS_REGRESSION_OWNER_EMAIL").toLowerCase();
  const ownerPassword = requireValue(env, "WTOS_REGRESSION_OWNER_PASSWORD");
  let parsedUrl;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.origin !== `https://${REGRESSION_SUPABASE_PROJECT_REF}.supabase.co` ||
    parsedUrl.pathname !== "/"
  ) {
    throw new Error(
      `Regression environment commands are restricted to approved project ${REGRESSION_SUPABASE_PROJECT_REF}.`,
    );
  }

  if (
    parsedUrl.hostname.startsWith(PRODUCTION_SUPABASE_PROJECT_REF) ||
    expectedProjectRef === PRODUCTION_SUPABASE_PROJECT_REF
  ) {
    throw new Error("Production Supabase is permanently prohibited as a regression target.");
  }

  if (expectedProjectRef !== REGRESSION_SUPABASE_PROJECT_REF) {
    throw new Error(
      "WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF must name the approved regression project.",
    );
  }

  if (remoteWritesEnabled !== "true") {
    throw new Error(
      "WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED must be exactly true for this explicit non-production operation.",
    );
  }

  if (!/^weathertech-os-regression(?:[-+][a-z0-9._-]+)?@example\.test$/i.test(ownerEmail)) {
    throw new Error(
      "WTOS_REGRESSION_OWNER_EMAIL must be a synthetic weathertech-os-regression account under example.test.",
    );
  }

  if (ownerPassword.length < 16) {
    throw new Error("WTOS_REGRESSION_OWNER_PASSWORD must contain at least 16 characters.");
  }

  if (!anonKey.startsWith("eyJ") && !anonKey.startsWith("sb_publishable_")) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not a recognized public Supabase key.");
  }

  if (anonKey.startsWith("eyJ")) {
    const payload = decodeJwt(anonKey);

    if (payload?.role !== "anon") {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not an anonymous Supabase credential.");
    }

    if (
      typeof payload.ref === "string" &&
      payload.ref.toLowerCase() !== REGRESSION_SUPABASE_PROJECT_REF
    ) {
      throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY belongs to a different project.");
    }
  }

  if (!serviceRoleKey.startsWith("sb_secret_")) {
    const payload = decodeJwt(serviceRoleKey);

    if (payload?.role !== "service_role") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not a service-role credential.");
    }

    if (
      typeof payload.ref === "string" &&
      payload.ref.toLowerCase() !== REGRESSION_SUPABASE_PROJECT_REF
    ) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY belongs to a different project.");
    }
  }

  const enabledSideEffects = REQUIRED_DISABLED_SIDE_EFFECT_FLAGS.filter(
    (name) => readEnv(env, name).toLowerCase() === "true",
  );

  if (enabledSideEffects.length > 0) {
    throw new Error(
      `Regression environment refuses enabled provider/live-write gates: ${enabledSideEffects.join(", ")}.`,
    );
  }

  return {
    anonKey,
    ownerEmail,
    ownerPassword,
    projectRef: REGRESSION_SUPABASE_PROJECT_REF,
    serviceRoleKey,
    supabaseUrl: parsedUrl.origin,
  };
}

function safeErrorBody(text) {
  if (!text) {
    return "empty response";
  }

  try {
    const body = JSON.parse(text);
    return String(body.message ?? body.msg ?? body.error_description ?? body.error ?? "request failed")
      .slice(0, 240);
  } catch {
    return `non-JSON response (${text.length} bytes)`;
  }
}

async function requestJson(fetchImpl, url, { key, method = "GET", body, headers } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase ${method} ${new URL(url).pathname} failed (${response.status}): ${safeErrorBody(text)}`,
    );
  }

  return text.trim() ? JSON.parse(text) : null;
}

function restUrl(config, table, query) {
  return `${config.supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`;
}

async function restSelect(config, fetchImpl, table, query) {
  const rows = await requestJson(fetchImpl, restUrl(config, table, query), {
    key: config.serviceRoleKey,
  });

  if (!Array.isArray(rows)) {
    throw new Error(`Supabase returned an invalid row set for ${table}.`);
  }

  return rows;
}

async function restUpsert(config, fetchImpl, table, conflictColumns, rows) {
  return requestJson(
    fetchImpl,
    restUrl(config, table, `on_conflict=${encodeURIComponent(conflictColumns)}`),
    {
      key: config.serviceRoleKey,
      method: "POST",
      body: rows,
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    },
  );
}

async function restInsert(config, fetchImpl, table, rows) {
  return requestJson(fetchImpl, restUrl(config, table), {
    key: config.serviceRoleKey,
    method: "POST",
    body: rows,
    headers: { Prefer: "return=representation" },
  });
}

async function restDeleteExactId(config, fetchImpl, table, id) {
  return requestJson(
    fetchImpl,
    restUrl(config, table, `id=eq.${encodeURIComponent(id)}`),
    {
      key: config.serviceRoleKey,
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    },
  );
}

async function restCount(config, fetchImpl, table, query = "") {
  const response = await fetchImpl(restUrl(config, table, query), {
    method: "HEAD",
    headers: {
      apikey: config.serviceRoleKey,
      authorization: `Bearer ${config.serviceRoleKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Supabase HEAD /rest/v1/${table} failed (${response.status}): ${safeErrorBody(text)}`,
    );
  }

  const contentRange = response.headers.get("content-range") ?? "";
  const match = contentRange.match(/\/(\d+)$/);

  if (!match) {
    throw new Error(`Supabase did not return an exact count for ${table}.`);
  }

  return Number(match[1]);
}

async function listAuthUsers(config, fetchImpl) {
  const body = await requestJson(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/admin/users?page=1&per_page=1000`,
    { key: config.serviceRoleKey },
  );

  if (!Array.isArray(body?.users)) {
    throw new Error("Supabase Auth returned an invalid user list.");
  }

  return body.users;
}

function markerFor(config) {
  return {
    wt_os_regression_marker: REGRESSION_OWNER_MARKER,
    wt_os_regression_project_ref: config.projectRef,
  };
}

export function assertOwnedRegressionUser(user, config) {
  if (!user || user.email?.toLowerCase() !== config.ownerEmail) {
    throw new Error("Regression owner identity does not match the configured synthetic email.");
  }

  const marker = markerFor(config);

  if (
    user.app_metadata?.wt_os_regression_marker !== marker.wt_os_regression_marker ||
    user.app_metadata?.wt_os_regression_project_ref !== marker.wt_os_regression_project_ref
  ) {
    throw new Error(
      "Configured regression-owner email already exists without the exact harness ownership marker; refusing to adopt or delete it.",
    );
  }

  return user;
}

async function findRegressionOwner(config, fetchImpl) {
  const matches = (await listAuthUsers(config, fetchImpl)).filter(
    (user) => user.email?.toLowerCase() === config.ownerEmail,
  );

  if (matches.length > 1) {
    throw new Error("Multiple Auth users match the configured regression-owner email.");
  }

  return matches[0] ?? null;
}

async function verifyCredentialTarget(config, fetchImpl) {
  const authSettings = await requestJson(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/settings`,
    { key: config.anonKey },
  );

  if (!authSettings || typeof authSettings !== "object" || Array.isArray(authSettings)) {
    throw new Error("Approved regression project did not accept its configured public key.");
  }

  const companies = await restSelect(
    config,
    fetchImpl,
    "companies",
    "select=id,name,trade&order=name.asc",
  );

  if (companies.length !== EXPECTED_COMPANIES.length) {
    throw new Error(
      `Approved regression project must contain exactly ${EXPECTED_COMPANIES.length} seeded companies; found ${companies.length}.`,
    );
  }

  for (const expected of EXPECTED_COMPANIES) {
    const company = companies.find((candidate) => candidate.name === expected.name);

    if (!company || company.trade !== expected.trade) {
      throw new Error(`Approved regression project is missing ${expected.name}/${expected.trade}.`);
    }
  }

  return companies;
}

async function verifyPasswordLogin(config, fetchImpl, expectedUserId) {
  const response = await requestJson(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      key: config.anonKey,
      method: "POST",
      body: { email: config.ownerEmail, password: config.ownerPassword },
    },
  );

  if (response?.user?.id !== expectedUserId || !response?.access_token) {
    throw new Error("Synthetic regression owner password login did not return the expected user.");
  }

  await requestJson(fetchImpl, `${config.supabaseUrl}/auth/v1/logout?scope=local`, {
    key: config.anonKey,
    method: "POST",
    headers: { authorization: `Bearer ${response.access_token}` },
  });
}

async function getResidue(config, fetchImpl) {
  const counts = {};

  for (const [table, column, markerPattern = "TEST WTOS REGRESSION*"] of RESIDUE_PROBES) {
    const key = `${table}.${column}`;
    counts[key] = await restCount(
      config,
      fetchImpl,
      table,
      `select=id&${column}=like.${encodeURIComponent(markerPattern)}`,
    );
  }

  // The isolated target has no legitimate dynamic automation history between
  // runs. These whole-ledger probes therefore catch both exact-source residue
  // and orphaned immutable descendants that no source-marker scan can see.
  counts["automation_events.exact-source-or-orphan"] = await restCount(
    config,
    fetchImpl,
    "automation_events",
    "select=id",
  );
  counts["automation_executions.exact-source-or-orphan"] = await restCount(
    config,
    fetchImpl,
    "automation_executions",
    "select=id",
  );
  counts["automation_attempts.exact-source-or-orphan"] = await restCount(
    config,
    fetchImpl,
    "automation_attempts",
    "select=id",
  );
  counts["automation_audit_events.dynamic"] = await restCount(
    config,
    fetchImpl,
    "automation_audit_events",
    "select=id&audit_type=neq.rule_seeded",
  );
  counts["office_tasks.automation_execution_id"] = await restCount(
    config,
    fetchImpl,
    "office_tasks",
    "select=id&automation_execution_id=not.is.null",
  );

  return counts;
}

export function assertZeroCounts(counts, label) {
  const nonzero = Object.entries(counts).filter(([, count]) => count !== 0);

  if (nonzero.length > 0) {
    throw new Error(
      `${label} is not empty: ${nonzero.map(([name, count]) => `${name}=${count}`).join(", ")}.`,
    );
  }
}

async function verifyProviderIsolation(config, fetchImpl) {
  const counts = {};

  for (const table of PROVIDER_EMPTY_TABLES) {
    counts[table] = await restCount(config, fetchImpl, table, "select=id");
  }

  counts.stripe_payments = await restCount(
    config,
    fetchImpl,
    "payments",
    "select=id&method=ilike.stripe",
  );
  assertZeroCounts(counts, "Regression provider/Stripe connection state");
  return counts;
}

async function verifyOwnerState(config, fetchImpl, companies, { requireOwner = true } = {}) {
  const user = await findRegressionOwner(config, fetchImpl);

  if (!user) {
    if (requireOwner) {
      throw new Error("Synthetic regression owner does not exist.");
    }

    return null;
  }

  assertOwnedRegressionUser(user, config);
  const profiles = await restSelect(
    config,
    fetchImpl,
    "profiles",
    `select=id,role,default_company_id&id=eq.${encodeURIComponent(user.id)}`,
  );
  const memberships = await restSelect(
    config,
    fetchImpl,
    "company_memberships",
    `select=user_id,company_id,role,can_manage_settings,can_manage_financials,can_manage_production&user_id=eq.${encodeURIComponent(user.id)}`,
  );
  const weatherTech = companies.find((company) => company.name === "WeatherTech Roofing LLC");
  const expectedCompanyIds = new Set(companies.map((company) => company.id));

  if (
    profiles.length !== 1 ||
    profiles[0].role !== "owner" ||
    profiles[0].default_company_id !== weatherTech.id
  ) {
    throw new Error("Synthetic regression owner profile is missing or incorrectly scoped.");
  }

  if (
    memberships.length !== 2 ||
    memberships.some(
      (membership) =>
        !expectedCompanyIds.has(membership.company_id) ||
        membership.role !== "owner" ||
        membership.can_manage_settings !== true ||
        membership.can_manage_financials !== true ||
        membership.can_manage_production !== true,
    )
  ) {
    throw new Error("Synthetic regression owner memberships are missing, extra, or incorrectly scoped.");
  }

  await verifyPasswordLogin(config, fetchImpl, user.id);
  return user;
}

async function bootstrap(config, fetchImpl) {
  const companies = await verifyCredentialTarget(config, fetchImpl);
  let user = await findRegressionOwner(config, fetchImpl);
  const authBody = {
    email: config.ownerEmail,
    password: config.ownerPassword,
    email_confirm: true,
    app_metadata: markerFor(config),
    user_metadata: { full_name: "WeatherTech OS Regression Owner" },
  };

  if (user) {
    assertOwnedRegressionUser(user, config);
    user = await requestJson(
      fetchImpl,
      `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
      { key: config.serviceRoleKey, method: "PUT", body: authBody },
    );
  } else {
    user = await requestJson(fetchImpl, `${config.supabaseUrl}/auth/v1/admin/users`, {
      key: config.serviceRoleKey,
      method: "POST",
      body: authBody,
    });
  }

  assertOwnedRegressionUser(user, config);
  const weatherTech = companies.find((company) => company.name === "WeatherTech Roofing LLC");

  await restUpsert(config, fetchImpl, "profiles", "id", [
    {
      id: user.id,
      full_name: "WeatherTech OS Regression Owner",
      role: "owner",
      default_company_id: weatherTech.id,
    },
  ]);
  await restUpsert(config, fetchImpl, "company_memberships", "user_id,company_id", companies.map(
    (company) => ({
      user_id: user.id,
      company_id: company.id,
      role: "owner",
      can_manage_settings: true,
      can_manage_financials: true,
      can_manage_production: true,
    }),
  ));

  await verifyOwnerState(config, fetchImpl, companies);
  const providerCounts = await verifyProviderIsolation(config, fetchImpl);
  const residueCounts = await getResidue(config, fetchImpl);
  assertZeroCounts(residueCounts, "Regression run residue");

  return {
    command: "bootstrap",
    companies: companies.map((company) => company.name),
    ownerReady: true,
    providerCounts,
    residueCount: 0,
    target: config.projectRef,
  };
}

async function verify(config, fetchImpl) {
  const companies = await verifyCredentialTarget(config, fetchImpl);
  await verifyOwnerState(config, fetchImpl, companies);
  const providerCounts = await verifyProviderIsolation(config, fetchImpl);
  const residueCounts = await getResidue(config, fetchImpl);
  assertZeroCounts(residueCounts, "Regression run residue");

  return {
    command: "verify",
    companies: companies.map((company) => company.name),
    ownerReady: true,
    providerCounts,
    residueCount: 0,
    target: config.projectRef,
  };
}

async function verifyResidue(config, fetchImpl) {
  await verifyCredentialTarget(config, fetchImpl);
  const residueCounts = await getResidue(config, fetchImpl);
  assertZeroCounts(residueCounts, "Regression run residue");

  return { command: "verify-residue", residueCount: 0, target: config.projectRef };
}

function createIsolatedSupabaseClient(config, key, fetchImpl) {
  return createClient(config.supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: fetchImpl },
  });
}

function requireSupabaseData(result, label) {
  if (result.error) {
    throw new Error(`${label} failed: ${result.error.message}`);
  }

  return result.data;
}

function requireSupabaseRefusal(result, label) {
  if (!result.error) {
    throw new Error(`${label} unexpectedly succeeded.`);
  }

  return result.error;
}

function requireSupabaseErrorCode(result, expectedCode, label) {
  const error = requireSupabaseRefusal(result, label);

  if (String(error.code ?? "") !== expectedCode) {
    throw new Error(
      `${label} returned ${String(error.code ?? "no code")}; expected ${expectedCode}.`,
    );
  }

  return error;
}

async function retryExactSupabaseRpc(
  operation,
  label,
  { maxAttempts = 3, readConvergedResult = null } = {},
) {
  let lastResult = null;
  let lastThrownError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();

      if (!result.error) {
        return result;
      }

      lastResult = result;
      lastThrownError = null;
    } catch (error) {
      lastResult = null;
      lastThrownError = error;
    }

    if (attempt < maxAttempts) {
      if (readConvergedResult) {
        try {
          const convergedResult = await readConvergedResult();

          if (convergedResult) {
            return convergedResult;
          }
        } catch {
          // The same exact confirmation remains the authoritative bounded retry.
        }
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }

  if (lastThrownError) {
    throw new Error(`${label} failed after ${maxAttempts} exact retries.`, {
      cause: lastThrownError,
    });
  }

  return lastResult;
}

function jobPhotoRequestFingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function jobPhotoRpcRow(data, label) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row?.id || !row.file_path) {
    throw new Error(`${label} did not return one job-photo row.`);
  }

  return row;
}

function jobPhotoOperationRow(data, label, expectedStates = null) {
  const row = Array.isArray(data) ? data[0] : data;

  if (
    !row?.id ||
    !row.file_path ||
    !row.upload_operation_key ||
    !row.recovery_lease_token ||
    !row.recovery_lease_expires_at ||
    !row.state
  ) {
    throw new Error(`${label} did not return one durable upload-operation row.`);
  }

  if (expectedStates && !expectedStates.includes(row.state)) {
    throw new Error(
      `${label} returned state ${row.state}; expected ${expectedStates.join(" or ")}.`,
    );
  }

  return row;
}

function jobPhotoRecoveryClaimRow(data, label, expectedStates = null) {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row?.state || !row.lease_expires_at) {
    throw new Error(`${label} did not return one recovery-claim row.`);
  }

  if (expectedStates && !expectedStates.includes(row.state)) {
    throw new Error(
      `${label} returned state ${row.state}; expected ${expectedStates.join(" or ")}.`,
    );
  }

  return row;
}

async function jobPhotoStorageLifecycleProbe(config, fetchImpl, companies) {
  const serviceClient = createIsolatedSupabaseClient(
    config,
    config.serviceRoleKey,
    fetchImpl,
  );
  const anonymousClient = createIsolatedSupabaseClient(
    config,
    config.anonKey,
    fetchImpl,
  );
  const weatherTech = companies.find(
    (company) => company.name === "WeatherTech Roofing LLC",
  );
  const ihc = companies.find((company) => company.name === "IHC Painting");
  const runId = randomUUID();
  const sharedOperationKey = randomUUID();
  const weatherTechJobId = randomUUID();
  const ihcJobId = randomUUID();
  const userIds = [];
  const metadataIds = [];
  const storagePaths = [];
  let primaryError = null;
  let result = null;

  const jobPhotoBucket = requireSupabaseData(
    await serviceClient.storage.getBucket(JOB_PHOTO_BUCKET),
    "Read private job-photo bucket",
  );
  const customerDocumentBucketBefore = requireSupabaseData(
    await serviceClient.storage.getBucket(CUSTOMER_DOCUMENT_BUCKET),
    "Read customer-document compatibility bucket",
  );

  if (jobPhotoBucket.public !== false) {
    throw new Error("Isolated lifecycle requires the job-photos bucket to be private.");
  }

  if (customerDocumentBucketBefore.public !== false) {
    throw new Error("Customer-documents compatibility bucket is no longer private.");
  }

  const createScopedUser = async (scope, company) => {
    const email = `weathertech-os-regression-job-photos+${runId}-${scope}@example.test`;
    const password = `WTOS-${runId}-${scope}-photo-test`;
    const authResult = await serviceClient.auth.admin.createUser({
      app_metadata: {
        wt_os_regression_marker: JOB_PHOTO_LIFECYCLE_MARKER,
        wt_os_regression_project_ref: config.projectRef,
      },
      email,
      email_confirm: true,
      password,
      user_metadata: { full_name: `Job Photo ${scope} Regression User` },
    });
    const user = requireSupabaseData(authResult, `Create ${scope} job-photo user`).user;

    if (!user?.id) {
      throw new Error(`Create ${scope} job-photo user returned no user ID.`);
    }

    userIds.push(user.id);
    requireSupabaseData(
      await serviceClient.from("profiles").upsert({
        id: user.id,
        full_name: `Job Photo ${scope} Regression User`,
        role: "production",
        default_company_id: company.id,
      }),
      `Upsert ${scope} job-photo profile`,
    );
    requireSupabaseData(
      await serviceClient.from("company_memberships").upsert({
        user_id: user.id,
        company_id: company.id,
        role: "production",
        can_manage_settings: false,
        can_manage_financials: false,
        can_manage_production: true,
      }),
      `Upsert ${scope} company membership`,
    );

    const client = createIsolatedSupabaseClient(config, config.anonKey, fetchImpl);
    const signIn = requireSupabaseData(
      await client.auth.signInWithPassword({ email, password }),
      `Sign in ${scope} job-photo user`,
    );

    if (signIn.user?.id !== user.id || !signIn.session?.access_token) {
      throw new Error(`${scope} job-photo user sign-in returned the wrong identity.`);
    }

    return { client, user };
  };

  const insertJob = async (id, company, titleSuffix) => {
    const data = requireSupabaseData(
      await serviceClient
        .from("jobs")
        .insert({
          id,
          company_id: company.id,
          title: `TEST WTOS REGRESSION ${runId} ${titleSuffix}`,
          service_type: company.trade === "painting" ? "painting" : "roofing",
          status: "draft",
          business: "TEST Job Photo Regression",
          location: "TEST Job Photo Regression",
          property_address: "123 TEST Job Photo Regression Way, Phoenix, AZ",
          scope_of_work: "Synthetic non-production private photo validation.",
          total: 0,
        })
        .select("id,company_id,title")
        .single(),
      `Insert ${titleSuffix} job`,
    );

    if (data.id !== id || data.company_id !== company.id) {
      throw new Error(`${titleSuffix} job did not preserve its exact company scope.`);
    }

    return data;
  };

  const upload = async (client, path, label) => {
    storagePaths.push(path);
    requireSupabaseData(
      await client.storage.from(JOB_PHOTO_BUCKET).upload(
        path,
        JOB_PHOTO_TEST_PNG,
        {
          cacheControl: "60",
          contentType: "image/png",
          upsert: false,
        },
      ),
      label,
    );
  };

  const objectExists = async (path) => {
    const result = await serviceClient.storage.from(JOB_PHOTO_BUCKET).exists(path);

    if (result.data === true && !result.error) {
      return true;
    }

    if (
      result.data === false &&
      result.error &&
      [400, 404].includes(Number(result.error.status))
    ) {
      return false;
    }

    if (result.error) {
      throw new Error(
        `Read exact job-photo Storage object existence for ${path} failed: ${result.error.message}`,
      );
    }

    throw new Error("Exact job-photo Storage existence did not return a recognized boolean result.");
  };

  const requirePromptJobPhotoResidueRefusal = async (
    operation,
    label,
  ) => {
    const startedAt = Date.now();

    requireSupabaseErrorCode(await operation(), "P0001", label);

    const elapsedMs = Date.now() - startedAt;

    if (elapsedMs > JOB_PHOTO_NONRETRYABLE_REFUSAL_MAX_MS) {
      throw new Error(
        `${label} took ${elapsedMs}ms; deterministic residue refusal must return promptly without PostgREST serialization retries.`,
      );
    }
  };

  const removeExactStorageObject = async (client, path, label) => {
    const removedObjects = requireSupabaseData(
      await client.storage.from(JOB_PHOTO_BUCKET).remove([path]),
      label,
    );

    if (
      !Array.isArray(removedObjects) ||
      removedObjects.length !== 1 ||
      removedObjects[0]?.name !== path
    ) {
      throw new Error(
        `${label} did not return the one exact requested Storage object path.`,
      );
    }

    if (await objectExists(path)) {
      throw new Error(`${label} left the exact Storage object behind.`);
    }
  };

  const rpcArgs = ({
    company,
    job,
    operationKey,
    path,
    caption,
    fingerprint,
    recoveryLeaseToken,
    uploaderUserId = null,
  }) => ({
    target_company_id: company.id,
    target_upload_operation_key: operationKey,
    target_upload_request_fingerprint: fingerprint,
    target_file_path: path,
    target_recovery_lease_token: recoveryLeaseToken,
    target_customer_id: null,
    target_property_id: null,
    target_job_id: job.id,
    target_estimate_id: null,
    target_inspection_id: null,
    target_caption: caption,
    target_label: "During",
    target_taken_at: new Date().toISOString().slice(0, 10),
    target_is_customer_visible: false,
    target_sort_order: 0,
    ...(uploaderUserId
      ? { target_uploader_user_id: uploaderUserId }
      : {}),
  });

  const cancelRemoveAndConfirmAbort = async (client, args, path, label) => {
    const cancellation = jobPhotoOperationRow(
      requireSupabaseData(
        await client.rpc("wtos_cancel_job_photo_upload", args),
        `${label} cancellation`,
      ),
      `${label} cancellation`,
      ["canceling", "aborted"],
    );

    if (cancellation.state === "canceling") {
      storagePaths.push(path);
      const hasExactObjectResidue = await objectExists(path);

      if (hasExactObjectResidue) {
        await requirePromptJobPhotoResidueRefusal(
          () => client.rpc("wtos_confirm_job_photo_upload_abort", args),
          `${label} pre-removal abort confirmation`,
        );
        await removeExactStorageObject(
          client,
          path,
          `${label} exact Storage removal`,
        );
      }
    }

    const confirmation = jobPhotoOperationRow(
      requireSupabaseData(
        await retryExactSupabaseRpc(
          () => client.rpc("wtos_confirm_job_photo_upload_abort", args),
          `${label} abort confirmation`,
          {
            readConvergedResult: async () => {
              const replay = await client.rpc(
                "wtos_begin_job_photo_upload",
                args,
              );
              const operation = Array.isArray(replay.data)
                ? replay.data[0]
                : replay.data;

              return !replay.error &&
                ["committed", "aborted"].includes(operation?.state)
                ? replay
                : null;
            },
          },
        ),
        `${label} abort confirmation`,
      ),
      `${label} abort confirmation`,
      ["aborted"],
    );

    if (confirmation.id !== cancellation.id) {
      throw new Error(`${label} abort changed its durable operation identity.`);
    }

    return confirmation;
  };

  const buildScenario = ({
    company = weatherTech,
    job,
    suffix,
    caption,
  }) => {
    const operationKey = randomUUID();
    const recoveryLeaseToken = randomUUID();
    const path = `${company.id}/job/${job.id}/${operationKey}-test-wtos-regression-${runId}-${suffix}.png`;
    const fingerprint = jobPhotoRequestFingerprint({
      caption,
      companyId: company.id,
      jobId: job.id,
      operationKey,
      path,
    });

    return {
      args: rpcArgs({
        company,
        job,
        operationKey,
        path,
        caption,
        fingerprint,
        recoveryLeaseToken,
      }),
      fingerprint,
      operationKey,
      path,
      recoveryLeaseToken,
    };
  };

  const readScenarioState = async (company, operationKey, label) => {
    const [operationResult, metadataResult] = await Promise.all([
      serviceClient
        .from("job_photo_upload_operations")
        .select("id,company_id,upload_operation_key,file_path,recovery_lease_token,recovery_lease_expires_at,state")
        .eq("company_id", company.id)
        .eq("upload_operation_key", operationKey)
        .single(),
      serviceClient
        .from("job_photos")
        .select("id,company_id,file_path,file_url,upload_operation_key")
        .eq("company_id", company.id)
        .eq("upload_operation_key", operationKey),
    ]);

    return {
      metadata: requireSupabaseData(metadataResult, `${label} metadata readback`),
      operation: jobPhotoOperationRow(
        requireSupabaseData(operationResult, `${label} operation readback`),
        `${label} operation readback`,
      ),
    };
  };

  try {
    const weatherTechIdentity = await createScopedUser(
      "weathertech",
      weatherTech,
    );
    const ihcIdentity = await createScopedUser("ihc", ihc);
    const [weatherTechJob, ihcJob] = await Promise.all([
      insertJob(weatherTechJobId, weatherTech, "WEATHERTECH PHOTO JOB"),
      insertJob(ihcJobId, ihc, "IHC PHOTO JOB"),
    ]);
    const storageMarker = `test-wtos-regression-${runId}`;
    const weatherTechPath = `${weatherTech.id}/job/${weatherTechJob.id}/${sharedOperationKey}-${storageMarker}-same-name.png`;
    const ihcPath = `${ihc.id}/job/${ihcJob.id}/${sharedOperationKey}-${storageMarker}-same-name.png`;
    const weatherTechToIhcUploadPath = `${ihc.id}/job/${ihcJob.id}/${randomUUID()}-${storageMarker}-weathertech-denied.png`;
    const ihcToWeatherTechUploadPath = `${weatherTech.id}/job/${weatherTechJob.id}/${randomUUID()}-${storageMarker}-ihc-denied.png`;
    const anonymousUploadPath = `${weatherTech.id}/job/${weatherTechJob.id}/${randomUUID()}-${storageMarker}-anonymous-denied.png`;
    const weatherTechCaption = `TEST WTOS REGRESSION ${runId} WEATHERTECH PRIVATE PHOTO`;
    const ihcCaption = `TEST WTOS REGRESSION ${runId} IHC PRIVATE PHOTO`;
    const weatherTechRecoveryLeaseToken = randomUUID();
    const ihcRecoveryLeaseToken = randomUUID();
    const weatherTechFingerprint = jobPhotoRequestFingerprint({
      companyId: weatherTech.id,
      jobId: weatherTechJob.id,
      operationKey: sharedOperationKey,
      path: weatherTechPath,
      caption: weatherTechCaption,
    });
    const ihcFingerprint = jobPhotoRequestFingerprint({
      companyId: ihc.id,
      jobId: ihcJob.id,
      operationKey: sharedOperationKey,
      path: ihcPath,
      caption: ihcCaption,
    });
    const weatherTechArgs = rpcArgs({
      company: weatherTech,
      job: weatherTechJob,
      operationKey: sharedOperationKey,
      path: weatherTechPath,
      caption: weatherTechCaption,
      fingerprint: weatherTechFingerprint,
      recoveryLeaseToken: weatherTechRecoveryLeaseToken,
    });
    const ihcArgs = rpcArgs({
      company: ihc,
      job: ihcJob,
      operationKey: sharedOperationKey,
      path: ihcPath,
      caption: ihcCaption,
      fingerprint: ihcFingerprint,
      recoveryLeaseToken: ihcRecoveryLeaseToken,
    });

    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        ihcArgs,
      ),
      "WeatherTech-to-IHC upload reservation",
    );
    requireSupabaseRefusal(
      await ihcIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        weatherTechArgs,
      ),
      "IHC-to-WeatherTech upload reservation",
    );
    requireSupabaseRefusal(
      await anonymousClient.rpc("wtos_begin_job_photo_upload", weatherTechArgs),
      "Anonymous job-photo upload reservation",
    );

    const concurrentWeatherTechReservations = await Promise.all([
      weatherTechIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        weatherTechArgs,
      ),
      weatherTechIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        weatherTechArgs,
      ),
    ]);
    const weatherTechReservations = concurrentWeatherTechReservations.map(
      (reservation, index) =>
        jobPhotoOperationRow(
          requireSupabaseData(
            reservation,
            `Concurrent WeatherTech upload reservation ${index + 1}`,
          ),
          `Concurrent WeatherTech upload reservation ${index + 1}`,
          ["reserved"],
        ),
    );
    const ihcReservation = jobPhotoOperationRow(
      requireSupabaseData(
        await ihcIdentity.client.rpc("wtos_begin_job_photo_upload", ihcArgs),
        "Begin IHC upload reservation",
      ),
      "Begin IHC upload reservation",
      ["reserved"],
    );

    if (
      weatherTechReservations.some(
        (reservation) => reservation.id !== weatherTechReservations[0].id,
      ) ||
      weatherTechReservations[0].file_path !== weatherTechPath ||
      weatherTechReservations[0].recovery_lease_token !==
        weatherTechRecoveryLeaseToken ||
      ihcReservation.recovery_lease_token !== ihcRecoveryLeaseToken ||
      ihcReservation.file_path !== ihcPath
    ) {
      throw new Error("Concurrent upload reservations did not converge exactly.");
    }

    const weatherTechLeaseBeforeHeartbeat = Date.parse(
      weatherTechReservations[0].recovery_lease_expires_at,
    );
    const weatherTechHeartbeat = jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          weatherTechArgs,
        ),
        "Heartbeat active WeatherTech upload reservation",
      ),
      "Heartbeat active WeatherTech upload reservation",
      ["reserved"],
    );

    if (
      weatherTechHeartbeat.id !== weatherTechReservations[0].id ||
      weatherTechHeartbeat.recovery_lease_token !==
        weatherTechRecoveryLeaseToken ||
      Date.parse(weatherTechHeartbeat.recovery_lease_expires_at) <
        weatherTechLeaseBeforeHeartbeat
    ) {
      throw new Error(
        "Exact-token reservation heartbeat changed identity or shortened its recovery lease.",
      );
    }

    const weatherTechRecoveryList = requireSupabaseData(
      await weatherTechIdentity.client.rpc(
        "wtos_list_my_job_photo_upload_recoveries",
        {},
      ),
      "List WeatherTech upload recoveries without PII",
    );
    const recoveryListKeys = Object.keys(weatherTechRecoveryList[0] ?? {}).sort();

    if (
      weatherTechRecoveryList.length !== 1 ||
      weatherTechRecoveryList[0].uploader_user_id !==
        weatherTechIdentity.user.id ||
      weatherTechRecoveryList[0].company_id !== weatherTech.id ||
      weatherTechRecoveryList[0].upload_operation_key !== sharedOperationKey ||
      weatherTechRecoveryList[0].state !== "reserved" ||
      JSON.stringify(recoveryListKeys) !==
        JSON.stringify([
          "company_id",
          "lease_expires_at",
          "state",
          "upload_operation_key",
          "uploader_user_id",
        ])
    ) {
      throw new Error(
        "Recovery listing exposed unexpected fields, cross-company rows, or the wrong operation.",
      );
    }

    const activeDifferentRecoveryLeaseToken = randomUUID();
    requireSupabaseErrorCode(
      await weatherTechIdentity.client.rpc("wtos_begin_job_photo_upload", {
        ...weatherTechArgs,
        target_recovery_lease_token: activeDifferentRecoveryLeaseToken,
      }),
      "55P03",
      "Different-token active reservation heartbeat",
    );
    requireSupabaseErrorCode(
      await weatherTechIdentity.client.rpc(
        "wtos_claim_job_photo_upload_recovery",
        {
          target_company_id: weatherTech.id,
          target_upload_operation_key: sharedOperationKey,
          target_recovery_lease_token: activeDifferentRecoveryLeaseToken,
        },
      ),
      "55P03",
      "Different-token active recovery claim",
    );

    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc("wtos_begin_job_photo_upload", {
        ...weatherTechArgs,
        target_upload_request_fingerprint: "0".repeat(64),
      }),
      "Changed-fingerprint WeatherTech reservation replay",
    );

    await upload(
      weatherTechIdentity.client,
      weatherTechPath,
      "WeatherTech same-company private upload",
    );
    await upload(
      ihcIdentity.client,
      ihcPath,
      "IHC same-company private upload",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(weatherTechPath, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "Duplicate exact-path Storage upload",
    );

    if (!(await objectExists(weatherTechPath))) {
      throw new Error("Duplicate upload handling removed the original exact object.");
    }

    storagePaths.push(
      weatherTechToIhcUploadPath,
      ihcToWeatherTechUploadPath,
      anonymousUploadPath,
    );

    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(weatherTechToIhcUploadPath, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "WeatherTech-to-IHC upload",
    );
    requireSupabaseRefusal(
      await ihcIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(ihcToWeatherTechUploadPath, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "IHC-to-WeatherTech upload",
    );
    requireSupabaseRefusal(
      await anonymousClient.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(anonymousUploadPath, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "Anonymous job-photo upload",
    );

    if (
      (await objectExists(weatherTechToIhcUploadPath)) ||
      (await objectExists(ihcToWeatherTechUploadPath)) ||
      (await objectExists(anonymousUploadPath))
    ) {
      throw new Error("A cross-company or anonymous Storage upload created a private object.");
    }

    const weatherTechPreRegistrationList = requireSupabaseData(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .list(`${weatherTech.id}/job/${weatherTechJob.id}`, { limit: 20 }),
      "WeatherTech pre-registration photo list",
    );

    if (
      weatherTechPreRegistrationList.some((item) =>
        item.name.endsWith("same-name.png"),
      )
    ) {
      throw new Error("An unregistered job-photo object was visible in an authorized list.");
    }

    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .download(weatherTechPath),
      "WeatherTech pre-registration private download",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(weatherTechPath, 60),
      "WeatherTech pre-registration signed URL",
    );

    const concurrentWeatherTechRegistrations = await Promise.all([
      weatherTechIdentity.client.rpc("wtos_register_job_photo", weatherTechArgs),
      weatherTechIdentity.client.rpc("wtos_register_job_photo", weatherTechArgs),
    ]);
    const weatherTechRows = concurrentWeatherTechRegistrations.map(
      (registration, index) =>
        jobPhotoRpcRow(
          requireSupabaseData(
            registration,
            `Concurrent WeatherTech private photo registration ${index + 1}`,
          ),
          `Concurrent WeatherTech private photo registration ${index + 1}`,
        ),
    );
    const weatherTechRow = weatherTechRows[0];
    const ihcRow = jobPhotoRpcRow(
      requireSupabaseData(
        await ihcIdentity.client.rpc("wtos_register_job_photo", ihcArgs),
        "Register IHC private photo",
      ),
      "Register IHC private photo",
    );
    metadataIds.push(weatherTechRow.id, ihcRow.id);

    if (
      weatherTechRows.some((row) => row.id !== weatherTechRow.id) ||
      weatherTechRow.company_id !== weatherTech.id ||
      weatherTechRow.file_path !== weatherTechPath ||
      weatherTechRow.file_url !== null ||
      ihcRow.company_id !== ihc.id ||
      ihcRow.file_path !== ihcPath ||
      ihcRow.file_url !== null
    ) {
      throw new Error(
        "Concurrent/registered job-photo metadata violated idempotent private company scope.",
      );
    }

    const weatherTechRegisteredRows = requireSupabaseData(
      await serviceClient
        .from("job_photos")
        .select("id,file_path,file_url")
        .eq("company_id", weatherTech.id)
        .eq("upload_operation_key", sharedOperationKey),
      "Verify concurrent WeatherTech registration convergence",
    );

    if (
      weatherTechRegisteredRows.length !== 1 ||
      weatherTechRegisteredRows[0].id !== weatherTechRow.id ||
      weatherTechRegisteredRows[0].file_path !== weatherTechPath ||
      weatherTechRegisteredRows[0].file_url !== null
    ) {
      throw new Error(
        "Concurrent identical registration did not converge to one URL-free metadata row.",
      );
    }

    const [weatherTechCommittedOperation, ihcCommittedOperation] = await Promise.all([
      serviceClient
        .from("job_photo_upload_operations")
        .select("id,company_id,upload_operation_key,file_path,recovery_lease_token,recovery_lease_expires_at,state")
        .eq("company_id", weatherTech.id)
        .eq("upload_operation_key", sharedOperationKey)
        .single(),
      serviceClient
        .from("job_photo_upload_operations")
        .select("id,company_id,upload_operation_key,file_path,recovery_lease_token,recovery_lease_expires_at,state")
        .eq("company_id", ihc.id)
        .eq("upload_operation_key", sharedOperationKey)
        .single(),
    ]).then((operations) =>
      operations.map((operation, index) =>
        jobPhotoOperationRow(
          requireSupabaseData(
            operation,
            `${index === 0 ? "WeatherTech" : "IHC"} committed operation readback`,
          ),
          `${index === 0 ? "WeatherTech" : "IHC"} committed operation readback`,
          ["committed"],
        ),
      ),
    );

    if (
      weatherTechCommittedOperation.file_path !== weatherTechPath ||
      ihcCommittedOperation.file_path !== ihcPath
    ) {
      throw new Error("Committed operations changed their exact Storage paths.");
    }

    requireSupabaseRefusal(
      await weatherTechIdentity.client
        .from("job_photo_upload_operations")
        .select("id")
        .eq("id", weatherTechCommittedOperation.id),
      "Authenticated direct upload-operation read",
    );

    const weatherTechOwnList = requireSupabaseData(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .list(`${weatherTech.id}/job/${weatherTechJob.id}`, { limit: 20 }),
      "WeatherTech own photo list",
    );
    const weatherTechCrossList = await weatherTechIdentity.client.storage
      .from(JOB_PHOTO_BUCKET)
      .list(`${ihc.id}/job/${ihcJob.id}`, { limit: 20 });
    const ihcCrossList = await ihcIdentity.client.storage
      .from(JOB_PHOTO_BUCKET)
      .list(`${weatherTech.id}/job/${weatherTechJob.id}`, { limit: 20 });
    const anonymousList = await anonymousClient.storage
      .from(JOB_PHOTO_BUCKET)
      .list(`${weatherTech.id}/job/${weatherTechJob.id}`, { limit: 20 });

    if (!weatherTechOwnList.some((item) => item.name.endsWith("same-name.png"))) {
      throw new Error("WeatherTech same-company object was missing from its authorized list.");
    }

    if (
      (!weatherTechCrossList.error && weatherTechCrossList.data?.length) ||
      (!ihcCrossList.error && ihcCrossList.data?.length) ||
      (!anonymousList.error && anonymousList.data?.length)
    ) {
      throw new Error("Cross-company or anonymous Storage listing exposed a private job-photo object.");
    }

    requireSupabaseData(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .download(weatherTechPath),
      "WeatherTech own private download",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .download(ihcPath),
      "WeatherTech-to-IHC private download",
    );
    requireSupabaseRefusal(
      await ihcIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .download(weatherTechPath),
      "IHC-to-WeatherTech private download",
    );
    requireSupabaseRefusal(
      await anonymousClient.storage.from(JOB_PHOTO_BUCKET).download(weatherTechPath),
      "Anonymous private download",
    );
    requireSupabaseRefusal(
      await anonymousClient.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(weatherTechPath, 60),
      "Anonymous signed URL",
    );

    const publicUrl = anonymousClient.storage
      .from(JOB_PHOTO_BUCKET)
      .getPublicUrl(weatherTechPath).data.publicUrl;
    const publicResponse = await fetchImpl(publicUrl);

    if (publicResponse.ok) {
      throw new Error("Private job photo remained retrievable through a durable public URL.");
    }

    const signedUrl = requireSupabaseData(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(weatherTechPath, 60),
      "WeatherTech signed URL",
    ).signedUrl;

    if (!signedUrl || signedUrl.includes("/object/public/")) {
      throw new Error("Authorized job-photo access did not return a private signed URL.");
    }

    const signedToken = new URL(signedUrl).searchParams.get("token");
    const signedTokenPayload = signedToken?.split(".")[1];
    let signedTokenExpiresAt = null;

    try {
      signedTokenExpiresAt = Number(
        JSON.parse(
          Buffer.from(signedTokenPayload ?? "", "base64url").toString("utf8"),
        ).exp,
      );
    } catch {
      signedTokenExpiresAt = null;
    }

    const signedTokenRemainingSeconds =
      signedTokenExpiresAt === null
        ? null
        : signedTokenExpiresAt - Math.floor(Date.now() / 1000);

    if (
      !Number.isFinite(signedTokenRemainingSeconds) ||
      signedTokenRemainingSeconds <= 0 ||
      signedTokenRemainingSeconds > 65
    ) {
      throw new Error(
        "Authorized job-photo signed URL did not preserve the requested short expiry bound.",
      );
    }

    const signedResponse = await fetchImpl(signedUrl);

    if (!signedResponse.ok) {
      throw new Error(`Authorized signed job-photo download failed (${signedResponse.status}).`);
    }

    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(ihcPath, 60),
      "WeatherTech-to-IHC signed URL",
    );
    requireSupabaseRefusal(
      await ihcIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(weatherTechPath, 60),
      "IHC-to-WeatherTech signed URL",
    );

    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .update(weatherTechPath, JOB_PHOTO_CROSS_UPDATE_BYTES, {
          contentType: "image/png",
          upsert: false,
        }),
      "WeatherTech registered private update",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .update(ihcPath, JOB_PHOTO_CROSS_UPDATE_BYTES, {
          contentType: "image/png",
          upsert: false,
        }),
      "WeatherTech-to-IHC registered private update",
    );
    requireSupabaseRefusal(
      await ihcIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .update(weatherTechPath, JOB_PHOTO_CROSS_UPDATE_BYTES, {
          contentType: "image/png",
          upsert: false,
        }),
      "IHC-to-WeatherTech registered private update",
    );
    requireSupabaseRefusal(
      await anonymousClient.storage
        .from(JOB_PHOTO_BUCKET)
        .update(weatherTechPath, JOB_PHOTO_CROSS_UPDATE_BYTES, {
          contentType: "image/png",
          upsert: false,
        }),
      "Anonymous registered private update",
    );

    const weatherTechObjectAfterOwnUpdate = requireSupabaseData(
      await serviceClient.storage.from(JOB_PHOTO_BUCKET).download(weatherTechPath),
      "Verify WeatherTech object after registered update refusal",
    );
    const weatherTechBytesAfterOwnUpdate = Buffer.from(
      await weatherTechObjectAfterOwnUpdate.arrayBuffer(),
    );

    const ihcObjectAfterCrossUpdate = requireSupabaseData(
      await serviceClient.storage.from(JOB_PHOTO_BUCKET).download(ihcPath),
      "Verify IHC object after cross-company update",
    );
    const ihcBytesAfterCrossUpdate = Buffer.from(
      await ihcObjectAfterCrossUpdate.arrayBuffer(),
    );

    if (
      !weatherTechBytesAfterOwnUpdate.equals(JOB_PHOTO_TEST_PNG) ||
      !ihcBytesAfterCrossUpdate.equals(JOB_PHOTO_TEST_PNG)
    ) {
      throw new Error("A refused registered-object update altered private photo bytes.");
    }

    await weatherTechIdentity.client.storage
      .from(JOB_PHOTO_BUCKET)
      .remove([ihcPath]);
    await ihcIdentity.client.storage
      .from(JOB_PHOTO_BUCKET)
      .remove([weatherTechPath]);
    await anonymousClient.storage
      .from(JOB_PHOTO_BUCKET)
      .remove([weatherTechPath]);

    if (!(await objectExists(ihcPath)) || !(await objectExists(weatherTechPath))) {
      throw new Error("A cross-company delete removed a private job-photo object.");
    }

    const weatherTechReplay = jobPhotoRpcRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc("wtos_register_job_photo", weatherTechArgs),
        "Replay WeatherTech private photo registration",
      ),
      "Replay WeatherTech private photo registration",
    );

    if (weatherTechReplay.id !== weatherTechRow.id) {
      throw new Error("Exact WeatherTech registration retry created duplicate metadata.");
    }

    const committedOperationRetries = await Promise.all([
      weatherTechIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        weatherTechArgs,
      ),
      weatherTechIdentity.client.rpc(
        "wtos_cancel_job_photo_upload",
        weatherTechArgs,
      ),
      weatherTechIdentity.client.rpc(
        "wtos_confirm_job_photo_upload_abort",
        weatherTechArgs,
      ),
    ]);

    for (const [index, retry] of committedOperationRetries.entries()) {
      const operation = jobPhotoOperationRow(
        requireSupabaseData(
          retry,
          `Committed operation exact retry ${index + 1}`,
        ),
        `Committed operation exact retry ${index + 1}`,
        ["committed"],
      );

      if (operation.id !== weatherTechCommittedOperation.id) {
        throw new Error("Committed operation exact retry changed durable identity.");
      }
    }

    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc("wtos_register_job_photo", {
        ...weatherTechArgs,
        target_caption: `${weatherTechCaption} CHANGED`,
      }),
      "Changed-payload WeatherTech registration replay",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc("wtos_register_job_photo", ihcArgs),
      "WeatherTech-to-IHC metadata registration",
    );
    requireSupabaseRefusal(
      await ihcIdentity.client.rpc("wtos_register_job_photo", weatherTechArgs),
      "IHC-to-WeatherTech metadata registration",
    );

    const weatherTechCrossRows = requireSupabaseData(
      await weatherTechIdentity.client
        .from("job_photos")
        .select("id")
        .eq("id", ihcRow.id),
      "WeatherTech cross-company metadata read",
    );
    const ihcCrossRows = requireSupabaseData(
      await ihcIdentity.client
        .from("job_photos")
        .select("id")
        .eq("id", weatherTechRow.id),
      "IHC cross-company metadata read",
    );

    if (weatherTechCrossRows.length || ihcCrossRows.length) {
      throw new Error("Cross-company job-photo metadata was visible through RLS.");
    }

    requireSupabaseRefusal(
      await weatherTechIdentity.client
        .from("job_photos")
        .update({ file_path: `${weatherTechPath}-changed` })
        .eq("id", weatherTechRow.id)
        .select("id"),
      "Persisted job-photo path mutation",
    );

    const missingObject = buildScenario({
      job: weatherTechJob,
      suffix: "missing-object",
      caption: `TEST WTOS REGRESSION ${runId} MISSING OBJECT`,
    });
    jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          missingObject.args,
        ),
        "Begin missing-object upload reservation",
      ),
      "Begin missing-object upload reservation",
      ["reserved"],
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc(
        "wtos_register_job_photo",
        missingObject.args,
      ),
      "Metadata registration without exact Storage object",
    );
    await cancelRemoveAndConfirmAbort(
      weatherTechIdentity.client,
      missingObject.args,
      missingObject.path,
      "Missing-object upload",
    );

    const mismatch = buildScenario({
      job: weatherTechJob,
      suffix: "cross-company-relation",
      caption: `TEST WTOS REGRESSION ${runId} MISMATCHED RELATION`,
    });
    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc("wtos_begin_job_photo_upload", {
        ...mismatch.args,
        target_job_id: ihcJob.id,
      }),
      "Cross-company linked job upload reservation",
    );
    if (await objectExists(mismatch.path)) {
      throw new Error("Cross-company relation refusal left a Storage object.");
    }

    const badUrl = buildScenario({
      job: weatherTechJob,
      suffix: "bad-durable-url",
      caption: `TEST WTOS REGRESSION ${runId} BAD DURABLE URL`,
    });
    jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          badUrl.args,
        ),
        "Begin durable-URL refusal upload",
      ),
      "Begin durable-URL refusal upload",
      ["reserved"],
    );
    await upload(
      weatherTechIdentity.client,
      badUrl.path,
      "Seed nonpersisted-URL constraint object",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.from("job_photos").insert({
        company_id: weatherTech.id,
        job_id: weatherTechJob.id,
        caption: badUrl.args.target_caption,
        file_path: badUrl.path,
        file_url: "https://example.invalid/durable-job-photo.png",
        upload_operation_key: badUrl.operationKey,
        upload_request_fingerprint: badUrl.fingerprint,
      }),
      "Durable job-photo URL persistence",
    );
    await cancelRemoveAndConfirmAbort(
      weatherTechIdentity.client,
      badUrl.args,
      badUrl.path,
      "Durable-URL refusal upload",
    );

    const invalidFingerprint = buildScenario({
      job: weatherTechJob,
      suffix: "changed-fingerprint",
      caption: `TEST WTOS REGRESSION ${runId} CHANGED FINGERPRINT`,
    });
    jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          invalidFingerprint.args,
        ),
        "Begin changed-fingerprint upload",
      ),
      "Begin changed-fingerprint upload",
      ["reserved"],
    );
    await upload(
      weatherTechIdentity.client,
      invalidFingerprint.path,
      "Seed changed-fingerprint private object",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc("wtos_register_job_photo", {
        ...invalidFingerprint.args,
        target_upload_request_fingerprint: "0".repeat(64),
      }),
      "Changed-fingerprint metadata registration",
    );
    await cancelRemoveAndConfirmAbort(
      weatherTechIdentity.client,
      invalidFingerprint.args,
      invalidFingerprint.path,
      "Changed-fingerprint upload",
    );

    const lateUpload = buildScenario({
      job: weatherTechJob,
      suffix: "late-upload-denied",
      caption: `TEST WTOS REGRESSION ${runId} LATE UPLOAD DENIED`,
    });
    const lateReservation = jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          lateUpload.args,
        ),
        "Begin delayed-late upload reservation",
      ),
      "Begin delayed-late upload reservation",
      ["reserved"],
    );
    const lateCancellation = jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_cancel_job_photo_upload",
          lateUpload.args,
        ),
        "Cancel before delayed-late upload",
      ),
      "Cancel before delayed-late upload",
      ["canceling"],
    );
    if (lateCancellation.id !== lateReservation.id) {
      throw new Error("Cancel-before-upload changed durable operation identity.");
    }
    storagePaths.push(lateUpload.path);
    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(lateUpload.path, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "Delayed-late Storage upload after cancellation",
    );
    const lateAbort = await cancelRemoveAndConfirmAbort(
      weatherTechIdentity.client,
      lateUpload.args,
      lateUpload.path,
      "Delayed-late upload",
    );
    if (await objectExists(lateUpload.path)) {
      throw new Error("Delayed-late upload denial left a Storage object.");
    }
    const abortedRetries = await Promise.all([
      weatherTechIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        lateUpload.args,
      ),
      weatherTechIdentity.client.rpc(
        "wtos_cancel_job_photo_upload",
        lateUpload.args,
      ),
      weatherTechIdentity.client.rpc(
        "wtos_confirm_job_photo_upload_abort",
        lateUpload.args,
      ),
    ]);
    for (const [index, retry] of abortedRetries.entries()) {
      const operation = jobPhotoOperationRow(
        requireSupabaseData(retry, `Aborted operation exact retry ${index + 1}`),
        `Aborted operation exact retry ${index + 1}`,
        ["aborted"],
      );
      if (operation.id !== lateAbort.id) {
        throw new Error("Aborted operation exact retry changed durable identity.");
      }
    }
    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc(
        "wtos_register_job_photo",
        lateUpload.args,
      ),
      "Registration after confirmed upload abort",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc("wtos_begin_job_photo_upload", {
        ...lateUpload.args,
        target_upload_request_fingerprint: "f".repeat(64),
      }),
      "Changed-fingerprint aborted reservation replay",
    );
    requireSupabaseRefusal(
      await weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(lateUpload.path, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "Storage upload after confirmed terminal abort",
    );

    const uploadCancelRace = buildScenario({
      job: weatherTechJob,
      suffix: "upload-cancel-race",
      caption: `TEST WTOS REGRESSION ${runId} UPLOAD CANCEL RACE`,
    });
    jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          uploadCancelRace.args,
        ),
        "Begin upload-cancel race",
      ),
      "Begin upload-cancel race",
      ["reserved"],
    );
    storagePaths.push(uploadCancelRace.path);
    const [, uploadCancelResult] = await Promise.all([
      weatherTechIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(uploadCancelRace.path, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      weatherTechIdentity.client.rpc(
        "wtos_cancel_job_photo_upload",
        uploadCancelRace.args,
      ),
    ]);
    jobPhotoOperationRow(
      requireSupabaseData(uploadCancelResult, "Concurrent upload-cancel result"),
      "Concurrent upload-cancel result",
      ["canceling"],
    );
    await cancelRemoveAndConfirmAbort(
      weatherTechIdentity.client,
      uploadCancelRace.args,
      uploadCancelRace.path,
      "Concurrent upload-cancel race",
    );
    const uploadCancelRows = requireSupabaseData(
      await serviceClient
        .from("job_photos")
        .select("id")
        .eq("company_id", weatherTech.id)
        .eq("upload_operation_key", uploadCancelRace.operationKey),
      "Read concurrent upload-cancel metadata",
    );
    if (
      (await objectExists(uploadCancelRace.path)) ||
      uploadCancelRows.length !== 0
    ) {
      throw new Error("Concurrent upload-cancel race left object or metadata residue.");
    }

    const registerCancelRace = buildScenario({
      job: weatherTechJob,
      suffix: "register-cancel-race",
      caption: `TEST WTOS REGRESSION ${runId} REGISTER CANCEL RACE`,
    });
    jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          registerCancelRace.args,
        ),
        "Begin register-cancel race",
      ),
      "Begin register-cancel race",
      ["reserved"],
    );
    await upload(
      weatherTechIdentity.client,
      registerCancelRace.path,
      "Seed register-cancel race object",
    );
    const [raceRegistration, raceCancellation] = await Promise.all([
      weatherTechIdentity.client.rpc(
        "wtos_register_job_photo",
        registerCancelRace.args,
      ),
      weatherTechIdentity.client.rpc(
        "wtos_cancel_job_photo_upload",
        registerCancelRace.args,
      ),
    ]);
    const registerCancelState = await readScenarioState(
      weatherTech,
      registerCancelRace.operationKey,
      "Concurrent register-cancel race",
    );
    const registerCancelObjectExists = await objectExists(
      registerCancelRace.path,
    );
    let registrationCancelOutcome;

    if (registerCancelState.operation.state === "committed") {
      if (
        raceRegistration.error ||
        raceCancellation.error ||
        !registerCancelObjectExists ||
        registerCancelState.metadata.length !== 1 ||
        registerCancelState.metadata[0].file_path !== registerCancelRace.path ||
        registerCancelState.metadata[0].file_url !== null
      ) {
        throw new Error(
          "Committed register-cancel race did not preserve exactly one private object and metadata row.",
        );
      }
      metadataIds.push(registerCancelState.metadata[0].id);
      registrationCancelOutcome = "committed";
    } else if (registerCancelState.operation.state === "canceling") {
      if (!raceRegistration.error || raceCancellation.error) {
        throw new Error(
          "Canceling register-cancel race did not reject registration and accept cancellation.",
        );
      }
      await cancelRemoveAndConfirmAbort(
        weatherTechIdentity.client,
        registerCancelRace.args,
        registerCancelRace.path,
        "Concurrent register-cancel race",
      );
      const postAbortRows = requireSupabaseData(
        await serviceClient
          .from("job_photos")
          .select("id")
          .eq("company_id", weatherTech.id)
          .eq("upload_operation_key", registerCancelRace.operationKey),
        "Read aborted register-cancel race metadata",
      );
      if ((await objectExists(registerCancelRace.path)) || postAbortRows.length) {
        throw new Error(
          "Aborted register-cancel race left an orphan or dangling metadata row.",
        );
      }
      registrationCancelOutcome = "aborted";
    } else {
      throw new Error(
        `Register-cancel race reached invalid state ${registerCancelState.operation.state}.`,
      );
    }

    const revokedIdentity = await createScopedUser("revoked", weatherTech);
    const revokedUpload = buildScenario({
      job: weatherTechJob,
      suffix: "revoked-uploader-recovery",
      caption: `TEST WTOS REGRESSION ${runId} REVOKED UPLOADER RECOVERY`,
    });
    const revokedReservation = jobPhotoOperationRow(
      requireSupabaseData(
        await revokedIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          revokedUpload.args,
        ),
        "Begin pre-revocation upload",
      ),
      "Begin pre-revocation upload",
      ["reserved"],
    );
    await upload(
      revokedIdentity.client,
      revokedUpload.path,
      "Seed pre-revocation unregistered object",
    );
    requireSupabaseData(
      await serviceClient
        .from("company_memberships")
        .delete()
        .eq("user_id", revokedIdentity.user.id)
        .eq("company_id", weatherTech.id),
      "Revoke job-photo uploader company membership",
    );
    requireSupabaseData(
      await serviceClient
        .from("profiles")
        .update({ role: "team_member" })
        .eq("id", revokedIdentity.user.id),
      "Remove job-photo uploader privileged profile role",
    );

    const revokedExactReplay = jobPhotoOperationRow(
      requireSupabaseData(
        await revokedIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          revokedUpload.args,
        ),
        "Revoked uploader exact reservation replay",
      ),
      "Revoked uploader exact reservation replay",
      ["reserved"],
    );
    if (revokedExactReplay.id !== revokedReservation.id) {
      throw new Error("Revoked uploader exact replay changed operation identity.");
    }

    const revokedNewUpload = buildScenario({
      job: weatherTechJob,
      suffix: "revoked-new-upload-denied",
      caption: `TEST WTOS REGRESSION ${runId} REVOKED NEW UPLOAD DENIED`,
    });
    requireSupabaseRefusal(
      await revokedIdentity.client.rpc(
        "wtos_begin_job_photo_upload",
        revokedNewUpload.args,
      ),
      "Revoked uploader new reservation",
    );
    storagePaths.push(revokedNewUpload.path);
    requireSupabaseRefusal(
      await revokedIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .upload(revokedNewUpload.path, JOB_PHOTO_TEST_PNG, {
          contentType: "image/png",
          upsert: false,
        }),
      "Revoked uploader new Storage upload",
    );
    requireSupabaseRefusal(
      await revokedIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .download(revokedUpload.path),
      "Revoked uploader unregistered object read",
    );
    const revokedList = await revokedIdentity.client.storage
      .from(JOB_PHOTO_BUCKET)
      .list(`${weatherTech.id}/job/${weatherTechJob.id}`, { limit: 20 });
    if (
      !revokedList.error &&
      revokedList.data?.some((item) =>
        revokedUpload.path.endsWith(`/${item.name}`),
      )
    ) {
      throw new Error("Revoked uploader could list its unregistered object.");
    }
    requireSupabaseRefusal(
      await revokedIdentity.client.storage
        .from(JOB_PHOTO_BUCKET)
        .createSignedUrl(revokedUpload.path, 60),
      "Revoked uploader unregistered object signed URL",
    );
    requireSupabaseRefusal(
      await revokedIdentity.client.rpc(
        "wtos_register_job_photo",
        revokedUpload.args,
      ),
      "Revoked uploader metadata registration",
    );
    requireSupabaseRefusal(
      await revokedIdentity.client.rpc(
        "wtos_cancel_job_photo_upload",
        weatherTechArgs,
      ),
      "Revoked uploader cancellation of another operation",
    );
    requireSupabaseRefusal(
      await revokedIdentity.client.rpc(
        "wtos_cancel_job_photo_upload",
        ihcArgs,
      ),
      "Revoked uploader cross-company cancellation",
    );
    await revokedIdentity.client.storage
      .from(JOB_PHOTO_BUCKET)
      .remove([weatherTechPath, ihcPath]);
    if (
      !(await objectExists(weatherTechPath)) ||
      !(await objectExists(ihcPath))
    ) {
      throw new Error(
        "Revoked uploader removed another user's or company's registered object.",
      );
    }
    const revokedAbort = await cancelRemoveAndConfirmAbort(
      revokedIdentity.client,
      revokedUpload.args,
      revokedUpload.path,
      "Revoked original-uploader recovery",
    );
    if (
      revokedAbort.state !== "aborted" ||
      (await objectExists(revokedUpload.path))
    ) {
      throw new Error(
        "Revoked original uploader did not finish an exact zero-object abort.",
      );
    }
    const revokedMetadata = requireSupabaseData(
      await serviceClient
        .from("job_photos")
        .select("id")
        .eq("company_id", weatherTech.id)
        .eq("upload_operation_key", revokedUpload.operationKey),
      "Read revoked-uploader recovery metadata",
    );
    if (revokedMetadata.length) {
      throw new Error("Revoked original-uploader recovery left metadata.");
    }

    const interruptedRecovery = buildScenario({
      job: weatherTechJob,
      suffix: "expired-lease-recovery",
      caption: `TEST WTOS REGRESSION ${runId} EXPIRED LEASE RECOVERY`,
    });
    const interruptedReservation = jobPhotoOperationRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_begin_job_photo_upload",
          interruptedRecovery.args,
        ),
        "Begin interrupted upload for lease recovery",
      ),
      "Begin interrupted upload for lease recovery",
      ["reserved"],
    );
    if (
      interruptedReservation.recovery_lease_token !==
      interruptedRecovery.recoveryLeaseToken
    ) {
      throw new Error("Interrupted upload reservation changed its recovery token.");
    }
    await upload(
      weatherTechIdentity.client,
      interruptedRecovery.path,
      "Seed interrupted upload object for lease recovery",
    );

    const interruptedRecoveryList = requireSupabaseData(
      await weatherTechIdentity.client.rpc(
        "wtos_list_my_job_photo_upload_recoveries",
        {},
      ),
      "List interrupted upload recovery without PII",
    );
    const interruptedRecoveryRow = interruptedRecoveryList.find(
      (recovery) =>
        recovery.company_id === weatherTech.id &&
        recovery.upload_operation_key === interruptedRecovery.operationKey,
    );
    const interruptedRecoveryKeys = Object.keys(
      interruptedRecoveryRow ?? {},
    ).sort();

    if (
      interruptedRecoveryRow?.state !== "reserved" ||
      JSON.stringify(interruptedRecoveryKeys) !==
        JSON.stringify([
          "company_id",
          "lease_expires_at",
          "state",
          "upload_operation_key",
          "uploader_user_id",
        ])
    ) {
      throw new Error(
        "Interrupted-upload recovery list exposed PII or omitted its safe operation identity.",
      );
    }

    requireSupabaseRefusal(
      await weatherTechIdentity.client.rpc(
        "wtos_expire_job_photo_upload_recovery_lease",
        {
          target_company_id: weatherTech.id,
          target_upload_operation_key: interruptedRecovery.operationKey,
          target_uploader_user_id: weatherTechIdentity.user.id,
        },
      ),
      "Authenticated recovery lease expiry",
    );
    requireSupabaseRefusal(
      await serviceClient.rpc(
        "wtos_expire_job_photo_upload_recovery_lease",
        {
          target_company_id: weatherTech.id,
          target_upload_operation_key: interruptedRecovery.operationKey,
          target_uploader_user_id: ihcIdentity.user.id,
        },
      ),
      "Service-role recovery lease expiry with wrong uploader",
    );
    const expiredLeaseAt = requireSupabaseData(
      await serviceClient.rpc(
        "wtos_expire_job_photo_upload_recovery_lease",
        {
          target_company_id: weatherTech.id,
          target_upload_operation_key: interruptedRecovery.operationKey,
          target_uploader_user_id: weatherTechIdentity.user.id,
        },
      ),
      "Service-role exact recovery lease expiry",
    );

    if (!Number.isFinite(Date.parse(expiredLeaseAt))) {
      throw new Error("Service-role exact lease expiry returned no timestamp.");
    }

    const replacementRecoveryLeaseToken = randomUUID();
    const recoveryClaimArgs = {
      target_company_id: weatherTech.id,
      target_upload_operation_key: interruptedRecovery.operationKey,
      target_recovery_lease_token: replacementRecoveryLeaseToken,
    };
    const claimedRecovery = jobPhotoRecoveryClaimRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_claim_job_photo_upload_recovery",
          recoveryClaimArgs,
        ),
        "Claim expired interrupted upload",
      ),
      "Claim expired interrupted upload",
      ["canceling"],
    );

    if (claimedRecovery.file_path !== interruptedRecovery.path) {
      throw new Error("Expired-lease recovery claim returned the wrong exact path.");
    }

    requireSupabaseErrorCode(
      await weatherTechIdentity.client.rpc("wtos_begin_job_photo_upload", {
        ...interruptedRecovery.args,
        target_recovery_lease_token:
          interruptedRecovery.recoveryLeaseToken,
      }),
      "55P03",
      "Prior-token heartbeat after lease recovery rotation",
    );
    await requirePromptJobPhotoResidueRefusal(
      () =>
        weatherTechIdentity.client.rpc(
          "wtos_confirm_job_photo_upload_recovery_abort",
          recoveryClaimArgs,
        ),
      "Promptly refuse claimed interrupted upload abort with residue",
    );
    await removeExactStorageObject(
      weatherTechIdentity.client,
      interruptedRecovery.path,
      "Remove exact claimed interrupted upload object",
    );
    const recoveredState = requireSupabaseData(
      await retryExactSupabaseRpc(
        () =>
          weatherTechIdentity.client.rpc(
            "wtos_confirm_job_photo_upload_recovery_abort",
            recoveryClaimArgs,
        ),
        "Confirm claimed interrupted upload abort",
        {
          readConvergedResult: async () => {
            const claimReplay = await weatherTechIdentity.client.rpc(
              "wtos_claim_job_photo_upload_recovery",
              recoveryClaimArgs,
            );
            const claim = Array.isArray(claimReplay.data)
              ? claimReplay.data[0]
              : claimReplay.data;

            return !claimReplay.error &&
              ["committed", "aborted"].includes(claim?.state)
              ? { ...claimReplay, data: claim.state }
              : null;
          },
        },
      ),
      "Confirm claimed interrupted upload abort",
    );

    if (recoveredState !== "aborted") {
      throw new Error(
        `Interrupted upload recovery returned ${String(recoveredState)} instead of aborted.`,
      );
    }

    const terminalRecoveryClaim = jobPhotoRecoveryClaimRow(
      requireSupabaseData(
        await weatherTechIdentity.client.rpc(
          "wtos_claim_job_photo_upload_recovery",
          recoveryClaimArgs,
        ),
        "Replay terminal interrupted upload claim",
      ),
      "Replay terminal interrupted upload claim",
      ["aborted"],
    );
    const terminalRecoveryConfirmation = requireSupabaseData(
      await weatherTechIdentity.client.rpc(
        "wtos_confirm_job_photo_upload_recovery_abort",
        recoveryClaimArgs,
      ),
      "Replay terminal interrupted upload confirmation",
    );
    const postRecoveryList = requireSupabaseData(
      await weatherTechIdentity.client.rpc(
        "wtos_list_my_job_photo_upload_recoveries",
        {},
      ),
      "List upload recoveries after terminal abort",
    );

    if (
      terminalRecoveryClaim.file_path !== null ||
      terminalRecoveryConfirmation !== "aborted" ||
      postRecoveryList.some(
        (recovery) =>
          recovery.company_id === weatherTech.id &&
          recovery.upload_operation_key === interruptedRecovery.operationKey,
      ) ||
      (await objectExists(interruptedRecovery.path))
    ) {
      throw new Error(
        "Expired-lease recovery did not converge to an idempotent, unlisted, zero-object abort.",
      );
    }
    requireSupabaseRefusal(
      await serviceClient.rpc(
        "wtos_expire_job_photo_upload_recovery_lease",
        {
          target_company_id: weatherTech.id,
          target_upload_operation_key: interruptedRecovery.operationKey,
          target_uploader_user_id: weatherTechIdentity.user.id,
        },
      ),
      "Service-role expiry of terminal recovery lease",
    );

    const customerDocumentBucketAfter = requireSupabaseData(
      await serviceClient.storage.getBucket(CUSTOMER_DOCUMENT_BUCKET),
      "Re-read customer-document compatibility bucket",
    );
    const customerDocumentContract = (bucket) => ({
      allowedMimeTypes:
        bucket.allowed_mime_types ?? bucket.allowedMimeTypes ?? null,
      fileSizeLimit: bucket.file_size_limit ?? bucket.fileSizeLimit ?? null,
      id: bucket.id,
      name: bucket.name,
      public: bucket.public,
    });

    if (
      JSON.stringify(customerDocumentContract(customerDocumentBucketBefore)) !==
      JSON.stringify(customerDocumentContract(customerDocumentBucketAfter))
    ) {
      throw new Error("Job-photo lifecycle changed the customer-documents bucket contract.");
    }

    result = {
      anonymousDenied: true,
      authorizedSignedRead: true,
      companyIsolation: "both-directions",
      concurrentRetryConverged: true,
      customerDocumentsUnchanged: true,
      deterministicRetry: true,
      durableUrlRejected: true,
      durableReservation: true,
      lateUploadDenied: true,
      metadataStorageCoupling: true,
      noPiiRecoveryList: true,
      preRegistrationAccessDenied: true,
      recoveryLeaseHeartbeat: true,
      recoveryLeaseTakeover: true,
      registerCancelRace: registrationCancelOutcome,
      registeredObjectBytesImmutable: true,
      revokedRoleRecovery: true,
      signedUrlShortExpiryVerified: true,
      activeDifferentTokenDenied: true,
      serviceRoleExactLeaseExpiry: true,
      terminalRetryConverged: true,
      uploadCancelRaceAborted: true,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupErrors = [];

    try {
      const exactPaths = [...new Set(storagePaths)];
      if (exactPaths.length > 0) {
        requireSupabaseData(
          await serviceClient.storage.from(JOB_PHOTO_BUCKET).remove(exactPaths),
          "Remove exact job-photo lifecycle objects before metadata",
        );

        for (const path of exactPaths) {
          if (await objectExists(path)) {
            throw new Error("Exact job-photo Storage cleanup left an object behind.");
          }
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      if (metadataIds.length > 0) {
        requireSupabaseData(
          await serviceClient.from("job_photos").delete().in("id", metadataIds),
          "Delete exact job-photo lifecycle metadata after Storage cleanup",
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      if (userIds.length > 0) {
        const operationRows = requireSupabaseData(
          await serviceClient
            .from("job_photo_upload_operations")
            .select("id")
            .in("uploader_user_id", userIds),
          "Find exact job-photo lifecycle upload operations",
        );
        const operationIds = operationRows.map((operation) => operation.id);

        if (operationIds.length > 0) {
          requireSupabaseData(
            await serviceClient
              .from("job_photo_upload_operations")
              .delete()
              .in("id", operationIds),
            "Delete exact job-photo upload operations after metadata cleanup",
          );
        }

        const remainingOperationRows = requireSupabaseData(
          await serviceClient
            .from("job_photo_upload_operations")
            .select("id")
            .in("uploader_user_id", userIds),
          "Verify exact job-photo upload-operation cleanup",
        );

        if (remainingOperationRows.length > 0) {
          throw new Error("Exact job-photo lifecycle cleanup left an upload operation behind.");
        }
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      requireSupabaseData(
        await serviceClient
          .from("jobs")
          .delete()
          .in("id", [weatherTechJobId, ihcJobId]),
        "Delete exact job-photo lifecycle jobs",
      );
    } catch (error) {
      cleanupErrors.push(error);
    }

    try {
      if (userIds.length > 0) {
        requireSupabaseData(
          await serviceClient.from("company_memberships").delete().in("user_id", userIds),
          "Delete exact job-photo lifecycle memberships",
        );
        requireSupabaseData(
          await serviceClient.from("profiles").delete().in("id", userIds),
          "Delete exact job-photo lifecycle profiles",
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }

    for (const userId of userIds) {
      try {
        requireSupabaseData(
          await serviceClient.auth.admin.deleteUser(userId),
          "Delete exact job-photo lifecycle Auth user",
        );
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (cleanupErrors.length > 0) {
      if (primaryError) {
        throw new AggregateError(
          [primaryError, ...cleanupErrors],
          "Job-photo lifecycle failed and exact cleanup also failed.",
        );
      }

      throw new AggregateError(cleanupErrors, "Exact job-photo lifecycle cleanup failed.");
    }
  }

  if (primaryError) {
    throw primaryError;
  }

  if (!result) {
    throw new Error("Job-photo Storage lifecycle did not produce a verified result.");
  }

  return result;
}

async function lifecycleProbe(config, fetchImpl) {
  const companies = await verifyCredentialTarget(config, fetchImpl);
  await verifyOwnerState(config, fetchImpl, companies);
  await verifyProviderIsolation(config, fetchImpl);
  const before = await getResidue(config, fetchImpl);
  assertZeroCounts(before, "Regression run residue before lifecycle probe");

  const weatherTech = companies.find((company) => company.name === "WeatherTech Roofing LLC");
  const id = randomUUID();
  const title = `TEST WTOS REGRESSION LIFECYCLE ${id}`;
  let writeAttempted = false;
  let probeVerified = false;
  let primaryError = null;

  try {
    const collisionCount = await restCount(
      config,
      fetchImpl,
      "notifications",
      `select=id&id=eq.${encodeURIComponent(id)}`,
    );
    assertZeroCounts({ notification_id_collision: collisionCount }, "Lifecycle probe collision check");
    writeAttempted = true;
    const inserted = await restInsert(config, fetchImpl, "notifications", [
      {
        id,
        company_id: weatherTech.id,
        title,
        message: "Synthetic non-production lifecycle probe. No provider delivery is allowed.",
        channel: "in_app",
        status: "queued",
      },
    ]);

    if (!Array.isArray(inserted) || inserted.length !== 1 || inserted[0].id !== id) {
      throw new Error("Lifecycle probe did not return the exact captured notification ID.");
    }

    const exactRows = await restSelect(
      config,
      fetchImpl,
      "notifications",
      `select=id,title,company_id&id=eq.${encodeURIComponent(id)}`,
    );

    if (
      exactRows.length !== 1 ||
      exactRows[0].title !== title ||
      exactRows[0].company_id !== weatherTech.id
    ) {
      throw new Error("Lifecycle probe row did not match its captured ID, marker, and company.");
    }

    probeVerified = true;
  } catch (error) {
    primaryError = error;
  } finally {
    if (writeAttempted) {
      try {
        await restDeleteExactId(config, fetchImpl, "notifications", id);
      } catch (cleanupError) {
        if (primaryError) {
          throw new AggregateError(
            [primaryError, cleanupError],
            "Lifecycle probe failed and exact-ID cleanup also failed.",
          );
        }

        throw cleanupError;
      }
    }
  }

  const jobPhotoStorage = primaryError
    ? null
    : await jobPhotoStorageLifecycleProbe(config, fetchImpl, companies);

  const exactResidue = await restCount(
    config,
    fetchImpl,
    "notifications",
    `select=id&id=eq.${encodeURIComponent(id)}`,
  );
  const after = await getResidue(config, fetchImpl);
  assertZeroCounts({ exact_probe_id: exactResidue }, "Lifecycle probe exact-ID residue");
  assertZeroCounts(after, "Regression run residue after lifecycle probe");

  if (primaryError) {
    throw primaryError;
  }

  if (!probeVerified) {
    throw new Error("Lifecycle probe did not complete its write/read verification.");
  }

  return {
    command: "lifecycle-probe",
    exactIdCleanupVerified: true,
    jobPhotoStorage,
    providerSideEffects: false,
    residueCount: 0,
    target: config.projectRef,
    writeReadDeleteVerified: true,
  };
}

async function cleanupOwner(config, fetchImpl) {
  const companies = await verifyCredentialTarget(config, fetchImpl);
  const user = await findRegressionOwner(config, fetchImpl);

  if (!user) {
    return { command: "cleanup-owner", ownerDeleted: false, target: config.projectRef };
  }

  assertOwnedRegressionUser(user, config);
  await verifyOwnerState(config, fetchImpl, companies);
  const residueCounts = await getResidue(config, fetchImpl);
  assertZeroCounts(residueCounts, "Regression run residue");

  const referenceCounts = {};

  for (const [table, column] of OWNER_REFERENCE_PROBES) {
    referenceCounts[`${table}.${column}`] = await restCount(
      config,
      fetchImpl,
      table,
      `select=id&${column}=eq.${encodeURIComponent(user.id)}`,
    );
  }

  assertZeroCounts(referenceCounts, "Synthetic owner non-bootstrap references");
  await requestJson(
    fetchImpl,
    `${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(user.id)}`,
    { key: config.serviceRoleKey, method: "DELETE" },
  );

  const remainingProfiles = await restCount(
    config,
    fetchImpl,
    "profiles",
    `select=id&id=eq.${encodeURIComponent(user.id)}`,
  );
  const remainingMemberships = await restCount(
    config,
    fetchImpl,
    "company_memberships",
    `select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,
  );
  assertZeroCounts(
    { profiles: remainingProfiles, memberships: remainingMemberships },
    "Synthetic owner cleanup",
  );

  return { command: "cleanup-owner", ownerDeleted: true, target: config.projectRef };
}

export async function runRegressionEnvironmentCommand({
  command,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (
    !["bootstrap", "cleanup-owner", "lifecycle-probe", "verify", "verify-residue"].includes(
      command,
    )
  ) {
    throw new Error(
      "Usage: node scripts/regression-environment.mjs <bootstrap|verify|verify-residue|lifecycle-probe|cleanup-owner>",
    );
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("A Fetch API implementation is required.");
  }

  const config = validateRegressionEnvironment(env);

  if (command === "bootstrap") {
    return bootstrap(config, fetchImpl);
  }

  if (command === "verify") {
    return verify(config, fetchImpl);
  }

  if (command === "verify-residue") {
    return verifyResidue(config, fetchImpl);
  }

  if (command === "lifecycle-probe") {
    return lifecycleProbe(config, fetchImpl);
  }

  return cleanupOwner(config, fetchImpl);
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runRegressionEnvironmentCommand({ command: process.argv[2] })
    .then((result) => {
      console.log(`WeatherTech OS regression environment ${result.command}: PASS`);
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(
        `WeatherTech OS regression environment: FAIL: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
