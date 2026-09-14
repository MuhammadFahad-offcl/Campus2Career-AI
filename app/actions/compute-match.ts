"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { computeMatch } from "@/lib/scoring";
import { candidateProfileSchema } from "@/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/observability/log-error";
import type {
  CandidateProfile,
  JobTarget,
  MatchScore,
  SkillGap,
} from "@/types";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ComputeMatchErrorCode =
  | "SESSION_NOT_FOUND"
  | "RESUME_NOT_FOUND"
  | "JOB_TARGET_NOT_FOUND"
  | "PROFILE_NOT_READY"
  | "JOB_NOT_READY"
  | "RATE_LIMITED"
  | "DATABASE_FAILED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface ComputeMatchSuccess {
  status: "success";
  analysisId: string;
  resumeId: string;
  jobTargetId: string;
  score: MatchScore;
  skillGaps: SkillGap[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  profile: CandidateProfile;
  jobTarget: JobTarget;
  analyzedAt: string;
}

export interface ComputeMatchFailure {
  status: "error";
  code: ComputeMatchErrorCode;
  error: string;
}

export type ComputeMatchResult = ComputeMatchSuccess | ComputeMatchFailure;

function failure(
  code: ComputeMatchErrorCode,
  message: string
): ComputeMatchFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Auth context (same pattern as other actions)
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
// DB row mappers
// ──────────────────────────────────────────────

function mapResumeRow(row: Record<string, unknown>): {
  id: string;
  candidate_profile: unknown;
  analysis_status: string | null;
} {
  return {
    id: row.id as string,
    candidate_profile: row.candidate_profile,
    analysis_status: row.analysis_status as string | null,
  };
}

