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
    error,
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

type LegacyLeadRecord = Partial<LeadRecord> & {
  customer_name?: string | null;
  lead_source?: string | null;
  service_needed?: string | null;
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

function createEmptyCrmSnapshot(core: CoreCrmSnapshot): CrmSnapshot {
  return {
    ...core,
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
    notifications: [],
    integrationConnections: [],
    integrationSyncLogs: [],
    calendarEventSyncs: [],
    emailMessages: [],
    smsMessages: [],
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
    notifications,
    integrationConnections,
    integrationSyncLogs,
    calendarEventSyncs,
    emailMessages,
    smsMessages,
    routePlans,
    routePlanStops,
    companyMemberships,
    companyWorkflowSettings,
  ] = await Promise.all([
    client.from("companies").select("*").order("name", { ascending: true }),
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
      .from("calendar_event_syncs")
      .select("*")
      .order("updated_at", { ascending: false }),
    client.from("email_messages").select("*").order("updated_at", { ascending: false }),
    client.from("sms_messages").select("*").order("updated_at", { ascending: false }),
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
    ["notifications", notifications],
    ["integration_connections", integrationConnections],
    ["integration_sync_logs", integrationSyncLogs],
    ["calendar_event_syncs", calendarEventSyncs],
    ["email_messages", emailMessages],
    ["sms_messages", smsMessages],
    ["route_plans", routePlans],
    ["route_plan_stops", routePlanStops],
    ["company_memberships", companyMemberships],
    ["company_workflow_settings", companyWorkflowSettings],
  ]);

  return {
    companies: requireRows("companies", companies),
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
    inspections: requireRows("inspections", inspections),
    dailyLogs: requireRows("daily_logs", dailyLogs),
    changeOrders: requireRows("change_orders", changeOrders),
    signatures: requireRows("signatures", signatures),
    documents: requireRows("documents", documents),
    payments: requireRows("payments", payments),
    notifications: requireRows("notifications", notifications),
    integrationConnections: requireRows("integration_connections", integrationConnections),
    integrationSyncLogs: requireRows("integration_sync_logs", integrationSyncLogs),
    calendarEventSyncs: requireRows("calendar_event_syncs", calendarEventSyncs),
    emailMessages: requireRows("email_messages", emailMessages),
    smsMessages: requireRows("sms_messages", smsMessages),
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

export async function createJobPhoto(
  client: CrmClient,
  input: JobPhotoInput,
  file: File | null,
) {
  const now = new Date().toISOString();

  

  if (!file) {
    throw new Error("Choose a photo to upload.");
  }

  const relationId = input.job_id ?? input.customer_id ?? input.estimate_id ?? "general";
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
  const { data, error } = await client
    .from("job_photos")
    .insert({
      ...input,
      customer_id: input.customer_id ?? null,
      job_id: input.job_id ?? null,
      estimate_id: input.estimate_id ?? null,
      caption: input.caption ?? null,
      taken_at: input.taken_at ?? null,
      file_path: filePath,
      file_url: publicUrl.publicUrl,
    })
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

  return {
    ...input,
    customer_id: input.customer_id ?? null,
    job_id: input.job_id ?? null,
    estimate_id: input.estimate_id ?? null,
    status: input.status ?? "draft",
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
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
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
    .insert(input)
    .select("*")
    .single();

  if (error) {
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
    throw error;
  }

  return data;
}

export async function createDocument(client: CrmClient, input: DocumentInput) {
  const documentInput = {
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

  const { data, error } = await client
    .from("documents")
    .insert(documentInput)
    .select("*")
    .single();

  if (error) {
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

  const { data, error } = await client
    .from("documents")
    .update(documentInput)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function createPayment(client: CrmClient, input: PaymentInput) {
  

  const { data, error } = await client
    .from("payments")
    .insert(input)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  if (input.invoice_id && (input.status ?? "posted") === "posted") {
    const { data: invoice, error: invoiceError } = await client
      .from("invoices")
      .select("*")
      .eq("id", input.invoice_id)
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

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
      default_calendar_id: input.default_calendar_id ?? null,
      scopes: input.scopes ?? [],
      sync_direction: input.sync_direction ?? "two_way",
      credential_reference: input.credential_reference ?? null,
      webhook_channel_id: input.webhook_channel_id ?? null,
      webhook_resource_id: input.webhook_resource_id ?? null,
      sync_token: input.sync_token ?? null,
      last_sync_at: input.last_sync_at ?? null,
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
        sync_status: input.sync_status ?? "queued",
        sync_direction: input.sync_direction ?? "two_way",
        last_synced_at: input.last_synced_at ?? null,
        external_updated_at: input.external_updated_at ?? null,
        last_error: input.last_error ?? null,
        last_payload_hash: input.last_payload_hash ?? null,
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
      estimate_id: input.estimate_id ?? null,
      invoice_id: input.invoice_id ?? null,
      document_id: input.document_id ?? null,
      integration_connection_id: input.integration_connection_id ?? null,
      provider: input.provider ?? "gmail",
      status: input.status ?? "draft",
      cc_email: input.cc_email ?? null,
      gmail_message_id: input.gmail_message_id ?? null,
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
