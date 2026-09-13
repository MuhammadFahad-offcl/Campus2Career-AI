/**
 * AI Mock Interviewer — the "Practice" stage.
 *
 * Two AI calls, both structured JSON, both Zod-validated, following the
 * same pipeline shape as skill-bridge-generator.ts and resume-rewriter.ts:
 *
 *   generateInterviewTurn()   — one call per candidate answer. Evaluates
 *     the answer just given (if any) and decides what happens next.
 *   generateInterviewReport() — one call at the end. Writes ONLY the text
 *     feedback; scores are computed deterministically beforehand by
 *     lib/interview/session-utils.ts and handed in for calibration only.
 *
 * Anti-hallucination guards (both deterministic, app-side, never trusting
 * the model): a proposed question category is coerced back onto the
 * chosen interview type (coerceCategory), and a proposed targetSkill is
 * discarded unless it exactly matches a real job requirement or skill
 * gap (sanitizeTargetSkill) — see lib/interview/session-utils.ts.
 */

import { z } from "zod";
import type {
  CandidateProfile,
  InterviewDifficulty,
  InterviewEvaluation,
  InterviewQuestion,
  InterviewQuestionCategory,
  InterviewQuestionCount,
  InterviewType,
  JobTarget,
  SkillGap,
} from "@/types";
import {
  aiInterviewTurnOutputSchema,
  aiInterviewReportOutputSchema,
} from "@/schemas";
import { runCompletion } from "./provider";
import {
  buildMockInterviewTurnSystemPrompt,
  MOCK_INTERVIEW_TURN_USER_PROMPT,
  buildMockInterviewReportSystemPrompt,
  MOCK_INTERVIEW_REPORT_USER_PROMPT,
} from "./prompts/mock-interview";
import {
  coerceCategory,
  countMainQuestions,
  hasReachedQuestionCap,
  lastQuestionWasFollowUp,
  sanitizeTargetSkill,
} from "@/lib/interview/session-utils";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface InterviewTurnResult {
  evaluation: InterviewEvaluation | null;
  nextAction: "follow_up" | "next_question" | "complete";
  nextQuestion: {
    question: string;
    category: InterviewQuestionCategory;
    targetSkill?: string;
  } | null;
  model: string;
}

export interface InterviewReportResult {
  strengths: string[];
  improvements: string[];
  recommendedPractice: string[];
  model: string;
}

export class InterviewGeneratorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "OPENAI_FAILURE"
      | "INVALID_AI_RESPONSE"
      | "RATE_LIMIT"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "InterviewGeneratorError";
  }
}

// ──────────────────────────────────────────────
// JSON parsing (shared shape with other AI workflows)
// ──────────────────────────────────────────────

function parseInterviewJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(json);
  } catch {
    throw new InterviewGeneratorError(
      "The AI returned invalid JSON. Please try again.",
      "INVALID_AI_RESPONSE"
    );
  }
}

// ──────────────────────────────────────────────
// Candidate/job formatting (same helpers as skill-bridge-generator.ts)
// ──────────────────────────────────────────────

function formatExperience(profile: CandidateProfile): string {
  if (profile.experience.length === 0) return "No professional experience listed.";
  return profile.experience
    .map(
      (exp, i) =>
        `[${i}] ${exp.role} at ${exp.company} (${exp.startDate} – ${exp.endDate})\n    ${exp.description}\n    Technologies: ${exp.technologies.join(", ") || "none"}`
    )
    .join("\n\n");
}

function formatProjects(profile: CandidateProfile): string {
  if (profile.projects.length === 0) return "No projects listed.";
  return profile.projects
    .map(
      (proj, i) =>
        `[${i}] ${proj.name}\n    ${proj.description}\n    Technologies: ${proj.technologies.join(", ") || "none"}\n    Highlights: ${proj.highlights.join("; ") || "none"}`
    )
    .join("\n\n");
}

function formatEducation(profile: CandidateProfile): string {
  if (profile.education.length === 0) return "No education listed.";
  return profile.education
    .map(
      (edu, i) =>
        `[${i}] ${edu.degree} in ${edu.field} at ${edu.institution} (${edu.startDate} – ${edu.endDate})`
    )
    .join("\n");
}

function formatSkills(profile: CandidateProfile): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of [...profile.skills, ...profile.technologies]) {
    const key = s.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(`${s.name} (${s.supportLevel})`);
  }
  if (parts.length === 0) return "No skills listed.";
  return parts.join(", ");
}

function formatGaps(gaps: SkillGap[]): { matched: string; missing: string } {
  const matched = gaps.filter((g) => g.present).map((g) => g.skill).join(", ") || "none";
  const missing = gaps.filter((g) => !g.present).map((g) => g.skill).join(", ") || "none";
  return { matched, missing };
}

