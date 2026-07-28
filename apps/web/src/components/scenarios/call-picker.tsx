'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Mic, Volume2, Square } from 'lucide-react';
import { languageName, GEMINI_VOICES, voiceSampleUrl, accentsForLanguage } from '@avatar-platform/shared';
import { LanguagePicker } from '@/components/language-picker';
import type { Scenario } from './scenario-card';

export interface PickerState {
  scenario: Scenario; step: number; lang: string; accent: string; locality: string; voice: string; grade: boolean;
}

export function newPicker(scenario: Scenario): PickerState {
  return { scenario, step: 1, lang: '', accent: '', locality: '', voice: scenario.voice || 'Charon', grade: false };
}

/**
 * The progressive call setup: language → accent → locality → voice → start.
 * Extracted so the library, the track list and the module page all launch calls
 * the same way.
 */
export function CallPicker({ picker, setPicker, onClose }: {
  picker: PickerState;
  setPicker: (fn: (p: PickerState | null) => PickerState | null) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const accents = picker.lang ? accentsForLanguage(picker.lang) : [];

  function playSample(voiceId: string) {
    audioRef.current?.pause();
    if (playing === voiceId) { setPlaying(null); return; }
    const a = new Audio(voiceSampleUrl(voiceId));
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    a.play().then(() => setPlaying(voiceId)).catch(() => setPlaying(null));
  }

  function chooseLanguage(code: string) {
    const list = accentsForLanguage(code);
    setPicker((p) => p && ({
      ...p, lang: code,
      accent: list.length === 1 ? list[0].code : '',
      step: list.length > 1 ? 2 : 3,
    }));
  }

  function start() {
    setStarting(true);
    const p = new URLSearchParams({ lang: picker.lang, voice: picker.voice, grade: picker.grade ? '1' : '0' });
    if (picker.accent) p.set('accent', picker.accent);
    if (picker.locality.trim()) p.set('locality', picker.locality.trim());
    router.push(`/session/${picker.scenario.id}?${p.toString()}`);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-card shadow-xl animate-pop-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h3 className="font-semibold">Set up your call</h3>
            <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{picker.scenario.title}</p>
          </div>
          <button onClick={onClose} className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Language</p>
            {picker.lang ? (
              <button onClick={() => setPicker((p) => p && ({ ...p, lang: '', accent: '', step: 1 }))}
                className="mt-1.5 flex w-full items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3.5 py-2.5 text-sm">
                <span className="font-medium">{languageName(picker.lang)}</span>
                <span className="text-xs text-muted-foreground">Change</span>
              </button>
            ) : (
              <LanguagePicker value={picker.lang} onChange={chooseLanguage} className="mt-1.5" />
            )}
          </div>

          {picker.step >= 2 && accents.length > 1 && (
            <div className="animate-pop-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Accent</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {accents.map((a) => (
                  <button key={a.code} onClick={() => setPicker((p) => p && ({ ...p, accent: a.code, step: Math.max(p.step, 3) }))}
                    className={`press rounded-full border px-3.5 py-1.5 text-sm transition-colors ${picker.accent === a.code ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted'}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {picker.step >= 3 && (
            <div className="animate-pop-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Where&apos;s the customer from? <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
              </p>
              <input
                value={picker.locality}
                onChange={(e) => setPicker((p) => p && ({ ...p, locality: e.target.value }))}
                placeholder="e.g. Chennai, rural Punjab, South Mumbai"
                className="mt-1.5 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
              {picker.step < 4 && (
                <button onClick={() => setPicker((p) => p && ({ ...p, step: 4 }))}
                  className="press mt-2 rounded-full bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-muted">
                  Continue
                </button>
              )}
            </div>
          )}

          {picker.step >= 4 && (
            <div className="animate-pop-in">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer voice</p>
              <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
                {GEMINI_VOICES.map((v) => (
                  <div key={v.id} className={`flex items-center gap-2 rounded-md px-2.5 py-2 ${picker.voice === v.id ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                    <button onClick={() => setPicker((p) => p && ({ ...p, voice: v.id, step: Math.max(p.step, 5) }))} className="flex-1 text-left">
                      <span className={`text-sm ${picker.voice === v.id ? 'font-semibold text-primary' : 'font-medium'}`}>{v.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{v.description}</span>
                    </button>
                    <button type="button" onClick={() => playSample(v.id)} title={`Hear ${v.label}`}
                      className="press shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                      {playing === v.id ? <Square className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {picker.step >= 5 && (
            <div className="animate-pop-in space-y-4">
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
