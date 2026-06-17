'use client';

import Link from 'next/link';
import { ChevronRight, LucideIcon } from 'lucide-react';

export type DomainAccent =
  | 'dashboard' | 'learners' | 'avatars' | 'personas'
  | 'scenarios' | 'assign' | 'analytics' | 'settings';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  icon?: LucideIcon;
  accent?: DomainAccent;
  title: string;
  subtitle?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

/**
 * Consistent top-of-page header across every admin and learner page.
 *   - Gradient icon tile in the domain's signature colour
 *   - Title + optional subtitle
 *   - Optional breadcrumb trail
 *   - Slot for right-aligned actions (buttons, filters, etc.)
 */
export function PageHeader({
  icon: Icon,
  accent = 'dashboard',
  title,
  subtitle,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  const gradClass = `bg-grad-${accent}`;

  return (
    <header className="flex flex-col gap-3 pb-6 border-b border-border/40 mb-6 animate-fade-in">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <div key={i} className="flex items-center gap-1.5">
              {b.href ? (
                <Link href={b.href} className="hover:text-foreground transition-colors">{b.label}</Link>
              ) : (
                <span className="text-foreground/70">{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground/40" />}
            </div>
          ))}
        </nav>
      )}

      <div className="flex items-start gap-4">
        {Icon && (
          <div
            className={`w-12 h-12 rounded-2xl ${gradClass} flex items-center justify-center shadow-lg shadow-indigo-500/10 shrink-0`}
          >
            <Icon className="w-6 h-6 text-white" strokeWidth={2.2} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
