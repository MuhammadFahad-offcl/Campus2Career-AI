"use client";

import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { mainNav } from "@/lib/navigation";
import { MobileMenuTrigger } from "@/components/layout/sidebar";

function usePageTitle(): string {
  const pathname = usePathname();
  for (const group of mainNav) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return item.label;
      }
    }
  }
  return "Dashboard";
}

interface PageHeaderProps {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}

/**
 * Compact top header for dashboard pages.
 * Shows auto-detected page title, optional description, and action slot.
 * Includes notification bell on the right side.
 *
 * On mobile (< lg): Shows hamburger menu button and reduced horizontal padding.
 * On desktop (≥ lg): Identical to before — no hamburger, full padding.
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  const autoTitle = usePageTitle();

  return (
    <header className="relative z-10 flex h-[60px] shrink-0 items-center justify-between border-b border-border bg-background px-4 shadow-soft sm:px-6">
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile hamburger — hidden at lg+ */}
        <MobileMenuTrigger />
        <div className="min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight text-foreground leading-tight truncate">
            {title ?? autoTitle}
          </h1>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate hidden sm:block">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {children}
        <button
          className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90"
          aria-label="Notifications"
        >
          <Bell className="size-4" />
          <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background" />
        </button>
        <button
          className="hidden sm:flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 hover:bg-muted hover:text-foreground active:scale-90"
          aria-label="Search"
        >
          <Search className="size-4" />
        </button>
      </div>
    </header>
  );
}
