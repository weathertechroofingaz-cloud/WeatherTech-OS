import type {
  ChangeOrderRecord,
  CrmSnapshot,
  DocumentRecord,
  EstimateRecord,
  InspectionRecord,
  InvoiceRecord,
  JobRecord,
  LeadRecord,
  LeadPriority,
  MaterialOrderRecord,
  NotificationRecord,
  SignatureRecord,
} from "./types";
import {
  getJobDisplayAddress,
  getJobScheduledEnd,
  getJobScheduledStart,
} from "./jobs";
import { buildFieldOperationsSnapshot } from "./fieldOperations";
import {
  buildSchedulingIntelligence,
  type SchedulingAlert,
} from "./schedulingIntelligence";

export type OperationsQueuePriority = "critical" | "high" | "medium" | "low";

export type OperationsQueueCategory =
  | "lead"
  | "estimate"
  | "inspection"
  | "job"
  | "document"
  | "invoice"
  | "warranty"
  | "material"
  | "signature"
  | "change_order"
  | "communication"
  | "dispatch"
  | "permit"
  | "office_task"
  | "property";

export type OperationsQueueWorkflow =
  | "lead"
  | "customer"
  | "estimate"
  | "inspection"
  | "job"
  | "production"
  | "documents"
  | "invoice"
  | "property"
  | "communications"
  | "calendar";

export type OperationsQueueStatus =
  | "open"
  | "overdue"
  | "today"
  | "upcoming"
  | "completed";

export type OperationsQueueTargetView =
  | "operations"
  | "fieldOperations"
  | "inbox"
  | "leadIntake"
  | "salesPipeline"
  | "leads"
  | "customers"
  | "estimates"
  | "jobs"
  | "inspections"
  | "calendar"
  | "invoices"
  | "orders"
  | "documents"
  | "changeOrders"
  | "notifications";

export type OperationsQueueItem = {
  id: string;
  priority: OperationsQueuePriority;
  companyId: string;
  customerId: string | null;
  customerName: string;
  propertyId: string | null;
  propertyLabel: string;
  category: OperationsQueueCategory;
  assignedOwner: string;
  dueAt: string | null;
  ageDays: number;
  currentWorkflowStage: string;
  sourceModule: string;
  sourceRecordId: string;
  status: OperationsQueueStatus;
  suggestedNextAction: string;
  title: string;
  detail: string;
  workflow: OperationsQueueWorkflow;
  targetView: OperationsQueueTargetView;
};

export type OperationsQueueFilters = {
  companyId?: string;
  assignedOwner?: string;
  priority?: OperationsQueuePriority | "all";
  category?: OperationsQueueCategory | "all";
  workflow?: OperationsQueueWorkflow | "all";
  timing?: OperationsQueueTimingFilter;
  search?: string;
};

export type OperationsQueueTimingFilter =
  | "all"
  | "overdue"
  | "today"
  | "upcoming"
  | "completed";

type QueueContext = {
  now: Date;
  today: string;
  tomorrow: string;
  customersById: Map<string, CustomerLike>;
  leadsById: Map<string, LeadRecord>;
  jobsById: Map<string, JobRecord>;
  estimatesById: Map<string, EstimateRecord>;
  documentsById: Map<string, DocumentRecord>;
  employeesById: Map<string, string>;
  propertiesById: Map<string, PropertyLike>;
};

type CustomerLike = {
  id: string;
  display_name: string;
  property_address: string;
};

type PropertyLike = {
  id: string;
  display_name: string;
  address: string;
};

type OperationsQueueBuilder = {
  id: string;
  build: (snapshot: CrmSnapshot, context: QueueContext) => OperationsQueueItem[];
};

type QueueItemInput = Omit<OperationsQueueItem, "ageDays" | "status"> & {
  createdAt?: string | null;
  status?: OperationsQueueStatus;
};

export const operationsQueuePriorityLabels: Record<OperationsQueuePriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const operationsQueueCategoryLabels: Record<OperationsQueueCategory, string> = {
  change_order: "Change order",
  communication: "Communication",
  document: "Document",
  dispatch: "Dispatch",
  estimate: "Estimate",
  inspection: "Inspection",
  invoice: "Invoice",
  job: "Job",
  lead: "Lead",
  material: "Material",
  office_task: "Office task",
  permit: "Permit",
  property: "Property",
  signature: "Signature",
  warranty: "Warranty",
};

export const operationsQueueWorkflowLabels: Record<OperationsQueueWorkflow, string> = {
  calendar: "Calendar",
  communications: "Communications",
  customer: "Customer",
  documents: "Documents",
  estimate: "Estimate",
  inspection: "Inspection",
  invoice: "Invoice",
  job: "Job",
  lead: "Lead",
  production: "Production",
  property: "Property",
};

const priorityRank: Record<OperationsQueuePriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const queueBuilders: OperationsQueueBuilder[] = [
  { id: "new-leads", build: buildNewLeadItems },
  { id: "customer-follow-ups", build: buildCustomerFollowUpItems },
  { id: "estimate-approvals", build: buildEstimateApprovalItems },
  { id: "signature-requests", build: buildSignatureItems },
  { id: "inspection-scheduling", build: buildInspectionItems },
  { id: "job-scheduling", build: buildJobSchedulingItems },
  { id: "dispatch-conflicts", build: buildDispatchConflictItems },
  { id: "scheduling-intelligence", build: buildSchedulingAlertItems },
  { id: "field-operations", build: buildFieldOperationsItems },
  { id: "documents-and-permits", build: buildDocumentAndPermitItems },
  { id: "materials", build: buildMaterialItems },
  { id: "invoices", build: buildInvoiceItems },
  { id: "change-orders", build: buildChangeOrderItems },
  { id: "communications", build: buildCommunicationItems },
  { id: "recent-closeout", build: buildRecentCloseoutItems },
];

export function buildOperationsQueue(
  snapshot: CrmSnapshot,
  options: { now?: Date } = {},
) {
  const context = createQueueContext(snapshot, options.now ?? new Date());
  const items = queueBuilders.flatMap((builder) => builder.build(snapshot, context));
  const deduped = [...new Map(items.map((item) => [item.id, item])).values()];

  return sortOperationsQueueItems(deduped);
}

export function sortOperationsQueueItems(items: OperationsQueueItem[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;

    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return right.ageDays - left.ageDays;
  });
}

