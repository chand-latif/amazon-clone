import assert from "node:assert/strict";
import { test } from "node:test";
import { computeTotals, shippingCentsFor, untilFreeShippingCents } from "./pricing.ts";

// These mirror public.shipping_cents_for() in the database (which is authoritative).
// supabase/tests/place_order.test.sql asserts the same boundary values (0 -> 499,
// 3499 -> 499, 3500 -> 0, 100000 -> 0), so a drift shows up on one side or the other.

test("shipping: $4.99 flat, free at $35.00 and over", () => {
  assert.equal(shippingCentsFor(0), 499);
  assert.equal(shippingCentsFor(1), 499);
  assert.equal(shippingCentsFor(3499), 499);
  assert.equal(shippingCentsFor(3500), 0);
  assert.equal(shippingCentsFor(3501), 0);
  assert.equal(shippingCentsFor(100000), 0);
});

test("totals add up, and an empty cart costs nothing", () => {
  assert.deepEqual(computeTotals(0), { subtotalCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0 });
  assert.deepEqual(computeTotals(2500), { subtotalCents: 2500, shippingCents: 499, taxCents: 0, totalCents: 2999 });
  assert.deepEqual(computeTotals(3499), { subtotalCents: 3499, shippingCents: 499, taxCents: 0, totalCents: 3998 });
  assert.deepEqual(computeTotals(3500), { subtotalCents: 3500, shippingCents: 0, taxCents: 0, totalCents: 3500 });
});

test("untilFreeShipping: how much more to spend", () => {
  assert.equal(untilFreeShippingCents(0), 0);
  assert.equal(untilFreeShippingCents(1), 3499);
  assert.equal(untilFreeShippingCents(3499), 1);
  assert.equal(untilFreeShippingCents(3500), 0);
  assert.equal(untilFreeShippingCents(9999), 0);
});
