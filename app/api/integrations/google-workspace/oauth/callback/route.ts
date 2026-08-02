import { NextRequest, NextResponse } from "next/server";
import {
  createServiceSupabaseClient,
  encryptGoogleToken,
  exchangeGoogleOAuthCode,
  fetchGmailProfile,
  GMAIL_OAUTH_EVENT_TYPE,
  hashGoogleOAuthState,
} from "../../../../../../lib/googleWorkspace/serverClient";
import { googleWorkspaceEnvVars } from "../../../../../../lib/crm/integrations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeRedirectUrl(request: NextRequest, redirectPath: string, params: Record<string, string>) {
  const safePath =
    redirectPath && redirectPath.startsWith("/") && !redirectPath.startsWith("//")
      ? redirectPath
      : "/?view=integrations";
  const url = new URL(safePath, request.nextUrl.origin);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

async function recordOAuthFailure({
  serviceClient,
  stateId,
  companyId,
  message,
  requestFingerprint,
}: {
  serviceClient: NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
  stateId: string | null;
  companyId: string | null;
  message: string;
  requestFingerprint: string | null;
}) {
  if (stateId) {
    await serviceClient
      .from("gmail_oauth_states")
      .update({ failure_reason: message })
      .eq("id", stateId);
  }

  if (companyId) {
    await serviceClient.from("integration_sync_logs").insert({
      company_id: companyId,
      provider: "gmail",
      direction: "provider_to_weathertech",
      event_type: GMAIL_OAUTH_EVENT_TYPE,
      status: "failed",
      request_fingerprint: requestFingerprint,
      request_summary: { oauthCallback: true },
      response_summary: { connected: false },
      error_code: "gmail_oauth_failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    });
  }
}

export async function GET(request: NextRequest) {
  const serviceClient = createServiceSupabaseClient();
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const oauthError = request.nextUrl.searchParams.get("error");
  const stateHash = state ? hashGoogleOAuthState(state) : null;

  if (!serviceClient || !stateHash) {
    return NextResponse.redirect(
      safeRedirectUrl(request, "/?view=integrations", {
        gmail: "error",
        reason: "oauth_state_missing",
      }),
    );
  }

  const { data: stateRecord } = await serviceClient
    .from("gmail_oauth_states")
    .select("*")
    .eq("state_hash", stateHash)
    .maybeSingle();
  const redirectPath = stateRecord?.redirect_path ?? "/?view=integrations";

  if (!stateRecord || stateRecord.consumed_at) {
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "oauth_state_invalid",
      }),
    );
  }

  if (new Date(stateRecord.expires_at).getTime() <= Date.now()) {
    await recordOAuthFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      message: "Google OAuth state expired.",
      requestFingerprint: stateHash,
    });
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "oauth_state_expired",
      }),
    );
  }

  if (oauthError || !code) {
    await recordOAuthFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      message: oauthError ?? "Google OAuth callback did not include a code.",
      requestFingerprint: stateHash,
    });
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "oauth_denied",
      }),
    );
  }

  const exchange = await exchangeGoogleOAuthCode({
    code,
    codeVerifier: stateRecord.code_verifier,
  });

  if (!exchange.ok || !exchange.payload) {
    await recordOAuthFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      message: exchange.error,
      requestFingerprint: stateHash,
    });
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "oauth_exchange_failed",
      }),
    );
  }

  const accessToken = String(exchange.payload.access_token);
  const profile = await fetchGmailProfile({ accessToken });

  if (!profile.ok) {
    await recordOAuthFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      message: profile.error,
      requestFingerprint: stateHash,
    });
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "profile_failed",
      }),
    );
  }

  const expiresIn =
    typeof exchange.payload.expires_in === "number" ? exchange.payload.expires_in : 3600;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const scopes =
    typeof exchange.payload.scope === "string"
      ? exchange.payload.scope.split(/\s+/).filter(Boolean)
      : stateRecord.requested_scopes;
  const refreshToken =
    typeof exchange.payload.refresh_token === "string"
      ? exchange.payload.refresh_token
      : null;
  const { data: existingConnection } = await serviceClient
    .from("integration_connections")
    .select("*")
    .eq("company_id", stateRecord.company_id)
    .eq("provider", "gmail")
    .eq("account_email", profile.emailAddress)
    .maybeSingle();
  const connectionPayload = {
    company_id: stateRecord.company_id,
    provider: "gmail" as const,
    status: "connected" as const,
    account_email: profile.emailAddress,
    display_name: stateRecord.mailbox_label ?? "Gmail mailbox",
    external_account_id: profile.providerAccountId,
    provider_account_id: profile.providerAccountId,
    scopes,
    sync_direction: "two_way" as const,
    sync_token: profile.historyId,
    token_expires_at: tokenExpiresAt,
    last_sync_at: null,
    last_successful_sync_at: null,
    last_failure_at: null,
    last_error: null,
    settings: {
      oauthCallbackPath: googleWorkspaceEnvVars.oauthCallbackPath,
      sendEnabled: false,
    },
  };
  const { data: connection, error: connectionError } = existingConnection
    ? await serviceClient
        .from("integration_connections")
        .update(connectionPayload)
        .eq("id", existingConnection.id)
        .select("*")
        .single()
    : await serviceClient
        .from("integration_connections")
        .insert(connectionPayload)
        .select("*")
        .single();

  if (connectionError || !connection) {
    await recordOAuthFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      message: "Could not save the Gmail integration connection.",
      requestFingerprint: stateHash,
    });
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "connection_save_failed",
      }),
    );
  }

  const { data: existingCredential } = await serviceClient
    .from("gmail_mailbox_credentials")
    .select("*")
    .eq("integration_connection_id", connection.id)
    .maybeSingle();
  const encryptedRefreshToken = refreshToken
    ? encryptGoogleToken(refreshToken)
    : existingCredential?.encrypted_refresh_token ?? null;

  if (!encryptedRefreshToken) {
    await recordOAuthFailure({
      serviceClient,
      stateId: stateRecord.id,
      companyId: stateRecord.company_id,
      message: "Google did not return a refresh token. Reconnect the mailbox with consent.",
      requestFingerprint: stateHash,
    });
    return NextResponse.redirect(
      safeRedirectUrl(request, redirectPath, {
        gmail: "error",
        reason: "refresh_token_missing",
      }),
    );
  }

  await serviceClient.from("gmail_mailbox_credentials").upsert(
    {
      company_id: stateRecord.company_id,
      integration_connection_id: connection.id,
      account_email: profile.emailAddress,
      provider_account_id: profile.providerAccountId,
      encrypted_access_token: encryptGoogleToken(accessToken),
      encrypted_refresh_token: encryptedRefreshToken,
      token_type:
        typeof exchange.payload.token_type === "string" ? exchange.payload.token_type : "Bearer",
      scopes,
      token_expires_at: tokenExpiresAt,
      last_refreshed_at: new Date().toISOString(),
      revoked_at: null,
    },
    { onConflict: "integration_connection_id" },
  );
  await serviceClient
    .from("gmail_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", stateRecord.id);
  await serviceClient.from("integration_sync_logs").insert({
    company_id: stateRecord.company_id,
    integration_connection_id: connection.id,
    provider: "gmail",
    direction: "provider_to_weathertech",
    event_type: GMAIL_OAUTH_EVENT_TYPE,
    status: "succeeded",
    request_fingerprint: stateHash,
    request_summary: {
      oauthCallback: true,
      scopesRequested: stateRecord.requested_scopes.length,
    },
    response_summary: {
      connected: true,
      accountEmail: profile.emailAddress,
      providerAccountId: profile.providerAccountId,
      historyIdStored: Boolean(profile.historyId),
      tokensEncrypted: true,
    },
    completed_at: new Date().toISOString(),
  });

  return NextResponse.redirect(
    safeRedirectUrl(request, redirectPath, {
      gmail: "connected",
    }),
  );
}
