-- place_order attack + correctness test. Run AFTER migrations are applied (SQL
-- editor, `psql -f`, or MCP execute_sql). Simulates Supabase requests with
-- SET ROLE + JWT claims and ends with ROLLBACK (nothing is left behind).
--
-- Proves: nothing is created or changed on any failure; an order snapshots
-- price/title/image/address; stock decrements exactly; the cart empties; a
-- retry with the same key returns the same order; keys are per-user; shipping
-- is exact at the $35.00 boundary; only the caller's own address/cart are used;
-- anon and subject-less callers are refused.
--
-- (Concurrency, i.e. racing for the last unit, can't be shown inside one
-- transaction: see scripts/test-place-order-race.mts.)
--
-- Output: one row per check. Any line starting with FAIL is a bug.

begin;

create function public._t_check(label text, ok boolean) returns text
language sql as $$ select case when ok then 'PASS  ' else 'FAIL  ' end || label $$;

create function public._t_raises(label text, q text, expected text) returns text
language plpgsql as $$
begin
  execute q;
  return 'FAIL  ' || label || ' (statement succeeded)';
exception when others then
  if sqlstate = expected then return 'PASS  ' || label; end if;
  return 'FAIL  ' || label || ' (got ' || sqlstate || ': ' || sqlerrm || ')';
end $$;

-- Expects an error whose MESSAGE is `expected_message` (and, optionally, whose
-- DETAIL contains `detail_like`).
create function public._t_fails(label text, q text, expected_message text, detail_like text default null)
returns text language plpgsql as $$
declare m text; d text;
begin
  execute q;
  return 'FAIL  ' || label || ' (statement succeeded)';
exception when others then
  get stacked diagnostics m = message_text, d = pg_exception_detail;
  if m = expected_message and (detail_like is null or coalesce(d, '') like '%' || detail_like || '%') then
    return 'PASS  ' || label;
  end if;
  return 'FAIL  ' || label || ' (got "' || m || '", detail ' || coalesce(d, 'null') || ')';
end $$;

do $$
declare
  ua   constant uuid := '00000000-0000-0000-0000-00000000000a';
  ub   constant uuid := '00000000-0000-0000-0000-00000000000b';
  p1   constant uuid := '00000000-0000-0000-0000-0000000000a1'; -- $10.00 stock 5
  p2   constant uuid := '00000000-0000-0000-0000-0000000000a2'; -- INACTIVE
  p3   constant uuid := '00000000-0000-0000-0000-0000000000a3'; -- $5.00  stock 5
  p4   constant uuid := '00000000-0000-0000-0000-0000000000a4'; -- $34.99 stock 5
  adda constant uuid := '00000000-0000-0000-0000-0000000000c1';
  addb constant uuid := '00000000-0000-0000-0000-0000000000c2';
  k1   constant uuid := '00000000-0000-0000-0000-0000000000d1';
  k2   constant uuid := '00000000-0000-0000-0000-0000000000d2';
  r    text[] := '{}';
  res  record;
  a_order uuid;
  b_order uuid;
