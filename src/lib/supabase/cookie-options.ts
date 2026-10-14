import type { CookieOptionsWithName } from "@supabase/ssr";

/**
 * Session cookie attributes, shared by the browser, server and proxy clients so
 * they can never disagree.
 *
 * - `secure` in production: the session never travels over plain HTTP.
 * - `maxAge` 7 days instead of the library's 400 days. The access token is
 *   refreshed (and the cookie re-written) while the user is active, so this is
 *   an inactivity limit; a stolen or forgotten browser profile expires sooner.
 * - `httpOnly` stays false ON PURPOSE: the browser client (cart writes) reads the
 *   session from document.cookie. Moving every browser-side Supabase call behind
 *   server actions would allow httpOnly; until then the strict CSP and the
 *   cookie lifetime are the mitigations.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 7,
};

/**
 * @supabase/ssr always writes `maxAge: 400 days` and ignores `cookieOptions.maxAge`,
 * so apply our lifetime to every cookie it asks us to set. A removal
 * (`maxAge: 0`) is left alone.
 */
export function withSessionLifetime<T extends { maxAge?: number }>(options: T): T {
  return options.maxAge === 0 ? options : { ...options, ...SESSION_COOKIE_OPTIONS, maxAge: SESSION_COOKIE_OPTIONS.maxAge };
}
