import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../../lib/supabase/server";
import {
  buildGoogleOAuthAuthorizationRequest,
  createServiceSupabaseClient,
  getGoogleWorkspaceConfigCheckResult,
  GMAIL_OAUTH_EVENT_TYPE,
} from "../../../../../../lib/googleWorkspace/serverClient";
import type { CompanyRecord } from "../../../../../../lib/crm/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OAuthStartBody = {
  companyId?: unknown;
  redirectPath?: unknown;
  mailboxLabel?: unknown;
  loginHint?: unknown;
};

function getRequestString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getJsonBody(request: NextRequest): Promise<OAuthStartBody> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as OAuthStartBody) : {};
  } catch {
    return {};
  }
}

function sanitizeRedirectPath(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value.slice(0, 200)
    : "/?view=integrations";
}

export async function POST(request: NextRequest) {
  const client = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();
  const config = getGoogleWorkspaceConfigCheckResult();

  if (!client || !serviceClient) {
    return NextResponse.json(
      {
        ok: false,
        authorizationUrl: null,
        message: "Server-side Supabase access is required to start Google OAuth.",
      },
      { status: 503 },
    );
  }

  const { data: userResult } = await client.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "Sign in before connecting Gmail." },
      { status: 401 },
    );
  }

  if (!config.ok) {
    return NextResponse.json(
      {
        ok: false,
        authorizationUrl: null,
        message: "Google Workspace OAuth configuration is incomplete.",
        missing: config.missing,
      },
      { status: 503 },
    );
  }

  const body = await getJsonBody(request);
  const companyId = getRequestString(body.companyId);

  if (!companyId) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "Select a company before connecting Gmail." },
      { status: 400 },
    );
  }

  const { data: company, error: companyError } = await client
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    return NextResponse.json(
      { ok: false, authorizationUrl: null, message: "The selected company is not available." },
      { status: 404 },
    );
  }

  const requestDetails = buildGoogleOAuthAuthorizationRequest({
    companyId,
    loginHint: getRequestString(body.loginHint),
  });
  const redirectPath = sanitizeRedirectPath(getRequestString(body.redirectPath));
  const mailboxLabel =
    getRequestString(body.mailboxLabel) ?? `${(company as CompanyRecord).name} Gmail mailbox`;

  const { error: stateError } = await serviceClient.from("gmail_oauth_states").insert({
    company_id: companyId,
    initiated_by: userResult.user.id,
    state_hash: requestDetails.stateHash,
    code_verifier: requestDetails.codeVerifier,
    redirect_path: redirectPath,
    requested_scopes: requestDetails.scopes,
    mailbox_label: mailboxLabel,
    expires_at: requestDetails.expiresAt,
  });

  if (stateError) {
    return NextResponse.json(
      {
        ok: false,
        authorizationUrl: null,
        message: "Could not create the Google OAuth state record.",
      },
      { status: 500 },
    );
  }

  await serviceClient.from("integration_sync_logs").insert({
    company_id: companyId,
    provider: "gmail",
    direction: "provider_to_weathertech",
    event_type: GMAIL_OAUTH_EVENT_TYPE,
    status: "queued",
    request_fingerprint: requestDetails.stateHash,
    request_summary: {
      oauthStarted: true,
      mailboxLabel,
      redirectPath,
      scopesRequested: requestDetails.scopes.length,
    },
    response_summary: {},
  });

  return NextResponse.json({
    ok: true,
    authorizationUrl: requestDetails.authorizationUrl,
    expiresAt: requestDetails.expiresAt,
    scopes: requestDetails.scopes,
    message: "Google OAuth authorization URL created.",
  });
}
