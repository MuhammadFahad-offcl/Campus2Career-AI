/**
 * Skill Bridge generator — turns priority skill gaps into a
 * structured 7-day action plan using structured OpenAI output.
 *
 * Pipeline:
 *   CandidateProfile + JobTarget + Analysis gaps
 *   → OpenAI structured output
 *   → Zod validation (aiSkillBridgeOutputSchema)
 *   → Day repair (sort/dedupe/truncate) + priority skill filtering
 *   → SkillBridgeDay[] + PrioritySkill[]
 *
 * Follows the same patterns as resume-rewriter.ts.
 */

import { z } from "zod";
import type {
  CandidateProfile,
  JobTarget,
  SkillGap,
  PrioritySkill,
  SkillBridgeDay,
} from "@/types";
import { aiSkillBridgeOutputSchema } from "@/schemas";
import { runCompletion } from "./provider";
import {
  SKILL_BRIDGE_SYSTEM_PROMPT,
  SKILL_BRIDGE_USER_PROMPT,
} from "./prompts/skill-bridge";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SkillBridgeResult {
  prioritySkills: PrioritySkill[];
  days: SkillBridgeDay[];
  model: string;
}

export class SkillBridgeGeneratorError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "NO_GAPS"
      | "OPENAI_FAILURE"
      | "INVALID_AI_RESPONSE"
      | "RATE_LIMIT"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "SkillBridgeGeneratorError";
  }
}

// ──────────────────────────────────────────────
// JSON parsing
// ──────────────────────────────────────────────

