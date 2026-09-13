/**
 * Deterministic engine that applies accepted/edited rewrite suggestions onto
 * a CandidateProfile to produce a fully rewritten, job-tailored resume —
 * with NO additional AI call.
 *
 * Every word this writes already came from `rewriteResume()` (AI-generated
 * `suggestedText` that passed evidence validation) or from the candidate's
 * own `editedText`, so this stays on the deterministic side of the
 * AI/deterministic split described throughout the codebase: it only
 * relocates already-approved text into the right structured field. It never
 * invents, scores, or judges anything.
 *
 * The one nontrivial problem it solves: a RewriteSuggestion's `sectionIndex`
 * only says *which* experience/project/education entry to edit — the AI
 * output contract (see lib/ai/prompts/resume-rewriter.ts) does not say
 * *which field* on that entry the suggestion targets (`description` vs one
 * specific `highlights[]` entry). `matchOriginalTextToField` recovers that by
 * comparing `originalText` against every candidate field on the entry, using
 * the same tiered-confidence approach (exact → verbatim → token overlap)
 * lib/rewrite/evidence-validator.ts uses to validate evidence.
 *
 * Pure functions, no I/O.
 */

import type {
  CandidateProfile,
  Experience,
  Project,
  Education,
  Certification,
  RewriteSuggestion,
  RewriteSection,
} from "@/types";

// ──────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────

export interface UnresolvedSuggestion {
  id: string;
  section: RewriteSection;
  sectionIndex: number;
  originalText: string;
  reason: string;
}

export interface ApplySuggestionsResult {
  /** A rewritten profile — a deep copy of the input, never mutated in place. */
  profile: CandidateProfile;
  /** IDs of suggestions that were successfully applied. */
  appliedIds: string[];
  /** Accepted/edited suggestions that could not be placed automatically. */
  unresolved: UnresolvedSuggestion[];
}

// ──────────────────────────────────────────────
// Text matching
// ──────────────────────────────────────────────

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function significantTokens(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9+#%]+/)
    .filter((t) => t.length >= 2);
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

interface FieldCandidate {
  key: string;
  text: string;
}

/** Below this length, containment matching is skipped — a short phrase like
 *  "led" would otherwise "match" nearly every field that happens to contain
 *  it, which is worse than leaving the suggestion unresolved. */
const CONTAINMENT_MIN_LENGTH = 8;

/** Minimum token-overlap ratio to accept a Tier 2 (composite) match. */
const JACCARD_THRESHOLD = 0.6;

/**
 * Find which field on a resume entry `originalText` refers to.
 *
 * Tier 0 — exact match (normalized).
 * Tier 1 — containment: one text is a substring of the other, ranked by how
 *          much of the longer string the shorter one covers.
 * Tier 2 — token overlap (Jaccard) above JACCARD_THRESHOLD.
 *
 * Returns null when no candidate clears any tier — the caller should treat
 * the suggestion as unresolved rather than guess.
 */
function matchOriginalTextToField(
  originalText: string,
  candidates: FieldCandidate[]
): string | null {
  const normOriginal = normalize(originalText);
  if (!normOriginal || candidates.length === 0) return null;

  for (const candidate of candidates) {
    if (normalize(candidate.text) === normOriginal) return candidate.key;
  }

  if (normOriginal.length >= CONTAINMENT_MIN_LENGTH) {
    let best: { key: string; ratio: number } | null = null;
    for (const candidate of candidates) {
      const normField = normalize(candidate.text);
      if (!normField) continue;
      const contains =
        normField.includes(normOriginal) || normOriginal.includes(normField);
      if (!contains) continue;
      const ratio =
        Math.min(normField.length, normOriginal.length) /
        Math.max(normField.length, normOriginal.length);
      if (!best || ratio > best.ratio) best = { key: candidate.key, ratio };
    }
    if (best) return best.key;
  }

  const originalTokens = significantTokens(originalText);
  let best: { key: string; score: number } | null = null;
  for (const candidate of candidates) {
    const score = jaccardSimilarity(
      originalTokens,
      significantTokens(candidate.text)
    );
    if (score >= JACCARD_THRESHOLD && (!best || score > best.score)) {
      best = { key: candidate.key, score };
    }
  }
  return best ? best.key : null;
}

// ──────────────────────────────────────────────
// Per-section field candidates
// ──────────────────────────────────────────────

function buildExperienceCandidates(exp: Experience): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  if (exp.description) {
    candidates.push({ key: "description", text: exp.description });
  }
  exp.highlights.forEach((h, i) =>
    candidates.push({ key: `highlights.${i}`, text: h })
  );
  return candidates;
}

