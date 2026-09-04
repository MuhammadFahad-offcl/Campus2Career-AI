/**
 * ATS Compatibility Scoring Engine
 *
 * Deterministic, rule-based analysis of resume text and structured
 * CandidateProfile data. Produces a weighted score from 0–100 based on
 * seven categories:
 *
 *   Structure (15%)       Standard headings, contact info, logical order
 *   Formatting (15%)      Consistent formatting, no ATS-unfriendly elements
 *   Keywords (20%)        Action verbs, industry terms, quantifiable achievements
 *   Skills Coverage (15%) Demonstrated skills, diverse categories
 *   Experience (15%)      Quality descriptions, metrics, completeness
 *   Readability (10%)     Length, density, bullet usage
 *   ATS Risks (10%)       Parsing hazards — special chars, tables, images
 *
 * Pure business logic — no AI, database, or network calls.
 */

import type {
  CandidateProfile,
  ATSScoreResult,
  ATSCategoryScore,
  ATSFinding,
} from "@/types";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const CATEGORY_WEIGHTS = {
  structure: 0.15,
  formatting: 0.15,
  keywords: 0.20,
  skills: 0.15,
  experience: 0.15,
  readability: 0.10,
  atsRisks: 0.10,
} as const;

const STANDARD_HEADINGS = {
  experience: [
    "experience", "work experience", "professional experience",
    "employment", "employment history", "work history",
    "professional background", "career history",
  ],
  education: [
    "education", "academic background", "academic qualifications",
    "educational background", "qualifications",
  ],
  skills: [
    "skills", "technical skills", "core competencies",
    "competencies", "expertise", "proficiencies",
    "key skills", "relevant skills",
  ],
  summary: [
    "summary", "professional summary", "objective",
    "career objective", "profile", "about me",
    "career summary", "professional profile",
  ],
} as const;

const CONTACT_PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phone: /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/,
  linkedin: /linkedin\.com\/in\//i,
  github: /github\.com\//i,
  portfolio: /https?:\/\/[\w.-]+\.\w{2,}/i,
} as const;

const ACTION_VERBS = [
  "achieved", "accomplished", "administered", "analyzed", "built",
  "collaborated", "coordinated", "created", "decreased", "delivered",
  "designed", "developed", "directed", "established", "executed",
  "expanded", "facilitated", "generated", "identified", "implemented",
  "improved", "increased", "initiated", "integrated", "introduced",
  "launched", "led", "managed", "mentored", "negotiated",
  "optimized", "organized", "oversaw", "planned", "presented",
  "produced", "proposed", "reduced", "resolved", "spearheaded",
  "streamlined", "supervised", "trained", "transformed",
] as const;

