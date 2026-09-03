import { PageHeader } from "@/components/layout";
import { JobAnalysisPanel } from "@/components/job-analysis-panel";

export default function JobMatcherPage() {
  return (
    <>
      <PageHeader
        title="Job Matcher"
        description="Paste a job description to extract structured requirements"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          <JobAnalysisPanel />
        </div>
      </div>
    </>
  );
}
