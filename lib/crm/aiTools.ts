import type {
  CallRecord,
  CompanyMembershipRole,
  CompanyRecord,
  CrmSnapshot,
  CustomerRecord,
  DocumentRecord,
  EstimateProposalRevisionRecord,
  EstimateRecord,
  InspectionRecord,
  IntegrationSyncLogRecord,
  InvoiceRecord,
  JobRecord,
  LeadRecord,
  ProposalAuditEventRecord,
  ScheduleEventRecord,
  ScopeCategory,
  ScopeTemplateRecord,
  ServiceType,
} from "./types";
import { scopeCrmSnapshotByCompany, type CompanyScopeId } from "./companyScope";

export type AiProviderKey = "disabled" | "openai" | "anthropic" | "owner_approved";
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
export type AiPriority = "critical" | "high" | "medium" | "low";
export type AiResponseCompleteness = "complete" | "partial" | "insufficient";
export type AiActionType =
  | "open_record"
  | "draft_scope"
  | "draft_proposal"
  | "draft_email"
  | "draft_sms"
  | "create_follow_up_draft"
  | "prepare_schedule_change"
  | "prepare_job_conversion"
  | "prepare_invoice_draft"
  | "prepare_change_order_draft"
  | "prepare_customer_summary"
  | "prepare_inspection_report"
  | "prepare_document_summary";

export type AiSourceRecord = {
  table: string;
  id: string;
  label: string;
  companyId: string | null;
  safeReference: string;
  hrefView: string;
};

export type AiRecommendedAction = {
  id: string;
  type: AiActionType;
  label: string;
  target: AiSourceRecord | null;
  companyId: string | null;
  reason: string;
  preview: string;
  fieldsToChange: Record<string, unknown>;
  requiredPermission: CompanyMembershipRole | "owner" | "admin";
  requiredConfirmation: boolean;
  providerDependency: string | null;
  auditReference: string;
  blocked: boolean;
};

export type AiPriorityItem = {
  id: string;
  priority: AiPriority;
  score: number;
  title: string;
  summary: string;
  reason: string;
  category:
    | "sales"
    | "production"
    | "financial"
    | "customer"
    | "inspection"
    | "document"
    | "integration"
    | "weather"
    | "readiness";
  companyId: string | null;
  owner: string | null;
  dueAt: string | null;
  ageDays: number;
  source: AiSourceRecord;
  supportingFields: Record<string, string | number | boolean | null>;
  suggestedAction: AiRecommendedAction;
};

export type AiGroundedResponse = {
  id: string;
  taskType: AiTaskType;
  mode: "rule_based_insight" | "provider_disabled" | "safety_block" | "live_provider";
  prompt: string;
  answer: string;
  supportingRecords: AiSourceRecord[];
  completeness: AiResponseCompleteness;
  missingInformation: string[];
  recommendedNextAction: string;
  approvalRequired: boolean;
  readOnly: boolean;
  providerRequired: boolean;
  productionDisabled: boolean;
  safetyFlags: string[];
  actions: AiRecommendedAction[];
  createdAt: string;
};

export type AiAssistantDraft = {
  id: string;
  title: string;
  taskType: AiTaskType;
  companyId: string | null;
  mode: "rule_based_insight" | "provider_disabled";
  body: string;
  missingInformation: string[];
  sourceRecords: AiSourceRecord[];
  actions: AiRecommendedAction[];
  customerFacingSafe: boolean;
  requiresApproval: boolean;
};

export type AiExecutiveBrief = {
  generatedAt: string;
  headline: string;
  summary: string;
  metrics: Array<{
    label: string;
    value: string;
    detail: string;
    tone: "critical" | "warning" | "healthy" | "neutral";
  }>;
  recommendations: AiPriorityItem[];
};

export type AiProviderReadiness = {
  provider: AiProviderKey;
  label: string;
  status:
    | "disabled"
    | "configuration_required"
    | "api_key_missing"
    | "usage_limit_reached"
    | "ready_for_controlled_testing"
    | "provider_connected"
    | "provider_test_failed";
  summary: string;
  productionDisabled: boolean;
  requiredOwnerSetup: string[];
  capabilities: string[];
};

export type AiWorkspaceModel = {
  generatedAt: string;
  companyScopeLabel: string;
  provider: AiProviderReadiness;
  executiveBrief: AiExecutiveBrief;
  priorityItems: AiPriorityItem[];
  savedAnalyses: AiAssistantDraft[];
  generatedDrafts: AiAssistantDraft[];
  scopeWriter: AiAssistantDraft[];
  estimateAssistant: AiAssistantDraft[];
  proposalIntelligence: AiAssistantDraft[];
  inspectionAssistant: AiAssistantDraft[];
  salesAssistant: AiAssistantDraft[];
  operationsAssistant: AiAssistantDraft[];
  financialAssistant: AiAssistantDraft[];
  communicationsAssistant: AiAssistantDraft[];
  marketingAssistant: AiAssistantDraft[];
  weatherAssistant: AiAssistantDraft[];
  documentAssistant: AiAssistantDraft[];
  approvalGates: string[];
  contextSummary: {
    customers: number;
    leads: number;
    estimates: number;
    proposals: number;
    jobs: number;
    inspections: number;
    invoices: number;
    documents: number;
    communications: number;
    integrationEvents: number;
  };
};

type AiBuildOptions = {
  companyId?: CompanyScopeId;
  now?: string;
  userRole?: CompanyMembershipRole | "owner" | "admin";
  companyMap?: Map<string, CompanyRecord>;
};

const unsafePromptPatterns = [
  /ignore (all )?(previous|system|developer) instructions/i,
  /reveal (the )?(secret|api key|token|service[_ -]?role)/i,
  /bypass (rls|security|approval|permissions)/i,
  /send (sms|email|text|message) now/i,
  /charge (the )?(card|customer)/i,
  /mark (.*)paid/i,
  /apply migration/i,
  /deploy (to )?(production|vercel)/i,
];

const approvalGates = [
  "saving an estimate",
  "saving a proposal",
  "changing pricing",
  "changing scope",
  "changing warranty",
  "creating a job",
  "creating an invoice",
  "recording a payment",
  "scheduling or rescheduling",
  "assigning a crew",
  "sending email",
  "sending SMS",
  "publishing website content",
  "replying to a review",
  "sending a signature request",
  "enabling a provider",
  "applying a migration",
  "deploying",
];

