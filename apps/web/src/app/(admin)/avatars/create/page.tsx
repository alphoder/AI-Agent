'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { Users, Mic, Check, Play, Square, Search } from 'lucide-react';

type Gender = 'female' | 'male' | 'non_binary' | 'other';

interface HeygenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender?: Gender;
  preview_image_url?: string;
  preview_video_url?: string;
  premium?: boolean;
}

interface Voice {
  id: string;
  name: string;
  provider: 'heygen';
  gender: 'female' | 'male' | 'non_binary';
  language: string;
  accent?: string;
  preview_url?: string;
  emotion_support?: boolean;
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German',
  it: 'Italian', pt: 'Portuguese', nl: 'Dutch', ja: 'Japanese',
  ko: 'Korean', zh: 'Chinese', ar: 'Arabic', hi: 'Hindi',
  ru: 'Russian', tr: 'Turkish', pl: 'Polish', id: 'Indonesian',
  vi: 'Vietnamese', th: 'Thai', fil: 'Filipino', sv: 'Swedish',
};

const GENDER_OPTIONS: { id: Gender; label: string; icon: string }[] = [
  { id: 'female',     label: 'Female',     icon: '♀' },
  { id: 'male',       label: 'Male',       icon: '♂' },
  { id: 'non_binary', label: 'Non-binary', icon: '⚧' },
  { id: 'other',      label: 'Other',      icon: '•' },
];

/**
 * New avatar = (HeyGen library avatar) + (HeyGen voice) + name + metadata.
 * No image upload. No provider toggle. Matches the HeyGen-only architecture.
 */
