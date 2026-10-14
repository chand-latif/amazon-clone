-- Stable cart ordering. Lines were ordered by updated_at, so editing a quantity
-- moved that line to the bottom after the next reload while the on-screen order
-- stayed put. created_at never changes after a line is first added.
--
-- Existing rows all get the migration time; the app breaks ties by product_id,
-- so their order is still deterministic.

alter table public.cart_items
  add column created_at timestamptz not null default now();
