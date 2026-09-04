"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { analyzeATSScore } from "@/lib/ats";
import { candidateProfileSchema } from "@/schemas";
import type { ATSScoreResult as ATSScoreAnalysis, CandidateProfile } from "@/types";

// ──────────────────────────────────────────────
// Result types
// ──────────────────────────────────────────────

export type ATSActionErrorCode =
  | "SESSION_NOT_FOUND"
  | "NOT_FOUND"
  | "MISSING_EXTRACTED_TEXT"
  | "UNKNOWN";

export interface ATSActionSuccess {
  status: "success";
  resumeId: string;
  result: ATSScoreAnalysis;
  analyzedAt: string;
  profileUsed: boolean;
}

export interface ATSActionFailure {
  status: "error";
  code: ATSActionErrorCode;
  error: string;
}

export type ATSActionResult = ATSActionSuccess | ATSActionFailure;

function failure(
  code: ATSActionErrorCode,
  message: string
): ATSActionFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Context helpers (same pattern as analyze-resume)
// ──────────────────────────────────────────────

async function getAnalysisContext() {
  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  if (user) {
    return {
      owner: { kind: "authenticated", userId: user.id } satisfies ResumeOwner,
      supabase: authSupabase,
    };
  }

  const anonymousSessionId = await getAnonymousSessionId();
  if (!anonymousSessionId) return null;

  return {
    owner: {
      kind: "anonymous",
      anonymousSessionId,
    } satisfies ResumeOwner,
    supabase: createAdminClient(),
  };
}

function applyOwnerFilter<Query>(query: Query, owner: ResumeOwner): Query {
  const filterable = query as Query & {
    eq(column: string, value: string): Query;
  };

  if (owner.kind === "authenticated") {
    return filterable.eq("user_id", owner.userId);
  }

  return filterable.eq("anonymous_session_id", owner.anonymousSessionId);
}

// ──────────────────────────────────────────────
// Server Action
// ──────────────────────────────────────────────

/**
 * Calculate an ATS compatibility score for an already-uploaded resume.
 *
 * Reuses the extracted text and any existing CandidateProfile —
 * no additional AI call or document re-processing required.
 */
export async function calculateATSScore(
  resumeId: string
): Promise<ATSActionResult> {
  let context: Awaited<ReturnType<typeof getAnalysisContext>>;

  try {
    context = await getAnalysisContext();
  } catch (err) {
    console.error("[calculateATSScore] Context failed:", err);
    return failure(
      "SESSION_NOT_FOUND",
      "Session not found. Please upload your resume again."
    );
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Session not found. Please upload your resume again."
    );
  }

  const { owner, supabase } = context;

  const resumeQuery = supabase
    .from("resumes")
    .select(
      "id,extracted_text,extraction_status,candidate_profile,analysis_status,page_count"
    )
    .eq("id", resumeId);
  const { data: resume, error: fetchError } = await applyOwnerFilter(
    resumeQuery,
    owner
  ).single();

  if (fetchError || !resume) {
    return failure(
      "NOT_FOUND",
      "Resume not found or you do not have access to it."
    );
  }

  if (resume.extraction_status !== "completed" || !resume.extracted_text) {
    return failure(
      "MISSING_EXTRACTED_TEXT",
      "This resume must be uploaded and processed before ATS analysis can run."
    );
  }

  const extractedText = String(resume.extracted_text);
  if (extractedText.trim().length < 50) {
    return failure(
      "MISSING_EXTRACTED_TEXT",
      "This resume does not contain enough extracted text for ATS analysis."
    );
  }

  const pageCount = resume.page_count ?? 1;

  // Parse existing profile if analysis has been completed
  let profile: CandidateProfile | null = null;
  if (resume.analysis_status === "completed" && resume.candidate_profile) {
    try {
      profile = candidateProfileSchema.parse(resume.candidate_profile);
    } catch {
      // Profile parsing failed — proceed with text-only analysis
      profile = null;
    }
  }

  try {
    const result = analyzeATSScore(extractedText, profile, pageCount);

    return {
      status: "success",
      resumeId,
      result,
      analyzedAt: new Date().toISOString(),
      profileUsed: profile !== null,
    };
  } catch (err) {
    console.error("[calculateATSScore] Scoring failed:", err);
    return failure(
      "UNKNOWN",
      "ATS analysis failed. Please try again."
    );
  }
}
