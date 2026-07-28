'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Briefcase, Users, Headphones, UserCog, Rocket, GraduationCap, Search, Sparkles,
  Target, AlertTriangle, Clock, MapPin, Flame, ArrowRight, Loader2,
} from 'lucide-react';
import {
  INTAKE_ROLES, INTAKE_INDUSTRIES, INTAKE_EXPERIENCE, INTAKE_OUTCOMES, INTAKE_STRUGGLES,
  INTAKE_INTENSITY, INDIAN_STATES, MINUTES_PER_DAY, DAYS_PER_WEEK, INTAKE_LIMITS,
} from '@avatar-platform/shared';
import { StepShell } from '@/components/onboarding/step-shell';
import { ChoiceChip } from '@/components/onboarding/choice-chip';
import { cn } from '@/lib/utils';

const ROLE_ICON: Record<string, React.ReactNode> = {
  sales: <Briefcase className="h-5 w-5" />,
  account: <Users className="h-5 w-5" />,
  support: <Headphones className="h-5 w-5" />,
  manager: <UserCog className="h-5 w-5" />,
  founder: <Rocket className="h-5 w-5" />,
  job_seeker: <Search className="h-5 w-5" />,
  student: <GraduationCap className="h-5 w-5" />,
  other: <Sparkles className="h-5 w-5" />,
};

const INTENSITY_ICON: Record<string, React.ReactNode> = {
  gentle: <Sparkles className="h-5 w-5" />,
  balanced: <Target className="h-5 w-5" />,
  hard: <Flame className="h-5 w-5" />,
};

export interface IntakeAnswers {
  role: string;
  industry: string;
  experience: string;
  outcomes: string[];
  struggles: string[];
  struggleNote: string;
  minutesPerDay: number;
  daysPerWeek: number;
  org: string;
  city: string;
  state: string;
  intensity: string;
}

const EMPTY: IntakeAnswers = {
  role: '', industry: '', experience: '', outcomes: [], struggles: [], struggleNote: '',
  minutesPerDay: 15, daysPerWeek: 5, org: '', city: '', state: '', intensity: '',
};

const TOTAL = 7;

