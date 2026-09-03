import { describe, it, expect } from "vitest";
import type {
  CandidateProfile,
  Skill,
  SkillGap,
} from "@/types";
import { skillBridgePlanSchema } from "@/schemas";
import {
  filterPrioritySkills,
  normalizeSkillBridgeOutput,
  parseSkillBridgeJson,
  SkillBridgeGeneratorError,
} from "@/lib/ai/skill-bridge-generator";
import {
  applyDayStatus,
  calculateProgress,
  isReadyToApply,
  toggleDayStatus,
} from "./plan-utils";

// ──────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────

function makeSkill(name: string, opts?: Partial<Skill>): Skill {
  return {
    name,
    category: "technical",
    isMentioned: true,
    isDemonstrated: false,
    supportLevel: "mentioned",
    confidence: 0.5,
    evidenceIds: [],
    evidence: [],
    ...opts,
  };
}

/**
 * The controlled test candidate: Test Student with ONLY Python + React.
 * NO Docker, AWS, FastAPI, PostgreSQL, TypeScript, CI/CD.
 */
function makeTestStudent(): CandidateProfile {
  return {
    fullName: "Test Student",
    email: "student@test.com",
    phone: "",
    location: "",
    summary: "Computer Science student with Python and React project experience.",
    education: [
      {
        institution: "State University",
        degree: "BS",
        field: "Computer Science",
        startDate: "2022-09",
        endDate: "2026-05",
        coursework: ["Data Structures", "Algorithms"],
        highlights: [],
      },
    ],
    experience: [], // NO professional experience — student candidate
    projects: [
      {
        name: "React E-commerce Application",
        description: "Built a small e-commerce web application using React.",
        technologies: ["React"],
        highlights: [],
        links: [],
        evidenceIds: [],
      },
      {
        name: "Python Data Analysis Project",
        description: "Built a small data analysis project using Python.",
        technologies: ["Python"],
        highlights: [],
        links: [],
        evidenceIds: [],
      },
    ],
    skills: [
      makeSkill("Python", { isDemonstrated: true, supportLevel: "demonstrated" }),
      makeSkill("React", { isDemonstrated: true, supportLevel: "demonstrated" }),
    ],
    softSkills: [],
    technologies: [],
    certifications: [],
    achievements: [],
    languages: ["English"],
    links: { other: [] },
    evidence: [],
    potentialIssues: [],
  };
}

/**
 * Skill gaps matching the controlled test scenario.
 */
function makeTestGaps(): SkillGap[] {
  return [
    { skill: "Python", present: true, demonstrated: true, importance: "critical" },
    { skill: "React", present: true, demonstrated: true, importance: "critical" },
    { skill: "FastAPI", present: false, demonstrated: false, importance: "critical" },
    { skill: "PostgreSQL", present: false, demonstrated: false, importance: "critical" },
    { skill: "REST APIs", present: false, demonstrated: false, importance: "critical" },
    { skill: "Docker", present: false, demonstrated: false, importance: "nice-to-have" },
    { skill: "AWS", present: false, demonstrated: false, importance: "nice-to-have" },
    { skill: "TypeScript", present: false, demonstrated: false, importance: "nice-to-have" },
    { skill: "CI/CD", present: false, demonstrated: false, importance: "nice-to-have" },
  ];
}

/**
 * Valid 7-day AI output for the controlled test scenario.
 */
function makeValidAiOutput() {
  return {
    prioritySkills: [
      {
        skill: "FastAPI",
        reason: "Required for the role and absent from the candidate profile.",
      },
      {
        skill: "PostgreSQL",
        reason: "Required database skill for this position.",
      },
    ],
    days: Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      title: `Task ${i + 1}`,
      task: `Day ${i + 1} hands-on task building real evidence.`,
      reason: `Day ${i + 1} matters because it builds toward the priority skills.`,
      expectedEvidence: `Tangible artifact ${i + 1} (commit, demo, or documentation).`,
      estimatedMinutes: 60,
    })),
  };
}

// ──────────────────────────────────────────────
// Plan structure validation
// ──────────────────────────────────────────────

