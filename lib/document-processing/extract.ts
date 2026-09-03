/**
 * Document extraction orchestrator.
 *
 * Routes extraction requests to the appropriate format-specific handler
 * (PDF or DOCX) and applies text cleaning to the result.
 *
 * This is Stage 1 → Stage 2 of the resume processing pipeline:
 *   File → Raw Text → Structured Profile
 */

import type { DocumentFormat } from "@/types";
import { extractPdfText } from "./pdf";
import { extractDocxText } from "./docx";
import {
  cleanExtractedText,
  estimatePageCount,
  isValidExtraction,
} from "./clean";

/**
 * Result of the full extraction + cleaning pipeline.
 */
export interface ExtractionResult {
  text: string;
  pageCount: number;
}

/**
 * Extract and clean text from a resume file buffer.
 *
 * 1. Detects format and delegates to the appropriate extractor.
 * 2. Cleans the extracted text (normalize whitespace, remove artifacts).
 * 3. Validates the result is not empty.
 *
 * @param buffer - The file content as a Buffer.
 * @param format - The document format (pdf or docx).
 * @returns The cleaned text and page count.
 * @throws If the format is unsupported or extraction produces empty text.
 */
export async function extractText(
  buffer: Buffer,
  format: DocumentFormat
): Promise<ExtractionResult> {
  let rawText: string;
  let pageCount: number;

  switch (format) {
    case "pdf": {
      const result = await extractPdfText(buffer);
      rawText = result.text;
      pageCount = result.pageCount;
      break;
    }
    case "docx": {
      const result = await extractDocxText(buffer);
      rawText = result.text;
      // DOCX extraction doesn't provide page count — estimate from text length
      pageCount = estimatePageCount(rawText);
      break;
    }
    default:
      throw new Error(`Unsupported document format: ${format}`);
  }

  // Clean the extracted text
  const cleanedText = cleanExtractedText(rawText);

  // Validate extraction produced meaningful content
  if (!isValidExtraction(cleanedText)) {
    throw new Error(
      "Could not extract meaningful text from this document. " +
        "The file may be empty, scanned as an image, or corrupted."
    );
  }

  return {
    text: cleanedText,
    pageCount,
  };
}

/**
 * Detect the document format from a file's MIME type.
 */
export function detectFormat(mimeType: string): DocumentFormat | null {
  switch (mimeType) {
    case "application/pdf":
      return "pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "docx";
    default:
      return null;
  }
}
