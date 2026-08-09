import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import type {
  CompanyRecord,
  Database,
  IntegrationConnectionRecord,
  StripeCompanyAccountRecord,
} from "../crm/types";
import {
  STRIPE_ALLOWED_COMPANY_NAME,
  getStripeCompanyEligibility,
  getStripeConfigCheckResult,
  sanitizeStripeErrorMessage,
  stripeEnvVars,
} from "./foundation";

type ServiceClient = SupabaseClient<Database>;

function getServerEnv(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

export type StripeServerConfig = {
  secretKey: string | null;
  webhookSecret: string | null;
  weatherTechAccountId: string | null;
  publicBaseUrl: string | null;
  livePaymentsEnabled: boolean;
  refundsEnabled: boolean;
  webhookProcessingEnabled: boolean;
};

export type StripeCompanyAccountContext = {
  company: CompanyRecord;
  connection: IntegrationConnectionRecord;
  account: StripeCompanyAccountRecord;
};

export type StripeAccountProbe = {
  ok: boolean;
  accountIdMatches: boolean;
  livemode: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  country: string | null;
  defaultCurrency: string | null;
  businessNameMatches: boolean;
  cardPaymentsStatus: string | null;
  achPaymentsStatus: string | null;
  error: string | null;
};

export function getStripeServerConfig(): StripeServerConfig {
  return {
    secretKey: getServerEnv(stripeEnvVars.secretKey),
    webhookSecret: getServerEnv(stripeEnvVars.webhookSecret),
    weatherTechAccountId: getServerEnv(stripeEnvVars.weatherTechAccountId),
    publicBaseUrl: getServerEnv(stripeEnvVars.publicBaseUrl),
    livePaymentsEnabled:
      getServerEnv(stripeEnvVars.livePaymentsEnabled)?.toLowerCase() === "true",
    refundsEnabled:
      getServerEnv(stripeEnvVars.refundsEnabled)?.toLowerCase() === "true",
    webhookProcessingEnabled:
      getServerEnv(stripeEnvVars.webhookProcessingEnabled)?.toLowerCase() ===
      "true",
  };
}

export function createStripeServiceClient(): ServiceClient | null {
  const supabaseUrl = getServerEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getServerEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createStripeApiClient() {
  const config = getStripeServerConfig();

  if (!config.secretKey) {
    return null;
  }

  return new Stripe(config.secretKey, {
    appInfo: {
      name: "WeatherTech OS",
      version: "stripe-phase-1",
    },
    maxNetworkRetries: 2,
    timeout: 20_000,
  });
}

export async function getStripeCompanyAccountContext(
  client: ServiceClient,
  companyId: string,
): Promise<StripeCompanyAccountContext> {
  const { data: company, error: companyError } = await client
    .from("companies")
    .select("*")
    .eq("id", companyId)
    .single();

  if (companyError || !company) {
    throw new Error("Stripe company could not be resolved.");
  }

  const eligibility = getStripeCompanyEligibility(company);
  if (!eligibility.eligible) {
    throw new Error(eligibility.message);
  }

  const { data: connection, error: connectionError } = await client
    .from("integration_connections")
    .select("*")
    .eq("company_id", company.id)
    .eq("provider", "stripe")
    .single();

  if (connectionError || !connection) {
    throw new Error("WeatherTech Roofing does not have a saved Stripe connection.");
  }

  const { data: account, error: accountError } = await client
    .from("stripe_company_accounts")
    .select("*")
    .eq("company_id", company.id)
    .eq("integration_connection_id", connection.id)
    .single();

  if (accountError || !account) {
    throw new Error("WeatherTech Roofing does not have a verified Stripe account mapping.");
  }

  if (
    connection.external_account_id !== account.stripe_account_id ||
    connection.company_id !== account.company_id
  ) {
    throw new Error("Stripe account mapping failed its company-isolation check.");
  }

  return { company, connection, account };
}

export async function probeStripeAccount(
  stripe: Stripe,
  expectedAccountId: string,
): Promise<StripeAccountProbe> {
  try {
    const account = await stripe.accounts.retrieveCurrent();
    const keyMode = getStripeConfigCheckResult(process.env).credentials.secretKeyMode;
    const businessName =
      account.business_profile?.name ?? account.settings?.dashboard?.display_name;
    const normalizedBusinessName = businessName
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
    const normalizedAllowedName = STRIPE_ALLOWED_COMPANY_NAME.toLowerCase().replace(
      /[^a-z0-9]+/g,
      "",
    );

    return {
      ok:
        account.id === expectedAccountId &&
        normalizedBusinessName === normalizedAllowedName &&
        keyMode === "live",
      accountIdMatches: account.id === expectedAccountId,
      livemode: keyMode === "live",
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      country: account.country ?? null,
      defaultCurrency: account.default_currency ?? null,
      businessNameMatches: normalizedBusinessName === normalizedAllowedName,
      cardPaymentsStatus: account.capabilities?.card_payments ?? null,
      achPaymentsStatus: account.capabilities?.us_bank_account_ach_payments ?? null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      accountIdMatches: false,
      livemode: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      country: null,
      defaultCurrency: null,
      businessNameMatches: false,
      cardPaymentsStatus: null,
      achPaymentsStatus: null,
      error: sanitizeStripeErrorMessage(error),
    };
  }
}

export function getStripeMaskedReadinessConfig() {
  return getStripeConfigCheckResult(process.env);
}
