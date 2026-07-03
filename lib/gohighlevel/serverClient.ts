import type { CompanyRecord, CustomerRecord, LeadRecord } from "../crm/types";

const GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const GHL_CONTACTS_ENDPOINT = "/contacts/";
export const GHL_LEAD_CONTACT_DRY_RUN_EVENT_TYPE = "lead_contact.dry_run";

const GHL_REQUIRED_ENV_VARS = [
  "GHL_PRIVATE_INTEGRATION_TOKEN",
  "GHL_LOCATION_ID_WEATHERTECH",
  "GHL_LOCATION_ID_IHC",
] as const;

export type GoHighLevelLocationKey = "weathertech" | "ihc";

export type GoHighLevelConfiguredLocation = {
  key: GoHighLevelLocationKey;
  label: string;
  envVar: "GHL_LOCATION_ID_WEATHERTECH" | "GHL_LOCATION_ID_IHC";
  locationId: string | null;
  configured: boolean;
};

export type GoHighLevelLocationProbeResult = GoHighLevelConfiguredLocation & {
  readCheck: "skipped" | "ok" | "unsupported" | "unauthorized" | "error";
  statusCode: number | null;
  message: string;
  locationName: string | null;
};

export type GoHighLevelConnectionTestResult = {
  ok: boolean;
  dryRun: true;
  communicationsSent: false;
  status:
    | "ready"
    | "missing_token"
    | "missing_location"
    | "auth_failed"
    | "read_check_unavailable";
  message: string;
  tokenConfigured: boolean;
  requiredEnvVars: string[];
  configuredLocationIds: string[];
  locations: GoHighLevelLocationProbeResult[];
  apiBaseUrl: string;
  checkedAt: string;
  nextStep: string;
};

export type GoHighLevelLeadContactPayload = {
  intendedRequest: {
    method: "POST";
    path: typeof GHL_CONTACTS_ENDPOINT;
    apiBaseUrl: string;
    dryRun: true;
  };
  contact: {
    locationId: string;
    firstName: string;
    lastName: string;
    name: string;
    email?: string;
    phone?: string;
    address1: string;
    city?: string;
    state: string;
    postalCode?: string;
    source: string;
    tags: string[];
  };
  opportunityPreview: {
    title: string;
    monetaryValue: number;
    status: LeadRecord["status"];
    priority: LeadRecord["priority"];
    serviceType: LeadRecord["service_type"];
  };
  weathertechMetadata: {
    leadId: string;
    companyId: string;
    companyName: string;
    customerId: string | null;
    customerName: string | null;
    source: string;
    nextFollowUp: string | null;
    notesIncluded: boolean;
  };
  safety: {
    communicationsSent: false;
    automationTriggered: false;
    workflowsTriggered: false;
    campaignsTriggered: false;
  };
};

export type GoHighLevelLeadContactDryRunPreview = {
  ok: boolean;
  dryRun: true;
  communicationsSent: false;
  automationTriggered: false;
  status: "validated" | "missing_config" | "validation_failed";
  message: string;
  tokenConfigured: boolean;
  requiredFields: string[];
  missingFields: string[];
  location: {
    key: GoHighLevelLocationKey;
    label: string;
    envVar: GoHighLevelConfiguredLocation["envVar"];
    locationId: string | null;
    configured: boolean;
  };
  payload: GoHighLevelLeadContactPayload | null;
  requestFingerprint: string | null;
  checkedAt: string;
  nextStep: string;
};

type TestConnectionOptions = {
  includeReadProbe?: boolean;
};

type GoHighLevelLocationResponse = {
  location?: {
    name?: unknown;
  };
  name?: unknown;
};

function getServerEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function getTrimmedValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getOptionalPayloadValue(value: string | null | undefined) {
  return getTrimmedValue(value) ?? undefined;
}

function splitContactName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      firstName: name.trim(),
      lastName: "",
    };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) ?? "",
  };
}

function isIhcCompany(company: CompanyRecord) {
  const searchableName = [company.name, company.short_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return company.trade === "painting" || searchableName.includes("ihc");
}

function serviceTag(value: LeadRecord["service_type"]) {
  return `service:${value}`;
}

function createGoHighLevelPayloadFingerprint(payload: GoHighLevelLeadContactPayload) {
  const serialized = JSON.stringify(payload);
  let hash = 0;

  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash << 5) - hash + serialized.charCodeAt(index);
    hash |= 0;
  }

  return `ghl-${Math.abs(hash).toString(16)}`;
}

