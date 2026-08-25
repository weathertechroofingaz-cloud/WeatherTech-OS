import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import twilio from "twilio";
import type {
  BusinessPhoneNumberRecord,
  CallRecord,
  CallRecordInsert,
  CommunicationProviderEventInsert,
  CommunicationProviderEventRecord,
  CustomerRecord,
  Database,
  IntegrationConnectionRecord,
  LeadRecord,
  SmsMessageInsert,
  SmsMessageRecord,
} from "../crm/types";
import {
  getTwilioBusinessNumberRouteTemplate,
  matchesTwilioBusinessRouteTemplate,
  normalizeTwilioPhoneNumber,
} from "./foundation";
import {
  getTwilioExpectedBusinessNumbers,
  getTwilioServerConfig,
} from "./serverClient";

export { normalizeTwilioPhoneNumber } from "./foundation";

export type TwilioWebhookKind =
  | "sms_inbound"
  | "sms_status"
  | "voice_inbound"
  | "voice_status"
  | "recording_status";

export type TwilioSignatureStatus =
  | "valid"
  | "invalid"
  | "missing_auth_token"
  | "missing_public_base_url"
  | "missing_signature"
  | "unsupported_content_type"
  | "payload_too_large"
  | "malformed_request";

export type TwilioWebhookPayload = {
  kind: TwilioWebhookKind;
  accountSid: string | null;
  messageSid: string | null;
  callSid: string | null;
  dialCallSid: string | null;
  parentCallSid: string | null;
  recordingSid: string | null;
  messagingServiceSid: string | null;
  numMedia: number | null;
  from: string | null;
  to: string | null;
  body: string | null;
  messageStatus: string | null;
  callStatus: string | null;
  dialCallStatus: string | null;
  recordingStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationSeconds: number | null;
  dialCallDurationSeconds: number | null;
  dialBridged: boolean | null;
  recordingDurationSeconds: number | null;
  direction: string | null;
  occurredAt: string;
};

export type ParsedTwilioWebhookRequest = {
  payload: TwilioWebhookPayload;
  signatureStatus: TwilioSignatureStatus;
  signatureEvidence: string | null;
};

export type TwilioStorageResult = {
  stored: boolean;
  duplicate: boolean;
  migrationRequired: boolean;
  providerEventId: string | null;
  smsMessageId: string | null;
  callRecordId: string | null;
  routingStatus: "matched" | "needs_review" | "unassigned" | "migration_required";
  skippedReason: string | null;
};

type CrmClient = SupabaseClient<Database>;

type VerifiedRoute = {
  number: BusinessPhoneNumberRecord;
  connection: IntegrationConnectionRecord;
};

type ContactMatch = {
  customerId: string | null;
  leadId: string | null;
  status: "matched_customer" | "matched_lead" | "unmatched" | "ambiguous";
};

type MessageClaim = {
  duplicate: boolean;
  message: SmsMessageRecord;
  contactStatus: ContactMatch["status"];
};

const MAX_FORM_BYTES = 64 * 1024;
const MAX_MESSAGE_BODY_LENGTH = 16_000;
const MAX_CALL_DURATION_SECONDS = 24 * 60 * 60;
const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const CALL_SID_PATTERN = /^CA[0-9a-fA-F]{32}$/;
const MESSAGE_SID_PATTERN = /^SM[0-9a-fA-F]{32}$/;
const MESSAGING_SERVICE_SID_PATTERN = /^MG[0-9a-fA-F]{32}$/;
const STRICT_E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const CRITICAL_FORM_FIELDS = [
  "AccountSid",
  "MessageSid",
  "SmsSid",
  "SmsMessageSid",
  "From",
  "To",
  "Body",
  "MessagingServiceSid",
  "NumMedia",
  "CallSid",
  "DialCallSid",
  "ParentCallSid",
  "CallStatus",
  "DialCallStatus",
  "Direction",
  "CallDuration",
  "DialCallDuration",
  "DialBridged",
  "Timestamp",
] as const;

function getEnvValue(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getBooleanEnvValue(name: string) {
  return getEnvValue(name)?.toLowerCase() === "true";
}

function getServiceSupabaseClient(): CrmClient | null {
  const url = getEnvValue("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function emptyPayload(kind: TwilioWebhookKind): TwilioWebhookPayload {
  return {
    kind,
    accountSid: null,
    messageSid: null,
    callSid: null,
    dialCallSid: null,
    parentCallSid: null,
    recordingSid: null,
    messagingServiceSid: null,
    numMedia: null,
    from: null,
    to: null,
    body: null,
    messageStatus: null,
    callStatus: null,
    dialCallStatus: null,
    recordingStatus: null,
    errorCode: null,
    errorMessage: null,
    durationSeconds: null,
    dialCallDurationSeconds: null,
    dialBridged: null,
    recordingDurationSeconds: null,
    direction: null,
    occurredAt: new Date().toISOString(),
  };
}

function parsedResult(
  payload: TwilioWebhookPayload,
  signatureStatus: TwilioSignatureStatus,
  signatureEvidence: string | null = null,
): ParsedTwilioWebhookRequest {
  return { payload, signatureStatus, signatureEvidence };
}

function getOnlyFormValue(params: URLSearchParams, keys: readonly string[]) {
  const values = keys
    .flatMap((key) => params.getAll(key))
    .map((value) => value.trim())
    .filter(Boolean);
  const distinctValues = new Set(values);
  return distinctValues.size === 1 ? values[0] : null;
}

function hasDuplicateCriticalField(params: URLSearchParams) {
  return CRITICAL_FORM_FIELDS.some((field) => params.getAll(field).length > 1);
}

function hasConflictingMessageSidAliases(params: URLSearchParams) {
  const values = ["MessageSid", "SmsSid", "SmsMessageSid"]
    .flatMap((field) => params.getAll(field))
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(values).size > 1;
}

function buildPayload(params: URLSearchParams, kind: TwilioWebhookKind) {
  const payload = emptyPayload(kind);
  payload.accountSid = getOnlyFormValue(params, ["AccountSid"]);
  payload.messageSid = getOnlyFormValue(params, [
    "MessageSid",
    "SmsSid",
    "SmsMessageSid",
  ]);
  payload.messagingServiceSid = getOnlyFormValue(params, ["MessagingServiceSid"]);
  const numMedia = getOnlyFormValue(params, ["NumMedia"]);
  payload.numMedia = numMedia && /^\d+$/.test(numMedia) ? Number.parseInt(numMedia, 10) : null;
  payload.from = getOnlyFormValue(params, ["From"]);
  payload.to = getOnlyFormValue(params, ["To"]);
  payload.body = params.has("Body") ? params.get("Body") : null;
  payload.messageStatus = getOnlyFormValue(params, ["MessageStatus", "SmsStatus"]);
  payload.callSid = getOnlyFormValue(params, ["CallSid"]);
  payload.dialCallSid = getOnlyFormValue(params, ["DialCallSid"]);
  payload.parentCallSid = getOnlyFormValue(params, ["ParentCallSid"]);
  payload.recordingSid = getOnlyFormValue(params, ["RecordingSid"]);
  payload.callStatus = getOnlyFormValue(params, ["CallStatus"]);
  payload.dialCallStatus = getOnlyFormValue(params, ["DialCallStatus"]);
  payload.recordingStatus = getOnlyFormValue(params, ["RecordingStatus"]);
  payload.errorCode = getOnlyFormValue(params, ["ErrorCode"]);
  payload.errorMessage = getOnlyFormValue(params, ["ErrorMessage"]);
  const durationSeconds = getOnlyFormValue(params, ["CallDuration"]);
  payload.durationSeconds =
    durationSeconds && /^\d+$/.test(durationSeconds)
      ? Number.parseInt(durationSeconds, 10)
      : null;
  const dialCallDurationSeconds = getOnlyFormValue(params, ["DialCallDuration"]);
  payload.dialCallDurationSeconds =
    dialCallDurationSeconds && /^\d+$/.test(dialCallDurationSeconds)
      ? Number.parseInt(dialCallDurationSeconds, 10)
      : null;
  const dialBridged = getOnlyFormValue(params, ["DialBridged"]);
  payload.dialBridged =
    dialBridged === "true" ? true : dialBridged === "false" ? false : null;
  payload.direction = getOnlyFormValue(params, ["Direction"]);
  const occurredAt = getOnlyFormValue(params, ["Timestamp"]);
  if (occurredAt) {
    const timestamp = new Date(occurredAt);
    if (!Number.isNaN(timestamp.getTime())) {
      payload.occurredAt = timestamp.toISOString();
    }
  }
  return payload;
}

function getCanonicalFormFingerprint(params: URLSearchParams) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        Array.from(params.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
          const keyOrder = leftKey.localeCompare(rightKey);
          return keyOrder || leftValue.localeCompare(rightValue);
        }),
      ),
      "utf8",
    )
    .digest("hex");
}

