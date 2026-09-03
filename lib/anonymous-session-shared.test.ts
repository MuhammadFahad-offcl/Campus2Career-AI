import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_SESSION_COOKIE,
  ANONYMOUS_SESSION_MAX_AGE_SECONDS,
  buildAnonymousSessionCookieOptions,
  isValidAnonymousSessionId,
} from "./anonymous-session-shared";

describe("anonymous-session-shared (DAY 3C BUG 2 regression)", () => {
  describe("isValidAnonymousSessionId", () => {
    it("accepts a canonical v4 UUID", () => {
      expect(isValidAnonymousSessionId("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d")).toBe(true);
    });

    it("accepts uppercase UUIDs", () => {
      expect(isValidAnonymousSessionId("A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D")).toBe(true);
    });

    it("rejects non-UUID strings", () => {
      expect(isValidAnonymousSessionId("garbage")).toBe(false);
      expect(isValidAnonymousSessionId("not-a-session")).toBe(false);
      expect(isValidAnonymousSessionId("x".repeat(64))).toBe(false);
    });

    it("rejects empty and missing values", () => {
      expect(isValidAnonymousSessionId("")).toBe(false);
      expect(isValidAnonymousSessionId(undefined)).toBe(false);
    });

    it("rejects UUID-shaped strings with wrong version or variant markers", () => {
      // Version nibble 6 is outside the allowed [1-5] range.
      expect(isValidAnonymousSessionId("a1b2c3d4-e5f6-6a7b-8c9d-0e1f2a3b4c5d")).toBe(false);
      // Variant nibble c is outside the allowed [89ab] range.
      expect(isValidAnonymousSessionId("a1b2c3d4-e5f6-4a7b-cc9d-0e1f2a3b4c5d")).toBe(false);
    });
  });

  describe("buildAnonymousSessionCookieOptions", () => {
    it("locks the anonymous session cookie name and attributes", () => {
      expect(ANONYMOUS_SESSION_COOKIE).toBe("s2c_anon_session");
      expect(ANONYMOUS_SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24);
      expect(buildAnonymousSessionCookieOptions()).toEqual({
        httpOnly: true,
        sameSite: "lax",
        secure: false, // NODE_ENV=test — secure is production-only
        path: "/",
        maxAge: ANONYMOUS_SESSION_MAX_AGE_SECONDS,
      });
    });
  });
});
