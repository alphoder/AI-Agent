'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A large, tappable choice card for the onboarding questionnaire.
 * Calm by default; a blue ring + check marks the selection. Phone-first targets.
 */
export function ChoiceChip({
  label,
  blurb,
  icon,
  selected,
  onClick,
  index = 0,
}: {
  label: string;
  blurb?: string;
  icon?: React.ReactNode;
  selected: boolean;
  onClick: () => void;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{ animationDelay: `${index * 45}ms` }}
      className={cn(
        'press animate-chip-in group relative flex w-full items-center gap-3.5 rounded-2xl border bg-card p-4 text-left',
        'transition-[border-color,box-shadow,background-color] duration-200',
        selected
          ? 'border-primary ring-2 ring-primary/30 shadow-sm'
          : 'border-border hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      {icon && (
        <span
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors',
            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
          )}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-tight">{label}</span>
        {blurb && <span className="mt-0.5 block text-sm text-muted-foreground">{blurb}</span>}
      </span>
      <span
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all',
          selected ? 'border-primary bg-primary text-primary-foreground scale-100' : 'border-border scale-90',
        )}
      >
        {selected && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}
