#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const REGRESSION_SUPABASE_PROJECT_REF = "hygtnhmmaoboduqghhwg";
export const PRODUCTION_SUPABASE_PROJECT_REF = "gahfcgyjtfwwmsterhzu";
export const REGRESSION_OWNER_MARKER = "weathertech-os-regression-owner-v1";

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
  ["job_photos", "caption"],
  ["jobs", "title"],
  ["lead_intake_records", "contact_name"],
  ["lead_intake_records", "provider_event_id"],
  ["leads", "contact_name"],
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
  ["leads", "created_by"],
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
