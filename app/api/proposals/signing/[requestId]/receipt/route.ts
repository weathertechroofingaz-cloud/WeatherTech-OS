import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isProposalSigningPublicId } from "../../../../../../lib/proposal-signing/constants";
import { getProposalSigningServiceClient } from "../../../../../../lib/proposal-signing/db";
import {
  PROPOSAL_SIGNING_RESPONSE_HEADERS,
  getRequestIdFromContext,
  getSigningHttpStatus,
  proposalSigningError,
} from "../../../../../../lib/proposal-signing/http";
import { ensureProposalSigningReceipt } from "../../../../../../lib/proposal-signing/receipt";
import { loadProposalSigningSession } from "../../../../../../lib/proposal-signing/route-helpers";
import { optionalRequestOriginIsSafe } from "../../../../../../lib/proposal-signing/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ requestId: string }> };

function safeFileName(value: string) {
  return value.replace(/[\r\n"\\/]+/g, "-").trim().slice(0, 160) || "signed-receipt.pdf";
}

export async function GET(request: NextRequest, context: RouteContext) {
  const requestId = await getRequestIdFromContext(context);
  if (!isProposalSigningPublicId(requestId) || !optionalRequestOriginIsSafe(request)) {
    return proposalSigningError("invalid_request", "This signing request is invalid.", 400);
  }

  const loaded = await loadProposalSigningSession(request, requestId);
  if (loaded.ok === false) {
    return proposalSigningError(
      loaded.status,
      loaded.message,
      getSigningHttpStatus(loaded.status),
    );
  }
  if (loaded.session.status !== "signed") {
    return proposalSigningError(
      "conflict",
      "A signed receipt is available only after electronic acceptance.",
      409,
    );
  }

  let ensured: Awaited<ReturnType<typeof ensureProposalSigningReceipt>>;
  try {
    ensured = await ensureProposalSigningReceipt(loaded.session, loaded.sessionHash);
  } catch {
    return proposalSigningError(
      "unavailable",
      "The signature is recorded, but the signed receipt is not ready yet.",
      503,
    );
  }
  if (!ensured.ok || !ensured.session.receipt) {
    return proposalSigningError(
      "unavailable",
      ensured.ok === true ? "The signed receipt is not ready yet." : ensured.message,
      503,
    );
  }

  const client = getProposalSigningServiceClient();
  const receipt = ensured.session.receipt;
  const expectedPrefix = `${ensured.session.proposal.companyId}/`;
  if (
    !client ||
    receipt.bucket !== "customer-documents" ||
    !receipt.path.startsWith(expectedPrefix) ||
    receipt.mimeType !== "application/pdf" ||
    !/^[0-9a-f]{64}$/.test(receipt.sha256)
  ) {
    return proposalSigningError("unavailable", "The signed receipt is unavailable.", 503);
  }

  const { data, error } = await client.storage.from(receipt.bucket).download(receipt.path);
  if (error || !data) {
    return proposalSigningError("unavailable", "The signed receipt could not be loaded.", 503);
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== receipt.sha256 || bytes.byteLength !== receipt.sizeBytes) {
    return proposalSigningError("conflict", "The signed receipt failed its integrity check.", 409);
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PROPOSAL_SIGNING_RESPONSE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${safeFileName(receipt.fileName)}"`,
      "Content-Security-Policy":
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    },
  });
}