function getConfiguredTwilioPublicOrigin() {
  return getTwilioServerConfig().publicBaseUrl;
}

function getCanonicalWebhookUrl(request: NextRequest) {
  const publicOrigin = getConfiguredTwilioPublicOrigin();

  return publicOrigin
    ? new URL(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
        `${publicOrigin}/`,
      ).toString()
    : null;
}

export async function parseTwilioWebhookRequest(
  request: NextRequest,
  expectedKind: TwilioWebhookKind,
): Promise<ParsedTwilioWebhookRequest> {
  const empty = emptyPayload(expectedKind);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();

  if (contentType !== "application/x-www-form-urlencoded") {
    return parsedResult(empty, "unsupported_content_type");
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FORM_BYTES) {
    return parsedResult(empty, "payload_too_large");
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return parsedResult(empty, "malformed_request");
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_FORM_BYTES) {
    return parsedResult(empty, "payload_too_large");
  }

  const params = new URLSearchParams(rawBody);
  const payload = buildPayload(params, expectedKind);

  if (hasDuplicateCriticalField(params) || hasConflictingMessageSidAliases(params)) {
    return parsedResult(payload, "malformed_request");
  }
  if (
    expectedKind === "voice_status" &&
    ((params.has("DialCallDuration") &&
      (payload.dialCallDurationSeconds === null ||
        payload.dialCallDurationSeconds > MAX_CALL_DURATION_SECONDS)) ||
      (params.has("DialBridged") && payload.dialBridged === null))
  ) {
    return parsedResult(payload, "malformed_request");
  }

  const authToken = getEnvValue("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    return parsedResult(payload, "missing_auth_token");
  }

  const canonicalUrl = getCanonicalWebhookUrl(request);
  if (!canonicalUrl) {
    return parsedResult(payload, "missing_public_base_url");
  }

  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!signature) {
    return parsedResult(payload, "missing_signature");
  }

  const signatureParameters = Object.fromEntries(params.entries());
  const valid = twilio.validateRequest(authToken, signature, canonicalUrl, signatureParameters);
  const signatureEvidence = valid
    ? crypto
        .createHmac("sha256", authToken)
        .update(
          JSON.stringify({
            canonicalUrl,
            formFingerprint: getCanonicalFormFingerprint(params),
          }),
          "utf8",
        )
        .digest("hex")
    : null;
  return parsedResult(payload, valid ? "valid" : "invalid", signatureEvidence);
}

function createTwilioVoiceSecretProof(namespace: string, payload: Record<string, unknown>) {
  const authToken = getEnvValue("TWILIO_AUTH_TOKEN");

  if (!authToken) {
    return null;
  }

  return crypto
    .createHmac("sha256", authToken)
    .update(JSON.stringify({ namespace, version: 1, ...payload }), "utf8")
    .digest("hex");
}

export function createTwilioVoiceDestinationProof(input: {
  parentCallSid: string;
  destination: string;
}) {
  return createTwilioVoiceSecretProof("wtos:twilio:tucson-forward-destination", input);
}

export function createTwilioVoicePayloadFingerprint(input: {
  kind: "voice_inbound" | "voice_status";
  accountSid: string;
  callSid: string;
  parentCallSid: string | null;
  from: string | null;
  to: string;
  callStatus: string;
  providerDialStatus: string | null;
  direction: string;
  durationSeconds: number | null;
  dialBridged: boolean | null;
  companyId: string;
  destinationProof: string;
}) {
  return crypto.createHash("sha256").update(JSON.stringify(input), "utf8").digest("hex");
}

export function createTwilioVoiceEvidenceProof(input: {
  kind: "voice_inbound" | "voice_status";
  callRecordId: string;
  eventId: string;
  companyId: string;
  connectionId: string;
  businessPhoneNumberId: string;
  accountSid: string;
  callSid: string;
  parentCallSid: string | null;
  requestFingerprint: string;
  signatureEvidence: string;
  destinationProof: string;
}) {
  return createTwilioVoiceSecretProof("wtos:twilio:tucson-voice-evidence", input);
}

function deterministicUuid(namespace: string, ...parts: string[]) {
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

export function createTwilioInboundPayloadFingerprint(payload: {
  accountSid: string;
  messageSid: string;
  messagingServiceSid: string;
  from: string;
  to: string;
  body: string;
  companyId: string;
}) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload), "utf8")
    .digest("hex");
}

export function createTwilioInboundEvidenceProof(input: {
  messageId: string;
  eventId: string;
  companyId: string;
  connectionId: string;
  businessPhoneNumberId: string;
  customerId: string | null;
  leadId: string | null;
  accountSid: string;
  messagingServiceSid: string;
  messageSid: string;
  from: string;
  to: string;
  payloadFingerprint: string;
  signatureEvidence: string;
}) {
  const authToken = getEnvValue("TWILIO_AUTH_TOKEN");

  if (!authToken) {
    return null;
  }

  return crypto
    .createHmac("sha256", authToken)
    .update(JSON.stringify({ version: 1, ...input }), "utf8")
    .digest("hex");
}

function getConfiguredCompanyNumber(phoneNumber: string) {
  const candidates = getTwilioExpectedBusinessNumbers().filter(
    (candidate) => candidate.phoneNumberE164 === phoneNumber,
  );

  return candidates.length === 1 ? candidates[0] : null;
}

async function resolveVerifiedRoute(
  client: CrmClient,
  payload: {
    accountSid: string;
    messagingServiceSid: string;
    to: string;
  },
): Promise<{ status: "matched"; route: VerifiedRoute } | { status: "forbidden" | "conflict" | "retryable" }> {
  const configuredNumber = getConfiguredCompanyNumber(payload.to);
  if (!configuredNumber) {
    return { status: "forbidden" };
  }
  const template = getTwilioBusinessNumberRouteTemplate(configuredNumber.routeKey);
  if (!template) {
    return { status: "retryable" };
  }

  const { data: numbers, error: numberError } = await client
    .from("business_phone_numbers")
    .select("*")
    .eq("phone_number_e164", payload.to)
    .eq("provider_account_sid", payload.accountSid)
    .eq("messaging_service_sid", payload.messagingServiceSid)
    .eq("routing_key", template.key)
    .eq("business_location", template.businessLocation)
    .eq("team_queue", template.teamQueue)
    .eq("lead_source", template.leadSource)
    .eq("time_zone", template.timeZone)
    .eq("routing_status", "active")
    .in("provider", ["twilio", "twilio_sms"])
    .in("communication_channel", ["sms", "sms_voice"])
    .limit(2);

  if (numberError) {
    return { status: "retryable" };
  }
  if (!numbers?.length) {
    return { status: "forbidden" };
  }
  if (numbers.length !== 1) {
    return { status: "conflict" };
  }

  const number = numbers[0];
  if (
    !number.integration_connection_id ||
    !matchesTwilioBusinessRouteTemplate(number, template, "sms")
  ) {
    return { status: "forbidden" };
  }

  const [companyResult, connectionResult] = await Promise.all([
    client.from("companies").select("id, name").eq("id", number.company_id).limit(2),
    client
      .from("integration_connections")
      .select("*")
      .eq("id", number.integration_connection_id)
      .eq("company_id", number.company_id)
      .eq("provider", "twilio_sms")
      .limit(2),
  ]);

  if (companyResult.error || connectionResult.error) {
    return { status: "retryable" };
  }
  if (companyResult.data?.length !== 1 || connectionResult.data?.length !== 1) {
    return { status: "forbidden" };
  }

  const company = companyResult.data[0];
  const connection = connectionResult.data[0];
  const connectionAccountSid = connection.provider_account_id ?? connection.external_account_id;
  const routing_status = number.routing_status;
  const status = connection.status;
  const routeIsActive = routing_status === "active";
  const connectionIsConnected = status === "connected";

  if (
    company.name !== configuredNumber.company ||
    !routeIsActive ||
    !connectionIsConnected ||
    connection.disabled_at ||
    connectionAccountSid !== payload.accountSid ||
    number.company_id !== connection.company_id
  ) {
    return { status: "forbidden" };
  }

  return { status: "matched", route: { number, connection } };
}

async function resolveVerifiedTucsonRoute(
  client: CrmClient,
  payload: { accountSid: string; to: string },
  phase: "voice_ingress" | "voice_status",
): Promise<
  | { status: "matched"; route: VerifiedRoute }
  | { status: "forbidden" | "conflict" | "retryable" }
