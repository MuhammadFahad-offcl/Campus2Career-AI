-- ================================================================
-- Campus2Career AI — Resumes Table & Storage Setup
-- ================================================================
--
-- Run this migration in your Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → paste this → Run
--
-- Creates:
--   1. extraction_status enum type
--   2. resumes table with RLS policies
--   3. Indexes for common queries
--   4. Storage bucket "resumes" with user-scoped policies
-- ================================================================

-- ────────────────────────────────────────────────
-- 1. Extraction Status Enum
-- ────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'extraction_status') THEN
    CREATE TYPE extraction_status AS ENUM (
      'uploaded',
      'processing',
      'completed',
      'failed'
    );
  END IF;
END
$$;

-- ────────────────────────────────────────────────
-- 2. Resumes Table
-- ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS resumes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  file_type        TEXT NOT NULL,
  file_size        INTEGER NOT NULL,
  storage_path     TEXT NOT NULL,
  extracted_text   TEXT,
  extraction_status extraction_status NOT NULL DEFAULT 'uploaded',
  extraction_error TEXT,
  page_count       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ────────────────────────────────────────────────
-- 3. Indexes
-- ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_resumes_user_id
  ON resumes(user_id);

CREATE INDEX IF NOT EXISTS idx_resumes_user_status
  ON resumes(user_id, extraction_status);

CREATE INDEX IF NOT EXISTS idx_resumes_created_at
  ON resumes(created_at DESC);

-- ────────────────────────────────────────────────
-- 4. Row-Level Security
-- ────────────────────────────────────────────────

ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- Users can insert their own resumes
CREATE POLICY "Users can upload their own resumes"
  ON resumes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own resumes
CREATE POLICY "Users can view their own resumes"
  ON resumes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update their own resumes
CREATE POLICY "Users can update their own resumes"
  ON resumes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can delete their own resumes
CREATE POLICY "Users can delete their own resumes"
  ON resumes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 5. Updated_at Trigger
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_resumes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_resumes_updated_at ON resumes;
CREATE TRIGGER trigger_resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW
  EXECUTE FUNCTION update_resumes_updated_at();

-- ────────────────────────────────────────────────
-- 6. Storage Bucket: "resumes"
-- ────────────────────────────────────────────────

-- Create the storage bucket (private by default)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Users can upload files to their own folder
CREATE POLICY "Users can upload resume files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can view files in their own folder
CREATE POLICY "Users can view their own resume files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete files in their own folder
CREATE POLICY "Users can delete their own resume files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
