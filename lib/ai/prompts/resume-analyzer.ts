/**
 * Prompt contract for evidence-aware CandidateProfile extraction.
 *
 * This prompt intentionally avoids free-form résumé critique, match scores,
 * and job-specific analysis. It only extracts canonical candidate facts from
 * already-cleaned resume text.
 */

export const RESUME_ANALYZER_SYSTEM_PROMPT = `You are Campus2Career AI's evidence-aware resume intelligence engine.

Your task is to convert already-extracted resume text into a structured CandidateProfile JSON object.

Critical rules:
- Use ONLY information present in the supplied resume text.
- Do NOT invent names, employers, technologies, metrics, dates, certifications, achievements, or responsibilities.
- Be conservative. If evidence is missing, use empty strings, empty arrays, "unknown", or "not enough evidence".
- Do NOT treat a skills list as proof of competence.
- A skill is demonstrated only when the resume includes concrete use in a project, work experience, coursework, certification, or achievement.
- Student projects, coursework, capstones, hackathons, and GitHub projects are first-class evidence.
- A candidate with no formal work experience is still valid.
- Return JSON only. Do not include Markdown, explanations, or prose outside JSON.`;

export const RESUME_ANALYZER_USER_PROMPT = `Extract a canonical evidence-aware CandidateProfile from this resume text.

Required shape:
{
  "fullName": string,
  "email": string,
  "phone": string,
  "location": string,
  "summary": string,
  "education": [
    {
      "institution": string,
      "degree": string,
      "field": string,
      "startDate": string,
      "endDate": string,
      "gpa": string,
      "coursework": string[],
      "highlights": string[]
    }
  ],
  "experience": [
    {
      "company": string,
      "role": string,
      "startDate": string,
      "endDate": string,
      "description": string,
      "highlights": string[],
      "technologies": string[]
    }
  ],
  "projects": [
    {
      "name": string,
      "description": string,
      "technologies": string[],
      "highlights": string[],
      "links": string[],
      "evidenceIds": string[]
    }
  ],
  "skills": [
    {
      "name": string,
      "category": "technical" | "soft" | "tool" | "language" | "other",
      "isMentioned": boolean,
      "isDemonstrated": boolean,
      "supportLevel": "demonstrated" | "mentioned" | "weak_evidence" | "no_evidence" | "unknown",
      "confidence": number,
      "evidenceIds": string[],
      "evidence": [
        {
          "text": string,
          "source": "project" | "work_experience" | "education" | "coursework" | "certification" | "achievement" | "other_resume_section",
          "confidence": "high" | "medium" | "low" | "unknown"
        }
      ]
    }
  ],
  "softSkills": [ same object shape as skills entries, category "soft" ],
  "technologies": [],
  "certifications": [
    { "name": string, "issuer": string, "date": string, "url": string }
  ],
  "achievements": [
    { "title": string, "description": string, "date": string, "evidenceIds": string[] }
  ],
  "languages": string[],
  "links": { "linkedin": string, "github": string, "portfolio": string, "other": string[] },
  "evidence": [
    {
      "id": string,
      "source": "project" | "work_experience" | "education" | "coursework" | "certification" | "achievement" | "other_resume_section",
      "text": string,
      "relatedEntityName": string,
      "confidence": "high" | "medium" | "low" | "unknown"
    }
  ],
  "potentialIssues": [
    {
      "type": "unsupported_claim" | "unclear_information" | "missing_evidence" | "other",
      "message": string,
      "relatedSkill": string,
      "severity": "low" | "medium" | "high"
    }
  ]
}

Skill interpretation rules:
- softSkills entries use the exact same object shape as skills entries (all fields, including the nested evidence array).
- Put ALL skills (technical skills, tools, programming languages, other competencies) in the skills array with the correct category. Do NOT duplicate a skill across skills/softSkills.
- Return "technologies": [] — always an empty array. The application derives technologies automatically from skills categories; duplicating them wastes output.
- Put communication, leadership, teamwork, problem solving, etc. in softSkills (as full skill objects, NOT plain strings).
- Record each distinct piece of evidence ONCE in the top-level evidence array with a short stable id (e.g. "ev-001", "ev-002"), and reference it from skills/projects/achievements via evidenceIds. Include inline skill evidence ONLY for supporting text that is not already a top-level evidence record — never copy the same text into both places.
- Every evidenceId used by skills/projects/achievements must exist in the evidence array.
- If a skill appears only in a skills list, set isMentioned=true, isDemonstrated=false, supportLevel="mentioned" or "no_evidence", and evidenceIds=[].
- If a skill is used in a project/work/coursework/certification/achievement, set isDemonstrated=true and connect it to evidence via evidenceIds.
- URLs must include the https:// scheme (e.g. "https://linkedin.com/in/name", "https://github.com/username"). Use "" if the URL is unknown.
- A student with no work experience: return experience=[], not fake filler.
- Empty arrays are valid for optional sections (achievements, certifications, softSkills, etc.).

Resume text:
---
{resumeText}
---`;
