'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { Plus, ClipboardList, Edit2 } from 'lucide-react';

interface Scenario {
  id: string;
  title: string;
  persona_name: string;
  avatar_thumbnail_url: string | null;
  status: string;
  difficulty_level: string;
  assignment_count: number;
  completed_count: number;
  avg_score: number | null;
  created_at: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  draft:    { bg: 'bg-slate-100',   text: 'text-slate-600',   dot: 'bg-slate-400',   label: 'Draft' },
  active:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
  archived: { bg: 'bg-amber-50',    text: 'text-amber-700',   dot: 'bg-amber-500',   label: 'Archived' },
};

const DIFFICULTY_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  beginner:     { bg: 'bg-blue-50',    text: 'text-blue-700',    label: 'Beginner' },
  intermediate: { bg: 'bg-violet-50',  text: 'text-violet-700',  label: 'Intermediate' },
  advanced:     { bg: 'bg-rose-50',    text: 'text-rose-700',    label: 'Advanced' },
};

/* ── Skeleton ── */
function TableRowSkeleton() {
  return (
    <tr className="border-b border-border/40">
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-3 animate-pulse">
          <div className="w-9 h-9 rounded-full bg-muted flex-shrink-0" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-36 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
        </div>
      </td>
      <td className="px-5 py-3.5"><div className="h-5 w-16 rounded-full bg-muted animate-pulse" /></td>
      <td className="px-5 py-3.5"><div className="h-5 w-20 rounded-full bg-muted animate-pulse" /></td>
      <td className="px-5 py-3.5 text-center"><div className="h-3.5 w-8 rounded bg-muted animate-pulse mx-auto" /></td>
      <td className="px-5 py-3.5 text-center"><div className="h-3.5 w-8 rounded bg-muted animate-pulse mx-auto" /></td>
      <td className="px-5 py-3.5 text-center"><div className="h-3.5 w-12 rounded bg-muted animate-pulse mx-auto" /></td>
      <td className="px-5 py-3.5 text-right"><div className="h-3.5 w-20 rounded bg-muted animate-pulse ml-auto" /></td>
      <td className="px-5 py-3.5 text-right"><div className="h-7 w-12 rounded-lg bg-muted animate-pulse ml-auto" /></td>
    </tr>
  );
}

/* ── Badge ── */
function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function DifficultyBadge({ level }: { level: string }) {
  const cfg = DIFFICULTY_CONFIG[level] ?? DIFFICULTY_CONFIG.beginner;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium capitalize ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

/* ── Score cell ── */
function ScoreCell({ score }: { score: number | null }) {
  if (score == null) return <span className="text-muted-foreground/40">—</span>;
  const color = score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600';
  return <span className={`font-semibold ${color}`}>{Math.round(score)}%</span>;
}

/* ── Empty state ── */
function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <tr>
      <td colSpan={8}>
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
            <ClipboardList className="w-8 h-8 text-muted-foreground/40" />
          </div>
          <h3 className="text-sm font-semibold mb-1.5">No scenarios found</h3>
          <p className="text-xs text-muted-foreground text-center max-w-xs mb-4">
            Scenarios define the training context, objectives, and scoring rubric.
          </p>
          <button
            onClick={onCreateClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Scenario
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ScenariosPage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    async function load() {
      try {
        const params: Record<string, string> = {};
        if (statusFilter !== 'all') params.status = statusFilter;
        const { data } = await apiClient.get('/scenarios', { params });
        setScenarios(data.data);
      } catch (err) {
        console.error('Failed to fetch scenarios:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Scenarios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Training scenarios with objectives, rubrics and assigned learners.
          </p>
        </div>
        <button
          onClick={() => router.push('/scenarios/create')}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create Scenario
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {['all', 'draft', 'active', 'archived'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium capitalize transition-all duration-150 ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-card border border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Scenario
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Status
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Difficulty
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Assigned
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Completed
                </th>
                <th className="text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Avg Score
                </th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-5 py-3">
                  Created
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} />)
                : scenarios.length === 0
                  ? <EmptyState onCreateClick={() => router.push('/scenarios/create')} />
                  : scenarios.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => router.push(`/scenarios/${s.id}/edit`)}
                      className="border-b border-border/40 last:border-0 cursor-pointer hover:bg-muted/30 transition-colors group"
                    >
                      {/* Scenario info */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center overflow-hidden flex-shrink-0">
                            {s.avatar_thumbnail_url ? (
                              <img src={s.avatar_thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-bold text-slate-500">
                                {s.persona_name?.charAt(0)?.toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground truncate max-w-[220px] group-hover:text-primary transition-colors">
                              {s.title}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">{s.persona_name}</p>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <StatusBadge status={s.status} />
                      </td>

                      {/* Difficulty */}
                      <td className="px-5 py-3.5">
                        <DifficultyBadge level={s.difficulty_level} />
                      </td>

                      {/* Assigned */}
                      <td className="px-5 py-3.5 text-center text-sm tabular-nums">
                        {s.assignment_count}
                      </td>

                      {/* Completed */}
                      <td className="px-5 py-3.5 text-center text-sm tabular-nums">
                        {s.completed_count}
                      </td>

                      {/* Avg Score */}
                      <td className="px-5 py-3.5 text-center text-sm tabular-nums">
                        <ScoreCell score={s.avg_score} />
                      </td>

                      {/* Created */}
                      <td className="px-5 py-3.5 text-right text-xs text-muted-foreground tabular-nums">
                        {new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </td>

                      {/* Edit */}
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/scenarios/${s.id}/edit`); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted hover:border-primary/30 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
