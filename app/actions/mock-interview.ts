"use server";

/**
 * Mock Interviewer server actions — the "Practice" stage.
 *
 * Pipeline (mirrors the rest of the product):
 *   Resume Analyzer → CandidateProfile → Job Match → Skill Gap Analysis
 *   → Mock Interviewer → Interview Performance → recommendations
 *
 * Every action here reuses the existing auth/ownership pattern from
 * app/actions/skill-bridge.ts (authenticated Supabase client or the
 * anonymous-session + admin-client fallback), the existing rate
 * limiter, and the existing AI provider layer — no parallel
 * infrastructure is introduced.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import {
  generateInterviewTurn,
  generateInterviewReport,
  InterviewGeneratorError,
} from "@/lib/ai";
import { candidateProfileSchema, interviewQuestionSchema, interviewSessionSchema } from "@/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/observability/log-error";
import {
  buildFocusAreas,
  calculateOverallScore,
  calculateScoreBreakdown,
  correlateWithSkillGaps,
} from "@/lib/interview/session-utils";
import type {
  InterviewDifficulty,
  InterviewQuestion,
  InterviewQuestionCount,
  InterviewSession,
  InterviewSetupContext,
  InterviewType,
  JobTarget,
  SkillGap,
} from "@/types";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type MockInterviewErrorCode =
  | "SESSION_NOT_FOUND"
  | "ANALYSIS_NOT_FOUND"
  | "JOB_TARGET_NOT_FOUND"
  | "PROFILE_NOT_READY"
  | "INTERVIEW_NOT_FOUND"
  | "SESSION_ALREADY_ENDED"
  | "INVALID_REQUEST"
  | "RATE_LIMITED"
  | "AI_FAILURE"
  | "DATABASE_FAILED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface SetupContextSuccess {
  status: "success";
  context: InterviewSetupContext;
}
export interface MockInterviewFailure {
  status: "error";
  code: MockInterviewErrorCode;
  error: string;
}
export type SetupContextResult = SetupContextSuccess | MockInterviewFailure;

export interface MockInterviewSuccess {
  status: "success";
  session: InterviewSession;
  jobTitle: string;
  jobCompany: string;
}
export type MockInterviewResult = MockInterviewSuccess | MockInterviewFailure;

function failure(code: MockInterviewErrorCode, message: string): MockInterviewFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Auth context (same pattern as skill-bridge / dashboard / compute-match)
// ──────────────────────────────────────────────

async function getMockInterviewContext() {
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
    owner: { kind: "anonymous", anonymousSessionId } satisfies ResumeOwner,
    supabase: createAdminClient(),
  };
}

function applyOwnerFilter<Query>(query: Query, owner: ResumeOwner): Query {
  const filterable = query as Query & { eq(column: string, value: string): Query };
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

const SESSION_COLUMNS =
  "id, resume_id, job_target_id, analysis_id, interview_type, difficulty, question_count, status, focus_areas, questions, overall_score, score_breakdown, strengths, improvements, recommended_practice, related_skill_gaps, model, started_at, completed_at, created_at, updated_at";

function mapInterviewSessionRow(row: Record<string, unknown>): InterviewSession {
  const session = {
    id: row.id as string,
    resumeId: row.resume_id as string,
    jobTargetId: row.job_target_id as string,
    analysisId: row.analysis_id as string,
    interviewType: row.interview_type as InterviewType,
    difficulty: row.difficulty as InterviewDifficulty,
    questionCount: row.question_count as InterviewQuestionCount,
    status: row.status as InterviewSession["status"],
    focusAreas: (row.focus_areas as string[]) ?? [],
    questions: (row.questions as InterviewQuestion[]) ?? [],
    overallScore: (row.overall_score as number | null) ?? null,
    scoreBreakdown: (row.score_breakdown as InterviewSession["scoreBreakdown"]) ?? null,
    strengths: (row.strengths as string[]) ?? [],
    improvements: (row.improvements as string[]) ?? [],
    recommendedPractice: (row.recommended_practice as string[]) ?? [],
    relatedSkillGaps: (row.related_skill_gaps as string[]) ?? [],
    model: (row.model as string) ?? undefined,
    startedAt: row.started_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
  return interviewSessionSchema.parse(session);
}

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

type SupabaseLike = ReturnType<typeof createAdminClient>;

/** Latest scored analysis for the owner — the same prerequisite the
 *  Skill Bridge requires, so the two features share one integration
 *  point instead of re-deriving profile/job/gaps independently. */
