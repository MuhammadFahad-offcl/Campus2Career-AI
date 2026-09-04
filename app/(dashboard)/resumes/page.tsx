import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { EmptyState } from "@/components/shared";
import { FolderOpen } from "lucide-react";

export const metadata: Metadata = {
  title: "My Resumes",
};

export default function ResumesPage() {
  return (
    <>
      <PageHeader
        title="My Resumes"
        description="Manage your uploaded and analyzed resumes"
      />

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-3xl">
          <EmptyState
            icon={FolderOpen}
            title="No resumes yet"
            description="Upload and analyze your first resume to get started with AI-powered career intelligence."
            action={{ label: "Analyze a Resume", href: "/analysis" }}
            secondaryText="Supports PDF and DOCX files up to 5 MB"
          />
        </div>
      </div>
    </>
  );
}
