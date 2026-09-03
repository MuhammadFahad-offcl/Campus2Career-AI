"use client";

import { useState } from "react";
import {
  Check,
  X,
  Pencil,
  Lightbulb,
  Briefcase,
  FolderOpen,
  GraduationCap,
  Award,
  Wrench,
  FileText,
} from "lucide-react";
import type { RewriteSuggestion, RewriteSection } from "@/types";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

// ──────────────────────────────────────────────
// Section metadata
// ──────────────────────────────────────────────

const SECTION_CONFIG: Record<
  RewriteSection,
  { label: string; icon: typeof FileText; color: string }
> = {
  summary: { label: "Summary", icon: FileText, color: "text-blue-600" },
  experience: { label: "Experience", icon: Briefcase, color: "text-emerald-600" },
  project: { label: "Project", icon: FolderOpen, color: "text-violet-600" },
  education: { label: "Education", icon: GraduationCap, color: "text-amber-600" },
  certification: { label: "Certification", icon: Award, color: "text-rose-600" },
  skills: { label: "Skills", icon: Wrench, color: "text-cyan-600" },
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-600",
  unknown: "border-slate-200 bg-slate-50 text-slate-600",
};

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────

interface RewriteSuggestionCardProps {
  suggestion: RewriteSuggestion;
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string, editedText: string) => void;
}

export function RewriteSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onEdit,
}: RewriteSuggestionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(suggestion.suggestedText);

  const config = SECTION_CONFIG[suggestion.section];
  const SectionIcon = config.icon;
  const isAccepted = suggestion.status === "accepted";
  const isRejected = suggestion.status === "rejected";
  const isEdited = suggestion.status === "edited";

  const handleSaveEdit = () => {
    if (editText.trim() && editText !== suggestion.originalText) {
      onEdit(suggestion.id, editText.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditText(suggestion.suggestedText);
    setIsEditing(false);
  };

  return (
    <Card
      className={cn(
        "transition-all",
        isAccepted && "border-emerald-200 bg-emerald-50/30",
        isRejected && "border-slate-200 bg-slate-50/30 opacity-60",
        isEdited && "border-blue-200 bg-blue-50/30"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-lg bg-muted",
                config.color.replace("text-", "bg-") + "/10"
              )}
            >
              <SectionIcon className={cn("size-3.5", config.color)} />
            </div>
            <span className={cn("text-xs font-semibold uppercase tracking-wider", config.color)}>
              {config.label}
              {suggestion.sectionIndex > 0 && (
                <span className="ml-1 text-muted-foreground normal-case">
                  #{suggestion.sectionIndex + 1}
                </span>
              )}
            </span>
          </div>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              CONFIDENCE_BADGE[suggestion.confidence]
            )}
          >
            {suggestion.confidence} confidence
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Original vs Suggested */}
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Original
            </p>
            <div className="rounded-lg border border-border bg-background p-3 text-sm leading-relaxed text-foreground">
              {suggestion.originalText}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {isEdited ? "Edited" : "Suggested"}
            </p>
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  className="min-h-[100px] text-sm"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveEdit}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Check className="size-3" />
                    Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-lg border p-3 text-sm leading-relaxed",
                  isEdited
                    ? "border-blue-200 bg-blue-50/50 text-foreground"
                    : "border-primary/20 bg-primary/5 text-foreground"
                )}
              >
                {isEdited ? suggestion.editedText : suggestion.suggestedText}
              </div>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {suggestion.reason}
          </p>
        </div>

        {/* Evidence */}
        {suggestion.supportingEvidence.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Supporting Evidence
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestion.supportingEvidence.map((ev, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                >
                  {ev.length > 60 ? `${ev.slice(0, 60)}…` : ev}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Related requirements */}
        {suggestion.relatedJobRequirements.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Related Job Requirements
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestion.relatedJobRequirements.map((req, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
                >
                  {req.length > 60 ? `${req.slice(0, 60)}…` : req}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {suggestion.status === "pending" && !isEditing && (
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => onAccept(suggestion.id)}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <Check className="size-3.5" />
              Accept
            </button>
            <button
              onClick={() => onReject(suggestion.id)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <X className="size-3.5" />
              Reject
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Pencil className="size-3" />
              Edit
            </button>
          </div>
        )}

        {/* Status label */}
        {suggestion.status !== "pending" && (
          <div className="flex items-center gap-2 pt-1">
            {isAccepted && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                <Check className="size-3.5" />
                Accepted
              </span>
            )}
            {isRejected && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                <X className="size-3.5" />
                Rejected
              </span>
            )}
            {isEdited && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                <Pencil className="size-3" />
                Edited & Accepted
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
