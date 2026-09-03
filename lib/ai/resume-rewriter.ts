/**
 * Resume rewrite engine — generates job-specific rewrite suggestions
 * using structured AI output (provider-agnostic) with evidence validation.
 *
 * Pipeline:
 *   CandidateProfile + JobTarget + Analysis
 *   → AI structured output (runCompletion)
 *   → Zod validation (aiRewriteOutputSchema)
 *   → Evidence ID validation
 *   → RewriteSuggestion[]
 *
 * Follows the same patterns as job-analyzer.ts and resume-analyzer.ts.
 */

import { z } from "zod";
import crypto from "crypto";
import type {
  CandidateProfile,
  JobTarget,
  SkillGap,
  RewriteSuggestion,
} from "@/types";
import { aiRewriteOutputSchema } from "@/schemas";
import { runCompletion } from "./provider";
import {
  RESUME_REWRITER_SYSTEM_PROMPT,
  RESUME_REWRITER_USER_PROMPT,
} from "./prompts/resume-rewriter";
import { validateAllSuggestionEvidence } from "@/lib/rewrite/evidence-validator";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface RewriteAnalyzerResult {
  suggestions: RewriteSuggestion[];
  model: string;
}

export class RewriteAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMPTY_PROFILE"
      | "OPENAI_FAILURE"
      | "INVALID_AI_RESPONSE"
      | "RATE_LIMIT"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "RewriteAnalyzerError";
  }
}

// ──────────────────────────────────────────────
// JSON parsing
// ──────────────────────────────────────────────

export function parseRewriteJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(json);
  } catch {
    throw new RewriteAnalyzerError(
      "The AI returned invalid JSON. Please try again.",
      "INVALID_AI_RESPONSE"
    );
  }
}

// ──────────────────────────────────────────────
// Prompt template population
// ──────────────────────────────────────────────

function formatExperience(profile: CandidateProfile): string {
  if (profile.experience.length === 0) return "No professional experience listed.";
  return profile.experience
    .map(
      (exp, i) =>
        `[${i}] ${exp.role} at ${exp.company} (${exp.startDate} – ${exp.endDate})\n    ${exp.description}\n    Highlights: ${exp.highlights.join("; ") || "none"}\n    Technologies: ${exp.technologies.join(", ") || "none"}`
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
        `[${i}] ${edu.degree} in ${edu.field} at ${edu.institution} (${edu.startDate} – ${edu.endDate})${edu.coursework.length > 0 ? `\n    Coursework: ${edu.coursework.join(", ")}` : ""}`
    )
    .join("\n\n");
}

/**
 * All skills in one deduplicated list. The resume analyzer intentionally
 * puts technical skills in BOTH profile.skills and profile.technologies,
 * so merging without dedup would send every technical skill twice.
 * supportLevel already encodes demonstrated vs mentioned.
 */
function formatAllSkills(profile: CandidateProfile): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of [...profile.skills, ...profile.softSkills, ...profile.technologies]) {
    const key = s.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    parts.push(`${s.name} (${s.supportLevel})`);
  }
  if (parts.length === 0) return "No skills listed.";
  return parts.join(", ");
}

function formatCertifications(profile: CandidateProfile): string {
  if (profile.certifications.length === 0) return "No certifications listed.";
  return profile.certifications
    .map((c, i) => `[${i}] ${c.name} — ${c.issuer} (${c.date})`)
    .join("\n");
}

/**
 * Evidence records whose text is NOT already shown verbatim in the
 * Experience/Projects sections of the prompt. Everything else the model
 * may quote is already present above, so re-listing it would double the
 * context size without adding information. Evidence validation runs
 * against the full profile regardless of what the prompt contains.
 */
