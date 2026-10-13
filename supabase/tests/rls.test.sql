-- RLS attack test. Proves user A cannot read or modify user B's cart, addresses
-- or orders, that clients cannot write orders/catalog/storage at all, and that
-- anon sees only the public catalog. Positive controls confirm the policies
-- aren't "deny everything".
--
-- Run AFTER the migration is applied (SQL editor, `psql -f`, or MCP execute_sql).
-- It simulates Supabase requests with SET ROLE + JWT claims, and ends with
-- ROLLBACK, so it leaves nothing behind (no users, rows, or helper functions).
--
-- Output: one row per check. Any line starting with FAIL means RLS is broken.

begin;

-- Test helpers: plain SECURITY INVOKER functions, so they run as whichever role
-- the test has switched to. Dropped by the final ROLLBACK.
create function public._t_check(label text, ok boolean) returns text
language sql as $$ select case when ok then 'PASS  ' else 'FAIL  ' end || label $$;

create function public._t_count(q text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  return n;
end $$;

create function public._t_rows(q text) returns bigint
language plpgsql as $$
declare n bigint;
begin
  execute q;
  get diagnostics n = row_count;
  return n;
end $$;

-- Expects the statement to fail with a specific SQLSTATE
-- (42501 = permission denied / RLS violation, 23514 = check violation).
create function public._t_raises(label text, q text, expected text) returns text
language plpgsql as $$
begin
  execute q;
  return 'FAIL  ' || label || ' (statement succeeded)';
exception when others then
  if sqlstate = expected then return 'PASS  ' || label; end if;
  return 'FAIL  ' || label || ' (got ' || sqlstate || ': ' || sqlerrm || ')';
end $$;

do $$
declare
  ua  constant uuid := '00000000-0000-0000-0000-00000000000a';
  ub  constant uuid := '00000000-0000-0000-0000-00000000000b';
  p1  constant uuid := '00000000-0000-0000-0000-0000000000a1'; -- active
  p2  constant uuid := '00000000-0000-0000-0000-0000000000a2'; -- INACTIVE
  p3  constant uuid := '00000000-0000-0000-0000-0000000000a3'; -- active
  oa  constant uuid := '00000000-0000-0000-0000-0000000000b1'; -- A's order
  ob  constant uuid := '00000000-0000-0000-0000-0000000000b2'; -- B's order
  r   text[] := '{}';
begin
  ---------------------------------------------------------------------------
  -- Fixtures (as the privileged role)
  ---------------------------------------------------------------------------
  insert into auth.users (id, aud, role, email) values
    (ua, 'authenticated', 'authenticated', 'a@rls-test.local'),
    (ub, 'authenticated', 'authenticated', 'b@rls-test.local');

  insert into public.categories (slug, name) values ('rls-test', 'RLS Test');
  insert into public.products (id, slug, title, category_slug, price_cents, stock, is_active) values
    (p1, 'rls-p1', 'Active one',   'rls-test', 1000, 5, true),
    (p2, 'rls-p2', 'Inactive',     'rls-test', 1000, 5, false),
    (p3, 'rls-p3', 'Active two',   'rls-test',  500, 5, true);
  insert into public.reviews (product_id, author_name, rating) values (p1, 'x', 5), (p2, 'x', 5);
  insert into public.product_images (product_id, path, position) values (p1, 'a/0.webp', 0), (p2, 'b/0.webp', 0);

  insert into public.cart_items (user_id, product_id, quantity) values (ua, p1, 1), (ub, p1, 2), (ub, p3, 3);
  insert into public.addresses (user_id, full_name, line1, city, region, postal_code, country) values
    (ua, 'A Person', '1 A St', 'Acity', 'AR', '11111', 'US'),
    (ub, 'B Person', '2 B St', 'Bcity', 'BR', '22222', 'US');
  insert into public.orders (id, user_id, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_address) values
    (oa, ua, 1000, 0, 0, 1000, '{"who":"A"}'),
    (ob, ub,  500, 0, 0,  500, '{"who":"B"}');
  insert into public.order_items (order_id, user_id, product_id, title_snapshot, unit_price_cents, quantity) values
    (oa, ua, p1, 'Active one', 1000, 1),
    (ob, ub, p3, 'Active two',  500, 1);

  ---------------------------------------------------------------------------
  -- Attacker: signed-in user A
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- CART: reads
  r := r || public._t_check('A sees exactly 1 cart row (own)',            public._t_count('select 1 from public.cart_items') = 1);
  r := r || public._t_check('A sees 0 of B''s cart rows',                 public._t_count(format('select 1 from public.cart_items where user_id = %L', ub)) = 0);
  -- CART: writes against B
  r := r || public._t_check('A updates 0 of B''s cart rows',              public._t_rows(format('update public.cart_items set quantity = 9 where user_id = %L', ub)) = 0);
  r := r || public._t_check('A deletes 0 of B''s cart rows',              public._t_rows(format('delete from public.cart_items where user_id = %L', ub)) = 0);
  r := r || public._t_raises('A cannot INSERT a cart row for B',          format('insert into public.cart_items (user_id, product_id, quantity) values (%L, %L, 1)', ub, p2), '42501');
  r := r || public._t_raises('A cannot UPSERT over B''s cart row',        format('insert into public.cart_items (user_id, product_id, quantity) values (%L, %L, 10) on conflict (user_id, product_id) do update set quantity = 10', ub, p1), '42501');
  r := r || public._t_raises('A cannot hand own row to B (user_id swap)', format('update public.cart_items set user_id = %L where user_id = %L', ub, ua), '42501');
  r := r || public._t_raises('A cannot insert quantity 11 (check)',       format('insert into public.cart_items (user_id, product_id, quantity) values (%L, %L, 11)', ua, p3), '23514');
  -- CART: positive controls (own data works)
  r := r || public._t_check('A can insert own cart row',                  public._t_rows(format('insert into public.cart_items (user_id, product_id, quantity) values (%L, %L, 2)', ua, p3)) = 1);
  r := r || public._t_check('A can update own cart row',                  public._t_rows(format('update public.cart_items set quantity = 4 where user_id = %L and product_id = %L', ua, p3)) = 1);
  r := r || public._t_check('A can delete own cart row',                  public._t_rows(format('delete from public.cart_items where user_id = %L and product_id = %L', ua, p3)) = 1);

  -- ORDERS: reads
  r := r || public._t_check('A sees exactly 1 order (own)',               public._t_count('select 1 from public.orders') = 1);
  r := r || public._t_check('A sees 0 of B''s orders',                    public._t_count(format('select 1 from public.orders where user_id = %L', ub)) = 0);
  r := r || public._t_check('A cannot fetch B''s order by id',            public._t_count(format('select 1 from public.orders where id = %L', ob)) = 0);
  r := r || public._t_check('A sees exactly 1 order item (own)',          public._t_count('select 1 from public.order_items') = 1);
  r := r || public._t_check('A sees 0 of B''s order items',               public._t_count(format('select 1 from public.order_items where order_id = %L', ob)) = 0);
  -- ORDERS: no client write path at all
  r := r || public._t_raises('A cannot INSERT an order for self',         format('insert into public.orders (user_id, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_address) values (%L, 1, 0, 0, 1, ''{}'')', ua), '42501');
  r := r || public._t_raises('A cannot INSERT an order for B',            format('insert into public.orders (user_id, subtotal_cents, shipping_cents, tax_cents, total_cents, shipping_address) values (%L, 1, 0, 0, 1, ''{}'')', ub), '42501');
  r := r || public._t_raises('A cannot UPDATE own order total',           format('update public.orders set total_cents = 1, subtotal_cents = 1 where id = %L', oa), '42501');
  r := r || public._t_raises('A cannot UPDATE B''s order',                format('update public.orders set status = ''cancelled'' where id = %L', ob), '42501');
  r := r || public._t_raises('A cannot DELETE own order',                 format('delete from public.orders where id = %L', oa), '42501');
  r := r || public._t_raises('A cannot DELETE B''s order',                format('delete from public.orders where id = %L', ob), '42501');
  r := r || public._t_raises('A cannot INSERT an order item',             format('insert into public.order_items (order_id, user_id, title_snapshot, unit_price_cents, quantity) values (%L, %L, ''free'', 0, 1)', oa, ua), '42501');
  r := r || public._t_raises('A cannot UPDATE own order item price',      format('update public.order_items set unit_price_cents = 1 where order_id = %L', oa), '42501');
  r := r || public._t_raises('A cannot DELETE B''s order item',           format('delete from public.order_items where order_id = %L', ob), '42501');

  -- ADDRESSES
  r := r || public._t_check('A sees exactly 1 address (own)',             public._t_count('select 1 from public.addresses') = 1);
  r := r || public._t_check('A updates 0 of B''s addresses',              public._t_rows(format('update public.addresses set line1 = ''pwned'' where user_id = %L', ub)) = 0);
  r := r || public._t_check('A deletes 0 of B''s addresses',              public._t_rows(format('delete from public.addresses where user_id = %L', ub)) = 0);
  r := r || public._t_raises('A cannot INSERT an address for B',          format('insert into public.addresses (user_id, full_name, line1, city, region, postal_code, country) values (%L, ''x'', ''x'', ''x'', ''x'', ''x'', ''x'')', ub), '42501');

  -- CATALOG: readable, never writable by clients
  r := r || public._t_check('A reads active products (2)',                public._t_count(format('select 1 from public.products where category_slug = ''rls-test''')) = 2);
  r := r || public._t_check('A cannot see inactive product',              public._t_count(format('select 1 from public.products where id = %L', p2)) = 0);
  r := r || public._t_check('A cannot see reviews of inactive product',   public._t_count(format('select 1 from public.reviews where product_id = %L', p2)) = 0);
  r := r || public._t_check('A cannot see images of inactive product',    public._t_count(format('select 1 from public.product_images where product_id = %L', p2)) = 0);
  r := r || public._t_check('A sees reviews of active product',           public._t_count(format('select 1 from public.reviews where product_id = %L', p1)) = 1);
  r := r || public._t_raises('A cannot INSERT a product',                 'insert into public.products (slug, title, category_slug, price_cents) values (''evil'', ''evil'', ''rls-test'', 1)', '42501');
  r := r || public._t_raises('A cannot UPDATE a product price',           format('update public.products set price_cents = 1 where id = %L', p1), '42501');
  r := r || public._t_raises('A cannot DELETE a product',                 format('delete from public.products where id = %L', p1), '42501');
  r := r || public._t_raises('A cannot INSERT a category',                'insert into public.categories (slug, name) values (''evil'', ''evil'')', '42501');
  r := r || public._t_raises('A cannot INSERT a review',                  format('insert into public.reviews (product_id, author_name, rating) values (%L, ''shill'', 5)', p1), '42501');
  r := r || public._t_raises('A cannot INSERT a product image',           format('insert into public.product_images (product_id, path, position) values (%L, ''evil.png'', 9)', p1), '42501');
  r := r || public._t_raises('A cannot UPLOAD to the product-images bucket', 'insert into storage.objects (bucket_id, name) values (''product-images'', ''evil.png'')', '42501');
  reset role;

  ---------------------------------------------------------------------------
  -- Mirror: signed-in user B (proves isolation is symmetric)
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := r || public._t_check('B sees exactly 2 cart rows (own)',           public._t_count('select 1 from public.cart_items') = 2);
  r := r || public._t_check('B sees 0 of A''s cart rows',                 public._t_count(format('select 1 from public.cart_items where user_id = %L', ua)) = 0);
  r := r || public._t_check('B updates 0 of A''s cart rows',              public._t_rows(format('update public.cart_items set quantity = 9 where user_id = %L', ua)) = 0);
  r := r || public._t_check('B sees 0 of A''s orders',                    public._t_count(format('select 1 from public.orders where id = %L', oa)) = 0);
  r := r || public._t_check('B sees 0 of A''s order items',               public._t_count(format('select 1 from public.order_items where order_id = %L', oa)) = 0);
  r := r || public._t_check('B sees 0 of A''s addresses',                 public._t_count(format('select 1 from public.addresses where user_id = %L', ua)) = 0);
  reset role;

  ---------------------------------------------------------------------------
  -- Signed-in but token has no subject (auth.uid() is null)
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  r := r || public._t_check('no-sub token sees 0 cart rows',              public._t_count('select 1 from public.cart_items') = 0);
  r := r || public._t_check('no-sub token sees 0 orders',                 public._t_count('select 1 from public.orders') = 0);
  r := r || public._t_check('no-sub token sees 0 addresses',              public._t_count('select 1 from public.addresses') = 0);
  r := r || public._t_raises('no-sub token cannot insert a cart row',     format('insert into public.cart_items (user_id, product_id, quantity) values (%L, %L, 1)', ua, p3), '42501');
  reset role;

  ---------------------------------------------------------------------------
  -- Anonymous visitor
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := r || public._t_raises('anon cannot read carts',                    'select 1 from public.cart_items', '42501');
  r := r || public._t_raises('anon cannot read orders',                   'select 1 from public.orders', '42501');
  r := r || public._t_raises('anon cannot read order items',              'select 1 from public.order_items', '42501');
  r := r || public._t_raises('anon cannot read addresses',                'select 1 from public.addresses', '42501');
  r := r || public._t_check('anon reads active products (2)',             public._t_count('select 1 from public.products where category_slug = ''rls-test''') = 2);
  r := r || public._t_check('anon cannot see inactive product',           public._t_count(format('select 1 from public.products where id = %L', p2)) = 0);
  r := r || public._t_raises('anon cannot INSERT a product',              'insert into public.products (slug, title, category_slug, price_cents) values (''evil'', ''evil'', ''rls-test'', 1)', '42501');
  r := r || public._t_raises('anon cannot UPDATE a product',              format('update public.products set price_cents = 1 where id = %L', p1), '42501');
  r := r || public._t_raises('anon cannot UPLOAD to the bucket',          'insert into storage.objects (bucket_id, name) values (''product-images'', ''evil.png'')', '42501');
  reset role;

  ---------------------------------------------------------------------------
  -- Aftermath (as the privileged role): nothing the attacker tried landed
  ---------------------------------------------------------------------------
  r := r || public._t_check('AFTER: B''s cart intact (p1=2, p3=3)',
    (select count(*) from public.cart_items where user_id = ub
       and ((product_id = p1 and quantity = 2) or (product_id = p3 and quantity = 3))) = 2);
  r := r || public._t_check('AFTER: A''s cart has only its original row',
    (select count(*) from public.cart_items where user_id = ua) = 1);
  r := r || public._t_check('AFTER: no cart row was moved to B',
    (select count(*) from public.cart_items where user_id = ub) = 2);
  r := r || public._t_check('AFTER: orders untouched (2 rows, totals 1000/500, statuses placed)',
    (select count(*) from public.orders where (id = oa and total_cents = 1000 and status = 'placed')
                                           or (id = ob and total_cents = 500  and status = 'placed')) = 2
    and (select count(*) from public.orders) = 2);
  r := r || public._t_check('AFTER: order item prices untouched',
    (select count(*) from public.order_items where (order_id = oa and unit_price_cents = 1000)
                                                or (order_id = ob and unit_price_cents = 500)) = 2
    and (select count(*) from public.order_items) = 2);
  r := r || public._t_check('AFTER: addresses untouched',
    (select count(*) from public.addresses where line1 in ('1 A St', '2 B St')) = 2);
  r := r || public._t_check('AFTER: catalog untouched (3 products, price 1000, no evil rows)',
    (select count(*) from public.products where category_slug = 'rls-test') = 3
    and (select price_cents from public.products where id = p1) = 1000
    and (select count(*) from public.products where slug = 'evil') = 0
    and (select count(*) from public.categories where slug = 'evil') = 0
    and (select count(*) from public.reviews where author_name = 'shill') = 0
    and (select count(*) from storage.objects where name = 'evil.png') = 0);

  ---------------------------------------------------------------------------
  -- Structural guards
  ---------------------------------------------------------------------------
  r := r || public._t_check('every public table has RLS enabled',
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity) = 0);
  r := r || public._t_check('no SECURITY DEFINER functions in public yet (RPCs come later)',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef) = 0);
  r := r || public._t_check('no views in public (views can bypass RLS)',
    (select count(*) from pg_views where schemaname = 'public') = 0);

  perform set_config('rls.results', array_to_string(r, E'\n'), true);
end $$;

with lines as (
  select line, n
  from unnest(string_to_array(current_setting('rls.results'), E'\n')) with ordinality as t(line, n)
)
select 0 as n,
       'SUMMARY: ' || count(*) filter (where line like 'PASS%') || ' passed, '
                   || count(*) filter (where line like 'FAIL%') || ' failed' as result
from lines
union all
select n, line from lines
order by n;

rollback;
