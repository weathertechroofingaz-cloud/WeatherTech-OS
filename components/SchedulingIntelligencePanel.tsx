"use client";

import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  MapPin,
  Package,
  Search,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import type { CompanyScopeId } from "../lib/crm/companyScope";
import {
  buildSchedulingIntelligence,
  filterSchedulingByCompany,
  type SchedulingAlert,
  type SchedulingCapacityItem,
  type SchedulingTargetView,
  type SchedulingWorkItem,
} from "../lib/crm/schedulingIntelligence";
import type { CompanyRecord, CrmSnapshot } from "../lib/crm/types";

type SchedulingIntelligencePanelProps = {
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  activeCompanyId: CompanyScopeId;
  onOpenTarget: (view: SchedulingTargetView) => void;
};

type SchedulingSummaryCard = {
  id: string;
  label: string;
  value: number;
  detail: string;
  tone: "blue" | "green" | "amber" | "red";
  icon: typeof CalendarClock;
};

export function SchedulingIntelligencePanel({
  snapshot,
  companyMap,
  activeCompanyId,
  onOpenTarget,
}: SchedulingIntelligencePanelProps) {
  const intelligence = useMemo(() => buildSchedulingIntelligence(snapshot), [snapshot]);
  const companyId = activeCompanyId === "all" ? "all" : activeCompanyId;
  const todaySchedule = filterSchedulingByCompany(intelligence.todaySchedule, companyId);
  const tomorrowSchedule = filterSchedulingByCompany(intelligence.tomorrowSchedule, companyId);
  const unassignedJobs = filterSchedulingByCompany(intelligence.unassignedJobs, companyId);
  const schedulingConflicts = filterSchedulingByCompany(
    intelligence.schedulingConflicts,
    companyId,
  );
  const overbookedEmployees = filterSchedulingByCompany(
    intelligence.overbookedEmployees,
    companyId,
  );
  const availableCapacity = filterSchedulingByCompany(
    intelligence.availableCapacity,
    companyId,
  );
  const upcomingInspections = filterSchedulingByCompany(
    intelligence.upcomingInspections,
    companyId,
  );
  const productionQueue = filterSchedulingByCompany(intelligence.productionQueue, companyId);
  const alerts = filterSchedulingByCompany(intelligence.alerts, companyId);
  const scopeLabel =
    activeCompanyId === "all"
      ? "All Companies"
      : companyMap.get(activeCompanyId)?.name ?? "Selected company";
  const summaryCards: SchedulingSummaryCard[] = [
    {
      id: "today",
      label: "Today's Schedule",
      value: todaySchedule.length,
      detail: "Jobs, inspections, and calendar work",
      tone: todaySchedule.length ? "blue" : "green",
      icon: CalendarClock,
    },
    {
      id: "unassigned",
      label: "Unassigned Jobs",
      value: unassignedJobs.length,
      detail: "Missing crew or estimator",
      tone: unassignedJobs.length ? "amber" : "green",
      icon: Users,
    },
    {
      id: "conflicts",
      label: "Scheduling Conflicts",
      value: schedulingConflicts.length,
      detail: "Double-booking and timing risks",
      tone: schedulingConflicts.length ? "red" : "green",
      icon: AlertTriangle,
    },
    {
      id: "capacity",
      label: "Available Capacity",
      value: availableCapacity.filter((item) => item.available).length,
      detail: "Open employee and crew capacity",
      tone: availableCapacity.some((item) => item.available) ? "green" : "amber",
      icon: CheckCircle2,
    },
  ];

  return (
    <section
      className="rounded-2xl border border-wt-border bg-wt-surface p-4 shadow-[var(--wt-shadow)]"
      data-testid="scheduling-intelligence-dispatch"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-purple-700">
            Scheduling Intelligence
          </p>
          <h3 className="mt-1 text-xl font-bold tracking-tight text-wt-ink">
            Operations Dispatch workspace
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-wt-muted">
            Dispatch intelligence from existing jobs, inspections, employees,
            crew labels, schedule events, documents, properties, and material
            orders. Technician availability, crew availability, property context,
            and future routing optimization can plug into this layer without changing
            the current CRM workflows.
          </p>
        </div>
        <div className="grid gap-2 rounded-xl border border-wt-border bg-wt-surface-muted p-3 text-sm">
          <p className="font-bold text-wt-ink">{scopeLabel}</p>
          <p className="text-wt-muted">
            {alerts.length} scheduling alert{alerts.length === 1 ? "" : "s"} feed
            the Operations Queue.
          </p>
          <button
            type="button"
            onClick={() => onOpenTarget("calendar")}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-purple-700 px-3 py-2 text-sm font-bold text-white transition hover:bg-purple-800 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <CalendarClock className="h-4 w-4" />
            Open Calendar
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <SchedulingSummaryCard key={card.id} card={card} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div className="grid gap-4">
          <SchedulingWorkSection
            testId="scheduling-today-schedule"
            eyebrow="Today"
            title="Today's Schedule"
            detail="Current-day jobs, inspections, and calendar work."
            items={todaySchedule}
            emptyLabel="No scheduled work for today."
            onOpenTarget={onOpenTarget}
          />
          <SchedulingWorkSection
            testId="scheduling-tomorrow"
            eyebrow="Tomorrow"
            title="Tomorrow"
            detail="Next-day dispatch preparation."
            items={tomorrowSchedule}
            emptyLabel="No scheduled work for tomorrow."
            onOpenTarget={onOpenTarget}
          />
          <SchedulingWorkSection
            testId="scheduling-production-queue"
            eyebrow="Production"
            title="Production Queue"
            detail="Open jobs that need scheduling, crew coverage, or readiness review."
            items={productionQueue}
            emptyLabel="No production queue records for this company scope."
            onOpenTarget={onOpenTarget}
          />
        </div>

        <aside className="grid gap-4">
          <SchedulingAlertSection
            testId="scheduling-conflicts"
            title="Scheduling Conflicts"
            detail="Double booking, customer conflicts, travel-time reviews, and production timing risks."
            alerts={schedulingConflicts}
            emptyLabel="No scheduling conflicts detected."
            onOpenTarget={onOpenTarget}
          />
          <SchedulingCapacitySection
            testId="scheduling-overbooked-employees"
            title="Overbooked Employees"
            detail="Employees or crews with more than one current-day assignment."
            items={overbookedEmployees}
            emptyLabel="No overbooked employees or crews detected."
          />
          <SchedulingCapacitySection
            testId="scheduling-available-capacity"
            title="Available Capacity"
            detail="Active employees and crews without a current-day assignment."
            items={availableCapacity.filter((item) => item.available).slice(0, 6)}
            emptyLabel="No open capacity is visible for this scope."
          />
        </aside>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SchedulingWorkSection
          testId="scheduling-unassigned-jobs"
          eyebrow="Assignment"
          title="Unassigned Jobs"
          detail="Jobs missing crew or estimator coverage."
          items={unassignedJobs}
          emptyLabel="Every visible job has crew and estimator coverage."
          onOpenTarget={onOpenTarget}
        />
        <SchedulingWorkSection
          testId="scheduling-upcoming-inspections"
          eyebrow="Inspections"
          title="Upcoming Inspections"
          detail="Scheduled inspection work in the next seven days."
          items={upcomingInspections}
          emptyLabel="No upcoming inspections in the next seven days."
          onOpenTarget={onOpenTarget}
        />
      </div>

      <SchedulingAlertSection
        testId="scheduling-alerts"
        title="Operations Queue Integration"
        detail="All scheduling intelligence alerts become routable Operations Queue signals."
        alerts={alerts.slice(0, 8)}
        emptyLabel="No scheduling alerts are currently feeding the queue."
        onOpenTarget={onOpenTarget}
        className="mt-4"
      />
    </section>
  );
}

