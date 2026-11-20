"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button, ButtonLink } from "@/components/retro/Button";
import { Window } from "@/components/retro/Window";
import { STATUS_TONE } from "@/components/workflow/Dashboard";
import { SignInNotice } from "@/components/workflow/SignInNotice";
import { api, useMe, when } from "@/lib/client-api";
import { wordDiff } from "@/lib/diff";
import { ROLE_LABEL, STATUS_LABEL, transitionError, type Role, type Status } from "@/lib/workflow";

interface Detail {
  submission: { id: string; title: string; channel: string | null; text: string; intent: { purpose?: string; audience?: string; mustKeep?: string }; status: Status; scan: { findings: number; high: number; medium: number; low: number; at: string } | null; author_name: string; created_at: string; updated_at: string };
  versions: { n: number; text: string; note: string; created_at: string; author_name: string }[];
  comments: { id: string; body: string; finding_ref: string | null; created_at: string; author_name: string; author_role: Role }[];
  decisions: { rule: string; action: string; source: string; quote: string; intent_override: boolean; reason: string | null; created_at: string; actor_name: string }[];
  audit: { action: string; actor_email: string; payload: Record<string, unknown>; at: string }[];
  you: { role: Role; isAuthor: boolean; canEdit: boolean };
}

const ACTION_LABEL: Record<string, string> = {
  "submission.created": "created the submission",
  "submission.version": "saved a new version",
  "submission.status": "changed the status",
  "comment.created": "commented",
  "decision.accepted": "accepted a fix",
  "decision.edited": "edited a fix",
  "decision.disputed": "disputed a finding",
  "decision.noted": "noted a finding",
  "auth.login": "signed in",
};

function Diff({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => wordDiff(before, after), [before, after]);
  return (
    <p className="whitespace-pre-wrap border-2 border-ink bg-card p-3 text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "add" ? (
          <ins key={i} className="bg-term-green/40 no-underline">
            {p.text}
          </ins>
        ) : (
          <del key={i} className="bg-mark-high">
            {p.text}
          </del>
        ),
      )}
    </p>
  );
}

