'use client';

import { useMemo, useState } from 'react';
import { Clock, Target, Users, CalendarClock } from 'lucide-react';

/**
 * Dashboard activity event.
 *   type = 'session'   → a training session contribution (drives intensity)
 *   type = 'due'       → an assignment due date (amber dot on the cell)
 *   type = 'scheduled' → admin-planned start time (violet dot on the cell)
 */
export interface ActivityEvent {
  date: string;
  type: 'session' | 'due' | 'scheduled';
  title: string;
  subtitle?: string;
  /**
   * Stable identity used by intensityMetric='unique-learners' to count
   * distinct contributors per day. Defaults to `title` then `subtitle` if
   * omitted. Pass an explicit user-id or email here when the subtitle is
   * a human-readable metric string (e.g. "15 min · started 2:30 PM").
   */
  groupKey?: string;
  score?: number | null;
  href?: string;
}

interface ActivityCalendarProps {
  events: ActivityEvent[];
  /** How many weeks to show, ending on the current week. Default 26 ≈ 6 months. */
  weeks?: number;
  accent?: 'dashboard' | 'learners';
  /**
   * What the intensity measures for a given day.
   *   'sessions' (default) — count every 'session' event that day
   *   'unique-learners'    — count DISTINCT learner names (subtitle) that day;
   *                         use on the admin calendar so a day with 5 learners
   *                         active > a day where one learner ran 10 sessions
   */
  intensityMetric?: 'sessions' | 'unique-learners';
  /** Label rendered in the header summary: "N sessions" vs "N learners active" */
  metricLabel?: { singular: string; plural: string };
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Tailwind classes per intensity bucket. 0 = no activity, 4 = peak.
const PALETTES: Record<'dashboard' | 'learners', string[]> = {
  dashboard: [
    'bg-slate-100',
    'bg-blue-200',
    'bg-blue-400',
    'bg-blue-500',
    'bg-blue-700',
  ],
  learners: [
    'bg-slate-100',
    'bg-emerald-200',
    'bg-emerald-400',
    'bg-emerald-500',
    'bg-emerald-700',
  ],
};

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

/**
 * Pick an intensity bucket for a given count given the maximum count in the
 * visible window. 0 is always "no activity"; any positive count maps to
 * buckets 1..4 scaled linearly against max, so the darkest cell IS the
 * busiest day in the window.
 */
function bucketFor(count: number, max: number): number {
  if (count <= 0) return 0;
  if (max <= 0) return 0;
  if (max === 1) return 4;
  const r = count / max;
  if (r >= 0.80) return 4;
  if (r >= 0.55) return 3;
  if (r >= 0.30) return 2;
  return 1;
}

export function ActivityCalendar({
  events,
  weeks = 26,
  accent = 'dashboard',
  intensityMetric = 'sessions',
  metricLabel,
}: ActivityCalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Bucket events per day.
  //   countByDay: the metric per day (session count OR unique learners/subtitles)
  //   eventsByDay: full event list for hover/selected detail
  const { countByDay, eventsByDay } = useMemo(() => {
    const count = new Map<string, number>();
    const full = new Map<string, ActivityEvent[]>();
    const uniqueKeysByDay = new Map<string, Set<string>>(); // day → set of unique-learner keys

    for (const ev of events) {
      const d = new Date(ev.date);
      if (isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const key = dateKey(d);

      const arr = full.get(key) || [];
      arr.push(ev);
      full.set(key, arr);

      if (ev.type !== 'session') continue;
      if (intensityMetric === 'unique-learners') {
        // Prefer explicit groupKey; fall back to title, then subtitle.
        const learnerKey = (ev.groupKey || ev.title || ev.subtitle || '').trim().toLowerCase();
        if (!learnerKey) continue;
        const set = uniqueKeysByDay.get(key) || new Set<string>();
        set.add(learnerKey);
        uniqueKeysByDay.set(key, set);
      } else {
        count.set(key, (count.get(key) || 0) + 1);
      }
    }

    if (intensityMetric === 'unique-learners') {
      for (const [k, set] of uniqueKeysByDay) count.set(k, set.size);
    }

    return { countByDay: count, eventsByDay: full };
  }, [events, intensityMetric]);

  // 7 × weeks grid ending on the current week.
  const grid = useMemo(() => {
    const cols: Date[][] = [];
    const endOfWeek = new Date(today);
    const daysToSat = 6 - today.getDay();
    endOfWeek.setDate(today.getDate() + daysToSat);
    const startOfGrid = new Date(endOfWeek);
    startOfGrid.setDate(endOfWeek.getDate() - (weeks * 7 - 1));

    for (let w = 0; w < weeks; w++) {
      const col: Date[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(startOfGrid);
        date.setDate(startOfGrid.getDate() + w * 7 + d);
        col.push(date);
      }
      cols.push(col);
    }
    return cols;
  }, [today, weeks]);

  // Compute max count across visible days so the darkest swatch is
  // always the busiest day in the window (dynamic scale).
  const maxCount = useMemo(() => {
    let m = 0;
    grid.forEach((col) => {
      col.forEach((d) => {
        if (d > today) return;
        const n = countByDay.get(dateKey(d)) || 0;
        if (n > m) m = n;
      });
    });
    return m;
  }, [grid, countByDay, today]);

  // Month labels above the first column of each month.
  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = [];
    let lastMonth = -1;
    grid.forEach((col, i) => {
      const month = col[0].getMonth();
      if (month !== lastMonth) {
        if (col.some((d) => d.getMonth() === month && d.getDate() <= 7)) {
          labels.push({ week: i, label: MONTH_NAMES[month] });
          lastMonth = month;
        }
      }
    });
    return labels;
  }, [grid]);

