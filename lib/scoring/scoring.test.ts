import { describe, expect, it } from "vitest";
import {
  computeMatch,
  extractExperienceRequirementBounds,
  parseExperienceRequirement,
  type MatchResult,
} from "./index";
import type { CandidateProfile, JobTarget } from "@/types";

// ──────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────

function makeProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    fullName: "Test Candidate",
    email: "test@example.com",
    phone: "",
    location: "San Francisco, CA",
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
    softSkills: [],
    technologies: [],
    certifications: [],
    achievements: [],
    languages: [],
    links: { other: [] },
    evidence: [],
    potentialIssues: [],
    ...overrides,
  };
}

function makeJob(overrides: Partial<JobTarget> = {}): JobTarget {
  return {
    id: "job-001",
    title: "Software Engineer",
    company: "TestCo",
    location: "Remote",
    description: "A test job",
    opportunityType: "full-time",
    requiredSkills: [],
    preferredSkills: [],
    requiredTechnologies: [],
    responsibilities: [],
    experienceRequirements: [],
    educationRequirements: [],
    softSkills: [],
    domainRequirements: [],
    extractedRequirements: [],
    parsingStatus: "completed",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSkill(name: string, demonstrated = false) {
  return {
    name,
    category: "technical" as const,
    isMentioned: true,
    isDemonstrated: demonstrated,
    supportLevel: demonstrated ? ("demonstrated" as const) : ("mentioned" as const),
    confidence: demonstrated ? 0.9 : 0.5,
    evidenceIds: [],
    evidence: demonstrated
      ? [{ text: `Evidence for ${name}`, source: "project" as const, confidence: "high" as const }]
      : [],
  };
}

// ──────────────────────────────────────────────
// Basic scoring
// ──────────────────────────────────────────────

describe("computeMatch — basic scoring", () => {
  it("returns perfect score when all critical skills are demonstrated", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", true), makeSkill("React", true)],
    });
    const job = makeJob({
      requiredSkills: ["Python"],
      requiredTechnologies: ["React"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.skillsMatch).toBe(100);
    expect(result.gaps.every((g) => g.present && g.demonstrated)).toBe(true);
  });

  it("returns low score when no skills match", () => {
    const profile = makeProfile({
      skills: [makeSkill("Java"), makeSkill("Spring")],
    });
    const job = makeJob({
      requiredSkills: ["Python", "Django", "PostgreSQL"],
      requiredTechnologies: ["AWS"],
    });

    const result = computeMatch(profile, job);

    // Critical skills all missing = 0, but empty important/nice-to-have groups = 100
    // Weighted: 0*0.6 + 100*0.25 + 100*0.15 = 40
    expect(result.score.skillsMatch).toBe(40);
    expect(result.gaps.filter((g) => !g.present).length).toBe(4);
  });

  it("returns moderate score for partial match", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", true), makeSkill("SQL", true)],
    });
    const job = makeJob({
      requiredSkills: ["Python"],
      requiredTechnologies: ["React", "SQL", "Docker"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.skillsMatch).toBeGreaterThan(20);
    expect(result.score.skillsMatch).toBeLessThan(100);
  });

  it("scores demonstrated skills higher than mentioned-only", () => {
    const demonstratedProfile = makeProfile({
      skills: [makeSkill("Python", true)],
    });
    const mentionedProfile = makeProfile({
      skills: [makeSkill("Python", false)],
    });
    const job = makeJob({ requiredSkills: ["Python"] });

    const demoResult = computeMatch(demonstratedProfile, job);
    const mentionResult = computeMatch(mentionedProfile, job);

    expect(demoResult.score.skillsMatch).toBeGreaterThan(mentionResult.score.skillsMatch);
  });
});

// ──────────────────────────────────────────────
// Skill gap analysis
// ──────────────────────────────────────────────

