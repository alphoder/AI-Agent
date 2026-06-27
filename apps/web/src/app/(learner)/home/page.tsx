'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Mic, ArrowRight, Target, TrendingUp, Trophy } from 'lucide-react';
import { tagsForGoals, goalLabel } from '@avatar-platform/shared';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { CountUp } from '@/components/ui/count-up';
import { Accent } from '@/components/ui/accent';
import { JourneyCard, JourneyData } from '@/components/home/journey-card';

interface SessionRow { id: string; scenario_title: string; status: string; ended_at: string | null; overall_score: number | null }
interface Rec { id: string; title: string; description: string | null; language: string; difficulty_level: string }

function greeting(hour: number) {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
function scoreTint(s: number) {
  if (s >= 85) return 'text-primary';
  if (s >= 70) return 'text-success';
  if (s >= 40) return 'text-warning';
  return 'text-destructive';
}
function dayKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

/** Tiny inline score sparkline (oldest → newest). */
function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const w = 120, h = 34, max = 100, min = 0;
  const xs = (i: number) => (i / (points.length - 1)) * w;
  const ys = (v: number) => h - ((v - min) / (max - min)) * h;
  const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-[120px]" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1])} r={2.5} fill="hsl(var(--primary))" />
    </svg>
  );
}

export default function HomePage() {
  const user = useAuth((s) => s.user);
  const firstName = (user?.name || '').split(' ')[0];
  const onboarding = (user?.metadata as { onboarding?: { goals?: string[] } } | null)?.onboarding;
  const goals = useMemo(() => onboarding?.goals ?? [], [onboarding]);

  const [hello, setHello] = useState('Welcome back');
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [recs, setRecs] = useState<Rec[] | null>(null);

  useEffect(() => { setHello(greeting(new Date().getHours())); }, []);

  useEffect(() => {
    apiClient.get('/sessions').then(({ data }) => setSessions(data.data || [])).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    const tags = tagsForGoals(goals);
    const query = tags.length ? `tags=${encodeURIComponent(tags.join(','))}&limit=6` : 'difficulty=beginner&limit=6';
    apiClient.get(`/scenarios?${query}`).then(({ data }) => setRecs(data.data || [])).catch(() => setRecs([]));
  }, [goals]);

  const stats = useMemo(() => {
    const rows = sessions ?? [];
    const scored = rows.filter((s) => s.overall_score != null).map((s) => s.overall_score as number);
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;
    const best = scored.length ? Math.round(Math.max(...scored)) : null;
    // oldest→newest trend (sessions come newest-first)
    const trend = rows.filter((s) => s.overall_score != null).slice(0, 8).map((s) => s.overall_score as number).reverse();
    return { count: rows.length, avg, best, trend };
  }, [sessions]);

  const journey: JourneyData | null = useMemo(() => {
    if (sessions === null) return null;
    const days = new Set<string>();
    for (const s of sessions) if (s.ended_at) days.add(dayKey(new Date(s.ended_at)));
    const journeyDay = days.size;

    // streak: walk back from today (or yesterday) while days are present
    let streak = 0;
    const cur = new Date();
    if (!days.has(dayKey(cur))) cur.setDate(cur.getDate() - 1); // allow a 1-day grace
    while (days.has(dayKey(cur))) { streak++; cur.setDate(cur.getDate() - 1); }

    // days practised in the last 7 calendar days
    let daysThisWeek = 0;
    for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); if (days.has(dayKey(d))) daysThisWeek++; }

    const recentTitles = new Set(sessions.slice(0, 5).map((s) => s.scenario_title));
    const next = (recs ?? []).find((r) => !recentTitles.has(r.title)) ?? (recs ?? [])[0] ?? null;

    return {
      goalLabel: goals.length ? goalLabel(goals[0]) : null,
      journeyDay,
      streak,
      daysThisWeek,
      next: next ? { id: next.id, title: next.title, language: next.language } : null,
    };
  }, [sessions, recs, goals]);

  const recent = (sessions ?? []).slice(0, 4);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {hello}{firstName ? <>, <Accent>{firstName}</Accent></> : ''}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Your speaking practice, one calm conversation at a time.</p>
      </div>

      <JourneyCard data={journey} loading={sessions === null} />

      {/* Stats — secondary to the journey */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-1.5 text-muted-foreground"><Target className="h-3.5 w-3.5" /><span className="text-[11px] font-medium uppercase tracking-wider">Sessions</span></div>
          <p className="mt-1.5 text-3xl font-bold tracking-tight"><CountUp end={stats.count} /></p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /><span className="text-[11px] font-medium uppercase tracking-wider">Avg score</span></div>
            <Sparkline points={stats.trend} />
          </div>
          <p className={`mt-1.5 text-3xl font-bold tracking-tight ${stats.avg != null ? scoreTint(stats.avg) : ''}`}>
            {stats.avg != null ? <><CountUp end={stats.avg} /><span className="text-base font-medium text-muted-foreground">/100</span></> : '—'}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-1.5 text-muted-foreground"><Trophy className="h-3.5 w-3.5" /><span className="text-[11px] font-medium uppercase tracking-wider">Best</span></div>
          <p className={`mt-1.5 text-3xl font-bold tracking-tight ${stats.best != null ? scoreTint(stats.best) : ''}`}>
            {stats.best != null ? <><CountUp end={stats.best} /><span className="text-base font-medium text-muted-foreground">/100</span></> : '—'}
          </p>
        </div>
      </div>

      {/* Recommended for your goal */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            {goals.length ? <>Recommended for <Accent>{goalLabel(goals[0]).toLowerCase()}</Accent></> : 'Recommended to start'}
          </h2>
          <Link href="/scenarios" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
            All scenarios <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {recs === null ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-36 rounded-2xl border border-border bg-card animate-pulse" />)}</div>
        ) : recs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing here yet — explore the full library.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recs.slice(0, 3).map((r) => (
              <Link
                key={r.id}
                href={`/session/${r.id}?lang=${r.language || 'en'}`}
                className="press group flex flex-col rounded-2xl border border-border bg-card p-5 transition-[box-shadow,border-color] duration-200 hover:border-primary/40 hover:shadow-sm"
              >
                <h3 className="font-semibold leading-snug">{r.title}</h3>
                <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{r.description}</p>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                  <Mic className="h-3.5 w-3.5" /> Practice
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Jump back in */}
      {recent.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Jump back in</h2>
            <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
              Progress <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {recent.map((r) => (
              <Link key={r.id} href={`/reports?session=${r.id}`} className="flex items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/40">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.scenario_title}</p>
                  <p className="text-xs text-muted-foreground">{r.ended_at ? new Date(r.ended_at).toLocaleDateString() : 'In progress'}</p>
                </div>
                <span className={`text-sm font-semibold ${r.overall_score != null ? scoreTint(r.overall_score) : 'text-muted-foreground'}`}>
                  {r.overall_score != null ? `${Math.round(r.overall_score)}/100` : '—'}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
