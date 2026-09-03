import { History, Target } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { RecentAnalysisItem } from "@/types";
import { formatShortDate } from "@/lib/dashboard/summary-utils";

function scoreTone(score: number): string {
  if (score >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 50) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

/**
 * Row 4 — recent job analyses, straight from persisted history.
 * No match recalculation; scores are the stored values.
 */
export function RecentAnalysesCard({
  analyses,
}: {
  analyses: RecentAnalysisItem[];
}) {
  if (analyses.length === 0) {
    return (
      <SectionCard
        title="Recent Analyses"
        description="Your recent target roles"
      >
        <EmptyState
          icon={History}
          title="No analyses yet"
          description="Analyze a job to start building your match history."
          action={{ label: "Open Job Matcher", href: "/job-matcher" }}
          className="py-10"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Recent Analyses"
      description="Your recent target roles"
    >
      <div className="divide-y divide-border">
        {analyses.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Target className="size-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {item.jobTitle}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {item.jobCompany || "—"}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatShortDate(item.analyzedAt)}
            </span>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
                scoreTone(item.matchScore)
              )}
            >
              {Math.round(item.matchScore)}%
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
