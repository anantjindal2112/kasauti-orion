"use client";

import { useMemo } from "react";
import { RuleBrowser } from "@/components/library/RuleBrowser";
import { Badge } from "@/components/retro/Badge";
import { Button } from "@/components/retro/Button";
import { Counter } from "@/components/retro/Motion";
import { Window } from "@/components/retro/Window";
import { clearCustom, commitSettings, parseCustom, startSettings, useCustomRaw } from "@/lib/custom-pack";
import type { BrandPackData } from "@/lib/schemas/brand-pack";

/** The Rulebook, editable in place. Edits save to this browser's brand pack, which every scan uses. */
export function RulebookView({ defaults, today }: { defaults: BrandPackData; today: string }) {
  const raw = useCustomRaw();
  const saved = useMemo(() => parseCustom(raw), [raw]);
  const settings = startSettings(saved, defaults, today);
  const disabled = useMemo(() => new Set(settings.disabled), [settings.disabled]);
  const rules = settings.rules;
  const on = rules.filter((r) => !disabled.has(r.code));
  const count = (t: string) => on.filter((r) => r.checkType === t).length;

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Code checks", count("code"), "Repeatable, can't hallucinate", "teal"],
            ["Code + AI", count("hybrid"), "Code finds it, AI judges it", "ink"],
            ["AI checks", count("ai"), "Judgement, always verified", "blue"],
          ] as const
        ).map(([label, n, note, color], i) => (
          <Window key={label} title={label.toUpperCase()} color={color} bodyClassName="p-4" delay={i * 0.06}>
            <p className="font-num text-4xl font-bold">
              <Counter value={n} />
            </p>
            <p className="text-sm text-muted">{note}</p>
          </Window>
        ))}
      </div>

      <Window title="C:\KASAUTI\RULES.TXT" color="blue">
        <div className="mb-5 flex flex-wrap items-center gap-3 border-2 border-ink bg-card p-3 text-sm">
          {saved ? (
            <>
              <Badge tone="ok">edited</Badge>
              <span>
                Your edited rulebook ({on.length} of {rules.length} rules on), saved in this browser. Every scan uses it.
              </span>
              <Button size="sm" className="ml-auto" onClick={() => window.confirm("Reset rules, ledger and settings to the original brand pack?") && clearCustom()}>
                Reset to original
              </Button>
            </>
          ) : (
            <span>
              Press <b>Edit</b> on any rule to change its wording, severity or examples, or <b>ON/OFF</b> to switch it off. Changes apply to the next scan.
            </span>
          )}
        </div>
        <div className="mb-5 border-2 border-ink bg-card p-4">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-teal">Brand voice</p>
          <p className="mt-1 text-lg">{settings.pack.brand.voice.summary}</p>
        </div>
        <RuleBrowser
          rules={rules}
          editing={{
            disabled,
            onSave: (rule) => commitSettings({ ...settings, rules: rules.map((r) => (r.code === rule.code ? rule : r)) }),
            onToggle: (code) =>
              commitSettings({
                ...settings,
                disabled: disabled.has(code) ? settings.disabled.filter((c) => c !== code) : [...settings.disabled, code],
              }),
          }}
        />
      </Window>
    </>
  );
}
