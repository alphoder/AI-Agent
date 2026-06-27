import { cn } from '@/lib/utils';

/**
 * Accent — colours the important word(s) in blue, our single accent.
 * Solid colour only (gradient text is banned). Use inline inside headings/copy:
 *   <h1>Practice speaking. <Accent>Out loud.</Accent></h1>
 */
export function Accent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('text-primary', className)}>{children}</span>;
}
