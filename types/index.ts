/**
 * Shared types barrel export.
 *
 * Import domain types from "@/types" throughout the application
 * rather than importing directly from "@/types/domain".
 */
export type {
  // User & Auth
  User,

  // Evidence-aware skills
  EvidenceSource,
  ConfidenceLevel,
  SkillCategory,
  SkillSupportLevel,
  CandidateEvidence,
  SkillEvidence,
  Skill,

  // Candidate profile
  CandidateProfile,
  Education,
  Experience,
  Project,
  Certification,
  Achievement,
  PotentialIssue,
  ProfileLinks,

  // Resume stages
  DocumentFormat,
  ResumeFile,
  ResumeText,
  Resume,

  // Job target
  OpportunityType,
  ParsingStatus,
  JobTarget,

  // Analysis
  SkillGap,
  MatchScore,
  AnalysisResult,

  // Rewrite
  RewriteSection,
  SuggestionStatus,
  RewriteSuggestion,
  RewriteStatus,
  RewriteResult,

  // Skill Bridge
  DayTaskStatus,
  PrioritySkill,
  SkillBridgeDay,
  SkillBridgePlan,

  // Dashboard
  ReadinessState,
  DashboardTargetRole,
  DashboardMatch,
  DashboardGapStatus,
  DashboardGap,
  DashboardSkillSnapshot,
  DashboardRewrite,
  DashboardSkillBridge,
  DashboardNextAction,
  RecentAnalysisItem,
  DashboardSummary,

  // ATS Compatibility
  ATSCategoryScore,
  ATSFinding,
  ATSScoreResult,
} from "./domain";