function buildProjectCandidates(proj: Project): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  if (proj.description) {
    candidates.push({ key: "description", text: proj.description });
  }
  proj.highlights.forEach((h, i) =>
    candidates.push({ key: `highlights.${i}`, text: h })
  );
  return candidates;
}

function buildEducationCandidates(edu: Education): FieldCandidate[] {
  return edu.highlights.map((h, i) => ({ key: `highlights.${i}`, text: h }));
}

function buildCertificationCandidates(cert: Certification): FieldCandidate[] {
  return [{ key: "name", text: cert.name }];
}

/** Writes `text` into whichever field `matchedKey` identifies. */
function writeMatchedField(
  target: { description?: string; highlights?: string[]; name?: string },
  matchedKey: string,
  text: string
): void {
  if (matchedKey === "description") {
    target.description = text;
    return;
  }
  if (matchedKey === "name") {
    target.name = text;
    return;
  }
  const highlightMatch = /^highlights\.(\d+)$/.exec(matchedKey);
  if (highlightMatch && target.highlights) {
    target.highlights[Number(highlightMatch[1])] = text;
  }
}

function unresolvedFor(
  suggestion: RewriteSuggestion,
  reason: string
): UnresolvedSuggestion {
  return {
    id: suggestion.id,
    section: suggestion.section,
    sectionIndex: suggestion.sectionIndex,
    originalText: suggestion.originalText,
    reason,
  };
}

const NO_LONGER_EXISTS: Record<string, string> = {
  experience: "This experience entry no longer exists on the resume.",
  project: "This project entry no longer exists on the resume.",
  education: "This education entry no longer exists on the resume.",
  certification: "This certification entry no longer exists on the resume.",
};

const COULD_NOT_MATCH =
  "Could not automatically match this to a specific line on the resume — apply it manually.";

// ──────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────

/**
 * Apply every accepted/edited suggestion onto a deep copy of `profile`,
 * producing a fully rewritten CandidateProfile. Suggestions still "pending"
 * or "rejected" are ignored — only candidate-approved text is ever written.
 */
export function applySuggestionsToProfile(
  profile: CandidateProfile,
  suggestions: RewriteSuggestion[]
): ApplySuggestionsResult {
  const next: CandidateProfile = structuredClone(profile);
  const appliedIds: string[] = [];
  const unresolved: UnresolvedSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (suggestion.status !== "accepted" && suggestion.status !== "edited") {
      continue;
    }

    const text = (
      suggestion.status === "edited"
        ? suggestion.editedText ?? suggestion.suggestedText
        : suggestion.suggestedText
    ).trim();

    if (!text) {
      unresolved.push(unresolvedFor(suggestion, "The suggested text was empty."));
      continue;
    }

    if (suggestion.section === "summary") {
      next.summary = text;
      appliedIds.push(suggestion.id);
      continue;
    }

    if (suggestion.section === "skills") {
      unresolved.push(
        unresolvedFor(
          suggestion,
          "Skill reordering isn't applied to the document automatically — use this suggestion as a guide when you list your skills."
        )
      );
      continue;
    }

    let item: Experience | Project | Education | Certification | undefined;
    let candidates: FieldCandidate[] = [];

    switch (suggestion.section) {
      case "experience": {
        const exp = next.experience[suggestion.sectionIndex];
        item = exp;
        if (exp) candidates = buildExperienceCandidates(exp);
        break;
      }
      case "project": {
        const proj = next.projects[suggestion.sectionIndex];
        item = proj;
        if (proj) candidates = buildProjectCandidates(proj);
        break;
      }
      case "education": {
        const edu = next.education[suggestion.sectionIndex];
        item = edu;
        if (edu) candidates = buildEducationCandidates(edu);
        break;
      }
      case "certification": {
        const cert = next.certifications[suggestion.sectionIndex];
        item = cert;
        if (cert) candidates = buildCertificationCandidates(cert);
        break;
      }
    }

    if (!item) {
      unresolved.push(
        unresolvedFor(
          suggestion,
          NO_LONGER_EXISTS[suggestion.section] ??
            "This entry no longer exists on the resume."
        )
      );
      continue;
    }

    const matched = matchOriginalTextToField(suggestion.originalText, candidates);

    if (!matched) {
      unresolved.push(unresolvedFor(suggestion, COULD_NOT_MATCH));
      continue;
    }

    writeMatchedField(item, matched, text);
    appliedIds.push(suggestion.id);
  }

  return { profile: next, appliedIds, unresolved };
}
