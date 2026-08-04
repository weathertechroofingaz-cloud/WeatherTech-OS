import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateEstimateTotals, calculateLineItemTotal } from "./estimates";
import {
  calculateInvoiceLineItemTotal,
  calculateInvoiceTotals,
  calculateMaterialOrderItemTotal,
  calculateMaterialOrderTotal,
} from "./operations";
import type {
  CrmSnapshot,
  AiAuditEventRecord,
  AiSavedAnalysisRecord,
  AiUsageLimitRecord,
  CalendarEventSyncInput,
  CalendarEventSyncRecord,
  ChangeOrderInput,
  ChangeOrderRecord,
  CustomerInput,
  CustomerRecord,
  DailyLogInput,
  DailyLogRecord,
  Database,
  DocumentInput,
  DocumentRecord,
  EmailMessageInput,
  EmailMessageRecord,
  EmployeeInput,
  EmployeeRecord,
  EstimateInput,
  EstimateLineItemInput,
  EstimateLineItemRecord,
  EstimateRecord,
  EstimateStatus,
  InspectionInput,
  InspectionRecord,
  IntegrationConnectionInput,
  IntegrationConnectionRecord,
  IntegrationSyncLogInput,
  IntegrationSyncLogRecord,
  InvoiceInput,
  InvoiceLineItemInput,
  InvoiceLineItemRecord,
  InvoiceRecord,
  JobAssignmentInput,
  JobAssignmentRecord,
  JobInput,
  JobMaterialInput,
  JobMaterialRecord,
  JobNoteInput,
  JobNoteRecord,
  JobPhotoInput,
  JobPhotoRecord,
  JobRecord,
  JobTaskInput,
  JobTaskRecord,
  LeadInput,
  LeadRecord,
  PipelineStage,
  MaterialOrderInput,
  MaterialOrderItemInput,
  MaterialOrderItemRecord,
  MaterialOrderRecord,
  NotificationInput,
  NotificationRecord,
  PaymentInput,
  PaymentRecord,
  PropertyInput,
  PropertyRecord,
  RoutePlanInput,
  RoutePlanRecord,
  RoutePlanStopInput,
  RoutePlanStopRecord,
  ScheduleEventInput,
  ScheduleEventRecord,
  SignatureInput,
  SignatureRecord,
  SmsMessageInput,
  ScopeInput,
  ScopeRecord,
  ScopeTemplateInput,
  TimeEntryInput,
  TimeEntryRecord,
} from "./types";

type CrmClient = SupabaseClient<Database>;
export const DOCUMENT_STORAGE_BUCKET = "customer-documents";

type CrmListResult<T> = {
  data: T[] | null;
  error: unknown;
};

type CoreCrmSnapshot = Pick<
  CrmSnapshot,
  "companies" | "leads" | "customers" | "estimates" | "scopes" | "jobs"
>;

function describeCrmLoadError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown Supabase CRM load error.";
}

function throwCrmTableError(tableName: string, error: unknown): never {
  const message = describeCrmLoadError(error);
  const wrappedError = new Error(`Unable to load CRM table "${tableName}": ${message}`);

  Object.assign(wrappedError, { cause: error });
  console.error("[CRM] Supabase table load failed", {
    tableName,
    message,
  });

  throw wrappedError;
}

function throwFirstTableError(results: Array<[string, { error: unknown }]>) {
  const failedResult = results.find(([, result]) => result.error);

  if (failedResult) {
    throwCrmTableError(failedResult[0], failedResult[1].error);
  }
}

function requireRows<T>(tableName: string, result: CrmListResult<T>): T[] {
  if (result.error) {
    throwCrmTableError(tableName, result.error);
  }

  return result.data ?? [];
}

function isOptionalTableMissingError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    details?: unknown;
    message?: unknown;
  };
  const message = [
    candidate.code,
    candidate.details,
    candidate.message,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    message.includes("42p01") ||
    message.includes("pgrst205") ||
    message.includes("could not find the table") ||
    (message.includes("relation") && message.includes("does not exist")) ||
    message.includes("relation \"public.properties\" does not exist") ||
    message.includes("relation \"properties\" does not exist")
  );
}

function optionalRows<T>(tableName: string, result: CrmListResult<T>): T[] {
  if (!result.error) {
    return result.data ?? [];
  }

  if (isOptionalTableMissingError(result.error)) {
    return [];
  }

  throwCrmTableError(tableName, result.error);
}

type LegacyLeadRecord = Partial<LeadRecord> & {
  customer_name?: string | null;
  lead_source?: string | null;
  service_needed?: string | null;
};

type LegacyInspectionRecord = Partial<InspectionRecord> & {
  job_id?: string | null;
  checklist?: string | null;
  findings?: unknown;
  measurements?: unknown;
  photo_ids?: unknown;
  activity?: unknown;
};

function getLegacyLeadString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getLegacyLeadNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  return fallback;
}

function normalizeLeadStatus(value: unknown): LeadRecord["status"] {
  const status = getLegacyLeadString(value)?.toLowerCase().replace(/\s+/g, "_");

  if (status === "new" || status === "new_lead") {
    return "new";
  }

  if (status === "contacted") {
    return "contacted";
  }

  if (status === "qualified" || status === "estimate_scheduled") {
    return "qualified";
  }

  if (status === "estimate_sent" || status === "proposal_sent") {
    return "estimate_sent";
  }

  if (status === "won") {
    return "won";
  }

  if (status === "lost") {
    return "lost";
  }

  return "new";
}

function normalizePipelineStage(
  value: unknown,
  fallbackStatus?: LeadRecord["status"],
): PipelineStage {
  const stage = getLegacyLeadString(value)?.toLowerCase().replace(/\s+/g, "_");

  if (
    stage === "new_lead" ||
    stage === "contacted" ||
    stage === "estimate_scheduled" ||
    stage === "estimate_sent" ||
    stage === "approved" ||
    stage === "job_scheduled" ||
    stage === "completed" ||
    stage === "paid" ||
    stage === "lost"
  ) {
    return stage;
  }

  if (fallbackStatus === "contacted") {
    return "contacted";
  }

  if (fallbackStatus === "qualified") {
    return "estimate_scheduled";
  }

  if (fallbackStatus === "estimate_sent") {
    return "estimate_sent";
  }

  if (fallbackStatus === "won") {
    return "approved";
  }

  if (fallbackStatus === "lost") {
    return "lost";
  }

  return "new_lead";
}

function pipelineStageToLeadStatus(stage: PipelineStage): LeadRecord["status"] {
  if (stage === "new_lead") {
    return "new";
  }

  if (stage === "estimate_scheduled") {
    return "qualified";
  }

  if (stage === "approved" || stage === "job_scheduled" || stage === "completed" || stage === "paid") {
    return "won";
  }

  return stage;
}

function normalizeLeadServiceType(value: unknown): LeadRecord["service_type"] {
  const serviceType = getLegacyLeadString(value)?.toLowerCase().replace(/\s+/g, "_");

  if (serviceType === "painting" || serviceType?.includes("paint")) {
    return "painting";
  }

  if (serviceType === "both") {
    return "both";
  }

  return "roofing";
}

function normalizeLeadRows(leads: LeadRecord[]): LeadRecord[] {
  return leads.map((row) => {
    const lead = row as LegacyLeadRecord;
    const createdAt = getLegacyLeadString(lead.created_at) ?? new Date().toISOString();
    const status = normalizeLeadStatus(lead.status);

    return {
      ...row,
      company_id: getLegacyLeadString(lead.company_id) ?? "",
      customer_id: lead.customer_id ?? null,
      contact_name:
        getLegacyLeadString(lead.contact_name) ??
        getLegacyLeadString(lead.customer_name) ??
        "Unnamed lead",
      phone: getLegacyLeadString(lead.phone),
      email: getLegacyLeadString(lead.email),
      property_address: getLegacyLeadString(lead.property_address) ?? "",
      city: getLegacyLeadString(lead.city),
      state: getLegacyLeadString(lead.state) ?? "AZ",
      postal_code: getLegacyLeadString(lead.postal_code),
      latitude: lead.latitude ?? null,
      longitude: lead.longitude ?? null,
      google_place_id: getLegacyLeadString(lead.google_place_id),
      address_verified_at: getLegacyLeadString(lead.address_verified_at),
      service_type: normalizeLeadServiceType(lead.service_type ?? lead.service_needed),
      source:
        getLegacyLeadString(lead.source) ??
        getLegacyLeadString(lead.lead_source) ??
        "Website",
      status,
      pipeline_stage: normalizePipelineStage(lead.pipeline_stage, status),
      priority: lead.priority ?? "normal",
      estimated_value: getLegacyLeadNumber(lead.estimated_value),
      next_follow_up: getLegacyLeadString(lead.next_follow_up),
      notes: getLegacyLeadString(lead.notes),
      created_by: lead.created_by ?? null,
      created_at: createdAt,
      updated_at: getLegacyLeadString(lead.updated_at) ?? createdAt,
    };
  });
}

function normalizeJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizePropertyRows(properties: PropertyRecord[]): PropertyRecord[] {
  return properties.map((property) => {
    const createdAt = getLegacyLeadString(property.created_at) ?? new Date().toISOString();

    return {
      ...property,
      customer_id: property.customer_id ?? null,
      city: getLegacyLeadString(property.city),
      state: getLegacyLeadString(property.state) ?? "AZ",
      postal_code: getLegacyLeadString(property.postal_code),
      property_type: property.property_type ?? "single_family",
      year_built: property.year_built ?? null,
      square_feet: property.square_feet ?? null,
      stories: property.stories ?? null,
      occupancy: property.occupancy ?? "unknown",
      hoa_name: getLegacyLeadString(property.hoa_name),
      gate_code: getLegacyLeadString(property.gate_code),
      access_instructions: getLegacyLeadString(property.access_instructions),
      latitude: property.latitude ?? null,
      longitude: property.longitude ?? null,
      parcel_number: getLegacyLeadString(property.parcel_number),
      roof_age_years: property.roof_age_years ?? null,
      roof_manufacturer: getLegacyLeadString(property.roof_manufacturer),
      roof_system: getLegacyLeadString(property.roof_system),
      roof_pitch: getLegacyLeadString(property.roof_pitch),
      roof_layers: property.roof_layers ?? null,
      roofing_material: getLegacyLeadString(property.roofing_material),
      flat_roof_sections: getLegacyLeadString(property.flat_roof_sections),
      tile_information: getLegacyLeadString(property.tile_information),
      has_solar: Boolean(property.has_solar),
      has_skylights: Boolean(property.has_skylights),
      hvac_penetrations: getLegacyLeadString(property.hvac_penetrations),
      chimneys: getLegacyLeadString(property.chimneys),
      paint_system: getLegacyLeadString(property.paint_system),
      exterior_finish: getLegacyLeadString(property.exterior_finish),
      exterior_paint_colors: getLegacyLeadString(property.exterior_paint_colors),
      last_inspection_at: getLegacyLeadString(property.last_inspection_at),
      next_recommended_inspection_at: getLegacyLeadString(
        property.next_recommended_inspection_at,
      ),
      roof_condition: property.roof_condition ?? "unknown",
      paint_condition: property.paint_condition ?? "unknown",
      warranty_status: property.warranty_status ?? "unknown",
      document_status: property.document_status ?? "unknown",
      maintenance_status: property.maintenance_status ?? "unknown",
      health_score: property.health_score ?? null,
      is_primary: Boolean(property.is_primary),
      portfolio_label: getLegacyLeadString(property.portfolio_label),
      manager_name: getLegacyLeadString(property.manager_name),
      notes: getLegacyLeadString(property.notes),
      ai_summary: getLegacyLeadString(property.ai_summary),
      created_at: createdAt,
      updated_at: getLegacyLeadString(property.updated_at) ?? createdAt,
    };
  });
}

function normalizeInspectionRows(inspections: InspectionRecord[]): InspectionRecord[] {
  return inspections.map((row) => {
    const inspection = row as LegacyInspectionRecord;
    const createdAt = getLegacyLeadString(inspection.created_at) ?? new Date().toISOString();
    const checklist = getLegacyLeadString(inspection.checklist) ?? "Site inspection";

    return {
      ...row,
      company_id: getLegacyLeadString(inspection.company_id) ?? "",
      employee_id: inspection.employee_id ?? null,
      customer_id: inspection.customer_id ?? null,
      lead_id: inspection.lead_id ?? null,
      job_id: inspection.job_id ?? null,
      schedule_event_id: inspection.schedule_event_id ?? null,
      estimate_id: inspection.estimate_id ?? null,
      report_document_id: inspection.report_document_id ?? null,
      title: getLegacyLeadString(inspection.title) ?? "Site inspection",
      status: inspection.status ?? "draft",
      inspection_type: inspection.inspection_type ?? "site_inspection",
      service_category: inspection.service_category ?? "roofing",
      checklist,
      scheduled_start: getLegacyLeadString(inspection.scheduled_start),
      scheduled_end: getLegacyLeadString(inspection.scheduled_end),
      assigned_inspector: getLegacyLeadString(inspection.assigned_inspector),
      property_address: getLegacyLeadString(inspection.property_address),
      priority: inspection.priority ?? "normal",
      purpose: getLegacyLeadString(inspection.purpose),
      completed_at: getLegacyLeadString(inspection.completed_at),
      notes: getLegacyLeadString(inspection.notes),
      internal_notes:
        getLegacyLeadString(inspection.internal_notes) ??
        getLegacyLeadString(inspection.notes),
      outcome: inspection.outcome ?? null,
      report_requested: Boolean(inspection.report_requested),
      report_created_at: getLegacyLeadString(inspection.report_created_at),
      findings: normalizeJsonArray<InspectionRecord["findings"][number]>(
        inspection.findings,
      ),
      measurements: normalizeJsonArray<InspectionRecord["measurements"][number]>(
        inspection.measurements,
      ),
      photo_ids: normalizeStringArray(inspection.photo_ids),
      activity: normalizeJsonArray<InspectionRecord["activity"][number]>(
        inspection.activity,
      ),
      created_at: createdAt,
      updated_at: getLegacyLeadString(inspection.updated_at) ?? createdAt,
    };
  });
}

function createEmptyCrmSnapshot(core: CoreCrmSnapshot): CrmSnapshot {
  return {
    ...core,
    properties: [],
    estimateLineItems: [],
    scopeTemplates: [],
    jobTasks: [],
    jobNotes: [],
    jobMaterials: [],
    scheduleEvents: [],
    jobPhotos: [],
    invoices: [],
    invoiceLineItems: [],
    materialOrders: [],
    materialOrderItems: [],
    employees: [],
    jobAssignments: [],
    timeEntries: [],
    inspections: [],
    dailyLogs: [],
    changeOrders: [],
    signatures: [],
    documents: [],
    payments: [],
    proposalTemplates: [],
    proposalRevisions: [],
    proposalSections: [],
    proposalOptions: [],
    proposalAcceptances: [],
    proposalPaymentSchedules: [],
    proposalAuditEvents: [],
    notifications: [],
    integrationConnections: [],
    integrationSyncLogs: [],
    aiSavedAnalyses: [],
    aiAuditEvents: [],
    aiUsageLimits: [],
    leadIntakeRecords: [],
    calendarEventSyncs: [],
    googleCalendarConnectedCalendars: [],
    googleCalendarUnmatchedEvents: [],
    emailMessages: [],
    gmailEmailThreads: [],
    gmailEmailAttachments: [],
    smsMessages: [],
    businessPhoneNumbers: [],
    communicationProviderEvents: [],
    callRecords: [],
    routePlans: [],
    routePlanStops: [],
    companyMemberships: [],
    companyWorkflowSettings: [],
  };
}

