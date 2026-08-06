import type {
  CompanyMembershipRecord,
  OfficeTaskPriority,
  OfficeTaskRecord,
  OfficeTaskStatus,
  OfficeTaskUpdate,
} from "./types";

export type OfficeTaskTiming = "overdue" | "today" | "upcoming" | "completed";

export type OfficeTaskFilters = {
  assignedEmployeeId?: string | "all" | "unassigned";
  priority?: OfficeTaskPriority | "all";
  search?: string;
};

export type OfficeTaskSections = Record<OfficeTaskTiming, OfficeTaskRecord[]>;

const priorityRank: Record<OfficeTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const officeTaskManagerRoles = new Set<CompanyMembershipRecord["role"]>([
  "owner",
  "admin",
  "office",
  "sales",
  "production",
  "field",
  "technician",
  "team_member",
]);

export const officeTaskPriorityLabels: Record<OfficeTaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const officeTaskStatusLabels: Record<OfficeTaskStatus, string> = {
  open: "Open",
  snoozed: "Snoozed",
  completed: "Completed",
};

export function canManageOfficeTask(
  memberships: CompanyMembershipRecord[],
  userId: string,
  companyId: string,
) {
  return memberships.some(
    (membership) =>
      membership.user_id === userId &&
      membership.company_id === companyId &&
      (officeTaskManagerRoles.has(membership.role) ||
        membership.can_manage_settings ||
        membership.can_manage_production),
  );
}

export function getOfficeTaskEffectiveDueAt(task: OfficeTaskRecord) {
  return task.status === "snoozed" && task.snoozed_until
    ? task.snoozed_until
    : task.due_at;
}

export function filterOfficeTasks(
  tasks: OfficeTaskRecord[],
  filters: OfficeTaskFilters,
) {
  const search = normalizeSearch(filters.search ?? "");

  return tasks.filter((task) => {
    if (filters.assignedEmployeeId && filters.assignedEmployeeId !== "all") {
      if (
        filters.assignedEmployeeId === "unassigned"
          ? task.assigned_employee_id !== null
          : task.assigned_employee_id !== filters.assignedEmployeeId
      ) {
        return false;
      }
    }

    if (
      filters.priority &&
      filters.priority !== "all" &&
      task.priority !== filters.priority
    ) {
      return false;
    }

    if (!search) {
      return true;
    }

    return normalizeSearch(`${task.title} ${task.notes ?? ""}`).includes(search);
  });
}

export function groupOfficeTasks(
  tasks: OfficeTaskRecord[],
  options: { now?: Date; timeZone?: string } = {},
): OfficeTaskSections {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? "America/Phoenix";
  const today = dateKey(now, timeZone);
  const sections: OfficeTaskSections = {
    overdue: [],
    today: [],
    upcoming: [],
    completed: [],
  };

  tasks.forEach((task) => {
    if (task.status === "completed") {
      sections.completed.push(task);
      return;
    }

    const dueKey = dateKey(new Date(getOfficeTaskEffectiveDueAt(task)), timeZone);

    if (dueKey < today) {
      sections.overdue.push(task);
    } else if (dueKey === today) {
      sections.today.push(task);
    } else {
      sections.upcoming.push(task);
    }
  });

  sections.overdue.sort(compareOfficeTasks);
  sections.today.sort(compareOfficeTasks);
  sections.upcoming.sort(compareOfficeTasks);
  sections.completed.sort(
    (left, right) =>
      Date.parse(right.completed_at ?? right.updated_at) -
      Date.parse(left.completed_at ?? left.updated_at),
  );

  return sections;
}

export function buildOfficeTaskActionUpdate(
  action: "complete" | "reopen" | "snooze",
  options: { now?: Date; snoozeDays?: number } = {},
): OfficeTaskUpdate {
  const now = options.now ?? new Date();

  if (action === "complete") {
    return {
      status: "completed",
      completed_at: now.toISOString(),
      snoozed_until: null,
    };
  }

  if (action === "snooze") {
    const snoozedUntil = new Date(now);
    snoozedUntil.setDate(snoozedUntil.getDate() + (options.snoozeDays ?? 1));

    return {
      status: "snoozed",
      completed_at: null,
      snoozed_until: snoozedUntil.toISOString(),
    };
  }

  return {
    status: "open",
    completed_at: null,
    snoozed_until: null,
  };
}

function compareOfficeTasks(left: OfficeTaskRecord, right: OfficeTaskRecord) {
  const dueDelta =
    Date.parse(getOfficeTaskEffectiveDueAt(left)) -
    Date.parse(getOfficeTaskEffectiveDueAt(right));

  if (dueDelta !== 0) {
    return dueDelta;
  }

  return priorityRank[left.priority] - priorityRank[right.priority];
}

function dateKey(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";

  return `${year}-${month}-${day}`;
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
