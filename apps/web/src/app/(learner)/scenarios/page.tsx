'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus, Search, Mic, Pencil, Globe, Lock, Languages, X,
  Briefcase, TrendingUp, Users, Headphones, Megaphone, Stethoscope,
  MessageCircle, GraduationCap, Compass, Volume2, Square,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LanguagePicker } from '@/components/language-picker';
import { languageName, GEMINI_VOICES, voiceSampleUrl } from '@avatar-platform/shared';

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
const CATEGORIES: { key: string; label: string; blurb: string; icon: typeof Briefcase; match: string[] }[] = [
  { key: 'career', label: 'Interviews & Career', blurb: 'Land the role and grow into the next one.', icon: Briefcase,
    match: ['interview', 'career', 'promotion', 'salary', 'negotiation', 'behavioural', 'workplace', 'entrevista', 'carrera', 'entretien', 'carrière', 'करियर', 'इंटरव्यू'] },
  { key: 'sales', label: 'Sales & Persuasion', blurb: 'Win attention, handle objections, close.', icon: TrendingUp,
    match: ['sales', 'cold-calling', 'b2b', 'pitch', 'fundraising', 'startup', 'objection-handling', 'real-estate', 'persuasion', 'ventas', 'negociación'] },
  { key: 'leadership', label: 'Leadership & Feedback', blurb: 'Hard conversations, handled with care.', icon: Users,
    match: ['leadership', 'feedback', 'delegation', 'management', 'conflict'] },
  { key: 'support', label: 'Customer & Support', blurb: 'De-escalate and make it right.', icon: Headphones,
    match: ['support', 'de-escalation', 'service', 'hospitality'] },
  { key: 'speaking', label: 'Public Speaking', blurb: 'Command the room under pressure.', icon: Megaphone,
    match: ['public-speaking', 'q-and-a', 'media', 'pr', 'confidence'] },
  { key: 'healthcare', label: 'Healthcare', blurb: 'Clear, compassionate clinical talk.', icon: Stethoscope,
    match: ['healthcare', 'self-advocacy'] },
  { key: 'social', label: 'Social & Networking', blurb: 'Break the ice and keep it flowing.', icon: MessageCircle,
    match: ['networking', 'small-talk', 'social', 'dating'] },
  { key: 'learning', label: 'Education & Research', blurb: 'Teach, defend and discover.', icon: GraduationCap,
    match: ['education', 'academic', 'defense', 'product', 'research', 'discovery', 'tech'] },
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
  const [picker, setPicker] = useState<{ scenario: Scenario; lang: string; voice: string } | null>(null);
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

  function openPicker(s: Scenario) { setPicker({ scenario: s, lang: s.language || 'en', voice: s.voice || 'Aoede' }); }
  function start() {
    if (!picker) return;
    setStarting(picker.scenario.id);
    router.push(`/session/${picker.scenario.id}?lang=${picker.lang}&voice=${picker.voice}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Practice library</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Pick a scenario and start talking. Your mic and camera stay on your device.</p>
        </div>
        <Link href="/scenarios/create" className="press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Create scenario
        </Link>
      </div>

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

      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setPicker(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Choose your language</h3>
                <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{picker.scenario.title}</p>
              </div>
              <button onClick={() => setPicker(null)} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The coach will speak <span className="font-medium text-foreground">only</span> in <span className="font-medium text-foreground">{languageName(picker.lang)}</span> for the whole session.
            </p>
            <LanguagePicker value={picker.lang} onChange={(code) => setPicker((p) => (p ? { ...p, lang: code } : p))} className="mt-3" />
            <div className="mt-4">
              <span className="text-xs font-medium text-muted-foreground">Coach voice</span>
              <div className="mt-1.5 flex items-center gap-2">
                <select
                  value={picker.voice}
                  onChange={(e) => setPicker((p) => (p ? { ...p, voice: e.target.value } : p))}
                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                >
                  {GEMINI_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => playSample(picker.voice)}
                  className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
                  title="Hear this voice"
                >
                  {playing === picker.voice ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  {playing === picker.voice ? 'Stop' : 'Hear'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{GEMINI_VOICES.find((v) => v.id === picker.voice)?.description}</p>
            </div>
            <button onClick={start} disabled={starting === picker.scenario.id}
              className="press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              <Mic className="h-4 w-4" /> {starting === picker.scenario.id ? 'Starting…' : `Start in ${languageName(picker.lang)}`}
            </button>
          </div>
        </div>
      )}
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
