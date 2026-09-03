"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import {
  analyzeResumeText,
  ResumeAnalyzerError,
  shouldReuseCandidateProfile,
} from "@/lib/ai";
import { candidateProfileSchema } from "@/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { CandidateProfile } from "@/types";

export type AnalyzeResumeErrorCode =
  | "SESSION_NOT_FOUND"
  | "NOT_FOUND"
  | "MISSING_EXTRACTED_TEXT"
  | "EMPTY_RESUME"
  | "AI_FAILURE"
  | "INVALID_AI_RESPONSE"
  | "RATE_LIMIT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "DATABASE_FAILED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface AnalyzeResumeSuccess {
  status: "success";
  resumeId: string;
  profile: CandidateProfile;
  cached: boolean;
  analyzedAt: string;
  ownerType: ResumeOwner["kind"];
}

export interface AnalyzeResumeFailure {
  status: "error";
  code: AnalyzeResumeErrorCode;
  error: string;
}

export type AnalyzeResumeResult = AnalyzeResumeSuccess | AnalyzeResumeFailure;

function failure(
  code: AnalyzeResumeErrorCode,
  message: string
): AnalyzeResumeFailure {
  return { status: "error", code, error: message };
}

function mapAnalyzerError(err: ResumeAnalyzerError): AnalyzeResumeFailure {
  switch (err.code) {
    case "EMPTY_TEXT":
      return failure(
        "EMPTY_RESUME",
        "This resume does not contain enough extracted text to analyze."
      );
    case "INVALID_AI_RESPONSE":
      return failure(
        "INVALID_AI_RESPONSE",
        "The AI response could not be validated. Please try again."
      );
    case "RATE_LIMIT":
      return failure(
        "RATE_LIMIT",
        "The AI service is currently rate limited. Please try again shortly."
      );
    case "TIMEOUT":
      return failure("TIMEOUT", "The AI analysis timed out. Please try again.");
    default:
      return failure("AI_FAILURE", "AI analysis failed. Please try again.");
  }
}

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

  if (!anonymousSessionId) {
    return null;
  }

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

/**
 * Analyze an already-processed resume into a canonical CandidateProfile.
 *
 * Reuses an existing validated profile unless force=true is passed.
 */
