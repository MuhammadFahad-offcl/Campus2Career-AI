-- ================================================================
-- Campus2Career AI — CandidateProfile Persistence
-- ================================================================
-- Adds canonical structured CandidateProfile storage to existing resumes.
-- This does not create duplicate profile tables; one resume version owns one
-- analyzed candidate profile.
-- ================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analysis_status') THEN
    CREATE TYPE analysis_status AS ENUM (
      'not_started',
      'analyzing',
      'completed',
      'failed'
    );
  END IF;
END
$$;

ALTER TABLE resumes
  ADD COLUMN IF NOT EXISTS candidate_profile JSONB,
  ADD COLUMN IF NOT EXISTS analysis_status analysis_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS analysis_error TEXT,
  ADD COLUMN IF NOT EXISTS profile_model TEXT,
  ADD COLUMN IF NOT EXISTS profile_analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_resumes_user_analysis_status
  ON resumes(user_id, analysis_status);

CREATE INDEX IF NOT EXISTS idx_resumes_candidate_profile_gin
  ON resumes USING GIN (candidate_profile);
