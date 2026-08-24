import { createServiceSupabaseClient } from "../googleWorkspace/serverClient";
import type {
  ProposalSigningAcceptResult,
  ProposalSigningDeclineResult,
  ProposalSigningErrorResult,
  ProposalSigningExchangeResult,
  ProposalSigningResult,
  ProposalSigningSessionRecord,
} from "./contracts";
import { parseProposalSigningRpcEnvelope } from "./rpc-response";
export { toProposalSigningPublicSession } from "./public-session";

export const PROPOSAL_SIGNING_RPCS = {
  exchange: "wtos_exchange_proposal_signing_token",
  session: "wtos_get_proposal_signing_session",
  accept: "wtos_accept_proposal_signing",
  decline: "wtos_decline_proposal_signing",
  registerReceipt: "wtos_register_proposal_signing_receipt",
  receiptRecovery: "wtos_get_proposal_signing_receipt_recovery",
} as const;

export type ProposalSigningReceiptRecoveryKeys = {
  requestId: string;
  companyId: string;
  proposalRevisionId: string;
  acceptanceId: string;
};

type RpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type RpcClient = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>;
};

function safeRpcError(error: RpcError | null, operation: keyof typeof PROPOSAL_SIGNING_RPCS) {
  const normalized = `${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  if (normalized.includes("rate") || normalized.includes("too many")) {
    return {
      ok: false,
      status: "rate_limited",
      message: "Too many signing attempts. Wait a few minutes and try again.",
    } satisfies ProposalSigningErrorResult;
  }

  if (
    operation === "accept" ||
    operation === "decline" ||
    operation === "registerReceipt"
  ) {
    if (
      normalized.includes("idempot") ||
      normalized.includes("conflict") ||
      normalized.includes("already signed") ||
      normalized.includes("already declined")
    ) {
      return {
        ok: false,
        status: "conflict",
        message: "The proposal state changed. Refresh the signing page before continuing.",
      } satisfies ProposalSigningErrorResult;
    }
  }

  if (error?.code === "P0001" || error?.code === "PGRST116") {
    return {
      ok: false,
      status: "invalid_or_expired",
      message: "This signing link is invalid, expired, or no longer active.",
    } satisfies ProposalSigningErrorResult;
  }

  return {
    ok: false,
    status: "unavailable",
    message: "The secure signing service is temporarily unavailable. Please try again.",
  } satisfies ProposalSigningErrorResult;
}

async function callProposalSigningRpc<T>(
  operation: keyof typeof PROPOSAL_SIGNING_RPCS,
  argumentName: "signing_request" | "receipt_request" | "recovery_request",
  payload: Record<string, unknown>,
): Promise<ProposalSigningResult<T>> {
  const client = createServiceSupabaseClient();
  if (!client) {
    return {
      ok: false,
      status: "unavailable",
      message: "The secure signing service is not configured.",
    };
  }

  const { data, error } = await (client as unknown as RpcClient).rpc(
    PROPOSAL_SIGNING_RPCS[operation],
    { [argumentName]: payload },
  );
  if (error) {
    return safeRpcError(error, operation);
  }

  const envelope = parseProposalSigningRpcEnvelope(data);
  if (!envelope) {
    return {
      ok: false,
      status: "unavailable",
      message: "The secure signing service returned an invalid response.",
    };
  }

  return envelope as ProposalSigningResult<T>;
}

export function exchangeProposalSigningToken(input: {
  requestId: string;
  tokenHash: string;
  sessionHash: string;
  sessionExpiresAt: string;
  ipHash: string | null;
  userAgent: string | null;
}) {
  return callProposalSigningRpc<ProposalSigningExchangeResult>(
    "exchange",
    "signing_request",
    input,
  );
}

export function getProposalSigningSession(input: {
  requestId: string;
  sessionHash: string;
}) {
  return callProposalSigningRpc<ProposalSigningSessionRecord>(
    "session",
    "signing_request",
    input,
  );
}

export function acceptProposalSigning(input: {
  requestId: string;
  sessionHash: string;
  idempotencyKey: string;
  signerName: string;
  signerEmail: string;
  selectedOptionIds: string[];
  acceptedTotal: number;
  termsAccepted: true;
  electronicRecordsConsented: true;
  signatureIntentAcknowledged: true;
  revisionSha256: string;
  documentSha256: string;
  termsSha256: string;
  consentSha256: string;
  ipHash: string | null;
  userAgent: string | null;
}) {
  return callProposalSigningRpc<ProposalSigningAcceptResult>(
    "accept",
    "signing_request",
    input,
  );
}

export function declineProposalSigning(input: {
  requestId: string;
  sessionHash: string;
  idempotencyKey: string;
  reasonCode: string;
  ipHash: string | null;
  userAgent: string | null;
}) {
  return callProposalSigningRpc<ProposalSigningDeclineResult>(
    "decline",
    "signing_request",
    input,
  );
}

export function registerProposalSigningReceipt(input: {
  operationKey: string;
  companyId: string;
  requestId: string;
  acceptanceId: string;
  documentId: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: "application/pdf";
  storageBucket: string;
  storagePath: string;
  signedDocumentSha256: string;
}) {
  return callProposalSigningRpc<Record<string, unknown>>(
    "registerReceipt",
    "receipt_request",
    input,
  );
}

export function getProposalSigningReceiptRecovery(
  input: ProposalSigningReceiptRecoveryKeys,
) {
  return callProposalSigningRpc<ProposalSigningSessionRecord>(
    "receiptRecovery",
    "recovery_request",
    input,
  );
}

export function getProposalSigningServiceClient() {
  return createServiceSupabaseClient();
}
