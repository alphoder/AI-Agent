'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

type Gender = 'female' | 'male' | 'non_binary' | 'other';
type TtsProvider = 'deepgram' | 'openai';

interface AvatarDetail {
  id: string;
  name: string;
  provider: string;
  provider_avatar_id: string | null;
  source_image_url: string;
  thumbnail_url: string | null;
  image_url: string | null;
  status: string;
  config: Record<string, unknown>;
  gender: Gender | null;
  tts_provider: TtsProvider | null;
  tts_voice_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiVoice {
  id: string;
  name: string;
  provider: TtsProvider;
  gender: 'female' | 'male' | 'non_binary';
  accent?: string;
  language?: string;
  model_family?: string;
  description?: string;
}

const GENDER_OPTIONS: { id: Gender; label: string; icon: string }[] = [
  { id: 'female',     label: 'Female',     icon: '♀' },
  { id: 'male',       label: 'Male',       icon: '♂' },
  { id: 'non_binary', label: 'Non-binary', icon: '⚧' },
  { id: 'other',      label: 'Other',      icon: '•' },
];

const PROVIDER_VOICE_OPTIONS: { id: TtsProvider; label: string; description: string }[] = [
  { id: 'deepgram', label: 'Deepgram Aura-2', description: 'Fast, natural, recommended for live conversation' },
  { id: 'openai',   label: 'OpenAI TTS',      description: 'Higher fidelity, slightly higher latency' },
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

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  processing: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
};

export default function AvatarDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [avatar, setAvatar] = useState<AvatarDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Voice editing state — mirrors the avatar's top-level gender/tts_provider/tts_voice_id columns
  const [showVoiceEditor, setShowVoiceEditor] = useState(false);
  const [voiceGender, setVoiceGender] = useState<Gender>('female');
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('deepgram');
  const [voiceId, setVoiceId] = useState('aura-2-asteria-en');
  const [voiceLanguage, setVoiceLanguage] = useState('en-US');
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [savingVoice, setSavingVoice] = useState(false);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [voices, setVoices] = useState<ApiVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRateRef = useRef(speakingRate);
  speakingRateRef.current = speakingRate;

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
    if (playingVoice === vid) { stopPreview(); return; }
    stopPreview();
    setPlayingVoice(vid);
    try {
      const resp = await apiClient.post('/avatars/voice-preview', { voice: vid, speed: speakingRateRef.current }, { responseType: 'blob', timeout: 15000 });
      const blob = new Blob([resp.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoice(null); URL.revokeObjectURL(url); audioRef.current = null; };
      audio.onerror = () => { setPlayingVoice(null); URL.revokeObjectURL(url); audioRef.current = null; };
      await audio.play();
      return;
    } catch { /* fall back to browser speech */ }
    if (typeof window === 'undefined' || !window.speechSynthesis) { setPlayingVoice(null); return; }
    const utterance = new SpeechSynthesisUtterance('Hello, I am your training avatar.');
    utterance.rate = speakingRateRef.current;
    utterance.lang = voiceLanguage;
    utterance.onend = () => setPlayingVoice(null);
    utterance.onerror = () => setPlayingVoice(null);
    window.speechSynthesis.speak(utterance);
  };

