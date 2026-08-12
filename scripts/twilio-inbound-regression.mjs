#!/usr/bin/env node

import crypto, { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server.js";
import twilio from "twilio";
import {
  BROWSER_REGRESSION_ENV_FILE,
  loadBrowserRegressionEnvironment,
} from "../tests/codex-browser/regression-runtime.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF as SHARED_PRODUCTION_PROJECT_REF,
  REGRESSION_SUPABASE_PROJECT_REF as SHARED_REGRESSION_PROJECT_REF,
  runRegressionEnvironmentCommand,
  validateRegressionEnvironment,
} from "./regression-environment.mjs";

export const TWILIO_INBOUND_REGRESSION_RUN =
  "WTOS_TWILIO_INBOUND_REGRESSION_RUN";
export const TWILIO_REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg";
export const TWILIO_PRODUCTION_PROJECT_REF = "gahfcgyjtfwwmsterhzu";

const TEST_ACCOUNT_SID_PREFIX = "AC";
const TEST_MESSAGING_SERVICE_SID_PREFIX = "MG";
const CANONICAL_PUBLIC_BASE_URL = "https://twilio-regression.weathertech.invalid";
const LOCAL_REQUEST_URL =
  "http://127.0.0.1:3000/api/integrations/twilio/webhook";
const WEBHOOK_PATH = "/api/integrations/twilio/webhook";
const WEATHERTECH_NUMBER = "+12025550101";
const IHC_UNMAPPED_NUMBER = "+12025550102";
const KNOWN_CUSTOMER_SENDER = "+12025550110";
const KNOWN_SENDER = "+12025550111";
const UNKNOWN_SENDER = "+12025550112";
const AMBIGUOUS_SENDER = "+12025550113";
const IHC_ONLY_SENDER = "+12025550114";

