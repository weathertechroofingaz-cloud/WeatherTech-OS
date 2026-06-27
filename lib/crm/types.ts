export type Trade = "roofing" | "painting" | "both";
export type ServiceType = "roofing" | "painting" | "both";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "estimate_sent"
  | "won"
  | "lost";
export type LeadPriority = "low" | "normal" | "high" | "urgent";
export type CustomerType = "homeowner" | "commercial" | "hoa" | "property_manager";
export type CustomerStatus = "active" | "inactive" | "prospect";
export type EstimateStatus = "draft" | "sent" | "approved" | "rejected" | "expired";
export type EstimateLineItemCategory = "labor" | "material" | "other";
export type DiscountType = "fixed" | "percent";
export type ScopeCategory =
  | "roofing"
  | "exterior_painting"
  | "interior_painting"
  | "cabinet_refinishing"
  | "roof_repairs"
  | "tile_underlayment"
  | "custom";
export type ScopeStatus = "draft" | "ready" | "sent" | "approved";
export type JobStatus =
  | "scheduled"
  | "in_progress"
  | "blocked"
  | "completed"
  | "closed";
export type ScheduleEventType =
  | "inspection"
  | "estimate"
  | "job"
  | "follow_up"
  | "material_delivery";
export type ScheduleEventStatus = "scheduled" | "completed" | "canceled";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type MaterialOrderStatus =
  | "draft"
  | "ordered"
  | "partial"
  | "received"
  | "canceled";
export type EmployeeRole =
  | "owner"
  | "admin"
  | "sales"
  | "project_manager"
  | "crew_lead"
  | "technician";
export type AssignmentStatus = "assigned" | "accepted" | "completed" | "missed";
export type TimeEntryStatus = "clocked_in" | "submitted" | "approved";
export type InspectionStatus = "pending" | "passed" | "failed" | "needs_review";
export type ChangeOrderStatus = "draft" | "sent" | "approved" | "rejected";
export type SignatureStatus = "pending" | "signed" | "declined";
export type DocumentCategory =
  | "estimate"
  | "scope"
  | "invoice"
  | "change_order"
  | "contract"
  | "photo"
  | "other";
export type PaymentStatus = "pending" | "posted" | "failed" | "refunded";
export type NotificationChannel = "email" | "sms" | "in_app";
export type NotificationStatus = "queued" | "sent" | "read" | "dismissed";
export type IntegrationProvider =
  | "google_calendar"
  | "gmail"
  | "google_maps"
  | "twilio_sms";
export type IntegrationConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "paused"
  | "error";
export type IntegrationSyncDirection =
  | "two_way"
  | "weathertech_to_provider"
  | "provider_to_weathertech";
export type CalendarEventSyncStatus =
  | "queued"
  | "synced"
  | "needs_update"
  | "conflict"
  | "error";
export type EmailMessageCategory =
  | "estimate"
  | "invoice"
  | "follow_up"
  | "job_update"
  | "general";
export type EmailMessageStatus = "draft" | "queued" | "sent" | "failed";
export type SmsMessageCategory =
  | "appointment_reminder"
  | "estimate_follow_up"
  | "invoice_reminder"
  | "job_update"
  | "weather_delay"
  | "general";
export type SmsMessageStatus = "draft" | "queued" | "sent" | "failed";
export type RoutePlanStatus = "draft" | "optimized" | "dispatched";
export type RouteStopType = "lead" | "job";
export type RouteTravelMode = "driving";

