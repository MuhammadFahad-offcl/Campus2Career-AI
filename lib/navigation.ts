/**
 * Application navigation configuration.
 *
 * Single source of truth for sidebar navigation items.
 * Used by the Sidebar component and any other navigation consumers.
 */

import {
  LayoutDashboard,
  FileSearch,
  FileText,
  Sparkles,
  Settings,
  FolderOpen,
  Target,
  LayoutTemplate,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const mainNav: NavGroup[] = [
  {
    title: "Overview",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    title: "Workspace",
    items: [
      {
        label: "My Resumes",
        href: "/resumes",
        icon: FolderOpen,
        disabled: true,
        badge: "Soon",
      },
      {
        label: "Job Matcher",
        href: "/job-matcher",
        icon: Target,
      },
      {
        label: "Resume Analyzer",
        href: "/analysis",
        icon: FileSearch,
      },
      {
        label: "Resume Rewrite",
        href: "/resume",
        icon: FileText,
      },
      {
        label: "Skill Bridge",
        href: "/skill-bridge",
        icon: Sparkles,
      },
      {
        label: "Mock Interview",
        href: "/mock-interview",
        icon: MessagesSquare,
      },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        label: "Templates",
        href: "/templates",
        icon: LayoutTemplate,
        disabled: true,
        badge: "Soon",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Settings",
        href: "/settings",
        icon: Settings,
      },
    ],
  },
];
