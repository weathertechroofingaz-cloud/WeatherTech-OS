import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../../../lib/supabase/server";
import {
  STRIPE_ALLOWED_COMPANY_NAME,
  STRIPE_BLOCKED_COMPANY_NAME,
  STRIPE_COMPANY_ISOLATION_MIGRATION,
  getStripeCompanyEligibility,
  stripeEndpoints,
  stripePhaseOneGuardrails,
} from "../../../../../lib/stripe/foundation";
import {
  createStripeApiClient,
  createStripeServiceClient,
  getStripeMaskedReadinessConfig,
  getStripeServerConfig,
  probeStripeAccount,
} from "../../../../../lib/stripe/serverClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schemaTables = [
  "stripe_company_accounts",
  "stripe_object_mappings",
  "stripe_webhook_events",
] as const;

export async function GET() {
  const sessionClient = await getSupabaseServerClient();
  const serviceClient = createStripeServiceClient();

  if (!sessionClient || !serviceClient) {
    return NextResponse.json(
      { ok: false, message: "Server-side Supabase access is required." },
      { status: 503 },
    );
  }

  const { data: userResult } = await sessionClient.auth.getUser();
  if (!userResult.user) {
    return NextResponse.json(
      { ok: false, message: "Sign in before checking Stripe readiness." },
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
      { ok: false, message: "A company owner must check Stripe readiness." },
      { status: 403 },
    );
  }

  const schemaChecks = await Promise.all(
    schemaTables.map(async (table) => {
      const { error } = await serviceClient.from(table).select("id").limit(1);
      return { table, available: !error };
    }),
  );
  const schemaApplied = schemaChecks.every((check) => check.available);
  const [{ data: companies }, { data: connections }] = await Promise.all([
    serviceClient
      .from("companies")
      .select("*")
      .in("id", ownerCompanyIds),
    serviceClient
      .from("integration_connections")
      .select("*")
      .eq("provider", "stripe")
      .in("company_id", ownerCompanyIds),
  ]);
  const weatherTech = (companies ?? []).find(
    (company) => company.name === STRIPE_ALLOWED_COMPANY_NAME,
  );
  const ihc = (companies ?? []).find(
    (company) => company.name === STRIPE_BLOCKED_COMPANY_NAME,
  );
  const weatherTechConnection = weatherTech
    ? (connections ?? []).find(
        (connection) => connection.company_id === weatherTech.id,
      ) ?? null
    : null;
  const ihcConnection = ihc
    ? (connections ?? []).find((connection) => connection.company_id === ihc.id) ??
      null
    : null;
  const { data: accounts } =
    schemaApplied && weatherTech
      ? await serviceClient
          .from("stripe_company_accounts")
          .select("*")
          .eq("company_id", weatherTech.id)
      : { data: [] };
  const weatherTechAccount = accounts?.[0] ?? null;
  const config = getStripeMaskedReadinessConfig();
  const serverConfig = getStripeServerConfig();
  const stripe = createStripeApiClient();
  const accountProbe =
    stripe && serverConfig.weatherTechAccountId
      ? await probeStripeAccount(stripe, serverConfig.weatherTechAccountId)
      : null;
  const companyEligible = weatherTech
    ? getStripeCompanyEligibility(weatherTech).eligible
    : false;
  const mappingMatches = Boolean(
    weatherTech &&
      weatherTechConnection &&
      weatherTechAccount &&
      weatherTechConnection.company_id === weatherTech.id &&
      weatherTechAccount.company_id === weatherTech.id &&
      weatherTechConnection.id === weatherTechAccount.integration_connection_id &&
      weatherTechConnection.external_account_id ===
        weatherTechAccount.stripe_account_id,
  );
  const ihcDisabled = !ihcConnection;
  const livePaymentsEnabled = Boolean(
    config.credentials.livePaymentsEnabled &&
      weatherTechAccount?.payment_writes_enabled &&
      mappingMatches &&
      accountProbe?.ok,
  );

  return NextResponse.json({
    ok:
      schemaApplied &&
      config.ok &&
      companyEligible &&
      mappingMatches &&
      ihcDisabled &&
      accountProbe?.ok === true,
    message: !schemaApplied
      ? `Apply ${STRIPE_COMPANY_ISOLATION_MIGRATION} before saving the Stripe account mapping.`
      : !companyEligible
        ? "WeatherTech Roofing LLC could not be resolved as the authorized roofing company."
        : !ihcDisabled
          ? "An unauthorized Stripe mapping exists for IHC Painting."
          : !config.ok
            ? "Stripe server configuration is incomplete."
            : !mappingMatches
              ? "The WeatherTech Roofing Stripe account mapping is not stored yet."
              : accountProbe?.ok !== true
                ? "The configured Stripe account did not pass read-only verification."
                : livePaymentsEnabled
                  ? "WeatherTech Roofing Stripe is verified and live writes are enabled."
                  : "WeatherTech Roofing Stripe is verified; live writes remain disabled.",
    checkedAt: new Date().toISOString(),
    schema: {
      migration: STRIPE_COMPANY_ISOLATION_MIGRATION,
      applied: schemaApplied,
      tables: schemaChecks,
    },
    config,
    companyIsolation: {
      weatherTech: {
        resolved: Boolean(weatherTech),
        eligible: companyEligible,
        connectionStored: Boolean(weatherTechConnection),
        accountMapped: Boolean(weatherTechAccount),
        mappingMatches,
      },
      ihc: {
        resolved: Boolean(ihc),
        paymentFunctionalityEnabled: false,
        unauthorizedConnectionDetected: Boolean(ihcConnection),
      },
    },
    accountProbe,
    livePaymentsEnabled,
    refundsEnabled: Boolean(
      livePaymentsEnabled &&
        config.credentials.refundsEnabled &&
        weatherTechAccount?.refund_writes_enabled,
    ),
    webhookProcessingEnabled: Boolean(
      livePaymentsEnabled &&
        config.credentials.webhookProcessingEnabled &&
        weatherTechAccount?.webhook_processing_enabled,
    ),
    endpoints: stripeEndpoints,
    guardrails: stripePhaseOneGuardrails,
  });
}
