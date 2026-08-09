'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, PencilLine, Loader2, PartyPopper } from 'lucide-react';
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

const EXTEND_LINES = [
  'You finished your journey — every task complete',
  'Gathering scenarios you have not yet passed',
  'Preparing your extended journey…',
];

export default function JourneyPage() {
  const user = useAuth((s) => s.user);
  const firstName = (user?.name || '').split(' ')[0];

  const [phase, setPhase] = useState<Phase>('loading');
  const [plan, setPlan] = useState<PlanView | null>(null);
  const [finished, setFinished] = useState(false);
  const [streak, setStreak] = useState(0);
  const [xp, setXp] = useState(0);
  const [certs, setCerts] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [extending, setExtending] = useState(false);
  const [generationsLeft, setGenerationsLeft] = useState(2);
  const [generationsLimit, setGenerationsLimit] = useState(2);
  // Guards the auto-extend so a double effect (StrictMode) or a re-run cannot
  // generate two extended plans for the same finished journey.
  const extendedRef = useRef(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await apiClient.get('/journey');
      setStreak(data.data.streak ?? 0);
      setXp(data.data.xp ?? 0);
      setCerts((data.data.certificates ?? []).length);
      setGenerationsLeft(data.data.generationsLeft ?? 0);
      setGenerationsLimit(data.data.generationsLimit ?? 2);
      if (data.data.plan) {
        setPlan(data.data.plan);
        setFinished(!!data.data.finished);
        setPhase('plan');
        // The plan is done: the free extended journey (passed scenarios
        // excluded) is generated automatically, right here.
        if (data.data.finished && !extendedRef.current) {
          extendedRef.current = true;
          void extendPlan();
        }
      } else {
        setPhase('intake');
      }
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
      setFinished(false);
      setGenerationsLeft(data.data.generationsLeft ?? Math.max(0, generationsLimit - 1));
      setPhase('plan');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not build your plan. Please try again.');
      setPhase('intake');
    }
  }

  /** POST /journey/extend — free, not metered by the monthly cap. */
  async function extendPlan() {
    setError(null);
    setLines(EXTEND_LINES);
    setExtending(true);
    setPhase('building');
    try {
      const { data } = await apiClient.post('/journey/extend');
      setPlan(data.data.plan);
      setFinished(false);
      setPhase('plan');
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not prepare your extended journey. Try again in a moment.');
      setFinished(true);
      setPhase('plan');
    } finally {
      setExtending(false);
    }
  }

  async function refreshPlan() {
    setRefreshing(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/journey/plan/refresh');
      setPlan(data.data.plan);
      setFinished(false);
      setGenerationsLeft(data.data.generationsLeft ?? 0);
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

  const outOfRebuilds = generationsLeft <= 0;

  return (
    <div className="space-y-6">
      {finished && (
        <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-5">
          <div className="flex items-start gap-3">
            <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="font-semibold">You finished your journey!</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {extending ? 'Preparing your extended journey…' : 'Your extended journey — built around what you have not passed yet — is ready to start.'}
              </p>
              {!extending && (
                <button
                  onClick={() => { extendedRef.current = true; void extendPlan(); }}
                  className="press mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {error ? 'Try again' : 'Start my extended journey'}
                </button>
              )}
            </div>
          </div>
          {error && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        </div>
      )}

      <Roadmap plan={plan} streak={streak} xp={xp} certificates={certs} />

      {!finished && error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
        <button
          onClick={refreshPlan}
          disabled={refreshing || outOfRebuilds}
          title={outOfRebuilds ? `You have used all ${generationsLimit} plan builds this month.` : undefined}
          className="press inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rebuild my plan
        </button>
        <button
          onClick={() => { setPlan(null); setError(null); setFinished(false); setPhase('intake'); }}
          className="press inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PencilLine className="h-3.5 w-3.5" /> Answer the questions again
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {outOfRebuilds
            ? `${generationsLimit} of ${generationsLimit} plan builds used this month`
            : `${generationsLeft} of ${generationsLimit} plan builds left this month`}
        </span>
      </div>
    </div>
  );
}
