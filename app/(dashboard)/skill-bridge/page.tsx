import type { Metadata } from "next";
import { PageHeader } from "@/components/layout";
import { SkillBridgePanel } from "@/components/skill-bridge-panel";

export const metadata: Metadata = {
  title: "Skill Bridge",
};

export default function SkillBridgePage() {
  return (
    <>
      <PageHeader
        title="7-Day Skill Bridge"
        description="Turn your skill gaps into a practical, evidence-first action plan"
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-6">
          <SkillBridgePanel />
        </div>
      </div>
    </>
  );
}
