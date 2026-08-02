'use client';

import { useEffect, useState } from 'react';
import { Trophy, Loader2, MapPin } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { INDIAN_STATES } from '@avatar-platform/shared';
import { cn } from '@/lib/utils';

const SCOPES = [
  { key: 'team', label: 'My team' },
  { key: 'org', label: 'My org' },
  { key: 'city', label: 'My city' },
  { key: 'state', label: 'My state' },
  { key: 'india', label: 'India' },
] as const;
type ScopeKey = (typeof SCOPES)[number]['key'];

const METRICS = [
  { key: 'minutes', label: 'Minutes' },
  { key: 'score', label: 'Avg score' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

interface Row { rank: number; userId: string; name: string; minutes: number; score: number | null; calls: number; isMe: boolean }
interface Board {
  scope: ScopeKey; metric: MetricKey; window: 'week' | 'all';
  scopeLabel: string | null;
  missing: 'org' | 'city' | 'state' | 'team' | null;
  rows: Row[]; me: Row | null; total: number;
}

// Silver needs to darken on a light canvas: slate-400 on white is ~2.6:1, under the
// 3:1 that a meaningful icon needs. Gold and bronze clear it in both themes.
const MEDAL = ['text-yellow-500', 'text-slate-500 dark:text-slate-400', 'text-orange-600'];

const PROMPT: Record<'org' | 'city' | 'state', { label: string; help: string }> = {
  org: { label: 'Where do you work or study?', help: 'Your company, school or college.' },
  city: { label: 'Which city?', help: 'Used only to group your board.' },
  state: { label: 'Which state?', help: 'Used only to group your board.' },
};

export default function CompetitionPage() {
  const [scope, setScope] = useState<ScopeKey>('india');
  const [metric, setMetric] = useState<MetricKey>('minutes');
  const [window_, setWindow] = useState<'week' | 'all'>('week');
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [scope, metric, window_]);
  async function load() {
    setBoard(null);
    setFailed(false);
    setDraft('');
    try {
      const { data } = await apiClient.get(`/competition?scope=${scope}&metric=${metric}&window=${window_}`);
      setBoard(data.data);
    } catch {
      setFailed(true);
    }
  }

  async function saveField(field: 'org' | 'city' | 'state') {
    if (!draft.trim() || saving) return;
    setSaving(true);
    try {
      await apiClient.patch('/profile', { [field]: draft.trim() });
      await load();
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const value = (r: Row) => (metric === 'score' ? (r.score ?? 0) : r.minutes);
  const top = board?.rows.length ? Math.max(...board.rows.map(value), 1) : 1;
  const unit = metric === 'score' ? '' : 'm';

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Competition</h1>
        <p className="mt-1 text-sm text-muted-foreground">Where you stand, from your team to all of India.</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {SCOPES.map((s) => (
            <button key={s.key} onClick={() => setScope(s.key)} aria-pressed={scope === s.key}
              className={cn('press rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
                scope === s.key ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-muted-foreground hover:text-foreground')}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {METRICS.map((m) => (
              <button key={m.key} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  metric === m.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1">
            {(['week', 'all'] as const).map((w) => (
              <button key={w} onClick={() => setWindow(w)} aria-pressed={window_ === w}
                className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  window_ === w ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                {w === 'week' ? 'This week' : 'All time'}
              </button>
            ))}
          </div>
          {board?.scopeLabel && (
            <span className="ml-auto text-xs text-muted-foreground">
              {board.scopeLabel} · {board.total} {board.total === 1 ? 'person' : 'people'}
            </span>
          )}
        </div>
      </div>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load this board.</span>
          <button onClick={load} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      {!board && !failed ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-card" />)}
        </div>
      ) : board?.missing === 'team' ? (
        <Empty title="You are not in a team yet" body="Join or create a team and this board fills with the people you practise alongside." />
      ) : board?.missing ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
              <MapPin className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{PROMPT[board.missing].label}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{PROMPT[board.missing].help} Others only ever see your name and your score.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {board.missing === 'state' ? (
                  <select value={draft} onChange={(e) => setDraft(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20">
                    <option value="">Choose a state</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <input value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 60))}
                    placeholder={board.missing === 'org' ? 'e.g. Aarambh Labs' : 'e.g. Lucknow'}
                    className="min-w-[12rem] rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
                )}
                <button onClick={() => saveField(board.missing as 'org' | 'city' | 'state')} disabled={!draft.trim() || saving}
                  className="press inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : board && board.rows.length === 0 ? (
        <Empty title="Nobody has practised yet" body={window_ === 'week' ? 'Try all time, or be the first this week.' : 'Be the first on this board.'} />
      ) : board ? (
        <>
          <ol className="space-y-1.5" key={`${scope}-${metric}-${window_}`}>
            {board.rows.map((r) => (
              <li key={r.userId}>
                <Line row={r} value={value(r)} top={top} unit={unit} metric={metric} />
              </li>
            ))}
          </ol>

          {/* Your row is pinned, even at #4,812. */}
          {board.me && !board.rows.some((r) => r.isMe) && (
            <div className="sticky bottom-4 rounded-xl border border-primary/40 bg-card p-1 shadow-lg">
              <Line row={board.me} value={value(board.me)} top={top} unit={unit} metric={metric} />
            </div>
          )}
          {!board.me && (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
              Finish a call and you appear on this board.
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

function Line({ row, value, top, unit, metric }: { row: Row; value: number; top: number; unit: string; metric: MetricKey }) {
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 transition-colors',
      row.isMe ? 'border-primary/40 bg-primary/5' : 'border-transparent bg-card',
    )}>
      <span className={cn('w-7 shrink-0 text-center text-sm font-bold tabular-nums', row.rank <= 3 ? MEDAL[row.rank - 1] : 'text-muted-foreground')}>
        {row.rank <= 3 ? <Trophy className="mx-auto h-4 w-4" aria-label={`rank ${row.rank}`} /> : row.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{row.name}</span>
          {row.isMe && <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground">You</span>}
        </span>
        <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
          <span className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(2, (value / top) * 100)}%` }} />
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums">{value}{unit}</span>
        <span className="block text-[10px] text-muted-foreground">
          {metric === 'score' ? `${row.calls} ${row.calls === 1 ? 'call' : 'calls'}` : `${row.calls} ${row.calls === 1 ? 'call' : 'calls'}`}
        </span>
      </span>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Trophy className="h-7 w-7 text-muted-foreground" />
      </div>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
