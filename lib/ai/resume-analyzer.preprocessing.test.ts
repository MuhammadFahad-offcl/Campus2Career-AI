// Persistent tests for AI response preprocessing (URL + skill coercion).
import { describe, expect, it } from "vitest";
import {
  normalizeCandidateProfile,
  parseCandidateProfileJson,
  ResumeAnalyzerError,
} from "@/lib/ai/resume-analyzer";
import type { CandidateProfile } from "@/types";

const base = {
  fullName: "Test User",
  email: "test@example.com",
  phone: "+1-555-0000",
  location: "Toronto, ON",
  summary: "CS student with project experience.",
  education: [],
  experience: [],
  projects: [],
  skills: [],
  softSkills: [],
  technologies: [],
  certifications: [],
  achievements: [],
  languages: [],
  links: {},
  evidence: [],
  potentialIssues: [],
};

describe("AI response preprocessing", () => {
  it("converts technologies as string[] into Skill[]", () => {
    const raw = { ...base, technologies: ["Python", "AWS", "Docker"] };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.length).toBe(3);
    expect(profile.technologies.map((s) => s.name)).toEqual([
      "Python",
      "AWS",
      "Docker",
    ]);
    expect(profile.technologies[0].isMentioned).toBe(true);
    expect(profile.technologies[0].category).toBe("technical");
  });

  it("converts softSkills as string[] into Skill[]", () => {
    const raw = { ...base, softSkills: ["Leadership", "Teamwork"] };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.softSkills.length).toBe(2);
    expect(profile.softSkills.map((s) => s.name)).toEqual([
      "Leadership",
      "Teamwork",
    ]);
  });

  it("converts skills as string[] into Skill[]", () => {
    const raw = { ...base, skills: ["React", "TypeScript"] };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.skills.length).toBe(2);
    expect(profile.skills[0].name).toBe("React");
  });

  it("accepts mixed string + object entries in technologies", () => {
    const raw = {
      ...base,
      technologies: [
        "Python",
        {
          name: "AWS",
          category: "tool",
          isMentioned: true,
          isDemonstrated: false,
          supportLevel: "mentioned",
          confidence: 0.7,
          evidenceIds: [],
          evidence: [],
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.length).toBe(2);
    expect(profile.technologies.map((s) => s.name)).toEqual(["Python", "AWS"]);
    expect(profile.technologies[1].category).toBe("tool");
  });

  it("maps free-form AI category labels onto the canonical SkillCategory enum", () => {
    const raw = {
      ...base,
      technologies: [
        { name: "React", category: "framework" },
        { name: "pandas", category: "library" },
        { name: "Python", category: "programming_language" },
        { name: "AWS", category: "cloud" },
        { name: "Figma", category: "design" },
      ].map((s) => ({
        ...s,
        isMentioned: true,
        isDemonstrated: false,
        supportLevel: "mentioned",
        confidence: 0.7,
        evidenceIds: [],
        evidence: [],
      })),
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.map((s) => s.category)).toEqual([
      "technical",
      "technical",
      "language",
      "tool",
      "tool",
    ]);
  });

  it("normalizes spaced and hyphenated category labels (e.g. 'Machine Learning')", () => {
    const raw = {
      ...base,
      technologies: [
        { name: "scikit-learn", category: "Machine Learning" },
        { name: "Next.js", category: "Front-End" },
      ].map((s) => ({
        ...s,
        isMentioned: true,
        isDemonstrated: false,
        supportLevel: "mentioned",
        confidence: 0.7,
        evidenceIds: [],
        evidence: [],
      })),
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.map((s) => s.category)).toEqual([
      "technical",
      "technical",
    ]);
  });

  it("falls back to 'other' for unrecognized category labels", () => {
    const raw = {
      ...base,
      technologies: [
        { name: "Mystery Skill", category: "quantum_widgetry" },
        { name: "No Category Match", category: 42 },
      ].map((s) => ({
        ...s,
        isMentioned: true,
        isDemonstrated: false,
        supportLevel: "mentioned",
        confidence: 0.7,
        evidenceIds: [],
        evidence: [],
      })),
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.map((s) => s.category)).toEqual([
      "other",
      "other",
    ]);
  });

  it("passes valid canonical categories through unchanged", () => {
    const raw = {
      ...base,
      technologies: [
        { name: "TypeScript", category: "language" },
        { name: "Git", category: "tool" },
        { name: "Communication", category: "soft" },
      ].map((s) => ({
        ...s,
        isMentioned: true,
        isDemonstrated: false,
        supportLevel: "mentioned",
        confidence: 0.7,
        evidenceIds: [],
        evidence: [],
      })),
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.map((s) => s.category)).toEqual([
      "language",
      "tool",
      "soft",
    ]);
  });

  it("maps free-form categories in softSkills and skills arrays too", () => {
    const raw = {
      ...base,
      softSkills: [
        {
          name: "Teamwork",
          category: "interpersonal",
          isMentioned: true,
          isDemonstrated: false,
          supportLevel: "mentioned",
          confidence: 0.7,
          evidenceIds: [],
          evidence: [],
        },
      ],
      skills: [
        {
          name: "PostgreSQL",
          category: "database",
          isMentioned: true,
          isDemonstrated: false,
          supportLevel: "mentioned",
          confidence: 0.7,
          evidenceIds: [],
          evidence: [],
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.softSkills[0].category).toBe("soft");
    expect(profile.skills[0].category).toBe("technical");
  });

  it("adds https:// scheme to bare certification URLs", () => {
    const raw = {
      ...base,
      certifications: [
        {
          name: "AWS Fundamentals",
          issuer: "AWS",
          date: "2024-01",
          url: "coursera.org/cert/abc123",
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.certifications[0].url).toBe(
      "https://coursera.org/cert/abc123"
    );
  });

  it("adds https:// scheme to bare profile links", () => {
    const raw = {
      ...base,
      links: {
        linkedin: "linkedin.com/in/testuser",
        github: "github.com/testuser",
        portfolio: "testuser.dev",
      },
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.links.linkedin).toBe("https://linkedin.com/in/testuser");
    expect(profile.links.github).toBe("https://github.com/testuser");
    expect(profile.links.portfolio).toBe("https://testuser.dev");
  });

  it("preserves URLs that already have https://", () => {
    const raw = {
      ...base,
      links: { linkedin: "https://linkedin.com/in/ok", github: "" },
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.links.linkedin).toBe("https://linkedin.com/in/ok");
    expect(profile.links.github).toBe("");
  });

  it("accepts a student resume with no work experience", () => {
    const raw = {
      ...base,
      fullName: "Student No-Work",
      experience: [],
      skills: [
        {
          name: "Python",
          category: "technical",
          isMentioned: true,
          isDemonstrated: false,
          supportLevel: "mentioned",
          confidence: 0.5,
          evidenceIds: [],
          evidence: [],
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.experience).toEqual([]);
    expect(profile.skills.length).toBe(1);
  });

  it("accepts empty certifications and achievements arrays", () => {
    const profile = normalizeCandidateProfile({
      ...base,
      certifications: [],
      achievements: [],
    });
    expect(profile.certifications).toEqual([]);
    expect(profile.achievements).toEqual([]);
  });

  it("rejects unsupported enum values (e.g. invalid supportLevel)", () => {
    const raw = {
      ...base,
      skills: [
        {
          name: "Python",
          category: "technical",
          isMentioned: true,
          isDemonstrated: false,
          supportLevel: "bogus_level",
          confidence: 0.5,
          evidenceIds: [],
          evidence: [],
        },
      ],
    };
    expect(() => normalizeCandidateProfile(raw)).toThrow();
  });

  it("parseCandidateProfileJson throws INVALID_AI_RESPONSE on bad JSON", () => {
    expect(() => parseCandidateProfileJson("not json {")).toThrow(
      ResumeAnalyzerError
    );
    try {
      parseCandidateProfileJson("not json {");
    } catch (err) {
      expect((err as ResumeAnalyzerError).code).toBe("INVALID_AI_RESPONSE");
    }
  });

  it("parseCandidateProfileJson unwraps fenced ```json blocks", () => {
    const fenced = '```json\n{"fullName": "A"}\n```';
    const parsed = parseCandidateProfileJson(fenced) as CandidateProfile;
    expect(parsed.fullName).toBe("A");
  });

  it("full pipeline: coerced technologies + normalized URLs", () => {
    const raw = {
      ...base,
      fullName: "Furqan",
      technologies: ["Python", "FastAPI", "AWS"],
      links: { linkedin: "linkedin.com/in/furqan", github: "github.com/furqan" },
      certifications: [
        {
          name: "AWS Cloud",
          issuer: "AWS",
          date: "2024",
          url: "coursera.org/x",
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.technologies.map((s) => s.name)).toEqual([
      "Python",
      "FastAPI",
      "AWS",
    ]);
    expect(profile.links.linkedin).toBe("https://linkedin.com/in/furqan");
    expect(profile.certifications[0].url).toBe("https://coursera.org/x");
  });

  // ── Null-safety tests ─────────────────────────────

  it("converts null top-level fields to defaults via Zod", () => {
    const raw = {
      ...base,
      email: null,
      phone: null,
      location: null,
      summary: null,
      education: null,
      experience: null,
      projects: null,
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.email).toBe("");
    expect(profile.phone).toBe("");
    expect(profile.location).toBe("");
    expect(profile.summary).toBe("");
    expect(profile.education).toEqual([]);
    expect(profile.experience).toEqual([]);
    expect(profile.projects).toEqual([]);
  });

  it("converts null nested fields to defaults (e.g. education[0].gpa: null)", () => {
    const raw = {
      ...base,
      education: [
        {
          institution: "MIT",
          degree: "BS",
          field: "CS",
          startDate: "2022",
          endDate: "2026",
          gpa: null,
          coursework: ["Data Structures"],
          highlights: [],
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.education[0].institution).toBe("MIT");
    // gpa should be undefined (optional field, null → undefined)
    expect(profile.education[0].gpa).toBeUndefined();
  });

  it("filters null elements from arrays", () => {
    const raw = {
      ...base,
      education: [
        null,
        {
          institution: "MIT",
          degree: "BS",
          field: "CS",
          startDate: "2022",
          endDate: "2026",
          coursework: [],
          highlights: [],
        },
        null,
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    expect(profile.education.length).toBe(1);
    expect(profile.education[0].institution).toBe("MIT");
  });

  it("handles null certification URL gracefully", () => {
    const raw = {
      ...base,
      certifications: [
        {
          name: "AWS Fundamentals",
          issuer: "AWS",
          date: "2024",
          url: null,
        },
      ],
    };
    const profile = normalizeCandidateProfile(raw);
    // null url → undefined → optional field absent
    expect(profile.certifications[0].name).toBe("AWS Fundamentals");
    expect(profile.certifications[0].url).toBeUndefined();
  });
});
