import "server-only";
import { headers } from "next/headers";

/**
 * Base URL used to build links Supabase emails to users (magic link, signup
 * confirmation). It must be on the project's Auth redirect allow-list.
 *
 * Order: explicit NEXT_PUBLIC_SITE_URL (set this in production) -> Vercel's
 * per-deployment URL -> the request's own host (local dev).
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