> {
  const configuredCandidates = getTwilioExpectedBusinessNumbers().filter(
    (candidate) => candidate.phoneNumberE164 === payload.to,
  );

  if (
    configuredCandidates.length !== 1 ||
    configuredCandidates[0].routeKey !== "weathertech-tucson"
  ) {
    return { status: configuredCandidates.length > 1 ? "conflict" : "forbidden" };
  }
  const template = getTwilioBusinessNumberRouteTemplate("weathertech-tucson");
  if (!template) {
    return { status: "retryable" };
  }

  let numberQuery = client
    .from("business_phone_numbers")
    .select("*")
    .eq("phone_number_e164", payload.to)
    .eq("provider_account_sid", payload.accountSid)
    .eq("routing_key", template.key)
    .eq("business_location", template.businessLocation)
    .eq("team_queue", template.teamQueue)
    .eq("lead_source", template.leadSource)
    .eq("time_zone", template.timeZone)
    .eq("routing_status", "active")
    .in("provider", ["twilio", "twilio_sms"]);
  numberQuery =
    phase === "voice_ingress"
      ? numberQuery.eq("communication_channel", "sms_voice")
      : numberQuery.in("communication_channel", ["sms", "sms_voice"]);
  const { data: numbers, error: numberError } = await numberQuery.limit(2);

  if (numberError) {
    return { status: "retryable" };
  }
  if (!numbers?.length) {
    return { status: "forbidden" };
  }
  if (numbers.length !== 1) {
    return { status: "conflict" };
  }

  const number = numbers[0];
  if (
    !number.integration_connection_id ||
    !matchesTwilioBusinessRouteTemplate(
      number,
      template,
      phase === "voice_ingress" ? "voice" : "sms",
    )
  ) {
    return { status: "forbidden" };
  }

  const [companyResult, connectionResult] = await Promise.all([
    client.from("companies").select("id, name").eq("id", number.company_id).limit(2),
    client
      .from("integration_connections")
      .select("*")
      .eq("id", number.integration_connection_id)
      .eq("company_id", number.company_id)
      .eq("provider", "twilio_sms")
      .limit(2),
  ]);

  if (companyResult.error || connectionResult.error) {
    return { status: "retryable" };
  }
  if (companyResult.data?.length !== 1 || connectionResult.data?.length !== 1) {
    return { status: "forbidden" };
  }

  const company = companyResult.data[0];
  const connection = connectionResult.data[0];
  const connectionAccountSid = connection.provider_account_id ?? connection.external_account_id;
  if (
    company.name !== "WeatherTech Roofing LLC" ||
    number.company_id !== connection.company_id ||
    connection.status !== "connected" ||
    connection.disabled_at ||
    connectionAccountSid !== payload.accountSid
  ) {
    return { status: "forbidden" };
  }

  return { status: "matched", route: { number, connection } };
}

function resolveVerifiedTucsonVoiceIngressRoute(
  client: CrmClient,
  payload: { accountSid: string; to: string },
) {
  return resolveVerifiedTucsonRoute(client, payload, "voice_ingress");
}

function resolveVerifiedTucsonVoiceStatusRoute(
  client: CrmClient,
  payload: { accountSid: string; to: string },
) {
  return resolveVerifiedTucsonRoute(client, payload, "voice_status");
}

async function resolveContact(
  client: CrmClient,
  companyId: string,
  senderPhone: string,
): Promise<{ status: "ok"; match: ContactMatch } | { status: "retryable" }> {
  const fetchAllPhoneRows = async (table: "customers" | "leads") => {
    const rows: Array<{ id: string; company_id: string; phone: string | null }> = [];
    const pageSize = 500;

    for (let page = 0; page < 200; page += 1) {
      const start = page * pageSize;
      const result = await client
        .from(table)
        .select("id, company_id, phone")
        .eq("company_id", companyId)
        .not("phone", "is", null)
        .order("id", { ascending: true })
        .range(start, start + pageSize - 1);

      if (result.error) {
        return { data: null, error: result.error };
      }

      const pageRows = result.data ?? [];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) {
        return { data: rows, error: null };
      }
    }

    return { data: null, error: new Error("Contact lookup exceeded its safe pagination limit.") };
  };
  const [customersResult, leadsResult] = await Promise.all([
    fetchAllPhoneRows("customers"),
    fetchAllPhoneRows("leads"),
  ]);

  if (customersResult.error || leadsResult.error || !customersResult.data || !leadsResult.data) {
    return { status: "retryable" };
  }

  const customers = customersResult.data.filter(
    (record) => normalizeTwilioPhoneNumber(record.phone) === senderPhone,
  ) as Pick<CustomerRecord, "id" | "company_id" | "phone">[];
  const leads = leadsResult.data.filter(
    (record) => normalizeTwilioPhoneNumber(record.phone) === senderPhone,
  ) as Pick<LeadRecord, "id" | "company_id" | "phone">[];
  const matchCount = customers.length + leads.length;

  if (matchCount === 0) {
    return {
      status: "ok",
      match: { status: "unmatched", customerId: null, leadId: null },
    };
  }
  if (matchCount !== 1) {
    return {
      status: "ok",
      match: { status: "ambiguous", customerId: null, leadId: null },
    };
  }
  if (customers.length === 1) {
    return {
      status: "ok",
      match: { status: "matched_customer", customerId: customers[0].id, leadId: null },
    };
  }
  return {
    status: "ok",
    match: { status: "matched_lead", customerId: null, leadId: leads[0].id },
  };
}

function messageMatchesClaim(
  message: SmsMessageRecord,
  expected: {
    id: string;
    companyId: string;
    connectionId: string;
    numberId: string;
    accountSid: string;
    messagingServiceSid: string;
    messageSid: string;
    from: string;
    to: string;
    body: string;
    fingerprint: string;
  },
) {
  return (
    message.id === expected.id &&
    message.company_id === expected.companyId &&
    message.integration_connection_id === expected.connectionId &&
    message.business_phone_number_id === expected.numberId &&
    message.provider === "twilio_sms" &&
    message.direction === "inbound" &&
    message.provider_account_sid === expected.accountSid &&
    message.provider_messaging_service_sid === expected.messagingServiceSid &&
    message.twilio_message_sid === expected.messageSid &&
    message.from_phone === expected.from &&
    message.to_phone === expected.to &&
    message.body === expected.body &&
    createTwilioInboundPayloadFingerprint({
      accountSid: expected.accountSid,
      messageSid: expected.messageSid,
      messagingServiceSid: expected.messagingServiceSid,
      from: expected.from,
      to: expected.to,
      body: message.body,
      companyId: expected.companyId,
    }) === expected.fingerprint &&
    message.provider_payload_fingerprint === expected.fingerprint
  );
}

async function claimInboundMessage(
  client: CrmClient,
  params: {
    route: VerifiedRoute;
    contact: ContactMatch;
    accountSid: string;
    messagingServiceSid: string;
    messageSid: string;
    from: string;
    to: string;
    body: string;
    fingerprint: string;
  },
): Promise<{ status: "ok"; claim: MessageClaim } | { status: "conflict" | "retryable" }> {
  const id = deterministicUuid("wtos:twilio:sms:v1", params.messageSid);
  const insert: SmsMessageInsert = {
    id,
    company_id: params.route.number.company_id,
    customer_id: params.contact.customerId,
    lead_id: params.contact.leadId,
    integration_connection_id: params.route.connection.id,
    provider: "twilio_sms",
    category: "general",
    status: "sent",
    business_phone_number_id: params.route.number.id,
    direction: "inbound",
    delivery_status: "received",
    provider_account_sid: params.accountSid,
    provider_messaging_service_sid: params.messagingServiceSid,
    to_phone: params.to,
    from_phone: params.from,
    body: params.body,
    twilio_message_sid: params.messageSid,
    sent_at: new Date().toISOString(),
    delivered_at: new Date().toISOString(),
    correlation_id: id,
    provider_payload_fingerprint: params.fingerprint,
    metadata: {
      ingestion_status: "claimed",
      contact_match_status: params.contact.status,
      source: "authenticated_twilio_webhook",
    },
    last_error: null,
  };
  const { data, error } = await client.from("sms_messages").insert(insert).select("*").single();

  if (!error && data) {
    return {
      status: "ok",
      claim: { duplicate: false, message: data, contactStatus: params.contact.status },
    };
  }
  if (error?.code !== "23505") {
    return { status: "retryable" };
  }

  const { data: existing, error: existingError } = await client
    .from("sms_messages")
    .select("*")
    .eq("id", id)
    .limit(2);
  if (existingError || existing?.length !== 1) {
    return { status: "retryable" };
  }

  const expected = {
    id,
    companyId: params.route.number.company_id,
    connectionId: params.route.connection.id,
    numberId: params.route.number.id,
    accountSid: params.accountSid,
    messagingServiceSid: params.messagingServiceSid,
    messageSid: params.messageSid,
    from: params.from,
    to: params.to,
    body: params.body,
    fingerprint: params.fingerprint,
  };
  if (!messageMatchesClaim(existing[0], expected)) {
    return { status: "conflict" };
  }

  const storedStatus = existing[0].metadata?.contact_match_status;
  const contactStatus =
    storedStatus === "matched_customer" ||
    storedStatus === "matched_lead" ||
    storedStatus === "unmatched" ||
    storedStatus === "ambiguous"
      ? storedStatus
      : existing[0].customer_id
        ? "matched_customer"
        : existing[0].lead_id
          ? "matched_lead"
          : "unmatched";
  return {
    status: "ok",
    claim: { duplicate: true, message: existing[0], contactStatus },
  };
}

