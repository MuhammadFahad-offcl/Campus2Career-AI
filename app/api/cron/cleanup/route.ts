/**
 * Scheduled cleanup — Vercel Cron target (see vercel.json).
 *
 * Production-readiness fix: anonymous uploads under `temporary/*` in
 * Supabase Storage, and their DB rows, had no expiry — they piled up
 * forever regardless of the 24-hour session cookie. This purges
 * anonymous-owned rows/files past a retention window, plus the two
 * operational tables added in migration 009 (rate_limit_buckets,
 * error_logs), which would otherwise also grow unbounded.
 *
 * Authenticated users' data is never touched here — only rows still
 * carrying an `anonymous_session_id` (never claimed into an account)
 * are eligible.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on every
 * scheduled invocation once CRON_SECRET is set as an env var (see
 * https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 * Unconfigured secret => fail closed (refuse every request), not fail
 * open.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/observability/log-error";

export const dynamic = "force-dynamic";

const ANONYMOUS_DATA_RETENTION_DAYS = 7;
const ERROR_LOG_RETENTION_DAYS = 30;
const RATE_LIMIT_BUCKET_STALE_HOURS = 24;

/** Rows keyed by resume_id — deleted before their parent resume (no FK cascade; see AI_CODEBASE_CONTEXT.md §15). */
const RESUME_DEPENDENT_TABLES = ["interview_sessions", "skill_bridges", "rewrites", "analyses"] as const;

/** Same tables plus job_targets, swept independently for anonymous rows with no surviving resume link at all. */
const ANONYMOUS_SWEEP_TABLES = ["job_targets", ...RESUME_DEPENDENT_TABLES] as const;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const anonymousCutoff = new Date(
    Date.now() - ANONYMOUS_DATA_RETENTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  // ── 1. Stale anonymous resumes: dependents, storage, then the row ──
  let deletedResumes = 0;
  let storageErrors = 0;

  try {
    const { data: staleResumes, error: selectError } = await supabase
      .from("resumes")
      .select("id, storage_path")
      .not("anonymous_session_id", "is", null)
      .lt("created_at", anonymousCutoff);

    if (selectError) throw selectError;

    for (const resume of staleResumes ?? []) {
      const resumeId = resume.id as string;
      const storagePath = resume.storage_path as string | null;

      for (const table of RESUME_DEPENDENT_TABLES) {
        await supabase.from(table).delete().eq("resume_id", resumeId);
      }

      if (storagePath) {
        const { error: removeError } = await supabase.storage
          .from("resumes")
          .remove([storagePath]);
        if (removeError) storageErrors += 1;
      }

      const { error: deleteError } = await supabase
        .from("resumes")
        .delete()
        .eq("id", resumeId);
      if (!deleteError) deletedResumes += 1;
    }
  } catch (err) {
    void logServerError("cronCleanup", err, { context: { phase: "resumes" } });
  }

  // ── 2. Stale anonymous rows with no resume tie at all ───────────────
  let deletedOrphanRows = 0;
  for (const table of ANONYMOUS_SWEEP_TABLES) {
    try {
      const { error, count } = await supabase
        .from(table)
        .delete({ count: "exact" })
        .not("anonymous_session_id", "is", null)
        .lt("created_at", anonymousCutoff);
      if (error) throw error;
      deletedOrphanRows += count ?? 0;
    } catch (err) {
      void logServerError("cronCleanup", err, { context: { phase: "orphan-rows", table } });
    }
  }

  // ── 3. Prune operational tables (migration 009) ─────────────────────
  let deletedErrorLogs = 0;
  try {
    const errorLogCutoff = new Date(
      Date.now() - ERROR_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const { error, count } = await supabase
      .from("error_logs")
      .delete({ count: "exact" })
      .lt("occurred_at", errorLogCutoff);
    if (error) throw error;
    deletedErrorLogs = count ?? 0;
  } catch (err) {
    void logServerError("cronCleanup", err, { context: { phase: "error_logs" } });
  }

  let deletedRateLimitBuckets = 0;
  try {
    const bucketCutoff = new Date(
      Date.now() - RATE_LIMIT_BUCKET_STALE_HOURS * 60 * 60 * 1000
    ).toISOString();
    const { error, count } = await supabase
      .from("rate_limit_buckets")
      .delete({ count: "exact" })
      .lt("last_refill", bucketCutoff);
    if (error) throw error;
    deletedRateLimitBuckets = count ?? 0;
  } catch (err) {
    void logServerError("cronCleanup", err, { context: { phase: "rate_limit_buckets" } });
  }

  return NextResponse.json({
    ok: true,
    deletedResumes,
    storageErrors,
    deletedOrphanRows,
    deletedErrorLogs,
    deletedRateLimitBuckets,
  });
}
