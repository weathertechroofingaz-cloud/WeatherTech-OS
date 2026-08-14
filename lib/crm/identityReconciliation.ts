import type {
  CrmSnapshot,
  CustomerRecord,
  IdentityReconciliationDecision,
  IdentityReconciliationRequest,
  LeadRecord,
  PropertyRecord,
} from "./types";

export type IdentityEvidenceKind = "phone" | "email" | "address_name";

export type IdentityEvidence = {
  kind: IdentityEvidenceKind;
  label: string;
  value: string;
};

export type IdentityCustomerCandidate = {
  customer: CustomerRecord;
  evidence: IdentityEvidence[];
};

export type IdentityCrossCompanyMatch = {
  customerId: string;
  companyId: string;
  displayName: string;
  evidence: IdentityEvidence[];
};

export type IdentityReconciliationLinkTable =
  | "properties"
  | "estimates"
  | "inspections"
  | "jobs"
  | "schedule_events"
  | "office_tasks";

export type IdentityReconciliationLink = {
  key: string;
  table: IdentityReconciliationLinkTable;
  id: string;
  label: string;
  expectedUpdatedAt: string;
  currentCustomerId: string | null;
  currentPropertyId: string | null;
};

export type IdentityReconciliationCaseState =
  | "ready_link"
  | "ready_create"
  | "ambiguous"
  | "conflict"
  | "insufficient_evidence";

export type IdentityReconciliationCase = {
  key: string;
  companyId: string;
  lead: LeadRecord;
  state: IdentityReconciliationCaseState;
  decision: Exclude<IdentityReconciliationDecision, "dismiss"> | null;
  customerCandidates: IdentityCustomerCandidate[];
  crossCompanyMatches: IdentityCrossCompanyMatch[];
  targetCustomer: CustomerRecord | null;
  propertyCandidates: PropertyRecord[];
  targetProperty: PropertyRecord | null;
  links: IdentityReconciliationLink[];
  blockers: string[];
};

type LinkableRecord = {
  id: string;
  company_id: string;
  customer_id: string | null;
  property_id?: string | null;
  updated_at: string;
};

export function normalizeIdentityPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }

  return digits.length === 10 ? digits : "";
}

export function normalizeIdentityEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeIdentityText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeIdentityAddress(value: string | null | undefined) {
  return normalizeIdentityText(value);
}

function normalizeLeadIdentityName(lead: LeadRecord) {
  const normalized = normalizeIdentityText(lead.contact_name);

  return normalized === "unnamed lead" ? "" : normalized;
}

function getCustomerEvidence(lead: LeadRecord, customer: CustomerRecord) {
  const evidence: IdentityEvidence[] = [];
  const leadPhone = normalizeIdentityPhone(lead.phone);
  const customerPhone = normalizeIdentityPhone(customer.phone);
  const leadEmail = normalizeIdentityEmail(lead.email);
  const customerEmail = normalizeIdentityEmail(customer.email);
  const leadAddress = normalizeIdentityAddress(lead.property_address);
  const customerAddress = normalizeIdentityAddress(customer.property_address);
  const leadName = normalizeLeadIdentityName(lead);
  const customerName = normalizeIdentityText(
    customer.contact_name || customer.display_name,
  );

  if (leadPhone && customerPhone && leadPhone === customerPhone) {
    evidence.push({ kind: "phone", label: "Exact phone", value: leadPhone });
  }

  if (leadEmail && customerEmail && leadEmail === customerEmail) {
    evidence.push({ kind: "email", label: "Exact email", value: leadEmail });
  }

  if (
    leadAddress &&
    customerAddress &&
    leadAddress === customerAddress &&
    leadName &&
    customerName &&
    leadName === customerName
  ) {
    evidence.push({
      kind: "address_name",
      label: "Exact address and name",
      value: leadAddress,
    });
  }

  return evidence;
}

