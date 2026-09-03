/**
 * Match score interpretation — pure presentation helpers.
 *
 * Single source of truth for score-band labels, shared by the
 * Match Results Panel and the Explainable Dashboard.
 *
 * These labels describe skills/experience/education alignment only.
 * They are decision-support signals — never hiring, interview,
 * or employment predictions.
 */

export function getMatchScoreLabel(score: number): string {
  if (score >= 80) return "Strong Match";
  if (score >= 60) return "Good Match";
  if (score >= 40) return "Moderate Match";
  if (score >= 20) return "Weak Match";
  return "Low Match";
}

export function getScoreTone(score: number): "emerald" | "amber" | "red" {
  if (score >= 75) return "emerald";
  if (score >= 50) return "amber";
  return "red";
}
