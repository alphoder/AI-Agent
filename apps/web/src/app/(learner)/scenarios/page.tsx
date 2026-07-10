'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Mic, Pencil, Globe, Lock, Languages, X, Sparkles,
  Shield, HeartPulse, Car, PiggyBank, RefreshCw, Handshake, Building2, Headphones,
  Compass, Volume2, Square,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LanguagePicker } from '@/components/language-picker';
import { languageName, GEMINI_VOICES, voiceSampleUrl, accentsForLanguage } from '@avatar-platform/shared';

interface Scenario {
  id: string;
  title: string;
  description: string | null;
  language: string;
  voice: string;
  visibility: 'public' | 'private';
  difficulty_level: string;
  tags: string[];
  is_owner: boolean;
}

const DIFFICULTY_STYLE: Record<string, string> = {
  beginner: 'bg-success/10 text-success',
  intermediate: 'bg-warning/10 text-warning',
  advanced: 'bg-destructive/10 text-destructive',
};

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

// Scenario tags cluster into friendly categories. First matching tag wins.
const CATEGORIES: { key: string; label: string; blurb: string; icon: typeof Shield; match: string[] }[] = [
  { key: 'life', label: 'Life & Term', blurb: 'Protect the family that depends on them.', icon: Shield,
    match: ['term-life', 'family'] },
  { key: 'health', label: 'Health', blurb: 'Cover for hospital bills and peace of mind.', icon: HeartPulse,
    match: ['health', 'senior'] },
  { key: 'motor', label: 'Motor', blurb: 'Renew, retain and upsell car cover.', icon: Car,
    match: ['motor'] },
  { key: 'invest', label: 'Savings & Investments', blurb: 'ULIP, endowment, child and savings plans.', icon: PiggyBank,
    match: ['ulip', 'investment', 'endowment', 'savings', 'child-plan', 'compliance'] },
  { key: 'renewal', label: 'Renewals & Retention', blurb: 'Keep customers and grow the relationship.', icon: RefreshCw,
    match: ['renewal', 'upsell', 'retention'] },
  { key: 'service', label: 'Service & Claims', blurb: 'Reassure, resolve, and earn cross-sell.', icon: Headphones,
    match: ['claims', 'service', 'cross-sell'] },
  { key: 'closing', label: 'Objections & Closing', blurb: 'Handle pushback and lock the next step.', icon: Handshake,
    match: ['objection-handling', 'follow-up', 'closing', 'cold-call'] },
  { key: 'business', label: 'Group & Business', blurb: 'Corporate and SME insurance sales.', icon: Building2,
    match: ['group', 'b2b', 'sme'] },
];
const MORE = { key: 'more', label: 'More to explore', blurb: 'A few extras to round things out.', icon: Compass };