export function filterOperationsQueueItems(
  items: OperationsQueueItem[],
  filters: OperationsQueueFilters,
) {
  const normalizedSearch = normalizeSearch(filters.search ?? "");

  return items.filter((item) => {
    if (filters.companyId && filters.companyId !== "all" && item.companyId !== filters.companyId) {
      return false;
    }

    if (
      filters.assignedOwner &&
      filters.assignedOwner !== "all" &&
      item.assignedOwner !== filters.assignedOwner
    ) {
      return false;
    }

    if (filters.priority && filters.priority !== "all" && item.priority !== filters.priority) {
      return false;
    }

    if (filters.category && filters.category !== "all" && item.category !== filters.category) {
      return false;
    }

    if (filters.workflow && filters.workflow !== "all" && item.workflow !== filters.workflow) {
      return false;
    }

    if (filters.timing && filters.timing !== "all" && item.status !== filters.timing) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return normalizeSearch(
      [
        item.title,
        item.detail,
        item.customerName,
        item.propertyLabel,
        item.currentWorkflowStage,
        item.sourceModule,
        item.suggestedNextAction,
      ].join(" "),
    ).includes(normalizedSearch);
  });
}

export function getOperationsQueueSummary(items: OperationsQueueItem[]) {
  return {
    total: items.length,
    critical: items.filter((item) => item.priority === "critical").length,
    high: items.filter((item) => item.priority === "high").length,
    overdue: items.filter((item) => item.status === "overdue").length,
    today: items.filter((item) => item.status === "today").length,
    completed: items.filter((item) => item.status === "completed").length,
  };
}

export function getOperationsQueueFilterOptions(items: OperationsQueueItem[]) {
  return {
    assignedOwners: uniqueSorted(
      items.map((item) => item.assignedOwner).filter((owner) => owner !== "Unassigned"),
    ),
    categories: uniqueSorted(items.map((item) => item.category)),
    workflows: uniqueSorted(items.map((item) => item.workflow)),
  };
}

function createQueueContext(snapshot: CrmSnapshot, now: Date): QueueContext {
  const today = now.toISOString().slice(0, 10);
  const tomorrowDate = new Date(now);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);

  return {
    now,
    today,
    tomorrow: tomorrowDate.toISOString().slice(0, 10),
    customersById: new Map(
      snapshot.customers.map((customer) => [
        customer.id,
        {
          id: customer.id,
          display_name: customer.display_name,
          property_address: customer.property_address,
        },
      ]),
    ),
    leadsById: new Map(snapshot.leads.map((lead) => [lead.id, lead])),
    jobsById: new Map(snapshot.jobs.map((job) => [job.id, job])),
    estimatesById: new Map(snapshot.estimates.map((estimate) => [estimate.id, estimate])),
    documentsById: new Map(snapshot.documents.map((document) => [document.id, document])),
    employeesById: new Map(snapshot.employees.map((employee) => [employee.id, employee.full_name])),
    propertiesById: new Map(
      snapshot.properties.map((property) => [
        property.id,
        {
          id: property.id,
          display_name: property.display_name,
          address: property.address,
        },
      ]),
    ),
  };
}

function buildNewLeadItems(snapshot: CrmSnapshot, context: QueueContext) {
  return snapshot.leads
    .filter((lead) =>
      lead.status !== "won" &&
      lead.status !== "lost" &&
      (lead.status === "new" || lead.pipeline_stage === "new_lead" || !lead.created_by),
    )
    .map((lead) =>
      createQueueItem(context, {
        id: `lead-assignment:${lead.id}`,
        priority: mapLeadPriority(lead.priority),
        companyId: lead.company_id,
        customerId: lead.customer_id,
        customerName: getLeadCustomerName(context, lead),
        propertyId: lead.property_id ?? null,
        propertyLabel: getRecordPropertyLabel(context, lead.property_id ?? null, lead.customer_id, lead.property_address),
        category: "lead",
        assignedOwner: lead.created_by ? "Assigned lead owner" : "Unassigned",
        dueAt: lead.next_follow_up ?? lead.created_at,
        createdAt: lead.created_at,
        currentWorkflowStage: leadStatusLabel(lead.status),
        sourceModule: "Leads",
        sourceRecordId: lead.id,
        suggestedNextAction: lead.created_by ? "Qualify lead and set next action" : "Assign owner and qualify lead",
        title: "New lead awaiting assignment",
        detail: `${lead.contact_name} requested ${serviceTypeLabel(lead.service_type)} from ${lead.source}.`,
        workflow: "lead",
        targetView: "leads",
      }),
    );
}

function buildCustomerFollowUpItems(snapshot: CrmSnapshot, context: QueueContext) {
  return snapshot.leads
    .filter(
      (lead) =>
        lead.status !== "won" &&
        lead.status !== "lost" &&
        lead.next_follow_up !== null &&
        lead.next_follow_up <= context.today,
    )
    .map((lead) =>
      createQueueItem(context, {
        id: `lead-follow-up:${lead.id}`,
        priority: lead.next_follow_up && lead.next_follow_up < context.today ? "high" : "medium",
        companyId: lead.company_id,
        customerId: lead.customer_id,
        customerName: getLeadCustomerName(context, lead),
        propertyId: lead.property_id ?? null,
        propertyLabel: getRecordPropertyLabel(context, lead.property_id ?? null, lead.customer_id, lead.property_address),
        category: "communication",
        assignedOwner: lead.created_by ? "Assigned lead owner" : "Unassigned",
        dueAt: lead.next_follow_up,
        createdAt: lead.created_at,
        currentWorkflowStage: "Follow-up due",
        sourceModule: "Leads",
        sourceRecordId: lead.id,
        suggestedNextAction: "Complete follow-up or update the lead status",
        title: "Customer waiting for callback",
        detail: `${lead.contact_name} has a follow-up due from ${lead.source}.`,
        workflow: "communications",
        targetView: "leads",
      }),
    );
}

