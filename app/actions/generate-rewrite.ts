"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { rewriteResume, RewriteAnalyzerError } from "@/lib/ai";
import { candidateProfileSchema } from "@/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type {
  CandidateProfile,
  JobTarget,
  SkillGap,
  RewriteSuggestion,
  RewriteStatus,
} from "@/types";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type GenerateRewriteErrorCode =
  | "SESSION_NOT_FOUND"
  | "RESUME_NOT_FOUND"
  | "JOB_TARGET_NOT_FOUND"
  | "ANALYSIS_NOT_FOUND"
  | "PROFILE_NOT_READY"
  | "JOB_NOT_READY"
  | "RATE_LIMITED"
  | "AI_FAILURE"
  | "DATABASE_FAILED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface GenerateRewriteSuccess {
  status: "success";
  rewriteId: string;
  resumeId: string;
  jobTargetId: string;
  analysisId: string;
  suggestions: RewriteSuggestion[];
  model: string;
  jobTitle: string;
  jobCompany: string;
  matchScore: number;
  createdAt: string;
}

export interface GenerateRewriteFailure {
  status: "error";
  code: GenerateRewriteErrorCode;
  error: string;
}

export type GenerateRewriteResult =
  | GenerateRewriteSuccess
  | GenerateRewriteFailure;

function failure(
  code: GenerateRewriteErrorCode,
  message: string
): GenerateRewriteFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Auth context (same pattern as compute-match)
// ──────────────────────────────────────────────

