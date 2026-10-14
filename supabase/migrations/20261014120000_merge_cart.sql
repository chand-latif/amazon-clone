-- merge_cart(items): fold a guest's local cart into the signed-in user's cart.
--
--   items = [{"product_id": "<uuid>", "qty": 3}, ...]
--
-- Rules
--   * Quantities are SUMMED with what's already in the cart, clamped to 10.
--   * Repeated product ids inside the payload are combined first (a single
--     INSERT ... ON CONFLICT can't touch the same row twice).
--   * Inactive/unknown products are skipped (the products policy hides inactive
--     rows, and the inner join drops unknown ids).
--   * SECURITY INVOKER on purpose: it runs AS the caller, so RLS on cart_items
--     applies and auth.uid() is the only user it can ever write for. There is
--     no way to pass a user id.

create or replace function public.merge_cart(items jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if jsonb_typeof(items) is distinct from 'array' then
    raise exception 'items must be a JSON array' using errcode = '22023';
  end if;
  -- A real guest cart is tiny; refuse anything that looks like abuse.
  if jsonb_array_length(items) > 100 then
    raise exception 'too many items' using errcode = '22023';
  end if;

  insert into public.cart_items (user_id, product_id, quantity)
  select uid, i.product_id, least(10, greatest(1, sum(i.qty)))::int
  from jsonb_to_recordset(items) as i(product_id uuid, qty int)
  join public.products p on p.id = i.product_id and p.is_active
  where i.qty is not null and i.qty > 0
  group by i.product_id
  on conflict (user_id, product_id) do update
    set quantity = least(10, public.cart_items.quantity + excluded.quantity);
end;
$$;

-- Signed-in users only.
revoke execute on function public.merge_cart(jsonb) from public, anon;
grant execute on function public.merge_cart(jsonb) to authenticated;
