import type { Metadata } from "next";
import { PageHeader } from "@/components/retro/PageHeader";
import { Dashboard } from "@/components/workflow/Dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader icon="home" title="Dashboard" subtitle="Your submissions and their status. Reviewers also see everything waiting for a decision." />
      <Dashboard />
    </>
  );
}
