import Link from "next/link";
import { connection } from "next/server";
import { getHeaderUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CartSync } from "./cart/CartSync";

const linkClass =
  "rounded px-2 py-1 text-xs leading-tight hover:outline hover:outline-1 hover:outline-white/60";

/** Presentational: used as the Suspense fallback (signed-out look) and by AccountMenu. */
export function AccountLink({ name }: { name: string | null }) {
  return (
    <Link href={name ? "/account" : "/signin"} className={linkClass}>
      <span className="block max-w-28 truncate text-zinc-300">{name ? `Hello, ${name}` : "Hello, sign in"}</span>
      <span className="block text-sm font-bold">
        <span className="sm:hidden">Account</span>
        <span className="hidden sm:inline">Account &amp; Orders</span>
      </span>
    </Link>
  );
}

/** Reads the session, so it must render inside <Suspense> (see Header). */
export async function AccountMenu() {
  // Request-time only: the session check reads the clock (token expiry), which
  // Next forbids while prerendering.
  await connection();
  // Request API (cookies): deliberately NOT inside the try/catch below. During
  // prerender Next signals "this is dynamic" by throwing here, and catching that
  // would bake the signed-out header into the static page.
  const supabase = await createClient();

  // undefined = "couldn't tell" (as opposed to null = "definitely signed out"), so a
  // failed lookup never makes the cart think a signed-in user is a guest.
  let userId: string | null | undefined;
  let name: string | null = null;
  try {
    const user = await getHeaderUser(supabase);
    userId = user?.id ?? null;
    name = user?.name ?? null;
  } catch (error) {
    // A header hiccup must never take the page down; show the signed-out state.
    console.error("Header user lookup failed:", error);
  }
  return (
    <>
      <AccountLink name={name} />
      {/* Tells the cart whether to use the local (guest) or database cart. Renders nothing. */}
      <CartSync userId={userId} />
    </>
  );
}