function eventMatchesMessage(
  event: CommunicationProviderEventRecord,
  message: SmsMessageRecord,
  fingerprint: string,
  expectedEventId: string,
) {
  return (
    event.id === expectedEventId &&
    event.company_id === message.company_id &&
    event.business_phone_number_id === message.business_phone_number_id &&
    event.integration_connection_id === message.integration_connection_id &&
    event.customer_id === message.customer_id &&
    event.lead_id === message.lead_id &&
    event.sms_message_id === message.id &&
    event.provider === "twilio" &&
    event.provider_account_sid === message.provider_account_sid &&
    event.provider_event_sid === message.twilio_message_sid &&
    event.event_type === "sms_inbound" &&
    event.channel === "sms" &&
    event.direction === "inbound" &&
    event.status === "received" &&
    event.from_phone === message.from_phone &&
    event.to_phone === message.to_phone &&
    event.business_phone === message.to_phone &&
    event.customer_phone === message.from_phone &&
    event.routing_status === "matched" &&
    event.request_fingerprint === fingerprint
  );
}

async function convergeProviderEvent(
  client: CrmClient,
  message: SmsMessageRecord,
  fingerprint: string,
  contactStatus: ContactMatch["status"],
  signatureEvidence: string,
): Promise<{ status: "ok"; event: CommunicationProviderEventRecord } | { status: "conflict" | "retryable" }> {
  const messageSid = message.twilio_message_sid;
  if (!messageSid) {
    return { status: "conflict" };
  }
  const eventId = deterministicUuid("wtos:twilio:event:v1", messageSid);
  const evidenceProof = createTwilioInboundEvidenceProof({
    messageId: message.id,
    eventId,
    companyId: message.company_id,
    connectionId: message.integration_connection_id ?? "",
    businessPhoneNumberId: message.business_phone_number_id ?? "",
    customerId: message.customer_id,
    leadId: message.lead_id,
    accountSid: message.provider_account_sid ?? "",
    messagingServiceSid: message.provider_messaging_service_sid ?? "",
    messageSid,
    from: message.from_phone ?? "",
    to: message.to_phone,
    payloadFingerprint: fingerprint,
    signatureEvidence,
  });

  if (!evidenceProof) {
    return { status: "retryable" };
  }
  const { data, error } = await client
    .from("communication_provider_events")
    .insert({
      id: eventId,
      company_id: message.company_id,
      business_phone_number_id: message.business_phone_number_id ?? null,
      integration_connection_id: message.integration_connection_id,
      customer_id: message.customer_id,
      lead_id: message.lead_id,
      sms_message_id: message.id,
      provider: "twilio",
      provider_account_sid: message.provider_account_sid ?? null,
      provider_event_sid: messageSid,
      event_type: "sms_inbound",
      channel: "sms",
      direction: "inbound",
      status: "received",
      from_phone: message.from_phone,
      to_phone: message.to_phone,
      business_phone: message.to_phone,
      customer_phone: message.from_phone,
      routing_status: "matched",
      correlation_id: message.correlation_id ?? message.id,
      request_fingerprint: fingerprint,
      payload_summary: {
        body_length: message.body.length,
        contact_match_status: contactStatus,
        signature_validated: true,
        signature_evidence: signatureEvidence,
      },
      response_summary: {
        persisted: true,
        outbound_sent: false,
        evidence_proof: evidenceProof,
      },
      error_code: null,
      error_message: null,
      occurred_at: message.delivered_at ?? message.sent_at ?? new Date().toISOString(),
    })
    .select("*")
    .single();

  let event = data;
  if (error?.code === "23505") {
    const existingResult = await client
      .from("communication_provider_events")
      .select("*")
      .eq("provider", "twilio")
      .eq("event_type", "sms_inbound")
      .eq("provider_event_sid", messageSid)
      .limit(2);
    if (existingResult.error || existingResult.data?.length !== 1) {
      return { status: "retryable" };
    }
    event = existingResult.data[0];
  } else if (error || !event) {
    return { status: "retryable" };
  }

  if (
    !eventMatchesMessage(event, message, fingerprint, eventId) ||
    event.response_summary?.evidence_proof !== evidenceProof
  ) {
    return { status: "conflict" };
  }

  const metadata = {
    ...(message.metadata ?? {}),
    ingestion_status: "complete",
    provider_event_id: event.id,
    evidence_proof: evidenceProof,
  };
  const updateResult = await client
    .from("sms_messages")
    .update({ metadata, last_error: null })
    .eq("id", message.id)
    .eq("provider_payload_fingerprint", fingerprint)
    .select("id")
    .single();
  if (updateResult.error || updateResult.data?.id !== message.id) {
    return { status: "retryable" };
  }

  return { status: "ok", event };
}

export function getTwilioProviderEventSid(payload: TwilioWebhookPayload) {
  return payload.messageSid ?? payload.callSid ?? payload.recordingSid;
}

export function normalizeTwilioSmsDeliveryStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/_/g, "-");
  return ["accepted", "queued", "sending", "sent", "delivered", "undelivered", "failed", "received"].includes(
    normalized ?? "",
  )
    ? normalized
    : null;
}

export function normalizeTwilioCallStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "no-answer" || normalized === "canceled") {
    return "missed";
  }
  const supported = ["incoming", "ringing", "in-progress", "answered", "completed", "missed", "busy", "failed", "voicemail"];
  if (!supported.includes(normalized ?? "")) {
    return null;
  }
  return normalized === "in-progress" ? "in_progress" : normalized;
}

export async function storeTwilioWebhookPayload(
  payload: TwilioWebhookPayload,
  signatureEvidence?: string,
): Promise<TwilioStorageResult> {
  if (payload.kind !== "sms_inbound") {
    return {
      stored: false,
      duplicate: false,
      migrationRequired: false,
      providerEventId: null,
      smsMessageId: null,
      callRecordId: null,
      routingStatus: "unassigned",
      skippedReason: "unsupported_inbound_only_phase",
    };
  }

  if (!signatureEvidence || !/^[a-f0-9]{64}$/.test(signatureEvidence)) {
    throw new TwilioWebhookError("signature_evidence_missing", 503);
  }

  const accountSid = payload.accountSid;
  const messageSid = payload.messageSid;
  const messagingServiceSid = payload.messagingServiceSid;
  const from = normalizeTwilioPhoneNumber(payload.from);
  const to = normalizeTwilioPhoneNumber(payload.to);
  const body = payload.body;
  const configuredAccountSid = getEnvValue("TWILIO_ACCOUNT_SID");
  const configuredMessagingServiceSid = getEnvValue("TWILIO_MESSAGING_SERVICE_SID");

  if (
    !accountSid ||
    !ACCOUNT_SID_PATTERN.test(accountSid) ||
    !messageSid ||
    !MESSAGE_SID_PATTERN.test(messageSid) ||
    !messagingServiceSid ||
    !MESSAGING_SERVICE_SID_PATTERN.test(messagingServiceSid) ||
    !from ||
    !to ||
    body === null ||
    body.length > MAX_MESSAGE_BODY_LENGTH ||
    payload.numMedia !== 0 ||
    accountSid !== configuredAccountSid ||
    messagingServiceSid !== configuredMessagingServiceSid
  ) {
    throw new TwilioWebhookError("invalid_payload", 400);
  }

  const client = getServiceSupabaseClient();
  if (!client) {
    throw new TwilioWebhookError("storage_unavailable", 503);
  }

  const routeResult = await resolveVerifiedRoute(client, {
    accountSid,
    messagingServiceSid,
    to,
  });
  if (routeResult.status !== "matched") {
    throw new TwilioWebhookError(
      routeResult.status === "forbidden" ? "route_rejected" : routeResult.status,
      routeResult.status === "forbidden" ? 403 : routeResult.status === "conflict" ? 409 : 503,
    );
  }

  const contactResult = await resolveContact(client, routeResult.route.number.company_id, from);
  if (contactResult.status !== "ok") {
    throw new TwilioWebhookError("contact_lookup_failed", 503);
  }

  const fingerprint = createTwilioInboundPayloadFingerprint({
    accountSid,
    messageSid,
    messagingServiceSid,
    from,
    to,
    body,
    companyId: routeResult.route.number.company_id,
  });
  const claimResult = await claimInboundMessage(client, {
    route: routeResult.route,
    contact: contactResult.match,
    accountSid,
    messagingServiceSid,
    messageSid,
    from,
    to,
    body,
    fingerprint,
  });
  if (claimResult.status !== "ok") {
    throw new TwilioWebhookError(
      claimResult.status === "conflict" ? "message_conflict" : "message_claim_failed",
      claimResult.status === "conflict" ? 409 : 503,
    );
  }

  const eventResult = await convergeProviderEvent(
    client,
    claimResult.claim.message,
    fingerprint,
    claimResult.claim.contactStatus,
    signatureEvidence,
  );
  if (eventResult.status !== "ok") {
    throw new TwilioWebhookError(
      eventResult.status === "conflict" ? "event_conflict" : "event_persistence_failed",
      eventResult.status === "conflict" ? 409 : 503,
    );
  }

  return {
    stored: !claimResult.claim.duplicate,
    duplicate: claimResult.claim.duplicate,
    migrationRequired: false,
    providerEventId: eventResult.event.id,
    smsMessageId: claimResult.claim.message.id,
    callRecordId: null,
    routingStatus: "matched",
    skippedReason: null,
  };
}

