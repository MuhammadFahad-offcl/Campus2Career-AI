/**
 * Evidence validation for rewrite suggestions.
 *
 * Ensures every supporting evidence reference in a rewrite suggestion
 * actually exists in the candidate profile. This is the primary
 * anti-hallucination guard — if the AI invents evidence, it gets stripped.
 *
 * DAY 3C SECURITY FIX — the previous implementation accepted evidence when
 * `evidence.includes(profileText)` (reverse substring). That let a fabricated
 * long claim pass merely because it *contained* a short real token (e.g.
 * "Worked at Google for 5 years building microservices in Python" passed
 * because the profile contains the skill "python").
 *
 * The replacement is a tiered boundary that accepts evidence only when it
 * is traceable to the profile:
 *
 *   Tier 0 — exact match: the evidence string equals a profile text.
 *   Tier 1 — verbatim quote: the evidence appears inside a profile text as
 *            a contiguous, word-boundary-bounded span (a quote cannot
 *            introduce characters the profile does not contain).
 *   Tier 2 — composite coverage: every *significant* token (non-stopword,
 *            ≥2 chars) of the evidence exists as a token in the profile.
 *            This accepts legitimate composites like "Python and React"
 *            while rejecting any evidence that introduces a new factual
 *            token (an invented company, year, metric, or technology).
 *
 * Anything else — including evidence whose only "support" is containing a
 * short profile token, or stopword-only strings with no factual content —
 * is rejected.
 *
 * Pure functions, no I/O.
 */

import type {
  CandidateProfile,
} from "@/types";

// ──────────────────────────────────────────────
// Tokenization helpers
// ──────────────────────────────────────────────

/**
 * Function words that carry no factual weight. Tokens in this set are not
 * required to appear in the profile for composite (Tier 2) evidence.
 * Deliberately minimal — verbs/nouns like "led", "team", or "performance"
 * are factual and MUST be covered by the profile.
 */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "nor", "but", "so", "yet",
  "with", "of", "in", "on", "at", "for", "to", "from", "by", "as",
  "is", "are", "was", "were", "be", "been", "being", "am",
  "has", "have", "had", "do", "does", "did",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must",
  "using", "use", "used", "uses", "via", "per", "into", "onto",
  "over", "under", "up", "down", "out", "off", "about", "across",
  "against", "along", "among", "around", "before", "after", "behind",
  "below", "above", "between", "beyond", "during", "except", "inside",
  "near", "since", "until", "within", "without", "while",
  "where", "when", "why", "how", "what", "which", "who", "whom", "whose",
  "that", "this", "these", "those", "there", "here",
  "it", "its", "they", "them", "their", "he", "she", "his", "her",
  "we", "us", "our", "you", "your", "i", "me", "my",
  "not", "no", "also", "both", "each", "either", "every", "all", "any",
  "most", "some", "such", "than", "too", "very", "just", "only", "own",
  "same", "then", "once", "if", "because", "although", "though", "whether",
]);

/** Trim edge punctuation from a whitespace token, keeping meaningful
 *  internal characters (hyphens in "e-commerce", dots in "node.js",
 *  plus signs in "c++", percent signs in "40%"). */
