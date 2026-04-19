'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import {
  ArrowLeft, Clock, TrendingUp, CheckCircle2, Target, Calendar,
  GraduationCap,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { SectionCard } from '@/components/ui/section-card';
import { RichEmptyState } from '@/components/ui/rich-empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';

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
        <div className="h-8 w-48 rounded shimmer-bg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatTile key={i} icon={Target} label="" value={0} loading />
          ))}
        </div>
        <div className="h-64 rounded-2xl shimmer-bg" />
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

  const initials = user.display_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <PageHeader
        icon={GraduationCap}
        accent="learners"
        title={user.display_name}
        subtitle={user.email}
        breadcrumbs={[
          { label: 'Learners', href: '/learners' },
          { label: user.display_name },
        ]}
        actions={
          <Link
            href="/learners"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </Link>
        }
      />

      {/* Hero band: initials + identity + completion ring */}
      <div className="rounded-2xl border border-border/50 bg-card p-6 flex items-center gap-5 animate-fade-in">
        <div className="relative">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-emerald-700">{initials}</span>
          </div>
          {user.is_active && (
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-card" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Learner profile</p>
          <h2 className="text-2xl font-bold tracking-tight mt-0.5 truncate">{user.display_name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5 truncate">{user.email}</p>
          <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Calendar className="w-3 h-3" /> Joined {new Date(user.created_at).toLocaleDateString()}</span>
            <span className="text-muted-foreground/40">•</span>
            <span>
              {user.last_login_at
                ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}`
                : 'Never logged in'}
            </span>
          </div>
        </div>
        <ProgressRing
          value={completionPct}
          size={96}
          stroke={8}
          label={
            <div className="text-center">
              <div className="text-xl font-bold tracking-tight">{completionPct}<span className="text-xs">%</span></div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Done</div>
            </div>
          }
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={Target}        label="Assignments"   value={user.assignments_total}    accent="learners" />
        <StatTile icon={CheckCircle2}  label="Completed"     value={user.assignments_completed} accent="analytics" />
        <StatTile icon={TrendingUp}    label="Avg score"     value={user.avg_score != null ? Math.round(user.avg_score) : 0} suffix={user.avg_score != null ? '%' : ''} accent="scenarios" />
        <StatTile icon={Clock}         label="Practice time" value={Math.round(user.total_duration_sec / 60)} suffix="m" accent="avatars" />
      </div>

      {/* Two column: assignments + recent sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <SectionCard
            icon={Target}
            iconTint="text-emerald-600"
            title="Assignments"
            subtitle={`${assignments.length} total · click to edit the scenario`}
          >
            {assignments.length === 0 ? (
              <RichEmptyState
                icon={Target}
                accent="learners"
                title="No assignments yet"
                description="Assign scenarios to this learner from the Assignments page."
                action={{ label: 'Go to Assignments', href: '/assignments' }}
                compact
              />
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
                          <span className="text-muted-foreground/40">•</span>
                          <span>{a.session_count} session{a.session_count !== 1 ? 's' : ''}</span>
                          {a.due_date && (
                            <>
                              <span className="text-muted-foreground/40">•</span>
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
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard
            icon={Clock}
            iconTint="text-indigo-600"
            title="Recent sessions"
            subtitle={`${recent_sessions.length} latest`}
          >
            {recent_sessions.length === 0 ? (
              <RichEmptyState
                icon={Clock}
                accent="dashboard"
                title="No sessions yet"
                description="Sessions will show up here once the learner starts training."
                compact
              />
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
                          <span className="text-muted-foreground/40">•</span>
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
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
