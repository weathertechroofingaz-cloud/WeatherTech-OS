import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, JobRecord, ProposalDepositType } from "./types";

type ProposalApiError = {
  ok?: false;
  message?: string;
};

export type FinalizedProposalResult = {
  ok: true;
  message: string;
  proposalRevisionId: string;
  documentId: string;
  proposalNumber: string;
  revisionNumber: number;
  contentSha256: string;
  status: "ready_to_send" | "sent" | "viewed" | "accepted" | "converted_to_job";
};

export type PreparedProposalSignatureResult = {
  ok: true;
  message: string;
  proposalRevisionId: string;
  signingRequestId: string;
  emailMessageId: string;
  deliveryStatus: "prepared" | "sent";
};

export type RevokedProposalSignatureResult = {
  ok: true;
  message: string;
  proposalRevisionId: string;
  signingRequestId: string;
  status: "revoked";
};

export type ReconciledProposalReceiptResult = {
  ok: true;
  message: string;
  proposalRevisionId: string;
  acceptanceId: string;
  receiptDocumentId: string;
  status: "receipt_registered";
};

export type ProposalDepositInvoiceResult = {
  ok: true;
  status: "invoice_created";
  invoiceId: string;
  proposalRevisionId: string;
  acceptanceId: string;
  requiredDepositAmount: number;
  balanceDue: number;
  created: boolean;
};

async function postProposalOperation<Result>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as Result & ProposalApiError;

  if (!response.ok || result.ok === false) {
    throw new Error(result.message?.trim() || "The proposal operation could not be completed.");
  }

  return result;
}

export async function finalizeProposalForElectronicSignature({
  estimateId,
  selectedOptionIds,
  depositType,
  depositValue,
}: {
  estimateId: string;
  selectedOptionIds: Iterable<string>;
  depositType: Exclude<ProposalDepositType, "custom_schedule">;
  depositValue: number;
}) {
  return postProposalOperation<FinalizedProposalResult>("/api/proposals/finalize", {
    estimateId,
    selectedOptionIds: [...selectedOptionIds],
    depositType,
    depositValue,
  });
}

export async function prepareProposalElectronicSignatureRequest({
  proposalRevisionId,
}: {
  proposalRevisionId: string;
}) {
  return postProposalOperation<PreparedProposalSignatureResult>(
    "/api/proposals/signature-requests",
    { proposalRevisionId },
  );
}

export async function revokeProposalElectronicSignatureRequest({
  proposalRevisionId,
}: {
  proposalRevisionId: string;
}) {
  return postProposalOperation<RevokedProposalSignatureResult>(
    "/api/proposals/signature-requests",
    { proposalRevisionId, action: "revoke" },
  );
}

export async function queueProposalSignatureEmail(
  client: SupabaseClient<Database>,
  {
    companyId,
    emailMessageId,
    pendingPayloadHash,
  }: {
    companyId: string;
    emailMessageId: string;
    pendingPayloadHash: string;
  },
) {
  const { data, error } = await client.rpc("wtos_queue_proposal_signature_email", {
    queue_request: {
      operationKey: emailMessageId,
      companyId,
      emailMessageId,
      pendingPayloadHash,
    },
  });
  if (error) {
    throw error;
  }
  const result = data as {
    ok?: boolean;
    status?: unknown;
    emailMessageId?: unknown;
  } | null;
  if (
    !result?.ok ||
    result.status !== "queued" ||
    result.emailMessageId !== emailMessageId
  ) {
    throw new Error("The exact proposal signature email was not queued safely.");
  }
  return result;
}

export async function reconcileProposalElectronicSignatureReceipt({
  proposalRevisionId,
}: {
  proposalRevisionId: string;
}) {
  return postProposalOperation<ReconciledProposalReceiptResult>(
    "/api/proposals/signature-requests",
    { proposalRevisionId, action: "reconcile_receipt" },
  );
}

export async function createProposalDepositInvoice(
  client: SupabaseClient<Database>,
  {
    companyId,
    proposalRevisionId,
    acceptanceId,
    dueDate,
  }: {
    companyId: string;
    proposalRevisionId: string;
    acceptanceId: string;
    dueDate: string | null;
  },
) {
  const { data, error } = await client.rpc("wtos_create_proposal_deposit_invoice", {
    deposit_request: {
      operationKey: acceptanceId,
      companyId,
      proposalRevisionId,
      acceptanceId,
      dueDate,
    },
  });

  if (error) {
    throw error;
  }

  const result = data as ProposalDepositInvoiceResult | null;

  if (
    !result?.ok ||
    result.status !== "invoice_created" ||
    typeof result.invoiceId !== "string"
  ) {
    throw new Error("The exact proposal deposit invoice was not created safely.");
  }

  return result;
}

export async function convertProposalToSoldJob(
  client: SupabaseClient<Database>,
  {
    companyId,
    proposalRevisionId,
    acceptanceId,
    existingJobId = null,
  }: {
    companyId: string;
    proposalRevisionId: string;
    acceptanceId: string;
    existingJobId?: string | null;
  },
) {
  const { data, error } = await client.rpc("wtos_convert_proposal_to_sold_job", {
    conversion_request: {
      operationKey: acceptanceId,
      companyId,
      proposalRevisionId,
      acceptanceId,
      existingJobId,
    },
  });

  if (error) {
    throw error;
  }

  const row = data as { ok?: boolean; jobId?: unknown } | null;

  if (!row?.ok) {
    throw new Error("The sold-job handoff did not return a linked job.");
  }

  const jobId = typeof row.jobId === "string" ? row.jobId : null;

  if (!jobId) {
    throw new Error("The sold-job handoff returned an invalid job identity.");
  }

  const { data: job, error: jobError } = await client
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    throw jobError ?? new Error("The linked sold job could not be loaded.");
  }

  return job as JobRecord;
}