function buildEstimateApprovalItems(snapshot: CrmSnapshot, context: QueueContext) {
  return snapshot.estimates
    .filter((estimate) => estimate.status === "sent")
    .map((estimate) =>
      createQueueItem(context, {
        id: `estimate-approval:${estimate.id}`,
        priority:
          estimate.expiration_date && estimate.expiration_date <= context.today
            ? "high"
            : "medium",
        companyId: estimate.company_id,
        customerId: estimate.customer_id,
        customerName: getEstimateCustomerName(context, estimate),
        propertyId: estimate.property_id ?? null,
        propertyLabel: getRecordPropertyLabel(context, estimate.property_id ?? null, estimate.customer_id, estimate.location),
        category: "estimate",
        assignedOwner: "Sales",
        dueAt: estimate.expiration_date ?? estimate.updated_at,
        createdAt: estimate.created_at,
        currentWorkflowStage: "Estimate sent",
        sourceModule: "Estimates",
        sourceRecordId: estimate.id,
        suggestedNextAction: "Confirm customer decision or update approval status",
        title: "Estimate awaiting approval",
        detail: `${estimate.title} is waiting on customer approval.`,
        workflow: "estimate",
        targetView: "estimates",
      }),
    );
}

function buildSignatureItems(snapshot: CrmSnapshot, context: QueueContext) {
  return snapshot.signatures
    .filter((signature) => signature.status === "pending" || signature.status === "sent" || signature.status === "viewed")
    .map((signature) => {
      const document = signature.document_id ? context.documentsById.get(signature.document_id) ?? null : null;
      const changeOrder = signature.change_order_id
        ? snapshot.changeOrders.find((item) => item.id === signature.change_order_id) ?? null
        : null;

      return createQueueItem(context, {
        id: `signature:${signature.id}`,
        priority:
          signature.expires_at && signature.expires_at.slice(0, 10) <= context.today
            ? "high"
            : "medium",
        companyId: signature.company_id,
        customerId: signature.customer_id ?? document?.customer_id ?? changeOrder?.customer_id ?? null,
        customerName: getSignatureCustomerName(context, signature, document, changeOrder),
        propertyId: document?.property_id ?? changeOrder?.property_id ?? null,
        propertyLabel: getRecordPropertyLabel(
          context,
          document?.property_id ?? changeOrder?.property_id ?? null,
          signature.customer_id ?? document?.customer_id ?? changeOrder?.customer_id ?? null,
          document?.property_address ?? null,
        ),
        category: "signature",
        assignedOwner: "Office",
        dueAt: signature.expires_at ?? signature.sent_at ?? signature.created_at,
        createdAt: signature.created_at,
        currentWorkflowStage: signatureStatusLabel(signature.status),
        sourceModule: "Documents",
        sourceRecordId: signature.id,
        suggestedNextAction: "Follow up on the pending customer signature",
        title: "Signature pending",
        detail: `${signature.signer_name} has not completed ${document?.title ?? changeOrder?.title ?? "the signature request"}.`,
        workflow: "documents",
        targetView: signature.change_order_id ? "changeOrders" : "documents",
      });
    });
}

function buildInspectionItems(snapshot: CrmSnapshot, context: QueueContext) {
  const unscheduled = snapshot.inspections
    .filter(
      (inspection) =>
        inspection.status !== "canceled" &&
        inspection.status !== "completed" &&
        !inspection.scheduled_start,
    )
    .map((inspection) =>
      createInspectionQueueItem(context, inspection, {
        id: `inspection-unscheduled:${inspection.id}`,
        title: "Unscheduled inspection",
        priority: mapLeadPriority(inspection.priority) === "critical" ? "critical" : "high",
        currentWorkflowStage: inspectionStatusLabel(inspection.status),
        suggestedNextAction: "Schedule inspection time and owner",
        dueAt: inspection.updated_at,
      }),
    );

  const awaitingEstimate = snapshot.inspections
    .filter(
      (inspection) =>
        inspection.status === "completed" &&
        !inspection.estimate_id &&
        inspection.outcome !== "no_work_needed" &&
        inspection.outcome !== "internal_only",
    )
    .map((inspection) =>
      createInspectionQueueItem(context, inspection, {
        id: `inspection-estimate:${inspection.id}`,
        title: "Inspection completed awaiting estimate",
        priority: "high",
        currentWorkflowStage: "Completed inspection",
        suggestedNextAction: "Create Estimate Only from the inspection findings",
        dueAt: inspection.completed_at ?? inspection.updated_at,
      }),
    );

  return [...unscheduled, ...awaitingEstimate];
}

function buildJobSchedulingItems(snapshot: CrmSnapshot, context: QueueContext) {
  const openJobs = snapshot.jobs.filter(isOpenJob);
  const awaitingScheduling = openJobs
    .filter((job) => !hasSavedJobSchedule(job) && !hasUpcomingScheduledEvent(snapshot, job.id, context.today))
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `job-schedule:${job.id}`,
        title: "Job awaiting production scheduling",
        priority: job.status === "blocked" ? "critical" : "high",
        category: "job",
        currentWorkflowStage: jobStatusLabel(job.status),
        suggestedNextAction: "Schedule production dates or dispatch the job",
        dueAt: job.updated_at,
        workflow: "production",
        targetView: "jobs",
      }),
    );

  const missingCrews = openJobs
    .filter((job) => (isProductionActiveJob(job) || hasSavedJobSchedule(job)) && !jobHasCrew(snapshot, job))
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `job-crew:${job.id}`,
        title: "Job missing assigned crew",
        priority: isDueToday(getJobScheduleDate(job), context.today) ? "critical" : "high",
        category: "job",
        currentWorkflowStage: "Crew assignment needed",
        suggestedNextAction: "Assign a crew or foreman before production",
        dueAt: getJobScheduleDate(job) ?? job.updated_at,
        workflow: "production",
        targetView: "jobs",
      }),
    );

  return [...awaitingScheduling, ...missingCrews];
}

function buildDispatchConflictItems(snapshot: CrmSnapshot, context: QueueContext) {
  return buildScheduleConflicts(snapshot)
    .filter((conflict) => conflict.job !== null)
    .map((conflict) =>
      createJobQueueItem(context, snapshot, conflict.job as JobRecord, {
        id: `dispatch-conflict:${conflict.id}`,
        title: "Job has dispatch conflict",
        priority: "critical",
        category: "job",
        currentWorkflowStage: conflict.label,
        suggestedNextAction: "Open dispatch and resolve the schedule conflict",
        dueAt: getJobScheduleDate(conflict.job as JobRecord) ?? (conflict.job as JobRecord).updated_at,
        workflow: "calendar",
        targetView: "calendar",
        detailOverride: conflict.detail,
      }),
    );
}

