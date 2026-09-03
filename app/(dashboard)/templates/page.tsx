import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import { LayoutTemplate } from "lucide-react";

export const metadata: Metadata = {
  title: "Templates",
};

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Templates"
        description="Resume templates optimized for ATS and hiring managers"
      />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={LayoutTemplate}
            title="Templates Coming Soon"
            description="We're building a library of ATS-friendly resume templates tailored for different industries and career stages."
            secondaryText="This feature will be available in a future update."
          />
        </div>
      </div>
    </>
  );
}