function formatConversationHistory(history: InterviewQuestion[]): string {
  if (history.length === 0) return "No prior questions yet — this is the opening question.";
  return history
    .map((q) => {
      const tag = q.isFollowUp ? " (follow-up)" : "";
      return `Q${q.number} [${q.category}]${tag}: ${q.question}\nA: ${q.answer ?? "(no answer recorded)"}`;
    })
    .join("\n\n");
}

// ──────────────────────────────────────────────
// Error classification
// ──────────────────────────────────────────────

function classifyInterviewError(err: unknown): InterviewGeneratorError {
  if (err instanceof InterviewGeneratorError) return err;

  const maybeError = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };

  if (maybeError.status === 429 || maybeError.code === "rate_limit_exceeded") {
    return new InterviewGeneratorError(
      "The AI service is currently rate limited. Please try again shortly.",
      "RATE_LIMIT"
    );
  }

  if (maybeError.name === "AbortError" || maybeError.code === "ETIMEDOUT") {
    return new InterviewGeneratorError(
      "The interviewer timed out. Please try again.",
      "TIMEOUT"
    );
  }

  if (err instanceof z.ZodError) {
    console.warn(
      "[mock-interviewer] AI response failed Zod validation:",
      err.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message }))
    );
    return new InterviewGeneratorError(
      "The AI response did not match the required structure.",
      "INVALID_AI_RESPONSE"
    );
  }

  return new InterviewGeneratorError(
    "The interviewer failed to respond. Please try again.",
    "OPENAI_FAILURE"
  );
}

// ──────────────────────────────────────────────
// Turn generation
// ──────────────────────────────────────────────

export interface GenerateInterviewTurnParams {
  profile: CandidateProfile;
  job: JobTarget;
  gaps: SkillGap[];
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  focusAreas: string[];
  questionCount: InterviewQuestionCount;
  /** Fully evaluated prior questions, oldest → newest. */
  history: InterviewQuestion[];
  /** The question just answered (has `.answer` set, no `.evaluation` yet).
   *  Null on the very first call, before any question has been asked. */
  pendingQuestion: InterviewQuestion | null;
}

export async function generateInterviewTurn(
  params: GenerateInterviewTurnParams
): Promise<InterviewTurnResult> {
  const { profile, job, gaps, interviewType, difficulty, focusAreas, questionCount, history, pendingQuestion } =
    params;

  const { matched, missing } = formatGaps(gaps);
  const allSoFar = pendingQuestion ? [...history, pendingQuestion] : history;
  const questionsAsked = countMainQuestions(allSoFar);

  const lastAnswer = pendingQuestion
    ? `Q${pendingQuestion.number} [${pendingQuestion.category}]${pendingQuestion.isFollowUp ? " (follow-up)" : ""}: ${pendingQuestion.question}\nCandidate's answer: ${pendingQuestion.answer ?? ""}`
    : "This is the first question of the interview — nothing to evaluate yet.";

  const userPrompt = MOCK_INTERVIEW_TURN_USER_PROMPT
    .replace("{candidateName}", profile.fullName || "Candidate")
    .replace("{candidateSummary}", profile.summary || "No summary provided.")
    .replace("{candidateExperience}", formatExperience(profile))
    .replace("{candidateProjects}", formatProjects(profile))
    .replace("{candidateEducation}", formatEducation(profile))
    .replace("{candidateSkills}", formatSkills(profile))
    .replace("{jobTitle}", job.title || "Not specified")
    .replace("{jobCompany}", job.company || "Not specified")
    .replace("{jobOpportunityType}", job.opportunityType)
    .replace("{jobRequiredSkills}", job.requiredSkills.join(", ") || "none")
    .replace("{jobPreferredSkills}", job.preferredSkills.join(", ") || "none")
    .replace("{jobRequiredTechnologies}", job.requiredTechnologies.join(", ") || "none")
    .replace("{jobResponsibilities}", job.responsibilities.join("; ") || "none")
    .replace("{matchedSkills}", matched)
    .replace("{missingSkills}", missing)
    .replace("{interviewType}", interviewType)
    .replace("{difficulty}", difficulty)
    .replace("{focusAreas}", focusAreas.join(", ") || "general fit for the role")
    .replace("{questionsAsked}", String(questionsAsked))
    .replace("{totalQuestions}", String(questionCount))
    .replace("{conversationHistory}", formatConversationHistory(history))
    .replace("{lastAnswer}", lastAnswer);

  try {
    const completion = await runCompletion(
      "mock-interview-turn",
      {
        temperature: 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildMockInterviewTurnSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 45_000 }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new InterviewGeneratorError(
        "The AI returned an empty response. Please try again.",
        "INVALID_AI_RESPONSE"
      );
    }

    const parsed = aiInterviewTurnOutputSchema.parse(parseInterviewJson(content));

    // ── Evaluation normalization ────────────
    let evaluation: InterviewEvaluation | null = null;
    if (pendingQuestion) {
      evaluation =
        parsed.evaluation ??
        {
          // The model skipped evaluation despite an answer being given —
          // fall back to a neutral score rather than losing the turn.
          relevance: 50,
          clarity: 50,
          technicalAccuracy: 50,
          depth: 50,
          communication: 50,
          evidenceScore: 50,
          unsupportedClaim: false,
        };
      if (process.env.NODE_ENV !== "production" && !parsed.evaluation) {
        console.warn("[mock-interviewer] AI omitted evaluation for an answered question — using neutral fallback");
      }
    }

    // ── Deterministic cap override ──────────
    const capReached = hasReachedQuestionCap(allSoFar, questionCount);
    let nextAction = parsed.nextAction;
    if (capReached) {
      nextAction = "complete";
    } else if (nextAction === "follow_up" && lastQuestionWasFollowUp(allSoFar)) {
      // Never two follow-ups in a row on the same topic.
      nextAction = "next_question";
    }

    let nextQuestion: InterviewTurnResult["nextQuestion"] = null;
    if (nextAction !== "complete") {
      if (!parsed.nextQuestion) {
        throw new InterviewGeneratorError(
          "The AI did not provide the next question. Please try again.",
          "INVALID_AI_RESPONSE"
        );
      }
      nextQuestion = {
        question: parsed.nextQuestion.question.trim(),
        category: coerceCategory(interviewType, parsed.nextQuestion.category),
        targetSkill: sanitizeTargetSkill(parsed.nextQuestion.targetSkill, job, gaps),
      };
    }

    return { evaluation, nextAction, nextQuestion, model: completion.model };
  } catch (err) {
    throw classifyInterviewError(err);
  }
}

