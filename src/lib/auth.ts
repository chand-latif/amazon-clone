import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * The real access check for protected pages and actions.
 *
 * Uses getUser(), which asks the Auth server to validate the session, rather
 * than trusting the cookie alone. (The proxy's redirect is only an optimisation.)
 * Reads cookies, so call it inside <Suspense> or a server action.
 */
export async function requireUser(returnTo: string) {
  // The Supabase session check reads the clock (token expiry), which Next forbids
  // while prerendering. connection() keeps this strictly at request time.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/signin?next=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

/**
 * Signed-in user's display info for the header, or null. Cheap: no Auth-server
 * round trip. Takes the client as an argument so the caller can create it (which
 * reads cookies()) OUTSIDE any try/catch: swallowing the error Next throws while
 * prerendering a request API would freeze the signed-out header into the static page.
 */
export async function getHeaderUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", claims.sub).maybeSingle();
  const email = typeof claims.email === "string" ? claims.email : null;
  const name = profile?.full_name ?? (email ? email.split("@")[0] : null);
  return { id: claims.sub, name };
}
