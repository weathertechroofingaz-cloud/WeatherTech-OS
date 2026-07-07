import crypto from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import {
  sanitizeIntegrationSyncLogSummary,
  sanitizeIntegrationSyncLogText,
} from "../../../../../lib/crm/integrations";
import {
  createIntegrationSyncLog,
  createSmsMessage,
} from "../../../../../lib/crm/repository";
import type {
  Database,
  IntegrationConnectionRecord,
  SmsMessageRecord,
} from "../../../../../lib/crm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CrmClient = SupabaseClient<Database>;

type TwilioInboundSmsPayload = {
  from: string | null;
  to: string | null;
  body: string | null;
  messageSid: string | null;
  accountSid: string | null;
  messagingServiceSid: string | null;
};

type SignatureStatus =
  | "valid"
  | "invalid"
  | "missing_auth_token"
  | "missing_signature"
  | "unsupported_content_type";

type ParsedInboundRequest = {
  payload: TwilioInboundSmsPayload;
  signatureStatus: SignatureStatus;
};

type InboundStorageResult = {
  stored: boolean;
  duplicate: boolean;
  smsMessageId: string | null;
  syncLogId: string | null;
  skippedReason: string | null;
};

const TWILIO_INBOUND_EVENT_TYPE = "sms.inbound";

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

function createTwiMLResponse() {
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

function getPayloadFromRecord(record: Record<string, unknown>): TwilioInboundSmsPayload {
  return {
    from: getRecordValue(record, ["From", "from"]),
    to: getRecordValue(record, ["To", "to"]),
    body: getRecordBody(record),
    messageSid: getRecordValue(record, [
      "MessageSid",
      "SmsSid",
      "SmsMessageSid",
      "messageSid",
      "smsSid",
    ]),
    accountSid: getRecordValue(record, ["AccountSid", "accountSid"]),
    messagingServiceSid: getRecordValue(record, [
      "MessagingServiceSid",
      "messagingServiceSid",
    ]),
  };
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
    return "missing_auth_token" satisfies SignatureStatus;
  }

  if (!signature) {
    return "missing_signature" satisfies SignatureStatus;
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
    ? ("valid" satisfies SignatureStatus)
    : ("invalid" satisfies SignatureStatus);
}

async function parseTwilioInboundRequest(
  request: NextRequest,
): Promise<ParsedInboundRequest> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body: unknown = await request.json();

    return {
      payload: getPayloadFromRecord(
        body && typeof body === "object" ? (body as Record<string, unknown>) : {},
      ),
      signatureStatus: "unsupported_content_type",
    };
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);

  return {
    payload: getPayloadFromRecord(Object.fromEntries(params.entries())),
    signatureStatus: validateTwilioSignature(request, params),
  };
}

function getMissingPayloadFields(payload: TwilioInboundSmsPayload) {
  return [
    payload.from ? null : "From",
    payload.to ? null : "To",
    payload.body !== null ? null : "Body",
    payload.messageSid ? null : "MessageSid",
    payload.accountSid ? null : "AccountSid",
  ].filter((value): value is string => Boolean(value));
}

function normalizePhone(value: string | null) {
  return value?.replace(/\D/g, "") ?? "";
}

function isSamePhone(left: string | null, right: string | null) {
  const normalizedLeft = normalizePhone(left);
  const normalizedRight = normalizePhone(right);

  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function isSameSid(left: string | null, right: string | null) {
  return Boolean(left && right && left.trim() === right.trim());
}

function maskPhone(value: string | null) {
  const digits = normalizePhone(value);

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
  payload: TwilioInboundSmsPayload,
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
    isSamePhone(configuredNumber, payload.to) ||
    isSamePhone(connection.webhook_channel_id, payload.to) ||
    isSamePhone(connection.webhook_resource_id, payload.to)
  );
}

