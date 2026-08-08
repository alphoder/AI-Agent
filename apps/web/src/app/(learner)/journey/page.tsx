'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, PencilLine, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import {
  INTAKE_ROLES, INTAKE_OUTCOMES, INTAKE_STRUGGLES, INTAKE_INTENSITY, labelFor,
} from '@avatar-platform/shared';
import { Intake, type IntakeAnswers } from '@/components/journey/intake';
import { BuildingPlan } from '@/components/journey/building';
import { Roadmap, type PlanView } from '@/components/journey/roadmap';

type Phase = 'loading' | 'intake' | 'building' | 'plan' | 'error';

/** The answers echoed back on the building screen, so the wait feels like work. */
function buildingLines(a: IntakeAnswers): string[] {
  const lines = [`Reading what a ${labelFor(INTAKE_ROLES, a.role).toLowerCase()} actually faces`];
  if (a.outcomes.length) lines.push(`Aiming at: ${a.outcomes.map((o) => labelFor(INTAKE_OUTCOMES, o).toLowerCase()).join(', ')}`);
  if (a.struggles.length) lines.push(`Targeting: ${a.struggles.map((s) => labelFor(INTAKE_STRUGGLES, s).toLowerCase()).join(', ')}`);
  lines.push(`Sizing each day to ${a.minutesPerDay} minutes`);
  lines.push(`Setting difficulty: ${labelFor(INTAKE_INTENSITY, a.intensity).toLowerCase()}`);
  lines.push('Choosing your scenarios');
  return lines;
}

export default function JourneyPage() {
  const user = useAuth((s) => s.user);
  const firstName = (user?.name || '').split(' ')[0];

  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [certs, setCerts] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await apiClient.get('/journey');
      setStreak(data.data.streak ?? 0);
      setXp(data.data.xp ?? 0);
      setCerts((data.data.certificates ?? []).length);
      if (data.data.plan) { setPlan(data.data.plan); setPhase('plan'); }
      else setPhase('intake');
    } catch {
      setPhase('error');
    }
  }

  async function submitIntake(answers: IntakeAnswers) {
    setError(null);
    setLines(buildingLines(answers));
    setPhase('building');
    try {
      const { data } = await apiClient.post('/journey/intake', answers);
      setPlan(data.data.plan);
      setPhase('plan');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not build your plan. Please try again.');
      setPhase('intake');
    }
  }

  async function startNextWeek() {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/journey/plan/next-week');
      setPlan(data.data.plan);
      window.scrollTo({ top: 0 });
    } catch (e: any) {
      setError(e.response?.data?.error?.message ?? 'Could not build next week right now.');
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshPlan() {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/journey/plan/refresh');
      setPlan(data.data.plan);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not rebuild your plan right now.');
    } finally {
      setRefreshing(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div className="space-y-6">
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-card" />
        <div className="h-14 w-full animate-pulse rounded-xl bg-card" />
        <div className="h-56 w-full animate-pulse rounded-2xl bg-card" />
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">We could not load your journey.</p>
        <button onClick={() => { setPhase('loading'); load(); }} className="press mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          Try again
        </button>
      </div>
    );
  }

  if (phase === 'intake') return <Intake firstName={firstName} onSubmit={submitIntake} submitting={false} error={error} />;
  if (phase === 'building') return <BuildingPlan lines={lines} />;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <Roadmap
        plan={plan}
        streak={streak}
        xp={xp}
        certificates={certs}
        onNextWeek={startNextWeek}
        building={refreshing}
      />

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-border pt-5">
        <button
          onClick={refreshPlan}
          disabled={refreshing}
          className="press inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rebuild this week
        </button>
        <button
          onClick={() => { setPlan(null); setError(null); setPhase('intake'); }}
          className="press inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PencilLine className="h-3.5 w-3.5" /> Answer the questions again
        </button>
      </div>
    </div>
  );
}
