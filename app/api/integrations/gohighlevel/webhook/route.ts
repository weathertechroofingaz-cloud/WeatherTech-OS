import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type {
  GoHighLevelResourceSnapshotInsert,
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
  persistGoHighLevelCommunication,
  resolveGoHighLevelLocalContactMatch,
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
  const raw = payload.timestamp ?? payload.dateAdded ?? payload.createdAt;
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
    return getString(payload, "messageId", "id");
  }
  if (resourceType === "opportunity") return getString(payload, "opportunityId", "id");
  if (resourceType === "calendar_event") return getString(payload, "appointmentId", "calendarId", "id");
  return getString(payload, "reviewId", "id");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
      .select("company_id, integration_connection_id")
      .eq("external_company_id", externalCompanyId)
      .limit(200);
    if (credentialsError) {
      return retryableWebhookResponse("Webhook company mapping could not be verified.");
    }

    const companyIds = new Set((credentials ?? []).map((item) => item.company_id));
    if (companyIds.size > 1) {
      return NextResponse.json(
        { ok: false, message: "Webhook company mapping is ambiguous." },
        { status: 409 },
      );
    }
    const anchorConnectionId = credentials?.[0]?.integration_connection_id ?? null;
    if (anchorConnectionId) {
      const { data: anchorConnection, error: anchorError } = await serviceClient
        .from("integration_connections")
        .select("*")
        .eq("id", anchorConnectionId)
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
        externalMessageId: getString(payload, "messageId"),
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
    return NextResponse.json({
      ok: true,
      duplicate: true,
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

  const contactId = getString(payload, "contactId");
  try {
    const contactLookup = contactId
      ? await serviceClient
          .from("gohighlevel_resource_snapshots")
          .select("customer_id, lead_id")
          .eq("integration_connection_id", connection.id)
          .eq("resource_type", "contact")
          .eq("external_id", contactId)
          .maybeSingle()
      : { data: null, error: null };
    if (contactLookup.error) {
      throw new Error("HighLevel contact mapping could not be verified.");
    }
    const contactSnapshot = contactLookup.data;
    const resourceType = getResourceType(payload);
    const directMatch =
      resourceType === "contact" &&
      !contactSnapshot?.customer_id &&
      !contactSnapshot?.lead_id
        ? await resolveGoHighLevelLocalContactMatch({
            serviceClient,
            companyId: connection.company_id,
            record: payload,
          })
        : null;
    const localMatch = {
      customerId: contactSnapshot?.customer_id ?? directMatch?.customerId ?? null,
      leadId: contactSnapshot?.lead_id ?? directMatch?.leadId ?? null,
    };
    const externalId = resourceType ? getExternalId(payload, resourceType) : null;
    if (resourceType && externalId) {
      const directionValue = getString(payload, "direction")?.toLowerCase();
      const direction =
        directionValue === "inbound" || directionValue === "incoming"
          ? "inbound"
          : directionValue === "outbound" || directionValue === "outgoing"
            ? "outbound"
            : null;
      const snapshot: GoHighLevelResourceSnapshotInsert = {
        company_id: connection.company_id,
        integration_connection_id: connection.id,
        resource_type: resourceType,
        external_id: externalId,
        external_parent_id: getString(payload, "conversationId", "pipelineId", "calendarId"),
        external_contact_id: contactId,
        customer_id: localMatch.customerId,
        lead_id: localMatch.leadId,
        direction,
        status: getString(payload, "status", "callStatus"),
        body_preview:
          typeof summary.bodyPreview === "string" ? summary.bodyPreview : null,
        occurred_at: occurredAt,
        provider_updated_at: occurredAt,
        payload_summary: summary,
      };
      const { error: snapshotError } = await serviceClient
        .from("gohighlevel_resource_snapshots")
        .upsert(snapshot, {
        onConflict: "integration_connection_id,resource_type,external_id",
      });
      if (snapshotError) {
        throw new Error("HighLevel webhook resource metadata could not be saved.");
      }
    }

    await persistGoHighLevelCommunication({
      serviceClient,
      connection,
      record: payload,
      match: localMatch,
    });
    const processedAt = new Date().toISOString();
    const { error: connectionUpdateError } = await serviceClient
      .from("integration_connections")
      .update({ last_sync_at: processedAt, last_successful_sync_at: processedAt, last_error: null })
      .eq("id", connection.id);
    if (connectionUpdateError) {
      throw new Error("HighLevel connection health could not be updated.");
    }
    const processedReceipt = await transitionWebhook("processed");
    if (!processedReceipt) {
      throw new Error("HighLevel webhook terminal transition could not be verified.");
    }
    return NextResponse.json({ ok: true, duplicate: false, message: "Webhook processed." });
  } catch {
    const failedAt = new Date().toISOString();
    const safeFailure = "HighLevel webhook processing failed safely.";
    const failedReceipt = await transitionWebhook("failed", safeFailure);
    const { error: connectionFailureError } = await serviceClient
      .from("integration_connections")
      .update({
        last_failure_at: failedAt,
        last_error: safeFailure,
      })
      .eq("id", connection.id);
    return retryableWebhookResponse(
      failedReceipt && !connectionFailureError
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
