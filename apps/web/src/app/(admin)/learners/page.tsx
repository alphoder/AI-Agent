'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { Users, Search, TrendingUp, Clock, CheckCircle2, ArrowRight, UserPlus } from 'lucide-react';

interface LearnerRow {
  id: string;
  email: string;
  display_name: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  assignments_total: number;
  assignments_completed: number;
  assignments_in_progress: number;
  sessions_total: number;
  avg_score: number | null;
  last_session_at: string | null;
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string | number; icon: React.ElementType; accent: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${accent} flex items-center justify-center shadow-sm`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
        </div>
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-t border-border/40">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div className="h-4 w-full max-w-[120px] rounded bg-muted animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d ago`;
  return date.toLocaleDateString();
}

export default function LearnersPage() {
  const router = useRouter();
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const loadLearners = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/users', { params: { role: 'learner', with_stats: 1, limit: 200 } });
      setLearners(res.data.data || []);
    } catch {
      setError('Failed to load learners');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLearners();
  }, [loadLearners]);

  const filtered = useMemo(() => {
    if (!search.trim()) return learners;
    const q = search.toLowerCase();
    return learners.filter(
      (l) => l.display_name.toLowerCase().includes(q) || l.email.toLowerCase().includes(q),
    );
  }, [learners, search]);

  const totals = useMemo(() => {
    const sessions = learners.reduce((s, l) => s + (l.sessions_total || 0), 0);
    const completed = learners.reduce((s, l) => s + (l.assignments_completed || 0), 0);
    const scores = learners.filter((l) => l.avg_score != null);
    const avgScore = scores.length
      ? Math.round(scores.reduce((s, l) => s + (l.avg_score || 0), 0) / scores.length)
      : null;
    return { total: learners.length, sessions, completed, avgScore };
  }, [learners]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Learners</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reports and activity for every learner in your organization.
          </p>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total learners" value={totals.total} icon={Users} accent="bg-indigo-500" />
        <StatCard label="Sessions completed" value={totals.sessions} icon={Clock} accent="bg-blue-500" />
        <StatCard label="Assignments completed" value={totals.completed} icon={CheckCircle2} accent="bg-emerald-500" />
        <StatCard label="Average score" value={totals.avgScore != null ? `${totals.avgScore}%` : '—'} icon={TrendingUp} accent="bg-amber-500" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-lg border border-border bg-card pl-10 pr-3 py-2 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filtered.length} of {learners.length}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Learner</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Assigned</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Completed</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sessions</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avg Score</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Last Active</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center">
                  <div className="mx-auto w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
                    <UserPlus className="w-8 h-8 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm font-medium">
                    {search ? 'No learners match your search' : 'No learners yet'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {search ? 'Try a different query' : 'Invite learners from any scenario\u2019s Learners tab'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((l) => {
                const completionPct = l.assignments_total > 0
                  ? Math.round((l.assignments_completed / l.assignments_total) * 100)
                  : 0;
                return (
                  <tr
                    key={l.id}
                    onClick={() => router.push(`/learners/${l.id}`)}
                    className="border-t border-border/40 hover:bg-muted/30 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center shrink-0">
                          <span className="text-xs font-semibold text-indigo-700">
                            {l.display_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {l.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{l.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-sm tabular-nums">
                      {l.assignments_total}
                    </td>
                    <td className="px-5 py-4 text-center text-sm tabular-nums">
                      <div className="flex flex-col items-center gap-1">
                        <span>{l.assignments_completed}</span>
                        {l.assignments_total > 0 && (
                          <div className="w-16 h-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all"
                              style={{ width: `${completionPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-sm tabular-nums">{l.sessions_total}</td>
                    <td className="px-5 py-4 text-center text-sm tabular-nums font-medium">
                      {l.avg_score != null ? (
                        <span className={
                          l.avg_score >= 80 ? 'text-emerald-700' :
                          l.avg_score >= 60 ? 'text-amber-700' :
                          'text-rose-700'
                        }>
                          {Math.round(l.avg_score)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {formatRelative(l.last_session_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity inline-block" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