const METRICS_PATTERNS = [
  /\$\s?[\d,]+(?:\.\d+)?\s?(?:k|m|b|thousand|million|billion)?/i,
  /\d+(?:\.\d+)?\s*%/,
  /\d+\s*(?:x|×)\s*(?:increase|decrease|growth|reduction|improvement|faster|slower|more|less)/i,
  /(?:increased|decreased|reduced|improved|grew|saved|generated|boosted)\s+(?:by\s+)?\d+/i,
  /(?:managed|led|supervised|oversaw|coordinated)\s+\d+\s*(?:\+?\s*)?(?:people|team|members|staff|employees|developers|engineers)/i,
  /\d+\s*(?:projects|clients|users|customers|accounts|initiatives|campaigns|products)/i,
] as const;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function normalizeText(text: string): string {
  return text.toLowerCase();
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

function hasSectionHeading(
  lowerText: string,
  headings: readonly string[]
): boolean {
  return headings.some(
    (h) =>
      lowerText.includes(h) ||
      new RegExp(`(?:^|\\n)\\s*${h.replace(/\s+/g, "\\s+")}\\s*(?:\\n|:|$)`, "i").test(lowerText)
  );
}

// ──────────────────────────────────────────────
// Category Scorers
// ──────────────────────────────────────────────

interface CategoryResult {
  score: number;
  strengths: ATSFinding[];
  improvements: ATSFinding[];
}

function scoreStructure(
  text: string,
  profile: CandidateProfile | null,
  pageCount: number
): CategoryResult {
  const lower = normalizeText(text);
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];

  // Standard section headings (max 40)
  const headingsFound: string[] = [];
  const headingsMissing: string[] = [];
  const categoryNames: Record<string, string> = {
    experience: "Work Experience",
    education: "Education",
    skills: "Skills",
    summary: "Summary/Objective",
  };

  for (const [key, headings] of Object.entries(STANDARD_HEADINGS)) {
    if (hasSectionHeading(lower, headings)) {
      headingsFound.push(categoryNames[key] ?? key);
    } else {
      headingsMissing.push(categoryNames[key] ?? key);
    }
  }

  const headingScore = (headingsFound.length / 4) * 40;
  if (headingsFound.length >= 3) {
    strengths.push({
      text: "Standard section headings detected",
      category: "Structure",
    });
  }
  for (const m of headingsMissing) {
    improvements.push({
      text: `Add a "${m}" section with a clear heading`,
      category: "Structure",
    });
  }

  // Contact info (max 30)
  let contactScore = 0;
  if (CONTACT_PATTERNS.email.test(text)) {
    contactScore += 10;
    strengths.push({
      text: "Email address is present",
      category: "Structure",
    });
  } else {
    improvements.push({
      text: "Add a clear email address",
      category: "Structure",
    });
  }

  if (CONTACT_PATTERNS.phone.test(text)) {
    contactScore += 10;
  } else {
    improvements.push({
      text: "Add a phone number for recruiter contact",
      category: "Structure",
    });
  }

  if (
    CONTACT_PATTERNS.linkedin.test(text) ||
    CONTACT_PATTERNS.github.test(text)
  ) {
    contactScore += 5;
    strengths.push({
      text: "Professional profile links included",
      category: "Structure",
    });
  } else if (profile?.links?.linkedin || profile?.links?.github) {
    contactScore += 5;
  } else {
    improvements.push({
      text: "Consider adding LinkedIn or GitHub profile links",
      category: "Structure",
    });
  }

  const hasName =
    (profile?.fullName?.trim().length ?? 0) > 0 ||
    text.trim().split("\n")[0]?.trim().length! > 0;
  if (hasName) contactScore += 5;

  // Logical order (max 20)
  let orderScore = 0;
  const posExperience = lower.search(
    /experience|work experience|employment|career/
  );
  const posEducation = lower.search(/education|academic/);
  const posSkills = lower.search(/skills|competencies|expertise/);

  if (posExperience !== -1 && posEducation !== -1 && posSkills !== -1) {
    orderScore += 20;
  } else if (
    [posExperience, posEducation, posSkills].filter((p) => p !== -1).length >=
    2
  ) {
    orderScore += 10;
  }

  // Section clarity (max 10)
  let sectionScore = 0;
  if ((profile?.summary?.length ?? 0) > 20) {
    sectionScore += 5;
    strengths.push({
      text: "Professional summary is present",
      category: "Structure",
    });
  } else {
    improvements.push({
      text: "Add a brief professional summary at the top",
      category: "Structure",
    });
  }

  if (pageCount > 0 && pageCount <= 3) sectionScore += 5;

  const raw = headingScore + contactScore + orderScore + sectionScore;
  return {
    score: clampScore(raw),
    strengths,
    improvements,
  };
}

