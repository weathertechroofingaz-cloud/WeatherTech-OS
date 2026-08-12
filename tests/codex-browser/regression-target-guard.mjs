const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export const BROWSER_REGRESSION_REMOTE_WRITE_FLAG =
  "WTOS_BROWSER_REGRESSION_REMOTE_WRITES_ENABLED";
export const BROWSER_REGRESSION_EXPECTED_PROJECT_REF =
  "WTOS_BROWSER_REGRESSION_EXPECTED_PROJECT_REF";
export const WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF =
  "gahfcgyjtfwwmsterhzu";

function parseUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }
}

function isLocalHostname(hostname) {
  return LOCAL_HOSTNAMES.has(hostname.toLowerCase());
}

function getHostedSupabaseProjectRef(url) {
  const match = url.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function isSupabaseApiResource(url) {
  return /^\/(?:auth|rest|storage|realtime|functions|graphql)\/v1(?:\/|$)/.test(
    url.pathname,
  );
}

function getSupabaseResourceOrigin(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!isSupabaseApiResource(url)) {
    return null;
  }

  if (!isLocalHostname(url.hostname) && !getHostedSupabaseProjectRef(url)) {
    return null;
  }

  return url.origin.toLowerCase();
}

function decodeJwtPayload(value) {
  const parts = value.split(".");

  if (parts.length !== 3) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function assertServiceCredentialMatchesTarget(serviceRoleKey, projectRef) {
  const credential = serviceRoleKey.trim();

  if (!credential) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for data-writing browser regression.",
    );
  }

  if (credential.startsWith("sb_secret_")) {
    return;
  }

  const payload = decodeJwtPayload(credential);

  if (!payload || payload.role !== "service_role") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not a recognized Supabase service-role credential.",
    );
  }

  if (
    projectRef &&
    typeof payload.ref === "string" &&
    payload.ref.toLowerCase() !== projectRef
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY belongs to a different Supabase project than NEXT_PUBLIC_SUPABASE_URL.",
    );
  }
}

export function buildRegressionRunMarker(runId, testPrefix = "TEST WTOS REGRESSION") {
  if (!/^\d{17}$/.test(runId)) {
    throw new Error("Browser regression cleanup requires an exact 17-digit run id.");
  }

  return `${testPrefix} ${runId}`;
}

export function assertRegressionCleanupSafe({ payments = [], stripeMappings = [] } = {}) {
  const hasStripePayment = payments.some((payment) => {
    const method = String(payment?.method ?? "").trim().toLowerCase();
    const reference = String(payment?.reference ?? "").trim().toLowerCase();

    return (
      method === "stripe" ||
      reference.startsWith("pi_") ||
      reference.startsWith("ch_") ||
      reference.startsWith("re_")
    );
  });

  if (hasStripePayment || stripeMappings.length > 0) {
    throw new Error(
      "Browser regression cleanup refused to delete a Stripe-linked payment or invoice.",
    );
  }
}

export function assertBrowserResourceTarget({ resourceUrls = [], target } = {}) {
  if (!target?.supabaseOrigin || !target?.kind || !target?.projectRef) {
    throw new Error("Browser regression requires a fully guarded Supabase target.");
  }

  const expectedUrl = parseUrl(
    target.supabaseOrigin,
    "Guarded Supabase resource origin",
  );
  const expectedOrigin = expectedUrl.origin.toLowerCase();
  const expectedHostedProjectRef = getHostedSupabaseProjectRef(expectedUrl);

  if (
    (target.kind === "local" && !isLocalHostname(expectedUrl.hostname)) ||
    (target.kind === "hosted_non_production" &&
      expectedHostedProjectRef !== target.projectRef)
  ) {
    throw new Error(
      "Guarded Supabase target metadata does not match its expected origin.",
    );
  }

  const resourceOrigins = new Set(
    resourceUrls.map(getSupabaseResourceOrigin).filter(Boolean),
  );

  if (resourceOrigins.size === 0) {
    throw new Error(
      "The local app loaded no identifiable Supabase API resource; refusing database writes.",
    );
  }

  if (resourceOrigins.size > 1) {
    throw new Error(
      "The local app loaded multiple Supabase API origins; refusing database writes.",
    );
  }

  const [actualOrigin] = resourceOrigins;

  if (actualOrigin !== expectedOrigin) {
    throw new Error(
      "The local app Supabase API origin does not match the guarded target; refusing database writes.",
    );
  }

  return {
    supabaseOrigin: actualOrigin,
    projectRef: target.projectRef,
  };
}

export function assertBrowserRegressionTarget({
  baseUrl,
  supabaseUrl,
  serviceRoleKey,
  runtimeEnv = {},
  productionProjectRefs = [WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF],
} = {}) {
  const appUrl = parseUrl(baseUrl, "Browser regression base URL");

  if (!isLocalHostname(appUrl.hostname)) {
    throw new Error(
      "Data-writing browser regression is restricted to a locally served application.",
    );
  }

  const targetUrl = parseUrl(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
  const hostedProjectRef = getHostedSupabaseProjectRef(targetUrl);
  const isLocalTarget = isLocalHostname(targetUrl.hostname);

  if (!isLocalTarget && !hostedProjectRef) {
    throw new Error(
      "Browser regression requires local Supabase or an explicitly authorized hosted Supabase project.",
    );
  }

  const normalizedProductionRefs = new Set(
    [WEATHERTECH_PRODUCTION_SUPABASE_PROJECT_REF, ...productionProjectRefs]
      .filter(Boolean)
      .map((value) => value.trim().toLowerCase()),
  );

  if (hostedProjectRef && normalizedProductionRefs.has(hostedProjectRef)) {
    throw new Error(
      `Browser regression is permanently blocked from WeatherTech OS production Supabase project ${hostedProjectRef}.`,
    );
  }

  assertServiceCredentialMatchesTarget(serviceRoleKey ?? "", hostedProjectRef);

  if (isLocalTarget) {
    return {
      kind: "local",
      projectRef: "local",
      supabaseOrigin: targetUrl.origin.toLowerCase(),
    };
  }

  const remoteWritesEnabled =
    runtimeEnv[BROWSER_REGRESSION_REMOTE_WRITE_FLAG]?.trim() === "true";
  const expectedProjectRef =
    runtimeEnv[BROWSER_REGRESSION_EXPECTED_PROJECT_REF]?.trim().toLowerCase() ?? "";

  if (!remoteWritesEnabled || expectedProjectRef !== hostedProjectRef) {
    throw new Error(
      `Hosted browser regression requires ${BROWSER_REGRESSION_REMOTE_WRITE_FLAG}=true and ${BROWSER_REGRESSION_EXPECTED_PROJECT_REF} set to the exact non-production project reference.`,
    );
  }

  return {
    kind: "hosted_non_production",
    projectRef: hostedProjectRef,
    supabaseOrigin: targetUrl.origin.toLowerCase(),
  };
}