describe("computeMatch — skill gaps", () => {
  it("classifies required skills as critical", () => {
    const profile = makeProfile();
    const job = makeJob({ requiredSkills: ["Python", "React"] });

    const result = computeMatch(profile, job);
    const criticalGaps = result.gaps.filter((g) => g.importance === "critical");

    expect(criticalGaps.length).toBe(2);
  });

  it("emits exactly one gap per skill when it appears in multiple job lists", () => {
    const profile = makeProfile({ skills: [makeSkill("React")] });
    const job = makeJob({
      requiredSkills: ["React", "Python"],
      requiredTechnologies: ["React", "Python", "Docker"],
    });

    const result = computeMatch(profile, job);

    const names = result.gaps.map((g) => g.skill);
    expect(names).toEqual(["React", "Python", "Docker"]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the critical importance when a skill is both required and preferred", () => {
    const profile = makeProfile({ skills: [makeSkill("Python")] });
    const job = makeJob({
      requiredSkills: ["Python"],
      preferredSkills: ["Python"],
    });

    const result = computeMatch(profile, job);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].importance).toBe("critical");
  });

  it("dedupes case and whitespace variants of the same skill name", () => {
    const profile = makeProfile({ skills: [makeSkill("PostgreSQL", true)] });
    const job = makeJob({
      requiredSkills: ["PostgreSQL"],
      requiredTechnologies: ["postgresql "],
    });

    const result = computeMatch(profile, job);

    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0].skill).toBe("PostgreSQL");
    expect(result.gaps[0].present).toBe(true);
  });

  it("classifies preferred skills as nice-to-have", () => {
    const profile = makeProfile();
    const job = makeJob({ preferredSkills: ["Machine Learning"] });

    const result = computeMatch(profile, job);

    expect(result.gaps[0].importance).toBe("nice-to-have");
  });

  it("classifies soft skills as important", () => {
    const profile = makeProfile();
    const job = makeJob({ softSkills: ["Communication", "Teamwork"] });

    const result = computeMatch(profile, job);

    expect(result.gaps.every((g) => g.importance === "important")).toBe(true);
  });

  it("includes evidence text for demonstrated skills", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", true)],
    });
    const job = makeJob({ requiredSkills: ["Python"] });

    const result = computeMatch(profile, job);
    const pythonGap = result.gaps.find((g) => g.skill === "Python");

    expect(pythonGap?.present).toBe(true);
    expect(pythonGap?.demonstrated).toBe(true);
    expect(pythonGap?.evidence).toBeTruthy();
  });

  it("detects skills from project technologies", () => {
    const profile = makeProfile({
      projects: [
        {
          name: "Web App",
          description: "A React app",
          technologies: ["React", "TypeScript", "Node.js"],
          highlights: [],
          links: [],
          evidenceIds: [],
        },
      ],
    });
    const job = makeJob({ requiredTechnologies: ["React"] });

    const result = computeMatch(profile, job);
    const reactGap = result.gaps.find((g) => g.skill === "React");

    expect(reactGap?.present).toBe(true);
  });

  it("detects skills from experience technologies", () => {
    const profile = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Developer",
          startDate: "2023-01-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: ["Python", "Django"],
        },
      ],
    });
    const job = makeJob({ requiredTechnologies: ["Python"] });

    const result = computeMatch(profile, job);
    const pythonGap = result.gaps.find((g) => g.skill === "Python");

    expect(pythonGap?.present).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Experience scoring
// ──────────────────────────────────────────────

describe("computeMatch — experience", () => {
  it("returns neutral score when no experience requirements", () => {
    const profile = makeProfile();
    const job = makeJob({ experienceRequirements: [] });

    const result = computeMatch(profile, job);

    expect(result.score.experienceMatch).toBe(75);
  });

  it("returns full score when candidate exceeds required years", () => {
    const profile = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Senior Dev",
          startDate: "2019-01-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: [],
        },
      ],
    });
    const job = makeJob({ experienceRequirements: ["3+ years of experience"] });

    const result = computeMatch(profile, job);

    expect(result.score.experienceMatch).toBe(100);
  });

  it("returns partial score for insufficient experience", () => {
    const profile = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Junior Dev",
          startDate: "2023-06-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: [],
        },
      ],
    });
    const job = makeJob({ experienceRequirements: ["5+ years of experience"] });

    const result = computeMatch(profile, job);

    expect(result.score.experienceMatch).toBeLessThan(50);
  });
});

// ──────────────────────────────────────────────
// Education scoring
// ──────────────────────────────────────────────

