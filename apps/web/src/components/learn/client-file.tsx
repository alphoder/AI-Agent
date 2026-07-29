'use client';

import { useState } from 'react';
import { User, HelpCircle, Check, X } from 'lucide-react';
import type { ClientBrief, BriefQuiz, BriefExchange } from '@avatar-platform/shared';
import { cn } from '@/lib/utils';

/**
 * The client file: who the learner is about to speak to.
 *
 * Deliberately contains no coaching. It is the intel a real agent would already
 * hold before dialling, so two learners reading it can still choose completely
 * different approaches.
 */
export function ClientFile({ brief }: { brief: ClientBrief }) {
  return (
    <div className="space-y-6">
      {/* Who */}
      <header className="flex items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-secondary">
          <User className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-xl font-bold leading-tight">{brief.name}</h3>
          <p className="text-sm text-muted-foreground">{brief.headline}</p>
        </div>
      </header>

      {/* Facts at a glance */}
      {brief.facts?.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-2xl border border-border bg-muted/20 p-4 sm:grid-cols-3">
          {brief.facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{f.label}</dt>
              <dd className="mt-0.5 text-sm leading-snug">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* Their life */}
      {brief.life?.length > 0 && (
        <section className="space-y-2.5">
          <h4 className="text-sm font-semibold">Their life</h4>
          {brief.life.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-muted-foreground">{p}</p>
          ))}
        </section>
      )}

      {/* Right now */}
      {brief.situation && (
        <section className="rounded-2xl border border-border bg-muted/20 p-4">
          <h4 className="text-sm font-semibold">Right now</h4>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{brief.situation}</p>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {brief.pressures?.length > 0 && (
          <Block title="What is pressing on them" items={brief.pressures} />
        )}
        {brief.standing?.length > 0 && (
          <Block title="Where they stand today" items={brief.standing} />
        )}
      </div>

      {brief.manner && (
        <section>
          <h4 className="text-sm font-semibold">How they come across</h4>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{brief.manner}</p>
        </section>
      )}

      {/* Honest gaps. Naming what the file does not know is the point: the rest
          only comes out if the learner earns it on the call. */}
      {brief.unknowns?.length > 0 && (
        <section className="rounded-2xl border border-dashed border-border p-4">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold">
            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" /> Not on file
          </h4>
          <ul className="mt-2 space-y-1">
            {brief.unknowns.map((u, i) => (
              <li key={i} className="text-sm text-muted-foreground">{u}</li>
            ))}
          </ul>
          <p className="mt-2.5 text-xs text-muted-foreground/70">
            You only find this out by asking well on the call.
          </p>
        </section>
      )}
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-2 space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-sm text-muted-foreground">
            <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A short model exchange, for scenarios with no recorded call. */
export function ExchangeReader({ exchange }: { exchange: BriefExchange[] }) {
  return (
    <ol className="space-y-3">
      {exchange.map((e, i) => (
        <li key={i} className={cn('flex', e.speaker === 'agent' ? 'justify-end' : 'justify-start')}>
          <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5', e.speaker === 'agent' ? 'rounded-br-sm bg-secondary' : 'rounded-bl-sm bg-muted')}>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {e.speaker === 'agent' ? 'You' : 'Them'}
            </p>
            <p className="mt-0.5 text-sm">{e.line}</p>
            {e.note && <p className="mt-1.5 border-t border-border/60 pt-1.5 text-xs italic text-muted-foreground">{e.note}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Did they read the file? One question, answerable only from the dossier. */
export function BriefCheck({ quiz, onDone }: { quiz: BriefQuiz; onDone?: () => void }) {
  const [pick, setPick] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const correct = pick === quiz.correct;

  return (
    <div className="space-y-3">
      <p className="font-semibold">{quiz.question}</p>
      <div className="space-y-2">
        {quiz.options.map((o) => {
          const chosen = pick === o.id;
          const reveal = submitted && o.id === quiz.correct;
          const wrong = submitted && chosen && o.id !== quiz.correct;
          return (
            <button
              key={o.id}
              type="button"
              disabled={submitted}
              onClick={() => setPick(o.id)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left text-sm transition-colors',
                reveal ? 'border-success bg-success/10'
                  : wrong ? 'border-destructive bg-destructive/10'
                  : chosen ? 'border-primary bg-primary/10'
                  : 'border-border hover:bg-muted/40',
              )}
            >
              <span className={cn(
                'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border',
                chosen || reveal ? 'border-primary bg-primary' : 'border-muted-foreground',
              )}>
                {(chosen || reveal) && <span className="h-1.5 w-1.5 rounded-full bg-background" />}
              </span>
              <span>{o.text}</span>
            </button>
          );
        })}
      </div>

      {!submitted ? (
        <button
          type="button"
          onClick={() => { if (pick) { setSubmitted(true); onDone?.(); } }}
          disabled={!pick}
          className="press w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          Submit answer
        </button>
      ) : (
        <div className={cn('rounded-xl border p-3 text-sm', correct ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5')}>
          <p className={cn('flex items-center gap-1.5 font-semibold', correct ? 'text-success' : 'text-warning')}>
            {correct ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {correct ? 'That is what the file says.' : `The file points to ${quiz.correct}.`}
          </p>
          <p className="mt-1 text-muted-foreground">{quiz.why}</p>
          {!correct && pick && quiz.whyNot?.[pick] && (
            <p className="mt-2 text-xs text-muted-foreground">Your pick: {quiz.whyNot[pick]}</p>
          )}
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
