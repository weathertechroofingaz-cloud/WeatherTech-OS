export const STRIPE_PAYMENT_INTENT_PATH =
  "/api/integrations/stripe/payment-intents" as const;
export const STRIPE_REFUND_PATH =
  "/api/integrations/stripe/refunds" as const;
export const STRIPE_READINESS_PATH =
  "/api/integrations/stripe/readiness" as const;
export const STRIPE_CLIENT_ALLOWED_COMPANY_NAME =
  "WeatherTech Roofing LLC" as const;

export type StripeClientCompany = {
  id: string;
  name: string;
  trade: string;
};

export type StripePaymentIntentRequest = {
  companyId: string;
  invoiceId: string;
  amountCents: number;
  kind: "payment_intent";
  attemptKey: string;
  ownerApproval: true;
};

export type StripePaymentIntentResult = {
  paymentIntentId: string;
  clientSecret: string | null;
  status: string;
  duplicatePrevented: boolean;
};

export type StripeRefundRequest = {
  companyId: string;
  paymentId: string;
  amountCents: number;
  attemptKey: string;
  reason: "requested_by_customer";
  ownerApproval: true;
};

export type StripeRefundResult = {
  refundId: string;
  status: string;
  duplicatePrevented: boolean;
};

const stripeClientReadinessEnvironmentVariableNames = new Set([
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEATHERTECH_ACCOUNT_ID",
  "STRIPE_PUBLIC_BASE_URL",
]);

export type StripeClientReadinessDiagnostic = {
  status: "ready" | "missing_config" | "malformed_config";
  missing: string[];
  malformed: string[];
};

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export function isStripeClientCompanyEligible(
  company: StripeClientCompany | null | undefined,
) {
  return Boolean(
    company &&
      company.name === STRIPE_CLIENT_ALLOWED_COMPANY_NAME &&
      company.trade === "roofing",
  );
}

export function isStripeClientRefundEligible(input: {
  company: StripeClientCompany | null | undefined;
  paymentCompanyId: string;
  paymentMethod: string;
  paymentStatus: string;
  isCompanyOwner: boolean;
  isDemoMode: boolean;
}) {
  return Boolean(
    isStripeClientCompanyEligible(input.company) &&
      input.company?.id === input.paymentCompanyId &&
      input.paymentMethod === "stripe" &&
      input.paymentStatus === "posted" &&
      input.isCompanyOwner &&
      !input.isDemoMode,
  );
}

export function isStripeRefundSubmissionAllowed(input: {
  readinessStatus: "checking" | "disabled" | "ready";
  ownerApproved: boolean;
  isSubmitting: boolean;
  submitted: boolean;
}) {
  return Boolean(
    input.readinessStatus === "ready" &&
      input.ownerApproved &&
      !input.isSubmitting &&
      !input.submitted,
  );
}

export function isStripeRefundReadinessEnabled(input: {
  responseOk: boolean;
  ok: unknown;
  livePaymentsEnabled: unknown;
  refundsEnabled: unknown;
  webhookProcessingEnabled: unknown;
}) {
  return Boolean(
    input.responseOk &&
      input.ok === true &&
      input.livePaymentsEnabled === true &&
      input.refundsEnabled === true &&
      input.webhookProcessingEnabled === true,
  );
}

export function isStripePaymentReadinessEnabled(input: {
  responseOk: boolean;
  ok: unknown;
  livePaymentsEnabled: unknown;
}) {
  return Boolean(
    input.responseOk &&
      input.ok === true &&
      input.livePaymentsEnabled === true,
  );
}

export function getStripeRefundAmountCents(amount: number) {
  if (!Number.isFinite(amount)) {
    return null;
  }

  const amountCents = Math.round(amount * 100);
  if (
    !Number.isSafeInteger(amountCents) ||
    amountCents < 50 ||
    Math.abs(amount - amountCents / 100) > Number.EPSILON * 100
  ) {
    return null;
  }

  return amountCents;
}

