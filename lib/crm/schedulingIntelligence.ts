import {
  getJobDisplayAddress,
  getJobScheduledEnd,
  getJobScheduledStart,
} from "./jobs";
import type {
  CrmSnapshot,
  CustomerRecord,
  EmployeeRecord,
  InspectionRecord,
  JobRecord,
  LeadPriority,
  MaterialOrderRecord,
  PropertyRecord,
  ScheduleEventRecord,
} from "./types";

export type SchedulingPriority = "critical" | "high" | "medium" | "low";

export type SchedulingAlertType =
  | "double_booking"
  | "crew_unavailable"
  | "estimator_unavailable"
  | "missing_crew"
  | "missing_estimator"
  | "missing_documents"
  | "missing_inspection"
  | "material_delay"
  | "material_missing"
  | "customer_conflict"
  | "production_conflict"
  | "company_mismatch"
  | "invalid_duration"
  | "travel_time_review"
  | "weather_delay_placeholder";

export type SchedulingSourceModule =
  | "Calendar"
  | "Dispatch"
  | "Documents"
  | "Inspections"
  | "Jobs"
  | "Materials"
  | "Properties";

export type SchedulingTargetView =
  | "calendar"
  | "documents"
  | "inspections"
  | "jobs"
  | "orders"
  | "customers"
  | "operations";

export type SchedulingWorkItemKind = "job" | "inspection" | "schedule_event";

export type SchedulingWorkItem = {
  id: string;
  kind: SchedulingWorkItemKind;
  companyId: string;
  companyName: string;
  customerId: string | null;
  customerName: string;
  propertyId: string | null;
  propertyLabel: string;
  title: string;
  address: string;
  workflowStage: string;
  sourceModule: SchedulingSourceModule;
  sourceRecordId: string;
  targetView: SchedulingTargetView;
  startAt: string | null;
  endAt: string | null;
  durationMinutes: number | null;
  crew: string;
  estimator: string;
  serviceLabel: string;
  roofType: string;
  inspectionStatus: string;
  requiredDocuments: string[];
  priority: SchedulingPriority;
};

export type SchedulingAlert = {
  id: string;
  type: SchedulingAlertType;
  priority: SchedulingPriority;
  companyId: string;
  companyName: string;
  customerId: string | null;
  customerName: string;
  propertyId: string | null;
  propertyLabel: string;
  category: string;
  assignedOwner: string;
  dueAt: string | null;
  workflowStage: string;
  sourceModule: SchedulingSourceModule;
  sourceRecordId: string;
  targetView: SchedulingTargetView;
  status: "open" | "today" | "upcoming" | "overdue";
  title: string;
  detail: string;
  suggestedNextAction: string;
};

export type SchedulingCapacityItem = {
  id: string;
  type: "employee" | "crew";
  companyId: string;
  companyName: string;
  label: string;
  role: string;
  assignedCount: number;
  scheduledMinutes: number;
  available: boolean;
  detail: string;
};

export type SchedulingIntelligence = {
  todaySchedule: SchedulingWorkItem[];
  tomorrowSchedule: SchedulingWorkItem[];
  unassignedJobs: SchedulingWorkItem[];
  schedulingConflicts: SchedulingAlert[];
  overbookedEmployees: SchedulingCapacityItem[];
  availableCapacity: SchedulingCapacityItem[];
  upcomingInspections: SchedulingWorkItem[];
  productionQueue: SchedulingWorkItem[];
  alerts: SchedulingAlert[];
  summary: {
    today: number;
    tomorrow: number;
    unassignedJobs: number;
    conflicts: number;
    overbookedEmployees: number;
    availableCapacity: number;
    upcomingInspections: number;
    productionQueue: number;
  };
};

type SchedulingContext = {
  now: Date;
  today: string;
  tomorrow: string;
  nextWeek: string;
  companiesById: Map<string, string>;
  customersById: Map<string, CustomerRecord>;
  propertiesById: Map<string, PropertyRecord>;
};

type SchedulingAlertDetector = {
  id: SchedulingAlertType;
  detect: (
    snapshot: CrmSnapshot,
    context: SchedulingContext,
    workItems: SchedulingWorkItem[],
  ) => SchedulingAlert[];
};

const priorityRank: Record<SchedulingPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const alertDetectors: SchedulingAlertDetector[] = [
  { id: "double_booking", detect: detectDoubleBookings },
  { id: "missing_crew", detect: detectMissingCrews },
  { id: "missing_estimator", detect: detectMissingEstimators },
  { id: "company_mismatch", detect: detectCompanyMismatches },
  { id: "invalid_duration", detect: detectInvalidDurations },
  { id: "travel_time_review", detect: detectTravelTimeReviews },
  { id: "customer_conflict", detect: detectCustomerConflicts },
  { id: "production_conflict", detect: detectProductionSchedulingConflicts },
  { id: "missing_documents", detect: detectMissingRequiredDocuments },
  { id: "missing_inspection", detect: detectMissingInspections },
  { id: "material_delay", detect: detectMaterialDelays },
  { id: "material_missing", detect: detectMissingMaterials },
  { id: "weather_delay_placeholder", detect: detectWeatherDelayPlaceholders },
];

