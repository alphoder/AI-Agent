'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Mic, RefreshCw, Loader2, Play, SkipForward, RotateCcw, ArrowLeft, Upload, Sparkles } from 'lucide-react';
import { randomTopic, SPEAK_TOPICS, type SpeakTopic } from '@avatar-platform/shared';
import { ScoreRing } from '@/components/charts/charts';
import apiClient from '@/lib/api-client';

const SPEAK_SEC = 60;
const ITEM_W = 520;      // px per reel tile — fixed so the centring maths is exact
const TAIL = 14;         // tiles parked past the winner so the strip never looks spent
const SPIN_MS = 5200;   // long enough to wind up, cruise, and coast to a stop
const FILLERS = ['um', 'uh', 'like', 'so', 'basically', 'actually', 'you know', 'i mean'];

type ModeKey = 'prepared' | 'instant' | 'own';
type Phase = 'hub' | 'material' | 'ready' | 'prep' | 'speaking' | 'rating' | 'done';

const MODES: { key: ModeKey; title: string; blurb: string; image: string; prepSec: number }[] = [
  {
    key: 'prepared',
    title: 'Prepared talk',
    blurb: 'A random topic, ten minutes to think it through, then one minute to deliver it.',
    image: '/live/prepared.webp',
    prepSec: 600,
  },
  {
    key: 'instant',
    title: 'Instant speak',
    blurb: 'A random topic and the clock starts immediately. No thinking time, no hiding.',
    image: '/live/instant.webp',
    prepSec: 0,
  },
  {
    key: 'own',
    title: 'Your own material',
    blurb: 'Bring a topic or paste your notes, prepare for ten minutes, then speak to it.',
    image: '/live/own.webp',
    prepSec: 600,
  },
];

interface Rating {
  overall: number; structure: number; ideas: number; reasoning: number; delivery: number;
  verdict: string; strengths: string[]; improvements: string[]; next_time: string;
}

function countFillers(text: string): number {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  return FILLERS.reduce((n, f) => n + (t.split(` ${f} `).length - 1), 0);
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : String(s);
}

/**
 * The countdown dial. Driven by requestAnimationFrame off a wall-clock deadline
 * rather than an accumulating tick, so the sweep stays smooth and cannot drift
 * when the tab is throttled — which a ten-minute prep would otherwise do badly.
 * ponytail: local to this page — ui/progress-ring animates on mount, which
 * fights a countdown. Promote it if a second screen ever needs a dial.
 */
