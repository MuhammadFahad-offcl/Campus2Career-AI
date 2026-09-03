import { Sidebar } from "@/components/layout/sidebar";

/**
 * Dashboard layout with persistent sidebar.
 * All routes under (dashboard) share this layout.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