function getPropertyCandidates(snapshot: CrmSnapshot, lead: LeadRecord) {
  if (lead.property_id) {
    return snapshot.properties.filter((property) => property.id === lead.property_id);
  }

  const leadAddress = normalizeIdentityAddress(lead.property_address);

  if (!leadAddress) {
    return [];
  }

  return snapshot.properties.filter(
    (property) =>
      property.company_id === lead.company_id &&
      normalizeIdentityAddress(property.address) === leadAddress,
  );
}

function recordLabel(table: IdentityReconciliationLinkTable, record: LinkableRecord) {
  if (table === "properties") {
    return (record as PropertyRecord).display_name || (record as PropertyRecord).address;
  }

  if ("title" in record && typeof record.title === "string") {
    return record.title;
  }

  return `${table.replace(/_/g, " ")} ${record.id.slice(0, 8)}`;
}

function linkFromRecord(
  table: IdentityReconciliationLinkTable,
  record: LinkableRecord,
): IdentityReconciliationLink {
  return {
    key: `${table}:${record.id}`,
    table,
    id: record.id,
    label: recordLabel(table, record),
    expectedUpdatedAt: record.updated_at,
    currentCustomerId: record.customer_id,
    currentPropertyId: record.property_id ?? null,
  };
}

function collectConnectedRecords(snapshot: CrmSnapshot, lead: LeadRecord, propertyId: string | null) {
  const estimates = snapshot.estimates.filter(
    (estimate) => estimate.lead_id === lead.id || Boolean(propertyId && estimate.property_id === propertyId),
  );
  const estimateIds = new Set(estimates.map((estimate) => estimate.id));
  const jobs = snapshot.jobs.filter(
    (job) =>
      job.lead_id === lead.id ||
      Boolean(propertyId && job.property_id === propertyId) ||
      Boolean(job.estimate_id && estimateIds.has(job.estimate_id)),
  );
  const jobIds = new Set(jobs.map((job) => job.id));
  const scheduleEvents = snapshot.scheduleEvents.filter(
    (event) =>
      event.lead_id === lead.id ||
      Boolean(propertyId && event.property_id === propertyId) ||
      Boolean(event.job_id && jobIds.has(event.job_id)),
  );
  const scheduleEventIds = new Set(scheduleEvents.map((event) => event.id));
  const inspections = snapshot.inspections.filter(
    (inspection) =>
      inspection.lead_id === lead.id ||
      Boolean(propertyId && inspection.property_id === propertyId) ||
      Boolean(inspection.estimate_id && estimateIds.has(inspection.estimate_id)) ||
      Boolean(inspection.job_id && jobIds.has(inspection.job_id)) ||
      Boolean(
        inspection.schedule_event_id &&
          scheduleEventIds.has(inspection.schedule_event_id),
      ),
  );
  const inspectionIds = new Set(inspections.map((inspection) => inspection.id));
  const officeTasks = snapshot.officeTasks.filter(
    (task) =>
      task.lead_id === lead.id ||
      Boolean(propertyId && task.property_id === propertyId) ||
      Boolean(task.estimate_id && estimateIds.has(task.estimate_id)) ||
      Boolean(task.job_id && jobIds.has(task.job_id)) ||
      Boolean(task.inspection_id && inspectionIds.has(task.inspection_id)),
  );

  return {
    estimates,
    jobs,
    inspections,
    scheduleEvents,
    officeTasks,
  };
}

function appendRecordBlockers(
  blockers: string[],
  table: IdentityReconciliationLinkTable,
  records: LinkableRecord[],
  lead: LeadRecord,
  targetCustomerId: string | null,
  targetPropertyId: string | null,
) {
  records.forEach((record) => {
    if (record.company_id !== lead.company_id) {
      blockers.push(
        `${recordLabel(table, record)} is linked across company boundaries.`,
      );
      return;
    }

    if (record.customer_id && record.customer_id !== targetCustomerId) {
      blockers.push(
        `${recordLabel(table, record)} already belongs to another customer.`,
      );
    }

    if (targetPropertyId && record.property_id && record.property_id !== targetPropertyId) {
      blockers.push(
        `${recordLabel(table, record)} already belongs to another property.`,
      );
    }
  });
}

