import "client-only";
import { createClient } from "@/lib/supabase/client";
import {
  GUEST_CART_KEY,
  MAX_QTY,
  clampQty,
  parseGuestCart,
  sanitizeLines,
  serializeGuestCart,
  subtractLines,
  withQuantity,
  type CartLine,
} from "./storage";

// ---------------------------------------------------------------------------
// The cart store: ONE source of truth for the header badge, the product page
// and the cart page. A module singleton read through useSyncExternalStore.
//
//   guest  -> lines live in localStorage (ids + quantities only)
//   user   -> lines live in the cart_items table (RLS: own rows only)
//
// Quantities are updated optimistically, then persisted. Prices, titles and
// stock are never stored here; they're fetched live where they're displayed.
// ---------------------------------------------------------------------------

export type CartMode = "guest" | "user";

export type CartState = {
  /** "loading" until we know who the user is and have their lines. */
  status: "loading" | "ready";
  mode: CartMode | null;
  lines: CartLine[];
  /** Something failed and the user should know (cleared on the next successful change). */
  error: string | null;
  /** Informational, e.g. a merge that will be retried. */
  notice: string | null;
  /**
   * The signed-in cart could not be read, so `lines` is NOT the real cart. Writes
   * are refused until a reload succeeds; otherwise "add one" would overwrite a
   * quantity we never saw.
   */
  loadFailed: boolean;
};

const INITIAL: CartState = { status: "loading", mode: null, lines: [], error: null, notice: null, loadFailed: false };

let state: CartState = INITIAL;
const listeners = new Set<() => void>();

function setState(patch: Partial<CartState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export const cartStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => state,
  // The server can't know what's in the browser, so SSR always renders "loading".
  getServerSnapshot: () => INITIAL,
};

// ---------------------------------------------------------------------------
// Guest storage (localStorage can throw: private mode, quota, disabled)
// ---------------------------------------------------------------------------

function readGuest(): CartLine[] {
  try {
    return parseGuestCart(window.localStorage.getItem(GUEST_CART_KEY));
  } catch {
    return [];
  }
}

