// Pure helpers for the cart: no browser APIs, no I/O, so they're easy to test.
// localStorage is user-editable, so everything read from it is treated as hostile.

export type CartLine = { productId: string; quantity: number };

/** Per-product cap. Matches the cart_items.quantity check (1..10) and merge_cart. */
export const MAX_QTY = 10;
/** A guest cart this big is abuse or corruption. Matches merge_cart's 100-item limit. */
export const MAX_LINES = 100;
export const GUEST_CART_KEY = "amazon-clone:cart:v1";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Whole number in [1, min(limit, MAX_QTY)]. Non-numbers become 1. */
export function clampQty(value: number, limit: number = MAX_QTY): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return 1;
  // A limit below 1 (e.g. stock 0) must never mean "unlimited": it floors at 1.
  // Callers are responsible for not adding out-of-stock items at all.
  const cap = Number.isFinite(limit) ? Math.trunc(limit) : MAX_QTY;
  const max = Math.max(1, Math.min(cap, MAX_QTY));
  return Math.min(Math.max(n, 1), max);
}

/**
 * Turns unknown input into valid lines: drops non-uuid ids and non-positive or
 * non-numeric quantities, merges duplicates (summing), clamps to MAX_QTY, caps
 * the number of lines, and keeps first-seen order.
 */
export function sanitizeLines(input: unknown): CartLine[] {
  if (!Array.isArray(input)) return [];
  const merged = new Map<string, number>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { productId, quantity } = item as Record<string, unknown>;
    if (typeof productId !== "string" || !UUID_RE.test(productId)) continue;
    const q = typeof quantity === "number" ? Math.trunc(quantity) : NaN;
    if (!Number.isFinite(q) || q < 1) continue;
    const id = productId.toLowerCase();
    if (!merged.has(id) && merged.size >= MAX_LINES) continue;
    merged.set(id, (merged.get(id) ?? 0) + q);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity: clampQty(quantity) }));
}

/** Reads the stored guest cart. Anything malformed yields an empty cart, never an exception. */
export function parseGuestCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const { v, items } = parsed as { v?: unknown; items?: unknown };
    if (v !== 1 || !Array.isArray(items)) return [];
    return sanitizeLines(items.map((i) => (i && typeof i === "object" ? { productId: (i as { p?: unknown }).p, quantity: (i as { q?: unknown }).q } : null)));
  } catch {
    return [];
  }
}

/** Compact on purpose: ids and quantities only, never prices or titles. */
export function serializeGuestCart(lines: CartLine[]): string {
  return JSON.stringify({ v: 1, items: lines.map((l) => ({ p: l.productId, q: l.quantity })) });
}

/** Total units across all lines (what the header badge shows). */
export function countUnits(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

/** Returns lines with `productId` set to `quantity` (added at the end if new). Quantity < 1 removes it. */
export function withQuantity(lines: CartLine[], productId: string, quantity: number): CartLine[] {
  const rest = lines.filter((l) => l.productId !== productId);
  if (quantity < 1) return rest;
  const existing = lines.findIndex((l) => l.productId === productId);
  const line = { productId, quantity: clampQty(quantity) };
  if (existing === -1) return [...rest, line];
  const next = [...lines];
  next[existing] = line;
  return next;
}

/**
 * `current` minus `removed`, per product: a line whose quantity is no more than what
 * was removed disappears; a larger one keeps the difference. Used after a guest
 * cart has been merged, so items added meanwhile are not lost.
 */
export function subtractLines(current: CartLine[], removed: CartLine[]): CartLine[] {
  const gone = new Map(removed.map((l) => [l.productId, l.quantity]));
  const out: CartLine[] = [];
  for (const line of current) {
    const left = line.quantity - (gone.get(line.productId) ?? 0);
    if (left >= 1) out.push({ productId: line.productId, quantity: clampQty(left) });
  }
  return out;
}
