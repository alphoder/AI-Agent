'use client';

import { useId, useState } from 'react';
import {
  radarGeometry, weakestFirst, contribution, CRITERION_PASS, type Criterion as RCriterion,
} from '@/lib/report-charts';

/**
 * Chart primitives for the Review pages.
 *
 * The app's palette is deliberately monochrome (one accent, `--primary`), so every
 * chart here is SINGLE SERIES: no categorical palette to validate, no legend to
 * mis-read, and identity never rests on colour alone. Where two quantities share a
 * mark (the talk/listen split) both sides carry a direct label.
 *
 * Marks follow the house rules: 2px lines, recessive grid, rounded data-ends,
 * a hover layer on anything with a plot, and no second y-axis anywhere.
 */

const AXIS = 'hsl(var(--muted-foreground))';

/** A single number, big. Not every metric deserves a plot. */
export function Stat({ label, value, suffix, hint }: { label: string; value: string | number; suffix?: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums leading-none">
        {value}
        {suffix && <span className="ml-1 text-base font-semibold text-muted-foreground">{suffix}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Score out of 100 as a ring. Used on cards and as the report's hero. */
export function ScoreRing({ score, size = 64, stroke = 6, label }: { score: number | null; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score ?? 0)) / 100;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        {score != null && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="hsl(var(--primary))" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
            className="transition-[stroke-dasharray] duration-500 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums leading-none">{score != null ? Math.round(score) : '—'}</span>
        {label && <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</span>}
      </div>
    </div>
  );
}

interface Point { label: string; value: number }

/**
 * Area chart over time. Hover gives a crosshair + tooltip, because an HTML chart
 * that cannot be interrogated is a picture.
 */
export function AreaChart({ points, height = 120, unit = '', maxHint }: {
  points: Point[]; height?: number; unit?: string; maxHint?: number;
}) {
  const gid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return null;

  const w = 600, h = height, padY = 8;
  const max = Math.max(maxHint ?? 0, ...points.map((p) => p.value), 1);
  const x = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => padY + (1 - v / max) * (h - padY * 2);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${h} L${x(0).toFixed(1)},${h} Z`;
  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const rel = (e.clientX - box.left) / box.width;
          setHover(Math.max(0, Math.min(points.length - 1, Math.round(rel * (points.length - 1)))));
        }}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.22" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#g${gid})`} />
        <path d={line} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} vectorEffect="non-scaling-stroke"
          strokeLinejoin="round" strokeLinecap="round" />
        {active && (
          <line x1={x(hover as number)} x2={x(hover as number)} y1={0} y2={h} stroke={AXIS} strokeWidth={1}
            strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.6} />
        )}
      </svg>
      {active && (
        <div className="pointer-events-none absolute -top-1 left-0 right-0 flex justify-center">
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs shadow-sm">
            <span className="font-semibold tabular-nums">{active.value}{unit}</span>
            <span className="ml-1.5 text-muted-foreground">{active.label}</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for per-criterion averages. Direct-labelled, no axis needed. */
export function BarList({ items, suffix = '' }: { items: { name: string; score: number }[]; suffix?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm">{it.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{Math.round(it.score)}{suffix}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${Math.max(2, Math.min(100, it.score))}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The talk/listen split. Two quantities, both directly labelled, so the colours
 * are decoration rather than the only way to tell them apart.
 */
export function SplitBar({ mine, ideal }: { mine: number; ideal?: [number, number] }) {
  const you = Math.max(0, Math.min(100, mine));
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${you}%` }} />
        {ideal && (
          <span
            aria-hidden
            className="absolute inset-y-0 border-x border-dashed border-foreground/40"
            style={{ left: `${ideal[0]}%`, width: `${ideal[1] - ideal[0]}%` }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span><span className="font-semibold tabular-nums">{Math.round(you)}%</span> <span className="text-muted-foreground">you</span></span>
        <span><span className="font-semibold tabular-nums">{Math.round(100 - you)}%</span> <span className="text-muted-foreground">customer</span></span>
      </div>
    </div>
  );
}

/** A tile with a title and a chart, or an honest empty line instead of a fake plot. */
export function Tile({ title, hint, empty, children }: {
  title: string; hint?: string; empty?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="mt-4">
        {empty ? <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p> : children}
      </div>
    </section>
  );
}

/**
 * The rubric as a shape rather than a list.
 *
 * A spike on Discovery beside a dent on Closing reads in one glance; five bars
 * make you compare numbers. The dashed inner ring is the 3-of-5 pass line, so
 * "which criteria am I under the bar on" is answerable without reading a single
 * figure. Geometry comes from lib/report-charts so the PDF draws the same shape.
 */
export function RadarChart({ criteria, size = 260 }: { criteria: RCriterion[]; size?: number }) {
  if (criteria.length < 3) return null;   // two axes is a line, not a radar
  const g = radarGeometry(criteria, size, 62);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full max-w-[300px]" role="img"
      aria-label={`Rubric profile: ${criteria.map((c) => `${c.criterion_name} ${c.score} of 5`).join(', ')}`}>
      {g.rings.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke="hsl(var(--border))" strokeWidth={1} />
      ))}
      {g.spokes.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="hsl(var(--border))" strokeWidth={1} />
      ))}
      <polygon points={g.passShape} fill="none" stroke={AXIS} strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
      <polygon points={g.shape} fill="hsl(var(--primary) / 0.18)" stroke="hsl(var(--primary))" strokeWidth={2} strokeLinejoin="round" />
      {g.points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="hsl(var(--primary))" />
      ))}
      {g.points.map((p, i) => (
        <text key={i} x={p.labelX} y={p.labelY} textAnchor={p.anchor} dominantBaseline="middle"
          className="fill-muted-foreground" style={{ fontSize: 9 }}>
          {p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label}
        </text>
      ))}
    </svg>
  );
}

/**
 * Where the final score actually came from: each criterion's contribution in
 * POINTS of the 100, not its raw 1-5. A criterion can score badly and barely
 * matter, or score well and carry the whole call; the raw number hides both.
 */
export function ContributionBars({ criteria }: { criteria: RCriterion[] }) {
  const onRubric = criteria.filter((c) => !c.off_rubric);
  const total = onRubric.reduce((n, c) => n + c.weight, 0);
  if (total <= 0) return null;
  const rows = weakestFirst(onRubric).map((c) => ({
    name: c.criterion_name,
    got: contribution(c, total),
    max: contribution({ ...c, score: 5 }, total),
    passed: c.passed ?? c.score >= CRITERION_PASS,
    score: c.score,
  }));
  const widest = Math.max(...rows.map((r) => r.max), 1);

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className={r.passed ? 'font-semibold text-foreground' : 'font-semibold text-destructive'}>
                {r.got.toFixed(1)}
              </span>
              <span className="text-xs"> of {r.max.toFixed(1)} pts</span>
            </span>
          </div>
          {/* The full-width track is what this criterion COULD have contributed,
              so a short bar on a wide track is the biggest available win. */}
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" style={{ width: `${(r.max / widest) * 100}%` }}>
            <div className={`h-full rounded-full ${r.passed ? 'bg-success' : 'bg-destructive'}`}
              style={{ width: `${Math.max(2, (r.got / r.max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
