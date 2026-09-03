import { z } from "zod";
import type { CandidateProfile, Skill } from "@/types";
import { candidateProfileSchema } from "@/schemas";
import { runCompletion } from "./provider";
import {
  RESUME_ANALYZER_SYSTEM_PROMPT,
  RESUME_ANALYZER_USER_PROMPT,
} from "./prompts/resume-analyzer";

export interface ResumeAnalyzerResult {
  profile: CandidateProfile;
  model: string;
}

export class ResumeAnalyzerError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMPTY_TEXT"
      | "OPENAI_FAILURE"
      | "INVALID_AI_RESPONSE"
      | "RATE_LIMIT"
      | "TIMEOUT"
  ) {
    super(message);
    this.name = "ResumeAnalyzerError";
  }
}

/**
 * Parse JSON from a model response. Handles plain JSON and fenced JSON.
 */
export function parseCandidateProfileJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = fenced ? fenced[1] : trimmed;

  try {
    return JSON.parse(json);
  } catch {
    // ── DEBUG: Log JSON parse failure ──
    if (process.env.NODE_ENV !== "production") {
      console.error("[DEBUG parseCandidateProfileJson] JSON.parse FAILED");
      console.error("  First 200 chars:", trimmed.slice(0, 200));
    }
    throw new ResumeAnalyzerError(
      "The AI returned invalid JSON. Please try again.",
      "INVALID_AI_RESPONSE"
    );
  }
}

function stableEvidenceId(index: number): string {
  return `ev_${String(index + 1).padStart(3, "0")}`;
}

/**
 * Convert a raw skill entry (string or object) into a Skill-shaped object.
 *
 * The AI occasionally emits `technologies`, `softSkills`, or even `skills` as
 * flat string lists. This coercion keeps the Zod contract intact without
 * relaxing the schema, so downstream consumers always see a full Skill.
 */
function coerceSkillEntry(entry: unknown): unknown {
  if (typeof entry === "string") {
    return {
      name: entry.trim(),
      category: "technical",
      isMentioned: true,
      isDemonstrated: false,
      supportLevel: "mentioned",
      confidence: 0.5,
      evidenceIds: [],
      evidence: [],
    };
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    if (obj.category !== undefined) {
      return { ...obj, category: normalizeSkillCategory(obj.category) };
    }
  }
  return entry;
}

const VALID_SKILL_CATEGORIES = new Set([
  "technical",
  "soft",
  "tool",
  "language",
  "other",
]);

/**
 * Map free-form AI category labels onto the canonical SkillCategory enum.
 *
 * The model often labels React/pandas as "framework"/"library", databases as
 * "database", cloud platforms as "cloud", etc. Hard-failing the whole profile
 * on those labels would reject valid resumes, so recognizable synonyms are
 * mapped and anything unknown falls back to "other".
 */
function normalizeSkillCategory(value: unknown): string {
  if (typeof value !== "string") return "other";

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "") return "other";
  if (VALID_SKILL_CATEGORIES.has(normalized)) return normalized;

  const aliases: Record<string, string> = {
    programming_language: "language",
    programming: "language",
    languages: "language",
    framework: "technical",
    library: "technical",
    libraries: "technical",
    database: "technical",
    databases: "technical",
    web: "technical",
    web_development: "technical",
    frontend: "technical",
    front_end: "technical",
    backend: "technical",
    back_end: "technical",
    devops: "technical",
    data_analysis: "technical",
    machine_learning: "technical",
    ai: "technical",
    software: "tool",
    tools: "tool",
    platform: "tool",
    platforms: "tool",
    ide: "tool",
    cloud: "tool",
    design: "tool",
    soft_skill: "soft",
    soft_skills: "soft",
    interpersonal: "soft",
  };

  return aliases[normalized] ?? "other";
}

const SKILL_ARRAY_FIELDS = ["skills", "softSkills", "technologies"] as const;

/**
 * Recursively convert null values to undefined within objects and arrays.
 * This ensures Zod `.default()` values apply when the model explicitly
 * returns `null` for a field (e.g. `institution: null` instead of omitting it).
 * Depth-limited to avoid stack issues.
 */
