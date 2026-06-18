'use client';

import Link from 'next/link';
import { LucideIcon } from 'lucide-react';
import { DomainAccent } from './page-header';

interface RichEmptyStateProps {
  icon: LucideIcon;
  accent?: DomainAccent;
  title: string;
  description?: string;
  action?: { label: string; href?: string; onClick?: () => void };
  compact?: boolean;
}

/**
 * Friendly empty state used in list views, sidebars, modals, etc.
 * A bit more life than a bare icon + text: animated glowing ring behind the icon.
 */
export function RichEmptyState({
  icon: Icon,
  accent = 'dashboard',
  title,
  description,
  action,
  compact = false,
}: RichEmptyStateProps) {
  return (
    <div className={`text-center ${compact ? 'py-8 px-4' : 'py-14 px-6'}`}>
      <div className="relative inline-flex items-center justify-center">
        {/* animated halo */}
        <div className={`absolute inset-0 rounded-full ${`bg-grad-${accent}`} opacity-20 blur-xl`} />
        <div className={`relative ${compact ? 'w-14 h-14' : 'w-20 h-20'} rounded-2xl ${`bg-grad-${accent}`} flex items-center justify-center shadow-lg shadow-blue-500/10`}>
          <Icon className={`${compact ? 'w-6 h-6' : 'w-9 h-9'} text-white`} strokeWidth={2} />
        </div>
      </div>

      <h3 className={`${compact ? 'text-sm' : 'text-base'} font-semibold mt-4 text-foreground`}>{title}</h3>
      {description && (
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-muted-foreground mt-1.5 max-w-sm mx-auto`}>
          {description}
        </p>
      )}

      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              {action.label}
            </Link>
          ) : (
            <button
              onClick={action.onClick}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
