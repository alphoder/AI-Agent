'use client';

import { useMemo, useState } from 'react';
import { Clock, Target } from 'lucide-react';

/**
 * Dashboard activity event.
 *   type = 'session'  → a training session (coloured by intensity level)
 *   type = 'due'      → an assignment due date (marked with amber corner)
 */
export interface ActivityEvent {
  date: string;        // ISO — we bucket by YYYY-MM-DD
  type: 'session' | 'due';
  title: string;
  subtitle?: string;
  score?: number | null;
  href?: string;
}

interface ActivityCalendarProps {
  events: ActivityEvent[];
  /** How many weeks to show, ending on the current week. Default 26 ≈ 6 months. */
  weeks?: number;
  accent?: 'dashboard' | 'learners';
}

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Tailwind classes per intensity level, per accent palette.
// Level 0 = no activity (muted), 4 = 4+ sessions (brightest).
const PALETTES: Record<'dashboard' | 'learners', string[]> = {
  dashboard: [
    'bg-slate-100 dark:bg-slate-800',
    'bg-indigo-200',
    'bg-indigo-400',
    'bg-indigo-500',
    'bg-indigo-700',
  ],
  learners: [
    'bg-slate-100 dark:bg-slate-800',
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

function intensityLevel(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

export function ActivityCalendar({ events, weeks = 26, accent = 'dashboard' }: ActivityCalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // Bucket events per day. For sessions, count; for dues, mark presence + store list.
  const { sessionsByDay, eventsByDay } = useMemo(() => {
    const s = new Map<string, number>();
    const e = new Map<string, ActivityEvent[]>();
    for (const ev of events) {
      const d = new Date(ev.date);
      if (isNaN(d.getTime())) continue;
      d.setHours(0, 0, 0, 0);
      const key = dateKey(d);
      const arr = e.get(key) || [];
      arr.push(ev);
      e.set(key, arr);
      if (ev.type === 'session') s.set(key, (s.get(key) || 0) + 1);
    }
    return { sessionsByDay: s, eventsByDay: e };
  }, [events]);

  // Build a grid of days: columns = weeks, rows = Sun..Sat (0..6).
  // The rightmost column is the current week; the leftmost is `weeks` back.
  const grid = useMemo(() => {
    const cols: Date[][] = [];
    // Find the Sunday of the current week
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

  // Month labels above the grid: show a month name above the first column of that month
  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = [];
    let lastMonth = -1;
    grid.forEach((col, i) => {
      const month = col[0].getMonth();
      if (month !== lastMonth) {
        // Only label if the month actually starts within this week's span
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
    let sessions = 0;
    let dues = 0;
    grid.forEach((col) => {
      col.forEach((d) => {
        if (d > today) return;
        const list = eventsByDay.get(dateKey(d)) || [];
        for (const e of list) {
          if (e.type === 'session') sessions++;
          else if (e.type === 'due') dues++;
        }
      });
    });
    return { sessions, dues };
  }, [grid, eventsByDay, today]);

  const palette = PALETTES[accent];
  const activeKey = selected ?? hovered;
  const activeDate = activeKey ? grid.flat().find((d) => dateKey(d) === activeKey) : null;
  const activeEvents = activeKey ? (eventsByDay.get(activeKey) || []) : [];

  // Cell geometry — kept small like GitHub/LeetCode
  const CELL = 11;       // px
  const GAP = 3;         // px
  const weekColWidth = CELL + GAP;

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{totals.sessions}</span> session{totals.sessions !== 1 ? 's' : ''} in the last {weeks} weeks
          {totals.dues > 0 && (
            <span className="ml-2 text-muted-foreground">· {totals.dues} deadline{totals.dues !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          {palette.map((c, i) => (
            <span key={i} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Grid — horizontally scrollable on narrow screens */}
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
            {/* Day-of-week labels (Mon, Wed, Fri) */}
            <div className="flex flex-col gap-[3px] pr-1 pt-[2px]" style={{ width: 24 }}>
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="text-[9px] text-muted-foreground leading-none flex items-center"
                  style={{ height: CELL }}
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Weeks (columns) */}
            <div className="flex gap-[3px]">
              {grid.map((col, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {col.map((d, di) => {
                    const key = dateKey(d);
                    const inFuture = d > today;
                    const sessions = sessionsByDay.get(key) || 0;
                    const lvl = intensityLevel(sessions);
                    const dayEvents = eventsByDay.get(key) || [];
                    const hasDue = dayEvents.some((e) => e.type === 'due');
                    const isToday = isSameDay(d, today);
                    const isSelected = selected === key;

                    return (
                      <button
                        key={di}
                        type="button"
                        onClick={() => !inFuture && setSelected(isSelected ? null : key)}
                        onMouseEnter={() => setHovered(key)}
                        onMouseLeave={() => setHovered(null)}
                        disabled={inFuture && !hasDue}
                        className={`relative rounded-sm transition-all ${
                          inFuture && !hasDue ? 'opacity-20' : ''
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
                        aria-label={`${d.toDateString()}: ${sessions} session${sessions !== 1 ? 's' : ''}${hasDue ? ', deadline' : ''}`}
                      >
                        {hasDue && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-card" />
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

      {/* Hover / selected day detail */}
      {activeDate && (
        <div className="mt-4 border-t border-border/50 pt-3 animate-slide-up">
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <p className="text-xs font-semibold">
              {activeDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {activeEvents.filter((e) => e.type === 'session').length} session{activeEvents.filter((e) => e.type === 'session').length !== 1 ? 's' : ''}
              {activeEvents.filter((e) => e.type === 'due').length > 0 && (
                <> · {activeEvents.filter((e) => e.type === 'due').length} deadline{activeEvents.filter((e) => e.type === 'due').length !== 1 ? 's' : ''}</>
              )}
            </p>
          </div>
          {activeEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No activity.</p>
          ) : (
            <ul className="space-y-1">
              {activeEvents.slice(0, 6).map((e, i) => (
                <li key={i}>
                  {e.href ? (
                    <a
                      href={e.href}
                      className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/50 transition-colors"
                    >
                      <EventIcon type={e.type} />
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
                      <EventIcon type={e.type} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{e.title}</p>
                        {e.subtitle && <p className="text-[10px] text-muted-foreground truncate">{e.subtitle}</p>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
              {activeEvents.length > 6 && (
                <li className="text-[10px] text-muted-foreground px-2">
                  + {activeEvents.length - 6} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EventIcon({ type }: { type: 'session' | 'due' }) {
  if (type === 'due') {
    return (
      <div className="w-5 h-5 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
        <Target className="w-3 h-3 text-amber-700" strokeWidth={2.4} />
      </div>
    );
  }
  return (
    <div className="w-5 h-5 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
      <Clock className="w-3 h-3 text-indigo-700" strokeWidth={2.4} />
    </div>
  );
}
