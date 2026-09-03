import { cookies } from "next/headers";
import {
  ANONYMOUS_SESSION_COOKIE,
  buildAnonymousSessionCookieOptions,
  isValidAnonymousSessionId,
} from "@/lib/anonymous-session-shared";

export {
  ANONYMOUS_SESSION_COOKIE,
  isValidAnonymousSessionId,
} from "@/lib/anonymous-session-shared";

/**
 * Read the current anonymous session id without creating a new one.
 * Use this for ownership checks on reads/analysis.
 */
export async function getAnonymousSessionId(): Promise<string | null> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value;

  return isValidAnonymousSessionId(existing) ? existing : null;
}

/**
 * Get or create an anonymous MVP session id.
 *
 * The cookie is HttpOnly so client JavaScript cannot exfiltrate it. It is
 * intentionally temporary and scoped to this product demo flow.
 */
export async function getOrCreateAnonymousSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(ANONYMOUS_SESSION_COOKIE)?.value;

  if (isValidAnonymousSessionId(existing)) return existing;

  const sessionId = crypto.randomUUID();

  cookieStore.set(
    ANONYMOUS_SESSION_COOKIE,
    sessionId,
    buildAnonymousSessionCookieOptions()
  );

  return sessionId;
}
