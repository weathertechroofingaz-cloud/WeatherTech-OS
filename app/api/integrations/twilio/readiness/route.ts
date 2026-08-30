import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  createTwilioServiceClient,
  getTwilioConfigCheckResult,
  getTwilioExpectedBusinessNumbers,
  getTwilioServerConfig,
  getTwilioTucsonVoiceForwardingCheckResult,
  getTwilioVoiceForwardingCheckResult,
} from "../../../../../lib/twilio/serverClient";
import {
  getTwilioBusinessNumberRouteTemplate,
  matchesTwilioBusinessRouteTemplate,
  type TwilioLiveReadinessStatus,
} from "../../../../../lib/twilio/foundation";
import {
  createTwilioInboundEvidenceProof,
  createTwilioInboundPayloadFingerprint,
} from "../../../../../lib/twilio/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function maskPhoneNumber(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "") ?? "";

  return digits.length >= 4 ? `****${digits.slice(-4)}` : null;
}

function getReadinessStatus({
  schemaApplied,
  configured,
  inboundGateEnabled,
  configuredNumberCount,
  exactMappedNumberCount,
  inboundValidated,
  outboundDisabled,
}: {
  schemaApplied: boolean;
  configured: boolean;
  inboundGateEnabled: boolean;
  configuredNumberCount: number;
  exactMappedNumberCount: number;
  inboundValidated: boolean;
  outboundDisabled: boolean;
}): TwilioLiveReadinessStatus {
  if (!outboundDisabled) {
    return "error";
  }

  if (!schemaApplied) {
    return "migration_required";
  }

  if (!configured) {
    return "credentials_required";
  }

  if (!configuredNumberCount || exactMappedNumberCount !== configuredNumberCount) {
    return "configuration_required";
  }

  if (!inboundGateEnabled) {
    return "webhook_setup_required";
  }

  return inboundValidated ? "connected" : "ready_for_live_test";
}

