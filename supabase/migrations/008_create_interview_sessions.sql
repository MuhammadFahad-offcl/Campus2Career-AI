-- ================================================================
-- Campus2Career AI — Interview Sessions Table (Mock Interviewer)
-- ================================================================
-- Stores AI mock interview sessions — the "Practice" stage of the
-- product flow (Understand → Compare → Improve → Build → Apply →
-- Practice). Each session is generated from an existing match
-- analysis (CandidateProfile + JobTarget + skill gaps), following
-- the same integration pattern as skill_bridges.
--
-- Unlike skill_bridges (one active plan per analysis), a candidate
-- may practice the same analysis multiple times, so analysis_id is
-- NOT unique here — sessions are inserted, not upserted, mirroring
-- the analyses/rewrites history pattern. "Last Interview" on the
-- dashboard reads the most recent completed row.
--
-- The full question/answer/evaluation transcript is stored as a
-- single JSONB array (`questions`), following the same
-- JSONB-per-entity convention as skill_bridges.days and
-- rewrites.suggestions rather than separate child tables — this
-- keeps ownership/RLS/transaction semantics identical to the rest
-- of the schema and avoids a join for a value that is always read
-- and written as one unit.
--
-- Supports both authenticated users and anonymous MVP sessions,
-- following the same ownership pattern as every other core table.
-- Anonymous writes/updates are performed only through trusted
-- server actions using the server-side Supabase service role key.
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_type') THEN
    CREATE TYPE interview_type AS ENUM (
      'technical',
      'behavioral',
      'hr',
      'mixed'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_difficulty') THEN
    CREATE TYPE interview_difficulty AS ENUM (
      'beginner',
      'intermediate',
      'advanced'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interview_session_status') THEN
    CREATE TYPE interview_session_status AS ENUM (
      'in_progress',
      'completed',
      'abandoned'
    );
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 2. Interview Sessions Table
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS interview_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id              UUID NOT NULL,
  job_target_id          UUID NOT NULL,
  analysis_id            UUID NOT NULL,
  user_id                UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_session_id   TEXT,
  interview_type         interview_type NOT NULL DEFAULT 'mixed',
  difficulty             interview_difficulty NOT NULL DEFAULT 'intermediate',
  question_count         SMALLINT NOT NULL DEFAULT 5,
  status                 interview_session_status NOT NULL DEFAULT 'in_progress',
  focus_areas            JSONB NOT NULL DEFAULT '[]'::jsonb,
  questions              JSONB NOT NULL DEFAULT '[]'::jsonb,
  overall_score          SMALLINT,
  score_breakdown        JSONB,
  strengths              JSONB NOT NULL DEFAULT '[]'::jsonb,
  improvements           JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_practice   JSONB NOT NULL DEFAULT '[]'::jsonb,
  related_skill_gaps     JSONB NOT NULL DEFAULT '[]'::jsonb,
  model                  TEXT,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT interview_sessions_owner_required
    CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL),

  CONSTRAINT interview_sessions_question_count_valid
    CHECK (question_count IN (5, 10, 15)),

  CONSTRAINT interview_sessions_overall_score_range
    CHECK (overall_score IS NULL OR (overall_score >= 0 AND overall_score <= 100))
);

-- ────────────────────────────────────────────────
-- 3. Indexes
-- ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user_id
  ON interview_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_anonymous_session_id
  ON interview_sessions(anonymous_session_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_resume_id
  ON interview_sessions(resume_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_job_target_id
  ON interview_sessions(job_target_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_analysis_id
  ON interview_sessions(analysis_id);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_created_at
  ON interview_sessions(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_status
  ON interview_sessions(status);

-- ────────────────────────────────────────────────
-- 4. Row-Level Security
-- ────────────────────────────────────────────────

ALTER TABLE interview_sessions ENABLE ROW LEVEL SECURITY;

-- Users can insert their own interview sessions
CREATE POLICY "Users can insert their own interview sessions"
  ON interview_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own interview sessions
CREATE POLICY "Users can view their own interview sessions"
  ON interview_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own interview sessions (submitting answers,
-- abandoning a session)
CREATE POLICY "Users can update their own interview sessions"
  ON interview_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own interview sessions
CREATE POLICY "Users can delete their own interview sessions"
  ON interview_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 5. Updated_at Trigger
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_interview_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_interview_sessions_updated_at ON interview_sessions;
CREATE TRIGGER trigger_interview_sessions_updated_at
  BEFORE UPDATE ON interview_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_interview_sessions_updated_at();

-- Authenticated-user RLS policies remain intact.
-- Anonymous MVP access uses the server-only service role client
-- with explicit owner filters (no public anon-role RLS), exactly
-- like resumes, job_targets, analyses, rewrites, and skill_bridges.
--
-- No FK constraints on resume_id / job_target_id / analysis_id, for
-- the same accepted-risk reasons documented for analyses/rewrites/
-- skill_bridges (DAY 3C audit): rows are only written by trusted
-- server actions that source these IDs from freshly fetched,
-- owner-filtered rows, and the MVP has no delete flows to test
-- cascade semantics against.
