# Build Plan — Amazon Clone

Stack: Next.js (App Router, TS), Tailwind, Supabase (Postgres, Auth, Storage), Vercel.
Goal: one polished, complete shopping loop. Browse → search → PDP → cart → sign in → checkout (mock payment) → confirmation → order history.

## How we work (from CLAUDE.md)
- One slice at a time. Before each slice I state the approach, files, and open questions, then wait for go-ahead.
- Every slice ends with: typecheck + lint passing, a manual check of the feature, then **one commit** that also stages `.agent-logs/`.
- Never commit secrets. Only the anon key is used client-side. The service-role key is only for local seed scripts (`.env.local`, untracked).
- Every table has RLS enabled with explicit policies. Run Supabase security advisors after each schema change.
- Each slice is deployed to a Vercel preview, so every slice is shippable.

## Progress
- Slice 0 (scaffold, shell): done.
- Slice 1 (schema, RLS, seed): migration applied to the Supabase project; RLS attack test passes (70/70); seed script written. Seed run and verified idempotent: 81 products, 217 images in Storage, 243 reviews (`npm run seed`; needs `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`).
- Slices 2 + 3 were built together: home page (hero carousel, deals strip, category rows) and `/s` search with URL-driven filters (category, price, rating), sort and pagination. Category browse is `/s?c=<slug>`; there is no separate `/c/[slug]` route.
- Slice 4 (product detail page, `/p/[slug]`): done. Gallery, price/savings, rating summary + stored reviews, stock status, quantity selector, buy box, related row, JSON-LD. All 81 products are prerendered. **Add to Cart / Buy Now only validate and show a "not connected yet" notice** until Slice 5 wires the cart. Unknown slugs show the not-found page with `noindex` but return HTTP 200 (Cache Components has no `dynamicParams = false`). No rating histogram: only 3 real reviews are stored per product, so a distribution chart would be invented.
- Next: Slice 5 (guest cart).

## Decisions still open (resolve before the slice that needs them)
| # | Question | Needed by | Default if unanswered |
|---|---|---|---|
| 1 | Product data: DummyJSON-based seed vs. hand-written | Slice 1 | DummyJSON, images re-hosted to Storage |
| 2 | Checkout requires sign-in? | Slice 8 | Yes |
| 3 | Assignment rubric / design reference that changes scope | Slice 0 | None assumed |
| 4 | Guest cart: localStorage + merge RPC vs. Supabase anonymous auth | Slice 5 | localStorage + merge RPC |
| 5 | Merge rule when guest and DB carts overlap: sum (clamp 10) vs. max | Slice 7 | Sum, clamped to 10 |
| 6 | Price drift at checkout: hard-fail vs. re-confirm | Slice 8 | Hard-fail with a clear message |

## Data model summary (details settled in Slice 1)
Money is integer cents. Tables: `categories`, `products` (generated `tsvector`, `stock >= 0` check), `product_images`, `reviews` (seeded, read-only), `cart_items` (pk `user_id, product_id`; no separate `carts` table), `addresses`, `orders` (address snapshot as jsonb), `order_items` (title/price/image snapshots, `user_id` denormalized). Clients can never insert orders; only the `place_order` RPC (security definer) can.

---

## Slice 0 — Scaffold, shell, first deploy
**Goal:** a deployed, empty-but-styled app with the Amazon-style layout shell.
**Build**
- Next.js (TS, App Router, Tailwind, ESLint) merged into the existing repo. Scaffold in a temp dir and copy in, since `create-next-app` refuses non-empty directories. Leave `CLAUDE.md`, `.claude/`, `.agent-logs/`, `.mcp.json` untouched. Merge `.gitignore` entries, don't overwrite.
- Supabase clients: `src/lib/supabase/client.ts` (browser) and `server.ts` (server components/actions), anon key only. Add `.env.local.example`.
- Layout shell: navy header (logo, search bar with category dropdown, account link, cart count placeholder), sub-nav, footer. Design tokens in Tailwind config (navy, orange CTA, price formatting helper).
- Vercel project linked, env vars set, preview deploy.
**Done when:** `tsc --noEmit` and `next lint` pass; `next dev` renders the shell; Vercel preview URL loads it; no secrets in git.
**Commit:** `Scaffold Next.js app with layout shell`

## Slice 1 — Schema, RLS, seed
**Goal:** a secure catalog database with realistic data. Testable with no UI.
**Build**
- Migration(s) in `supabase/migrations/` for all tables above, indexes, RLS policies, grants (`revoke all` then explicit `grant`), and the `product-images` public bucket.
- `scripts/seed.ts` (service-role key, local only): categories, ~50 products across ~6 categories, 2–5 images each uploaded to Storage, 3–8 seeded reviews each, computed `rating_avg`/`rating_count`.
- Generated TS types (`src/lib/database.types.ts`).
**Done when:** seed is re-runnable (idempotent); anon can read catalog but write nothing (verified with SQL as `anon`); `get_advisors` security shows no RLS warnings; types compile.
**Commit:** `Add schema, RLS policies, and seed script`

## Slice 2 — Home and category browse
**Goal:** a visitor can land on the site and browse a category.
**Build**
- Home: hero, category cards, 2 product rows from the DB.
- `/c/[slug]`: product grid/list with image, title, stars, review count, price (superscript cents), stock hint.
- Reusable `ProductCard`, `StarRating`, `Price`. Loading skeletons, empty state, 404 for unknown category.
**Done when:** home and every category render from live data; images load from Storage via `next/image` (remote pattern configured); mobile layout is sane.
**Commit:** `Add home page and category browse`