function buildSchedulingAlertItems(snapshot: CrmSnapshot, context: QueueContext) {
  return buildSchedulingIntelligence(snapshot, { now: context.now }).alerts.map((alert) =>
    createQueueItem(context, {
      id: `scheduling-alert:${alert.id}`,
      priority: alert.priority,
      companyId: alert.companyId,
      customerId: alert.customerId,
      customerName: alert.customerName,
      propertyId: alert.propertyId,
      propertyLabel: alert.propertyLabel,
      category: mapSchedulingAlertCategory(alert),
      assignedOwner: alert.assignedOwner,
      dueAt: alert.dueAt,
      createdAt: alert.dueAt,
      currentWorkflowStage: alert.workflowStage,
      sourceModule: "Scheduling Intelligence",
      sourceRecordId: alert.sourceRecordId,
      status: mapSchedulingAlertStatus(alert.status),
      suggestedNextAction: alert.suggestedNextAction,
      title: alert.title,
      detail: alert.detail,
      workflow: mapSchedulingAlertWorkflow(alert),
      targetView: alert.targetView,
    }),
  );
}

function buildFieldOperationsItems(snapshot: CrmSnapshot, context: QueueContext) {
  return buildFieldOperationsSnapshot(snapshot, { now: context.now }).operationsQueueIssues.map(
    (issue) =>
      createQueueItem(context, {
        id: `field-operations:${issue.id}`,
        priority: issue.priority,
        companyId: issue.companyId,
        customerId: null,
        customerName: issue.customerName,
        propertyId: null,
        propertyLabel: issue.propertyLabel,
        category: issue.category === "Material issue" ? "material" : "office_task",
        assignedOwner: "Office",
        dueAt: issue.createdAt,
        createdAt: issue.createdAt,
        currentWorkflowStage: issue.category,
        sourceModule: "Field Operations",
        sourceRecordId: issue.sourceRecordId,
        status: "today",
        suggestedNextAction: issue.suggestedNextAction,
        title: issue.title,
        detail: issue.detail,
        workflow: "production",
        targetView: "fieldOperations",
      }),
  );
}

function mapSchedulingAlertCategory(alert: SchedulingAlert): OperationsQueueCategory {
  if (alert.type === "missing_documents") {
    return "document";
  }

  if (alert.type === "missing_inspection") {
    return "inspection";
  }

  if (alert.type === "material_delay" || alert.type === "material_missing") {
    return "material";
  }

  if (alert.type === "missing_crew" || alert.type === "production_conflict") {
    return "job";
  }

  return "dispatch";
}

function mapSchedulingAlertWorkflow(alert: SchedulingAlert): OperationsQueueWorkflow {
  if (alert.targetView === "documents") {
    return "documents";
  }

  if (alert.targetView === "inspections") {
    return "inspection";
  }

  if (alert.targetView === "orders" || alert.targetView === "jobs") {
    return "production";
  }

  if (alert.targetView === "customers") {
    return "customer";
  }

  return "calendar";
}

function mapSchedulingAlertStatus(
  status: SchedulingAlert["status"],
): OperationsQueueStatus {
  if (status === "today" || status === "upcoming" || status === "overdue") {
    return status;
  }

  return "open";
}

function buildDocumentAndPermitItems(snapshot: CrmSnapshot, context: QueueContext) {
  const missingRequiredDocuments = snapshot.documents
    .filter(
      (document) =>
        document.requirement_level === "required" &&
        document.status !== "archived" &&
        !document.file_url &&
        !document.storage_path &&
        !document.body,
    )
    .map((document) =>
      createDocumentQueueItem(context, document, {
        id: `document-required:${document.id}`,
        title: "Missing required documents",
        priority: "high",
        category: "document",
        currentWorkflowStage: documentStatusLabel(document.status),
        suggestedNextAction: "Upload, draft, or archive the required document",
        dueAt: document.updated_at,
      }),
    );

  const permitItems = snapshot.jobs
    .filter(
      (job) =>
        (job.status === "scheduled" || job.status === "in_progress") &&
        isRoofingJob(job) &&
        !snapshot.documents.some(
          (document) => document.job_id === job.id && document.category === "permit",
        ),
    )
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `permit-required:${job.id}`,
        title: "Permit required",
        priority: "high",
        category: "permit",
        currentWorkflowStage: "Permit missing",
        suggestedNextAction: "Add permit document or confirm permit is not required",
        dueAt: getJobScheduleDate(job) ?? job.updated_at,
        workflow: "documents",
        targetView: "documents",
      }),
    );

  const jobMissingDocuments = snapshot.jobs
    .filter(
      (job) =>
        (job.status === "scheduled" || job.status === "in_progress") &&
        !snapshot.documents.some(
          (document) =>
            document.job_id === job.id &&
            (document.category === "contract" ||
              document.category === "signed_agreement"),
        ),
    )
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `job-documents:${job.id}`,
        title: "Job missing documents",
        priority: "high",
        category: "document",
        currentWorkflowStage: "Start packet incomplete",
        suggestedNextAction: "Attach signed contract and required start documents",
        dueAt: getJobScheduleDate(job) ?? job.updated_at,
        workflow: "documents",
        targetView: "documents",
      }),
    );

  const warrantyItems = snapshot.jobs
    .filter(
      (job) =>
        job.status === "completed" &&
        !snapshot.documents.some(
          (document) =>
            document.job_id === job.id &&
            (document.category === "warranty" ||
              document.category === "manufacturer_warranty" ||
              document.category === "workmanship_warranty"),
        ),
    )
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `warranty-follow-up:${job.id}`,
        title: "Warranty follow-up",
        priority: "medium",
        category: "warranty",
        currentWorkflowStage: "Completion closeout",
        suggestedNextAction: "Prepare warranty document or closeout packet",
        dueAt: job.updated_at,
        workflow: "documents",
        targetView: "documents",
      }),
    );

  return [
    ...missingRequiredDocuments,
    ...permitItems,
    ...jobMissingDocuments,
    ...warrantyItems,
  ];
}