export function buildSchedulingIntelligence(
  snapshot: CrmSnapshot,
  options: { now?: Date } = {},
): SchedulingIntelligence {
  const context = createSchedulingContext(snapshot, options.now ?? new Date());
  const workItems = buildSchedulingWorkItems(snapshot, context);
  const alerts = sortSchedulingAlerts(
    alertDetectors.flatMap((detector) => detector.detect(snapshot, context, workItems)),
  );
  const availableCapacity = buildSchedulingCapacity(snapshot, context, workItems);
  const overbookedEmployees = availableCapacity.filter(
    (item) => !item.available && item.assignedCount > 1,
  );
  const todaySchedule = workItems.filter((item) =>
    itemOverlapsDate(item, context.today),
  );
  const tomorrowSchedule = workItems.filter((item) =>
    itemOverlapsDate(item, context.tomorrow),
  );
  const unassignedJobs = workItems.filter(
    (item) => item.kind === "job" && (item.crew === "Crew needed" || item.estimator === "Estimator needed"),
  );
  const upcomingInspections = workItems.filter(
    (item) =>
      item.kind === "inspection" &&
      item.startAt !== null &&
      datePart(item.startAt) >= context.today &&
      datePart(item.startAt) <= context.nextWeek,
  );
  const productionQueue = workItems.filter(
    (item) =>
      item.kind === "job" &&
      ["Draft", "Scheduled", "In progress", "Blocked"].includes(item.workflowStage),
  );

  return {
    todaySchedule,
    tomorrowSchedule,
    unassignedJobs,
    schedulingConflicts: alerts.filter((alert) =>
      [
        "double_booking",
        "crew_unavailable",
        "estimator_unavailable",
        "customer_conflict",
        "production_conflict",
        "travel_time_review",
      ].includes(alert.type),
    ),
    overbookedEmployees,
    availableCapacity,
    upcomingInspections,
    productionQueue,
    alerts,
    summary: {
      today: todaySchedule.length,
      tomorrow: tomorrowSchedule.length,
      unassignedJobs: unassignedJobs.length,
      conflicts: alerts.filter((alert) => alert.priority === "critical" || alert.priority === "high").length,
      overbookedEmployees: overbookedEmployees.length,
      availableCapacity: availableCapacity.filter((item) => item.available).length,
      upcomingInspections: upcomingInspections.length,
      productionQueue: productionQueue.length,
    },
  };
}

export function filterSchedulingByCompany<T extends { companyId: string }>(
  items: T[],
  companyId: string,
) {
  if (!companyId || companyId === "all") {
    return items;
  }

  return items.filter((item) => item.companyId === companyId);
}

function createSchedulingContext(snapshot: CrmSnapshot, now: Date): SchedulingContext {
  const today = now.toISOString().slice(0, 10);

  return {
    now,
    today,
    tomorrow: addDays(today, 1),
    nextWeek: addDays(today, 7),
    companiesById: new Map(snapshot.companies.map((company) => [company.id, company.name])),
    customersById: new Map(snapshot.customers.map((customer) => [customer.id, customer])),
    propertiesById: new Map(snapshot.properties.map((property) => [property.id, property])),
  };
}

function buildSchedulingWorkItems(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
): SchedulingWorkItem[] {
  const jobItems = snapshot.jobs.map((job) => createJobWorkItem(snapshot, context, job));
  const inspectionItems = snapshot.inspections
    .filter((inspection) => inspection.status !== "canceled")
    .map((inspection) => createInspectionWorkItem(snapshot, context, inspection));
  const linkedEventIds = new Set(
    [
      ...snapshot.jobs.flatMap((job) =>
        snapshot.scheduleEvents
          .filter((event) => event.job_id === job.id)
          .map((event) => event.id),
      ),
      ...snapshot.inspections
        .map((inspection) => inspection.schedule_event_id)
        .filter((id): id is string => Boolean(id)),
    ],
  );
  const calendarOnlyItems = snapshot.scheduleEvents
    .filter((event) => event.status !== "canceled" && !linkedEventIds.has(event.id))
    .map((event) => createScheduleEventWorkItem(snapshot, context, event));

  return [...jobItems, ...inspectionItems, ...calendarOnlyItems].sort((left, right) => {
    const leftStart = left.startAt ?? "9999-12-31T00:00:00.000Z";
    const rightStart = right.startAt ?? "9999-12-31T00:00:00.000Z";

    return leftStart.localeCompare(rightStart);
  });
}

