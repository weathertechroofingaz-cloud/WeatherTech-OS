import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, EmailMessageRecord } from "../crm/types";

export const proposalSignatureEmailTransitionActions = [
  "recover_pre_send",
  "claim_send",
  "mark_prepare_failed",
  "mark_provider_attempt",
  "checkpoint_provider",
  "mark_sent",
  "mark_provider_unknown",
  "mark_provider_failed",
  "mark_pre_send_interrupted",
  "cancel_unsent",
  "abandon_unknown",
  "finalize_delivery",
  "reconcile_delivery",
] as const;

export type ProposalSignatureEmailTransitionAction =
  (typeof proposalSignatureEmailTransitionActions)[number];

export type ProposalSignatureEmailTransitionRequest = {
  operationKey: string;
  actorUserId: string;
  companyId: string;
  emailMessageId: string;
  action: ProposalSignatureEmailTransitionAction;
  metadata: Record<string, unknown>;
  expectedSendAttemptId?: string | null;
  expectedGmailMessageId?: string | null;
  fromEmail?: string | null;
  providerAccountId?: string | null;
  providerPayloadHash?: string | null;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  sentAt?: string | null;
  lastError?: string | null;
};

export type ProposalSignatureEmailTransitionResult =
  | {
      ok: true;
      status: ProposalSignatureEmailTransitionAction;
      emailMessageId: string;
      emailStatus: EmailMessageRecord["status"];
      syncStatus: EmailMessageRecord["sync_status"];
      emailMessage: EmailMessageRecord;
    }
  | {
      ok: false;
      status: "conflict" | "source_changed" | "unavailable";
      message: string;
    };

function getRecord(value: unknown): Record<string, unknown> | null {
  const unwrapped = Array.isArray(value) && value.length === 1 ? value[0] : value;
  return unwrapped && typeof unwrapped === "object" && !Array.isArray(unwrapped)
    ? (unwrapped as Record<string, unknown>)
    : null;
}

export async function transitionProposalSignatureEmail(
  client: SupabaseClient<Database>,
  request: ProposalSignatureEmailTransitionRequest,
): Promise<ProposalSignatureEmailTransitionResult> {
  const { data, error } = await client.rpc(
    "wtos_transition_proposal_signature_email",
    { delivery_request: request },
  );
  const envelope = getRecord(data);

  if (error) {
    return {
      ok: false,
      status: "unavailable",
      message: "The exact proposal signature email transition is unavailable.",
    };
  }
  if (
    envelope?.ok === false &&
    (envelope.status === "conflict" || envelope.status === "source_changed")
  ) {
    return {
      ok: false,
      status: envelope.status,
      message:
        typeof envelope.message === "string" && envelope.message.trim()
          ? envelope.message.trim()
          : envelope.status === "source_changed"
            ? "Proposal source records changed after finalization. Finalize a new revision before customer delivery."
            : "The proposal signature email state changed before the exact transition.",
    };
  }

  const emailMessage = getRecord(envelope?.emailMessage);
  if (
    envelope?.ok !== true ||
    envelope.status !== request.action ||
    envelope.emailMessageId !== request.emailMessageId ||
    emailMessage?.id !== request.emailMessageId ||
    emailMessage.company_id !== request.companyId ||
    envelope.emailStatus !== emailMessage.status ||
    envelope.syncStatus !== emailMessage.sync_status ||
    emailMessage.metadata === null ||
    typeof emailMessage.metadata !== "object" ||
    Array.isArray(emailMessage.metadata) ||
    (emailMessage.metadata as Record<string, unknown>).draftType !==
      "proposal_signature_request"
  ) {
    return {
      ok: false,
      status: "unavailable",
      message: "The exact proposal signature email transition was not proven.",
    };
  }

  return {
    ok: true,
    status: request.action,
    emailMessageId: request.emailMessageId,
    emailStatus: envelope.emailStatus as EmailMessageRecord["status"],
    syncStatus: envelope.syncStatus as EmailMessageRecord["sync_status"],
    emailMessage: emailMessage as unknown as EmailMessageRecord,
  };
}
