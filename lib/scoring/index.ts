/**
 * Match scoring engine — pure business logic, no AI or DB dependencies.
 *
 * Compares a CandidateProfile against a JobTarget and produces:
 *   - MatchScore (overall, skillsMatch, experienceMatch, educationMatch)
 *   - SkillGap[]  (each job skill → present / demonstrated / importance)
 *   - strengths, weaknesses, recommendations
 */

import type {
  CandidateProfile,
  JobTarget,
  MatchScore,
  Skill,
  SkillGap,
} from "@/types";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9+#.\s-]/g, "");
}

function skillNameSet(skills: Skill[]): Map<string, Skill> {
  const map = new Map<string, Skill>();
  for (const s of skills) {
    const key = normalize(s.name);
    if (key) {
      const existing = map.get(key);
      if (!existing || s.isDemonstrated) {
        map.set(key, s);
      }
    }
  }
  return map;
}

/**
 * Check whether any candidate skill name matches a job requirement string.
 * Uses normalized comparison with substring fallback for multi-word skills.
 */
function findCandidateSkill(
  jobSkillName: string,
  candidateSkills: Map<string, Skill>,
  candidateTechNames: Set<string>
): Skill | undefined {
  const normalized = normalize(jobSkillName);

  // Direct match
  const direct = candidateSkills.get(normalized);
  if (direct) return direct;

  // Check candidate technology names
  if (candidateTechNames.has(normalized)) {
    // Synthesize a minimal skill to indicate presence
    return { name: jobSkillName, category: "technical", isMentioned: true, isDemonstrated: false, supportLevel: "mentioned", confidence: 0.4, evidenceIds: [], evidence: [] };
  }

  // Substring / multi-word match (e.g. "machine learning" matches "ml")
  for (const [key, skill] of candidateSkills) {
    if (key.includes(normalized) || normalized.includes(key)) {
      return skill;
    }
  }
  for (const techName of candidateTechNames) {
    if (techName.includes(normalized) || normalized.includes(techName)) {
      return { name: jobSkillName, category: "technical", isMentioned: true, isDemonstrated: false, supportLevel: "mentioned", confidence: 0.3, evidenceIds: [], evidence: [] };
    }
  }

  return undefined;
}

// ──────────────────────────────────────────────
// Skill Gap Analysis
// ──────────────────────────────────────────────

