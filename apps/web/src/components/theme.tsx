'use client';

/**
 * Light / dark / system, on the <html> element.
 *
 * ponytail: no next-themes. Both palettes already exist as tokens in globals.css
 * (`:root` is light, `.dark` is dark), so the whole job is toggling one class and
 * remembering the choice. THEME_SCRIPT in the root layout does the same thing
 * before first paint, otherwise a dark-mode user gets a white flash on every load.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Theme = 'light' | 'dark' | 'system';

const KEY = 'speakcoach-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Runs blocking in <head>. Keep it in sync with apply() below, and keep it small:
 * it is inlined into every page. Wrapped in try/catch because localStorage throws
 * outright in a cookie-blocked iframe.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}')||'system';var d=t==='dark'||(t==='system'&&matchMedia('${DARK_QUERY}').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia(DARK_QUERY).matches);
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  // Native scrollbars, form controls and the caret follow color-scheme, not our tokens.
  el.style.colorScheme = dark ? 'dark' : 'light';
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'system',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Always 'system' on the server: reading localStorage during render would
  // hydrate-mismatch. THEME_SCRIPT has already painted the right one by now.
  const [theme, setThemeState] = useState<Theme>('system');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'system') setThemeState(saved);
    } catch { /* storage blocked; stay on system */ }
  }, []);

  // Follow the OS while on 'system'.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    apply(next);
    try { localStorage.setItem(KEY, next); } catch { /* storage blocked */ }
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

/** Three-way switch. `labelled` shows the words; the sidebar uses icons only. */
export function ThemeToggle({ labelled = false, className }: { labelled?: boolean; className?: string }) {
  const { theme, setTheme } = useTheme();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <div role="radiogroup" aria-label="Colour theme" className={cn('flex items-center gap-0.5 rounded-full border border-border bg-card p-0.5', className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        // Before mount the stored choice is unknown, so nothing is marked active
        // rather than briefly marking the wrong one.
        const active = ready && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'press flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium transition-colors',
              labelled && 'flex-1 px-3',
              active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {labelled && label}
          </button>
        );
      })}
    </div>
  );
}
