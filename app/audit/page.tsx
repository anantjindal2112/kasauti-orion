import type { Metadata } from "next";
import { PageHeader } from "@/components/retro/PageHeader";
import { AuditView } from "@/components/workflow/AuditView";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditPage() {
  return (
    <>
      <PageHeader icon="rules" title="Audit log" subtitle="Who did what, and when: sign-ins, saves, status changes, comments and every decision on a finding." />
      <AuditView />
    </>
  );
}