export interface MatchResult {
  score: MatchScore;
  gaps: SkillGap[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

function analyzeSkillGaps(
  profile: CandidateProfile,
  job: JobTarget
): SkillGap[] {
  const candidateSkills = skillNameSet([
    ...profile.skills,
    ...profile.softSkills,
    ...profile.technologies,
  ]);

  // Collect technology names from projects & experience
  const techNames = new Set<string>();
  for (const p of profile.projects) {
    for (const t of p.technologies) techNames.add(normalize(t));
  }
  for (const e of profile.experience) {
    for (const t of e.technologies) techNames.add(normalize(t));
  }

  const gaps: SkillGap[] = [];

  // The same skill often appears in several job lists (e.g. "React" in both
  // requiredSkills and requiredTechnologies). Track normalized names so each
  // distinct skill yields exactly one gap — duplicates would double-weight the
  // score, inflate gap counts on the dashboard, and break React keys downstream.
  const processedSkills = new Set<string>();

  const processJobSkill = (
    jobSkill: string,
    importance: SkillGap["importance"]
  ) => {
    const key = normalize(jobSkill);
    if (key) {
      if (processedSkills.has(key)) return;
      processedSkills.add(key);
    }

    const match = findCandidateSkill(jobSkill, candidateSkills, techNames);

    if (!match) {
      gaps.push({
        skill: jobSkill,
        present: false,
        demonstrated: false,
        importance,
        evidence: "",
      });
      return;
    }

    const demonstrated = match.isDemonstrated;
    const evidence = demonstrated
      ? match.evidence.length > 0
        ? match.evidence[0].text
        : `${match.name} demonstrated in profile`
      : match.isMentioned
        ? `${match.name} mentioned in resume`
        : "";

    gaps.push({
      skill: jobSkill,
      present: true,
      demonstrated,
      importance,
      evidence,
    });
  };

  // Required skills → critical
  for (const s of job.requiredSkills) processJobSkill(s, "critical");

  // Required technologies → critical
  for (const t of job.requiredTechnologies) processJobSkill(t, "critical");

  // Preferred skills → nice-to-have
  for (const s of job.preferredSkills) processJobSkill(s, "nice-to-have");

  // Soft skills → important
  for (const s of job.softSkills) processJobSkill(s, "important");

  return gaps;
}

// ──────────────────────────────────────────────
// Score Computation
// ──────────────────────────────────────────────

function computeSkillsScore(gaps: SkillGap[]): number {
  const criticalGaps = gaps.filter((g) => g.importance === "critical");
  const importantGaps = gaps.filter((g) => g.importance === "important");
  const niceToHave = gaps.filter((g) => g.importance === "nice-to-have");

  const scoreGroup = (group: SkillGap[]): number => {
    if (group.length === 0) return 100;
    let points = 0;
    for (const g of group) {
      if (g.present && g.demonstrated) points += 100;
      else if (g.present) points += 60;
      // missing = 0
    }
    return Math.round(points / group.length);
  };

  // Weighted: critical 60%, important 25%, nice-to-have 15%
  const critScore = scoreGroup(criticalGaps);
  const impScore = scoreGroup(importantGaps);
  const niceScore = scoreGroup(niceToHave);

  return Math.round(critScore * 0.6 + impScore * 0.25 + niceScore * 0.15);
}

function computeExperienceScore(
  profile: CandidateProfile,
  job: JobTarget
): number {
  if (job.experienceRequirements.length === 0) return 75; // neutral if no reqs

  const years = computeTotalExperienceMonths(profile) / 12;
  const { minYears, maxYears } = extractExperienceRequirementBounds(
    job.experienceRequirements
  );

  if (minYears === null && maxYears === null) return 75; // nothing parseable — neutral

  if (minYears !== null) {
    if (years >= minYears) return 100;
    if (years >= minYears * 0.5)
      return Math.round(50 + (years / minYears) * 50);
    return Math.round((years / minYears) * 50);
  }

  // Upper-bound-only requirement ("under 2 years"): meeting the ceiling
  // satisfies it fully; exceeding it signals over-qualification rather
  // than a lack of experience — score neutrally-positive, never penalize.
  return years <= maxYears! ? 100 : 75;
}

/**
 * Total months of experience, counting overlapping or concurrent roles
 * only once (interval union). Entries with missing or inverted dates are
 * skipped instead of subtracting months.
 */
function computeTotalExperienceMonths(profile: CandidateProfile): number {
  const intervals: Array<[number, number]> = [];

  for (const exp of profile.experience) {
    const start = parseDate(exp.startDate);
    if (!start) continue;
    const end = parseDate(exp.endDate) ?? new Date();

    const startIdx = start.getFullYear() * 12 + start.getMonth();
    const endIdx = end.getFullYear() * 12 + end.getMonth();
    if (endIdx <= startIdx) continue; // zero-length or inverted — bad data

    intervals.push([startIdx, endIdx]);
  }

  if (intervals.length === 0) return 0;

  intervals.sort((a, b) => a[0] - b[0]);

  let totalMonths = 0;
  let [currentStart, currentEnd] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [start, end] = intervals[i];
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      totalMonths += currentEnd - currentStart;
      [currentStart, currentEnd] = [start, end];
    }
  }
  return totalMonths + (currentEnd - currentStart);
}

function computeEducationScore(
  profile: CandidateProfile,
  job: JobTarget
): number {
  if (job.educationRequirements.length === 0) return 75; // neutral

  if (profile.education.length === 0) return 25;

  // Compare whole tokens instead of raw substrings so short degree/field
  // abbreviations (BS, MS, BA, MA, CS, IT, EE…) match as exact words and
  // never as substrings of unrelated words ("MA" inside "Machine").
  const candidateTokens = new Set<string>();
  for (const e of profile.education) {
    for (const token of educationTokens(`${e.degree} ${e.field}`)) {
      candidateTokens.add(token);
    }
  }

  for (const requirement of job.educationRequirements) {
    for (const keyword of educationTokens(requirement)) {
      if (candidateTokens.has(keyword)) return 85;
    }
  }

  // Has education but no requirement token matched
  return 50;
}

/**
 * Education requirement boilerplate with no matching signal. Replaces the
 * old `w.length > 3` filter, which silently dropped every degree/field
 * abbreviation (BS, MS, BA, MA, CS, IT, EE).
 */
const EDUCATION_STOPWORDS = new Set([
  "a", "an", "and", "any", "at", "be", "for", "in", "is", "of", "on", "or",
  "the", "to", "with",
  "bachelor", "bachelors", "master", "masters",
  "degree", "degrees", "diploma",
  "field", "fields", "related", "equivalent",
  "required", "requirement", "requirements", "preferred", "plus",
  "currently", "pursuing", "recently", "completed", "completion",
  "major", "majors", "minimum", "education", "background", "discipline",
]);

/** Canonical forms for common degree abbreviations ("BSc" ↔ "BS"). */
const DEGREE_TOKEN_ALIASES = new Map([
  ["bsc", "bs"],
  ["msc", "ms"],
]);

function educationTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\./g, "")
    .split(/[^a-z0-9]+/)
    .map((token) => DEGREE_TOKEN_ALIASES.get(token) ?? token)
    .filter(
      (token) =>
        token.length >= 2 &&
        !/^\d+$/.test(token) &&
        !EDUCATION_STOPWORDS.has(token)
    );
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ──────────────────────────────────────────────
// Experience requirement parsing (structured)
// ──────────────────────────────────────────────

/** Structured representation of a parsed experience requirement. */
export interface ExperienceRequirementBounds {
  /** Lower bound in years ("3+ years", "3-5 years" → 3). Null if absent. */
  minYears: number | null;
  /** Upper bound in years ("under 2 years", "3-5 years" → 5). Null if absent. */
  maxYears: number | null;
}

const EXPERIENCE_COUNT = "\\d+(?:\\.\\d+)?";
const EXPERIENCE_UNIT = "years?|yrs?|months?|mos?";

const UPPER_BOUND_RE = new RegExp(
  `\\b(?:no more than|less than|fewer than|under|up to|at most|maximum of|maximum|max)\\s+(${EXPERIENCE_COUNT})\\s*(${EXPERIENCE_UNIT})`,
  "i"
);
const LOWER_BOUND_RE = new RegExp(
  `\\b(?:at least|minimum of|minimum|more than|min)\\s+(${EXPERIENCE_COUNT})\\s*(${EXPERIENCE_UNIT})`,
  "i"
);
const RANGE_RE = new RegExp(
  `(${EXPERIENCE_COUNT})\\s*(?:-|–|—|to)\\s*(${EXPERIENCE_COUNT})\\s*(${EXPERIENCE_UNIT})`,
  "i"
);
const PLUS_RE = new RegExp(
  `(${EXPERIENCE_COUNT})\\s*\\+\\s*(${EXPERIENCE_UNIT})`,
  "i"
);
const BARE_RE = new RegExp(`(${EXPERIENCE_COUNT})\\s*(${EXPERIENCE_UNIT})`, "i");

function toYears(count: string, unit: string): number {
  const value = parseFloat(count);
  return /^mo/i.test(unit) ? value / 12 : value;
}

/**
 * Parse a single experience requirement string into structured bounds.
 * Deterministic — no AI. Handles "3-5 years", "6 months", "under 2 years",
 * "1+ years", "18 months", "at least 3 years", "up to 2 years", "6-12
 * months". Word-number forms ("two years") are not supported.
 */
export function parseExperienceRequirement(
  requirement: string
): ExperienceRequirementBounds {
  const range = requirement.match(RANGE_RE);
  if (range) {
    return {
      minYears: toYears(range[1], range[3]),
      maxYears: toYears(range[2], range[3]),
    };
  }

  const upper = requirement.match(UPPER_BOUND_RE);
  if (upper) {
    return { minYears: null, maxYears: toYears(upper[1], upper[2]) };
  }

  const lower = requirement.match(LOWER_BOUND_RE);
  if (lower) {
    return { minYears: toYears(lower[1], lower[2]), maxYears: null };
  }

  const plus = requirement.match(PLUS_RE);
  if (plus) {
    return { minYears: toYears(plus[1], plus[2]), maxYears: null };
  }

  const bare = requirement.match(BARE_RE);
  if (bare) {
    return { minYears: toYears(bare[1], bare[2]), maxYears: null };
  }

  return { minYears: null, maxYears: null };
}

/**
 * Aggregate structured bounds across all experience requirements:
 * strictest lower bound (max of mins) and strictest upper bound (min of
 * maxes). A zero lower bound is treated as "no floor" ("0-2 years" →
 * ceiling only).
 */
export function extractExperienceRequirementBounds(
  requirements: string[]
): ExperienceRequirementBounds {
  let minYears: number | null = null;
  let maxYears: number | null = null;

  for (const requirement of requirements) {
    const parsed = parseExperienceRequirement(requirement);

    if (parsed.minYears !== null && parsed.minYears > 0) {
      minYears =
        minYears === null
          ? parsed.minYears
          : Math.max(minYears, parsed.minYears);
    }
    if (parsed.maxYears !== null) {
      maxYears =
        maxYears === null
          ? parsed.maxYears
          : Math.min(maxYears, parsed.maxYears);
    }
  }

  return { minYears, maxYears };
}

// ──────────────────────────────────────────────
// Strengths / Weaknesses / Recommendations
// ──────────────────────────────────────────────

