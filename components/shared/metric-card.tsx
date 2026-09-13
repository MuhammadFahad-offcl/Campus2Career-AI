import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from "@/components/ui/card";
import { AnimatedNumber } from "./animated-number";

interface MetricCardProps {
  label: string;
  value: string | number;
  /** Appended after an animated numeric value (e.g. "%"). Ignored for string values. */
  suffix?: string;
  icon: LucideIcon;
  description?: string;
  trend?: { value: string; positive: boolean };
  accent?: "default" | "indigo" | "purple" | "green" | "amber";
  className?: string;
}

const accentMap = {
  default: "bg-gradient-to-br from-muted to-muted/40 text-muted-foreground",
  indigo: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary",
  purple: "bg-gradient-to-br from-accent/20 to-accent/5 text-accent",
  green: "bg-gradient-to-br from-emerald-100 to-emerald-50 text-emerald-600",
  amber: "bg-gradient-to-br from-amber-100 to-amber-50 text-amber-600",
} as const;

/**
 * A compact metric card for displaying key statistics.
 * Used in dashboards and summary views.
 */
export function MetricCard({
  label,
  value,
  suffix,
  icon: Icon,
  description,
  trend,
  accent = "indigo",
  className,
}: MetricCardProps) {
  return (
    <Card
      className={cn(
        "card-interactive animate-in fade-in slide-in-from-bottom-2 duration-500 hover:ring-primary/15",
        className
      )}
    >
      <CardHeader className="flex-row items-center gap-3 pb-0">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg shadow-sm",
            accentMap[accent]
          )}
        >
          <Icon className="size-4.5" />
        </div>
        <CardDescription className="text-xs font-medium uppercase tracking-wider">
          {label}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold tracking-tight text-foreground">
            {typeof value === "number" ? (
              <AnimatedNumber value={value} suffix={suffix} />
            ) : (
              value
            )}
          </p>
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend.positive ? "text-emerald-600" : "text-amber-600"
              )}
            >
              {trend.value}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
