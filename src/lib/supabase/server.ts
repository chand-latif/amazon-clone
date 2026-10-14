import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabaseEnv } from "@/lib/env";
import { SESSION_COOKIE_OPTIONS, withSessionLifetime } from "./cookie-options";

/**
 * Server Supabase client (anon key; acts as the signed-in user via cookies).
 *
 * Reads `cookies()`, so with Cache Components it must be called at request
 * time, inside a <Suspense> boundary. Create one per request; don't share it.
 */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, withSessionLifetime(options)),
          );
        } catch {
          // Called from a Server Component, which can't set cookies.
          // Safe to ignore: proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}
