/**
 * Pure anonymous-session primitives shared across runtimes.
 *
 * This module must stay free of server-only imports (e.g. `next/headers`)
 * so it can be used from both the proxy (`proxy.ts`, request-level cookie
 * minting) and server actions (`lib/anonymous-session.ts`). Keep it
 * dependency-free and side-effect-free.
 */

export const ANONYMOUS_SESSION_COOKIE = "s2c_anon_session";

/** One day, matching the MVP demo scope of the anonymous session. */
export const ANONYMOUS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24;

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidAnonymousSessionId(
  value: string | undefined
): value is string {
  return Boolean(value && SESSION_ID_PATTERN.test(value));
}

/**
 * Cookie attributes for the anonymous session.
 *
 * Both writers of the cookie — the proxy (mint on first request) and
 * `getOrCreateAnonymousSessionId` (upload flow fallback) — use this so
 * their attributes can never drift apart.
 */
export function buildAnonymousSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ANONYMOUS_SESSION_MAX_AGE_SECONDS,
  } as const;
}
