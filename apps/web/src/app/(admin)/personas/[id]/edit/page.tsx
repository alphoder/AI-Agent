'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface AvatarOption {
  id: string;
  name: string;
  thumbnail_url: string | null;
  status: string;
}

interface VoiceConfig {
  voice: string;
  language: string;
  speakingRate: number;
}

const VOICE_OPTIONS = [
  { id: 'alloy', label: 'Balanced', description: 'Neutral, adaptable voice for any scenario', gender: 'male' as const, icon: '🎯' },
  { id: 'echo', label: 'Resonant', description: 'Calm, empathetic delivery', gender: 'male' as const, icon: '🤝' },
  { id: 'fable', label: 'Warm', description: 'Friendly, engaging energy', gender: 'male' as const, icon: '🔥' },
  { id: 'onyx', label: 'Deep', description: 'Confident, authoritative presence', gender: 'male' as const, icon: '👔' },
  { id: 'nova', label: 'Bright', description: 'Warm, approachable tone', gender: 'female' as const, icon: '✨' },
  { id: 'shimmer', label: 'Soft', description: 'Clear, precise articulation', gender: 'female' as const, icon: '🌊' },
];

const LANGUAGE_OPTIONS = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'es-ES', label: 'Spanish (Spain)' },
  { id: 'fr-FR', label: 'French' },
  { id: 'de-DE', label: 'German' },
  { id: 'hi-IN', label: 'Hindi' },
  { id: 'ja-JP', label: 'Japanese' },
  { id: 'zh-CN', label: 'Chinese (Simplified)' },
];

