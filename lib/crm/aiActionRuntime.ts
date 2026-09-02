import type { AiActionType, AiSourceRecord } from "./aiTools";
import type { CompanyMembershipRole } from "./types";

export const AI_ACTION_CONTRACT_VERSION = 1;

const companyMembershipRoles = new Set<CompanyMembershipRole>([
  "owner",
  "admin",
  "office",
  "sales",
  "production",
  "field",
  "technician",
  "viewer",
  "team_member",
  "customer_portal",
  "employee_portal",
]);

const internalAiRoles = new Set<CompanyMembershipRole>([
  "owner",
  "admin",
  "office",
  "sales",
  "production",
  "field",
  "technician",
  "viewer",
  "team_member",
]);

const actionTargetTables: Record<AiActionType, ReadonlySet<string>> = {
  open_record: new Set([
    "leads",
    "customers",
    "estimates",
    "estimate_proposal_revisions",
    "jobs",
    "schedule_events",
    "inspections",
    "documents",
    "invoices",
    "material_orders",
    "integration_sync_logs",
    "email_messages",
    "sms_messages",
    "call_records",
  ]),
  draft_scope: new Set(["scope_templates", "customers", "leads"]),
  draft_proposal: new Set(["estimates", "estimate_proposal_revisions"]),
  draft_email: new Set(["email_messages", "invoices", "estimates"]),
  draft_sms: new Set([
    "sms_messages",
    "email_messages",
    "call_records",
    "jobs",
    "leads",
    "customers",
  ]),
  create_follow_up_draft: new Set([
    "leads",
    "estimates",
  ]),
  prepare_schedule_change: new Set(["jobs", "schedule_events", "inspections"]),
  prepare_job_conversion: new Set([
    "leads",
    "estimates",
    "estimate_proposal_revisions",
  ]),
  prepare_invoice_draft: new Set([
    "jobs",
    "estimates",
    "estimate_proposal_revisions",
    "invoices",
  ]),
  prepare_change_order_draft: new Set(["jobs", "estimates"]),
  prepare_customer_summary: new Set(["customers"]),
  prepare_inspection_report: new Set(["inspections"]),
  prepare_document_summary: new Set(["documents"]),
};

const aiActionTypes = new Set<AiActionType>(
  Object.keys(actionTargetTables) as AiActionType[],
);

const approvableActionTargetTables = new Map<AiActionType, ReadonlySet<string>>([
  ["create_follow_up_draft", actionTargetTables.create_follow_up_draft],
]);

export type AiCompanyMembershipInput = {
  user_id: string;
  company_id: string;
  role: unknown;
};

export type ExactAiCompanyAuthorization =
  | {
      ok: true;
      companyId: string;
      role: CompanyMembershipRole;
    }
  | {
      ok: false;
      status: 400 | 403;
      code:
        | "exact_company_required"
        | "company_membership_required"
        | "ambiguous_company_membership"
        | "unsupported_membership_role"
        | "internal_role_required";
      message: string;
    };

export function resolveExactAiCompanyAuthorization({
  memberships,
  userId,
  requestedCompanyId,
}: {
  memberships: AiCompanyMembershipInput[];
  userId: string;
  requestedCompanyId: unknown;
}): ExactAiCompanyAuthorization {
  if (
    typeof requestedCompanyId !== "string" ||
    !requestedCompanyId.trim() ||
    requestedCompanyId.trim() === "all"
  ) {
    return {
      ok: false,
      status: 400,
      code: "exact_company_required",
      message: "Select one exact company before using controlled AI Tools.",
    };
  }

  const companyId = requestedCompanyId.trim();
  const exactMemberships = memberships.filter(
    (membership) =>
      membership.user_id === userId && membership.company_id === companyId,
  );

  if (exactMemberships.length === 0) {
    return {
      ok: false,
      status: 403,
      code: "company_membership_required",
      message: "An exact company membership is required before using controlled AI Tools.",
    };
  }

  if (exactMemberships.length !== 1) {
    return {
      ok: false,
      status: 403,
      code: "ambiguous_company_membership",
      message: "The company membership is ambiguous. AI Tools did not run.",
    };
  }

  const role = exactMemberships[0]?.role;
  if (typeof role !== "string" || !companyMembershipRoles.has(role as CompanyMembershipRole)) {
    return {
      ok: false,
      status: 403,
      code: "unsupported_membership_role",
      message: "The company membership role is not supported by controlled AI Tools.",
    };
  }

  if (!internalAiRoles.has(role as CompanyMembershipRole)) {
    return {
      ok: false,
      status: 403,
      code: "internal_role_required",
      message: "Controlled AI Tools are restricted to internal company memberships.",
    };
  }

  return {
    ok: true,
    companyId,
    role: role as CompanyMembershipRole,
  };
}

