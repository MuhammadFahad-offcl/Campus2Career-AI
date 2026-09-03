-- ================================================================
-- Campus2Career AI — Skill Bridges Table
-- ================================================================
-- Stores 7-day skill bridge plans generated from match analyses.
-- Each plan references a resume, job target, and analysis, and
-- focuses on the candidate's top 1-3 highest-impact skill gaps.
--
-- One active plan per analysis (UNIQUE analysis_id) — regeneration
-- replaces the existing plan via upsert instead of duplicating rows.
--
-- Supports both authenticated users and anonymous MVP sessions,
-- following the same ownership pattern as resumes, job_targets,
-- analyses, and rewrites.
--
-- Anonymous writes/updates are performed only through trusted server
-- actions using the server-side Supabase service role key.
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Skill Bridge Status Enum
-- ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_bridge_status') THEN
    CREATE TYPE skill_bridge_status AS ENUM (
      'pending',
      'completed',
      'failed'
    );
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 2. Skill Bridges Table
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS skill_bridges (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id              UUID NOT NULL,
  job_target_id          UUID NOT NULL,
  analysis_id            UUID NOT NULL,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_session_id   TEXT,
  status                 skill_bridge_status NOT NULL DEFAULT 'pending',
  priority_skills        JSONB NOT NULL DEFAULT '[]'::jsonb,
  days                   JSONB NOT NULL DEFAULT '[]'::jsonb,
  model                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT skill_bridges_owner_required
    CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL),

  -- One active plan per analysis (reuse + regeneration via upsert)
  CONSTRAINT skill_bridges_analysis_unique
    UNIQUE (analysis_id)
);

-- ────────────────────────────────────────────────
-- 3. Indexes
-- ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_skill_bridges_user_id
  ON skill_bridges(user_id);

CREATE INDEX IF NOT EXISTS idx_skill_bridges_anonymous_session_id
  ON skill_bridges(anonymous_session_id);

CREATE INDEX IF NOT EXISTS idx_skill_bridges_resume_id
  ON skill_bridges(resume_id);

CREATE INDEX IF NOT EXISTS idx_skill_bridges_job_target_id
  ON skill_bridges(job_target_id);

CREATE INDEX IF NOT EXISTS idx_skill_bridges_created_at
  ON skill_bridges(created_at DESC);

-- ────────────────────────────────────────────────
-- 4. Row-Level Security
-- ────────────────────────────────────────────────

ALTER TABLE skill_bridges ENABLE ROW LEVEL SECURITY;

-- Users can insert their own skill bridges
CREATE POLICY "Users can insert their own skill bridges"
  ON skill_bridges FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own skill bridges
CREATE POLICY "Users can view their own skill bridges"
  ON skill_bridges FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own skill bridges
CREATE POLICY "Users can update their own skill bridges"
  ON skill_bridges FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own skill bridges
CREATE POLICY "Users can delete their own skill bridges"
  ON skill_bridges FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 5. Updated_at Trigger
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_skill_bridges_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_skill_bridges_updated_at ON skill_bridges;
CREATE TRIGGER trigger_skill_bridges_updated_at
  BEFORE UPDATE ON skill_bridges
  FOR EACH ROW
  EXECUTE FUNCTION update_skill_bridges_updated_at();

-- Authenticated-user RLS policies remain intact.
-- Anonymous MVP access uses the server-only service role client
-- with explicit owner filters (no public anon-role RLS).
