'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import {
  ClipboardList, ClipboardCheck, Drama, Users, GraduationCap, Plus, Check, ArrowRight, ArrowLeft,
  Search, Calendar, Trash2, X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { RichEmptyState } from '@/components/ui/rich-empty-state';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScenarioRow {
  id: string;
  title: string;
  description?: string;
  status: string;
  difficulty_level?: string;
  persona_id?: string | null;
}
interface PersonaRow {
  id: string;
  name: string;
  description?: string;
  avatar_id?: string | null;
}
interface AvatarRow {
  id: string;
  name: string;
  status: string;
  gender?: string | null;
  tts_voice_id?: string | null;
  thumbnail_url?: string | null;
}
interface LearnerRow {
  id: string;
  email: string;
  display_name: string;
}
interface AssignmentRow {
  assignment_id: string;
  scenario_id: string;
  user_id: string;
  persona_id: string | null;
  avatar_id: string | null;
  status: 'assigned' | 'in_progress' | 'completed';
  due_date: string | null;
  assigned_at: string;
  learner_email: string;
  learner_name: string;
  scenario_title: string;
  persona_name: string | null;
  avatar_name: string | null;
  avatar_gender: string | null;
  latest_session_id: string | null;
  latest_score: number | null;
}

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  assigned:    { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Not started' },
  in_progress: { bg: 'bg-blue-50',    text: 'text-blue-700',   label: 'In progress' },
  completed:   { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Completed' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.assigned;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function GenderIcon({ gender }: { gender: string | null | undefined }) {
  if (!gender) return null;
  const color = gender === 'female' ? 'text-pink-500' : gender === 'male' ? 'text-blue-500' : 'text-violet-500';
  return <span className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}>{gender.replace('_', ' ')}</span>;
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/assignments', { params: { limit: 200 } });
      setAssignments(res.data.data || []);
    } catch {
      setError('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = assignments;
    if (statusFilter !== 'all') {
      list = list.filter((a) => a.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.learner_name.toLowerCase().includes(q) ||
          a.learner_email.toLowerCase().includes(q) ||
          a.scenario_title.toLowerCase().includes(q),
      );
    }
    return list;
  }, [assignments, search, statusFilter]);

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Delete assignment for "${label}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/assignments/${id}`);
      setAssignments((prev) => prev.filter((a) => a.assignment_id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to delete assignment';
      alert(msg);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <PageHeader
        icon={ClipboardCheck}
        accent="assign"
        title="Assignments"
        subtitle="Assign scenarios to learners. Pair the persona and avatar they'll train with."
        actions={
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Assignment
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search learner or scenario…"
            className="w-full rounded-lg border border-border bg-card pl-10 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'assigned', label: 'Not started' },
            { id: 'in_progress', label: 'In progress' },
            { id: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive text-sm px-4 py-3">{error}</div>
      )}

      {/* Table */}
      <SectionCard
        icon={ClipboardCheck}
        iconTint="text-rose-600"
        title="All assignments"
        subtitle="Click a row for details."
      >
        <table className="w-full">
          <thead>
            <tr className="bg-muted/30">
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Learner</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scenario</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Persona</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avatar</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t border-border/40">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-5 py-4">
                      <div className="h-4 w-24 rounded shimmer-bg" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-0">
                  <RichEmptyState
                    icon={ClipboardCheck}
                    accent="assign"
                    title={search || statusFilter !== 'all' ? 'No assignments match' : 'No assignments yet'}
                    description={
                      search || statusFilter !== 'all'
                        ? 'Create a new one, or loosen your filters.'
                        : 'Click "New Assignment" to get started'
                    }
                    action={{ label: 'New assignment', onClick: () => setShowWizard(true) }}
                    compact
                  />
                </td>
              </tr>
            ) : (
              filtered.map((a) => (
                <tr key={a.assignment_id} className="border-t border-border/40 hover:bg-muted/20 transition-colors group">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium">{a.learner_name}</p>
                    <p className="text-xs text-muted-foreground">{a.learner_email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm">{a.scenario_title}</td>
                  <td className="px-5 py-3.5 text-sm">{a.persona_name || <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-3.5 text-sm">
                    {a.avatar_name ? (
                      <div className="flex items-center gap-2">
                        <span>{a.avatar_name}</span>
                        <GenderIcon gender={a.avatar_gender} />
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5"><StatusBadge status={a.status} /></td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground tabular-nums">
                    {a.due_date ? new Date(a.due_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-center text-sm tabular-nums font-medium">
                    {a.latest_score != null ? (
                      <span className={
                        a.latest_score >= 80 ? 'text-emerald-700' :
                        a.latest_score >= 60 ? 'text-amber-700' :
                        'text-rose-700'
                      }>
                        {Math.round(a.latest_score)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(a.assignment_id, `${a.learner_name} — ${a.scenario_title}`)}
                      className="opacity-0 group-hover:opacity-100 text-xs text-destructive hover:underline transition-opacity"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* Wizard modal */}
      {showWizard && (
        <AssignmentWizard
          onClose={() => setShowWizard(false)}
          onSaved={() => {
            setShowWizard(false);
            load();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Wizard modal                                                       */
/* ------------------------------------------------------------------ */

function AssignmentWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [personas, setPersonas] = useState<PersonaRow[]>([]);
  const [avatars, setAvatars] = useState<AvatarRow[]>([]);
  const [learners, setLearners] = useState<LearnerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [scenarioId, setScenarioId] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [learnerIds, setLearnerIds] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [sc, pe, av, us] = await Promise.all([
          apiClient.get('/scenarios', { params: { status: 'active', limit: 200 } }),
          apiClient.get('/personas', { params: { limit: 200 } }),
          apiClient.get('/avatars', { params: { status: 'active', limit: 200 } }),
          apiClient.get('/users', { params: { role: 'learner', limit: 200 } }),
        ]);
        setScenarios(sc.data.data || []);
        setPersonas(pe.data.data || []);
        setAvatars(av.data.data || []);
        setLearners(us.data.data || []);
      } catch {
        setError('Failed to load wizard data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Auto-advance linked defaults: picking a scenario auto-picks its default persona,
  // which auto-picks its default avatar. User can still override.
  useEffect(() => {
    if (!scenarioId || personaId) return;
    const s = scenarios.find((x) => x.id === scenarioId);
    if (s?.persona_id) setPersonaId(s.persona_id);
  }, [scenarioId, scenarios, personaId]);

  useEffect(() => {
    if (!personaId || avatarId) return;
    const p = personas.find((x) => x.id === personaId);
    if (p?.avatar_id) setAvatarId(p.avatar_id);
  }, [personaId, personas, avatarId]);

  const selectedPersona = personas.find((p) => p.id === personaId);
  const selectedAvatar = avatars.find((a) => a.id === avatarId);

  // Rank avatars: gender-compatible with the persona's linked avatar first.
  // This realizes "female avatar → female voice linked" per the user's spec.
  const matchingGender = selectedPersona?.avatar_id
    ? avatars.find((a) => a.id === selectedPersona.avatar_id)?.gender
    : null;
  const rankedAvatars = useMemo(() => {
    const scored = avatars.map((a) => ({
      ...a,
      match: matchingGender ? (a.gender === matchingGender ? 2 : a.gender ? 1 : 0) : 0,
    }));
    return scored.sort((a, b) => b.match - a.match || a.name.localeCompare(b.name));
  }, [avatars, matchingGender]);

  async function handleSave() {
    if (!scenarioId || learnerIds.size === 0) {
      setError('Pick a scenario and at least one learner');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/assignments', {
        scenario_id: scenarioId,
        persona_id: personaId || undefined,
        avatar_id: avatarId || undefined,
        user_ids: Array.from(learnerIds),
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
      });
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message
        || 'Failed to create assignments';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  const canAdvance =
    step === 1 ? !!scenarioId :
    step === 2 ? !!personaId :
    step === 3 ? !!avatarId :
    learnerIds.size > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <div className="relative bg-background border rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">New Assignment</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Step {step} of 4</p>
          </div>
          <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4">
          <div className="flex items-center gap-2">
            {[
              { n: 1, label: 'Scenario', icon: ClipboardList },
              { n: 2, label: 'Persona', icon: Drama },
              { n: 3, label: 'Avatar', icon: Users },
              { n: 4, label: 'Learners', icon: GraduationCap },
            ].map((s, idx) => (
              <div key={s.n} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    step === s.n
                      ? 'bg-primary text-primary-foreground'
                      : step > s.n
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step > s.n ? <Check className="w-3.5 h-3.5" /> : s.n}
                </div>
                <span className={`text-xs ${step === s.n ? 'font-medium' : 'text-muted-foreground'} truncate`}>
                  {s.label}
                </span>
                {idx < 3 && <div className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : (
            <>
              {/* Step 1: Scenario */}
              {step === 1 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">Which scenario are you assigning?</p>
                  {scenarios.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No active scenarios. Create one first.
                    </div>
                  ) : (
                    scenarios.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setScenarioId(s.id); setPersonaId(''); setAvatarId(''); }}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          scenarioId === s.id
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <ClipboardList className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{s.title}</p>
                            {s.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
                            )}
                            {s.difficulty_level && (
                              <span className="inline-block mt-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                {s.difficulty_level}
                              </span>
                            )}
                          </div>
                          {scenarioId === s.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Step 2: Persona */}
              {step === 2 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Which persona will the learner interact with?
                    {selectedPersona && (
                      <span className="text-primary"> ({selectedPersona.name} is the scenario default)</span>
                    )}
                  </p>
                  {personas.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                      No personas available.
                    </div>
                  ) : (
                    personas.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setPersonaId(p.id); setAvatarId(''); }}
                        className={`w-full text-left rounded-lg border p-3 transition-colors ${
                          personaId === p.id
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <Drama className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{p.name}</p>
                            {p.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                            )}
                          </div>
                          {personaId === p.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Step 3: Avatar */}
              {step === 3 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-3">
                    Pick the avatar to use for this training.
                    {matchingGender && (
                      <span className="text-primary"> ({matchingGender.replace('_', ' ')} voices are recommended to match the persona)</span>
                    )}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {rankedAvatars.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setAvatarId(a.id)}
                        className={`text-left rounded-lg border p-3 transition-colors relative ${
                          avatarId === a.id
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-primary/50 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center overflow-hidden shrink-0">
                            {a.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-sm font-semibold text-slate-500">
                                {a.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{a.name}</p>
                              {matchingGender && a.gender === matchingGender && (
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">match</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <GenderIcon gender={a.gender} />
                              {a.tts_voice_id && (
                                <span className="text-[10px] text-muted-foreground truncate">{a.tts_voice_id}</span>
                              )}
                            </div>
                          </div>
                          {avatarId === a.id && <Check className="w-5 h-5 text-primary shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 4: Learners + due date */}
              {step === 4 && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Which learners?</p>
                    <div className="border border-border rounded-lg max-h-64 overflow-y-auto">
                      {learners.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">No learners in your tenant.</div>
                      ) : (
                        learners.map((l) => {
                          const selected = learnerIds.has(l.id);
                          return (
                            <label
                              key={l.id}
                              className={`flex items-center gap-3 px-4 py-2.5 border-b border-border/30 last:border-0 cursor-pointer transition-colors ${
                                selected ? 'bg-primary/5' : 'hover:bg-muted/30'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  setLearnerIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(l.id)) next.delete(l.id); else next.add(l.id);
                                    return next;
                                  });
                                }}
                                className="h-4 w-4 rounded border-input"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{l.display_name}</p>
                                <p className="text-xs text-muted-foreground">{l.email}</p>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 block">
                      Due date (optional)
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-card pl-10 pr-3 py-2 text-sm"
                      />
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs space-y-1">
                    <div className="flex gap-2"><span className="text-muted-foreground w-20">Scenario:</span><span className="font-medium">{scenarios.find(s => s.id === scenarioId)?.title}</span></div>
                    <div className="flex gap-2"><span className="text-muted-foreground w-20">Persona:</span><span className="font-medium">{selectedPersona?.name || '—'}</span></div>
                    <div className="flex gap-2"><span className="text-muted-foreground w-20">Avatar:</span><span className="font-medium">{selectedAvatar?.name || '—'}{selectedAvatar?.gender ? ` (${selectedAvatar.gender.replace('_', ' ')})` : ''}</span></div>
                    <div className="flex gap-2"><span className="text-muted-foreground w-20">Learners:</span><span className="font-medium">{learnerIds.size}</span></div>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-4 rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border/50 flex items-center justify-between">
          <button
            onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3 | 4) : onClose()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
              disabled={!canAdvance}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Next
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !canAdvance}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Assigning…' : `Assign to ${learnerIds.size || 0} learner${learnerIds.size !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
