"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Window } from "@/components/retro/Window";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { announceAuthChange, api } from "@/lib/client-api";
import { ROLE_LABEL } from "@/lib/workflow";

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard");

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const signIn = async (e: string, p: string) => {
    setBusy(true);
    setError("");
    const r = await api<{ user: unknown }>("POST", "/api/auth/login", { email: e, password: p });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    announceAuthChange();
    router.push(next);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Window title="C:\KASAUTI\LOGIN.EXE" color="blue" bodyClassName="space-y-4 p-5 sm:p-6">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void signIn(email, password);
          }}
        >
          <label className="block">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border-2 border-ink bg-card px-3 py-2 text-lg"
            />
          </label>
          <label className="block">
            <span className="font-mono text-xs font-bold uppercase tracking-wider">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border-2 border-ink bg-card px-3 py-2 text-lg"
            />
          </label>
          {error && (
            <p role="alert" className="border-2 border-ink bg-mark-high px-3 py-2 text-sm font-medium">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" size="lg" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="text-sm text-muted">Your session is a signed cookie that expires in 7 days. Every action you take is written to the audit log.</p>
      </Window>

      <Window title="C:\KASAUTI\DEMO_ACCOUNTS.TXT" color="yellow" bodyClassName="space-y-3 p-5 sm:p-6">
        <p className="text-sm">
          <b>Try it as each role.</b> These are demo accounts for the fictional brand Dhaaga &amp; Co. and only hold demo data. Password for all four:{" "}
          <code className="border-2 border-ink bg-card px-1.5 font-mono">{DEMO_PASSWORD}</code>
        </p>
        <ul className="space-y-2">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email} className="flex flex-wrap items-center justify-between gap-2 border-2 border-ink bg-card p-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-bold">
                  {a.name} <Badge tone="info">{ROLE_LABEL[a.role]}</Badge>
                </span>
                <span className="block font-mono text-xs text-muted">{a.email}</span>
                <span className="block text-sm">{a.blurb}</span>
              </span>
              <Button size="sm" disabled={busy} onClick={() => void signIn(a.email, DEMO_PASSWORD)}>
                Sign in as {ROLE_LABEL[a.role].toLowerCase()}
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Creators only see their own submissions; reviewers, managers and admins see all. Nobody can approve their own work.</p>
      </Window>
    </div>
  );
}
