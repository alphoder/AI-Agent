'use client';

import { useEffect, useState } from 'react';
import { AssistantOrb } from '@/components/assistant/assistant-orb';

/**
 * Cold-start guard. Render's free tier spins the API down after ~15 min idle, so
 * the first request after a quiet spell hangs ~30-60s and the app gets stuck on a
 * loading/idle screen. This probes the API the moment the app shell mounts:
 *   - warm  → renders nothing, app proceeds normally.
 *   - cold  → shows a "starting up" overlay, polls until the server answers, then
 *             does ONE full reload so every initial data fetch re-runs warm.
 * A sessionStorage stamp prevents reload loops if the server is still waking.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api').replace(/\/api\/?$/, '');
const HEALTH = `${API_BASE}/health/live`;
const RELOAD_KEY = 'sc_wake_reload_at';

function probe(timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(HEALTH, { signal: ctrl.signal, cache: 'no-store' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => clearTimeout(to));
}

export function WakeGuard() {
  const [cold, setCold] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Fast first probe — if the API answers quickly it is already warm.
      if (await probe(2500)) return;
      if (cancelled) return;

      setCold(true);
      // Poll until the server is up, then reload once (guarded against loops).
      while (!cancelled) {
        if (await probe(8000)) {
          if (cancelled) return;
          let last = 0;
          try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* ignore */ }
          if (Date.now() - last > 120000) {
            try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* ignore */ }
            window.location.reload();
          } else {
            setCold(false); // reloaded recently — just reveal the app
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 2500));
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (!cold) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-5 px-6 text-center">
        <AssistantOrb state="loading" size={96} />
        <div>
          <p className="text-lg font-medium text-foreground">Starting things up</p>
          <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
            The first visit after a quiet spell can take up to a minute. Hang tight, this page will refresh on its own.
          </p>
        </div>
      </div>
    </div>
  );
}
