'use client';

import { ArrowLeft } from 'lucide-react';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

/**
 * Full-screen shell for one onboarding question. One question per screen, a calm
 * Bixy presence up top, progress dots, and a single clear forward action.
 */
export function StepShell({
  step,
  total,
  title,
  subtitle,
  onBack,
  onSkip,
  children,
  footer,
}: {
  step: number; // 0-based
  total: number;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  onSkip?: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 py-6">
      {/* Top row: back + progress dots + skip */}
      <div className="flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="press -ml-1.5 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-8 w-8" />
        )}
        <div className="flex items-center gap-1.5" role="progressbar" aria-valuenow={step + 1} aria-valuemax={total}>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-primary' : i < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-border'}`}
            />
          ))}
        </div>
        {onSkip ? (
          <button onClick={onSkip} className="press rounded-full px-2 py-1 text-sm text-muted-foreground hover:text-foreground">
            Skip
          </button>
        ) : (
          <span className="h-8 w-8" />
        )}
      </div>

      {/* Bixy */}
      <div className="relative mt-8 flex justify-center">
        <div aria-hidden className="bixy-halo absolute inset-0 mx-auto h-24 w-24" />
        <AssistantOrb state="speaking" size={92} />
      </div>

      {/* Question */}
      <div className="mt-6 text-center">
        <h1 className="text-pretty text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-[15px] text-muted-foreground">{subtitle}</p>}
      </div>

      {/* Choices */}
      <div className="mt-7 flex-1 space-y-2.5 pb-24">{children}</div>

      {/* Forward action */}
      <div className="sticky bottom-0 -mx-5 mt-6 bg-gradient-to-t from-background via-background to-transparent px-5 pb-2 pt-4">
        {footer}
      </div>
    </div>
  );
}