function nullsToUndefined(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return undefined;
  if (depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => nullsToUndefined(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = nullsToUndefined(v, depth + 1);
    }
    return out;
  }
  return value;
}

function preprocessSkillArrays(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  // First pass: recursively convert null → undefined so Zod defaults apply
  const cleaned = nullsToUndefined(raw) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...cleaned };

  // Filter out undefined/null elements from arrays (the model occasionally
  // inserts null items inside education, experience, projects, etc.)
  const ARRAY_FIELDS = [
    "education", "experience", "projects", "skills", "softSkills",
    "technologies", "certifications", "achievements", "languages",
    "evidence", "potentialIssues",
  ] as const;
  for (const field of ARRAY_FIELDS) {
    const value = out[field];
    if (Array.isArray(value)) {
      out[field] = value.filter((item) => item !== null && item !== undefined);
    }
  }

  for (const field of SKILL_ARRAY_FIELDS) {
    const value = out[field];
    if (Array.isArray(value)) {
      out[field] = value.map(coerceSkillEntry);
    }
  }

  // Normalize certifications[].url — the model often returns bare
  // "example.com/..." or "linkedin.com/..." without a scheme.
  if (Array.isArray(out.certifications)) {
    out.certifications = (out.certifications as unknown[]).map((cert) => {
      if (!cert || typeof cert !== "object") return cert;
      const c = { ...(cert as Record<string, unknown>) };
      if (typeof c.url === "string" && c.url.length > 0) {
        c.url = ensureUrlScheme(c.url);
      }
      return c;
    });
  }

  // Normalize links.linkedin / .github / .portfolio the same way.
  if (out.links && typeof out.links === "object" && !Array.isArray(out.links)) {
    const links = { ...(out.links as Record<string, unknown>) };
    for (const key of ["linkedin", "github", "portfolio"] as const) {
      const v = links[key];
      if (typeof v === "string" && v.length > 0) {
        links[key] = ensureUrlScheme(v);
      }
    }
    out.links = links;
  }

  return out;
}

/**
 * Ensure a URL string has an http(s) scheme.
 * Returns "" for non-string/empty input so the URL-or-empty Zod rule accepts it.
 */
function ensureUrlScheme(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function uniqueByName(skills: Skill[]): Skill[] {
  const map = new Map<string, Skill>();

  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...skill, name: skill.name.trim() });
      continue;
    }

    map.set(key, {
      ...existing,
      isMentioned: existing.isMentioned || skill.isMentioned,
      isDemonstrated: existing.isDemonstrated || skill.isDemonstrated,
      supportLevel:
        existing.supportLevel === "demonstrated" || skill.supportLevel === "demonstrated"
          ? "demonstrated"
          : existing.supportLevel,
      confidence: Math.max(existing.confidence, skill.confidence),
      evidenceIds: Array.from(new Set([...existing.evidenceIds, ...skill.evidenceIds])),
      evidence: [...existing.evidence, ...skill.evidence],
    });
  }

  return Array.from(map.values());
}

/**
 * Zod-validate and normalize a raw AI output into the canonical CandidateProfile.
 */
