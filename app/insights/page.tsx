import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/retro/Badge";
import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Pop, Stagger } from "@/components/retro/Motion";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { loadBrandPack } from "@/lib/brand-pack";

export const metadata: Metadata = { title: "Insights" };

const STEPS = [
  ["DETECT", "Overrides, disputes and repeat edits mark a rule as unclear."],
  ["DRAFT", "Kasauti proposes a sharper rule with good and bad examples."],
  ["REPLAY", "The new rule runs on past approved content to preview what would change."],
  ["DECIDE", "The guideline owner approves it. The rule is versioned."],
];

export default function InsightsPage() {
  const { rules } = loadBrandPack();
  const watched = rules.filter((r) => r.knownUnclear);

  return (
    <div className="space-y-8">
      <PageHeader icon="chart" title="Insights" subtitle="Guideline Debt Radar — find the rules people keep arguing with.">
        <Badge tone="warn">Round 3</Badge>
      </PageHeader>

      <Window title="C:\KASAUTI\RADAR.EXE" color="red" bodyClassName="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
        <div>
          <p className="font-mono text-sm tracking-wide text-muted">OVERRIDE RATE BY RULE // waiting for decisions</p>
          <ul className="mt-4 space-y-4">
            {watched.map((r) => (
              <li key={r.code}>
                <Link href={`/rules#${r.code}`} className="flex items-center justify-between gap-2 font-bold hover:underline">
                  <span>
                    {r.code} · {r.title}
                  </span>
                  <Badge tone="warn">watching</Badge>
                </Link>
                <div className="mt-1.5 h-5 border-2 border-ink bg-card">
                  <div className="progress-stripes progress-run h-full w-[12%] opacity-60" />
                </div>
                <p className="mt-1 text-sm italic text-muted">“{r.body}” — too vague to apply the same way twice.</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-2 border-dashed border-ink bg-card p-3 text-sm">
            Every Accept, Edit and Dispute in the scanner becomes a data point. Once decisions are stored (Stage 2), Radar ranks rules by how often
            people override them.
          </p>
        </div>
        <div className="border-2 border-ink bg-term p-5 text-paper">
          <p className="font-mono text-yellow">how_it_works.txt</p>
          <Stagger as="ol" className="mt-4 space-y-4" gap={0.1}>
            {STEPS.map(([title, body], i) => (
              <Pop as="li" key={title}>
                <span className="font-bold text-yellow">
                  {i + 1} {title}
                </span>{" "}
                <span className="text-paper/85">{body}</span>
              </Pop>
            ))}
          </Stagger>
        </div>
      </Window>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/scan?draft=D07" variant="primary">
          <Icon name="scan" /> Dispute a finding in the scanner
        </ButtonLink>
        <ButtonLink href="/rules">Open the Rulebook</ButtonLink>
      </div>
    </div>
  );
}
