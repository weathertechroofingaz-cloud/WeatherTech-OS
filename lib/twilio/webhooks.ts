import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import twilio from "twilio";
import type {
  BusinessPhoneNumberRecord,
  CommunicationProviderEventRecord,
  CustomerRecord,
  Database,
  IntegrationConnectionRecord,
  LeadRecord,
  SmsMessageInsert,
  SmsMessageRecord,
} from "../crm/types";

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
  parentCallSid: string | null;
  recordingSid: string | null;
  messagingServiceSid: string | null;
  numMedia: number | null;
  from: string | null;
  to: string | null;
  body: string | null;
  messageStatus: string | null;
  callStatus: string | null;
  recordingStatus: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationSeconds: number | null;
  recordingDurationSeconds: number | null;
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
const ACCOUNT_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;
const MESSAGE_SID_PATTERN = /^SM[0-9a-fA-F]{32}$/;
const MESSAGING_SERVICE_SID_PATTERN = /^MG[0-9a-fA-F]{32}$/;
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
    parentCallSid: null,
    recordingSid: null,
    messagingServiceSid: null,
    numMedia: null,
    from: null,
    to: null,
    body: null,
    messageStatus: null,
    callStatus: null,
    recordingStatus: null,
    errorCode: null,
    errorMessage: null,
    durationSeconds: null,
    recordingDurationSeconds: null,
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
  payload.parentCallSid = getOnlyFormValue(params, ["ParentCallSid"]);
  payload.recordingSid = getOnlyFormValue(params, ["RecordingSid"]);
  payload.callStatus = getOnlyFormValue(params, ["CallStatus"]);
  payload.recordingStatus = getOnlyFormValue(params, ["RecordingStatus"]);
  payload.errorCode = getOnlyFormValue(params, ["ErrorCode"]);
  payload.errorMessage = getOnlyFormValue(params, ["ErrorMessage"]);
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

function getCanonicalWebhookUrl(request: NextRequest) {
  const configuredBaseUrl = getEnvValue("TWILIO_PUBLIC_BASE_URL");

  if (!configuredBaseUrl) {
    return null;
  }

  try {
    const baseUrl = new URL(configuredBaseUrl);

    if (
      baseUrl.protocol !== "https:" ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      return null;
    }

    return new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, `${baseUrl.origin}/`).toString();
  } catch {
    return null;
  }
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

export function normalizeTwilioPhoneNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || !/^\+?[0-9().\s-]+$/.test(trimmed)) {
    return null;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 && !digits.startsWith("0")
      ? `+${digits}`
      : null;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return null;
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
  const candidates = [
    {
      companyName: "WeatherTech Roofing LLC",
      phone: normalizeTwilioPhoneNumber(getEnvValue("TWILIO_WEATHERTECH_PHOENIX_NUMBER")),
    },
    {
      companyName: "WeatherTech Roofing LLC",
      phone: normalizeTwilioPhoneNumber(getEnvValue("TWILIO_WEATHERTECH_TUCSON_NUMBER")),
    },
    {
      companyName: "IHC Painting",
      phone: normalizeTwilioPhoneNumber(getEnvValue("TWILIO_IHC_NUMBER")),
    },
  ].filter((candidate) => candidate.phone === phoneNumber);

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

  const { data: numbers, error: numberError } = await client
    .from("business_phone_numbers")
    .select("*")
    .eq("phone_number_e164", payload.to)
    .eq("provider_account_sid", payload.accountSid)
    .eq("messaging_service_sid", payload.messagingServiceSid)
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
  if (!number.integration_connection_id) {
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
    company.name !== configuredNumber.companyName ||
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
  if (expectedKind !== "sms_inbound") {
    return new Response("Twilio callback is disabled in the inbound-SMS-only phase.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const parsed = await parseTwilioWebhookRequest(request, expectedKind);
  if (parsed.signatureStatus !== "valid") {
    return rejectedResponse(parsed.signatureStatus);
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
    if (!parsed.signatureEvidence) {
      return new Response("Twilio signature evidence is unavailable.", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      });
    }
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