function generateStrengths(gaps: SkillGap[]): string[] {
  const demonstrated = gaps.filter((g) => g.demonstrated);
  const mentioned = gaps.filter((g) => g.present && !g.demonstrated);
  const strengths: string[] = [];

  if (demonstrated.length > 0) {
    const names = demonstrated.slice(0, 5).map((g) => g.skill).join(", ");
    strengths.push(
      `Demonstrated experience in ${names} with concrete resume evidence`
    );
  }

  if (mentioned.length > 0) {
    const names = mentioned.slice(0, 4).map((g) => g.skill).join(", ");
    strengths.push(`Familiarity with ${names} mentioned in resume`);
  }

  const criticalPresent = gaps.filter(
    (g) => g.importance === "critical" && g.present
  );
  if (criticalPresent.length > 0) {
    strengths.push(
      `${criticalPresent.length} of ${gaps.filter((g) => g.importance === "critical").length} critical requirements matched`
    );
  }

  return strengths;
}

function generateWeaknesses(gaps: SkillGap[]): string[] {
  const missing = gaps.filter((g) => !g.present);
  const weaknesses: string[] = [];

  const criticalMissing = missing.filter((g) => g.importance === "critical");
  if (criticalMissing.length > 0) {
    const names = criticalMissing.slice(0, 5).map((g) => g.skill).join(", ");
    weaknesses.push(`Missing critical requirements: ${names}`);
  }

  const mentionedNotDemonstrated = gaps.filter(
    (g) => g.present && !g.demonstrated && g.importance === "critical"
  );
  if (mentionedNotDemonstrated.length > 0) {
    const names = mentionedNotDemonstrated.map((g) => g.skill).join(", ");
    weaknesses.push(
      `${names} mentioned but not demonstrated with concrete evidence`
    );
  }

  return weaknesses;
}

function generateRecommendations(
  gaps: SkillGap[],
  _profile: CandidateProfile,
  job: JobTarget
): string[] {
  const recommendations: string[] = [];

  const criticalMissing = gaps.filter(
    (g) => !g.present && g.importance === "critical"
  );
  if (criticalMissing.length > 0) {
    const names = criticalMissing.slice(0, 3).map((g) => g.skill).join(", ");
    recommendations.push(
      `Priority: Build experience with ${names} through projects or coursework`
    );
  }

  const mentionedOnly = gaps.filter(
    (g) => g.present && !g.demonstrated && g.importance === "critical"
  );
  if (mentionedOnly.length > 0) {
    const names = mentionedOnly.map((g) => g.skill).join(", ");
    recommendations.push(
      `Strengthen evidence for ${names} by adding project examples to your resume`
    );
  }

  const niceGaps = gaps.filter(
    (g) => !g.present && g.importance === "nice-to-have"
  );
  if (niceGaps.length > 0) {
    const names = niceGaps.slice(0, 3).map((g) => g.skill).join(", ");
    recommendations.push(
      `Nice to develop: ${names} would strengthen your application`
    );
  }

  if (recommendations.length === 0 && gaps.every((g) => g.demonstrated)) {
    recommendations.push(
      "Strong match — tailor your resume summary to highlight domain-specific achievements for this role"
    );
  }

  if (job.softSkills.length > 0) {
    const missingSoft = gaps.filter(
      (g) => !g.present && g.importance === "important"
    );
    if (missingSoft.length > 0) {
      recommendations.push(
        `Consider highlighting soft skills (${missingSoft.slice(0, 3).map((g) => g.skill).join(", ")}) in your resume summary or project descriptions`
      );
    }
  }

  return recommendations.slice(0, 6);
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Compute how well a candidate profile matches a job target.
 *
 * Pure function — no I/O, no AI, no database. *
 * @param profile - The structured candidate profile from resume analysis.
 * @param job - The target job description from job analysis.
 * @returns Match score breakdown, skill gaps, and recommendations.
 */
export function computeMatch(
  profile: CandidateProfile,
  job: JobTarget
): MatchResult {
  const gaps = analyzeSkillGaps(profile, job);

  const skillsMatch = computeSkillsScore(gaps);
  const experienceMatch = computeExperienceScore(profile, job);
  const educationMatch = computeEducationScore(profile, job);

  // Weighted overall: skills 50%, experience 30%, education 20%
  const overall = Math.round(
    skillsMatch * 0.5 + experienceMatch * 0.3 + educationMatch * 0.2
  );

  const score: MatchScore = {
    overall: Math.min(100, Math.max(0, overall)),
    skillsMatch: Math.min(100, Math.max(0, skillsMatch)),
    experienceMatch: Math.min(100, Math.max(0, experienceMatch)),
    educationMatch: Math.min(100, Math.max(0, educationMatch)),
  };

  return {
    score,
    gaps,
    strengths: generateStrengths(gaps),
    weaknesses: generateWeaknesses(gaps),
    recommendations: generateRecommendations(gaps, profile, job),
  };
}
