'use client';

import { useEffect, useState } from 'react';
import { Wallet, Infinity as InfinityIcon, Phone, Gift, Clock } from 'lucide-react';
import apiClient from '@/lib/api-client';

interface Txn { delta_seconds: number; reason: string; ref: string | null; created_at: string }

// 1 token = 1 second of live voice practice.
const PACKS = [
  { price: '₹299', tokens: 1800 },
  { price: '₹499', tokens: 3600 },
  { price: '₹999', tokens: 9000 },
];

const REASON_LABEL: Record<string, string> = {
  starter: 'Welcome minutes',
  call: 'Practice call',
  topup: 'Top-up',
  streak_bonus: 'Streak reward',
  referral: 'Referral reward',
  allocation: 'Team allocation',
};

export default function WalletPage() {
  const [balance, setBalance] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(true);
  const [txns, setTxns] = useState<Txn[]>([]);

  useEffect(() => {
    apiClient.get('/wallet').then(({ data }) => {
      setBalance(data.data.balance_seconds);
      setUnlimited(data.data.unlimited);
      setTxns(data.data.transactions);
    }).catch(() => {});
  }, []);

  const mins = (s: number) => `${s < 0 ? '−' : ''}${Math.round(Math.abs(s) / 60)}m ${Math.abs(s) % 60}s`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary"><Wallet className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Practice minutes</h1>
          <p className="text-sm text-muted-foreground">Voice calls use minutes. Learning, drills and reports are always free.</p>
        </div>
      </div>

      {/* Balance */}
      <div className="rounded-3xl border border-primary/30 bg-primary/5 p-6">
        {unlimited ? (
          <div className="flex items-center gap-4">
            <InfinityIcon className="h-10 w-10 text-primary" />
            <div>
              <p className="text-2xl font-bold">Unlimited</p>
              <p className="text-sm text-muted-foreground">Free unlimited practice during the beta. Enjoy it — and practise daily.</p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Balance</p>
            <p className="mt-1 text-4xl font-bold">{balance != null ? mins(balance) : '—'}</p>
          </div>
        )}
      </div>

      {/* Packs — visible so the model is understood, disabled during beta */}
      <div>
        <h2 className="text-sm font-semibold">Top-up packs</h2>
        <p className="text-xs text-muted-foreground">1 token = 1 second of live voice practice. Learning, drills and reports stay free.</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {PACKS.map((p) => (
            <div key={p.price} className="rounded-2xl border border-border bg-card p-4 text-center opacity-70">
              <p className="text-xl font-bold">{p.price}</p>
              <p className="text-sm font-medium">{p.tokens.toLocaleString()} tokens</p>
              <p className="text-xs text-muted-foreground">≈ {Math.round(p.tokens / 60)} min of live practice</p>
              <button disabled className="mt-3 w-full cursor-not-allowed rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                Coming soon
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Payments aren&apos;t live yet — everything is free while we&apos;re in beta.</p>
      </div>

      {/* Ledger */}
      <div>
        <h2 className="text-sm font-semibold">Recent activity</h2>
        <div className="mt-2 divide-y divide-border/60 rounded-2xl border border-border bg-card">
          {txns.length === 0 && <p className="p-4 text-sm text-muted-foreground">No activity yet — take your first call!</p>}
          {txns.map((t, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">
                {t.reason === 'call' ? <Phone className="h-4 w-4" /> : t.reason === 'starter' ? <Gift className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
              </span>
              <span className="flex-1">{REASON_LABEL[t.reason] ?? t.reason}</span>
              <span className={`font-medium ${t.delta_seconds < 0 ? 'text-muted-foreground' : 'text-success'}`}>
                {t.delta_seconds > 0 ? '+' : ''}{mins(t.delta_seconds)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
