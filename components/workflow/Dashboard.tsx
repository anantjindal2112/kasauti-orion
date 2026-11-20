"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button, ButtonLink } from "@/components/retro/Button";
import { Window } from "@/components/retro/Window";
import { SignInNotice } from "@/components/workflow/SignInNotice";
import { announceAuthChange, api, useMe, when } from "@/lib/client-api";
import { ROLE_LABEL, STATUS_LABEL, STATUSES, type Status } from "@/lib/workflow";

export interface SubRow {
  id: string;
  title: string;
  channel: string | null;
  status: Status;
  author_name: string;
  updated_at: string;
  comments: number;
  versions: number;
  scan: { findings: number; high: number; medium: number; low: number } | null;
}
interface Note {
  id: string;
  submission_id: string | null;
  body: string;
  read: boolean;
  created_at: string;
}

export const STATUS_TONE = { draft: "neutral", in_review: "info", changes_requested: "warn", approved: "ok" } as const;

export function Dashboard() {
  const { me } = useMe();
  const [rows, setRows] = useState<SubRow[] | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [filter, setFilter] = useState<"all" | Status>("all");
  const [error, setError] = useState("");

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);
  useEffect(() => {
    if (me.status !== "user") return;
    let live = true;
    void Promise.all([api<{ submissions: SubRow[] }>("GET", "/api/submissions"), api<{ notifications: Note[] }>("GET", "/api/notifications")]).then(([s, n]) => {
      if (!live) return;
      if (s.ok) setRows(s.data.submissions);
      else setError(s.error);
      if (n.ok) setNotes(n.data.notifications);
    });
    return () => {
      live = false;
    };
  }, [me.status, reload]);

  if (me.status !== "user") return <SignInNotice state={me.status} />;
  const user = me.user;
  const isCreator = user.role === "creator";
  const unread = notes.filter((n) => !n.read).length;
  const shown = (rows ?? []).filter((r) => filter === "all" || r.status === filter);
  const waiting = (rows ?? []).filter((r) => r.status === "in_review");

  const signOut = async () => {
    await api("POST", "/api/auth/logout");
    announceAuthChange();
  };
  const markRead = async () => {
    await api("POST", "/api/notifications");
    load();
  };

  return (
    <div className="space-y-6">
      <Window title="C:\KASAUTI\ME.TXT" color="teal" bodyClassName="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <p>
          Signed in as <b>{user.name}</b> <Badge tone="info">{ROLE_LABEL[user.role]}</Badge> <span className="font-mono text-xs text-muted">{user.email}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/scan" variant="primary" size="sm">
            {isCreator ? "Write a new draft" : "Open the scanner"}
          </ButtonLink>
          <ButtonLink href="/audit" size="sm">
            Audit log
          </ButtonLink>
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </Window>

      {!isCreator && waiting.length > 0 && (
        <Window title="C:\KASAUTI\QUEUE.LOG" color="red" bodyClassName="space-y-3 p-4 sm:p-5">
          <p className="font-pixel text-xl font-bold">
            {waiting.length} waiting for review
          </p>
          <ul className="space-y-2">
            {waiting.map((r) => (
              <li key={r.id}>
                <Link href={`/submissions/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 border-2 border-ink bg-card px-3 py-2 hover:bg-sunk">
                  <span className="font-bold">{r.title}</span>
                  <span className="font-mono text-xs text-muted">
                    {r.author_name} · {when(r.updated_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Window>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
        <Window title={isCreator ? "C:\\KASAUTI\\MY_SUBMISSIONS.DAT" : "C:\\KASAUTI\\SUBMISSIONS.DAT"} color="blue" bodyClassName="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
            {(["all", ...STATUSES] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
                className={`border-2 border-ink px-3 py-1 font-mono text-xs font-bold ${filter === f ? "bg-yellow" : "bg-card"}`}
              >
                {f === "all" ? "All" : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="border-2 border-ink bg-mark-high px-3 py-2 text-sm font-medium">
              {error}
            </p>
          )}
          {rows === null && !error && <p className="font-mono text-sm text-muted">Loading…</p>}
          {rows && shown.length === 0 && (
            <div className="border-2 border-dashed border-ink bg-card p-4 text-sm">
              <p className="font-medium">Nothing here yet.</p>
              <p className="text-muted">{isCreator ? "Write a draft in the scanner and press “Save to dashboard”." : "Submissions show up here once a creator saves one."}</p>
            </div>
          )}
          <ul className="space-y-3">
            {shown.map((r) => (
              <li key={r.id}>
                <Link href={`/submissions/${r.id}`} className="block border-2 border-ink bg-card p-3 shadow-hard-sm press">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold">{r.title}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </span>
                  <span className="mt-1 block font-mono text-xs text-muted">
                    {r.author_name}
                    {r.channel ? ` · ${r.channel}` : ""} · updated {when(r.updated_at)} · v{r.versions} · {r.comments} comment{r.comments === 1 ? "" : "s"}
                    {r.scan ? ` · last scan: ${r.scan.findings} finding${r.scan.findings === 1 ? "" : "s"} (${r.scan.high} high)` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Window>

        <Window title="C:\KASAUTI\INBOX.TXT" color="yellow" bodyClassName="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="font-pixel text-lg font-bold">Notifications {unread > 0 && <Badge tone="fail">{unread} new</Badge>}</p>
            {unread > 0 && (
              <Button size="sm" variant="ghost" onClick={() => void markRead()}>
                Mark read
              </Button>
            )}
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-muted">Nothing yet. You are told when something is sent for review, commented on, approved or sent back.</p>
          ) : (
            <ul className="space-y-2">
              {notes.slice(0, 8).map((n) => (
                <li key={n.id} className={`border-2 border-ink p-2 text-sm ${n.read ? "bg-card" : "bg-mark-medium"}`}>
                  {n.submission_id ? (
                    <Link href={`/submissions/${n.submission_id}`} className="font-medium underline-offset-2 hover:underline">
                      {n.body}
                    </Link>
                  ) : (
                    n.body
                  )}
                  <span className="block font-mono text-[11px] text-muted">{when(n.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Window>
      </div>
    </div>
  );
}