function buildMaterialItems(snapshot: CrmSnapshot, context: QueueContext) {
  const activeJobs = snapshot.jobs.filter(isProductionActiveJob);
  const materialOrderNeeded = activeJobs
    .filter(
      (job) =>
        !snapshot.materialOrders.some((order) => order.job_id === job.id) &&
        !snapshot.jobMaterials.some((material) => material.job_id === job.id),
    )
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `material-needed:${job.id}`,
        title: "Material order needed",
        priority: "high",
        category: "material",
        currentWorkflowStage: "Material readiness missing",
        suggestedNextAction: "Create or confirm material order before production",
        dueAt: getJobScheduleDate(job) ?? job.updated_at,
        workflow: "production",
        targetView: "orders",
      }),
    );

  const materialWarnings = snapshot.materialOrders
    .filter((order) => order.status === "draft" || order.status === "partial" || isMaterialOrderDelayed(order, context.today))
    .map((order) => {
      const job = order.job_id ? context.jobsById.get(order.job_id) ?? null : null;

      return createQueueItem(context, {
        id: `material-order:${order.id}`,
        priority: isMaterialOrderDelayed(order, context.today) ? "critical" : "medium",
        companyId: order.company_id,
        customerId: job?.customer_id ?? null,
        customerName: job ? getJobCustomerName(context, job) : "Unassigned",
        propertyId: order.property_id ?? job?.property_id ?? null,
        propertyLabel: getRecordPropertyLabel(
          context,
          order.property_id ?? job?.property_id ?? null,
          job?.customer_id ?? null,
          order.delivery_address ?? job?.property_address ?? null,
        ),
        category: "material",
        assignedOwner: job?.project_manager?.trim() || "Production",
        dueAt: order.expected_delivery_date ?? order.requested_date,
        createdAt: order.created_at,
        currentWorkflowStage: materialOrderStatusLabel(order.status),
        sourceModule: "Materials",
        sourceRecordId: order.id,
        suggestedNextAction: isMaterialOrderDelayed(order, context.today)
          ? "Resolve delayed material delivery"
          : "Update material order readiness",
        title: isMaterialOrderDelayed(order, context.today)
          ? "Material readiness warning"
          : "Material order needs update",
        detail: `${order.supplier_name} order for ${job?.title ?? "unassigned job"}.`,
        workflow: "production",
        targetView: "orders",
      });
    });

  return [...materialOrderNeeded, ...materialWarnings];
}

function buildInvoiceItems(snapshot: CrmSnapshot, context: QueueContext) {
  const draftInvoices = snapshot.invoices
    .filter((invoice) => invoice.status === "draft")
    .map((invoice) =>
      createInvoiceQueueItem(context, invoice, {
        id: `invoice-not-sent:${invoice.id}`,
        title: "Invoice not sent",
        priority: "medium",
        currentWorkflowStage: "Draft invoice",
        suggestedNextAction: "Send invoice or archive if no longer needed",
        dueAt: invoice.due_date ?? invoice.updated_at,
      }),
    );

  const overdueInvoices = snapshot.invoices
    .filter(
      (invoice) =>
        invoice.status === "overdue" ||
        (invoice.balance_due > 0 &&
          invoice.due_date !== null &&
          invoice.due_date < context.today &&
          invoice.status !== "paid" &&
          invoice.status !== "void"),
    )
    .map((invoice) =>
      createInvoiceQueueItem(context, invoice, {
        id: `invoice-overdue:${invoice.id}`,
        title: "Invoice overdue",
        priority: "critical",
        currentWorkflowStage: "Overdue balance",
        suggestedNextAction: "Follow up with customer or record payment",
        dueAt: invoice.due_date ?? invoice.updated_at,
      }),
    );

  const completedJobsWithoutInvoice = snapshot.jobs
    .filter(
      (job) =>
        (job.status === "completed" || job.status === "closed") &&
        !snapshot.invoices.some((invoice) => invoice.job_id === job.id),
    )
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `job-invoice:${job.id}`,
        title: "Invoice not sent",
        priority: "high",
        category: "invoice",
        currentWorkflowStage: "Job complete",
        suggestedNextAction: "Create final invoice from completed job",
        dueAt: job.updated_at,
        workflow: "invoice",
        targetView: "invoices",
      }),
    );

  return [...overdueInvoices, ...draftInvoices, ...completedJobsWithoutInvoice];
}

function buildChangeOrderItems(snapshot: CrmSnapshot, context: QueueContext) {
  return snapshot.changeOrders
    .filter((changeOrder) => changeOrder.status === "draft" || changeOrder.status === "sent")
    .map((changeOrder) =>
      createChangeOrderQueueItem(context, snapshot, changeOrder, {
        id: `change-order:${changeOrder.id}`,
        title: "Change order pending",
        priority: changeOrder.status === "sent" ? "high" : "medium",
        currentWorkflowStage: changeOrderStatusLabel(changeOrder.status),
        suggestedNextAction:
          changeOrder.status === "sent"
            ? "Confirm customer decision on change order"
            : "Finish and send change order",
        dueAt: changeOrder.requested_date,
      }),
    );
}

function buildCommunicationItems(snapshot: CrmSnapshot, context: QueueContext) {
  const failedEmails = snapshot.emailMessages
    .filter((message) => message.status === "failed")
    .map((message) =>
      createQueueItem(context, {
        id: `email-failed:${message.id}`,
        priority: "high",
        companyId: message.company_id,
        customerId: message.customer_id,
        customerName: getCustomerName(context, message.customer_id),
        propertyId: null,
        propertyLabel: getRecordPropertyLabel(context, null, message.customer_id, null),
        category: "communication",
        assignedOwner: "Office",
        dueAt: message.updated_at,
        createdAt: message.created_at,
        currentWorkflowStage: "Email failed",
        sourceModule: "Communications",
        sourceRecordId: message.id,
        suggestedNextAction: "Open communications and resolve email failure",
        title: "Customer escalation",
        detail: `${message.subject} failed to send.`,
        workflow: "communications",
        targetView: "inbox",
      }),
    );

  const failedSms = snapshot.smsMessages
    .filter((message) => message.status === "failed")
    .map((message) =>
      createQueueItem(context, {
        id: `sms-failed:${message.id}`,
        priority: "high",
        companyId: message.company_id,
        customerId: message.customer_id,
        customerName: getCustomerName(context, message.customer_id),
        propertyId: null,
        propertyLabel: getRecordPropertyLabel(context, null, message.customer_id, null),
        category: "communication",
        assignedOwner: "Office",
        dueAt: message.updated_at,
        createdAt: message.created_at,
        currentWorkflowStage: "SMS failed",
        sourceModule: "Communications",
        sourceRecordId: message.id,
        suggestedNextAction: "Open communications and resolve SMS failure",
        title: "Customer escalation",
        detail: `${message.category.replace("_", " ")} SMS failed to send.`,
        workflow: "communications",
        targetView: "inbox",
      }),
    );

  const reminders = snapshot.notifications
    .filter(
      (notification) =>
        notification.status === "queued" &&
        notification.remind_at !== null &&
        notification.remind_at.slice(0, 10) <= context.today,
    )
    .map((notification) => createNotificationQueueItem(context, notification));

  return [...failedEmails, ...failedSms, ...reminders];
}

