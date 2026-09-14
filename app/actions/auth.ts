/**
 * Optional real-account authentication — Server Actions.
 *
 * Production-readiness fix: accounts were previously presentational
 * placeholders (Login/Register pages that just linked to /dashboard).
 * This keeps the anonymous-first MVP experience intact (nothing here
 * gates any feature behind sign-in) while letting a visitor create a
 * real account at any point so their work survives past the 24-hour
 * anonymous session window. On success, everything the visitor's
 * anonymous session owns is reassigned to the new account — see
 * lib/auth/claim-anonymous-session.ts.
 */
"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { ANONYMOUS_SESSION_COOKIE } from "@/lib/anonymous-session-shared";
import {
  claimAnonymousSessionForUser,
  type ClaimSummary,
} from "@/lib/auth/claim-anonymous-session";
import { logServerError } from "@/lib/observability/log-error";

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "EMAIL_IN_USE"
  | "WEAK_PASSWORD"
  | "INVALID_EMAIL"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface AuthSuccess {
  status: "success";
  requiresEmailConfirmation: boolean;
  claim?: ClaimSummary;
}

export interface AuthError {
  status: "error";
  error: string;
  code: AuthErrorCode;
}

export type AuthResult = AuthSuccess | AuthError;

export interface AuthIdentity {
  userId: string;
  email: string | null;
}

function mapSupabaseAuthError(message: string): AuthErrorCode {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already exists")) {
    return "EMAIL_IN_USE";
  }
  if (m.includes("invalid login credentials")) return "INVALID_CREDENTIALS";
  if (m.includes("password")) return "WEAK_PASSWORD";
  if (m.includes("email")) return "INVALID_EMAIL";
  return "UNKNOWN";
}

/**
 * Claim the current browser's anonymous session data into the newly
 * authenticated account, then clear the now-stale anonymous cookie.
 * A no-op (returns undefined) if this browser had no anonymous session.
 */
async function claimIfPossible(userId: string): Promise<ClaimSummary | undefined> {
  const anonymousSessionId = await getAnonymousSessionId();
  if (!anonymousSessionId) return undefined;

  const summary = await claimAnonymousSessionForUser(userId, anonymousSessionId);

  try {
    const cookieStore = await cookies();
    cookieStore.delete(ANONYMOUS_SESSION_COOKIE);
  } catch {
    // Best-effort only — not fatal if the cookie can't be cleared here;
    // it will simply be treated as already-claimed (rows no longer
    // match `user_id IS NULL`) on any future reference.
  }

  return summary;
}

export async function signUpAction(
  email: string,
  password: string
): Promise<AuthResult> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    return {
      status: "error",
      error: "Email and password are required.",
      code: "INVALID_EMAIL",
    };
  }
  if (password.length < 8) {
    return {
      status: "error",
      error: "Password must be at least 8 characters.",
      code: "WEAK_PASSWORD",
    };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (err) {
    void logServerError("signUpAction", err, { errorCode: "CONFIGURATION_ERROR" });
    return {
      status: "error",
      error: "Sign-up is not configured for this environment.",
      code: "CONFIGURATION_ERROR",
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
  });

  if (error) {
    return {
      status: "error",
      error: error.message,
      code: mapSupabaseAuthError(error.message),
    };
  }

  if (!data.user) {
    return {
      status: "error",
      error: "Sign-up did not return a user.",
      code: "UNKNOWN",
    };
  }

  // If email confirmation is required, Supabase returns a user but no
  // session yet — nothing to claim into until they confirm and sign in.
  if (!data.session) {
    return { status: "success", requiresEmailConfirmation: true };
  }

  const claim = await claimIfPossible(data.user.id);
  return { status: "success", requiresEmailConfirmation: false, claim };
}

export async function signInAction(
  email: string,
  password: string
): Promise<AuthResult> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    return {
      status: "error",
      error: "Email and password are required.",
      code: "INVALID_CREDENTIALS",
    };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch (err) {
    void logServerError("signInAction", err, { errorCode: "CONFIGURATION_ERROR" });
    return {
      status: "error",
      error: "Sign-in is not configured for this environment.",
      code: "CONFIGURATION_ERROR",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error || !data.user) {
    return {
      status: "error",
      error: error?.message ?? "Invalid email or password.",
      code: "INVALID_CREDENTIALS",
    };
  }

  const claim = await claimIfPossible(data.user.id);
  return { status: "success", requiresEmailConfirmation: false, claim };
}

export async function signOutAction(): Promise<{ status: "success" | "error" }> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
    return { status: "success" };
  } catch (err) {
    void logServerError("signOutAction", err);
    return { status: "error" };
  }
}

/**
 * Read-only — used by server components (dashboard layout, settings) to
 * render real identity instead of a hardcoded placeholder. Returns null
 * for anonymous visitors (not an error state).
 */
export async function getAuthIdentity(): Promise<AuthIdentity | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return { userId: user.id, email: user.email ?? null };
  } catch {
    return null;
  }
}

/** Tables owned by a signed-in user, in an order safe to delete in. */
const OWNED_TABLES = [
  "interview_sessions",
  "skill_bridges",
  "rewrites",
  "analyses",
  "job_targets",
  "resumes",
] as const;

export interface DeleteAccountResult {
  status: "success" | "error";
  error?: string;
}

/**
 * Permanently delete the signed-in user's account: every owned row
 * across every table, every resume's storage object, then the auth
 * user itself. Irreversible. Requires an active session — there is no
 * separate confirmation step here because the client component that
 * calls this already requires an explicit two-step confirm (see
 * components/settings/account-panel.tsx).
 */
export async function deleteAccountAction(): Promise<DeleteAccountResult> {
  let userId: string;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return { status: "error", error: "You are not signed in." };
    }
    userId = user.id;
  } catch (err) {
    void logServerError("deleteAccountAction", err, { errorCode: "CONFIGURATION_ERROR" });
    return { status: "error", error: "Account deletion is not configured for this environment." };
  }

  try {
    const admin = createAdminClient();

    const { data: resumeRows } = await admin
      .from("resumes")
      .select("storage_path")
      .eq("user_id", userId);

    const storagePaths = (resumeRows ?? [])
      .map((row) => row.storage_path as string)
      .filter(Boolean);

    if (storagePaths.length > 0) {
      const { error: removeError } = await admin.storage
        .from("resumes")
        .remove(storagePaths);
      if (removeError) {
        void logServerError("deleteAccountAction", removeError, {
          ownerType: "authenticated",
          context: { phase: "storage-remove" },
        });
        // Continue — an orphaned storage object is recoverable via the
        // cleanup job; a half-deleted account is a worse outcome.
      }
    }

    for (const table of OWNED_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error) {
        void logServerError("deleteAccountAction", error, {
          ownerType: "authenticated",
          context: { phase: "table-delete", table },
        });
      }
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // The account is already gone server-side; a stale local session
      // cookie is harmless and will fail auth checks on its own.
    }

    return { status: "success" };
  } catch (err) {
    void logServerError("deleteAccountAction", err, { ownerType: "authenticated" });
    return {
      status: "error",
      error: "Failed to delete your account. Please try again.",
    };
  }
}
