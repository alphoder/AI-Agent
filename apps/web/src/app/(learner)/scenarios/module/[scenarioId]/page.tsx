'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen, Headphones, Pencil, Flag, Check, Clock, Target, Award, Play,
  ChevronLeft, ChevronRight, Crown, Mic, Languages,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { JOURNEY, JOURNEY_MINUTES, languageName, categoryFor, categoryByKey, type Mastery } from '@avatar-platform/shared';
import { Md, WatchPlayer } from '@/components/learn/watch-player';
import { Quiz } from '@/components/learn/quiz';
import { CallPicker, newPicker, type PickerState } from '@/components/scenarios/call-picker';
import type { Scenario } from '@/components/scenarios/scenario-card';

interface Lesson { key: string; scenarioId: string | null; title: string; level: string | null; attempts: number; best: number | null; mastery: Mastery }
interface Unit { key: string; title: string; lessons: Lesson[]; doneCount: number }
interface Branding { academy_name: string | null; accent_color: string | null; logo_url: string | null }

type Beat = 'learn' | 'watch' | 'practice' | 'apply';

/**
 * The scenario module page. Every scenario opens here before a call, whatever the
 * entry point (journey task, browse list, surprise-me).
 *
 * Scenarios inside the 9 journey units get the full Learn → Watch → Practice →
 * Apply loop (unit content, Watch audio, quiz). Anything else gets the degraded
 * module: Learn from the scenario's own description, straight to Practice — a
 * shorter page, never a broken one.
 */