const HANDLER_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PUBLIC_BASE_URL",
  "TWILIO_INBOUND_SMS_ENABLED",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_NUMBER",
  "TWILIO_IHC_NUMBER",
];

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function deterministicUuid(namespace, ...parts) {
  const bytes = crypto
    .createHash("sha256")
    .update([namespace, ...parts].join("\u0000"), "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function syntheticSid(prefix, runId, label) {
  return `${prefix}${crypto.createHash("sha256").update(`${runId}:${label}`).digest("hex").slice(0, 32)}`;
}

function snapshotEnvironment(names) {
  return Object.fromEntries(names.map((name) => [name, process.env[name]]));
}

function restoreEnvironment(snapshot) {
  for (const [name, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
}

export function loadTwilioInboundRegressionEnvironment({
  cwd,
  runtimeEnv = process.env,
} = {}) {
  requireCondition(cwd, "Twilio inbound regression requires an explicit repository path.");
  const externalPath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();

  requireCondition(
    externalPath && isAbsolute(externalPath),
    `${BROWSER_REGRESSION_ENV_FILE} must name a secure absolute environment file outside the repository. This runner never reads .env.local.`,
  );
  requireCondition(
    !runtimeEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    `Twilio inbound regression accepts target credentials only from ${BROWSER_REGRESSION_ENV_FILE}.`,
  );

  const loaded = loadBrowserRegressionEnvironment({
    cwd,
    runtimeEnv,
    remoteWritesEnabled: true,
  });
  requireCondition(
    loaded.source === "external_file",
    "Twilio inbound regression requires the secure external-file credential source.",
  );
  const config = validateRegressionEnvironment(loaded.environment);
  requireCondition(
    SHARED_REGRESSION_PROJECT_REF === TWILIO_REGRESSION_PROJECT_REF &&
      SHARED_PRODUCTION_PROJECT_REF === TWILIO_PRODUCTION_PROJECT_REF,
    "Twilio inbound regression project constants disagree with the shared target guard.",
  );
  requireCondition(
    config.projectRef === TWILIO_REGRESSION_PROJECT_REF,
    "Twilio inbound regression target is not the approved regression project.",
  );
  requireCondition(
    !config.supabaseUrl.includes(TWILIO_PRODUCTION_PROJECT_REF),
    "Production Supabase is permanently prohibited as a Twilio regression target.",
  );

  return { config, environment: loaded.environment, source: loaded.source };
}

function createNetworkGuard(fetchImpl, allowedOrigin) {
  const counters = {
    allowedSupabaseRequests: 0,
    blockedExternalRequests: 0,
  };
  const guardedFetch = async (input, init) => {
    const rawUrl =
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input?.url;
    const url = new URL(rawUrl);

    if (url.origin !== allowedOrigin) {
      counters.blockedExternalRequests += 1;
      throw new Error(
        "Twilio inbound regression blocked a non-regression network request before transmission.",
      );
    }

    counters.allowedSupabaseRequests += 1;
    return fetchImpl(input, init);
  };

  return { counters, guardedFetch };
}

function compileWebhookRoute(cwd) {
  const outputDirectory = mkdtempSync(
    join(cwd, ".weathertech-twilio-inbound-route-"),
  );
  const compile = spawnSync(
    join(cwd, "node_modules", ".bin", "tsc"),
    [
      "app/api/integrations/twilio/webhook/route.ts",
      "--target",
      "ES2022",
      "--module",
      "commonjs",
      "--moduleResolution",
      "node",
      "--skipLibCheck",
      "--esModuleInterop",
      "--outDir",
      outputDirectory,
    ],
    { cwd, encoding: "utf8" },
  );

  if (compile.status !== 0) {
    rmSync(outputDirectory, { recursive: true, force: true });
    throw new Error(
      `Could not compile the Twilio inbound route.\n${compile.stdout}\n${compile.stderr}`,
    );
  }

  return {
    outputDirectory,
    routePath: join(
      outputDirectory,
      "app",
      "api",
      "integrations",
      "twilio",
      "webhook",
      "route.js",
    ),
  };
}

async function requireRows(query, label) {
  const { data, error } = await query;

  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }

  return data ?? [];
}

async function assertNoRows(query, label) {
  const rows = await requireRows(query, label);
  requireCondition(rows.length === 0, `${label} found ${rows.length} conflicting row(s).`);
}

async function insertRows(client, table, rows) {
  const inserted = await requireRows(
    client.from(table).insert(rows).select("*"),
    `Insert ${table}`,
  );
  requireCondition(
    inserted.length === rows.length,
    `Insert ${table} returned ${inserted.length} rows for ${rows.length} exact fixtures.`,
  );
  return inserted;
}

async function deleteExactIds(client, table, ids) {
  if (!ids.length) {
    return;
  }

  const { error } = await client.from(table).delete().in("id", ids);
  if (error) {
    throw new Error(`Exact-ID cleanup failed for ${table}: ${error.message}`);
  }
}

async function assertExactIdsAbsent(client, table, ids, label) {
  if (!ids.length) {
    return;
  }

  await assertNoRows(
    client.from(table).select("id").in("id", ids),
    `${label} exact-ID residue`,
  );
}

function installHandlerEnvironment(environment, fixture) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = environment.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = environment.SUPABASE_SERVICE_ROLE_KEY;
  process.env.TWILIO_ACCOUNT_SID = fixture.accountSid;
  process.env.TWILIO_AUTH_TOKEN = fixture.authToken;
  process.env.TWILIO_MESSAGING_SERVICE_SID = fixture.messagingServiceSid;
  process.env.TWILIO_PUBLIC_BASE_URL = CANONICAL_PUBLIC_BASE_URL;
  process.env.TWILIO_INBOUND_SMS_ENABLED = "true";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER = WEATHERTECH_NUMBER;
  delete process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER;
  process.env.TWILIO_IHC_NUMBER = IHC_UNMAPPED_NUMBER;
}

function signedInboundRequest(fixture, overrides = {}, { reverseOrder = false } = {}) {
  const values = {
    AccountSid: fixture.accountSid,
    MessageSid: fixture.messageSid,
    SmsSid: fixture.messageSid,
    SmsMessageSid: fixture.messageSid,
    MessagingServiceSid: fixture.messagingServiceSid,
    From: fixture.from,
    To: fixture.to,
    Body: fixture.body,
    NumMedia: "0",
    ...overrides,
  };
  const signature = twilio.getExpectedTwilioSignature(
    fixture.authToken,
    `${CANONICAL_PUBLIC_BASE_URL}${WEBHOOK_PATH}`,
    values,
  );
  const entries = Object.entries(values);
  const params = new URLSearchParams(reverseOrder ? entries.reverse() : entries);

  return new NextRequest(LOCAL_REQUEST_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: params.toString(),
  });
}

function expectedMessageId(messageSid) {
  return deterministicUuid("wtos:twilio:sms:v1", messageSid);
}

function expectedEventId(messageSid) {
  return deterministicUuid("wtos:twilio:event:v1", messageSid);
}

