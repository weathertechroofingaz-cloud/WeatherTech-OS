import type {
  ProposalSigningCustomerSnapshot,
  ProposalSigningOption,
} from "./contracts";
import {
  calculateCurrencyCents,
  calculateExtendedAmountCents,
  calculatePercentageOfCents,
} from "../crm/estimates";

function toCents(value: number) {
  return calculateCurrencyCents(value);
}

function optionTotalCents(
  option: Pick<ProposalSigningOption, "price" | "quantity">,
) {
  return calculateExtendedAmountCents(
    option.price,
    Math.max(option.quantity, 0),
  );
}

export function calculateProposalSigningPercentOfCents(
  totalCents: number,
  percent: number,
) {
  const normalizedTotalCents = Math.max(0, Math.round(totalCents));
  return calculatePercentageOfCents(normalizedTotalCents, Math.max(percent, 0));
}

export function calculateProposalSigningOptionTotal(
  option: Pick<ProposalSigningOption, "price" | "quantity">,
) {
  return optionTotalCents(option) / 100;
}

export function calculateProposalSigningAcceptedTotal(
  proposal: ProposalSigningCustomerSnapshot,
  selectedOptionIds: Iterable<string>,
) {
  const selectedIds = new Set(selectedOptionIds);
  const selectedOptions = proposal.options.filter((option) => selectedIds.has(option.id));
  const fullAlternate = selectedOptions.find(
    (option) => option.priceEffectType === "full_alternate_total",
  );
  const baseTotalCents = toCents(proposal.baseTotal);
  let acceptedTotalCents = fullAlternate
    ? optionTotalCents(fullAlternate)
    : baseTotalCents;

  for (const option of selectedOptions) {
    if (option.id === fullAlternate?.id) {
      continue;
    }

    if (fullAlternate && option.priceEffectType !== "additive") {
      continue;
    }

    const priceCents = optionTotalCents(option);
    if (option.priceEffectType === "replace_base_amount") {
      acceptedTotalCents += priceCents - toCents(option.baseReplacementAmount);
    } else {
      acceptedTotalCents += priceCents;
    }
  }

  return Math.max(acceptedTotalCents, 0) / 100;
}

export function calculateProposalSigningRequiredDeposit(
  proposal: ProposalSigningCustomerSnapshot,
  acceptedTotal: number,
) {
  if (!proposal.depositRequired) {
    return 0;
  }

  if (proposal.depositType === "fixed") {
    return Math.min(
      Math.max(calculateCurrencyCents(proposal.depositValue) / 100, 0),
      acceptedTotal,
    );
  }

  if (proposal.depositType === "percent") {
    const acceptedTotalCents = toCents(acceptedTotal);
    return Math.min(
      calculateProposalSigningPercentOfCents(
        acceptedTotalCents,
        proposal.depositValue,
      ) / 100,
      acceptedTotal,
    );
  }

  return Math.min(Math.max(proposal.requiredDepositAmount, 0), acceptedTotal);
}
