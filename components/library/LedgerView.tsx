"use client";

import { AnimatePresence } from "motion/react";
import { useMemo, useState } from "react";
import { EvidenceEditor } from "@/components/library/Editors";
import { LedgerTable, type LedgerRow } from "@/components/library/LedgerTable";
import { Badge } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Counter } from "@/components/retro/Motion";
import { Window } from "@/components/retro/Window";
import { clearCustom, commitSettings, parseCustom, startSettings, useCustomRaw } from "@/lib/custom-pack";
import type { BrandPackData, Evidence } from "@/lib/schemas/brand-pack";

const EXPIRING_DAYS = 45;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const formatDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function toRows(evidence: Evidence[], today: string): LedgerRow[] {
  return evidence.map((e) => {
    const daysLeft = e.expiresAt ? dayDiff(e.expiresAt, today) : null;
    const status = !e.expiresAt ? "permanent" : e.expiresAt < today ? "expired" : daysLeft! <= EXPIRING_DAYS ? "expiring" : "valid";
    return {
      code: e.code,
      title: e.title,
      claim: e.claim,
      source: e.source,
      owner: `${e.owner.name} (${e.owner.role})`,
      verifiedAt: formatDay(e.verifiedAt),
      expiresAt: e.expiresAt ? formatDay(e.expiresAt) : null,
      status,
      daysLeft,
      supersededBy: e.supersededBy,
      conditions: e.conditions,
      addedInReview: e.tags.includes("added-in-review"),
    };
  });
}

/**
 * The Claim Ledger. Uses the brand pack saved in this browser (Customise page, or proof added
 * while reviewing a scan) when there is one — the database replaces this in Stage 2.
 */
export function LedgerView({ defaults, today }: { defaults: BrandPackData; today: string }) {
  const raw = useCustomRaw();
  const custom = useMemo(() => parseCustom(raw), [raw]);
  const settings = startSettings(custom, defaults, today);
  const ev = settings.pack.evidence;
  const day = settings.today;
  const [adding, setAdding] = useState(false);
  const entries = useMemo(() => new Map(ev.map((e) => [e.code, e])), [ev]);
  const nextCode = `KLE-${String(Math.max(0, ...ev.map((e) => Number(e.code.slice(4)) || 0)) + 1).padStart(2, "0")}`;
  const saveEvidence = (list: Evidence[]) => commitSettings({ ...settings, pack: { ...settings.pack, evidence: list } });
  const rows = useMemo(() => toRows(ev, day), [ev, day]);
  const expired = rows.filter((r) => r.status === "expired").length;
  const expiring = rows.filter((r) => r.status === "expiring").sort((a, b) => a.daysLeft! - b.daysLeft!);

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Window title="ENTRIES" color="teal" bodyClassName="p-4">
          <p className="font-num text-4xl font-bold">
            <Counter value={rows.length} />
          </p>
        </Window>
        <Window title="EXPIRED" color="red" bodyClassName="p-4" delay={0.06}>
          <p className="font-num text-4xl font-bold">
            <Counter value={expired} />
          </p>
        </Window>
        <Window title="EXPIRING SOON" color="yellow" bodyClassName="p-4" delay={0.12}>
          <p className="font-num text-4xl font-bold">
            <Counter value={expiring.length} />
          </p>
        </Window>
      </div>

      {expiring.length > 0 && (
        <Window title="C:\KASAUTI\EXPIRING.TXT" color="yellow" className="mb-6" bodyClassName="p-4 space-y-2">
          <p className="font-bold">Expiring within {EXPIRING_DAYS} days — re-verify or let them lapse:</p>
          <ul className="flex flex-wrap gap-2">
            {expiring.map((r) => (
              <li key={r.code}>
                <a href={`#${r.code}`} className="inline-flex items-center gap-2 border-2 border-ink bg-card px-2 py-1 font-mono text-sm shadow-hard-sm press">
                  <b>{r.code}</b> {r.title}
                  <Badge tone="warn">
                    {r.daysLeft} day{r.daysLeft === 1 ? "" : "s"}
                  </Badge>
                  <span className="text-muted">owner: {r.owner}</span>
                </a>
              </li>
            ))}
          </ul>
        </Window>
      )}

      <Window title="C:\KASAUTI\LEDGER.DAT" color="teal">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <p className="max-w-3xl flex-1 text-muted">
            {custom ? "Your edited ledger, saved in this browser — every scan checks against it. " : "Press Edit on any entry to change it, or add new proof. "}
            Claims with no entry here — like “#1” or “India’s most trusted” — are flagged as unsupported.
          </p>
          <Button variant="primary" onClick={() => setAdding(true)} disabled={adding || ev.length >= 99}>
            <Icon name="ledger" /> Add entry
          </Button>
          {custom && (
            <Button size="sm" onClick={() => window.confirm("Reset rules, ledger and settings to the original brand pack?") && clearCustom()}>
              Reset to original
            </Button>
          )}
        </div>
        <AnimatePresence>
          {adding && (
            <div className="mb-5 border-2 border-ink bg-card p-4 shadow-hard-sm">
              <p className="mb-3 font-pixel text-lg font-bold">New entry · {nextCode}</p>
              <EvidenceEditor
                entry={null}
                code={nextCode}
                today={day}
                onCancel={() => setAdding(false)}
                onSave={(e) => {
                  const err = saveEvidence([...ev, e]);
                  if (!err) setAdding(false);
                  return err;
                }}
              />
            </div>
          )}
        </AnimatePresence>
        <LedgerTable
          rows={rows}
          editing={{
            entries,
            today: day,
            onSave: (e) => saveEvidence(ev.map((x) => (x.code === e.code ? e : x))),
            onDelete: (code) => saveEvidence(ev.filter((x) => x.code !== code)),
          }}
        />
      </Window>
    </>
  );
}
