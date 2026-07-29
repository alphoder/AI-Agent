'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Infinity as InfinityIcon, Phone, Gift, Sparkles, Users, Coins, X, Wallet as WalletIcon,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import { AreaChart, Tile } from '@/components/charts/charts';

interface Txn { delta_seconds: number; reason: string; ref: string | null; created_at: string }

// 1 token = 1 second of live voice practice.
const PACKS = [
  { price: '₹299', tokens: 1800, popular: false },
  { price: '₹499', tokens: 3600, popular: true },
  { price: '₹999', tokens: 9000, popular: false },
];

const REASON: Record<string, { label: string; icon: typeof Phone }> = {
  starter: { label: 'Welcome minutes', icon: Gift },
  call: { label: 'Practice call', icon: Phone },
  ai_note: { label: 'AI notes', icon: Sparkles },
  topup: { label: 'Top-up', icon: Coins },
  streak_bonus: { label: 'Streak reward', icon: Gift },
  referral: { label: 'Referral reward', icon: Gift },
  allocation: { label: 'Team allocation', icon: Users },
};

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export default function BalancePage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(true);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState<(typeof PACKS)[number] | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setFailed(false);
    try {
      const { data } = await apiClient.get('/wallet');
      setBalance(data.data.balance_seconds);
      setUnlimited(data.data.unlimited);
      setTxns(data.data.transactions ?? []);
    } catch {
      setFailed(true);
    }
  }

  /** 30 days of spend, from the ledger we already keep. Gaps are real zeros. */
  const spend = useMemo(() => {
    const byDay = new Map<string, number>();
    for (const t of txns) {
      if (t.delta_seconds >= 0) continue; // credits are not spend
      const day = new Date(t.created_at).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + Math.abs(t.delta_seconds) / 60);
    }
    const out: { label: string; value: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      out.push({ label: dayLabel(key), value: Math.round((byDay.get(key) ?? 0) * 10) / 10 });
    }
    return out;
  }, [txns]);

  const minutes = balance != null ? Math.floor(balance / 60) : 0;
  const spentAny = spend.some((d) => d.value > 0);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Balance</h1>
        <p className="mt-1 text-sm text-muted-foreground">One token is one second of live practice. Learning, drills and reports are always free.</p>
      </div>

      {failed && (
        <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="text-muted-foreground">We could not load your balance.</span>
          <button onClick={load} className="press rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Try again</button>
        </div>
      )}

      {/* Hero */}
      <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-border bg-card p-6">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-secondary">
          {unlimited ? <InfinityIcon className="h-7 w-7" /> : <WalletIcon className="h-7 w-7" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Practice left</p>
          {balance === null ? (
            <span className="mt-1 block h-9 w-32 animate-pulse rounded bg-muted" />
          ) : unlimited ? (
            <p className="mt-0.5 text-3xl font-bold leading-none">Unlimited</p>
          ) : (
            <p className="mt-0.5 text-3xl font-bold leading-none tabular-nums">
              {minutes}<span className="ml-1.5 text-base font-semibold text-muted-foreground">min</span>
              <span className="ml-2 text-sm font-normal text-muted-foreground">({balance.toLocaleString()} tokens)</span>
            </p>
          )}
        </div>
        {unlimited && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            Free while in beta
          </span>
        )}
      </div>

      <Tile title="Spent" hint="last 30 days" empty={!spentAny ? 'No practice spend yet.' : undefined}>
        <AreaChart points={spend} unit=" min" />
      </Tile>

      {/* Packs */}
      <div>
        <h2 className="text-sm font-semibold">Top up</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">Not needed during beta. Here is what it will cost.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {PACKS.map((p) => (
            <button
              key={p.price}
              onClick={() => setSheet(p)}
              className={`press rounded-2xl border p-5 text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 ${
                p.popular ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border'
              } bg-card`}
            >
              {p.popular && <span className="mb-2 inline-block rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Popular</span>}
              <p className="text-2xl font-bold tabular-nums">{p.price}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {p.tokens.toLocaleString()} tokens · {Math.round(p.tokens / 60)} min
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Ledger */}
      <div>
        <h2 className="text-sm font-semibold">Activity</h2>
        {txns.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nothing yet. Your first call shows up here.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {txns.map((t, i) => {
              const meta = REASON[t.reason] ?? { label: t.reason.replace(/_/g, ' '), icon: Coins };
              const credit = t.delta_seconds >= 0;
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                    <meta.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium capitalize">{meta.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(t.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${credit ? 'text-success' : 'text-muted-foreground'}`}>
                    {credit ? '+' : '−'}{Math.abs(t.delta_seconds).toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Buying is not built. Say so plainly rather than faking a checkout. */}
      {sheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-4 sm:items-center" onClick={() => setSheet(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl animate-pop-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">Payments are coming</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {sheet.price} for {sheet.tokens.toLocaleString()} tokens is the planned price. You cannot buy yet, and you do not need to:
                  practice is free for everyone during the beta.
                </p>
              </div>
              <button onClick={() => setSheet(null)} aria-label="Close" className="press shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <button onClick={() => setSheet(null)} className="press mt-5 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
