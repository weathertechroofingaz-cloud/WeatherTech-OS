import {
  getJobDisplayAddress,
  getJobScheduledEnd,
  getJobScheduledStart,
} from "./jobs";
import type {
  CrmSnapshot,
  DocumentRecord,
  InspectionRecord,
  JobMaterialRecord,
  JobNoteRecord,
  JobPhotoRecord,
  JobRecord,
  JobTaskRecord,
  MaterialOrderRecord,
  PropertyRecord,
  ScheduleEventRecord,
} from "./types";

export type FieldAssignmentKind = "job" | "inspection";

export type FieldAssignmentPriority = "critical" | "high" | "medium" | "low";

export type FieldIssueCategory =
  | "Safety"
  | "Customer concern"
  | "Scope discrepancy"
  | "Hidden damage"
  | "Material issue"
  | "Access issue"
  | "Weather"
  | "Scheduling"
  | "Quality concern"
  | "Additional work"
  | "Other";

export type FieldStatusAction =
  | "scheduled"
  | "en_route"
  | "arrived"
  | "work_started"
  | "paused"
  | "work_completed"
  | "unable_to_complete";

export type FieldUploadState = "ready" | "uploading" | "uploaded" | "failed";

export type FieldChecklistSection =
  | "Arrival checklist"
  | "Safety checklist"
  | "Inspection checklist"
  | "Production checklist"
  | "Completion checklist"
  | "Cleanup checklist";

export type FieldChecklistItem = {
  id: string;
  taskId: string | null;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  section: FieldChecklistSection;
  photoRequired: boolean;
  signatureRequired: boolean;
};

export type FieldDocumentRequirement = {
  id: string;
  label: string;
  status: "ready" | "missing" | "not_required";
  documentId: string | null;
};

export type FieldIssueSignal = {
  id: string;
  companyId: string;
  sourceRecordId: string;
  sourceModule: "Jobs" | "Inspections";
  assignmentId: string;
  customerName: string;
  propertyLabel: string;
  priority: FieldAssignmentPriority;
  category: FieldIssueCategory | "Material issue" | "Completion blocked";
  title: string;
  detail: string;
  createdAt: string;
  suggestedNextAction: string;
};

export type FieldAssignment = {
  id: string;
  kind: FieldAssignmentKind;
  companyId: string;
  companyName: string;
  sourceRecordId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  propertyId: string | null;
  propertyLabel: string;
  propertyAddress: string;
  propertyNickname: string | null;
  assignmentType: string;
  title: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  assignedCrew: string;
  assignedEmployee: string;
  workflowStage: string;
  serviceType: "roofing" | "painting" | "both";
  priority: FieldAssignmentPriority;
  currentStatus: FieldStatusAction;
  suggestedNextAction: string;
  accessInstructions: string;
  gateCode: string | null;
  propertyNotes: string;
  systemSummary: string;
  inspectionSummary: string;
  requiredDocuments: FieldDocumentRequirement[];
  checklist: FieldChecklistItem[];
  documents: DocumentRecord[];
  photos: JobPhotoRecord[];
  notes: JobNoteRecord[];
  officeMessages: {
    id: string;
    label: string;
    detail: string;
    createdAt: string;
  }[];
  materials: JobMaterialRecord[];
  materialOrders: MaterialOrderRecord[];
  issueSignals: FieldIssueSignal[];
  incompleteChecklistCount: number;
  requiredDocumentCount: number;
  openIssueCount: number;
  photoCount: number;
  completedToday: boolean;
};

export type FieldOperationsSnapshot = {
  assignments: FieldAssignment[];
  todayAssignedJobs: FieldAssignment[];
  todayInspections: FieldAssignment[];
  currentActiveAssignment: FieldAssignment | null;
  nextAssignment: FieldAssignment | null;
  officeMessages: FieldAssignment[];
  requiredDocuments: FieldAssignment[];
  incompleteChecklists: FieldAssignment[];
  openIssues: FieldAssignment[];
  completedToday: FieldAssignment[];
  operationsQueueIssues: FieldIssueSignal[];
  summary: {
    todayAssignedJobs: number;
    todayInspections: number;
    activeAssignments: number;
    requiredDocuments: number;
    incompleteChecklists: number;
    openIssues: number;
    completedToday: number;
  };
};