function uniqueMessages(messages: string[]) {
  return [...new Set(messages)];
}

export function buildIdentityReconciliationCases(
  snapshot: CrmSnapshot,
  options: { dismissedLeadVersions?: ReadonlySet<string> } = {},
) {
  const dismissedLeadVersions = options.dismissedLeadVersions ?? new Set<string>();

  return snapshot.leads
    .filter((lead) => !lead.customer_id)
    .filter((lead) => !dismissedLeadVersions.has(`${lead.id}:${lead.updated_at}`))
    .map((lead): IdentityReconciliationCase => {
      const candidates: IdentityCustomerCandidate[] = [];
      const crossCompanyMatches: IdentityCrossCompanyMatch[] = [];

      snapshot.customers.forEach((customer) => {
        const evidence = getCustomerEvidence(lead, customer);

        if (!evidence.length) {
          return;
        }

        if (customer.company_id !== lead.company_id) {
          crossCompanyMatches.push({
            customerId: customer.id,
            companyId: customer.company_id,
            displayName: customer.display_name,
            evidence,
          });
          return;
        }

        candidates.push({ customer, evidence });
      });

      const targetCustomer = candidates.length === 1 ? candidates[0].customer : null;
      const propertyCandidates = getPropertyCandidates(snapshot, lead);
      const sameCompanyProperties = propertyCandidates.filter(
        (property) => property.company_id === lead.company_id,
      );
      const targetProperty = sameCompanyProperties.length === 1 ? sameCompanyProperties[0] : null;
      const blockers: string[] = [];

      if (lead.property_id && !propertyCandidates.length) {
        blockers.push("The lead points to a property that is unavailable for review.");
      } else if (lead.property_id && !sameCompanyProperties.length) {
        blockers.push("The lead points to a property owned by another company.");
      }

      if (sameCompanyProperties.length > 1) {
        blockers.push("More than one same-company property has this exact address.");
      }

      if (
        targetProperty?.customer_id &&
        (!targetCustomer || targetProperty.customer_id !== targetCustomer.id)
      ) {
        blockers.push("The matched property already belongs to another customer.");
      }

      const connected = collectConnectedRecords(snapshot, lead, targetProperty?.id ?? null);
      const targetCustomerId = targetCustomer?.id ?? null;
      const targetPropertyId = targetProperty?.id ?? null;

      appendRecordBlockers(blockers, "estimates", connected.estimates, lead, targetCustomerId, targetPropertyId);
      appendRecordBlockers(blockers, "jobs", connected.jobs, lead, targetCustomerId, targetPropertyId);
      appendRecordBlockers(blockers, "inspections", connected.inspections, lead, targetCustomerId, targetPropertyId);
      appendRecordBlockers(blockers, "schedule_events", connected.scheduleEvents, lead, targetCustomerId, targetPropertyId);
      appendRecordBlockers(blockers, "office_tasks", connected.officeTasks, lead, targetCustomerId, targetPropertyId);

      const links: IdentityReconciliationLink[] = [
        ...(targetProperty
          ? [linkFromRecord("properties", targetProperty)]
          : []),
        ...connected.estimates.map((record) => linkFromRecord("estimates", record)),
        ...connected.inspections.map((record) => linkFromRecord("inspections", record)),
        ...connected.jobs.map((record) => linkFromRecord("jobs", record)),
        ...connected.scheduleEvents.map((record) => linkFromRecord("schedule_events", record)),
        ...connected.officeTasks.map((record) => linkFromRecord("office_tasks", record)),
      ].filter((link) => {
        const source =
          link.table === "properties"
            ? targetProperty
            : [...connected.estimates, ...connected.inspections, ...connected.jobs, ...connected.scheduleEvents, ...connected.officeTasks]
                .find((record) => record.id === link.id);

        return source?.company_id === lead.company_id;
      });

      const canCreate = Boolean(
        normalizeLeadIdentityName(lead) &&
          normalizeIdentityAddress(lead.property_address) &&
          (normalizeIdentityPhone(lead.phone) || normalizeIdentityEmail(lead.email)),
      );
      let state: IdentityReconciliationCaseState;
      let decision: IdentityReconciliationCase["decision"] = null;

      if (candidates.length > 1) {
        state = "ambiguous";
      } else if (blockers.length) {
        state = "conflict";
      } else if (targetCustomer) {
        state = "ready_link";
        decision = "link_existing";
      } else if (canCreate) {
        state = "ready_create";
        decision = "create_customer";
      } else {
        state = "insufficient_evidence";
      }

      return {
        key: `${lead.company_id}:${lead.id}:${lead.updated_at}`,
        companyId: lead.company_id,
        lead,
        state,
        decision,
        customerCandidates: candidates,
        crossCompanyMatches,
        targetCustomer,
        propertyCandidates: sameCompanyProperties,
        targetProperty,
        links,
        blockers: uniqueMessages(blockers),
      };
    })
    .sort((left, right) => right.lead.updated_at.localeCompare(left.lead.updated_at));
}

