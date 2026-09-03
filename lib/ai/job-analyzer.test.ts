import { describe, expect, it } from "vitest";
import {
  analyzeJobDescriptionText,
  classifyJobAnalyzerError,
  normalizeJobTarget,
  parseJobAnalysisJson,
  JobAnalyzerError,
} from "./job-analyzer";

// ──────────────────────────────────────────────
// Test fixtures
// ──────────────────────────────────────────────

const softwareInternship = {
  title: "Software Engineer Intern",
  company: "TechCorp",
  location: "San Francisco, CA",
  opportunityType: "internship" as const,
  requiredSkills: ["Problem solving", "Communication"],
  preferredSkills: ["Machine Learning", "Data Analysis"],
  requiredTechnologies: ["Python", "React", "SQL", "Git"],
  responsibilities: [
    "Develop and maintain web applications",
    "Collaborate with cross-functional teams",
    "Participate in code reviews",
  ],
  experienceRequirements: [],
  educationRequirements: [
    "Currently pursuing BS in Computer Science or related field",
  ],
  softSkills: ["Communication", "Teamwork"],
  domainRequirements: [],
  extractedRequirements: [
    "Problem solving",
    "Communication",
    "Python",
    "React",
    "SQL",
    "Git",
    "Machine Learning",
    "Data Analysis",
    "Currently pursuing BS in Computer Science or related field",
    "Teamwork",
    "Develop and maintain web applications",
    "Collaborate with cross-functional teams",
    "Participate in code reviews",
  ],
};

const juniorEngineerJob = {
  title: "Junior Software Engineer",
  company: "StartupXYZ",
  location: "Remote",
  opportunityType: "full-time" as const,
  requiredSkills: ["REST API development", "Database design"],
  preferredSkills: ["Docker", "AWS"],
  requiredTechnologies: ["JavaScript", "TypeScript", "Node.js", "PostgreSQL"],
  responsibilities: [
    "Build and maintain backend services",
    "Design database schemas",
    "Write clean, testable code",
  ],
  experienceRequirements: ["1-2 years of software development experience"],
  educationRequirements: ["BS in Computer Science or equivalent"],
  softSkills: ["Problem solving", "Self-motivated"],
  domainRequirements: [],
  extractedRequirements: [
    "REST API development",
    "Database design",
    "JavaScript",
    "TypeScript",
    "Node.js",
    "PostgreSQL",
    "Docker",
    "AWS",
    "1-2 years of software development experience",
    "BS in Computer Science or equivalent",
    "Problem solving",
    "Self-motivated",
  ],
};

const poorlyFormattedJob = {
  title: "web developer",
  company: "",
  location: "",
  opportunityType: "unknown" as const,
  requiredSkills: ["html", "css", "javascript"],
  preferredSkills: [],
  requiredTechnologies: ["react", "node.js"],
  responsibilities: ["build websites"],
  experienceRequirements: [],
  educationRequirements: [],
  softSkills: [],
  domainRequirements: [],
  extractedRequirements: ["html", "css", "javascript", "react", "node.js", "build websites"],
};

// ──────────────────────────────────────────────
// JSON parsing tests
// ──────────────────────────────────────────────

describe("parseJobAnalysisJson", () => {
  it("parses plain JSON", () => {
    const json = JSON.stringify({ title: "Engineer", company: "" });
    const result = parseJobAnalysisJson(json);
    expect(result).toEqual({ title: "Engineer", company: "" });
  });

  it("parses fenced JSON (```json ... ```)", () => {
    const fenced = '```json\n{"title": "Intern"}\n```';
    const result = parseJobAnalysisJson(fenced);
    expect(result).toEqual({ title: "Intern" });
  });

  it("throws JobAnalyzerError for invalid JSON", () => {
    expect(() => parseJobAnalysisJson("not json at all")).toThrow(
      JobAnalyzerError
    );
  });
});

