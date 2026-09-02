import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CallRecordInput,
  CommunicationProviderEventInput,
  Database,
  GoHighLevelResourceSnapshotInsert,
  GoHighLevelResourceType,
  IntegrationConnectionRecord,
} from "../crm/types";
import {
  GOHIGHLEVEL_API_BASE_URL,
  GOHIGHLEVEL_API_VERSION,
  createGoHighLevelFingerprint,
  getGoHighLevelAccessToken,
} from "./oauth";

type CrmClient = SupabaseClient<Database>;
type FetchLike = typeof fetch;
type ProviderRecord = Record<string, unknown>;

const MAX_SYNC_RECORDS = 100;
const MAX_CONVERSATIONS_WITH_MESSAGES = 25;
export const GOHIGHLEVEL_REVIEW_STATUSES = ["approved", "pending"] as const;

export function buildGoHighLevelCalendarEventQuery({
  locationId,
  calendarId,
  now = Date.now(),
}: {
  locationId: string;
  calendarId: string;
  now?: number;
}) {
  return {
    locationId,
    calendarId,
    startTime: now - 90 * 24 * 60 * 60 * 1000,
    endTime: now + 180 * 24 * 60 * 60 * 1000,
  };
}

export function buildGoHighLevelReviewQuery(
  locationId: string,
  status: (typeof GOHIGHLEVEL_REVIEW_STATUSES)[number],
) {
  return {
    altId: locationId,
    altType: "location",
    status,
    limit: MAX_SYNC_RECORDS,
  };
}

type ApiResult =
  | { ok: true; status: number; payload: unknown }
  | { ok: false; status: number | null; error: string };

export type GoHighLevelSyncResourceResult = {
  resourceType: GoHighLevelResourceType | "location";
  fetched: number;
  saved: number;
  failed: number;
  message: string;
};

export type GoHighLevelSyncResult = {
  ok: boolean;
  partial: boolean;
  connectionId: string;
  companyId: string;
  locationId: string;
  tokenRefreshed: boolean;
  resources: GoHighLevelSyncResourceResult[];
  totalFetched: number;
  totalSaved: number;
  totalFailed: number;
  checkedAt: string;
};

function asRecord(value: unknown): ProviderRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ProviderRecord)
    : null;
}

function getString(record: ProviderRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function getNumber(record: ProviderRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function getTimestamp(record: ProviderRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
      const date = new Date(milliseconds);
      if (Number.isFinite(date.getTime())) {
        return date.toISOString();
      }
    }
    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) {
        return date.toISOString();
      }
    }
  }
  return null;
}

function normalizePhone(value: string | null) {
  if (!value) {
    return null;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizeEmail(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function truncate(value: string | null, length = 500) {
  return value ? value.replace(/\s+/g, " ").trim().slice(0, length) : null;
}

function extractList(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) {
    return payload.map(asRecord).filter((item): item is ProviderRecord => Boolean(item));
  }

  const record = asRecord(payload);
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const direct = record[key];
    if (Array.isArray(direct)) {
      return direct.map(asRecord).filter((item): item is ProviderRecord => Boolean(item));
    }

    const nested = asRecord(direct);
    const nestedMessages = nested?.messages;
    if (Array.isArray(nestedMessages)) {
      return nestedMessages
        .map(asRecord)
        .filter((item): item is ProviderRecord => Boolean(item));
    }
  }

  return [];
}

export async function requestGoHighLevelApi({
  accessToken,
  path,
  query = {},
  fetchImpl = fetch,
}: {
  accessToken: string;
  path: string;
  query?: Record<string, string | number | null | undefined>;
  fetchImpl?: FetchLike;
}): Promise<ApiResult> {
  const url = new URL(path, GOHIGHLEVEL_API_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        Version: GOHIGHLEVEL_API_VERSION,
      },
      cache: "no-store",
    }).catch(() => null);

    if (!response) {
      if (attempt === 1) continue;
      return { ok: false, status: null, error: "HighLevel API request failed." };
    }

    const payload: unknown = await response.json().catch(() => null);
    if (response.ok) {
      return { ok: true, status: response.status, payload };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt === 1) continue;

    return {
      ok: false,
      status: response.status,
      error: `HighLevel API returned HTTP ${response.status}.`,
    };
  }

  return { ok: false, status: null, error: "HighLevel API request failed." };
}