  // Totals for the visible window
  const totals = useMemo(() => {
    let metric = 0;
    let dues = 0;
    let scheduled = 0;
    grid.forEach((col) => {
      col.forEach((d) => {
        const list = eventsByDay.get(dateKey(d)) || [];
        for (const e of list) {
          if (e.type === 'due') dues++;
          else if (e.type === 'scheduled') scheduled++;
        }
        if (d > today) return;
        metric += countByDay.get(dateKey(d)) || 0;
      });
    });
    return { metric, dues, scheduled };
  }, [grid, countByDay, eventsByDay, today]);

  const palette = PALETTES[accent];
  const activeKey = selected ?? hovered;
  const activeDate = activeKey ? grid.flat().find((d) => dateKey(d) === activeKey) : null;
  const activeEvents = activeKey ? (eventsByDay.get(activeKey) || []) : [];
  const activeCount = activeKey ? (countByDay.get(activeKey) || 0) : 0;

  const label = metricLabel || (
    intensityMetric === 'unique-learners'
      ? { singular: 'learner active', plural: 'learners active' }
      : { singular: 'session', plural: 'sessions' }
  );

  const CELL = 11;
  const GAP = 3;
  const weekColWidth = CELL + GAP;

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totals.metric}</span>{' '}
          {totals.metric === 1 ? label.singular : label.plural}{' '}
          in the last {weeks} weeks
          {totals.dues > 0 && (
            <span className="ml-2 text-muted-foreground">· {totals.dues} deadline{totals.dues !== 1 ? 's' : ''}</span>
          )}
          {totals.scheduled > 0 && (
            <span className="ml-2 text-muted-foreground">· {totals.scheduled} scheduled</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          {palette.map((c, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
          ))}
          <span>More</span>
          {maxCount > 0 && (
            <span className="ml-1 tabular-nums">(peak {maxCount})</span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto thin-scroll -mx-1 px-1">
        <div className="inline-flex flex-col gap-1">
          {/* Month row */}
          <div className="relative h-3" style={{ width: grid.length * weekColWidth + 28 }}>
            {monthLabels.map((m) => (
              <span
                key={m.week}
                className="absolute text-[10px] font-medium text-muted-foreground"
                style={{ left: 28 + m.week * weekColWidth, top: 0 }}
              >
                {m.label}
              </span>
            ))}
          </div>

          <div className="flex items-start gap-1">
            {/* Day-of-week labels */}
            <div className="flex flex-col gap-[3px] pr-1 pt-[2px]" style={{ width: 24 }}>
              {DAY_LABELS.map((l, i) => (
                <div
                  key={i}
                  className="text-[9px] text-muted-foreground leading-none flex items-center"
                  style={{ height: CELL }}
                >
                  {l}
                </div>
              ))}
            </div>

            <div className="flex gap-[3px]">
              {grid.map((col, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {col.map((d, di) => {
                    const key = dateKey(d);
                    const inFuture = d > today;
                    const count = countByDay.get(key) || 0;
                    const lvl = bucketFor(count, maxCount);
                    const dayEvents = eventsByDay.get(key) || [];
                    const hasDue = dayEvents.some((e) => e.type === 'due');
                    const hasScheduled = dayEvents.some((e) => e.type === 'scheduled');
                    const isToday = isSameDay(d, today);
                    const isSelected = selected === key;

                    return (
                      <button
                        key={di}
                        type="button"
                        onClick={() => !inFuture && setSelected(isSelected ? null : key)}
                        onMouseEnter={() => setHovered(key)}
                        onMouseLeave={() => setHovered(null)}
                        disabled={inFuture && !hasDue && !hasScheduled}
                        className={`relative rounded-sm transition-all ${
                          inFuture && !hasDue && !hasScheduled ? 'opacity-20' : ''
                        } ${
                          palette[lvl]
                        } ${
                          isSelected
                            ? 'ring-2 ring-primary ring-offset-1 ring-offset-card scale-110'
                            : isToday
                              ? 'ring-1 ring-foreground/40'
                              : 'hover:ring-1 hover:ring-foreground/30'
                        }`}
                        style={{ width: CELL, height: CELL }}
                        aria-label={`${d.toDateString()}: ${count} ${count === 1 ? label.singular : label.plural}${hasDue ? ', deadline' : ''}${hasScheduled ? ', scheduled' : ''}`}
                      >
                        {hasDue && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-card" />
                        )}
                        {hasScheduled && (
                          <span className="absolute -bottom-0.5 -left-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 ring-1 ring-card" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hover/selected detail */}
      {activeDate && (
        <div className="mt-4 border-t border-border/50 pt-3 animate-slide-up">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <p className="text-xs font-semibold">
              {activeDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {activeCount} {activeCount === 1 ? label.singular : label.plural}
              {activeEvents.filter((e) => e.type === 'due').length > 0 && (
                <> · {activeEvents.filter((e) => e.type === 'due').length} deadline{activeEvents.filter((e) => e.type === 'due').length !== 1 ? 's' : ''}</>
              )}
            </p>
          </div>
          {activeEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No activity.</p>
          ) : (
            <ul className="space-y-1">
              {activeEvents.slice(0, 8).map((e, i) => (
                <li key={i}>
                  {e.href ? (
                    <a
                      href={e.href}
                      className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors"
                    >
                      <EventIcon type={e.type} metric={intensityMetric} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{e.title}</p>
                        {e.subtitle && <p className="text-[10px] text-muted-foreground truncate">{e.subtitle}</p>}
                      </div>
                      {e.score != null && (
                        <span className={`text-xs font-semibold tabular-nums shrink-0 ${
                          e.score >= 80 ? 'text-emerald-700' :
                          e.score >= 60 ? 'text-amber-700' : 'text-rose-700'
                        }`}>
                          {Math.round(e.score)}%
                        </span>
                      )}
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1">
                      <EventIcon type={e.type} metric={intensityMetric} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{e.title}</p>
                        {e.subtitle && <p className="text-[10px] text-muted-foreground truncate">{e.subtitle}</p>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {activeEvents.length > 8 && (
                <li className="text-[10px] text-muted-foreground px-2">
                  + {activeEvents.length - 8} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EventIcon({ type, metric }: { type: ActivityEvent['type']; metric: 'sessions' | 'unique-learners' }) {
  if (type === 'due') {
    return (
      <div className="w-5 h-5 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
        <Target className="w-3 h-3 text-amber-700" strokeWidth={2.4} />
      </div>
    );
  }
  if (type === 'scheduled') {
    return (
      <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
        <CalendarClock className="w-3 h-3 text-blue-700" strokeWidth={2.4} />
      </div>
    );
  }
  if (metric === 'unique-learners') {
    return (
      <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
        <Users className="w-3 h-3 text-blue-700" strokeWidth={2.4} />
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded-md bg-blue-50 flex items-center justify-center shrink-0">
      <Clock className="w-3 h-3 text-blue-700" strokeWidth={2.4} />
    </div>
  );
}
