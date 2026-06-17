'use client';

import { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { LANGUAGES } from '@avatar-platform/shared';

/** Searchable language list. Pick any of the supported languages. */
export function LanguagePicker({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (code: string) => void;
  className?: string;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return LANGUAGES;
    return LANGUAGES.filter((l) => l.name.toLowerCase().includes(term) || l.code.includes(term));
  }, [q]);

  return (
    <div className={className}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search languages…"
          className="w-full rounded-lg border border-border bg-card pl-9 pr-3 py-2 text-sm"
          autoFocus
        />
      </div>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
        {filtered.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">No match.</p>}
        {filtered.map((l) => (
          <button
            key={l.code}
            onClick={() => onChange(l.code)}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-muted/40 ${
              value === l.code ? 'bg-indigo-50 text-indigo-700 font-medium' : ''
            }`}
          >
            <span>{l.name}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {l.code}
              {value === l.code && <Check className="h-4 w-4 text-indigo-600" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
