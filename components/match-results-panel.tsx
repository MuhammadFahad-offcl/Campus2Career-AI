"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { MatchScore, SkillGap } from "@/types";
import { getMatchScoreLabel } from "@/lib/scoring/score-labels";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ──────────────────────────────────────────────
// Score helpers
// ──────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-600";
}

function scoreRingColor(score: number): string {
  if (score >= 75) return "stroke-emerald-500";
  if (score >= 50) return "stroke-amber-500";
  return "stroke-red-500";
}

function scoreLabel(score: number): string {
  return getMatchScoreLabel(score);
}

// ──────────────────────────────────────────────
// Circular Score
// ──────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn("transition-all duration-700", scoreRingColor(score))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-2xl font-bold tabular-nums", scoreColor(score))}>
          {score}%
        </span>
        <span className="text-[10px] text-muted-foreground">match</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Score Breakdown Bar
// ──────────────────────────────────────────────

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("text-xs font-semibold tabular-nums", scoreColor(value))}>
          {value}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500"
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Skill Gap Row
// ──────────────────────────────────────────────

function GapRow({ gap }: { gap: SkillGap }) {
  const importanceTone =
    gap.importance === "critical"
      ? "border-red-200 bg-red-50 text-red-700"
      : gap.importance === "important"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      {/* Status icon */}
      <div className="mt-0.5 shrink-0">
        {gap.demonstrated ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : gap.present ? (
          <AlertCircle className="size-4 text-amber-500" />
        ) : (
          <XCircle className="size-4 text-red-400" />
        )}
      </div>

      {/* Skill info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{gap.skill}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium capitalize",
              importanceTone
            )}
          >
            {gap.importance}
          </span>
        </div>
        {gap.evidence && (
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{gap.evidence}</p>
        )}
        {!gap.present && gap.importance === "critical" && (
          <p className="mt-0.5 text-xs text-red-600">Missing — high priority to develop</p>
        )}
        {gap.present && !gap.demonstrated && (
          <p className="mt-0.5 text-xs text-amber-600">Mentioned but not demonstrated with evidence</p>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Grouped Gaps
// ──────────────────────────────────────────────

function GroupedGaps({ gaps }: { gaps: SkillGap[] }) {
  const critical = gaps.filter((g) => g.importance === "critical");
  const important = gaps.filter((g) => g.importance === "important");
  const niceToHave = gaps.filter((g) => g.importance === "nice-to-have");

  const present = gaps.filter((g) => g.present).length;
  const total = gaps.length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Target className="size-3.5" />
        <span>
          {present} of {total} requirements matched
          {present === total && " — all requirements covered"}
        </span>
      </div>

      {critical.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-red-700">
            Critical ({critical.filter((g) => g.present).length}/{critical.length})
          </p>
          <div className="space-y-1.5">
            {critical.map((gap) => (
              <GapRow key={gap.skill} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {important.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
            Important ({important.filter((g) => g.present).length}/{important.length})
          </p>
          <div className="space-y-1.5">
            {important.map((gap) => (
              <GapRow key={gap.skill} gap={gap} />
            ))}
          </div>
        </div>
      )}

      {niceToHave.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-600">
            Nice to Have ({niceToHave.filter((g) => g.present).length}/{niceToHave.length})
          </p>
          <div className="space-y-1.5">
            {niceToHave.map((gap) => (
              <GapRow key={gap.skill} gap={gap} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// String List with Icon
// ──────────────────────────────────────────────

function InsightList({
  items,
  icon: Icon,
  tone,
}: {
  items: string[];
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} />
          <span className="text-muted-foreground">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────
// Main Export
// ──────────────────────────────────────────────

export interface MatchResultsProps {
  score: MatchScore;
  skillGaps: SkillGap[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
}

export function MatchResultsPanel({
  score,
  skillGaps,
  strengths,
  weaknesses,
  recommendations,
}: MatchResultsProps) {
  return (
    <div className="space-y-4">
      {/* Overall Score Card */}
      <Card>
        <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:items-start">
          <ScoreRing score={score.overall} />

          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div>
              <p className={cn("text-lg font-bold", scoreColor(score.overall))}>
                {scoreLabel(score.overall)}
              </p>
              <p className="text-xs text-muted-foreground">
                Based on skills, experience, and education alignment
              </p>
            </div>

            <div className="space-y-2">
              <ScoreBar label="Skills Match" value={score.skillsMatch} />
              <ScoreBar label="Experience Match" value={score.experienceMatch} />
              <ScoreBar label="Education Match" value={score.educationMatch} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Skill Gaps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Skill Gap Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <GroupedGaps gaps={skillGaps} />
        </CardContent>
      </Card>

      {/* Strengths & Weaknesses */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50">
                <TrendingUp className="size-3.5 text-emerald-600" />
              </div>
              <CardTitle className="text-sm">Strengths</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {strengths.length > 0 ? (
              <InsightList items={strengths} icon={CheckCircle2} tone="text-emerald-500" />
            ) : (
              <p className="text-xs text-muted-foreground italic">No strengths identified</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-red-50">
                <TrendingDown className="size-3.5 text-red-600" />
              </div>
              <CardTitle className="text-sm">Areas to Improve</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {weaknesses.length > 0 ? (
              <InsightList items={weaknesses} icon={AlertCircle} tone="text-red-500" />
            ) : (
              <p className="text-xs text-muted-foreground italic">No major gaps found</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <Lightbulb className="size-3.5 text-primary" />
              </div>
              <CardTitle className="text-sm">Recommendations</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
