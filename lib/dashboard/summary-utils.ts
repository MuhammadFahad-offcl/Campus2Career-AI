/**
 * Pure dashboard derivation logic — no I/O, no AI.
 *
 * Turns already-persisted data (Analysis gaps, SkillBridge plan,
 * product state flags) into the DashboardSummary pieces.
 * Everything here is deterministic and truthful: missing data
 * stays null/absent, metrics are counted — never invented.
 */

import type {
  DashboardGap,
  DashboardInterview,
  DashboardNextAction,
  DashboardSkillBridge,
  DashboardSkillSnapshot,
  InterviewSessionStatus,
  MatchScore,
  ReadinessState,
  SkillBridgePlan,
  SkillGap,
} from "@/types";
import { calculateProgress, isReadyToApply } from "@/lib/skill-bridge/plan-utils";
import { getMatchScoreLabel } from "@/lib/scoring/score-labels";

// ──────────────────────────────────────────────
// Skill snapshot
// ──────────────────────────────────────────────

function gapStatus(gap: SkillGap): DashboardGap["status"] {
  if (gap.demonstrated) return "matched";
  if (gap.present) return "partial";
  return "missing";
}

/**
 * Truthful, deterministic explanation for a gap row.
 * Prefers the stored Analysis evidence; falls back to a factual
 * statement derived from the gap's own fields.
 */
function gapExplanation(gap: SkillGap): string {
  if (gap.evidence && gap.evidence.trim().length > 0) {
    return gap.evidence;
  }
  if (!gap.present) {
    return `The target role requires ${gap.skill} and your profile currently contains no demonstrated ${gap.skill} evidence.`;
  }
  return `${gap.skill} is mentioned in your resume but not yet demonstrated with concrete evidence.`;
}

/**
 * Priority weight for ordering dashboard gaps:
 * critical missing first, then important missing, then
 * critical mentioned-but-not-demonstrated, then the rest.
 */
function gapWeight(gap: SkillGap): number {
  if (!gap.present && gap.importance === "critical") return 0;
  if (!gap.present && gap.importance === "important") return 1;
  if (gap.present && !gap.demonstrated && gap.importance === "critical") return 2;
  if (!gap.present) return 3; // nice-to-have missing
  return 4; // any partial / matched remainder
}

export const MAX_TOP_GAPS = 3;

/**
 * Build the skill coverage snapshot from stored Analysis gaps.
 * Counts are taken from the analysis — never recalculated.
 */
export function buildSkillSnapshot(gaps: SkillGap[]): DashboardSkillSnapshot {
  const matched = gaps.filter((g) => g.demonstrated).length;
  const partial = gaps.filter((g) => g.present && !g.demonstrated).length;
  const missing = gaps.filter((g) => !g.present).length;
  const priorityGapCount = gaps.filter(
    (g) => !g.present && (g.importance === "critical" || g.importance === "important")
  ).length;

  const topGaps: DashboardGap[] = [...gaps]
    .sort((a, b) => gapWeight(a) - gapWeight(b) || a.skill.localeCompare(b.skill))
    .slice(0, MAX_TOP_GAPS)
    .map((g) => ({
      skill: g.skill,
      status: gapStatus(g),
      importance: g.importance,
      explanation: gapExplanation(g),
    }));

  return { matched, partial, missing, priorityGapCount, total: gaps.length, topGaps };
}

// ──────────────────────────────────────────────
// Match summary
// ──────────────────────────────────────────────

export function buildDashboardMatch(score: MatchScore): DashboardMatchLike {
  return { score, label: getMatchScoreLabel(score.overall) };
}

interface DashboardMatchLike {
  score: MatchScore;
  label: string;
}

// ──────────────────────────────────────────────
// Skill Bridge summary
// ──────────────────────────────────────────────

/**
 * Summarize a persisted Skill Bridge plan.
 * Reuses the canonical progress helpers — no independent recalculation.
 */
export function buildSkillBridgeSummary(
  plan: SkillBridgePlan
): DashboardSkillBridge {
  const progress = calculateProgress(plan.days);
  const current = plan.days.find((d) => d.status !== "completed") ?? null;

  return {
    planId: plan.id,
    completedDays: progress.completed,
    totalDays: progress.total,
    percentage: progress.percentage,
    readyToApply: isReadyToApply(plan.days),
    currentDay: current?.day ?? null,
    currentDayTitle: current?.title ?? null,
    currentDayTask: current?.task ?? null,
    currentDayEvidence: current?.expectedEvidence ?? null,
  };
}

// ──────────────────────────────────────────────
// Mock Interview summary
// ──────────────────────────────────────────────

/**
 * Summarize the latest persisted interview session for the dashboard —
 * "Last Interview" and its top practice recommendation. Truthful:
 * a non-completed (in-progress/abandoned) session still shows here so
 * the candidate can see status, but never carries a fabricated score.
 */
