/**
 * Minimal, self-contained server-side error logging.
 *
 * Production-readiness gap this closes: before this, a failure in any
 * server action left no trace beyond an ephemeral serverless stdout line.
 * This is a DIY substitute for a third-party error tracker (Sentry, etc.)
 * — swap it out later if one gets wired up; nothing else depends on the
 * `error_logs` table existing.
 *
 * Hard rule: NEVER pass resume text, AI prompts/completions, credentials,
 * tokens, or raw cookies into `context`. This table has no per-user RLS
 * isolation (it's written/read only by the service-role client) and is
 * meant to hold small, non-PII operational metadata only — a resume id,
 * an HTTP status code, a workflow/action name, a Zod issue path.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type ErrorLogOwnerType = "authenticated" | "anonymous" | "system";

interface LogErrorOptions {
  ownerType?: ErrorLogOwnerType;
  errorCode?: string;
  /** Small, non-PII metadata only — see the module-level warning above. */
  context?: Record<string, unknown>;
}

/**
 * Best-effort insert into `error_logs`. NEVER throws — a logging failure
 * must never break the action that called it. Safe to call without
 * `await` (fire-and-forget) from a catch block.
 */
export async function logServerError(
  scope: string,
  error: unknown,
  options: LogErrorOptions = {}
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  if (process.env.NODE_ENV !== "production") {
    // Dev-only convenience mirror — production logging stays DB-only,
    // consistent with the rest of the codebase's dev-gated logging.
    console.error(`[error-log:${scope}]`, message, options.context ?? {});
  }

  try {
    const supabase = createAdminClient();
    await supabase.from("error_logs").insert({
      scope,
      message: message.slice(0, 2000),
      error_code: options.errorCode ?? null,
      owner_type: options.ownerType ?? "system",
      context: options.context ?? {},
    });
  } catch {
    // Best-effort only. If Supabase itself is unreachable/misconfigured —
    // the most common reason this insert would fail — there is nowhere
    // else safe to send this without a third-party tracker. Swallow
    // rather than throw; logging must never break the caller.
  }
}
