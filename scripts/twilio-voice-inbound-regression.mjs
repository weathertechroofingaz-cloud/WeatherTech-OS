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

export const TWILIO_VOICE_INBOUND_REGRESSION_RUN =
  "WTOS_TWILIO_VOICE_INBOUND_REGRESSION_RUN";
export const TWILIO_VOICE_REGRESSION_PROJECT_REF = "hygtnhmmaoboduqghhwg";
export const TWILIO_VOICE_PRODUCTION_PROJECT_REF = "gahfcgyjtfwwmsterhzu";

const PUBLIC_BASE_URL = "https://twilio-voice-regression.weathertech.invalid";
const VOICE_PATH = "/api/integrations/twilio/voice";
const STATUS_PATH = "/api/integrations/twilio/voice/status";
const LOCAL_ORIGIN = "http://127.0.0.1:3000";
const TUCSON_NUMBER = "+12025550131";
const TUCSON_FORWARD_DESTINATION = "+12025550132";
const CALLER_NUMBER = "+12025550133";
const CONFLICTING_CALLER_NUMBER = "+12025550134";
const PHOENIX_NUMBER = "+12025550135";
const IHC_NUMBER = "+12025550136";
const KNOWN_CALLER_NUMBER = "+12025550137";
const AMBIGUOUS_CALLER_NUMBER = "+12025550138";
const PHOENIX_PUBLIC_SOURCE = "+12025550139";
const IHC_PUBLIC_SOURCE = "+12025550140";
const PHOENIX_FORWARD_DESTINATION = "+12025550141";
const IHC_FORWARD_DESTINATION = "+12025550142";
const FORWARD_DESTINATIONS = [
  PHOENIX_FORWARD_DESTINATION,
  TUCSON_FORWARD_DESTINATION,
  IHC_FORWARD_DESTINATION,
];
const SYNTHETIC_PHONE_NUMBERS = [
  TUCSON_NUMBER,
  ...FORWARD_DESTINATIONS,
  CALLER_NUMBER,
  CONFLICTING_CALLER_NUMBER,
  PHOENIX_NUMBER,
  IHC_NUMBER,
  KNOWN_CALLER_NUMBER,
  AMBIGUOUS_CALLER_NUMBER,
  PHOENIX_PUBLIC_SOURCE,
  IHC_PUBLIC_SOURCE,
];
const DIAL_DURATION_SECONDS = 42;
const HANDLER_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PUBLIC_BASE_URL",
  "TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED",
  "TWILIO_INBOUND_SMS_ENABLED",
  "TWILIO_OUTBOUND_SMS_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_NUMBER",
  "TWILIO_WEATHERTECH_TUCSON_NUMBER",
  "TWILIO_IHC_NUMBER",
  "TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER",
  "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
  "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
  "TWILIO_IHC_PUBLIC_NUMBER",
  "TWILIO_IHC_VOICE_FORWARDING_ENABLED",
  "TWILIO_IHC_VOICE_FORWARD_TO",
];

