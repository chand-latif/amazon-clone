import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_LINES,
  MAX_QTY,
  clampQty,
  countUnits,
  parseGuestCart,
  sanitizeLines,
  serializeGuestCart,
  subtractLines,
  withQuantity,
} from "./storage.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

test("clampQty: whole numbers within [1, min(limit, 10)], and a limit below 1 never means unlimited", () => {
  assert.equal(clampQty(5), 5);
  assert.equal(clampQty(0), 1);
  assert.equal(clampQty(-3), 1);
  assert.equal(clampQty(99), MAX_QTY);
  assert.equal(clampQty(2.9), 2);
  assert.equal(clampQty(Number.NaN), 1);
  assert.equal(clampQty(Number.POSITIVE_INFINITY), 1);
  assert.equal(clampQty(9, 3), 3);
  assert.equal(clampQty(9, 0), 1);
  assert.equal(clampQty(9, -5), 1);
});

test("sanitizeLines: hostile input becomes valid lines", () => {
  assert.deepEqual(sanitizeLines("nope"), []);
  assert.deepEqual(sanitizeLines(null), []);
  assert.deepEqual(sanitizeLines([null, 1, "x", {}, { productId: 5, quantity: 1 }]), []);
  assert.deepEqual(sanitizeLines([{ productId: "not-a-uuid", quantity: 1 }]), []);
  assert.deepEqual(sanitizeLines([{ productId: A, quantity: 0 }, { productId: A, quantity: -1 }, { productId: A, quantity: "3" }]), []);
  assert.deepEqual(sanitizeLines([{ productId: A, quantity: 4 }, { productId: A.toUpperCase(), quantity: 9 }]), [{ productId: A, quantity: MAX_QTY }]);
  assert.deepEqual(sanitizeLines([{ productId: B, quantity: 1 }, { productId: A, quantity: 2 }]).map((l) => l.productId), [B, A]);
});

test("sanitizeLines caps the number of lines", () => {
  const many = Array.from({ length: MAX_LINES + 20 }, (_, i) => ({
    productId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    quantity: 1,
  }));
  assert.equal(sanitizeLines(many).length, MAX_LINES);
});

test("guest cart round-trips and survives corrupt storage", () => {
  const lines = [{ productId: A, quantity: 2 }, { productId: B, quantity: 10 }];
  assert.deepEqual(parseGuestCart(serializeGuestCart(lines)), lines);
  for (const bad of [null, "", "{", "[]", "null", '{"v":2,"items":[]}', '{"v":1,"items":"x"}', '{"v":1}']) {
    assert.deepEqual(parseGuestCart(bad), [], `input: ${bad}`);
  }
  // Only ids and quantities are stored, never prices or titles.
  assert.deepEqual(Object.keys(JSON.parse(serializeGuestCart(lines)).items[0]).sort(), ["p", "q"]);
});

test("countUnits and withQuantity", () => {
  assert.equal(countUnits([]), 0);
  assert.equal(countUnits([{ productId: A, quantity: 2 }, { productId: B, quantity: 3 }]), 5);

  const base = [{ productId: A, quantity: 1 }, { productId: B, quantity: 2 }];
  assert.deepEqual(withQuantity(base, A, 4), [{ productId: A, quantity: 4 }, { productId: B, quantity: 2 }]); // keeps position
  assert.deepEqual(withQuantity(base, C, 1), [...base, { productId: C, quantity: 1 }]); // new line at the end
  assert.deepEqual(withQuantity(base, A, 0), [{ productId: B, quantity: 2 }]); // 0 removes
  assert.deepEqual(withQuantity(base, A, 50), [{ productId: A, quantity: MAX_QTY }, { productId: B, quantity: 2 }]);
  assert.deepEqual(base, [{ productId: A, quantity: 1 }, { productId: B, quantity: 2 }]); // input not mutated
});

test("subtractLines: after a merge only what was merged is removed", () => {
  const merged = [{ productId: A, quantity: 2 }, { productId: B, quantity: 1 }];
  // nothing changed during the merge: the guest cart is emptied
  assert.deepEqual(subtractLines(merged, merged), []);
  // a new product was added meanwhile: it survives
  assert.deepEqual(subtractLines([...merged, { productId: C, quantity: 3 }], merged), [{ productId: C, quantity: 3 }]);
  // more of a merged product was added meanwhile: only the difference survives
  assert.deepEqual(subtractLines([{ productId: A, quantity: 5 }, { productId: B, quantity: 1 }], merged), [{ productId: A, quantity: 3 }]);
  // a merged line was removed meanwhile: nothing resurrects it
  assert.deepEqual(subtractLines([{ productId: B, quantity: 1 }], merged), []);
  // nothing merged: nothing removed
  assert.deepEqual(subtractLines(merged, []), merged);
});
