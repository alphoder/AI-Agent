'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import {
  Users, Drama, ClipboardList, Activity, Clock,
  LayoutDashboard, GraduationCap, Plus, ArrowRight, CheckCircle2, ClipboardCheck,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { SectionCard } from '@/components/ui/section-card';
import { RichEmptyState } from '@/components/ui/rich-empty-state';
import { ActivityCalendar, ActivityEvent } from '@/components/ui/activity-calendar';

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

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  active:      { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Active' },
  in_progress: { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'In progress' },
  completed:   { bg: 'bg-slate-100',  text: 'text-slate-600',   label: 'Completed' },
  draft:       { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Draft' },
  archived:    { bg: 'bg-slate-100',  text: 'text-slate-500',   label: 'Archived' },
  ended:       { bg: 'bg-slate-100',  text: 'text-slate-600',   label: 'Ended' },
};

function StatusPill({ status }: { status: string }) {
  const c = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [avatarsRes, personasRes, scenariosRes, sessionsRes, learnersRes, overviewRes, assignmentsRes] = await Promise.allSettled([
          apiClient.get('/avatars?page=1&limit=1'),
          apiClient.get('/personas?page=1&limit=1'),
          apiClient.get('/scenarios'),
          apiClient.get('/sessions?limit=10&sort=started_at:desc'),
          apiClient.get('/users?role=learner&limit=1'),
          apiClient.get('/analytics/overview'),
          apiClient.get('/assignments?limit=200'),
        ]);

        const avatarCount = avatarsRes.status === 'fulfilled'
          ? (avatarsRes.value.data.meta?.total ?? 0) : 0;
        const personaCount = personasRes.status === 'fulfilled'
          ? (personasRes.value.data.meta?.total ?? 0) : 0;
        const scenarioData = scenariosRes.status === 'fulfilled'
          ? (scenariosRes.value.data.data?.scenarios ?? scenariosRes.value.data.data ?? []) : [];
        const scenarioList = Array.isArray(scenarioData) ? scenarioData : [];
        const sessionData = sessionsRes.status === 'fulfilled'
          ? (sessionsRes.value.data.data?.sessions ?? sessionsRes.value.data.data ?? []) : [];
        const sessionList = Array.isArray(sessionData) ? sessionData : [];

        const activeSessions = sessionList.filter((s: RecentSession) => s.status === 'active' || s.status === 'in_progress').length;
        const completedSessions = sessionList.filter((s: RecentSession) => s.status === 'completed' || s.status === 'ended').length;
        const scenarioCount = scenariosRes.status === 'fulfilled'
          ? (scenariosRes.value.data.meta?.total ?? scenarioList.length) : 0;
        const learnerCount = learnersRes.status === 'fulfilled'
          ? (learnersRes.value.data.meta?.total ?? 0) : 0;

        setStats({
          avatars: avatarCount, personas: personaCount, scenarios: scenarioCount,
          activeSessions, completedSessions, totalLearners: learnerCount,
        });
        setScenarios(scenarioList.slice(0, 5).map((s: Record<string, unknown>) => ({
          id: s.id as string,
          title: s.title as string,
          status: s.status as string,
          assignment_count: (s.assignment_count as number) ?? 0,
          completed_count: (s.completed_count as number) ?? 0,
          avg_score: s.avg_score as number | null,
        })));
        setRecentSessions(sessionList.slice(0, 6));

        // Build calendar events: session trend buckets + assignment due dates
        const events: ActivityEvent[] = [];

        if (overviewRes.status === 'fulfilled') {
          const trends = overviewRes.value.data?.data?.trends;
          if (Array.isArray(trends)) {
            for (const t of trends as Array<{ date: string; count: number }>) {
              const count = Number(t.count) || 0;
              // Expand each day's count into N distinct session events so the
              // calendar shows a dot per day and the count badge on the cell.
              for (let i = 0; i < count; i++) {
                events.push({
                  date: t.date,
                  type: 'session',
                  title: `${count} training session${count !== 1 ? 's' : ''}`,
                  subtitle: new Date(t.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
                });
                if (i >= 2) break; // cap visual noise — the cell shows "+N" anyway
              }
            }
          }
        }

        if (assignmentsRes.status === 'fulfilled') {
          const rows = assignmentsRes.value.data?.data;
          if (Array.isArray(rows)) {
            for (const a of rows as Array<Record<string, unknown>>) {
              if (a.due_date && a.status !== 'completed') {
                events.push({
                  date: a.due_date as string,
                  type: 'due',
                  title: `Due: ${a.scenario_title as string}`,
                  subtitle: a.learner_name as string,
                });
              }
            }
          }
        }

        setCalendarEvents(events);
      } catch (err) {
        console.error('Failed to load admin dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const quickActions = useMemo(() => [
    { href: '/assignments', label: 'New assignment', icon: ClipboardCheck, grad: 'bg-grad-assign' },
    { href: '/avatars/create', label: 'Create avatar', icon: Users, grad: 'bg-grad-avatars' },
    { href: '/personas/create', label: 'Create persona', icon: Drama, grad: 'bg-grad-personas' },
    { href: '/scenarios/create', label: 'Create scenario', icon: ClipboardList, grad: 'bg-grad-scenarios' },
  ], []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <PageHeader
        icon={LayoutDashboard}
        accent="dashboard"
        title="Welcome back"
        subtitle="Here's what's happening across your training platform."
      />

      {/* Stats grid — 5 domain tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <StatTile key={i} icon={Users} label="…" value={0} loading />
          ))
        ) : stats && (
          <>
            <StatTile icon={GraduationCap} label="Learners"        value={stats.totalLearners}    accent="learners"  href="/learners" />
            <StatTile icon={Users}          label="Avatars"         value={stats.avatars}          accent="avatars"   href="/avatars" />
            <StatTile icon={Drama}          label="Personas"        value={stats.personas}         accent="personas"  href="/personas" />
            <StatTile icon={ClipboardList}  label="Scenarios"       value={stats.scenarios}        accent="scenarios" href="/scenarios" />
            <StatTile icon={Activity}       label="Active sessions" value={stats.activeSessions}   accent="assign" />
          </>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="group flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 card-interactive"
            >
              <div className={`w-10 h-10 rounded-lg ${a.grad} flex items-center justify-center shadow-sm shrink-0`}>
                <a.icon className="w-5 h-5 text-white" strokeWidth={2.2} />
              </div>
              <span className="text-sm font-medium flex-1 group-hover:text-primary transition-colors">{a.label}</span>
              <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          ))}
        </div>
      </div>

      {/* Activity calendar */}
      <SectionCard
        icon={Calendar}
        iconTint="text-indigo-600"
        title="Activity calendar"
        subtitle="Training sessions (indigo) and upcoming assignment deadlines (amber)."
      >
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading calendar…</div>
        ) : (
          <ActivityCalendar events={calendarEvents} accent="dashboard" />
        )}
      </SectionCard>

      {/* Two-column: Scenarios + Recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Scenarios */}
        <div className="lg:col-span-3">
          <SectionCard
            icon={ClipboardList}
            iconTint="text-amber-600"
            title="Scenarios"
            subtitle="Training scenarios available to your learners"
            action={{ label: 'View all', href: '/scenarios' }}
          >
            {loading ? (
              <div className="divide-y divide-border/40">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3.5">
                    <div className="h-4 w-1/2 rounded shimmer-bg mb-1.5" />
                    <div className="h-3 w-1/3 rounded shimmer-bg" />
                  </div>
                ))}
              </div>
            ) : scenarios.length === 0 ? (
              <RichEmptyState
                icon={ClipboardList}
                accent="scenarios"
                title="No scenarios yet"
                description="Scenarios are the training scenes your learners practice. Create your first one."
                action={{ label: 'Create scenario', href: '/scenarios/create' }}
                compact
              />
            ) : (
              <div className="divide-y divide-border/40">
                {scenarios.map((s) => (
                  <Link
                    key={s.id}
                    href={`/scenarios/${s.id}/edit`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                      <ClipboardList className="w-4 h-4 text-amber-700" strokeWidth={2.2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{s.title}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{s.assignment_count} assigned</span>
                        <span className="text-muted-foreground/40">•</span>
                        <span>{s.completed_count} completed</span>
                        {s.avg_score != null && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <span className={
                              s.avg_score >= 80 ? 'text-emerald-600' :
                              s.avg_score >= 60 ? 'text-amber-600' : 'text-rose-600'
                            }>{Math.round(s.avg_score)}% avg</span>
                          </>
                        )}
                      </div>
                    </div>
                    <StatusPill status={s.status} />
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Recent sessions */}
        <div className="lg:col-span-2">
          <SectionCard
            icon={Activity}
            iconTint="text-indigo-600"
            title="Recent activity"
            subtitle="Latest training sessions"
          >
            {loading ? (
              <div className="divide-y divide-border/40">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-5 py-3">
                    <div className="h-3.5 w-2/3 rounded shimmer-bg mb-1.5" />
                    <div className="h-3 w-1/2 rounded shimmer-bg" />
                  </div>
                ))}
              </div>
            ) : recentSessions.length === 0 ? (
              <RichEmptyState
                icon={Clock}
                accent="dashboard"
                title="No sessions yet"
                description="Sessions will appear here once learners start training."
                compact
              />
            ) : (
              <div className="divide-y divide-border/40">
                {recentSessions.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center shrink-0 text-[10px] font-semibold text-indigo-700">
                      {(s.user_display_name || s.user_email || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{s.user_display_name || s.user_email || 'Unknown'}</p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">{s.scenario_title || 'Untitled'}</p>
                    </div>
                    {(s.status === 'completed' || s.status === 'ended') ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
