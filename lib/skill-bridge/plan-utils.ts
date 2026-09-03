/**
 * Pure plan utilities for the 7-day Skill Bridge.
 *
 * Progress calculation, day status transitions, and readiness
 * checks. Pure functions — no I/O.
 */

import type { DayTaskStatus, SkillBridgeDay } from "@/types";

export const TOTAL_PLAN_DAYS = 7 as const;

export interface PlanProgress {
  completed: number;
  total: number;
  percentage: number;
}

/**
 * Calculate real completion progress for a plan.
 */
export function calculateProgress(days: SkillBridgeDay[]): PlanProgress {
  const total = days.length;
  const completed = days.filter((d) => d.status === "completed").length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}

/**
 * Immutably update a day's status.
 * Returns a new array; the input is never mutated.
 */
export function applyDayStatus(
  days: SkillBridgeDay[],
  day: number,
  status: DayTaskStatus
): SkillBridgeDay[] {
  return days.map((d) => (d.day === day ? { ...d, status } : d));
}

/**
 * Toggle a day between completed and pending.
 * Returns a new array; the input is never mutated.
 */
export function toggleDayStatus(
  days: SkillBridgeDay[],
  day: number
): SkillBridgeDay[] {
  return days.map((d) =>
    d.day === day
      ? { ...d, status: d.status === "completed" ? "pending" : "completed" }
      : d
  );
}

/**
 * Whether all 7 days are completed — the "Ready to Apply" state.
 * A product readiness state only; never a hiring guarantee.
 */
export function isReadyToApply(days: SkillBridgeDay[]): boolean {
  return (
    days.length === TOTAL_PLAN_DAYS &&
    days.every((d) => d.status === "completed")
  );
}
