import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  sanitizeIntegrationSyncLogSummary,
  sanitizeIntegrationSyncLogText,
} from "../crm/integrations";
import {
  createIntegrationSyncLog,
  createSmsMessage,
} from "../crm/repository";
import type {
  Database,
  IntegrationConnectionRecord,
  CallRecordInsert,
  SmsMessageRecord,
  SmsMessageInsert,
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
  | "missing_signature"
  | "unsupported_content_type";

type CrmClient = SupabaseClient<Database>;

type BusinessPhoneRouteRow = {
  id: string;
  company_id: string;
  integration_connection_id: string | null;
  phone_number_e164: string | null;
  display_name: string;
  routing_key: string;
  business_location: string;
  team_queue: string;
  lead_source: string;
  routing_status: string;
};

type BusinessPhoneRouteResult =
  | { status: "matched"; row: BusinessPhoneRouteRow }
  | { status: "needs_review"; row: null }
  | { status: "migration_required"; row: null };

export type TwilioWebhookPayload = {
  kind: TwilioWebhookKind;
  accountSid: string | null;
  messageSid: string | null;
  callSid: string | null;
  parentCallSid: string | null;
  recordingSid: string | null;
  messagingServiceSid: string | null;
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

const SMS_INBOUND_EVENT_TYPE = "sms.inbound";

function getServiceSupabaseClient(): CrmClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}

export function createTwilioTwiMLResponse() {
  return new Response("<Response></Response>", {
    status: 200,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

function getRecordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      const trimmed = value.trim();

      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function getRecordBody(record: Record<string, unknown>) {
  const value = record.Body ?? record.body;

  return typeof value === "string" ? value : null;
}

function getRecordInteger(record: Record<string, unknown>, keys: string[]) {
  const value = getRecordValue(record, keys);
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function getRequestUrlForTwilioSignature(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.split(",")[0]?.trim();

  if (forwardedProto) {
    requestUrl.protocol = `${forwardedProto}:`;
  }

  if (forwardedHost) {
    requestUrl.host = forwardedHost;
  }

  return requestUrl.toString();
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function validateTwilioSignature(request: NextRequest, params: URLSearchParams) {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature")?.trim();

  if (!authToken) {
    return "missing_auth_token" satisfies TwilioSignatureStatus;
  }

  if (!signature) {
    return "missing_signature" satisfies TwilioSignatureStatus;
  }

  const signatureBase = `${getRequestUrlForTwilioSignature(request)}${Array.from(
    params.entries(),
  )
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}${value}`)
    .join("")}`;
  const expectedSignature = crypto
    .createHmac("sha1", authToken)
    .update(signatureBase)
    .digest("base64");

  return timingSafeEqual(signature, expectedSignature)
    ? ("valid" satisfies TwilioSignatureStatus)
    : ("invalid" satisfies TwilioSignatureStatus);
}

function inferWebhookKind(
  record: Record<string, unknown>,
  expectedKind: TwilioWebhookKind,
): TwilioWebhookKind {
  if (expectedKind !== "sms_inbound") {
    return expectedKind;
  }

  if (getRecordValue(record, ["MessageStatus", "SmsStatus", "messageStatus"])) {
    return "sms_status";
  }

  return expectedKind;
}

function buildPayloadFromRecord(
  record: Record<string, unknown>,
  expectedKind: TwilioWebhookKind,
): TwilioWebhookPayload {
  const kind = inferWebhookKind(record, expectedKind);

  return {
    kind,
    accountSid: getRecordValue(record, ["AccountSid", "accountSid"]),
    messageSid: getRecordValue(record, [
      "MessageSid",
      "SmsSid",
      "SmsMessageSid",
      "messageSid",
      "smsSid",
    ]),
    callSid: getRecordValue(record, ["CallSid", "callSid"]),
    parentCallSid: getRecordValue(record, ["ParentCallSid", "parentCallSid"]),
    recordingSid: getRecordValue(record, ["RecordingSid", "recordingSid"]),
    messagingServiceSid: getRecordValue(record, [
      "MessagingServiceSid",
      "messagingServiceSid",
    ]),
    from: getRecordValue(record, ["From", "from"]),
    to: getRecordValue(record, ["To", "to"]),
    body: getRecordBody(record),
    messageStatus: getRecordValue(record, [
      "MessageStatus",
      "SmsStatus",
      "messageStatus",
    ]),
    callStatus: getRecordValue(record, ["CallStatus", "callStatus"]),
    recordingStatus: getRecordValue(record, [
      "RecordingStatus",
      "recordingStatus",
    ]),
    errorCode: getRecordValue(record, ["ErrorCode", "errorCode"]),
    errorMessage: getRecordValue(record, ["ErrorMessage", "errorMessage"]),
    durationSeconds: getRecordInteger(record, ["CallDuration", "Duration"]),
    recordingDurationSeconds: getRecordInteger(record, ["RecordingDuration"]),
    occurredAt: new Date().toISOString(),
  };
}

export async function parseTwilioWebhookRequest(
  request: NextRequest,
  expectedKind: TwilioWebhookKind,
): Promise<ParsedTwilioWebhookRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body: unknown = await request.json().catch(() => ({}));

    return {
      payload: buildPayloadFromRecord(
        body && typeof body === "object" ? (body as Record<string, unknown>) : {},
        expectedKind,
      ),
      signatureStatus: "unsupported_content_type",
    };
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);

  return {
    payload: buildPayloadFromRecord(Object.fromEntries(params.entries()), expectedKind),
    signatureStatus: validateTwilioSignature(request, params),
  };
}

export function normalizeTwilioPhoneNumber(value: string | null) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return trimmed || null;
}

function normalizePhoneDigits(value: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function isSamePhone(left: string | null, right: string | null) {
  const normalizedLeft = normalizePhoneDigits(left);
  const normalizedRight = normalizePhoneDigits(right);

  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function isSameSid(left: string | null, right: string | null) {
  return Boolean(left && right && left.trim() === right.trim());
}

function maskPhone(value: string | null) {
  const digits = normalizePhoneDigits(value);

  return digits.length > 4 ? `****${digits.slice(-4)}` : "****";
}

function maskSid(value: string | null) {
  if (!value) {
    return null;
  }

  return `${value.slice(0, 2)}****`;
}

function getSettingValue(
  settings: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = settings[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function matchesInboundNumber(
  connection: IntegrationConnectionRecord,
  payload: TwilioWebhookPayload,
) {
  const settings = connection.settings ?? {};
  const configuredNumber = getSettingValue(settings, [
    "fromNumber",
    "from_number",
    "phoneNumber",
    "phone_number",
    "senderNumber",
    "sender_number",
    "twilioFromNumber",
    "twilio_from_number",
  ]);

  return (
    isSamePhone(configuredNumber, getBusinessPhoneCandidate(payload)) ||
    isSamePhone(connection.webhook_channel_id, getBusinessPhoneCandidate(payload)) ||
    isSamePhone(connection.webhook_resource_id, getBusinessPhoneCandidate(payload))
  );
}

function matchesMessagingService(
  connection: IntegrationConnectionRecord,
  payload: TwilioWebhookPayload,
) {
  const settings = connection.settings ?? {};
  const configuredMessagingServiceSid = getSettingValue(settings, [
    "messagingServiceSid",
    "messaging_service_sid",
    "twilioMessagingServiceSid",
    "twilio_messaging_service_sid",
  ]);
  const envMessagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;

  return (
    isSameSid(configuredMessagingServiceSid, payload.messagingServiceSid) ||
    isSameSid(connection.webhook_resource_id, payload.messagingServiceSid) ||
    isSameSid(configuredMessagingServiceSid, envMessagingServiceSid)
  );
}

function findInboundConnection(
  connections: IntegrationConnectionRecord[],
  payload: TwilioWebhookPayload,
) {
  const explicitMatch = connections.find(
    (connection) =>
      matchesInboundNumber(connection, payload) ||
      matchesMessagingService(connection, payload),
  );

  if (explicitMatch) {
    return explicitMatch;
  }

  const accountMatches = connections.filter((connection) =>
    isSameSid(connection.external_account_id, payload.accountSid),
  );

  if (accountMatches.length === 1) {
    return accountMatches[0];
  }

  return connections.length === 1 ? connections[0] : null;
}

function describeSafeError(error: unknown) {
  if (error instanceof Error) {
    return sanitizeIntegrationSyncLogText(error.message) ?? "Request failed.";
  }

  if (typeof error === "string") {
    return sanitizeIntegrationSyncLogText(error) ?? "Request failed.";
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return sanitizeIntegrationSyncLogText(message) ?? "Request failed.";
    }
  }

  return "Request failed.";
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; message?: unknown };
  const message = typeof record.message === "string" ? record.message : "";

  return record.code === "42P01" || message.includes("does not exist");
}

function getMissingPayloadFields(payload: TwilioWebhookPayload) {
  const required = [
    payload.from ? null : "From",
    payload.to ? null : "To",
    payload.accountSid ? null : "AccountSid",
  ];

  if (payload.kind === "sms_inbound") {
    required.push(payload.body !== null ? null : "Body");
    required.push(payload.messageSid ? null : "MessageSid");
  }

  if (payload.kind === "sms_status") {
    required.push(payload.messageSid ? null : "MessageSid");
    required.push(payload.messageStatus ? null : "MessageStatus");
  }

  if (payload.kind === "voice_inbound" || payload.kind === "voice_status") {
    required.push(payload.callSid ? null : "CallSid");
  }

  if (payload.kind === "recording_status") {
    required.push(payload.callSid ? null : "CallSid");
    required.push(payload.recordingSid ? null : "RecordingSid");
  }

  return required.filter((value): value is string => Boolean(value));
}

function getBusinessPhoneCandidate(payload: TwilioWebhookPayload) {
  if (payload.kind === "sms_status") {
    return payload.from;
  }

  return payload.to;
}

function getCustomerPhoneCandidate(payload: TwilioWebhookPayload) {
  if (payload.kind === "sms_status") {
    return payload.to;
  }

  return payload.from;
}

async function findBusinessPhoneRoute(
  client: CrmClient,
  payload: TwilioWebhookPayload,
): Promise<BusinessPhoneRouteResult> {
  const businessPhone = normalizeTwilioPhoneNumber(getBusinessPhoneCandidate(payload));

  if (!businessPhone) {
    return { status: "needs_review", row: null };
  }

  const { data, error } = await client
    .from("business_phone_numbers")
    .select("*")
    .eq("phone_number_e164", businessPhone)
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error)) {
      return { status: "migration_required", row: null };
    }

    throw error;
  }

  return data
    ? { status: "matched", row: data as BusinessPhoneRouteRow }
    : { status: "needs_review", row: null };
}

async function getExistingSmsMessage(
  client: CrmClient,
  messageSid: string,
): Promise<SmsMessageRecord | null> {
  const { data } = await client
    .from("sms_messages")
    .select("*")
    .eq("twilio_message_sid", messageSid)
    .maybeSingle();

  return data;
}

async function createInboundSyncLog({
  client,
  connection,
  payload,
  smsMessageId,
  status,
  errorMessage = null,
}: {
  client: CrmClient;
  connection: IntegrationConnectionRecord;
  payload: TwilioWebhookPayload;
  smsMessageId: string | null;
  status: "succeeded" | "failed" | "skipped";
  errorMessage?: string | null;
}) {
  const now = new Date().toISOString();

  return createIntegrationSyncLog(client, {
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    provider: "twilio_sms",
    direction: "provider_to_weathertech",
    event_type: SMS_INBOUND_EVENT_TYPE,
    status,
    related_table: smsMessageId ? "sms_messages" : null,
    related_record_id: smsMessageId,
    external_id: payload.messageSid,
    attempt_count: 1,
    max_attempts: 1,
    last_attempted_at: now,
    completed_at: now,
    request_summary: sanitizeIntegrationSyncLogSummary(getSafePayloadSummary(payload)),
    response_summary: sanitizeIntegrationSyncLogSummary({
      stored: status === "succeeded",
      smsMessageId,
    }),
    error_code: errorMessage ? "twilio_inbound_storage_failed" : null,
    error_message: errorMessage,
  });
}

function getProviderEventSid(payload: TwilioWebhookPayload) {
  return payload.recordingSid ?? payload.messageSid ?? payload.callSid;
}

function getProviderParentSid(payload: TwilioWebhookPayload) {
  return payload.recordingSid ? payload.callSid : payload.parentCallSid;
}

function getProvider(payload: TwilioWebhookPayload) {
  return payload.kind.startsWith("sms") ? "twilio_sms" : "twilio";
}

function getChannel(payload: TwilioWebhookPayload) {
  return payload.kind.startsWith("sms") ? "sms" : "voice";
}

function getDirection(payload: TwilioWebhookPayload) {
  return payload.kind === "sms_status" ? "outbound" : "inbound";
}

function getEventStatus(payload: TwilioWebhookPayload) {
  return (
    payload.messageStatus ??
    payload.callStatus ??
    payload.recordingStatus ??
    (payload.kind === "sms_inbound" ? "received" : "received")
  );
}

function getSafePayloadSummary(payload: TwilioWebhookPayload) {
  return {
    accountSid: maskSid(payload.accountSid),
    messageSid: maskSid(payload.messageSid),
    callSid: maskSid(payload.callSid),
    recordingSid: maskSid(payload.recordingSid),
    messagingServiceSid: maskSid(payload.messagingServiceSid),
    from: maskPhone(payload.from),
    to: maskPhone(payload.to),
    bodyLength: payload.body?.length ?? 0,
    messageStatus: payload.messageStatus,
    callStatus: payload.callStatus,
    recordingStatus: payload.recordingStatus,
    durationSeconds: payload.durationSeconds,
    recordingDurationSeconds: payload.recordingDurationSeconds,
    errorCode: payload.errorCode,
    errorMessage: sanitizeIntegrationSyncLogText(payload.errorMessage),
  };
}

async function storeProviderEvent({
  client,
  payload,
  route,
  smsMessageId,
  callRecordId,
}: {
  client: CrmClient;
  payload: TwilioWebhookPayload;
  route: BusinessPhoneRouteResult;
  smsMessageId: string | null;
  callRecordId: string | null;
}) {
  if (route.status === "migration_required") {
    return {
      providerEventId: null,
      duplicate: false,
      migrationRequired: true,
    };
  }

  const routeRow = route.row;
  const { data, error } = await client
    .from("communication_provider_events")
    .insert({
      company_id: routeRow?.company_id ?? null,
      business_phone_number_id: routeRow?.id ?? null,
      integration_connection_id: routeRow?.integration_connection_id ?? null,
      sms_message_id: smsMessageId,
      provider: getProvider(payload),
      provider_account_sid: payload.accountSid,
      provider_event_sid: getProviderEventSid(payload),
      provider_parent_sid: getProviderParentSid(payload),
      event_type: payload.kind,
      channel: getChannel(payload),
      direction: getDirection(payload),
      status: getEventStatus(payload),
      from_phone: normalizeTwilioPhoneNumber(payload.from),
      to_phone: normalizeTwilioPhoneNumber(payload.to),
      business_phone: normalizeTwilioPhoneNumber(getBusinessPhoneCandidate(payload)),
      customer_phone: normalizeTwilioPhoneNumber(getCustomerPhoneCandidate(payload)),
      routing_status: route.status === "matched" ? "matched" : "needs_review",
      payload_summary: sanitizeIntegrationSyncLogSummary(getSafePayloadSummary(payload)),
      response_summary: sanitizeIntegrationSyncLogSummary({
        smsMessageId,
        callRecordId,
        routingStatus: route.status,
      }),
      error_code: payload.errorCode,
      error_message: sanitizeIntegrationSyncLogText(payload.errorMessage),
      occurred_at: payload.occurredAt,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      return {
        providerEventId: null,
        duplicate: false,
        migrationRequired: true,
      };
    }

    if (error.code === "23505") {
      return {
        providerEventId: null,
        duplicate: true,
        migrationRequired: false,
      };
    }

    throw error;
  }

  return {
    providerEventId: data.id,
    duplicate: false,
    migrationRequired: false,
  };
}

function normalizeSmsDeliveryStatus(status: string | null) {
  const normalized = status?.toLowerCase().replace(/[^a-z]+/g, "_") ?? null;

  if (
    normalized === "accepted" ||
    normalized === "queued" ||
    normalized === "sending" ||
    normalized === "sent" ||
    normalized === "delivered" ||
    normalized === "undelivered" ||
    normalized === "failed" ||
    normalized === "received"
  ) {
    return normalized;
  }

  return null;
}

async function updateSmsStatusFromCallback(client: CrmClient, payload: TwilioWebhookPayload) {
  if (payload.kind !== "sms_status" || !payload.messageSid) {
    return null;
  }

  const deliveryStatus = normalizeSmsDeliveryStatus(payload.messageStatus);
  const now = new Date().toISOString();
  const update: Partial<SmsMessageInsert> = {
    delivery_status: deliveryStatus,
    last_error: sanitizeIntegrationSyncLogText(payload.errorMessage),
    provider_account_sid: payload.accountSid,
    provider_messaging_service_sid: payload.messagingServiceSid,
  };

  if (deliveryStatus === "failed" || deliveryStatus === "undelivered") {
    update.status = "failed";
    update.failed_at = now;
  } else if (deliveryStatus === "delivered") {
    update.status = "sent";
    update.delivered_at = now;
  } else if (deliveryStatus === "sent") {
    update.status = "sent";
  }

  const { data, error } = await client
    .from("sms_messages")
    .update(update)
    .eq("twilio_message_sid", payload.messageSid)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isMissingRelationError(error) || error.code === "42703") {
      return null;
    }

    throw error;
  }

  return data?.id ?? null;
}

function normalizeCallStatus(status: string | null) {
  const normalized = status?.toLowerCase().replace(/[^a-z]+/g, "_") ?? null;

  if (normalized === "in_progress") {
    return "in_progress";
  }

  if (normalized === "completed") {
    return "completed";
  }

  if (normalized === "busy") {
    return "busy";
  }

  if (normalized === "failed" || normalized === "canceled") {
    return "failed";
  }

  if (normalized === "no_answer") {
    return "missed";
  }

  if (normalized === "ringing") {
    return "ringing";
  }

  if (normalized === "answered") {
    return "answered";
  }

  return "incoming";
}

function normalizeRecordingStatus(status: string | null) {
  const normalized = status?.toLowerCase().replace(/[^a-z]+/g, "_") ?? null;

  if (normalized === "completed") {
    return "completed";
  }

  if (normalized === "failed") {
    return "failed";
  }

  if (normalized === "in_progress") {
    return "in_progress";
  }

  return "not_requested";
}

async function upsertCallRecord({
  client,
  payload,
  route,
}: {
  client: CrmClient;
  payload: TwilioWebhookPayload;
  route: BusinessPhoneRouteResult;
}) {
  if (
    (payload.kind !== "voice_inbound" &&
      payload.kind !== "voice_status" &&
      payload.kind !== "recording_status") ||
    !payload.callSid ||
    route.status === "migration_required"
  ) {
    return null;
  }

  const routeRow = route.row;
  const { data: existing, error: lookupError } = await client
    .from("call_records")
    .select("id")
    .eq("provider_call_sid", payload.callSid)
    .maybeSingle();

  if (lookupError) {
    if (isMissingRelationError(lookupError)) {
      return null;
    }

    throw lookupError;
  }

  const recordInput: CallRecordInsert = {
    company_id: routeRow?.company_id ?? null,
    business_phone_number_id: routeRow?.id ?? null,
    integration_connection_id: routeRow?.integration_connection_id ?? null,
    provider: "twilio",
    provider_account_sid: payload.accountSid,
    provider_call_sid: payload.callSid,
    provider_parent_call_sid: payload.parentCallSid,
    direction: "inbound",
    call_status: normalizeCallStatus(payload.callStatus),
    from_phone: normalizeTwilioPhoneNumber(payload.from),
    to_phone: normalizeTwilioPhoneNumber(payload.to),
    business_phone: normalizeTwilioPhoneNumber(getBusinessPhoneCandidate(payload)),
    customer_phone: normalizeTwilioPhoneNumber(getCustomerPhoneCandidate(payload)),
    routing_status: route.status === "matched" ? "matched" : "needs_review",
    started_at: payload.occurredAt,
    ended_at: payload.durationSeconds ? payload.occurredAt : null,
    duration_seconds: payload.durationSeconds,
    recording_sid: payload.recordingSid,
    recording_status:
      payload.kind === "recording_status"
        ? normalizeRecordingStatus(payload.recordingStatus)
        : "not_requested",
    recording_duration_seconds: payload.recordingDurationSeconds,
    transcript_status: "not_requested",
    follow_up_required:
      normalizeCallStatus(payload.callStatus) === "missed" ||
      normalizeCallStatus(payload.callStatus) === "failed",
    metadata: sanitizeIntegrationSyncLogSummary(getSafePayloadSummary(payload)),
  };

  if (existing?.id) {
    const { data, error } = await client
      .from("call_records")
      .update(recordInput)
      .eq("id", existing.id)
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data.id;
  }

  const { data, error } = await client
    .from("call_records")
    .insert(recordInput)
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error)) {
      return null;
    }

    throw error;
  }

  return data.id;
}

async function getTwilioConnections(client: CrmClient) {
  const { data, error } = await client
    .from("integration_connections")
    .select("*")
    .in("provider", ["twilio", "twilio_sms"])
    .order("updated_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as IntegrationConnectionRecord[];
}

async function storeInboundSmsWithExistingModel({
  client,
  payload,
  route,
}: {
  client: CrmClient;
  payload: TwilioWebhookPayload;
  route: BusinessPhoneRouteResult;
}) {
  if (payload.kind !== "sms_inbound") {
    return {
      smsMessageId: null,
      duplicate: false,
      skippedReason: null,
    };
  }

  const connections = await getTwilioConnections(client);
  const connection = findInboundConnection(connections, payload);
  const routeCompanyId = route.row?.company_id ?? null;
  const companyId = routeCompanyId ?? connection?.company_id ?? null;

  if (!companyId) {
    return {
      smsMessageId: null,
      duplicate: false,
      skippedReason:
        "Inbound SMS was preserved as a provider event but no company route was matched.",
    };
  }

  const existingMessage = await getExistingSmsMessage(client, payload.messageSid ?? "");

  if (existingMessage) {
    if (connection) {
      await createInboundSyncLog({
        client,
        connection,
        payload,
        smsMessageId: existingMessage.id,
        status: "skipped",
      }).catch(() => null);
    }

    return {
      smsMessageId: existingMessage.id,
      duplicate: true,
      skippedReason: "Duplicate Twilio MessageSid was already stored.",
    };
  }

  const now = new Date().toISOString();
  const smsMessage = await createSmsMessage(client, {
    company_id: companyId,
    integration_connection_id: route.row?.integration_connection_id ?? connection?.id ?? null,
    provider: "twilio_sms",
    category: "general",
    status: "sent",
    to_phone: payload.to ?? "",
    from_phone: payload.from,
    body: payload.body ?? "",
    twilio_message_sid: payload.messageSid,
    sent_at: now,
  });

  if (connection) {
    await createInboundSyncLog({
      client,
      connection,
      payload,
      smsMessageId: smsMessage.id,
      status: "succeeded",
    }).catch(() => null);
  }

  return {
    smsMessageId: smsMessage.id,
    duplicate: false,
    skippedReason: null,
  };
}

export async function storeTwilioWebhookPayload(
  payload: TwilioWebhookPayload,
): Promise<TwilioStorageResult> {
  const missingFields = getMissingPayloadFields(payload);

  if (missingFields.length > 0) {
    return {
      stored: false,
      duplicate: false,
      migrationRequired: false,
      providerEventId: null,
      smsMessageId: null,
      callRecordId: null,
      routingStatus: "needs_review",
      skippedReason: `Missing Twilio fields: ${missingFields.join(", ")}.`,
    };
  }

  const client = getServiceSupabaseClient();

  if (!client) {
    return {
      stored: false,
      duplicate: false,
      migrationRequired: false,
      providerEventId: null,
      smsMessageId: null,
      callRecordId: null,
      routingStatus: "needs_review",
      skippedReason:
        "SUPABASE_SERVICE_ROLE_KEY is not configured, so Twilio storage was skipped.",
    };
  }

  try {
    const route = await findBusinessPhoneRoute(client, payload);
    const smsStorage =
      payload.kind === "sms_inbound"
        ? await storeInboundSmsWithExistingModel({ client, payload, route })
        : {
            smsMessageId: await updateSmsStatusFromCallback(client, payload),
            duplicate: false,
            skippedReason: null,
          };
    const callRecordId = await upsertCallRecord({ client, payload, route });
    const providerEvent = await storeProviderEvent({
      client,
      payload,
      route,
      smsMessageId: smsStorage.smsMessageId,
      callRecordId,
    });
    const migrationRequired = route.status === "migration_required" || providerEvent.migrationRequired;

    return {
      stored: Boolean(smsStorage.smsMessageId || providerEvent.providerEventId || callRecordId),
      duplicate: smsStorage.duplicate || providerEvent.duplicate,
      migrationRequired,
      providerEventId: providerEvent.providerEventId,
      smsMessageId: smsStorage.smsMessageId,
      callRecordId,
      routingStatus:
        route.status === "migration_required"
          ? "migration_required"
          : route.status === "matched"
            ? "matched"
            : "needs_review",
      skippedReason:
        smsStorage.skippedReason ??
        (migrationRequired
          ? "Twilio live integration migration is required before provider events can be stored."
          : null),
    };
  } catch (error) {
    return {
      stored: false,
      duplicate: false,
      migrationRequired: false,
      providerEventId: null,
      smsMessageId: null,
      callRecordId: null,
      routingStatus: "needs_review",
      skippedReason: describeSafeError(error),
    };
  }
}

export async function handleTwilioWebhook(
  request: NextRequest,
  expectedKind: TwilioWebhookKind,
) {
  try {
    const { payload, signatureStatus } = await parseTwilioWebhookRequest(
      request,
      expectedKind,
    );
    const storage =
      signatureStatus === "valid"
        ? await storeTwilioWebhookPayload(payload)
        : {
            stored: false,
            duplicate: false,
            migrationRequired: false,
            providerEventId: null,
            smsMessageId: null,
            callRecordId: null,
            routingStatus: "needs_review" as const,
            skippedReason: `Twilio signature status: ${signatureStatus}.`,
          };

    console.info("[Twilio] Webhook handled", {
      kind: payload.kind,
      providerEventSid: maskSid(getProviderEventSid(payload)),
      accountSid: maskSid(payload.accountSid),
      signatureStatus,
      stored: storage.stored,
      duplicate: storage.duplicate,
      migrationRequired: storage.migrationRequired,
      routingStatus: storage.routingStatus,
      skippedReason: storage.skippedReason,
    });
  } catch (error) {
    console.error("[Twilio] Webhook failed", {
      message: describeSafeError(error),
    });
  }

  return createTwilioTwiMLResponse();
}
