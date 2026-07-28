'use client';

import { useState } from 'react';
import { Check, PartyPopper, Sparkles } from 'lucide-react';
import type { UnitQuiz } from '@avatar-platform/shared';

/**
 * The "Your Turn" question. Zero stakes: points are cosmetic XP, so the answer is
 * checked client-side on purpose (no endpoint, nothing to cheat for).
 */
export function Quiz({ quiz, onAnswered }: { quiz: UnitQuiz; onAnswered?: (correct: boolean) => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = pick === quiz.correct;

  function submit() {
    if (!pick) return;
    setSubmitted(true);
    onAnswered?.(pick === quiz.correct);
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your turn</p>
        <p className="mt-0.5 font-semibold">{quiz.question}</p>
        <p className="text-xs text-muted-foreground">{quiz.hint}</p>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
        <p className="font-semibold">{quiz.client.role}</p>
        <p className="mt-1 text-muted-foreground"><span className="font-medium text-foreground">Focus:</span> {quiz.client.focus}</p>
        <p className="text-muted-foreground"><span className="font-medium text-foreground">Pain:</span> {quiz.client.pain}</p>
      </div>

      <div className="space-y-2">
        {quiz.options.map((o) => {
          const chosen = pick === o.id;
          const reveal = submitted && o.id === quiz.correct;
          const wrong = submitted && chosen && o.id !== quiz.correct;
          return (
            <button
              key={o.id}
              disabled={submitted}
              onClick={() => setPick(o.id)}
              className={`press flex w-full items-start gap-2 rounded-xl border p-3 text-left text-sm transition-[border-color,background-color] duration-200 ${
                reveal ? 'border-success bg-success/10'
                  : wrong ? 'border-destructive bg-destructive/10'
                  : chosen ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted/40'
              }`}
            >
              <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${chosen || reveal ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                {(chosen || reveal) && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span>
                <span className="font-semibold">Story {o.id}: {o.title}</span>
                <span className="block text-xs text-muted-foreground">{o.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {!submitted ? (
        <button onClick={submit} disabled={!pick}
          className="press w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Submit answer
        </button>
      ) : (
        <div className={`animate-pop-in rounded-xl border p-3 text-sm ${correct ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}>
          <p className={`flex items-center gap-1.5 font-semibold ${correct ? 'text-success' : 'text-warning'}`}>
            {correct ? <PartyPopper className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {correct ? 'Great choice!' : `The strongest pick is Story ${quiz.correct}.`}
          </p>
          <p className="mt-1 text-muted-foreground">{quiz.why}</p>
          <p className="mt-2 text-xs font-semibold">Why this works</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {quiz.whyBullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1"><Check className="mt-0.5 h-3 w-3 shrink-0 text-success" /> {b}</li>
            ))}
          </ul>
          {!correct && (
            <button onClick={() => { setSubmitted(false); setPick(null); }} className="mt-2 text-xs font-medium text-primary underline">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