function SchedulingSummaryCard({ card }: { card: SchedulingSummaryCard }) {
  const Icon = card.icon;

  return (
    <div
      className={`rounded-xl border p-3 ${surfaceClass(card.tone)}`}
      data-testid={`scheduling-summary-${card.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-80">
            {card.label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight">{card.value}</p>
          <p className="mt-1 text-xs font-semibold opacity-80">{card.detail}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 opacity-75" />
      </div>
    </div>
  );
}

function SchedulingWorkSection({
  testId,
  eyebrow,
  title,
  detail,
  items,
  emptyLabel,
  onOpenTarget,
}: {
  testId: string;
  eyebrow: string;
  title: string;
  detail: string;
  items: SchedulingWorkItem[];
  emptyLabel: string;
  onOpenTarget: (view: SchedulingTargetView) => void;
}) {
  return (
    <section
      className="rounded-xl border border-wt-border bg-wt-surface-muted p-3"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-wt-muted">
            {eyebrow}
          </p>
          <h4 className="mt-1 text-base font-bold text-wt-ink">{title}</h4>
          <p className="mt-1 text-sm text-wt-muted">{detail}</p>
        </div>
        <StatusPill label={String(items.length)} tone={items.length ? "blue" : "green"} />
      </div>
      <div className="mt-3 grid gap-2">
        {items.slice(0, 6).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpenTarget(item.targetView)}
            className="rounded-lg border border-wt-border bg-wt-surface p-3 text-left transition hover:border-purple-200 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-300"
            data-testid="scheduling-work-row"
            data-target-view={item.targetView}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={item.sourceModule} tone="slate" />
                  <StatusPill label={item.companyName} tone={item.companyName.includes("IHC") ? "amber" : "blue"} />
                  <StatusPill label={item.workflowStage} tone={item.workflowStage === "Blocked" ? "amber" : "blue"} />
                </div>
                <p className="mt-2 break-words text-sm font-bold text-wt-ink">{item.title}</p>
                <p className="mt-1 break-words text-sm text-wt-muted">
                  {item.customerName} · {item.propertyLabel}
                </p>
                <div className="mt-2 grid gap-1 text-xs font-semibold text-wt-muted md:grid-cols-2">
                  <IconLine icon={CalendarClock} value={formatDateRange(item.startAt, item.endAt)} />
                  <IconLine icon={MapPin} value={item.address} />
                  <IconLine icon={Users} value={`${item.crew} · ${item.estimator}`} />
                  <IconLine icon={Package} value={`Roof system: ${item.roofType}`} />
                  <IconLine icon={Search} value={`Inspection: ${item.inspectionStatus}`} />
                  <IconLine icon={FileText} value={item.requiredDocuments.length ? item.requiredDocuments.join(", ") : "Required documents clear"} />
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-orange-700" />
            </div>
          </button>
        ))}
        {!items.length ? <InlineEmptyState label={emptyLabel} /> : null}
      </div>
    </section>
  );
}

function SchedulingAlertSection({
  testId,
  title,
  detail,
  alerts,
  emptyLabel,
  onOpenTarget,
  className = "",
}: {
  testId: string;
  title: string;
  detail: string;
  alerts: SchedulingAlert[];
  emptyLabel: string;
  onOpenTarget: (view: SchedulingTargetView) => void;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-wt-border bg-wt-surface-muted p-3 ${className}`}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-wt-ink">{title}</h4>
          <p className="mt-1 text-sm text-wt-muted">{detail}</p>
        </div>
        <StatusPill label={alerts.length ? `${alerts.length} alerts` : "Clear"} tone={alerts.length ? "amber" : "green"} />
      </div>
      <div className="mt-3 grid gap-2">
        {alerts.map((alert) => (
          <button
            key={alert.id}
            type="button"
            onClick={() => onOpenTarget(alert.targetView)}
            className="rounded-lg border border-wt-border bg-wt-surface p-3 text-left transition hover:border-orange-200 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-orange-300"
            data-testid="scheduling-alert-row"
            data-priority={alert.priority}
            data-target-view={alert.targetView}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill label={alert.priority} tone={alert.priority === "critical" ? "red" : alert.priority === "high" ? "amber" : "blue"} />
                  <StatusPill label={alert.sourceModule} tone="slate" />
                </div>
                <p className="mt-2 break-words text-sm font-bold text-wt-ink">{alert.title}</p>
                <p className="mt-1 break-words text-sm text-wt-muted">{alert.detail}</p>
                <p className="mt-2 break-words text-xs font-bold uppercase tracking-[0.08em] text-orange-700">
                  {alert.suggestedNextAction}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-orange-700" />
            </div>
          </button>
        ))}
        {!alerts.length ? <InlineEmptyState label={emptyLabel} /> : null}
      </div>
    </section>
  );
}

