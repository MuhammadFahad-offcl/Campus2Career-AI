-- ================================================================
-- Campus2Career AI — Anonymous MVP Resume Sessions
-- ================================================================
-- Enables frictionless anonymous-first resume analysis while preserving
-- authenticated ownership for the future SaaS flow.
--
-- Anonymous writes/updates are performed only through trusted server actions
-- using the server-side Supabase service role key. No public database writes
-- are opened by this migration.
-- ================================================================

ALTER TABLE resumes
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS anonymous_session_id TEXT;

ALTER TABLE resumes
  DROP CONSTRAINT IF EXISTS resumes_owner_required;

ALTER TABLE resumes
  ADD CONSTRAINT resumes_owner_required
  CHECK (user_id IS NOT NULL OR anonymous_session_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_resumes_anonymous_session_id
  ON resumes(anonymous_session_id);

CREATE INDEX IF NOT EXISTS idx_resumes_anonymous_analysis_status
  ON resumes(anonymous_session_id, analysis_status);

-- Authenticated-user RLS policies from 001 remain intact.
-- Anonymous MVP access intentionally does NOT use public anon-role RLS.
-- Instead, trusted server actions validate the HttpOnly anonymous-session cookie
-- and use the server-only service role client with explicit owner filters.