export function parseStripePaymentAmount(
  value: string,
  maximumBalance: number,
): { ok: true; amountCents: number } | { ok: false; message: string } {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalized)) {
    return {
      ok: false,
      message: "Enter a valid USD amount with no more than two decimal places.",
    };
  }

  const [wholePart, fractionalPart = ""] = normalized.split(".");
  const amountCents =
    Number.parseInt(wholePart, 10) * 100 +
    Number.parseInt(fractionalPart.padEnd(2, "0") || "0", 10);
  const maximumCents = Math.round(maximumBalance * 100);

  if (!Number.isSafeInteger(amountCents) || amountCents < 50) {
    return { ok: false, message: "Stripe payments must be at least $0.50." };
  }

  if (amountCents > maximumCents) {
    return {
      ok: false,
      message: "Payment amount exceeds the remaining invoice balance.",
    };
  }

  return { ok: true, amountCents };
}

export function buildStripePaymentIntentRequest(input: {
  companyId: string;
  invoiceId: string;
  amountCents: number;
  attemptKey: string;
}): StripePaymentIntentRequest {
  return {
    companyId: input.companyId,
    invoiceId: input.invoiceId,
    amountCents: input.amountCents,
    kind: "payment_intent",
    attemptKey: input.attemptKey,
    ownerApproval: true,
  };
}

export function buildStripeRefundRequest(input: {
  companyId: string;
  paymentId: string;
  amountCents: number;
  attemptKey: string;
}): StripeRefundRequest {
  return {
    companyId: input.companyId,
    paymentId: input.paymentId,
    amountCents: input.amountCents,
    attemptKey: input.attemptKey,
    reason: "requested_by_customer",
    ownerApproval: true,
  };
}

export function sanitizeStripeClientMessage(
  value: unknown,
  fallback = "WeatherTech OS could not prepare the secure Stripe payment.",
) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  return value
    .replace(/sk_(live|test)_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/whsec_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .slice(0, 240);
}

export function parseStripeReadinessDiagnostic(
  value: unknown,
): StripeClientReadinessDiagnostic | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const config = value as Record<string, unknown>;
  if (
    config.status !== "ready" &&
    config.status !== "missing_config" &&
    config.status !== "malformed_config"
  ) {
    return null;
  }

  const readNames = (candidate: unknown) =>
    Array.isArray(candidate)
      ? Array.from(
          new Set(
            candidate.filter(
              (name): name is string =>
                typeof name === "string" &&
                stripeClientReadinessEnvironmentVariableNames.has(name),
            ),
          ),
        )
      : [];

  return {
    status: config.status,
    missing: readNames(config.missing),
    malformed: readNames(config.malformed),
  };
}

export async function requestStripePaymentIntent(
  input: StripePaymentIntentRequest,
  fetcher: FetchLike = fetch,
): Promise<StripePaymentIntentResult> {
  const response = await fetcher(STRIPE_PAYMENT_INTENT_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  let payload: Record<string, unknown> = {};

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("WeatherTech OS received an invalid Stripe response.");
  }

  if (!response.ok || payload.ok !== true) {
    throw new Error(sanitizeStripeClientMessage(payload.message));
  }

  const paymentIntentId =
    typeof payload.paymentIntentId === "string" ? payload.paymentIntentId : null;
  const status = typeof payload.status === "string" ? payload.status : null;
  const clientSecret =
    typeof payload.clientSecret === "string" && payload.clientSecret
      ? payload.clientSecret
      : null;

  if (!paymentIntentId || !status) {
    throw new Error("Stripe did not return a valid payment request.");
  }

  if (!clientSecret && status !== "succeeded" && status !== "processing") {
    throw new Error(
      "Stripe did not return the secure confirmation token required for this payment.",
    );
  }

  return {
    paymentIntentId,
    clientSecret,
    status,
    duplicatePrevented: payload.duplicatePrevented === true,
  };
}

export async function requestStripeRefund(
  input: StripeRefundRequest,
  fetcher: FetchLike = fetch,
): Promise<StripeRefundResult> {
  const response = await fetcher(STRIPE_REFUND_PATH, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  let payload: Record<string, unknown> = {};

  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new Error("WeatherTech OS received an invalid Stripe refund response.");
  }

  if (!response.ok || payload.ok !== true) {
    throw new Error(
      sanitizeStripeClientMessage(
        payload.message,
        "WeatherTech OS could not issue the approved Stripe refund.",
      ),
    );
  }

  const refundId =
    typeof payload.refundId === "string" && payload.refundId
      ? payload.refundId
      : null;
  const status =
    typeof payload.status === "string" && payload.status ? payload.status : null;

  if (!refundId || !status) {
    throw new Error("Stripe did not return a valid refund result.");
  }

  return {
    refundId,
    status,
    duplicatePrevented: payload.duplicatePrevented === true,
  };
}
