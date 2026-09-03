"use client";

import { useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Package,
  RotateCcw,
} from "lucide-react";
import type { SkillBridgeDay } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SkillBridgeDayCardProps {
  day: SkillBridgeDay;
  isNext: boolean;
  onToggleComplete: (day: number) => void;
  disabled?: boolean;
}

export function SkillBridgeDayCard({
  day,
  isNext,
  onToggleComplete,
  disabled = false,
}: SkillBridgeDayCardProps) {
  const [expanded, setExpanded] = useState(isNext);

  const isCompleted = day.status === "completed";

  return (
    <div className="relative flex gap-4">
      {/* Day indicator */}
      <div className="relative z-10 mt-1 flex size-11 shrink-0 items-center justify-center">
        {isCompleted ? (
          <CheckCircle2 className="size-6 text-emerald-500" />
        ) : (
          <div className="flex size-9 items-center justify-center rounded-full border-2 border-border bg-white text-xs font-bold text-muted-foreground">
            {day.day}
          </div>
        )}
      </div>

      {/* Day card */}
      <Card
        className={cn(
          "flex-1 transition-all",
          isCompleted ? "opacity-70" : "",
          isNext ? "border-primary/30 bg-primary/[0.02]" : ""
        )}
      >
        <CardContent className="py-4">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Day {day.day}: {day.title}
                </h3>
                {isNext && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    Next
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {day.task}
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0 ml-3">
              <Clock className="size-3" />
              {day.estimatedMinutes}m
            </div>
          </div>

          {/* Expandable details */}
          {!isCompleted && (
            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-2 text-xs">
                <BookOpen className="size-3.5 shrink-0 mt-0.5 text-primary/60" />
                <span className="text-muted-foreground">
                  <span className="font-medium text-foreground/80">Why:</span>{" "}
                  {day.reason}
                </span>
              </div>
              {expanded && (
                <div className="flex items-start gap-2 text-xs">
                  <Package className="size-3.5 shrink-0 mt-0.5 text-emerald-500/60" />
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground/80">
                      Evidence:
                    </span>{" "}
                    {day.expectedEvidence}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => onToggleComplete(day.day)}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                isCompleted
                  ? "border border-border text-muted-foreground hover:bg-muted"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              )}
            >
              {isCompleted ? (
                <>
                  <RotateCcw className="size-3" />
                  Reopen
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5" />
                  Mark Complete
                </>
              )}
            </button>
            {!isCompleted && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="size-3" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3" />
                    Details
                  </>
                )}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