const VOICE_ROUTES = [
  {
    key: "weathertech-phoenix",
    label: "WeatherTech Phoenix",
    companyName: "WeatherTech Roofing LLC",
    companyTrade: "roofing",
    ingressNumber: PHOENIX_NUMBER,
    publicSource: PHOENIX_PUBLIC_SOURCE,
    businessLocation: "Phoenix",
    teamQueue: "weathertech-roofing-phoenix",
    leadSource: "Phone - WeatherTech Phoenix",
    communicationChannel: "sms",
    gateEnv: "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARDING_ENABLED",
    destinationEnv: "TWILIO_WEATHERTECH_PHOENIX_VOICE_FORWARD_TO",
    destination: PHOENIX_FORWARD_DESTINATION,
    namespaceStem: "weathertech-phoenix",
  },
  {
    key: "weathertech-tucson",
    label: "WeatherTech Tucson",
    companyName: "WeatherTech Roofing LLC",
    companyTrade: "roofing",
    ingressNumber: TUCSON_NUMBER,
    publicSource: null,
    businessLocation: "Tucson",
    teamQueue: "weathertech-roofing-tucson",
    leadSource: "Phone - WeatherTech Tucson",
    communicationChannel: "sms_voice",
    gateEnv: "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARDING_ENABLED",
    destinationEnv: "TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO",
    destination: TUCSON_FORWARD_DESTINATION,
    namespaceStem: "tucson",
  },
  {
    key: "ihc-primary",
    label: "IHC Scottsdale",
    companyName: "IHC Painting",
    companyTrade: "painting",
    ingressNumber: IHC_NUMBER,
    publicSource: IHC_PUBLIC_SOURCE,
    businessLocation: "Scottsdale",
    teamQueue: "ihc-painting",
    leadSource: "Phone - IHC",
    communicationChannel: "sms",
    gateEnv: "TWILIO_IHC_VOICE_FORWARDING_ENABLED",
    destinationEnv: "TWILIO_IHC_VOICE_FORWARD_TO",
    destination: IHC_FORWARD_DESTINATION,
    namespaceStem: "ihc-primary",
  },
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

export function loadTwilioVoiceInboundRegressionEnvironment({
  cwd,
  runtimeEnv = process.env,
} = {}) {
  requireCondition(cwd, "Twilio voice regression requires an explicit repository path.");
  const externalPath = runtimeEnv[BROWSER_REGRESSION_ENV_FILE]?.trim();
  requireCondition(
    externalPath && isAbsolute(externalPath),
    `${BROWSER_REGRESSION_ENV_FILE} must name a secure absolute environment file outside the repository. This runner never reads .env.local.`,
  );
  requireCondition(
    !runtimeEnv.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      !runtimeEnv.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    `Twilio voice regression accepts target credentials only from ${BROWSER_REGRESSION_ENV_FILE}.`,
  );

  const loaded = loadBrowserRegressionEnvironment({
    cwd,
    runtimeEnv,
    remoteWritesEnabled: true,
  });
  requireCondition(
    loaded.source === "external_file",
    "Twilio voice regression requires the secure external-file credential source.",
  );
  const config = validateRegressionEnvironment(loaded.environment);
  requireCondition(
    SHARED_REGRESSION_PROJECT_REF === TWILIO_VOICE_REGRESSION_PROJECT_REF &&
      SHARED_PRODUCTION_PROJECT_REF === TWILIO_VOICE_PRODUCTION_PROJECT_REF,
    "Twilio voice regression project constants disagree with the shared target guard.",
  );
  requireCondition(
    config.projectRef === TWILIO_VOICE_REGRESSION_PROJECT_REF,
    "Twilio voice regression target is not the approved regression project.",
  );
  requireCondition(
    !config.supabaseUrl.includes(TWILIO_VOICE_PRODUCTION_PROJECT_REF),
    "Production Supabase is permanently prohibited as a Twilio voice regression target.",
  );
  return { config, environment: loaded.environment, source: loaded.source };
}

function createNetworkGuard(fetchImpl, allowedOrigin) {
  const counters = { allowedSupabaseRequests: 0, blockedExternalRequests: 0 };
  const guardedFetch = async (input, init) => {
    const rawUrl =
      typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    const url = new URL(rawUrl);
    if (url.origin !== allowedOrigin) {
      counters.blockedExternalRequests += 1;
      throw new Error(
        "Twilio voice regression blocked a non-regression provider request before transmission.",
      );
    }
    counters.allowedSupabaseRequests += 1;
    return fetchImpl(input, init);
  };
  return { counters, guardedFetch };
}

function compileVoiceRoutes(cwd) {
  const outputDirectory = mkdtempSync(join(cwd, ".weathertech-twilio-voice-route-"));
  const compile = spawnSync(
    join(cwd, "node_modules", ".bin", "tsc"),
    [
      "app/api/integrations/twilio/voice/route.ts",
      "app/api/integrations/twilio/voice/status/route.ts",
      "lib/twilio/webhooks.ts",
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
      `Could not compile the multi-route Twilio voice handlers.\n${compile.stdout}\n${compile.stderr}`,
    );
  }
  return {
    outputDirectory,
    ingressRoutePath: join(
      outputDirectory,
      "app",
      "api",
      "integrations",
      "twilio",
      "voice",
      "route.js",
    ),
    statusRoutePath: join(
      outputDirectory,
      "app",
      "api",
      "integrations",
      "twilio",
      "voice",
      "status",
      "route.js",
    ),
    webhooksPath: join(outputDirectory, "lib", "twilio", "webhooks.js"),
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
  await assertNoRows(client.from(table).select("id").in("id", ids), `${label} exact-ID residue`);
}

function mergeExactIds(target, values) {
  target.splice(0, target.length, ...new Set([...target, ...values].filter(Boolean)));
}

function isMissingOptionalRelation(error, table) {
  const evidence = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ");
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    new RegExp(`(?:relation|table).*${table}.*(?:does not exist|schema cache)`, "i").test(evidence)
  );
}

async function deleteLeadAccountabilityForExactLeadIds(client, leadIds) {
  if (!leadIds.length) {
    return { accountabilityIds: [], eventIds: [] };
  }
  const { data: accountabilities, error: accountabilityError } = await client
    .from("lead_accountability")
    .select("id")
    .in("lead_id", leadIds);
  if (accountabilityError) {
    if (isMissingOptionalRelation(accountabilityError, "lead_accountability")) {
      return { accountabilityIds: [], eventIds: [] };
    }
    throw new Error(`Discover voice lead accountability failed: ${accountabilityError.message}`);
  }
  const { data: events, error: eventError } = await client
    .from("lead_accountability_events")
    .select("id")
    .in("lead_id", leadIds);
  if (eventError) {
    throw new Error(`Discover voice lead accountability events failed: ${eventError.message}`);
  }
  const accountabilityIds = (accountabilities ?? []).map((row) => row.id);
  const eventIds = (events ?? []).map((row) => row.id);
  await deleteExactIds(client, "lead_accountability_events", eventIds);
  await deleteExactIds(client, "lead_accountability", accountabilityIds);
  return { accountabilityIds, eventIds };
}

async function discoverExactPhoneSideEffects(client, capturedIds) {
  const phones = SYNTHETIC_PHONE_NUMBERS;
  const [callsFrom, callsTo, customers, leads, smsFrom, smsTo, eventsFrom, eventsTo] = await Promise.all([
    requireRows(client.from("call_records").select("id").in("from_phone", phones), "Discover exact-phone calls"),
    requireRows(client.from("call_records").select("id").in("to_phone", phones), "Discover exact-phone calls by recipient"),
    requireRows(client.from("customers").select("id").in("phone", phones), "Discover exact-phone customers"),
    requireRows(client.from("leads").select("id").in("phone", phones), "Discover exact-phone leads"),
    requireRows(client.from("sms_messages").select("id").in("from_phone", phones), "Discover exact-phone sent SMS"),
    requireRows(client.from("sms_messages").select("id").in("to_phone", phones), "Discover exact-phone received SMS"),
    requireRows(
      client.from("communication_provider_events").select("id").in("from_phone", phones),
      "Discover exact-phone provider events by sender",
    ),
    requireRows(
      client.from("communication_provider_events").select("id").in("to_phone", phones),
      "Discover exact-phone provider events by recipient",
    ),
  ]);
  mergeExactIds(
    capturedIds.call_records,
    [...callsFrom, ...callsTo].map((row) => row.id),
  );
  mergeExactIds(capturedIds.customers, customers.map((row) => row.id));
  mergeExactIds(capturedIds.leads, leads.map((row) => row.id));
  mergeExactIds(
    capturedIds.sms_messages,
    [...smsFrom, ...smsTo].map((row) => row.id),
  );
  mergeExactIds(
    capturedIds.communication_provider_events,
    [...eventsFrom, ...eventsTo].map((row) => row.id),
  );
  if (capturedIds.sms_messages.length) {
    const linkedEvents = await requireRows(
      client
        .from("communication_provider_events")
        .select("id")
        .in("sms_message_id", capturedIds.sms_messages),
      "Discover exact-SMS provider events",
    );
    mergeExactIds(
      capturedIds.communication_provider_events,
      linkedEvents.map((row) => row.id),
    );
  }
}

function installHandlerEnvironment(environment, fixture) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = environment.NEXT_PUBLIC_SUPABASE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = environment.SUPABASE_SERVICE_ROLE_KEY;
  process.env.TWILIO_ACCOUNT_SID = fixture.accountSid;
  process.env.TWILIO_AUTH_TOKEN = fixture.authToken;
  process.env.TWILIO_MESSAGING_SERVICE_SID = fixture.messagingServiceSid;
  process.env.TWILIO_PUBLIC_BASE_URL = PUBLIC_BASE_URL;
  process.env.TWILIO_VOICE_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";
  // These Phoenix/IHC variables are deliberately stale. The Tucson-only
  // implementation must ignore them even when an old deployment still has
  // values saved under the retired names.
  process.env.TWILIO_WEATHERTECH_PHOENIX_TERMINAL_FORWARDING_DISABLED_CONFIRMED =
    "true";
  process.env.TWILIO_IHC_TERMINAL_FORWARDING_DISABLED_CONFIRMED = "true";
  process.env.TWILIO_INBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_OUTBOUND_SMS_ENABLED = "false";
  process.env.TWILIO_WEATHERTECH_PHOENIX_NUMBER = PHOENIX_NUMBER;
  process.env.TWILIO_WEATHERTECH_TUCSON_NUMBER = TUCSON_NUMBER;
  process.env.TWILIO_IHC_NUMBER = IHC_NUMBER;
  process.env.TWILIO_WEATHERTECH_PHOENIX_PUBLIC_NUMBER = PHOENIX_PUBLIC_SOURCE;
  process.env.TWILIO_IHC_PUBLIC_NUMBER = IHC_PUBLIC_SOURCE;
  for (const route of VOICE_ROUTES) {
    process.env[route.gateEnv] = "true";
    process.env[route.destinationEnv] = route.destination;
  }
}

