import { createHash, randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "../../../../../lib/googleWorkspace/serverClient";
import {
  PROPOSAL_SIGNING_CONSENT_TEXT,
  PROPOSAL_SIGNING_CONSENT_VERSION,
  buildProposalSigningUrl,
  isProposalSigningPublicId,
} from "../../../../../lib/proposal-signing/constants";
import {
  buildProposalSigningRegressionMarker,
  proposalSigningRegressionBoundaryIsEnabled,
  resolveProposalSigningRegressionRequestExpiresInMs,
} from "../../../../../lib/proposal-signing/regression";
import {
  ProposalSigningRequestError,
  generateProposalSigningToken,
  hashProposalSigningToken,
  readBoundedJsonObject,
  requestHasExactOrigin,
} from "../../../../../lib/proposal-signing/security";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 2048;
const SYNTHETIC_EMAIL_PATTERN =
  /^proposal-signing-[0-9]{17}-(?:weathertech|ihc)-[a-z0-9-]+@example\.test$/;

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function rpcEnvelope(data: unknown) {
  const value = Array.isArray(data) && data.length === 1 ? data[0] : data;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: NextRequest) {
  if (
    !proposalSigningRegressionBoundaryIsEnabled({
      requestOrigin: request.nextUrl.origin,
    })
  ) {
    return response({ ok: false, message: "Not found." }, 404);
  }
  if (!requestHasExactOrigin(request)) {
    return response({ ok: false, message: "The regression request origin is invalid." }, 403);
  }

  const ownerClient = await getSupabaseServerClient();
  const serviceClient = createServiceSupabaseClient();
  if (!ownerClient || !serviceClient) {
    return response({ ok: false, message: "The isolated regression service is unavailable." }, 503);
  }

  const { data: authResult } = await ownerClient.auth.getUser();
  if (!authResult.user) {
    return response({ ok: false, message: "Regression owner authentication is required." }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await readBoundedJsonObject(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof ProposalSigningRequestError) {
      return response({ ok: false, message: error.message }, error.statusCode);
    }
    return response({ ok: false, message: "The regression request is invalid." }, 400);
  }

  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const proposalRevisionId = isProposalSigningPublicId(body.proposalRevisionId)
    ? body.proposalRevisionId.toLowerCase()
    : null;
  const requestExpiresInMs =
    resolveProposalSigningRegressionRequestExpiresInMs(
      body.requestExpiresInMs,
    );
  let marker: string;
  try {
    marker = buildProposalSigningRegressionMarker(runId);
  } catch {
    return response({ ok: false, message: "The regression run marker is invalid." }, 400);
  }
  if (!proposalRevisionId) {
    return response({ ok: false, message: "The regression proposal revision is invalid." }, 400);
  }
  if (requestExpiresInMs === null) {
    return response(
      { ok: false, message: "The regression request expiry is invalid." },
      400,
    );
  }

  const { data: revision } = await serviceClient
    .from("estimate_proposal_revisions")
    .select("*")
    .eq("id", proposalRevisionId)
    .maybeSingle();
  if (!revision?.customer_id || !revision.finalized_document_id) {
    return response({ ok: false, message: "The synthetic finalized proposal was not found." }, 404);
  }

  const [
    { data: membership },
    { data: company },
    { data: customer },
    { data: document },
  ] = await Promise.all([
    ownerClient
      .from("company_memberships")
      .select("user_id,company_id,role")
      .eq("user_id", authResult.user.id)
      .eq("company_id", revision.company_id)
      .eq("role", "owner")
      .maybeSingle(),
    serviceClient.from("companies").select("id,name").eq("id", revision.company_id).maybeSingle(),
    serviceClient
      .from("customers")
      .select("id,display_name,contact_name,email")
      .eq("id", revision.customer_id)
      .eq("company_id", revision.company_id)
      .maybeSingle(),
    serviceClient
      .from("documents")
      .select("*")
      .eq("id", revision.finalized_document_id)
      .eq("proposal_revision_id", revision.id)
      .eq("company_id", revision.company_id)
      .maybeSingle(),
  ]);

  const signerName = customer?.contact_name?.trim() || customer?.display_name?.trim() || "";
  const signerEmail = customer?.email?.trim().toLowerCase() || "";
  if (
    !membership ||
    !company ||
    !customer ||
    !document ||
    !revision.title.startsWith(marker) ||
    !customer.display_name.startsWith(marker) ||
    !SYNTHETIC_EMAIL_PATTERN.test(signerEmail) ||
    document.storage_bucket !== "customer-documents" ||
    document.mime_type !== "application/pdf" ||
    document.file_url !== null ||
    !document.storage_path ||
    !document.content_sha256 ||
    !revision.revision_sha256 ||
    !revision.terms_sha256 ||
    !signerName
  ) {
    return response(
      { ok: false, message: "The exact synthetic proposal graph failed its isolation check." },
      409,
    );
  }

  const requestId = randomUUID();
  const emailMessageId = randomUUID();
  const rawToken = generateProposalSigningToken();
  const consentSha256 = createHash("sha256")
    .update(PROPOSAL_SIGNING_CONSENT_TEXT, "utf8")
    .digest("hex");
  const rpcClient = serviceClient as unknown as RpcClient;
  const activatedEmail = await rpcClient.rpc(
    "wtos_activate_synthetic_proposal_signing_fixture",
    {
      activation_request: {
        operationKey: randomUUID(),
        regressionOwnerUserId: authResult.user.id,
        companyId: revision.company_id,
        proposalRevisionId: revision.id,
        emailMessageId,
        signingRequestId: requestId,
        runId,
      },
    },
  );
  const activatedEmailEnvelope = rpcEnvelope(activatedEmail.data);
  if (
    activatedEmail.error ||
    activatedEmailEnvelope?.ok !== true ||
    activatedEmailEnvelope.status !== "sent" ||
    activatedEmailEnvelope.emailMessageId !== emailMessageId ||
    activatedEmailEnvelope.signingRequestId !== requestId ||
    activatedEmailEnvelope.proposalRevisionId !== revision.id
  ) {
    return response({ ok: false, message: "The token-free synthetic email fixture failed." }, 502);
  }

  const requestExpiresAt = new Date(Date.now() + requestExpiresInMs).toISOString();
  const prepared = await rpcClient.rpc("wtos_prepare_proposal_signing_request", {
    signing_request: {
      operationKey: randomUUID(),
      requestId,
      actorUserId: authResult.user.id,
      companyId: revision.company_id,
      proposalRevisionId: revision.id,
      requestTokenHash: hashProposalSigningToken(rawToken),
      signerName,
      signerEmail,
      expiresAt: requestExpiresAt,
      consentVersion: PROPOSAL_SIGNING_CONSENT_VERSION,
      consentText: PROPOSAL_SIGNING_CONSENT_TEXT,
      consentSha256,
    },
  });
  const preparedEnvelope = rpcEnvelope(prepared.data);
  if (prepared.error || preparedEnvelope?.ok !== true || preparedEnvelope.status !== "prepared") {
    return response({ ok: false, message: "The hashed synthetic signing request failed." }, 502);
  }
  const preparedExpiresAt = preparedEnvelope.expiresAt;
  if (
    typeof preparedExpiresAt !== "string" ||
    !Number.isFinite(Date.parse(preparedExpiresAt)) ||
    Date.parse(preparedExpiresAt) !== Date.parse(requestExpiresAt)
  ) {
    return response(
      { ok: false, message: "The synthetic signing request expiry was not preserved." },
      502,
    );
  }

  const transitioned = await rpcClient.rpc("wtos_transition_proposal_signing_request", {
    transition_request: {
      operationKey: randomUUID(),
      actorUserId: authResult.user.id,
      companyId: revision.company_id,
      requestId,
      action: "mark_sent",
      emailMessageId,
      failureCode: null,
      reason: "Isolated synthetic regression delivery; no provider was called.",
    },
  });
  const transitionedEnvelope = rpcEnvelope(transitioned.data);
  if (
    transitioned.error ||
    transitionedEnvelope?.ok !== true ||
    transitionedEnvelope.status !== "sent"
  ) {
    return response({ ok: false, message: "The synthetic signing request was not activated." }, 502);
  }

  // The raw token exists only in this stack frame and this no-store response.
  // It is never written to email_messages, metadata, audit, or application logs.
  return response(
    {
      ok: true,
      requestId,
      proposalRevisionId: revision.id,
      emailMessageId,
      expiresAt: preparedExpiresAt,
      signingUrl: buildProposalSigningUrl(request.nextUrl.origin, requestId, rawToken),
    },
    200,
  );
}