export function buildInterviewSummary(row: {
  id: string;
  status: InterviewSessionStatus;
  overallScore: number | null;
  recommendedPractice: string[];
  completedAt: string | null;
  jobTitle: string;
}): DashboardInterview {
  return {
    sessionId: row.id,
    status: row.status,
    jobTitle: row.jobTitle,
    overallScore: row.overallScore,
    topRecommendation: row.recommendedPractice[0] ?? null,
    completedAt: row.completedAt,
  };
}

// ──────────────────────────────────────────────
// Readiness presentation
// ──────────────────────────────────────────────

const READINESS_LABELS: Record<ReadinessState, string> = {
  NO_RESUME: "Getting Started",
  PROFILE_PENDING: "Resume Analysis Pending",
  READY_FOR_JOB_MATCH: "Ready for Job Matching",
  ANALYSIS_COMPLETE: "Analysis Complete",
  REVIEW_RECOMMENDATIONS: "Review Recommendations",
  IMPROVE_PRIORITY_GAPS: "Improving Priority Gaps",
  READY_TO_APPLY: "Ready to Apply",
};

export function getReadinessLabel(state: ReadinessState): string {
  return READINESS_LABELS[state];
}

// ──────────────────────────────────────────────
// Readiness ladder
// ──────────────────────────────────────────────

export interface ReadinessInput {
  hasResume: boolean;
  profileReady: boolean;
  hasJobTarget: boolean;
  hasAnalysis: boolean;
  hasRewrite: boolean;
  hasSkillBridge: boolean;
  skillBridgeComplete: boolean;
}

/**
 * Derive the truthful readiness state from actual product state.
 * "READY_TO_APPLY" only when the Skill Bridge is fully complete —
 * a product workflow state, never a hiring prediction.
 */
export function deriveReadinessState(input: ReadinessInput): ReadinessState {
  if (!input.hasResume) return "NO_RESUME";
  if (!input.profileReady) return "PROFILE_PENDING";
  if (!input.hasJobTarget || !input.hasAnalysis) return "READY_FOR_JOB_MATCH";
  if (input.skillBridgeComplete) return "READY_TO_APPLY";
  if (input.hasSkillBridge) return "IMPROVE_PRIORITY_GAPS";
  if (!input.hasRewrite) return "REVIEW_RECOMMENDATIONS";
  return "ANALYSIS_COMPLETE";
}

// ──────────────────────────────────────────────
// Next action
// ──────────────────────────────────────────────

export interface NextActionInput extends ReadinessInput {
  currentDay: number | null;
}

/**
 * Deterministic next-step recommendation derived from product state —
 * no AI, no generic advice. Mirrors the readiness ladder.
 */
export function deriveNextAction(input: NextActionInput): DashboardNextAction {
  if (!input.hasResume) {
    return {
      title: "Upload your resume",
      description:
        "Upload your resume to build your candidate profile and unlock job matching.",
      href: "/analysis",
      ctaLabel: "Upload Resume",
    };
  }

  if (!input.profileReady) {
    return {
      title: "Finish resume analysis",
      description:
        "Your resume was uploaded but the candidate profile is not complete yet. Re-run the analysis to continue.",
      href: "/analysis",
      ctaLabel: "Analyze Resume",
    };
  }

  if (!input.hasJobTarget || !input.hasAnalysis) {
    return {
      title: "Analyze a target job",
      description:
        "Add a job description to see your match score, skill gaps, and a personalized improvement plan.",
      href: "/job-matcher",
      ctaLabel: "Open Job Matcher",
    };
  }

  if (input.skillBridgeComplete) {
    return {
      title: "Review your resume and apply",
      description:
        "You completed your 7-day plan. Review the rewrite suggestions, add your new evidence, and apply with confidence.",
      href: "/resume",
      ctaLabel: "Open Rewrite",
    };
  }

  if (input.hasSkillBridge && input.currentDay !== null) {
    return {
      title: `Continue Day ${input.currentDay}`,
      description:
        "Keep closing your priority skill gaps — every day ends with tangible evidence you can add to your resume.",
      href: "/skill-bridge",
      ctaLabel: "Continue Skill Bridge",
    };
  }

  if (!input.hasRewrite) {
    return {
      title: "Optimize your resume",
      description:
        "Get evidence-validated rewrite suggestions tailored to your target role.",
      href: "/resume",
      ctaLabel: "Open Rewrite",
    };
  }

  return {
    title: "Start your 7-day plan",
    description:
      "Turn your priority skill gaps into a practical 7-day, evidence-first plan.",
    href: "/skill-bridge",
    ctaLabel: "Start Skill Bridge",
  };
}

// ──────────────────────────────────────────────
// Formatting
// ──────────────────────────────────────────────

/**
 * Compact date for recent-analysis rows (e.g. "Aug 31, 2026").
 * Returns an empty string for invalid input — never throws.
 */
export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
