const scanLog: { tag: string; text: string; tone: string }[] = [
  { tag: "[ OK ]", text: "claim 01 · VERIFIED", tone: "text-term-green" },
  { tag: "[WARN]", text: "claim 02 · STALE — proof KLE-12 expired", tone: "text-yellow" },
  { tag: "[FAIL]", text: "claim 03 · NO EVIDENCE", tone: "text-[#ff8a7a]" },
];

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
      <section className="w-full max-w-5xl border-2 border-ink bg-paper shadow-hard">
        <header className="flex items-center justify-between bg-teal px-4 py-2 text-paper">
          <span className="font-pixel text-sm tracking-wider sm:text-base">C:\KASAUTI\KASAUTI.EXE</span>
          <span aria-hidden className="flex gap-1.5">
            {["_", "□", "×"].map((c) => (
              <span key={c} className="grid h-6 w-6 place-items-center border-2 border-ink bg-paper text-xs text-ink">
                {c}
              </span>
            ))}
          </span>
        </header>

        <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <p className="font-mono text-sm tracking-widest text-teal">INKLOOM AI // BRAND GOVERNANCE</p>
            <h1 className="mt-3 font-pixel text-6xl font-bold leading-none sm:text-7xl">KASAUTI</h1>
            <p className="mt-3 text-2xl font-medium text-red">कसौटी · the touchstone</p>
            <p className="mt-6 text-2xl font-medium leading-snug">Brand truth, tested before it&rsquo;s published.</p>
            <p className="mt-3 max-w-xl text-lg leading-relaxed text-muted">
              Every finding cites an approved source, every claim carries proof, and every fix keeps the
              creator&rsquo;s intent.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="border-2 border-ink bg-yellow px-4 py-2 font-bold shadow-[3px_3px_0_0_var(--ink)]">
                ROUND 2 · THE BUILD
              </span>
              <span className="border-2 border-ink bg-card px-4 py-2 font-bold">Team Orion</span>
            </div>
          </div>

          <div className="border-2 border-ink bg-term p-5 font-mono text-sm shadow-hard sm:text-base">
            <p className="text-yellow">scan.log</p>
            <p className="mt-4 text-yellow">&gt; kasauti scan draft_v3.txt</p>
            <ul className="mt-2 space-y-1.5">
              {scanLog.map((l) => (
                <li key={l.text} className={l.tone}>
                  {l.tag} {l.text}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-term-green">3 claims tested. 0 published.</p>
            <p className="text-term-green">Human review required.</p>
            <p className="mt-2 text-yellow">
              &gt; <span className="animate-pulse">_</span>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
