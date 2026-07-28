'use client';

import Link from 'next/link';
import { Mic, Pencil, Globe, Lock, Languages } from 'lucide-react';

export interface Scenario {
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

export const DIFFICULTY_STYLE: Record<string, string> = {
  beginner: 'bg-success/10 text-success',
  intermediate: 'bg-warning/10 text-warning',
  advanced: 'bg-destructive/10 text-destructive',
};

export const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

export function ScenarioCard({ s, starting, onStart }: { s: Scenario; starting: boolean; onStart: () => void }) {
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
          <Link href={`/scenarios/edit/${s.id}`} className="press rounded-full border border-border p-2 text-muted-foreground hover:bg-muted" title="Edit"><Pencil className="h-4 w-4" /></Link>
        )}
      </div>
    </div>
  );
}

export function FilterPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`press rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground'}`}>
      {children}
    </button>
  );
}