// ──────────────────────────────────────────────
// Normalization tests
// ──────────────────────────────────────────────

describe("normalizeJobTarget", () => {
  const originalDescription = "We are looking for a software engineer...";

  it("normalizes a software internship correctly", () => {
    const result = normalizeJobTarget(softwareInternship, originalDescription);

    expect(result.title).toBe("Software Engineer Intern");
    expect(result.company).toBe("TechCorp");
    expect(result.location).toBe("San Francisco, CA");
    expect(result.opportunityType).toBe("internship");
    expect(result.requiredSkills).toContain("Problem solving");
    expect(result.preferredSkills).toContain("Machine Learning");
    expect(result.requiredTechnologies).toContain("Python");
    expect(result.parsingStatus).toBe("completed");
    expect(result.description).toBe(originalDescription);
  });

  it("normalizes a junior engineer job correctly", () => {
    const result = normalizeJobTarget(juniorEngineerJob, originalDescription);

    expect(result.title).toBe("Junior Software Engineer");
    expect(result.opportunityType).toBe("full-time");
    expect(result.requiredTechnologies).toContain("TypeScript");
    expect(result.preferredSkills).toContain("Docker");
    expect(result.experienceRequirements).toHaveLength(1);
    expect(result.experienceRequirements[0]).toContain("1-2 years");
  });

  it("handles poorly formatted job descriptions", () => {
    const result = normalizeJobTarget(poorlyFormattedJob, "build websites html css");

    expect(result.company).toBe("");
    expect(result.location).toBe("");
    expect(result.opportunityType).toBe("unknown");
    expect(result.requiredSkills).toHaveLength(3);
  });

  it("strictly separates required vs preferred skills", () => {
    const result = normalizeJobTarget(
      {
        ...juniorEngineerJob,
        requiredSkills: ["Backend development"],
        preferredSkills: ["Docker experience is a plus"],
        requiredTechnologies: ["Node.js"],
      },
      originalDescription
    );

    expect(result.requiredSkills).toContain("Backend development");
    expect(result.preferredSkills).toContain("Docker experience is a plus");
    expect(result.requiredSkills).not.toContain("Docker experience is a plus");
    expect(result.preferredSkills).not.toContain("Backend development");
  });

  it("deduplicates items in arrays", () => {
    const result = normalizeJobTarget(
      {
        ...softwareInternship,
        requiredSkills: ["Python", "python", "PYTHON"],
      },
      originalDescription
    );

    expect(result.requiredSkills).toHaveLength(1);
    expect(result.requiredSkills[0]).toBe("Python");
  });

  it("removes empty strings from arrays", () => {
    const result = normalizeJobTarget(
      {
        ...softwareInternship,
        requiredSkills: ["Python", "", "  ", "React"],
      },
      originalDescription
    );

    expect(result.requiredSkills).toHaveLength(2);
    expect(result.requiredSkills).not.toContain("");
  });

  it("builds extractedRequirements from all categories", () => {
    const result = normalizeJobTarget(juniorEngineerJob, originalDescription);

    // extractedRequirements should include items from all categories
    expect(result.extractedRequirements.length).toBeGreaterThan(0);
    // Should include required skills
    expect(result.extractedRequirements).toContain("REST API development");
    // Should include technologies
    expect(result.extractedRequirements).toContain("JavaScript");
    // Should include preferred skills
    expect(result.extractedRequirements).toContain("Docker");
  });

  it("defaults opportunity type to unknown for unrecognized input", () => {
    const result = normalizeJobTarget(
      {
        title: "Developer",
        company: "Co",
        location: "",
        requiredSkills: [],
        preferredSkills: [],
        requiredTechnologies: [],
        responsibilities: [],
        experienceRequirements: [],
        educationRequirements: [],
        softSkills: [],
        domainRequirements: [],
        extractedRequirements: [],
      },
      "Looking for a developer"
    );

    expect(result.opportunityType).toBe("unknown");
  });

  it("handles missing optional fields gracefully", () => {
    const result = normalizeJobTarget(
      { title: "Intern" },
      "We need an intern"
    );

    expect(result.title).toBe("Intern");
    expect(result.company).toBe("");
    expect(result.requiredSkills).toEqual([]);
    expect(result.preferredSkills).toEqual([]);
    expect(result.parsingStatus).toBe("completed");
  });

  it("preserves the original description", () => {
    const desc = "This is a very specific job description with lots of detail...";
    const result = normalizeJobTarget(softwareInternship, desc);

    expect(result.description).toBe(desc);
  });
});

