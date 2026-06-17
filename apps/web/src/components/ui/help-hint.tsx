'use client';

import { useState } from 'react';
import { Info, X, Lightbulb, AlertTriangle } from 'lucide-react';

type HintVariant = 'info' | 'tip' | 'warning';

interface HelpHintProps {
  /** The hint message to display */
  children: React.ReactNode;
  /** Visual variant */
  variant?: HintVariant;
  /** If true, user can dismiss (hides permanently via localStorage) */
  dismissible?: boolean;
  /** Unique key for localStorage persistence (required if dismissible) */
  dismissKey?: string;
  /** Optional title displayed in bold before the message */
  title?: string;
  /** Additional CSS classes */
  className?: string;
}

const VARIANT_STYLES: Record<HintVariant, { bg: string; border: string; text: string; icon: string }> = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    icon: 'text-blue-500',
  },
  tip: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-800',
    icon: 'text-amber-500',
  },
  warning: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    icon: 'text-red-500',
  },
};

const VARIANT_ICONS: Record<HintVariant, typeof Info> = {
  info: Info,
  tip: Lightbulb,
  warning: AlertTriangle,
};

export function HelpHint({
  children,
  variant = 'info',
  dismissible = false,
  dismissKey,
  title,
  className = '',
}: HelpHintProps) {
  const storageKey = dismissKey ? `hint-dismissed:${dismissKey}` : null;

  const [dismissed, setDismissed] = useState(() => {
    if (!dismissible || !storageKey) return false;
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(storageKey) === '1';
  });

  if (dismissed) return null;

  const styles = VARIANT_STYLES[variant];
  const Icon = VARIANT_ICONS[variant];

  const handleDismiss = () => {
    setDismissed(true);
    if (storageKey) {
      localStorage.setItem(storageKey, '1');
    }
  };

  return (
    <div className={`rounded-lg border ${styles.bg} ${styles.border} px-4 py-3 ${className}`}>
      <div className="flex gap-3">
        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${styles.icon}`} />
        <div className={`flex-1 text-xs leading-relaxed ${styles.text}`}>
          {title && <span className="font-semibold">{title} </span>}
          {children}
        </div>
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className={`shrink-0 rounded p-0.5 transition-colors hover:bg-black/5 ${styles.text}`}
            aria-label="Dismiss hint"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
