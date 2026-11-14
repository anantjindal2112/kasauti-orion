import Link from "next/link";
import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { NAV } from "@/components/retro/links";
import { Counter, Pop, Stagger, TypeLines } from "@/components/retro/Motion";
import { Window } from "@/components/retro/Window";
import { loadBrandPack, loadTestSet } from "@/lib/brand-pack";
import { runCodeChecks } from "@/lib/checks";
import { codeResponsibility, scoreDraft } from "@/lib/checks/evaluate";

const STEPS = [
  { n: "01", title: "Pick a draft", body: "Load one of 18 demo drafts — or paste your own copy and add images." },
  { n: "02", title: "Run the scan", body: "Code checks run instantly; NVIDIA vision reads any text inside images." },
  { n: "03", title: "Decide", body: "Each finding cites a rule and its proof. Accept the fix, edit it, or dispute it." },
];

export default function Home() {
  const pack = loadBrandPack();
  const drafts = loadTestSet();
  const scores = drafts.map((d) =>
    scoreDraft(d, runCodeChecks({ text: d.text, images: d.images.map((i) => ({ file: i.file, alt: i.alt, text: i.textInImage })) }, pack).findings),
  );
  const mine = drafts.flatMap((d, i) => d.expected.filter(codeResponsibility).map((e) => scores[i].hits.includes(e)));
  const extras = scores.reduce((n, s) => n + s.extras.length, 0);

  return (
    <div className="space-y-8">
      {/* Hero */}
      <Window title="C:\KASAUTI\KASAUTI.EXE" color="teal" bodyClassName="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.25fr_1fr] lg:items-center">
        <div>
          <p className="font-mono text-sm tracking-widest text-teal">INKLOOM AI // BRAND GOVERNANCE</p>
          <h1 className="mt-3 font-pixel text-6xl font-bold leading-none sm:text-7xl">KASAUTI</h1>
          <p className="mt-3 text-2xl font-medium text-red">
            <span className="font-hindi">कसौटी</span> · the touchstone
          </p>
          <p className="mt-6 text-2xl font-medium leading-snug">Brand truth, tested before it&rsquo;s published.</p>
          <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted">
            Every finding cites an approved source, every claim carries proof, and every fix keeps the creator&rsquo;s intent.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/scan?draft=D01" variant="primary" size="lg">
              <Icon name="arrow" className="h-5 w-5" /> Try the deck example
            </ButtonLink>
            <ButtonLink href="/scan" size="lg">
              <Icon name="scan" className="h-5 w-5" /> Scan your own copy
            </ButtonLink>
          </div>
          <p className="mt-4 font-mono text-sm text-muted">
            Demo brand: {pack.brand.name} (fictional) · {pack.rules.length} rules · {pack.evidence.length} ledger entries · {drafts.length} test drafts
          </p>
        </div>

        <div className="border-2 border-ink bg-term p-5 font-mono text-sm shadow-hard sm:text-base" aria-label="Example scan log">
          <p className="text-yellow">scan.log</p>
          <p className="mt-4 text-yellow">&gt; kasauti scan draft_v3.txt</p>
          <TypeLines
            className="mt-2 space-y-1.5 whitespace-pre"
            start={0.5}
            lines={[
              { text: "[ OK ] claim 01 · VERIFIED", className: "text-term-green" },
              { text: "[WARN] claim 02 · STALE", className: "text-yellow" },
              { text: "       proof KLE-07 expired", className: "text-term-green" },
              { text: "[FAIL] claim 03 · NO EVIDENCE", className: "text-term-red" },
              { text: "3 claims tested. 0 published.", className: "pt-2 text-term-green" },
              { text: "Human review required.", className: "text-term-green" },
            ]}
          />
          <p className="mt-2 text-yellow">
            &gt; <span className="cursor-blink">_</span>
          </p>
        </div>
      </Window>

      {/* Numbers */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "RULES", value: pack.rules.length, suffix: "", color: "bg-teal text-paper", note: "every finding cites one" },
          { label: "PROOFS", value: pack.evidence.length, suffix: "", color: "bg-blue text-paper", note: "each with an owner + expiry" },
          { label: "CAUGHT", value: mine.filter(Boolean).length, suffix: `/${mine.length}`, color: "bg-yellow text-ink", note: "code checks on the test set" },
          { label: "FALSE ALARMS", value: extras, suffix: "", color: "bg-red text-paper", note: "clean drafts stay clean" },
        ].map((s) => (
          <Pop key={s.label} className="border-2 border-ink bg-paper shadow-hard">
            <p className={`border-b-2 border-ink px-3 py-1.5 font-pixel text-sm tracking-wider ${s.color}`}>{s.label}</p>
            <div className="p-4">
              <p className="font-num text-5xl font-bold">
                <Counter value={s.value} />
                <span className="text-muted">{s.suffix}</span>
              </p>
              <p className="mt-1 text-sm text-muted">{s.note}</p>
            </div>
          </Pop>
        ))}
      </Stagger>

      {/* Start here */}
      <Window title="C:\KASAUTI\START_HERE.TXT" color="yellow" bodyClassName="p-6">
        <h2 className="font-pixel text-2xl font-bold">Start here — three steps, about a minute</h2>
        <Stagger as="ol" className="mt-5 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <Pop as="li" key={s.n} className="border-2 border-ink bg-card p-4 shadow-hard-sm">
              <p className="font-num text-3xl font-bold text-red">{s.n}</p>
              <p className="mt-1 text-lg font-bold">{s.title}</p>
              <p className="mt-1 text-muted">{s.body}</p>
            </Pop>
          ))}
        </Stagger>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink href="/scan?draft=D01" variant="primary">
            Start with D01 <Icon name="arrow" />
          </ButtonLink>
          <span className="text-sm text-muted">The taskbar at the bottom takes you to every page, from anywhere.</span>
        </div>
      </Window>

      {/* Desktop icons */}
      <section aria-labelledby="explore">
        <h2 id="explore" className="mb-4 font-pixel text-2xl font-bold">
          Explore
        </h2>
        <Stagger as="ul" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV.slice(1).map((item) => (
            <Pop as="li" key={item.href}>
              <Link href={item.href} className="group flex h-full items-start gap-4 border-2 border-ink bg-paper p-4 shadow-hard-sm press">
                <span className="grid h-14 w-14 shrink-0 place-items-center border-2 border-ink bg-yellow shadow-hard-sm transition-transform duration-200 group-hover:-rotate-6">
                  <Icon name={item.icon} className="h-7 w-7" />
                </span>
                <span>
                  <span className="block font-mono text-xs text-muted">{item.file}</span>
                  <span className="block text-lg font-bold group-hover:underline">{item.label}</span>
                  <span className="block text-sm text-muted">{item.blurb}</span>
                </span>
              </Link>
            </Pop>
          ))}
        </Stagger>
      </section>
    </div>
  );
}
