import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardNextAction } from "@/types";

/**
 * "What should I do next?" — a deterministic recommendation banner
 * derived from actual product state (never AI-generated).
 */
export function NextActionCard({ action }: { action: DashboardNextAction }) {
  return (
    <Card className="animate-in fade-in slide-in-from-bottom-2 duration-500 group relative overflow-hidden hover:border-primary/25 hover:shadow-elevated transition-all duration-200">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/[0.06] to-transparent" />
      <div className="mesh-blob -right-6 -top-10 size-32 bg-accent/20" aria-hidden="true" />
      <CardContent className="relative flex flex-col items-start gap-4 py-5 sm:flex-row sm:items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 shadow-sm">
          <Compass className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/60">
            Recommended Next Step
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">
            {action.title}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        </div>
        <Link
          href={action.href}
          className={cn(
            buttonVariants({ size: "sm" }),
            "shrink-0 text-xs"
          )}
        >
          {action.ctaLabel}
          <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
