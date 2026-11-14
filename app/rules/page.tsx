import type { Metadata } from "next";
import { RuleBrowser } from "@/components/library/RuleBrowser";
import { Counter } from "@/components/retro/Motion";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { loadBrandPack } from "@/lib/brand-pack";

export const metadata: Metadata = { title: "Rulebook" };

export default function RulesPage() {
  const { rules, brand } = loadBrandPack();
  const code = rules.filter((r) => r.checkType === "code").length;
  const ai = rules.filter((r) => r.checkType === "ai").length;
  const hybrid = rules.length - code - ai;

  return (
    <>
      <PageHeader
        icon="rules"
        title="Rulebook"
        subtitle={`${brand.name}'s ${rules.length} numbered rules. Every finding Kasauti shows must cite one of these codes — no citation, no finding.`}
        tip={<>Code wherever a rule can be written as code; AI only where judgement is needed.</>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {(
          [
            ["Code checks", code, "Repeatable, can't hallucinate", "teal"],
            ["Code + AI", hybrid, "Code finds it, AI judges it", "ink"],
            ["AI checks", ai, "Judgement, always verified", "blue"],
          ] as const
        ).map(([label, n, note, color], i) => (
          <Window key={label} title={label.toUpperCase()} color={color} bodyClassName="p-4" delay={i * 0.06}>
            <p className="font-pixel text-4xl font-bold">
              <Counter value={n} />
            </p>
            <p className="text-sm text-muted">{note}</p>
          </Window>
        ))}
      </div>

      <Window title="C:\KASAUTI\RULES.TXT" color="blue">
        <div className="mb-5 border-2 border-ink bg-card p-4">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-teal">Brand voice</p>
          <p className="mt-1 text-lg">{brand.voice.summary}</p>
        </div>
        <RuleBrowser rules={rules} />
      </Window>
    </>
  );
}
