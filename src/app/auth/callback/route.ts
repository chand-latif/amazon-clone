import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// Only the email flows we actually send. (No password-reset or invite UI exists,
// so those token types are rejected rather than half-supported.)
const OTP_TYPES: EmailOtpType[] = ["signup", "magiclink", "email"];

/**
 * Lands the user here from an emailed link and turns it into a session:
 *  - ?code=...                 PKCE link (Supabase's default template)
 *  - ?token_hash=...&type=...  token-hash link (works when opened on another device)
 * then redirects to the validated `next` path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let failed = true;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    failed = Boolean(error);
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    failed = Boolean(error);
  }

  if (failed) {
    const to = new URL("/signin", origin);
    to.searchParams.set("error", "link");
    if (next !== "/") to.searchParams.set("next", next);
    return NextResponse.redirect(to);
  }

  return NextResponse.redirect(new URL(next, origin));
}