export default function EditPersonaPage() {
  const router = useRouter();
  const params = useParams();
  const personaId = params.id as string;

  const [avatars, setAvatars] = useState<AvatarOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fetchLoading, setFetchLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');

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

  // Voice config
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('male');
  const [voiceId, setVoiceId] = useState('alloy');
  const [voiceLanguage, setVoiceLanguage] = useState('en-US');
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRateRef = useRef(speakingRate);
  speakingRateRef.current = speakingRate;

  // Delete state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredVoices = VOICE_OPTIONS.filter((v) => v.gender === voiceGender);

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlayingVoice(null);
  }, []);

  useEffect(() => {
    return () => { stopPreview(); };
  }, [stopPreview]);

  const previewVoice = async (vid: string) => {
    if (playingVoice === vid) {
      stopPreview();
      return;
    }
    stopPreview();
    setPlayingVoice(vid);

    try {
      const resp = await apiClient.post(
        '/avatars/voice-preview',
        { voice: vid, speed: speakingRateRef.current },
        { responseType: 'blob', timeout: 15000 },
      );
      const blob = new Blob([resp.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setPlayingVoice(null); URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
      return;
    } catch {
      // Fall back to Web Speech API
    }

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setPlayingVoice(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance('Hello, I am your training persona. Let me guide you through this session.');
    utterance.rate = speakingRateRef.current;
    utterance.lang = voiceLanguage;
    utterance.onend = () => setPlayingVoice(null);
    utterance.onerror = () => setPlayingVoice(null);
    window.speechSynthesis.speak(utterance);
  };

  const loadPersona = useCallback(async () => {
    setFetchLoading(true);
    setFetchError('');
    try {
      const [personaRes, avatarsRes] = await Promise.all([
        apiClient.get(`/personas/${personaId}`),
        apiClient.get('/avatars', { params: { status: 'active', limit: 100 } }),
      ]);

      const p = personaRes.data.data;
      setAvatars(avatarsRes.data.data);

      setName(p.name || '');
      setDescription(p.description || '');
      setAvatarId(p.avatar_id || '');
      setSystemPrompt(p.system_prompt || '');
      setTemperature(p.temperature ?? 0.7);
      setRagEnabled(p.rag_enabled ?? false);
      setRagTopK(p.rag_top_k ?? 5);
      setRagThreshold(p.rag_similarity_threshold ?? 0.7);

      // Guardrails
      const g = p.guardrails || {};
      setAllowedTopics(Array.isArray(g.allowed_topics) ? g.allowed_topics.join(', ') : '');
      setBlockedTopics(Array.isArray(g.blocked_topics) ? g.blocked_topics.join(', ') : '');
      setEscalationTriggers(Array.isArray(g.escalation_triggers) ? g.escalation_triggers.join(', ') : '');
      setMaxResponseTokens(g.max_response_tokens ?? 256);
      setFollowUpFrequency(g.follow_up_question_frequency ?? 3);

      // Voice config
      if (p.voice_config) {
        const vc = typeof p.voice_config === 'string' ? JSON.parse(p.voice_config) : p.voice_config;
        if (vc.voice) {
          setVoiceId(vc.voice);
          const voiceOpt = VOICE_OPTIONS.find((v) => v.id === vc.voice);
          if (voiceOpt) setVoiceGender(voiceOpt.gender);
        }
        if (vc.language) setVoiceLanguage(vc.language);
        if (vc.speakingRate != null) setSpeakingRate(vc.speakingRate);
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to load persona';
      setFetchError(message);
    } finally {
      setFetchLoading(false);
    }
  }, [personaId]);

  useEffect(() => {
    loadPersona();
  }, [loadPersona]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !avatarId || !systemPrompt.trim()) {
      setError('Name, avatar, and system prompt are required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await apiClient.patch(`/personas/${personaId}`, {
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
        voice_config: {
          voice: voiceId,
          language: voiceLanguage,
          speakingRate,
        },
      });
      router.push(`/personas/${personaId}`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to save changes';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await apiClient.delete(`/personas/${personaId}`);
      router.push('/personas');
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message || 'Failed to delete persona';
      setError(message);
      setShowDeleteDialog(false);
    } finally {
      setDeleting(false);
    }
  };

  // Loading skeleton
  if (fetchLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-muted rounded" />
          <div className="space-y-4">
            <div className="h-10 w-full bg-muted rounded" />
            <div className="h-20 w-full bg-muted rounded" />
            <div className="h-10 w-full bg-muted rounded" />
          </div>
          <div className="h-40 w-full bg-muted rounded" />
          <div className="grid grid-cols-2 gap-4">
            <div className="h-10 bg-muted rounded" />
            <div className="h-10 bg-muted rounded" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (fetchError) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold">Failed to load persona</h2>
          <p className="text-sm text-muted-foreground">{fetchError}</p>
          <div className="flex gap-3">
            <button onClick={() => router.push('/personas')} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              Back to Personas
            </button>
            <button onClick={loadPersona} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <button onClick={() => router.push(`/personas/${personaId}`)} className="text-sm text-muted-foreground hover:text-foreground mb-2 inline-block">
            &larr; Back to Persona
          </button>
          <h1 className="text-2xl font-bold">Edit Persona</h1>
        </div>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          Delete Persona
        </button>
      </div>

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

        {/* Voice Configuration */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Voice Configuration</h2>
          <div className="space-y-5">
            {/* Gender selector */}
            <div>
              <label className="block text-sm font-medium mb-2">Voice Gender</label>
              <div className="flex gap-3">
                {(['male', 'female'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setVoiceGender(g);
                      const firstOfGender = VOICE_OPTIONS.find((v) => v.gender === g);
                      if (firstOfGender) setVoiceId(firstOfGender.id);
                    }}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium capitalize transition-all ${
                      voiceGender === g
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-primary'
                        : 'border-input hover:border-primary/50 hover:bg-muted/50'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice grid */}
            <div>
              <label className="block text-sm font-medium mb-2">Voice</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredVoices.map((voice) => (
                  <button
                    key={voice.id}
                    type="button"
                    onClick={() => setVoiceId(voice.id)}
                    className={`rounded-xl border p-4 text-left transition-all relative group ${
                      voiceId === voice.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                        : 'border-input hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5 shrink-0">{voice.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{voice.id}</span>
                          <span className="text-xs text-muted-foreground">({voice.label})</span>
                          {voiceId === voice.id && (
                            <svg className="w-4 h-4 text-primary shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{voice.description}</p>
                      </div>
                      <div
                        onClick={(e) => { e.stopPropagation(); previewVoice(voice.id); }}
                        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 shrink-0 transition-all text-xs font-medium cursor-pointer ${
                          playingVoice === voice.id
                            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                            : 'bg-muted/80 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                        }`}
                      >
                        {playingVoice === voice.id ? (
                          <>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                            Stop
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                            Play
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <label className="block text-sm font-medium mb-1.5">Language</label>
              <select
                value={voiceLanguage}
                onChange={(e) => setVoiceLanguage(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {LANGUAGE_OPTIONS.map((lang) => (
                  <option key={lang.id} value={lang.id}>{lang.label}</option>
                ))}
              </select>
            </div>

            {/* Speaking rate */}
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Speaking Rate: <span className="text-primary">{speakingRate.toFixed(1)}x</span>
              </label>
              <input
                type="range" min={0.5} max={2.0} step={0.1} value={speakingRate}
                onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>Slower (0.5x)</span>
                <span>Normal (1.0x)</span>
                <span>Faster (2.0x)</span>
              </div>
            </div>
          </div>
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
          <button type="button" onClick={() => router.push(`/personas/${personaId}`)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">Cancel</button>
          <button type="submit" disabled={submitting}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {submitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteDialog(false)} />
          <div className="relative bg-background border rounded-lg shadow-lg p-6 max-w-md w-full mx-4 space-y-4">
            <h2 className="text-lg font-semibold">Delete Persona</h2>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete <strong>{name}</strong>? This will remove the persona and its associated documents. This action cannot be undone.
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