const priorityRank: Record<FieldAssignmentPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const statusLabels: Record<FieldStatusAction, string> = {
  arrived: "Arrived",
  en_route: "En Route",
  paused: "Paused",
  scheduled: "Scheduled",
  unable_to_complete: "Unable to Complete",
  work_completed: "Work Completed",
  work_started: "Work Started",
};

const statusNotePrefixes = [
  "Field status -",
  "Field issue -",
  "Field material issue -",
  "Office attention required -",
];

export function buildFieldOperationsSnapshot(
  snapshot: CrmSnapshot,
  options: { now?: Date } = {},
): FieldOperationsSnapshot {
  const now = options.now ?? new Date();
  const today = toIsoDate(now);
  const assignments = [
    ...snapshot.jobs
      .filter((job) => includeJobAssignment(snapshot, job, today))
      .map((job) => buildJobAssignment(snapshot, job, today)),
    ...snapshot.inspections
      .filter((inspection) => includeInspectionAssignment(inspection, today))
      .map((inspection) => buildInspectionAssignment(snapshot, inspection, today)),
  ].sort(compareAssignments);
  const todayAssignedJobs = assignments.filter(
    (assignment) => assignment.kind === "job" && assignmentOverlapsDate(assignment, today),
  );
  const todayInspections = assignments.filter(
    (assignment) =>
      assignment.kind === "inspection" && assignmentOverlapsDate(assignment, today),
  );
  const currentActiveAssignment =
    assignments.find((assignment) =>
      ["arrived", "work_started", "paused", "unable_to_complete"].includes(
        assignment.currentStatus,
      ),
    ) ??
    todayAssignedJobs.find((assignment) => assignment.currentStatus !== "work_completed") ??
    todayInspections.find((assignment) => assignment.currentStatus !== "work_completed") ??
    null;
  const nextAssignment =
    assignments.find(
      (assignment) =>
        assignment.currentStatus === "scheduled" &&
        assignment.scheduledStart !== null &&
        assignment.scheduledStart >= now.toISOString(),
    ) ??
    todayAssignedJobs.find((assignment) => assignment.id !== currentActiveAssignment?.id) ??
    todayInspections.find((assignment) => assignment.id !== currentActiveAssignment?.id) ??
    null;
  const officeMessages = assignments.filter((assignment) => assignment.officeMessages.length);
  const requiredDocuments = assignments.filter((assignment) =>
    assignment.requiredDocuments.some((document) => document.status === "missing"),
  );
  const incompleteChecklists = assignments.filter(
    (assignment) => assignment.incompleteChecklistCount > 0,
  );
  const openIssues = assignments.filter((assignment) => assignment.openIssueCount > 0);
  const completedToday = assignments.filter((assignment) => assignment.completedToday);
  const operationsQueueIssues = assignments.flatMap((assignment) => assignment.issueSignals);

  return {
    assignments,
    todayAssignedJobs,
    todayInspections,
    currentActiveAssignment,
    nextAssignment,
    officeMessages,
    requiredDocuments,
    incompleteChecklists,
    openIssues,
    completedToday,
    operationsQueueIssues,
    summary: {
      todayAssignedJobs: todayAssignedJobs.length,
      todayInspections: todayInspections.length,
      activeAssignments: assignments.filter((assignment) =>
        ["en_route", "arrived", "work_started", "paused"].includes(
          assignment.currentStatus,
        ),
      ).length,
      requiredDocuments: requiredDocuments.length,
      incompleteChecklists: incompleteChecklists.length,
      openIssues: openIssues.length,
      completedToday: completedToday.length,
    },
  };
}

export function getFieldStatusLabel(status: FieldStatusAction) {
  return statusLabels[status];
}

export function fieldStatusRequiresReason(status: FieldStatusAction) {
  return status === "paused" || status === "unable_to_complete";
}

export function buildFieldStatusNote({
  assignment,
  status,
  reason,
  timestamp,
}: {
  assignment: FieldAssignment;
  status: FieldStatusAction;
  reason?: string | null;
  timestamp?: Date;
}) {
  const occurredAt = timestamp ?? new Date();
  const lines = [
    `Field status - ${getFieldStatusLabel(status)} at ${occurredAt.toISOString()}.`,
    reason?.trim() ? `Reason: ${reason.trim()}` : null,
    `Assignment: ${assignment.title}`,
    `Property: ${assignment.propertyAddress}`,
  ].filter(Boolean);

  return lines.join("\n");
}

