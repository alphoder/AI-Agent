'use client';

import { useState, useEffect } from 'react';
import apiClient from '@/lib/api-client';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Activity,
  CheckCircle2,
  Users,
  ClipboardList,
  TrendingUp,
  Clock,
} from 'lucide-react';

interface OverviewData {
  totals: {
    total_sessions: number;
    completed_sessions: number;
    total_learners: number;
    active_scenarios: number;
  };
  trends: Array<{ date: string; count: number }>;
  completion_rate: number;
  score_distribution: Array<{ range: string; count: number }>;
  recent_sessions?: RecentSession[];
}

interface RecentSession {
  id: string;
  learner_name: string;
  scenario_title: string;
  overall_score: number | null;
  status: string;
  duration_sec: number | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  active:    { bg: 'bg-blue-50',    text: 'text-blue-700',    dot: 'bg-blue-500' },
  created:   { bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400' },
  timed_out: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  error:     { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
};

function formatDuration(sec: number | null): string {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

/* ── Skeleton ── */
function PageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div>
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted mt-2" />
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border/50 bg-card p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-7 w-16 rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-border/50 bg-card p-5 h-80" />
        <div className="rounded-2xl border border-border/50 bg-card p-5 h-80" />
      </div>
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  subtitle,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${accent} flex items-center justify-center shadow-sm`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Status Badge ── */
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.created;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ── Score cell ── */
function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground/40">—</span>;
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600';
  return <span className={`font-semibold tabular-nums ${color}`}>{Math.round(score)}%</span>;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const { data } = await apiClient.get('/analytics/overview');
        setOverview(data.data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) return <PageSkeleton />;

  if (!overview) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-muted-foreground/40" />
        </div>
        <h3 className="text-base font-semibold mb-1.5">Analytics unavailable</h3>
        <p className="text-sm text-muted-foreground">Failed to load analytics data. Please try again.</p>
      </div>
    );
  }

  const { totals, trends, completion_rate, score_distribution, recent_sessions } = overview;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Analytics</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Training performance and learner engagement metrics.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Activity}
          label="Total Sessions"
          value={totals.total_sessions.toLocaleString()}
          accent="bg-indigo-500"
        />
        <StatCard
          icon={CheckCircle2}
          label="Completed"
          value={totals.completed_sessions.toLocaleString()}
          accent="bg-emerald-500"
          subtitle={`${completion_rate.toFixed(1)}% completion rate`}
        />
        <StatCard
          icon={Users}
          label="Active Learners"
          value={totals.total_learners.toLocaleString()}
          accent="bg-blue-500"
        />
        <StatCard
          icon={ClipboardList}
          label="Active Scenarios"
          value={totals.active_scenarios.toLocaleString()}
          accent="bg-violet-500"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Sessions trend */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Sessions Per Day</h2>
            <span className="text-xs text-muted-foreground ml-auto">Last 30 days</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
              <XAxis
                dataKey="date"
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                }
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'hsl(215 16% 47%)' }}
              />
              <YAxis
                allowDecimals={false}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'hsl(215 16% 47%)' }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(220 16% 90%)',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px',
                }}
                labelFormatter={(d) => new Date(d as string).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                formatter={(value: number) => [value, 'Sessions']}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="hsl(243 75% 59%)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, stroke: 'hsl(243 75% 59%)', strokeWidth: 2, fill: 'white' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Score distribution */}
        <div className="rounded-2xl border border-border/50 bg-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Score Distribution</h2>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={score_distribution} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" vertical={false} />
              <XAxis
                dataKey="range"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'hsl(215 16% 47%)' }}
              />
              <YAxis
                allowDecimals={false}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tick={{ fill: 'hsl(215 16% 47%)' }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid hsl(220 16% 90%)',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [value, 'Sessions']}
              />
              <Bar dataKey="count" fill="hsl(243 75% 59%)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Sessions table */}
      {recent_sessions && recent_sessions.length > 0 && (
        <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Recent Sessions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Learner</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Scenario</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Score</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Duration</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Status</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent_sessions.map((s, i) => (
                  <tr key={s.id} className={`border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors ${i % 2 === 0 ? '' : 'bg-muted/10'}`}>
                    <td className="px-5 py-3 text-sm font-medium text-foreground">{s.learner_name}</td>
                    <td className="px-5 py-3 text-sm text-muted-foreground max-w-[200px] truncate">{s.scenario_title}</td>
                    <td className="px-5 py-3 text-center text-sm">
                      <ScoreCell score={s.overall_score} />
                    </td>
                    <td className="px-5 py-3 text-center text-sm text-muted-foreground tabular-nums">
                      {formatDuration(s.duration_sec)}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