function createPayloadFingerprint(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

function createEvidenceProof(authToken, input) {
  return crypto
    .createHmac("sha256", authToken)
    .update(JSON.stringify({ version: 1, ...input }), "utf8")
    .digest("hex");
}

function createSignatureEvidence(fixture) {
  const values = {
    AccountSid: fixture.accountSid,
    MessageSid: fixture.messageSid,
    SmsSid: fixture.messageSid,
    SmsMessageSid: fixture.messageSid,
    MessagingServiceSid: fixture.messagingServiceSid,
    From: fixture.from,
    To: fixture.to,
    Body: fixture.body,
    NumMedia: "0",
  };
  return crypto
    .createHmac("sha256", fixture.authToken)
    .update(
      JSON.stringify({
        canonicalUrl: `${CANONICAL_PUBLIC_BASE_URL}${WEBHOOK_PATH}`,
        formFingerprint: crypto
          .createHash("sha256")
          .update(
            JSON.stringify(
              Object.entries(values).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
                const keyOrder = leftKey.localeCompare(rightKey);
                return keyOrder || leftValue.localeCompare(rightValue);
              }),
            ),
            "utf8",
          )
          .digest("hex"),
      }),
      "utf8",
    )
    .digest("hex");
}

async function invokeWebhook(
  post,
  fixture,
  testCase,
  expectedStatus,
  overrides = {},
  requestOptions = {},
) {
  const response = await post(signedInboundRequest(fixture, overrides, requestOptions));
  const responseBody = await response.text();

  requireCondition(
    response.status === expectedStatus,
    `${testCase} returned HTTP ${response.status}; expected ${expectedStatus}.`,
  );
  if (expectedStatus === 200) {
    requireCondition(
      responseBody === "<Response></Response>",
      `${testCase} did not return the empty inbound TwiML acknowledgement.`,
    );
  }
  requireCondition(
    !responseBody.includes(fixture.authToken) && !responseBody.includes(fixture.body),
    `${testCase} response exposed protected request data.`,
  );

  return { case: testCase, status: response.status };
}

async function verifyStoredCase({
  client,
  fixture,
  expectedCompanyId,
  expectedCustomerId,
  expectedLeadId,
  expectedContactStatus,
}) {
  const messages = await requireRows(
    client
      .from("sms_messages")
      .select("*")
      .eq("twilio_message_sid", fixture.messageSid),
    `Read message ${fixture.messageSid.slice(0, 6)}`,
  );
  requireCondition(messages.length === 1, "Inbound MessageSid did not resolve to exactly one message.");
  const message = messages[0];
  requireCondition(message.id === expectedMessageId(fixture.messageSid), "Inbound message ID was not deterministic.");
  requireCondition(message.company_id === expectedCompanyId, "Inbound message company routing was incorrect.");
  requireCondition(message.lead_id === expectedLeadId, "Inbound message lead association was incorrect.");
  requireCondition(message.customer_id === expectedCustomerId, "Inbound message customer association was incorrect.");
  requireCondition(message.direction === "inbound", "Stored Twilio message was not inbound.");
  requireCondition(message.delivery_status === "received", "Stored Twilio message was not received.");
  requireCondition(message.metadata?.contact_match_status === expectedContactStatus, "Stored contact-match status was incorrect.");
  requireCondition(message.metadata?.ingestion_status === "complete", "Inbound message ingestion did not converge to complete.");

  const events = await requireRows(
    client
      .from("communication_provider_events")
      .select("*")
      .eq("provider", "twilio")
      .eq("event_type", "sms_inbound")
      .eq("provider_event_sid", fixture.messageSid),
    `Read event ${fixture.messageSid.slice(0, 6)}`,
  );
  requireCondition(events.length === 1, "Inbound MessageSid did not resolve to exactly one provider event.");
  const event = events[0];
  requireCondition(event.id === expectedEventId(fixture.messageSid), "Inbound provider-event ID was not deterministic.");
  requireCondition(event.company_id === expectedCompanyId, "Provider-event company routing was incorrect.");
  requireCondition(event.sms_message_id === message.id, "Provider event was not linked to its message.");
  requireCondition(event.lead_id === expectedLeadId, "Provider-event lead association was incorrect.");
  requireCondition(event.customer_id === expectedCustomerId, "Provider-event customer association was incorrect.");
  requireCondition(event.routing_status === "matched" && event.status === "received", "Provider event was not matched/received.");
  requireCondition(event.response_summary?.outbound_sent === false, "Provider event reported an outbound SMS side effect.");
  const signatureEvidence = event.payload_summary?.signature_evidence;
  requireCondition(
    signatureEvidence === createSignatureEvidence(fixture),
    "Provider event signature evidence does not match the official signed request.",
  );
  const evidenceProof = event.response_summary?.evidence_proof;
  requireCondition(
    typeof evidenceProof === "string" && /^[a-f0-9]{64}$/.test(evidenceProof),
    "Provider event has no valid signed evidence proof.",
  );
  requireCondition(
    message.metadata?.evidence_proof === evidenceProof,
    "Message and provider event do not share the same evidence proof.",
  );
  const expectedEvidenceProof = createEvidenceProof(fixture.authToken, {
    messageId: message.id,
    eventId: event.id,
    companyId: message.company_id,
    connectionId: message.integration_connection_id ?? "",
    businessPhoneNumberId: message.business_phone_number_id ?? "",
    customerId: message.customer_id,
    leadId: message.lead_id,
    accountSid: message.provider_account_sid ?? "",
    messagingServiceSid: message.provider_messaging_service_sid ?? "",
    messageSid: message.twilio_message_sid,
    from: message.from_phone ?? "",
    to: message.to_phone,
    payloadFingerprint: message.provider_payload_fingerprint,
    signatureEvidence,
  });
  requireCondition(
    evidenceProof === expectedEvidenceProof,
    "Stored Twilio evidence proof does not match the current-run identities.",
  );

  return { message, event };
}

