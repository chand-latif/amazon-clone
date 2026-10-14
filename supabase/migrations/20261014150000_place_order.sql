-- Order placement: the ONLY way an order comes into existence.
--
-- Clients have no INSERT/UPDATE grants on orders, order_items or products stock,
-- so this function is SECURITY DEFINER. That makes it an RLS bypass by design,
-- which is why it is strict:
--   * it acts only for auth.uid() (there is no user id parameter),
--   * it takes NO prices or quantities from the caller: it reads the caller's own
--     cart and the current product rows itself,
--   * search_path is pinned, and only signed-in users may execute it.
--
-- Everything below runs in ONE transaction. Any failure raises and rolls back all
-- of it: no order, no stock change, cart untouched.
--
-- Error contract (message = machine code; DETAIL = JSON where useful):
--   cart_empty          nothing to buy
--   address_not_found   not the caller's address
--   cart_unavailable    DETAIL: [{product_id,title,reason:'unavailable'|'out_of_stock',available?,requested?}]
--   price_changed       DETAIL: {expected,actual}   (the total the shopper saw is stale)
--   order_too_large     sanity limit
--   not_authenticated   (SQLSTATE 28000)

-- ---------------------------------------------------------------------------
-- Retry safety: one order per (user, idempotency key)
-- ---------------------------------------------------------------------------
alter table public.orders add column idempotency_key uuid;

create unique index orders_user_idempotency_idx
  on public.orders (user_id, idempotency_key)
  where idempotency_key is not null;

-- ---------------------------------------------------------------------------
-- Shipping rule: flat $4.99, free at $35.00 and over. Pure and immutable.
-- (src/lib/pricing.ts mirrors this for DISPLAY only; place_order is authoritative
-- and rejects an order whose displayed total disagrees.)
-- ---------------------------------------------------------------------------
create or replace function public.shipping_cents_for(subtotal_cents integer)
returns integer
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when subtotal_cents >= 3500 then 0 else 499 end;
$$;

-- ---------------------------------------------------------------------------
-- place_order
-- ---------------------------------------------------------------------------
create or replace function public.place_order(
  p_address_id uuid,
  p_expected_total_cents integer,
  p_idempotency_key uuid default null
)
returns table (placed_order_id uuid, placed_order_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  addr public.addresses%rowtype;
  prior_id uuid;
  prior_number bigint;
  line record;
  lines jsonb := '[]'::jsonb;
  problems jsonb := '[]'::jsonb;
  v_subtotal bigint := 0;
  v_shipping integer;
  v_tax integer := 0;          -- demo: no tax
  v_total integer;
  new_id uuid;
  new_number bigint;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- A retry of an order that already went through returns that order.
  if p_idempotency_key is not null then
    select o.id, o.order_number into prior_id, prior_number
    from public.orders o
    where o.user_id = uid and o.idempotency_key = p_idempotency_key;
    if found then
      return query select prior_id, prior_number;
      return;
    end if;
  end if;

  -- The address must be the caller's own.
  select * into addr from public.addresses a where a.id = p_address_id and a.user_id = uid;
  if not found then
    raise exception 'address_not_found' using errcode = 'P0001';
  end if;

  -- Lock the caller's cart rows AND the product rows, in product-id order.
  --  * Same order in every transaction => two orders over overlapping products
  --    can't deadlock.
  --  * Locking the cart rows too means a double-submit waits here, then finds the
  --    cart already emptied, instead of buying everything twice.
  --  * Locking products serialises competing buyers of the last units.
  for line in
    select ci.product_id, ci.quantity, p.title, p.price_cents, p.stock, p.is_active,
           (select pi.path from public.product_images pi
             where pi.product_id = p.id order by pi.position limit 1) as image_path
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    where ci.user_id = uid
    order by p.id
    for update of ci, p
  loop
    lines := lines || jsonb_build_object(
      'product_id', line.product_id,
      'quantity', line.quantity,
      'title', line.title,
      'price_cents', line.price_cents,
      'image_path', line.image_path
    );

    if not line.is_active then
      problems := problems || jsonb_build_object(
        'product_id', line.product_id, 'title', line.title, 'reason', 'unavailable');
    elsif line.stock < line.quantity then
      problems := problems || jsonb_build_object(
        'product_id', line.product_id, 'title', line.title, 'reason', 'out_of_stock',
        'available', line.stock, 'requested', line.quantity);
    else
      v_subtotal := v_subtotal + line.price_cents::bigint * line.quantity;
    end if;
  end loop;

  if jsonb_array_length(lines) = 0 then
    -- A concurrent duplicate of THIS order may have just emptied the cart.
    if p_idempotency_key is not null then
      select o.id, o.order_number into prior_id, prior_number
      from public.orders o
      where o.user_id = uid and o.idempotency_key = p_idempotency_key;
      if found then
        return query select prior_id, prior_number;
        return;
      end if;
    end if;
    raise exception 'cart_empty' using errcode = 'P0001';
  end if;

  if jsonb_array_length(problems) > 0 then
    raise exception 'cart_unavailable' using errcode = 'P0001', detail = problems::text;
  end if;

  if v_subtotal > 100000000 then   -- $1,000,000: also keeps us far from int overflow
    raise exception 'order_too_large' using errcode = 'P0001';
  end if;

  v_shipping := public.shipping_cents_for(v_subtotal::integer);
  v_total := v_subtotal::integer + v_shipping + v_tax;

  -- The shopper confirmed a specific total. If prices moved since, don't charge a different one.
  if p_expected_total_cents is distinct from v_total then
    raise exception 'price_changed' using errcode = 'P0001',
      detail = jsonb_build_object('expected', p_expected_total_cents, 'actual', v_total)::text;
  end if;

  begin
    insert into public.orders (
      user_id, subtotal_cents, shipping_cents, tax_cents, total_cents,
      shipping_address, payment_method, idempotency_key
    ) values (
      uid, v_subtotal::integer, v_shipping, v_tax, v_total,
      -- Snapshot: later edits/deletes of the address must not rewrite history.
      jsonb_build_object(
        'full_name', addr.full_name, 'line1', addr.line1, 'line2', addr.line2,
        'city', addr.city, 'region', addr.region, 'postal_code', addr.postal_code,
        'country', addr.country, 'phone', addr.phone
      ),
      'mock', p_idempotency_key
    )
    returning id, order_number into new_id, new_number;
  exception when unique_violation then
    -- Lost a race with an identical retry: hand back the winner's order.
    select o.id, o.order_number into prior_id, prior_number
    from public.orders o
    where o.user_id = uid and o.idempotency_key = p_idempotency_key;
    return query select prior_id, prior_number;
    return;
  end;

  -- Price/title/image snapshots: taken from the rows we locked above.
  insert into public.order_items (
    order_id, user_id, product_id, title_snapshot, image_path_snapshot, unit_price_cents, quantity
  )
  select new_id, uid, l.product_id, l.title, l.image_path, l.price_cents, l.quantity
  from jsonb_to_recordset(lines)
    as l(product_id uuid, quantity integer, title text, price_cents integer, image_path text);

  -- products.stock has CHECK (stock >= 0) as a last line of defence; the locks
  -- and validation above mean it should never be the thing that stops us.
  update public.products p
  set stock = p.stock - l.quantity
  from jsonb_to_recordset(lines) as l(product_id uuid, quantity integer)
  where p.id = l.product_id;

  delete from public.cart_items where user_id = uid;

  return query select new_id, new_number;
end;
$$;

revoke execute on function public.place_order(uuid, integer, uuid) from public, anon;
grant execute on function public.place_order(uuid, integer, uuid) to authenticated;
