"use client";

import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers wrapper.
 * Wraps the entire app with providers that require client-side context.
 *
 * Add Zustand stores, theme providers, etc. here as needed.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <TooltipProvider>{children}</TooltipProvider>;
}
