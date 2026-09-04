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
  MaterialOrderRecord,
  ProposalAuditEventRecord,
  ScheduleEventRecord,
  ScopeCategory,
  ScopeTemplateRecord,
  ServiceType,
} from "./types";
import { scopeCrmSnapshotByCompany, type CompanyScopeId } from "./companyScope";
import { getLeadOwnerUserId } from "./marketingAccountability";

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
export type AiRuntimeProviderHealthState = "ready" | "failed";
export type AiRuntimeProviderHealthEvidence = {
  companyId: string;
  statusRefreshSequence: number;
  state: AiRuntimeProviderHealthState;
};
export type AiDailyOperationsTopic =
  | "attention_today"
  | "uncontacted_leads"
  | "stale_leads"
  | "estimate_follow_up"
  | "approved_unscheduled_jobs"
  | "scheduled_today"
  | "scheduled_tomorrow"
  | "outstanding_invoices"
  | "customers_waiting"
  | "overdue_tasks"
  | "since_yesterday"
  | "highest_priorities";
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

export function getCurrentAiRuntimeProviderHealth({
  evidence,
  companyId,
  statusRefreshSequence,
}: {
  evidence: AiRuntimeProviderHealthEvidence | null;
  companyId: string | null;
  statusRefreshSequence: number;
}): AiRuntimeProviderHealthState | null {
  if (
    !evidence ||
    !companyId ||
    evidence.companyId !== companyId ||
    !Number.isSafeInteger(statusRefreshSequence) ||
    evidence.statusRefreshSequence !== statusRefreshSequence
  ) {
    return null;
  }

  return evidence.state === "ready" || evidence.state === "failed"
    ? evidence.state
    : null;
}

