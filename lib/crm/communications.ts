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
  CalendarEventSyncRecord,
  CompanyRecord,
  CrmSnapshot,
  EmailMessageRecord,
  IntegrationConnectionRecord,
  IntegrationProvider,
  IntegrationSyncLogRecord,
  JobRecord,
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
  kind: "Lead" | "SMS" | "Email" | "Integration" | "Calendar" | "Internal Note";
  companyId: string;
  leadId: string | null;
  customerId: string | null;
  jobId: string | null;
  estimateId: string | null;
  scheduleEventId: string | null;
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
  { value: "SMS", label: "SMS" },
  { value: "Email", label: "Email" },
  { value: "Integration", label: "Integrations" },
  { value: "Calendar", label: "Calendar" },
  { value: "Internal Note", label: "Internal notes" },
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

function getSmsDirection(message: SmsMessageRecord): CommunicationDirection {
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
  const estimateTitle = getEstimateTitle(snapshot, message.estimate_id);

  return {
    name: customer?.display_name ?? customer?.contact_name ?? estimateTitle ?? message.to_email,
    location: customer?.city ?? customer?.property_address ?? null,
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

  const emailItems: UnifiedInboxItem[] = snapshot.emailMessages.map((message) => {
    const target = getEmailTarget(snapshot, message);

    return {
      id: `email-${message.id}`,
      provider: "gmail",
      channel: "email",
      direction: "outbound",
      kind: "Email",
      companyId: message.company_id,
      leadId: null,
      customerId: message.customer_id,
      jobId: null,
      estimateId: message.estimate_id,
      scheduleEventId: null,
      relatedTable: "email_messages",
      relatedRecordId: message.id,
      customerName: target.name,
      contact: message.to_email,
      phone: null,
      email: message.to_email,
      businessLocation: getCompanyLocationLabel(companyMap.get(message.company_id), target.location),
      sourceAccount: message.cc_email,
      sourceLabel: "Gmail",
      serviceType: emailCategoryLabel(message.category),
      summary: message.subject || message.body,
      notes: message.body,
      participants: compactParticipants([message.to_email, message.cc_email]),
      attachments: compactAttachments([
        getEstimateTitle(snapshot, message.estimate_id),
        message.invoice_id
          ? snapshot.invoices.find((invoice) => invoice.id === message.invoice_id)?.invoice_number
          : null,
        message.document_id
          ? snapshot.documents.find((document) => document.id === message.document_id)?.title
          : null,
      ]),
      createdAt: message.sent_at ?? message.queued_at ?? message.created_at,
      updatedAt: message.updated_at,
      status: emailMessageStatusLabel(message.status),
      isUnread: false,
      isArchived: false,
      isFailed: message.status === "failed",
      isMissedCall: false,
      isUnassigned: !message.customer_id,
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
      detail,
      tone: hasErrors ? "amber" : connected || providerItems.length ? "green" : "blue",
    };
  });
}
