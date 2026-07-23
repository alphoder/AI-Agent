'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Users, Trophy, Plus, Copy, Check, Play, Loader2, Crown, ClipboardList, Trash2, X } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { languageName } from '@avatar-platform/shared';

interface WsSummary { id: string; name: string; join_code: string; role: string; member_count: number }
interface Member { id: string; name: string; email: string; role: string; scored_sessions: number; avg_score: number | null; total_sec: number }
interface Assignment { id: string; note: string | null; scenario_id: string; title: string; language: string; difficulty_level: string; voice: string }
interface Detail { workspace: { id: string; name: string; join_code: string; my_role: string }; members: Member[]; assignments: Assignment[] }
interface Scenario { id: string; title: string; language: string; voice: string }

export default function TeamsPage() {
  const router = useRouter();
  const [list, setList] = useState<WsSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignScenario, setAssignScenario] = useState('');
  const [assignNote, setAssignNote] = useState('');

  const loadList = useCallback(async () => {
    const { data } = await apiClient.get('/workspaces');
    setList(data.data);
    setActiveId((cur) => cur || data.data[0]?.id || null);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const { data } = await apiClient.get(`/workspaces/${id}`);
    setDetail(data.data);
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (activeId) loadDetail(activeId).catch(() => {}); else setDetail(null); }, [activeId, loadDetail]);
  useEffect(() => { apiClient.get('/scenarios').then(({ data }) => setScenarios(data.data)).catch(() => {}); }, []);

  const err2 = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;

  async function createWs() {
    if (name.trim().length < 2) return; setBusy(true); setErr(null);
    try { const { data } = await apiClient.post('/workspaces', { name }); setName(''); await loadList(); setActiveId(data.data.id); }
    catch (e) { setErr(err2(e) || 'Could not create workspace.'); } finally { setBusy(false); }
  }
  async function joinWs() {
    if (!code.trim()) return; setBusy(true); setErr(null);
    try { const { data } = await apiClient.post('/workspaces/join', { code }); setCode(''); await loadList(); setActiveId(data.data.id); }
    catch (e) { setErr(err2(e) || 'Could not join. Check the code.'); } finally { setBusy(false); }
  }
  async function assign() {
    if (!activeId || !assignScenario) return; setBusy(true);
    try { await apiClient.post(`/workspaces/${activeId}/assignments`, { scenario_id: assignScenario, note: assignNote || undefined }); setAssignOpen(false); setAssignScenario(''); setAssignNote(''); await loadDetail(activeId); }
    finally { setBusy(false); }
  }
  async function removeAssignment(aid: string) { if (!activeId) return; await apiClient.delete(`/workspaces/${activeId}/assignments/${aid}`); await loadDetail(activeId); }
  function practice(a: Assignment) { router.push(`/session/${a.scenario_id}?lang=${a.language || 'en'}&voice=${a.voice || 'Charon'}&grade=0`); }
  function copyCode() { if (!detail) return; navigator.clipboard.writeText(detail.workspace.join_code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }

  const isLeader = detail?.workspace.my_role === 'leader';
  const mins = (s: number) => Math.round(s / 60);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Create a workspace, assign practice tests to your team, and run a contest leaderboard.</p>
        </div>
        {list && list.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {list.map((w) => (
              <button key={w.id} onClick={() => setActiveId(w.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${activeId === w.id ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'}`}>
                {w.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Create / join */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4 text-primary" /> Create a workspace</div>
          <div className="mt-3 flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mumbai Sales Team"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
            <button onClick={createWs} disabled={busy || name.trim().length < 2}
              className="press inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Plus className="h-4 w-4" /> Create</button>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-medium"><Users className="h-4 w-4 text-primary" /> Join with a code</div>
          <div className="mt-3 flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. K7QF2M"
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm uppercase tracking-widest text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
            <button onClick={joinWs} disabled={busy || !code.trim()}
              className="press rounded-lg border border-border px-3.5 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">Join</button>
          </div>
        </div>
      </div>
      {err && <p className="text-sm text-rose-400">{err}</p>}

      {list === null ? (
        <div className="h-40 rounded-2xl border border-border bg-card animate-pulse" />
      ) : !detail ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          You are not in a workspace yet. Create one above, or join your team with a code.
        </div>
      ) : (
        <>
          {/* Workspace header */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></div>
              <div>
                <p className="font-semibold">{detail.workspace.name}</p>
                <p className="text-xs text-muted-foreground">{detail.members.length} member{detail.members.length === 1 ? '' : 's'} · you are the {detail.workspace.my_role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isLeader && (
                <a href={`/teams/${detail.workspace.id}/dashboard`}
                  className="press inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                  Readiness dashboard
                </a>
              )}
              <button onClick={copyCode} className="press inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm">
                Invite code <span className="font-mono font-semibold tracking-widest">{detail.workspace.join_code}</span>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Contest leaderboard */}
            <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-3">
              <div className="flex items-center gap-2 text-sm font-medium"><Trophy className="h-4 w-4 text-amber-400" /> Contest leaderboard</div>
              <div className="mt-3 divide-y divide-border">
                {detail.members.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3 py-2.5">
                    <div className="w-7 text-center text-lg">{i < 3 ? ['🥇', '🥈', '🥉'][i] : <span className="text-sm text-muted-foreground">{i + 1}</span>}</div>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-medium">{m.name || m.email}{m.role === 'leader' && <Crown className="h-3.5 w-3.5 text-amber-400" />}</p>
                      <p className="text-xs text-muted-foreground">{m.scored_sessions} call{m.scored_sessions === 1 ? '' : 's'} · {mins(m.total_sec)} min</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">{m.avg_score ?? '—'}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">avg score</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Assigned tests */}
            <div className="rounded-2xl border border-border bg-card p-4 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium"><ClipboardList className="h-4 w-4 text-primary" /> Assigned tests</div>
                {isLeader && (
                  <button onClick={() => setAssignOpen(true)} className="press inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-3.5 w-3.5" /> Assign</button>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {detail.assignments.length === 0 && <p className="text-sm text-muted-foreground">{isLeader ? 'Assign a scenario for your team to practise.' : 'No tests assigned yet.'}</p>}
                {detail.assignments.map((a) => (
                  <div key={a.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        {a.note && <p className="mt-0.5 text-xs text-muted-foreground">{a.note}</p>}
                        <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{languageName(a.language)} · {a.difficulty_level}</p>
                      </div>
                      {isLeader && <button onClick={() => removeAssignment(a.id)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-rose-400" title="Remove"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                    <button onClick={() => practice(a)} className="press mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Play className="h-3.5 w-3.5" /> Practice</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Assign modal */}
      {assignOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setAssignOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Assign a test</h2>
              <button onClick={() => setAssignOpen(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-4 block text-xs font-medium text-muted-foreground">Scenario</label>
            <select value={assignScenario} onChange={(e) => setAssignScenario(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20">
              <option value="">Choose a scenario…</option>
              {scenarios.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <label className="mt-3 block text-xs font-medium text-muted-foreground">Note (optional)</label>
            <input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="e.g. Focus on objection handling"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" />
            <button onClick={assign} disabled={busy || !assignScenario}
              className="press mt-4 w-full rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? 'Assigning…' : 'Assign to team'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
