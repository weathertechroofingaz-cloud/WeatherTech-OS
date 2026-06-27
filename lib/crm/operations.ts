import type {
  InvoiceInput,
  InvoiceLineItemInput,
  MaterialOrderItemInput,
} from "./types";

export type InvoiceTotals = {
  subtotal: number;
  taxableSubtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  balanceDue: number;
};

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceLineItemTotal(item: InvoiceLineItemInput) {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitCost = Number.isFinite(item.unit_cost) ? item.unit_cost : 0;

  return roundCurrency(quantity * unitCost);
}

export function calculateInvoiceTotals(
  invoice: Pick<InvoiceInput, "tax_rate" | "discount_total" | "amount_paid">,
  lineItems: InvoiceLineItemInput[],
): InvoiceTotals {
  const lineTotals = lineItems.map((item) => ({
    item,
    total: calculateInvoiceLineItemTotal(item),
  }));
  const subtotal = roundCurrency(
    lineTotals.reduce((total, line) => total + line.total, 0),
  );
  const taxableSubtotal = roundCurrency(
    lineTotals
      .filter((line) => line.item.taxable ?? true)
      .reduce((total, line) => total + line.total, 0),
  );
  const discountTotal = roundCurrency(invoice.discount_total ?? 0);
  const discountedTaxableSubtotal = Math.max(taxableSubtotal - discountTotal, 0);
  const taxTotal = roundCurrency(
    discountedTaxableSubtotal * ((invoice.tax_rate ?? 0) / 100),
  );
  const total = roundCurrency(Math.max(subtotal - discountTotal, 0) + taxTotal);
  const balanceDue = roundCurrency(Math.max(total - (invoice.amount_paid ?? 0), 0));

  return {
    subtotal,
    taxableSubtotal,
    taxTotal,
    discountTotal,
    total,
    balanceDue,
  };
}

export function calculateMaterialOrderItemTotal(item: MaterialOrderItemInput) {
  const quantity = Number.isFinite(item.quantity) ? item.quantity : 0;
  const unitCost = Number.isFinite(item.unit_cost) ? item.unit_cost : 0;

  return roundCurrency(quantity * unitCost);
}

export function calculateMaterialOrderTotal(items: MaterialOrderItemInput[]) {
  return roundCurrency(
    items.reduce((total, item) => total + calculateMaterialOrderItemTotal(item), 0),
  );
}
