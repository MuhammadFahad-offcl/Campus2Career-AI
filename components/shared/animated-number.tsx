"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedNumberProps {
  /** Target value to count up (or down) to. */
  value: number;
  /** Animation duration in ms (ignored when the user prefers reduced motion). */
  duration?: number;
  /** Decimal places to render. */
  decimals?: number;
  /** Optional suffix, e.g. "%". */
  suffix?: string;
  className?: string;
}

/**
 * Counts up from its previous value to the new one instead of popping in
 * statically — used for scores and dashboard metrics so the numbers feel
 * alive rather than just rendered. No external dependency: plain
 * requestAnimationFrame with an ease-out curve. Respects
 * prefers-reduced-motion by collapsing the animation to a single frame
 * rather than skipping the effect (setState only ever happens inside the
 * rAF callback, never synchronously in the effect body).
 */
export function AnimatedNumber({
  value,
  duration = 900,
  decimals = 0,
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const effectiveDuration = prefersReducedMotion ? 0 : duration;

    const from = fromRef.current;
    const to = value;
    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = effectiveDuration === 0 ? 1 : Math.min(1, elapsed / effectiveDuration);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out-cubic
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={className}>
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}