export function normalizeCandidateProfile(raw: unknown): CandidateProfile {
  // Coerce any string-only skill entries (technologies / softSkills / skills)
  // into Skill objects BEFORE Zod validation, so the schema stays strict.
  const preprocessed = preprocessSkillArrays(raw);

  // ── DEBUG: Log preprocessed keys before Zod ──
  if (process.env.NODE_ENV !== "production") {
    if (preprocessed && typeof preprocessed === "object" && !Array.isArray(preprocessed)) {
      const o = preprocessed as Record<string, unknown>;
      console.log("[DEBUG normalizeCandidateProfile] preprocessed keys:", Object.keys(o).join(", "));
      for (const [k, v] of Object.entries(o)) {
        if (Array.isArray(v)) console.log(`  ${k}: Array(${v.length})`);
        else console.log(`  ${k}: ${typeof v}`);
      }
    }
  }

  let parsed;
  try {
    parsed = candidateProfileSchema.parse(preprocessed);
  } catch (err) {
    // ── DEBUG: Log full Zod error details (dev only — issue payloads can
    // echo AI output values, which contain resume content) ──
    if (process.env.NODE_ENV !== "production" && err instanceof z.ZodError) {
      console.error("[DEBUG normalizeCandidateProfile] Zod validation FAILED:");
      console.error("  Total issues:", err.issues.length);
      for (const issue of err.issues) {
        console.error(`  Path: ${issue.path.join(".")}, Code: ${issue.code}, Message: ${issue.message}`);
        if ("expected" in issue) console.error(`    Expected: ${(issue as { expected: unknown }).expected}`);
        if ("received" in issue) console.error(`    Received: ${(issue as { received: unknown }).received}`);
      }
    }
    throw err;
  }

  // ── DEBUG: Log Zod success ──
  if (process.env.NODE_ENV !== "production") {
    console.log("[DEBUG normalizeCandidateProfile] Zod validation PASSED");
  }

  const evidence = parsed.evidence.map((item, index) => ({
    ...item,
    id: item.id || stableEvidenceId(index),
    text: item.text.trim(),
  }));
  const evidenceIds = new Set(evidence.map((item) => item.id));

  const normalizeSkill = (skill: Skill): Skill => {
    const usableEvidenceIds = skill.evidenceIds.filter((id) => evidenceIds.has(id));
    const hasInlineEvidence = skill.evidence.some((item) => item.text.trim().length > 0);
    const hasEvidence = usableEvidenceIds.length > 0 || hasInlineEvidence;

    const isDemonstrated = skill.isDemonstrated && hasEvidence;
    const supportLevel = isDemonstrated
      ? "demonstrated"
      : hasEvidence
        ? "weak_evidence"
        : skill.isMentioned
          ? "mentioned"
          : "unknown";

    return {
      ...skill,
      name: skill.name.trim(),
      isMentioned: true,
      isDemonstrated,
      supportLevel,
      confidence: Math.min(1, Math.max(0, skill.confidence)),
      evidenceIds: usableEvidenceIds,
      evidence: skill.evidence.filter((item) => item.text.trim().length > 0),
    };
  };

  const skills = uniqueByName(parsed.skills.map(normalizeSkill));
  const softSkills = uniqueByName(
    (parsed.softSkills.length
      ? parsed.softSkills
      : skills.filter((skill) => skill.category === "soft")
    ).map(normalizeSkill)
  );
  const technologies = uniqueByName(
    (parsed.technologies.length
      ? parsed.technologies
      : skills.filter((skill) =>
          ["technical", "tool", "language"].includes(skill.category)
        )
    ).map(normalizeSkill)
  );

  const unsupportedIssues = skills
    .filter((skill) => skill.isMentioned && !skill.isDemonstrated && skill.evidenceIds.length === 0)
    .map((skill) => ({
      type: "missing_evidence" as const,
      message: `${skill.name} is mentioned but not demonstrated with concrete resume evidence.`,
      relatedSkill: skill.name,
      severity: "low" as const,
    }));

  return {
    ...parsed,
    fullName: (parsed.fullName || "").trim(),
    email: (parsed.email || "").trim(),
    phone: (parsed.phone || "").trim(),
    location: (parsed.location || "").trim(),
    summary: (parsed.summary || "").trim(),
    evidence,
    skills,
    softSkills,
    technologies,
    potentialIssues: [...parsed.potentialIssues, ...unsupportedIssues],
  };
}

