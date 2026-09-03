import Link from "next/link";
import { ArrowRight, CheckCircle2, Sparkles, Target } from "lucide-react";
import { SectionCard, EmptyState, ProgressBar } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardSkillBridge } from "@/types";

/**
 * Row 3 (left) — the current Skill Bridge state.
 * Rendered from the persisted plan; the dashboard never generates tasks.
 */
export function SkillBridgeCard({
  bridge,
}: {
  bridge: DashboardSkillBridge | null;
}) {
  if (!bridge) {
    return (
      <SectionCard
        title="Skill Bridge"
        description="Your 7-day evidence-first improvement plan"
      >
        <EmptyState
          icon={Target}
          title="No 7-day plan yet"
          description="Run a job match to generate a personalized improvement plan for your priority gaps."
          action={{ label: "Open Job Matcher", href: "/job-matcher" }}
          className="py-10"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Skill Bridge"
      description="Your 7-day evidence-first improvement plan"
      action={
        <Link
          href="/skill-bridge"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
        >
          {bridge.readyToApply ? "View Plan" : "Continue"}
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {bridge.readyToApply ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-700">Ready to Apply</p>
          </div>
          <p className="mt-1 text-xs text-emerald-600/80">
            You completed all {bridge.totalDays} days. Review the rewrite
            suggestions, add your new evidence, and apply with confidence.
          </p>
        </div>
      ) : bridge.currentDay !== null ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Day {bridge.currentDay} of {bridge.totalDays}
            </span>
            <span className="text-xs text-muted-foreground">
              {bridge.completedDays} completed
            </span>
          </div>

          {bridge.currentDayTitle && (
            <p className="text-sm font-medium text-foreground">
              {bridge.currentDayTitle}
            </p>
          )}
          {bridge.currentDayTask && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              {bridge.currentDayTask}
            </p>
          )}
          {bridge.currentDayEvidence && (
            <p className="flex items-start gap-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
              <Sparkles className="mt-0.5 size-3 shrink-0 text-primary/70" />
              <span>
                <span className="font-medium text-foreground">
                  Expected evidence:{" "}
                </span>
                {bridge.currentDayEvidence}
              </span>
            </p>
          )}

          <ProgressBar value={bridge.percentage} size="sm" />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            All {bridge.totalDays} days accounted for.
          </p>
          <ProgressBar value={bridge.percentage} size="sm" />
        </div>
      )}
    </SectionCard>
  );
}
