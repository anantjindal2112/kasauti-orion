"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/retro/Button";

const BARS = 28;
const MAX_SECONDS = 60;

type Phase = "idle" | "recording" | "done" | "error";

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function Reel({ cx, running }: { cx: number; running: boolean }) {
  return (
    <g className={running ? "reel-spin" : ""}>
      <circle cx={cx} cy="34" r="17" fill="#0d1410" stroke="#7ee6a6" strokeWidth="2.5" />
      {[0, 60, 120].map((a) => (
        <line key={a} x1={cx} y1="20" x2={cx} y2="48" stroke="#7ee6a6" strokeWidth="3" transform={`rotate(${a} ${cx} 34)`} />
      ))}
      <circle cx={cx} cy="34" r="4" fill="#f4c430" />
    </g>
  );
}

/** Two spinning reels, like the cassette in the deck's retro world. */
function Cassette({ running }: { running: boolean }) {
  return (
    <svg viewBox="0 0 120 76" className="h-24 w-36 shrink-0" role="img" aria-label="Cassette tape">
      <rect x="2" y="2" width="116" height="72" fill="#1b2a22" stroke="#7ee6a6" strokeWidth="2.5" />
      <rect x="14" y="8" width="92" height="12" fill="#f4c430" stroke="#121212" strokeWidth="2" />
      <text x="60" y="18" textAnchor="middle" fontSize="9" fontFamily="monospace" fontWeight="700" fill="#121212">
        KASAUTI · VOICE
      </text>
      <Reel cx={34} running={running} />
      <Reel cx={86} running={running} />
      <rect x="40" y="58" width="40" height="12" fill="#0d1410" stroke="#7ee6a6" strokeWidth="2" />
    </svg>
  );
}

/**
 * Preview: records a voice-over in the browser with a retro cassette-and-equalizer animation.
 * The audio never leaves this page. Turning speech into text (NVIDIA speech models) is planned, not built.
 */
export function VoiceRecorder() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [clip, setClip] = useState<{ url: string; ms: number } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const barEls = useRef<(HTMLDivElement | null)[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAt = useRef(0);

  const resetBars = () => {
    barEls.current.forEach((b) => b && (b.style.height = "4%"));
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
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      ctx.createMediaStreamSource(media).connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);

      const chunks: Blob[] = [];
      const rec = new MediaRecorder(media);
      recorder.current = rec;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        const ms = Date.now() - startedAt.current;
        teardown();
        resetBars();
        setClip({ url: URL.createObjectURL(new Blob(chunks, { type: rec.mimeType || "audio/webm" })), ms });
        setPhase("done");
      };

      startedAt.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      rec.start();
      tick.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_SECONDS * 1000) stop();
      }, 100);

      const draw = () => {
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        for (let i = 0; i < BARS; i++) {
          const v = bins[1 + Math.floor((i * (bins.length - 2)) / BARS)] / 255;
          sum += v;
          const el = barEls.current[i];
          if (el) el.style.height = `${Math.max(4, Math.min(100, v * 118))}%`;
        }
        const level = sum / BARS;
        const panel = panelRef.current;
        if (panel) {
          panel.style.boxShadow = `0 0 ${Math.round(level * 70)}px rgb(255 138 122 / ${Math.min(0.9, level * 2)})`;
          // A loud moment makes the whole screen jolt, like an old speaker cabinet.
          panel.style.transform = level > 0.42 ? `translate(${(Math.random() - 0.5) * 3}px, ${(Math.random() - 0.5) * 3}px)` : "";
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
    setPhase("idle");
  };

  const recording = phase === "recording";

  return (
    <section aria-label="Voice-over recorder (preview)" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          Voice-over <span className="ml-1 border-2 border-ink bg-yellow px-1.5 py-0.5 text-[10px] text-ink">preview</span>
        </p>
        {phase === "idle" || phase === "error" ? (
          <div className="relative">
            <Button variant="default" size="sm" onClick={() => void start()}>
              <span className="inline-block h-3 w-3 rounded-full border-2 border-ink bg-red" aria-hidden /> Record a voice-over
            </Button>
          </div>
        ) : null}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {recording && (
          <motion.div
            key="rec"
            initial={{ opacity: 0, scaleY: 0.2 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0.2 }}
            style={{ originY: 0 }}
          >
            <div ref={panelRef} className="crt-flicker relative overflow-hidden border-2 border-ink bg-term p-4 text-paper transition-shadow">
              <div className="scan-drift pointer-events-none absolute inset-0" aria-hidden />
              <div className="relative flex flex-wrap items-center justify-between gap-2 font-mono text-sm">
                <span className="flex items-center gap-2 font-bold text-term-red">
                  <span className="relative inline-flex h-4 w-4 items-center justify-center" aria-hidden>
                    <span className="rec-ring absolute inset-0 rounded-full bg-term-red" />
                    <span className="rec-lamp relative h-3 w-3 rounded-full bg-term-red" />
                  </span>
                  REC
                </span>
                <span className="font-pixel text-3xl tracking-widest text-yellow" aria-live="off">
                  {clock(elapsed)}
                </span>
                <span className="text-term-green">
                  &gt; listening<span className="cursor-blink">_</span>
                </span>
              </div>

              <div className="relative mt-3 flex items-end gap-4">
                <Cassette running />
                <div className="grid h-24 min-w-0 flex-1 items-end gap-[3px]" style={{ gridTemplateColumns: `repeat(${BARS}, minmax(0, 1fr))` }} aria-hidden>
                  {Array.from({ length: BARS }, (_, i) => (
                    <div key={i} className="flex h-24 items-end bg-[#152019]">
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
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="font-mono text-xs text-paper/70">Recording stays in this browser. Stops by itself at {MAX_SECONDS} s.</p>
                <Button variant="danger" size="sm" onClick={stop}>
                  <span className="inline-block h-3 w-3 border-2 border-ink bg-paper" aria-hidden /> Stop
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {phase === "done" && clip && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 border-2 border-ink bg-card p-3">
            <div className="flex flex-wrap items-center gap-3">
              <Cassette running={false} />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="font-mono text-sm font-bold">
                  Recorded {clock(clip.ms)} <span className="text-muted">· saved only in this browser tab</span>
                </p>
                <audio controls src={clip.url} className="w-full" />
              </div>
            </div>
            <p className="border-2 border-dashed border-ink bg-sunk p-2 text-sm">
              <b>Preview.</b> Turning this recording into text with NVIDIA speech models is planned, not built yet, so nothing was uploaded or scanned.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void start()}>
                Record again
              </Button>
              <Button size="sm" variant="ghost" onClick={discard}>
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
}