function Primary({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="press flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

/** A row of equal-weight options. Used for numbers, where cards would be heavy. */
function Segmented<T extends string | number>({ options, value, onChange, format }: {
  options: readonly T[]; value: T; onChange: (v: T) => void; format?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={cn(
            'press min-w-[3.25rem] rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-[border-color,background-color,color] duration-200',
            o === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
          )}
        >
          {format ? format(o) : String(o)}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/20';

/**
 * The My Journey intake: one question per screen, keyboard-driven, cards and
 * segmented controls instead of text inputs wherever the answer is a choice.
 */
export function Intake({ firstName, onSubmit, submitting, error }: {
  firstName: string;
  onSubmit: (a: IntakeAnswers) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState<IntakeAnswers>(EMPTY);
  const set = <K extends keyof IntakeAnswers>(k: K, v: IntakeAnswers[K]) => setA((p) => ({ ...p, [k]: v }));

  function toggle(key: 'outcomes' | 'struggles', id: string, max: number) {
    setA((p) => {
      const has = p[key].includes(id);
      if (has) return { ...p, [key]: p[key].filter((x) => x !== id) };
      if (p[key].length >= max) return p;
      return { ...p, [key]: [...p[key], id] };
    });
  }

  const canAdvance = [
    !!a.role,
    !!a.industry && !!a.experience,
    a.outcomes.length > 0,
    true,                       // struggles are optional
    true,                       // time always has a default
    true,                       // location is optional
    !!a.intensity,
  ][step];

  const next = () => (step === TOTAL - 1 ? onSubmit(a) : setStep((s) => s + 1));

  // Enter advances, so the whole flow is keyboard-driven. Ignore it inside the
  // free-text note, where Enter should insert a newline.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.tagName === 'TEXTAREA') return;
      if (canAdvance && !submitting) { e.preventDefault(); next(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const footer = (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
      <Primary disabled={!canAdvance || submitting} onClick={next}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" />
          : step === TOTAL - 1 ? <>Build my plan<ArrowRight className="h-4 w-4" /></>
          : <>Continue<ArrowRight className="h-4 w-4" /></>}
      </Primary>
    </div>
  );

  const shell = (title: React.ReactNode, subtitle: string, children: React.ReactNode) => (
    <StepShell
      step={step}
      total={TOTAL}
      title={title}
      subtitle={subtitle}
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      footer={footer}
    >
      {children}
    </StepShell>
  );

  if (step === 0) {
    return shell(
      <>Welcome{firstName ? `, ${firstName}` : ''}. What do you do?</>,
      'Your plan is built around the conversations you actually have.',
      INTAKE_ROLES.map((r, i) => (
        <ChoiceChip key={r.id} index={i} label={r.label} blurb={r.blurb} icon={ROLE_ICON[r.id]}
          selected={a.role === r.id} onClick={() => { set('role', r.id); }} />
      )),
    );
  }

  if (step === 1) {
    return shell(
      'Which field, and how long?',
      'This decides the kind of people you will practise with.',
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-2">
          {INTAKE_INDUSTRIES.map((o) => (
            <button key={o.id} type="button" onClick={() => set('industry', o.id)} aria-pressed={a.industry === o.id}
              className={cn(
                'press rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-[border-color,background-color] duration-200',
                a.industry === o.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}>
              {o.label}
            </button>
          ))}
        </div>
        <Field label="How long have you been doing it?">
          <Segmented options={INTAKE_EXPERIENCE.map((e) => e.id)} value={a.experience}
            onChange={(v) => set('experience', v)} format={(v) => INTAKE_EXPERIENCE.find((e) => e.id === v)?.label ?? v} />
        </Field>
      </div>,
    );
  }

  if (step === 2) {
    return shell(
      'What do you want to walk away able to do?',
      `Pick up to ${INTAKE_LIMITS.outcomes}.`,
      INTAKE_OUTCOMES.map((o, i) => (
        <ChoiceChip key={o.id} index={i} label={o.label} blurb={o.blurb} icon={<Target className="h-5 w-5" />}
          selected={a.outcomes.includes(o.id)} onClick={() => toggle('outcomes', o.id, INTAKE_LIMITS.outcomes)} />
      )),
    );
  }

  if (step === 3) {
    return shell(
      'Where does it usually go wrong?',
      'Be honest. This is the part your plan attacks first.',
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {INTAKE_STRUGGLES.map((s) => (
            <button key={s.id} type="button" onClick={() => toggle('struggles', s.id, INTAKE_LIMITS.struggles)}
              aria-pressed={a.struggles.includes(s.id)}
              className={cn(
                'press rounded-full border px-3.5 py-2 text-sm transition-[border-color,background-color,color] duration-200',
                a.struggles.includes(s.id) ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}>
              {s.label}
            </button>
          ))}
        </div>
        <Field label="Anything else? (optional)">
          <textarea
            value={a.struggleNote}
            onChange={(e) => set('struggleNote', e.target.value.slice(0, INTAKE_LIMITS.note))}
            rows={3}
            placeholder="The moment I dread is..."
            className={cn(inputClass, 'resize-none')}
          />
          <span className="block text-right text-xs text-muted-foreground">{a.struggleNote.length}/{INTAKE_LIMITS.note}</span>
        </Field>
      </div>,
    );
  }

  if (step === 4) {
    return shell(
      'How much time can you give it?',
      'Your days are sized to fit this, not the other way round.',
      <div className="space-y-6">
        <Field label="Minutes a day">
          <Segmented options={MINUTES_PER_DAY} value={a.minutesPerDay} onChange={(v) => set('minutesPerDay', v)} format={(v) => `${v}m`} />
        </Field>
        <Field label="Days a week">
          <Segmented options={DAYS_PER_WEEK} value={a.daysPerWeek} onChange={(v) => set('daysPerWeek', v)} />
        </Field>
        <p className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 shrink-0" />
          About {a.minutesPerDay * a.daysPerWeek} minutes of practice a week.
        </p>
      </div>,
    );
  }

  if (step === 5) {
    return shell(
      'Where are you practising from?',
      'Only used to show you where you stand against others. Skip any of it.',
      <div className="space-y-4">
        <Field label="Company, school or college">
          <input value={a.org} onChange={(e) => set('org', e.target.value.slice(0, INTAKE_LIMITS.org))}
            placeholder="Optional" className={inputClass} />
        </Field>
        <Field label="City">
          <input value={a.city} onChange={(e) => set('city', e.target.value.slice(0, INTAKE_LIMITS.city))}
            placeholder="Optional" className={inputClass} />
        </Field>
        <Field label="State">
          <select value={a.state} onChange={(e) => set('state', e.target.value)} className={inputClass}>
            <option value="">Prefer not to say</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0" /> Others only ever see your name and your score.
        </p>
      </div>,
    );
  }

  return shell(
    'How hard should your customers be?',
    'You can change this later by rebuilding your plan.',
    <div className="space-y-2.5">
      {INTAKE_INTENSITY.map((o, i) => (
        <ChoiceChip key={o.id} index={i} label={o.label} blurb={o.blurb} icon={INTENSITY_ICON[o.id]}
          selected={a.intensity === o.id} onClick={() => set('intensity', o.id)} />
      ))}
      {a.struggles.length === 0 && a.struggleNote.length === 0 && (
        <p className="flex items-start gap-2 pt-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          You skipped what goes wrong. Your plan will still work, it just will not target a weak spot.
        </p>
      )}
    </div>,
  );
}
