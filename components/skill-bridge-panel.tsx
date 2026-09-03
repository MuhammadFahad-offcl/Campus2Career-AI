"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PartyPopper,
  Sparkles,
  Target,
} from "lucide-react";
import {
  getSkillBridgeAction,
  generateSkillBridgeAction,
  updateDayStatusAction,
} from "@/app/actions/skill-bridge";
import type { SkillBridgePlan } from "@/types";
import { calculateProgress, isReadyToApply } from "@/lib/skill-bridge/plan-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { SkillBridgeDayCard } from "@/components/skill-bridge-day-card";
import { cn } from "@/lib/utils";

type PanelStage = "loading" | "idle" | "generating" | "success" | "error";

export function SkillBridgePanel() {
  const [stage, setStage] = useState<PanelStage>("loading");
  const [plan, setPlan] = useState<SkillBridgePlan | null>(null);
  const [jobTitle, setJobTitle] = useState("");
  const [jobCompany, setJobCompany] = useState("");
  const [matchScore, setMatchScore] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [updatingDay, setUpdatingDay] = useState<number | null>(null);

  // Synchronous double-submit guard: the Regenerate Plan button stays
  // mounted while generation runs — a second click must not enqueue a
  // second AI plan generation (duplicate generation).
  const generateInFlightRef = useRef(false);

  // ── On mount: fetch existing plan (reuse — never regenerate) ────
  useEffect(() => {
    let cancelled = false;

    const loadExisting = async () => {
      try {
        const response = await getSkillBridgeAction();
        if (cancelled) return;

        if (response.status === "success") {
          setPlan(response.plan);
          setJobTitle(response.jobTitle);
          setJobCompany(response.jobCompany);
          setMatchScore(response.matchScore);
          setStage("success");
        } else if (response.code === "SESSION_NOT_FOUND") {
          setStage("error");
          setErrorMessage(response.error);
        } else {
          // No analysis or no plan yet — show the generate CTA
          setStage("idle");
        }
      } catch {
        if (!cancelled) setStage("idle");
      }
    };

    loadExisting();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Generate a new plan ─────────────────────
  const runGenerate = useCallback(async (regenerate = false) => {
    if (generateInFlightRef.current) return;
    generateInFlightRef.current = true;

    setStage("generating");
    setErrorMessage("");

    try {
      const response = await generateSkillBridgeAction({ regenerate });
      if (response.status === "success") {
        setPlan(response.plan);
        setJobTitle(response.jobTitle);
        setJobCompany(response.jobCompany);
        setMatchScore(response.matchScore);
        setStage("success");
      } else {
        setStage("error");
        setErrorMessage(response.error);
      }
    } catch {
      setStage("error");
      setErrorMessage(
        "An unexpected error occurred while generating your skill bridge plan."
      );
    } finally {
      generateInFlightRef.current = false;
    }
  }, []);

  // ── Toggle day completion ───────────────────
  const handleToggleComplete = useCallback(
    async (day: number) => {
      if (!plan) return;

      const currentDay = plan.days.find((d) => d.day === day);
      if (!currentDay) return;

      const nextStatus =
        currentDay.status === "completed" ? "pending" : "completed";

      setUpdatingDay(day);
      try {
        const response = await updateDayStatusAction(plan.id, day, nextStatus);
        if (response.status === "success") {
          setPlan(response.plan);
        } else {
          setErrorMessage(response.error);
        }
      } catch {
        setErrorMessage("Could not save task status. Please try again.");
      } finally {
        setUpdatingDay(null);
      }
    },
    [plan]
  );

  const progress = plan ? calculateProgress(plan.days) : null;
  const ready = plan ? isReadyToApply(plan.days) : false;
  const nextDayNumber = plan?.days.find((d) => d.status !== "completed")?.day;

  return (
    <div className="space-y-5">
      {/* Loading state (checking for existing plan) */}
      {stage === "loading" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="mt-3 text-xs text-muted-foreground">
            Loading your skill bridge...
          </p>
        </div>
      )}

      {/* Idle state — CTA to generate plan */}
      {stage === "idle" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 px-8 py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Sparkles className="size-6 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            7-Day Skill Bridge
          </p>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground">
            Turn your highest-impact skill gaps into a practical 7-day action
            plan with hands-on tasks that create real, demonstrable evidence
            for your target role.
          </p>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Requires a completed match analysis
          </p>
          <button
            onClick={() => runGenerate(false)}
            className={cn(buttonVariants({ size: "sm" }), "mt-4 text-xs")}
          >
            <Sparkles className="size-3.5" />
            Generate My 7-Day Plan
          </button>
        </div>
      )}

      {/* Generating state */}
      {stage === "generating" && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">
            Generating your 7-day plan...
          </p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            Analyzing your skill gaps and projects to build a realistic,
            evidence-first action plan. This may take up to 30 seconds.
          </p>
        </div>
      )}

      {/* Error state */}
      {stage === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">
              Skill Bridge generation failed
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {errorMessage}
            </p>
            <button
              onClick={() => runGenerate(false)}
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
      {stage === "success" && plan && progress && (
        <>
          {/* Header */}
          <Card>
            <CardContent className="py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <Sparkles className="size-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {jobTitle}
                      {jobCompany && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {jobCompany}
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {progress.completed} of {progress.total} days completed
                      {matchScore > 0 && (
                        <span className="ml-1.5 inline-flex items-center gap-1 text-primary">
                          <Target className="size-3" />
                          {Math.round(matchScore)}% match
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {progress.percentage}%
                </Badge>
              </div>
              <ProgressBar value={progress.percentage} size="sm" />
            </CardContent>
          </Card>

          {/* Ready to Apply banner */}
          {ready && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <PartyPopper className="size-4 text-emerald-600" />
                <p className="text-sm font-medium text-emerald-700">
                  Ready to Apply
                </p>
              </div>
              <p className="mt-1 text-xs text-emerald-600/80">
                You completed all 7 days. Your new evidence is ready to add to
                your resume — regenerate your match analysis to see your
                improved score.
              </p>
            </div>
          )}

          {/* Priority gaps */}
          {plan.prioritySkills.length > 0 && (
            <div className="rounded-lg border border-border bg-card px-4 py-3">
              <p className="mb-2 text-xs font-medium text-foreground">
                Priority gaps this plan focuses on
              </p>
              <div className="space-y-2">
                {plan.prioritySkills.map((p) => (
                  <div key={p.skill} className="flex items-start gap-2">
                    <Target className="mt-0.5 size-3.5 shrink-0 text-primary/70" />
                    <div>
                      <span className="text-xs font-medium text-foreground">
                        {p.skill}
                      </span>
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        — {p.reason}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error message for day status updates */}
          {errorMessage && stage === "success" && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="size-3.5" />
              {errorMessage}
            </div>
          )}

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line connector */}
            <div className="absolute left-[22px] top-6 bottom-6 w-px bg-border" />

            <div className="space-y-4">
              {plan.days.map((day) => (
                <SkillBridgeDayCard
                  key={day.day}
                  day={day}
                  isNext={day.day === nextDayNumber}
                  onToggleComplete={handleToggleComplete}
                  disabled={updatingDay === day.day}
                />
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              Progress is saved automatically
            </div>
            <button
              onClick={() => runGenerate(true)}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "text-xs"
              )}
            >
              <Sparkles className="size-3" />
              Regenerate Plan
            </button>
          </div>
        </>
      )}
    </div>
  );
}
