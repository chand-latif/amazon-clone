import "server-only";
import { headers } from "next/headers";
import { resolveSiteUrl } from "./site-url-resolve";

/**
 * Base URL used to build links Supabase emails to users (magic link, signup
 * confirmation). It must be on the project's Auth redirect allow-list.
 *
 * Throws in production when no trusted URL is configured; see site-url-resolve.ts.
 */
export async function getSiteUrl(): Promise<string> {
  const h = await headers();
  return resolveSiteUrl({
    configured: process.env.NEXT_PUBLIC_SITE_URL,
    isProduction: process.env.NODE_ENV === "production",
    vercelEnv: process.env.VERCEL_ENV,
    vercelProductionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    vercelDeploymentHost: process.env.VERCEL_URL,
    requestOrigin: () => {
      const host = h.get("host") ?? "localhost:3000";
      const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    },
  });
}
