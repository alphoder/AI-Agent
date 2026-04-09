'use client';

import { useEffect, useState } from 'react';

interface WelcomePayload {
  role: 'admin' | 'learner';
  ts: number;
}

const HOLD_MS = 650;
const SLIDE_MS = 1200;

/**
 * Full-screen dark welcome cover that picks up where the login page left off.
 *
 * The login page writes a payload to sessionStorage right before navigating.
 * This component reads it on mount, paints an identical dark welcome panel
 * over the new route, holds briefly, then slides off to the right — revealing
 * the destination page underneath like a curtain.
 *
 * The destination page therefore gets to load while the curtain is up, so
 * the user never sees a loading state.
 */
export function WelcomeCurtain() {
  const [payload, setPayload] = useState<WelcomePayload | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem('welcome_curtain');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as WelcomePayload;
      if (Date.now() - parsed.ts > 5000) {
        sessionStorage.removeItem('welcome_curtain');
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [sliding, setSliding] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!payload) return;
    sessionStorage.removeItem('welcome_curtain');

    // Force a paint, then start the slide.
    const t1 = setTimeout(() => setSliding(true), HOLD_MS);
    // Unmount once the slide animation finishes.
    const t2 = setTimeout(() => setDone(true), HOLD_MS + SLIDE_MS + 50);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [payload]);

  if (!payload || done) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-[hsl(var(--foreground))] ease-[cubic-bezier(0.65,0,0.35,1)]"
      style={{
        transform: sliding ? 'translateX(100%)' : 'translateX(0)',
        transitionProperty: 'transform',
        transitionDuration: `${SLIDE_MS}ms`,
      }}
      aria-hidden="true"
    >
      {/* Background flourish to match login page */}
      <div className="absolute inset-0 opacity-[0.04]">
        <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="curtain-grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="white"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#curtain-grid)" />
        </svg>
      </div>
      <div className="absolute -left-20 -top-20 h-[400px] w-[400px] rounded-full bg-[hsl(var(--primary))] opacity-20 blur-[120px]" />
      <div className="absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full bg-[hsl(var(--primary))] opacity-10 blur-[120px]" />

      <div className="relative z-10 text-center">
        <p className="mb-3 text-xs font-medium uppercase tracking-[0.2em] text-white/40">
          Signed in
        </p>
        <h1 className="whitespace-nowrap text-6xl font-bold leading-[1.1] tracking-tight text-white sm:text-7xl">
          Welcome,{' '}
          <span className="text-white/50">
            {payload.role === 'admin' ? 'admin' : 'learner'}
          </span>
          <span className="text-white">.</span>
        </h1>
      </div>
    </div>
  );
}
