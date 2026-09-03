import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { RewritePanel } from "@/components/rewrite-panel";

export const metadata: Metadata = {
  title: "Resume Rewrite",
};

export default function ResumeRewritePage() {
  return (
    <>
      <PageHeader
        title="Resume Rewrite"
        description="AI-optimized resume suggestions for specific job applications"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <RewritePanel />
        </div>
      </div>
    </>
  );
}
