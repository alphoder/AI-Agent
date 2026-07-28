'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Play, BookOpen, MessageSquare, RotateCcw, Lock, Flame, Zap, Award } from 'lucide-react';
import { TASK_MINUTES, type PlanTaskType } from '@avatar-platform/shared';
import { cn } from '@/lib/utils';

export interface PlanTaskView {
  type: PlanTaskType;
  scenarioId: string;
  why: string;
  title: string;
  level: string | null;
  language: string;
  attempts: number;
  best: number | null;
  mastery: string;
  done: boolean;
  missing: boolean;
}
export interface PlanDayView { day: number; focus: string; tasks: PlanTaskView[]; done: boolean }
export interface PlanView { headline: string; days: PlanDayView[]; currentDay: number }

const TASK_ICON: Record<PlanTaskType, React.ReactNode> = {
  module: <BookOpen className="h-4 w-4" />,
  call: <Play className="h-4 w-4" />,
  drill: <MessageSquare className="h-4 w-4" />,
  review: <RotateCcw className="h-4 w-4" />,
};

const TASK_VERB: Record<PlanTaskType, string> = {
  module: 'Learn', call: 'Practise', drill: 'Drill', review: 'Raise your score',
};

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-muted-foreground">{icon}</span>
      <span>
        <span className="block text-lg font-bold leading-none tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{label}</span>
      </span>
    </div>
  );
}

export function Roadmap({ plan, streak, xp, certificates }: {
  plan: PlanView; streak: number; xp: number; certificates: number;
}) {
  const router = useRouter();
  const todayRef = useRef<HTMLLIElement>(null);

  // Land on today when today is far down the list. `nearest` is deliberate: it
  // does nothing when the card is already visible, so a day-1 plan does not jerk
  // the page on load. Instant, never smooth — the user did not ask to scroll.
  useEffect(() => {
    if (plan.currentDay <= 1) return;
    todayRef.current?.scrollIntoView({ block: 'nearest' });
  }, [plan.currentDay]);

  function open(t: PlanTaskView) {
    if (t.missing) return;
    if (t.type === 'drill') return router.push(`/drill/${t.scenarioId}`);
    // module, call and review all open the scenario module page; it owns the
    // Learn step and the pre-call brief, so nothing starts a call blind.
    router.push(`/scenarios/module/${t.scenarioId}`);
  }

  return (
    // Capped width: short rows read badly at full container width, and the far
    // right of the page is where the floating assistant sits.
    <div className="max-w-3xl space-y-8">
      <header className="space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Your plan</p>
          <h1 className="mt-1 text-balance text-3xl font-bold tracking-tight">{plan.headline || 'Your personalised path'}</h1>
        </div>
        <div className="flex flex-wrap gap-6">
          <Stat icon={<Flame className="h-4 w-4" />} value={streak} label={streak === 1 ? 'day streak' : 'day streak'} />
          <Stat icon={<Zap className="h-4 w-4" />} value={xp} label="XP" />
          <Stat icon={<Award className="h-4 w-4" />} value={certificates} label={certificates === 1 ? 'certificate' : 'certificates'} />
        </div>
      </header>

      <ol className="relative space-y-3">
        {plan.days.map((d) => {
          const isToday = d.day === plan.currentDay;
          const isPast = d.day < plan.currentDay;
          const minutes = d.tasks.reduce((n, t) => n + TASK_MINUTES[t.type], 0);

          // Past and future days collapse to a single line; today is the page.
          if (!isToday) {
            return (
              <li key={d.day} className="flex items-center gap-3 px-1">
                <span className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums',
                  d.done ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                )}>
                  {d.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : d.day}
                </span>
                <span className={cn('truncate text-sm', isPast ? 'text-muted-foreground' : 'text-muted-foreground/70')}>
                  {d.focus || `Day ${d.day}`}
                </span>
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground/60">{minutes}m</span>
              </li>
            );
          }

          return (
            <li key={d.day} ref={todayRef} className="rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Day {d.day} of {plan.days.length}</p>
                  <h2 className="mt-1 text-xl font-bold tracking-tight">{d.focus || 'Today'}</h2>
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{minutes} min</span>
              </div>

              <ul className="mt-4 space-y-2.5">
                {d.tasks.map((t, i) => (
                  <li key={`${t.scenarioId}-${i}`}>
                    <button
                      type="button"
                      onClick={() => open(t)}
                      disabled={t.missing}
                      className={cn(
                        'press group flex w-full items-center gap-3.5 rounded-xl border p-3.5 text-left',
                        'transition-[border-color,background-color] duration-200',
                        t.missing ? 'cursor-not-allowed border-border bg-muted/30 opacity-60'
                          : t.done ? 'border-border bg-card hover:border-primary/40'
                          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
                      )}
                    >
                      <span className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                        t.done ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground',
                      )}>
                        {t.missing ? <Lock className="h-4 w-4" /> : t.done ? <Check className="h-4 w-4" strokeWidth={3} /> : TASK_ICON[t.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium leading-tight">{t.title}</span>
                          {t.level && <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-muted-foreground">{t.level}</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                          {t.missing ? 'This scenario is no longer available' : t.why || TASK_VERB[t.type]}
                        </span>
                      </span>
                      {t.best != null && (
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{Math.round(t.best)}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