begin
  -------------------------------------------------------------------------
  -- Fixtures
  -------------------------------------------------------------------------
  insert into auth.users (id, aud, role, email) values
    (ua, 'authenticated', 'authenticated', 'a@po-test.local'),
    (ub, 'authenticated', 'authenticated', 'b@po-test.local');
  insert into public.categories (slug, name) values ('po-test', 'PO Test');
  insert into public.products (id, slug, title, category_slug, price_cents, stock, is_active) values
    (p1, 'po-p1', 'Active one', 'po-test', 1000, 5, true),
    (p2, 'po-p2', 'Inactive',   'po-test', 1000, 5, false),
    (p3, 'po-p3', 'Active two', 'po-test',  500, 5, true),
    (p4, 'po-p4', 'Boundary',   'po-test', 3499, 5, true);
  insert into public.product_images (product_id, path, position) values
    (p1, 'a/1.webp', 1), (p1, 'a/0.webp', 0), (p3, 'c/0.webp', 0);
  insert into public.addresses (id, user_id, full_name, line1, city, region, postal_code, country, phone) values
    (adda, ua, 'A Person', '1 A St', 'Acity', 'AR', '11111', 'US', '555-0001'),
    (addb, ub, 'B Person', '2 B St', 'Bcity', 'BR', '22222', 'US', null);
  insert into public.cart_items (user_id, product_id, quantity) values (ua, p1, 2), (ub, p1, 2), (ub, p3, 3);

  -------------------------------------------------------------------------
  -- Signed-in user A: every failure must leave NOTHING behind
  -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  r := r || public._t_fails('B''s address is rejected',            format('select * from public.place_order(%L, 2499, null)', addb), 'address_not_found');
  r := r || public._t_fails('a nonexistent address is rejected',   format('select * from public.place_order(%L, 2499, null)', gen_random_uuid()), 'address_not_found');
  r := r || public._t_fails('a stale total is rejected',           format('select * from public.place_order(%L, 2000, null)', adda), 'price_changed', '2499');
  r := r || public._t_fails('a missing expected total is rejected', format('select * from public.place_order(%L, null, null)', adda), 'price_changed');
  reset role;
  r := r || public._t_check('after those failures: no order, stock untouched, cart intact',
    (select count(*) from public.orders where user_id = ua) = 0
    and (select stock from public.products where id = p1) = 5
    and (select quantity from public.cart_items where user_id = ua and product_id = p1) = 2
    and (select count(*) from public.cart_items where user_id = ua) = 1);

  set local role authenticated;
  update public.cart_items set quantity = 6 where user_id = ua and product_id = p1;   -- more than the 5 in stock
  r := r || public._t_fails('asking for more than the stock is rejected', format('select * from public.place_order(%L, 6499, null)', adda), 'cart_unavailable', '"available": 5');
  update public.cart_items set quantity = 2 where user_id = ua and product_id = p1;
  insert into public.cart_items (user_id, product_id, quantity) values (ua, p2, 1);     -- an inactive product
  r := r || public._t_fails('an inactive product in the cart is rejected', format('select * from public.place_order(%L, 2499, null)', adda), 'cart_unavailable', '"reason": "unavailable"');
  delete from public.cart_items where user_id = ua and product_id = p2;
  reset role;
  r := r || public._t_check('after those failures too: no order, stock untouched',
    (select count(*) from public.orders where user_id = ua) = 0
    and (select stock from public.products where id = p1) = 5
    and (select count(*) from public.order_items where user_id = ua) = 0);

  -------------------------------------------------------------------------
  -- Happy path: p1 x2 ($20.00) + p3 x1 ($5.00) = $25.00 + $4.99 shipping
  -------------------------------------------------------------------------
  set local role authenticated;
  insert into public.cart_items (user_id, product_id, quantity) values (ua, p3, 1);
  select * into res from public.place_order(adda, 2999, k1);
  a_order := res.placed_order_id;
  reset role;

  r := r || public._t_check('order created with exact totals ($25.00 + $4.99 = $29.99, tax 0)',
    exists (select 1 from public.orders o where o.id = a_order and o.user_id = ua
      and o.subtotal_cents = 2500 and o.shipping_cents = 499 and o.tax_cents = 0 and o.total_cents = 2999
      and o.status = 'placed' and o.payment_method = 'mock' and o.idempotency_key = k1));
  r := r || public._t_check('the returned order number is the real one',
    res.placed_order_number = (select order_number from public.orders where id = a_order) and res.placed_order_number > 0);
  r := r || public._t_check('the address is SNAPSHOTTED onto the order',
    (select shipping_address ->> 'full_name' from public.orders where id = a_order) = 'A Person'
    and (select shipping_address ->> 'city' from public.orders where id = a_order) = 'Acity'
    and (select shipping_address ->> 'phone' from public.orders where id = a_order) = '555-0001');
  r := r || public._t_check('order items snapshot title, unit price, quantity and the PRIMARY image',
    (select count(*) from public.order_items where order_id = a_order) = 2
    and exists (select 1 from public.order_items where order_id = a_order and product_id = p1 and title_snapshot = 'Active one'
                and unit_price_cents = 1000 and quantity = 2 and image_path_snapshot = 'a/0.webp' and user_id = ua)
    and exists (select 1 from public.order_items where order_id = a_order and product_id = p3 and title_snapshot = 'Active two'
                and unit_price_cents = 500 and quantity = 1 and image_path_snapshot = 'c/0.webp'));
  r := r || public._t_check('stock decremented by exactly the quantities bought (p1 5->3, p3 5->4)',
    (select stock from public.products where id = p1) = 3 and (select stock from public.products where id = p3) = 4);
  r := r || public._t_check('A''s cart is emptied',
    (select count(*) from public.cart_items where user_id = ua) = 0);
  r := r || public._t_check('B''s cart and B''s data are untouched by A''s order',
    (select count(*) from public.cart_items where user_id = ub) = 2
    and (select quantity from public.cart_items where user_id = ub and product_id = p1) = 2
    and (select quantity from public.cart_items where user_id = ub and product_id = p3) = 3
    and (select count(*) from public.orders where user_id = ub) = 0);

  -------------------------------------------------------------------------
  -- Snapshots are immutable: change the product and the address afterwards
  -------------------------------------------------------------------------
  update public.products set price_cents = 9999, title = 'Renamed' where id = p1;
  update public.addresses set city = 'Changed' where id = adda;
  set local role authenticated;
  r := r || public._t_check('later price/title/address edits do not rewrite the order',
    (select unit_price_cents from public.order_items where order_id = a_order and product_id = p1) = 1000
    and (select title_snapshot from public.order_items where order_id = a_order and product_id = p1) = 'Active one'
    and (select shipping_address ->> 'city' from public.orders where id = a_order) = 'Acity'
    and (select total_cents from public.orders where id = a_order) = 2999);
  reset role;
  update public.products set price_cents = 1000, title = 'Active one' where id = p1;

  -------------------------------------------------------------------------
  -- Retries: same key => same order, nothing duplicated
  -------------------------------------------------------------------------
  set local role authenticated;
  select * into res from public.place_order(adda, 2999, k1);
  r := r || public._t_check('retrying with the same key returns the SAME order',
    res.placed_order_id = a_order);
  select * into res from public.place_order(adda, 1, k1);   -- even a "wrong" total: it is a replay
  r := r || public._t_check('a replay never re-validates or re-charges',
    res.placed_order_id = a_order);
  reset role;
  r := r || public._t_check('...and nothing was duplicated (1 order, stock unchanged)',
    (select count(*) from public.orders where user_id = ua) = 1
    and (select stock from public.products where id = p1) = 3
    and (select count(*) from public.order_items where order_id = a_order) = 2);

  set local role authenticated;
  r := r || public._t_fails('an empty cart with a NEW key is cart_empty', format('select * from public.place_order(%L, 2999, %L)', adda, k2), 'cart_empty');
  reset role;

  -------------------------------------------------------------------------
  -- Shipping boundary, and idempotency keys are per user
  -------------------------------------------------------------------------
  -- B: p1 x2 ($20) + p3 x3 ($15) = exactly $35.00 => FREE shipping. B reuses A's key k1.
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into res from public.place_order(addb, 3500, k1);
  b_order := res.placed_order_id;
  reset role;
  r := r || public._t_check('exactly $35.00 ships free (subtotal 3500, shipping 0, total 3500)',
    exists (select 1 from public.orders o where o.id = b_order and o.user_id = ub
      and o.subtotal_cents = 3500 and o.shipping_cents = 0 and o.total_cents = 3500));
  r := r || public._t_check('B reusing A''s key made B''s OWN order, not a replay of A''s',
    b_order <> a_order and (select user_id from public.orders where id = b_order) = ub
    and (select count(*) from public.orders where user_id = ua) = 1);
  r := r || public._t_check('B''s address was snapshotted (null phone preserved)',
    (select shipping_address ->> 'full_name' from public.orders where id = b_order) = 'B Person'
    and (select shipping_address -> 'phone' from public.orders where id = b_order) = 'null'::jsonb);

  -- A: p4 $34.99 x1 => one cent under the threshold => shipping applies.
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.cart_items (user_id, product_id, quantity) values (ua, p4, 1);
  select * into res from public.place_order(adda, 3998, null);
  reset role;
  r := r || public._t_check('$34.99 pays shipping (subtotal 3499, shipping 499, total 3998)',
    exists (select 1 from public.orders o where o.id = res.placed_order_id
      and o.subtotal_cents = 3499 and o.shipping_cents = 499 and o.total_cents = 3998 and o.idempotency_key is null));
  r := r || public._t_check('totals satisfy the orders CHECK for every order made here',
    (select count(*) from public.orders where user_id in (ua, ub) and total_cents <> subtotal_cents + shipping_cents + tax_cents) = 0);

  -------------------------------------------------------------------------
  -- Who may call it at all
  -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  set local role authenticated;
  r := r || public._t_fails('a token with no subject is refused', format('select * from public.place_order(%L, 1, null)', adda), 'not_authenticated');
  reset role;

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  r := r || public._t_raises('anon cannot call place_order', format('select * from public.place_order(%L, 1, null)', adda), '42501');
  reset role;

  -------------------------------------------------------------------------
  -- Structure
  -------------------------------------------------------------------------
  r := r || public._t_check('place_order: SECURITY DEFINER with a pinned search_path',
    exists (select 1 from pg_proc p where p.proname = 'place_order' and p.prosecdef and p.proconfig @> array['search_path=""']));
  r := r || public._t_check('place_order takes NO prices, quantities or user id (only address, expected total, key)',
    (select p.proargnames[1:3] from pg_proc p where p.proname = 'place_order' and p.pronargs = 3)
      = array['p_address_id', 'p_expected_total_cents', 'p_idempotency_key']);
  r := r || public._t_check('place_order: authenticated may execute, anon may not',
    has_function_privilege('authenticated', 'public.place_order(uuid, integer, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.place_order(uuid, integer, uuid)', 'execute'));
  r := r || public._t_check('the only SECURITY DEFINER functions in public are the two reviewed ones',
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.proname not in ('handle_new_user', 'place_order')) = 0);
  r := r || public._t_check('shipping rule: 0 -> 499, 3499 -> 499, 3500 -> 0, 100000 -> 0',
    public.shipping_cents_for(0) = 499 and public.shipping_cents_for(3499) = 499
    and public.shipping_cents_for(3500) = 0 and public.shipping_cents_for(100000) = 0);

  perform set_config('po.results', array_to_string(r, E'\n'), true);
end $$;

with lines as (
  select line, n
  from unnest(string_to_array(current_setting('po.results'), E'\n')) with ordinality as t(line, n)
)
select 0 as n,
       'SUMMARY: ' || count(*) filter (where line like 'PASS%') || ' passed, '
                   || count(*) filter (where line like 'FAIL%') || ' failed' as result
from lines
union all
select n, line from lines
order by n;

rollback;
