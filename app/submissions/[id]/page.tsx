import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/retro/PageHeader";
import { SubmissionView } from "@/components/workflow/SubmissionView";

export const metadata: Metadata = { title: "Submission" };

export default function SubmissionPage() {
  return (
    <>
      <PageHeader icon="check" title="Submission" subtitle="The text, who decided what, every version, and the trail behind it." />
      <Suspense fallback={<p className="font-mono text-sm text-muted">Loading…</p>}>
        <SubmissionView />
      </Suspense>
    </>
  );
}
