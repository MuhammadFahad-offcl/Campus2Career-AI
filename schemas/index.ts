/**
 * Zod base schemas for Campus2Career AI domain entities.
 *
 * These schemas provide runtime validation for data entering and leaving
 * the system. They mirror the TypeScript types in @/types/domain.
 *
 * Usage:
 *   import { skillSchema, candidateProfileSchema } from "@/schemas";
 *   const parsed = candidateProfileSchema.parse(data);
 */
import { z } from "zod";

// ──────────────────────────────────────────────
// Evidence-Aware Skill Schemas
// ──────────────────────────────────────────────

const optionalUrlSchema = z.union([z.string().url(), z.literal("")]).optional();

export const evidenceSourceSchema = z.enum([
  "project",
  "work_experience",
  "education",
  "coursework",
  "certification",
  "achievement",
  "other_resume_section",
]);

export const confidenceLevelSchema = z.enum(["high", "medium", "low", "unknown"]);

export const skillCategorySchema = z.enum([
  "technical",
  "soft",
  "tool",
  "language",
  "other",
]);

export const skillSupportLevelSchema = z.enum([
  "demonstrated",
  "mentioned",
  "weak_evidence",
  "no_evidence",
  "unknown",
]);

export const candidateEvidenceSchema = z.object({
  id: z.string().min(1).max(80),
  source: evidenceSourceSchema,
  text: z.string().min(1).max(1000),
  relatedEntityName: z.string().max(200).optional(),
  confidence: confidenceLevelSchema,
});

export const skillEvidenceSchema = z.object({
  text: z.string().min(1).max(1000),
  source: evidenceSourceSchema,
  confidence: confidenceLevelSchema,
});

export const skillSchema = z.object({
  name: z.string().min(1).max(100),
  category: skillCategorySchema.default("technical"),
  isMentioned: z.boolean(),
  isDemonstrated: z.boolean(),
  supportLevel: skillSupportLevelSchema.default("unknown"),
  confidence: z.number().min(0).max(1).default(0),
  evidenceIds: z.array(z.string().min(1)).default([]),
  evidence: z.array(skillEvidenceSchema).default([]),
});

/**
 * Flexible skill input that accepts either a full Skill object or a plain
 * string name. This absorbs the common AI behaviour where `technologies`
 * and `softSkills` are returned as a flat string list.
 *
 * Normalization later expands plain names into canonical Skill objects.
 */
export const flexibleSkillSchema = z.union([
  skillSchema,
  z.string().transform((name) => ({
    name: name.trim(),
    category: "technical" as const,
    isMentioned: true,
    isDemonstrated: false,
    supportLevel: "mentioned" as const,
    confidence: 0.5,
    evidenceIds: [] as string[],
    evidence: [] as { text: string; source: EvidenceSource; confidence: ConfidenceLevel }[],
  })),
]);

type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;

// ──────────────────────────────────────────────
// Candidate Profile Schemas
// ──────────────────────────────────────────────

export const educationSchema = z.object({
  institution: z.string().max(200).default(""),
  degree: z.string().max(200).default(""),
  field: z.string().max(200).default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  gpa: z.string().optional(),
  coursework: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
});

export const experienceSchema = z.object({
  company: z.string().max(200).default(""),
  role: z.string().max(200).default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  description: z.string().default(""),
  highlights: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
});

export const projectSchema = z.object({
  name: z.string().max(200).default(""),
  description: z.string().default(""),
  technologies: z.array(z.string()).default([]),
  highlights: z.array(z.string()).default([]),
  links: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
});

export const certificationSchema = z.object({
  name: z.string().max(200).default(""),
  issuer: z.string().max(200).default(""),
  date: z.string().default(""),
  url: optionalUrlSchema,
});

export const achievementSchema = z.object({
  title: z.string().max(200).default(""),
  description: z.string().default(""),
  date: z.string().default(""),
  evidenceIds: z.array(z.string()).default([]),
});

export const potentialIssueSchema = z.object({
  type: z.enum([
    "unsupported_claim",
    "unclear_information",
    "missing_evidence",
    "other",
  ]),
  message: z.string().min(1).max(500),
  relatedSkill: z.string().max(100).optional(),
  severity: z.enum(["low", "medium", "high"]),
});

export const profileLinksSchema = z.object({
  linkedin: optionalUrlSchema,
  github: optionalUrlSchema,
  portfolio: optionalUrlSchema,
  other: z.array(z.string()).default([]),
});

export const candidateProfileSchema = z.object({
  fullName: z.string().max(200).default(""),
  email: z.union([z.string().email(), z.literal("")]).default(""),
  phone: z.string().default(""),
  location: z.string().default(""),
  summary: z.string().default(""),
  education: z.array(educationSchema).default([]),
  experience: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  skills: z.array(skillSchema).default([]),
  softSkills: z.array(skillSchema).default([]),
  technologies: z.array(skillSchema).default([]),
  certifications: z.array(certificationSchema).default([]),
  achievements: z.array(achievementSchema).default([]),
  languages: z.array(z.string()).default([]),
  links: profileLinksSchema.default({ other: [] }),
  evidence: z.array(candidateEvidenceSchema).default([]),
  potentialIssues: z.array(potentialIssueSchema).default([]),
});

