"use client";

import { useEffect, useRef } from "react";

interface ConfettiBurstProps {
  /** Change this (e.g. to the session/report id) to re-trigger a burst. */
  triggerKey?: string | number;
  particleCount?: number;
  colors?: string[];
}

const DEFAULT_COLORS = [
  "#4f46e5", // indigo — matches --primary
  "#8b5cf6", // violet — matches --accent
  "#10b981", // emerald
  "#fbbf24", // amber
  "#38bdf8", // sky
];

/**
 * A tasteful, dependency-free confetti burst for celebratory moments (e.g.
 * finishing a mock interview). Renders into a fixed, pointer-events-none
 * full-viewport canvas and clears itself once the animation settles —
 * nothing is left mounted or listening afterward beyond the empty canvas.
 * Respects prefers-reduced-motion by rendering nothing at all.
 */
export function ConfettiBurst({
  triggerKey,
  particleCount = 140,
  colors = DEFAULT_COLORS,
}: ConfettiBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const particles = Array.from({ length: particleCount }, () => ({
      x: width / 2 + (Math.random() - 0.5) * width * 0.4,
      y: height * 0.32,
      vx: (Math.random() - 0.5) * 9,
      vy: Math.random() * -9 - 4,
      size: 4 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      gravity: 0.26 + Math.random() * 0.08,
      opacity: 1,
    }));

    let frame = 0;
    const maxFrames = 140;
    let rafId = 0;

    function draw() {
      frame++;
      ctx!.clearRect(0, 0, width, height);
      let alive = false;
      for (const p of particles) {
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        if (frame > maxFrames * 0.6) {
          p.opacity = Math.max(0, p.opacity - 0.035);
        }
        if (p.opacity > 0 && p.y < height + 20) alive = true;

        ctx!.save();
        ctx!.globalAlpha = p.opacity;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx!.restore();
      }
      if (alive && frame < maxFrames) {
        rafId = requestAnimationFrame(draw);
      } else {
        ctx!.clearRect(0, 0, width, height);
      }
    }
    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      ctx.clearRect(0, 0, width, height);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey, particleCount]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[100]"
    />
  );
}
