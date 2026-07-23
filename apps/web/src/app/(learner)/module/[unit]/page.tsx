'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen, Headphones, Pencil, Flag, Check, Clock, Target, Award, Play,
  Download, FileText, Library, ChevronRight, Crown, PartyPopper, Sparkles,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { JOURNEY, JOURNEY_MINUTES, type Mastery, type UnitQuiz } from '@avatar-platform/shared';
import { Md, WatchPlayer } from '@/components/learn/watch-player';

interface Lesson { key: string; scenarioId: string | null; title: string; level: string | null; attempts: number; best: number | null; mastery: Mastery }
interface Unit { key: string; title: string; drills: string; do: string[]; dont: string[]; lessons: Lesson[]; doneCount: number }
interface Branding { academy_name: string | null; accent_color: string | null; logo_url: string | null }

type Beat = 'learn' | 'watch' | 'practice' | 'apply';
const BEATS: { key: Beat; label: string; icon: typeof BookOpen; min: number }[] = [
  { key: 'learn', label: 'Learn', icon: BookOpen, min: 2 },
  { key: 'watch', label: 'Watch', icon: Headphones, min: 3 },
  { key: 'practice', label: 'Practice', icon: Pencil, min: 3 },
  { key: 'apply', label: 'Apply', icon: Flag, min: 2 },
];