export type CandidateProfileInput = z.input<typeof candidateProfileSchema>;
export type CandidateProfileOutput = z.output<typeof candidateProfileSchema>;

// ──────────────────────────────────────────────
// Resume File & Text Schemas
// ──────────────────────────────────────────────

export const documentFormatSchema = z.enum(["pdf", "docx"]);

export const resumeFileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  fileName: z.string().min(1),
  format: documentFormatSchema,
  sizeBytes: z.number().int().positive(),
  storagePath: z.string().min(1),
  uploadedAt: z.string().datetime(),
});

export const resumeTextSchema = z.object({
  resumeId: z.string().uuid(),
  rawText: z.string().min(1),
  pageCount: z.number().int().positive(),
  extractedAt: z.string().datetime(),
});

// ──────────────────────────────────────────────
// Job Target Schemas
// ──────────────────────────────────────────────

export const opportunityTypeSchema = z.enum([
  "internship",
  "full-time",
  "part-time",
  "unknown",
]);

export const parsingStatusSchema = z.enum(["pending", "completed", "failed"]);

/**
 * Schema for AI-extracted job analysis output.
 * This validates the structured output from OpenAI before normalization.
 */
export const jobAnalysisOutputSchema = z.object({
  title: z.string().max(300).default(""),
  company: z.string().max(200).default(""),
  location: z.string().max(300).default(""),
  opportunityType: opportunityTypeSchema.default("unknown"),
  requiredSkills: z.array(z.string().max(200)).default([]),
  preferredSkills: z.array(z.string().max(200)).default([]),
  requiredTechnologies: z.array(z.string().max(200)).default([]),
  responsibilities: z.array(z.string().max(500)).default([]),
  experienceRequirements: z.array(z.string().max(500)).default([]),
  educationRequirements: z.array(z.string().max(500)).default([]),
  softSkills: z.array(z.string().max(200)).default([]),
  domainRequirements: z.array(z.string().max(500)).default([]),
  extractedRequirements: z.array(z.string().max(500)).default([]),
});

export type JobAnalysisOutput = z.output<typeof jobAnalysisOutputSchema>;

/**
 * Full persisted JobTarget schema.
 */
export const jobTargetSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().optional().nullable(),
  anonymousSessionId: z.string().max(100).optional().nullable(),
  title: z.string().max(300).default(""),
  company: z.string().max(200).default(""),
  location: z.string().max(300).default(""),
  source: z.string().max(1000).optional(),
  description: z.string(),
  opportunityType: opportunityTypeSchema.default("unknown"),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  requiredTechnologies: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  experienceRequirements: z.array(z.string()).default([]),
  educationRequirements: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  domainRequirements: z.array(z.string()).default([]),
  extractedRequirements: z.array(z.string()).default([]),
  parsingStatus: parsingStatusSchema.default("pending"),
  parsingModel: z.string().max(100).optional(),
  parsingError: z.string().max(1000).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * Input schema for creating a new job target from AI analysis.
 * Used when saving the analyzed result to the database.
 */
export const createJobTargetSchema = z.object({
  title: z.string().max(300).default(""),
  company: z.string().max(200).default(""),
  location: z.string().max(300).default(""),
  source: z.string().max(1000).optional(),
  description: z.string().min(1),
  opportunityType: opportunityTypeSchema.default("unknown"),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  requiredTechnologies: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  experienceRequirements: z.array(z.string()).default([]),
  educationRequirements: z.array(z.string()).default([]),
  softSkills: z.array(z.string()).default([]),
  domainRequirements: z.array(z.string()).default([]),
  extractedRequirements: z.array(z.string()).default([]),
});

// ──────────────────────────────────────────────
// Analysis Schemas
// ──────────────────────────────────────────────

export const skillGapImportanceSchema = z.enum([
  "critical",
  "important",
  "nice-to-have",
]);

export const skillGapSchema = z.object({
  skill: z.string().min(1),
  present: z.boolean(),
  demonstrated: z.boolean(),
  importance: skillGapImportanceSchema,
  evidence: z.string().max(1000).optional(),
});

export const matchScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  skillsMatch: z.number().min(0).max(100),
  experienceMatch: z.number().min(0).max(100),
  educationMatch: z.number().min(0).max(100),
});

export const analysisResultSchema = z.object({
  id: z.string().uuid(),
  resumeId: z.string().uuid(),
  jobTargetId: z.string().uuid().optional(),
  profile: candidateProfileSchema,
  score: matchScoreSchema.optional(),
  skillGaps: z.array(skillGapSchema).default([]),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  analyzedAt: z.string().datetime(),
});

// ──────────────────────────────────────────────
// Rewrite Schemas
// ──────────────────────────────────────────────

export const rewriteSectionSchema = z.enum([
  "summary",
  "experience",
  "project",
  "education",
  "certification",
  "skills",
]);

export const suggestionStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "edited",
]);

export const rewriteStatusSchema = z.enum(["pending", "completed", "failed"]);

/**
 * Schema for a single rewrite suggestion with full traceability.
 */
