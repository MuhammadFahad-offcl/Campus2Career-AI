/**
 * Campus2Career AI — Shared Domain Contracts
 *
 * These types define the core domain entities used across all MVP features.
 * They are intentionally kept separate from database schemas and API shapes
 * to allow independent evolution of each layer.
 */

// ──────────────────────────────────────────────
// User & Auth
// ──────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Candidate Profile — Evidence-Aware Skills
// ──────────────────────────────────────────────

/**
 * Source of evidence for a skill or profile claim.
 *
 * Projects, coursework, and education are first-class evidence sources so
 * students and fresh graduates are not penalized for limited formal work history.
 */
export type EvidenceSource =
  | "project"
  | "work_experience"
  | "education"
  | "coursework"
  | "certification"
  | "achievement"
  | "other_resume_section";

/**
 * Confidence level for AI-assessed evidence.
 */
export type ConfidenceLevel = "high" | "medium" | "low" | "unknown";

/**
 * Category for a skill extracted from the resume.
 */
export type SkillCategory = "technical" | "soft" | "tool" | "language" | "other";

/**
 * Evidence strength for a skill claim.
 */
export type SkillSupportLevel =
  | "demonstrated"
  | "mentioned"
  | "weak_evidence"
  | "no_evidence"
  | "unknown";

/**
 * A reusable evidence record extracted from the resume.
 */
export interface CandidateEvidence {
  id: string;
  source: EvidenceSource;
  text: string;
  relatedEntityName?: string;
  confidence: ConfidenceLevel;
}

/**
 * A single piece of supporting evidence for a skill.
 */
export interface SkillEvidence {
  /** The text snippet or description that supports this skill. */
  text: string;
  /** Where the evidence was found. */
  source: EvidenceSource;
  /** How confident we are in this evidence. */
  confidence: ConfidenceLevel;
}

/**
 * An evidence-aware skill.
 *
 * Skills are not collapsed into a simple string array.
 * A skill listed in a skills section is only "mentioned" until supported by
 * concrete evidence in a project, experience, education, certification, or achievement.
 */
export interface Skill {
  /** Normalized skill name (e.g. "TypeScript", "Project Management"). */
  name: string;
  category: SkillCategory;
  /** True if the skill name appears in the resume/profile text. */
  isMentioned: boolean;
  /** True if there is concrete evidence the candidate has applied this skill. */
  isDemonstrated: boolean;
  supportLevel: SkillSupportLevel;
  confidence: number;
  /** IDs pointing to reusable evidence records on CandidateProfile.evidence. */
  evidenceIds: string[];
  /** Supporting evidence items (kept for compatibility with existing consumers). */
  evidence: SkillEvidence[];
}

/**
 * Structured candidate profile extracted from a resume.
 * This is the canonical output of the resume intelligence pipeline.
 */
export interface CandidateProfile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  education: Education[];
  experience: Experience[];
  projects: Project[];
  skills: Skill[];
  softSkills: Skill[];
  technologies: Skill[];
  certifications: Certification[];
  achievements: Achievement[];
  languages: string[];
  links: ProfileLinks;
  evidence: CandidateEvidence[];
  potentialIssues: PotentialIssue[];
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  coursework: string[];
  highlights: string[];
}

export interface Experience {
  company: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  highlights: string[];
  technologies: string[];
}

export interface Project {
  name: string;
  description: string;
  technologies: string[];
  highlights: string[];
  links: string[];
  evidenceIds: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  date: string;
  url?: string;
}

export interface Achievement {
  title: string;
  description: string;
  date: string;
  evidenceIds: string[];
}

export interface PotentialIssue {
  type: "unsupported_claim" | "unclear_information" | "missing_evidence" | "other";
  message: string;
  relatedSkill?: string;
  severity: "low" | "medium" | "high";
}

export interface ProfileLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  other: string[];
}

// ──────────────────────────────────────────────
// Resume — File & Extraction Stages
// ──────────────────────────────────────────────

/**
 * Supported resume file formats.
 */
export type DocumentFormat = "pdf" | "docx";

/**
 * Stage 1: The raw uploaded file.
 */
export interface ResumeFile {
  id: string;
  userId: string;
  fileName: string;
  format: DocumentFormat;
  sizeBytes: number;
  storagePath: string;
  uploadedAt: string;
}

/**
 * Stage 2: Raw text extracted from the document.
 * No structuring has been performed yet.
 */
