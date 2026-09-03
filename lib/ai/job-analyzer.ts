import { z } from "zod";
import type { JobTarget, OpportunityType } from "@/types";
import { jobAnalysisOutputSchema } from "@/schemas";
import { runCompletion } from "./provider";
import {
  JOB_ANALYZER_SYSTEM_PROMPT,
  JOB_ANALYZER_USER_PROMPT,
} from "./prompts/job-analyzer";

export interface JobAnalyzerResult {
  jobTarget: Omit<JobTarget, "id" | "createdAt" | "updatedAt">;
  model: string;
}

export class JobAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMPTY_TEXT"
      | "TEXT_TOO_SHORT"
      | "OPENAI_FAILURE"
      | "INVALID_AI_RESPONSE"
      | "RATE_LIMIT"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "JobAnalyzerError";
  }
}

/**
 * Parse JSON from a model response. Handles plain JSON and fenced JSON.
 */
export function parseJobAnalysisJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(json);
  } catch {
    throw new JobAnalyzerError(
      "The AI returned invalid JSON. Please try again.",
      "INVALID_AI_RESPONSE"
    );
  }
}

/**
 * Normalize AI-extracted job analysis output into the canonical JobTarget shape.
 * Validates against Zod schema and applies normalization rules.
 */
export function normalizeJobTarget(
  raw: unknown,
  originalDescription: string
): Omit<JobTarget, "id" | "createdAt" | "updatedAt"> {
  const parsed = jobAnalysisOutputSchema.parse(raw);

  // Deduplicate string arrays
  const dedupe = (arr: string[]): string[] => {
    const seen = new Set<string>();
    return arr.filter((item) => {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // Trim all string values
  const trimArray = (arr: string[]): string[] =>
    arr.map((s) => s.trim()).filter((s) => s.length > 0);

  const requiredSkills = dedupe(trimArray(parsed.requiredSkills));
  const preferredSkills = dedupe(trimArray(parsed.preferredSkills));
  const requiredTechnologies = dedupe(trimArray(parsed.requiredTechnologies));
  const responsibilities = dedupe(trimArray(parsed.responsibilities));
  const experienceRequirements = dedupe(trimArray(parsed.experienceRequirements));
  const educationRequirements = dedupe(trimArray(parsed.educationRequirements));
  const softSkills = dedupe(trimArray(parsed.softSkills));
  const domainRequirements = dedupe(trimArray(parsed.domainRequirements));

  // Build extractedRequirements from all requirement categories
  const extractedRequirements = dedupe([
    ...requiredSkills,
    ...preferredSkills,
    ...requiredTechnologies,
    ...experienceRequirements,
    ...educationRequirements,
    ...softSkills,
    ...domainRequirements,
  ]);

  return {
    userId: undefined,
    anonymousSessionId: undefined,
    title: parsed.title.trim(),
    company: parsed.company.trim(),
    location: parsed.location.trim(),
    description: originalDescription,
    opportunityType: parsed.opportunityType as OpportunityType,
    requiredSkills,
    preferredSkills,
    requiredTechnologies,
    responsibilities,
    experienceRequirements,
    educationRequirements,
    softSkills,
    domainRequirements,
    extractedRequirements,
    parsingStatus: "completed",
  };
}

export function classifyJobAnalyzerError(err: unknown): JobAnalyzerError {
  if (err instanceof JobAnalyzerError) return err;

  const maybeError = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };

  if (maybeError.status === 429 || maybeError.code === "rate_limit_exceeded") {
    return new JobAnalyzerError(
      "The AI service is currently rate limited. Please try again shortly.",
      "RATE_LIMIT"
    );
  }

  if (maybeError.name === "AbortError" || maybeError.code === "ETIMEDOUT") {
    return new JobAnalyzerError(
      "The AI analysis timed out. Please try again.",
      "TIMEOUT"
    );
  }

  if (err instanceof z.ZodError) {
    console.warn(
      "[analyzeJob] AI response failed Zod validation:",
      err.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message }))
    );
    return new JobAnalyzerError(
      "The AI response did not match the required job target structure.",
      "INVALID_AI_RESPONSE"
    );
  }

  return new JobAnalyzerError(
    "The AI analysis failed. Please try again.",
    "OPENAI_FAILURE"
  );
}

/**
 * Minimum character count for a job description to be worth analyzing.
 */
const MIN_JOB_DESCRIPTION_LENGTH = 50;

/**
 * Analyze a job/internship description into a validated structured JobTarget.
 */
export async function analyzeJobDescriptionText(
  jobDescription: string
): Promise<JobAnalyzerResult> {
  const text = jobDescription.trim();

  if (!text) {
    throw new JobAnalyzerError(
      "Please paste a job or internship description to analyze.",
      "EMPTY_TEXT"
    );
  }

  if (text.length < MIN_JOB_DESCRIPTION_LENGTH) {
    throw new JobAnalyzerError(
      "This job description is too short to analyze. Please paste the complete job posting.",
      "TEXT_TOO_SHORT"
    );
  }

  try {
    const completion = await runCompletion(
      "job-analyzer",
      {
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: JOB_ANALYZER_SYSTEM_PROMPT },
          {
            role: "user",
            content: JOB_ANALYZER_USER_PROMPT.replace("{jobDescription}", text),
          },
        ],
      },
      { timeout: 45_000 }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new JobAnalyzerError(
        "The AI returned an empty response. Please try again.",
        "INVALID_AI_RESPONSE"
      );
    }

    return {
      jobTarget: normalizeJobTarget(parseJobAnalysisJson(content), text),
      model: completion.model,
    };
  } catch (err) {
    throw classifyJobAnalyzerError(err);
  }
}
