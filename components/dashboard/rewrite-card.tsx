import Link from "next/link";
import { ArrowRight, FileText, Sparkles } from "lucide-react";
import { SectionCard, EmptyState } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardRewrite } from "@/types";
import { formatShortDate } from "@/lib/dashboard/summary-utils";

/**
 * Row 3 (right) — truthful rewrite state.
 * No invented "resume score": shows the real persisted suggestion count.
 */
export function RewriteCard({ rewrite }: { rewrite: DashboardRewrite | null }) {
  if (!rewrite) {
    return (
      <SectionCard
        title="Resume Rewrite"
        description="Evidence-validated suggestions for this role"
      >
        <EmptyState
          icon={FileText}
          title="No rewrite suggestions yet"
          description="Optimize your resume for the target role with evidence-validated suggestions."
          action={{ label: "Open Rewrite", href: "/resume" }}
          className="py-10"
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Resume Rewrite"
      description="Evidence-validated suggestions for this role"
      action={
        <Link
          href="/resume"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "text-xs")}
        >
          Open Rewrite
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="size-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              Rewrite suggestions available
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rewrite.suggestionCount} evidence-validated{" "}
              {rewrite.suggestionCount === 1 ? "suggestion" : "suggestions"} ·{" "}
              {formatShortDate(rewrite.createdAt)}
            </p>
          </div>
        </div>
        <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          Every suggestion is backed by evidence already in your resume — nothing is
          invented. Accept, reject, or edit each one.
        </p>
      </div>
    </SectionCard>
  );
}
