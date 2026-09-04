import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CallRecordInput,
  Database,
  GoHighLevelResourceSnapshotInsert,
  GoHighLevelResourceType,
  IntegrationConnectionRecord,
} from "../crm/types";
import {
  GOHIGHLEVEL_API_BASE_URL,
  createGoHighLevelFingerprint,
  getGoHighLevelAccessToken,
} from "./oauth";

type CrmClient = SupabaseClient<Database>;
type FetchLike = typeof fetch;
type SleepLike = (delayMs: number) => Promise<void>;
type SyncHeartbeat = () => Promise<void>;
type ProviderRecord = Record<string, unknown>;

const GOHIGHLEVEL_SYNC_API_VERSION = "v3";
const MAX_API_ATTEMPTS = 3;
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const MAX_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 30_000;
const DEFAULT_SYNC_DEADLINE_MS = 50_000;
const MAX_PROVIDER_ATTEMPTS = 120;
const MAX_SYNC_PAGE_LIMIT = 100;
const MAX_SYNC_PAGES = 10;
const MAX_SYNC_RECORDS = 500;
const MAX_COMMUNICATION_CONTACT_HYDRATIONS_PER_CHANNEL = 25;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function buildGoHighLevelReviewQuery({
  locationId,
  offset = 0,
  pageLimit,
}: {
  locationId: string;
  offset?: number;
  pageLimit?: number;
}) {
  return {
    altId: locationId,
    altType: "location",
    limit: boundedPageLimit(pageLimit),
    offset: Math.max(0, Math.floor(offset)),
    sortField: "createdAt",
    sortOrder: "desc",
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
  pages: number;
  duplicatesSuppressed: number;
  paginationTruncated: boolean;
  message: string;
  contactMatchOutcomes?: GoHighLevelContactMatchOutcomeCounts;
  contactHydration?: GoHighLevelCommunicationContactHydrationResult;
};

export type GoHighLevelCommunicationContactHydrationResult = {
  attempted: number;
  matched: number;
  unresolved: number;
  failed: number;
  truncated: boolean;
};

export type GoHighLevelContactMatchOutcomeCounts = {
  matchedCustomer: number;
  matchedLead: number;
  unmatched: number;
  ambiguous: number;
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
  totalDuplicatesSuppressed: number;
  pagination: {
    pagesUsed: number;
    maxPages: number;
    recordsRead: number;
    maxRecords: number;
    ceilingReached: boolean;
  };
  providerRequests: {
    attemptsUsed: number;
    maxAttempts: number;
    deadlineReached: boolean;
  };
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

function getMessageMetadata(record: ProviderRecord) {
  return asRecord(record.meta) ?? {};
}

function getCallStatusText(record: ProviderRecord) {
  return (
    getString(getMessageMetadata(record), "callStatus", "call_status") ??
    getString(record, "callStatus", "call_status", "status")
  );
}

function getCallDurationSeconds(record: ProviderRecord) {
  const duration =
    getNumber(
      getMessageMetadata(record),
      "callDuration",
      "call_duration",
      "duration",
      "durationSeconds",
    ) ?? getNumber(record, "callDuration", "duration", "durationSeconds");
  return duration !== null && duration >= 0 ? Math.floor(duration) : null;
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
  if (digits.length === 10) return `1${digits}`;
  return digits.length === 11 && digits.startsWith("1") ? digits : null;
}

function normalizeEmail(value: string | null) {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

function truncate(value: string | null, length = 500) {
  return value ? value.replace(/\s+/g, " ").trim().slice(0, length) : null;
}

function extractExpectedList(payload: unknown, keys: string[]) {
  const record = asRecord(payload);
  if (!record) {
    return { ok: false as const, records: [] as ProviderRecord[] };
  }

  for (const key of keys) {
    const direct = record[key];
    if (Array.isArray(direct)) {
      const records = direct.map(asRecord);
      return records.every(Boolean)
        ? { ok: true as const, records: records as ProviderRecord[] }
        : { ok: false as const, records: [] as ProviderRecord[] };
    }

    const nested = asRecord(direct);
    const nestedMessages = nested?.messages;
    if (Array.isArray(nestedMessages)) {
      const records = nestedMessages.map(asRecord);
      return records.every(Boolean)
        ? { ok: true as const, records: records as ProviderRecord[] }
        : { ok: false as const, records: [] as ProviderRecord[] };
    }
  }

  return { ok: false as const, records: [] as ProviderRecord[] };
}

function validateProviderRecordLocations(
  records: ProviderRecord[],
  expectedLocationId: string,
) {
  for (const record of records) {
    const returnedLocationId = getString(record, "locationId", "location_id");
    if (returnedLocationId && returnedLocationId !== expectedLocationId) {
      return false;
    }
  }
  return true;
}

function getLocationResponseId(payload: unknown) {
  const envelope = asRecord(payload);
  if (!envelope) return null;
  const location = asRecord(envelope.location);
  return getString(location ?? envelope, "id", "locationId", "location_id");
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function getRetryAfterDelayMs(value: string | null, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now) : null;
}

export type GoHighLevelRequestBudget = {
  attemptsUsed: number;
  maxAttempts: number;
  deadlineAt: number;
  nextAllowedAt: number;
  ceilingReached: boolean;
  heartbeat?: SyncHeartbeat;
};

export function createGoHighLevelRequestBudget({
  now = Date.now(),
  deadlineMs = DEFAULT_SYNC_DEADLINE_MS,
  maxAttempts = MAX_PROVIDER_ATTEMPTS,
  heartbeat,
}: {
  now?: number;
  deadlineMs?: number;
  maxAttempts?: number;
  heartbeat?: SyncHeartbeat;
} = {}): GoHighLevelRequestBudget {
  const safeDeadlineMs = Number.isFinite(deadlineMs)
    ? Math.max(1, Math.min(DEFAULT_SYNC_DEADLINE_MS, Math.floor(deadlineMs)))
    : DEFAULT_SYNC_DEADLINE_MS;
  const safeMaxAttempts = Number.isFinite(maxAttempts)
    ? Math.max(1, Math.min(MAX_PROVIDER_ATTEMPTS, Math.floor(maxAttempts)))
    : MAX_PROVIDER_ATTEMPTS;
  return {
    attemptsUsed: 0,
    maxAttempts: safeMaxAttempts,
    deadlineAt: now + safeDeadlineMs,
    nextAllowedAt: now,
    ceilingReached: false,
    heartbeat,
  };
}

function getRateLimitIntervalMs(headers: Headers) {
  const value = Number(headers.get("x-ratelimit-interval-milliseconds"));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

function updateProviderRateWindow(
  budget: GoHighLevelRequestBudget | undefined,
  headers: Headers,
  now = Date.now(),
) {
  if (!budget) return;
  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const intervalMs = getRateLimitIntervalMs(headers);
  if (Number.isFinite(remaining) && remaining <= 0 && intervalMs) {
    budget.nextAllowedAt = Math.max(budget.nextAllowedAt, now + intervalMs);
  }
}

async function waitWithinRequestBudget({
  budget,
  delayMs,
  sleepImpl,
}: {
  budget?: GoHighLevelRequestBudget;
  delayMs: number;
  sleepImpl: SleepLike;
}) {
  const safeDelayMs = Math.max(0, Math.floor(delayMs));
  if (!safeDelayMs) return true;
  if (budget && Date.now() + safeDelayMs >= budget.deadlineAt) {
    budget.ceilingReached = true;
    return false;
  }
  await sleepImpl(safeDelayMs);
  if (budget) budget.nextAllowedAt = Date.now();
  return true;
}

export async function requestGoHighLevelApi({
  accessToken,
  path,
  query = {},
  method = "GET",
  body,
  version = GOHIGHLEVEL_SYNC_API_VERSION,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  maxAttempts = MAX_API_ATTEMPTS,
  maxRetryDelayMs = MAX_RETRY_DELAY_MS,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  requestBudget,
}: {
  accessToken: string;
  path: string;
  query?: Record<string, string | number | null | undefined>;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  version?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  maxRetryDelayMs?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  requestBudget?: GoHighLevelRequestBudget;
}): Promise<ApiResult> {
  const url = new URL(path, GOHIGHLEVEL_API_BASE_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const attemptLimit = Number.isFinite(maxAttempts)
    ? Math.max(1, Math.min(MAX_API_ATTEMPTS, Math.floor(maxAttempts)))
    : MAX_API_ATTEMPTS;
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(1, Math.min(MAX_REQUEST_TIMEOUT_MS, Math.floor(timeoutMs)))
    : DEFAULT_REQUEST_TIMEOUT_MS;
  const boundedMaxRetryDelayMs = Number.isFinite(maxRetryDelayMs)
    ? Math.max(0, Math.min(MAX_RETRY_DELAY_MS, Math.floor(maxRetryDelayMs)))
    : MAX_RETRY_DELAY_MS;

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    await requestBudget?.heartbeat?.();
    if (
      requestBudget &&
      (requestBudget.attemptsUsed >= requestBudget.maxAttempts ||
        Date.now() >= requestBudget.deadlineAt)
    ) {
      requestBudget.ceilingReached = true;
      return {
        ok: false,
        status: null,
        error: "HighLevel provider request safety budget was exhausted.",
      };
    }
    if (
      requestBudget &&
      requestBudget.nextAllowedAt > Date.now() &&
      !(await waitWithinRequestBudget({
        budget: requestBudget,
        delayMs: requestBudget.nextAllowedAt - Date.now(),
        sleepImpl,
      }))
    ) {
      return {
        ok: false,
        status: null,
        error: "HighLevel rate-limit wait exceeded the sync deadline.",
      };
    }
    if (requestBudget) requestBudget.attemptsUsed += 1;

    const controller = new AbortController();
    const remainingDeadlineMs = requestBudget
      ? Math.max(1, requestBudget.deadlineAt - Date.now())
      : boundedTimeoutMs;
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(boundedTimeoutMs, remainingDeadlineMs),
    );
    let response: Response | null = null;
    let payload: unknown = null;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          Version: version,
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" && body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
        cache: "no-store",
      });
      payload = await response.json().catch(() => null);
    } catch {
      response = null;
    } finally {
      clearTimeout(timeout);
    }

    if (!response) {
      if (attempt < attemptLimit) {
        const delayMs = Math.min(
          boundedMaxRetryDelayMs,
          DEFAULT_RETRY_DELAY_MS * 2 ** (attempt - 1),
        );
        if (
          !(await waitWithinRequestBudget({
            budget: requestBudget,
            delayMs,
            sleepImpl,
          }))
        ) {
          return {
            ok: false,
            status: null,
            error: "HighLevel retry wait exceeded the sync deadline.",
          };
        }
        continue;
      }
      return { ok: false, status: null, error: "HighLevel API request failed." };
    }

    updateProviderRateWindow(requestBudget, response.headers);
    if (response.ok) {
      return { ok: true, status: response.status, payload };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < attemptLimit) {
      const retryAfterMs = getRetryAfterDelayMs(
        response.headers?.get("retry-after") ?? null,
      );
      if (retryAfterMs !== null && retryAfterMs > boundedMaxRetryDelayMs) {
        return {
          ok: false,
          status: response.status,
          error: "HighLevel rate-limit wait exceeded the safe retry window.",
        };
      }
      const retryDelayMs =
        retryAfterMs ??
        Math.min(
          boundedMaxRetryDelayMs,
          DEFAULT_RETRY_DELAY_MS * 2 ** (attempt - 1),
        );
      const rateWindowDelayMs = requestBudget
        ? Math.max(0, requestBudget.nextAllowedAt - Date.now())
        : 0;
      const delayMs = Math.max(retryDelayMs, rateWindowDelayMs);
      if (
        !(await waitWithinRequestBudget({
          budget: requestBudget,
          delayMs,
          sleepImpl,
        }))
      ) {
        return {
          ok: false,
          status: response.status,
          error: "HighLevel retry wait exceeded the sync deadline.",
        };
      }
      continue;
    }

    return {
      ok: false,
      status: response.status,
      error: `HighLevel API returned HTTP ${response.status}.`,
    };
  }

  return { ok: false, status: null, error: "HighLevel API request failed." };
}