function createJobWorkItem(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  job: JobRecord,
): SchedulingWorkItem {
  const scheduleEvent = snapshot.scheduleEvents.find(
    (event) => event.job_id === job.id && event.status === "scheduled",
  );
  const startAt = getJobScheduledStart(job) ?? scheduleEvent?.start_at ?? null;
  const endAt = getJobScheduledEnd(job) ?? scheduleEvent?.end_at ?? null;
  const customer = job.customer_id ? context.customersById.get(job.customer_id) ?? null : null;
  const lead = job.lead_id ? snapshot.leads.find((item) => item.id === job.lead_id) ?? null : null;
  const property = job.property_id ? context.propertiesById.get(job.property_id) ?? null : null;

  return {
    id: `job:${job.id}`,
    kind: "job",
    companyId: job.company_id,
    companyName: context.companiesById.get(job.company_id) ?? "Company",
    customerId: job.customer_id,
    customerName: customer?.display_name ?? lead?.contact_name ?? job.title,
    propertyId: job.property_id ?? null,
    propertyLabel: property?.display_name ?? property?.address ?? getJobDisplayAddress(job),
    title: job.title,
    address: getJobDisplayAddress(job),
    workflowStage: jobStatusLabel(job.status),
    sourceModule: "Jobs",
    sourceRecordId: job.id,
    targetView: "jobs",
    startAt,
    endAt,
    durationMinutes: calculateDurationMinutes(startAt, endAt),
    crew: getJobCrewLabel(snapshot, job),
    estimator: job.project_manager?.trim() || "Estimator needed",
    serviceLabel: serviceTypeLabel(job.service_type),
    roofType: property?.roof_system ?? property?.roofing_material ?? "Roof system not recorded",
    inspectionStatus: getJobInspectionStatus(snapshot, job),
    requiredDocuments: getMissingRequiredDocumentsForJob(snapshot, job),
    priority: job.status === "blocked" ? "critical" : mapLeadPriority(getJobPriority(snapshot, job)),
  };
}

function createInspectionWorkItem(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  inspection: InspectionRecord,
): SchedulingWorkItem {
  const linkedJob = inspection.job_id
    ? snapshot.jobs.find((job) => job.id === inspection.job_id) ?? null
    : null;
  const customer = inspection.customer_id
    ? context.customersById.get(inspection.customer_id) ?? null
    : null;
  const lead = inspection.lead_id
    ? snapshot.leads.find((item) => item.id === inspection.lead_id) ?? null
    : null;
  const property = inspection.property_id
    ? context.propertiesById.get(inspection.property_id) ?? null
    : null;

  return {
    id: `inspection:${inspection.id}`,
    kind: "inspection",
    companyId: inspection.company_id,
    companyName: context.companiesById.get(inspection.company_id) ?? "Company",
    customerId: inspection.customer_id,
    customerName: customer?.display_name ?? lead?.contact_name ?? inspection.title,
    propertyId: inspection.property_id ?? null,
    propertyLabel:
      property?.display_name ??
      property?.address ??
      inspection.property_address ??
      linkedJob?.property_address ??
      "Property to confirm",
    title: inspection.title,
    address:
      inspection.property_address ??
      property?.address ??
      (linkedJob ? getJobDisplayAddress(linkedJob) : "Address to confirm"),
    workflowStage: inspectionStatusLabel(inspection.status),
    sourceModule: "Inspections",
    sourceRecordId: inspection.id,
    targetView: "inspections",
    startAt: inspection.scheduled_start,
    endAt: inspection.scheduled_end,
    durationMinutes: calculateDurationMinutes(inspection.scheduled_start, inspection.scheduled_end),
    crew: linkedJob ? getJobCrewLabel(snapshot, linkedJob) : "Crew not required",
    estimator:
      inspection.assigned_inspector?.trim() ||
      getEmployeeName(snapshot, inspection.employee_id) ||
      "Estimator needed",
    serviceLabel: serviceTypeLabel(getInspectionServiceType(inspection)),
    roofType: property?.roof_system ?? property?.roofing_material ?? "Roof system not recorded",
    inspectionStatus: inspectionStatusLabel(inspection.status),
    requiredDocuments: [],
    priority: mapLeadPriority(inspection.priority),
  };
}

