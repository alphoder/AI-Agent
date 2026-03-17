'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface AvatarOption {
  id: string;
  name: string;
  thumbnail_url: string | null;
  status: string;
}

export default function CreatePersonaPage() {
  const router = useRouter();
  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [allowedTopics, setAllowedTopics] = useState('');
  const [blockedTopics, setBlockedTopics] = useState('');
  const [escalationTriggers, setEscalationTriggers] = useState('');
  const [maxResponseTokens, setMaxResponseTokens] = useState(256);
  const [followUpFrequency, setFollowUpFrequency] = useState(3);
  const [ragEnabled, setRagEnabled] = useState(false);
  const [ragTopK, setRagTopK] = useState(5);
  const [ragThreshold, setRagThreshold] = useState(0.7);
  const [temperature, setTemperature] = useState(0.7);

  useEffect(() => {
    async function fetchAvatars() {
      try {
        const { data } = await apiClient.get('/avatars', { params: { status: 'active', limit: 100 } });
        setAvatars(data.data);
      } catch (err) {
        console.error('Failed to fetch avatars:', err);
      }
    }
    fetchAvatars();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !avatarId || !systemPrompt.trim()) {
      setError('Name, avatar, and system prompt are required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await apiClient.post('/personas', {
        name: name.trim(),
        description: description.trim() || null,
        avatar_id: avatarId,
        system_prompt: systemPrompt.trim(),
        guardrails: {
          allowed_topics: allowedTopics.split(',').map((t) => t.trim()).filter(Boolean),
          blocked_topics: blockedTopics.split(',').map((t) => t.trim()).filter(Boolean),
          escalation_triggers: escalationTriggers.split(',').map((t) => t.trim()).filter(Boolean),
          max_response_tokens: maxResponseTokens,
          follow_up_question_frequency: followUpFrequency,
        },
        rag_enabled: ragEnabled,
        rag_top_k: ragTopK,
        rag_similarity_threshold: ragThreshold,
        temperature,
      });
      router.push('/personas');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create persona');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create Persona</h1>

      {error && (
        <div className="mb-4 p-3 rounded bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="e.g., Sales Coach Sarah" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" placeholder="Brief description of the persona" />
            </div>
          </div>
        </section>

        {/* Avatar Link */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Avatar</h2>
          <select value={avatarId} onChange={(e) => setAvatarId(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="">Select an avatar...</option>
            {avatars.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </section>

        {/* System Prompt */}
        <section>
          <h2 className="text-lg font-semibold mb-4">System Prompt *</h2>
          <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={8}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="You are [persona name], a [role description]..." />
          <p className="text-xs text-muted-foreground mt-1">{systemPrompt.length} characters</p>
        </section>

        {/* Guardrails */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Guardrails</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Allowed Topics (comma-separated)</label>
              <input type="text" value={allowedTopics} onChange={(e) => setAllowedTopics(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="sales, cold calling, objection handling" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Blocked Topics (comma-separated)</label>
              <input type="text" value={blockedTopics} onChange={(e) => setBlockedTopics(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="politics, religion" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Escalation Triggers (comma-separated)</label>
              <input type="text" value={escalationTriggers} onChange={(e) => setEscalationTriggers(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="harassment, threats" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Max Response Tokens</label>
                <input type="number" value={maxResponseTokens} onChange={(e) => setMaxResponseTokens(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Follow-up Frequency</label>
                <input type="number" value={followUpFrequency} onChange={(e) => setFollowUpFrequency(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
          </div>
        </section>

        {/* RAG Settings */}
        <section>
          <h2 className="text-lg font-semibold mb-4">RAG Settings</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={ragEnabled} onChange={(e) => setRagEnabled(e.target.checked)}
                className="rounded border-input" />
              <span className="text-sm font-medium">Enable RAG (Knowledge Base Retrieval)</span>
            </label>
            {ragEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Top K: {ragTopK}</label>
                  <input type="range" min={1} max={20} value={ragTopK} onChange={(e) => setRagTopK(Number(e.target.value))}
                    className="w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Similarity Threshold: {ragThreshold}</label>
                  <input type="range" min={0} max={1} step={0.05} value={ragThreshold} onChange={(e) => setRagThreshold(Number(e.target.value))}
                    className="w-full" />
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Temperature */}
        <section>
          <label className="block text-sm font-medium mb-1">Temperature: {temperature}</label>
          <input type="range" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full" />
          <p className="text-xs text-muted-foreground mt-1">Lower = more focused, Higher = more creative</p>
        </section>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push('/personas')}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button type="submit" disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create Persona'}
          </button>
        </div>
      </form>
    </div>
  );
}
