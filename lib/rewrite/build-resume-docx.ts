/**
 * Builds a downloadable Word document (.docx) from a CandidateProfile.
 *
 * This is intentionally a separate module from format-resume-text.ts so the
 * (comparatively large) `docx` library is only pulled into the browser
 * bundle when a user actually clicks "Download as Word" — see the dynamic
 * `import()` in components/rewritten-resume-view.tsx.
 *
 * Pure formatting only, same as format-resume-text.ts — no wording changes.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import type {
  CandidateProfile,
  Experience,
  Project,
  Education,
  Certification,
  Achievement,
} from "@/types";
import { dedupedSkillNames } from "./format-resume-text";

function formatDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  if (!end) return start;
  if (!start) return end;
  return `${start} – ${end}`;
}

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
  });
}

function bodyParagraph(text: string, options: { bold?: boolean; bullet?: boolean } = {}): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: options.bold })],
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: 80 },
  });
}

function experienceParagraphs(exp: Experience): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const dateRange = formatDateRange(exp.startDate, exp.endDate);
  const titleParts = [exp.role, exp.company].filter(Boolean).join(" — ");
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: titleParts, bold: true }),
        ...(dateRange ? [new TextRun({ text: `   (${dateRange})`, italics: true })] : []),
      ],
      spacing: { before: 160, after: 60 },
    })
  );
  if (exp.description) paragraphs.push(bodyParagraph(exp.description));
  for (const h of exp.highlights) paragraphs.push(bodyParagraph(h, { bullet: true }));
  if (exp.technologies.length > 0) {
    paragraphs.push(bodyParagraph(`Technologies: ${exp.technologies.join(", ")}`));
  }
  return paragraphs;
}

function projectParagraphs(proj: Project): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: proj.name, bold: true })],
      spacing: { before: 160, after: 60 },
    }),
  ];
  if (proj.description) paragraphs.push(bodyParagraph(proj.description));
  for (const h of proj.highlights) paragraphs.push(bodyParagraph(h, { bullet: true }));
  if (proj.technologies.length > 0) {
    paragraphs.push(bodyParagraph(`Technologies: ${proj.technologies.join(", ")}`));
  }
  return paragraphs;
}

function educationParagraphs(edu: Education): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const dateRange = formatDateRange(edu.startDate, edu.endDate);
  const degreeField = [edu.degree, edu.field].filter(Boolean).join(" in ");
  const header = [degreeField, edu.institution && `— ${edu.institution}`]
    .filter(Boolean)
    .join(" ");
  paragraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: header, bold: true }),
        ...(dateRange ? [new TextRun({ text: `   (${dateRange})`, italics: true })] : []),
      ],
      spacing: { before: 160, after: 60 },
    })
  );
  if (edu.gpa) paragraphs.push(bodyParagraph(`GPA: ${edu.gpa}`));
  if (edu.coursework.length > 0) {
    paragraphs.push(bodyParagraph(`Coursework: ${edu.coursework.join(", ")}`));
  }
  for (const h of edu.highlights) paragraphs.push(bodyParagraph(h, { bullet: true }));
  return paragraphs;
}

function certificationParagraph(cert: Certification): Paragraph {
  const parts = [cert.name, cert.issuer && `— ${cert.issuer}`, cert.date && `(${cert.date})`];
  return bodyParagraph(parts.filter(Boolean).join(" "), { bullet: true });
}

function achievementParagraph(ach: Achievement): Paragraph {
  const header = [ach.title, ach.date && `(${ach.date})`].filter(Boolean).join(" ");
  const text = ach.description ? `${header}: ${ach.description}` : header;
  return bodyParagraph(text, { bullet: true });
}

/**
 * Build a formatted Word document (.docx) for a CandidateProfile and return
 * it as a browser Blob, ready for a download link.
 */
export async function buildResumeDocument(profile: CandidateProfile): Promise<Blob> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      children: [new TextRun({ text: profile.fullName || "Resume", bold: true, size: 32 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
    })
  );

  const contact = [profile.email, profile.phone, profile.location].filter(Boolean).join("  |  ");
  if (contact) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: contact, size: 20 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
      })
    );
  }

  const links = [
    profile.links.linkedin,
    profile.links.github,
    profile.links.portfolio,
    ...profile.links.other,
  ].filter((l): l is string => Boolean(l));
  if (links.length > 0) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: links.join("  |  "), size: 20 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      })
    );
  }

  if (profile.summary) {
    children.push(sectionHeading("Summary"));
    children.push(bodyParagraph(profile.summary));
  }

  if (profile.experience.length > 0) {
    children.push(sectionHeading("Experience"));
    for (const exp of profile.experience) children.push(...experienceParagraphs(exp));
  }

  if (profile.projects.length > 0) {
    children.push(sectionHeading("Projects"));
    for (const proj of profile.projects) children.push(...projectParagraphs(proj));
  }

  if (profile.education.length > 0) {
    children.push(sectionHeading("Education"));
    for (const edu of profile.education) children.push(...educationParagraphs(edu));
  }

  const skillNames = dedupedSkillNames(profile);
  if (skillNames.length > 0) {
    children.push(sectionHeading("Skills"));
    children.push(bodyParagraph(skillNames.join(", ")));
  }

  if (profile.certifications.length > 0) {
    children.push(sectionHeading("Certifications"));
    for (const cert of profile.certifications) children.push(certificationParagraph(cert));
  }

  if (profile.achievements.length > 0) {
    children.push(sectionHeading("Achievements"));
    for (const ach of profile.achievements) children.push(achievementParagraph(ach));
  }

  if (profile.languages.length > 0) {
    children.push(sectionHeading("Languages"));
    children.push(bodyParagraph(profile.languages.join(", ")));
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
