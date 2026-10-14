-- Database-level limits on addresses.
--
-- Until now the 20-address cap and the length checks lived ONLY in the
-- addAddress server action. RLS lets a signed-in user write their own rows
-- through the REST API directly, bypassing that action, so they could store
-- unlimited rows of unlimited text (and place_order copies address text into
-- orders.shipping_address, amplifying it). The database must enforce this itself.

-- 1. Column limits. btrim() so a value of only spaces doesn't count as filled in.
alter table public.addresses
  add constraint addresses_full_name_len check (char_length(btrim(full_name)) between 1 and 100),
  add constraint addresses_line1_len     check (char_length(btrim(line1))     between 1 and 200),
  add constraint addresses_line2_len     check (line2 is null or char_length(line2) <= 200),
  add constraint addresses_city_len      check (char_length(btrim(city))      between 1 and 100),
  add constraint addresses_region_len    check (char_length(btrim(region))    between 1 and 100),
  add constraint addresses_postal_len    check (char_length(btrim(postal_code)) between 1 and 20),
  -- ISO 3166-1 alpha-2, upper case (the app's country list stores exactly this)
  add constraint addresses_country_fmt   check (country ~ '^[A-Z]{2}$'),
  add constraint addresses_phone_fmt     check (phone is null or (char_length(phone) between 5 and 30 and phone ~ '^[0-9+()\-. ]+$'));

-- 2. At most 20 addresses per user. The advisory lock serialises concurrent
--    inserts for the SAME user, so two simultaneous requests can't both pass
--    the count. SECURITY INVOKER: the count runs under the caller's RLS, which
--    is exactly their own rows.
create or replace function public.enforce_address_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.addresses a where a.user_id = new.user_id) >= 20 then
    raise exception 'address_limit_reached' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Only ever runs as a trigger; keep it off the public RPC surface.
revoke execute on function public.enforce_address_limit() from public, anon, authenticated;

create trigger addresses_enforce_limit
  before insert on public.addresses
  for each row execute function public.enforce_address_limit();

-- 3. Defence in depth: an order's address snapshot can never be huge, whatever
--    path wrote it. (The legitimate maximum is roughly 1 KB.)
alter table public.orders
  add constraint orders_shipping_address_size check (pg_column_size(shipping_address) <= 4096);
