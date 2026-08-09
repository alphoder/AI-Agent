'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Plus, Sparkles, ArrowRight } from 'lucide-react';
import { fetchAllScenarios } from '@/lib/scenarios';
import { CATEGORIES, categoryFor } from '@avatar-platform/shared';
import type { Scenario } from '@/components/scenarios/scenario-card';

/**
 * Level 1 of the browser: a category grid. Counts come from one scenarios call
 * and are tallied client-side (36 rows; a per-category endpoint would be five
 * queries to save nothing).
 */
export default function ScenarioCategoriesPage() {
  const [scenarios, setScenarios] = useState<Scenario[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() {
    setFailed(false);
    try {
      setScenarios(await fetchAllScenarios());
    } catch {
      setFailed(true);
      setScenarios([]);
    }
  }

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of scenarios ?? []) { const k = categoryFor(s.tags); m[k] = (m[k] ?? 0) + 1; }
    return m;
  }, [scenarios]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scenarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pick the kind of conversation you want to get better at.</p>
        </div>
        <Link href="/scenarios/create" className="press inline-flex shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          <Plus className="h-4 w-4" /> Create
        </Link>
      </div>

      <button
        onClick={() => window.dispatchEvent(new CustomEvent('bixy:build'))}
        className="press flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5" /></span>
        <span className="flex-1">
          <span className="block font-semibold">Build your own practice call</span>
          <span className="block text-sm text-muted-foreground">
            Tell Bixy the situation and it designs the customer for you. It is yours alone, not added to the shared library.
          </span>
        </span>
        <span className="hidden shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:inline-block">Talk to Bixy</span>
      </button>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load the library.</span>
          <button onClick={load} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((c, i) => {
          const n = counts[c.key] ?? 0;
          const empty = scenarios !== null && n === 0;
          return (
            <Link
              key={c.key}
              href={`/scenarios/${c.key}`}
              aria-disabled={empty}
              onClick={(e) => { if (empty) e.preventDefault(); }}
              className={`group relative block overflow-hidden rounded-2xl border border-border bg-card transition-[transform,box-shadow,border-color] duration-200 ${
                empty ? 'cursor-default opacity-60' : 'hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg'
              }`}
            >
              <div className="relative aspect-[2/1] overflow-hidden bg-muted">
                <Image
                  src={c.image}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  priority={i < 3}
                  className={`object-cover transition-transform duration-300 ${empty ? 'grayscale' : 'group-hover:scale-[1.03]'}`}
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
              </div>
              <div className="relative -mt-10 space-y-1 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight">{c.label}</h2>
                  {scenarios === null ? (
                    <span className="h-4 w-10 animate-pulse rounded bg-muted" />
                  ) : empty ? (
                    <span className="shrink-0 text-xs text-muted-foreground">Coming soon</span>
                  ) : (
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">{n}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{c.blurb}</p>
                {!empty && scenarios !== null && (
                  <span className="inline-flex items-center gap-1 pt-1 text-sm font-medium text-primary">
                    Browse <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
