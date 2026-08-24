import type {
  ProposalSigningPublicSession,
  ProposalSigningSessionRecord,
} from "./contracts";
import { maskProposalSigningEmail } from "./security";

export function toProposalSigningPublicSession(
  session: ProposalSigningSessionRecord,
): ProposalSigningPublicSession {
  const {
    companyId: _companyId,
    selectedOptionIds: _selectedOptionIds,
    lineItems,
    sections,
    options,
    ...publicProposal
  } = session.proposal;
  return {
    ok: true,
    status: session.status,
    sessionExpiresAt: session.sessionExpiresAt,
    requestExpiresAt: session.requestExpiresAt,
    signer: {
      name: session.signer.name,
      emailMasked: maskProposalSigningEmail(session.signer.email),
    },
    proposal: {
      ...publicProposal,
      lineItems: lineItems.map(({ id: _id, ...item }) => item),
      sections: sections.map(({ id: _id, sectionKey: _sectionKey, ...section }) =>
        section
      ),
      options: options.map(
        ({
          id: _id,
          optionGroupKey: _optionGroupKey,
          dependencyOptionId: _dependencyOptionId,
          conflictingOptionId: _conflictingOptionId,
          ...option
        }) => option,
      ),
    },
    document: {
      fileName: session.document.fileName,
      mimeType: session.document.mimeType,
      sizeBytes: session.document.sizeBytes,
      sha256: session.document.sha256,
    },
    receipt: session.receipt
      ? {
          fileName: session.receipt.fileName,
          mimeType: session.receipt.mimeType,
          sizeBytes: session.receipt.sizeBytes,
          sha256: session.receipt.sha256,
          registeredAt: session.receipt.registeredAt,
        }
      : null,
    acceptance: session.acceptance
      ? {
          signerName: session.acceptance.signerName,
          signerEmailMasked: maskProposalSigningEmail(session.acceptance.signerEmail),
          acceptedTotal: session.acceptance.acceptedTotal,
          requiredDepositAmount: session.acceptance.requiredDepositAmount,
          acceptedAt: session.acceptance.acceptedAt,
          evidenceSha256: session.acceptance.evidenceSha256,
          termsSha256: session.acceptance.termsSha256,
          consentSha256: session.acceptance.consentSha256,
        }
      : null,
  };
}