export const aiProviderReadiness: AiProviderReadiness = {
  provider: "disabled",
  label: "AI provider not configured",
  status: "configuration_required",
  summary:
    "Live AI is disabled. WeatherTech OS can show rule-based insights from authorized CRM data, but model calls, streaming, and paid providers require owner setup.",
  productionDisabled: true,
  requiredOwnerSetup: [
    "Owner-approved AI provider selection",
    "Server-side API credentials",
    "Approved model and token limits",
    "Usage budget",
    "Controlled testing approval",
  ],
  capabilities: [
    "chat completion",
    "structured output",
    "tool selection",
    "context retrieval",
    "streaming readiness",
    "token limits",
    "model selection",
    "cost tracking",
    "request logging",
    "safety settings",
  ],
};

export function buildAiWorkspaceModel(
  snapshot: CrmSnapshot,
  options: AiBuildOptions = {},
): AiWorkspaceModel {
  const now = options.now ?? new Date().toISOString();
  const authorizedSnapshot = getAuthorizedAiSnapshot(snapshot, options.companyId);
  const companyScopeLabel = getCompanyScopeLabel(snapshot, options.companyId, options.companyMap);
  const priorityItems = buildAiPriorityItems(authorizedSnapshot, { ...options, now });
  const executiveBrief = buildExecutiveBrief(authorizedSnapshot, priorityItems, now);
  const scopeWriter = buildScopeWriterDrafts(authorizedSnapshot);
  const estimateAssistant = buildEstimateAssistantDrafts(authorizedSnapshot);
  const proposalIntelligence = buildProposalIntelligence(authorizedSnapshot);
  const inspectionAssistant = buildInspectionAssistant(authorizedSnapshot);
  const salesAssistant = buildSalesAssistant(authorizedSnapshot, priorityItems);
  const operationsAssistant = buildOperationsAssistant(authorizedSnapshot, priorityItems);
  const financialAssistant = buildFinancialAssistant(authorizedSnapshot, priorityItems, options.userRole);
  const communicationsAssistant = buildCommunicationsAssistant(authorizedSnapshot);
  const marketingAssistant = buildMarketingAssistant(authorizedSnapshot);
  const weatherAssistant = buildWeatherAssistant(authorizedSnapshot);
  const documentAssistant = buildDocumentAssistant(authorizedSnapshot);

  return {
    generatedAt: now,
    companyScopeLabel,
    provider: aiProviderReadiness,
    executiveBrief,
    priorityItems,
    savedAnalyses: buildSavedAnalysisPreviews(authorizedSnapshot, priorityItems),
    generatedDrafts: [
      ...scopeWriter.slice(0, 2),
      ...estimateAssistant.slice(0, 2),
      ...communicationsAssistant.slice(0, 2),
    ],
    scopeWriter,
    estimateAssistant,
    proposalIntelligence,
    inspectionAssistant,
    salesAssistant,
    operationsAssistant,
    financialAssistant,
    communicationsAssistant,
    marketingAssistant,
    weatherAssistant,
    documentAssistant,
    approvalGates,
    contextSummary: {
      customers: authorizedSnapshot.customers.length,
      leads: authorizedSnapshot.leads.length,
      estimates: authorizedSnapshot.estimates.length,
      proposals: authorizedSnapshot.proposalRevisions.length,
      jobs: authorizedSnapshot.jobs.length,
      inspections: authorizedSnapshot.inspections.length,
      invoices: authorizedSnapshot.invoices.length,
      documents: authorizedSnapshot.documents.length,
      communications:
        authorizedSnapshot.emailMessages.length +
        authorizedSnapshot.smsMessages.length +
        authorizedSnapshot.callRecords.length +
        authorizedSnapshot.communicationProviderEvents.length,
      integrationEvents: authorizedSnapshot.integrationSyncLogs.length,
    },
  };
}

export function answerAiCommand({
  prompt,
  snapshot,
  options = {},
}: {
  prompt: string;
  snapshot: CrmSnapshot;
  options?: AiBuildOptions;
}): AiGroundedResponse {
  const cleanPrompt = sanitizeBusinessText(prompt).slice(0, 600);
  const now = options.now ?? new Date().toISOString();
  const authorizedSnapshot = getAuthorizedAiSnapshot(snapshot, options.companyId);
  const safetyFlags = unsafePromptPatterns
    .filter((pattern) => pattern.test(prompt))
    .map((pattern) => pattern.source);

  if (safetyFlags.length > 0) {
    return {
      id: `ai-response-${Date.now()}`,
      taskType: "command",
      mode: "safety_block",
      prompt: cleanPrompt,
      answer:
        "Blocked. The request appears to ask WeatherTech OS to bypass approvals, expose secrets, send live communications, move money, deploy, or override security controls.",
      supportingRecords: [],
      completeness: "insufficient",
      missingInformation: ["Submit a safe read-only question or use an existing approved workflow."],
      recommendedNextAction: "Rephrase the request as a read-only analysis or draft request.",
      approvalRequired: true,
      readOnly: true,
      providerRequired: false,
      productionDisabled: true,
      safetyFlags,
      actions: [],
      createdAt: now,
    };
  }

  const normalizedPrompt = cleanPrompt.toLowerCase();
  const priorityItems = buildAiPriorityItems(authorizedSnapshot, { ...options, now });
  const taskType = inferTaskType(normalizedPrompt);
  const matchedItems = filterPriorityItemsForPrompt(priorityItems, normalizedPrompt);
  const supportingRecords = matchedItems.map((item) => item.source).slice(0, 8);
  const responseActions = matchedItems.map((item) => item.suggestedAction).slice(0, 4);

  if (normalizedPrompt.includes("draft") || taskType === "communication_draft") {
    const draft = buildDraftAnswer(authorizedSnapshot, normalizedPrompt);
    return {
      id: `ai-response-${Date.now()}`,
      taskType,
      mode: "rule_based_insight",
      prompt: cleanPrompt,
      answer: draft.body,
      supportingRecords: draft.sourceRecords,
      completeness: draft.missingInformation.length ? "partial" : "complete",
      missingInformation: draft.missingInformation,
      recommendedNextAction: "Review the draft, confirm record context, then copy it into the existing workflow if approved.",
      approvalRequired: true,
      readOnly: true,
      providerRequired: false,
      productionDisabled: true,
      safetyFlags: [],
      actions: draft.actions,
      createdAt: now,
    };
  }

  const answer = matchedItems.length
    ? [
        `Found ${matchedItems.length} priority item${matchedItems.length === 1 ? "" : "s"} for this request.`,
        ...matchedItems
          .slice(0, 5)
          .map((item, index) => `${index + 1}. ${item.title}: ${item.reason}`),
      ].join("\n")
    : "No matching records are visible in the authorized WeatherTech OS snapshot. This is a read-only rule-based response, not a live AI-provider answer.";

  return {
    id: `ai-response-${Date.now()}`,
    taskType,
    mode: "rule_based_insight",
    prompt: cleanPrompt,
    answer,
    supportingRecords,
    completeness: matchedItems.length ? "partial" : "insufficient",
    missingInformation: matchedItems.length
      ? ["Live AI provider is not configured, so this answer uses deterministic OS rules only."]
      : ["No matching authorized records were available in the loaded company scope."],
    recommendedNextAction:
      responseActions[0]?.label ??
      "Open the related workspace and confirm the next step with a human reviewer.",
    approvalRequired: responseActions.some((action) => action.requiredConfirmation),
    readOnly: true,
    providerRequired: false,
    productionDisabled: true,
    safetyFlags: [],
    actions: responseActions,
    createdAt: now,
  };
}