export const rewriteSuggestionSchema = z.object({
  id: z.string().uuid(),
  section: rewriteSectionSchema,
  sectionIndex: z.number().int().min(0).default(0),
  originalText: z.string().min(1).max(2000),
  suggestedText: z.string().min(1).max(2000),
  reason: z.string().min(1).max(1000),
  supportingEvidence: z.array(z.string().max(1000)).default([]),
  relatedJobRequirements: z.array(z.string().max(500)).default([]),
  confidence: confidenceLevelSchema.default("medium"),
  status: suggestionStatusSchema.default("pending"),
  editedText: z.string().max(2000).optional(),
});

/**
 * Schema for validating raw OpenAI rewrite output before normalization.
 * Does NOT include id/status/editedText — those are added by the service.
 */
export const aiRewriteSuggestionOutputSchema = z.object({
  section: rewriteSectionSchema,
  sectionIndex: z.number().int().min(0).default(0),
  originalText: z.string().min(1).max(2000),
  suggestedText: z.string().min(1).max(2000),
  reason: z.string().min(1).max(1000),
  supportingEvidence: z.array(z.string().max(1000)).default([]),
  relatedJobRequirements: z.array(z.string().max(500)).default([]),
  confidence: confidenceLevelSchema.default("medium"),
});

export const aiRewriteOutputSchema = z.object({
  suggestions: z.array(aiRewriteSuggestionOutputSchema).default([]),
});

export type AIRewriteOutput = z.output<typeof aiRewriteOutputSchema>;

/**
 * Full persisted RewriteResult schema.
 */
export const rewriteResultSchema = z.object({
  id: z.string().uuid(),
  resumeId: z.string().uuid(),
  analysisId: z.string().uuid(),
  jobTargetId: z.string().uuid(),
  status: rewriteStatusSchema,
  suggestions: z.array(rewriteSuggestionSchema).default([]),
  model: z.string().max(100).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// ──────────────────────────────────────────────
// Skill Bridge Schemas
// ──────────────────────────────────────────────

export const dayTaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
]);

/**
 * A priority skill gap the plan focuses on.
 */
export const prioritySkillSchema = z.object({
  skill: z.string().min(1).max(200),
  reason: z.string().min(1).max(1000),
});

/**
 * Schema for a single day's task with full traceability.
 */
export const skillBridgeDaySchema = z.object({
  day: z.number().int().min(1).max(7),
  title: z.string().min(1).max(200),
  task: z.string().min(1).max(2000),
  reason: z.string().min(1).max(1000),
  expectedEvidence: z.string().min(1).max(1000),
  estimatedMinutes: z.number().int().min(15).max(480),
  status: dayTaskStatusSchema.default("pending"),
});

/**
 * Schema for validating raw OpenAI skill bridge output before
 * normalization. Does NOT include status — assigned by the service.
 *
 * The AI-output layer tolerates day numbers beyond 7 so the repair
 * step (sort/dedupe/truncate/re-sequence) can normalize them — the
 * persisted skillBridgeDaySchema stays strict at 1–7.
 */
export const aiSkillBridgeDayOutputSchema = z.object({
  day: z.number().int().min(1).max(31),
  title: z.string().min(1).max(200),
  task: z.string().min(1).max(2000),
  reason: z.string().min(1).max(1000),
  expectedEvidence: z.string().min(1).max(1000),
  estimatedMinutes: z.number().int().min(15).max(480),
});

export const aiSkillBridgeOutputSchema = z.object({
  prioritySkills: z.array(prioritySkillSchema).default([]),
  days: z.array(aiSkillBridgeDayOutputSchema).default([]),
});

export type AISkillBridgeOutput = z.output<typeof aiSkillBridgeOutputSchema>;

/**
 * Full persisted SkillBridgePlan schema.
 *
 * Timestamps use `offset: true` because Supabase/Postgres serializes
 * TIMESTAMPTZ as `2026-08-31T09:13:46.448907+00:00` (±HH:MM offset),
 * while the default `.datetime()` only accepts the `Z` designator.
 */
export const skillBridgePlanSchema = z.object({
  id: z.string().uuid(),
  resumeId: z.string().uuid(),
  jobTargetId: z.string().uuid(),
  analysisId: z.string().uuid(),
  prioritySkills: z.array(prioritySkillSchema).default([]),
  days: z.array(skillBridgeDaySchema).default([]),
  model: z.string().max(100).optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

// ──────────────────────────────────────────────
// File Upload Input
// ──────────────────────────────────────────────

/**
 * Maximum allowed file size in bytes (5 MB).
 */
export const MAX_RESUME_FILE_SIZE = 5 * 1024 * 1024;

export const ACCEPTED_RESUME_FORMATS = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const resumeUploadSchema = z.object({
  file: z
    .instanceof(File)
    .refine(
      (f) => f.size <= MAX_RESUME_FILE_SIZE,
      "File size must be less than 5 MB"
    )
    .refine(
      (f) =>
        (ACCEPTED_RESUME_FORMATS as readonly string[]).includes(f.type),
      "Only PDF and DOCX files are accepted"
    ),
});
