"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/retro/Button";
import { toWav16k } from "@/lib/audio/wav";
import { api } from "@/lib/client-api";

const BARS = 32;
const MAX_SECONDS = 60;
const SCOPE = { w: 560, h: 64 };
const SPARK = { w: 560, h: 96 };
const GLYPHS = "▓▒░#@%&*+=<>/\\|01";

type Lang = "en" | "hi";
const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी" },
];
const LANG_NAME: Record<Lang, string> = { en: "English", hi: "Hindi" };

type Phase = "idle" | "recording" | "done" | "error";
type Transcription =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; text: string; heard: string | null; ms: number; model: string; to: Lang; from: Lang }
  | { status: "error"; message: string };

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Two English/Hindi toggles: what you speak, and what text you want back. */
function LangPick({ label, value, onChange, disabled }: { label: string; value: Lang; onChange: (l: Lang) => void; disabled: boolean }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-1.5 font-mono text-xs">
      <span className="font-bold uppercase tracking-wider">{label}</span>
      <span className="inline-flex border-2 border-ink">
        {LANGS.map((l) => (
          <button
            key={l.id}
            type="button"
            aria-pressed={value === l.id}
            disabled={disabled}
            onClick={() => onChange(l.id)}
            className={`px-2 py-0.5 font-bold disabled:cursor-not-allowed disabled:opacity-50 ${value === l.id ? "bg-yellow text-ink" : "bg-card text-muted hover:bg-sunk"} ${l.id === "hi" ? "border-l-2 border-ink" : ""}`}
          >
            {l.label}
          </button>
        ))}
      </span>
    </div>
  );
}

function Reel({ cx, spin, tape, running }: { cx: number; spin?: RefObject<SVGGElement | null>; tape?: RefObject<SVGCircleElement | null>; running: boolean }) {
  return (
    <g>
      <circle ref={tape} cx={cx} cy="34" r={cx < 60 ? 20 : 12} fill="#3a2a1e" stroke="#5b4330" strokeWidth="1.5" />
      <g ref={spin} className={!spin && running ? "reel-spin" : ""}>
        <circle cx={cx} cy="34" r="11" fill="#0d1410" stroke="#7ee6a6" strokeWidth="2" />
        {[0, 60, 120].map((a) => (
          <line key={a} x1={cx} y1="25" x2={cx} y2="43" stroke="#7ee6a6" strokeWidth="2.5" transform={`rotate(${a} ${cx} 34)`} />
        ))}
        <circle cx={cx} cy="34" r="3" fill="#f4c430" />
      </g>
    </g>
  );
}

/** A cassette. While recording, the reels turn with the loudness and tape moves from the left reel to the right. */
function Cassette({
  running,
  spinL,
  spinR,
  tapeL,
  tapeR,
}: {
  running: boolean;
  spinL?: RefObject<SVGGElement | null>;
  spinR?: RefObject<SVGGElement | null>;
  tapeL?: RefObject<SVGCircleElement | null>;
  tapeR?: RefObject<SVGCircleElement | null>;
}) {
  return (
    <svg viewBox="0 0 120 76" className="h-24 w-36 shrink-0" role="img" aria-label="Cassette tape">
      <rect x="2" y="2" width="116" height="72" fill="#1b2a22" stroke="#7ee6a6" strokeWidth="2.5" />
      <rect x="14" y="8" width="92" height="12" fill="#f4c430" stroke="#121212" strokeWidth="2" />
      <text x="60" y="18" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="700" fill="#121212">
        KASAUTI · VOICE
      </text>
      <rect x="22" y="22" width="76" height="26" fill="#0d1410" opacity="0.55" />
      <Reel cx={34} spin={spinL} tape={tapeL} running={running} />
      <Reel cx={86} spin={spinR} tape={tapeR} running={running} />
      <path d="M 34 54 Q 60 66 86 54" fill="none" stroke="#5b4330" strokeWidth="2" />
      <rect x="40" y="58" width="40" height="12" fill="#0d1410" stroke="#7ee6a6" strokeWidth="2" />
    </svg>
  );
}