function scoreFormatting(text: string, pageCount: number): CategoryResult {
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];
  let score = 80; // start at baseline — most text-based resumes are fine

  // Consistent date patterns (max 10 bonus)
  const datePatterns = text.match(/\b(?:\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\s*[–\-–]\s*(?:\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|present|current|now)\b/gi);
  if ((datePatterns?.length ?? 0) >= 2) {
    score += 10;
    strengths.push({
      text: "Consistent date formatting detected",
      category: "Formatting",
    });
  }

  // Bullet points / list items (max 10 bonus)
  const bullets = text.match(/[•·▪▸►◆\-\*]\s+/g);
  if ((bullets?.length ?? 0) >= 3) {
    score += 10;
    strengths.push({
      text: "Uses bullet points for readability",
      category: "Formatting",
    });
  } else {
    improvements.push({
      text: "Use bullet points to structure experience descriptions",
      category: "Formatting",
    });
  }

  // Table indicators (penalty)
  const tableIndicators =
    (text.match(/\t{2,}/g)?.length ?? 0) +
    (text.match(/\|.*\|.*\|/g)?.length ?? 0);
  if (tableIndicators > 3) {
    score -= 20;
    improvements.push({
      text: "Possible table formatting detected — may confuse ATS parsers",
      category: "Formatting",
    });
  } else if (tableIndicators > 0) {
    score -= 10;
  }

  // Excessive special characters (penalty)
  const specialChars = text.match(/[★☆◇◆■□●○◆♦♣♠♥→←↑↓⇒⇐⇑⇓]/g);
  if ((specialChars?.length ?? 0) > 5) {
    score -= 15;
    improvements.push({
      text: "Excessive special characters may cause parsing issues",
      category: "Formatting",
    });
  }

  // Page count appropriateness
  if (pageCount === 1) {
    strengths.push({
      text: "Concise single-page resume",
      category: "Formatting",
    });
  } else if (pageCount === 2) {
    strengths.push({
      text: "Appropriate two-page resume length",
      category: "Formatting",
    });
  } else if (pageCount > 3) {
    score -= 10;
    improvements.push({
      text: "Resume exceeds 3 pages — consider condensing for ATS readability",
      category: "Formatting",
    });
  }

  return { score: clampScore(score), strengths, improvements };
}

function scoreKeywords(text: string, profile: CandidateProfile | null): CategoryResult {
  const lower = normalizeText(text);
  const words = lower.split(/\s+/);
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];

  // Action verbs (max 35)
  let verbCount = 0;
  for (const verb of ACTION_VERBS) {
    const regex = new RegExp(`\\b${verb}\\b`, "gi");
    const matches = text.match(regex);
    verbCount += matches?.length ?? 0;
  }

  let verbScore = 0;
  if (verbCount >= 10) {
    verbScore = 35;
    strengths.push({
      text: "Strong use of action verbs throughout resume",
      category: "Keywords",
    });
  } else if (verbCount >= 5) {
    verbScore = 25;
    strengths.push({
      text: "Good use of action verbs",
      category: "Keywords",
    });
  } else if (verbCount >= 2) {
    verbScore = 15;
    improvements.push({
      text: "Add more action verbs (e.g., developed, managed, implemented)",
      category: "Keywords",
    });
  } else {
    improvements.push({
      text: "Use action verbs to start bullet points (e.g., Built, Led, Designed)",
      category: "Keywords",
    });
  }

  // Quantifiable achievements (max 35)
  let metricsCount = 0;
  for (const pattern of METRICS_PATTERNS) {
    const matches = text.match(pattern);
    metricsCount += matches?.length ?? 0;
  }

  let metricsScore = 0;
  if (metricsCount >= 5) {
    metricsScore = 35;
    strengths.push({
      text: "Excellent use of quantifiable achievements",
      category: "Keywords",
    });
  } else if (metricsCount >= 3) {
    metricsScore = 25;
    strengths.push({
      text: "Good use of measurable achievements",
      category: "Keywords",
    });
  } else if (metricsCount >= 1) {
    metricsScore = 15;
    improvements.push({
      text: "Add more quantifiable achievements (e.g., 'increased sales by 25%')",
      category: "Keywords",
    });
  } else {
    improvements.push({
      text: "Add measurable achievements with numbers and percentages",
      category: "Keywords",
    });
  }

  // Industry / professional terms (max 30)
  let industryScore = 0;
  const skillsCount =
    (profile?.skills?.length ?? 0) +
    (profile?.technologies?.length ?? 0);

  if (skillsCount >= 10) {
    industryScore = 30;
    strengths.push({
      text: "Rich set of professional skills and technologies listed",
      category: "Keywords",
    });
  } else if (skillsCount >= 5) {
    industryScore = 20;
    strengths.push({
      text: "Good coverage of professional skills",
      category: "Keywords",
    });
  } else if (skillsCount >= 2) {
    industryScore = 10;
    improvements.push({
      text: "Add more relevant industry skills and technologies",
      category: "Keywords",
    });
  } else {
    improvements.push({
      text: "Add a dedicated skills section with relevant keywords",
      category: "Keywords",
    });
  }

  return {
    score: clampScore(verbScore + metricsScore + industryScore),
    strengths,
    improvements,
  };
}

