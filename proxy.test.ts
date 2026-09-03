/**
 * DAY 3C BUG 2 regression tests — anonymous session minting in the proxy.
 *
 * Fresh visitors used to land on SESSION_NOT_FOUND error screens because
 * only the upload action created the `s2c_anon_session` cookie. The proxy
 * now lazily mints it, while keeping valid existing sessions untouched.
 *
 * `@supabase/ssr` is mocked so no network calls are made; the mock can
 * simulate Supabase writing cookies during its session refresh.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Control channel for the Supabase mock: cookies the fake session refresh
// writes through `setAll` while `getUser()` runs.
const supabaseMock = vi.hoisted(() => ({
  refreshCookies: [] as Array<{ name: string; value: string }>,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      _url: string,
      _key: string,
      options: {
        cookies: {
          setAll: (
            cookies: Array<{
              name: string;
              value: string;
              options?: Record<string, unknown>;
            }>
          ) => void;
        };
      }
    ) => ({
      auth: {
        getUser: async () => {
          for (const cookie of supabaseMock.refreshCookies) {
            options.cookies.setAll([
              { name: cookie.name, value: cookie.value, options: { path: "/" } },
            ]);
          }
          return { data: { user: null } };
        },
      },
    })
  ),
}));

import { proxy } from "@/proxy";
import {
  ANONYMOUS_SESSION_COOKIE,
  ANONYMOUS_SESSION_MAX_AGE_SECONDS,
  isValidAnonymousSessionId,
} from "@/lib/anonymous-session-shared";

const TEST_UUID = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

beforeEach(() => {
  supabaseMock.refreshCookies = [];
});

describe("proxy — anonymous MVP session minting (DAY 3C BUG 2)", () => {
  it("mints an anonymous session cookie for fresh visitors", async () => {
    const request = new NextRequest("http://localhost:3000/skill-bridge");
    const response = await proxy(request);

    const cookie = response.cookies.get(ANONYMOUS_SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(isValidAnonymousSessionId(cookie?.value)).toBe(true);

    // Hardened cookie attributes.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(ANONYMOUS_SESSION_MAX_AGE_SECONDS);

    // The minted session must also be visible to the server components
    // handling this very request (forwarded cookie header + request).
    expect(request.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value).toBe(cookie?.value);
    expect(
      response.headers.get("x-middleware-request-cookie")
    ).toContain(ANONYMOUS_SESSION_COOKIE);
  });

  it("does not re-mint when a valid session cookie already exists", async () => {
    const request = new NextRequest("http://localhost:3000/dashboard", {
      headers: { cookie: `${ANONYMOUS_SESSION_COOKIE}=${TEST_UUID}` },
    });
    const response = await proxy(request);

    // The existing session is preserved exactly — no Set-Cookie emitted.
    expect(request.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value).toBe(TEST_UUID);
    expect(response.cookies.get(ANONYMOUS_SESSION_COOKIE)).toBeUndefined();
  });

  it("replaces an invalid session cookie value with a fresh session id", async () => {
    const request = new NextRequest("http://localhost:3000/skill-bridge", {
      headers: { cookie: `${ANONYMOUS_SESSION_COOKIE}=garbage` },
    });
    const response = await proxy(request);

    const cookie = response.cookies.get(ANONYMOUS_SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(isValidAnonymousSessionId(cookie?.value)).toBe(true);
    expect(cookie?.value).not.toBe("garbage");
    expect(request.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value).toBe(cookie?.value);
  });

  it("keeps Supabase cookies written during the session refresh when minting", async () => {
    supabaseMock.refreshCookies = [{ name: "sb-refresh-token", value: "abc123" }];

    const request = new NextRequest("http://localhost:3000/dashboard");
    const response = await proxy(request);

    // The Supabase refresh cookie survived the response rebuild…
    expect(response.cookies.get("sb-refresh-token")?.value).toBe("abc123");
    // …and the anonymous session was still minted alongside it.
    const anonCookie = response.cookies.get(ANONYMOUS_SESSION_COOKIE);
    expect(isValidAnonymousSessionId(anonCookie?.value)).toBe(true);
  });

  it("leaves the request untouched when a valid session exists and Supabase refreshes cookies", async () => {
    supabaseMock.refreshCookies = [{ name: "sb-access-token", value: "xyz789" }];

    const request = new NextRequest("http://localhost:3000/resume", {
      headers: { cookie: `${ANONYMOUS_SESSION_COOKIE}=${TEST_UUID}` },
    });
    const response = await proxy(request);

    expect(request.cookies.get(ANONYMOUS_SESSION_COOKIE)?.value).toBe(TEST_UUID);
    expect(response.cookies.get("sb-access-token")?.value).toBe("xyz789");
    expect(response.cookies.get(ANONYMOUS_SESSION_COOKIE)).toBeUndefined();
  });
});