type VoiceCallClaim = {
  duplicate: boolean;
  call: CallRecord;
  contactStatus: ContactMatch["status"];
};

function normalizeTwilioInitialCallStatus(
  status: string | null,
): CallRecord["call_status"] | null {
  const normalized = status?.trim().toLowerCase().replace(/_/g, "-");

  if (normalized === "queued" || normalized === "initiated") {
    return "incoming";
  }
  if (normalized === "ringing") {
    return "ringing";
  }
  if (normalized === "in-progress") {
    return "in_progress";
  }
  return null;
}

export type TwilioTerminalDialStatus =
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "canceled";

export function normalizeTwilioTerminalDialStatus(
  status: string | null,
): TwilioTerminalDialStatus | null {
  const normalized = status?.trim().toLowerCase().replace(/_/g, "-");

  return ["completed", "busy", "failed", "no-answer", "canceled"].includes(
    normalized ?? "",
  )
    ? (normalized as TwilioTerminalDialStatus)
    : null;
}

export function mapTwilioTerminalDialStatus(
  status: TwilioTerminalDialStatus,
): CallRecord["call_status"] {
  return status === "no-answer" || status === "canceled" ? "missed" : status;
}

function voiceCallMatchesClaim(
  call: CallRecord,
  expected: {
    id: string;
    route: VerifiedRoute;
    accountSid: string;
    callSid: string;
    from: string | null;
    to: string;
    requestFingerprint: string;
    destinationProof: string;
  },
) {
  return (
    call.id === expected.id &&
    call.company_id === expected.route.number.company_id &&
    call.business_phone_number_id === expected.route.number.id &&
    call.integration_connection_id === expected.route.connection.id &&
    call.provider === "twilio" &&
    call.provider_account_sid === expected.accountSid &&
    call.provider_call_sid === expected.callSid &&
    call.provider_parent_call_sid === null &&
    call.direction === "inbound" &&
    call.from_phone === expected.from &&
    call.to_phone === expected.to &&
    call.business_phone === expected.to &&
    call.customer_phone === expected.from &&
    call.routing_status === "matched" &&
    call.recording_sid === null &&
    call.recording_status === "not_requested" &&
    call.recording_duration_seconds === null &&
    call.transcript_status === "not_requested" &&
    call.metadata?.source === "authenticated_twilio_voice_webhook" &&
    call.metadata?.initial_request_fingerprint === expected.requestFingerprint &&
    call.metadata?.forward_destination_proof === expected.destinationProof &&
    getStoredVoiceContactStatus(call) !== null
  );
}

function getStoredVoiceContactStatus(
  call: CallRecord,
): ContactMatch["status"] | null {
  const status = call.metadata?.contact_match_status;

  if (
    status === "matched_customer" &&
    call.customer_id &&
    !call.lead_id
  ) {
    return status;
  }
  if (status === "matched_lead" && call.lead_id && !call.customer_id) {
    return status;
  }
  if (
    (status === "unmatched" || status === "ambiguous") &&
    !call.customer_id &&
    !call.lead_id
  ) {
    return status;
  }
  return null;
}

async function claimTucsonVoiceCall(
  client: CrmClient,
  params: {
    route: VerifiedRoute;
    contact: ContactMatch;
    accountSid: string;
    callSid: string;
    from: string | null;
    to: string;
    callStatus: CallRecord["call_status"];
    occurredAt: string;
    requestFingerprint: string;
    destinationProof: string;
  },
): Promise<
  | { status: "ok"; claim: VoiceCallClaim }
  | { status: "conflict" | "retryable" }
> {
  const id = deterministicUuid("wtos:twilio:tucson-call:v1", params.callSid);
  const insert: CallRecordInsert = {
    id,
    company_id: params.route.number.company_id,
    business_phone_number_id: params.route.number.id,
    integration_connection_id: params.route.connection.id,
    customer_id: params.contact.customerId,
    lead_id: params.contact.leadId,
    job_id: null,
    provider: "twilio",
    provider_account_sid: params.accountSid,
    provider_call_sid: params.callSid,
    provider_parent_call_sid: null,
    direction: "inbound",
    call_status: params.callStatus,
    from_phone: params.from,
    to_phone: params.to,
    business_phone: params.to,
    customer_phone: params.from,
    routing_status: "matched",
    started_at: params.occurredAt,
    answered_at: null,
    ended_at: null,
    duration_seconds: null,
    recording_sid: null,
    recording_status: "not_requested",
    recording_duration_seconds: null,
    transcript_status: "not_requested",
    follow_up_required: false,
    correlation_id: id,
    metadata: {
      ingestion_status: "claimed",
      contact_match_status: params.contact.status,
      source: "authenticated_twilio_voice_webhook",
      initial_request_fingerprint: params.requestFingerprint,
      forward_destination_proof: params.destinationProof,
      recording_requested: false,
      transcription_requested: false,
      automatic_lead_created: false,
    },
  };
  const { data, error } = await client.from("call_records").insert(insert).select("*").single();

  if (!error && data) {
    return {
      status: "ok",
      claim: { duplicate: false, call: data, contactStatus: params.contact.status },
    };
  }
  if (error?.code !== "23505") {
    return { status: "retryable" };
  }

  const { data: existing, error: existingError } = await client
    .from("call_records")
    .select("*")
    .eq("id", id)
    .limit(2);
  if (existingError || existing?.length !== 1) {
    return { status: "retryable" };
  }
  if (
    !voiceCallMatchesClaim(existing[0], {
      id,
      route: params.route,
      accountSid: params.accountSid,
      callSid: params.callSid,
      from: params.from,
      to: params.to,
      requestFingerprint: params.requestFingerprint,
      destinationProof: params.destinationProof,
    })
  ) {
    return { status: "conflict" };
  }

  const storedContactStatus = getStoredVoiceContactStatus(existing[0]);
  if (!storedContactStatus) {
    return { status: "conflict" };
  }

  return {
    status: "ok",
    claim: { duplicate: true, call: existing[0], contactStatus: storedContactStatus },
  };
}

function voiceInboundEventMatchesClaim(
  event: CommunicationProviderEventRecord,
  call: CallRecord,
  expected: {
    id: string;
    requestFingerprint: string;
    callStatus: CallRecord["call_status"];
    destinationProof: string;
    evidenceProof: string;
  },
) {
  return (
    event.id === expected.id &&
    event.company_id === call.company_id &&
    event.business_phone_number_id === call.business_phone_number_id &&
    event.integration_connection_id === call.integration_connection_id &&
    event.customer_id === call.customer_id &&
    event.lead_id === call.lead_id &&
    event.sms_message_id === null &&
    event.provider === "twilio" &&
    event.provider_account_sid === call.provider_account_sid &&
    event.provider_event_sid === call.provider_call_sid &&
    event.provider_parent_sid === null &&
    event.event_type === "voice_inbound" &&
    event.channel === "voice" &&
    event.direction === "inbound" &&
    event.status === expected.callStatus &&
    event.from_phone === call.from_phone &&
    event.to_phone === call.to_phone &&
    event.business_phone === call.business_phone &&
    event.customer_phone === call.customer_phone &&
    event.routing_status === "matched" &&
    event.correlation_id === call.correlation_id &&
    event.request_fingerprint === expected.requestFingerprint &&
    event.response_summary?.forward_destination_proof === expected.destinationProof &&
    event.response_summary?.evidence_proof === expected.evidenceProof
  );
}

