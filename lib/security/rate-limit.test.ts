// Tests for the rate limiter's in-memory fallback path.
//
// The test environment has no real Supabase project configured, so
// every call here naturally exercises the fallback branch in
// checkRateLimit (the Postgres RPC call throws on the placeholder
// config, which is caught and degraded to the in-memory limiter) —
// this is a real production code path (see rate-limit.ts), not a test
// double, so these assertions describe actual fallback behavior.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "@/lib/security/rate-limit";

describe("rate-limit: checkRateLimit (in-memory fallback path)", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  const config = { maxRequests: 3, windowMs: 1000 };

  it("allows the first N requests within the window", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await checkRateLimit("test", "user-A", config);
      expect(r.allowed).toBe(true);
    }
  });

  it("denies the (N+1)th request", async () => {
    // Fresh namespace to avoid cross-test pollution.
    const ns = "test-deny";
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(ns, "user-B", config);
    }
    const r = await checkRateLimit(ns, "user-B", config);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("isolates buckets per identity", async () => {
    const ns = "test-isolated";
    for (let i = 0; i < 3; i++) await checkRateLimit(ns, "user-C", config);
    expect((await checkRateLimit(ns, "user-C", config)).allowed).toBe(false);
    // A different identity still has its own tokens.
    expect((await checkRateLimit(ns, "user-D", config)).allowed).toBe(true);
  });

  it("isolates buckets per namespace", async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit("ns1", "user-E", config);
    expect((await checkRateLimit("ns1", "user-E", config)).allowed).toBe(false);
    // Same identity in a different namespace still has tokens.
    expect((await checkRateLimit("ns2", "user-E", config)).allowed).toBe(true);
  });

  it("denies requests with empty identity (no silent bypass)", async () => {
    const r = await checkRateLimit("test", "", config);
    expect(r.allowed).toBe(false);
  });
});
