'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface PersonaOption { id: string; name: string; avatar_thumbnail_url: string | null; }
interface RubricLevel { score: number; label: string; description: string; }
interface RubricCriterion { name: string; description: string; weight: number; levels: RubricLevel[]; }

const DEFAULT_LEVELS: RubricLevel[] = [
  { score: 1, label: 'Poor', description: '' },
  { score: 3, label: 'Adequate', description: '' },
  { score: 5, label: 'Excellent', description: '' },
];

export default function CreateScenarioPage() {
  const router = useRouter();
  const [personas, setPersonas] = useState<PersonaOption[]>([]);
  const [tab, setTab] = useState<'basics' | 'context' | 'rubric' | 'settings'>('basics');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form
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

  useEffect(() => {
    apiClient.get('/personas', { params: { limit: 100 } }).then(({ data }) => setPersonas(data.data));
  }, []);

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
      await apiClient.post('/scenarios', {
        title, description: description || null, persona_id: personaId,
        objective, opening_context: openingContext || null, opening_message: openingMessage || null,
        scoring_rubric: criteria, difficulty_level: difficulty,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        max_duration_sec: maxDuration, max_turns: maxTurns,
      });
      router.push('/scenarios');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create Scenario</h1>
      {error && <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>}

      <div className="flex gap-2 border-b mb-6">
        {(['basics', 'context', 'rubric', 'settings'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{t}</button>
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
        <button onClick={() => router.push('/scenarios')} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
        <button onClick={handleSubmit} disabled={submitting || !title || !personaId || !objective || totalWeight !== 100}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {submitting ? 'Creating...' : 'Create Scenario'}
        </button>
      </div>
    </div>
  );
}