async function convergeTucsonVoiceInboundEvent(
  client: CrmClient,
  params: {
    call: CallRecord;
    contactStatus: ContactMatch["status"];
    callStatus: CallRecord["call_status"];
    requestFingerprint: string;
    signatureEvidence: string;
    destinationProof: string;
  },
): Promise<
  | { status: "ok"; event: CommunicationProviderEventRecord }
  | { status: "conflict" | "retryable" }
> {
  const callSid = params.call.provider_call_sid;
  if (!callSid || !params.call.company_id || !params.call.integration_connection_id || !params.call.business_phone_number_id) {
    return { status: "conflict" };
  }
  const eventId = deterministicUuid("wtos:twilio:tucson-voice-inbound-event:v1", callSid);
  const evidenceProof = createTwilioVoiceEvidenceProof({
    kind: "voice_inbound",
    callRecordId: params.call.id,
    eventId,
    companyId: params.call.company_id,
    connectionId: params.call.integration_connection_id,
    businessPhoneNumberId: params.call.business_phone_number_id,
    accountSid: params.call.provider_account_sid ?? "",
    callSid,
    parentCallSid: null,
    requestFingerprint: params.requestFingerprint,
    signatureEvidence: params.signatureEvidence,
    destinationProof: params.destinationProof,
  });
  if (!evidenceProof) {
    return { status: "retryable" };
  }

  const insert: CommunicationProviderEventInsert = {
    id: eventId,
    company_id: params.call.company_id,
    business_phone_number_id: params.call.business_phone_number_id,
    integration_connection_id: params.call.integration_connection_id,
    customer_id: params.call.customer_id,
    lead_id: params.call.lead_id,
    job_id: null,
    sms_message_id: null,
    provider: "twilio",
    provider_account_sid: params.call.provider_account_sid,
    provider_event_sid: callSid,
    provider_parent_sid: null,
    event_type: "voice_inbound",
    channel: "voice",
    direction: "inbound",
    status: params.callStatus,
    from_phone: params.call.from_phone,
    to_phone: params.call.to_phone,
    business_phone: params.call.business_phone,
    customer_phone: params.call.customer_phone,
    routing_status: "matched",
    correlation_id: params.call.correlation_id,
    request_fingerprint: params.requestFingerprint,
    payload_summary: {
      contact_match_status: params.contactStatus,
      signature_validated: true,
      signature_evidence: params.signatureEvidence,
    },
    response_summary: {
      persisted: true,
      forwarding_authorized: true,
      forward_destination_proof: params.destinationProof,
      recording_requested: false,
      transcription_requested: false,
      automatic_reply_sent: false,
      automatic_lead_created: false,
      evidence_proof: evidenceProof,
    },
    error_code: null,
    error_message: null,
    occurred_at: params.call.started_at ?? new Date().toISOString(),
  };
  const { data, error } = await client
    .from("communication_provider_events")
    .insert(insert)
    .select("*")
    .single();

  let event = data;
  if (error?.code === "23505") {
    const existingResult = await client
      .from("communication_provider_events")
      .select("*")
      .eq("provider", "twilio")
      .eq("event_type", "voice_inbound")
      .eq("provider_event_sid", callSid)
      .limit(2);
    if (existingResult.error || existingResult.data?.length !== 1) {
      return { status: "retryable" };
    }
    event = existingResult.data[0];
  } else if (error || !event) {
    return { status: "retryable" };
  }

  if (
    !voiceInboundEventMatchesClaim(event, params.call, {
      id: eventId,
      requestFingerprint: params.requestFingerprint,
      callStatus: params.callStatus,
      destinationProof: params.destinationProof,
      evidenceProof,
    })
  ) {
    return { status: "conflict" };
  }

  const metadata = {
    ...(params.call.metadata ?? {}),
    ingestion_status: "complete",
    provider_event_id: event.id,
    evidence_proof: evidenceProof,
  };
  const updateResult = await client
    .from("call_records")
    .update({ metadata })
    .eq("id", params.call.id)
    .eq("provider_call_sid", callSid)
    .select("*")
    .single();
  if (updateResult.error || !updateResult.data) {
    return { status: "retryable" };
  }

  return { status: "ok", event };
}

async function storeTwilioTucsonVoiceInboundPayload(
  payload: TwilioWebhookPayload,
  signatureEvidence: string,
  forwardTo: string,
): Promise<TwilioStorageResult> {
  const accountSid = payload.accountSid;
  const callSid = payload.callSid;
  const from = normalizeTwilioPhoneNumber(payload.from);
  const to = normalizeTwilioPhoneNumber(payload.to);
  const callStatus = normalizeTwilioInitialCallStatus(payload.callStatus);
  const config = getTwilioServerConfig();
  const configuredAccountSid = config.accountSid;
  const configuredTucsonNumber = config.tucsonVoiceForwarding.tucsonNumberE164;

  if (
    payload.kind !== "voice_inbound" ||
    !/^[a-f0-9]{64}$/.test(signatureEvidence) ||
    !accountSid ||
    !ACCOUNT_SID_PATTERN.test(accountSid) ||
    accountSid !== configuredAccountSid ||
    !callSid ||
    !CALL_SID_PATTERN.test(callSid) ||
    payload.dialCallSid !== null ||
    payload.parentCallSid !== null ||
    payload.dialCallStatus !== null ||
    payload.dialCallDurationSeconds !== null ||
    payload.dialBridged !== null ||
    !to ||
    to !== configuredTucsonNumber ||
    payload.direction !== "inbound" ||
    !callStatus ||
    !STRICT_E164_PATTERN.test(forwardTo) ||
    from === forwardTo
  ) {
    throw new TwilioWebhookError("invalid_voice_payload", 400);
  }

  const destinationProof = createTwilioVoiceDestinationProof({
    parentCallSid: callSid,
    destination: forwardTo,
  });
  if (!destinationProof) {
    throw new TwilioWebhookError("voice_destination_proof_unavailable", 503);
  }

  const client = getServiceSupabaseClient();
  if (!client) {
    throw new TwilioWebhookError("storage_unavailable", 503);
  }
  const routeResult = await resolveVerifiedTucsonVoiceIngressRoute(client, { accountSid, to });
  if (routeResult.status !== "matched") {
    throw new TwilioWebhookError(
      routeResult.status === "forbidden" ? "voice_route_rejected" : routeResult.status,
      routeResult.status === "forbidden" ? 403 : routeResult.status === "conflict" ? 409 : 503,
    );
  }

  const contactResult = from
    ? await resolveContact(client, routeResult.route.number.company_id, from)
    : {
        status: "ok" as const,
        match: {
          customerId: null,
          leadId: null,
          status: "unmatched" as const,
        },
      };
  if (contactResult.status !== "ok") {
    throw new TwilioWebhookError("voice_contact_lookup_failed", 503);
  }

  const requestFingerprint = createTwilioVoicePayloadFingerprint({
    kind: "voice_inbound",
    accountSid,
    callSid,
    parentCallSid: null,
    from,
    to,
    callStatus,
    providerDialStatus: null,
    direction: "inbound",
    durationSeconds: null,
    dialBridged: null,
    companyId: routeResult.route.number.company_id,
    destinationProof,
  });
  const claimResult = await claimTucsonVoiceCall(client, {
    route: routeResult.route,
    contact: contactResult.match,
    accountSid,
    callSid,
    from,
    to,
    callStatus,
    occurredAt: payload.occurredAt,
    requestFingerprint,
    destinationProof,
  });
  if (claimResult.status !== "ok") {
    throw new TwilioWebhookError(
      claimResult.status === "conflict" ? "voice_call_conflict" : "voice_call_claim_failed",
      claimResult.status === "conflict" ? 409 : 503,
    );
  }

  const eventResult = await convergeTucsonVoiceInboundEvent(client, {
    call: claimResult.claim.call,
    contactStatus: claimResult.claim.contactStatus,
    callStatus,
    requestFingerprint,
    signatureEvidence,
    destinationProof,
  });
  if (eventResult.status !== "ok") {
    throw new TwilioWebhookError(
      eventResult.status === "conflict" ? "voice_event_conflict" : "voice_event_persistence_failed",
      eventResult.status === "conflict" ? 409 : 503,
    );
  }

  return {
    stored: !claimResult.claim.duplicate,
    duplicate: claimResult.claim.duplicate,
    migrationRequired: false,
    providerEventId: eventResult.event.id,
    smsMessageId: null,
    callRecordId: claimResult.claim.call.id,
    routingStatus: "matched",
    skippedReason: null,
  };
}