export default function CreateAvatarPage() {
  const router = useRouter();

  // Form state
  const [name, setName] = useState('');
  const [gender, setGender] = useState<Gender>('female');
  const [language, setLanguage] = useState('en');
  const [heygenAvatarId, setHeygenAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Catalog state
  const [avatars, setAvatars] = useState<HeygenAvatar[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  const [avatarSearch, setAvatarSearch] = useState('');

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);

  // Voice preview
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ---- Fetch HeyGen library avatars ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setAvatarsLoading(true);
      try {
        const res = await apiClient.get('/heygen/avatars', { params: { gender } });
        if (cancelled) return;
        const list: HeygenAvatar[] = res.data?.data || [];
        setAvatars(list);
        // Auto-pick the first one if we don't have a selection yet or the
        // current selection isn't in the filtered list
        if (list.length > 0 && !list.some((a) => a.avatar_id === heygenAvatarId)) {
          setHeygenAvatarId(list[0].avatar_id);
        }
      } catch {
        if (!cancelled) setAvatars([]);
      } finally {
        if (!cancelled) setAvatarsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender]);

  // ---- Fetch voices (filtered by language + gender) ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setVoicesLoading(true);
      try {
        const genderParam = gender === 'other' ? '' : gender;
        const res = await apiClient.get('/voices', {
          params: { language, ...(genderParam ? { gender: genderParam } : {}) },
        });
        if (cancelled) return;
        const list: Voice[] = res.data?.data || [];
        setVoices(list);
        setAvailableLanguages(res.data?.meta?.languages || []);
        if (list.length > 0 && !list.some((v) => v.id === voiceId)) {
          setVoiceId(list[0].id);
        }
      } catch {
        if (!cancelled) setVoices([]);
      } finally {
        if (!cancelled) setVoicesLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, language]);

  const filteredAvatars = useMemo(() => {
    const q = avatarSearch.trim().toLowerCase();
    if (!q) return avatars;
    return avatars.filter((a) => a.avatar_name.toLowerCase().includes(q));
  }, [avatars, avatarSearch]);

  function stopPreview() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    setPlayingVoice(null);
  }

  function previewVoice(voice: Voice) {
    if (playingVoice === voice.id) { stopPreview(); return; }
    stopPreview();
    if (!voice.preview_url) return;
    setPlayingVoice(voice.id);
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    audio.onended = () => { setPlayingVoice(null); audioRef.current = null; };
    audio.onerror = () => { setPlayingVoice(null); audioRef.current = null; };
    audio.play().catch(() => { setPlayingVoice(null); audioRef.current = null; });
  }

  useEffect(() => () => { stopPreview(); }, []);

  async function handleSubmit() {
    if (!name.trim()) { setError('Give this avatar a name.'); return; }
    if (!heygenAvatarId) { setError('Pick a HeyGen avatar.'); return; }
    if (!voiceId) { setError('Pick a voice.'); return; }

    setSubmitting(true);
    setError('');
    try {
      const selectedAvatar = avatars.find((a) => a.avatar_id === heygenAvatarId);
      await apiClient.post('/avatars', {
        name: name.trim(),
        heygen_avatar_id: heygenAvatarId,
        voice_id: voiceId,
        gender,
        language,
        preview_image_url: selectedAvatar?.preview_image_url,
      });
      router.push('/avatars');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Failed to create avatar.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedAvatar = avatars.find((a) => a.avatar_id === heygenAvatarId);
  const selectedVoice = voices.find((v) => v.id === voiceId);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <PageHeader
        icon={Users}
        accent="avatars"
        title="Create avatar"
        subtitle="Pick a HeyGen library avatar and a matching voice. Training sessions will run against these."
        breadcrumbs={[
          { label: 'Avatars', href: '/avatars' },
          { label: 'Create' },
        ]}
      />

      {/* Basics */}
      <SectionCard icon={Users} iconTint="text-blue-600" title="Basics">
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Display name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dr. Chen — Medical Trainer"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Gender</label>
              <div className="grid grid-cols-4 gap-2">
                {GENDER_OPTIONS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setGender(g.id)}
                    className={`rounded-lg border p-2.5 text-center transition-all ${
                      gender === g.id
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-input hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <div className="text-base leading-none">{g.icon}</div>
                    <div className="text-[11px] font-medium mt-1">{g.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Language</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                {(availableLanguages.length > 0 ? availableLanguages : ['en']).map((l) => (
                  <option key={l} value={l}>
                    {LANGUAGE_LABELS[l] || l.toUpperCase()}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Filters voices; HeyGen supports many more languages than English.</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* HeyGen avatar picker */}
      <SectionCard
        icon={Users}
        iconTint="text-blue-600"
        title="HeyGen avatar"
        subtitle={`${filteredAvatars.length} ${gender} avatar${filteredAvatars.length !== 1 ? 's' : ''} from the library`}
      >
        <div className="p-5 space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              type="text"
              value={avatarSearch}
              onChange={(e) => setAvatarSearch(e.target.value)}
              placeholder="Search library…"
              className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2 text-sm"
            />
          </div>

          {avatarsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] rounded-xl shimmer-bg" />
              ))}
            </div>
          ) : filteredAvatars.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No avatars match. Make sure <code className="font-mono text-[11px]">HEYGEN_API_KEY</code> is configured.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto thin-scroll pr-1">
              {filteredAvatars.map((a) => {
                const selected = heygenAvatarId === a.avatar_id;
                return (
                  <button
                    key={a.avatar_id}
                    type="button"
                    onClick={() => setHeygenAvatarId(a.avatar_id)}
                    className={`group relative rounded-xl overflow-hidden border transition-all text-left ${
                      selected
                        ? 'border-primary ring-2 ring-primary/30 shadow-md'
                        : 'border-border hover:border-primary/50 hover:shadow-sm'
                    }`}
                  >
                    <div className="aspect-[3/4] bg-gradient-to-br from-slate-200 to-slate-300">
                      {a.preview_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.preview_image_url} alt={a.avatar_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">{a.avatar_name}</div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-medium truncate">{a.avatar_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{a.avatar_id}</p>
                    </div>
                    {selected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-md">
                        <Check className="w-3.5 h-3.5 text-primary-foreground" strokeWidth={3} />
                      </div>
                    )}
                    {a.premium && (
                      <div className="absolute top-2 left-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[9px] font-semibold text-white">
                        Pro
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Voice picker */}
      <SectionCard
        icon={Mic}
        iconTint="text-violet-600"
        title="Voice"
        subtitle={`${voices.length} voice${voices.length !== 1 ? 's' : ''} matching ${LANGUAGE_LABELS[language] || language.toUpperCase()} · ${gender.replace('_', ' ')}`}
      >
        <div className="p-5">
          {voicesLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading voices…</div>
          ) : voices.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              No matching voices. Try a different language or gender.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[360px] overflow-y-auto thin-scroll pr-1">
              {voices.map((v) => {
                const selected = voiceId === v.id;
                const isPlaying = playingVoice === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setVoiceId(v.id)}
                    className={`group cursor-pointer rounded-lg border p-3 transition-all ${
                      selected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                        : 'border-input hover:border-primary/50 hover:bg-muted/30'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{v.name}</span>
                          {selected && <Check className="w-3 h-3 text-primary shrink-0" strokeWidth={3} />}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {v.accent && (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{v.accent}</span>
                          )}
                          {v.emotion_support && (
                            <span className="text-[9px] font-medium text-violet-600 uppercase tracking-wider">Emotion</span>
                          )}
                        </div>
                      </div>
                      {v.preview_url && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); previewVoice(v); }}
                          className={`flex items-center justify-center rounded-full w-7 h-7 shrink-0 transition-colors ${
                            isPlaying
                              ? 'bg-destructive/10 text-destructive'
                              : 'bg-muted/80 text-muted-foreground group-hover:bg-primary/15 group-hover:text-primary'
                          }`}
                        >
                          {isPlaying
                            ? <Square className="w-3 h-3" fill="currentColor" />
                            : <Play className="w-3 h-3" fill="currentColor" />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Preview + submit */}
      {error && (
        <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-4 py-2">{error}</div>
      )}

      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-2xl border border-border bg-card/95 backdrop-blur px-5 py-4 shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          {selectedAvatar?.preview_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selectedAvatar.preview_image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name || 'Untitled avatar'}</p>
            <p className="text-xs text-muted-foreground truncate">
              {selectedAvatar?.avatar_name || '—'} · {selectedVoice?.name || 'no voice'} · {LANGUAGE_LABELS[language] || language.toUpperCase()}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/avatars')}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !heygenAvatarId || !voiceId}
            className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create avatar'}
          </button>
        </div>
      </div>
    </div>
  );
}