function getExternalId(record: ProviderRecord) {
  return getString(record, "id", "_id", "messageId", "conversationId", "reviewId");
}

function safePayloadSummary(record: ProviderRecord, resourceType: GoHighLevelResourceType) {
  const base = {
    id: getExternalId(record),
    name: truncate(getString(record, "name", "fullName", "title"), 200),
    status: truncate(getString(record, "status", "callStatus"), 80),
    contactId: getString(record, "contactId"),
    conversationId: getString(record, "conversationId"),
    locationId: getString(record, "locationId"),
    createdAt: getTimestamp(record, "dateAdded", "createdAt", "created_at"),
    updatedAt: getTimestamp(record, "dateUpdated", "updatedAt", "updated_at"),
  };

  if (resourceType === "contact") {
    return {
      ...base,
      email: normalizeEmail(getString(record, "email")),
      phone: truncate(getString(record, "phone"), 40),
      source: truncate(getString(record, "source"), 120),
    };
  }

  if (resourceType === "message" || resourceType === "call") {
    return {
      ...base,
      messageType: truncate(getString(record, "messageType", "type"), 40),
      direction: truncate(getString(record, "direction"), 20),
      from: truncate(getString(record, "from", "fromNumber"), 80),
      to: truncate(getString(record, "to", "toNumber"), 80),
      durationSeconds: getNumber(record, "callDuration", "duration", "durationSeconds"),
      attachmentCount: Array.isArray(record.attachments) ? record.attachments.length : 0,
    };
  }

  return base;
}

function getMessageBody(record: ProviderRecord) {
  return truncate(getString(record, "body", "message", "html", "text"), 500);
}

function getDirection(record: ProviderRecord): "inbound" | "outbound" | null {
  const raw = getString(record, "direction")?.toLowerCase();
  if (raw === "inbound" || raw === "incoming") {
    return "inbound";
  }
  if (raw === "outbound" || raw === "outgoing") {
    return "outbound";
  }
  return null;
}

function assertGoHighLevelProviderIdentityScope(
  existing: {
    company_id: string | null;
    integration_connection_id: string | null;
  },
  connection: IntegrationConnectionRecord,
  resourceLabel: "communication" | "call",
) {
  if (
    existing.company_id !== connection.company_id ||
    existing.integration_connection_id !== connection.id
  ) {
    throw new Error(
      `HighLevel ${resourceLabel} provider identity belongs to another company or connection.`,
    );
  }
}

type LocalMatch = { customerId: string | null; leadId: string | null };

async function loadLocalMatches(serviceClient: CrmClient, companyId: string) {
  const [{ data: customers }, { data: leads }] = await Promise.all([
    serviceClient.from("customers").select("id, email, phone").eq("company_id", companyId),
    serviceClient.from("leads").select("id, email, phone").eq("company_id", companyId),
  ]);

  return {
    customers: customers ?? [],
    leads: leads ?? [],
  };
}

function matchLocalContact(
  record: ProviderRecord,
  local: Awaited<ReturnType<typeof loadLocalMatches>>,
): LocalMatch {
  const email = normalizeEmail(getString(record, "email"));
  const phone = normalizePhone(getString(record, "phone"));
  const customer = local.customers.find(
    (candidate) =>
      (email && normalizeEmail(candidate.email) === email) ||
      (phone && normalizePhone(candidate.phone) === phone),
  );
  const lead = local.leads.find(
    (candidate) =>
      (email && normalizeEmail(candidate.email) === email) ||
      (phone && normalizePhone(candidate.phone) === phone),
  );

  return {
    customerId: customer?.id ?? null,
    leadId: lead?.id ?? null,
  };
}

export async function resolveGoHighLevelLocalContactMatch({
  serviceClient,
  companyId,
  record,
}: {
  serviceClient: CrmClient;
  companyId: string;
  record: ProviderRecord;
}) {
  const local = await loadLocalMatches(serviceClient, companyId);
  return matchLocalContact(record, local);
}