function voiceStatusEventMatchesClaim(
  event: CommunicationProviderEventRecord,
  call: CallRecord,
  expected: {
    id: string;
    childCallSid: string;
    status: CallRecord["call_status"];
    providerDialStatus: TwilioTerminalDialStatus;
    dialBridged: boolean;
    durationSeconds: number;
    requestFingerprint: string;
    destinationProof: string;
    evidenceProof: string;
  },
) {
  return (
    event.id === expected.id &&
    event.company_id === call.company_id &&
    event.business_phone_number_id === call.business_phone_number_id &&
    event.integration_connection_id === call.integration_connection_id &&
    event.customer_id === call.customer_id &&
    event.lead_id === call.lead_id &&
    event.provider === "twilio" &&
    event.provider_account_sid === call.provider_account_sid &&
    event.provider_event_sid === expected.childCallSid &&
    event.provider_parent_sid === call.provider_call_sid &&
    event.event_type === "voice_status" &&
    event.channel === "voice" &&
    event.direction === "outbound" &&
    event.status === expected.status &&
    event.from_phone === call.from_phone &&
    event.to_phone === null &&
    event.business_phone === call.business_phone &&
    event.customer_phone === call.customer_phone &&
    event.routing_status === "matched" &&
    event.correlation_id === call.correlation_id &&
    event.request_fingerprint === expected.requestFingerprint &&
    event.payload_summary?.provider_dial_status === expected.providerDialStatus &&
    event.payload_summary?.duration_seconds === expected.durationSeconds &&
    event.payload_summary?.dial_bridged === expected.dialBridged &&
    event.payload_summary?.forward_destination_proof === expected.destinationProof &&
    event.response_summary?.evidence_proof === expected.evidenceProof
  );
}

async function storeTwilioTucsonVoiceStatusPayload(
  payload: TwilioWebhookPayload,
  signatureEvidence: string,
): Promise<TwilioStorageResult> {
  const accountSid = payload.accountSid;
  const parentCallSid = payload.callSid;
  const childCallSid = payload.dialCallSid;
  const callbackFrom = normalizeTwilioPhoneNumber(payload.from);
  const callbackTo = normalizeTwilioPhoneNumber(payload.to);
  const providerDialStatus = normalizeTwilioTerminalDialStatus(payload.dialCallStatus);
  const finalStatus = providerDialStatus
    ? mapTwilioTerminalDialStatus(providerDialStatus)
    : null;
  const durationSeconds = payload.dialCallDurationSeconds;
  const config = getTwilioServerConfig();

  if (
    payload.kind !== "voice_status" ||
    !/^[a-f0-9]{64}$/.test(signatureEvidence) ||
    !accountSid ||
    !ACCOUNT_SID_PATTERN.test(accountSid) ||
    accountSid !== config.accountSid ||
    !parentCallSid ||
    !CALL_SID_PATTERN.test(parentCallSid) ||
    !childCallSid ||
    !CALL_SID_PATTERN.test(childCallSid) ||
    childCallSid === parentCallSid ||
    payload.parentCallSid !== null ||
    payload.direction !== "inbound" ||
    !callbackTo ||
    callbackTo !== config.tucsonVoiceForwarding.tucsonNumberE164 ||
    !providerDialStatus ||
    !finalStatus ||
    durationSeconds === null ||
    durationSeconds < 0 ||
    durationSeconds > MAX_CALL_DURATION_SECONDS ||
    payload.dialBridged === null ||
    (finalStatus === "completed" && payload.dialBridged !== true) ||
    (finalStatus !== "completed" && payload.dialBridged !== false)
  ) {
    throw new TwilioWebhookError("invalid_voice_status_payload", 400);
  }

  const client = getServiceSupabaseClient();
  if (!client) {
    throw new TwilioWebhookError("storage_unavailable", 503);
  }
  const { data: calls, error: callError } = await client
    .from("call_records")
    .select("*")
    .eq("provider", "twilio")
    .eq("provider_account_sid", accountSid)
    .eq("provider_call_sid", parentCallSid)
    .limit(2);
  if (callError) {
    throw new TwilioWebhookError("voice_parent_lookup_failed", 503);
  }
  if (!calls?.length) {
    throw new TwilioWebhookError("voice_parent_rejected", 403);
  }
  if (calls.length !== 1) {
    throw new TwilioWebhookError("voice_parent_conflict", 409);
  }
  const call = calls[0];
  if (!call.to_phone || !call.company_id || !call.business_phone_number_id || !call.integration_connection_id) {
    throw new TwilioWebhookError("voice_parent_conflict", 409);
  }
  if (call.from_phone !== callbackFrom || call.to_phone !== callbackTo) {
    throw new TwilioWebhookError("voice_status_identity_rejected", 403);
  }

  const routeResult = await resolveVerifiedTucsonVoiceStatusRoute(client, {
    accountSid,
    to: call.to_phone,
  });
  if (
    routeResult.status !== "matched" ||
    routeResult.route.number.id !== call.business_phone_number_id ||
    routeResult.route.connection.id !== call.integration_connection_id ||
    routeResult.route.number.company_id !== call.company_id
  ) {
    throw new TwilioWebhookError(
      routeResult.status === "retryable" ? "voice_route_lookup_failed" : "voice_status_route_rejected",
      routeResult.status === "retryable" ? 503 : routeResult.status === "conflict" ? 409 : 403,
    );
  }

  const destinationProof =
    typeof call.metadata?.forward_destination_proof === "string"
      ? call.metadata.forward_destination_proof
      : null;
  if (
    !destinationProof ||
    !/^[a-f0-9]{64}$/.test(destinationProof) ||
    call.metadata?.ingestion_status !== "complete"
  ) {
    throw new TwilioWebhookError("voice_status_parent_evidence_rejected", 403);
  }

  const requestFingerprint = createTwilioVoicePayloadFingerprint({
    kind: "voice_status",
    accountSid,
    callSid: childCallSid,
    parentCallSid,
    from: call.from_phone,
    to: call.to_phone,
    callStatus: finalStatus,
    providerDialStatus,
    direction: "inbound",
    durationSeconds,
    dialBridged: payload.dialBridged,
    companyId: call.company_id,
    destinationProof,
  });
  const eventId = deterministicUuid(
    "wtos:twilio:tucson-voice-status-event:v1",
    parentCallSid,
  );
  const evidenceProof = createTwilioVoiceEvidenceProof({
    kind: "voice_status",
    callRecordId: call.id,
    eventId,
    companyId: call.company_id,
    connectionId: call.integration_connection_id,
    businessPhoneNumberId: call.business_phone_number_id,
    accountSid,
    callSid: childCallSid,
    parentCallSid,
    requestFingerprint,
    signatureEvidence,
    destinationProof,
  });
  if (!evidenceProof) {
    throw new TwilioWebhookError("voice_status_evidence_unavailable", 503);
  }

  const eventInsert: CommunicationProviderEventInsert = {
    id: eventId,
    company_id: call.company_id,
    business_phone_number_id: call.business_phone_number_id,
    integration_connection_id: call.integration_connection_id,
    customer_id: call.customer_id,
    lead_id: call.lead_id,
    job_id: null,
    sms_message_id: null,
    provider: "twilio",
    provider_account_sid: accountSid,
    provider_event_sid: childCallSid,
    provider_parent_sid: parentCallSid,
    event_type: "voice_status",
    channel: "voice",
    direction: "outbound",
    status: finalStatus,
    from_phone: call.from_phone,
    to_phone: null,
    business_phone: call.business_phone,
    customer_phone: call.customer_phone,
    routing_status: "matched",
    correlation_id: call.correlation_id,
    request_fingerprint: requestFingerprint,
    payload_summary: {
      provider_dial_status: providerDialStatus,
      duration_seconds: durationSeconds,
      dial_bridged: payload.dialBridged,
      signature_validated: true,
      signature_evidence: signatureEvidence,
      forward_destination_proof: destinationProof,
    },
    response_summary: {
      persisted: true,
      call_record_id: call.id,
      recording_requested: false,
      transcription_requested: false,
      automatic_reply_sent: false,
      automatic_lead_created: false,
      evidence_proof: evidenceProof,
    },
    error_code: null,
    error_message: null,
    occurred_at: payload.occurredAt,
  };
  const { data: insertedEvent, error: eventError } = await client
    .from("communication_provider_events")
    .insert(eventInsert)
    .select("*")
    .single();
  let event = insertedEvent;
  let duplicate = false;
  if (eventError?.code === "23505") {
    duplicate = true;
    const existingResult = await client
      .from("communication_provider_events")
      .select("*")
      .eq("id", eventId)
      .limit(2);
    if (existingResult.error || existingResult.data?.length !== 1) {
      throw new TwilioWebhookError("voice_status_event_lookup_failed", 503);
    }
    event = existingResult.data[0];
  } else if (eventError || !event) {
    throw new TwilioWebhookError("voice_status_event_persistence_failed", 503);
  }
  if (
    !voiceStatusEventMatchesClaim(event, call, {
      id: eventId,
      childCallSid,
      status: finalStatus,
      providerDialStatus,
      dialBridged: payload.dialBridged,
      durationSeconds,
      requestFingerprint,
      destinationProof,
      evidenceProof,
    })
  ) {
    throw new TwilioWebhookError("voice_status_event_conflict", 409);
  }

  const endedAtMs = new Date(event.occurred_at).getTime();
  const startedAtMs = call.started_at ? new Date(call.started_at).getTime() : Number.NaN;
  const derivedAnsweredAtMs = endedAtMs - durationSeconds * 1000;
  if (!Number.isFinite(endedAtMs) || !Number.isFinite(derivedAnsweredAtMs)) {
    throw new TwilioWebhookError("voice_status_timestamp_invalid", 400);
  }
  const answeredAt =
    finalStatus === "completed"
      ? new Date(
          Number.isFinite(startedAtMs)
            ? Math.max(derivedAnsweredAtMs, startedAtMs)
            : derivedAnsweredAtMs,
        ).toISOString()
      : null;

  const metadata = {
    ...(call.metadata ?? {}),
    status_ingestion_status: "complete",
    voice_status_event_id: event.id,
    forwarded_child_call_sid: childCallSid,
    status_request_fingerprint: requestFingerprint,
    status_evidence_proof: evidenceProof,
    provider_dial_status: providerDialStatus,
    answered_at_source:
      finalStatus === "completed"
        ? "derived_from_dial_completion_duration"
        : "not_answered",
    recording_requested: false,
    transcription_requested: false,
    automatic_lead_created: false,
  };
  const updateResult = await client
    .from("call_records")
    .update({
      call_status: finalStatus,
      answered_at: answeredAt,
      ended_at: event.occurred_at,
      duration_seconds: durationSeconds,
      recording_sid: null,
      recording_status: "not_requested",
      recording_duration_seconds: null,
      transcript_status: "not_requested",
      follow_up_required: finalStatus !== "completed",
      metadata,
    })
    .eq("id", call.id)
    .eq("provider_call_sid", parentCallSid)
    .select("id")
    .single();
  if (updateResult.error || updateResult.data?.id !== call.id) {
    throw new TwilioWebhookError("voice_call_status_update_failed", 503);
  }

  return {
    stored: !duplicate,
    duplicate,
    migrationRequired: false,
    providerEventId: event.id,
    smsMessageId: null,
    callRecordId: call.id,
    routingStatus: "matched",
    skippedReason: null,
  };
}

