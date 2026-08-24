export type ProposalSigningLifecycleStatus =
  | "active"
  | "signed"
  | "declined"
  | "expired"
  | "revoked"
  | "superseded"
  | "failed";

export type ProposalSigningSection = {
  id: string;
  sectionKey: string;
  title: string;
  sectionType: string;
  body: string;
  isRequired: boolean;
  sortOrder: number;
};

export type ProposalSigningOption = {
  id: string;
  optionType: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  scopeDetails: string | null;
  warrantyEffect: string | null;
  customerNotes: string | null;
  price: number;
  priceEffectType: "additive" | "replace_base_amount" | "full_alternate_total";
  baseReplacementAmount: number;
  selected: boolean;
  required: boolean;
  recommended: boolean;
  bestValue: boolean;
  optionGroupKey: string | null;
  dependencyOptionId: string | null;
  conflictingOptionId: string | null;
  sortOrder: number;
};

export type ProposalSigningLineItem = {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  total: number;
  sortOrder: number;
};

export type ProposalSigningCustomerSnapshot = {
  schemaVersion: "native-proposal-v1";
  companyId: string;
  companyName: string;
  brandName: string;
  brandPrimaryColor: string | null;
  brandAccentColor: string | null;
  proposalNumber: string;
  revisionNumber: number;
  title: string;
  issueDate: string;
  customerName: string;
  propertyAddress: string | null;
  baseSubtotal: number;
  discountTotal: number;
  taxTotal: number;
  feeTotal: number;
  baseTotal: number;
  lineItems: ProposalSigningLineItem[];
  selectedOptionIds: string[];
  selectedUpgradesTotal: number;
  acceptedTotal: number;
  depositType: string;
  depositValue: number;
  depositRequired: boolean;
  requiresDepositBeforeJob: boolean;
  requiredDepositAmount: number;
  remainingBalance: number;
  terms: string;
  electronicRecordsDisclosure: string;
  revisionSha256: string;
  termsSha256: string;
  consentSha256: string;
  sections: ProposalSigningSection[];
  options: ProposalSigningOption[];
};

export type ProposalSigningDocumentAccess = {
  id: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

export type ProposalSigningReceiptAccess = {
  documentId: string;
  bucket: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  registeredAt: string;
};

export type ProposalSigningAcceptanceEvidence = {
  acceptanceId: string;
  signatureId: string;
  signerName: string;
  signerEmail: string;
  selectedOptionIds: string[];
  acceptedTotal: number;
  requiredDepositAmount: number;
  acceptedAt: string;
  evidenceSha256: string;
  termsSha256: string;
  consentSha256: string;
};

export type ProposalSigningSessionRecord = {
  ok: true;
  status: Extract<ProposalSigningLifecycleStatus, "active" | "signed" | "declined">;
  requestId: string;
  sessionId: string;
  sessionExpiresAt: string;
  requestExpiresAt: string;
  signer: {
    name: string;
    email: string;
  };
  proposal: ProposalSigningCustomerSnapshot;
  document: ProposalSigningDocumentAccess;
  receipt: ProposalSigningReceiptAccess | null;
  acceptance?: ProposalSigningAcceptanceEvidence | null;
};

export type ProposalSigningPublicSession = Omit<
  ProposalSigningSessionRecord,
  | "document"
  | "receipt"
  | "signer"
  | "requestId"
  | "sessionId"
  | "proposal"
  | "acceptance"
> & {
  signer: {
    name: string;
    emailMasked: string;
  };
  proposal: Omit<
    ProposalSigningCustomerSnapshot,
    | "companyId"
    | "lineItems"
    | "sections"
    | "options"
    | "selectedOptionIds"
  > & {
    lineItems: Array<Omit<ProposalSigningLineItem, "id">>;
    sections: Array<Omit<ProposalSigningSection, "id" | "sectionKey">>;
    options: Array<
      Omit<
        ProposalSigningOption,
        "id" | "optionGroupKey" | "dependencyOptionId" | "conflictingOptionId"
      >
    >;
  };
  document: Omit<ProposalSigningDocumentAccess, "id" | "bucket" | "path">;
  receipt: Omit<ProposalSigningReceiptAccess, "documentId" | "bucket" | "path"> | null;
  acceptance?:
    | (Omit<
        ProposalSigningAcceptanceEvidence,
        | "acceptanceId"
        | "signatureId"
        | "signerEmail"
        | "selectedOptionIds"
      > & {
        signerEmailMasked: string;
      })
    | null;
};

export type ProposalSigningExchangeResult = {
  ok: true;
  status: "active" | "signed";
  requestId: string;
  sessionId: string;
  sessionExpiresAt: string;
};

export type ProposalSigningAcceptResult = {
  ok: true;
  status: "signed";
  requestId: string;
  sessionId: string;
  proposalRevisionId: string;
  acceptanceId: string;
  signatureId: string;
  acceptedTotal: number;
  requiredDepositAmount: number;
  acceptedAt: string;
  evidenceSha256: string;
  receiptStatus: "pending" | "registered";
};

export type ProposalSigningDeclineResult = {
  ok: true;
  status: "declined";
  requestId: string;
  sessionId: string;
  proposalRevisionId: string;
  declinedAt: string;
};

export type ProposalSigningErrorStatus =
  | "invalid_request"
  | "invalid_or_expired"
  | "rate_limited"
  | "conflict"
  | "unavailable";

export type ProposalSigningErrorResult = {
  ok: false;
  status: ProposalSigningErrorStatus;
  message: string;
};

export type ProposalSigningResult<T> = T | ProposalSigningErrorResult;
