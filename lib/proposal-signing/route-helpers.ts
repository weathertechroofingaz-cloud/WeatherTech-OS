import type { NextRequest } from "next/server";
import { isProposalSigningPublicId } from "./constants";
import type {
  ProposalSigningErrorResult,
  ProposalSigningSessionRecord,
} from "./contracts";
import { getProposalSigningSession } from "./db";
import {
  getProposalSigningSessionToken,
  hashProposalSigningToken,
} from "./security";

export type LoadedProposalSigningSession =
  | {
      ok: true;
      sessionToken: string;
      sessionHash: string;
      session: ProposalSigningSessionRecord;
    }
  | ProposalSigningErrorResult;

export async function loadProposalSigningSession(
  request: NextRequest,
  requestId: string,
): Promise<LoadedProposalSigningSession> {
  if (!isProposalSigningPublicId(requestId)) {
    return {
      ok: false,
      status: "invalid_request",
      message: "This signing link is invalid.",
    };
  }

  const sessionToken = getProposalSigningSessionToken(request, requestId);
  if (!sessionToken) {
    return {
      ok: false,
      status: "invalid_or_expired",
      message: "This signing session is unavailable. Open the original email link again.",
    };
  }

  const sessionHash = hashProposalSigningToken(sessionToken);
  const session = await getProposalSigningSession({ requestId, sessionHash });
  if (session.ok === false) {
    return session;
  }

  return { ok: true, sessionToken, sessionHash, session };
}
