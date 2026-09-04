import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { SectionCard } from "@/components/shared";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your account and preferences"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6 sm:py-6 space-y-5">
          {/* Profile */}
          <SectionCard title="Profile" description="Your account information">
            <div className="flex items-center gap-4">
              <Avatar className="size-12">
                <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                  SC
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-foreground">Student User</p>
                <p className="text-xs text-muted-foreground">student@example.com</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Profile management will be available once Supabase Auth is configured.
            </p>
          </SectionCard>

          <Separator />

          {/* Notifications */}
          <SectionCard title="Notifications" description="Email and in-app notification preferences">
            <div className="space-y-3">
              {[
                { label: "Analysis complete", desc: "When your resume analysis finishes" },
                { label: "New recommendations", desc: "When new skill recommendations are available" },
                { label: "Weekly progress", desc: "Summary of your skill bridge progress" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <div className="size-9 rounded-full border border-border bg-muted/50" />
                </div>
              ))}
            </div>
          </SectionCard>

          <Separator />

          {/* API */}
          <SectionCard title="API & Integrations" description="External service configuration">
            <p className="text-xs text-muted-foreground">
              API key configuration and third-party integrations will be available in a future update.
            </p>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