async function findLatestAnalysis(
  supabase: SupabaseLike,
  owner: ResumeOwner
): Promise<Record<string, unknown> | null> {
  const query = supabase
    .from("analyses")
    .select("id, resume_id, job_target_id, profile, score, skill_gaps, analyzed_at")
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

async function fetchAnalysisById(
  supabase: SupabaseLike,
  owner: ResumeOwner,
  analysisId: string
): Promise<Record<string, unknown> | null> {
  const query = supabase
    .from("analyses")
    .select("id, resume_id, job_target_id, profile, score, skill_gaps, analyzed_at")
    .eq("id", analysisId);
  const { data, error } = await applyOwnerFilter(query, owner).single();
  if (error || !data) return null;
  return data as unknown as Record<string, unknown>;
}

async function fetchJobTarget(
  supabase: SupabaseLike,
  owner: ResumeOwner,
  jobTargetId: string
): Promise<JobTarget | null> {
  const query = supabase
    .from("job_targets")
    .select(
      "id, user_id, anonymous_session_id, title, company, location, source, description, opportunity_type, required_skills, preferred_skills, required_technologies, responsibilities, experience_requirements, education_requirements, soft_skills, domain_requirements, extracted_requirements, parsing_status, parsing_model, parsing_error, created_at, updated_at"
    )
    .eq("id", jobTargetId);
  const { data, error } = await applyOwnerFilter(query, owner).single();
  if (error || !data) return null;
  return mapJobTargetRow(data as unknown as Record<string, unknown>);
}

// ──────────────────────────────────────────────
// Server Action — Setup context (no AI call)
// ──────────────────────────────────────────────

/**
 * Assemble the interview setup screen's context from EXISTING product
 * state: the latest match analysis, its job target, and deterministic
 * focus areas. No AI call — the setup screen must never ask the user to
 * re-enter information the app already has.
 */
export async function getInterviewSetupContext(): Promise<SetupContextResult> {
  let context: Awaited<ReturnType<typeof getMockInterviewContext>>;
  try {
    context = await getMockInterviewContext();
  } catch (err) {
    console.error("[getInterviewSetupContext] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Mock Interview is not configured.");
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Your session has expired. Please refresh the page and try again."
    );
  }

  const { owner, supabase } = context;

  const analysis = await findLatestAnalysis(supabase, owner);
  if (!analysis) {
    return failure(
      "ANALYSIS_NOT_FOUND",
      "No match analysis found. Run a job match first — the interview is personalized from your resume, target role, and skill gaps."
    );
  }

  const jobTargetId = analysis.job_target_id as string;
  const jobTarget = await fetchJobTarget(supabase, owner, jobTargetId);
  if (!jobTarget) {
    return failure("JOB_TARGET_NOT_FOUND", "Job target not found or you do not have access to it.");
  }

  const gaps = (analysis.skill_gaps as SkillGap[]) ?? [];
  const scoreRaw = analysis.score as Record<string, unknown> | null;
  const matchScore = scoreRaw ? ((scoreRaw.overall as number) ?? 0) : 0;

  return {
    status: "success",
    context: {
      resumeId: analysis.resume_id as string,
      jobTargetId,
      analysisId: analysis.id as string,
      jobTitle: jobTarget.title || "Target role",
      jobCompany: jobTarget.company || "",
      matchScore,
      suggestedFocusAreas: buildFocusAreas(jobTarget, gaps),
    },
  };
}

// ──────────────────────────────────────────────
// Server Action — Start a session
// ──────────────────────────────────────────────