export function classifyOpenAIError(err: unknown): ResumeAnalyzerError {
  // ── DEBUG: Log raw error type ──
  if (process.env.NODE_ENV !== "production") {
    console.log("[DEBUG classifyOpenAIError] Error type:", err?.constructor?.name ?? typeof err);
    if (err instanceof z.ZodError) {
      console.log("  ZodError issues:", err.issues.length);
    } else if (err instanceof Error) {
      console.log("  Error message:", err.message.slice(0, 200));
    }
  }

  if (err instanceof ResumeAnalyzerError) return err;

  const maybeError = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };

  if (maybeError.status === 429 || maybeError.code === "rate_limit_exceeded") {
    return new ResumeAnalyzerError(
      "The AI service is currently rate limited. Please try again shortly.",
      "RATE_LIMIT"
    );
  }

  if (maybeError.name === "AbortError" || maybeError.code === "ETIMEDOUT") {
    return new ResumeAnalyzerError(
      "The AI analysis timed out. Please try again.",
      "TIMEOUT"
    );
  }

  if (err instanceof z.ZodError) {
    // Log Zod issue paths to server log for troubleshooting (no credentials).
    console.warn(
      "[analyzeResume] AI response failed Zod validation:",
      err.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message }))
    );
    return new ResumeAnalyzerError(
      "The AI response did not match the required profile structure.",
      "INVALID_AI_RESPONSE"
    );
  }

  return new ResumeAnalyzerError(
    "The AI analysis failed. Please try again.",
    "OPENAI_FAILURE"
  );
}

/**
 * Maximum number of times to retry the OpenAI call when the response fails
 * JSON parsing or Zod validation.  The model is non-deterministic so a
 * single retry often produces a conforming response.
 */
const MAX_VALIDATION_RETRIES = 1;

/**
 * Single AI call + parse + validate.  Throws on any failure so the
 * caller can decide whether to retry.
 */
async function callAndValidate(
  text: string
): Promise<{ profile: CandidateProfile; model: string }> {
  const completion = await runCompletion(
    "resume-analyzer",
    {
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RESUME_ANALYZER_SYSTEM_PROMPT },
        {
          role: "user",
          content: RESUME_ANALYZER_USER_PROMPT.replace("{resumeText}", text),
        },
      ],
    },
    { timeout: 45_000 }
  );

  const content = completion.choices[0]?.message?.content;

  // ── DEBUG: Log raw AI response metadata ──
  if (process.env.NODE_ENV !== "production") {
    console.log("[DEBUG analyzeResumeText] AI response:");
    console.log("  model:", completion.model);
    console.log("  finish_reason:", completion.choices[0]?.finish_reason);
    console.log("  content_length:", content?.length ?? 0);
    console.log("  has_content:", !!content);
  }

  if (!content) {
    throw new ResumeAnalyzerError(
      "The AI returned an empty response. Please try again.",
      "INVALID_AI_RESPONSE"
    );
  }

  return {
    profile: normalizeCandidateProfile(parseCandidateProfileJson(content)),
    model: completion.model,
  };
}

/**
 * Analyze extracted resume text into a validated CandidateProfile.
 *
 * Retries up to MAX_VALIDATION_RETRIES times when the model returns output
 * that fails JSON parsing or Zod validation.  Non-validation errors
 * (network failures, rate limits, timeouts) are NOT retried.
 */
export async function analyzeResumeText(
  resumeText: string
): Promise<ResumeAnalyzerResult> {
  const text = resumeText.trim();

  if (text.length < 50) {
    throw new ResumeAnalyzerError(
      "This resume does not contain enough extracted text to analyze.",
      "EMPTY_TEXT"
    );
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_VALIDATION_RETRIES; attempt++) {
    try {
      if (attempt > 0 && process.env.NODE_ENV !== "production") {
        console.log(`[DEBUG analyzeResumeText] Retry attempt ${attempt}/${MAX_VALIDATION_RETRIES}`);
      }
      return await callAndValidate(text);
    } catch (err) {
      lastError = err;

      // Only retry on validation failures (JSON parse or Zod).
      // Do NOT retry network errors, rate limits, timeouts, or empty text.
      const isValidationFailure =
        err instanceof z.ZodError ||
        (err instanceof ResumeAnalyzerError && err.code === "INVALID_AI_RESPONSE");

      if (!isValidationFailure || attempt >= MAX_VALIDATION_RETRIES) {
        break;
      }

      // Log retry decision in development
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[DEBUG analyzeResumeText] Validation failed on attempt ${attempt + 1}, retrying...`
        );
      }
    }
  }

  throw classifyOpenAIError(lastError);
}