function createSignedRequest(pathname, authToken, values) {
  const canonicalUrl = `${PUBLIC_BASE_URL}${pathname}`;
  const signature = twilio.getExpectedTwilioSignature(authToken, canonicalUrl, values);
  return new NextRequest(`${LOCAL_ORIGIN}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": signature,
    },
    body: new URLSearchParams(values).toString(),
  });
}

function ingressValues(fixture, overrides = {}) {
  return {
    AccountSid: fixture.accountSid,
    CallSid: fixture.parentCallSid,
    From: CALLER_NUMBER,
    To: TUCSON_NUMBER,
    CallStatus: "ringing",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: fixture.startedAt,
    ...overrides,
  };
}

function statusValues(fixture, overrides = {}) {
  return {
    AccountSid: fixture.accountSid,
    CallSid: fixture.parentCallSid,
    DialCallSid: fixture.childCallSid,
    From: CALLER_NUMBER,
    To: TUCSON_NUMBER,
    CallStatus: "in-progress",
    DialCallStatus: "completed",
    DialCallDuration: String(DIAL_DURATION_SECONDS),
    DialBridged: "true",
    Direction: "inbound",
    ApiVersion: "2010-04-01",
    Timestamp: fixture.endedAt,
    ...overrides,
  };
}

async function invokeRoute(post, request, label, expectedStatus, protectedValues = []) {
  const response = await post(request);
  const body = await response.text();
  requireCondition(
    response.status === expectedStatus,
    `${label} returned HTTP ${response.status}; expected ${expectedStatus}.`,
  );
  for (const protectedValue of protectedValues) {
    requireCondition(!body.includes(protectedValue), `${label} exposed protected evidence.`);
  }
  return { case: label, status: response.status, body };
}

function hasExactRouteDialTwiML(body, route) {
  return (
    body.includes("<Dial") &&
    body.includes(route.destination) &&
    VOICE_ROUTES.filter((candidate) => candidate.key !== route.key).every(
      (candidate) => !body.includes(candidate.destination),
    )
  );
}

function getOtherRouteDestinations(route) {
  return VOICE_ROUTES.filter((candidate) => candidate.key !== route.key).map(
    (candidate) => candidate.destination,
  );
}

async function setRouteChannel(
  client,
  numberId,
  communicationChannel,
  routeLabel = "voice",
) {
  const rows = await requireRows(
    client
      .from("business_phone_numbers")
      .update({ communication_channel: communicationChannel })
      .eq("id", numberId)
      .select("id,communication_channel"),
    `Set ${routeLabel} route channel ${communicationChannel}`,
  );
  requireCondition(
    rows.length === 1 && rows[0].communication_channel === communicationChannel,
    `${routeLabel} route did not enter ${communicationChannel} mode.`,
  );
}

export async function runTwilioVoiceInboundRegression({
  cwd = process.cwd(),
  runtimeEnv = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  requireCondition(typeof fetchImpl === "function", "Twilio voice regression requires Fetch API support.");
  const repositoryPath = resolve(cwd);
  const loaded = loadTwilioVoiceInboundRegressionEnvironment({
    cwd: repositoryPath,
    runtimeEnv,
  });
  const { guardedFetch, counters } = createNetworkGuard(fetchImpl, loaded.config.supabaseUrl);
  const preflight = await runRegressionEnvironmentCommand({
    command: "verify",
    env: loaded.environment,
    fetchImpl: guardedFetch,
  });
  requireCondition(
    preflight.target === TWILIO_VOICE_REGRESSION_PROJECT_REF && preflight.residueCount === 0,
    "Approved regression environment did not pass identity and zero-residue preflight.",
  );

  const compiled = compileVoiceRoutes(repositoryPath);
  const runId = randomUUID();
  const marker = `TEST WTOS REGRESSION TWILIO VOICE ${runId}`;
  const now = Date.now();
  const fixture = {
    accountSid: syntheticSid("AC", runId, "account"),
    authToken: crypto.randomBytes(32).toString("hex"),
    messagingServiceSid: syntheticSid("MG", runId, "messaging-service"),
    parentCallSid: syntheticSid("CA", runId, "parent-call"),
    childCallSid: syntheticSid("CA", runId, "child-call"),
    missingParentCallSid: syntheticSid("CA", runId, "missing-parent-call"),
    rejectedParentCallSid: syntheticSid("CA", runId, "rejected-parent-call"),
    knownParentCallSid: syntheticSid("CA", runId, "known-parent-call"),
    ambiguousParentCallSid: syntheticSid("CA", runId, "ambiguous-parent-call"),
    alternateChildCallSid: syntheticSid("CA", runId, "alternate-child-call"),
    phoenixParentCallSid: syntheticSid("CA", runId, "phoenix-parent-call"),
    phoenixChildCallSid: syntheticSid("CA", runId, "phoenix-child-call"),
    phoenixAlternateChildCallSid: syntheticSid("CA", runId, "phoenix-alternate-child-call"),
    phoenixRejectedParentCallSid: syntheticSid("CA", runId, "phoenix-rejected-parent-call"),
    ihcParentCallSid: syntheticSid("CA", runId, "ihc-parent-call"),
    ihcChildCallSid: syntheticSid("CA", runId, "ihc-child-call"),
    ihcAlternateChildCallSid: syntheticSid("CA", runId, "ihc-alternate-child-call"),
    ihcRejectedParentCallSid: syntheticSid("CA", runId, "ihc-rejected-parent-call"),
    startedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    endedAt: new Date(now).toISOString(),
  };
  const weatherTechConnectionId = randomUUID();
  const ihcConnectionId = randomUUID();
  const phoenixNumberId = randomUUID();
  const tucsonNumberId = randomUUID();
  const ihcNumberId = randomUUID();
  const connectionId = weatherTechConnectionId;
  const numberId = tucsonNumberId;
  const callId = deterministicUuid("wtos:twilio:tucson-call:v1", fixture.parentCallSid);
  const inboundEventId = deterministicUuid(
    "wtos:twilio:tucson-voice-inbound-event:v1",
    fixture.parentCallSid,
  );
  const statusEventId = deterministicUuid(
    "wtos:twilio:tucson-voice-status-event:v1",
    fixture.parentCallSid,
  );
  const missingStatusEventId = deterministicUuid(
    "wtos:twilio:tucson-voice-status-event:v1",
    fixture.missingParentCallSid,
  );
  const rejectedCallId = deterministicUuid(
    "wtos:twilio:tucson-call:v1",
    fixture.rejectedParentCallSid,
  );
  const rejectedInboundEventId = deterministicUuid(
    "wtos:twilio:tucson-voice-inbound-event:v1",
    fixture.rejectedParentCallSid,
  );
  const knownCallId = deterministicUuid(
    "wtos:twilio:tucson-call:v1",
    fixture.knownParentCallSid,
  );
  const knownInboundEventId = deterministicUuid(
    "wtos:twilio:tucson-voice-inbound-event:v1",
    fixture.knownParentCallSid,
  );
  const ambiguousCallId = deterministicUuid(
    "wtos:twilio:tucson-call:v1",
    fixture.ambiguousParentCallSid,
  );
  const ambiguousInboundEventId = deterministicUuid(
    "wtos:twilio:tucson-voice-inbound-event:v1",
    fixture.ambiguousParentCallSid,
  );
  const phoenixCallId = deterministicUuid(
    "wtos:twilio:weathertech-phoenix-call:v1",
    fixture.phoenixParentCallSid,
  );
  const phoenixInboundEventId = deterministicUuid(
    "wtos:twilio:weathertech-phoenix-voice-inbound-event:v1",
    fixture.phoenixParentCallSid,
  );
  const phoenixStatusEventId = deterministicUuid(
    "wtos:twilio:weathertech-phoenix-voice-status-event:v1",
    fixture.phoenixParentCallSid,
  );
  const phoenixRejectedCallId = deterministicUuid(
    "wtos:twilio:weathertech-phoenix-call:v1",
    fixture.phoenixRejectedParentCallSid,
  );
  const phoenixRejectedInboundEventId = deterministicUuid(
    "wtos:twilio:weathertech-phoenix-voice-inbound-event:v1",
    fixture.phoenixRejectedParentCallSid,
  );
  const ihcCallId = deterministicUuid(
    "wtos:twilio:ihc-primary-call:v1",
    fixture.ihcParentCallSid,
  );
  const ihcInboundEventId = deterministicUuid(
    "wtos:twilio:ihc-primary-voice-inbound-event:v1",
    fixture.ihcParentCallSid,
  );
  const ihcStatusEventId = deterministicUuid(
    "wtos:twilio:ihc-primary-voice-status-event:v1",
    fixture.ihcParentCallSid,
  );
  const ihcRejectedCallId = deterministicUuid(
    "wtos:twilio:ihc-primary-call:v1",
    fixture.ihcRejectedParentCallSid,
  );
  const ihcRejectedInboundEventId = deterministicUuid(
    "wtos:twilio:ihc-primary-voice-inbound-event:v1",
    fixture.ihcRejectedParentCallSid,
  );
  const ingressLoopAttempts = VOICE_ROUTES.map((route) => {
    const parentCallSid = syntheticSid(
      "CA",
      runId,
      `tucson-destination-loop-${route.key}`,
    );
    return {
      protectedRouteKey: route.key,
      destination: route.ingressNumber,
      parentCallSid,
      callId: deterministicUuid("wtos:twilio:tucson-call:v1", parentCallSid),
      inboundEventId: deterministicUuid(
        "wtos:twilio:tucson-voice-inbound-event:v1",
        parentCallSid,
      ),
    };
  });
  const protectedCallerAttempts = [
    ...VOICE_ROUTES.map((route) => ({
      callerKey: `${route.key}-ingress`,
      callerNumber: route.ingressNumber,
    })),
    {
      callerKey: "tucson-terminal",
      callerNumber: TUCSON_FORWARD_DESTINATION,
    },
  ].map((caller) => {
    const parentCallSid = syntheticSid(
      "CA",
      runId,
      `tucson-protected-caller-${caller.callerKey}`,
    );
    return {
      ...caller,
      parentCallSid,
      callId: deterministicUuid("wtos:twilio:tucson-call:v1", parentCallSid),
      inboundEventId: deterministicUuid(
        "wtos:twilio:tucson-voice-inbound-event:v1",
        parentCallSid,
      ),
    };
  });
  const knownLeadId = randomUUID();
  const knownIhcLeadId = randomUUID();
  const ambiguousLeadIds = [randomUUID(), randomUUID()];
  const ambiguousIhcLeadId = randomUUID();
  const driftLeadId = randomUUID();
  const capturedIds = {
    communication_provider_events: [
      inboundEventId,
      statusEventId,
      missingStatusEventId,
      rejectedInboundEventId,
      knownInboundEventId,
      ambiguousInboundEventId,
      phoenixInboundEventId,
      phoenixStatusEventId,
      phoenixRejectedInboundEventId,
      ihcInboundEventId,
      ihcStatusEventId,
      ihcRejectedInboundEventId,
      ...ingressLoopAttempts.map((attempt) => attempt.inboundEventId),
      ...protectedCallerAttempts.map((attempt) => attempt.inboundEventId),
    ],
    call_records: [
      callId,
      rejectedCallId,
      knownCallId,
      ambiguousCallId,
      phoenixCallId,
      phoenixRejectedCallId,
      ihcCallId,
      ihcRejectedCallId,
      ...ingressLoopAttempts.map((attempt) => attempt.callId),
      ...protectedCallerAttempts.map((attempt) => attempt.callId),
    ],
    business_phone_numbers: [phoenixNumberId, tucsonNumberId, ihcNumberId],
    integration_connections: [weatherTechConnectionId, ihcConnectionId],
    sms_messages: [],
    customers: [],
    leads: [
      knownLeadId,
      knownIhcLeadId,
      ...ambiguousLeadIds,
      ambiguousIhcLeadId,
      driftLeadId,
    ],
  };
  const environmentSnapshot = snapshotEnvironment(HANDLER_ENV_NAMES);
  const originalFetch = globalThis.fetch;
  const client = createClient(loaded.config.supabaseUrl, loaded.config.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: guardedFetch },
  });
  let primaryError = null;
  let cleanupError = null;
  let report = null;
  let capturedIdsAuthorizedForCleanup = false;

  try {
    installHandlerEnvironment(loaded.environment, fixture);
    globalThis.fetch = guardedFetch;
    const [ingressRoute, statusRoute, webhooks] = await Promise.all([
      import(pathToFileURL(compiled.ingressRoutePath).href),
      import(pathToFileURL(compiled.statusRoutePath).href),
      import(pathToFileURL(compiled.webhooksPath).href),
    ]);
    requireCondition(typeof ingressRoute.POST === "function", "Compiled voice route has no POST handler.");
    requireCondition(typeof statusRoute.POST === "function", "Compiled voice status route has no POST handler.");

    const companies = await requireRows(
      client.from("companies").select("id,name,trade").order("name"),
      "Verify regression companies",
    );
    const weatherTech = companies.find(
      (company) => company.name === "WeatherTech Roofing LLC" && company.trade === "roofing",
    );
    const ihc = companies.find(
      (company) => company.name === "IHC Painting" && company.trade === "painting",
    );
    requireCondition(weatherTech && ihc, "Regression company identities are unavailable.");

    const routeFixtures = VOICE_ROUTES.map((route) => ({
      ...route,
      company: route.key === "ihc-primary" ? ihc : weatherTech,
      connectionId:
        route.key === "ihc-primary"
          ? ihcConnectionId
          : weatherTechConnectionId,
      numberId:
        route.key === "weathertech-phoenix"
          ? phoenixNumberId
          : route.key === "weathertech-tucson"
            ? tucsonNumberId
            : ihcNumberId,
    }));
    const tucsonFixture = routeFixtures.find(
      (route) => route.key === "weathertech-tucson",
    );
    const routeLifecycles = tucsonFixture
      ? [
          {
            ...tucsonFixture,
            parentCallSid: fixture.parentCallSid,
            childCallSid: fixture.childCallSid,
            alternateChildCallSid: fixture.alternateChildCallSid,
            rejectedParentCallSid: fixture.rejectedParentCallSid,
            callId,
            inboundEventId,
            statusEventId,
            rejectedCallId,
            rejectedInboundEventId,
          },
        ]
      : [];
    requireCondition(
      routeLifecycles.every(
        (route) =>
          route.key &&
          route.company &&
          route.ingressNumber &&
          route.destination &&
          route.numberId,
      ),
      "Synthetic Tucson voice route definition is incomplete.",
    );
    requireCondition(
      routeFixtures.length === 3 &&
        routeFixtures.every(
          (route) =>
            route.company &&
            route.ingressNumber &&
            route.numberId &&
            (route.key === "weathertech-tucson"
              ? route.communicationChannel === "sms_voice"
              : route.communicationChannel === "sms"),
        ),
      "Synthetic routes must preserve Tucson sms_voice and Phoenix/IHC sms identities.",
    );
    const tucsonRouteLifecycle = routeLifecycles.find(
      (route) => route.key === "weathertech-tucson",
    );
    requireCondition(
      tucsonRouteLifecycle,
      "Synthetic Tucson voice route is unavailable.",
    );

    await Promise.all([
      assertNoRows(
        client.from("integration_connections").select("id").in("id", capturedIds.integration_connections),
        "Voice connection ID collision",
      ),
      assertNoRows(
        client
          .from("business_phone_numbers")
          .select("id")
          .in("id", capturedIds.business_phone_numbers),
        "Voice route ID collision",
      ),
      assertNoRows(
        client
          .from("business_phone_numbers")
          .select("id")
          .in("routing_key", routeFixtures.map((route) => route.key)),
        "Voice route-key collision",
      ),
      assertNoRows(
        client
          .from("business_phone_numbers")
          .select("id")
          .in("phone_number_e164", routeFixtures.map((route) => route.ingressNumber)),
        "Voice ingress-number collision",
      ),
      assertNoRows(
        client.from("call_records").select("id").in("id", capturedIds.call_records),
        "Voice call ID collision",
      ),
      assertNoRows(
        client
          .from("call_records")
          .select("id")
          .eq("provider_account_sid", fixture.accountSid),
        "Voice synthetic-account call collision",
      ),
      assertNoRows(
        client.from("call_records").select("id").in("from_phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone call-sender collision",
      ),
      assertNoRows(
        client.from("call_records").select("id").in("to_phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone call-recipient collision",
      ),
      assertNoRows(
        client.from("leads").select("id").in("id", capturedIds.leads),
        "Voice lead ID collision",
      ),
      assertNoRows(
        client
          .from("communication_provider_events")
          .select("id")
          .in("id", capturedIds.communication_provider_events),
        "Voice event ID collision",
      ),
      assertNoRows(
        client
          .from("communication_provider_events")
          .select("id")
          .eq("provider_account_sid", fixture.accountSid),
        "Voice synthetic-account event collision",
      ),
      assertNoRows(
        client
          .from("communication_provider_events")
          .select("id")
          .in("from_phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone event-sender collision",
      ),
      assertNoRows(
        client
          .from("communication_provider_events")
          .select("id")
          .in("to_phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone event-recipient collision",
      ),
      assertNoRows(
        client.from("customers").select("id").eq("phone", CALLER_NUMBER),
        "Voice caller customer collision",
      ),
      assertNoRows(
        client.from("leads").select("id").eq("phone", CALLER_NUMBER),
        "Voice caller lead collision",
      ),
      assertNoRows(
        client
          .from("leads")
          .select("id")
          .in("phone", [KNOWN_CALLER_NUMBER, AMBIGUOUS_CALLER_NUMBER]),
        "Voice contact fixture collision",
      ),
      assertNoRows(
        client
          .from("customers")
          .select("id")
          .in("phone", [KNOWN_CALLER_NUMBER, AMBIGUOUS_CALLER_NUMBER]),
        "Voice contact customer collision",
      ),
      assertNoRows(
        client.from("leads").select("id").in("phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone lead collision",
      ),
      assertNoRows(
        client.from("customers").select("id").in("phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone customer collision",
      ),
      assertNoRows(
        client.from("sms_messages").select("id").in("from_phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone outbound SMS collision",
      ),
      assertNoRows(
        client.from("sms_messages").select("id").in("to_phone", SYNTHETIC_PHONE_NUMBERS),
        "Voice synthetic-phone inbound SMS collision",
      ),
      assertNoRows(
        client
          .from("sms_messages")
          .select("id")
          .or(`from_phone.eq.${CALLER_NUMBER},to_phone.eq.${CALLER_NUMBER},to_phone.eq.${TUCSON_NUMBER}`),
        "Voice fixture SMS collision",
      ),
    ]);
    capturedIdsAuthorizedForCleanup = true;

    await insertRows(
      client,
      "integration_connections",
      [
        {
          id: weatherTechConnectionId,
          company_id: weatherTech.id,
          display_name: `${marker} WEATHERTECH`,
        },
        {
          id: ihcConnectionId,
          company_id: ihc.id,
          display_name: `${marker} IHC`,
        },
      ].map((connection) => ({
        ...connection,
        provider: "twilio_sms",
        status: "connected",
        account_email: null,
        external_account_id: fixture.accountSid,
        provider_account_id: fixture.accountSid,
        scopes: [],
        sync_direction: "provider_to_weathertech",
        credential_reference: null,
        disabled_at: null,
        settings: { regression_marker: marker, inbound_only: true, provider_calls_disabled: true },
      })),
    );
    await insertRows(
      client,
      "business_phone_numbers",
      routeFixtures.map((route) => ({
        id: route.numberId,
        company_id: route.company.id,
        integration_connection_id: route.connectionId,
        provider: "twilio",
        provider_account_sid: fixture.accountSid,
        messaging_service_sid: fixture.messagingServiceSid,
        phone_number_e164: route.ingressNumber,
        display_name: `${marker} ${route.label}`,
        routing_key: route.key,
        business_location: route.businessLocation,
        team_queue: route.teamQueue,
        lead_source: route.leadSource,
        communication_channel: route.communicationChannel,
        time_zone: "America/Phoenix",
        routing_status: "active",
        settings: { regression_marker: marker, inbound_only: true },
      })),
    );

    const requests = [];
    for (const rejectedRoute of [
      {
        key: "weathertech-phoenix",
        ingressNumber: PHOENIX_NUMBER,
        parentCallSid: fixture.phoenixParentCallSid,
        childCallSid: fixture.phoenixChildCallSid,
      },
      {
        key: "ihc-primary",
        ingressNumber: IHC_NUMBER,
        parentCallSid: fixture.ihcParentCallSid,
        childCallSid: fixture.ihcChildCallSid,
      },
    ]) {
      requests.push(
        await invokeRoute(
          ingressRoute.POST,
          createSignedRequest(
            VOICE_PATH,
            fixture.authToken,
            ingressValues(fixture, {
              CallSid: rejectedRoute.parentCallSid,
              To: rejectedRoute.ingressNumber,
            }),
          ),
          `${rejectedRoute.key} signed sms-only voice ingress`,
          403,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
      requests.push(
        await invokeRoute(
          statusRoute.POST,
          createSignedRequest(
            STATUS_PATH,
            fixture.authToken,
            statusValues(fixture, {
              CallSid: rejectedRoute.parentCallSid,
              DialCallSid: rejectedRoute.childCallSid,
              To: rejectedRoute.ingressNumber,
            }),
          ),
          `${rejectedRoute.key} signed sms-only voice status`,
          403,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
    }
    await Promise.all([
      assertNoRows(
        client
          .from("call_records")
          .select("id")
          .in("provider_call_sid", [
            fixture.phoenixParentCallSid,
            fixture.ihcParentCallSid,
          ]),
        "Phoenix/IHC sms-only voice ingress persistence",
      ),
      assertNoRows(
        client
          .from("communication_provider_events")
          .select("id")
          .in("provider_event_sid", [
            fixture.phoenixParentCallSid,
            fixture.phoenixChildCallSid,
            fixture.ihcParentCallSid,
            fixture.ihcChildCallSid,
          ]),
        "Phoenix/IHC sms-only voice status persistence",
      ),
    ]);

    for (const attempt of ingressLoopAttempts) {
      process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO =
        attempt.destination;
      requests.push(
        await invokeRoute(
          ingressRoute.POST,
          createSignedRequest(
            VOICE_PATH,
            fixture.authToken,
            ingressValues(fixture, { CallSid: attempt.parentCallSid }),
          ),
          `Tucson rejects ${attempt.protectedRouteKey} ingress destination loop`,
          503,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
    }
    process.env.TWILIO_WEATHERTECH_TUCSON_VOICE_FORWARD_TO =
      TUCSON_FORWARD_DESTINATION;

    for (const attempt of protectedCallerAttempts) {
      requests.push(
        await invokeRoute(
          ingressRoute.POST,
          createSignedRequest(
            VOICE_PATH,
            fixture.authToken,
            ingressValues(fixture, {
              CallSid: attempt.parentCallSid,
              From: attempt.callerNumber,
            }),
          ),
          `Tucson rejects ${attempt.callerKey} caller loop`,
          403,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
    }
    await insertRows(client, "leads", [
      {
        id: knownLeadId,
        company_id: weatherTech.id,
        contact_name: `${marker} KNOWN WEATHERTECH`,
        phone: KNOWN_CALLER_NUMBER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Tucson",
        state: "AZ",
        postal_code: "85701",
        service_type: "roofing",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
      {
        id: knownIhcLeadId,
        company_id: ihc.id,
        contact_name: `${marker} KNOWN IHC ISOLATION`,
        phone: KNOWN_CALLER_NUMBER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Scottsdale",
        state: "AZ",
        postal_code: "85250",
        service_type: "painting",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
      ...ambiguousLeadIds.map((id, index) => ({
        id,
        company_id: weatherTech.id,
        contact_name: `${marker} AMBIGUOUS WEATHERTECH ${index + 1}`,
        phone: AMBIGUOUS_CALLER_NUMBER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Tucson",
        state: "AZ",
        postal_code: "85701",
        service_type: "roofing",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      })),
      {
        id: ambiguousIhcLeadId,
        company_id: ihc.id,
        contact_name: `${marker} AMBIGUOUS IHC ISOLATION`,
        phone: AMBIGUOUS_CALLER_NUMBER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Scottsdale",
        state: "AZ",
        postal_code: "85250",
        service_type: "painting",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
    ]);

    requests.push(
      await invokeRoute(
        ingressRoute.POST,
        createSignedRequest(
          VOICE_PATH,
          fixture.authToken,
          ingressValues(fixture, {
            CallSid: fixture.knownParentCallSid,
            From: KNOWN_CALLER_NUMBER,
          }),
        ),
        "same-company known caller with cross-company duplicate",
        200,
        [fixture.authToken],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );
    const [knownCalls, knownEvents] = await Promise.all([
      requireRows(client.from("call_records").select("*").eq("id", knownCallId), "Read known caller voice claim"),
      requireRows(
        client.from("communication_provider_events").select("*").eq("id", knownInboundEventId),
        "Read known caller voice event",
      ),
    ]);
    requireCondition(
      knownCalls.length === 1 &&
        knownCalls[0].lead_id === knownLeadId &&
        knownCalls[0].customer_id === null &&
        knownEvents.length === 1 &&
        knownEvents[0].lead_id === knownLeadId &&
        knownEvents[0].payload_summary?.contact_match_status === "matched_lead" &&
        knownCalls[0].lead_id !== knownIhcLeadId,
      "Known Tucson caller did not bind to the exact same-company lead.",
    );

    requests.push(
      await invokeRoute(
        ingressRoute.POST,
        createSignedRequest(
          VOICE_PATH,
          fixture.authToken,
          ingressValues(fixture, {
            CallSid: fixture.ambiguousParentCallSid,
            From: AMBIGUOUS_CALLER_NUMBER,
          }),
        ),
        "ambiguous same-company caller with cross-company isolation",
        200,
        [fixture.authToken],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );
    const [ambiguousCalls, ambiguousEvents] = await Promise.all([
      requireRows(client.from("call_records").select("*").eq("id", ambiguousCallId), "Read ambiguous caller voice claim"),
      requireRows(
        client.from("communication_provider_events").select("*").eq("id", ambiguousInboundEventId),
        "Read ambiguous caller voice event",
      ),
    ]);
    requireCondition(
      ambiguousCalls.length === 1 &&
        ambiguousCalls[0].lead_id === null &&
        ambiguousCalls[0].customer_id === null &&
        ambiguousEvents.length === 1 &&
        ambiguousEvents[0].lead_id === null &&
        ambiguousEvents[0].payload_summary?.contact_match_status === "ambiguous" &&
        ambiguousEvents[0].lead_id !== ambiguousIhcLeadId,
      "Ambiguous Tucson caller was not preserved unassigned within WeatherTech.",
    );

    await deleteExactIds(client, "communication_provider_events", [
      knownInboundEventId,
      ambiguousInboundEventId,
    ]);
    await deleteExactIds(client, "call_records", [knownCallId, ambiguousCallId]);
    const contactFixtureLeadIds = [
      knownLeadId,
      knownIhcLeadId,
      ...ambiguousLeadIds,
      ambiguousIhcLeadId,
    ];
    await deleteLeadAccountabilityForExactLeadIds(client, contactFixtureLeadIds);
    await deleteExactIds(client, "leads", contactFixtureLeadIds);

    const destinationProof = webhooks.createTwilioVoiceDestinationProof({
      parentCallSid: fixture.parentCallSid,
      destination: tucsonRouteLifecycle.destination,
    });
    const initialFingerprint = webhooks.createTwilioVoicePayloadFingerprint({
      kind: "voice_inbound",
      accountSid: fixture.accountSid,
      callSid: fixture.parentCallSid,
      parentCallSid: null,
      from: CALLER_NUMBER,
      to: TUCSON_NUMBER,
      callStatus: "ringing",
      providerDialStatus: null,
      direction: "inbound",
      durationSeconds: null,
      dialBridged: null,
      companyId: weatherTech.id,
      destinationProof,
    });
    requireCondition(/^[a-f0-9]{64}$/.test(destinationProof), "Synthetic destination proof is unavailable.");
    await insertRows(client, "call_records", [
      {
        id: callId,
        company_id: weatherTech.id,
        business_phone_number_id: numberId,
        integration_connection_id: connectionId,
        customer_id: null,
        lead_id: null,
        job_id: null,
        provider: "twilio",
        provider_account_sid: fixture.accountSid,
        provider_call_sid: fixture.parentCallSid,
        provider_parent_call_sid: null,
        direction: "inbound",
        call_status: "ringing",
        from_phone: CALLER_NUMBER,
        to_phone: TUCSON_NUMBER,
        business_phone: TUCSON_NUMBER,
        customer_phone: CALLER_NUMBER,
        routing_status: "matched",
        started_at: fixture.startedAt,
        answered_at: null,
        ended_at: null,
        duration_seconds: null,
        recording_sid: null,
        recording_status: "not_requested",
        recording_duration_seconds: null,
        transcript_status: "not_requested",
        follow_up_required: false,
        correlation_id: callId,
        metadata: {
          ingestion_status: "claimed",
          contact_match_status: "unmatched",
          source: "authenticated_twilio_voice_webhook",
          initial_request_fingerprint: initialFingerprint,
          forward_destination_proof: destinationProof,
          recording_requested: false,
          transcription_requested: false,
          automatic_lead_created: false,
        },
      },
    ]);
    await insertRows(client, "leads", [
      {
        id: driftLeadId,
        company_id: weatherTech.id,
        contact_name: `${marker} POST-CLAIM MATCH DRIFT`,
        phone: CALLER_NUMBER,
        email: null,
        property_address: "TEST WTOS REGRESSION ONLY",
        city: "Tucson",
        state: "AZ",
        postal_code: "85701",
        service_type: "roofing",
        source: marker,
        status: "new",
        priority: "normal",
        estimated_value: 0,
        notes: marker,
      },
    ]);
    const recovered = await invokeRoute(
      ingressRoute.POST,
      createSignedRequest(VOICE_PATH, fixture.authToken, ingressValues(fixture)),
      "retry recovery after partial call claim",
      200,
      [fixture.authToken, ...getOtherRouteDestinations(tucsonRouteLifecycle)],
    );
    requireCondition(
      hasExactRouteDialTwiML(recovered.body, tucsonRouteLifecycle),
      "Recovered ingress did not return only the exact Tucson SDK Dial destination.",
    );
    requests.push({ case: recovered.case, status: recovered.status });
    const recoveredCalls = await requireRows(
      client.from("call_records").select("*").eq("id", callId),
      "Verify recovered partial call claim",
    );
    const recoveredEvents = await requireRows(
      client.from("communication_provider_events").select("*").eq("id", inboundEventId),
      "Verify recovered inbound event",
    );
    requireCondition(
      recoveredCalls.length === 1 &&
        recoveredCalls[0].metadata?.ingestion_status === "complete" &&
        recoveredCalls[0].lead_id === null &&
        recoveredEvents.length === 1,
      "Partial call claim did not safely converge on retry.",
    );
    requireCondition(
      recoveredEvents[0].lead_id === null &&
        recoveredEvents[0].payload_summary?.contact_match_status === "unmatched",
      "Partial call retry adopted mutable CRM contact drift instead of its stored claim.",
    );
    await deleteLeadAccountabilityForExactLeadIds(client, [driftLeadId]);
    await deleteExactIds(client, "leads", [driftLeadId]);

    await deleteExactIds(client, "communication_provider_events", [inboundEventId]);
    await deleteExactIds(client, "call_records", [callId]);
    const concurrentIngress = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        invokeRoute(
          ingressRoute.POST,
          createSignedRequest(VOICE_PATH, fixture.authToken, ingressValues(fixture)),
          `concurrent exact ingress ${index + 1}`,
          200,
          [fixture.authToken, ...getOtherRouteDestinations(tucsonRouteLifecycle)],
        ),
      ),
    );
    requireCondition(
      concurrentIngress.every((result) =>
        hasExactRouteDialTwiML(result.body, tucsonRouteLifecycle),
      ),
      "Concurrent Tucson ingress did not converge on its exact SDK Dial destination.",
    );
    requests.push(...concurrentIngress.map(({ case: label, status }) => ({ case: label, status })));
    const exactTucsonIngressReplay = await invokeRoute(
      ingressRoute.POST,
      createSignedRequest(VOICE_PATH, fixture.authToken, ingressValues(fixture)),
      "exact ingress replay",
      200,
      [fixture.authToken, ...getOtherRouteDestinations(tucsonRouteLifecycle)],
    );
    requireCondition(
      hasExactRouteDialTwiML(exactTucsonIngressReplay.body, tucsonRouteLifecycle),
      "Exact Tucson ingress replay did not return only its route destination.",
    );
    requests.push({
      case: exactTucsonIngressReplay.case,
      status: exactTucsonIngressReplay.status,
    });
    requests.push(
      await invokeRoute(
        ingressRoute.POST,
        createSignedRequest(
          VOICE_PATH,
          fixture.authToken,
          ingressValues(fixture, { From: CONFLICTING_CALLER_NUMBER }),
        ),
        "changed same parent ingress conflict",
        409,
        [fixture.authToken, ...FORWARD_DESTINATIONS],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );

    requests.push(
      await invokeRoute(
        statusRoute.POST,
        createSignedRequest(
          STATUS_PATH,
          fixture.authToken,
          statusValues(fixture, { CallSid: fixture.missingParentCallSid }),
        ),
        "status without exact parent claim",
        403,
        [fixture.authToken, ...FORWARD_DESTINATIONS],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );
    requests.push(
      await invokeRoute(
        statusRoute.POST,
        createSignedRequest(STATUS_PATH, "forged-regression-signature-token", statusValues(fixture)),
        "forged voice status signature",
        403,
        [fixture.authToken, ...FORWARD_DESTINATIONS],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );
    requests.push(
      await invokeRoute(
        statusRoute.POST,
        createSignedRequest(
          STATUS_PATH,
          fixture.authToken,
          statusValues(fixture, { To: IHC_NUMBER }),
        ),
        "cross-company IHC status route",
        403,
        [fixture.authToken, ...FORWARD_DESTINATIONS],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );
    requests.push(
      await invokeRoute(
        statusRoute.POST,
        createSignedRequest(
          STATUS_PATH,
          fixture.authToken,
          statusValues(fixture, { From: KNOWN_CALLER_NUMBER }),
        ),
        "forged parent caller identity",
        403,
        [fixture.authToken, ...FORWARD_DESTINATIONS],
      ).then(({ case: label, status }) => ({ case: label, status })),
    );

    for (const route of routeLifecycles) {
      await setRouteChannel(client, route.numberId, "sms", route.label);
      process.env[route.gateEnv] = "false";
      delete process.env[route.destinationEnv];
      const statusRequestValues = {
        CallSid: route.parentCallSid,
        DialCallSid: route.childCallSid,
        To: route.ingressNumber,
      };
      const concurrentStatus = await Promise.all(
        Array.from(
          { length: route.key === "weathertech-tucson" ? 8 : 4 },
          (_, index) =>
            invokeRoute(
              statusRoute.POST,
              createSignedRequest(
                STATUS_PATH,
                fixture.authToken,
                statusValues(fixture, statusRequestValues),
              ),
              `${route.key} rollback-safe concurrent status ${index + 1}`,
              200,
              [fixture.authToken, ...FORWARD_DESTINATIONS],
            ),
        ),
      );
      requests.push(
        ...concurrentStatus.map(({ case: label, status }) => ({ case: label, status })),
      );
      requests.push(
        await invokeRoute(
          statusRoute.POST,
          createSignedRequest(
            STATUS_PATH,
            fixture.authToken,
            statusValues(fixture, statusRequestValues),
          ),
          `${route.key} exact status replay after rollback`,
          200,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
      requests.push(
        await invokeRoute(
          statusRoute.POST,
          createSignedRequest(
            STATUS_PATH,
            fixture.authToken,
            statusValues(fixture, {
              ...statusRequestValues,
              DialCallSid: route.alternateChildCallSid,
            }),
          ),
          `${route.key} different child status conflict`,
          409,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
      requests.push(
        await invokeRoute(
          statusRoute.POST,
          createSignedRequest(
            STATUS_PATH,
            fixture.authToken,
            statusValues(fixture, {
              ...statusRequestValues,
              DialCallStatus: "no-answer",
              DialCallDuration: "0",
              DialBridged: "false",
            }),
          ),
          `${route.key} different terminal status conflict`,
          409,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );

      process.env[route.gateEnv] = "true";
      process.env[route.destinationEnv] = route.destination;
      requests.push(
        await invokeRoute(
          ingressRoute.POST,
          createSignedRequest(
            VOICE_PATH,
            fixture.authToken,
            ingressValues(fixture, {
              CallSid: route.rejectedParentCallSid,
              To: route.ingressNumber,
            }),
          ),
          `${route.key} new ingress blocked after sms-only rollback`,
          403,
          [fixture.authToken, ...FORWARD_DESTINATIONS],
        ).then(({ case: label, status }) => ({ case: label, status })),
      );
    }

    const [
      calls,
      events,
      accountCalls,
      accountEvents,
      customers,
      leads,
      smsFrom,
      smsTo,
    ] = await Promise.all([
      requireRows(client.from("call_records").select("*").in("id", capturedIds.call_records), "Read voice calls"),
      requireRows(
        client
          .from("communication_provider_events")
          .select("*")
          .in("id", capturedIds.communication_provider_events),
        "Read voice provider events",
      ),
      requireRows(
        client
          .from("call_records")
          .select("id,direction")
          .eq("provider_account_sid", fixture.accountSid),
        "Read all synthetic-account calls",
      ),
      requireRows(
        client
          .from("communication_provider_events")
          .select("id,direction")
          .eq("provider_account_sid", fixture.accountSid),
        "Read all synthetic-account provider events",
      ),
      requireRows(
        client.from("customers").select("id").in("phone", SYNTHETIC_PHONE_NUMBERS),
        "Read synthetic-phone customers",
      ),
      requireRows(
        client.from("leads").select("id").in("phone", SYNTHETIC_PHONE_NUMBERS),
        "Read synthetic-phone leads",
      ),
      requireRows(
        client
          .from("sms_messages")
          .select("id")
          .in("from_phone", SYNTHETIC_PHONE_NUMBERS),
        "Read synthetic-phone sent SMS",
      ),
      requireRows(
        client
          .from("sms_messages")
          .select("id")
          .in("to_phone", SYNTHETIC_PHONE_NUMBERS),
        "Read synthetic-phone received SMS",
      ),
    ]);
    requireCondition(
      calls.length === routeLifecycles.length,
      "Voice regression did not persist exactly one parent call per route.",
    );
    requireCondition(
      events.length === routeLifecycles.length * 2,
      "Voice regression did not persist exactly one inbound and one status event per route.",
    );
    requireCondition(
      accountCalls.length === calls.length &&
        accountCalls.every(
          (row) => row.direction === "inbound" && calls.some((call) => call.id === row.id),
        ),
      "Voice regression created an unexpected or outbound call record.",
    );
    requireCondition(
      accountEvents.length === events.length &&
        accountEvents.every((row) => events.some((event) => event.id === row.id)),
      "Voice regression created an unexpected provider event.",
    );
    const storedDestinationProofs = [];
    for (const route of routeLifecycles) {
      const routeCall = calls.find((candidate) => candidate.id === route.callId);
      const routeInboundEvent = events.find(
        (candidate) => candidate.id === route.inboundEventId,
      );
      const routeStatusEvent = events.find(
        (candidate) => candidate.id === route.statusEventId,
      );
      requireCondition(
        routeCall && routeInboundEvent && routeStatusEvent,
        `${route.label} voice lifecycle did not converge on its exact deterministic identities.`,
      );
      requireCondition(
        routeCall.company_id === route.company.id &&
          routeCall.business_phone_number_id === route.numberId &&
          routeCall.integration_connection_id === route.connectionId &&
          routeCall.provider_account_sid === fixture.accountSid &&
          routeCall.provider_call_sid === route.parentCallSid &&
          routeCall.direction === "inbound" &&
          routeCall.to_phone === route.ingressNumber &&
          routeCall.business_phone === route.ingressNumber &&
          routeCall.from_phone === CALLER_NUMBER &&
          routeCall.customer_phone === CALLER_NUMBER &&
          routeCall.call_status === "completed" &&
          routeCall.duration_seconds === DIAL_DURATION_SECONDS &&
          routeCall.recording_sid === null &&
          routeCall.recording_status === "not_requested" &&
          routeCall.transcript_status === "not_requested" &&
          routeCall.metadata?.recording_requested === false &&
          routeCall.metadata?.transcription_requested === false &&
          routeCall.metadata?.automatic_lead_created === false,
        `${route.label} parent call crossed its exact company, branch, account, or caller identity.`,
      );
      requireCondition(
        routeInboundEvent.company_id === route.company.id &&
          routeInboundEvent.business_phone_number_id === route.numberId &&
          routeInboundEvent.integration_connection_id === route.connectionId &&
          routeInboundEvent.provider_event_sid === route.parentCallSid &&
          routeInboundEvent.event_type === "voice_inbound" &&
          routeInboundEvent.direction === "inbound" &&
          routeInboundEvent.to_phone === route.ingressNumber,
        `${route.label} inbound evidence crossed its exact route identity.`,
      );
      requireCondition(
        routeStatusEvent.company_id === route.company.id &&
          routeStatusEvent.business_phone_number_id === route.numberId &&
          routeStatusEvent.integration_connection_id === route.connectionId &&
          routeStatusEvent.provider_event_sid === route.childCallSid &&
          routeStatusEvent.provider_parent_sid === route.parentCallSid &&
          routeStatusEvent.event_type === "voice_status" &&
          routeStatusEvent.direction === "outbound" &&
          routeStatusEvent.payload_summary?.provider_dial_status === "completed" &&
          routeStatusEvent.payload_summary?.dial_bridged === true,
        `${route.label} status evidence crossed its exact route or call graph.`,
      );
      requireCondition(
        routeCall.metadata?.forward_destination_proof ===
          webhooks.createTwilioVoiceDestinationProof({
            routeKey: route.key,
            parentCallSid: route.parentCallSid,
            destination: route.destination,
          }) &&
          /^[a-f0-9]{64}$/.test(
            routeCall.metadata?.forward_destination_proof ?? "",
          ) &&
        routeCall.metadata?.forward_destination_proof ===
          routeInboundEvent.response_summary?.forward_destination_proof &&
          routeCall.metadata?.forward_destination_proof ===
            routeStatusEvent.payload_summary?.forward_destination_proof,
        `${route.label} destination proof did not remain exact and consistent.`,
      );
      storedDestinationProofs.push(routeCall.metadata.forward_destination_proof);
    }
    requireCondition(
      storedDestinationProofs.length === 1 &&
        new Set(storedDestinationProofs).size === 1,
      "Tucson did not produce exactly one bounded destination proof.",
    );
    const call = calls.find((candidate) => candidate.id === callId);
    const inboundEvent = events.find((event) => event.id === inboundEventId);
    const statusEvent = events.find((event) => event.id === statusEventId);
    requireCondition(call && inboundEvent && statusEvent, "Tucson voice proof did not remain intact.");
    requireCondition(
      inboundEvent.event_type === "voice_inbound" &&
        inboundEvent.provider_event_sid === fixture.parentCallSid &&
        inboundEvent.provider_parent_sid === null &&
        inboundEvent.direction === "inbound",
      "Inbound voice event evidence is incorrect.",
    );
    requireCondition(
      statusEvent.event_type === "voice_status" &&
        statusEvent.provider_event_sid === fixture.childCallSid &&
        statusEvent.provider_parent_sid === fixture.parentCallSid &&
        statusEvent.direction === "outbound" &&
        statusEvent.payload_summary?.provider_dial_status === "completed" &&
        statusEvent.payload_summary?.dial_bridged === true,
      "Dial outcome evidence is incorrect.",
    );
    const expectedEndedAt = new Date(fixture.endedAt).toISOString();
    const expectedAnsweredAt = new Date(
      new Date(fixture.endedAt).getTime() - DIAL_DURATION_SECONDS * 1000,
    ).toISOString();
    requireCondition(
      call.call_status === "completed" &&
        new Date(call.started_at).getTime() === new Date(fixture.startedAt).getTime() &&
        new Date(call.ended_at).getTime() === new Date(expectedEndedAt).getTime() &&
        new Date(call.answered_at).getTime() === new Date(expectedAnsweredAt).getTime() &&
        call.duration_seconds === DIAL_DURATION_SECONDS,
      "Completed call timing evidence is not stable or truthfully derived.",
    );
    requireCondition(
      call.recording_sid === null &&
        call.recording_status === "not_requested" &&
        call.recording_duration_seconds === null &&
        call.transcript_status === "not_requested" &&
        call.metadata?.recording_requested === false &&
        call.metadata?.transcription_requested === false &&
        call.metadata?.automatic_lead_created === false,
      "Voice regression observed recording, transcription, or automatic lead behavior.",
    );
    requireCondition(
      customers.length === 0 && leads.length === 0 && smsFrom.length === 0 && smsTo.length === 0,
      "Voice regression created a customer, lead, or SMS side effect.",
    );
    const storedEvidence = JSON.stringify({ calls, events });
    requireCondition(
      FORWARD_DESTINATIONS.every(
        (destination) => !storedEvidence.includes(destination),
      ) &&
        !storedEvidence.includes(PHOENIX_PUBLIC_SOURCE) &&
        !storedEvidence.includes(IHC_PUBLIC_SOURCE),
      "Stored voice evidence contains a raw route terminal or public source.",
    );
    requireCondition(
      /^[a-f0-9]{64}$/.test(call.metadata?.forward_destination_proof ?? "") &&
        call.metadata?.forward_destination_proof ===
          inboundEvent.response_summary?.forward_destination_proof &&
        call.metadata?.forward_destination_proof ===
          statusEvent.payload_summary?.forward_destination_proof,
      "Stored voice destination proof did not remain consistent.",
    );
    requireCondition(
      counters.blockedExternalRequests === 0,
      "A provider or non-regression network operation was attempted.",
    );

    report = {
      result: "PASS",
      target: TWILIO_VOICE_REGRESSION_PROJECT_REF,
      runId,
      externalEnvironmentOnly: loaded.source === "external_file",
      compiledProductionRoutes: true,
      officialSignatureValidation: true,
      requests: requests.map(({ body: _body, ...request }) => request),
      parentCalls: calls.length,
      providerEvents: events.length,
      routeKeys: routeLifecycles.map((route) => route.key),
      exactRouteLifecycles: routeLifecycles.length,
      tucsonOnlyVoiceLifecycleVerified: true,
      phoenixAndIhcSmsOnlyRoutesVerified: true,
      exactRouteTwiMLVerified: true,
      smsOnlyVoiceIngressRejected: true,
      smsOnlyVoiceStatusRejected: true,
      staleLegacyVoiceEnvironmentIgnored: true,
      allThreeIngressDestinationLoopsRejected: true,
      protectedCallerLoopsRejected: true,
      exactCompanyAndBranchIsolationVerified: true,
      partialClaimRetryRecovered: true,
      crmMatchDriftPreservedOriginalClaim: true,
      knownSameCompanyCallerMatched: true,
      ambiguousSameCompanyCallerUnassigned: true,
      crossCompanyContactIsolationVerified: true,
      concurrentIngressConverged: true,
      conflictingIngressRejected: true,
      parentlessStatusRejected: true,
      forgedStatusRejected: true,
      crossCompanyStatusRejected: true,
      forgedParentIdentityRejected: true,
      rollbackStatusReconciled: true,
      tucsonRollbackVerified: true,
      concurrentStatusConverged: true,
      conflictingChildRejected: true,
      conflictingStatusRejected: true,
      newIngressBlockedAfterRollback: true,
      completedTimingEvidenceVerified: true,
      rawDestinationStored: false,
      recordingRequested: false,
      transcriptionRequested: false,
      automaticLeadCreated: false,
      automaticCustomerCreated: false,
      outboundCallRecords: 0,
      outboundSmsCreated: false,
      providerNetworkRequests: 0,
      cleanupResidue: null,
    };
  } catch (error) {
    primaryError = error;
  } finally {
    try {
      if (capturedIdsAuthorizedForCleanup) {
        await discoverExactPhoneSideEffects(client, capturedIds);
        await deleteExactIds(
          client,
          "communication_provider_events",
          capturedIds.communication_provider_events,
        );
        await deleteExactIds(client, "sms_messages", capturedIds.sms_messages);
        await deleteExactIds(client, "call_records", capturedIds.call_records);
        const accountabilityCleanup = await deleteLeadAccountabilityForExactLeadIds(
          client,
          capturedIds.leads,
        );
        if (accountabilityCleanup.eventIds.length) {
          capturedIds.lead_accountability_events = accountabilityCleanup.eventIds;
        }
        if (accountabilityCleanup.accountabilityIds.length) {
          capturedIds.lead_accountability = accountabilityCleanup.accountabilityIds;
        }
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
            assertExactIdsAbsent(client, table, ids, "Twilio voice cleanup"),
          ),
        );
        await Promise.all([
          assertNoRows(
            client.from("call_records").select("id").eq("provider_call_sid", fixture.parentCallSid),
            "Twilio voice parent-SID cleanup",
          ),
          assertNoRows(
            client
              .from("communication_provider_events")
              .select("id")
              .eq("provider_parent_sid", fixture.parentCallSid),
            "Twilio voice parent-event cleanup",
          ),
          assertNoRows(
            client
              .from("business_phone_numbers")
              .select("id")
              .in("routing_key", VOICE_ROUTES.map((route) => route.key)),
            "Twilio exact voice-route cleanup",
          ),
          assertNoRows(
            client.from("leads").select("id").in("phone", SYNTHETIC_PHONE_NUMBERS),
            "Twilio voice exact-phone lead cleanup",
          ),
          assertNoRows(
            client.from("customers").select("id").in("phone", SYNTHETIC_PHONE_NUMBERS),
            "Twilio voice exact-phone customer cleanup",
          ),
          assertNoRows(
            client.from("sms_messages").select("id").in("from_phone", SYNTHETIC_PHONE_NUMBERS),
            "Twilio voice exact-phone sent-SMS cleanup",
          ),
          assertNoRows(
            client.from("sms_messages").select("id").in("to_phone", SYNTHETIC_PHONE_NUMBERS),
            "Twilio voice exact-phone received-SMS cleanup",
          ),
        ]);
        const finalVerification = await runRegressionEnvironmentCommand({
          command: "verify",
          env: loaded.environment,
          fetchImpl: guardedFetch,
        });
        requireCondition(
          finalVerification.target === TWILIO_VOICE_REGRESSION_PROJECT_REF &&
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
      "Twilio voice regression failed and exact-ID cleanup also failed.",
    );
  }
  if (cleanupError) {
    throw cleanupError;
  }
  if (primaryError) {
    throw primaryError;
  }
  requireCondition(report?.cleanupResidue === 0, "Twilio voice regression did not prove zero residue.");
  return report;
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runTwilioVoiceInboundRegression({ cwd: dirname(dirname(process.argv[1])) })
    .then((report) => {
      console.log("WeatherTech OS Tucson-only Twilio voice inbound regression: PASS");
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((error) => {
      console.error(
        `WeatherTech OS Tucson-only Twilio voice inbound regression: FAIL: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    });
}