export function sanitizeBusinessText(input: string | null | undefined) {
  return (input ?? "")
    .replace(/service[_ -]?role/gi, "[redacted key label]")
    .replace(/api[_ -]?key/gi, "[redacted key label]")
    .replace(/access[_ -]?token/gi, "[redacted token label]")
    .replace(/refresh[_ -]?token/gi, "[redacted token label]")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildAiPriorityItems(
  snapshot: CrmSnapshot,
  options: AiBuildOptions = {},
): AiPriorityItem[] {
  const now = new Date(options.now ?? new Date().toISOString());
  const authorizedSnapshot = getAuthorizedAiSnapshot(snapshot, options.companyId);
  const today = toDateKey(now.toISOString());
  const items: AiPriorityItem[] = [];

  const push = (item: AiPriorityItem) => {
    items.push(item);
  };

  for (const lead of authorizedSnapshot.leads) {
    const followUpDue = Boolean(lead.next_follow_up && lead.next_follow_up <= today);
    if (lead.status === "new" || lead.status === "contacted" || followUpDue) {
      const source = leadSource(lead);
      push({
        id: `lead-${lead.id}`,
        priority: lead.priority === "urgent" ? "critical" : lead.priority === "high" ? "high" : followUpDue ? "high" : "medium",
        score: scoreFromFactors({
          urgency: lead.priority === "urgent" ? 32 : lead.priority === "high" ? 22 : 10,
          overdue: followUpDue ? 24 : 0,
          value: lead.estimated_value,
          ageDays: ageInDays(lead.created_at, now),
        }),
        title: `${lead.contact_name} needs lead follow-up`,
        summary: `${lead.source} ${lead.service_type} lead at ${lead.property_address || "unknown address"}`,
        reason: followUpDue
          ? `Next follow-up was due ${lead.next_follow_up}.`
          : `Lead is still ${lead.status.replace("_", " ")}.`,
        category: "sales",
        companyId: lead.company_id,
        owner: lead.created_by,
        dueAt: lead.next_follow_up,
        ageDays: ageInDays(lead.created_at, now),
        source,
        supportingFields: {
          status: lead.status,
          source: lead.source,
          estimated_value: lead.estimated_value,
          next_follow_up: lead.next_follow_up,
        },
        suggestedAction: action("open_record", "Open lead", source, lead.company_id, "Confirm qualification and next follow-up."),
      });
    }
  }

  for (const estimate of authorizedSnapshot.estimates) {
    if (estimate.status === "sent" || estimate.status === "draft") {
      const ageDays = ageInDays(estimate.updated_at, now);
      const source = estimateSource(estimate);
      const isStale = estimate.status === "sent" && ageDays >= 3;
      push({
        id: `estimate-${estimate.id}`,
        priority: isStale ? "high" : estimate.status === "sent" ? "medium" : "low",
        score: scoreFromFactors({
          urgency: isStale ? 22 : 8,
          overdue: isStale ? 16 : 0,
          value: estimate.total,
          ageDays,
        }),
        title: `${estimate.title} needs estimate attention`,
        summary: `${estimate.status} ${estimate.service_type} estimate worth ${money(estimate.total)}`,
        reason: isStale
          ? `Estimate was last updated ${ageDays} days ago and may need follow-up.`
          : `Estimate remains ${estimate.status}.`,
        category: "sales",
        companyId: estimate.company_id,
        owner: null,
        dueAt: estimate.expiration_date,
        ageDays,
        source,
        supportingFields: {
          status: estimate.status,
          total: estimate.total,
          expiration_date: estimate.expiration_date,
          profit_margin_total: estimate.profit_margin_total,
        },
        suggestedAction: action("draft_proposal", "Review estimate", source, estimate.company_id, "Prepare or follow up through the existing estimate workflow."),
      });
    }
  }

  for (const proposal of authorizedSnapshot.proposalRevisions) {
    const source = proposalSource(proposal);
    const awaitingSignature =
      proposal.requires_signature &&
      ["ready_to_send", "sent", "viewed"].includes(proposal.status) &&
      proposal.signature_status !== "signed";
    const awaitingDeposit =
      proposal.status === "accepted" &&
      proposal.deposit_required &&
      proposal.deposit_paid < proposal.deposit_amount;

    if (awaitingSignature || awaitingDeposit || proposal.status === "ready_for_review") {
      push({
        id: `proposal-${proposal.id}`,
        priority: awaitingDeposit ? "critical" : awaitingSignature ? "high" : "medium",
        score: scoreFromFactors({
          urgency: awaitingDeposit ? 34 : awaitingSignature ? 24 : 14,
          overdue: ageInDays(proposal.updated_at, now) > 2 ? 12 : 0,
          value: proposal.accepted_total || proposal.base_total,
          ageDays: ageInDays(proposal.updated_at, now),
        }),
        title: `${proposal.title} needs proposal review`,
        summary: `${proposal.status.replace(/_/g, " ")} proposal ${proposal.proposal_number}`,
        reason: awaitingDeposit
          ? `Accepted proposal still has ${money(proposal.deposit_amount - proposal.deposit_paid)} deposit outstanding.`
          : awaitingSignature
          ? `Signature is required and currently ${proposal.signature_status.replace(/_/g, " ")}.`
          : "Proposal is ready for internal review before customer delivery.",
        category: "sales",
        companyId: proposal.company_id,
        owner: proposal.updated_by,
        dueAt: proposal.deposit_due_date ?? proposal.expires_at,
        ageDays: ageInDays(proposal.updated_at, now),
        source,
        supportingFields: {
          status: proposal.status,
          signature_status: proposal.signature_status,
          payment_status: proposal.payment_status,
          deposit_amount: proposal.deposit_amount,
          deposit_paid: proposal.deposit_paid,
        },
        suggestedAction: action("draft_proposal", "Review proposal readiness", source, proposal.company_id, "Open Proposal Builder 2.0 and review customer-safe packet readiness."),
      });
    }
  }

  for (const job of authorizedSnapshot.jobs) {
    const missingSchedule = !job.scheduled_start && !job.start_date;
    const missingCrew =
      ["scheduled", "in_progress"].includes(job.status) &&
      !job.crew_name &&
      !authorizedSnapshot.jobAssignments.some((assignment) => assignment.job_id === job.id);
    if (job.status === "blocked" || missingSchedule || missingCrew) {
      const source = jobSource(job);
      push({
        id: `job-${job.id}`,
        priority: job.status === "blocked" ? "critical" : missingCrew ? "high" : "medium",
        score: scoreFromFactors({
          urgency: job.status === "blocked" ? 34 : missingCrew ? 24 : 12,
          overdue: missingSchedule ? 12 : 0,
          value: job.total,
          ageDays: ageInDays(job.updated_at, now),
        }),
        title: `${job.title} is at operational risk`,
        summary: `${job.status.replace("_", " ")} job at ${job.property_address}`,
        reason: job.status === "blocked"
          ? "Job is marked blocked."
          : missingCrew
          ? "Job is scheduled or active without a visible crew assignment."
          : "Job is awaiting production scheduling.",
        category: "production",
        companyId: job.company_id,
        owner: job.project_manager,
        dueAt: job.scheduled_start ?? job.start_date,
        ageDays: ageInDays(job.updated_at, now),
        source,
        supportingFields: {
          status: job.status,
          scheduled_start: job.scheduled_start,
          crew_name: job.crew_name,
          total: job.total,
        },
        suggestedAction: action("prepare_schedule_change", "Open production", source, job.company_id, "Confirm schedule, crew, material readiness, and customer update."),
      });
    }
  }

  for (const inspection of authorizedSnapshot.inspections) {
    const awaitingReport =
      inspection.status === "completed" &&
      inspection.report_requested &&
      !inspection.report_document_id &&
      !inspection.report_created_at;
    const scheduledWithoutInspector =
      inspection.status === "scheduled" && !inspection.assigned_inspector;
    if (awaitingReport || scheduledWithoutInspector || inspection.status === "needs_review") {
      const source = inspectionSource(inspection);
      push({
        id: `inspection-${inspection.id}`,
        priority: awaitingReport ? "high" : scheduledWithoutInspector ? "medium" : "high",
        score: scoreFromFactors({
          urgency: awaitingReport ? 24 : 12,
          overdue: awaitingReport ? 10 : 0,
          value: 0,
          ageDays: ageInDays(inspection.updated_at, now),
        }),
        title: `${inspection.title} needs inspection follow-through`,
        summary: `${inspection.status.replace("_", " ")} inspection`,
        reason: awaitingReport
          ? "Inspection is complete and report was requested, but no report document is linked."
          : scheduledWithoutInspector
          ? "Inspection is scheduled without an assigned inspector."
          : "Inspection is marked needs review.",
        category: "inspection",
        companyId: inspection.company_id,
        owner: inspection.assigned_inspector,
        dueAt: inspection.scheduled_start,
        ageDays: ageInDays(inspection.updated_at, now),
        source,
        supportingFields: {
          status: inspection.status,
          report_requested: inspection.report_requested,
          report_document_id: inspection.report_document_id,
          findings: inspection.findings.length,
          measurements: inspection.measurements.length,
        },
        suggestedAction: action("prepare_inspection_report", "Open inspection", source, inspection.company_id, "Review findings, photos, measurements, and report readiness."),
      });
    }
  }

  for (const invoice of authorizedSnapshot.invoices) {
    if (invoice.status === "overdue" || (invoice.status === "sent" && invoice.balance_due > 0)) {
      const source = invoiceSource(invoice);
      const overdue = invoice.status === "overdue";
      push({
        id: `invoice-${invoice.id}`,
        priority: overdue ? "critical" : "medium",
        score: scoreFromFactors({
          urgency: overdue ? 34 : 12,
          overdue: overdue ? 18 : 0,
          value: invoice.balance_due,
          ageDays: ageInDays(invoice.updated_at, now),
        }),
        title: `${invoice.invoice_number} needs collection attention`,
        summary: `${money(invoice.balance_due)} balance due`,
        reason: overdue ? "Invoice is overdue." : "Invoice remains sent with a positive balance.",
        category: "financial",
        companyId: invoice.company_id,
        owner: null,
        dueAt: invoice.due_date,
        ageDays: ageInDays(invoice.updated_at, now),
        source,
        supportingFields: {
          status: invoice.status,
          balance_due: invoice.balance_due,
          due_date: invoice.due_date,
        },
        suggestedAction: action("draft_email", "Draft collection follow-up", source, invoice.company_id, "Prepare a customer-safe reminder, then send only through an approved workflow."),
      });
    }
  }

  for (const log of authorizedSnapshot.integrationSyncLogs) {
    if (log.status === "failed" || log.status === "retrying") {
      const source = integrationSource(log);
      push({
        id: `integration-${log.id}`,
        priority: log.status === "failed" ? "high" : "medium",
        score: scoreFromFactors({
          urgency: log.status === "failed" ? 20 : 10,
          overdue: 0,
          value: 0,
          ageDays: ageInDays(log.created_at, now),
        }),
        title: `${log.provider} ${log.event_type} needs integration review`,
        summary: `${log.status} integration sync`,
        reason: log.error_message ?? "Integration sync is not healthy.",
        category: "integration",
        companyId: log.company_id,
        owner: null,
        dueAt: log.next_retry_at,
        ageDays: ageInDays(log.created_at, now),
        source,
        supportingFields: {
          status: log.status,
          provider: log.provider,
          event_type: log.event_type,
          attempt_count: log.attempt_count,
        },
        suggestedAction: action("open_record", "Open Integration Center", source, log.company_id, "Review provider readiness before retrying any live sync."),
      });
    }
  }

  return items.sort((left, right) => right.score - left.score).slice(0, 40);
}

function buildExecutiveBrief(
  snapshot: CrmSnapshot,
  priorityItems: AiPriorityItem[],
  now: string,
): AiExecutiveBrief {
  const openPipeline = snapshot.estimates
    .filter((estimate) => ["draft", "sent"].includes(estimate.status))
    .reduce((total, estimate) => total + estimate.total, 0);
  const activeProduction = snapshot.jobs
    .filter((job) => ["scheduled", "in_progress", "blocked"].includes(job.status))
    .reduce((total, job) => total + job.total, 0);
  const overdueInvoices = snapshot.invoices.filter(
    (invoice) => invoice.status === "overdue" || invoice.balance_due > 0,
  );
  const criticalCount = priorityItems.filter((item) => item.priority === "critical").length;

  return {
    generatedAt: now,
    headline: criticalCount
      ? `${criticalCount} critical item${criticalCount === 1 ? "" : "s"} need owner attention`
      : "No critical AI priority items in the current authorized snapshot",
    summary:
      "This is a rule-based executive brief grounded in visible CRM records. Live generative AI is disabled until an owner-approved provider is configured.",
    metrics: [
      {
        label: "Priority items",
        value: String(priorityItems.length),
        detail: "Ranked by urgency, due date, value, and workflow risk",
        tone: priorityItems.length ? "warning" : "healthy",
      },
      {
        label: "Pipeline value",
        value: money(openPipeline),
        detail: "Draft and sent estimates only",
        tone: openPipeline ? "neutral" : "warning",
      },
      {
        label: "Production value",
        value: money(activeProduction),
        detail: "Scheduled, active, and blocked jobs",
        tone: activeProduction ? "neutral" : "healthy",
      },
      {
        label: "Collection risk",
        value: money(overdueInvoices.reduce((total, invoice) => total + invoice.balance_due, 0)),
        detail: `${overdueInvoices.length} invoice${overdueInvoices.length === 1 ? "" : "s"} need review`,
        tone: overdueInvoices.length ? "critical" : "healthy",
      },
    ],
    recommendations: priorityItems.slice(0, 6),
  };
}

function buildScopeWriterDrafts(snapshot: CrmSnapshot): AiAssistantDraft[] {
  const templates = snapshot.scopeTemplates.length
    ? snapshot.scopeTemplates
    : [
        syntheticScopeTemplate("weathertech-roofing-scope", "Tile roof replacement scope", "roofing"),
        syntheticScopeTemplate("ihc-painting-scope", "Exterior painting scope", "exterior_painting"),
      ];

  return templates.slice(0, 6).map((template) => {
    const customer = snapshot.customers.find((candidate) =>
      template.company_id ? candidate.company_id === template.company_id : true,
    );
    const sourceRecords = [scopeTemplateSource(template)];
    if (customer) {
      sourceRecords.push(customerSource(customer));
    }

    return {
      id: `scope-draft-${template.id}`,
      title: `${template.title} draft assistant`,
      taskType: "scope_writer",
      companyId: template.company_id,
      mode: "rule_based_insight",
      body: [
        `Customer-ready ${template.category.replace(/_/g, " ")} scope draft based on approved template language.`,
        customer
          ? `Context: ${customer.display_name} at ${customer.property_address}.`
          : "Context: no customer selected yet.",
        "Missing measurements, selected materials, warranty period, and exclusions must be confirmed before saving or proposal use.",
      ].join(" "),
      missingInformation: [
        "confirmed measurements",
        "selected materials",
        "warranty period",
        "project exclusions",
      ],
      sourceRecords,
      actions: [
        action("draft_scope", "Copy into Scope Writer", sourceRecords[0], template.company_id, "Review and save through the existing Scope Writer only after confirmation."),
      ],
      customerFacingSafe: true,
      requiresApproval: true,
    };
  });
}

function buildEstimateAssistantDrafts(snapshot: CrmSnapshot): AiAssistantDraft[] {
  const candidates = snapshot.estimates.slice(0, 6);

  if (!candidates.length) {
    return [
      {
        id: "estimate-assistant-empty",
        title: "Estimate Assistant 2.0 ready",
        taskType: "estimate_assistant",
        companyId: null,
        mode: "provider_disabled",
        body:
          "No estimates are visible in this company scope. Create or select an estimate before preparing proposal sections, options, or deposit guidance.",
        missingInformation: ["estimate", "customer", "property", "line items"],
        sourceRecords: [],
        actions: [],
        customerFacingSafe: true,
        requiresApproval: true,
      },
    ];
  }

  return candidates.map((estimate) => {
    const items = snapshot.estimateLineItems.filter((item) => item.estimate_id === estimate.id);
    const source = estimateSource(estimate);
    const missing = [
      !items.length ? "line items" : null,
      !estimate.customer_id && !estimate.lead_id ? "customer or lead link" : null,
      !estimate.scope_of_work ? "scope of work" : null,
      estimate.profit_margin_total > 0 ? null : "margin review",
    ].filter((value): value is string => Boolean(value));

    return {
      id: `estimate-assistant-${estimate.id}`,
      title: `${estimate.title} proposal readiness`,
      taskType: "estimate_assistant",
      companyId: estimate.company_id,
      mode: "rule_based_insight",
      body: [
        `${estimate.title} totals ${money(estimate.total)} with ${items.length} line item${items.length === 1 ? "" : "s"}.`,
        "Optional upgrades and alternatives must remain outside the base total until selected.",
        "Live proposal delivery, signatures, payment collection, and QuickBooks export remain disabled.",
      ].join(" "),
      missingInformation: missing,
      sourceRecords: [source],
      actions: [
        action("draft_proposal", "Prepare proposal draft", source, estimate.company_id, "Open Proposal Builder 2.0 and review customer-safe proposal structure."),
      ],
      customerFacingSafe: true,
      requiresApproval: true,
    };
  });
}

function buildProposalIntelligence(snapshot: CrmSnapshot): AiAssistantDraft[] {
  return snapshot.proposalRevisions.slice(0, 6).map((proposal) => {
    const sections = snapshot.proposalSections.filter(
      (section) => section.proposal_revision_id === proposal.id,
    );
    const options = snapshot.proposalOptions.filter(
      (option) => option.proposal_revision_id === proposal.id,
    );
    const source = proposalSource(proposal);
    const missing = [
      !sections.some((section) => section.section_type === "warranty") ? "warranty section" : null,
      !sections.some((section) => section.section_type === "exclusions") ? "exclusions section" : null,
      proposal.requires_signature && proposal.signature_status === "not_configured"
        ? "signature provider setup"
        : null,
    ].filter((value): value is string => Boolean(value));

    return {
      id: `proposal-review-${proposal.id}`,
      title: `${proposal.proposal_number} completeness review`,
      taskType: "proposal_review",
      companyId: proposal.company_id,
      mode: "rule_based_insight",
      body: `${proposal.title} has ${sections.length} customer-facing proposal section${sections.length === 1 ? "" : "s"} and ${options.length} option${options.length === 1 ? "" : "s"}. Internal notes remain private.`,
      missingInformation: missing,
      sourceRecords: [source],
      actions: [
        action("draft_proposal", "Review proposal warnings", source, proposal.company_id, "Explain warnings before any proposal field is changed."),
      ],
      customerFacingSafe: true,
      requiresApproval: true,
    };
  });
}

function buildInspectionAssistant(snapshot: CrmSnapshot): AiAssistantDraft[] {
  return snapshot.inspections.slice(0, 6).map((inspection) => {
    const source = inspectionSource(inspection);
    const missing = [
      !inspection.findings.length ? "findings" : null,
      !inspection.measurements.length ? "measurements" : null,
      !inspection.photo_ids.length ? "photos" : null,
      !inspection.report_document_id ? "report document" : null,
    ].filter((value): value is string => Boolean(value));

    return {
      id: `inspection-analysis-${inspection.id}`,
      title: `${inspection.title} inspection analysis`,
      taskType: "inspection_analysis",
      companyId: inspection.company_id,
      mode: "rule_based_insight",
      body:
        "Inspection assistant can summarize notes, group findings, flag missing photos or measurements, and prepare estimate/report handoff. Image analysis is not configured, so no visual defect is claimed.",
      missingInformation: missing,
      sourceRecords: [source],
      actions: [
        action("prepare_inspection_report", "Analyze inspection", source, inspection.company_id, "Review notes, findings, photos, and report readiness before drafting customer-facing content."),
      ],
      customerFacingSafe: false,
      requiresApproval: true,
    };
  });
}

function buildSalesAssistant(snapshot: CrmSnapshot, priorityItems: AiPriorityItem[]) {
  return buildAnalysisDrafts(
    "sales_analysis",
    "Sales next-best actions",
    priorityItems.filter((item) => item.category === "sales"),
    "Lead summaries, proposal follow-up recommendations, close-probability reasoning, and stale-opportunity alerts use visible lead, estimate, and proposal records.",
  );
}

function buildOperationsAssistant(snapshot: CrmSnapshot, priorityItems: AiPriorityItem[]) {
  return buildAnalysisDrafts(
    "operations_analysis",
    "Operations risk review",
    priorityItems.filter((item) => item.category === "production" || item.category === "inspection"),
    "Schedule, crew, inspection, material, and production risk recommendations are proposed only; WeatherTech OS will not reschedule or assign crews automatically.",
  );
}

function buildFinancialAssistant(
  snapshot: CrmSnapshot,
  priorityItems: AiPriorityItem[],
  role: AiBuildOptions["userRole"],
) {
  const financialItems = priorityItems.filter((item) => item.category === "financial");
  const canSeeProfitability = role === "owner" || role === "admin";

  return buildAnalysisDrafts(
    "financial_analysis",
    canSeeProfitability ? "Financial intelligence" : "Financial collection summary",
    financialItems,
    canSeeProfitability
      ? "Outstanding invoices, unpaid deposits, revenue, and profitability signals are visible for authorized owners/admins when records exist."
      : "Outstanding invoices, unpaid deposits, and collection risk are visible. Internal profitability details stay restricted unless owner/admin access is confirmed.",
  );
}

function buildCommunicationsAssistant(snapshot: CrmSnapshot): AiAssistantDraft[] {
  const communicationSources = [
    ...snapshot.emailMessages.slice(0, 2).map((email) =>
      source("email_messages", email.id, email.subject, email.company_id, "Inbox"),
    ),
    ...snapshot.smsMessages.slice(0, 2).map((sms) =>
      source("sms_messages", sms.id, sanitizeBusinessText(sms.body).slice(0, 48) || "SMS", sms.company_id, "Inbox"),
    ),
    ...snapshot.callRecords.slice(0, 2).map((call) => callSource(call)),
  ];

  return [
    {
      id: "communication-drafts",
      title: "Communication draft safety",
      taskType: "communication_draft",
      companyId: null,
      mode: "provider_disabled",
      body:
        "AI can prepare appointment confirmations, proposal follow-ups, deposit reminders, invoice reminders, project updates, delay notices, warranty explanations, and review responses as drafts only. No email or SMS is sent from AI Tools.",
      missingInformation: communicationSources.length ? [] : ["recent communication context"],
      sourceRecords: communicationSources,
      actions: communicationSources.slice(0, 1).map((record) =>
        action("draft_email", "Draft follow-up", record, record.companyId, "Review the message in Communications before any send action."),
      ),
      customerFacingSafe: true,
      requiresApproval: true,
    },
  ];
}

function buildMarketingAssistant(snapshot: CrmSnapshot): AiAssistantDraft[] {
  const websiteLeads = snapshot.leadIntakeRecords.filter((record) => record.provider === "website");
  const yelpLeads = snapshot.leadIntakeRecords.filter((record) => record.provider === "yelp");
  const sourceRecords = [...websiteLeads.slice(0, 2), ...yelpLeads.slice(0, 2)].map((record) =>
    source("lead_intake_records", record.id, `${record.provider} ${record.contact_name}`, record.company_id, "Website & Marketing"),
  );

  return [
    {
      id: "marketing-intelligence",
      title: "Marketing source intelligence",
      taskType: "marketing_analysis",
      companyId: null,
      mode: "rule_based_insight",
      body: `Visible intake includes ${websiteLeads.length} website lead${websiteLeads.length === 1 ? "" : "s"} and ${yelpLeads.length} Yelp lead${yelpLeads.length === 1 ? "" : "s"}. Content ideas and review replies remain draft-only.`,
      missingInformation: sourceRecords.length ? [] : ["website/Yelp/GBP source data"],
      sourceRecords,
      actions: [],
      customerFacingSafe: false,
      requiresApproval: true,
    },
  ];
}

function buildWeatherAssistant(snapshot: CrmSnapshot): AiAssistantDraft[] {
  const weatherSensitiveJobs = snapshot.jobs
    .filter((job) => ["scheduled", "in_progress"].includes(job.status))
    .filter((job) => /roof|coating|paint|foam|tile|exterior/i.test(`${job.title} ${job.scope_of_work ?? ""}`))
    .slice(0, 5);

  return [
    {
      id: "weather-intelligence",
      title: "Weather-sensitive work",
      taskType: "weather_analysis",
      companyId: null,
      mode: "rule_based_insight",
      body:
        "Weather intelligence can flag heat, wind, rain, coating-temperature, and crew-safety concerns using the Weather workspace plus scheduled job context. It does not claim certainty beyond the weather source.",
      missingInformation: weatherSensitiveJobs.length ? [] : ["scheduled weather-sensitive jobs"],
      sourceRecords: weatherSensitiveJobs.map(jobSource),
      actions: weatherSensitiveJobs.slice(0, 1).map((job) =>
        action("draft_sms", "Prepare customer delay draft", jobSource(job), job.company_id, "Draft only; do not send until approved."),
      ),
      customerFacingSafe: true,
      requiresApproval: true,
    },
  ];
}

function buildDocumentAssistant(snapshot: CrmSnapshot): AiAssistantDraft[] {
  const unsigned = snapshot.signatures.filter((signature) =>
    ["pending", "sent", "viewed"].includes(signature.status),
  );
  const requiredMissing = snapshot.documents.filter(
    (document) => document.requirement_level === "required" && document.status !== "ready" && document.status !== "signed",
  );
  const sourceRecords = [
    ...requiredMissing.slice(0, 3).map(documentSource),
    ...unsigned.slice(0, 2).map((signature) =>
      source("signatures", signature.id, `${signature.signer_name} ${signature.status}`, signature.company_id, "Documents"),
    ),
  ];

  return [
    {
      id: "document-intelligence",
      title: "Document and signature readiness",
      taskType: "document_analysis",
      companyId: null,
      mode: "rule_based_insight",
      body: `${requiredMissing.length} required document${requiredMissing.length === 1 ? "" : "s"} need review and ${unsigned.length} signature${unsigned.length === 1 ? "" : "s"} are pending/viewed. Provider signature sending remains disabled.`,
      missingInformation: sourceRecords.length ? [] : ["required document definitions or pending signatures"],
      sourceRecords,
      actions: sourceRecords.slice(0, 1).map((record) =>
        action("prepare_document_summary", "Review documents", record, record.companyId, "Open the document workflow and confirm customer-safe status."),
      ),
      customerFacingSafe: true,
      requiresApproval: true,
    },
  ];
}

function buildSavedAnalysisPreviews(
  snapshot: CrmSnapshot,
  priorityItems: AiPriorityItem[],
): AiAssistantDraft[] {
  const auditSources = snapshot.proposalAuditEvents.slice(0, 3).map(proposalAuditSource);
  return [
    {
      id: "saved-analysis-foundation",
      title: "Saved AI analyses foundation",
      taskType: "saved_analysis",
      companyId: null,
      mode: "provider_disabled",
      body:
        "Saved AI work is architecture-ready for executive briefs, customer summaries, job-risk analyses, proposal reviews, scope drafts, communication drafts, inspection summaries, and financial analyses.",
      missingInformation: ["Apply migration 0033 before persistence is available in production."],
      sourceRecords: priorityItems.slice(0, 2).map((item) => item.source).concat(auditSources),
      actions: [],
      customerFacingSafe: false,
      requiresApproval: true,
    },
  ];
}

function buildAnalysisDrafts(
  taskType: AiTaskType,
  title: string,
  items: AiPriorityItem[],
  body: string,
): AiAssistantDraft[] {
  return [
    {
      id: `${taskType}-summary`,
      title,
      taskType,
      companyId: null,
      mode: "rule_based_insight",
      body,
      missingInformation: items.length
        ? ["Live model provider not configured; recommendations are deterministic."]
        : ["No matching priority records visible in this company scope."],
      sourceRecords: items.slice(0, 5).map((item) => item.source),
      actions: items.slice(0, 3).map((item) => item.suggestedAction),
      customerFacingSafe: taskType === "communication_draft",
      requiresApproval: true,
    },
  ];
}

function buildDraftAnswer(snapshot: CrmSnapshot, normalizedPrompt: string): AiAssistantDraft {
  if (normalizedPrompt.includes("painting")) {
    return buildScopeWriterDrafts({
      ...snapshot,
      scopeTemplates: snapshot.scopeTemplates.filter((template) =>
        ["exterior_painting", "interior_painting", "cabinet_refinishing", "custom"].includes(
          template.category,
        ),
      ),
    })[0] ?? buildScopeWriterDrafts(snapshot)[0];
  }

  if (normalizedPrompt.includes("scope")) {
    return buildScopeWriterDrafts(snapshot)[0];
  }

  if (normalizedPrompt.includes("proposal") || normalizedPrompt.includes("estimate")) {
    return buildEstimateAssistantDrafts(snapshot)[0];
  }

  return buildCommunicationsAssistant(snapshot)[0];
}

function inferTaskType(normalizedPrompt: string): AiTaskType {
  if (normalizedPrompt.includes("scope")) return "scope_writer";
  if (normalizedPrompt.includes("proposal")) return "proposal_review";
  if (normalizedPrompt.includes("estimate")) return "estimate_assistant";
  if (normalizedPrompt.includes("inspection")) return "inspection_analysis";
  if (normalizedPrompt.includes("job") || normalizedPrompt.includes("crew") || normalizedPrompt.includes("production")) return "operations_analysis";
  if (normalizedPrompt.includes("invoice") || normalizedPrompt.includes("deposit") || normalizedPrompt.includes("revenue")) return "financial_analysis";
  if (normalizedPrompt.includes("email") || normalizedPrompt.includes("sms") || normalizedPrompt.includes("reply")) return "communication_draft";
  if (normalizedPrompt.includes("website") || normalizedPrompt.includes("yelp") || normalizedPrompt.includes("marketing")) return "marketing_analysis";
  if (normalizedPrompt.includes("weather")) return "weather_analysis";
  if (normalizedPrompt.includes("document") || normalizedPrompt.includes("warranty")) return "document_analysis";
  return "command";
}

function filterPriorityItemsForPrompt(
  items: AiPriorityItem[],
  normalizedPrompt: string,
): AiPriorityItem[] {
  if (normalizedPrompt.includes("overdue invoice") || normalizedPrompt.includes("unpaid")) {
    return items.filter((item) => item.category === "financial");
  }

  if (normalizedPrompt.includes("estimate") || normalizedPrompt.includes("proposal")) {
    return items.filter((item) => item.category === "sales");
  }

  if (normalizedPrompt.includes("inspection")) {
    return items.filter((item) => item.category === "inspection");
  }

  if (normalizedPrompt.includes("job") || normalizedPrompt.includes("crew") || normalizedPrompt.includes("production")) {
    return items.filter((item) => item.category === "production");
  }

  if (normalizedPrompt.includes("integration") || normalizedPrompt.includes("readiness")) {
    return items.filter((item) => item.category === "integration" || item.category === "readiness");
  }

  if (normalizedPrompt.includes("website") || normalizedPrompt.includes("yelp")) {
    return items.filter((item) =>
      item.summary.toLowerCase().includes("website") || item.summary.toLowerCase().includes("yelp"),
    );
  }

  return items;
}

function getAuthorizedAiSnapshot(snapshot: CrmSnapshot, companyId?: CompanyScopeId) {
  if (!companyId || companyId === "all") {
    return snapshot;
  }

  return scopeCrmSnapshotByCompany(snapshot, companyId);
}

function getCompanyScopeLabel(
  snapshot: CrmSnapshot,
  companyId?: CompanyScopeId,
  companyMap?: Map<string, CompanyRecord>,
) {
  if (!companyId || companyId === "all") {
    return "All authorized companies";
  }

  return companyMap?.get(companyId)?.name ??
    snapshot.companies.find((company) => company.id === companyId)?.name ??
    "Selected company";
}

function action(
  type: AiActionType,
  label: string,
  target: AiSourceRecord | null,
  companyId: string | null,
  reason: string,
): AiRecommendedAction {
  return {
    id: `action-${type}-${target?.id ?? "none"}`,
    type,
    label,
    target,
    companyId,
    reason,
    preview: "Draft-only action. Review in the existing WeatherTech OS workflow before saving or sending.",
    fieldsToChange: {},
    requiredPermission: "office",
    requiredConfirmation: true,
    providerDependency:
      type === "draft_email" || type === "draft_sms"
        ? "Customer communications provider must be configured before sending."
        : null,
    auditReference: target
      ? `${target.table}:${target.safeReference}`
      : "ai-tools:manual-preview",
    blocked:
      type === "draft_email" ||
      type === "draft_sms" ||
      type === "prepare_schedule_change" ||
      type === "prepare_invoice_draft",
  };
}

function source(
  table: string,
  id: string,
  label: string,
  companyId: string | null,
  hrefView: string,
): AiSourceRecord {
  return {
    table,
    id,
    label: sanitizeBusinessText(label).slice(0, 120) || table,
    companyId,
    safeReference: `${table}:${id.slice(0, 8)}`,
    hrefView,
  };
}

function leadSource(lead: LeadRecord) {
  return source("leads", lead.id, lead.contact_name, lead.company_id, "Leads");
}

function customerSource(customer: CustomerRecord) {
  return source("customers", customer.id, customer.display_name, customer.company_id, "Customers");
}

function estimateSource(estimate: EstimateRecord) {
  return source("estimates", estimate.id, estimate.title, estimate.company_id, "Estimates");
}

function proposalSource(proposal: EstimateProposalRevisionRecord) {
  return source(
    "estimate_proposal_revisions",
    proposal.id,
    proposal.proposal_number,
    proposal.company_id,
    "Estimates",
  );
}

function jobSource(job: JobRecord) {
  return source("jobs", job.id, job.title, job.company_id, "Jobs");
}

function inspectionSource(inspection: InspectionRecord) {
  return source("inspections", inspection.id, inspection.title, inspection.company_id, "Inspections");
}

function invoiceSource(invoice: InvoiceRecord) {
  return source("invoices", invoice.id, invoice.invoice_number, invoice.company_id, "Invoices");
}

function documentSource(document: DocumentRecord) {
  return source("documents", document.id, document.title, document.company_id, "Documents");
}

function integrationSource(log: IntegrationSyncLogRecord) {
  return source("integration_sync_logs", log.id, `${log.provider} ${log.event_type}`, log.company_id, "Settings");
}

function proposalAuditSource(event: ProposalAuditEventRecord) {
  return source("proposal_audit_events", event.id, event.summary, event.company_id, "Estimates");
}

function callSource(call: CallRecord) {
  return source(
    "call_records",
    call.id,
    call.customer_phone ?? call.from_phone ?? "Phone call",
    call.company_id,
    "Inbox",
  );
}

function scopeTemplateSource(template: ScopeTemplateRecord) {
  return source("scope_templates", template.id, template.title, template.company_id, "Scopes");
}

function syntheticScopeTemplate(
  id: string,
  title: string,
  category: ScopeCategory,
): ScopeTemplateRecord {
  const now = new Date().toISOString();
  return {
    id,
    company_id: null,
    title,
    category,
    description: "Built-in rule-based drafting fallback.",
    template_body: "Use approved WeatherTech OS scope language.",
    ai_prompt: "Draft from verified CRM data only.",
    is_active: true,
    created_at: now,
    updated_at: now,
  };
}

function scoreFromFactors({
  urgency,
  overdue,
  value,
  ageDays,
}: {
  urgency: number;
  overdue: number;
  value: number;
  ageDays: number;
}) {
  return Math.round(urgency + overdue + Math.min(value / 1000, 30) + Math.min(ageDays, 20));
}

function ageInDays(value: string | null | undefined, now: Date) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86_400_000));
}

function toDateKey(value: string) {
  return value.slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
