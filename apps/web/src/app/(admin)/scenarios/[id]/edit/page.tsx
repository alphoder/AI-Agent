'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface PersonaOption { id: string; name: string; avatar_id?: string; avatar_thumbnail_url: string | null; }
interface AvatarOption { id: string; name: string; thumbnail_url: string | null; status: string; }
interface RubricLevel { score: number; label: string; description: string; }
interface RubricCriterion { name: string; description: string; weight: number; levels: RubricLevel[]; }

const DEFAULT_LEVELS: RubricLevel[] = [
  { score: 1, label: 'Poor', description: '' },
  { score: 3, label: 'Adequate', description: '' },
  { score: 5, label: 'Excellent', description: '' },
];

type TabKey = 'basics' | 'context' | 'rubric' | 'settings';

export default function EditScenarioPage() {
  const router = useRouter();
  const params = useParams();
  const scenarioId = params.id as string;

  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [selectedAvatarIds, setSelectedAvatarIds] = useState<string[]>([]);
  const [tab, setTab] = useState<TabKey>('basics');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState('');
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [personaId, setPersonaId] = useState('');
  const [difficulty, setDifficulty] = useState('intermediate');
  const [tags, setTags] = useState('');
  const [objective, setObjective] = useState('');
  const [openingContext, setOpeningContext] = useState('');
  const [openingMessage, setOpeningMessage] = useState('');
  const [maxDuration, setMaxDuration] = useState(600);
  const [maxTurns, setMaxTurns] = useState(50);
  const [criteria, setCriteria] = useState<RubricCriterion[]>([
    { name: '', description: '', weight: 100, levels: [...DEFAULT_LEVELS] },
  ]);

  const loadScenario = useCallback(async () => {
    setFetchLoading(true);
    setFetchError('');
    try {
      const [scenarioRes, personaRes, avatarsRes] = await Promise.all([
        apiClient.get(`/scenarios/${scenarioId}`),
        apiClient.get('/personas', { params: { limit: 100 } }),
        apiClient.get('/avatars', { params: { status: 'active', limit: 100 } }),
      ]);

      const s = scenarioRes.data.data;
      setPersonas(personaRes.data.data);
      setAvatars(avatarsRes.data.data);

      // Populate selected avatar IDs
      if (Array.isArray(s.avatar_ids) && s.avatar_ids.length > 0) {
        setSelectedAvatarIds(s.avatar_ids);
      } else {
        setSelectedAvatarIds([]);
      }

      setTitle(s.title || '');
      setDescription(s.description || '');
      setPersonaId(s.persona_id || '');
      setDifficulty(s.difficulty_level || 'intermediate');
      setObjective(s.objective || '');
      setOpeningContext(s.opening_context || '');
      setOpeningMessage(s.opening_message || '');
      setMaxDuration(s.max_duration_sec ?? 600);
      setMaxTurns(s.max_turns ?? 50);

      // Tags can be an array or pg text array string
      if (Array.isArray(s.tags)) {
        setTags(s.tags.join(', '));
      } else if (typeof s.tags === 'string' && s.tags !== '{}') {
        // Handle PostgreSQL array literal like {tag1,tag2}
        setTags(s.tags.replace(/^\{|\}$/g, '').split(',').join(', '));
      } else {
        setTags('');
      }

      // scoring_rubric may be a JSON object or stringified
      if (s.scoring_rubric) {
        const rubric = typeof s.scoring_rubric === 'string'
          ? JSON.parse(s.scoring_rubric)
          : s.scoring_rubric;
        if (Array.isArray(rubric) && rubric.length > 0) {
          setCriteria(rubric);
        }
      }
    } catch (err: any) {
      setFetchError(err.response?.data?.error?.message || 'Failed to load scenario');
    } finally {
      setFetchLoading(false);
    }
  }, [scenarioId]);

  useEffect(() => {
    loadScenario();
  }, [loadScenario]);

  const toggleAvatar = (id: string) => {
    setSelectedAvatarIds((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);

  const addCriterion = () => {
    if (criteria.length >= 10) return;
    setCriteria([...criteria, { name: '', description: '', weight: 0, levels: [...DEFAULT_LEVELS] }]);
  };

  const updateCriterion = (idx: number, field: string, value: any) => {
    const updated = [...criteria];
    (updated[idx] as any)[field] = value;
    setCriteria(updated);
  };

  const removeCriterion = (idx: number) => {
    setCriteria(criteria.filter((_, i) => i !== idx));
  };

  const updateLevel = (cIdx: number, lIdx: number, field: string, value: any) => {
    const updated = [...criteria];
    (updated[cIdx].levels[lIdx] as any)[field] = value;
    setCriteria(updated);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await apiClient.patch(`/scenarios/${scenarioId}`, {
        title,
        description: description || null,
        persona_id: personaId,
        objective,
        opening_context: openingContext || null,
        opening_message: openingMessage || null,
        scoring_rubric: criteria,
        difficulty_level: difficulty,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        max_duration_sec: maxDuration,
        max_turns: maxTurns,
        avatar_ids: selectedAvatarIds.length > 0 ? selectedAvatarIds : undefined,
      });
      router.push('/scenarios');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to save changes');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await apiClient.delete(`/scenarios/${scenarioId}`);
      router.push('/scenarios');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to delete scenario');
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  // ---------- Loading state ----------
  if (fetchLoading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="flex gap-2 border-b pb-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 w-20 bg-muted rounded" />
            ))}
          </div>
          <div className="space-y-4">
            <div className="h-10 w-full bg-muted rounded" />
            <div className="h-20 w-full bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-10 bg-muted rounded" />
              <div className="h-10 bg-muted rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Error state ----------
  if (fetchError) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Failed to load scenario</h2>
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <div className="flex gap-3">
            <button onClick={() => router.push('/scenarios')} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              Back to Scenarios
            </button>
            <button onClick={loadScenario} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Main form ----------
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Edit Scenario</h1>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          Delete Scenario
        </button>
      </div>

      {error && <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>}

      <div className="flex gap-2 border-b mb-6">
        {(['basics', 'context', 'rubric', 'settings'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{t}</button>
        ))}
      </div>

      {tab === 'basics' && (
        <div className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Title *</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="e.g., Cold Call: Enterprise Demo" /></div>
          <div><label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
          <div><label className="block text-sm font-medium mb-1">Persona *</label>
            <select value={personaId} onChange={(e) => setPersonaId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">Select a persona...</option>
              {personas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          {/* Available Avatars multi-select */}
          <div>
            <label className="block text-sm font-medium mb-1">Available Avatars</label>
            <p className="text-xs text-muted-foreground mb-3">Select which avatars learners can choose from for this scenario. The persona&apos;s linked avatar is auto-selected.</p>
            {avatars.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed rounded-lg text-sm text-muted-foreground">
                No active avatars found
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {avatars.map((a) => {
                  const isSelected = selectedAvatarIds.includes(a.id);
                  const isLinked = personas.find((p) => p.id === personaId)?.avatar_id === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => toggleAvatar(a.id)}
                      className={`relative rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                          : 'border-input hover:border-primary/50 hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                          {a.thumbnail_url ? (
                            <img src={a.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-lg font-medium text-muted-foreground">{a.name.charAt(0)}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{a.name}</p>
                          {isLinked && <p className="text-xs text-primary">Persona avatar</p>}
                        </div>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? 'border-primary bg-primary' : 'border-input'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-primary-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedAvatarIds.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">{selectedAvatarIds.length} avatar{selectedAvatarIds.length !== 1 ? 's' : ''} selected</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium mb-1">Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
              </select></div>
            <div><label className="block text-sm font-medium mb-1">Tags (comma-separated)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
          </div>
        </div>
      )}

      {tab === 'context' && (
        <div className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Objective *</label>
            <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="What should the learner achieve?" /></div>
          <div><label className="block text-sm font-medium mb-1">Opening Context</label>
            <textarea value={openingContext} onChange={(e) => setOpeningContext(e.target.value)} rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Background info for the scenario" /></div>
          <div><label className="block text-sm font-medium mb-1">Opening Message</label>
            <textarea value={openingMessage} onChange={(e) => setOpeningMessage(e.target.value)} rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Avatar's first message" /></div>
        </div>
      )}

      {tab === 'rubric' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">Total Weight: </span>
              <span className={`text-sm font-bold ${totalWeight === 100 ? 'text-green-600' : 'text-red-600'}`}>{totalWeight}/100</span>
            </div>
            <button onClick={addCriterion} disabled={criteria.length >= 10}
              className="rounded-md bg-primary px-3 py-1 text-sm text-primary-foreground disabled:opacity-50">Add Criterion</button>
          </div>
          {/* Weight progress bar */}
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full transition-all ${totalWeight === 100 ? 'bg-green-500' : totalWeight > 100 ? 'bg-red-500' : 'bg-yellow-500'}`}
              style={{ width: `${Math.min(totalWeight, 100)}%` }} />
          </div>

          {criteria.map((c, cIdx) => (
            <div key={cIdx} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-sm">Criterion {cIdx + 1}</h3>
                {criteria.length > 1 && (
                  <button onClick={() => removeCriterion(cIdx)} className="text-xs text-destructive hover:underline">Remove</button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input type="text" value={c.name} onChange={(e) => updateCriterion(cIdx, 'name', e.target.value)}
                  placeholder="Name" className="rounded-md border border-input bg-background px-3 py-2 text-sm col-span-2" />
                <input type="number" value={c.weight} onChange={(e) => updateCriterion(cIdx, 'weight', Number(e.target.value))}
                  placeholder="Weight" className="rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </div>
              <textarea value={c.description} onChange={(e) => updateCriterion(cIdx, 'description', e.target.value)}
                placeholder="Description" rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Levels</p>
                {c.levels.map((l, lIdx) => (
                  <div key={lIdx} className="grid grid-cols-12 gap-2 items-center">
                    <span className="text-sm text-center col-span-1">{l.score}</span>
                    <input type="text" value={l.label} onChange={(e) => updateLevel(cIdx, lIdx, 'label', e.target.value)}
                      placeholder="Label" className="rounded-md border border-input bg-background px-2 py-1 text-sm col-span-3" />
                    <input type="text" value={l.description} onChange={(e) => updateLevel(cIdx, lIdx, 'description', e.target.value)}
                      placeholder="Description" className="rounded-md border border-input bg-background px-2 py-1 text-sm col-span-8" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'settings' && (
        <div className="space-y-4">
          <div><label className="block text-sm font-medium mb-1">Max Duration: {Math.floor(maxDuration / 60)} min</label>
            <input type="range" min={300} max={1800} step={60} value={maxDuration} onChange={(e) => setMaxDuration(Number(e.target.value))} className="w-full" /></div>
          <div><label className="block text-sm font-medium mb-1">Max Turns: {maxTurns}</label>
            <input type="range" min={10} max={100} step={5} value={maxTurns} onChange={(e) => setMaxTurns(Number(e.target.value))} className="w-full" /></div>
        </div>
      )}

      <div className="flex justify-end gap-3 mt-8">
        <button onClick={() => router.push('/scenarios')} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting || !title || !personaId || !objective || totalWeight !== 100}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
          {submitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteDialog(false)} />
          <div className="relative bg-background border rounded-lg shadow-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold">Delete Scenario</h2>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{title}</strong>? This action cannot be undone.
              All assignments associated with this scenario will also be affected.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowDeleteDialog(false)} disabled={deleting}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
