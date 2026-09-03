-- ================================================================
-- Campus2Career AI — Rewrites Table
-- ================================================================
-- Stores job-specific resume rewrite suggestions.
-- Each rewrite references a resume, job target, and analysis.
--
-- Supports both authenticated users and anonymous MVP sessions,
-- following the same ownership pattern as resumes, job_targets,
-- and analyses.
--
-- Anonymous writes/updates are performed only through trusted server
-- actions using the server-side Supabase service role key.
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Rewrite Status Enum
-- ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rewrite_status') THEN
    CREATE TYPE rewrite_status AS ENUM (
      'pending',
      'completed',
      'failed'
    );
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 2. Rewrites Table
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rewrites (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id              UUID NOT NULL,
  job_target_id          UUID NOT NULL,
  analysis_id            UUID,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_session_id   TEXT,
  status                 rewrite_status NOT NULL DEFAULT 'pending',
  suggestions            JSONB NOT NULL DEFAULT '[]'::jsonb,
  model                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT rewrites_owner_required
    CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL)
);

-- ────────────────────────────────────────────────
-- 3. Indexes
-- ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rewrites_user_id
  ON rewrites(user_id);

CREATE INDEX IF NOT EXISTS idx_rewrites_anonymous_session_id
  ON rewrites(anonymous_session_id);

CREATE INDEX IF NOT EXISTS idx_rewrites_resume_id
  ON rewrites(resume_id);

CREATE INDEX IF NOT EXISTS idx_rewrites_job_target_id
  ON rewrites(job_target_id);

CREATE INDEX IF NOT EXISTS idx_rewrites_created_at
  ON rewrites(created_at DESC);

-- ────────────────────────────────────────────────
-- 4. Row-Level Security
-- ────────────────────────────────────────────────

ALTER TABLE rewrites ENABLE ROW LEVEL SECURITY;

-- Users can insert their own rewrites
CREATE POLICY "Users can insert their own rewrites"
  ON rewrites FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own rewrites
CREATE POLICY "Users can view their own rewrites"
  ON rewrites FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own rewrites
CREATE POLICY "Users can update their own rewrites"
  ON rewrites FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own rewrites
CREATE POLICY "Users can delete their own rewrites"
  ON rewrites FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 5. Updated_at Trigger
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_rewrites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rewrites_updated_at ON rewrites;
CREATE TRIGGER trigger_rewrites_updated_at
  BEFORE UPDATE ON rewrites
  FOR EACH ROW
  EXECUTE FUNCTION update_rewrites_updated_at();

-- Authenticated-user RLS policies remain intact.
-- Anonymous MVP access uses the server-only service role client
-- with explicit owner filters (no public anon-role RLS).
