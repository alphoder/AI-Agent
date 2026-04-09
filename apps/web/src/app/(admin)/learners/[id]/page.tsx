'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { ArrowLeft, Clock, TrendingUp, CheckCircle2, Target, Calendar } from 'lucide-react';

interface LearnerUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  assignments_total: number;
  assignments_completed: number;
  assignments_in_progress: number;
  sessions_total: number;
  sessions_completed: number;
  avg_score: number | null;
  last_session_at: string | null;
  total_duration_sec: number;
}

interface AssignmentRow {
  assignment_id: string;
  scenario_id: string;
  status: 'assigned' | 'in_progress' | 'completed';
  due_date: string | null;
  assigned_at: string;
  scenario_title: string;
  difficulty_level: string;
  latest_session_id: string | null;
  latest_session_status: string | null;
  latest_score: number | null;
  session_count: number;
}

interface SessionRow {
  id: string;
  status: string;
  duration_sec: number | null;
  created_at: string;
  scenario_title: string;
  overall_score: number | null;
}

interface LearnerReport {
  user: LearnerUser;
  assignments: AssignmentRow[];
  recent_sessions: SessionRow[];
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  assigned:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Not Started' },
  in_progress: { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'In Progress' },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Completed' },
  ended:       { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Ended' },
  active:      { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'Active' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLE[status] ?? STATUS_STYLE.assigned;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const mins = Math.floor(sec / 60);
  const s = sec % 60;
  if (mins === 0) return `${s}s`;
  return `${mins}m ${s}s`;
}

export default function LearnerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const learnerId = params.id as string;

  const [report, setReport] = useState<LearnerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/users/${learnerId}`);
      setReport(res.data.data);
    } catch {
      setError('Failed to load learner report');
    } finally {
      setLoading(false);
    }
  }, [learnerId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-64 rounded-2xl bg-muted animate-pulse" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="rounded-2xl border border-border/50 bg-card p-10 text-center">
          <p className="text-sm text-destructive mb-4">{error || 'Learner not found'}</p>
          <Link href="/learners" className="text-sm text-primary hover:underline">
            ← Back to Learners
          </Link>
        </div>
      </div>
    );
  }

  const { user, assignments, recent_sessions } = report;
  const completionPct = user.assignments_total > 0
    ? Math.round((user.assignments_completed / user.assignments_total) * 100)
    : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back nav */}
      <Link href="/learners" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Back to Learners
      </Link>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-200 flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-indigo-700">
            {user.display_name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{user.display_name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
            <span>•</span>
            <span>
              {user.last_login_at
                ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}`
                : 'Never logged in'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500 shadow-sm flex items-center justify-center">
              <Target className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Assignments</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{user.assignments_total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user.assignments_completed} done, {user.assignments_in_progress} in progress
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 shadow-sm flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completion</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">{completionPct}%</p>
              <div className="w-24 h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-500 shadow-sm flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Score</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">
                {user.avg_score != null ? `${Math.round(user.avg_score)}%` : '—'}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">across {user.sessions_total} sessions</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500 shadow-sm flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Practice Time</p>
              <p className="text-2xl font-bold tracking-tight mt-0.5">
                {Math.round(user.total_duration_sec / 60)}m
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Two column: assignments + recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Assignments */}
        <div className="lg:col-span-3 rounded-2xl border border-border/50 bg-card">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-muted-foreground" />
              Assignments
            </h2>
            <span className="text-xs text-muted-foreground">{assignments.length} total</span>
          </div>
          {assignments.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No assignments yet.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {assignments.map((a) => (
                <Link
                  key={a.assignment_id}
                  href={`/scenarios/${a.scenario_id}/edit`}
                  className="block px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {a.scenario_title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span className="capitalize">{a.difficulty_level}</span>
                        <span>•</span>
                        <span>{a.session_count} session{a.session_count !== 1 ? 's' : ''}</span>
                        {a.due_date && (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Due {new Date(a.due_date).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    {a.latest_score != null && (
                      <span className={`text-sm font-semibold tabular-nums ${
                        a.latest_score >= 80 ? 'text-emerald-700' :
                        a.latest_score >= 60 ? 'text-amber-700' :
                        'text-rose-700'
                      }`}>
                        {Math.round(a.latest_score)}%
                      </span>
                    )}
                    <StatusBadge status={a.status} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recent sessions */}
        <div className="lg:col-span-2 rounded-2xl border border-border/50 bg-card">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h2 className="font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Recent Sessions
            </h2>
            <span className="text-xs text-muted-foreground">{recent_sessions.length}</span>
          </div>
          {recent_sessions.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No sessions yet.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {recent_sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/reports?session=${s.id}`)}
                  className="w-full text-left px-5 py-3 hover:bg-muted/30 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {s.scenario_title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        <span>{new Date(s.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{formatDuration(s.duration_sec)}</span>
                      </div>
                    </div>
                    {s.overall_score != null && (
                      <span className={`text-sm font-semibold tabular-nums ${
                        s.overall_score >= 80 ? 'text-emerald-700' :
                        s.overall_score >= 60 ? 'text-amber-700' :
                        'text-rose-700'
                      }`}>
                        {Math.round(s.overall_score)}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
