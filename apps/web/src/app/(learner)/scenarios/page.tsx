'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Mic, Pencil, Globe, Lock, Languages, X } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LanguagePicker } from '@/components/language-picker';
import { languageName } from '@avatar-platform/shared';

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
  beginner: 'bg-emerald-50 text-emerald-700',
  intermediate: 'bg-amber-50 text-amber-700',
  advanced: 'bg-rose-50 text-rose-700',
};

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ scenario: Scenario; lang: string } | null>(null);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (mine) params.set('mine', 'true');
    apiClient
      .get(`/scenarios?${params.toString()}`)
      .then(({ data }) => {
        if (!cancel) setScenarios(data.data);
      })
      .catch(() => !cancel && setScenarios([]))
      .finally(() => !cancel && setLoading(false));
    return () => {
      cancel = true;
    };
  }, [q, mine]);

  function openPicker(s: Scenario) {
    setPicker({ scenario: s, lang: s.language || 'en' });
  }

  function start() {
    if (!picker) return;
    setStarting(picker.scenario.id);
    router.push(`/session/${picker.scenario.id}?lang=${picker.lang}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Practice scenarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pick one and start talking. Your mic and camera stay on your device.
          </p>
        </div>
        <Link
          href="/scenarios/create"
          className="inline-flex items-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" /> Create scenario
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search scenarios"
            className="w-full rounded-full border border-border bg-card pl-9 pr-4 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => setMine(false)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${!mine ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground'}`}
        >
          All
        </button>
        <button
          onClick={() => setMine(true)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-medium ${mine ? 'bg-indigo-600 text-white' : 'bg-card border border-border text-muted-foreground'}`}
        >
          Mine
        </button>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-2xl border border-border/50 bg-card animate-pulse" />
          ))}
        </div>
      ) : scenarios.length === 0 ? (
        <div className="rounded-2xl border border-border/50 bg-card p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
            <Mic className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold">No scenarios found</p>
          <p className="text-sm text-muted-foreground mt-1">Try a different search, or create your own.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="group flex flex-col rounded-2xl border border-border/50 bg-card p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug">{s.title}</h3>
                <span title={s.visibility} className="text-muted-foreground">
                  {s.visibility === 'public' ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2 flex-1">{s.description}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${DIFFICULTY_STYLE[s.difficulty_level] || 'bg-slate-100 text-slate-600'}`}>
                  {s.difficulty_level}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-[11px] font-medium">
                  <Languages className="h-3 w-3" /> {s.language.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => openPicker(s)}
                  disabled={starting === s.id}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  <Mic className="h-4 w-4" /> {starting === s.id ? 'Starting…' : 'Practice'}
                </button>
                {s.is_owner && (
                  <Link
                    href={`/scenarios/${s.id}/edit`}
                    className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Language picker modal */}
      {picker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPicker(null)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">Choose your language</h3>
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{picker.scenario.title}</p>
              </div>
              <button onClick={() => setPicker(null)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              The coach will speak <span className="font-medium text-foreground">only</span> in{' '}
              <span className="font-medium text-foreground">{languageName(picker.lang)}</span> for the whole session.
            </p>
            <LanguagePicker
              value={picker.lang}
              onChange={(code) => setPicker((p) => (p ? { ...p, lang: code } : p))}
              className="mt-3"
            />
            <button
              onClick={start}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-indigo-700"
            >
              <Mic className="h-4 w-4" /> Start in {languageName(picker.lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