function scoreSkillsCoverage(profile: CandidateProfile | null): CategoryResult {
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];

  if (!profile) {
    return {
      score: 50,
      strengths: [],
      improvements: [
        {
          text: "Complete a full resume analysis for detailed skills evaluation",
          category: "Skills Coverage",
        },
      ],
    };
  }

  const allSkills = [
    ...(profile.skills ?? []),
    ...(profile.softSkills ?? []),
    ...(profile.technologies ?? []),
  ];

  if (allSkills.length === 0) {
    improvements.push({
      text: "No skills detected — add a skills section to your resume",
      category: "Skills Coverage",
    });
    return { score: clampScore(15), strengths, improvements };
  }

  let score = 0;

  // Skill count (max 25)
  if (allSkills.length >= 15) score += 25;
  else if (allSkills.length >= 10) score += 20;
  else if (allSkills.length >= 5) score += 15;
  else score += 8;

  // Demonstrated vs mentioned (max 30)
  const demonstrated = allSkills.filter((s) => s.isDemonstrated);
  const demonstratedRatio =
    allSkills.length > 0 ? demonstrated.length / allSkills.length : 0;

  if (demonstratedRatio >= 0.5) {
    score += 30;
    strengths.push({
      text: "Majority of skills have supporting evidence",
      category: "Skills Coverage",
    });
  } else if (demonstratedRatio >= 0.25) {
    score += 20;
    strengths.push({
      text: "Some skills have supporting evidence",
      category: "Skills Coverage",
    });
    improvements.push({
      text: "Add more project or experience evidence for listed skills",
      category: "Skills Coverage",
    });
  } else {
    score += 10;
    improvements.push({
      text: "Most skills lack supporting evidence — add projects or experience details",
      category: "Skills Coverage",
    });
  }

  // Diversity (max 25)
  const categories = new Set(allSkills.map((s) => s.category));
  if (categories.size >= 3) {
    score += 25;
    strengths.push({
      text: "Diverse skill categories represented",
      category: "Skills Coverage",
    });
  } else if (categories.size >= 2) {
    score += 15;
  } else {
    improvements.push({
      text: "Include both technical and soft skills for broader ATS compatibility",
      category: "Skills Coverage",
    });
  }

  // Soft skills (max 20)
  if (profile.softSkills.length >= 3) {
    score += 20;
    strengths.push({
      text: "Soft skills section is present",
      category: "Skills Coverage",
    });
  } else if (profile.softSkills.length >= 1) {
    score += 10;
  } else {
    improvements.push({
      text: "Add relevant soft skills (e.g., communication, leadership)",
      category: "Skills Coverage",
    });
  }

  return { score: clampScore(score), strengths, improvements };
}

