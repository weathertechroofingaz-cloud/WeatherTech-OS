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
import { loadProposalSigningSession } from "../../../../../../lib/proposal-signing/route-helpers";
import { optionalRequestOriginIsSafe } from "../../../../../../lib/proposal-signing/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ requestId: string }> };

function safeFileName(value: string, fallback: string) {
  const sanitized = value.replace(/[\r\n"\\/]+/g, "-").trim().slice(0, 160);
  return sanitized || fallback;
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

  const client = getProposalSigningServiceClient();
  const document = loaded.session.document;
  const expectedPrefix = `${loaded.session.proposal.companyId}/`;
  if (
    !client ||
    document.bucket !== "customer-documents" ||
    !document.path.startsWith(expectedPrefix) ||
    document.mimeType !== "application/pdf" ||
    !/^[0-9a-f]{64}$/.test(document.sha256)
  ) {
    return proposalSigningError(
      "unavailable",
      "The finalized proposal document is not available securely.",
      503,
    );
  }

  const { data, error } = await client.storage.from(document.bucket).download(document.path);
  if (error || !data) {
    return proposalSigningError(
      "unavailable",
      "The finalized proposal document could not be loaded.",
      503,
    );
  }

  const bytes = Buffer.from(await data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== document.sha256 || bytes.byteLength !== document.sizeBytes) {
    return proposalSigningError(
      "conflict",
      "The finalized proposal document failed its integrity check.",
      409,
    );
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      ...PROPOSAL_SIGNING_RESPONSE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${safeFileName(document.fileName, "proposal.pdf")}"`,
      "Content-Security-Policy":
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    },
  });
}
