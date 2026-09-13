import Link from "next/link";
import {
  FileSearch,
  Target,
  FileText,
  Sparkles,
  ArrowRight,
  Zap,
  CheckCircle2,
  ChevronRight,
  Upload,
  ScanLine,
  BarChart3,
  MessagesSquare,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Static preview data (visual demonstration only) ───
const PREVIEW_SKILLS_MATCHED = ["TypeScript", "React", "Node.js", "SQL", "Git"];
const PREVIEW_SKILLS_PARTIAL = ["AWS", "Docker"];
const PREVIEW_SKILLS_MISSING = ["Kubernetes", "GraphQL", "CI/CD"];
const PREVIEW_SCORE = 72;

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload Your Resume",
    description: "Drop your PDF or DOCX resume. Our AI extracts and structures every skill, experience, and qualification.",
  },
  {
    number: "02",
    icon: ScanLine,
    title: "Get AI Analysis",
    description: "Receive a structured profile with evidence-aware skills — see what you mention versus what you demonstrate.",
  },
  {
    number: "03",
    icon: BarChart3,
    title: "Bridge the Gap",
    description: "Match against target jobs, identify skill gaps, and get a personalized 7-day plan to become job-ready.",
  },
] as const;

const features = [
  {
    icon: FileSearch,
    title: "Resume Analyzer",
    description: "AI-powered extraction of skills, experience, and qualifications with evidence-aware scoring.",
    active: true,
  },
  {
    icon: Target,
    title: "Job Match + Skill Gap",
    description: "Compare your profile against real job descriptions. See matched, partial, and missing skills at a glance.",
    active: true,
  },
  {
    icon: FileText,
    title: "Job-specific Rewrite",
    description: "Generate tailored resume versions optimized for specific roles and ATS compatibility.",
    active: true,
  },
  {
    icon: Sparkles,
    title: "7-Day Skill Bridge",
    description: "Personalized daily learning plans to close your most critical skill gaps in one week.",
    active: true,
  },
  {
    icon: MessagesSquare,
    title: "AI Mock Interviewer",
    description: "A conversational practice interview grounded in your resume and target role, with a readiness score and follow-up questions.",
    active: true,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg gradient-primary shadow-glow-primary">
              <Zap className="size-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight">Campus2Career AI</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#how-it-works" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">How It Works</a>
            <a href="#features" className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">Features</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-[13px]")}>
              Sign In
            </Link>
            <Link href="/analysis" className={cn(buttonVariants({ size: "sm" }), "text-[13px]")}>
              Get Started Free
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Gradient mesh background — decorative only, canvas stays white */}
        <div className="mesh-blob -top-24 left-1/4 size-72 bg-primary/25" aria-hidden="true" />
        <div className="mesh-blob top-10 right-1/4 size-80 bg-accent/20" aria-hidden="true" />
        <div className="mesh-blob top-40 left-1/2 size-64 -translate-x-1/2 bg-primary/10" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-20 lg:pb-24 lg:pt-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-5 text-[11px] font-medium px-3 shadow-sm ring-1 ring-primary/10">
              AI Career Intelligence for Students & Graduates
            </Badge>
            <h1 className="mb-5 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
              Know exactly what stands{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                between you
              </span>{" "}
              and your next role
            </h1>
            <p className="mb-8 text-base leading-relaxed text-muted-foreground sm:text-lg max-w-2xl mx-auto">
              Campus2Career AI analyzes your resume against real job requirements,
              identifies your skill gaps, and gives you a clear path to becoming
              job-ready — in days, not months.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/analysis"
                className={cn(buttonVariants({ size: "lg" }), "text-sm px-6 h-11")}
              >
                Analyze Your Resume
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/analysis"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "text-sm px-6 h-11")}
              >
                Try the Analyzer
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Product Preview */}
      <section className="border-y border-border bg-muted/30 px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="mb-8 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            See it in action
          </p>
          <div className="relative rounded-2xl bg-gradient-to-b from-primary/15 via-accent/10 to-transparent p-px shadow-elevated">
            <div className="rounded-[calc(1rem-1px)] bg-white p-6 lg:p-8">
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              {/* Left: Match Score */}
              <div className="flex flex-col items-center justify-center rounded-xl bg-muted/50 p-6">
                <div className="relative flex size-32 items-center justify-center">
                  <svg width="128" height="128" viewBox="0 0 128 128" className="-rotate-90">
                    <circle cx="64" cy="64" r="54" fill="none" strokeWidth="8" className="stroke-muted" />
                    <circle
                      cx="64" cy="64" r="54" fill="none" strokeWidth="8"
                      strokeDasharray={2 * Math.PI * 54}
                      strokeDashoffset={2 * Math.PI * 54 * (1 - PREVIEW_SCORE / 100)}
                      strokeLinecap="round"
                      className="stroke-primary transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-bold text-foreground">{PREVIEW_SCORE}</span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Match</span>
                  </div>
                </div>
                <p className="mt-3 text-sm font-semibold text-foreground">Frontend Developer</p>
                <p className="text-xs text-muted-foreground">at TechCorp Inc.</p>
              </div>

              {/* Right: Skills breakdown */}
              <div className="space-y-5">
                <div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <h3 className="text-sm font-semibold text-foreground">Matched Skills</h3>
                    <Badge variant="secondary" className="ml-auto text-[10px]">{PREVIEW_SKILLS_MATCHED.length} found</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PREVIEW_SKILLS_MATCHED.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="size-3" />
                        {s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <div className="size-4 flex items-center justify-center text-amber-500">
                      <span className="text-xs font-bold">~</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Partial Skills</h3>
                    <Badge variant="secondary" className="ml-auto text-[10px]">{PREVIEW_SKILLS_PARTIAL.length} found</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PREVIEW_SKILLS_PARTIAL.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700">
                        ~{s}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2.5 flex items-center gap-2">
                    <div className="size-4 flex items-center justify-center text-red-500">
                      <span className="text-xs font-bold">&times;</span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Missing Skills</h3>
                    <Badge variant="secondary" className="ml-auto text-[10px]">{PREVIEW_SKILLS_MISSING.length} gaps</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PREVIEW_SKILLS_MISSING.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700">
                        &times; {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
              From resume to job-ready in three steps
            </h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              No guesswork. No generic advice. Just clear, actionable intelligence tailored to your target role.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div key={step.number} className="relative">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/10 shadow-sm">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground/40 tracking-wider">{step.number}</span>
                  </div>
                  <h3 className="mb-2 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-muted/20 px-6 py-16 lg:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Five capabilities, one platform
            </h2>
            <p className="text-sm text-muted-foreground">
              Everything you need to go from student to hired, powered by AI.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title} interactive className={cn(
                  !feature.active && "opacity-70"
                )}>
                  <CardHeader>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 shadow-sm">
                        <Icon className="size-4.5 text-primary" />
                      </div>
                      <CardTitle className="text-[15px]">{feature.title}</CardTitle>
                      {!feature.active && (
                        <Badge variant="outline" className="ml-auto text-[10px] font-normal">Coming Soon</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <CardDescription className="text-sm leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="px-6 py-16 lg:py-20">
        <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary/8 via-accent/5 to-transparent px-6 py-14 text-center ring-1 ring-primary/10 sm:px-12">
          <div className="mesh-blob -top-16 right-0 size-56 bg-accent/20" aria-hidden="true" />
          <div className="mesh-blob -bottom-16 left-0 size-56 bg-primary/15" aria-hidden="true" />
          <div className="relative">
            <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to understand your career gap?
            </h2>
            <p className="mb-8 text-sm text-muted-foreground">
              Upload your resume and get your first analysis in under 60 seconds.
            </p>
            <Link
              href="/analysis"
              className={cn(buttonVariants({ size: "lg" }), "text-sm px-8 h-11")}
            >
              Get Started Free
              <ChevronRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-6">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-5 items-center justify-center rounded-md gradient-primary">
              <Zap className="size-2.5 text-primary-foreground" />
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              &copy; 2026 Campus2Career AI
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground/60">MVP v0.1 &middot; Built for students</p>
        </div>
      </footer>
    </div>
  );
}
