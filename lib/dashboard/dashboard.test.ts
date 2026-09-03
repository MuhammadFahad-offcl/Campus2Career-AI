import { describe, it, expect } from "vitest";
import type {
  SkillBridgeDay,
  SkillBridgePlan,
  SkillGap,
} from "@/types";
import { getMatchScoreLabel } from "@/lib/scoring/score-labels";
import {
  buildSkillBridgeSummary,
  buildSkillSnapshot,
  deriveNextAction,
  deriveReadinessState,
  formatShortDate,
  getReadinessLabel,
  MAX_TOP_GAPS,
  type ReadinessInput,
} from "@/lib/dashboard/summary-utils";

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

function makeGap(overrides: Partial<SkillGap>): SkillGap {
  return {
    skill: "Some Skill",
    present: false,
    demonstrated: false,
    importance: "important",
    ...overrides,
  };
}

function makeDay(day: number, status: SkillBridgeDay["status"]): SkillBridgeDay {
  return {
    day,
    title: `Day ${day} title`,
    task: `Day ${day} task`,
    reason: "reason",
    expectedEvidence: `evidence-${day}`,
    estimatedMinutes: 60,
    status,
  };
}

function makePlan(statuses: SkillBridgeDay["status"][]): SkillBridgePlan {
  return {
    id: "bridge-1",
    resumeId: "r-1",
    jobTargetId: "j-1",
    analysisId: "a-1",
    prioritySkills: [],
    days: statuses.map((status, i) => makeDay(i + 1, status)),
    createdAt: "2026-08-30T10:00:00Z",
    updatedAt: "2026-08-30T10:00:00Z",
  };
}

function makeBaseInput(): ReadinessInput {
  return {
    hasResume: true,
    profileReady: true,
    hasJobTarget: true,
    hasAnalysis: true,
    hasRewrite: true,
    hasSkillBridge: true,
    skillBridgeComplete: false,
  };
}

// ──────────────────────────────────────────────
// Score labels
// ──────────────────────────────────────────────

describe("getMatchScoreLabel", () => {
  it("labels band boundaries exactly", () => {
    expect(getMatchScoreLabel(80)).toBe("Strong Match");
    expect(getMatchScoreLabel(79)).toBe("Good Match");
    expect(getMatchScoreLabel(60)).toBe("Good Match");
    expect(getMatchScoreLabel(59)).toBe("Moderate Match");
    expect(getMatchScoreLabel(40)).toBe("Moderate Match");
    expect(getMatchScoreLabel(39)).toBe("Weak Match");
    expect(getMatchScoreLabel(20)).toBe("Weak Match");
    expect(getMatchScoreLabel(19)).toBe("Low Match");
    expect(getMatchScoreLabel(0)).toBe("Low Match");
  });

  it("never implies hiring probability", () => {
    for (const score of [0, 25, 50, 75, 100]) {
      const label = getMatchScoreLabel(score);
      expect(label).not.toMatch(/hir|interview|employ|guarant/i);
    }
  });
});

// ──────────────────────────────────────────────
// Skill snapshot
// ──────────────────────────────────────────────