function createScheduleEventWorkItem(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  event: ScheduleEventRecord,
): SchedulingWorkItem {
  const customer = event.customer_id ? context.customersById.get(event.customer_id) ?? null : null;
  const property = event.property_id ? context.propertiesById.get(event.property_id) ?? null : null;

  return {
    id: `schedule:${event.id}`,
    kind: "schedule_event",
    companyId: event.company_id,
    companyName: context.companiesById.get(event.company_id) ?? "Company",
    customerId: event.customer_id,
    customerName: customer?.display_name ?? event.title,
    propertyId: event.property_id ?? null,
    propertyLabel: property?.display_name ?? property?.address ?? event.location ?? "Property to confirm",
    title: event.title,
    address: event.location ?? property?.address ?? "Address to confirm",
    workflowStage: scheduleEventTypeLabel(event.event_type),
    sourceModule: "Calendar",
    sourceRecordId: event.id,
    targetView: "calendar",
    startAt: event.start_at,
    endAt: event.end_at,
    durationMinutes: calculateDurationMinutes(event.start_at, event.end_at),
    crew: "Crew not assigned",
    estimator: "Estimator needed",
    serviceLabel: scheduleEventTypeLabel(event.event_type),
    roofType: property?.roof_system ?? property?.roofing_material ?? "Roof system not recorded",
    inspectionStatus: event.event_type === "inspection" ? "Scheduled" : "Not an inspection",
    requiredDocuments: [],
    priority: event.event_type === "follow_up" ? "medium" : "low",
  };
}

function detectDoubleBookings(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  const alerts: SchedulingAlert[] = [];
  const scheduledItems = workItems.filter((item) => item.startAt && item.endAt);

  scheduledItems.forEach((item, index) => {
    scheduledItems.slice(index + 1).forEach((other) => {
      if (
        item.companyId !== other.companyId ||
        !item.startAt ||
        !item.endAt ||
        !other.startAt ||
        !other.endAt ||
        !rangesOverlap(item.startAt, item.endAt, other.startAt, other.endAt)
      ) {
        return;
      }

      if (item.crew !== "Crew needed" && item.crew === other.crew) {
        alerts.push(
          createAlert(context, item, {
            id: `double-booking:crew:${item.id}:${other.id}`,
            type: "double_booking",
            priority: "critical",
            category: "Crew availability",
            assignedOwner: item.crew,
            title: "Double booking",
            detail: `${item.crew} is assigned to ${item.title} and ${other.title} at overlapping times.`,
            suggestedNextAction: "Open dispatch and move one scheduled item.",
            targetView: "calendar",
          }),
        );
      }

      if (item.estimator !== "Estimator needed" && item.estimator === other.estimator) {
        alerts.push(
          createAlert(context, item, {
            id: `double-booking:estimator:${item.id}:${other.id}`,
            type: "estimator_unavailable",
            priority: "critical",
            category: "Estimator availability",
            assignedOwner: item.estimator,
            title: "Estimator unavailable",
            detail: `${item.estimator} is assigned to overlapping work on ${item.title} and ${other.title}.`,
            suggestedNextAction: "Reassign estimator or adjust one appointment.",
            targetView: "calendar",
          }),
        );
      }
    });
  });

  return alerts;
}

function detectMissingCrews(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter(
      (item) =>
        item.kind === "job" &&
        ["Draft", "Scheduled", "In progress", "Blocked"].includes(item.workflowStage) &&
        item.crew === "Crew needed",
    )
    .map((item) =>
      createAlert(context, item, {
        id: `missing-crew:${item.sourceRecordId}`,
        type: "missing_crew",
        priority: item.startAt && datePart(item.startAt) <= context.today ? "critical" : "high",
        category: "Crew availability",
        assignedOwner: "Production",
        title: "Missing assigned crew",
        detail: `${item.title} is not assigned to a crew.`,
        suggestedNextAction: "Assign a crew before production starts.",
        targetView: "jobs",
      }),
    );
}

function detectMissingEstimators(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter(
      (item) =>
        item.kind === "inspection" &&
        item.workflowStage !== "Completed" &&
        item.estimator === "Estimator needed",
    )
    .map((item) =>
      createAlert(context, item, {
        id: `missing-estimator:${item.sourceRecordId}`,
        type: "missing_estimator",
        priority: item.startAt && datePart(item.startAt) <= context.today ? "critical" : "high",
        category: "Technician availability",
        assignedOwner: "Sales",
        title: "Missing assigned estimator",
        detail: `${item.title} has no assigned inspector or estimator.`,
        suggestedNextAction: "Assign an estimator before the appointment.",
        targetView: "inspections",
      }),
    );
}

function detectCompanyMismatches(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  const alerts: SchedulingAlert[] = [];

  snapshot.scheduleEvents.forEach((event) => {
    const job = event.job_id ? snapshot.jobs.find((item) => item.id === event.job_id) ?? null : null;
    const lead = event.lead_id ? snapshot.leads.find((item) => item.id === event.lead_id) ?? null : null;
    const relatedCompanyId = job?.company_id ?? lead?.company_id ?? null;

    if (!relatedCompanyId || relatedCompanyId === event.company_id) {
      return;
    }

    const item =
      workItems.find((candidate) => candidate.id === `job:${job?.id}`) ??
      workItems.find((candidate) => candidate.id === `schedule:${event.id}`);

    if (!item) {
      return;
    }

    alerts.push(
      createAlert(context, item, {
        id: `company-mismatch:${event.id}`,
        type: "company_mismatch",
        priority: "critical",
        category: "Company assignment",
        assignedOwner: "Office",
        title: "Company assignment mismatch",
        detail: `${event.title} is scheduled under a different company than its linked workflow.`,
        suggestedNextAction: "Review company assignment before dispatch.",
        targetView: "calendar",
      }),
    );
  });

  return alerts;
}

