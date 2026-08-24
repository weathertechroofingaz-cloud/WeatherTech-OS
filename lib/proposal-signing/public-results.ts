import type {
  ProposalSigningAcceptResult,
  ProposalSigningDeclineResult,
} from "./contracts";

export function toProposalSigningPublicAcceptResponse(
  result: ProposalSigningAcceptResult,
  receipt: { ready: boolean; message: string | null },
) {
  return {
    ok: true as const,
    status: "signed" as const,
    acceptedTotal: result.acceptedTotal,
    requiredDepositAmount: result.requiredDepositAmount,
    acceptedAt: result.acceptedAt,
    evidenceSha256: result.evidenceSha256,
    receiptReady: receipt.ready,
    receiptMessage: receipt.message,
  };
}

export function toProposalSigningPublicDeclineResponse(
  result: ProposalSigningDeclineResult,
) {
  return {
    ok: true as const,
    status: "declined" as const,
    declinedAt: result.declinedAt,
  };
}