export type AiSourceRecord = {
  table: string;
  id: string;
  label: string;
  companyId: string | null;
  companyLocationId?: string | null;
  companyLocationLabel?: string | null;
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
  companyLocationId: string | null;
  companyLocationLabel: string | null;
  dailyOperationsTopics: AiDailyOperationsTopic[];
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

export type AiAdvisorModeKey =
  | "owner"
  | "roofing_operations"
  | "painting_operations"
  | "sales"
  | "office_manager"
  | "production_manager"
  | "finance"
  | "customer_success"
  | "marketing";

export type AiCommandCenterRecommendation = {
  id: string;
  priority: AiPriority;
  category:
    | "lead"
    | "estimate"
    | "job"
    | "schedule"
    | "inspection"
    | "production"
    | "financial"
    | "material"
    | "customer"
    | "integration";
  title: string;
  summary: string;
  companyId: string | null;
  companyName: string;
  customerLabel: string | null;
  jobLabel: string | null;
  employeeLabel: string | null;
  propertyLabel: string | null;
  verifiedFacts: string[];
  reasoning: string;
  assumptions: string[];
  missingInformation: string[];
  supportingRecords: AiSourceRecord[];
  supportingDocuments: AiSourceRecord[];
  suggestedNextAction: AiRecommendedAction;
  expectedBusinessImpact: string;
  confidence: number;
  filters: {
    companyId: string | null;
    customerId: string | null;
    jobId: string | null;
    employeeId: string | null;
    propertyKey: string | null;
  };
};

export type AiAdvisorMode = {
  key: AiAdvisorModeKey;
  label: string;
  description: string;
  focus: string;
  recommendationCount: number;
  averageConfidence: number;
  topRecommendationId: string | null;
};

export type AiCommandCenterDashboard = {
  generatedAt: string;
  morningBriefing: string;
  healthScore: number;
  confidenceAverage: number;
  highestPriorityLeads: AiCommandCenterRecommendation[];
  estimatesNeedingFollowUp: AiCommandCenterRecommendation[];
  jobsRequiringAttention: AiCommandCenterRecommendation[];
  schedulingConflicts: AiCommandCenterRecommendation[];
  inspectionGaps: AiCommandCenterRecommendation[];
  productionBottlenecks: AiCommandCenterRecommendation[];
  invoicePaymentIssues: AiCommandCenterRecommendation[];
  materialShortages: AiCommandCenterRecommendation[];
  revenueOpportunities: AiCommandCenterRecommendation[];
  recommendations: AiCommandCenterRecommendation[];
  advisorModes: AiAdvisorMode[];
  filterOptions: {
    companies: Array<{ id: string; label: string }>;
    customers: Array<{ id: string; label: string }>;
    jobs: Array<{ id: string; label: string }>;
    employees: Array<{ id: string; label: string }>;
    properties: Array<{ id: string; label: string }>;
  };
};

export type AiWorkspaceModel = {
  generatedAt: string;
  companyScopeLabel: string;
  provider: AiProviderReadiness;
  commandCenter: AiCommandCenterDashboard;
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
  label: "Company-scoped AI status required",
  status: "configuration_required",
  summary:
    "Select one authorized company to load its live provider status and monthly budget from the server. Local previews remain deterministic and read-only.",
  productionDisabled: true,
  requiredOwnerSetup: [
    "Select one authorized company before running audited live AI.",
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
  const commandCenter = buildAiCommandCenterDashboard(authorizedSnapshot, priorityItems, {
    ...options,
    now,
  });
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
    commandCenter,
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
  const dailyOperationsTopics = dailyOperationsTopicsForPrompt(normalizedPrompt);
  const matchedItems = selectAiPriorityItemsForPrompt(priorityItems, normalizedPrompt);
  const supportingRecords = matchedItems.map((item) => item.source).slice(0, 8);
  const responseActions = matchedItems
    .map((item) => item.suggestedAction)
    .filter(
      (candidate) =>
        dailyOperationsTopics.length === 0 ||
        candidate.type === "open_record" ||
        candidate.type === "create_follow_up_draft",
    )
    .slice(0, 4);

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
          .map(
            (item, index) =>
              `${index + 1}. ${item.title}${item.companyLocationLabel ? ` [${item.companyLocationLabel}]` : ""}: ${item.reason}`,
          ),
      ].join("\n")
    : dailyOperationsTopics.length
      ? "No matching Daily Operations records are visible in the authorized company scope."
      : "No matching records are visible in the authorized WeatherTech OS snapshot. This is a read-only rule-based response, not a live AI-provider answer.";

  const isDailyOperationsAnswer = dailyOperationsTopics.length > 0;

  return {
    id: `ai-response-${Date.now()}`,
    taskType,
    mode: "rule_based_insight",
    prompt: cleanPrompt,
    answer,
    supportingRecords,
    completeness: isDailyOperationsAnswer
      ? "complete"
      : matchedItems.length
        ? "partial"
        : "insufficient",
    missingInformation: isDailyOperationsAnswer
      ? []
      : matchedItems.length
        ? ["This fallback response uses deterministic OS rules only; run an audited exact-company command for live AI."]
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
  const today = toBusinessDateKey(now);
  const tomorrow = toBusinessDateKey(new Date(now.getTime() + 86_400_000));
  const sinceYesterday = now.getTime() - 86_400_000;
  const items: AiPriorityItem[] = [];

  const push = (
    item: Omit<
      AiPriorityItem,
      "companyLocationId" | "companyLocationLabel" | "dailyOperationsTopics"
    > &
      Partial<
        Pick<
          AiPriorityItem,
          "companyLocationId" | "companyLocationLabel" | "dailyOperationsTopics"
        >
      >,
  ) => {
    items.push({
      ...item,
      companyLocationId:
        item.companyLocationId ?? item.source.companyLocationId ?? null,
      companyLocationLabel:
        item.companyLocationLabel ?? item.source.companyLocationLabel ?? null,
      dailyOperationsTopics: item.dailyOperationsTopics ?? [],
    });
  };

  for (const lead of authorizedSnapshot.leads) {
    const accountability = authorizedSnapshot.leadAccountability.find(
      (record) =>
        record.company_id === lead.company_id && record.lead_id === lead.id,
    );
    const openLead = lead.status !== "won" && lead.status !== "lost";
    const followUpDue = Boolean(lead.next_follow_up && lead.next_follow_up <= today);
    const uncontacted = Boolean(
      openLead &&
        !accountability?.first_response_at &&
        (lead.status === "new" || Boolean(accountability)),
    );
    const stale = openLead && ageInDays(lead.updated_at, now) >= 3;
    if (lead.status === "new" || lead.status === "contacted" || followUpDue || stale) {
      const source = leadSource(lead, authorizedSnapshot);
      const dailyOperationsTopics: AiDailyOperationsTopic[] = [
        ...(followUpDue ? (["attention_today", "customers_waiting"] as const) : []),
        ...(uncontacted ? (["uncontacted_leads"] as const) : []),
        ...(stale ? (["stale_leads"] as const) : []),
        ...((followUpDue || uncontacted || stale)
          ? (["highest_priorities"] as const)
          : []),
      ];
      push({
        id: `lead-${lead.id}`,
        priority:
          lead.priority === "urgent"
            ? "critical"
            : lead.priority === "high" || followUpDue || uncontacted
              ? "high"
              : "medium",
        score: scoreFromFactors({
          urgency: lead.priority === "urgent" ? 32 : lead.priority === "high" ? 22 : 10,
          overdue: followUpDue ? 24 : uncontacted ? 18 : stale ? 12 : 0,
          value: lead.estimated_value,
          ageDays: ageInDays(lead.created_at, now),
        }),
        title: uncontacted
          ? `${lead.contact_name} has not been contacted`
          : `${lead.contact_name} needs lead follow-up`,
        summary: `${lead.source} ${lead.service_type} lead at ${lead.property_address || "unknown address"}`,
        reason: followUpDue
          ? `Next follow-up was due ${lead.next_follow_up}.`
          : uncontacted
            ? "No first response is recorded for this open lead."
            : stale
              ? `This open lead has not been updated for ${ageInDays(lead.updated_at, now)} days.`
          : `Lead is still ${lead.status.replace("_", " ")}.`,
        category: "sales",
        companyId: lead.company_id,
        dailyOperationsTopics,
        owner: getLeadOwnerUserId(
          authorizedSnapshot.leadAccountability,
          lead.id,
          lead.company_id,
        ),
        dueAt: lead.next_follow_up,
        ageDays: ageInDays(lead.created_at, now),
        source,
        supportingFields: {
          status: lead.status,
          source: lead.source,
          estimated_value: lead.estimated_value,
          next_follow_up: lead.next_follow_up,
          first_response_at: accountability?.first_response_at ?? null,
          stale,
        },
        suggestedAction: action(
          "create_follow_up_draft",
          "Create follow-up task draft",
          source,
          lead.company_id,
          "Prepare an internal follow-up task for human review before it is created.",
        ),
      });
    }
  }

  for (const estimate of authorizedSnapshot.estimates) {
    if (estimate.status === "sent" || estimate.status === "draft") {
      const ageDays = ageInDays(estimate.updated_at, now);
      const source = estimateSource(estimate, authorizedSnapshot);
      const isStale = estimate.status === "sent" && ageDays >= 3;
      const isOverdue = Boolean(
        estimate.status === "sent" &&
          estimate.expiration_date &&
          estimate.expiration_date < today,
      );
      const needsFollowUp = isStale || isOverdue;
      push({
        id: `estimate-${estimate.id}`,
        priority: needsFollowUp ? "high" : estimate.status === "sent" ? "medium" : "low",
        score: scoreFromFactors({
          urgency: needsFollowUp ? 22 : 8,
          overdue: isOverdue ? 22 : isStale ? 16 : 0,
          value: estimate.total,
          ageDays,
        }),
        title: `${estimate.title} needs estimate attention`,
        summary: `${estimate.status} ${estimate.service_type} estimate worth ${money(estimate.total)}`,
        reason: isOverdue
          ? `Estimate expired ${estimate.expiration_date} and may need follow-up.`
          : isStale
            ? `Estimate was last updated ${ageDays} days ago and may need follow-up.`
            : `Estimate remains ${estimate.status}.`,
        category: "sales",
        companyId: estimate.company_id,
        dailyOperationsTopics: [
          ...(estimate.status === "sent" ? (["estimate_follow_up"] as const) : []),
          ...(needsFollowUp ? (["attention_today", "highest_priorities"] as const) : []),
        ],
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
        suggestedAction: action(
          estimate.status === "sent" ? "create_follow_up_draft" : "draft_proposal",
          estimate.status === "sent" ? "Create estimate follow-up task draft" : "Review estimate",
          source,
          estimate.company_id,
          estimate.status === "sent"
            ? "Prepare an internal estimate follow-up task for human review before it is created."
            : "Prepare or follow up through the existing estimate workflow.",
        ),
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
    const jobScheduleValue =
      job.scheduled_start ??
      job.scheduled_end ??
      job.start_date ??
      job.end_date;
    const hasSavedSchedule = Boolean(
      job.scheduled_start ||
        job.scheduled_end ||
        job.start_date ||
        job.end_date,
    );
    const jobScheduleDate = jobScheduleValue
      ? toBusinessDateKey(new Date(jobScheduleValue))
      : null;
    const scheduledEvent = authorizedSnapshot.scheduleEvents.find(
      (event) =>
        event.job_id === job.id &&
        event.status === "scheduled" &&
        toBusinessDateKey(new Date(event.start_at)) >= today,
    );
    const missingSchedule = !hasSavedSchedule && !scheduledEvent;
    const missingCrew =
      ["scheduled", "in_progress"].includes(job.status) &&
      !job.crew_name &&
      !authorizedSnapshot.jobAssignments.some((assignment) => assignment.job_id === job.id);
    const linkedEstimate = job.estimate_id
      ? authorizedSnapshot.estimates.find(
          (estimate) =>
            estimate.id === job.estimate_id &&
            estimate.company_id === job.company_id,
        )
      : null;
    const hasAcceptedProposal = Boolean(
      job.proposal_acceptance_id &&
        authorizedSnapshot.proposalAcceptances.some(
          (acceptance) =>
            acceptance.id === job.proposal_acceptance_id &&
            acceptance.company_id === job.company_id,
        ),
    );
    const approvedUnscheduled = Boolean(
      missingSchedule &&
        (linkedEstimate?.status === "approved" || hasAcceptedProposal),
    );
    const scheduledToday = jobScheduleDate === today;
    const scheduledTomorrow = jobScheduleDate === tomorrow;
    const operationalRisk = job.status === "blocked" || missingSchedule || missingCrew;
    if (operationalRisk || scheduledToday || scheduledTomorrow) {
      const source = jobSource(job, authorizedSnapshot);
      push({
        id: `job-${job.id}`,
        priority:
          job.status === "blocked"
            ? "critical"
            : missingCrew || approvedUnscheduled
              ? "high"
              : scheduledToday
                ? "medium"
                : "low",
        score: scoreFromFactors({
          urgency: job.status === "blocked" ? 34 : missingCrew ? 24 : 12,
          overdue: approvedUnscheduled ? 20 : missingSchedule ? 12 : 0,
          value: job.total,
          ageDays: ageInDays(job.updated_at, now),
        }),
        title: operationalRisk
          ? `${job.title} is at operational risk`
          : `${job.title} is scheduled ${scheduledToday ? "today" : "tomorrow"}`,
        summary: `${job.status.replace("_", " ")} job at ${job.property_address}`,
        reason: job.status === "blocked"
          ? "Job is marked blocked."
          : approvedUnscheduled
            ? "The linked estimate or proposal is approved, but no production schedule is saved."
            : missingCrew
              ? "Job is scheduled or active without a visible crew assignment."
              : missingSchedule
                ? "Job is awaiting production scheduling."
                : `Production starts ${jobScheduleValue}.`,
        category: "production",
        companyId: job.company_id,
        dailyOperationsTopics: [
          ...(approvedUnscheduled ? (["approved_unscheduled_jobs"] as const) : []),
          ...(scheduledToday ? (["scheduled_today"] as const) : []),
          ...(scheduledTomorrow ? (["scheduled_tomorrow"] as const) : []),
          ...(operationalRisk ? (["attention_today", "highest_priorities"] as const) : []),
        ],
        owner: job.project_manager,
        dueAt: jobScheduleValue ?? scheduledEvent?.start_at ?? null,
        ageDays: ageInDays(job.updated_at, now),
        source,
        supportingFields: {
          status: job.status,
          scheduled_start: job.scheduled_start,
          scheduled_end: job.scheduled_end,
          crew_name: job.crew_name,
          total: job.total,
          approved: linkedEstimate?.status === "approved" || hasAcceptedProposal,
          has_scheduled_event: Boolean(scheduledEvent),
        },
        suggestedAction: action(
          "open_record",
          "Open production",
          source,
          job.company_id,
          "Review schedule, crew, and production readiness without changing the job.",
        ),
      });
    }
  }

  for (const event of authorizedSnapshot.scheduleEvents) {
    if (event.status !== "scheduled") continue;
    const eventDate = toBusinessDateKey(new Date(event.start_at));
    if (eventDate !== today && eventDate !== tomorrow) continue;
    const linkedJob = event.job_id
      ? authorizedSnapshot.jobs.find(
          (job) => job.id === event.job_id && job.company_id === event.company_id,
        )
      : null;
    if (event.event_type !== "job" && !linkedJob) continue;
    const linkedJobDate =
      linkedJob?.scheduled_start ??
      linkedJob?.scheduled_end ??
      linkedJob?.start_date ??
      linkedJob?.end_date;
    if (
      linkedJobDate &&
      toBusinessDateKey(new Date(linkedJobDate)) === eventDate
    ) {
      continue;
    }
    const source = scheduleEventSource(event, authorizedSnapshot);
    const scheduledToday = eventDate === today;
    push({
      id: `schedule-event-${event.id}`,
      priority: scheduledToday ? "medium" : "low",
      score: scoreFromFactors({
        urgency: scheduledToday ? 18 : 8,
        overdue: 0,
        value: linkedJob?.total ?? 0,
        ageDays: 0,
      }),
      title: `${event.title} is scheduled ${scheduledToday ? "today" : "tomorrow"}`,
      summary: `${event.event_type.replace(/_/g, " ")} from ${event.start_at} to ${event.end_at}`,
      reason: "This active schedule event is recorded in the authorized company calendar.",
      category: "production",
      companyId: event.company_id,
      dailyOperationsTopics: [
        scheduledToday ? "scheduled_today" : "scheduled_tomorrow",
      ],
      owner: linkedJob?.project_manager ?? null,
      dueAt: event.start_at,
      ageDays: 0,
      source,
      supportingFields: {
        event_type: event.event_type,
        status: event.status,
        start_at: event.start_at,
        end_at: event.end_at,
      },
      suggestedAction: action(
        "open_record",
        "Open calendar",
        source,
        event.company_id,
        "Review the saved schedule event without changing it.",
      ),
    });
  }

  for (const order of authorizedSnapshot.materialOrders) {
    if (["draft", "ordered", "partial"].includes(order.status)) {
      const source = materialOrderSource(order);
      push({
        id: `material-order-${order.id}`,
        priority: order.status === "partial" ? "high" : "medium",
        score: scoreFromFactors({
          urgency: order.status === "partial" ? 22 : 14,
          overdue: order.expected_delivery_date && order.expected_delivery_date < today ? 14 : 0,
          value: order.total,
          ageDays: ageInDays(order.updated_at, now),
        }),
        title: `${order.supplier_name} material order needs readiness review`,
        summary: `${order.status.replace("_", " ")} material order worth ${money(order.total)}`,
        reason:
          order.expected_delivery_date && order.expected_delivery_date < today
            ? `Expected delivery date was ${order.expected_delivery_date}.`
            : "Material readiness should be confirmed before production continues.",
        category: "production",
        companyId: order.company_id,
        owner: null,
        dueAt: order.expected_delivery_date,
        ageDays: ageInDays(order.updated_at, now),
        source,
        supportingFields: {
          status: order.status,
          supplier_name: order.supplier_name,
          expected_delivery_date: order.expected_delivery_date,
          total: order.total,
        },
        suggestedAction: action("open_record", "Open materials", source, order.company_id, "Confirm material status through the existing Materials workflow."),
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
    if (
      invoice.balance_due > 0 &&
      (invoice.status === "overdue" || invoice.status === "sent")
    ) {
      const source = invoiceSource(invoice, authorizedSnapshot);
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
        dailyOperationsTopics: [
          "outstanding_invoices",
          ...(overdue ? (["attention_today", "highest_priorities"] as const) : []),
        ],
        owner: null,
        dueAt: invoice.due_date,
        ageDays: ageInDays(invoice.updated_at, now),
        source,
        supportingFields: {
          status: invoice.status,
          balance_due: invoice.balance_due,
          due_date: invoice.due_date,
        },
        suggestedAction: action(
          "open_record",
          "Open invoice",
          source,
          invoice.company_id,
          "Review the outstanding balance without sending a customer message.",
        ),
      });
    }
  }

  for (const task of authorizedSnapshot.officeTasks ?? []) {
    if (task.status === "completed") continue;
    const effectiveDueAt =
      task.status === "snoozed" && task.snoozed_until
        ? task.snoozed_until
        : task.due_at;
    const dueTimestamp = new Date(effectiveDueAt).getTime();
    const dueDate = toBusinessDateKey(new Date(effectiveDueAt));
    const overdue = Number.isFinite(dueTimestamp) && dueTimestamp < now.getTime();
    const dueToday = dueDate === today;
    if (!overdue && !dueToday) continue;
    const source = officeTaskSource(task, authorizedSnapshot);
    push({
      id: `office-task-${task.id}`,
      priority:
        task.priority === "urgent"
          ? "critical"
          : task.priority === "high" || overdue
            ? "high"
            : "medium",
      score: scoreFromFactors({
        urgency: task.priority === "urgent" ? 34 : task.priority === "high" ? 24 : 12,
        overdue: overdue ? 24 : 0,
        value: 0,
        ageDays: ageInDays(task.created_at, now),
      }),
      title: `${overdue ? "Overdue task" : "Task due today"}: ${task.title}`,
      summary: `${task.source_type.replace(/_/g, " ")} office task`,
      reason: overdue
        ? `The active task was due ${effectiveDueAt}.`
        : `The active task is due today at ${effectiveDueAt}.`,
      category: "readiness",
      companyId: task.company_id,
      dailyOperationsTopics: [
        "attention_today",
        "highest_priorities",
        ...(overdue ? (["overdue_tasks"] as const) : []),
      ],
      owner: task.assigned_employee_id,
      dueAt: effectiveDueAt,
      ageDays: ageInDays(task.created_at, now),
      source,
      supportingFields: {
        status: task.status,
        priority: task.priority,
        due_at: task.due_at,
        snoozed_until: task.snoozed_until,
        source_type: task.source_type,
      },
      suggestedAction: action(
        "open_record",
        "Open Daily Ops",
        source,
        task.company_id,
        "Review the internal task without completing or changing it.",
      ),
    });
  }

  for (const email of authorizedSnapshot.emailMessages) {
    const receivedAt = email.received_at ?? email.created_at;
    if (
      email.direction !== "inbound" ||
      hasLaterOutboundEmail(authorizedSnapshot, email, receivedAt)
    ) {
      continue;
    }
    const source = emailMessageSource(email, authorizedSnapshot);
    const linkedLead = email.lead_id
      ? authorizedSnapshot.leads.find(
          (lead) => lead.id === email.lead_id && lead.company_id === email.company_id,
        )
      : null;
    const actionTarget = linkedLead
      ? leadSource(linkedLead, authorizedSnapshot)
      : source;
    push({
      id: `customer-waiting-email-${email.id}`,
      priority: "high",
      score: scoreFromFactors({
        urgency: 22,
        overdue: ageInDays(receivedAt, now) >= 1 ? 12 : 4,
        value: 0,
        ageDays: ageInDays(receivedAt, now),
      }),
      title: `${email.subject || "Inbound email"} is waiting for review`,
      summary: "Inbound customer email with no later outbound reply in the same grounded context",
      reason: `The latest matched inbound email was received ${receivedAt}.`,
      category: "customer",
      companyId: email.company_id,
      dailyOperationsTopics: [
        "customers_waiting",
        "attention_today",
        "highest_priorities",
      ],
      owner: null,
      dueAt: receivedAt,
      ageDays: ageInDays(receivedAt, now),
      source,
      supportingFields: {
        direction: email.direction,
        status: email.status,
        received_at: receivedAt,
        has_later_outbound_reply: false,
      },
      suggestedAction: action(
        linkedLead ? "create_follow_up_draft" : "open_record",
        linkedLead ? "Create follow-up task draft" : "Open inbox",
        actionTarget,
        email.company_id,
        linkedLead
          ? "Prepare one internal follow-up task for human review."
          : "Review the inbound email without sending a reply.",
      ),
    });
  }

  for (const sms of authorizedSnapshot.smsMessages) {
    const receivedAt = sms.created_at;
    if (
      sms.direction !== "inbound" ||
      hasLaterOutboundSms(authorizedSnapshot, sms, receivedAt)
    ) {
      continue;
    }
    const source = smsMessageSource(sms, authorizedSnapshot);
    const linkedLead = sms.lead_id
      ? authorizedSnapshot.leads.find(
          (lead) => lead.id === sms.lead_id && lead.company_id === sms.company_id,
        )
      : null;
    const actionTarget = linkedLead
      ? leadSource(linkedLead, authorizedSnapshot)
      : source;
    push({
      id: `customer-waiting-sms-${sms.id}`,
      priority: "high",
      score: scoreFromFactors({
        urgency: 22,
        overdue: ageInDays(receivedAt, now) >= 1 ? 12 : 4,
        value: 0,
        ageDays: ageInDays(receivedAt, now),
      }),
      title: "Inbound SMS is waiting for review",
      summary: "Inbound customer SMS with no later outbound reply in the same grounded context",
      reason: `The latest matched inbound SMS was received ${receivedAt}.`,
      category: "customer",
      companyId: sms.company_id,
      dailyOperationsTopics: [
        "customers_waiting",
        "attention_today",
        "highest_priorities",
      ],
      owner: null,
      dueAt: receivedAt,
      ageDays: ageInDays(receivedAt, now),
      source,
      supportingFields: {
        direction: sms.direction,
        status: sms.status,
        received_at: receivedAt,
        has_later_outbound_reply: false,
      },
      suggestedAction: action(
        linkedLead ? "create_follow_up_draft" : "open_record",
        linkedLead ? "Create follow-up task draft" : "Open inbox",
        actionTarget,
        sms.company_id,
        linkedLead
          ? "Prepare one internal follow-up task for human review."
          : "Review the inbound SMS without sending a reply.",
      ),
    });
  }

  for (const call of authorizedSnapshot.callRecords) {
    const occurredAt = call.ended_at ?? call.started_at ?? call.created_at;
    const needsAttention =
      call.direction === "inbound" &&
      (call.follow_up_required ||
        ["missed", "busy", "failed", "voicemail"].includes(call.call_status));
    const companyId = resolveCommunicationCompanyId(authorizedSnapshot, call);
    if (
      !needsAttention ||
      !companyId
    ) {
      continue;
    }
    const source = callSource(call, authorizedSnapshot, companyId);
    const linkedLead = call.lead_id
      ? authorizedSnapshot.leads.find(
          (lead) => lead.id === call.lead_id && lead.company_id === companyId,
        )
      : null;
    const actionTarget = linkedLead
      ? leadSource(linkedLead, authorizedSnapshot)
      : source;
    push({
      id: `customer-waiting-call-${call.id}`,
      priority: call.call_status === "missed" ? "critical" : "high",
      score: scoreFromFactors({
        urgency: call.call_status === "missed" ? 32 : 22,
        overdue: call.follow_up_required ? 14 : 8,
        value: 0,
        ageDays: ageInDays(occurredAt, now),
      }),
      title: `${call.call_status.replace(/_/g, " ")} call needs follow-up`,
      summary: "Inbound phone activity marked for internal attention",
      reason: call.follow_up_required
        ? "The call record explicitly requires follow-up."
        : `The call status is ${call.call_status.replace(/_/g, " ")}.`,
      category: "customer",
      companyId,
      dailyOperationsTopics: [
        "customers_waiting",
        "attention_today",
        "highest_priorities",
      ],
      owner: null,
      dueAt: occurredAt,
      ageDays: ageInDays(occurredAt, now),
      source,
      supportingFields: {
        call_status: call.call_status,
        follow_up_required: call.follow_up_required,
        occurred_at: occurredAt,
      },
      suggestedAction: action(
        linkedLead ? "create_follow_up_draft" : "open_record",
        linkedLead ? "Create follow-up task draft" : "Open call record",
        actionTarget,
        companyId,
        linkedLead
          ? "Prepare one internal follow-up task for human review."
          : "Review the call record without placing a call.",
      ),
    });
  }

  for (const event of authorizedSnapshot.communicationProviderEvents) {
    const companyId = resolveCommunicationCompanyId(authorizedSnapshot, event);
    const needsAttention =
      event.direction === "inbound" &&
      (event.channel === "sms" ||
        ["missed", "busy", "failed", "voicemail", "no-answer"].includes(
          event.status.toLowerCase(),
        ));
    if (
      !needsAttention ||
      !companyId ||
      (event.sms_message_id &&
        authorizedSnapshot.smsMessages.some(
          (sms) => sms.id === event.sms_message_id && sms.company_id === companyId,
        )) ||
      authorizedSnapshot.callRecords.some(
        (call) => call.correlation_id === event.correlation_id,
      ) ||
      hasLaterOutboundProviderEvent(authorizedSnapshot, event)
    ) {
      continue;
    }
    const source = communicationProviderEventSource(
      event,
      authorizedSnapshot,
      companyId,
    );
    const linkedLead = event.lead_id
      ? authorizedSnapshot.leads.find(
          (lead) => lead.id === event.lead_id && lead.company_id === companyId,
        )
      : null;
    const actionTarget = linkedLead
      ? leadSource(linkedLead, authorizedSnapshot)
      : source;
    push({
      id: `customer-waiting-provider-event-${event.id}`,
      priority: event.channel === "voice" ? "critical" : "high",
      score: scoreFromFactors({
        urgency: event.channel === "voice" ? 30 : 22,
        overdue: ageInDays(event.occurred_at, now) >= 1 ? 12 : 4,
        value: 0,
        ageDays: ageInDays(event.occurred_at, now),
      }),
      title: `${event.channel.toUpperCase()} inbound activity is waiting for review`,
      summary: `${event.provider} ${event.event_type.replace(/_/g, " ")} routed ${event.routing_status.replace(/_/g, " ")}`,
      reason: `No later outbound provider event is recorded in the same linked context after ${event.occurred_at}.`,
      category: "customer",
      companyId,
      dailyOperationsTopics: [
        "customers_waiting",
        "attention_today",
        "highest_priorities",
      ],
      owner: null,
      dueAt: event.occurred_at,
      ageDays: ageInDays(event.occurred_at, now),
      source,
      supportingFields: {
        channel: event.channel,
        direction: event.direction,
        status: event.status,
        routing_status: event.routing_status,
        occurred_at: event.occurred_at,
        has_later_outbound_event: false,
      },
      suggestedAction: action(
        linkedLead ? "create_follow_up_draft" : "open_record",
        linkedLead ? "Create follow-up task draft" : "Open inbox",
        actionTarget,
        companyId,
        linkedLead
          ? "Prepare one internal follow-up task for human review."
          : "Review the inbound provider event without sending or calling.",
      ),
    });
  }

  const recentAutomationEvents = [...(authorizedSnapshot.automationEvents ?? [])]
    .filter((event) => new Date(event.occurred_at).getTime() >= sinceYesterday)
    .sort(
      (left, right) =>
        new Date(right.occurred_at).getTime() -
        new Date(left.occurred_at).getTime(),
    )
    .slice(0, 15);

  for (const event of recentAutomationEvents) {
    const source = automationEventSource(event, authorizedSnapshot);
    push({
      id: `recent-automation-event-${event.id}`,
      priority: "low",
      score: 8,
      title: `${event.event_type.replace(/\./g, " ")} was recorded`,
      summary: `${event.source_table} activity at ${event.occurred_at}`,
      reason: "This immutable automation event occurred within the previous 24 hours.",
      category: "readiness",
      companyId: event.company_id,
      dailyOperationsTopics: ["since_yesterday"],
      owner: event.actor_user_id,
      dueAt: event.occurred_at,
      ageDays: 0,
      source,
      supportingFields: {
        event_type: event.event_type,
        source_table: event.source_table,
        occurred_at: event.occurred_at,
      },
      suggestedAction: action(
        "open_record",
        "Review automation activity",
        source,
        event.company_id,
        "Review the recorded internal activity without replaying it.",
      ),
    });
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

  return items.sort((left, right) => right.score - left.score).slice(0, 100);
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
      "This is a deterministic executive preview grounded in visible CRM records. Use the audited command bar with one exact company for a live AI response.",
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

const aiAdvisorModeDefinitions: Array<{
  key: AiAdvisorModeKey;
  label: string;
  description: string;
  focus: string;
}> = [
  {
    key: "owner",
    label: "Owner",
    description: "Prioritizes cash, customer risk, production risk, and next owner decisions.",
    focus: "Business-wide action",
  },
  {
    key: "roofing_operations",
    label: "Roofing Operations",
    description: "Highlights roof inspections, replacements, repairs, crews, materials, and weather-sensitive work.",
    focus: "Roofing execution",
  },
  {
    key: "painting_operations",
    label: "Painting Operations",
    description: "Highlights IHC painting leads, estimates, production handoffs, color readiness, and walkthroughs.",
    focus: "Painting execution",
  },
  {
    key: "sales",
    label: "Sales",
    description: "Prioritizes new leads, stale estimates, proposals, and revenue conversion opportunities.",
    focus: "Pipeline movement",
  },
  {
    key: "office_manager",
    label: "Office Manager",
    description: "Focuses on follow-ups, missing data, customer waiting time, documents, and inbox risk.",
    focus: "Office throughput",
  },
  {
    key: "production_manager",
    label: "Production Manager",
    description: "Focuses on jobs, crews, scheduling, blockers, inspection handoffs, and material readiness.",
    focus: "Production control",
  },
  {
    key: "finance",
    label: "Finance",
    description: "Focuses on unpaid invoices, deposits, collections, and revenue needing action.",
    focus: "Cash collection",
  },
  {
    key: "customer_success",
    label: "Customer Success",
    description: "Focuses on response obligations, warranty callbacks, documents, and clear next steps.",
    focus: "Customer trust",
  },
  {
    key: "marketing",
    label: "Marketing",
    description: "Focuses on lead sources, website/Yelp/GBP intake, campaign attribution, and follow-up health.",
    focus: "Demand capture",
  },
];

function buildAiCommandCenterDashboard(
  snapshot: CrmSnapshot,
  priorityItems: AiPriorityItem[],
  options: AiBuildOptions & { now: string },
): AiCommandCenterDashboard {
  const recommendations = priorityItems
    .map((item) => buildCommandCenterRecommendation(item, snapshot, options))
    .sort(sortCommandCenterRecommendations);
  const criticalCount = recommendations.filter((item) => item.priority === "critical").length;
  const highCount = recommendations.filter((item) => item.priority === "high").length;
  const revenueAtRisk = priorityItems
    .filter((item) => {
      const category = inferCommandCenterCategory(item);
      return category === "estimate" || category === "financial";
    })
    .reduce((total, item) => total + numericImpactFromSupportingFields(item), 0);
  const confidenceAverage = recommendations.length
    ? Math.round(
        recommendations.reduce((total, item) => total + item.confidence, 0) /
          recommendations.length,
      )
    : 100;
  const healthScore = clampNumber(
    100 - criticalCount * 18 - highCount * 9 - Math.max(0, recommendations.length - 8) * 2,
    1,
    100,
  );

  return {
    generatedAt: options.now,
    morningBriefing: recommendations.length
      ? `${criticalCount} critical and ${highCount} high-priority item${criticalCount + highCount === 1 ? "" : "s"} need review. ${money(revenueAtRisk)} is attached to estimates, proposals, invoices, or deposits that need action.`
      : "No urgent AI recommendations were found in the current authorized WeatherTech OS snapshot.",
    healthScore,
    confidenceAverage,
    highestPriorityLeads: recommendations
      .filter((item) => item.category === "lead")
      .slice(0, 5),
    estimatesNeedingFollowUp: recommendations
      .filter((item) => item.category === "estimate")
      .slice(0, 5),
    jobsRequiringAttention: recommendations
      .filter((item) => item.category === "job" || item.category === "production")
      .slice(0, 5),
    schedulingConflicts: recommendations
      .filter((item) => item.category === "schedule")
      .slice(0, 5),
    inspectionGaps: recommendations
      .filter((item) => item.category === "inspection")
      .slice(0, 5),
    productionBottlenecks: recommendations
      .filter((item) => item.category === "production" || item.category === "material")
      .slice(0, 5),
    invoicePaymentIssues: recommendations
      .filter((item) => item.category === "financial")
      .slice(0, 5),
    materialShortages: recommendations
      .filter((item) => item.category === "material")
      .slice(0, 5),
    revenueOpportunities: recommendations
      .filter((item) => item.category === "lead" || item.category === "estimate" || item.category === "financial")
      .slice(0, 5),
    recommendations,
    advisorModes: aiAdvisorModeDefinitions.map((advisor) => {
      const advisorRecommendations = recommendations.filter((recommendation) =>
        advisorMatchesRecommendation(advisor.key, recommendation),
      );

      return {
        ...advisor,
        recommendationCount: advisorRecommendations.length,
        averageConfidence: advisorRecommendations.length
          ? Math.round(
              advisorRecommendations.reduce((total, item) => total + item.confidence, 0) /
                advisorRecommendations.length,
            )
          : confidenceAverage,
        topRecommendationId: advisorRecommendations[0]?.id ?? null,
      };
    }),
    filterOptions: buildCommandCenterFilterOptions(snapshot, recommendations),
  };
}

function buildCommandCenterRecommendation(
  item: AiPriorityItem,
  snapshot: CrmSnapshot,
  options: AiBuildOptions,
): AiCommandCenterRecommendation {
  const category = inferCommandCenterCategory(item);
  const companyName = companyNameFor(item.companyId, snapshot, options.companyMap);
  const customer = findRecommendationCustomer(snapshot, item);
  const job = findRecommendationJob(snapshot, item);
  const employee = findRecommendationEmployee(snapshot, item);
  const propertyLabel = findRecommendationPropertyLabel(snapshot, item, customer, job);
  const supportingRecords = uniqueSources([
    item.source,
    customer ? customerSource(customer) : null,
    job ? jobSource(job) : null,
  ]);
  const supportingDocuments = findSupportingDocuments(snapshot, item, customer, job).map(documentSource);
  const missingInformation = missingInformationForRecommendation(item, category, customer, job);
  const verifiedFacts = verifiedFactsForRecommendation(item, companyName, propertyLabel);

  return {
    id: `ai-command-center-${item.id}`,
    priority: item.priority,
    category,
    title: item.title,
    summary: item.summary,
    companyId: item.companyId,
    companyName,
    customerLabel: customer?.display_name ?? null,
    jobLabel: job?.title ?? null,
    employeeLabel: employee?.full_name ?? item.owner,
    propertyLabel,
    verifiedFacts,
    reasoning: reasoningForRecommendation(item, category),
    assumptions: ["No unverified customer, pricing, measurement, warranty, schedule, or payment facts were inferred."],
    missingInformation,
    supportingRecords,
    supportingDocuments,
    suggestedNextAction: item.suggestedAction,
    expectedBusinessImpact: expectedImpactForRecommendation(item, category),
    confidence: confidenceForRecommendation(item, missingInformation, supportingRecords, supportingDocuments),
    filters: {
      companyId: item.companyId,
      customerId: customer?.id ?? null,
      jobId: job?.id ?? null,
      employeeId: employee?.id ?? item.owner,
      propertyKey: propertyLabel,
    },
  };
}

function inferCommandCenterCategory(item: AiPriorityItem): AiCommandCenterRecommendation["category"] {
  if (item.source.table === "leads") return "lead";
  if (item.source.table === "estimates" || item.source.table === "estimate_proposal_revisions") return "estimate";
  if (item.source.table === "inspections") return "inspection";
  if (item.source.table === "invoices") return "financial";
  if (item.source.table === "material_orders") return "material";
  if (item.source.table === "integration_sync_logs") return "integration";
  if (item.source.table === "jobs") {
    const searchable = `${item.title} ${item.summary} ${item.reason}`.toLowerCase();
    if (searchable.includes("crew") || searchable.includes("schedul")) return "schedule";
    return item.reason.toLowerCase().includes("blocked") ? "production" : "job";
  }

  return item.category === "customer" ? "customer" : "production";
}

function sortCommandCenterRecommendations(
  left: AiCommandCenterRecommendation,
  right: AiCommandCenterRecommendation,
) {
  const priorityRank: Record<AiPriority, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  const priorityDelta = priorityRank[right.priority] - priorityRank[left.priority];
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  return right.confidence - left.confidence;
}

function advisorMatchesRecommendation(
  advisor: AiAdvisorModeKey,
  recommendation: AiCommandCenterRecommendation,
) {
  const searchable = [
    recommendation.title,
    recommendation.summary,
    recommendation.companyName,
    recommendation.propertyLabel,
    recommendation.reasoning,
  ]
    .join(" ")
    .toLowerCase();

  if (advisor === "owner") return true;
  if (advisor === "sales") return recommendation.category === "lead" || recommendation.category === "estimate";
  if (advisor === "office_manager") {
    return ["lead", "estimate", "inspection", "financial", "integration", "customer"].includes(
      recommendation.category,
    );
  }
  if (advisor === "production_manager") {
    return ["job", "schedule", "inspection", "production", "material"].includes(
      recommendation.category,
    );
  }
  if (advisor === "finance") return recommendation.category === "financial";
  if (advisor === "customer_success") {
    return ["customer", "financial", "inspection", "integration"].includes(recommendation.category);
  }
  if (advisor === "marketing") {
    return recommendation.category === "lead" || /website|yelp|google business|gbp|campaign/.test(searchable);
  }
  if (advisor === "roofing_operations") {
    return /weathertech|roof|tile|foam|leak|shingle|inspection|warranty|material/.test(searchable);
  }

  return /ihc|paint|painting|color|hoa|cabinet|stucco|drywall/.test(searchable);
}

function buildCommandCenterFilterOptions(
  snapshot: CrmSnapshot,
  recommendations: AiCommandCenterRecommendation[],
): AiCommandCenterDashboard["filterOptions"] {
  const recommendationCompanyIds = new Set(
    recommendations.map((recommendation) => recommendation.companyId).filter(Boolean) as string[],
  );
  const companies = snapshot.companies
    .filter((company) => recommendationCompanyIds.size === 0 || recommendationCompanyIds.has(company.id))
    .map((company) => ({ id: company.id, label: company.name }));
  const customers = snapshot.customers.map((customer) => ({
    id: customer.id,
    label: customer.display_name,
  }));
  const jobs = snapshot.jobs.map((job) => ({ id: job.id, label: job.title }));
  const employees = snapshot.employees.map((employee) => ({
    id: employee.id,
    label: employee.full_name,
  }));
  const propertyLabels = new Map<string, string>();

  for (const property of snapshot.properties) {
    propertyLabels.set(property.id, `${property.display_name} - ${property.address}`);
  }

  for (const recommendation of recommendations) {
    if (recommendation.propertyLabel) {
      propertyLabels.set(recommendation.propertyLabel, recommendation.propertyLabel);
    }
  }

  return {
    companies,
    customers,
    jobs,
    employees,
    properties: Array.from(propertyLabels.entries()).map(([id, label]) => ({ id, label })),
  };
}

function verifiedFactsForRecommendation(
  item: AiPriorityItem,
  companyName: string,
  propertyLabel: string | null,
) {
  const facts = [
    `Company: ${companyName}`,
    `Source record: ${item.source.safeReference}`,
    `Current workflow stage: ${String(item.supportingFields.status ?? item.category).replace(/_/g, " ")}`,
    `Priority: ${item.priority}`,
  ];

  if (item.dueAt) {
    facts.push(`Due or scheduled: ${item.dueAt}`);
  }

  if (item.ageDays > 0) {
    facts.push(`Age: ${item.ageDays} day${item.ageDays === 1 ? "" : "s"}`);
  }

  const value = numericImpactFromSupportingFields(item);
  if (value > 0) {
    facts.push(`Visible value: ${money(value)}`);
  }

  if (propertyLabel) {
    facts.push(`Property: ${propertyLabel}`);
  }

  return facts;
}

function reasoningForRecommendation(
  item: AiPriorityItem,
  category: AiCommandCenterRecommendation["category"],
) {
  const prefix =
    category === "financial"
      ? "Cash movement is time-sensitive."
      : category === "lead" || category === "estimate"
      ? "Sales momentum decays when follow-up is delayed."
      : category === "job" || category === "schedule" || category === "production"
      ? "Production risk can create customer, crew, and margin problems."
      : category === "inspection"
      ? "Inspection gaps block estimate or production handoff."
      : category === "material"
      ? "Material uncertainty can delay crews and revenue."
      : "This item affects operational trust or readiness.";

  return `${prefix} ${item.reason}`;
}

function missingInformationForRecommendation(
  item: AiPriorityItem,
  category: AiCommandCenterRecommendation["category"],
  customer: CustomerRecord | null,
  job: JobRecord | null,
) {
  const missing = new Set<string>();

  if (!customer) missing.add("confirmed customer link");
  if (!item.owner) missing.add("assigned owner");
  if (!item.dueAt) missing.add("confirmed due date or scheduled time");
  if (category === "lead") missing.add("qualification decision and next contact outcome");
  if (category === "estimate") missing.add("customer approval or signature outcome");
  if (category === "job" || category === "schedule" || category === "production") {
    if (!job?.crew_name) missing.add("confirmed crew assignment");
    if (!job?.scheduled_start && !job?.start_date) missing.add("confirmed production schedule");
    missing.add("material, document, and customer-readiness confirmation");
  }
  if (category === "inspection") missing.add("completed findings, measurements, photos, and report status");
  if (category === "financial") missing.add("verified customer payment intent and approved collection message");
  if (category === "material") missing.add("confirmed delivery status and production dependency");
  if (category === "integration") missing.add("owner-approved provider configuration status");

  return Array.from(missing);
}

function expectedImpactForRecommendation(
  item: AiPriorityItem,
  category: AiCommandCenterRecommendation["category"],
) {
  if (category === "financial") {
    return "Improves cash collection visibility and reduces the chance of missed invoice follow-up.";
  }

  if (category === "lead" || category === "estimate") {
    return `Protects pipeline conversion and visible revenue up to ${money(numericImpactFromSupportingFields(item))}.`;
  }

  if (category === "job" || category === "schedule" || category === "production" || category === "material") {
    return "Reduces production delay risk, crew confusion, customer callbacks, and margin leakage.";
  }

  if (category === "inspection") {
    return "Keeps inspection-to-estimate handoff moving and reduces office rework.";
  }

  return "Improves operational clarity while keeping all write actions owner-approved.";
}

function confidenceForRecommendation(
  item: AiPriorityItem,
  missingInformation: string[],
  supportingRecords: AiSourceRecord[],
  supportingDocuments: AiSourceRecord[],
) {
  return clampNumber(
    60 +
      Math.min(22, Math.round(item.score / 4)) +
      Math.min(8, Object.keys(item.supportingFields).length * 2) +
      supportingRecords.length * 2 +
      Math.min(4, supportingDocuments.length) -
      missingInformation.length * 3,
    45,
    96,
  );
}

function numericImpactFromSupportingFields(item: {
  supportingFields?: Record<string, string | number | boolean | null>;
}) {
  const fields = item.supportingFields ?? {};
  const candidates = [
    fields.estimated_value,
    fields.total,
    fields.balance_due,
    fields.deposit_amount,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return candidates[0] ?? 0;
}

function findRecommendationCustomer(snapshot: CrmSnapshot, item: AiPriorityItem) {
  if (item.source.table === "leads") {
    const lead = snapshot.leads.find((candidate) => candidate.id === item.source.id);
    if (lead?.customer_id) {
      return snapshot.customers.find((customer) => customer.id === lead.customer_id) ?? null;
    }
    return snapshot.customers.find((customer) =>
      [customer.email, customer.phone, customer.property_address]
        .filter(Boolean)
        .some((value) => value === lead?.email || value === lead?.phone || value === lead?.property_address),
    ) ?? null;
  }

  if (item.source.table === "customers") {
    return snapshot.customers.find((customer) => customer.id === item.source.id) ?? null;
  }

  if (item.source.table === "estimates") {
    const estimate = snapshot.estimates.find((candidate) => candidate.id === item.source.id);
    return snapshot.customers.find((customer) => customer.id === estimate?.customer_id) ?? null;
  }

  if (item.source.table === "estimate_proposal_revisions") {
    const proposal = snapshot.proposalRevisions.find((candidate) => candidate.id === item.source.id);
    return snapshot.customers.find((customer) => customer.id === proposal?.customer_id) ?? null;
  }

  if (item.source.table === "jobs") {
    const job = snapshot.jobs.find((candidate) => candidate.id === item.source.id);
    return snapshot.customers.find((customer) => customer.id === job?.customer_id) ?? null;
  }

  if (item.source.table === "inspections") {
    const inspection = snapshot.inspections.find((candidate) => candidate.id === item.source.id);
    return snapshot.customers.find((customer) => customer.id === inspection?.customer_id) ?? null;
  }

  if (item.source.table === "invoices") {
    const invoice = snapshot.invoices.find((candidate) => candidate.id === item.source.id);
    return snapshot.customers.find((customer) => customer.id === invoice?.customer_id) ?? null;
  }

  if (item.source.table === "documents") {
    const document = snapshot.documents.find((candidate) => candidate.id === item.source.id);
    return snapshot.customers.find((customer) => customer.id === document?.customer_id) ?? null;
  }

  if (item.source.table === "material_orders") {
    const order = snapshot.materialOrders.find((candidate) => candidate.id === item.source.id);
    const job = snapshot.jobs.find((candidate) => candidate.id === order?.job_id);
    return snapshot.customers.find((customer) => customer.id === job?.customer_id) ?? null;
  }

  return null;
}

function findRecommendationJob(snapshot: CrmSnapshot, item: AiPriorityItem) {
  if (item.source.table === "jobs") {
    return snapshot.jobs.find((job) => job.id === item.source.id) ?? null;
  }

  if (item.source.table === "material_orders") {
    const order = snapshot.materialOrders.find((candidate) => candidate.id === item.source.id);
    return snapshot.jobs.find((job) => job.id === order?.job_id) ?? null;
  }

  if (item.source.table === "documents") {
    const document = snapshot.documents.find((candidate) => candidate.id === item.source.id);
    return snapshot.jobs.find((job) => job.id === document?.job_id) ?? null;
  }

  if (item.source.table === "invoices") {
    const invoice = snapshot.invoices.find((candidate) => candidate.id === item.source.id);
    return snapshot.jobs.find((job) => job.id === invoice?.job_id) ?? null;
  }

  return null;
}

function findRecommendationEmployee(snapshot: CrmSnapshot, item: AiPriorityItem) {
  if (!item.owner) {
    return null;
  }

  return snapshot.employees.find((employee) => employee.id === item.owner) ?? null;
}

function findRecommendationPropertyLabel(
  snapshot: CrmSnapshot,
  item: AiPriorityItem,
  customer: CustomerRecord | null,
  job: JobRecord | null,
) {
  const propertyId =
    snapshot.leads.find((lead) => item.source.table === "leads" && lead.id === item.source.id)?.property_id ??
    snapshot.estimates.find((estimate) => item.source.table === "estimates" && estimate.id === item.source.id)?.property_id ??
    snapshot.jobs.find((candidate) => candidate.id === job?.id)?.property_id ??
    snapshot.inspections.find((inspection) => item.source.table === "inspections" && inspection.id === item.source.id)?.property_id ??
    snapshot.documents.find((document) => item.source.table === "documents" && document.id === item.source.id)?.property_id ??
    null;
  const property = snapshot.properties.find((candidate) => candidate.id === propertyId);

  if (property) {
    return `${property.display_name} - ${property.address}`;
  }

  if (job?.property_address) return job.property_address;
  if (customer?.property_address) return customer.property_address;

  const lead = snapshot.leads.find((candidate) => candidate.id === item.source.id);
  if (lead?.property_address) return lead.property_address;

  const inspection = snapshot.inspections.find((candidate) => candidate.id === item.source.id);
  return inspection?.property_address ?? null;
}

function findSupportingDocuments(
  snapshot: CrmSnapshot,
  item: AiPriorityItem,
  customer: CustomerRecord | null,
  job: JobRecord | null,
) {
  return snapshot.documents
    .filter((document) => {
      if (document.company_id !== item.companyId) return false;
      if (customer?.id && document.customer_id === customer.id) return true;
      if (job?.id && document.job_id === job.id) return true;
      if (item.source.table === "estimates" && document.estimate_id === item.source.id) return true;
      if (item.source.table === "inspections" && document.inspection_id === item.source.id) return true;
      return false;
    })
    .slice(0, 3);
}

function uniqueSources(records: Array<AiSourceRecord | null>) {
  const seen = new Set<string>();
  const output: AiSourceRecord[] = [];

  for (const record of records) {
    if (!record) continue;
    const key = `${record.table}:${record.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(record);
  }

  return output;
}

function companyNameFor(
  companyId: string | null,
  snapshot: CrmSnapshot,
  companyMap?: Map<string, CompanyRecord>,
) {
  if (!companyId) return "All authorized companies";
  return companyMap?.get(companyId)?.name ??
    snapshot.companies.find((company) => company.id === companyId)?.name ??
    "Selected company";
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
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
        mode: "rule_based_insight",
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
      mode: "rule_based_insight",
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
      sourceRecords: weatherSensitiveJobs.map((job) => jobSource(job)),
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
      mode: "rule_based_insight",
      body:
        "Saved AI analysis previews remain read-only and require authenticated company-scoped storage plus a separate reviewed save workflow before persistence.",
      missingInformation: ["A reviewed save workflow is required before new AI work is persisted."],
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
        ? ["These workspace recommendations are deterministic previews; use the audited command bar for live AI."]
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
  if (dailyOperationsTopicsForPrompt(normalizedPrompt).length > 0) {
    return "daily_brief";
  }
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

export function selectAiPriorityItemsForPrompt(
  items: AiPriorityItem[],
  normalizedPrompt: string,
): AiPriorityItem[] {
  const dailyOperationsTopics = dailyOperationsTopicsForPrompt(normalizedPrompt);
  if (dailyOperationsTopics.length > 0) {
    if (dailyOperationsTopics.includes("highest_priorities")) {
      return items.slice(0, 10);
    }

    return items
      .filter(
        (item) =>
          item.dailyOperationsTopics.some((topic) =>
            dailyOperationsTopics.includes(topic),
          ) ||
          (dailyOperationsTopics.includes("attention_today") &&
            (item.priority === "critical" || item.priority === "high")),
      )
      .slice(0, 20);
  }

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

function dailyOperationsTopicsForPrompt(
  normalizedPrompt: string,
): AiDailyOperationsTopic[] {
  const topics = new Set<AiDailyOperationsTopic>();
  const includesAny = (...values: string[]) =>
    values.some((value) => normalizedPrompt.includes(value));

  if (
    includesAny(
      "daily operations",
      "daily ops",
      "morning brief",
      "run the company today",
    )
  ) {
    for (const topic of [
      "attention_today",
      "uncontacted_leads",
      "stale_leads",
      "estimate_follow_up",
      "approved_unscheduled_jobs",
      "scheduled_today",
      "scheduled_tomorrow",
      "outstanding_invoices",
      "customers_waiting",
      "overdue_tasks",
      "since_yesterday",
    ] as const) {
      topics.add(topic);
    }
  }

  if (
    includesAny(
      "needs my attention today",
      "need my attention today",
      "needs attention today",
      "what needs attention",
    )
  ) {
    topics.add("attention_today");
  }

  if (
    includesAny(
      "haven't been contacted",
      "have not been contacted",
      "not been contacted",
      "uncontacted lead",
      "leads without contact",
    )
  ) {
    topics.add("uncontacted_leads");
  }

  if (includesAny("stale lead", "stale opportunity")) {
    topics.add("stale_leads");
  }

  if (
    normalizedPrompt.includes("estimate") &&
    includesAny("follow-up", "follow up", "needs follow")
  ) {
    topics.add("estimate_follow_up");
  }

  if (
    normalizedPrompt.includes("approved") &&
    normalizedPrompt.includes("job") &&
    includesAny("aren't scheduled", "are not scheduled", "not scheduled", "unscheduled")
  ) {
    topics.add("approved_unscheduled_jobs");
  }

  if (normalizedPrompt.includes("scheduled") && normalizedPrompt.includes("today")) {
    topics.add("scheduled_today");
  }

  if (
    normalizedPrompt.includes("scheduled") &&
    normalizedPrompt.includes("tomorrow")
  ) {
    topics.add("scheduled_tomorrow");
  }

  if (
    normalizedPrompt.includes("invoice") &&
    includesAny("outstanding", "unpaid", "balance due")
  ) {
    topics.add("outstanding_invoices");
  }

  if (
    normalizedPrompt.includes("customer") &&
    includesAny("waiting on us", "waiting for us", "needs a response", "need a response")
  ) {
    topics.add("customers_waiting");
  }

  if (
    normalizedPrompt.includes("task") &&
    includesAny("overdue", "past due")
  ) {
    topics.add("overdue_tasks");
  }

  if (includesAny("since yesterday", "last 24 hours", "past 24 hours")) {
    topics.add("since_yesterday");
  }

  if (
    includesAny(
      "highest-priority actions today",
      "highest priority actions today",
      "top priorities today",
      "highest priorities today",
    )
  ) {
    topics.add("highest_priorities");
  }

  return Array.from(topics);
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

type AuthoritativeAiLocation = { id: string; label: string };

function source(
  table: string,
  id: string,
  label: string,
  companyId: string | null,
  hrefView: string,
  location: AuthoritativeAiLocation | null = null,
): AiSourceRecord {
  return {
    table,
    id,
    label: sanitizeBusinessText(label).slice(0, 120) || table,
    companyId,
    companyLocationId: location?.id ?? null,
    companyLocationLabel: location?.label ?? null,
    safeReference: `${table}:${id.slice(0, 8)}`,
    hrefView,
  };
}

function leadSource(lead: LeadRecord, snapshot?: CrmSnapshot) {
  return source(
    "leads",
    lead.id,
    lead.contact_name,
    lead.company_id,
    "Leads",
    snapshot
      ? resolveAuthoritativeLocation(
          snapshot,
          lead.company_id,
          lead.company_location_id,
        )
      : null,
  );
}

function customerSource(customer: CustomerRecord) {
  return source("customers", customer.id, customer.display_name, customer.company_id, "Customers");
}

function estimateSource(estimate: EstimateRecord, snapshot?: CrmSnapshot) {
  return source(
    "estimates",
    estimate.id,
    estimate.title,
    estimate.company_id,
    "Estimates",
    snapshot
      ? resolveLocationFromLinks(snapshot, estimate.company_id, {
          leadId: estimate.lead_id,
        })
      : null,
  );
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

function jobSource(job: JobRecord, snapshot?: CrmSnapshot) {
  return source(
    "jobs",
    job.id,
    job.title,
    job.company_id,
    "Jobs",
    snapshot
      ? resolveLocationFromLinks(snapshot, job.company_id, {
          leadId: job.lead_id,
          estimateId: job.estimate_id,
        })
      : null,
  );
}

function inspectionSource(inspection: InspectionRecord) {
  return source("inspections", inspection.id, inspection.title, inspection.company_id, "Inspections");
}

function invoiceSource(invoice: InvoiceRecord, snapshot?: CrmSnapshot) {
  return source(
    "invoices",
    invoice.id,
    invoice.invoice_number,
    invoice.company_id,
    "Invoices",
    snapshot
      ? resolveLocationFromLinks(snapshot, invoice.company_id, {
          estimateId: invoice.estimate_id,
          jobId: invoice.job_id,
        })
      : null,
  );
}

function documentSource(document: DocumentRecord) {
  return source("documents", document.id, document.title, document.company_id, "Documents");
}

function materialOrderSource(order: MaterialOrderRecord) {
  return source(
    "material_orders",
    order.id,
    `${order.supplier_name} ${order.status}`,
    order.company_id,
    "Materials",
  );
}

function integrationSource(log: IntegrationSyncLogRecord) {
  return source("integration_sync_logs", log.id, `${log.provider} ${log.event_type}`, log.company_id, "Settings");
}

function proposalAuditSource(event: ProposalAuditEventRecord) {
  return source("proposal_audit_events", event.id, event.summary, event.company_id, "Estimates");
}

function callSource(
  call: CallRecord,
  snapshot?: CrmSnapshot,
  resolvedCompanyId?: string | null,
) {
  const companyId = resolvedCompanyId ?? call.company_id;
  return source(
    "call_records",
    call.id,
    call.customer_phone ?? call.from_phone ?? "Phone call",
    companyId,
    "Inbox",
    snapshot && companyId
      ? resolveLocationFromLinks(snapshot, companyId, {
          leadId: call.lead_id,
          jobId: call.job_id,
        })
      : null,
  );
}

function scheduleEventSource(
  event: CrmSnapshot["scheduleEvents"][number],
  snapshot: CrmSnapshot,
) {
  return source(
    "schedule_events",
    event.id,
    event.title,
    event.company_id,
    "Calendar",
    resolveLocationFromLinks(snapshot, event.company_id, {
      leadId: event.lead_id,
      jobId: event.job_id,
    }),
  );
}

function officeTaskSource(
  task: CrmSnapshot["officeTasks"][number],
  snapshot: CrmSnapshot,
) {
  return source(
    "office_tasks",
    task.id,
    task.title,
    task.company_id,
    "Daily Ops",
    resolveLocationFromLinks(snapshot, task.company_id, {
      companyLocationId: task.company_location_id,
      leadId: task.lead_id,
      estimateId: task.estimate_id,
      jobId: task.job_id,
      inspectionId: task.inspection_id,
    }),
  );
}

function emailMessageSource(
  email: CrmSnapshot["emailMessages"][number],
  snapshot: CrmSnapshot,
) {
  return source(
    "email_messages",
    email.id,
    email.subject || "Inbound email",
    email.company_id,
    "Inbox",
    resolveLocationFromLinks(snapshot, email.company_id, {
      leadId: email.lead_id,
      estimateId: email.estimate_id,
      jobId: email.job_id,
    }),
  );
}

function smsMessageSource(
  sms: CrmSnapshot["smsMessages"][number],
  snapshot: CrmSnapshot,
) {
  return source(
    "sms_messages",
    sms.id,
    sanitizeBusinessText(sms.body).slice(0, 48) || "Inbound SMS",
    sms.company_id,
    "Inbox",
    resolveLocationFromLinks(snapshot, sms.company_id, {
      leadId: sms.lead_id,
      jobId: sms.job_id,
    }),
  );
}

function communicationProviderEventSource(
  event: CrmSnapshot["communicationProviderEvents"][number],
  snapshot: CrmSnapshot,
  companyId: string,
) {
  return source(
    "communication_provider_events",
    event.id,
    `${event.provider} ${event.channel} ${event.status}`,
    companyId,
    "Inbox",
    resolveLocationFromLinks(snapshot, companyId, {
      leadId: event.lead_id,
      jobId: event.job_id,
    }),
  );
}

function automationEventSource(
  event: CrmSnapshot["automationEvents"][number],
  snapshot: CrmSnapshot,
) {
  return source(
    "automation_events",
    event.id,
    event.event_type,
    event.company_id,
    "Daily Ops",
    resolveAuthoritativeLocation(
      snapshot,
      event.company_id,
      event.company_location_id,
    ),
  );
}

function resolveAuthoritativeLocation(
  snapshot: CrmSnapshot,
  companyId: string,
  companyLocationId: string | null | undefined,
): AuthoritativeAiLocation | null {
  if (!companyLocationId) return null;
  const location = (snapshot.companyLocations ?? []).find(
    (candidate) =>
      candidate.id === companyLocationId && candidate.company_id === companyId,
  );
  return location
    ? { id: location.id, label: location.display_name }
    : null;
}

function resolveLocationFromLinks(
  snapshot: CrmSnapshot,
  companyId: string,
  links: {
    companyLocationId?: string | null;
    leadId?: string | null;
    estimateId?: string | null;
    jobId?: string | null;
    inspectionId?: string | null;
  },
): AuthoritativeAiLocation | null {
  const direct = resolveAuthoritativeLocation(
    snapshot,
    companyId,
    links.companyLocationId,
  );
  if (direct) return direct;

  const lead = links.leadId
    ? snapshot.leads.find(
        (candidate) =>
          candidate.id === links.leadId && candidate.company_id === companyId,
      )
    : null;
  const leadLocation = resolveAuthoritativeLocation(
    snapshot,
    companyId,
    lead?.company_location_id,
  );
  if (leadLocation) return leadLocation;

  const estimate = links.estimateId
    ? snapshot.estimates.find(
        (candidate) =>
          candidate.id === links.estimateId && candidate.company_id === companyId,
      )
    : null;
  if (estimate?.lead_id) {
    const estimateLocation: AuthoritativeAiLocation | null =
      resolveLocationFromLinks(snapshot, companyId, {
      leadId: estimate.lead_id,
      });
    if (estimateLocation) return estimateLocation;
  }

  const job = links.jobId
    ? snapshot.jobs.find(
        (candidate) =>
          candidate.id === links.jobId && candidate.company_id === companyId,
      )
    : null;
  if (job) {
    const jobLocation: AuthoritativeAiLocation | null =
      resolveLocationFromLinks(snapshot, companyId, {
      leadId: job.lead_id,
      estimateId: job.estimate_id,
      });
    if (jobLocation) return jobLocation;
  }

  const inspection = links.inspectionId
    ? snapshot.inspections.find(
        (candidate) =>
          candidate.id === links.inspectionId &&
          candidate.company_id === companyId,
      )
    : null;
  if (inspection) {
    return resolveLocationFromLinks(snapshot, companyId, {
      leadId: inspection.lead_id,
      estimateId: inspection.estimate_id,
      jobId: inspection.job_id,
    });
  }

  return null;
}

function resolveCommunicationCompanyId(
  snapshot: CrmSnapshot,
  record: {
    company_id: string | null;
    business_phone_number_id: string | null;
    customer_id: string | null;
    lead_id: string | null;
    job_id: string | null;
  },
) {
  const companyIds = new Set<string>();
  if (record.company_id) companyIds.add(record.company_id);

  const businessPhone = record.business_phone_number_id
    ? snapshot.businessPhoneNumbers.find(
        (candidate) => candidate.id === record.business_phone_number_id,
      )
    : null;
  if (businessPhone) companyIds.add(businessPhone.company_id);

  const customer = record.customer_id
    ? snapshot.customers.find((candidate) => candidate.id === record.customer_id)
    : null;
  if (customer) companyIds.add(customer.company_id);

  const lead = record.lead_id
    ? snapshot.leads.find((candidate) => candidate.id === record.lead_id)
    : null;
  if (lead) companyIds.add(lead.company_id);

  const job = record.job_id
    ? snapshot.jobs.find((candidate) => candidate.id === record.job_id)
    : null;
  if (job) companyIds.add(job.company_id);

  return companyIds.size === 1 ? Array.from(companyIds)[0] ?? null : null;
}

function hasLaterOutboundEmail(
  snapshot: CrmSnapshot,
  inbound: CrmSnapshot["emailMessages"][number],
  receivedAt: string,
) {
  const receivedTimestamp = new Date(receivedAt).getTime();
  return snapshot.emailMessages.some((candidate) => {
    if (
      candidate.company_id !== inbound.company_id ||
      candidate.direction !== "outbound" ||
      new Date(candidate.sent_at ?? candidate.created_at).getTime() <=
        receivedTimestamp
    ) {
      return false;
    }
    if (
      inbound.gmail_thread_id &&
      candidate.gmail_thread_id === inbound.gmail_thread_id
    ) {
      return true;
    }
    return recordsShareLinkedContext(candidate, inbound);
  });
}

function hasLaterOutboundSms(
  snapshot: CrmSnapshot,
  inbound: CrmSnapshot["smsMessages"][number],
  receivedAt: string,
) {
  const receivedTimestamp = new Date(receivedAt).getTime();
  return snapshot.smsMessages.some(
    (candidate) =>
      candidate.company_id === inbound.company_id &&
      candidate.direction === "outbound" &&
      new Date(candidate.sent_at ?? candidate.created_at).getTime() >
        receivedTimestamp &&
      (recordsShareLinkedContext(candidate, inbound) ||
        Boolean(inbound.from_phone && candidate.to_phone === inbound.from_phone)),
  );
}

function hasLaterOutboundProviderEvent(
  snapshot: CrmSnapshot,
  inbound: CrmSnapshot["communicationProviderEvents"][number],
) {
  const receivedTimestamp = new Date(inbound.occurred_at).getTime();
  const inboundCompanyId = resolveCommunicationCompanyId(snapshot, inbound);
  if (!inboundCompanyId) return false;
  return snapshot.communicationProviderEvents.some(
    (candidate) =>
      candidate.direction === "outbound" &&
      resolveCommunicationCompanyId(snapshot, candidate) === inboundCompanyId &&
      new Date(candidate.occurred_at).getTime() > receivedTimestamp &&
      (candidate.correlation_id === inbound.correlation_id ||
        recordsShareLinkedContext(candidate, inbound)),
  );
}

function recordsShareLinkedContext(
  left: {
    customer_id?: string | null;
    lead_id?: string | null;
    job_id?: string | null;
  },
  right: {
    customer_id?: string | null;
    lead_id?: string | null;
    job_id?: string | null;
  },
) {
  return Boolean(
    (left.customer_id && left.customer_id === right.customer_id) ||
      (left.lead_id && left.lead_id === right.lead_id) ||
      (left.job_id && left.job_id === right.job_id),
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

function toBusinessDateKey(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : "";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