function mapJobTargetRow(row: Record<string, unknown>): JobTarget {
  return {
    id: row.id as string,
    userId: (row.user_id as string) ?? undefined,
    anonymousSessionId: (row.anonymous_session_id as string) ?? undefined,
    title: row.title as string,
    company: row.company as string,
    location: row.location as string,
    source: (row.source as string) ?? undefined,
    description: row.description as string,
    opportunityType: row.opportunity_type as JobTarget["opportunityType"],
    requiredSkills: (row.required_skills as string[]) ?? [],
    preferredSkills: (row.preferred_skills as string[]) ?? [],
    requiredTechnologies: (row.required_technologies as string[]) ?? [],
    responsibilities: (row.responsibilities as string[]) ?? [],
    experienceRequirements: (row.experience_requirements as string[]) ?? [],
    educationRequirements: (row.education_requirements as string[]) ?? [],
    softSkills: (row.soft_skills as string[]) ?? [],
    domainRequirements: (row.domain_requirements as string[]) ?? [],
    extractedRequirements: (row.extracted_requirements as string[]) ?? [],
    parsingStatus: row.parsing_status as JobTarget["parsingStatus"],
    parsingModel: (row.parsing_model as string) ?? undefined,
    parsingError: (row.parsing_error as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Find the user's most recent resume with a completed CandidateProfile.
 * Returns null if no analyzed resume exists.
 */
async function findLatestAnalyzedResume(
  supabase: { from: (table: string) => unknown },
  owner: ResumeOwner
): Promise<{ id: string; candidate_profile: unknown } | null> {
  const base = (supabase as ReturnType<typeof createAdminClient>)
    .from("resumes")
    .select("id, candidate_profile")
    .eq("analysis_status", "completed")
    .not("candidate_profile", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);

  const query = applyOwnerFilter(base, owner) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;

  const { data, error } = await query;
  if (error || !data || data.length === 0) return null;

  const row = data[0];
  return {
    id: row.id as string,
    candidate_profile: row.candidate_profile,
  };
}

// ──────────────────────────────────────────────
// Server Action — Explicit IDs
// ──────────────────────────────────────────────

/**
 * Compute match analysis between a resume's CandidateProfile and a JobTarget.
 *
 * Pipeline:
 *   Resume (candidate_profile) + JobTarget (structured)
 *   → computeMatch() (pure scoring)
 *   → analyses table
 *   → AnalysisResult
 */
export async function computeMatchAction(
  resumeId: string,
  jobTargetId: string
): Promise<ComputeMatchResult> {
  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getAnalysisContext>>;
  try {
    context = await getAnalysisContext();
  } catch (err) {
    console.error("[computeMatch] Context failed:", err);
    void logServerError("computeMatchAction", err, { errorCode: "CONFIGURATION_ERROR" });
    return failure("CONFIGURATION_ERROR", "Analysis is not configured.");
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Your session has expired. Please refresh the page and try again."
    );
  }

  const { owner, supabase } = context;

  // ── Rate limit ──────────────────────────
  const rateLimitIdentity =
    owner.kind === "authenticated"
      ? owner.userId
      : (await getAnonymousSessionId()) ?? owner.anonymousSessionId;
  const rateCheck = await checkRateLimit(
    "computeMatch",
    rateLimitIdentity ?? "unknown",
    RATE_LIMITS.computeMatch
  );
  if (!rateCheck.allowed) {
    return failure(
      "RATE_LIMITED",
      "Too many analysis requests. Please wait a moment and try again."
    );
  }

  // ── Fetch resume ────────────────────────
  const resumeQuery = supabase
    .from("resumes")
    .select("id, candidate_profile, analysis_status")
    .eq("id", resumeId);
  const { data: resumeRow, error: resumeError } = await applyOwnerFilter(
    resumeQuery,
    owner
  ).single();

  if (resumeError || !resumeRow) {
    return failure("RESUME_NOT_FOUND", "Resume not found or you do not have access to it.");
  }

  const resume = mapResumeRow(resumeRow as unknown as Record<string, unknown>);

  if (resume.analysis_status !== "completed" || !resume.candidate_profile) {
    return failure(
      "PROFILE_NOT_READY",
      "Resume analysis is not complete. Please analyze the resume first."
    );
  }

  // Validate cached profile through Zod
  let profile: CandidateProfile;
  try {
    profile = candidateProfileSchema.parse(resume.candidate_profile);
  } catch {
    return failure(
      "PROFILE_NOT_READY",
      "The stored resume profile is invalid. Please re-analyze the resume."
    );
  }

  // ── Fetch job target ────────────────────
  const jobQuery = supabase
    .from("job_targets")
    .select(
      "id, user_id, anonymous_session_id, title, company, location, source, description, opportunity_type, required_skills, preferred_skills, required_technologies, responsibilities, experience_requirements, education_requirements, soft_skills, domain_requirements, extracted_requirements, parsing_status, parsing_model, parsing_error, created_at, updated_at"
    )
    .eq("id", jobTargetId);
  const { data: jobRow, error: jobError } = await applyOwnerFilter(
    jobQuery,
    owner
  ).single();

  if (jobError || !jobRow) {
    return failure(
      "JOB_TARGET_NOT_FOUND",
      "Job target not found or you do not have access to it."
    );
  }

  const jobTarget = mapJobTargetRow(jobRow as unknown as Record<string, unknown>);

  if (jobTarget.parsingStatus !== "completed") {
    return failure(
      "JOB_NOT_READY",
      "Job analysis is not complete. Please analyze the job description first."
    );
  }

  // ── Compute match ───────────────────────
  const result = computeMatch(profile, jobTarget);
  const analyzedAt = new Date().toISOString();

  // ── Persist to DB ───────────────────────
  const insertData = {
    resume_id: resumeId,
    job_target_id: jobTargetId,
    user_id: owner.kind === "authenticated" ? owner.userId : null,
    anonymous_session_id:
      owner.kind === "anonymous" ? owner.anonymousSessionId : null,
    profile: profile as unknown as Record<string, unknown>,
    score: result.score as unknown as Record<string, unknown>,
    skill_gaps: result.gaps as unknown as Record<string, unknown>[],
    strengths: result.strengths,
    weaknesses: result.weaknesses,
    recommendations: result.recommendations,
    analyzed_at: analyzedAt,
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from("analyses")
    .insert(insertData)
    .select("id, analyzed_at")
    .single();

  if (insertError || !insertedRow) {
    console.error("[computeMatch] Could not save analysis:", insertError);
    return failure(
      "DATABASE_FAILED",
      "The match analysis could not be saved. Please try again."
    );
  }

  return {
    status: "success",
    analysisId: insertedRow.id,
    resumeId,
    jobTargetId,
    score: result.score,
    skillGaps: result.gaps,
    strengths: result.strengths,
    weaknesses: result.weaknesses,
    recommendations: result.recommendations,
    profile,
    jobTarget,
    analyzedAt: insertedRow.analyzed_at,
  };
}

// ──────────────────────────────────────────────
// Server Action — Auto-find latest resume
// ──────────────────────────────────────────────

/**
 * Compute match analysis using the user's most recently analyzed resume.
 *
 * This allows the Job Matcher page to offer "Analyze My Match" without
 * requiring the user to know their resume ID. If no completed resume
 * analysis exists, returns a PROFILE_NOT_READY error.
 */
export async function computeLatestMatch(
  jobTargetId: string
): Promise<ComputeMatchResult> {
  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getAnalysisContext>>;
  try {
    context = await getAnalysisContext();
  } catch (err) {
    console.error("[computeLatestMatch] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Analysis is not configured.");
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Your session has expired. Please refresh the page and try again."
    );
  }

  const { owner, supabase } = context;

  // ── Find latest analyzed resume ─────────
  const latestResume = await findLatestAnalyzedResume(supabase, owner);

  if (!latestResume) {
    return failure(
      "PROFILE_NOT_READY",
      "No analyzed resume found. Please upload and analyze your resume first."
    );
  }

  // Delegate to the explicit-ID action
  return computeMatchAction(latestResume.id, jobTargetId);
}

// ──────────────────────────────────────────────
// Server Action — Restore latest saved job target + analysis
// ──────────────────────────────────────────────

export interface SavedMatchContext {
  status: "success";
  /** Most recent completed job target, or null for first-time visitors. */
  jobTarget: JobTarget | null;
  /** Persisted analysis for that job target, or null if none exists yet. */
  match: ComputeMatchSuccess | null;
  ownerType: ResumeOwner["kind"];
}

/**
 * Read-only action used by the Job Matcher page to restore the most recent
 * job target and its persisted match analysis after a refresh.
 *
 * No AI calls and no writes — the stored Analysis row is returned as-is so
 * the score shown here always matches the Dashboard (Test: data consistency).
 */
export async function getLatestMatchContext(): Promise<SavedMatchContext> {
  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getAnalysisContext>>;
  try {
    context = await getAnalysisContext();
  } catch (err) {
    console.error("[getLatestMatchContext] Context failed:", err);
    return { status: "success", jobTarget: null, match: null, ownerType: "anonymous" };
  }

  if (!context) {
    return { status: "success", jobTarget: null, match: null, ownerType: "anonymous" };
  }

  const { owner, supabase } = context;

  // ── Latest completed job target ─────────
  const jobBase = supabase
    .from("job_targets")
    .select(
      "id, user_id, anonymous_session_id, title, company, location, source, description, opportunity_type, required_skills, preferred_skills, required_technologies, responsibilities, experience_requirements, education_requirements, soft_skills, domain_requirements, extracted_requirements, parsing_status, parsing_model, parsing_error, created_at, updated_at"
    )
    .eq("parsing_status", "completed")
    .order("updated_at", { ascending: false })
    .limit(1);

  const jobQuery = applyOwnerFilter(jobBase, owner) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;
  const { data: jobRows, error: jobError } = await jobQuery;

  if (jobError) {
    console.error("[getLatestMatchContext] Job target query failed:", jobError);
    return { status: "success", jobTarget: null, match: null, ownerType: owner.kind };
  }

  if (!jobRows || jobRows.length === 0) {
    return { status: "success", jobTarget: null, match: null, ownerType: owner.kind };
  }

  const jobTarget = mapJobTargetRow(jobRows[0]);

  // ── Latest persisted analysis for this job target ─
  const analysisBase = supabase
    .from("analyses")
    .select(
      "id, resume_id, job_target_id, profile, score, skill_gaps, strengths, weaknesses, recommendations, analyzed_at"
    )
    .eq("job_target_id", jobTarget.id)
    .not("score", "is", null)
    .order("analyzed_at", { ascending: false })
    .limit(1);

  const analysisQuery = applyOwnerFilter(
    analysisBase,
    owner
  ) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;
  const { data: analysisRows, error: analysisError } = await analysisQuery;

  if (analysisError) {
    console.error("[getLatestMatchContext] Analysis query failed:", analysisError);
    return { status: "success", jobTarget, match: null, ownerType: owner.kind };
  }

  if (!analysisRows || analysisRows.length === 0) {
    return { status: "success", jobTarget, match: null, ownerType: owner.kind };
  }

  const row = analysisRows[0];

  // Validate the stored profile before handing it to the UI.
  let profile: CandidateProfile;
  try {
    profile = candidateProfileSchema.parse(row.profile);
  } catch {
    return { status: "success", jobTarget, match: null, ownerType: owner.kind };
  }

  return {
    status: "success",
    jobTarget,
    match: {
      status: "success",
      analysisId: row.id as string,
      resumeId: row.resume_id as string,
      jobTargetId: jobTarget.id,
      score: row.score as unknown as MatchScore,
      skillGaps: (row.skill_gaps as SkillGap[]) ?? [],
      strengths: (row.strengths as string[]) ?? [],
      weaknesses: (row.weaknesses as string[]) ?? [],
      recommendations: (row.recommendations as string[]) ?? [],
      profile,
      jobTarget,
      analyzedAt: row.analyzed_at as string,
    },
    ownerType: owner.kind,
  };
}
