"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  automationExecutionStatusLabels,
  buildAutomationControlCenterModel,
  canCancelAutomationExecution,
  canRetryAutomationExecution,
  canReviewAutomationExecution,
  formatAutomationKey,
  getAutomationExecutionTone,
  type AutomationControlTone,
} from "../lib/crm/automationControlCenter";
import {
  cancelAutomationExecution,
  retryAutomationExecution,
  reviewAutomationExecution,
  setAutomationRuleEnabled,
} from "../lib/crm/repository";
import {
  fetchAutomationExecutionCandidatePage,
  isAutomationExecutionPagingGenerationCurrent,
  mergeAutomationExecutionRows,
  type AutomationExecutionCandidateCursor,
  type AutomationExecutionCandidateKind,
  type AutomationExecutionCandidatePage,
} from "../lib/crm/automationExecutionPagination";
import type {
  AutomationExecutionRecord,
  AutomationRuleRecord,
  CrmSnapshot,
  Database,
} from "../lib/crm/types";

type CrmClient = SupabaseClient<Database>;

type AutomationControlCenterProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  userId: string | null;
  isDemoMode: boolean;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

type AutomationCandidatePageState = {
  rows: AutomationExecutionRecord[];
  cursor: AutomationExecutionCandidateCursor | null;
  hasMore: boolean;
};

type AutomationCandidatePagingState = {
  active: AutomationCandidatePageState;
  retryableFailed: AutomationCandidatePageState;
  loaded: boolean;
  loading: boolean;
  error: string | null;
};

function emptyCandidatePageState(): AutomationCandidatePageState {
  return { rows: [], cursor: null, hasMore: false };
}

function initialCandidatePagingState(
  loading = false,
): AutomationCandidatePagingState {
  return {
    active: emptyCandidatePageState(),
    retryableFailed: emptyCandidatePageState(),
    loaded: false,
    loading,
    error: null,
  };
}

function requireCandidatePage(
  page: AutomationExecutionCandidatePage,
  kind: AutomationExecutionCandidateKind,
) {
  if (page.error || !page.data) {
    throw new Error(
      kind === "active"
        ? "Active automation candidates could not be loaded."
        : "Failed automation retry candidates could not be loaded.",
    );
  }

  return page;
}

const toneClasses: Record<AutomationControlTone, string> = {
  blue: "border-sky-200 bg-sky-50 text-sky-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  red: "border-red-200 bg-red-50 text-red-800",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
};

const phoenixDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Phoenix",
});

function formatDateTime(value: string | null) {
  if (!value) return "Not yet";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Unknown";

  return phoenixDateTimeFormatter.format(new Date(timestamp));
}

