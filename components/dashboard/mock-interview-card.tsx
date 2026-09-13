import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardInterview } from "@/types";

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-500";
}

/**
 * Row 4 — the most recent Mock Interview attempt, if any. Rendered from
 * the latest persisted interview_sessions row only; the dashboard never
 * runs or scores an interview itself.
 */
export function MockInterviewCard({ interview }: { interview: DashboardInterview | null }) {
  if (!interview || interview.status !== "completed") {
    return (
      <SectionCard title="Mock Interview" description="Practice a realistic interview for your target role">
        <EmptyState
          icon={MessagesSquare}
          title="No practice interview yet"
          description="Turn your match analysis and skill gaps into a personalized mock interview with follow-up questions."
          action={{ label: "Start Mock Interview", href: "/mock-interview" }}
          className="py-10"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Mock Interview"
      description="Your most recent practice session"
      action={
        <Link href="/mock-interview" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}>
          Practice Again
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Last Interview: {interview.jobTitle}</span>
          {interview.overallScore !== null && (
            <span className={cn("text-sm font-semibold", getScoreColor(interview.overallScore))}>
              {interview.overallScore}/100
            </span>
          )}
        </div>
        {interview.topRecommendation && (
          <p className="flex items-start gap-1.5 rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
            <MessagesSquare className="mt-0.5 size-3 shrink-0 text-primary/70" />
            <span>
              <span className="font-medium text-foreground">Practice Recommendation: </span>
              {interview.topRecommendation}
            </span>
          </p>
        )}
      </div>
    </SectionCard>
  );
}
