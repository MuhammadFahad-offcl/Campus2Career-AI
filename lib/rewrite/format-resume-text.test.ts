import { describe, it, expect } from "vitest";
import type { CandidateProfile, Skill } from "@/types";
import { formatProfileAsPlainText, dedupedSkillNames } from "./format-resume-text";

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
    fullName: "Jordan Rivera",
    email: "jordan@example.com",
    phone: "555-0100",
    location: "Austin, TX",
    summary: "Aspiring backend engineer.",
    education: [
      {
        institution: "State University",
        degree: "BS",
        field: "Computer Science",
        startDate: "2021-09",
        endDate: "2025-06",
        gpa: "3.8",
        coursework: ["Data Structures"],
        highlights: ["Dean's List"],
      },
    ],
    experience: [
      {
        company: "TechStartup",
        role: "Software Engineering Intern",
        startDate: "2024-06",
        endDate: "2024-09",
        description: "Built REST APIs using Python and Flask.",
        highlights: ["Developed 5 API endpoints"],
        technologies: ["Python", "Flask"],
      },
    ],
    projects: [
      {
        name: "E-commerce App",
        description: "A React-based storefront.",
        technologies: ["React"],
        highlights: ["Implemented shopping cart"],
        links: ["https://github.com/example/ecommerce"],
        evidenceIds: [],
      },
    ],
    skills: [makeSkill("Python", { isDemonstrated: true, supportLevel: "demonstrated" })],
    softSkills: [makeSkill("Communication", { category: "soft" })],
    technologies: [makeSkill("Python"), makeSkill("React")],
    certifications: [
      { name: "AWS Cloud Practitioner", issuer: "Amazon", date: "2024-03" },
    ],
    achievements: [
      { title: "Hackathon Winner", description: "1st place, campus hackathon", date: "2024-04", evidenceIds: [] },
    ],
    languages: ["English", "Spanish"],
    links: { linkedin: "https://linkedin.com/in/jordan", other: [] },
    evidence: [],
    potentialIssues: [],
    ...overrides,
  };
}

describe("dedupedSkillNames", () => {
  it("merges skills/softSkills/technologies and drops case-insensitive duplicates", () => {
    const profile = makeProfile();
    // "Python" appears in both `skills` and `technologies` in the fixture.
    const names = dedupedSkillNames(profile);
    expect(names.filter((n) => n.toLowerCase() === "python")).toHaveLength(1);
    expect(names).toContain("Communication");
    expect(names).toContain("React");
  });
});

describe("formatProfileAsPlainText", () => {
  it("includes the candidate's name and contact info in the header", () => {
    const text = formatProfileAsPlainText(makeProfile());
    expect(text).toContain("Jordan Rivera");
    expect(text).toContain("jordan@example.com");
    expect(text).toContain("Austin, TX");
    expect(text).toContain("https://linkedin.com/in/jordan");
  });

  it("renders each populated section with a heading", () => {
    const text = formatProfileAsPlainText(makeProfile());
    expect(text).toMatch(/SUMMARY/);
    expect(text).toMatch(/EXPERIENCE/);
    expect(text).toMatch(/PROJECTS/);
    expect(text).toMatch(/EDUCATION/);
    expect(text).toMatch(/SKILLS/);
    expect(text).toMatch(/CERTIFICATIONS/);
    expect(text).toMatch(/ACHIEVEMENTS/);
    expect(text).toMatch(/LANGUAGES/);
  });

  it("carries through exact suggestion wording without altering it", () => {
    const profile = makeProfile({
      summary: "Architected and shipped REST APIs using Python and Flask.",
    });
    const text = formatProfileAsPlainText(profile);
    expect(text).toContain("Architected and shipped REST APIs using Python and Flask.");
  });

  it("omits empty sections entirely", () => {
    const profile = makeProfile({
      achievements: [],
      certifications: [],
      languages: [],
    });
    const text = formatProfileAsPlainText(profile);
    expect(text).not.toMatch(/ACHIEVEMENTS/);
    expect(text).not.toMatch(/CERTIFICATIONS/);
    expect(text).not.toMatch(/LANGUAGES/);
  });

  it("lists experience bullets and technologies under the entry", () => {
    const text = formatProfileAsPlainText(makeProfile());
    expect(text).toContain("Software Engineering Intern");
    expect(text).toContain("TechStartup");
    expect(text).toContain("• Developed 5 API endpoints");
    expect(text).toContain("Technologies: Python, Flask");
  });
});
