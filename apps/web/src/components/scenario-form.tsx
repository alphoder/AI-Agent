'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Loader2, Sparkles, Volume2, Square } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { LANGUAGES, MALE_VOICES, FEMALE_VOICES, GEMINI_VOICES, voiceSampleUrl } from '@avatar-platform/shared';

interface Level { score: number; label: string; description: string }
interface Criterion { name: string; description: string; weight: number; levels: Level[] }

export interface ScenarioFormValue {
  id?: string;
  title: string;
  description: string;
  objective: string;
  system_prompt: string;
  opening_message: string;
  language: string;
  voice: string;
  difficulty_level: string;
  visibility: 'public' | 'private';
  tags: string[];
  scoring_rubric: Criterion[];
}

function newCriterion(): Criterion {
  return {
    name: '',
    description: '',
    weight: 0,
    levels: [
      { score: 1, label: 'Needs work', description: '' },
      { score: 3, label: 'Solid', description: '' },
      { score: 5, label: 'Excellent', description: '' },
    ],
  };
}

export function emptyScenario(): ScenarioFormValue {
  return {
    title: '', description: '', objective: '', system_prompt: '', opening_message: '',
    language: 'en', voice: 'Aoede', difficulty_level: 'intermediate', visibility: 'private',
    tags: [], scoring_rubric: [newCriterion()],
  };
}

