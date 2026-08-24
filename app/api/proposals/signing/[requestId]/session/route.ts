import type { NextRequest } from "next/server";
import { isProposalSigningPublicId } from "../../../../../../lib/proposal-signing/constants";
import { toProposalSigningPublicSession } from "../../../../../../lib/proposal-signing/db";
import {
  getRequestIdFromContext,
  getSigningHttpStatus,
  proposalSigningError,
  proposalSigningJson,
} from "../../../../../../lib/proposal-signing/http";
import { loadProposalSigningSession } from "../../../../../../lib/proposal-signing/route-helpers";
import { optionalRequestOriginIsSafe } from "../../../../../../lib/proposal-signing/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ requestId: string }> };

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

  return proposalSigningJson(toProposalSigningPublicSession(loaded.session));
}
