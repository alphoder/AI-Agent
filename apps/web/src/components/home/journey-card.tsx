'use client';

import Link from 'next/link';
import { Flame, Mic, Sparkles } from 'lucide-react';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Accent } from '@/components/ui/accent';

export interface JourneyData {
  goalLabel: string | null;
  journeyDay: number; // distinct days practiced (1-based once they start)
  streak: number; // consecutive days incl. today/yesterday
  daysThisWeek: number; // 0..7
  next: { id: string; title: string; language: string } | null;
}

/**
 * The signature "adaptive journey" element. The lead card on Home: where you are
 * on your path, your streak, and the single next thing to do — one tap to talk.
 */
export function JourneyCard({ data, loading }: { data: JourneyData | null; loading?: boolean }) {
  if (loading || !data) {
    return <div className="h-44 rounded-3xl border border-border bg-card animate-pulse" />;
  }

  const started = data.journeyDay > 0;
  const heading = data.streak > 0 ? <><Accent>{data.streak}-day</Accent> streak</> : started ? 'Welcome back' : 'Start your journey';
  const sub = started
    ? `Day ${data.journeyDay} of your ${data.goalLabel ?? 'speaking'} path.`
    : `Your first session is the hardest — and the most worth it.`;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-6">
      {/* soft blue wash, top-right */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/[0.07] blur-2xl" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            {data.streak > 0 ? <Flame className="h-4 w-4 text-primary" /> : <Sparkles className="h-4 w-4 text-primary" />}
            Your path
          </div>
          <h2 className="mt-1.5 text-2xl font-bold tracking-tight">{heading}</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">{sub}</p>

          {data.next ? (
            <Link
              href={`/session/${data.next.id}?lang=${data.next.language || 'en'}`}
              className="press mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Mic className="h-4 w-4" />
              {started ? 'Continue' : 'Start'}: {data.next.title}
            </Link>
          ) : (
            <Link
              href="/scenarios"
              className="press mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Mic className="h-4 w-4" /> Browse scenarios
            </Link>
          )}
        </div>

        <div className="shrink-0">
          <ProgressRing
            value={Math.round((data.daysThisWeek / 7) * 100)}
            size={92}
            stroke={8}
            color="hsl(var(--primary))"
            label={
              <span className="flex flex-col items-center leading-none">
                <span className="text-xl font-bold">{data.daysThisWeek}</span>
                <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">/ 7 days</span>
              </span>
            }
          />
        </div>
      </div>
    </div>
  );
}
