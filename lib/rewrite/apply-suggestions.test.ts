import { describe, it, expect } from "vitest";
import type { CandidateProfile, RewriteSuggestion, Skill } from "@/types";
import { applySuggestionsToProfile } from "./apply-suggestions";

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

function makeProfile(overrides?: Partial<CandidateProfile>): CandidateProfile {
  return {
    fullName: "Test Candidate",
    email: "test@example.com",
    phone: "555-0100",
    location: "San Francisco, CA",
    summary: "Software developer with Python and React experience.",
    education: [
      {
        institution: "State University",
        degree: "BS",
        field: "Computer Science",
        startDate: "2021-09",
        endDate: "2025-06",
        coursework: ["Data Structures", "Algorithms"],
        highlights: ["Dean's List, 3 semesters"],
      },
    ],
    experience: [
      {
        company: "TechStartup",
        role: "Software Engineering Intern",
        startDate: "2024-06",
        endDate: "2024-09",
        description: "Built REST APIs using Python and Flask.",
        highlights: ["Developed 5 API endpoints", "Improved query performance by 30%"],
        technologies: ["Python", "Flask", "PostgreSQL"],
      },
    ],
    projects: [
      {
        name: "E-commerce App",
        description: "Built a React-based e-commerce application with product browsing.",
        technologies: ["React", "TypeScript", "Node.js"],
        highlights: ["Implemented shopping cart", "Built product search"],
        links: [],
        evidenceIds: [],
      },
    ],
    skills: [makeSkill("Python", { isDemonstrated: true, supportLevel: "demonstrated" })],
    softSkills: [],
    technologies: [],
    certifications: [
      { name: "AWS Cloud Practitioner", issuer: "Amazon", date: "2024-03" },
    ],
    achievements: [],
    languages: ["English"],
    links: { other: [] },
    evidence: [],
    potentialIssues: [],
    ...overrides,
  };
}

