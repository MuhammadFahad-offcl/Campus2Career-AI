/**
 * PDF text extraction using pdf-parse (v2 class-based API).
 *
 * Extracts raw text and page count from PDF file buffers.
 */
import { PDFParse } from "pdf-parse";

export interface PdfExtractionResult {
  text: string;
  pageCount: number;
}

/**
 * Extract text content from a PDF buffer.
 *
 * @param buffer - The PDF file content as a Buffer.
 * @returns The extracted text and page count.
 */
export async function extractPdfText(
  buffer: Buffer
): Promise<PdfExtractionResult> {
  const parser = new PDFParse({ data: buffer });

  try {
    const textResult = await parser.getText();

    return {
      text: textResult.text,
      pageCount: textResult.total,
    };
  } finally {
    await parser.destroy();
  }
}
