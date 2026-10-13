import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

/**
 * Refreshes the Supabase auth session and writes any updated cookies to both
 * the request (for downstream rendering) and the response (for the browser).
 * Called from src/proxy.ts. No route protection yet (added with auth).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, anonKey } = getSupabaseEnv();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Validates the JWT and refreshes it when expired. Do not remove: it is
  // what keeps sessions alive. Don't put logic between client creation and this.
  await supabase.auth.getClaims();

  return response;
}
