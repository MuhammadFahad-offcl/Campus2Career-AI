import { describe, expect, it } from "vitest";
import {
  analyzeResumeText,
  classifyOpenAIError,
  normalizeCandidateProfile,
  parseCandidateProfileJson,
  ResumeAnalyzerError,
} from "./resume-analyzer";
import { shouldReuseCandidateProfile } from "./profile-cache";

const baseProfile = {
  fullName: "Maya Patel",
  email: "maya@example.com",
  phone: "",
  location: "Boston, MA",
  summary: "Computer science student focused on applied AI projects.",
  education: [
    {
      institution: "Northeastern University",
      degree: "B.S.",
      field: "Computer Science",
      startDate: "2022",
      endDate: "2026",
      coursework: ["Data Structures", "Machine Learning"],
      highlights: [],
    },
  ],
  experience: [],
  projects: [
    {
      name: "AI Chatbot",
      description: "Built an AI chatbot using Python.",
      technologies: ["Python"],
      highlights: ["Implemented conversational flow"],
      links: [],
      evidenceIds: ["ev_001"],
    },
  ],
  skills: [
    {
      name: "Python",
      category: "technical",
      isMentioned: true,
      isDemonstrated: true,
      supportLevel: "demonstrated",
      confidence: 0.94,
      evidenceIds: ["ev_001"],
      evidence: [
        {
          text: "Built an AI chatbot using Python.",
          source: "project",
          confidence: "high",
        },
      ],
    },
    {
      name: "FastAPI",
      category: "technical",
      isMentioned: true,
      isDemonstrated: false,
      supportLevel: "mentioned",
      confidence: 0.65,
      evidenceIds: [],
      evidence: [],
    },
  ],
  softSkills: [],
  technologies: [],
  certifications: [],
  achievements: [],
  languages: [],
  links: { linkedin: "", github: "", portfolio: "", other: [] },
  evidence: [
    {
      id: "ev_001",
      source: "project",
      text: "Built an AI chatbot using Python.",
      relatedEntityName: "AI Chatbot",
      confidence: "high",
    },
  ],
  potentialIssues: [],
};

describe("resume analyzer normalization", () => {
  it("handles a normal student resume profile", () => {
    const profile = normalizeCandidateProfile(baseProfile);

    expect(profile.fullName).toBe("Maya Patel");
    expect(profile.education).toHaveLength(1);
    expect(profile.projects).toHaveLength(1);
  });

  it("accepts resumes with no formal work experience", () => {
    const profile = normalizeCandidateProfile({ ...baseProfile, experience: [] });

    expect(profile.experience).toEqual([]);
    expect(profile.projects[0].name).toBe("AI Chatbot");
  });

  it("preserves multiple projects as first-class evidence containers", () => {
    const profile = normalizeCandidateProfile({
      ...baseProfile,
      projects: [
        ...baseProfile.projects,
        {
          name: "Course Planner",
          description: "Built a scheduling tool for coursework planning.",
          technologies: ["React"],
          highlights: [],
          links: [],
          evidenceIds: [],
        },
      ],
    });

    expect(profile.projects.map((project) => project.name)).toContain("Course Planner");
  });

  it("does not treat skills that are only listed as demonstrated", () => {
    const profile = normalizeCandidateProfile(baseProfile);
    const fastApi = profile.skills.find((skill) => skill.name === "FastAPI");

    expect(fastApi?.isMentioned).toBe(true);
    expect(fastApi?.isDemonstrated).toBe(false);
    expect(fastApi?.evidenceIds).toEqual([]);
  });

  it("keeps clearly demonstrated project skills demonstrated", () => {
    const profile = normalizeCandidateProfile(baseProfile);
    const python = profile.skills.find((skill) => skill.name === "Python");

    expect(python?.isDemonstrated).toBe(true);
    expect(python?.evidenceIds).toEqual(["ev_001"]);
  });

  it("rejects empty extracted text before calling OpenAI", async () => {
    await expect(analyzeResumeText("   ")).rejects.toMatchObject({
      code: "EMPTY_TEXT",
    });
  });

  it("rejects malformed AI JSON output", () => {
    expect(() => parseCandidateProfileJson("not json")).toThrow(ResumeAnalyzerError);
  });

  it("fills missing optional fields but rejects missing required skill fields", () => {
    expect(() =>
      normalizeCandidateProfile({
        fullName: "Maya",
        email: "",
        education: [],
        experience: [],
        projects: [],
        skills: [{ name: "Python" }],
      })
    ).toThrow();
  });

  it("classifies OpenAI/API failures safely", () => {
    const error = classifyOpenAIError({ status: 429 });

    expect(error.code).toBe("RATE_LIMIT");
    expect(error.message).not.toContain("OPENAI_API_KEY");
  });

  it("reuses an existing validated profile for duplicate analysis attempts", () => {
    expect(
      shouldReuseCandidateProfile({
        candidateProfile: baseProfile,
        analysisStatus: "completed",
      })
    ).toBe(true);

    expect(
      shouldReuseCandidateProfile({
        candidateProfile: baseProfile,
        analysisStatus: "completed",
        force: true,
      })
    ).toBe(false);
  });
});
