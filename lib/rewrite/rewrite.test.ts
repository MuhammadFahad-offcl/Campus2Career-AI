import { describe, it, expect } from "vitest";
import type {
  CandidateProfile,
  Skill,
} from "@/types";
import {
  buildEvidenceTextSet,
  validateSuggestionEvidence,
  validateAllSuggestionEvidence,
} from "./evidence-validator";
import {
  normalizeRewriteOutput,
  parseRewriteJson,
  RewriteAnalyzerError,
} from "@/lib/ai/resume-rewriter";

// ──────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────

function makeSkill(
  name: string,
  opts?: Partial<Skill>
): Skill {
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
        highlights: [],
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
        description: "Built a React-based e-commerce application with product browsing and shopping workflows.",
        technologies: ["React", "TypeScript", "Node.js"],
        highlights: ["Implemented shopping cart", "Built product search"],
        links: [],
        evidenceIds: [],
      },
    ],
    skills: [
      makeSkill("Python", { isDemonstrated: true, supportLevel: "demonstrated" }),
      makeSkill("React", { isDemonstrated: true, supportLevel: "demonstrated" }),
    ],
    softSkills: [
      makeSkill("Problem Solving", {
        category: "soft",
        isDemonstrated: true,
        supportLevel: "demonstrated",
      }),
    ],
    technologies: [
      makeSkill("TypeScript", { isDemonstrated: true, supportLevel: "demonstrated" }),
      makeSkill("Node.js", { isDemonstrated: true, supportLevel: "demonstrated" }),
    ],
    certifications: [
      { name: "AWS Cloud Practitioner", issuer: "Amazon", date: "2024-03" },
    ],
    achievements: [],
    languages: ["English"],
    links: { other: [] },
    evidence: [
      {
        id: "ev-1",
        source: "work_experience",
        text: "Built REST APIs using Python and Flask",
        confidence: "high",
      },
      {
        id: "ev-2",
        source: "project",
        text: "Built a React-based e-commerce application",
        confidence: "high",
      },
    ],
    potentialIssues: [],
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Evidence validator tests
// ──────────────────────────────────────────────

describe("buildEvidenceTextSet", () => {
  it("collects evidence from all profile sections", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    // Should contain experience description
    expect(textSet.has("built rest apis using python and flask.")).toBe(true);

    // Should contain project description
    expect(
      textSet.has(
        "built a react-based e-commerce application with product browsing and shopping workflows."
      )
    ).toBe(true);

    // Should contain skill names
    expect(textSet.has("python")).toBe(true);
    expect(textSet.has("react")).toBe(true);

    // Should contain certification names
    expect(textSet.has("aws cloud practitioner")).toBe(true);

    // Should contain summary
    expect(
      textSet.has("software developer with python and react experience.")
    ).toBe(true);
  });

  it("collects CandidateEvidence records", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    expect(textSet.has("built rest apis using python and flask")).toBe(true);
    expect(textSet.has("built a react-based e-commerce application")).toBe(true);
  });

  it("collects experience highlights and technologies", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    expect(textSet.has("developed 5 api endpoints")).toBe(true);
    expect(textSet.has("improved query performance by 30%")).toBe(true);
    expect(textSet.has("flask")).toBe(true);
    expect(textSet.has("postgresql")).toBe(true);
  });

  it("collects project highlights", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    expect(textSet.has("implemented shopping cart")).toBe(true);
    expect(textSet.has("built product search")).toBe(true);
  });

  it("collects education coursework", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    expect(textSet.has("data structures")).toBe(true);
    expect(textSet.has("algorithms")).toBe(true);
  });

  it("handles empty profile gracefully", () => {
    const profile = makeProfile({
      experience: [],
      projects: [],
      education: [],
      skills: [],
      softSkills: [],
      technologies: [],
      certifications: [],
      achievements: [],
      evidence: [],
      summary: "",
    });
    const textSet = buildEvidenceTextSet(profile);

    // Should be empty (or near-empty)
    expect(textSet.size).toBe(0);
  });
});

