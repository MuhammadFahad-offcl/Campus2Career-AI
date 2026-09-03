import { SectionCard, MatchScoreGauge, EmptyState } from "@/components/shared";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardMatch } from "@/types";
import { formatShortDate } from "@/lib/dashboard/summary-utils";

function scoreBarTone(value: number): string {
  if (value >= 75) return "bg-emerald-500";
  if (value >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {value}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", scoreBarTone(value))}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Row 2 (left) — the latest match score with its breakdown.
 * Rendered from the persisted Analysis score — never recalculated.
 */
export function MatchOverviewCard({
  match,
  analyzedAt,
}: {
  match: DashboardMatch | null;
  analyzedAt: string | null;
}) {
  if (!match) {
    return (
      <SectionCard title="Match Overview" description="Your latest job match result">
        <EmptyState
          icon={Target}
          title="No match analysis yet"
          description="Analyze a job to see your match score, skill gaps, and next steps."
          action={{ label: "Open Job Matcher", href: "/job-matcher" }}
          className="py-10"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Match Overview"
      description="Your latest job match result"
    >
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <MatchScoreGauge score={match.score.overall} label={match.label} />

        <div className="w-full flex-1 space-y-3">
          <p className="text-center text-xs text-muted-foreground sm:text-left">
            Based on skills, experience, and education alignment
            {analyzedAt && (
              <span className="ml-1">
                · analyzed {formatShortDate(analyzedAt)}
              </span>
            )}
          </p>
          <div className="space-y-2">
            <ScoreBar label="Skills Match" value={match.score.skillsMatch} />
            <ScoreBar label="Experience Match" value={match.score.experienceMatch} />
            <ScoreBar label="Education Match" value={match.score.educationMatch} />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