describe("computeMatch — education", () => {
  it("returns neutral score when no education requirements", () => {
    const profile = makeProfile();
    const job = makeJob({ educationRequirements: [] });

    const result = computeMatch(profile, job);

    expect(result.score.educationMatch).toBe(75);
  });

  it("returns low score when candidate has no education", () => {
    const profile = makeProfile({ education: [] });
    const job = makeJob({
      educationRequirements: ["BS in Computer Science"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.educationMatch).toBe(25);
  });

  it("returns high score when education field matches", () => {
    const profile = makeProfile({
      education: [
        {
          institution: "MIT",
          degree: "BS",
          field: "Computer Science",
          startDate: "2020-01-01",
          endDate: "2024-01-01",
          coursework: [],
          highlights: [],
        },
      ],
    });
    const job = makeJob({
      educationRequirements: ["BS in Computer Science or related field"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.educationMatch).toBe(85);
  });

  it("returns moderate score when has education but no field match", () => {
    const profile = makeProfile({
      education: [
        {
          institution: "State U",
          degree: "BA",
          field: "English",
          startDate: "2020-01-01",
          endDate: "2024-01-01",
          coursework: [],
          highlights: [],
        },
      ],
    });
    const job = makeJob({
      educationRequirements: ["BS in Computer Science"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.educationMatch).toBe(50);
  });
});

// ──────────────────────────────────────────────
// Student / fresh graduate resume
// ──────────────────────────────────────────────

describe("computeMatch — student resume", () => {
  it("handles no work experience with projects", () => {
    const profile = makeProfile({
      education: [
        {
          institution: "State University",
          degree: "BS",
          field: "Computer Science",
          startDate: "2021-09-01",
          endDate: "2025-05-01",
          coursework: ["Data Structures", "Algorithms"],
          highlights: [],
        },
      ],
      projects: [
        {
          name: "Portfolio Website",
          description: "Personal portfolio",
          technologies: ["React", "TypeScript", "Tailwind CSS"],
          highlights: ["Built responsive UI"],
          links: [],
          evidenceIds: [],
        },
      ],
      skills: [makeSkill("React"), makeSkill("TypeScript")],
    });
    const job = makeJob({
      opportunityType: "internship",
      requiredTechnologies: ["React", "TypeScript"],
      preferredSkills: ["Node.js"],
      experienceRequirements: [],
      educationRequirements: ["Currently pursuing BS in Computer Science"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.overall).toBeGreaterThan(40);
    expect(result.gaps.find((g) => g.skill === "React")?.present).toBe(true);
    expect(result.gaps.find((g) => g.skill === "TypeScript")?.present).toBe(true);
  });
});

// ──────────────────────────────────────────────
// Strengths / Weaknesses / Recommendations
// ──────────────────────────────────────────────

describe("computeMatch — insights", () => {
  it("generates strengths for demonstrated skills", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", true), makeSkill("React", true)],
    });
    const job = makeJob({ requiredSkills: ["Python", "React"] });

    const result = computeMatch(profile, job);

    expect(result.strengths.length).toBeGreaterThan(0);
    expect(result.strengths.some((s) => s.includes("Demonstrated"))).toBe(true);
  });

  it("generates weaknesses for missing critical skills", () => {
    const profile = makeProfile();
    const job = makeJob({ requiredSkills: ["Python", "Django"] });

    const result = computeMatch(profile, job);

    expect(result.weaknesses.length).toBeGreaterThan(0);
    expect(result.weaknesses.some((w) => w.includes("Missing"))).toBe(true);
  });

  it("generates recommendations for missing skills", () => {
    const profile = makeProfile();
    const job = makeJob({ requiredSkills: ["Python", "Django", "AWS"] });

    const result = computeMatch(profile, job);

    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.some((r) => r.includes("Build experience"))).toBe(true);
  });

  it("generates recommendation for mentioned-only critical skills", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", false)],
    });
    const job = makeJob({ requiredSkills: ["Python"] });

    const result = computeMatch(profile, job);

    expect(
      result.recommendations.some((r) => r.includes("Strengthen evidence"))
    ).toBe(true);
  });

  it("returns empty weaknesses when all critical skills are demonstrated", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", true), makeSkill("React", true)],
    });
    const job = makeJob({ requiredSkills: ["Python", "React"] });

    const result = computeMatch(profile, job);

    const criticalWeaknesses = result.weaknesses.filter((w) =>
      w.includes("Missing critical")
    );
    expect(criticalWeaknesses.length).toBe(0);
  });
});

