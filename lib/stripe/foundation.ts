import { createHash } from "node:crypto";

export const STRIPE_PROVIDER_ID = "stripe" as const;
export const STRIPE_ALLOWED_COMPANY_NAME = "WeatherTech Roofing LLC";
export const STRIPE_BLOCKED_COMPANY_NAME = "IHC Painting";
export const STRIPE_COMPANY_ISOLATION_MIGRATION =
  "20260808222141_stripe_company_isolation.sql";

export const stripeEnvVars = {
  secretKey: "STRIPE_SECRET_KEY",
  webhookSecret: "STRIPE_WEBHOOK_SECRET",
  weatherTechAccountId: "STRIPE_WEATHERTECH_ACCOUNT_ID",
  publicBaseUrl: "STRIPE_PUBLIC_BASE_URL",
  livePaymentsEnabled: "STRIPE_LIVE_PAYMENTS_ENABLED",
  refundsEnabled: "STRIPE_REFUNDS_ENABLED",
  webhookProcessingEnabled: "STRIPE_WEBHOOK_PROCESSING_ENABLED",
} as const;

export const stripeEndpoints = {
  readiness: "/api/integrations/stripe/readiness",
  paymentIntents: "/api/integrations/stripe/payment-intents",
  refunds: "/api/integrations/stripe/refunds",
  webhook: "/api/integrations/stripe/webhook",
} as const;

export const stripePhaseOneGuardrails = {
  sourceOfTruth: "supabase",
  allowedCompany: STRIPE_ALLOWED_COMPANY_NAME,
  blockedCompany: STRIPE_BLOCKED_COMPANY_NAME,
  automaticPayments: false,
  automaticRefunds: false,
  browserSecretAccess: false,
  requireOwnerApproval: true,
  liveWritesDefaultEnabled: false,
} as const;

export type StripeCompanyDescriptor = {
  id: string;
  name: string;
  trade: string;
};

export type StripeCompanyEligibility = {
  eligible: boolean;
  reason: "weathertech_only" | "company_not_authorized";
  message: string;
};

export type StripeConfigCheckResult = {
  ok: boolean;
  status: "ready" | "missing_config" | "malformed_config";
  checkedAt: string;
  missing: string[];
  malformed: string[];
  credentials: {
    secretKeyDetected: boolean;
    secretKeyMode: "live" | "test" | "unknown" | "missing";
    webhookSecretDetected: boolean;
    weatherTechAccountIdDetected: boolean;
    publicBaseUrlDetected: boolean;
    livePaymentsEnabled: boolean;
    refundsEnabled: boolean;
    webhookProcessingEnabled: boolean;
  };
};

export type StripeOperationType =
  | "payment_intent"
  | "deposit"
  | "refund";

export type StripeOperationIdentity = {
  operation: StripeOperationType;
  companyId: string;
  invoiceId: string;
  amountCents: number;
  attemptKey: string;
};

function trimmedEnvValue(
  env: Record<string, string | undefined>,
  name: string,
) {
  const value = env[name]?.trim();
  return value || null;
}

function booleanEnvValue(
  env: Record<string, string | undefined>,
  name: string,
) {
  return trimmedEnvValue(env, name)?.toLowerCase() === "true";
}

function secretKeyMode(value: string | null) {
  if (!value) {
    return "missing" as const;
  }

  if (value.startsWith("sk_live_")) {
    return "live" as const;
  }

  if (value.startsWith("sk_test_")) {
    return "test" as const;
  }

  return "unknown" as const;
}

export function getStripeCompanyEligibility(
  company: StripeCompanyDescriptor,
): StripeCompanyEligibility {
  if (
    company.name === STRIPE_ALLOWED_COMPANY_NAME &&
    company.trade === "roofing"
  ) {
    return {
      eligible: true,
      reason: "weathertech_only",
      message: "Stripe is authorized only for WeatherTech Roofing LLC.",
    };
  }

  return {
    eligible: false,
    reason: "company_not_authorized",
    message:
      company.name === STRIPE_BLOCKED_COMPANY_NAME
        ? "IHC Painting remains disabled until it has a separately authorized Stripe account."
        : "This company is not authorized for the WeatherTech Roofing Stripe account.",
  };
}

export function getStripeConfigCheckResult(
  env: Record<string, string | undefined> = process.env,
  now = new Date(),
): StripeConfigCheckResult {
  const secretKey = trimmedEnvValue(env, stripeEnvVars.secretKey);
  const webhookSecret = trimmedEnvValue(env, stripeEnvVars.webhookSecret);
  const accountId = trimmedEnvValue(env, stripeEnvVars.weatherTechAccountId);
  const publicBaseUrl = trimmedEnvValue(env, stripeEnvVars.publicBaseUrl);
  const missing: string[] = [];
  const malformed: string[] = [];

  if (!secretKey) missing.push(stripeEnvVars.secretKey);
  if (!webhookSecret) missing.push(stripeEnvVars.webhookSecret);
  if (!accountId) missing.push(stripeEnvVars.weatherTechAccountId);
  if (!publicBaseUrl) missing.push(stripeEnvVars.publicBaseUrl);
  if (secretKey && !/^sk_(live|test)_[A-Za-z0-9]+$/.test(secretKey)) {
    malformed.push(stripeEnvVars.secretKey);
  }
  if (webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(webhookSecret)) {
    malformed.push(stripeEnvVars.webhookSecret);
  }
  if (accountId && !/^acct_[A-Za-z0-9]+$/.test(accountId)) {
    malformed.push(stripeEnvVars.weatherTechAccountId);
  }
  if (publicBaseUrl && !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(publicBaseUrl)) {
    malformed.push(stripeEnvVars.publicBaseUrl);
  }

  return {
    ok: missing.length === 0 && malformed.length === 0,
    status: malformed.length
      ? "malformed_config"
      : missing.length
        ? "missing_config"
        : "ready",
    checkedAt: now.toISOString(),
    missing,
    malformed,
    credentials: {
      secretKeyDetected: Boolean(secretKey),
      secretKeyMode: secretKeyMode(secretKey),
      webhookSecretDetected: Boolean(webhookSecret),
      weatherTechAccountIdDetected: Boolean(accountId),
      publicBaseUrlDetected: Boolean(publicBaseUrl),
      livePaymentsEnabled: booleanEnvValue(
        env,
        stripeEnvVars.livePaymentsEnabled,
      ),
      refundsEnabled: booleanEnvValue(env, stripeEnvVars.refundsEnabled),
      webhookProcessingEnabled: booleanEnvValue(
        env,
        stripeEnvVars.webhookProcessingEnabled,
      ),
    },
  };
}

export function createStripeOperationKey(identity: StripeOperationIdentity) {
  const payload = [
    "stripe-v1",
    identity.operation,
    identity.companyId,
    identity.invoiceId,
    String(identity.amountCents),
    identity.attemptKey,
  ].join(":");

  return `wtos_${createHash("sha256").update(payload).digest("hex")}`;
}

export function buildStripeObjectMetadata(input: {
  companyId: string;
  customerId: string | null;
  invoiceId: string;
  operationKey: string;
}) {
  return {
    wtos_company_id: input.companyId,
    wtos_customer_id: input.customerId ?? "none",
    wtos_invoice_id: input.invoiceId,
    wtos_operation_key: input.operationKey,
    wtos_source_of_truth: "supabase",
  } as const;
}

export function sanitizeStripeErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, "[redacted]")
    .replace(
      /client_secret(?:["']?\s*[:=]\s*["']?)?[^\s,"'}]+/gi,
      "client_secret=[redacted]",
    )
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .slice(0, 500);
}
