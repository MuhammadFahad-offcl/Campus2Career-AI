/**
 * Rate limiter for Next.js Server Actions.
 *
 * Protects expensive operations (OpenAI calls, Supabase writes) from
 * per-identity abuse.
 *
 * ── Production fix (2026-09-14 production-readiness audit) ──────────
 * The original implementation kept buckets in process memory, which is
 * close to meaningless on Vercel's serverless model: every invocation
 * (and every instance) gets its own independent memory, so N instances
 * effectively multiply the configured limit by N, and every cold start
 * resets it to zero. The primary path now calls a Postgres function
 * (`check_rate_limit`, migration 009) through the server-only admin
 * client, so the bucket is shared and atomic across every instance.
 *
 * If the Supabase call itself fails (misconfigured environment, a
 * transient outage), this falls back to the original in-memory bucket
 * rather than to "always allow" — degraded but still real protection
 * within that one instance, and the product never goes down over a
 * rate-limiter hiccup. The fallback is also what makes local
 * development and the unit tests below work without any Supabase
 * connection at all.
 *
 * NEVER logs credentials. Identifiers are opaque bucket keys (session
 * id / user id), never raw credentials.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/observability/log-error";

interface RateLimitConfig {
  /** Max requests allowed within `windowMs`. */
  maxRequests: number;
  /** Sliding window size in milliseconds. */
  windowMs: number;
}

type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterMs: number };

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000,
};

/**
 * Check whether an identity may perform an action within the configured
 * rate limit. Tries the shared Postgres-backed limiter first; falls back
 * to a single-instance in-memory limiter if that call fails for any
 * reason.
 *
 * @param namespace - Distinct bucket namespace per action (e.g. "upload", "analyze").
 * @param identity  - Opaque caller identifier (session id, user id, or IP hash).
 *                    Must never contain raw credentials.
 */
export async function checkRateLimit(
  namespace: string,
  identity: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  if (!identity) {
    // Unknown identity — deny by default to avoid silent bypass.
    return { allowed: false, retryAfterMs: config.windowMs };
  }

  const bucketKey = `${namespace}:${identity}`;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_bucket_key: bucketKey,
      p_max_requests: config.maxRequests,
      p_window_ms: config.windowMs,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("check_rate_limit returned no row");

    if (row.allowed) return { allowed: true };
    return {
      allowed: false,
      retryAfterMs: Number(row.retry_after_ms) || config.windowMs,
    };
  } catch (err) {
    // Degrade to the in-memory limiter rather than fail open entirely.
    // Logged (best-effort) so a persistent Supabase problem is visible
    // instead of silently degrading rate-limit quality forever.
    void logServerError("rate-limit", err, {
      context: { namespace, degradedMode: "in-memory-fallback" },
    });
    return checkRateLimitInMemory(bucketKey, config);
  }
}

// ────────────────────────────────────────────────
// In-memory fallback (single instance only)
// ────────────────────────────────────────────────

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

let cleanupScheduled = false;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const STALE_BUCKET_MS = 60 * 60 * 1000;

function scheduleCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > STALE_BUCKET_MS) {
        buckets.delete(key);
      }
    }
  }, CLEANUP_INTERVAL_MS).unref?.();
}

function checkRateLimitInMemory(
  bucketKey: string,
  config: RateLimitConfig
): RateLimitResult {
  scheduleCleanup();

  const now = Date.now();
  const bucket = buckets.get(bucketKey) ?? {
    tokens: config.maxRequests,
    lastRefill: now,
  };

  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / config.windowMs) * config.maxRequests;
  bucket.tokens = Math.min(config.maxRequests, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(bucketKey, bucket);
    const retryAfterMs = Math.ceil(config.windowMs / config.maxRequests);
    return { allowed: false, retryAfterMs };
  }

  bucket.tokens -= 1;
  buckets.set(bucketKey, bucket);
  return { allowed: true };
}

/**
 * Pre-configured limits for the Campus2Career server actions.
 * Centralizing these makes it easy to tune cost/abuse controls.
 */
export const RATE_LIMITS = {
  upload: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  analyze: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  analyzeJob: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  computeMatch: { maxRequests: 5, windowMs: 60_000 } as RateLimitConfig,
  rewrite: { maxRequests: 3, windowMs: 60_000 } as RateLimitConfig,
  skillBridge: { maxRequests: 3, windowMs: 60_000 } as RateLimitConfig,
  mockInterviewStart: { maxRequests: 3, windowMs: 60_000 } as RateLimitConfig,
  mockInterviewTurn: { maxRequests: 20, windowMs: 60_000 } as RateLimitConfig,
} as const;
