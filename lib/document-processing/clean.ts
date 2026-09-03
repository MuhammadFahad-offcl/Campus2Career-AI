/**
 * Text cleaning module for extracted resume text.
 *
 * Normalizes and cleans extracted text while preserving:
 * - Section boundaries
 * - Project names
 * - Bullet point information
 * - Technology/skill names
 * - Dates and contact information
 *
 * Does NOT aggressively summarize — the output should still represent
 * the full original resume content for downstream AI analysis.
 */

/**
 * Clean extracted resume text.
 *
 * Applies a series of normalization passes to remove extraction artifacts
 * while preserving meaningful content and structure.
 */
export function cleanExtractedText(raw: string): string {
  let text = raw;

  // 1. Normalize line endings to \n
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Remove zero-width and other invisible control characters
  //    (but preserve \n, \t, and standard whitespace)
  text = text.replace(/[\u200B\u200C\u200D\uFEFF\u00AD]/g, "");

  // 3. Replace non-breaking spaces with regular spaces
  text = text.replace(/\u00A0/g, " ");

  // 4. Remove other non-printable control characters (keep \n and \t)
  text = text.replace(/[^\x20-\x7E\n\t\u00C0-\u024F\u1E00-\u1EFF]/g, "");

  // 5. Collapse multiple spaces/tabs on the same line to single spaces
  text = text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trimEnd())
    .join("\n");

  // 6. Collapse 3+ consecutive blank lines into 2 (section break)
  text = text.replace(/\n{3,}/g, "\n\n");

  // 7. Trim leading/trailing whitespace
  text = text.trim();

  return text;
}

/**
 * Estimate page count from text length when the actual page count
 * is unavailable (e.g., DOCX extraction).
 *
 * Rough heuristic: ~3000 characters per page for a typical resume.
 */
export function estimatePageCount(text: string): number {
  const CHARS_PER_PAGE = 3000;
  return Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE));
}

/**
 * Validate that extracted text contains meaningful content.
 *
 * Returns true if the text appears to be a valid resume extraction.
 */
export function isValidExtraction(text: string): boolean {
  const MIN_MEANINGFUL_LENGTH = 50;
  return text.trim().length >= MIN_MEANINGFUL_LENGTH;
}
