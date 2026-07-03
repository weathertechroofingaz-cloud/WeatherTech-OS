const GHL_API_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

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
  const requiredEnvVars = [
    "GHL_PRIVATE_INTEGRATION_TOKEN",
    "GHL_LOCATION_ID_WEATHERTECH",
    "GHL_LOCATION_ID_IHC",
  ];

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
