/**
 * Resume management — listing and deletion.
 *
 * Production-readiness fix: there was previously no way for a user
 * (anonymous or authenticated) to delete a resume, and `/resumes` was a
 * static placeholder. This adds the owner-filtered list/delete actions
 * that back the real My Resumes page (app/(dashboard)/resumes/page.tsx).
 *
 * Deletion order matters: dependent rows (interview_sessions,
 * skill_bridges, rewrites, analyses) are removed before the resume row
 * itself, because those tables intentionally have no FK/cascade — see
 * AI_CODEBASE_CONTEXT.md §15 ("Foreign-key decision"). The resume's
 * storage object is removed alongside its row.
 */
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { logServerError } from "@/lib/observability/log-error";

export interface ResumeListItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  extractionStatus: string;
  analysisStatus: string | null;
  createdAt: string;
}

export type GetMyResumesResult =
  | { status: "success"; resumes: ResumeListItem[] }
  | { status: "error"; error: string };

export type DeleteResumeResult =
  | { status: "success" }
  | { status: "error"; error: string; code: "SESSION_NOT_FOUND" | "NOT_FOUND" | "DATABASE_FAILED" };

async function getManageContext() {
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

  const anonymousSessionId = await getAnonymousSessionId();
  if (!anonymousSessionId) return null;

  return {
    owner: { kind: "anonymous", anonymousSessionId } satisfies ResumeOwner,
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
 * List every resume owned by the current visitor, newest first. A
 * brand-new visitor with no session yet gets a truthful empty list, not
 * an error — matching the dashboard's convention.
 */
export async function getMyResumesAction(): Promise<GetMyResumesResult> {
  let context: Awaited<ReturnType<typeof getManageContext>>;
  try {
    context = await getManageContext();
  } catch (err) {
    void logServerError("getMyResumesAction", err, { errorCode: "CONFIGURATION_ERROR" });
    return { status: "error", error: "Unable to load your resumes right now." };
  }

  if (!context) {
    return { status: "success", resumes: [] };
  }

  const { owner, supabase } = context;

  const query = supabase
    .from("resumes")
    .select("id, file_name, file_type, file_size, extraction_status, analysis_status, created_at")
    .order("created_at", { ascending: false });
  const { data, error } = await applyOwnerFilter(query, owner);

  if (error) {
    void logServerError("getMyResumesAction", error, { ownerType: owner.kind });
    return { status: "error", error: "Failed to load your resumes." };
  }

  return {
    status: "success",
    resumes: (data ?? []).map((row) => ({
      id: row.id as string,
      fileName: row.file_name as string,
      fileType: row.file_type as string,
      fileSize: row.file_size as number,
      extractionStatus: row.extraction_status as string,
      analysisStatus: (row.analysis_status as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
  };
}

const DEPENDENT_TABLES = ["interview_sessions", "skill_bridges", "rewrites", "analyses"] as const;

/**
 * Permanently delete one resume and everything derived from it
 * (analyses, rewrites, skill-bridge plans, interview sessions) plus its
 * storage object. Owner-filtered throughout — a resume id belonging to
 * a different owner resolves as NOT_FOUND, never a cross-owner delete.
 */
export async function deleteResumeAction(resumeId: string): Promise<DeleteResumeResult> {
  let context: Awaited<ReturnType<typeof getManageContext>>;
  try {
    context = await getManageContext();
  } catch (err) {
    void logServerError("deleteResumeAction", err, { errorCode: "CONFIGURATION_ERROR" });
    return { status: "error", error: "Deletion is not configured for this environment.", code: "DATABASE_FAILED" };
  }

  if (!context) {
    return {
      status: "error",
      error: "Your session has expired. Please refresh the page.",
      code: "SESSION_NOT_FOUND",
    };
  }

  const { owner, supabase } = context;

  const fetchQuery = supabase
    .from("resumes")
    .select("id, storage_path")
    .eq("id", resumeId);
  const filteredFetch = applyOwnerFilter(fetchQuery, owner);
  const { data: resumeRow, error: fetchError } = await filteredFetch.single();

  if (fetchError || !resumeRow) {
    return {
      status: "error",
      error: "Resume not found or you do not have access to it.",
      code: "NOT_FOUND",
    };
  }

  for (const table of DEPENDENT_TABLES) {
    const delQuery = supabase.from(table).delete().eq("resume_id", resumeId);
    const { error } = await applyOwnerFilter(delQuery, owner);
    if (error) {
      void logServerError("deleteResumeAction", error, {
        ownerType: owner.kind,
        context: { table, resumeId },
      });
    }
  }

  const storagePath = resumeRow.storage_path as string | null;
  if (storagePath) {
    const { error: removeError } = await supabase.storage.from("resumes").remove([storagePath]);
    if (removeError) {
      void logServerError("deleteResumeAction", removeError, {
        ownerType: owner.kind,
        context: { phase: "storage-remove", resumeId },
      });
    }
  }

  const deleteQuery = supabase.from("resumes").delete().eq("id", resumeId);
  const { error: deleteError } = await applyOwnerFilter(deleteQuery, owner);

  if (deleteError) {
    void logServerError("deleteResumeAction", deleteError, {
      ownerType: owner.kind,
      context: { resumeId },
    });
    return {
      status: "error",
      error: "Failed to delete resume. Please try again.",
      code: "DATABASE_FAILED",
    };
  }

  return { status: "success" };
}