function Clock({ remainingMs, totalSec, urgent }: { remainingMs: number; totalSec: number; urgent: boolean }) {
  const size = 260, stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remainingMs / (totalSec * 1000)));
  const secs = Math.max(0, Math.ceil(remainingMs / 1000));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          className={urgent ? 'stroke-destructive' : 'stroke-primary'}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-bold tabular-nums tracking-tight ${secs >= 60 ? 'text-5xl' : 'text-6xl'} ${urgent ? 'text-destructive' : 'text-foreground'}`}>
          {clock(secs)}
        </span>
        <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
          {secs >= 60 ? 'left to prepare' : 'seconds left'}
        </span>
      </div>
    </div>
  );
}

export default function LiveRoomPage() {
  const [mode, setMode] = useState<ModeKey | null>(null);
  const [phase, setPhase] = useState<Phase>('hub');
  const [topic, setTopic] = useState<SpeakTopic | null>(null);
  const [material, setMaterial] = useState('');
  const [remainingMs, setRemainingMs] = useState(SPEAK_SEC * 1000);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [rating, setRating] = useState<Rating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const [reel, setReel] = useState<SpeakTopic[]>([]);
  const [reelState, setReelState] = useState<'idle' | 'spinning' | 'settled'>('idle');
  const [winnerIdx, setWinnerIdx] = useState(-1);
  const [offset, setOffset] = useState(0);
  const spinning = reelState === 'spinning';
  const settled = reelState === 'settled';

  // SpeechRecognition has no DOM lib types; `any` is the honest shape here.
  const recRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const finalRef = useRef('');
  const spokeSecRef = useRef(SPEAK_SEC);
  const reelBoxRef = useRef<HTMLDivElement>(null);

  const cfg = MODES.find((m) => m.key === mode) ?? MODES[0];
  const subject = mode === 'own' ? material.trim() : (topic?.text ?? '');

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setUnsupported(true); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    rec.onresult = (e: any) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalRef.current += chunk + ' ';
        else live += chunk;
      }
      setTranscript(finalRef.current);
      setInterim(live);
    };
    // Chrome stops the recogniser on its own after a pause; restart it while the
    // clock is still running or the back half of the minute is simply lost.
    rec.onend = () => { if (recRef.current?.wanted) { try { rec.start(); } catch { /* already starting */ } } };
    // These used to be swallowed, so a browser that cannot reach the speech
    // service just looped silently: the UI said "Listening" and captured
    // nothing, with no way to tell why.
    rec.onerror = (e: any) => {
      const code = e?.error as string;
      if (code === 'no-speech' || code === 'aborted') return;   // genuinely transient
      if (recRef.current) recRef.current.wanted = false;        // stop the retry loop
      setSttError(
        code === 'not-allowed' || code === 'service-not-allowed'
          ? 'Microphone access was blocked. Allow the mic for this site, then try again.'
          : code === 'audio-capture'
            ? 'No microphone was found. Check your input device and try again.'
            : code === 'network'
              ? 'This browser cannot reach the speech service. Brave and Firefox block it — Chrome or Edge will work.'
              : `Speech recognition stopped (${code || 'unknown error'}).`,
      );
    };
    recRef.current = rec;
    return () => { rec.wanted = false; try { rec.stop(); } catch { /* not running */ } };
  }, []);

  const rate = useCallback(async (text: string, secs: number, subj: string) => {
    setPhase('rating');
    setError(null);
    try {
      const { data } = await apiClient.post('/speak/rate', {
        topic: subj,
        transcript: text,
        duration_sec: secs,
        words: text.trim() ? text.trim().split(/\s+/).length : 0,
        fillers: countFillers(text),
      });
      setRating(data.data);
    } catch {
      setError('Could not get a rating right now — your speech is safe below.');
    } finally {
      setPhase('done');
    }
  }, []);

  const stop = useCallback((secsSpoken: number, subj: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recRef.current) { recRef.current.wanted = false; try { recRef.current.stop(); } catch { /* not running */ } }
    setInterim('');
    spokeSecRef.current = secsSpoken;
    rate(finalRef.current, secsSpoken, subj);
  }, [rate]);

  const runClock = useCallback((seconds: number, onDone: () => void) => {
    const deadline = performance.now() + seconds * 1000;
    const tick = () => {
      const left = deadline - performance.now();
      setRemainingMs(left);
      if (left <= 0) { onDone(); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startSpeaking = useCallback((subj: string) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    finalRef.current = '';
    setTranscript(''); setInterim('');
    setRating(null); setError(null);
    setPhase('speaking');
    setSttError(null);
    setRemainingMs(SPEAK_SEC * 1000);
    if (recRef.current) {
      recRef.current.wanted = true;
      try { recRef.current.start(); } catch { /* already running */ }
    }
    runClock(SPEAK_SEC, () => stop(SPEAK_SEC, subj));
  }, [runClock, stop]);

  /**
   * Spin the reel. The winner is drawn first — the animation only reveals a
   * decision already made — then the strip is built so that EVERY topic rides
   * past before it, with a tail of further topics parked behind so the reel
   * never shows its end and reads as "out of topics".
   */
  const spin = useCallback((exclude?: string) => {
    const target = randomTopic(exclude);
    const rest = SPEAK_TOPICS.filter((t) => t.text !== target.text);
    for (let i = rest.length - 1; i > 0; i--) {        // Fisher-Yates
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const idx = rest.length;                            // the winner sits after every other topic
    const strip = [...rest, target, ...rest.slice(0, TAIL)];
    setReel(strip);
    setWinnerIdx(idx);
    setTopic(target);
    setOffset(0);

    // Anyone who asked for less motion gets the result, not the ride.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setReelState('settled');
      return;
    }
    setReelState('spinning');
    // Two frames: one to paint the strip at offset 0, one to start the move —
    // without the gap the browser coalesces both and there is no animation.
    // The container may not be laid out yet on the first frame after a phase
    // change; a zero width would centre the winner half a screen off, so keep
    // waiting until it measures.
    let tries = 0;
    const go = () => {
      const box = reelBoxRef.current?.clientWidth ?? 0;
      if (box === 0 && tries++ < 10) { requestAnimationFrame(go); return; }
      setOffset(idx * ITEM_W + ITEM_W / 2 - box / 2);
    };
    requestAnimationFrame(() => requestAnimationFrame(go));
  }, []);

  function pickMode(key: ModeKey) {
    const m = MODES.find((x) => x.key === key)!;
    setMode(key);
    setRating(null); setError(null);
    finalRef.current = ''; setTranscript(''); setInterim('');
    if (key === 'own') { setTopic(null); setReelState('settled'); setPhase('material'); return; }
    if (m.prepSec === 0) {                       // instant: no reel, no landing screen
      const t = randomTopic();
      setTopic(t);
      setPhase('ready');
      startSpeaking(t.text);
      return;
    }
    setReel([]); setWinnerIdx(-1); setOffset(0); setReelState('idle');
    setTopic(null);
    setPhase('ready');            // reel waits for the button; nothing moves on open
  }

  function startPrep() {
    setPhase('prep');
    setRemainingMs(cfg.prepSec * 1000);
    runClock(cfg.prepSec, () => startSpeaking(subject));
  }

  function shuffle() {
    spin(topic?.text);
  }

  function backToHub() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recRef.current) { recRef.current.wanted = false; try { recRef.current.stop(); } catch { /* not running */ } }
    setMode(null); setPhase('hub'); setTopic(null); setMaterial('');
    finalRef.current = ''; setTranscript(''); setInterim('');
    setRating(null); setError(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    // ponytail: text() covers .txt/.md/.csv — the formats a browser can read
    // without a parser. PDF/DOCX would each need a dependency; paste instead.
    const text = await f.text();
    if (!text.trim()) { setError('That file looks empty.'); return; }
    setMaterial(text.slice(0, 20000));
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const urgent = phase === 'speaking' && remainingMs <= 10_000;

  if (unsupported) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-10 text-center">
        <p className="font-semibold">This browser can&apos;t listen</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          The Live Room needs speech recognition. Chrome or Edge works; Firefox does not.
        </p>
      </div>
    );
  }

  /* ---------------------------------------------------------------- the hub */
  if (phase === 'hub') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Room</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
            One minute of speaking, scored on structure, ideas and reasoning. Pick how much
            thinking time you want first.
          </p>
        </div>

        {/* Three equal portrait panels filling the section. The copy sits ON the
            photo, so each card needs a scrim — white text straight onto a
            mid-grey image fails contrast in the lighter frames. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {MODES.map((m, i) => (
            <button
              key={m.key}
              onClick={() => pickMode(m.key)}
              className="group relative aspect-[3/4] overflow-hidden rounded-2xl border border-border text-left transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Image
                src={m.image}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 33vw"
                priority={i === 0}
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/5" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-lg font-semibold tracking-tight text-white">{m.title}</p>
                <p className="mt-1 text-sm leading-snug text-white/75">{m.blurb}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wider text-white/90">
                  {m.prepSec === 0 ? '0 prep · 1 min speak' : `${m.prepSec / 60} min prep · 1 min speak`}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------- everything inside a mode */
  return (
    <div className="space-y-6">
      <button onClick={backToHub} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Live Room
      </button>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{cfg.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{cfg.blurb}</p>
      </div>

      {/* Your own material */}
      {phase === 'material' && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6">
          <label htmlFor="material" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What are you speaking about?
          </label>
          <textarea
            id="material"
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            rows={7}
            placeholder="Paste your notes, a brief, an outline — or just type the topic."
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="press inline-flex cursor-pointer items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" /> Import a file
              <input type="file" accept=".txt,.md,.markdown,.csv,text/plain" onChange={onFile} className="sr-only" />
            </label>
            <span className="text-xs text-muted-foreground">Text files (.txt, .md). For PDFs or Word, paste the text.</span>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            onClick={() => setPhase('ready')}
            disabled={!material.trim()}
            className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      )}

      {/* Topic + start */}
      {phase === 'ready' && (
        /* One height for every state, so the card does not jump when the reel
           replaces the prompt or when the buttons appear. */
        <div className="flex min-h-[440px] flex-col justify-center overflow-hidden rounded-2xl border border-border bg-card text-center">
          {mode === 'own' ? (
            <div className="p-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your material</p>
              <p className="mx-auto mt-3 max-w-2xl text-balance text-2xl font-semibold tracking-tight">
                {material.length > 240 ? `${material.slice(0, 240)}…` : material}
              </p>
            </div>
          ) : reelState === 'idle' ? (
            /* Nothing moves until asked. */
            <div className="px-6 py-16">
              <p className="text-2xl font-semibold tracking-tight">Let&apos;s find your topic</p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                One will be drawn at random. You get {cfg.prepSec / 60} minutes with it, then a minute to talk.
              </p>
              <button onClick={() => spin()}
                className="press mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Sparkles className="h-4 w-4" /> Search the topic
              </button>
            </div>
          ) : (
            <>
              <p className={`pt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-all duration-500 ${
                settled ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
              }`}>
                Your topic
              </p>

              {/* The stage. Fixed height, so a one-line topic and a two-line
                  topic cannot resize the grey band as they pass through. */}
              <div ref={reelBoxRef} className="relative mt-4 h-[220px] w-full overflow-hidden bg-muted/50">
                <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-28 bg-gradient-to-r from-card to-transparent sm:w-56" />
                <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-28 bg-gradient-to-l from-card to-transparent sm:w-56" />
                <div
                  className="absolute inset-y-0 left-0 flex items-center"
                  style={{
                    transform: `translate3d(${-offset}px, 0, 0)`,
                    // Only transform, never `all` — during the spin there are 50+
                    // large text nodes on screen and transitioning anything that
                    // touches paint on each of them is what made it stutter.
                    //
                    // The curve is the whole feel. A strong ease-out is fastest at
                    // t=0, which is why this used to snap into motion the instant
                    // the button was pressed. P1 y=0 holds the speed at zero and
                    // lets it wind up; P2 y=1 arriving early gives a long cool-down.
                    // One curve rather than chained spin-up/spin-down transitions,
                    // so there is no velocity mismatch at a handover to jerk.
                    transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.34, 0, 0.06, 1)` : 'none',
                    willChange: spinning ? 'transform' : 'auto',
                  }}
                  onTransitionEnd={() => setReelState('settled')}
                >
                  {reel.map((t, i) => {
                    const isWinner = i === winnerIdx;
                    return (
                      <div
                        key={`${t.text}-${i}`}
                        className="flex h-[220px] shrink-0 items-center justify-center px-10"
                        style={{ width: ITEM_W }}
                      >
                        {/* One size, one weight, clamped to two lines: every tile
                            occupies an identical box however long the topic is. */}
                        <p
                          className={`line-clamp-2 text-center text-4xl font-bold leading-[1.15] tracking-tight ${
                            settled
                              ? (isWinner
                                  ? 'text-foreground opacity-100 transition-opacity duration-300 ease-out'
                                  : 'opacity-0')
                              : 'text-foreground/60'
                          }`}
                        >
                          {t.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p aria-live="polite" className={`mt-3 text-xs capitalize text-muted-foreground transition-all duration-500 ${
                settled ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
              }`}>
                {topic?.kind ?? ' '}
              </p>
            </>
          )}

          {(mode === 'own' || reelState === 'settled') && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-6 pb-8 pt-6 duration-500 animate-in fade-in slide-in-from-bottom-2">
              <button onClick={startPrep}
                className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <Play className="h-4 w-4" /> Prepare ({cfg.prepSec / 60} min)
              </button>
              <button onClick={() => startSpeaking(subject)}
                className="press inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                <Mic className="h-4 w-4" /> Speak now
              </button>
              {mode !== 'own' && (
                <button onClick={shuffle}
                  className="press inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">
                  <RefreshCw className="h-4 w-4" /> Shuffle topic
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Clock */}
      {(phase === 'prep' || phase === 'speaking') && (
        <div className="flex flex-col items-center gap-4">
          <p className="max-w-2xl text-center text-sm font-medium">
            {mode === 'own' ? (material.length > 160 ? `${material.slice(0, 160)}…` : material) : topic?.text}
          </p>
          <Clock remainingMs={remainingMs} totalSec={phase === 'prep' ? cfg.prepSec : SPEAK_SEC} urgent={urgent} />
          {phase === 'prep' ? (
            <>
              <p className="text-sm text-muted-foreground">Think. Pick an angle, a reason and one example.</p>
              <button onClick={() => startSpeaking(subject)}
                className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                <SkipForward className="h-4 w-4" /> I&apos;m ready — start speaking
              </button>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm text-primary">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                Listening · {words} words
              </p>
              <button onClick={() => stop(SPEAK_SEC - Math.ceil(remainingMs / 1000), subject)}
                className="press rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                Finish early
              </button>
            </>
          )}
        </div>
      )}

      {phase === 'speaking' && sttError && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{sttError}</p>
      )}

      {phase === 'speaking' && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-sm leading-relaxed">
            {transcript || <span className="italic text-muted-foreground">Start talking — your words appear here.</span>}
            {interim && <span className="italic text-primary/70"> {interim}</span>}
          </p>
        </div>
      )}

      {phase === 'rating' && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-foreground" />
          <p className="text-sm">Reading back what you said…</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

          {rating && (
            <>
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 sm:flex-row sm:gap-6">
                <ScoreRing score={rating.overall} size={96} stroke={8} />
                <div className="min-w-0 flex-1 text-center sm:text-left">
                  <p className="font-semibold">{rating.verdict}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {spokeSecRef.current}s · {words} words · {countFillers(transcript)} fillers
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([['Structure', rating.structure], ['Ideas', rating.ideas],
                   ['Reasoning', rating.reasoning], ['Delivery', rating.delivery]] as const).map(([label, v]) => (
                  <div key={label} className="rounded-xl border border-border bg-card p-3 text-center">
                    <p className="text-2xl font-bold tabular-nums">{v}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {rating.strengths.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-success">What worked</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {rating.strengths.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {rating.improvements.length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-warning">Sharpen this</p>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {rating.improvements.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
              </div>

              {rating.next_time && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Next time</p>
                  <p className="mt-1.5 text-sm">{rating.next_time}</p>
                </div>
              )}
            </>
          )}

          {transcript && (
            <details className="rounded-2xl border border-border bg-card p-5">
              <summary className="cursor-pointer text-sm font-medium">What you said</summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{transcript}</p>
            </details>
          )}

          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button onClick={() => startSpeaking(subject)}
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <RotateCcw className="h-4 w-4" /> Same subject again
            </button>
            {mode !== 'own' && (
              <button onClick={() => { shuffle(); setPhase('ready'); }}
                className="press inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
                <RefreshCw className="h-4 w-4" /> New topic
              </button>
            )}
            <button onClick={backToHub}
              className="press inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">
              Change mode
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
