import type { Metadata } from "next";
import { Badge } from "@/components/retro/Badge";
import { ButtonLink } from "@/components/retro/Button";
import { Icon } from "@/components/retro/Icon";
import { Pop, Stagger } from "@/components/retro/Motion";
import { PageHeader } from "@/components/retro/PageHeader";
import { Window } from "@/components/retro/Window";
import { MODELS } from "@/lib/nvidia/config";

export const metadata: Metadata = { title: "How it works" };

const FLOW = [
  { n: "01", title: "Define", body: "Admin loads guidelines, facts, terms and assets. They become numbered rules and evidence entries." },
  { n: "02", title: "Submit", body: "Creator uploads content with an Intent Card: purpose, audience and the message that must survive." },
  { n: "03", title: "Scan", body: "Code checks (terms, prices, expiry, readability) plus AI checks grounded in retrieved sources." },
  { n: "04", title: "Explain", body: "Each finding shows the exact text, the rule it breaks, a confidence level and a suggested fix." },
  { n: "05", title: "Decide", body: "Creator accepts or disputes. Manager and reviewer comment and approve. Every change is versioned." },
  { n: "06", title: "Learn", body: "Overrides and repeat mistakes feed Insights and the Radar, which sharpens the rules in step 01." },
];

const PIPE = ["Draft + Intent Card", "Parser: sentences, claims, images", "Code checks | Retrieval + AI check", "VERIFIER", "Findings with citations", "Human review and approval"];

const TRUST = [
  { title: "No citation, no finding", body: "A finding appears only if it names a real rule or evidence entry and quotes text that exists in the draft." },
  { title: "Humans decide", body: "AI flags and suggests. It never publishes, rejects or edits by itself. Every decision belongs to a person." },
  { title: "Confidential by default", body: "Emails, phone numbers, PAN, Aadhaar, cards, UPI IDs and [[marked]] spans are masked before any model call." },
  { title: "AI is disclosed", body: "Each finding is labelled code check or AI-assisted, with the model used." },
];

const STAGES: [string, string, number, "done" | "live" | "next" | "later"][] = [
  ["Brand pack + test set", "18 drafts · 27 rules · 16 proofs", 100, "done"],
  ["Code checks engine", "26/26 caught · 0 false alarms", 100, "done"],
  ["NVIDIA client layer", "9/9 live model checks", 100, "done"],
  ["Review screen", "This interface", 80, "live"],
  ["Image reading (OCR)", "NVIDIA vision, live in Scan", 60, "live"],
  ["Retrieval over rules + proof", "10/10 on the retrieval check", 100, "done"],
  ["AI review + Verifier", "NVIDIA reviewer; ungrounded findings dropped", 85, "live"],
  ["Database, approvals, audit log", "Stages 2 + 9", 10, "next"],
  ["Intent Lock + Radar", "Round 3", 0, "later"],
];

const TONE = { done: "ok", live: "warn", next: "info", later: "neutral" } as const;

