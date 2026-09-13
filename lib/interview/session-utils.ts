/**
 * Pure deterministic logic for the AI Mock Interviewer ("Practice" stage).
 *
 * Everything here is pure (no I/O, no AI) — mirrors the separation used by
 * lib/scoring (deterministic match) and lib/skill-bridge/plan-utils.ts
 * (deterministic progress). The AI layer (lib/ai/mock-interviewer.ts)
 * only ever supplies question text, per-answer evaluation numbers, and
 * closing feedback text; everything about SESSION STATE — question
 * numbering, the question-count cap, score aggregation, and which skill
 * gaps the transcript actually corroborates — is decided here so the AI
 * can never silently exceed the configured interview length or invent a
 * skill-gap correlation.
 */

import type {
  InterviewDifficulty,
  InterviewEvaluation,
  InterviewQuestion,
  InterviewQuestionCategory,
  InterviewQuestionCount,
  InterviewScoreBreakdown,
  InterviewType,
  JobTarget,
  SkillGap,
} from "@/types";

export const INTERVIEW_QUESTION_COUNTS: InterviewQuestionCount[] = [5, 10, 15];

export const MAX_FOCUS_AREAS = 6;

// ──────────────────────────────────────────────
// Setup — focus areas (no AI call; shown before the interview starts)
// ──────────────────────────────────────────────

/**
 * Deterministic "Focus Areas" shown on the setup summary — the highest
 * priority missing skill gaps first (the actual reason to practice),
 * then the role's other required skills/technologies. Never invented:
 * every entry comes directly from the job target or the analysis gaps.
 */
export function buildFocusAreas(job: JobTarget, gaps: SkillGap[]): string[] {
  const seen = new Set<string>();
  const areas: string[] = [];

  const add = (skill: string) => {
    const key = skill.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    areas.push(skill.trim());
  };

  const priorityMissing = gaps
    .filter((g) => !g.present && (g.importance === "critical" || g.importance === "important"))
    .map((g) => g.skill);
  for (const skill of priorityMissing) {
    if (areas.length >= MAX_FOCUS_AREAS) break;
    add(skill);
  }

  for (const skill of [...job.requiredSkills, ...job.requiredTechnologies]) {
    if (areas.length >= MAX_FOCUS_AREAS) break;
    add(skill);
  }

  return areas;
}

// ──────────────────────────────────────────────
// Category / target-skill guards (anti-drift, mirrors
// lib/ai/skill-bridge-generator.ts's filterPrioritySkills)
// ──────────────────────────────────────────────

const CATEGORY_ALLOWLIST: Record<InterviewType, InterviewQuestionCategory[]> = {
  technical: ["technical"],
  behavioral: ["behavioral"],
  hr: ["hr"],
  mixed: ["technical", "behavioral", "hr", "problem_solving"],
};

/** Coerce an AI-proposed category into one allowed by the chosen interview
 *  type. Falls back to the type's first allowed category on drift. */
export function coerceCategory(
  interviewType: InterviewType,
  category: InterviewQuestionCategory
): InterviewQuestionCategory {
  const allowed = CATEGORY_ALLOWLIST[interviewType];
  return allowed.includes(category) ? category : allowed[0];
}

/**
 * Only allow a targetSkill that matches an ACTUAL job requirement or
 * skill gap — the programmatic guard against the AI inventing a skill
 * name for the final report's correlation logic to key off of.
 */
export function sanitizeTargetSkill(
  targetSkill: string | undefined,
  job: JobTarget,
  gaps: SkillGap[]
): string | undefined {
  if (!targetSkill || !targetSkill.trim()) return undefined;
  const normalized = targetSkill.trim().toLowerCase();

  const candidates = [
    ...job.requiredSkills,
    ...job.preferredSkills,
    ...job.requiredTechnologies,
    ...gaps.map((g) => g.skill),
  ];

  const match = candidates.find((c) => c.trim().toLowerCase() === normalized);
  return match?.trim();
}

// ──────────────────────────────────────────────
// Question-count cap (the "5 / 10 / 15 questions" the user chose counts
// MAIN questions only — follow-ups add depth without breaking that promise)
// ──────────────────────────────────────────────

export function countMainQuestions(questions: InterviewQuestion[]): number {
  return questions.filter((q) => !q.isFollowUp).length;
}

export function countAnsweredQuestions(questions: InterviewQuestion[]): number {
  return questions.filter((q) => q.answer !== undefined && q.answer !== "").length;
}

/** True once the candidate has reached (or exceeded) the configured
 *  number of MAIN questions — the deterministic cap the AI's "nextAction"
 *  can never override. */
export function hasReachedQuestionCap(
  questions: InterviewQuestion[],
  questionCount: InterviewQuestionCount
): boolean {
  return countMainQuestions(questions) >= questionCount;
}

/** Never ask two follow-ups in a row on the same topic — a second
 *  deterministic guard alongside the prompt's own instruction. */
export function lastQuestionWasFollowUp(questions: InterviewQuestion[]): boolean {
  const last = questions[questions.length - 1];
  return last?.isFollowUp === true;
}

export interface DifficultyLabel {
  value: InterviewDifficulty;
  label: string;
}

