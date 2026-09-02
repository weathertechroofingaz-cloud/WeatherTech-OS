import type {
  AutomationExecutionRecord,
  AutomationExecutionStatus,
  AutomationRuleRecord,
  CompanyMembershipRecord,
  CrmSnapshot,
} from "./types";

export type AutomationControlTone = "blue" | "green" | "amber" | "red" | "slate";

export const AUTOMATION_RECENT_TERMINAL_LIMIT = 25;

export const automationExecutionStatusLabels: Record<
  AutomationExecutionStatus,
  string
> = {
  queued: "Queued",
  awaiting_approval: "Awaiting approval",
  running: "Running",
  retry_scheduled: "Retry scheduled",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export function getAutomationExecutionTone(
  status: AutomationExecutionStatus,
): AutomationControlTone {
  if (status === "succeeded") return "green";
  if (status === "failed") return "red";
  if (status === "awaiting_approval" || status === "retry_scheduled") {
    return "amber";
  }
  if (status === "queued" || status === "running") return "blue";
  return "slate";
}

export function formatAutomationKey(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function canManageAutomationForCompany(
  memberships: CompanyMembershipRecord[],
  userId: string | null,
  companyId: string,
) {
  if (!userId) return false;

  return memberships.some(
    (membership) =>
      membership.user_id === userId &&
      membership.company_id === companyId &&
      (membership.role === "owner" ||
        membership.role === "admin" ||
        membership.can_manage_settings),
  );
}

export function canReviewAutomationExecution(execution: AutomationExecutionRecord) {
  return (
    execution.status === "awaiting_approval" &&
    execution.approval_status === "pending"
  );
}

export function canCancelAutomationExecution(execution: AutomationExecutionRecord) {
  return ["queued", "awaiting_approval", "retry_scheduled"].includes(
    execution.status,
  );
}

export function canRetryAutomationExecution(
  execution: AutomationExecutionRecord,
  rule: AutomationRuleRecord | null,
) {
  return (
    execution.status === "failed" &&
    execution.attempt_count < 10 &&
    rule?.enabled === true &&
    rule.version === execution.rule_version
  );
}

export function isAutomationExecutionActionable(
  execution: AutomationExecutionRecord,
  rule: AutomationRuleRecord | null,
) {
  return (
    canReviewAutomationExecution(execution) ||
    canCancelAutomationExecution(execution) ||
    canRetryAutomationExecution(execution, rule)
  );
}

export function isAutomationExecutionTerminal(
  execution: AutomationExecutionRecord,
) {
  return ["succeeded", "failed", "cancelled", "rejected"].includes(
    execution.status,
  );
}

export function buildAutomationControlCenterModel(
  snapshot: CrmSnapshot,
  userId: string | null,
) {
  const companyLocations = snapshot.companyLocations ?? [];
  const automationRules = snapshot.automationRules ?? [];
  const automationEvents = snapshot.automationEvents ?? [];
  const automationExecutions = snapshot.automationExecutions ?? [];
  const automationAttempts = snapshot.automationAttempts ?? [];
  const automationAuditEvents = snapshot.automationAuditEvents ?? [];
  const companyById = new Map(snapshot.companies.map((company) => [company.id, company]));
  const locationById = new Map(
    companyLocations.map((location) => [location.id, location]),
  );
  const ruleById = new Map(automationRules.map((rule) => [rule.id, rule]));
  const eventById = new Map(automationEvents.map((event) => [event.id, event]));
  const attemptsByExecutionId = new Map<string, typeof automationAttempts>();
  const auditByExecutionId = new Map<string, typeof automationAuditEvents>();
  const latestExecutionByRuleId = new Map<string, AutomationExecutionRecord>();

  automationExecutions.forEach((execution) => {
    const current = latestExecutionByRuleId.get(execution.rule_id);
    if (!current || Date.parse(execution.updated_at) > Date.parse(current.updated_at)) {
      latestExecutionByRuleId.set(execution.rule_id, execution);
    }
  });
  automationAttempts.forEach((attempt) => {
    const attempts = attemptsByExecutionId.get(attempt.execution_id) ?? [];
    attempts.push(attempt);
    attemptsByExecutionId.set(attempt.execution_id, attempts);
  });
  automationAuditEvents.forEach((auditEvent) => {
    if (!auditEvent.execution_id) return;
    const auditEvents = auditByExecutionId.get(auditEvent.execution_id) ?? [];
    auditEvents.push(auditEvent);
    auditByExecutionId.set(auditEvent.execution_id, auditEvents);
  });

  const rules = automationRules.map((rule) => ({
    rule,
    company: companyById.get(rule.company_id) ?? null,
    location: rule.company_location_id
      ? locationById.get(rule.company_location_id) ?? null
      : null,
    canManage: canManageAutomationForCompany(
      snapshot.companyMemberships,
      userId,
      rule.company_id,
    ),
    lastExecution: latestExecutionByRuleId.get(rule.id) ?? null,
  }));

  const executions = [...automationExecutions]
    .sort(
      (left, right) =>
        Date.parse(right.updated_at) - Date.parse(left.updated_at),
    )
    .map((execution) => ({
      execution,
      company: companyById.get(execution.company_id) ?? null,
      location: execution.company_location_id
        ? locationById.get(execution.company_location_id) ?? null
        : null,
      rule: ruleById.get(execution.rule_id) ?? null,
      event: eventById.get(execution.event_id) ?? null,
      attempts: [...(attemptsByExecutionId.get(execution.id) ?? [])].sort(
        (left, right) => right.attempt_number - left.attempt_number,
      ),
      auditEvents: [...(auditByExecutionId.get(execution.id) ?? [])].sort(
        (left, right) => Date.parse(right.created_at) - Date.parse(left.created_at),
      ),
      canManage: canManageAutomationForCompany(
        snapshot.companyMemberships,
        userId,
        execution.company_id,
      ),
    }));
  const actionableExecutions = executions.filter(({ execution, rule }) =>
    isAutomationExecutionActionable(execution, rule),
  );
  const actionableExecutionIds = new Set(
    actionableExecutions.map(({ execution }) => execution.id),
  );
  const inProgressExecutions = executions.filter(
    ({ execution }) => execution.status === "running",
  );
  const recentTerminalExecutions = executions
    .filter(
      ({ execution }) =>
        !actionableExecutionIds.has(execution.id) &&
        isAutomationExecutionTerminal(execution),
    )
    .slice(0, AUTOMATION_RECENT_TERMINAL_LIMIT);

  return {
    rules,
    executions,
    actionableExecutions,
    inProgressExecutions,
    recentTerminalExecutions,
    recentTerminalLimit: AUTOMATION_RECENT_TERMINAL_LIMIT,
    counts: {
      rules: rules.length,
      enabled: rules.filter(({ rule }) => rule.enabled).length,
      awaitingApproval: executions.filter(({ execution }) =>
        canReviewAutomationExecution(execution),
      ).length,
      needsAttention: executions.filter(({ execution }) =>
        ["failed", "retry_scheduled"].includes(execution.status),
      ).length,
    },
  };
}