export type CompanyRecord = {
  id: string;
  name: string;
  trade: Trade;
  phone: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerRecord = {
  id: string;
  company_id: string;
  display_name: string;
  contact_name: string;
  phone: string | null;
  email: string | null;
  property_address: string;
  city: string | null;
  state: string;
  postal_code: string | null;
  customer_type: CustomerType;
  status: CustomerStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  contact_name: string;
  phone: string | null;
  email: string | null;
  property_address: string;
  city: string | null;
  state: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  address_verified_at: string | null;
  service_type: ServiceType;
  source: string;
  status: LeadStatus;
  priority: LeadPriority;
  estimated_value: number;
  next_follow_up: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  title: string;
  status: EstimateStatus;
  service_type: ServiceType;
  issue_date: string;
  expiration_date: string | null;
  subtotal: number;
  labor_total: number;
  material_total: number;
  tax_rate: number;
  tax_total: number;
  discount_type: DiscountType;
  discount_value: number;
  discount_total: number;
  profit_margin_rate: number;
  profit_margin_total: number;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateLineItemRecord = {
  id: string;
  estimate_id: string;
  category: EstimateLineItemCategory;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_cost: number;
  markup_rate: number;
  taxable: boolean;
  sort_order: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type ScopeTemplateRecord = {
  id: string;
  title: string;
  category: ScopeCategory;
  description: string;
  template_body: string;
  ai_prompt: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ScopeRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  estimate_id: string | null;
  template_id: string | null;
  title: string;
  category: ScopeCategory;
  status: ScopeStatus;
  scope_body: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  estimate_id: string | null;
  scope_id: string | null;
  title: string;
  service_type: ServiceType;
  status: JobStatus;
  start_date: string | null;
  end_date: string | null;
  crew_name: string | null;
  project_manager: string | null;
  property_address: string;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  address_verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleEventRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  title: string;
  event_type: ScheduleEventType;
  status: ScheduleEventStatus;
  start_at: string;
  end_at: string;
  location: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobPhotoRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  caption: string | null;
  file_path: string;
  file_url: string;
  taken_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  invoice_number: string;
  title: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  subtotal: number;
  tax_rate: number;
  tax_total: number;
  discount_total: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItemRecord = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_cost: number;
  taxable: boolean;
  sort_order: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type MaterialOrderRecord = {
  id: string;
  company_id: string;
  job_id: string | null;
  supplier_name: string;
  status: MaterialOrderStatus;
  requested_date: string;
  expected_delivery_date: string | null;
  delivery_address: string | null;
  total: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MaterialOrderItemRecord = {
  id: string;
  material_order_id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  sort_order: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type EmployeeRecord = {
  id: string;
  company_id: string;
  full_name: string;
  role: EmployeeRole;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type JobAssignmentRecord = {
  id: string;
  company_id: string;
  employee_id: string;
  job_id: string | null;
  schedule_event_id: string | null;
  title: string;
  status: AssignmentStatus;
  assigned_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type TimeEntryRecord = {
  id: string;
  company_id: string;
  employee_id: string;
  job_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  break_minutes: number;
  status: TimeEntryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InspectionRecord = {
  id: string;
  company_id: string;
  employee_id: string | null;
  job_id: string;
  title: string;
  status: InspectionStatus;
  checklist: string;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyLogRecord = {
  id: string;
  company_id: string;
  employee_id: string | null;
  job_id: string;
  log_date: string;
  weather_summary: string | null;
  work_completed: string;
  blockers: string | null;
  tomorrow_plan: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeOrderRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  title: string;
  status: ChangeOrderStatus;
  reason: string;
  amount: number;
  tax_rate: number;
  tax_total: number;
  total: number;
  requested_date: string;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type SignatureRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  employee_id: string | null;
  document_id: string | null;
  change_order_id: string | null;
  signer_name: string;
  signer_email: string | null;
  status: SignatureStatus;
  signature_data: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  change_order_id: string | null;
  title: string;
  category: DocumentCategory;
  file_url: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  amount: number;
  method: string;
  status: PaymentStatus;
  paid_at: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  employee_id: string | null;
  title: string;
  message: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  remind_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IntegrationConnectionRecord = {
  id: string;
  company_id: string;
  provider: IntegrationProvider;
  status: IntegrationConnectionStatus;
  account_email: string | null;
  display_name: string;
  external_account_id: string | null;
  default_calendar_id: string | null;
  scopes: string[];
  sync_direction: IntegrationSyncDirection;
  credential_reference: string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  sync_token: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CalendarEventSyncRecord = {
  id: string;
  company_id: string;
  schedule_event_id: string;
  integration_connection_id: string;
  provider: IntegrationProvider;
  google_calendar_id: string;
  google_event_id: string | null;
  sync_status: CalendarEventSyncStatus;
  sync_direction: IntegrationSyncDirection;
  last_synced_at: string | null;
  external_updated_at: string | null;
  last_error: string | null;
  last_payload_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailMessageRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  document_id: string | null;
  integration_connection_id: string | null;
  provider: Extract<IntegrationProvider, "gmail">;
  category: EmailMessageCategory;
  status: EmailMessageStatus;
  to_email: string;
  cc_email: string | null;
  subject: string;
  body: string;
  gmail_message_id: string | null;
  queued_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type SmsMessageRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  schedule_event_id: string | null;
  invoice_id: string | null;
  integration_connection_id: string | null;
  provider: Extract<IntegrationProvider, "twilio_sms">;
  category: SmsMessageCategory;
  status: SmsMessageStatus;
  to_phone: string;
  from_phone: string | null;
  body: string;
  twilio_message_sid: string | null;
  queued_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type RoutePlanRecord = {
  id: string;
  company_id: string;
  name: string;
  route_date: string;
  status: RoutePlanStatus;
  origin_address: string;
  destination_address: string | null;
  travel_mode: RouteTravelMode;
  avoid_tolls: boolean;
  avoid_highways: boolean;
  total_distance_meters: number;
  total_duration_seconds: number;
  estimated_fuel_cost: number;
  google_route_token: string | null;
  encoded_polyline: string | null;
  provider_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type RoutePlanStopRecord = {
  id: string;
  route_plan_id: string;
  company_id: string;
  stop_type: RouteStopType;
  lead_id: string | null;
  job_id: string | null;
  schedule_event_id: string | null;
  sort_order: number;
  title: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  estimated_arrival_at: string | null;
  estimated_departure_at: string | null;
  distance_from_previous_meters: number;
  duration_from_previous_seconds: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadInput = {
  company_id: string;
  contact_name: string;
  phone?: string | null;
  email?: string | null;
  property_address: string;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  address_verified_at?: string | null;
  service_type: ServiceType;
  source?: string;
  status?: LeadStatus;
  priority?: LeadPriority;
  estimated_value?: number;
  next_follow_up?: string | null;
  notes?: string | null;
};

export type CustomerInput = {
  company_id: string;
  display_name: string;
  contact_name: string;
  phone?: string | null;
  email?: string | null;
  property_address: string;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  customer_type?: CustomerType;
  status?: CustomerStatus;
  notes?: string | null;
};

export type EstimateLineItemInput = {
  id?: string;
  category: EstimateLineItemCategory;
  name: string;
  description?: string | null;
  quantity: number;
  unit?: string;
  unit_cost: number;
  markup_rate?: number;
  taxable?: boolean;
  sort_order?: number;
};

export type EstimateInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  title: string;
  status?: EstimateStatus;
  service_type: ServiceType;
  issue_date: string;
  expiration_date?: string | null;
  tax_rate?: number;
  discount_type?: DiscountType;
  discount_value?: number;
  profit_margin_rate?: number;
  notes?: string | null;
};

export type ScopeInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  estimate_id?: string | null;
  template_id?: string | null;
  title: string;
  category: ScopeCategory;
  status?: ScopeStatus;
  scope_body: string;
  notes?: string | null;
};

export type JobInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  estimate_id?: string | null;
  scope_id?: string | null;
  title: string;
  service_type: ServiceType;
  status?: JobStatus;
  start_date?: string | null;
  end_date?: string | null;
  crew_name?: string | null;
  project_manager?: string | null;
  property_address: string;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  address_verified_at?: string | null;
  notes?: string | null;
};

export type ScheduleEventInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  title: string;
  event_type: ScheduleEventType;
  status?: ScheduleEventStatus;
  start_at: string;
  end_at: string;
  location?: string | null;
  notes?: string | null;
};

export type JobPhotoInput = {
  company_id: string;
  customer_id?: string | null;
  job_id?: string | null;
  estimate_id?: string | null;
  caption?: string | null;
  taken_at?: string | null;
};

export type InvoiceLineItemInput = {
  id?: string;
  description: string;
  quantity: number;
  unit_cost: number;
  taxable?: boolean;
  sort_order?: number;
};

export type InvoiceInput = {
  company_id: string;
  customer_id?: string | null;
  job_id?: string | null;
  estimate_id?: string | null;
  invoice_number: string;
  title: string;
  status?: InvoiceStatus;
  issue_date: string;
  due_date?: string | null;
  tax_rate?: number;
  discount_total?: number;
  amount_paid?: number;
  notes?: string | null;
};

export type MaterialOrderItemInput = {
  id?: string;
  name: string;
  quantity: number;
  unit?: string;
  unit_cost: number;
  sort_order?: number;
};

export type MaterialOrderInput = {
  company_id: string;
  job_id?: string | null;
  supplier_name: string;
  status?: MaterialOrderStatus;
  requested_date: string;
  expected_delivery_date?: string | null;
  delivery_address?: string | null;
  notes?: string | null;
};

export type EmployeeInput = {
  company_id: string;
  full_name: string;
  role: EmployeeRole;
  phone?: string | null;
  email?: string | null;
  is_active?: boolean;
};

export type JobAssignmentInput = {
  company_id: string;
  employee_id: string;
  job_id?: string | null;
  schedule_event_id?: string | null;
  title: string;
  status?: AssignmentStatus;
  assigned_date: string;
  notes?: string | null;
};

export type TimeEntryInput = {
  company_id: string;
  employee_id: string;
  job_id?: string | null;
  clock_in_at: string;
  clock_out_at?: string | null;
  break_minutes?: number;
  status?: TimeEntryStatus;
  notes?: string | null;
};

export type InspectionInput = {
  company_id: string;
  employee_id?: string | null;
  job_id: string;
  title: string;
  status?: InspectionStatus;
  checklist: string;
  completed_at?: string | null;
  notes?: string | null;
};

export type DailyLogInput = {
  company_id: string;
  employee_id?: string | null;
  job_id: string;
  log_date: string;
  weather_summary?: string | null;
  work_completed: string;
  blockers?: string | null;
  tomorrow_plan?: string | null;
};

export type ChangeOrderInput = {
  company_id: string;
  customer_id?: string | null;
  job_id?: string | null;
  estimate_id?: string | null;
  title: string;
  status?: ChangeOrderStatus;
  reason: string;
  amount: number;
  tax_rate?: number;
  requested_date: string;
  approved_at?: string | null;
  notes?: string | null;
};

export type SignatureInput = {
  company_id: string;
  customer_id?: string | null;
  employee_id?: string | null;
  document_id?: string | null;
  change_order_id?: string | null;
  signer_name: string;
  signer_email?: string | null;
  status?: SignatureStatus;
  signature_data?: string | null;
  signed_at?: string | null;
};

export type DocumentInput = {
  company_id: string;
  customer_id?: string | null;
  job_id?: string | null;
  estimate_id?: string | null;
  invoice_id?: string | null;
  change_order_id?: string | null;
  title: string;
  category: DocumentCategory;
  file_url?: string | null;
  body?: string | null;
};

export type PaymentInput = {
  company_id: string;
  customer_id?: string | null;
  invoice_id?: string | null;
  amount: number;
  method: string;
  status?: PaymentStatus;
  paid_at?: string | null;
  reference?: string | null;
  notes?: string | null;
};

export type NotificationInput = {
  company_id: string;
  customer_id?: string | null;
  employee_id?: string | null;
  title: string;
  message: string;
  channel: NotificationChannel;
  status?: NotificationStatus;
  remind_at?: string | null;
};

export type IntegrationConnectionInput = {
  company_id: string;
  provider: IntegrationProvider;
  status?: IntegrationConnectionStatus;
  account_email?: string | null;
  display_name: string;
  external_account_id?: string | null;
  default_calendar_id?: string | null;
  scopes?: string[];
  sync_direction?: IntegrationSyncDirection;
  credential_reference?: string | null;
  webhook_channel_id?: string | null;
  webhook_resource_id?: string | null;
  sync_token?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  settings?: Record<string, unknown>;
};

export type CalendarEventSyncInput = {
  company_id: string;
  schedule_event_id: string;
  integration_connection_id: string;
  provider?: IntegrationProvider;
  google_calendar_id: string;
  google_event_id?: string | null;
  sync_status?: CalendarEventSyncStatus;
  sync_direction?: IntegrationSyncDirection;
  last_synced_at?: string | null;
  external_updated_at?: string | null;
  last_error?: string | null;
  last_payload_hash?: string | null;
};

export type EmailMessageInput = {
  company_id: string;
  customer_id?: string | null;
  estimate_id?: string | null;
  invoice_id?: string | null;
  document_id?: string | null;
  integration_connection_id?: string | null;
  provider?: Extract<IntegrationProvider, "gmail">;
  category: EmailMessageCategory;
  status?: EmailMessageStatus;
  to_email: string;
  cc_email?: string | null;
  subject: string;
  body: string;
  gmail_message_id?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
  last_error?: string | null;
};

export type SmsMessageInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  schedule_event_id?: string | null;
  invoice_id?: string | null;
  integration_connection_id?: string | null;
  provider?: Extract<IntegrationProvider, "twilio_sms">;
  category: SmsMessageCategory;
  status?: SmsMessageStatus;
  to_phone: string;
  from_phone?: string | null;
  body: string;
  twilio_message_sid?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
  last_error?: string | null;
};

export type RoutePlanInput = {
  company_id: string;
  name: string;
  route_date: string;
  status?: RoutePlanStatus;
  origin_address: string;
  destination_address?: string | null;
  travel_mode?: RouteTravelMode;
  avoid_tolls?: boolean;
  avoid_highways?: boolean;
  total_distance_meters?: number;
  total_duration_seconds?: number;
  estimated_fuel_cost?: number;
  google_route_token?: string | null;
  encoded_polyline?: string | null;
  provider_payload?: Record<string, unknown>;
};

export type RoutePlanStopInput = {
  company_id: string;
  stop_type: RouteStopType;
  lead_id?: string | null;
  job_id?: string | null;
  schedule_event_id?: string | null;
  sort_order: number;
  title: string;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  estimated_arrival_at?: string | null;
  estimated_departure_at?: string | null;
  distance_from_previous_meters?: number;
  duration_from_previous_seconds?: number;
  notes?: string | null;
};

export type CompanyInsert = {
  id?: string;
  name: string;
  trade: Trade;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CustomerInsert = CustomerInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type LeadInsert = LeadInput & {
  id?: string;
  customer_id?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type EstimateInsert = EstimateInput & {
  id?: string;
  subtotal?: number;
  labor_total?: number;
  material_total?: number;
  tax_total?: number;
  discount_total?: number;
  profit_margin_total?: number;
  total?: number;
  created_at?: string;
  updated_at?: string;
};

export type EstimateLineItemInsert = EstimateLineItemInput & {
  id?: string;
  estimate_id: string;
  total?: number;
  created_at?: string;
  updated_at?: string;
};

export type ScopeTemplateInsert = {
  id?: string;
  title: string;
  category: ScopeCategory;
  description: string;
  template_body: string;
  ai_prompt: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type ScopeInsert = ScopeInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type JobInsert = JobInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ScheduleEventInsert = ScheduleEventInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type JobPhotoInsert = JobPhotoInput & {
  id?: string;
  file_path: string;
  file_url: string;
  created_at?: string;
  updated_at?: string;
};

export type InvoiceInsert = InvoiceInput & {
  id?: string;
  subtotal?: number;
  tax_total?: number;
  total?: number;
  balance_due?: number;
  created_at?: string;
  updated_at?: string;
};

export type InvoiceLineItemInsert = InvoiceLineItemInput & {
  id?: string;
  invoice_id: string;
  total?: number;
  created_at?: string;
  updated_at?: string;
};

export type MaterialOrderInsert = MaterialOrderInput & {
  id?: string;
  total?: number;
  created_at?: string;
  updated_at?: string;
};

export type MaterialOrderItemInsert = MaterialOrderItemInput & {
  id?: string;
  material_order_id: string;
  total?: number;
  created_at?: string;
  updated_at?: string;
};

export type EmployeeInsert = EmployeeInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type JobAssignmentInsert = JobAssignmentInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type TimeEntryInsert = TimeEntryInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type InspectionInsert = InspectionInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DailyLogInsert = DailyLogInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ChangeOrderInsert = ChangeOrderInput & {
  id?: string;
  tax_total?: number;
  total?: number;
  created_at?: string;
  updated_at?: string;
};

export type SignatureInsert = SignatureInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type DocumentInsert = DocumentInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type PaymentInsert = PaymentInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type NotificationInsert = NotificationInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type IntegrationConnectionInsert = IntegrationConnectionInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type CalendarEventSyncInsert = CalendarEventSyncInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type EmailMessageInsert = EmailMessageInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type SmsMessageInsert = SmsMessageInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type RoutePlanInsert = RoutePlanInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type RoutePlanStopInsert = RoutePlanStopInput & {
  id?: string;
  route_plan_id: string;
  created_at?: string;
  updated_at?: string;
};

export type CrmSnapshot = {
  companies: CompanyRecord[];
  leads: LeadRecord[];
  customers: CustomerRecord[];
  estimates: EstimateRecord[];
  estimateLineItems: EstimateLineItemRecord[];
  scopeTemplates: ScopeTemplateRecord[];
  scopes: ScopeRecord[];
  jobs: JobRecord[];
  scheduleEvents: ScheduleEventRecord[];
  jobPhotos: JobPhotoRecord[];
  invoices: InvoiceRecord[];
  invoiceLineItems: InvoiceLineItemRecord[];
  materialOrders: MaterialOrderRecord[];
  materialOrderItems: MaterialOrderItemRecord[];
  employees: EmployeeRecord[];
  jobAssignments: JobAssignmentRecord[];
  timeEntries: TimeEntryRecord[];
  inspections: InspectionRecord[];
  dailyLogs: DailyLogRecord[];
  changeOrders: ChangeOrderRecord[];
  signatures: SignatureRecord[];
  documents: DocumentRecord[];
  payments: PaymentRecord[];
  notifications: NotificationRecord[];
  integrationConnections: IntegrationConnectionRecord[];
  calendarEventSyncs: CalendarEventSyncRecord[];
  emailMessages: EmailMessageRecord[];
  smsMessages: SmsMessageRecord[];
  routePlans: RoutePlanRecord[];
  routePlanStops: RoutePlanStopRecord[];
};

export type DashboardMetrics = {
  openLeads: number;
  newLeads: number;
  qualifiedLeads: number;
  customers: number;
  urgentFollowUps: number;
  pipelineValue: number;
  wonValue: number;
  openEstimates: number;
  estimateValue: number;
  scopesReady: number;
  activeJobs: number;
  scheduledEvents: number;
  unpaidInvoices: number;
  materialOrdersPending: number;
  revenueCollected: number;
  closeRate: number;
  grossProfit: number;
  productionCompletion: number;
  pendingChangeOrders: number;
  unreadNotifications: number;
};

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: CompanyRecord;
        Insert: CompanyInsert;
        Update: Partial<Database["public"]["Tables"]["companies"]["Insert"]>;
        Relationships: [];
      };
      customers: {
        Row: CustomerRecord;
        Insert: CustomerInsert;
        Update: Partial<Database["public"]["Tables"]["customers"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: LeadRecord;
        Insert: LeadInsert;
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      estimates: {
        Row: EstimateRecord;
        Insert: EstimateInsert;
        Update: Partial<Database["public"]["Tables"]["estimates"]["Insert"]>;
        Relationships: [];
      };
      estimate_line_items: {
        Row: EstimateLineItemRecord;
        Insert: EstimateLineItemInsert;
        Update: Partial<Database["public"]["Tables"]["estimate_line_items"]["Insert"]>;
        Relationships: [];
      };
      scope_templates: {
        Row: ScopeTemplateRecord;
        Insert: ScopeTemplateInsert;
        Update: Partial<Database["public"]["Tables"]["scope_templates"]["Insert"]>;
        Relationships: [];
      };
      scopes: {
        Row: ScopeRecord;
        Insert: ScopeInsert;
        Update: Partial<Database["public"]["Tables"]["scopes"]["Insert"]>;
        Relationships: [];
      };
      jobs: {
        Row: JobRecord;
        Insert: JobInsert;
        Update: Partial<Database["public"]["Tables"]["jobs"]["Insert"]>;
        Relationships: [];
      };
      schedule_events: {
        Row: ScheduleEventRecord;
        Insert: ScheduleEventInsert;
        Update: Partial<Database["public"]["Tables"]["schedule_events"]["Insert"]>;
        Relationships: [];
      };
      job_photos: {
        Row: JobPhotoRecord;
        Insert: JobPhotoInsert;
        Update: Partial<Database["public"]["Tables"]["job_photos"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: InvoiceRecord;
        Insert: InvoiceInsert;
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      invoice_line_items: {
        Row: InvoiceLineItemRecord;
        Insert: InvoiceLineItemInsert;
        Update: Partial<Database["public"]["Tables"]["invoice_line_items"]["Insert"]>;
        Relationships: [];
      };
      material_orders: {
        Row: MaterialOrderRecord;
        Insert: MaterialOrderInsert;
        Update: Partial<Database["public"]["Tables"]["material_orders"]["Insert"]>;
        Relationships: [];
      };
      material_order_items: {
        Row: MaterialOrderItemRecord;
        Insert: MaterialOrderItemInsert;
        Update: Partial<Database["public"]["Tables"]["material_order_items"]["Insert"]>;
        Relationships: [];
      };
      employees: {
        Row: EmployeeRecord;
        Insert: EmployeeInsert;
        Update: Partial<Database["public"]["Tables"]["employees"]["Insert"]>;
        Relationships: [];
      };
      job_assignments: {
        Row: JobAssignmentRecord;
        Insert: JobAssignmentInsert;
        Update: Partial<Database["public"]["Tables"]["job_assignments"]["Insert"]>;
        Relationships: [];
      };
      time_entries: {
        Row: TimeEntryRecord;
        Insert: TimeEntryInsert;
        Update: Partial<Database["public"]["Tables"]["time_entries"]["Insert"]>;
        Relationships: [];
      };
      inspections: {
        Row: InspectionRecord;
        Insert: InspectionInsert;
        Update: Partial<Database["public"]["Tables"]["inspections"]["Insert"]>;
        Relationships: [];
      };
      daily_logs: {
        Row: DailyLogRecord;
        Insert: DailyLogInsert;
        Update: Partial<Database["public"]["Tables"]["daily_logs"]["Insert"]>;
        Relationships: [];
      };
      change_orders: {
        Row: ChangeOrderRecord;
        Insert: ChangeOrderInsert;
        Update: Partial<Database["public"]["Tables"]["change_orders"]["Insert"]>;
        Relationships: [];
      };
      signatures: {
        Row: SignatureRecord;
        Insert: SignatureInsert;
        Update: Partial<Database["public"]["Tables"]["signatures"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: DocumentRecord;
        Insert: DocumentInsert;
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      payments: {
        Row: PaymentRecord;
        Insert: PaymentInsert;
        Update: Partial<Database["public"]["Tables"]["payments"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: NotificationRecord;
        Insert: NotificationInsert;
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      integration_connections: {
        Row: IntegrationConnectionRecord;
        Insert: IntegrationConnectionInsert;
        Update: Partial<
          Database["public"]["Tables"]["integration_connections"]["Insert"]
        >;
        Relationships: [];
      };
      calendar_event_syncs: {
        Row: CalendarEventSyncRecord;
        Insert: CalendarEventSyncInsert;
        Update: Partial<
          Database["public"]["Tables"]["calendar_event_syncs"]["Insert"]
        >;
        Relationships: [];
      };
      email_messages: {
        Row: EmailMessageRecord;
        Insert: EmailMessageInsert;
        Update: Partial<Database["public"]["Tables"]["email_messages"]["Insert"]>;
        Relationships: [];
      };
      sms_messages: {
        Row: SmsMessageRecord;
        Insert: SmsMessageInsert;
        Update: Partial<Database["public"]["Tables"]["sms_messages"]["Insert"]>;
        Relationships: [];
      };
      route_plans: {
        Row: RoutePlanRecord;
        Insert: RoutePlanInsert;
        Update: Partial<Database["public"]["Tables"]["route_plans"]["Insert"]>;
        Relationships: [];
      };
      route_plan_stops: {
        Row: RoutePlanStopRecord;
        Insert: RoutePlanStopInsert;
        Update: Partial<Database["public"]["Tables"]["route_plan_stops"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "owner" | "admin" | "sales" | "production" | "team_member";
          default_company_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "owner" | "admin" | "sales" | "production" | "team_member";
          default_company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
