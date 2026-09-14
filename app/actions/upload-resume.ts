/**
 * Resume upload & processing pipeline — Server Action.
 *
 * Orchestrates the full ingestion flow for both:
 *   - authenticated users (future saved-account flow)
 *   - anonymous MVP sessions (try-first hackathon flow)
 *
 * Anonymous uploads are scoped to a temporary HttpOnly session cookie and are
 * written through a server-only Supabase admin client. The browser never
 * receives service-role credentials.
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAnonymousSessionId,
  getOrCreateAnonymousSessionId,
} from "@/lib/anonymous-session";
import {
  getResumeOwnerInsert,
  getResumeStoragePath,
  type ResumeOwner,
} from "@/lib/resume-ownership";
import { extractText, detectFormat } from "@/lib/document-processing";
import {
  MAX_RESUME_FILE_SIZE,
  ACCEPTED_RESUME_FORMATS,
} from "@/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { logServerError } from "@/lib/observability/log-error";
import { assertMagicBytesMatch } from "@/lib/security/file-signatures";
import type { DocumentFormat } from "@/types";

export type UploadStatus = "success" | "error";

export interface UploadSuccess {
  status: "success";
  resumeId: string;
  fileName: string;
  fileType: DocumentFormat;
  fileSize: number;
  pageCount: number;
  extractedText: string;
  ownerType: ResumeOwner["kind"];
}

export interface UploadError {
  status: "error";
  error: string;
  /** User-facing error code for i18n / custom UI handling. */
  code: ErrorCode;
}

export type UploadResult = UploadSuccess | UploadError;

export type ErrorCode =
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "STORAGE_FAILED"
  | "EXTRACTION_FAILED"
  | "EMPTY_DOCUMENT"
  | "DATABASE_FAILED"
  | "CONFIGURATION_ERROR"
  | "RATE_LIMITED"
  | "UNKNOWN";

function error(code: ErrorCode, message: string): UploadError {
  return { status: "error", error: message, code };
}

const MIME_TO_FORMAT: Record<string, DocumentFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
};

async function getUploadContext() {
  const authSupabase = await createClient();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();

  if (user) {
    return {
      owner: { kind: "authenticated", userId: user.id } satisfies ResumeOwner,
      supabase: authSupabase,
    };
  }

  const anonymousSessionId = await getOrCreateAnonymousSessionId();

  return {
    owner: {
      kind: "anonymous",
      anonymousSessionId,
    } satisfies ResumeOwner,
    supabase: createAdminClient(),
  };
}

function applyOwnerFilter<Query>(query: Query, owner: ResumeOwner): Query {
  const filterable = query as Query & {
    eq(column: string, value: string): Query;
  };

  if (owner.kind === "authenticated") {
    return filterable.eq("user_id", owner.userId);
  }

  return filterable.eq("anonymous_session_id", owner.anonymousSessionId);
}

/**
 * Upload and process a resume file.
 *
 * @param file - The resume file (PDF or DOCX, max 5 MB).
 * @returns UploadResult with extracted text on success, or an error.
 */
