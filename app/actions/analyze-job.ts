"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import {
  analyzeJobDescriptionText,
  JobAnalyzerError,
} from "@/lib/ai";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import type { JobTarget } from "@/types";

export type AnalyzeJobErrorCode =
  | "SESSION_NOT_FOUND"
  | "EMPTY_INPUT"
  | "TEXT_TOO_SHORT"
  | "AI_FAILURE"
  | "INVALID_AI_RESPONSE"
  | "RATE_LIMIT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "DATABASE_FAILED"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface AnalyzeJobSuccess {
  status: "success";
  jobTargetId: string;
  jobTarget: JobTarget;
  analyzedAt: string;
  ownerType: ResumeOwner["kind"];
}

export interface AnalyzeJobFailure {
  status: "error";
  code: AnalyzeJobErrorCode;
  error: string;
}

export type AnalyzeJobResult = AnalyzeJobSuccess | AnalyzeJobFailure;

const JOB_TARGET_COLUMNS =
  "id, user_id, anonymous_session_id, title, company, location, source, description, opportunity_type, required_skills, preferred_skills, required_technologies, responsibilities, experience_requirements, education_requirements, soft_skills, domain_requirements, extracted_requirements, parsing_status, parsing_model, parsing_error, created_at, updated_at";

interface JobTargetRow {
  id: string;
  user_id: string | null;
  anonymous_session_id: string | null;
  title: string;
  company: string;
  location: string;
  source: string | null;
  description: string;
  opportunity_type: JobTarget["opportunityType"];
  required_skills: string[];
  preferred_skills: string[];
  required_technologies: string[];
  responsibilities: string[];
  experience_requirements: string[];
  education_requirements: string[];
  soft_skills: string[];
  domain_requirements: string[];
  extracted_requirements: string[];
  parsing_status: JobTarget["parsingStatus"];
  parsing_model: string | null;
  parsing_error: string | null;
  created_at: string;
  updated_at: string;
}