## Slice 3 — Search, sort, pagination
**Goal:** search works end to end.
**Build**
- `/s?k=&c=&sort=&page=`: header search bar (with category dropdown) drives it. Full-text with prefix matching, category filter, sort (relevance, price asc/desc, rating), pagination (offset is fine at this size). Query params are the source of truth, so URLs are shareable.
- "No results" state; result count line.
**Done when:** prefix terms ("wirel") match; sorts reorder correctly; back/forward and deep links work; empty and error states are handled.
**Commit:** `Add search, filters, sort, pagination`

## Slice 4 — Product detail page
**Goal:** the page that sells. Everything except the working cart buttons.
**Build**
- `/p/[slug]`: image gallery with thumbnails, title, brand, rating, price and list-price savings, features bullets, description, stock state ("In Stock" / "Only N left" / "Out of stock"), delivery-estimate text, quantity selector, buy box (buttons present, wired in Slice 5), reviews list with rating distribution, same-category product row.
- Metadata (title/OG), 404 for unknown/inactive slug.
**Done when:** every seeded product renders; out-of-stock disables purchase; layout holds on mobile.
**Commit:** `Add product detail page`

## Slice 5 — Guest cart
**Goal:** add to cart and manage it without an account.
**Build**
- Cart store backed by `localStorage` (`[{product_id, qty}]`, no prices), with try/catch around storage. Hydrates product data live from Supabase.
- Add to Cart on PDP and cards, with a confirmation toast or panel; header cart count; `/cart` page with qty change (clamped 1–10 and to stock), remove, subtotal, "Proceed to checkout" (goes to sign-in for now).
- Optimistic UI; handle products that become inactive or out of stock.
**Done when:** cart survives refresh and tab close; quantities clamp to stock; removed/inactive products show a clear notice.
**Commit:** `Add guest cart`

## Slice 6 — Authentication
**Goal:** accounts and protected routes.
**Build**
- Supabase Auth (email + password) with `@supabase/ssr`: sign-up, sign-in, sign-out, session refresh in middleware, `/signin` and `/signup` pages with `?next=` redirect.
- Header shows account state. Middleware protects `/checkout` and `/orders`.
**Done when:** a new user can sign up, sign in, sign out, and gets redirected back after sign-in; protected routes redirect anonymous users; session survives refresh. (Confirm whether email confirmation is on in the Supabase project and handle it.)
**Commit:** `Add authentication and route protection`

## Slice 7 — Cart sync and merge
**Goal:** a logged-in user's cart is server-backed and follows them across devices.
**Build**
- `merge_cart(items jsonb)` RPC (security invoker): upsert with the rule from open question 5, clamp quantity, skip inactive products. Called once after sign-in, then `localStorage` is cleared.
- Cart store switches to `cart_items` when authenticated (RLS: owner only); same UI as Slice 5.
**Done when:** with two accounts, each sees only their own cart (RLS verified via SQL as each user); guest cart merges on login; a cart persists across browsers; advisors clean.
**Commit:** `Add server-backed cart with login merge`

## Slice 8 — Checkout and order placement
**Goal:** a signed-in user can place an order.
**Build**
- `/checkout`: address select/add (`addresses` CRUD under RLS), delivery summary, mock payment step (no card data stored; `payment_method = 'mock'`), review step with itemized totals (flat shipping rule, tax 0).
- `place_order(address_id, expected_total_cents)` RPC (security definer, `search_path = ''`, `auth.uid()`): reads cart server-side, locks product rows, validates stock/active, decrements stock, computes totals, rejects on total mismatch, inserts order + items with snapshots, clears cart, returns the order id.
- `/orders/[id]/confirmation` page.
**Done when:** happy path places an order and the cart empties; stock decrements; insufficient stock and price drift produce friendly errors with no partial writes; two concurrent orders for the last unit cannot oversell; clients cannot insert into `orders`/`order_items` directly (verified).
**Commit:** `Add checkout and atomic order placement`

## Slice 9 — Order history
**Goal:** closes the loop.
**Build**
- `/orders`: list (order number, date, total, status, thumbnail row); `/orders/[id]`: detail from snapshots (so price/title changes don't alter history), shipping address, totals, "Buy it again" (links to live product if it still exists).
**Done when:** a user sees only their own orders (cross-user check); snapshot data renders even after a product is edited or deleted in the DB.
**Commit:** `Add order history and detail`

## Slice 10 — Polish and production readiness
**Goal:** the standard we said we'd hit.
**Build**
- Skeletons and error boundaries on all routes, empty states everywhere, custom 404, toasts consistent, focus states and keyboard nav, alt text, color-contrast check, responsive pass at 360/768/1280, image sizing/priority, metadata, favicon.
- Seed production data; confirm env vars and Storage on Vercel; final advisor run (security + performance).
- README: setup, env vars, seed, architecture, RLS summary, what was cut and why.
**Done when:** the full loop works on the production URL from a clean account on desktop and mobile; Lighthouse sanity pass; no console errors.
**Commit:** `Polish, accessibility, README, production deploy`

---

## Explicitly out of scope (see rationale in the MVP plan)
Real payments, user-written reviews/Q&A, wishlists, seller/admin UI, recommendations, Prime/deals/coupons, returns/tracking/cancellation, multi-currency/i18n/tax, OAuth providers, advanced search (facets/typeahead), email notifications.

## Risks to watch
- Next.js scaffolding into a non-empty repo (Slice 0).
- RLS mistakes: always test as `anon` and as two different users, not just with the service role.
- Hydration mismatches from `localStorage` cart (render cart count after mount).
- `next/image` remote patterns for Storage URLs.
- `.agent-logs/` must be staged with every commit and never edited.