/** Circular 60-second gauge around the timer. */
function TimerRing({ progress, children }: { progress: number; children: ReactNode }) {
  const C = 2 * Math.PI * 30;
  const hot = progress > 0.83;
  return (
    <div className="relative flex h-[74px] w-[74px] items-center justify-center" aria-hidden>
      <svg viewBox="0 0 74 74" className="absolute inset-0 -rotate-90">
        <circle cx="37" cy="37" r="30" fill="none" stroke="#1d2b23" strokeWidth="6" />
        <circle
          cx="37"
          cy="37"
          r="30"
          fill="none"
          stroke={hot ? "#ff8a7a" : "#f4c430"}
          strokeWidth="6"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.min(1, progress))}
        />
      </svg>
      <span className="relative font-pixel text-lg leading-none text-yellow">{children}</span>
    </div>
  );
}

/** Bars that bounce while the tape is being sent off to be decoded. */
function DecodeBars() {
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden>
      {Array.from({ length: 36 }, (_, i) => (
        <div
          key={i}
          className="decode-bar h-full w-full bg-term-green"
          style={{ animationDelay: `${(i * 53) % 700}ms`, animationDuration: `${650 + ((i * 97) % 500)}ms`, opacity: 0.55 + ((i * 31) % 45) / 100 }}
        />
      ))}
    </div>
  );
}

