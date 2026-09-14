import { Sidebar, MobileNavProvider } from "@/components/layout/sidebar";
import { getAuthIdentity } from "@/app/actions/auth";

/**
 * Dashboard layout with persistent sidebar.
 * All routes under (dashboard) share this layout.
 *
 * Desktop (≥ lg): Sidebar is always visible at 260px.
 * Mobile (< lg): Sidebar becomes a slide-in drawer triggered by the
 *   hamburger button in the PageHeader.
 *
 * Real identity (replacing the previous hardcoded "Student User"
 * placeholder) is resolved server-side once here and passed down —
 * anonymous visitors see their session state, signed-in users see
 * their real email and a working sign-out control.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await getAuthIdentity();

  return (
    <MobileNavProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          identity={{
            email: identity?.email ?? null,
            isAuthenticated: identity !== null,
          }}
        />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">{children}</div>
      </div>
    </MobileNavProvider>
  );
}
