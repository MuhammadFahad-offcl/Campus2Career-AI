"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  User,
} from "lucide-react";
import { analyzeResume, type AnalyzeResumeResult } from "@/app/actions/analyze-resume";
import type { CandidateProfile, Skill } from "@/types";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

function skillTone(skill: Skill): string {
  if (skill.isDemonstrated) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (skill.supportLevel === "weak_evidence") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function SkillList({ skills }: { skills: Skill[] }) {
  if (skills.length === 0) {
    return <p className="text-xs text-muted-foreground">No skills detected.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {skills.map((skill) => (
        <span
          key={`${skill.name}-${skill.supportLevel}`}
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
            skillTone(skill)
          )}
          title={skill.supportLevel.replace("_", " ")}
        >
          {skill.name}
        </span>
      ))}
    </div>
  );
}

function CandidateProfileResults({ profile }: { profile: CandidateProfile }) {
  const demonstratedSkills = profile.skills.filter((skill) => skill.isDemonstrated);
  const mentionedOnlySkills = profile.skills.filter(
    (skill) => skill.isMentioned && !skill.isDemonstrated
  );
  const weakSkills = profile.skills.filter(
    (skill) => skill.supportLevel === "weak_evidence"
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <User className="size-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-sm">Candidate Overview</CardTitle>
              <CardDescription>
                Structured profile generated from the uploaded resume
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </p>
            <p className="text-sm font-semibold text-foreground">
              {profile.fullName || "Not found in resume"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Email
            </p>
            <p className="text-sm font-semibold text-foreground">
              {profile.email || "Not found in resume"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Location
            </p>
            <p className="text-sm font-semibold text-foreground">
              {profile.location || "Not found in resume"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Education
            </p>
            <p className="text-sm font-semibold text-foreground">
              {profile.education[0]?.institution || "Not found in resume"}
            </p>
          </div>
          {profile.summary && (
            <div className="md:col-span-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{profile.summary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Skills Evidence</CardTitle>
          <CardDescription>
            Skills are separated by evidence strength; listed skills are not treated as proof.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-200 text-emerald-700">
                Demonstrated
              </Badge>
              <span className="text-xs text-muted-foreground">
                Supported by project, work, coursework, certification, or achievement evidence
              </span>
            </div>
            <SkillList skills={demonstratedSkills} />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="border-amber-200 text-amber-700">
                Weak evidence
              </Badge>
              <span className="text-xs text-muted-foreground">
                Some context exists, but evidence is not strong
              </span>
            </div>
            <SkillList skills={weakSkills} />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline">Mentioned only</Badge>
              <span className="text-xs text-muted-foreground">
                Listed without concrete evidence
              </span>
            </div>
            <SkillList skills={mentionedOnlySkills} />
          </div>
        </CardContent>
      </Card>

      {profile.projects.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-accent/10">
                <Sparkles className="size-4 text-accent" />
              </div>
              <CardTitle className="text-sm">Projects</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.projects.map((project) => (
              <div key={project.name} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">
                  {project.name || "Untitled project"}
                </p>
                {project.description && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {project.description}
                  </p>
                )}
                {project.technologies.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {project.technologies.map((tech) => (
                      <Badge key={tech} variant="outline">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {profile.experience.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                <Briefcase className="size-4 text-primary" />
              </div>
              <CardTitle className="text-sm">Experience</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.experience.map((item) => (
              <div key={`${item.company}-${item.role}`} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">
                  {item.role || "Role not specified"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.company || "Organization not specified"} · {item.startDate || ""}
                  {item.endDate ? ` – ${item.endDate}` : ""}
                </p>
                {item.description && (
                  <p className="mt-2 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {profile.education.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                <GraduationCap className="size-4 text-emerald-600" />
              </div>
              <CardTitle className="text-sm">Education & Coursework</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.education.map((item) => (
              <div key={`${item.institution}-${item.degree}`} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">
                  {item.degree || "Degree not specified"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.institution || "Institution not specified"}
                  {item.field ? ` · ${item.field}` : ""}
                </p>
                {item.coursework.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Coursework: {item.coursework.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(profile.certifications.length > 0 || profile.achievements.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Certifications & Achievements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.certifications.map((item) => (
              <div key={`${item.name}-${item.issuer}`} className="text-sm">
                <span className="font-medium text-foreground">{item.name}</span>
                <span className="text-muted-foreground"> · {item.issuer}</span>
              </div>
            ))}
            {profile.achievements.map((item) => (
              <div key={item.title} className="text-sm">
                <span className="font-medium text-foreground">{item.title}</span>
                {item.description && (
                  <span className="text-muted-foreground"> · {item.description}</span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {profile.potentialIssues.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50">
                <ShieldAlert className="size-4 text-amber-600" />
              </div>
              <CardTitle className="text-sm">Potential Issues</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.potentialIssues.map((issue, index) => (
              <div key={`${issue.message}-${index}`} className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">{issue.message}</p>
                {issue.relatedSkill && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Related skill: {issue.relatedSkill}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ResumeAnalysisPanel() {
  const searchParams = useSearchParams();
  const resumeId = searchParams.get("resume");
  const [result, setResult] = useState<AnalyzeResumeResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  // StrictMode remounts fire the mount effect twice; without this guard the
  // analysis action (and its OpenAI call) would run twice per resume.
  const startedAnalysisRef = useRef<string | null>(null);
  // Synchronous double-submit guard for the Re-analyze button — a rapid
  // second click must not trigger a second AI analysis.
  const analysisInFlightRef = useRef(false);

  const runAnalysis = useCallback(
    async (force = false) => {
      if (!resumeId) return;
      if (analysisInFlightRef.current) return;
      analysisInFlightRef.current = true;

      setIsAnalyzing(true);
      setResult(null);

      try {
        const response = await analyzeResume(resumeId, { force });
        setResult(response);
      } catch {
        setResult({
          status: "error",
          code: "UNKNOWN",
          error: "An unexpected error occurred while analyzing the resume.",
        });
      } finally {
        analysisInFlightRef.current = false;
        setIsAnalyzing(false);
      }
    },
    [resumeId]
  );

  useEffect(() => {
    if (!resumeId) return;

    // Skip the duplicate StrictMode remount for the same resume. The guard
    // must live on the ref alone: a timer scheduled here would be cleared by
    // the StrictMode cleanup before firing, so the analysis would never run
    // after a full page load (refresh).
    if (startedAnalysisRef.current === resumeId) return;
    startedAnalysisRef.current = resumeId;

    void runAnalysis(false);
  }, [resumeId, runAnalysis]);

  const cachedLabel = useMemo(() => {
    if (!result || result.status !== "success" || !result.cached) return null;
    return "Using previously analyzed profile";
  }, [result]);

  if (!resumeId) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Analysis Results</h2>
          <p className="text-xs text-muted-foreground">
            Evidence-aware CandidateProfile generated from the processed resume
          </p>
        </div>
        {result?.status === "success" && (
          <button
            type="button"
            onClick={() => runAnalysis(true)}
            className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            Re-analyze
          </button>
        )}
      </div>

      {isAnalyzing && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-8 py-12">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Analyzing resume...</p>
          <p className="mt-1 max-w-md text-center text-xs text-muted-foreground">
            Creating an evidence-aware candidate profile. Skills are checked against projects,
            education, coursework, certifications, and experience.
          </p>
        </div>
      )}

      {!isAnalyzing && result?.status === "error" && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Analysis failed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{result.error}</p>
          </div>
        </div>
      )}

      {!isAnalyzing && result?.status === "success" && (
        <>
          {cachedLabel && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              {cachedLabel}
            </div>
          )}
          {result.ownerType === "anonymous" && (
            <div className="flex flex-col gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Want to save this analysis?</p>
                <p className="text-xs text-muted-foreground">
                  Create a free account later to keep your results. This is optional.
                </p>
              </div>
              <Link
                href="/register"
                className={cn(buttonVariants({ size: "sm", variant: "outline" }), "shrink-0")}
              >
                Save My Analysis
              </Link>
            </div>
          )}
          <CandidateProfileResults profile={result.profile} />
        </>
      )}
    </section>
  );
}
