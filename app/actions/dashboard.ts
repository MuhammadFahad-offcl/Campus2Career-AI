"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { candidateProfileSchema } from "@/schemas";
import type {
  DashboardMatch,
  DashboardRewrite,
  DashboardSkillBridge,
  DashboardSkillSnapshot,
  DashboardSummary,
  DashboardTargetRole,
  MatchScore,
  RecentAnalysisItem,
  SkillBridgeDay,
  SkillGap,
} from "@/types";
import {
  buildSkillBridgeSummary,
  buildSkillSnapshot,
  deriveNextAction,
  deriveReadinessState,
} from "@/lib/dashboard/summary-utils";
import { getMatchScoreLabel } from "@/lib/scoring/score-labels";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type DashboardErrorCode = "DATABASE_FAILED" | "CONFIGURATION_ERROR";

export interface DashboardSuccess {
  status: "success";
  summary: DashboardSummary;
}

export interface DashboardFailure {
  status: "error";
  code: DashboardErrorCode;
  error: string;
}

export type DashboardResult = DashboardSuccess | DashboardFailure;

const RECENT_ANALYSES_LIMIT = 5;

function failure(code: DashboardErrorCode, message: string): DashboardFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Auth context (same pattern as skill-bridge / generate-rewrite)
// ──────────────────────────────────────────────

