"use client";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  Building2,
  Bot,
  Calculator,
  Camera,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CloudSun,
  Copy,
  DollarSign,
  FileText,
  Home,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Paintbrush,
  Phone,
  Plus,
  Printer,
  ReceiptText,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserRound,
  Users,
  WandSparkles,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  convertLeadToCustomer,
  createChangeOrder,
  createDailyLog,
  createDocument,
  createEmailMessage,
  createEmployee,
  createInvoice,
  createIntegrationConnection,
  createInspection,
  createEstimate,
  createCustomer,
  createJobAssignment,
  createJob,
  createJobPhoto,
  createLead,
  createMaterialOrder,
  createNotification,
  createPayment,
  createRoutePlan,
  createScheduleEvent,
  createSignature,
  createSmsMessage,
  createScope,
  createTimeEntry,
  fetchCrmSnapshot,
  updateIntegrationConnection,
  updateChangeOrder,
  updateInvoice,
  updateEstimate,
  updateCustomer,
  updateEmailMessage,
  updateJob,
  updateJobAssignment,
  updateLead,
  updateMaterialOrder,
  updateNotification,
  updateScheduleEvent,
  updateSignature,
  updateSmsMessage,
  updateTimeEntry,
  updateScope,
  upsertCalendarEventSync,
} from "../lib/crm/repository";
import {
  buildDocumentSourceOptions,
  buildGeneratedDocumentDraft,
} from "../lib/crm/documents";
import { calculateEstimateTotals, calculateLineItemTotal } from "../lib/crm/estimates";
import {
  buildGoogleCalendarEventPayload,
  buildGmailSendPreview,
  buildRouteCandidates,
  buildRoutePreview,
  buildTwilioSmsPreview,
  calendarSyncStatusLabel,
  countSmsSegments,
  createPayloadFingerprint,
  emailCategoryLabel,
  emailMessageStatusLabel,
  formatRouteDistance,
  formatRouteDuration,
  getCalendarSyncRecord,
  getCalendarSyncSummary,
  getEmailOutboxSummary,
  getSmsOutboxSummary,
  googleMapsEnvVars,
  gmailScopes,
  googleCalendarScopes,
  hasGoogleMapsBrowserKey,
  integrationStatusLabel,
  smsCategoryLabel,
  smsMessageStatusLabel,
  routePreviewToStopInputs,
  syncDirectionLabel,
  twilioEnvVars,
} from "../lib/crm/integrations";
import { calculateDashboardMetrics } from "../lib/crm/metrics";
import {
  calculateInvoiceLineItemTotal,
  calculateInvoiceTotals,
  calculateMaterialOrderItemTotal,
  calculateMaterialOrderTotal,
} from "../lib/crm/operations";
import { scopeCategoryLabels } from "../lib/crm/scopeTemplates";
import type {
  CompanyRecord,
  CrmSnapshot,
  EmailMessageRecord,
  IntegrationConnectionRecord,
  IntegrationConnectionStatus,
  IntegrationSyncDirection,
  ChangeOrderInput,
  ChangeOrderRecord,
  ChangeOrderStatus,
  CustomerRecord,
  CustomerStatus,
  CustomerType,
  DailyLogInput,
  Database,
  DocumentCategory,
  DocumentInput,
  DocumentRecord,
  EmployeeInput,
  EmployeeRecord,
  EmployeeRole,
  EstimateInput,
  EstimateLineItemCategory,
  EstimateLineItemInput,
  EstimateLineItemRecord,
  EstimateRecord,
  EstimateStatus,
  InspectionInput,
  InspectionStatus,
  InvoiceInput,
  InvoiceLineItemInput,
  InvoiceLineItemRecord,
  InvoiceRecord,
  InvoiceStatus,
  JobAssignmentInput,
  JobAssignmentRecord,
  AssignmentStatus,
  JobInput,
  JobPhotoRecord,
  JobRecord,
  JobStatus,
  LeadPriority,
  LeadRecord,
  LeadStatus,
  MaterialOrderInput,
  MaterialOrderItemInput,
  MaterialOrderItemRecord,
  MaterialOrderRecord,
  MaterialOrderStatus,
  NotificationChannel,
  NotificationInput,
  NotificationRecord,
  NotificationStatus,
  PaymentInput,
  PaymentRecord,
  ScheduleEventInput,
  ScheduleEventRecord,
  ScheduleEventStatus,
  ScheduleEventType,
  SignatureInput,
  SignatureRecord,
  SignatureStatus,
  SmsMessageRecord,
  SmsMessageCategory,
  ScopeCategory,
  ScopeInput,
  ScopeRecord,
  ScopeStatus,
  ScopeTemplateRecord,
  ServiceType,
  TimeEntryRecord,
} from "../lib/crm/types";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

type CrmClient = SupabaseClient<Database>;
type ThemeMode = "light" | "dark";
type WorkspaceView =
  | "dashboard"
  | "leads"
  | "customers"
  | "estimates"
  | "scopes"
  | "jobs"
  | "calendar"
  | "photos"
  | "invoices"
  | "orders"
  | "ai"
  | "weather"
  | "customerPortal"
  | "employeePortal"
  | "routes"
  | "changeOrders"
  | "documents"
  | "analytics"
  | "notifications"
  | "integrations"
  | "settings";

const leadStatuses: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "estimate_sent", label: "Estimate sent" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const leadPriorities: { value: LeadPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const serviceTypes: { value: ServiceType; label: string }[] = [
  { value: "roofing", label: "Roofing" },
  { value: "painting", label: "Painting" },
  { value: "both", label: "Both" },
];

const customerTypes: { value: CustomerType; label: string }[] = [
  { value: "homeowner", label: "Homeowner" },
  { value: "commercial", label: "Commercial" },
  { value: "hoa", label: "HOA" },
  { value: "property_manager", label: "Property manager" },
];

const customerStatuses: { value: CustomerStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "prospect", label: "Prospect" },
];

const estimateStatuses: { value: EstimateStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "expired", label: "Expired" },
];

const lineItemCategories: { value: EstimateLineItemCategory; label: string }[] = [
  { value: "labor", label: "Labor" },
  { value: "material", label: "Materials" },
  { value: "other", label: "Other" },
];

const scopeStatuses: { value: ScopeStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
];

const jobStatuses: { value: JobStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "completed", label: "Completed" },
  { value: "closed", label: "Closed" },
];

const scheduleEventTypes: { value: ScheduleEventType; label: string }[] = [
  { value: "inspection", label: "Inspection" },
  { value: "estimate", label: "Estimate" },
  { value: "job", label: "Job" },
  { value: "follow_up", label: "Follow-up" },
  { value: "material_delivery", label: "Material delivery" },
];

const scheduleEventStatuses: { value: ScheduleEventStatus; label: string }[] = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

const invoiceStatuses: { value: InvoiceStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Void" },
];

const materialOrderStatuses: { value: MaterialOrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ordered", label: "Ordered" },
  { value: "partial", label: "Partial" },
  { value: "received", label: "Received" },
  { value: "canceled", label: "Canceled" },
];

const employeeRoles: { value: EmployeeRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales" },
  { value: "project_manager", label: "Project manager" },
  { value: "crew_lead", label: "Crew lead" },
  { value: "technician", label: "Technician" },
];

const assignmentStatuses: { value: AssignmentStatus; label: string }[] = [
  { value: "assigned", label: "Assigned" },
  { value: "accepted", label: "Accepted" },
  { value: "completed", label: "Completed" },
  { value: "missed", label: "Missed" },
];

const inspectionStatuses: { value: InspectionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "needs_review", label: "Needs review" },
];

const changeOrderStatuses: { value: ChangeOrderStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const signatureStatuses: { value: SignatureStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "signed", label: "Signed" },
  { value: "declined", label: "Declined" },
];

const documentCategories: { value: DocumentCategory; label: string }[] = [
  { value: "estimate", label: "Estimate" },
  { value: "scope", label: "Scope" },
  { value: "invoice", label: "Invoice" },
  { value: "change_order", label: "Change order" },
  { value: "contract", label: "Contract" },
  { value: "photo", label: "Photo" },
  { value: "other", label: "Other" },
];

const notificationChannels: { value: NotificationChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "in_app", label: "In-app" },
];

const notificationStatuses: { value: NotificationStatus; label: string }[] = [
  { value: "queued", label: "Queued" },
  { value: "sent", label: "Sent" },
  { value: "read", label: "Read" },
  { value: "dismissed", label: "Dismissed" },
];

const smsCategories: { value: SmsMessageCategory; label: string }[] = [
  { value: "appointment_reminder", label: "Appointment reminder" },
  { value: "estimate_follow_up", label: "Estimate follow-up" },
  { value: "invoice_reminder", label: "Invoice reminder" },
  { value: "job_update", label: "Job update" },
  { value: "weather_delay", label: "Weather delay" },
  { value: "general", label: "General" },
];

const scopeCategories = (Object.keys(scopeCategoryLabels) as ScopeCategory[]).map(
  (value) => ({
    value,
    label: scopeCategoryLabels[value],
  }),
);

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatMoney(value: number) {
  return moneyFormatter.format(value);
}