function formatEvidenceMap(profile: CandidateProfile): string {
  const shown = new Set<string>();
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  for (const exp of profile.experience) {
    if (exp.description) shown.add(normalize(exp.description));
    for (const h of exp.highlights) shown.add(normalize(h));
  }
  for (const proj of profile.projects) {
    if (proj.description) shown.add(normalize(proj.description));
    for (const h of proj.highlights) shown.add(normalize(h));
  }

  const lines = profile.evidence
    .filter((ev) => ev.text.trim().length > 0 && !shown.has(normalize(ev.text)))
    .map((ev) => `  - [${ev.source}] ${ev.text}`);

  if (lines.length === 0) {
    return "None — all evidence text is already shown in the profile sections above.";
  }
  return lines.join("\n");
}

function formatGaps(gaps: SkillGap[]): { matched: string; missing: string } {
  const matched = gaps
    .filter((g) => g.present)
    .map((g) => g.skill)
    .join(", ") || "none";
  const missing = gaps
    .filter((g) => !g.present)
    .map((g) => g.skill)
    .join(", ") || "none";
  return { matched, missing };
}

function buildUserPrompt(
  profile: CandidateProfile,
  job: JobTarget,
  gaps: SkillGap[],
  strengths: string[],
  weaknesses: string[],
  score: number
): string {
  const { matched, missing } = formatGaps(gaps);

  return RESUME_REWRITER_USER_PROMPT
    .replace("{candidateName}", profile.fullName || "Candidate")
    .replace("{candidateSummary}", profile.summary || "No summary provided.")
    .replace("{candidateExperience}", formatExperience(profile))
    .replace("{candidateProjects}", formatProjects(profile))
    .replace("{candidateEducation}", formatEducation(profile))
    .replace("{candidateSkills}", formatAllSkills(profile))
    .replace("{candidateCertifications}", formatCertifications(profile))
    .replace("{evidenceMap}", formatEvidenceMap(profile))
    .replace("{jobTitle}", job.title || "Not specified")
    .replace("{jobCompany}", job.company || "Not specified")
    .replace("{jobOpportunityType}", job.opportunityType)
    .replace("{jobRequiredSkills}", job.requiredSkills.join(", ") || "none")
    .replace("{jobPreferredSkills}", job.preferredSkills.join(", ") || "none")
    .replace("{jobRequiredTechnologies}", job.requiredTechnologies.join(", ") || "none")
    .replace("{jobSoftSkills}", job.softSkills.join(", ") || "none")
    .replace("{jobResponsibilities}", job.responsibilities.join("; ") || "none")
    .replace("{jobEducationRequirements}", job.educationRequirements.join("; ") || "none")
    .replace("{jobExperienceRequirements}", job.experienceRequirements.join("; ") || "none")
    .replace("{matchScore}", String(Math.round(score)))
    .replace("{matchedSkills}", matched)
    .replace("{missingSkills}", missing)
    .replace("{strengths}", strengths.join("; ") || "none identified")
    .replace("{weaknesses}", weaknesses.join("; ") || "none identified");
}

// ──────────────────────────────────────────────
// Normalization
// ──────────────────────────────────────────────

/**
 * Generate a deterministic UUID-like ID for each suggestion.
 */
