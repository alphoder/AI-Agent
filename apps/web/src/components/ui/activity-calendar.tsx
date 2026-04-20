'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, Target } from 'lucide-react';

/**
 * A calendar event for the dashboard activity view.
 *   type = 'session'  → someone trained that day (dot on the day)
 *   type = 'due'      → an assignment is due (amber ring on the day)
 * Multiple events stack on the same date — the day cell shows a count badge
 * and clicking it expands the event list below the grid.
 */
export interface ActivityEvent {
  date: string;        // ISO string, used for `new Date(date).toDateString()` matching
  type: 'session' | 'due';
  title: string;       // e.g. "Jane Learner · Cold Call" or "Due: Patient Consultation"
  subtitle?: string;
  score?: number | null;
  href?: string;
}

interface ActivityCalendarProps {
  events: ActivityEvent[];
  monthStart?: Date;        // which month to show first (defaults to this month)
  accent?: 'dashboard' | 'learners';
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

export function ActivityCalendar({ events, monthStart, accent = 'dashboard' }: ActivityCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState<Date>(() => {
    const d = monthStart ?? today;
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Group events by YYYY-MM-DD for O(1) lookup per cell
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ActivityEvent[]>();
    for (const e of events) {
      const d = new Date(e.date);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) || [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  // Build 6-row grid starting from the Sunday on/before the 1st of cursor month
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay(); // 0=Sun
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - startOffset);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [cursor]);

  const selectedKey = selectedDay ? `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}` : null;
  const selectedEvents = selectedKey ? (eventsByDay.get(selectedKey) || []) : [];

  const totalThisMonth = useMemo(() => {
    let sessions = 0;
    let dues = 0;
    for (const [key, list] of eventsByDay.entries()) {
      const [y, m] = key.split('-').map(Number);
      if (y === cursor.getFullYear() && m === cursor.getMonth()) {
        for (const e of list) {
          if (e.type === 'session') sessions++;
          else if (e.type === 'due') dues++;
        }
      }
    }
    return { sessions, dues };
  }, [eventsByDay, cursor]);

  return (
    <div className="p-5">
      {/* Month header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-[140px] text-center">
            <p className="text-sm font-semibold tracking-tight">
              {MONTH_NAMES[cursor.getMonth()]} {cursor.getFullYear()}
            </p>
          </div>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${accent === 'learners' ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
            {totalThisMonth.sessions} session{totalThisMonth.sessions !== 1 ? 's' : ''}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {totalThisMonth.dues} due
          </span>
          <button
            onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(today); }}
            className="text-primary hover:underline font-medium"
          >
            Today
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_HEADERS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = isSameDay(d, today);
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayEvents = eventsByDay.get(key) || [];
          const sessionCount = dayEvents.filter((e) => e.type === 'session').length;
          const dueCount = dayEvents.filter((e) => e.type === 'due').length;
          const isSelected = selectedDay && isSameDay(d, selectedDay);
          const hasActivity = dayEvents.length > 0;

          return (
            <button
              key={i}
              onClick={() => setSelectedDay(isSelected ? null : d)}
              disabled={!inMonth && dayEvents.length === 0}
              className={`relative aspect-square rounded-lg text-xs transition-all flex flex-col items-center justify-center gap-0.5 group ${
                isSelected
                  ? 'bg-primary text-primary-foreground font-semibold shadow-sm'
                  : isToday
                    ? 'bg-primary/10 text-primary font-semibold ring-1 ring-primary/30'
                    : inMonth
                      ? hasActivity
                        ? 'text-foreground bg-muted/40 hover:bg-muted'
                        : 'text-foreground hover:bg-muted/50'
                      : 'text-muted-foreground/40 cursor-default'
              }`}
              aria-label={`${d.toDateString()}${dayEvents.length ? ` (${dayEvents.length} events)` : ''}`}
            >
              <span className="leading-none">{d.getDate()}</span>
              {dayEvents.length > 0 && (
                <div className="flex items-center gap-0.5 h-1.5">
                  {sessionCount > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white/80' : accent === 'learners' ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`} />
                  )}
                  {dueCount > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white/80' : 'bg-amber-500'
                    }`} />
                  )}
                  {dayEvents.length > 2 && (
                    <span className={`text-[9px] font-semibold ${isSelected ? 'text-white' : 'text-muted-foreground'}`}>
                      +{dayEvents.length - 2}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div className="mt-4 border-t border-border/50 pt-4 animate-slide-up">
          <div className="flex items-center gap-2 mb-2">
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {selectedDay.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
          </div>
          {selectedEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No activity.</p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((e, i) => (
                <li key={i}>
                  {e.href ? (
                    <a
                      href={e.href}
                      className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors"
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
                    <div className="flex items-start gap-2 px-2 py-1.5">
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
                    </div>
                  )}
                </li>
              ))}
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
      <div className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
        <Target className="w-3 h-3 text-amber-700" strokeWidth={2.4} />
      </div>
    );
  }
  return (
    <div className="w-6 h-6 rounded-md bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
      <Clock className="w-3 h-3 text-indigo-700" strokeWidth={2.4} />
    </div>
  );
}
