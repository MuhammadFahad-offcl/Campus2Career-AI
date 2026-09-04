"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, ChevronRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { mainNav, type NavItem } from "@/lib/navigation";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ────────────────────────────────────────────────
// Mobile navigation context
// ────────────────────────────────────────────────

interface MobileNavContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavContextValue>({
  isOpen: false,
  open: () => {},
  close: () => {},
});

/**
 * Provides mobile sidebar open/close state to the dashboard layout tree.
 * Only consumed on mobile (< lg); desktop ignores the state entirely.
 */
export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <MobileNavContext.Provider value={{ isOpen, open, close }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavContextValue {
  return useContext(MobileNavContext);
}

/**
 * Hamburger button rendered in the PageHeader on mobile only.
 * Hidden at lg+ where the sidebar is always visible.
 */
export function MobileMenuTrigger() {
  const { open } = useMobileNav();

  return (
    <button
      onClick={open}
      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
      aria-label="Open navigation menu"
    >
      <Menu className="size-5" />
    </button>
  );
}

// ────────────────────────────────────────────────
// Sidebar nav item (unchanged)
// ────────────────────────────────────────────────

function SidebarNavItem({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  const { close } = useMobileNav();

  if (item.disabled) {
    return (
      <div className="group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted-foreground/40 cursor-not-allowed select-none">
        <Icon className="size-[18px] shrink-0" />
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal border-border/60 text-muted-foreground/50">
            {item.badge}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={close}
      className={cn(
        "group/nav flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150",
        isActive
          ? "bg-primary/10 text-primary shadow-[inset_0_1px_0_0_oklch(0.488_0.207_264/0.08)]"
          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      )}
    >
      <Icon className={cn(
        "size-[18px] shrink-0 transition-colors",
        isActive ? "text-primary" : "text-muted-foreground/70 group-hover/nav:text-foreground"
      )} />
      <span className="flex-1 truncate">{item.label}</span>
      {isActive && (
        <ChevronRight className="size-3.5 text-primary/60" />
      )}
      {item.badge && !isActive && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
          {item.badge}
        </Badge>
      )}
    </Link>
  );
}

// ────────────────────────────────────────────────
// Sidebar inner content (unchanged desktop rendering)
// ────────────────────────────────────────────────

function SidebarContent() {
  const { close } = useMobileNav();

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex h-[60px] items-center gap-2.5 border-b border-sidebar-border px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary shadow-sm">
          <Zap className="size-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[13px] font-bold tracking-tight text-sidebar-foreground leading-tight">
            Campus2Career
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/70 leading-tight">
            AI Career Intel
          </span>
        </div>
        {/* Mobile close button — hidden on desktop */}
        <button
          onClick={close}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          aria-label="Close navigation menu"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        {mainNav.map((group) => (
          <div key={group.title} className="mb-5">
            <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground/50">
              {group.title}
            </p>
            <div className="space-y-px">
              {group.items.map((item) => (
                <SidebarNavItem key={item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-[11px] font-bold text-primary">
              SC
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col min-w-0">
            <span className="truncate text-[13px] font-medium text-foreground">
              Student User
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              Free Plan
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────
// Sidebar shell — desktop: static; mobile: drawer
// ────────────────────────────────────────────────

/**
 * Dashboard sidebar.
 *
 * Desktop (≥ lg): Always visible, 260px fixed width — identical to before.
 * Mobile (< lg): Off-screen drawer that slides in from the left with a
 *   backdrop overlay. Controlled via MobileNavContext.
 */
export function Sidebar() {
  const { isOpen, close } = useMobileNav();

  return (
    <>
      {/* ── Desktop: unchanged persistent sidebar ─────────── */}
      <div className="hidden lg:block">
        <SidebarContent />
      </div>

      {/* ── Mobile: slide-in drawer + overlay ─────────────── */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            onClick={close}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div className="fixed inset-y-0 left-0 z-50">
            <SidebarContent />
          </div>
        </div>
      )}
    </>
  );
}
