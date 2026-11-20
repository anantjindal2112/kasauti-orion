import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/retro/PageHeader";
import { LoginForm } from "@/components/workflow/LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <PageHeader icon="home" title="Sign in" subtitle="Sign in to save drafts, send them for review, comment, approve, and keep a shared audit log." />
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
