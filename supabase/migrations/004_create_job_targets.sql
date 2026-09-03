-- ================================================================
-- Campus2Career AI — Job Targets Table
-- ================================================================
-- Creates the job_targets table for storing structured job descriptions.
-- Supports both authenticated users and anonymous MVP sessions,
-- following the same ownership pattern as the resumes table.
--
-- Anonymous writes/updates are performed only through trusted server actions
-- using the server-side Supabase service role key. No public database writes
-- are opened by this migration.
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Opportunity Type Enum
-- ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'opportunity_type') THEN
    CREATE TYPE opportunity_type AS ENUM (
      'internship',
      'full-time',
      'part-time',
      'unknown'
    );
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 2. Parsing Status Enum
-- ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_parsing_status') THEN
    CREATE TYPE job_parsing_status AS ENUM (
      'pending',
      'completed',
      'failed'
    );
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 3. Job Targets Table
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_targets (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  anonymous_session_id     TEXT,
  title                    TEXT NOT NULL DEFAULT '',
  company                  TEXT NOT NULL DEFAULT '',
  location                 TEXT NOT NULL DEFAULT '',
  source                   TEXT,
  description              TEXT NOT NULL,
  opportunity_type         opportunity_type NOT NULL DEFAULT 'unknown',
  required_skills          JSONB NOT NULL DEFAULT '[]'::jsonb,
  preferred_skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_technologies    JSONB NOT NULL DEFAULT '[]'::jsonb,
  responsibilities         JSONB NOT NULL DEFAULT '[]'::jsonb,
  experience_requirements  JSONB NOT NULL DEFAULT '[]'::jsonb,
  education_requirements   JSONB NOT NULL DEFAULT '[]'::jsonb,
  soft_skills              JSONB NOT NULL DEFAULT '[]'::jsonb,
  domain_requirements      JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_requirements   JSONB NOT NULL DEFAULT '[]'::jsonb,
  parsing_status           job_parsing_status NOT NULL DEFAULT 'pending',
  parsing_model            TEXT,
  parsing_error            TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT job_targets_owner_required
    CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL)
);

-- ────────────────────────────────────────────────
-- 4. Indexes
-- ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_job_targets_user_id
  ON job_targets(user_id);

CREATE INDEX IF NOT EXISTS idx_job_targets_anonymous_session_id
  ON job_targets(anonymous_session_id);

CREATE INDEX IF NOT EXISTS idx_job_targets_parsing_status
  ON job_targets(parsing_status);

CREATE INDEX IF NOT EXISTS idx_job_targets_created_at
  ON job_targets(created_at DESC);

-- ────────────────────────────────────────────────
-- 5. Row-Level Security
-- ────────────────────────────────────────────────

ALTER TABLE job_targets ENABLE ROW LEVEL SECURITY;

-- Users can insert their own job targets
CREATE POLICY "Users can insert their own job targets"
  ON job_targets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own job targets
CREATE POLICY "Users can view their own job targets"
  ON job_targets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own job targets
CREATE POLICY "Users can update their own job targets"
  ON job_targets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own job targets
CREATE POLICY "Users can delete their own job targets"
  ON job_targets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 6. Updated_at Trigger
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_job_targets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_targets_updated_at ON job_targets;
CREATE TRIGGER trigger_job_targets_updated_at
  BEFORE UPDATE ON job_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_job_targets_updated_at();

-- Authenticated-user RLS policies remain intact.
-- Anonymous MVP access intentionally does NOT use public anon-role RLS.
-- Instead, trusted server actions validate the HttpOnly anonymous-session cookie
-- and use the server-only service role client with explicit owner filters.