export function getGoHighLevelServerConfig() {
  const token = getServerEnv("GHL_PRIVATE_INTEGRATION_TOKEN");
  const locations: GoHighLevelConfiguredLocation[] = [
    {
      key: "weathertech",
      label: "WeatherTech Roofing",
      envVar: "GHL_LOCATION_ID_WEATHERTECH",
      locationId: getServerEnv("GHL_LOCATION_ID_WEATHERTECH"),
      configured: Boolean(getServerEnv("GHL_LOCATION_ID_WEATHERTECH")),
    },
    {
      key: "ihc",
      label: "IHC Painting",
      envVar: "GHL_LOCATION_ID_IHC",
      locationId: getServerEnv("GHL_LOCATION_ID_IHC"),
      configured: Boolean(getServerEnv("GHL_LOCATION_ID_IHC")),
    },
  ];

  return {
    token,
    tokenConfigured: Boolean(token),
    locations,
    configuredLocationIds: locations
      .map((location) => location.locationId)
      .filter((locationId): locationId is string => Boolean(locationId)),
    apiBaseUrl: GHL_API_BASE_URL,
  };
}

export function getGoHighLevelLocationForCompany(
  company: CompanyRecord,
  config = getGoHighLevelServerConfig(),
) {
  const targetKey: GoHighLevelLocationKey = isIhcCompany(company)
    ? "ihc"
    : "weathertech";

  return (
    config.locations.find((location) => location.key === targetKey) ??
    config.locations[0]
  );
}

export function buildGoHighLevelLeadContactPayload({
  lead,
  company,
  customer = null,
  location,
}: {
  lead: LeadRecord;
  company: CompanyRecord;
  customer?: CustomerRecord | null;
  location: GoHighLevelConfiguredLocation & { locationId: string };
}): GoHighLevelLeadContactPayload {
  const contactName = getTrimmedValue(lead.contact_name) ?? "Unknown lead";
  const { firstName, lastName } = splitContactName(contactName);
  const companyTag = isIhcCompany(company)
    ? "weathertech-os:ihc-painting"
    : "weathertech-os:weathertech-roofing";

  return {
    intendedRequest: {
      method: "POST",
      path: GHL_CONTACTS_ENDPOINT,
      apiBaseUrl: GHL_API_BASE_URL,
      dryRun: true,
    },
    contact: {
      locationId: location.locationId,
      firstName,
      lastName,
      name: contactName,
      email: getOptionalPayloadValue(lead.email),
      phone: getOptionalPayloadValue(lead.phone),
      address1: getTrimmedValue(lead.property_address) ?? "",
      city: getOptionalPayloadValue(lead.city),
      state: getTrimmedValue(lead.state) ?? "AZ",
      postalCode: getOptionalPayloadValue(lead.postal_code),
      source: getTrimmedValue(lead.source) ?? "WeatherTech OS",
      tags: [
        "weathertech-os",
        companyTag,
        serviceTag(lead.service_type),
        `lead-status:${lead.status}`,
        `priority:${lead.priority}`,
      ],
    },
    opportunityPreview: {
      title: `${contactName} - ${lead.service_type.replace(/_/g, " ")} lead`,
      monetaryValue: lead.estimated_value,
      status: lead.status,
      priority: lead.priority,
      serviceType: lead.service_type,
    },
    weathertechMetadata: {
      leadId: lead.id,
      companyId: lead.company_id,
      companyName: company.name,
      customerId: lead.customer_id,
      customerName: customer?.display_name ?? customer?.contact_name ?? null,
      source: getTrimmedValue(lead.source) ?? "WeatherTech OS",
      nextFollowUp: lead.next_follow_up,
      notesIncluded: Boolean(getTrimmedValue(lead.notes)),
    },
    safety: {
      communicationsSent: false,
      automationTriggered: false,
      workflowsTriggered: false,
      campaignsTriggered: false,
    },
  };
}

