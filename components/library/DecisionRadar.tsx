"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/retro/Badge";
import { Button, ButtonLink } from "@/components/retro/Button";
import { Window } from "@/components/retro/Window";
import { clearDecisions, parseDecisions, ruleStats, UNCLEAR_MIN, UNCLEAR_RATE, useDecisionsRaw } from "@/lib/decision-log";

/** Real accept / edit / dispute history from this browser, ranked by how often people override a rule. */
export function DecisionRadar({ titles }: { titles: Record<string, string> }) {
  const raw = useDecisionsRaw();
  const entries = useMemo(() => parseDecisions(raw), [raw]);
  const stats = useMemo(() => ruleStats(entries), [entries]);
  const overrides = entries.filter((e) => e.intentOverride).length;
  const recent = entries.slice(-6).reverse();

  return (
    <Window title="C:\KASAUTI\DECISIONS.LOG" color="teal" bodyClassName="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-pixel text-xl font-bold">Your decisions, by rule</h2>
          <p className="text-sm text-muted">
            Live from the scanner: every Accept, Edit and Dispute in this browser. A rule is marked <b>unclear</b> once it has {UNCLEAR_MIN}+ decisions and{" "}
            {Math.round(UNCLEAR_RATE * 100)}%+ were edited or disputed.
          </p>
        </div>
        {entries.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => clearDecisions()}>
            Clear log
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="space-y-3 border-2 border-dashed border-ink bg-card p-4">
          <p className="font-medium">No decisions yet.</p>
          <p className="text-sm text-muted">Open an example, then Accept, Edit or Dispute a few findings. They show up here straight away.</p>
          <ButtonLink href="/scan?draft=S1" variant="primary" size="sm">
            Open Example 1
          </ButtonLink>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {stats.map((s) => (
              <li key={s.rule}>
                <Link href={`/rules#${s.rule}`} className="flex flex-wrap items-center justify-between gap-2 font-bold hover:underline">
                  <span>
                    {s.rule} · {titles[s.rule] ?? ""}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-num text-sm font-normal text-muted">
                      {s.total} decision{s.total === 1 ? "" : "s"}
                    </span>
                    {s.unclear ? <Badge tone="fail">unclear</Badge> : s.total < UNCLEAR_MIN ? <Badge tone="neutral">too few to judge</Badge> : <Badge tone="ok">clear</Badge>}
                  </span>
                </Link>
                <div className="mt-1.5 flex h-5 border-2 border-ink bg-card" role="img" aria-label={`${s.accepted} accepted, ${s.edited} edited, ${s.disputed} disputed`}>
                  <div className="h-full bg-teal" style={{ width: `${(s.accepted / s.total) * 100}%` }} />
                  <div className="h-full bg-yellow" style={{ width: `${(s.edited / s.total) * 100}%` }} />
                  <div className="h-full bg-red" style={{ width: `${(s.disputed / s.total) * 100}%` }} />
                  <div className="h-full bg-sunk" style={{ width: `${(s.noted / s.total) * 100}%` }} />
                </div>
                <p className="mt-1 font-mono text-xs text-muted">
                  {s.accepted} accepted · {s.edited} edited · {s.disputed} disputed · override rate {Math.round(s.overrideRate * 100)}%
                  {s.intentOverrides > 0 ? ` · ${s.intentOverrides} accepted against the Intent Check` : ""}
                </p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
            <span>
              <span className="mr-1 inline-block h-3 w-3 border-2 border-ink bg-teal align-middle" /> accepted
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 border-2 border-ink bg-yellow align-middle" /> edited
            </span>
            <span>
              <span className="mr-1 inline-block h-3 w-3 border-2 border-ink bg-red align-middle" /> disputed
            </span>
            {overrides > 0 && <span className="font-bold">{overrides} fix{overrides === 1 ? "" : "es"} accepted against the Intent Check</span>}
          </div>
          <div className="border-2 border-ink bg-term p-3 font-mono text-xs text-paper">
            <p className="text-yellow">latest decisions</p>
            <ul className="mt-1 space-y-1">
              {recent.map((e, i) => (
                <li key={`${e.t}-${i}`} className="truncate">
                  <span className={e.action === "disputed" ? "text-term-red" : e.action === "edited" ? "text-yellow" : "text-term-green"}>[{e.action}]</span> {e.rule} “{e.quote}”
                  {e.reason ? ` — ${e.reason}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <p className="text-xs text-muted">Kept in this browser only. A shared database, so the whole team feeds one Radar, is on the roadmap.</p>
    </Window>
  );
}