function buildRecentCloseoutItems(snapshot: CrmSnapshot, context: QueueContext) {
  const signedEstimates = snapshot.signatures
    .filter((signature) => signature.status === "signed")
    .slice(0, 5)
    .map((signature) => {
      const document = signature.document_id ? context.documentsById.get(signature.document_id) ?? null : null;

      return createQueueItem(context, {
        id: `recent-signature:${signature.id}`,
        priority: "low",
        companyId: signature.company_id,
        customerId: signature.customer_id ?? document?.customer_id ?? null,
        customerName: getSignatureCustomerName(context, signature, document, null),
        propertyId: document?.property_id ?? null,
        propertyLabel: getRecordPropertyLabel(context, document?.property_id ?? null, signature.customer_id ?? document?.customer_id ?? null, document?.property_address ?? null),
        category: "signature",
        assignedOwner: "Office",
        dueAt: signature.signed_at ?? signature.updated_at,
        createdAt: signature.created_at,
        currentWorkflowStage: "Signed",
        sourceModule: "Documents",
        sourceRecordId: signature.id,
        status: "completed",
        suggestedNextAction: "Review handoff or closeout if needed",
        title: "Recently signed estimate",
        detail: `${signature.signer_name} signed ${document?.title ?? "a signature request"}.`,
        workflow: "documents",
        targetView: "documents",
      });
    });

  const completedJobs = snapshot.jobs
    .filter((job) => job.status === "completed" || job.status === "closed")
    .slice(0, 5)
    .map((job) =>
      createJobQueueItem(context, snapshot, job, {
        id: `recent-job-closeout:${job.id}`,
        title: "Recently completed job",
        priority: "low",
        category: "job",
        currentWorkflowStage: jobStatusLabel(job.status),
        suggestedNextAction: "Review closeout, invoice, and warranty status",
        dueAt: job.updated_at,
        workflow: "job",
        targetView: "jobs",
        status: "completed",
      }),
    );

  return [...signedEstimates, ...completedJobs];
}

function createQueueItem(context: QueueContext, input: QueueItemInput): OperationsQueueItem {
  return {
    ...input,
    status: input.status ?? deriveQueueStatus(input.dueAt, context.today),
    ageDays: calculateAgeDays(input.createdAt ?? input.dueAt, context.now),
  };
}

function createInspectionQueueItem(
  context: QueueContext,
  inspection: InspectionRecord,
  input: {
    id: string;
    title: string;
    priority: OperationsQueuePriority;
    currentWorkflowStage: string;
    suggestedNextAction: string;
    dueAt: string | null;
  },
) {
  return createQueueItem(context, {
    id: input.id,
    priority: input.priority,
    companyId: inspection.company_id,
    customerId: inspection.customer_id,
    customerName: getInspectionCustomerName(context, inspection),
    propertyId: inspection.property_id ?? null,
    propertyLabel: getRecordPropertyLabel(
      context,
      inspection.property_id ?? null,
      inspection.customer_id,
      inspection.property_address,
    ),
    category: "inspection",
    assignedOwner: inspection.assigned_inspector?.trim() || employeeName(context, inspection.employee_id) || "Unassigned",
    dueAt: input.dueAt,
    createdAt: inspection.created_at,
    currentWorkflowStage: input.currentWorkflowStage,
    sourceModule: "Inspections",
    sourceRecordId: inspection.id,
    suggestedNextAction: input.suggestedNextAction,
    title: input.title,
    detail: `${inspection.title} at ${inspection.property_address ?? "unassigned property"}.`,
    workflow: "inspection",
    targetView: "inspections",
  });
}

function createJobQueueItem(
  context: QueueContext,
  snapshot: CrmSnapshot,
  job: JobRecord,
  input: {
    id: string;
    title: string;
    priority: OperationsQueuePriority;
    category: OperationsQueueCategory;
    currentWorkflowStage: string;
    suggestedNextAction: string;
    dueAt: string | null;
    workflow: OperationsQueueWorkflow;
    targetView: OperationsQueueTargetView;
    detailOverride?: string;
    status?: OperationsQueueStatus;
  },
) {
  return createQueueItem(context, {
    id: input.id,
    priority: input.priority,
    companyId: job.company_id,
    customerId: job.customer_id,
    customerName: getJobCustomerName(context, job),
    propertyId: job.property_id ?? null,
    propertyLabel: getRecordPropertyLabel(context, job.property_id ?? null, job.customer_id, getJobDisplayAddress(job)),
    category: input.category,
    assignedOwner: job.project_manager?.trim() || getJobCrewOwner(snapshot, context, job) || "Unassigned",
    dueAt: input.dueAt,
    createdAt: job.created_at,
    currentWorkflowStage: input.currentWorkflowStage,
    sourceModule: input.workflow === "calendar" ? "Calendar" : input.targetView === "orders" ? "Materials" : "Jobs",
    sourceRecordId: job.id,
    status: input.status,
    suggestedNextAction: input.suggestedNextAction,
    title: input.title,
    detail: input.detailOverride ?? `${job.title} at ${getJobDisplayAddress(job)}.`,
    workflow: input.workflow,
    targetView: input.targetView,
  });
}

function createDocumentQueueItem(
  context: QueueContext,
  document: DocumentRecord,
  input: {
    id: string;
    title: string;
    priority: OperationsQueuePriority;
    category: OperationsQueueCategory;
    currentWorkflowStage: string;
    suggestedNextAction: string;
    dueAt: string | null;
  },
) {
  return createQueueItem(context, {
    id: input.id,
    priority: input.priority,
    companyId: document.company_id,
    customerId: document.customer_id,
    customerName: getCustomerName(context, document.customer_id),
    propertyId: document.property_id ?? null,
    propertyLabel: getRecordPropertyLabel(context, document.property_id ?? null, document.customer_id, document.property_address),
    category: input.category,
    assignedOwner: document.uploaded_by?.trim() || "Office",
    dueAt: input.dueAt,
    createdAt: document.created_at,
    currentWorkflowStage: input.currentWorkflowStage,
    sourceModule: "Documents",
    sourceRecordId: document.id,
    suggestedNextAction: input.suggestedNextAction,
    title: input.title,
    detail: `${document.title} is marked ${document.requirement_level}.`,
    workflow: "documents",
    targetView: "documents",
  });
}

