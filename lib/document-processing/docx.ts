/**
 * DOCX text extraction using mammoth.
 *
 * Extracts raw text from .docx files, preserving section structure,
 * project names, bullet points, and technology names.
 */
import mammoth from "mammoth";

export interface DocxExtractionResult {
  text: string;
}

/**
 * Extract text content from a DOCX buffer.
 *
 * Uses mammoth's extractRawText which converts the document to plain text
 * while preserving paragraph structure and list items.
 *
 * @param buffer - The DOCX file content as a Buffer.
 * @returns The extracted text.
 */
export async function extractDocxText(
  buffer: Buffer
): Promise<DocxExtractionResult> {
  const result = await mammoth.extractRawText({ buffer });

  return {
    text: result.value,
  };
}