export default function HowPage() {
  return (
    <div className="space-y-8">
      <PageHeader icon="help" title="How it works" subtitle="The brief asks for a reviewer. We are building a verifier — nothing an AI says reaches a person until it is tested against the brand's own sources." />

      <Window title="C:\KASAUTI\WORKFLOW.BAT" color="teal">
        <h2 className="font-pixel text-2xl font-bold">From draft to approved, in six steps</h2>
        <Stagger className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FLOW.map((s, i) => {
            const last = i === FLOW.length - 1;
            return (
              <Pop key={s.n} className={`border-2 border-ink p-4 shadow-hard-sm ${last ? "bg-term text-paper" : "bg-card"}`}>
                <p className="font-pixel text-2xl font-bold">
                  <span className={last ? "text-yellow" : "text-red"}>{s.n}</span> <span className={last ? "text-term-green" : ""}>{s.title}</span>
                </p>
                <p className={`mt-2 ${last ? "text-paper/85" : "text-muted"}`}>{s.body}</p>
              </Pop>
            );
          })}
        </Stagger>
      </Window>

      <Window title="C:\KASAUTI\VERIFIER.EXE" color="red" bodyClassName="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="font-pixel text-2xl font-bold">Hardest problem: findings you can trust</h2>
          <p className="mt-3 text-lg text-muted">
            A model can cite a rule that does not apply, or misquote the draft. A false finding erodes trust in every other finding.
          </p>
          <p className="mt-4 text-lg font-bold">Nothing reaches the user until a Verifier tests it.</p>
          <ol className="mt-3 space-y-2 border-2 border-ink bg-card p-4">
            <li>
              <b>1.</b> The rule or evidence ID must exist in the approved library.
            </li>
            <li>
              <b>2.</b> The quoted text must appear in the draft, character for character.
            </li>
            <li>
              <b>3.</b> The suggested fix must pass the rules again, and the Intent Check.
            </li>
          </ol>
          <p className="mt-3 font-bold text-red">Fail any test: the finding is dropped or marked “needs human review”.</p>
        </div>
        <Stagger className="flex flex-col items-stretch gap-1.5 border-2 border-ink bg-term p-4" gap={0.12}>
          {PIPE.map((p, i) => (
            <Pop key={p}>
              {i > 0 && <p className="text-center font-mono text-term-green">▼</p>}
              <p
                className={`border-2 px-3 py-2 text-center font-mono text-sm ${
                  p === "VERIFIER" ? "border-yellow bg-yellow font-bold text-ink" : "border-term-green text-paper"
                }`}
              >
                {p}
              </p>
            </Pop>
          ))}
        </Stagger>
      </Window>

      <Window title="C:\KASAUTI\TRUST.SYS" color="ink" dark>
        <h2 className="font-pixel text-2xl font-bold text-term-green">Automation with a human in charge</h2>
        <Stagger className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t, i) => (
            <Pop key={t.title} className="border-2 border-term-green p-4">
              <p className="font-mono text-xs text-yellow">RULE 0{i + 1}</p>
              <p className="mt-1 font-pixel text-lg font-bold">{t.title}</p>
              <p className="mt-2 text-sm text-paper/80">{t.body}</p>
            </Pop>
          ))}
        </Stagger>
        <p className="mt-4 font-mono text-sm text-yellow">&gt; when confidence is low: “needs human review”, never a guess_</p>
      </Window>

      <div className="grid gap-8 lg:grid-cols-2">
        <Window title="C:\KASAUTI\STACK.CFG" color="blue">
          <h2 className="font-pixel text-xl font-bold">AI used — NVIDIA only</h2>
          <ul className="mt-4 divide-y-2 divide-ink border-2 border-ink bg-card">
            {[
              ["Reasoning", MODELS.reasoning],
              ["Fast fallback", MODELS.fast],
              ["Embeddings", MODELS.embed],
              ["Reading images", MODELS.vision],
              ["Content safety", MODELS.safety],
            ].map(([job, model]) => (
              <li key={job} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-bold">{job}</span>
                <span className="font-mono text-xs text-muted">{model}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-2 border-ink bg-yellow px-3 py-2 font-bold">Code wherever a rule can be written as code. AI only where judgement is needed.</p>
        </Window>

        <Window title="C:\KASAUTI\PLAN.BAT" color="red" delay={0.06}>
          <h2 className="font-pixel text-xl font-bold">Build status</h2>
          <ul className="mt-4 space-y-3">
            {STAGES.map(([name, note, pct, s]) => (
              <li key={name}>
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="font-bold">{name}</span> <span className="text-sm text-muted">· {note}</span>
                  </span>
                  <Badge tone={TONE[s]}>{s}</Badge>
                </div>
                <div className="mt-1 h-3 border-2 border-ink bg-card">
                  <div className="progress-stripes h-full" style={{ width: `${pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Window>
      </div>

      <div className="text-center">
        <ButtonLink href="/scan?draft=D01" variant="primary" size="lg">
          See it work <Icon name="arrow" className="h-5 w-5" />
        </ButtonLink>
      </div>
    </div>
  );
}