function detectInvalidDurations(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter((item) => item.startAt && item.endAt && (item.durationMinutes === null || item.durationMinutes <= 0 || item.durationMinutes > 12 * 60))
    .map((item) =>
      createAlert(context, item, {
        id: `duration:${item.id}`,
        type: "invalid_duration",
        priority: "high",
        category: "Appointment duration",
        assignedOwner: item.estimator !== "Estimator needed" ? item.estimator : "Office",
        title: "Appointment duration needs review",
        detail: `${item.title} has an unusual or invalid schedule duration.`,
        suggestedNextAction: "Open Calendar and verify the start and end times.",
        targetView: "calendar",
      }),
    );
}

function detectTravelTimeReviews(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  const alerts: SchedulingAlert[] = [];
  const byCrew = new Map<string, SchedulingWorkItem[]>();

  workItems
    .filter((item) => item.startAt && item.endAt && item.crew !== "Crew needed")
    .forEach((item) => {
      const key = `${item.companyId}:${item.crew}`;
      byCrew.set(key, [...(byCrew.get(key) ?? []), item]);
    });

  byCrew.forEach((items) => {
    const sorted = [...items].sort((left, right) =>
      String(left.startAt).localeCompare(String(right.startAt)),
    );

    sorted.forEach((item, index) => {
      const next = sorted[index + 1];

      if (!next || !item.endAt || !next.startAt || datePart(item.endAt) !== datePart(next.startAt)) {
        return;
      }

      const gapMinutes = calculateDurationMinutes(item.endAt, next.startAt);

      if (
        gapMinutes !== null &&
        gapMinutes >= 0 &&
        gapMinutes < 45 &&
        normalizeAddress(item.address) !== normalizeAddress(next.address)
      ) {
        alerts.push(
          createAlert(context, next, {
            id: `travel-time:${item.id}:${next.id}`,
            type: "travel_time_review",
            priority: "medium",
            category: "Travel time",
            assignedOwner: next.crew,
            title: "Travel time review",
            detail: `${next.crew} has less than 45 minutes between different properties.`,
            suggestedNextAction: "Review route timing before confirming dispatch.",
            targetView: "calendar",
          }),
        );
      }
    });
  });

  return alerts;
}

function detectCustomerConflicts(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  const alerts: SchedulingAlert[] = [];
  const scheduledItems = workItems.filter((item) => item.customerId && item.startAt && item.endAt);

  scheduledItems.forEach((item, index) => {
    scheduledItems.slice(index + 1).forEach((other) => {
      if (
        item.customerId !== other.customerId ||
        !item.startAt ||
        !item.endAt ||
        !other.startAt ||
        !other.endAt ||
        !rangesOverlap(item.startAt, item.endAt, other.startAt, other.endAt)
      ) {
        return;
      }

      alerts.push(
        createAlert(context, item, {
          id: `customer-conflict:${item.id}:${other.id}`,
          type: "customer_conflict",
          priority: "high",
          category: "Customer scheduling",
          assignedOwner: "Office",
          title: "Customer scheduling conflict",
          detail: `${item.customerName} has overlapping scheduled work.`,
          suggestedNextAction: "Confirm availability with the customer.",
          targetView: "customers",
        }),
      );
    });
  });

  return alerts;
}

function detectProductionSchedulingConflicts(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter(
      (item) =>
        item.kind === "job" &&
        ["Draft", "Scheduled", "In progress", "Blocked"].includes(item.workflowStage) &&
        !item.startAt,
    )
    .map((item) =>
      createAlert(context, item, {
        id: `production-schedule:${item.sourceRecordId}`,
        type: "production_conflict",
        priority: item.workflowStage === "Draft" ? "medium" : "high",
        category: "Production scheduling",
        assignedOwner: "Production",
        title:
          item.workflowStage === "Draft"
            ? "Job awaiting production scheduling"
            : "Production scheduling conflict",
        detail:
          item.workflowStage === "Draft"
            ? `${item.title} has not been placed on the production schedule.`
            : `${item.title} is active without saved production dates.`,
        suggestedNextAction:
          item.workflowStage === "Draft"
            ? "Open dispatch when the job is ready to schedule."
            : "Schedule production dates before dispatch.",
        targetView: "jobs",
      }),
    );
}

