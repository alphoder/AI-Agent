'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface SectionCardProps {
  icon?: LucideIcon;
  iconTint?: string;      // tailwind class like 'text-blue-600'
  title: string;
  subtitle?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  children: React.ReactNode;
  className?: string;
}

/**
 * Canonical content card used on every page:
 *  - Light header with optional icon + title + subtitle
 *  - Right-aligned action link/button
 *  - Body area with divide-y children convention
 */
export function SectionCard({
  icon: Icon,
  iconTint = 'text-muted-foreground',
  title,
  subtitle,
  action,
  children,
  className = '',
}: SectionCardProps) {
  return (
    <div className={`rounded-2xl border border-border/50 bg-card overflow-hidden animate-fade-in ${className}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && <Icon className={`w-4 h-4 ${iconTint} shrink-0`} strokeWidth={2.2} />}
          <div className="min-w-0">
            <h2 className="font-semibold text-sm tracking-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
          </div>
        </div>
        {action && (
          action.href ? (
            <Link href={action.href} className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
              {action.label}
            </button>
          )
        )}
      </div>
      {children}
    </div>
  );
}
