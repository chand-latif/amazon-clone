-- Initial schema: catalog, carts, addresses, orders.
--
-- Conventions
--   * Money is integer cents (*_cents). Never floats.
--   * Every table has RLS enabled with explicit policies, and client roles
--     (anon/authenticated) get only the grants listed at the bottom.
--   * Policies call (select auth.uid()) so Postgres evaluates it once per query.
--   * Catalog tables are written only by the service role (seed script).
--   * Orders/order_items have NO client write path. They are created by the
--     place_order RPC (security definer), added in a later slice.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------
create table public.categories (
  slug        text primary key,
  name        text not null,
  sort_order  integer not null default 0
);

create table public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  brand             text,
  description       text not null default '',
  features          text[] not null default '{}',
  category_slug     text not null references public.categories (slug)
                      on update cascade on delete restrict,
  price_cents       integer not null check (price_cents > 0),
  -- Pre-discount "was" price shown struck through; null when not discounted.
  list_price_cents  integer check (list_price_cents is null or list_price_cents > price_cents),
  stock             integer not null default 0 check (stock >= 0),
  -- Denormalized from reviews by the seed script. Needs a trigger if reviews
  -- ever become user-writable.
  rating_avg        numeric(2, 1) not null default 0 check (rating_avg between 0 and 5),
  rating_count      integer not null default 0 check (rating_count >= 0),
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  search            tsvector generated always as (
    to_tsvector(
      'english',
      title || ' ' || coalesce(brand, '') || ' ' || coalesce(description, '')
    )
  ) stored
);

create index products_search_idx          on public.products using gin (search);
create index products_category_price_idx  on public.products (category_slug, price_cents);
create index products_category_rating_idx on public.products (category_slug, rating_avg desc);

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  -- Object path inside the public `product-images` storage bucket.
  path        text not null,
  position    integer not null default 0,
  unique (product_id, position)
);

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  author_name  text not null,
  rating       integer not null check (rating between 1 and 5),
  title        text,
  body         text not null default '',
  created_at   timestamptz not null default now()
);

create index reviews_product_created_idx on public.reviews (product_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Per-user data
-- ---------------------------------------------------------------------------
create table public.cart_items (
  user_id     uuid not null references auth.users (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  quantity    integer not null check (quantity between 1 and 10),
  updated_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index cart_items_product_idx on public.cart_items (product_id);

create trigger cart_items_set_updated_at
  before update on public.cart_items
  for each row execute function public.set_updated_at();

create table public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  full_name    text not null,
  line1        text not null,
  line2        text,
  city         text not null,
  region       text not null,
  postal_code  text not null,
  country      text not null,
  phone        text,
  is_default   boolean not null default false
);

create index addresses_user_idx on public.addresses (user_id);
-- At most one default address per user.
create unique index addresses_one_default_idx on public.addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- Orders (immutable snapshots; written only by the place_order RPC)
-- ---------------------------------------------------------------------------
create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      bigint generated always as identity (start with 100001) unique,
  -- set null: keep order history if an account is deleted.
  user_id           uuid references auth.users (id) on delete set null,
  status            text not null default 'placed'
                      check (status in ('placed', 'shipped', 'delivered', 'cancelled')),
  subtotal_cents    integer not null check (subtotal_cents >= 0),
  shipping_cents    integer not null check (shipping_cents >= 0),
  tax_cents         integer not null check (tax_cents >= 0),
  total_cents       integer not null check (total_cents >= 0),
  -- Copy of the address at purchase time, so later edits/deletes don't rewrite history.
  shipping_address  jsonb not null,
  payment_method    text not null default 'mock',
  created_at        timestamptz not null default now(),
  check (total_cents = subtotal_cents + shipping_cents + tax_cents)
);

create index orders_user_created_idx on public.orders (user_id, created_at desc);

create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  -- Denormalized from orders so the RLS policy is a plain column check.
  user_id               uuid references auth.users (id) on delete set null,
  -- set null: history survives product deletion. Link is informational only.
  product_id            uuid references public.products (id) on delete set null,
  title_snapshot        text not null,
  image_path_snapshot   text,
  unit_price_cents      integer not null check (unit_price_cents >= 0),
  quantity              integer not null check (quantity > 0)
);

create index order_items_order_idx   on public.order_items (order_id);
create index order_items_user_idx    on public.order_items (user_id);
create index order_items_product_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;
alter table public.reviews        enable row level security;
alter table public.cart_items     enable row level security;
alter table public.addresses      enable row level security;
alter table public.orders         enable row level security;
alter table public.order_items    enable row level security;

-- Catalog: public read, no client writes (no insert/update/delete policies).
create policy "categories are publicly readable"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "active products are publicly readable"
  on public.products for select
  to anon, authenticated
  using (is_active);

create policy "images of active products are publicly readable"
  on public.product_images for select
  to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = product_images.product_id and p.is_active
  ));

create policy "reviews of active products are publicly readable"
  on public.reviews for select
  to anon, authenticated
  using (exists (
    select 1 from public.products p
    where p.id = reviews.product_id and p.is_active
  ));

-- Owner-only data.
create policy "users manage their own cart"
  on public.cart_items for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users manage their own addresses"
  on public.addresses for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Orders: read own only. No insert/update/delete policy => clients cannot write.
create policy "users read their own orders"
  on public.orders for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "users read their own order items"
  on public.order_items for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then grant exactly what the policies need.
-- (Supabase grants broad default privileges on new public tables; RLS would
-- still block, but least privilege is cheaper than reasoning about it later.)
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.categories, public.products,
                public.product_images, public.reviews
  to anon, authenticated;

grant select, insert, update, delete on public.cart_items, public.addresses
  to authenticated;

grant select on public.orders, public.order_items to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: public-read bucket for product images; no client write policies,
-- so only the service role (seed script) can upload.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