function createInvoiceQueueItem(
  context: QueueContext,
  invoice: InvoiceRecord,
  input: {
    id: string;
    title: string;
    priority: OperationsQueuePriority;
    currentWorkflowStage: string;
    suggestedNextAction: string;
    dueAt: string | null;
  },
) {
  const job = invoice.job_id ? context.jobsById.get(invoice.job_id) ?? null : null;

  return createQueueItem(context, {
    id: input.id,
    priority: input.priority,
    companyId: invoice.company_id,
    customerId: invoice.customer_id ?? job?.customer_id ?? null,
    customerName: getCustomerName(context, invoice.customer_id ?? job?.customer_id ?? null),
    propertyId: invoice.property_id ?? job?.property_id ?? null,
    propertyLabel: getRecordPropertyLabel(context, invoice.property_id ?? job?.property_id ?? null, invoice.customer_id ?? job?.customer_id ?? null, job?.property_address ?? null),
    category: "invoice",
    assignedOwner: "Office",
    dueAt: input.dueAt,
    createdAt: invoice.created_at,
    currentWorkflowStage: input.currentWorkflowStage,
    sourceModule: "Invoices",
    sourceRecordId: invoice.id,
    suggestedNextAction: input.suggestedNextAction,
    title: input.title,
    detail: `${invoice.invoice_number} has ${formatCurrency(invoice.balance_due)} balance due.`,
    workflow: "invoice",
    targetView: "invoices",
  });
}

function createChangeOrderQueueItem(
  context: QueueContext,
  snapshot: CrmSnapshot,
  changeOrder: ChangeOrderRecord,
  input: {
    id: string;
    title: string;
    priority: OperationsQueuePriority;
    currentWorkflowStage: string;
    suggestedNextAction: string;
    dueAt: string | null;
  },
) {
  const job = changeOrder.job_id ? context.jobsById.get(changeOrder.job_id) ?? null : null;

  return createQueueItem(context, {
    id: input.id,
    priority: input.priority,
    companyId: changeOrder.company_id,
    customerId: changeOrder.customer_id ?? job?.customer_id ?? null,
    customerName: getCustomerName(context, changeOrder.customer_id ?? job?.customer_id ?? null),
    propertyId: changeOrder.property_id ?? job?.property_id ?? null,
    propertyLabel: getRecordPropertyLabel(context, changeOrder.property_id ?? job?.property_id ?? null, changeOrder.customer_id ?? job?.customer_id ?? null, job ? getJobDisplayAddress(job) : null),
    category: "change_order",
    assignedOwner: job ? job.project_manager?.trim() || getJobCrewOwner(snapshot, context, job) || "Office" : "Office",
    dueAt: input.dueAt,
    createdAt: changeOrder.created_at,
    currentWorkflowStage: input.currentWorkflowStage,
    sourceModule: "Change Orders",
    sourceRecordId: changeOrder.id,
    suggestedNextAction: input.suggestedNextAction,
    title: input.title,
    detail: `${changeOrder.title} is ${changeOrder.status} for ${formatCurrency(changeOrder.total)}.`,
    workflow: "documents",
    targetView: "changeOrders",
  });
}

function createNotificationQueueItem(
  context: QueueContext,
  notification: NotificationRecord,
) {
  return createQueueItem(context, {
    id: `office-task:${notification.id}`,
    priority:
      notification.remind_at && notification.remind_at.slice(0, 10) < context.today
        ? "high"
        : "medium",
    companyId: notification.company_id,
    customerId: notification.customer_id,
    customerName: getCustomerName(context, notification.customer_id),
    propertyId: null,
    propertyLabel: getRecordPropertyLabel(context, null, notification.customer_id, null),
    category: "office_task",
    assignedOwner: employeeName(context, notification.employee_id) || "Office",
    dueAt: notification.remind_at,
    createdAt: notification.created_at,
    currentWorkflowStage: notificationStatusLabel(notification.status),
    sourceModule: "Notifications",
    sourceRecordId: notification.id,
    suggestedNextAction: "Complete or dismiss the office reminder",
    title: "Internal office task",
    detail: notification.title,
    workflow: "communications",
    targetView: "notifications",
  });
}

function deriveQueueStatus(dueAt: string | null, today: string): OperationsQueueStatus {
  if (!dueAt) {
    return "open";
  }

  const dueDate = dueAt.slice(0, 10);

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "today";
  }

  return "upcoming";
}

function calculateAgeDays(value: string | null | undefined, now: Date) {
  if (!value) {
    return 0;
  }

  const startedAt = Date.parse(value);

  if (!Number.isFinite(startedAt)) {
    return 0;
  }

  const delta = now.getTime() - startedAt;

  return Math.max(0, Math.floor(delta / 86_400_000));
}