export async function analyzeResume(
  resumeId: string,
  options: { force?: boolean } = {}
): Promise<AnalyzeResumeResult> {
  let context: Awaited<ReturnType<typeof getAnalysisContext>>;

  try {
    context = await getAnalysisContext();
  } catch (err) {
    console.error("[analyzeResume] Analysis context failed:", err);
    return failure(
      "CONFIGURATION_ERROR",
      "Anonymous resume analysis is not configured. Please contact the demo owner."
    );
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "This resume analysis session was not found. Please upload the resume again."
    );
  }

  const { owner, supabase } = context;

  const resumeQuery = supabase
    .from("resumes")
    .select(
      "id,user_id,anonymous_session_id,extracted_text,extraction_status,candidate_profile,analysis_status,profile_analyzed_at"
    )
    .eq("id", resumeId);
  const { data: resume, error: fetchError } = await applyOwnerFilter(
    resumeQuery,
    owner
  ).single();

  if (fetchError || !resume) {
    return failure("NOT_FOUND", "Resume not found or you do not have access to it.");
  }

  const cachedProfile = resume.candidate_profile;
  if (
    shouldReuseCandidateProfile({
      candidateProfile: cachedProfile,
      analysisStatus: resume.analysis_status,
      force: options.force,
    })
  ) {
    const parsed = candidateProfileSchema.parse(cachedProfile);
    return {
      status: "success",
      resumeId,
      profile: parsed,
      cached: true,
      analyzedAt: resume.profile_analyzed_at ?? new Date().toISOString(),
      ownerType: owner.kind,
    };
  }

  if (resume.extraction_status !== "completed" || !resume.extracted_text) {
    return failure(
      "MISSING_EXTRACTED_TEXT",
      "This resume must be uploaded and processed before AI analysis can run."
    );
  }

  if (String(resume.extracted_text).trim().length < 50) {
    return failure(
      "EMPTY_RESUME",
      "This resume does not contain enough extracted text to analyze."
    );
  }

  // ── Security: per-identity rate limit ───────────
  // Checked BEFORE any OpenAI call to protect against cost-DoS.
  const rateLimitIdentity =
    owner.kind === "authenticated"
      ? owner.userId
      : (await getAnonymousSessionId()) ?? owner.anonymousSessionId;
  const rateCheck = checkRateLimit(
    "analyze",
    rateLimitIdentity ?? "unknown",
    RATE_LIMITS.analyze
  );
  if (!rateCheck.allowed) {
    return failure(
      "RATE_LIMITED",
      "Too many analysis requests. Please wait a moment and try again."
    );
  }

  const analyzingQuery = supabase
    .from("resumes")
    .update({ analysis_status: "analyzing", analysis_error: null })
    .eq("id", resumeId);
  const { error: statusError } = await applyOwnerFilter(analyzingQuery, owner);

  if (statusError) {
    console.error("[analyzeResume] Could not mark resume as analyzing:", statusError);
    return failure("DATABASE_FAILED", "Could not start analysis. Please try again.");
  }

  try {
    // ── DEBUG: Log analysis start ──
    if (process.env.NODE_ENV !== "production") {
      console.log("[DEBUG analyzeResume] Starting analysis for resume:", resumeId);
      console.log("  owner:", owner.kind);
      console.log("  extraction_status:", resume.extraction_status);
      console.log("  analysis_status:", resume.analysis_status);
      console.log("  text_length:", String(resume.extracted_text ?? "").length);
    }

    const analyzed = await analyzeResumeText(String(resume.extracted_text));

    // ── DEBUG: Log analysis success ──
    if (process.env.NODE_ENV !== "production") {
      console.log("[DEBUG analyzeResume] Analysis SUCCESS, model:", analyzed.model);
      console.log("  profile.fullName:", analyzed.profile.fullName);
      console.log("  profile.skills:", analyzed.profile.skills.length);
    }

    const analyzedAt = new Date().toISOString();

    const updateQuery = supabase
      .from("resumes")
      .update({
        candidate_profile: analyzed.profile,
        analysis_status: "completed",
        analysis_error: null,
        profile_model: analyzed.model,
        profile_analyzed_at: analyzedAt,
      })
      .eq("id", resumeId);
    const { error: updateError } = await applyOwnerFilter(updateQuery, owner);

    if (updateError) {
      console.error("[analyzeResume] Could not save candidate profile:", updateError);
      return failure(
        "DATABASE_FAILED",
        "The profile was generated but could not be saved. Please try again."
      );
    }

    return {
      status: "success",
      resumeId,
      profile: analyzed.profile,
      cached: false,
      analyzedAt,
      ownerType: owner.kind,
    };
  } catch (err) {
    // ── DEBUG: Log analysis error details ──
    if (process.env.NODE_ENV !== "production") {
      console.error("[DEBUG analyzeResume] Analysis THREW:");
      console.error("  Error type:", err?.constructor?.name);
      if (err instanceof Error) {
        console.error("  Error code:", (err as { code?: string }).code);
        console.error("  Error message:", err.message);
      }
    }

    const analyzerError =
      err instanceof ResumeAnalyzerError
        ? err
        : new ResumeAnalyzerError("AI analysis failed.", "OPENAI_FAILURE");

    const failedQuery = supabase
      .from("resumes")
      .update({
        analysis_status: "failed",
        analysis_error: analyzerError.message,
      })
      .eq("id", resumeId);
    await applyOwnerFilter(failedQuery, owner);

    return mapAnalyzerError(analyzerError);
  }
}