export type ProviderActionCandidate = {
  label?: unknown;
  reason?: unknown;
  actionType?: unknown;
  targetTable?: unknown;
  targetId?: unknown;
};

export type ValidatedProviderAction = {
  label: string;
  reason: string;
  actionType: AiActionType;
  target: AiSourceRecord;
};

export function validateProviderActionCandidate({
  candidate,
  contextRecords,
  expectedCompanyId,
}: {
  candidate: ProviderActionCandidate;
  contextRecords: AiSourceRecord[];
  expectedCompanyId: string | null;
}): ValidatedProviderAction | null {
  if (
    !isNonEmptyString(candidate.label) ||
    !isNonEmptyString(candidate.reason) ||
    !isAiActionType(candidate.actionType) ||
    !isNonEmptyString(candidate.targetTable) ||
    !isNonEmptyString(candidate.targetId)
  ) {
    return null;
  }

  if (!actionTargetTables[candidate.actionType].has(candidate.targetTable)) {
    return null;
  }

  const target = contextRecords.find(
    (record) =>
      record.table === candidate.targetTable && record.id === candidate.targetId,
  );
  if (!target?.companyId) {
    return null;
  }

  if (expectedCompanyId && target.companyId !== expectedCompanyId) {
    return null;
  }

  return {
    label: candidate.label.trim(),
    reason: candidate.reason.trim(),
    actionType: candidate.actionType,
    target,
  };
}

export type StoredAiActionPreview = {
  id: string;
  actionType: AiActionType;
  targetRecord: AiSourceRecord;
  companyId: string;
  confirmationRequired: true;
};

export function validateStoredAiActionPreview({
  value,
  expectedActionType,
  expectedCompanyId,
}: {
  value: unknown;
  expectedActionType: unknown;
  expectedCompanyId: string;
}): StoredAiActionPreview | null {
  if (!value || typeof value !== "object" || !isAiActionType(expectedActionType)) {
    return null;
  }

  const preview = value as Record<string, unknown>;
  const targetValue = preview.targetRecord;
  if (!targetValue || typeof targetValue !== "object") {
    return null;
  }
  const target = targetValue as Record<string, unknown>;

  if (
    !isNonEmptyString(preview.id) ||
    preview.actionType !== expectedActionType ||
    preview.companyId !== expectedCompanyId ||
    preview.confirmationRequired !== true ||
    !isNonEmptyString(target.table) ||
    !isNonEmptyString(target.id)
  ) {
    return null;
  }

  return {
    id: preview.id.trim(),
    actionType: expectedActionType,
    targetRecord: targetValue as AiSourceRecord,
    companyId: expectedCompanyId,
    confirmationRequired: true,
  };
}

export function isAiActionType(value: unknown): value is AiActionType {
  return typeof value === "string" && aiActionTypes.has(value as AiActionType);
}

export function isApprovableAiActionTarget(
  actionType: AiActionType,
  targetTable: string,
) {
  return approvableActionTargetTables.get(actionType)?.has(targetTable) ?? false;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
