import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutomationExecutionRecord,
  Database,
} from "./types";

type CrmClient = SupabaseClient<Database>;

export type AutomationExecutionCandidateKind =
  | "active"
  | "retryable_failed";

export type AutomationExecutionCandidateCursor = {
  updatedAt: string;
  id: string;
};

export type AutomationExecutionCandidatePage = {
  data: AutomationExecutionRecord[] | null;
  error: unknown;
  hasMore: boolean;
  nextCursor: AutomationExecutionCandidateCursor | null;
};

export const AUTOMATION_GENERAL_EXECUTION_CANDIDATE_LIMIT = 200;
export const AUTOMATION_CONTROL_CENTER_EXECUTION_PAGE_SIZE =
  AUTOMATION_GENERAL_EXECUTION_CANDIDATE_LIMIT;

const AUTOMATION_EXECUTION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTOMATION_EXECUTION_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isAutomationExecutionPagingGenerationCurrent(
  currentGeneration: number,
  requestGeneration: number,
) {
  return currentGeneration === requestGeneration;
}

function normalizeCursor(cursor: AutomationExecutionCandidateCursor) {
  const timestamp = Date.parse(cursor.updatedAt);
  if (
    !Number.isFinite(timestamp) ||
    !AUTOMATION_EXECUTION_TIMESTAMP_PATTERN.test(cursor.updatedAt) ||
    !AUTOMATION_EXECUTION_ID_PATTERN.test(cursor.id)
  ) {
    throw new Error("The automation execution cursor is invalid.");
  }

  return {
    // Keep PostgreSQL's exact microsecond precision so keyset pagination cannot
    // skip sibling rows that share the same millisecond.
    updatedAt: cursor.updatedAt,
    id: cursor.id.toLowerCase(),
  };
}

function createCandidateQuery(
  client: CrmClient,
  kind: AutomationExecutionCandidateKind,
) {
  const query = client.from("automation_executions").select("*");

  return kind === "active"
    ? query.in("status", [
        "queued",
        "awaiting_approval",
        "running",
        "retry_scheduled",
      ])
    : query.eq("status", "failed").lt("attempt_count", 10);
}

export async function fetchBoundedAutomationExecutionCandidates(
  client: CrmClient,
  kind: AutomationExecutionCandidateKind,
) {
  return createCandidateQuery(client, kind)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AUTOMATION_GENERAL_EXECUTION_CANDIDATE_LIMIT);
}

export async function fetchAutomationExecutionCandidatePage(
  client: CrmClient,
  kind: AutomationExecutionCandidateKind,
  cursor: AutomationExecutionCandidateCursor | null = null,
): Promise<AutomationExecutionCandidatePage> {
  let query = createCandidateQuery(client, kind)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });

  if (cursor) {
    const normalizedCursor = normalizeCursor(cursor);
    query = query.or(
      `updated_at.lt.${normalizedCursor.updatedAt},and(updated_at.eq.${normalizedCursor.updatedAt},id.lt.${normalizedCursor.id})`,
    );
  }

  const result = await query.limit(
    AUTOMATION_CONTROL_CENTER_EXECUTION_PAGE_SIZE + 1,
  );
  if (result.error) {
    return {
      data: null,
      error: result.error,
      hasMore: false,
      nextCursor: null,
    };
  }

  const rows = (result.data ?? []) as AutomationExecutionRecord[];
  const hasMore = rows.length > AUTOMATION_CONTROL_CENTER_EXECUTION_PAGE_SIZE;
  const data = rows.slice(0, AUTOMATION_CONTROL_CENTER_EXECUTION_PAGE_SIZE);
  const lastVisibleRow = data.at(-1);

  return {
    data,
    error: null,
    hasMore,
    nextCursor:
      hasMore && lastVisibleRow
        ? { updatedAt: lastVisibleRow.updated_at, id: lastVisibleRow.id }
        : null,
  };
}

export function mergeAutomationExecutionRows(
  ...groups: AutomationExecutionRecord[][]
): AutomationExecutionRecord[] {
  const rowsById = new Map<string, AutomationExecutionRecord>();

  groups.forEach((rows) => {
    rows.forEach((row) => {
      const current = rowsById.get(row.id);
      const rowUpdatedAt = Date.parse(row.updated_at);
      const currentUpdatedAt = current ? Date.parse(current.updated_at) : Number.NaN;

      if (
        !current ||
        row.version > current.version ||
        (row.version === current.version && rowUpdatedAt > currentUpdatedAt)
      ) {
        rowsById.set(row.id, row);
      }
    });
  });

  return [...rowsById.values()];
}