class TwilioWebhookError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

export function createTwilioTwiMLResponse() {
  return new Response("<Response></Response>", {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function createTwilioVoiceXmlResponse(voiceResponse: InstanceType<typeof twilio.twiml.VoiceResponse>) {
  return new Response(voiceResponse.toString(), {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function createTwilioVoiceForwardingResponse({
  destination,
  statusCallbackUrl,
}: {
  destination: string;
  statusCallbackUrl: string;
}) {
  if (!STRICT_E164_PATTERN.test(destination)) {
    throw new Error("Twilio voice forwarding destination is invalid.");
  }
  const callbackUrl = new URL(statusCallbackUrl);
  if (
    callbackUrl.protocol !== "https:" ||
    callbackUrl.username ||
    callbackUrl.password ||
    callbackUrl.search ||
    callbackUrl.hash
  ) {
    throw new Error("Twilio voice status callback URL is invalid.");
  }

  const voiceResponse = new twilio.twiml.VoiceResponse();
  voiceResponse.dial(
    {
      action: callbackUrl.toString(),
      method: "POST",
      answerOnBridge: true,
      record: "do-not-record",
      timeout: 30,
    },
    destination,
  );
  return createTwilioVoiceXmlResponse(voiceResponse);
}

export function createTwilioVoiceEndResponse() {
  return createTwilioVoiceXmlResponse(new twilio.twiml.VoiceResponse());
}

function rejectedResponse(signatureStatus: Exclude<TwilioSignatureStatus, "valid">) {
  const status =
    signatureStatus === "unsupported_content_type"
      ? 415
      : signatureStatus === "payload_too_large"
        ? 413
        : signatureStatus === "malformed_request"
          ? 400
          : signatureStatus === "missing_auth_token" || signatureStatus === "missing_public_base_url"
            ? 503
            : 403;
  return new Response("Twilio webhook rejected.", {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function handleTwilioWebhook(
  request: NextRequest,
  expectedKind: TwilioWebhookKind,
) {
  if (expectedKind !== "sms_inbound" && expectedKind !== "voice_inbound" && expectedKind !== "voice_status") {
    return new Response("Twilio callback is disabled.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const parsed = await parseTwilioWebhookRequest(request, expectedKind);
  if (parsed.signatureStatus !== "valid") {
    return rejectedResponse(parsed.signatureStatus);
  }
  if (!parsed.signatureEvidence) {
    return new Response("Twilio signature evidence is unavailable.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (expectedKind === "voice_inbound") {
    const config = getTwilioServerConfig();
    const voiceConfig = config.tucsonVoiceForwarding;
    const receivingNumber = normalizeTwilioPhoneNumber(parsed.payload.to);
    const callerNumber = normalizeTwilioPhoneNumber(parsed.payload.from);

    if (!config.accountSid || !voiceConfig.tucsonNumberE164) {
      return new Response("Twilio Tucson voice configuration is incomplete.", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (parsed.payload.accountSid !== config.accountSid) {
      return new Response("Twilio account rejected.", {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (!receivingNumber || receivingNumber !== voiceConfig.tucsonNumberE164) {
      return new Response("Twilio voice route rejected.", {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (
      !voiceConfig.configurationReady ||
      !voiceConfig.destinationE164 ||
      !voiceConfig.statusCallbackUrl
    ) {
      return new Response("Twilio Tucson voice forwarding remains disabled or incomplete.", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (callerNumber && callerNumber === voiceConfig.destinationE164) {
      return new Response("Twilio voice forwarding loop rejected.", {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      await storeTwilioTucsonVoiceInboundPayload(
        parsed.payload,
        parsed.signatureEvidence,
        voiceConfig.destinationE164,
      );
      return createTwilioVoiceForwardingResponse({
        destination: voiceConfig.destinationE164,
        statusCallbackUrl: voiceConfig.statusCallbackUrl,
      });
    } catch (error) {
      const status = error instanceof TwilioWebhookError ? error.status : 503;
      return new Response("Twilio Tucson inbound voice was not accepted.", {
        status,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  if (expectedKind === "voice_status") {
    const config = getTwilioServerConfig();
    const receivingNumber = normalizeTwilioPhoneNumber(parsed.payload.to);

    if (!config.accountSid || !config.tucsonVoiceForwarding.tucsonNumberE164) {
      return new Response("Twilio Tucson voice status configuration is incomplete.", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (parsed.payload.accountSid !== config.accountSid) {
      return new Response("Twilio account rejected.", {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (!receivingNumber || receivingNumber !== config.tucsonVoiceForwarding.tucsonNumberE164) {
      return new Response("Twilio voice status route rejected.", {
        status: 403,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    try {
      await storeTwilioTucsonVoiceStatusPayload(parsed.payload, parsed.signatureEvidence);
      return createTwilioVoiceEndResponse();
    } catch (error) {
      const status = error instanceof TwilioWebhookError ? error.status : 503;
      return new Response("Twilio Tucson voice status was not accepted.", {
        status,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }

  if (!getBooleanEnvValue("TWILIO_INBOUND_SMS_ENABLED")) {
    return new Response("Twilio inbound SMS processing remains disabled.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (getBooleanEnvValue("TWILIO_OUTBOUND_SMS_ENABLED")) {
    return new Response("Twilio inbound SMS is unavailable while outbound SMS is enabled.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const configuredAccountSid = getEnvValue("TWILIO_ACCOUNT_SID");
  const configuredMessagingServiceSid = getEnvValue("TWILIO_MESSAGING_SERVICE_SID");
  if (
    !configuredAccountSid ||
    !ACCOUNT_SID_PATTERN.test(configuredAccountSid) ||
    !configuredMessagingServiceSid ||
    !MESSAGING_SERVICE_SID_PATTERN.test(configuredMessagingServiceSid)
  ) {
    return new Response("Twilio inbound SMS configuration is incomplete.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (parsed.payload.accountSid !== configuredAccountSid) {
    return new Response("Twilio account rejected.", {
      status: 403,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  try {
    await storeTwilioWebhookPayload(parsed.payload, parsed.signatureEvidence);
    return createTwilioTwiMLResponse();
  } catch (error) {
    const status = error instanceof TwilioWebhookError ? error.status : 503;
    return new Response("Twilio inbound SMS was not accepted.", {
      status,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