function getFormString(formData: FormData, key: string, fallback = "") {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getOptionalFormString(formData: FormData, key: string) {
  const value = getFormString(formData, key);
  return value || null;
}

function getOptionalRelation(formData: FormData, key: string) {
  const value = getFormString(formData, key);
  return value && value !== "none" ? value : null;
}

function getFormNumber(formData: FormData, key: string) {
  const value = getFormString(formData, key).replace(/[^0-9.]/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusLabel(status: LeadStatus) {
  return leadStatuses.find((item) => item.value === status)?.label ?? status;
}

function customerStatusLabel(status: CustomerStatus) {
  return customerStatuses.find((item) => item.value === status)?.label ?? status;
}

function estimateStatusLabel(status: EstimateStatus) {
  return estimateStatuses.find((item) => item.value === status)?.label ?? status;
}

function serviceLabel(service: ServiceType) {
  return serviceTypes.find((item) => item.value === service)?.label ?? service;
}

function scopeStatusLabel(status: ScopeStatus) {
  return scopeStatuses.find((item) => item.value === status)?.label ?? status;
}

function jobStatusLabel(status: JobStatus) {
  return jobStatuses.find((item) => item.value === status)?.label ?? status;
}

function scheduleEventTypeLabel(type: ScheduleEventType) {
  return scheduleEventTypes.find((item) => item.value === type)?.label ?? type;
}

function scheduleEventStatusLabel(status: ScheduleEventStatus) {
  return scheduleEventStatuses.find((item) => item.value === status)?.label ?? status;
}

function invoiceStatusLabel(status: InvoiceStatus) {
  return invoiceStatuses.find((item) => item.value === status)?.label ?? status;
}

function materialOrderStatusLabel(status: MaterialOrderStatus) {
  return materialOrderStatuses.find((item) => item.value === status)?.label ?? status;
}

function employeeRoleLabel(role: EmployeeRole) {
  return employeeRoles.find((item) => item.value === role)?.label ?? role;
}

function assignmentStatusLabel(status: AssignmentStatus) {
  return assignmentStatuses.find((item) => item.value === status)?.label ?? status;
}

function inspectionStatusLabel(status: InspectionStatus) {
  return inspectionStatuses.find((item) => item.value === status)?.label ?? status;
}

function changeOrderStatusLabel(status: ChangeOrderStatus) {
  return changeOrderStatuses.find((item) => item.value === status)?.label ?? status;
}

function signatureStatusLabel(status: SignatureStatus) {
  return signatureStatuses.find((item) => item.value === status)?.label ?? status;
}

function documentCategoryLabel(category: DocumentCategory) {
  return documentCategories.find((item) => item.value === category)?.label ?? category;
}

function notificationStatusLabel(status: NotificationStatus) {
  return notificationStatuses.find((item) => item.value === status)?.label ?? status;
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIsoDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function toDateTimeInputValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromDateTimeInputValue(value: string) {
  return new Date(value).toISOString();
}

function getEstimateLineItems(snapshot: CrmSnapshot, estimateId: string) {
  return snapshot.estimateLineItems
    .filter((item) => item.estimate_id === estimateId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getInvoiceLineItems(snapshot: CrmSnapshot, invoiceId: string) {
  return snapshot.invoiceLineItems
    .filter((item) => item.invoice_id === invoiceId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getMaterialOrderItems(snapshot: CrmSnapshot, orderId: string) {
  return snapshot.materialOrderItems
    .filter((item) => item.material_order_id === orderId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getCustomerName(snapshot: CrmSnapshot, customerId: string | null) {
  if (!customerId) {
    return null;
  }

  return (
    snapshot.customers.find((customer) => customer.id === customerId)?.display_name ?? null
  );
}

function getLeadName(snapshot: CrmSnapshot, leadId: string | null) {
  if (!leadId) {
    return null;
  }

  return snapshot.leads.find((lead) => lead.id === leadId)?.contact_name ?? null;
}

function getEstimateTargetName(snapshot: CrmSnapshot, estimate: EstimateRecord) {
  return (
    getCustomerName(snapshot, estimate.customer_id) ??
    getLeadName(snapshot, estimate.lead_id) ??
    "Unassigned"
  );
}

function getScopeTargetName(snapshot: CrmSnapshot, scope: ScopeRecord) {
  return (
    getCustomerName(snapshot, scope.customer_id) ??
    getLeadName(snapshot, scope.lead_id) ??
    snapshot.estimates.find((estimate) => estimate.id === scope.estimate_id)?.title ??
    "Unassigned"
  );
}

function getJobTargetName(snapshot: CrmSnapshot, job: JobRecord) {
  return (
    getCustomerName(snapshot, job.customer_id) ??
    getLeadName(snapshot, job.lead_id) ??
    "Unassigned"
  );
}

function getScheduleTargetName(snapshot: CrmSnapshot, event: ScheduleEventRecord) {
  return (
    snapshot.jobs.find((job) => job.id === event.job_id)?.title ??
    getCustomerName(snapshot, event.customer_id) ??
    getLeadName(snapshot, event.lead_id) ??
    "Unassigned"
  );
}

function getInvoiceTargetName(snapshot: CrmSnapshot, invoice: InvoiceRecord) {
  return (
    getCustomerName(snapshot, invoice.customer_id) ??
    snapshot.jobs.find((job) => job.id === invoice.job_id)?.title ??
    snapshot.estimates.find((estimate) => estimate.id === invoice.estimate_id)?.title ??
    "Unassigned"
  );
}

function getMaterialOrderTargetName(snapshot: CrmSnapshot, order: MaterialOrderRecord) {
  return snapshot.jobs.find((job) => job.id === order.job_id)?.title ?? "Unassigned";
}

function getEmployeeName(snapshot: CrmSnapshot, employeeId: string | null) {
  if (!employeeId) {
    return null;
  }

  return snapshot.employees.find((employee) => employee.id === employeeId)?.full_name ?? null;
}

function getJobName(snapshot: CrmSnapshot, jobId: string | null) {
  if (!jobId) {
    return null;
  }

  return snapshot.jobs.find((job) => job.id === jobId)?.title ?? null;
}

function getChangeOrderTargetName(snapshot: CrmSnapshot, changeOrder: ChangeOrderRecord) {
  return (
    getJobName(snapshot, changeOrder.job_id) ??
    getCustomerName(snapshot, changeOrder.customer_id) ??
    snapshot.estimates.find((estimate) => estimate.id === changeOrder.estimate_id)?.title ??
    "Unassigned"
  );
}

function getDocumentTargetName(snapshot: CrmSnapshot, document: DocumentRecord) {
  return (
    getCustomerName(snapshot, document.customer_id) ??
    getJobName(snapshot, document.job_id) ??
    snapshot.invoices.find((invoice) => invoice.id === document.invoice_id)
      ?.invoice_number ??
    "General"
  );
}

function getSignatureTargetName(snapshot: CrmSnapshot, signature: SignatureRecord) {
  return (
    snapshot.documents.find((document) => document.id === signature.document_id)?.title ??
    snapshot.changeOrders.find(
      (changeOrder) => changeOrder.id === signature.change_order_id,
    )?.title ??
    getCustomerName(snapshot, signature.customer_id) ??
    getEmployeeName(snapshot, signature.employee_id) ??
    "Signature"
  );
}

function getPaymentTargetName(snapshot: CrmSnapshot, payment: PaymentRecord) {
  return (
    snapshot.invoices.find((invoice) => invoice.id === payment.invoice_id)
      ?.invoice_number ??
    getCustomerName(snapshot, payment.customer_id) ??
    "Payment"
  );
}

function getSmsTargetName(snapshot: CrmSnapshot, message: SmsMessageRecord) {
  return (
    getCustomerName(snapshot, message.customer_id) ??
    getLeadName(snapshot, message.lead_id) ??
    getJobName(snapshot, message.job_id) ??
    snapshot.scheduleEvents.find((event) => event.id === message.schedule_event_id)
      ?.title ??
    snapshot.invoices.find((invoice) => invoice.id === message.invoice_id)
      ?.invoice_number ??
    "General SMS"
  );
}

function buildDefaultSmsBody({
  category,
  companyName,
  targetName,
  event,
  invoice,
  job,
}: {
  category: SmsMessageCategory;
  companyName: string;
  targetName: string;
  event?: ScheduleEventRecord;
  invoice?: InvoiceRecord;
  job?: JobRecord;
}) {
  const optOut = "Reply STOP to opt out.";

  if (category === "appointment_reminder" && event) {
    return `Hi ${targetName}, this is ${companyName}. Reminder: ${event.title} is scheduled for ${formatDateTime(event.start_at)}${event.location ? ` at ${event.location}` : ""}. ${optOut}`;
  }

  if (category === "invoice_reminder" && invoice) {
    return `Hi ${targetName}, ${companyName} invoice ${invoice.invoice_number} has a balance of ${formatMoney(invoice.balance_due)}. Please reply with questions or payment timing. ${optOut}`;
  }

  if (category === "job_update" && job) {
    return `Hi ${targetName}, ${companyName} update for ${job.title}: current status is ${jobStatusLabel(job.status)}. We will keep you posted as production moves forward. ${optOut}`;
  }

  if (category === "weather_delay") {
    return `Hi ${targetName}, this is ${companyName}. Weather may affect today's schedule. Our team is reviewing conditions and will confirm the next update shortly. ${optOut}`;
  }

  if (category === "estimate_follow_up") {
    return `Hi ${targetName}, this is ${companyName}. Following up on your estimate. Reply here with questions or approval and we can help reserve the schedule. ${optOut}`;
  }

  return `Hi ${targetName}, this is ${companyName}. Reply here if you have any questions or need an update from our team. ${optOut}`;
}

export function CrmApp() {
  const [client] = useState<SupabaseClient<Database> | null>(() =>
    getSupabaseBrowserClient(),
  );
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(client === null);
  const [snapshot, setSnapshot] = useState<CrmSnapshot | null>(null);
  const [view, setView] = useState<WorkspaceView>("dashboard");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }

    return window.localStorage.getItem("weathertech-theme") === "dark"
      ? "dark"
      : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("weathertech-theme", theme);
  }, [theme]);

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
  };

  const loadSnapshot = useCallback(async (crmClient: CrmClient) => {
    setIsLoading(true);
    setError("");

    try {
      const nextSnapshot = await fetchCrmSnapshot(crmClient);
      setSnapshot(nextSnapshot);
    } catch (currentError) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to load CRM records.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!client) {
      return;
    }

    let isMounted = true;

    client.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return;
      }

      const activeUser = data.session?.user ?? null;
      setUser(activeUser);
      setAuthReady(true);

      if (activeUser) {
        void loadSnapshot(client);
      } else {
        setIsLoading(false);
      }
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      const activeUser = session?.user ?? null;
      setUser(activeUser);

      if (activeUser) {
        void loadSnapshot(client);
      } else {
        setSnapshot(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [client, loadSnapshot]);

  const handleAuthNotice = (message: string) => {
    setNotice(message);
    setError("");
  };

  const handleSignOut = async () => {
    if (!client) {
      return;
    }

    await client.auth.signOut();
    setNotice("Signed out.");
    setView("dashboard");
  };

  if (!authReady) {
    return <LoadingScreen label="Preparing WeatherTech OS" />;
  }

  if (!client) {
    return <SupabaseConfigScreen />;
  }

  if (!user) {
    return (
      <AuthScreen client={client} notice={notice} onNotice={handleAuthNotice} />
    );
  }

  if (error && !snapshot && !isLoading) {
    return (
      <LoadErrorScreen
        message={error}
        onRetry={() => void loadSnapshot(client)}
        onSignOut={handleSignOut}
      />
    );
  }

  if (!snapshot || isLoading) {
    return <LoadingScreen label="Loading CRM workspace" />;
  }

  return (
    <CrmWorkspace
      client={client}
      notice={notice}
      error={error}
      snapshot={snapshot}
      user={user}
      view={view}
      theme={theme}
      onViewChange={setView}
      onThemeChange={handleThemeChange}
      onReload={() => loadSnapshot(client)}
      onSignOut={handleSignOut}
      onNotice={setNotice}
      onError={setError}
    />
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6">
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-slate-950 p-4 shadow-sm xl:min-h-[calc(100vh-48px)]">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold text-white">
              WT
            </div>
            <div className="grid flex-1 gap-2">
              <div className="wt-skeleton h-3 w-32 rounded" />
              <div className="wt-skeleton h-3 w-40 rounded" />
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {Array.from({ length: 10 }, (_item, index) => (
              <div key={index} className="wt-skeleton h-9 rounded-md opacity-60" />
            ))}
          </div>
        </aside>
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold uppercase text-sky-700">{label}</p>
            <div className="mt-4 grid gap-3">
              <div className="wt-skeleton h-8 max-w-lg rounded" />
              <div className="wt-skeleton h-4 max-w-2xl rounded" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_item, index) => (
              <div
                key={index}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="wt-skeleton h-4 w-28 rounded" />
                <div className="wt-skeleton mt-5 h-9 w-24 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function SupabaseConfigScreen() {
  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6">
      <section className="mx-auto grid min-h-[calc(100vh-48px)] max-w-3xl place-items-center">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold text-white">
              WT
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                WeatherTech OS
              </p>
              <h1 className="text-2xl font-bold text-slate-950">
                Supabase connection required
              </h1>
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">
            Live CRM mode requires Supabase environment variables before dashboard,
            leads, customers, estimates, scopes, and jobs can load.
          </p>
          <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            <code>NEXT_PUBLIC_SUPABASE_URL</code>
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>
          </div>
        </div>
      </section>
    </main>
  );
}

function LoadErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-950 sm:p-6">
      <section className="mx-auto grid min-h-[calc(100vh-48px)] max-w-3xl place-items-center">
        <div className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase text-red-700">
            Live data error
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Unable to load CRM records
          </h1>
          <p className="mt-3 text-sm text-slate-600">{message}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <RefreshCcw className="h-4 w-4" />
              Retry
            </button>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

type AuthScreenProps = {
  client: SupabaseClient<Database>;
  notice: string;
  onNotice: (message: string) => void;
};

function AuthScreen({ client, notice, onNotice }: AuthScreenProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    const formData = new FormData(event.currentTarget);
    const email = getFormString(formData, "email");
    const password = getFormString(formData, "password");

    const result =
      mode === "sign-in"
        ? await client.auth.signInWithPassword({ email, password })
        : await client.auth.signUp({ email, password });

    if (result.error) {
      setError(result.error.message);
    } else if (mode === "sign-up" && !result.data.session) {
      onNotice("Check your email to confirm your account.");
    } else {
      onNotice("Signed in.");
    }

    setIsSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-48px)] max-w-5xl place-items-center">
        <section className="grid w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:grid-cols-[1fr_420px]">
          <div className="bg-slate-950 p-8 text-white sm:p-10">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold">
                WT
              </div>
              <div>
                <p className="text-sm font-semibold uppercase text-sky-300">
                  WeatherTech OS
                </p>
                <p className="text-sm text-slate-300">Roofing and painting CRM</p>
              </div>
            </div>
            <h1 className="mt-12 max-w-xl text-4xl font-bold">
              Sign in to manage leads, customers, and pipeline activity.
            </h1>
            <div className="mt-8 grid gap-3 text-sm text-slate-300">
              <AuthPoint label="Supabase authentication" />
              <AuthPoint label="Protected CRM records" />
              <AuthPoint label="Dashboard metrics and follow-ups" />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-950">
                {mode === "sign-in" ? "Welcome back" : "Create account"}
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                {mode === "sign-in"
                  ? "Use your WeatherTech OS account."
                  : "Create a Supabase Auth user for this workspace."}
              </p>
            </div>

            {notice ? <Message tone="success" message={notice} /> : null}
            {error ? <Message tone="error" message={error} /> : null}

            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Email
                <input
                  required
                  name="email"
                  type="email"
                  className="rounded-md border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="you@weathertech.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                Password
                <input
                  required
                  minLength={6}
                  name="password"
                  type="password"
                  className="rounded-md border border-slate-300 px-3 py-2.5 text-slate-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                  placeholder="At least 6 characters"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <ShieldCheck className="h-4 w-4" />
              {isSubmitting
                ? "Working"
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "sign-in" ? "sign-up" : "sign-in");
                setError("");
              }}
              className="mt-4 text-sm font-semibold text-sky-700 hover:text-sky-800"
            >
              {mode === "sign-in"
                ? "Create a new account"
                : "Sign in with an existing account"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function AuthPoint({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <CheckCircle2 className="h-4 w-4 text-emerald-300" />
      <span>{label}</span>
    </div>
  );
}

type CrmWorkspaceProps = {
  client: CrmClient;
  notice: string;
  error: string;
  snapshot: CrmSnapshot;
  user: User | null;
  view: WorkspaceView;
  theme: ThemeMode;
  onViewChange: (view: WorkspaceView) => void;
  onThemeChange: (theme: ThemeMode) => void;
  onReload: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function CrmWorkspace({
  client,
  notice,
  error,
  snapshot,
  user,
  view,
  theme,
  onViewChange,
  onThemeChange,
  onReload,
  onSignOut,
  onNotice,
  onError,
}: CrmWorkspaceProps) {
  const metrics = useMemo(() => calculateDashboardMetrics(snapshot), [snapshot]);
  const companyMap = useMemo(
    () => new Map(snapshot.companies.map((company) => [company.id, company])),
    [snapshot.companies],
  );
  const shortcuts = useMemo(
    () =>
      [
        { key: "1", view: "dashboard", label: "Dashboard" },
        { key: "2", view: "leads", label: "Leads" },
        { key: "3", view: "customers", label: "Customers" },
        { key: "4", view: "estimates", label: "Estimates" },
        { key: "5", view: "jobs", label: "Jobs" },
        { key: "6", view: "calendar", label: "Calendar" },
        { key: "7", view: "analytics", label: "Analytics" },
      ] satisfies { key: string; view: WorkspaceView; label: string }[],
    [],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(
          'input[placeholder^="Search"]',
        );
        searchInput?.focus();
        return;
      }

      if ((event.altKey || event.metaKey) && !isTyping) {
        const shortcut = shortcuts.find((item) => item.key === event.key);
        if (shortcut) {
          event.preventDefault();
          onViewChange(shortcut.view);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onViewChange, shortcuts]);

  return (
    <main className="min-h-screen bg-slate-50 p-3 text-slate-950 sm:p-6">
      <ToastViewport notice={notice} error={error} />
      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-white shadow-sm xl:min-h-[calc(100vh-48px)]">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-500 font-bold">
              WT
            </div>
            <div>
              <p className="text-sm font-semibold uppercase text-sky-300">
                WeatherTech
              </p>
              <p className="text-sm text-slate-300">Operations CRM</p>
            </div>
          </div>

          <nav className="mt-5 grid gap-1">
            <NavButton
              icon={Home}
              label="Dashboard"
              isActive={view === "dashboard"}
              onClick={() => onViewChange("dashboard")}
            />
            <NavButton
              icon={ClipboardList}
              label="Leads"
              isActive={view === "leads"}
              onClick={() => onViewChange("leads")}
            />
            <NavButton
              icon={Users}
              label="Customers"
              isActive={view === "customers"}
              onClick={() => onViewChange("customers")}
            />
            <NavButton
              icon={FileText}
              label="Estimates"
              isActive={view === "estimates"}
              onClick={() => onViewChange("estimates")}
            />
            <NavButton
              icon={WandSparkles}
              label="Scopes"
              isActive={view === "scopes"}
              onClick={() => onViewChange("scopes")}
            />
            <NavButton
              icon={CalendarClock}
              label="Jobs"
              isActive={view === "jobs"}
              onClick={() => onViewChange("jobs")}
            />
            <NavButton
              icon={CalendarClock}
              label="Calendar"
              isActive={view === "calendar"}
              onClick={() => onViewChange("calendar")}
            />
            <NavButton
              icon={Camera}
              label="Photos"
              isActive={view === "photos"}
              onClick={() => onViewChange("photos")}
            />
            <NavButton
              icon={ReceiptText}
              label="Invoices"
              isActive={view === "invoices"}
              onClick={() => onViewChange("invoices")}
            />
            <NavButton
              icon={Package}
              label="Materials"
              isActive={view === "orders"}
              onClick={() => onViewChange("orders")}
            />
            <NavButton
              icon={Bot}
              label="AI Tools"
              isActive={view === "ai"}
              onClick={() => onViewChange("ai")}
            />
            <NavButton
              icon={CloudSun}
              label="Weather"
              isActive={view === "weather"}
              onClick={() => onViewChange("weather")}
            />
            <NavButton
              icon={UserRound}
              label="Customer Portal"
              isActive={view === "customerPortal"}
              onClick={() => onViewChange("customerPortal")}
            />
            <NavButton
              icon={ShieldCheck}
              label="Employee Portal"
              isActive={view === "employeePortal"}
              onClick={() => onViewChange("employeePortal")}
            />
            <NavButton
              icon={MapPin}
              label="Routes"
              isActive={view === "routes"}
              onClick={() => onViewChange("routes")}
            />
            <NavButton
              icon={FileText}
              label="Change Orders"
              isActive={view === "changeOrders"}
              onClick={() => onViewChange("changeOrders")}
            />
            <NavButton
              icon={FileText}
              label="Documents"
              isActive={view === "documents"}
              onClick={() => onViewChange("documents")}
            />
            <NavButton
              icon={DollarSign}
              label="Analytics"
              isActive={view === "analytics"}
              onClick={() => onViewChange("analytics")}
            />
            <NavButton
              icon={Mail}
              label="Notifications"
              isActive={view === "notifications"}
              onClick={() => onViewChange("notifications")}
            />
            <NavButton
              icon={ShieldCheck}
              label="Integrations"
              isActive={view === "integrations"}
              onClick={() => onViewChange("integrations")}
            />
            <NavButton
              icon={Building2}
              label="Settings"
              isActive={view === "settings"}
              onClick={() => onViewChange("settings")}
            />
          </nav>

          <div className="mt-6 rounded-lg bg-slate-900 p-4 text-sm text-slate-300">
            <p className="font-semibold text-white">
              Supabase connected
            </p>
            <p className="mt-2">
              {user?.email}
            </p>
          </div>
        </aside>

        <section className="min-w-0 space-y-5">
          <header className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                WeatherTech OS
              </p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Roofing and painting CRM
              </h1>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 sm:mt-0">
              <button
                type="button"
                onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                {theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                type="button"
                onClick={() => void onReload()}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void onSignOut()}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </header>

          {notice ? <Message tone="success" message={notice} /> : null}
          {error ? <Message tone="error" message={error} /> : null}

          {view === "dashboard" ? (
            <DashboardView
              metrics={metrics}
              snapshot={snapshot}
              companyMap={companyMap}
              onCreateLead={() => onViewChange("leads")}
            />
          ) : null}

          {view === "leads" ? (
            <LeadsView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "customers" ? (
            <CustomersView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "estimates" ? (
            <EstimatesView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "scopes" ? (
            <ScopeGeneratorView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "jobs" ? (
            <JobsView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "calendar" ? (
            <CalendarView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "photos" ? (
            <PhotosView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "invoices" ? (
            <InvoicesView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "orders" ? (
            <MaterialOrdersView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "ai" ? (
            <AiToolsView
              client={client}
              snapshot={snapshot}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "weather" ? <WeatherDashboardView snapshot={snapshot} /> : null}

          {view === "customerPortal" ? (
            <CustomerPortalView
              client={client}
              snapshot={snapshot}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "employeePortal" ? (
            <EmployeePortalView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "routes" ? (
            <RoutePlannerView
              client={client}
              snapshot={snapshot}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "changeOrders" ? (
            <ChangeOrdersView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "documents" ? (
            <DocumentsAndSignaturesView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "analytics" ? (
            <AnalyticsView metrics={metrics} snapshot={snapshot} />
          ) : null}

          {view === "notifications" ? (
            <NotificationsView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "integrations" ? (
            <IntegrationsView
              client={client}
              snapshot={snapshot}
              companyMap={companyMap}
              onReload={onReload}
              onNotice={onNotice}
              onError={onError}
            />
          ) : null}

          {view === "settings" ? (
            <SettingsView snapshot={snapshot} />
          ) : null}
        </section>
      </div>
    </main>
  );
}

type NavButtonProps = {
  icon: typeof Home;
  label: string;
  isActive: boolean;
  onClick: () => void;
};

function NavButton({ icon: Icon, label, isActive, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium transition ${
        isActive
          ? "bg-sky-500 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {isActive ? <ChevronRight className="h-4 w-4" /> : null}
    </button>
  );
}

type DashboardViewProps = {
  metrics: ReturnType<typeof calculateDashboardMetrics>;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onCreateLead: () => void;
};

function DashboardView({
  metrics,
  snapshot,
  companyMap,
  onCreateLead,
}: DashboardViewProps) {
  const today = todayIsoDate();
  const urgentLeads = snapshot.leads.filter(
    (lead) => lead.priority === "urgent" || lead.next_follow_up === today,
  );
  const activeJobIdsWithUpcomingEvents = new Set(
    snapshot.scheduleEvents
      .filter(
        (event) =>
          event.job_id &&
          event.status === "scheduled" &&
          event.start_at.slice(0, 10) >= today,
      )
      .map((event) => event.job_id as string),
  );
  const overdueInvoices = snapshot.invoices.filter(
    (invoice) =>
      invoice.balance_due > 0 &&
      invoice.due_date !== null &&
      invoice.due_date < today &&
      invoice.status !== "paid" &&
      invoice.status !== "void",
  );
  const jobsNeedingSchedule = snapshot.jobs.filter(
    (job) =>
      (job.status === "scheduled" || job.status === "in_progress") &&
      !activeJobIdsWithUpcomingEvents.has(job.id),
  );
  const estimatesMissingDocuments = snapshot.estimates.filter(
    (estimate) =>
      (estimate.status === "sent" || estimate.status === "approved") &&
      !snapshot.documents.some((document) => document.estimate_id === estimate.id),
  );
  const invoicesMissingDocuments = snapshot.invoices.filter(
    (invoice) =>
      invoice.status !== "draft" &&
      !snapshot.documents.some((document) => document.invoice_id === invoice.id),
  );
  const scopesMissingDocuments = snapshot.scopes.filter(
    (scope) =>
      (scope.status === "ready" || scope.status === "approved") &&
      !snapshot.documents.some((document) => document.estimate_id === scope.estimate_id),
  );
  const blockedJobs = snapshot.jobs.filter((job) => job.status === "blocked");
  const pendingChangeOrders = snapshot.changeOrders.filter(
    (changeOrder) =>
      changeOrder.status === "draft" || changeOrder.status === "sent",
  );
  const queuedCommunications =
    snapshot.emailMessages.filter((message) => message.status === "queued").length +
    snapshot.smsMessages.filter((message) => message.status === "queued").length;
  const documentsToGenerate =
    estimatesMissingDocuments.length +
    invoicesMissingDocuments.length +
    scopesMissingDocuments.length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Open leads" value={metrics.openLeads} icon={ClipboardList} />
        <MetricCard
          label="Pipeline value"
          value={formatMoney(metrics.pipelineValue)}
          icon={DollarSign}
        />
        <MetricCard label="Customers" value={metrics.customers} icon={Users} />
        <MetricCard
          label="Open estimates"
          value={metrics.openEstimates}
          icon={FileText}
        />
        <MetricCard
          label="Estimate value"
          value={formatMoney(metrics.estimateValue)}
          icon={DollarSign}
        />
        <MetricCard
          label="Scopes ready"
          value={metrics.scopesReady}
          icon={WandSparkles}
        />
        <MetricCard
          label="Active jobs"
          value={metrics.activeJobs}
          icon={CalendarClock}
        />
        <MetricCard
          label="Scheduled"
          value={metrics.scheduledEvents}
          icon={CalendarClock}
        />
        <MetricCard
          label="Unpaid invoices"
          value={formatMoney(metrics.unpaidInvoices)}
          icon={ReceiptText}
        />
        <MetricCard
          label="Pending orders"
          value={metrics.materialOrdersPending}
          icon={Package}
        />
        <MetricCard
          label="Revenue"
          value={formatMoney(metrics.revenueCollected)}
          icon={DollarSign}
        />
        <MetricCard
          label="Close rate"
          value={`${metrics.closeRate}%`}
          icon={CheckCircle2}
        />
        <MetricCard
          label="Production"
          value={`${metrics.productionCompletion}%`}
          icon={CalendarClock}
        />
        <MetricCard
          label="Reminders"
          value={metrics.unreadNotifications}
          icon={Mail}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <ChartPanel
          title="Revenue movement"
          rows={[
            { label: "Pipeline", value: metrics.pipelineValue, valueLabel: formatMoney(metrics.pipelineValue) },
            { label: "Estimates", value: metrics.estimateValue, valueLabel: formatMoney(metrics.estimateValue) },
            {
              label: "Invoiced",
              value: snapshot.invoices.reduce((total, invoice) => total + invoice.total, 0),
              valueLabel: formatMoney(snapshot.invoices.reduce((total, invoice) => total + invoice.total, 0)),
            },
            { label: "Collected", value: metrics.revenueCollected, valueLabel: formatMoney(metrics.revenueCollected) },
          ]}
        />
        <ChartPanel
          title="Operations health"
          rows={[
            { label: "Close rate", value: metrics.closeRate, valueLabel: `${metrics.closeRate}%` },
            { label: "Production", value: metrics.productionCompletion, valueLabel: `${metrics.productionCompletion}%` },
            { label: "Open jobs", value: metrics.activeJobs, valueLabel: String(metrics.activeJobs) },
            { label: "Reminders", value: metrics.unreadNotifications, valueLabel: String(metrics.unreadNotifications) },
          ]}
        />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Operations action center
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Daily priorities across money, schedule, documents, production, and communications.
            </p>
          </div>
          <Badge
            label={`${overdueInvoices.length + jobsNeedingSchedule.length + documentsToGenerate + blockedJobs.length + pendingChangeOrders.length + queuedCommunications} active`}
            tone="amber"
          />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          <ActionCenterCard
            icon={ReceiptText}
            label="Overdue balances"
            value={overdueInvoices.length}
            detail={formatMoney(
              overdueInvoices.reduce((total, invoice) => total + invoice.balance_due, 0),
            )}
            items={overdueInvoices.slice(0, 3).map((invoice) => invoice.invoice_number)}
          />
          <ActionCenterCard
            icon={CalendarClock}
            label="Jobs needing schedule"
            value={jobsNeedingSchedule.length}
            detail="No upcoming scheduled event"
            items={jobsNeedingSchedule.slice(0, 3).map((job) => job.title)}
          />
          <ActionCenterCard
            icon={FileText}
            label="Documents to generate"
            value={documentsToGenerate}
            detail="Estimate, invoice, or scope packets"
            items={[
              ...estimatesMissingDocuments.map((estimate) => estimate.title),
              ...invoicesMissingDocuments.map((invoice) => invoice.invoice_number),
              ...scopesMissingDocuments.map((scope) => scope.title),
            ].slice(0, 3)}
          />
          <ActionCenterCard
            icon={ShieldCheck}
            label="Blocked production"
            value={blockedJobs.length}
            detail="Needs operational review"
            items={blockedJobs.slice(0, 3).map((job) => job.title)}
          />
          <ActionCenterCard
            icon={ReceiptText}
            label="Pending change orders"
            value={pendingChangeOrders.length}
            detail={formatMoney(
              pendingChangeOrders.reduce(
                (total, changeOrder) => total + changeOrder.total,
                0,
              ),
            )}
            items={pendingChangeOrders.slice(0, 3).map((changeOrder) => changeOrder.title)}
          />
          <ActionCenterCard
            icon={MessageSquare}
            label="Queued communications"
            value={queuedCommunications}
            detail="Email and SMS waiting to send"
            items={[
              ...snapshot.emailMessages
                .filter((message) => message.status === "queued")
                .map((message) => message.subject),
              ...snapshot.smsMessages
                .filter((message) => message.status === "queued")
                .map((message) => message.body),
            ].slice(0, 3)}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_420px]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Lead pipeline</h2>
              <p className="mt-1 text-sm text-slate-500">
                Active opportunities by status.
              </p>
            </div>
            <button
              type="button"
              onClick={onCreateLead}
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              New lead
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {leadStatuses.slice(0, 4).map((status) => {
              const leads = snapshot.leads.filter((lead) => lead.status === status.value);
              const value = leads.reduce((total, lead) => total + lead.estimated_value, 0);

              return (
                <div
                  key={status.value}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-sm font-semibold text-slate-600">{status.label}</p>
                  <div className="mt-3 flex items-end justify-between">
                    <p className="text-3xl font-bold text-slate-950">{leads.length}</p>
                    <p className="text-sm font-semibold text-slate-700">
                      {formatMoney(value)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">Priority queue</h2>
          <div className="mt-4 space-y-3">
            {urgentLeads.length ? (
              urgentLeads.map((lead) => (
                <LeadMiniCard
                  key={lead.id}
                  lead={lead}
                  company={companyMap.get(lead.company_id)}
                />
              ))
            ) : (
              <EmptyState label="No urgent follow-ups." />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: string | number;
  icon: typeof Home;
};

function ActionCenterCard({
  icon: Icon,
  label,
  value,
  detail,
  items,
}: {
  icon: typeof Home;
  label: string;
  value: number;
  detail: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-sky-600" />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-700">{detail}</p>
      <div className="mt-3 grid gap-1.5">
        {items.length ? (
          items.map((item, index) => (
            <p key={`${item}-${index}`} className="truncate text-sm text-slate-500">
              {item}
            </p>
          ))
        ) : (
          <p className="text-sm text-slate-500">No action needed.</p>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <Icon className="h-5 w-5 text-sky-600" />
      </div>
      <p className="mt-4 text-3xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ChartPanel({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; valueLabel: string }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        <BarChartIcon />
      </div>
      <div className="mt-5 grid gap-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-slate-600">{row.label}</span>
              <span className="font-bold text-slate-950">{row.valueLabel}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.max((row.value / max) * 100, 6)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BarChartIcon() {
  return (
    <div className="flex h-9 w-9 items-end justify-center gap-1 rounded-md bg-sky-100 p-2 text-sky-700">
      <span className="h-3 w-1.5 rounded bg-current" />
      <span className="h-5 w-1.5 rounded bg-current" />
      <span className="h-2 w-1.5 rounded bg-current" />
    </div>
  );
}

type LeadsViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function LeadsView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: LeadsViewProps) {
  const [selectedLeadId, setSelectedLeadId] = useState(snapshot.leads[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [isCreating, setIsCreating] = useState(false);

  const selectedLead =
    snapshot.leads.find((lead) => lead.id === selectedLeadId) ?? snapshot.leads[0];

  const filteredLeads = snapshot.leads.filter((lead) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      lead.contact_name.toLowerCase().includes(query) ||
      lead.property_address.toLowerCase().includes(query) ||
      lead.source.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || lead.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const {
    page: leadPage,
    pageCount: leadPageCount,
    setPage: setLeadPage,
    pagedItems: pagedLeads,
  } = usePagination(filteredLeads);

  const handleCreateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setIsCreating(true);
    onError("");

    try {
      const formData = new FormData(form);
      await createLead(client, {
        company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
        contact_name: getFormString(formData, "contact_name"),
        phone: getOptionalFormString(formData, "phone"),
        email: getOptionalFormString(formData, "email"),
        property_address: getFormString(formData, "property_address"),
        city: getOptionalFormString(formData, "city"),
        state: getFormString(formData, "state", "AZ"),
        postal_code: getOptionalFormString(formData, "postal_code"),
        service_type: getFormString(formData, "service_type", "roofing") as ServiceType,
        source: getFormString(formData, "source", "Website"),
        priority: getFormString(formData, "priority", "normal") as LeadPriority,
        estimated_value: getFormNumber(formData, "estimated_value"),
        next_follow_up: getOptionalFormString(formData, "next_follow_up"),
        notes: getOptionalFormString(formData, "notes"),
      });
      form.reset();
      await onReload();
      onNotice("Lead created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to create lead.",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateLead = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedLead) {
      return;
    }

    try {
      const formData = new FormData(event.currentTarget);
      await updateLead(client, selectedLead.id, {
        status: getFormString(formData, "status", selectedLead.status) as LeadStatus,
        priority: getFormString(
          formData,
          "priority",
          selectedLead.priority,
        ) as LeadPriority,
        estimated_value: getFormNumber(formData, "estimated_value"),
        next_follow_up: getOptionalFormString(formData, "next_follow_up"),
        notes: getOptionalFormString(formData, "notes"),
      });
      await onReload();
      onNotice("Lead updated.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to update lead.",
      );
    }
  };

  const handleConvertLead = async () => {
    if (!selectedLead) {
      return;
    }

    try {
      await convertLeadToCustomer(client, selectedLead);
      await onReload();
      onNotice("Lead converted to customer.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to convert lead.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Leads CRM</h2>
              <p className="mt-1 text-sm text-slate-500">
                Intake, qualify, follow up, and convert opportunities.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
                  placeholder="Search leads"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as LeadStatus | "all")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="all">All statuses</option>
                {leadStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {pagedLeads.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => setSelectedLeadId(lead.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[1fr_120px_130px_120px] lg:items-center ${
                selectedLead?.id === lead.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">{lead.contact_name}</p>
                <p className="mt-1 text-sm text-slate-500">{lead.property_address}</p>
              </div>
              <Badge label={statusLabel(lead.status)} tone="blue" />
              <span className="text-sm text-slate-600">
                {companyMap.get(lead.company_id)?.name ?? "Company"}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(lead.estimated_value)}
              </span>
            </button>
          ))}

          {!filteredLeads.length ? <EmptyState label="No leads match this view." /> : null}
        </div>
        <PaginationControls
          page={leadPage}
          pageCount={leadPageCount}
          total={filteredLeads.length}
          onPageChange={setLeadPage}
        />
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">New lead</h3>
          <LeadCreateForm
            companies={snapshot.companies}
            isSubmitting={isCreating}
            onSubmit={handleCreateLead}
          />
        </section>

        {selectedLead ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-950">
                  {selectedLead.contact_name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {serviceLabel(selectedLead.service_type)} lead from {selectedLead.source}
                </p>
              </div>
              <Badge label={selectedLead.priority} tone="amber" />
            </div>

            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <ContactLine icon={Phone} value={selectedLead.phone} />
              <ContactLine icon={Mail} value={selectedLead.email} />
              <ContactLine icon={Building2} value={selectedLead.property_address} />
            </div>

            <form onSubmit={handleUpdateLead} className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Status
                  <select
                    name="status"
                    defaultValue={selectedLead.status}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {leadStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Priority
                  <select
                    name="priority"
                    defaultValue={selectedLead.priority}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {leadPriorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>
                        {priority.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Value
                  <input
                    name="estimated_value"
                    defaultValue={selectedLead.estimated_value}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Follow-up
                  <input
                    name="next_follow_up"
                    type="date"
                    defaultValue={selectedLead.next_follow_up ?? ""}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Notes
                <textarea
                  name="notes"
                  defaultValue={selectedLead.notes ?? ""}
                  className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Save lead
                </button>
                <button
                  type="button"
                  onClick={() => void handleConvertLead()}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Convert
                </button>
              </div>
            </form>
          </section>
        ) : null}
      </aside>
    </div>
  );
}

type LeadCreateFormProps = {
  companies: CompanyRecord[];
  isSubmitting: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function LeadCreateForm({ companies, isSubmitting, onSubmit }: LeadCreateFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <label className="grid gap-1 text-sm font-medium text-slate-700">
        Company
        <select
          name="company_id"
          required
          className="rounded-md border border-slate-300 px-3 py-2"
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </label>
      <input
        required
        name="contact_name"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Lead or customer name"
      />
      <input
        required
        name="property_address"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Property address"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="phone"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Phone"
        />
        <input
          name="email"
          type="email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Email"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="city"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="City"
        />
        <input
          name="state"
          defaultValue="AZ"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="State"
        />
        <input
          name="postal_code"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="ZIP"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="service_type"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {serviceTypes.map((service) => (
            <option key={service.value} value={service.value}>
              {service.label}
            </option>
          ))}
        </select>
        <select
          name="priority"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {leadPriorities.map((priority) => (
            <option key={priority.value} value={priority.value}>
              {priority.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="source"
          defaultValue="Website"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Lead source"
        />
        <input
          name="estimated_value"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Estimated value"
        />
      </div>
      <input
        name="next_follow_up"
        type="date"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <textarea
        name="notes"
        className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Notes"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Plus className="h-4 w-4" />
        {isSubmitting ? "Saving" : "Create lead"}
      </button>
    </form>
  );
}

type CustomersViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function CustomersView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: CustomersViewProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    snapshot.customers[0]?.id ?? "",
  );
  const [search, setSearch] = useState("");
  const selectedCustomer =
    snapshot.customers.find((customer) => customer.id === selectedCustomerId) ??
    snapshot.customers[0];

  const filteredCustomers = snapshot.customers.filter((customer) => {
    const query = search.toLowerCase();
    return (
      !query ||
      customer.display_name.toLowerCase().includes(query) ||
      customer.contact_name.toLowerCase().includes(query) ||
      customer.property_address.toLowerCase().includes(query)
    );
  });
  const {
    page: customerPage,
    pageCount: customerPageCount,
    setPage: setCustomerPage,
    pagedItems: pagedCustomers,
  } = usePagination(filteredCustomers);

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    onError("");

    try {
      const formData = new FormData(form);
      await createCustomer(client, {
        company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
        display_name: getFormString(formData, "display_name"),
        contact_name: getFormString(formData, "contact_name"),
        phone: getOptionalFormString(formData, "phone"),
        email: getOptionalFormString(formData, "email"),
        property_address: getFormString(formData, "property_address"),
        city: getOptionalFormString(formData, "city"),
        state: getFormString(formData, "state", "AZ"),
        postal_code: getOptionalFormString(formData, "postal_code"),
        customer_type: getFormString(
          formData,
          "customer_type",
          "homeowner",
        ) as CustomerType,
        status: getFormString(formData, "status", "active") as CustomerStatus,
        notes: getOptionalFormString(formData, "notes"),
      });
      form.reset();
      await onReload();
      onNotice("Customer created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to create customer.",
      );
    }
  };

  const handleUpdateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedCustomer) {
      return;
    }

    try {
      const formData = new FormData(event.currentTarget);
      await updateCustomer(client, selectedCustomer.id, {
        status: getFormString(
          formData,
          "status",
          selectedCustomer.status,
        ) as CustomerStatus,
        customer_type: getFormString(
          formData,
          "customer_type",
          selectedCustomer.customer_type,
        ) as CustomerType,
        notes: getOptionalFormString(formData, "notes"),
      });
      await onReload();
      onNotice("Customer updated.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to update customer.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">
                Customer management
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Profiles, contacts, properties, and account status.
              </p>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-80"
                placeholder="Search customers"
              />
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {pagedCustomers.map((customer) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => setSelectedCustomerId(customer.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 lg:grid-cols-[1fr_130px_140px] lg:items-center ${
                selectedCustomer?.id === customer.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">
                  {customer.display_name}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {customer.property_address}
                </p>
              </div>
              <Badge label={customerStatusLabel(customer.status)} tone="green" />
              <span className="text-sm text-slate-600">
                {companyMap.get(customer.company_id)?.name ?? "Company"}
              </span>
            </button>
          ))}

          {!filteredCustomers.length ? (
            <EmptyState label="No customers match this view." />
          ) : null}
        </div>
        <PaginationControls
          page={customerPage}
          pageCount={customerPageCount}
          total={filteredCustomers.length}
          onPageChange={setCustomerPage}
        />
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">New customer</h3>
          <CustomerCreateForm companies={snapshot.companies} onSubmit={handleCreateCustomer} />
        </section>

        {selectedCustomer ? (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">
              {selectedCustomer.display_name}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {selectedCustomer.contact_name}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <ContactLine icon={Phone} value={selectedCustomer.phone} />
              <ContactLine icon={Mail} value={selectedCustomer.email} />
              <ContactLine icon={Building2} value={selectedCustomer.property_address} />
            </div>

            <form onSubmit={handleUpdateCustomer} className="mt-5 grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Status
                  <select
                    name="status"
                    defaultValue={selectedCustomer.status}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {customerStatuses.map((status) => (
                      <option key={status.value} value={status.value}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  Type
                  <select
                    name="customer_type"
                    defaultValue={selectedCustomer.customer_type}
                    className="rounded-md border border-slate-300 px-3 py-2"
                  >
                    {customerTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Notes
                <textarea
                  name="notes"
                  defaultValue={selectedCustomer.notes ?? ""}
                  className="min-h-24 rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <button
                type="submit"
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Save customer
              </button>
            </form>
            <CustomerProfilePanel snapshot={snapshot} customer={selectedCustomer} />
          </section>
        ) : null}
      </aside>
    </div>
  );
}

function CustomerProfilePanel({
  snapshot,
  customer,
}: {
  snapshot: CrmSnapshot;
  customer: CustomerRecord;
}) {
  const leads = snapshot.leads.filter((lead) => lead.customer_id === customer.id);
  const estimates = snapshot.estimates.filter(
    (estimate) => estimate.customer_id === customer.id,
  );
  const jobs = snapshot.jobs.filter((job) => job.customer_id === customer.id);
  const invoices = snapshot.invoices.filter(
    (invoice) => invoice.customer_id === customer.id,
  );
  const scopes = snapshot.scopes.filter((scope) => scope.customer_id === customer.id);
  const photos = snapshot.jobPhotos.filter((photo) => photo.customer_id === customer.id);
  const invoiceBalance = invoices.reduce(
    (total, invoice) => total + invoice.balance_due,
    0,
  );

  return (
    <div className="mt-5 border-t border-slate-200 pt-5">
      <h4 className="text-sm font-bold uppercase text-slate-500">Customer profile</h4>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <ProfileStat label="Jobs" value={jobs.length} />
        <ProfileStat label="Estimates" value={formatMoney(estimates.reduce((total, estimate) => total + estimate.total, 0))} />
        <ProfileStat label="Balance" value={formatMoney(invoiceBalance)} />
      </div>

      <div className="mt-4 grid gap-3">
        <RelatedList
          title="Active jobs"
          emptyLabel="No jobs linked yet."
          items={jobs.map((job) => ({
            id: job.id,
            title: job.title,
            meta: `${jobStatusLabel(job.status)} - ${formatDate(job.start_date)}`,
          }))}
        />
        <RelatedList
          title="Invoices"
          emptyLabel="No invoices linked yet."
          items={invoices.map((invoice) => ({
            id: invoice.id,
            title: invoice.invoice_number,
            meta: `${invoiceStatusLabel(invoice.status)} - ${formatMoney(invoice.balance_due)} due`,
          }))}
        />
        <RelatedList
          title="Scopes and photos"
          emptyLabel="No scope or photo activity yet."
          items={[
            ...scopes.map((scope) => ({
              id: scope.id,
              title: scope.title,
              meta: scopeStatusLabel(scope.status),
            })),
            ...photos.map((photo) => ({
              id: photo.id,
              title: photo.caption ?? "Job photo",
              meta: formatDate(photo.taken_at),
            })),
          ]}
        />
        {leads.length ? (
          <RelatedList
            title="Original leads"
            emptyLabel="No linked leads."
            items={leads.map((lead) => ({
              id: lead.id,
              title: lead.contact_name,
              meta: `${statusLabel(lead.status)} - ${formatMoney(lead.estimated_value)}`,
            }))}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function RelatedList({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: { id: string; title: string; meta: string }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200">
      <div className="border-b border-slate-200 px-3 py-2">
        <p className="text-sm font-bold text-slate-950">{title}</p>
      </div>
      {items.length ? (
        <div className="divide-y divide-slate-100">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="px-3 py-2">
              <p className="text-sm font-semibold text-slate-800">{item.title}</p>
              <p className="mt-0.5 text-xs text-slate-500">{item.meta}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-3 py-3 text-sm text-slate-500">{emptyLabel}</p>
      )}
    </div>
  );
}

type CustomerCreateFormProps = {
  companies: CompanyRecord[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function CustomerCreateForm({ companies, onSubmit }: CustomerCreateFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <select
        name="company_id"
        required
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <input
        required
        name="display_name"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Customer display name"
      />
      <input
        required
        name="contact_name"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Primary contact"
      />
      <input
        required
        name="property_address"
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Property address"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="phone"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Phone"
        />
        <input
          name="email"
          type="email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Email"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          name="city"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="City"
        />
        <input
          name="state"
          defaultValue="AZ"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="State"
        />
        <input
          name="postal_code"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="ZIP"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="customer_type"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {customerTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <select
          name="status"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {customerStatuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="notes"
        className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Notes"
      />
      <button
        type="submit"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
      >
        <Plus className="h-4 w-4" />
        Create customer
      </button>
    </form>
  );
}

type EstimatesViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function EstimatesView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: EstimatesViewProps) {
  const [selectedEstimateId, setSelectedEstimateId] = useState(
    snapshot.estimates[0]?.id ?? "new",
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EstimateStatus | "all">("all");

  const selectedEstimate =
    snapshot.estimates.find((estimate) => estimate.id === selectedEstimateId) ?? null;
  const selectedLineItems = selectedEstimate
    ? getEstimateLineItems(snapshot, selectedEstimate.id)
    : [];
  const filteredEstimates = snapshot.estimates.filter((estimate) => {
    const query = search.toLowerCase();
    const target = getEstimateTargetName(snapshot, estimate).toLowerCase();
    const matchesSearch =
      !query ||
      estimate.title.toLowerCase().includes(query) ||
      target.includes(query) ||
      estimateStatusLabel(estimate.status).toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || estimate.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const {
    page: estimatePage,
    pageCount: estimatePageCount,
    setPage: setEstimatePage,
    pagedItems: pagedEstimates,
  } = usePagination(filteredEstimates);
  const selectedEstimateJob = selectedEstimate
    ? snapshot.jobs.find((job) => job.estimate_id === selectedEstimate.id) ?? null
    : null;
  const selectedEstimateScope = selectedEstimate
    ? snapshot.scopes.find((scope) => scope.estimate_id === selectedEstimate.id) ?? null
    : null;

  const handleSaveEstimate = async (
    input: EstimateInput,
    lineItems: EstimateLineItemInput[],
  ) => {
    onError("");

    try {
      const savedEstimate = selectedEstimate
        ? await updateEstimate(client, selectedEstimate.id, input, lineItems)
        : await createEstimate(client, input, lineItems);

      setSelectedEstimateId(savedEstimate.id);
      await onReload();
      onNotice(selectedEstimate ? "Estimate updated." : "Estimate created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to save estimate.",
      );
    }
  };

  const handleCreateJobFromEstimate = async (estimate: EstimateRecord) => {
    if (selectedEstimateJob) {
      onNotice("This estimate already has a linked job.");
      return;
    }

    const customer = estimate.customer_id
      ? snapshot.customers.find((item) => item.id === estimate.customer_id)
      : null;
    const lead = estimate.lead_id
      ? snapshot.leads.find((item) => item.id === estimate.lead_id)
      : null;
    const propertyAddress =
      customer?.property_address ?? lead?.property_address ?? "Address to confirm";

    try {
      const job = await createJob(client, {
        company_id: estimate.company_id,
        customer_id: estimate.customer_id,
        lead_id: estimate.lead_id,
        estimate_id: estimate.id,
        scope_id: selectedEstimateScope?.id ?? null,
        title: `${estimate.title} Production`,
        service_type: estimate.service_type,
        status: "scheduled",
        start_date: null,
        end_date: null,
        crew_name: null,
        project_manager: null,
        property_address: propertyAddress,
        latitude: lead?.latitude ?? null,
        longitude: lead?.longitude ?? null,
        google_place_id: lead?.google_place_id ?? null,
        address_verified_at: lead?.address_verified_at ?? null,
        notes: `Created from approved estimate ${estimate.title}.`,
      });
      await onReload();
      onNotice(`Job created: ${job.title}`);
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to create job from estimate.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Estimates</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create priced proposals with labor, materials, tax, discounts, and margin.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
                  placeholder="Search estimates"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as EstimateStatus | "all")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
              >
                <option value="all">All statuses</option>
                {estimateStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedEstimateId("new")}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {pagedEstimates.map((estimate) => (
            <button
              key={estimate.id}
              type="button"
              onClick={() => setSelectedEstimateId(estimate.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[1fr_130px_140px_120px] xl:items-center ${
                selectedEstimate?.id === estimate.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">{estimate.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {getEstimateTargetName(snapshot, estimate)}
                </p>
              </div>
              <Badge label={estimateStatusLabel(estimate.status)} tone="blue" />
              <span className="text-sm text-slate-600">
                {companyMap.get(estimate.company_id)?.name ?? "Company"}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(estimate.total)}
              </span>
            </button>
          ))}

          {!filteredEstimates.length ? (
            <EmptyState label="No estimates match this view." />
          ) : null}
        </div>
        <PaginationControls
          page={estimatePage}
          pageCount={estimatePageCount}
          total={filteredEstimates.length}
          onPageChange={setEstimatePage}
        />
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                {selectedEstimate ? "Edit estimate" : "Create estimate"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Line items update totals before saving.
              </p>
            </div>
            <Calculator className="h-5 w-5 text-sky-600" />
          </div>
          <EstimateEditor
            key={selectedEstimate?.id ?? "new-estimate"}
            estimate={selectedEstimate}
            lineItems={selectedLineItems}
            snapshot={snapshot}
            onSave={handleSaveEstimate}
          />
        </section>

        <EstimatePdfPreview
          estimate={selectedEstimate}
          lineItems={selectedLineItems}
          snapshot={snapshot}
          company={selectedEstimate ? companyMap.get(selectedEstimate.company_id) : undefined}
        />
        <EstimateWorkflowPanel
          estimate={selectedEstimate}
          linkedJob={selectedEstimateJob}
          linkedScope={selectedEstimateScope}
          documents={snapshot.documents.filter(
            (document) => document.estimate_id === selectedEstimate?.id,
          )}
          onCreateJob={handleCreateJobFromEstimate}
        />
      </aside>
    </div>
  );
}

function EstimateEditor({
  estimate,
  lineItems,
  snapshot,
  onSave,
}: {
  estimate: EstimateRecord | null;
  lineItems: EstimateLineItemRecord[];
  snapshot: CrmSnapshot;
  onSave: (input: EstimateInput, lineItems: EstimateLineItemInput[]) => Promise<void>;
}) {
  const [draftLineItems, setDraftLineItems] = useState<EstimateLineItemInput[]>(
    lineItems.length
      ? lineItems.map((item) => ({
          id: item.id,
          category: item.category,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_cost: item.unit_cost,
          markup_rate: item.markup_rate,
          taxable: item.taxable,
          sort_order: item.sort_order,
        }))
      : [
          {
            category: "labor",
            name: "Labor",
            description: "",
            quantity: 1,
            unit: "project",
            unit_cost: 0,
            markup_rate: 0,
            taxable: false,
            sort_order: 0,
          },
          {
            category: "material",
            name: "Materials",
            description: "",
            quantity: 1,
            unit: "package",
            unit_cost: 0,
            markup_rate: 0,
            taxable: true,
            sort_order: 1,
          },
        ],
  );
  const [estimateControls, setEstimateControls] = useState({
    tax_rate: estimate?.tax_rate ?? 8.6,
    discount_type: estimate?.discount_type ?? "fixed",
    discount_value: estimate?.discount_value ?? 0,
    profit_margin_rate: estimate?.profit_margin_rate ?? 10,
  });
  const [isSaving, setIsSaving] = useState(false);
  const liveTotals = calculateEstimateTotals(estimateControls, draftLineItems);

  const updateLineItem = (
    index: number,
    updates: Partial<EstimateLineItemInput>,
  ) => {
    setDraftLineItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  };

  const addLineItem = (category: EstimateLineItemCategory) => {
    setDraftLineItems((items) => [
      ...items,
      {
        category,
        name: category === "labor" ? "Labor item" : "Material item",
        description: "",
        quantity: 1,
        unit: category === "labor" ? "hour" : "each",
        unit_cost: 0,
        markup_rate: 0,
        taxable: category !== "labor",
        sort_order: items.length,
      },
    ]);
  };

  const removeLineItem = (index: number) => {
    setDraftLineItems((items) => items.filter((_item, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const cleanLineItems = draftLineItems
      .filter((item) => item.name.trim())
      .map((item, index) => ({ ...item, sort_order: index }));

    try {
      setIsSaving(true);
      await onSave(
        {
          company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
          customer_id: getOptionalRelation(formData, "customer_id"),
          lead_id: getOptionalRelation(formData, "lead_id"),
          title: getFormString(formData, "title", "New estimate"),
          status: getFormString(formData, "status", "draft") as EstimateStatus,
          service_type: getFormString(formData, "service_type", "roofing") as ServiceType,
          issue_date: getFormString(formData, "issue_date", todayIsoDate()),
          expiration_date: getOptionalFormString(formData, "expiration_date"),
          tax_rate: estimateControls.tax_rate,
          discount_type: estimateControls.discount_type,
          discount_value: estimateControls.discount_value,
          profit_margin_rate: estimateControls.profit_margin_rate,
          notes: getOptionalFormString(formData, "notes"),
        },
        cleanLineItems,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Company
          <select
            name="company_id"
            required
            defaultValue={estimate?.company_id ?? snapshot.companies[0]?.id}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {snapshot.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Status
          <select
            name="status"
            defaultValue={estimate?.status ?? "draft"}
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            {estimateStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input
        required
        name="title"
        defaultValue={estimate?.title ?? ""}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Estimate title"
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <select
          name="customer_id"
          defaultValue={estimate?.customer_id ?? "none"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="none">No customer</option>
          {snapshot.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.display_name}
            </option>
          ))}
        </select>
        <select
          name="lead_id"
          defaultValue={estimate?.lead_id ?? "none"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="none">No lead</option>
          {snapshot.leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.contact_name}
            </option>
          ))}
        </select>
        <select
          name="service_type"
          defaultValue={estimate?.service_type ?? "roofing"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {serviceTypes.map((service) => (
            <option key={service.value} value={service.value}>
              {service.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Issue date
          <input
            name="issue_date"
            type="date"
            defaultValue={estimate?.issue_date ?? todayIsoDate()}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Expiration date
          <input
            name="expiration_date"
            type="date"
            defaultValue={estimate?.expiration_date ?? addDaysIsoDate(30)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
        <NumberControl
          label="Tax %"
          value={estimateControls.tax_rate}
          onChange={(value) =>
            setEstimateControls((controls) => ({ ...controls, tax_rate: value }))
          }
        />
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Discount
          <select
            value={estimateControls.discount_type}
            onChange={(event) =>
              setEstimateControls((controls) => ({
                ...controls,
                discount_type: event.target.value as "fixed" | "percent",
              }))
            }
            className="rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="fixed">Fixed</option>
            <option value="percent">Percent</option>
          </select>
        </label>
        <NumberControl
          label="Discount value"
          value={estimateControls.discount_value}
          onChange={(value) =>
            setEstimateControls((controls) => ({ ...controls, discount_value: value }))
          }
        />
        <NumberControl
          label="Profit %"
          value={estimateControls.profit_margin_rate}
          onChange={(value) =>
            setEstimateControls((controls) => ({
              ...controls,
              profit_margin_rate: value,
            }))
          }
        />
      </div>

      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <p className="text-sm font-bold text-slate-950">Line items</p>
          <div className="flex flex-wrap gap-2">
            {lineItemCategories.map((category) => (
              <button
                key={category.value}
                type="button"
                onClick={() => addLineItem(category.value)}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Add {category.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 p-3">
          {draftLineItems.map((item, index) => (
            <div key={`${item.id ?? "new"}-${index}`} className="rounded-lg bg-slate-50 p-3">
              <div className="grid gap-2 sm:grid-cols-[120px_1fr_88px_92px_92px_72px_40px]">
                <select
                  value={item.category}
                  onChange={(event) =>
                    updateLineItem(index, {
                      category: event.target.value as EstimateLineItemCategory,
                    })
                  }
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                >
                  {lineItemCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <input
                  value={item.name}
                  onChange={(event) => updateLineItem(index, { name: event.target.value })}
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="Item name"
                />
                <input
                  value={item.quantity}
                  onChange={(event) =>
                    updateLineItem(index, { quantity: Number(event.target.value) || 0 })
                  }
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="Qty"
                />
                <input
                  value={item.unit}
                  onChange={(event) => updateLineItem(index, { unit: event.target.value })}
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="Unit"
                />
                <input
                  value={item.unit_cost}
                  onChange={(event) =>
                    updateLineItem(index, { unit_cost: Number(event.target.value) || 0 })
                  }
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="Cost"
                />
                <label className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={item.taxable ?? true}
                    onChange={(event) =>
                      updateLineItem(index, { taxable: event.target.checked })
                    }
                  />
                  Tax
                </label>
                <button
                  type="button"
                  onClick={() => removeLineItem(index)}
                  className="grid place-items-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea
                value={item.description ?? ""}
                onChange={(event) =>
                  updateLineItem(index, { description: event.target.value })
                }
                className="mt-2 min-h-16 w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                placeholder="Description"
              />
              <p className="mt-2 text-right text-sm font-semibold text-slate-700">
                Line total: {formatMoney(calculateLineItemTotal(item))}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-2 text-sm">
          <TotalRow label="Labor" value={liveTotals.laborTotal} />
          <TotalRow label="Materials" value={liveTotals.materialTotal} />
          <TotalRow label="Subtotal" value={liveTotals.subtotal} />
          <TotalRow label="Discount" value={-liveTotals.discountTotal} />
          <TotalRow label="Tax" value={liveTotals.taxTotal} />
          <TotalRow label="Profit margin" value={liveTotals.profitMarginTotal} />
          <TotalRow label="Total" value={liveTotals.total} strong />
        </div>
      </div>

      <textarea
        name="notes"
        defaultValue={estimate?.notes ?? ""}
        className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Estimate notes"
      />

      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <FileText className="h-4 w-4" />
        {isSaving ? "Saving" : estimate ? "Save estimate" : "Create estimate"}
      </button>
    </form>
  );
}

function NumberControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="rounded-md border border-slate-300 px-3 py-2"
        inputMode="decimal"
      />
    </label>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between ${
        strong ? "border-t border-slate-200 pt-2 text-base font-bold" : ""
      }`}
    >
      <span>{label}</span>
      <span>{formatMoney(value)}</span>
    </div>
  );
}

function EstimatePdfPreview({
  estimate,
  lineItems,
  snapshot,
  company,
}: {
  estimate: EstimateRecord | null;
  lineItems: EstimateLineItemRecord[];
  snapshot: CrmSnapshot;
  company?: CompanyRecord;
}) {
  if (!estimate) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">PDF Preview</h3>
        <EmptyState label="Select or save an estimate to preview the customer PDF." />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-950">PDF Preview</h3>
          <p className="mt-1 text-sm text-slate-500">Customer-facing estimate layout.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 text-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">
              Estimate
            </p>
            <h4 className="mt-1 text-2xl font-bold text-slate-950">
              {estimate.title}
            </h4>
            <p className="mt-1 text-slate-500">
              Prepared by {company?.name ?? "WeatherTech OS"}
            </p>
          </div>
          <div className="text-right text-slate-600">
            <p>{estimate.issue_date}</p>
            <p>{estimate.expiration_date ? `Valid until ${estimate.expiration_date}` : ""}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Customer</p>
            <p className="mt-1 font-semibold text-slate-950">
              {getEstimateTargetName(snapshot, estimate)}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
            <p className="mt-1 font-semibold text-slate-950">
              {estimateStatusLabel(estimate.status)}
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-[1fr_80px_90px] bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-500">
            <span>Description</span>
            <span>Qty</span>
            <span className="text-right">Total</span>
          </div>
          {lineItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_80px_90px] border-t border-slate-100 px-3 py-3"
            >
              <div>
                <p className="font-semibold text-slate-950">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">{item.description}</p>
              </div>
              <span className="text-slate-600">
                {item.quantity} {item.unit}
              </span>
              <span className="text-right font-semibold text-slate-950">
                {formatMoney(item.total)}
              </span>
            </div>
          ))}
        </div>

        <div className="ml-auto mt-5 grid max-w-xs gap-2 text-sm">
          <TotalRow label="Subtotal" value={estimate.subtotal} />
          <TotalRow label="Discount" value={-estimate.discount_total} />
          <TotalRow label="Tax" value={estimate.tax_total} />
          <TotalRow label="Profit margin" value={estimate.profit_margin_total} />
          <TotalRow label="Total" value={estimate.total} strong />
        </div>

        {estimate.notes ? (
          <div className="mt-5 rounded-lg bg-slate-50 p-3 text-slate-600">
            {estimate.notes}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EstimateWorkflowPanel({
  estimate,
  linkedJob,
  linkedScope,
  documents,
  onCreateJob,
}: {
  estimate: EstimateRecord | null;
  linkedJob: JobRecord | null;
  linkedScope: ScopeRecord | null;
  documents: DocumentRecord[];
  onCreateJob: (estimate: EstimateRecord) => Promise<void>;
}) {
  if (!estimate) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">Production handoff</h3>
        <EmptyState label="Select an estimate to review handoff readiness." />
      </section>
    );
  }

  const canCreateJob = estimate.status === "approved" && linkedJob === null;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-950">Production handoff</h3>
          <p className="mt-1 text-sm text-slate-500">
            Move approved work into jobs with linked records intact.
          </p>
        </div>
        <Badge
          label={
            linkedJob
              ? "Job linked"
              : estimate.status === "approved"
                ? "Ready"
                : "Needs approval"
          }
          tone={linkedJob ? "green" : estimate.status === "approved" ? "blue" : "amber"}
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <ProfileStat
          label="Scope"
          value={linkedScope ? scopeStatusLabel(linkedScope.status) : "Not linked"}
        />
        <ProfileStat label="Documents" value={documents.length} />
        <ProfileStat
          label="Job"
          value={linkedJob ? jobStatusLabel(linkedJob.status) : "Not created"}
        />
      </div>
      {linkedJob ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-bold text-emerald-900">{linkedJob.title}</p>
          <p className="mt-1 text-sm text-emerald-700">
            {linkedJob.property_address} - {formatDate(linkedJob.start_date)}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void onCreateJob(estimate)}
        disabled={!canCreateJob}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <CalendarClock className="h-4 w-4" />
        {linkedJob
          ? "Production job already exists"
          : estimate.status === "approved"
            ? "Create production job"
            : "Approve estimate before job creation"}
      </button>
    </section>
  );
}

type ScopeDraft = {
  id: string | null;
  company_id: string;
  customer_id: string;
  lead_id: string;
  estimate_id: string;
  template_id: string;
  title: string;
  category: ScopeCategory;
  status: ScopeStatus;
  scope_body: string;
  notes: string;
};

function createScopeDraft(
  snapshot: CrmSnapshot,
  template?: ScopeTemplateRecord,
): ScopeDraft {
  return {
    id: null,
    company_id: snapshot.companies[0]?.id ?? "",
    customer_id: "none",
    lead_id: "none",
    estimate_id: "none",
    template_id: template?.id ?? "none",
    title: template ? `${template.title} Scope` : "Custom Scope",
    category: template?.category ?? "custom",
    status: "draft",
    scope_body: template?.template_body ?? "",
    notes: template ? `Generated from ${template.title} template.` : "",
  };
}

function createScopeDraftFromRecord(scope: ScopeRecord): ScopeDraft {
  return {
    id: scope.id,
    company_id: scope.company_id,
    customer_id: scope.customer_id ?? "none",
    lead_id: scope.lead_id ?? "none",
    estimate_id: scope.estimate_id ?? "none",
    template_id: scope.template_id ?? "none",
    title: scope.title,
    category: scope.category,
    status: scope.status,
    scope_body: scope.scope_body,
    notes: scope.notes ?? "",
  };
}

function scopeBadgeTone(status: ScopeStatus): "blue" | "green" | "amber" {
  if (status === "approved" || status === "ready") {
    return "green";
  }

  if (status === "sent") {
    return "blue";
  }

  return "amber";
}

type ScopeGeneratorViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function ScopeGeneratorView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: ScopeGeneratorViewProps) {
  const [draft, setDraft] = useState<ScopeDraft>(() =>
    createScopeDraft(snapshot, snapshot.scopeTemplates[0]),
  );
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ScopeStatus | "all">("all");
  const [isSaving, setIsSaving] = useState(false);

  const selectedTemplate =
    snapshot.scopeTemplates.find((template) => template.id === draft.template_id) ??
    null;
  const filteredScopes = snapshot.scopes.filter((scope) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      scope.title.toLowerCase().includes(query) ||
      scope.scope_body.toLowerCase().includes(query) ||
      getScopeTargetName(snapshot, scope).toLowerCase().includes(query) ||
      scopeCategoryLabels[scope.category].toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || scope.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const updateDraft = <Key extends keyof ScopeDraft>(
    key: Key,
    value: ScopeDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const applyTemplate = (template: ScopeTemplateRecord) => {
    setDraft((current) => ({
      ...createScopeDraft(snapshot, template),
      company_id: current.company_id || snapshot.companies[0]?.id || "",
      customer_id: current.customer_id,
      lead_id: current.lead_id,
      estimate_id: current.estimate_id,
    }));
  };

  const startCustomScope = () => {
    setDraft((current) => ({
      ...createScopeDraft(snapshot),
      company_id: current.company_id || snapshot.companies[0]?.id || "",
      customer_id: current.customer_id,
      lead_id: current.lead_id,
      estimate_id: current.estimate_id,
    }));
  };

  const handleCopyPrompt = async () => {
    if (!selectedTemplate) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedTemplate.ai_prompt);
      onNotice("AI prompt copied.");
    } catch {
      onError("Unable to copy the AI prompt.");
    }
  };

  const handleCopyScope = async () => {
    try {
      await navigator.clipboard.writeText(draft.scope_body);
      onNotice("Scope copied.");
    } catch {
      onError("Unable to copy the scope.");
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onError("");

    if (!draft.company_id) {
      onError("Add a company before saving a scope.");
      return;
    }

    if (!draft.title.trim() || !draft.scope_body.trim()) {
      onError("Scope title and scope body are required.");
      return;
    }

    const input: ScopeInput = {
      company_id: draft.company_id,
      customer_id: draft.customer_id === "none" ? null : draft.customer_id,
      lead_id: draft.lead_id === "none" ? null : draft.lead_id,
      estimate_id: draft.estimate_id === "none" ? null : draft.estimate_id,
      template_id: draft.template_id === "none" ? null : draft.template_id,
      title: draft.title.trim(),
      category: draft.category,
      status: draft.status,
      scope_body: draft.scope_body.trim(),
      notes: draft.notes.trim() || null,
    };

    try {
      setIsSaving(true);
      const savedScope = draft.id
        ? await updateScope(client, draft.id, input)
        : await createScope(client, input);

      setDraft(createScopeDraftFromRecord(savedScope));
      await onReload();
      onNotice(draft.id ? "Scope updated." : "Scope created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save scope.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-950">
                  Scope of Work Generator
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Template-driven scopes for roofing, painting, repairs, and custom work.
                </p>
              </div>
              <button
                type="button"
                onClick={startCustomScope}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                Custom
              </button>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
            {snapshot.scopeTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                className={`rounded-lg border p-4 text-left transition hover:border-sky-300 hover:bg-sky-50 ${
                  draft.template_id === template.id
                    ? "border-sky-300 bg-sky-50"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{template.title}</p>
                    <p className="mt-1 text-xs font-semibold uppercase text-sky-700">
                      {scopeCategoryLabels[template.category]}
                    </p>
                  </div>
                  <WandSparkles className="h-4 w-4 text-sky-600" />
                </div>
                <p className="mt-3 text-sm text-slate-500">{template.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Saved scopes</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Draft, ready, sent, and approved scope documents.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
                    placeholder="Search scopes"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as ScopeStatus | "all")
                  }
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                >
                  <option value="all">All statuses</option>
                  {scopeStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredScopes.map((scope) => (
              <button
                key={scope.id}
                type="button"
                onClick={() => setDraft(createScopeDraftFromRecord(scope))}
                className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[1fr_120px_150px_130px] xl:items-center ${
                  draft.id === scope.id ? "bg-sky-50" : "bg-white"
                }`}
              >
                <div>
                  <p className="font-semibold text-slate-950">{scope.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {getScopeTargetName(snapshot, scope)}
                  </p>
                </div>
                <Badge label={scopeStatusLabel(scope.status)} tone={scopeBadgeTone(scope.status)} />
                <span className="text-sm text-slate-600">
                  {scopeCategoryLabels[scope.category]}
                </span>
                <span className="text-sm text-slate-600">
                  {companyMap.get(scope.company_id)?.name ?? "Company"}
                </span>
              </button>
            ))}

            {!filteredScopes.length ? (
              <EmptyState label="No scopes match this view." />
            ) : null}
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-950">
                {draft.id ? "Edit scope" : "Create scope"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Build the customer-facing work description.
              </p>
            </div>
            <WandSparkles className="h-5 w-5 text-sky-600" />
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Title
              <input
                value={draft.title}
                onChange={(event) => updateDraft("title", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Company
                <select
                  value={draft.company_id}
                  onChange={(event) => updateDraft("company_id", event.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  {snapshot.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Template
                <select
                  value={draft.template_id}
                  onChange={(event) => {
                    const template = snapshot.scopeTemplates.find(
                      (item) => item.id === event.target.value,
                    );

                    if (template) {
                      applyTemplate(template);
                    } else {
                      updateDraft("template_id", "none");
                      updateDraft("category", "custom");
                    }
                  }}
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  <option value="none">No template</option>
                  {snapshot.scopeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Category
                <select
                  value={draft.category}
                  onChange={(event) =>
                    updateDraft("category", event.target.value as ScopeCategory)
                  }
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  {scopeCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Status
                <select
                  value={draft.status}
                  onChange={(event) =>
                    updateDraft("status", event.target.value as ScopeStatus)
                  }
                  className="rounded-md border border-slate-300 px-3 py-2"
                >
                  {scopeStatuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={draft.customer_id}
                onChange={(event) => updateDraft("customer_id", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No customer</option>
                {snapshot.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.display_name}
                  </option>
                ))}
              </select>
              <select
                value={draft.lead_id}
                onChange={(event) => updateDraft("lead_id", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No lead</option>
                {snapshot.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.contact_name}
                  </option>
                ))}
              </select>
              <select
                value={draft.estimate_id}
                onChange={(event) => updateDraft("estimate_id", event.target.value)}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No estimate</option>
                {snapshot.estimates.map((estimate) => (
                  <option key={estimate.id} value={estimate.id}>
                    {estimate.title}
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold text-slate-950">AI-ready prompt</p>
                  <button
                    type="button"
                    onClick={() => void handleCopyPrompt()}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </button>
                </div>
                <p className="mt-2 text-sm text-slate-600">{selectedTemplate.ai_prompt}</p>
              </div>
            ) : null}

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Custom scope editor
              <textarea
                value={draft.scope_body}
                onChange={(event) => updateDraft("scope_body", event.target.value)}
                className="min-h-72 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6"
              />
            </label>

            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Notes
              <textarea
                value={draft.notes}
                onChange={(event) => updateDraft("notes", event.target.value)}
                className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Internal notes"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <WandSparkles className="h-4 w-4" />
                {isSaving ? "Saving" : draft.id ? "Save scope" : "Create scope"}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyScope()}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copy scope
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

type JobsViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function JobsView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: JobsViewProps) {
  const [selectedJobId, setSelectedJobId] = useState(snapshot.jobs[0]?.id ?? "new");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<JobStatus | "all">("all");
  const [isSaving, setIsSaving] = useState(false);

  const selectedJob =
    snapshot.jobs.find((job) => job.id === selectedJobId) ?? null;
  const filteredJobs = snapshot.jobs.filter((job) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      job.title.toLowerCase().includes(query) ||
      job.property_address.toLowerCase().includes(query) ||
      getJobTargetName(snapshot, job).toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || job.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const {
    page: jobPage,
    pageCount: jobPageCount,
    setPage: setJobPage,
    pagedItems: pagedJobs,
  } = usePagination(filteredJobs);

  const handleSaveJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: JobInput = {
      company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
      customer_id: getOptionalRelation(formData, "customer_id"),
      lead_id: getOptionalRelation(formData, "lead_id"),
      estimate_id: getOptionalRelation(formData, "estimate_id"),
      scope_id: getOptionalRelation(formData, "scope_id"),
      title: getFormString(formData, "title", "New job"),
      service_type: getFormString(formData, "service_type", "roofing") as ServiceType,
      status: getFormString(formData, "status", "scheduled") as JobStatus,
      start_date: getOptionalFormString(formData, "start_date"),
      end_date: getOptionalFormString(formData, "end_date"),
      crew_name: getOptionalFormString(formData, "crew_name"),
      project_manager: getOptionalFormString(formData, "project_manager"),
      property_address: getFormString(formData, "property_address"),
      notes: getOptionalFormString(formData, "notes"),
    };

    try {
      setIsSaving(true);
      const savedJob = selectedJob
        ? await updateJob(client, selectedJob.id, input)
        : await createJob(client, input);
      setSelectedJobId(savedJob.id);
      await onReload();
      onNotice(selectedJob ? "Job updated." : "Job created.");
    } catch (currentError) {
      onError(currentError instanceof Error ? currentError.message : "Unable to save job.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Job management</h2>
              <p className="mt-1 text-sm text-slate-500">
                Track scheduled, active, blocked, and completed production work.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 sm:w-72"
                  placeholder="Search jobs"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as JobStatus | "all")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                {jobStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedJobId("new")}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {pagedJobs.map((job) => (
            <button
              key={job.id}
              type="button"
              onClick={() => setSelectedJobId(job.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[1fr_130px_150px_120px] xl:items-center ${
                selectedJob?.id === job.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">{job.title}</p>
                <p className="mt-1 text-sm text-slate-500">{job.property_address}</p>
              </div>
              <Badge label={jobStatusLabel(job.status)} tone={job.status === "blocked" ? "amber" : "blue"} />
              <span className="text-sm text-slate-600">
                {companyMap.get(job.company_id)?.name ?? "Company"}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatDate(job.start_date)}
              </span>
            </button>
          ))}

          {!filteredJobs.length ? <EmptyState label="No jobs match this view." /> : null}
        </div>
        <PaginationControls
          page={jobPage}
          pageCount={jobPageCount}
          total={filteredJobs.length}
          onPageChange={setJobPage}
        />
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">
            {selectedJob ? "Edit job" : "Create job"}
          </h3>
          <form
            key={selectedJob?.id ?? "new-job"}
            onSubmit={handleSaveJob}
            className="mt-4 grid gap-3"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                name="company_id"
                defaultValue={selectedJob?.company_id ?? snapshot.companies[0]?.id}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {snapshot.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <select
                name="status"
                defaultValue={selectedJob?.status ?? "scheduled"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {jobStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </div>
            <input
              required
              name="title"
              defaultValue={selectedJob?.title ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Job title"
            />
            <input
              required
              name="property_address"
              defaultValue={selectedJob?.property_address ?? ""}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Property address"
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                name="customer_id"
                defaultValue={selectedJob?.customer_id ?? "none"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No customer</option>
                {snapshot.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.display_name}
                  </option>
                ))}
              </select>
              <select
                name="lead_id"
                defaultValue={selectedJob?.lead_id ?? "none"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No lead</option>
                {snapshot.leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.contact_name}
                  </option>
                ))}
              </select>
              <select
                name="service_type"
                defaultValue={selectedJob?.service_type ?? "roofing"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {serviceTypes.map((service) => (
                  <option key={service.value} value={service.value}>
                    {service.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                name="estimate_id"
                defaultValue={selectedJob?.estimate_id ?? "none"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No estimate</option>
                {snapshot.estimates.map((estimate) => (
                  <option key={estimate.id} value={estimate.id}>
                    {estimate.title}
                  </option>
                ))}
              </select>
              <select
                name="scope_id"
                defaultValue={selectedJob?.scope_id ?? "none"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="none">No scope</option>
                {snapshot.scopes.map((scope) => (
                  <option key={scope.id} value={scope.id}>
                    {scope.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                Start
                <input
                  name="start_date"
                  type="date"
                  defaultValue={selectedJob?.start_date ?? ""}
                  className="rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                End
                <input
                  name="end_date"
                  type="date"
                  defaultValue={selectedJob?.end_date ?? ""}
                  className="rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="crew_name"
                defaultValue={selectedJob?.crew_name ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Crew"
              />
              <input
                name="project_manager"
                defaultValue={selectedJob?.project_manager ?? ""}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Project manager"
              />
            </div>
            <textarea
              name="notes"
              defaultValue={selectedJob?.notes ?? ""}
              className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Production notes"
            />
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <CalendarClock className="h-4 w-4" />
              {isSaving ? "Saving" : selectedJob ? "Save job" : "Create job"}
            </button>
          </form>
        </section>
      </aside>
    </div>
  );
}

type CalendarViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function CalendarView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: CalendarViewProps) {
  const [selectedEventId, setSelectedEventId] = useState(
    snapshot.scheduleEvents[0]?.id ?? "new",
  );
  const [isSaving, setIsSaving] = useState(false);
  const selectedEvent =
    snapshot.scheduleEvents.find((event) => event.id === selectedEventId) ?? null;
  const upcomingEvents = [...snapshot.scheduleEvents].sort(
    (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime(),
  );
  const weekDays = Array.from({ length: 7 }, (_item, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return date.toISOString().slice(0, 10);
  });

  const moveEventToDate = async (eventId: string, dateValue: string) => {
    const event = snapshot.scheduleEvents.find((item) => item.id === eventId);

    if (!event) {
      return;
    }

    const currentStart = new Date(event.start_at);
    const currentEnd = new Date(event.end_at);
    const duration = currentEnd.getTime() - currentStart.getTime();
    const nextStart = new Date(`${dateValue}T${event.start_at.slice(11, 16)}:00`);
    const nextEnd = new Date(nextStart.getTime() + duration);

    try {
      await updateScheduleEvent(client, event.id, {
        start_at: nextStart.toISOString(),
        end_at: nextEnd.toISOString(),
      });
      await onReload();
      onNotice("Event moved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to move event.",
      );
    }
  };

  const handleSaveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: ScheduleEventInput = {
      company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
      customer_id: getOptionalRelation(formData, "customer_id"),
      lead_id: getOptionalRelation(formData, "lead_id"),
      job_id: getOptionalRelation(formData, "job_id"),
      title: getFormString(formData, "title", "Scheduled event"),
      event_type: getFormString(
        formData,
        "event_type",
        "inspection",
      ) as ScheduleEventType,
      status: getFormString(
        formData,
        "status",
        "scheduled",
      ) as ScheduleEventStatus,
      start_at: fromDateTimeInputValue(getFormString(formData, "start_at")),
      end_at: fromDateTimeInputValue(getFormString(formData, "end_at")),
      location: getOptionalFormString(formData, "location"),
      notes: getOptionalFormString(formData, "notes"),
    };

    try {
      setIsSaving(true);
      const savedEvent = selectedEvent
        ? await updateScheduleEvent(client, selectedEvent.id, input)
        : await createScheduleEvent(client, input);
      setSelectedEventId(savedEvent.id);
      await onReload();
      onNotice(selectedEvent ? "Schedule updated." : "Event scheduled.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save event.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const defaultStart = new Date();
  defaultStart.setHours(defaultStart.getHours() + 2, 0, 0, 0);
  const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_440px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Calendar</h2>
              <p className="mt-1 text-sm text-slate-500">
                Schedule inspections, estimates, jobs, follow-ups, and deliveries.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEventId("new")}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Plus className="h-4 w-4" />
              New
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 p-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
            {weekDays.map((dateValue) => {
              const dayEvents = upcomingEvents.filter(
                (event) => event.start_at.slice(0, 10) === dateValue,
              );

              return (
                <div
                  key={dateValue}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const eventId = event.dataTransfer.getData("text/plain");
                    if (eventId) {
                      void moveEventToDate(eventId, dateValue);
                    }
                  }}
                  className="min-h-40 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3"
                >
                  <p className="text-sm font-bold text-slate-950">
                    {formatDate(dateValue)}
                  </p>
                  <div className="mt-3 grid gap-2">
                    {dayEvents.map((event) => (
                      <button
                        key={event.id}
                        type="button"
                        draggable
                        onDragStart={(dragEvent) =>
                          dragEvent.dataTransfer.setData("text/plain", event.id)
                        }
                        onClick={() => setSelectedEventId(event.id)}
                        className="rounded-md border border-slate-200 bg-white p-2 text-left text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300"
                      >
                        {event.title}
                        <span className="mt-1 block font-normal text-slate-500">
                          {formatDateTime(event.start_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 p-5 xl:grid-cols-2">
          {upcomingEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedEventId(event.id)}
              className={`rounded-lg border p-4 text-left transition hover:border-sky-300 hover:bg-sky-50 ${
                selectedEvent?.id === event.id
                  ? "border-sky-300 bg-sky-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-950">{event.title}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {getScheduleTargetName(snapshot, event)}
                  </p>
                </div>
                <Badge
                  label={scheduleEventStatusLabel(event.status)}
                  tone={event.status === "completed" ? "green" : "blue"}
                />
              </div>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                <ContactLine icon={CalendarClock} value={formatDateTime(event.start_at)} />
                <ContactLine icon={MapPin} value={event.location} />
              </div>
              <p className="mt-3 text-xs font-semibold uppercase text-sky-700">
                {scheduleEventTypeLabel(event.event_type)} -{" "}
                {companyMap.get(event.company_id)?.name ?? "Company"}
              </p>
            </button>
          ))}
          {!upcomingEvents.length ? <EmptyState label="No scheduled events yet." /> : null}
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">
          {selectedEvent ? "Edit event" : "Schedule event"}
        </h3>
        <form
          key={selectedEvent?.id ?? "new-event"}
          onSubmit={handleSaveEvent}
          className="mt-4 grid gap-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name="company_id"
              defaultValue={selectedEvent?.company_id ?? snapshot.companies[0]?.id}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {snapshot.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={selectedEvent?.status ?? "scheduled"}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {scheduleEventStatuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <input
            required
            name="title"
            defaultValue={selectedEvent?.title ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Event title"
          />
          <select
            name="event_type"
            defaultValue={selectedEvent?.event_type ?? "inspection"}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {scheduleEventTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              name="start_at"
              type="datetime-local"
              defaultValue={
                selectedEvent
                  ? toDateTimeInputValue(selectedEvent.start_at)
                  : toDateTimeInputValue(defaultStart.toISOString())
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              required
              name="end_at"
              type="datetime-local"
              defaultValue={
                selectedEvent
                  ? toDateTimeInputValue(selectedEvent.end_at)
                  : toDateTimeInputValue(defaultEnd.toISOString())
              }
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              name="job_id"
              defaultValue={selectedEvent?.job_id ?? "none"}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">No job</option>
              {snapshot.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
            <select
              name="customer_id"
              defaultValue={selectedEvent?.customer_id ?? "none"}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">No customer</option>
              {snapshot.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.display_name}
                </option>
              ))}
            </select>
            <select
              name="lead_id"
              defaultValue={selectedEvent?.lead_id ?? "none"}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">No lead</option>
              {snapshot.leads.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.contact_name}
                </option>
              ))}
            </select>
          </div>
          <input
            name="location"
            defaultValue={selectedEvent?.location ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Location"
          />
          <textarea
            name="notes"
            defaultValue={selectedEvent?.notes ?? ""}
            className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Schedule notes"
          />
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CalendarClock className="h-4 w-4" />
            {isSaving ? "Saving" : selectedEvent ? "Save event" : "Schedule event"}
          </button>
        </form>
      </aside>
    </div>
  );
}

type PhotosViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function PhotosView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: PhotosViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    try {
      setIsUploading(true);
      await createJobPhoto(
        client,
        {
          company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
          customer_id: getOptionalRelation(formData, "customer_id"),
          job_id: getOptionalRelation(formData, "job_id"),
          estimate_id: getOptionalRelation(formData, "estimate_id"),
          caption: getOptionalFormString(formData, "caption"),
          taken_at: getOptionalFormString(formData, "taken_at"),
        },
        file,
      );
      event.currentTarget.reset();
      setFile(null);
      await onReload();
      onNotice("Photo uploaded.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to upload photo.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-bold text-slate-950">Photos</h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload and organize job, estimate, and customer photos.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {snapshot.jobPhotos.map((photo) => (
            <article
              key={photo.id}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              {photo.file_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photo.file_url}
                  alt={photo.caption ?? "Job photo"}
                  className="h-44 w-full object-cover"
                />
              ) : (
                <div className="grid h-44 place-items-center bg-slate-100 text-slate-400">
                  <Camera className="h-8 w-8" />
                </div>
              )}
              <div className="p-4">
                <p className="font-semibold text-slate-950">
                  {photo.caption ?? "Job photo"}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {photo.job_id
                    ? snapshot.jobs.find((job) => job.id === photo.job_id)?.title
                    : getCustomerName(snapshot, photo.customer_id) ?? "Unassigned"}
                </p>
                <div className="mt-3 flex items-center justify-between text-xs font-semibold uppercase text-slate-500">
                  <span>{formatDate(photo.taken_at)}</span>
                  <span>{companyMap.get(photo.company_id)?.name ?? "Company"}</span>
                </div>
              </div>
            </article>
          ))}
          {!snapshot.jobPhotos.length ? <EmptyState label="No photos uploaded yet." /> : null}
        </div>
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">Upload photo</h3>
        <form onSubmit={handleUpload} className="mt-4 grid gap-3">
          <label className="grid gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-600">
            <Upload className="mx-auto h-6 w-6 text-sky-600" />
            {file ? file.name : "Choose job photo"}
            <input
              required={client !== null}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </label>
          <select
            name="company_id"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {snapshot.companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              name="job_id"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">No job</option>
              {snapshot.jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
            <select
              name="customer_id"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="none">No customer</option>
              {snapshot.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.display_name}
                </option>
              ))}
            </select>
          </div>
          <select
            name="estimate_id"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="none">No estimate</option>
            {snapshot.estimates.map((estimate) => (
              <option key={estimate.id} value={estimate.id}>
                {estimate.title}
              </option>
            ))}
          </select>
          <input
            name="caption"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Caption"
          />
          <input
            name="taken_at"
            type="date"
            defaultValue={todayIsoDate()}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Upload className="h-4 w-4" />
            {isUploading ? "Uploading" : "Upload photo"}
          </button>
        </form>
      </aside>
    </div>
  );
}

type InvoicesViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function InvoicesView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: InvoicesViewProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(
    snapshot.invoices[0]?.id ?? "new",
  );
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | "all">("all");
  const [search, setSearch] = useState("");
  const selectedInvoice =
    snapshot.invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
  const selectedLineItems = selectedInvoice
    ? getInvoiceLineItems(snapshot, selectedInvoice.id)
    : [];
  const filteredInvoices = snapshot.invoices.filter((invoice) => {
    const query = search.toLowerCase();
    const matchesSearch =
      !query ||
      invoice.invoice_number.toLowerCase().includes(query) ||
      invoice.title.toLowerCase().includes(query) ||
      getInvoiceTargetName(snapshot, invoice).toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const {
    page: invoicePage,
    pageCount: invoicePageCount,
    setPage: setInvoicePage,
    pagedItems: pagedInvoices,
  } = usePagination(filteredInvoices);

  const handleSaveInvoice = async (
    input: InvoiceInput,
    lineItems: InvoiceLineItemInput[],
  ) => {
    try {
      const savedInvoice = selectedInvoice
        ? await updateInvoice(client, selectedInvoice.id, input, lineItems)
        : await createInvoice(client, input, lineItems);
      setSelectedInvoiceId(savedInvoice.id);
      await onReload();
      onNotice(selectedInvoice ? "Invoice updated." : "Invoice created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save invoice.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Invoices</h2>
              <p className="mt-1 text-sm text-slate-500">
                Bill deposits, progress payments, and final balances.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm sm:w-72"
                  placeholder="Search invoices"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as InvoiceStatus | "all")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                {invoiceStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedInvoiceId("new")}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {pagedInvoices.map((invoice) => (
            <button
              key={invoice.id}
              type="button"
              onClick={() => setSelectedInvoiceId(invoice.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[130px_1fr_120px_130px] xl:items-center ${
                selectedInvoice?.id === invoice.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <span className="font-semibold text-slate-950">{invoice.invoice_number}</span>
              <div>
                <p className="font-semibold text-slate-950">{invoice.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {getInvoiceTargetName(snapshot, invoice)}
                </p>
              </div>
              <Badge
                label={invoiceStatusLabel(invoice.status)}
                tone={invoice.status === "paid" ? "green" : "blue"}
              />
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(invoice.balance_due)}
              </span>
            </button>
          ))}
          {!filteredInvoices.length ? (
            <EmptyState label="No invoices match this view." />
          ) : null}
        </div>
        <PaginationControls
          page={invoicePage}
          pageCount={invoicePageCount}
          total={filteredInvoices.length}
          onPageChange={setInvoicePage}
        />
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">
            {selectedInvoice ? "Edit invoice" : "Create invoice"}
          </h3>
          <InvoiceEditor
            key={selectedInvoice?.id ?? "new-invoice"}
            invoice={selectedInvoice}
            lineItems={selectedLineItems}
            snapshot={snapshot}
            onSave={handleSaveInvoice}
          />
        </section>
        <InvoicePreview
          invoice={selectedInvoice}
          lineItems={selectedLineItems}
          snapshot={snapshot}
          company={selectedInvoice ? companyMap.get(selectedInvoice.company_id) : undefined}
        />
      </aside>
    </div>
  );
}

function InvoiceEditor({
  invoice,
  lineItems,
  snapshot,
  onSave,
}: {
  invoice: InvoiceRecord | null;
  lineItems: InvoiceLineItemRecord[];
  snapshot: CrmSnapshot;
  onSave: (input: InvoiceInput, lineItems: InvoiceLineItemInput[]) => Promise<void>;
}) {
  const [defaultInvoiceNumber] = useState(
    () => invoice?.invoice_number ?? `INV-${String(snapshot.invoices.length + 1001)}`,
  );
  const [draftLineItems, setDraftLineItems] = useState<InvoiceLineItemInput[]>(
    lineItems.length
      ? lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          taxable: item.taxable,
          sort_order: item.sort_order,
        }))
      : [
          {
            description: "Project billing item",
            quantity: 1,
            unit_cost: 0,
            taxable: false,
            sort_order: 0,
          },
        ],
  );
  const [controls, setControls] = useState({
    tax_rate: invoice?.tax_rate ?? 0,
    discount_total: invoice?.discount_total ?? 0,
    amount_paid: invoice?.amount_paid ?? 0,
  });
  const [isSaving, setIsSaving] = useState(false);
  const totals = calculateInvoiceTotals(controls, draftLineItems);

  const updateLineItem = (index: number, updates: Partial<InvoiceLineItemInput>) => {
    setDraftLineItems((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const cleanItems = draftLineItems
      .filter((item) => item.description.trim())
      .map((item, index) => ({ ...item, sort_order: index }));

    try {
      setIsSaving(true);
      await onSave(
        {
          company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
          customer_id: getOptionalRelation(formData, "customer_id"),
          job_id: getOptionalRelation(formData, "job_id"),
          estimate_id: getOptionalRelation(formData, "estimate_id"),
          invoice_number: getFormString(
            formData,
            "invoice_number",
            defaultInvoiceNumber,
          ),
          title: getFormString(formData, "title", "New invoice"),
          status: getFormString(formData, "status", "draft") as InvoiceStatus,
          issue_date: getFormString(formData, "issue_date", todayIsoDate()),
          due_date: getOptionalFormString(formData, "due_date"),
          tax_rate: controls.tax_rate,
          discount_total: controls.discount_total,
          amount_paid: controls.amount_paid,
          notes: getOptionalFormString(formData, "notes"),
        },
        cleanItems,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="company_id"
          defaultValue={invoice?.company_id ?? snapshot.companies[0]?.id}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {snapshot.companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={invoice?.status ?? "draft"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {invoiceStatuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          required
          name="invoice_number"
          defaultValue={defaultInvoiceNumber}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Invoice number"
        />
        <input
          required
          name="title"
          defaultValue={invoice?.title ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Invoice title"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <select
          name="customer_id"
          defaultValue={invoice?.customer_id ?? "none"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="none">No customer</option>
          {snapshot.customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.display_name}
            </option>
          ))}
        </select>
        <select
          name="job_id"
          defaultValue={invoice?.job_id ?? "none"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="none">No job</option>
          {snapshot.jobs.map((job) => (
            <option key={job.id} value={job.id}>
              {job.title}
            </option>
          ))}
        </select>
        <select
          name="estimate_id"
          defaultValue={invoice?.estimate_id ?? "none"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="none">No estimate</option>
          {snapshot.estimates.map((estimate) => (
            <option key={estimate.id} value={estimate.id}>
              {estimate.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Issue
          <input
            name="issue_date"
            type="date"
            defaultValue={invoice?.issue_date ?? todayIsoDate()}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Due
          <input
            name="due_date"
            type="date"
            defaultValue={invoice?.due_date ?? addDaysIsoDate(7)}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
        <NumberControl
          label="Tax %"
          value={controls.tax_rate}
          onChange={(value) => setControls((current) => ({ ...current, tax_rate: value }))}
        />
        <NumberControl
          label="Discount"
          value={controls.discount_total}
          onChange={(value) =>
            setControls((current) => ({ ...current, discount_total: value }))
          }
        />
        <NumberControl
          label="Paid"
          value={controls.amount_paid}
          onChange={(value) =>
            setControls((current) => ({ ...current, amount_paid: value }))
          }
        />
      </div>
      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <p className="text-sm font-bold text-slate-950">Line items</p>
          <button
            type="button"
            onClick={() =>
              setDraftLineItems((items) => [
                ...items,
                {
                  description: "Invoice item",
                  quantity: 1,
                  unit_cost: 0,
                  taxable: true,
                  sort_order: items.length,
                },
              ])
            }
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add item
          </button>
        </div>
        <div className="grid gap-3 p-3">
          {draftLineItems.map((item, index) => (
            <div key={`${item.id ?? "new"}-${index}`} className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-[1fr_80px_100px_70px_40px]">
                <input
                  value={item.description}
                  onChange={(event) =>
                    updateLineItem(index, { description: event.target.value })
                  }
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  placeholder="Description"
                />
                <input
                  value={item.quantity}
                  onChange={(event) =>
                    updateLineItem(index, { quantity: Number(event.target.value) || 0 })
                  }
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="Qty"
                />
                <input
                  value={item.unit_cost}
                  onChange={(event) =>
                    updateLineItem(index, { unit_cost: Number(event.target.value) || 0 })
                  }
                  className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="Cost"
                />
                <label className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={item.taxable ?? true}
                    onChange={(event) =>
                      updateLineItem(index, { taxable: event.target.checked })
                    }
                  />
                  Tax
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setDraftLineItems((items) =>
                      items.filter((_item, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="grid place-items-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="text-right text-sm font-semibold text-slate-700">
                Line total: {formatMoney(calculateInvoiceLineItemTotal(item))}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-2 text-sm">
          <TotalRow label="Subtotal" value={totals.subtotal} />
          <TotalRow label="Discount" value={-totals.discountTotal} />
          <TotalRow label="Tax" value={totals.taxTotal} />
          <TotalRow label="Total" value={totals.total} strong />
          <TotalRow label="Balance due" value={totals.balanceDue} strong />
        </div>
      </div>
      <textarea
        name="notes"
        defaultValue={invoice?.notes ?? ""}
        className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Invoice notes"
      />
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <ReceiptText className="h-4 w-4" />
        {isSaving ? "Saving" : invoice ? "Save invoice" : "Create invoice"}
      </button>
    </form>
  );
}

function InvoicePreview({
  invoice,
  lineItems,
  snapshot,
  company,
}: {
  invoice: InvoiceRecord | null;
  lineItems: InvoiceLineItemRecord[];
  snapshot: CrmSnapshot;
  company?: CompanyRecord;
}) {
  if (!invoice) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">Invoice preview</h3>
        <EmptyState label="Select or save an invoice to preview it." />
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-950">Invoice preview</h3>
          <p className="mt-1 text-sm text-slate-500">{invoice.invoice_number}</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          Print
        </button>
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 p-5 text-sm">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase text-sky-700">Invoice</p>
            <h4 className="mt-1 text-2xl font-bold text-slate-950">{invoice.title}</h4>
            <p className="mt-1 text-slate-500">{company?.name ?? "WeatherTech OS"}</p>
          </div>
          <div className="text-right text-slate-600">
            <p>{formatDate(invoice.issue_date)}</p>
            <p>Due {formatDate(invoice.due_date)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-500">Bill to</p>
            <p className="mt-1 font-semibold text-slate-950">
              {getInvoiceTargetName(snapshot, invoice)}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs font-semibold uppercase text-slate-500">Balance</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {formatMoney(invoice.balance_due)}
            </p>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
          {lineItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_80px_100px] border-b border-slate-100 px-3 py-3 last:border-b-0"
            >
              <span className="font-semibold text-slate-950">{item.description}</span>
              <span>{item.quantity}</span>
              <span className="text-right font-semibold">{formatMoney(item.total)}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto mt-5 grid max-w-xs gap-2">
          <TotalRow label="Subtotal" value={invoice.subtotal} />
          <TotalRow label="Discount" value={-invoice.discount_total} />
          <TotalRow label="Tax" value={invoice.tax_total} />
          <TotalRow label="Total" value={invoice.total} strong />
          <TotalRow label="Paid" value={-invoice.amount_paid} />
          <TotalRow label="Balance due" value={invoice.balance_due} strong />
        </div>
      </div>
    </section>
  );
}

type MaterialOrdersViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function MaterialOrdersView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: MaterialOrdersViewProps) {
  const [selectedOrderId, setSelectedOrderId] = useState(
    snapshot.materialOrders[0]?.id ?? "new",
  );
  const [statusFilter, setStatusFilter] = useState<MaterialOrderStatus | "all">("all");
  const selectedOrder =
    snapshot.materialOrders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedItems = selectedOrder
    ? getMaterialOrderItems(snapshot, selectedOrder.id)
    : [];
  const filteredOrders = snapshot.materialOrders.filter(
    (order) => statusFilter === "all" || order.status === statusFilter,
  );
  const {
    page: orderPage,
    pageCount: orderPageCount,
    setPage: setOrderPage,
    pagedItems: pagedOrders,
  } = usePagination(filteredOrders);

  const handleSaveOrder = async (
    input: MaterialOrderInput,
    items: MaterialOrderItemInput[],
  ) => {
    try {
      const savedOrder = selectedOrder
        ? await updateMaterialOrder(client, selectedOrder.id, input, items)
        : await createMaterialOrder(client, input, items);
      setSelectedOrderId(savedOrder.id);
      await onReload();
      onNotice(selectedOrder ? "Material order updated." : "Material order created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to save material order.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Material orders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Track supplier orders, delivery dates, and job material costs.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as MaterialOrderStatus | "all")
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                {materialOrderStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSelectedOrderId("new")}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                <Plus className="h-4 w-4" />
                New
              </button>
            </div>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {pagedOrders.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrderId(order.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[1fr_130px_150px_120px] xl:items-center ${
                selectedOrder?.id === order.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">{order.supplier_name}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {getMaterialOrderTargetName(snapshot, order)}
                </p>
              </div>
              <Badge
                label={materialOrderStatusLabel(order.status)}
                tone={order.status === "received" ? "green" : "blue"}
              />
              <span className="text-sm text-slate-600">
                {companyMap.get(order.company_id)?.name ?? "Company"}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(order.total)}
              </span>
            </button>
          ))}
          {!filteredOrders.length ? (
            <EmptyState label="No material orders match this view." />
          ) : null}
        </div>
        <PaginationControls
          page={orderPage}
          pageCount={orderPageCount}
          total={filteredOrders.length}
          onPageChange={setOrderPage}
        />
      </section>

      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">
          {selectedOrder ? "Edit order" : "Create order"}
        </h3>
        <MaterialOrderEditor
          key={selectedOrder?.id ?? "new-order"}
          order={selectedOrder}
          items={selectedItems}
          snapshot={snapshot}
          onSave={handleSaveOrder}
        />
      </aside>
    </div>
  );
}

function MaterialOrderEditor({
  order,
  items,
  snapshot,
  onSave,
}: {
  order: MaterialOrderRecord | null;
  items: MaterialOrderItemRecord[];
  snapshot: CrmSnapshot;
  onSave: (
    input: MaterialOrderInput,
    items: MaterialOrderItemInput[],
  ) => Promise<void>;
}) {
  const [draftItems, setDraftItems] = useState<MaterialOrderItemInput[]>(
    items.length
      ? items.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_cost: item.unit_cost,
          sort_order: item.sort_order,
        }))
      : [
          {
            name: "Material item",
            quantity: 1,
            unit: "each",
            unit_cost: 0,
            sort_order: 0,
          },
        ],
  );
  const [isSaving, setIsSaving] = useState(false);
  const total = calculateMaterialOrderTotal(draftItems);

  const updateItem = (index: number, updates: Partial<MaterialOrderItemInput>) => {
    setDraftItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...updates } : item,
      ),
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const cleanItems = draftItems
      .filter((item) => item.name.trim())
      .map((item, index) => ({ ...item, sort_order: index }));

    try {
      setIsSaving(true);
      await onSave(
        {
          company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
          job_id: getOptionalRelation(formData, "job_id"),
          supplier_name: getFormString(formData, "supplier_name", "Supplier"),
          status: getFormString(formData, "status", "draft") as MaterialOrderStatus,
          requested_date: getFormString(formData, "requested_date", todayIsoDate()),
          expected_delivery_date: getOptionalFormString(
            formData,
            "expected_delivery_date",
          ),
          delivery_address: getOptionalFormString(formData, "delivery_address"),
          notes: getOptionalFormString(formData, "notes"),
        },
        cleanItems,
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          name="company_id"
          defaultValue={order?.company_id ?? snapshot.companies[0]?.id}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {snapshot.companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={order?.status ?? "draft"}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {materialOrderStatuses.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </div>
      <input
        required
        name="supplier_name"
        defaultValue={order?.supplier_name ?? ""}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Supplier"
      />
      <select
        name="job_id"
        defaultValue={order?.job_id ?? "none"}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <option value="none">No job</option>
        {snapshot.jobs.map((job) => (
          <option key={job.id} value={job.id}>
            {job.title}
          </option>
        ))}
      </select>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Requested
          <input
            name="requested_date"
            type="date"
            defaultValue={order?.requested_date ?? todayIsoDate()}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Delivery
          <input
            name="expected_delivery_date"
            type="date"
            defaultValue={order?.expected_delivery_date ?? ""}
            className="rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      <input
        name="delivery_address"
        defaultValue={order?.delivery_address ?? ""}
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Delivery address"
      />
      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 p-3">
          <p className="text-sm font-bold text-slate-950">Materials</p>
          <button
            type="button"
            onClick={() =>
              setDraftItems((current) => [
                ...current,
                {
                  name: "Material item",
                  quantity: 1,
                  unit: "each",
                  unit_cost: 0,
                  sort_order: current.length,
                },
              ])
            }
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Add item
          </button>
        </div>
        <div className="grid gap-3 p-3">
          {draftItems.map((item, index) => (
            <div
              key={`${item.id ?? "new"}-${index}`}
              className="grid gap-2 sm:grid-cols-[1fr_70px_80px_90px_40px]"
            >
              <input
                value={item.name}
                onChange={(event) => updateItem(index, { name: event.target.value })}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                placeholder="Material"
              />
              <input
                value={item.quantity}
                onChange={(event) =>
                  updateItem(index, { quantity: Number(event.target.value) || 0 })
                }
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                inputMode="decimal"
                placeholder="Qty"
              />
              <input
                value={item.unit ?? "each"}
                onChange={(event) => updateItem(index, { unit: event.target.value })}
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                placeholder="Unit"
              />
              <input
                value={item.unit_cost}
                onChange={(event) =>
                  updateItem(index, { unit_cost: Number(event.target.value) || 0 })
                }
                className="rounded-md border border-slate-300 px-2 py-2 text-sm"
                inputMode="decimal"
                placeholder="Cost"
              />
              <button
                type="button"
                onClick={() =>
                  setDraftItems((current) =>
                    current.filter((_item, itemIndex) => itemIndex !== index),
                  )
                }
                className="grid place-items-center rounded-md border border-slate-300 bg-white text-slate-500 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <TotalRow label="Order total" value={total} strong />
      </div>
      <textarea
        name="notes"
        defaultValue={order?.notes ?? ""}
        className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm"
        placeholder="Order notes"
      />
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Package className="h-4 w-4" />
        {isSaving ? "Saving" : order ? "Save order" : "Create order"}
      </button>
    </form>
  );
}

type AiToolsViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function AiToolsView({
  client,
  snapshot,
  onReload,
  onNotice,
  onError,
}: AiToolsViewProps) {
  const [scopeTemplateId, setScopeTemplateId] = useState(
    snapshot.scopeTemplates[0]?.id ?? "",
  );
  const [scopeCustomerId, setScopeCustomerId] = useState("none");
  const [scopeDraft, setScopeDraft] = useState("");
  const [estimateService, setEstimateService] = useState<ServiceType>("roofing");
  const [estimateSize, setEstimateSize] = useState(24);
  const [estimateComplexity, setEstimateComplexity] = useState("standard");
  const [estimateDraft, setEstimateDraft] = useState<EstimateLineItemInput[]>([]);
  const selectedTemplate = snapshot.scopeTemplates.find(
    (template) => template.id === scopeTemplateId,
  );
  const selectedCustomer =
    snapshot.customers.find((customer) => customer.id === scopeCustomerId) ?? null;

  const generateScope = () => {
    if (!selectedTemplate) {
      return;
    }

    const customerLine = selectedCustomer
      ? `${selectedCustomer.display_name} at ${selectedCustomer.property_address}`
      : "the selected property";
    setScopeDraft(
      `${selectedTemplate.template_body}\n\nProject-specific notes:\n- Customer/property: ${customerLine}\n- Confirm access, colors/materials, exclusions, and warranty before sending.\n\nAI prompt:\n${selectedTemplate.ai_prompt}`,
    );
  };

  const saveScopeDraft = async () => {
    if (!selectedTemplate || !scopeDraft.trim()) {
      onError("Generate a scope draft before saving.");
      return;
    }

    try {
      const savedScope = await createScope(client, {
        company_id: snapshot.companies[0]?.id ?? "",
        customer_id: selectedCustomer?.id ?? null,
        lead_id: null,
        estimate_id: null,
        template_id: selectedTemplate.id,
        title: `${selectedTemplate.title} AI Draft`,
        category: selectedTemplate.category,
        status: "draft",
        scope_body: scopeDraft,
        notes: "Created from AI Scope Writer.",
      });
      await createDocument(client, {
        company_id: savedScope.company_id,
        customer_id: savedScope.customer_id,
        job_id: null,
        estimate_id: null,
        invoice_id: null,
        change_order_id: null,
        title: `${savedScope.title} Document`,
        category: "scope",
        body: scopeDraft,
      });
      await onReload();
      onNotice("AI scope draft and document saved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save scope.",
      );
    }
  };

  const generateEstimate = () => {
    const complexityMultiplier =
      estimateComplexity === "premium" ? 1.25 : estimateComplexity === "repair" ? 0.55 : 1;
    const laborRate = estimateService === "painting" ? 95 : 135;
    const materialRate = estimateService === "painting" ? 58 : 118;
    const laborUnits = Math.max(estimateSize, 1);
    const materialUnits = Math.max(estimateSize, 1);

    setEstimateDraft([
      {
        category: "labor",
        name:
          estimateService === "painting"
            ? "Surface preparation and coating labor"
            : "Roofing production labor",
        description: "Generated assistant estimate. Confirm quantities before sending.",
        quantity: laborUnits,
        unit: estimateService === "painting" ? "area" : "square",
        unit_cost: Math.round(laborRate * complexityMultiplier),
        taxable: false,
        markup_rate: 0,
        sort_order: 0,
      },
      {
        category: "material",
        name:
          estimateService === "painting"
            ? "Paint, primer, sundries, and masking"
            : "Roofing materials and accessories",
        description: "Generated material allowance.",
        quantity: materialUnits,
        unit: estimateService === "painting" ? "area" : "square",
        unit_cost: Math.round(materialRate * complexityMultiplier),
        taxable: true,
        markup_rate: 8,
        sort_order: 1,
      },
    ]);
  };

  const saveEstimateDraft = async () => {
    if (!estimateDraft.length) {
      onError("Generate an estimate draft before saving.");
      return;
    }

    try {
      const savedEstimate = await createEstimate(
        client,
        {
          company_id: snapshot.companies[0]?.id ?? "",
          customer_id: selectedCustomer?.id ?? null,
          lead_id: null,
          title: `AI ${serviceLabel(estimateService)} Estimate`,
          status: "draft",
          service_type: estimateService,
          issue_date: todayIsoDate(),
          expiration_date: addDaysIsoDate(30),
          tax_rate: 8.6,
          discount_type: "fixed",
          discount_value: 0,
          profit_margin_rate: 12,
          notes: "Created from AI Estimate Assistant. Verify measurements and pricing.",
        },
        estimateDraft,
      );
      await createDocument(client, {
        company_id: savedEstimate.company_id,
        customer_id: savedEstimate.customer_id,
        job_id: null,
        estimate_id: savedEstimate.id,
        invoice_id: null,
        change_order_id: null,
        title: `${savedEstimate.title} PDF Packet`,
        category: "estimate",
        body: [
          savedEstimate.title,
          `Subtotal: ${formatMoney(savedEstimate.subtotal)}`,
          `Tax: ${formatMoney(savedEstimate.tax_total)}`,
          `Profit margin: ${formatMoney(savedEstimate.profit_margin_total)}`,
          `Total: ${formatMoney(savedEstimate.total)}`,
          ...estimateDraft.map(
            (item) =>
              `${item.name}: ${item.quantity} ${item.unit ?? "each"} at ${formatMoney(
                item.unit_cost,
              )}`,
          ),
        ].join("\n"),
      });
      await onReload();
      onNotice("AI estimate and PDF-ready document saved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save estimate.",
      );
    }
  };

  const estimateTotals = calculateEstimateTotals(
    {
      tax_rate: 8.6,
      discount_type: "fixed",
      discount_value: 0,
      profit_margin_rate: 12,
    },
    estimateDraft,
  );

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">AI Scope Writer</h2>
            <p className="mt-1 text-sm text-slate-500">
              Draft customer-ready scopes from templates and CRM context.
            </p>
          </div>
          <Bot className="h-6 w-6 text-sky-600" />
        </div>
        <div className="mt-5 grid gap-3">
          <select
            value={scopeTemplateId}
            onChange={(event) => setScopeTemplateId(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {snapshot.scopeTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
          <select
            value={scopeCustomerId}
            onChange={(event) => setScopeCustomerId(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="none">No customer context</option>
            {snapshot.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.display_name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generateScope}
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <WandSparkles className="h-4 w-4" />
              Generate scope
            </button>
            <button
              type="button"
              onClick={() => void saveScopeDraft()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" />
              Save draft
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              PDF
            </button>
          </div>
          <textarea
            value={scopeDraft}
            onChange={(event) => setScopeDraft(event.target.value)}
            className="min-h-96 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-6"
            placeholder="Generated scope appears here"
          />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">
              AI Estimate Assistant
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Produce a starting estimate from service type, size, and complexity.
            </p>
          </div>
          <Calculator className="h-6 w-6 text-sky-600" />
        </div>
        <div className="mt-5 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={estimateService}
              onChange={(event) => setEstimateService(event.target.value as ServiceType)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {serviceTypes.map((service) => (
                <option key={service.value} value={service.value}>
                  {service.label}
                </option>
              ))}
            </select>
            <input
              value={estimateSize}
              onChange={(event) => setEstimateSize(Number(event.target.value) || 0)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              inputMode="decimal"
              placeholder="Size"
            />
            <select
              value={estimateComplexity}
              onChange={(event) => setEstimateComplexity(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
              <option value="repair">Repair</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={generateEstimate}
              className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              <Calculator className="h-4 w-4" />
              Generate estimate
            </button>
            <button
              type="button"
              onClick={() => void saveEstimateDraft()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText className="h-4 w-4" />
              Save estimate
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />
              PDF
            </button>
          </div>
          <div className="rounded-lg border border-slate-200">
            {estimateDraft.length ? (
              <div className="divide-y divide-slate-100">
                {estimateDraft.map((item) => (
                  <div key={item.name} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-950">{item.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {item.quantity} {item.unit} at {formatMoney(item.unit_cost)}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase text-slate-500">
                          {item.category} - {item.markup_rate ?? 0}% markup -{" "}
                          {item.taxable ? "Taxable" : "Non-taxable"}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-950">
                        {formatMoney(calculateLineItemTotal(item))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState label="No estimate draft generated yet." />
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <TotalRow label="Estimated total" value={estimateTotals.total} strong />
          </div>
        </div>
      </section>
    </div>
  );
}

const weatherLocations = [
  { name: "Phoenix", latitude: 33.4484, longitude: -112.074 },
  { name: "Mesa", latitude: 33.4152, longitude: -111.8315 },
  { name: "Scottsdale", latitude: 33.4942, longitude: -111.9261 },
  { name: "Chandler", latitude: 33.3062, longitude: -111.8413 },
  { name: "Glendale", latitude: 33.5387, longitude: -112.186 },
];

type WeatherApiResponse = {
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    uv_index_max: number[];
  };
};

function getWeatherRisk(day: {
  high: number;
  rain: number;
  wind: number;
  uv: number;
}) {
  if (day.high >= 110 || day.wind >= 30 || day.rain >= 50) {
    return { label: "High risk", tone: "amber" as const };
  }

  if (day.high >= 103 || day.wind >= 22 || day.rain >= 25 || day.uv >= 9) {
    return { label: "Watch", tone: "blue" as const };
  }

  return { label: "Workable", tone: "green" as const };
}

function WeatherDashboardView({ snapshot }: { snapshot: CrmSnapshot }) {
  const [locationName, setLocationName] = useState(weatherLocations[0].name);
  const [forecast, setForecast] = useState<WeatherApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [weatherError, setWeatherError] = useState("");
  const selectedLocation =
    weatherLocations.find((location) => location.name === locationName) ??
    weatherLocations[0];
  const activeJobs = snapshot.jobs.filter(
    (job) => job.status === "scheduled" || job.status === "in_progress",
  );

  useEffect(() => {
    let isMounted = true;
    const params = new URLSearchParams({
      latitude: String(selectedLocation.latitude),
      longitude: String(selectedLocation.longitude),
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      timezone: "America/Phoenix",
    });

    fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Weather service unavailable.");
        }

        return response.json() as Promise<WeatherApiResponse>;
      })
      .then((data) => {
        if (isMounted) {
          setForecast(data);
        }
      })
      .catch((currentError) => {
        if (isMounted) {
          setWeatherError(
            currentError instanceof Error
              ? currentError.message
              : "Unable to load weather.",
          );
          setForecast(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedLocation]);

  const days =
    forecast?.daily.time.map((time, index) => ({
      time,
      high: Math.round(forecast.daily.temperature_2m_max[index] ?? 0),
      low: Math.round(forecast.daily.temperature_2m_min[index] ?? 0),
      rain: Math.round(forecast.daily.precipitation_probability_max[index] ?? 0),
      wind: Math.round(forecast.daily.wind_speed_10m_max[index] ?? 0),
      uv: Math.round(forecast.daily.uv_index_max[index] ?? 0),
    })) ?? [];

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Weather dashboard</h2>
              <p className="mt-1 text-sm text-slate-500">
                Heat, wind, UV, and rain risk for crews and production planning.
              </p>
            </div>
            <select
              value={locationName}
              onChange={(event) => {
                setIsLoading(true);
                setWeatherError("");
                setForecast(null);
                setLocationName(event.target.value);
              }}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {weatherLocations.map((location) => (
                <option key={location.name} value={location.name}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <EmptyState label="Loading weather forecast." />
        ) : weatherError ? (
          <Message tone="error" message={weatherError} />
        ) : (
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
            {days.map((day) => {
              const risk = getWeatherRisk(day);

              return (
                <article
                  key={day.time}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {formatDate(day.time)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {day.low}F low / {day.high}F high
                      </p>
                    </div>
                    <Badge label={risk.label} tone={risk.tone} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                    <WeatherMeasure label="Rain" value={`${day.rain}%`} />
                    <WeatherMeasure label="Wind" value={`${day.wind} mph`} />
                    <WeatherMeasure label="UV" value={day.uv} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Crew planning</h3>
          <div className="mt-4 grid gap-3">
            {activeJobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-950">{job.title}</p>
                <p className="mt-1 text-sm text-slate-500">{job.property_address}</p>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span>{formatDate(job.start_date)}</span>
                  <Badge label={jobStatusLabel(job.status)} tone="blue" />
                </div>
              </div>
            ))}
            {!activeJobs.length ? <EmptyState label="No active jobs to plan." /> : null}
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <h3 className="text-lg font-bold">Production guidance</h3>
          <div className="mt-4 grid gap-3 text-sm text-slate-300">
            <p>Prioritize early starts when highs exceed 103F.</p>
            <p>Review roof dry-in timing when rain probability exceeds 25%.</p>
            <p>Pause ladder and spray work when wind gust risk is elevated.</p>
          </div>
        </section>
      </aside>
    </div>
  );
}

function WeatherMeasure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-slate-950">{value}</p>
    </div>
  );
}

function CustomerPortalView({
  client,
  snapshot,
  onReload,
  onNotice,
  onError,
}: {
  client: CrmClient;
  snapshot: CrmSnapshot;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    snapshot.customers[0]?.id ?? "",
  );
  const customer =
    snapshot.customers.find((item) => item.id === selectedCustomerId) ??
    snapshot.customers[0];
  const jobs = customer
    ? snapshot.jobs.filter((job) => job.customer_id === customer.id)
    : [];
  const invoices = customer
    ? snapshot.invoices.filter((invoice) => invoice.customer_id === customer.id)
    : [];
  const photos = customer
    ? snapshot.jobPhotos.filter((photo) => photo.customer_id === customer.id)
    : [];
  const documents = customer
    ? snapshot.documents.filter((document) => document.customer_id === customer.id)
    : [];
  const signatures = customer
    ? snapshot.signatures.filter((signature) => signature.customer_id === customer.id)
    : [];

  const handlePayment = async (invoice: InvoiceRecord) => {
    try {
      await createPayment(client, {
        company_id: invoice.company_id,
        customer_id: invoice.customer_id,
        invoice_id: invoice.id,
        amount: invoice.balance_due,
        method: "Portal payment",
        status: "posted",
        paid_at: new Date().toISOString(),
        reference: `PORTAL-${invoice.invoice_number}`,
        notes: "Customer portal payment.",
      });
      await onReload();
      onNotice("Payment posted.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to post payment.",
      );
    }
  };

  if (!customer) {
    return <EmptyState label="Create a customer to preview the portal." />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-sky-300">
              Customer portal
            </p>
            <h2 className="mt-1 text-2xl font-bold">{customer.display_name}</h2>
            <p className="mt-1 text-sm text-slate-300">{customer.property_address}</p>
          </div>
          <select
            value={selectedCustomerId}
            onChange={(event) => setSelectedCustomerId(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          >
            {snapshot.customers.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Job progress</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {jobs.map((job) => {
                const steps = ["scheduled", "in_progress", "completed", "closed"];
                const currentStep = Math.max(steps.indexOf(job.status), 0);
                const progress = Math.round(((currentStep + 1) / steps.length) * 100);

                return (
                  <div key={job.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">{job.title}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {formatDate(job.start_date)} - {formatDate(job.end_date)}
                        </p>
                      </div>
                      <Badge label={jobStatusLabel(job.status)} tone="blue" />
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!jobs.length ? <EmptyState label="No portal jobs yet." /> : null}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Photos</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {photos.map((photo) => (
                <article key={photo.id} className="overflow-hidden rounded-lg border border-slate-200">
                  {photo.file_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.file_url} alt={photo.caption ?? "Job photo"} className="h-36 w-full object-cover" />
                  ) : (
                    <div className="grid h-36 place-items-center bg-slate-100">
                      <Camera className="h-6 w-6 text-slate-400" />
                    </div>
                  )}
                  <p className="p-3 text-sm font-semibold text-slate-700">
                    {photo.caption ?? "Job photo"}
                  </p>
                </article>
              ))}
              {!photos.length ? <EmptyState label="No portal photos yet." /> : null}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Invoices and payments</h3>
            <div className="mt-4 grid gap-3">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">
                        {invoice.invoice_number}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{invoice.title}</p>
                    </div>
                    <Badge
                      label={invoiceStatusLabel(invoice.status)}
                      tone={invoice.status === "paid" ? "green" : "blue"}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Balance due</span>
                    <span className="font-bold text-slate-950">
                      {formatMoney(invoice.balance_due)}
                    </span>
                  </div>
                  {invoice.balance_due > 0 ? (
                    <button
                      type="button"
                      onClick={() => void handlePayment(invoice)}
                      className="mt-3 w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Pay balance
                    </button>
                  ) : null}
                </div>
              ))}
              {!invoices.length ? <EmptyState label="No invoices yet." /> : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Documents</h3>
            <RelatedList
              title="Portal documents"
              emptyLabel="No portal documents yet."
              items={documents.map((document) => ({
                id: document.id,
                title: document.title,
                meta: documentCategoryLabel(document.category),
              }))}
            />
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Signatures</h3>
            <div className="mt-4 grid gap-3">
              {signatures.map((signature) => (
                <div key={signature.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-950">
                    {getSignatureTargetName(snapshot, signature)}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{signature.signer_name}</p>
                  <div className="mt-3">
                    <Badge
                      label={signatureStatusLabel(signature.status)}
                      tone={signature.status === "signed" ? "green" : "amber"}
                    />
                  </div>
                </div>
              ))}
              {!signatures.length ? <EmptyState label="No signatures requested." /> : null}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function EmployeePortalView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(
    snapshot.employees[0]?.id ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const employee =
    snapshot.employees.find((item) => item.id === selectedEmployeeId) ??
    snapshot.employees[0];
  const assignments = employee
    ? snapshot.jobAssignments.filter((assignment) => assignment.employee_id === employee.id)
    : [];
  const openTimeEntry = employee
    ? snapshot.timeEntries.find(
        (entry) => entry.employee_id === employee.id && entry.status === "clocked_in",
      )
    : null;

  const handleCreateEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: EmployeeInput = {
      company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
      full_name: getFormString(formData, "full_name"),
      role: getFormString(formData, "role", "technician") as EmployeeRole,
      phone: getOptionalFormString(formData, "phone"),
      email: getOptionalFormString(formData, "email"),
      is_active: true,
    };

    try {
      const created = await createEmployee(client, input);
      setSelectedEmployeeId(created.id);
      event.currentTarget.reset();
      await onReload();
      onNotice("Employee created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to create employee.",
      );
    }
  };

  const handleClock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employee) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      setIsSaving(true);
      if (openTimeEntry) {
        await updateTimeEntry(client, openTimeEntry.id, {
          clock_out_at: new Date().toISOString(),
          status: "submitted",
          notes: getOptionalFormString(formData, "notes"),
        });
        onNotice("Clocked out.");
      } else {
        await createTimeEntry(client, {
          company_id: employee.company_id,
          employee_id: employee.id,
          job_id: getOptionalRelation(formData, "job_id"),
          clock_in_at: new Date().toISOString(),
          status: "clocked_in",
          notes: getOptionalFormString(formData, "notes"),
        });
        onNotice("Clocked in.");
      }
      await onReload();
    } catch (currentError) {
      onError(currentError instanceof Error ? currentError.message : "Unable to update time.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDailyLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employee) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      await createDailyLog(client, {
        company_id: employee.company_id,
        employee_id: employee.id,
        job_id: getFormString(formData, "job_id"),
        log_date: getFormString(formData, "log_date", todayIsoDate()),
        weather_summary: getOptionalFormString(formData, "weather_summary"),
        work_completed: getFormString(formData, "work_completed"),
        blockers: getOptionalFormString(formData, "blockers"),
        tomorrow_plan: getOptionalFormString(formData, "tomorrow_plan"),
      });
      event.currentTarget.reset();
      await onReload();
      onNotice("Daily log saved.");
    } catch (currentError) {
      onError(currentError instanceof Error ? currentError.message : "Unable to save log.");
    }
  };

  const handleInspection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employee) {
      return;
    }

    const formData = new FormData(event.currentTarget);

    try {
      await createInspection(client, {
        company_id: employee.company_id,
        employee_id: employee.id,
        job_id: getFormString(formData, "job_id"),
        title: getFormString(formData, "title", "Job inspection"),
        status: getFormString(formData, "status", "pending") as InspectionStatus,
        checklist: getFormString(formData, "checklist"),
        completed_at:
          getFormString(formData, "status") === "passed" ? new Date().toISOString() : null,
        notes: getOptionalFormString(formData, "notes"),
      });
      event.currentTarget.reset();
      await onReload();
      onNotice("Inspection saved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save inspection.",
      );
    }
  };

  const updateAssignmentStatus = async (
    assignment: JobAssignmentRecord,
    status: AssignmentStatus,
  ) => {
    try {
      await updateJobAssignment(client, assignment.id, { status });
      await onReload();
      onNotice("Assignment updated.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to update assignment.",
      );
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Employee portal</h2>
              <p className="mt-1 text-sm text-slate-500">
                Mobile-first technician assignments, time, inspections, and daily logs.
              </p>
            </div>
            <select
              value={selectedEmployeeId}
              onChange={(event) => setSelectedEmployeeId(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              {snapshot.employees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.full_name}
                </option>
              ))}
            </select>
          </div>
          {employee ? (
            <div className="mt-5 rounded-lg bg-slate-950 p-5 text-white">
              <p className="text-2xl font-bold">{employee.full_name}</p>
              <p className="mt-1 text-sm text-slate-300">
                {employeeRoleLabel(employee.role)} -{" "}
                {companyMap.get(employee.company_id)?.name ?? "Company"}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Assignments</h3>
            <div className="mt-4 grid gap-3">
              {assignments.map((assignment) => (
                <div key={assignment.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-950">{assignment.title}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {getJobName(snapshot, assignment.job_id) ?? "No job"} -{" "}
                        {formatDate(assignment.assigned_date)}
                      </p>
                    </div>
                    <Badge
                      label={assignmentStatusLabel(assignment.status)}
                      tone={assignment.status === "completed" ? "green" : "blue"}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void updateAssignmentStatus(assignment, "accepted")}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void updateAssignmentStatus(assignment, "completed")}
                      className="rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Complete
                    </button>
                  </div>
                </div>
              ))}
              {!assignments.length ? <EmptyState label="No assignments yet." /> : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Clock in/out</h3>
            <form onSubmit={handleClock} className="mt-4 grid gap-3">
              <select
                name="job_id"
                defaultValue={openTimeEntry?.job_id ?? snapshot.jobs[0]?.id ?? "none"}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={Boolean(openTimeEntry)}
              >
                <option value="none">No job</option>
                {snapshot.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title}
                  </option>
                ))}
              </select>
              <textarea
                name="notes"
                className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder={openTimeEntry ? "Clock-out notes" : "Clock-in notes"}
              />
              <button
                type="submit"
                disabled={!employee || isSaving}
                className={`rounded-md px-4 py-3 text-sm font-bold text-white ${
                  openTimeEntry ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"
                } disabled:cursor-not-allowed disabled:bg-slate-300`}
              >
                {isSaving ? "Saving" : openTimeEntry ? "Clock out" : "Clock in"}
              </button>
            </form>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Daily log</h3>
            <form onSubmit={handleDailyLog} className="mt-4 grid gap-3">
              <select name="job_id" required className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {snapshot.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
              <input name="log_date" type="date" defaultValue={todayIsoDate()} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
              <input name="weather_summary" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Weather summary" />
              <textarea required name="work_completed" className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Work completed" />
              <textarea name="blockers" className="min-h-16 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Blockers" />
              <textarea name="tomorrow_plan" className="min-h-16 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Tomorrow plan" />
              <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Save daily log</button>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Inspection</h3>
            <form onSubmit={handleInspection} className="mt-4 grid gap-3">
              <select name="job_id" required className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {snapshot.jobs.map((job) => (
                  <option key={job.id} value={job.id}>{job.title}</option>
                ))}
              </select>
              <input required name="title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Inspection title" />
              <select name="status" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {inspectionStatuses.map((status) => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
              <textarea required name="checklist" className="min-h-32 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Checklist" />
              <textarea name="notes" className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Notes" />
              <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Save inspection</button>
            </form>
          </section>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">New employee</h3>
          <form onSubmit={handleCreateEmployee} className="mt-4 grid gap-3">
            <select name="company_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {snapshot.companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            <input required name="full_name" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Employee name" />
            <select name="role" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {employeeRoles.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
            <input name="phone" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Phone" />
            <input name="email" type="email" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Email" />
            <button type="submit" className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">Create employee</button>
          </form>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Recent time</h3>
          <div className="mt-4 grid gap-3">
            {snapshot.timeEntries.slice(0, 5).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-950">{getEmployeeName(snapshot, entry.employee_id)}</p>
                <p className="mt-1 text-sm text-slate-500">{getJobName(snapshot, entry.job_id) ?? "No job"}</p>
                <p className="mt-2 text-sm text-slate-600">{formatDateTime(entry.clock_in_at)}</p>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}

function RoutePlannerView({
  client,
  snapshot,
  onReload,
  onNotice,
  onError,
}: {
  client: CrmClient;
  snapshot: CrmSnapshot;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [routeDate, setRouteDate] = useState(todayIsoDate());
  const [originAddress, setOriginAddress] = useState(
    "WeatherTech Yard, Phoenix, AZ",
  );
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const candidates = useMemo(
    () =>
      buildRouteCandidates(
        snapshot.leads,
        snapshot.jobs,
        snapshot.scheduleEvents,
        routeDate,
      ),
    [routeDate, snapshot.jobs, snapshot.leads, snapshot.scheduleEvents],
  );
  const routePreview = useMemo(
    () =>
      buildRoutePreview(
        candidates,
        routeDate,
        originAddress,
        avoidTolls,
        avoidHighways,
      ),
    [avoidHighways, avoidTolls, candidates, originAddress, routeDate],
  );
  const savedPlans = snapshot.routePlans
    .filter((plan) => plan.route_date === routeDate)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const latestPlan = savedPlans[0] ?? null;
  const latestPlanStops = latestPlan
    ? snapshot.routePlanStops
        .filter((stop) => stop.route_plan_id === latestPlan.id)
        .sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const mapsConnection = snapshot.integrationConnections.find(
    (connection) => connection.provider === "google_maps",
  );
  const verifiedStops = candidates.filter(
    (candidate) => candidate.latitude !== null && candidate.longitude !== null,
  ).length;
  const scheduledStops = routePreview.orderedStops.filter(
    (stop) => stop.schedule_event_id,
  ).length;
  const mapsBrowserKeyConfigured = hasGoogleMapsBrowserKey();

  const applyOptimizedRoute = async () => {
    try {
      const scheduled = routePreview.orderedStops.filter(
        (stop) =>
          stop.schedule_event_id &&
          stop.estimated_arrival_at &&
          stop.estimated_departure_at,
      );

      for (const stop of scheduled) {
        await updateScheduleEvent(client, stop.schedule_event_id as string, {
          start_at: stop.estimated_arrival_at as string,
          end_at: stop.estimated_departure_at as string,
        });
      }

      await onReload();
      onNotice(`Applied optimized times to ${scheduled.length} scheduled stops.`);
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to optimize route.",
      );
    }
  };

  const saveRoutePreview = async () => {
    if (!routePreview.orderedStops.length) {
      onError("Add routable jobs or leads before saving a route.");
      return;
    }

    try {
      const firstCompanyId =
        routePreview.orderedStops[0]?.company_id ?? snapshot.companies[0]?.id;
      await createRoutePlan(
        client,
        {
          company_id: firstCompanyId,
          name: `Route preview for ${routeDate}`,
          route_date: routeDate,
          status: "optimized",
          origin_address: originAddress,
          destination_address:
            routePreview.orderedStops[routePreview.orderedStops.length - 1]
              ?.address ?? null,
          travel_mode: "driving",
          avoid_tolls: avoidTolls,
          avoid_highways: avoidHighways,
          total_distance_meters: routePreview.totalDistanceMeters,
          total_duration_seconds: routePreview.totalDurationSeconds,
          estimated_fuel_cost: routePreview.estimatedFuelCost,
          google_route_token: null,
          encoded_polyline: null,
          provider_payload: routePreview.providerPayload,
        },
        routePreviewToStopInputs(routePreview),
      );
      await onReload();
      onNotice("Route preview saved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save route.",
      );
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-sm font-semibold uppercase text-sky-300">
              Google Maps routing
            </p>
            <h2 className="mt-1 text-2xl font-bold">
              Dispatch routes for jobs and leads
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Preview optimized stop order, local distance estimates, dispatch timing,
              and the Routes API payload before live Google Maps calls are enabled.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="date"
              value={routeDate}
              onChange={(event) => setRouteDate(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
            />
            <input
              value={originAddress}
              onChange={(event) => setOriginAddress(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
              placeholder="Route origin"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Stops" value={routePreview.orderedStops.length} icon={MapPin} />
        <MetricCard
          label="Distance"
          value={formatRouteDistance(routePreview.totalDistanceMeters)}
          icon={MapPin}
        />
        <MetricCard
          label="Drive + service"
          value={formatRouteDuration(routePreview.totalDurationSeconds)}
          icon={CalendarClock}
        />
        <MetricCard
          label="Fuel estimate"
          value={formatMoney(routePreview.estimatedFuelCost)}
          icon={DollarSign}
        />
        <MetricCard
          label="Verified addresses"
          value={`${verifiedStops}/${candidates.length}`}
          icon={CheckCircle2}
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-5">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-950">Map preview</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Visual route state uses saved addresses now; live map tiles and
                  polylines will load when the Maps key is configured.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={avoidTolls}
                    onChange={(event) => setAvoidTolls(event.target.checked)}
                  />
                  Avoid tolls
                </label>
                <label className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={avoidHighways}
                    onChange={(event) => setAvoidHighways(event.target.checked)}
                  />
                  Avoid highways
                </label>
              </div>
            </div>

            <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              <div className="relative min-h-[320px] p-5">
                <div className="absolute inset-x-10 top-1/2 h-1 rounded-full bg-sky-200" />
                <div className="relative grid min-h-[280px] gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {routePreview.orderedStops.map((stop) => (
                    <article
                      key={stop.key}
                      className="relative rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="absolute -left-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-sky-600 text-sm font-bold text-white">
                        {stop.sort_order}
                      </div>
                      <div className="pl-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-slate-950">{stop.title}</p>
                          <Badge
                            label={stop.stop_type}
                            tone={stop.stop_type === "job" ? "green" : "blue"}
                          />
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{stop.address}</p>
                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          <span>
                            ETA{" "}
                            {stop.estimated_arrival_at
                              ? formatDateTime(stop.estimated_arrival_at)
                              : "Pending"}
                          </span>
                          <span>
                            Leg {formatRouteDistance(stop.distance_from_previous_meters)} ·{" "}
                            {formatRouteDuration(stop.duration_from_previous_seconds)}
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!routePreview.orderedStops.length ? (
                    <div className="sm:col-span-2 xl:col-span-3">
                      <EmptyState label="No routable jobs or leads for this date." />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void saveRoutePreview()}
                disabled={!routePreview.orderedStops.length}
                className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                <MapPin className="h-4 w-4" />
                Save route preview
              </button>
              <button
                type="button"
                onClick={() => void applyOptimizedRoute()}
                disabled={!scheduledStops}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Apply dispatch times
              </button>
            </div>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5">
              <h3 className="text-lg font-bold text-slate-950">Route stop preview</h3>
              <p className="mt-1 text-sm text-slate-500">
                Leads come from follow-ups and urgent opportunities. Jobs come from
                active production and scheduled start dates.
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {routePreview.orderedStops.map((stop) => (
                <article
                  key={stop.key}
                  className="grid gap-4 p-5 lg:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  <div className="grid h-11 w-11 place-items-center rounded-md bg-sky-100 text-sm font-bold text-sky-800">
                    {stop.sort_order}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-950">{stop.title}</p>
                      <Badge
                        label={stop.stop_type === "job" ? "Job" : "Lead"}
                        tone={stop.stop_type === "job" ? "green" : "blue"}
                      />
                      {stop.latitude !== null && stop.longitude !== null ? (
                        <Badge label="Verified" tone="green" />
                      ) : (
                        <Badge label="Needs geocode" tone="amber" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{stop.address}</p>
                    {stop.notes ? (
                      <p className="mt-2 text-sm text-slate-600">{stop.notes}</p>
                    ) : null}
                  </div>
                  <div className="text-sm font-semibold text-slate-600 lg:text-right">
                    <p>{formatRouteDistance(stop.distance_from_previous_meters)}</p>
                    <p className="mt-1">
                      {formatRouteDuration(stop.duration_from_previous_seconds)}
                    </p>
                  </div>
                </article>
              ))}
              {!routePreview.orderedStops.length ? (
                <div className="p-5">
                  <EmptyState label="No route stops match this date." />
                </div>
              ) : null}
            </div>
          </section>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Google Maps readiness</h3>
            <div className="mt-4 grid gap-3">
              <ProfileStat
                label="Connection"
                value={mapsConnection ? integrationStatusLabel(mapsConnection.status) : "Not saved"}
              />
              <ProfileStat
                label="Browser key"
                value={
                  mapsBrowserKeyConfigured
                    ? googleMapsEnvVars.browserApiKey
                    : "Not configured"
                }
              />
              <ProfileStat label="Server key" value={googleMapsEnvVars.serverApiKey} />
              <ProfileStat label="Endpoint" value="Routes API computeRoutes" />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Saved route history</h3>
            <div className="mt-4 grid gap-3">
              {savedPlans.map((plan) => {
                const planStops = snapshot.routePlanStops.filter(
                  (stop) => stop.route_plan_id === plan.id,
                );

                return (
                  <div key={plan.id} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-slate-950">{plan.name}</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {planStops.length} stops ·{" "}
                          {formatRouteDistance(plan.total_distance_meters)}
                        </p>
                      </div>
                      <Badge label={plan.status} tone="blue" />
                    </div>
                  </div>
                );
              })}
              {!savedPlans.length ? <EmptyState label="No saved routes for this date." /> : null}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Routes API payload</h3>
            <p className="mt-1 text-sm text-slate-500">
              This is the server-side request body placeholder for Google Maps.
            </p>
            <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(routePreview.providerPayload, null, 2)}
            </pre>
          </section>

          {latestPlan ? (
            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-bold text-slate-950">Latest saved stops</h3>
              <div className="mt-4 grid gap-3">
                {latestPlanStops.map((stop) => (
                  <div key={stop.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-950">
                      {stop.sort_order}. {stop.title}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{stop.address}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function ChangeOrdersView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(snapshot.changeOrders[0]?.id ?? "new");
  const [isSaving, setIsSaving] = useState(false);
  const selected =
    snapshot.changeOrders.find((changeOrder) => changeOrder.id === selectedId) ?? null;

  const saveChangeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: ChangeOrderInput = {
      company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
      customer_id: getOptionalRelation(formData, "customer_id"),
      job_id: getOptionalRelation(formData, "job_id"),
      estimate_id: getOptionalRelation(formData, "estimate_id"),
      title: getFormString(formData, "title"),
      status: getFormString(formData, "status", "draft") as ChangeOrderStatus,
      reason: getFormString(formData, "reason"),
      amount: getFormNumber(formData, "amount"),
      tax_rate: getFormNumber(formData, "tax_rate"),
      requested_date: getFormString(formData, "requested_date", todayIsoDate()),
      approved_at:
        getFormString(formData, "status") === "approved"
          ? new Date().toISOString()
          : selected?.approved_at ?? null,
      notes: getOptionalFormString(formData, "notes"),
    };

    try {
      setIsSaving(true);
      const saved = selected
        ? await updateChangeOrder(client, selected.id, input)
        : await createChangeOrder(client, input);
      setSelectedId(saved.id);
      await onReload();
      onNotice(selected ? "Change order updated." : "Change order created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to save change order.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const requestSignature = async (changeOrder: ChangeOrderRecord) => {
    try {
      await createSignature(client, {
        company_id: changeOrder.company_id,
        customer_id: changeOrder.customer_id,
        change_order_id: changeOrder.id,
        signer_name:
          getCustomerName(snapshot, changeOrder.customer_id) ?? "Customer signer",
        signer_email:
          snapshot.customers.find((customer) => customer.id === changeOrder.customer_id)
            ?.email ?? null,
        status: "pending",
      });
      await onReload();
      onNotice("Signature requested.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to request signature.",
      );
    }
  };

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_460px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-950">Change orders</h2>
              <p className="mt-1 text-sm text-slate-500">
                Price scope changes and request customer approvals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedId("new")}
              className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
            >
              New
            </button>
          </div>
        </div>
        <div className="divide-y divide-slate-100">
          {snapshot.changeOrders.map((changeOrder) => (
            <button
              key={changeOrder.id}
              type="button"
              onClick={() => setSelectedId(changeOrder.id)}
              className={`grid w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50 xl:grid-cols-[1fr_120px_130px_120px] xl:items-center ${
                selected?.id === changeOrder.id ? "bg-sky-50" : "bg-white"
              }`}
            >
              <div>
                <p className="font-semibold text-slate-950">{changeOrder.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {getChangeOrderTargetName(snapshot, changeOrder)}
                </p>
              </div>
              <Badge
                label={changeOrderStatusLabel(changeOrder.status)}
                tone={changeOrder.status === "approved" ? "green" : "blue"}
              />
              <span className="text-sm text-slate-600">
                {companyMap.get(changeOrder.company_id)?.name ?? "Company"}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(changeOrder.total)}
              </span>
            </button>
          ))}
          {!snapshot.changeOrders.length ? (
            <EmptyState label="No change orders yet." />
          ) : null}
        </div>
      </section>
      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">
          {selected ? "Edit change order" : "Create change order"}
        </h3>
        <form key={selected?.id ?? "new-change-order"} onSubmit={saveChangeOrder} className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="company_id" defaultValue={selected?.company_id ?? snapshot.companies[0]?.id} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {snapshot.companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            <select name="status" defaultValue={selected?.status ?? "draft"} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {changeOrderStatuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
          <input required name="title" defaultValue={selected?.title ?? ""} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Change order title" />
          <div className="grid gap-3 sm:grid-cols-3">
            <select name="customer_id" defaultValue={selected?.customer_id ?? "none"} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No customer</option>
              {snapshot.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.display_name}</option>
              ))}
            </select>
            <select name="job_id" defaultValue={selected?.job_id ?? "none"} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No job</option>
              {snapshot.jobs.map((job) => (
                <option key={job.id} value={job.id}>{job.title}</option>
              ))}
            </select>
            <select name="estimate_id" defaultValue={selected?.estimate_id ?? "none"} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No estimate</option>
              {snapshot.estimates.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>{estimate.title}</option>
              ))}
            </select>
          </div>
          <textarea required name="reason" defaultValue={selected?.reason ?? ""} className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Reason and scope impact" />
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="amount" defaultValue={selected?.amount ?? 0} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Amount" />
            <input name="tax_rate" defaultValue={selected?.tax_rate ?? 0} className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Tax %" />
            <input name="requested_date" type="date" defaultValue={selected?.requested_date ?? todayIsoDate()} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <textarea name="notes" defaultValue={selected?.notes ?? ""} className="min-h-20 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Internal notes" />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={isSaving} className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:bg-slate-300">
              {isSaving ? "Saving" : selected ? "Save change order" : "Create change order"}
            </button>
            {selected ? (
              <button type="button" onClick={() => void requestSignature(selected)} className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Request signature
              </button>
            ) : null}
          </div>
        </form>
      </aside>
    </div>
  );
}

function DocumentsAndSignaturesView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const documentSourceOptions = useMemo(
    () => buildDocumentSourceOptions(snapshot),
    [snapshot],
  );
  const [generatedSourceId, setGeneratedSourceId] = useState(
    documentSourceOptions[0]?.value ?? "",
  );
  const generatedDraft = useMemo(
    () =>
      generatedSourceId
        ? buildGeneratedDocumentDraft(snapshot, generatedSourceId)
        : null,
    [generatedSourceId, snapshot],
  );

  useEffect(() => {
    if (!documentSourceOptions.length) {
      setGeneratedSourceId("");
      return;
    }

    if (!documentSourceOptions.some((option) => option.value === generatedSourceId)) {
      setGeneratedSourceId(documentSourceOptions[0].value);
    }
  }, [documentSourceOptions, generatedSourceId]);

  const signDocument = async (signature: SignatureRecord, form: HTMLFormElement) => {
    const formData = new FormData(form);

    try {
      await updateSignature(client, signature.id, {
        status: "signed",
        signature_data: getFormString(formData, "signature_data", signature.signer_name),
        signed_at: new Date().toISOString(),
      });
      await onReload();
      onNotice("Signature captured.");
    } catch (currentError) {
      onError(currentError instanceof Error ? currentError.message : "Unable to sign.");
    }
  };

  const handleSaveGeneratedDocument = async () => {
    if (!generatedDraft) {
      onError("Choose a CRM record before generating a document.");
      return;
    }

    try {
      await createDocument(client, {
        company_id: generatedDraft.company_id,
        customer_id: generatedDraft.customer_id,
        job_id: generatedDraft.job_id,
        estimate_id: generatedDraft.estimate_id,
        invoice_id: generatedDraft.invoice_id,
        change_order_id: generatedDraft.change_order_id,
        title: generatedDraft.title,
        category: generatedDraft.category,
        file_url: generatedDraft.file_url,
        body: generatedDraft.body,
      });
      await onReload();
      onNotice("Generated document saved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to save generated document.",
      );
    }
  };

  const handleCreateDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: DocumentInput = {
      company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
      customer_id: getOptionalRelation(formData, "customer_id"),
      job_id: getOptionalRelation(formData, "job_id"),
      estimate_id: getOptionalRelation(formData, "estimate_id"),
      invoice_id: getOptionalRelation(formData, "invoice_id"),
      change_order_id: getOptionalRelation(formData, "change_order_id"),
      title: getFormString(formData, "title"),
      category: getFormString(formData, "category", "other") as DocumentCategory,
      file_url: getOptionalFormString(formData, "file_url"),
      body: getOptionalFormString(formData, "body"),
    };

    try {
      await createDocument(client, input);
      event.currentTarget.reset();
      await onReload();
      onNotice("Document saved.");
    } catch (currentError) {
      onError(
        currentError instanceof Error ? currentError.message : "Unable to save document.",
      );
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-xl font-bold text-slate-950">Document management</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manage estimates, scopes, invoices, contracts, change orders, and files.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {snapshot.documents.map((document) => (
              <article key={document.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_130px_160px] lg:items-center">
                <div>
                  <p className="font-semibold text-slate-950">{document.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{getDocumentTargetName(snapshot, document)}</p>
                </div>
                <Badge label={documentCategoryLabel(document.category)} tone="blue" />
                <span className="text-sm text-slate-600">{companyMap.get(document.company_id)?.name ?? "Company"}</span>
              </article>
            ))}
            {!snapshot.documents.length ? <EmptyState label="No documents yet." /> : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Digital signatures</h3>
          <div className="mt-4 grid gap-3">
            {snapshot.signatures.map((signature) => (
              <form key={signature.id} onSubmit={(event) => {
                event.preventDefault();
                void signDocument(signature, event.currentTarget);
              }} className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{getSignatureTargetName(snapshot, signature)}</p>
                    <p className="mt-1 text-sm text-slate-500">{signature.signer_name}</p>
                  </div>
                  <Badge label={signatureStatusLabel(signature.status)} tone={signature.status === "signed" ? "green" : "amber"} />
                </div>
                {signature.status !== "signed" ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input name="signature_data" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Type signature" />
                    <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Sign</button>
                  </div>
                ) : (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">Signed {signature.signed_at ? formatDateTime(signature.signed_at) : ""}</p>
                )}
              </form>
            ))}
          </div>
        </div>
      </section>

      <aside className="space-y-5">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-950">Generate document</h3>
          <p className="mt-1 text-sm text-slate-500">
            Create a customer-ready packet from existing CRM records.
          </p>
          <div className="mt-4 grid gap-3">
            <select
              value={generatedSourceId}
              onChange={(event) => setGeneratedSourceId(event.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              disabled={!documentSourceOptions.length}
            >
              {documentSourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {generatedDraft ? (
              <>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-950">
                        {generatedDraft.title}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {generatedDraft.sourceLabel} · {generatedDraft.summary}
                      </p>
                    </div>
                    <Badge
                      label={documentCategoryLabel(generatedDraft.category)}
                      tone="blue"
                    />
                  </div>
                </div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                  {generatedDraft.body}
                </pre>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Printer className="h-4 w-4" />
                    Print preview
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveGeneratedDocument()}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                  >
                    <FileText className="h-4 w-4" />
                    Save document
                  </button>
                </div>
              </>
            ) : (
              <EmptyState label="Create an estimate, invoice, scope, job, or customer to generate documents." />
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">New document</h3>
        <form onSubmit={handleCreateDocument} className="mt-4 grid gap-3">
          <select name="company_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {snapshot.companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <input required name="title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Document title" />
          <select name="category" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {documentCategories.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
          <select name="customer_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="none">No customer</option>
            {snapshot.customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.display_name}</option>
            ))}
          </select>
          <select name="job_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="none">No job</option>
            {snapshot.jobs.map((job) => (
              <option key={job.id} value={job.id}>{job.title}</option>
            ))}
          </select>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="estimate_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No estimate</option>
              {snapshot.estimates.map((estimate) => (
                <option key={estimate.id} value={estimate.id}>{estimate.title}</option>
              ))}
            </select>
            <select name="invoice_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No invoice</option>
              {snapshot.invoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>{invoice.invoice_number}</option>
              ))}
            </select>
          </div>
          <select name="change_order_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="none">No change order</option>
            {snapshot.changeOrders.map((changeOrder) => (
              <option key={changeOrder.id} value={changeOrder.id}>{changeOrder.title}</option>
            ))}
          </select>
          <input name="file_url" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="File URL" />
          <textarea name="body" className="min-h-32 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Document body or notes" />
          <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Save document</button>
        </form>
        </section>
      </aside>
    </div>
  );
}

function AnalyticsView({
  metrics,
  snapshot,
}: {
  metrics: ReturnType<typeof calculateDashboardMetrics>;
  snapshot: CrmSnapshot;
}) {
  const sentEstimateValue = snapshot.estimates
    .filter((estimate) => estimate.status === "sent")
    .reduce((total, estimate) => total + estimate.total, 0);
  const approvedEstimateValue = snapshot.estimates
    .filter((estimate) => estimate.status === "approved")
    .reduce((total, estimate) => total + estimate.total, 0);
  const invoiceTotal = snapshot.invoices.reduce((total, invoice) => total + invoice.total, 0);
  const materialSpend = snapshot.materialOrders.reduce((total, order) => total + order.total, 0);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">Dashboard analytics</h2>
        <p className="mt-1 text-sm text-slate-500">
          Revenue, close rate, production, and profitability.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Revenue collected" value={formatMoney(metrics.revenueCollected)} icon={DollarSign} />
          <MetricCard label="Close rate" value={`${metrics.closeRate}%`} icon={CheckCircle2} />
          <MetricCard label="Production complete" value={`${metrics.productionCompletion}%`} icon={CalendarClock} />
          <MetricCard label="Gross profit" value={formatMoney(metrics.grossProfit)} icon={DollarSign} />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <AnalyticsPanel
          title="Revenue pipeline"
          rows={[
            { label: "Sent estimates", value: sentEstimateValue },
            { label: "Approved estimates", value: approvedEstimateValue },
            { label: "Invoices issued", value: invoiceTotal },
            { label: "Payments collected", value: metrics.revenueCollected },
          ]}
        />
        <AnalyticsPanel
          title="Profitability"
          rows={[
            { label: "Approved revenue", value: approvedEstimateValue },
            { label: "Material spend", value: materialSpend },
            { label: "Gross profit", value: metrics.grossProfit },
          ]}
        />
      </div>
    </div>
  );
}

function AnalyticsPanel({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <div className="mt-5 grid gap-4">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700">{row.label}</span>
              <span className="font-bold text-slate-950">{formatMoney(row.value)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500"
                style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NotificationsView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const markNotification = async (
    notification: NotificationRecord,
    status: NotificationStatus,
  ) => {
    try {
      await updateNotification(client, notification.id, { status });
      await onReload();
      onNotice("Notification updated.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to update notification.",
      );
    }
  };

  const handleCreateNotification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const input: NotificationInput = {
      company_id: getFormString(formData, "company_id", snapshot.companies[0]?.id),
      customer_id: getOptionalRelation(formData, "customer_id"),
      employee_id: getOptionalRelation(formData, "employee_id"),
      title: getFormString(formData, "title"),
      message: getFormString(formData, "message"),
      channel: getFormString(formData, "channel", "in_app") as NotificationChannel,
      status: getFormString(formData, "status", "queued") as NotificationStatus,
      remind_at: getOptionalFormString(formData, "remind_at")
        ? fromDateTimeInputValue(getFormString(formData, "remind_at"))
        : null,
    };

    try {
      await createNotification(client, input);
      event.currentTarget.reset();
      await onReload();
      onNotice("Notification created.");
    } catch (currentError) {
      onError(
        currentError instanceof Error
          ? currentError.message
          : "Unable to create notification.",
      );
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-xl font-bold text-slate-950">Notifications and reminders</h2>
          <p className="mt-1 text-sm text-slate-500">
            Queue customer and employee reminders across email, SMS, and in-app.
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {snapshot.notifications.map((notification) => (
            <article key={notification.id} className="px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">{notification.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{notification.message}</p>
                  <p className="mt-2 text-xs font-semibold uppercase text-slate-500">
                    {companyMap.get(notification.company_id)?.name ?? "Company"} -{" "}
                    {notification.remind_at ? formatDateTime(notification.remind_at) : "No reminder date"}
                  </p>
                </div>
                <Badge
                  label={notificationStatusLabel(notification.status)}
                  tone={notification.status === "read" ? "green" : "amber"}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void markNotification(notification, "read")} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Mark read
                </button>
                <button type="button" onClick={() => void markNotification(notification, "dismissed")} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Dismiss
                </button>
              </div>
            </article>
          ))}
          {!snapshot.notifications.length ? <EmptyState label="No reminders yet." /> : null}
        </div>
      </section>
      <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">New reminder</h3>
        <form onSubmit={handleCreateNotification} className="mt-4 grid gap-3">
          <select name="company_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {snapshot.companies.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          <input required name="title" className="rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Reminder title" />
          <textarea required name="message" className="min-h-24 rounded-md border border-slate-300 px-3 py-2 text-sm" placeholder="Message" />
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="channel" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {notificationChannels.map((channel) => (
                <option key={channel.value} value={channel.value}>{channel.label}</option>
              ))}
            </select>
            <select name="status" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              {notificationStatuses.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="customer_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No customer</option>
              {snapshot.customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.display_name}</option>
              ))}
            </select>
            <select name="employee_id" className="rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="none">No employee</option>
              {snapshot.employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name}</option>
              ))}
            </select>
          </div>
          <input name="remind_at" type="datetime-local" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Create reminder</button>
        </form>
      </aside>
    </div>
  );
}

const integrationCards = [
  {
    name: "Google Calendar",
    status: "Sync active",
    detail: "Connection records, appointment queueing, payload preview, and sync state tracking.",
  },
  {
    name: "Gmail",
    status: "Outbox active",
    detail: "Draft and queue estimates, invoices, follow-ups, and production updates.",
  },
  {
    name: "Google Maps",
    status: "Routing active",
    detail: "Job and lead routing foundation with route previews, estimates, and API payloads.",
  },
  {
    name: "Twilio SMS",
    status: "Outbox active",
    detail: "Connection records, SMS queueing, status tracking, and Twilio payload previews.",
  },
  {
    name: "DocuSign / Native signatures",
    status: "Native active",
    detail: "Built-in signature capture now works; DocuSign can be added as a provider.",
  },
  {
    name: "QuickBooks Online",
    status: "Queued",
    detail: "Invoice, payment, customer, and product/service synchronization.",
  },
  {
    name: "Stripe",
    status: "Portal ready",
    detail: "Customer portal payments can be routed through Stripe Checkout or Payment Links.",
  },
  {
    name: "CompanyCam / Native photos",
    status: "Native active",
    detail: "Native Supabase photo storage works; CompanyCam can sync albums later.",
  },
  {
    name: "Weather alerts",
    status: "Forecast active",
    detail: "Weather dashboard is live; alerts can be tied to job locations and reminders.",
  },
];

type IntegrationsViewProps = {
  client: CrmClient;
  snapshot: CrmSnapshot;
  companyMap: Map<string, CompanyRecord>;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
};

function getIntegrationStatusTone(status: IntegrationConnectionStatus) {
  return status === "connected" ? "green" : status === "paused" ? "amber" : "amber";
}

function IntegrationsView({
  client,
  snapshot,
  companyMap,
  onReload,
  onNotice,
  onError,
}: IntegrationsViewProps) {
  const googleConnections = snapshot.integrationConnections.filter(
    (connection) => connection.provider === "google_calendar",
  );
  const primaryConnection = googleConnections[0];
  const googleSyncs = snapshot.calendarEventSyncs.filter(
    (sync) => sync.provider === "google_calendar",
  );
  const googleSummary = getCalendarSyncSummary(snapshot.scheduleEvents, googleSyncs);
  const previewEvent = snapshot.scheduleEvents.find(
    (event) => event.status === "scheduled",
  );
  const previewPayload = previewEvent
    ? buildGoogleCalendarEventPayload(
        previewEvent,
        getScheduleTargetName(snapshot, previewEvent),
      )
    : null;
  const gmailConnections = snapshot.integrationConnections.filter(
    (connection) => connection.provider === "gmail",
  );
  const primaryGmailConnection = gmailConnections[0];
  const emailSummary = getEmailOutboxSummary(snapshot.emailMessages);
  const previewEmail = snapshot.emailMessages[0];
  const emailPreviewPayload = previewEmail
    ? buildGmailSendPreview(previewEmail)
    : null;
  const twilioConnections = snapshot.integrationConnections.filter(
    (connection) => connection.provider === "twilio_sms",
  );
  const primaryTwilioConnection = twilioConnections[0];
  const smsSummary = getSmsOutboxSummary(snapshot.smsMessages);
  const previewSms = snapshot.smsMessages[0];
  const smsPreviewPayload = previewSms ? buildTwilioSmsPreview(previewSms) : null;
  const primaryTwilioFromNumber =
    typeof primaryTwilioConnection?.settings.fromNumber === "string"
      ? primaryTwilioConnection.settings.fromNumber
      : null;

  const handleCreateGmailConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const companyId = getFormString(formData, "company_id");
    const displayName = getFormString(formData, "display_name");
    const accountEmail = getOptionalFormString(formData, "account_email");

    try {
      await createIntegrationConnection(client, {
        company_id: companyId,
        provider: "gmail",
        status: "connected",
        display_name: displayName,
        account_email: accountEmail,
        scopes: gmailScopes,
        sync_direction: "weathertech_to_provider",
        credential_reference: `vault://gmail/${accountEmail ?? "company-sender"}`,
        settings: {
          senderName: companyMap.get(companyId)?.name ?? "WeatherTech OS",
          includePortalLinks: true,
        },
      });
      onNotice("Gmail connection saved.");
      await onReload();
      form.reset();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save Gmail connection.");
    }
  };

  const handleCreateEmailMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const companyId = getFormString(formData, "company_id");
    const customerId = getOptionalFormString(formData, "customer_id");
    const sourceKey = getFormString(formData, "source_key", "follow_up:none");
    const [category, sourceId] = sourceKey.split(":");
    const toEmail = getFormString(formData, "to_email");
    const subjectOverride = getOptionalFormString(formData, "subject");
    const bodyOverride = getOptionalFormString(formData, "body");
    const intent = getFormString(formData, "intent", "draft");
    const customer = snapshot.customers.find((item) => item.id === customerId);
    const estimate = snapshot.estimates.find((item) => item.id === sourceId);
    const invoice = snapshot.invoices.find((item) => item.id === sourceId);
    const resolvedCompany = companyMap.get(companyId)?.name ?? "WeatherTech OS";

    const subject =
      subjectOverride ??
      (estimate
        ? `${estimate.title} estimate`
        : invoice
          ? `${invoice.invoice_number} invoice`
          : `Follow-up from ${resolvedCompany}`);
    const body =
      bodyOverride ??
      (estimate
        ? `Hi ${customer?.contact_name ?? "there"},\n\nYour estimate for ${estimate.title} is ready. The current total is ${formatMoney(estimate.total)}. Please reply with questions or approval so we can reserve the production schedule.\n\nThank you,\n${resolvedCompany}`
        : invoice
          ? `Hi ${customer?.contact_name ?? "there"},\n\nYour invoice ${invoice.invoice_number} for ${invoice.title} is ready. The balance due is ${formatMoney(invoice.balance_due)}.\n\nThank you,\n${resolvedCompany}`
          : `Hi ${customer?.contact_name ?? "there"},\n\nFollowing up from ${resolvedCompany}. Reply here if you have any questions or need a schedule update.\n\nThank you,\n${resolvedCompany}`);

    try {
      await createEmailMessage(client, {
        company_id: companyId,
        customer_id: customerId,
        estimate_id: estimate?.id ?? null,
        invoice_id: invoice?.id ?? null,
        document_id: null,
        integration_connection_id: primaryGmailConnection?.id ?? null,
        category:
          category === "estimate" || category === "invoice"
            ? category
            : "follow_up",
        status: intent === "queue" ? "queued" : "draft",
        to_email: toEmail,
        subject,
        body,
      });
      onNotice(intent === "queue" ? "Email queued for Gmail." : "Email draft saved.");
      await onReload();
      form.reset();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save email message.");
    }
  };

  const handleCreateTwilioConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const companyId = getFormString(formData, "company_id");
    const displayName = getFormString(formData, "display_name");
    const accountLabel = getOptionalFormString(formData, "account_label");
    const messagingServiceSid = getOptionalFormString(formData, "messaging_service_sid");
    const fromNumber = getOptionalFormString(formData, "from_phone");

    try {
      await createIntegrationConnection(client, {
        company_id: companyId,
        provider: "twilio_sms",
        status: "connected",
        display_name: displayName,
        account_email: null,
        external_account_id: accountLabel,
        scopes: [],
        sync_direction: "weathertech_to_provider",
        credential_reference: `vault://twilio/${companyId}`,
        settings: {
          messagingServiceSid,
          fromNumber,
          optOutText: "Reply STOP to opt out.",
          deliveryReceipts: true,
        },
      });
      onNotice("Twilio SMS connection saved.");
      await onReload();
      form.reset();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save Twilio connection.");
    }
  };

  const handleCreateSmsMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const companyId = getFormString(formData, "company_id");
    const targetKey = getFormString(formData, "target_key", "general:none");
    const [targetType, targetId] = targetKey.split(":");
    const category = getFormString(
      formData,
      "category",
      "general",
    ) as SmsMessageCategory;
    const toPhoneOverride = getOptionalFormString(formData, "to_phone");
    const bodyOverride = getOptionalFormString(formData, "body");
    const intent = getFormString(formData, "intent", "draft");

    const selectedCustomer =
      targetType === "customer"
        ? snapshot.customers.find((customer) => customer.id === targetId)
        : undefined;
    const selectedLead =
      targetType === "lead"
        ? snapshot.leads.find((lead) => lead.id === targetId)
        : undefined;
    const selectedJob =
      targetType === "job" ? snapshot.jobs.find((job) => job.id === targetId) : undefined;
    const selectedScheduleEvent =
      targetType === "schedule"
        ? snapshot.scheduleEvents.find((scheduleEvent) => scheduleEvent.id === targetId)
        : undefined;
    const selectedInvoice =
      targetType === "invoice"
        ? snapshot.invoices.find((invoice) => invoice.id === targetId)
        : undefined;
    const scheduleJob = selectedScheduleEvent?.job_id
      ? snapshot.jobs.find((job) => job.id === selectedScheduleEvent.job_id)
      : undefined;
    const resolvedCustomerId =
      selectedCustomer?.id ??
      selectedLead?.customer_id ??
      selectedJob?.customer_id ??
      selectedScheduleEvent?.customer_id ??
      scheduleJob?.customer_id ??
      selectedInvoice?.customer_id ??
      null;
    const resolvedCustomer = resolvedCustomerId
      ? snapshot.customers.find((customer) => customer.id === resolvedCustomerId)
      : undefined;
    const resolvedLeadId =
      selectedLead?.id ??
      selectedJob?.lead_id ??
      selectedScheduleEvent?.lead_id ??
      scheduleJob?.lead_id ??
      null;
    const resolvedJobId =
      selectedJob?.id ?? selectedScheduleEvent?.job_id ?? selectedInvoice?.job_id ?? null;
    const targetName =
      selectedCustomer?.contact_name ??
      selectedLead?.contact_name ??
      resolvedCustomer?.contact_name ??
      selectedJob?.title ??
      selectedScheduleEvent?.title ??
      selectedInvoice?.invoice_number ??
      "there";
    const toPhone =
      toPhoneOverride ??
      selectedCustomer?.phone ??
      selectedLead?.phone ??
      resolvedCustomer?.phone ??
      null;

    if (!toPhone) {
      onError("Add a recipient phone number before saving the SMS.");
      return;
    }

    const companyName = companyMap.get(companyId)?.name ?? "WeatherTech OS";
    const body =
      bodyOverride ??
      buildDefaultSmsBody({
        category,
        companyName,
        targetName,
        event: selectedScheduleEvent,
        invoice: selectedInvoice,
        job: selectedJob ?? scheduleJob,
      });

    try {
      await createSmsMessage(client, {
        company_id: companyId,
        customer_id: resolvedCustomerId,
        lead_id: resolvedLeadId,
        job_id: resolvedJobId,
        schedule_event_id: selectedScheduleEvent?.id ?? null,
        invoice_id: selectedInvoice?.id ?? null,
        integration_connection_id: primaryTwilioConnection?.id ?? null,
        category,
        status: intent === "queue" ? "queued" : "draft",
        to_phone: toPhone,
        from_phone: primaryTwilioFromNumber,
        body,
      });
      onNotice(intent === "queue" ? "SMS queued for Twilio." : "SMS draft saved.");
      await onReload();
      form.reset();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save SMS message.");
    }
  };

  const handleCreateGoogleConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const companyId = getFormString(formData, "company_id");
    const displayName = getFormString(formData, "display_name");
    const accountEmail = getOptionalFormString(formData, "account_email");
    const defaultCalendarId = getFormString(formData, "default_calendar_id", "primary");
    const syncDirection = getFormString(
      formData,
      "sync_direction",
      "two_way",
    ) as IntegrationSyncDirection;

    try {
      await createIntegrationConnection(client, {
        company_id: companyId,
        provider: "google_calendar",
        status: "connected",
        display_name: displayName,
        account_email: accountEmail,
        default_calendar_id: defaultCalendarId,
        scopes: googleCalendarScopes,
        sync_direction: syncDirection,
        credential_reference: `vault://google-calendar/${defaultCalendarId}`,
        settings: {
          timeZone: "America/Phoenix",
          defaultReminderMinutes: 60,
          includeJobNotes: true,
        },
      });
      onNotice("Google Calendar connection saved.");
      await onReload();
      form.reset();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save connection.");
    }
  };

  const toggleConnectionStatus = async (connection: IntegrationConnectionRecord) => {
    const nextStatus = connection.status === "paused" ? "connected" : "paused";
    const providerLabel =
      connection.provider === "gmail"
        ? "Gmail"
        : connection.provider === "twilio_sms"
          ? "Twilio SMS"
          : connection.provider === "google_maps"
            ? "Google Maps"
            : "Google Calendar";

    try {
      await updateIntegrationConnection(client, connection.id, {
        status: nextStatus,
        last_error: null,
      });
      onNotice(
        nextStatus === "paused"
          ? `${providerLabel} connection paused.`
          : `${providerLabel} connection resumed.`,
      );
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update connection.");
    }
  };

  const queueCalendarEvent = async (event: ScheduleEventRecord) => {
    if (!primaryConnection) {
      onError("Create a Google Calendar connection before queueing events.");
      return;
    }

    const payload = buildGoogleCalendarEventPayload(
      event,
      getScheduleTargetName(snapshot, event),
    );
    const sync = getCalendarSyncRecord(event, primaryConnection, googleSyncs);

    try {
      await upsertCalendarEventSync(client, {
        company_id: event.company_id,
        schedule_event_id: event.id,
        integration_connection_id: primaryConnection.id,
        provider: "google_calendar",
        google_calendar_id: primaryConnection.default_calendar_id ?? "primary",
        google_event_id: sync?.google_event_id ?? null,
        sync_status: sync?.google_event_id ? "needs_update" : "queued",
        sync_direction: primaryConnection.sync_direction,
        last_payload_hash: createPayloadFingerprint(payload),
        last_error: null,
      });
      onNotice(`${event.title} queued for Google Calendar sync.`);
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not queue event.");
    }
  };

  const markCalendarSyncComplete = async (
    event: ScheduleEventRecord,
    sync: NonNullable<ReturnType<typeof getCalendarSyncRecord>>,
  ) => {
    const now = new Date().toISOString();

    try {
      await upsertCalendarEventSync(client, {
        company_id: sync.company_id,
        schedule_event_id: sync.schedule_event_id,
        integration_connection_id: sync.integration_connection_id,
        provider: "google_calendar",
        google_calendar_id: sync.google_calendar_id,
        google_event_id: sync.google_event_id ?? `google-${event.id}`,
        sync_status: "synced",
        sync_direction: sync.sync_direction,
        last_synced_at: now,
        external_updated_at: now,
        last_error: null,
        last_payload_hash: sync.last_payload_hash,
      });
      onNotice(`${event.title} marked synced.`);
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update sync state.");
    }
  };

  const queueEmailMessage = async (message: EmailMessageRecord) => {
    try {
      await updateEmailMessage(client, message.id, {
        status: "queued",
        queued_at: new Date().toISOString(),
        last_error: null,
      });
      onNotice("Email queued for Gmail.");
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not queue email.");
    }
  };

  const markEmailSent = async (message: EmailMessageRecord) => {
    const now = new Date().toISOString();

    try {
      await updateEmailMessage(client, message.id, {
        status: "sent",
        sent_at: now,
        gmail_message_id: message.gmail_message_id ?? `gmail-${message.id}`,
        last_error: null,
      });
      onNotice("Email marked sent.");
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update email.");
    }
  };

  const queueSmsMessage = async (message: SmsMessageRecord) => {
    try {
      await updateSmsMessage(client, message.id, {
        status: "queued",
        queued_at: new Date().toISOString(),
        last_error: null,
      });
      onNotice("SMS queued for Twilio.");
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not queue SMS.");
    }
  };

  const markSmsSent = async (message: SmsMessageRecord) => {
    const now = new Date().toISOString();

    try {
      await updateSmsMessage(client, message.id, {
        status: "sent",
        sent_at: now,
        twilio_message_sid: message.twilio_message_sid ?? `twilio-${message.id}`,
        last_error: null,
      });
      onNotice("SMS marked sent.");
      await onReload();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update SMS.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
        <p className="text-sm font-semibold uppercase text-sky-300">Integration hub</p>
        <h2 className="mt-1 text-2xl font-bold">Real-world service connections</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-300">
          WeatherTech OS is now structured for live calendar, email, maps, SMS,
          accounting, payments, documents, photo, and weather-alert integrations.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                Phase 5 - Google Calendar
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">
                Appointment sync control center
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Queue inspections, job starts, follow-ups, and deliveries for Calendar
                sync while the secure OAuth worker handles Google credentials server-side.
              </p>
            </div>
            {primaryConnection ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={integrationStatusLabel(primaryConnection.status)}
                  tone={getIntegrationStatusTone(primaryConnection.status)}
                />
                <button
                  type="button"
                  onClick={() => void toggleConnectionStatus(primaryConnection)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {primaryConnection.status === "paused" ? "Resume" : "Pause"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <ProfileStat label="Scheduled" value={googleSummary.scheduled} />
            <ProfileStat label="Queued" value={googleSummary.queued} />
            <ProfileStat label="Synced" value={googleSummary.synced} />
            <ProfileStat label="Needs update" value={googleSummary.needsUpdate} />
            <ProfileStat label="Errors" value={googleSummary.errors} />
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-950">
                Calendar-ready schedule events
              </p>
            </div>
            <div className="divide-y divide-slate-200">
              {snapshot.scheduleEvents.map((event) => {
                const sync = getCalendarSyncRecord(
                  event,
                  primaryConnection,
                  googleSyncs,
                );

                return (
                  <article
                    key={event.id}
                    className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-slate-950">{event.title}</h4>
                        {sync ? (
                          <Badge
                            label={calendarSyncStatusLabel(sync.sync_status)}
                            tone={
                              sync.sync_status === "synced"
                                ? "green"
                                : sync.sync_status === "error"
                                  ? "amber"
                                  : "blue"
                            }
                          />
                        ) : (
                          <Badge label="Not queued" tone="amber" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDateTime(event.start_at)} -{" "}
                        {getScheduleTargetName(snapshot, event)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {event.location ?? "No location"} ·{" "}
                        {companyMap.get(event.company_id)?.name ?? "Company"}
                      </p>
                      {sync?.last_error ? (
                        <p className="mt-2 text-sm font-semibold text-amber-700">
                          {sync.last_error}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <button
                        type="button"
                        onClick={() => void queueCalendarEvent(event)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <RefreshCcw className="h-4 w-4" />
                        {sync ? "Queue update" : "Queue sync"}
                      </button>
                      {sync ? (
                        <button
                          type="button"
                          onClick={() => void markCalendarSyncComplete(event, sync)}
                          className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Mark synced
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {!snapshot.scheduleEvents.length ? (
                <div className="p-4">
                  <EmptyState label="No schedule events are ready for Calendar sync." />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Google connection</h3>
            {primaryConnection ? (
              <div className="mt-4 space-y-3 text-sm">
                <ProfileStat
                  label="Calendar"
                  value={primaryConnection.default_calendar_id ?? "primary"}
                />
                <ProfileStat
                  label="Direction"
                  value={syncDirectionLabel(primaryConnection.sync_direction)}
                />
                <ProfileStat
                  label="Account"
                  value={primaryConnection.account_email ?? "Server credential"}
                />
                <ProfileStat
                  label="Last sync"
                  value={
                    primaryConnection.last_sync_at
                      ? formatDateTime(primaryConnection.last_sync_at)
                      : "Not synced yet"
                  }
                />
              </div>
            ) : (
              <form onSubmit={handleCreateGoogleConnection} className="mt-4 grid gap-3">
                <select
                  name="company_id"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {snapshot.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  name="display_name"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Connection name"
                />
                <input
                  name="account_email"
                  type="email"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Google account email"
                />
                <input
                  name="default_calendar_id"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Calendar ID"
                  defaultValue="primary"
                />
                <select
                  name="sync_direction"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="two_way">Two-way</option>
                  <option value="weathertech_to_provider">WeatherTech to Google</option>
                  <option value="provider_to_weathertech">Google to WeatherTech</option>
                </select>
                <button
                  type="submit"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Save connection
                </button>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Event payload preview</h3>
            <p className="mt-1 text-sm text-slate-500">
              Server-side sync will use this shape when calling Google Calendar.
            </p>
            {previewPayload ? (
              <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(previewPayload, null, 2)}
              </pre>
            ) : (
              <div className="mt-4">
                <EmptyState label="Create a schedule event to preview Calendar sync." />
              </div>
            )}
          </section>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                Phase 5 - Gmail
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">
                Estimate, invoice, and follow-up outbox
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Draft and queue customer emails from CRM records while the secure Gmail
                worker sends through the connected company mailbox.
              </p>
            </div>
            {primaryGmailConnection ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={integrationStatusLabel(primaryGmailConnection.status)}
                  tone={getIntegrationStatusTone(primaryGmailConnection.status)}
                />
                <button
                  type="button"
                  onClick={() => void toggleConnectionStatus(primaryGmailConnection)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {primaryGmailConnection.status === "paused" ? "Resume" : "Pause"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ProfileStat label="Drafts" value={emailSummary.draft} />
            <ProfileStat label="Queued" value={emailSummary.queued} />
            <ProfileStat label="Sent" value={emailSummary.sent} />
            <ProfileStat label="Failed" value={emailSummary.failed} />
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-950">Gmail outbox</p>
            </div>
            <div className="divide-y divide-slate-200">
              {snapshot.emailMessages.map((message) => (
                <article
                  key={message.id}
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-950">{message.subject}</h4>
                      <Badge
                        label={emailMessageStatusLabel(message.status)}
                        tone={
                          message.status === "sent"
                            ? "green"
                            : message.status === "failed"
                              ? "amber"
                              : "blue"
                        }
                      />
                      <Badge label={emailCategoryLabel(message.category)} tone="blue" />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      To {message.to_email} ·{" "}
                      {companyMap.get(message.company_id)?.name ?? "Company"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                      {message.body}
                    </p>
                    {message.last_error ? (
                      <p className="mt-2 text-sm font-semibold text-amber-700">
                        {message.last_error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {message.status !== "queued" && message.status !== "sent" ? (
                      <button
                        type="button"
                        onClick={() => void queueEmailMessage(message)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <Mail className="h-4 w-4" />
                        Queue
                      </button>
                    ) : null}
                    {message.status !== "sent" ? (
                      <button
                        type="button"
                        onClick={() => void markEmailSent(message)}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark sent
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!snapshot.emailMessages.length ? (
                <div className="p-4">
                  <EmptyState label="No Gmail drafts or queued sends yet." />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Gmail connection</h3>
            {primaryGmailConnection ? (
              <div className="mt-4 space-y-3 text-sm">
                <ProfileStat
                  label="Mailbox"
                  value={primaryGmailConnection.account_email ?? "Server credential"}
                />
                <ProfileStat
                  label="Direction"
                  value={syncDirectionLabel(primaryGmailConnection.sync_direction)}
                />
                <ProfileStat
                  label="Last send sync"
                  value={
                    primaryGmailConnection.last_sync_at
                      ? formatDateTime(primaryGmailConnection.last_sync_at)
                      : "Not synced yet"
                  }
                />
              </div>
            ) : (
              <form onSubmit={handleCreateGmailConnection} className="mt-4 grid gap-3">
                <select
                  name="company_id"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {snapshot.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  name="display_name"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Connection name"
                />
                <input
                  name="account_email"
                  type="email"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Gmail sender address"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Save Gmail connection
                </button>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Create email</h3>
            <form onSubmit={handleCreateEmailMessage} className="mt-4 grid gap-3">
              <select
                name="company_id"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {snapshot.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <select
                name="customer_id"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">No linked customer</option>
                {snapshot.customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.display_name}
                  </option>
                ))}
              </select>
              <select
                name="source_key"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="follow_up:none">Follow-up</option>
                {snapshot.estimates.map((estimate) => (
                  <option key={estimate.id} value={`estimate:${estimate.id}`}>
                    Estimate · {estimate.title}
                  </option>
                ))}
                {snapshot.invoices.map((invoice) => (
                  <option key={invoice.id} value={`invoice:${invoice.id}`}>
                    Invoice · {invoice.invoice_number}
                  </option>
                ))}
              </select>
              <input
                required
                name="to_email"
                type="email"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Recipient email"
              />
              <input
                name="subject"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Subject override"
              />
              <textarea
                name="body"
                className="min-h-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Body override"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="submit"
                  name="intent"
                  value="draft"
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="queue"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Queue send
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Gmail payload preview</h3>
            {emailPreviewPayload ? (
              <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(emailPreviewPayload, null, 2)}
              </pre>
            ) : (
              <div className="mt-4">
                <EmptyState label="Create an email to preview Gmail send payload." />
              </div>
            )}
          </section>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,0.75fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase text-sky-700">
                Phase 5 - Twilio SMS
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-950">
                Customer and field text outbox
              </h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-500">
                Draft and queue appointment reminders, estimate follow-ups, invoice
                nudges, job updates, and weather-delay texts for a secure Twilio worker.
              </p>
            </div>
            {primaryTwilioConnection ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  label={integrationStatusLabel(primaryTwilioConnection.status)}
                  tone={getIntegrationStatusTone(primaryTwilioConnection.status)}
                />
                <button
                  type="button"
                  onClick={() => void toggleConnectionStatus(primaryTwilioConnection)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  {primaryTwilioConnection.status === "paused" ? "Resume" : "Pause"}
                </button>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ProfileStat label="Drafts" value={smsSummary.draft} />
            <ProfileStat label="Queued" value={smsSummary.queued} />
            <ProfileStat label="Sent" value={smsSummary.sent} />
            <ProfileStat label="Failed" value={smsSummary.failed} />
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-bold text-slate-950">Twilio SMS outbox</p>
            </div>
            <div className="divide-y divide-slate-200">
              {snapshot.smsMessages.map((message) => (
                <article
                  key={message.id}
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-bold text-slate-950">
                        {getSmsTargetName(snapshot, message)}
                      </h4>
                      <Badge
                        label={smsMessageStatusLabel(message.status)}
                        tone={
                          message.status === "sent"
                            ? "green"
                            : message.status === "failed"
                              ? "amber"
                              : "blue"
                        }
                      />
                      <Badge label={smsCategoryLabel(message.category)} tone="blue" />
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      To {message.to_phone} · {countSmsSegments(message.body)} segment
                      {countSmsSegments(message.body) === 1 ? "" : "s"} ·{" "}
                      {companyMap.get(message.company_id)?.name ?? "Company"}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-500">
                      {message.body}
                    </p>
                    {message.last_error ? (
                      <p className="mt-2 text-sm font-semibold text-amber-700">
                        {message.last_error}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {message.status !== "queued" && message.status !== "sent" ? (
                      <button
                        type="button"
                        onClick={() => void queueSmsMessage(message)}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <MessageSquare className="h-4 w-4" />
                        Queue
                      </button>
                    ) : null}
                    {message.status !== "sent" ? (
                      <button
                        type="button"
                        onClick={() => void markSmsSent(message)}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Mark sent
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!snapshot.smsMessages.length ? (
                <div className="p-4">
                  <EmptyState label="No SMS drafts or queued texts yet." />
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Twilio connection</h3>
            {primaryTwilioConnection ? (
              <div className="mt-4 space-y-3 text-sm">
                <ProfileStat
                  label="Account"
                  value={primaryTwilioConnection.external_account_id ?? "Vault credential"}
                />
                <ProfileStat
                  label="From"
                  value={primaryTwilioFromNumber ?? "Messaging service"}
                />
                <ProfileStat
                  label="Last SMS sync"
                  value={
                    primaryTwilioConnection.last_sync_at
                      ? formatDateTime(primaryTwilioConnection.last_sync_at)
                      : "Not synced yet"
                  }
                />
              </div>
            ) : (
              <form onSubmit={handleCreateTwilioConnection} className="mt-4 grid gap-3">
                <select
                  name="company_id"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {snapshot.companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  name="display_name"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Connection name"
                />
                <input
                  name="account_label"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Twilio account label"
                />
                <input
                  name="messaging_service_sid"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Messaging service SID"
                />
                <input
                  name="from_phone"
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Fallback from number"
                />
                <button
                  type="submit"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Save Twilio connection
                </button>
              </form>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Create SMS</h3>
            <form onSubmit={handleCreateSmsMessage} className="mt-4 grid gap-3">
              <select
                name="company_id"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {snapshot.companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <select
                name="target_key"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="general:none">General message</option>
                {snapshot.customers.map((customer) => (
                  <option key={customer.id} value={`customer:${customer.id}`}>
                    Customer · {customer.display_name}
                  </option>
                ))}
                {snapshot.leads.map((lead) => (
                  <option key={lead.id} value={`lead:${lead.id}`}>
                    Lead · {lead.contact_name}
                  </option>
                ))}
                {snapshot.jobs.map((job) => (
                  <option key={job.id} value={`job:${job.id}`}>
                    Job · {job.title}
                  </option>
                ))}
                {snapshot.scheduleEvents.map((scheduleEvent) => (
                  <option key={scheduleEvent.id} value={`schedule:${scheduleEvent.id}`}>
                    Appointment · {scheduleEvent.title}
                  </option>
                ))}
                {snapshot.invoices.map((invoice) => (
                  <option key={invoice.id} value={`invoice:${invoice.id}`}>
                    Invoice · {invoice.invoice_number}
                  </option>
                ))}
              </select>
              <select
                name="category"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              >
                {smsCategories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <input
                name="to_phone"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Recipient phone override"
              />
              <textarea
                name="body"
                className="min-h-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="Message override"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="submit"
                  name="intent"
                  value="draft"
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  name="intent"
                  value="queue"
                  className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Queue SMS
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Twilio readiness</h3>
            <div className="mt-4 grid gap-3 text-sm">
              <ProfileStat label="Account SID" value={twilioEnvVars.accountSid} />
              <ProfileStat label="Messaging service" value={twilioEnvVars.messagingServiceSid} />
              <ProfileStat label="Fallback sender" value={twilioEnvVars.fromNumber} />
              <ProfileStat label="Endpoint" value="Messages API" />
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-950">Twilio payload preview</h3>
            {smsPreviewPayload ? (
              <pre className="mt-4 max-h-80 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify(smsPreviewPayload, null, 2)}
              </pre>
            ) : (
              <div className="mt-4">
                <EmptyState label="Create an SMS to preview Twilio send payload." />
              </div>
            )}
          </section>
        </aside>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {integrationCards.map((card) => (
          <article
            key={card.name}
            className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950">{card.name}</h3>
                <p className="mt-2 text-sm text-slate-500">{card.detail}</p>
              </div>
              <Badge
                label={card.status}
                tone={
                  card.status.includes("active")
                    ? "green"
                    : card.status.includes("Queued")
                      ? "amber"
                      : "blue"
                }
              />
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-950">Implementation sequence</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ProfileStat label="1. Communications" value="Gmail + Twilio" />
          <ProfileStat label="2. Money" value="Stripe + QuickBooks" />
          <ProfileStat label="3. Field ops" value="Maps + Calendar" />
        </div>
      </section>
    </div>
  );
}

function SettingsView({ snapshot }: { snapshot: CrmSnapshot }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-950">Settings</h2>
      <p className="mt-1 text-sm text-slate-500">
        Company records and environment status.
      </p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {snapshot.companies.map((company) => (
          <div key={company.id} className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              {company.trade === "painting" ? (
                <Paintbrush className="h-5 w-5 text-sky-600" />
              ) : (
                <Home className="h-5 w-5 text-sky-600" />
              )}
              <div>
                <p className="font-semibold text-slate-950">{company.name}</p>
                <p className="text-sm capitalize text-slate-500">{company.trade}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Supabase environment variables are configured. CRM records are read from
        and written to the live database.
      </div>
    </section>
  );
}

function LeadMiniCard({
  lead,
  company,
}: {
  lead: LeadRecord;
  company?: CompanyRecord;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-950">{lead.contact_name}</p>
          <p className="mt-1 text-sm text-slate-500">{company?.name}</p>
        </div>
        <Badge label={lead.priority} tone="amber" />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-500">{lead.next_follow_up ?? "No date"}</span>
        <span className="font-semibold text-slate-950">
          {formatMoney(lead.estimated_value)}
        </span>
      </div>
    </div>
  );
}

function ContactLine({
  icon: Icon,
  value,
}: {
  icon: typeof Phone;
  value: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-slate-400" />
      <span>{value}</span>
    </div>
  );
}

function ToastViewport({ notice, error }: { notice: string; error: string }) {
  if (!notice && !error) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="fixed right-4 top-4 z-50 grid w-[calc(100%-2rem)] max-w-sm gap-2"
    >
      {notice ? <Toast tone="success" message={notice} /> : null}
      {error ? <Toast tone="error" message={error} /> : null}
    </div>
  );
}

function Toast({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50/95 text-emerald-800"
          : "border-red-200 bg-red-50/95 text-red-800"
      }`}
    >
      <div className="flex items-start gap-3">
        {tone === "success" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone: "blue" | "green" | "amber" }) {
  const toneClass = {
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-sky-100 text-sky-800",
    green: "bg-emerald-100 text-emerald-800",
  }[tone];

  return (
    <span
      className={`inline-flex w-fit rounded-md px-2.5 py-1 text-xs font-semibold capitalize ${toneClass}`}
    >
      {label.replace("_", " ")}
    </span>
  );
}

function Message({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div
      className={`mt-4 rounded-md border px-4 py-3 text-sm font-medium ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {message}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <div>
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-md bg-sky-100 text-sky-700">
          <Search className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-600">{label}</p>
      </div>
    </div>
  );
}

function PaginationControls({
  page,
  pageCount,
  total,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="font-medium text-slate-500">
        Page {page} of {pageCount} - {total} records
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          disabled={page === 1}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(page + 1, pageCount))}
          disabled={page === pageCount}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function usePagination<T>(items: T[], pageSize = 8) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(Math.ceil(items.length / pageSize), 1);
  const effectivePage = Math.min(page, pageCount);

  return {
    page: effectivePage,
    pageCount,
    setPage,
    pagedItems: items.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
  };
}
