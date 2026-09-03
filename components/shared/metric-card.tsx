import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from "@/components/ui/card";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: { value: string; positive: boolean };
  accent?: "default" | "indigo" | "purple" | "green" | "amber";
  className?: string;
}

const accentMap = {
  default: "bg-muted text-muted-foreground",
  indigo: "bg-primary/10 text-primary",
  purple: "bg-accent/10 text-accent",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
} as const;

/**
 * A compact metric card for displaying key statistics.
 * Used in dashboards and summary views.
 */
export function MetricCard({
  label,
  value,
  icon: Icon,
  description,
  trend,
  accent = "indigo",
  className,
}: MetricCardProps) {
  return (
    <Card className={cn("transition-colors hover:border-primary/20", className)}>
      <CardHeader className="flex-row items-center gap-3 pb-0">
        <div
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
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
            {value}
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