export function prepareGoHighLevelLeadContactDryRun({
  lead,
  company,
  customer = null,
}: {
  lead: LeadRecord;
  company: CompanyRecord;
  customer?: CustomerRecord | null;
}): GoHighLevelLeadContactDryRunPreview {
  const config = getGoHighLevelServerConfig();
  const location = getGoHighLevelLocationForCompany(company, config);
  const requiredFields = [
    "GHL_PRIVATE_INTEGRATION_TOKEN",
    location.envVar,
    "contact_name",
    "phone_or_email",
    "property_address",
    "state",
  ];
  const missingFields: string[] = [];

  if (!config.tokenConfigured) {
    missingFields.push("GHL_PRIVATE_INTEGRATION_TOKEN");
  }

  if (!location.locationId) {
    missingFields.push(location.envVar);
  }

  if (!getTrimmedValue(lead.contact_name)) {
    missingFields.push("contact_name");
  }

  if (!getTrimmedValue(lead.phone) && !getTrimmedValue(lead.email)) {
    missingFields.push("phone_or_email");
  }

  if (!getTrimmedValue(lead.property_address)) {
    missingFields.push("property_address");
  }

  if (!getTrimmedValue(lead.state)) {
    missingFields.push("state");
  }

  const payload =
    location.locationId &&
    getTrimmedValue(lead.contact_name) &&
    (getTrimmedValue(lead.phone) || getTrimmedValue(lead.email)) &&
    getTrimmedValue(lead.property_address) &&
    getTrimmedValue(lead.state)
      ? buildGoHighLevelLeadContactPayload({
          lead,
          company,
          customer,
          location: { ...location, locationId: location.locationId },
        })
      : null;
  const requestFingerprint = payload
    ? createGoHighLevelPayloadFingerprint(payload)
    : null;
  const missingConfig = missingFields.some((field) => field.startsWith("GHL_"));
  const status = missingFields.length
    ? missingConfig
      ? "missing_config"
      : "validation_failed"
    : "validated";

  return {
    ok: status === "validated",
    dryRun: true,
    communicationsSent: false,
    automationTriggered: false,
    status,
    message:
      status === "validated"
        ? "Dry-run lead/contact payload validated. Nothing was sent to GoHighLevel."
        : missingConfig
          ? "Dry-run payload prepared, but GoHighLevel server configuration is incomplete."
          : "Dry-run lead/contact payload is missing required lead fields.",
    tokenConfigured: config.tokenConfigured,
    requiredFields,
    missingFields,
    location: {
      key: location.key,
      label: location.label,
      envVar: location.envVar,
      locationId: location.locationId,
      configured: location.configured,
    },
    payload,
    requestFingerprint,
    checkedAt: new Date().toISOString(),
    nextStep:
      status === "validated"
        ? "Owner approval is still required before enabling real GoHighLevel contact writes or automations."
        : "Complete the missing fields and rerun the dry-run check.",
  };
}

function getLocationName(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const locationPayload = payload as GoHighLevelLocationResponse;
  const nestedName = locationPayload.location?.name;

  if (typeof nestedName === "string" && nestedName.trim()) {
    return nestedName.trim();
  }

  if (typeof locationPayload.name === "string" && locationPayload.name.trim()) {
    return locationPayload.name.trim();
  }

  return null;
}

function createSkippedProbe(
  location: GoHighLevelConfiguredLocation,
  message: string,
): GoHighLevelLocationProbeResult {
  return {
    ...location,
    readCheck: "skipped",
    statusCode: null,
    message,
    locationName: null,
  };
}

