# Checkout and orders

Address → mock payment → review → **one database transaction** that creates the order. Then a
confirmation page, order history and order detail.

## The one rule: only `place_order` can create an order

Clients have no INSERT/UPDATE grants on `orders`, `order_items`, or `products.stock`. The only way an
order comes into existence is `public.place_order(p_address_id, p_expected_total_cents, p_idempotency_key)`
(`supabase/migrations/20261014150000_place_order.sql`).

It must be `SECURITY DEFINER` (it writes things the caller cannot), which makes it an RLS bypass by design.
So it is built defensively:

| Concern | How it's handled |
|---|---|
| Acting for another user | No user-id parameter. Everything is scoped to `auth.uid()`. |
| Tampered prices/quantities | It takes **no** prices or quantities. It reads the caller's cart and the live product rows itself. |
| Using someone else's address | The address is looked up with `user_id = auth.uid()`; otherwise `address_not_found`. |
| Stale price on screen | The caller passes the total they saw; if the recomputed total differs → `price_changed` (nothing is charged or changed). |
| Overselling the last unit | Cart rows and product rows are locked (`FOR UPDATE`) before stock is checked and decremented. `products.stock >= 0` is a CHECK backstop. |
| Deadlocks | Locks are taken in product-id order in every transaction. |
| Double-click / retry | Locking the cart rows makes a duplicate wait, then find the cart empty. An idempotency key (unique per user) makes a retry return the **same** order. |
| search_path hijack | `set search_path = ''`, everything schema-qualified. |
| Who can call it | `authenticated` only (`anon` and `public` revoked). A token with no subject gets `not_authenticated`. |

Everything is one transaction: any failure rolls back **all** of it (no order, stock untouched, cart intact).

### What an order stores (snapshots)

`orders`: subtotal / shipping / tax / total, `shipping_address` as JSON (copied from the address),
`payment_method = 'mock'`, `idempotency_key`. `order_items`: `title_snapshot`, `unit_price_cents`,
`image_path_snapshot`, `quantity`. Order pages render only from these, so later price, title, image or
address edits never change history. `order_items.product_id` is kept (nullable) only to offer "Buy it again"
while the product still exists and is active.

### Error contract

The error **message** is a machine code; `details` carries JSON where useful.

| Code | Meaning | Details |
|---|---|---|
| `cart_empty` | nothing to buy | |
| `address_not_found` | not the caller's address | |
| `cart_unavailable` | out of stock / inactive | `[{product_id,title,reason,available?,requested?}]` |
| `price_changed` | displayed total is stale | `{expected, actual}` |
| `order_too_large` | sanity limit | |
| `not_authenticated` | SQLSTATE 28000 | |

`placeOrder` (`src/app/checkout/actions.ts`) turns these into user-facing results; unknown errors are logged
and shown generically.

### Pricing rules

Flat shipping $4.99, **free at $35.00 and over**, tax 0 (demo). The rule lives in `public.shipping_cents_for()`;
`src/lib/pricing.ts` mirrors it for display only. If the two ever drift, `place_order` rejects the order with
`price_changed` rather than charging the wrong amount.

## The pages

- `/checkout`: protected. Saved addresses (select / add / delete), a demo payment step (an "approves" card and a
  "declines" card so the error state can be exercised; **no card data is collected or stored**), and an item
  review with totals. Cart data comes from the client cart store, so it is correct even right after a guest
  cart merged on sign-in. On success it empties the cart store and redirects.
- `/orders/[id]/confirmation`, `/orders/[id]`: another user's id, a nonexistent id and a malformed id are all the
  same "not found" (RLS makes them indistinguishable, so ids can't be probed).
- `/orders`: newest first, 10 per page, with status, recipient, thumbnails and "Buy it again".
- After an order, `updateTag("catalog")` expires cached product/search data so stock is accurate immediately.

## Tests

| What | Where | Result |
|---|---|---|
| place_order correctness and attacks (cross-user address, stale total, stock, inactive, empty, snapshots, idempotency, key isolation, $34.99/$35.00 boundary, anon/no-subject, structure) | `supabase/tests/place_order.test.sql` | 32 checks |
| RLS isolation across all tables, incl. no client writes to orders/stock and forged idempotency keys | `supabase/tests/rls.test.sql` | 113 checks |
| **Real concurrency** with signed-in sessions: last unit sold once (8 rounds), opposite-order carts don't deadlock (12 rounds), double submit with the same key = 1 order, with different keys = 1 order | `npm run test:race` | passes |

`npm run test:race` creates two throwaway users and temporary `zz-race-*` products with the service-role key, and
removes everything afterwards (even on failure). Local use only.

## Accepted lint finding

Supabase's advisor flags `place_order` ("signed-in users can execute a SECURITY DEFINER function"). That is
intentional. The compensating controls are the table above and the tests. Removing the finding would mean
letting clients write orders and stock directly, which is strictly worse.

## Known limitations

- Payment is a mock; there is no tax, no real shipping carrier, no order status workflow beyond `placed`.
- Order numbers are an identity sequence, so they can skip numbers (sequences don't roll back).
- A shopper whose cart changes between two tabs mid-checkout gets a clear `cart_unavailable` / `price_changed`
  message rather than a silently different order.
