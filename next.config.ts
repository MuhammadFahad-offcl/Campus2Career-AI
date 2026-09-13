import type { NextConfig } from "next";

/**
 * Security response headers, applied to every route.
 *
 * These are defense-in-depth for the browser side of the app — they don't
 * replace the real access control (Supabase RLS + owner-filtered Server
 * Actions), but they close off classes of attack that authorization alone
 * doesn't touch: clickjacking (framing this app inside a malicious site to
 * trick a user into clicking something), MIME-sniffing, referrer leakage,
 * and unwanted access to device APIs.
 *
 * The Content-Security-Policy here is deliberately conservative rather than
 * a strict nonce-based policy: `script-src`/`style-src` allow
 * 'unsafe-inline' because Next.js's App Router injects small inline
 * hydration/RSC payload scripts, and getting a nonce-based CSP right
 * requires wiring a per-request nonce through proxy.ts and every layout —
 * a bigger, higher-risk change that's worth doing deliberately with a real
 * browser to test against, not blind. Even with 'unsafe-inline' on scripts,
 * this policy still blocks loading executable code from any other origin,
 * blocks the app from ever being framed, blocks <object>/<embed> plugins,
 * and pins form submissions and the <base> tag to this origin.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Belt-and-suspenders against clickjacking alongside frame-ancestors above —
  // some older browsers only honor X-Frame-Options.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops the browser from guessing ("sniffing") a different content type
  // than what the server declared — closes a class of MIME-confusion XSS.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full referrer only to our own origin; cross-origin requests
  // (e.g. clicking an external link) only leak the origin, not the path.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app never needs camera/mic/location/payment access — say so
  // explicitly so an embedded frame or injected script can't request it.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()",
  },
  // Force HTTPS for a year, including subdomains, once served over HTTPS.
  // Harmless in local dev (the browser only applies it to HTTPS origins).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  /* Keep pdfjs-dist as a Node.js external on the server.
   * This prevents Next.js from bundling it (which would try to resolve
   * browser-only APIs like DOMMatrix) and forces Node's native require
   * to load the CJS-compatible build.
   *
   * We use pdfjs-dist directly instead of pdf-parse to avoid pulling in
   * @napi-rs/canvas which fails in serverless environments. */
  serverExternalPackages: ["pdfjs-dist"],
  experimental: {
    /* Allow larger file uploads (up to 10 MB for headroom above the 5 MB resume limit) */
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