export function ScenarioForm({ initial, mode }: { initial: ScenarioFormValue; mode: 'create' | 'edit' }) {
  const router = useRouter();
  const [v, setV] = useState<ScenarioFormValue>(initial);
  const [tagsInput, setTagsInput] = useState(initial.tags.join(', '));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [improving, setImproving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function playSample(id: string) {
    audioRef.current?.pause();
    if (playing) { setPlaying(false); return; }
    const a = new Audio(voiceSampleUrl(id));
    audioRef.current = a;
    a.onended = () => setPlaying(false);
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }

  const totalWeight = v.scoring_rubric.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  function set<K extends keyof ScenarioFormValue>(key: K, val: ScenarioFormValue[K]) {
    setV((prev) => ({ ...prev, [key]: val }));
  }

  function updateCriterion(i: number, patch: Partial<Criterion>) {
    setV((prev) => {
      const rubric = [...prev.scoring_rubric];
      rubric[i] = { ...rubric[i], ...patch };
      return { ...prev, scoring_rubric: rubric };
    });
  }

  function updateLevel(ci: number, li: number, description: string) {
    setV((prev) => {
      const rubric = prev.scoring_rubric.map((c, i) => {
        if (i !== ci) return c;
        const levels = c.levels.map((l, j) => (j === li ? { ...l, description } : l));
        return { ...c, levels };
      });
      return { ...prev, scoring_rubric: rubric };
    });
  }

  async function submit() {
    setError(null);
    if (!v.title.trim() || !v.objective.trim() || !v.system_prompt.trim()) {
      setError('Title, objective and character prompt are required.');
      return;
    }
    if (totalWeight !== 100) {
      setError(`Rubric weights must sum to 100 (currently ${totalWeight}).`);
      return;
    }
    const payload = { ...v, tags: tagsInput.split(',').map((t) => t.trim()).filter(Boolean) };
    setSaving(true);
    try {
      if (mode === 'create') {
        await apiClient.post('/scenarios', payload);
      } else {
        await apiClient.patch(`/scenarios/${v.id}`, payload);
      }
      router.push('/scenarios');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg || 'Could not save scenario.');
      setSaving(false);
    }
  }

  async function improveWithAI() {
    const idea = v.system_prompt.trim();
    if (!idea) {
      setError('Write a rough idea of who the AI should be / what to practise, then improve it.');
      return;
    }
    setError(null);
    setImproving(true);
    try {
      const { data } = await apiClient.post('/scenarios/improve-prompt', {
        prompt: idea,
        context: v.title || v.objective || undefined,
      });
      if (data?.data?.improved) set('system_prompt', data.data.improved);
    } catch {
      setError('Could not improve the prompt right now.');
    } finally {
      setImproving(false);
    }
  }

  async function remove() {
    if (!v.id || !confirm('Delete this scenario?')) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/scenarios/${v.id}`);
      router.push('/scenarios');
    } catch {
      setError('Could not delete scenario.');
      setDeleting(false);
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm';

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">{mode === 'create' ? 'Create scenario' : 'Edit scenario'}</h1>

      {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}

      <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-5">
        <h2 className="text-sm font-semibold">Basics</h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <input className={inputCls} value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Job interview: product manager" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Short description</label>
          <input className={inputCls} value={v.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Language</label>
            <select className={inputCls} value={v.language} onChange={(e) => set('language', e.target.value)}>
              {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Customer voice</label>
            <div className="flex items-center gap-1.5">
              <select className={`${inputCls} flex-1`} value={v.voice} onChange={(e) => set('voice', e.target.value)}>
                <optgroup label="Male">
                  {MALE_VOICES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </optgroup>
                <optgroup label="Female">
                  {FEMALE_VOICES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </optgroup>
              </select>
              <button type="button" onClick={() => playSample(v.voice)} title="Hear this voice"
                className="press inline-flex shrink-0 items-center justify-center rounded-lg border border-border p-2.5 hover:bg-muted">
                {playing ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{GEMINI_VOICES.find((x) => x.id === v.voice)?.description}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Difficulty</label>
            <select className={inputCls} value={v.difficulty_level} onChange={(e) => set('difficulty_level', e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tags (comma separated)</label>
            <input className={inputCls} value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Visibility</label>
            <select className={inputCls} value={v.visibility} onChange={(e) => set('visibility', e.target.value as 'public' | 'private')}>
              <option value="private">Private (only me)</option>
              <option value="public">Public (everyone)</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-5">
        <h2 className="text-sm font-semibold">The conversation</h2>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Character & behaviour (system prompt)</label>
            <button
              type="button"
              onClick={improveWithAI}
              disabled={improving}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-medium hover:bg-blue-100 disabled:opacity-60"
            >
              {improving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {improving ? 'Improving…' : 'Improve with AI'}
            </button>
          </div>
          <textarea className={`${inputCls} min-h-[120px]`} value={v.system_prompt} onChange={(e) => set('system_prompt', e.target.value)}
            placeholder="Describe who the AI should be and what you want to practise — then hit “Improve with AI”." />
          <p className="text-[11px] text-muted-foreground mt-1">Write a rough idea, then let Gemini redesign it into a high-quality role-play prompt.</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Opening line (the coach says this first)</label>
          <input className={inputCls} value={v.opening_message} onChange={(e) => set('opening_message', e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Learner&apos;s goal (objective)</label>
          <textarea className={`${inputCls} min-h-[60px]`} value={v.objective} onChange={(e) => set('objective', e.target.value)} />
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/50 bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Scoring rubric</h2>
          <span className={`text-xs font-medium ${totalWeight === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>
            Weights: {totalWeight}/100
          </span>
        </div>
        {v.scoring_rubric.map((c, ci) => (
          <div key={ci} className="rounded-xl border border-border/60 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <input className={inputCls} value={c.name} placeholder="Criterion name" onChange={(e) => updateCriterion(ci, { name: e.target.value })} />
              <input type="number" min={0} max={100} className="w-24 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20" value={c.weight}
                onChange={(e) => updateCriterion(ci, { weight: Math.max(0, Number(e.target.value) || 0) })} placeholder="Weight" />
              <button onClick={() => set('scoring_rubric', v.scoring_rubric.filter((_, i) => i !== ci))}
                className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted" title="Remove">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <input className={inputCls} value={c.description} placeholder="What this criterion measures" onChange={(e) => updateCriterion(ci, { description: e.target.value })} />
            <div className="grid sm:grid-cols-3 gap-2">
              {c.levels.map((l, li) => (
                <div key={li}>
                  <label className="text-[11px] font-medium text-muted-foreground">{l.label} ({l.score})</label>
                  <input className={inputCls} value={l.description} onChange={(e) => updateLevel(ci, li, e.target.value)} placeholder="Describe this level" />
                </div>
              ))}
            </div>
          </div>
        ))}
        <button onClick={() => set('scoring_rubric', [...v.scoring_rubric, newCriterion()])}
          className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-1.5 text-sm font-medium hover:bg-muted">
          <Plus className="h-4 w-4" /> Add criterion
        </button>
      </section>

      <div className="flex items-center justify-between">
        <div>
          {mode === 'edit' && (
            <button onClick={remove} disabled={deleting} className="text-sm text-rose-600 hover:underline">
              {deleting ? 'Deleting…' : 'Delete scenario'}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => router.push('/scenarios')} className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 text-white px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {mode === 'create' ? 'Create' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