export async function fetchCrmSnapshot(client: CrmClient): Promise<CrmSnapshot> {
  const [
    coreCompanies,
    coreLeads,
    coreCustomers,
    coreEstimates,
    coreScopes,
    coreJobs,
  ] = await Promise.all([
    client.from("companies").select("*").order("name", { ascending: true }),
    client.from("leads").select("*").order("created_at", { ascending: false }),
    client.from("customers").select("*").order("updated_at", { ascending: false }),
    client.from("estimates").select("*").order("updated_at", { ascending: false }),
    client.from("scopes").select("*").order("updated_at", { ascending: false }),
    client.from("jobs").select("*").order("updated_at", { ascending: false }),
  ]);

  const coreSnapshot: CoreCrmSnapshot = {
    companies: requireRows("companies", coreCompanies),
    leads: normalizeLeadRows(requireRows("leads", coreLeads)),
    customers: requireRows("customers", coreCustomers),
    estimates: requireRows("estimates", coreEstimates),
    scopes: requireRows("scopes", coreScopes),
    jobs: requireRows("jobs", coreJobs),
  };

  const hasCoreRecords = Object.values(coreSnapshot).some(
    (records) => records.length > 0,
  );

  if (!hasCoreRecords) {
    return createEmptyCrmSnapshot(coreSnapshot);
  }

  const [
    companies,
    properties,
    leads,
    customers,
    estimates,
    estimateLineItems,
    scopeTemplates,
    scopes,
    jobs,
    jobTasks,
    jobNotes,
    jobMaterials,
    scheduleEvents,
    jobPhotos,
    invoices,
    invoiceLineItems,
    materialOrders,
    materialOrderItems,
    employees,
    jobAssignments,
    timeEntries,
    inspections,
    dailyLogs,
    changeOrders,
    signatures,
    documents,
    payments,
    proposalTemplates,
    proposalRevisions,
    proposalSections,
    proposalOptions,
    proposalAcceptances,
    proposalPaymentSchedules,
    proposalAuditEvents,
    notifications,
    integrationConnections,
    integrationSyncLogs,
    aiSavedAnalyses,
    aiAuditEvents,
    aiUsageLimits,
    leadIntakeRecords,
    calendarEventSyncs,
    googleCalendarConnectedCalendars,
    googleCalendarUnmatchedEvents,
    emailMessages,
    gmailEmailThreads,
    gmailEmailAttachments,
    smsMessages,
    businessPhoneNumbers,
    communicationProviderEvents,
    callRecords,
    routePlans,
    routePlanStops,
    companyMemberships,
    companyWorkflowSettings,
  ] = await Promise.all([
    client.from("companies").select("*").order("name", { ascending: true }),
    client.from("properties").select("*").order("updated_at", { ascending: false }),
    client.from("leads").select("*").order("created_at", { ascending: false }),
    client.from("customers").select("*").order("updated_at", { ascending: false }),
    client.from("estimates").select("*").order("updated_at", { ascending: false }),
    client
      .from("estimate_line_items")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("scope_templates")
      .select("*")
      .eq("is_active", true)
      .order("title", { ascending: true }),
    client.from("scopes").select("*").order("updated_at", { ascending: false }),
    client.from("jobs").select("*").order("updated_at", { ascending: false }),
    client
      .from("job_tasks")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client.from("job_notes").select("*").order("created_at", { ascending: false }),
    client.from("job_materials").select("*").order("created_at", { ascending: false }),
    client
      .from("schedule_events")
      .select("*")
      .order("start_at", { ascending: true }),
    client.from("job_photos").select("*").order("created_at", { ascending: false }),
    client.from("invoices").select("*").order("updated_at", { ascending: false }),
    client
      .from("invoice_line_items")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("material_orders")
      .select("*")
      .order("updated_at", { ascending: false }),
    client
      .from("material_order_items")
      .select("*")
      .order("sort_order", { ascending: true }),
    client.from("employees").select("*").order("full_name", { ascending: true }),
    client
      .from("job_assignments")
      .select("*")
      .order("assigned_date", { ascending: true }),
    client.from("time_entries").select("*").order("clock_in_at", { ascending: false }),
    client.from("inspections").select("*").order("updated_at", { ascending: false }),
    client.from("daily_logs").select("*").order("log_date", { ascending: false }),
    client.from("change_orders").select("*").order("updated_at", { ascending: false }),
    client.from("signatures").select("*").order("updated_at", { ascending: false }),
    client.from("documents").select("*").order("updated_at", { ascending: false }),
    client.from("payments").select("*").order("paid_at", { ascending: false }),
    client.from("proposal_templates").select("*").order("updated_at", { ascending: false }),
    client
      .from("estimate_proposal_revisions")
      .select("*")
      .order("updated_at", { ascending: false }),
    client
      .from("estimate_proposal_sections")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("estimate_proposal_options")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("estimate_proposal_acceptances")
      .select("*")
      .order("accepted_at", { ascending: false }),
    client
      .from("proposal_payment_schedules")
      .select("*")
      .order("sort_order", { ascending: true }),
    client
      .from("proposal_audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    client.from("notifications").select("*").order("remind_at", { ascending: true }),
    client
      .from("integration_connections")
      .select("*")
      .order("updated_at", { ascending: false }),
    client
      .from("integration_sync_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("ai_saved_analyses")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100),
    client
      .from("ai_audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("ai_usage_limits")
      .select("*")
      .order("updated_at", { ascending: false }),
    client
      .from("lead_intake_records")
      .select("*")
      .order("intake_timestamp", { ascending: false })
      .limit(200),
    client
      .from("calendar_event_syncs")
      .select("*")
      .order("updated_at", { ascending: false }),
    client
      .from("google_calendar_connected_calendars")
      .select("*")
      .order("updated_at", { ascending: false }),
    client
      .from("google_calendar_unmatched_events")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100),
    client.from("email_messages").select("*").order("updated_at", { ascending: false }),
    client
      .from("gmail_email_threads")
      .select("*")
      .order("last_message_at", { ascending: false }),
    client
      .from("gmail_email_attachments")
      .select("*")
      .order("created_at", { ascending: false }),
    client.from("sms_messages").select("*").order("updated_at", { ascending: false }),
    client
      .from("business_phone_numbers")
      .select("*")
      .order("display_name", { ascending: true }),
    client
      .from("communication_provider_events")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200),
    client
      .from("call_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
    client.from("route_plans").select("*").order("route_date", { ascending: false }),
    client
      .from("route_plan_stops")
      .select("*")
      .order("sort_order", { ascending: true }),
    client.from("company_memberships").select("*").order("created_at", { ascending: true }),
    client
      .from("company_workflow_settings")
      .select("*")
      .order("workflow_profile", { ascending: true }),
  ]);

  throwFirstTableError([
    ["companies", companies],
    ...(properties.error && !isOptionalTableMissingError(properties.error)
      ? [["properties", properties] as [string, { error: unknown }]]
      : []),
    ["leads", leads],
    ["customers", customers],
    ["estimates", estimates],
    ["estimate_line_items", estimateLineItems],
    ["scope_templates", scopeTemplates],
    ["scopes", scopes],
    ["jobs", jobs],
    ["job_tasks", jobTasks],
    ["job_notes", jobNotes],
    ["job_materials", jobMaterials],
    ["schedule_events", scheduleEvents],
    ["job_photos", jobPhotos],
    ["invoices", invoices],
    ["invoice_line_items", invoiceLineItems],
    ["material_orders", materialOrders],
    ["material_order_items", materialOrderItems],
    ["employees", employees],
    ["job_assignments", jobAssignments],
    ["time_entries", timeEntries],
    ["inspections", inspections],
    ["daily_logs", dailyLogs],
    ["change_orders", changeOrders],
    ["signatures", signatures],
    ["documents", documents],
    ["payments", payments],
    ...(proposalTemplates.error && !isOptionalTableMissingError(proposalTemplates.error)
      ? [["proposal_templates", proposalTemplates] as [string, { error: unknown }]]
      : []),
    ...(proposalRevisions.error && !isOptionalTableMissingError(proposalRevisions.error)
      ? [["estimate_proposal_revisions", proposalRevisions] as [string, { error: unknown }]]
      : []),
    ...(proposalSections.error && !isOptionalTableMissingError(proposalSections.error)
      ? [["estimate_proposal_sections", proposalSections] as [string, { error: unknown }]]
      : []),
    ...(proposalOptions.error && !isOptionalTableMissingError(proposalOptions.error)
      ? [["estimate_proposal_options", proposalOptions] as [string, { error: unknown }]]
      : []),
    ...(proposalAcceptances.error && !isOptionalTableMissingError(proposalAcceptances.error)
      ? [["estimate_proposal_acceptances", proposalAcceptances] as [string, { error: unknown }]]
      : []),
    ...(proposalPaymentSchedules.error &&
    !isOptionalTableMissingError(proposalPaymentSchedules.error)
      ? [["proposal_payment_schedules", proposalPaymentSchedules] as [
          string,
          { error: unknown },
        ]]
      : []),
    ...(proposalAuditEvents.error && !isOptionalTableMissingError(proposalAuditEvents.error)
      ? [["proposal_audit_events", proposalAuditEvents] as [string, { error: unknown }]]
      : []),
    ["notifications", notifications],
    ["integration_connections", integrationConnections],
    ["integration_sync_logs", integrationSyncLogs],
    ...(aiSavedAnalyses.error && !isOptionalTableMissingError(aiSavedAnalyses.error)
      ? [["ai_saved_analyses", aiSavedAnalyses] as [string, { error: unknown }]]
      : []),
    ...(aiAuditEvents.error && !isOptionalTableMissingError(aiAuditEvents.error)
      ? [["ai_audit_events", aiAuditEvents] as [string, { error: unknown }]]
      : []),
    ...(aiUsageLimits.error && !isOptionalTableMissingError(aiUsageLimits.error)
      ? [["ai_usage_limits", aiUsageLimits] as [string, { error: unknown }]]
      : []),
    ...(leadIntakeRecords.error && !isOptionalTableMissingError(leadIntakeRecords.error)
      ? [["lead_intake_records", leadIntakeRecords] as [string, { error: unknown }]]
      : []),
    ["calendar_event_syncs", calendarEventSyncs],
    ...(googleCalendarConnectedCalendars.error &&
    !isOptionalTableMissingError(googleCalendarConnectedCalendars.error)
      ? [["google_calendar_connected_calendars", googleCalendarConnectedCalendars] as [
          string,
          { error: unknown },
        ]]
      : []),
    ...(googleCalendarUnmatchedEvents.error &&
    !isOptionalTableMissingError(googleCalendarUnmatchedEvents.error)
      ? [["google_calendar_unmatched_events", googleCalendarUnmatchedEvents] as [
          string,
          { error: unknown },
        ]]
      : []),
    ["email_messages", emailMessages],
    ...(gmailEmailThreads.error && !isOptionalTableMissingError(gmailEmailThreads.error)
      ? [["gmail_email_threads", gmailEmailThreads] as [string, { error: unknown }]]
      : []),
    ...(gmailEmailAttachments.error && !isOptionalTableMissingError(gmailEmailAttachments.error)
      ? [["gmail_email_attachments", gmailEmailAttachments] as [
          string,
          { error: unknown },
        ]]
      : []),
    ["sms_messages", smsMessages],
    ...(businessPhoneNumbers.error && !isOptionalTableMissingError(businessPhoneNumbers.error)
      ? [["business_phone_numbers", businessPhoneNumbers] as [string, { error: unknown }]]
      : []),
    ...(communicationProviderEvents.error && !isOptionalTableMissingError(communicationProviderEvents.error)
      ? [["communication_provider_events", communicationProviderEvents] as [string, { error: unknown }]]
      : []),
    ...(callRecords.error && !isOptionalTableMissingError(callRecords.error)
      ? [["call_records", callRecords] as [string, { error: unknown }]]
      : []),
    ["route_plans", routePlans],
    ["route_plan_stops", routePlanStops],
    ["company_memberships", companyMemberships],
    ["company_workflow_settings", companyWorkflowSettings],
  ]);

  return {
    companies: requireRows("companies", companies),
    properties: normalizePropertyRows(optionalRows("properties", properties)),
    leads: normalizeLeadRows(requireRows("leads", leads)),
    customers: requireRows("customers", customers),
    estimates: requireRows("estimates", estimates),
    estimateLineItems: requireRows("estimate_line_items", estimateLineItems),
    scopeTemplates: requireRows("scope_templates", scopeTemplates),
    scopes: requireRows("scopes", scopes),
    jobs: requireRows("jobs", jobs),
    jobTasks: requireRows("job_tasks", jobTasks),
    jobNotes: requireRows("job_notes", jobNotes),
    jobMaterials: requireRows("job_materials", jobMaterials),
    scheduleEvents: requireRows("schedule_events", scheduleEvents),
    jobPhotos: requireRows("job_photos", jobPhotos),
    invoices: requireRows("invoices", invoices),
    invoiceLineItems: requireRows("invoice_line_items", invoiceLineItems),
    materialOrders: requireRows("material_orders", materialOrders),
    materialOrderItems: requireRows("material_order_items", materialOrderItems),
    employees: requireRows("employees", employees),
    jobAssignments: requireRows("job_assignments", jobAssignments),
    timeEntries: requireRows("time_entries", timeEntries),
    inspections: normalizeInspectionRows(requireRows("inspections", inspections)),
    dailyLogs: requireRows("daily_logs", dailyLogs),
    changeOrders: requireRows("change_orders", changeOrders),
    signatures: requireRows("signatures", signatures),
    documents: requireRows("documents", documents),
    payments: requireRows("payments", payments),
    proposalTemplates: optionalRows("proposal_templates", proposalTemplates),
    proposalRevisions: optionalRows("estimate_proposal_revisions", proposalRevisions),
    proposalSections: optionalRows("estimate_proposal_sections", proposalSections),
    proposalOptions: optionalRows("estimate_proposal_options", proposalOptions),
    proposalAcceptances: optionalRows(
      "estimate_proposal_acceptances",
      proposalAcceptances,
    ),
    proposalPaymentSchedules: optionalRows(
      "proposal_payment_schedules",
      proposalPaymentSchedules,
    ),
    proposalAuditEvents: optionalRows("proposal_audit_events", proposalAuditEvents),
    notifications: requireRows("notifications", notifications),
    integrationConnections: requireRows("integration_connections", integrationConnections),
    integrationSyncLogs: requireRows("integration_sync_logs", integrationSyncLogs),
    aiSavedAnalyses: optionalRows(
      "ai_saved_analyses",
      aiSavedAnalyses as CrmListResult<AiSavedAnalysisRecord>,
    ),
    aiAuditEvents: optionalRows(
      "ai_audit_events",
      aiAuditEvents as CrmListResult<AiAuditEventRecord>,
    ),
    aiUsageLimits: optionalRows(
      "ai_usage_limits",
      aiUsageLimits as CrmListResult<AiUsageLimitRecord>,
    ),
    leadIntakeRecords: optionalRows("lead_intake_records", leadIntakeRecords),
    calendarEventSyncs: requireRows("calendar_event_syncs", calendarEventSyncs),
    googleCalendarConnectedCalendars: optionalRows(
      "google_calendar_connected_calendars",
      googleCalendarConnectedCalendars,
    ),
    googleCalendarUnmatchedEvents: optionalRows(
      "google_calendar_unmatched_events",
      googleCalendarUnmatchedEvents,
    ),
    emailMessages: requireRows("email_messages", emailMessages),
    gmailEmailThreads: optionalRows("gmail_email_threads", gmailEmailThreads),
    gmailEmailAttachments: optionalRows(
      "gmail_email_attachments",
      gmailEmailAttachments,
    ),
    smsMessages: requireRows("sms_messages", smsMessages),
    businessPhoneNumbers: optionalRows("business_phone_numbers", businessPhoneNumbers),
    communicationProviderEvents: optionalRows(
      "communication_provider_events",
      communicationProviderEvents,
    ),
    callRecords: optionalRows("call_records", callRecords),
    routePlans: requireRows("route_plans", routePlans),
    routePlanStops: requireRows("route_plan_stops", routePlanStops),
    companyMemberships: requireRows("company_memberships", companyMemberships),
    companyWorkflowSettings: requireRows(
      "company_workflow_settings",
      companyWorkflowSettings,
    ),
  };
}

function formatLiveLeadPropertyAddress(input: LeadInput) {
  return [
    input.property_address,
    input.city,
    input.state,
    input.postal_code,
  ]
    .map((value) => getLegacyLeadString(value))
    .filter(Boolean)
    .join(", ");
}

function buildLiveLeadInput(input: LeadInput) {
  const pipelineStage = normalizePipelineStage(input.pipeline_stage, input.status);

  return {
    company_id: input.company_id || null,
    ...(input.property_id !== undefined ? { property_id: input.property_id ?? null } : {}),
    customer_name: input.contact_name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    property_address: formatLiveLeadPropertyAddress(input),
    lead_source: input.source ?? "Website",
    service_needed: input.service_type,
    status: pipelineStageToLeadStatus(pipelineStage),
    pipeline_stage: pipelineStage,
    priority: input.priority ?? "normal",
    estimated_value: input.estimated_value ?? 0,
    next_follow_up: input.next_follow_up ?? null,
    notes: input.notes ?? null,
  };
}

function describeSafeSupabaseMutationError(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      message: error instanceof Error ? error.message : "Unknown Supabase error.",
    };
  }

  const candidate = error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
  };

  return {
    code: typeof candidate.code === "string" ? candidate.code : undefined,
    message:
      typeof candidate.message === "string"
        ? candidate.message
        : "Unknown Supabase error.",
    details: typeof candidate.details === "string" ? candidate.details : undefined,
    hint: typeof candidate.hint === "string" ? candidate.hint : undefined,
  };
}