async function verifyNoSidResidue(client, messageSid, label) {
  const [messages, events] = await Promise.all([
    requireRows(
      client.from("sms_messages").select("id").eq("twilio_message_sid", messageSid),
      `${label} message lookup`,
    ),
    requireRows(
      client
        .from("communication_provider_events")
        .select("id")
        .eq("provider_event_sid", messageSid),
      `${label} event lookup`,
    ),
  ]);
  requireCondition(messages.length === 0 && events.length === 0, `${label} created a forbidden database record.`);
}

export async function runTwilioInboundRegression({
  cwd = process.cwd(),
  runtimeEnv = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireCondition(typeof fetchImpl === "function", "Twilio inbound regression requires Fetch API support.");
  const repositoryPath = resolve(cwd);
  const loaded = loadTwilioInboundRegressionEnvironment({
    cwd: repositoryPath,
    runtimeEnv,
  });
  const { guardedFetch, counters } = createNetworkGuard(
    fetchImpl,
    loaded.config.supabaseUrl,
  );
  const preflight = await runRegressionEnvironmentCommand({
    command: "verify",
    env: loaded.environment,
    fetchImpl: guardedFetch,
  });
  requireCondition(
    preflight.target === TWILIO_REGRESSION_PROJECT_REF && preflight.residueCount === 0,
    "Approved regression environment did not pass identity and zero-residue preflight.",
  );

  const compiled = compileWebhookRoute(repositoryPath);
  const runId = randomUUID();
  const marker = `TEST WTOS REGRESSION TWILIO INBOUND ${runId}`;
  const fixture = {
    accountSid: syntheticSid(TEST_ACCOUNT_SID_PREFIX, runId, "account"),
    authToken: crypto.randomBytes(32).toString("hex"),
    messagingServiceSid: syntheticSid(
      TEST_MESSAGING_SERVICE_SID_PREFIX,
      runId,
      "messaging-service",
    ),
  };
  const connectionId = randomUUID();
  const numberId = randomUUID();
  const knownCustomerId = randomUUID();
  const knownLeadId = randomUUID();
  const ambiguousLeadIds = [randomUUID(), randomUUID()];
  const ihcLeadId = randomUUID();
  const retryDriftLeadId = randomUUID();
  const routingKey = `TEST WTOS REGRESSION TWILIO ROUTE ${runId}`;
  const messageSids = {
    known: syntheticSid("SM", runId, "known"),
    knownCustomer: syntheticSid("SM", runId, "known-customer"),
    unknown: syntheticSid("SM", runId, "unknown"),
    ambiguous: syntheticSid("SM", runId, "ambiguous"),
    crossCompany: syntheticSid("SM", runId, "cross-company"),
    rejectedIhcRoute: syntheticSid("SM", runId, "rejected-ihc-route"),
    disabledConnection: syntheticSid("SM", runId, "disabled-connection"),
    concurrent: syntheticSid("SM", runId, "concurrent"),
    retryRecovery: syntheticSid("SM", runId, "retry-recovery"),
  };
  const allMessageSids = Object.values(messageSids);
  const capturedIds = {
    communication_provider_events: allMessageSids.map((sid) =>
      expectedEventId(sid),
    ),
    sms_messages: allMessageSids.map((sid) => expectedMessageId(sid)),
    business_phone_numbers: [numberId],
    integration_connections: [connectionId],
    customers: [knownCustomerId],
    leads: [knownLeadId, ...ambiguousLeadIds, ihcLeadId, retryDriftLeadId],
  };
  const environmentSnapshot = snapshotEnvironment(HANDLER_ENV_NAMES);
  const originalFetch = globalThis.fetch;
  const client = createClient(
    loaded.config.supabaseUrl,
    loaded.config.serviceRoleKey,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: guardedFetch },
    },
  );
  let primaryError = null;
  let cleanupError = null;
  let report = null;
  let capturedIdsAuthorizedForCleanup = false;

  try {
    installHandlerEnvironment(loaded.environment, fixture);
    globalThis.fetch = guardedFetch;
    const route = await import(pathToFileURL(compiled.routePath).href);
    requireCondition(typeof route.POST === "function", "Compiled Twilio webhook route has no POST handler.");
    const companies = await requireRows(
      client.from("companies").select("id,name,trade").order("name"),
      "Verify regression companies",
    );
    const weatherTech = companies.find(
      (company) =>
        company.name === "WeatherTech Roofing LLC" && company.trade === "roofing",
    );
    const ihc = companies.find(
      (company) => company.name === "IHC Painting" && company.trade === "painting",
    );
    requireCondition(weatherTech && ihc, "Regression companies do not match the approved identities.");

    await Promise.all([
      assertNoRows(
        client
          .from("integration_connections")
          .select("id")
          .in("id", capturedIds.integration_connections),
        "Twilio connection ID collision",
      ),
      assertNoRows(
        client
          .from("business_phone_numbers")
          .select("id")
          .or(`id.in.(${numberId}),routing_key.eq.${routingKey},phone_number_e164.eq.${WEATHERTECH_NUMBER}`),
        "Twilio number/routing collision",
      ),
      assertNoRows(
        client.from("leads").select("id").in("id", capturedIds.leads),
        "Twilio lead ID collision",
      ),
      assertNoRows(
        client.from("customers").select("id").in("id", capturedIds.customers),
        "Twilio customer ID collision",
      ),
      assertNoRows(
        client
          .from("leads")
          .select("id")
          .in("phone", [KNOWN_CUSTOMER_SENDER, KNOWN_SENDER, UNKNOWN_SENDER, AMBIGUOUS_SENDER, IHC_ONLY_SENDER]),
        "Twilio sender/lead collision",
      ),
      assertNoRows(
        client
          .from("customers")
          .select("id")
          .in("phone", [KNOWN_CUSTOMER_SENDER, KNOWN_SENDER, UNKNOWN_SENDER, AMBIGUOUS_SENDER, IHC_ONLY_SENDER]),
        "Twilio sender/customer collision",
      ),
      assertNoRows(
        client.from("sms_messages").select("id").in("id", capturedIds.sms_messages),
        "Twilio message ID collision",
      ),
      assertNoRows(
        client
          .from("communication_provider_events")
          .select("id")
          .in("id", capturedIds.communication_provider_events),
        "Twilio provider-event ID collision",
      ),
    ]);
    capturedIdsAuthorizedForCleanup = true;

    await insertRows(client, "integration_connections", [
      {
        id: connectionId,
        company_id: weatherTech.id,
        provider: "twilio_sms",
        status: "connected",
        account_email: null,
        display_name: marker,
        external_account_id: fixture.accountSid,
        provider_account_id: fixture.accountSid,
        scopes: [],
        sync_direction: "provider_to_weathertech",
        credential_reference: null,
        disabled_at: null,
        settings: { regression_marker: marker, inbound_only: true },
      },
    ]);
    await insertRows(client, "business_phone_numbers", [
      {
        id: numberId,
        company_id: weatherTech.id,
        integration_connection_id: connectionId,
        provider: "twilio",
        provider_account_sid: fixture.accountSid,
        messaging_service_sid: fixture.messagingServiceSid,
        phone_number_e164: WEATHERTECH_NUMBER,
        display_name: marker,
        routing_key: routingKey,
        business_location: "Regression only",
        team_queue: "weathertech-regression-only",
        lead_source: marker,
        communication_channel: "sms",
        time_zone: "America/Phoenix",
        routing_status: "active",
        settings: { regression_marker: marker },
      },
    ]);
    await insertRows(client, "customers", [
      {
        id: knownCustomerId,
        company_id: weatherTech.id,
        display_name: `${marker} CUSTOMER`,
        contact_name: `${marker} CUSTOMER`,
        phone: KNOWN_CUSTOMER_SENDER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        customer_type: "homeowner",
        status: "active",
        notes: marker,
      },
    ]);
    await insertRows(client, "leads", [
      {
        id: knownLeadId,
        company_id: weatherTech.id,
        contact_name: `${marker} KNOWN`,
        phone: KNOWN_SENDER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        service_type: "roofing",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
      ...ambiguousLeadIds.map((id, index) => ({
        id,
        company_id: weatherTech.id,
        contact_name: `${marker} AMBIGUOUS ${index + 1}`,
        phone: AMBIGUOUS_SENDER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        service_type: "roofing",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      })),
      {
        id: ihcLeadId,
        company_id: ihc.id,
        contact_name: `${marker} IHC ONLY`,
        phone: IHC_ONLY_SENDER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        service_type: "painting",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
    ]);

    const baseFixture = {
      ...fixture,
      from: KNOWN_SENDER,
      to: WEATHERTECH_NUMBER,
      body: `${marker} KNOWN MESSAGE`,
      messageSid: messageSids.known,
    };
    const requests = [];
    requests.push(await invokeWebhook(route.POST, baseFixture, "known sender", 200));
    requests.push(
      await invokeWebhook(
        route.POST,
        baseFixture,
        "reordered exact duplicate",
        200,
        {},
        { reverseOrder: true },
      ),
    );
    requests.push(
      await invokeWebhook(
        route.POST,
        baseFixture,
        "conflicting duplicate",
        409,
        { Body: `${marker} CONFLICTING BODY` },
      ),
    );
    const knownCustomerFixture = {
      ...baseFixture,
      from: KNOWN_CUSTOMER_SENDER,
      body: `${marker} KNOWN CUSTOMER MESSAGE`,
      messageSid: messageSids.knownCustomer,
    };
    requests.push(
      await invokeWebhook(
        route.POST,
        knownCustomerFixture,
        "known customer",
        200,
      ),
    );
    const unknownFixture = {
      ...baseFixture,
      from: UNKNOWN_SENDER,
      body: `${marker} UNKNOWN MESSAGE`,
      messageSid: messageSids.unknown,
    };
    requests.push(await invokeWebhook(route.POST, unknownFixture, "unknown sender", 200));
    await insertRows(client, "leads", [
      {
        id: retryDriftLeadId,
        company_id: weatherTech.id,
        contact_name: `${marker} RETRY DRIFT` ,
        phone: UNKNOWN_SENDER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Phoenix",
        state: "AZ",
        postal_code: "85001",
        service_type: "roofing",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
    ]);
    requests.push(
      await invokeWebhook(
        route.POST,
        unknownFixture,
        "duplicate after CRM match drift",
        200,
      ),
    );
    const ambiguousFixture = {
      ...baseFixture,
      from: AMBIGUOUS_SENDER,
      body: `${marker} AMBIGUOUS MESSAGE`,
      messageSid: messageSids.ambiguous,
    };
    requests.push(await invokeWebhook(route.POST, ambiguousFixture, "ambiguous sender", 200));
    const crossCompanyFixture = {
      ...baseFixture,
      from: IHC_ONLY_SENDER,
      body: `${marker} CROSS COMPANY MESSAGE`,
      messageSid: messageSids.crossCompany,
    };
    requests.push(
      await invokeWebhook(
        route.POST,
        crossCompanyFixture,
        "cross-company sender isolation",
        200,
      ),
    );
    const rejectedIhcFixture = {
      ...crossCompanyFixture,
      to: IHC_UNMAPPED_NUMBER,
      body: `${marker} UNMAPPED IHC ROUTE`,
      messageSid: messageSids.rejectedIhcRoute,
    };
    requests.push(
      await invokeWebhook(
        route.POST,
        rejectedIhcFixture,
        "unmapped IHC route",
        403,
      ),
    );
    const disabledConnectionFixture = {
      ...baseFixture,
      body: `${marker} DISABLED CONNECTION`,
      messageSid: messageSids.disabledConnection,
    };
    const disabledAt = new Date().toISOString();
    const disabledConnectionRows = await requireRows(
      client
        .from("integration_connections")
        .update({ disabled_at: disabledAt })
        .eq("id", connectionId)
        .select("id,disabled_at"),
      "Disable Twilio regression connection",
    );
    requireCondition(
      disabledConnectionRows.length === 1 &&
        Boolean(disabledConnectionRows[0].disabled_at) &&
        new Date(disabledConnectionRows[0].disabled_at).getTime() ===
          new Date(disabledAt).getTime(),
      "Twilio regression connection did not enter the disabled state.",
    );
    requests.push(
      await invokeWebhook(
        route.POST,
        disabledConnectionFixture,
        "disabled connection",
        403,
      ),
    );
    await verifyNoSidResidue(
      client,
      messageSids.disabledConnection,
      "Disabled connection",
    );
    const restoredConnectionRows = await requireRows(
      client
        .from("integration_connections")
        .update({ disabled_at: null })
        .eq("id", connectionId)
        .select("id,disabled_at"),
      "Restore Twilio regression connection",
    );
    requireCondition(
      restoredConnectionRows.length === 1 &&
        restoredConnectionRows[0].disabled_at === null,
      "Twilio regression connection did not return to its active state.",
    );

    const concurrentFixture = {
      ...baseFixture,
      body: `${marker} CONCURRENT DUPLICATE`,
      messageSid: messageSids.concurrent,
    };
    const concurrentResponses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        invokeWebhook(
          route.POST,
          concurrentFixture,
          `concurrent duplicate ${index + 1}`,
          200,
        ),
      ),
    );
    requests.push(...concurrentResponses);

    const retryRecoveryFixture = {
      ...baseFixture,
      body: `${marker} RETRY RECOVERY`,
      messageSid: messageSids.retryRecovery,
    };
    const retryMessageId = expectedMessageId(retryRecoveryFixture.messageSid);
    const retryFingerprint = createPayloadFingerprint({
      accountSid: fixture.accountSid,
      messageSid: retryRecoveryFixture.messageSid,
      messagingServiceSid: fixture.messagingServiceSid,
      from: retryRecoveryFixture.from,
      to: retryRecoveryFixture.to,
      body: retryRecoveryFixture.body,
      companyId: weatherTech.id,
    });
    const retryTimestamp = new Date().toISOString();
    await insertRows(client, "sms_messages", [
      {
        id: retryMessageId,
        company_id: weatherTech.id,
        customer_id: null,
        lead_id: knownLeadId,
        integration_connection_id: connectionId,
        provider: "twilio_sms",
        category: "general",
        status: "sent",
        business_phone_number_id: numberId,
        direction: "inbound",
        delivery_status: "received",
        provider_account_sid: fixture.accountSid,
        provider_messaging_service_sid: fixture.messagingServiceSid,
        to_phone: retryRecoveryFixture.to,
        from_phone: retryRecoveryFixture.from,
        body: retryRecoveryFixture.body,
        twilio_message_sid: retryRecoveryFixture.messageSid,
        sent_at: retryTimestamp,
        delivered_at: retryTimestamp,
        correlation_id: retryMessageId,
        provider_payload_fingerprint: retryFingerprint,
        metadata: {
          ingestion_status: "claimed",
          contact_match_status: "matched_lead",
          source: "authenticated_twilio_webhook",
        },
        last_error: null,
      },
    ]);
    requests.push(
      await invokeWebhook(
        route.POST,
        retryRecoveryFixture,
        "retry recovery after message claim",
        200,
      ),
    );

    const known = await verifyStoredCase({
      client,
      fixture: baseFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: null,
      expectedLeadId: knownLeadId,
      expectedContactStatus: "matched_lead",
    });
    requireCondition(
      known.message.body === baseFixture.body,
      "Conflicting duplicate changed the original inbound message.",
    );
    await verifyStoredCase({
      client,
      fixture: knownCustomerFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: knownCustomerId,
      expectedLeadId: null,
      expectedContactStatus: "matched_customer",
    });
    await verifyStoredCase({
      client,
      fixture: unknownFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: null,
      expectedLeadId: null,
      expectedContactStatus: "unmatched",
    });
    await verifyStoredCase({
      client,
      fixture: ambiguousFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: null,
      expectedLeadId: null,
      expectedContactStatus: "ambiguous",
    });
    const crossCompany = await verifyStoredCase({
      client,
      fixture: crossCompanyFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: null,
      expectedLeadId: null,
      expectedContactStatus: "unmatched",
    });
    requireCondition(
      crossCompany.message.lead_id !== ihcLeadId &&
        crossCompany.event.lead_id !== ihcLeadId,
      "WeatherTech inbound SMS leaked the IHC lead association.",
    );
    await verifyStoredCase({
      client,
      fixture: concurrentFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: null,
      expectedLeadId: knownLeadId,
      expectedContactStatus: "matched_lead",
    });
    const recovered = await verifyStoredCase({
      client,
      fixture: retryRecoveryFixture,
      expectedCompanyId: weatherTech.id,
      expectedCustomerId: null,
      expectedLeadId: knownLeadId,
      expectedContactStatus: "matched_lead",
    });
    requireCondition(
      recovered.message.metadata?.ingestion_status === "complete" &&
        recovered.event.sms_message_id === retryMessageId,
      "Retried delivery did not recover the partial message claim atomically.",
    );
    await verifyNoSidResidue(
      client,
      messageSids.rejectedIhcRoute,
      "Unmapped IHC route",
    );

    const [currentMessages, currentEvents, currentLeads, currentCustomers] = await Promise.all([
      requireRows(
        client.from("sms_messages").select("*").in("id", capturedIds.sms_messages),
        "Read current-run Twilio messages",
      ),
      requireRows(
        client
          .from("communication_provider_events")
          .select("*")
          .in("id", capturedIds.communication_provider_events),
        "Read current-run Twilio events",
      ),
      requireRows(
        client.from("leads").select("id,notes").in("id", capturedIds.leads),
        "Read current-run Twilio leads",
      ),
      requireRows(
        client
          .from("customers")
          .select("id,notes")
          .in("id", capturedIds.customers),
        "Read current-run Twilio customers",
      ),
    ]);
    requireCondition(currentMessages.length === 7, "Twilio regression did not persist exactly seven accepted messages.");
    requireCondition(currentEvents.length === 7, "Twilio regression did not persist exactly seven accepted provider events.");
    requireCondition(currentLeads.length === 5, "Inbound SMS created or removed a synthetic lead unexpectedly.");
    requireCondition(currentCustomers.length === 1, "Inbound SMS created or removed a synthetic customer unexpectedly.");
    requireCondition(
      currentMessages.every((message) => message.direction === "inbound") &&
        currentMessages.every((message) => message.status === "sent"),
      "Twilio regression observed a non-inbound or unpersisted current-run message.",
    );
    requireCondition(
      currentEvents.every((event) => event.response_summary?.outbound_sent === false),
      "Twilio regression observed an outbound provider side effect.",
    );
    requireCondition(
      process.env.TWILIO_OUTBOUND_SMS_ENABLED === "false",
      "Twilio outbound SMS was not locked false during regression.",
    );
    requireCondition(
      counters.blockedExternalRequests === 0,
      "A non-Supabase provider network operation was attempted.",
    );

    report = {
      result: "PASS",
      target: TWILIO_REGRESSION_PROJECT_REF,
      runId,
      externalEnvironmentOnly: loaded.source === "external_file",
      compiledProductionRoute: true,
      officialSignatureValidation: true,
      requests,
      acceptedMessages: currentMessages.length,
      acceptedProviderEvents: currentEvents.length,
      duplicateRowsCreated: 0,
      duplicateSurvivedCrmMatchDrift: true,
      conflictingDuplicateRejected: true,
      knownCustomerMatched: true,
      unknownSenderPreservedUnmatched: true,
      ambiguousSenderPreservedUnmatched: true,
      crossCompanyLeadAssociationBlocked: true,
      unmappedIhcRouteRejected: true,
      disabledConnectionRejected: true,
      concurrentDuplicatesConverged: true,
      retryRecoveryCompleted: true,
      evidenceProofVerified: true,
      outboundMessages: 0,
      providerNetworkRequests: 0,
      cleanupResidue: null,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      if (capturedIdsAuthorizedForCleanup) {
        await deleteExactIds(
          client,
          "communication_provider_events",
          capturedIds.communication_provider_events,
        );
        await deleteExactIds(client, "sms_messages", capturedIds.sms_messages);
        await deleteExactIds(client, "leads", capturedIds.leads);
        await deleteExactIds(client, "customers", capturedIds.customers);
        await deleteExactIds(
          client,
          "business_phone_numbers",
          capturedIds.business_phone_numbers,
        );
        await deleteExactIds(
          client,
          "integration_connections",
          capturedIds.integration_connections,
        );
        await Promise.all(
          Object.entries(capturedIds).map(([table, ids]) =>
            assertExactIdsAbsent(client, table, ids, "Twilio inbound cleanup"),
          ),
        );
        const markerLeads = await requireRows(
          client.from("leads").select("id").eq("notes", marker),
          "Twilio marker residue check",
        );
        const markerCustomers = await requireRows(
          client.from("customers").select("id").eq("notes", marker),
          "Twilio customer marker residue check",
        );
        requireCondition(
          markerLeads.length === 0 && markerCustomers.length === 0,
          "Twilio marker residue remains after cleanup.",
        );
        const finalVerification = await runRegressionEnvironmentCommand({
          command: "verify",
          env: loaded.environment,
          fetchImpl: guardedFetch,
        });
        requireCondition(
          finalVerification.residueCount === 0,
          "Regression environment did not return to zero residue.",
        );
        if (report) {
          report.cleanupResidue = 0;
        }
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      globalThis.fetch = originalFetch;
      restoreEnvironment(environmentSnapshot);
      rmSync(compiled.outputDirectory, { recursive: true, force: true });
    }
  }

  if (primaryError && cleanupError) {
    throw new AggregateError(
      [primaryError, cleanupError],
      "Twilio inbound regression failed and exact-ID cleanup also failed.",
    );
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (primaryError) {
    throw primaryError;
  }
  requireCondition(report?.cleanupResidue === 0, "Twilio inbound regression did not prove zero residue.");
  return report;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runTwilioInboundRegression({ cwd: dirname(dirname(process.argv[1])) })
    .then((report) => {
      console.log("WeatherTech OS Twilio inbound regression: PASS");
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        `WeatherTech OS Twilio inbound regression: FAIL: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
