import { cn } from "@/lib/utils";

interface MatchScoreGaugeProps {
  score: number; // 0-100
  size?: "sm" | "default" | "lg";
  label?: string;
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function getScoreRingColor(score: number): string {
  if (score >= 75) return "stroke-emerald-500";
  if (score >= 50) return "stroke-amber-500";
  return "stroke-red-400";
}

/**
 * A circular gauge that visualizes a match score from 0-100.
 * Used in job matching and resume analysis views.
 */
export function MatchScoreGauge({ score, size = "default", label, className }: MatchScoreGaugeProps) {
  const clampedScore = Math.min(100, Math.max(0, score));

  const sizes = {
    sm: { container: "size-20", stroke: 5, radius: 32, fontSize: "text-lg" },
    default: { container: "size-28", stroke: 6, radius: 42, fontSize: "text-2xl" },
    lg: { container: "size-36", stroke: 7, radius: 54, fontSize: "text-3xl" },
  };

  const s = sizes[size];
  const circumference = 2 * Math.PI * s.radius;
  const offset = circumference - (clampedScore / 100) * circumference;
  const svgSize = size === "sm" ? 80 : size === "default" ? 100 : 120;
  const center = svgSize / 2;

  return (
    <div className={cn("flex flex-col items-center gap-1.5", className)}>
      <div className={cn("relative flex items-center justify-center", s.container)}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          className="-rotate-90"
        >
          {/* Background ring */}
          <circle
            cx={center}
            cy={center}
            r={s.radius}
            fill="none"
            strokeWidth={s.stroke}
            className="stroke-muted"
          />
          {/* Score ring */}
          <circle
            cx={center}
            cy={center}
            r={s.radius}
            fill="none"
            strokeWidth={s.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={cn("transition-all duration-700 ease-out", getScoreRingColor(clampedScore))}
          />
        </svg>
        <span className={cn("absolute font-bold tracking-tight", s.fontSize, getScoreColor(clampedScore))}>
          {clampedScore}
        </span>
      </div>
      {label && (
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      )}
    </div>
  );
}