function generateSuggestionId(index: number): string {
  const hash = crypto
    .createHash("md5")
    .update(`suggestion-${index}-${Date.now()}`)
    .digest("hex");
  // Format as UUID v4 shape
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Normalize AI output into canonical RewriteSuggestion[].
 * Assigns IDs, sets status to "pending", validates evidence.
 */
export function normalizeRewriteOutput(
  raw: unknown,
  profile: CandidateProfile
): RewriteSuggestion[] {
  const parsed = aiRewriteOutputSchema.parse(raw);

  // Assign IDs and default status
  const suggestions: RewriteSuggestion[] = parsed.suggestions.map((s, i) => ({
    id: generateSuggestionId(i),
    section: s.section,
    sectionIndex: s.sectionIndex,
    originalText: s.originalText.trim(),
    suggestedText: s.suggestedText.trim(),
    reason: s.reason.trim(),
    supportingEvidence: s.supportingEvidence.map((e) => e.trim()).filter(Boolean),
    relatedJobRequirements: s.relatedJobRequirements.map((r) => r.trim()).filter(Boolean),
    confidence: s.confidence,
    status: "pending" as const,
  }));

  // Validate evidence against the profile
  const validated = validateAllSuggestionEvidence(suggestions, profile);

  // Filter out suggestions with no remaining evidence that make factual claims
  return validated.filter((s) => {
    // Keep if it has evidence OR if it's a stylistic/formatting suggestion
    // (stylistic suggestions typically have very short originalText)
    if (s.supportingEvidence.length > 0) return true;
    if (s.originalText.length < 50) return true;
    // Log dropped suggestion
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[rewrite] Dropped ${s.section} suggestion — no valid evidence after validation`
      );
    }
    return false;
  });
}

// ──────────────────────────────────────────────
// Error classification
// ──────────────────────────────────────────────

export function classifyRewriteError(err: unknown): RewriteAnalyzerError {
  if (err instanceof RewriteAnalyzerError) return err;

  const maybeError = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };

  if (maybeError.status === 429 || maybeError.code === "rate_limit_exceeded") {
    return new RewriteAnalyzerError(
      "The AI service is currently rate limited. Please try again shortly.",
      "RATE_LIMIT"
    );
  }

  if (maybeError.name === "AbortError" || maybeError.code === "ETIMEDOUT") {
    return new RewriteAnalyzerError(
      "The AI rewrite timed out. Please try again.",
      "TIMEOUT"
    );
  }

  if (err instanceof z.ZodError) {
    console.warn(
      "[rewrite] AI response failed Zod validation:",
      err.issues
        .slice(0, 5)
        .map((i) => ({ path: i.path.join("."), message: i.message }))
    );
    return new RewriteAnalyzerError(
      "The AI response did not match the required rewrite structure.",
      "INVALID_AI_RESPONSE"
    );
  }

  return new RewriteAnalyzerError(
    "The AI rewrite failed. Please try again.",
    "OPENAI_FAILURE"
  );
}

// ──────────────────────────────────────────────
// Main rewrite function
// ──────────────────────────────────────────────

/**
 * Generate job-specific resume rewrite suggestions.
 *
 * @param profile  - The candidate's structured profile
 * @param job      - The target job
 * @param gaps     - Skill gap analysis results
 * @param strengths - Analysis strengths
 * @param weaknesses - Analysis weaknesses
 * @param score    - Overall match score (0–100)
 */
export async function rewriteResume(
  profile: CandidateProfile,
  job: JobTarget,
  gaps: SkillGap[],
  strengths: string[],
  weaknesses: string[],
  score: number
): Promise<RewriteAnalyzerResult> {
  // Validate we have enough profile data
  const hasExperience = profile.experience.length > 0;
  const hasProjects = profile.projects.length > 0;
  const hasSummary = profile.summary.length > 0;

  if (!hasExperience && !hasProjects && !hasSummary) {
    throw new RewriteAnalyzerError(
      "The candidate profile has insufficient content to rewrite. Please ensure your resume contains experience, projects, or a summary.",
      "EMPTY_PROFILE"
    );
  }

  try {
    const userPrompt = buildUserPrompt(
      profile,
      job,
      gaps,
      strengths,
      weaknesses,
      score
    );

    const completion = await runCompletion(
      "resume-rewriter",
      {
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: RESUME_REWRITER_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 60_000 }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new RewriteAnalyzerError(
        "The AI returned an empty response. Please try again.",
        "INVALID_AI_RESPONSE"
      );
    }

    const rawOutput = parseRewriteJson(content);
    const suggestions = normalizeRewriteOutput(rawOutput, profile);

    return {
      suggestions,
      model: completion.model,
    };
  } catch (err) {
    throw classifyRewriteError(err);
  }
}