export function parseSkillBridgeJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(json);
  } catch {
    throw new SkillBridgeGeneratorError(
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

/**
 * Skills for the bridge prompt in one deduplicated list. The resume
 * analyzer intentionally puts technical skills in BOTH profile.skills and
 * profile.technologies, so concatenating without dedup would send every
 * technical skill to the model twice. supportLevel already encodes
 * demonstrated vs mentioned.
 */
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

  return SKILL_BRIDGE_USER_PROMPT
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
 * Filter AI-proposed priority skills to only those that match an
 * ACTUAL missing gap from the analysis. This is the programmatic
 * anti-hallucination guard — the AI cannot smuggle in a skill the
 * candidate already has or a skill unrelated to the real gaps.
 */
export function filterPrioritySkills(
  prioritySkills: PrioritySkill[],
  gaps: SkillGap[]
): PrioritySkill[] {
  const missingSkills = gaps
    .filter((g) => !g.present)
    .map((g) => g.skill.trim().toLowerCase());

  return prioritySkills.filter((p) =>
    missingSkills.some((m) => m === p.skill.trim().toLowerCase())
  );
}

/**
 * Normalize AI output into canonical SkillBridgeDay[].
 *
 * Repair steps (controlled, not silent acceptance):
 * - Sort days by day number
 * - Deduplicate day numbers (keep first occurrence)
 * - Truncate to exactly 7 days if more
 * - Reject with INVALID_AI_RESPONSE if fewer than 7 remain
 * - Assign status "pending" to each day
 */
export function normalizeSkillBridgeOutput(
  raw: unknown,
  gaps: SkillGap[]
): { prioritySkills: PrioritySkill[]; days: SkillBridgeDay[] } {
  const parsed = aiSkillBridgeOutputSchema.parse(raw);

  // Repair day ordering: sort by day number
  const sorted = [...parsed.days].sort((a, b) => a.day - b.day);

  // Deduplicate day numbers (keep first occurrence)
  const seenDays = new Set<number>();
  const deduped = sorted.filter((d) => {
    if (seenDays.has(d.day)) return false;
    seenDays.add(d.day);
    return true;
  });

  // Truncate to 7 days if more
  const truncated = deduped.slice(0, 7);

  if (truncated.length < 7) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[skill-bridge] AI returned only ${truncated.length} valid day(s) — rejecting incomplete plan`
      );
    }
    throw new SkillBridgeGeneratorError(
      "The AI returned an incomplete plan. Please try again.",
      "INVALID_AI_RESPONSE"
    );
  }

  // Re-sequence day numbers to exactly 1-7 (handles gaps like 1,2,4,5,6,7,8)
  const days: SkillBridgeDay[] = truncated.map((d, i) => ({
    day: i + 1,
    title: d.title.trim(),
    task: d.task.trim(),
    reason: d.reason.trim(),
    expectedEvidence: d.expectedEvidence.trim(),
    estimatedMinutes: d.estimatedMinutes,
    status: "pending" as const,
  }));

  // Anti-hallucination guard: only allow priority skills that match
  // actual missing gaps from the analysis
  const prioritySkills = filterPrioritySkills(parsed.prioritySkills, gaps);

  if (prioritySkills.length === 0) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[skill-bridge] AI priority skills did not match any actual missing gap — defaulting to top missing gaps"
      );
    }
    // Fallback: derive priority skills from the actual missing gaps
    const topMissing = gaps.filter((g) => !g.present).slice(0, 3);
    if (topMissing.length === 0) {
      throw new SkillBridgeGeneratorError(
        "No skill gaps available to build a plan.",
        "NO_GAPS"
      );
    }
    return {
      prioritySkills: topMissing.map((g) => ({
        skill: g.skill,
        reason: `Missing from the candidate profile for this role.`,
      })),
      days,
    };
  }

  return { prioritySkills, days };
}

// ──────────────────────────────────────────────
// Error classification
// ──────────────────────────────────────────────

export function classifySkillBridgeError(err: unknown): SkillBridgeGeneratorError {
  if (err instanceof SkillBridgeGeneratorError) return err;

  const maybeError = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };

  if (maybeError.status === 429 || maybeError.code === "rate_limit_exceeded") {
    return new SkillBridgeGeneratorError(
      "The AI service is currently rate limited. Please try again shortly.",
      "RATE_LIMIT"
    );
  }

  if (maybeError.name === "AbortError" || maybeError.code === "ETIMEDOUT") {
    return new SkillBridgeGeneratorError(
      "The skill bridge generation timed out. Please try again.",
      "TIMEOUT"
    );
  }

  if (err instanceof z.ZodError) {
    console.warn(
      "[skill-bridge] AI response failed Zod validation:",
      err.issues
        .slice(0, 5)
        .map((i) => ({ path: i.path.join("."), message: i.message }))
    );
    return new SkillBridgeGeneratorError(
      "The AI response did not match the required plan structure.",
      "INVALID_AI_RESPONSE"
    );
  }

  return new SkillBridgeGeneratorError(
    "The skill bridge generation failed. Please try again.",
    "OPENAI_FAILURE"
  );
}

// ──────────────────────────────────────────────
// Main generation function
// ──────────────────────────────────────────────

/**
 * Generate a 7-day skill bridge plan for the highest-impact gaps.
 *
 * @param profile    - The candidate's structured profile
 * @param job        - The target job
 * @param gaps       - Skill gap analysis results
 * @param strengths  - Analysis strengths
 * @param weaknesses - Analysis weaknesses
 * @param score      - Overall match score (0–100)
 */
export async function generateSkillBridge(
  profile: CandidateProfile,
  job: JobTarget,
  gaps: SkillGap[],
  strengths: string[],
  weaknesses: string[],
  score: number
): Promise<SkillBridgeResult> {
  // Validate there are gaps to work with
  const missingGaps = gaps.filter((g) => !g.present);
  if (missingGaps.length === 0) {
    throw new SkillBridgeGeneratorError(
      "No skill gaps found for this job — a skill bridge plan is not needed.",
      "NO_GAPS"
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
      "skill-bridge",
      {
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SKILL_BRIDGE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      },
      { timeout: 60_000 }
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new SkillBridgeGeneratorError(
        "The AI returned an empty response. Please try again.",
        "INVALID_AI_RESPONSE"
      );
    }

    const rawOutput = parseSkillBridgeJson(content);
    const { prioritySkills, days } = normalizeSkillBridgeOutput(rawOutput, gaps);

    return {
      prioritySkills,
      days,
      model: completion.model,
    };
  } catch (err) {
    throw classifySkillBridgeError(err);
  }
}