function scoreExperienceQuality(
  text: string,
  profile: CandidateProfile | null
): CategoryResult {
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];
  let score = 0;

  const experience = profile?.experience ?? [];
  const projects = profile?.projects ?? [];

  // Experience entries (max 20)
  if (experience.length >= 3) {
    score += 20;
    strengths.push({
      text: "Multiple work experience entries",
      category: "Experience",
    });
  } else if (experience.length >= 1) {
    score += 12;
    strengths.push({
      text: "Work experience section is present",
      category: "Experience",
    });
  } else {
    improvements.push({
      text: "Add work experience entries with dates and descriptions",
      category: "Experience",
    });
  }

  // Experience descriptions (max 20)
  const describedExp = experience.filter(
    (e) => (e.description?.length ?? 0) > 30
  );
  if (experience.length > 0 && describedExp.length === experience.length) {
    score += 20;
    strengths.push({
      text: "All experience entries include descriptions",
      category: "Experience",
    });
  } else if (describedExp.length >= 1) {
    score += 12;
    improvements.push({
      text: "Add descriptions to all work experience entries",
      category: "Experience",
    });
  } else if (experience.length > 0) {
    improvements.push({
      text: "Add detailed descriptions to your work experience",
      category: "Experience",
    });
  }

  // Projects as experience substitute (max 15)
  if (projects.length >= 2) {
    score += 15;
    strengths.push({
      text: "Multiple projects listed as practical experience",
      category: "Experience",
    });
  } else if (projects.length === 1) {
    score += 8;
    strengths.push({
      text: "Project experience included",
      category: "Experience",
    });
  } else if (experience.length === 0) {
    improvements.push({
      text: "Add relevant projects to demonstrate practical experience",
      category: "Experience",
    });
  }

  // Achievements / certifications (max 15)
  const achievementCount =
    (profile?.achievements?.length ?? 0) +
    (profile?.certifications?.length ?? 0);
  if (achievementCount >= 3) {
    score += 15;
    strengths.push({
      text: "Achievements and certifications are listed",
      category: "Experience",
    });
  } else if (achievementCount >= 1) {
    score += 8;
  } else {
    improvements.push({
      text: "Add relevant certifications or achievements",
      category: "Experience",
    });
  }

  // Metrics in descriptions (max 15)
  const expText = experience
    .map((e) => e.description)
    .join(" ")
    .toLowerCase();
  let expMetrics = 0;
  for (const pattern of METRICS_PATTERNS) {
    expMetrics += expText.match(pattern)?.length ?? 0;
  }

  if (expMetrics >= 3) {
    score += 15;
    strengths.push({
      text: "Work descriptions include measurable achievements",
      category: "Experience",
    });
  } else if (expMetrics >= 1) {
    score += 8;
  } else if (experience.length > 0) {
    improvements.push({
      text: "Add quantifiable results to work experience (e.g., 'reduced load time by 40%')",
      category: "Experience",
    });
  }

  // Completeness bonus (max 15)
  if (experience.length > 0) {
    const withDates = experience.filter(
      (e) => e.startDate && e.startDate.length > 0
    );
    if (withDates.length === experience.length) {
      score += 15;
      strengths.push({
        text: "All experience entries include date ranges",
        category: "Experience",
      });
    } else if (withDates.length >= experience.length / 2) {
      score += 8;
    } else {
      improvements.push({
        text: "Add start and end dates to all experience entries",
        category: "Experience",
      });
    }
  }

  return { score: clampScore(score), strengths, improvements };
}

function scoreReadability(text: string, pageCount: number): CategoryResult {
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];

  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  const lineCount = text.split("\n").filter((l) => l.trim().length > 0).length;

  // Word count appropriateness (max 35)
  let lengthScore = 0;
  if (wordCount >= 300 && wordCount <= 900) {
    lengthScore = 35;
    strengths.push({
      text: "Appropriate resume length for ATS processing",
      category: "Readability",
    });
  } else if (wordCount >= 200 && wordCount <= 1200) {
    lengthScore = 25;
    strengths.push({
      text: "Resume length is within acceptable range",
      category: "Readability",
    });
  } else if (wordCount < 200) {
    lengthScore = 10;
    improvements.push({
      text: "Resume may be too short — add more detail about your experience",
      category: "Readability",
    });
  } else {
    lengthScore = 15;
    improvements.push({
      text: "Resume may be too long — consider condensing to 1–2 pages",
      category: "Readability",
    });
  }

  // Text density (max 30)
  const avgLineLength = lineCount > 0 ? wordCount / lineCount : 0;
  let densityScore = 0;
  if (avgLineLength >= 5 && avgLineLength <= 20) {
    densityScore = 30;
    strengths.push({
      text: "Good text density — easy for ATS to parse",
      category: "Readability",
    });
  } else if (avgLineLength >= 3 && avgLineLength <= 30) {
    densityScore = 20;
  } else {
    densityScore = 10;
    improvements.push({
      text: "Unusual text density — use concise bullet points",
      category: "Readability",
    });
  }

  // Bullet / line-item structure (max 20)
  const bulletLines = text.match(
    /^\s*[•·▪▸►◆\-\*]\s+.+/gm
  );
  const bulletRatio =
    lineCount > 0 ? (bulletLines?.length ?? 0) / lineCount : 0;

  let bulletScore = 0;
  if (bulletRatio >= 0.3) {
    bulletScore = 20;
    strengths.push({
      text: "Good use of bullet-point structure",
      category: "Readability",
    });
  } else if (bulletRatio >= 0.1) {
    bulletScore = 12;
  } else {
    improvements.push({
      text: "Structure content with bullet points for better readability",
      category: "Readability",
    });
  }

  // Whitespace / section breaks (max 15)
  const emptyLines = text.split("\n").filter((l) => l.trim().length === 0).length;
  let spacingScore = 0;
  if (emptyLines >= 3 && emptyLines <= lineCount * 0.3) {
    spacingScore = 15;
  } else if (emptyLines >= 1) {
    spacingScore = 8;
  } else {
    improvements.push({
      text: "Add spacing between sections for better readability",
      category: "Readability",
    });
  }

  return {
    score: clampScore(lengthScore + densityScore + bulletScore + spacingScore),
    strengths,
    improvements,
  };
}

