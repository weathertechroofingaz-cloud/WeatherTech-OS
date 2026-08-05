import type {
  AiGroundedResponse,
  AiRecommendedAction,
} from "../crm/aiTools";
import type {
  CrmSnapshot,
  EmailMessageInput,
  EstimateProposalRevisionRecord,
  InspectionRecord,
  ScheduleEventRecord,
} from "../crm/types";

export type GoogleWorkspaceEmailDraftKind =
  | "estimate_delivery"
  | "proposal_delivery"
  | "inspection_confirmation"
  | "appointment_reminder"
  | "ai_generated";

export type GoogleWorkspaceEmailDraftPlan =
  | { ok: true; input: EmailMessageInput }
  | { ok: false; error: string };

type EmailDraftOptions = {
  snapshot: CrmSnapshot;
  kind: Exclude<GoogleWorkspaceEmailDraftKind, "ai_generated">;
  companyId: string;
  sourceId: string;
  customerId?: string | null;
  recipientEmail?: string | null;
  subjectOverride?: string | null;
  bodyOverride?: string | null;
  integrationConnectionId?: string | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatAppointment(value: string | null | undefined) {
  if (!value) {
    return "the scheduled time shown in your appointment details";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function findProposal(snapshot: CrmSnapshot, id: string) {
  return snapshot.proposalRevisions.find((proposal) => proposal.id === id) ?? null;
}

function findInspection(snapshot: CrmSnapshot, id: string) {
  return snapshot.inspections.find((inspection) => inspection.id === id) ?? null;
}

function findScheduleEvent(snapshot: CrmSnapshot, id: string) {
  return snapshot.scheduleEvents.find((event) => event.id === id) ?? null;
}

function getProposalDocumentId(
  snapshot: CrmSnapshot,
  proposal: EstimateProposalRevisionRecord,
) {
  return (
    snapshot.documents.find(
      (document) =>
        document.company_id === proposal.company_id &&
        document.estimate_id === proposal.estimate_id &&
        document.category === "proposal" &&
        document.mime_type === "application/pdf",
    )?.id ?? null
  );
}

function getEstimateDocumentId(snapshot: CrmSnapshot, estimateId: string) {
  return (
    snapshot.documents.find(
      (document) =>
        document.estimate_id === estimateId &&
        document.category === "estimate" &&
        document.mime_type === "application/pdf",
    )?.id ?? null
  );
}

function getInspectionStart(
  snapshot: CrmSnapshot,
  inspection: InspectionRecord,
) {
  return (
    inspection.scheduled_start ??
    snapshot.scheduleEvents.find((event) => event.id === inspection.schedule_event_id)
      ?.start_at ??
    null
  );
}

function getScheduleCustomerId(
  snapshot: CrmSnapshot,
  event: ScheduleEventRecord,
) {
  return (
    event.customer_id ??
    snapshot.jobs.find((job) => job.id === event.job_id)?.customer_id ??
    snapshot.leads.find((lead) => lead.id === event.lead_id)?.customer_id ??
    null
  );
}

export function buildGoogleWorkspaceEmailDraft(
  options: EmailDraftOptions,
): GoogleWorkspaceEmailDraftPlan {
  const {
    snapshot,
    kind,
    companyId,
    sourceId,
    integrationConnectionId = null,
  } = options;
  const company = snapshot.companies.find((candidate) => candidate.id === companyId);

  if (!company) {
    return { ok: false, error: "Select a valid company before creating the email draft." };
  }

  const estimate =
    kind === "estimate_delivery"
      ? snapshot.estimates.find((candidate) => candidate.id === sourceId) ?? null
      : null;
  const proposal = kind === "proposal_delivery" ? findProposal(snapshot, sourceId) : null;
  const inspection =
    kind === "inspection_confirmation" ? findInspection(snapshot, sourceId) : null;
  const scheduleEvent =
    kind === "appointment_reminder" ? findScheduleEvent(snapshot, sourceId) : null;
  const sourceCompanyId =
    estimate?.company_id ??
    proposal?.company_id ??
    inspection?.company_id ??
    scheduleEvent?.company_id ??
    null;

  if (!sourceCompanyId) {
    return { ok: false, error: "Select a valid source record for this email draft." };
  }

  if (sourceCompanyId !== companyId) {
    return {
      ok: false,
      error: "The selected record belongs to a different company mailbox.",
    };
  }

  const sourceCustomerId =
    estimate?.customer_id ??
    proposal?.customer_id ??
    inspection?.customer_id ??
    (scheduleEvent ? getScheduleCustomerId(snapshot, scheduleEvent) : null);
  const resolvedCustomerId = sourceCustomerId ?? options.customerId ?? null;
  const customer = resolvedCustomerId
    ? snapshot.customers.find((candidate) => candidate.id === resolvedCustomerId) ?? null
    : null;

  if (customer && customer.company_id !== companyId) {
    return {
      ok: false,
      error: "The selected customer belongs to a different company mailbox.",
    };
  }
  const leadId =
    proposal?.lead_id ?? inspection?.lead_id ?? scheduleEvent?.lead_id ?? null;
  const lead = leadId
    ? snapshot.leads.find((candidate) => candidate.id === leadId) ?? null
    : null;
  const recipientEmail = options.recipientEmail?.trim() || customer?.email || lead?.email;

  if (!recipientEmail) {
    return {
      ok: false,
      error: "Add the customer's email address before creating this draft.",
    };
  }

  const contactName = customer?.contact_name ?? lead?.contact_name ?? "there";
  let subject = `Message from ${company.name}`;
  let body = `Hi ${contactName},\n\nThank you,\n${company.name}`;
  let estimateId: string | null = null;
  let documentId: string | null = null;
  let jobId: string | null = null;
  let propertyId: string | null = null;
  let attachmentCount = 0;

  if (estimate) {
    subject = `${estimate.title} estimate from ${company.name}`;
    body = `Hi ${contactName},\n\nYour estimate for ${estimate.title} is ready for review. The estimate total is ${formatMoney(estimate.total)}. A PDF copy is attached. Please reply with any questions or when you are ready for the next step.\n\nThank you,\n${company.name}`;
    estimateId = estimate.id;
    propertyId = estimate.property_id ?? null;
    documentId = getEstimateDocumentId(snapshot, estimate.id);
    attachmentCount = 1;
  } else if (proposal) {
    subject = `${proposal.proposal_number} proposal from ${company.name}`;
    body = `Hi ${contactName},\n\nYour proposal, ${proposal.title}, is ready for review. The current proposal total is ${formatMoney(proposal.accepted_total || proposal.base_total)}. A PDF copy is attached. Please reply with any questions or when you are ready to approve the proposal.\n\nThank you,\n${company.name}`;
    estimateId = proposal.estimate_id;
    propertyId = proposal.property_id;
    documentId = getProposalDocumentId(snapshot, proposal);
    attachmentCount = 1;
  } else if (inspection) {
    const startsAt = getInspectionStart(snapshot, inspection);
    const location = inspection.property_address ?? customer?.property_address ?? lead?.property_address;
    subject = `Inspection confirmation from ${company.name}`;
    body = `Hi ${contactName},\n\nThis confirms your ${inspection.title} appointment for ${formatAppointment(startsAt)}${location ? ` at ${location}` : ""}. Please reply if the timing or access details need to change.\n\nThank you,\n${company.name}`;
    estimateId = inspection.estimate_id;
    jobId = inspection.job_id;
    propertyId = inspection.property_id ?? null;
  } else if (scheduleEvent) {
    subject = `Appointment reminder from ${company.name}`;
    body = `Hi ${contactName},\n\nThis is a reminder for ${scheduleEvent.title} on ${formatAppointment(scheduleEvent.start_at)}${scheduleEvent.location ? ` at ${scheduleEvent.location}` : ""}. Please reply if anything has changed before the appointment.\n\nThank you,\n${company.name}`;
    jobId = scheduleEvent.job_id;
    propertyId = scheduleEvent.property_id ?? null;
  }

  const finalSubject = options.subjectOverride?.trim() || subject;
  const finalBody = options.bodyOverride?.trim() || body;

  return {
    ok: true,
    input: {
      company_id: companyId,
      customer_id: resolvedCustomerId,
      lead_id: leadId,
      job_id: jobId,
      property_id: propertyId,
      estimate_id: estimateId,
      document_id: documentId,
      integration_connection_id: integrationConnectionId,
      category:
        kind === "estimate_delivery" || kind === "proposal_delivery"
          ? "estimate"
          : "follow_up",
      status: "draft",
      direction: "outbound",
      to_email: recipientEmail,
      to_emails: [recipientEmail],
      subject: finalSubject,
      body: finalBody,
      message_preview: finalBody.replace(/\s+/g, " ").trim().slice(0, 500),
      has_attachments: attachmentCount > 0,
      attachment_count: attachmentCount,
      sync_status: "local",
      metadata: {
        draftType: kind,
        approvalState: "draft",
        requiresOwnerApproval: true,
        generatedBy: "weathertech_template",
        proposalRevisionId: proposal?.id ?? null,
        proposalNumber: proposal?.proposal_number ?? null,
        inspectionId: inspection?.id ?? null,
        scheduleEventId: scheduleEvent?.id ?? inspection?.schedule_event_id ?? null,
        attachmentPolicy: attachmentCount ? "estimate_pdf" : "none",
      },
    },
  };
}

export function buildAiGeneratedEmailDraft({
  snapshot,
  action,
  response,
  integrationConnectionId = null,
}: {
  snapshot: CrmSnapshot;
  action: AiRecommendedAction;
  response: AiGroundedResponse;
  integrationConnectionId?: string | null;
}): GoogleWorkspaceEmailDraftPlan {
  if (action.type !== "draft_email") {
    return { ok: false, error: "The selected AI action is not an email draft." };
  }

  const target = action.target;
  const existingEmail =
    target?.table === "email_messages"
      ? snapshot.emailMessages.find((email) => email.id === target.id) ?? null
      : null;
  const invoice =
    target?.table === "invoices"
      ? snapshot.invoices.find((candidate) => candidate.id === target.id) ?? null
      : null;
  const estimate =
    target?.table === "estimates"
      ? snapshot.estimates.find((candidate) => candidate.id === target.id) ?? null
      : null;
  const customerId =
    existingEmail?.customer_id ?? invoice?.customer_id ?? estimate?.customer_id ?? null;
  const customer = customerId
    ? snapshot.customers.find((candidate) => candidate.id === customerId) ?? null
    : null;
  const companyId =
    action.companyId ??
    existingEmail?.company_id ??
    invoice?.company_id ??
    estimate?.company_id ??
    null;
  const company = companyId
    ? snapshot.companies.find((candidate) => candidate.id === companyId) ?? null
    : null;
  const recipientEmail =
    customer?.email ??
    (existingEmail?.direction === "inbound"
      ? existingEmail.from_email
      : existingEmail?.to_email) ??
    null;

  if (!companyId || !company || !recipientEmail) {
    return {
      ok: false,
      error: "AI needs a company-scoped customer email before it can create this draft.",
    };
  }

  const aiBody = response.answer.trim();
  const subject = existingEmail?.subject
    ? existingEmail.subject.toLowerCase().startsWith("re:")
      ? existingEmail.subject
      : `Re: ${existingEmail.subject}`
    : invoice
      ? `${invoice.invoice_number} follow-up from ${company.name}`
      : estimate
        ? `${estimate.title} follow-up from ${company.name}`
        : `Follow-up from ${company.name}`;

  return {
    ok: true,
    input: {
      company_id: companyId,
      customer_id: customerId,
      lead_id: existingEmail?.lead_id ?? null,
      job_id: existingEmail?.job_id ?? invoice?.job_id ?? null,
      property_id: existingEmail?.property_id ?? invoice?.property_id ?? estimate?.property_id ?? null,
      estimate_id: existingEmail?.estimate_id ?? estimate?.id ?? invoice?.estimate_id ?? null,
      invoice_id: existingEmail?.invoice_id ?? invoice?.id ?? null,
      integration_connection_id: integrationConnectionId,
      category: invoice ? "invoice" : estimate ? "estimate" : "follow_up",
      status: "draft",
      direction: "outbound",
      to_email: recipientEmail,
      to_emails: [recipientEmail],
      subject,
      body: aiBody,
      gmail_thread_id: existingEmail?.gmail_thread_id ?? null,
      message_preview: aiBody.replace(/\s+/g, " ").slice(0, 500),
      sync_status: "local",
      metadata: {
        draftType: "ai_generated",
        approvalState: "draft",
        requiresOwnerApproval: true,
        generatedBy: "ai_command_center",
        aiResponseId: response.id,
        aiAuditReference: action.auditReference,
        aiReviewState: "approved_for_draft_only",
      },
    },
  };
}