export function createGoHighLevelServerClient(token: string) {
  async function probeLocation(
    location: GoHighLevelConfiguredLocation,
  ): Promise<GoHighLevelLocationProbeResult> {
    if (!location.locationId) {
      return createSkippedProbe(location, "Location ID is not configured.");
    }

    try {
      const response = await fetch(
        `${GHL_API_BASE_URL}/locations/${encodeURIComponent(location.locationId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            Version: GHL_API_VERSION,
          },
          cache: "no-store",
        },
      );

      if (response.ok) {
        const payload: unknown = await response.json().catch(() => null);

        return {
          ...location,
          readCheck: "ok",
          statusCode: response.status,
          message: "Read-only location check succeeded.",
          locationName: getLocationName(payload),
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          ...location,
          readCheck: "unauthorized",
          statusCode: response.status,
          message: "GoHighLevel rejected the configured token for this location.",
          locationName: null,
        };
      }

      if (response.status === 404 || response.status === 405) {
        return {
          ...location,
          readCheck: "unsupported",
          statusCode: response.status,
          message: "Read-only location lookup is unavailable for this configuration.",
          locationName: null,
        };
      }

      return {
        ...location,
        readCheck: "error",
        statusCode: response.status,
        message: `GoHighLevel read-only check returned HTTP ${response.status}.`,
        locationName: null,
      };
    } catch (error) {
      return {
        ...location,
        readCheck: "error",
        statusCode: null,
        message:
          error instanceof Error
            ? error.message
            : "GoHighLevel read-only check failed.",
        locationName: null,
      };
    }
  }

  return { probeLocation };
}

export async function testGoHighLevelConnection({
  includeReadProbe = false,
}: TestConnectionOptions = {}): Promise<GoHighLevelConnectionTestResult> {
  const config = getGoHighLevelServerConfig();
  const requiredEnvVars = [...GHL_REQUIRED_ENV_VARS];

  if (!config.token) {
    return {
      ok: false,
      dryRun: true,
      communicationsSent: false,
      status: "missing_token",
      message: "Missing server-only GoHighLevel token.",
      tokenConfigured: false,
      requiredEnvVars,
      configuredLocationIds: config.configuredLocationIds,
      locations: config.locations.map((location) =>
        createSkippedProbe(location, "Token is not configured."),
      ),
      apiBaseUrl: config.apiBaseUrl,
      checkedAt: new Date().toISOString(),
      nextStep: "Add GHL_PRIVATE_INTEGRATION_TOKEN on the server.",
    };
  }

  const missingLocations = config.locations.filter((location) => !location.configured);

  if (missingLocations.length) {
    return {
      ok: false,
      dryRun: true,
      communicationsSent: false,
      status: "missing_location",
      message: `Missing GoHighLevel location ID${missingLocations.length === 1 ? "" : "s"} for ${missingLocations.map((location) => location.label).join(" and ")}.`,
      tokenConfigured: true,
      requiredEnvVars,
      configuredLocationIds: config.configuredLocationIds,
      locations: config.locations.map((location) =>
        createSkippedProbe(location, "Location ID is not configured."),
      ),
      apiBaseUrl: config.apiBaseUrl,
      checkedAt: new Date().toISOString(),
      nextStep: "Add GHL_LOCATION_ID_WEATHERTECH and GHL_LOCATION_ID_IHC.",
    };
  }

  const client = createGoHighLevelServerClient(config.token);
  const locations = includeReadProbe
    ? await Promise.all(config.locations.map((location) => client.probeLocation(location)))
    : config.locations.map((location) =>
        createSkippedProbe(location, "Read-only API check was not requested."),
      );
  const probedLocations = locations.filter((location) => location.configured);
  const unauthorized = probedLocations.some(
    (location) => location.readCheck === "unauthorized",
  );
  const readErrors = probedLocations.some((location) => location.readCheck === "error");
  const unsupported = probedLocations.some(
    (location) => location.readCheck === "unsupported",
  );
  const allConfiguredChecksPassed =
    !includeReadProbe ||
    probedLocations.every(
      (location) =>
        location.readCheck === "ok" || location.readCheck === "unsupported",
    );

  return {
    ok: allConfiguredChecksPassed,
    dryRun: true,
    communicationsSent: false,
    status: unauthorized
      ? "auth_failed"
      : readErrors || unsupported
        ? "read_check_unavailable"
        : "ready",
    message: unauthorized
      ? "GoHighLevel rejected the configured token. No customer communications were sent."
      : readErrors
        ? "GoHighLevel configuration is present, but the read-only check failed."
        : unsupported
          ? "GoHighLevel configuration is present; read-only location lookup is unavailable."
          : includeReadProbe
            ? "GoHighLevel server configuration and read-only check passed. No customer communications were sent."
            : "GoHighLevel server configuration is present. No customer communications were sent.",
    tokenConfigured: true,
    requiredEnvVars,
    configuredLocationIds: config.configuredLocationIds,
    locations,
    apiBaseUrl: config.apiBaseUrl,
    checkedAt: new Date().toISOString(),
    nextStep: "Add approved lead sync and sync logging when ready.",
  };
}