export async function createLead(client: CrmClient, input: LeadInput) {
  const liveInput = buildLiveLeadInput(input);
  const { data, error } = await client
    .from("leads")
    .insert(liveInput as unknown as LeadInput)
    .select("*")
    .single();

  if (error) {
    console.error("[CRM] Lead create failed", {
      ...describeSafeSupabaseMutationError(error),
      attemptedColumns: Object.keys(liveInput).sort(),
    });
    throw error;
  }

  if (!data) {
    console.error("[CRM] Lead create returned no row", {
      attemptedColumns: Object.keys(liveInput).sort(),
    });
    throw new Error("Lead created, but Supabase did not return the new lead.");
  }

  return normalizeLeadRows([data])[0];
}

export async function updateLead(
  client: CrmClient,
  id: string,
  updates: Partial<LeadInput>,
) {
  const { data, error } = await client
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createCustomer(client: CrmClient, input: CustomerInput) {
  const { data, error } = await client
    .from("customers")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateCustomer(
  client: CrmClient,
  id: string,
  updates: Partial<CustomerInput>,
) {
  const { data, error } = await client
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function buildPropertyPayload(input: PropertyInput) {
  return {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    display_name: input.display_name,
    address: input.address,
    city: input.city ?? null,
    state: input.state ?? "AZ",
    postal_code: input.postal_code ?? null,
    property_type: input.property_type ?? "single_family",
    year_built: input.year_built ?? null,
    square_feet: input.square_feet ?? null,
    stories: input.stories ?? null,
    occupancy: input.occupancy ?? "unknown",
    hoa_name: input.hoa_name ?? null,
    gate_code: input.gate_code ?? null,
    access_instructions: input.access_instructions ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    parcel_number: input.parcel_number ?? null,
    roof_age_years: input.roof_age_years ?? null,
    roof_manufacturer: input.roof_manufacturer ?? null,
    roof_system: input.roof_system ?? null,
    roof_pitch: input.roof_pitch ?? null,
    roof_layers: input.roof_layers ?? null,
    roofing_material: input.roofing_material ?? null,
    flat_roof_sections: input.flat_roof_sections ?? null,
    tile_information: input.tile_information ?? null,
    has_solar: input.has_solar ?? false,
    has_skylights: input.has_skylights ?? false,
    hvac_penetrations: input.hvac_penetrations ?? null,
    chimneys: input.chimneys ?? null,
    paint_system: input.paint_system ?? null,
    exterior_finish: input.exterior_finish ?? null,
    exterior_paint_colors: input.exterior_paint_colors ?? null,
    last_inspection_at: input.last_inspection_at ?? null,
    next_recommended_inspection_at: input.next_recommended_inspection_at ?? null,
    roof_condition: input.roof_condition ?? "unknown",
    paint_condition: input.paint_condition ?? "unknown",
    warranty_status: input.warranty_status ?? "unknown",
    document_status: input.document_status ?? "unknown",
    maintenance_status: input.maintenance_status ?? "unknown",
    health_score: input.health_score ?? null,
    is_primary: input.is_primary ?? false,
    portfolio_label: input.portfolio_label ?? null,
    manager_name: input.manager_name ?? null,
    notes: input.notes ?? null,
    ai_summary: input.ai_summary ?? null,
  };
}

export async function createProperty(client: CrmClient, input: PropertyInput) {
  const { data, error } = await client
    .from("properties")
    .insert(buildPropertyPayload(input))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizePropertyRows([data])[0];
}

export async function updateProperty(
  client: CrmClient,
  id: string,
  input: Partial<PropertyInput>,
) {
  const { data, error } = await client
    .from("properties")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizePropertyRows([data])[0];
}

export async function convertLeadToCustomer(client: CrmClient, lead: LeadRecord) {
  const customer = await createCustomer(client, {
    company_id: lead.company_id,
    display_name: lead.contact_name,
    contact_name: lead.contact_name,
    phone: lead.phone,
    email: lead.email,
    property_address: lead.property_address,
    city: lead.city,
    state: lead.state,
    postal_code: lead.postal_code,
    customer_type: "homeowner",
    status: "active",
    notes: lead.notes,
  });

  await updateLead(client, lead.id, {
    status: "won",
    pipeline_stage: "approved",
  });

  const { error } = await client
    .from("leads")
    .update({ customer_id: customer.id })
    .eq("id", lead.id);

  if (error) {
    throw error;
  }

  return customer;
}

function buildEstimatePayload(input: EstimateInput, lineItems: EstimateLineItemInput[]) {
  const totals = calculateEstimateTotals(input, lineItems);

  return {
    ...input,
    status: input.status ?? "draft",
    tax_rate: input.tax_rate ?? 0,
    discount_type: input.discount_type ?? "fixed",
    discount_value: input.discount_value ?? 0,
    profit_margin_rate: input.profit_margin_rate ?? 0,
    customer_id: input.customer_id ?? null,
    lead_id: input.lead_id ?? null,
    ...(input.property_id !== undefined ? { property_id: input.property_id ?? null } : {}),
    business: input.business ?? null,
    location: input.location ?? null,
    expiration_date: input.expiration_date ?? null,
    notes: input.notes ?? null,
    scope_of_work: input.scope_of_work ?? null,
    painting_area_type: input.painting_area_type ?? null,
    paint_brand: input.paint_brand ?? "Dunn-Edwards",
    paint_product_line: input.paint_product_line ?? null,
    paint_finish: input.paint_finish ?? null,
    color_selection_status: input.color_selection_status ?? "not_started",
    paint_color_body: input.paint_color_body ?? null,
    paint_color_trim: input.paint_color_trim ?? null,
    paint_color_accent: input.paint_color_accent ?? null,
    surface_prep_level: input.surface_prep_level ?? null,
    coats: input.coats ?? 2,
    primer_required: input.primer_required ?? false,
    subtotal: totals.subtotal,
    labor_total: totals.laborTotal,
    material_total: totals.materialTotal,
    tax_total: totals.taxTotal,
    discount_total: totals.discountTotal,
    profit_margin_total: totals.profitMarginTotal,
    total: totals.total,
  };
}

function buildLineItemPayload(
  item: EstimateLineItemInput,
  estimateId: string,
  index: number,
) {
  const unitPrice = item.unit_price ?? item.unit_cost;

  return {
    estimate_id: estimateId,
    category: item.category,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit: item.unit ?? "each",
    unit_cost: unitPrice,
    unit_price: unitPrice,
    markup_rate: item.markup_rate ?? 0,
    taxable: item.taxable ?? true,
    sort_order: item.sort_order ?? index,
    total: calculateLineItemTotal(item),
  };
}

export async function createEstimate(
  client: CrmClient,
  input: EstimateInput,
  lineItems: EstimateLineItemInput[],
) {


  const { data: estimate, error } = await client
    .from("estimates")
    .insert(buildEstimatePayload(input, lineItems))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const linePayloads = lineItems.map((item, index) =>
    buildLineItemPayload(item, estimate.id, index),
  );

  if (linePayloads.length) {
    const { error: lineError } = await client
      .from("estimate_line_items")
      .insert(linePayloads);

    if (lineError) {
      throw lineError;
    }
  }

  return estimate;
}

export async function updateEstimate(
  client: CrmClient,
  id: string,
  input: EstimateInput,
  lineItems: EstimateLineItemInput[],
) {


  const { data: estimate, error } = await client
    .from("estimates")
    .update(buildEstimatePayload(input, lineItems))
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const { error: deleteError } = await client
    .from("estimate_line_items")
    .delete()
    .eq("estimate_id", id);

  if (deleteError) {
    throw deleteError;
  }

  const linePayloads = lineItems.map((item, index) =>
    buildLineItemPayload(item, id, index),
  );

  if (linePayloads.length) {
    const { error: lineError } = await client
      .from("estimate_line_items")
      .insert(linePayloads);

    if (lineError) {
      throw lineError;
    }
  }

  return estimate;
}

export async function updateEstimateStatus(
  client: CrmClient,
  id: string,
  status: EstimateStatus,
) {
  const { data, error } = await client
    .from("estimates")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createScope(client: CrmClient, input: ScopeInput) {


  const { data, error } = await client.from("scopes").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateScope(client: CrmClient, id: string, input: ScopeInput) {


  const { data, error } = await client
    .from("scopes")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createScopeTemplate(
  client: CrmClient,
  input: ScopeTemplateInput,
) {
  const { data, error } = await client
    .from("scope_templates")
    .insert({
      ...input,
      is_active: input.is_active ?? true,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateScopeTemplate(
  client: CrmClient,
  id: string,
  input: ScopeTemplateInput,
) {
  const { data, error } = await client
    .from("scope_templates")
    .update({
      ...input,
      is_active: input.is_active ?? true,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createJob(client: CrmClient, input: JobInput) {


  const { data, error } = await client.from("jobs").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateJob(
  client: CrmClient,
  id: string,
  input: Partial<JobInput>,
) {


  const { data, error } = await client
    .from("jobs")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listJobTasks(
  client: CrmClient,
  jobId: string,
): Promise<JobTaskRecord[]> {
  const { data, error } = await client
    .from("job_tasks")
    .select("*")
    .eq("job_id", jobId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return data;
}

export async function createJobTask(
  client: CrmClient,
  input: JobTaskInput,
): Promise<JobTaskRecord> {
  const { data, error } = await client
    .from("job_tasks")
    .insert({
      ...input,
      description: input.description ?? null,
      status: input.status ?? "todo",
      sort_order: input.sort_order ?? 0,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateJobTask(
  client: CrmClient,
  id: string,
  input: Partial<Omit<JobTaskInput, "job_id">>,
): Promise<JobTaskRecord> {
  const { data, error } = await client
    .from("job_tasks")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function deleteJobTask(client: CrmClient, id: string) {
  const { error } = await client.from("job_tasks").delete().eq("id", id);

  if (error) {
    throw error;
  }
}

export async function reorderJobTasks(
  client: CrmClient,
  updates: { id: string; sort_order: number }[],
) {
  await Promise.all(
    updates.map(async (update) => {
      const { error } = await client
        .from("job_tasks")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id);

      if (error) {
        throw error;
      }
    }),
  );
}

export async function listJobNotes(
  client: CrmClient,
  jobId: string,
): Promise<JobNoteRecord[]> {
  const { data, error } = await client
    .from("job_notes")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function addJobNote(
  client: CrmClient,
  input: JobNoteInput,
): Promise<JobNoteRecord> {
  const { data, error } = await client
    .from("job_notes")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function listJobMaterials(
  client: CrmClient,
  jobId: string,
): Promise<JobMaterialRecord[]> {
  const { data, error } = await client
    .from("job_materials")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data;
}

export async function addJobMaterial(
  client: CrmClient,
  input: JobMaterialInput,
): Promise<JobMaterialRecord> {
  const { data, error } = await client
    .from("job_materials")
    .insert({
      ...input,
      unit: input.unit ?? "each",
      notes: input.notes ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createScheduleEvent(
  client: CrmClient,
  input: ScheduleEventInput,
) {


  const { data, error } = await client
    .from("schedule_events")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateScheduleEvent(
  client: CrmClient,
  id: string,
  input: Partial<ScheduleEventInput>,
) {


  const { data, error } = await client
    .from("schedule_events")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function safeStorageName(fileName: string) {
  return fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function randomStorageId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildDocumentStoragePath(input: DocumentInput, file: File) {
  const relationId =
    input.customer_id ??
    input.job_id ??
    input.estimate_id ??
    input.inspection_id ??
    input.lead_id ??
    "general";

  return `${input.company_id}/${relationId}/${randomStorageId()}-${safeStorageName(file.name)}`;
}

function isDocumentMetadataSchemaError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error);

  return (
    message.includes("Could not find") ||
    message.includes("schema cache") ||
    message.includes("column") ||
    message.includes("documents_lead_id")
  );
}

function buildLegacyDocumentInput(input: DocumentInput) {
  return {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    job_id: input.job_id ?? null,
    estimate_id: input.estimate_id ?? null,
    invoice_id: input.invoice_id ?? null,
    change_order_id: input.change_order_id ?? null,
    title: input.title,
    category: input.category,
    status: input.status ?? "draft",
    template_key: input.template_key ?? null,
    file_url: input.file_url ?? null,
    body: input.body ?? null,
  };
}

function isSignatureWorkflowSchemaError(error: unknown) {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error);

  return (
    message.includes("Could not find") ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

function signatureInputRequiresWorkflowSchema(input: Partial<SignatureInput>) {
  return Boolean(
    (input.status !== undefined &&
      !["pending", "signed", "declined"].includes(input.status)) ||
      (input.provider !== undefined &&
        input.provider !== null &&
        input.provider !== "native") ||
      input.provider_envelope_id ||
      input.sent_at ||
      input.viewed_at ||
      input.declined_at ||
      input.expires_at,
  );
}

function buildLegacySignatureInput(input: SignatureInput) {
  return {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    employee_id: input.employee_id ?? null,
    document_id: input.document_id ?? null,
    change_order_id: input.change_order_id ?? null,
    signer_name: input.signer_name,
    signer_email: input.signer_email ?? null,
    status: input.status ?? "pending",
    signature_data: input.signature_data ?? null,
    signed_at: input.signed_at ?? null,
  };
}

function buildLegacySignatureUpdateInput(input: Partial<SignatureInput>) {
  return {
    ...(input.company_id !== undefined ? { company_id: input.company_id } : {}),
    ...(input.customer_id !== undefined ? { customer_id: input.customer_id } : {}),
    ...(input.employee_id !== undefined ? { employee_id: input.employee_id } : {}),
    ...(input.document_id !== undefined ? { document_id: input.document_id } : {}),
    ...(input.change_order_id !== undefined
      ? { change_order_id: input.change_order_id }
      : {}),
    ...(input.signer_name !== undefined ? { signer_name: input.signer_name } : {}),
    ...(input.signer_email !== undefined ? { signer_email: input.signer_email } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.signature_data !== undefined ? { signature_data: input.signature_data } : {}),
    ...(input.signed_at !== undefined ? { signed_at: input.signed_at } : {}),
  };
}

function inputRequiresDocumentStorageSchema(input: Partial<DocumentInput>) {
  return Boolean(
    input.file_name ||
      input.file_size_bytes ||
      input.mime_type ||
      input.storage_bucket ||
      input.storage_path ||
      input.uploaded_by ||
      input.uploaded_at ||
      input.tags?.length ||
      input.requirement_level === "required" ||
      input.required_for?.length,
  );
}

export async function createJobPhoto(
  client: CrmClient,
  input: JobPhotoInput,
  file: File | null,
) {
  const now = new Date().toISOString();



  if (!file) {
    throw new Error("Choose a photo to upload.");
  }

  const relationId =
    input.inspection_id ??
    input.job_id ??
    input.customer_id ??
    input.estimate_id ??
    "general";
  const filePath = `${relationId}/${crypto.randomUUID()}-${safeStorageName(file.name)}`;
  const { error: uploadError } = await client.storage
    .from("job-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrl } = client.storage.from("job-photos").getPublicUrl(filePath);
  const photoPayload: JobPhotoInput & {
    file_path: string;
    file_url: string;
  } = {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    ...(input.property_id !== undefined ? { property_id: input.property_id ?? null } : {}),
    job_id: input.job_id ?? null,
    estimate_id: input.estimate_id ?? null,
    caption: input.caption ?? null,
    taken_at: input.taken_at ?? null,
    file_path: filePath,
    file_url: publicUrl.publicUrl,
  };

  if (input.inspection_id) {
    photoPayload.inspection_id = input.inspection_id;

    if (input.label) {
      photoPayload.label = input.label;
    }

    if (typeof input.is_customer_visible === "boolean") {
      photoPayload.is_customer_visible = input.is_customer_visible;
    }

    if (typeof input.sort_order === "number") {
      photoPayload.sort_order = input.sort_order;
    }
  }

  const { data, error } = await client
    .from("job_photos")
    .insert(photoPayload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function buildInvoicePayload(
  input: InvoiceInput,
  lineItems: InvoiceLineItemInput[],
) {
  const totals = calculateInvoiceTotals(input, lineItems);
  const payload = {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    job_id: input.job_id ?? null,
    estimate_id: input.estimate_id ?? null,
    invoice_number: input.invoice_number,
    title: input.title,
    status: input.status ?? "draft",
    issue_date: input.issue_date,
    due_date: input.due_date ?? null,
    tax_rate: input.tax_rate ?? 0,
    discount_total: totals.discountTotal,
    amount_paid: input.amount_paid ?? 0,
    notes: input.notes ?? null,
    subtotal: totals.subtotal,
    tax_total: totals.taxTotal,
    total: totals.total,
    balance_due: totals.balanceDue,
  };

  return input.property_id ? { ...payload, property_id: input.property_id } : payload;
}

function buildInvoiceLineItemPayload(
  item: InvoiceLineItemInput,
  invoiceId: string,
  index: number,
) {
  return {
    invoice_id: invoiceId,
    description: item.description,
    quantity: item.quantity,
    unit_cost: item.unit_cost,
    taxable: item.taxable ?? true,
    sort_order: item.sort_order ?? index,
    total: calculateInvoiceLineItemTotal(item),
  };
}

export async function createInvoice(
  client: CrmClient,
  input: InvoiceInput,
  lineItems: InvoiceLineItemInput[],
) {


  const { data: invoice, error } = await client
    .from("invoices")
    .insert(buildInvoicePayload(input, lineItems))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const itemPayloads = lineItems.map((item, index) =>
    buildInvoiceLineItemPayload(item, invoice.id, index),
  );

  if (itemPayloads.length) {
    const { error: itemError } = await client
      .from("invoice_line_items")
      .insert(itemPayloads);

    if (itemError) {
      throw itemError;
    }
  }

  return invoice;
}

export async function updateInvoice(
  client: CrmClient,
  id: string,
  input: InvoiceInput,
  lineItems: InvoiceLineItemInput[],
) {


  const { data: invoice, error } = await client
    .from("invoices")
    .update(buildInvoicePayload(input, lineItems))
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const { error: deleteError } = await client
    .from("invoice_line_items")
    .delete()
    .eq("invoice_id", id);

  if (deleteError) {
    throw deleteError;
  }

  const itemPayloads = lineItems.map((item, index) =>
    buildInvoiceLineItemPayload(item, id, index),
  );

  if (itemPayloads.length) {
    const { error: itemError } = await client
      .from("invoice_line_items")
      .insert(itemPayloads);

    if (itemError) {
      throw itemError;
    }
  }

  return invoice;
}

function buildMaterialOrderPayload(
  input: MaterialOrderInput,
  items: MaterialOrderItemInput[],
) {
  return {
    ...input,
    job_id: input.job_id ?? null,
    status: input.status ?? "draft",
    expected_delivery_date: input.expected_delivery_date ?? null,
    delivery_address: input.delivery_address ?? null,
    notes: input.notes ?? null,
    total: calculateMaterialOrderTotal(items),
  };
}

function buildMaterialOrderItemPayload(
  item: MaterialOrderItemInput,
  orderId: string,
  index: number,
) {
  return {
    material_order_id: orderId,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit ?? "each",
    unit_cost: item.unit_cost,
    sort_order: item.sort_order ?? index,
    total: calculateMaterialOrderItemTotal(item),
  };
}

export async function createMaterialOrder(
  client: CrmClient,
  input: MaterialOrderInput,
  items: MaterialOrderItemInput[],
) {


  const { data: order, error } = await client
    .from("material_orders")
    .insert(buildMaterialOrderPayload(input, items))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const itemPayloads = items.map((item, index) =>
    buildMaterialOrderItemPayload(item, order.id, index),
  );

  if (itemPayloads.length) {
    const { error: itemError } = await client
      .from("material_order_items")
      .insert(itemPayloads);

    if (itemError) {
      throw itemError;
    }
  }

  return order;
}

export async function updateMaterialOrder(
  client: CrmClient,
  id: string,
  input: MaterialOrderInput,
  items: MaterialOrderItemInput[],
) {


  const { data: order, error } = await client
    .from("material_orders")
    .update(buildMaterialOrderPayload(input, items))
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  const { error: deleteError } = await client
    .from("material_order_items")
    .delete()
    .eq("material_order_id", id);

  if (deleteError) {
    throw deleteError;
  }

  const itemPayloads = items.map((item, index) =>
    buildMaterialOrderItemPayload(item, id, index),
  );

  if (itemPayloads.length) {
    const { error: itemError } = await client
      .from("material_order_items")
      .insert(itemPayloads);

    if (itemError) {
      throw itemError;
    }
  }

  return order;
}

export async function createEmployee(client: CrmClient, input: EmployeeInput) {


  const { data, error } = await client
    .from("employees")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createJobAssignment(
  client: CrmClient,
  input: JobAssignmentInput,
) {


  const { data, error } = await client
    .from("job_assignments")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateJobAssignment(
  client: CrmClient,
  id: string,
  input: Partial<JobAssignmentInput>,
) {


  const { data, error } = await client
    .from("job_assignments")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createTimeEntry(client: CrmClient, input: TimeEntryInput) {


  const { data, error } = await client
    .from("time_entries")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateTimeEntry(
  client: CrmClient,
  id: string,
  input: Partial<TimeEntryInput>,
) {


  const { data, error } = await client
    .from("time_entries")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createInspection(client: CrmClient, input: InspectionInput) {
  const { data, error } = await client
    .from("inspections")
    .insert(buildInspectionPayload(input))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeInspectionRows([data])[0];
}

function buildInspectionPayload(input: InspectionInput) {
  const payload: InspectionInput = {
    company_id: input.company_id,
    employee_id: input.employee_id ?? null,
    job_id: input.job_id ?? null,
    title: input.title,
    status: input.status,
    checklist: input.checklist,
    completed_at: input.completed_at ?? null,
    notes: input.notes ?? null,
  };

  if ("customer_id" in input) payload.customer_id = input.customer_id ?? null;
  if ("property_id" in input) payload.property_id = input.property_id ?? null;
  if ("lead_id" in input) payload.lead_id = input.lead_id ?? null;
  if ("schedule_event_id" in input) {
    payload.schedule_event_id = input.schedule_event_id ?? null;
  }
  if ("estimate_id" in input) payload.estimate_id = input.estimate_id ?? null;
  if ("report_document_id" in input) {
    payload.report_document_id = input.report_document_id ?? null;
  }
  if ("inspection_type" in input) {
    payload.inspection_type = input.inspection_type ?? "site_inspection";
  }
  if ("service_category" in input) {
    payload.service_category = input.service_category ?? "roofing";
  }
  if ("scheduled_start" in input) {
    payload.scheduled_start = input.scheduled_start ?? null;
  }
  if ("scheduled_end" in input) {
    payload.scheduled_end = input.scheduled_end ?? null;
  }
  if ("assigned_inspector" in input) {
    payload.assigned_inspector = input.assigned_inspector ?? null;
  }
  if ("property_address" in input) {
    payload.property_address = input.property_address ?? null;
  }
  if ("priority" in input) payload.priority = input.priority ?? "normal";
  if ("purpose" in input) payload.purpose = input.purpose ?? null;
  if ("internal_notes" in input) {
    payload.internal_notes = input.internal_notes ?? input.notes ?? null;
  }
  if ("outcome" in input) payload.outcome = input.outcome ?? null;
  if ("report_requested" in input) {
    payload.report_requested = input.report_requested ?? false;
  }
  if ("report_created_at" in input) {
    payload.report_created_at = input.report_created_at ?? null;
  }
  if ("findings" in input) payload.findings = input.findings ?? [];
  if ("measurements" in input) payload.measurements = input.measurements ?? [];
  if ("photo_ids" in input) payload.photo_ids = input.photo_ids ?? [];
  if ("activity" in input) payload.activity = input.activity ?? [];

  return payload;
}

export async function updateInspection(
  client: CrmClient,
  id: string,
  input: Partial<InspectionInput>,
) {
  const { data, error } = await client
    .from("inspections")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return normalizeInspectionRows([data])[0];
}

export async function createDailyLog(client: CrmClient, input: DailyLogInput) {


  const { data, error } = await client
    .from("daily_logs")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function buildChangeOrderPayload(input: ChangeOrderInput) {
  const taxRate = input.tax_rate ?? 0;
  const taxTotal = Math.round(input.amount * (taxRate / 100) * 100) / 100;

  return {
    ...input,
    customer_id: input.customer_id ?? null,
    job_id: input.job_id ?? null,
    estimate_id: input.estimate_id ?? null,
    status: input.status ?? "draft",
    tax_rate: taxRate,
    tax_total: taxTotal,
    total: Math.round((input.amount + taxTotal) * 100) / 100,
    approved_at: input.approved_at ?? null,
    notes: input.notes ?? null,
  };
}

export async function createChangeOrder(client: CrmClient, input: ChangeOrderInput) {


  const { data, error } = await client
    .from("change_orders")
    .insert(buildChangeOrderPayload(input))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateChangeOrder(
  client: CrmClient,
  id: string,
  input: ChangeOrderInput,
) {


  const { data, error } = await client
    .from("change_orders")
    .update(buildChangeOrderPayload(input))
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createSignature(client: CrmClient, input: SignatureInput) {
  const { data, error } = await client
    .from("signatures")
    .insert({
      ...input,
      customer_id: input.customer_id ?? null,
      employee_id: input.employee_id ?? null,
      document_id: input.document_id ?? null,
      change_order_id: input.change_order_id ?? null,
      signer_email: input.signer_email ?? null,
      status: input.status ?? "pending",
      provider: input.provider ?? "native",
      provider_envelope_id: input.provider_envelope_id ?? null,
      signature_data: input.signature_data ?? null,
      sent_at: input.sent_at ?? null,
      viewed_at: input.viewed_at ?? null,
      signed_at: input.signed_at ?? null,
      declined_at: input.declined_at ?? null,
      expires_at: input.expires_at ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (
      !signatureInputRequiresWorkflowSchema(input) &&
      isSignatureWorkflowSchemaError(error)
    ) {
      const { data: legacyData, error: legacyError } = await client
        .from("signatures")
        .insert(buildLegacySignatureInput(input))
        .select("*")
        .single();

      if (legacyError) {
        throw legacyError;
      }

      return legacyData;
    }

    throw error;
  }

  return data;
}

export async function updateSignature(
  client: CrmClient,
  id: string,
  input: Partial<SignatureInput>,
) {
  const { data, error } = await client
    .from("signatures")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (
      !signatureInputRequiresWorkflowSchema(input) &&
      isSignatureWorkflowSchemaError(error)
    ) {
      const { data: legacyData, error: legacyError } = await client
        .from("signatures")
        .update(buildLegacySignatureUpdateInput(input))
        .eq("id", id)
        .select("*")
        .single();

      if (legacyError) {
        throw legacyError;
      }

      return legacyData;
    }

    throw error;
  }

  return data;
}

export async function createDocument(client: CrmClient, input: DocumentInput) {
  const documentInput = {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    lead_id: input.lead_id ?? null,
    job_id: input.job_id ?? null,
    estimate_id: input.estimate_id ?? null,
    inspection_id: input.inspection_id ?? null,
    invoice_id: input.invoice_id ?? null,
    change_order_id: input.change_order_id ?? null,
    ...(input.property_id !== undefined ? { property_id: input.property_id ?? null } : {}),
    title: input.title,
    category: input.category,
    status: input.status ?? "draft",
    template_key: input.template_key ?? null,
    file_url: input.file_url ?? null,
    file_name: input.file_name ?? null,
    file_size_bytes: input.file_size_bytes ?? null,
    mime_type: input.mime_type ?? null,
    storage_bucket: input.storage_bucket ?? null,
    storage_path: input.storage_path ?? null,
    uploaded_by: input.uploaded_by ?? null,
    uploaded_at: input.uploaded_at ?? null,
    archived_at: input.archived_at ?? null,
    property_address: input.property_address ?? null,
    tags: input.tags ?? [],
    requirement_level: input.requirement_level ?? "optional",
    required_for: input.required_for ?? [],
    body: input.body ?? null,
  };

  const { data, error } = await client
    .from("documents")
    .insert(documentInput)
    .select("*")
    .single();

  if (error) {
    if (
      !inputRequiresDocumentStorageSchema(input) &&
      isDocumentMetadataSchemaError(error)
    ) {
      const { data: legacyData, error: legacyError } = await client
        .from("documents")
        .insert(buildLegacyDocumentInput(input))
        .select("*")
        .single();

      if (legacyError) {
        throw legacyError;
      }

      return legacyData;
    }

    throw error;
  }

  return data;
}

export async function updateDocument(
  client: CrmClient,
  id: string,
  input: Partial<DocumentInput>,
) {
  const documentInput = {
    ...(input.company_id !== undefined ? { company_id: input.company_id } : {}),
    ...(input.customer_id !== undefined ? { customer_id: input.customer_id } : {}),
    ...(input.lead_id !== undefined ? { lead_id: input.lead_id } : {}),
    ...(input.job_id !== undefined ? { job_id: input.job_id } : {}),
    ...(input.estimate_id !== undefined ? { estimate_id: input.estimate_id } : {}),
    ...(input.inspection_id !== undefined ? { inspection_id: input.inspection_id } : {}),
    ...(input.invoice_id !== undefined ? { invoice_id: input.invoice_id } : {}),
    ...(input.change_order_id !== undefined
      ? { change_order_id: input.change_order_id }
      : {}),
    ...(input.property_id !== undefined ? { property_id: input.property_id } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.template_key !== undefined ? { template_key: input.template_key } : {}),
    ...(input.file_url !== undefined ? { file_url: input.file_url } : {}),
    ...(input.file_name !== undefined ? { file_name: input.file_name } : {}),
    ...(input.file_size_bytes !== undefined ? { file_size_bytes: input.file_size_bytes } : {}),
    ...(input.mime_type !== undefined ? { mime_type: input.mime_type } : {}),
    ...(input.storage_bucket !== undefined ? { storage_bucket: input.storage_bucket } : {}),
    ...(input.storage_path !== undefined ? { storage_path: input.storage_path } : {}),
    ...(input.uploaded_by !== undefined ? { uploaded_by: input.uploaded_by } : {}),
    ...(input.uploaded_at !== undefined ? { uploaded_at: input.uploaded_at } : {}),
    ...(input.archived_at !== undefined ? { archived_at: input.archived_at } : {}),
    ...(input.property_address !== undefined ? { property_address: input.property_address } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.requirement_level !== undefined
      ? { requirement_level: input.requirement_level }
      : {}),
    ...(input.required_for !== undefined ? { required_for: input.required_for } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
  };

  const { data, error } = await client
    .from("documents")
    .update(documentInput)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (
      !inputRequiresDocumentStorageSchema(input) &&
      isDocumentMetadataSchemaError(error)
    ) {
      const updatePayload = {
        ...(input.company_id !== undefined ? { company_id: input.company_id } : {}),
        ...(input.customer_id !== undefined ? { customer_id: input.customer_id } : {}),
        ...(input.job_id !== undefined ? { job_id: input.job_id } : {}),
        ...(input.estimate_id !== undefined ? { estimate_id: input.estimate_id } : {}),
        ...(input.invoice_id !== undefined ? { invoice_id: input.invoice_id } : {}),
        ...(input.change_order_id !== undefined
          ? { change_order_id: input.change_order_id }
          : {}),
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.template_key !== undefined ? { template_key: input.template_key } : {}),
        ...(input.file_url !== undefined ? { file_url: input.file_url } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
      };
      const { data: legacyData, error: legacyError } = await client
        .from("documents")
        .update(updatePayload)
        .eq("id", id)
        .select("*")
        .single();

      if (legacyError) {
        throw legacyError;
      }

      return legacyData;
    }

    throw error;
  }

  return data;
}

export async function uploadDocumentFile(
  client: CrmClient,
  input: DocumentInput,
  file: File | null,
) {
  if (!file) {
    throw new Error("Choose a document file to upload.");
  }

  const storagePath = buildDocumentStoragePath(input, file);
  const { error: uploadError } = await client.storage
    .from(DOCUMENT_STORAGE_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    throw uploadError;
  }

  try {
    return await createDocument(client, {
      ...input,
      status: input.status ?? "ready",
      file_name: input.file_name ?? file.name,
      file_size_bytes: input.file_size_bytes ?? file.size,
      mime_type: input.mime_type ?? (file.type || "application/octet-stream"),
      storage_bucket: DOCUMENT_STORAGE_BUCKET,
      storage_path: storagePath,
      uploaded_at: input.uploaded_at ?? new Date().toISOString(),
    });
  } catch (error) {
    try {
      await client.storage.from(DOCUMENT_STORAGE_BUCKET).remove([storagePath]);
    } catch {
      // Preserve the metadata failure as the primary error; cleanup is best effort.
    }
    throw error;
  }
}

export async function getDocumentFileSignedUrl(
  client: CrmClient,
  document: DocumentRecord,
  options: { download?: boolean } = {},
) {
  if (document.storage_path) {
    const { data, error } = await client.storage
      .from(document.storage_bucket ?? DOCUMENT_STORAGE_BUCKET)
      .createSignedUrl(
        document.storage_path,
        60 * 10,
        options.download ? { download: document.file_name ?? true } : undefined,
      );

    if (error) {
      throw error;
    }

    return data.signedUrl;
  }

  if (document.file_url) {
    return document.file_url;
  }

  throw new Error("This document does not have a file attached.");
}

export async function createPayment(client: CrmClient, input: PaymentInput) {
  let invoice: InvoiceRecord | null = null;

  if (input.invoice_id && (input.status ?? "posted") === "posted") {
    const { data, error: invoiceError } = await client
      .from("invoices")
      .select("*")
      .eq("id", input.invoice_id)
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    invoice = data;

    if (input.amount > invoice.balance_due) {
      throw new Error(
        `Payment exceeds remaining invoice balance of ${invoice.balance_due.toFixed(2)}.`,
      );
    }
  }

  const paymentPayload = {
    company_id: input.company_id,
    customer_id: input.customer_id ?? null,
    invoice_id: input.invoice_id ?? null,
    amount: input.amount,
    method: input.method,
    status: input.status ?? "posted",
    paid_at: input.paid_at ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    ...(input.property_id ? { property_id: input.property_id } : {}),
  };

  const { data, error } = await client
    .from("payments")
    .insert(paymentPayload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (input.invoice_id && invoice && (input.status ?? "posted") === "posted") {
    const amountPaid = invoice.amount_paid + input.amount;
    const balanceDue = Math.max(invoice.total - amountPaid, 0);
    const { error: updateError } = await client
      .from("invoices")
      .update({
        amount_paid: amountPaid,
        balance_due: balanceDue,
        status: balanceDue === 0 ? "paid" : invoice.status,
      })
      .eq("id", input.invoice_id);

    if (updateError) {
      throw updateError;
    }
  }

  return data;
}

export async function createNotification(
  client: CrmClient,
  input: NotificationInput,
) {


  const { data, error } = await client
    .from("notifications")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateNotification(
  client: CrmClient,
  id: string,
  input: Partial<NotificationInput>,
) {


  const { data, error } = await client
    .from("notifications")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createIntegrationConnection(
  client: CrmClient,
  input: IntegrationConnectionInput,
) {


  const { data, error } = await client
    .from("integration_connections")
    .insert({
      ...input,
      status: input.status ?? "connected",
      account_email: input.account_email ?? null,
      external_account_id: input.external_account_id ?? null,
      provider_account_id: input.provider_account_id ?? input.external_account_id ?? null,
      default_calendar_id: input.default_calendar_id ?? null,
      scopes: input.scopes ?? [],
      sync_direction: input.sync_direction ?? "two_way",
      credential_reference: input.credential_reference ?? null,
      webhook_channel_id: input.webhook_channel_id ?? null,
      webhook_resource_id: input.webhook_resource_id ?? null,
      sync_token: input.sync_token ?? null,
      token_expires_at: input.token_expires_at ?? null,
      last_sync_at: input.last_sync_at ?? null,
      last_successful_sync_at: input.last_successful_sync_at ?? null,
      last_failure_at: input.last_failure_at ?? null,
      disabled_at: input.disabled_at ?? null,
      last_error: input.last_error ?? null,
      settings: input.settings ?? {},
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateIntegrationConnection(
  client: CrmClient,
  id: string,
  input: Partial<IntegrationConnectionInput>,
) {


  const { data, error } = await client
    .from("integration_connections")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createIntegrationSyncLog(
  client: CrmClient,
  input: IntegrationSyncLogInput,
) {
  const { data, error } = await client
    .from("integration_sync_logs")
    .insert({
      ...input,
      integration_connection_id: input.integration_connection_id ?? null,
      direction: input.direction ?? "weathertech_to_provider",
      status: input.status ?? "queued",
      related_table: input.related_table ?? null,
      related_record_id: input.related_record_id ?? null,
      external_id: input.external_id ?? null,
      attempt_count: input.attempt_count ?? 0,
      max_attempts: input.max_attempts ?? 3,
      next_retry_at: input.next_retry_at ?? null,
      last_attempted_at: input.last_attempted_at ?? null,
      completed_at: input.completed_at ?? null,
      request_fingerprint: input.request_fingerprint ?? null,
      request_summary: input.request_summary ?? {},
      response_summary: input.response_summary ?? {},
      error_code: input.error_code ?? null,
      error_message: input.error_message ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateIntegrationSyncLog(
  client: CrmClient,
  id: string,
  input: Partial<IntegrationSyncLogInput>,
) {
  const { data, error } = await client
    .from("integration_sync_logs")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function upsertCalendarEventSync(
  client: CrmClient,
  input: CalendarEventSyncInput,
) {


  const { data, error } = await client
    .from("calendar_event_syncs")
    .upsert(
      {
        ...input,
        provider: input.provider ?? "google_calendar",
        google_event_id: input.google_event_id ?? null,
        google_recurring_event_id: input.google_recurring_event_id ?? null,
        google_event_etag: input.google_event_etag ?? null,
        google_event_status: input.google_event_status ?? "confirmed",
        sync_status: input.sync_status ?? "queued",
        sync_direction: input.sync_direction ?? "two_way",
        last_synced_at: input.last_synced_at ?? null,
        external_updated_at: input.external_updated_at ?? null,
        provider_updated_at: input.provider_updated_at ?? null,
        deleted_at: input.deleted_at ?? null,
        conflict_status: input.conflict_status ?? "none",
        conflict_reason: input.conflict_reason ?? null,
        sync_attempt_count: input.sync_attempt_count ?? 0,
        last_synced_direction: input.last_synced_direction ?? null,
        last_error: input.last_error ?? null,
        last_payload_hash: input.last_payload_hash ?? null,
        metadata: input.metadata ?? {},
      },
      {
        onConflict: "integration_connection_id,schedule_event_id",
      },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createEmailMessage(client: CrmClient, input: EmailMessageInput) {


  const now = new Date().toISOString();
  const { data, error } = await client
    .from("email_messages")
    .insert({
      ...input,
      customer_id: input.customer_id ?? null,
      lead_id: input.lead_id ?? null,
      job_id: input.job_id ?? null,
      property_id: input.property_id ?? null,
      estimate_id: input.estimate_id ?? null,
      invoice_id: input.invoice_id ?? null,
      document_id: input.document_id ?? null,
      integration_connection_id: input.integration_connection_id ?? null,
      provider: input.provider ?? "gmail",
      status: input.status ?? "draft",
      direction: input.direction ?? "outbound",
      from_email: input.from_email ?? null,
      cc_email: input.cc_email ?? null,
      to_emails: input.to_emails ?? [input.to_email],
      cc_emails: input.cc_emails ?? (input.cc_email ? [input.cc_email] : []),
      bcc_emails: input.bcc_emails ?? [],
      reply_to_emails: input.reply_to_emails ?? [],
      gmail_message_id: input.gmail_message_id ?? null,
      gmail_thread_id: input.gmail_thread_id ?? null,
      provider_account_id: input.provider_account_id ?? null,
      queued_at: input.queued_at ?? (input.status === "queued" ? now : null),
      sent_at: input.sent_at ?? null,
      received_at: input.received_at ?? null,
      message_preview:
        input.message_preview ?? input.body.replace(/\s+/g, " ").trim().slice(0, 500),
      has_attachments: input.has_attachments ?? false,
      attachment_count: input.attachment_count ?? 0,
      sync_status:
        input.sync_status ??
        (input.status === "queued"
          ? "queued"
          : input.status === "sent"
            ? "sent"
            : input.status === "failed"
              ? "failed"
              : "local"),
      imported_at: input.imported_at ?? null,
      provider_payload_hash: input.provider_payload_hash ?? null,
      metadata: input.metadata ?? {},
      last_error: input.last_error ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateEmailMessage(
  client: CrmClient,
  id: string,
  input: Partial<EmailMessageInput>,
) {


  const { data, error } = await client
    .from("email_messages")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createSmsMessage(client: CrmClient, input: SmsMessageInput) {
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("sms_messages")
    .insert({
      ...input,
      customer_id: input.customer_id ?? null,
      lead_id: input.lead_id ?? null,
      job_id: input.job_id ?? null,
      schedule_event_id: input.schedule_event_id ?? null,
      invoice_id: input.invoice_id ?? null,
      integration_connection_id: input.integration_connection_id ?? null,
      provider: input.provider ?? "twilio_sms",
      status: input.status ?? "draft",
      from_phone: input.from_phone ?? null,
      twilio_message_sid: input.twilio_message_sid ?? null,
      queued_at: input.queued_at ?? (input.status === "queued" ? now : null),
      sent_at: input.sent_at ?? null,
      last_error: input.last_error ?? null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateSmsMessage(
  client: CrmClient,
  id: string,
  input: Partial<SmsMessageInput>,
) {
  const { data, error } = await client
    .from("sms_messages")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function buildRoutePlanPayload(input: RoutePlanInput) {
  return {
    company_id: input.company_id,
    name: input.name,
    route_date: input.route_date,
    status: input.status ?? "draft",
    origin_address: input.origin_address,
    destination_address: input.destination_address ?? null,
    travel_mode: input.travel_mode ?? "driving",
    avoid_tolls: input.avoid_tolls ?? false,
    avoid_highways: input.avoid_highways ?? false,
    total_distance_meters: input.total_distance_meters ?? 0,
    total_duration_seconds: input.total_duration_seconds ?? 0,
    estimated_fuel_cost: input.estimated_fuel_cost ?? 0,
    google_route_token: input.google_route_token ?? null,
    encoded_polyline: input.encoded_polyline ?? null,
    provider_payload: input.provider_payload ?? {},
  };
}

function buildRouteStopPayload(input: RoutePlanStopInput, routePlanId: string) {
  return {
    route_plan_id: routePlanId,
    company_id: input.company_id,
    stop_type: input.stop_type,
    lead_id: input.lead_id ?? null,
    job_id: input.job_id ?? null,
    schedule_event_id: input.schedule_event_id ?? null,
    sort_order: input.sort_order,
    title: input.title,
    address: input.address,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    google_place_id: input.google_place_id ?? null,
    estimated_arrival_at: input.estimated_arrival_at ?? null,
    estimated_departure_at: input.estimated_departure_at ?? null,
    distance_from_previous_meters: input.distance_from_previous_meters ?? 0,
    duration_from_previous_seconds: input.duration_from_previous_seconds ?? 0,
    notes: input.notes ?? null,
  };
}

export async function createRoutePlan(
  client: CrmClient,
  input: RoutePlanInput,
  stops: RoutePlanStopInput[],
) {


  const { data: routePlan, error } = await client
    .from("route_plans")
    .insert(buildRoutePlanPayload(input))
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (stops.length) {
    const { error: stopsError } = await client
      .from("route_plan_stops")
      .insert(stops.map((stop) => buildRouteStopPayload(stop, routePlan.id)));

    if (stopsError) {
      throw stopsError;
    }
  }

  return routePlan;
}
