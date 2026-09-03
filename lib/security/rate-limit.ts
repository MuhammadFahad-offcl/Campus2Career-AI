/**
 * Lightweight in-memory rate limiter for Next.js Server Actions.
 *
 * Protects expensive operations (OpenAI calls, Supabase writes) from
 * per-identity abuse.
 *
 * ⚠ Known MVP limitation (accepted for the hackathon, DAY 3C audit):
 * - Single-instance only. Buckets live in process memory, so every
 *   server instance / serverless cold start gets its own independent
 *   buckets — with N instances the effective limit is N× the configured
 *   one, and memory resets on every restart or cold start.
 * - No cross-instance coordination (deliberately no Redis for the MVP).
 * - Identity for anonymous callers is the session cookie; rotating the
 *   cookie yields a fresh bucket.
 *
 * Sufficient for a single-instance demo deployment. Replace with a
 * Redis-backed (or Supabase-backed) limiter before any multi-instance
 * production rollout.
 *
 * NEVER logs credentials. Identifiers are hashed into opaque bucket keys.
 */

type Bucket = { tokens: number; lastRefill: number };

interface RateLimitConfig {
  /** Max requests allowed within `windowMs`. */
  maxRequests: number;
  /** Sliding window size in milliseconds. */
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 10,
  windowMs: 60_000,
};

const buckets = new Map<string, Bucket>();

/**
 * Periodic cleanup of stale buckets to prevent unbounded memory growth.
 * Runs once every 5 minutes, evicting entries not touched in the last hour.
 */
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

/**
 * Check whether an identity may perform an action within the configured
 * rate limit. Returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 *
 * @param namespace - Distinct bucket namespace per action (e.g. "upload", "analyze").
 * @param identity  - Opaque caller identifier (session id, user id, or IP hash).
 *                    Must never contain raw credentials.
 */
export function checkRateLimit(
  namespace: string,
  identity: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  if (!identity) {
    // Unknown identity — deny by default to avoid silent bypass.
    return { allowed: false, retryAfterMs: config.windowMs };
  }

  scheduleCleanup();

  const key = `${namespace}:${identity}`;
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: config.maxRequests, lastRefill: now };

  // Refill tokens proportionally to elapsed time.
  const elapsed = now - bucket.lastRefill;
  const refill = (elapsed / config.windowMs) * config.maxRequests;
  bucket.tokens = Math.min(config.maxRequests, bucket.tokens + refill);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    // Approximate wait: enough time for 1 token to refill.
    const retryAfterMs = Math.ceil(config.windowMs / config.maxRequests);
    return { allowed: false, retryAfterMs };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
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
} as const;