export async function startInterviewSession(options: {
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  questionCount: InterviewQuestionCount;
}): Promise<MockInterviewResult> {
  let context: Awaited<ReturnType<typeof getMockInterviewContext>>;
  try {
    context = await getMockInterviewContext();
  } catch (err) {
    console.error("[startInterviewSession] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Mock Interview is not configured.");
  }
  if (!context) {
    return failure("SESSION_NOT_FOUND", "Your session has expired. Please refresh the page and try again.");
  }
  const { owner, supabase } = context;

  const rateLimitIdentity =
    owner.kind === "authenticated" ? owner.userId : (await getAnonymousSessionId()) ?? owner.anonymousSessionId;
  const rateCheck = await checkRateLimit("mockInterviewStart", rateLimitIdentity ?? "unknown", RATE_LIMITS.mockInterviewStart);
  if (!rateCheck.allowed) {
    return failure("RATE_LIMITED", "Too many interview starts. Please wait a moment and try again.");
  }

  const analysis = await findLatestAnalysis(supabase, owner);
  if (!analysis) {
    return failure(
      "ANALYSIS_NOT_FOUND",
      "No match analysis found. Run a job match first — the interview is personalized from your resume, target role, and skill gaps."
    );
  }

  let profile;
  try {
    profile = candidateProfileSchema.parse(analysis.profile);
  } catch {
    return failure("PROFILE_NOT_READY", "The stored resume profile is invalid. Please re-analyze the resume.");
  }

  const jobTargetId = analysis.job_target_id as string;
  const jobTarget = await fetchJobTarget(supabase, owner, jobTargetId);
  if (!jobTarget) {
    return failure("JOB_TARGET_NOT_FOUND", "Job target not found or you do not have access to it.");
  }

  const gaps = (analysis.skill_gaps as SkillGap[]) ?? [];
  const focusAreas = buildFocusAreas(jobTarget, gaps);

  let turn;
  try {
    turn = await generateInterviewTurn({
      profile,
      job: jobTarget,
      gaps,
      interviewType: options.interviewType,
      difficulty: options.difficulty,
      focusAreas,
      questionCount: options.questionCount,
      history: [],
      pendingQuestion: null,
    });
  } catch (err) {
    if (err instanceof InterviewGeneratorError) {
      console.error("[startInterviewSession] AI failure:", err.code, err.message);
      void logServerError("startInterviewSession", err, { errorCode: err.code });
      return failure("AI_FAILURE", err.message);
    }
    console.error("[startInterviewSession] Unexpected error:", err);
    void logServerError("startInterviewSession", err, { errorCode: "UNKNOWN" });
    return failure("UNKNOWN", "An unexpected error occurred. Please try again.");
  }

  if (!turn.nextQuestion) {
    return failure("AI_FAILURE", "The interviewer could not generate an opening question. Please try again.");
  }

  const now = new Date().toISOString();
  const firstQuestion: InterviewQuestion = interviewQuestionSchema.parse({
    number: 1,
    category: turn.nextQuestion.category,
    question: turn.nextQuestion.question,
    isFollowUp: false,
    targetSkill: turn.nextQuestion.targetSkill,
    askedAt: now,
  });

  const insertData = {
    resume_id: analysis.resume_id,
    job_target_id: jobTargetId,
    analysis_id: analysis.id,
    user_id: owner.kind === "authenticated" ? owner.userId : null,
    anonymous_session_id: owner.kind === "anonymous" ? owner.anonymousSessionId : null,
    interview_type: options.interviewType,
    difficulty: options.difficulty,
    question_count: options.questionCount,
    status: "in_progress",
    focus_areas: focusAreas,
    questions: [firstQuestion] as unknown as Record<string, unknown>[],
    model: turn.model,
    started_at: now,
  };

  const { data: savedRow, error: saveError } = await supabase
    .from("interview_sessions")
    .insert(insertData)
    .select(SESSION_COLUMNS)
    .single();

  if (saveError || !savedRow) {
    if (process.env.NODE_ENV !== "production" && saveError) {
      console.error("[startInterviewSession] Supabase insert error:", saveError);
    }
    return failure("DATABASE_FAILED", "The interview session could not be created. Please try again.");
  }

  return {
    status: "success",
    session: mapInterviewSessionRow(savedRow as unknown as Record<string, unknown>),
    jobTitle: jobTarget.title,
    jobCompany: jobTarget.company,
  };
}

// ──────────────────────────────────────────────
// Server Action — Submit an answer (evaluate + advance or complete)
// ──────────────────────────────────────────────