function categoryFor(tags: string[]): string {
  for (const tag of tags) { const hit = CATEGORIES.find((c) => c.match.includes(tag)); if (hit) return hit.key; }
  return MORE.key;
}

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ scenario: Scenario; step: number; lang: string; accent: string; locality: string; voice: string; grade: boolean } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function playSample(id: string) {
    audioRef.current?.pause();
    if (playing === id) { setPlaying(null); return; } // toggle off
    const a = new Audio(voiceSampleUrl(id));
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(id)).catch(() => setPlaying(null));
  }

  useEffect(() => { if (!picker) { audioRef.current?.pause(); setPlaying(null); } }, [picker]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (mine) params.set('mine', 'true');
      apiClient
        .get(`/scenarios?${params.toString()}`)
        .then(({ data }) => { if (!cancel) setScenarios(data.data); })
        .catch(() => !cancel && setScenarios([]))
        .finally(() => !cancel && setLoading(false));
    }, 200);
    return () => { cancel = true; clearTimeout(handle); };
  }, [q, mine]);

  const filtered = useMemo(
    () => (difficulty ? scenarios.filter((s) => s.difficulty_level === difficulty) : scenarios),
    [scenarios, difficulty],
  );
  const grouping = Boolean(q.trim()) || Boolean(difficulty) || mine;

  const grouped = useMemo(() => {
    const buckets = new Map<string, Scenario[]>();
    for (const s of filtered) {
      const key = categoryFor(s.tags);
      (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(s);
    }
    return [...CATEGORIES, MORE].map((c) => ({ ...c, items: buckets.get(c.key) ?? [] })).filter((c) => c.items.length > 0);
  }, [filtered]);

  function openPicker(s: Scenario) { setPicker({ scenario: s, step: 1, lang: '', accent: '', locality: '', voice: s.voice || 'Charon', grade: false }); }

  // Advance the step-by-step flow. Language -> Accent -> Locality -> Voice -> Start.
  function chooseLanguage(code: string) {
    const accents = accentsForLanguage(code);
    setPicker((p) => p && ({
      ...p, lang: code,
      // Single (or no) accent -> auto-pick it and skip straight to the locality step.
      accent: accents.length === 1 ? accents[0].code : '',
      step: accents.length > 1 ? 2 : 3,
    }));
  }
  function start() {
    if (!picker) return;
    setStarting(picker.scenario.id);
    const p = new URLSearchParams({ lang: picker.lang, voice: picker.voice, grade: picker.grade ? '1' : '0' });
    if (picker.accent) p.set('accent', picker.accent);
    if (picker.locality.trim()) p.set('locality', picker.locality.trim());
    router.push(`/session/${picker.scenario.id}?${p.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Practice library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Pick a scenario and start talking. Your mic and camera stay on your device.</p>
        </div>
        <Link href="/scenarios/create" className="press inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
          <Plus className="h-4 w-4" /> Create manually
        </Link>
      </div>

      {/* Build-your-own banner — says exactly what it does */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('bixy:build'))}
        className="press flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-5 w-5" /></span>
        <span className="flex-1">
          <span className="block font-semibold">Build your own practice call</span>
          <span className="block text-sm text-muted-foreground">Just tell Bixy the situation — it designs the customer and starts a live call for you in seconds.</span>
        </span>
        <span className="hidden shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground sm:inline-block">Talk to Bixy</span>
      </button>

      {/* Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search scenarios"
              className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-4 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            <Toggle active={!mine} onClick={() => setMine(false)}>All</Toggle>
            <Toggle active={mine} onClick={() => setMine(true)}>Mine</Toggle>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill active={!difficulty} onClick={() => setDifficulty(null)}>All levels</FilterPill>
          {DIFFICULTIES.map((d) => (
            <FilterPill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}><span className="capitalize">{d}</span></FilterPill>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 rounded-2xl border border-border bg-card animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted"><Mic className="h-7 w-7 text-muted-foreground" /></div>
          <p className="font-semibold">No scenarios found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a different search or level, or create your own.</p>
        </div>
      ) : grouping ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => <ScenarioCard key={s.id} s={s} starting={starting === s.id} onStart={() => openPicker(s)} />)}
        </div>
      ) : (
        <div className="space-y-10">
          {grouped.map((cat) => (
            <section key={cat.key}>
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><cat.icon className="h-4 w-4" /></span>
                <div>
                  <h2 className="text-sm font-semibold leading-tight">{cat.label}<span className="ml-2 text-xs font-normal text-muted-foreground">{cat.items.length}</span></h2>
                  <p className="text-xs text-muted-foreground">{cat.blurb}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cat.items.map((s) => <ScenarioCard key={s.id} s={s} starting={starting === s.id} onStart={() => openPicker(s)} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {picker && (() => {
        const accents = picker.lang ? accentsForLanguage(picker.lang) : [];
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setPicker(null)}>
          <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-card shadow-xl animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 pb-3">
              <div>
                <h3 className="font-semibold">Set up your call</h3>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{picker.scenario.title}</p>
              </div>
              <button onClick={() => setPicker(null)} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
              {/* Step 1 — Language */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Language</p>
                {picker.lang ? (
                  <button onClick={() => setPicker((p) => p && ({ ...p, lang: '', accent: '', step: 1 }))}
                    className="mt-1.5 flex w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3.5 py-2.5 text-sm">
                    <span className="font-medium">{languageName(picker.lang)}</span>
                    <span className="text-xs text-muted-foreground">Change</span>
                  </button>
                ) : (
                  <LanguagePicker value={picker.lang} onChange={chooseLanguage} className="mt-1.5" />
                )}
              </div>

              {/* Step 2 — Accent (only when the language has more than one) */}
              {picker.step >= 2 && accents.length > 1 && (
                <div className="animate-pop-in">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accent</p>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {accents.map((a) => (
                      <button key={a.code} onClick={() => setPicker((p) => p && ({ ...p, accent: a.code, step: Math.max(p.step, 3) }))}
                        className={`press rounded-full border px-3.5 py-1.5 text-sm transition-colors ${picker.accent === a.code ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted'}`}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3 — Locality (optional) */}
              {picker.step >= 3 && (
                <div className="animate-pop-in">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Where&apos;s the customer from? <span className="normal-case font-normal text-muted-foreground/70">(optional)</span></p>
                  <input
                    value={picker.locality}
                    onChange={(e) => setPicker((p) => p && ({ ...p, locality: e.target.value }))}
                    placeholder="e.g. Chennai, rural Punjab, South Mumbai"
                    className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  {picker.step < 4 && (
                    <button onClick={() => setPicker((p) => p && ({ ...p, step: 4 }))}
                      className="press mt-2 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-muted">
                      Continue
                    </button>
                  )}
                </div>
              )}

              {/* Step 4 — Customer voice (all 30) */}
              {picker.step >= 4 && (
                <div className="animate-pop-in">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer voice</p>
                  <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                    {GEMINI_VOICES.map((v) => (
                      <div key={v.id}
                        className={`flex items-center gap-2 rounded-md px-2.5 py-2 ${picker.voice === v.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                        <button onClick={() => setPicker((p) => p && ({ ...p, voice: v.id, step: Math.max(p.step, 5) }))}
                          className="flex-1 text-left">
                          <span className={`text-sm ${picker.voice === v.id ? 'font-semibold text-primary' : 'font-medium'}`}>{v.label}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{v.description}</span>
                        </button>
                        <button type="button" onClick={() => playSample(v.id)} title={`Hear ${v.label}`}
                          className="press shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                          {playing === v.id ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 5 — Body language + Start */}
              {picker.step >= 5 && (
                <div className="animate-pop-in space-y-4">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
                    <div>
                      <p className="text-sm font-medium">Grade my body language</p>
                      <p className="text-xs text-muted-foreground">Uses your camera to score posture &amp; presence. Off = voice only.</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={picker.grade}
                      onClick={() => setPicker((p) => (p ? { ...p, grade: !p.grade } : p))}
                      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${picker.grade ? 'bg-primary' : 'bg-muted'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform ${picker.grade ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0 bg-foreground'}`} />
                    </button>
                  </div>
                  <button onClick={start} disabled={starting === picker.scenario.id}
                    className="press flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                    <Mic className="h-4 w-4" /> {starting === picker.scenario.id ? 'Starting…' : `Start in ${languageName(picker.lang)}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  );
}

function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`press rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  );
}

function ScenarioCard({ s, starting, onStart }: { s: Scenario; starting: boolean; onStart: () => void }) {
  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-card p-5 transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-snug">{s.title}</h3>
        <span title={s.visibility} className="shrink-0 text-muted-foreground">
          {s.visibility === 'public' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">{s.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${DIFFICULTY_STYLE[s.difficulty_level] || 'bg-muted text-muted-foreground'}`}>{s.difficulty_level}</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"><Languages className="h-3 w-3" /> {s.language.toUpperCase()}</span>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={onStart} disabled={starting}
          className="press flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          <Mic className="h-4 w-4" /> {starting ? 'Starting…' : 'Practice'}
        </button>
        {s.is_owner && (
          <Link href={`/scenarios/${s.id}/edit`} className="press rounded-full border border-border p-2 text-muted-foreground hover:bg-muted" title="Edit"><Pencil className="h-4 w-4" /></Link>
        )}
      </div>
    </div>
  );
}