function getExternalId(record: ProviderRecord) {
  return getString(
    record,
    "id",
    "_id",
    "messageId",
    "emailMessageId",
    "reviewId",
    "altId",
  );
}

function getCommunicationExternalId(record: ProviderRecord) {
  return getString(
    record,
    "messageId",
    "emailMessageId",
    "id",
    "_id",
    "altId",
  );
}

function getResourceExternalId(
  record: ProviderRecord,
  resourceType: GoHighLevelResourceType,
) {
  return resourceType === "message" || resourceType === "call"
    ? getCommunicationExternalId(record)
    : getExternalId(record);
}

export type GoHighLevelPaginationBudget = {
  pagesUsed: number;
  recordsRead: number;
  ceilingReached: boolean;
};

export type GoHighLevelPaginatedReadResult = {
  ok: boolean;
  records: ProviderRecord[];
  fetched: number;
  pages: number;
  duplicatesSuppressed: number;
  paginationTruncated: boolean;
  failedPages: number;
  error: string | null;
};

function createPaginationBudget(): GoHighLevelPaginationBudget {
  return { pagesUsed: 0, recordsRead: 0, ceilingReached: false };
}

function claimPaginationPage(budget: GoHighLevelPaginationBudget) {
  if (
    budget.pagesUsed >= MAX_SYNC_PAGES ||
    budget.recordsRead >= MAX_SYNC_RECORDS
  ) {
    budget.ceilingReached = true;
    return false;
  }
  budget.pagesUsed += 1;
  return true;
}

function takeBoundedPageRecords(
  records: ProviderRecord[],
  budget: GoHighLevelPaginationBudget,
) {
  const remaining = Math.max(0, MAX_SYNC_RECORDS - budget.recordsRead);
  const bounded = records.slice(0, remaining);
  budget.recordsRead += bounded.length;
  if (bounded.length < records.length) {
    budget.ceilingReached = true;
  }
  return bounded;
}

function appendUniqueProviderRecords(
  records: ProviderRecord[],
  target: ProviderRecord[],
  seenExternalIds: Set<string>,
  getIdentity: (record: ProviderRecord) => string | null = getExternalId,
) {
  let duplicatesSuppressed = 0;
  for (const record of records) {
    const externalId = getIdentity(record);
    if (externalId && seenExternalIds.has(externalId)) {
      duplicatesSuppressed += 1;
      continue;
    }
    if (externalId) seenExternalIds.add(externalId);
    target.push(record);
  }
  return duplicatesSuppressed;
}

function deduplicateProviderRecords(records: ProviderRecord[]) {
  const uniqueRecords: ProviderRecord[] = [];
  const duplicatesSuppressed = appendUniqueProviderRecords(
    records,
    uniqueRecords,
    new Set<string>(),
  );
  return { records: uniqueRecords, duplicatesSuppressed };
}

function boundedPageLimit(pageLimit: number | undefined) {
  if (typeof pageLimit !== "number" || !Number.isFinite(pageLimit)) {
    return MAX_SYNC_PAGE_LIMIT;
  }
  return Math.max(1, Math.min(MAX_SYNC_PAGE_LIMIT, Math.floor(pageLimit)));
}

function nextPageNumber(
  payload: unknown,
  currentPage: number,
  pageLimit: number,
  pageRecordCount: number,
) {
  const envelope = asRecord(payload);
  const meta = envelope ? asRecord(envelope.meta) : null;
  const total = meta ? getNumber(meta, "total", "totalCount") : null;
  const nextPage = meta?.nextPage ?? meta?.next_page;
  const totalNextPage =
    total !== null && currentPage * pageLimit < total ? currentPage + 1 : null;

  if (!meta) {
    return pageRecordCount < pageLimit
      ? { nextPage: null, error: null }
      : {
          nextPage: null,
          error: "HighLevel opportunity pagination metadata was missing.",
        };
  }

  if (typeof nextPage === "number" && Number.isInteger(nextPage)) {
    return nextPage > currentPage
      ? { nextPage, error: null }
      : {
          nextPage: null,
          error: "HighLevel opportunity pagination did not advance.",
        };
  }
  if (typeof nextPage === "string" && nextPage.trim()) {
    const numeric = Number(nextPage);
    if (Number.isInteger(numeric)) {
      return numeric > currentPage
        ? { nextPage: numeric, error: null }
        : {
            nextPage: null,
            error: "HighLevel opportunity pagination did not advance.",
          };
    }
    try {
      const url = new URL(nextPage, GOHIGHLEVEL_API_BASE_URL);
      const fromUrl = Number(url.searchParams.get("page"));
      return Number.isInteger(fromUrl) && fromUrl > currentPage
        ? { nextPage: fromUrl, error: null }
        : {
            nextPage: null,
            error: "HighLevel opportunity pagination cursor was invalid.",
          };
    } catch {
      return {
        nextPage: null,
        error: "HighLevel opportunity pagination cursor was invalid.",
      };
    }
  }
  if (nextPage === true) {
    return { nextPage: currentPage + 1, error: null };
  }
  if (
    nextPage !== null &&
    nextPage !== undefined &&
    nextPage !== false &&
    nextPage !== ""
  ) {
    return {
      nextPage: null,
      error: "HighLevel opportunity pagination cursor was invalid.",
    };
  }
  if (nextPage === false && totalNextPage) {
    return {
      nextPage: null,
      error: "HighLevel opportunity pagination metadata conflicted.",
    };
  }
  if (totalNextPage) {
    return { nextPage: totalNextPage, error: null };
  }
  if (total === null && pageRecordCount >= pageLimit) {
    return {
      nextPage: null,
      error: "HighLevel opportunity pagination metadata was incomplete.",
    };
  }
  return { nextPage: null, error: null };
}

export async function fetchGoHighLevelContactPages({
  accessToken,
  locationId,
  pageLimit,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  budget = createPaginationBudget(),
  requestBudget,
}: {
  accessToken: string;
  locationId: string;
  pageLimit?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  budget?: GoHighLevelPaginationBudget;
  requestBudget?: GoHighLevelRequestBudget;
}): Promise<GoHighLevelPaginatedReadResult> {
  const limit = boundedPageLimit(pageLimit);
  const records: ProviderRecord[] = [];
  const seenExternalIds = new Set<string>();
  let page = 1;
  let fetched = 0;
  let pages = 0;
  let duplicatesSuppressed = 0;
  let paginationTruncated = false;

  while (true) {
    if (!claimPaginationPage(budget)) {
      paginationTruncated = true;
      break;
    }
    pages += 1;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/contacts/search",
      method: "POST",
      body: {
        locationId,
        page,
        pageLimit: limit,
        sort: [{ field: "dateUpdated", direction: "desc" }],
      },
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      sleepImpl,
      requestBudget,
    });
    if (!response.ok) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: response.error,
      };
    }

    const extracted = extractExpectedList(response.payload, ["contacts"]);
    if (
      !extracted.ok ||
      !validateProviderRecordLocations(extracted.records, locationId)
    ) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel contact response schema or location scope was invalid.",
      };
    }
    const pageRecords = extracted.records;
    const boundedRecords = takeBoundedPageRecords(pageRecords, budget);
    const uniqueCountBeforePage = records.length;
    fetched += boundedRecords.length;
    duplicatesSuppressed += appendUniqueProviderRecords(
      boundedRecords,
      records,
      seenExternalIds,
    );
    if (boundedRecords.length < pageRecords.length) {
      paginationTruncated = true;
      break;
    }
    if (
      page > 1 &&
      pageRecords.length >= limit &&
      records.length === uniqueCountBeforePage
    ) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel contact pagination did not advance.",
      };
    }
    const envelope = asRecord(response.payload);
    const total = envelope ? getNumber(envelope, "total", "totalCount") : null;
    if (total !== null && total < 0) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel contact response total was invalid.",
      };
    }
    if (total !== null ? fetched >= total : pageRecords.length < limit) break;
    if (pageRecords.length === 0) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel contact pagination ended before its reported total.",
      };
    }
    page += 1;
  }

  return {
    ok: true,
    records,
    fetched,
    pages,
    duplicatesSuppressed,
    paginationTruncated,
    failedPages: 0,
    error: null,
  };
}

export async function fetchGoHighLevelOpportunityPages({
  accessToken,
  locationId,
  pageLimit,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  budget = createPaginationBudget(),
  requestBudget,
}: {
  accessToken: string;
  locationId: string;
  pageLimit?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  budget?: GoHighLevelPaginationBudget;
  requestBudget?: GoHighLevelRequestBudget;
}): Promise<GoHighLevelPaginatedReadResult> {
  const limit = boundedPageLimit(pageLimit);
  const records: ProviderRecord[] = [];
  const seenExternalIds = new Set<string>();
  const seenPages = new Set<number>();
  let page = 1;
  let fetched = 0;
  let pages = 0;
  let duplicatesSuppressed = 0;
  let paginationTruncated = false;

  while (true) {
    if (seenPages.has(page)) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel opportunity pagination did not advance.",
      };
    }
    if (!claimPaginationPage(budget)) {
      paginationTruncated = true;
      break;
    }
    seenPages.add(page);
    pages += 1;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/opportunities/search",
      query: { locationId, limit, page, order: "added_desc" },
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      sleepImpl,
      requestBudget,
    });
    if (!response.ok) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: response.error,
      };
    }

    const extracted = extractExpectedList(response.payload, ["opportunities"]);
    if (
      !extracted.ok ||
      !validateProviderRecordLocations(extracted.records, locationId)
    ) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel opportunity response schema or location scope was invalid.",
      };
    }
    const pageRecords = extracted.records;
    const boundedRecords = takeBoundedPageRecords(pageRecords, budget);
    const uniqueCountBeforePage = records.length;
    fetched += boundedRecords.length;
    duplicatesSuppressed += appendUniqueProviderRecords(
      boundedRecords,
      records,
      seenExternalIds,
    );
    if (boundedRecords.length < pageRecords.length) {
      paginationTruncated = true;
      break;
    }

    const pagination = nextPageNumber(
      response.payload,
      page,
      limit,
      pageRecords.length,
    );
    if (pagination.error) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: pagination.error,
      };
    }
    if (!pagination.nextPage) break;
    if (pageRecords.length && records.length === uniqueCountBeforePage) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel opportunity pagination did not advance.",
      };
    }
    page = pagination.nextPage;
  }

  return {
    ok: true,
    records,
    fetched,
    pages,
    duplicatesSuppressed,
    paginationTruncated,
    failedPages: 0,
    error: null,
  };
}

