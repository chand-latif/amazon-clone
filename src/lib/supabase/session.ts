import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";
import { safeNextPath } from "@/lib/redirect";

// Pages that need a signed-in user. The proxy only redirects optimistically
// (fast, no page render); every one of these pages ALSO verifies the user on the
// server with requireUser(), which is the check that actually protects data.
const PROTECTED_PREFIXES = ["/account", "/orders", "/checkout"];
// Signed-in users have no business on the auth forms.
const AUTH_PAGES = ["/signin", "/signup"];

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/** Carry refreshed session cookies over to a redirect response. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

/**
 * Refreshes the Supabase auth session (cookies on both request and response),
 * then applies the optimistic route protection above.
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
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && matches(pathname, PROTECTED_PREFIXES)) {
    const to = request.nextUrl.clone();
    to.pathname = "/signin";
    to.search = "";
    to.searchParams.set("next", pathname + search);
    return withCookies(NextResponse.redirect(to), response);
  }

  if (signedIn && matches(pathname, AUTH_PAGES)) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return withCookies(NextResponse.redirect(new URL(next, request.nextUrl.origin)), response);
  }

  return response;
}
