import { NextRequest, NextResponse } from "next/server";
import type {
  GoHighLevelResourceSnapshotInsert,
  GoHighLevelResourceType,
} from "../../../../../lib/crm/types";
import {
  buildGoHighLevelWebhookSummary,
  createGoHighLevelFingerprint,
  createGoHighLevelServiceClient,
  getGoHighLevelOAuthConfig,
  verifyGoHighLevelWebhookSignature,
} from "../../../../../lib/gohighlevel/oauth";
import {
  persistGoHighLevelCommunication,
  resolveGoHighLevelLocalContactMatch,
} from "../../../../../lib/gohighlevel/sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
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
  if (!locationId) {
    return NextResponse.json({ ok: true, ignored: true, message: "Webhook has no location mapping." });
  }

  const serviceClient = createGoHighLevelServiceClient();
  if (!serviceClient) {
    return NextResponse.json({ ok: false, message: "Webhook storage is unavailable." }, { status: 503 });
  }

  const { data: connection } = await serviceClient
    .from("integration_connections")
    .select("*")
    .eq("provider", "gohighlevel")
    .eq("external_account_id", locationId)
    .eq("status", "connected")
    .maybeSingle();
  if (!connection) {
    return NextResponse.json({ ok: true, ignored: true, message: "Webhook location is not mapped." });
  }

  const webhookId =
    getString(payload, "webhookId") ?? `derived-${createGoHighLevelFingerprint(rawBody)}`;
  const { data: duplicate } = await serviceClient
    .from("gohighlevel_webhook_events")
    .select("id, processing_status")
    .eq("webhook_id", webhookId)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json({ ok: true, duplicate: true, message: "Webhook already processed." });
  }

  const eventType = getString(payload, "type") ?? "unknown";
  const summary = buildGoHighLevelWebhookSummary(payload);
  const occurredAt = getOccurredAt(payload);
  const { data: webhookEvent, error: webhookInsertError } = await serviceClient
    .from("gohighlevel_webhook_events")
    .insert({
      company_id: connection.company_id,
      integration_connection_id: connection.id,
      webhook_id: webhookId,
      event_type: eventType,
      external_location_id: locationId,
      external_contact_id: getString(payload, "contactId"),
      external_conversation_id: getString(payload, "conversationId"),
      external_message_id: getString(payload, "messageId"),
      signature_version: verification.signatureVersion,
      processing_status: "received",
      attempt_count: 1,
      payload_summary: summary,
      error_message: null,
      occurred_at: occurredAt,
      processed_at: null,
    })
    .select("id")
    .single();
  if (webhookInsertError?.code === "23505") {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      message: "Webhook already processed.",
    });
  }
  if (webhookInsertError || !webhookEvent) {
    return NextResponse.json({ ok: false, message: "Webhook could not be recorded." }, { status: 503 });
  }

  if (eventType.toLowerCase().includes("uninstall")) {
    const revokedAt = new Date().toISOString();
    await serviceClient
      .from("gohighlevel_oauth_credentials")
      .update({ revoked_at: revokedAt })
      .eq("integration_connection_id", connection.id);
    await serviceClient
      .from("integration_connections")
      .update({
        status: "needs_reauth",
        last_failure_at: revokedAt,
        last_error: "The HighLevel Marketplace app was uninstalled from this location.",
      })
      .eq("id", connection.id);
    await serviceClient
      .from("gohighlevel_webhook_events")
      .update({ processing_status: "processed", processed_at: revokedAt })
      .eq("id", webhookEvent.id);
    return NextResponse.json({
      ok: true,
      duplicate: false,
      message: "HighLevel location authorization was revoked.",
    });
  }

  if (!getGoHighLevelOAuthConfig().syncEnabled) {
    await serviceClient
      .from("gohighlevel_webhook_events")
      .update({ processing_status: "ignored", processed_at: new Date().toISOString() })
      .eq("id", webhookEvent.id);
    return NextResponse.json({
      ok: true,
      ignored: true,
      message: "Verified webhook recorded; inbound synchronization is disabled.",
    });
  }

  const contactId = getString(payload, "contactId");
  const { data: contactSnapshot } = contactId
    ? await serviceClient
        .from("gohighlevel_resource_snapshots")
        .select("customer_id, lead_id")
        .eq("integration_connection_id", connection.id)
        .eq("resource_type", "contact")
        .eq("external_id", contactId)
        .maybeSingle()
    : { data: null };

  try {
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
    await serviceClient
      .from("gohighlevel_webhook_events")
      .update({ processing_status: "processed", processed_at: processedAt })
      .eq("id", webhookEvent.id);
    await serviceClient
      .from("integration_connections")
      .update({ last_sync_at: processedAt, last_successful_sync_at: processedAt, last_error: null })
      .eq("id", connection.id);
    return NextResponse.json({ ok: true, duplicate: false, message: "Webhook processed." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await serviceClient
      .from("gohighlevel_webhook_events")
      .update({
        processing_status: "failed",
        error_message: message,
        processed_at: new Date().toISOString(),
      })
      .eq("id", webhookEvent.id);
    return NextResponse.json({ ok: true, processed: false, message: "Webhook was recorded for retry." });
  }
}
