"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { generateSkillBridge, SkillBridgeGeneratorError } from "@/lib/ai";
import { candidateProfileSchema, skillBridgePlanSchema } from "@/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type {
  DayTaskStatus,
  JobTarget,
  PrioritySkill,
  SkillBridgeDay,
  SkillBridgePlan,
  SkillGap,
} from "@/types";
import { skillBridgeDaySchema } from "@/schemas";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type SkillBridgeErrorCode =
  | "SESSION_NOT_FOUND"
  | "ANALYSIS_NOT_FOUND"
  | "JOB_TARGET_NOT_FOUND"
  | "PROFILE_NOT_READY"
  | "NO_GAPS"
  | "RATE_LIMITED"
  | "AI_FAILURE"
  | "DATABASE_FAILED"
  | "PLAN_NOT_FOUND"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface SkillBridgeSuccess {
  status: "success";
  plan: SkillBridgePlan;
  jobTitle: string;
  jobCompany: string;
  matchScore: number;
}

export interface SkillBridgeFailure {
  status: "error";
  code: SkillBridgeErrorCode;
  error: string;
}

export type SkillBridgeResult = SkillBridgeSuccess | SkillBridgeFailure;

export type UpdateDayStatusResult =
  | { status: "success"; plan: SkillBridgePlan }
  | { status: "error"; code: SkillBridgeErrorCode; error: string };

function failure(
  code: SkillBridgeErrorCode,
  message: string
): SkillBridgeFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Auth context (same pattern as generate-rewrite)
// ──────────────────────────────────────────────

