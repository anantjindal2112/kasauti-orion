"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Window } from "@/components/retro/Window";
import { SignInNotice } from "@/components/workflow/SignInNotice";
import { api, useMe, when } from "@/lib/client-api";

interface Entry {
  id: string;
  action: string;
  actor_email: string | null;
  actor_name: string | null;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown>;
  at: string;
}

const detail = (e: Entry) => {
  const p = e.payload;
  if (e.action === "submission.status") return `${String(p.from)} → ${String(p.to)}${p.note ? ` · “${String(p.note)}”` : ""}`;
  if (e.action === "submission.created") return String(p.title ?? "");
  if (e.action === "submission.version") return `v${String(p.n)} · ${String(p.note ?? "")}`;
  if (e.action.startsWith("decision.")) return `${String(p.rule)} “${String(p.quote ?? "")}”${p.intentOverride ? " · against the Intent Check" : ""}`;
  if (e.action === "comment.created") return p.findingRef ? `on ${String(p.findingRef)}` : "";
  return "";
};

export function AuditView() {
  const { me } = useMe();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [scope, setScope] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (me.status !== "user") return;
    void api<{ entries: Entry[]; scope: string }>("GET", "/api/audit?limit=200").then((r) => {
      if (r.ok) {
        setEntries(r.data.entries);
        setScope(r.data.scope);
      } else setError(r.error);
    });
  }, [me.status]);

  if (me.status !== "user") return <SignInNotice state={me.status} />;
  return (
    <Window title="C:\KASAUTI\AUDIT.LOG" color="ink" dark bodyClassName="space-y-3 p-4 sm:p-5">
      <p className="font-mono text-xs text-paper/70">
        {scope === "everyone" ? "Everything everyone did, newest first." : "Your own actions, newest first. Managers, reviewers and admins see everyone's."} Each line is written in the same step as the change it records.
      </p>
      {error && <p className="text-term-red">{error}</p>}
      {entries === null && !error && <p className="font-mono text-sm text-paper/70">Loading…</p>}
      <ul className="space-y-1 font-mono text-xs text-paper">
        {entries?.map((e) => (
          <li key={e.id} className="break-words">
            <span className="text-paper/60">{when(e.at)}</span> <span className="text-term-green">{e.actor_name ?? e.actor_email ?? "system"}</span> · {e.action}
            {detail(e) && <span className="text-yellow"> · {detail(e)}</span>}
            {e.target_type === "submission" && e.target_id && (
              <>
                {" "}
                <Link href={`/submissions/${e.target_id}`} className="text-term-green underline">
                  open
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </Window>
  );
}
