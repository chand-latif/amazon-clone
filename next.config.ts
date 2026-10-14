import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Product images live in the public Supabase Storage bucket; allow only that host/path.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : null;
const supabaseHost = supabaseOrigin ? new URL(supabaseOrigin).hostname : "*.supabase.co";

// Content Security Policy.
//
// script-src keeps 'unsafe-inline' because Next streams inline bootstrap/RSC
// scripts, and a nonce-based policy would force every page to render
// dynamically (losing prerendering). So this CSP is NOT an XSS backstop; what it
// does buy is: no framing by other sites (clickjacking), no <base>/form-action
// hijacking, no plugins, and a short allow-list for where the browser may
// connect (this site + the Supabase project) or load images/fonts from.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`, // 'unsafe-eval' is dev-only (React/HMR)
  "style-src 'self' 'unsafe-inline'", // React inline style attributes (e.g. the carousel transform)
  "img-src 'self' data: blob:", // product images are proxied through /_next/image
  "font-src 'self'", // next/font self-hosts
  `connect-src 'self' ${supabaseOrigin ?? "https://*.supabase.co"}${isDev ? " ws: wss:" : ""}`, // Supabase REST/auth; ws for dev HMR
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Legacy equivalent of frame-ancestors for older browsers.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these browser features, so deny them outright.
  { key: "Permissions-Policy", value: "geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HTTPS only in production (it would pin localhost to HTTPS in dev).
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false, // don't advertise the framework
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/product-images/**",
      },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
