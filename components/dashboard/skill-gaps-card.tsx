import { AlertCircle, CheckCircle2, Target, XCircle } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/shared";
import { cn } from "@/lib/utils";
import type { DashboardSkillSnapshot } from "@/types";

const importanceTone: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-700",
  important: "border-amber-200 bg-amber-50 text-amber-700",
  "nice-to-have": "border-slate-200 bg-slate-50 text-slate-600",
};

function GapStatusIcon({ status }: { status: string }) {
  if (status === "matched") {
    return <CheckCircle2 className="size-4 text-emerald-500" />;
  }
  if (status === "partial") {
    return <AlertCircle className="size-4 text-amber-500" />;
  }
  return <XCircle className="size-4 text-red-400" />;
}

function CountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tone
      )}
    >
      {count} {label}
    </span>
  );
}

/**
 * Row 2 (right) — "What is missing?"
 * Top gaps with truthful explanations, counted from the stored Analysis.
 */
export function SkillGapsCard({
  skills,
}: {
  skills: DashboardSkillSnapshot | null;
}) {
  if (!skills) {
    return (
      <SectionCard
        title="Priority Skill Gaps"
        description="What stands between you and the target role"
      >
        <EmptyState
          icon={Target}
          title="No skill gaps analyzed yet"
          description="Run a job match to see which skills matter most for your target role."
          action={{ label: "Analyze a Job", href: "/job-matcher" }}
          className="py-10"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Priority Skill Gaps"
      description="What stands between you and the target role"
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <CountChip
          label="matched"
          count={skills.matched}
          tone="border-emerald-200 bg-emerald-50 text-emerald-700"
        />
        <CountChip
          label="partial"
          count={skills.partial}
          tone="border-amber-200 bg-amber-50 text-amber-700"
        />
        <CountChip
          label="missing"
          count={skills.missing}
          tone="border-red-200 bg-red-50 text-red-700"
        />
      </div>

      {skills.topGaps.length > 0 ? (
        <div className="space-y-2.5">
          {skills.topGaps.map((gap) => (
            <div
              key={gap.skill}
              className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <div className="mt-0.5 shrink-0">
                <GapStatusIcon status={gap.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {gap.skill}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium capitalize",
                      importanceTone[gap.importance] ?? importanceTone["nice-to-have"]
                    )}
                  >
                    {gap.importance}
                  </span>
                </div>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {gap.explanation}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-700">
          No priority gaps — your profile covers the analyzed requirements for this
          role.
        </p>
      )}
    </SectionCard>
  );
}
