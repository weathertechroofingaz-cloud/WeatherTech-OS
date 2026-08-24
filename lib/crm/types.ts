export type Trade = "roofing" | "painting" | "both";
export type CompanyMembershipRole =
  | "owner"
  | "admin"
  | "office"
  | "sales"
  | "production"
  | "field"
  | "technician"
  | "viewer"
  | "team_member"
  | "customer_portal"
  | "employee_portal";
export type ServiceType = "roofing" | "painting" | "both";
export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "estimate_sent"
  | "won"
  | "lost";
export type PipelineStage =
  | "new_lead"
  | "contacted"
  | "estimate_scheduled"
  | "estimate_sent"
  | "approved"
  | "job_scheduled"
  | "completed"
  | "paid"
  | "lost";
export type LeadPriority = "low" | "normal" | "high" | "urgent";
export type AttributionSourceKey =
  | "website"
  | "google"
  | "yelp"
  | "phone"
  | "email"
  | "referral"
  | "repeat_customer"
  | "manual"
  | "other"
  | "unknown";
export type AttributionEvidenceKind =
  | "provider_verified"
  | "provider_metadata"
  | "staff_selected"
  | "customer_stated"
  | "repeat_customer"
  | "insufficient";
export type AttributionReviewStatus =
  | "verified"
  | "needs_review"
  | "unattributed";
export type LeadAttributionReviewReasonCode =
  | "initial_review"
  | "provider_evidence"
  | "staff_correction"
  | "campaign_correction"
  | "unknown_confirmed";
export type LeadAccountabilityEventType =
  | "lead_created"
  | "attribution_reviewed"
  | "owner_assigned"
  | "contacted"
  | "appointment_scheduled"
  | "inspection_completed"
  | "estimate_sent"
  | "won"
  | "lost";
export type LeadFirstResponseChannel =
  | "phone"
  | "sms"
  | "email"
  | "in_person"
  | "other";
export type LeadAccountabilityOutcome = "open" | "won" | "lost";
export type LeadAccountabilityActorKind = "user" | "provider" | "system";
export type LeadLostReasonCode =
  | "price"
  | "no_response"
  | "chose_competitor"
  | "postponed"
  | "not_qualified"
  | "outside_service_area"
  | "insurance_denied"
  | "scope_mismatch"
  | "duplicate"
  | "other";
export type LeadWonValueBasis =
  | "accepted_proposal"
  | "signed_proposal"
  | "approved_contract_total";
export type CustomerType = "homeowner" | "commercial" | "hoa" | "property_manager";
export type CustomerStatus = "active" | "inactive" | "prospect";
export type PropertyType =
  | "single_family"
  | "townhome"
  | "condo"
  | "multi_family"
  | "commercial"
  | "hoa"
  | "property_management"
  | "other";
export type PropertyOccupancy =
  | "owner_occupied"
  | "tenant_occupied"
  | "vacant"
  | "commercial"
  | "hoa_common_area"
  | "unknown";
export type PropertyCondition = "unknown" | "good" | "fair" | "poor" | "critical";
export type PropertyWarrantyStatus =
  | "unknown"
  | "active"
  | "expiring"
  | "expired"
  | "none";
export type PropertyDocumentStatus = "unknown" | "complete" | "missing" | "partial";
export type PropertyMaintenanceStatus =
  | "unknown"
  | "current"
  | "due"
  | "overdue"
  | "not_required";
export type EstimateStatus =
  | "draft"
  | "sent"
  | "approved"
  | "declined"
  | "rejected"
  | "expired";
export type EstimateLineItemCategory = "labor" | "material" | "other";
export type DiscountType = "fixed" | "percent";
export type PaintingAreaType =
  | "interior"
  | "exterior"
  | "cabinet"
  | "multi_area"
  | "touch_up";
export type PaintFinish =
  | "flat"
  | "velvet"
  | "eggshell"
  | "low_sheen"
  | "satin"
  | "semi_gloss"
  | "gloss"
  | "cabinet_finish";
export type ColorSelectionStatus =
  | "not_started"
  | "in_review"
  | "approved"
  | "change_requested";
export type SurfacePrepLevel = "standard" | "enhanced" | "restoration";
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
  | "draft"
  | "scheduled"
  | "in_progress"
  | "blocked"
  | "completed"
  | "cancelled"
  | "canceled"
  | "closed";
export type JobTaskStatus = "todo" | "in_progress" | "done";
export type OfficeTaskPriority = "low" | "normal" | "high" | "urgent";
export type OfficeTaskStatus = "open" | "snoozed" | "completed";
export type OfficeTaskSourceType =
  | "new_lead"
  | "scheduled_inspection"
  | "completed_inspection"
  | "sent_estimate"
  | "unsigned_estimate"
  | "scheduled_job"
  | "completed_job";
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
export type InspectionStatus =
  | "draft"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "follow_up_required"
  | "no_work_needed"
  | "canceled"
  | "pending"
  | "passed"
  | "failed"
  | "needs_review";
export type InspectionType =
  | "site_inspection"
  | "roof_inspection"
  | "roof_repair"
  | "maintenance"
  | "insurance_hoa"
  | "painting_exterior"
  | "painting_interior"
  | "cabinet_refinishing"
  | "follow_up";
export type InspectionServiceCategory =
  | "roofing"
  | "roof_repair"
  | "tile_underlayment"
  | "exterior_painting"
  | "interior_painting"
  | "cabinet_refinishing"
  | "general_exterior";
export type InspectionOutcome =
  | "estimate_only"
  | "roof_report"
  | "maintenance_report"
  | "insurance_hoa_documentation"
  | "schedule_follow_up"
  | "no_work_needed"
  | "internal_only"
  | "save_and_close";
export type InspectionSeverity = "low" | "moderate" | "high" | "urgent";
export type ChangeOrderStatus = "draft" | "sent" | "approved" | "rejected";
export type SignatureStatus =
  | "pending"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"
  | "failed"
  | "revoked"
  | "superseded";
export type DocumentCategory =
  | "proposal"
  | "signed_proposal"
  | "estimate"
  | "scope"
  | "invoice"
  | "change_order"
  | "contract"
  | "signed_agreement"
  | "completion_certificate"
  | "warranty"
  | "insurance"
  | "permit"
  | "material_order"
  | "manufacturer_warranty"
  | "workmanship_warranty"
  | "inspection_report"
  | "photo"
  | "photo_set"
  | "other";
export type DocumentStatus = "draft" | "ready" | "sent" | "signed" | "archived";
export type DocumentRequirementLevel = "required" | "optional";
export type PaymentStatus = "pending" | "posted" | "failed" | "refunded";
export type ProposalTemplateStatus = "active" | "archived";
export type ProposalRevisionStatus =
  | "draft"
  | "ready_for_review"
  | "approved_internally"
  | "ready_to_send"
  | "sent"
  | "viewed"
  | "changes_requested"
  | "accepted"
  | "declined"
  | "expired"
  | "superseded"
  | "converted_to_job"
  | "canceled";
export type ProposalSectionType =
  | "cover"
  | "customer"
  | "property"
  | "overview"
  | "inspection_summary"
  | "findings"
  | "recommended_solution"
  | "scope"
  | "line_items"
  | "base_proposal"
  | "optional_upgrades"
  | "alternatives"
  | "allowances"
  | "materials"
  | "photos"
  | "warranty"
  | "exclusions"
  | "payment_schedule"
  | "financing"
  | "terms"
  | "customer_notes"
  | "signature_acceptance"
  | "attachments"
  | "custom";
export type ProposalOptionType =
  | "add_on_upgrade"
  | "replacement_alternative"
  | "required_choice"
  | "optional_choice";
export type ProposalPriceEffectType =
  | "additive"
  | "replace_base_amount"
  | "full_alternate_total";
export type ProposalDepositType = "none" | "fixed" | "percent" | "custom_schedule";
export type ProposalSignatureReadinessStatus =
  | "not_configured"
  | "sending_disabled"
  | "ready_for_sandbox_testing"
  | "ready_to_send"
  | "prepared"
  | "awaiting_signature"
  | "signed"
  | "declined"
  | "expired"
  | "failed";
export type ProposalPaymentStatus =
  | "online_payments_disabled"
  | "provider_not_configured"
  | "deposit_required"
  | "pending"
  | "processing"
  | "received"
  | "failed"
  | "refunded"
  | "partially_refunded"
  | "paid_in_full"
  | "past_due";
export type ProposalQuickBooksSyncStatus =
  | "not_configured"
  | "ready"
  | "production_disabled"
  | "exported"
  | "sync_failed";
export type ProposalAcceptanceMethod =
  | "internal_recorded"
  | "customer_portal"
  | "signature_provider"
  | "native_electronic";
export type ProposalPaymentScheduleType =
  | "deposit"
  | "progress"
  | "final"
  | "change_order"
  | "custom";
export type ProposalPaymentAmountType = "fixed" | "percent" | "balance";
export type ProposalPaymentDueTrigger =
  | "upon_acceptance"
  | "specific_date"
  | "production_start"
  | "progress_milestone"
  | "completion"
  | "custom";
export type ProposalPaymentScheduleStatus =
  | "pending"
  | "invoice_created"
  | "paid"
  | "waived"
  | "blocked";
export type ProposalAuditActorType = "internal" | "customer" | "provider" | "system";
export type NotificationChannel = "email" | "sms" | "in_app";
export type NotificationStatus = "queued" | "sent" | "read" | "dismissed";
export type IntegrationProvider =
  | "docusign"
  | "dropbox_sign"
  | "google_calendar"
  | "gmail"
  | "google_maps"
  | "quickbooks_online"
  | "stripe"
  | "twilio"
  | "twilio_sms"
  | "gohighlevel"
  | "website"
  | "google_business_profile"
  | "yelp";
export type LeadSourceMappingProvider =
  | "website"
  | "google_business_profile"
  | "yelp"
  | "twilio"
  | "twilio_sms"
  | "gohighlevel";
export type IntegrationConnectionStatus =
  | "connected"
  | "needs_reauth"
  | "paused"
  | "error";
export type IntegrationSyncDirection =
  | "two_way"
  | "weathertech_to_provider"
  | "provider_to_weathertech";
export type IntegrationSyncLogStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "retrying";
export type AiProvider = "disabled" | "openai" | "anthropic" | "owner_approved";
export type AiWorkMode =
  | "rule_based_insight"
  | "provider_disabled"
  | "live_provider";
export type AiTaskType =
  | "daily_brief"
  | "command"
  | "scope_writer"
  | "estimate_assistant"
  | "proposal_review"
  | "inspection_analysis"
  | "sales_analysis"
  | "operations_analysis"
  | "financial_analysis"
  | "communication_draft"
  | "marketing_analysis"
  | "weather_analysis"
  | "document_analysis"
  | "saved_analysis";
export type AiApprovalState =
  | "draft"
  | "needs_review"
  | "approved"
  | "rejected"
  | "blocked";
export type AiSavedAnalysisStatus = "active" | "archived" | "expired";
export type AiAuditEventType =
  | "request_initiated"
  | "provider_blocked"
  | "provider_failed"
  | "response_generated"
  | "draft_generated"
  | "action_proposed"
  | "action_approved"
  | "action_rejected"
  | "output_saved"
  | "safety_block"
  | "permission_block";
export type GoHighLevelSyncObjectType =
  | "contact"
  | "opportunity"
  | "company"
  | "note"
  | "tag"
  | "task"
  | "pipeline"
  | "stage";
export type GoHighLevelSyncStatus =
  | "pending"
  | "synced"
  | "conflict"
  | "error"
  | "ignored"
  | "disabled";
export type GoHighLevelConflictStatus =
  | "none"
  | "pending_review"
  | "resolved_weathertech"
  | "resolved_gohighlevel"
  | "ignored";
export type GoHighLevelDiscoveryStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "partial";
export type CalendarEventSyncStatus =
  | "queued"
  | "synced"
  | "needs_update"
  | "conflict"
  | "error";
export type GoogleCalendarPurpose =
  | "inspections"
  | "estimates"
  | "production"
  | "dispatch"
  | "crew"
  | "follow_up"
  | "materials"
  | "service"
  | "operations"
  | "personal";
export type GoogleCalendarSyncMode = "read_only" | "read_write";
export type GoogleCalendarConnectionStatus =
  | "active"
  | "disabled"
  | "error"
  | "needs_reauth";
export type GoogleCalendarAccessRole =
  | "none"
  | "freeBusyReader"
  | "reader"
  | "writer"
  | "writerWithoutPrivateAccess"
  | "owner";
export type GoogleCalendarEventStatus =
  | "confirmed"
  | "tentative"
  | "cancelled"
  | "unmatched";
export type GoogleCalendarConflictStatus =
  | "none"
  | "possible"
  | "confirmed"
  | "resolved";
export type GoogleCalendarUnmatchedReviewStatus =
  | "needs_review"
  | "linked"
  | "dismissed"
  | "ignored";
export type EmailMessageCategory =
  | "estimate"
  | "invoice"
  | "follow_up"
  | "job_update"
  | "general";
export type EmailMessageStatus = "draft" | "queued" | "sent" | "failed";
export type EmailMessageDirection = "inbound" | "outbound";
export type EmailMessageSyncStatus =
  | "local"
  | "queued"
  | "syncing"
  | "synced"
  | "imported"
  | "sent"
  | "failed"
  | "skipped";
export type GmailThreadMatchStatus =
  | "matched_customer"
  | "matched_lead"
  | "matched_job"
  | "matched_estimate"
  | "unmatched"
  | "manual_review";
export type GmailThreadSyncStatus =
  | "imported"
  | "syncing"
  | "synced"
  | "failed"
  | "skipped";
export type SmsMessageCategory =
  | "appointment_reminder"
  | "estimate_follow_up"
  | "invoice_reminder"
  | "job_update"
  | "weather_delay"
  | "general";
