"use client";

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  STRIPE_READINESS_PATH,
  buildStripePaymentIntentRequest,
  isStripeClientCompanyEligible,
  isStripePaymentConfirmationAllowed,
  isStripePaymentReadinessEnabled,
  parseStripePaymentAmount,
  parseStripeReadinessDiagnostic,
  requestStripePaymentIntent,
  sanitizeStripeClientMessage,
  type StripeClientReadinessDiagnostic,
  type StripeClientCompany,
} from "../lib/stripe/clientPayment";

const stripePublishableKey =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";
const stripePromise = /^pk_(live|test)_[A-Za-z0-9]+$/.test(
  stripePublishableKey,
)
  ? loadStripe(stripePublishableKey)
  : null;

type StripeInvoicePaymentProps = {
  company: StripeClientCompany | null;
  invoiceId: string;
  invoiceNumber: string;
  invoiceTitle: string;
  balanceDue: number;
  isCompanyOwner: boolean;
  isDemoMode: boolean;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
};

type StripeReadinessState =
  | { status: "checking"; message: string }
  | {
      status: "disabled";
      message: string;
      diagnostic: StripeClientReadinessDiagnostic | null;
    }
  | { status: "ready"; message: string };

function StripeConfirmationForm({
  invoiceNumber,
  invoiceTitle,
  amountCents,
  onRevalidate,
  onConfirmed,
}: {
  invoiceNumber: string;
  invoiceTitle: string;
  amountCents: number;
  onRevalidate: () => Promise<void>;
  onConfirmed: () => Promise<void>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const confirmInFlight = useRef(false);
  const [ownerConfirmedExactCharge, setOwnerConfirmedExactCharge] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formattedAmount = (amountCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const confirmationAllowed = isStripePaymentConfirmationAllowed({
    stripeReady: Boolean(stripe),
    elementsReady: Boolean(elements),
    ownerConfirmedExactCharge,
    isConfirming,
    submitted,
  });

  useEffect(() => {
    setOwnerConfirmedExactCharge(false);
  }, [amountCents, invoiceNumber, invoiceTitle]);

  const handleConfirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stripe || !elements || !confirmationAllowed || confirmInFlight.current) {
      return;
    }

    confirmInFlight.current = true;
    setIsConfirming(true);
    setErrorMessage(null);

    try {
      const submission = await elements.submit();
      if (submission.error) {
        setOwnerConfirmedExactCharge(false);
        setErrorMessage(sanitizeStripeClientMessage(submission.error.message));
        return;
      }

      await onRevalidate();

      const returnUrl = new URL("/", window.location.origin);
      returnUrl.searchParams.set("view", "invoices");
      returnUrl.searchParams.set("stripe_payment", "return");
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: returnUrl.toString() },
        redirect: "if_required",
      });

      if (result.error) {
        setOwnerConfirmedExactCharge(false);
        setErrorMessage(sanitizeStripeClientMessage(result.error.message));
        return;
      }

      setSubmitted(true);
      await onConfirmed();
    } catch (error) {
      setOwnerConfirmedExactCharge(false);
      setErrorMessage(sanitizeStripeClientMessage(error));
    } finally {
      confirmInFlight.current = false;
      setIsConfirming(false);
    }
  };

  return (
    <form onSubmit={handleConfirm} className="grid gap-4" data-testid="stripe-confirmation-form">
      <div
        className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-3 text-sm text-amber-950"
        data-testid="stripe-confirmation-summary"
      >
        <p className="font-black">Final charge: {formattedAmount} USD</p>
        <p className="mt-1 font-semibold">Invoice {invoiceNumber}: {invoiceTitle}</p>
      </div>
      <PaymentElement
        options={{
          layout: "tabs",
          fields: { billingDetails: { address: "auto" } },
        }}
      />
      {errorMessage ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      ) : null}
      <label className="flex items-start gap-2 rounded-md border border-slate-300 bg-white px-3 py-3 text-sm font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={ownerConfirmedExactCharge}
          onChange={(event) => setOwnerConfirmedExactCharge(event.target.checked)}
          disabled={isConfirming || submitted}
          data-testid="stripe-final-owner-approval"
          className="mt-0.5"
        />
        I confirm the exact {formattedAmount} charge for invoice {invoiceNumber}.
      </label>
      <button
        type="submit"
        disabled={!confirmationAllowed}
        data-testid="stripe-confirm-payment"
        className="inline-flex items-center justify-center rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {submitted
          ? `${formattedAmount} payment submitted`
          : isConfirming
          ? `Confirming ${formattedAmount} payment`
          : `Confirm ${formattedAmount} payment for ${invoiceNumber}`}
      </button>
      <p className="text-xs text-slate-500">
        Card details are entered in Stripe&apos;s secure Payment Element and are not stored by WeatherTech OS.
      </p>
    </form>
  );
}

