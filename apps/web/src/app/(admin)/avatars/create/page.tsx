'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { HelpHint } from '@/components/ui/help-hint';

type Step = 'upload' | 'configure' | 'review';

type Gender = 'female' | 'male' | 'non_binary' | 'other';
type TtsProvider = 'deepgram' | 'openai';

interface AvatarConfig {
  voice: string;
  language: string;
  speakingRate: number;
  backgroundRemoval: boolean;
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

const VOICE_PREVIEW_TEXT = "Welcome to your training session. I'll be guiding you through today's scenario. Feel free to respond naturally, and I'll adapt to your pace.";

const LANGUAGE_OPTIONS = [
  { id: 'en-US', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'es-ES', label: 'Spanish' },
  { id: 'fr-FR', label: 'French' },
  { id: 'de-DE', label: 'German' },
  { id: 'pt-BR', label: 'Portuguese (Brazil)' },
  { id: 'ja-JP', label: 'Japanese' },
];

const PROVIDER_OPTIONS = [
  { id: 'simli', label: 'Simli', description: 'Real-time lip-sync avatar rendering' },
  { id: 'heygen', label: 'HeyGen', description: 'Studio-quality avatar generation' },
];

export default function CreateAvatarPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('simli');
  const [gender, setGender] = useState<Gender>('female');
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('deepgram');
  const [voiceId, setVoiceId] = useState('aura-2-asteria-en');
  const [voices, setVoices] = useState<ApiVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [config, setConfig] = useState<AvatarConfig>({
    voice: 'aura-2-asteria-en',
    language: 'en-US',
    speakingRate: 1.0,
    backgroundRemoval: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // Load voice catalog from the API whenever the gender or tts provider changes.
  // The API filters by gender server-side so the UI only ever shows relevant options.
  useEffect(() => {
    let cancelled = false;
    async function loadVoices() {
      setVoicesLoading(true);
      try {
        const genderParam = gender === 'non_binary' ? 'non_binary' : gender === 'other' ? '' : gender;
        const res = await apiClient.get('/voices', {
          params: { provider: ttsProvider, ...(genderParam ? { gender: genderParam } : {}) },
        });
        if (cancelled) return;
        const list: ApiVoice[] = res.data.data || [];
        setVoices(list);
        // If the currently selected voice isn't in the new filtered list, reset to the first one.
        if (list.length > 0 && !list.some((v) => v.id === voiceId)) {
          setVoiceId(list[0].id);
          setConfig((c) => ({ ...c, voice: list[0].id }));
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
  }, [gender, ttsProvider]);

  // Revoke previous Object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakingRateRef = useRef(config.speakingRate);
  speakingRateRef.current = config.speakingRate;

  // Stop all audio helper
  const stopPreview = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setPlayingVoice(null);
  };

  // Stop audio on unmount
  useEffect(() => {
    return () => { stopPreview(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart preview with new settings (stops current, replays same voice)
  const restartPreview = (voiceId: string) => {
    stopPreview();
    setTimeout(() => previewVoice(voiceId), 50);
  };

  // Auto-restart preview when speaking rate changes while a voice is playing
  useEffect(() => {
    if (playingVoice) {
      const timer = setTimeout(() => {
        restartPreview(playingVoice);
      }, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.speakingRate]);

  const previewVoice = async (voiceId: string) => {
    // If same voice is already playing, just stop it
    if (playingVoice === voiceId) {
      stopPreview();
      return;
    }

    // Stop any currently playing audio first
    stopPreview();

    setPlayingVoice(voiceId);

    // Try AI service TTS first (real OpenAI voices)
    try {
      const resp = await apiClient.post(
        '/avatars/voice-preview',
        { voice: voiceId, speed: speakingRateRef.current },
        { responseType: 'blob', timeout: 15000 },
      );

      const blob = new Blob([resp.data], { type: 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };
      audio.onerror = () => {
        setPlayingVoice(null);
        URL.revokeObjectURL(url);
        audioRef.current = null;
      };

      await audio.play();
      return;
    } catch {
      // AI service unavailable — fall back to browser TTS
    }

    // Fallback: Web Speech API — pick the best matching system voice by name
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setPlayingVoice(null);
      return;
    }

    // Fallback preview using browser speech synthesis. Pick gender-appropriate
    // system voice; pitch/rate default to 1.0 (modulation now lives on persona).
    const utterance = new SpeechSynthesisUtterance(VOICE_PREVIEW_TEXT);
    utterance.pitch = 1.0;
    utterance.rate = speakingRateRef.current;
    utterance.lang = config.language;

    const availableVoices = window.speechSynthesis.getVoices();
    let bestVoice: SpeechSynthesisVoice | null = null;

    // Try name-match first against the Deepgram voice name we have
    const voiceMeta = voices.find((v) => v.id === voiceId);
    if (voiceMeta) {
      const nameMatch = availableVoices.find((v) =>
        v.name.includes(voiceMeta.name) && v.lang.startsWith(config.language.split('-')[0])
      );
      if (nameMatch) bestVoice = nameMatch;
    }

    if (!bestVoice) {
      const langPrefix = config.language.split('-')[0];
      const langVoices = availableVoices.filter((v) => v.lang.startsWith(langPrefix));
      bestVoice = langVoices.find((v) => !v.name.includes('compact') && !v.name.includes('Online'))
        || langVoices[0] || null;
    }

    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    utterance.onend = () => setPlayingVoice(null);
    utterance.onerror = () => setPlayingVoice(null);
    window.speechSynthesis.speak(utterance);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setError('Only JPEG and PNG files are allowed');
      return;
    }

    if (selected.size > 5 * 1024 * 1024) {
      setError('File must be under 5MB');
      return;
    }

    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      const fakeEvent = {
        target: { files: [dropped] },
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileSelect(fakeEvent);
    }
  };

  const handleSubmit = async () => {
    if (!file || !name.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('name', name.trim());
      formData.append('gender', gender);
      formData.append('tts_provider', ttsProvider);
      formData.append('tts_voice_id', voiceId);
      formData.append('config', JSON.stringify({ ...config, voice: voiceId, provider, gender }));

      await apiClient.post('/avatars', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      router.push('/avatars');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create avatar');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedVoice = voices.find((v) => v.id === voiceId);
  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.id === provider);
  const selectedGender = GENDER_OPTIONS.find((g) => g.id === gender);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Create Avatar</h1>

      {/* Step indicators */}
      <div className="flex items-center gap-4 mb-8">
        {(['upload', 'configure', 'review'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : i < ['upload', 'configure', 'review'].indexOf(step)
                    ? 'bg-green-500 text-white'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {i < ['upload', 'configure', 'review'].indexOf(step) ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="text-sm capitalize hidden sm:inline">{s}</span>
            {i < 2 && <div className="w-8 h-px bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {error}
        </div>
      )}

      <HelpHint variant="tip" dismissible dismissKey="avatar-upload-tip" title="Getting started">
        Upload a clear, front-facing photo with good lighting. The AI will use this to generate a realistic talking avatar. JPEG and PNG files under 5MB work best.
      </HelpHint>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div>
          <p className="text-sm text-muted-foreground mb-4">
            Upload a clear, front-facing photo. This will be used to generate your AI avatar.
          </p>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              preview ? 'border-primary/40 bg-primary/5' : 'hover:border-primary hover:bg-muted/50'
            }`}
          >
            {preview ? (
              <div className="space-y-4">
                <img
                  src={preview}
                  alt="Preview"
                  className="w-48 h-48 object-cover rounded-xl mx-auto shadow-md"
                />
                <p className="text-sm font-medium">{file?.name}</p>
                <p className="text-xs text-muted-foreground">Click or drag to replace</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="font-medium">Drop an image here or click to upload</p>
                <p className="text-sm text-muted-foreground">JPEG or PNG, max 5MB</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileSelect}
            className="hidden"
          />
          <div className="flex justify-end mt-6">
            <button
              onClick={() => setStep('configure')}
              disabled={!file}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next: Configure
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Configure */}
      {step === 'configure' && (
        <div className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Avatar Name <span className="text-destructive">*</span></label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Professional Coach, Dr. Smith"
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
          </div>

          {/* Provider */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Avatar Provider</label>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProvider(opt.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    provider === opt.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-input hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Gender</label>
            <p className="text-xs text-muted-foreground mb-3">Determines which voices appear below and helps match this avatar to compatible personas later.</p>
            <div className="grid grid-cols-4 gap-2">
              {GENDER_OPTIONS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGender(g.id)}
                  className={`rounded-lg border p-3 text-center transition-all ${
                    gender === g.id
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
            <label className="block text-sm font-medium mb-1.5">Voice engine</label>
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

          {/* Voice catalog — fetched from /api/voices, gender-filtered */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Voice
              {voices.length > 0 && (
                <span className="ml-2 text-xs text-muted-foreground font-normal">
                  {voices.length} {gender} voice{voices.length !== 1 ? 's' : ''} available
                </span>
              )}
            </label>
            <p className="text-xs text-muted-foreground mb-3">Click any voice to select and preview it.</p>
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
                      onClick={() => {
                        setVoiceId(v.id);
                        setConfig((c) => ({ ...c, voice: v.id }));
                        previewVoice(v.id);
                      }}
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
                          </div>
                          {v.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{v.description}</p>
                          )}
                          <p className="text-[10px] font-mono text-muted-foreground/60 mt-1 truncate">{v.id}</p>
                        </div>
                        <div
                          className={`flex items-center justify-center rounded-full w-7 h-7 shrink-0 transition-colors text-xs ${
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
              value={config.language}
              onChange={(e) => setConfig((c) => ({ ...c, language: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            >
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>

          {/* Speaking Rate */}
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Speaking Rate: <span className="text-primary">{config.speakingRate.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.1}
              value={config.speakingRate}
              onChange={(e) => setConfig((c) => ({ ...c, speakingRate: parseFloat(e.target.value) }))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Slower (0.5x)</span>
              <span>Normal (1.0x)</span>
              <span>Faster (2.0x)</span>
            </div>
          </div>

          {/* Background removal */}
          <div className="flex items-center justify-between rounded-lg border border-input p-3">
            <div>
              <span className="block text-sm font-medium">Background Removal</span>
              <span className="block text-xs text-muted-foreground">Automatically remove the photo background</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={config.backgroundRemoval}
              onClick={() => setConfig((c) => ({ ...c, backgroundRemoval: !c.backgroundRemoval }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config.backgroundRemoval ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config.backgroundRemoval ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setStep('upload')}
              className="rounded-lg border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep('review')}
              disabled={!name.trim()}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && (
        <div className="space-y-6">
          <div className="rounded-xl border p-6">
            <div className="flex items-start gap-6">
              {preview && (
                <img
                  src={preview}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-xl shadow-md"
                />
              )}
              <div className="flex-1 space-y-3">
                <div>
                  <h3 className="font-semibold text-lg">{name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {file?.name} ({((file?.size || 0) / 1024).toFixed(0)} KB)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border divide-y">
            <div className="flex justify-between p-3.5">
              <span className="text-sm text-muted-foreground">Provider</span>
              <span className="text-sm font-medium">{selectedProvider?.label}</span>
            </div>
            <div className="flex justify-between p-3.5">
              <span className="text-sm text-muted-foreground">Gender</span>
              <span className="text-sm font-medium">{selectedGender?.icon} {selectedGender?.label}</span>
            </div>
            <div className="flex justify-between p-3.5">
              <span className="text-sm text-muted-foreground">Voice</span>
              <span className="text-sm font-medium">{selectedVoice?.name || voiceId} <span className="text-xs text-muted-foreground">({ttsProvider})</span></span>
            </div>
            <div className="flex justify-between p-3.5">
              <span className="text-sm text-muted-foreground">Language</span>
              <span className="text-sm font-medium">{LANGUAGE_OPTIONS.find((l) => l.id === config.language)?.label}</span>
            </div>
            <div className="flex justify-between p-3.5">
              <span className="text-sm text-muted-foreground">Speaking Rate</span>
              <span className="text-sm font-medium">{config.speakingRate.toFixed(1)}x</span>
            </div>
            <div className="flex justify-between p-3.5">
              <span className="text-sm text-muted-foreground">Background Removal</span>
              <span className={`text-sm font-medium ${config.backgroundRemoval ? 'text-green-600' : 'text-muted-foreground'}`}>
                {config.backgroundRemoval ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>

          <div className="flex justify-between pt-4 border-t">
            <button
              onClick={() => setStep('configure')}
              className="rounded-lg border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                'Create Avatar'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