function SchedulingCapacitySection({
  testId,
  title,
  detail,
  items,
  emptyLabel,
}: {
  testId: string;
  title: string;
  detail: string;
  items: SchedulingCapacityItem[];
  emptyLabel: string;
}) {
  return (
    <section
      className="rounded-xl border border-wt-border bg-wt-surface-muted p-3"
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-bold text-wt-ink">{title}</h4>
          <p className="mt-1 text-sm text-wt-muted">{detail}</p>
        </div>
        <StatusPill label={String(items.length)} tone={items.length ? "blue" : "green"} />
      </div>
      <div className="mt-3 grid gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-wt-border bg-wt-surface p-3"
            data-testid="scheduling-capacity-row"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-wt-ink">{item.label}</p>
                <p className="mt-1 text-xs font-semibold uppercase text-wt-muted">
                  {item.companyName} · {item.role}
                </p>
                <p className="mt-2 text-sm text-wt-muted">{item.detail}</p>
              </div>
              <StatusPill label={item.available ? "Available" : "Booked"} tone={item.available ? "green" : "amber"} />
            </div>
          </div>
        ))}
        {!items.length ? <InlineEmptyState label={emptyLabel} /> : null}
      </div>
    </section>
  );
}

function IconLine({
  icon: Icon,
  value,
}: {
  icon: typeof Search;
  value: string;
}) {
  return (
    <span className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wt-muted" />
      <span className="min-w-0 break-words">{value}</span>
    </span>
  );
}

function InlineEmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-wt-border bg-wt-surface p-3 text-sm font-semibold text-wt-muted">
      {label}
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "blue" | "green" | "amber" | "red" | "slate";
}) {
  return (
    <span className={`inline-flex w-fit items-center rounded-md px-2.5 py-1 text-xs font-bold capitalize ${pillClass(tone)}`}>
      {label}
    </span>
  );
}

function surfaceClass(tone: "blue" | "green" | "amber" | "red") {
  return {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-sky-200 bg-sky-50 text-sky-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
  }[tone];
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

function formatDateRange(startAt: string | null, endAt: string | null) {
  if (!startAt && !endAt) {
    return "Schedule needed";
  }

  if (startAt && endAt) {
    return `${formatDateTime(startAt)} - ${formatTime(endAt)}`;
  }

  return formatDateTime(startAt ?? endAt ?? "");
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
