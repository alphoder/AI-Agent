'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, FileSpreadsheet, Gauge, ShieldCheck, Wallet, AlertTriangle } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

interface RecentCall { at: string; title: string; overall: number; ethics: number | null; flagged: boolean }
interface Member {
  user_id: string; name: string | null; email: string;
  last_practice: string | null; sessions_14d: number; scored_calls: number;
  avg_score: number; coverage: number; readiness: number;
  ethics_avg: number | null; compliance_flags: number; inactive: boolean;
  skills: Record<string, number>; recent: RecentCall[];
}
interface Dash { workspace: { name: string; pool_seconds: number }; criteria: string[]; members: Member[] }

/** Heatmap cell colour: red -> amber -> green on 0-100. */
function cellStyle(v: number | undefined) {
  if (v == null) return 'bg-muted/30 text-muted-foreground';
  if (v >= 80) return 'bg-success/20 text-success';
  if (v >= 60) return 'bg-success/10 text-foreground';
  if (v >= 40) return 'bg-warning/15 text-warning';
  return 'bg-destructive/15 text-destructive';
}

export default function TeamDashboard() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const admin = (user?.metadata as { role?: string } | null)?.role === 'admin';
  const [dash, setDash] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiClient.get(`/workspaces/${id}/dashboard`)
      .then(({ data }) => setDash(data.data))
      .catch((e) => setErr(e?.response?.data?.error?.message || 'Only the workspace leader can view this.'));
  }, [id]);
  useEffect(load, [load]);

  async function creditPool() {
    const mins = Number(prompt('Add how many minutes to the pool?'));
    if (!Number.isFinite(mins) || mins <= 0) return;
    setBusy(true);
    try { await apiClient.post(`/workspaces/${id}/pool`, { seconds: Math.round(mins * 60) }); load(); }
    catch (e: any) { alert(e?.response?.data?.error?.message || 'Failed'); }
    finally { setBusy(false); }
  }

  async function allocate(m: Member) {
    const mins = Number(prompt(`Allocate how many minutes to ${m.name || m.email}?`));
    if (!Number.isFinite(mins) || mins <= 0) return;
    setBusy(true);
    try { await apiClient.post(`/workspaces/${id}/allocate`, { user_id: m.user_id, seconds: Math.round(mins * 60) }); load(); }
    catch (e: any) { alert(e?.response?.data?.error?.message || 'Failed'); }
    finally { setBusy(false); }
  }

  async function compliancePdf(m: Member) {
    const [{ pdf }, { CompliancePDF }] = await Promise.all([import('@react-pdf/renderer'), import('@/components/compliance-pdf')]);
    const blob = await pdf(
      <CompliancePDF data={{
        memberName: m.name || m.email,
        workspaceName: dash?.workspace.name || 'Workspace',
        generated: new Date().toLocaleString(),
        ethicsAvg: m.ethics_avg, flags: m.compliance_flags, scoredCalls: m.scored_calls, recent: m.recent,
      }} />,
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `compliance-${(m.name || 'member').replace(/\s+/g, '-').toLowerCase()}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    if (!dash) return;
    const cols = ['name', 'email', 'readiness', 'avg_score', 'coverage', 'ethics_avg', 'compliance_flags', 'sessions_14d', 'last_practice', ...dash.criteria];
    const rows = dash.members.map((m) => [
      m.name ?? '', m.email, m.readiness, m.avg_score, m.coverage, m.ethics_avg ?? '', m.compliance_flags,
      m.sessions_14d, m.last_practice ?? '', ...dash.criteria.map((c) => m.skills[c] ?? ''),
    ]);
    const csv = [cols, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'team-readiness.csv'; a.click();
  }

  if (err) return <div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">{err}</div>;
  if (!dash) return <div className="h-64 animate-pulse rounded-2xl border border-border bg-card" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => router.back()} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted"><ArrowLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{dash.workspace.name} — readiness</h1>
          <p className="text-sm text-muted-foreground">Skill heatmap, readiness index and conduct — from the same rubric that scores every call.</p>
        </div>
        <button onClick={exportCsv} className="press inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium hover:bg-muted">
          <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Minute pool */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
        <Wallet className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Team minute pool: {Math.round(dash.workspace.pool_seconds / 60)} min</p>
          <p className="text-xs text-muted-foreground">Allocate minutes to members below{admin ? ' · as admin you can credit the pool' : ''}.</p>
        </div>
        {admin && (
          <button onClick={creditPool} disabled={busy} className="press rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60">
            Credit pool
          </button>
        )}
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Member</th>
              <th className="px-2 py-2.5 text-center font-medium"><span className="inline-flex items-center gap-1"><Gauge className="h-3.5 w-3.5" />Readiness</span></th>
              {dash.criteria.map((c) => <th key={c} className="px-2 py-2.5 text-center font-medium">{c}</th>)}
              <th className="px-2 py-2.5 text-center font-medium"><span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Conduct</span></th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {dash.members.map((m) => (
              <tr key={m.user_id} className="border-b border-border/50">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{m.name || m.email}{m.inactive && <span className="ml-1.5 rounded bg-destructive/10 px-1 py-px text-[10px] font-semibold uppercase text-destructive">inactive</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.scored_calls} scored · {m.sessions_14d} in 14d{m.last_practice && ` · last ${new Date(m.last_practice).toLocaleDateString()}`}
                  </p>
                </td>
                <td className="px-2 py-2.5 text-center">
                  <span className={`inline-block min-w-[2.5rem] rounded-md px-1.5 py-1 text-xs font-bold ${cellStyle(m.readiness)}`}>{m.readiness}</span>
                </td>
                {dash.criteria.map((c) => (
                  <td key={c} className="px-2 py-2.5 text-center">
                    <span className={`inline-block min-w-[2.5rem] rounded-md px-1.5 py-1 text-xs font-semibold ${cellStyle(m.skills[c])}`}>{m.skills[c] ?? '—'}</span>
                  </td>
                ))}
                <td className="px-2 py-2.5 text-center">
                  {m.compliance_flags > 0
                    ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{m.compliance_flags}</span>
                    : <span className="text-xs font-medium text-success">clear</span>}
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <button onClick={() => compliancePdf(m)} title="Compliance report (PDF)"
                      className="press rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted"><Download className="h-3.5 w-3.5" /></button>
                    <button onClick={() => allocate(m)} disabled={busy} title="Allocate minutes"
                      className="press rounded-full border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"><Wallet className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Readiness = 50% recent scores + 30% journey coverage + 20% recency. Conduct flags come from the AI evaluator (over-promising, hidden exclusions, pressure selling).
      </p>
    </div>
  );
}