// ──────────────────────────────────────────────
// Edge cases
// ──────────────────────────────────────────────

describe("computeMatch — edge cases", () => {
  it("handles empty job requirements gracefully", () => {
    const profile = makeProfile();
    const job = makeJob();

    const result = computeMatch(profile, job);

    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.score.overall).toBeLessThanOrEqual(100);
    expect(result.gaps.length).toBe(0);
  });

  it("handles empty profile gracefully", () => {
    const profile = makeProfile();
    const job = makeJob({
      requiredSkills: ["Python", "React"],
      requiredTechnologies: ["AWS"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.gaps.filter((g) => !g.present).length).toBe(3);
  });

  it("score is always between 0 and 100", () => {
    const profile = makeProfile({
      skills: Array.from({ length: 20 }, (_, i) => makeSkill(`Skill${i}`, true)),
    });
    const job = makeJob({
      requiredSkills: ["Python"],
    });

    const result = computeMatch(profile, job);

    expect(result.score.overall).toBeGreaterThanOrEqual(0);
    expect(result.score.overall).toBeLessThanOrEqual(100);
    expect(result.score.skillsMatch).toBeGreaterThanOrEqual(0);
    expect(result.score.skillsMatch).toBeLessThanOrEqual(100);
  });

  it("returns MatchResult shape with all required fields", () => {
    const profile = makeProfile({ skills: [makeSkill("Python")] });
    const job = makeJob({ requiredSkills: ["Python"] });

    const result: MatchResult = computeMatch(profile, job);

    expect(result).toHaveProperty("score");
    expect(result).toHaveProperty("gaps");
    expect(result).toHaveProperty("strengths");
    expect(result).toHaveProperty("weaknesses");
    expect(result).toHaveProperty("recommendations");
    expect(result.score).toHaveProperty("overall");
    expect(result.score).toHaveProperty("skillsMatch");
    expect(result.score).toHaveProperty("experienceMatch");
    expect(result.score).toHaveProperty("educationMatch");
  });

  it("deduplicates technologies that overlap with skills", () => {
    const profile = makeProfile({
      skills: [makeSkill("Python", true)],
      technologies: [makeSkill("Python")],
    });
    const job = makeJob({ requiredTechnologies: ["Python"] });

    const result = computeMatch(profile, job);
    const pythonGaps = result.gaps.filter((g) => g.skill === "Python");

    expect(pythonGaps.length).toBe(1);
    expect(pythonGaps[0].present).toBe(true);
  });

  it("substring matching works for multi-word skills", () => {
    const profile = makeProfile({
      skills: [makeSkill("machine learning", true)],
    });
    const job = makeJob({ requiredSkills: ["Machine Learning"] });

    const result = computeMatch(profile, job);
    const mlGap = result.gaps.find((g) => g.skill === "Machine Learning");

    expect(mlGap?.present).toBe(true);
  });

  it("recommendations are limited to 6 items", () => {
    const profile = makeProfile();
    const job = makeJob({
      requiredSkills: Array.from({ length: 10 }, (_, i) => `Skill${i}`),
      preferredSkills: Array.from({ length: 10 }, (_, i) => `Pref${i}`),
      softSkills: Array.from({ length: 5 }, (_, i) => `Soft${i}`),
    });

    const result = computeMatch(profile, job);

    expect(result.recommendations.length).toBeLessThanOrEqual(6);
  });
});

// ──────────────────────────────────────────────
// DAY 3C — BUG 3: education short-token matching
// ──────────────────────────────────────────────

describe("DAY 3C — education short-token matching (BUG 3)", () => {
  const bsCs = {
    institution: "State U",
    degree: "BS",
    field: "Computer Science",
    startDate: "2020-01-01",
    endDate: "2024-01-01",
    coursework: [],
    highlights: [],
  };

  it("matches when the requirement is expressed only via short tokens (BS/MS/CS/IT)", () => {
    const profile = makeProfile({ education: [bsCs] });
    const job = makeJob({ educationRequirements: ["BS/MS in CS or IT"] });

    // The old filter (w.length > 3) dropped every token here → always 50.
    expect(computeMatch(profile, job).score.educationMatch).toBe(85);
  });

  it("matches a bare BS requirement against a BSc degree (abbreviation alias)", () => {
    const profile = makeProfile({
      education: [{ ...bsCs, degree: "BSc" }],
    });
    const job = makeJob({ educationRequirements: ["BS required"] });

    expect(computeMatch(profile, job).score.educationMatch).toBe(85);
  });

  it("does not match short tokens inside unrelated words (MA vs Machine)", () => {
    const profile = makeProfile({
      education: [{ ...bsCs, field: "Machine Learning" }],
    });
    const job = makeJob({ educationRequirements: ["MA"] });

    // Substring matching would find "ma" inside "machine" — tokens must not.
    expect(computeMatch(profile, job).score.educationMatch).toBe(50);
  });

  it("matches IT as a whole token only", () => {
    const profileIT = makeProfile({
      education: [{ ...bsCs, field: "IT" }],
    });
    const profileSpelledOut = makeProfile({
      education: [{ ...bsCs, field: "Information Technology" }],
    });
    const job = makeJob({ educationRequirements: ["Bachelor's degree in IT"] });

    expect(computeMatch(profileIT, job).score.educationMatch).toBe(85);
    // Spelled-out "Information Technology" is not aliased to "IT"
    // (documented limitation — the token itself must appear).
    expect(computeMatch(profileSpelledOut, job).score.educationMatch).toBe(50);
  });
});

// ──────────────────────────────────────────────
// DAY 3C — BUG 4: experience overlap double-counting
// ──────────────────────────────────────────────

describe("DAY 3C — experience overlap counting (BUG 4)", () => {
  const role = (company: string, startDate: string, endDate: string) => ({
    company,
    role: "Developer",
    startDate,
    endDate,
    description: "",
    highlights: [],
    technologies: [],
  });

  it("counts overlapping concurrent roles only once", () => {
    const profile = makeProfile({
      experience: [
        role("A", "2020-01-01", "2022-01-01"), // 24 months
        role("B", "2021-01-01", "2023-01-01"), // 24 months, 12 overlap
      ],
    });
    const job = makeJob({ experienceRequirements: ["4+ years of experience"] });

    // Union = 36 months = 3 years (old code summed 48 months → 4 years → 100).
    // 3 < 4 but ≥ 2 → 50 + (3/4)*50 = 88.
    expect(computeMatch(profile, job).score.experienceMatch).toBe(88);
  });

  it("counts duplicated identical roles only once", () => {
    const profile = makeProfile({
      experience: [
        role("A", "2021-01-01", "2022-01-01"),
        role("A", "2021-01-01", "2022-01-01"),
      ],
    });
    const job = makeJob({ experienceRequirements: ["2+ years of experience"] });

    // Union = 12 months = 1 year (old code summed 24 months → 100).
    // 1 ≥ 1 (half of 2) → 50 + (1/2)*50 = 75.
    expect(computeMatch(profile, job).score.experienceMatch).toBe(75);
  });

  it("ignores entries with inverted date ranges instead of subtracting months", () => {
    const profile = makeProfile({
      experience: [
        role("Bad", "2023-01-01", "2021-01-01"), // inverted — must be skipped
        role("Good", "2020-01-01", "2021-01-01"), // 12 months
      ],
    });
    const job = makeJob({ experienceRequirements: ["1+ years of experience"] });

    // Old code added -24 + 12 = -12 months → clamped to 0 years → score 0.
    expect(computeMatch(profile, job).score.experienceMatch).toBe(100);
  });

  it("sums non-overlapping roles normally", () => {
    const profile = makeProfile({
      experience: [
        role("A", "2019-01-01", "2021-01-01"), // 24 months
        role("B", "2022-01-01", "2024-01-01"), // 24 months, 12-month gap
      ],
    });
    const job = makeJob({ experienceRequirements: ["4+ years of experience"] });

    // 48 months = 4 years → full score (proves merging does not over-merge).
    expect(computeMatch(profile, job).score.experienceMatch).toBe(100);
  });
});

// ──────────────────────────────────────────────
// DAY 3C — BUG 5: experience requirement parsing
// ──────────────────────────────────────────────

describe("DAY 3C — experience requirement parsing (BUG 5)", () => {
  it("parses ranges, using the lower bound as the requirement", () => {
    expect(parseExperienceRequirement("3-5 years")).toEqual({ minYears: 3, maxYears: 5 });
    expect(parseExperienceRequirement("3 to 5 years of experience")).toEqual({
      minYears: 3,
      maxYears: 5,
    });
    expect(parseExperienceRequirement("6-12 months")).toEqual({ minYears: 0.5, maxYears: 1 });
    expect(parseExperienceRequirement("3–5 years")).toEqual({ minYears: 3, maxYears: 5 });
  });

  it("parses month-only requirements into fractional years", () => {
    expect(parseExperienceRequirement("6 months")).toEqual({ minYears: 0.5, maxYears: null });
    expect(parseExperienceRequirement("18 months")).toEqual({ minYears: 1.5, maxYears: null });
  });

  it("parses upper-bound phrasing", () => {
    expect(parseExperienceRequirement("under 2 years")).toEqual({ minYears: null, maxYears: 2 });
    expect(parseExperienceRequirement("up to 2 years")).toEqual({ minYears: null, maxYears: 2 });
    expect(parseExperienceRequirement("no more than 18 months")).toEqual({
      minYears: null,
      maxYears: 1.5,
    });
  });

  it("parses lower-bound and plus phrasing", () => {
    expect(parseExperienceRequirement("1+ years")).toEqual({ minYears: 1, maxYears: null });
    expect(parseExperienceRequirement("at least 3 years")).toEqual({ minYears: 3, maxYears: null });
    expect(parseExperienceRequirement("5+ years of professional experience")).toEqual({
      minYears: 5,
      maxYears: null,
    });
  });

  it("returns null bounds for requirements without durations", () => {
    expect(parseExperienceRequirement("Currently pursuing a degree")).toEqual({
      minYears: null,
      maxYears: null,
    });
    expect(parseExperienceRequirement("Passion for learning")).toEqual({
      minYears: null,
      maxYears: null,
    });
  });

  it("aggregates the strictest bounds across requirements", () => {
    expect(extractExperienceRequirementBounds(["1+ years", "3-5 years"])).toEqual({
      minYears: 3,
      maxYears: 5,
    });
    expect(extractExperienceRequirementBounds(["0-2 years"])).toEqual({
      minYears: null,
      maxYears: 2,
    });
    expect(extractExperienceRequirementBounds(["under 2 years", "6 months"])).toEqual({
      minYears: 0.5,
      maxYears: 2,
    });
  });

  it("scores a range requirement against its lower bound, not its upper", () => {
    // 4 years of experience satisfies "3-5 years" (old parser read it as 5).
    const profile = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Dev",
          startDate: "2020-01-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: [],
        },
      ],
    });
    const job = makeJob({ experienceRequirements: ["3-5 years of experience"] });

    expect(computeMatch(profile, job).score.experienceMatch).toBe(100);
  });

  it("scores month-scale requirements against months of experience", () => {
    const profile = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Intern",
          startDate: "2023-06-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: [],
        },
      ],
    });
    const job = makeJob({ experienceRequirements: ["6 months"] });

    // 7 months ≥ 6 months → full score (old parser could not read months →
    // neutral 75 regardless of the candidate's actual experience).
    expect(computeMatch(profile, job).score.experienceMatch).toBe(100);
  });

  it("treats upper-bound-only requirements as satisfied below the ceiling", () => {
    const within = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Intern",
          startDate: "2022-06-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: [],
        },
      ],
    });
    const beyond = makeProfile({
      experience: [
        {
          company: "Corp",
          role: "Senior",
          startDate: "2015-01-01",
          endDate: "2024-01-01",
          description: "",
          highlights: [],
          technologies: [],
        },
      ],
    });
    const job = makeJob({ experienceRequirements: ["under 2 years"] });

    // 1.5 years ≤ 2 → 100; 9 years exceeds the ceiling → over-qualified,
    // scored neutrally at 75 rather than penalized.
    expect(computeMatch(within, job).score.experienceMatch).toBe(100);
    expect(computeMatch(beyond, job).score.experienceMatch).toBe(75);
  });
});
