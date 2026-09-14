/**
 * Anonymous-session → real-account claim.
 *
 * Production-readiness fix: the anonymous MVP session cookie expires
 * after 24 hours (lib/anonymous-session-shared.ts), after which a
 * visitor's resume, analysis, rewrites, and skill-bridge progress
 * become unreachable. Rather than force sign-up before anyone can try
 * the product (abandoning the anonymous-first MVP philosophy), this
 * lets a visitor create a real account at ANY point and reassigns
 * everything their anonymous session owns to that account — called
 * from the sign-up and sign-in server actions (app/actions/auth.ts)
 * right after Supabase Auth succeeds, while the anonymous cookie is
 * still readable.
 *
 * Uses the server-only admin client throughout: anonymous rows have no
 * anon-role RLS policy (by design, see AI_CODEBASE_CONTEXT.md §14), so
 * only the service-role client can read or reassign them — the same
 * trust boundary every other anonymous-capable action already uses.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/observability/log-error";

/**
 * Tables that carry `anonymous_session_id` and `user_id` and follow the
 * ownership pattern documented in AI_CODEBASE_CONTEXT.md §15. Kept as an
 * explicit list (not introspected) so a new table is claimed only once
 * someone deliberately adds it here.
 */
const CLAIMABLE_TABLES = [
  "job_targets",
  "analyses",
  "rewrites",
  "skill_bridges",
  "interview_sessions",
] as const;

export interface ClaimSummary {
  claimedResumeCount: number;
  claimedOtherRowCount: number;
  hadErrors: boolean;
}

/**
 * Reassign every row (and resume storage object) owned by
 * `anonymousSessionId` to `userId`. Idempotent and safe to call on
 * every sign-in: rows already claimed (user_id already set) simply
 * don't match the `anonymous_session_id` + `user_id IS NULL` filter a
 * second time. Never throws — a partial or total failure here must
 * never block the sign-up/sign-in it was called from; failures are
 * logged instead.
 */
export async function claimAnonymousSessionForUser(
  userId: string,
  anonymousSessionId: string
): Promise<ClaimSummary> {
  const supabase = createAdminClient();
  let claimedResumeCount = 0;
  let claimedOtherRowCount = 0;
  let hadErrors = false;

  // ── Resumes: also move the underlying storage object ─────────
  // (everything else only holds JSONB snapshots/derived data, so a
  // plain ownership reassignment is enough — the resume file itself
  // is the one thing that lives in Storage under the old anonymous
  // path and needs to physically move for future authenticated reads
  // to find it.)
  try {
    const { data: rows, error: selectError } = await supabase
      .from("resumes")
      .select("id, storage_path")
      .eq("anonymous_session_id", anonymousSessionId)
      .is("user_id", null);

    if (selectError) throw selectError;

    for (const row of rows ?? []) {
      const resumeId = row.id as string;
      const oldPath = row.storage_path as string;
      const newPath = oldPath.startsWith(`temporary/${anonymousSessionId}/`)
        ? oldPath.replace(`temporary/${anonymousSessionId}/`, `${userId}/`)
        : oldPath;

      if (newPath !== oldPath) {
        const { error: moveError } = await supabase.storage
          .from("resumes")
          .move(oldPath, newPath);

        if (moveError) {
          // Don't fail the whole claim over one storage move — keep the
          // row's existing storage_path rather than pointing it at a
          // file that was never actually moved.
          hadErrors = true;
          void logServerError("claimAnonymousSession", moveError, {
            ownerType: "authenticated",
            context: { phase: "storage-move", resumeId },
          });
          continue;
        }
      }

      const { error: updateError } = await supabase
        .from("resumes")
        .update({
          user_id: userId,
          anonymous_session_id: null,
          storage_path: newPath,
        })
        .eq("id", resumeId);

      if (updateError) {
        hadErrors = true;
        void logServerError("claimAnonymousSession", updateError, {
          ownerType: "authenticated",
          context: { phase: "resumes-update", resumeId },
        });
      } else {
        claimedResumeCount += 1;
      }
    }
  } catch (err) {
    hadErrors = true;
    void logServerError("claimAnonymousSession", err, {
      ownerType: "authenticated",
      context: { phase: "resumes-select" },
    });
  }

  // ── Everything else: plain ownership reassignment ────────────
  for (const table of CLAIMABLE_TABLES) {
    try {
      const { error, count } = await supabase
        .from(table)
        .update(
          { user_id: userId, anonymous_session_id: null },
          { count: "exact" }
        )
        .eq("anonymous_session_id", anonymousSessionId)
        .is("user_id", null)
        .select("id");

      if (error) throw error;
      claimedOtherRowCount += count ?? 0;
    } catch (err) {
      hadErrors = true;
      void logServerError("claimAnonymousSession", err, {
        ownerType: "authenticated",
        context: { phase: "table-update", table },
      });
    }
  }

  return { claimedResumeCount, claimedOtherRowCount, hadErrors };
}
