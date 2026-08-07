import { NextRequest, NextResponse } from "next/server";
import {
  GOHIGHLEVEL_API_BASE_URL,
  GOHIGHLEVEL_API_VERSION,
  GOHIGHLEVEL_OAUTH_EVENT_TYPE,
  GOHIGHLEVEL_OAUTH_STATE_COOKIE,
  createGoHighLevelServiceClient,
  describeGoHighLevelScopeMismatch,
  encryptGoHighLevelToken,
  exchangeGoHighLevelOAuthCode,
  exchangeGoHighLevelLocationToken,
  getGoHighLevelTokenExpiry,
  hashGoHighLevelOAuthState,
  goHighLevelOAuthEndpoints,
  resolveGoHighLevelCompanyLocation,
  validateGoHighLevelGrantedScopes,
} from "../../../../../lib/gohighlevel/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeRedirectUrl(
  request: NextRequest,
  redirectPath: string,
  params: Record<string, string>,
) {
  const safePath =
    redirectPath.startsWith("/") && !redirectPath.startsWith("//")
      ? redirectPath
      : "/?view=integrations";
  const url = new URL(safePath, request.nextUrl.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function redirectAndClearState(
  request: NextRequest,
  redirectPath: string,
  params: Record<string, string>,
) {
  const response = NextResponse.redirect(safeRedirectUrl(request, redirectPath, params));
  response.cookies.set(GOHIGHLEVEL_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: goHighLevelOAuthEndpoints.callback,
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function recordFailure({
  serviceClient,
  stateId,
  companyId,
  stateHash,
  message,
}: {
  serviceClient: NonNullable<ReturnType<typeof createGoHighLevelServiceClient>>;
  stateId: string | null;
  companyId: string | null;
  stateHash: string | null;
  message: string;
}) {
  if (stateId) {
    await serviceClient
      .from("gohighlevel_oauth_states")
      .update({ failure_reason: message })
      .eq("id", stateId);
  }
  if (companyId) {
    await serviceClient.from("integration_sync_logs").insert({
      company_id: companyId,
      provider: "gohighlevel",
      direction: "provider_to_weathertech",
      event_type: GOHIGHLEVEL_OAUTH_EVENT_TYPE,
      status: "failed",
      request_fingerprint: stateHash,
      request_summary: { oauthCallback: true },
      response_summary: { connected: false },
      error_code: "gohighlevel_oauth_failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    });
  }
}

function getLocationName(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const nested =
    record.location && typeof record.location === "object"
      ? (record.location as Record<string, unknown>)
      : null;
  const value = nested?.name ?? record.name;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : null;
}

export async function GET(request: NextRequest) {
  const serviceClient = createGoHighLevelServiceClient();
  const cookieState = request.cookies.get(GOHIGHLEVEL_OAUTH_STATE_COOKIE)?.value ?? null;
  const queryState = request.nextUrl.searchParams.get("state");
  const state = cookieState ?? queryState;
  const stateHash = state ? hashGoHighLevelOAuthState(state) : null;

  if (!serviceClient || !state || !stateHash || (cookieState && queryState && cookieState !== queryState)) {
    return redirectAndClearState(request, "/?view=integrations", {
      gohighlevel: "error",
      reason: "oauth_state_invalid",
    });
  }

  const { data: stateRecord } = await serviceClient
    .from("gohighlevel_oauth_states")
    .select("*")
    .eq("state_hash", stateHash)
    .maybeSingle();
  const redirectPath = stateRecord?.redirect_path ?? "/?view=integrations";

  if (!stateRecord || stateRecord.consumed_at) {
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "oauth_state_invalid",
    });
  }

  if (new Date(stateRecord.expires_at).getTime() <= Date.now()) {
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: "HighLevel OAuth state expired.",
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "oauth_state_expired",
    });
  }

  const { data: claimedState, error: claimError } = await serviceClient
    .from("gohighlevel_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", stateRecord.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimedState) {
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "oauth_state_invalid",
    });
  }

  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError || !code) {
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: providerError ? "HighLevel authorization was denied." : "HighLevel callback did not include a code.",
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "oauth_denied",
    });
  }

  const exchange = await exchangeGoHighLevelOAuthCode({ code });
  if (!exchange.ok) {
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: exchange.error,
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "oauth_exchange_failed",
    });
  }

  let tokenPayload = exchange.payload;
  let locationResolutionSource:
    | "location_token"
    | "approved_locations"
    | "installed_locations" = "location_token";
  if (tokenPayload.userType === "Company") {
    if (!tokenPayload.companyId) {
      await recordFailure({
        serviceClient,
        stateId: stateRecord.id,
        companyId: stateRecord.company_id,
        stateHash,
        message: "HighLevel did not return an installing agency identifier.",
      });
      return redirectAndClearState(request, redirectPath, {
        gohighlevel: "error",
        reason: "oauth_company_invalid",
      });
    }

    const locationResolution = await resolveGoHighLevelCompanyLocation({
      accessToken: tokenPayload.accessToken,
      companyId: tokenPayload.companyId,
      approvedLocationIds: tokenPayload.approvedLocations,
    });
    if (!locationResolution.ok) {
      await recordFailure({
        serviceClient,
        stateId: stateRecord.id,
        companyId: stateRecord.company_id,
        stateHash,
        message: locationResolution.error,
      });
      return redirectAndClearState(request, redirectPath, {
        gohighlevel: "error",
        reason:
          locationResolution.reason === "discovery_failed"
            ? "oauth_installed_location_discovery_failed"
            : "oauth_approved_location_invalid",
      });
    }
    const approvedLocationId = locationResolution.locationId;
    locationResolutionSource = locationResolution.source;

    const locationExchange = await exchangeGoHighLevelLocationToken({
      accessToken: tokenPayload.accessToken,
      companyId: tokenPayload.companyId,
      locationId: approvedLocationId,
    });
    if (!locationExchange.ok) {
      await recordFailure({
        serviceClient,
        stateId: stateRecord.id,
        companyId: stateRecord.company_id,
        stateHash,
        message: locationExchange.error,
      });
      return redirectAndClearState(request, redirectPath, {
        gohighlevel: "error",
        reason: "oauth_location_exchange_failed",
      });
    }
    tokenPayload = locationExchange.payload;
  }

  const scopeValidation = validateGoHighLevelGrantedScopes(tokenPayload.scopes);
  if (
    !scopeValidation.ok ||
    tokenPayload.userType !== "Location" ||
    !tokenPayload.locationId
  ) {
    const message = !scopeValidation.ok
      ? describeGoHighLevelScopeMismatch(scopeValidation)
      : "HighLevel did not return a location-scoped token.";
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message,
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "oauth_scope_or_location_invalid",
    });
  }

  const locationId = tokenPayload.locationId;
  const { data: existingLocationCredential } = await serviceClient
    .from("gohighlevel_oauth_credentials")
    .select("company_id, integration_connection_id")
    .eq("external_location_id", locationId)
    .maybeSingle();
  if (
    existingLocationCredential &&
    existingLocationCredential.company_id !== stateRecord.company_id
  ) {
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: "This HighLevel location is already mapped to another WeatherTech OS company.",
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "location_company_conflict",
    });
  }

  const locationResponse = await fetch(
    `${GOHIGHLEVEL_API_BASE_URL}/locations/${encodeURIComponent(locationId)}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${tokenPayload.accessToken}`,
        Version: GOHIGHLEVEL_API_VERSION,
      },
      cache: "no-store",
    },
  ).catch(() => null);
  if (!locationResponse?.ok) {
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: "HighLevel location authentication check failed.",
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "location_probe_failed",
    });
  }
  const locationPayload: unknown = await locationResponse.json().catch(() => null);
  const locationName = getLocationName(locationPayload) ?? "HighLevel location";
  const now = new Date().toISOString();
  const tokenExpiresAt = getGoHighLevelTokenExpiry(tokenPayload.expiresIn);
  const { data: existingConnection } = await serviceClient
    .from("integration_connections")
    .select("*")
    .eq("company_id", stateRecord.company_id)
    .eq("provider", "gohighlevel")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const connectionPayload = {
    company_id: stateRecord.company_id,
    provider: "gohighlevel" as const,
    status: "connected" as const,
    account_email: null,
    display_name: locationName,
    external_account_id: locationId,
    provider_account_id: locationId,
    default_calendar_id: null,
    scopes: tokenPayload.scopes,
    sync_direction: "provider_to_weathertech" as const,
    credential_reference: null,
    token_expires_at: tokenExpiresAt,
    last_sync_at: existingConnection?.last_sync_at ?? null,
    last_successful_sync_at: now,
    last_failure_at: null,
    last_error: null,
    settings: {
      ...(existingConnection?.settings ?? {}),
      authMethod: "marketplace_oauth",
      externalCompanyId: tokenPayload.companyId,
      externalUserId: tokenPayload.userId,
      webhooksVerified: false,
      webhookVerificationMode: "ed25519_with_rsa_legacy_fallback",
      outboundMessagingEnabled: false,
      pipelineWritesEnabled: false,
    },
  };
  const connectionMutation = existingConnection
    ? serviceClient
        .from("integration_connections")
        .update(connectionPayload)
        .eq("id", existingConnection.id)
        .select("*")
        .single()
    : serviceClient
        .from("integration_connections")
        .insert(connectionPayload)
        .select("*")
        .single();
  const { data: connection, error: connectionError } = await connectionMutation;

  if (connectionError || !connection) {
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: "HighLevel company mapping could not be saved.",
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "connection_save_failed",
    });
  }

  const credentialPayload = {
    company_id: stateRecord.company_id,
    integration_connection_id: connection.id,
    external_location_id: locationId,
    external_company_id: tokenPayload.companyId,
    external_user_id: tokenPayload.userId,
    encrypted_access_token: encryptGoHighLevelToken(tokenPayload.accessToken),
    encrypted_refresh_token: encryptGoHighLevelToken(tokenPayload.refreshToken),
    token_type: tokenPayload.tokenType,
    scopes: tokenPayload.scopes,
    user_type: tokenPayload.userType,
    token_expires_at: tokenExpiresAt,
    last_refreshed_at: now,
    revoked_at: null,
  };
  const credentialMutation = existingLocationCredential
    ? serviceClient
        .from("gohighlevel_oauth_credentials")
        .update(credentialPayload)
        .eq("integration_connection_id", existingLocationCredential.integration_connection_id)
    : serviceClient.from("gohighlevel_oauth_credentials").insert(credentialPayload);
  const { error: credentialError } = await credentialMutation;

  if (credentialError) {
    await serviceClient
      .from("integration_connections")
      .update({ status: "error", last_error: "Encrypted OAuth credential could not be saved." })
      .eq("id", connection.id);
    await recordFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      stateHash,
      message: "Encrypted HighLevel OAuth credential could not be saved.",
    });
    return redirectAndClearState(request, redirectPath, {
      gohighlevel: "error",
      reason: "credential_save_failed",
    });
  }

  await serviceClient.from("integration_sync_logs").insert({
    company_id: stateRecord.company_id,
    integration_connection_id: connection.id,
    provider: "gohighlevel",
    direction: "provider_to_weathertech",
    event_type: GOHIGHLEVEL_OAUTH_EVENT_TYPE,
    status: "succeeded",
    external_id: locationId,
    request_fingerprint: stateHash,
    request_summary: { oauthCallback: true, requestedScopeCount: stateRecord.requested_scopes.length },
    response_summary: {
      connected: true,
      locationName,
      grantedScopeCount: tokenPayload.scopes.length,
      tokenStoredEncrypted: true,
      locationResolutionSource,
    },
    completed_at: now,
  });

  return redirectAndClearState(request, redirectPath, {
    gohighlevel: "connected",
    location: locationName,
  });
}
