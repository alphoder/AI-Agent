'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mic, Volume2, Square, Search, ChevronRight, Check } from 'lucide-react';
import {
  LANGUAGES, languageName, voiceSampleUrl, accentsForLanguage, accentLabel,
  personaGenderOf, voicesForPersona, type VoiceOption,
} from '@avatar-platform/shared';
import type { Scenario } from './scenario-card';

/** Steps: 1 language · 2 accent · 3 voice · 4 ready. Accent auto-skips. */
export interface PickerState {
  scenario: Scenario; step: number; lang: string; accent: string; voice: string; grade: boolean;
}

export function newPicker(scenario: Scenario): PickerState {
  // Default to the scenario's own voice, but only if the persona's gender
  // allows it — otherwise the first voice that is actually on offer.
  const allowed = voicesForPersona(personaGenderOf(scenario.title, scenario.description));
  const voice = allowed.some((v) => v.id === scenario.voice) ? scenario.voice : allowed[0].id;
  return { scenario, step: 1, lang: '', accent: '', voice, grade: false };
}

/** One selectable card — the single shape used for languages, accents and voices. */
function OptionCard({ title, meta, selected, onClick, action }: {
  title: string; meta?: string; selected: boolean; onClick: () => void; action?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors ${
        selected ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40'
      }`}
    >
      <button type="button" onClick={onClick} aria-pressed={selected} className="min-w-0 flex-1 text-left">
        <span className={`block truncate text-sm ${selected ? 'font-semibold text-primary' : 'font-medium text-foreground'}`}>
          {title}
        </span>
        {meta && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{meta}</span>}
      </button>
      {action}
      {selected && !action && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div>;
}

function StepHeading({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {n}</p>
      <h4 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h4>
      {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A voice card: pick it on the body, hear it on the speaker button. */
function VoiceCard({ v, selected, playing, onPick, onPlay }: {
  v: VoiceOption; selected: boolean; playing: boolean;
  onPick: (id: string) => void; onPlay: (id: string) => void;
}) {
  return (
    <OptionCard
      title={v.label}
      meta={v.description}
      selected={selected}
      onClick={() => onPick(v.id)}
      action={
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPlay(v.id); }}
          title={playing ? `Stop ${v.label}` : `Hear ${v.label}`}
          aria-label={playing ? `Stop ${v.label}` : `Hear ${v.label}`}
          className="press shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {playing ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      }
    />
  );
}

/**
 * The call setup, as a full-surface card picker: language → accent → voice →
 * ready. Everything already chosen sits at the top and every chip goes back to
 * its own step. Voices are split male/female and filtered to the persona's
 * gender when the scenario states one.
 */
export function CallPicker({ picker, setPicker, onClose }: {
  picker: PickerState;
  setPicker: (fn: (p: PickerState | null) => PickerState | null) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const accents = picker.lang ? accentsForLanguage(picker.lang) : [];

  // The persona's gender decides which voices may be offered at all. Unstated
  // (the usual case) means every voice stays available.
  const personaGender = useMemo(
    () => personaGenderOf(picker.scenario.title, picker.scenario.description),
    [picker.scenario.title, picker.scenario.description],
  );
  const allowedVoices = useMemo(() => voicesForPersona(personaGender), [personaGender]);

  const languages = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? LANGUAGES.filter((l) => l.name.toLowerCase().includes(t) || l.code.includes(t)) : LANGUAGES;
  }, [q]);

  const voices = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? allowedVoices.filter((v) => v.label.toLowerCase().includes(t) || v.description.toLowerCase().includes(t))
      : allowedVoices;
  }, [q, allowedVoices]);

  const males = voices.filter((v) => v.gender === 'male');
  const females = voices.filter((v) => v.gender === 'female');

  function playSample(voiceId: string) {
    audioRef.current?.pause();
    if (playing === voiceId) { setPlaying(null); return; }
    const a = new Audio(voiceSampleUrl(voiceId));
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(voiceId)).catch(() => setPlaying(null));
  }

  function goTo(step: number) {
    audioRef.current?.pause();
    setPlaying(null);
    setQ('');
    setPicker((p) => p && ({ ...p, step }));
  }

  function chooseLanguage(code: string) {
    const list = accentsForLanguage(code);
    setQ('');
    setPicker((p) => p && ({
      ...p, lang: code,
      accent: list.length === 1 ? list[0].code : '',
      step: list.length > 1 ? 2 : 3, // a single variant needs no asking
    }));
  }

  function chooseAccent(code: string) {
    setQ('');
    setPicker((p) => p && ({ ...p, accent: code, step: 3 }));
  }

  function chooseVoice(id: string) {
    audioRef.current?.pause();
    setPlaying(null);
    setPicker((p) => p && ({ ...p, voice: id, step: 4 }));
  }

  function start() {
    setStarting(true);
    audioRef.current?.pause();
    const p = new URLSearchParams({ lang: picker.lang, voice: picker.voice, grade: picker.grade ? '1' : '0' });
    if (picker.accent) p.set('accent', picker.accent);
    router.push(`/session/${picker.scenario.id}?${p.toString()}`);
  }

  // Everything chosen so far, always visible, always a way back.
  const trail = [
    picker.lang ? { label: languageName(picker.lang), step: 1 } : null,
    picker.accent && accents.length > 1 ? { label: accentLabel(picker.accent), step: 2 } : null,
    picker.step >= 4 && picker.voice ? { label: picker.voice, step: 3 } : null,
  ].filter(Boolean) as { label: string; step: number }[];

  const searchable = picker.step === 1 || picker.step === 3;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-foreground/40 sm:p-6" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden bg-card shadow-xl animate-pop-in sm:h-auto sm:max-h-[92vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Set up your call"
      >
        {/* Header + the trail of what is already chosen */}
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight">Set up your call</h3>
              <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{picker.scenario.title}</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="press shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          {trail.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {trail.map((t, i) => (
                <span key={t.step} className="flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                  <button
                    onClick={() => goTo(t.step)}
                    title="Change this"
                    className="press rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                  >
                    {t.label}
                  </button>
                </span>
              ))}
            </div>
          )}

          {searchable && (
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={picker.step === 1 ? `Search ${LANGUAGES.length} languages…` : 'Search voices…'}
                aria-label={picker.step === 1 ? 'Search languages' : 'Search voices'}
                className="w-full rounded-full border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {picker.step === 1 && (
            <>
              <StepHeading n={1} title="Choose a language" hint="The whole call runs in this language." />
              {languages.length === 0
                ? <p className="text-sm text-muted-foreground">No language matches “{q}”.</p>
                : <Grid>{languages.map((l) => (
                    <OptionCard key={l.code} title={l.name} meta={l.code}
                      selected={picker.lang === l.code} onClick={() => chooseLanguage(l.code)} />
                  ))}</Grid>}
            </>
          )}

          {picker.step === 2 && (
            <>
              <StepHeading n={2} title={`Which ${languageName(picker.lang)} accent?`} hint="How the customer should sound." />
              <Grid>{accents.map((a) => (
                <OptionCard key={a.code} title={a.label} meta={a.code}
                  selected={picker.accent === a.code} onClick={() => chooseAccent(a.code)} />
              ))}</Grid>
            </>
          )}

          {picker.step === 3 && (
            <>
              <StepHeading
                n={3}
                title="Pick the customer's voice"
                hint={
                  personaGender
                    ? `This scenario is written with a ${personaGender} character, so only ${personaGender} voices are offered.`
                    : 'This scenario does not state a gender, so every voice is available.'
                }
              />
              {voices.length === 0 && <p className="text-sm text-muted-foreground">No voice matches “{q}”.</p>}

              {females.length > 0 && (
                <section className="mb-6">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Female <span className="font-normal normal-case">({females.length})</span>
                  </p>
                  <Grid>{females.map((v) => (
                    <VoiceCard key={v.id} v={v} selected={picker.voice === v.id} playing={playing === v.id}
                      onPick={chooseVoice} onPlay={playSample} />
                  ))}</Grid>
                </section>
              )}
              {males.length > 0 && (
                <section>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Male <span className="font-normal normal-case">({males.length})</span>
                  </p>
                  <Grid>{males.map((v) => (
                    <VoiceCard key={v.id} v={v} selected={picker.voice === v.id} playing={playing === v.id}
                      onPick={chooseVoice} onPlay={playSample} />
                  ))}</Grid>
                </section>
              )}
            </>
          )}

          {picker.step === 4 && (
            <div className="mx-auto max-w-lg space-y-4">
              <StepHeading n={4} title="Ready when you are" />
              <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-3">
                <div>
                  <p className="text-sm font-medium">Grade my body language</p>
                  <p className="text-xs text-muted-foreground">Uses your camera to score posture &amp; presence. Off = voice only.</p>
                </div>
                <button type="button" role="switch" aria-checked={picker.grade}
                  onClick={() => setPicker((p) => (p ? { ...p, grade: !p.grade } : p))}
                  className={`inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${picker.grade ? 'bg-primary' : 'bg-muted'}`}>
                  <span className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform ${picker.grade ? 'translate-x-5 bg-primary-foreground' : 'translate-x-0 bg-foreground'}`} />
                </button>
              </div>

              <button onClick={start} disabled={starting}
                className="press flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                <Mic className="h-4 w-4" /> {starting ? 'Starting…' : `Start in ${languageName(picker.lang)}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