export async function uploadAndProcessResume(file: File): Promise<UploadResult> {
  // ── 1. File validation ─────────────────────────
  if (
    !(ACCEPTED_RESUME_FORMATS as readonly string[]).includes(file.type) &&
    !MIME_TO_FORMAT[file.type]
  ) {
    return error(
      "INVALID_FILE_TYPE",
      "Only PDF and DOCX files are accepted."
    );
  }

  if (file.size > MAX_RESUME_FILE_SIZE) {
    return error("FILE_TOO_LARGE", "File size must be less than 5 MB.");
  }

  if (file.size === 0) {
    return error("EMPTY_DOCUMENT", "The uploaded file is empty.");
  }

  const format = MIME_TO_FORMAT[file.type] ?? detectFormat(file.type);
  if (!format) {
    return error("INVALID_FILE_TYPE", "Could not determine the file format.");
  }

  // ── Security: per-identity rate limit ───────────
  // Checked BEFORE any storage write or OpenAI call to block abuse early.
  let rateLimitIdentity: string | null = null;
  try {
    const authSupabase = await createClient();
    const {
      data: { user },
    } = await authSupabase.auth.getUser();
    rateLimitIdentity = user?.id ?? (await getAnonymousSessionId());
    if (!rateLimitIdentity) {
      // No session yet — create one so subsequent calls share a bucket.
      rateLimitIdentity = await getOrCreateAnonymousSessionId();
    }
  } catch (err) {
    console.error("[uploadAndProcessResume] Rate-limit identity resolution failed:", err);
  }

  const rateCheck = await checkRateLimit("upload", rateLimitIdentity ?? "unknown", RATE_LIMITS.upload);
  if (!rateCheck.allowed) {
    return error(
      "RATE_LIMITED",
      "Too many upload attempts. Please wait a moment and try again."
    );
  }

  let context: Awaited<ReturnType<typeof getUploadContext>>;

  try {
    context = await getUploadContext();
  } catch (err) {
    console.error("[uploadAndProcessResume] Upload context failed:", err);
    void logServerError("uploadAndProcessResume", err, { errorCode: "CONFIGURATION_ERROR" });
    return error(
      "CONFIGURATION_ERROR",
      "Unable to upload your resume. Resume storage is not configured for this environment."
    );
  }

  const { owner, supabase } = context;

  const resumeId = crypto.randomUUID();
  const storagePath = getResumeStoragePath(owner, resumeId);

  // ── 2. Store original file in Supabase Storage ─
  const buffer = Buffer.from(await file.arrayBuffer());

  // Security: verify the file's magic bytes match its declared MIME type.
  // Defends against renamed payloads (e.g. .exe labelled as application/pdf).
  try {
    assertMagicBytesMatch(file.type, buffer);
  } catch (magicErr) {
    console.warn("[uploadAndProcessResume] Magic-bytes mismatch:", (magicErr as Error).message);
    return error("INVALID_FILE_TYPE", (magicErr as Error).message);
  }

  const { error: storageError } = await supabase.storage
    .from("resumes")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (storageError) {
    console.error("[uploadAndProcessResume] Storage upload failed:", storageError);
    return error(
      "STORAGE_FAILED",
      "Unable to upload your resume. Please try again."
    );
  }

  // ── 3. Create initial DB record (status: uploaded) ─
  const { error: insertError } = await supabase.from("resumes").insert({
    id: resumeId,
    ...getResumeOwnerInsert(owner),
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    storage_path: storagePath,
    extraction_status: "uploaded",
  });

  if (insertError) {
    console.error("[uploadAndProcessResume] DB insert failed:", insertError);
    // Best-effort cleanup of the stored file
    await supabase.storage.from("resumes").remove([storagePath]);
    return error(
      "DATABASE_FAILED",
      "Failed to create resume record. Please try again."
    );
  }

  // ── 4. Update status to processing ─────────────
  const processingQuery = supabase
    .from("resumes")
    .update({ extraction_status: "processing" })
    .eq("id", resumeId);
  await applyOwnerFilter(processingQuery, owner);

  // ── 5. Extract text ────────────────────────────
  let extractedText: string;
  let pageCount: number;

  try {
    const result = await extractText(buffer, format);
    extractedText = result.text;
    pageCount = result.pageCount;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Text extraction failed.";
    console.error("[uploadAndProcessResume] Extraction failed:", err);
    void logServerError("uploadAndProcessResume", err, {
      ownerType: owner.kind,
      errorCode: "EXTRACTION_FAILED",
      context: { resumeId, format },
    });

    const failedQuery = supabase
      .from("resumes")
      .update({
        extraction_status: "failed",
        extraction_error: message,
      })
      .eq("id", resumeId);
    await applyOwnerFilter(failedQuery, owner);

    return error("EXTRACTION_FAILED", message);
  }

  // ── 6. Save extracted text + mark completed ────
  const completedQuery = supabase
    .from("resumes")
    .update({
      extracted_text: extractedText,
      extraction_status: "completed",
      page_count: pageCount,
    })
    .eq("id", resumeId);
  const { error: updateError } = await applyOwnerFilter(completedQuery, owner);

  if (updateError) {
    console.error("[uploadAndProcessResume] DB update failed:", updateError);
    return error(
      "DATABASE_FAILED",
      "Failed to save extracted text. Please try again."
    );
  }

  return {
    status: "success",
    resumeId,
    fileName: file.name,
    fileType: format,
    fileSize: file.size,
    pageCount,
    extractedText,
    ownerType: owner.kind,
  };
}
