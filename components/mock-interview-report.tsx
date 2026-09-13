"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  RotateCcw,
  Sparkles,
  Target,
} from "lucide-react";
import type { InterviewSession } from "@/types";
import { correlationSentence } from "@/lib/interview/session-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MatchScoreGauge } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getCategoryBarColor(score: number): string {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-400";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

function getReadinessLabel(score: number): string {
  if (score >= 85) return "Strong Interview Performance";
  if (score >= 70) return "Solid Interview Performance";
  if (score >= 50) return "Developing Interview Performance";
  return "Needs Focused Practice";
}

const BREAKDOWN_LABELS: { key: keyof NonNullable<InterviewSession["scoreBreakdown"]>; label: string }[] = [
  { key: "technical", label: "Technical Knowledge" },
  { key: "communication", label: "Communication" },
  { key: "relevance", label: "Relevance" },
  { key: "problemSolving", label: "Problem Solving" },
  { key: "behavioral", label: "Behavioral Responses" },
];

interface MockInterviewReportProps {
  session: InterviewSession;
  jobTitle: string;
  jobCompany: string;
  onRetake: () => void;
}

export function MockInterviewReport({ session, jobTitle, jobCompany, onRetake }: MockInterviewReportProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const overall = session.overallScore ?? 0;
  const breakdown = session.scoreBreakdown;

  return (
    <div className="space-y-4">
      {/* Score header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <MatchScoreGauge score={overall} size="lg" label="Interview Readiness" />
            <div className="flex-1 text-center sm:text-left min-w-0">
              <CardTitle className="text-base">
                {jobTitle}
                {jobCompany && <span className="text-muted-foreground"> · {jobCompany}</span>}
              </CardTitle>
              <p className={cn("text-sm font-semibold mt-0.5", getScoreColor(overall))}>
                {overall}/100 — {getReadinessLabel(overall)}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {session.interviewType}
                </Badge>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {session.difficulty}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {session.questionCount} questions
                </Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        {breakdown && (
          <CardContent className="space-y-3">
            {BREAKDOWN_LABELS.map(({ key, label }) => (
              <div key={key}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="text-muted-foreground">{breakdown[key]}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all duration-700 ease-out", getCategoryBarColor(breakdown[key]))}
                    style={{ width: `${breakdown[key]}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* Skill gap correlation — deterministic, never AI-authored */}
      {session.relatedSkillGaps.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50">
                <Target className="size-4 text-amber-600" />
              </div>
              <CardTitle className="text-sm">Skill Gaps Reflected in Your Answers</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {session.relatedSkillGaps.map((skill) => (
              <div key={skill} className="flex items-start gap-2.5">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                <p className="text-xs text-foreground">{correlationSentence(skill)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Strengths */}
      {session.strengths.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                <CheckCircle2 className="size-4 text-emerald-600" />
              </div>
              <CardTitle className="text-sm">Strengths</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {session.strengths.map((item, i) => (
              <div key={`${item}-${i}`} className="flex items-start gap-2.5">
                <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                <p className="text-xs text-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Areas to improve */}
      {session.improvements.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50">
                <AlertTriangle className="size-4 text-amber-600" />
              </div>
              <CardTitle className="text-sm">Areas to Improve</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {session.improvements.map((item, i) => (
              <div key={`${item}-${i}`} className="flex items-start gap-2.5">
                <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-500" />
                <p className="text-xs text-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recommended practice */}
      {session.recommendedPractice.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-4 text-primary" />
              </div>
              <CardTitle className="text-sm">Recommended Practice</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {session.recommendedPractice.map((item, i) => (
              <div key={`${item}-${i}`} className="flex items-start gap-2.5">
                <Sparkles className="size-3.5 shrink-0 mt-0.5 text-primary/70" />
                <p className="text-xs text-foreground">{item}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Transcript toggle */}
      <button
        type="button"
        onClick={() => setShowTranscript((v) => !v)}
        className={cn(buttonVariants({ size: "sm", variant: "outline" }), "w-full")}
      >
        <ClipboardList className="size-3.5" />
        {showTranscript ? "Hide Full Transcript" : "Review Full Transcript"}
        {showTranscript ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
      </button>

      {showTranscript && (
        <Card>
          <CardContent className="space-y-4 py-4">
            {session.questions.map((q) => (
              <div key={q.number} className="space-y-1.5 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {q.category.replace("_", " ")}
                  </Badge>
                  {q.isFollowUp && (
                    <Badge variant="secondary" className="text-[10px]">
                      Follow-up
                    </Badge>
                  )}
                </div>
                <p className="text-xs font-medium text-foreground">{q.question}</p>
                {q.answer && <p className="text-xs text-muted-foreground leading-relaxed">{q.answer}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end">
        <button onClick={onRetake} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}>
          <RotateCcw className="size-3" />
          Practice Again
        </button>
      </div>
    </div>
  );
}
