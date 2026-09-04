"use client";

import { useState, useCallback, useRef } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { UploadZone } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import {
  uploadAndProcessResume,
  type UploadResult,
} from "@/app/actions/upload-resume";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

type Stage = "idle" | "uploading" | "processing" | "completed" | "error";

interface ResumeUploaderProps {
  className?: string;
}

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────

export function ResumeUploader({ className }: ResumeUploaderProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = useCallback((file: File) => {
    setSelectedFile(file);
    setStage("idle");
    setResult(null);
    setError(null);
  }, []);

  // Synchronous double-submit guard: a rapid second click must not start a
  // second upload (which would create a duplicate resume row + AI analysis).
  const uploadInFlightRef = useRef(false);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;

    setStage("uploading");
    setError(null);
    setResult(null);

    try {
      // Brief visual state for "uploading" before the server action starts
      setStage("processing");

      const res = await uploadAndProcessResume(selectedFile);

      if (res.status === "success") {
        setResult(res);
        setStage("completed");
      } else {
        setError(res.error);
        setStage("error");
      }
    } catch {
      setError(
        "An unexpected error occurred. Please check your connection and try again."
      );
      setStage("error");
    } finally {
      uploadInFlightRef.current = false;
    }
  }, [selectedFile]);

  const handleReset = useCallback(() => {
    setStage("idle");
    setSelectedFile(null);
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className={cn("space-y-4", className)}>
      {/* ── Idle / File Selected State ──────────────── */}
      {(stage === "idle" || stage === "error") && (
        <>
          <UploadZone
            accept=".pdf,.docx"
            maxSizeMB={5}
            onFileSelect={handleFileSelect}
          />

          {error && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
              <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive">
                  Processing failed
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {selectedFile && (
            <button
              onClick={handleUpload}
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full"
              )}
            >
              <Upload className="size-4 mr-2" />
              Upload & Process Resume
            </button>
          )}
        </>
      )}

      {/* ── Processing State ────────────────────────── */}
      {(stage === "uploading" || stage === "processing") && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card px-4 py-8 sm:px-8 sm:py-12">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 mb-4">
            <Loader2 className="size-6 text-primary animate-spin" />
          </div>

          <p className="text-sm font-semibold text-foreground mb-1">
            {stage === "uploading"
              ? "Uploading your resume..."
              : "Extracting and processing text..."}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {selectedFile?.name}
          </p>

          <p className="text-[11px] text-muted-foreground mt-2">
            {stage === "uploading"
              ? "Storing file securely..."
              : "Reading document content..."}
          </p>
        </div>
      )}

      {/* ── Completed State ─────────────────────────── */}
      {stage === "completed" && result && result.status === "success" && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <CheckCircle2 className="size-5 shrink-0 text-emerald-600 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-emerald-900">
                Resume processed successfully
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {result.fileName} &middot; {result.pageCount} page
                {result.pageCount !== 1 ? "s" : ""} &middot;{" "}
                {result.fileType.toUpperCase()}
              </p>
            </div>
          </div>

          {/* Extracted text preview */}
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Extracted Text Preview
            </p>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap text-xs text-foreground font-sans leading-relaxed">
              {result.extractedText.slice(0, 1500)}
              {result.extractedText.length > 1500 && (
                <span className="text-muted-foreground">
                  {"\n\n"}... ({result.extractedText.length.toLocaleString()}{" "}
                  characters total)
                </span>
              )}
            </pre>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Link
              href="/dashboard"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "flex-1"
              )}
            >
              Back to Dashboard
            </Link>
            <Link
              href={`/analysis?resume=${result.resumeId}`}
              className={cn(buttonVariants({ size: "lg" }), "flex-1")}
            >
              Analyze Resume
              <ArrowRight className="size-4 ml-2" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Error State ─────────────────────────────── */}
      {stage === "error" && error && (
        <button
          onClick={handleReset}
          className={cn(
            buttonVariants({ size: "sm", variant: "outline" }),
            "mx-auto flex"
          )}
        >
          <RotateCcw className="size-3.5 mr-1.5" />
          Try Again
        </button>
      )}
    </div>
  );
}