/** A line of scrolling machine noise. */
function GlitchLine() {
  const [line, setLine] = useState("");
  useEffect(() => {
    const id = setInterval(() => {
      setLine(Array.from({ length: 46 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(""));
    }, 70);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="truncate font-mono text-xs text-term-green/70" aria-hidden>
      {line}
    </p>
  );
}

/** Text that resolves out of noise, left to right, like a decoder locking on. */
function TypeReveal({ text }: { text: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const step = Math.max(1, Math.ceil(text.length / 40));
    let i = 0;
    const id = setInterval(() => {
      i = Math.min(text.length, i + step);
      const noise = text.slice(i, i + 7).replace(/\S/g, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      setShown(i >= text.length ? text : text.slice(0, i) + noise);
      if (i >= text.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [text]);
  return <span>{shown}</span>;
}

/** A sample line to read aloud: written by NVIDIA from the brand's facts and passed by our own rule checks. */
function PhraseBox({ phrase, busy, error, onNew, dark = false }: { phrase: { text: string; english: string | null; lang: Lang } | null; busy: boolean; error: string; onNew: () => void; dark?: boolean }) {
  return (
    <div className={`space-y-1.5 border-2 border-ink p-3 ${dark ? "bg-[#152019] text-paper" : "bg-card"}`} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`font-mono text-[11px] font-bold uppercase tracking-wider ${dark ? "text-yellow" : ""}`}>Say this</p>
        <button
          type="button"
          onClick={onNew}
          disabled={busy}
          className={`border-2 border-ink px-2 py-0.5 font-mono text-[11px] font-bold disabled:opacity-50 ${dark ? "bg-term text-term-green hover:bg-[#1f2d25]" : "bg-paper hover:bg-yellow"}`}
        >
          {busy ? "Writing…" : "New phrase"}
        </button>
      </div>
      {error && <p className="text-sm text-term-red">{error}</p>}
      {phrase && (
        <>
          <p className="text-lg leading-snug" lang={phrase.lang}>
            {phrase.text}
          </p>
          {phrase.english && <p className={`text-xs ${dark ? "text-paper/60" : "text-muted"}`}>In English: {phrase.english}</p>}
          <p className={`text-[11px] ${dark ? "text-paper/60" : "text-muted"}`}>
            Written by NVIDIA from the brand&rsquo;s real facts, and checked against our rules, so it comes back from speech-to-text almost ready to use.
          </p>
        </>
      )}
      {!phrase && !error && busy && <p className="text-sm opacity-70">Writing a line from the brand&rsquo;s facts…</p>}
    </div>
  );
}

/**
 * Records a voice-over (English or Hindi) with a retro cassette, oscilloscope and equalizer. The audio stays on
 * the page until "Transcribe" is pressed; then NVIDIA's speech model turns it into text, and NVIDIA's translation
 * model can turn it into the other language, before the words land in the copy box.
 */
export function VoiceRecorder({
  onTranscript,
  onStart,
  slotTerminal,
  slotOriginal,
  place,
  intent,
}: {
  onTranscript: (text: string) => void;
  /** A new recording started. */
  onStart?: () => void;
  /** Two homes for the whole section: under the findings terminal, and its original place below the copy box. */
  slotTerminal?: HTMLElement | null;
  slotOriginal?: HTMLElement | null;
  place: "terminal" | "original";
  /** The Intent Card, so a suggested phrase matches what the creator is writing about. */
  intent?: { purpose?: string; mustKeep?: string };
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [clip, setClip] = useState<{ url: string; ms: number; blob: Blob } | null>(null);
  const [tx, setTx] = useState<Transcription>({ status: "idle" });
  const [from, setFrom] = useState<Lang>("en");
  const [to, setTo] = useState<Lang>("en");
  const [phrase, setPhrase] = useState<{ text: string; english: string | null; lang: Lang } | null>(null);
  const [phraseBusy, setPhraseBusy] = useState(false);
  const [phraseError, setPhraseError] = useState("");
  const sectionRef = useRef<HTMLElement>(null);

  // The whole section lives in one DOM node that is moved between its two homes, so moving it never
  // remounts anything: a recording in progress, the phrase and the result all stay exactly as they are.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [holder] = useState<HTMLDivElement | null>(() => (typeof document === "undefined" ? null : document.createElement("div")));
  useEffect(() => {
    if (!holder) return;
    const home = place === "terminal" ? slotTerminal : slotOriginal;
    if (home) home.appendChild(holder);
    else holder.remove();
  }, [holder, place, slotTerminal, slotOriginal]);
  useEffect(() => () => holder?.remove(), [holder]);

  const panelRef = useRef<HTMLDivElement>(null);
  const barEls = useRef<(HTMLDivElement | null)[]>([]);
  const capEls = useRef<(HTMLDivElement | null)[]>([]);
  const scopeRef = useRef<HTMLCanvasElement>(null);
  const sparkRef = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const spinL = useRef<SVGGElement>(null);
  const spinR = useRef<SVGGElement>(null);
  const tapeL = useRef<SVGCircleElement>(null);
  const tapeR = useRef<SVGCircleElement>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const resetVisuals = () => {
    barEls.current.forEach((b) => b && (b.style.height = "4%"));
    capEls.current.forEach((c) => c && (c.style.bottom = "0%"));
    for (const c of [scopeRef.current, sparkRef.current]) c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    if (panelRef.current) {
      panelRef.current.style.boxShadow = "";
      panelRef.current.style.transform = "";
    }
  };

  const teardown = useCallback(() => {
    cancelAnimationFrame(raf.current);
    if (tick.current) clearInterval(tick.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void audioCtx.current?.close().catch(() => undefined);
    audioCtx.current = null;
  }, []);

  useEffect(() => () => teardown(), [teardown]);
  useEffect(() => {
    if (!clip) return;
    return () => URL.revokeObjectURL(clip.url);
  }, [clip]);

  const stop = useCallback(() => {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
  }, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record audio. Try a recent Chrome, Edge or Safari over https.");
      setPhase("error");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;

      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.68;
      ctx.createMediaStreamSource(media).connect(analyser);
      const freq = new Uint8Array(analyser.frequencyBinCount);
      const wave = new Uint8Array(analyser.fftSize);

      const chunks: Blob[] = [];
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const ms = Date.now() - startedAt.current;
        teardown();
        resetVisuals();
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        setClip({ url: URL.createObjectURL(blob), ms, blob });
        setTx({ status: "idle" });
        setPhase("done");
      };

      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      rec.start();
      onStart?.();
      tick.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_SECONDS * 1000) stop();
      }, 100);

      const reduce = prefersReducedMotion();
      const peaks = new Array<number>(BARS).fill(0);
      const sparks: { x: number; y: number; vx: number; vy: number; life: number; hot: boolean }[] = [];
      let angle = 0;
      // The canvases appear on the next render, so their drawing contexts are picked up on the first frame that has them.
      let sctx: CanvasRenderingContext2D | null = null;
      let kctx: CanvasRenderingContext2D | null = null;

      const draw = () => {
        sctx ??= scopeRef.current?.getContext("2d") ?? null;
        kctx ??= sparkRef.current?.getContext("2d") ?? null;
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(wave);
        const progress = Math.min(1, (Date.now() - startedAt.current) / (MAX_SECONDS * 1000));

        // Loudness (0..1) from the waveform.
        let sq = 0;
        for (const v of wave) sq += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sq / wave.length) * 3.2);
        if (levelRef.current) levelRef.current.textContent = level < 0.01 ? "−∞ dB" : `${Math.round(20 * Math.log10(level / 3.2 + 1e-4))} dB`;

        // Equalizer bars with falling peak caps.
        for (let i = 0; i < BARS; i++) {
          const v = freq[1 + Math.floor((i * 96) / BARS)] / 255;
          const h = Math.max(4, Math.min(100, v * 118));
          const el = barEls.current[i];
          if (el) el.style.height = `${h}%`;
          peaks[i] = Math.max(h, peaks[i] - 1.1);
          const cap = capEls.current[i];
          if (cap) cap.style.bottom = `${Math.min(96, peaks[i])}%`;
          if (!reduce && kctx && v > 0.72 && Math.random() < 0.3 && sparks.length < 90) {
            sparks.push({ x: ((i + 0.5) / BARS) * SPARK.w, y: SPARK.h * (1 - h / 100), vx: (Math.random() - 0.5) * 2.4, vy: -1.2 - Math.random() * 2.2, life: 1, hot: v > 0.88 });
          }
        }

        // Oscilloscope with phosphor afterglow.
        if (sctx) {
          sctx.fillStyle = "rgba(13, 20, 16, 0.26)";
          sctx.fillRect(0, 0, SCOPE.w, SCOPE.h);
          sctx.lineWidth = 2;
          sctx.strokeStyle = level > 0.55 ? "#ff8a7a" : level > 0.3 ? "#f4c430" : "#7ee6a6";
          sctx.shadowColor = sctx.strokeStyle;
          sctx.shadowBlur = 8;
          sctx.beginPath();
          for (let i = 0; i < wave.length; i++) {
            const x = (i / (wave.length - 1)) * SCOPE.w;
            const y = (wave[i] / 255) * SCOPE.h;
            if (i === 0) sctx.moveTo(x, y);
            else sctx.lineTo(x, y);
          }
          sctx.stroke();
          sctx.shadowBlur = 0;
        }

        // Sparks jump off the loudest bars.
        if (kctx) {
          kctx.clearRect(0, 0, SPARK.w, SPARK.h);
          for (let i = sparks.length - 1; i >= 0; i--) {
            const p = sparks[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.09;
            p.life -= 0.022;
            if (p.life <= 0 || p.y > SPARK.h) {
              sparks.splice(i, 1);
              continue;
            }
            kctx.globalAlpha = p.life;
            kctx.fillStyle = p.hot ? "#ff8a7a" : "#f4c430";
            kctx.fillRect(Math.round(p.x), Math.round(p.y), 4, 4);
          }
          kctx.globalAlpha = 1;
        }

        // Reels turn faster with louder sound; tape moves from the left reel to the right.
        angle += 2.2 + level * 22;
        spinL.current?.setAttribute("transform", `rotate(${angle} 34 34)`);
        spinR.current?.setAttribute("transform", `rotate(${angle} 86 34)`);
        tapeL.current?.setAttribute("r", String(20 - progress * 9));
        tapeR.current?.setAttribute("r", String(12 + progress * 9));

        const panel = panelRef.current;
        if (panel) {
          panel.style.boxShadow = `0 0 ${Math.round(level * 80)}px rgb(255 138 122 / ${Math.min(0.9, level * 1.8)})`;
          panel.style.transform = !reduce && level > 0.6 ? `translate(${(Math.random() - 0.5) * 3}px, ${(Math.random() - 0.5) * 3}px)` : "";
        }
        raf.current = requestAnimationFrame(draw);
      };
      draw();
    } catch (e) {
      teardown();
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(denied ? "Microphone access was blocked. Allow it in the browser's address bar and try again." : "No microphone could be started.");
      setPhase("error");
    }
  };

  const discard = () => {
    setClip(null);
    setTx({ status: "idle" });
    setPhase("idle");
  };

  const transcribe = async () => {
    if (!clip || tx.status === "working") return;
    setTx({ status: "working" });
    try {
      const wav = await toWav16k(clip.blob);
      const res = await fetch(`/api/transcribe?from=${from}&to=${to}`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
      const json = (await res.json()) as { text?: string; raw?: string; translated?: boolean; error?: string; latencyMs?: number; modelId?: string };
      if (!res.ok || !json.text) throw new Error(json.error ?? "Couldn't transcribe that recording.");
      onTranscript(json.text);
      setTx({ status: "done", text: json.text, heard: json.translated ? (json.raw ?? null) : null, ms: json.latencyMs ?? 0, model: (json.modelId ?? "").split("/").at(-1) ?? "", from, to });
    } catch (e) {
      setTx({ status: "error", message: e instanceof Error ? e.message : "Couldn't transcribe that recording." });
    }
  };

  /** NVIDIA writes a short line from the brand's real facts, and our own rules must pass it before it is shown. */
  const suggestPhrase = async () => {
    if (phraseBusy) return;
    setPhraseBusy(true);
    setPhraseError("");
    let r = await api<{ phrase: string; english: string | null; lang: Lang }>("POST", "/api/phrase", { lang: from, purpose: intent?.purpose || undefined, mustKeep: intent?.mustKeep || undefined });
    if (!r.ok && r.status === 502) r = await api<{ phrase: string; english: string | null; lang: Lang }>("POST", "/api/phrase", { lang: from, purpose: intent?.purpose || undefined, mustKeep: intent?.mustKeep || undefined });
    setPhraseBusy(false);
    if (!r.ok) return setPhraseError(r.error);
    setPhrase({ text: r.data.phrase, english: r.data.english, lang: r.data.lang });
  };

  const recording = phase === "recording";
  const working = tx.status === "working";

  const livePanel = (
        <motion.div
          key="rec"
          initial={{ opacity: 0, scaleY: 0.15 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0.15 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          style={{ originY: 0 }}
        >
          <div ref={panelRef} className="crt-flicker relative overflow-hidden border-2 border-ink bg-term p-4 text-paper transition-shadow">
            <div className="scan-drift pointer-events-none absolute inset-0" aria-hidden />
            <div className="relative flex flex-wrap items-center justify-between gap-3 font-mono text-sm">
              <span className="flex items-center gap-2 font-bold text-term-red">
                <span className="relative inline-flex h-4 w-4 items-center justify-center" aria-hidden>
                  <span className="rec-ring absolute inset-0 rounded-full bg-term-red" />
                  <span className="rec-lamp relative h-3 w-3 rounded-full bg-term-red" />
                </span>
                REC · {LANG_NAME[from]}
              </span>
              <TimerRing progress={elapsed / (MAX_SECONDS * 1000)}>{clock(elapsed)}</TimerRing>
              <span className="text-right text-term-green">
                &gt; listening<span className="cursor-blink">_</span>
                <span ref={levelRef} className="mt-1 block text-xs text-paper/60">
                  −∞ dB
                </span>
              </span>
            </div>

            <div className="relative mt-3 flex items-end gap-4">
              <Cassette running spinL={spinL} spinR={spinR} tapeL={tapeL} tapeR={tapeR} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <canvas ref={scopeRef} width={SCOPE.w} height={SCOPE.h} className="h-16 w-full border-2 border-term-green/40 bg-term" aria-hidden />
                <div className="relative h-24" aria-hidden>
                  <div className="grid h-full items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${BARS}, minmax(0, 1fr))` }}>
                    {Array.from({ length: BARS }, (_, i) => (
                      <div key={i} className="relative flex h-24 items-end bg-[#152019]">
                        <div
                          ref={(el) => {
                            barEls.current[i] = el;
                          }}
                          className="w-full"
                          style={{
                            height: "4%",
                            background: "linear-gradient(to top, #7ee6a6 0%, #7ee6a6 45%, #f4c430 70%, #ff8a7a 100%)",
                            backgroundSize: "100% 96px",
                            backgroundPosition: "bottom",
                            WebkitMaskImage: "repeating-linear-gradient(to top, #000 0 6px, transparent 6px 8px)",
                            maskImage: "repeating-linear-gradient(to top, #000 0 6px, transparent 6px 8px)",
                          }}
                        />
                        <div
                          ref={(el) => {
                            capEls.current[i] = el;
                          }}
                          className="absolute left-0 h-[3px] w-full bg-paper"
                          style={{ bottom: "0%" }}
                        />
                      </div>
                    ))}
                  </div>
                  <canvas ref={sparkRef} width={SPARK.w} height={SPARK.h} className="pointer-events-none absolute inset-0 h-full w-full" />
                </div>
              </div>
            </div>

            <div className="relative mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-xs text-paper/70">Recording stays in this browser until you transcribe. Stops by itself at {MAX_SECONDS} s.</p>
              <Button variant="danger" size="sm" onClick={stop}>
                <span className="inline-block h-3 w-3 border-2 border-ink bg-paper" aria-hidden /> Stop
              </Button>
            </div>
          </div>
        </motion.div>
  );

  const content = (
    <section ref={sectionRef} aria-label="Voice-over recorder" className="space-y-2 border-2 border-dashed border-ink bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Voice-over <span className="ml-1 border-2 border-ink bg-yellow px-1.5 py-0.5 text-[10px] text-ink">NVIDIA speech</span>
        </p>
        {phase === "idle" || phase === "error" ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void suggestPhrase()} disabled={phraseBusy}>
              {phraseBusy ? "Writing…" : phrase ? "New phrase" : "Suggest a phrase to read"}
            </Button>
            <Button variant="default" size="sm" onClick={() => void start()}>
              <span className="inline-block h-3 w-3 rounded-full border-2 border-ink bg-red" aria-hidden /> Record a voice-over
            </Button>
          </div>
        ) : null}
      </div>
      {phase !== "recording" && (phrase || phraseError || phraseBusy) && <PhraseBox phrase={phrase} busy={phraseBusy} error={phraseError} onNew={() => void suggestPhrase()} />}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <LangPick label="I speak" value={from} onChange={setFrom} disabled={recording || working} />
        <span className="font-mono text-sm font-bold" aria-hidden>
          →
        </span>
        <LangPick label="Text in" value={to} onChange={setTo} disabled={recording || working} />
        {to === "hi" && (
          <span className="font-mono text-[11px] font-bold text-red">
            Hindi text is reviewed directly: findings will quote your Hindi.
          </span>
        )}
        {from !== to && (
          <span className="font-mono text-[11px] text-muted">
            {LANG_NAME[from]} speech is translated to {LANG_NAME[to]} by NVIDIA
          </span>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {recording && livePanel}

        {phase === "done" && clip && (
          <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 340, damping: 26 }} className="space-y-3 border-2 border-ink bg-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Cassette running={working} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-mono text-sm font-bold">
                  Recorded {clock(clip.ms)} <span className="text-muted">· in this browser tab until you transcribe</span>
                </p>
                <audio controls src={clip.url} className="w-full" />
              </div>
            </div>

            <AnimatePresence initial={false} mode="wait">
              {working && (
                <motion.div key="work" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="glow-pulse space-y-2 border-2 border-ink bg-term p-3 font-mono text-sm text-term-green" role="status">
                    <p>
                      &gt; sending the tape to NVIDIA Parakeet · {LANG_NAME[from]}
                      {from !== to ? ` → ${LANG_NAME[to]}` : ""}
                      <span className="cursor-blink">_</span>
                    </p>
                    <DecodeBars />
                    <GlitchLine />
                  </div>
                </motion.div>
              )}
              {tx.status === "done" && (
                <motion.div key="done-tx" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-1 border-2 border-ink bg-term p-3 font-mono text-sm text-term-green" role="status">
                  <p className="text-yellow">
                    &gt; heard by {tx.model} in {(tx.ms / 1000).toFixed(1)} s · added to the copy box
                  </p>
                  {tx.heard && (
                    <p className="text-paper/60">
                      heard in {LANG_NAME[tx.from]}: <span lang={tx.from}>{tx.heard}</span>
                    </p>
                  )}
                  <p className="whitespace-pre-wrap text-paper" lang={tx.to}>
                    <TypeReveal key={tx.text} text={tx.text} />
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            {tx.status === "error" && (
              <p role="alert" className="border-2 border-ink bg-mark-high px-3 py-2 text-sm font-medium">
                {tx.message}
              </p>
            )}
            <p className="text-xs text-muted">
              Transcribing sends this audio to NVIDIA&rsquo;s speech model (and the text to its translation model if the languages differ). Personal details in
              the <i>text</i> are masked before any AI review; the audio itself is not masked. Spoken prices and percentages become digits so the Claim Ledger can
              check them.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => void transcribe()} disabled={working}>
                {working ? "Transcribing…" : tx.status === "done" ? "Transcribe again" : "Transcribe with NVIDIA"}
              </Button>
              <Button size="sm" onClick={() => void start()} disabled={working}>
                Record again
              </Button>
              <Button size="sm" variant="ghost" onClick={discard} disabled={working}>
                Discard
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "error" && (
        <p role="alert" className="border-2 border-ink bg-mark-high px-3 py-2 text-sm font-medium">
          {error}
        </p>
      )}

    </section>
  );
  // Nothing is rendered until after hydration, so the server HTML and the first client render agree.
  return mounted && holder ? createPortal(content, holder) : null;
}