describe("buildSkillSnapshot", () => {
  it("counts matched, partial, and missing correctly", () => {
    const gaps = [
      makeGap({ skill: "Python", present: true, demonstrated: true }),
      makeGap({ skill: "React", present: true, demonstrated: true }),
      makeGap({ skill: "TypeScript", present: true, demonstrated: false }),
      makeGap({ skill: "Docker", present: false, demonstrated: false }),
      makeGap({ skill: "AWS", present: false, demonstrated: false }),
      makeGap({ skill: "FastAPI", present: false, demonstrated: false }),
    ];

    const snapshot = buildSkillSnapshot(gaps);

    expect(snapshot.matched).toBe(2);
    expect(snapshot.partial).toBe(1);
    expect(snapshot.missing).toBe(3);
    expect(snapshot.total).toBe(6);
  });

  it("counts only missing critical/important skills as priority gaps", () => {
    const gaps = [
      makeGap({ skill: "Docker", present: false, importance: "critical" }),
      makeGap({ skill: "AWS", present: false, importance: "important" }),
      makeGap({ skill: "Nice", present: false, importance: "nice-to-have" }),
      makeGap({ skill: "TS", present: true, demonstrated: false, importance: "critical" }),
      makeGap({ skill: "Py", present: true, demonstrated: true, importance: "critical" }),
    ];

    expect(buildSkillSnapshot(gaps).priorityGapCount).toBe(2);
  });

  it("orders top gaps: critical missing → important missing → critical partial", () => {
    const gaps = [
      makeGap({ skill: "NiceOne", present: false, importance: "nice-to-have" }),
      makeGap({ skill: "ImpMissing", present: false, importance: "important" }),
      makeGap({ skill: "CritPartial", present: true, demonstrated: false, importance: "critical" }),
      makeGap({ skill: "CritMissing", present: false, importance: "critical" }),
      makeGap({ skill: "Matched", present: true, demonstrated: true, importance: "critical" }),
    ];

    const snapshot = buildSkillSnapshot(gaps);

    expect(snapshot.topGaps.map((g) => g.skill)).toEqual([
      "CritMissing",
      "ImpMissing",
      "CritPartial",
    ]);
  });

  it("limits top gaps to 3", () => {
    const gaps = Array.from({ length: 8 }, (_, i) =>
      makeGap({ skill: `Missing${i}`, present: false, importance: "critical" })
    );

    expect(buildSkillSnapshot(gaps).topGaps).toHaveLength(MAX_TOP_GAPS);
  });

  it("uses stored analysis evidence when available", () => {
    const gaps = [
      makeGap({
        skill: "Docker",
        present: false,
        importance: "critical",
        evidence: "The role requires containerized deployment experience.",
      }),
    ];

    const snapshot = buildSkillSnapshot(gaps);
    expect(snapshot.topGaps[0].explanation).toBe(
      "The role requires containerized deployment experience."
    );
  });

  it("falls back to truthful deterministic text without evidence", () => {
    const missing = buildSkillSnapshot([
      makeGap({ skill: "Docker", present: false, importance: "critical" }),
    ]);
    expect(missing.topGaps[0].explanation).toContain(
      "no demonstrated Docker evidence"
    );

    const partial = buildSkillSnapshot([
      makeGap({ skill: "AWS", present: true, demonstrated: false, importance: "important" }),
    ]);
    expect(partial.topGaps[0].explanation).toContain(
      "mentioned in your resume but not yet demonstrated"
    );
  });

  it("does not mutate the input gaps", () => {
    const gaps = [
      makeGap({ skill: "A", present: false, importance: "critical" }),
      makeGap({ skill: "B", present: false, importance: "critical" }),
    ];
    const copy = [...gaps];

    buildSkillSnapshot(gaps);

    expect(gaps).toEqual(copy);
  });

  it("handles an empty gap list without fabricating data", () => {
    const snapshot = buildSkillSnapshot([]);
    expect(snapshot).toEqual({
      matched: 0,
      partial: 0,
      missing: 0,
      priorityGapCount: 0,
      total: 0,
      topGaps: [],
    });
  });
});

// ──────────────────────────────────────────────
// Skill Bridge summary
// ──────────────────────────────────────────────

describe("buildSkillBridgeSummary", () => {
  it("summarizes an untouched plan (0/7)", () => {
    const summary = buildSkillBridgeSummary(
      makePlan(["pending", "pending", "pending", "pending", "pending", "pending", "pending"])
    );

    expect(summary.completedDays).toBe(0);
    expect(summary.totalDays).toBe(7);
    expect(summary.percentage).toBe(0);
    expect(summary.readyToApply).toBe(false);
    expect(summary.currentDay).toBe(1);
    expect(summary.currentDayTitle).toBe("Day 1 title");
    expect(summary.currentDayTask).toBe("Day 1 task");
    expect(summary.currentDayEvidence).toBe("evidence-1");
  });

  it("summarizes a partially complete plan (3/7)", () => {
    const summary = buildSkillBridgeSummary(
      makePlan(["completed", "completed", "completed", "in_progress", "pending", "pending", "pending"])
    );

    expect(summary.completedDays).toBe(3);
    expect(summary.percentage).toBe(43);
    expect(summary.readyToApply).toBe(false);
    expect(summary.currentDay).toBe(4);
  });

  it("marks a fully complete plan ready to apply with no current day", () => {
    const summary = buildSkillBridgeSummary(
      makePlan(["completed", "completed", "completed", "completed", "completed", "completed", "completed"])
    );

    expect(summary.completedDays).toBe(7);
    expect(summary.percentage).toBe(100);
    expect(summary.readyToApply).toBe(true);
    expect(summary.currentDay).toBeNull();
    expect(summary.currentDayTitle).toBeNull();
    expect(summary.currentDayTask).toBeNull();
    expect(summary.currentDayEvidence).toBeNull();
  });
});

// ──────────────────────────────────────────────
// Readiness labels
// ──────────────────────────────────────────────

describe("getReadinessLabel", () => {
  it("labels every readiness state without implying hiring probability", () => {
    const labels = [
      "NO_RESUME",
      "PROFILE_PENDING",
      "READY_FOR_JOB_MATCH",
      "ANALYSIS_COMPLETE",
      "REVIEW_RECOMMENDATIONS",
      "IMPROVE_PRIORITY_GAPS",
      "READY_TO_APPLY",
    ] as const;

    for (const state of labels) {
      const label = getReadinessLabel(state);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/hir|interview|employ|guarant|probab/i);
    }
  });
});

