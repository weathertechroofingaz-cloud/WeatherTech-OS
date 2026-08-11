"use client";

import { useEffect, useRef, useState } from "react";
import {
  STRIPE_READINESS_PATH,
  buildStripeRefundRequest,
  getStripeRefundAmountCents,
  isStripeClientCompanyEligible,
  isStripeClientRefundEligible,
  isStripeRefundReadinessEnabled,
  isStripeRefundSubmissionAllowed,
  requestStripeRefund,
  sanitizeStripeClientMessage,
  type StripeClientCompany,
} from "../lib/stripe/clientPayment";

type StripeInvoiceRefundProps = {
  company: StripeClientCompany | null;
  paymentId: string;
  paymentCompanyId: string;
  paymentAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  isCompanyOwner: boolean;
  isDemoMode: boolean;
  onReload: () => Promise<void>;
  onNotice: (message: string) => void;
};

type StripeRefundReadiness =
  | { status: "checking"; message: string }
  | { status: "disabled"; message: string }
  | { status: "ready"; message: string };

const refundErrorFallback =
  "WeatherTech OS could not issue the approved Stripe refund.";

function formatRefundAmount(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export default function StripeInvoiceRefund({
  company,
  paymentId,
  paymentCompanyId,
  paymentAmount,
  paymentMethod,
  paymentStatus,
  isCompanyOwner,
  isDemoMode,
  onReload,
  onNotice,
}: StripeInvoiceRefundProps) {
  const [ownerApproved, setOwnerApproved] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [refundStatus, setRefundStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<StripeRefundReadiness>({
    status: "checking",
    message: "Checking Stripe refund readiness.",
  });
  const attemptKey = useRef<string | null>(null);
  const amountCents = getStripeRefundAmountCents(paymentAmount);
  const isStripePayment = paymentMethod === "stripe";
  const companyEligible = isStripeClientCompanyEligible(company);
  const refundEligible = isStripeClientRefundEligible({
    company,
    paymentCompanyId,
    paymentMethod,
    paymentStatus,
    isCompanyOwner,
    isDemoMode,
  });
  const submissionAllowed = isStripeRefundSubmissionAllowed({
    readinessStatus: readiness.status,
    ownerApproved,
    isSubmitting,
    submitted,
  });

  useEffect(() => {
    setOwnerApproved(false);
    setIsSubmitting(false);
    setSubmitted(false);
    setRefundStatus(null);
    setErrorMessage(null);
    attemptKey.current = null;
  }, [paymentId, paymentStatus]);

  useEffect(() => {
    if (!refundEligible || amountCents === null) {
      return;
    }

    let active = true;
    setReadiness({
      status: "checking",
      message: "Checking Stripe refund readiness.",
    });

    void fetch(STRIPE_READINESS_PATH, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok?: unknown;
          livePaymentsEnabled?: unknown;
          refundsEnabled?: unknown;
          webhookProcessingEnabled?: unknown;
          message?: unknown;
        };
        if (!active) {
          return;
        }

        const message = sanitizeStripeClientMessage(
          payload.message,
          "WeatherTech OS could not verify Stripe refund readiness.",
        );
        setReadiness(
          isStripeRefundReadinessEnabled({
            responseOk: response.ok,
            ok: payload.ok,
            livePaymentsEnabled: payload.livePaymentsEnabled,
            refundsEnabled: payload.refundsEnabled,
            webhookProcessingEnabled: payload.webhookProcessingEnabled,
          })
            ? { status: "ready", message }
            : { status: "disabled", message },
        );
      })
      .catch(() => {
        if (active) {
          setReadiness({
            status: "disabled",
            message: "WeatherTech OS could not verify Stripe refund readiness.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [amountCents, refundEligible]);

  if (!isStripePayment) {
    return null;
  }

  if (!company || !companyEligible || company.id !== paymentCompanyId) {
    return (
      <div
        className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
        data-testid="stripe-refund-ihc-disabled"
      >
        IHC Painting and all other companies cannot refund through the WeatherTech Roofing Stripe account.
      </div>
    );
  }

  if (isDemoMode || !isCompanyOwner) {
    return (
      <div
        className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
        data-testid="stripe-refund-owner-required"
      >
        A signed-in WeatherTech Roofing company owner is required to approve a Stripe refund.
      </div>
    );
  }

  if (paymentStatus === "refunded") {
    return (
      <p
        className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"
        data-testid="stripe-refund-completed"
      >
        This Stripe payment has been fully refunded.
      </p>
    );
  }

  if (!refundEligible || amountCents === null) {
    return null;
  }

  const formattedAmount = formatRefundAmount(paymentAmount);

  const handleRefund = async () => {
    if (!submissionAllowed) {
      return;
    }

    const stableAttemptKey = attemptKey.current ?? window.crypto.randomUUID();
    attemptKey.current = stableAttemptKey;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await requestStripeRefund(
        buildStripeRefundRequest({
          companyId: company.id,
          paymentId,
          amountCents,
          attemptKey: stableAttemptKey,
        }),
      );
      setSubmitted(true);
      setRefundStatus(result.status);
      onNotice(
        result.duplicatePrevented
          ? "The existing approved Stripe refund was recovered. Waiting for webhook reconciliation."
          : "Stripe accepted the full refund. Waiting for signed webhook reconciliation.",
      );

      try {
        await onReload();
      } catch {
        onNotice(
          "Stripe accepted the refund, but the CRM refresh failed. Do not submit another refund.",
        );
      }
    } catch (error) {
      setErrorMessage(
        sanitizeStripeClientMessage(
          error instanceof Error ? error.message : error,
          refundErrorFallback,
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="mt-2 grid gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2"
      data-testid="stripe-refund-action"
    >
      <div>
        <p className="text-xs font-bold text-slate-950">Full Stripe refund</p>
        <p className="mt-0.5 text-xs text-slate-600">
          Refund the recorded {formattedAmount} payment to its original Stripe payment method.
        </p>
      </div>

      {readiness.status !== "ready" ? (
        <p
          className="text-xs font-semibold text-amber-900"
          data-testid="stripe-refund-disabled"
        >
          {readiness.message}
        </p>
      ) : null}

      <label className="flex items-start gap-2 text-xs text-slate-700">
        <input
          type="checkbox"
          checked={ownerApproved}
          onChange={(event) => setOwnerApproved(event.target.checked)}
          disabled={isSubmitting || submitted}
          data-testid="stripe-refund-owner-approval"
          className="mt-0.5"
        />
        I approve one full {formattedAmount} refund to the original Stripe payment method.
      </label>

      <button
        type="button"
        onClick={() => void handleRefund()}
        disabled={!submissionAllowed}
        data-testid="stripe-refund-submit"
        className="inline-flex items-center justify-center rounded-md bg-amber-700 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isSubmitting
          ? "Issuing approved refund"
          : submitted
            ? "Refund submitted"
            : `Issue full ${formattedAmount} refund`}
      </button>

      {refundStatus ? (
        <p className="text-xs text-slate-600" data-testid="stripe-refund-status">
          Stripe refund status: {refundStatus}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