function buildSnapshot({
  record,
  resourceType,
  connection,
  match = { customerId: null, leadId: null },
}: {
  record: ProviderRecord;
  resourceType: GoHighLevelResourceType;
  connection: IntegrationConnectionRecord;
  match?: LocalMatch;
}): GoHighLevelResourceSnapshotInsert | null {
  const externalId = getExternalId(record);
  if (!externalId) {
    return null;
  }

  return {
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    resource_type: resourceType,
    external_id: externalId,
    external_parent_id: getString(record, "conversationId", "pipelineId", "calendarId"),
    external_contact_id: getString(record, "contactId"),
    customer_id: match.customerId,
    lead_id: match.leadId,
    direction: getDirection(record),
    status: truncate(getString(record, "status", "callStatus"), 80),
    body_preview: getMessageBody(record),
    occurred_at: getTimestamp(
      record,
      "dateAdded",
      "createdAt",
      "timestamp",
      "startTime",
      "lastMessageDate",
    ),
    provider_updated_at: getTimestamp(record, "dateUpdated", "updatedAt"),
    payload_summary: safePayloadSummary(record, resourceType),
  };
}

async function upsertSnapshots(
  serviceClient: CrmClient,
  snapshots: GoHighLevelResourceSnapshotInsert[],
) {
  if (!snapshots.length) {
    return { saved: 0, failed: 0 };
  }

  const { error } = await serviceClient.from("gohighlevel_resource_snapshots").upsert(
    snapshots,
    { onConflict: "integration_connection_id,resource_type,external_id" },
  );

  return error
    ? { saved: 0, failed: snapshots.length }
    : { saved: snapshots.length, failed: 0 };
}

async function upsertContactMapping({
  serviceClient,
  connection,
  record,
  match,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  record: ProviderRecord;
  match: LocalMatch;
}) {
  const externalId = getExternalId(record);
  const localTable = match.customerId ? "customers" : match.leadId ? "leads" : null;
  const localRecordId = match.customerId ?? match.leadId;
  if (!externalId || !localTable || !localRecordId) {
    return;
  }

  const { data: existing, error: existingError } = await serviceClient
    .from("gohighlevel_sync_mappings")
    .select("id")
    .eq("company_id", connection.company_id)
    .eq("integration_connection_id", connection.id)
    .eq("provider", "gohighlevel")
    .eq("external_object_type", "contact")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existingError) {
    throw new Error("HighLevel contact mapping lookup failed.");
  }
  const payload = {
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    provider: "gohighlevel" as const,
    local_table: localTable,
    local_record_id: localRecordId,
    external_object_type: "contact" as const,
    external_id: externalId,
    external_location_id: connection.external_account_id,
    sync_status: "synced" as const,
    sync_direction: "provider_to_weathertech" as const,
    conflict_status: "none" as const,
    last_synced_at: new Date().toISOString(),
    pending_sync: false,
    last_error: null,
    record_fingerprint: createGoHighLevelFingerprint(safePayloadSummary(record, "contact")),
    metadata: { matchedWithoutCreatingCustomer: true },
  };

  if (existing) {
    const { error } = await serviceClient
      .from("gohighlevel_sync_mappings")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error("HighLevel contact mapping update failed.");
  } else {
    const { error } = await serviceClient
      .from("gohighlevel_sync_mappings")
      .insert(payload);
    if (error) throw new Error("HighLevel contact mapping insert failed.");
  }
}

function getMessageChannel(record: ProviderRecord): "sms" | "voice" | null {
  const type = getString(record, "messageType", "type")?.toLowerCase() ?? "";
  if (type.includes("sms")) {
    return "sms";
  }
  if (type.includes("call") || type.includes("voicemail")) {
    return "voice";
  }
  return null;
}

function normalizeCallStatus(record: ProviderRecord): CallRecordInput["call_status"] {
  const raw = getString(record, "callStatus", "status")?.toLowerCase() ?? "";
  if (raw.includes("voicemail")) return "voicemail";
  if (raw.includes("miss") || raw.includes("no-answer")) return "missed";
  if (raw.includes("busy")) return "busy";
  if (raw.includes("fail")) return "failed";
  if (raw.includes("answer")) return "answered";
  if (raw.includes("progress")) return "in_progress";
  if (raw.includes("ring")) return "ringing";
  if (raw.includes("complete")) return "completed";
  return "incoming";
}

