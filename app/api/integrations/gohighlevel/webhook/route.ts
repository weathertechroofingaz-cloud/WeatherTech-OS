import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type {
  GoHighLevelResourceType,
  IntegrationConnectionRecord,
} from "../../../../../lib/crm/types";
import {
  buildGoHighLevelWebhookSummary,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
  verifyGoHighLevelWebhookSignature,
} from "../../../../../lib/gohighlevel/oauth";
import {
  buildGoHighLevelResourceSnapshot,
  persistGoHighLevelCommunication,
  resolveGoHighLevelLocalContactMatch,
  resolveGoHighLevelCommunicationIdentity,
  upsertContactMapping,
  upsertGoHighLevelResourceSnapshots,
} from "../../../../../lib/gohighlevel/sync";
import { readBoundedTextBody } from "../../../../../lib/http/boundedJson";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_GHL_WEBHOOK_BODY_BYTES = 262_144;
// HighLevel documents twelve automatic retries after the original delivery.
const MAX_GHL_WEBHOOK_ATTEMPTS = 13;
const GHL_WEBHOOK_CONTRACT_VERSION = 1;

type WebhookClaimReceipt = {
  eventId: string;
  companyId: string;
  integrationConnectionId: string;
  payloadSha256: string;
  claimToken: string | null;
  processingStatus: "received" | "processed" | "ignored" | "failed";
  attemptCount: number;
  leaseExpiresAt: string | null;
  disposition: "claimed" | "duplicate" | "busy" | "exhausted";
};

type WebhookTransitionReceipt = {
  eventId: string;
  companyId: string;
  payloadSha256: string;
  claimToken: string;
  processingStatus: "processed" | "ignored" | "failed";
  attemptCount: number;
  idempotent: boolean;
};

type WebhookDuplicateReceipt = {
  eventId: string;
  companyId: string;
  payloadSha256: string;
  processingStatus: "processed" | "ignored";
  duplicateCount: number;
  lastDuplicateAt: string;
};

