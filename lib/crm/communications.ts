import {
  calendarSyncStatusLabel,
  emailCategoryLabel,
  emailMessageStatusLabel,
  integrationStatusLabel,
  integrationSyncLogStatusLabel,
  sanitizeIntegrationSyncLogText,
  smsMessageStatusLabel,
} from "./integrations";
import type {
  BusinessPhoneNumberRecord,
  CalendarEventSyncRecord,
  CallRecord,
  CompanyRecord,
  CommunicationProviderEventRecord,
  CrmSnapshot,
  EmailMessageRecord,
  IntegrationConnectionRecord,
  IntegrationProvider,
  IntegrationSyncLogRecord,
  JobRecord,
  LeadIntakeRecord,
  LeadPriority,
  LeadRecord,
  ScheduleEventRecord,
  ServiceType,
  SmsMessageRecord,
} from "./types";

export type CommunicationProvider =
  | "twilio"
  | "gmail"
  | "google_calendar"
  | "google_business"
  | "yelp"
  | "gohighlevel"
  | "website"
  | "internal"
  | "manual_unknown";

export type CommunicationChannel =
  | "phone_call"
  | "sms"
  | "email"
  | "website"
  | "yelp"
  | "gohighlevel"
  | "internal"
  | "calendar"
  | "google_business";

export type InboxFilter = "all" | CommunicationChannel;
export type CommunicationDirection = "inbound" | "outbound" | "internal";
export type CommunicationPriority = "critical" | "high" | "medium" | "low";
export type CommunicationResponseStatus =
  | "new"
  | "needs_response"
  | "waiting_on_customer"
  | "waiting_on_us"
  | "overdue"
  | "resolved";
export type CommunicationMatchStatus =
  | "matched_customer"
  | "matched_lead"
  | "possible_duplicate"
  | "new_contact"
  | "ambiguous_match"
  | "manual_review_required";
export type CommunicationSyncState =
  | "not_synced"
  | "queued"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict"
  | "needs_review";
export type CommunicationDeliveryState =
  | "draft"
  | "pending"
  | "sent"
  | "delivered"
  | "failed"
  | "undelivered"
  | "received"
  | "not_applicable";
export type CommunicationInboxView =
  | "needs_response"
  | "unread"
  | "assigned_to_me"
  | "unassigned"
  | "calls"
  | "texts"
  | "email"
  | "website"
  | "yelp"
  | "failed_delivery"
  | "recently_resolved"
  | "all";
export type CommunicationAttentionFilter =
  | "all"
  | "unread"
  | "missed"
  | "failed"
  | "unassigned"
  | "follow_up"
  | "archived";
export type CommunicationDateFilter = "all" | "today" | "7d" | "30d";

export type UnifiedInboxItem = {
  id: string;
  provider: CommunicationProvider;
  channel: CommunicationChannel;
  direction: CommunicationDirection;
  kind:
    | "Lead"
    | "Lead Intake"
    | "Call"
    | "Voicemail"
    | "SMS"
    | "Email"
    | "Provider Event"
    | "Integration"
    | "Calendar"
    | "Internal Note";
  companyId: string;
  leadId: string | null;
  customerId: string | null;
  propertyId?: string | null;
  jobId: string | null;
  estimateId: string | null;
  invoiceId?: string | null;
  scheduleEventId: string | null;
  businessPhoneNumberId?: string | null;
  providerEventId?: string | null;
  relatedTable: string | null;
  relatedRecordId: string | null;
  customerName: string;
  contact: string;
  phone: string | null;
  email: string | null;
  businessLocation: string;
  sourceAccount: string | null;
  sourceLabel: string;
  serviceType: string;
  summary: string;
  notes: string | null;
  participants: string[];
  attachments: string[];
  createdAt: string;
  updatedAt: string | null;
  status: string;
  priority?: CommunicationPriority;
  responseStatus?: CommunicationResponseStatus;
  matchStatus?: CommunicationMatchStatus;
  routingStatus?: string;
  deliveryState?: CommunicationDeliveryState;
  syncState?: CommunicationSyncState;
  waitingSince?: string | null;
  suggestedNextAction?: string;
  isUnread: boolean;
  isArchived: boolean;
  isFailed: boolean;
  isMissedCall: boolean;
  isUnassigned: boolean;
  followUpAt: string | null;
  assignedTo: string | null;
  failureDetail: string | null;
};

export type InboxKindFilter = "all" | UnifiedInboxItem["kind"];

export type CommunicationProviderReadiness = {
  provider: CommunicationProvider;
  label: string;
  connectionStatus: "Connected" | "Not connected";
  syncHealth: "Healthy" | "Needs attention" | "Not configured" | "Ready";
  lastSyncAt: string | null;
  lastActivityAt: string | null;
  errorState: string;
  activityCount: number;
  detail: string;
  tone: "blue" | "green" | "amber";
};

export const inboxFilters: { value: InboxFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "phone_call", label: "Calls" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Emails" },
  { value: "website", label: "Website" },
  { value: "yelp", label: "Yelp" },
  { value: "gohighlevel", label: "GoHighLevel" },
  { value: "internal", label: "Internal" },
  { value: "calendar", label: "Calendar" },
];

export const inboxKindFilters: { value: InboxKindFilter; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "Lead", label: "Leads" },
  { value: "Lead Intake", label: "Lead intake" },
  { value: "Call", label: "Calls" },
  { value: "Voicemail", label: "Voicemail" },
  { value: "SMS", label: "SMS" },
  { value: "Email", label: "Email" },
  { value: "Provider Event", label: "Provider events" },
  { value: "Integration", label: "Integrations" },
  { value: "Calendar", label: "Calendar" },
  { value: "Internal Note", label: "Internal notes" },
];

export const communicationInboxViewFilters: {
  value: CommunicationInboxView;
  label: string;
}[] = [
  { value: "needs_response", label: "Needs Response" },
  { value: "unread", label: "Unread" },
  { value: "assigned_to_me", label: "Assigned to Me" },
  { value: "unassigned", label: "Unassigned" },
  { value: "calls", label: "Calls" },
  { value: "texts", label: "Texts" },
  { value: "email", label: "Email" },
  { value: "website", label: "Website" },
  { value: "yelp", label: "Yelp" },
  { value: "failed_delivery", label: "Failed Delivery" },
  { value: "recently_resolved", label: "Recently Resolved" },
  { value: "all", label: "All Conversations" },
];

export const inboxProviderLabels: Record<CommunicationProvider, string> = {
  website: "Website",
  yelp: "Yelp",
  twilio: "Twilio",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_business: "Google Business Profile",
  gohighlevel: "GoHighLevel",
  internal: "Internal",
  manual_unknown: "Manual/unknown",
};

export const communicationChannelLabels: Record<CommunicationChannel, string> = {
  phone_call: "Call",
  sms: "SMS",
  email: "Email",
  website: "Website",
  yelp: "Yelp",
  gohighlevel: "GoHighLevel",
  internal: "Internal",
  calendar: "Calendar",
  google_business: "Google Business",
};

export const communicationAttentionFilters: {
  value: CommunicationAttentionFilter;
  label: string;
}[] = [
  { value: "all", label: "All states" },
  { value: "unread", label: "Unread/new" },
  { value: "missed", label: "Missed calls" },
  { value: "failed", label: "Failed" },
  { value: "unassigned", label: "Unassigned" },
  { value: "follow_up", label: "Follow-up due" },
  { value: "archived", label: "Archived" },
];