export async function fetchGoHighLevelConversationPages({
  accessToken,
  locationId,
  pageLimit,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  budget = createPaginationBudget(),
  requestBudget,
}: {
  accessToken: string;
  locationId: string;
  pageLimit?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  budget?: GoHighLevelPaginationBudget;
  requestBudget?: GoHighLevelRequestBudget;
}): Promise<GoHighLevelPaginatedReadResult> {
  const limit = boundedPageLimit(pageLimit);
  const records: ProviderRecord[] = [];
  const seenExternalIds = new Set<string>();
  const seenCursors = new Set<string>();
  let startAfterDate: string | number | null = null;
  let cursorId: string | null = null;
  let fetched = 0;
  let pages = 0;
  let duplicatesSuppressed = 0;
  let paginationTruncated = false;

  while (true) {
    if (!claimPaginationPage(budget)) {
      paginationTruncated = true;
      break;
    }
    pages += 1;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/conversations/search",
      query: {
        locationId,
        limit,
        sort: "desc",
        sortBy: "last_message_date",
        startAfterDate,
        id: cursorId,
      },
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      sleepImpl,
      requestBudget,
    });
    if (!response.ok) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: response.error,
      };
    }

    const extracted = extractExpectedList(response.payload, ["conversations"]);
    if (
      !extracted.ok ||
      !validateProviderRecordLocations(extracted.records, locationId)
    ) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel conversation response schema or location scope was invalid.",
      };
    }
    const pageRecords = extracted.records;
    const boundedRecords = takeBoundedPageRecords(pageRecords, budget);
    const uniqueCountBeforePage = records.length;
    fetched += boundedRecords.length;
    duplicatesSuppressed += appendUniqueProviderRecords(
      boundedRecords,
      records,
      seenExternalIds,
    );
    if (boundedRecords.length < pageRecords.length) {
      paginationTruncated = true;
      break;
    }

    const envelope = asRecord(response.payload);
    const total = envelope ? getNumber(envelope, "total", "totalCount") : null;
    if (total === null || total < 0) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel conversation response total was missing or invalid.",
      };
    }
    if (fetched >= total) {
      break;
    }
    if (pageRecords.length === 0) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel conversation pagination ended before its reported total.",
      };
    }
    if (records.length === uniqueCountBeforePage) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel conversation pagination did not advance.",
      };
    }

    const lastRecord = pageRecords[pageRecords.length - 1];
    const nextCursorId = getExternalId(lastRecord);
    const rawCursorDate = lastRecord.lastMessageDate;
    const nextStartAfterDate =
      typeof rawCursorDate === "number" && Number.isFinite(rawCursorDate)
        ? rawCursorDate
        : typeof rawCursorDate === "string" && rawCursorDate.trim()
          ? rawCursorDate.trim()
          : null;
    if (!nextCursorId || nextStartAfterDate === null) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel conversation pagination cursor was missing.",
      };
    }
    const cursorKey = `${String(nextStartAfterDate)}:${nextCursorId}`;
    if (seenCursors.has(cursorKey)) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel conversation pagination did not advance.",
      };
    }
    seenCursors.add(cursorKey);
    startAfterDate = nextStartAfterDate;
    cursorId = nextCursorId;
  }

  return {
    ok: true,
    records,
    fetched,
    pages,
    duplicatesSuppressed,
    paginationTruncated,
    failedPages: 0,
    error: null,
  };
}

export async function fetchGoHighLevelReviewPages({
  accessToken,
  locationId,
  pageLimit,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  budget = createPaginationBudget(),
  requestBudget,
}: {
  accessToken: string;
  locationId: string;
  pageLimit?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  budget?: GoHighLevelPaginationBudget;
  requestBudget?: GoHighLevelRequestBudget;
}): Promise<GoHighLevelPaginatedReadResult> {
  const limit = boundedPageLimit(pageLimit);
  const records: ProviderRecord[] = [];
  const seenExternalIds = new Set<string>();
  let offset = 0;
  let fetched = 0;
  let pages = 0;
  let duplicatesSuppressed = 0;
  let paginationTruncated = false;

  while (true) {
    if (!claimPaginationPage(budget)) {
      paginationTruncated = true;
      break;
    }
    pages += 1;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/products/reviews",
      query: buildGoHighLevelReviewQuery({ locationId, offset, pageLimit: limit }),
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      sleepImpl,
      requestBudget,
    });
    if (!response.ok) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: response.error,
      };
    }

    const extracted = extractExpectedList(response.payload, ["data"]);
    if (
      !extracted.ok ||
      !validateProviderRecordLocations(extracted.records, locationId)
    ) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel product review response schema or location scope was invalid.",
      };
    }
    const pageRecords = extracted.records;
    const boundedRecords = takeBoundedPageRecords(pageRecords, budget);
    const uniqueCountBeforePage = records.length;
    fetched += boundedRecords.length;
    duplicatesSuppressed += appendUniqueProviderRecords(
      boundedRecords,
      records,
      seenExternalIds,
    );
    if (boundedRecords.length < pageRecords.length) {
      paginationTruncated = true;
      break;
    }

    const envelope = asRecord(response.payload);
    const total = envelope ? getNumber(envelope, "total", "totalCount") : null;
    if (total === null || total < 0) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel product review total was missing or invalid.",
      };
    }
    if (offset + pageRecords.length >= total) {
      break;
    }
    if (pageRecords.length === 0) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel product review pagination ended before its reported total.",
      };
    }
    if (records.length === uniqueCountBeforePage) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: "HighLevel review pagination did not advance.",
      };
    }
    offset += pageRecords.length;
  }

  return {
    ok: true,
    records,
    fetched,
    pages,
    duplicatesSuppressed,
    paginationTruncated,
    failedPages: 0,
    error: null,
  };
}

export async function fetchGoHighLevelConversationMessagePages({
  accessToken,
  locationId,
  channel = "SMS",
  pageLimit,
  fetchImpl = fetch,
  sleepImpl = defaultSleep,
  budget = createPaginationBudget(),
  requestBudget,
}: {
  accessToken: string;
  conversations?: ProviderRecord[];
  locationId: string;
  channel?: "SMS" | "Call" | "Email";
  pageLimit?: number;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  budget?: GoHighLevelPaginationBudget;
  requestBudget?: GoHighLevelRequestBudget;
}): Promise<GoHighLevelPaginatedReadResult> {
  // HighLevel's message export contract accepts limits from 10 through 1,000.
  const limit = Math.max(10, boundedPageLimit(pageLimit));
  const records: ProviderRecord[] = [];
  const seenExternalIds = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let fetched = 0;
  let pages = 0;
  let duplicatesSuppressed = 0;
  let paginationTruncated = false;
  while (true) {
    if (!claimPaginationPage(budget)) {
      paginationTruncated = true;
      break;
    }
    pages += 1;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/conversations/messages/export",
      query: {
        locationId,
        channel,
        limit,
        cursor,
        sortBy: "createdAt",
        sortOrder: "desc",
      },
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      sleepImpl,
      requestBudget,
    });
    if (!response.ok) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: response.error,
      };
    }

    const extracted = extractExpectedList(response.payload, ["messages"]);
    const envelope = asRecord(response.payload);
    const total = envelope ? getNumber(envelope, "total") : null;
    if (
      !extracted.ok ||
      total === null ||
      total < 0 ||
      !validateProviderRecordLocations(extracted.records, locationId)
    ) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: `HighLevel ${channel.toLowerCase()} export response schema or location scope was invalid.`,
      };
    }
    const pageRecords = extracted.records;
    const boundedRecords = takeBoundedPageRecords(pageRecords, budget);
    const uniqueCountBeforePage = records.length;
    fetched += boundedRecords.length;
    duplicatesSuppressed += appendUniqueProviderRecords(
      boundedRecords,
      records,
      seenExternalIds,
      getCommunicationExternalId,
    );
    if (boundedRecords.length < pageRecords.length) {
      paginationTruncated = true;
      break;
    }
    if (fetched >= total) break;
    if (pageRecords.length === 0 || records.length === uniqueCountBeforePage) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: `HighLevel ${channel.toLowerCase()} export pagination did not advance.`,
      };
    }
    const nextCursor = getString(envelope ?? {}, "nextCursor", "next_cursor");
    if (!nextCursor || nextCursor === cursor || seenCursors.has(nextCursor)) {
      return {
        ok: false,
        records,
        fetched,
        pages,
        duplicatesSuppressed,
        paginationTruncated,
        failedPages: 1,
        error: `HighLevel ${channel.toLowerCase()} export cursor was missing or repeated.`,
      };
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  return {
    ok: true,
    records,
    fetched,
    pages,
    duplicatesSuppressed,
    paginationTruncated,
    failedPages: 0,
    error: null,
  };
}

function safePayloadSummary(record: ProviderRecord, resourceType: GoHighLevelResourceType) {
  const base = {
    id: getResourceExternalId(record, resourceType),
    name: truncate(getString(record, "name", "fullName", "title"), 200),
    status: truncate(
      resourceType === "call"
        ? getCallStatusText(record)
        : getString(record, "status", "callStatus"),
      80,
    ),
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
      subject: truncate(getString(record, "subject"), 300),
      threadId: getString(record, "threadId", "thread_id"),
      conversationProviderId: getString(
        record,
        "conversationProviderId",
        "conversation_provider_id",
      ),
      durationSeconds: getCallDurationSeconds(record),
      attachmentCount: Array.isArray(record.attachments) ? record.attachments.length : 0,
    };
  }

  if (resourceType === "review") {
    return {
      ...base,
      headline: truncate(getString(record, "headline", "title"), 200),
      detail: truncate(getString(record, "detail", "comment", "review"), 500),
      rating: getNumber(record, "rating"),
      productId: getString(record, "productId", "product_id"),
      storeId: getString(record, "storeId", "store_id"),
    };
  }

  if (resourceType === "calendar_event") {
    return {
      ...base,
      calendarId: getString(record, "calendarId", "calendar_id"),
      startTime: getTimestamp(record, "startTime", "start_time"),
      endTime: getTimestamp(record, "endTime", "end_time"),
      appointmentStatus: truncate(
        getString(record, "appointmentStatus", "status"),
        80,
      ),
      address: truncate(getString(record, "address"), 300),
      assignedUserId: getString(record, "assignedUserId", "assigned_user_id"),
      notes: truncate(getString(record, "notes"), 500),
    };
  }

  if (resourceType === "opportunity") {
    return {
      ...base,
      pipelineId: getString(record, "pipelineId", "pipeline_id"),
      pipelineStageId: getString(
        record,
        "pipelineStageId",
        "pipeline_stage_id",
      ),
      monetaryValue: getNumber(record, "monetaryValue", "monetary_value", "value"),
    };
  }

  if (resourceType === "pipeline") {
    return {
      ...base,
      stages: Array.isArray(record.stages)
        ? record.stages.slice(0, 50).flatMap((value) => {
            const stage = asRecord(value);
            const id = stage ? getString(stage, "id", "_id") : null;
            const name = stage ? truncate(getString(stage, "name"), 200) : null;
            return id || name ? [{ id, name }] : [];
          })
        : [],
    };
  }

  return base;
}

function getMessageBody(record: ProviderRecord) {
  return truncate(
    getString(
      record,
      "body",
      "message",
      "html",
      "text",
      "detail",
      "comment",
      "headline",
    ),
    500,
  );
}

function getResourceOccurredAt(
  record: ProviderRecord,
  resourceType: GoHighLevelResourceType,
) {
  if (resourceType === "conversation") {
    return getTimestamp(record, "lastMessageDate", "last_message_date");
  }
  if (resourceType === "calendar_event") {
    return getTimestamp(record, "startTime", "start_time");
  }
  if (resourceType === "message" || resourceType === "call") {
    return getTimestamp(record, "dateAdded", "timestamp", "createdAt");
  }
  if (resourceType === "review") {
    return getTimestamp(record, "createdAt", "dateAdded");
  }
  return getTimestamp(record, "dateAdded", "createdAt", "timestamp");
}

