import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { SectionCard } from "@/components/shared";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getAuthIdentity } from "@/app/actions/auth";
import { AccountPanel } from "@/components/settings/account-panel";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const identity = await getAuthIdentity();

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
            {identity ? (
              <AccountPanel email={identity.email ?? "Signed in"} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Avatar className="size-12">
                    <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                      S2C
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-foreground">Anonymous session</p>
                    <p className="text-xs text-muted-foreground">No account — nothing is saved permanently</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <Clock className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-amber-900">
                      Your session expires in 24 hours
                    </p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      Everything you&apos;ve uploaded and generated on this
                      device — resumes, analyses, rewrites, skill-bridge
                      progress — is tied to a temporary browser session, not
                      an account. Create a free account and it moves over
                      automatically; nothing is lost.
                    </p>
                  </div>
                </div>

                <Link
                  href="/register"
                  className={cn(buttonVariants({ size: "sm" }), "w-full justify-center")}
                >
                  Create a free account
                </Link>
              </div>
            )}
          </SectionCard>

          <Separator />

          {/* Privacy & data */}
          <SectionCard
            title="Privacy & data"
            description="What we store and how to remove it"
          >
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-border px-4 py-3">
                <ShieldAlert className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Manage individual resumes
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Delete a specific resume and everything derived from it
                    (analyses, rewrites, skill-bridge plans) from{" "}
                    <Link href="/resumes" className="text-primary hover:underline">
                      My Resumes
                    </Link>
                    .
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                See our{" "}
                <Link href="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>{" "}
                for what is stored, how long, and which third parties (AI
                providers) process it.
              </p>
            </div>
          </SectionCard>

          <Separator />

          {/* Notifications */}
          <SectionCard title="Notifications" description="Coming soon">
            <p className="text-xs text-muted-foreground">
              Email and in-app notifications aren&apos;t built yet — this
              section will control alerts for analysis completion and new
              recommendations once they exist.
            </p>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