export type SmsMessageStatus = "draft" | "queued" | "sent" | "failed";
export type SmsMessageDirection = "inbound" | "outbound";
export type SmsDeliveryStatus =
  | "accepted"
  | "queued"
  | "sending"
  | "sent"
  | "delivered"
  | "undelivered"
  | "failed"
  | "received";
export type BusinessPhoneProvider = "twilio" | "twilio_sms" | "gohighlevel";
export type BusinessPhoneCommunicationChannel = "sms" | "voice" | "sms_voice";
export type BusinessPhoneRoutingStatus =
  | "active"
  | "needs_review"
  | "disabled"
  | "unassigned";
export type ProviderEventType =
  | "sms_inbound"
  | "sms_status"
  | "voice_inbound"
  | "voice_status"
  | "recording_status";
export type ProviderEventChannel = "sms" | "voice";
export type ProviderEventDirection = "inbound" | "outbound";
export type ProviderEventRoutingStatus =
  | "matched"
  | "needs_review"
  | "unassigned"
  | "migration_required";
export type LeadIntakeRecordProvider =
  | "manual"
  | "website"
  | "yelp"
  | "google_business_profile"
  | "twilio"
  | "twilio_sms"
  | "gohighlevel"
  | "gmail"
  | "referral"
  | "email";
export type LeadIntakeCompanyKey =
  | "weathertech_roofing"
  | "ihc_painting"
  | "unassigned";
export type LeadIntakeBranchKey =
  | "weathertech_phoenix"
  | "weathertech_tucson"
  | "ihc"
  | "unassigned";
export type LeadIntakeRoutingStatus =
  | "ready_to_create"
  | "needs_review"
  | "unassigned";
export type LeadIntakeRecordStatus =
  | "new"
  | "needs_review"
  | "lead_created"
  | "duplicate"
  | "non_lead"
  | "dismissed";
export type LeadIntakeDuplicateConfidence =
  | "exact_match"
  | "likely_match"
  | "possible_match"
  | "no_match";
export type LeadIntakeFollowUpState =
  | "not_required"
  | "required"
  | "scheduled"
  | "completed";
export type LeadIntakePreferredContactMethod =
  | "phone"
  | "sms"
  | "email"
  | "unknown";
export type CallRecordStatus =
  | "incoming"
  | "ringing"
  | "in_progress"
  | "answered"
  | "completed"
  | "missed"
  | "busy"
  | "failed"
  | "voicemail";
export type CallRecordingStatus =
  | "not_requested"
  | "in_progress"
  | "completed"
  | "failed";
export type CallTranscriptStatus =
  | "not_requested"
  | "queued"
  | "completed"
  | "failed";
export type RoutePlanStatus = "draft" | "optimized" | "dispatched";
export type RouteStopType = "lead" | "job";
export type RouteTravelMode = "driving";

