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
  InvoiceInput,
  InvoiceLineItemInput,
  InvoiceLineItemRecord,
  InvoiceRecord,
  JobAssignmentInput,
  JobAssignmentRecord,
  JobInput,
  JobPhotoInput,
  JobPhotoRecord,
  JobRecord,
  LeadInput,
  LeadRecord,
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

export async function fetchCrmSnapshot(client: CrmClient): Promise<CrmSnapshot> {
  

  const [
    companies,
    leads,
    customers,
    estimates,
    estimateLineItems,
    scopeTemplates,
    scopes,
    jobs,
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
    calendarEventSyncs,
    emailMessages,
    smsMessages,
    routePlans,
    routePlanStops,
    companyMemberships,
    companyWorkflowSettings,
  ] = await Promise.all([
    client.from("companies").select("*").order("name", { ascending: true }),
    client.from("leads").select("*").order("updated_at", { ascending: false }),
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

  if (companies.error) {
    throw companies.error;
  }

  if (leads.error) {
    throw leads.error;
  }

  if (customers.error) {
    throw customers.error;
  }

  if (estimates.error) {
    throw estimates.error;
  }

  if (estimateLineItems.error) {
    throw estimateLineItems.error;
  }

  if (scopeTemplates.error) {
    throw scopeTemplates.error;
  }

  if (scopes.error) {
    throw scopes.error;
  }

  if (jobs.error) {
    throw jobs.error;
  }

  if (scheduleEvents.error) {
    throw scheduleEvents.error;
  }

  if (jobPhotos.error) {
    throw jobPhotos.error;
  }

  if (invoices.error) {
    throw invoices.error;
  }

  if (invoiceLineItems.error) {
    throw invoiceLineItems.error;
  }

  if (materialOrders.error) {
    throw materialOrders.error;
  }

  if (materialOrderItems.error) {
    throw materialOrderItems.error;
  }

  if (employees.error) {
    throw employees.error;
  }

  if (jobAssignments.error) {
    throw jobAssignments.error;
  }

  if (timeEntries.error) {
    throw timeEntries.error;
  }

  if (inspections.error) {
    throw inspections.error;
  }

  if (dailyLogs.error) {
    throw dailyLogs.error;
  }

  if (changeOrders.error) {
    throw changeOrders.error;
  }

  if (signatures.error) {
    throw signatures.error;
  }

  if (documents.error) {
    throw documents.error;
  }

  if (payments.error) {
    throw payments.error;
  }

  if (notifications.error) {
    throw notifications.error;
  }

  if (integrationConnections.error) {
    throw integrationConnections.error;
  }

  if (calendarEventSyncs.error) {
    throw calendarEventSyncs.error;
  }

  if (emailMessages.error) {
    throw emailMessages.error;
  }

  if (smsMessages.error) {
    throw smsMessages.error;
  }

  if (routePlans.error) {
    throw routePlans.error;
  }

  if (routePlanStops.error) {
    throw routePlanStops.error;
  }

  if (companyMemberships.error) {
    throw companyMemberships.error;
  }

  if (companyWorkflowSettings.error) {
    throw companyWorkflowSettings.error;
  }

  return {
    companies: companies.data,
    leads: leads.data,
    customers: customers.data,
    estimates: estimates.data,
    estimateLineItems: estimateLineItems.data,
    scopeTemplates: scopeTemplates.data,
    scopes: scopes.data,
    jobs: jobs.data,
    scheduleEvents: scheduleEvents.data,
    jobPhotos: jobPhotos.data,
    invoices: invoices.data,
    invoiceLineItems: invoiceLineItems.data,
    materialOrders: materialOrders.data,
    materialOrderItems: materialOrderItems.data,
    employees: employees.data,
    jobAssignments: jobAssignments.data,
    timeEntries: timeEntries.data,
    inspections: inspections.data,
    dailyLogs: dailyLogs.data,
    changeOrders: changeOrders.data,
    signatures: signatures.data,
    documents: documents.data,
    payments: payments.data,
    notifications: notifications.data,
    integrationConnections: integrationConnections.data,
    calendarEventSyncs: calendarEventSyncs.data,
    emailMessages: emailMessages.data,
    smsMessages: smsMessages.data,
    routePlans: routePlans.data,
    routePlanStops: routePlanStops.data,
    companyMemberships: companyMemberships.data,
    companyWorkflowSettings: companyWorkflowSettings.data,
  };
}

export async function createLead(client: CrmClient, input: LeadInput) {
  const { data, error } = await client.from("leads").insert(input).select("*").single();

  if (error) {
    throw error;
  }

  return data;
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
    expiration_date: input.expiration_date ?? null,
    notes: input.notes ?? null,
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
  return {
    estimate_id: estimateId,
    category: item.category,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unit: item.unit ?? "each",
    unit_cost: item.unit_cost,
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