export async function persistGoHighLevelCommunication({
  serviceClient,
  connection,
  record,
  match = { customerId: null, leadId: null },
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  record: ProviderRecord;
  match?: LocalMatch;
}) {
  const providerEventSid = getExternalId(record);
  const channel = getMessageChannel(record);
  if (!providerEventSid || !channel) {
    return { saved: false, ignored: true };
  }

  const direction = getDirection(record);
  if (!direction) {
    return { saved: false, ignored: true };
  }
  const eventType: CommunicationProviderEventInput["event_type"] =
    channel === "sms"
      ? direction === "inbound"
        ? "sms_inbound"
        : "sms_status"
      : direction === "inbound"
        ? "voice_inbound"
        : "voice_status";
  const occurredAt =
    getTimestamp(record, "dateAdded", "createdAt", "timestamp", "startTime") ??
    new Date().toISOString();
  const fromPhone = getString(record, "from", "fromNumber");
  const toPhone = getString(record, "to", "toNumber");
  const summary = safePayloadSummary(record, channel === "voice" ? "call" : "message");
  const eventPayload: CommunicationProviderEventInput = {
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    customer_id: match.customerId,
    lead_id: match.leadId,
    provider: "gohighlevel",
    provider_account_sid: connection.external_account_id,
    provider_event_sid: providerEventSid,
    provider_parent_sid: getString(record, "conversationId"),
    event_type: eventType,
    channel,
    direction,
    status: getString(record, "status", "callStatus") ?? "received",
    from_phone: fromPhone,
    to_phone: toPhone,
    business_phone: direction === "inbound" ? toPhone : fromPhone,
    customer_phone: direction === "inbound" ? fromPhone : toPhone,
    routing_status: match.customerId || match.leadId ? "matched" : "needs_review",
    request_fingerprint: createGoHighLevelFingerprint(summary),
    payload_summary: summary,
    response_summary: { persistedBy: "gohighlevel_phase_2" },
    occurred_at: occurredAt,
  };
  const loadExistingEvent = () => serviceClient
    .from("communication_provider_events")
    .select("id, company_id, integration_connection_id")
    .eq("provider", "gohighlevel")
    .eq("event_type", eventType)
    .eq("provider_event_sid", providerEventSid)
    .maybeSingle();
  const updateExistingEvent = async (existingEvent: {
    id: string;
    company_id: string | null;
    integration_connection_id: string | null;
  }) => {
    assertGoHighLevelProviderIdentityScope(
      existingEvent,
      connection,
      "communication",
    );
    const { data: updatedEvent, error } = await serviceClient
      .from("communication_provider_events")
      .update(eventPayload)
      .eq("id", existingEvent.id)
      .eq("company_id", connection.company_id)
      .eq("integration_connection_id", connection.id)
      .eq("provider", "gohighlevel")
      .eq("event_type", eventType)
      .eq("provider_event_sid", providerEventSid)
      .select("id")
      .maybeSingle();
    if (error || !updatedEvent) {
      throw new Error("HighLevel communication metadata update failed.");
    }
  };
  const { data: existingEvent, error: existingEventError } = await loadExistingEvent();
  if (existingEventError) {
    throw new Error("HighLevel communication idempotency lookup failed.");
  }

  if (existingEvent) {
    await updateExistingEvent(existingEvent);
  } else {
    const { error } = await serviceClient
      .from("communication_provider_events")
      .insert(eventPayload);
    if (error?.code === "23505") {
      const { data: collidingEvent, error: collisionLookupError } =
        await loadExistingEvent();
      if (collisionLookupError || !collidingEvent) {
        throw new Error("HighLevel communication metadata insert failed.");
      }
      await updateExistingEvent(collidingEvent);
    } else if (error) {
      throw new Error("HighLevel communication metadata insert failed.");
    }
  }

  if (channel === "voice") {
    const duration = getNumber(record, "callDuration", "duration", "durationSeconds");
    const callPayload: CallRecordInput = {
      company_id: connection.company_id,
      integration_connection_id: connection.id,
      customer_id: match.customerId,
      lead_id: match.leadId,
      provider: "gohighlevel",
      provider_account_sid: connection.external_account_id,
      provider_call_sid: providerEventSid,
      provider_parent_call_sid: getString(record, "conversationId"),
      direction,
      call_status: normalizeCallStatus(record),
      from_phone: fromPhone,
      to_phone: toPhone,
      business_phone: direction === "inbound" ? toPhone : fromPhone,
      customer_phone: direction === "inbound" ? fromPhone : toPhone,
      routing_status: match.customerId || match.leadId ? "matched" : "needs_review",
      started_at: occurredAt,
      ended_at: duration ? new Date(new Date(occurredAt).getTime() + duration * 1000).toISOString() : null,
      duration_seconds: duration,
      recording_sid: getString(record, "recordingId", "recordingSid"),
      recording_status: getString(record, "recordingUrl") ? "completed" : "not_requested",
      transcript_status: getString(record, "transcription") ? "completed" : "not_requested",
      follow_up_required: normalizeCallStatus(record) === "missed",
      metadata: summary,
    };
    const loadExistingCall = () => serviceClient
      .from("call_records")
      .select("id, company_id, integration_connection_id")
      .eq("provider", "gohighlevel")
      .eq("provider_call_sid", providerEventSid)
      .maybeSingle();
    const updateExistingCall = async (existingCall: {
      id: string;
      company_id: string | null;
      integration_connection_id: string | null;
    }) => {
      assertGoHighLevelProviderIdentityScope(existingCall, connection, "call");
      const { data: updatedCall, error } = await serviceClient
        .from("call_records")
        .update(callPayload)
        .eq("id", existingCall.id)
        .eq("company_id", connection.company_id)
        .eq("integration_connection_id", connection.id)
        .eq("provider", "gohighlevel")
        .eq("provider_call_sid", providerEventSid)
        .select("id")
        .maybeSingle();
      if (error || !updatedCall) {
        throw new Error("HighLevel call metadata update failed.");
      }
    };
    const { data: existingCall, error: existingCallError } = await loadExistingCall();
    if (existingCallError) {
      throw new Error("HighLevel call idempotency lookup failed.");
    }

    if (existingCall) {
      await updateExistingCall(existingCall);
    } else {
      const { error } = await serviceClient.from("call_records").insert(callPayload);
      if (error?.code === "23505") {
        const { data: collidingCall, error: collisionLookupError } =
          await loadExistingCall();
        if (collisionLookupError || !collidingCall) {
          throw new Error("HighLevel call metadata insert failed.");
        }
        await updateExistingCall(collidingCall);
      } else if (error) {
        throw new Error("HighLevel call metadata insert failed.");
      }
    }
  }

  return { saved: true, ignored: false };
}

