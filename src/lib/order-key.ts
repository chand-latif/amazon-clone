/**
 * Idempotency key for placing an order, tied to WHAT is being ordered.
 *
 * The key exists so a retry of the same attempt (double click, flaky network)
 * can't create a second order. But a key that outlives its order is dangerous: if
 * the page is restored later (back button, bfcache) with the old key while the cart
 * holds different things, the server would replay the OLD order and silently never
 * place the new one. So:
 *   - the same intent (address + total + lines) keeps the same key;
 *   - a different intent gets a new key;
 *   - after a successful order the key is dropped.
 */
export type OrderIntent = {
  addressId: string;
  totalCents: number;
  lines: { productId: string; quantity: number }[];
};

export function intentFingerprint(intent: OrderIntent): string {
  const lines = [...intent.lines]
    .sort((a, b) => (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
    .map((l) => `${l.productId}:${l.quantity}`)
    .join(",");
  return `${intent.addressId}|${intent.totalCents}|${lines}`;
}

export function createOrderKeyHolder(newKey: () => string) {
  let current: { key: string; fingerprint: string } | null = null;
  return {
    /** The key to send for this intent: reused for an identical retry, fresh otherwise. */
    keyFor(intent: OrderIntent): string {
      const fingerprint = intentFingerprint(intent);
      if (!current || current.fingerprint !== fingerprint) current = { key: newKey(), fingerprint };
      return current.key;
    },
    /** Forget the key (order placed, or the page was restored from the back/forward cache). */
    reset() {
      current = null;
    },
  };
}
