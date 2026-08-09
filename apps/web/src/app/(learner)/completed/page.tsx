'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Crown, CheckCircle2, RotateCcw } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { categoryFor, categoryByKey, masteryFor, gradeFor, PASS_MARK, type Mastery } from '@avatar-platform/shared';
import { ScoreRing } from '@/components/charts/charts';
import { GradeBadge } from '@/components/ui/grade-badge';

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
  // Silver darkens on a light canvas; slate-400 on white is under 3:1.
  silver: 'text-slate-500 dark:text-slate-400',
  gold: 'text-yellow-500',
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

/** One titled block of scenario cards. Both sections render the same card. */
function Section({ title, blurb, rows, empty, router }: {
  title: string; blurb: string; rows: Completed[]; empty: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">{rows.length}</span>
        <p className="ml-auto hidden text-xs text-muted-foreground sm:block">{blurb}</p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const cat = categoryByKey(categoryFor(r.tags));
            const mastery = masteryFor(r.best);
            const grade = gradeFor(r.best, r.attempts);
            return (
              <article key={r.scenarioId}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                {cat && (
                  <div className="relative h-24 w-full overflow-hidden bg-muted">
                    <Image src={cat.image} alt="" fill sizes="(max-width:640px) 100vw, 33vw" className="object-cover opacity-80" />
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
                    <span className="absolute bottom-2 left-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{cat.label}</span>
                    <GradeBadge grade={grade} className="absolute right-2 top-2" />
                  </div>
                )}
                <div className="flex flex-1 items-start gap-3 p-5">
                  <ScoreRing score={r.best} size={56} stroke={5} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-1.5">
                      <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-snug">{r.title}</h3>
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
    </section>
  );
}

export default function CompletedPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Completed[] | null>(null);
  const [failed, setFailed] = useState(false);

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

  // Two sections, split on the pass mark. Failed attempts are deliberately absent:
  // they stay in Scenarios so the next thing to do with them is to run them again.
  const { done, improve } = useMemo(() => {
    const all = rows ?? [];
    return {
      done: all.filter((r) => gradeFor(r.best, r.attempts) === 'completed'),
      improve: all.filter((r) => gradeFor(r.best, r.attempts) === 'attempted'),
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Completed</h1>
        <p className="mt-1 text-sm text-muted-foreground">Passed above, still to fix below. Failed runs stay in Scenarios.</p>
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
          <Section
            title="Completed"
            blurb={`Passed at ${PASS_MARK} or above. These are off your Scenarios list.`}
            rows={done}
            empty="Nothing passed yet. Score 70 on any scenario and it moves here."
            router={router}
          />
          <Section
            title="To improve"
            blurb="Finished, but under the pass mark. One better run moves them up."
            rows={improve}
            empty="Nothing waiting. Anything you finish below 70 shows up here."
            router={router}
          />
        </>
      )}
    </div>
  );
}
