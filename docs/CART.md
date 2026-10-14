# Cart: state strategy

A guest can shop without an account; signing in folds that cart into the account's cart. The header
badge, the product page and the cart page always agree.

## Where the cart lives

| Who | Source of truth | What's stored |
|---|---|---|
| Guest (signed out) | `localStorage` key `amazon-clone:cart:v1` | `{v:1, items:[{p: productId, q: qty}]}` |
| Signed in | `cart_items` table (RLS: own rows only) | `user_id, product_id, quantity, created_at` |

Only ids and quantities are stored, never prices, titles or stock, so the cart can't hold a stale or
tampered price. The cart page fetches live product data for display, and checkout (later) re-validates
everything on the server. The cart does not reserve stock.

## Client store (`src/lib/cart/store.ts`)

A module singleton read through `useSyncExternalStore` (`useCart`, `useCartCount`). The header badge,
`BuyBox` and `CartView` all subscribe to it, so they cannot disagree.

- **Hydration:** the server can't see `localStorage`, so the server snapshot is always "loading" and the
  badge renders nothing until the client knows the real count (no wrong `0` that flips).
- **Optimistic updates:** the UI changes first, then persists (local write, or a database upsert/delete).
  A failed database write shows an error and reloads from the database, so the screen never drifts.
- **Write ordering:** writes for the same product are chained, so rapid +/- clicks land in order.
- **Limits:** 10 per product (the DB check constraint), 100 lines. `clampQty` never treats a limit below 1
  as "unlimited".

## Who is signed in?

The store is told, not asked. The header's server component already looks the session up, and renders
`<CartSync userId={...}/>` (a client component that renders nothing). When the layout revalidates after
a sign-in or sign-out, the prop changes and the store switches mode; after a magic link (full page load) it
simply mounts with the right value. No extra auth request and no dependence on browser auth events, which
never fire for sign-ins done in a server action.

`undefined` means "the server couldn't tell": the store does nothing, and falls back to guest mode if the
user acts before it learns more.

## Merge on login (`merge_cart` RPC)

`supabase/migrations/20261014120000_merge_cart.sql`. On `userId` appearing, if a guest cart exists:

1. Take a Web Lock (`navigator.locks`), so two tabs can't both merge.
2. Re-read the guest cart **inside** the lock (a second tab finds it already gone).
3. Call `merge_cart(items)`: quantities are **summed with the account's cart and clamped to 10**
   (guest 3 + account 9 = 10). Duplicate ids in the payload are combined first, inactive/unknown products are
   skipped, `qty <= 0` is ignored, and more than 100 items is rejected.
4. Only after the database confirms is the local cart deleted. On failure the local items stay, a notice is
   shown, and the next sign-in retries.

`merge_cart` is `SECURITY INVOKER` and takes no user id: it runs as the caller, so RLS applies and
`auth.uid()` is the only user it can ever write for. `anon` cannot execute it.

On **sign-out** nothing is copied back to the browser: the account's cart stays in the database, so a shared
computer doesn't retain it.

## Staying in sync

- Guest, across tabs: the `storage` event.
- Signed in, across tabs/devices: the cart is reloaded when the tab becomes visible again (throttled).
  Supabase Realtime is deliberately not used.

## Cart page behaviour (`CartView`)

- Quantity select is `1..min(10, stock)`; "Delete" removes the line; changes are announced to screen readers.
- Subtotal and "(N items)" cover only items that can be bought now (in stock). Out-of-stock lines stay
  visible, disabled and excluded.
- After a **successful** product fetch (never on error), it removes products that no longer exist and trims
  quantities to current stock, and tells the user what it changed.
- Lines are ordered by `created_at`, so editing a quantity never moves a line.
- `/checkout` is a protected placeholder until the checkout slice, so "Proceed to checkout" and "Buy Now"
  have a real destination and sign-in redirect-back works.

## Known trade-offs

- The header badge counts all units in the cart, including out-of-stock lines, because it knows only ids
  and quantities. The cart page's subtotal excludes them.
- Guest carts are per browser. Two devices only converge after signing in.
- Last write wins if two tabs edit the same signed-in line at once.

## Tests

- `supabase/tests/rls.test.sql` (111 checks): cart isolation between users, and the merge function (sum,
  clamp, duplicates, inactive/unknown products, hostile payloads, anon/no-subject callers, no user-id parameter).
- Pure cart logic (`src/lib/cart/storage.ts`: parsing, sanitizing and clamping untrusted `localStorage`)
  was checked with 32 assertions during development.
