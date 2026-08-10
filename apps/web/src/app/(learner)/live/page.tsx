'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, RefreshCw, Loader2, Play, SkipForward, RotateCcw } from 'lucide-react';
import { randomTopic, type SpeakTopic } from '@avatar-platform/shared';
import { ScoreRing } from '@/components/charts/charts';
import apiClient from '@/lib/api-client';

const SPEAK_SEC = 60;
const PREP_SEC = 30;
const FILLERS = ['um', 'uh', 'like', 'so', 'basically', 'actually', 'you know', 'i mean'];

type Phase = 'idle' | 'prep' | 'speaking' | 'rating' | 'done';

interface Rating {
  overall: number; structure: number; ideas: number; reasoning: number; delivery: number;
  verdict: string; strengths: string[]; improvements: string[]; next_time: string;
}

function countFillers(text: string): number {
  const t = ` ${text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ')} `;
  return FILLERS.reduce((n, f) => n + (t.split(` ${f} `).length - 1), 0);
}

/**
 * The countdown dial. Driven by requestAnimationFrame off a wall-clock deadline
 * rather than by an accumulating tick, so the sweep stays smooth and cannot
 * drift when the tab is throttled.
 * ponytail: local to this page — ui/progress-ring animates on mount, which
 * fights a countdown. Promote it if a second screen ever needs a dial.
 */
function Clock({ remainingMs, total, urgent }: { remainingMs: number; total: number; urgent: boolean }) {
  const size = 260, stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, remainingMs / (total * 1000)));
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
        <span className={`text-6xl font-bold tabular-nums tracking-tight ${urgent ? 'text-destructive' : 'text-foreground'}`}>
          {secs}
        </span>
        <span className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">seconds left</span>
      </div>
    </div>
  );
}

export default function SpeakForAMinutePage() {
  const [topic, setTopic] = useState<SpeakTopic | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remainingMs, setRemainingMs] = useState(SPEAK_SEC * 1000);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [rating, setRating] = useState<Rating | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  // SpeechRecognition has no DOM lib types; `any` is the honest shape here.
  const recRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const finalRef = useRef('');            // text the recogniser has committed
  const spokeSecRef = useRef(SPEAK_SEC);

  // Pick the first topic on the client — a server-rendered random value would
  // differ from the client's and trip a hydration mismatch.
  useEffect(() => { setTopic(randomTopic()); }, []);

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
    rec.onerror = () => { /* transient — onend restarts */ };
    recRef.current = rec;
    return () => { rec.wanted = false; try { rec.stop(); } catch { /* not running */ } };
  }, []);

  const rate = useCallback(async (text: string, secs: number) => {
    if (!topic) return;
    setPhase('rating');
    setError(null);
    try {
      const { data } = await apiClient.post('/speak/rate', {
        topic: topic.text,
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
  }, [topic]);

  const stop = useCallback((secsSpoken: number) => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recRef.current) { recRef.current.wanted = false; try { recRef.current.stop(); } catch { /* not running */ } }
    setInterim('');
    spokeSecRef.current = secsSpoken;
    rate(finalRef.current, secsSpoken);
  }, [rate]);

  // One rAF loop drives both countdowns, off a deadline rather than a counter.
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

  const startSpeaking = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    finalRef.current = '';
    setTranscript('');
    setInterim('');
    setRating(null);
    setError(null);
    setPhase('speaking');
    setRemainingMs(SPEAK_SEC * 1000);
    if (recRef.current) {
      recRef.current.wanted = true;
      try { recRef.current.start(); } catch { /* already running */ }
    }
    runClock(SPEAK_SEC, () => stop(SPEAK_SEC));
  }, [runClock, stop]);

  function startPrep() {
    setPhase('prep');
    setRemainingMs(PREP_SEC * 1000);
    runClock(PREP_SEC, () => startSpeaking());
  }

  function nextTopic() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recRef.current) { recRef.current.wanted = false; try { recRef.current.stop(); } catch { /* not running */ } }
    setTopic(randomTopic(topic?.text));
    setPhase('idle');
    finalRef.current = '';
    setTranscript(''); setInterim('');
    setRating(null); setError(null);
    setRemainingMs(SPEAK_SEC * 1000);
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  const words = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const urgent = phase === 'speaking' && remainingMs <= 10_000;

  if (unsupported) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-10 text-center">
        <p className="font-semibold">This browser can&apos;t listen</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Speak for a Minute needs speech recognition. Chrome or Edge works; Firefox does not.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Speak for a Minute</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">
          A random topic, {PREP_SEC} seconds to think, then one minute to talk. Scored on structure,
          ideas and reasoning — the drill that builds thinking on your feet.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your topic</p>
        <p className="mx-auto mt-2 max-w-2xl text-balance text-2xl font-semibold tracking-tight">
          {topic ? topic.text : '…'}
        </p>
        {topic && <p className="mt-1.5 text-xs capitalize text-muted-foreground">{topic.kind}</p>}
        {phase === 'idle' && (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <button onClick={startPrep}
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Play className="h-4 w-4" /> Prepare ({PREP_SEC}s)
            </button>
            <button onClick={startSpeaking}
              className="press inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
              <Mic className="h-4 w-4" /> Skip prep, speak now
            </button>
            <button onClick={nextTopic}
              className="press inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted">
              <RefreshCw className="h-4 w-4" /> Another topic
            </button>
          </div>
        )}
      </div>

      {(phase === 'prep' || phase === 'speaking') && (
        <div className="flex flex-col items-center gap-4">
          <Clock remainingMs={remainingMs} total={phase === 'prep' ? PREP_SEC : SPEAK_SEC} urgent={urgent} />
          {phase === 'prep' ? (
            <>
              <p className="text-sm text-muted-foreground">Think. Pick an angle and one example.</p>
              <button onClick={startSpeaking}
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
              <button onClick={() => stop(SPEAK_SEC - Math.ceil(remainingMs / 1000))}
                className="press rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
                Finish early
              </button>
            </>
          )}
        </div>
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
            <button onClick={nextTopic}
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <RefreshCw className="h-4 w-4" /> New topic
            </button>
            <button onClick={startSpeaking}
              className="press inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted">
              <RotateCcw className="h-4 w-4" /> Same topic again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
