export const STRIPE_PAYMENT_INTENT_PATH =
  "/api/integrations/stripe/payment-intents" as const;
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

export function sanitizeStripeClientMessage(value: unknown) {
  const fallback = "WeatherTech OS could not prepare the secure Stripe payment.";
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
