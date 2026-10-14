import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUuid } from "./uuid.ts";

const noRandomUuid = { getRandomValues: ((a: Uint8Array) => globalThis.crypto.getRandomValues(a)) as Crypto["getRandomValues"] };

test("randomUuid: uses randomUUID when present, otherwise builds a valid v4 from getRandomValues", () => {
  assert.equal(randomUuid({ getRandomValues: () => { throw new Error("unused"); }, randomUUID: () => "00000000-0000-4000-8000-000000000001" }), "00000000-0000-4000-8000-000000000001");

  const fallback = { getRandomValues: <T extends ArrayBufferView | null>(a: T) => { (a as unknown as Uint8Array).fill(0xff); return a; } };
  const id = randomUuid(fallback as unknown as Crypto);
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  // the real thing, forced down the fallback path
  const real = randomUuid(noRandomUuid);
  assert.match(real, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(real, randomUuid(noRandomUuid));
});