type WebhookUninstallReceipt = WebhookTransitionReceipt & {
  scope: "location" | "company";
  credentialCount: number;
  connectionCount: number;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;

function getString(payload: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getOccurredAt(payload: Record<string, unknown>) {
  const appointment = asRecord(payload.appointment);
  const raw =
    payload.timestamp ??
    payload.dateUpdated ??
    payload.dateAdded ??
    payload.createdAt ??
    appointment?.dateUpdated ??
    appointment?.dateAdded ??
    appointment?.startTime;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const milliseconds = raw < 10_000_000_000 ? raw * 1000 : raw;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof raw === "string") {
    const date = new Date(raw);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

function getResourceType(payload: Record<string, unknown>): GoHighLevelResourceType | null {
  const eventType = getString(payload, "type")?.toLowerCase() ?? "";
  const messageType = getString(payload, "messageType")?.toLowerCase() ?? "";
  if (eventType.includes("contact")) return "contact";
  if (eventType.includes("conversation") && !eventType.includes("message")) return "conversation";
  if (
    eventType.includes("message") ||
    messageType.includes("sms") ||
    messageType.includes("call") ||
    messageType.includes("voicemail")
  ) {
    return messageType.includes("call") || messageType.includes("voicemail")
      ? "call"
      : "message";
  }
  if (eventType.includes("opportunity")) return "opportunity";
  if (eventType.includes("appointment") || eventType.includes("calendar")) return "calendar_event";
  if (eventType.includes("review")) return "review";
  return null;
}

function getExternalId(payload: Record<string, unknown>, resourceType: GoHighLevelResourceType) {
  if (resourceType === "contact") return getString(payload, "contactId", "id");
  if (resourceType === "conversation") return getString(payload, "conversationId", "id");
  if (resourceType === "message" || resourceType === "call") {
    return getString(payload, "messageId", "emailMessageId", "id");
  }
  if (resourceType === "opportunity") return getString(payload, "opportunityId", "id");
  if (resourceType === "calendar_event") return getString(payload, "appointmentId", "id");
  return getString(payload, "reviewId", "id");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildWebhookProviderRecord(
  payload: Record<string, unknown>,
  resourceType: GoHighLevelResourceType | null,
  webhookId: string,
) {
  if (resourceType === "calendar_event") {
    const appointment = asRecord(payload.appointment);
    if (appointment) {
      return {
        ...appointment,
        type: payload.type,
        locationId: getString(payload, "locationId") ?? appointment.locationId,
        appointmentId: getString(appointment, "id"),
        webhookId,
      };
    }
  }
  const providerRecord = { ...payload, webhookId };
  if (resourceType === "message" || resourceType === "call") {
    return providerRecord;
  }
  const externalId = resourceType
    ? getExternalId(providerRecord, resourceType)
    : null;
  return externalId ? { ...providerRecord, id: externalId } : providerRecord;
}

function parseClaimReceipt(
  value: unknown,
  expected: {
    companyId: string;
    integrationConnectionId: string;
    payloadSha256: string;
  },
): WebhookClaimReceipt | null {
  const receipt = asRecord(value);
  if (
    !receipt ||
    receipt.contractVersion !== GHL_WEBHOOK_CONTRACT_VERSION ||
    typeof receipt.eventId !== "string" ||
    !uuidPattern.test(receipt.eventId) ||
    receipt.companyId !== expected.companyId ||
    receipt.integrationConnectionId !== expected.integrationConnectionId ||
    receipt.payloadSha256 !== expected.payloadSha256 ||
    (receipt.claimToken !== null &&
      (typeof receipt.claimToken !== "string" || !uuidPattern.test(receipt.claimToken))) ||
    !["received", "processed", "ignored", "failed"].includes(
      String(receipt.processingStatus),
    ) ||
    typeof receipt.attemptCount !== "number" ||
    !Number.isInteger(receipt.attemptCount) ||
    receipt.attemptCount < 0 ||
    receipt.attemptCount > MAX_GHL_WEBHOOK_ATTEMPTS ||
    (receipt.leaseExpiresAt !== null && typeof receipt.leaseExpiresAt !== "string") ||
    !["claimed", "duplicate", "busy", "exhausted"].includes(
      String(receipt.disposition),
    )
  ) {
    return null;
  }

  const parsed = receipt as unknown as WebhookClaimReceipt;
  if (
    (parsed.disposition === "claimed" &&
      (!parsed.claimToken || parsed.processingStatus !== "received" || !parsed.leaseExpiresAt)) ||
    (parsed.disposition === "duplicate" &&
      !["processed", "ignored"].includes(parsed.processingStatus)) ||
    (parsed.disposition === "busy" && parsed.processingStatus !== "received") ||
    (parsed.disposition === "exhausted" && parsed.processingStatus !== "failed")
  ) {
    return null;
  }

  return parsed;
}

function parseTransitionReceipt(
  value: unknown,
  expected: {
    eventId: string;
    companyId: string;
    payloadSha256: string;
    claimToken: string;
    processingStatus: WebhookTransitionReceipt["processingStatus"];
  },
): WebhookTransitionReceipt | null {
  const receipt = asRecord(value);
  if (
    !receipt ||
    receipt.contractVersion !== GHL_WEBHOOK_CONTRACT_VERSION ||
    receipt.eventId !== expected.eventId ||
    receipt.companyId !== expected.companyId ||
    receipt.payloadSha256 !== expected.payloadSha256 ||
    receipt.claimToken !== expected.claimToken ||
    receipt.processingStatus !== expected.processingStatus ||
    typeof receipt.attemptCount !== "number" ||
    !Number.isInteger(receipt.attemptCount) ||
    receipt.attemptCount < 1 ||
    receipt.attemptCount > MAX_GHL_WEBHOOK_ATTEMPTS ||
    typeof receipt.idempotent !== "boolean"
  ) {
    return null;
  }
  return receipt as unknown as WebhookTransitionReceipt;
}

function parseDuplicateReceipt(
  value: unknown,
  expected: {
    eventId: string;
    companyId: string;
    payloadSha256: string;
  },
): WebhookDuplicateReceipt | null {
  const receipt = asRecord(value);
  if (
    !receipt ||
    receipt.contractVersion !== GHL_WEBHOOK_CONTRACT_VERSION ||
    receipt.eventId !== expected.eventId ||
    receipt.companyId !== expected.companyId ||
    receipt.payloadSha256 !== expected.payloadSha256 ||
    !["processed", "ignored"].includes(String(receipt.processingStatus)) ||
    typeof receipt.duplicateCount !== "number" ||
    !Number.isInteger(receipt.duplicateCount) ||
    receipt.duplicateCount < 1 ||
    typeof receipt.lastDuplicateAt !== "string"
  ) {
    return null;
  }
  return receipt as unknown as WebhookDuplicateReceipt;
}

function parseUninstallReceipt(
  value: unknown,
  expected: Parameters<typeof parseTransitionReceipt>[1] & {
    scope: WebhookUninstallReceipt["scope"];
  },
): WebhookUninstallReceipt | null {
  const transition = parseTransitionReceipt(value, expected);
  const receipt = asRecord(value);
  if (
    !transition ||
    !receipt ||
    receipt.scope !== expected.scope ||
    typeof receipt.credentialCount !== "number" ||
    !Number.isInteger(receipt.credentialCount) ||
    receipt.credentialCount < 0 ||
    typeof receipt.connectionCount !== "number" ||
    !Number.isInteger(receipt.connectionCount) ||
    receipt.connectionCount < 1
  ) {
    return null;
  }
  return receipt as unknown as WebhookUninstallReceipt;
}

export async function POST(request: NextRequest) {
  const rawBodyResult = await readBoundedTextBody(
    request,
    MAX_GHL_WEBHOOK_BODY_BYTES,
  );
  if (!rawBodyResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        message:
          rawBodyResult.reason === "too_large"
            ? "Webhook payload is too large."
            : "Webhook payload could not be read.",
      },
      { status: rawBodyResult.reason === "too_large" ? 413 : 400 },
    );
  }
  const rawBody = rawBodyResult.value;
  const verification = verifyGoHighLevelWebhookSignature({
    rawBody,
    ghlSignature: request.headers.get("x-ghl-signature"),
    legacySignature: request.headers.get("x-wh-signature"),
  });
  if (!verification.ok) {
    return NextResponse.json({ ok: false, message: verification.reason }, { status: 401 });
  }

  const parsed: unknown = (() => {
    try {
      return JSON.parse(rawBody);
    } catch {
      return null;
    }
  })();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ ok: false, message: "Invalid webhook payload." }, { status: 400 });
  }

  const payload = parsed as Record<string, unknown>;
  const locationId = getString(payload, "locationId");
  const externalCompanyId = getString(payload, "companyId");
  const eventType = getString(payload, "type") ?? "unknown";
  const isUninstall = eventType.toLowerCase().includes("uninstall");
  if (!locationId && !(isUninstall && externalCompanyId)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      message: "Webhook has no authorized location or company mapping.",
    });
  }

  const serviceClient = createGoHighLevelServiceClient();
  if (!serviceClient) {
    return NextResponse.json({ ok: false, message: "Webhook storage is unavailable." }, { status: 503 });
  }

  let connection: IntegrationConnectionRecord | null = null;
  if (locationId) {
    const locationResult = isUninstall
      ? await serviceClient
          .from("integration_connections")
          .select("*")
          .eq("provider", "gohighlevel")
          .eq("external_account_id", locationId)
          .maybeSingle()
      : await serviceClient
          .from("integration_connections")
          .select("*")
          .eq("provider", "gohighlevel")
          .eq("external_account_id", locationId)
          .eq("status", "connected")
          .maybeSingle();
    if (locationResult.error) {
      return retryableWebhookResponse("Webhook location mapping could not be verified.");
    }
    connection = locationResult.data;
  } else if (externalCompanyId) {
    const { data: credentials, error: credentialsError } = await serviceClient
      .from("gohighlevel_oauth_credentials")
      .select("company_id, integration_connection_id, external_company_id")
      .eq("external_company_id", externalCompanyId)
      .is("revoked_at", null)
      .order("integration_connection_id", { ascending: true })
      .limit(200);
    if (credentialsError) {
      return retryableWebhookResponse("Webhook company mapping could not be verified.");
    }

    const anchorCredential = credentials?.[0] ?? null;
    const anchorConnectionId = anchorCredential?.integration_connection_id ?? null;
    if (anchorConnectionId) {
      const { data: anchorConnection, error: anchorError } = await serviceClient
        .from("integration_connections")
        .select("*")
        .eq("id", anchorConnectionId)
        .eq("company_id", anchorCredential.company_id)
        .eq("provider", "gohighlevel")
        .maybeSingle();
      if (anchorError) {
        return retryableWebhookResponse("Webhook company mapping could not be verified.");
      }
      connection = anchorConnection;
    }
  }

  if (!connection) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      message: "Webhook location or company is not mapped.",
    });
  }

  const payloadSha256 = createHash("sha256").update(rawBody, "utf8").digest("hex");
  const webhookId =
    getString(payload, "webhookId") ?? `derived-${payloadSha256}`;
  const summary = buildGoHighLevelWebhookSummary(payload);
  const occurredAt = getOccurredAt(payload);
  const externalScopeId = locationId ?? `company:${externalCompanyId}`;
  const { data: claimResult, error: claimError } = await serviceClient.rpc(
    "wtos_claim_gohighlevel_webhook_v1",
    {
      p_claim: {
        contractVersion: GHL_WEBHOOK_CONTRACT_VERSION,
        maxAttempts: MAX_GHL_WEBHOOK_ATTEMPTS,
        companyId: connection.company_id,
        integrationConnectionId: connection.id,
        webhookId,
        eventType,
        externalLocationId: externalScopeId,
        externalContactId: getString(payload, "contactId"),
        externalConversationId: getString(payload, "conversationId"),
        externalMessageId: getString(
          payload,
          "messageId",
          "emailMessageId",
        ),
        signatureVersion: verification.signatureVersion,
        payloadSha256,
        payloadSummary: summary,
        occurredAt,
      },
    },
  );
  if (claimError) {
    if (claimError.code === "23514") {
      return NextResponse.json(
        { ok: false, message: "Webhook replay identity does not match the durable event." },
        { status: 409 },
      );
    }
    return retryableWebhookResponse("Webhook could not be claimed durably.");
  }
  const webhookEvent = parseClaimReceipt(claimResult, {
    companyId: connection.company_id,
    integrationConnectionId: connection.id,
    payloadSha256,
  });
  if (!webhookEvent) {
    return retryableWebhookResponse("Webhook claim receipt could not be verified.");
  }
  if (webhookEvent.disposition === "duplicate") {
    const { data: duplicateResult, error: duplicateError } = await serviceClient.rpc(
      "wtos_record_gohighlevel_webhook_duplicate_v1",
      {
        p_event_id: webhookEvent.eventId,
        p_payload_sha256: payloadSha256,
      },
    );
    const duplicateReceipt = duplicateError
      ? null
      : parseDuplicateReceipt(duplicateResult, {
          eventId: webhookEvent.eventId,
          companyId: connection.company_id,
          payloadSha256,
        });
    if (!duplicateReceipt) {
      return retryableWebhookResponse(
        "Webhook duplicate was suppressed but its delivery count could not be recorded.",
      );
    }
    return NextResponse.json({
      ok: true,
      duplicate: true,
      duplicateCount: duplicateReceipt.duplicateCount,
      message: "Webhook already reached a verified terminal state.",
    });
  }
  if (webhookEvent.disposition === "busy") {
    return retryableWebhookResponse("Webhook processing is already in progress.");
  }
  if (webhookEvent.disposition === "exhausted") {
    return NextResponse.json({
      ok: false,
      retryExhausted: true,
      message: "Webhook retry limit reached; owner or admin review is required.",
    });
  }
  if (!webhookEvent.claimToken) {
    return retryableWebhookResponse("Webhook claim token could not be verified.");
  }

  const transitionWebhook = async (
    processingStatus: WebhookTransitionReceipt["processingStatus"],
    errorMessage: string | null = null,
  ) => {
    const { data, error } = await serviceClient.rpc(
      "wtos_transition_gohighlevel_webhook_v1",
      {
        p_event_id: webhookEvent.eventId,
        p_claim_token: webhookEvent.claimToken!,
        p_payload_sha256: payloadSha256,
        p_target_status: processingStatus,
        p_error_message: errorMessage,
      },
    );
    if (error) return null;
    return parseTransitionReceipt(data, {
      eventId: webhookEvent.eventId,
      companyId: connection.company_id,
      payloadSha256,
      claimToken: webhookEvent.claimToken!,
      processingStatus,
    });
  };

  if (isUninstall) {
    const uninstallScope = locationId ? "location" : "company";
    const { data: uninstallResult, error: uninstallError } = await serviceClient.rpc(
      "wtos_finalize_gohighlevel_uninstall_v1",
      {
        p_event_id: webhookEvent.eventId,
        p_claim_token: webhookEvent.claimToken,
        p_payload_sha256: payloadSha256,
        p_scope: uninstallScope,
      },
    );
    const uninstallReceipt = uninstallError
      ? null
      : parseUninstallReceipt(uninstallResult, {
          eventId: webhookEvent.eventId,
          companyId: connection.company_id,
          payloadSha256,
          claimToken: webhookEvent.claimToken,
          processingStatus: "processed",
          scope: uninstallScope,
        });
    if (!uninstallReceipt) {
      await transitionWebhook(
        "failed",
        "HighLevel uninstall transition failed safely.",
      );
      return retryableWebhookResponse("Webhook uninstall transition was not committed.");
    }
    return NextResponse.json({
      ok: true,
      duplicate: uninstallReceipt.idempotent,
      message:
        uninstallScope === "company"
          ? "HighLevel company authorization was revoked for every mapped location."
          : "HighLevel location authorization was revoked.",
    });
  }

  if (!getGoHighLevelOAuthConfig().syncEnabled) {
    const ignoredReceipt = await transitionWebhook("ignored");
    if (!ignoredReceipt) {
      return retryableWebhookResponse("Webhook ignored transition was not committed.");
    }
    return NextResponse.json({
      ok: true,
      ignored: true,
      message: "Verified webhook recorded; inbound synchronization is disabled.",
    });
  }

  try {
    const resourceType = getResourceType(payload);
    const providerRecord = buildWebhookProviderRecord(payload, resourceType, webhookId);
    const contactId = getString(providerRecord, "contactId");
    const directMatch = resourceType === "contact"
      ? await resolveGoHighLevelLocalContactMatch({
          serviceClient,
          companyId: connection.company_id,
          record: providerRecord,
        })
      : null;
    const effectiveDirectMatch = directMatch
      ? await upsertContactMapping({
          serviceClient,
          connection,
          record: providerRecord,
          match: directMatch,
        })
      : null;
    let localMatch:
      | {
          customerId: string | null;
          leadId: string | null;
          matchStatus: "matched_customer" | "matched_lead" | "unmatched" | "ambiguous";
          matchCandidateCount: number;
        }
      | undefined = effectiveDirectMatch ?? undefined;
    if (!localMatch && contactId) {
      const { data: mapping, error: mappingError } = await serviceClient
        .from("gohighlevel_sync_mappings")
        .select("id, local_table, local_record_id, sync_status, conflict_status")
        .eq("company_id", connection.company_id)
        .eq("integration_connection_id", connection.id)
        .eq("provider", "gohighlevel")
        .eq("external_object_type", "contact")
        .eq("external_id", contactId)
        .maybeSingle();
      if (mappingError) {
        throw new Error("HighLevel contact mapping could not be verified.");
      }
      const mappingIsCurrent =
        mapping?.sync_status === "synced" &&
        mapping.conflict_status === "none" &&
        (mapping.local_table === "customers" || mapping.local_table === "leads");
      if (mapping && mappingIsCurrent) {
        const localTarget = mapping.local_table === "customers"
          ? await serviceClient
              .from("customers")
              .select("id")
              .eq("id", mapping.local_record_id)
              .eq("company_id", connection.company_id)
              .maybeSingle()
          : await serviceClient
              .from("leads")
              .select("id")
              .eq("id", mapping.local_record_id)
              .eq("company_id", connection.company_id)
              .maybeSingle();
        if (localTarget.error) {
          throw new Error("HighLevel mapped contact ownership could not be verified.");
        }
        if (localTarget.data) {
          localMatch = {
            customerId:
              mapping.local_table === "customers" ? mapping.local_record_id : null,
            leadId: mapping.local_table === "leads" ? mapping.local_record_id : null,
            matchStatus:
              mapping.local_table === "customers"
                ? "matched_customer"
                : "matched_lead",
            matchCandidateCount: 1,
          };
        } else {
          const { data: quarantined, error: quarantineError } = await serviceClient
            .from("gohighlevel_sync_mappings")
            .update({
              sync_status: "conflict",
              conflict_status: "pending_review",
              conflict_summary:
                "Stored HighLevel contact link is not a current same-company WTOS record.",
              pending_sync: true,
              metadata: { staleOrForeignLocalTarget: true },
            })
            .eq("id", mapping.id)
            .eq("company_id", connection.company_id)
            .eq("integration_connection_id", connection.id)
            .eq("provider", "gohighlevel")
            .select("id")
            .maybeSingle();
          if (quarantineError || !quarantined) {
            throw new Error("HighLevel invalid contact mapping could not be quarantined.");
          }
        }
      }
      localMatch ??= {
        customerId: null,
        leadId: null,
        matchStatus: mapping ? "ambiguous" : "unmatched",
        matchCandidateCount: mapping ? 2 : 0,
      };
    }
    const communicationIdentity =
      resourceType === "message" || resourceType === "call"
        ? await resolveGoHighLevelCommunicationIdentity({
            serviceClient,
            connection,
            record: providerRecord,
          })
        : null;
    if (
      communicationIdentity &&
      (communicationIdentity.disposition === "conflict" ||
        communicationIdentity.disposition === "incomplete" ||
        !communicationIdentity.canonicalExternalId)
    ) {
      const ignoredReceipt = await transitionWebhook("ignored");
      if (!ignoredReceipt) {
        throw new Error(
          "HighLevel webhook reconciliation quarantine could not be committed.",
        );
      }
      return NextResponse.json({
        ok: true,
        ignored: true,
        reconciliationRequired: true,
        message:
          "Verified webhook quarantined for provider identity reconciliation.",
      });
    }

    let communicationSnapshotSafe = true;
    if (
      communicationIdentity &&
      communicationIdentity.channel !== "email"
    ) {
      const communicationResult = await persistGoHighLevelCommunication({
        serviceClient,
        connection,
        record: providerRecord,
        match: localMatch,
        identity: communicationIdentity,
      });
      if (!communicationResult.saved && !communicationResult.ignored) {
        throw new Error("HighLevel webhook communication metadata was incomplete.");
      }
      communicationSnapshotSafe = communicationResult.snapshotSafe === true;
    }

    if (resourceType && communicationSnapshotSafe) {
      const snapshot = buildGoHighLevelResourceSnapshot({
        record: providerRecord,
        resourceType,
        connection,
        match: localMatch,
        canonicalExternalId:
          communicationIdentity?.canonicalExternalId ?? undefined,
      });
      if (!snapshot) {
        throw new Error("HighLevel webhook resource identity was incomplete.");
      }
      const snapshotReceipt = await upsertGoHighLevelResourceSnapshots(
        serviceClient,
        connection,
        [snapshot],
      );
      if (
        snapshotReceipt.failed !== 0 ||
        snapshotReceipt.saved + snapshotReceipt.skipped !== 1
      ) {
        throw new Error("HighLevel webhook resource metadata could not be saved.");
      }
    }
    const processedReceipt = await transitionWebhook("processed");
    if (!processedReceipt) {
      throw new Error("HighLevel webhook terminal transition could not be verified.");
    }
    return NextResponse.json({ ok: true, duplicate: false, message: "Webhook processed." });
  } catch {
    const safeFailure = "HighLevel webhook processing failed safely.";
    const failedReceipt = await transitionWebhook("failed", safeFailure);
    return retryableWebhookResponse(
      failedReceipt
        ? "Webhook failed safely and is eligible for signed provider redelivery."
        : "Webhook failure state could not be fully committed.",
    );
  }
}

function retryableWebhookResponse(message: string) {
  return NextResponse.json(
    { ok: false, processed: false, retryable: true, message },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "30",
      },
    },
  );
}