function mapLeadPriority(priority: LeadPriority): OperationsQueuePriority {
  if (priority === "urgent") {
    return "critical";
  }

  if (priority === "high") {
    return "high";
  }

  if (priority === "normal") {
    return "medium";
  }

  return "low";
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function uniqueSorted<T extends string>(values: T[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function getCustomerName(context: QueueContext, customerId: string | null | undefined) {
  if (!customerId) {
    return "Unassigned";
  }

  return context.customersById.get(customerId)?.display_name ?? "Unassigned";
}

function getLeadCustomerName(context: QueueContext, lead: LeadRecord) {
  return getCustomerName(context, lead.customer_id) === "Unassigned"
    ? lead.contact_name
    : getCustomerName(context, lead.customer_id);
}

function getEstimateCustomerName(context: QueueContext, estimate: EstimateRecord) {
  if (estimate.customer_id) {
    return getCustomerName(context, estimate.customer_id);
  }

  if (estimate.lead_id) {
    return context.leadsById.get(estimate.lead_id)?.contact_name ?? "Unassigned";
  }

  return "Unassigned";
}

function getInspectionCustomerName(context: QueueContext, inspection: InspectionRecord) {
  if (inspection.customer_id) {
    return getCustomerName(context, inspection.customer_id);
  }

  if (inspection.lead_id) {
    return context.leadsById.get(inspection.lead_id)?.contact_name ?? "Unassigned";
  }

  return "Unassigned";
}

function getJobCustomerName(context: QueueContext, job: JobRecord) {
  if (job.customer_id) {
    return getCustomerName(context, job.customer_id);
  }

  if (job.lead_id) {
    return context.leadsById.get(job.lead_id)?.contact_name ?? "Unassigned";
  }

  return "Unassigned";
}

function getSignatureCustomerName(
  context: QueueContext,
  signature: SignatureRecord,
  document: DocumentRecord | null,
  changeOrder: ChangeOrderRecord | null,
) {
  return getCustomerName(
    context,
    signature.customer_id ?? document?.customer_id ?? changeOrder?.customer_id ?? null,
  );
}

function getRecordPropertyLabel(
  context: QueueContext,
  propertyId: string | null,
  customerId: string | null | undefined,
  fallbackAddress: string | null | undefined,
) {
  if (propertyId) {
    const property = context.propertiesById.get(propertyId);

    if (property) {
      return property.display_name || property.address;
    }
  }

  if (customerId) {
    const customer = context.customersById.get(customerId);

    if (customer?.property_address) {
      return customer.property_address;
    }
  }

  return fallbackAddress?.trim() || "Unassigned property";
}

function employeeName(context: QueueContext, employeeId: string | null | undefined) {
  if (!employeeId) {
    return null;
  }

  return context.employeesById.get(employeeId) ?? null;
}

function getJobCrewOwner(
  snapshot: CrmSnapshot,
  context: QueueContext,
  job: JobRecord,
) {
  const acceptedAssignment = snapshot.jobAssignments.find(
    (assignment) =>
      assignment.job_id === job.id &&
      (assignment.status === "accepted" || assignment.status === "assigned"),
  );

  return (
    employeeName(context, acceptedAssignment?.employee_id ?? null) ??
    job.crew_name?.trim() ??
    null
  );
}

function hasSavedJobSchedule(job: JobRecord) {
  return Boolean(getJobScheduledStart(job) || getJobScheduledEnd(job));
}

function getJobScheduleDate(job: JobRecord) {
  return getJobScheduledStart(job) ?? getJobScheduledEnd(job);
}

function hasUpcomingScheduledEvent(
  snapshot: CrmSnapshot,
  jobId: string,
  today: string,
) {
  return snapshot.scheduleEvents.some(
    (event) =>
      event.job_id === jobId &&
      event.status === "scheduled" &&
      event.start_at.slice(0, 10) >= today,
  );
}

function isOpenJob(job: JobRecord) {
  return (
    job.status !== "completed" &&
    job.status !== "closed" &&
    job.status !== "cancelled" &&
    job.status !== "canceled"
  );
}

function isProductionActiveJob(job: JobRecord) {
  return job.status === "scheduled" || job.status === "in_progress" || job.status === "blocked";
}

function isRoofingJob(job: JobRecord) {
  return job.service_type === "roofing" || job.service_type === "both";
}

function jobHasCrew(snapshot: CrmSnapshot, job: JobRecord) {
  return (
    Boolean(job.crew_name?.trim()) ||
    snapshot.jobAssignments.some(
      (assignment) =>
        assignment.job_id === job.id &&
        (assignment.status === "assigned" || assignment.status === "accepted"),
    )
  );
}

function buildScheduleConflicts(snapshot: CrmSnapshot) {
  const conflicts: { id: string; label: string; detail: string; job: JobRecord | null }[] = [];
  const scheduledJobs = snapshot.jobs
    .map((job) => ({
      job,
      start: getJobScheduledStart(job),
      end: getJobScheduledEnd(job),
      crew: job.crew_name?.trim() || "Crew needed",
      foreman: job.project_manager?.trim() || "Foreman unassigned",
    }))
    .filter((item) => item.start && item.end);

  scheduledJobs.forEach((item, index) => {
    scheduledJobs.slice(index + 1).forEach((other) => {
      if (!item.start || !item.end || !other.start || !other.end) {
        return;
      }

      if (!rangesOverlap({ start: item.start, end: item.end }, { start: other.start, end: other.end })) {
        return;
      }

      if (item.crew !== "Crew needed" && item.crew === other.crew) {
        conflicts.push({
          id: `crew-${item.job.id}-${other.job.id}`,
          label: "Crew overlap",
          detail: `${item.crew} is scheduled on ${item.job.title} and ${other.job.title}`,
          job: item.job,
        });
      }

      if (item.foreman !== "Foreman unassigned" && item.foreman === other.foreman) {
        conflicts.push({
          id: `foreman-${item.job.id}-${other.job.id}`,
          label: "Foreman overlap",
          detail: `${item.foreman} is scheduled on ${item.job.title} and ${other.job.title}`,
          job: item.job,
        });
      }
    });
  });

  return conflicts;
}

function rangesOverlap(
  left: { start: string; end: string },
  right: { start: string; end: string },
) {
  const leftStart = Date.parse(left.start);
  const leftEnd = Date.parse(left.end);
  const rightStart = Date.parse(right.start);
  const rightEnd = Date.parse(right.end);

  return (
    Number.isFinite(leftStart) &&
    Number.isFinite(leftEnd) &&
    Number.isFinite(rightStart) &&
    Number.isFinite(rightEnd) &&
    leftStart < rightEnd &&
    rightStart < leftEnd
  );
}

function isDueToday(value: string | null | undefined, today: string) {
  return value?.slice(0, 10) === today;
}

function isMaterialOrderDelayed(order: MaterialOrderRecord, today: string) {
  return Boolean(
    order.expected_delivery_date &&
      order.expected_delivery_date < today &&
      order.status !== "received" &&
      order.status !== "canceled",
  );
}

function leadStatusLabel(status: string) {
  return status.replace("_", " ");
}

function jobStatusLabel(status: string) {
  return status.replace("_", " ");
}

function inspectionStatusLabel(status: string) {
  return status.replace("_", " ");
}

function signatureStatusLabel(status: string) {
  return status.replace("_", " ");
}

function documentStatusLabel(status: string) {
  return status.replace("_", " ");
}

function materialOrderStatusLabel(status: string) {
  return status.replace("_", " ");
}

function changeOrderStatusLabel(status: string) {
  return status.replace("_", " ");
}

function notificationStatusLabel(status: string) {
  return status.replace("_", " ");
}

function serviceTypeLabel(serviceType: string) {
  return serviceType.replace("_", " ");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
