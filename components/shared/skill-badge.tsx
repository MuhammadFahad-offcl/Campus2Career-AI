import { cn } from "@/lib/utils";
import { Check, X, Minus } from "lucide-react";

export type SkillStatus = "matched" | "partial" | "missing" | "mentioned" | "demonstrated";

interface SkillBadgeProps {
  name: string;
  status?: SkillStatus;
  size?: "sm" | "default";
  className?: string;
}

const statusStyles: Record<SkillStatus, string> = {
  matched: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  missing: "bg-red-50 text-red-700 border-red-200",
  mentioned: "bg-blue-50 text-blue-700 border-blue-200",
  demonstrated: "bg-primary/10 text-primary border-primary/20",
};

const statusIcons: Record<SkillStatus, typeof Check> = {
  matched: Check,
  partial: Minus,
  missing: X,
  mentioned: Minus,
  demonstrated: Check,
};

/**
 * A skill pill that visually communicates its status.
 * Used in analysis results, job matching, and profile views.
 */
export function SkillBadge({ name, status = "mentioned", size = "default", className }: SkillBadgeProps) {
  const Icon = statusIcons[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        statusStyles[status],
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      <Icon className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")} />
      {name}
    </span>
  );
}
