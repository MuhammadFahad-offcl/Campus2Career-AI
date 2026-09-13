import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { MockInterviewPanel } from "@/components/mock-interview-panel";

export const metadata: Metadata = {
  title: "Mock Interview",
};

export default function MockInterviewPage() {
  return (
    <>
      <PageHeader
        title="AI Mock Interviewer"
        description="Practice a realistic, personalized interview for your target role"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
          <MockInterviewPanel />
        </div>
      </div>
    </>
  );
}
