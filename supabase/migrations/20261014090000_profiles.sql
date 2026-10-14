-- User profiles: one row per auth user, created by a trigger on signup.
--
--   * Clients can READ their own row and UPDATE only full_name. There is no
--     insert/delete policy or grant: rows come from the trigger (and vanish
--     with the auth user via ON DELETE CASCADE).
--   * Email is NOT copied here; it stays in auth.users.
--   * full_name comes from signup metadata, which the user controls, so it is
--     trimmed, length-limited, and stored as plain text.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (full_name is null or char_length(full_name) between 1 and 100),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "users read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "users update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Least privilege: read everything of their own row, change only full_name.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- It only needs to run as a trigger. Keep it off the public RPC surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that existed before this migration get a profile too.
insert into public.profiles (id, full_name)
select u.id, nullif(left(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), 100), '')
from auth.users u
on conflict (id) do nothing;
