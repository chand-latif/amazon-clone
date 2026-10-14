# Auth setup and behaviour

Supabase Auth with email + password and magic links, a `profiles` row created by a
database trigger, and redirect-back after login.

## What you must configure in the Supabase dashboard

The app can't change these (no API access), and auth emails fail or misroute without them.

1. **Authentication → URL Configuration**
   - **Site URL**: your production URL (e.g. `https://your-app.vercel.app`).
   - **Redirect URLs** (all of them; wildcards are fine):
     - `http://localhost:3000/**` and `http://localhost:3001/**` (local dev)
     - `https://your-app.vercel.app/**` (production)
     - `https://*-your-team.vercel.app/**` (Vercel preview deployments)

   If the link's redirect target isn't on this list, Supabase **silently falls back to the Site URL**,
   which drops the `next` redirect-back and lands users on the wrong page.
2. **Production env var**: set `NEXT_PUBLIC_SITE_URL` on Vercel to the production URL (https). In production the
   app **fails closed**: with no trusted URL it refuses to send auth emails instead of trusting the request
   `Host` header (which an attacker can forge to make Supabase email a victim a link to another domain).
   Resolution order (`src/lib/site-url-resolve.ts`, tested by `npm test`): `NEXT_PUBLIC_SITE_URL` →
   Vercel production host (`VERCEL_PROJECT_PRODUCTION_URL`) → Vercel preview host (`VERCEL_URL`) → request
   host in **development only**.
3. **Email delivery** (Authentication → Emails → SMTP Settings)
   - Supabase's built-in SMTP is for testing only: it **only delivers to your organisation's members**
     and has a very low hourly limit (the app shows "Too many attempts" when it is hit).
   - For real users, configure a custom SMTP provider (Resend, Postmark, SES, ...).
4. **Email confirmation** (Authentication → Sign In / Providers → Email → "Confirm email")
   - **On** (default): sign-up shows "check your email" and the link signs the user in.
   - **Off**: sign-up signs the user in immediately.
   - The app handles both; no code change needed.

### Optional: make links work across devices

Supabase's default templates produce PKCE links (`?code=`), which only work in the browser that
requested them. `/auth/callback` also accepts token-hash links, which work anywhere. To use them,
edit the **Confirm signup** and **Magic Link** templates (Authentication → Emails):

```html
<!-- Confirm signup -->
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>

<!-- Magic Link -->
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=magiclink">Sign in</a>
```

`{{ .RedirectTo }}` is the app's own `/auth/callback?next=...` URL, so redirect-back keeps working.

## How it works

| Piece | Where |
|---|---|
| `profiles` table, RLS, signup trigger | `supabase/migrations/20261014090000_profiles.sql` |
| Sign-in, sign-up, magic link, sign-out, profile actions | `src/app/auth/actions.ts` |
| Email-link landing (`code` or `token_hash`) | `src/app/auth/callback/route.ts` |
| Session refresh + optimistic route protection | `src/lib/supabase/session.ts`, `src/proxy.ts` |
| Real access check for pages | `requireUser()` in `src/lib/auth.ts` |
| Redirect-back validation | `safeNextPath()` in `src/lib/redirect.ts` |

- **Protected routes**: `/account`, `/orders`, `/checkout` (and sub-paths). The proxy redirects signed-out
  visitors to `/signin?next=<path>` as a fast first pass; each page then re-verifies with `getUser()`, which is
  the check that actually protects data. RLS is the last layer.
- **Redirect-back**: `next` is validated by `safeNextPath()` everywhere it is read: same-origin paths only,
  no `//host`, backslashes, control characters, or loops into `/signin`, `/signup`, `/auth`.
- **Profiles**: the `on_auth_user_created` trigger inserts a row (name from signup metadata, trimmed and
  capped at 100 chars). Users can read their own row and update only `full_name`; there is no client
  insert/delete. The trigger function is `SECURITY DEFINER` with a pinned `search_path` and is not executable
  by `anon`/`authenticated`.
- **Errors**: Supabase error codes map to friendly messages in `describe()`; unknown ones are logged
  server-side, never shown raw. Wrong password and unknown email give the same message.

## Testing without sending email

```bash
npm run test-user -- create                       # confirmed account + profile (needs TEST_USER_* in .env.local)
MSYS_NO_PATHCONV=1 npm run test-user -- link /orders   # prints a one-time /auth/callback path to open in the browser
npm run test-user -- delete                       # removes it
```

The script only accepts emails ending in `@amazonclone.test` and uses the service-role key (local only).
Note Git Bash rewrites a leading `/` in arguments, hence `MSYS_NO_PATHCONV=1` for the `link` path.

Public sign-up rejects `@amazonclone.test` (`email_address_invalid`), so the real sign-up and "email me a
link" happy paths need a deliverable address, which with the built-in SMTP means a member of your Supabase
organisation.

## Security tests

`supabase/tests/rls.test.sql` (96 checks) covers cross-user isolation for profiles, carts, addresses and
orders, the signup trigger's trimming/truncation, and that the trigger function is not callable by clients.