function Quiz({ quiz }: { quiz: UnitQuiz }) {
  const [pick, setPick] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = pick === quiz.correct;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your turn</p>
        <p className="mt-0.5 font-semibold">{quiz.question}</p>
        <p className="text-xs text-muted-foreground">{quiz.hint}</p>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
        <p className="font-semibold">{quiz.client.role}</p>
        <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Focus:</span> {quiz.client.focus}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">Pain:</span> {quiz.client.pain}</p>
      </div>
      <div className="space-y-2">
        {quiz.options.map((o) => {
          const chosen = pick === o.id;
          const reveal = submitted && o.id === quiz.correct;
          const wrong = submitted && chosen && o.id !== quiz.correct;
          return (
            <button key={o.id} disabled={submitted} onClick={() => setPick(o.id)}
              className={`flex w-full items-start gap-2 rounded-xl border p-3 text-left text-sm transition-colors ${
                reveal ? 'border-success bg-success/10' : wrong ? 'border-destructive bg-destructive/10'
                : chosen ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted/40'}`}>
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${chosen || reveal ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                {(chosen || reveal) && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span>
                <span className="font-semibold">Story {o.id}: {o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>
      {!submitted ? (
        <button onClick={() => pick && setSubmitted(true)} disabled={!pick}
          className="press w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Submit answer
        </button>
      ) : (
        <div className={`rounded-xl border p-3 text-sm ${correct ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
          <p className={`flex items-center gap-1.5 font-semibold ${correct ? 'text-success' : 'text-warning'}`}>
            {correct ? <PartyPopper className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {correct ? 'Great choice!' : `The strongest pick is Story ${quiz.correct}.`}
          </p>
          <p className="mt-1 text-muted-foreground">{quiz.why}</p>
          <p className="mt-2 text-xs font-semibold">Why this works</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {quiz.whyBullets.map((b, i) => <li key={i} className="flex items-start gap-1"><Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {b}</li>)}
          </ul>
          {!correct && <button onClick={() => { setSubmitted(false); setPick(null); }} className="mt-2 text-xs font-medium text-primary underline">Try again</button>}
        </div>
      )}
    </div>
  );
}

export default function ModulePage() {
  const { unit: unitKey } = useParams<{ unit: string }>();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [branding, setBranding] = useState<Branding>({ academy_name: null, accent_color: null, logo_url: null });
  const [xp, setXp] = useState(0);
  const [beat, setBeat] = useState<Beat>('learn');
  const [loading, setLoading] = useState(true);

  const staticUnit = useMemo(() => JOURNEY.find((u) => u.key === unitKey), [unitKey]);
  const moduleIndex = useMemo(() => JOURNEY.findIndex((u) => u.key === unitKey) + 1, [unitKey]);

  useEffect(() => {
    apiClient.get('/journey').then(({ data }) => {
      setUnit(data.data.units.find((u: Unit) => u.key === unitKey) ?? null);
      setBranding(data.data.branding ?? {});
      setXp(data.data.xp ?? 0);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [unitKey]);

  const accent = branding.accent_color || undefined;
  const academy = branding.academy_name || 'SpeakCoach Academy';

  async function downloadPlaybook() {
    if (!staticUnit) return;
    const [{ pdf }, { PlaybookPDF }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/playbook-pdf')]);
    const blob = await pdf(<PlaybookPDF data={{ academy, unitTitle: staticUnit.title, drills: staticUnit.drills, learn: staticUnit.learn, do: staticUnit.do, dont: staticUnit.dont }} />).toBlob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `playbook-${unitKey}.pdf`; a.click();
  }

  function launch(l: Lesson) {
    if (l.scenarioId) router.push(`/session/${l.scenarioId}?grade=0`);
  }

  if (loading) return <div className="h-[70vh] animate-pulse rounded-2xl border border-border bg-card" />;
  if (!unit || !staticUnit) return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">Module not found. <Link href="/home" className="text-primary underline">Back to journey</Link></div>;

  const practiceLessons = unit.lessons.filter((l) => l.level !== 'advanced');
  const applyLessons = unit.lessons.filter((l) => l.level === 'advanced');
  const beatDone: Record<Beat, boolean> = {
    learn: beat !== 'learn',
    watch: beat === 'practice' || beat === 'apply',
    practice: practiceLessons.some((l) => l.mastery !== 'none'),
    apply: applyLessons.some((l) => l.mastery !== 'none'),
  };

  return (
    <div style={accent ? ({ ['--primary' as string]: hexToHsl(accent) }) : undefined} className="space-y-5">
      {/* Branded header */}
      <div className="rounded-3xl bg-foreground p-6 text-background">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">{academy}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider" style={{ color: accent || 'hsl(var(--primary))' }}>Module {moduleIndex} of {JOURNEY.length}</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{unit.title}</h1>
            <p className="mt-1 text-sm opacity-80">{staticUnit.do[0]}</p>
          </div>
          <div className="flex gap-5 text-sm">
            <div className="flex items-center gap-2"><Clock className="h-5 w-5 opacity-70" /><div><p className="font-bold leading-none">{JOURNEY_MINUTES}:00</p><p className="text-xs opacity-70">Total time</p></div></div>
            <div className="flex items-center gap-2"><Target className="h-5 w-5 opacity-70" /><div><p className="font-bold leading-none">{unit.doneCount}/{unit.lessons.length}</p><p className="text-xs opacity-70">Progress</p></div></div>
            <div className="flex items-center gap-2"><Award className="h-5 w-5 opacity-70" /><div><p className="font-bold leading-none">{xp.toLocaleString()}</p><p className="text-xs opacity-70">Points</p></div></div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Left stepper */}
        <div className="space-y-1">
          {BEATS.map((b, i) => {
            const active = beat === b.key;
            const done = beatDone[b.key];
            return (
              <button key={b.key} onClick={() => setBeat(b.key)}
                className={`press flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted/50'}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {done && !active ? <Check className="h-4 w-4" /> : <b.icon className="h-4 w-4" />}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{i + 1}. {b.label}</span>
                  <span className="block text-xs text-muted-foreground">{b.min} min</span>
                </span>
              </button>
            );
          })}
          {/* Resources */}
          <div className="mt-4 space-y-1 border-t border-border pt-4">
            <p className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Resources</p>
            <button onClick={downloadPlaybook} className="press flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/50">
              <FileText className="h-4 w-4 text-muted-foreground" /><span><span className="block">Download</span><span className="block text-xs text-muted-foreground">{unit.title} Playbook</span></span>
            </button>
            <Link href="/scenarios" className="press flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted/50">
              <Library className="h-4 w-4 text-muted-foreground" /><span><span className="block">Story Library</span><span className="block text-xs text-muted-foreground">All scenarios</span></span>
            </Link>
          </div>
        </div>

        {/* Beat content */}
        <div className="rounded-2xl border border-border bg-card p-5">
          {beat === 'learn' && (
            <div className="space-y-4">
              <div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase text-primary">Learn</span></div>
              <Md text={staticUnit.learn} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                  <p className="text-xs font-semibold text-success">Do</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{staticUnit.do.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
                <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs font-semibold text-destructive">Don&apos;t</p>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{staticUnit.dont.map((d, i) => <li key={i}>{d}</li>)}</ul>
                </div>
              </div>
              <button onClick={() => setBeat('watch')} className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Headphones className="h-4 w-4" /> Watch it done
              </button>
            </div>
          )}

          {beat === 'watch' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase text-primary">Watch</span>
                <p className="text-sm text-muted-foreground">Hear a top performer use this technique in a real call.</p>
                <WatchPlayer unitKey={staticUnit.key} spot={staticUnit.spot} spotNote={staticUnit.spotNote} />
              </div>
              <div className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <Quiz quiz={staticUnit.quiz} />
                <button onClick={() => setBeat('practice')} className="press mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Pencil className="h-4 w-4" /> Now practise
                </button>
              </div>
            </div>
          )}

          {(beat === 'practice' || beat === 'apply') && (() => {
            const list = beat === 'practice' ? practiceLessons : applyLessons;
            return (
              <div className="space-y-4">
                <div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase text-primary">{beat}</span>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {beat === 'practice' ? 'Take the live call. Talk to the customer, get scored, earn your crown.' : 'The curveball — a harder persona. Prove you can do it under pressure.'}
                  </p>
                </div>
                <div className="space-y-2">
                  {list.map((l) => (
                    <div key={l.key} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${l.mastery !== 'none' ? 'border-border bg-card' : 'border-border/60'}`}>
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${l.mastery !== 'none' ? 'bg-muted' : 'bg-muted/50'}`}>
                        {l.mastery !== 'none' ? <Crown className={`h-4 w-4 ${l.mastery === 'gold' ? 'text-yellow-500' : l.mastery === 'silver' ? 'text-slate-400' : 'text-orange-600'}`} /> : <Play className="h-4 w-4 text-muted-foreground" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{l.title}</span>
                        <span className="block text-xs capitalize text-muted-foreground">{l.level}{l.best != null && ` · best ${Math.round(l.best)}`}{l.mastery !== 'none' && ` · ${l.mastery}`}</span>
                      </span>
                      <button onClick={() => launch(l)} className="press inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                        <Play className="h-3.5 w-3.5" /> {l.attempts > 0 ? 'Again' : 'Start'}
                      </button>
                    </div>
                  ))}
                  {list.length === 0 && <p className="text-sm text-muted-foreground">No {beat} calls in this module.</p>}
                </div>
                {beat === 'practice' && applyLessons.length > 0 && (
                  <button onClick={() => setBeat('apply')} className="press inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted">
                    <Flag className="h-4 w-4" /> Ready for the curveball
                  </button>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/** #RRGGBB -> "H S% L%" for the --primary CSS var (Tailwind hsl(var(--primary))). */
function hexToHsl(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
