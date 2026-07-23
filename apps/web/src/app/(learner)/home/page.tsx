'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Play, Pause, Check, Crown, Lock, X, Volume2, ChevronRight, BookOpen, Headphones, Phone } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LANGUAGES, GEMINI_VOICES, JOURNEY, type Mastery } from '@avatar-platform/shared';

/** Tiny renderer for our own static learn cards (bold + paragraphs only). */
function Md({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {text.split('\n\n').map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>') }} />
      ))}
    </div>
  );
}

interface Cap { speaker: 'agent' | 'customer'; text: string; start: number; end: number }

/** Model-call audio with synced captions and the "spot the technique" marker. */
function WatchPlayer({ unitKey, spot, spotNote }: { unitKey: string; spot: number; spotNote: string }) {
  const [caps, setCaps] = useState<Cap[] | null>(null);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch(`/watch/${unitKey}.json`).then((r) => r.json()).then(setCaps).catch(() => setCaps([]));
  }, [unitKey]);

  if (caps === null) return <div className="h-40 animate-pulse rounded-xl bg-muted/50" />;
  if (caps.length === 0) return <p className="text-sm text-muted-foreground">Model call coming soon for this unit.</p>;

  return (
    <div className="space-y-3">
      <audio
        ref={audioRef}
        src={`/watch/${unitKey}.wav`}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button
        onClick={() => (playing ? audioRef.current?.pause() : audioRef.current?.play())}
        className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playing ? 'Pause' : 'Play the model call'}
      </button>
      <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {caps.map((c, i) => {
          const active = t >= c.start && t < c.end + 0.35;
          const isSpot = i === spot;
          return (
            <div key={i}>
              <button
                onClick={() => { if (audioRef.current) { audioRef.current.currentTime = c.start; audioRef.current.play(); } }}
                className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                  active ? 'bg-primary/15' : 'hover:bg-muted/40'} ${isSpot ? 'ring-1 ring-primary/50' : ''}`}
              >
                <span className={`mr-2 text-[10px] font-semibold uppercase tracking-wider ${c.speaker === 'agent' ? 'text-primary' : 'text-muted-foreground'}`}>
                  {c.speaker}
                </span>
                {c.text}
              </button>
              {isSpot && <p className="mt-0.5 pl-3 text-xs italic text-primary">▲ {spotNote}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Lesson {
  key: string; unit: string; scenarioId: string | null; title: string; level: string | null;
  attempts: number; best: number | null; mastery: Mastery; state: 'done' | 'next' | 'upcoming';
}
interface Unit { key: string; title: string; drills: string; do: string[]; dont: string[]; lessons: Lesson[]; doneCount: number }

const MASTERY_STYLE: Record<Mastery, string> = {
  none: '',
  bronze: 'text-orange-600',
  silver: 'text-slate-400',
  gold: 'text-yellow-500',
};

/** Live mic level bar — the whole "mic check". */
function MicCheck() {
  const [level, setLevel] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      src.connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        an.getByteFrequencyData(buf);
        setLevel(Math.min(1, buf.reduce((s, v) => s + v, 0) / buf.length / 80));
        raf = requestAnimationFrame(tick);
      };
      tick();
      stopRef.current = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); ctx.close(); setLevel(null); };
    } catch { setErr(true); }
  }
  useEffect(() => () => stopRef.current?.(), []);

  if (err) return <p className="text-xs text-destructive">Mic blocked — allow microphone access in your browser bar.</p>;
  if (level === null) {
    return (
      <button onClick={start} className="press inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
        <Mic className="h-3.5 w-3.5" /> Test my mic
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Mic className="h-3.5 w-3.5 text-primary" />
      <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{level > 0.05 ? 'Hearing you ✓' : 'Say something…'}</span>
      <button onClick={() => stopRef.current?.()} className="text-xs text-muted-foreground underline">done</button>
    </div>
  );
}

export default function JourneyHome() {
  const router = useRouter();
  const [units, setUnits] = useState<Unit[]>([]);
  const [next, setNext] = useState<Lesson | null>(null);
  const [firstTimer, setFirstTimer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [brief, setBrief] = useState<{ lesson: Lesson; unit: Unit } | null>(null);
  const [detail, setDetail] = useState<{ description?: string; objective?: string; scoring_rubric?: { name: string }[]; voice?: string; language?: string } | null>(null);
  const [lang, setLang] = useState('en');
  const [voice, setVoice] = useState('Charon');
  const [starting, setStarting] = useState(false);
  const [step, setStep] = useState<'learn' | 'watch' | 'brief'>('brief');

  useEffect(() => {
    apiClient.get('/journey')
      .then(({ data }) => { setUnits(data.data.units); setNext(data.data.next); setFirstTimer(data.data.firstTimer); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sortedLangs = useMemo(() => [...LANGUAGES].sort((a, b) => a.name.localeCompare(b.name)), []);

  function openBriefing(lesson: Lesson, unit: Unit) {
    if (!lesson.scenarioId) return;
    setBrief({ lesson, unit });
    // First time in a lesson -> full Learn -> Watch -> Call loop; repeats jump to the call.
    setStep(lesson.attempts === 0 ? 'learn' : 'brief');
    setDetail(null);
    apiClient.get(`/scenarios/${lesson.scenarioId}`).then(({ data }) => {
      setDetail(data.data);
      setLang(data.data.language || 'en');
      setVoice(data.data.voice || 'Charon');
    }).catch(() => setDetail({}));
  }

  function startCall() {
    if (!brief?.lesson.scenarioId) return;
    setStarting(true);
    router.push(`/session/${brief.lesson.scenarioId}?lang=${lang}&voice=${voice}&grade=0`);
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />)}</div>;
  }

  return (
    <div className="space-y-8">
      {/* The one action */}
      {next && (
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{firstTimer ? 'Your first call' : 'Continue your journey'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{next.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {firstTimer
              ? 'A friendly first customer to get you talking. Check your mic, read the briefing, and just speak naturally.'
              : units.find((u) => u.key === next.unit)?.drills}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button onClick={() => openBriefing(next, units.find((u) => u.key === next.unit)!)}
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-4 w-4" /> Continue
            </button>
            <MicCheck />
          </div>
        </div>
      )}

      {/* Daily free drill — the habit that costs nothing */}
      {(() => {
        const all = units.flatMap((u) => u.lessons).filter((l) => l.scenarioId);
        if (all.length === 0) return null;
        const day = Math.floor(Date.now() / 86_400_000);
        const daily = all[day % all.length];
        return (
          <button onClick={() => router.push(`/drill/${daily.scenarioId}`)}
            className="press flex w-full items-center gap-3 rounded-2xl border border-success/30 bg-success/5 px-4 py-3 text-left transition-colors hover:bg-success/10">
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">FREE</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Daily text drill · {daily.title}</span>
              <span className="block text-xs text-muted-foreground">2 minutes of typed practice with live coaching — costs nothing, keeps the streak alive.</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        );
      })()}

      {/* The path */}
      {units.map((u) => (
        <section key={u.key}>
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-bold tracking-tight">{u.title}</h2>
              <p className="text-xs text-muted-foreground">{u.drills}</p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{u.doneCount}/{u.lessons.length}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {u.lessons.map((l) => (
              <button key={l.key} onClick={() => openBriefing(l, u)}
                className={`press flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                  l.state === 'next' ? 'border-primary bg-primary/10'
                  : l.mastery !== 'none' ? 'border-border bg-card'
                  : 'border-border/50 bg-card/50 hover:bg-card'}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  l.state === 'next' ? 'bg-primary text-primary-foreground'
                  : l.mastery !== 'none' ? 'bg-muted' : 'bg-muted/50 text-muted-foreground'}`}>
                  {l.mastery !== 'none' ? <Crown className={`h-4 w-4 ${MASTERY_STYLE[l.mastery]}`} />
                    : l.state === 'next' ? <Play className="h-4 w-4" />
                    : <Lock className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm ${l.state === 'next' ? 'font-semibold' : 'font-medium'}`}>{l.title}</span>
                  <span className="block text-xs capitalize text-muted-foreground">
                    {l.level}{l.best != null && ` · best ${Math.round(l.best)}`}{l.mastery !== 'none' && ` · ${l.mastery}`}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Briefing card */}
      {brief && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setBrief(null)}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-card p-6 shadow-xl animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{brief.unit.title}</p>
                <h3 className="mt-0.5 text-lg font-bold leading-tight">{brief.lesson.title}</h3>
              </div>
              <button onClick={() => setBrief(null)} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            {/* Micro-loop tabs: Learn -> Watch -> Call */}
            <div className="mt-3 flex gap-1 rounded-full border border-border bg-muted/30 p-1 text-xs font-medium">
              {([['learn', 'Learn', BookOpen], ['watch', 'Watch', Headphones], ['brief', 'Call', Phone]] as const).map(([k, label, Icon]) => (
                <button key={k} onClick={() => setStep(k)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 transition-colors ${step === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>

            {step === 'learn' && (() => {
              const j = JOURNEY.find((x) => x.key === brief.unit.key);
              return (
                <div className="mt-4 space-y-4">
                  {j && <Md text={j.learn} />}
                  <button onClick={() => setStep('watch')}
                    className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    <Headphones className="h-4 w-4" /> Hear it done
                  </button>
                </div>
              );
            })()}

            {step === 'watch' && (() => {
              const j = JOURNEY.find((x) => x.key === brief.unit.key);
              return (
                <div className="mt-4 space-y-4">
                  {j && <WatchPlayer unitKey={j.key} spot={j.spot} spotNote={j.spotNote} />}
                  <button onClick={() => setStep('brief')}
                    className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                    <Phone className="h-4 w-4" /> Your turn
                  </button>
                </div>
              );
            })()}

            {step === 'brief' && (detail === null ? (
              <div className="mt-4 h-24 animate-pulse rounded-xl bg-muted/50" />
            ) : (
              <div className="mt-4 space-y-4 text-sm">
                {detail.description && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who you&apos;re calling</p>
                    <p className="mt-1">{detail.description}</p>
                  </div>
                )}
                {detail.objective && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your objective</p>
                    <p className="mt-1">{detail.objective}</p>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                    <p className="text-xs font-semibold text-success">Do</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {brief.unit.do.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-semibold text-destructive">Don&apos;t</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                      {brief.unit.dont.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </div>
                </div>
                {Array.isArray(detail.scoring_rubric) && detail.scoring_rubric.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">You&apos;ll be scored on</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {detail.scoring_rubric.map((c, i) => (
                        <span key={i} className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{c.name}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                  <select value={lang} onChange={(e) => setLang(e.target.value)}
                    className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs outline-none">
                    {sortedLangs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                  <select value={voice} onChange={(e) => setVoice(e.target.value)}
                    className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs outline-none">
                    {GEMINI_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Volume2 className="h-3 w-3" /> voice</span>
                  <button onClick={() => router.push(`/drill/${brief.lesson.scenarioId}`)}
                    className="press rounded-full border border-success/40 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/10">
                    Text drill first (free)
                  </button>
                  <button onClick={startCall} disabled={starting}
                    className="press ml-auto inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    {brief.lesson.attempts > 0 ? <Check className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {starting ? 'Starting…' : brief.lesson.attempts > 0 ? 'Practice again' : 'Start the call'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
