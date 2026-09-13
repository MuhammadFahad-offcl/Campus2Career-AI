"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  Target,
  Wand2,
  CheckCheck,
  FileEdit,
} from "lucide-react";
import {
  generateRewrite,
  getLatestRewrite,
  type GenerateRewriteResult,
} from "@/app/actions/generate-rewrite";
import {
  buildRewrittenResume,
  type BuildRewrittenResumeSuccess,
} from "@/app/actions/build-rewritten-resume";
import type { RewriteSuggestion } from "@/types";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { RewriteSuggestionCard } from "@/components/rewrite-suggestion-card";
import { RewrittenResumeView } from "@/components/rewritten-resume-view";

type RewriteStage = "idle" | "generating" | "success" | "error";
type AutoRewriteStage = "idle" | "building" | "error";

export function RewritePanel() {
  const [stage, setStage] = useState<RewriteStage>("idle");
  const [result, setResult] = useState<GenerateRewriteResult | null>(null);
  const [suggestions, setSuggestions] = useState<RewriteSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [restored, setRestored] = useState(false);

  // Auto-Rewrite Full Resume — applies accepted/edited suggestions onto the
  // stored profile (no new AI call) and shows a downloadable, tailored
  // resume so the user doesn't have to copy-paste each suggestion by hand.
  const [autoRewriteStage, setAutoRewriteStage] = useState<AutoRewriteStage>("idle");
  const [autoRewriteError, setAutoRewriteError] = useState("");
  const [autoRewrite, setAutoRewrite] = useState<BuildRewrittenResumeSuccess | null>(null);

  // Synchronous double-submit guard: the Regenerate button stays mounted
  // while a generation runs — a second click must not enqueue a second AI
  // rewrite (duplicate generation).
  const rewriteInFlightRef = useRef(false);

  // Restore the most recent saved rewrite on mount so a refresh never
  // discards persisted suggestions or triggers a redundant AI call.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const saved = await getLatestRewrite();
        if (
          cancelled ||
          saved.status !== "success" ||
          !saved.rewrite ||
          saved.rewrite.suggestions.length === 0
        ) {
          return;
        }

        setResult(saved.rewrite);
        setSuggestions(saved.rewrite.suggestions);
        setStage("success");
        setRestored(true);
      } catch {
        // Saved rewrite is optional — fall through to the idle flow.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const runRewrite = useCallback(async () => {
    if (rewriteInFlightRef.current) return;
    rewriteInFlightRef.current = true;

    setStage("generating");
    setResult(null);
    setSuggestions([]);
    setErrorMessage("");
    setRestored(false);
    setAutoRewrite(null);
    setAutoRewriteStage("idle");
    setAutoRewriteError("");

    try {
      const response = await generateRewrite();
      setResult(response);

      if (response.status === "success") {
        setSuggestions(response.suggestions);
        setStage("success");
      } else {
        setStage("error");
        setErrorMessage(response.error);
      }
    } catch {
      setStage("error");
      setErrorMessage(
        "An unexpected error occurred while generating rewrite suggestions."
      );
    } finally {
      rewriteInFlightRef.current = false;
    }
  }, []);

  const handleAccept = useCallback((id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "accepted" as const } : s))
    );
  }, []);

  const handleReject = useCallback((id: string) => {
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: "rejected" as const } : s))
    );
  }, []);

  const handleEdit = useCallback((id: string, editedText: string) => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: "edited" as const, editedText }
          : s
      )
    );
  }, []);

  const handleAcceptAll = useCallback(() => {
    setSuggestions((prev) =>
      prev.map((s) =>
        s.status === "pending" ? { ...s, status: "accepted" as const } : s
      )
    );
  }, []);

  const handleReset = useCallback(() => {
    if (result?.status === "success") {
      setSuggestions(result.suggestions);
    }
    setAutoRewrite(null);
    setAutoRewriteStage("idle");
    setAutoRewriteError("");
  }, [result]);

  const handleAutoRewrite = useCallback(async () => {
    if (result?.status !== "success") return;

    setAutoRewriteStage("building");
    setAutoRewriteError("");

    try {
      const response = await buildRewrittenResume(result.resumeId, suggestions);
      if (response.status === "success") {
        setAutoRewrite(response);
        setAutoRewriteStage("idle");
      } else {
        setAutoRewriteStage("error");
        setAutoRewriteError(response.error);
      }
    } catch {
      setAutoRewriteStage("error");
      setAutoRewriteError(
        "An unexpected error occurred while building the rewritten resume."
      );
    }
  }, [result, suggestions]);

  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const acceptedCount = suggestions.filter(
    (s) => s.status === "accepted" || s.status === "edited"
  ).length;
  const rejectedCount = suggestions.filter((s) => s.status === "rejected").length;

  return (
    <div className="space-y-5">
      {/* Restoring saved rewrite */}
      {restoring && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Loading your saved suggestions...
          </p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            Checking for previously generated rewrite suggestions in this
            session.
          </p>
        </div>
      )}

      {/* Idle state — CTA to generate rewrite */}
      {!restoring && stage === "idle" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-8 sm:px-8 sm:py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Wand2 className="size-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Job-Specific Resume Rewrite
          </p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            Generate targeted rewrite suggestions that improve how your resume
            presents existing qualifications for a specific job. The AI will only
            use evidence from your profile — it will never invent skills or
            experiences.
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Requires a completed resume analysis and match analysis
          </p>
          <button
            onClick={runRewrite}
            className={cn(buttonVariants({ size: "sm" }), "mt-4 text-xs")}
          >
            <Sparkles className="size-3.5" />
            Generate Rewrite Suggestions
          </button>
        </div>
      )}

      {/* Generating state */}
      {stage === "generating" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Generating rewrite suggestions...
          </p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            Analyzing your profile against the target job to generate
            evidence-aligned suggestions. This may take up to 30 seconds.
          </p>
        </div>
      )}

      {/* Error state */}
      {stage === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Rewrite generation failed
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {errorMessage}
            </p>
            <button
              onClick={runRewrite}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-2 text-xs"
              )}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Success state */}
      {stage === "success" && result?.status === "success" && (
        <>
          {restored && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              Showing your most recently generated suggestions — your accept /
              reject decisions reset on each visit
            </div>
          )}

          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-foreground">
                  Rewrite Suggestions
                </h3>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {result.jobTitle}
                {result.jobCompany && ` at ${result.jobCompany}`}
                {result.matchScore > 0 && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-primary">
                    <Target className="size-3" />
                    {Math.round(result.matchScore)}% match
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {acceptedCount} accepted · {rejectedCount} rejected ·{" "}
                {pendingCount} pending
              </span>
            </div>
          </div>

          {/* Auto-Rewrite Full Resume */}
          {acceptedCount > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-foreground">
                <span className="font-medium">
                  {acceptedCount} suggestion{acceptedCount !== 1 ? "s" : ""} ready to apply.
                </span>{" "}
                Skip the manual copy-paste — generate the complete rewritten resume.
              </p>
              <button
                onClick={handleAutoRewrite}
                disabled={autoRewriteStage === "building"}
                className={cn(buttonVariants({ size: "sm" }), "shrink-0 text-xs")}
              >
                {autoRewriteStage === "building" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <FileEdit className="size-3.5" />
                )}
                {autoRewrite ? "Regenerate Rewritten Resume" : "Auto-Rewrite Full Resume"}
              </button>
            </div>
          )}

          {autoRewriteStage === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
              <p className="text-xs text-muted-foreground">{autoRewriteError}</p>
            </div>
          )}

          {autoRewrite && (
            <RewrittenResumeView
              profile={autoRewrite.profile}
              jobTitle={result.jobTitle}
              jobCompany={result.jobCompany}
              appliedCount={autoRewrite.appliedCount}
              unresolved={autoRewrite.unresolved}
              onClose={() => setAutoRewrite(null)}
            />
          )}

          {/* Global actions */}
          {pendingCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleAcceptAll}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                <CheckCheck className="size-3.5" />
                Accept All ({pendingCount})
              </button>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <RotateCcw className="size-3" />
                Reset
              </button>
              <button
                onClick={runRewrite}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <Sparkles className="size-3" />
                Regenerate
              </button>
            </div>
          )}

          {/* Empty suggestions */}
          {suggestions.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 sm:px-8 sm:py-12 text-center">
              <p className="text-sm font-medium text-foreground">
                No suggestions generated
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Your resume may already be well-aligned with this job, or the
                profile content was insufficient to generate meaningful
                suggestions.
              </p>
            </div>
          )}

          {/* Suggestion cards */}
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <RewriteSuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={handleAccept}
                onReject={handleReject}
                onEdit={handleEdit}
              />
            ))}
          </div>

          {/* Summary footer */}
          {suggestions.length > 0 && pendingCount === 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-700">
                Review complete
              </p>
              <p className="mt-0.5 text-xs text-emerald-600/80">
                {acceptedCount} suggestion{acceptedCount !== 1 ? "s" : ""}{" "}
                accepted. Your original resume content is preserved — accepted
                suggestions are tracked separately.
              </p>
              <button
                onClick={runRewrite}
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "mt-2 text-xs"
                )}
              >
                <Sparkles className="size-3.5" />
                Generate New Suggestions
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
