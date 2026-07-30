"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Filter,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { CompanyScopeId } from "../lib/crm/companyScope";
import {
  buildOperationsQueue,
  filterOperationsQueueItems,
  getOperationsQueueFilterOptions,
  getOperationsQueueSummary,
  operationsQueueCategoryLabels,
  operationsQueuePriorityLabels,
  operationsQueueWorkflowLabels,
  type OperationsQueueCategory,
  type OperationsQueueFilters,
  type OperationsQueueItem,
  type OperationsQueuePriority,
  type OperationsQueueTimingFilter,
  type OperationsQueueWorkflow,
} from "../lib/crm/operationsQueue";
import type { CompanyRecord, CrmSnapshot } from "../lib/crm/types";

type OperationsQueuePanelProps = {
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  activeCompanyId: CompanyScopeId;
  onOpenItem: (item: OperationsQueueItem) => void;
};

type QueueFilterState = Required<OperationsQueueFilters>;

const defaultFilters: QueueFilterState = {
  assignedOwner: "all",
  category: "all",
  companyId: "all",
  priority: "all",
  search: "",
  timing: "all",
  workflow: "all",
};

const timingLabels: Record<OperationsQueueTimingFilter, string> = {
  all: "All timing",
  completed: "Completed",
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
};

export function OperationsQueuePanel({
  snapshot,
  companyMap,
  activeCompanyId,
  onOpenItem,
}: OperationsQueuePanelProps) {
  const [filters, setFilters] = useState<QueueFilterState>(defaultFilters);
  const queueItems = useMemo(() => buildOperationsQueue(snapshot), [snapshot]);
  const summary = useMemo(() => getOperationsQueueSummary(queueItems), [queueItems]);
  const options = useMemo(() => getOperationsQueueFilterOptions(queueItems), [queueItems]);
  const visibleItems = useMemo(
    () => filterOperationsQueueItems(queueItems, filters),
    [filters, queueItems],
  );
  const activeFilterCount = [
    filters.companyId !== "all",
    filters.assignedOwner !== "all",
    filters.priority !== "all",
    filters.category !== "all",
    filters.workflow !== "all",
    filters.timing !== "all",
    Boolean(filters.search.trim()),
  ].filter(Boolean).length;
  const scopeLabel =
    activeCompanyId === "all"
      ? "All companies"
      : companyMap.get(activeCompanyId)?.name ?? "Selected company";

  const updateFilter = <Key extends keyof QueueFilterState>(
    key: Key,
    value: QueueFilterState[Key],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <section
      className="rounded-2xl border border-wt-border bg-wt-surface p-4 shadow-[var(--wt-shadow)]"
      data-testid="operations-intelligence-queue"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">
            Operations Queue
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-wt-ink">
            Office follow-up engine
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-wt-muted">
            Automatically aggregates lead, estimate, inspection, job, document,
            invoice, material, signature, communication, and closeout work that
            needs office attention.
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-wt-border bg-wt-surface-muted p-3 text-sm">
          <p className="font-bold text-wt-ink">{scopeLabel}</p>
          <p className="text-wt-muted">
            Sorted by priority, then due date. {visibleItems.length} visible of{" "}
            {queueItems.length}.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <QueueSummaryCard
          label="Total open work"
          value={summary.total}
          detail="All queue signals"
          tone="blue"
        />
        <QueueSummaryCard
          label="Critical"
          value={summary.critical}
          detail="Needs immediate attention"
          tone={summary.critical ? "red" : "green"}
        />
        <QueueSummaryCard
          label="High priority"
          value={summary.high}
          detail="Important office work"
          tone={summary.high ? "amber" : "green"}
        />
        <QueueSummaryCard
          label="Overdue"
          value={summary.overdue}
          detail="Past due date"
          tone={summary.overdue ? "red" : "green"}
        />
        <QueueSummaryCard
          label="Due today"
          value={summary.today}
          detail="Needs action today"
          tone={summary.today ? "amber" : "green"}
        />
      </div>

      <div className="mt-4 rounded-xl border border-wt-border bg-wt-surface-muted p-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-wt-muted">
          <Filter className="h-4 w-4" />
          Queue Filters
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <label className="relative md:col-span-2 xl:col-span-2">
            <span className="sr-only">Search operations queue</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-wt-muted" />
            <input
              data-testid="operations-queue-search"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
              className="min-h-10 w-full rounded-lg border border-wt-border bg-wt-surface py-2 pl-9 pr-3 text-sm text-wt-ink transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              placeholder="Search customers, addresses, jobs, invoices"
            />
          </label>
          <QueueSelect
            testId="operations-queue-company-filter"
            label="Company"
            value={filters.companyId}
            onChange={(value) => updateFilter("companyId", value)}
            options={[
              { value: "all", label: "All companies" },
              ...snapshot.companies.map((company) => ({
                value: company.id,
                label: company.name,
              })),
            ]}
          />
          <QueueSelect
            testId="operations-queue-owner-filter"
            label="Assigned owner"
            value={filters.assignedOwner}
            onChange={(value) => updateFilter("assignedOwner", value)}
            options={[
              { value: "all", label: "All owners" },
              { value: "Unassigned", label: "Unassigned" },
              ...options.assignedOwners.map((owner) => ({
                value: owner,
                label: owner,
              })),
            ]}
          />
          <QueueSelect
            testId="operations-queue-priority-filter"
            label="Priority"
            value={filters.priority}
            onChange={(value) =>
              updateFilter("priority", value as OperationsQueuePriority | "all")
            }
            options={[
              { value: "all", label: "All priorities" },
              ...Object.entries(operationsQueuePriorityLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <QueueSelect
            testId="operations-queue-category-filter"
            label="Category"
            value={filters.category}
            onChange={(value) =>
              updateFilter("category", value as OperationsQueueCategory | "all")
            }
            options={[
              { value: "all", label: "All categories" },
              ...options.categories.map((category) => ({
                value: category,
                label: operationsQueueCategoryLabels[category],
              })),
            ]}
          />
          <QueueSelect
            testId="operations-queue-workflow-filter"
            label="Workflow"
            value={filters.workflow}
            onChange={(value) =>
              updateFilter("workflow", value as OperationsQueueWorkflow | "all")
            }
            options={[
              { value: "all", label: "All workflows" },
              ...options.workflows.map((workflow) => ({
                value: workflow,
                label: operationsQueueWorkflowLabels[workflow],
              })),
            ]}
          />
          <QueueSelect
            testId="operations-queue-timing-filter"
            label="Timing"
            value={filters.timing}
            onChange={(value) =>
              updateFilter("timing", value as OperationsQueueTimingFilter)
            }
            options={Object.entries(timingLabels).map(([value, label]) => ({
              value,
              label,
            }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-wt-muted">
            {activeFilterCount
              ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
              : "Showing all operational work"}
          </p>
          <button
            type="button"
            onClick={() => setFilters(defaultFilters)}
            className="min-h-10 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold text-wt-ink transition hover:border-orange-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
          >
            Clear filters
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-wt-border bg-wt-surface">
        <div className="hidden border-b border-wt-border bg-wt-surface-muted px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-wt-muted lg:grid lg:grid-cols-[minmax(0,1.55fr)_9rem_8rem_9rem_8rem_9rem_9rem] lg:gap-3">
          <span>Customer / property work item</span>
          <span>Priority</span>
          <span>Category</span>
          <span>Owner</span>
          <span>Due</span>
          <span>Stage</span>
          <span>Suggested next action</span>
        </div>
        <div className="divide-y divide-wt-border">
          {visibleItems.length ? (
            visibleItems.map((item, index) => (
              <OperationsQueueRow
                key={item.id}
                item={item}
                index={index}
                company={companyMap.get(item.companyId) ?? null}
                onOpen={() => onOpenItem(item)}
              />
            ))
          ) : (
            <div className="p-6">
              <div className="rounded-xl border border-dashed border-wt-border bg-wt-surface-muted p-5 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-3 text-sm font-bold text-wt-ink">
                  No queue items match these filters.
                </p>
                <p className="mt-1 text-sm text-wt-muted">
                  Clear filters or switch company scope to review other office work.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function QueueSummaryCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "blue" | "green" | "amber" | "red";
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${queueSurfaceClass(tone)}`}
      data-testid={`operations-queue-summary-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">{label}</p>
      <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs font-semibold opacity-80">{detail}</p>
    </div>
  );
}

function QueueSelect({
  testId,
  label,
  value,
  onChange,
  options,
}: {
  testId: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="grid gap-1">
      <span className="sr-only">{label}</span>
      <select
        data-testid={testId}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-10 rounded-lg border border-wt-border bg-wt-surface px-3 py-2 text-sm font-semibold text-wt-ink transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      >
        {options.map((option) => (
          <option key={`${testId}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function OperationsQueueRow({
  item,
  company,
  index,
  onOpen,
}: {
  item: OperationsQueueItem;
  company: CompanyRecord | null;
  index: number;
  onOpen: () => void;
}) {
  const dueLabel = item.dueAt ? formatQueueDate(item.dueAt) : "No due date";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="grid w-full min-w-0 gap-3 px-3 py-3 text-left transition hover:bg-wt-surface-muted focus:outline-none focus:ring-2 focus:ring-orange-300 lg:grid-cols-[minmax(0,1.55fr)_9rem_8rem_9rem_8rem_9rem_9rem] lg:items-center"
      data-testid="operations-queue-row"
      data-priority={item.priority}
      data-status={item.status}
      data-due-at={item.dueAt ?? ""}
      data-category={item.category}
      data-workflow={item.workflow}
      data-target-view={item.targetView}
      data-source-module={item.sourceModule}
      data-source-record-id={item.sourceRecordId}
      data-sort-index={index}
    >
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="break-words text-sm font-bold text-wt-ink">{item.title}</span>
          {company ? <QueuePill label={company.short_name ?? company.name} tone="blue" /> : null}
          <QueuePill label={statusLabel(item.status)} tone={statusTone(item.status)} />
        </span>
        <span className="mt-1 block break-words text-sm text-wt-muted">
          {item.customerName} · {item.propertyLabel}
        </span>
        <span className="mt-1 block break-words text-xs font-semibold text-wt-muted">
          Source module: {item.sourceModule} · Age: {item.ageDays}d · {item.detail}
        </span>
      </span>
      <span data-testid="operations-queue-row-priority">
        <QueuePill
          label={operationsQueuePriorityLabels[item.priority]}
          tone={priorityTone(item.priority)}
        />
      </span>
      <span className="text-sm font-semibold text-wt-ink">
        {operationsQueueCategoryLabels[item.category]}
      </span>
      <span className="break-words text-sm font-semibold text-wt-muted">
        {item.assignedOwner}
      </span>
      <span className="text-sm font-semibold text-wt-muted">{dueLabel}</span>
      <span className="break-words text-sm font-semibold text-wt-muted">
        {item.currentWorkflowStage}
      </span>
      <span className="flex items-center gap-2 text-sm font-bold text-orange-700">
        <span className="break-words">{item.suggestedNextAction}</span>
        <ChevronRight className="h-4 w-4 shrink-0" />
      </span>
    </button>
  );
}

function QueuePill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "green" | "amber" | "red" | "slate";
}) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-bold capitalize ${pillClass(tone)}`}
    >
      {label}
    </span>
  );
}

function priorityTone(priority: OperationsQueuePriority) {
  if (priority === "critical") {
    return "red" as const;
  }

  if (priority === "high") {
    return "amber" as const;
  }

  if (priority === "medium") {
    return "blue" as const;
  }

  return "green" as const;
}

function statusTone(status: OperationsQueueItem["status"]) {
  if (status === "completed") {
    return "green" as const;
  }

  if (status === "overdue") {
    return "red" as const;
  }

  if (status === "today") {
    return "amber" as const;
  }

  if (status === "upcoming") {
    return "blue" as const;
  }

  return "slate" as const;
}

function statusLabel(status: OperationsQueueItem["status"]) {
  return status.replace("_", " ");
}

function pillClass(tone: "blue" | "green" | "amber" | "red" | "slate") {
  return {
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-sky-100 text-sky-800",
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800",
    slate: "bg-slate-100 text-slate-700",
  }[tone];
}

function queueSurfaceClass(tone: "blue" | "green" | "amber" | "red") {
  return {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[tone];
}

function formatQueueDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}
