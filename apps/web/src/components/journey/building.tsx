'use client';

import { useEffect, useState } from 'react';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

/**
 * The wait while Gemini writes the plan (15-25s). Rather than a spinner, we echo
 * the learner's own answers back one at a time, so the wait reads as work being
 * done on their behalf.
 */
export function BuildingPlan({ lines }: { lines: string[] }) {
  const [shown, setShown] = useState(1);

  useEffect(() => {
    if (shown >= lines.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), 1400);
    return () => clearTimeout(t);
  }, [shown, lines.length]);

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="relative">
        <div aria-hidden className="bixy-halo absolute inset-0 m-auto h-28 w-28" />
        <AssistantOrb state="loading" size={104} />
      </div>

      <h1 className="mt-8 text-2xl font-bold tracking-tight">Building your path</h1>
      <p className="mt-2 text-sm text-muted-foreground">This takes about twenty seconds.</p>

      <ul className="mt-8 w-full space-y-2.5 text-left" aria-live="polite">
        {lines.slice(0, shown).map((line, i) => (
          <li
            key={line}
            style={{ animationDelay: `${i * 60}ms` }}
            className="animate-chip-in flex items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground"
          >
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
