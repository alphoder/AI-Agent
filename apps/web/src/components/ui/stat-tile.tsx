'use client';

import Link from 'next/link';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { CountUp } from './count-up';
import { DomainAccent } from './page-header';

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  decimals?: number;
  delta?: { value: number; direction: 'up' | 'down'; label?: string };
  accent?: DomainAccent;
  href?: string;
  loading?: boolean;
}

/**
 * Dashboard stat tile with:
 *   - Gradient icon square
 *   - Animated count-up on mount
 *   - Optional delta pill (e.g. +12% this week)
 *   - Clickable (wraps in Link) with hover arrow
 *   - Skeleton state
 */
export function StatTile({
  icon: Icon,
  label,
  value,
  suffix = '',
  decimals = 0,
  delta,
  accent = 'dashboard',
  href,
  loading = false,
}: StatTileProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl shimmer-bg" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-20 rounded shimmer-bg" />
            <div className="h-7 w-16 rounded shimmer-bg" />
          </div>
        </div>
      </div>
    );
  }

  const content = (
    <div className="rounded-2xl border border-border/50 bg-card p-5 card-interactive relative overflow-hidden group">
      {/* Subtle corner accent */}
      <div className={`absolute -top-12 -right-12 w-28 h-28 rounded-full ${`bg-grad-${accent}`} opacity-[0.04] group-hover:opacity-[0.08] transition-opacity`} />

      <div className="flex items-center gap-4 relative">
        <div className={`w-12 h-12 rounded-xl ${`bg-grad-${accent}`} flex items-center justify-center shadow-md shadow-black/5 shrink-0`}>
          <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold tracking-tight mt-0.5 tabular-nums">
            <CountUp end={value} suffix={suffix} decimals={decimals} />
          </p>
          {delta && (
            <div className={`inline-flex items-center gap-1 mt-1 text-[11px] font-medium ${
              delta.direction === 'up' ? 'text-emerald-600' : 'text-rose-600'
            }`}>
              <span>{delta.direction === 'up' ? '↑' : '↓'}</span>
              <span>{delta.value}{delta.label ? ` ${delta.label}` : '%'}</span>
            </div>
          )}
        </div>
        {href && (
          <ArrowUpRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        )}
      </div>
    </div>
  );

  return href ? <Link href={href} className="block">{content}</Link> : content;
}
