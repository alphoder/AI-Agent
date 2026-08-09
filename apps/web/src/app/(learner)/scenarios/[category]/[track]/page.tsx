'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, notFound } from 'next/navigation';
import { ChevronLeft, Search, Dices, ArrowUpDown, Mic } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { fetchAllScenarios, fetchMyGrades } from '@/lib/scenarios';
import { categoryByKey, trackByKey, categoryFor, trackFor, languageName, gradeFor } from '@avatar-platform/shared';
import { ScenarioCard, FilterPill, DIFFICULTIES, type Scenario } from '@/components/scenarios/scenario-card';

const SORTS = [
  { key: 'az', label: 'A to Z' },
  { key: 'za', label: 'Z to A' },
  { key: 'level-asc', label: 'Easiest first' },
  { key: 'level-desc', label: 'Hardest first' },
  { key: 'newest', label: 'Newest' },
] as const;
type SortKey = (typeof SORTS)[number]['key'];

const LEVEL_ORDER: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Level 3: the scenarios in one track, searchable, sortable, filterable. */
export default function TrackPage() {
  const params = useParams();
  const categoryKey = String(params.category ?? '');
  const trackKey = String(params.track ?? '');
  const category = categoryByKey(categoryKey);
  const track = trackByKey(categoryKey, trackKey);

  const [all, setAll] = useState<Scenario[] | null>(null);
  const [grades, setGrades] = useState<Map<string, { best: number | null; attempts: number }>>(new Map());
  const [showPassed, setShowPassed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState('');
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('level-asc');
  const [rolling, setRolling] = useState(false);
  const router = useRouter();

  useEffect(() => { load(); }, []);
  async function load() {
    setFailed(false);
    try {
      const [list, mine] = await Promise.all([fetchAllScenarios(), fetchMyGrades()]);
      setAll(list);
      setGrades(mine);
    } catch {
      setFailed(true);
      setAll([]);
    }
  }

  const inTrack = useMemo(
    () => (all ?? []).filter((s) => categoryFor(s.tags) === categoryKey && trackFor(s.tags, categoryKey) === trackKey),
    [all, categoryKey, trackKey],
  );

  const languages = useMemo(() => [...new Set(inTrack.map((s) => s.language))].sort(), [inTrack]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase().slice(0, 100);
    const out = inTrack.filter((s) => {
      // Passed scenarios leave this list: they live on Completed now. Failed and
      // attempted ones stay, because the next thing to do with them is run them again.
      const g = grades.get(s.id);
      if (!showPassed && gradeFor(g?.best ?? null, g?.attempts ?? 0) === 'completed') return false;
      if (difficulty && s.difficulty_level !== difficulty) return false;
      if (language && s.language !== language) return false;
      if (!needle) return true;
      return (
        s.title.toLowerCase().includes(needle) ||
        (s.description ?? '').toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle))
      );
    });
    if (sort === 'az') out.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'za') out.sort((a, b) => b.title.localeCompare(a.title));
    else if (sort === 'level-asc') out.sort((a, b) => (LEVEL_ORDER[a.difficulty_level] ?? 9) - (LEVEL_ORDER[b.difficulty_level] ?? 9));
    else if (sort === 'level-desc') out.sort((a, b) => (LEVEL_ORDER[b.difficulty_level] ?? 9) - (LEVEL_ORDER[a.difficulty_level] ?? 9));
    // 'newest' keeps the API's order, which is already newest-first.
    return out;
  }, [inTrack, q, difficulty, language, sort, grades, showPassed]);

  if (!category || !track) notFound();

  /** Pick from what is on screen, not the whole library. Pure client, no API. */
  function surpriseMe() {
    if (filtered.length === 0 || rolling) return;
    setRolling(true);
    const chosen = filtered[Math.floor(Math.random() * filtered.length)];
    // Let the dice finish its turn before we leave the page.
    setTimeout(() => router.push(`/scenarios/module/${chosen.id}`), 400);
  }

  const showing = all !== null;

  return (
    <div className="space-y-6">
      <Link href={`/scenarios/${category.key}`} className="press inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> {category.label}
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{track.label}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{track.blurb}</p>
        </div>
        <button
          onClick={surpriseMe}
          disabled={!showing || filtered.length === 0}
          title="Pick one at random from what you are looking at"
          className="press inline-flex shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Dices className={`h-4 w-4 ${rolling ? 'animate-spin' : ''}`} /> Surprise me
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${track.label.toLowerCase()}`}
            maxLength={100}
            className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill active={showPassed} onClick={() => setShowPassed((v) => !v)}>
            {showPassed ? 'Hide passed' : 'Show passed'}
          </FilterPill>
          <FilterPill active={!difficulty} onClick={() => setDifficulty(null)}>All levels</FilterPill>
          {DIFFICULTIES.map((d) => (
            <FilterPill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}><span className="capitalize">{d}</span></FilterPill>
          ))}
          {languages.length > 1 && (
            <>
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
              <FilterPill active={!language} onClick={() => setLanguage(null)}>All languages</FilterPill>
              {languages.map((l) => (
                <FilterPill key={l} active={language === l} onClick={() => setLanguage(l)}>{languageName(l)}</FilterPill>
              ))}
            </>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort scenarios"
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            >
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load these scenarios.</span>
          <button onClick={load} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      {!showing ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-2xl border border-border bg-card" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted"><Mic className="h-7 w-7 text-muted-foreground" /></div>
          <p className="font-semibold">{inTrack.length === 0 ? 'Nothing here yet' : 'No matches'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {inTrack.length === 0 ? 'This track is still being written.' : 'Try a different search or level.'}
          </p>
          {inTrack.length > 0 && (
            <button onClick={() => { setQ(''); setDifficulty(null); setLanguage(null); }}
              className="press mt-4 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <ScenarioCard key={s.id} s={s} starting={false}
              grade={gradeFor(grades.get(s.id)?.best ?? null, grades.get(s.id)?.attempts ?? 0)}
              onStart={() => router.push(`/scenarios/module/${s.id}`)} />
          ))}
        </div>
      )}

    </div>
  );
}
