"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/retro/Badge";

export type LedgerStatus = "valid" | "expiring" | "expired" | "permanent";

export interface LedgerRow {
  code: string;
  title: string;
  claim: string;
  source: string;
  owner: string;
  verifiedAt: string;
  expiresAt: string | null;
  status: LedgerStatus;
  daysLeft: number | null;
  supersededBy?: string;
  conditions?: string;
}

const STATUS: Record<LedgerStatus, { label: string; tone: BadgeTone }> = {
  valid: { label: "valid", tone: "ok" },
  expiring: { label: "expiring soon", tone: "warn" },
  expired: { label: "expired", tone: "fail" },
  permanent: { label: "no expiry", tone: "info" },
};

const FILTERS: { key: "all" | LedgerStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "valid", label: "Valid" },
  { key: "expiring", label: "Expiring soon" },
  { key: "expired", label: "Expired" },
  { key: "permanent", label: "No expiry" },
];

export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const [filter, setFilter] = useState<"all" | LedgerStatus>("all");
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f.key === "all" ? rows.length : rows.filter((r) => r.status === f.key).length;
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              className={`relative border-2 border-ink px-3 py-1.5 font-mono text-sm shadow-hard-sm press ${on ? "text-term-green" : "bg-card"}`}
            >
              {on && <motion.span layoutId="ledger-filter" className="absolute inset-0 bg-term" transition={{ type: "spring", stiffness: 500, damping: 36 }} />}
              <span className="relative">
                {f.label} ({n})
              </span>
            </button>
          );
        })}
      </div>

      <motion.ul layout className="grid gap-4 md:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {shown.map((r, i) => (
            <motion.li
              layout
              key={r.code}
              id={r.code}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ type: "spring", stiffness: 420, damping: 30, delay: Math.min(i * 0.035, 0.35) }}
              className="scroll-mt-6 border-2 border-ink bg-card shadow-hard-sm target:shadow-hard target:outline-4 target:outline-yellow"
            >
              <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink bg-sunk px-3 py-2">
                <span className="font-mono text-sm font-bold">{r.code}</span>
                <span className="font-medium">{r.title}</span>
                <span className="ml-auto">
                  <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                </span>
              </div>
              <div className="space-y-2 p-4">
                <p className="text-lg">“{r.claim}”</p>
                {r.conditions && <p className="text-sm text-muted">Condition: {r.conditions}</p>}
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
                  <dt className="text-muted">source</dt>
                  <dd>{r.source}</dd>
                  <dt className="text-muted">owner</dt>
                  <dd>{r.owner}</dd>
                  <dt className="text-muted">verified</dt>
                  <dd>{r.verifiedAt}</dd>
                  <dt className="text-muted">expires</dt>
                  <dd>
                    {r.expiresAt ?? "never"}
                    {r.daysLeft !== null && r.status !== "expired" && <span className="text-muted"> · {r.daysLeft} days left</span>}
                    {r.status === "expired" && r.daysLeft !== null && <span className="text-red"> · {-r.daysLeft} days ago</span>}
                  </dd>
                </dl>
                {r.supersededBy && (
                  <a
                    href={`#${r.supersededBy}`}
                    onClick={(e) => {
                      // The target may be hidden by the current filter: show all, then jump.
                      e.preventDefault();
                      setFilter("all");
                      setTimeout(() => (window.location.hash = r.supersededBy!), 60);
                    }}
                    className="inline-block border-2 border-ink bg-yellow px-2 py-1 font-mono text-sm font-bold shadow-hard-sm press"
                  >
                    Replaced by {r.supersededBy} →
                  </a>
                )}
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </div>
  );
}
