/**
 * Renders a CandidateProfile into a plain-text resume document — the
 * downloadable artifact behind "Auto-Rewrite Full Resume" → Download as
 * Text, and the content source for the Word (.docx) export.
 *
 * Pure formatting only; it never changes wording, so anything the candidate
 * approved (via applySuggestionsToProfile) reaches the document unchanged.
 */

import type {
  CandidateProfile,
  Experience,
  Project,
  Education,
  Certification,
  Achievement,
} from "@/types";

const SECTION_DIVIDER = "─".repeat(60);

function heading(title: string): string {
  return `${title.toUpperCase()}\n${"-".repeat(title.length)}`;
}

function formatDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  if (!end) return start;
  if (!start) return end;
  return `${start} – ${end}`;
}

/**
 * All skills in one deduplicated, display-friendly list — mirrors the
 * dedup logic in lib/ai/resume-rewriter.ts's formatAllSkills, duplicated
 * here (per this codebase's established per-file-helper convention) since
 * that one is shaped for the AI prompt, not for a human-readable document.
 */
function dedupedSkillNames(profile: CandidateProfile): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const s of [...profile.skills, ...profile.softSkills, ...profile.technologies]) {
    const key = s.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    names.push(s.name);
  }
  return names;
}

function formatExperienceEntry(exp: Experience): string {
  const lines: string[] = [];
  const dateRange = formatDateRange(exp.startDate, exp.endDate);
  const titleParts = [exp.role, exp.company].filter(Boolean).join(" — ");
  lines.push([titleParts, dateRange && `(${dateRange})`].filter(Boolean).join(" "));
  if (exp.description) lines.push(exp.description);
  for (const h of exp.highlights) lines.push(`  • ${h}`);
  if (exp.technologies.length > 0) {
    lines.push(`  Technologies: ${exp.technologies.join(", ")}`);
  }
  return lines.filter(Boolean).join("\n");
}

function formatProjectEntry(proj: Project): string {
  const lines: string[] = [];
  lines.push(proj.name);
  if (proj.description) lines.push(proj.description);
  for (const h of proj.highlights) lines.push(`  • ${h}`);
  if (proj.technologies.length > 0) {
    lines.push(`  Technologies: ${proj.technologies.join(", ")}`);
  }
  if (proj.links.length > 0) lines.push(`  Links: ${proj.links.join(", ")}`);
  return lines.filter(Boolean).join("\n");
}

function formatEducationEntry(edu: Education): string {
  const lines: string[] = [];
  const dateRange = formatDateRange(edu.startDate, edu.endDate);
  const degreeField = [edu.degree, edu.field].filter(Boolean).join(" in ");
  const header = [degreeField, edu.institution && `— ${edu.institution}`, dateRange && `(${dateRange})`]
    .filter(Boolean)
    .join(" ");
  lines.push(header);
  if (edu.gpa) lines.push(`  GPA: ${edu.gpa}`);
  if (edu.coursework.length > 0) lines.push(`  Coursework: ${edu.coursework.join(", ")}`);
  for (const h of edu.highlights) lines.push(`  • ${h}`);
  return lines.filter(Boolean).join("\n");
}

function formatCertificationEntry(cert: Certification): string {
  const parts = [cert.name, cert.issuer && `— ${cert.issuer}`, cert.date && `(${cert.date})`];
  return parts.filter(Boolean).join(" ");
}

function formatAchievementEntry(ach: Achievement): string {
  const header = [ach.title, ach.date && `(${ach.date})`].filter(Boolean).join(" ");
  return ach.description ? `${header}: ${ach.description}` : header;
}

/**
 * Render a CandidateProfile as a clean, plain-text resume — ready to
 * download, paste into an ATS form, or use as a base for further editing.
 */
export function formatProfileAsPlainText(profile: CandidateProfile): string {
  const sections: string[] = [];

  const headerLines = [profile.fullName || "Resume"];
  const contact = [profile.email, profile.phone, profile.location]
    .filter(Boolean)
    .join(" | ");
  if (contact) headerLines.push(contact);
  const links = [
    profile.links.linkedin,
    profile.links.github,
    profile.links.portfolio,
    ...profile.links.other,
  ].filter((l): l is string => Boolean(l));
  if (links.length > 0) headerLines.push(links.join(" | "));
  sections.push(headerLines.join("\n"));

  if (profile.summary) {
    sections.push(`${heading("Summary")}\n${profile.summary}`);
  }

  if (profile.experience.length > 0) {
    sections.push(
      `${heading("Experience")}\n${profile.experience.map(formatExperienceEntry).join("\n\n")}`
    );
  }

  if (profile.projects.length > 0) {
    sections.push(
      `${heading("Projects")}\n${profile.projects.map(formatProjectEntry).join("\n\n")}`
    );
  }

  if (profile.education.length > 0) {
    sections.push(
      `${heading("Education")}\n${profile.education.map(formatEducationEntry).join("\n\n")}`
    );
  }

  const skillNames = dedupedSkillNames(profile);
  if (skillNames.length > 0) {
    sections.push(`${heading("Skills")}\n${skillNames.join(", ")}`);
  }

  if (profile.certifications.length > 0) {
    sections.push(
      `${heading("Certifications")}\n${profile.certifications.map(formatCertificationEntry).join("\n")}`
    );
  }

  if (profile.achievements.length > 0) {
    sections.push(
      `${heading("Achievements")}\n${profile.achievements.map(formatAchievementEntry).join("\n")}`
    );
  }

  if (profile.languages.length > 0) {
    sections.push(`${heading("Languages")}\n${profile.languages.join(", ")}`);
  }

  return sections.join(`\n\n${SECTION_DIVIDER}\n\n`);
}

export { dedupedSkillNames };