function StatusBadge({ label, tone }: { label: string; tone: AutomationControlTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

function Metric({
  label,
  value,
  partial = false,
}: {
  label: string;
  value: number;
  partial?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-black text-slate-950"
        title={partial ? "Count for execution pages loaded so far" : undefined}
      >
        {value}
        {partial ? "+" : ""}
      </p>
    </div>
  );
}

function requestReason(prompt: string, fallback: string) {
  const value = window.prompt(prompt, fallback);
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

export default function AutomationControlCenter({
  client,
  snapshot,
  userId,
  isDemoMode,
  onReload,
  onNotice,
  onError,
}: AutomationControlCenterProps) {
  const candidatePagingGenerationRef = useRef(0);
  const candidateLoadMorePendingRef = useRef(false);
  const [candidatePaging, setCandidatePaging] =
    useState<AutomationCandidatePagingState>(() => initialCandidatePagingState());
  const candidateSnapshot = useMemo(
    () => ({
      ...snapshot,
      automationExecutions: mergeAutomationExecutionRows(
        snapshot.automationExecutions ?? [],
        candidatePaging.active.rows,
        candidatePaging.retryableFailed.rows,
      ),
    }),
    [candidatePaging.active.rows, candidatePaging.retryableFailed.rows, snapshot],
  );
  const model = useMemo(
    () => buildAutomationControlCenterModel(candidateSnapshot, userId),
    [candidateSnapshot, userId],
  );
  const [busyControl, setBusyControl] = useState<string | null>(null);
  const candidateCountsPartial =
    !candidatePaging.loaded ||
    Boolean(candidatePaging.error) ||
    candidatePaging.active.hasMore ||
    candidatePaging.retryableFailed.hasMore;

  useEffect(() => {
    let cancelled = false;
    const generation = candidatePagingGenerationRef.current + 1;
    candidatePagingGenerationRef.current = generation;
    candidateLoadMorePendingRef.current = false;

    if (isDemoMode) {
      setCandidatePaging({
        ...initialCandidatePagingState(),
        loaded: true,
      });
      return () => {
        cancelled = true;
      };
    }

    setCandidatePaging(initialCandidatePagingState(true));
    void Promise.all([
      fetchAutomationExecutionCandidatePage(client, "active"),
      fetchAutomationExecutionCandidatePage(client, "retryable_failed"),
    ])
      .then(([activeResult, failedResult]) => {
        if (
          cancelled ||
          !isAutomationExecutionPagingGenerationCurrent(
            candidatePagingGenerationRef.current,
            generation,
          )
        ) {
          return;
        }
        const active = requireCandidatePage(activeResult, "active");
        const retryableFailed = requireCandidatePage(
          failedResult,
          "retryable_failed",
        );
        setCandidatePaging({
          active: {
            rows: active.data ?? [],
            cursor: active.nextCursor,
            hasMore: active.hasMore,
          },
          retryableFailed: {
            rows: retryableFailed.data ?? [],
            cursor: retryableFailed.nextCursor,
            hasMore: retryableFailed.hasMore,
          },
          loaded: true,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (
          cancelled ||
          !isAutomationExecutionPagingGenerationCurrent(
            candidatePagingGenerationRef.current,
            generation,
          )
        ) {
          return;
        }
        setCandidatePaging({
          ...initialCandidatePagingState(),
          loaded: true,
          error:
            error instanceof Error
              ? error.message
              : "Automation execution candidates could not be loaded.",
        });
      });

    return () => {
      cancelled = true;
      if (
        isAutomationExecutionPagingGenerationCurrent(
          candidatePagingGenerationRef.current,
          generation,
        )
      ) {
        candidatePagingGenerationRef.current += 1;
        candidateLoadMorePendingRef.current = false;
      }
    };
  }, [client, isDemoMode, snapshot.automationExecutions]);

  const loadOlderCandidates = async () => {
    if (
      candidatePaging.loading ||
      candidateLoadMorePendingRef.current ||
      isDemoMode
    ) {
      return;
    }

    const generation = candidatePagingGenerationRef.current;
    candidateLoadMorePendingRef.current = true;

    setCandidatePaging((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const [activeResult, failedResult] = await Promise.all([
        candidatePaging.active.hasMore && candidatePaging.active.cursor
          ? fetchAutomationExecutionCandidatePage(
              client,
              "active",
              candidatePaging.active.cursor,
            )
          : Promise.resolve(null),
        candidatePaging.retryableFailed.hasMore &&
        candidatePaging.retryableFailed.cursor
          ? fetchAutomationExecutionCandidatePage(
              client,
              "retryable_failed",
              candidatePaging.retryableFailed.cursor,
            )
          : Promise.resolve(null),
      ]);
      const active = activeResult
        ? requireCandidatePage(activeResult, "active")
        : null;
      const retryableFailed = failedResult
        ? requireCandidatePage(failedResult, "retryable_failed")
        : null;

      if (
        !isAutomationExecutionPagingGenerationCurrent(
          candidatePagingGenerationRef.current,
          generation,
        )
      ) {
        return;
      }

      setCandidatePaging((current) => ({
        active: active
          ? {
              rows: mergeAutomationExecutionRows(
                current.active.rows,
                active.data ?? [],
              ),
              cursor: active.nextCursor,
              hasMore: active.hasMore,
            }
          : current.active,
        retryableFailed: retryableFailed
          ? {
              rows: mergeAutomationExecutionRows(
                current.retryableFailed.rows,
                retryableFailed.data ?? [],
              ),
              cursor: retryableFailed.nextCursor,
              hasMore: retryableFailed.hasMore,
            }
          : current.retryableFailed,
        loaded: true,
        loading: false,
        error: null,
      }));
    } catch (error) {
      if (
        !isAutomationExecutionPagingGenerationCurrent(
          candidatePagingGenerationRef.current,
          generation,
        )
      ) {
        return;
      }
      setCandidatePaging((current) => ({
        ...current,
        loading: false,
        error:
          error instanceof Error
            ? error.message
            : "Older automation execution candidates could not be loaded.",
      }));
    } finally {
      if (
        isAutomationExecutionPagingGenerationCurrent(
          candidatePagingGenerationRef.current,
          generation,
        )
      ) {
        candidateLoadMorePendingRef.current = false;
      }
    }
  };

  const runControl = async (
    controlKey: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusyControl(controlKey);
    onError("");

    try {
      await operation();
      await onReload();
      onNotice(successMessage);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Automation control could not be saved.",
      );
    } finally {
      setBusyControl(null);
    }
  };

  const handleRuleToggle = async (rule: AutomationRuleRecord) => {
    if (isDemoMode) return;
    const enabling = !rule.enabled;
    const reason = enabling
      ? "Enabled from the Automation Control Center."
      : requestReason(
          "Why are you disabling this automation?",
          "Paused by the owner from the Automation Control Center.",
        );

    if (!enabling && !reason) return;
    if (
      enabling &&
      !window.confirm(
        `Enable ${rule.name}? The database will enforce its company, action, and approval policy.`,
      )
    ) {
      return;
    }

    await runControl(
      `rule:${rule.id}`,
      () =>
        setAutomationRuleEnabled(client, {
          ruleId: rule.id,
          expectedVersion: rule.version,
          enabled: enabling,
          reason: reason ?? "Enabled from the Automation Control Center.",
        }),
      `${rule.name} is now ${enabling ? "enabled" : "disabled"}.`,
    );
  };

  const handleReview = async (
    execution: AutomationExecutionRecord,
    decision: "approve" | "reject",
  ) => {
    if (isDemoMode) return;
    const reason = requestReason(
      decision === "approve"
        ? "Optional approval note"
        : "Why are you rejecting this execution?",
      decision === "approve"
        ? "Approved in the Automation Control Center."
        : "Rejected in the Automation Control Center.",
    );
    if (reason === null) return;

    await runControl(
      `review:${execution.id}`,
      () =>
        reviewAutomationExecution(client, {
          executionId: execution.id,
          expectedVersion: execution.version,
          decision,
          reason,
        }),
      `Automation execution ${decision === "approve" ? "approved" : "rejected"}.`,
    );
  };

  const handleCancel = async (execution: AutomationExecutionRecord) => {
    if (isDemoMode) return;
    const reason = requestReason(
      "Why are you cancelling this execution?",
      "Cancelled by the owner from the Automation Control Center.",
    );
    if (!reason) return;

    await runControl(
      `cancel:${execution.id}`,
      () =>
        cancelAutomationExecution(client, {
          executionId: execution.id,
          expectedVersion: execution.version,
          reason,
        }),
      "Automation execution cancelled.",
    );
  };

  const handleRetry = async (execution: AutomationExecutionRecord) => {
    if (isDemoMode) return;
    const reason = requestReason(
      "Why should this execution be retried?",
      "Retry requested by the owner after reviewing the failure.",
    );
    if (!reason) return;

    await runControl(
      `retry:${execution.id}`,
      () =>
        retryAutomationExecution(client, {
          executionId: execution.id,
          expectedVersion: execution.version,
          reason,
        }),
      "Automation execution queued for a safe retry.",
    );
  };

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="automation-control-center"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase text-violet-700">
            Automation Control Center
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            Rules, approvals, and execution history
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Review company-scoped internal automations, pause rules, approve bounded
            work, and inspect retry-safe history. This surface cannot send provider or
            customer communications.
          </p>
        </div>
        <StatusBadge
          label={isDemoMode ? "Demo read-only" : "Database-authorized controls"}
          tone={isDemoMode ? "slate" : "blue"}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Rules" value={model.counts.rules} />
        <Metric label="Enabled" value={model.counts.enabled} />
        <Metric
          label="Awaiting approval loaded"
          value={model.counts.awaitingApproval}
          partial={candidateCountsPartial}
        />
        <Metric
          label="Needs attention loaded"
          value={model.counts.needsAttention}
          partial={candidateCountsPartial}
        />
      </div>

      <div className="mt-5 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Owner, admin, and delegated settings controls call version-checked database RPCs. Direct browser
            writes are not used, and database authorization remains the final guard.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-violet-700" />
          <h3 className="text-lg font-bold text-slate-950">Available rules</h3>
        </div>

        {model.rules.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            No automation rules are visible for your company access.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            {model.rules.map(({ rule, company, location, canManage, lastExecution }) => {
              const isBusy = busyControl === `rule:${rule.id}`;

              return (
                <article
                  key={rule.id}
                  className="rounded-lg border border-slate-200 p-4"
                  data-testid={`automation-rule-${rule.rule_key}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-slate-950">{rule.name}</h4>
                        <StatusBadge
                          label={rule.enabled ? "Enabled" : "Disabled"}
                          tone={rule.enabled ? "green" : "slate"}
                        />
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {company?.name ?? "Unknown company"} · {location?.display_name ?? "All locations"}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-pressed={rule.enabled}
                      disabled={!canManage || isDemoMode || busyControl !== null}
                      onClick={() => void handleRuleToggle(rule)}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rule.enabled ? (
                        <PauseCircle className="h-4 w-4" />
                      ) : (
                        <PlayCircle className="h-4 w-4" />
                      )}
                      {isBusy ? "Saving…" : rule.enabled ? "Disable" : "Enable"}
                    </button>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    {rule.description ?? "No description provided."}
                  </p>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-md bg-slate-50 p-3">
                      <dt className="font-semibold text-slate-500">Trigger</dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {formatAutomationKey(rule.trigger_type)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3">
                      <dt className="font-semibold text-slate-500">Action</dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {formatAutomationKey(rule.action_type)}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3">
                      <dt className="font-semibold text-slate-500">Approval</dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {rule.approval_policy === "manual" ? "Manual approval" : "Not required"}
                      </dd>
                    </div>
                    <div className="rounded-md bg-slate-50 p-3">
                      <dt className="font-semibold text-slate-500">Last run</dt>
                      <dd className="mt-1 font-bold text-slate-900">
                        {lastExecution
                          ? `${automationExecutionStatusLabels[lastExecution.status]} · ${formatDateTime(lastExecution.updated_at)}`
                          : "No execution yet"}
                      </dd>
                    </div>
                  </dl>
                  {lastExecution?.last_error_message ? (
                    <div className="mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{lastExecution.last_error_message}</span>
                    </div>
                  ) : null}
                  {!canManage ? (
                    <p className="mt-3 text-xs font-semibold text-slate-500">
                      Owner, admin, or delegated settings permission is required to change this rule.
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-7">
        <div className="flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-violet-700" />
          <h3 className="text-lg font-bold text-slate-950">Execution history</h3>
        </div>

        {model.executions.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            No automation executions are visible yet.
          </div>
        ) : (
          <div className="mt-4 space-y-6">
            {[
              {
                key: "actionable",
                title: "Needs action",
                description:
                  "Approvals, cancellations, and safe-retry candidates are loaded in bounded newest-first pages. Use Load older candidates to reach the remaining actionable ledger without expanding every CRM reload.",
                emptyMessage: candidateCountsPartial
                  ? "No loaded automation execution currently needs owner action. Load the remaining candidate pages before treating this queue as empty."
                  : "No automation execution currently needs owner action.",
                executions: model.actionableExecutions,
              },
              {
                key: "in-progress",
                title: "In progress",
                description:
                  "Running executions remain visible while the worker holds them.",
                emptyMessage:
                  !candidatePaging.loaded ||
                  Boolean(candidatePaging.error) ||
                  candidatePaging.active.hasMore
                    ? "No loaded automation execution is currently running. Load the remaining active-candidate pages before treating this queue as empty."
                    : "No automation execution is currently running.",
                executions: model.inProgressExecutions,
              },
              {
                key: "recent-terminal",
                title: "Recent terminal history",
                description: `Showing up to the latest ${model.recentTerminalLimit} terminal executions. Actionable and in-progress work is listed separately and is not subject to this display cap.`,
                emptyMessage: "No terminal automation execution is visible yet.",
                executions: model.recentTerminalExecutions,
              },
            ].map((group) => (
              <section key={group.key}>
                <div>
                  <h4 className="font-bold text-slate-950">{group.title}</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    {group.description}
                  </p>
                </div>
                {group.executions.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                    {group.emptyMessage}
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {group.executions.map(
              ({ execution, company, location, rule, event, attempts, auditEvents, canManage }) => {
                const reviewable = canReviewAutomationExecution(execution);
                const cancellable = canCancelAutomationExecution(execution);
                const retryable = canRetryAutomationExecution(execution, rule);
                const controlsDisabled = !canManage || isDemoMode || busyControl !== null;

                return (
                  <details
                    key={execution.id}
                    className="group rounded-lg border border-slate-200 p-4"
                    data-testid={`automation-execution-${execution.id}`}
                  >
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold text-slate-950">
                              {rule?.name ?? formatAutomationKey(execution.action_type)}
                            </p>
                            <StatusBadge
                              label={automationExecutionStatusLabels[execution.status]}
                              tone={getAutomationExecutionTone(execution.status)}
                            />
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {company?.name ?? "Unknown company"} · {location?.display_name ?? "All locations"}
                          </p>
                        </div>
                        <div className="text-sm text-slate-500 lg:text-right">
                          <p>{formatDateTime(execution.updated_at)}</p>
                          <p className="mt-1">
                            Attempt {execution.attempt_count} of {execution.max_attempts}
                          </p>
                        </div>
                      </div>
                    </summary>

                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <dl className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                        <div>
                          <dt className="font-semibold text-slate-500">Trigger event</dt>
                          <dd className="mt-1 text-slate-900">
                            {event ? formatAutomationKey(event.event_type) : "Unavailable"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-500">Action</dt>
                          <dd className="mt-1 text-slate-900">
                            {formatAutomationKey(execution.action_type)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-500">Approval</dt>
                          <dd className="mt-1 text-slate-900">
                            {formatAutomationKey(execution.approval_status)}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-slate-500">Next retry</dt>
                          <dd className="mt-1 text-slate-900">
                            {formatDateTime(execution.next_retry_at)}
                          </dd>
                        </div>
                      </dl>

                      {execution.last_error_message ? (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{execution.last_error_message}</span>
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {reviewable ? (
                          <>
                            <button
                              type="button"
                              disabled={controlsDisabled}
                              onClick={() => void handleReview(execution, "approve")}
                              className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle2 className="h-4 w-4" /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={controlsDisabled}
                              onClick={() => void handleReview(execution, "reject")}
                              className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <XCircle className="h-4 w-4" /> Reject
                            </button>
                          </>
                        ) : null}
                        {cancellable ? (
                          <button
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => void handleCancel(execution)}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <PauseCircle className="h-4 w-4" /> Cancel
                          </button>
                        ) : null}
                        {retryable ? (
                          <button
                            type="button"
                            disabled={controlsDisabled}
                            onClick={() => void handleRetry(execution)}
                            className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-3 py-2 text-sm font-bold text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RefreshCcw className="h-4 w-4" /> Retry
                          </button>
                        ) : null}
                      </div>

                      <div className="mt-5 grid gap-4 lg:grid-cols-2">
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-sm font-bold text-slate-900">
                            Attempts ({attempts.length})
                          </p>
                          <div className="mt-2 space-y-2 text-sm text-slate-600">
                            {attempts.length ? (
                              attempts.slice(0, 5).map((attempt) => (
                                <p key={attempt.id}>
                                  #{attempt.attempt_number} {formatAutomationKey(attempt.status)} · {formatDateTime(attempt.started_at)}
                                  {attempt.error_message ? ` · ${attempt.error_message}` : ""}
                                </p>
                              ))
                            ) : (
                              <p>No worker attempt recorded.</p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-sm font-bold text-slate-900">
                            Audit history ({auditEvents.length})
                          </p>
                          <div className="mt-2 space-y-2 text-sm text-slate-600">
                            {auditEvents.length ? (
                              auditEvents.slice(0, 5).map((auditEvent) => (
                                <p key={auditEvent.id}>
                                  {formatAutomationKey(auditEvent.audit_type)} · {formatDateTime(auditEvent.created_at)}
                                  {auditEvent.reason ? ` · ${auditEvent.reason}` : ""}
                                </p>
                              ))
                            ) : (
                              <p>No audit transition recorded.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              },
            )}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          {candidatePaging.error ? (
            <p className="font-semibold text-red-700" role="alert">
              {candidatePaging.error}
            </p>
          ) : null}
          {candidatePaging.loading && !candidatePaging.loaded ? (
            <p>Loading the first bounded execution-candidate pages…</p>
          ) : null}
          {candidatePaging.active.hasMore ||
          candidatePaging.retryableFailed.hasMore ? (
            <button
              type="button"
              data-testid="automation-load-older-candidates"
              disabled={candidatePaging.loading}
              onClick={() => void loadOlderCandidates()}
              className="mt-2 inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 font-bold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCcw className="h-4 w-4" />
              {candidatePaging.loading
                ? "Loading older candidates…"
                : "Load older execution candidates"}
            </button>
          ) : candidatePaging.loaded && !candidatePaging.error ? (
            <p>All available execution-candidate pages are loaded.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