export const communicationDateFilters: {
  value: CommunicationDateFilter;
  label: string;
}[] = [
  { value: "all", label: "Any time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export const communicationResponseStatusLabels: Record<CommunicationResponseStatus, string> = {
  new: "New",
  needs_response: "Needs response",
  waiting_on_customer: "Waiting on customer",
  waiting_on_us: "Waiting on us",
  overdue: "Overdue",
  resolved: "Resolved",
};

export const communicationMatchStatusLabels: Record<CommunicationMatchStatus, string> = {
  matched_customer: "Matched customer",
  matched_lead: "Matched lead",
  possible_duplicate: "Possible duplicate",
  new_contact: "New contact",
  ambiguous_match: "Ambiguous match",
  manual_review_required: "Manual review required",
};

export const communicationPriorityLabels: Record<CommunicationPriority, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const communicationDeliveryStateLabels: Record<CommunicationDeliveryState, string> = {
  draft: "Draft",
  pending: "Pending",
  sent: "Sent",
  delivered: "Delivered",
  failed: "Failed",
  undelivered: "Undelivered",
  received: "Received",
  not_applicable: "Not applicable",
};

export const communicationSyncStateLabels: Record<CommunicationSyncState, string> = {
  not_synced: "Not synced",
  queued: "Queued",
  syncing: "Syncing",
  synced: "Synced",
  failed: "Failed",
  conflict: "Conflict",
  needs_review: "Needs review",
};

const serviceTypeLabels: Record<ServiceType, string> = {
  roofing: "Roofing",
  painting: "Painting",
  both: "Roofing + Painting",
};

function serviceLabel(serviceType: ServiceType) {
  return serviceTypeLabels[serviceType] ?? serviceType;
}

function statusLabel(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function scheduleEventTypeLabel(type: string) {
  return statusLabel(type);
}

function scheduleEventStatusLabel(status: string) {
  return statusLabel(status);
}

function normalizeCrmLookup(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizePhoneDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function getCustomerName(snapshot: CrmSnapshot, customerId: string | null) {
  if (!customerId) {
    return null;
  }

  return snapshot.customers.find((customer) => customer.id === customerId)?.display_name ?? null;
}

function getLeadName(snapshot: CrmSnapshot, leadId: string | null) {
  if (!leadId) {
    return null;
  }

  return snapshot.leads.find((lead) => lead.id === leadId)?.contact_name ?? null;
}

function getJobName(snapshot: CrmSnapshot, jobId: string | null) {
  if (!jobId) {
    return null;
  }

  return snapshot.jobs.find((job) => job.id === jobId)?.title ?? null;
}

function getEstimateTitle(snapshot: CrmSnapshot, estimateId: string | null) {
  if (!estimateId) {
    return null;
  }

  return snapshot.estimates.find((estimate) => estimate.id === estimateId)?.title ?? null;
}

export function getCompanyLocationLabel(
  company: CompanyRecord | undefined,
  location: string | null | undefined,
) {
  const companyName = company?.short_name ?? company?.name ?? "Business";
  const locationText = location?.trim();

  if (!locationText) {
    return companyName;
  }

  if (locationText.toLowerCase() === companyName.toLowerCase()) {
    return companyName;
  }

  return `${companyName} · ${locationText}`;
}

export function getInboxContact(
  phone: string | null | undefined,
  email: string | null | undefined,
) {
  return [phone, email].filter(Boolean).join(" · ") || "No contact provided";
}

export function getLeadMessageSummary(lead: LeadRecord) {
  const messageLine = lead.notes
    ?.split("\n")
    .find((line) => line.toLowerCase().startsWith("message:"));
  const message = messageLine?.replace(/^message:\s*/i, "").trim();

  if (message && message.toLowerCase() !== "not provided") {
    return message;
  }

  return lead.notes?.trim() || lead.property_address || "New lead created.";
}

function getInboxProviderFromText(value: string | null | undefined): CommunicationProvider {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";

  if (normalized.includes("googlebusiness") || normalized.includes("gbp")) {
    return "google_business";
  }

  if (normalized.includes("gmail") || normalized.includes("email")) {
    return "gmail";
  }

  if (normalized.includes("gohighlevel") || normalized.includes("ghl")) {
    return "gohighlevel";
  }

  if (normalized.includes("twilio") || normalized.includes("sms")) {
    return "twilio";
  }

  if (normalized.includes("yelp")) {
    return "yelp";
  }

  if (normalized.includes("website") || normalized.includes("webform")) {
    return "website";
  }

  return "manual_unknown";
}

function getInboxProviderFromLeadNotes(notes: string | null | undefined): CommunicationProvider {
  const firstLine = notes?.split("\n")[0] ?? "";
  const firstLineProvider = getInboxProviderFromText(firstLine);

  if (firstLineProvider !== "manual_unknown") {
    return firstLineProvider;
  }

  return "manual_unknown";
}

export function getLeadInboxProvider(lead: LeadRecord) {
  const sourceProvider = getInboxProviderFromText(lead.source);

  if (sourceProvider !== "manual_unknown") {
    return sourceProvider;
  }

  return getInboxProviderFromLeadNotes(lead.notes);
}

function getLeadCommunicationChannel(provider: CommunicationProvider): CommunicationChannel {
  if (provider === "website") {
    return "website";
  }

  if (provider === "yelp") {
    return "yelp";
  }

  if (provider === "twilio") {
    return "sms";
  }

  if (provider === "gmail") {
    return "email";
  }

  if (provider === "gohighlevel") {
    return "gohighlevel";
  }

  if (provider === "google_business") {
    return "google_business";
  }

  return "internal";
}

function getIntegrationCommunicationChannel(
  provider: IntegrationProvider,
): CommunicationChannel {
  if (provider === "website") {
    return "website";
  }

  if (provider === "yelp") {
    return "yelp";
  }

  if (provider === "twilio" || provider === "twilio_sms") {
    return "sms";
  }

  if (provider === "gmail") {
    return "email";
  }

  if (provider === "google_calendar") {
    return "calendar";
  }

  if (provider === "gohighlevel") {
    return "gohighlevel";
  }

  return "internal";
}

function getIntegrationInboxProvider(provider: IntegrationProvider): CommunicationProvider {
  if (provider === "website") {
    return "website";
  }

  if (provider === "yelp") {
    return "yelp";
  }

  if (provider === "twilio" || provider === "twilio_sms") {
    return "twilio";
  }

  if (provider === "gmail") {
    return "gmail";
  }

  if (provider === "google_calendar") {
    return "google_calendar";
  }

  if (provider === "gohighlevel") {
    return "gohighlevel";
  }

  return "manual_unknown";
}

function getIntegrationProviderLabel(provider: IntegrationProvider) {
  const inboxProvider = getIntegrationInboxProvider(provider);

  return inboxProviderLabels[inboxProvider];
}

function getLeadIntakeInboxProvider(provider: LeadIntakeRecord["provider"]): CommunicationProvider {
  if (provider === "website") {
    return "website";
  }

  if (provider === "yelp") {
    return "yelp";
  }

  if (provider === "twilio" || provider === "twilio_sms") {
    return "twilio";
  }

  if (provider === "gmail" || provider === "email") {
    return "gmail";
  }

  if (provider === "gohighlevel") {
    return "gohighlevel";
  }

  return "manual_unknown";
}

function getLeadIntakeChannel(provider: CommunicationProvider): CommunicationChannel {
  if (provider === "website" || provider === "yelp" || provider === "gohighlevel") {
    return provider;
  }

  if (provider === "twilio") {
    return "sms";
  }

  if (provider === "gmail") {
    return "email";
  }

  return "internal";
}

function getBusinessPhoneNumber(
  snapshot: CrmSnapshot,
  businessPhoneNumberId: string | null | undefined,
  phoneNumber: string | null | undefined,
): BusinessPhoneNumberRecord | null {
  const byId = businessPhoneNumberId
    ? snapshot.businessPhoneNumbers.find((phone) => phone.id === businessPhoneNumberId)
    : null;

  if (byId) {
    return byId;
  }

  const phoneDigits = normalizePhoneDigits(phoneNumber);

  if (!phoneDigits) {
    return null;
  }

  return (
    snapshot.businessPhoneNumbers.find(
      (phone) => normalizePhoneDigits(phone.phone_number_e164) === phoneDigits,
    ) ?? null
  );
}

function getBusinessPhoneLabel(phoneNumber: BusinessPhoneNumberRecord | null) {
  if (!phoneNumber) {
    return null;
  }

  return [
    phoneNumber.display_name,
    phoneNumber.business_location,
    phoneNumber.team_queue,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getLeadIntakeCompanyId(snapshot: CrmSnapshot, record: LeadIntakeRecord) {
  if (record.company_id) {
    return record.company_id;
  }

  const linkedCustomerCompany = record.linked_customer_id
    ? snapshot.customers.find((customer) => customer.id === record.linked_customer_id)?.company_id
    : null;

  if (linkedCustomerCompany) {
    return linkedCustomerCompany;
  }

  const linkedLeadCompany = record.linked_lead_id
    ? snapshot.leads.find((lead) => lead.id === record.linked_lead_id)?.company_id
    : null;

  if (linkedLeadCompany) {
    return linkedLeadCompany;
  }

  if (record.company_key === "ihc_painting") {
    return snapshot.companies.find((company) => company.trade === "painting")?.id ?? "";
  }

  if (record.company_key === "weathertech_roofing") {
    return snapshot.companies.find((company) => company.trade === "roofing")?.id ?? "";
  }

  return "";
}

function getProviderEventCompanyId(
  snapshot: CrmSnapshot,
  event: CommunicationProviderEventRecord | CallRecord,
  businessPhoneNumber: BusinessPhoneNumberRecord | null,
) {
  if (event.company_id) {
    return event.company_id;
  }

  if (businessPhoneNumber?.company_id) {
    return businessPhoneNumber.company_id;
  }

  const linkedCustomerCompany = event.customer_id
    ? snapshot.customers.find((customer) => customer.id === event.customer_id)?.company_id
    : null;

  if (linkedCustomerCompany) {
    return linkedCustomerCompany;
  }

  const linkedLeadCompany = event.lead_id
    ? snapshot.leads.find((lead) => lead.id === event.lead_id)?.company_id
    : null;

  if (linkedLeadCompany) {
    return linkedLeadCompany;
  }

  const linkedJobCompany = event.job_id
    ? snapshot.jobs.find((job) => job.id === event.job_id)?.company_id
    : null;

  return linkedJobCompany ?? "";
}

function findCustomerContactMatch(
  snapshot: CrmSnapshot,
  phone: string | null | undefined,
  email: string | null | undefined,
) {
  const phoneDigits = normalizePhoneDigits(phone);
  const emailKey = normalizeCrmLookup(email);

  return (
    snapshot.customers.find((customer) => {
      const matchesPhone =
        phoneDigits.length >= 7 && normalizePhoneDigits(customer.phone).endsWith(phoneDigits.slice(-7));
      const matchesEmail = Boolean(emailKey && normalizeCrmLookup(customer.email) === emailKey);

      return matchesPhone || matchesEmail;
    }) ?? null
  );
}

function findLeadContactMatch(
  snapshot: CrmSnapshot,
  phone: string | null | undefined,
  email: string | null | undefined,
) {
  const phoneDigits = normalizePhoneDigits(phone);
  const emailKey = normalizeCrmLookup(email);

  return (
    snapshot.leads.find((lead) => {
      const matchesPhone =
        phoneDigits.length >= 7 && normalizePhoneDigits(lead.phone).endsWith(phoneDigits.slice(-7));
      const matchesEmail = Boolean(emailKey && normalizeCrmLookup(lead.email) === emailKey);

      return matchesPhone || matchesEmail;
    }) ?? null
  );
}

function getCustomerPrimaryPropertyId(
  snapshot: CrmSnapshot,
  customerId: string | null | undefined,
) {
  if (!customerId) {
    return null;
  }

  return (
    snapshot.properties.find(
      (property) => property.customer_id === customerId && property.is_primary,
    )?.id ??
    snapshot.properties.find((property) => property.customer_id === customerId)?.id ??
    null
  );
}

function mapLeadPriorityToCommunicationPriority(priority: LeadPriority): CommunicationPriority {
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

function getLeadIntakeMatchStatus(record: LeadIntakeRecord): CommunicationMatchStatus {
  if (record.linked_customer_id) {
    return "matched_customer";
  }

  if (record.linked_lead_id) {
    return "matched_lead";
  }

  if (record.routing_status === "needs_review") {
    return "manual_review_required";
  }

  if (record.routing_status === "unassigned") {
    return "ambiguous_match";
  }

  if (
    record.duplicate_confidence === "exact_match" ||
    record.duplicate_confidence === "likely_match" ||
    record.duplicate_confidence === "possible_match"
  ) {
    return "possible_duplicate";
  }

  return "new_contact";
}

function getProviderEventMatchStatus(
  event: CommunicationProviderEventRecord | CallRecord,
): CommunicationMatchStatus {
  if (event.customer_id) {
    return "matched_customer";
  }

  if (event.lead_id) {
    return "matched_lead";
  }

  if (event.routing_status === "needs_review" || event.routing_status === "migration_required") {
    return "manual_review_required";
  }

  if (event.routing_status === "unassigned") {
    return "ambiguous_match";
  }

  return "new_contact";
}

function getLeadIntakeResponseStatus(record: LeadIntakeRecord): CommunicationResponseStatus {
  if (record.status === "dismissed" || record.status === "non_lead") {
    return "resolved";
  }

  if (record.follow_up_state === "completed") {
    return "resolved";
  }

  if (record.follow_up_state === "required" || record.status === "new") {
    return record.intake_timestamp &&
      Date.now() - Date.parse(record.intake_timestamp) > 24 * 60 * 60 * 1000
      ? "overdue"
      : "needs_response";
  }

  if (record.status === "needs_review" || record.routing_status !== "ready_to_create") {
    return "waiting_on_us";
  }

  return "new";
}

function getCallResponseStatus(record: CallRecord): CommunicationResponseStatus {
  if (record.follow_up_required || record.call_status === "missed" || record.call_status === "voicemail") {
    return record.started_at &&
      Date.now() - Date.parse(record.started_at) > 24 * 60 * 60 * 1000
      ? "overdue"
      : "needs_response";
  }

  if (record.call_status === "failed" || record.routing_status !== "matched") {
    return "waiting_on_us";
  }

  return "resolved";
}

function getProviderEventResponseStatus(
  event: CommunicationProviderEventRecord,
): CommunicationResponseStatus {
  const normalizedStatus = event.status.toLowerCase();

  if (event.error_message || normalizedStatus.includes("failed") || normalizedStatus.includes("undelivered")) {
    return "waiting_on_us";
  }

  if (event.routing_status !== "matched") {
    return "needs_response";
  }

  if (event.direction === "inbound") {
    return "needs_response";
  }

  return "resolved";
}

function getSmsDeliveryState(message: SmsMessageRecord): CommunicationDeliveryState {
  if (message.delivery_status === "undelivered" || message.delivery_status === "failed") {
    return message.delivery_status;
  }

  if (message.delivery_status === "received") {
    return "received";
  }

  if (message.delivery_status === "delivered") {
    return "delivered";
  }

  if (message.delivery_status === "sent" || message.status === "sent") {
    return "sent";
  }

  if (message.status === "draft") {
    return "draft";
  }

  if (message.status === "queued" || message.delivery_status === "queued" || message.delivery_status === "sending") {
    return "pending";
  }

  if (message.status === "failed") {
    return "failed";
  }

  return "not_applicable";
}

function getEmailDeliveryState(message: EmailMessageRecord): CommunicationDeliveryState {
  if (message.direction === "inbound") {
    return message.status === "failed" ? "failed" : "received";
  }

  if (message.status === "draft") {
    return "draft";
  }

  if (message.status === "queued") {
    return "pending";
  }

  if (message.status === "failed") {
    return "failed";
  }

  return "sent";
}

function getSyncStateFromIntegrationStatus(status: IntegrationSyncLogRecord["status"]): CommunicationSyncState {
  if (status === "succeeded") {
    return "synced";
  }

  if (status === "queued" || status === "running" || status === "retrying") {
    return "queued";
  }

  if (status === "failed") {
    return "failed";
  }

  return "not_synced";
}

function getProviderEventDeliveryState(
  event: CommunicationProviderEventRecord,
): CommunicationDeliveryState {
  const normalizedStatus = event.status.toLowerCase();

  if (normalizedStatus.includes("undelivered")) {
    return "undelivered";
  }

  if (normalizedStatus.includes("failed")) {
    return "failed";
  }

  if (normalizedStatus.includes("delivered")) {
    return "delivered";
  }

  if (event.direction === "inbound") {
    return "received";
  }

  if (normalizedStatus.includes("sent")) {
    return "sent";
  }

  return "pending";
}

function getSuggestedNextAction(item: {
  channel: CommunicationChannel;
  isFailed?: boolean;
  isMissedCall?: boolean;
  isUnassigned?: boolean;
  responseStatus?: CommunicationResponseStatus;
  matchStatus?: CommunicationMatchStatus;
}) {
  if (item.isFailed) {
    return "Review delivery failure before contacting the customer again";
  }

  if (item.matchStatus === "possible_duplicate") {
    return "Review possible duplicate before creating another record";
  }

  if (item.matchStatus === "ambiguous_match" || item.matchStatus === "manual_review_required") {
    return "Review routing and link the correct CRM record";
  }

  if (item.isMissedCall) {
    return "Call back or assign the office follow-up";
  }

  if (item.isUnassigned) {
    return "Assign an owner and link the correct customer or lead";
  }

  if (item.responseStatus === "overdue") {
    return "Respond today or mark the conversation resolved";
  }

  if (item.responseStatus === "needs_response") {
    if (item.channel === "website" || item.channel === "yelp") {
      return "Qualify the inquiry and confirm the next step";
    }

    return "Respond or create a follow-up using the existing workflow";
  }

  return "Open the related CRM record for context";
}

function getSmsDirection(message: SmsMessageRecord): CommunicationDirection {
  if (message.direction === "inbound") {
    return "inbound";
  }

  if (message.direction === "outbound") {
    return "outbound";
  }

  if (message.status === "draft" || message.status === "queued") {
    return "outbound";
  }

  if (message.twilio_message_sid && message.from_phone && !message.customer_id && !message.lead_id) {
    return "inbound";
  }

  return "outbound";
}

function getSmsTarget(snapshot: CrmSnapshot, message: SmsMessageRecord) {
  const lead = message.lead_id
    ? snapshot.leads.find((item) => item.id === message.lead_id)
    : null;
  const customer = message.customer_id
    ? snapshot.customers.find((item) => item.id === message.customer_id)
    : null;
  const job = message.job_id
    ? snapshot.jobs.find((item) => item.id === message.job_id)
    : null;
  const isLikelyInbound = getSmsDirection(message) === "inbound";

  return {
    lead,
    customer,
    job,
    name:
      lead?.contact_name ??
      customer?.display_name ??
      customer?.contact_name ??
      job?.title ??
      (isLikelyInbound ? message.from_phone : message.to_phone) ??
      "Unknown SMS contact",
    serviceType: lead
      ? serviceLabel(lead.service_type)
      : job
        ? serviceLabel(job.service_type)
        : "General",
    location: lead?.city ?? customer?.city ?? lead?.property_address ?? job?.property_address ?? null,
  };
}

function getEmailTarget(snapshot: CrmSnapshot, message: EmailMessageRecord) {
  const customer = message.customer_id
    ? snapshot.customers.find((item) => item.id === message.customer_id)
    : null;
  const lead = message.lead_id
    ? snapshot.leads.find((item) => item.id === message.lead_id)
    : null;
  const job = message.job_id
    ? snapshot.jobs.find((item) => item.id === message.job_id)
    : null;
  const estimateTitle = getEstimateTitle(snapshot, message.estimate_id);

  return {
    name:
      customer?.display_name ??
      customer?.contact_name ??
      lead?.contact_name ??
      job?.title ??
      estimateTitle ??
      message.to_email,
    location:
      customer?.city ??
      customer?.property_address ??
      lead?.city ??
      lead?.property_address ??
      job?.property_address ??
      null,
  };
}

function getIntegrationLogLead(snapshot: CrmSnapshot, log: IntegrationSyncLogRecord) {
  return log.related_table === "leads" && log.related_record_id
    ? snapshot.leads.find((lead) => lead.id === log.related_record_id)
    : null;
}

function getScheduleTarget(snapshot: CrmSnapshot, event: ScheduleEventRecord) {
  const customer = event.customer_id
    ? snapshot.customers.find((item) => item.id === event.customer_id)
    : null;
  const lead = event.lead_id ? snapshot.leads.find((item) => item.id === event.lead_id) : null;
  const job = event.job_id ? snapshot.jobs.find((item) => item.id === event.job_id) : null;

  return {
    customer,
    lead,
    job,
    name: customer?.display_name ?? lead?.contact_name ?? job?.title ?? event.title,
    phone: customer?.phone ?? lead?.phone ?? null,
    email: customer?.email ?? lead?.email ?? null,
    location: event.location ?? customer?.property_address ?? lead?.property_address ?? job?.property_address ?? null,
  };
}

function getCalendarSyncEvent(snapshot: CrmSnapshot, sync: CalendarEventSyncRecord) {
  return snapshot.scheduleEvents.find((event) => event.id === sync.schedule_event_id) ?? null;
}

function getJobNoteTarget(snapshot: CrmSnapshot, job: JobRecord | undefined) {
  const customer = job?.customer_id
    ? snapshot.customers.find((item) => item.id === job.customer_id)
    : null;
  const lead = job?.lead_id ? snapshot.leads.find((item) => item.id === job.lead_id) : null;

  return {
    customer,
    lead,
    name: customer?.display_name ?? lead?.contact_name ?? job?.title ?? "Job note",
    phone: customer?.phone ?? lead?.phone ?? null,
    email: customer?.email ?? lead?.email ?? null,
    location: customer?.property_address ?? lead?.property_address ?? job?.property_address ?? null,
  };
}

function compactParticipants(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

function compactAttachments(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))));
}

export function communicationItemIsFollowUpDue(item: UnifiedInboxItem) {
  return Boolean(item.followUpAt && Date.parse(item.followUpAt) <= Date.now());
}

export function getCommunicationResponseStatus(item: UnifiedInboxItem): CommunicationResponseStatus {
  if (item.responseStatus) {
    return item.responseStatus;
  }

  if (item.isFailed) {
    return "waiting_on_us";
  }

  if (item.isMissedCall || item.isUnread || communicationItemIsFollowUpDue(item)) {
    return "needs_response";
  }

  if (item.isArchived) {
    return "resolved";
  }

  return "resolved";
}

export function getCommunicationPriority(item: UnifiedInboxItem): CommunicationPriority {
  if (item.priority) {
    return item.priority;
  }

  if (item.isFailed || item.isMissedCall) {
    return "high";
  }

  if (item.isUnread || communicationItemIsFollowUpDue(item) || item.isUnassigned) {
    return "medium";
  }

  return "low";
}

export function getCommunicationMatchStatus(item: UnifiedInboxItem): CommunicationMatchStatus {
  if (item.matchStatus) {
    return item.matchStatus;
  }

  if (item.customerId) {
    return "matched_customer";
  }

  if (item.leadId) {
    return "matched_lead";
  }

  return item.isUnassigned ? "manual_review_required" : "new_contact";
}

export function getCommunicationWaitingLabel(item: UnifiedInboxItem) {
  const startedAt = item.waitingSince ?? item.followUpAt ?? item.createdAt;
  const startedTime = Date.parse(startedAt);

  if (!Number.isFinite(startedTime)) {
    return "Waiting time unavailable";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - startedTime) / 60000));

  if (minutes < 60) {
    return `${minutes || 1}m waiting`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours}h waiting`;
  }

  return `${Math.floor(hours / 24)}d waiting`;
}

export function communicationItemMatchesInboxView(
  item: UnifiedInboxItem,
  view: CommunicationInboxView,
) {
  const responseStatus = getCommunicationResponseStatus(item);

  if (view === "needs_response") {
    return (
      responseStatus === "needs_response" ||
      responseStatus === "overdue" ||
      responseStatus === "waiting_on_us" ||
      item.isFailed ||
      item.isMissedCall ||
      item.isUnassigned
    );
  }

  if (view === "unread") {
    return item.isUnread;
  }

  if (view === "assigned_to_me") {
    return Boolean(item.assignedTo);
  }

  if (view === "unassigned") {
    return item.isUnassigned;
  }

  if (view === "calls") {
    return item.channel === "phone_call";
  }

  if (view === "texts") {
    return item.channel === "sms";
  }

  if (view === "email") {
    return item.channel === "email";
  }

  if (view === "website") {
    return item.channel === "website" || item.provider === "website";
  }

  if (view === "yelp") {
    return item.channel === "yelp" || item.provider === "yelp";
  }

  if (view === "failed_delivery") {
    return item.isFailed || item.deliveryState === "failed" || item.deliveryState === "undelivered";
  }

  if (view === "recently_resolved") {
    return responseStatus === "resolved" || item.isArchived;
  }

  return true;
}

export function communicationItemMatchesDateFilter(
  item: UnifiedInboxItem,
  dateFilter: CommunicationDateFilter,
) {
  if (dateFilter === "all") {
    return true;
  }

  const itemTime = Date.parse(item.createdAt);

  if (!Number.isFinite(itemTime)) {
    return false;
  }

  const now = new Date();

  if (dateFilter === "today") {
    return new Date(itemTime).toDateString() === now.toDateString();
  }

  const days = dateFilter === "7d" ? 7 : 30;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  return itemTime >= cutoff;
}

export function communicationItemMatchesAttentionFilter(
  item: UnifiedInboxItem,
  attentionFilter: CommunicationAttentionFilter,
) {
  if (attentionFilter === "all") {
    return true;
  }

  if (attentionFilter === "unread") {
    return item.isUnread;
  }

  if (attentionFilter === "missed") {
    return item.isMissedCall;
  }

  if (attentionFilter === "failed") {
    return item.isFailed;
  }

  if (attentionFilter === "unassigned") {
    return item.isUnassigned;
  }

  if (attentionFilter === "follow_up") {
    return communicationItemIsFollowUpDue(item);
  }

  return item.isArchived;
}

export function getInboxProviderTone(provider: CommunicationProvider) {
  return provider === "website" || provider === "yelp"
    ? "green"
    : provider === "manual_unknown" || provider === "internal"
      ? "amber"
      : "blue";
}

export function getCommunicationChannelTone(channel: CommunicationChannel) {
  return channel === "website" || channel === "yelp"
    ? "green"
    : channel === "internal" || channel === "gohighlevel" || channel === "calendar"
      ? "amber"
      : "blue";
}

export function getCommunicationDirectionLabel(direction: CommunicationDirection) {
  const labels: Record<CommunicationDirection, string> = {
    inbound: "Inbound",
    outbound: "Outbound",
    internal: "Internal",
  };

  return labels[direction];
}

export function getCommunicationStatusTone(item: UnifiedInboxItem) {
  if (item.isFailed || item.isUnassigned || item.isMissedCall) {
    return "amber";
  }

  if (
    item.status.toLowerCase().includes("sent") ||
    item.status.toLowerCase().includes("synced") ||
    item.status.toLowerCase().includes("succeeded")
  ) {
    return "green";
  }

  return "blue";
}

export function buildUnifiedInboxItems(
  snapshot: CrmSnapshot,
  companyMap: Map<string, CompanyRecord>,
) {
  const leadIntakeItems: UnifiedInboxItem[] = snapshot.leadIntakeRecords.map((record) => {
    const provider = getLeadIntakeInboxProvider(record.provider);
    const channel = getLeadIntakeChannel(provider);
    const companyId = getLeadIntakeCompanyId(snapshot, record);
    const customer =
      (record.linked_customer_id
        ? snapshot.customers.find((item) => item.id === record.linked_customer_id)
        : null) ?? findCustomerContactMatch(snapshot, record.phone, record.email);
    const lead =
      (record.linked_lead_id
        ? snapshot.leads.find((item) => item.id === record.linked_lead_id)
        : null) ?? (!customer ? findLeadContactMatch(snapshot, record.phone, record.email) : null);
    const responseStatus = getLeadIntakeResponseStatus(record);
    const matchStatus = getLeadIntakeMatchStatus(record);
    const company = companyMap.get(companyId);
    const location = record.source_detail ?? record.city ?? record.service_address ?? record.branch_key;
    const failed =
      record.status === "needs_review" ||
      record.routing_status === "needs_review" ||
      record.routing_status === "unassigned";

    return {
      id: `lead-intake-${record.id}`,
      provider,
      channel,
      direction: "inbound",
      kind: "Lead Intake",
      companyId,
      leadId: record.linked_lead_id ?? lead?.id ?? null,
      customerId: record.linked_customer_id ?? customer?.id ?? null,
      propertyId: null,
      jobId: null,
      estimateId: null,
      invoiceId: null,
      scheduleEventId: null,
      businessPhoneNumberId: null,
      providerEventId: record.related_communication_event_id,
      relatedTable: "lead_intake_records",
      relatedRecordId: record.id,
      customerName: customer?.display_name ?? lead?.contact_name ?? record.contact_name,
      contact: getInboxContact(record.phone, record.email),
      phone: record.phone,
      email: record.email,
      businessLocation: getCompanyLocationLabel(company, location),
      sourceAccount: record.source_detail ?? record.campaign ?? record.provider_event_id,
      sourceLabel: inboxProviderLabels[provider],
      serviceType: record.requested_service ? serviceLabel(record.requested_service) : "Lead intake",
      summary:
        record.message ??
        record.service_address ??
        record.requested_service ??
        "New lead intake record.",
      notes: record.review_notes ?? record.message,
      participants: compactParticipants([
        record.contact_name,
        record.company_name,
        record.phone,
        record.email,
      ]),
      attachments: compactAttachments([
        record.safe_raw_source_reference,
        record.campaign,
        record.provider_event_id,
      ]),
      createdAt: record.intake_timestamp ?? record.created_at,
      updatedAt: record.updated_at,
      status: statusLabel(record.status),
      priority: mapLeadPriorityToCommunicationPriority(record.urgency),
      responseStatus,
      matchStatus,
      routingStatus: statusLabel(record.routing_status),
      deliveryState: "received",
      syncState:
        record.status === "lead_created" || record.linked_lead_id
          ? "synced"
          : record.status === "needs_review"
            ? "needs_review"
            : "queued",
      waitingSince: responseStatus === "resolved" ? null : record.intake_timestamp,
      suggestedNextAction: getSuggestedNextAction({
        channel,
        isFailed: failed,
        isUnassigned: record.routing_status === "unassigned",
        responseStatus,
        matchStatus,
      }),
      isUnread: responseStatus === "new" || responseStatus === "needs_response",
      isArchived: record.status === "dismissed" || record.status === "non_lead",
      isFailed: failed,
      isMissedCall: false,
      isUnassigned: record.routing_status === "unassigned" || !record.assigned_user_id,
      followUpAt:
        record.follow_up_state === "required" || record.follow_up_state === "scheduled"
          ? record.intake_timestamp
          : null,
      assignedTo: record.assigned_user_id ?? record.assigned_queue,
      failureDetail: failed ? record.review_notes ?? "Lead intake requires routing review." : null,
    };
  });

  const callItems: UnifiedInboxItem[] = snapshot.callRecords.map((record) => {
    const businessPhoneNumber = getBusinessPhoneNumber(
      snapshot,
      record.business_phone_number_id,
      record.business_phone,
    );
    const contactPhone =
      record.customer_phone ??
      (record.direction === "inbound" ? record.from_phone : record.to_phone) ??
      record.from_phone ??
      record.to_phone;
    const customer =
      (record.customer_id
        ? snapshot.customers.find((item) => item.id === record.customer_id)
        : null) ?? findCustomerContactMatch(snapshot, contactPhone, null);
    const lead =
      (record.lead_id ? snapshot.leads.find((item) => item.id === record.lead_id) : null) ??
      (!customer ? findLeadContactMatch(snapshot, contactPhone, null) : null);
    const job = record.job_id ? snapshot.jobs.find((item) => item.id === record.job_id) : null;
    const companyId = getProviderEventCompanyId(snapshot, record, businessPhoneNumber);
    const responseStatus = getCallResponseStatus(record);
    const matchStatus = getProviderEventMatchStatus(record);
    const isMissedCall =
      record.call_status === "missed" || record.call_status === "voicemail";
    const failed = record.call_status === "failed";
    const sourceAccount = getBusinessPhoneLabel(businessPhoneNumber) ?? record.business_phone;

    return {
      id: `call-${record.id}`,
      provider: "twilio",
      channel: "phone_call",
      direction: record.direction,
      kind: record.call_status === "voicemail" ? "Voicemail" : "Call",
      companyId,
      leadId: record.lead_id ?? lead?.id ?? null,
      customerId: record.customer_id ?? customer?.id ?? null,
      propertyId:
        getCustomerPrimaryPropertyId(snapshot, customer?.id) ??
        lead?.property_id ??
        job?.property_id ??
        null,
      jobId: record.job_id,
      estimateId: null,
      invoiceId: null,
      scheduleEventId: null,
      businessPhoneNumberId: record.business_phone_number_id,
      providerEventId: null,
      relatedTable: "call_records",
      relatedRecordId: record.id,
      customerName:
        customer?.display_name ??
        lead?.contact_name ??
        contactPhone ??
        (record.direction === "inbound" ? "Unknown caller" : "Outbound call"),
      contact: getInboxContact(contactPhone, null),
      phone: contactPhone,
      email: null,
      businessLocation: getCompanyLocationLabel(
        companyMap.get(companyId),
        businessPhoneNumber?.business_location ?? job?.property_address,
      ),
      sourceAccount,
      sourceLabel: "Twilio",
      serviceType: job ? serviceLabel(job.service_type) : lead ? serviceLabel(lead.service_type) : "Call",
      summary:
        record.call_status === "voicemail"
          ? "New voicemail requires office follow-up."
          : record.call_status === "missed"
            ? "Missed customer call requires follow-up."
            : `${statusLabel(record.call_status)} call${
                record.duration_seconds ? ` · ${Math.round(record.duration_seconds / 60)} min` : ""
              }.`,
      notes: record.recording_status
        ? `Recording ${statusLabel(record.recording_status)} · transcript ${statusLabel(record.transcript_status ?? "not_requested")}`
        : null,
      participants: compactParticipants([
        contactPhone,
        record.business_phone,
        businessPhoneNumber?.display_name,
        customer?.display_name,
        lead?.contact_name,
      ]),
      attachments: compactAttachments([
        record.recording_sid ? `Recording: ${record.recording_sid}` : null,
        record.provider_call_sid,
      ]),
      createdAt: record.started_at ?? record.created_at,
      updatedAt: record.updated_at,
      status: statusLabel(record.call_status),
      priority: isMissedCall || record.follow_up_required ? "high" : failed ? "high" : "low",
      responseStatus,
      matchStatus,
      routingStatus: statusLabel(record.routing_status),
      deliveryState: record.direction === "inbound" ? "received" : "sent",
      syncState: failed ? "failed" : record.routing_status === "matched" ? "synced" : "needs_review",
      waitingSince: responseStatus === "resolved" ? null : record.started_at ?? record.created_at,
      suggestedNextAction: getSuggestedNextAction({
        channel: "phone_call",
        isFailed: failed,
        isMissedCall,
        isUnassigned: record.routing_status !== "matched" && !record.customer_id && !record.lead_id,
        responseStatus,
        matchStatus,
      }),
      isUnread: isMissedCall || record.follow_up_required,
      isArchived: false,
      isFailed: failed,
      isMissedCall,
      isUnassigned: record.routing_status !== "matched" || (!record.customer_id && !record.lead_id),
      followUpAt:
        record.follow_up_required || isMissedCall ? record.ended_at ?? record.started_at ?? record.created_at : null,
      assignedTo: businessPhoneNumber?.team_queue ?? null,
      failureDetail: failed ? "Call provider reported a failed call." : null,
    };
  });

  const providerEventItems: UnifiedInboxItem[] = snapshot.communicationProviderEvents
    .filter((event) => {
      const normalizedStatus = event.status.toLowerCase();

      return (
        !event.sms_message_id ||
        event.error_message ||
        event.routing_status !== "matched" ||
        normalizedStatus.includes("failed") ||
        normalizedStatus.includes("undelivered")
      );
    })
    .map((event) => {
      const businessPhoneNumber = getBusinessPhoneNumber(
        snapshot,
        event.business_phone_number_id,
        event.business_phone,
      );
      const contactPhone =
        event.customer_phone ??
        (event.direction === "inbound" ? event.from_phone : event.to_phone) ??
        event.from_phone ??
        event.to_phone;
      const customer =
        (event.customer_id
          ? snapshot.customers.find((item) => item.id === event.customer_id)
          : null) ?? findCustomerContactMatch(snapshot, contactPhone, null);
      const lead =
        (event.lead_id ? snapshot.leads.find((item) => item.id === event.lead_id) : null) ??
        (!customer ? findLeadContactMatch(snapshot, contactPhone, null) : null);
      const job = event.job_id ? snapshot.jobs.find((item) => item.id === event.job_id) : null;
      const companyId = getProviderEventCompanyId(snapshot, event, businessPhoneNumber);
      const channel: CommunicationChannel = event.channel === "voice" ? "phone_call" : "sms";
      const failed = Boolean(
        event.error_message ||
          event.status.toLowerCase().includes("failed") ||
          event.status.toLowerCase().includes("undelivered"),
      );
      const responseStatus = getProviderEventResponseStatus(event);
      const matchStatus = getProviderEventMatchStatus(event);
      const sourceAccount = getBusinessPhoneLabel(businessPhoneNumber) ?? event.business_phone;

      return {
        id: `provider-event-${event.id}`,
        provider: "twilio",
        channel,
        direction: event.direction,
        kind: "Provider Event",
        companyId,
        leadId: event.lead_id ?? lead?.id ?? null,
        customerId: event.customer_id ?? customer?.id ?? null,
        propertyId:
          getCustomerPrimaryPropertyId(snapshot, customer?.id) ??
          lead?.property_id ??
          job?.property_id ??
          null,
        jobId: event.job_id,
        estimateId: null,
        invoiceId: null,
        scheduleEventId: null,
        businessPhoneNumberId: event.business_phone_number_id,
        providerEventId: event.id,
        relatedTable: "communication_provider_events",
        relatedRecordId: event.id,
        customerName: customer?.display_name ?? lead?.contact_name ?? contactPhone ?? "Provider event",
        contact: getInboxContact(contactPhone, null),
        phone: contactPhone,
        email: null,
        businessLocation: getCompanyLocationLabel(
          companyMap.get(companyId),
          businessPhoneNumber?.business_location ?? job?.property_address,
        ),
        sourceAccount,
        sourceLabel: "Twilio",
        serviceType: statusLabel(event.event_type),
        summary:
          sanitizeIntegrationSyncLogText(event.error_message) ??
          `${statusLabel(event.event_type)} is ${statusLabel(event.status).toLowerCase()}.`,
        notes: sanitizeIntegrationSyncLogText(event.error_message),
        participants: compactParticipants([
          contactPhone,
          event.business_phone,
          businessPhoneNumber?.display_name,
          customer?.display_name,
          lead?.contact_name,
        ]),
        attachments: compactAttachments([
          event.provider_event_sid,
          event.provider_parent_sid,
          event.request_fingerprint,
        ]),
        createdAt: event.occurred_at ?? event.received_at ?? event.created_at,
        updatedAt: event.updated_at,
        status: statusLabel(event.status),
        priority: failed || event.routing_status !== "matched" ? "high" : "medium",
        responseStatus,
        matchStatus,
        routingStatus: statusLabel(event.routing_status),
        deliveryState: getProviderEventDeliveryState(event),
        syncState: failed ? "failed" : event.routing_status === "matched" ? "synced" : "needs_review",
        waitingSince: responseStatus === "resolved" ? null : event.occurred_at ?? event.received_at,
        suggestedNextAction: getSuggestedNextAction({
          channel,
          isFailed: failed,
          isUnassigned: event.routing_status !== "matched" && !event.customer_id && !event.lead_id,
          responseStatus,
          matchStatus,
        }),
        isUnread: event.direction === "inbound" || responseStatus === "needs_response",
        isArchived: false,
        isFailed: failed,
        isMissedCall: event.channel === "voice" && event.direction === "inbound",
        isUnassigned: event.routing_status !== "matched" || (!event.customer_id && !event.lead_id),
        followUpAt: responseStatus === "needs_response" || responseStatus === "overdue"
          ? event.occurred_at ?? event.received_at
          : null,
        assignedTo: businessPhoneNumber?.team_queue ?? null,
        failureDetail: sanitizeIntegrationSyncLogText(event.error_message),
      };
    });

  const leadItems: UnifiedInboxItem[] = snapshot.leads.map((lead) => {
    const company = companyMap.get(lead.company_id);
    const provider = getLeadInboxProvider(lead);
    const channel = getLeadCommunicationChannel(provider);
    const followUpAt = lead.next_follow_up;

    return {
      id: `lead-${lead.id}`,
      provider,
      channel,
      direction: "inbound",
      kind: "Lead",
      companyId: lead.company_id,
      leadId: lead.id,
      customerId: lead.customer_id,
      jobId: null,
      estimateId: null,
      scheduleEventId: null,
      relatedTable: "leads",
      relatedRecordId: lead.id,
      customerName: lead.contact_name,
      contact: getInboxContact(lead.phone, lead.email),
      phone: lead.phone,
      email: lead.email,
      businessLocation: getCompanyLocationLabel(company, lead.city || lead.property_address),
      sourceAccount: lead.city || lead.source,
      sourceLabel: inboxProviderLabels[provider],
      serviceType: serviceLabel(lead.service_type),
      summary: getLeadMessageSummary(lead),
      notes: lead.notes,
      participants: compactParticipants([lead.contact_name, lead.phone, lead.email]),
      attachments: [],
      createdAt: lead.created_at,
      updatedAt: lead.updated_at,
      status: statusLabel(lead.status),
      priority: mapLeadPriorityToCommunicationPriority(lead.priority),
      responseStatus: lead.status === "won" || lead.status === "lost" ? "resolved" : "needs_response",
      matchStatus: lead.customer_id ? "matched_customer" : "matched_lead",
      routingStatus: "Matched",
      deliveryState: "received",
      syncState: "synced",
      waitingSince: lead.next_follow_up ?? lead.created_at,
      suggestedNextAction: lead.customer_id
        ? "Open the customer record or create the next estimate"
        : "Qualify the lead and assign the next follow-up",
      isUnread: lead.status === "new" || lead.pipeline_stage === "new_lead",
      isArchived: false,
      isFailed: false,
      isMissedCall: false,
      isUnassigned: !lead.created_by,
      followUpAt,
      assignedTo: lead.created_by,
      failureDetail: null,
    };
  });

  const smsItems: UnifiedInboxItem[] = snapshot.smsMessages.map((message) => {
    const target = getSmsTarget(snapshot, message);
    const direction = getSmsDirection(message);
    const contactPhone = direction === "inbound" ? message.from_phone : message.to_phone;

    return {
      id: `sms-${message.id}`,
      provider: "twilio",
      channel: "sms",
      direction,
      kind: "SMS",
      companyId: message.company_id,
      leadId: message.lead_id,
      customerId: message.customer_id,
      jobId: message.job_id,
      estimateId: null,
      scheduleEventId: message.schedule_event_id,
      relatedTable: "sms_messages",
      relatedRecordId: message.id,
      customerName: target.name,
      contact: contactPhone ?? message.to_phone,
      phone: contactPhone ?? message.to_phone,
      email: null,
      businessLocation: getCompanyLocationLabel(companyMap.get(message.company_id), target.location),
      sourceAccount: message.from_phone,
      sourceLabel: "Twilio",
      serviceType: target.serviceType,
      summary: message.body,
      notes: message.last_error,
      participants: compactParticipants([message.from_phone, message.to_phone, target.name]),
      attachments: [],
      createdAt: message.sent_at ?? message.queued_at ?? message.created_at,
      updatedAt: message.updated_at,
      status: smsMessageStatusLabel(message.status),
      priority: message.status === "failed" || message.delivery_status === "undelivered" ? "high" : direction === "inbound" ? "medium" : "low",
      responseStatus:
        message.status === "failed" || message.delivery_status === "undelivered"
          ? "waiting_on_us"
          : direction === "inbound"
            ? "needs_response"
            : "resolved",
      matchStatus: message.customer_id ? "matched_customer" : message.lead_id ? "matched_lead" : "manual_review_required",
      routingStatus: message.customer_id || message.lead_id ? "Matched" : "Needs review",
      deliveryState: getSmsDeliveryState(message),
      syncState: message.status === "failed" ? "failed" : message.twilio_message_sid ? "synced" : "queued",
      waitingSince: direction === "inbound" ? message.sent_at ?? message.created_at : null,
      suggestedNextAction: getSuggestedNextAction({
        channel: "sms",
        isFailed: message.status === "failed" || message.delivery_status === "undelivered",
        isUnassigned: !message.customer_id && !message.lead_id,
        responseStatus:
          message.status === "failed" || message.delivery_status === "undelivered"
            ? "waiting_on_us"
            : direction === "inbound"
              ? "needs_response"
              : "resolved",
        matchStatus: message.customer_id ? "matched_customer" : message.lead_id ? "matched_lead" : "manual_review_required",
      }),
      isUnread: direction === "inbound",
      isArchived: false,
      isFailed: message.status === "failed" || message.delivery_status === "failed" || message.delivery_status === "undelivered",
      isMissedCall: false,
      isUnassigned: !message.customer_id && !message.lead_id,
      followUpAt: null,
      assignedTo: null,
      failureDetail: sanitizeIntegrationSyncLogText(message.last_error),
    };
  });

  const emailItems: UnifiedInboxItem[] = snapshot.emailMessages.map((message) => {
    const target = getEmailTarget(snapshot, message);
    const direction = message.direction ?? "outbound";
    const primaryContact =
      direction === "inbound"
        ? message.from_email ?? message.to_email
        : message.to_email;

    return {
      id: `email-${message.id}`,
      provider: "gmail",
      channel: "email",
      direction,
      kind: "Email",
      companyId: message.company_id,
      leadId: message.lead_id ?? null,
      customerId: message.customer_id,
      jobId: message.job_id ?? null,
      estimateId: message.estimate_id,
      scheduleEventId: null,
      relatedTable: "email_messages",
      relatedRecordId: message.id,
      customerName: target.name,
      contact: primaryContact,
      phone: null,
      email: primaryContact,
      businessLocation: getCompanyLocationLabel(companyMap.get(message.company_id), target.location),
      sourceAccount: message.from_email ?? message.cc_email,
      sourceLabel: "Gmail",
      serviceType: emailCategoryLabel(message.category),
      summary: message.subject || message.message_preview || message.body,
      notes: message.message_preview ?? message.body,
      participants: compactParticipants([
        message.from_email,
        message.to_email,
        ...(message.to_emails ?? []),
        message.cc_email,
        ...(message.cc_emails ?? []),
      ]),
      attachments: compactAttachments([
        getEstimateTitle(snapshot, message.estimate_id),
        message.has_attachments
          ? `${message.attachment_count ?? 0} Gmail attachment${
              (message.attachment_count ?? 0) === 1 ? "" : "s"
            }`
          : null,
        message.invoice_id
          ? snapshot.invoices.find((invoice) => invoice.id === message.invoice_id)?.invoice_number
          : null,
        message.document_id
          ? snapshot.documents.find((document) => document.id === message.document_id)?.title
          : null,
      ]),
      createdAt:
        message.received_at ?? message.sent_at ?? message.queued_at ?? message.created_at,
      updatedAt: message.updated_at,
      status: emailMessageStatusLabel(message.status),
      priority:
        message.status === "failed" ? "high" : direction === "inbound" ? "medium" : "low",
      responseStatus:
        message.status === "failed"
          ? "waiting_on_us"
          : direction === "inbound"
            ? "needs_response"
            : "resolved",
      matchStatus: message.customer_id
        ? "matched_customer"
        : message.lead_id
          ? "matched_lead"
          : "manual_review_required",
      routingStatus: message.customer_id || message.lead_id ? "Matched" : "Needs review",
      deliveryState: getEmailDeliveryState(message),
      syncState:
        message.status === "failed"
          ? "failed"
          : message.sync_status === "imported" || message.sync_status === "synced"
            ? "synced"
            : message.gmail_message_id
              ? "synced"
              : "queued",
      waitingSince: null,
      suggestedNextAction: message.status === "failed"
        ? "Review delivery failure before sending again"
        : direction === "inbound"
          ? "Review and respond from the customer record"
          : "Open the related customer or estimate record",
      isUnread: direction === "inbound",
      isArchived: false,
      isFailed: message.status === "failed",
      isMissedCall: false,
      isUnassigned: !message.customer_id && !message.lead_id,
      followUpAt: null,
      assignedTo: null,
      failureDetail: sanitizeIntegrationSyncLogText(message.last_error),
    };
  });

  const integrationItems: UnifiedInboxItem[] = snapshot.integrationSyncLogs.map((log) => {
    const lead = getIntegrationLogLead(snapshot, log);
    const provider = getIntegrationInboxProvider(log.provider);

    return {
      id: `integration-${log.id}`,
      provider,
      channel: getIntegrationCommunicationChannel(log.provider),
      direction:
        log.direction === "provider_to_weathertech"
          ? "inbound"
          : log.direction === "weathertech_to_provider"
            ? "outbound"
            : "internal",
      kind: "Integration",
      companyId: log.company_id,
      leadId: lead?.id ?? null,
      customerId: lead?.customer_id ?? null,
      jobId: null,
      estimateId: null,
      scheduleEventId: null,
      relatedTable: log.related_table,
      relatedRecordId: log.related_record_id,
      customerName: lead?.contact_name ?? statusLabel(log.event_type),
      contact: getInboxContact(lead?.phone, lead?.email),
      phone: lead?.phone ?? null,
      email: lead?.email ?? null,
      businessLocation: getCompanyLocationLabel(
        companyMap.get(log.company_id),
        lead?.city ?? lead?.property_address,
      ),
      sourceAccount: log.external_id,
      sourceLabel: getIntegrationProviderLabel(log.provider),
      serviceType: lead ? serviceLabel(lead.service_type) : "Provider sync",
      summary:
        sanitizeIntegrationSyncLogText(log.error_message) ??
        integrationSyncLogStatusLabel(log.status),
      notes: sanitizeIntegrationSyncLogText(log.error_message),
      participants: compactParticipants([lead?.contact_name, lead?.phone, lead?.email, log.external_id]),
      attachments: compactAttachments([log.request_fingerprint]),
      createdAt: log.completed_at ?? log.last_attempted_at ?? log.created_at,
      updatedAt: log.updated_at,
      status: integrationSyncLogStatusLabel(log.status),
      priority: log.status === "failed" ? "high" : log.status === "retrying" ? "medium" : "low",
      responseStatus: log.status === "failed" || log.status === "retrying" ? "waiting_on_us" : "resolved",
      matchStatus: lead?.customer_id ? "matched_customer" : lead ? "matched_lead" : "manual_review_required",
      routingStatus: lead ? "Matched" : "Needs review",
      deliveryState: "not_applicable",
      syncState: getSyncStateFromIntegrationStatus(log.status),
      waitingSince: log.status === "failed" || log.status === "retrying" ? log.last_attempted_at ?? log.created_at : null,
      suggestedNextAction: log.status === "failed" || log.status === "retrying"
        ? "Review provider sync failure and retry only when safe"
        : "Open the related CRM record",
      isUnread: log.status === "failed" || log.status === "retrying",
      isArchived: false,
      isFailed: log.status === "failed",
      isMissedCall: false,
      isUnassigned: !lead?.customer_id,
      followUpAt: log.next_retry_at,
      assignedTo: null,
      failureDetail: sanitizeIntegrationSyncLogText(log.error_message),
    };
  });

  const scheduleItems: UnifiedInboxItem[] = snapshot.scheduleEvents.map((event) => {
    const target = getScheduleTarget(snapshot, event);

    return {
      id: `calendar-${event.id}`,
      provider: "google_calendar",
      channel: "calendar",
      direction: "internal",
      kind: "Calendar",
      companyId: event.company_id,
      leadId: event.lead_id,
      customerId: event.customer_id,
      jobId: event.job_id,
      estimateId: null,
      scheduleEventId: event.id,
      relatedTable: "schedule_events",
      relatedRecordId: event.id,
      customerName: target.name,
      contact: getInboxContact(target.phone, target.email),
      phone: target.phone,
      email: target.email,
      businessLocation: getCompanyLocationLabel(companyMap.get(event.company_id), target.location),
      sourceAccount: event.location,
      sourceLabel: "Calendar",
      serviceType: scheduleEventTypeLabel(event.event_type),
      summary: event.notes ?? `${event.title} is ${scheduleEventStatusLabel(event.status).toLowerCase()}.`,
      notes: event.notes,
      participants: compactParticipants([target.name, target.phone, target.email]),
      attachments: [],
      createdAt: event.start_at,
      updatedAt: event.updated_at,
      status: scheduleEventStatusLabel(event.status),
      isUnread: false,
      isArchived: event.status === "canceled",
      isFailed: false,
      isMissedCall: false,
      isUnassigned: !event.customer_id && !event.lead_id && !event.job_id,
      followUpAt: event.status === "scheduled" ? event.start_at : null,
      assignedTo: null,
      failureDetail: null,
    };
  });

  const calendarSyncItems: UnifiedInboxItem[] = snapshot.calendarEventSyncs.map((sync) => {
    const event = getCalendarSyncEvent(snapshot, sync);
    const target = event ? getScheduleTarget(snapshot, event) : null;

    return {
      id: `calendar-sync-${sync.id}`,
      provider: "google_calendar",
      channel: "calendar",
      direction:
        sync.sync_direction === "provider_to_weathertech"
          ? "inbound"
          : sync.sync_direction === "weathertech_to_provider"
            ? "outbound"
            : "internal",
      kind: "Calendar",
      companyId: sync.company_id,
      leadId: event?.lead_id ?? null,
      customerId: event?.customer_id ?? null,
      jobId: event?.job_id ?? null,
      estimateId: null,
      scheduleEventId: sync.schedule_event_id,
      relatedTable: "calendar_event_syncs",
      relatedRecordId: sync.id,
      customerName: target?.name ?? "Google Calendar sync",
      contact: target ? getInboxContact(target.phone, target.email) : "Calendar provider",
      phone: target?.phone ?? null,
      email: target?.email ?? null,
      businessLocation: getCompanyLocationLabel(companyMap.get(sync.company_id), target?.location),
      sourceAccount: sync.google_calendar_id,
      sourceLabel: "Google Calendar",
      serviceType: "Calendar sync",
      summary: sync.last_error ?? `${event?.title ?? "Schedule event"} sync is ${calendarSyncStatusLabel(sync.sync_status).toLowerCase()}.`,
      notes: sanitizeIntegrationSyncLogText(sync.last_error),
      participants: compactParticipants([target?.name, sync.google_calendar_id]),
      attachments: compactAttachments([sync.google_event_id]),
      createdAt: sync.last_synced_at ?? sync.updated_at ?? sync.created_at,
      updatedAt: sync.updated_at,
      status: calendarSyncStatusLabel(sync.sync_status),
      isUnread: sync.sync_status === "error" || sync.sync_status === "conflict",
      isArchived: false,
      isFailed: sync.sync_status === "error" || sync.sync_status === "conflict",
      isMissedCall: false,
      isUnassigned: !event?.customer_id && !event?.lead_id && !event?.job_id,
      followUpAt: null,
      assignedTo: null,
      failureDetail: sanitizeIntegrationSyncLogText(sync.last_error),
    };
  });

  const customerNoteItems: UnifiedInboxItem[] = snapshot.customers
    .filter((customer) => Boolean(customer.notes?.trim()))
    .map((customer) => ({
      id: `customer-note-${customer.id}`,
      provider: "internal",
      channel: "internal",
      direction: "internal",
      kind: "Internal Note",
      companyId: customer.company_id,
      leadId: null,
      customerId: customer.id,
      jobId: null,
      estimateId: null,
      scheduleEventId: null,
      relatedTable: "customers",
      relatedRecordId: customer.id,
      customerName: customer.display_name,
      contact: getInboxContact(customer.phone, customer.email),
      phone: customer.phone,
      email: customer.email,
      businessLocation: getCompanyLocationLabel(
        companyMap.get(customer.company_id),
        customer.city || customer.property_address,
      ),
      sourceAccount: null,
      sourceLabel: "Internal",
      serviceType: "Customer note",
      summary: customer.notes ?? "",
      notes: customer.notes,
      participants: compactParticipants([customer.display_name, customer.contact_name]),
      attachments: [],
      createdAt: customer.updated_at,
      updatedAt: customer.updated_at,
      status: "Internal",
      isUnread: false,
      isArchived: false,
      isFailed: false,
      isMissedCall: false,
      isUnassigned: false,
      followUpAt: null,
      assignedTo: "WeatherTech OS",
      failureDetail: null,
    }));

  const jobNoteItems: UnifiedInboxItem[] = snapshot.jobNotes.map((note) => {
    const job = snapshot.jobs.find((item) => item.id === note.job_id);
    const target = getJobNoteTarget(snapshot, job);

    return {
      id: `job-note-${note.id}`,
      provider: "internal",
      channel: "internal",
      direction: "internal",
      kind: "Internal Note",
      companyId: job?.company_id ?? target.customer?.company_id ?? target.lead?.company_id ?? "",
      leadId: job?.lead_id ?? null,
      customerId: job?.customer_id ?? null,
      jobId: job?.id ?? note.job_id,
      estimateId: job?.estimate_id ?? null,
      scheduleEventId: null,
      relatedTable: "job_notes",
      relatedRecordId: note.id,
      customerName: target.name,
      contact: getInboxContact(target.phone, target.email),
      phone: target.phone,
      email: target.email,
      businessLocation: getCompanyLocationLabel(
        companyMap.get(job?.company_id ?? ""),
        target.location,
      ),
      sourceAccount: job?.title ?? null,
      sourceLabel: "Internal",
      serviceType: "Job note",
      summary: note.note,
      notes: note.note,
      participants: compactParticipants([target.name, job?.title]),
      attachments: compactAttachments([job?.title]),
      createdAt: note.created_at,
      updatedAt: note.created_at,
      status: "Internal",
      isUnread: false,
      isArchived: false,
      isFailed: false,
      isMissedCall: false,
      isUnassigned: !job?.customer_id && !job?.lead_id,
      followUpAt: null,
      assignedTo: "WeatherTech OS",
      failureDetail: null,
    };
  });

  return [
    ...leadIntakeItems,
    ...callItems,
    ...providerEventItems,
    ...leadItems,
    ...smsItems,
    ...emailItems,
    ...integrationItems,
    ...scheduleItems,
    ...calendarSyncItems,
    ...customerNoteItems,
    ...jobNoteItems,
  ].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function getLatestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

function getProviderConnection(
  connections: IntegrationConnectionRecord[],
  provider: CommunicationProvider,
) {
  if (provider === "twilio") {
    return connections.find((connection) => connection.provider === "twilio_sms");
  }

  if (
    provider === "gmail" ||
    provider === "google_calendar" ||
    provider === "gohighlevel" ||
    provider === "website" ||
    provider === "yelp"
  ) {
    return connections.find((connection) => connection.provider === provider);
  }

  return undefined;
}

export function buildCommunicationProviderReadiness(
  snapshot: CrmSnapshot,
  items: UnifiedInboxItem[],
): CommunicationProviderReadiness[] {
  const providerDefinitions: Array<{
    provider: CommunicationProvider;
    label: string;
    detail: string;
  }> = [
    {
      provider: "twilio",
      label: "Twilio",
      detail: "SMS and future call events will land in the unified communications model.",
    },
    {
      provider: "gmail",
      label: "Gmail",
      detail: "Email drafts, queued messages, and send results are modeled without sending from this hub.",
    },
    {
      provider: "google_calendar",
      label: "Google Calendar",
      detail: "Schedule events and calendar sync records are visible as calendar interactions.",
    },
    {
      provider: "google_business",
      label: "Google Business Profile",
      detail: "Ready for future GBP message/review intake after account access is approved.",
    },
    {
      provider: "yelp",
      label: "Yelp",
      detail: "Yelp lead intake activity is visible when routed through the approved endpoint.",
    },
    {
      provider: "gohighlevel",
      label: "GoHighLevel",
      detail: "GoHighLevel dry-run and sync-log activity is visible without enabling automations.",
    },
    {
      provider: "website",
      label: "Website",
      detail: "Website lead intake activity is visible when forms post to WeatherTech OS.",
    },
  ];

  return providerDefinitions.map(({ provider, label, detail }) => {
    const connection = getProviderConnection(snapshot.integrationConnections, provider);
    const providerItems = items.filter((item) => item.provider === provider);
    const providerLogs = snapshot.integrationSyncLogs.filter(
      (log) => getIntegrationInboxProvider(log.provider) === provider,
    );
    const failedItems = providerItems.filter((item) => item.isFailed);
    const failedLogs = providerLogs.filter((log) => log.status === "failed" || log.status === "retrying");
    const businessPhoneCount =
      provider === "twilio"
        ? snapshot.businessPhoneNumbers.filter(
            (phone) => phone.routing_status !== "disabled",
          ).length
        : 0;
    const lastSyncAt =
      connection?.last_sync_at ??
      getLatestTimestamp([
        ...providerLogs.map((log) => log.completed_at ?? log.last_attempted_at),
        ...(provider === "google_calendar"
          ? snapshot.calendarEventSyncs.map((sync) => sync.last_synced_at)
          : []),
      ]);
    const lastActivityAt = getLatestTimestamp(providerItems.map((item) => item.createdAt));
    const connected = connection?.status === "connected";
    const hasErrors = Boolean(connection?.last_error || failedItems.length || failedLogs.length);
    const syncHealth = hasErrors
      ? "Needs attention"
      : connected
        ? "Healthy"
        : providerItems.length || providerLogs.length
          ? "Ready"
          : "Not configured";

    return {
      provider,
      label,
      connectionStatus: connected ? "Connected" : "Not connected",
      syncHealth,
      lastSyncAt,
      lastActivityAt,
      errorState:
        sanitizeIntegrationSyncLogText(connection?.last_error) ??
        sanitizeIntegrationSyncLogText(failedItems[0]?.failureDetail) ??
        sanitizeIntegrationSyncLogText(failedLogs[0]?.error_message) ??
        "None",
      activityCount: providerItems.length,
      detail:
        provider === "twilio" && businessPhoneCount
          ? `${businessPhoneCount} business phone ${businessPhoneCount === 1 ? "route" : "routes"} modeled for company-aware intake. Live sending remains disabled until credentials are verified.`
          : detail,
      tone: hasErrors ? "amber" : connected || providerItems.length ? "green" : "blue",
    };
  });
}