async function saveResource({
  serviceClient,
  connection,
  resourceType,
  records,
  contactMatches,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  resourceType: GoHighLevelResourceType;
  records: ProviderRecord[];
  contactMatches: Map<string, LocalMatch>;
}) {
  const snapshots = records
    .map((record) => {
      const contactId = getString(record, "contactId") ?? getExternalId(record);
      return buildSnapshot({
        record,
        resourceType,
        connection,
        match: contactId ? contactMatches.get(contactId) : undefined,
      });
    })
    .filter((snapshot): snapshot is GoHighLevelResourceSnapshotInsert => Boolean(snapshot));
  const result = await upsertSnapshots(serviceClient, snapshots);

  if (resourceType === "message" || resourceType === "call") {
    for (const record of records) {
      const contactId = getString(record, "contactId");
      await persistGoHighLevelCommunication({
        serviceClient,
        connection,
        record,
        match: contactId ? contactMatches.get(contactId) : undefined,
      });
    }
  }

  return result;
}

export async function synchronizeGoHighLevelConnection({
  serviceClient,
  connection,
  fetchImpl = fetch,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  fetchImpl?: FetchLike;
}): Promise<GoHighLevelSyncResult> {
  if (
    connection.provider !== "gohighlevel" ||
    connection.status !== "connected" ||
    !connection.external_account_id
  ) {
    throw new Error("A connected company-scoped GoHighLevel location is required.");
  }

  let token = await getGoHighLevelAccessToken({
    serviceClient,
    integrationConnectionId: connection.id,
    fetchImpl,
  });
  if (!token.ok) {
    throw new Error(token.error);
  }

  let accessToken = token.accessToken;
  let tokenRefreshed = token.refreshed;
  let locationResult = await requestGoHighLevelApi({
    accessToken,
    path: `/locations/${encodeURIComponent(connection.external_account_id)}`,
    fetchImpl,
  });

  if (!locationResult.ok && locationResult.status === 401) {
    token = await getGoHighLevelAccessToken({
      serviceClient,
      integrationConnectionId: connection.id,
      fetchImpl,
      forceRefresh: true,
    });
    if (!token.ok) {
      throw new Error(token.error);
    }
    accessToken = token.accessToken;
    tokenRefreshed = true;
    locationResult = await requestGoHighLevelApi({
      accessToken,
      path: `/locations/${encodeURIComponent(connection.external_account_id)}`,
      fetchImpl,
    });
  }

  if (!locationResult.ok) {
    throw new Error(locationResult.error);
  }

  const locationId = connection.external_account_id;
  const local = await loadLocalMatches(serviceClient, connection.company_id);
  const contactMatches = new Map<string, LocalMatch>();
  const results: GoHighLevelSyncResourceResult[] = [
    {
      resourceType: "location",
      fetched: 1,
      saved: 1,
      failed: 0,
      message: "HighLevel location authentication succeeded.",
    },
  ];

  const contactsResult = await requestGoHighLevelApi({
    accessToken,
    path: "/contacts/",
    query: { locationId, limit: MAX_SYNC_RECORDS },
    fetchImpl,
  });
  const contacts = contactsResult.ok
    ? extractList(contactsResult.payload, ["contacts", "items"])
    : [];
  for (const contact of contacts) {
    const externalId = getExternalId(contact);
    if (!externalId) continue;
    const match = matchLocalContact(contact, local);
    contactMatches.set(externalId, match);
    await upsertContactMapping({ serviceClient, connection, record: contact, match });
  }
  const contactsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "contact",
    records: contacts,
    contactMatches,
  });
  results.push({
    resourceType: "contact",
    fetched: contacts.length,
    saved: contactsSaved.saved,
    failed: contactsResult.ok ? contactsSaved.failed : 1,
    message: contactsResult.ok ? "Contacts synchronized." : contactsResult.error,
  });

  const resourceRequests: Array<{
    resourceType: GoHighLevelResourceType;
    path: string;
    query: Record<string, string | number>;
    keys: string[];
  }> = [
    {
      resourceType: "conversation",
      path: "/conversations/search",
      query: { locationId, limit: MAX_SYNC_RECORDS },
      keys: ["conversations", "items"],
    },
    {
      resourceType: "calendar",
      path: "/calendars/",
      query: { locationId },
      keys: ["calendars"],
    },
    {
      resourceType: "pipeline",
      path: "/opportunities/pipelines",
      query: { locationId },
      keys: ["pipelines"],
    },
    {
      resourceType: "opportunity",
      path: "/opportunities/search",
      query: { location_id: locationId, limit: MAX_SYNC_RECORDS },
      keys: ["opportunities", "items"],
    },
  ];

  const fetchedByType = new Map<GoHighLevelResourceType, ProviderRecord[]>();
  for (const request of resourceRequests) {
    const response = await requestGoHighLevelApi({
      accessToken,
      path: request.path,
      query: request.query,
      fetchImpl,
    });
    const records = response.ok ? extractList(response.payload, request.keys) : [];
    fetchedByType.set(request.resourceType, records);
    const saved = await saveResource({
      serviceClient,
      connection,
      resourceType: request.resourceType,
      records,
      contactMatches,
    });
    results.push({
      resourceType: request.resourceType,
      fetched: records.length,
      saved: saved.saved,
      failed: response.ok ? saved.failed : 1,
      message: response.ok
        ? `${request.resourceType.replace(/_/g, " ")} records synchronized.`
        : response.error,
    });
  }

  const calendarEventsById = new Map<string, ProviderRecord>();
  let calendarEventFetchFailures = 0;
  for (const calendar of fetchedByType.get("calendar") ?? []) {
    const calendarId = getExternalId(calendar);
    if (!calendarId) continue;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/calendars/events",
      query: buildGoHighLevelCalendarEventQuery({ locationId, calendarId }),
      fetchImpl,
    });
    if (!response.ok) {
      calendarEventFetchFailures += 1;
      continue;
    }
    for (const event of extractList(response.payload, ["events", "appointments"])) {
      const eventId = getExternalId(event);
      if (eventId) calendarEventsById.set(eventId, event);
    }
  }
  const calendarEvents = [...calendarEventsById.values()];
  const calendarEventsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "calendar_event",
    records: calendarEvents,
    contactMatches,
  });
  results.push({
    resourceType: "calendar_event",
    fetched: calendarEvents.length,
    saved: calendarEventsSaved.saved,
    failed: calendarEventFetchFailures + calendarEventsSaved.failed,
    message: calendarEventFetchFailures
      ? "Some calendar events could not be synchronized."
      : "Calendar events synchronized.",
  });

  const reviewsById = new Map<string, ProviderRecord>();
  let reviewFetchFailures = 0;
  for (const status of GOHIGHLEVEL_REVIEW_STATUSES) {
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/products/reviews",
      query: buildGoHighLevelReviewQuery(locationId, status),
      fetchImpl,
    });
    if (!response.ok) {
      reviewFetchFailures += 1;
      continue;
    }
    for (const review of extractList(response.payload, ["reviews", "items"])) {
      const reviewId = getExternalId(review);
      if (reviewId) reviewsById.set(reviewId, review);
    }
  }
  const reviews = [...reviewsById.values()];
  const reviewsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "review",
    records: reviews,
    contactMatches,
  });
  results.push({
    resourceType: "review",
    fetched: reviews.length,
    saved: reviewsSaved.saved,
    failed: reviewFetchFailures + reviewsSaved.failed,
    message: reviewFetchFailures
      ? "Some product reviews could not be synchronized."
      : "Product reviews synchronized.",
  });

  const conversations = fetchedByType.get("conversation") ?? [];
  const messages: ProviderRecord[] = [];
  let messageFetchFailures = 0;
  for (const conversation of conversations.slice(0, MAX_CONVERSATIONS_WITH_MESSAGES)) {
    const conversationId = getExternalId(conversation);
    if (!conversationId) continue;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: `/conversations/${encodeURIComponent(conversationId)}/messages`,
      query: { limit: MAX_SYNC_RECORDS },
      fetchImpl,
    });
    if (!response.ok) {
      messageFetchFailures += 1;
      continue;
    }
    messages.push(...extractList(response.payload, ["messages", "items"]));
  }
  const messageSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "message",
    records: messages,
    contactMatches,
  });
  results.push({
    resourceType: "message",
    fetched: messages.length,
    saved: messageSaved.saved,
    failed: messageFetchFailures + messageSaved.failed,
    message: messageFetchFailures
      ? "Some conversation messages could not be synchronized."
      : "Conversation messages synchronized.",
  });

  const totalFetched = results.reduce((sum, result) => sum + result.fetched, 0);
  const totalSaved = results.reduce((sum, result) => sum + result.saved, 0);
  const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
  const now = new Date().toISOString();
  await serviceClient
    .from("integration_connections")
    .update({
      last_sync_at: now,
      last_successful_sync_at: totalFailed ? connection.last_successful_sync_at : now,
      last_failure_at: totalFailed ? now : connection.last_failure_at,
      last_error: totalFailed ? "One or more HighLevel resources failed to synchronize." : null,
    })
    .eq("id", connection.id);

  return {
    ok: totalFailed === 0,
    partial: totalFailed > 0 && totalSaved > 0,
    connectionId: connection.id,
    companyId: connection.company_id,
    locationId,
    tokenRefreshed,
    resources: results,
    totalFetched,
    totalSaved,
    totalFailed,
    checkedAt: now,
  };
}
