"use client";

import { useState, useCallback, useRef } from "react";
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileSearch,
  RotateCcw,
} from "lucide-react";
import {
  calculateATSScore,
  type ATSActionResult,
} from "@/app/actions/ats-score";
import type { ATSScoreResult } from "@/types";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { MatchScoreGauge } from "@/components/shared";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ProgressBar } from "@/components/shared";

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent ATS Compatibility";
  if (score >= 80) return "Highly ATS Friendly";
  if (score >= 70) return "Good ATS Compatibility";
  if (score >= 60) return "Needs Improvement";
  return "Poor ATS Compatibility";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function getCategoryBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-400";
}

// ──────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────

interface ATSScorePanelProps {
  resumeId: string | null;
}

export function ATSScorePanel({ resumeId }: ATSScorePanelProps) {
  const [result, setResult] = useState<ATSScoreResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const inFlightRef = useRef(false);

  const handleAnalyze = useCallback(async () => {
    if (!resumeId) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setIsAnalyzing(true);
    setError(null);
    setResult(null);
    setShowDetails(false);

    try {
      const response = await calculateATSScore(resumeId);

      if (response.status === "success") {
        setResult(response.result);
      } else {
        setError(response.error);
      }
    } catch {
      setError(
        "An unexpected error occurred. Please check your connection and try again."
      );
    } finally {
      inFlightRef.current = false;
      setIsAnalyzing(false);
    }
  }, [resumeId]);

  if (!resumeId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-8 sm:px-8 sm:py-10">
        <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-muted">
          <FileSearch className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">
          Check ATS Compatibility
        </p>
        <p className="text-xs text-muted-foreground text-center max-w-sm">
          Upload a resume to check how well it performs with Applicant Tracking
          Systems.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── CTA / Loading / Error Row ──────────── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={isAnalyzing}
          className={cn(
            buttonVariants({ size: "lg" }),
            "flex-1 sm:flex-none"
          )}
        >
          {isAnalyzing ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Analyzing Resume...
            </>
          ) : result ? (
            <>
              <FileSearch className="size-4 mr-2" />
              View ATS Report
            </>
          ) : (
            <>
              <FileSearch className="size-4 mr-2" />
              Check ATS Score
            </>
          )}
        </button>
      </div>

      {/* ── Error State ────────────────────────── */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              ATS analysis failed
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
          </div>
          <button
            type="button"
            onClick={handleAnalyze}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "shrink-0"
            )}
          >
            <RotateCcw className="size-3.5 mr-1" />
            Retry
          </button>
        </div>
      )}

      {/* ── Loading State ──────────────────────── */}
      {isAnalyzing && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-8 sm:px-8 sm:py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Analyzing ATS compatibility...
          </p>
          <p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">
            Evaluating resume structure, formatting, keywords, and
            machine-readability.
          </p>
        </div>
      )}

      {/* ── Results ────────────────────────────── */}
      {!isAnalyzing && result && (
        <ATSScoreResults
          result={result}
          showDetails={showDetails}
          onToggleDetails={() => setShowDetails((p) => !p)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Results Sub-Component
// ──────────────────────────────────────────────

function ATSScoreResults({
  result,
  showDetails,
  onToggleDetails,
}: {
  result: ATSScoreResult;
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Main Score Card */}
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <MatchScoreGauge
              score={result.overall}
              size="lg"
              label="ATS Score"
            />
            <div className="flex-1 text-center sm:text-left min-w-0">
              <CardTitle className="text-base">
                ATS Compatibility
              </CardTitle>
              <p
                className={cn(
                  "text-sm font-semibold mt-0.5",
                  getScoreColor(result.overall)
                )}
              >
                {result.overall}/100 — {getScoreLabel(result.overall)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {result.description}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category Bars */}
          <div className="space-y-3">
            {result.categories.map((cat) => (
              <div key={cat.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {cat.name}
                  </span>
                  <span className="text-muted-foreground">{cat.score}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700 ease-out",
                      getCategoryBarColor(cat.score)
                    )}
                    style={{ width: `${cat.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Toggle Details */}
          <button
            type="button"
            onClick={onToggleDetails}
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "w-full"
            )}
          >
            {showDetails ? "Hide Detailed Report" : "View Detailed ATS Report"}
          </button>
        </CardContent>
      </Card>

      {/* Detailed Breakdown */}
      {showDetails && (
        <>
          {/* Strengths */}
          {result.strengths.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  </div>
                  <CardTitle className="text-sm">
                    What&apos;s Working Well
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.strengths.map((item, i) => (
                  <div
                    key={`${item.text}-${i}`}
                    className="flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{item.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.category}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Improvements */}
          {result.improvements.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50">
                    <AlertTriangle className="size-4 text-amber-600" />
                  </div>
                  <CardTitle className="text-sm">
                    What to Improve
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.improvements.map((item, i) => (
                  <div
                    key={`${item.text}-${i}`}
                    className="flex items-start gap-2.5"
                  >
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{item.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {item.category}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              ATS scores are an estimate based on resume structure, formatting,
              keywords, and machine-readability. They do not guarantee passing
              any specific ATS system.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