function emptyLinks(): IdentityReconciliationRequest["links"] {
  return {
    estimates: [],
    inspections: [],
    jobs: [],
    schedule_events: [],
    office_tasks: [],
  };
}

export function buildIdentityReconciliationRequest({
  reconciliationCase,
  operationKey,
  selectedLinkKeys,
  decision = reconciliationCase.decision,
}: {
  reconciliationCase: IdentityReconciliationCase;
  operationKey: string;
  selectedLinkKeys: ReadonlySet<string>;
  decision?: IdentityReconciliationDecision | null;
}): IdentityReconciliationRequest {
  if (!operationKey.trim()) {
    throw new Error("Identity reconciliation requires a stable operation key.");
  }

  if (!decision) {
    throw new Error("This identity case is not safe to approve.");
  }

  if (decision !== "dismiss" && !reconciliationCase.decision) {
    throw new Error("Ambiguous or conflicting identity cases cannot be approved.");
  }

  if (decision !== "dismiss" && decision !== reconciliationCase.decision) {
    throw new Error("The reconciliation decision does not match the reviewed case.");
  }

  const request: IdentityReconciliationRequest = {
    company_id: reconciliationCase.companyId,
    operation_key: operationKey,
    decision,
    lead: {
      id: reconciliationCase.lead.id,
      expected_updated_at: reconciliationCase.lead.updated_at,
    },
    links: emptyLinks(),
  };

  if (decision === "dismiss") {
    return request;
  }

  if (decision === "link_existing" && reconciliationCase.targetCustomer) {
    request.customer = {
      id: reconciliationCase.targetCustomer.id,
      expected_updated_at: reconciliationCase.targetCustomer.updated_at,
    };
  } else if (decision === "create_customer") {
    request.customer = {
      display_name: reconciliationCase.lead.contact_name,
      contact_name: reconciliationCase.lead.contact_name,
      customer_type: "homeowner",
    };
  } else {
    throw new Error("The reconciliation decision does not match the reviewed case.");
  }

  const selectedLinks = reconciliationCase.links.filter((link) =>
    selectedLinkKeys.has(link.key),
  );
  const propertyLink = selectedLinks.find((link) => link.table === "properties");

  if (propertyLink && reconciliationCase.targetProperty) {
    request.property = {
      id: reconciliationCase.targetProperty.id,
      expected_updated_at: reconciliationCase.targetProperty.updated_at,
    };
  }

  selectedLinks.forEach((link) => {
    if (link.table === "properties") {
      return;
    }

    request.links[link.table].push({
      id: link.id,
      expected_updated_at: link.expectedUpdatedAt,
    });
  });

  return request;
}