function scoreATSRisks(text: string, pageCount: number): CategoryResult {
  const strengths: ATSFinding[] = [];
  const improvements: ATSFinding[] = [];

  // Start at 100 (no risks) and subtract
  let score = 100;

  // Excessive special characters
  const specialChars = text.match(
    /[★☆◇◆■□●○◆♦♣♠♥→←↑↓⇒⇐⇑⇓✓✗✘✔✦✧⚡☑☐☒]/g
  );
  if ((specialChars?.length ?? 0) > 10) {
    score -= 25;
    improvements.push({
      text: "Too many special characters — use standard bullets (- or •)",
      category: "ATS Risks",
    });
  } else if ((specialChars?.length ?? 0) > 5) {
    score -= 15;
    improvements.push({
      text: "Some special characters detected — standardize bullet styles",
      category: "ATS Risks",
    });
  }

  // Table indicators
  const pipeRows = text.match(/^\s*\|.*\|.*\|\s*$/gm);
  const tabClusters = text.match(/\t{3,}/g);
  if ((pipeRows?.length ?? 0) > 2 || (tabClusters?.length ?? 0) > 2) {
    score -= 30;
    improvements.push({
      text: "Table-like formatting detected — ATS parsers often fail on tables",
      category: "ATS Risks",
    });
  } else if ((pipeRows?.length ?? 0) > 0 || (tabClusters?.length ?? 0) > 0) {
    score -= 15;
    improvements.push({
      text: "Possible table formatting — consider using plain text lists instead",
      category: "ATS Risks",
    });
  }

  // Image / graphic indicators
  if (/\[image\]|\[graphic\]|\[photo\]|\[logo\]|!\[.*?\]\(.*?\)/i.test(text)) {
    score -= 20;
    improvements.push({
      text: "Images or graphics detected — ATS cannot read text inside images",
      category: "ATS Risks",
    });
  }

  // Header/footer indicators
  const headerFooterHints = text.match(
    /page\s+\d+\s+of\s+\d+|confidential|do not distribute/i
  );
  if (headerFooterHints) {
    score -= 10;
    improvements.push({
      text: "Header/footer content detected — some ATS skip these sections",
      category: "ATS Risks",
    });
  }

  // Excessive columns (heuristic: many very short lines in sequence)
  const lines = text.split("\n");
  let columnPatternCount = 0;
  for (let i = 0; i < lines.length - 2; i++) {
    const a = lines[i]?.trim().length ?? 0;
    const b = lines[i + 1]?.trim().length ?? 0;
    const c = lines[i + 2]?.trim().length ?? 0;
    if (a > 0 && a < 20 && b > 0 && b < 20 && c > 0 && c < 20) {
      columnPatternCount++;
    }
  }
  if (columnPatternCount > 5) {
    score -= 15;
    improvements.push({
      text: "Multi-column layout may be detected — single-column is ATS-safer",
      category: "ATS Risks",
    });
  }

  // Very long resume (parsing degradation)
  if (pageCount > 4) {
    score -= 10;
    improvements.push({
      text: "Resume exceeds 4 pages — longer resumes risk incomplete ATS parsing",
      category: "ATS Risks",
    });
  }

  // Positive: clean text
  if (score >= 85) {
    strengths.push({
      text: "No major ATS parsing risks detected",
      category: "ATS Risks",
    });
  }

  return { score: clampScore(score), strengths, improvements };
}

// ──────────────────────────────────────────────
// Label Generation
// ──────────────────────────────────────────────

