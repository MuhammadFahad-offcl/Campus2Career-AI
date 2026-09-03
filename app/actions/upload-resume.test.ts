import { describe, expect, it } from "vitest";
import { uploadAndProcessResume } from "./upload-resume";
import { MAX_RESUME_FILE_SIZE } from "@/schemas";

describe("uploadAndProcessResume validation", () => {
  it("rejects unsupported file types before storage configuration", async () => {
    const file = new File(["not a resume"], "resume.txt", {
      type: "text/plain",
    });

    await expect(uploadAndProcessResume(file)).resolves.toMatchObject({
      status: "error",
      code: "INVALID_FILE_TYPE",
    });
  });

  it("rejects oversized files before storage configuration", async () => {
    const file = new File([new Uint8Array(MAX_RESUME_FILE_SIZE + 1)], "resume.pdf", {
      type: "application/pdf",
    });

    await expect(uploadAndProcessResume(file)).resolves.toMatchObject({
      status: "error",
      code: "FILE_TOO_LARGE",
    });
  });

  it("rejects empty files before storage configuration", async () => {
    const file = new File([], "resume.pdf", {
      type: "application/pdf",
    });

    await expect(uploadAndProcessResume(file)).resolves.toMatchObject({
      status: "error",
      code: "EMPTY_DOCUMENT",
    });
  });
});