async function getDashboardContext() {
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

/** Typed helper so each parallel query can fail independently. */
async function safeQuery(
  label: string,
  run: () => PromiseLike<{ data: unknown; error: unknown }>
): Promise<Record<string, unknown>[] | null> {
  try {
    const { data, error } = await run();
    if (error) {
      console.error(`[getDashboardSummary] ${label} query error:`, error);
      return null;
    }
    return (data as Record<string, unknown>[]) ?? [];
  } catch (err) {
    console.error(`[getDashboardSummary] ${label} threw:`, err);
    return null;
  }
}

// ──────────────────────────────────────────────
// Server Action — aggregate persisted data into a DashboardSummary
//
// Deterministic: NO OpenAI calls, no recalculation of match scores.
// Each optional piece is fetched independently — a missing piece
// renders an empty state instead of failing the whole dashboard.
// ──────────────────────────────────────────────

export async function getDashboardSummary(): Promise<DashboardResult> {
  let context: Awaited<ReturnType<typeof getDashboardContext>>;
  try {
    context = await getDashboardContext();
  } catch (err) {
    console.error("[getDashboardSummary] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Dashboard is not configured.");
  }

  // Brand-new anonymous visitor — truthful empty state, not an error.
  if (!context) {
    return { status: "success", summary: buildEmptySummary() };
  }

  const { owner, supabase } = context;

  // ── Parallel owner-filtered reads ───────
  const [resumeRows, analysisRows, rewriteRows, bridgeRows, recentRows, jobTargetRows] =
    await Promise.all([
      safeQuery("resume", () =>
        applyOwnerFilter(
          supabase
            .from("resumes")
            .select("id, analysis_status, candidate_profile, updated_at")
            .order("updated_at", { ascending: false })
            .limit(1),
          owner
        )
      ),
      safeQuery("latest analysis", () =>
        applyOwnerFilter(
          supabase
            .from("analyses")
            .select("id, resume_id, job_target_id, profile, score, skill_gaps, analyzed_at")
            .not("score", "is", null)
            .order("analyzed_at", { ascending: false })
            .limit(1),
          owner
        )
      ),
      safeQuery("rewrite", () =>
        applyOwnerFilter(
          supabase
            .from("rewrites")
            .select("id, suggestions, created_at")
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(1),
          owner
        )
      ),
      safeQuery("skill bridge", () =>
        applyOwnerFilter(
          supabase
            .from("skill_bridges")
            .select("id, days, created_at, updated_at")
            .order("updated_at", { ascending: false })
            .limit(1),
          owner
        )
      ),
      safeQuery("recent analyses", () =>
        applyOwnerFilter(
          supabase
            .from("analyses")
            .select("id, job_target_id, score, analyzed_at")
            .not("score", "is", null)
            .order("analyzed_at", { ascending: false })
            .limit(RECENT_ANALYSES_LIMIT),
          owner
        )
      ),
      safeQuery("job targets", () =>
        applyOwnerFilter(
          supabase.from("job_targets").select("id, created_at").limit(1),
          owner
        )
      ),
    ]);

  // Dashboard fails only when every core read failed (DB truly unreachable).
  if (!resumeRows && !analysisRows && !recentRows) {
    return failure(
      "DATABASE_FAILED",
      "Your dashboard could not be loaded. Please refresh the page."
    );
  }

  const resume = resumeRows?.[0] ?? null;
  const analysis = analysisRows?.[0] ?? null;
  const rewrite = rewriteRows?.[0] ?? null;
  const bridge = bridgeRows?.[0] ?? null;
  const recent = recentRows ?? [];

  // ── Job titles for latest + recent analyses (one batched query) ───────
  const jobTargetIds = Array.from(
    new Set(
      [
        analysis?.job_target_id as string | undefined,
        ...recent.map((r) => r.job_target_id as string | undefined),
      ].filter((id): id is string => Boolean(id))
    )
  );

  const jobTitleMap = new Map<string, { title: string; company: string }>();
  if (jobTargetIds.length > 0) {
    const jobRows = await safeQuery("job target details", () =>
      applyOwnerFilter(
        supabase
          .from("job_targets")
          .select("id, title, company")
          .in("id", jobTargetIds),
        owner
      )
    );
    for (const row of jobRows ?? []) {
      jobTitleMap.set(row.id as string, {
        title: (row.title as string) ?? "Target role",
        company: (row.company as string) ?? "",
      });
    }
  }

  // ── Derive summary pieces (pure functions) ───────
  const hasResume = resume !== null;
  const profileReady =
    hasResume && resume!.analysis_status === "completed" && resume!.candidate_profile != null;

  let candidateName: string | null = null;
  if (profileReady) {
    try {
      const profile = candidateProfileSchema.parse(resume!.candidate_profile);
      candidateName = profile.fullName?.trim() || null;
    } catch {
      // Invalid stored profile — keep name null, dashboard still renders.
      candidateName = null;
    }
  }

  const scoreRaw = (analysis?.score as Record<string, unknown> | null) ?? null;
  const hasAnalysis = analysis !== null;

  let match: DashboardMatch | null = null;
  let skills: DashboardSkillSnapshot | null = null;
  let targetRole: DashboardTargetRole | null = null;

  if (hasAnalysis && scoreRaw) {
    const score: MatchScore = {
      overall: (scoreRaw.overall as number) ?? 0,
      skillsMatch: (scoreRaw.skillsMatch as number) ?? 0,
      experienceMatch: (scoreRaw.experienceMatch as number) ?? 0,
      educationMatch: (scoreRaw.educationMatch as number) ?? 0,
    };
    match = { score, label: getMatchScoreLabel(score.overall) };

    const gaps = (analysis!.skill_gaps as SkillGap[]) ?? [];
    skills = buildSkillSnapshot(gaps);

    const jobTargetId = analysis!.job_target_id as string | null;
    const job = jobTargetId ? jobTitleMap.get(jobTargetId) : undefined;
    targetRole = {
      title: job?.title ?? "Target role",
      company: job?.company ?? "",
      analyzedAt: analysis!.analyzed_at as string,
    };
  }

  let rewriteSummary: DashboardRewrite | null = null;
  if (rewrite) {
    const suggestions = (rewrite.suggestions as unknown[]) ?? [];
    rewriteSummary = {
      rewriteId: rewrite.id as string,
      suggestionCount: suggestions.length,
      createdAt: rewrite.created_at as string,
    };
  }

  let skillBridgeSummary: DashboardSkillBridge | null = null;
  if (bridge) {
    skillBridgeSummary = buildSkillBridgeSummary({
      id: bridge.id as string,
      resumeId: analysis?.resume_id as string,
      jobTargetId: analysis?.job_target_id as string,
      analysisId: analysis?.id as string,
      prioritySkills: [],
      days: (bridge.days as SkillBridgeDay[]) ?? [],
      model: undefined,
      createdAt: bridge.created_at as string,
      updatedAt: bridge.updated_at as string,
    });
  }

  const recentAnalyses: RecentAnalysisItem[] = recent.map((row) => {
    const jobTargetId = row.job_target_id as string | null;
    const job = jobTargetId ? jobTitleMap.get(jobTargetId) : undefined;
    const rowScore = row.score as Record<string, unknown> | null;
    return {
      id: row.id as string,
      jobTitle: job?.title ?? "Target role",
      jobCompany: job?.company ?? "",
      matchScore: (rowScore?.overall as number) ?? 0,
      analyzedAt: row.analyzed_at as string,
    };
  });

  const hasJobTarget = (jobTargetRows?.length ?? 0) > 0 || jobTargetIds.length > 0;

  const readinessInput = {
    hasResume,
    profileReady,
    hasJobTarget,
    hasAnalysis,
    hasRewrite: rewriteSummary !== null,
    hasSkillBridge: skillBridgeSummary !== null,
    skillBridgeComplete: skillBridgeSummary?.readyToApply ?? false,
  };

  const summary: DashboardSummary = {
    candidateName,
    hasResume,
    profileReady,
    hasJobTarget,
    targetRole,
    match,
    skills,
    rewrite: rewriteSummary,
    skillBridge: skillBridgeSummary,
    readiness: deriveReadinessState(readinessInput),
    nextAction: deriveNextAction({
      ...readinessInput,
      currentDay: skillBridgeSummary?.currentDay ?? null,
    }),
    recentAnalyses,
  };

  return { status: "success", summary };
}

// ──────────────────────────────────────────────
// Empty summary (brand-new visitor)
// ──────────────────────────────────────────────

function buildEmptySummary(): DashboardSummary {
  const readinessInput = {
    hasResume: false,
    profileReady: false,
    hasJobTarget: false,
    hasAnalysis: false,
    hasRewrite: false,
    hasSkillBridge: false,
    skillBridgeComplete: false,
  };

  return {
    candidateName: null,
    hasResume: false,
    profileReady: false,
    hasJobTarget: false,
    targetRole: null,
    match: null,
    skills: null,
    rewrite: null,
    skillBridge: null,
    readiness: deriveReadinessState(readinessInput),
    nextAction: deriveNextAction({ ...readinessInput, currentDay: null }),
    recentAnalyses: [],
  };
}