async function getSkillBridgeContext() {
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

function mapSkillBridgeRow(row: Record<string, unknown>): SkillBridgePlan {
  const plan = {
    id: row.id as string,
    resumeId: row.resume_id as string,
    jobTargetId: row.job_target_id as string,
    analysisId: row.analysis_id as string,
    prioritySkills: (row.priority_skills as PrioritySkill[]) ?? [],
    days: (row.days as SkillBridgeDay[]) ?? [],
    model: (row.model as string) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
  return skillBridgePlanSchema.parse(plan);
}

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

/**
 * Find the latest match analysis (with score) for the owner.
 * Returns null if none exists.
 */
async function findLatestAnalysis(
  supabase: ReturnType<typeof createAdminClient>,
  owner: ResumeOwner
): Promise<Record<string, unknown> | null> {
  const query = supabase
    .from("analyses")
    .select(
      "id, resume_id, job_target_id, profile, score, skill_gaps, strengths, weaknesses, analyzed_at"
    )
    .not("score", "is", null)
    .order("analyzed_at", { ascending: false })
    .limit(1);

  const filtered = applyOwnerFilter(query, owner) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;

  const { data, error } = await filtered;
  if (error || !data || data.length === 0) return null;
  return data[0];
}

/**
 * Find an existing skill bridge plan for a given analysis.
 * Used for plan reuse — avoids regenerating on every page load.
 */
async function findExistingPlan(
  supabase: ReturnType<typeof createAdminClient>,
  owner: ResumeOwner,
  analysisId: string
): Promise<SkillBridgePlan | null> {
  const query = supabase
    .from("skill_bridges")
    .select(
      "id, resume_id, job_target_id, analysis_id, priority_skills, days, model, created_at, updated_at"
    )
    .eq("analysis_id", analysisId);

  const filtered = applyOwnerFilter(query, owner) as unknown as Promise<{
    data: Record<string, unknown>[] | null;
    error: unknown;
  }>;

  const { data, error } = await filtered;
  if (error || !data || data.length === 0) return null;
  return mapSkillBridgeRow(data[0]);
}

// ──────────────────────────────────────────────
// Server Action — Get existing plan (reuse)
// ──────────────────────────────────────────────

/**
 * Fetch the existing skill bridge plan for the latest analysis.
 * Does NOT generate a new plan — plan reuse only.
 */
export async function getSkillBridgeAction(): Promise<SkillBridgeResult> {
  let context: Awaited<ReturnType<typeof getSkillBridgeContext>>;
  try {
    context = await getSkillBridgeContext();
  } catch (err) {
    console.error("[getSkillBridge] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Skill Bridge is not configured.");
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Your session has expired. Please refresh the page and try again."
    );
  }

  const { owner, supabase } = context;

  // Find latest analysis
  const analysis = await findLatestAnalysis(supabase, owner);
  if (!analysis) {
    return failure(
      "ANALYSIS_NOT_FOUND",
      "No match analysis found. Please run match analysis first."
    );
  }

  const analysisId = analysis.id as string;

  // Find existing plan for this analysis
  const plan = await findExistingPlan(supabase, owner, analysisId);
  if (!plan) {
    return failure(
      "ANALYSIS_NOT_FOUND",
      "No skill bridge plan exists yet. Generate one to get started."
    );
  }

  // Fetch job details for display
  const jobTargetId = analysis.job_target_id as string;
  const jobQuery = supabase
    .from("job_targets")
    .select("title, company")
    .eq("id", jobTargetId);
  const { data: jobRow } = await applyOwnerFilter(jobQuery, owner).single();

  const scoreRaw = analysis.score as Record<string, unknown> | null;
  const matchScore = scoreRaw ? ((scoreRaw.overall as number) ?? 0) : 0;

  return {
    status: "success",
    plan,
    jobTitle: (jobRow?.title as string) ?? "Target role",
    jobCompany: (jobRow?.company as string) ?? "",
    matchScore,
  };
}

// ──────────────────────────────────────────────
// Server Action — Generate (or reuse) a plan
// ──────────────────────────────────────────────

/**
 * Generate a 7-day skill bridge plan from the latest analysis.
 *
 * Pipeline:
 *   Auth → rate limit → fetch latest analysis → validate profile
 *   → fetch job target → reuse existing plan unless regenerate
 *   → AI generate → normalize + validate → upsert on analysis_id
 */
export async function generateSkillBridgeAction(options?: {
  regenerate?: boolean;
}): Promise<SkillBridgeResult> {
  const regenerate = options?.regenerate === true;

  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getSkillBridgeContext>>;
  try {
    context = await getSkillBridgeContext();
  } catch (err) {
    console.error("[generateSkillBridge] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Skill Bridge is not configured.");
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
    "skillBridge",
    rateLimitIdentity ?? "unknown",
    RATE_LIMITS.skillBridge
  );
  if (!rateCheck.allowed) {
    return failure(
      "RATE_LIMITED",
      "Too many skill bridge requests. Please wait a moment and try again."
    );
  }

  // ── Fetch latest analysis ───────────────
  const analysis = await findLatestAnalysis(supabase, owner);
  if (!analysis) {
    return failure(
      "ANALYSIS_NOT_FOUND",
      "No match analysis found. Please run match analysis first."
    );
  }

  const analysisId = analysis.id as string;
  const resumeId = analysis.resume_id as string;
  const jobTargetId = analysis.job_target_id as string;

  // ── Plan reuse (skip if explicit regenerate) ────
  if (!regenerate) {
    const existing = await findExistingPlan(supabase, owner, analysisId);
    if (existing) {
      const jobQuery = supabase
        .from("job_targets")
        .select("title, company")
        .eq("id", jobTargetId);
      const { data: jobRow } = await applyOwnerFilter(jobQuery, owner).single();
      const scoreRaw = analysis.score as Record<string, unknown> | null;
      const matchScore = scoreRaw ? ((scoreRaw.overall as number) ?? 0) : 0;

      return {
        status: "success",
        plan: existing,
        jobTitle: (jobRow?.title as string) ?? "Target role",
        jobCompany: (jobRow?.company as string) ?? "",
        matchScore,
      };
    }
  }

  // ── Validate profile ────────────────────
  let profile;
  try {
    profile = candidateProfileSchema.parse(analysis.profile);
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
  const gaps: SkillGap[] = (analysis.skill_gaps as SkillGap[]) ?? [];
  const scoreRaw = analysis.score as Record<string, unknown> | null;
  const matchScore = scoreRaw ? ((scoreRaw.overall as number) ?? 0) : 0;

  // ── Call AI generator ───────────────────
  let bridgeResult;
  try {
    bridgeResult = await generateSkillBridge(
      profile,
      jobTarget,
      gaps,
      (analysis.strengths as string[]) ?? [],
      (analysis.weaknesses as string[]) ?? [],
      matchScore
    );
  } catch (err) {
    if (err instanceof SkillBridgeGeneratorError) {
      console.error("[generateSkillBridge] AI failure:", err.code, err.message);
      if (err.code === "NO_GAPS") {
        return failure(
          "NO_GAPS",
          "No skill gaps found for this job — a skill bridge plan is not needed."
        );
      }
      return failure("AI_FAILURE", err.message);
    }
    console.error("[generateSkillBridge] Unexpected error:", err);
    return failure("UNKNOWN", "An unexpected error occurred. Please try again.");
  }

  // ── Persist (upsert on analysis_id) ─────
  const insertData = {
    resume_id: resumeId,
    job_target_id: jobTargetId,
    analysis_id: analysisId,
    user_id: owner.kind === "authenticated" ? owner.userId : null,
    anonymous_session_id:
      owner.kind === "anonymous" ? owner.anonymousSessionId : null,
    status: "completed",
    priority_skills: bridgeResult.prioritySkills as unknown as Record<string, unknown>[],
    days: bridgeResult.days as unknown as Record<string, unknown>[],
    model: bridgeResult.model,
  };

  const { data: savedRow, error: saveError } = await supabase
    .from("skill_bridges")
    .upsert(insertData, { onConflict: "analysis_id" })
    .select(
      "id, resume_id, job_target_id, analysis_id, priority_skills, days, model, created_at, updated_at"
    )
    .single();

  if (saveError || !savedRow) {
    if (process.env.NODE_ENV !== "production" && saveError) {
      console.error("[generateSkillBridge] Supabase upsert error:");
      console.error("  code:", saveError.code);
      console.error("  message:", saveError.message);
      console.error("  details:", saveError.details);
      console.error("  hint:", saveError.hint);
    }
    return failure(
      "DATABASE_FAILED",
      "The skill bridge plan could not be saved. Please try again."
    );
  }

  const plan = mapSkillBridgeRow(savedRow as unknown as Record<string, unknown>);

  return {
    status: "success",
    plan,
    jobTitle: jobTarget.title,
    jobCompany: jobTarget.company,
    matchScore,
  };
}

// ──────────────────────────────────────────────
// Server Action — Update day status
// ──────────────────────────────────────────────

/**
 * Mark a day complete, in progress, or reopen it (pending).
 * Owner-filtered; persists immediately.
 */
export async function updateDayStatusAction(
  bridgeId: string,
  day: number,
  status: DayTaskStatus
): Promise<UpdateDayStatusResult> {
  // ── Auth context ────────────────────────
  let context: Awaited<ReturnType<typeof getSkillBridgeContext>>;
  try {
    context = await getSkillBridgeContext();
  } catch (err) {
    console.error("[updateDayStatus] Context failed:", err);
    return { status: "error", code: "CONFIGURATION_ERROR", error: "Skill Bridge is not configured." };
  }

  if (!context) {
    return {
      status: "error",
      code: "SESSION_NOT_FOUND",
      error: "Your session has expired. Please refresh the page.",
    };
  }

  const { owner, supabase } = context;

  // ── Validate input ──────────────────────
  if (!Number.isInteger(day) || day < 1 || day > 7) {
    return {
      status: "error",
      code: "UNKNOWN",
      error: "Invalid day number.",
    };
  }
  if (status !== "pending" && status !== "in_progress" && status !== "completed") {
    return {
      status: "error",
      code: "UNKNOWN",
      error: "Invalid status.",
    };
  }

  // ── Fetch existing plan (owner-filtered) ─────
  const fetchQuery = supabase
    .from("skill_bridges")
    .select(
      "id, resume_id, job_target_id, analysis_id, priority_skills, days, model, created_at, updated_at"
    )
    .eq("id", bridgeId);

  const { data: planRow, error: fetchError } = await applyOwnerFilter(
    fetchQuery,
    owner
  ).single();

  if (fetchError || !planRow) {
    return {
      status: "error",
      code: "PLAN_NOT_FOUND",
      error: "Skill bridge plan not found or you do not have access to it.",
    };
  }

  const existing = mapSkillBridgeRow(planRow as unknown as Record<string, unknown>);

  // ── Apply the status change immutably ────────
  const updatedDays = existing.days.map((d) =>
    d.day === day ? { ...d, status } : d
  );

  // Validate updated days through the Zod schema before persisting
  const validatedDays = updatedDays.map((d) => skillBridgeDaySchema.parse(d));

  const { data: updatedRow, error: updateError } = await supabase
    .from("skill_bridges")
    .update({ days: validatedDays as unknown as Record<string, unknown>[] })
    .eq("id", bridgeId)
    .select(
      "id, resume_id, job_target_id, analysis_id, priority_skills, days, model, created_at, updated_at"
    )
    .single();

  if (updateError || !updatedRow) {
    console.error("[updateDayStatus] Could not save day status:", updateError);
    return {
      status: "error",
      code: "DATABASE_FAILED",
      error: "The task status could not be saved. Please try again.",
    };
  }

  return {
    status: "success",
    plan: mapSkillBridgeRow(updatedRow as unknown as Record<string, unknown>),
  };
}
