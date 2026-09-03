import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { ResumeUploader } from "@/components/resume-uploader";
import { ResumeAnalysisPanel } from "@/components/resume-analysis-panel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  User,
  GraduationCap,
  Code,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Resume Analyzer",
};

export default function AnalysisPage() {
  return (
    <>
      <PageHeader
        title="Resume Analyzer"
        description="Upload your resume for AI-powered analysis"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
          {/* Upload Section */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-1">
              Upload Resume
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              We&apos;ll extract and analyze your skills, experience, and
              qualifications
            </p>
            <ResumeUploader />
          </section>

          <ResumeAnalysisPanel />

          {/* What You'll Get */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
                    <User className="size-4 text-primary" />
                  </div>
                  <CardTitle className="text-sm">Profile Extraction</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Full name, contact info, and summary
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Education history with GPA
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Work experience with highlights
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-accent/10">
                    <Code className="size-4 text-accent" />
                  </div>
                  <CardTitle className="text-sm">Evidence-Aware Skills</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Skills categorized as mentioned vs. demonstrated
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Supporting evidence for each skill claim
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Confidence levels for AI assessments
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50">
                    <Sparkles className="size-4 text-emerald-600" />
                  </div>
                  <CardTitle className="text-sm">Analysis Insights</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    3–5 key strengths identified
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Areas needing improvement
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    5–8 actionable recommendations
                  </li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50">
                    <AlertTriangle className="size-4 text-amber-600" />
                  </div>
                  <CardTitle className="text-sm">Issue Detection</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Formatting and structure problems
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    Missing sections or gaps
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-emerald-500" />
                    ATS compatibility checks
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Format requirements note */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
            <GraduationCap className="size-4 shrink-0 text-primary/60" />
            <span>
              Supports PDF and DOCX files up to 5 MB. For best results, use a
              clean, single-column resume format.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
