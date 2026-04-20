'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { HelpHint } from '@/components/ui/help-hint';
import { getAccessToken } from '@/lib/auth';
import { StatTile } from '@/components/ui/stat-tile';
import { SectionCard } from '@/components/ui/section-card';
import { RichEmptyState } from '@/components/ui/rich-empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';
import { ActivityCalendar, ActivityEvent } from '@/components/ui/activity-calendar';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Trophy,
  AlertTriangle,
  Play,
  RotateCcw,
  BarChart3,
  GraduationCap,
  Timer,
  Tag,
  ChevronRight,
  Sparkles,
  Calendar,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Assignment {
  assignment_id: string;
  scenario_id: string;
  assignment_status: 'assigned' | 'in_progress' | 'completed';
  due_date: string | null;
  title: string;
  description: string | null;
  objective: string | null;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  max_duration_sec: number;
  persona_name: string;
  persona_thumbnail_url: string | null;
  opening_message: string | null;
  tags: string[] | null;
  overall_score?: number | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DIFFICULTY_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  beginner:     { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  intermediate: { bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-500' },
  advanced:     { bg: 'bg-rose-50',    text: 'text-rose-700',    dot: 'bg-rose-500' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  assigned:    { label: 'Not Started',  color: 'text-slate-600',  bgColor: 'bg-slate-100' },
  in_progress: { label: 'In Progress',  color: 'text-blue-600',   bgColor: 'bg-blue-50' },
  completed:   { label: 'Completed',    color: 'text-emerald-600', bgColor: 'bg-emerald-50' },
};

const AVATAR_COLORS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-600',
  'from-emerald-500 to-teal-600',
  'from-orange-500 to-amber-600',
  'from-pink-500 to-rose-600',
  'from-indigo-500 to-blue-600',
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'completed') return false;
  return new Date(dueDate) < new Date();
}

function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays > 0 && diffDays <= 7) return `Due in ${diffDays} days`;
  return `Due ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function decodeUserEmail(): string | null {
  try {
    const token = getAccessToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.email || payload.sub || null;
  } catch {
    return null;
  }
}

function getFirstName(email: string): string {
  const local = email.split('@')[0] || '';
  const parts = local.split(/[._-]/).filter(Boolean);
  const first = parts[0] || local;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/* ------------------------------------------------------------------ */
/*  Skeleton Components                                                */
/* ------------------------------------------------------------------ */

function HeroSkeleton() {
  return (
    <div className="rounded-3xl bg-grad-learner-hero p-8 md:p-10 shadow-xl shadow-indigo-500/20 animate-pulse">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-8">
        <div className="space-y-3 flex-1">
          <div className="h-9 w-64 rounded bg-white/20" />
          <div className="h-5 w-80 rounded bg-white/10" />
        </div>
        <div className="h-[120px] w-[120px] rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function AssignmentSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden animate-pulse">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full shimmer-bg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded shimmer-bg" />
            <div className="h-3 w-1/2 rounded shimmer-bg" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full shimmer-bg" />
          <div className="h-5 w-20 rounded-full shimmer-bg" />
        </div>
        <div className="h-10 w-full rounded-xl shimmer-bg" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assignment Card                                                    */
/* ------------------------------------------------------------------ */

function AssignmentCard({
  assignment,
  onAction,
  isClient,
}: {
  assignment: Assignment;
  onAction: (action: string) => void;
  isClient: boolean;
}) {
  const a = assignment;
  const overdue = isClient ? isOverdue(a.due_date, a.assignment_status) : false;
  const diff = DIFFICULTY_STYLES[a.difficulty_level] || DIFFICULTY_STYLES.beginner;
  const statusCfg = STATUS_CONFIG[a.assignment_status] || STATUS_CONFIG.assigned;
  const gradient = getAvatarGradient(a.persona_name);
  const isCompleted = a.assignment_status === 'completed';
  const hasScore = isCompleted && a.overall_score != null;

  return (
    <div
      onClick={() => onAction(isCompleted ? 'report' : 'start')}
      className="group cursor-pointer rounded-2xl border border-border/60 bg-card overflow-hidden card-interactive"
    >
      <div className="p-5 space-y-4">
        {/* Header: Avatar + Title + Score ring */}
        <div className="flex items-start gap-3">
          <div
            className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}
          >
            {a.persona_thumbnail_url ? (
              <img src={a.persona_thumbnail_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-white">{a.persona_name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
              {a.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">{a.persona_name}</p>
          </div>
          {hasScore && (
            <ProgressRing
              value={a.overall_score!}
              size={48}
              stroke={5}
              label={
                <span className="text-[11px] font-bold tabular-nums text-foreground">
                  {Math.round(a.overall_score!)}
                </span>
              }
            />
          )}
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${diff.bg} ${diff.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${diff.dot}`} />
            {a.difficulty_level.charAt(0).toUpperCase() + a.difficulty_level.slice(1)}
          </span>

          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
            {statusCfg.label}
          </span>

          {a.tags?.slice(0, 2).map((tag) => (
            <span key={tag} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>

        {/* Description */}
        {a.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{a.description}</p>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            {Math.floor(a.max_duration_sec / 60)} min
          </span>
          {a.due_date && (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-destructive font-medium' : ''}`}>
              {overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
              {overdue ? 'Overdue' : isClient ? formatDueDate(a.due_date) : '\u2014'}
            </span>
          )}
        </div>

        {/* CTA */}
        <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          {isCompleted ? (
            <>
              <button
                onClick={() => onAction('retry')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Try Again
              </button>
              <button
                onClick={() => onAction('report')}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                View Report
              </button>
            </>
          ) : (
            <button
              onClick={() => onAction('start')}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm group/btn"
            >
              <Play className="w-3.5 h-3.5 transition-transform group-hover/btn:scale-110" />
              {a.assignment_status === 'in_progress' ? 'Resume' : 'Start Session'}
              <ChevronRight className="w-3.5 h-3.5 opacity-0 -ml-1 group-hover/btn:opacity-100 group-hover/btn:ml-0 transition-all" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LearnerDashboardPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('there');
  const [isClient, setIsClient] = useState(false);

  // Hydration-safe: read localStorage only on client mount
  useEffect(() => {
    setIsClient(true);
    const email = decodeUserEmail();
    if (email) setUserName(getFirstName(email));
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [assignRes, activityRes] = await Promise.allSettled([
          apiClient.get('/scenarios/assignments/me'),
          apiClient.get('/analytics/my-activity', { params: { days: 90 } }),
        ]);

        const assignList: Assignment[] = assignRes.status === 'fulfilled'
          ? (assignRes.value.data?.data ?? [])
          : [];
        setAssignments(assignList);

        // Build calendar events from (a) learner's own sessions and
        // (b) upcoming assignment due dates for open assignments.
        const events: ActivityEvent[] = [];
        if (activityRes.status === 'fulfilled') {
          const payload = activityRes.value.data?.data;
          const sessions = (payload?.sessions || []) as Array<{
            id: string; created_at: string; status: string;
            duration_sec: number | null; scenario_title: string;
            overall_score: number | string | null;
          }>;
          for (const s of sessions) {
            const score = s.overall_score != null ? Number(s.overall_score) : null;
            const started = s.created_at ? new Date(s.created_at) : null;
            const bits: string[] = [];
            if (started && !isNaN(started.getTime())) {
              bits.push(started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
            }
            if (s.duration_sec) {
              const mins = Math.max(1, Math.round(s.duration_sec / 60));
              bits.push(`${mins} min`);
            }
            events.push({
              date: s.created_at,
              type: 'session',
              title: s.scenario_title || 'Training session',
              subtitle: bits.length ? bits.join(' · ') : undefined,
              score,
              href: `/reports?session=${s.id}`,
            });
          }
          const dues = (payload?.due_assignments || []) as Array<{
            assignment_id: string; scenario_id: string; scenario_title: string; due_date: string;
          }>;
          for (const d of dues) {
            events.push({
              date: d.due_date,
              type: 'due',
              title: `Due: ${d.scenario_title}`,
              subtitle: 'Open assignment',
              href: `/session/${d.scenario_id}?assignment=${d.assignment_id}`,
            });
          }
        }
        setCalendarEvents(events);
      } catch (err) {
        console.error('Failed to fetch assignments:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* Computed stats */
  const stats = useMemo(() => {
    const total = assignments.length;
    const completed = assignments.filter((a) => a.assignment_status === 'completed').length;
    const inProgress = assignments.filter((a) => a.assignment_status === 'in_progress').length;
    const scores = assignments
      .filter((a) => a.overall_score != null)
      .map((a) => a.overall_score!);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
    const completionPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, avgScore, completionPct };
  }, [assignments]);

  function handleAction(a: Assignment, action: string) {
    switch (action) {
      case 'start':
      case 'retry':
        router.push(`/session/${a.scenario_id}?assignment=${a.assignment_id}`);
        break;
      case 'report':
        router.push(`/reports?session=${(a as any).latest_session_id || a.assignment_id}`);
        break;
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* ── Hero ── */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <div className="rounded-3xl bg-grad-learner-hero p-8 md:p-10 text-white shadow-xl shadow-indigo-500/20 relative overflow-hidden animate-fade-in">
          {/* Decorative blurred circles */}
          <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-pink-300/20 blur-3xl" />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1 text-xs font-medium mb-4">
                <Sparkles className="w-3.5 h-3.5" />
                Your training space
              </div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
                Welcome back, {userName}
              </h1>
              <p className="mt-2 text-white/80 text-base md:text-lg max-w-xl">
                Ready for your next training session? Your progress is looking great.
              </p>

              {stats.total > 0 && (
                <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="font-medium">{stats.completed} completed</span>
                  </div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-sm px-3 py-1.5">
                    <BookOpen className="w-4 h-4" />
                    <span className="font-medium">{stats.total} assigned</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 flex items-center justify-center md:justify-end">
              <ProgressRing
                value={stats.completionPct}
                size={128}
                stroke={10}
                color="#ffffff"
                trackColor="rgba(255,255,255,0.25)"
                label={
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold leading-none">{stats.completionPct}%</div>
                    <div className="text-[11px] font-medium uppercase tracking-wider opacity-80 mt-1">Overall</div>
                  </div>
                }
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Row ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile icon={GraduationCap} label="In progress" value={0} accent="assign" loading />
          <StatTile icon={CheckCircle2} label="Completed" value={0} accent="learners" loading />
          <StatTile icon={Trophy} label="Average score" value={0} accent="analytics" loading />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile
            icon={GraduationCap}
            label="In progress"
            value={stats.inProgress}
            accent="assign"
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={stats.completed}
            accent="learners"
          />
          <StatTile
            icon={Trophy}
            label="Average score"
            value={stats.avgScore}
            suffix={stats.avgScore > 0 ? '%' : ''}
            accent="analytics"
          />
        </div>
      )}

      {/* Help hint */}
      {!loading && assignments.length > 0 && (
        <HelpHint variant="tip" dismissible dismissKey="learner-dashboard-tip" title="Your training assignments">
          Each card below is a training scenario assigned by your instructor. Click a card or &apos;Start Session&apos; to begin a live conversation with an AI avatar. Your performance will be scored against the scenario&apos;s rubric criteria.
        </HelpHint>
      )}

      {/* ── Activity calendar ── */}
      <SectionCard
        icon={Calendar}
        iconTint="text-emerald-600"
        title="Your activity"
        subtitle="Past sessions (emerald) and upcoming deadlines (amber). Click a day for details."
      >
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Loading your calendar…</div>
        ) : (
          <ActivityCalendar events={calendarEvents} accent="learners" />
        )}
      </SectionCard>

      {/* ── Assignments ── */}
      {loading ? (
        <SectionCard icon={BookOpen} iconTint="text-indigo-600" title="Your assignments" subtitle="Pick up where you left off">
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <AssignmentSkeleton key={i} />
            ))}
          </div>
        </SectionCard>
      ) : assignments.length === 0 ? (
        <SectionCard icon={BookOpen} iconTint="text-indigo-600" title="Your assignments" subtitle="Pick up where you left off">
          <RichEmptyState
            icon={BookOpen}
            accent="learners"
            title="No assignments yet"
            description="Your admin will assign you scenarios here. Check back soon!"
          />
        </SectionCard>
      ) : (
        <SectionCard
          icon={BookOpen}
          iconTint="text-indigo-600"
          title="Your assignments"
          subtitle="Pick up where you left off"
        >
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {assignments.map((a) => (
              <AssignmentCard
                key={a.assignment_id}
                assignment={a}
                isClient={isClient}
                onAction={(action) => handleAction(a, action)}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
