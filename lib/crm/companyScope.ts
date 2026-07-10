import type { CrmSnapshot, ScopeCategory, Trade } from "./types";

export type CompanyScopeId = "all" | string;

function byCompany<T extends { company_id: string }>(items: T[], companyId: string) {
  return items.filter((item) => item.company_id === companyId);
}

const roofingScopeCategories = new Set<ScopeCategory>([
  "roofing",
  "roof_repairs",
  "tile_underlayment",
  "custom",
]);

const paintingScopeCategories = new Set<ScopeCategory>([
  "exterior_painting",
  "interior_painting",
  "cabinet_refinishing",
  "custom",
]);

function categoryMatchesTrade(category: ScopeCategory, trade: Trade) {
  if (trade === "both") {
    return true;
  }

  if (trade === "painting") {
    return paintingScopeCategories.has(category);
  }

  return roofingScopeCategories.has(category);
}

export function scopeCrmSnapshotByCompany(
  snapshot: CrmSnapshot,
  companyId: CompanyScopeId,
): CrmSnapshot {
  if (companyId === "all") {
    return snapshot;
  }

  const companies = snapshot.companies.filter((company) => company.id === companyId);
  const companyTrade = companies[0]?.workflow_profile ?? companies[0]?.trade ?? "both";
  const leads = byCompany(snapshot.leads, companyId);
  const customers = byCompany(snapshot.customers, companyId);
  const estimates = byCompany(snapshot.estimates, companyId);
  const estimateIds = new Set(estimates.map((estimate) => estimate.id));
  const scopes = byCompany(snapshot.scopes, companyId);
  const scopeIds = new Set(scopes.map((scope) => scope.id));
  const jobs = byCompany(snapshot.jobs, companyId);
  const jobIds = new Set(jobs.map((job) => job.id));
  const scheduleEvents = byCompany(snapshot.scheduleEvents, companyId);
  const scheduleEventIds = new Set(scheduleEvents.map((event) => event.id));
  const invoices = byCompany(snapshot.invoices, companyId);
  const invoiceIds = new Set(invoices.map((invoice) => invoice.id));
  const materialOrders = byCompany(snapshot.materialOrders, companyId);
  const materialOrderIds = new Set(materialOrders.map((order) => order.id));
  const employees = byCompany(snapshot.employees, companyId);
  const employeeIds = new Set(employees.map((employee) => employee.id));
  const routePlans = byCompany(snapshot.routePlans, companyId);
  const routePlanIds = new Set(routePlans.map((routePlan) => routePlan.id));

  return {
    companies,
    leads,
    customers,
    estimates,
    estimateLineItems: snapshot.estimateLineItems.filter((item) =>
      estimateIds.has(item.estimate_id),
    ),
    scopeTemplates: snapshot.scopeTemplates.filter(
      (template) =>
        (template.company_id === null || template.company_id === companyId) &&
        categoryMatchesTrade(template.category, companyTrade),
    ),
    scopes,
    jobs,
    scheduleEvents,
    jobPhotos: byCompany(snapshot.jobPhotos, companyId),
    invoices,
    invoiceLineItems: snapshot.invoiceLineItems.filter((item) =>
      invoiceIds.has(item.invoice_id),
    ),
    materialOrders,
    materialOrderItems: snapshot.materialOrderItems.filter((item) =>
      materialOrderIds.has(item.material_order_id),
    ),
    employees,
    jobAssignments: snapshot.jobAssignments.filter(
      (assignment) =>
        assignment.company_id === companyId ||
        (assignment.job_id !== null && jobIds.has(assignment.job_id)) ||
        employeeIds.has(assignment.employee_id),
    ),
    timeEntries: byCompany(snapshot.timeEntries, companyId),
    inspections: byCompany(snapshot.inspections, companyId),
    dailyLogs: byCompany(snapshot.dailyLogs, companyId),
    changeOrders: byCompany(snapshot.changeOrders, companyId),
    signatures: byCompany(snapshot.signatures, companyId),
    documents: byCompany(snapshot.documents, companyId),
    payments: byCompany(snapshot.payments, companyId),
    notifications: byCompany(snapshot.notifications, companyId),
    integrationConnections: byCompany(snapshot.integrationConnections, companyId),
    integrationSyncLogs: byCompany(snapshot.integrationSyncLogs, companyId),
    calendarEventSyncs: byCompany(snapshot.calendarEventSyncs, companyId),
    emailMessages: byCompany(snapshot.emailMessages, companyId),
    smsMessages: byCompany(snapshot.smsMessages, companyId),
    routePlans,
    routePlanStops: snapshot.routePlanStops.filter((stop) =>
      routePlanIds.has(stop.route_plan_id),
    ),
    companyMemberships: snapshot.companyMemberships.filter(
      (membership) => membership.company_id === companyId,
    ),
    companyWorkflowSettings: snapshot.companyWorkflowSettings.filter(
      (settings) => settings.company_id === companyId,
    ),
  };
}
