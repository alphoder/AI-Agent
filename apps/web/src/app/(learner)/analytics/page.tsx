'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3 } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { Stat, AreaChart, BarList, SplitBar, Tile } from '@/components/charts/charts';

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

interface Analytics {
  range: string;
  totals: { calls: number; minutes: number; avgScore: number | null; bestScore: number | null };
  perDay: { day: string; minutes: number; calls: number }[];
  trend: { at: string; score: number; title: string }[];
  criteria: { name: string; score: number }[];
  conversation: { talkRatio: number | null; questions: number | null; fillers: number | null; sampled: number };
}

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

/**
 * Every number here is measured. The previous version derived words-per-minute,
 * filler counts and talk ratio from the overall score with an invented formula;
 * anything we have not actually measured now says so.
 */
export default function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [data, setData] = useState<Analytics | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { load(range); }, [range]);
  async function load(r: RangeKey) {
    setData(null);
    setFailed(false);
    try {
      const res = await apiClient.get(`/analytics/me?range=${r}`);
      setData(res.data.data);
    } catch {
      setFailed(true);
    }
  }

  const empty = data && data.totals.calls === 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">What your practice actually looks like over time.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              aria-pressed={range === r.key}
              className={`press rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                range === r.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load your analytics.</span>
          <button onClick={() => load(range)} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      {!data && !failed ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-2xl border border-border bg-card" />)}
        </div>
      ) : empty ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <BarChart3 className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-semibold">Nothing to measure yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Finish a call and your numbers start here.</p>
          <Link href="/journey" className="press mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            Go to my journey
          </Link>
        </div>
      ) : data ? (
        <>
          <div className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-4">
            <Stat label="Calls" value={data.totals.calls} />
            <Stat label="Practised" value={data.totals.minutes} suffix="min" />
            <Stat label="Average" value={data.totals.avgScore ?? '—'} hint={data.totals.avgScore == null ? 'No scored calls yet' : undefined} />
            <Stat label="Best" value={data.totals.bestScore ?? '—'} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Tile
              title="Minutes practised"
              hint={range === 'all' ? 'per active day' : 'per day'}
              empty={data.perDay.every((d) => d.minutes === 0) ? 'No practice in this window.' : undefined}
            >
              <AreaChart points={data.perDay.map((d) => ({ label: dayLabel(d.day), value: d.minutes }))} unit=" min" />
            </Tile>

            <Tile
              title="Score trend"
              hint={data.trend.length > 0 ? `${data.trend.length} scored ${data.trend.length === 1 ? 'call' : 'calls'}` : undefined}
              empty={data.trend.length < 2 ? 'Two scored calls draw a trend.' : undefined}
            >
              <AreaChart points={data.trend.map((t) => ({ label: dayLabel(t.at), value: t.score }))} maxHint={100} />
            </Tile>

            <Tile
              title="Skills"
              hint="average, out of 100"
              empty={data.criteria.length === 0 ? 'Skill averages appear once a call is scored.' : undefined}
            >
              <BarList items={data.criteria} />
            </Tile>

            <Tile
              title="How you talk"
              hint={data.conversation.sampled > 0 ? `from ${data.conversation.sampled} ${data.conversation.sampled === 1 ? 'call' : 'calls'}` : undefined}
              empty={data.conversation.sampled === 0 ? 'Measured on your next scored call.' : undefined}
            >
              <div className="space-y-5">
                {data.conversation.talkRatio != null && (
                  <div>
                    <p className="mb-2 text-xs text-muted-foreground">
                      Talk to listen <span className="text-muted-foreground/70">(35 to 45% is the discovery sweet spot)</span>
                    </p>
                    <SplitBar mine={data.conversation.talkRatio} ideal={[35, 45]} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Questions asked" value={data.conversation.questions ?? '—'} hint="per call" />
                  <Stat label="Filler words" value={data.conversation.fillers ?? '—'} hint="per call" />
                </div>
              </div>
            </Tile>
          </div>
        </>
      ) : null}
    </div>
  );
}