function getATSLabel(score: number): string {
  if (score >= 90) return "Excellent ATS Compatibility";
  if (score >= 80) return "Highly ATS Friendly";
  if (score >= 70) return "Good ATS Compatibility";
  if (score >= 60) return "Needs Improvement";
  return "Poor ATS Compatibility";
}

function getATSDescription(score: number): string {
  if (score >= 90) {
    return "Your resume is highly optimized for ATS systems. It uses standard formatting, clear section headings, and relevant keywords.";
  }
  if (score >= 80) {
    return "Your resume has a strong ATS-compatible structure, but there are a few areas that could be improved.";
  }
  if (score >= 70) {
    return "Your resume is reasonably ATS-compatible. Addressing the recommendations below will improve your chances.";
  }
  if (score >= 60) {
    return "Your resume needs some improvements to pass through ATS systems effectively. Review the recommendations below.";
  }
  return "Your resume has significant ATS compatibility issues. Follow the recommendations below to improve your score.";
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

/**
 * Run the full ATS compatibility analysis on a resume.
 *
 * @param text        Raw extracted text from the resume.
 * @param profile     Structured CandidateProfile (may be null if analysis hasn't run).
 * @param pageCount   Number of pages in the uploaded document.
 * @returns           Complete ATSScoreResult with categories, findings, and overall score.
 */
export function analyzeATSScore(
  text: string,
  profile: CandidateProfile | null,
  pageCount: number
): ATSScoreResult {
  const structure = scoreStructure(text, profile, pageCount);
  const formatting = scoreFormatting(text, pageCount);
  const keywords = scoreKeywords(text, profile);
  const skills = scoreSkillsCoverage(profile);
  const experience = scoreExperienceQuality(text, profile);
  const readability = scoreReadability(text, pageCount);
  const atsRisks = scoreATSRisks(text, pageCount);

  const categories: ATSCategoryScore[] = [
    {
      name: "Structure",
      score: structure.score,
      weight: CATEGORY_WEIGHTS.structure,
      weightedScore: structure.score * CATEGORY_WEIGHTS.structure,
    },
    {
      name: "Formatting",
      score: formatting.score,
      weight: CATEGORY_WEIGHTS.formatting,
      weightedScore: formatting.score * CATEGORY_WEIGHTS.formatting,
    },
    {
      name: "Keyword Optimization",
      score: keywords.score,
      weight: CATEGORY_WEIGHTS.keywords,
      weightedScore: keywords.score * CATEGORY_WEIGHTS.keywords,
    },
    {
      name: "Skills Coverage",
      score: skills.score,
      weight: CATEGORY_WEIGHTS.skills,
      weightedScore: skills.score * CATEGORY_WEIGHTS.skills,
    },
    {
      name: "Experience Quality",
      score: experience.score,
      weight: CATEGORY_WEIGHTS.experience,
      weightedScore: experience.score * CATEGORY_WEIGHTS.experience,
    },
    {
      name: "Readability",
      score: readability.score,
      weight: CATEGORY_WEIGHTS.readability,
      weightedScore: readability.score * CATEGORY_WEIGHTS.readability,
    },
    {
      name: "ATS Parsing Risks",
      score: atsRisks.score,
      weight: CATEGORY_WEIGHTS.atsRisks,
      weightedScore: atsRisks.score * CATEGORY_WEIGHTS.atsRisks,
    },
  ];

  const overall = clampScore(
    categories.reduce((sum, c) => sum + c.weightedScore, 0)
  );

  const allStrengths: ATSFinding[] = [
    ...structure.strengths,
    ...formatting.strengths,
    ...keywords.strengths,
    ...skills.strengths,
    ...experience.strengths,
    ...readability.strengths,
    ...atsRisks.strengths,
  ];

  const allImprovements: ATSFinding[] = [
    ...structure.improvements,
    ...formatting.improvements,
    ...keywords.improvements,
    ...skills.improvements,
    ...experience.improvements,
    ...readability.improvements,
    ...atsRisks.improvements,
  ];

  return {
    overall,
    label: getATSLabel(overall),
    description: getATSDescription(overall),
    categories,
    strengths: allStrengths,
    improvements: allImprovements,
  };
}
