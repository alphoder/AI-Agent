'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';

type Step = 'upload' | 'configure' | 'review';

interface AvatarConfig {
  voice: string;
  language: string;
  speakingRate: number;
  backgroundRemoval: boolean;
}

const VOICE_OPTIONS = [
  { id: 'alloy', label: 'Alloy', description: 'Neutral and balanced', pitch: 1.0, rate: 1.0 },
  { id: 'echo', label: 'Echo', description: 'Warm and conversational', pitch: 0.85, rate: 0.95 },
  { id: 'fable', label: 'Fable', description: 'Expressive and dynamic', pitch: 1.15, rate: 1.05 },
  { id: 'onyx', label: 'Onyx', description: 'Deep and authoritative', pitch: 0.7, rate: 0.9 },
  { id: 'nova', label: 'Nova', description: 'Friendly and upbeat', pitch: 1.25, rate: 1.1 },
  { id: 'shimmer', label: 'Shimmer', description: 'Clear and professional', pitch: 1.1, rate: 1.0 },
];

const VOICE_PREVIEW_TEXT = "Hello! I'm your AI training avatar. Let's get started with your practice session.";

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
  const [config, setConfig] = useState<AvatarConfig>({
    voice: 'alloy',
    language: 'en-US',
    speakingRate: 1.0,
    backgroundRemoval: true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);

  // Revoke previous Object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview);
      }
    };
  }, [preview]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const previewVoice = async (voiceId: string) => {
    // If same voice is already playing, stop it
    if (playingVoice === voiceId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      setPlayingVoice(null);
      return;
    }

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();

    setPlayingVoice(voiceId);

    // Try AI service TTS first (real OpenAI voices)
    try {
      const resp = await apiClient.post(
        '/avatars/voice-preview',
        { voice: voiceId, speed: config.speakingRate },
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

    // Fallback: Web Speech API with voice-specific pitch/rate
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setPlayingVoice(null);
      return;
    }

    const voiceOption = VOICE_OPTIONS.find((v) => v.id === voiceId);
    if (!voiceOption) { setPlayingVoice(null); return; }

    const utterance = new SpeechSynthesisUtterance(VOICE_PREVIEW_TEXT);
    utterance.pitch = voiceOption.pitch;
    utterance.rate = voiceOption.rate * config.speakingRate;
    utterance.lang = config.language;

    const voices = window.speechSynthesis.getVoices();
    const langPrefix = config.language.split('-')[0];
    const matchingVoices = voices.filter((v) => v.lang.startsWith(langPrefix));
    if (matchingVoices.length > 0) {
      const voiceIndex = VOICE_OPTIONS.findIndex((v) => v.id === voiceId);
      utterance.voice = matchingVoices[voiceIndex % matchingVoices.length];
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
      formData.append('config', JSON.stringify({ ...config, provider }));

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

  const selectedVoice = VOICE_OPTIONS.find((v) => v.id === config.voice);
  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.id === provider);

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

          {/* Voice */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Voice</label>
            <p className="text-xs text-muted-foreground mb-2">Click a voice to select it. Use the play button to preview.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VOICE_OPTIONS.map((voice) => (
                <div
                  key={voice.id}
                  className={`rounded-lg border transition-all relative ${
                    config.voice === voice.id
                      ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                      : 'border-input hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, voice: voice.id }))}
                    className="w-full p-2.5 pb-8 text-left"
                  >
                    <span className="block text-sm font-medium">{voice.label}</span>
                    <span className="block text-xs text-muted-foreground">{voice.description}</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfig((c) => ({ ...c, voice: voice.id }));
                      previewVoice(voice.id);
                    }}
                    className={`absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                      playingVoice === voice.id
                        ? 'bg-primary text-primary-foreground scale-110'
                        : 'bg-muted hover:bg-primary/20 text-muted-foreground hover:text-primary'
                    }`}
                    title={playingVoice === voice.id ? 'Stop preview' : `Preview ${voice.label}`}
                  >
                    {playingVoice === voice.id ? (
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
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
              <span className="text-sm text-muted-foreground">Voice</span>
              <span className="text-sm font-medium">{selectedVoice?.label} — {selectedVoice?.description}</span>
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