export default function ScenarioModulePage() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const router = useRouter();

  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [unit, setUnit] = useState<Unit | null>(null);
  const [branding, setBranding] = useState<Branding>({ academy_name: null, accent_color: null, logo_url: null });
  const [xp, setXp] = useState(0);
  const [beat, setBeat] = useState<Beat>('learn');
  const [quizDone, setQuizDone] = useState(false);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => { load(); }, [scenarioId]);
  async function load() {
    setState('loading');
    try {
      const [scRes, jRes] = await Promise.all([
        apiClient.get(`/scenarios/${scenarioId}`),
        apiClient.get('/journey'),
      ]);
      const sc: Scenario = scRes.data.data;
      setScenario(sc);
      setBranding(jRes.data.data.branding ?? {});
      setXp(jRes.data.data.xp ?? 0);
      // The owning unit, if this scenario is part of the curriculum (titles are keys).
      const owning = (jRes.data.data.units as Unit[]).find((u) => u.lessons.some((l) => l.title === sc.title)) ?? null;
      setUnit(owning);
      setState('ready');
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } }).response?.status;
      setState(status === 404 || status === 400 ? 'missing' : 'error');
    }
  }

  const staticUnit = useMemo(() => (unit ? JOURNEY.find((u) => u.key === unit.key) : undefined), [unit]);
  const lesson = useMemo(() => unit?.lessons.find((l) => l.title === scenario?.title), [unit, scenario]);
  const moduleIndex = useMemo(() => (unit ? JOURNEY.findIndex((u) => u.key === unit.key) + 1 : 0), [unit]);

  // The degraded module has no Watch (no unit audio, no quiz) and no Apply recap source.
  const beats = useMemo(() => {
    const full = [
      { key: 'learn' as Beat, label: 'Learn', icon: BookOpen, min: 2 },
      { key: 'watch' as Beat, label: 'Watch', icon: Headphones, min: 3 },
      { key: 'practice' as Beat, label: 'Practice', icon: Pencil, min: 3 },
      { key: 'apply' as Beat, label: 'Apply', icon: Flag, min: 2 },
    ];
    return staticUnit ? full : full.filter((b) => b.key === 'learn' || b.key === 'practice');
  }, [staticUnit]);

  const beatIndex = beats.findIndex((b) => b.key === beat);
  const attempts = lesson?.attempts ?? 0;
  const best = lesson?.best ?? null;
  const mastery = lesson?.mastery ?? 'none';

  const beatDone: Record<Beat, boolean> = {
    learn: beatIndex > 0,
    watch: quizDone || beatIndex > beats.findIndex((b) => b.key === 'watch'),
    practice: attempts > 0,
    apply: mastery !== 'none',
  };

  const accent = branding.accent_color || undefined;
  const academy = branding.academy_name || 'SpeakCoach Academy';

  if (state === 'loading') return <div className="h-[70vh] animate-pulse rounded-2xl border border-border bg-card" />;
  if (state === 'missing') {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">
        This scenario is no longer available. <Link href="/scenarios" className="text-primary underline">Browse scenarios</Link>
      </div>
    );
  }
  if (state === 'error' || !scenario) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">We could not load this module.</p>
        <button onClick={load} className="press mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Try again</button>
      </div>
    );
  }

  const categoryLabel = categoryByKey(categoryFor(scenario.tags))?.label ?? 'Practice';
  const next = () => beatIndex < beats.length - 1 && setBeat(beats[beatIndex + 1].key);
  const prev = () => beatIndex > 0 && setBeat(beats[beatIndex - 1].key);

  return (
    // Capped width: keeps the bottom-bar Next button clear of the floating assistant.
    <div style={accent ? ({ ['--primary' as string]: hexToHsl(accent) }) : undefined} className="max-w-5xl space-y-5">
      {/* Header band */}
      <div className="rounded-3xl bg-foreground p-6 text-background">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">{academy}</p>
            {/* The band is bg-foreground (near-white in the dark shell), where
                --primary is also near-white. A fixed blue keeps the eyebrow
                readable on the inverted surface in both themes. */}
            <p className="mt-2 text-xs font-semibold uppercase tracking-wider" style={{ color: accent || '#2563eb' }}>
              {staticUnit ? `Module ${moduleIndex} of ${JOURNEY.length} · ${staticUnit.title}` : categoryLabel}
            </p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{scenario.title}</h1>
            {staticUnit && <p className="mt-1 text-sm opacity-80">{staticUnit.do[0]}</p>}
          </div>
          <div className="flex gap-5 text-sm">
            <Stat icon={Clock} value={`${staticUnit ? JOURNEY_MINUTES : beats.reduce((n, b) => n + b.min, 0)}:00`} label="Total time" />
            <Stat icon={Target} value={attempts > 0 ? `${attempts} ${attempts === 1 ? 'call' : 'calls'}` : 'Not yet'} label={best != null ? `Best ${Math.round(best)}` : 'Your progress'} />
            <Stat icon={Award} value={xp.toLocaleString()} label="Points" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        {/* Left rail: the stepper, nothing else */}
        <div className="space-y-1">
          {beats.map((b, i) => {
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
        </div>

        {/* Beat content */}
        <div className="rounded-2xl border border-border bg-card p-5">
          {beat === 'learn' && (
            <div className="space-y-4">
              <Tag>Learn</Tag>
              {staticUnit ? (
                <>
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
                </>
              ) : (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">{scenario.description || 'A live practice call.'}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">{scenario.difficulty_level}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      <Languages className="h-3 w-3" /> {languageName(scenario.language)}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          {beat === 'watch' && staticUnit && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <Tag>Watch</Tag>
                <p className="text-sm text-muted-foreground">Hear a top performer use this technique in a real call.</p>
                <WatchPlayer unitKey={staticUnit.key} spot={staticUnit.spot} spotNote={staticUnit.spotNote} />
              </div>
              <div className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                <Quiz quiz={staticUnit.quiz} onAnswered={() => setQuizDone(true)} />
              </div>
            </div>
          )}

          {beat === 'practice' && (
            <div className="space-y-4">
              <Tag>Practice</Tag>
              <p className="text-sm text-muted-foreground">The live call. Talk to the customer out loud; a coach scores the whole conversation afterwards.</p>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">The customer</p>
                <p className="mt-1 text-sm leading-relaxed">{scenario.description || scenario.title}</p>
              </div>
              <button onClick={() => setPicker(newPicker(scenario))}
                className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                <Mic className="h-4 w-4" /> {attempts > 0 ? 'Call again' : 'Start the call'}
              </button>
              {attempts > 0 && (
                <p className="text-xs text-muted-foreground">
                  {attempts} {attempts === 1 ? 'attempt' : 'attempts'} so far{best != null && `, best score ${Math.round(best)}`}.
                </p>
              )}
            </div>
          )}

          {beat === 'apply' && staticUnit && (
            <div className="space-y-4">
              <Tag>Apply</Tag>
              {mastery !== 'none' ? (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-4">
                  <Crown className={`h-8 w-8 shrink-0 ${mastery === 'gold' ? 'text-yellow-500' : mastery === 'silver' ? 'text-slate-400' : 'text-orange-600'}`} />
                  <div>
                    <p className="font-semibold capitalize">{mastery} earned</p>
                    <p className="text-sm text-muted-foreground">Best score {best != null ? Math.round(best) : 0}. Gold needs 85.</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Finish a call scoring 50 or better to earn your first crown on this scenario.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setPicker(newPicker(scenario))}
                  className="press inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                  <Play className="h-4 w-4" /> {mastery === 'none' ? 'Take the call' : 'Beat your score'}
                </button>
                <Link href="/journey" className="press inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted">
                  Back to my journey
                </Link>
              </div>
            </div>
          )}

          {/* Bottom bar: back · dots · next */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <button onClick={prev} disabled={beatIndex === 0}
              className="press inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:invisible">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex items-center gap-1.5" aria-hidden>
              {beats.map((b, i) => (
                <span key={b.key} className={`h-1.5 rounded-full transition-all duration-300 ${i === beatIndex ? 'w-6 bg-primary' : i < beatIndex ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border'}`} />
              ))}
            </div>
            {beatIndex < beats.length - 1 ? (
              <button onClick={next}
                className="press inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
                Next: {beats[beatIndex + 1].label} <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <span className="w-16" aria-hidden />
            )}
          </div>
        </div>
      </div>

      {picker && <CallPicker picker={picker} setPicker={setPicker} onClose={() => setPicker(null)} />}
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold uppercase text-primary">{children}</span></div>;
}

function Stat({ icon: Icon, value, label }: { icon: typeof Clock; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5 opacity-70" />
      <div><p className="font-bold leading-none">{value}</p><p className="text-xs opacity-70">{label}</p></div>
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
