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

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateLineItemTotal(item: EstimateLineItemInput) {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitCost = Number.isFinite(item.unit_cost) ? item.unit_cost : 0;
  const markupRate = Number.isFinite(item.markup_rate ?? 0) ? item.markup_rate ?? 0 : 0;

  return roundCurrency(quantity * unitCost * (1 + markupRate / 100));
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
    total: calculateLineItemTotal(item),
  }));
  const subtotal = roundCurrency(
    lineTotals.reduce((total, line) => total + line.total, 0),
  );
  const laborTotal = roundCurrency(
    lineTotals
      .filter((line) => line.item.category === "labor")
      .reduce((total, line) => total + line.total, 0),
  );
  const materialTotal = roundCurrency(
    lineTotals
      .filter((line) => line.item.category === "material")
      .reduce((total, line) => total + line.total, 0),
  );
  const taxableSubtotal = roundCurrency(
    lineTotals
      .filter((line) => line.item.taxable ?? true)
      .reduce((total, line) => total + line.total, 0),
  );
  const discountType: DiscountType = estimate.discount_type ?? "fixed";
  const discountValue = estimate.discount_value ?? 0;
  const discountTotal = roundCurrency(
    discountType === "percent" ? subtotal * (discountValue / 100) : discountValue,
  );
  const discountedTaxableSubtotal = Math.max(taxableSubtotal - discountTotal, 0);
  const taxTotal = roundCurrency(
    discountedTaxableSubtotal * ((estimate.tax_rate ?? 0) / 100),
  );
  const profitBase = Math.max(subtotal - discountTotal + taxTotal, 0);
  const profitMarginTotal = roundCurrency(
    profitBase * ((estimate.profit_margin_rate ?? 0) / 100),
  );
  const total = roundCurrency(profitBase + profitMarginTotal);

  return {
    subtotal,
    laborTotal,
    materialTotal,
    taxableSubtotal,
    taxTotal,
    discountTotal,
    profitMarginTotal,
    total,
  };
}
