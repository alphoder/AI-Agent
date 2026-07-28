'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GraduationCap, Briefcase, Building2, Rocket, Languages,
  Megaphone, MessageCircle, Users, TrendingUp, Mic, Loader2, ArrowRight,
} from 'lucide-react';
import { PERSONAS, GOALS, tagsForGoals } from '@avatar-platform/shared';
import apiClient from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { StepShell } from '@/components/onboarding/step-shell';
import { ChoiceChip } from '@/components/onboarding/choice-chip';
import { Accent } from '@/components/ui/accent';

const PERSONA_ICON: Record<string, React.ReactNode> = {
  student: <GraduationCap className="h-5 w-5" />,
  job_seeker: <Briefcase className="h-5 w-5" />,
  professional: <Building2 className="h-5 w-5" />,
  founder: <Rocket className="h-5 w-5" />,
  non_native: <Languages className="h-5 w-5" />,
};

const GOAL_ICON: Record<string, React.ReactNode> = {
  public_speaking: <Megaphone className="h-5 w-5" />,
  social_confidence: <MessageCircle className="h-5 w-5" />,
  interviews: <Briefcase className="h-5 w-5" />,
  difficult_conversations: <Users className="h-5 w-5" />,
  sales_persuasion: <TrendingUp className="h-5 w-5" />,
  leadership: <Users className="h-5 w-5" />,
  english_fluency: <Languages className="h-5 w-5" />,
  academic: <GraduationCap className="h-5 w-5" />,
};

interface Rec { id: string; title: string; description: string | null; language: string; difficulty_level: string }

const PrimaryButton = ({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="press flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {children}
  </button>
);

export default function WelcomePage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const firstName = (user?.name || '').split(' ')[0];

  const [step, setStep] = useState(0);
  const [persona, setPersona] = useState<string | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [recs, setRecs] = useState<Rec[] | null>(null);

  function toggleGoal(id: string) {
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  }

  async function persist() {
    try {
      const { data } = await apiClient.patch('/auth/me/onboarding', { persona, goals });
      if (data?.data) setUser(data.data); // refresh store so the redirect guard won't fire again
    } catch {
      /* non-blocking — they can still use the app */
    }
  }

  async function loadRecs() {
    const tags = tagsForGoals(goals);
    const query = tags.length ? `tags=${encodeURIComponent(tags.join(','))}&limit=3` : 'difficulty=beginner&limit=3';
    try {
      const { data } = await apiClient.get(`/scenarios?${query}`);
      setRecs((data.data || []).slice(0, 3));
    } catch {
      setRecs([]);
    }
  }

  async function finishToLineup() {
    setSaving(true);
    await persist();
    await loadRecs();
    setSaving(false);
    setStep(2);
  }

  async function skip() {
    await persist();
    router.push('/journey');
  }

  // Already onboarded? Don't strand them here.
  useEffect(() => {
    const done = (user?.metadata as { onboarding?: { completed?: boolean } } | null)?.onboarding?.completed;
    if (done && step === 0) router.replace('/journey');
  }, [user, step, router]);

  // Step 0 — persona
  if (step === 0) {
    return (
      <StepShell
        step={0}
        total={3}
        onSkip={skip}
        title={<>Welcome{firstName ? <>, <Accent>{firstName}</Accent></> : ''}.</>}
        subtitle="Which sounds most like you? This tailors your practice."
        footer={<PrimaryButton disabled={!persona} onClick={() => setStep(1)}>Continue<ArrowRight className="h-4 w-4" /></PrimaryButton>}
      >
        {PERSONAS.map((p, i) => (
          <ChoiceChip key={p.id} index={i} label={p.label} blurb={p.blurb} icon={PERSONA_ICON[p.id]} selected={persona === p.id} onClick={() => setPersona(p.id)} />
        ))}
      </StepShell>
    );
  }

  // Step 1 — goals
  if (step === 1) {
    return (
      <StepShell
        step={1}
        total={3}
        onBack={() => setStep(0)}
        onSkip={skip}
        title={<>What do you want to get <Accent>better</Accent> at?</>}
        subtitle="Pick one or more. We'll line up matching scenarios."
        footer={
          <PrimaryButton disabled={goals.length === 0 || saving} onClick={finishToLineup}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>See my lineup<ArrowRight className="h-4 w-4" /></>}
          </PrimaryButton>
        }
      >
        {GOALS.map((g, i) => (
          <ChoiceChip key={g.id} index={i} label={g.label} blurb={g.blurb} icon={GOAL_ICON[g.id]} selected={goals.includes(g.id)} onClick={() => toggleGoal(g.id)} />
        ))}
      </StepShell>
    );
  }

  // Step 2 — recommended lineup
  return (
    <StepShell
      step={2}
      total={3}
      onBack={() => setStep(1)}
      title={<>Your starting <Accent>lineup</Accent>.</>}
      subtitle="Tap one to start talking, or head to your home."
      footer={
        <button onClick={() => router.push('/journey')} className="press flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted">
          Go to my home
        </button>
      }
    >
      {recs === null ? (
        <div className="flex justify-center py-10 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : recs.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No matches yet — browse the full library from your home.</p>
      ) : (
        recs.map((r, i) => (
          <button
            key={r.id}
            onClick={() => router.push(`/session/${r.id}?lang=${r.language || 'en'}`)}
            style={{ animationDelay: `${i * 45}ms` }}
            className="press animate-chip-in group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mic className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium leading-tight">{r.title}</span>
              {r.description && <span className="mt-0.5 line-clamp-1 block text-sm text-muted-foreground">{r.description}</span>}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </button>
        ))
      )}
    </StepShell>
  );
}
