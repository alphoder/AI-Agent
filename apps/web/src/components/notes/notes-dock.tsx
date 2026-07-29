'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { NotebookPen, X, Search, Sparkles, Trash2, Loader2, Flag, Check } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { callClock, callRunning } from '@/lib/call-clock';
import { cn } from '@/lib/utils';

const AI_NOTE_COST = 2;

export interface Note {
  id: string;
  body: string;
  context_type: 'module' | 'session' | 'page';
  context_id: string | null;
  context_label: string | null;
  at_sec: number | null;
  source: 'user' | 'ai';
  created_at: string;
}

interface Ctx { type: 'module' | 'session' | 'page'; id: string | null; label: string }

const PAGE_LABELS: Record<string, string> = {
  '/journey': 'My Journey', '/scenarios': 'Scenarios', '/live': 'Live Room',
  '/completed': 'Completed', '/reports': 'Reports', '/analytics': 'Analytics',
  '/teams': 'Teams', '/competition': 'Competition', '/wallet': 'Balance',
  '/settings': 'Settings', '/profile': 'My Profile',
};

function fmtClock(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * The notes dock: one component, mounted in the learner shell, present on every
 * page. Notes are auto-tagged with where they were written and default to that
 * filter, but the whole notebook is always one click away.
 *
 * During a live call it collapses to a single "Mark this moment" pill: typing
 * mid-call would wreck the very conversation being scored.
 */
export function NotesDock() {
  const pathname = usePathname() ?? '/';
  const params = useSearchParams();

  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [scoped, setScoped] = useState(true);   // filter to this page by default
  const [q, setQ] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marked, setMarked] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // Where are we? Drives the auto-tag and the default filter.
  const ctx: Ctx = useMemo(() => {
    const moduleMatch = pathname.match(/^\/scenarios\/module\/([0-9a-fA-F-]{36})/);
    if (moduleMatch) return { type: 'module', id: moduleMatch[1], label: 'This module' };
    const sessionMatch = pathname.match(/^\/session\/([0-9a-fA-F-]{36})/);
    if (sessionMatch) return { type: 'session', id: sessionMatch[1], label: 'This call' };
    if (pathname.startsWith('/reports')) {
      const sid = params.get('session');
      if (sid) return { type: 'session', id: sid, label: 'This call' };
    }
    return { type: 'page', id: null, label: PAGE_LABELS[pathname] ?? 'Notes' };
  }, [pathname, params]);

  const inCall = pathname.startsWith('/session/');

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (scoped) {
        qs.set('context_type', ctx.type);
        if (ctx.id) qs.set('context_id', ctx.id);
        // Page notes have no id; the label is what separates one page from another.
        else if (ctx.type === 'page') qs.set('context_label', ctx.label);
      }
      if (q.trim()) qs.set('q', q.trim());
      const { data } = await apiClient.get(`/notes?${qs.toString()}`);
      setNotes(data.data ?? []);
    } catch {
      setNotes([]);
      setError('Could not load your notes.');
    }
  }, [scoped, ctx.type, ctx.id, q]);

  useEffect(() => { if (open) load(); }, [open, load]);

  // Cmd/Ctrl + . toggles the dock; M drops a marker while a call is live.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        if (!inCall) setOpen((v) => !v);
        return;
      }
      if (inCall && !typing && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        void mark();
      }
      if (e.key === 'Escape' && open) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Other surfaces (the report's flagged-moments strip) can open the dock.
  useEffect(() => {
    const openDock = () => { if (!inCall) { setScoped(true); setOpen(true); } };
    window.addEventListener('notes:open', openDock);
    return () => window.removeEventListener('notes:open', openDock);
  }, [inCall]);

  async function mark() {
    if (!callRunning() || busy) return;
    setBusy(true);
    try {
      await apiClient.post('/notes', {
        body: '', at_sec: callClock(),
        context_type: 'session', context_id: ctx.id, context_label: 'This call',
      });
      setMarked(true);
      setTimeout(() => setMarked(false), 1200);
    } catch { /* a failed marker must never interrupt a call */ } finally {
      setBusy(false);
    }
  }

  async function save() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/notes', {
        body, context_type: ctx.type, context_id: ctx.id, context_label: ctx.label,
      });
      setNotes((n) => [data.data, ...(n ?? [])]);
      setDraft('');
    } catch {
      setError('Could not save that note.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setNotes((n) => (n ?? []).filter((x) => x.id !== id));
    try { await apiClient.delete(`/notes/${id}`); } catch { load(); }
  }

  async function aiNote() {
    if (aiBusy) return;
    setAiBusy(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/notes/ai', {
        context_type: ctx.type, context_id: ctx.id, context_label: ctx.label,
      });
      setNotes((n) => [data.data.note, ...(n ?? [])]);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message ?? 'Could not write your notes right now.');
    } finally {
      setAiBusy(false);
    }
  }

  // --- Call mode: one button, no panel, no typing. ---
  if (inCall) {
    return (
      <button
        onClick={mark}
        disabled={busy}
        title="Mark this moment (M)"
        className={cn(
          'fixed bottom-6 left-6 z-40 inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium',
          'transition-[background-color,border-color,transform] duration-200 active:scale-[0.97]',
          marked ? 'border-primary bg-primary text-primary-foreground' : 'border-white/20 bg-black/40 text-white backdrop-blur hover:bg-black/60',
        )}
      >
        {marked ? <Check className="h-4 w-4" strokeWidth={3} /> : <Flag className="h-4 w-4" />}
        {marked ? 'Marked' : 'Mark this moment'}
      </button>
    );
  }

  return (
    <>
      {/* Edge handle */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Notes (⌘.)"
          aria-label="Open notes"
          className="press fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-border bg-card px-2.5 py-3 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        >
          <NotebookPen className="h-4 w-4" />
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} aria-hidden />
          <aside
            className="fixed right-0 top-0 z-50 flex h-[100dvh] w-full max-w-[360px] flex-col border-l border-border bg-card shadow-xl animate-slide-in-right"
            role="dialog"
            aria-label="Notes"
          >
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Notes</h2>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close notes" className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-2.5 border-b border-border px-4 py-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search notes"
                  maxLength={100}
                  className="w-full rounded-full border border-border bg-background py-1.5 pl-8 pr-3 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <Chip active={scoped} onClick={() => setScoped(true)}>{ctx.label}</Chip>
                <Chip active={!scoped} onClick={() => setScoped(false)}>All notes</Chip>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 thin-scroll">
              {notes === null ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)
              ) : notes.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {q.trim() ? 'Nothing matches that.' : 'No notes here yet. Jot the thing you want to remember.'}
                </p>
              ) : (
                notes.map((n) => (
                  <article key={n.id} className="group rounded-xl border border-border bg-background p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {n.source === 'ai' && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </span>
                        )}
                        {n.at_sec != null && (
                          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground">
                            {fmtClock(n.at_sec)}
                          </span>
                        )}
                        {!scoped && n.context_label && (
                          <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">{n.context_label}</span>
                        )}
                      </div>
                      <button
                        onClick={() => remove(n.id)}
                        aria-label="Delete note"
                        className="press shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                      {n.body || <span className="text-muted-foreground">Marked this moment.</span>}
                    </p>
                  </article>
                ))
              )}
            </div>

            {/* Composer */}
            <div className="space-y-2 border-t border-border px-4 py-3">
              {error && <p className="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</p>}
              <textarea
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 4000))}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save(); }}
                rows={3}
                placeholder="Write a note…"
                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={save}
                  disabled={!draft.trim() || busy}
                  className="press flex-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Save note'}
                </button>
                <button
                  onClick={aiNote}
                  disabled={aiBusy}
                  title={`Summarise this into a note (${AI_NOTE_COST} tokens)`}
                  className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  AI notes
                  <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold tabular-nums">{AI_NOTE_COST}</span>
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'press truncate rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