export async function submitAnswerAction(
  sessionId: string,
  questionNumber: number,
  answerText: string
): Promise<MockInterviewResult> {
  let context: Awaited<ReturnType<typeof getMockInterviewContext>>;
  try {
    context = await getMockInterviewContext();
  } catch (err) {
    console.error("[submitAnswer] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Mock Interview is not configured.");
  }
  if (!context) {
    return failure("SESSION_NOT_FOUND", "Your session has expired. Please refresh the page and try again.");
  }
  const { owner, supabase } = context;

  const trimmedAnswer = answerText.trim();
  if (!trimmedAnswer) {
    return failure("INVALID_REQUEST", "Please write an answer before submitting.");
  }
  if (!Number.isInteger(questionNumber) || questionNumber < 1) {
    return failure("INVALID_REQUEST", "Invalid question number.");
  }

  const rateLimitIdentity =
    owner.kind === "authenticated" ? owner.userId : (await getAnonymousSessionId()) ?? owner.anonymousSessionId;
  const rateCheck = await checkRateLimit("mockInterviewTurn", rateLimitIdentity ?? "unknown", RATE_LIMITS.mockInterviewTurn);
  if (!rateCheck.allowed) {
    return failure("RATE_LIMITED", "You're answering too quickly. Please wait a moment and try again.");
  }

  // ── Fetch session (owner-filtered) ──────
  const fetchQuery = supabase.from("interview_sessions").select(SESSION_COLUMNS).eq("id", sessionId);
  const { data: sessionRow, error: fetchError } = await applyOwnerFilter(fetchQuery, owner).single();
  if (fetchError || !sessionRow) {
    return failure("INTERVIEW_NOT_FOUND", "Interview session not found or you do not have access to it.");
  }

  const session = mapInterviewSessionRow(sessionRow as unknown as Record<string, unknown>);

  if (session.status !== "in_progress") {
    return failure("SESSION_ALREADY_ENDED", "This interview has already ended.");
  }

  const currentQuestion = session.questions[session.questions.length - 1];
  if (!currentQuestion || currentQuestion.number !== questionNumber) {
    return failure("INVALID_REQUEST", "That question is no longer active.");
  }

  // Idempotent: a duplicate submission for an already-answered question
  // returns the current state instead of erroring or double-processing.
  if (currentQuestion.answer !== undefined) {
    return { status: "success", session, jobTitle: "", jobCompany: "" };
  }

  // ── Re-fetch the canonical analysis snapshot for grounding ─────
  const analysis = await fetchAnalysisById(supabase, owner, session.analysisId);
  if (!analysis) {
    return failure("ANALYSIS_NOT_FOUND", "The underlying match analysis is no longer available.");
  }
  let profile;
  try {
    profile = candidateProfileSchema.parse(analysis.profile);
  } catch {
    return failure("PROFILE_NOT_READY", "The stored resume profile is invalid.");
  }
  const jobTarget = await fetchJobTarget(supabase, owner, session.jobTargetId);
  if (!jobTarget) {
    return failure("JOB_TARGET_NOT_FOUND", "Job target not found or you do not have access to it.");
  }
  const gaps = (analysis.skill_gaps as SkillGap[]) ?? [];

  const now = new Date().toISOString();
  const pendingQuestion: InterviewQuestion = { ...currentQuestion, answer: trimmedAnswer, answeredAt: now };
  const history = session.questions.slice(0, -1);

  let turn;
  try {
    turn = await generateInterviewTurn({
      profile,
      job: jobTarget,
      gaps,
      interviewType: session.interviewType,
      difficulty: session.difficulty,
      focusAreas: session.focusAreas,
      questionCount: session.questionCount,
      history,
      pendingQuestion,
    });
  } catch (err) {
    if (err instanceof InterviewGeneratorError) {
      console.error("[submitAnswer] AI failure:", err.code, err.message);
      void logServerError("submitInterviewAnswer", err, { errorCode: err.code });
      return failure("AI_FAILURE", err.message);
    }
    console.error("[submitAnswer] Unexpected error:", err);
    void logServerError("submitInterviewAnswer", err, { errorCode: "UNKNOWN" });
    return failure("UNKNOWN", "An unexpected error occurred. Please try again.");
  }

  const evaluatedQuestion: InterviewQuestion = { ...pendingQuestion, evaluation: turn.evaluation ?? undefined };
  const updatedQuestions = [...history, evaluatedQuestion];

  let updatePayload: Record<string, unknown>;

  if (turn.nextAction === "complete") {
    const overallScore = calculateOverallScore(updatedQuestions) ?? 0;
    const breakdown = calculateScoreBreakdown(updatedQuestions) ?? {
      technical: overallScore,
      communication: overallScore,
      relevance: overallScore,
      problemSolving: overallScore,
      behavioral: overallScore,
    };
    const relatedSkillGaps = correlateWithSkillGaps(updatedQuestions, gaps);

    let report = { strengths: [] as string[], improvements: [] as string[], recommendedPractice: [] as string[] };
    try {
      report = await generateInterviewReport({
        job: jobTarget,
        interviewType: session.interviewType,
        difficulty: session.difficulty,
        questions: updatedQuestions,
        overallScore,
        technicalScore: breakdown.technical,
        communicationScore: breakdown.communication,
        relevanceScore: breakdown.relevance,
        problemSolvingScore: breakdown.problemSolving,
        behavioralScore: breakdown.behavioral,
      });
    } catch (err) {
      // The interview's scores are already deterministic and solid —
      // don't fail the whole completion just because the closing
      // narrative failed. Persist with empty feedback text.
      console.error("[submitAnswer] Report generation failed, completing without narrative feedback:", err);
    }

    updatePayload = {
      questions: z.array(interviewQuestionSchema).parse(updatedQuestions) as unknown as Record<string, unknown>[],
      status: "completed",
      completed_at: now,
      overall_score: overallScore,
      score_breakdown: breakdown,
      strengths: report.strengths,
      improvements: report.improvements,
      recommended_practice: report.recommendedPractice,
      related_skill_gaps: relatedSkillGaps,
      model: turn.model,
    };
  } else {
    const newQuestion: InterviewQuestion = interviewQuestionSchema.parse({
      number: evaluatedQuestion.number + 1,
      category: turn.nextQuestion!.category,
      question: turn.nextQuestion!.question,
      isFollowUp: turn.nextAction === "follow_up",
      targetSkill: turn.nextQuestion!.targetSkill,
      askedAt: now,
    });
    const withNewQuestion = [...updatedQuestions, newQuestion];
    updatePayload = {
      questions: z.array(interviewQuestionSchema).parse(withNewQuestion) as unknown as Record<string, unknown>[],
      model: turn.model,
    };
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("interview_sessions")
    .update(updatePayload)
    .eq("id", sessionId)
    .select(SESSION_COLUMNS)
    .single();

  if (updateError || !updatedRow) {
    console.error("[submitAnswer] Could not save interview progress:", updateError);
    return failure("DATABASE_FAILED", "Your answer could not be saved. Please try again.");
  }

  return {
    status: "success",
    session: mapInterviewSessionRow(updatedRow as unknown as Record<string, unknown>),
    jobTitle: jobTarget.title,
    jobCompany: jobTarget.company,
  };
}

// ──────────────────────────────────────────────
// Server Action — Abandon a session
// ──────────────────────────────────────────────

export async function abandonInterviewAction(sessionId: string): Promise<MockInterviewResult> {
  let context: Awaited<ReturnType<typeof getMockInterviewContext>>;
  try {
    context = await getMockInterviewContext();
  } catch (err) {
    console.error("[abandonInterview] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Mock Interview is not configured.");
  }
  if (!context) {
    return failure("SESSION_NOT_FOUND", "Your session has expired. Please refresh the page.");
  }
  const { owner, supabase } = context;

  const fetchQuery = supabase.from("interview_sessions").select(SESSION_COLUMNS).eq("id", sessionId);
  const { data: sessionRow, error: fetchError } = await applyOwnerFilter(fetchQuery, owner).single();
  if (fetchError || !sessionRow) {
    return failure("INTERVIEW_NOT_FOUND", "Interview session not found or you do not have access to it.");
  }

  const session = mapInterviewSessionRow(sessionRow as unknown as Record<string, unknown>);
  if (session.status !== "in_progress") {
    return { status: "success", session, jobTitle: "", jobCompany: "" };
  }

  const { data: updatedRow, error: updateError } = await supabase
    .from("interview_sessions")
    .update({ status: "abandoned", completed_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select(SESSION_COLUMNS)
    .single();

  if (updateError || !updatedRow) {
    return failure("DATABASE_FAILED", "Could not end the interview. Please try again.");
  }

  return {
    status: "success",
    session: mapInterviewSessionRow(updatedRow as unknown as Record<string, unknown>),
    jobTitle: "",
    jobCompany: "",
  };
}

// ──────────────────────────────────────────────
// Server Action — Restore a session (page reload resilience)
// ──────────────────────────────────────────────

export async function getInterviewSessionAction(sessionId: string): Promise<MockInterviewResult> {
  let context: Awaited<ReturnType<typeof getMockInterviewContext>>;
  try {
    context = await getMockInterviewContext();
  } catch (err) {
    console.error("[getInterviewSession] Context failed:", err);
    return failure("CONFIGURATION_ERROR", "Mock Interview is not configured.");
  }
  if (!context) {
    return failure("SESSION_NOT_FOUND", "Your session has expired. Please refresh the page.");
  }
  const { owner, supabase } = context;

  const fetchQuery = supabase.from("interview_sessions").select(SESSION_COLUMNS).eq("id", sessionId);
  const { data: sessionRow, error: fetchError } = await applyOwnerFilter(fetchQuery, owner).single();
  if (fetchError || !sessionRow) {
    return failure("INTERVIEW_NOT_FOUND", "Interview session not found or you do not have access to it.");
  }

  const session = mapInterviewSessionRow(sessionRow as unknown as Record<string, unknown>);
  const jobTarget = await fetchJobTarget(supabase, owner, session.jobTargetId);

  return {
    status: "success",
    session,
    jobTitle: jobTarget?.title ?? "Target role",
    jobCompany: jobTarget?.company ?? "",
  };
}