export function SubmissionView() {
  const id = String(useParams<{ id: string }>().id ?? "");
  const { me } = useMe();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const [reload, setReload] = useState(0);
  const load = () => setReload((n) => n + 1);
  useEffect(() => {
    if (me.status !== "user") return;
    let live = true;
    void api<Detail>("GET", `/api/submissions/${id}`).then((r) => {
      if (!live) return;
      if (r.ok) {
        setD(r.data);
        setError("");
      } else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [me.status, id, reload]);

  if (me.status !== "user") return <SignInNotice state={me.status} />;
  if (error && !d)
    return (
      <Window title="C:\KASAUTI\NOT_FOUND.TXT" color="red" bodyClassName="space-y-3 p-5">
        <p className="font-bold">{error}</p>
        <ButtonLink href="/dashboard">Back to the dashboard</ButtonLink>
      </Window>
    );
  if (!d) return <p className="font-mono text-sm text-muted">Loading…</p>;

  const { submission: s, you } = d;
  const move = async (to: Status) => {
    setBusy(true);
    const r = await api("POST", `/api/submissions/${id}/status`, { to, ...(note.trim() ? { note: note.trim() } : {}) });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setNote("");
    setError("");
    load();
  };
  const send = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    const r = await api("POST", `/api/submissions/${id}/comments`, { body: comment.trim() });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setComment("");
    setError("");
    load();
  };
  const can = (to: Status) => !transitionError({ role: you.role, isAuthor: you.isAuthor, from: s.status, to });

  return (
    <div className="space-y-6">
      <Window title="C:\KASAUTI\SUBMISSION.TXT" color="teal" bodyClassName="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-pixel text-2xl font-bold">{s.title}</h2>
            <p className="font-mono text-xs text-muted">
              by {s.author_name}
              {s.channel ? ` · ${s.channel}` : ""} · updated {when(s.updated_at)}
              {s.scan ? ` · last scan: ${s.scan.findings} finding${s.scan.findings === 1 ? "" : "s"} (${s.scan.high} high, ${s.scan.medium} medium, ${s.scan.low} low)` : ""}
            </p>
          </div>
          <Badge tone={STATUS_TONE[s.status]} stamp>
            {STATUS_LABEL[s.status]}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap border-2 border-ink bg-card p-4 text-lg leading-relaxed">{s.text}</p>
        {(s.intent.purpose || s.intent.audience || s.intent.mustKeep) && (
          <p className="font-mono text-xs text-muted">
            Intent: {s.intent.purpose || "—"} · audience {s.intent.audience || "—"} · must keep {s.intent.mustKeep || "—"}
          </p>
        )}
        {error && (
          <p role="alert" className="border-2 border-ink bg-mark-high px-3 py-2 text-sm font-medium">
            {error}
          </p>
        )}

        <div className="space-y-3 border-t-2 border-dashed border-ink pt-4">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/scan?submission=${id}`} size="sm">
              {you.canEdit ? "Edit and scan" : "Open in scanner"}
            </ButtonLink>
            {can("in_review") && (
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void move("in_review")}>
                Send for review
              </Button>
            )}
            {can("approved") && (
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void move("approved")}>
                Approve
              </Button>
            )}
            {can("changes_requested") && (
              <Button size="sm" disabled={busy} onClick={() => void move("changes_requested")}>
                {s.status === "approved" ? "Reopen (request changes)" : "Request changes"}
              </Button>
            )}
          </div>
          {(can("in_review") || can("approved") || can("changes_requested")) && (
            <label className="block text-sm">
              <span className="font-mono text-xs font-bold uppercase tracking-wider">Note with your decision (optional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 w-full border-2 border-ink bg-card px-2 py-1.5" placeholder="e.g. Add the end date to the offer." />
            </label>
          )}
          {!you.canEdit && you.isAuthor && <p className="text-sm text-muted">The text is locked while it is in review or approved.</p>}
          {s.status === "in_review" && you.isAuthor && <p className="text-sm text-muted">Waiting for a manager or reviewer. You can&rsquo;t approve your own work.</p>}
        </div>
      </Window>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Window title="C:\KASAUTI\COMMENTS.LOG" color="blue" bodyClassName="space-y-3 p-4 sm:p-5">
          {d.comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
          <ul className="space-y-2">
            {d.comments.map((c) => (
              <li key={c.id} className="border-2 border-ink bg-card p-3">
                <p className="font-mono text-xs text-muted">
                  {c.author_name} · {ROLE_LABEL[c.author_role]} · {when(c.created_at)}
                  {c.finding_ref ? ` · on ${c.finding_ref}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{c.body}</p>
              </li>
            ))}
          </ul>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="block font-mono text-xs font-bold uppercase tracking-wider" htmlFor="new-comment">
              Add a comment
            </label>
            <textarea id="new-comment" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} className="w-full border-2 border-ink bg-card p-2" />
            <Button type="submit" size="sm" disabled={busy || !comment.trim()}>
              Comment
            </Button>
          </form>
        </Window>

        <Window title="C:\KASAUTI\VERSIONS.LOG" color="yellow" bodyClassName="space-y-3 p-4 sm:p-5">
          <ol className="space-y-3">
            {[...d.versions].reverse().map((v) => {
              const prev = d.versions.find((x) => x.n === v.n - 1);
              return (
                <li key={v.n} className="border-2 border-ink bg-card p-3">
                  <p className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
                    <span>
                      <b>v{v.n}</b> · {v.note || "Edited"} · {v.author_name}
                    </span>
                    <span className="text-muted">{when(v.created_at)}</span>
                  </p>
                  {prev ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-mono text-xs underline">What changed from v{prev.n}</summary>
                      <div className="mt-2">
                        <Diff before={prev.text} after={v.text} />
                      </div>
                    </details>
                  ) : (
                    <p className="mt-1 text-sm text-muted">The first version.</p>
                  )}
                </li>
              );
            })}
          </ol>
        </Window>
      </div>

      <Window title="C:\KASAUTI\TRAIL.LOG" color="ink" dark bodyClassName="space-y-4 p-4 sm:p-5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-yellow">Decisions on findings ({d.decisions.length})</p>
          {d.decisions.length === 0 ? (
            <p className="mt-1 text-sm text-paper/70">None logged. Decisions made in the scanner while signed in, with this submission open, appear here.</p>
          ) : (
            <ul className="mt-1 space-y-1 font-mono text-xs text-paper">
              {d.decisions.map((x, i) => (
                <li key={i}>
                  <span className={x.action === "disputed" ? "text-term-red" : x.action === "edited" ? "text-yellow" : "text-term-green"}>[{x.action}]</span> {x.rule} “{x.quote}” · {x.actor_name}
                  {x.intent_override ? " · against the Intent Check" : ""}
                  {x.reason ? ` · ${x.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-yellow">Audit trail</p>
          <ul className="mt-1 space-y-1 font-mono text-xs text-paper">
            {d.audit.map((a, i) => (
              <li key={i}>
                <span className="text-paper/60">{when(a.at)}</span> {a.actor_email} {ACTION_LABEL[a.action] ?? a.action}
                {a.action === "submission.status" ? `: ${String(a.payload.from)} → ${String(a.payload.to)}` : ""}
              </li>
            ))}
          </ul>
          <Link href="/audit" className="mt-2 inline-block font-mono text-xs text-term-green underline">
            Open the full audit log
          </Link>
        </div>
      </Window>
    </div>
  );
}
