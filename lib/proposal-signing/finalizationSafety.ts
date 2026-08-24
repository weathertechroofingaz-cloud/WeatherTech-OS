import { createHash } from "node:crypto";

type CanonicalSourceRead = {
  name: string;
  error: unknown;
};

export type ExistingFinalizedProposalStatus =
  | "ready_to_send"
  | "sent"
  | "viewed"
  | "accepted"
  | "converted_to_job";

const EXISTING_FINALIZED_PROPOSAL_STATUSES = new Set<ExistingFinalizedProposalStatus>([
  "ready_to_send",
  "sent",
  "viewed",
  "accepted",
  "converted_to_job",
]);

export function getExistingFinalizedProposalStatus(value: unknown) {
  return typeof value === "string" &&
    EXISTING_FINALIZED_PROPOSAL_STATUSES.has(value as ExistingFinalizedProposalStatus)
    ? (value as ExistingFinalizedProposalStatus)
    : null;
}

export function getFailedCanonicalSourceRead(reads: CanonicalSourceRead[]) {
  return reads.find((read) => Boolean(read.error))?.name ?? null;
}

type RegisteredProposalArtifact = {
  id?: unknown;
  company_id?: unknown;
  proposal_revision_id?: unknown;
  artifact_operation_key?: unknown;
  content_sha256?: unknown;
  storage_bucket?: unknown;
  storage_path?: unknown;
  file_name?: unknown;
  file_size_bytes?: unknown;
  mime_type?: unknown;
  file_url?: unknown;
  immutable_after_at?: unknown;
};

export type ExpectedProposalArtifact = {
  documentId: string;
  companyId: string;
  proposalRevisionId: string;
  artifactOperationKey: string;
  contentSha256: string;
  storageBucket: string;
  storagePath: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
};

export function isExactRegisteredProposalArtifact(
  value: RegisteredProposalArtifact | null,
  expected: ExpectedProposalArtifact,
) {
  return Boolean(
    value &&
      value.id === expected.documentId &&
      value.company_id === expected.companyId &&
      value.proposal_revision_id === expected.proposalRevisionId &&
      value.artifact_operation_key === expected.artifactOperationKey &&
      typeof value.content_sha256 === "string" &&
      value.content_sha256.toLowerCase() === expected.contentSha256 &&
      value.storage_bucket === expected.storageBucket &&
      value.storage_path === expected.storagePath &&
      value.file_name === expected.fileName &&
      value.file_size_bytes === expected.fileSizeBytes &&
      value.mime_type === expected.mimeType &&
      value.file_url === null &&
      typeof value.immutable_after_at === "string" &&
      Boolean(value.immutable_after_at),
  );
}

type ProposalArtifactStorage = {
  download: (path: string) => Promise<{
    data: { arrayBuffer: () => Promise<ArrayBuffer> } | null;
    error: unknown;
  }>;
  remove: (paths: string[]) => Promise<{
    data: Array<{ name?: unknown }> | null;
    error: unknown;
  }>;
  exists: (path: string) => Promise<{
    data: boolean;
    error: unknown;
  }>;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStorageErrorStatus(error: unknown) {
  if (!error || typeof error !== "object" || Array.isArray(error)) {
    return null;
  }
  const record = error as Record<string, unknown>;
  const directStatus = Number(record.status);
  if (Number.isFinite(directStatus)) {
    return directStatus;
  }
  const originalError = getRecord(record.originalError);
  const originalStatus = Number(originalError.status);
  return Number.isFinite(originalStatus) ? originalStatus : null;
}

export async function removeExactUnregisteredProposalArtifact({
  storage,
  storagePath,
  contentSha256,
}: {
  storage: ProposalArtifactStorage;
  storagePath: string;
  contentSha256: string;
}) {
  try {
    const existingObject = await storage.download(storagePath);
    if (existingObject.error || !existingObject.data) {
      return false;
    }
    const existingContent = Buffer.from(await existingObject.data.arrayBuffer());
    if (createHash("sha256").update(existingContent).digest("hex") !== contentSha256) {
      return false;
    }

    const removed = await storage.remove([storagePath]);
    if (
      removed.error ||
      !Array.isArray(removed.data) ||
      removed.data.length !== 1 ||
      removed.data[0]?.name !== storagePath
    ) {
      return false;
    }

    const existence = await storage.exists(storagePath);
    const missingStatus = getStorageErrorStatus(existence.error);
    return (
      existence.data === false &&
      Boolean(existence.error) &&
      (missingStatus === 400 || missingStatus === 404)
    );
  } catch {
    return false;
  }
}
