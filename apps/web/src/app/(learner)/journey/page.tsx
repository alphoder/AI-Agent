'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mic, Play, Crown, Lock, ChevronRight, Flame, Zap, Award, Download, ArrowRight } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { JOURNEY, type Mastery } from '@avatar-platform/shared';

interface Lesson {
  key: string; unit: string; scenarioId: string | null; title: string; level: string | null;
  attempts: number; best: number | null; mastery: Mastery; state: 'done' | 'next' | 'upcoming'; review?: boolean;
}
interface Unit { key: string; title: string; drills: string; lessons: Lesson[]; doneCount: number }

const MASTERY_STYLE: Record<Mastery, string> = { none: '', bronze: 'text-orange-600', silver: 'text-slate-400', gold: 'text-yellow-500' };

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
  const user = useAuth((s) => s.user);
  const [units, setUnits] = useState<Unit[]>([]);
  const [next, setNext] = useState<Lesson | null>(null);
  const [firstTimer, setFirstTimer] = useState(false);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [certs, setCerts] = useState<{ unit_key: string; issued_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get('/journey')
      .then(({ data }) => {
        setUnits(data.data.units); setNext(data.data.next); setFirstTimer(data.data.firstTimer);
        setStreak(data.data.streak ?? 0); setXp(data.data.xp ?? 0); setCerts(data.data.certificates ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const openModule = (unitKey: string) => router.push(`/module/${unitKey}`);

  async function downloadCert(unitKey: string, issuedAt: string) {
    const j = JOURNEY.find((u) => u.key === unitKey);
    if (!j) return;
    const [{ pdf }, { CertificatePDF }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/certificate-pdf')]);
    const blob = await pdf(
      <CertificatePDF data={{ name: user?.name || 'SpeakCoach Learner', unitTitle: j.title, unitDrills: j.drills, date: new Date(issuedAt).toLocaleDateString() }} />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `speakcoach-certificate-${unitKey}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-card" />)}</div>;
  }

  return (
    <div className="space-y-8">
      {/* Game bar */}
      {(streak > 0 || xp > 0 || certs.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold ${streak > 0 ? 'border-orange-500/40 bg-orange-500/10 text-orange-500' : 'border-border text-muted-foreground'}`}>
            <Flame className="h-4 w-4" /> {streak}-day streak
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-semibold text-primary">
            <Zap className="h-4 w-4" /> {xp.toLocaleString()} XP
          </span>
          {certs.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-sm font-semibold text-yellow-600">
              <Award className="h-4 w-4" /> {certs.length} certificate{certs.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* The one action */}
      {next && (
        <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{firstTimer ? 'Start here' : 'Continue your journey'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{units.find((u) => u.key === next.unit)?.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {firstTimer ? 'Learn the technique, watch it done, then take your first live call. Check your mic below.' : units.find((u) => u.key === next.unit)?.drills}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <button onClick={() => openModule(next.unit)}
              className="press inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Play className="h-4 w-4" /> {firstTimer ? 'Open module 1' : 'Continue'}
            </button>
            <MicCheck />
          </div>
        </div>
      )}

      {/* Daily free drill */}
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

      {/* Earned certificates */}
      {certs.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {certs.map((c) => {
            const j = JOURNEY.find((u) => u.key === c.unit_key);
            return (
              <button key={c.unit_key} onClick={() => downloadCert(c.unit_key, c.issued_at)}
                className="press inline-flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-left text-xs hover:bg-yellow-500/10">
                <Award className="h-4 w-4 shrink-0 text-yellow-600" />
                <span>
                  <span className="block font-semibold">{j?.title ?? c.unit_key}</span>
                  <span className="text-muted-foreground">Certified {new Date(c.issued_at).toLocaleDateString()}</span>
                </span>
                <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
        </div>
      )}

      {/* The path — units are modules */}
      {units.map((u, idx) => (
        <section key={u.key}>
          <button onClick={() => openModule(u.key)} className="press group mb-3 flex w-full items-baseline justify-between text-left">
            <div>
              <h2 className="text-base font-bold tracking-tight">
                <span className="text-muted-foreground">Module {idx + 1} · </span>{u.title}
                <ArrowRight className="ml-1.5 inline h-4 w-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </h2>
              <p className="text-xs text-muted-foreground">{u.drills}</p>
            </div>
            <span className="text-xs font-medium text-muted-foreground">{u.doneCount}/{u.lessons.length}</span>
          </button>
          <div className="grid gap-2 sm:grid-cols-2">
            {u.lessons.map((l) => (
              <button key={l.key} onClick={() => openModule(u.key)}
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
                    {l.review && <span className="ml-1.5 rounded bg-warning/15 px-1 py-px text-[10px] font-semibold uppercase text-warning">review</span>}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