// ──────────────────────────────────────────────
// Final report (text only — scores are computed deterministically
// by lib/interview/session-utils.ts before this is called)
// ──────────────────────────────────────────────

export interface GenerateInterviewReportParams {
  job: JobTarget;
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  questions: InterviewQuestion[];
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  relevanceScore: number;
  problemSolvingScore: number;
  behavioralScore: number;
}

function formatTranscript(questions: InterviewQuestion[]): string {
  return questions
    .filter((q) => q.answer !== undefined && q.evaluation)
    .map((q) => {
      const ev = q.evaluation!;
      const flag = ev.unsupportedClaim
        ? `\n  ⚠ Unsupported claim noted: ${ev.unsupportedClaimNote ?? "flagged, no detail"}`
        : "";
      return (
        `Q${q.number} [${q.category}${q.isFollowUp ? ", follow-up" : ""}]: ${q.question}\n` +
        `A: ${q.answer}\n` +
        `Scores — relevance ${ev.relevance}, clarity ${ev.clarity}, technicalAccuracy ${ev.technicalAccuracy}, depth ${ev.depth}, communication ${ev.communication}, evidence ${ev.evidenceScore}${flag}`
      );
    })
    .join("\n\n");
}

export async function generateInterviewReport(
  params: GenerateInterviewReportParams
): Promise<InterviewReportResult> {
  const userPrompt = MOCK_INTERVIEW_REPORT_USER_PROMPT
    .replace("{jobTitle}", params.job.title || "Not specified")
    .replace("{jobCompany}", params.job.company || "Not specified")
    .replace("{interviewType}", params.interviewType)
    .replace("{difficulty}", params.difficulty)
    .replace("{transcript}", formatTranscript(params.questions) || "No answers recorded.")
    .replace("{overallScore}", String(params.overallScore))
    .replace("{technicalScore}", String(params.technicalScore))
    .replace("{communicationScore}", String(params.communicationScore))
    .replace("{relevanceScore}", String(params.relevanceScore))
    .replace("{problemSolvingScore}", String(params.problemSolvingScore))
    .replace("{behavioralScore}", String(params.behavioralScore));

  try {
    const completion = await runCompletion(
      "mock-interview-report",
      {
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildMockInterviewReportSystemPrompt() },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 45_000 }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new InterviewGeneratorError(
        "The AI returned an empty response. Please try again.",
        "INVALID_AI_RESPONSE"
      );
    }

    const parsed = aiInterviewReportOutputSchema.parse(parseInterviewJson(content));

    return {
      strengths: parsed.strengths.map((s) => s.trim()).filter(Boolean),
      improvements: parsed.improvements.map((s) => s.trim()).filter(Boolean),
      recommendedPractice: parsed.recommendedPractice.map((s) => s.trim()).filter(Boolean),
      model: completion.model,
    };
  } catch (err) {
    throw classifyInterviewError(err);
  }
}
