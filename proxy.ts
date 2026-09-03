/**
 * Next.js proxy (Next.js 16 rename of `middleware`).
 *
 * Responsibilities:
 * 1. Refresh the Supabase auth session so that Server Components always
 *    have access to a valid auth session.
 * 2. Lazily mint the anonymous MVP session cookie (`s2c_anon_session`) for
 *    fresh visitors, so direct visits to any page render proper idle/empty
 *    states instead of SESSION_NOT_FOUND errors.
 *
 * Security note: this file only ISSUES the anonymous identity. Ownership
 * enforcement (per-session row filtering) stays inside the server actions.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ANONYMOUS_SESSION_COOKIE,
  buildAnonymousSessionCookieOptions,
  isValidAnonymousSessionId,
} from "@/lib/anonymous-session-shared";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — do NOT rely on `getUser()` for security.
  // This just ensures cookies are fresh.
  await supabase.auth.getUser();

  // ── Anonymous MVP session (lazy mint) ─────────────────────────
  // Fresh visitors arrive with no `s2c_anon_session` cookie because,
  // historically, only the upload action created one. Mint it here —
  // once per browser — so direct visits to /dashboard, /job-matcher,
  // /resume, /skill-bridge, /analysis, etc. behave like a brand-new
  // (empty) session instead of erroring with SESSION_NOT_FOUND.
  const existingSession = request.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value;
  if (!isValidAnonymousSessionId(existingSession)) {
    const sessionId = crypto.randomUUID();

    // Make the session visible to the server components handling THIS
    // request, then rebuild the forwarded response so the updated cookie
    // header propagates. Any Set-Cookie headers Supabase added during the
    // session refresh are carried over to the rebuilt response.
    request.cookies.set(ANONYMOUS_SESSION_COOKIE, sessionId);
    const carriedCookies = supabaseResponse.cookies.getAll();
    supabaseResponse = NextResponse.next({ request });
    for (const cookie of carriedCookies) {
      supabaseResponse.cookies.set(cookie);
    }
    supabaseResponse.cookies.set(
      ANONYMOUS_SESSION_COOKIE,
      sessionId,
      buildAnonymousSessionCookieOptions()
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public assets (images, svg, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