async function getRewriteContext() {
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
// Server Action — Generate Rewrite from latest analysis
// ──────────────────────────────────────────────

/**
 * Generate resume rewrite suggestions using the latest analysis.
 *
 * Pipeline:
 *   Auth → rate limit → fetch latest analysis → fetch resume + profile
 *   → fetch job target → AI rewrite → evidence validation → persist
 */
export async function generateRewrite(
  analysisId?: string
): Promise<GenerateRewriteResult> {
  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getRewriteContext>>;
  try {
    context = await getRewriteContext();
  } catch (err) {
    console.error("[generateRewrite] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Rewrite is not configured.");
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
  const rateCheck = checkRateLimit(
    "rewrite",
    rateLimitIdentity ?? "unknown",
    RATE_LIMITS.rewrite
  );
  if (!rateCheck.allowed) {
    return failure(
      "RATE_LIMITED",
      "Too many rewrite requests. Please wait a moment and try again."
    );
  }

  // ── Fetch analysis ──────────────────────
  let analysisResult: { data: Record<string, unknown> | null; error: unknown };

  if (analysisId) {
    const query = supabase
      .from("analyses")
      .select("id, resume_id, job_target_id, profile, score, skill_gaps, strengths, weaknesses")
      .eq("id", analysisId);
    const r = await applyOwnerFilter(query, owner).single();
    analysisResult = { data: r.data as Record<string, unknown> | null, error: r.error };
  } else {
    // Find latest analysis
    const query = supabase
      .from("analyses")
      .select("id, resume_id, job_target_id, profile, score, skill_gaps, strengths, weaknesses")
      .not("score", "is", null)
      .order("analyzed_at", { ascending: false })
      .limit(1);
    const r = await applyOwnerFilter(query, owner).single();
    analysisResult = { data: r.data as Record<string, unknown> | null, error: r.error };
  }

  const analysisRow = analysisResult.data;
  const analysisError = analysisResult.error;

  if (analysisError || !analysisRow) {
    return failure(
      "ANALYSIS_NOT_FOUND",
      "No match analysis found. Please run match analysis first."
    );
  }

  const aId = analysisRow.id as string;
  const resumeId = analysisRow.resume_id as string;
  const jobTargetId = analysisRow.job_target_id as string;
  const profileRaw = analysisRow.profile;
  const scoreRaw = analysisRow.score as Record<string, unknown> | null;
  const skillGapsRaw = analysisRow.skill_gaps as unknown[] | null;
  const strengths = (analysisRow.strengths as string[]) ?? [];
  const weaknesses = (analysisRow.weaknesses as string[]) ?? [];

  // ── Validate profile ────────────────────
  let profile: CandidateProfile;
  try {
    profile = candidateProfileSchema.parse(profileRaw);
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

  // ── Parse gaps and score ────────────────
  const gaps: SkillGap[] = (skillGapsRaw ?? []) as SkillGap[];
  const matchScore = scoreRaw
    ? (scoreRaw.overall as number) ?? 0
    : 0;

  // ── Call AI rewrite ─────────────────────
  let rewriteResult;
  try {
    rewriteResult = await rewriteResume(
      profile,
      jobTarget,
      gaps,
      strengths,
      weaknesses,
      matchScore
    );
  } catch (err) {
    if (err instanceof RewriteAnalyzerError) {
      console.error("[generateRewrite] AI failure:", err.code, err.message);
      return failure("AI_FAILURE", err.message);
    }
    console.error("[generateRewrite] Unexpected error:", err);
    return failure("UNKNOWN", "An unexpected error occurred during rewrite.");
  }

  // ── Persist to DB ───────────────────────
  const insertData = {
    resume_id: resumeId,
    job_target_id: jobTargetId,
    analysis_id: aId,
    user_id: owner.kind === "authenticated" ? owner.userId : null,
    anonymous_session_id:
      owner.kind === "anonymous" ? owner.anonymousSessionId : null,
    status: "completed" satisfies RewriteStatus,
    suggestions: rewriteResult.suggestions as unknown as Record<string, unknown>[],
    model: rewriteResult.model,
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from("rewrites")
    .insert(insertData)
    .select("id, created_at")
    .single();

  if (insertError || !insertedRow) {
    if (process.env.NODE_ENV !== "production" && insertError) {
      console.error("[generateRewrite] Supabase insert error:");
      console.error("  code:", insertError.code);
      console.error("  message:", insertError.message);
      console.error("  details:", insertError.details);
      console.error("  hint:", insertError.hint);
    }
    console.error("[generateRewrite] Could not save rewrite:", insertError);
    return failure(
      "DATABASE_FAILED",
      "The rewrite could not be saved. Please try again."
    );
  }

  return {
    status: "success",
    rewriteId: insertedRow.id,
    resumeId,
    jobTargetId,
    analysisId: aId,
    suggestions: rewriteResult.suggestions,
    model: rewriteResult.model,
    jobTitle: jobTarget.title,
    jobCompany: jobTarget.company,
    matchScore,
    createdAt: insertedRow.created_at,
  };
}

// ──────────────────────────────────────────────
// Server Action — Restore latest saved rewrite
// ──────────────────────────────────────────────

export interface SavedRewriteResult {
  status: "success";
  /** Most recent completed rewrite, or null if none exists. */
  rewrite: GenerateRewriteSuccess | null;
}

const SUGGESTION_STATUSES = new Set([
  "pending",
  "accepted",
  "rejected",
  "edited",
]);

/**
 * Light normalizer for suggestions stored in the rewrites table. The rows
 * were validated before insertion, so this only guards against drift and
 * resets review status to "pending" (decisions are per-review-session).
 */
function mapStoredSuggestions(raw: unknown): RewriteSuggestion[] {
  if (!Array.isArray(raw)) return [];

  const suggestions: RewriteSuggestion[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.suggestedText !== "string") continue;

    const status =
      typeof s.status === "string" && SUGGESTION_STATUSES.has(s.status)
        ? (s.status as RewriteSuggestion["status"])
        : "pending";

    suggestions.push({ ...(s as unknown as RewriteSuggestion), status });
  }
  return suggestions;
}

/**
 * Read-only action used by the Resume Rewrite page to restore the most
 * recent completed rewrite after a refresh — mirroring exactly what the
 * Dashboard shows, and avoiding an unnecessary AI regeneration.
 */
export async function getLatestRewrite(): Promise<SavedRewriteResult> {
  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getRewriteContext>>;
  try {
    context = await getRewriteContext();
  } catch (err) {
    console.error("[getLatestRewrite] Context failed:", err);
    return { status: "success", rewrite: null };
  }

  if (!context) {
    return { status: "success", rewrite: null };
  }

  const { owner, supabase } = context;

  // ── Latest completed rewrite ────────────
  const rewriteBase = supabase
    .from("rewrites")
    .select(
      "id, created_at, resume_id, job_target_id, analysis_id, suggestions, model"
    )
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);

  const rewriteQuery = applyOwnerFilter(
    rewriteBase,
    owner
  ) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;
  const { data: rewriteRows, error: rewriteError } = await rewriteQuery;

  if (rewriteError) {
    console.error("[getLatestRewrite] Rewrite query failed:", rewriteError);
    return { status: "success", rewrite: null };
  }

  if (!rewriteRows || rewriteRows.length === 0) {
    return { status: "success", rewrite: null };
  }

  const row = rewriteRows[0];
  const suggestions = mapStoredSuggestions(row.suggestions);

  if (suggestions.length === 0) {
    return { status: "success", rewrite: null };
  }

  // ── Job target metadata (title/company) ─
  const jobBase = supabase
    .from("job_targets")
    .select("id, title, company")
    .eq("id", row.job_target_id as string)
    .limit(1);

  const jobQuery = applyOwnerFilter(jobBase, owner) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;
  const { data: jobRows, error: jobError } = await jobQuery;
  if (jobError) {
    console.error("[getLatestRewrite] Job target query failed:", jobError);
  }

  // ── Match score from the linked analysis ─
  const analysisBase = supabase
    .from("analyses")
    .select("id, score")
    .eq("id", row.analysis_id as string)
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
    console.error("[getLatestRewrite] Analysis query failed:", analysisError);
  }

  const scoreRaw = analysisRows?.[0]?.score as
    | Record<string, unknown>
    | undefined;
  const matchScore = scoreRaw ? (scoreRaw.overall as number) ?? 0 : 0;

  return {
    status: "success",
    rewrite: {
      status: "success",
      rewriteId: row.id as string,
      resumeId: row.resume_id as string,
      jobTargetId: row.job_target_id as string,
      analysisId: row.analysis_id as string,
      suggestions,
      model: (row.model as string) ?? "",
      jobTitle: (jobRows?.[0]?.title as string) ?? "",
      jobCompany: (jobRows?.[0]?.company as string) ?? "",
      matchScore,
      createdAt: row.created_at as string,
    },
  };
}