export async function GET() {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createTwilioServiceClient();

  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();

  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before checking Twilio readiness." },
      { status: 401 },
    );
  }

  const { data: ownerMemberships } = await sessionClient
    .from("company_memberships")
    .select("company_id, role")
    .eq("user_id", userResult.user.id)
    .eq("role", "owner");
  const ownerCompanyIds = Array.from(
    new Set((ownerMemberships ?? []).map((membership) => membership.company_id)),
  );

  if (!ownerCompanyIds.length) {
    return NextResponse.json(
      { ok: false, message: "A company owner must check Twilio readiness." },
      { status: 403 },
    );
  }

  const [
    companiesResult,
    connectionsResult,
    businessNumbersResult,
    providerEventsResult,
  ] = await Promise.all([
    serviceClient.from("companies").select("id, name").in("id", ownerCompanyIds),
    serviceClient
      .from("integration_connections")
      .select("*")
      .in("company_id", ownerCompanyIds)
      .eq("provider", "twilio_sms"),
    serviceClient
      .from("business_phone_numbers")
      .select("*")
      .in("company_id", ownerCompanyIds)
      .in("provider", ["twilio", "twilio_sms"]),
    serviceClient
      .from("communication_provider_events")
      .select("*")
      .in("company_id", ownerCompanyIds)
      .eq("provider", "twilio")
      .eq("event_type", "sms_inbound")
      .eq("routing_status", "matched")
      .eq("status", "received")
      .not("sms_message_id", "is", null)
      .order("received_at", { ascending: false })
      .limit(200),
  ]);
  const schemaApplied = [
    companiesResult,
    connectionsResult,
    businessNumbersResult,
    providerEventsResult,
  ].every((result) => !result.error);
  const events = providerEventsResult.data ?? [];
  const messageIds = Array.from(
    new Set(
      events
        .map((event) => event.sms_message_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const messagesResult = messageIds.length
    ? await serviceClient
        .from("sms_messages")
        .select("*")
        .in("id", messageIds)
        .eq("direction", "inbound")
        .eq("delivery_status", "received")
    : { data: [], error: null };
  const fullSchemaApplied = schemaApplied && !messagesResult.error;
  const companies = companiesResult.data ?? [];
  const connections = connectionsResult.data ?? [];
  const businessNumbers = businessNumbersResult.data ?? [];
  const messages = messagesResult.data ?? [];
  const config = getTwilioConfigCheckResult();
  const rawConfig = getTwilioServerConfig();
  const ownerCompanyNames = new Set(companies.map((company) => company.name));
  const allExpectedNumbers = getTwilioExpectedBusinessNumbers();
  const expectedNumbers = allExpectedNumbers.filter((number) =>
    ownerCompanyNames.has(number.company),
  );
  const configuredPhoneCounts = new Map<string, number>();

  for (const expected of allExpectedNumbers) {
    if (expected.phoneNumberE164) {
      configuredPhoneCounts.set(
        expected.phoneNumberE164,
        (configuredPhoneCounts.get(expected.phoneNumberE164) ?? 0) + 1,
      );
    }
  }

  const routes = expectedNumbers.map((expected) => {
    const company = companies.find((candidate) => candidate.name === expected.company) ?? null;
    const companyRoutes = company
      ? businessNumbers.filter((candidate) => candidate.company_id === company.id)
      : [];
    const matchingRoutes = expected.phoneNumberE164
      ? companyRoutes.filter(
          (candidate) => candidate.phone_number_e164 === expected.phoneNumberE164,
        )
      : [];
    const route = matchingRoutes.length === 1 ? matchingRoutes[0] : null;
    const connection = route?.integration_connection_id
      ? connections.find(
          (candidate) =>
            candidate.id === route.integration_connection_id &&
            candidate.company_id === route.company_id,
        ) ?? null
      : null;
    const connectionAccountSid =
      connection?.provider_account_id ?? connection?.external_account_id ?? null;
    const accountMatches = Boolean(
      rawConfig.accountSid &&
        route &&
        route.provider_account_sid === rawConfig.accountSid &&
        route.messaging_service_sid === rawConfig.messagingServiceSid &&
        connectionAccountSid === rawConfig.accountSid,
    );
    const exactNumberMatches = Boolean(
      expected.phoneNumberE164 &&
        configuredPhoneCounts.get(expected.phoneNumberE164) === 1 &&
        route?.phone_number_e164 === expected.phoneNumberE164,
    );
    const routeTemplate = getTwilioBusinessNumberRouteTemplate(expected.routeKey);
    const routeIdentityMatches = matchesTwilioBusinessRouteTemplate(
      route,
      routeTemplate,
      "sms",
    );
    const exactMapped = Boolean(
      company &&
        route &&
        connection &&
        route.company_id === company.id &&
        connection.company_id === company.id &&
        connection.provider === "twilio_sms" &&
        connection.status === "connected" &&
        !connection.disabled_at &&
        route.routing_status === "active" &&
        routeIdentityMatches &&
        accountMatches &&
        exactNumberMatches,
    );
    const validatedEvent = exactMapped
      ? events.find((event) => {
          const message = messages.find((candidate) => candidate.id === event.sms_message_id);
          const payloadFingerprint = message
            ? createTwilioInboundPayloadFingerprint({
                accountSid: message.provider_account_sid ?? "",
                messageSid: message.twilio_message_sid ?? "",
                messagingServiceSid: message.provider_messaging_service_sid ?? "",
                from: message.from_phone ?? "",
                to: message.to_phone,
                body: message.body,
                companyId: message.company_id,
              })
            : null;
          const evidenceProof = message
            ? createTwilioInboundEvidenceProof({
                messageId: message.id,
                eventId: event.id,
                companyId: message.company_id,
                connectionId: message.integration_connection_id ?? "",
                businessPhoneNumberId: message.business_phone_number_id ?? "",
                customerId: message.customer_id,
                leadId: message.lead_id,
                accountSid: message.provider_account_sid ?? "",
                messagingServiceSid: message.provider_messaging_service_sid ?? "",
                messageSid: message.twilio_message_sid ?? "",
                from: message.from_phone ?? "",
                to: message.to_phone,
                payloadFingerprint: payloadFingerprint ?? "",
                signatureEvidence:
                  typeof event.payload_summary?.signature_evidence === "string"
                    ? event.payload_summary.signature_evidence
                    : "",
              })
            : null;

          return Boolean(
            message &&
              evidenceProof &&
              event.company_id === company?.id &&
              event.business_phone_number_id === route?.id &&
              event.integration_connection_id === connection?.id &&
              event.provider_account_sid === rawConfig.accountSid &&
              event.provider === "twilio" &&
              event.event_type === "sms_inbound" &&
              event.direction === "inbound" &&
              event.status === "received" &&
              event.routing_status === "matched" &&
              event.payload_summary?.signature_validated === true &&
              typeof event.payload_summary?.signature_evidence === "string" &&
              /^[a-f0-9]{64}$/.test(event.payload_summary.signature_evidence) &&
              message.company_id === company?.id &&
              message.business_phone_number_id === route?.id &&
              message.integration_connection_id === connection?.id &&
              message.provider_account_sid === rawConfig.accountSid &&
              message.provider_messaging_service_sid === rawConfig.messagingServiceSid &&
              message.twilio_message_sid === event.provider_event_sid &&
              message.direction === "inbound" &&
              message.delivery_status === "received" &&
              message.provider_payload_fingerprint === payloadFingerprint &&
              event.request_fingerprint === payloadFingerprint &&
              event.sms_message_id === message.id &&
              event.customer_id === message.customer_id &&
              event.lead_id === message.lead_id &&
              event.from_phone === message.from_phone &&
              event.to_phone === message.to_phone &&
              event.business_phone === message.to_phone &&
              event.customer_phone === message.from_phone &&
              message.metadata?.ingestion_status === "complete" &&
              message.metadata?.provider_event_id === event.id &&
              message.metadata?.evidence_proof === evidenceProof &&
              event.response_summary?.evidence_proof === evidenceProof,
          );
        }) ?? null
      : null;

    return {
      key: expected.key,
      routeKey: expected.routeKey,
      label: expected.label,
      company: expected.company,
      configured: Boolean(expected.phoneNumberE164),
      maskedPhoneNumber: maskPhoneNumber(expected.phoneNumberE164),
      companyResolved: Boolean(company),
      connectionStored: Boolean(connection),
      connectionStatus: connection?.status ?? null,
      routeStored: Boolean(route),
      routingStatus: route?.routing_status ?? null,
      accountMatches,
      exactNumberMatches,
      routeIdentityMatches,
      exactMapped,
      inboundValidated: Boolean(validatedEvent),
      lastValidatedInboundAt: validatedEvent?.received_at ?? null,
    };
  });
  const configuredRoutes = routes.filter((route) => route.configured);
  const exactMappedRoutes = configuredRoutes.filter((route) => route.exactMapped);
  const ownerConfigurationReady = config.ok && configuredRoutes.length > 0;
  const inboundValidated =
    configuredRoutes.length > 0 &&
    exactMappedRoutes.length === configuredRoutes.length &&
    exactMappedRoutes.every((route) => route.inboundValidated);
  const expectedConfiguredPhones = new Set(
    expectedNumbers
      .map((number) => number.phoneNumberE164)
      .filter((number): number is string => Boolean(number)),
  );
  const unexpectedActiveMappings = businessNumbers
    .filter(
      (number) =>
        number.routing_status === "active" &&
        (!number.phone_number_e164 ||
          !expectedConfiguredPhones.has(number.phone_number_e164)),
    )
    .map((number) => ({
      company:
        companies.find((company) => company.id === number.company_id)?.name ??
        "Unknown company",
      maskedPhoneNumber: maskPhoneNumber(number.phone_number_e164),
      routingKey: number.routing_key,
    }));
  const outboundDisabled = !rawConfig.outboundSmsEnabled;
  const expectedVoiceNumbers = expectedNumbers.filter(
    (expected) => expected.voiceHandling === "twilio_forwarding",
  );
  const voiceRouteExactByKey = Object.fromEntries(
    expectedVoiceNumbers.map((expected) => {
      const storedRoutes = expected.phoneNumberE164
        ? businessNumbers.filter(
            (number) =>
              number.phone_number_e164 === expected.phoneNumberE164,
          )
        : [];
      const smsReadiness = routes.find(
        (route) => route.routeKey === expected.routeKey,
      );
      const routeExact = Boolean(
        smsReadiness?.exactMapped &&
          storedRoutes.length === 1 &&
          matchesTwilioBusinessRouteTemplate(
            storedRoutes[0],
            getTwilioBusinessNumberRouteTemplate(expected.routeKey),
            "voice",
          ),
      );

      return [expected.routeKey, routeExact];
    }),
  );
  const fullVoiceForwarding = getTwilioVoiceForwardingCheckResult({
    routeExactByKey: voiceRouteExactByKey,
    config: rawConfig,
  });
  const ownerVoiceRouteKeys = new Set(
    expectedVoiceNumbers.map((number) => number.routeKey),
  );
  const voiceForwarding = {
    ...fullVoiceForwarding,
    routes: fullVoiceForwarding.routes.filter((route) =>
      ownerVoiceRouteKeys.has(route.routeKey),
    ),
  };
  const tucsonVoiceRouteExact =
    voiceRouteExactByKey["weathertech-tucson"] === true;
  const tucsonVoiceForwarding = ownerVoiceRouteKeys.has("weathertech-tucson")
    ? getTwilioTucsonVoiceForwardingCheckResult({
        routeExact: tucsonVoiceRouteExact,
        config: rawConfig,
      })
    : {
        enabled: false,
        destinationConfigured: false,
        destinationValid: false,
        maskedDestination: null,
        loopDetected: false,
        routeExact: false,
        ready: false,
        webhookUrl: fullVoiceForwarding.webhookUrl,
      };
  const baseStatus = getReadinessStatus({
    schemaApplied: fullSchemaApplied,
    configured: ownerConfigurationReady,
    inboundGateEnabled: rawConfig.inboundSmsEnabled,
    configuredNumberCount: configuredRoutes.length,
    exactMappedNumberCount: exactMappedRoutes.length,
    inboundValidated,
    outboundDisabled,
  });
  const status: TwilioLiveReadinessStatus = unexpectedActiveMappings.length
    ? "error"
    : baseStatus;
  const ok =
    status === "connected" &&
    unexpectedActiveMappings.length === 0 &&
    outboundDisabled;

  return NextResponse.json({
    ok,
    status,
    message: !outboundDisabled
      ? "Outbound SMS is enabled unexpectedly; disable it before using inbound production messaging."
      : !fullSchemaApplied
        ? "The Twilio inbound schema is not available."
        : unexpectedActiveMappings.length
          ? "An active Twilio number exists outside the explicitly configured company-number mapping."
        : !ownerConfigurationReady
          ? "Twilio inbound server configuration is incomplete."
          : !configuredRoutes.length
            ? "No company-controlled Twilio number is configured."
            : exactMappedRoutes.length !== configuredRoutes.length
              ? "One or more configured Twilio numbers lacks an exact active company mapping."
              : !rawConfig.inboundSmsEnabled
                ? "Exact number mapping is ready; inbound processing remains disabled."
                : !inboundValidated
                  ? "Twilio inbound is configured and mapped; a controlled signed inbound SMS is still required."
                  : "Twilio inbound SMS is configured, exactly mapped, and validated; outbound SMS remains disabled.",
    checkedAt: new Date().toISOString(),
    configuration: {
      configured: ownerConfigurationReady,
      missing: config.missing,
      accountSid: config.credentials.accountSid,
      authTokenConfigured: Boolean(config.credentials.authToken),
      publicBaseUrl: config.credentials.publicBaseUrl,
      inboundWebhookUrl: config.inboundWebhookUrl,
      inboundGateEnabled: rawConfig.inboundSmsEnabled,
      outboundSmsEnabled: rawConfig.outboundSmsEnabled,
      outboundSmsDisabled: outboundDisabled,
      outboundLockedInApplication: true,
    },
    schema: {
      applied: fullSchemaApplied,
      businessPhoneNumbersAvailable: !businessNumbersResult.error,
      providerEventsAvailable: !providerEventsResult.error,
      inboundMessagesAvailable: !messagesResult.error,
    },
    mapping: {
      configuredNumberCount: configuredRoutes.length,
      exactMappedNumberCount: exactMappedRoutes.length,
      routes,
      unexpectedActiveMappings,
    },
    inboundValidated,
    outboundDisabled,
    voiceForwarding,
    tucsonVoiceForwarding,
    communicationsSent: false,
  });
}
