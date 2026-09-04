import { Sidebar, MobileNavProvider } from "@/components/layout/sidebar";

/**
 * Dashboard layout with persistent sidebar.
 * All routes under (dashboard) share this layout.
 *
 * Desktop (≥ lg): Sidebar is always visible at 260px.
 * Mobile (< lg): Sidebar becomes a slide-in drawer triggered by the
 *   hamburger button in the PageHeader.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">{children}</div>
      </div>
    </MobileNavProvider>
  );
}
