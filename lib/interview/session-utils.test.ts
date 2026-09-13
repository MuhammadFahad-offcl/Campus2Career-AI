import { describe, it, expect } from "vitest";
import type { InterviewQuestion, JobTarget, SkillGap } from "@/types";
import {
  buildFocusAreas,
  calculateOverallScore,
  calculateScoreBreakdown,
  coerceCategory,
  correlateWithSkillGaps,
  correlationSentence,
  countAnsweredQuestions,
  countMainQuestions,
  hasReachedQuestionCap,
  lastQuestionWasFollowUp,
  MAX_FOCUS_AREAS,
  sanitizeTargetSkill,
} from "./session-utils";

// ──────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────

function makeJobTarget(overrides?: Partial<JobTarget>): JobTarget {
  return {
    id: "job-1",
    title: "Backend Engineer Intern",
    company: "Acme Corp",
    location: "Remote",
    description: "Build backend services.",
    opportunityType: "internship",
    requiredSkills: ["PostgreSQL", "Node.js"],
    preferredSkills: ["Docker"],
    requiredTechnologies: ["REST APIs"],
    responsibilities: ["Build and maintain APIs"],
    experienceRequirements: [],
    educationRequirements: [],
    softSkills: [],
    domainRequirements: [],
    extractedRequirements: [],
    parsingStatus: "completed",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeGap(overrides?: Partial<SkillGap>): SkillGap {
  return {
    skill: "PostgreSQL",
    present: false,
    demonstrated: false,
    importance: "critical",
    ...overrides,
  };
}

function makeQuestion(overrides?: Partial<InterviewQuestion>): InterviewQuestion {
  return {
    number: 1,
    category: "technical",
    question: "Tell me about a project.",
    isFollowUp: false,
    askedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const FULL_EVALUATION_LOW = {
  relevance: 40,
  clarity: 40,
  technicalAccuracy: 30,
  depth: 30,
  communication: 40,
  evidenceScore: 30,
  unsupportedClaim: false,
};

const FULL_EVALUATION_HIGH = {
  relevance: 90,
  clarity: 90,
  technicalAccuracy: 90,
  depth: 90,
  communication: 90,
  evidenceScore: 90,
  unsupportedClaim: false,
};

// ──────────────────────────────────────────────
// buildFocusAreas
// ──────────────────────────────────────────────

describe("buildFocusAreas", () => {
  it("prioritizes missing critical/important gaps over job requirements", () => {
    const job = makeJobTarget();
    const gaps = [
      makeGap({ skill: "PostgreSQL", present: false, importance: "critical" }),
      makeGap({ skill: "Docker", present: false, importance: "important" }),
      makeGap({ skill: "Communication", present: true, importance: "nice-to-have" }),
    ];
    const areas = buildFocusAreas(job, gaps);
    expect(areas[0]).toBe("PostgreSQL");
    expect(areas[1]).toBe("Docker");
    // Job requirements/technologies fill the rest.
    expect(areas).toContain("Node.js");
  });

  it("deduplicates case-insensitively and never exceeds MAX_FOCUS_AREAS", () => {
    const job = makeJobTarget({
      requiredSkills: ["postgresql", "Node.js", "Go", "Rust", "Java", "C++", "Kotlin"],
      requiredTechnologies: [],
    });
    const gaps = [makeGap({ skill: "PostgreSQL" })];
    const areas = buildFocusAreas(job, gaps);
    expect(areas.length).toBeLessThanOrEqual(MAX_FOCUS_AREAS);
    // "PostgreSQL" (gap) and "postgresql" (job skill) collapse to one entry.
    expect(areas.filter((a) => a.toLowerCase() === "postgresql")).toHaveLength(1);
  });

  it("returns an empty array when there are no gaps or requirements", () => {
    const job = makeJobTarget({ requiredSkills: [], requiredTechnologies: [] });
    expect(buildFocusAreas(job, [])).toEqual([]);
  });
});

// ──────────────────────────────────────────────
// coerceCategory
// ──────────────────────────────────────────────

describe("coerceCategory", () => {
  it("allows a category that matches the interview type", () => {
    expect(coerceCategory("technical", "technical")).toBe("technical");
    expect(coerceCategory("mixed", "problem_solving")).toBe("problem_solving");
  });

  it("falls back to the type's first allowed category on drift", () => {
    expect(coerceCategory("technical", "hr")).toBe("technical");
    expect(coerceCategory("behavioral", "technical")).toBe("behavioral");
    expect(coerceCategory("hr", "behavioral")).toBe("hr");
  });
});

// ──────────────────────────────────────────────
// sanitizeTargetSkill
// ──────────────────────────────────────────────

describe("sanitizeTargetSkill", () => {
  it("accepts a targetSkill matching a real requirement or gap", () => {
    const job = makeJobTarget();
    const gaps = [makeGap({ skill: "Redis" })];
    expect(sanitizeTargetSkill("PostgreSQL", job, gaps)).toBe("PostgreSQL");
    expect(sanitizeTargetSkill("redis", job, gaps)).toBe("Redis");
  });

  it("discards an invented skill name not present anywhere", () => {
    const job = makeJobTarget();
    expect(sanitizeTargetSkill("Quantum Computing", job, [])).toBeUndefined();
  });

  it("returns undefined for empty/whitespace input", () => {
    const job = makeJobTarget();
    expect(sanitizeTargetSkill(undefined, job, [])).toBeUndefined();
    expect(sanitizeTargetSkill("   ", job, [])).toBeUndefined();
  });
});

// ──────────────────────────────────────────────
// Question-count cap
// ──────────────────────────────────────────────

describe("question count cap", () => {
  it("counts only main questions, not follow-ups", () => {
    const questions = [
      makeQuestion({ number: 1, isFollowUp: false }),
      makeQuestion({ number: 2, isFollowUp: true }),
      makeQuestion({ number: 3, isFollowUp: false }),
    ];
    expect(countMainQuestions(questions)).toBe(2);
  });

  it("counts only answered questions", () => {
    const questions = [
      makeQuestion({ number: 1, answer: "yes" }),
      makeQuestion({ number: 2 }),
      makeQuestion({ number: 3, answer: "" }),
    ];
    expect(countAnsweredQuestions(questions)).toBe(1);
  });

  it("reaches the cap only once main questions meet the configured count", () => {
    const five = [1, 2, 3, 4, 5].map((n) => makeQuestion({ number: n }));
    expect(hasReachedQuestionCap(five, 5)).toBe(true);
    expect(hasReachedQuestionCap(five.slice(0, 4), 5)).toBe(false);
  });

  it("follow-ups never count toward the cap", () => {
    const questions = [
      makeQuestion({ number: 1 }),
      makeQuestion({ number: 2, isFollowUp: true }),
      makeQuestion({ number: 3, isFollowUp: true }),
    ];
    expect(hasReachedQuestionCap(questions, 5)).toBe(false);
  });

  it("detects when the last question was a follow-up", () => {
    const questions = [makeQuestion({ number: 1 }), makeQuestion({ number: 2, isFollowUp: true })];
    expect(lastQuestionWasFollowUp(questions)).toBe(true);
    expect(lastQuestionWasFollowUp(questions.slice(0, 1))).toBe(false);
    expect(lastQuestionWasFollowUp([])).toBe(false);
  });
});

// ──────────────────────────────────────────────
// Score aggregation
// ──────────────────────────────────────────────

describe("calculateOverallScore", () => {
  it("returns null when nothing has been evaluated", () => {
    expect(calculateOverallScore([makeQuestion()])).toBeNull();
  });

  it("averages every dimension across every evaluated answer", () => {
    const questions = [
      makeQuestion({ number: 1, evaluation: FULL_EVALUATION_HIGH }),
      makeQuestion({ number: 2, evaluation: FULL_EVALUATION_LOW }),
    ];
    const score = calculateOverallScore(questions);
    expect(score).not.toBeNull();
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(70);
  });

  it("ignores unanswered/unevaluated questions", () => {
    const questions = [
      makeQuestion({ number: 1, evaluation: FULL_EVALUATION_HIGH }),
      makeQuestion({ number: 2 }),
    ];
    expect(calculateOverallScore(questions)).toBe(90);
  });
});

describe("calculateScoreBreakdown", () => {
  it("returns null when nothing has been evaluated", () => {
    expect(calculateScoreBreakdown([makeQuestion()])).toBeNull();
  });

  it("falls back to the overall dimension average for a category with no matching question", () => {
    // A pure-technical interview still gets a non-zero, truthful behavioral estimate.
    const questions = [
      makeQuestion({ number: 1, category: "technical", evaluation: FULL_EVALUATION_HIGH }),
    ];
    const breakdown = calculateScoreBreakdown(questions);
    expect(breakdown).not.toBeNull();
    expect(breakdown!.technical).toBe(90);
    expect(breakdown!.behavioral).toBeGreaterThan(0);
  });

  it("scopes technical/problemSolving/behavioral to their relevant categories", () => {
    const questions = [
      makeQuestion({ number: 1, category: "technical", evaluation: FULL_EVALUATION_HIGH }),
      makeQuestion({ number: 2, category: "behavioral", evaluation: FULL_EVALUATION_LOW }),
    ];
    const breakdown = calculateScoreBreakdown(questions);
    expect(breakdown!.technical).toBe(90);
    // behavioral rows pull from the low-scoring behavioral question only.
    expect(breakdown!.behavioral).toBeLessThan(90);
  });

  it("every dimension stays clamped within 0-100", () => {
    const questions = [makeQuestion({ number: 1, evaluation: FULL_EVALUATION_HIGH })];
    const breakdown = calculateScoreBreakdown(questions)!;
    for (const value of Object.values(breakdown)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});

// ──────────────────────────────────────────────
// Skill-gap correlation
// ──────────────────────────────────────────────

describe("correlateWithSkillGaps", () => {
  it("flags a weak answer whose targetSkill matches a real missing gap", () => {
    const gaps = [makeGap({ skill: "PostgreSQL", present: false })];
    const questions = [
      makeQuestion({
        number: 1,
        category: "technical",
        targetSkill: "PostgreSQL",
        evaluation: FULL_EVALUATION_LOW,
      }),
    ];
    expect(correlateWithSkillGaps(questions, gaps)).toEqual(["PostgreSQL"]);
  });

  it("does not flag a strong answer even on a missing skill", () => {
    const gaps = [makeGap({ skill: "PostgreSQL", present: false })];
    const questions = [
      makeQuestion({
        number: 1,
        category: "technical",
        targetSkill: "PostgreSQL",
        evaluation: FULL_EVALUATION_HIGH,
      }),
    ];
    expect(correlateWithSkillGaps(questions, gaps)).toEqual([]);
  });

  it("does not flag a weak answer on a skill the candidate already has", () => {
    const gaps = [makeGap({ skill: "PostgreSQL", present: true })];
    const questions = [
      makeQuestion({
        number: 1,
        category: "technical",
        targetSkill: "PostgreSQL",
        evaluation: FULL_EVALUATION_LOW,
      }),
    ];
    expect(correlateWithSkillGaps(questions, gaps)).toEqual([]);
  });

  it("ignores non-technical categories and questions without a targetSkill", () => {
    const gaps = [makeGap({ skill: "PostgreSQL", present: false })];
    const questions = [
      makeQuestion({ number: 1, category: "hr", targetSkill: "PostgreSQL", evaluation: FULL_EVALUATION_LOW }),
      makeQuestion({ number: 2, category: "technical", evaluation: FULL_EVALUATION_LOW }),
    ];
    expect(correlateWithSkillGaps(questions, gaps)).toEqual([]);
  });

  it("never invents a correlation for a skill not actually a gap", () => {
    const gaps: SkillGap[] = [];
    const questions = [
      makeQuestion({
        number: 1,
        category: "technical",
        targetSkill: "PostgreSQL",
        evaluation: FULL_EVALUATION_LOW,
      }),
    ];
    expect(correlateWithSkillGaps(questions, gaps)).toEqual([]);
  });
});

describe("correlationSentence", () => {
  it("renders the exact deterministic sentence format", () => {
    expect(correlationSentence("PostgreSQL")).toBe(
      "PostgreSQL is already identified as a skill gap, and your interview responses suggest additional practice is needed."
    );
  });
});
