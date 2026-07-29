'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Crown, CheckCircle2, RotateCcw } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { categoryFor, categoryByKey, masteryFor, MASTERY, type Mastery } from '@avatar-platform/shared';
import { ScoreRing } from '@/components/charts/charts';
import { FilterPill } from '@/components/scenarios/scenario-card';

interface Completed {
  scenarioId: string;
  title: string;
  level: string | null;
  tags: string[];
  attempts: number;
  best: number | null;
  lastAt: string | null;
  lastSessionId: string | null;
}

const CROWN: Record<Exclude<Mastery, 'none'>, string> = {
  bronze: 'text-orange-600',
  silver: 'text-slate-400',
  gold: 'text-yellow-500',
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'gold', label: 'Gold' },
  { key: 'silver', label: 'Silver+' },
  { key: 'unranked', label: 'No crown yet' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

export default function CompletedPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Completed[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => { load(); }, []);
  async function load() {
    setFailed(false);
    try {
      const { data } = await apiClient.get('/analytics/completed');
      setRows(data.data ?? []);
    } catch {
      setFailed(true);
      setRows([]);
    }
  }

  const shown = useMemo(() => {
    const all = rows ?? [];
    if (filter === 'gold') return all.filter((r) => (r.best ?? 0) >= MASTERY.gold);
    if (filter === 'silver') return all.filter((r) => (r.best ?? 0) >= MASTERY.silver);
    if (filter === 'unranked') return all.filter((r) => masteryFor(r.best) === 'none');
    return all;
  }, [rows, filter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Completed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Every scenario you have finished, and your best result on each.</p>
      </div>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load your history.</span>
          <button onClick={load} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      {rows === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-card" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold">Nothing finished yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Every call you complete lands here with its best score.</p>
          <Link href="/journey" className="press mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Start your first call
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <FilterPill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</FilterPill>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{shown.length} of {rows.length}</span>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Nothing at that level yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((r) => {
                const cat = categoryByKey(categoryFor(r.tags));
                const mastery = masteryFor(r.best);
                return (
                  <article key={r.scenarioId}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                    {cat && (
                      <div className="relative h-20 w-full overflow-hidden bg-muted">
                        <Image src={cat.image} alt="" fill sizes="(max-width:640px) 100vw, 33vw" className="object-cover opacity-80" />
                        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                        <span className="absolute bottom-2 left-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat.label}</span>
                      </div>
                    )}
                    <div className="flex flex-1 items-start gap-3 p-4">
                      <ScoreRing score={r.best} size={56} stroke={5} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug">{r.title}</h2>
                          {mastery !== 'none' && <Crown className={`h-4 w-4 shrink-0 ${CROWN[mastery]}`} aria-label={mastery} />}
                        </div>
                        <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                          {r.level}{r.attempts > 0 && ` · ${r.attempts} ${r.attempts === 1 ? 'call' : 'calls'}`}{r.lastAt && ` · ${when(r.lastAt)}`}
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {r.lastSessionId && (
                            <Link href={`/reports?session=${r.lastSessionId}`}
                              className="press rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                              Report
                            </Link>
                          )}
                          <button onClick={() => router.push(`/scenarios/module/${r.scenarioId}`)}
                            className="press inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted">
                            <RotateCcw className="h-3 w-3" /> Again
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
