import type {
  CrmSnapshot,
  EstimateRecord,
  JobInput,
  JobRecord,
  ScopeCategory,
  ServiceType,
} from "./types";

const roofingJobScopeCategories = new Set<ScopeCategory>([
  "roofing",
  "roof_repairs",
  "tile_underlayment",
]);

const paintingJobScopeCategories = new Set<ScopeCategory>([
  "exterior_painting",
  "interior_painting",
  "cabinet_refinishing",
]);

function scopeCategoryMatchesService(
  category: ScopeCategory,
  serviceType: ServiceType,
) {
  if (serviceType === "roofing") {
    return roofingJobScopeCategories.has(category);
  }

  if (serviceType === "painting") {
    return paintingJobScopeCategories.has(category);
  }

  return true;
}

export function getJobDisplayBusiness(snapshot: CrmSnapshot, job: JobRecord) {
  return (
    job.business?.trim() ||
    snapshot.companies.find((company) => company.id === job.company_id)?.name ||
    "Business"
  );
}

export function getJobDisplayAddress(job: JobRecord) {
  return (
    job.address?.trim() ||
    job.property_address?.trim() ||
    job.location?.trim() ||
    "Address to confirm"
  );
}

export function getJobDisplayLocation(job: JobRecord) {
  return job.location?.trim() || getJobDisplayAddress(job);
}

export function getJobScheduledStart(job: JobRecord) {
  if (job.scheduled_start) {
    return job.scheduled_start;
  }

  return job.start_date ? `${job.start_date}T08:00:00` : null;
}

export function getJobScheduledEnd(job: JobRecord) {
  if (job.scheduled_end) {
    return job.scheduled_end;
  }

  return job.end_date ? `${job.end_date}T17:00:00` : null;
}

export function buildJobInputFromEstimate(
  snapshot: CrmSnapshot,
  estimate: EstimateRecord,
  scopeId: string | null = null,
): JobInput {
  const customer = estimate.customer_id
    ? snapshot.customers.find((item) => item.id === estimate.customer_id)
    : null;
  const lead = estimate.lead_id
    ? snapshot.leads.find((item) => item.id === estimate.lead_id)
    : null;
  const scope = scopeId
    ? snapshot.scopes.find(
        (item) =>
          item.id === scopeId &&
          item.company_id === estimate.company_id &&
          scopeCategoryMatchesService(item.category, estimate.service_type),
      )
    : null;
  const company = snapshot.companies.find((item) => item.id === estimate.company_id);
  const address =
    estimate.location?.trim() ||
    customer?.property_address ||
    lead?.property_address ||
    null;
  const scopeOfWork =
    estimate.scope_of_work?.trim() || scope?.scope_body || estimate.notes || null;

  return {
    company_id: estimate.company_id,
    customer_id: estimate.customer_id,
    lead_id: estimate.lead_id,
    estimate_id: estimate.id,
    scope_id: scope?.id ?? null,
    business: estimate.business?.trim() || company?.name || null,
    location: estimate.location?.trim() || address,
    title: estimate.title,
    service_type: estimate.service_type,
    status: "draft",
    scheduled_start: null,
    scheduled_end: null,
    start_date: null,
    end_date: null,
    crew_name: null,
    project_manager: null,
    address,
    property_address: address || "Address to confirm",
    scope_of_work: scopeOfWork,
    total: estimate.total,
    latitude: lead?.latitude ?? null,
    longitude: lead?.longitude ?? null,
    google_place_id: lead?.google_place_id ?? null,
    address_verified_at: lead?.address_verified_at ?? null,
    notes: `Created from approved estimate ${estimate.title}.`,
  };
}
