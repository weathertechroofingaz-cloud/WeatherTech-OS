import { NextRequest, NextResponse } from "next/server";
import {
  goHighLevelLiveSyncStatusLabels,
  goHighLevelOAuthBridgeMigration,
  goHighLevelOAuthEndpoints,
  goHighLevelOAuthGuardrails,
  goHighLevelOAuthScopes,
  goHighLevelSyncResources,
  type GoHighLevelLiveSyncStatus,
} from "../../../../../lib/gohighlevel/foundation";
import {
  GOHIGHLEVEL_API_BASE_URL,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
  validateGoHighLevelGrantedScopes,
} from "../../../../../lib/gohighlevel/oauth";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schemaTables = [
  "gohighlevel_sync_mappings",
  "gohighlevel_discovery_snapshots",
  "gohighlevel_oauth_states",
  "gohighlevel_oauth_credentials",
  "gohighlevel_resource_snapshots",
  "gohighlevel_webhook_events",
] as const;

async function checkGoHighLevelSchemaReadiness(
  serviceClient: NonNullable<ReturnType<typeof createGoHighLevelServiceClient>>,
) {
  const tables = [];

  for (const table of schemaTables) {
    const { error } = await serviceClient
      .from(table)
      .select(
        table === "gohighlevel_oauth_credentials"
          ? "id, bridge_version"
          : "id",
      )
      .limit(1);
    tables.push({
      table,
      available: !error,
      message: error ? "Table is not available yet." : "Table is available.",
    });
  }

  const applied = tables.every((table) => table.available);
  return {
    checked: true,
    applied,
    migration: goHighLevelOAuthBridgeMigration,
    tables,
    message: applied
      ? "GoHighLevel OAuth and communications bridge tables are available."
      : "Apply the prepared GoHighLevel OAuth communications bridge migration.",
  };
}

export async function GET(_request: NextRequest) {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createGoHighLevelServiceClient();
  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before checking HighLevel readiness." },
      { status: 401 },
    );
  }

  const { data: ownerMemberships } = await sessionClient
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userResult.user.id)
    .eq("role", "owner");
  const companyIds = Array.from(
    new Set((ownerMemberships ?? []).map((membership) => membership.company_id)),
  );
  if (!companyIds.length) {
    return NextResponse.json(
      { ok: false, message: "A company owner must check HighLevel readiness." },
      { status: 403 },
    );
  }

  const config = getGoHighLevelOAuthConfig();
  const schema = await checkGoHighLevelSchemaReadiness(serviceClient);
  const [{ data: companies }, { data: connections }, { data: credentials }] =
    await Promise.all([
      serviceClient.from("companies").select("id, name").in("id", companyIds),
      serviceClient
        .from("integration_connections")
        .select("*")
        .eq("provider", "gohighlevel")
        .in("company_id", companyIds),
      schema.applied
        ? serviceClient
            .from("gohighlevel_oauth_credentials")
            .select("company_id, integration_connection_id, external_location_id, scopes, token_expires_at, revoked_at")
            .in("company_id", companyIds)
            .is("revoked_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);

  const companyNames = new Map(
    (companies ?? []).map((company) => [company.id, company.name]),
  );
  const connected = (connections ?? []).filter(
    (connection) => connection.status === "connected" && connection.external_account_id,
  );
  const activeCredentials = credentials ?? [];
  const authenticatedConnectionIds = new Set(
    activeCredentials.map((credential) => credential.integration_connection_id),
  );
  const authenticated = connected.filter((connection) =>
    authenticatedConnectionIds.has(connection.id),
  );
  const allScopesValid = activeCredentials.every(
    (credential) => validateGoHighLevelGrantedScopes(credential.scopes).ok,
  );

  let status: GoHighLevelLiveSyncStatus = "credentials_required";
  if (config.ok && schema.applied && authenticated.length) {
    status = config.syncEnabled ? "ready_to_sync" : "connected";
  } else if (config.ok && schema.applied) {
    status = "not_connected";
  } else if (config.ok && !schema.applied) {
    status = "validation_failed";
  }

  const ok =
    config.ok &&
    schema.applied &&
    authenticated.length > 0 &&
    allScopesValid;
  const message = !config.ok
    ? "GoHighLevel Marketplace OAuth configuration is incomplete."
    : !schema.applied
      ? schema.message
      : !authenticated.length
        ? "Marketplace OAuth is configured; connect a HighLevel location to a company."
        : !allScopesValid
          ? "A connected HighLevel token does not match the approved scope set."
          : config.syncEnabled
            ? "HighLevel Marketplace OAuth is authenticated and read-only synchronization is enabled."
            : "HighLevel Marketplace OAuth is authenticated; inbound synchronization remains disabled.";

  const locations = connected.map((connection) => ({
    key: connection.company_id,
    label: companyNames.get(connection.company_id) ?? "WeatherTech OS company",
    envVar: "Marketplace OAuth",
    locationId: connection.external_account_id,
    configured: true,
    readCheck: authenticatedConnectionIds.has(connection.id) ? "ok" : "unauthorized",
    statusCode: null,
    message: authenticatedConnectionIds.has(connection.id)
      ? "Encrypted location-scoped OAuth credential is stored."
      : "This company mapping needs OAuth authorization.",
    locationName: connection.display_name,
  }));

  return NextResponse.json({
    ok,
    dryRun: false,
    communicationsSent: false,
    automationTriggered: false,
    liveSyncEnabled: config.syncEnabled,
    status,
    statusLabel: goHighLevelLiveSyncStatusLabels[status],
    message,
    tokenConfigured: activeCredentials.length > 0,
    requiredEnvVars: config.missing,
    configuredLocationIds: connected
      .map((connection) => connection.external_account_id)
      .filter((value): value is string => Boolean(value)),
    apiBaseUrl: GOHIGHLEVEL_API_BASE_URL,
    checkedAt: new Date().toISOString(),
    accountMetadata: {
      authMethod: "marketplace_oauth",
      oauthSupported: true,
      accessMode: "read_only",
      webhookVerification: "ed25519_with_rsa_legacy_fallback",
    },
    locations,
    pipelines: [],
    syncResources: goHighLevelSyncResources,
    phaseOneGuardrails: goHighLevelOAuthGuardrails,
    migration: {
      required: goHighLevelOAuthBridgeMigration,
      applied: schema.applied,
      checked: true,
      message: schema.message,
    },
    schema,
    syncResourceCount: goHighLevelSyncResources.length,
    oauth: {
      configured: config.ok,
      missing: config.missing,
      malformed: config.malformed,
      syncEnabled: config.syncEnabled,
      scopes: [...goHighLevelOAuthScopes],
      endpoints: goHighLevelOAuthEndpoints,
      authenticatedLocationCount: authenticated.length,
      connectedLocationCount: connected.length,
      encryptedCredentialCount: activeCredentials.length,
      allScopesValid,
    },
    nextStep: ok
      ? config.syncEnabled
        ? "Run an owner-approved inbound synchronization for each mapped company."
        : "Set GHL_SYNC_ENABLED=true only when the owner is ready to ingest provider data."
      : "Complete the reported Marketplace OAuth readiness item.",
  });
}