// ──────────────────────────────────────────────
// Input validation tests
// ──────────────────────────────────────────────

describe("analyzeJobDescriptionText input validation", () => {
  it("rejects empty input before calling OpenAI", async () => {
    await expect(analyzeJobDescriptionText("")).rejects.toMatchObject({
      code: "EMPTY_TEXT",
    });
  });

  it("rejects whitespace-only input", async () => {
    await expect(analyzeJobDescriptionText("   \n\t  ")).rejects.toMatchObject({
      code: "EMPTY_TEXT",
    });
  });

  it("rejects very short descriptions", async () => {
    await expect(analyzeJobDescriptionText("Need developer.")).rejects.toMatchObject({
      code: "TEXT_TOO_SHORT",
    });
  });
});

// ──────────────────────────────────────────────
// Error classification tests
// ──────────────────────────────────────────────

describe("classifyJobAnalyzerError", () => {
  it("classifies rate limit errors", () => {
    const error = classifyJobAnalyzerError({ status: 429 });
    expect(error.code).toBe("RATE_LIMIT");
    expect(error.message).not.toContain("OPENAI_API_KEY");
  });

  it("classifies timeout errors", () => {
    const error = classifyJobAnalyzerError({ name: "AbortError" });
    expect(error.code).toBe("TIMEOUT");
  });

  it("classifies ETIMEDOUT errors", () => {
    const error = classifyJobAnalyzerError({ code: "ETIMEDOUT" });
    expect(error.code).toBe("TIMEOUT");
  });

  it("classifies unknown errors as OPENAI_FAILURE", () => {
    const error = classifyJobAnalyzerError(new Error("something"));
    expect(error.code).toBe("OPENAI_FAILURE");
  });

  it("does not expose internal error details", () => {
    const error = classifyJobAnalyzerError({
      message: "Internal API key leaked",
      status: 500,
    });
    expect(error.message).not.toContain("API key");
  });

  it("passes through JobAnalyzerError instances", () => {
    const original = new JobAnalyzerError("Custom", "EMPTY_TEXT");
    const result = classifyJobAnalyzerError(original);
    expect(result).toBe(original);
    expect(result.code).toBe("EMPTY_TEXT");
  });
});

// ──────────────────────────────────────────────
// Zod schema integration tests
// ──────────────────────────────────────────────

describe("Zod schema validation", () => {
  it("accepts valid internship output", () => {
    expect(() => normalizeJobTarget(softwareInternship, "test")).not.toThrow();
  });

  it("accepts valid full-time output", () => {
    expect(() => normalizeJobTarget(juniorEngineerJob, "test")).not.toThrow();
  });

  it("rejects invalid opportunityType", () => {
    expect(() =>
      normalizeJobTarget(
        { ...softwareInternship, opportunityType: "contract" },
        "test"
      )
    ).toThrow();
  });

  it("accepts minimal valid output", () => {
    expect(() =>
      normalizeJobTarget(
        {
          title: "Dev",
          company: "",
          location: "",
          opportunityType: "unknown",
          requiredSkills: [],
          preferredSkills: [],
          requiredTechnologies: [],
          responsibilities: [],
          experienceRequirements: [],
          educationRequirements: [],
          softSkills: [],
          domainRequirements: [],
          extractedRequirements: [],
        },
        "test"
      )
    ).not.toThrow();
  });
});
