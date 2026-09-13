"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnonymousSessionId } from "@/lib/anonymous-session";
import { type ResumeOwner } from "@/lib/resume-ownership";
import { candidateProfileSchema, rewriteSuggestionSchema } from "@/schemas";
import {
  applySuggestionsToProfile,
  type UnresolvedSuggestion,
} from "@/lib/rewrite/apply-suggestions";
import type { CandidateProfile, RewriteSuggestion } from "@/types";

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type BuildRewrittenResumeErrorCode =
  | "SESSION_NOT_FOUND"
  | "RESUME_NOT_FOUND"
  | "PROFILE_NOT_READY"
  | "INVALID_SUGGESTIONS"
  | "NO_ACCEPTED_SUGGESTIONS"
  | "CONFIGURATION_ERROR"
  | "UNKNOWN";

export interface BuildRewrittenResumeSuccess {
  status: "success";
  profile: CandidateProfile;
  appliedCount: number;
  unresolved: UnresolvedSuggestion[];
}

export interface BuildRewrittenResumeFailure {
  status: "error";
  code: BuildRewrittenResumeErrorCode;
  error: string;
}

export type BuildRewrittenResumeResult =
  | BuildRewrittenResumeSuccess
  | BuildRewrittenResumeFailure;

function failure(
  code: BuildRewrittenResumeErrorCode,
  message: string
): BuildRewrittenResumeFailure {
  return { status: "error", code, error: message };
}

// ──────────────────────────────────────────────
// Auth context (same pattern as generate-rewrite.ts / analyze-resume.ts)
// ──────────────────────────────────────────────

async function getBuildContext() {
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

// A suggestion array coming back from the client is re-validated with the
// exact schema used to persist rewrites — the client only ever echoes back
// suggestions this app generated, but this action never trusts that.
const suggestionsInputSchema = z.array(rewriteSuggestionSchema).max(50);

/**
 * Build a fully rewritten, job-tailored resume by applying every accepted or
 * edited suggestion from a rewrite review session onto the candidate's
 * stored profile.
 *
 * This makes NO new AI call and costs nothing beyond a single DB read — it
 * only relocates text the AI already generated (and the evidence validator
 * already approved when the rewrite was first created) into the right
 * structured field via applySuggestionsToProfile(). Accept/reject/edit
 * decisions live only in client state (see rewrite-panel.tsx), so the
 * current suggestion list is passed in rather than read back from the DB.
 */
export async function buildRewrittenResume(
  resumeId: string,
  suggestions: RewriteSuggestion[]
): Promise<BuildRewrittenResumeResult> {
  let context: Awaited<ReturnType<typeof getBuildContext>>;
  try {
    context = await getBuildContext();
  } catch (err) {
    console.error("[buildRewrittenResume] Context failed:", err);
    return failure(
      "CONFIGURATION_ERROR",
      "Resume rewrite is not configured. Please contact the demo owner."
    );
  }

  if (!context) {
    return failure(
      "SESSION_NOT_FOUND",
      "Your session has expired. Please refresh the page and try again."
    );
  }

  const { owner, supabase } = context;

  const parsedSuggestions = suggestionsInputSchema.safeParse(suggestions);
  if (!parsedSuggestions.success) {
    return failure(
      "INVALID_SUGGESTIONS",
      "The rewrite suggestions could not be validated. Please regenerate them."
    );
  }

  const relevant = parsedSuggestions.data.filter(
    (s) => s.status === "accepted" || s.status === "edited"
  );

  if (relevant.length === 0) {
    return failure(
      "NO_ACCEPTED_SUGGESTIONS",
      "Accept or edit at least one suggestion before generating the full rewritten resume."
    );
  }

  const resumeQuery = supabase
    .from("resumes")
    .select("id, candidate_profile")
    .eq("id", resumeId);
  const { data: resume, error: fetchError } = await applyOwnerFilter(
    resumeQuery,
    owner
  ).single();

  if (fetchError || !resume) {
    return failure(
      "RESUME_NOT_FOUND",
      "Resume not found or you do not have access to it."
    );
  }

  let profile: CandidateProfile;
  try {
    profile = candidateProfileSchema.parse(resume.candidate_profile);
  } catch {
    return failure(
      "PROFILE_NOT_READY",
      "The stored resume profile is invalid. Please re-analyze the resume."
    );
  }

  const { profile: rewritten, appliedIds, unresolved } =
    applySuggestionsToProfile(profile, relevant as RewriteSuggestion[]);

  return {
    status: "success",
    profile: rewritten,
    appliedCount: appliedIds.length,
    unresolved,
  };
}
