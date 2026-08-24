import type {
  DiscountType,
  EstimateInput,
  EstimateLineItemInput,
} from "./types";

export type EstimateTotals = {
  subtotal: number;
  laborTotal: number;
  materialTotal: number;
  taxableSubtotal: number;
  taxTotal: number;
  discountTotal: number;
  profitMarginTotal: number;
  total: number;
};

function toScaledInteger(value: number, fractionDigits: number, label: string) {
  if (!Number.isFinite(value) || !Number.isInteger(fractionDigits) || fractionDigits < 0) {
    throw new Error(`${label} is not a supported finite decimal input.`);
  }
  const [mantissa, exponentText] = Math.abs(value).toString().toLowerCase().split("e");
  const exponent = exponentText ? Number.parseInt(exponentText, 10) : 0;
  const [whole, fraction = ""] = mantissa.split(".");
  const digits = BigInt(`${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0");
  const decimalPower = exponent - fraction.length + fractionDigits;
  const magnitude =
    decimalPower >= 0
      ? digits * 10n ** BigInt(decimalPower)
      : roundRationalHalfAwayFromZero(
          digits,
          10n ** BigInt(-decimalPower),
        );
  const scaled = value < 0 ? -magnitude : magnitude;
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || scaled < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds the supported exact numeric range.`);
  }
  return scaled;
}

function roundRationalHalfAwayFromZero(numerator: bigint, denominator: bigint) {
  if (denominator <= 0n) {
    throw new Error("Exact currency arithmetic requires a positive denominator.");
  }
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  return sign * ((magnitude * 2n + denominator) / (denominator * 2n));
}

function toSafeNumber(value: bigint, label: string) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) {
    throw new Error(`${label} exceeds the supported exact numeric range.`);
  }
  return numeric;
}

export function normalizeDecimalToScale(value: number, fractionDigits: number) {
  const normalized = Number.isFinite(value) ? value : 0;
  const scaled = toSafeNumber(
    toScaledInteger(normalized, fractionDigits, "Decimal input"),
    "Decimal result",
  );
  return scaled / 10 ** fractionDigits;
}

/**
 * Converts a database-scale currency input to cents without multiplying two
 * binary floating-point values. The input is rounded directly to the
 * numeric(12,2) database scale with PostgreSQL's half-away-from-zero behavior.
 */
export function calculateCurrencyCents(value: number) {
  const normalized = Number.isFinite(value) ? value : 0;
  return toSafeNumber(toScaledInteger(normalized, 2, "Currency input"), "Currency result");
}

/**
 * Mirrors `round(unit_price * quantity * (1 + markup_rate / 100), 2)`
 * for numeric(12,2), numeric(12,3), and numeric(6,3) database inputs.
 */
export function calculateExtendedAmountCents(
  unitAmount: number,
  quantity: number,
  markupPercent = 0,
) {
  const unitCents = BigInt(calculateCurrencyCents(unitAmount));
  const quantityMilli = toScaledInteger(
    Number.isFinite(quantity) ? quantity : 0,
    3,
    "Quantity",
  );
  const markupMilliPercent = toScaledInteger(
    Number.isFinite(markupPercent) ? markupPercent : 0,
    3,
    "Markup percentage",
  );
  const numerator =
    unitCents * quantityMilli * (100_000n + markupMilliPercent);
  return toSafeNumber(
    roundRationalHalfAwayFromZero(numerator, 100_000_000n),
    "Extended amount",
  );
}

/** Mirrors `round(amount * percent / 100, 2)` at the source column's scale. */
export function calculatePercentageOfCents(
  amountCents: number,
  percent: number,
  percentFractionDigits = 3,
) {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error("Percentage base exceeds the supported exact numeric range.");
  }
  const scaledPercent = toScaledInteger(
    Number.isFinite(percent) ? percent : 0,
    percentFractionDigits,
    "Percentage",
  );
  const denominator = 100n * 10n ** BigInt(percentFractionDigits);
  return toSafeNumber(
    roundRationalHalfAwayFromZero(
      BigInt(amountCents) * scaledPercent,
      denominator,
    ),
    "Percentage result",
  );
}

function fromCents(value: number) {
  return value / 100;
}

export function calculateLineItemTotal(item: EstimateLineItemInput) {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitPrice = item.unit_price ?? item.unit_cost;
  const unitCost = Number.isFinite(unitPrice) ? unitPrice : 0;
  const markupRate = Number.isFinite(item.markup_rate ?? 0) ? item.markup_rate ?? 0 : 0;

  return fromCents(calculateExtendedAmountCents(unitCost, quantity, markupRate));
}

export function calculateEstimateTotals(
  estimate: Pick<
    EstimateInput,
    "tax_rate" | "discount_type" | "discount_value" | "profit_margin_rate"
  >,
  lineItems: EstimateLineItemInput[],
): EstimateTotals {
  const lineTotals = lineItems.map((item) => ({
    item,
    cents: calculateExtendedAmountCents(
      item.unit_price ?? item.unit_cost,
      item.quantity,
      item.markup_rate ?? 0,
    ),
  }));
  const subtotalCents = lineTotals.reduce((total, line) => total + line.cents, 0);
  const laborTotalCents = lineTotals
    .filter((line) => line.item.category === "labor")
    .reduce((total, line) => total + line.cents, 0);
  const materialTotalCents = lineTotals
    .filter((line) => line.item.category === "material")
    .reduce((total, line) => total + line.cents, 0);
  const taxableSubtotalCents = lineTotals
    .filter((line) => line.item.taxable ?? true)
    .reduce((total, line) => total + line.cents, 0);
  const discountType: DiscountType = estimate.discount_type ?? "fixed";
  const discountValue = estimate.discount_value ?? 0;
  const discountTotalCents =
    discountType === "percent"
      ? calculatePercentageOfCents(subtotalCents, discountValue, 2)
      : calculateCurrencyCents(discountValue);
  const discountedTaxableSubtotalCents = Math.max(
    taxableSubtotalCents - discountTotalCents,
    0,
  );
  const taxTotalCents = calculatePercentageOfCents(
    discountedTaxableSubtotalCents,
    estimate.tax_rate ?? 0,
  );
  const profitBaseCents = Math.max(
    subtotalCents - discountTotalCents + taxTotalCents,
    0,
  );
  const profitMarginTotalCents = calculatePercentageOfCents(
    profitBaseCents,
    estimate.profit_margin_rate ?? 0,
  );
  const totalCents = profitBaseCents + profitMarginTotalCents;

  return {
    subtotal: fromCents(subtotalCents),
    laborTotal: fromCents(laborTotalCents),
    materialTotal: fromCents(materialTotalCents),
    taxableSubtotal: fromCents(taxableSubtotalCents),
    taxTotal: fromCents(taxTotalCents),
    discountTotal: fromCents(discountTotalCents),
    profitMarginTotal: fromCents(profitMarginTotalCents),
    total: fromCents(totalCents),
  };
}
