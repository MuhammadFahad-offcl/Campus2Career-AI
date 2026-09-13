import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout";
import {
  DashboardHeader,
  DashboardMetrics,
  MatchOverviewCard,
  SkillGapsCard,
  SkillBridgeCard,
  MockInterviewCard,
  RewriteCard,
  NextActionCard,
  RecentAnalysesCard,
} from "@/components/dashboard";
import { EmptyState } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, FileSearch, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDashboardSummary } from "@/app/actions/dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

// The dashboard always reflects the latest persisted state.
export const dynamic = "force-dynamic";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/50">
      {children}
    </p>
  );
}

/** Welcome state for a brand-new visitor — truthful, no fake metrics. */
function WelcomeState() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Welcome to Campus2Career 👋
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload your resume to build your candidate profile — then match jobs,
          close skill gaps, and optimize your resume. No sign-up needed.
        </p>
      </div>

      <EmptyState
        icon={FileSearch}
        title="No resume yet"
        description="Upload your resume to build your candidate profile. Everything else — job matching, skill bridge, rewrite — builds on it."
        action={{ label: "Upload Resume", href: "/analysis" }}
      />

      <div className="stagger-children grid gap-4 lg:grid-cols-2">
        <Card className="card-interactive animate-in fade-in slide-in-from-bottom-2 duration-500 hover:border-primary/20">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-sm">
              <Target className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Job Matcher</p>
              <p className="text-xs text-muted-foreground">
                Compare your profile against job descriptions
              </p>
            </div>
            <Link
              href="/job-matcher"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 text-xs")}
            >
              Open
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
        <Card className="card-interactive animate-in fade-in slide-in-from-bottom-2 duration-500 hover:border-primary/20">
          <CardContent className="flex items-center gap-4 py-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 shadow-sm">
              <Sparkles className="size-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Skill Bridge</p>
              <p className="text-xs text-muted-foreground">
                A 7-day plan to close your skill gaps with real evidence
              </p>
            </div>
            <Link
              href="/skill-bridge"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "shrink-0 text-xs")}
            >
              Open
              <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const result = await getDashboardSummary();

  return (
    <>
      <PageHeader description="Your AI career intelligence overview" />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-4 sm:px-6 sm:py-6">
          {result.status === "error" ? (
            <EmptyState
              icon={Target}
              title="Dashboard unavailable"
              description={
                result.error +
                " Your data is safe — refreshing usually resolves this."
              }
            />
          ) : !result.summary.hasResume ? (
            <WelcomeState />
          ) : (
            <>
              {/* ─── Where am I? ─── */}
              <DashboardHeader summary={result.summary} />

              <DashboardMetrics summary={result.summary} />

              {/* ─── What is missing? ─── */}
              <section>
                <SectionLabel>Match &amp; Gaps</SectionLabel>
                <div className="stagger-children grid gap-4 lg:grid-cols-2">
                  <MatchOverviewCard
                    match={result.summary.match}
                    analyzedAt={result.summary.targetRole?.analyzedAt ?? null}
                  />
                  <SkillGapsCard skills={result.summary.skills} />
                </div>
              </section>

              {/* ─── What should I do next? ─── */}
              <section>
                <SectionLabel>Plan &amp; Optimize</SectionLabel>
                <div className="stagger-children grid gap-4 lg:grid-cols-2">
                  <SkillBridgeCard bridge={result.summary.skillBridge} />
                  <RewriteCard rewrite={result.summary.rewrite} />
                </div>
              </section>

              {/* ─── Practice ─── */}
              <section>
                <SectionLabel>Practice</SectionLabel>
                <MockInterviewCard interview={result.summary.interview} />
              </section>

              <NextActionCard action={result.summary.nextAction} />

              {/* ─── History ─── */}
              <section>
                <SectionLabel>History</SectionLabel>
                <RecentAnalysesCard analyses={result.summary.recentAnalyses} />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