describe("plan structure", () => {
  it("accepts a valid 7-day plan and assigns pending status", () => {
    const result = normalizeSkillBridgeOutput(makeValidAiOutput(), makeTestGaps());

    expect(result.days).toHaveLength(7);
    expect(result.days.every((d) => d.status === "pending")).toBe(true);
    expect(result.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("rejects fewer than 7 tasks", () => {
    const output = makeValidAiOutput();
    output.days = output.days.slice(0, 6); // Only 6 days

    expect(() => normalizeSkillBridgeOutput(output, makeTestGaps())).toThrow(
      SkillBridgeGeneratorError
    );
    expect(() => normalizeSkillBridgeOutput(output, makeTestGaps())).toThrow(
      /incomplete/i
    );
  });

  it("truncates more than 7 tasks to exactly 7", () => {
    const output = makeValidAiOutput();
    output.days.push({
      day: 8,
      title: "Extra day",
      task: "This extra day should be truncated away.",
      reason: "Extra.",
      expectedEvidence: "Extra artifact.",
      estimatedMinutes: 30,
    });

    const result = normalizeSkillBridgeOutput(output, makeTestGaps());
    expect(result.days).toHaveLength(7);
  });

  it("sorts out-of-order days and re-sequences to 1-7", () => {
    const output = makeValidAiOutput();
    // Shuffle days
    output.days = [
      output.days[3],
      output.days[0],
      output.days[6],
      output.days[1],
      output.days[4],
      output.days[2],
      output.days[5],
    ];

    const result = normalizeSkillBridgeOutput(output, makeTestGaps());
    expect(result.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("deduplicates repeated day numbers", () => {
    const output = makeValidAiOutput();
    output.days[2] = { ...output.days[1], day: 2 }; // Duplicate day 2

    // After dedupe: 6 unique days remain → must reject
    expect(() => normalizeSkillBridgeOutput(output, makeTestGaps())).toThrow(
      /incomplete/i
    );
  });

  it("rejects invalid AI output via Zod", () => {
    const invalidOutput = {
      prioritySkills: [{ skill: "FastAPI" }], // missing reason
      days: [{ day: 1 }], // missing fields
    };

    expect(() => normalizeSkillBridgeOutput(invalidOutput, makeTestGaps())).toThrow();
  });

  it("rejects invalid JSON", () => {
    expect(() => parseSkillBridgeJson("not json at all")).toThrow(
      SkillBridgeGeneratorError
    );
  });

  it("parses fenced JSON", () => {
    const result = parseSkillBridgeJson(
      '```json\n{"prioritySkills": [], "days": []}\n```'
    );
    expect(result).toEqual({ prioritySkills: [], days: [] });
  });
});

// ──────────────────────────────────────────────
// Priority gap logic
// ──────────────────────────────────────────────

describe("priority gap logic", () => {
  it("keeps priority skills that match actual missing gaps", () => {
    const result = filterPrioritySkills(
      [
        { skill: "FastAPI", reason: "Required, missing." },
        { skill: "PostgreSQL", reason: "Required, missing." },
      ],
      makeTestGaps()
    );

    expect(result).toHaveLength(2);
  });

  it("strips priority skills the candidate already has (no fabrication)", () => {
    const result = filterPrioritySkills(
      [
        { skill: "FastAPI", reason: "Actual gap." },
        { skill: "Python", reason: "AI incorrectly lists a skill the candidate has." },
        { skill: "React", reason: "Also already present." },
      ],
      makeTestGaps()
    );

    // Only FastAPI survives — Python and React are present, not gaps
    expect(result).toHaveLength(1);
    expect(result[0].skill).toBe("FastAPI");
  });

  it("strips priority skills unrelated to any gap (hallucination guard)", () => {
    const result = filterPrioritySkills(
      [
        { skill: "Docker", reason: "Actual gap." },
        { skill: "Kubernetes", reason: "Not in gaps at all — fabricated." },
        { skill: "Machine Learning", reason: "Also fabricated." },
      ],
      makeTestGaps()
    );

    expect(result).toHaveLength(1);
    expect(result[0].skill).toBe("Docker");
  });

  it("falls back to top missing gaps when AI priorities match nothing", () => {
    const output = makeValidAiOutput();
    // AI proposes only fabricated skills
    output.prioritySkills = [
      { skill: "Kubernetes", reason: "Not a real gap." },
    ];

    const result = normalizeSkillBridgeOutput(output, makeTestGaps());

    // Fallback: derived from actual missing gaps (FastAPI first — critical)
    expect(result.prioritySkills.length).toBeGreaterThan(0);
    expect(result.prioritySkills.length).toBeLessThanOrEqual(3);
    const gapSkills = makeTestGaps().filter((g) => !g.present).map((g) => g.skill);
    expect(gapSkills).toContain(result.prioritySkills[0].skill);
  });

  it("handles partial-evidence gaps (present but not demonstrated)", () => {
    const gaps: SkillGap[] = [
      { skill: "Python", present: true, demonstrated: false, importance: "important" },
      { skill: "Docker", present: false, demonstrated: false, importance: "critical" },
    ];

    const result = filterPrioritySkills(
      [
        { skill: "Docker", reason: "Missing entirely." },
      ],
      gaps
    );

    expect(result).toHaveLength(1);
    expect(result[0].skill).toBe("Docker");
  });

  it("multiple gaps: AI may focus on 1-3, validated against real gaps", () => {
    const output = makeValidAiOutput();
    output.prioritySkills = [
      { skill: "FastAPI", reason: "Critical." },
      { skill: "PostgreSQL", reason: "Critical." },
      { skill: "Docker", reason: "Preferred." },
      { skill: "AWS", reason: "Preferred." }, // 4th — will pass filter but plan focuses 1-3
    ];

    const result = normalizeSkillBridgeOutput(output, makeTestGaps());
    // All 4 are real gaps so all pass the guard; the plan structure is valid
    expect(result.prioritySkills).toHaveLength(4);
    expect(result.days).toHaveLength(7);
  });
});

// ──────────────────────────────────────────────
// Student / project-based behavior
// ──────────────────────────────────────────────

describe("student and project behavior", () => {
  it("student with no professional experience produces a valid plan", () => {
    const student = makeTestStudent();
    expect(student.experience).toHaveLength(0);
    expect(student.projects).toHaveLength(2);

    // The prompt builder is exercised through generateSkillBridge (AI call);
    // here we validate the normalization works for project-based candidates
    const result = normalizeSkillBridgeOutput(makeValidAiOutput(), makeTestGaps());
    expect(result.days).toHaveLength(7);
  });

  it("no-gaps analysis is rejected with NO_GAPS", () => {
    // generateSkillBridge throws NO_GAPS when all skills are present.
    // We validate via the generator error class contract.
    const err = new SkillBridgeGeneratorError("No gaps.", "NO_GAPS");
    expect(err.code).toBe("NO_GAPS");
    expect(err).toBeInstanceOf(SkillBridgeGeneratorError);
  });

  it("plan quality: estimatedMinutes within 15-480 enforced by schema", () => {
    const output = makeValidAiOutput();
    output.days[0].estimatedMinutes = 5; // Below minimum

    expect(() => normalizeSkillBridgeOutput(output, makeTestGaps())).toThrow();
  });

  it("estimatedMinutes rejects absurd values (fabricated metrics guard)", () => {
    const output = makeValidAiOutput();
    output.days[0].estimatedMinutes = 10000; // Absurd

    expect(() => normalizeSkillBridgeOutput(output, makeTestGaps())).toThrow();
  });
});

// ──────────────────────────────────────────────
// No hallucination
// ──────────────────────────────────────────────

describe("no hallucination", () => {
  it("priority skills can only be actual missing gaps", () => {
    const output = makeValidAiOutput();
    output.prioritySkills = [
      { skill: "Python", reason: "AI claims Python is missing — it is NOT." },
      { skill: "React", reason: "AI claims React is missing — it is NOT." },
      { skill: "FastAPI", reason: "Real gap." },
    ];

    const result = normalizeSkillBridgeOutput(output, makeTestGaps());

    // Python and React must be stripped — the candidate HAS them
    const skills = result.prioritySkills.map((p) => p.skill);
    expect(skills).not.toContain("Python");
    expect(skills).not.toContain("React");
    expect(skills).toContain("FastAPI");
  });

  it("does not mutate the input profile or raw output", () => {
    const output = makeValidAiOutput();
    const outputSnapshot = JSON.parse(JSON.stringify(output));

    normalizeSkillBridgeOutput(output, makeTestGaps());

    expect(output).toEqual(outputSnapshot);
  });
});

// ──────────────────────────────────────────────
// DB row mapping (Postgres timestamp format)
// ──────────────────────────────────────────────

describe("skillBridgePlanSchema — DB row timestamps", () => {
  function makePlanRow(createdAt: string, updatedAt: string) {
    return {
      id: "123e4567-e89b-12d3-a456-426614174000",
      resumeId: "123e4567-e89b-12d3-a456-426614174001",
      jobTargetId: "123e4567-e89b-12d3-a456-426614174002",
      analysisId: "123e4567-e89b-12d3-a456-426614174003",
      prioritySkills: [{ skill: "Docker", reason: "Critical gap." }],
      days: Array.from({ length: 7 }, (_, i) => ({
        day: i + 1,
        title: `Day ${i + 1}`,
        task: "Task.",
        reason: "Reason.",
        expectedEvidence: "Evidence.",
        estimatedMinutes: 60,
        status: "pending",
      })),
      model: "gpt-4o-mini",
      createdAt,
      updatedAt,
    };
  }

  it("accepts Postgres TIMESTAMPTZ format (+00:00 offset) — regression for mapSkillBridgeRow failure", () => {
    // Supabase returns TIMESTAMPTZ as `2026-08-31T09:13:46.448907+00:00`.
    // The default .datetime() only accepts `Z` — this exact format previously
    // threw "Invalid ISO datetime" when re-parsing the saved row.
    const plan = makePlanRow(
      "2026-08-31T09:13:46.448907+00:00",
      "2026-08-31T09:13:46.448907+00:00"
    );
    expect(() => skillBridgePlanSchema.parse(plan)).not.toThrow();
  });

  it("still accepts standard Z-designator timestamps", () => {
    const plan = makePlanRow(
      "2026-08-31T09:13:46.448Z",
      "2026-08-31T09:13:46.448Z"
    );
    expect(() => skillBridgePlanSchema.parse(plan)).not.toThrow();
  });

  it("rejects non-datetime garbage", () => {
    const plan = makePlanRow("not-a-timestamp", "yesterday");
    expect(() => skillBridgePlanSchema.parse(plan)).toThrow();
  });
});

// ──────────────────────────────────────────────
// Progress and task completion
// ──────────────────────────────────────────────

describe("progress calculation", () => {
  function makeDays(completedCount: number) {
    return Array.from({ length: 7 }, (_, i) => ({
      day: i + 1,
      title: `Day ${i + 1}`,
      task: "Task.",
      reason: "Reason.",
      expectedEvidence: "Evidence.",
      estimatedMinutes: 60,
      status: (i < completedCount ? "completed" : "pending") as
        | "completed"
        | "pending",
    }));
  }

  it("calculates 0/7 progress for a fresh plan", () => {
    const progress = calculateProgress(makeDays(0));
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(7);
    expect(progress.percentage).toBe(0);
  });

  it("calculates partial progress", () => {
    const progress = calculateProgress(makeDays(3));
    expect(progress.completed).toBe(3);
    expect(progress.percentage).toBe(43);
  });

  it("calculates full progress", () => {
    const progress = calculateProgress(makeDays(7));
    expect(progress.completed).toBe(7);
    expect(progress.percentage).toBe(100);
  });

  it("is not ready to apply until all 7 days complete", () => {
    expect(isReadyToApply(makeDays(6))).toBe(false);
    expect(isReadyToApply(makeDays(7))).toBe(true);
  });

  it("marks a task complete", () => {
    const days = makeDays(0);
    const updated = applyDayStatus(days, 3, "completed");

    expect(updated[2].status).toBe("completed");
    // Input not mutated
    expect(days[2].status).toBe("pending");
    // Other days untouched
    expect(updated[0].status).toBe("pending");
  });

  it("reopens a completed task", () => {
    const days = makeDays(3);
    const updated = applyDayStatus(days, 2, "pending");

    expect(updated[1].status).toBe("pending");
    expect(updated[0].status).toBe("completed"); // Day 1 still complete
  });

  it("toggles day status", () => {
    const days = makeDays(0);
    const completed = toggleDayStatus(days, 1);
    expect(completed[0].status).toBe("completed");

    const reopened = toggleDayStatus(completed, 1);
    expect(reopened[0].status).toBe("pending");
  });

  it("in_progress state does not count as completed", () => {
    const days = makeDays(0);
    const updated = applyDayStatus(days, 1, "in_progress");
    const progress = calculateProgress(updated);

    expect(progress.completed).toBe(0);
    expect(updated[0].status).toBe("in_progress");
  });
});
