import type { ProposalSigningErrorResult } from "./contracts";

const COMMITTED_ERROR_STATUSES = new Set<ProposalSigningErrorResult["status"]>([
  "invalid_or_expired",
  "rate_limited",
  "conflict",
]);

type RpcSuccessEnvelope = Record<string, unknown> & { ok: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeProposalSigningRpcData(value: unknown) {
  if (Array.isArray(value) && value.length === 1) {
    return value[0];
  }
  return value;
}

/**
 * Validates the deliberately returned JSON envelopes from the service-role-only
 * proposal-signing RPCs. In particular, committed rate-limit/invalid-attempt
 * results must not be treated as transport failures or their counters would be
 * obscured from the customer route.
 */
export function parseProposalSigningRpcEnvelope(
  value: unknown,
): RpcSuccessEnvelope | ProposalSigningErrorResult | null {
  const normalized = normalizeProposalSigningRpcData(value);
  if (!isRecord(normalized)) {
    return null;
  }

  if (normalized.ok === true) {
    return normalized as RpcSuccessEnvelope;
  }

  if (
    normalized.ok !== false ||
    typeof normalized.status !== "string" ||
    !COMMITTED_ERROR_STATUSES.has(
      normalized.status as ProposalSigningErrorResult["status"],
    ) ||
    typeof normalized.message !== "string"
  ) {
    return null;
  }

  const message = normalized.message.trim();
  if (
    message.length < 1 ||
    message.length > 240 ||
    /[\u0000-\u001f\u007f]/.test(message)
  ) {
    return null;
  }

  return {
    ok: false,
    status: normalized.status as ProposalSigningErrorResult["status"],
    message,
  };
}
