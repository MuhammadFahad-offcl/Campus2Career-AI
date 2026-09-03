import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // 0-100
  label?: string;
  size?: "sm" | "default";
  className?: string;
}

/**
 * A compact progress bar for showing completion states.
 */
export function ProgressBar({
  value,
  label,
  size = "default",
  className,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{clamped}%</span>
        </div>
      )}
      <div
        className={cn(
          "w-full overflow-hidden rounded-full bg-muted",
          size === "sm" ? "h-1.5" : "h-2"
        )}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