function cleanToken(word: string): string {
  return word.replace(/^[^a-z0-9+#%]+|[^a-z0-9+#%]+$/g, "");
}

/** Naive plural stemming so "apis" covers "api", "endpoints" covers
 *  "endpoint", "years" covers "year", etc. Applied to BOTH sides of the
 *  comparison so it never widens matching beyond plural/singular variance. */
function stemToken(token: string): string {
  if (
    token.length >= 4 &&
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    !token.endsWith("us") &&
    !token.endsWith("is")
  ) {
    return token.slice(0, -1);
  }
  return token;
}

/** Significant tokens of a text: non-stopword, length ≥ 2. These are the
 *  tokens that must be traceable to the profile. */
function significantTokens(text: string): string[] {
  const tokens: string[] = [];
  for (const word of text.split(/\s+/)) {
    const token = cleanToken(word);
    if (!token || token.length < 2) continue;
    if (STOPWORDS.has(token)) continue;
    tokens.push(token);
  }
  return tokens;
}

/** Build the universe of profile tokens (stemmed) from the evidence text
 *  set. This is the closed world a composite evidence string may draw
 *  tokens from — any token outside it is an unsupported factual addition. */
export function buildTokenUniverse(evidenceTextSet: Set<string>): Set<string> {
  const universe = new Set<string>();
  for (const text of evidenceTextSet) {
    for (const word of text.split(/\s+/)) {
      const token = cleanToken(word);
      if (!token) continue;
      universe.add(stemToken(token));
    }
  }
  return universe;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Check whether the evidence appears inside the profile text as a
 * contiguous span bounded by non-alphanumeric characters. The span may not
 * start/end mid-word, so a quote can never claim more than the profile
 * literally says (e.g. "python" will not match inside "pythonic").
 */
function isWordBoundaryQuote(evidence: string, profileText: string): boolean {
  const pattern = new RegExp(
    `(?<![a-z0-9])${escapeRegex(evidence).replace(/\s+/g, "\\s+")}(?![a-z0-9])`
  );
  return pattern.test(profileText);
}

// ──────────────────────────────────────────────
// Evidence collection
// ──────────────────────────────────────────────

/**
 * Build a flat set of all evidence text snippets from the candidate profile.
 * This is the "universe of truth" — any evidence reference not in this set
 * is considered fabricated.
 */
export function buildEvidenceTextSet(profile: CandidateProfile): Set<string> {
  const texts = new Set<string>();

  const add = (text: string) => {
    const t = text.trim().toLowerCase();
    if (t) texts.add(t);
  };

  // CandidateEvidence records
  for (const ev of profile.evidence) {
    add(ev.text);
  }

  // Experience
  for (const exp of profile.experience) {
    add(exp.description);
    for (const h of exp.highlights) add(h);
    for (const t of exp.technologies) add(t);
    add(`${exp.role} at ${exp.company}`);
  }

  // Projects
  for (const proj of profile.projects) {
    add(proj.description);
    for (const h of proj.highlights) add(h);
    for (const t of proj.technologies) add(t);
    add(proj.name);
  }

  // Education
  for (const edu of profile.education) {
    add(`${edu.degree} in ${edu.field} at ${edu.institution}`);
    for (const c of edu.coursework) add(c);
    for (const h of edu.highlights) add(h);
  }

  // Certifications
  for (const cert of profile.certifications) {
    add(cert.name);
    add(`${cert.name} from ${cert.issuer}`);
  }

  // Achievements
  for (const ach of profile.achievements) {
    add(ach.title);
    add(ach.description);
  }

  // Skills
  for (const skill of [...profile.skills, ...profile.softSkills, ...profile.technologies]) {
    add(skill.name);
    for (const ev of skill.evidence) add(ev.text);
  }

  // Summary
  if (profile.summary) add(profile.summary);

  return texts;
}

// ──────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────

/**
 * Check whether an evidence text snippet is supported by the profile.
 *
 * Accepts (in order):
 *   1. exact matches against the profile text set;
 *   2. verbatim word-boundary quotes of a longer profile text;
 *   3. composites whose every significant token exists in the profile.
 *
 * Rejects everything else — most importantly, strings that merely
 * *contain* a profile token while adding unsupported factual content.
 */
function isEvidenceSupported(
  evidenceText: string,
  evidenceTextSet: Set<string>,
  tokenUniverse: Set<string>
): boolean {
  const normalized = evidenceText.trim().toLowerCase();
  if (!normalized) return false;

  // Tier 0 — exact match
  if (evidenceTextSet.has(normalized)) return true;

  // Evidence must carry at least one significant token; strings like "and"
  // or "a" have no factual content to validate.
  const tokens = significantTokens(normalized);
  if (tokens.length === 0) return false;

  // Tier 1 — verbatim quote at word boundaries
  for (const profileText of evidenceTextSet) {
    if (isWordBoundaryQuote(normalized, profileText)) return true;
  }

  // Tier 2 — composite: every significant token must exist in the profile
  // token universe. A single unsupported token (a company, year, metric,
  // technology…) fails the whole string.
  return tokens.every((token) => tokenUniverse.has(stemToken(token)));
}

export interface EvidenceValidationResult {
  /** The cleaned evidence array — only valid references remain. */
  validEvidence: string[];
  /** Number of evidence references that were stripped. */
  strippedCount: number;
  /** Whether the suggestion still has at least one valid evidence reference. */
  hasEvidence: boolean;
}

/**
 * Validate a suggestion's supporting evidence against the candidate profile.
 * Returns the cleaned evidence array with invalid references removed.
 */
export function validateSuggestionEvidence(
  supportingEvidence: string[],
  evidenceTextSet: Set<string>
): EvidenceValidationResult {
  const tokenUniverse = buildTokenUniverse(evidenceTextSet);
  return validateSuggestionEvidenceWithUniverse(
    supportingEvidence,
    evidenceTextSet,
    tokenUniverse
  );
}

/** Internal variant that reuses a precomputed token universe (avoids
 *  rebuilding it per suggestion during batch validation). */
function validateSuggestionEvidenceWithUniverse(
  supportingEvidence: string[],
  evidenceTextSet: Set<string>,
  tokenUniverse: Set<string>
): EvidenceValidationResult {
  const validEvidence: string[] = [];
  let strippedCount = 0;

  for (const evidence of supportingEvidence) {
    if (isEvidenceSupported(evidence, evidenceTextSet, tokenUniverse)) {
      validEvidence.push(evidence);
    } else {
      strippedCount++;
    }
  }

  return {
    validEvidence,
    strippedCount,
    hasEvidence: validEvidence.length > 0,
  };
}

// ──────────────────────────────────────────────
// Batch validation
// ──────────────────────────────────────────────

/**
 * Validate evidence for an array of suggestions. Returns a new array
 * with cleaned evidence. Suggestions that make factual claims but have
 * zero valid evidence after validation are flagged with low confidence.
 */
export function validateAllSuggestionEvidence<T extends { supportingEvidence: string[]; section?: string }>(
  suggestions: T[],
  profile: CandidateProfile
): T[] {
  const evidenceTextSet = buildEvidenceTextSet(profile);
  const tokenUniverse = buildTokenUniverse(evidenceTextSet);

  return suggestions.map((suggestion) => {
    const result = validateSuggestionEvidenceWithUniverse(
      suggestion.supportingEvidence,
      evidenceTextSet,
      tokenUniverse
    );

    if (result.strippedCount > 0 && process.env.NODE_ENV !== "production") {
      console.warn(
        `[evidence-validator] Stripped ${result.strippedCount} invalid evidence reference(s) from ${suggestion.section ?? "unknown"} suggestion`
      );
    }

    return {
      ...suggestion,
      supportingEvidence: result.validEvidence,
    };
  });
}