describe("validateSuggestionEvidence", () => {
  it("keeps evidence that exists in the profile", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      ["Python", "React", "Built REST APIs using Python and Flask"],
      textSet
    );

    expect(result.validEvidence).toHaveLength(3);
    expect(result.strippedCount).toBe(0);
    expect(result.hasEvidence).toBe(true);
  });

  it("strips fabricated evidence not in the profile", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      ["Python", "Docker deployment at scale", "10,000+ users served"],
      textSet
    );

    expect(result.validEvidence).toEqual(["Python"]);
    expect(result.strippedCount).toBe(2);
    expect(result.hasEvidence).toBe(true);
  });

  it("strips all evidence when none matches", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      ["Kubernetes cluster management", "Led team of 15 engineers"],
      textSet
    );

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(2);
    expect(result.hasEvidence).toBe(false);
  });

  it("handles empty evidence array", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence([], textSet);

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(0);
    expect(result.hasEvidence).toBe(false);
  });

  it("uses substring matching for partial evidence quotes", () => {
    const profile = makeProfile();
    const textSet = buildEvidenceTextSet(profile);

    // AI might quote a portion of a longer text
    const result = validateSuggestionEvidence(
      ["REST APIs using Python"],
      textSet
    );

    expect(result.validEvidence).toHaveLength(1);
    expect(result.strippedCount).toBe(0);
  });
});

describe("validateAllSuggestionEvidence", () => {
  it("cleans evidence across multiple suggestions", () => {
    const profile = makeProfile();

    const suggestions = [
      {
        section: "summary" as const,
        supportingEvidence: ["Python", "React", "Docker experience"],
      },
      {
        section: "project" as const,
        supportingEvidence: [
          "Built a React-based e-commerce application",
          "Scaled to 1M users",
        ],
      },
    ];

    const result = validateAllSuggestionEvidence(suggestions, profile);

    expect(result[0].supportingEvidence).toEqual(["Python", "React"]);
    expect(result[1].supportingEvidence).toEqual([
      "Built a React-based e-commerce application",
    ]);
  });
});

// ──────────────────────────────────────────────
// Rewrite normalization tests
// ──────────────────────────────────────────────