// ──────────────────────────────────────────────
// Readiness ladder
// ──────────────────────────────────────────────

describe("deriveReadinessState", () => {
  it("returns NO_RESUME when nothing exists", () => {
    expect(
      deriveReadinessState({ ...makeBaseInput(), hasResume: false })
    ).toBe("NO_RESUME");
  });

  it("returns PROFILE_PENDING when the resume has no profile yet", () => {
    expect(
      deriveReadinessState({ ...makeBaseInput(), profileReady: false })
    ).toBe("PROFILE_PENDING");
  });

  it("returns READY_FOR_JOB_MATCH without job target or analysis", () => {
    expect(
      deriveReadinessState({ ...makeBaseInput(), hasJobTarget: false })
    ).toBe("READY_FOR_JOB_MATCH");
    expect(
      deriveReadinessState({ ...makeBaseInput(), hasAnalysis: false })
    ).toBe("READY_FOR_JOB_MATCH");
  });

  it("returns READY_TO_APPLY only when the bridge is fully complete", () => {
    expect(
      deriveReadinessState({ ...makeBaseInput(), skillBridgeComplete: true })
    ).toBe("READY_TO_APPLY");
  });

  it("returns IMPROVE_PRIORITY_GAPS while a bridge is in progress", () => {
    expect(deriveReadinessState(makeBaseInput())).toBe("IMPROVE_PRIORITY_GAPS");
  });

  it("returns REVIEW_RECOMMENDATIONS with analysis but no rewrite and no bridge", () => {
    expect(
      deriveReadinessState({
        ...makeBaseInput(),
        hasRewrite: false,
        hasSkillBridge: false,
      })
    ).toBe("REVIEW_RECOMMENDATIONS");
  });

  it("returns ANALYSIS_COMPLETE when a rewrite exists but no bridge", () => {
    expect(
      deriveReadinessState({ ...makeBaseInput(), hasSkillBridge: false })
    ).toBe("ANALYSIS_COMPLETE");
  });
});

// ──────────────────────────────────────────────
// Next action
// ──────────────────────────────────────────────

describe("deriveNextAction", () => {
  it("recommends uploading a resume first", () => {
    const action = deriveNextAction({
      ...makeBaseInput(),
      hasResume: false,
      currentDay: null,
    });
    expect(action.href).toBe("/analysis");
    expect(action.ctaLabel).toBe("Upload Resume");
  });

  it("recommends finishing the profile analysis", () => {
    const action = deriveNextAction({
      ...makeBaseInput(),
      profileReady: false,
      currentDay: null,
    });
    expect(action.href).toBe("/analysis");
    expect(action.ctaLabel).toBe("Analyze Resume");
  });

  it("recommends analyzing a job without a job target", () => {
    const action = deriveNextAction({
      ...makeBaseInput(),
      hasJobTarget: false,
      currentDay: null,
    });
    expect(action.href).toBe("/job-matcher");
    expect(action.ctaLabel).toBe("Open Job Matcher");
  });

  it("recommends continuing the current bridge day", () => {
    const action = deriveNextAction({ ...makeBaseInput(), currentDay: 4 });
    expect(action.title).toBe("Continue Day 4");
    expect(action.href).toBe("/skill-bridge");
    expect(action.ctaLabel).toBe("Continue Skill Bridge");
  });

  it("recommends optimizing the resume when no rewrite exists", () => {
    const action = deriveNextAction({
      ...makeBaseInput(),
      hasRewrite: false,
      hasSkillBridge: false,
      currentDay: null,
    });
    expect(action.href).toBe("/resume");
    expect(action.ctaLabel).toBe("Open Rewrite");
  });

  it("recommends starting the bridge when no plan exists", () => {
    const action = deriveNextAction({
      ...makeBaseInput(),
      hasSkillBridge: false,
      currentDay: null,
    });
    expect(action.href).toBe("/skill-bridge");
    expect(action.ctaLabel).toBe("Start Skill Bridge");
  });

  it("recommends reviewing and applying when the bridge is complete", () => {
    const action = deriveNextAction({
      ...makeBaseInput(),
      skillBridgeComplete: true,
      currentDay: null,
    });
    expect(action.href).toBe("/resume");
    expect(action.ctaLabel).toBe("Open Rewrite");
    expect(action.title.toLowerCase()).toContain("apply");
  });
});

// ──────────────────────────────────────────────
// Formatting
// ──────────────────────────────────────────────

describe("formatShortDate", () => {
  it("formats a Postgres TIMESTAMPTZ string", () => {
    expect(formatShortDate("2026-08-31T09:13:46.448907+00:00")).toMatch(
      /Aug 3[01], 2026/
    );
  });

  it("returns an empty string for invalid input", () => {
    expect(formatShortDate("not-a-date")).toBe("");
  });
});
