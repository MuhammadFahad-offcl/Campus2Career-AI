-- ================================================================
-- Campus2Career AI — Production-readiness: rate limiting + error logs
-- ================================================================
-- Two independent, self-contained additions (no third-party service
-- required) that close two P0 gaps found in the production-readiness
-- audit (2026-09-14):
--
--   1. rate_limit_buckets + check_rate_limit(): a Postgres-backed
--      token-bucket rate limiter to replace the in-memory limiter in
--      lib/security/rate-limit.ts, which only works within a single
--      process and is therefore close to meaningless on Vercel's
--      serverless model (every invocation/instance gets its own
--      independent memory). Accessed only through the server-only
--      Supabase admin client — same trust boundary as every other
--      anonymous-capable table in this schema.
--
--   2. error_logs: a minimal, non-PII, operator-only table so a
--      production failure leaves a trace somewhere queryable instead
--      of vanishing into an ephemeral serverless log. This is a DIY
--      substitute for a third-party error tracker (Sentry, etc.) —
--      swap it out later if/when one is wired up; nothing else
--      depends on this table's existence.
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Rate limit buckets
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key   TEXT PRIMARY KEY,
  tokens       DOUBLE PRECISION NOT NULL,
  last_refill  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- bucket_key already is the lookup key (primary key index); no extra
-- index needed for the hot path. A light index on last_refill supports
-- the periodic cleanup sweep (see the cleanup cron route).
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_last_refill
  ON rate_limit_buckets(last_refill);

ALTER TABLE rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: this table is written and read exclusively
-- through the server-only service-role client (lib/supabase/admin.ts),
-- which bypasses RLS. No authenticated- or anon-role policy is needed
-- or wanted — nothing about this table should ever be reachable from
-- the browser.

-- Atomic token-bucket check. Runs as a single function invocation so
-- the SELECT ... FOR UPDATE + UPDATE pair is safe under concurrent
-- calls for the same bucket_key (unlike a bare read-modify-write from
-- application code, which would race across concurrent requests).
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_bucket_key TEXT,
  p_max_requests INTEGER,
  p_window_ms BIGINT
) RETURNS TABLE(allowed BOOLEAN, retry_after_ms BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tokens DOUBLE PRECISION;
  v_last_refill TIMESTAMPTZ;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_elapsed_ms DOUBLE PRECISION;
  v_refill DOUBLE PRECISION;
BEGIN
  -- Create the bucket on first use (no-op if it already exists).
  INSERT INTO rate_limit_buckets (bucket_key, tokens, last_refill)
  VALUES (p_bucket_key, p_max_requests, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  -- Lock this bucket's row for the duration of the function call so
  -- concurrent requests for the same identity+action serialize instead
  -- of both reading stale tokens and both succeeding.
  SELECT tokens, last_refill INTO v_tokens, v_last_refill
  FROM rate_limit_buckets
  WHERE bucket_key = p_bucket_key
  FOR UPDATE;

  v_elapsed_ms := GREATEST(0, EXTRACT(EPOCH FROM (v_now - v_last_refill)) * 1000);
  v_refill := (v_elapsed_ms / p_window_ms) * p_max_requests;
  v_tokens := LEAST(p_max_requests::DOUBLE PRECISION, v_tokens + v_refill);

  IF v_tokens < 1 THEN
    UPDATE rate_limit_buckets
    SET tokens = v_tokens, last_refill = v_now
    WHERE bucket_key = p_bucket_key;

    RETURN QUERY SELECT
      FALSE,
      CEIL(p_window_ms::DOUBLE PRECISION / GREATEST(p_max_requests, 1))::BIGINT;
  ELSE
    UPDATE rate_limit_buckets
    SET tokens = v_tokens - 1, last_refill = v_now
    WHERE bucket_key = p_bucket_key;

    RETURN QUERY SELECT TRUE, 0::BIGINT;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────
-- 2. Error logs (DIY observability, no PII)
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS error_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope        TEXT NOT NULL,
  error_code   TEXT,
  message      TEXT NOT NULL,
  owner_type   TEXT,
  context      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT error_logs_message_not_empty CHECK (length(message) > 0)
);

CREATE INDEX IF NOT EXISTS idx_error_logs_occurred_at
  ON error_logs(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_scope
  ON error_logs(scope);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — operator-only, written and read exclusively
-- through the server-only service-role client. Never write resume
-- content, prompts, credentials, or cookies into `context`; see
-- lib/observability/log-error.ts, which enforces this at the call site.

-- ────────────────────────────────────────────────
-- 3. Retention note
-- ────────────────────────────────────────────────
-- Neither table has an automatic TTL at the database level. Both are
-- pruned by the scheduled cleanup route
-- (app/api/cron/cleanup/route.ts): stale rate_limit_buckets rows
-- (untouched for 24h+) and error_logs rows older than 30 days are
-- deleted there on a cron schedule, alongside anonymous upload
-- cleanup. If that cron job is ever disabled, both tables will grow
-- unbounded.