export function buildFieldIssueNote({
  assignment,
  category,
  priority,
  description,
  requestedOfficeAction,
}: {
  assignment: FieldAssignment;
  category: FieldIssueCategory;
  priority: FieldAssignmentPriority;
  description: string;
  requestedOfficeAction: string;
}) {
  return [
    `Field issue - ${category}`,
    `Priority: ${priority}`,
    `Description: ${description.trim()}`,
    `Requested office action: ${requestedOfficeAction.trim() || "Review and advise"}`,
    `Customer: ${assignment.customerName}`,
    `Property: ${assignment.propertyAddress}`,
  ].join("\n");
}

export function buildFieldMaterialIssueNote({
  assignment,
  materialAction,
  materialName,
  quantity,
  unit,
  details,
}: {
  assignment: FieldAssignment;
  materialAction: string;
  materialName: string;
  quantity: number;
  unit: string;
  details?: string | null;
}) {
  return [
    `Field material issue - ${materialAction}`,
    `Material: ${quantity} ${unit} ${materialName}`.trim(),
    details?.trim() ? `Details: ${details.trim()}` : null,
    `Customer: ${assignment.customerName}`,
    `Property: ${assignment.propertyAddress}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildJobAssignment(
  snapshot: CrmSnapshot,
  job: JobRecord,
  today: string,
): FieldAssignment {
  const company = snapshot.companies.find((item) => item.id === job.company_id) ?? null;
  const customer = job.customer_id
    ? snapshot.customers.find((item) => item.id === job.customer_id) ?? null
    : null;
  const lead = job.lead_id
    ? snapshot.leads.find((item) => item.id === job.lead_id) ?? null
    : null;
  const property = job.property_id
    ? snapshot.properties.find((item) => item.id === job.property_id) ?? null
    : null;
  const scheduleEvent = getJobScheduleEvents(snapshot, job.id).find(
    (event) => event.status !== "canceled",
  );
  const notes = snapshot.jobNotes
    .filter((note) => note.job_id === job.id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const materialOrders = snapshot.materialOrders.filter((order) => order.job_id === job.id);
  const materials = snapshot.jobMaterials.filter((material) => material.job_id === job.id);
  const documents = snapshot.documents.filter((document) => document.job_id === job.id);
  const photos = snapshot.jobPhotos.filter((photo) => photo.job_id === job.id);
  const tasks = snapshot.jobTasks
    .filter((task) => task.job_id === job.id)
    .sort((left, right) => left.sort_order - right.sort_order);
  const propertyAddress = getJobDisplayAddress(job);
  const requiredDocuments = buildRequiredDocuments(documents, ["Signed contract", "Permit", "Material order"]);
  const issueSignals = buildIssueSignals({
    companyId: job.company_id,
    sourceRecordId: job.id,
    sourceModule: "Jobs",
    assignmentId: `job:${job.id}`,
    customerName: customer?.display_name ?? lead?.contact_name ?? job.title,
    propertyLabel: property?.display_name ?? propertyAddress,
    notes,
  });
  const materialIssueSignals = buildMaterialIssueSignals({
    companyId: job.company_id,
    sourceRecordId: job.id,
    assignmentId: `job:${job.id}`,
    customerName: customer?.display_name ?? lead?.contact_name ?? job.title,
    propertyLabel: property?.display_name ?? propertyAddress,
    notes,
  });

  return {
    id: `job:${job.id}`,
    kind: "job",
    companyId: job.company_id,
    companyName: company?.name ?? "Company",
    sourceRecordId: job.id,
    customerId: job.customer_id,
    customerName: customer?.display_name ?? lead?.contact_name ?? job.title,
    customerPhone: customer?.phone ?? lead?.phone ?? null,
    customerEmail: customer?.email ?? lead?.email ?? null,
    propertyId: job.property_id ?? null,
    propertyLabel: property?.display_name ?? propertyAddress,
    propertyAddress,
    propertyNickname: property?.portfolio_label ?? null,
    assignmentType: job.service_type === "painting" ? "Painting job" : "Roofing job",
    title: job.title,
    scheduledStart: getJobScheduledStart(job) ?? scheduleEvent?.start_at ?? null,
    scheduledEnd: getJobScheduledEnd(job) ?? scheduleEvent?.end_at ?? null,
    assignedCrew: job.crew_name?.trim() || getAssignmentCrew(snapshot, job.id) || "Crew needed",
    assignedEmployee: job.project_manager?.trim() || getAssignmentEmployee(snapshot, job.id) || "Field owner needed",
    workflowStage: jobStatusLabel(job.status),
    serviceType: job.service_type,
    priority: deriveJobPriority(job, requiredDocuments, notes, materialOrders),
    currentStatus: deriveJobFieldStatus(job, notes),
    suggestedNextAction: deriveJobNextAction(job, requiredDocuments, tasks, notes),
    accessInstructions: buildAccessInstructions(property),
    gateCode: property?.gate_code ?? null,
    propertyNotes: property?.notes ?? job.notes ?? "No field notes recorded.",
    systemSummary: buildSystemSummary(property, job.service_type),
    inspectionSummary: buildJobInspectionSummary(snapshot, job),
    requiredDocuments,
    checklist: buildFieldChecklist(tasks, job.service_type),
    documents,
    photos,
    notes,
    officeMessages: buildOfficeMessages(snapshot, job.customer_id, job.id, notes),
    materials,
    materialOrders,
    issueSignals: [...issueSignals, ...materialIssueSignals],
    incompleteChecklistCount: tasks.filter((task) => task.status !== "done").length,
    requiredDocumentCount: requiredDocuments.filter((document) => document.status === "missing").length,
    openIssueCount: issueSignals.length + materialIssueSignals.length,
    photoCount: photos.length,
    completedToday: job.status === "completed" && datePart(job.updated_at) === today,
  };
}

function buildInspectionAssignment(
  snapshot: CrmSnapshot,
  inspection: InspectionRecord,
  today: string,
): FieldAssignment {
  const company = snapshot.companies.find((item) => item.id === inspection.company_id) ?? null;
  const customer = inspection.customer_id
    ? snapshot.customers.find((item) => item.id === inspection.customer_id) ?? null
    : null;
  const lead = inspection.lead_id
    ? snapshot.leads.find((item) => item.id === inspection.lead_id) ?? null
    : null;
  const linkedJob = inspection.job_id
    ? snapshot.jobs.find((job) => job.id === inspection.job_id) ?? null
    : null;
  const property = inspection.property_id
    ? snapshot.properties.find((item) => item.id === inspection.property_id) ?? null
    : linkedJob?.property_id
      ? snapshot.properties.find((item) => item.id === linkedJob.property_id) ?? null
      : null;
  const propertyAddress =
    inspection.property_address ??
    property?.address ??
    (linkedJob ? getJobDisplayAddress(linkedJob) : "Address to confirm");
  const photos = snapshot.jobPhotos.filter((photo) => photo.inspection_id === inspection.id);
  const documents = snapshot.documents.filter(
    (document) =>
      document.inspection_id === inspection.id ||
      (inspection.report_document_id !== null && document.id === inspection.report_document_id),
  );
  const notes = linkedJob
    ? snapshot.jobNotes
        .filter((note) => note.job_id === linkedJob.id)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
    : [];
  const pseudoNotes = [
    inspection.notes
      ? {
          id: `inspection-note:${inspection.id}`,
          job_id: linkedJob?.id ?? inspection.id,
          note: inspection.notes,
          created_at: inspection.updated_at,
        }
      : null,
    inspection.internal_notes
      ? {
          id: `inspection-internal:${inspection.id}`,
          job_id: linkedJob?.id ?? inspection.id,
          note: inspection.internal_notes,
          created_at: inspection.updated_at,
        }
      : null,
  ].filter((note): note is JobNoteRecord => note !== null);
  const allNotes = [...pseudoNotes, ...notes];
  const issueSignals = buildIssueSignals({
    companyId: inspection.company_id,
    sourceRecordId: inspection.id,
    sourceModule: "Inspections",
    assignmentId: `inspection:${inspection.id}`,
    customerName: customer?.display_name ?? lead?.contact_name ?? inspection.title,
    propertyLabel: property?.display_name ?? propertyAddress,
    notes: allNotes,
  });

  return {
    id: `inspection:${inspection.id}`,
    kind: "inspection",
    companyId: inspection.company_id,
    companyName: company?.name ?? "Company",
    sourceRecordId: inspection.id,
    customerId: inspection.customer_id,
    customerName: customer?.display_name ?? lead?.contact_name ?? inspection.title,
    customerPhone: customer?.phone ?? lead?.phone ?? null,
    customerEmail: customer?.email ?? lead?.email ?? null,
    propertyId: inspection.property_id ?? linkedJob?.property_id ?? null,
    propertyLabel: property?.display_name ?? propertyAddress,
    propertyAddress,
    propertyNickname: property?.portfolio_label ?? null,
    assignmentType: "Inspection",
    title: inspection.title,
    scheduledStart: inspection.scheduled_start,
    scheduledEnd: inspection.scheduled_end,
    assignedCrew: linkedJob?.crew_name?.trim() || "Inspector only",
    assignedEmployee: inspection.assigned_inspector?.trim() || getEmployeeName(snapshot, inspection.employee_id) || "Inspector needed",
    workflowStage: inspectionStatusLabel(inspection.status),
    serviceType:
      linkedJob?.service_type ??
      (inspection.service_category.includes("painting") ? "painting" : "roofing"),
    priority: mapLeadPriority(inspection.priority),
    currentStatus: deriveInspectionFieldStatus(inspection),
    suggestedNextAction: inspection.status === "completed" ? "Review findings and hand off estimate." : "Complete inspection checklist and capture field notes.",
    accessInstructions: buildAccessInstructions(property),
    gateCode: property?.gate_code ?? null,
    propertyNotes: property?.notes ?? inspection.internal_notes ?? "No field notes recorded.",
    systemSummary: buildSystemSummary(property, linkedJob?.service_type ?? "roofing"),
    inspectionSummary: `${inspectionStatusLabel(inspection.status)} · ${inspection.inspection_type.replace(/_/g, " ")}`,
    requiredDocuments: buildRequiredDocuments(documents, ["Inspection report"]),
    checklist: buildInspectionChecklist(inspection),
    documents,
    photos,
    notes: allNotes,
    officeMessages: buildOfficeMessages(snapshot, inspection.customer_id, linkedJob?.id ?? null, allNotes),
    materials: linkedJob ? snapshot.jobMaterials.filter((material) => material.job_id === linkedJob.id) : [],
    materialOrders: linkedJob ? snapshot.materialOrders.filter((order) => order.job_id === linkedJob.id) : [],
    issueSignals,
    incompleteChecklistCount: inspection.status === "completed" ? 0 : buildInspectionChecklist(inspection).filter((item) => item.status !== "done").length,
    requiredDocumentCount: 0,
    openIssueCount: issueSignals.length,
    photoCount: photos.length,
    completedToday:
      inspection.status === "completed" &&
      datePart(inspection.completed_at ?? inspection.updated_at) === today,
  };
}

function includeJobAssignment(snapshot: CrmSnapshot, job: JobRecord, today: string) {
  if (job.status === "cancelled" || job.status === "canceled" || job.status === "closed") {
    return false;
  }

  const scheduledDate = datePart(getJobScheduledStart(job) ?? getJobScheduledEnd(job));
  const hasTodayEvent = getJobScheduleEvents(snapshot, job.id).some(
    (event) => event.status !== "canceled" && datePart(event.start_at) === today,
  );
  const hasTodayAssignment = snapshot.jobAssignments.some(
    (assignment) => assignment.job_id === job.id && assignment.assigned_date === today,
  );

  return (
    scheduledDate === today ||
    hasTodayEvent ||
    hasTodayAssignment ||
    job.status === "in_progress" ||
    job.status === "blocked"
  );
}

function includeInspectionAssignment(inspection: InspectionRecord, today: string) {
  if (inspection.status === "canceled") {
    return false;
  }

  return (
    datePart(inspection.scheduled_start) === today ||
    inspection.status === "in_progress" ||
    (inspection.status === "completed" && datePart(inspection.completed_at) === today)
  );
}

function assignmentOverlapsDate(assignment: FieldAssignment, date: string) {
  const start = datePart(assignment.scheduledStart);
  const end = datePart(assignment.scheduledEnd);

  return start === date || end === date || (!start && assignment.currentStatus === "work_started");
}

function compareAssignments(left: FieldAssignment, right: FieldAssignment) {
  const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const leftStart = left.scheduledStart ?? "9999-12-31T00:00:00.000Z";
  const rightStart = right.scheduledStart ?? "9999-12-31T00:00:00.000Z";

  return leftStart.localeCompare(rightStart);
}

function buildRequiredDocuments(
  documents: DocumentRecord[],
  expectedLabels: string[],
): FieldDocumentRequirement[] {
  return expectedLabels.map((label) => {
    const normalizedLabel = normalizeText(label);
    const document = documents.find((item) => {
      const searchable = normalizeText([item.title, item.category, item.file_name].join(" "));

      return searchable.includes(normalizedLabel.split(" ")[0]);
    });
    const isMissing =
      !document ||
      (document.requirement_level === "required" &&
        !document.file_url &&
        !document.storage_path &&
        !document.body);

    return {
      id: `${label.toLowerCase().replace(/\s+/g, "-")}:${document?.id ?? "missing"}`,
      label,
      status: isMissing ? "missing" : "ready",
      documentId: document?.id ?? null,
    };
  });
}

function buildFieldChecklist(tasks: JobTaskRecord[], serviceType: "roofing" | "painting" | "both") {
  const taskItems = tasks.map((task): FieldChecklistItem => ({
    id: `task:${task.id}`,
    taskId: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    section: inferChecklistSection(task.title, serviceType),
    photoRequired: normalizeText(task.title).includes("photo"),
    signatureRequired: normalizeText(task.title).includes("signature"),
  }));

  if (taskItems.length) {
    return taskItems;
  }

  const defaults = serviceType === "painting"
    ? ["Confirm colors", "Protect surfaces", "Capture before photos", "Final walkthrough"]
    : ["Arrival photo", "Safety setup", "Roof inspection", "Completion photo"];

  return defaults.map((title, index): FieldChecklistItem => ({
    id: `default:${index}`,
    taskId: null,
    title,
    description: "Create this checklist item on the job before tracking it.",
    status: "todo",
    section: inferChecklistSection(title, serviceType),
    photoRequired: normalizeText(title).includes("photo"),
    signatureRequired: false,
  }));
}

function buildInspectionChecklist(inspection: InspectionRecord) {
  const checklistItems = inspection.checklist
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const items = checklistItems.length
    ? checklistItems
    : ["Confirm access", "Capture field photos", "Record findings", "Review next action"];

  return items.map((title, index): FieldChecklistItem => ({
    id: `inspection-task:${inspection.id}:${index}`,
    taskId: null,
    title,
    description: "Inspection checklist item",
    status: inspection.status === "completed" ? "done" : "todo",
    section: "Inspection checklist",
    photoRequired: normalizeText(title).includes("photo"),
    signatureRequired: normalizeText(title).includes("signature"),
  }));
}

function buildIssueSignals({
  companyId,
  sourceRecordId,
  sourceModule,
  assignmentId,
  customerName,
  propertyLabel,
  notes,
}: {
  companyId: string;
  sourceRecordId: string;
  sourceModule: "Jobs" | "Inspections";
  assignmentId: string;
  customerName: string;
  propertyLabel: string;
  notes: JobNoteRecord[];
}) {
  return notes
    .filter((note) =>
      statusNotePrefixes.some((prefix) => note.note.toLowerCase().startsWith(prefix.toLowerCase())),
    )
    .filter((note) => !note.note.toLowerCase().includes("work completed"))
    .map((note): FieldIssueSignal => {
      const priority = extractPriority(note.note);

      return {
        id: `field-issue:${sourceRecordId}:${note.id}`,
        companyId,
        sourceRecordId,
        sourceModule,
        assignmentId,
        customerName,
        propertyLabel,
        priority,
        category: extractIssueCategory(note.note),
        title: deriveIssueTitle(note.note),
        detail: firstUsefulLine(note.note),
        createdAt: note.created_at,
        suggestedNextAction: priority === "critical" ? "Call the field team now." : "Review field note and respond.",
      };
    });
}

function buildMaterialIssueSignals({
  companyId,
  sourceRecordId,
  assignmentId,
  customerName,
  propertyLabel,
  notes,
}: {
  companyId: string;
  sourceRecordId: string;
  assignmentId: string;
  customerName: string;
  propertyLabel: string;
  notes: JobNoteRecord[];
}) {
  return notes
    .filter((note) => note.note.toLowerCase().startsWith("field material issue -"))
    .map((note): FieldIssueSignal => ({
      id: `field-material:${sourceRecordId}:${note.id}`,
      companyId,
      sourceRecordId,
      sourceModule: "Jobs",
      assignmentId,
      customerName,
      propertyLabel,
      priority: "high",
      category: "Material issue",
      title: "Missing material or delivery issue",
      detail: firstUsefulLine(note.note),
      createdAt: note.created_at,
      suggestedNextAction: "Review material request and update purchasing.",
    }));
}

function buildOfficeMessages(
  snapshot: CrmSnapshot,
  customerId: string | null,
  jobId: string | null,
  notes: JobNoteRecord[],
) {
  const messages = [
    ...notes.slice(0, 3).map((note) => ({
      id: `note:${note.id}`,
      label: "Job note",
      detail: firstUsefulLine(note.note),
      createdAt: note.created_at,
    })),
    ...snapshot.smsMessages
      .filter((message) => message.customer_id === customerId || message.job_id === jobId)
      .slice(0, 2)
      .map((message) => ({
        id: `sms:${message.id}`,
        label: "SMS",
        detail: message.body,
        createdAt: message.created_at,
      })),
    ...snapshot.emailMessages
      .filter((message) => message.customer_id === customerId)
      .slice(0, 2)
      .map((message) => ({
        id: `email:${message.id}`,
        label: "Email",
        detail: message.subject,
        createdAt: message.created_at,
      })),
  ];

  return messages.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function deriveJobPriority(
  job: JobRecord,
  requiredDocuments: FieldDocumentRequirement[],
  notes: JobNoteRecord[],
  materialOrders: MaterialOrderRecord[],
): FieldAssignmentPriority {
  if (job.status === "blocked" || notes.some((note) => normalizeText(note.note).includes("safety"))) {
    return "critical";
  }

  if (
    requiredDocuments.some((document) => document.status === "missing") ||
    materialOrders.some((order) => order.status === "draft" || order.status === "partial")
  ) {
    return "high";
  }

  if (job.status === "in_progress") {
    return "medium";
  }

  return "low";
}

function deriveJobFieldStatus(job: JobRecord, notes: JobNoteRecord[]): FieldStatusAction {
  const latestStatusNote = notes.find((note) => note.note.startsWith("Field status -"));

  if (latestStatusNote) {
    const normalized = normalizeText(latestStatusNote.note);

    if (normalized.includes("unable to complete")) return "unable_to_complete";
    if (normalized.includes("work completed")) return "work_completed";
    if (normalized.includes("work started")) return "work_started";
    if (normalized.includes("paused")) return "paused";
    if (normalized.includes("arrived")) return "arrived";
    if (normalized.includes("en route")) return "en_route";
  }

  if (job.status === "completed" || job.status === "closed") return "work_completed";
  if (job.status === "blocked") return "paused";
  if (job.status === "in_progress") return "work_started";

  return "scheduled";
}

function deriveInspectionFieldStatus(inspection: InspectionRecord): FieldStatusAction {
  if (inspection.status === "completed") return "work_completed";
  if (inspection.status === "in_progress") return "work_started";

  return "scheduled";
}

function deriveJobNextAction(
  job: JobRecord,
  requiredDocuments: FieldDocumentRequirement[],
  tasks: JobTaskRecord[],
  notes: JobNoteRecord[],
) {
  if (job.status === "blocked") return "Resolve blocker before sending crew.";
  if (notes.some((note) => normalizeText(note.note).includes("unable to complete"))) {
    return "Office should review the unable-to-complete reason.";
  }
  if (requiredDocuments.some((document) => document.status === "missing")) {
    return "Confirm required documents before field completion.";
  }
  if (tasks.some((task) => task.status !== "done")) {
    return "Complete the remaining checklist items.";
  }

  return "Capture completion notes and photos.";
}

function buildAccessInstructions(property: PropertyRecord | null) {
  return [
    property?.access_instructions,
  ].filter(Boolean).join(" ") || "No access instructions recorded.";
}

function buildSystemSummary(property: PropertyRecord | null, serviceType: "roofing" | "painting" | "both") {
  if (!property) {
    return "Property system details are not linked yet.";
  }

  if (serviceType === "painting") {
    return [
      property.paint_system ? `Paint system: ${property.paint_system}` : null,
      property.exterior_finish ? `Exterior finish: ${property.exterior_finish}` : null,
      property.paint_condition ? `Paint condition: ${property.paint_condition}` : null,
    ].filter(Boolean).join(" · ") || "Painting system details are not recorded.";
  }

  return [
    property.roof_system ? `Roof system: ${property.roof_system}` : null,
    property.roofing_material ? `Material: ${property.roofing_material}` : null,
    property.roof_age_years ? `Roof age: ${property.roof_age_years} years` : null,
    property.roof_pitch ? `Pitch: ${property.roof_pitch}` : null,
    property.has_solar ? "Solar present" : null,
    property.has_skylights ? "Skylights present" : null,
    property.hvac_penetrations ? `HVAC: ${property.hvac_penetrations}` : null,
  ].filter(Boolean).join(" · ") || "Roof system details are not recorded.";
}

function buildJobInspectionSummary(snapshot: CrmSnapshot, job: JobRecord) {
  const inspection = snapshot.inspections
    .filter((item) => item.job_id === job.id)
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0];

  if (!inspection) {
    return "No linked inspection yet.";
  }

  return `${inspection.title} · ${inspectionStatusLabel(inspection.status)}`;
}

function getJobScheduleEvents(snapshot: CrmSnapshot, jobId: string): ScheduleEventRecord[] {
  return snapshot.scheduleEvents.filter((event) => event.job_id === jobId);
}

function getAssignmentCrew(snapshot: CrmSnapshot, jobId: string) {
  const assignment = snapshot.jobAssignments.find((item) => item.job_id === jobId);

  return assignment ? getEmployeeName(snapshot, assignment.employee_id) : null;
}

function getAssignmentEmployee(snapshot: CrmSnapshot, jobId: string) {
  return getAssignmentCrew(snapshot, jobId);
}

function getEmployeeName(snapshot: CrmSnapshot, employeeId: string | null | undefined) {
  if (!employeeId) {
    return null;
  }

  return snapshot.employees.find((employee) => employee.id === employeeId)?.full_name ?? null;
}

function inferChecklistSection(
  title: string,
  serviceType: "roofing" | "painting" | "both",
): FieldChecklistSection {
  const normalized = normalizeText(title);

  if (normalized.includes("safety") || normalized.includes("ppe")) return "Safety checklist";
  if (normalized.includes("arrival") || normalized.includes("access")) return "Arrival checklist";
  if (normalized.includes("inspection") || normalized.includes("finding")) return "Inspection checklist";
  if (normalized.includes("cleanup") || normalized.includes("clean up")) return "Cleanup checklist";
  if (normalized.includes("complete") || normalized.includes("walkthrough") || normalized.includes("signature")) {
    return "Completion checklist";
  }
  if (serviceType === "painting" && (normalized.includes("mask") || normalized.includes("prep"))) {
    return "Production checklist";
  }

  return "Production checklist";
}

function extractPriority(text: string): FieldAssignmentPriority {
  const normalized = normalizeText(text);

  if (normalized.includes("critical") || normalized.includes("safety")) return "critical";
  if (normalized.includes("high") || normalized.includes("unable")) return "high";
  if (normalized.includes("low")) return "low";

  return "medium";
}

function extractIssueCategory(text: string): FieldIssueCategory | "Completion blocked" {
  const normalized = normalizeText(text);

  if (normalized.includes("unable to complete")) return "Completion blocked";
  if (normalized.includes("safety")) return "Safety";
  if (normalized.includes("customer concern")) return "Customer concern";
  if (normalized.includes("scope discrepancy")) return "Scope discrepancy";
  if (normalized.includes("hidden damage")) return "Hidden damage";
  if (normalized.includes("material")) return "Material issue";
  if (normalized.includes("access")) return "Access issue";
  if (normalized.includes("weather")) return "Weather";
  if (normalized.includes("scheduling")) return "Scheduling";
  if (normalized.includes("quality")) return "Quality concern";
  if (normalized.includes("additional work")) return "Additional work";

  return "Other";
}

function deriveIssueTitle(text: string) {
  if (normalizeText(text).includes("unable to complete")) {
    return "Unable to complete field assignment";
  }

  return text.split("\n")[0]?.replace("Field issue - ", "Field issue: ") || "Field issue";
}

function firstUsefulLine(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.toLowerCase().startsWith("priority:")) ?? text;
}

function jobStatusLabel(status: JobRecord["status"]) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function inspectionStatusLabel(status: InspectionRecord["status"]) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function mapLeadPriority(priority: string | null | undefined): FieldAssignmentPriority {
  if (priority === "urgent") return "critical";
  if (priority === "high") return "high";
  if (priority === "low") return "low";

  return "medium";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

function datePart(value: string | null | undefined) {
  return value?.slice(0, 10) ?? null;
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
