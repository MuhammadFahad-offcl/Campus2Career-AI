import { Target, TrendingUp, Zap } from "lucide-react";
import { MetricCard } from "@/components/shared";
import type { DashboardSummary } from "@/types";

/**
 * Row 1 — the four headline metrics.
 * Every value comes from persisted data; missing data shows an em dash,
 * never a fabricated number.
 */
export function DashboardMetrics({ summary }: { summary: DashboardSummary }) {
  const matchValue = summary.match ? Math.round(summary.match.score.overall) : "—";
  const coverageValue = summary.skills
    ? `${summary.skills.matched}/${summary.skills.total}`
    : "—";
  const gapsValue = summary.skills ? summary.skills.priorityGapCount : "—";
  const bridgeValue = summary.skillBridge
    ? `${summary.skillBridge.completedDays}/${summary.skillBridge.totalDays}`
    : "—";

  return (
    <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Match Score"
        value={matchValue}
        suffix={summary.match ? "%" : undefined}
        icon={Target}
        accent="indigo"
        description={
          summary.match ? summary.match.label : "Run a job match to see your fit"
        }
      />
      <MetricCard
        label="Skill Coverage"
        value={coverageValue}
        icon={Zap}
        accent="purple"
        description={
          summary.skills ? "skills demonstrated" : "Analyze a job to measure skills"
        }
      />
      <MetricCard
        label="Priority Gaps"
        value={gapsValue}
        icon={Target}
        accent="amber"
        description={
          summary.skills
            ? "missing critical or important skills"
            : "No skill gaps analyzed yet"
        }
      />
      <MetricCard
        label="Skill Bridge"
        value={bridgeValue}
        icon={TrendingUp}
        accent="green"
        description={
          summary.skillBridge
            ? summary.skillBridge.readyToApply
              ? "plan complete"
              : "days completed"
            : "No 7-day plan yet"
        }
      />
    </div>
  );
}
