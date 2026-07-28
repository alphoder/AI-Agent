'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams, notFound } from 'next/navigation';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { fetchAllScenarios } from '@/lib/scenarios';
import { categoryByKey, categoryFor, trackFor } from '@avatar-platform/shared';
import type { Scenario } from '@/components/scenarios/scenario-card';

/** Level 2: the tracks inside a category, with live counts. */
export default function CategoryPage() {
  const params = useParams();
  const categoryKey = String(params.category ?? '');
  const category = categoryByKey(categoryKey);

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
    for (const s of scenarios ?? []) {
      if (categoryFor(s.tags) !== categoryKey) continue;
      const t = trackFor(s.tags, categoryKey);
      m[t] = (m[t] ?? 0) + 1;
    }
    return m;
  }, [scenarios, categoryKey]);

  // An unknown category in the URL is a 404, not an empty page.
  if (!category) notFound();

  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <Link href="/scenarios" className="press inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> All scenarios
      </Link>

      <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
        <div className="relative aspect-[3/1] w-full sm:aspect-[4/1]">
          <Image src={category.image} alt="" fill priority sizes="100vw" className="object-cover" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
        </div>
        <div className="relative -mt-12 p-6">
          <h1 className="text-3xl font-bold tracking-tight">{category.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {category.blurb}{scenarios !== null && total > 0 ? ` ${total} scenarios.` : ''}
          </p>
        </div>
      </div>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load this category.</span>
          <button onClick={load} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {category.tracks.map((t) => {
          const n = counts[t.key] ?? 0;
          const empty = scenarios !== null && n === 0;
          return (
            <Link
              key={t.key}
              href={`/scenarios/${category.key}/${t.key}`}
              aria-disabled={empty}
              onClick={(e) => { if (empty) e.preventDefault(); }}
              className={`group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-[transform,border-color,box-shadow] duration-200 ${
                empty ? 'cursor-default opacity-55' : 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate font-semibold">{t.label}</span>
                  {scenarios === null ? (
                    <span className="h-3.5 w-6 animate-pulse rounded bg-muted" />
                  ) : (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{empty ? 'Coming soon' : n}</span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{t.blurb}</span>
              </span>
              {!empty && (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
