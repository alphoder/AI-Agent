'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth';
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
  Inbox,
  Timer,
  Tag,
  ChevronRight,
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

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ------------------------------------------------------------------ */
/*  Skeleton Components                                                */
/* ------------------------------------------------------------------ */

function StatSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-muted" />
        <div className="space-y-2 flex-1">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="h-6 w-12 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/50 bg-card overflow-hidden animate-pulse">
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-muted" />
          <div className="h-5 w-20 rounded-full bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-2/3 rounded bg-muted" />
        </div>
        <div className="flex gap-2 pt-1">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-3 w-20 rounded bg-muted" />
        </div>
        <div className="h-10 w-full rounded-xl bg-muted" />
      </div>
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
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5 hover:shadow-md transition-shadow duration-300">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Assignment Card                                                    */
/* ------------------------------------------------------------------ */

function AssignmentCard({ assignment, onAction, isClient }: { assignment: Assignment; onAction: (action: string) => void; isClient: boolean }) {
  const a = assignment;
  const overdue = isClient ? isOverdue(a.due_date, a.assignment_status) : false;
  const diff = DIFFICULTY_STYLES[a.difficulty_level] || DIFFICULTY_STYLES.beginner;
  const statusCfg = STATUS_CONFIG[a.assignment_status] || STATUS_CONFIG.assigned;
  const gradient = getAvatarGradient(a.persona_name);

  return (
    <div className="group rounded-2xl border border-border/50 bg-card overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300">
      <div className="p-5 space-y-4">
        {/* Header: Avatar + Title */}
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center flex-shrink-0 shadow-sm`}>
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
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Difficulty */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${diff.bg} ${diff.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${diff.dot}`} />
            {a.difficulty_level.charAt(0).toUpperCase() + a.difficulty_level.slice(1)}
          </span>

          {/* Status */}
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusCfg.bgColor} ${statusCfg.color}`}>
            {a.assignment_status === 'completed' && a.overall_score != null
              ? `${Math.round(a.overall_score)}%`
              : statusCfg.label}
          </span>

          {/* Tags */}
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
        <div className="flex gap-2 pt-1">
          {a.assignment_status === 'completed' ? (
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
              {a.assignment_status === 'in_progress' ? 'Resume Session' : 'Start Session'}
              <ChevronRight className="w-3.5 h-3.5 opacity-0 -ml-1 group-hover/btn:opacity-100 group-hover/btn:ml-0 transition-all" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center mb-6">
        <Inbox className="w-10 h-10 text-muted-foreground/50" />
      </div>
      <h2 className="text-lg font-semibold mb-2">No assignments yet</h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed">
        Your training scenarios will appear here once your administrator assigns them to you. Check back soon!
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LearnerDashboardPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string | null>(null);
  const [greeting, setGreeting] = useState('Welcome back');
  const [isClient, setIsClient] = useState(false);

  // Hydration-safe: read localStorage only on client mount
  useEffect(() => {
    setIsClient(true);
    const email = decodeUserEmail();
    if (email) setUserName(email.split('@')[0]);
    setGreeting(getGreeting());
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await apiClient.get('/scenarios/assignments/me');
        setAssignments(data.data ?? []);
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
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;
    return { total, completed, inProgress, avgScore };
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
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          {greeting}{userName ? `, ${userName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          Track your progress and continue your training sessions.
        </p>
      </div>

      {/* Stats Row */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <StatSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Total Sessions" value={stats.total} accent="bg-blue-500" />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} accent="bg-emerald-500" />
          <StatCard icon={GraduationCap} label="In Progress" value={stats.inProgress} accent="bg-amber-500" />
          <StatCard
            icon={Trophy}
            label="Avg. Score"
            value={stats.avgScore != null ? `${stats.avgScore}%` : '--'}
            accent="bg-violet-500"
          />
        </div>
      )}

      {/* Assignment Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState />
      ) : (
        <div>
          <h2 className="text-lg font-semibold mb-4">Your Assignments</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {assignments.map((a) => (
              <AssignmentCard
                key={a.assignment_id}
                assignment={a}
                isClient={isClient}
                onAction={(action) => handleAction(a, action)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