export interface ResumeText {
  resumeId: string;
  rawText: string;
  pageCount: number;
  extractedAt: string;
}

// ──────────────────────────────────────────────
// Resume — Convenience alias
// ──────────────────────────────────────────────

/**
 * A resume aggregates the file, extracted text, and structured profile.
 */
export interface Resume {
  id: string;
  userId: string;
  file: ResumeFile;
  text: ResumeText;
  profile: CandidateProfile;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Job Target
// ──────────────────────────────────────────────

/**
 * Type of job opportunity.
 */
export type OpportunityType = "internship" | "full-time" | "part-time" | "unknown";

/**
 * Status of job description parsing.
 */
export type ParsingStatus = "pending" | "completed" | "failed";

/**
 * A target job the candidate wants to apply for.
 * Used by Job Match, Resume Rewrite, and Skill Bridge features.
 */
export interface JobTarget {
  id: string;
  userId?: string;
  anonymousSessionId?: string;
  title: string;
  company: string;
  location: string;
  source?: string;
  description: string;
  opportunityType: OpportunityType;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredTechnologies: string[];
  responsibilities: string[];
  experienceRequirements: string[];
  educationRequirements: string[];
  softSkills: string[];
  domainRequirements: string[];
  extractedRequirements: string[];
  parsingStatus: ParsingStatus;
  parsingModel?: string;
  parsingError?: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Analysis — Feature 1 & 2
// ──────────────────────────────────────────────

export interface SkillGap {
  skill: string;
  present: boolean;
  demonstrated: boolean;
  importance: "critical" | "important" | "nice-to-have";
  /** Evidence snippet or explanation of how the candidate meets this requirement. */
  evidence?: string;
}

export interface MatchScore {
  overall: number;
  skillsMatch: number;
  experienceMatch: number;
  educationMatch: number;
}

export interface AnalysisResult {
  id: string;
  resumeId: string;
  jobTargetId?: string;
  profile: CandidateProfile;
  score?: MatchScore;
  skillGaps: SkillGap[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  analyzedAt: string;
}

// ──────────────────────────────────────────────
// Rewrite — Feature 3
// ──────────────────────────────────────────────

/**
 * Which resume section a rewrite suggestion targets.
 */
export type RewriteSection =
  | "summary"
  | "experience"
  | "project"
  | "education"
  | "certification"
  | "skills";

/**
 * User-decided status for each suggestion.
 */
export type SuggestionStatus = "pending" | "accepted" | "rejected" | "edited";

/**
 * A single rewrite suggestion with full traceability to candidate evidence
 * and job relevance.
 */
export interface RewriteSuggestion {
  id: string;
  section: RewriteSection;
  /** Index into the profile section array (e.g. experience[2]) — 0 for summary. */
  sectionIndex: number;
  originalText: string;
  suggestedText: string;
  reason: string;
  /** Text snippets from the candidate profile that support this suggestion. */
  supportingEvidence: string[];
  /** Job requirement strings this suggestion addresses. */
  relatedJobRequirements: string[];
  confidence: ConfidenceLevel;
  status: SuggestionStatus;
  /** User-edited replacement text (set when status === "edited"). */
  editedText?: string;
}

/**
 * Overall rewrite generation status.
 */
export type RewriteStatus = "pending" | "completed" | "failed";

/**
 * A complete rewrite result — one per (resume × jobTarget) pair.
 * Suggestions are independently accept/reject/edit.
 */
export interface RewriteResult {
  id: string;
  resumeId: string;
  analysisId: string;
  jobTargetId: string;
  status: RewriteStatus;
  suggestions: RewriteSuggestion[];
  model?: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Skill Bridge — Feature 4
// ──────────────────────────────────────────────

/**
 * Completion state for a single day's task.
 */
export type DayTaskStatus = "pending" | "in_progress" | "completed";

/**
 * A skill gap the plan focuses on, chosen from the analysis's
 * highest-impact missing skills.
 */
export interface PrioritySkill {
  skill: string;
  reason: string;
}

/**
 * One day in the 7-day plan.
 */
export interface SkillBridgeDay {
  day: number;
  title: string;
  task: string;
  reason: string;
  expectedEvidence: string;
  estimatedMinutes: number;
  status: DayTaskStatus;
}

/**
 * A complete 7-day skill bridge plan — one per analysis.
 * Day completion is tracked independently per task.
 */
export interface SkillBridgePlan {
  id: string;
  resumeId: string;
  jobTargetId: string;
  analysisId: string;
  prioritySkills: PrioritySkill[];
  days: SkillBridgeDay[];
  model?: string;
  createdAt: string;
  updatedAt: string;
}

// ──────────────────────────────────────────────
// Dashboard — Feature 5 (Explainable Dashboard)
//
// Deterministic presentation layer over existing persisted data.
// No AI-generated copy, no fabricated metrics.
// ──────────────────────────────────────────────

/**
 * Truthful product workflow states for the readiness ladder.
 * "Ready to Apply" is a workflow state only — never a prediction
 * of hiring, interviews, or employment.
 */
export type ReadinessState =
  | "NO_RESUME"
  | "PROFILE_PENDING"
  | "READY_FOR_JOB_MATCH"
  | "ANALYSIS_COMPLETE"
  | "REVIEW_RECOMMENDATIONS"
  | "IMPROVE_PRIORITY_GAPS"
  | "READY_TO_APPLY";

/**
 * The target role of the latest analysis.
 */
export interface DashboardTargetRole {
  title: string;
  company: string;
  analyzedAt: string;
}

/**
 * Latest match score with its product score-band label.
 */
export interface DashboardMatch {
  score: MatchScore;
  label: string;
}

export type DashboardGapStatus = "matched" | "partial" | "missing";

/**
 * One skill gap row for the dashboard — derived from the stored Analysis.
 */
export interface DashboardGap {
  skill: string;
  status: DashboardGapStatus;
  importance: SkillGap["importance"];
  explanation: string;
}

/**
 * Skill coverage snapshot — counted from the stored Analysis, never recalculated.
 */
export interface DashboardSkillSnapshot {
  matched: number;
  partial: number;
  missing: number;
  /** Missing critical/important skills — the truthful "priority gaps" count. */
  priorityGapCount: number;
  total: number;
  topGaps: DashboardGap[];
}

/**
 * Truthful rewrite summary — counts real persisted suggestions.
 */
export interface DashboardRewrite {
  rewriteId: string;
  suggestionCount: number;
  createdAt: string;
}

/**
 * Skill Bridge progress summary — derived from the persisted plan.
 */
export interface DashboardSkillBridge {
  planId: string;
  completedDays: number;
  totalDays: number;
  percentage: number;
  readyToApply: boolean;
  currentDay: number | null;
  currentDayTitle: string | null;
  currentDayTask: string | null;
  currentDayEvidence: string | null;
}

/**
 * Deterministic next-step recommendation derived from actual product state.
 */
export interface DashboardNextAction {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
}

/**
 * One row in the recent analyses list.
 */
export interface RecentAnalysisItem {
  id: string;
  jobTitle: string;
  jobCompany: string;
  matchScore: number;
  analyzedAt: string;
}

/**
 * Server-aggregated dashboard summary. Optional pieces are null when
 * the underlying data does not exist yet — never fabricated.
 */
export interface DashboardSummary {
  candidateName: string | null;
  hasResume: boolean;
  profileReady: boolean;
  hasJobTarget: boolean;
  targetRole: DashboardTargetRole | null;
  match: DashboardMatch | null;
  skills: DashboardSkillSnapshot | null;
  rewrite: DashboardRewrite | null;
  skillBridge: DashboardSkillBridge | null;
  readiness: ReadinessState;
  nextAction: DashboardNextAction;
  recentAnalyses: RecentAnalysisItem[];
}

// ──────────────────────────────────────────────
// ATS Compatibility Score
// ──────────────────────────────────────────────

/**
 * Weighted categories that contribute to the overall ATS score.
 * Each category is scored 0–100 independently and then combined
 * using the weights defined in the scoring engine.
 */
export interface ATSCategoryScore {
  name: string;
  score: number;
  weight: number;
  weightedScore: number;
}

/**
 * A single ATS finding — something the resume does well or could improve.
 */
export interface ATSFinding {
  text: string;
  category: string;
}

/**
 * Complete ATS compatibility analysis result.
 *
 * The overall score is a deterministic weighted combination of
 * category scores — never an arbitrary AI-generated number.
 */
export interface ATSScoreResult {
  overall: number;
  label: string;
  description: string;
  categories: ATSCategoryScore[];
  strengths: ATSFinding[];
  improvements: ATSFinding[];
}