function makeSuggestion(overrides: Partial<RewriteSuggestion>): RewriteSuggestion {
  return {
    id: "11111111-1111-4111-a111-111111111111",
    section: "summary",
    sectionIndex: 0,
    originalText: "original",
    suggestedText: "suggested",
    reason: "because it's better",
    supportingEvidence: [],
    relatedJobRequirements: [],
    confidence: "high",
    status: "accepted",
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe("applySuggestionsToProfile", () => {
  it("ignores pending and rejected suggestions", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({ id: "a", status: "pending", section: "summary", suggestedText: "new summary" }),
      makeSuggestion({ id: "b", status: "rejected", section: "summary", suggestedText: "rejected summary" }),
    ];

    const { profile: result, appliedIds, unresolved } = applySuggestionsToProfile(
      profile,
      suggestions
    );

    expect(result.summary).toBe(profile.summary);
    expect(appliedIds).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it("applies an accepted summary suggestion", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "summary",
        originalText: profile.summary,
        suggestedText: "Full-stack engineer specializing in Python and React.",
      }),
    ];

    const { profile: result, appliedIds } = applySuggestionsToProfile(profile, suggestions);

    expect(result.summary).toBe("Full-stack engineer specializing in Python and React.");
    expect(appliedIds).toEqual(["a"]);
  });

  it("uses editedText instead of suggestedText when status is edited", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "edited",
        section: "summary",
        suggestedText: "AI suggested text",
        editedText: "My own edited text",
      }),
    ];

    const { profile: result } = applySuggestionsToProfile(profile, suggestions);

    expect(result.summary).toBe("My own edited text");
  });

  it("matches an experience description exactly and replaces only that field", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "experience",
        sectionIndex: 0,
        originalText: "Built REST APIs using Python and Flask.",
        suggestedText: "Architected and shipped REST APIs using Python and Flask.",
      }),
    ];

    const { profile: result, appliedIds } = applySuggestionsToProfile(profile, suggestions);

    expect(result.experience[0].description).toBe(
      "Architected and shipped REST APIs using Python and Flask."
    );
    // The highlights array must be untouched.
    expect(result.experience[0].highlights).toEqual(profile.experience[0].highlights);
    expect(appliedIds).toEqual(["a"]);
  });

  it("matches a specific highlight (not the description) when originalText targets it", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "experience",
        sectionIndex: 0,
        originalText: "Improved query performance by 30%",
        suggestedText: "Improved p95 query latency by 30% by adding database indexes",
      }),
    ];

    const { profile: result } = applySuggestionsToProfile(profile, suggestions);

    expect(result.experience[0].highlights).toEqual([
      "Developed 5 API endpoints",
      "Improved p95 query latency by 30% by adding database indexes",
    ]);
    // The description must be untouched.
    expect(result.experience[0].description).toBe(profile.experience[0].description);
  });

  it("matches a project highlight via fuzzy/token-overlap when text is not identical", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "project",
        sectionIndex: 0,
        // Slightly reworded vs. the stored highlight — should still match via
        // token overlap rather than requiring an exact string match.
        originalText: "Implemented the shopping cart",
        suggestedText: "Implemented a persistent shopping cart with saved-for-later items",
      }),
    ];

    const { profile: result, appliedIds, unresolved } = applySuggestionsToProfile(
      profile,
      suggestions
    );

    expect(appliedIds).toEqual(["a"]);
    expect(unresolved).toEqual([]);
    expect(result.projects[0].highlights).toContain(
      "Implemented a persistent shopping cart with saved-for-later items"
    );
  });

  it("marks a suggestion unresolved when its text cannot be confidently matched", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "experience",
        sectionIndex: 0,
        originalText: "Completely unrelated text about something else entirely",
        suggestedText: "Some new text",
      }),
    ];

    const { profile: result, appliedIds, unresolved } = applySuggestionsToProfile(
      profile,
      suggestions
    );

    expect(appliedIds).toEqual([]);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].id).toBe("a");
    expect(result.experience[0].description).toBe(profile.experience[0].description);
  });

  it("marks a suggestion unresolved when sectionIndex points past the array", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "experience",
        sectionIndex: 5,
        originalText: "anything",
        suggestedText: "anything else",
      }),
    ];

    const { appliedIds, unresolved } = applySuggestionsToProfile(profile, suggestions);

    expect(appliedIds).toEqual([]);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].reason).toMatch(/no longer exists/i);
  });

  it("always marks skills-section suggestions unresolved (never auto-applied)", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "skills",
        sectionIndex: 0,
        originalText: "Python, React",
        suggestedText: "React, Python, TypeScript",
      }),
    ];

    const { profile: result, appliedIds, unresolved } = applySuggestionsToProfile(
      profile,
      suggestions
    );

    expect(appliedIds).toEqual([]);
    expect(unresolved).toHaveLength(1);
    expect(result.skills).toEqual(profile.skills);
  });

  it("matches an education highlight and a certification name", () => {
    const profile = makeProfile();
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "education",
        sectionIndex: 0,
        originalText: "Dean's List, 3 semesters",
        suggestedText: "Dean's List for 3 consecutive semesters (top 10% of class)",
      }),
      makeSuggestion({
        id: "b",
        status: "accepted",
        section: "certification",
        sectionIndex: 0,
        originalText: "AWS Cloud Practitioner",
        suggestedText: "AWS Certified Cloud Practitioner",
      }),
    ];

    const { profile: result, appliedIds } = applySuggestionsToProfile(profile, suggestions);

    expect(appliedIds.sort()).toEqual(["a", "b"]);
    expect(result.education[0].highlights).toEqual([
      "Dean's List for 3 consecutive semesters (top 10% of class)",
    ]);
    expect(result.certifications[0].name).toBe("AWS Certified Cloud Practitioner");
  });

  it("never mutates the original profile", () => {
    const profile = makeProfile();
    const originalSummary = profile.summary;
    const suggestions = [
      makeSuggestion({
        id: "a",
        status: "accepted",
        section: "summary",
        suggestedText: "Something completely different",
      }),
    ];

    applySuggestionsToProfile(profile, suggestions);

    expect(profile.summary).toBe(originalSummary);
  });
});