function mapJobTargetRow(row: JobTargetRow): JobTarget {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    anonymousSessionId: row.anonymous_session_id ?? undefined,
    title: row.title,
    company: row.company,
    location: row.location,
    source: row.source ?? undefined,
    description: row.description,
    opportunityType: row.opportunity_type,
    requiredSkills: row.required_skills,
    preferredSkills: row.preferred_skills,
    requiredTechnologies: row.required_technologies,
    responsibilities: row.responsibilities,
    experienceRequirements: row.experience_requirements,
    educationRequirements: row.education_requirements,
    softSkills: row.soft_skills,
    domainRequirements: row.domain_requirements,
    extractedRequirements: row.extracted_requirements,
    parsingStatus: row.parsing_status,
    parsingModel: row.parsing_model ?? undefined,
    parsingError: row.parsing_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function failure(
  code: AnalyzeJobErrorCode,
  message: string
): AnalyzeJobFailure {
  return { status: "error", code, error: message };
}

function mapAnalyzerError(err: JobAnalyzerError): AnalyzeJobFailure {
  switch (err.code) {
    case "EMPTY_TEXT":
      return failure(
        "EMPTY_INPUT",
        "Please paste a job or internship description to analyze."
      );
    case "TEXT_TOO_SHORT":
      return failure(
        "TEXT_TOO_SHORT",
        "This job description is too short to analyze. Please paste the complete job posting."
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

/**
 * Analyze a pasted job/internship description into a structured JobTarget.
 *
 * Pipeline:
 *   Job Description → OpenAI → Structured Output → Zod → Normalized JobTarget → Database
 */
export async function analyzeJob(
  jobDescription: string
): Promise<AnalyzeJobResult> {
  // ── Input validation ────────────────────────
  const trimmedDescription = jobDescription?.trim();
  if (!trimmedDescription) {
    return failure(
      "EMPTY_INPUT",
      "Please paste a job or internship description to analyze."
    );
  }

  if (trimmedDescription.length < 50) {
    return failure(
      "TEXT_TOO_SHORT",
      "This job description is too short to analyze. Please paste the complete job posting."
    );
  }

  // ── Auth / anonymous context ────────────────
  let context: Awaited<ReturnType<typeof getAnalysisContext>>;

  try {
    context = await getAnalysisContext();
  } catch (err) {
    console.error("[analyzeJob] Analysis context failed:", err);
    return failure(
      "CONFIGURATION_ERROR",
      "Job analysis is not configured. Please contact the demo owner."
    );
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Your session has expired. Please refresh the page and try again."
    );
  }

  const { owner, supabase } = context;

  // ── Cache/reuse: identical description already parsed ──
  // An unchanged JobTarget must not be re-analyzed (OpenAI cost) or
  // re-inserted (duplicate rows). Match the exact trimmed description
  // against this owner's most recent completed parse. The lookup runs
  // before the rate limiter because a reuse hit performs no AI call.
  try {
    let reuseQuery = supabase
      .from("job_targets")
      .select(JOB_TARGET_COLUMNS)
      .eq("parsing_status", "completed")
      .eq("description", trimmedDescription)
      .order("created_at", { ascending: false })
      .limit(1);

    reuseQuery =
      owner.kind === "authenticated"
        ? reuseQuery.eq("user_id", owner.userId)
        : reuseQuery.eq("anonymous_session_id", owner.anonymousSessionId);

    const { data: existingRow, error: reuseError } = await reuseQuery.maybeSingle();

    if (reuseError) {
      // Lookup failures fall through to a fresh analysis rather than
      // failing the request.
      console.error("[analyzeJob] Reuse lookup failed:", reuseError);
    } else if (existingRow) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[analyzeJob] Reusing existing JobTarget for identical description:",
          existingRow.id
        );
      }
      return {
        status: "success",
        jobTargetId: existingRow.id,
        jobTarget: mapJobTargetRow(existingRow),
        analyzedAt: existingRow.updated_at,
        ownerType: owner.kind,
      };
    }
  } catch (err) {
    console.error("[analyzeJob] Reuse lookup threw:", err);
  }

  // ── Security: per-identity rate limit ───────
  const rateLimitIdentity =
    owner.kind === "authenticated"
      ? owner.userId
      : (await getAnonymousSessionId()) ?? owner.anonymousSessionId;
  const rateCheck = checkRateLimit(
    "analyzeJob",
    rateLimitIdentity ?? "unknown",
    RATE_LIMITS.analyzeJob
  );
  if (!rateCheck.allowed) {
    return failure(
      "RATE_LIMITED",
      "Too many analysis requests. Please wait a moment and try again."
    );
  }

  // ── AI Analysis ─────────────────────────────
  try {
    const analyzed = await analyzeJobDescriptionText(trimmedDescription);
    const now = new Date().toISOString();

    // Build the database insert object
    const insertData = {
      user_id: owner.kind === "authenticated" ? owner.userId : null,
      anonymous_session_id:
        owner.kind === "anonymous" ? owner.anonymousSessionId : null,
      title: analyzed.jobTarget.title,
      company: analyzed.jobTarget.company,
      location: analyzed.jobTarget.location,
      description: analyzed.jobTarget.description,
      opportunity_type: analyzed.jobTarget.opportunityType,
      required_skills: analyzed.jobTarget.requiredSkills,
      preferred_skills: analyzed.jobTarget.preferredSkills,
      required_technologies: analyzed.jobTarget.requiredTechnologies,
      responsibilities: analyzed.jobTarget.responsibilities,
      experience_requirements: analyzed.jobTarget.experienceRequirements,
      education_requirements: analyzed.jobTarget.educationRequirements,
      soft_skills: analyzed.jobTarget.softSkills,
      domain_requirements: analyzed.jobTarget.domainRequirements,
      extracted_requirements: analyzed.jobTarget.extractedRequirements,
      parsing_status: "completed",
      parsing_model: analyzed.model,
      parsing_error: null,
    };

    // ── DEBUG: Log insert data shape + auth context ──
    if (process.env.NODE_ENV !== "production") {
      console.log("[analyzeJob] Auth context:", owner.kind);
      console.log("[analyzeJob] Insert data keys:", Object.keys(insertData).join(", "));
      console.log("[analyzeJob] user_id:", insertData.user_id ? "set" : "null");
      console.log("[analyzeJob] anonymous_session_id:", insertData.anonymous_session_id ? "set" : "null");
      console.log("[analyzeJob] title:", insertData.title);
      console.log("[analyzeJob] opportunity_type:", insertData.opportunity_type);
      console.log("[analyzeJob] arrays:", {
        required_skills: insertData.required_skills.length,
        preferred_skills: insertData.preferred_skills.length,
        required_technologies: insertData.required_technologies.length,
        responsibilities: insertData.responsibilities.length,
        soft_skills: insertData.soft_skills.length,
      });
    }

    const { data: insertedRow, error: insertError } = await supabase
      .from("job_targets")
      .insert(insertData)
      .select(JOB_TARGET_COLUMNS)
      .single();

    if (insertError || !insertedRow) {
      // ── DEBUG: Log full Supabase error details (server-side only) ──
      if (process.env.NODE_ENV !== "production" && insertError) {
        console.error("[analyzeJob] Supabase insert error:");
        console.error("  code:", insertError.code);
        console.error("  message:", insertError.message);
        console.error("  details:", insertError.details);
        console.error("  hint:", insertError.hint);
        console.error("  name:", insertError.name);
      }
      console.error("[analyzeJob] Could not save job target:", insertError);
      return failure(
        "DATABASE_FAILED",
        "The job analysis was successful but could not be saved. Please try again."
      );
    }

    // Map database row to domain JobTarget
    const jobTarget: JobTarget = mapJobTargetRow(insertedRow);

    return {
      status: "success",
      jobTargetId: insertedRow.id,
      jobTarget,
      analyzedAt: now,
      ownerType: owner.kind,
    };
  } catch (err) {
    const analyzerError =
      err instanceof JobAnalyzerError
        ? err
        : new JobAnalyzerError("AI analysis failed.", "OPENAI_FAILURE");

    return mapAnalyzerError(analyzerError);
  }
}
