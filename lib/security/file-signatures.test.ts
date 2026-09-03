// Persistent tests for the magic-bytes file signature validator.
import { describe, expect, it } from "vitest";
import {
  assertMagicBytesMatch,
  detectFormatFromBytes,
} from "@/lib/security/file-signatures";

const PDF_BYTES = Buffer.from("%PDF-1.4 some content");
const DOCX_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]); // PK\x03\x04
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ (Windows PE)

describe("file-signatures: detectFormatFromBytes", () => {
  it("detects PDF magic bytes", () => {
    expect(detectFormatFromBytes(PDF_BYTES)).toBe("pdf");
  });

  it("detects DOCX (ZIP) magic bytes", () => {
    expect(detectFormatFromBytes(DOCX_BYTES)).toBe("docx");
  });

  it("returns null for unknown format", () => {
    expect(detectFormatFromBytes(EXE_BYTES)).toBeNull();
  });

  it("returns null for empty buffer", () => {
    expect(detectFormatFromBytes(Buffer.alloc(0))).toBeNull();
  });

  it("returns null for truncated signature", () => {
    expect(detectFormatFromBytes(Buffer.from("%P"))).toBeNull();
  });
});

describe("file-signatures: assertMagicBytesMatch", () => {
  it("accepts PDF declared as application/pdf", () => {
    expect(assertMagicBytesMatch("application/pdf", PDF_BYTES)).toBe("pdf");
  });

  it("accepts DOCX declared with OOXML MIME", () => {
    expect(
      assertMagicBytesMatch(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        DOCX_BYTES
      )
    ).toBe("docx");
  });

  it("rejects EXE bytes labelled as PDF", () => {
    expect(() => assertMagicBytesMatch("application/pdf", EXE_BYTES)).toThrow(
      /does not look like a valid/i
    );
  });

  it("rejects DOCX bytes labelled as PDF (content/MIME mismatch)", () => {
    expect(() => assertMagicBytesMatch("application/pdf", DOCX_BYTES)).toThrow(
      /does not match/i
    );
  });

  it("rejects PDF bytes labelled as DOCX (content/MIME mismatch)", () => {
    expect(() =>
      assertMagicBytesMatch(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        PDF_BYTES
      )
    ).toThrow(/does not match/i);
  });
});
