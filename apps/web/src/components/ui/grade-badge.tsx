import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { GRADE_LABEL, type Grade } from '@avatar-platform/shared';

/**
 * Completed / Attempted / Failed in green / yellow / red, in one place so the three
 * colours cannot drift between Completed and Scenarios.
 *
 * ponytail: the icon carries the meaning too, because colour alone is not a label
 * for anyone who cannot separate red from green.
 */
const STYLE: Record<Exclude<Grade, 'none'>, { cls: string; Icon: typeof CheckCircle2 }> = {
  completed: { cls: 'bg-success/10 text-success border-success/25', Icon: CheckCircle2 },
  attempted: { cls: 'bg-warning/10 text-warning border-warning/25', Icon: CircleDashed },
  failed: { cls: 'bg-destructive/10 text-destructive border-destructive/25', Icon: XCircle },
};

export function GradeBadge({ grade, score, className = '' }: { grade: Grade; score?: number | null; className?: string }) {
  if (grade === 'none') return null;
  const { cls, Icon } = STYLE[grade];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls} ${className}`}>
      <Icon className="h-3 w-3" />
      {GRADE_LABEL[grade]}
      {score != null && <span className="tabular-nums opacity-80">· {Math.round(score)}</span>}
    </span>
  );
}