function detectMissingRequiredDocuments(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter((item) => item.kind === "job" && item.requiredDocuments.length > 0)
    .map((item) =>
      createAlert(context, item, {
        id: `required-documents:${item.sourceRecordId}`,
        type: "missing_documents",
        priority: item.startAt && datePart(item.startAt) <= context.today ? "critical" : "high",
        category: "Required documents",
        assignedOwner: "Office",
        title: "Missing required documents",
        detail: `${item.title} is missing ${item.requiredDocuments.join(", ")}.`,
        suggestedNextAction: "Open Documents and complete the start packet.",
        targetView: "documents",
      }),
    );
}

function detectMissingInspections(
  _snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter(
      (item) =>
        item.kind === "job" &&
        ["Scheduled", "In progress", "Blocked"].includes(item.workflowStage) &&
        item.inspectionStatus === "Inspection not recorded",
    )
    .map((item) =>
      createAlert(context, item, {
        id: `required-inspection:${item.sourceRecordId}`,
        type: "missing_inspection",
        priority: "medium",
        category: "Required inspection",
        assignedOwner: "Sales",
        title: "Missing required inspection",
        detail: `${item.title} has no linked inspection record.`,
        suggestedNextAction: "Open Inspections and confirm whether an inspection is required.",
        targetView: "inspections",
      }),
    );
}

function detectMaterialDelays(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return snapshot.materialOrders
    .filter((order) => materialOrderIsDelayed(order, context.today))
    .map((order) => {
      const item = order.job_id
        ? workItems.find((candidate) => candidate.id === `job:${order.job_id}`) ?? null
        : null;

      return createAlert(context, item, {
        id: `material-delay:${order.id}`,
        type: "material_delay",
        priority: "critical",
        companyId: order.company_id,
        category: "Material delay",
        assignedOwner: "Production",
        title: "Material delay placeholder",
        detail: `${order.supplier_name} order is past expected delivery.`,
        suggestedNextAction: "Open Materials and confirm delivery status.",
        sourceModule: "Materials",
        sourceRecordId: order.id,
        targetView: "orders",
        dueAt: order.expected_delivery_date ?? order.requested_date,
      });
    });
}

function detectMissingMaterials(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return workItems
    .filter((item) => {
      if (item.kind !== "job" || !["Scheduled", "In progress"].includes(item.workflowStage)) {
        return false;
      }

      return (
        !snapshot.materialOrders.some((order) => order.job_id === item.sourceRecordId) &&
        !snapshot.jobMaterials.some((material) => material.job_id === item.sourceRecordId)
      );
    })
    .map((item) =>
      createAlert(context, item, {
        id: `material-missing:${item.sourceRecordId}`,
        type: "material_missing",
        priority: "medium",
        category: "Material readiness",
        assignedOwner: "Production",
        title: "Jobs waiting on materials",
        detail: `${item.title} has no material order or material list recorded.`,
        suggestedNextAction: "Open Materials and confirm readiness.",
        targetView: "orders",
      }),
    );
}

