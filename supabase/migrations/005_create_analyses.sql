-- ================================================================
-- Campus2Career AI — Analyses Table
-- ================================================================
-- Stores match analysis results: CandidateProfile + JobTarget → Analysis
--
-- Supports both authenticated users and anonymous MVP sessions,
-- following the same ownership pattern as resumes and job_targets.
--
-- Anonymous writes/updates are performed only through trusted server
-- actions using the server-side Supabase service role key.
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Analyses Table
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analyses (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id              UUID NOT NULL,
  job_target_id          UUID,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_session_id   TEXT,
  profile                JSONB NOT NULL,
  score                  JSONB,
  skill_gaps             JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths              JSONB NOT NULL DEFAULT '[]'::jsonb,
  weaknesses             JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations        JSONB NOT NULL DEFAULT '[]'::jsonb,
  analyzed_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT analyses_owner_required
    CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL)
);

-- ────────────────────────────────────────────────
-- 2. Indexes
-- ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_analyses_user_id
  ON analyses(user_id);

CREATE INDEX IF NOT EXISTS idx_analyses_anonymous_session_id
  ON analyses(anonymous_session_id);

CREATE INDEX IF NOT EXISTS idx_analyses_resume_id
  ON analyses(resume_id);

CREATE INDEX IF NOT EXISTS idx_analyses_job_target_id
  ON analyses(job_target_id);

CREATE INDEX IF NOT EXISTS idx_analyses_analyzed_at
  ON analyses(analyzed_at DESC);

-- ────────────────────────────────────────────────
-- 3. Row-Level Security
-- ────────────────────────────────────────────────

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Users can insert their own analyses
CREATE POLICY "Users can insert their own analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own analyses
CREATE POLICY "Users can view their own analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own analyses
CREATE POLICY "Users can delete their own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Authenticated-user RLS policies remain intact.
-- Anonymous MVP access uses the server-only service role client
-- with explicit owner filters (no public anon-role RLS).