export default function StripeInvoicePayment({
  company,
  invoiceId,
  invoiceNumber,
  invoiceTitle,
  balanceDue,
  isCompanyOwner,
  isDemoMode,
  onReload,
  onNotice,
}: StripeInvoicePaymentProps) {
  const [amount, setAmount] = useState("");
  const [ownerApproved, setOwnerApproved] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [preparedAttemptKey, setPreparedAttemptKey] = useState<string | null>(null);
  const [preparedAmountCents, setPreparedAmountCents] = useState<number | null>(null);
  const [paymentIntentStatus, setPaymentIntentStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<StripeReadinessState>({
    status: "checking",
    message: "Checking Stripe payment readiness.",
  });
  const attemptKey = useRef<string | null>(null);
  const companyEligible = isStripeClientCompanyEligible(company);
  const amountResult = useMemo(
    () => parseStripePaymentAmount(amount, balanceDue),
    [amount, balanceDue],
  );

  useEffect(() => {
    setAmount("");
    setOwnerApproved(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setPreparedAttemptKey(null);
    setPreparedAmountCents(null);
    setPaymentIntentStatus(null);
    setErrorMessage(null);
    attemptKey.current = null;
  }, [balanceDue, invoiceId]);

  useEffect(() => {
    if (isDemoMode || !companyEligible || !isCompanyOwner) {
      return;
    }

    if (!stripePromise) {
      setReadiness({
        status: "disabled",
        message: "Stripe browser configuration is not available in this deployment.",
        diagnostic: null,
      });
      return;
    }

    let active = true;
    setReadiness({ status: "checking", message: "Checking Stripe payment readiness." });

    void fetch(STRIPE_READINESS_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: unknown;
          config?: unknown;
          livePaymentsEnabled?: unknown;
          message?: unknown;
        };
        if (!active) {
          return;
        }

        const message = sanitizeStripeClientMessage(payload.message);
        const diagnostic = parseStripeReadinessDiagnostic(payload.config);
        setReadiness(
          isStripePaymentReadinessEnabled({
            responseOk: response.ok,
            ok: payload.ok,
            livePaymentsEnabled: payload.livePaymentsEnabled,
          })
            ? { status: "ready", message }
            : { status: "disabled", message, diagnostic },
        );
      })
      .catch(() => {
        if (active) {
          setReadiness({
            status: "disabled",
            message: "WeatherTech OS could not verify Stripe readiness.",
            diagnostic: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [companyEligible, isCompanyOwner, isDemoMode]);

  if (!company || !companyEligible) {
    return (
      <div
        className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"
        data-testid={company?.name === "IHC Painting" ? "stripe-payment-ihc-disabled" : "stripe-payment-unavailable"}
      >
        IHC Painting and all other companies remain unable to use the WeatherTech Roofing Stripe account.
      </div>
    );
  }

  if (isDemoMode || !isCompanyOwner) {
    return (
      <div
        className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"
        data-testid="stripe-payment-owner-required"
      >
        A signed-in WeatherTech Roofing company owner is required to prepare a Stripe payment.
      </div>
    );
  }

  const handlePrepare = async () => {
    if (readiness.status !== "ready" || !amountResult.ok || !ownerApproved) {
      return;
    }

    const stableAttemptKey =
      attemptKey.current ?? window.crypto.randomUUID();
    attemptKey.current = stableAttemptKey;
    setIsPreparing(true);
    setErrorMessage(null);

    try {
      const result = await requestStripePaymentIntent(
        buildStripePaymentIntentRequest({
          companyId: company.id,
          invoiceId,
          amountCents: amountResult.amountCents,
          attemptKey: stableAttemptKey,
        }),
      );
      setPaymentIntentStatus(result.status);
      setPaymentIntentId(result.paymentIntentId);
      setPreparedAttemptKey(stableAttemptKey);
      setPreparedAmountCents(amountResult.amountCents);
      setClientSecret(result.clientSecret);

      if (!result.clientSecret) {
        onNotice(`Stripe payment is ${result.status}; WeatherTech OS is waiting for its webhook record.`);
        await onReload();
      }
    } catch (error) {
      setErrorMessage(sanitizeStripeClientMessage(error));
    } finally {
      setIsPreparing(false);
    }
  };

  const resetAttempt = () => {
    attemptKey.current = null;
    setClientSecret(null);
    setPaymentIntentId(null);
    setPreparedAttemptKey(null);
    setPreparedAmountCents(null);
    setPaymentIntentStatus(null);
    setOwnerApproved(false);
    setErrorMessage(null);
  };

  return (
    <div
      className="mt-4 grid gap-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3"
      data-testid="stripe-invoice-payment"
    >
      <div>
        <p className="text-sm font-bold text-slate-950">Secure card payment</p>
        <p className="mt-1 text-xs text-slate-600">
          WeatherTech Roofing only. Preparing and confirming a payment each require an explicit owner action.
        </p>
      </div>

      {readiness.status !== "ready" ? (
        <div
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          data-testid="stripe-payment-disabled"
        >
          <p>{readiness.message}</p>
          {readiness.status === "disabled" && readiness.diagnostic ? (
            <dl
              className="mt-2 grid gap-1 text-xs"
              data-testid="stripe-readiness-config-diagnostic"
            >
              <div>
                <dt className="inline font-semibold">Configuration status: </dt>
                <dd className="inline" data-testid="stripe-readiness-config-status">
                  {readiness.diagnostic.status}
                </dd>
              </div>
              {readiness.diagnostic.missing.length ? (
                <div>
                  <dt className="inline font-semibold">Missing environment variables: </dt>
                  <dd className="inline" data-testid="stripe-readiness-config-missing">
                    {readiness.diagnostic.missing.join(", ")}
                  </dd>
                </div>
              ) : null}
              {readiness.diagnostic.malformed.length ? (
                <div>
                  <dt className="inline font-semibold">Malformed environment variables: </dt>
                  <dd className="inline" data-testid="stripe-readiness-config-malformed">
                    {readiness.diagnostic.malformed.join(", ")}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      ) : null}

      {!clientSecret ? (
        <>
          <div
            className="rounded-md border border-sky-300 bg-white px-3 py-2 text-sm text-slate-800"
            data-testid="stripe-payment-target"
          >
            <p className="font-bold">Invoice {invoiceNumber}: {invoiceTitle}</p>
            <p className="mt-1 text-xs text-slate-600">
              Balance due: {balanceDue.toLocaleString("en-US", { style: "currency", currency: "USD" })}. Enter the intended charge amount manually.
            </p>
          </div>
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Amount
            <input
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setOwnerApproved(false);
              }}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              data-testid="stripe-payment-amount"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-950"
            />
          </label>
          {!amountResult.ok ? (
            <p className="text-sm font-semibold text-red-700">{amountResult.message}</p>
          ) : null}
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={ownerApproved}
              onChange={(event) => setOwnerApproved(event.target.checked)}
              disabled={!amountResult.ok || readiness.status !== "ready"}
              data-testid="stripe-owner-approval"
              className="mt-0.5"
            />
            {amountResult.ok
              ? `I approve creating one ${(
                  amountResult.amountCents / 100
                ).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })} Stripe PaymentIntent for invoice ${invoiceNumber}.`
              : `Enter and review the exact charge amount for invoice ${invoiceNumber} before approval.`}
          </label>
          <button
            type="button"
            onClick={() => void handlePrepare()}
            disabled={
              readiness.status !== "ready" ||
              !amountResult.ok ||
              !ownerApproved ||
              isPreparing
            }
            data-testid="stripe-prepare-payment"
            className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isPreparing
              ? "Preparing secure payment"
              : amountResult.ok
                ? `Prepare ${(
                    amountResult.amountCents / 100
                  ).toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                  })} for ${invoiceNumber}`
                : `Prepare payment for ${invoiceNumber}`}
          </button>
        </>
      ) : stripePromise &&
        paymentIntentId &&
        preparedAttemptKey &&
        preparedAmountCents !== null ? (
        <>
          <Elements
            key={`${invoiceId}:${paymentIntentId}`}
            stripe={stripePromise}
            options={{
              clientSecret,
              loader: "auto",
              appearance: { theme: "stripe" },
            }}
          >
            <StripeConfirmationForm
              invoiceNumber={invoiceNumber}
              invoiceTitle={invoiceTitle}
              amountCents={preparedAmountCents}
              onRevalidate={async () => {
                const revalidated = await requestStripePaymentIntent(
                  buildStripePaymentIntentRequest({
                    companyId: company.id,
                    invoiceId,
                    amountCents: preparedAmountCents,
                    attemptKey: preparedAttemptKey,
                    expectedPaymentIntentId: paymentIntentId,
                  }),
                );

                if (
                  !revalidated.duplicatePrevented ||
                  revalidated.paymentIntentId !== paymentIntentId ||
                  revalidated.clientSecret !== clientSecret
                ) {
                  throw new Error(
                    "The prepared Stripe payment no longer matches the current authorized invoice state.",
                  );
                }
              }}
              onConfirmed={async () => {
                setPaymentIntentStatus("submitted");
                onNotice("Stripe accepted the payment confirmation. Waiting for the signed webhook to record it.");
                await onReload();
              }}
            />
          </Elements>
          <button
            type="button"
            onClick={resetAttempt}
            className="text-left text-xs font-semibold text-slate-600 underline"
            data-testid="stripe-cancel-payment-attempt"
          >
            Close this payment form
          </button>
        </>
      ) : null}

      {paymentIntentStatus ? (
        <p className="text-xs text-slate-500">Stripe status: {paymentIntentStatus}</p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
