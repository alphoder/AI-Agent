'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import {
  Users,
  Drama,
  ClipboardList,
  Activity,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
  BarChart3,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  avatars: number;
  personas: number;
  scenarios: number;
  activeSessions: number;
  completedSessions: number;
  totalLearners: number;
}

interface RecentSession {
  id: string;
  user_email: string;
  user_display_name: string;
  scenario_title: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  total_turns: number;
}

interface ScenarioSummary {
  id: string;
  title: string;
  status: string;
  assignment_count: number;
  completed_count: number;
  avg_score: number | null;
}

/* ------------------------------------------------------------------ */
/*  Skeleton Components                                                */
/* ------------------------------------------------------------------ */

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-7 w-14 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 animate-pulse">
      <div className="h-4 w-1/3 rounded bg-muted" />
      <div className="h-4 w-1/4 rounded bg-muted" />
      <div className="h-4 w-16 rounded bg-muted" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-border/50 bg-card p-5 hover:shadow-md transition-all duration-300 group">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${accent} flex items-center justify-center shadow-sm`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold tracking-tight mt-0.5">{value}</p>
        </div>
        {href && (
          <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    active: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active' },
    in_progress: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'In Progress' },
    completed: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Completed' },
    draft: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Draft' },
    archived: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Archived' },
    ended: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Ended' },
  };
  const c = config[status] ?? config.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Fetch all data in parallel
        const [avatarsRes, personasRes, scenariosRes, sessionsRes] = await Promise.allSettled([
          apiClient.get('/avatars?page=1&limit=1'),
          apiClient.get('/personas?page=1&limit=1'),
          apiClient.get('/scenarios'),
          apiClient.get('/sessions?limit=10&sort=started_at:desc'),
        ]);

        // API returns { success, data: [...], meta: { total } } — read meta.total, not data.length
        const avatarCount = avatarsRes.status === 'fulfilled'
          ? (avatarsRes.value.data.meta?.total
              ?? avatarsRes.value.data.data?.pagination?.total
              ?? (Array.isArray(avatarsRes.value.data.data) ? avatarsRes.value.data.data.length : 0))
          : 0;
        const personaCount = personasRes.status === 'fulfilled'
          ? (personasRes.value.data.meta?.total
              ?? personasRes.value.data.data?.pagination?.total
              ?? (Array.isArray(personasRes.value.data.data) ? personasRes.value.data.data.length : 0))
          : 0;

        const scenarioData = scenariosRes.status === 'fulfilled'
          ? (scenariosRes.value.data.data?.scenarios ?? scenariosRes.value.data.data ?? [])
          : [];
        const scenarioList = Array.isArray(scenarioData) ? scenarioData : [];

        const sessionData = sessionsRes.status === 'fulfilled'
          ? (sessionsRes.value.data.data?.sessions ?? sessionsRes.value.data.data ?? [])
          : [];
        const sessionList = Array.isArray(sessionData) ? sessionData : [];

        const activeSessions = sessionList.filter((s: RecentSession) => s.status === 'active' || s.status === 'in_progress').length;
        const completedSessions = sessionList.filter((s: RecentSession) => s.status === 'completed' || s.status === 'ended').length;

        const scenarioCount = scenariosRes.status === 'fulfilled'
          ? (scenariosRes.value.data.meta?.total ?? scenarioList.length)
          : 0;

        setStats({
          avatars: avatarCount,
          personas: personaCount,
          scenarios: scenarioCount,
          activeSessions,
          completedSessions,
          totalLearners: 0, // Would need a dedicated endpoint
        });

        setScenarios(scenarioList.slice(0, 5).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          title: s.title as string,
          status: s.status as string,
          assignment_count: (s.assignment_count as number) ?? 0,
          completed_count: (s.completed_count as number) ?? 0,
          avg_score: s.avg_score as number | null,
        })));

        setRecentSessions(sessionList.slice(0, 5));
      } catch (err) {
        console.error('Failed to load admin dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const quickActions = useMemo(() => [
    { href: '/avatars/create', label: 'Create Avatar', icon: Users, color: 'bg-blue-500' },
    { href: '/personas/create', label: 'Create Persona', icon: Drama, color: 'bg-violet-500' },
    { href: '/scenarios/create', label: 'Create Scenario', icon: ClipboardList, color: 'bg-emerald-500' },
  ], []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of your training platform.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Avatars" value={stats.avatars} accent="bg-blue-500" href="/avatars" />
          <StatCard icon={Drama} label="Personas" value={stats.personas} accent="bg-violet-500" href="/personas" />
          <StatCard icon={ClipboardList} label="Scenarios" value={stats.scenarios} accent="bg-emerald-500" href="/scenarios" />
          <StatCard icon={Activity} label="Active Sessions" value={stats.activeSessions} accent="bg-amber-500" />
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className={`w-10 h-10 rounded-lg ${action.color} flex items-center justify-center`}>
                <Plus className="w-5 h-5 text-white" />
              </div>
              <span className="font-medium text-sm group-hover:text-primary transition-colors">{action.label}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </div>

      {/* Two-column layout: Scenarios + Recent Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Scenarios Overview */}
        <div className="rounded-2xl border border-border/50 bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              Scenarios
            </h2>
            <Link href="/scenarios" className="text-xs text-primary hover:underline font-medium">
              View all
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
            ) : scenarios.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <ClipboardList className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No scenarios yet</p>
                <Link href="/scenarios/create" className="text-xs text-primary hover:underline mt-1 inline-block">
                  Create your first scenario
                </Link>
              </div>
            ) : (
              scenarios.map((s) => (
                <Link
                  key={s.id}
                  href={`/scenarios/${s.id}/edit`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.title}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{s.assignment_count} assigned</span>
                      <span>{s.completed_count} completed</span>
                      {s.avg_score != null && <span>Avg: {Math.round(s.avg_score)}%</span>}
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="rounded-2xl border border-border/50 bg-card">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
            <h2 className="font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              Recent Sessions
            </h2>
          </div>
          <div className="divide-y divide-border/50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <RowSkeleton key={i} />)
            ) : recentSessions.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <Activity className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No sessions yet</p>
                <p className="text-xs text-muted-foreground mt-1">Sessions will appear here once learners start training</p>
              </div>
            ) : (
              recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.user_display_name || s.user_email || 'Unknown user'}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {s.scenario_title || 'Untitled scenario'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {s.total_turns > 0 && (
                      <span className="text-xs text-muted-foreground">{s.total_turns} turns</span>
                    )}
                    <StatusBadge status={s.status} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