function getResourceParentId(
  record: ProviderRecord,
  resourceType: GoHighLevelResourceType,
) {
  if (resourceType === "message" || resourceType === "call") {
    return getString(record, "conversationId", "conversation_id");
  }
  if (resourceType === "calendar_event") {
    return getString(record, "calendarId", "calendar_id");
  }
  if (resourceType === "opportunity") {
    return getString(record, "pipelineId", "pipeline_id");
  }
  if (resourceType === "review") {
    return getString(record, "productId", "product_id", "storeId", "store_id");
  }
  return null;
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

export type GoHighLevelLocalMatchStatus =
  | "matched_customer"
  | "matched_lead"
  | "unmatched"
  | "ambiguous";

type LocalContactCandidate = {
  id: string;
  email: string | null;
  phone: string | null;
};

type LocalContactCollections = {
  customers: LocalContactCandidate[];
  leads: LocalContactCandidate[];
  index?: LocalContactIndex;
};

type LocalContactIndex = {
  byEmail: Map<string, Map<string, { kind: "customer" | "lead"; id: string }>>;
  byPhone: Map<string, Map<string, { kind: "customer" | "lead"; id: string }>>;
};

function buildLocalContactIndex(
  local: Pick<LocalContactCollections, "customers" | "leads">,
): LocalContactIndex {
  const byEmail: LocalContactIndex["byEmail"] = new Map();
  const byPhone: LocalContactIndex["byPhone"] = new Map();
  const add = (
    kind: "customer" | "lead",
    candidate: LocalContactCandidate,
  ) => {
    const identity = { kind, id: candidate.id };
    const key = `${kind}:${candidate.id}`;
    const email = normalizeEmail(candidate.email);
    const phone = normalizePhone(candidate.phone);
    if (email) {
      const candidates = byEmail.get(email) ?? new Map();
      candidates.set(key, identity);
      byEmail.set(email, candidates);
    }
    if (phone) {
      const candidates = byPhone.get(phone) ?? new Map();
      candidates.set(key, identity);
      byPhone.set(phone, candidates);
    }
  };
  for (const customer of local.customers) add("customer", customer);
  for (const lead of local.leads) add("lead", lead);
  return { byEmail, byPhone };
}

type LocalMatch = {
  customerId: string | null;
  leadId: string | null;
  matchStatus?: GoHighLevelLocalMatchStatus;
  matchCandidateCount?: number;
};

type SafeLocalMatch = Required<LocalMatch>;

export function summarizeGoHighLevelContactMatchOutcomes(
  matches: Iterable<{ matchStatus: GoHighLevelLocalMatchStatus }>,
): GoHighLevelContactMatchOutcomeCounts {
  const outcomes: GoHighLevelContactMatchOutcomeCounts = {
    matchedCustomer: 0,
    matchedLead: 0,
    unmatched: 0,
    ambiguous: 0,
  };
  for (const match of matches) {
    if (match.matchStatus === "matched_customer") {
      outcomes.matchedCustomer += 1;
    } else if (match.matchStatus === "matched_lead") {
      outcomes.matchedLead += 1;
    } else {
      outcomes[match.matchStatus] += 1;
    }
  }
  return outcomes;
}

function normalizeLocalMatch(match: LocalMatch): SafeLocalMatch {
  const candidateCount = Number.isInteger(match.matchCandidateCount)
    ? Math.max(0, match.matchCandidateCount ?? 0)
    : Number(Boolean(match.customerId)) + Number(Boolean(match.leadId));
  if (
    match.matchStatus === "ambiguous" ||
    candidateCount > 1 ||
    (match.customerId && match.leadId)
  ) {
    return {
      customerId: null,
      leadId: null,
      matchStatus: "ambiguous",
      matchCandidateCount: Math.max(2, candidateCount),
    };
  }
  if (match.customerId) {
    return {
      customerId: match.customerId,
      leadId: null,
      matchStatus: "matched_customer",
      matchCandidateCount: 1,
    };
  }
  if (match.leadId) {
    return {
      customerId: null,
      leadId: match.leadId,
      matchStatus: "matched_lead",
      matchCandidateCount: 1,
    };
  }
  return {
    customerId: null,
    leadId: null,
    matchStatus: "unmatched",
    matchCandidateCount: candidateCount,
  };
}

async function loadLocalMatches(
  serviceClient: CrmClient,
  companyId: string,
  heartbeat?: SyncHeartbeat,
) {
  const pageSize = 500;
  const maxRecordsPerTable = 10_000;
  const loadTable = async (table: "customers" | "leads") => {
    const records: LocalContactCandidate[] = [];
    let lastId: string | null = null;
    while (records.length <= maxRecordsPerTable) {
      await heartbeat?.();
      let query = serviceClient
        .from(table)
        .select("id, email, phone")
        .eq("company_id", companyId)
        .order("id", { ascending: true });
      if (lastId) query = query.gt("id", lastId);
      const { data, error } = await query.limit(
        Math.min(pageSize, maxRecordsPerTable - records.length + 1),
      );
      if (error) {
        throw new Error("HighLevel local contact lookup failed.");
      }
      const page = data ?? [];
      if (!page.length) return records;
      const nextLastId = page.at(-1)?.id;
      if (!nextLastId || nextLastId === lastId) {
        throw new Error("HighLevel local contact lookup did not advance safely.");
      }
      records.push(...page);
      if (records.length > maxRecordsPerTable) {
        throw new Error(
          "HighLevel local contact lookup exceeded its safe per-company ceiling.",
        );
      }
      lastId = nextLastId;
    }
    return records;
  };

  const [customers, leads] = await Promise.all([
    loadTable("customers"),
    loadTable("leads"),
  ]);

  const local = {
    customers,
    leads,
  };
  return { ...local, index: buildLocalContactIndex(local) };
}

async function loadMappedContactMatches(
  serviceClient: CrmClient,
  connection: IntegrationConnectionRecord,
  local: LocalContactCollections,
  heartbeat?: SyncHeartbeat,
) {
  const pageSize = 500;
  const maxRecords = 10_000;
  const mappings: Array<{
    id: string;
    external_id: string | null;
    local_table: string;
    local_record_id: string;
  }> = [];
  let lastId: string | null = null;
  while (mappings.length <= maxRecords) {
    await heartbeat?.();
    let query = serviceClient
      .from("gohighlevel_sync_mappings")
      .select("id, external_id, local_table, local_record_id")
      .eq("company_id", connection.company_id)
      .eq("integration_connection_id", connection.id)
      .eq("provider", "gohighlevel")
      .eq("external_object_type", "contact")
      .eq("sync_status", "synced")
      .eq("conflict_status", "none")
      .order("id", { ascending: true });
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query.limit(
      Math.min(pageSize, maxRecords - mappings.length + 1),
    );
    if (error) {
      throw new Error("HighLevel existing contact mappings could not be loaded.");
    }
    const page = data ?? [];
    if (!page.length) break;
    const nextLastId = page.at(-1)?.id;
    if (!nextLastId || nextLastId === lastId) {
      throw new Error("HighLevel existing contact mappings did not advance safely.");
    }
    mappings.push(...page);
    if (mappings.length > maxRecords) {
      throw new Error(
        "HighLevel existing contact mappings exceeded their safe company ceiling.",
      );
    }
    lastId = nextLastId;
  }

  const matches = new Map<string, SafeLocalMatch>();
  const customerIds = new Set(local.customers.map((record) => record.id));
  const leadIds = new Set(local.leads.map((record) => record.id));
  for (const mapping of mappings) {
    await heartbeat?.();
    if (!mapping.external_id || !mapping.local_record_id) continue;
    const localTargetIsValid =
      (mapping.local_table === "customers" &&
        customerIds.has(mapping.local_record_id)) ||
      (mapping.local_table === "leads" && leadIds.has(mapping.local_record_id));
    if (!localTargetIsValid) {
      const { data: conflicted, error } = await serviceClient
        .from("gohighlevel_sync_mappings")
        .update({
          sync_status: "conflict",
          conflict_status: "pending_review",
          conflict_summary:
            "Stored HighLevel contact link is not a current same-company WTOS record.",
          pending_sync: true,
          last_error: null,
          metadata: {
            staleOrForeignLocalTarget: true,
            previousLocalLinkRetainedForReview: true,
          },
        })
        .eq("id", mapping.id)
        .eq("company_id", connection.company_id)
        .eq("integration_connection_id", connection.id)
        .eq("provider", "gohighlevel")
        .eq("external_object_type", "contact")
        .select("id")
        .maybeSingle();
      if (error || !conflicted) {
        throw new Error("HighLevel invalid contact mapping could not be quarantined.");
      }
      continue;
    }
    if (mapping.local_table === "customers") {
      matches.set(mapping.external_id, {
        customerId: mapping.local_record_id,
        leadId: null,
        matchStatus: "matched_customer",
        matchCandidateCount: 1,
      });
    } else if (mapping.local_table === "leads") {
      matches.set(mapping.external_id, {
        customerId: null,
        leadId: mapping.local_record_id,
        matchStatus: "matched_lead",
        matchCandidateCount: 1,
      });
    }
  }
  return matches;
}

export function matchGoHighLevelLocalContact(
  record: ProviderRecord,
  local: LocalContactCollections,
): SafeLocalMatch {
  const email = normalizeEmail(getString(record, "email"));
  const phone = normalizePhone(getString(record, "phone"));
  const index = local.index ?? buildLocalContactIndex(local);
  const matches = new Map<string, { kind: "customer" | "lead"; id: string }>();
  for (const candidate of email ? index.byEmail.get(email)?.entries() ?? [] : []) {
    matches.set(candidate[0], candidate[1]);
  }
  for (const candidate of phone ? index.byPhone.get(phone)?.entries() ?? [] : []) {
    matches.set(candidate[0], candidate[1]);
  }

  if (matches.size !== 1) {
    return {
      customerId: null,
      leadId: null,
      matchStatus: matches.size > 1 ? "ambiguous" : "unmatched",
      matchCandidateCount: matches.size,
    };
  }

  const [match] = matches.values();

  return {
    customerId: match.kind === "customer" ? match.id : null,
    leadId: match.kind === "lead" ? match.id : null,
    matchStatus: match.kind === "customer" ? "matched_customer" : "matched_lead",
    matchCandidateCount: 1,
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
  return matchGoHighLevelLocalContact(record, local);
}

export function buildGoHighLevelResourceSnapshot({
  record,
  resourceType,
  connection,
  match,
  canonicalExternalId,
}: {
  record: ProviderRecord;
  resourceType: GoHighLevelResourceType;
  connection: IntegrationConnectionRecord;
  match?: LocalMatch;
  canonicalExternalId?: string;
}): GoHighLevelResourceSnapshotInsert | null {
  const externalId =
    canonicalExternalId ?? getResourceExternalId(record, resourceType);
  if (!externalId) {
    return null;
  }
  const safeMatch = normalizeLocalMatch(
    match ?? { customerId: null, leadId: null },
  );
  const summary = {
    ...safePayloadSummary(record, resourceType),
    id: externalId,
  };

  return {
    company_id: connection.company_id,
    integration_connection_id: connection.id,
    resource_type: resourceType,
    external_id: externalId,
    external_parent_id: getResourceParentId(record, resourceType),
    external_contact_id: getString(record, "contactId"),
    customer_id: safeMatch.customerId,
    lead_id: safeMatch.leadId,
    direction: getDirection(record),
    status: truncate(
      resourceType === "call"
        ? getCallStatusText(record)
        : getString(record, "status", "callStatus"),
      80,
    ),
    body_preview: getMessageBody(record),
    occurred_at: getResourceOccurredAt(record, resourceType),
    provider_updated_at:
      getTimestamp(record, "dateUpdated", "updatedAt", "updated_at") ??
      (resourceType === "message" || resourceType === "call"
        ? getResourceOccurredAt(record, resourceType)
        : null),
    last_synced_at: new Date().toISOString(),
    payload_summary: {
      ...summary,
      matchStatus: safeMatch.matchStatus,
      matchCandidateCount: safeMatch.matchCandidateCount,
      associationAuthoritative: Boolean(match?.matchStatus),
    },
  };
}

type GoHighLevelSnapshotBatchReceipt = {
  saved: number;
  skipped: number;
  failed: number;
};

function parseSnapshotBatchReceipt(
  value: unknown,
  connection: IntegrationConnectionRecord,
  receivedCount: number,
) {
  const receipt = asRecord(value);
  const contractVersion = receipt
    ? getNumber(receipt, "contractVersion")
    : null;
  const savedCount = receipt ? getNumber(receipt, "savedCount") : null;
  const skippedCount = receipt ? getNumber(receipt, "skippedCount") : null;
  const actualReceivedCount = receipt
    ? getNumber(receipt, "receivedCount")
    : null;
  if (
    contractVersion !== 1 ||
    getString(receipt ?? {}, "companyId") !== connection.company_id ||
    getString(receipt ?? {}, "integrationConnectionId") !== connection.id ||
    actualReceivedCount !== receivedCount ||
    savedCount === null ||
    skippedCount === null ||
    !Number.isInteger(savedCount) ||
    !Number.isInteger(skippedCount) ||
    savedCount < 0 ||
    skippedCount < 0 ||
    savedCount + skippedCount !== receivedCount
  ) {
    return null;
  }
  return { savedCount, skippedCount };
}

export async function upsertGoHighLevelResourceSnapshots(
  serviceClient: CrmClient,
  connection: IntegrationConnectionRecord,
  snapshots: GoHighLevelResourceSnapshotInsert[],
  heartbeat?: SyncHeartbeat,
): Promise<GoHighLevelSnapshotBatchReceipt> {
  if (!snapshots.length) {
    return { saved: 0, skipped: 0, failed: 0 };
  }
  for (const snapshot of snapshots) {
    if (
      snapshot.company_id !== connection.company_id ||
      snapshot.integration_connection_id !== connection.id
    ) {
      return { saved: 0, skipped: 0, failed: snapshots.length };
    }
  }

  let saved = 0;
  let skipped = 0;
  // Fifty maximally sized summaries stay below the RPC's one-megabyte batch cap.
  const batchSize = 50;
  for (let index = 0; index < snapshots.length; index += batchSize) {
    await heartbeat?.();
    const batch = snapshots.slice(index, index + batchSize);
    const { data, error } = await serviceClient.rpc(
      "wtos_upsert_gohighlevel_resource_snapshots_v1",
      {
        p_batch: {
          contractVersion: 1,
          companyId: connection.company_id,
          integrationConnectionId: connection.id,
          records: batch.map((snapshot) => ({
            companyId: snapshot.company_id,
            integrationConnectionId: snapshot.integration_connection_id,
            resourceType: snapshot.resource_type,
            externalId: snapshot.external_id,
            externalParentId: snapshot.external_parent_id,
            externalContactId: snapshot.external_contact_id,
            customerId: snapshot.customer_id,
            leadId: snapshot.lead_id,
            direction: snapshot.direction,
            status: snapshot.status,
            bodyPreview: snapshot.body_preview,
            occurredAt: snapshot.occurred_at,
            providerUpdatedAt: snapshot.provider_updated_at,
            payloadSummary: snapshot.payload_summary,
          })),
        },
      },
    );
    const receipt = error
      ? null
      : parseSnapshotBatchReceipt(data, connection, batch.length);
    if (!receipt) {
      return {
        saved,
        skipped,
        failed: snapshots.length - index,
      };
    }
    saved += receipt.savedCount;
    skipped += receipt.skippedCount;
  }

  return { saved, skipped, failed: 0 };
}

export async function upsertContactMapping({
  serviceClient,
  connection,
  record,
  match,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  record: ProviderRecord;
  match: LocalMatch;
}): Promise<SafeLocalMatch> {
  const safeMatch = normalizeLocalMatch(match);
  const externalId = getExternalId(record);
  const localTable = safeMatch.customerId
    ? "customers"
    : safeMatch.leadId
      ? "leads"
      : null;
  const localRecordId = safeMatch.customerId ?? safeMatch.leadId;
  if (!externalId) {
    return safeMatch;
  }

  const loadExisting = () =>
    serviceClient
      .from("gohighlevel_sync_mappings")
      .select("id, external_id, local_table, local_record_id")
      .eq("company_id", connection.company_id)
      .eq("integration_connection_id", connection.id)
      .eq("provider", "gohighlevel")
      .eq("external_object_type", "contact")
      .eq("external_id", externalId)
      .maybeSingle();
  const loadLocalMapping = (table: "customers" | "leads", recordId: string) =>
    serviceClient
      .from("gohighlevel_sync_mappings")
      .select("id, external_id, local_table, local_record_id")
      .eq("company_id", connection.company_id)
      .eq("integration_connection_id", connection.id)
      .eq("provider", "gohighlevel")
      .eq("external_object_type", "contact")
      .eq("local_table", table)
      .eq("local_record_id", recordId)
      .maybeSingle();
  const conflictMatch: SafeLocalMatch = {
    customerId: null,
    leadId: null,
    matchStatus: "ambiguous",
    matchCandidateCount: Math.max(2, safeMatch.matchCandidateCount),
  };
  const markMappingConflict = async (
    mapping: {
      id: string;
      external_id: string | null;
      local_table: string;
      local_record_id: string;
    },
    conflictSummary: string,
    conflictMetadata: Record<string, unknown>,
  ) => {
    const query = serviceClient
      .from("gohighlevel_sync_mappings")
      .update({
        sync_status: "conflict",
        conflict_status: "pending_review",
        conflict_summary: conflictSummary,
        pending_sync: true,
        last_error: null,
        record_fingerprint: createGoHighLevelFingerprint(
          safePayloadSummary(record, "contact"),
        ),
        metadata: {
          matchedWithoutCreatingCustomer: false,
          matchStatus: conflictMatch.matchStatus,
          matchCandidateCount: conflictMatch.matchCandidateCount,
          previousLocalLinkRetainedForReview: true,
          ...conflictMetadata,
        },
      })
      .eq("id", mapping.id)
      .eq("company_id", connection.company_id)
      .eq("integration_connection_id", connection.id)
      .eq("provider", "gohighlevel")
      .eq("external_object_type", "contact");
    if (mapping.external_id) {
      query.eq("external_id", mapping.external_id);
    }
    const { data: conflictedMapping, error: conflictError } = await query
      .select("id")
      .maybeSingle();
    if (conflictError || !conflictedMapping) {
      throw new Error("HighLevel contact mapping conflict update failed.");
    }
  };

  const { data: existing, error: existingError } = await loadExisting();
  if (existingError) {
    throw new Error("HighLevel contact mapping lookup failed.");
  }

  if (!localTable || !localRecordId) {
    if (existing) {
      await markMappingConflict(
        existing,
        safeMatch.matchStatus === "ambiguous"
          ? "HighLevel contact now matches multiple same-company WTOS records."
          : "HighLevel contact no longer has an exact same-company WTOS match.",
        {
          matchStatus: safeMatch.matchStatus,
          matchCandidateCount: safeMatch.matchCandidateCount,
        },
      );
    }
    return safeMatch;
  }

  const { data: localMapping, error: localMappingError } = await loadLocalMapping(
    localTable,
    localRecordId,
  );
  if (localMappingError) {
    throw new Error("HighLevel local contact mapping lookup failed.");
  }
  const existingPointsElsewhere = Boolean(
    existing &&
      (existing.local_table !== localTable ||
        existing.local_record_id !== localRecordId),
  );
  const localMappingBelongsToAnotherContact = Boolean(
    localMapping &&
      localMapping.id !== existing?.id &&
      localMapping.external_id !== externalId,
  );
  if (existingPointsElsewhere || localMappingBelongsToAnotherContact) {
    if (existing) {
      await markMappingConflict(
        existing,
        "HighLevel contact match changed and cannot be relinked automatically.",
        {
          proposedLocalTable: localTable,
          proposedLocalRecordId: localRecordId,
        },
      );
    }
    if (localMapping && localMapping.id !== existing?.id) {
      await markMappingConflict(
        localMapping,
        "Multiple HighLevel contacts resolve to the same WTOS record.",
        { conflictingExternalId: externalId },
      );
    }
    return conflictMatch;
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
    metadata: {
      matchedWithoutCreatingCustomer: true,
      matchStatus: safeMatch.matchStatus,
      matchCandidateCount: safeMatch.matchCandidateCount,
    },
  };

  if (existing) {
    const { data: updatedMapping, error } = await serviceClient
      .from("gohighlevel_sync_mappings")
      .update(payload)
      .eq("id", existing.id)
      .eq("company_id", connection.company_id)
      .eq("integration_connection_id", connection.id)
      .eq("provider", "gohighlevel")
      .eq("external_object_type", "contact")
      .eq("external_id", externalId)
      .select("id")
      .maybeSingle();
    if (error || !updatedMapping) {
      throw new Error("HighLevel contact mapping update failed.");
    }
    return safeMatch;
  } else {
    const { error } = await serviceClient
      .from("gohighlevel_sync_mappings")
      .insert(payload);
    if (error?.code === "23505") {
      const [externalCollision, localCollision] = await Promise.all([
        loadExisting(),
        loadLocalMapping(localTable, localRecordId),
      ]);
      if (externalCollision.error || localCollision.error) {
        throw new Error("HighLevel contact mapping insert failed.");
      }
      const collidingMapping = externalCollision.data ?? localCollision.data;
      if (!collidingMapping) {
        throw new Error("HighLevel contact mapping insert failed.");
      }
      if (
        collidingMapping.external_id === externalId &&
        collidingMapping.local_table === localTable &&
        collidingMapping.local_record_id === localRecordId
      ) {
        return safeMatch;
      }
      await markMappingConflict(
        collidingMapping,
        "Concurrent HighLevel contact mapping requires manual review.",
        { conflictingExternalId: externalId },
      );
      return conflictMatch;
    } else if (error) {
      throw new Error("HighLevel contact mapping insert failed.");
    }
  }
  return safeMatch;
}

export async function hydrateGoHighLevelCommunicationContactMatches({
  serviceClient,
  connection,
  accessToken,
  records,
  contactMatches,
  local,
  attemptedContactIds,
  fetchImpl = fetch,
  requestBudget,
  heartbeat,
  maxLookups = MAX_COMMUNICATION_CONTACT_HYDRATIONS_PER_CHANNEL,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  accessToken: string;
  records: ProviderRecord[];
  contactMatches: Map<string, SafeLocalMatch>;
  local: LocalContactCollections;
  attemptedContactIds: Set<string>;
  fetchImpl?: FetchLike;
  requestBudget: GoHighLevelRequestBudget;
  heartbeat?: SyncHeartbeat;
  maxLookups?: number;
}): Promise<GoHighLevelCommunicationContactHydrationResult> {
  const result: GoHighLevelCommunicationContactHydrationResult = {
    attempted: 0,
    matched: 0,
    unresolved: 0,
    failed: 0,
    truncated: false,
  };
  const expectedLocationId = connection.external_account_id;
  if (!expectedLocationId) {
    return {
      ...result,
      failed: records.some((record) => getString(record, "contactId")) ? 1 : 0,
    };
  }

  const missingContactIds: string[] = [];
  const queuedContactIds = new Set<string>();
  for (const record of records) {
    const contactId = getString(record, "contactId");
    if (
      !contactId ||
      contactMatches.has(contactId) ||
      attemptedContactIds.has(contactId) ||
      queuedContactIds.has(contactId)
    ) {
      continue;
    }
    queuedContactIds.add(contactId);
    missingContactIds.push(contactId);
  }

  const lookupLimit = Number.isFinite(maxLookups)
    ? Math.max(
        0,
        Math.min(
          MAX_COMMUNICATION_CONTACT_HYDRATIONS_PER_CHANNEL,
          Math.floor(maxLookups),
        ),
      )
    : MAX_COMMUNICATION_CONTACT_HYDRATIONS_PER_CHANNEL;
  const selectedContactIds = missingContactIds.slice(0, lookupLimit);
  result.truncated = missingContactIds.length > selectedContactIds.length;

  for (let index = 0; index < selectedContactIds.length; index += 1) {
    const contactId = selectedContactIds[index];
    await heartbeat?.();

    const providerAttemptsBefore = requestBudget.attemptsUsed;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: `/contacts/${encodeURIComponent(contactId)}`,
      method: "GET",
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      requestBudget,
    });
    if (requestBudget.attemptsUsed > providerAttemptsBefore) {
      attemptedContactIds.add(contactId);
      result.attempted += 1;
    }
    if (!response.ok) {
      result.failed += 1;
      if (requestBudget.ceilingReached) {
        result.truncated ||=
          requestBudget.attemptsUsed === providerAttemptsBefore ||
          index + 1 < selectedContactIds.length;
        break;
      }
      continue;
    }

    const envelope = asRecord(response.payload);
    const contact = envelope ? asRecord(envelope.contact) : null;
    if (
      !contact ||
      contact.id !== contactId ||
      contact.locationId !== expectedLocationId
    ) {
      result.failed += 1;
      continue;
    }

    try {
      const match = matchGoHighLevelLocalContact(contact, local);
      const effectiveMatch = await upsertContactMapping({
        serviceClient,
        connection,
        record: contact,
        match,
      });
      if (
        effectiveMatch.matchStatus === "matched_customer" ||
        effectiveMatch.matchStatus === "matched_lead"
      ) {
        contactMatches.set(contactId, effectiveMatch);
        result.matched += 1;
      } else {
        // An unresolved match is review evidence, not authority to clear a
        // previously repaired or manually assigned communication association.
        result.unresolved += 1;
      }
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

type GoHighLevelCommunicationChannel = "sms" | "voice" | "email";
type GoHighLevelCommunicationAliasType =
  | "messageId"
  | "emailMessageId"
  | "id"
  | "altId";

function getProviderCommunicationChannel(
  record: ProviderRecord,
): GoHighLevelCommunicationChannel | null {
  const type = getString(record, "messageType", "type")?.toLowerCase() ?? "";
  if (type.includes("sms")) {
    return "sms";
  }
  if (type.includes("call") || type.includes("voicemail")) {
    return "voice";
  }
  if (type.includes("email")) {
    return "email";
  }
  return null;
}

function getMessageChannel(record: ProviderRecord): "sms" | "voice" | null {
  const channel = getProviderCommunicationChannel(record);
  return channel === "sms" || channel === "voice" ? channel : null;
}

function getGoHighLevelCommunicationAliases(record: ProviderRecord) {
  const candidates: Array<{
    type: GoHighLevelCommunicationAliasType;
    value: string | null;
  }> = [
    { type: "messageId", value: getString(record, "messageId") },
    { type: "emailMessageId", value: getString(record, "emailMessageId") },
    { type: "id", value: getString(record, "id", "_id") },
    { type: "altId", value: getString(record, "altId") },
  ];
  const seen = new Set<string>();
  return candidates.flatMap(({ type, value }) => {
    if (!value || value.length > 512 || seen.has(value)) return [];
    seen.add(value);
    return [{ type, value }];
  });
}

export type GoHighLevelCommunicationIdentityResolution = {
  disposition: "created" | "resolved" | "conflict" | "incomplete";
  channel: GoHighLevelCommunicationChannel;
  canonicalExternalId: string | null;
};

function buildGoHighLevelCommunicationSummary(
  record: ProviderRecord,
  canonicalExternalId: string,
  channel: "sms" | "voice",
  match: SafeLocalMatch,
  associationAuthoritative: boolean,
) {
  return {
    id: canonicalExternalId,
    contactId: getString(record, "contactId"),
    conversationId: getString(record, "conversationId", "conversation_id"),
    locationId: getString(record, "locationId", "location_id"),
    createdAt: getTimestamp(record, "dateAdded", "createdAt", "startTime"),
    messageType: truncate(getString(record, "messageType", "type"), 40),
    direction: getDirection(record),
    from: truncate(getString(record, "from", "fromNumber"), 80),
    to: truncate(getString(record, "to", "toNumber"), 80),
    bodyPreview: channel === "sms" ? getMessageBody(record) : null,
    durationSeconds: channel === "voice" ? getCallDurationSeconds(record) : null,
    matchStatus: match.matchStatus,
    matchCandidateCount: match.matchCandidateCount,
    associationAuthoritative,
  };
}

export async function resolveGoHighLevelCommunicationIdentity({
  serviceClient,
  connection,
  record,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  record: ProviderRecord;
}): Promise<GoHighLevelCommunicationIdentityResolution | null> {
  const channel = getProviderCommunicationChannel(record);
  if (!channel) return null;
  const aliases = getGoHighLevelCommunicationAliases(record);
  const tupleEvidence = {
    conversationId: getString(record, "conversationId", "conversation_id"),
    occurredAt: getTimestamp(record, "dateAdded", "createdAt", "startTime"),
    direction: getDirection(record),
    channel,
  };
  const tupleFingerprint =
    tupleEvidence.conversationId &&
    tupleEvidence.occurredAt &&
    tupleEvidence.direction
      ? createGoHighLevelFingerprint(tupleEvidence)
      : null;
  const { data, error } = await serviceClient.rpc(
    "wtos_resolve_gohighlevel_communication_identity_v1",
    {
      p_resolution: {
        contractVersion: 1,
        companyId: connection.company_id,
        integrationConnectionId: connection.id,
        channel,
        aliases,
        tupleFingerprint,
      },
    },
  );
  const receipt = error ? null : asRecord(data);
  const disposition = receipt?.disposition;
  const canonicalExternalId =
    typeof receipt?.canonicalExternalId === "string" &&
    receipt.canonicalExternalId.length > 0 &&
    receipt.canonicalExternalId.length <= 512
      ? receipt.canonicalExternalId
      : null;
  if (
    receipt?.contractVersion !== 1 ||
    receipt.companyId !== connection.company_id ||
    receipt.integrationConnectionId !== connection.id ||
    receipt.channel !== channel ||
    !["created", "resolved", "conflict", "incomplete"].includes(
      typeof disposition === "string" ? disposition : "",
    ) ||
    ((disposition === "created" || disposition === "resolved") &&
      !canonicalExternalId) ||
    ((disposition === "conflict" || disposition === "incomplete") &&
      canonicalExternalId)
  ) {
    throw new Error("HighLevel communication identity could not be resolved safely.");
  }
  return {
    disposition: disposition as GoHighLevelCommunicationIdentityResolution["disposition"],
    channel,
    canonicalExternalId,
  };
}

function normalizeCallStatus(
  record: ProviderRecord,
): CallRecordInput["call_status"] | null {
  const raw = getCallStatusText(record)?.toLowerCase() ?? "";
  if (raw.includes("voicemail")) return "voicemail";
  if (raw.includes("miss") || raw.includes("no-answer")) return "missed";
  if (raw.includes("busy")) return "busy";
  if (raw.includes("fail")) return "failed";
  if (raw.includes("answer")) return "answered";
  if (raw.includes("progress")) return "in_progress";
  if (raw.includes("ring")) return "ringing";
  if (raw.includes("complete")) return "completed";
  return null;
}

export async function persistGoHighLevelCommunication({
  serviceClient,
  connection,
  record,
  match,
  identity,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  record: ProviderRecord;
  match?: LocalMatch;
  identity?: GoHighLevelCommunicationIdentityResolution;
}) {
  const channel = getMessageChannel(record);
  if (!channel) {
    return { saved: false, ignored: true, canonicalExternalId: null };
  }

  const direction = getDirection(record);
  if (!direction) {
    return { saved: false, ignored: true, canonicalExternalId: null };
  }
  const occurredAt = getTimestamp(
    record,
    "dateAdded",
    "createdAt",
    "timestamp",
    "startTime",
  );
  if (!occurredAt) {
    return {
      saved: false,
      ignored: false,
      canonicalExternalId: null,
      error: "provider_timestamp_missing",
    };
  }
  const mutableProviderUpdatedAt = getTimestamp(
    record,
    "dateUpdated",
    "updatedAt",
    "updated_at",
  );
  const providerUpdatedAt = mutableProviderUpdatedAt ?? occurredAt;
  const providerVersionSource = mutableProviderUpdatedAt
    ? "updated_at"
    : "created_at_fallback";
  const callStatus = channel === "voice" ? normalizeCallStatus(record) : null;
  if (channel === "voice" && !callStatus) {
    return {
      saved: false,
      ignored: false,
      canonicalExternalId: null,
      error: "provider_call_status_unknown",
    };
  }
  const resolvedIdentity =
    identity ??
    (await resolveGoHighLevelCommunicationIdentity({
      serviceClient,
      connection,
      record,
    }));
  if (
    !resolvedIdentity ||
    resolvedIdentity.channel !== channel ||
    resolvedIdentity.disposition === "conflict" ||
    resolvedIdentity.disposition === "incomplete" ||
    !resolvedIdentity.canonicalExternalId
  ) {
    return {
      saved: false,
      ignored: false,
      canonicalExternalId: null,
      error: `provider_identity_${resolvedIdentity?.disposition ?? "invalid"}`,
    };
  }
  const providerEventSid = resolvedIdentity.canonicalExternalId;
  const safeMatch = normalizeLocalMatch(
    match ?? { customerId: null, leadId: null },
  );
  const associationAuthoritative = Boolean(match?.matchStatus);
  const fromPhone = getString(record, "from", "fromNumber");
  const toPhone = getString(record, "to", "toNumber");
  const metadata = getMessageMetadata(record);
  const summary = buildGoHighLevelCommunicationSummary(
    record,
    providerEventSid,
    channel,
    safeMatch,
    associationAuthoritative,
  );
  const duration = channel === "voice" ? getCallDurationSeconds(record) : null;
  const explicitEndedAt = getTimestamp(record, "endedAt", "endTime");
  const endedAt =
    explicitEndedAt ??
    (duration !== null
      ? new Date(new Date(occurredAt).getTime() + duration * 1000).toISOString()
      : null);
  const status =
    channel === "voice"
      ? callStatus!
      : (getString(record, "status") ?? "received").toLowerCase();
  const { data, error } = await serviceClient.rpc(
    "wtos_upsert_gohighlevel_communication_v1",
    {
      p_communication: {
        contractVersion: 1,
        companyId: connection.company_id,
        integrationConnectionId: connection.id,
        canonicalExternalId: providerEventSid,
        providerParentId: getString(record, "conversationId", "conversation_id"),
        channel,
        direction,
        status,
        fromPhone,
        toPhone,
        occurredAt,
        providerUpdatedAt,
        providerVersionSource,
        customerId: safeMatch.customerId,
        leadId: safeMatch.leadId,
        jobId: null,
        startedAt: occurredAt,
        answeredAt: getTimestamp(record, "answeredAt"),
        endedAt,
        durationSeconds: duration,
        recordingId:
          getString(record, "recordingId", "recordingSid") ??
          getString(metadata, "recordingId", "recordingSid"),
        recordingStatus:
          getString(record, "recordingUrl") || getString(metadata, "recordingUrl")
            ? "completed"
            : "not_requested",
        transcriptStatus:
          getString(record, "transcription") ||
          getString(metadata, "transcription")
            ? "completed"
            : "not_requested",
        payloadSummary: summary,
      },
    },
  );
  const receipt = error ? null : asRecord(data);
  const disposition = receipt?.disposition;
  const eventId = receipt?.communicationEventId;
  const callId = receipt?.callRecordId;
  const providerReceiptTimestamp =
    typeof receipt?.providerUpdatedAt === "string"
      ? Date.parse(receipt.providerUpdatedAt)
      : Number.NaN;
  if (
    receipt?.contractVersion !== 1 ||
    receipt.companyId !== connection.company_id ||
    receipt.integrationConnectionId !== connection.id ||
    receipt.canonicalExternalId !== providerEventSid ||
    !["saved", "same_version", "stale", "association_updated", "conflict"].includes(
      typeof disposition === "string" ? disposition : "",
    ) ||
    typeof eventId !== "string" ||
    !UUID_PATTERN.test(eventId) ||
    (channel === "voice" &&
      (typeof callId !== "string" || !UUID_PATTERN.test(callId))) ||
    (channel === "sms" && callId !== null) ||
    !Number.isFinite(providerReceiptTimestamp)
  ) {
    throw new Error("HighLevel communication metadata could not be saved safely.");
  }
  if (disposition === "conflict") {
    return {
      saved: false,
      ignored: false,
      canonicalExternalId: providerEventSid,
      snapshotSafe: false,
      error: "provider_version_conflict",
    };
  }

  return {
    saved: true,
    ignored: false,
    canonicalExternalId: providerEventSid,
    disposition,
    snapshotSafe:
      providerReceiptTimestamp === Date.parse(providerUpdatedAt),
  };
}

async function saveResource({
  serviceClient,
  connection,
  resourceType,
  records,
  contactMatches,
  heartbeat,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  resourceType: GoHighLevelResourceType;
  records: ProviderRecord[];
  contactMatches: Map<string, LocalMatch>;
  heartbeat?: SyncHeartbeat;
}) {
  const preparedRecords: Array<{
    record: ProviderRecord;
    canonicalExternalId?: string;
    identity?: GoHighLevelCommunicationIdentityResolution;
  }> = [];
  let identityFailures = 0;
  for (const record of records) {
    await heartbeat?.();
    if (resourceType === "message" || resourceType === "call") {
      const providerChannel = getProviderCommunicationChannel(record);
      if (providerChannel) {
        const identity = await resolveGoHighLevelCommunicationIdentity({
          serviceClient,
          connection,
          record,
        });
        if (
          !identity ||
          !identity.canonicalExternalId ||
          (identity.disposition !== "created" && identity.disposition !== "resolved")
        ) {
          identityFailures += 1;
          continue;
        }
        preparedRecords.push({
          record,
          canonicalExternalId: identity.canonicalExternalId,
          identity,
        });
        continue;
      }
    }
    preparedRecords.push({ record });
  }

  let communicationFailures = 0;
  const snapshotReadyRecords: typeof preparedRecords = [];
  for (const prepared of preparedRecords) {
    await heartbeat?.();
    const { record, identity } = prepared;
    if (
      (resourceType !== "message" && resourceType !== "call") ||
      !identity ||
      identity.channel === "email"
    ) {
      snapshotReadyRecords.push(prepared);
      continue;
    }
    const contactId = getString(record, "contactId");
    const persisted = await persistGoHighLevelCommunication({
      serviceClient,
      connection,
      record,
      match: contactId ? contactMatches.get(contactId) : undefined,
      identity,
    });
    if (!persisted.saved && !persisted.ignored) {
      communicationFailures += 1;
      continue;
    }
    if (!persisted.snapshotSafe) {
      continue;
    }
    snapshotReadyRecords.push(prepared);
  }

  const snapshots = snapshotReadyRecords
    .map(({ record, canonicalExternalId }) => {
      const contactId =
        getString(record, "contactId") ??
        (resourceType === "contact" ? getExternalId(record) : null);
      return buildGoHighLevelResourceSnapshot({
        record,
        resourceType,
        connection,
        match: contactId ? contactMatches.get(contactId) : undefined,
        canonicalExternalId,
      });
    })
    .filter((snapshot): snapshot is GoHighLevelResourceSnapshotInsert => Boolean(snapshot));
  const invalidIdentityFailures =
    identityFailures + (snapshotReadyRecords.length - snapshots.length);
  const result = await upsertGoHighLevelResourceSnapshots(
    serviceClient,
    connection,
    snapshots,
    heartbeat,
  );

  return {
    saved: result.saved + result.skipped,
    failed: result.failed + communicationFailures + invalidIdentityFailures,
  };
}

export async function synchronizeGoHighLevelConnection({
  serviceClient,
  connection,
  fetchImpl = fetch,
  heartbeat,
}: {
  serviceClient: CrmClient;
  connection: IntegrationConnectionRecord;
  fetchImpl?: FetchLike;
  heartbeat?: SyncHeartbeat;
}): Promise<GoHighLevelSyncResult> {
  if (
    connection.provider !== "gohighlevel" ||
    connection.status !== "connected" ||
    !connection.external_account_id
  ) {
    throw new Error("A connected company-scoped GoHighLevel location is required.");
  }

  await heartbeat?.();

  let token = await getGoHighLevelAccessToken({
    serviceClient,
    integrationConnectionId: connection.id,
    fetchImpl,
  });
  if (!token.ok) {
    throw new Error(token.error);
  }
  await heartbeat?.();

  let accessToken = token.accessToken;
  let tokenRefreshed = token.refreshed;
  const requestBudget = createGoHighLevelRequestBudget({ heartbeat });
  let locationResult = await requestGoHighLevelApi({
    accessToken,
    path: `/locations/${encodeURIComponent(connection.external_account_id)}`,
    version: GOHIGHLEVEL_SYNC_API_VERSION,
    fetchImpl,
    requestBudget,
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
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      requestBudget,
    });
  }

  if (!locationResult.ok) {
    throw new Error(locationResult.error);
  }

  const locationId = connection.external_account_id;
  if (getLocationResponseId(locationResult.payload) !== locationId) {
    throw new Error("HighLevel location response did not match the selected company mapping.");
  }
  const local = await loadLocalMatches(
    serviceClient,
    connection.company_id,
    heartbeat,
  );
  const contactMatches = await loadMappedContactMatches(
    serviceClient,
    connection,
    local,
    heartbeat,
  );
  const paginationBudgets = {
    contact: createPaginationBudget(),
    conversation: createPaginationBudget(),
    opportunity: createPaginationBudget(),
    review: createPaginationBudget(),
    message: createPaginationBudget(),
    email: createPaginationBudget(),
    call: createPaginationBudget(),
  };
  const results: GoHighLevelSyncResourceResult[] = [
    {
      resourceType: "location",
      fetched: 1,
      saved: 0,
      failed: 0,
      pages: 1,
      duplicatesSuppressed: 0,
      paginationTruncated: false,
      message: "HighLevel location authentication succeeded.",
    },
  ];

  const contactRead = await fetchGoHighLevelContactPages({
    accessToken,
    locationId,
    fetchImpl,
    budget: paginationBudgets.contact,
    requestBudget,
  });
  const contacts = contactRead.records;
  const resolvedContactMatches: SafeLocalMatch[] = [];
  for (const contact of contacts) {
    await heartbeat?.();
    const externalId = getExternalId(contact);
    if (!externalId) continue;
    const match = matchGoHighLevelLocalContact(contact, local);
    const effectiveMatch = await upsertContactMapping({
      serviceClient,
      connection,
      record: contact,
      match,
    });
    contactMatches.set(externalId, effectiveMatch);
    resolvedContactMatches.push(effectiveMatch);
  }
  const contactMatchOutcomes = summarizeGoHighLevelContactMatchOutcomes(
    resolvedContactMatches,
  );
  const unresolvedContactCount =
    contactMatchOutcomes.unmatched + contactMatchOutcomes.ambiguous;
  const contactsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "contact",
    records: contacts,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "contact",
    fetched: contactRead.fetched,
    saved: contactsSaved.saved,
    failed:
      contactRead.failedPages +
      contactsSaved.failed +
      unresolvedContactCount,
    pages: contactRead.pages,
    duplicatesSuppressed: contactRead.duplicatesSuppressed,
    paginationTruncated: contactRead.paginationTruncated,
    contactMatchOutcomes,
    message: !contactRead.ok
      ? contactRead.error ?? "Contacts could not be synchronized."
      : contactRead.paginationTruncated
        ? "Newest contacts synchronized through the bounded history safety ceiling."
        : unresolvedContactCount
          ? `Contacts synchronized with ${contactMatchOutcomes.unmatched} unmatched and ${contactMatchOutcomes.ambiguous} ambiguous contact resolution outcomes requiring review.`
          : "Contacts synchronized.",
  });

  const fetchedByType = new Map<GoHighLevelResourceType, ProviderRecord[]>();
  const conversationRead = await fetchGoHighLevelConversationPages({
    accessToken,
    locationId,
    fetchImpl,
    budget: paginationBudgets.conversation,
    requestBudget,
  });
  fetchedByType.set("conversation", conversationRead.records);
  const conversationsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "conversation",
    records: conversationRead.records,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "conversation",
    fetched: conversationRead.fetched,
    saved: conversationsSaved.saved,
    failed:
      conversationRead.failedPages + conversationsSaved.failed,
    pages: conversationRead.pages,
    duplicatesSuppressed: conversationRead.duplicatesSuppressed,
    paginationTruncated: conversationRead.paginationTruncated,
    message: !conversationRead.ok
      ? conversationRead.error ?? "Conversations could not be synchronized."
      : conversationRead.paginationTruncated
        ? "Newest conversations synchronized through the bounded history safety ceiling."
        : "Conversations synchronized.",
  });

  const resourceRequests: Array<{
    resourceType: GoHighLevelResourceType;
    path: string;
    query: Record<string, string | number>;
    keys: string[];
  }> = [
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
  ];

  for (const request of resourceRequests) {
    const response = await requestGoHighLevelApi({
      accessToken,
      path: request.path,
      query: request.query,
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      requestBudget,
    });
    const extracted = response.ok
      ? extractExpectedList(response.payload, request.keys)
      : { ok: false as const, records: [] as ProviderRecord[] };
    const responseValid =
      response.ok &&
      extracted.ok &&
      validateProviderRecordLocations(extracted.records, locationId);
    const rawRecords = responseValid ? extracted.records : [];
    const deduplicated = deduplicateProviderRecords(rawRecords);
    const records = deduplicated.records;
    fetchedByType.set(request.resourceType, records);
    const saved = await saveResource({
      serviceClient,
      connection,
      resourceType: request.resourceType,
      records,
      contactMatches,
      heartbeat,
    });
    results.push({
      resourceType: request.resourceType,
      fetched: rawRecords.length,
      saved: saved.saved,
      failed: responseValid ? saved.failed : 1,
      pages: 1,
      duplicatesSuppressed: deduplicated.duplicatesSuppressed,
      paginationTruncated: false,
      message: responseValid
        ? `${request.resourceType.replace(/_/g, " ")} records synchronized.`
        : response.ok
          ? `HighLevel ${request.resourceType.replace(/_/g, " ")} response schema or location scope was invalid.`
          : response.error,
    });
  }

  const opportunityRead = await fetchGoHighLevelOpportunityPages({
    accessToken,
    locationId,
    fetchImpl,
    budget: paginationBudgets.opportunity,
    requestBudget,
  });
  fetchedByType.set("opportunity", opportunityRead.records);
  const opportunitiesSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "opportunity",
    records: opportunityRead.records,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "opportunity",
    fetched: opportunityRead.fetched,
    saved: opportunitiesSaved.saved,
    failed:
      opportunityRead.failedPages + opportunitiesSaved.failed,
    pages: opportunityRead.pages,
    duplicatesSuppressed: opportunityRead.duplicatesSuppressed,
    paginationTruncated: opportunityRead.paginationTruncated,
    message: !opportunityRead.ok
      ? opportunityRead.error ?? "Opportunities could not be synchronized."
      : opportunityRead.paginationTruncated
        ? "Newest opportunities synchronized through the bounded history safety ceiling."
        : "Opportunities synchronized.",
  });

  const calendarEventsById = new Map<string, ProviderRecord>();
  const calendarEventsWithoutCanonicalId: ProviderRecord[] = [];
  let calendarEventFetchFailures = 0;
  let calendarEventPages = 0;
  let calendarEventsFetched = 0;
  let calendarEventDuplicatesSuppressed = 0;
  for (const calendar of fetchedByType.get("calendar") ?? []) {
    await heartbeat?.();
    const calendarId = getExternalId(calendar);
    if (!calendarId) continue;
    calendarEventPages += 1;
    const response = await requestGoHighLevelApi({
      accessToken,
      path: "/calendars/events",
      query: buildGoHighLevelCalendarEventQuery({ locationId, calendarId }),
      version: GOHIGHLEVEL_SYNC_API_VERSION,
      fetchImpl,
      requestBudget,
    });
    if (!response.ok) {
      calendarEventFetchFailures += 1;
      continue;
    }
    const extracted = extractExpectedList(response.payload, ["events", "appointments"]);
    if (
      !extracted.ok ||
      !validateProviderRecordLocations(extracted.records, locationId)
    ) {
      calendarEventFetchFailures += 1;
      continue;
    }
    const events = extracted.records;
    calendarEventsFetched += events.length;
    for (const event of events) {
      const eventId = getExternalId(event);
      if (!eventId) {
        calendarEventsWithoutCanonicalId.push(event);
        continue;
      }
      if (calendarEventsById.has(eventId)) {
        calendarEventDuplicatesSuppressed += 1;
      }
      calendarEventsById.set(eventId, event);
    }
  }
  const calendarEvents = [
    ...calendarEventsById.values(),
    ...calendarEventsWithoutCanonicalId,
  ];
  const calendarEventsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "calendar_event",
    records: calendarEvents,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "calendar_event",
    fetched: calendarEventsFetched,
    saved: calendarEventsSaved.saved,
    failed: calendarEventFetchFailures + calendarEventsSaved.failed,
    pages: calendarEventPages,
    duplicatesSuppressed: calendarEventDuplicatesSuppressed,
    paginationTruncated: false,
    message: calendarEventFetchFailures || calendarEventsSaved.failed
      ? "Some calendar events could not be synchronized."
      : "Calendar events synchronized.",
  });

  const reviewRead = await fetchGoHighLevelReviewPages({
    accessToken,
    locationId,
    fetchImpl,
    budget: paginationBudgets.review,
    requestBudget,
  });
  const reviewsSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "review",
    records: reviewRead.records,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "review",
    fetched: reviewRead.fetched,
    saved: reviewsSaved.saved,
    failed:
      reviewRead.failedPages + reviewsSaved.failed,
    pages: reviewRead.pages,
    duplicatesSuppressed: reviewRead.duplicatesSuppressed,
    paginationTruncated: reviewRead.paginationTruncated,
    message: !reviewRead.ok
      ? reviewRead.error ?? "Product reviews could not be synchronized."
      : reviewRead.paginationTruncated
        ? "Newest product reviews synchronized through the bounded history safety ceiling."
        : "Product reviews synchronized.",
  });

  // Each communication channel receives independent bounded provider capacity
  // so a large resource or channel cannot starve the others on every run.
  const communicationRequestBudgets: GoHighLevelRequestBudget[] = [];
  const attemptedCommunicationContactIds = new Set<string>();
  const createCommunicationRequestBudget = () => {
    const budget = createGoHighLevelRequestBudget({
      deadlineMs: 30_000,
      maxAttempts: 40,
      heartbeat,
    });
    communicationRequestBudgets.push(budget);
    return budget;
  };
  const smsRequestBudget = createCommunicationRequestBudget();
  const messageRead = await fetchGoHighLevelConversationMessagePages({
    accessToken,
    locationId,
    channel: "SMS",
    fetchImpl,
    budget: paginationBudgets.message,
    requestBudget: smsRequestBudget,
  });
  const messageContactHydration =
    await hydrateGoHighLevelCommunicationContactMatches({
      serviceClient,
      connection,
      accessToken,
      records: messageRead.records,
      contactMatches,
      local,
      attemptedContactIds: attemptedCommunicationContactIds,
      fetchImpl,
      requestBudget: smsRequestBudget,
      heartbeat,
    });
  const messageSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "message",
    records: messageRead.records,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "message",
    fetched: messageRead.fetched,
    saved: messageSaved.saved,
    failed:
      messageRead.failedPages +
      messageSaved.failed +
      messageContactHydration.failed +
      messageContactHydration.unresolved,
    pages: messageRead.pages,
    duplicatesSuppressed: messageRead.duplicatesSuppressed,
    paginationTruncated: messageRead.paginationTruncated,
    contactHydration: messageContactHydration,
    message: !messageRead.ok
      ? messageRead.error ?? "Some conversation messages could not be synchronized."
      : messageContactHydration.failed || messageContactHydration.unresolved
        ? "Messages synchronized, but some contact associations require review."
        : messageRead.paginationTruncated
          ? "Newest messages synchronized through the bounded history safety ceiling."
          : messageContactHydration.truncated
            ? "Messages synchronized with bounded contact-association hydration."
            : "Conversation messages synchronized.",
  });

  const emailRequestBudget = createCommunicationRequestBudget();
  const emailRead = await fetchGoHighLevelConversationMessagePages({
    accessToken,
    locationId,
    channel: "Email",
    fetchImpl,
    budget: paginationBudgets.email,
    requestBudget: emailRequestBudget,
  });
  const emailContactHydration =
    await hydrateGoHighLevelCommunicationContactMatches({
      serviceClient,
      connection,
      accessToken,
      records: emailRead.records,
      contactMatches,
      local,
      attemptedContactIds: attemptedCommunicationContactIds,
      fetchImpl,
      requestBudget: emailRequestBudget,
      heartbeat,
    });
  const emailSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "message",
    records: emailRead.records,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "message",
    fetched: emailRead.fetched,
    saved: emailSaved.saved,
    failed:
      emailRead.failedPages +
      emailSaved.failed +
      emailContactHydration.failed +
      emailContactHydration.unresolved,
    pages: emailRead.pages,
    duplicatesSuppressed: emailRead.duplicatesSuppressed,
    paginationTruncated: emailRead.paginationTruncated,
    contactHydration: emailContactHydration,
    message: !emailRead.ok
      ? emailRead.error ?? "Some conversation emails could not be synchronized."
      : emailContactHydration.failed || emailContactHydration.unresolved
        ? "Emails synchronized, but some contact associations require review."
        : emailRead.paginationTruncated
          ? "Newest emails synchronized through the bounded history safety ceiling."
          : emailContactHydration.truncated
            ? "Emails synchronized with bounded contact-association hydration."
            : "Conversation emails synchronized.",
  });

  const callRequestBudget = createCommunicationRequestBudget();
  const callRead = await fetchGoHighLevelConversationMessagePages({
    accessToken,
    locationId,
    channel: "Call",
    fetchImpl,
    budget: paginationBudgets.call,
    requestBudget: callRequestBudget,
  });
  const callContactHydration =
    await hydrateGoHighLevelCommunicationContactMatches({
      serviceClient,
      connection,
      accessToken,
      records: callRead.records,
      contactMatches,
      local,
      attemptedContactIds: attemptedCommunicationContactIds,
      fetchImpl,
      requestBudget: callRequestBudget,
      heartbeat,
    });
  const callSaved = await saveResource({
    serviceClient,
    connection,
    resourceType: "call",
    records: callRead.records,
    contactMatches,
    heartbeat,
  });
  results.push({
    resourceType: "call",
    fetched: callRead.fetched,
    saved: callSaved.saved,
    failed:
      callRead.failedPages +
      callSaved.failed +
      callContactHydration.failed +
      callContactHydration.unresolved,
    pages: callRead.pages,
    duplicatesSuppressed: callRead.duplicatesSuppressed,
    paginationTruncated: callRead.paginationTruncated,
    contactHydration: callContactHydration,
    message: !callRead.ok
      ? callRead.error ?? "Some call records could not be synchronized."
      : callContactHydration.failed || callContactHydration.unresolved
        ? "Calls synchronized, but some contact associations require review."
        : callRead.paginationTruncated
          ? "Newest calls synchronized through the bounded history safety ceiling."
          : callContactHydration.truncated
            ? "Calls synchronized with bounded contact-association hydration."
            : "Call records synchronized.",
  });

  const totalFetched = results.reduce((sum, result) => sum + result.fetched, 0);
  const totalSaved = results.reduce((sum, result) => sum + result.saved, 0);
  const totalFailed = results.reduce((sum, result) => sum + result.failed, 0);
  const totalDuplicatesSuppressed = results.reduce(
    (sum, result) => sum + result.duplicatesSuppressed,
    0,
  );
  const now = new Date().toISOString();
  const allPaginationBudgets = Object.values(paginationBudgets);
  const providerRequestBudgets = [
    requestBudget,
    ...communicationRequestBudgets,
  ];

  await heartbeat?.();

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
    totalDuplicatesSuppressed,
    pagination: {
      pagesUsed: allPaginationBudgets.reduce((total, budget) => total + budget.pagesUsed, 0),
      maxPages: MAX_SYNC_PAGES * allPaginationBudgets.length,
      recordsRead: allPaginationBudgets.reduce(
        (total, budget) => total + budget.recordsRead,
        0,
      ),
      maxRecords: MAX_SYNC_RECORDS * allPaginationBudgets.length,
      ceilingReached: allPaginationBudgets.some((budget) => budget.ceilingReached),
    },
    providerRequests: {
      attemptsUsed: providerRequestBudgets.reduce(
        (total, budget) => total + budget.attemptsUsed,
        0,
      ),
      maxAttempts: providerRequestBudgets.reduce(
        (total, budget) => total + budget.maxAttempts,
        0,
      ),
      deadlineReached: providerRequestBudgets.some(
        (budget) => budget.ceilingReached,
      ),
    },
    checkedAt: now,
  };
}
