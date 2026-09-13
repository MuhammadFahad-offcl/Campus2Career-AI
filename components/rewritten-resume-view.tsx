"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileDown,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { CandidateProfile } from "@/types";
import type { UnresolvedSuggestion } from "@/lib/rewrite/apply-suggestions";
import { dedupedSkillNames } from "@/lib/rewrite/format-resume-text";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface RewrittenResumeViewProps {
  profile: CandidateProfile;
  jobTitle: string;
  jobCompany: string;
  appliedCount: number;
  unresolved: UnresolvedSuggestion[];
  onClose: () => void;
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function fileBaseName(profile: CandidateProfile, jobTitle: string): string {
  const base = [profile.fullName, jobTitle, "rewritten-resume"]
    .filter(Boolean)
    .map(slugify)
    .filter(Boolean)
    .join("-");
  return base || "rewritten-resume";
}

function formatDateRange(start: string, end: string): string {
  if (!start && !end) return "";
  if (!end) return start;
  if (!start) return end;
  return `${start} – ${end}`;
}

export function RewrittenResumeView({
  profile,
  jobTitle,
  jobCompany,
  appliedCount,
  unresolved,
  onClose,
}: RewrittenResumeViewProps) {
  const [downloading, setDownloading] = useState<"docx" | null>(null);
  const [downloadError, setDownloadError] = useState("");

  const skillNames = useMemo(() => dedupedSkillNames(profile), [profile]);
  const contact = [profile.email, profile.phone, profile.location]
    .filter(Boolean)
    .join(" · ");
  const links = [
    profile.links.linkedin,
    profile.links.github,
    profile.links.portfolio,
    ...profile.links.other,
  ].filter((l): l is string => Boolean(l));

  const handleDownloadTxt = async () => {
    const { formatProfileAsPlainText } = await import(
      "@/lib/rewrite/format-resume-text"
    );
    const blob = new Blob([formatProfileAsPlainText(profile)], {
      type: "text/plain;charset=utf-8",
    });
    downloadBlob(blob, `${fileBaseName(profile, jobTitle)}.txt`);
  };

  const handleDownloadDocx = async () => {
    setDownloading("docx");
    setDownloadError("");
    try {
      const { buildResumeDocument } = await import(
        "@/lib/rewrite/build-resume-docx"
      );
      const blob = await buildResumeDocument(profile);
      downloadBlob(blob, `${fileBaseName(profile, jobTitle)}.docx`);
    } catch (err) {
      console.error("[RewrittenResumeView] DOCX generation failed:", err);
      setDownloadError(
        "Could not generate the Word document. Please try the text download instead."
      );
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/[0.02] animate-in fade-in slide-in-from-bottom-2 duration-500">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-3.5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Your Rewritten Resume
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Tailored for {jobTitle || "this role"}
              {jobCompany && ` at ${jobCompany}`} · {appliedCount} suggestion
              {appliedCount !== 1 ? "s" : ""} applied
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Downloads */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadDocx}
            disabled={downloading === "docx"}
            className={cn(buttonVariants({ size: "sm" }), "text-xs")}
          >
            {downloading === "docx" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
            Download as Word (.docx)
          </button>
          <button
            onClick={handleDownloadTxt}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "text-xs"
            )}
          >
            <Download className="size-3.5" />
            Download as Text (.txt)
          </button>
        </div>

        {downloadError && (
          <p className="text-xs text-destructive">{downloadError}</p>
        )}

        {/* Unresolved suggestions */}
        {unresolved.length > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            <div className="text-xs text-amber-800">
              <p className="font-medium">
                {unresolved.length} suggestion{unresolved.length !== 1 ? "s" : ""}{" "}
                couldn&apos;t be placed automatically
              </p>
              <ul className="mt-1 space-y-0.5 text-amber-700/90">
                {unresolved.map((u) => (
                  <li key={u.id}>
                    <span className="font-medium capitalize">{u.section}</span>
                    : {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Formatted preview */}
        <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-border bg-background p-4 sm:p-6">
          <div className="text-center">
            <p className="text-base font-semibold text-foreground">
              {profile.fullName || "Your Name"}
            </p>
            {contact && (
              <p className="mt-0.5 text-xs text-muted-foreground">{contact}</p>
            )}
            {links.length > 0 && (
              <p className="mt-0.5 text-xs text-primary">{links.join(" · ")}</p>
            )}
          </div>

          {profile.summary && (
            <section className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Summary
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-foreground">
                {profile.summary}
              </p>
            </section>
          )}

          {profile.experience.length > 0 && (
            <section className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Experience
              </h4>
              <div className="mt-1.5 space-y-3">
                {profile.experience.map((exp, i) => {
                  const dateRange = formatDateRange(exp.startDate, exp.endDate);
                  return (
                    <div key={i}>
                      <p className="text-sm font-medium text-foreground">
                        {[exp.role, exp.company].filter(Boolean).join(" — ")}
                        {dateRange && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            ({dateRange})
                          </span>
                        )}
                      </p>
                      {exp.description && (
                        <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">
                          {exp.description}
                        </p>
                      )}
                      {exp.highlights.length > 0 && (
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-foreground/90">
                          {exp.highlights.map((h, j) => (
                            <li key={j}>{h}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {profile.projects.length > 0 && (
            <section className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Projects
              </h4>
              <div className="mt-1.5 space-y-3">
                {profile.projects.map((proj, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium text-foreground">{proj.name}</p>
                    {proj.description && (
                      <p className="mt-0.5 text-sm leading-relaxed text-foreground/90">
                        {proj.description}
                      </p>
                    )}
                    {proj.highlights.length > 0 && (
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-foreground/90">
                        {proj.highlights.map((h, j) => (
                          <li key={j}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {profile.education.length > 0 && (
            <section className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Education
              </h4>
              <div className="mt-1.5 space-y-2">
                {profile.education.map((edu, i) => {
                  const dateRange = formatDateRange(edu.startDate, edu.endDate);
                  const degreeField = [edu.degree, edu.field].filter(Boolean).join(" in ");
                  return (
                    <div key={i}>
                      <p className="text-sm font-medium text-foreground">
                        {[degreeField, edu.institution].filter(Boolean).join(" — ")}
                        {dateRange && (
                          <span className="ml-1.5 font-normal text-muted-foreground">
                            ({dateRange})
                          </span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {skillNames.length > 0 && (
            <section className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Skills
              </h4>
              <p className="mt-1 text-sm text-foreground/90">{skillNames.join(", ")}</p>
            </section>
          )}

          {profile.certifications.length > 0 && (
            <section className="mt-4">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Certifications
              </h4>
              <ul className="mt-1 space-y-0.5 text-sm text-foreground/90">
                {profile.certifications.map((cert, i) => (
                  <li key={i}>
                    {[cert.name, cert.issuer].filter(Boolean).join(" — ")}
                    {cert.date && ` (${cert.date})`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          Only your accepted and edited suggestions were applied. Rejected and
          still-pending suggestions were left as originally written.
        </p>
      </CardContent>
    </Card>
  );
}