function detectWeatherDelayPlaceholders(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingAlert[] {
  return snapshot.jobs
    .filter((job) => {
      const text = [job.title, job.notes, job.scope_of_work, job.status].filter(Boolean).join(" ").toLowerCase();

      return (
        ["weather", "rain", "wind", "storm", "hail", "monsoon"].some((word) => text.includes(word)) &&
        ["delay", "delayed", "blocked", "pause", "paused"].some((word) => text.includes(word))
      );
    })
    .map((job) => {
      const item = workItems.find((candidate) => candidate.id === `job:${job.id}`) ?? null;

      return createAlert(context, item, {
        id: `weather-delay:${job.id}`,
        type: "weather_delay_placeholder",
        priority: job.status === "blocked" ? "high" : "medium",
        companyId: job.company_id,
        category: "Weather delay",
        assignedOwner: job.project_manager?.trim() || "Production",
        title: "Weather delay placeholder",
        detail: `${job.title} contains existing weather-delay language.`,
        suggestedNextAction: "Review job notes before confirming dispatch.",
        sourceModule: "Jobs",
        sourceRecordId: job.id,
        targetView: "jobs",
        dueAt: getJobScheduledStart(job) ?? job.updated_at,
      });
    });
}

function buildSchedulingCapacity(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
): SchedulingCapacityItem[] {
  const employeeCapacity = snapshot.employees
    .filter((employee) => employee.is_active)
    .map((employee) => buildEmployeeCapacity(snapshot, context, workItems, employee));
  const crews = uniqueSorted(
    workItems
      .filter(
        (item) =>
          item.crew !== "Crew needed" &&
          item.crew !== "Crew not required" &&
          item.crew !== "Crew not assigned",
      )
      .map((item) => `${item.companyId}::${item.crew}`),
  );
  const crewCapacity = crews.map((crewKey) => {
    const [companyId, crew] = crewKey.split("::");
    const assigned = workItems.filter(
      (item) => item.companyId === companyId && item.crew === crew && itemOverlapsDate(item, context.today),
    );
    const scheduledMinutes = assigned.reduce(
      (total, item) => total + (item.durationMinutes ?? 0),
      0,
    );

    return {
      id: `crew:${companyId}:${crew}`,
      type: "crew" as const,
      companyId,
      companyName: context.companiesById.get(companyId) ?? "Company",
      label: crew,
      role: "Crew",
      assignedCount: assigned.length,
      scheduledMinutes,
      available: assigned.length === 0,
      detail: assigned.length
        ? `${assigned.length} scheduled item${assigned.length === 1 ? "" : "s"} today`
        : "No scheduled work today",
    };
  });

  return [...employeeCapacity, ...crewCapacity].sort((left, right) => {
    if (left.available !== right.available) {
      return left.available ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildEmployeeCapacity(
  snapshot: CrmSnapshot,
  context: SchedulingContext,
  workItems: SchedulingWorkItem[],
  employee: EmployeeRecord,
): SchedulingCapacityItem {
  const assignments = snapshot.jobAssignments.filter(
    (assignment) =>
      assignment.employee_id === employee.id &&
      assignment.status !== "completed" &&
      datePart(assignment.assigned_date) === context.today,
  );
  const namedWork = workItems.filter(
    (item) =>
      item.companyId === employee.company_id &&
      itemOverlapsDate(item, context.today) &&
      (item.estimator === employee.full_name || item.crew === employee.full_name),
  );
  const assignedCount = assignments.length + namedWork.length;
  const scheduledMinutes = namedWork.reduce(
    (total, item) => total + (item.durationMinutes ?? 0),
    0,
  );

  return {
    id: `employee:${employee.id}`,
    type: "employee",
    companyId: employee.company_id,
    companyName: context.companiesById.get(employee.company_id) ?? "Company",
    label: employee.full_name,
    role: employee.role.replace(/_/g, " "),
    assignedCount,
    scheduledMinutes,
    available: assignedCount === 0,
    detail: assignedCount
      ? `${assignedCount} assignment${assignedCount === 1 ? "" : "s"} today`
      : "No assignment recorded today",
  };
}

function createAlert(
  context: SchedulingContext,
  item: SchedulingWorkItem | null,
  input: {
    id: string;
    type: SchedulingAlertType;
    priority: SchedulingPriority;
    category: string;
    assignedOwner: string;
    title: string;
    detail: string;
    suggestedNextAction: string;
    targetView: SchedulingTargetView;
    companyId?: string;
    sourceModule?: SchedulingSourceModule;
    sourceRecordId?: string;
    dueAt?: string | null;
  },
): SchedulingAlert {
  const companyId = input.companyId ?? item?.companyId ?? "";
  const dueAt = input.dueAt ?? item?.startAt ?? null;

  return {
    id: input.id,
    type: input.type,
    priority: input.priority,
    companyId,
    companyName: context.companiesById.get(companyId) ?? item?.companyName ?? "Company",
    customerId: item?.customerId ?? null,
    customerName: item?.customerName ?? "Unassigned",
    propertyId: item?.propertyId ?? null,
    propertyLabel: item?.propertyLabel ?? "Property to confirm",
    category: input.category,
    assignedOwner: input.assignedOwner,
    dueAt,
    workflowStage: item?.workflowStage ?? "Needs review",
    sourceModule: input.sourceModule ?? item?.sourceModule ?? "Dispatch",
    sourceRecordId: input.sourceRecordId ?? item?.sourceRecordId ?? input.id,
    targetView: input.targetView,
    status: deriveAlertStatus(dueAt, context.today),
    title: input.title,
    detail: input.detail,
    suggestedNextAction: input.suggestedNextAction,
  };
}

function sortSchedulingAlerts(alerts: SchedulingAlert[]) {
  return [...new Map(alerts.map((alert) => [alert.id, alert])).values()].sort((left, right) => {
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];

    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.POSITIVE_INFINITY;
    const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.POSITIVE_INFINITY;

    return leftDue - rightDue;
  });
}

function getMissingRequiredDocumentsForJob(snapshot: CrmSnapshot, job: JobRecord) {
  if (!["scheduled", "in_progress", "blocked"].includes(job.status)) {
    return [];
  }

  const documents = snapshot.documents.filter((document) => document.job_id === job.id);
  const hasSignedAgreement = documents.some(
    (document) =>
      document.status !== "archived" &&
      (document.category === "contract" || document.category === "signed_agreement"),
  );
  const requiredDocs = documents.filter(
    (document) =>
      document.requirement_level === "required" &&
      document.status !== "archived" &&
      !document.file_url &&
      !document.storage_path &&
      !document.body,
  );
  const missing = requiredDocs.map((document) => document.title);

  if (!hasSignedAgreement) {
    missing.push("Signed contract");
  }

  if (
    job.service_type === "roofing" &&
    !documents.some((document) => document.status !== "archived" && document.category === "permit")
  ) {
    missing.push("Permit");
  }

  return uniqueSorted(missing);
}

function getJobInspectionStatus(snapshot: CrmSnapshot, job: JobRecord) {
  const inspections = snapshot.inspections.filter(
    (inspection) =>
      inspection.job_id === job.id ||
      (job.lead_id !== null && inspection.lead_id === job.lead_id) ||
      (job.customer_id !== null && inspection.customer_id === job.customer_id),
  );

  if (inspections.some((inspection) => inspection.status === "completed")) {
    return "Inspection complete";
  }

  if (inspections.some((inspection) => inspection.scheduled_start)) {
    return "Inspection scheduled";
  }

  if (inspections.length) {
    return "Inspection not scheduled";
  }

  return "Inspection not recorded";
}

function getJobPriority(snapshot: CrmSnapshot, job: JobRecord): LeadPriority {
  const inspection = snapshot.inspections.find((item) => item.job_id === job.id);
  const lead = job.lead_id ? snapshot.leads.find((item) => item.id === job.lead_id) : null;

  return inspection?.priority ?? lead?.priority ?? "normal";
}

function getJobCrewLabel(snapshot: CrmSnapshot, job: JobRecord) {
  if (job.crew_name?.trim()) {
    return job.crew_name.trim();
  }

  const assignment = snapshot.jobAssignments.find(
    (item) => item.job_id === job.id && item.status !== "completed",
  );

  if (assignment) {
    return getEmployeeName(snapshot, assignment.employee_id) ?? assignment.title;
  }

  return "Crew needed";
}

function getEmployeeName(snapshot: CrmSnapshot, employeeId: string | null | undefined) {
  if (!employeeId) {
    return null;
  }

  return snapshot.employees.find((employee) => employee.id === employeeId)?.full_name ?? null;
}

function materialOrderIsDelayed(order: MaterialOrderRecord, today: string) {
  return (
    order.status !== "received" &&
    order.status !== "canceled" &&
    order.expected_delivery_date !== null &&
    order.expected_delivery_date < today
  );
}

function itemOverlapsDate(item: SchedulingWorkItem, date: string) {
  const start = item.startAt ? datePart(item.startAt) : null;
  const end = item.endAt ? datePart(item.endAt) : null;

  if (!start && !end) {
    return false;
  }

  const rangeStart = start ?? end;
  const rangeEnd = end ?? start;

  return Boolean(rangeStart && rangeEnd && rangeStart <= date && rangeEnd >= date);
}

function rangesOverlap(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
) {
  const leftStartMs = Date.parse(leftStart);
  const leftEndMs = Date.parse(leftEnd);
  const rightStartMs = Date.parse(rightStart);
  const rightEndMs = Date.parse(rightEnd);

  if (
    !Number.isFinite(leftStartMs) ||
    !Number.isFinite(leftEndMs) ||
    !Number.isFinite(rightStartMs) ||
    !Number.isFinite(rightEndMs)
  ) {
    return false;
  }

  return leftStartMs < rightEndMs && rightStartMs < leftEndMs;
}

function calculateDurationMinutes(startAt: string | null, endAt: string | null) {
  if (!startAt || !endAt) {
    return null;
  }

  const duration = Date.parse(endAt) - Date.parse(startAt);

  if (!Number.isFinite(duration)) {
    return null;
  }

  return Math.round(duration / 60000);
}

function datePart(value: string) {
  return value.slice(0, 10);
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function deriveAlertStatus(dueAt: string | null, today: string): SchedulingAlert["status"] {
  if (!dueAt) {
    return "open";
  }

  const dueDate = datePart(dueAt);

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "today";
  }

  return "upcoming";
}

function normalizeAddress(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

function mapLeadPriority(priority: LeadPriority | "normal"): SchedulingPriority {
  if (priority === "urgent") {
    return "critical";
  }

  if (priority === "high") {
    return "high";
  }

  if (priority === "low") {
    return "low";
  }

  return "medium";
}

function serviceTypeLabel(serviceType: string) {
  return serviceType.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInspectionServiceType(inspection: InspectionRecord) {
  return inspection.service_category.includes("painting") ||
    inspection.inspection_type.includes("painting") ||
    inspection.inspection_type === "cabinet_refinishing"
    ? "painting"
    : "roofing";
}

function jobStatusLabel(status: string) {
  return serviceTypeLabel(status);
}

function inspectionStatusLabel(status: string) {
  return serviceTypeLabel(status);
}

function scheduleEventTypeLabel(type: string) {
  return serviceTypeLabel(type);
}
