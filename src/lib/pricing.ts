// Checkout arithmetic for DISPLAY. The database is authoritative: place_order
// recomputes everything from live prices and rejects an order whose displayed
// total disagrees (error `price_changed`). Keep these constants in step with
// public.shipping_cents_for() in supabase/migrations/*_place_order.sql.

export const FREE_SHIPPING_THRESHOLD_CENTS = 3500; // free at $35.00 and over
export const FLAT_SHIPPING_CENTS = 499;
export const TAX_RATE = 0; // demo store: no tax

export function shippingCentsFor(subtotalCents: number): number {
  return subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
}

export type Totals = { subtotalCents: number; shippingCents: number; taxCents: number; totalCents: number };

export function computeTotals(subtotalCents: number): Totals {
  const shippingCents = subtotalCents > 0 ? shippingCentsFor(subtotalCents) : 0;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  return { subtotalCents, shippingCents, taxCents, totalCents: subtotalCents + shippingCents + taxCents };
}

/** How much more to spend for free shipping, or 0 if already free / empty. */
export function untilFreeShippingCents(subtotalCents: number): number {
  return subtotalCents > 0 && subtotalCents < FREE_SHIPPING_THRESHOLD_CENTS
    ? FREE_SHIPPING_THRESHOLD_CENTS - subtotalCents
    : 0;
}
