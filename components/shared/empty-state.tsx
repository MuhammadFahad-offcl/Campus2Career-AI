import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryText?: string;
  className?: string;
}

/**
 * A guided empty state that tells the user what to do next.
 * Used for empty lists, coming-soon features, and first-time states.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryText,
  className,
}: EmptyStateProps) {
  const ActionElement = action ? (
    action.href ? (
      <Link
        href={action.href}
        className={cn(buttonVariants({ size: "sm" }), "mt-4")}
      >
        {action.label}
      </Link>
    ) : (
      <button
        onClick={action.onClick}
        className={cn(buttonVariants({ size: "sm" }), "mt-4")}
      >
        {action.label}
      </button>
    )
  ) : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-4 py-10 sm:px-8 sm:py-16 text-center",
        className
      )}
    >
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/8">
        <Icon className="size-6 text-primary" />
      </div>
      <h3 className="mb-1.5 text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {ActionElement}
      {secondaryText && (
        <p className="mt-3 text-xs text-muted-foreground/70">{secondaryText}</p>
      )}
    </div>
  );
}