export type CompanyRecord = {
  id: string;
  name: string;
  trade: Trade;
  short_name: string | null;
  brand_color: string | null;
  workflow_profile: Trade;
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

export type IdentityReconciliationDecision =
  | "link_existing"
  | "create_customer"
  | "dismiss";

export type IdentityReconciliationVersionedRecord = {
  id: string;
  expected_updated_at: string;
};

export type IdentityReconciliationCustomerSelection = {
  id?: string;
  expected_updated_at?: string;
  display_name?: string;
  contact_name?: string;
  customer_type?: CustomerType;
};

export type IdentityReconciliationLinks = {
  estimates: IdentityReconciliationVersionedRecord[];
  inspections: IdentityReconciliationVersionedRecord[];
  jobs: IdentityReconciliationVersionedRecord[];
  schedule_events: IdentityReconciliationVersionedRecord[];
  office_tasks: IdentityReconciliationVersionedRecord[];
};

export type IdentityReconciliationRequest = {
  company_id: string;
  operation_key: string;
  decision: IdentityReconciliationDecision;
  lead: IdentityReconciliationVersionedRecord;
  customer?: IdentityReconciliationCustomerSelection;
  property?: IdentityReconciliationVersionedRecord | null;
  links: IdentityReconciliationLinks;
};

export type IdentityReconciliationResult = {
  event_id: string;
  operation_key: string;
  decision: IdentityReconciliationDecision;
  status: "applied" | "dismissed" | "duplicate";
  company_id: string;
  lead_id: string;
  customer_id: string | null;
  property_id: string | null;
  customer_created?: boolean;
  duplicate: boolean;
  updated: {
    leads: number;
    properties: number;
    estimates: number;
    inspections: number;
    jobs: number;
    schedule_events: number;
    office_tasks: number;
  };
};

export type MightyApesYelpEvent = "lead.created" | "lead.test";

export type MightyApesYelpIntakeRequest = {
  version: 1;
  event: MightyApesYelpEvent;
  delivery_id: string;
  payload_fingerprint: string;
  header_timestamp: number;
  received_at: string;
  campaign: {
    yelp_id: string;
    name: string;
  };
  lead: {
    id: string;
    name: string;
    phone: string;
    zip_code: string;
    job_category?: string;
    message: string;
    created_at: string;
  };
};

export type MightyApesYelpIngestResult = {
  status: "created" | "duplicate" | "test_accepted";
  event_id: string;
  lead_id: string | null;
  intake_record_id: string | null;
  sync_log_id: string | null;
  notification_id: string | null;
};

export type MightyApesYelpWebhookEventRecord = {
  id: string;
  company_id: string;
  delivery_id: string;
  payload_fingerprint: string;
  header_timestamp: number;
  payload_version: 1;
  event_type: MightyApesYelpEvent;
  provider_lead_id: string;
  campaign_yelp_id: string;
  campaign_name: string;
  provider_created_at: string;
  outcome: MightyApesYelpIngestResult["status"];
  linked_lead_id: string | null;
  lead_intake_record_id: string | null;
  integration_sync_log_id: string | null;
  notification_id: string | null;
  received_at: string;
  processed_at: string;
};

export type IdentityReconciliationEventRecord = {
  id: string;
  company_id: string;
  operation_key: string;
  request_sha256: string;
  decision: IdentityReconciliationDecision;
  source_lead_id: string;
  source_updated_at: string;
  actor_user_id: string;
  customer_id: string | null;
  property_id: string | null;
  evidence_types: string[];
  selected_targets: Record<string, unknown>;
  result: Record<string, unknown>;
  created_at: string;
};

export type PropertyRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  display_name: string;
  address: string;
  city: string | null;
  state: string;
  postal_code: string | null;
  property_type: PropertyType;
  year_built: number | null;
  square_feet: number | null;
  stories: number | null;
  occupancy: PropertyOccupancy;
  hoa_name: string | null;
  gate_code: string | null;
  access_instructions: string | null;
  latitude: number | null;
  longitude: number | null;
  parcel_number: string | null;
  roof_age_years: number | null;
  roof_manufacturer: string | null;
  roof_system: string | null;
  roof_pitch: string | null;
  roof_layers: number | null;
  roofing_material: string | null;
  flat_roof_sections: string | null;
  tile_information: string | null;
  has_solar: boolean;
  has_skylights: boolean;
  hvac_penetrations: string | null;
  chimneys: string | null;
  paint_system: string | null;
  exterior_finish: string | null;
  exterior_paint_colors: string | null;
  last_inspection_at: string | null;
  next_recommended_inspection_at: string | null;
  roof_condition: PropertyCondition;
  paint_condition: PropertyCondition;
  warranty_status: PropertyWarrantyStatus;
  document_status: PropertyDocumentStatus;
  maintenance_status: PropertyMaintenanceStatus;
  health_score: number | null;
  is_primary: boolean;
  portfolio_label: string | null;
  manager_name: string | null;
  notes: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  property_id?: string | null;
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
  pipeline_stage: PipelineStage;
  priority: LeadPriority;
  estimated_value: number;
  next_follow_up: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MarketingCampaignRecord = {
  id: string;
  company_id: string;
  source_key: AttributionSourceKey;
  source_detail: string | null;
  intake_provider: string | null;
  vendor_key: string | null;
  vendor_name: string | null;
  campaign_key: string;
  campaign_name: string;
  external_campaign_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  record_version: number;
  last_operation_key: string | null;
  last_request_fingerprint: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadAccountabilityRecord = {
  id: string;
  company_id: string;
  lead_id: string;
  source_key: AttributionSourceKey;
  source_detail: string | null;
  intake_provider: string | null;
  campaign_id: string | null;
  intake_record_id: string | null;
  attribution_model: "first_touch";
  received_at: string;
  evidence_kind: AttributionEvidenceKind;
  review_status: AttributionReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  attribution_locked_at: string | null;
  owner_user_id: string | null;
  owner_assigned_at: string | null;
  first_response_at: string | null;
  first_response_channel: LeadFirstResponseChannel | null;
  outcome: LeadAccountabilityOutcome;
  outcome_at: string | null;
  lost_reason_code: LeadLostReasonCode | null;
  lost_reason_notes: string | null;
  won_contract_value: number | null;
  won_value_basis: LeadWonValueBasis | null;
  record_version: number;
  last_operation_key: string | null;
  last_request_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

export type LeadAccountabilityEventRecord = {
  id: string;
  lead_accountability_id: string;
  company_id: string;
  lead_id: string;
  event_type: LeadAccountabilityEventType;
  operation_key: string;
  request_fingerprint: string;
  actor_user_id: string | null;
  actor_kind: LeadAccountabilityActorKind;
  reason_code: string | null;
  source_key: AttributionSourceKey | null;
  source_detail: string | null;
  intake_provider: string | null;
  campaign_id: string | null;
  owner_user_id: string | null;
  first_response_channel: LeadFirstResponseChannel | null;
  linked_table: string | null;
  linked_record_id: string | null;
  outcome: LeadAccountabilityOutcome | null;
  lost_reason_code: LeadLostReasonCode | null;
  won_contract_value: number | null;
  won_value_basis: LeadWonValueBasis | null;
  occurred_at: string;
  resulting_record_version: number;
  created_at: string;
};

export type MarketingSpendMonthRecord = {
  id: string;
  company_id: string;
  spend_month: string;
  source_key: AttributionSourceKey;
  source_detail: string | null;
  vendor_key: string | null;
  vendor_name: string | null;
  campaign_id: string | null;
  spend_amount: number;
  currency: "USD";
  notes: string | null;
  entered_by: string | null;
  updated_by: string | null;
  record_version: number;
  last_operation_key: string | null;
  last_request_fingerprint: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  property_id?: string | null;
  business: string | null;
  location: string | null;
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
  scope_of_work: string | null;
  painting_area_type: PaintingAreaType | null;
  paint_brand: string;
  paint_product_line: string | null;
  paint_finish: PaintFinish | null;
  color_selection_status: ColorSelectionStatus;
  paint_color_body: string | null;
  paint_color_trim: string | null;
  paint_color_accent: string | null;
  surface_prep_level: SurfacePrepLevel | null;
  coats: number;
  primer_required: boolean;
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
  unit_price: number;
  markup_rate: number;
  taxable: boolean;
  sort_order: number;
  total: number;
  created_at: string;
  updated_at: string;
};

export type ScopeTemplateRecord = {
  id: string;
  company_id: string | null;
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
  proposal_revision_id?: string | null;
  proposal_acceptance_id?: string | null;
  conversion_operation_key?: string | null;
  scope_id: string | null;
  property_id?: string | null;
  business: string | null;
  location: string | null;
  title: string;
  service_type: ServiceType;
  status: JobStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  start_date: string | null;
  end_date: string | null;
  crew_name: string | null;
  project_manager: string | null;
  address: string | null;
  property_address: string;
  scope_of_work: string | null;
  total: number;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  address_verified_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type JobTaskRecord = {
  id: string;
  job_id: string;
  title: string;
  description: string | null;
  status: JobTaskStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type OfficeTaskRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  property_id: string | null;
  assigned_employee_id: string | null;
  lead_id: string | null;
  inspection_id: string | null;
  estimate_id: string | null;
  job_id: string | null;
  source_type: OfficeTaskSourceType;
  automation_key: string;
  title: string;
  notes: string | null;
  priority: OfficeTaskPriority;
  due_at: string;
  status: OfficeTaskStatus;
  snoozed_until: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type JobNoteRecord = {
  id: string;
  job_id: string;
  note: string;
  created_at: string;
};

export type JobMaterialRecord = {
  id: string;
  job_id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string | null;
  created_at: string;
};

export type ScheduleEventRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  property_id?: string | null;
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

export type JobPhotoRow = {
  id: string;
  company_id: string;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  inspection_id: string | null;
  property_id?: string | null;
  caption: string | null;
  label: string | null;
  file_path: string;
  file_url: string | null;
  upload_operation_key: string;
  upload_request_fingerprint: string;
  taken_at: string | null;
  is_customer_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type JobPhotoRecord = JobPhotoRow & {
  /** Short-lived, in-memory Storage access. Never persisted to job_photos. */
  signed_url: string | null;
};

export type JobPhotoUploadOperationState =
  | "reserved"
  | "canceling"
  | "committed"
  | "aborted";

export type JobPhotoUploadOperationRecord = {
  id: string;
  company_id: string;
  upload_operation_key: string;
  upload_request_fingerprint: string;
  file_path: string;
  registration_digest: string;
  uploader_user_id: string;
  recovery_lease_token: string;
  recovery_lease_expires_at: string;
  state: JobPhotoUploadOperationState;
  reserved_at: string;
  canceling_at: string | null;
  committed_at: string | null;
  aborted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobPhotoUploadRpcArgs = {
  target_company_id: string;
  target_upload_operation_key: string;
  target_upload_request_fingerprint: string;
  target_file_path: string;
  target_recovery_lease_token: string;
  target_customer_id?: string | null;
  target_property_id?: string | null;
  target_job_id?: string | null;
  target_estimate_id?: string | null;
  target_inspection_id?: string | null;
  target_caption?: string | null;
  target_label?: string | null;
  target_taken_at?: string | null;
  target_is_customer_visible?: boolean;
  target_sort_order?: number;
  target_uploader_user_id?: string | null;
};

export type JobPhotoUploadRecoveryListRecord = {
  uploader_user_id: string;
  company_id: string;
  upload_operation_key: string;
  state: "reserved" | "canceling";
  lease_expires_at: string;
};

export type JobPhotoUploadRecoveryClaimRecord = {
  state: JobPhotoUploadOperationState;
  file_path: string | null;
  lease_expires_at: string | null;
};

export type InvoiceRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  proposal_revision_id?: string | null;
  proposal_acceptance_id?: string | null;
  invoice_purpose?: "proposal_deposit" | null;
  proposal_invoice_operation_key?: string | null;
  property_id?: string | null;
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
  property_id?: string | null;
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
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  schedule_event_id: string | null;
  estimate_id: string | null;
  report_document_id: string | null;
  property_id?: string | null;
  title: string;
  status: InspectionStatus;
  inspection_type: InspectionType;
  service_category: InspectionServiceCategory;
  checklist: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  assigned_inspector: string | null;
  property_address: string | null;
  priority: LeadPriority;
  purpose: string | null;
  completed_at: string | null;
  notes: string | null;
  internal_notes: string | null;
  outcome: InspectionOutcome | null;
  report_requested: boolean;
  report_created_at: string | null;
  findings: InspectionFinding[];
  measurements: InspectionMeasurement[];
  photo_ids: string[];
  activity: InspectionActivityItem[];
  created_at: string;
  updated_at: string;
};

export type InspectionFinding = {
  id: string;
  area: string;
  category: string;
  observation: string;
  severity: InspectionSeverity;
  priority: LeadPriority;
  recommendation: string;
  related_photo_id?: string | null;
  customer_visible: boolean;
  action_required: boolean;
  include_in_estimate: boolean;
  include_in_report: boolean;
  estimated_remaining_life?: string | null;
  created_at: string;
};

export type InspectionMeasurement = {
  id: string;
  label: string;
  value: string;
  unit: string;
  notes?: string | null;
  include_in_estimate: boolean;
  created_at: string;
};

export type InspectionActivityItem = {
  id: string;
  label: string;
  detail: string;
  occurred_at: string;
  visibility: "internal" | "customer_visible" | "system";
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
  property_id?: string | null;
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
  proposal_revision_id?: string | null;
  acceptance_id?: string | null;
  signed_document_id?: string | null;
  signer_name: string;
  signer_email: string | null;
  status: SignatureStatus;
  provider: string | null;
  provider_envelope_id: string | null;
  signature_data: string | null;
  signature_method?: "typed_name" | null;
  evidence_sha256?: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  inspection_id: string | null;
  invoice_id: string | null;
  change_order_id: string | null;
  proposal_revision_id?: string | null;
  artifact_operation_key?: string | null;
  content_sha256?: string | null;
  immutable_after_at?: string | null;
  property_id?: string | null;
  title: string;
  category: DocumentCategory;
  status: DocumentStatus;
  template_key: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  archived_at: string | null;
  property_address: string | null;
  tags: string[];
  requirement_level: DocumentRequirementLevel;
  required_for: string[];
  body: string | null;
  created_at: string;
  updated_at: string;
};

export type PaymentRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  property_id?: string | null;
  amount: number;
  method: string;
  status: PaymentStatus;
  paid_at: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StripeCompanyAccountRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  stripe_account_id: string;
  account_display_name: string;
  country: string;
  default_currency: string;
  livemode: boolean;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  card_payments_status: "active" | "inactive" | "pending" | "restricted";
  ach_payments_status: "active" | "inactive" | "pending" | "restricted";
  payment_writes_enabled: boolean;
  refund_writes_enabled: boolean;
  webhook_processing_enabled: boolean;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StripeCompanyAccountInsert = Omit<
  StripeCompanyAccountRecord,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type StripeObjectMappingRecord = {
  id: string;
  company_id: string;
  stripe_company_account_id: string;
  integration_connection_id: string;
  customer_id: string | null;
  invoice_id: string | null;
  payment_id: string | null;
  local_object_type: "customer" | "invoice" | "deposit" | "payment" | "refund";
  stripe_object_type:
    | "customer"
    | "invoice"
    | "payment_intent"
    | "charge"
    | "checkout_session"
    | "refund";
  stripe_object_id: string;
  operation_key: string;
  status: string;
  amount_cents: number | null;
  currency: string | null;
  livemode: boolean;
  metadata_summary: Record<string, unknown>;
  last_provider_request_id: string | null;
  created_at: string;
  updated_at: string;
};

export type StripeObjectMappingInsert = Omit<
  StripeObjectMappingRecord,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type StripeWebhookEventRecord = {
  id: string;
  company_id: string;
  stripe_company_account_id: string;
  integration_connection_id: string;
  stripe_event_id: string;
  stripe_account_id: string;
  event_type: string;
  api_version: string | null;
  livemode: boolean;
  processing_status: "received" | "processed" | "ignored" | "failed";
  attempt_count: number;
  payload_summary: Record<string, unknown>;
  error_message: string | null;
  provider_created_at: string | null;
  processed_at: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
};

export type StripeWebhookEventInsert = Omit<
  StripeWebhookEventRecord,
  "id" | "received_at" | "created_at" | "updated_at"
> & {
  id?: string;
  received_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type ProposalTemplateRecord = {
  id: string;
  company_id: string | null;
  template_key: string;
  name: string;
  category: string;
  service_type: ServiceType;
  status: ProposalTemplateStatus;
  is_default: boolean;
  version_number: number;
  description: string;
  default_sections: unknown[];
  default_options: unknown[];
  default_terms: string | null;
  default_warranty: string | null;
  created_by: string | null;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateProposalRevisionRecord = {
  id: string;
  company_id: string;
  estimate_id: string;
  customer_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  template_id: string | null;
  finalization_operation_key?: string | null;
  artifact_operation_key?: string | null;
  customer_snapshot?: Record<string, unknown> | null;
  revision_sha256?: string | null;
  terms_sha256?: string | null;
  finalized_at?: string | null;
  finalized_by?: string | null;
  finalized_document_id?: string | null;
  accepted_signature_id?: string | null;
  accepted_acceptance_id?: string | null;
  signed_document_id?: string | null;
  proposal_number: string;
  revision_number: number;
  title: string;
  status: ProposalRevisionStatus;
  brand_name: string;
  brand_primary_color: string | null;
  brand_accent_color: string | null;
  base_subtotal: number;
  discount_total: number;
  tax_total: number;
  fee_total: number;
  base_total: number;
  selected_upgrades_total: number;
  accepted_total: number;
  deposit_type: ProposalDepositType;
  deposit_value: number;
  deposit_required: boolean;
  deposit_due_date: string | null;
  deposit_amount: number;
  deposit_paid: number;
  remaining_balance: number;
  requires_signature: boolean;
  requires_deposit_before_job: boolean;
  signature_status: ProposalSignatureReadinessStatus;
  payment_status: ProposalPaymentStatus;
  quickbooks_sync_status: ProposalQuickBooksSyncStatus;
  customer_visible_notes: string | null;
  internal_notes: string | null;
  terms: string | null;
  acceptance_required: boolean;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  expires_at: string | null;
  superseded_at: string | null;
  immutable_after_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  source_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EstimateProposalSectionRecord = {
  id: string;
  company_id: string;
  proposal_revision_id: string;
  section_key: string;
  title: string;
  section_type: ProposalSectionType;
  body: string;
  customer_visible: boolean;
  is_required: boolean;
  sort_order: number;
  source_type: string | null;
  source_record_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateProposalOptionRecord = {
  id: string;
  company_id: string;
  proposal_revision_id: string;
  option_type: ProposalOptionType;
  option_group_key: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  price: number;
  price_effect_type: ProposalPriceEffectType;
  base_replacement_amount: number;
  customer_visible: boolean;
  selected: boolean;
  selected_by: string | null;
  selected_at: string | null;
  required: boolean;
  recommended: boolean;
  best_value: boolean;
  dependency_option_id: string | null;
  conflicting_option_id: string | null;
  warranty_effect: string | null;
  scope_details: string | null;
  customer_notes: string | null;
  internal_notes: string | null;
  source_line_item_id: string | null;
  source_finding_id: string | null;
  source_photo_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EstimateProposalAcceptanceRecord = {
  id: string;
  company_id: string;
  proposal_revision_id: string;
  estimate_id: string;
  customer_id: string | null;
  signing_request_id?: string | null;
  signature_id?: string | null;
  proposal_document_id?: string | null;
  acceptance_operation_key?: string | null;
  acceptance_request_sha256?: string | null;
  proposal_revision_sha256?: string | null;
  proposal_document_sha256?: string | null;
  terms_sha256?: string | null;
  consent_version?: string | null;
  consent_sha256?: string | null;
  electronic_records_consented?: boolean | null;
  signature_intent_acknowledged?: boolean | null;
  signature_method?: "typed_name" | null;
  required_deposit_amount?: number | null;
  evidence_sha256?: string | null;
  signer_name: string;
  signer_email: string | null;
  accepted_total: number;
  selected_option_ids: string[];
  terms_accepted: boolean;
  acceptance_method: ProposalAcceptanceMethod;
  signature_status: Extract<
    ProposalSignatureReadinessStatus,
    "not_configured" | "awaiting_signature" | "signed" | "declined" | "expired" | "failed"
  >;
  ip_hash: string | null;
  user_agent: string | null;
  audit_metadata: Record<string, unknown>;
  accepted_at: string;
  created_at: string;
};

export type ProposalPaymentScheduleRecord = {
  id: string;
  company_id: string;
  proposal_revision_id: string;
  invoice_id: string | null;
  milestone_name: string;
  schedule_type: ProposalPaymentScheduleType;
  amount_type: ProposalPaymentAmountType;
  amount_value: number;
  calculated_amount: number;
  due_trigger: ProposalPaymentDueTrigger;
  due_date: string | null;
  status: ProposalPaymentScheduleStatus;
  sort_order: number;
  customer_visible: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalAuditEventRecord = {
  id: string;
  company_id: string;
  proposal_revision_id: string | null;
  estimate_id: string | null;
  customer_id: string | null;
  event_type: string;
  actor_type: ProposalAuditActorType;
  actor_id: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  idempotency_key: string | null;
  created_at: string;
};

export type ProposalSigningRequestStatus =
  | "prepared"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "failed"
  | "revoked"
  | "superseded"
  | "expired";

export type ProposalSigningRequestRecord = {
  id: string;
  company_id: string;
  proposal_revision_id: string;
  estimate_id: string;
  customer_id: string;
  signature_id: string;
  proposal_document_id: string;
  operation_key: string;
  request_token_sha256: string;
  request_token_consumed_at: string | null;
  request_token_consumed_session_id: string | null;
  revision_sha256: string;
  document_sha256: string;
  terms_sha256: string;
  consent_version: string;
  consent_text: string;
  consent_sha256: string;
  intended_signer_name: string;
  intended_signer_email: string;
  status: ProposalSigningRequestStatus;
  delivery_email_message_id: string | null;
  delivery_provider_message_id: string | null;
  failure_code: string | null;
  revocation_reason: string | null;
  expires_at: string;
  sent_at: string | null;
  first_viewed_at: string | null;
  signed_at: string | null;
  declined_at: string | null;
  failed_at: string | null;
  revoked_at: string | null;
  superseded_at: string | null;
  exchange_attempt_count: number;
  exchange_window_started_at: string | null;
  exchange_blocked_until: string | null;
  session_read_attempt_count: number;
  session_read_window_started_at: string | null;
  session_read_blocked_until: string | null;
  action_attempt_count: number;
  action_window_started_at: string | null;
  action_blocked_until: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type ProposalSigningSessionRecord = {
  id: string;
  company_id: string;
  signing_request_id: string;
  session_token_sha256: string;
  status: "active" | "signed" | "declined" | "revoked" | "expired";
  initial_ip_hash: string | null;
  initial_user_agent: string | null;
  opened_at: string;
  last_seen_at: string;
  expires_at: string;
  signed_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalSignatureReceiptRecord = {
  id: string;
  company_id: string;
  signing_request_id: string;
  proposal_revision_id: string;
  acceptance_id: string;
  signature_id: string;
  source_document_id: string;
  signed_document_id: string;
  operation_key: string;
  revision_sha256: string;
  source_document_sha256: string;
  signed_document_sha256: string;
  evidence_sha256: string;
  registered_at: string;
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
  provider_account_id?: string | null;
  default_calendar_id: string | null;
  scopes: string[];
  sync_direction: IntegrationSyncDirection;
  credential_reference: string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  sync_token: string | null;
  token_expires_at?: string | null;
  last_sync_at: string | null;
  last_successful_sync_at?: string | null;
  last_failure_at?: string | null;
  disabled_at?: string | null;
  last_error: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type IntegrationSyncLogRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string | null;
  provider: IntegrationProvider;
  direction: IntegrationSyncDirection;
  event_type: string;
  status: IntegrationSyncLogStatus;
  related_table: string | null;
  related_record_id: string | null;
  external_id: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_attempted_at: string | null;
  completed_at: string | null;
  request_fingerprint: string | null;
  request_summary: Record<string, unknown>;
  response_summary: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type GoHighLevelSyncMappingRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string | null;
  provider: Extract<IntegrationProvider, "gohighlevel">;
  local_table: string;
  local_record_id: string;
  external_object_type: GoHighLevelSyncObjectType;
  external_id: string | null;
  external_location_id: string | null;
  external_account_id: string | null;
  sync_status: GoHighLevelSyncStatus;
  sync_direction: IntegrationSyncDirection;
  conflict_status: GoHighLevelConflictStatus;
  conflict_summary: string | null;
  last_synced_at: string | null;
  external_updated_at: string | null;
  pending_sync: boolean;
  last_error: string | null;
  record_fingerprint: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoHighLevelDiscoverySnapshotRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string | null;
  provider: Extract<IntegrationProvider, "gohighlevel">;
  location_key: string;
  external_location_id: string | null;
  account_name: string | null;
  location_name: string | null;
  pipeline_count: number;
  pipelines: Record<string, unknown>[];
  discovery_status: GoHighLevelDiscoveryStatus;
  checked_at: string;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoHighLevelOauthStateRecord = {
  id: string;
  company_id: string;
  initiated_by: string | null;
  state_hash: string;
  redirect_path: string;
  requested_scopes: string[];
  expires_at: string;
  consumed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type GoHighLevelOauthCredentialRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  external_location_id: string;
  external_company_id: string | null;
  external_user_id: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  bridge_version: string;
  token_type: string;
  scopes: string[];
  user_type: "Location" | "Company";
  token_expires_at: string;
  last_refreshed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoHighLevelResourceType =
  | "contact"
  | "conversation"
  | "message"
  | "call"
  | "calendar"
  | "calendar_event"
  | "pipeline"
  | "opportunity"
  | "review";

export type GoHighLevelResourceSnapshotRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  resource_type: GoHighLevelResourceType;
  external_id: string;
  external_parent_id: string | null;
  external_contact_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  direction: ProviderEventDirection | null;
  status: string | null;
  body_preview: string | null;
  occurred_at: string | null;
  provider_updated_at: string | null;
  payload_summary: Record<string, unknown>;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

export type GoHighLevelWebhookEventRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  webhook_id: string;
  event_type: string;
  external_location_id: string;
  external_contact_id: string | null;
  external_conversation_id: string | null;
  external_message_id: string | null;
  signature_version: "ed25519" | "rsa_legacy";
  processing_status: "received" | "processed" | "ignored" | "failed";
  attempt_count: number;
  payload_summary: Record<string, unknown>;
  error_message: string | null;
  occurred_at: string | null;
  processed_at: string | null;
  received_at: string;
  created_at: string;
  updated_at: string;
};

export type LeadSourceMappingRecord = {
  id: string;
  provider: LeadSourceMappingProvider;
  external_source_id: string | null;
  business: string;
  location: string;
  display_name: string;
  is_active: boolean;
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
  google_recurring_event_id?: string | null;
  google_event_etag?: string | null;
  google_event_status?: Extract<
    GoogleCalendarEventStatus,
    "confirmed" | "tentative" | "cancelled"
  >;
  sync_status: CalendarEventSyncStatus;
  sync_direction: IntegrationSyncDirection;
  last_synced_at: string | null;
  external_updated_at: string | null;
  provider_updated_at?: string | null;
  deleted_at?: string | null;
  conflict_status?: GoogleCalendarConflictStatus;
  conflict_reason?: string | null;
  sync_attempt_count?: number;
  last_synced_direction?: IntegrationSyncDirection | null;
  last_error: string | null;
  last_payload_hash: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoogleCalendarCredentialRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  account_email: string;
  provider_account_id: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_type: string | null;
  scopes: string[];
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GoogleCalendarConnectedCalendarRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  google_calendar_id: string;
  display_name: string;
  description: string | null;
  time_zone: string | null;
  access_role: GoogleCalendarAccessRole | null;
  primary_calendar: boolean;
  selected_for_sync: boolean;
  calendar_purpose: GoogleCalendarPurpose;
  branch_location: string | null;
  sync_mode: GoogleCalendarSyncMode;
  status: GoogleCalendarConnectionStatus;
  sync_token: string | null;
  webhook_channel_id: string | null;
  webhook_resource_id: string | null;
  webhook_channel_expires_at: string | null;
  last_sync_at: string | null;
  last_successful_sync_at: string | null;
  last_failure_at: string | null;
  last_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GoogleCalendarUnmatchedEventRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  connected_calendar_id: string | null;
  google_calendar_id: string;
  google_event_id: string;
  google_recurring_event_id: string | null;
  google_event_etag: string | null;
  event_status: GoogleCalendarEventStatus;
  event_summary: string;
  event_location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  all_day_date: string | null;
  provider_updated_at: string | null;
  review_status: GoogleCalendarUnmatchedReviewStatus;
  review_reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type EmailMessageRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  property_id?: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  document_id: string | null;
  integration_connection_id: string | null;
  provider: Extract<IntegrationProvider, "gmail">;
  category: EmailMessageCategory;
  status: EmailMessageStatus;
  direction?: EmailMessageDirection;
  from_email?: string | null;
  to_email: string;
  to_emails?: string[];
  cc_email: string | null;
  cc_emails?: string[];
  bcc_emails?: string[];
  reply_to_emails?: string[];
  subject: string;
  body: string;
  gmail_message_id: string | null;
  gmail_thread_id?: string | null;
  provider_account_id?: string | null;
  queued_at: string | null;
  sent_at: string | null;
  received_at?: string | null;
  message_preview?: string | null;
  has_attachments?: boolean;
  attachment_count?: number;
  sync_status?: EmailMessageSyncStatus;
  imported_at?: string | null;
  provider_payload_hash?: string | null;
  metadata?: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AiSavedAnalysisRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  lead_id: string | null;
  estimate_id: string | null;
  proposal_revision_id: string | null;
  job_id: string | null;
  inspection_id: string | null;
  invoice_id: string | null;
  document_id: string | null;
  title: string;
  task_type: AiTaskType;
  mode: AiWorkMode;
  provider: AiProvider;
  model: string | null;
  prompt_summary: string | null;
  output: Record<string, unknown>;
  source_records: unknown[];
  approval_state: AiApprovalState;
  status: AiSavedAnalysisStatus;
  created_by: string | null;
  expires_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AiAuditEventRecord = {
  id: string;
  company_id: string;
  saved_analysis_id: string | null;
  actor_user_id: string | null;
  task_type: AiTaskType;
  event_type: AiAuditEventType;
  provider: AiProvider;
  model: string | null;
  source_records: unknown[];
  action_type: string | null;
  action_preview: Record<string, unknown>;
  status: string;
  safety_flags: string[];
  token_count: number | null;
  estimated_cost_cents: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AiUsageLimitRecord = {
  id: string;
  company_id: string;
  ai_enabled: boolean;
  allowed_providers: AiProvider[];
  allowed_models: string[];
  daily_request_limit: number;
  per_user_daily_request_limit: number;
  per_company_monthly_budget_cents: number;
  expensive_task_confirmation_cents: number;
  token_limit: number;
  timeout_ms: number;
  retry_limit: number;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GmailOauthStateRecord = {
  id: string;
  company_id: string;
  initiated_by: string | null;
  state_hash: string;
  code_verifier: string;
  redirect_path: string;
  requested_scopes: string[];
  provider: Extract<IntegrationProvider, "gmail" | "google_calendar">;
  mailbox_label: string | null;
  expires_at: string;
  consumed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type GmailMailboxCredentialRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  account_email: string;
  provider_account_id: string | null;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_type: string | null;
  scopes: string[];
  token_expires_at: string | null;
  last_refreshed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GmailEmailThreadRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  estimate_id: string | null;
  gmail_thread_id: string;
  subject: string;
  last_message_at: string | null;
  message_count: number;
  last_direction: EmailMessageDirection;
  match_status: GmailThreadMatchStatus;
  sync_status: GmailThreadSyncStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GmailEmailAttachmentRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string | null;
  email_message_id: string;
  gmail_attachment_id: string | null;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  content_disposition: string | null;
  metadata: Record<string, unknown>;
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
  business_phone_number_id?: string | null;
  direction?: SmsMessageDirection;
  delivery_status?: SmsDeliveryStatus | null;
  provider_account_sid?: string | null;
  provider_messaging_service_sid?: string | null;
  to_phone: string;
  from_phone: string | null;
  body: string;
  twilio_message_sid: string | null;
  queued_at: string | null;
  sent_at: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  correlation_id?: string;
  provider_payload_fingerprint?: string | null;
  metadata?: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type BusinessPhoneNumberRecord = {
  id: string;
  company_id: string;
  integration_connection_id: string | null;
  provider: BusinessPhoneProvider;
  provider_account_sid: string | null;
  messaging_service_sid: string | null;
  phone_number_e164: string | null;
  display_name: string;
  routing_key: string;
  business_location: string;
  team_queue: string;
  lead_source: string;
  communication_channel: BusinessPhoneCommunicationChannel;
  time_zone: string;
  routing_status: BusinessPhoneRoutingStatus;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CommunicationProviderEventRecord = {
  id: string;
  company_id: string | null;
  business_phone_number_id: string | null;
  integration_connection_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  sms_message_id: string | null;
  provider: BusinessPhoneProvider;
  provider_account_sid: string | null;
  provider_event_sid: string | null;
  provider_parent_sid: string | null;
  event_type: ProviderEventType;
  channel: ProviderEventChannel;
  direction: ProviderEventDirection;
  status: string;
  from_phone: string | null;
  to_phone: string | null;
  business_phone: string | null;
  customer_phone: string | null;
  routing_status: ProviderEventRoutingStatus;
  correlation_id: string;
  request_fingerprint: string | null;
  payload_summary: Record<string, unknown>;
  response_summary: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  occurred_at: string;
  received_at: string;
  created_at: string;
  updated_at: string;
};

export type LeadIntakeRecord = {
  id: string;
  company_id: string | null;
  linked_lead_id: string | null;
  linked_customer_id: string | null;
  related_communication_event_id: string | null;
  integration_sync_log_id: string | null;
  provider: LeadIntakeRecordProvider;
  provider_event_id: string | null;
  source: string;
  source_detail: string | null;
  campaign: string | null;
  correlation_id: string;
  company_key: LeadIntakeCompanyKey;
  branch_key: LeadIntakeBranchKey;
  routing_status: LeadIntakeRoutingStatus;
  status: LeadIntakeRecordStatus;
  duplicate_confidence: LeadIntakeDuplicateConfidence;
  follow_up_state: LeadIntakeFollowUpState;
  urgency: LeadPriority;
  assigned_queue: string | null;
  assigned_user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  contact_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  service_address: string | null;
  city: string | null;
  state: string;
  postal_code: string | null;
  requested_service: ServiceType | null;
  message: string | null;
  preferred_contact_method: LeadIntakePreferredContactMethod;
  receiving_business_phone_number: string | null;
  consent_metadata: Record<string, unknown>;
  source_metadata: Record<string, unknown>;
  safe_raw_source_reference: string | null;
  possible_matches: unknown[];
  routing_reasons: unknown[];
  review_notes: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  non_lead_reason: string | null;
  intake_timestamp: string;
  original_submission_timestamp: string | null;
  created_at: string;
  updated_at: string;
};

export type CallRecord = {
  id: string;
  company_id: string | null;
  business_phone_number_id: string | null;
  integration_connection_id: string | null;
  customer_id: string | null;
  lead_id: string | null;
  job_id: string | null;
  provider: Extract<BusinessPhoneProvider, "twilio" | "gohighlevel">;
  provider_account_sid: string | null;
  provider_call_sid: string | null;
  provider_parent_call_sid: string | null;
  direction: ProviderEventDirection;
  call_status: CallRecordStatus;
  from_phone: string | null;
  to_phone: string | null;
  business_phone: string | null;
  customer_phone: string | null;
  routing_status: ProviderEventRoutingStatus;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_sid: string | null;
  recording_status: CallRecordingStatus | null;
  recording_duration_seconds: number | null;
  transcript_status: CallTranscriptStatus | null;
  follow_up_required: boolean;
  correlation_id: string;
  metadata: Record<string, unknown>;
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
  customer_id?: string | null;
  property_id?: string | null;
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
  pipeline_stage?: PipelineStage;
  priority?: LeadPriority;
  estimated_value?: number;
  next_follow_up?: string | null;
  notes?: string | null;
  created_by?: string | null;
};

export type CreateAccountableLeadRequest = {
  operation_key: string;
  company_id: string;
  contact_name: string;
  phone?: string | null;
  email?: string | null;
  property_address: string;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  service_type: ServiceType;
  priority?: LeadPriority;
  estimated_value?: number;
  next_follow_up?: string | null;
  notes?: string | null;
  source_key: AttributionSourceKey;
  source_detail?: string | null;
  intake_provider?: string | null;
  campaign_id?: string | null;
  intake_record_id?: string | null;
  evidence_kind: AttributionEvidenceKind;
  review_status: AttributionReviewStatus;
  owner_user_id?: string | null;
  received_at?: string;
};

export type CreateAccountableLeadResult = {
  status: "created" | "idempotent";
  lead_id: string;
  accountability_id: string;
  record_version: number;
};

type LeadAccountabilityActionBase = {
  operation_key: string;
  lead_id: string;
  expected_version: number;
};

export type LeadAccountabilityActionRequest =
  | (LeadAccountabilityActionBase & {
      action: "attribution_reviewed";
      source_key: AttributionSourceKey;
      source_detail?: string | null;
      intake_provider?: string | null;
      campaign_id?: string | null;
      intake_record_id?: string | null;
      evidence_kind: AttributionEvidenceKind;
      review_status: AttributionReviewStatus;
      reason_code: LeadAttributionReviewReasonCode;
    })
  | (LeadAccountabilityActionBase & {
      action: "owner_assigned";
      owner_user_id: string | null;
    })
  | (LeadAccountabilityActionBase & {
      action: "contacted";
      occurred_at?: string;
      first_response_channel: LeadFirstResponseChannel;
      human_contact: true;
    })
  | (LeadAccountabilityActionBase & {
      action: "appointment_scheduled";
      schedule_event_id: string;
    })
  | (LeadAccountabilityActionBase & {
      action: "inspection_completed";
      inspection_id: string;
    })
  | (LeadAccountabilityActionBase & {
      action: "estimate_sent";
      estimate_id: string;
    })
  | (LeadAccountabilityActionBase & {
      action: "won";
      proposal_acceptance_id?: string;
      won_contract_value?: number;
      won_value_basis?: LeadWonValueBasis;
    })
  | (LeadAccountabilityActionBase & {
      action: "lost";
      lost_reason_code: LeadLostReasonCode;
      lost_reason_notes?: string | null;
    });

export type LeadAccountabilityActionResult = {
  status: "applied" | "idempotent";
  action: LeadAccountabilityEventType;
  event_id: string;
  lead_id: string;
  accountability_id: string;
  record_version: number;
};

export type UpsertMarketingCampaignRequest = {
  operation_key: string;
  company_id: string;
  campaign_id?: string;
  expected_version: number;
  source_key: AttributionSourceKey;
  source_detail?: string | null;
  intake_provider?: string | null;
  vendor_key?: string | null;
  vendor_name?: string | null;
  campaign_key: string;
  campaign_name: string;
  external_campaign_id?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  is_active: boolean;
};

export type UpsertMarketingCampaignResult = {
  status: "created" | "updated" | "idempotent";
  campaign_id: string;
  record_version: number;
};

export type UpsertMarketingSpendRequest = {
  operation_key: string;
  company_id: string;
  spend_id?: string;
  expected_version: number;
  spend_month: string;
  source_key: AttributionSourceKey;
  source_detail?: string | null;
  vendor_key?: string | null;
  vendor_name?: string | null;
  campaign_id?: string | null;
  spend_amount: number;
  currency: "USD";
  notes?: string | null;
};

export type UpsertMarketingSpendResult = {
  status: "created" | "updated" | "idempotent";
  spend_id: string;
  record_version: number;
};

export type CreateRepeatOpportunityRequest = {
  operation_key: string;
  company_id: string;
  customer_id: string;
  customer_expected_updated_at: string;
  property_id?: string | null;
  property_expected_updated_at?: string | null;
  service_type: ServiceType;
  owner_user_id?: string | null;
  priority?: LeadPriority;
  next_follow_up?: string | null;
  notes?: string | null;
  received_at?: string;
};

export type MarketingAccountabilityDashboardMetrics = {
  lead_count: number;
  marketing_spend: number;
  cost_per_lead: number | null;
  booked_lead_count: number;
  booking_rate: number | null;
  inspection_completed_lead_count: number;
  inspection_completion_rate: number | null;
  won_lead_count: number;
  closing_rate: number | null;
  cost_per_sold_job: number | null;
  attributed_contract_revenue: number;
  marketing_revenue_divided_by_spend: number | null;
  new_awaiting_contact: number;
  unsold_estimates_overdue: number;
  unsold_estimates_missing_follow_up: number;
  unattributed_lead_count: number;
  attribution_coverage: number | null;
  missing_won_value_count: number;
  workflow_linkage_gap_count: number;
  untracked_legacy_lead_count: number;
};

export type MarketingAccountabilityDashboardResult = {
  company_id: string;
  month: string;
  timezone: "America/Phoenix";
  source_key: AttributionSourceKey | null;
  metrics: MarketingAccountabilityDashboardMetrics;
  by_source: Array<
    Pick<
      MarketingAccountabilityDashboardMetrics,
      | "lead_count"
      | "marketing_spend"
      | "cost_per_lead"
      | "booked_lead_count"
      | "booking_rate"
      | "inspection_completed_lead_count"
      | "inspection_completion_rate"
      | "won_lead_count"
      | "closing_rate"
      | "cost_per_sold_job"
      | "attributed_contract_revenue"
      | "marketing_revenue_divided_by_spend"
      | "unattributed_lead_count"
      | "attribution_coverage"
      | "missing_won_value_count"
      | "workflow_linkage_gap_count"
    > & { source_key: AttributionSourceKey }
  >;
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

export type PropertyInput = {
  company_id: string;
  customer_id?: string | null;
  display_name: string;
  address: string;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  property_type?: PropertyType;
  year_built?: number | null;
  square_feet?: number | null;
  stories?: number | null;
  occupancy?: PropertyOccupancy;
  hoa_name?: string | null;
  gate_code?: string | null;
  access_instructions?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  parcel_number?: string | null;
  roof_age_years?: number | null;
  roof_manufacturer?: string | null;
  roof_system?: string | null;
  roof_pitch?: string | null;
  roof_layers?: number | null;
  roofing_material?: string | null;
  flat_roof_sections?: string | null;
  tile_information?: string | null;
  has_solar?: boolean;
  has_skylights?: boolean;
  hvac_penetrations?: string | null;
  chimneys?: string | null;
  paint_system?: string | null;
  exterior_finish?: string | null;
  exterior_paint_colors?: string | null;
  last_inspection_at?: string | null;
  next_recommended_inspection_at?: string | null;
  roof_condition?: PropertyCondition;
  paint_condition?: PropertyCondition;
  warranty_status?: PropertyWarrantyStatus;
  document_status?: PropertyDocumentStatus;
  maintenance_status?: PropertyMaintenanceStatus;
  health_score?: number | null;
  is_primary?: boolean;
  portfolio_label?: string | null;
  manager_name?: string | null;
  notes?: string | null;
  ai_summary?: string | null;
};

export type EstimateLineItemInput = {
  id?: string;
  category: EstimateLineItemCategory;
  name: string;
  description?: string | null;
  quantity: number;
  unit?: string;
  unit_cost: number;
  unit_price?: number;
  markup_rate?: number;
  taxable?: boolean;
  sort_order?: number;
};

export type EstimateInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  property_id?: string | null;
  business?: string | null;
  location?: string | null;
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
  scope_of_work?: string | null;
  painting_area_type?: PaintingAreaType | null;
  paint_brand?: string;
  paint_product_line?: string | null;
  paint_finish?: PaintFinish | null;
  color_selection_status?: ColorSelectionStatus;
  paint_color_body?: string | null;
  paint_color_trim?: string | null;
  paint_color_accent?: string | null;
  surface_prep_level?: SurfacePrepLevel | null;
  coats?: number;
  primer_required?: boolean;
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

export type ScopeTemplateInput = {
  company_id?: string | null;
  title: string;
  category: ScopeCategory;
  description: string;
  template_body: string;
  ai_prompt: string;
  is_active?: boolean;
};

export type JobInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  estimate_id?: string | null;
  proposal_revision_id?: string | null;
  proposal_acceptance_id?: string | null;
  conversion_operation_key?: string | null;
  scope_id?: string | null;
  property_id?: string | null;
  business?: string | null;
  location?: string | null;
  title: string;
  service_type: ServiceType;
  status?: JobStatus;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  crew_name?: string | null;
  project_manager?: string | null;
  address?: string | null;
  property_address: string;
  scope_of_work?: string | null;
  total?: number;
  latitude?: number | null;
  longitude?: number | null;
  google_place_id?: string | null;
  address_verified_at?: string | null;
  notes?: string | null;
};

export type JobTaskInput = {
  job_id: string;
  title: string;
  description?: string | null;
  status?: JobTaskStatus;
  sort_order?: number;
};

export type OfficeTaskUpdate = {
  assigned_employee_id?: string | null;
  priority?: OfficeTaskPriority;
  due_at?: string;
  notes?: string | null;
  status?: OfficeTaskStatus;
  snoozed_until?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
};

export type JobNoteInput = {
  job_id: string;
  note: string;
};

export type JobMaterialInput = {
  job_id: string;
  name: string;
  quantity: number;
  unit?: string;
  notes?: string | null;
};

export type ScheduleEventInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  property_id?: string | null;
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
  inspection_id?: string | null;
  property_id?: string | null;
  caption?: string | null;
  label?: string | null;
  taken_at?: string | null;
  is_customer_visible?: boolean;
  sort_order?: number;
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
  proposal_revision_id?: string | null;
  proposal_acceptance_id?: string | null;
  invoice_purpose?: "proposal_deposit" | null;
  proposal_invoice_operation_key?: string | null;
  property_id?: string | null;
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

export type ProposalTemplateInput = {
  company_id?: string | null;
  template_key: string;
  name: string;
  category: string;
  service_type: ServiceType;
  status?: ProposalTemplateStatus;
  is_default?: boolean;
  version_number?: number;
  description?: string;
  default_sections?: unknown[];
  default_options?: unknown[];
  default_terms?: string | null;
  default_warranty?: string | null;
  created_by?: string | null;
  last_edited_by?: string | null;
};

export type EstimateProposalRevisionInput = {
  company_id: string;
  estimate_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  property_id?: string | null;
  template_id?: string | null;
  finalization_operation_key?: string | null;
  artifact_operation_key?: string | null;
  customer_snapshot?: Record<string, unknown> | null;
  revision_sha256?: string | null;
  terms_sha256?: string | null;
  finalized_at?: string | null;
  finalized_by?: string | null;
  finalized_document_id?: string | null;
  accepted_signature_id?: string | null;
  accepted_acceptance_id?: string | null;
  signed_document_id?: string | null;
  proposal_number: string;
  revision_number?: number;
  title: string;
  status?: ProposalRevisionStatus;
  brand_name: string;
  brand_primary_color?: string | null;
  brand_accent_color?: string | null;
  base_subtotal?: number;
  discount_total?: number;
  tax_total?: number;
  fee_total?: number;
  base_total?: number;
  selected_upgrades_total?: number;
  accepted_total?: number;
  deposit_type?: ProposalDepositType;
  deposit_value?: number;
  deposit_required?: boolean;
  deposit_due_date?: string | null;
  deposit_amount?: number;
  deposit_paid?: number;
  remaining_balance?: number;
  requires_signature?: boolean;
  requires_deposit_before_job?: boolean;
  signature_status?: ProposalSignatureReadinessStatus;
  payment_status?: ProposalPaymentStatus;
  quickbooks_sync_status?: ProposalQuickBooksSyncStatus;
  customer_visible_notes?: string | null;
  internal_notes?: string | null;
  terms?: string | null;
  acceptance_required?: boolean;
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
  superseded_at?: string | null;
  immutable_after_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  source_snapshot?: Record<string, unknown>;
};

export type EstimateProposalSectionInput = {
  company_id: string;
  proposal_revision_id: string;
  section_key: string;
  title: string;
  section_type?: ProposalSectionType;
  body?: string;
  customer_visible?: boolean;
  is_required?: boolean;
  sort_order?: number;
  source_type?: string | null;
  source_record_id?: string | null;
  created_by?: string | null;
};

export type EstimateProposalOptionInput = {
  company_id: string;
  proposal_revision_id: string;
  option_type: ProposalOptionType;
  option_group_key?: string | null;
  name: string;
  description?: string | null;
  quantity?: number;
  unit?: string;
  price?: number;
  price_effect_type?: ProposalPriceEffectType;
  base_replacement_amount?: number;
  customer_visible?: boolean;
  selected?: boolean;
  selected_by?: string | null;
  selected_at?: string | null;
  required?: boolean;
  recommended?: boolean;
  best_value?: boolean;
  dependency_option_id?: string | null;
  conflicting_option_id?: string | null;
  warranty_effect?: string | null;
  scope_details?: string | null;
  customer_notes?: string | null;
  internal_notes?: string | null;
  source_line_item_id?: string | null;
  source_finding_id?: string | null;
  source_photo_id?: string | null;
  sort_order?: number;
  created_by?: string | null;
};

export type EstimateProposalAcceptanceInput = {
  company_id: string;
  proposal_revision_id: string;
  estimate_id: string;
  customer_id?: string | null;
  signing_request_id?: string | null;
  signature_id?: string | null;
  proposal_document_id?: string | null;
  acceptance_operation_key?: string | null;
  acceptance_request_sha256?: string | null;
  proposal_revision_sha256?: string | null;
  proposal_document_sha256?: string | null;
  terms_sha256?: string | null;
  consent_version?: string | null;
  consent_sha256?: string | null;
  electronic_records_consented?: boolean | null;
  signature_intent_acknowledged?: boolean | null;
  signature_method?: "typed_name" | null;
  required_deposit_amount?: number | null;
  evidence_sha256?: string | null;
  signer_name: string;
  signer_email?: string | null;
  accepted_total: number;
  selected_option_ids?: string[];
  terms_accepted: boolean;
  acceptance_method: ProposalAcceptanceMethod;
  signature_status?: EstimateProposalAcceptanceRecord["signature_status"];
  ip_hash?: string | null;
  user_agent?: string | null;
  audit_metadata?: Record<string, unknown>;
  accepted_at?: string;
};

export type ProposalPaymentScheduleInput = {
  company_id: string;
  proposal_revision_id: string;
  invoice_id?: string | null;
  milestone_name: string;
  schedule_type: ProposalPaymentScheduleType;
  amount_type: ProposalPaymentAmountType;
  amount_value?: number;
  calculated_amount?: number;
  due_trigger?: ProposalPaymentDueTrigger;
  due_date?: string | null;
  status?: ProposalPaymentScheduleStatus;
  sort_order?: number;
  customer_visible?: boolean;
  notes?: string | null;
};

export type ProposalAuditEventInput = {
  company_id: string;
  proposal_revision_id?: string | null;
  estimate_id?: string | null;
  customer_id?: string | null;
  event_type: string;
  actor_type?: ProposalAuditActorType;
  actor_id?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  idempotency_key?: string | null;
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
  property_id?: string | null;
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
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  schedule_event_id?: string | null;
  estimate_id?: string | null;
  report_document_id?: string | null;
  property_id?: string | null;
  title: string;
  status?: InspectionStatus;
  inspection_type?: InspectionType;
  service_category?: InspectionServiceCategory;
  checklist: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  assigned_inspector?: string | null;
  property_address?: string | null;
  priority?: LeadPriority;
  purpose?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  outcome?: InspectionOutcome | null;
  report_requested?: boolean;
  report_created_at?: string | null;
  findings?: InspectionFinding[];
  measurements?: InspectionMeasurement[];
  photo_ids?: string[];
  activity?: InspectionActivityItem[];
};

export type LeadIntakeRecordInput = {
  company_id?: string | null;
  linked_lead_id?: string | null;
  linked_customer_id?: string | null;
  related_communication_event_id?: string | null;
  integration_sync_log_id?: string | null;
  provider: LeadIntakeRecordProvider;
  provider_event_id?: string | null;
  source: string;
  source_detail?: string | null;
  campaign?: string | null;
  correlation_id?: string;
  company_key?: LeadIntakeCompanyKey;
  branch_key?: LeadIntakeBranchKey;
  routing_status?: LeadIntakeRoutingStatus;
  status?: LeadIntakeRecordStatus;
  duplicate_confidence?: LeadIntakeDuplicateConfidence;
  follow_up_state?: LeadIntakeFollowUpState;
  urgency?: LeadPriority;
  assigned_queue?: string | null;
  assigned_user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  contact_name: string;
  company_name?: string | null;
  phone?: string | null;
  email?: string | null;
  service_address?: string | null;
  city?: string | null;
  state?: string;
  postal_code?: string | null;
  requested_service?: ServiceType | null;
  message?: string | null;
  preferred_contact_method?: LeadIntakePreferredContactMethod;
  receiving_business_phone_number?: string | null;
  consent_metadata?: Record<string, unknown>;
  source_metadata?: Record<string, unknown>;
  safe_raw_source_reference?: string | null;
  possible_matches?: unknown[];
  routing_reasons?: unknown[];
  review_notes?: string | null;
  dismissed_at?: string | null;
  dismissed_by?: string | null;
  non_lead_reason?: string | null;
  intake_timestamp?: string;
  original_submission_timestamp?: string | null;
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
  property_id?: string | null;
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
  proposal_revision_id?: string | null;
  acceptance_id?: string | null;
  signed_document_id?: string | null;
  signer_name: string;
  signer_email?: string | null;
  status?: SignatureStatus;
  provider?: string | null;
  provider_envelope_id?: string | null;
  signature_data?: string | null;
  signature_method?: "typed_name" | null;
  evidence_sha256?: string | null;
  sent_at?: string | null;
  viewed_at?: string | null;
  signed_at?: string | null;
  declined_at?: string | null;
  expires_at?: string | null;
};

export type DocumentInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  estimate_id?: string | null;
  inspection_id?: string | null;
  invoice_id?: string | null;
  change_order_id?: string | null;
  proposal_revision_id?: string | null;
  artifact_operation_key?: string | null;
  content_sha256?: string | null;
  immutable_after_at?: string | null;
  property_id?: string | null;
  title: string;
  category: DocumentCategory;
  status?: DocumentStatus;
  template_key?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string | null;
  storage_bucket?: string | null;
  storage_path?: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  archived_at?: string | null;
  property_address?: string | null;
  tags?: string[];
  requirement_level?: DocumentRequirementLevel;
  required_for?: string[];
  body?: string | null;
};

export type PaymentInput = {
  company_id: string;
  customer_id?: string | null;
  invoice_id?: string | null;
  property_id?: string | null;
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
  provider_account_id?: string | null;
  default_calendar_id?: string | null;
  scopes?: string[];
  sync_direction?: IntegrationSyncDirection;
  credential_reference?: string | null;
  webhook_channel_id?: string | null;
  webhook_resource_id?: string | null;
  sync_token?: string | null;
  token_expires_at?: string | null;
  last_sync_at?: string | null;
  last_successful_sync_at?: string | null;
  last_failure_at?: string | null;
  disabled_at?: string | null;
  last_error?: string | null;
  settings?: Record<string, unknown>;
};

export type IntegrationSyncLogInput = {
  company_id: string;
  integration_connection_id?: string | null;
  provider: IntegrationProvider;
  direction?: IntegrationSyncDirection;
  event_type: string;
  status?: IntegrationSyncLogStatus;
  related_table?: string | null;
  related_record_id?: string | null;
  external_id?: string | null;
  attempt_count?: number;
  max_attempts?: number;
  next_retry_at?: string | null;
  last_attempted_at?: string | null;
  completed_at?: string | null;
  request_fingerprint?: string | null;
  request_summary?: Record<string, unknown>;
  response_summary?: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
};

export type AiSavedAnalysisInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  estimate_id?: string | null;
  proposal_revision_id?: string | null;
  job_id?: string | null;
  inspection_id?: string | null;
  invoice_id?: string | null;
  document_id?: string | null;
  title: string;
  task_type: AiTaskType;
  mode?: AiWorkMode;
  provider?: AiProvider;
  model?: string | null;
  prompt_summary?: string | null;
  output?: Record<string, unknown>;
  source_records?: unknown[];
  approval_state?: AiApprovalState;
  status?: AiSavedAnalysisStatus;
  created_by?: string | null;
  expires_at?: string | null;
  archived_at?: string | null;
};

export type AiAuditEventInput = {
  company_id: string;
  saved_analysis_id?: string | null;
  actor_user_id?: string | null;
  task_type: AiTaskType;
  event_type: AiAuditEventType;
  provider?: AiProvider;
  model?: string | null;
  source_records?: unknown[];
  action_type?: string | null;
  action_preview?: Record<string, unknown>;
  status?: string;
  safety_flags?: string[];
  token_count?: number | null;
  estimated_cost_cents?: number | null;
  metadata?: Record<string, unknown>;
};

export type AiUsageLimitInput = {
  company_id: string;
  ai_enabled?: boolean;
  allowed_providers?: AiProvider[];
  allowed_models?: string[];
  daily_request_limit?: number;
  per_user_daily_request_limit?: number;
  per_company_monthly_budget_cents?: number;
  expensive_task_confirmation_cents?: number;
  token_limit?: number;
  timeout_ms?: number;
  retry_limit?: number;
  last_reviewed_at?: string | null;
};

export type GoHighLevelSyncMappingInput = {
  company_id: string;
  integration_connection_id?: string | null;
  provider?: Extract<IntegrationProvider, "gohighlevel">;
  local_table: string;
  local_record_id: string;
  external_object_type: GoHighLevelSyncObjectType;
  external_id?: string | null;
  external_location_id?: string | null;
  external_account_id?: string | null;
  sync_status?: GoHighLevelSyncStatus;
  sync_direction?: IntegrationSyncDirection;
  conflict_status?: GoHighLevelConflictStatus;
  conflict_summary?: string | null;
  last_synced_at?: string | null;
  external_updated_at?: string | null;
  pending_sync?: boolean;
  last_error?: string | null;
  record_fingerprint?: string | null;
  metadata?: Record<string, unknown>;
};

export type GoHighLevelDiscoverySnapshotInput = {
  company_id: string;
  integration_connection_id?: string | null;
  provider?: Extract<IntegrationProvider, "gohighlevel">;
  location_key: string;
  external_location_id?: string | null;
  account_name?: string | null;
  location_name?: string | null;
  pipeline_count?: number;
  pipelines?: Record<string, unknown>[];
  discovery_status?: GoHighLevelDiscoveryStatus;
  checked_at?: string;
  last_error?: string | null;
  metadata?: Record<string, unknown>;
};

export type GoHighLevelOauthStateInsert = Omit<
  GoHighLevelOauthStateRecord,
  "id" | "created_at" | "updated_at" | "consumed_at" | "failure_reason"
> &
  Partial<
    Pick<GoHighLevelOauthStateRecord, "id" | "consumed_at" | "failure_reason">
  >;

export type GoHighLevelOauthCredentialInsert = Omit<
  GoHighLevelOauthCredentialRecord,
  | "id"
  | "created_at"
  | "updated_at"
  | "bridge_version"
  | "last_refreshed_at"
  | "revoked_at"
> &
  Partial<
    Pick<
      GoHighLevelOauthCredentialRecord,
      "id" | "bridge_version" | "last_refreshed_at" | "revoked_at"
    >
  >;

export type GoHighLevelResourceSnapshotInsert = Omit<
  GoHighLevelResourceSnapshotRecord,
  "id" | "created_at" | "updated_at" | "last_synced_at"
> &
  Partial<
    Pick<GoHighLevelResourceSnapshotRecord, "id" | "last_synced_at">
  >;

export type GoHighLevelWebhookEventInsert = Omit<
  GoHighLevelWebhookEventRecord,
  "id" | "created_at" | "updated_at" | "received_at" | "attempt_count"
> &
  Partial<
    Pick<
      GoHighLevelWebhookEventRecord,
      "id" | "received_at" | "attempt_count"
    >
  >;

export type LeadSourceMappingInput = {
  provider: LeadSourceMappingProvider;
  external_source_id?: string | null;
  business: string;
  location: string;
  display_name: string;
  is_active?: boolean;
};

export type CalendarEventSyncInput = {
  company_id: string;
  schedule_event_id: string;
  integration_connection_id: string;
  provider?: IntegrationProvider;
  google_calendar_id: string;
  google_event_id?: string | null;
  google_recurring_event_id?: string | null;
  google_event_etag?: string | null;
  google_event_status?: Extract<
    GoogleCalendarEventStatus,
    "confirmed" | "tentative" | "cancelled"
  >;
  sync_status?: CalendarEventSyncStatus;
  sync_direction?: IntegrationSyncDirection;
  last_synced_at?: string | null;
  external_updated_at?: string | null;
  provider_updated_at?: string | null;
  deleted_at?: string | null;
  conflict_status?: GoogleCalendarConflictStatus;
  conflict_reason?: string | null;
  sync_attempt_count?: number;
  last_synced_direction?: IntegrationSyncDirection | null;
  last_error?: string | null;
  last_payload_hash?: string | null;
  metadata?: Record<string, unknown>;
};

export type GoogleCalendarCredentialInsert = Omit<
  GoogleCalendarCredentialRecord,
  "id" | "created_at" | "updated_at"
>;

export type GoogleCalendarConnectedCalendarInsert = Omit<
  GoogleCalendarConnectedCalendarRecord,
  | "id"
  | "created_at"
  | "updated_at"
  | "description"
  | "time_zone"
  | "access_role"
  | "primary_calendar"
  | "selected_for_sync"
  | "calendar_purpose"
  | "branch_location"
  | "sync_mode"
  | "status"
  | "sync_token"
  | "webhook_channel_id"
  | "webhook_resource_id"
  | "webhook_channel_expires_at"
  | "last_sync_at"
  | "last_successful_sync_at"
  | "last_failure_at"
  | "last_error"
  | "metadata"
> &
  Partial<
    Pick<
      GoogleCalendarConnectedCalendarRecord,
      | "description"
      | "time_zone"
      | "access_role"
      | "primary_calendar"
      | "selected_for_sync"
      | "calendar_purpose"
      | "branch_location"
      | "sync_mode"
      | "status"
      | "sync_token"
      | "webhook_channel_id"
      | "webhook_resource_id"
      | "webhook_channel_expires_at"
      | "last_sync_at"
      | "last_successful_sync_at"
      | "last_failure_at"
      | "last_error"
      | "metadata"
    >
  >;

export type GoogleCalendarUnmatchedEventInsert = Omit<
  GoogleCalendarUnmatchedEventRecord,
  | "id"
  | "created_at"
  | "updated_at"
  | "connected_calendar_id"
  | "google_recurring_event_id"
  | "google_event_etag"
  | "event_status"
  | "event_location"
  | "starts_at"
  | "ends_at"
  | "all_day_date"
  | "provider_updated_at"
  | "review_status"
  | "review_reason"
  | "metadata"
> &
  Partial<
    Pick<
      GoogleCalendarUnmatchedEventRecord,
      | "connected_calendar_id"
      | "google_recurring_event_id"
      | "google_event_etag"
      | "event_status"
      | "event_location"
      | "starts_at"
      | "ends_at"
      | "all_day_date"
      | "provider_updated_at"
      | "review_status"
      | "review_reason"
      | "metadata"
    >
  >;

export type EmailMessageInput = {
  company_id: string;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  property_id?: string | null;
  estimate_id?: string | null;
  invoice_id?: string | null;
  document_id?: string | null;
  integration_connection_id?: string | null;
  provider?: Extract<IntegrationProvider, "gmail">;
  category: EmailMessageCategory;
  status?: EmailMessageStatus;
  direction?: EmailMessageDirection;
  from_email?: string | null;
  to_email: string;
  to_emails?: string[];
  cc_email?: string | null;
  cc_emails?: string[];
  bcc_emails?: string[];
  reply_to_emails?: string[];
  subject: string;
  body: string;
  gmail_message_id?: string | null;
  gmail_thread_id?: string | null;
  provider_account_id?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  message_preview?: string | null;
  has_attachments?: boolean;
  attachment_count?: number;
  sync_status?: EmailMessageSyncStatus;
  imported_at?: string | null;
  provider_payload_hash?: string | null;
  metadata?: Record<string, unknown>;
  last_error?: string | null;
};

export type GmailOauthStateInsert = Omit<
  GmailOauthStateRecord,
  "id" | "created_at" | "updated_at" | "provider" | "consumed_at" | "failure_reason"
> &
  Partial<
    Pick<GmailOauthStateRecord, "id" | "provider" | "consumed_at" | "failure_reason">
  >;

export type GmailMailboxCredentialInsert = Omit<
  GmailMailboxCredentialRecord,
  "id" | "created_at" | "updated_at"
> &
  Partial<Pick<GmailMailboxCredentialRecord, "id">>;

export type GmailEmailThreadInsert = Omit<
  GmailEmailThreadRecord,
  "id" | "created_at" | "updated_at" | "message_count" | "metadata"
> &
  Partial<Pick<GmailEmailThreadRecord, "id" | "message_count" | "metadata">>;

export type GmailEmailAttachmentInsert = Omit<
  GmailEmailAttachmentRecord,
  "id" | "created_at" | "updated_at" | "metadata"
> &
  Partial<Pick<GmailEmailAttachmentRecord, "id" | "metadata">>;

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
  business_phone_number_id?: string | null;
  direction?: SmsMessageDirection;
  delivery_status?: SmsDeliveryStatus | null;
  provider_account_sid?: string | null;
  provider_messaging_service_sid?: string | null;
  to_phone: string;
  from_phone?: string | null;
  body: string;
  twilio_message_sid?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  failed_at?: string | null;
  correlation_id?: string;
  provider_payload_fingerprint?: string | null;
  metadata?: Record<string, unknown>;
  last_error?: string | null;
};

export type BusinessPhoneNumberInput = {
  company_id: string;
  integration_connection_id?: string | null;
  provider?: BusinessPhoneProvider;
  provider_account_sid?: string | null;
  messaging_service_sid?: string | null;
  phone_number_e164?: string | null;
  display_name: string;
  routing_key: string;
  business_location: string;
  team_queue: string;
  lead_source: string;
  communication_channel?: BusinessPhoneCommunicationChannel;
  time_zone?: string;
  routing_status?: BusinessPhoneRoutingStatus;
  settings?: Record<string, unknown>;
};

export type CommunicationProviderEventInput = {
  company_id?: string | null;
  business_phone_number_id?: string | null;
  integration_connection_id?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  sms_message_id?: string | null;
  provider?: BusinessPhoneProvider;
  provider_account_sid?: string | null;
  provider_event_sid?: string | null;
  provider_parent_sid?: string | null;
  event_type: ProviderEventType;
  channel: ProviderEventChannel;
  direction: ProviderEventDirection;
  status: string;
  from_phone?: string | null;
  to_phone?: string | null;
  business_phone?: string | null;
  customer_phone?: string | null;
  routing_status?: ProviderEventRoutingStatus;
  correlation_id?: string;
  request_fingerprint?: string | null;
  payload_summary?: Record<string, unknown>;
  response_summary?: Record<string, unknown>;
  error_code?: string | null;
  error_message?: string | null;
  occurred_at?: string;
};

export type CallRecordInput = {
  company_id?: string | null;
  business_phone_number_id?: string | null;
  integration_connection_id?: string | null;
  customer_id?: string | null;
  lead_id?: string | null;
  job_id?: string | null;
  provider?: Extract<BusinessPhoneProvider, "twilio" | "gohighlevel">;
  provider_account_sid?: string | null;
  provider_call_sid?: string | null;
  provider_parent_call_sid?: string | null;
  direction?: ProviderEventDirection;
  call_status?: CallRecordStatus;
  from_phone?: string | null;
  to_phone?: string | null;
  business_phone?: string | null;
  customer_phone?: string | null;
  routing_status?: ProviderEventRoutingStatus;
  started_at?: string | null;
  answered_at?: string | null;
  ended_at?: string | null;
  duration_seconds?: number | null;
  recording_sid?: string | null;
  recording_status?: CallRecordingStatus | null;
  recording_duration_seconds?: number | null;
  transcript_status?: CallTranscriptStatus | null;
  follow_up_required?: boolean;
  correlation_id?: string;
  metadata?: Record<string, unknown>;
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

export type CompanyMembershipRecord = {
  user_id: string;
  company_id: string;
  role: CompanyMembershipRole;
  can_manage_settings: boolean;
  can_manage_financials: boolean;
  can_manage_production: boolean;
  created_at: string;
  updated_at: string;
};

export type CompanyWorkflowSettingsRecord = {
  company_id: string;
  workflow_profile: Trade;
  estimate_terms: string | null;
  invoice_terms: string | null;
  warranty_terms: string | null;
  production_checklist: string[];
  created_at: string;
  updated_at: string;
};

export type CompanyInsert = {
  id?: string;
  name: string;
  trade: Trade;
  short_name?: string | null;
  brand_color?: string | null;
  workflow_profile?: Trade;
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

export type PropertyInsert = PropertyInput & {
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

export type ScopeTemplateInsert = ScopeTemplateInput & {
  id?: string;
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

export type JobTaskInsert = JobTaskInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type OfficeTaskInsert = Omit<
  OfficeTaskRecord,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type JobNoteInsert = JobNoteInput & {
  id?: string;
  created_at?: string;
};

export type JobMaterialInsert = JobMaterialInput & {
  id?: string;
  created_at?: string;
};

export type ScheduleEventInsert = ScheduleEventInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type JobPhotoInsert = JobPhotoInput & {
  id?: string;
  file_path: string;
  file_url?: null;
  upload_operation_key: string;
  upload_request_fingerprint: string;
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

export type ProposalTemplateInsert = ProposalTemplateInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type EstimateProposalRevisionInsert = EstimateProposalRevisionInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type EstimateProposalSectionInsert = EstimateProposalSectionInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type EstimateProposalOptionInsert = EstimateProposalOptionInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type EstimateProposalAcceptanceInsert = EstimateProposalAcceptanceInput & {
  id?: string;
  created_at?: string;
};

export type ProposalPaymentScheduleInsert = ProposalPaymentScheduleInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ProposalAuditEventInsert = ProposalAuditEventInput & {
  id?: string;
  created_at?: string;
};

export type ProposalSigningRequestInsert = Omit<
  ProposalSigningRequestRecord,
  | "status"
  | "request_token_consumed_at"
  | "request_token_consumed_session_id"
  | "delivery_email_message_id"
  | "delivery_provider_message_id"
  | "failure_code"
  | "revocation_reason"
  | "sent_at"
  | "first_viewed_at"
  | "signed_at"
  | "declined_at"
  | "failed_at"
  | "revoked_at"
  | "superseded_at"
  | "exchange_attempt_count"
  | "exchange_window_started_at"
  | "exchange_blocked_until"
  | "session_read_attempt_count"
  | "session_read_window_started_at"
  | "session_read_blocked_until"
  | "action_attempt_count"
  | "action_window_started_at"
  | "action_blocked_until"
  | "created_at"
  | "updated_at"
> & {
  status?: ProposalSigningRequestStatus;
  request_token_consumed_at?: string | null;
  request_token_consumed_session_id?: string | null;
  delivery_email_message_id?: string | null;
  delivery_provider_message_id?: string | null;
  failure_code?: string | null;
  revocation_reason?: string | null;
  sent_at?: string | null;
  first_viewed_at?: string | null;
  signed_at?: string | null;
  declined_at?: string | null;
  failed_at?: string | null;
  revoked_at?: string | null;
  superseded_at?: string | null;
  exchange_attempt_count?: number;
  exchange_window_started_at?: string | null;
  exchange_blocked_until?: string | null;
  session_read_attempt_count?: number;
  session_read_window_started_at?: string | null;
  session_read_blocked_until?: string | null;
  action_attempt_count?: number;
  action_window_started_at?: string | null;
  action_blocked_until?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProposalSigningSessionInsert = Omit<
  ProposalSigningSessionRecord,
  "id" | "opened_at" | "last_seen_at" | "created_at" | "updated_at"
> & {
  id?: string;
  opened_at?: string;
  last_seen_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type ProposalSignatureReceiptInsert = Omit<
  ProposalSignatureReceiptRecord,
  "id" | "registered_at"
> & {
  id?: string;
  registered_at?: string;
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

export type LeadIntakeRecordInsert = LeadIntakeRecordInput & {
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

export type IntegrationSyncLogInsert = IntegrationSyncLogInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type AiSavedAnalysisInsert = AiSavedAnalysisInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type AiAuditEventInsert = AiAuditEventInput & {
  id?: string;
  created_at?: string;
};

export type AiUsageLimitInsert = AiUsageLimitInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type GoHighLevelSyncMappingInsert = GoHighLevelSyncMappingInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type GoHighLevelDiscoverySnapshotInsert =
  GoHighLevelDiscoverySnapshotInput & {
    id?: string;
    created_at?: string;
    updated_at?: string;
  };

export type LeadSourceMappingInsert = LeadSourceMappingInput & {
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

export type BusinessPhoneNumberInsert = BusinessPhoneNumberInput & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type CommunicationProviderEventInsert = CommunicationProviderEventInput & {
  id?: string;
  received_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type CallRecordInsert = CallRecordInput & {
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

export type CompanyMembershipInsert = {
  user_id: string;
  company_id: string;
  role?: CompanyMembershipRole;
  can_manage_settings?: boolean;
  can_manage_financials?: boolean;
  can_manage_production?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type CompanyWorkflowSettingsInsert = {
  company_id: string;
  workflow_profile?: Trade;
  estimate_terms?: string | null;
  invoice_terms?: string | null;
  warranty_terms?: string | null;
  production_checklist?: string[];
  created_at?: string;
  updated_at?: string;
};

export type CrmSnapshot = {
  companies: CompanyRecord[];
  properties: PropertyRecord[];
  leads: LeadRecord[];
  marketingCampaigns: MarketingCampaignRecord[];
  leadAccountability: LeadAccountabilityRecord[];
  leadAccountabilityEvents: LeadAccountabilityEventRecord[];
  marketingSpendMonths: MarketingSpendMonthRecord[];
  customers: CustomerRecord[];
  estimates: EstimateRecord[];
  estimateLineItems: EstimateLineItemRecord[];
  scopeTemplates: ScopeTemplateRecord[];
  scopes: ScopeRecord[];
  jobs: JobRecord[];
  jobTasks: JobTaskRecord[];
  officeTasks: OfficeTaskRecord[];
  jobNotes: JobNoteRecord[];
  jobMaterials: JobMaterialRecord[];
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
  proposalTemplates: ProposalTemplateRecord[];
  proposalRevisions: EstimateProposalRevisionRecord[];
  proposalSections: EstimateProposalSectionRecord[];
  proposalOptions: EstimateProposalOptionRecord[];
  proposalAcceptances: EstimateProposalAcceptanceRecord[];
  proposalPaymentSchedules: ProposalPaymentScheduleRecord[];
  proposalAuditEvents: ProposalAuditEventRecord[];
  notifications: NotificationRecord[];
  integrationConnections: IntegrationConnectionRecord[];
  integrationSyncLogs: IntegrationSyncLogRecord[];
  aiSavedAnalyses: AiSavedAnalysisRecord[];
  aiAuditEvents: AiAuditEventRecord[];
  aiUsageLimits: AiUsageLimitRecord[];
  leadIntakeRecords: LeadIntakeRecord[];
  calendarEventSyncs: CalendarEventSyncRecord[];
  googleCalendarConnectedCalendars: GoogleCalendarConnectedCalendarRecord[];
  googleCalendarUnmatchedEvents: GoogleCalendarUnmatchedEventRecord[];
  emailMessages: EmailMessageRecord[];
  gmailEmailThreads: GmailEmailThreadRecord[];
  gmailEmailAttachments: GmailEmailAttachmentRecord[];
  smsMessages: SmsMessageRecord[];
  businessPhoneNumbers: BusinessPhoneNumberRecord[];
  communicationProviderEvents: CommunicationProviderEventRecord[];
  callRecords: CallRecord[];
  routePlans: RoutePlanRecord[];
  routePlanStops: RoutePlanStopRecord[];
  companyMemberships: CompanyMembershipRecord[];
  companyWorkflowSettings: CompanyWorkflowSettingsRecord[];
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
      crm_identity_reconciliation_events: {
        Row: IdentityReconciliationEventRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      mighty_apes_yelp_webhook_events: {
        Row: MightyApesYelpWebhookEventRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      properties: {
        Row: PropertyRecord;
        Insert: PropertyInsert;
        Update: Partial<Database["public"]["Tables"]["properties"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: LeadRecord;
        Insert: LeadInsert;
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      marketing_campaigns: {
        Row: MarketingCampaignRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      lead_accountability: {
        Row: LeadAccountabilityRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      lead_accountability_events: {
        Row: LeadAccountabilityEventRecord;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      marketing_spend_months: {
        Row: MarketingSpendMonthRecord;
        Insert: never;
        Update: never;
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
      job_tasks: {
        Row: JobTaskRecord;
        Insert: JobTaskInsert;
        Update: Partial<Database["public"]["Tables"]["job_tasks"]["Insert"]>;
        Relationships: [];
      };
      office_tasks: {
        Row: OfficeTaskRecord;
        Insert: OfficeTaskInsert;
        Update: OfficeTaskUpdate;
        Relationships: [];
      };
      job_notes: {
        Row: JobNoteRecord;
        Insert: JobNoteInsert;
        Update: Partial<Database["public"]["Tables"]["job_notes"]["Insert"]>;
        Relationships: [];
      };
      job_materials: {
        Row: JobMaterialRecord;
        Insert: JobMaterialInsert;
        Update: Partial<Database["public"]["Tables"]["job_materials"]["Insert"]>;
        Relationships: [];
      };
      schedule_events: {
        Row: ScheduleEventRecord;
        Insert: ScheduleEventInsert;
        Update: Partial<Database["public"]["Tables"]["schedule_events"]["Insert"]>;
        Relationships: [];
      };
      job_photo_upload_operations: {
        Row: JobPhotoUploadOperationRecord;
        Insert: {
          id?: string;
          company_id: string;
          upload_operation_key: string;
          upload_request_fingerprint: string;
          file_path: string;
          registration_digest: string;
          uploader_user_id: string;
          recovery_lease_token: string;
          recovery_lease_expires_at: string;
          state?: JobPhotoUploadOperationState;
          reserved_at?: string;
          canceling_at?: string | null;
          committed_at?: string | null;
          aborted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["job_photo_upload_operations"]["Insert"]
        >;
        Relationships: [];
      };
      job_photos: {
        Row: JobPhotoRow;
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
      stripe_company_accounts: {
        Row: StripeCompanyAccountRecord;
        Insert: StripeCompanyAccountInsert;
        Update: Partial<StripeCompanyAccountInsert>;
        Relationships: [];
      };
      stripe_object_mappings: {
        Row: StripeObjectMappingRecord;
        Insert: StripeObjectMappingInsert;
        Update: Partial<StripeObjectMappingInsert>;
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: StripeWebhookEventRecord;
        Insert: StripeWebhookEventInsert;
        Update: Partial<StripeWebhookEventInsert>;
        Relationships: [];
      };
      proposal_templates: {
        Row: ProposalTemplateRecord;
        Insert: ProposalTemplateInsert;
        Update: Partial<
          Database["public"]["Tables"]["proposal_templates"]["Insert"]
        >;
        Relationships: [];
      };
      estimate_proposal_revisions: {
        Row: EstimateProposalRevisionRecord;
        Insert: EstimateProposalRevisionInsert;
        Update: Partial<
          Database["public"]["Tables"]["estimate_proposal_revisions"]["Insert"]
        >;
        Relationships: [];
      };
      estimate_proposal_sections: {
        Row: EstimateProposalSectionRecord;
        Insert: EstimateProposalSectionInsert;
        Update: Partial<
          Database["public"]["Tables"]["estimate_proposal_sections"]["Insert"]
        >;
        Relationships: [];
      };
      estimate_proposal_options: {
        Row: EstimateProposalOptionRecord;
        Insert: EstimateProposalOptionInsert;
        Update: Partial<
          Database["public"]["Tables"]["estimate_proposal_options"]["Insert"]
        >;
        Relationships: [];
      };
      estimate_proposal_acceptances: {
        Row: EstimateProposalAcceptanceRecord;
        Insert: EstimateProposalAcceptanceInsert;
        Update: Partial<
          Database["public"]["Tables"]["estimate_proposal_acceptances"]["Insert"]
        >;
        Relationships: [];
      };
      proposal_payment_schedules: {
        Row: ProposalPaymentScheduleRecord;
        Insert: ProposalPaymentScheduleInsert;
        Update: Partial<
          Database["public"]["Tables"]["proposal_payment_schedules"]["Insert"]
        >;
        Relationships: [];
      };
      proposal_audit_events: {
        Row: ProposalAuditEventRecord;
        Insert: ProposalAuditEventInsert;
        Update: Partial<
          Database["public"]["Tables"]["proposal_audit_events"]["Insert"]
        >;
        Relationships: [];
      };
      proposal_signing_requests: {
        Row: ProposalSigningRequestRecord;
        Insert: ProposalSigningRequestInsert;
        Update: Partial<ProposalSigningRequestInsert>;
        Relationships: [];
      };
      proposal_signing_sessions: {
        Row: ProposalSigningSessionRecord;
        Insert: ProposalSigningSessionInsert;
        Update: Partial<ProposalSigningSessionInsert>;
        Relationships: [];
      };
      proposal_signature_receipts: {
        Row: ProposalSignatureReceiptRecord;
        Insert: ProposalSignatureReceiptInsert;
        Update: Partial<ProposalSignatureReceiptInsert>;
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
      integration_sync_logs: {
        Row: IntegrationSyncLogRecord;
        Insert: IntegrationSyncLogInsert;
        Update: Partial<
          Database["public"]["Tables"]["integration_sync_logs"]["Insert"]
        >;
        Relationships: [];
      };
      ai_saved_analyses: {
        Row: AiSavedAnalysisRecord;
        Insert: AiSavedAnalysisInsert;
        Update: Partial<
          Database["public"]["Tables"]["ai_saved_analyses"]["Insert"]
        >;
        Relationships: [];
      };
      ai_audit_events: {
        Row: AiAuditEventRecord;
        Insert: AiAuditEventInsert;
        Update: Partial<
          Database["public"]["Tables"]["ai_audit_events"]["Insert"]
        >;
        Relationships: [];
      };
      ai_usage_limits: {
        Row: AiUsageLimitRecord;
        Insert: AiUsageLimitInsert;
        Update: Partial<
          Database["public"]["Tables"]["ai_usage_limits"]["Insert"]
        >;
        Relationships: [];
      };
      gmail_oauth_states: {
        Row: GmailOauthStateRecord;
        Insert: GmailOauthStateInsert;
        Update: Partial<
          Database["public"]["Tables"]["gmail_oauth_states"]["Insert"]
        >;
        Relationships: [];
      };
      gmail_mailbox_credentials: {
        Row: GmailMailboxCredentialRecord;
        Insert: GmailMailboxCredentialInsert;
        Update: Partial<
          Database["public"]["Tables"]["gmail_mailbox_credentials"]["Insert"]
        >;
        Relationships: [];
      };
      gmail_email_threads: {
        Row: GmailEmailThreadRecord;
        Insert: GmailEmailThreadInsert;
        Update: Partial<
          Database["public"]["Tables"]["gmail_email_threads"]["Insert"]
        >;
        Relationships: [];
      };
      gmail_email_attachments: {
        Row: GmailEmailAttachmentRecord;
        Insert: GmailEmailAttachmentInsert;
        Update: Partial<
          Database["public"]["Tables"]["gmail_email_attachments"]["Insert"]
        >;
        Relationships: [];
      };
      gohighlevel_sync_mappings: {
        Row: GoHighLevelSyncMappingRecord;
        Insert: GoHighLevelSyncMappingInsert;
        Update: Partial<
          Database["public"]["Tables"]["gohighlevel_sync_mappings"]["Insert"]
        >;
        Relationships: [];
      };
      gohighlevel_discovery_snapshots: {
        Row: GoHighLevelDiscoverySnapshotRecord;
        Insert: GoHighLevelDiscoverySnapshotInsert;
        Update: Partial<
          Database["public"]["Tables"]["gohighlevel_discovery_snapshots"]["Insert"]
        >;
        Relationships: [];
      };
      gohighlevel_oauth_states: {
        Row: GoHighLevelOauthStateRecord;
        Insert: GoHighLevelOauthStateInsert;
        Update: Partial<GoHighLevelOauthStateInsert>;
        Relationships: [];
      };
      gohighlevel_oauth_credentials: {
        Row: GoHighLevelOauthCredentialRecord;
        Insert: GoHighLevelOauthCredentialInsert;
        Update: Partial<GoHighLevelOauthCredentialInsert>;
        Relationships: [];
      };
      gohighlevel_resource_snapshots: {
        Row: GoHighLevelResourceSnapshotRecord;
        Insert: GoHighLevelResourceSnapshotInsert;
        Update: Partial<GoHighLevelResourceSnapshotInsert>;
        Relationships: [];
      };
      gohighlevel_webhook_events: {
        Row: GoHighLevelWebhookEventRecord;
        Insert: GoHighLevelWebhookEventInsert;
        Update: Partial<GoHighLevelWebhookEventInsert>;
        Relationships: [];
      };
      lead_source_mappings: {
        Row: LeadSourceMappingRecord;
        Insert: LeadSourceMappingInsert;
        Update: Partial<
          Database["public"]["Tables"]["lead_source_mappings"]["Insert"]
        >;
        Relationships: [];
      };
      lead_intake_records: {
        Row: LeadIntakeRecord;
        Insert: LeadIntakeRecordInsert;
        Update: Partial<
          Database["public"]["Tables"]["lead_intake_records"]["Insert"]
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
      google_calendar_credentials: {
        Row: GoogleCalendarCredentialRecord;
        Insert: GoogleCalendarCredentialInsert;
        Update: Partial<
          Database["public"]["Tables"]["google_calendar_credentials"]["Insert"]
        >;
        Relationships: [];
      };
      google_calendar_connected_calendars: {
        Row: GoogleCalendarConnectedCalendarRecord;
        Insert: GoogleCalendarConnectedCalendarInsert;
        Update: Partial<
          Database["public"]["Tables"]["google_calendar_connected_calendars"]["Insert"]
        >;
        Relationships: [];
      };
      google_calendar_unmatched_events: {
        Row: GoogleCalendarUnmatchedEventRecord;
        Insert: GoogleCalendarUnmatchedEventInsert;
        Update: Partial<
          Database["public"]["Tables"]["google_calendar_unmatched_events"]["Insert"]
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
      business_phone_numbers: {
        Row: BusinessPhoneNumberRecord;
        Insert: BusinessPhoneNumberInsert;
        Update: Partial<
          Database["public"]["Tables"]["business_phone_numbers"]["Insert"]
        >;
        Relationships: [];
      };
      communication_provider_events: {
        Row: CommunicationProviderEventRecord;
        Insert: CommunicationProviderEventInsert;
        Update: Partial<
          Database["public"]["Tables"]["communication_provider_events"]["Insert"]
        >;
        Relationships: [];
      };
      call_records: {
        Row: CallRecord;
        Insert: CallRecordInsert;
        Update: Partial<Database["public"]["Tables"]["call_records"]["Insert"]>;
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
      company_memberships: {
        Row: CompanyMembershipRecord;
        Insert: CompanyMembershipInsert;
        Update: Partial<Database["public"]["Tables"]["company_memberships"]["Insert"]>;
        Relationships: [];
      };
      company_workflow_settings: {
        Row: CompanyWorkflowSettingsRecord;
        Insert: CompanyWorkflowSettingsInsert;
        Update: Partial<
          Database["public"]["Tables"]["company_workflow_settings"]["Insert"]
        >;
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
    Functions: {
      wtos_finalize_proposal_revision: {
        Args: { finalization_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_register_proposal_artifact: {
        Args: { artifact_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_prepare_proposal_signing_request: {
        Args: { signing_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_transition_proposal_signing_request: {
        Args: { transition_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_create_proposal_signature_email_draft: {
        Args: { draft_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_queue_proposal_signature_email: {
        Args: { queue_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_transition_proposal_signature_email: {
        Args: { delivery_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_activate_synthetic_proposal_signing_fixture: {
        Args: { activation_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_exchange_proposal_signing_token: {
        Args: { signing_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_get_proposal_signing_session: {
        Args: { signing_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_accept_proposal_signing: {
        Args: { signing_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_decline_proposal_signing: {
        Args: { signing_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_register_proposal_signing_receipt: {
        Args: { receipt_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_create_proposal_deposit_invoice: {
        Args: { deposit_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_convert_proposal_to_sold_job: {
        Args: { conversion_request: Record<string, unknown> };
        Returns: Record<string, unknown>;
      };
      wtos_begin_job_photo_upload: {
        Args: JobPhotoUploadRpcArgs;
        Returns: JobPhotoUploadOperationRecord;
      };
      wtos_cancel_job_photo_upload: {
        Args: JobPhotoUploadRpcArgs;
        Returns: JobPhotoUploadOperationRecord;
      };
      wtos_confirm_job_photo_upload_abort: {
        Args: JobPhotoUploadRpcArgs;
        Returns: JobPhotoUploadOperationRecord;
      };
      wtos_register_job_photo: {
        Args: JobPhotoUploadRpcArgs;
        Returns: JobPhotoRow;
      };
      wtos_list_my_job_photo_upload_recoveries: {
        Args: { target_uploader_user_id?: string | null };
        Returns: JobPhotoUploadRecoveryListRecord[];
      };
      wtos_claim_job_photo_upload_recovery: {
        Args: {
          target_company_id: string;
          target_upload_operation_key: string;
          target_recovery_lease_token: string;
          target_uploader_user_id?: string | null;
        };
        Returns: JobPhotoUploadRecoveryClaimRecord[];
      };
      wtos_confirm_job_photo_upload_recovery_abort: {
        Args: {
          target_company_id: string;
          target_upload_operation_key: string;
          target_recovery_lease_token: string;
          target_uploader_user_id?: string | null;
        };
        Returns: JobPhotoUploadOperationState;
      };
      wtos_create_accountable_lead: {
        Args: { accountability_request: CreateAccountableLeadRequest };
        Returns: CreateAccountableLeadResult;
      };
      wtos_apply_lead_accountability_action: {
        Args: { action_request: LeadAccountabilityActionRequest };
        Returns: LeadAccountabilityActionResult;
      };
      wtos_upsert_marketing_campaign: {
        Args: { campaign_request: UpsertMarketingCampaignRequest };
        Returns: UpsertMarketingCampaignResult;
      };
      wtos_upsert_marketing_spend: {
        Args: { spend_request: UpsertMarketingSpendRequest };
        Returns: UpsertMarketingSpendResult;
      };
      wtos_create_repeat_opportunity: {
        Args: { opportunity_request: CreateRepeatOpportunityRequest };
        Returns: CreateAccountableLeadResult;
      };
      wtos_get_marketing_accountability_dashboard: {
        Args: {
          report_request: {
            company_id: string;
            month: string;
            source_key?: AttributionSourceKey | null;
          };
        };
        Returns: MarketingAccountabilityDashboardResult;
      };
      wtos_ingest_mighty_apes_yelp: {
        Args: {
          intake_request: MightyApesYelpIntakeRequest;
        };
        Returns: MightyApesYelpIngestResult;
      };
      wtos_reconcile_customer_property: {
        Args: {
          reconciliation_request: IdentityReconciliationRequest;
        };
        Returns: IdentityReconciliationResult;
      };
      wtos_record_stripe_payment: {
        Args: {
          target_mapping_id: string;
          provider_paid_at: string;
        };
        Returns: string;
      };
      wtos_reconcile_stripe_refund: {
        Args: {
          target_refund_mapping_id: string;
          target_webhook_event_id: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
