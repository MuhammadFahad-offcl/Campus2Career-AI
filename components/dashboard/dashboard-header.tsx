import { cn } from "@/lib/utils";
import { Target } from "lucide-react";
import type { DashboardSummary } from "@/types";
import { formatShortDate, getReadinessLabel } from "@/lib/dashboard/summary-utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const readinessTone: Record<string, string> = {
  READY_TO_APPLY: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NO_RESUME: "border-border bg-muted text-muted-foreground",
  PROFILE_PENDING: "border-amber-200 bg-amber-50 text-amber-700",
};

/**
 * Hero greeting block — the "Where am I?" answer.
 * Server-rendered from the summary; never fabricates a name or state.
 */
export function DashboardHeader({ summary }: { summary: DashboardSummary }) {
  const tone =
    readinessTone[summary.readiness] ?? "border-primary/20 bg-primary/5 text-primary";

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-accent/5 to-transparent p-5 ring-1 ring-primary/10 sm:p-6">
      <div className="mesh-blob -right-10 -top-14 size-40 bg-accent/25" aria-hidden="true" />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {getGreeting()}
            {summary.candidateName ? `, ${summary.candidateName}` : ""} 👋
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s your current career readiness
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-sm",
            tone
          )}
        >
          {getReadinessLabel(summary.readiness)}
        </span>
      </div>

      {summary.targetRole && (
        <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Target className="size-3.5 shrink-0 text-primary/70" />
          <span className="font-medium text-foreground">
            {summary.targetRole.title}
          </span>
          {summary.targetRole.company && (
            <span>· {summary.targetRole.company}</span>
          )}
          {summary.targetRole.analyzedAt && (
            <>
              <span aria-hidden>·</span>
              <span className="text-xs">
                analyzed {formatShortDate(summary.targetRole.analyzedAt)}
              </span>
            </>
          )}
        </div>
      )}
    </section>
  );
}