  // Load voice catalog whenever the editor is open and the gender/provider changes.
  // The API filters server-side so the grid only shows compatible voices.
  useEffect(() => {
    if (!showVoiceEditor) return;
    let cancelled = false;
    async function loadVoices() {
      setVoicesLoading(true);
      try {
        const genderParam = voiceGender === 'other' ? '' : voiceGender;
        const res = await apiClient.get('/voices', {
          params: { provider: ttsProvider, ...(genderParam ? { gender: genderParam } : {}) },
        });
        if (cancelled) return;
        const list: ApiVoice[] = res.data.data || [];
        setVoices(list);
        // Keep the current voice if it's still in the filtered list; otherwise reset.
        if (list.length > 0 && !list.some((v) => v.id === voiceId)) {
          setVoiceId(list[0].id);
        }
      } catch {
        if (!cancelled) setVoices([]);
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    }
    loadVoices();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVoiceEditor, voiceGender, ttsProvider]);

  useEffect(() => {
    fetchAvatar();
  }, [params.id]);

  // Poll if processing
  useEffect(() => {
    if (avatar?.status !== 'processing') return;
    const interval = setInterval(fetchAvatar, 10000);
    return () => clearInterval(interval);
  }, [avatar?.status]);

  async function fetchAvatar() {
    try {
      const { data } = await apiClient.get(`/avatars/${params.id}`);
      const a = data.data as AvatarDetail;
      setAvatar(a);
      setEditName(a.name);

      // Hydrate voice state from the avatar's top-level columns first, then
      // fall back to legacy config.* keys so existing records still load.
      const cfg = (a.config || {}) as Record<string, unknown>;
      setVoiceGender(((a.gender as Gender) || 'female'));
      setTtsProvider(((a.tts_provider as TtsProvider) || 'deepgram'));
      setVoiceId((a.tts_voice_id as string) || (cfg.voice as string) || 'aura-2-asteria-en');
      if (cfg.language) setVoiceLanguage(cfg.language as string);
      if (cfg.speakingRate != null) setSpeakingRate(cfg.speakingRate as number);
    } catch {
      router.push('/avatars');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveVoice() {
    setSavingVoice(true);
    try {
      await apiClient.patch(`/avatars/${params.id}`, {
        // New top-level fields (validated server-side)
        gender: voiceGender,
        tts_provider: ttsProvider,
        tts_voice_id: voiceId,
        // Config keeps language + speaking rate for backwards compatibility
        config: {
          ...(avatar?.config || {}),
          voice: voiceId,
          language: voiceLanguage,
          speakingRate,
        },
      });
      setShowVoiceEditor(false);
      fetchAvatar();
    } catch (err) {
      console.error('Voice update failed:', err);
    } finally {
      setSavingVoice(false);
    }
  }

  async function handleSave() {
    try {
      await apiClient.patch(`/avatars/${params.id}`, { name: editName });
      setEditing(false);
      fetchAvatar();
    } catch (err) {
      console.error('Update failed:', err);
    }
  }

  async function handleRegenerate() {
    try {
      await apiClient.post(`/avatars/${params.id}/regenerate`);
      fetchAvatar();
    } catch (err) {
      console.error('Regenerate failed:', err);
    }
  }

  async function handleDelete() {
    try {
      await apiClient.delete(`/avatars/${params.id}`);
      router.push('/avatars');
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Delete failed');
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!avatar) return null;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button
        onClick={() => router.push('/avatars')}
        className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block"
      >
        &larr; Back to Avatars
      </button>

      <div className="border rounded-lg p-6">
        <div className="flex items-start gap-6">
          <div className="w-48 h-48 bg-muted rounded-lg flex items-center justify-center overflow-hidden">
            {(avatar.image_url || avatar.thumbnail_url) ? (
              <img src={avatar.image_url || avatar.thumbnail_url || ''} alt={avatar.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-6xl text-muted-foreground">{avatar.name.charAt(0)}</div>
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-md border border-input bg-background px-3 py-1 text-lg font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button onClick={handleSave} className="text-sm text-primary hover:underline">Save</button>
                  <button onClick={() => setEditing(false)} className="text-sm text-muted-foreground hover:underline">Cancel</button>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl font-bold">{avatar.name}</h1>
                  <button onClick={() => setEditing(true)} className="text-sm text-primary hover:underline">Edit</button>
                </>
              )}
            </div>

            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[avatar.status]}`}>
              {avatar.status}
            </span>

            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Provider:</dt>
                <dd className="capitalize">{avatar.provider}</dd>
              </div>
              {avatar.gender && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground w-24">Gender:</dt>
                  <dd className="capitalize">{avatar.gender.replace('_', ' ')}</dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Provider ID:</dt>
                <dd className="truncate">{avatar.provider_avatar_id || 'N/A'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Created:</dt>
                <dd>{new Date(avatar.created_at).toLocaleString()}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground w-24">Updated:</dt>
                <dd>{new Date(avatar.updated_at).toLocaleString()}</dd>
              </div>
            </dl>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => router.push(`/avatars/${avatar.id}/test`)}
                disabled={avatar.status !== 'active'}
                className="rounded-md bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                Test Avatar
              </button>
              <button
                onClick={handleRegenerate}
                disabled={avatar.status === 'processing'}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Regenerate
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Configuration Section */}
      <div className="border rounded-lg p-6 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Voice Configuration</h2>
          <button
            onClick={() => setShowVoiceEditor(!showVoiceEditor)}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {showVoiceEditor ? 'Cancel' : 'Edit Voice'}
          </button>
        </div>

        {!showVoiceEditor ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Gender</dt>
              <dd className="font-medium mt-0.5 capitalize">
                {GENDER_OPTIONS.find((g) => g.id === avatar?.gender)?.icon || '•'}{' '}
                {(avatar?.gender || 'unset').replace('_', ' ')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Voice</dt>
              <dd className="font-medium mt-0.5">
                {avatar?.tts_voice_id || (avatar?.config?.voice as string) || '—'}
              </dd>
              <dd className="text-xs text-muted-foreground mt-0.5">
                {avatar?.tts_provider || 'deepgram'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Language</dt>
              <dd className="font-medium mt-0.5">
                {LANGUAGE_OPTIONS.find((l) => l.id === (avatar?.config?.language as string || 'en-US'))?.label || 'English (US)'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Speed</dt>
              <dd className="font-medium mt-0.5">{((avatar?.config?.speakingRate as number) ?? 1.0).toFixed(1)}x</dd>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Gender selector */}
            <div>
              <label className="block text-sm font-medium mb-2">Gender</label>
              <div className="grid grid-cols-4 gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setVoiceGender(g.id)}
                    className={`rounded-lg border p-3 text-center transition-all ${
                      voiceGender === g.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-input hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <div className="text-lg leading-none">{g.icon}</div>
                    <div className="text-xs font-medium mt-1">{g.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* TTS provider */}
            <div>
              <label className="block text-sm font-medium mb-2">Voice engine</label>
              <div className="grid grid-cols-2 gap-3">
                {PROVIDER_VOICE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTtsProvider(opt.id)}
                    className={`rounded-lg border p-3 text-left transition-all ${
                      ttsProvider === opt.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-input hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <span className="block text-sm font-medium">{opt.label}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice grid — live from /api/voices, gender + provider filtered */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Voice
                {voices.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    {voices.length} {voiceGender} voice{voices.length !== 1 ? 's' : ''} available
                  </span>
                )}
              </label>
              {voicesLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Loading voices…</div>
              ) : voices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No voices available for this combination. Try a different gender or provider.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                  {voices.map((v) => {
                    const selected = voiceId === v.id;
                    const isPlaying = playingVoice === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVoiceId(v.id)}
                        className={`rounded-lg border p-3 text-left transition-all relative group ${
                          selected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-input hover:border-primary/50 hover:bg-muted/30'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold truncate">{v.name}</span>
                              {v.accent && (
                                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                  {v.accent}
                                </span>
                              )}
                              {v.model_family === 'aura-1' && (
                                <span className="text-[10px] font-medium uppercase tracking-wider text-amber-600">
                                  v1
                                </span>
                              )}
                              {selected && (
                                <svg className="w-4 h-4 text-primary shrink-0 ml-auto" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                              )}
                            </div>
                            {v.description && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{v.description}</p>
                            )}
                            <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 truncate">{v.id}</p>
                          </div>
                          <div
                            onClick={(e) => { e.stopPropagation(); previewVoice(v.id); }}
                            className={`flex items-center justify-center rounded-full w-7 h-7 shrink-0 transition-colors cursor-pointer text-xs ${
                              isPlaying
                                ? 'bg-destructive/10 text-destructive'
                                : 'bg-muted/80 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                            }`}
                          >
                            {isPlaying ? (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <rect x="6" y="6" width="12" height="12" rx="2" />
                              </svg>
                            ) : (
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
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

            {/* Speaking Rate */}
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

            {/* Save */}
            <div className="flex justify-end gap-3 pt-2 border-t">
              <button onClick={() => setShowVoiceEditor(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
                Cancel
              </button>
              <button onClick={handleSaveVoice} disabled={savingVoice}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {savingVoice ? 'Saving...' : 'Save Voice'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-bold mb-2">Delete Avatar</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to delete &ldquo;{avatar.name}&rdquo;? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
