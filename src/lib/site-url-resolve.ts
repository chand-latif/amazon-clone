/**
 * Pure resolver for the public base URL embedded in auth emails.
 *
 * Why this is strict: if the base URL came from the request's Host header, anyone
 * could POST a forged Host and make Supabase email a victim a "sign in" link that
 * points at the attacker's domain. In production the URL therefore comes only from
 * trusted configuration, and the function throws (fails closed) rather than guess.
 */
export type SiteUrlInput = {
  /** NEXT_PUBLIC_SITE_URL */
  configured?: string;
  /** NODE_ENV === "production" */
  isProduction: boolean;
  /** VERCEL_ENV ("production" | "preview" | "development") */
  vercelEnv?: string;
  /** VERCEL_PROJECT_PRODUCTION_URL: host only, set by Vercel */
  vercelProductionHost?: string;
  /** VERCEL_URL: this deployment's host, set by Vercel */
  vercelDeploymentHost?: string;
  /** Request-derived origin; consulted ONLY outside production. */
  requestOrigin?: () => string;
};

function toOrigin(raw: string, requireHttps: boolean, label: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && !requireHttps)) {
    throw new Error(`${label} must use https`);
  }
  if (url.username || url.password) throw new Error(`${label} must not contain credentials`);
  return url.origin; // drops any path, query, fragment and trailing slash
}

export function resolveSiteUrl(input: SiteUrlInput): string {
  const { isProduction } = input;

  if (input.configured?.trim()) return toOrigin(input.configured, isProduction, "NEXT_PUBLIC_SITE_URL");

  if (input.vercelEnv === "production" && input.vercelProductionHost) {
    return toOrigin(`https://${input.vercelProductionHost}`, true, "VERCEL_PROJECT_PRODUCTION_URL");
  }
  if (input.vercelEnv === "preview" && input.vercelDeploymentHost) {
    return toOrigin(`https://${input.vercelDeploymentHost}`, true, "VERCEL_URL");
  }

  if (!isProduction && input.requestOrigin) return toOrigin(input.requestOrigin(), false, "request origin");

  throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
}
