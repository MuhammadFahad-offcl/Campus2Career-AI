// Persistent tests for the in-memory rate limiter.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/security/rate-limit";

describe("rate-limit: checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  const config = { maxRequests: 3, windowMs: 1000 };

  it("allows the first N requests within the window", () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit("test", "user-A", config);
      expect(r.allowed).toBe(true);
    }
  });

  it("denies the (N+1)th request", () => {
    // Fresh namespace to avoid cross-test pollution.
    const ns = "test-deny";
    for (let i = 0; i < 3; i++) {
      checkRateLimit(ns, "user-B", config);
    }
    const r = checkRateLimit(ns, "user-B", config);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("isolates buckets per identity", () => {
    const ns = "test-isolated";
    for (let i = 0; i < 3; i++) checkRateLimit(ns, "user-C", config);
    expect(checkRateLimit(ns, "user-C", config).allowed).toBe(false);
    // A different identity still has its own tokens.
    expect(checkRateLimit(ns, "user-D", config).allowed).toBe(true);
  });

  it("isolates buckets per namespace", () => {
    for (let i = 0; i < 3; i++) checkRateLimit("ns1", "user-E", config);
    expect(checkRateLimit("ns1", "user-E", config).allowed).toBe(false);
    // Same identity in a different namespace still has tokens.
    expect(checkRateLimit("ns2", "user-E", config).allowed).toBe(true);
  });

  it("denies requests with empty identity (no silent bypass)", () => {
    const r = checkRateLimit("test", "", config);
    expect(r.allowed).toBe(false);
  });
});
