import { createBrowserClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS, withSessionLifetime } from "./cookie-options";

/** Browser Supabase client (anon key; every table is protected by RLS). */
export function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    // Same cookie jar as the default, but writes go through withSessionLifetime
    // so a token refresh in the browser doesn't re-extend the cookie to 400 days.
    cookies: {
      getAll() {
        return parseCookieHeader(document.cookie).map(({ name, value }) => ({ name, value: value ?? "" }));
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          document.cookie = serializeCookieHeader(name, value, withSessionLifetime(options));
        });
      },
    },
  });
}
