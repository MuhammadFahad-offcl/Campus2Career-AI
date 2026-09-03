// Integration test for PDF extraction — exercises the same module chain as the server action.
import { describe, expect, it } from "vitest";
import { extractPdfText, extractText } from "@/lib/document-processing";

// Minimal valid PDF with readable text content.
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.1\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
    "4 0 obj<</Length 179>>\nstream\n" +
    "BT\n/F1 12 Tf\n72 720 Td\n" +
    "(John Doe - Student Resume) Tj\n0 -18 Td\n" +
    "(Email: john.doe@example.com) Tj\n0 -18 Td\n" +
    "(Experience: Built an AI chatbot using Python and FastAPI.) Tj\n0 -18 Td\n" +
    "(Skills: Python, JavaScript, AWS, Docker) Tj\n" +
    "ET\nendstream\nendobj\n" +
    "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n" +
    "xref\n0 6\n" +
    "0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n" +
    "0000000101 00000 n \n0000000206 00000 n \n0000000437 00000 n \n" +
    "trailer<</Root 1 0 R/Size 6>>\nstartxref\n513\n%%EOF",
  "utf-8"
);

describe("PDF extraction (server-only)", () => {
  it("extracts text and page count from a real PDF", async () => {
    const r = await extractPdfText(MINIMAL_PDF);
    expect(r.pageCount).toBeGreaterThanOrEqual(1);
    expect(r.text.length).toBeGreaterThan(50);
    expect(r.text).toContain("John Doe");
    expect(r.text).toContain("Python");
  });

  it("works through the full extractText pipeline", async () => {
    const r = await extractText(MINIMAL_PDF, "pdf");
    expect(r.pageCount).toBeGreaterThanOrEqual(1);
    expect(r.text).toContain("Skills");
  });
});
