"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { formatShortDate } from "@/lib/dashboard/summary-utils";
import { deleteResumeAction, type ResumeListItem } from "@/app/actions/manage-resume";

const STATUS_TONE: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-amber-200 bg-amber-50 text-amber-700",
  analyzing: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  uploaded: "border-border bg-muted text-muted-foreground",
  not_started: "border-border bg-muted text-muted-foreground",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.uploaded;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize",
        tone
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function ResumeList({ resumes }: { resumes: ResumeListItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(resumes);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = useCallback(
    async (resumeId: string) => {
      if (pendingId) return;
      setPendingId(resumeId);
      setError(null);

      try {
        const result = await deleteResumeAction(resumeId);
        if (result.status === "success") {
          setItems((prev) => prev.filter((item) => item.id !== resumeId));
          router.refresh();
        } else {
          setError(result.error);
        }
      } catch {
        setError("Failed to delete resume. Please try again.");
      } finally {
        setPendingId(null);
        setConfirmingId(null);
      }
    },
    [pendingId, router]
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {items.map((resume) => (
          <div key={resume.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <FileText className="size-4 text-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {resume.fileName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {resume.fileType.toUpperCase()} &middot; {formatFileSize(resume.fileSize)} &middot;{" "}
                {formatShortDate(resume.createdAt)}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge status={resume.extractionStatus} />
              {resume.analysisStatus && resume.analysisStatus !== "not_started" && (
                <StatusBadge status={resume.analysisStatus} />
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <Link
                href={`/analysis?resume=${resume.id}`}
                className={cn(buttonVariants({ size: "xs", variant: "outline" }))}
              >
                Open
              </Link>

              {confirmingId === resume.id ? (
                <>
                  <button
                    onClick={() => handleDelete(resume.id)}
                    disabled={pendingId === resume.id}
                    className={cn(buttonVariants({ size: "xs", variant: "destructive" }))}
                  >
                    {pendingId === resume.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                  <button
                    onClick={() => setConfirmingId(null)}
                    disabled={pendingId === resume.id}
                    className={cn(buttonVariants({ size: "xs", variant: "ghost" }))}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmingId(resume.id)}
                  aria-label={`Delete ${resume.fileName}`}
                  className={cn(buttonVariants({ size: "icon-xs", variant: "ghost" }), "text-muted-foreground hover:text-destructive")}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