function writeGuest(lines: CartLine[]): boolean {
  try {
    if (lines.length === 0) window.localStorage.removeItem(GUEST_CART_KEY);
    else window.localStorage.setItem(GUEST_CART_KEY, serializeGuestCart(lines));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Database (signed-in carts). The browser client carries the user's session;
// RLS limits every statement to their own rows.
// ---------------------------------------------------------------------------

async function fetchDbLines(): Promise<CartLine[]> {
  const { data, error } = await createClient()
    .from("cart_items")
    .select("product_id, quantity")
    .order("created_at", { ascending: true })
    .order("product_id"); // tie-break so the order is always deterministic
  if (error) throw error;
  return sanitizeLines(data.map((r) => ({ productId: r.product_id, quantity: r.quantity })));
}

async function dbUpsert(userId: string, productId: string, quantity: number) {
  const { error } = await createClient()
    .from("cart_items")
    .upsert({ user_id: userId, product_id: productId, quantity }, { onConflict: "user_id,product_id" });
  if (error) throw error;
}

async function dbDelete(productId: string) {
  const { error } = await createClient().from("cart_items").delete().eq("product_id", productId);
  if (error) throw error;
}

// Writes for the same product run strictly in order, so rapid +/- clicks can't
// land out of order and leave the database disagreeing with the screen.
const chains = new Map<string, Promise<unknown>>();
function enqueue(key: string, task: () => Promise<void>): Promise<void> {
  const previous = chains.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  chains.set(key, next);
  const cleanup = () => {
    if (chains.get(key) === next) chains.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

// ---------------------------------------------------------------------------
// Who is the user? Told to us by <CartSync>, which gets it from the server.
// ---------------------------------------------------------------------------

let currentUserId: string | null | undefined = undefined; // undefined = not told yet
let generation = 0; // bumped on every auth change so stale async work can bail out
let markReady!: () => void;
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

/** Called when the server tells us the signed-in user (or null for a guest). Idempotent. */
export async function configureAuth(userId: string | null): Promise<void> {
  if (userId === currentUserId) return;
  currentUserId = userId;
  const gen = ++generation;

  if (userId === null) {
    // Signed out (or never signed in). The account's cart stays in the database;
    // nothing is copied to this browser, so a shared computer doesn't keep it.
    setState({ mode: "guest", lines: readGuest(), status: "ready", error: null, loadFailed: false });
    markReady();
    return;
  }

  await mergeGuestCartIntoAccount();
  if (gen !== generation) return;
  await loadFromDb(gen);
}

/**
 * Folds the guest cart into the account cart, once.
 *  - A Web Lock serialises tabs; the cart is re-read inside it, so a second tab
 *    that waited finds it already cleared and does nothing.
 *  - The local copy is deleted only AFTER the database confirms. On failure it
 *    stays put and the next sign-in retries.
 */
async function mergeGuestCartIntoAccount(): Promise<void> {
  const run = async () => {
    const local = readGuest();
    if (local.length === 0) return;

    const { error } = await createClient().rpc("merge_cart", {
      items: local.map((l) => ({ product_id: l.productId, qty: l.quantity })),
    });
    if (error) {
      console.error("Cart merge failed:", error.message);
      setState({ notice: "We couldn't add your saved items to your account yet. They're still on this device and we'll retry." });
      return;
    }
    // Remove only what was merged. Something added to the guest cart while the
    // request was in flight must not be wiped; it stays for the next sign-in.
    writeGuest(subtractLines(readGuest(), local));
  };

  try {
    if (typeof navigator !== "undefined" && navigator.locks) {
      await navigator.locks.request("amazon-clone:cart-merge", run);
    } else {
      await run();
    }
  } catch (error) {
    console.error("Cart merge crashed:", error);
  }
}

async function loadFromDb(gen: number): Promise<void> {
  try {
    const lines = await fetchDbLines();
    if (gen !== generation) return;
    setState({ mode: "user", lines, status: "ready", error: null, loadFailed: false });
  } catch (error) {
    if (gen !== generation) return;
    console.error("Cart load failed:", error);
    setState({
      mode: "user",
      lines: [],
      status: "ready",
      loadFailed: true,
      error: "We couldn't load your cart. Please refresh the page.",
    });
  } finally {
    markReady();
  }
}

/** Re-reads the signed-in cart (another tab or device may have changed it). */
async function refreshFromDb(): Promise<void> {
  if (state.mode !== "user" || chains.size > 0) return; // don't clobber in-flight edits
  const gen = generation;
  try {
    const lines = await fetchDbLines();
    if (gen === generation && chains.size === 0) {
      setState({ lines, error: state.loadFailed ? null : state.error, loadFailed: false });
    }
  } catch {
    // Keep what's on screen; the next focus will retry.
  }
}

/** Waits for the user to be known. If the server never tells us, fall back to guest mode. */
// A function (not an inline comparison) because state changes while we await, and
// TypeScript would otherwise narrow it to its first-read value.
const isReady = () => state.status === "ready";

async function whenReady(): Promise<void> {
  if (isReady()) return;
  await Promise.race([ready, new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
  if (!isReady()) await configureAuth(null);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * Signed-in carts only: make sure `lines` is the real cart before changing it.
 * Returns false (and tells the user) if it still can't be read.
 */
async function ensureLoaded(): Promise<boolean> {
  if (state.mode !== "user" || !state.loadFailed) return true;
  const gen = generation;
  try {
    const lines = await fetchDbLines();
    if (gen !== generation) return false;
    setState({ lines, loadFailed: false, error: null });
    return true;
  } catch {
    setState({ error: "We couldn't load your cart, so it wasn't changed. Please check your connection and try again." });
    return false;
  }
}

/** After a failed write, put back just that line as the database has it (other in-flight edits are left alone). */
async function rollbackLine(productId: string): Promise<void> {
  const gen = generation;
  try {
    const dbLines = await fetchDbLines();
    if (gen !== generation) return;
    const actual = dbLines.find((l) => l.productId === productId)?.quantity ?? 0;
    setState({ lines: withQuantity(state.lines, productId, actual) });
  } catch {
    // Can't reach the database; the error banner is already showing.
  }
}

/**
 * Applies a change to the screen and persists it. Everything up to the first
 * `await` is synchronous on purpose: callers compute from `state.lines` and
 * this commits it in the same tick, so two quick clicks can't both start from
 * the same old quantity.
 */
function applyChange(productId: string, quantity: number): Promise<boolean> {
  const after = withQuantity(state.lines, productId, quantity);
  setState({ lines: after, error: null });

  if (state.mode === "guest") {
    if (!writeGuest(after)) {
      setState({ notice: "Your cart couldn't be saved in this browser (storage is unavailable or full)." });
    }
    return Promise.resolve(true);
  }

  const userId = currentUserId;
  if (!userId) return Promise.resolve(true);
  return enqueue(productId, () => (quantity < 1 ? dbDelete(productId) : dbUpsert(userId, productId, quantity))).then(
    () => true,
    async (error) => {
      console.error("Cart update failed:", error);
      setState({ error: "We couldn't update your cart. Please try again." });
      await rollbackLine(productId); // snap this line back to what the database really has
      return false;
    },
  );
}

/** Sets a line's quantity (0 removes it). Optimistic, then persisted. */
async function commit(productId: string, quantity: number): Promise<boolean> {
  await whenReady();
  if (!(await ensureLoaded())) return false;
  return applyChange(productId, quantity);
}

export type AddResult = {
  /** Quantity in the cart before this add. */
  previous: number;
  /** Quantity in the cart now. */
  quantity: number;
  /** True when the cap (10, or the stock limit) cut the request short. */
  clamped: boolean;
};

/**
 * Adds `quantity` units. `limit` is the most this product can have in a cart
 * (the caller passes min(10, stock)); it can never exceed 10.
 * Throws if the change could not be saved, so callers (Buy Now) don't carry on.
 */
export async function addToCart(productId: string, quantity = 1, limit: number = MAX_QTY): Promise<AddResult> {
  await whenReady();
  if (!(await ensureLoaded())) throw new Error("cart_unavailable");
  // No await between reading the current quantity and applying the new one.
  const previous = state.lines.find((l) => l.productId === productId)?.quantity ?? 0;
  const wanted = previous + clampQty(quantity);
  // Never silently reduce what's already there (stock may have dropped since).
  const next = Math.max(clampQty(wanted, limit), previous);
  const saved = await applyChange(productId, next);
  if (!saved) throw new Error("cart_update_failed");
  return { previous, quantity: next, clamped: wanted > next };
}

/** Sets an exact quantity; anything below 1 removes the line. */
export async function setCartQuantity(productId: string, quantity: number, limit: number = MAX_QTY): Promise<void> {
  await commit(productId, quantity < 1 ? 0 : clampQty(quantity, limit));
}

export async function removeFromCart(productId: string): Promise<void> {
  await commit(productId, 0);
}

/** Re-reads the signed-in cart now (e.g. right after checkout emptied it on the server). */
export function reloadCart(): Promise<void> {
  return refreshFromDb();
}

export function dismissCartNotice() {
  if (state.notice) setState({ notice: null });
}

// ---------------------------------------------------------------------------
// Keeping tabs in sync
// ---------------------------------------------------------------------------

/** Wire up cross-tab and cross-device refresh. Returns a cleanup function. */
export function startCartListeners(): () => void {
  // Guest carts: another tab wrote to localStorage.
  const onStorage = (e: StorageEvent) => {
    if ((e.key === GUEST_CART_KEY || e.key === null) && state.mode === "guest") {
      setState({ lines: readGuest() });
    }
  };

  // Signed-in carts: re-read when the tab becomes visible again (cheap, no sockets).
  let lastRefresh = 0;
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastRefresh < 2000) return;
    lastRefresh = now;
    void refreshFromDb();
  };

  window.addEventListener("storage", onStorage);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("storage", onStorage);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
