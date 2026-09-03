/**
 * Magic-bytes validation for uploaded resume files.
 *
 * Defends against MIME-type spoofing: a malicious client can label a
 * `.exe` or `.js` payload as `application/pdf`. Magic-byte checks look
 * at the actual file header instead of the browser-supplied MIME type.
 *
 * Never logs file content or credentials.
 */

import type { DocumentFormat } from "@/types";

/** PDF files start with `%PDF-` (bytes 25 50 44 46 2D). */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * DOCX (and any Office Open XML) is a ZIP container.
 * All ZIP files begin with `PK` (0x50 0x4B), followed by 0x03 0x04 for
 * a standard file entry or 0x05 0x06 / 0x07 0x08 for empty / spanned archives.
 */
const ZIP_MAGIC = [0x50, 0x4b];

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false;
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) return false;
  }
  return true;
}

/**
 * Infer the true format of a buffer from its magic bytes.
 * Returns `null` if the buffer does not match a known resume format.
 */
export function detectFormatFromBytes(buffer: Buffer): DocumentFormat | null {
  if (startsWith(buffer, PDF_MAGIC)) return "pdf";
  if (startsWith(buffer, ZIP_MAGIC)) return "docx";
  return null;
}

/**
 * Assert that the buffer matches the declared MIME type.
 * Throws an Error with a user-safe message on mismatch.
 *
 * @param declaredMime - The MIME type reported by the browser.
 * @param buffer       - The raw uploaded file bytes.
 * @returns The verified `DocumentFormat`.
 */
export function assertMagicBytesMatch(
  declaredMime: string,
  buffer: Buffer
): DocumentFormat {
  const detected = detectFormatFromBytes(buffer);

  if (!detected) {
    throw new Error(
      "The uploaded file does not look like a valid PDF or DOCX document."
    );
  }

  const expectedFormat: DocumentFormat =
    declaredMime.includes("pdf") ? "pdf" : "docx";

  if (detected !== expectedFormat) {
    throw new Error(
      "The uploaded file's content does not match its declared type."
    );
  }

  return detected;
}
