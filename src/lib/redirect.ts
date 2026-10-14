// Redirect-back after login: the `next` URL param is attacker-controllable
// (anyone can send a victim a /signin?next=... link), so it is only ever used
// after passing through this validator. Pure and dependency-free so it can be
// tested directly and used from server code and the proxy alike.

const MAX_LENGTH = 500;

// Never bounce back to an auth page: it would loop or flash the form again.
const AUTH_PATHS = ["/signin", "/signup", "/auth"];

/**
 * Returns a same-origin, path-only URL ("/orders?page=2") or `fallback`.
 *
 * Rejects: absolute URLs ("https://evil.com"), protocol-relative ("//evil.com"),
 * backslash tricks ("/\evil.com", which browsers treat like "//"), control
 * characters (a "\t" inside "/\t/evil.com" is stripped by browsers, which turns
 * it into "//evil.com"), and loops back into the auth pages.
 */
export function safeNextPath(raw: unknown, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  if (raw.length === 0 || raw.length > MAX_LENGTH) return fallback;
  if (raw[0] !== "/" || raw[1] === "/") return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, "http://internal.invalid");
  } catch {
    return fallback;
  }
  // Belt and braces: whatever the parser made of it must still be same-origin.
  if (url.origin !== "http://internal.invalid") return fallback;

  const { pathname, search } = url;
  if (AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return fallback;

  return pathname + search;
}
