import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/retro/Badge";
import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Counter, Pop, Stagger } from "@/components/retro/Motion";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { codeResponsibility, needsImageAnalysis, scoreDraft } from "@/lib/checks/evaluate";
import type { ExpectedFinding } from "@/lib/schemas/brand-pack";

export const metadata: Metadata = { title: "Test set" };

const KIND_LABEL: Record<string, string> = {
  unsupported_claim: "unsupported claim",
  stale_fact: "stale fact",
  voice_drift: "voice drift",
  off_brand_visual: "off-brand visual",
  terminology: "terminology",
  accessibility: "accessibility",
  messaging: "messaging",
};

function Status({ e, hit }: { e: ExpectedFinding; hit: boolean }) {
  if (hit)
    return (
      <Badge tone="ok">
        <Icon name="check" className="h-3 w-3" /> caught
      </Badge>
    );
  if (needsImageAnalysis(e)) return <Badge tone="neutral">image check · stage 11</Badge>;
  if (e.detectedBy === "ai") return <Badge tone="info">AI review · stage 6</Badge>;
  return <Badge tone="fail">missed</Badge>;
}

export default function TestSetPage() {
  const pack = loadBrandPack();
  const drafts = loadTestSet();
  const scored = drafts.map((d) => ({
    d,
    s: scoreDraft(d, runCodeChecks({ text: d.text, images: d.images.map((i) => ({ file: i.file, alt: i.alt, text: i.textInImage })) }, pack).findings),
  }));

  const all = scored.flatMap(({ d, s }) => d.expected.map((e) => ({ e, hit: s.hits.includes(e) })));
  const mine = all.filter((x) => codeResponsibility(x.e));
  const caught = mine.filter((x) => x.hit).length;
  const extras = scored.reduce((n, x) => n + x.s.extras.length, 0);
  const waitingAi = all.filter((x) => !x.hit && x.e.detectedBy === "ai" && !needsImageAnalysis(x.e)).length;
  const waitingImage = all.filter((x) => !x.hit && needsImageAnalysis(x.e)).length;

  return (
    <>
      <PageHeader
        icon="flask"
        title="Test set"
        subtitle="18 drafts written like real agency, in-house and AI-tool copy — each with an answer key of the mistakes hidden inside. This page re-scores the live code checks every time it loads."
        tip={
          <>
            Press <b>Open in scanner</b> on any draft to run it yourself.
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Window title="CODE CHECKS" color="teal" bodyClassName="p-4">
          <p className="font-pixel text-4xl font-bold">
            <Counter value={caught} />/{mine.length}
          </p>
          <p className="text-sm text-muted">issues code is responsible for, caught</p>
        </Window>
        <Window title="FALSE ALARMS" color={extras ? "red" : "teal"} bodyClassName="p-4" delay={0.06}>
          <p className="font-pixel text-4xl font-bold">
            <Counter value={extras} />
          </p>
          <p className="text-sm text-muted">findings outside the answer keys</p>
        </Window>
        <Window title="AI REVIEW" color="blue" bodyClassName="p-4" delay={0.12}>
          <p className="font-pixel text-4xl font-bold">
            <Counter value={waitingAi} />
          </p>
          <p className="text-sm text-muted">need judgement — scored live with npm run eval:ai</p>
        </Window>
        <Window title="IMAGE CHECKS" color="yellow" bodyClassName="p-4" delay={0.18}>
          <p className="font-pixel text-4xl font-bold">
            <Counter value={waitingImage} />
          </p>
          <p className="text-sm text-muted">need pixels — Stage 11</p>
        </Window>
      </div>

      <Window title="C:\KASAUTI\TESTSET.DAT" color="ink" bodyClassName="p-4 sm:p-6">
        <Stagger as="ul" className="grid gap-4 lg:grid-cols-2" gap={0.04}>
          {scored.map(({ d, s }) => (
            <Pop as="li" key={d.id} className="flex flex-col border-2 border-ink bg-card shadow-hard-sm">
              <div className="flex flex-wrap items-center gap-2 border-b-2 border-ink bg-sunk px-3 py-2">
                <span className="font-mono text-sm font-bold">{d.id}</span>
                <span className="font-bold">{d.title}</span>
                <span className="ml-auto font-mono text-xs text-muted">
                  {d.channel} · {d.author}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <p className="line-clamp-3 border-l-4 border-ink pl-3 italic">“{d.text}”</p>
                {d.expected.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm">
                    <Badge tone={s.extras.length ? "fail" : "ok"}>{s.extras.length ? `${s.extras.length} false alarm(s)` : "clean ✓"}</Badge>
                    Clean draft — tests that Kasauti stays quiet.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {d.expected.map((e, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <Status e={e} hit={s.hits.includes(e)} />
                        <Link href={`/rules#${e.rule}`} className="font-mono font-bold underline-offset-2 hover:underline">
                          {e.rule}
                        </Link>
                        <span className="text-muted">{KIND_LABEL[e.kind]}</span>
                        <span className="font-mono">“{e.quote.length > 40 ? `${e.quote.slice(0, 40)}…` : e.quote}”</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-auto pt-2">
                  <ButtonLink href={`/scan?draft=${d.id}`} size="sm" variant="primary">
                    <Icon name="scan" /> Open in scanner
                  </ButtonLink>
                </div>
              </div>
            </Pop>
          ))}
        </Stagger>
      </Window>
    </>
  );
}