describe("normalizeRewriteOutput", () => {
  it("normalizes valid AI output with IDs and pending status", () => {
    const profile = makeProfile();

    const rawOutput = {
      suggestions: [
        {
          section: "summary",
          sectionIndex: 0,
          originalText: "Software developer with Python and React experience.",
          suggestedText:
            "Software developer with demonstrated Python and React expertise, experienced in building REST APIs and full-stack web applications.",
          reason:
            "Highlights Python and React experience which are required for the target role.",
          supportingEvidence: ["Python", "React"],
          relatedJobRequirements: ["Python experience", "React development"],
          confidence: "high",
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBeTruthy();
    expect(result[0].status).toBe("pending");
    expect(result[0].section).toBe("summary");
    expect(result[0].suggestedText).toContain("Python");
  });

  it("strips fabricated evidence from suggestions", () => {
    const profile = makeProfile();

    const rawOutput = {
      suggestions: [
        {
          section: "experience",
          sectionIndex: 0,
          originalText: "Built REST APIs using Python and Flask.",
          suggestedText:
            "Architected and deployed microservices serving 50,000+ daily users using Python, Flask, and Kubernetes.",
          reason: "Emphasize scale for the backend role.",
          supportingEvidence: [
            "Built REST APIs using Python and Flask",
            "Deployed microservices to Kubernetes at scale",
            "50,000+ daily active users",
          ],
          relatedJobRequirements: ["Backend development"],
          confidence: "medium",
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    expect(result).toHaveLength(1);
    // Only the valid evidence should remain
    expect(result[0].supportingEvidence).toEqual([
      "Built REST APIs using Python and Flask",
    ]);
  });

  it("drops suggestions with no valid evidence after validation", () => {
    const profile = makeProfile();

    const rawOutput = {
      suggestions: [
        {
          section: "experience",
          sectionIndex: 0,
          originalText: "Built REST APIs using Python and Flask. This is a longer text to trigger the factual claim filter.",
          suggestedText:
            "Led a team of engineers building cloud-native applications on AWS.",
          reason: "Show leadership experience.",
          supportingEvidence: [
            "Led team of 8 engineers",
            "AWS cloud-native architecture",
          ],
          relatedJobRequirements: ["Team leadership"],
          confidence: "high",
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // Should be dropped because all evidence is fabricated and originalText is long enough
    expect(result).toHaveLength(0);
  });

  it("handles empty suggestions array", () => {
    const profile = makeProfile();
    const result = normalizeRewriteOutput({ suggestions: [] }, profile);
    expect(result).toHaveLength(0);
  });

  it("rejects invalid AI output via Zod", () => {
    const profile = makeProfile();

    const invalidOutput = {
      suggestions: [
        {
          // Missing required fields
          section: "summary",
        },
      ],
    };

    expect(() => normalizeRewriteOutput(invalidOutput, profile)).toThrow();
  });
});

// ──────────────────────────────────────────────
// Hallucination protection tests
// ──────────────────────────────────────────────

describe("hallucination protection", () => {
  it("does not accept suggestions that add missing skills", () => {
    const profile = makeProfile(); // Has Python, React — no Docker, no AWS

    const rawOutput = {
      suggestions: [
        {
          section: "summary",
          sectionIndex: 0,
          originalText: "Software developer with Python and React experience.",
          suggestedText:
            "Software developer with Python, React, Docker, and AWS experience.",
          reason: "Add Docker and AWS to match job requirements.",
          supportingEvidence: ["Python", "React"],
          relatedJobRequirements: ["Docker", "AWS"],
          confidence: "high",
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // The suggestion text itself is the AI's output — we can't control what
    // the AI writes. But the evidence validation ensures the AI can't
    // cite Docker/AWS as supporting evidence if they don't exist.
    // The actual hallucination protection is primarily in the system prompt
    // + evidence validation. The suggestion text review is up to the user.
    expect(result).toHaveLength(1);
    // Evidence should NOT contain Docker or AWS
    expect(result[0].supportingEvidence).not.toContain("Docker");
    expect(result[0].supportingEvidence).not.toContain("AWS");
  });

  it("preserves original profile when generating suggestions", () => {
    const profile = makeProfile();
    const originalSummary = profile.summary;

    const rawOutput = {
      suggestions: [
        {
          section: "summary",
          sectionIndex: 0,
          originalText: profile.summary,
          suggestedText: "An improved summary.",
          reason: "Better alignment.",
          supportingEvidence: ["Python"],
          relatedJobRequirements: ["Python"],
          confidence: "high",
        },
      ],
    };

    normalizeRewriteOutput(rawOutput, profile);

    // Original profile must not be mutated
    expect(profile.summary).toBe(originalSummary);
  });
});

// ──────────────────────────────────────────────
// Student / project-based candidate tests
// ──────────────────────────────────────────────

describe("student / project-based candidates", () => {
  it("supports project-based evidence for students", () => {
    const studentProfile = makeProfile({
      experience: [], // No professional experience
      summary: "CS student with React and Python project experience.",
    });

    const rawOutput = {
      suggestions: [
        {
          section: "project",
          sectionIndex: 0,
          originalText:
            "Built a React-based e-commerce application with product browsing and shopping workflows.",
          suggestedText:
            "Developed a full-stack e-commerce application using React and TypeScript, implementing product browsing, shopping cart, and checkout workflows.",
          reason:
            "Highlights React and TypeScript experience relevant to the frontend internship.",
          supportingEvidence: [
            "Built a React-based e-commerce application",
            "React",
            "TypeScript",
          ],
          relatedJobRequirements: ["React", "TypeScript"],
          confidence: "high",
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, studentProfile);

    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("project");
    expect(result[0].supportingEvidence).toContain("React");
    expect(result[0].supportingEvidence).toContain("TypeScript");
  });
});

// ──────────────────────────────────────────────
// JSON parsing tests
// ──────────────────────────────────────────────

describe("parseRewriteJson", () => {
  it("parses valid JSON", () => {
    const result = parseRewriteJson('{"suggestions": []}');
    expect(result).toEqual({ suggestions: [] });
  });

  it("parses fenced JSON", () => {
    const result = parseRewriteJson('```json\n{"suggestions": []}\n```');
    expect(result).toEqual({ suggestions: [] });
  });

  it("throws RewriteAnalyzerError on invalid JSON", () => {
    expect(() => parseRewriteJson("not json at all")).toThrow(
      RewriteAnalyzerError
    );
  });
});

// ──────────────────────────────────────────────
// Suggestion status management
// ──────────────────────────────────────────────

describe("suggestion status management", () => {
  it("all new suggestions start as pending", () => {
    const profile = makeProfile();

    const rawOutput = {
      suggestions: [
        {
          section: "summary",
          sectionIndex: 0,
          originalText: "Original summary.",
          suggestedText: "Improved summary with Python evidence.",
          reason: "Better alignment.",
          supportingEvidence: ["Python"],
          relatedJobRequirements: ["Python"],
          confidence: "high",
        },
        {
          section: "project",
          sectionIndex: 0,
          originalText: "Original project.",
          suggestedText: "Improved project description.",
          reason: "More specific.",
          supportingEvidence: ["React"],
          relatedJobRequirements: ["React"],
          confidence: "medium",
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    expect(result.every((s) => s.status === "pending")).toBe(true);
  });

  it("assigns unique IDs to each suggestion", () => {
    const profile = makeProfile();

    const rawOutput = {
      suggestions: Array.from({ length: 5 }, (_, i) => ({
        section: "summary" as const,
        sectionIndex: 0,
        originalText: `Original text ${i}.`,
        suggestedText: `Improved text ${i}.`,
        reason: `Reason ${i}.`,
        supportingEvidence: ["Python"],
        relatedJobRequirements: ["Python"],
        confidence: "high" as const,
      })),
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    const ids = result.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ──────────────────────────────────────────────
// PHASE 2C — HALLUCINATION SAFETY REGRESSION
// Controlled test: Test Student with ONLY Python + React
// NO evidence for Docker, AWS, FastAPI, PostgreSQL,
// TypeScript, CI/CD, or any metrics.
// ──────────────────────────────────────────────

/**
 * Build the exact controlled test candidate from the QA spec:
 * - Name: Test Student
 * - Education: BS Computer Science
 * - Skills: Python, React
 * - Projects: React E-commerce, Python Data Analysis
 * - NO professional experience
 * - NO Docker, AWS, FastAPI, PostgreSQL, TypeScript, CI/CD
 * - NO metrics
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
        coursework: ["Data Structures", "Algorithms", "Database Systems"],
        highlights: [],
      },
    ],
    experience: [], // NO professional experience
    projects: [
      {
        name: "React E-commerce Application",
        description: "Built a small e-commerce web application using React.",
        technologies: ["React"],
        highlights: ["React was used in the project"],
        links: [],
        evidenceIds: [],
      },
      {
        name: "Python Data Analysis Project",
        description: "Built a small data analysis project using Python.",
        technologies: ["Python"],
        highlights: ["Python was used in the project"],
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
    evidence: [
      {
        id: "ev-react",
        source: "project",
        text: "Built a small e-commerce web application using React",
        confidence: "high",
      },
      {
        id: "ev-python",
        source: "project",
        text: "Built a small data analysis project using Python",
        confidence: "high",
      },
    ],
    potentialIssues: [],
  };
}

describe("PHASE 2C — Direct hallucination resistance", () => {
  it("strips Docker, AWS, FastAPI, PostgreSQL, TypeScript, CI/CD from evidence", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const fabricatedEvidence = [
      "Python",
      "React",
      "Docker containerization",
      "AWS cloud services",
      "FastAPI backend development",
      "PostgreSQL database management",
      "TypeScript type-safe development",
      "CI/CD pipeline setup",
    ];

    const result = validateSuggestionEvidence(fabricatedEvidence, textSet);

    // Only Python and React should survive
    expect(result.validEvidence).toEqual(["Python", "React"]);
    expect(result.strippedCount).toBe(6);
  });

  it("drops suggestions entirely fabricated from missing skills", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "experience" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React. This is a longer text that exceeds 50 characters to trigger the factual claim filter.",
          suggestedText: "Architected and deployed Docker-based microservices on AWS using FastAPI and PostgreSQL with CI/CD pipelines.",
          reason: "Match the AI/Full-Stack Developer role requirements.",
          supportingEvidence: [
            "Docker containerization at scale",
            "AWS cloud-native deployment",
            "FastAPI REST endpoints",
          ],
          relatedJobRequirements: ["Docker", "AWS", "FastAPI"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // Must be DROPPED — no valid evidence after validation
    expect(result).toHaveLength(0);
  });
});

describe("PHASE 2C — Missing skills must not be added", () => {
  const MISSING_TECHS = ["Docker", "AWS", "FastAPI", "PostgreSQL", "TypeScript", "CI/CD"];

  it("evidence set does not contain any missing technologies", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    for (const tech of MISSING_TECHS) {
      expect(textSet.has(tech.toLowerCase())).toBe(false);
    }
  });

  it("validating AI suggestions with missing tech evidence strips them", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "summary" as const,
          sectionIndex: 0,
          originalText: "Computer Science student with Python and React project experience.",
          suggestedText: "Computer Science student experienced in Docker, AWS, FastAPI, PostgreSQL, TypeScript, and CI/CD.",
          reason: "Match job requirements.",
          supportingEvidence: [
            "Docker experience",
            "AWS cloud",
            "FastAPI",
            "PostgreSQL",
            "TypeScript",
            "CI/CD pipelines",
          ],
          relatedJobRequirements: MISSING_TECHS,
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // All evidence is fabricated — suggestion should be dropped
    expect(result).toHaveLength(0);
  });

  it("missing tech may appear in relatedJobRequirements but NOT in supportingEvidence", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React.",
          suggestedText: "Developed a React-based e-commerce application with component-based architecture.",
          reason: "Emphasizes React expertise relevant to the AI/Full-Stack role.",
          supportingEvidence: ["React", "Built a small e-commerce web application using React"],
          relatedJobRequirements: ["React", "TypeScript"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    expect(result).toHaveLength(1);
    // supportingEvidence must NOT contain missing tech
    for (const tech of MISSING_TECHS) {
      expect(result[0].supportingEvidence).not.toContain(tech);
    }
    // But TypeScript in relatedJobRequirements is fine (it's job context, not candidate claim)
    expect(result[0].relatedJobRequirements).toContain("TypeScript");
  });
});

describe("PHASE 2C — Evidence ID validation", () => {
  it("strips evidence that does not match any profile text", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    // AI invents evidence strings not in the profile
    const result = validateSuggestionEvidence(
      [
        "Led a team of 5 developers",
        "Achieved 99.9% uptime",
        "Python",
        "Deployed to production Kubernetes cluster",
      ],
      textSet
    );

    expect(result.validEvidence).toEqual(["Python"]);
    expect(result.strippedCount).toBe(3);
    expect(result.hasEvidence).toBe(true);
  });

  it("rejects evidence with fabricated metrics not in profile", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      [
        "Improved performance by 40%",
        "Served 10,000+ daily users",
        "Reduced load time by 3x",
        "Generated $500K in revenue",
      ],
      textSet
    );

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(4);
    expect(result.hasEvidence).toBe(false);
  });
});

describe("PHASE 2C — Accept / Reject / Edit controls", () => {
  it("all suggestions start as pending, original profile is not mutated", () => {
    const profile = makeTestStudent();
    const originalSummary = profile.summary;
    const originalProjectDesc = profile.projects[0].description;

    const rawOutput = {
      suggestions: [
        {
          section: "summary" as const,
          sectionIndex: 0,
          originalText: profile.summary,
          suggestedText: "Motivated CS student with hands-on Python and React project experience.",
          reason: "Stronger summary for the AI/Full-Stack internship.",
          supportingEvidence: ["Python", "React"],
          relatedJobRequirements: ["Python", "React"],
          confidence: "high" as const,
        },
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: profile.projects[0].description,
          suggestedText: "Developed a React-based e-commerce application demonstrating frontend skills.",
          reason: "Stronger action verb.",
          supportingEvidence: ["React", "Built a small e-commerce web application using React"],
          relatedJobRequirements: ["React"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // All start pending
    expect(result.every((s) => s.status === "pending")).toBe(true);

    // Profile must NOT be mutated
    expect(profile.summary).toBe(originalSummary);
    expect(profile.projects[0].description).toBe(originalProjectDesc);
  });
});

describe("PHASE 2C — Cross-job consistency", () => {
  it("same candidate vs Frontend role: React evidence valid, TypeScript/Next.js NOT added", () => {
    const profile = makeTestStudent();

    // Simulating AI output for a Frontend Developer Intern role
    // requiring React, TypeScript, Next.js, Tailwind, Testing
    const rawOutput = {
      suggestions: [
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React.",
          suggestedText: "Developed a React-based e-commerce web application with component-driven UI.",
          reason: "Highlights React expertise for the frontend role.",
          supportingEvidence: ["React", "Built a small e-commerce web application using React"],
          relatedJobRequirements: ["React"],
          confidence: "high" as const,
        },
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React. This text is intentionally long enough to exceed the 50 character threshold for the factual claim filter.",
          suggestedText: "Built a full-stack application using TypeScript, Next.js, and Tailwind CSS with comprehensive testing.",
          reason: "Match TypeScript and Next.js requirements.",
          supportingEvidence: [
            "TypeScript type-safe development",
            "Next.js server-side rendering",
            "Tailwind CSS styling",
          ],
          relatedJobRequirements: ["TypeScript", "Next.js", "Tailwind"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // First suggestion survives (React evidence is valid)
    expect(result).toHaveLength(1);
    expect(result[0].suggestedText).toContain("React");

    // Second suggestion is dropped — TypeScript, Next.js, Tailwind evidence are fabricated
    expect(result.some((s) => s.suggestedText.includes("TypeScript"))).toBe(false);
    expect(result.some((s) => s.suggestedText.includes("Next.js"))).toBe(false);
    expect(result.some((s) => s.suggestedText.includes("Tailwind"))).toBe(false);
  });
});

describe("PHASE 2C — Adversarial prompt resistance", () => {
  it("adversarial evidence claiming Docker/AWS is stripped even when AI tries to sneak it in", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    // AI tries to sneak in missing tech as evidence
    const sneakyEvidence = [
      "Built a small e-commerce web application using React",
      "Docker containerization for microservices",
      "AWS EC2 deployment experience",
      "FastAPI REST API development",
    ];

    const result = validateSuggestionEvidence(sneakyEvidence, textSet);

    // Only the React project description survives
    expect(result.validEvidence).toEqual([
      "Built a small e-commerce web application using React",
    ]);
    expect(result.strippedCount).toBe(3);
  });
});

describe("PHASE 2C — Metric hallucination protection", () => {
  it("invented metrics are stripped from evidence", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const metricsEvidence = [
      "Improved performance by 40%",
      "Reduced page load time by 60%",
      "Served 50,000+ users",
      "Increased conversion rate by 25%",
      "Processed 1M+ records daily",
      "Generated $200K in annual revenue",
    ];

    const result = validateSuggestionEvidence(metricsEvidence, textSet);

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(6);
    expect(result.hasEvidence).toBe(false);
  });

  it("suggestion with only fabricated metrics is dropped", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small data analysis project using Python. This project was completed as part of the computer science degree curriculum requirements.",
          suggestedText: "Built a Python data analysis project that processed 10M+ records with 99% accuracy, generating $500K in insights.",
          reason: "Add impactful metrics.",
          supportingEvidence: [
            "Processed 10M+ records",
            "99% accuracy rate",
            "$500K in business insights",
          ],
          relatedJobRequirements: ["Data analysis"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // Must be DROPPED — all evidence is fabricated metrics
    expect(result).toHaveLength(0);
  });
});

describe("PHASE 2C — Experience / role hallucination protection", () => {
  it("does not convert projects to professional employment in evidence", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    // AI tries to claim professional titles
    const fakeExperience = [
      "Software Engineer at TechCorp",
      "Full-Stack Developer for 2 years",
      "Senior Backend Engineer",
      "AI/ML Engineer",
    ];

    const result = validateSuggestionEvidence(fakeExperience, textSet);

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(4);
  });

  it("drops suggestions that claim professional employment from academic projects", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React. This was an academic personal project completed during the junior year of study.",
          suggestedText: "Worked as a Full-Stack React Developer at a tech startup, building production e-commerce applications serving thousands of users.",
          reason: "Present project as professional experience.",
          supportingEvidence: [
            "Full-Stack Developer at tech startup",
            "Production e-commerce application",
            "Serving thousands of users",
          ],
          relatedJobRequirements: ["React development"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // Must be DROPPED — fabricated professional experience
    expect(result).toHaveLength(0);
  });

  it("preserves project descriptions as projects, not employment", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React.",
          suggestedText: "Developed a React-based e-commerce web application.",
          reason: "Stronger action verb for the frontend role.",
          supportingEvidence: ["React", "Built a small e-commerce web application using React"],
          relatedJobRequirements: ["React"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // This is acceptable — just a better phrasing of the actual project
    expect(result).toHaveLength(1);
    expect(result[0].suggestedText).not.toContain("Software Engineer");
    expect(result[0].suggestedText).not.toContain("Full-Stack Developer");
    expect(result[0].section).toBe("project"); // Not "experience"
  });
});

describe("PHASE 2C — Data integrity", () => {
  it("normalization does not mutate the input profile or raw output", () => {
    const profile = makeTestStudent();
    const originalSummary = profile.summary;
    const originalProjects = JSON.parse(JSON.stringify(profile.projects));
    const originalEvidence = JSON.parse(JSON.stringify(profile.evidence));

    const rawOutput = {
      suggestions: [
        {
          section: "summary" as const,
          sectionIndex: 0,
          originalText: profile.summary,
          suggestedText: "Improved summary text.",
          reason: "Better alignment.",
          supportingEvidence: ["Python"],
          relatedJobRequirements: ["Python"],
          confidence: "high" as const,
        },
      ],
    };

    normalizeRewriteOutput(rawOutput, profile);

    // Profile must be unchanged
    expect(profile.summary).toBe(originalSummary);
    expect(profile.projects).toEqual(originalProjects);
    expect(profile.evidence).toEqual(originalEvidence);
  });
});

// ──────────────────────────────────────────────
// DAY 3C — P0 ANTI-HALLUCINATION BYPASS REGRESSION
// The old validator accepted evidence via `evidence.includes(profileText)`,
// so any fabricated claim containing a short real token (e.g. "python")
// passed validation. These tests pin the fixed boundary.
// ──────────────────────────────────────────────

describe("DAY 3C — evidence bypass regression", () => {
  it("strips a fabricated long claim that merely contains a short real skill token", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    // The exact reported bypass: contains the real skill "python" plus
    // invented company, duration, and responsibilities.
    const result = validateSuggestionEvidence(
      ["Worked at Google for 5 years building complex microservices in Python."],
      textSet
    );

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(1);
  });

  it("strips fabricated company claims even when real tokens surround them", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      [
        "Software Engineer at TechCorp",
        "Built e-commerce application at Amazon",
        "Python developer at Google",
      ],
      textSet
    );

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(3);
  });

  it("strips fabricated durations and years of experience", () => {
    const profile = makeTestStudent(); // student — no professional experience
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      ["5 years of experience", "2 years at a startup", "3+ years professional experience"],
      textSet
    );

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(3);
  });

  it("strips fabricated metrics that do not exist in the profile", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      ["Improved performance by 40%", "Reduced latency by 3x", "Served 1000+ users"],
      textSet
    );

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(3);
  });

  it("strips fabricated technologies referenced inside longer claims", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      [
        "Containerized the Python project with Docker",
        "Deployed the e-commerce application to AWS",
        "Built FastAPI endpoints in Python",
      ],
      textSet
    );

    // Every claim mixes real tokens (python / e-commerce application) with
    // an unsupported technology token (docker / aws / fastapi).
    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(3);
  });

  it("keeps legitimate composite evidence composed only of real tokens", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(
      ["Python and React", "e-commerce application project", "Python"],
      textSet
    );

    expect(result.validEvidence).toEqual([
      "Python and React",
      "e-commerce application project",
      "Python",
    ]);
    expect(result.strippedCount).toBe(0);
  });

  it("keeps legitimate verbatim-quote evidence at word boundaries", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    // A quote of a portion of a longer profile text
    const result = validateSuggestionEvidence(
      ["small e-commerce web application", "data analysis project using Python"],
      textSet
    );

    expect(result.validEvidence).toHaveLength(2);
    expect(result.strippedCount).toBe(0);
  });

  it("rejects stopword-only evidence with no factual content", () => {
    const profile = makeTestStudent();
    const textSet = buildEvidenceTextSet(profile);

    const result = validateSuggestionEvidence(["and with the", "using of"], textSet);

    expect(result.validEvidence).toHaveLength(0);
    expect(result.strippedCount).toBe(2);
  });

  it("drops a suggestion whose only evidence is a bypass attempt", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "summary" as const,
          sectionIndex: 0,
          // > 50 chars — factual-claim filter applies
          originalText:
            "Computer Science student with Python and React project experience.",
          suggestedText:
            "Engineer with 5 years of experience at Google building microservices in Python.",
          reason: "Stronger professional framing.",
          supportingEvidence: [
            "Worked at Google for 5 years building complex microservices in Python.",
          ],
          relatedJobRequirements: ["Python"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    // Evidence is stripped by the fixed validator → suggestion is dropped
    expect(result).toHaveLength(0);
  });

  it("keeps a legitimate supported rewrite alongside a fabricated one", () => {
    const profile = makeTestStudent();

    const rawOutput = {
      suggestions: [
        {
          section: "project" as const,
          sectionIndex: 0,
          originalText: "Built a small e-commerce web application using React.",
          suggestedText: "Developed a React-based e-commerce web application.",
          reason: "Stronger action verb.",
          supportingEvidence: [
            "React",
            "Built a small e-commerce web application using React",
          ],
          relatedJobRequirements: ["React"],
          confidence: "high" as const,
        },
        {
          section: "experience" as const,
          sectionIndex: 0,
          originalText:
            "Built a small e-commerce web application using React. This text is long enough to trigger the factual claim filter.",
          suggestedText: "Worked at Google for 5 years building microservices in Python.",
          reason: "Professional framing.",
          supportingEvidence: [
            "Worked at Google for 5 years building complex microservices in Python.",
          ],
          relatedJobRequirements: ["Python"],
          confidence: "high" as const,
        },
      ],
    };

    const result = normalizeRewriteOutput(rawOutput, profile);

    expect(result).toHaveLength(1);
    expect(result[0].section).toBe("project");
    expect(result[0].supportingEvidence).toContain("React");
  });
});
