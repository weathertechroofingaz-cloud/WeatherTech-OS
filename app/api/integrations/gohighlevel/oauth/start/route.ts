import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../../lib/supabase/server";
import {
  GOHIGHLEVEL_OAUTH_EVENT_TYPE,
  GOHIGHLEVEL_OAUTH_STATE_COOKIE,
  buildGoHighLevelAuthorizationRequest,
  createGoHighLevelOAuthState,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
  goHighLevelOAuthEndpoints,
  goHighLevelOAuthScopes,
} from "../../../../../../lib/gohighlevel/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function sanitizeRedirectPath(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 200)
    : "/?view=integrations";
}

export async function POST(request: NextRequest) {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createGoHighLevelServiceClient();
  const config = getGoHighLevelOAuthConfig();

  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "Sign in before connecting HighLevel." },
      { status: 401 },
    );
  }

  if (!config.ok) {
    return NextResponse.json(
      {
        ok: false,
        authorizationUrl: null,
        message: "GoHighLevel Marketplace OAuth configuration is incomplete.",
        missing: config.missing,
        malformed: config.malformed,
      },
      { status: 503 },
    );
  }

  const body: unknown = await request.json().catch(() => ({}));
  const requestBody = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const companyId =
    typeof requestBody.companyId === "string" && requestBody.companyId.trim()
      ? requestBody.companyId.trim()
      : null;
  if (!companyId) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "Select a company before connecting HighLevel." },
      { status: 400 },
    );
  }

  const [{ data: company }, { data: ownerMembership }] = await Promise.all([
    sessionClient.from("companies").select("id, name").eq("id", companyId).maybeSingle(),
    sessionClient
      .from("company_memberships")
      .select("user_id, company_id, role")
      .eq("company_id", companyId)
      .eq("user_id", userResult.user.id)
      .eq("role", "owner")
      .maybeSingle(),
  ]);

  if (!company) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "The selected company is unavailable." },
      { status: 404 },
    );
  }

  if (!ownerMembership) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "A company owner must authorize HighLevel." },
      { status: 403 },
    );
  }

  const state = createGoHighLevelOAuthState();
  const authorization = buildGoHighLevelAuthorizationRequest({ rawState: state.rawState });
  const redirectPath = sanitizeRedirectPath(requestBody.redirectPath);
  const { error: stateError } = await serviceClient.from("gohighlevel_oauth_states").insert({
    company_id: companyId,
    initiated_by: userResult.user.id,
    state_hash: state.stateHash,
    redirect_path: redirectPath,
    requested_scopes: [...goHighLevelOAuthScopes],
    expires_at: state.expiresAt,
  });

  if (stateError) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "Could not create the HighLevel OAuth state." },
      { status: 500 },
    );
  }

  await serviceClient.from("integration_sync_logs").insert({
    company_id: companyId,
    provider: "gohighlevel",
    direction: "provider_to_weathertech",
    event_type: GOHIGHLEVEL_OAUTH_EVENT_TYPE,
    status: "queued",
    request_fingerprint: state.stateHash,
    request_summary: {
      oauthStart: true,
      companyName: company.name,
      scopeCount: authorization.scopes.length,
    },
    response_summary: { authorizationUrlIssued: true },
  });

  const response = NextResponse.json({
    ok: true,
    authorizationUrl: authorization.authorizationUrl,
    message: "HighLevel Marketplace authorization is ready.",
  });
  response.cookies.set(GOHIGHLEVEL_OAUTH_STATE_COOKIE, state.rawState, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: goHighLevelOAuthEndpoints.callback,
    maxAge: 10 * 60,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