export const DIFFICULTY_OPTIONS: DifficultyLabel[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

// ──────────────────────────────────────────────
// Score aggregation (deterministic — the AI never assigns the overall
// score or the category breakdown; it only supplies per-answer numbers)
// ──────────────────────────────────────────────

const EVALUATION_DIMENSIONS = [
  "relevance",
  "clarity",
  "technicalAccuracy",
  "depth",
  "communication",
  "evidenceScore",
] as const;

function answeredEvaluations(
  questions: InterviewQuestion[]
): { question: InterviewQuestion; evaluation: InterviewEvaluation }[] {
  return questions
    .filter((q): q is InterviewQuestion & { evaluation: InterviewEvaluation } =>
      q.evaluation !== undefined
    )
    .map((q) => ({ question: q, evaluation: q.evaluation }));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round(sum / values.length);
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Overall readiness score: the mean of every dimension across every
 * evaluated answer — a holistic average, not a weighted formula the AI
 * could game by focusing on one dimension.
 */
export function calculateOverallScore(questions: InterviewQuestion[]): number | null {
  const evaluated = answeredEvaluations(questions);
  if (evaluated.length === 0) return null;

  const perAnswerMeans = evaluated.map(({ evaluation }) => {
    const values = EVALUATION_DIMENSIONS.map((dim) => evaluation[dim]);
    return values.reduce((a, b) => a + b, 0) / values.length;
  });

  return clamp(average(perAnswerMeans) ?? 0);
}

/**
 * Per-category breakdown for the results screen. Each category falls
 * back to the overall average of its underlying dimension when no
 * question of that category was asked (e.g. a pure "technical" interview
 * still gets a truthful, non-zero Behavioral Responses estimate rather
 * than a misleading 0).
 */
export function calculateScoreBreakdown(
  questions: InterviewQuestion[]
): InterviewScoreBreakdown | null {
  const evaluated = answeredEvaluations(questions);
  if (evaluated.length === 0) return null;

  const byCategory = (categories: InterviewQuestionCategory[]) =>
    evaluated.filter(({ question }) => categories.includes(question.category));

  const avgDim = (
    rows: { evaluation: InterviewEvaluation }[],
    dim: (typeof EVALUATION_DIMENSIONS)[number]
  ) => average(rows.map((r) => r.evaluation[dim]));

  const avgMultiDim = (
    rows: { evaluation: InterviewEvaluation }[],
    dims: (typeof EVALUATION_DIMENSIONS)[number][]
  ) => {
    const perRow = rows.map(
      (r) => dims.reduce((sum, d) => sum + r.evaluation[d], 0) / dims.length
    );
    return average(perRow);
  };

  const technicalRows = byCategory(["technical"]);
  const problemRows = byCategory(["technical", "problem_solving"]);
  const behavioralRows = byCategory(["behavioral", "hr"]);

  const technical =
    avgDim(technicalRows, "technicalAccuracy") ?? avgDim(evaluated, "technicalAccuracy") ?? 0;
  const communication = avgDim(evaluated, "communication") ?? 0;
  const relevance = avgDim(evaluated, "relevance") ?? 0;
  const problemSolving = avgDim(problemRows, "depth") ?? avgDim(evaluated, "depth") ?? 0;
  const behavioral =
    avgMultiDim(behavioralRows, ["relevance", "clarity", "communication"]) ??
    avgMultiDim(evaluated, ["relevance", "clarity", "communication"]) ??
    0;

  return {
    technical: clamp(technical),
    communication: clamp(communication),
    relevance: clamp(relevance),
    problemSolving: clamp(problemSolving),
    behavioral: clamp(behavioral),
  };
}

// ──────────────────────────────────────────────
// Skill-gap correlation (deterministic — instruction §7's feedback loop)
// ──────────────────────────────────────────────

const WEAK_ANSWER_THRESHOLD = 60;

/**
 * Cross-reference weak technical answers against the analysis's ACTUAL
 * missing skill gaps. Only a question whose (AI-proposed, app-validated)
 * targetSkill matches a real missing gap AND whose evaluation scored
 * below the threshold contributes — this is a factual join over stored
 * data, never an AI assertion, so "PostgreSQL is already identified as a
 * skill gap, and your interview responses suggest additional practice is
 * needed" is always traceable to real rows.
 */
export function correlateWithSkillGaps(
  questions: InterviewQuestion[],
  gaps: SkillGap[]
): string[] {
  const missing = new Set(
    gaps.filter((g) => !g.present).map((g) => g.skill.trim().toLowerCase())
  );

  const related = new Set<string>();
  for (const q of questions) {
    if (!q.targetSkill || !q.evaluation) continue;
    if (q.category !== "technical" && q.category !== "problem_solving") continue;

    const key = q.targetSkill.trim().toLowerCase();
    if (!missing.has(key)) continue;

    const weak =
      q.evaluation.technicalAccuracy < WEAK_ANSWER_THRESHOLD ||
      q.evaluation.evidenceScore < WEAK_ANSWER_THRESHOLD;
    if (weak) related.add(q.targetSkill.trim());
  }

  return Array.from(related);
}

/** Render a correlation as the truthful, deterministic sentence the
 *  product shows — never AI-authored, so it can never overstate. */
export function correlationSentence(skill: string): string {
  return `${skill} is already identified as a skill gap, and your interview responses suggest additional practice is needed.`;
}