function matchesMessagingService(
  connection: IntegrationConnectionRecord,
  payload: TwilioInboundSmsPayload,
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
  payload: TwilioInboundSmsPayload,
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
  payload: TwilioInboundSmsPayload;
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
    event_type: TWILIO_INBOUND_EVENT_TYPE,
    status,
    related_table: smsMessageId ? "sms_messages" : null,
    related_record_id: smsMessageId,
    external_id: payload.messageSid,
    attempt_count: 1,
    max_attempts: 1,
    last_attempted_at: now,
    completed_at: now,
    request_summary: sanitizeIntegrationSyncLogSummary({
      accountSid: maskSid(payload.accountSid),
      messageSid: maskSid(payload.messageSid),
      messagingServiceSid: maskSid(payload.messagingServiceSid),
      from: maskPhone(payload.from),
      to: maskPhone(payload.to),
      bodyLength: payload.body?.length ?? 0,
    }),
    response_summary: sanitizeIntegrationSyncLogSummary({
      stored: status === "succeeded",
      smsMessageId,
    }),
    error_code: errorMessage ? "twilio_inbound_storage_failed" : null,
    error_message: errorMessage,
  });
}

async function storeInboundMessage(
  payload: TwilioInboundSmsPayload,
): Promise<InboundStorageResult> {
  const missingFields = getMissingPayloadFields(payload);

  if (missingFields.length > 0) {
    return {
      stored: false,
      duplicate: false,
      smsMessageId: null,
      syncLogId: null,
      skippedReason: `Missing Twilio fields: ${missingFields.join(", ")}.`,
    };
  }

  const client = getServiceSupabaseClient();

  if (!client) {
    return {
      stored: false,
      duplicate: false,
      smsMessageId: null,
      syncLogId: null,
      skippedReason:
        "SUPABASE_SERVICE_ROLE_KEY is not configured, so inbound SMS storage was skipped.",
    };
  }

  const { data: connections, error: connectionError } = await client
    .from("integration_connections")
    .select("*")
    .eq("provider", "twilio_sms")
    .order("updated_at", { ascending: false });

  if (connectionError) {
    throw connectionError;
  }

  const connection = findInboundConnection(
    (connections ?? []) as IntegrationConnectionRecord[],
    payload,
  );

  if (!connection) {
    return {
      stored: false,
      duplicate: false,
      smsMessageId: null,
      syncLogId: null,
      skippedReason:
        "No matching twilio_sms integration connection was found for this inbound number.",
    };
  }

  const existingMessage = await getExistingSmsMessage(client, payload.messageSid ?? "");

  if (existingMessage) {
    const syncLog = await createInboundSyncLog({
      client,
      connection,
      payload,
      smsMessageId: existingMessage.id,
      status: "skipped",
    });

    return {
      stored: true,
      duplicate: true,
      smsMessageId: existingMessage.id,
      syncLogId: syncLog.id,
      skippedReason: "Duplicate Twilio MessageSid was already stored.",
    };
  }

  try {
    const now = new Date().toISOString();
    const smsMessage = await createSmsMessage(client, {
      company_id: connection.company_id,
      integration_connection_id: connection.id,
      provider: "twilio_sms",
      category: "general",
      status: "sent",
      to_phone: payload.to ?? "",
      from_phone: payload.from,
      body: payload.body ?? "",
      twilio_message_sid: payload.messageSid,
      sent_at: now,
    });
    const syncLog = await createInboundSyncLog({
      client,
      connection,
      payload,
      smsMessageId: smsMessage.id,
      status: "succeeded",
    });

    return {
      stored: true,
      duplicate: false,
      smsMessageId: smsMessage.id,
      syncLogId: syncLog.id,
      skippedReason: null,
    };
  } catch (error) {
    const errorMessage = describeSafeError(error);

    await createInboundSyncLog({
      client,
      connection,
      payload,
      smsMessageId: null,
      status: "failed",
      errorMessage,
    }).catch(() => null);

    return {
      stored: false,
      duplicate: false,
      smsMessageId: null,
      syncLogId: null,
      skippedReason: errorMessage,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { payload, signatureStatus } = await parseTwilioInboundRequest(request);
    const storage =
      signatureStatus === "valid"
        ? await storeInboundMessage(payload)
        : {
            stored: false,
            duplicate: false,
            smsMessageId: null,
            syncLogId: null,
            skippedReason: `Twilio signature status: ${signatureStatus}.`,
          };

    console.info("[Twilio] Inbound SMS webhook handled", {
      messageSid: maskSid(payload.messageSid),
      accountSid: maskSid(payload.accountSid),
      signatureStatus,
      stored: storage.stored,
      duplicate: storage.duplicate,
      skippedReason: storage.skippedReason,
    });
  } catch (error) {
    console.error("[Twilio] Inbound SMS webhook failed", {
      message: describeSafeError(error),
    });
  }

  return createTwiMLResponse();
}
