"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  Loader2,
  MapPin,
  Target,
  Sparkles,
} from "lucide-react";
import { analyzeJob, type AnalyzeJobResult } from "@/app/actions/analyze-job";
import {
  computeLatestMatch,
  getLatestMatchContext,
  type ComputeMatchResult,
} from "@/app/actions/compute-match";
import type { JobTarget } from "@/types";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SectionCard } from "@/components/shared";
import { Textarea } from "@/components/ui/textarea";
import { MatchResultsPanel } from "@/components/match-results-panel";

type Stage = "idle" | "analyzing" | "success" | "error";
type MatchStage = "idle" | "computing" | "success" | "error";

function OpportunityBadge({ type }: { type: string }) {
  const label = type.replace("-", " ");
  const tone =
    type === "internship"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : type === "full-time"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : type === "part-time"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        tone
      )}
    >
      {label}
    </span>
  );
}

function StringList({ items, emptyLabel }: { items: string[]; emptyLabel?: string }) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        {emptyLabel ?? "None detected"}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-foreground"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function JobTargetResults({ jobTarget }: { jobTarget: JobTarget }) {
  return (
    <div className="space-y-4">
      {/* Job Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <Briefcase className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">
                {jobTarget.title || "Untitled Position"}
              </CardTitle>
              <CardDescription className="flex items-center gap-2">
                {jobTarget.company && <span>{jobTarget.company}</span>}
                {jobTarget.company && jobTarget.location && <span>·</span>}
                {jobTarget.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" />
                    {jobTarget.location}
                  </span>
                )}
              </CardDescription>
            </div>
            <div className="ml-auto">
              <OpportunityBadge type={jobTarget.opportunityType} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Requirements Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Required Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Required Skills ({jobTarget.requiredSkills.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StringList items={jobTarget.requiredSkills} emptyLabel="No required skills detected" />
          </CardContent>
        </Card>

        {/* Required Technologies */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              Required Technologies ({jobTarget.requiredTechnologies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StringList items={jobTarget.requiredTechnologies} emptyLabel="No technologies detected" />
          </CardContent>
        </Card>

        {/* Preferred Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Preferred Skills ({jobTarget.preferredSkills.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StringList items={jobTarget.preferredSkills} emptyLabel="No preferred skills detected" />
          </CardContent>
        </Card>

        {/* Soft Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
              Soft Skills ({jobTarget.softSkills.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <StringList items={jobTarget.softSkills} emptyLabel="No soft skills detected" />
          </CardContent>
        </Card>
      </div>

      {/* Education & Experience */}
      {(jobTarget.educationRequirements.length > 0 ||
        jobTarget.experienceRequirements.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                <GraduationCap className="size-4 text-emerald-600" />
              </div>
              <CardTitle className="text-sm">Education & Experience</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {jobTarget.educationRequirements.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                  Education
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {jobTarget.educationRequirements.map((req, i) => (
                    <li key={i} className="text-sm text-foreground">{req}</li>
                  ))}
                </ul>
              </div>
            )}
            {jobTarget.experienceRequirements.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
                  Experience
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {jobTarget.experienceRequirements.map((req, i) => (
                    <li key={i} className="text-sm text-foreground">{req}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Responsibilities */}
      {jobTarget.responsibilities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Responsibilities</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-0.5">
              {jobTarget.responsibilities.map((resp, i) => (
                <li key={i} className="text-sm text-muted-foreground">{resp}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Domain Requirements */}
      {jobTarget.domainRequirements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Domain Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <StringList items={jobTarget.domainRequirements} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function JobAnalysisPanel() {
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<AnalyzeJobResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [restoring, setRestoring] = useState(true);
  const [restored, setRestored] = useState(false);

  // Match analysis state
  const [matchStage, setMatchStage] = useState<MatchStage>("idle");
  const [matchResult, setMatchResult] = useState<ComputeMatchResult | null>(null);
  const [matchError, setMatchError] = useState("");

  // Synchronous double-submit guards: rapid re-clicks must not start
  // parallel analyses (duplicate AI calls / duplicate rows).
  const analysisInFlightRef = useRef(false);
  const matchInFlightRef = useRef(false);

  // Restore the most recent saved job target + analysis on mount so a
  // refresh never discards persisted work or triggers a redundant AI call.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const saved = await getLatestMatchContext();
        if (cancelled || saved.status !== "success" || !saved.jobTarget) return;

        setDescription(saved.jobTarget.description ?? "");
        setResult({
          status: "success",
          jobTargetId: saved.jobTarget.id,
          jobTarget: saved.jobTarget,
          analyzedAt: saved.jobTarget.updatedAt,
          ownerType: saved.ownerType,
        });
        setStage("success");
        setRestored(true);

        if (saved.match) {
          setMatchResult(saved.match);
          setMatchStage("success");
        }
      } catch {
        // Saved context is optional — fall through to the fresh-input flow.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    };

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const characterCount = description.length;
  const isTooShort = characterCount > 0 && characterCount < 50;

  const runAnalysis = useCallback(async () => {
    if (!description.trim()) return;
    if (analysisInFlightRef.current) return;
    analysisInFlightRef.current = true;

    setStage("analyzing");
    setResult(null);
    setErrorMessage("");
    setRestored(false);

    try {
      const response = await analyzeJob(description);
      setResult(response);

      if (response.status === "success") {
        setStage("success");
      } else {
        setStage("error");
        setErrorMessage(response.error);
      }
    } catch {
      setStage("error");
      setErrorMessage("An unexpected error occurred while analyzing the job description.");
    } finally {
      analysisInFlightRef.current = false;
    }
  }, [description]);

  const handleReset = useCallback(() => {
    setStage("idle");
    setResult(null);
    setErrorMessage("");
    setDescription("");
    setMatchStage("idle");
    setMatchResult(null);
    setMatchError("");
  }, []);

  const runMatchAnalysis = useCallback(async () => {
    if (!result || result.status !== "success") return;
    if (matchInFlightRef.current) return;
    matchInFlightRef.current = true;

    setMatchStage("computing");
    setMatchResult(null);
    setMatchError("");
    setRestored(false);

    try {
      const response = await computeLatestMatch(result.jobTargetId);
      setMatchResult(response);

      if (response.status === "success") {
        setMatchStage("success");
      } else {
        setMatchStage("error");
        setMatchError(response.error);
      }
    } catch {
      setMatchStage("error");
      setMatchError("An unexpected error occurred while computing match analysis.");
    } finally {
      matchInFlightRef.current = false;
    }
  }, [result]);

  return (
    <div className="space-y-5">
      {/* Input Section */}
      <SectionCard
        title="Paste Job or Internship Description"
        description="Enter the full job posting text to extract structured requirements"
        action={
          stage === "success" ? (
            <button
              onClick={handleReset}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
            >
              New Analysis
            </button>
          ) : undefined
        }
      >
        <Textarea
          className="min-h-[180px]"
          placeholder="Paste the job description here... Include the job title, company name, requirements, qualifications, and responsibilities for the best analysis."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={stage === "analyzing" || stage === "success"}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={runAnalysis}
              disabled={stage === "analyzing" || stage === "success" || !description.trim() || isTooShort}
              className={cn(buttonVariants({ size: "sm" }), "text-xs")}
            >
              {stage === "analyzing" ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Target className="size-3.5" />
                  Analyze Job
                </>
              )}
            </button>
            {isTooShort && (
              <span className="text-xs text-amber-600">
                Please enter at least 50 characters
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {characterCount} characters
          </span>
        </div>
      </SectionCard>

      {/* Restoring saved analysis */}
      {restoring && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Loading your saved analysis...
          </p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            Checking for a previously analyzed job target in this session.
          </p>
        </div>
      )}

      {/* Processing State */}
      {stage === "analyzing" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Analyzing job description...</p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            Extracting structured requirements, skills, technologies, and qualifications
            from the job description.
          </p>
        </div>
      )}

      {/* Error State */}
      {stage === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Analysis failed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Success State */}
      {stage === "success" && result?.status === "success" && (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <CheckCircle2 className="size-3.5" />
            {restored
              ? "Showing your most recently analyzed job"
              : "Job description analyzed successfully"}
          </div>

          <JobTargetResults jobTarget={result.jobTarget} />

          {/* Match Analysis CTA + Results */}
          <div className="space-y-4">
            {matchStage === "idle" && (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-8 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Ready for match analysis</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    Compare this job against your resume profile to see matched skills, gaps, and recommendations.
                  </p>
                </div>
                <button
                  onClick={runMatchAnalysis}
                  className={cn(buttonVariants({ size: "sm" }), "text-xs")}
                >
                  <Target className="size-3.5" />
                  Analyze My Match
                </button>
                <p className="text-[10px] text-muted-foreground">
                  Uses your most recently analyzed resume profile
                </p>
              </div>
            )}

            {matchStage === "computing" && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-12">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
                <p className="text-sm font-semibold text-foreground">Computing match analysis...</p>
                <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
                  Comparing your profile skills, experience, and education against the job requirements.
                </p>
              </div>
            )}

            {matchStage === "error" && (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Match analysis failed</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{matchError}</p>
                  <button
                    onClick={runMatchAnalysis}
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2 text-xs")}
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            {matchStage === "success" && matchResult?.status === "success" && (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle2 className="size-3.5" />
                  {restored
                    ? "Showing your most recent match analysis"
                    : "Match analysis complete"}
                </div>

                <MatchResultsPanel
                  score={matchResult.score}
                  skillGaps={matchResult.skillGaps}
                  strengths={matchResult.strengths}
                  weaknesses={matchResult.weaknesses}
                  recommendations={matchResult.recommendations}
                />
              </>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!restoring && stage === "idle" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-8 py-12 text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted">
            <Briefcase className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">
            Paste a job or internship description above
          </p>
          <p className="text-xs text-muted-foreground max-w-xs">
            The AI will extract required skills, preferred skills, technologies, education,
            experience, and other qualifications into a structured format.
          </p>
        </div>
      )}
    </div>
  );
}
