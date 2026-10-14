import assert from "node:assert/strict";
import { test } from "node:test";
import { createOrderKeyHolder } from "./order-key.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const intent = { addressId: "addr1", totalCents: 2999, lines: [{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }] };

function counter() {
  let n = 0;
  return () => `key-${++n}`;
}

test("an identical retry reuses the key (so a double click can't make two orders)", () => {
  const h = createOrderKeyHolder(counter());
  assert.equal(h.keyFor(intent), "key-1");
  assert.equal(h.keyFor({ ...intent, lines: [...intent.lines].reverse() }), "key-1"); // line order is irrelevant
});

test("a different cart, total or address gets a new key", () => {
  const h = createOrderKeyHolder(counter());
  const first = h.keyFor(intent);
  assert.notEqual(h.keyFor({ ...intent, totalCents: 3500 }), first);
  const second = h.keyFor({ ...intent, totalCents: 3500 });
  assert.notEqual(h.keyFor({ ...intent, totalCents: 3500, addressId: "addr2" }), second);
  const third = h.keyFor({ ...intent, totalCents: 3500, addressId: "addr2" });
  assert.notEqual(h.keyFor({ ...intent, totalCents: 3500, addressId: "addr2", lines: [{ productId: A, quantity: 3 }] }), third);
});

test("after reset (order placed / restored page) even the same intent gets a new key", () => {
  const h = createOrderKeyHolder(counter());
  const first = h.keyFor(intent);
  h.reset();
  assert.notEqual(h.keyFor(intent), first);
});
